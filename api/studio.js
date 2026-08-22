// Passerelle vers le tableur Google des réservations du studio.
//
// Le tableur reste la source de vérité (le studio et d'autres loueurs y
// écrivent) ; un script Apps Script collé dedans l'expose en JSON — voir
// outils/studio-apps-script.gs pour sa mise en place. Cette fonction fait
// l'intermédiaire pour trois raisons :
//   - la CSP du site n'autorise que Supabase en connect-src : les pages
//     parlent à /api/studio, même origine, et rien ne s'ouvre de plus ;
//   - le secret d'écriture (STUDIO_SECRET) ne quitte jamais le serveur — la
//     page ne le connaît pas, on ne peut donc pas écrire dans le tableur en
//     lisant le code source du site ;
//   - le jeton d'accès (STUDIO_JETON) borne la lecture : les créneaux et les
//     noms des autres loueurs ne sont pas publics pour autant.
//
// Variables d'environnement requises sur Vercel :
//   APPS_SCRIPT_URL — l'URL /exec du déploiement Apps Script
//   STUDIO_SECRET   — le même secret que la propriété SECRET du script
//   STUDIO_JETON    — le jeton attendu dans les liens studio.html?jeton=…

export const config = { maxDuration: 20 };

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

export default async function handler(req, res) {
  const scriptUrl = process.env.APPS_SCRIPT_URL;
  const secret = process.env.STUDIO_SECRET;
  const jetonAttendu = process.env.STUDIO_JETON;
  if (!scriptUrl || !secret || !jetonAttendu) {
    res.status(501).json({ erreur: "L'espace studio n'est pas encore configuré côté serveur (APPS_SCRIPT_URL, STUDIO_SECRET, STUDIO_JETON)." });
    return;
  }

  // Le jeton voyage en en-tête plutôt qu'en query : il ne finit ni dans les
  // logs d'accès ni dans un éventuel cache intermédiaire.
  const jeton = req.headers['x-studio-jeton'] || '';
  if (jeton !== jetonAttendu) {
    res.status(403).json({ erreur: 'Lien non reconnu.' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const de = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.de || '')) ? req.query.de : '';
      const jours = String(req.query.jours || '').replace(/[^\d]/g, '').slice(0, 3);
      const url = scriptUrl
        + '?jours=' + (jours || '60')
        + (de ? '&de=' + de : '');
      // Apps Script répond par une redirection vers googleusercontent : fetch
      // la suit d'office, mais on le dit pour que personne ne la « corrige ».
      const rep = await fetch(url, { redirect: 'follow' });
      const donnees = await rep.json().catch(() => null);
      if (!donnees || donnees.ok !== true) {
        res.status(502).json({ erreur: 'Le tableur n\'a pas répondu correctement.' });
        return;
      }
      // Une minute de cache partagé : l'affichage mural rafraîchit sans
      // marteler Apps Script, et une réservation se voit vite quand même.
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
      res.status(200).json(donnees);
      return;
    }

    if (req.method === 'POST') {
      const corps = await lireCorps(req).catch(() => null);
      if (!corps) { res.status(400).json({ erreur: 'Corps illisible.' }); return; }
      const action = corps.action === 'annuler' ? 'annuler' : 'reserver';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(corps.date || ''))
          || !['matin', 'apresmidi', 'soir'].includes(corps.creneau)) {
        res.status(400).json({ erreur: 'Demande incomplète.' });
        return;
      }
      const rep = await fetch(scriptUrl, {
        method: 'POST',
        redirect: 'follow',
        // text/plain volontaire : Apps Script lit e.postData.contents tel quel,
        // et cela évite le pré-vol CORS côté Google.
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: JSON.stringify({
          secret,
          action,
          date: corps.date,
          creneau: corps.creneau,
          remarque: String(corps.remarque || '').slice(0, 200),
        }),
      });
      const donnees = await rep.json().catch(() => null);
      if (!donnees) {
        res.status(502).json({ erreur: 'Le tableur n\'a pas répondu correctement.' });
        return;
      }
      res.status(200).json(donnees);
      return;
    }

    res.status(405).json({ erreur: 'Méthode non autorisée.' });
  } catch (e) {
    res.status(502).json({ erreur: 'Le tableur est injoignable pour le moment.' });
  }
}
