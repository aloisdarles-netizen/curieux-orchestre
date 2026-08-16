/* Service worker de Curieux orchestre.
 *
 * Objectif : rendre l'app installable et consultable hors connexion, SANS
 * jamais afficher une page périmée à quelqu'un qui a du réseau.
 *
 * Trois règles qui gouvernent tout le fichier :
 *
 *  1. On ne touche JAMAIS à ce qui n'est pas une lecture simple de notre
 *     propre site. Les appels à Supabase (données, connexion) et à /api/
 *     passent directement au réseau, sans interception ni copie locale.
 *     Aucune donnée personnelle ne finit donc dans le cache du navigateur.
 *
 *  2. Les pages (HTML) sont servies en « réseau d'abord » : en ligne, on voit
 *     toujours la dernière version publiée. Le cache ne sert que de secours
 *     quand la connexion manque — typiquement dans une salle sans réseau.
 *
 *  3. Les fichiers de présentation (CSS, JS, images, polices) sont servis
 *     depuis le cache pour la vitesse, puis rafraîchis en arrière-plan. Une
 *     version obsolète se corrige donc d'elle-même au chargement suivant.
 *
 * VERSION : à incrémenter lors d'un changement important des fichiers
 * statiques. Cela purge les anciens caches à l'activation.
 */

const VERSION = 'curieux-v1';
const CACHE_PAGES = `${VERSION}-pages`;
const CACHE_ACTIFS = `${VERSION}-actifs`;
const PAGE_HORS_LIGNE = '/hors-ligne.html';

// Socle minimal mis en cache dès l'installation : de quoi afficher quelque
// chose de propre même si la toute première visite hors ligne survient tôt.
const SOCLE = [
  PAGE_HORS_LIGNE,
  '/assets/base.css',
  '/assets/images/icone-app-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_ACTIFS)
      // addAll échoue en bloc si un seul fichier manque : on tolère les
      // absences pour ne jamais empêcher l'installation du service worker.
      .then((cache) => Promise.allSettled(SOCLE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(
        noms.filter((n) => !n.startsWith(VERSION)).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

// Permet à la page de demander l'activation immédiate d'une mise à jour.
self.addEventListener('message', (event) => {
  if (event.data === 'appliquer-maj') self.skipWaiting();
});

function estRequeteDePage(request) {
  return request.mode === 'navigate'
    || (request.method === 'GET'
        && (request.headers.get('accept') || '').includes('text/html'));
}

// Réponse à donner quand le réseau est injoignable : la page demandée si on
// l'a déjà vue, sinon la page « hors connexion ». On ne renvoie jamais
// undefined — cela afficherait l'écran d'erreur brut du navigateur.
async function reponseDeSecours(request) {
  const dejaVue = await caches.match(request, { ignoreSearch: true });
  if (dejaVue) return dejaVue;

  const secours = await caches.match(PAGE_HORS_LIGNE);
  if (secours) return secours;

  return new Response(
    '<!doctype html><meta charset="utf-8"><title>Hors connexion</title>'
    + '<p style="font:16px system-ui;padding:32px">Pas de connexion, et cette page '
    + "n'a pas encore été consultée sur cet appareil.</p>",
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Règle 1 — on ne s'occupe que des lectures de notre propre origine.
  // Tout le reste (Supabase, /api/, écritures) file au réseau intact.
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Règle 2 — pages : réseau d'abord, cache en secours.
  //
  // `cache: 'no-cache'` force la revalidation auprès du serveur au lieu de
  // laisser le cache HTTP du navigateur répondre. Sans cela, une page publiée
  // il y a peu peut rester invisible pendant des minutes selon les en-têtes
  // envoyés par l'hébergeur. Ce n'est pas coûteux : le serveur répond 304 et
  // ne renvoie le corps que s'il a réellement changé.
  if (estRequeteDePage(request)) {
    event.respondWith(
      fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' })
        .then((reponse) => {
          if (reponse && reponse.ok) {
            const copie = reponse.clone();
            caches.open(CACHE_PAGES).then((c) => c.put(request, copie));
          }
          return reponse;
        })
        .catch(() => reponseDeSecours(request))
    );
    return;
  }

  // Règle 3 — fichiers de présentation : cache d'abord, rafraîchi derrière.
  //
  // La recherche est volontairement limitée au cache des actifs. `caches.match`
  // global inspecterait aussi le cache des pages et pourrait rendre une copie
  // de page là où le code attend un fichier — donc une version périmée.
  event.respondWith(
    caches.open(CACHE_ACTIFS).then((cache) =>
      cache.match(request).then((cachee) => {
        const reseau = fetch(request)
          .then((reponse) => {
            if (reponse && reponse.ok) cache.put(request, reponse.clone());
            return reponse;
          })
          .catch(() => cachee);
        return cachee || reseau;
      })
    )
  );
});
