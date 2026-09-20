// Sauvegarde quotidienne de la base, déposée dans Supabase Storage.
//
// Pourquoi ici et pas sur un Drive : brancher Google demanderait un compte de
// service, un consentement OAuth et un jeton à renouveler — trois choses qui
// cassent en silence et qu'on ne verrait pas avant d'en avoir besoin. Le
// stockage Supabase est déjà en place, déjà authentifié, et les archives
// restent téléchargeables depuis le tableau de bord admin. Rien n'empêche de
// recopier ensuite ces fichiers sur un Drive, à la main ou plus tard.
//
// CETTE ROUTE S'APPELAIT « sauvegarde-devis » ET NE SAUVAIT QUE SIX TABLES.
// Les quarante-deux autres — musiciens, disponibilités, tournées, feuilles de
// route, fiches techniques, infos sociales, partitions — n'étaient sauvegardées
// NULLE PART : le plan Supabase gratuit ne fait aucune sauvegarde automatique.
// Une fausse manœuvre d'administration, et la saison était perdue. Le bouton du
// tableau de bord, lui, annonçait « Sauvegarder » sans dire ce qu'il laissait
// dehors : le pire des deux mondes, une sécurité que personne ne vérifie parce
// que tout le monde la croit acquise.
//
// Ce qui part maintenant, chaque nuit :
//   base/AAAA-MM-JJ.json.gz     toutes les tables métier, comprimées ;
//   journal/AAAA-MM.json.gz     le journal d'audit, découpé par mois.
//
// Pourquoi le journal à part : `audit_log` pèse à lui seul la moitié de la base
// et grossit d'une dizaine de mégaoctets par mois. Le recopier dans CHAQUE
// archive quotidienne consommerait le gigaoctet du plan gratuit en quelques
// semaines — la sauvegarde aurait fini par tuer ce qu'elle protège. Découpé par
// mois, il s'écrit une fois puis ne bouge plus.
//
// Les tables sont DÉCOUVERTES au moment de la sauvegarde, pas listées ici : une
// liste écrite en dur est exactement ce qui a produit la situation précédente —
// elle ne suit pas les migrations, et personne ne s'aperçoit qu'une table
// nouvelle n'est pas sauvegardée avant d'en avoir besoin. La liste de repli
// plus bas ne sert que si le catalogue REST est injoignable.
//
// Deux appelants légitimes :
//   - le planificateur Vercel (vercel.json → crons), qui présente le jeton
//     CRON_SECRET dans l'en-tête Authorization ;
//   - un compte administrateur, depuis le bouton « Sauvegarder maintenant »
//     du tableau de bord, avec son propre jeton de session.
// Sans l'un des deux, on refuse : cette route lit TOUTE la base.
//
// Variables d'environnement requises sur Vercel :
//   SUPABASE_SERVICE_ROLE_KEY  (lecture des tables malgré RLS + écriture Storage)
//   CRON_SECRET                (fourni par Vercel, à définir dans le projet)
// Facultatives :
//   SAUVEGARDES_A_CONSERVER    (défaut 30 archives quotidiennes)
//   AUDIT_RETENTION_JOURS      (défaut 365 ; 0 désactive la purge du journal)

import { gzipSync } from 'node:zlib';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nffqcvysweidquouulzs.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_-QZnJEZi01-5fjkjv_2SPw_wODqHcJQ';

const BUCKET = 'sauvegardes';
const PREFIXE_BASE = 'base';
const PREFIXE_JOURNAL = 'journal';
const TABLE_JOURNAL = 'audit_log';

// Des vues : elles se recalculent à partir des tables, les archiver reviendrait
// à sauvegarder deux fois la même donnée — et à la restaurer en double.
const VUES = ['dates_actives', 'dates_projet'];

// Une lecture paginée a besoin d'un ordre STABLE : sans `order`, deux pages
// successives peuvent se recouvrir ou s'ignorer, et l'archive est silencieusement
// trouée. On trie sur la clé primaire ; elle vaut `id` partout sauf ici.
const ORDRE = {
  acces_personnels: 'token',
  disponibilites: 'personne_type,personne_id,jour',
  infos_sociales_admins: 'email',
  preferences_utilisateur: 'user_id,page',
};

// Si le catalogue REST ne répond pas, on sauvegarde au moins ce qu'on connaissait
// au moment d'écrire ces lignes. Cette liste n'est PAS la référence : elle est le
// filet, et le manifeste de l'archive dit quand c'est elle qui a servi.
const TABLES_REPLI = [
  'acces_logistique', 'acces_personnels', 'affectations_transport', 'bug_reports',
  'cachet_overrides', 'carnet_contacts', 'carnets_ata', 'chauffeurs', 'comm_taches',
  'depenses', 'devis', 'devis_clients', 'devis_postes', 'devis_reglages',
  'dispo_demandes', 'disponibilites', 'echanges', 'feuilles_route',
  'fiches_techniques', 'fiches_techniques_versions', 'infos_sociales',
  'infos_sociales_admins', 'invitations', 'lots_materiel', 'messages_envoyes',
  'moyens_salle', 'musiciens', 'newsletter_snapshot', 'partitions_acces',
  'partitions_affectations', 'partitions_envois', 'partitions_fichiers',
  'partitions_parties', 'partitions_programmations', 'partitions_spectacles',
  'partitions_telechargements', 'preferences_utilisateur', 'prestataires',
  'reglages', 'relances', 'remarques', 'remplacant_prefs', 'saisons', 'salles',
  'suivis_budget', 'techniciens', 'tournees', 'vehicules',
];

const PAGE = 1000;              // PostgREST plafonne ses réponses : on lit par tranches
const PLAFOND_LIGNES = 500000;  // garde-fou : au-delà, c'est une boucle, pas une table
const ARCHIVES_A_CONSERVER = Math.max(2, Number(process.env.SAUVEGARDES_A_CONSERVER) || 30);
const JOURNAUX_A_CONSERVER = 24;
const JOURNAL_RETENTION_JOURS = process.env.AUDIT_RETENTION_JOURS === undefined
  ? 365
  : Number(process.env.AUDIT_RETENTION_JOURS);
// On archive le journal sur quatorze mois glissants, alors qu'on n'en purge que
// douze : les deux mois d'écart garantissent qu'une ligne supprimée de la base
// est déjà dans un fichier, quelle que soit l'heure à laquelle la nuit tombe.
const MOIS_ARCHIVES = 14;

export const config = { maxDuration: 60 };

function entetes(cleService, extra) {
  return { apikey: cleService, Authorization: `Bearer ${cleService}`, ...(extra || {}) };
}

// L'appelant doit être un compte 'admin' de la liste de confiance.
async function estAdmin(jeton) {
  const rep = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${jeton}`
    },
    body: '{}'
  });
  if (!rep.ok) return false;
  return (await rep.json()) === true;
}

// Comparaison à durée constante : sur un secret, une comparaison qui s'arrête
// au premier caractère différent laisse fuiter sa longueur et son préfixe.
function memeSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* Le catalogue que PostgREST publie sur la racine de l'API : il énumère ce qui
   est réellement exposé aujourd'hui, migrations comprises. C'est la seule source
   qui ne puisse pas prendre du retard sur la base. */
async function decouvrirTables(cleService) {
  const rep = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: entetes(cleService, { Accept: 'application/openapi+json' }),
  });
  if (!rep.ok) throw new Error(`catalogue ${rep.status}`);
  const spec = await rep.json();
  const schemas = (spec && (spec.definitions || (spec.components && spec.components.schemas))) || {};
  const tables = Object.keys(schemas)
    .filter((n) => /^[a-z0-9_]+$/.test(n))
    .filter((n) => n !== TABLE_JOURNAL && !VUES.includes(n))
    .sort();
  // Un catalogue tronqué (réponse partielle, schéma changé) donnerait une archive
  // amputée qui a l'air normale. Mieux vaut le repli, qui se voit.
  if (tables.length < 20) throw new Error(`catalogue inattendu (${tables.length} tables)`);
  return tables;
}

/* Lecture complète d'une table, page par page. Le `filtre` sert au journal, qu'on
   relit mois par mois plutôt qu'en entier.

   Deux précautions valent d'être expliquées, parce qu'elles séparent une archive
   complète d'une archive trouée qui en a l'air :
   — on demande le COMPTE exact à la première page, et on ne s'arrête que quand on
     tient ce nombre de lignes. S'arrêter « à la première page incomplète » suppose
     que le serveur rende toujours la tranche demandée ; PostgREST peut rendre moins
     (plafond de service), et la table serait coupée sans que rien ne le signale ;
   — on avance du nombre de lignes REÇUES, pas de la taille demandée, pour la même
     raison : sauter par-dessus un plafond plus bas que le nôtre perdrait une ligne
     sur deux. */
async function lireTable(table, cleService, filtre = '') {
  let tri = `&order=${(ORDRE[table] || 'id').split(',').map((c) => `${c}.asc`).join(',')}`;
  const lignes = [];
  let total = null;
  let debut = 0;
  for (;;) {
    const rep = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*${tri}${filtre}`, {
      headers: entetes(cleService, {
        Accept: 'application/json',
        'Range-Unit': 'items',
        Range: `${debut}-${debut + PAGE - 1}`,
        ...(total === null ? { Prefer: 'count=exact' } : {}),
      }),
    });
    if (!rep.ok) {
      // Un tri refusé : la table n'a pas la colonne attendue (table nouvelle, clé
      // composite). On relit sans ordre — une fois — et le manifeste le signale,
      // parce qu'une lecture non ordonnée n'est pas une garantie, c'est un pari.
      if (rep.status === 400 && tri) { tri = ''; continue; }
      throw new Error(`${table} : ${rep.status} ${(await rep.text()).slice(0, 160)}`);
    }
    const page = await rep.json();
    if (!Array.isArray(page)) throw new Error(`${table} : réponse inattendue`);
    if (total === null) {
      const annonce = Number((rep.headers.get('content-range') || '').split('/')[1]);
      total = Number.isFinite(annonce) ? annonce : null;
    }
    for (const ligne of page) lignes.push(ligne);
    if (!page.length) break;                                  // le serveur n'a plus rien
    if (total !== null ? lignes.length >= total : page.length < PAGE) break;
    debut += page.length;
    if (debut > PLAFOND_LIGNES) throw new Error(`${table} : au-delà de ${PLAFOND_LIGNES} lignes`);
  }
  if (total !== null && lignes.length !== total) {
    throw new Error(`${table} : ${lignes.length} lignes lues pour ${total} annoncées`);
  }
  return { lignes, ordonnee: !!tri };
}

async function deposer(chemin, corps, type, cleService) {
  const rep = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${chemin}`, {
    method: 'POST',
    headers: entetes(cleService, { 'Content-Type': type, 'x-upsert': 'true' }),
    body: corps,
  });
  if (!rep.ok) throw new Error(`dépôt de ${chemin} (${rep.status}) : ${(await rep.text()).slice(0, 200)}`);
}

async function lister(prefixe, cleService) {
  const rep = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: entetes(cleService, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefix: `${prefixe}/`, limit: 200, sortBy: { column: 'name', order: 'desc' } }),
  });
  if (!rep.ok) throw new Error(`listing de ${prefixe} (${rep.status})`);
  const objets = await rep.json();
  // Supabase dépose un marqueur caché dans un dossier vidé : il n'est pas une archive.
  return (Array.isArray(objets) ? objets : []).filter((o) => o && o.name && !o.name.startsWith('.'));
}

/* Sans ménage, la sauvegarde remplit le gigaoctet du plan gratuit toute seule et
   fait tomber le reste du site avec elle. Les noms portent la date : l'ordre
   alphabétique décroissant est l'ordre chronologique inverse. */
async function menage(prefixe, aConserver, cleService) {
  const objets = await lister(prefixe, cleService);
  const trop = objets.slice(aConserver).map((o) => `${prefixe}/${o.name}`);
  if (!trop.length) return 0;
  const rep = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: entetes(cleService, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes: trop }),
  });
  if (!rep.ok) throw new Error(`ménage de ${prefixe} (${rep.status})`);
  return trop.length;
}

function bornesMois(mois) {
  const [an, m] = mois.split('-').map(Number);
  return [
    new Date(Date.UTC(an, m - 1, 1)).toISOString(),
    new Date(Date.UTC(an, m, 1)).toISOString(),
  ];
}

/* Le journal, mois par mois. Les bornes sont en UTC : chaque ligne tombe dans un
   fichier et un seul, ce qui est tout ce qu'on demande à un découpage.

   Un mois CLOS ne bouge plus : son fichier s'écrit une fois, puis on n'y revient
   jamais. Le mois EN COURS, lui, va dans un fichier à part, réécrit — et c'est là
   qu'est le piège qu'on évite : le journal pèse quarante mégaoctets en JSON quand
   toutes les données métier en pèsent moins d'un. Le relire chaque nuit pour le
   redéposer coûterait, en fin de mois, plusieurs centaines de mégaoctets de bande
   passante mensuelle — sur les cinq gigaoctets du plan gratuit, pour archiver une
   deuxième fois ce qui l'est déjà. Une fois par semaine suffit : ce fichier est un
   confort, la garantie étant que la purge ne touche JAMAIS un mois non clos. */
const JOURNAL_EN_COURS = 'en-cours.json.gz';

async function archiverJournal(cleService) {
  const dejaLa = new Set((await lister(PREFIXE_JOURNAL, cleService)).map((o) => o.name));
  const aujourdhui = new Date();
  const ecrits = [];

  const ecrireMois = async (mois, nomFichier) => {
    const [debut, fin] = bornesMois(mois);
    const { lignes } = await lireTable(TABLE_JOURNAL, cleService,
      `&changed_at=gte.${debut}&changed_at=lt.${fin}`);
    if (!lignes.length) return;
    const corps = gzipSync(Buffer.from(JSON.stringify({
      genereLe: new Date().toISOString(), table: TABLE_JOURNAL, mois,
      clos: nomFichier !== JOURNAL_EN_COURS, lignes: lignes.length, donnees: lignes,
    })));
    await deposer(`${PREFIXE_JOURNAL}/${nomFichier}`, corps, 'application/gzip', cleService);
    ecrits.push({ mois, lignes: lignes.length, octets: corps.length });
  };

  // Les mois clos qui n'ont pas encore leur fichier — dont celui qui vient de se
  // fermer, le premier du mois suivant.
  for (let i = 1; i < MOIS_ARCHIVES; i++) {
    const d = new Date(Date.UTC(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth() - i, 1));
    const mois = d.toISOString().slice(0, 7);
    if (dejaLa.has(`${mois}.json.gz`)) continue;
    await ecrireMois(mois, `${mois}.json.gz`);
  }

  // Le mois en cours : au premier passage, le dimanche, et le jour où un mois
  // vient de se clore — sans quoi ce fichier annoncerait « en cours » en portant
  // les lignes du mois d'avant, jusqu'au dimanche suivant.
  if (!dejaLa.has(JOURNAL_EN_COURS) || ecrits.length || aujourdhui.getUTCDay() === 0) {
    await ecrireMois(aujourdhui.toISOString().slice(0, 7), JOURNAL_EN_COURS);
  }
  return ecrits;
}

/* La purge du journal. Elle ne part qu'APRÈS un archivage sans faute : on ne
   supprime jamais une ligne qui n'est pas déjà dans un fichier.
   `purge_audit_log()` existe en base mais exige un compte admin (auth.jwt), ce
   que la clé de service n'est pas ; on supprime donc par filtre, et le filtre est
   vérifié avant d'être envoyé — une requête DELETE qui perdrait sa condition
   viderait la table entière. */
async function purgerJournal(cleService) {
  if (!Number.isFinite(JOURNAL_RETENTION_JOURS) || JOURNAL_RETENTION_JOURS <= 0) return null;
  const limite = new Date(Date.now() - JOURNAL_RETENTION_JOURS * 86400000).toISOString();
  const condition = `changed_at=lt.${encodeURIComponent(limite)}`;
  if (!/^changed_at=lt\.\d{4}-\d{2}-\d{2}T/.test(condition)) throw new Error('borne de purge invalide');
  const rep = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_JOURNAL}?${condition}`, {
    method: 'DELETE',
    headers: entetes(cleService, { Prefer: 'count=exact', Accept: 'application/json' }),
  });
  if (!rep.ok) throw new Error(`purge (${rep.status}) : ${(await rep.text()).slice(0, 160)}`);
  const plage = rep.headers.get('content-range') || '';   // « */12 »
  return { avant: limite, supprimees: Number(plage.split('/')[1]) || 0 };
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ erreur: 'Méthode non autorisée.' });
    return;
  }

  const cleService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cleService) {
    res.status(501).json({ erreur: "SUPABASE_SERVICE_ROLE_KEY n'est pas configurée sur Vercel." });
    return;
  }

  // --- Qui appelle ? ---------------------------------------------------------
  const entete = req.headers.authorization || '';
  const jeton = entete.startsWith('Bearer ') ? entete.slice(7) : '';
  const secretCron = process.env.CRON_SECRET || '';
  const parLePlanificateur = !!secretCron && memeSecret(jeton, secretCron);

  let autorise = parLePlanificateur;
  if (!autorise && jeton) {
    try { autorise = await estAdmin(jeton); }
    catch { autorise = false; }
  }
  if (!autorise) {
    res.status(401).json({ erreur: 'Accès refusé.' });
    return;
  }

  const avertissements = [];

  // --- Quelles tables ? ------------------------------------------------------
  let tables;
  let catalogue = 'api';
  try {
    tables = await decouvrirTables(cleService);
  } catch (e) {
    tables = TABLES_REPLI;
    catalogue = 'repli';
    avertissements.push(`Catalogue des tables indisponible (${e.message}) — liste de repli utilisée.`);
  }

  // --- Relecture -------------------------------------------------------------
  // Une table qui refuse de se lire ne doit pas emporter les quarante-sept
  // autres : on note, on continue, et on le dit haut et fort à la fin.
  const donnees = {};
  const lignes = {};
  const echecs = [];
  for (const table of tables) {
    try {
      const lu = await lireTable(table, cleService);
      donnees[table] = lu.lignes;
      lignes[table] = lu.lignes.length;
      if (!lu.ordonnee) avertissements.push(`${table} : lue sans ordre stable (pagination non garantie).`);
    } catch (e) {
      echecs.push(`${table} : ${e.message}`);
    }
  }

  // --- Dépôt de l'archive du jour --------------------------------------------
  // Un fichier par jour : une deuxième sauvegarde le même jour écrase la
  // première (upsert), ce qui évite d'accumuler des dizaines de copies
  // identiques quand on clique plusieurs fois sur le bouton manuel.
  const jour = new Date().toISOString().slice(0, 10);
  const chemin = `${PREFIXE_BASE}/${jour}.json.gz`;
  let octets = 0;
  try {
    const corps = gzipSync(Buffer.from(JSON.stringify({
      genereLe: new Date().toISOString(),
      source: parLePlanificateur ? 'cron' : 'manuel',
      version: 2,
      catalogue,
      tables: tables.length,
      lignes,
      exclus: { [TABLE_JOURNAL]: `archivé à part sous ${PREFIXE_JOURNAL}/` },
      echecs,
      donnees,
    })));
    octets = corps.length;
    await deposer(chemin, corps, 'application/gzip', cleService);
  } catch (e) {
    res.status(502).json({ erreur: 'Dépôt impossible : ' + e.message, echecs });
    return;
  }

  // --- Journal d'audit : archivage puis purge --------------------------------
  let journal = [];
  let purge = null;
  try {
    journal = await archiverJournal(cleService);
    purge = await purgerJournal(cleService);
  } catch (e) {
    avertissements.push(`Journal d'audit : ${e.message} — purge non lancée.`);
  }

  // --- Ménage ----------------------------------------------------------------
  let retires = 0;
  try {
    retires += await menage(PREFIXE_BASE, ARCHIVES_A_CONSERVER, cleService);
    retires += await menage(PREFIXE_JOURNAL, JOURNAUX_A_CONSERVER, cleService);
  } catch (e) {
    avertissements.push(`Ménage des archives : ${e.message}`);
  }

  /* Le balayage des exemplaires filigranés temporaires. api/partition.js le tente
     déjà après chaque téléchargement lourd, mais après avoir répondu : sur une
     fonction serverless, ce qui suit la réponse n'est pas garanti de s'exécuter,
     et le balayage ne part de toute façon QUE si quelqu'un télécharge. Sans un
     passage certain, un fichier de quatre mégaoctets peut rester des mois. Le
     voici, une fois par nuit, indépendant du trafic. */
  let exemplairesRetires = 0;
  try {
    const { balayerTelechargements } = await import('./partition.js');
    exemplairesRetires = await balayerTelechargements(cleService, 5);
  } catch (e) {
    avertissements.push(`Balayage des exemplaires temporaires : ${e.message}`);
  }

  const total = Object.values(lignes).reduce((s, n) => s + n, 0);
  res.status(echecs.length ? 502 : 200).json({
    ok: !echecs.length,
    chemin,
    octets,
    tables: Object.keys(lignes).length,
    total,
    lignes,
    journal,
    purge,
    archivesRetirees: retires,
    exemplairesRetires,
    echecs,
    avertissements,
  });
}
