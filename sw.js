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

// v3 : pdf-charte.js a gagné une section libre, et deux fichiers sont apparus
// (qr.js, pdf-prise-en-main.js). Les actifs étant servis depuis le cache avant
// d'être rafraîchis, un navigateur déjà venu continuait de charger l'ancien
// pdf-charte.js — et les boutons d'export qui s'appuient sur la nouveauté
// restaient sans effet. Toute modification d'un fichier de assets/ doit
// s'accompagner d'un incrément ici.
// v4 : pdf-prise-en-main.js sait rendre un blob pour l'envoi WhatsApp.
// v5 : correctifs d'audit — contraste des boutons secondaires en sombre
// (base.css), widget de retour réduit en mobile (brand-assets.js).
// v6 : suite de l'audit visuel — matrices de vue d'ensemble étirées, panneaux
// d'état vide coiffés d'une icône, boutons d'en-tête recollés à droite
// (base.css).
// v7 : la fiche de prise en main pointe toujours vers prod.lessoudaines.fr,
// et non plus vers l'hôte d'où elle est générée (pdf-prise-en-main.js).
// v8 : tous les liens partagés (accès techniques, fiches techniques, page
// salle, liens dispo/espace perso) passent par la même base prod, centralisée
// dans db.js (lienPublic / CURIEUX_BASE_PUBLIQUE).
// v9 : fiche de prise en main plus accueillante — pastillons ronds colorés par
// étape et pavé du lien en rose pâle (pdf-charte.js, pdf-prise-en-main.js).
// v10 : retrait de l'espace studio (studio-commun.js supprimé) — le
// déploiement du script Google côté tableur n'a pas pu aboutir.
// v11 : espace Devis — deux nouveaux actifs (devis-commun.js, pdf-devis.js),
// adaptateurs dans db.js, option mentionDebordement dans pdf-charte.js.
// v12 : feuille de chiffrage relisible (libellés courts de régime dans
// devis-commun.js), fiche client reprise dans le PDF (pdf-devis.js).
// v13 : assiette des frais généraux paramétrable par section (devis-commun.js),
// mention de l'assiette réduite sur le PDF (pdf-devis.js).
// v14 : budget et devis client deviennent deux natures de document
// (devis-commun.js), le PDF d'un budget porte son bandeau (pdf-devis.js).
// v15 : partitions sur la feuille de route et sauvegarde quotidienne des devis
// (assets/db.js : listerSauvegardes, lienSauvegarde, lancerSauvegardeDevis).
// v16 : module Recording — vocabulaire adaptatif et pastille de nature dans
// ui-helpers.js, colonne « type » portée par l'adaptateur tournees de db.js,
// entrée « Recording » et détection de page à requête dans nav.js, bandeau
// élargi à huit sections et dégradé de fin de menu dans base.css, lien de
// recherche vers la page filtrée dans global-search.js.
// v17 : feuille de studio — la feuille de route s'adapte à la nature du projet,
// les feuilles se filtrent, et tout ce qui relève de la route (mode de voyage,
// bloc départ-veille/retour-lendemain, hôtel, merchandising) disparaît des
// écrans de studio (nav.js : sous-menu Recording et détection de page à
// requête ; ui-helpers.js : libelleSeance, lu par le PDF de la feuille).
// v18 : devis-commun.js gagne le rattachement à un projet (tourneeId, gabarit
// de sections par nature, chiffres et écarts) ; base.css n'a pas bougé, mais un
// actif modifié impose l'incrément — voir la note de la v3.
// v19 : l'espace Devis prend son propre habillage (assets/espace-budget.css,
// nouvel actif), le composeur PDF apprend le filigrane (pdf-charte.js) que
// pdf-devis.js pose sur les budgets, et devis-commun.js gagne le détecteur de
// lignes à régime chargeable hors section de rémunération.
// v20 : les régimes de charges se nomment par ce qu'ils couvrent
// (devis-commun.js), et l'éditeur montre les assiettes qui n'engendrent rien
// plus une légende « qui va dans quel régime » (espace-budget.css).
// v21 : le cachet d'un recording se fixe séance par séance — chiffresDuProjet
// (devis-commun.js) ne rend plus de cachet global pour un recording.
// v22 : le parseur de listes de messagerie déménage dans ui-helpers.js pour
// servir aussi l'annuaire technique.
// v23 : ui-helpers.js gagne le rôle par projet (roleSurProjet, estDuNoyau) et
// db.js le porte sur dispo_demandes ; pdf-prise-en-main.js accepte un type par
// personne, la fiche ayant quitté l'annuaire pour la page des demandes.
// v24 : ui-helpers.js porte la liste des champs obligatoires d'une fiche
// sociale (CURIEUX_INFOS_REQUISES), lue par mes-infos et par l'accueil du lien
// personnel.
// v25 : computeBlocMap (ui-helpers.js) rend veille/lendemain nuls quand le bloc
// n'a pas de trajet — le mode de voyage « Aucun ».
const VERSION = 'curieux-v25';
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
      // Un stockage qui refuse de s'ouvrir ne doit pas non plus empêcher
      // l'installation : sans cache, le service worker sert le réseau nu,
      // ce qui reste préférable à une version qui reste bloquée en attente.
      .catch(() => {})
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
  // Même précaution qu'au service des actifs : si le stockage refuse de
  // répondre, on tombe sur le message ci-dessous plutôt que de laisser le
  // rejet remonter à respondWith, ce qui donnerait l'écran d'erreur du
  // navigateur au lieu de la page hors connexion.
  try {
    const dejaVue = await caches.match(request, { ignoreSearch: true });
    if (dejaVue) return dejaVue;

    const secours = await caches.match(PAGE_HORS_LIGNE);
    if (secours) return secours;
  } catch (e) { /* stockage indisponible */ }

  return new Response(
    '<!doctype html><meta charset="utf-8"><title>Hors connexion</title>'
    + '<p style="font:16px system-ui;padding:32px">Pas de connexion, et cette page '
    + "n'a pas encore été consultée sur cet appareil.</p>",
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

// Sert un fichier de présentation : le cache d'abord pour la vitesse, le
// réseau ensuite, et le réseau seul si le stockage fait défaut.
//
// Cette fonction ne doit JAMAIS lever ni rendre undefined. event.respondWith()
// traite les deux comme une erreur réseau : le fichier n'arrive pas, et une
// feuille de style manquante affiche la page en texte brut. C'est ce qui se
// produisait environ une fois sur dix — le moindre incident du stockage
// (navigation privée, quota, purge d'un ancien cache en cours, éviction par
// Safari après sept jours) suffisait, alors que le réseau, lui, répondait.
async function servirActif(request) {
  let cache = null;
  let cachee = null;
  try {
    cache = await caches.open(CACHE_ACTIFS);
    cachee = await cache.match(request);
  } catch (e) {
    // Stockage indisponible : on continuera sans lui, sans faire échouer la
    // requête pour autant.
  }

  if (cachee) {
    rafraichirEnFond(cache, request);
    return cachee;
  }

  try {
    const reponse = await fetch(request);
    mettreEnCache(cache, request, reponse);
    return reponse;
  } catch (e) {
    // Réseau injoignable et rien en cache. On rend une réponse en propre :
    // le navigateur saura que le fichier manque, au lieu de subir une erreur
    // réseau opaque.
    return new Response('', { status: 504, statusText: 'Fichier indisponible hors connexion' });
  }
}

// Le rafraîchissement se fait derrière la page : son échec ne la concerne pas.
function rafraichirEnFond(cache, request) {
  if (!cache) return;
  fetch(request).then((reponse) => mettreEnCache(cache, request, reponse)).catch(() => {});
}

// cache.put() rejette sur une réponse partielle (206) ou en erreur, et peut
// rejeter tout court quand le quota est atteint. Aucune de ces situations ne
// doit remonter jusqu'à la page.
function mettreEnCache(cache, request, reponse) {
  if (!cache || !reponse || reponse.status !== 200) return;
  try {
    cache.put(request, reponse.clone()).catch(() => {});
  } catch (e) { /* clone() sur un corps déjà lu */ }
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
          if (reponse && reponse.status === 200) {
            const copie = reponse.clone();
            // Le stockage peut refuser : la page est déjà servie, cet échec
            // ne doit pas remonter en rejet non traité.
            caches.open(CACHE_PAGES).then((c) => c.put(request, copie)).catch(() => {});
          }
          return reponse;
        })
        .catch(() => reponseDeSecours(request))
    );
    return;
  }

  // Règle 3 — fichiers de présentation : cache d'abord, rafraîchi derrière.
  //
  // La recherche est volontairement limitée au cache des actifs (voir
  // servirActif) : `caches.match` global inspecterait aussi le cache des pages
  // et pourrait rendre une copie de page là où le code attend un fichier —
  // donc une version périmée.
  event.respondWith(servirActif(request));
});
