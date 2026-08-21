// Dépôt du plan de salle par le stage manager, depuis son lien partagé.
//
// Il pouvait déjà positionner les semis sur le plan, mais pas déposer l'image :
// celle-ci ne se chargeait que depuis la fiche de date, côté production. Il
// fallait donc lui demander de nous l'envoyer, et la reposer nous-mêmes.
//
// Pourquoi passer par le serveur plutôt que par le navigateur, comme le fait la
// fiche de date ? Parce que le bucket « fiches-techniques » n'accepte en
// écriture que les comptes ayant l'accès direction technique. Le stage manager
// n'a pas de compte : il a un jeton. Ouvrir le bucket à la clé anonyme pour lui
// donnerait un dépôt de fichiers sans authentification à quiconque lit le code
// source de la page — la clé anonyme est publique par construction.
//
// Cet endpoint vérifie donc le jeton lui-même, avec la clé de service qui ne
// quitte jamais le serveur, puis dépose le fichier et rattache son chemin à la
// date. Un jeton qui n'est pas un stage manager actif de cette tournée est
// refusé avant que quoi que ce soit ne touche au stockage.
//
// Variable d'environnement requise sur Vercel : SUPABASE_SERVICE_ROLE_KEY

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nffqcvysweidquouulzs.supabase.co';

// Un plan de salle est une photo ou un export : au-delà, c'est une erreur de
// manipulation, pas un besoin.
const TAILLE_MAX = 8 * 1024 * 1024;
const TYPES_ACCEPTES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export const config = { api: { bodyParser: { sizeLimit: '12mb' } }, maxDuration: 20 };

function lireCorps(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let brut = '';
    req.on('data', (c) => { brut += c; });
    req.on('end', () => {
      try { resolve(brut ? JSON.parse(brut) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// Le jeton doit désigner un accès ACTIF, de type stage manager. On lit la table
// avec la clé de service : elle est fermée à la clé anonyme, et c'est très bien.
async function accesStageManager(cleService, jeton) {
  const url = `${SUPABASE_URL}/rest/v1/acces_logistique`
    + `?id=eq.${encodeURIComponent(jeton)}&actif=is.true&type=eq.stage_manager`
    + `&select=id,tournee_id`;
  const rep = await fetch(url, {
    headers: { apikey: cleService, Authorization: `Bearer ${cleService}` }
  });
  if (!rep.ok) return null;
  const lignes = await rep.json().catch(() => []);
  return lignes[0] || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ erreur: 'Méthode non autorisée.' });
    return;
  }
  const cleService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cleService) {
    res.status(501).json({ erreur: "SUPABASE_SERVICE_ROLE_KEY n'est pas configurée sur Vercel." });
    return;
  }

  let corps;
  try { corps = await lireCorps(req); }
  catch { res.status(400).json({ erreur: 'Corps de requête illisible.' }); return; }

  const jeton = String(corps.jeton || '').trim();
  const dateId = String(corps.dateId || '').trim();
  const typeMime = String(corps.typeMime || '').toLowerCase();
  const base64 = String(corps.fichier || '');

  if (!/^[A-Za-z0-9_-]{1,128}$/.test(jeton)) {
    res.status(400).json({ erreur: 'Jeton invalide.' });
    return;
  }
  // Le dateId part dans le chemin de stockage puis dans l'URL de l'API Storage.
  // Sans ce contrôle, un « / » ou un « .. » sortirait du préfixe plans/ et
  // laisserait écrire ailleurs dans le bucket (la clé de service écrit partout).
  // Même charset que le jeton : tous les identifiants de date réels le
  // respectent (préfixe alphanumérique + tiret).
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(dateId)) {
    res.status(400).json({ erreur: 'Date invalide.' });
    return;
  }
  if (!TYPES_ACCEPTES[typeMime]) {
    res.status(400).json({ erreur: 'Format accepté : JPEG, PNG ou WebP.' });
    return;
  }

  let binaire;
  try { binaire = Buffer.from(base64, 'base64'); }
  catch { res.status(400).json({ erreur: 'Fichier illisible.' }); return; }
  if (binaire.length === 0) { res.status(400).json({ erreur: 'Fichier vide.' }); return; }
  if (binaire.length > TAILLE_MAX) {
    res.status(413).json({ erreur: `Fichier trop lourd (${(binaire.length / 1024 / 1024).toFixed(1)} Mo) — 8 Mo maximum.` });
    return;
  }

  let acces;
  try { acces = await accesStageManager(cleService, jeton); }
  catch { res.status(503).json({ erreur: "Impossible de vérifier le lien pour le moment." }); return; }
  if (!acces) {
    res.status(403).json({ erreur: "Ce lien ne permet pas de déposer un plan." });
    return;
  }

  // Chemin append-only, comme les dépôts côté production : on n'écrase jamais
  // un plan précédent, on en publie un nouveau.
  const suffixe = TYPES_ACCEPTES[typeMime];
  const chemin = `plans/${acces.tournee_id}-${dateId}-${Date.now()}.${suffixe}`;

  const depot = await fetch(`${SUPABASE_URL}/storage/v1/object/fiches-techniques/${chemin}`, {
    method: 'POST',
    headers: {
      apikey: cleService,
      Authorization: `Bearer ${cleService}`,
      'Content-Type': typeMime,
      'x-upsert': 'false'
    },
    body: binaire
  });
  if (!depot.ok) {
    const detail = await depot.text().catch(() => '');
    console.error('[deposer-plan-salle] dépôt', depot.status, detail);
    res.status(502).json({ erreur: `Le dépôt a échoué (${depot.status}).` });
    return;
  }

  // Le rattachement passe par la fonction à jeton : elle revérifie le lien, et
  // c'est elle qui porte la règle « seul un stage manager écrit un plan ».
  const rattachement = await fetch(`${SUPABASE_URL}/rest/v1/rpc/enregistrer_plan_salle_par_jeton`, {
    method: 'POST',
    headers: {
      apikey: cleService,
      Authorization: `Bearer ${cleService}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ p_token: jeton, p_date_id: dateId, p_chemin: chemin })
  });
  const rattache = await rattachement.json().catch(() => false);
  if (!rattachement.ok || rattache !== true) {
    res.status(502).json({ erreur: "Le plan a été déposé mais n'a pas pu être rattaché à la date." });
    return;
  }

  res.status(200).json({ ok: true, chemin });
}
