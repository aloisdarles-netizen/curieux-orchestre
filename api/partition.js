// Téléchargement d'une partition par un musicien, filigranée à son nom.
//
// POURQUOI UNE FONCTION SERVEUR, ET PAS UN LIEN DIRECT VERS LE STOCKAGE
// ====================================================================
// Le bucket « partitions » est privé et le reste. Si le navigateur recevait une
// URL signée vers le fichier d'origine, il recevrait le fichier PROPRE : celui
// qu'on peut faire suivre sans qu'il désigne personne. Tout l'intérêt du
// dispositif tombe. On ne stocke donc qu'UN exemplaire propre par partie, et le
// filigrane est posé à la volée, ici, au moment où quelqu'un télécharge. Un
// exemplaire par musicien serait aussi une multiplication du stockage par
// l'effectif — cinquante fois le même fichier pour un orchestre.
//
// CE QUE LE FILIGRANE FAIT, ET CE QU'IL NE FAIT PAS
// =================================================
// Trois couches, d'efficacité décroissante :
//   1. VISIBLE — le nom en haut à droite, la mention en pied de page. Ça ne
//      protège de rien techniquement : ça rappelle à qui lit la partition
//      qu'elle lui est nominativement attribuée. C'est la couche qui agit sur
//      les gens, et c'est de loin la plus efficace.
//   2. INVISIBLE — un jeton unique par téléchargement, écrit quatre fois par
//      page en mode de rendu 3 et dans les métadonnées. Si une partition
//      ressort quelque part, on sait de quel téléchargement elle vient.
//      Survit à la copie du fichier et au chiffrement ; NE survit PAS à une
//      impression suivie d'un scan.
//   3. CHIFFREMENT — facultatif (voir `chiffrer` plus bas). Les permissions PDF
//      « interdire de copier, de modifier » sont DÉCLARATIVES : n'importe quel
//      outil sérieux les ignore. C'est un panneau, pas une serrure.
//
// LE MODE DE RENDU 3, ET PAS DU BLANC SUR BLANC
// =============================================
// La tentation est d'écrire le jeton en blanc pour le rendre invisible. C'est
// faux : le blanc est une COULEUR, il est peint, et il efface ce qu'il
// recouvre. Rendu à 500 dpi, un jeton blanc découpe un trou net dans la ligne
// de portée qu'il croise. Le mode de rendu de texte 3 (opérateur « Tr »,
// « invisible ») écrit le texte dans le fichier sans jamais le peindre : la
// portée reste pixel pour pixel identique à l'original, et le jeton reste
// extractible. C'est la seule méthode correcte.
//
// DEUX PROVENANCES, UN SEUL FILIGRANE
// ===================================
// Le paramètre `jeton` désigne une PERSONNE de l'annuaire (lien personnel) ;
// le paramètre `envoi` désigne un LOT CONFIÉ à un ensemble tiers — une
// coproduction, un orchestre étranger qui reprend le programme. Les deux
// passent par la même lecture de stockage, le même filigrane et le même
// journal : un exemplaire retrouvé se cherche à un seul endroit. Seule la
// MENTION change, parce qu'« exemplaire personnel de Tokyo Symphony » ne veut
// rien dire — voir `destinataire` dans filigraner().
//
// Variable d'environnement requise sur Vercel : SUPABASE_SERVICE_ROLE_KEY

import {
  PDFDocument, StandardFonts, rgb, TextRenderingMode,
  pushGraphicsState, popGraphicsState, beginText, endText,
  setFontAndSize, setTextRenderingMode, setTextMatrix, showText,
} from '@cantoo/pdf-lib';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nffqcvysweidquouulzs.supabase.co';

// Vercel plafonne le corps d'une réponse de fonction à 4,5 Mo. Au-delà, c'est
// un 413 et le musicien ne comprend pas pourquoi sa partition ne vient pas. On
// garde une marge, et au-dessus on passe par une URL signée — vers l'exemplaire
// FILIGRANÉ déposé à part, jamais vers l'original.
const PLAFOND_REPONSE = 4 * 1024 * 1024;

// Une partition gravée pèse ~16 Ko la page : 40 Mo, c'est déjà un scan couleur
// de plusieurs centaines de pages. Au-delà, c'est une erreur de dépôt.
const TAILLE_MAX_SOURCE = 40 * 1024 * 1024;

export const config = { maxDuration: 60 };

/* Les polices de base d'un PDF encodent le WinAnsi, qui couvre le français mais
   pas le reste. Un nom en cyrillique ou en grec ferait lever pdf-lib À L'APPEL
   de drawText — donc casserait le téléchargement entier, pour un filigrane.
   On translittère ce qu'on peut et on remplace le reste : un filigrane
   approximatif vaut mieux qu'une partition qui ne vient pas. */
export function versWinAnsi(texte) {
  return String(texte || '')
    .normalize('NFC')
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    // Tout ce qui sort du latin-1 imprimable, plus l'euro, l'œ et le point
    // médian que WinAnsi accepte : on le garde. Le reste devient un point.
    .replace(/[^\x20-\x7E\xA0-\xFF\u0152\u0153\u017D\u017E\u20AC\u2022\u00B7]/g, '.');
}

/* Un nom de fichier lisible dans le dossier Téléchargements, et surtout dans
   forScore : « Violon 1 » ne dit rien trois mois plus tard, « Violon 1 —
   EXPEDITION 33 » si. On donne les deux formes d'en-tête : l'ASCII pour les
   vieux clients, l'UTF-8 encodé pour les autres (RFC 5987). */
function enteteNomFichier(nom) {
  const propre = String(nom || 'partition').replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim() || 'partition';
  const ascii = propre.normalize('NFD').replace(/[\u0300-\u036F]/g, '').replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(propre)}`;
}

/* La totalité du contrôle d'accès tient dans cette fonction SQL, en « security
   definer ». C'est délibéré : la règle « cette personne a-t-elle le droit de ce
   fichier, sur cette opération, avec ce code » est une règle métier, elle
   appartient à la base et pas à six endroits du code. La fonction résout le
   jeton, vérifie l'affectation, vérifie le code, et ne renvoie le chemin de
   stockage que si tout est vrai. Un refus ne dit pas LEQUEL des contrôles a
   échoué — inutile d'indiquer à qui tâtonne s'il s'est trompé de code ou de
   lien. */
async function autorisation(cleService, jeton, fichierId, code) {
  const rep = await fetch(`${SUPABASE_URL}/rest/v1/rpc/partition_pour_jeton`, {
    method: 'POST',
    headers: {
      apikey: cleService,
      Authorization: `Bearer ${cleService}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_token: jeton, p_fichier_id: fichierId, p_code: code }),
  });
  if (!rep.ok) {
    console.error('[partition] autorisation', rep.status, await rep.text().catch(() => ''));
    return null;
  }
  const lignes = await rep.json().catch(() => null);
  return (Array.isArray(lignes) ? lignes[0] : lignes) || null;
}

/* Le pendant de la fonction ci-dessus pour un lot confié à un ensemble tiers.
   Mêmes principes, mêmes refus muets, et une colonne de plus : `destinataire`,
   qui n'est jamais vide ici et qui fait basculer la mention du filigrane.
   `pour` est le nom saisi par le bibliothécaire quand le lot est distribué
   nominativement ; la base refuse le téléchargement s'il manque alors qu'il
   est exigé — un navigateur ne protège rien. */
async function autorisationEnvoi(cleService, jetonEnvoi, fichierId, code, pour) {
  const rep = await fetch(`${SUPABASE_URL}/rest/v1/rpc/partition_pour_envoi`, {
    method: 'POST',
    headers: {
      apikey: cleService,
      Authorization: `Bearer ${cleService}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_jeton: jetonEnvoi, p_fichier_id: fichierId, p_code: code, p_pour: pour }),
  });
  if (!rep.ok) {
    console.error('[partition] autorisation envoi', rep.status, await rep.text().catch(() => ''));
    return null;
  }
  const lignes = await rep.json().catch(() => null);
  return (Array.isArray(lignes) ? lignes[0] : lignes) || null;
}

/* Le journal des téléchargements est ce qui donne un sens au jeton invisible :
   sans lui, on lit « CX-4A7F-2291 » sur une partition retrouvée et on ne sait
   pas à qui elle appartenait. Il échoue en silence — un journal qui empêche un
   musicien de recevoir sa partition avant une répétition serait un mauvais
   échange. */
async function journaliser(cleService, fonction, charge) {
  try {
    const rep = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fonction}`, {
      method: 'POST',
      headers: {
        apikey: cleService,
        Authorization: `Bearer ${cleService}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(charge),
    });
    if (!rep.ok) console.error('[partition] journal', rep.status, await rep.text().catch(() => ''));
  } catch (e) {
    console.error('[partition] journal', e && e.message);
  }
}

/* LES EXEMPLAIRES DÉPOSÉS N'ONT AUCUNE RAISON DE SURVIVRE À LEUR URL.
   Au-dessus du plafond de réponse, on dépose l'exemplaire filigrané dans le
   stockage et on redirige vers une URL signée valable cinq minutes. Sans
   balayage, chacun de ces fichiers reste là pour toujours : une transmission à
   un ensemble tiers en produit un PAR PARTIE LOURDE et par téléchargement —
   trente pour un lot repris deux fois —, et le plan Supabase est à 1 Go. Pire,
   la jauge de la page des partitions ne les compte pas : elle additionne le
   matériel rangé, si bien qu'elle annonce de la place qui n'existe plus.

   Le balayage se fait à deux endroits, et il faut les deux. ICI, sur le chemin
   qui SALIT : c'est immédiat, borné (une page de listing, cent suppressions au
   plus), et ça ne coûte rien puisqu'on y passe déjà. Mais ce passage-ci ne
   garantit rien — il s'exécute APRÈS la réponse, et une fonction serverless peut
   être gelée à la seconde où elle a répondu ; surtout, il ne part que si
   quelqu'un télécharge : le dernier exemplaire d'une saison n'a personne
   derrière lui pour le ramasser. La garantie est ailleurs, dans la sauvegarde de
   nuit (api/sauvegarde.js), qui appelle cette même fonction une fois par jour,
   quoi qu'il arrive.
   Ici comme là-bas, il échoue en silence — un ménage qui empêcherait une
   partition d'arriver la veille d'une première serait un mauvais échange. */
const AGE_TELECHARGEMENT_MS = 60 * 60 * 1000;   // une heure, pour une URL qui vit cinq minutes

export async function balayerTelechargements(cleService, pages = 1) {
  let retires = 0;
  try {
    // Les plus anciens d'abord : dès qu'une page n'a plus rien de périmé, les
    // suivantes sont plus récentes encore, il n'y a plus rien à y chercher.
    for (let i = 0; i < pages; i++) {
      const rep = await fetch(`${SUPABASE_URL}/storage/v1/object/list/partitions`, {
        method: 'POST',
        headers: {
          apikey: cleService,
          Authorization: `Bearer ${cleService}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prefix: '_telechargements/', limit: 100, sortBy: { column: 'created_at', order: 'asc' } }),
      });
      if (!rep.ok) throw new Error(`listing ${rep.status}`);
      const objets = await rep.json();
      if (!Array.isArray(objets) || !objets.length) break;
      const limite = Date.now() - AGE_TELECHARGEMENT_MS;
      const perimes = objets
        .filter((o) => o && o.name && Date.parse(o.created_at || o.updated_at || '') < limite)
        .map((o) => `_telechargements/${o.name}`);
      if (!perimes.length) break;
      const suppression = await fetch(`${SUPABASE_URL}/storage/v1/object/partitions`, {
        method: 'DELETE',
        headers: {
          apikey: cleService,
          Authorization: `Bearer ${cleService}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prefixes: perimes }),
      });
      if (!suppression.ok) throw new Error(`suppression ${suppression.status}`);
      retires += perimes.length;
      console.log(`[partition] balayage : ${perimes.length} exemplaire(s) temporaire(s) retiré(s)`);
      if (perimes.length < objets.length) break;   // la page contenait déjà du frais
    }
  } catch (e) {
    console.error('[partition] balayage', e && e.message);
  }
  return retires;
}

/* Le filigrane lui-même. Rien ici ne doit croiser une portée : le nom se pose
   dans la marge de tête, la mention dans la marge de pied, et les positions se
   calculent sur la taille RÉELLE de chaque page — une partition peut mélanger
   les formats, et une valeur en dur finirait un jour au milieu des notes. */
export async function filigraner(octets, { nom, operation, leJour, jeton, chiffrer, code, motDePasseProprietaire, destinataire }) {
  // updateMetadata:false, sinon la sauvegarde réécrit le producteur et efface
  // le jeton qu'on vient d'y poser.
  const pdf = await PDFDocument.load(octets, { updateMetadata: false });
  const police = await pdf.embedFont(StandardFonts.Helvetica);

  /* La mention de pied, et c'est la seule chose qui distingue les deux
     provenances. Un exemplaire PERSONNEL engage la personne qui l'a pris ; un
     exemplaire CONFIÉ engage la maison qui l'a reçu, et doit dire les deux
     quand le destinataire distribue nominativement — « Alexandra Ivanova » ne
     se rattache à rien sans le nom de son orchestre. */
  const haut = versWinAnsi(destinataire && nom !== destinataire ? `${nom} · ${destinataire}` : nom);
  const pied = versWinAnsi(destinataire
    ? `Exemplaire confié à ${destinataire}${nom !== destinataire ? ' — ' + nom : ''} · ${operation} · téléchargé le ${leJour} · usage réservé à cet ensemble, ne pas rediffuser`
    : `Exemplaire personnel de ${nom} · ${operation} · téléchargé le ${leJour} · ne pas diffuser`);
  const gris = rgb(0.45, 0.45, 0.45);
  const jetonWin = versWinAnsi(jeton);

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();

    // setFont une seule fois par page : passer `font` à chaque drawText
    // enregistre une nouvelle entrée de police dans les ressources de la page à
    // chaque appel — trois par page dans une première version, pour rien.
    page.setFont(police);
    const clePolice = page.fontKey;

    const largeurHaut = police.widthOfTextAtSize(haut, 7.5);
    page.drawText(haut, { x: Math.max(8, width - 20 - largeurHaut), y: height - 20, size: 7.5, color: gris });

    const largeurPied = police.widthOfTextAtSize(pied, 6);
    page.drawText(pied, { x: Math.max(8, (width - largeurPied) / 2), y: 12, size: 6, color: gris });

    // Quatre ancrages répartis : une partition recadrée ou rognée en perd
    // peut-être un ou deux, pas les quatre.
    const ancrages = [
      [24, height * 0.24], [width - 96, height * 0.46],
      [24, height * 0.68], [width - 96, height * 0.86],
    ];
    for (const [x, y] of ancrages) {
      page.pushOperators(
        pushGraphicsState(),
        beginText(),
        setFontAndSize(clePolice, 5),
        setTextRenderingMode(TextRenderingMode.Invisible),
        setTextMatrix(1, 0, 0, 1, x, y),
        showText(police.encodeText(jetonWin)),
        endText(),
        popGraphicsState(),
      );
    }
  }

  // Le jeton est aussi dans les métadonnées : c'est le premier endroit qu'on
  // regarde, et il survit à un recadrage qui emporterait les ancrages.
  pdf.setKeywords([jetonWin]);
  pdf.setProducer(`Curieux orchestre · ${jetonWin}`);
  pdf.setTitle(versWinAnsi(`${operation} — ${nom}`));

  /* Le chiffrement n'est pas le défaut. forScore sait ouvrir un PDF protégé
     (il demande le mot de passe une fois et le retient) ; pour MobileSheets et
     Newzik, ce n'est documenté ni dans un sens ni dans l'autre. Rendre le
     chiffrement obligatoire, c'est risquer qu'un musicien sur iPad ne puisse
     pas lire sa partie le jour de la première. Le drapeau vient de la base :
     on l'active par spectacle quand on a vérifié, sans toucher au code. */
  /* On ne chiffre QUE si l'on a un mot de passe propriétaire distinct de celui
     du destinataire. Sans lui, le code de l'opération servirait des deux côtés
     — et un mot de passe propriétaire que le musicien connaît laisse lever les
     permissions par n'importe quel lecteur : on aurait la gêne du chiffrement
     sans sa protection. Sans code non plus, encrypt() lève, et une partition
     qui ne vient pas la veille d'une première est bien pire qu'une partition
     non chiffrée. Dans les deux cas on sert le PDF en clair et on le dit dans
     le journal, plutôt que d'échouer ou de faire semblant. */
  if (chiffrer && code && motDePasseProprietaire) {
    pdf.encrypt({
      userPassword: String(code),
      ownerPassword: motDePasseProprietaire,
      algorithm: 'AES-256',
      permissions: {
        printing: 'highResolution',
        copying: false,
        modifying: false,
        annotating: false,
        fillingForms: false,
        documentAssembly: false,
        contentAccessibility: false,
      },
    });
  } else if (chiffrer) {
    console.warn('[partition] chiffrement demandé mais impossible —',
      !code ? "aucun code sur cette opération" : "PARTITIONS_MOT_DE_PASSE_PROPRIETAIRE n'est pas configurée sur Vercel");
  }

  /* useObjectStreams n'est PAS le défaut de cette bibliothèque, contrairement à
     pdf-lib dont elle dérive. Sans lui, le fichier ressort au poids d'origine ;
     avec, il perd près de 6 % — sur une saison de partitions, c'est du
     stockage gratuit. Mesuré sur une partition gravée de 102 pages. */
  return Buffer.from(await pdf.save({ useObjectStreams: true }));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ erreur: 'Méthode non autorisée.' });
    return;
  }
  const cleService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cleService) {
    res.status(501).json({ erreur: "SUPABASE_SERVICE_ROLE_KEY n'est pas configurée sur Vercel." });
    return;
  }

  // On lit l'URL soi-même, comme api/agenda.js et api/manifeste.js. `req.query`
  // est une commodité du runtime, et aucune autre fonction du projet n'en
  // dépend : si elle venait à manquer, chaque appel tomberait en « Lien
  // invalide » sans qu'aucun journal ne dise pourquoi.
  const params = new URL(req.url, `https://${req.headers.host || 'localhost'}`).searchParams;
  const jeton = (params.get('jeton') || params.get('token') || '').trim();
  const envoi = (params.get('envoi') || '').trim();
  const fichierId = (params.get('fichier') || '').trim();
  const code = (params.get('code') || '').trim();
  const pour = (params.get('pour') || '').trim();

  // Même charset que les autres points d'entrée à jeton du site. Ces valeurs
  // finissent dans une URL d'API et, pour le chemin, dans le stockage : un
  // « / » ou un « .. » qui passerait sortirait du préfixe.
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(envoi || jeton)) {
    res.status(400).json({ erreur: 'Lien invalide.' });
    return;
  }
  /* Le nom saisi par le bibliothécaire d'un ensemble tiers. Il finit sur le
     PDF et dans le journal : on accepte les lettres de n'importe quel
     alphabet, les espaces et la ponctuation des noms, et rien d'autre. Ce
     n'est pas une protection — la base ne le recoupe à rien — mais une
     garantie que ce qui se pose sur la partition reste un nom. */
  if (pour && !/^[\p{L}\p{M}\s'’.·,\-]{1,60}$/u.test(pour)) {
    res.status(400).json({ erreur: 'Nom invalide.' });
    return;
  }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(fichierId)) {
    res.status(400).json({ erreur: 'Partition invalide.' });
    return;
  }
  if (code && !/^[A-Za-z0-9-]{1,32}$/.test(code)) {
    res.status(400).json({ erreur: "Code invalide." });
    return;
  }

  let droit;
  try {
    droit = envoi
      ? await autorisationEnvoi(cleService, envoi, fichierId, code, pour)
      : await autorisation(cleService, jeton, fichierId, code);
  }
  catch (e) {
    console.error('[partition] autorisation', e && e.message);
    res.status(503).json({ erreur: "Impossible de vérifier l'accès pour le moment." });
    return;
  }
  if (!droit || !droit.chemin) {
    res.status(403).json({ erreur: "Cette partition n'est pas accessible avec ce lien et ce code." });
    return;
  }

  // Le chemin vient de la base, pas du client — mais il part dans une URL, et
  // une ligne fabriquée à la main un jour de migration ne doit pas pouvoir
  // faire sortir la lecture du bucket.
  if (!/^[A-Za-z0-9_\-./]{1,256}$/.test(droit.chemin) || droit.chemin.includes('..')) {
    console.error('[partition] chemin refusé', droit.chemin);
    res.status(500).json({ erreur: 'Partition introuvable.' });
    return;
  }

  let source;
  try {
    const rep = await fetch(`${SUPABASE_URL}/storage/v1/object/partitions/${droit.chemin}`, {
      headers: { apikey: cleService, Authorization: `Bearer ${cleService}` },
    });
    if (!rep.ok) {
      console.error('[partition] lecture', rep.status, droit.chemin);
      res.status(502).json({ erreur: "La partition n'a pas pu être lue." });
      return;
    }
    source = Buffer.from(await rep.arrayBuffer());
  } catch (e) {
    console.error('[partition] lecture', e && e.message);
    res.status(502).json({ erreur: "La partition n'a pas pu être lue." });
    return;
  }
  if (!source.length || source.length > TAILLE_MAX_SOURCE) {
    res.status(502).json({ erreur: 'Partition illisible ou trop lourde.' });
    return;
  }

  const leJour = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  let sortie;
  try {
    sortie = await filigraner(source, {
      nom: droit.personne || droit.destinataire || 'Musicien',
      operation: droit.operation || '',
      leJour,
      jeton: droit.jeton_filigrane,
      chiffrer: !!droit.chiffrer,
      code,
      motDePasseProprietaire: process.env.PARTITIONS_MOT_DE_PASSE_PROPRIETAIRE,
      destinataire: droit.destinataire || '',
    });
  } catch (e) {
    // Un PDF source déjà protégé par mot de passe arrive ici. On le refuse au
    // dépôt, mais un fichier plus ancien peut avoir échappé au contrôle.
    console.error('[partition] filigrane', e && e.message);
    res.status(422).json({ erreur: "Cette partition n'a pas pu être préparée. Signale-le à la production." });
    return;
  }

  await journaliser(cleService,
    envoi ? 'journaliser_telechargement_envoi' : 'journaliser_telechargement_partition',
    envoi
      ? { p_jeton: envoi, p_fichier_id: fichierId, p_jeton_filigrane: droit.jeton_filigrane, p_octets: sortie.length }
      : { p_token: jeton, p_fichier_id: fichierId, p_jeton_filigrane: droit.jeton_filigrane, p_octets: sortie.length });

  const nomFichier = [droit.partie, droit.operation, droit.personne].filter(Boolean).join(' - ') + '.pdf';

  /* Au-dessus du plafond de réponse de Vercel, on ne peut pas renvoyer les
     octets. On dépose alors l'exemplaire FILIGRANÉ dans le stockage et on
     redirige vers une URL signée courte. Ce qui part est nominatif et porte
     son jeton : même si ce lien fuit, il désigne toujours quelqu'un. L'original
     propre, lui, ne sort jamais. */
  if (sortie.length > PLAFOND_REPONSE) {
    /* Le jeton part dans un chemin de stockage, en ÉCRITURE. Il vient de notre
       propre fonction SQL, comme `chemin` quarante lignes plus haut — et pour
       la même raison qu'on valide celui-là, on valide celui-ci : une ligne
       fabriquée à la main un jour de migration ne doit pas pouvoir écrire
       ailleurs que sous ce préfixe. */
    if (!/^CX-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(String(droit.jeton_filigrane || ''))) {
      console.error('[partition] jeton de filigrane refusé', droit.jeton_filigrane);
      res.status(500).json({ erreur: "Cette partition n'a pas pu être préparée." });
      return;
    }
    const cheminTemporaire = `_telechargements/${droit.jeton_filigrane}.pdf`;
    try {
      const depot = await fetch(`${SUPABASE_URL}/storage/v1/object/partitions/${cheminTemporaire}`, {
        method: 'POST',
        headers: {
          apikey: cleService,
          Authorization: `Bearer ${cleService}`,
          'Content-Type': 'application/pdf',
          'x-upsert': 'true',
        },
        body: sortie,
      });
      if (!depot.ok) throw new Error(`dépôt ${depot.status}`);
      const signe = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/partitions/${cheminTemporaire}`, {
        method: 'POST',
        headers: {
          apikey: cleService,
          Authorization: `Bearer ${cleService}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: 300 }),
      });
      if (!signe.ok) throw new Error(`signature ${signe.status}`);
      const { signedURL, signedUrl } = await signe.json();
      const url = signedUrl || signedURL;
      if (!url) throw new Error('URL signée absente');
      res.setHeader('Cache-Control', 'private, no-store');
      // res.redirect() est une commodité du runtime que rien d'autre ici
      // n'emploie : on pose la redirection à la main, comme le ferait un
      // ServerResponse Node nu.
      res.statusCode = 302;
      res.setHeader('Location', `${SUPABASE_URL}/storage/v1${url.startsWith('/') ? url : '/' + url}`);
      res.end();
      // La réponse est partie : on profite du passage pour balayer. Voir
      // balayerTelechargements — jamais avant, jamais en bloquant.
      await balayerTelechargements(cleService);
      return;
    } catch (e) {
      console.error('[partition] repli URL signée', e && e.message);
      res.status(502).json({ erreur: 'Partition trop lourde pour être envoyée.' });
      return;
    }
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', String(sortie.length));
  res.setHeader('Content-Disposition', enteteNomFichier(nomFichier));
  // Nominatif et filigrané : jamais en cache partagé, jamais indexé.
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.status(200).send(sortie);
}
