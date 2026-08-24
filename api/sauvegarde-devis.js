// Sauvegarde quotidienne des devis, déposée dans Supabase Storage.
//
// Pourquoi ici et pas sur un Drive : brancher Google demanderait un compte de
// service, un consentement OAuth et un jeton à renouveler — trois choses qui
// cassent en silence et qu'on ne verrait pas avant d'en avoir besoin. Le
// stockage Supabase est déjà en place, déjà authentifié, et les archives
// restent téléchargeables depuis le tableau de bord admin. Rien n'empêche de
// recopier ensuite ces fichiers sur un Drive, à la main ou plus tard.
//
// Deux appelants légitimes :
//   - le planificateur Vercel (vercel.json → crons), qui présente le jeton
//     CRON_SECRET dans l'en-tête Authorization ;
//   - un compte administrateur, depuis le bouton « Sauvegarder maintenant »
//     du tableau de bord, avec son propre jeton de session.
// Sans l'un des deux, on refuse : cette route lit TOUTES les données de devis.
//
// Variables d'environnement requises sur Vercel :
//   SUPABASE_SERVICE_ROLE_KEY  (lecture des tables malgré RLS + écriture Storage)
//   CRON_SECRET                (fourni par Vercel, à définir dans le projet)

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nffqcvysweidquouulzs.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_-QZnJEZi01-5fjkjv_2SPw_wODqHcJQ';

const BUCKET = 'sauvegardes';
// Les tables de l'espace Devis, dans l'ordre où on les relit pour restaurer.
const TABLES = ['devis', 'devis_clients', 'devis_postes', 'devis_reglages'];

export const config = { maxDuration: 30 };

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

async function lireTable(table, cleService) {
  const rep = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
    headers: {
      apikey: cleService,
      Authorization: `Bearer ${cleService}`,
      Accept: 'application/json'
    }
  });
  if (!rep.ok) {
    throw new Error(`lecture de ${table} : ${rep.status} ${(await rep.text()).slice(0, 200)}`);
  }
  return rep.json();
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

  // --- Relecture des tables --------------------------------------------------
  const contenu = { genereLe: new Date().toISOString(), source: parLePlanificateur ? 'cron' : 'manuel' };
  try {
    for (const table of TABLES) contenu[table] = await lireTable(table, cleService);
  } catch (e) {
    res.status(502).json({ erreur: 'Lecture impossible : ' + e.message });
    return;
  }

  // --- Dépôt dans le bucket --------------------------------------------------
  // Un fichier par jour : une deuxième sauvegarde le même jour écrase la
  // première (upsert), ce qui évite d'accumuler des dizaines de copies
  // identiques quand on clique plusieurs fois sur le bouton manuel.
  const jour = new Date().toISOString().slice(0, 10);
  const chemin = `devis/${jour}.json`;
  const corps = JSON.stringify(contenu, null, 1);

  const depot = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${chemin}`,
    {
      method: 'POST',
      headers: {
        apikey: cleService,
        Authorization: `Bearer ${cleService}`,
        'Content-Type': 'application/json',
        'x-upsert': 'true'
      },
      body: corps
    }
  );
  if (!depot.ok) {
    const detail = (await depot.text()).slice(0, 300);
    res.status(502).json({ erreur: `Dépôt impossible (${depot.status}) : ${detail}` });
    return;
  }

  res.status(200).json({
    ok: true,
    chemin,
    octets: Buffer.byteLength(corps),
    lignes: Object.fromEntries(TABLES.map((t) => [t, (contenu[t] || []).length]))
  });
}
