// Création d'un compte d'équipe SANS envoi d'email.
//
// La création côté navigateur (signUp) déclenche l'email de confirmation de
// Supabase, dont le service intégré est bridé à quelques envois par heure :
// impossible d'ajouter plusieurs comptes d'affilée. Ici, le compte est créé
// par l'API d'administration de Supabase, déjà confirmé — aucun email ne
// part, aucune limite ne s'applique.
//
// La clé service_role est requise et vit UNIQUEMENT côté serveur (variable
// d'environnement Vercel SUPABASE_SERVICE_ROLE_KEY). Elle contourne toutes
// les règles RLS : c'est pourquoi l'endpoint vérifie d'abord que l'appelant
// est un compte administrateur, via son propre jeton de session.
//
// Variable d'environnement requise sur Vercel : SUPABASE_SERVICE_ROLE_KEY

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nffqcvysweidquouulzs.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_-QZnJEZi01-5fjkjv_2SPw_wODqHcJQ';

export const config = { maxDuration: 15 };

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ erreur: 'Méthode non autorisée.' });
    return;
  }
  const cleService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cleService) {
    // 501 : le navigateur retombe alors sur l'ancienne méthode (signUp),
    // qui fonctionne mais peut être freinée par la limite d'emails.
    res.status(501).json({ erreur: "SUPABASE_SERVICE_ROLE_KEY n'est pas configurée sur Vercel." });
    return;
  }

  const entete = req.headers.authorization || '';
  const jeton = entete.startsWith('Bearer ') ? entete.slice(7) : '';
  if (!jeton) {
    res.status(401).json({ erreur: 'Connexion requise.' });
    return;
  }

  let autorise;
  try {
    autorise = await estAdmin(jeton);
  } catch {
    res.status(503).json({ erreur: "Impossible de vérifier l'accès pour le moment." });
    return;
  }
  if (!autorise) {
    res.status(403).json({ erreur: 'Réservé aux comptes administrateur.' });
    return;
  }

  let corps;
  try {
    corps = await lireCorps(req);
  } catch {
    res.status(400).json({ erreur: 'Corps de requête illisible.' });
    return;
  }

  const email = String(corps.email || '').trim().toLowerCase();
  const motDePasse = String(corps.motDePasse || '');
  if (!email.includes('@') || email.length > 320) {
    res.status(400).json({ erreur: 'Adresse email invalide.' });
    return;
  }
  if (motDePasse.length < 6) {
    res.status(400).json({ erreur: 'Le mot de passe doit faire au moins 6 caractères.' });
    return;
  }

  // Création par l'API d'administration : compte confirmé d'emblée, zéro email.
  const creation = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: cleService,
      Authorization: `Bearer ${cleService}`
    },
    body: JSON.stringify({ email, password: motDePasse, email_confirm: true })
  });

  const data = await creation.json().catch(() => ({}));

  if (creation.ok) {
    res.status(200).json({ ok: true, email });
    return;
  }

  const message = data.msg || data.message || data.error_description || '';
  if (/already been registered|already exists|duplicate/i.test(message)) {
    res.status(200).json({ ok: true, email, existait: true });
    return;
  }
  console.error('[creer-compte-equipe]', creation.status, message);
  res.status(502).json({ erreur: message || `Création refusée (${creation.status}).` });
}
