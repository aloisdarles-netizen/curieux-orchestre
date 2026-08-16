// Manifeste d'application généré à la volée pour les pages ouvertes par un
// lien personnel (musicien·ne, salle, technicien·ne, stage manager).
//
// Pourquoi une fonction plutôt qu'un fichier : un site n'a qu'un manifeste,
// avec une seule adresse de départ. L'app de l'équipe démarre sur l'accueil,
// mais chaque personne a un lien qui lui est propre — il n'existe pas
// d'adresse de départ commune. On fabrique donc un manifeste par lien, dont
// le start_url est exactement la page de la personne concernée.
//
// Appel : /api/manifeste?page=mes-infos.html&jeton=<jeton>

// Liste blanche : la page demandée doit figurer ici. Sans cela, n'importe qui
// pourrait faire pointer un manifeste vers une adresse de son choix.
const PAGES = {
  'mon-espace.html':       { param: 'token', nom: 'Mon espace',         court: 'Mon espace' },
  'mes-infos.html':        { param: 'token', nom: 'Mes infos',          court: 'Mes infos' },
  'dispo-titulaire.html':  { param: 'token', nom: 'Mes disponibilités', court: 'Mes dispos' },
  'mes-remplacants.html':  { param: 'token', nom: 'Mes remplaçants',    court: 'Remplaçants' },
  'technique-partage.html':{ param: 'jeton', nom: 'Technique',          court: 'Technique' },
  'fiche-technique.html':  { param: 'jeton', nom: 'Fiche technique',    court: 'Fiche tech' },
};

// Tous les jetons produits par l'app sont alphanumériques (uuid sans tirets
// côté base, base36 côté navigateur). On refuse tout le reste plutôt que de
// recopier une valeur arbitraire dans une adresse.
const JETON_VALIDE = /^[A-Za-z0-9_-]{1,128}$/;

export default function handler(req, res) {
  const params = new URL(req.url, `https://${req.headers.host || 'localhost'}`).searchParams;
  const page = params.get('page') || '';
  const jeton = params.get('jeton') || '';

  const def = Object.prototype.hasOwnProperty.call(PAGES, page) ? PAGES[page] : null;
  if (!def || !JETON_VALIDE.test(jeton)) {
    res.status(400).json({ erreur: 'Paramètres invalides.' });
    return;
  }

  const depart = `/${page}?${def.param}=${encodeURIComponent(jeton)}`;

  const manifeste = {
    // L'identifiant distingue cette app installée de celle de l'équipe (id "/")
    // et de celle d'une autre personne : deux liens différents donnent bien
    // deux icônes distinctes.
    id: depart,
    name: `Curieux — ${def.nom}`,
    short_name: def.court,
    lang: 'fr',
    dir: 'ltr',
    start_url: depart,
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#FCF2F0',
    theme_color: '#791649',
    icons: [
      { src: '/assets/images/icone-app-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/assets/images/icone-app-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/assets/images/icone-app-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/assets/images/icone-app-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };

  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  // Le manifeste contient un jeton personnel : il ne doit jamais être mis en
  // cache par un intermédiaire partagé.
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
  res.status(200).send(JSON.stringify(manifeste));
}
