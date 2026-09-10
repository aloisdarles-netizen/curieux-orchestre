// ============================================================================
// Navigation de la refonte 2026 — bandeau fixe + sous-menu contextuel.
//
// Pourquoi : l'irritant n°1 relevé par l'équipe de prod était « la navigation
// et l'ergo globale ». Le menu précédent était une rangée de menus déroulants
// à ouvrir un par un, et passer d'un écran d'une section à l'autre (grille des
// dispos → demandes titulaires, avancement technique → matériel) demandait
// systématiquement de rouvrir un déroulant. Ici :
//
//   - le bandeau prune est collant : les six sections restent visibles partout ;
//   - la section courante déplie un sous-menu, lui aussi collant, qui donne
//     accès en un clic à tous ses écrans — plus d'aller-retour par l'accueil ;
//   - « Vue d'ensemble » est un élément primaire du menu, pas une sous-entrée.
//
// Un seul modèle (CURIEUX_SECTIONS) décrit la structure : ajouter un écran se
// fait ici, pour les dix-neuf pages d'un coup.
// ============================================================================

// Chaque section : un libellé, la page ouverte par le clic sur la section, et
// ses écrans. « pages » liste les fichiers qui doivent allumer l'entrée — un
// écran de détail (technique-date, feuille-de-route) allume l'entrée de sa
// liste parente plutôt que de disparaître du menu.
const CURIEUX_SECTIONS = [
  { libelle:'Accueil', href:'accueil.html', pages:['accueil.html'] },
  { libelle:'Tournées', href:'tournees.html', entrees:[
    { libelle:'Gérer les tournées', href:'tournees.html', pages:['tournees.html'] },
    { libelle:'Feuilles de route', href:'feuilles-de-route.html', pages:['feuilles-de-route.html','feuille-de-route.html'] },
    { libelle:'Journal des changements', href:'newsletter.html', pages:['newsletter.html'] },
  ]},
  // Les enregistrements en studio vivent dans les mêmes pages que les tournées,
  // filtrées par ?type=recording : mêmes dates, mêmes affectations, mêmes
  // feuilles, seul le vocabulaire change (voir CURIEUX_VOCABULAIRE).
  { libelle:'Recording', href:'tournees.html?type=recording', entrees:[
    { libelle:'Gérer les recordings', href:'tournees.html?type=recording', pages:['tournees.html?type=recording'] },
    { libelle:'Feuilles de studio', href:'feuilles-de-route.html?type=recording', pages:['feuilles-de-route.html?type=recording','feuille-de-route.html?type=recording'] },
  ]},
  { libelle:'Annuaires', href:'annuaire.html', entrees:[
    { libelle:'Musicien·nes', href:'annuaire.html', pages:['annuaire.html'] },
    { libelle:'Technicien·nes', href:'techniciens.html', pages:['techniciens.html'] },
    { libelle:'Remplacements', href:'remplacements.html', pages:['remplacements.html'] },
    { libelle:'Infos sociales', href:'infos-sociales.html', pages:['infos-sociales.html'] },
  ]},
  // « Demandes titulaires » en tête, et donc page d'atterrissage de l'onglet :
  // c'est de là qu'on part — on demande leurs disponibilités, puis on regarde
  // le tableau.
  //
  // La « Grille interne » a disparu : elle montrait la même matrice que la Vue
  // d'ensemble, en sachant moins de choses (ni les projets, ni qui a été
  // sollicité, ni les précisions), et n'avait plus en propre que l'import de
  // réponses collées — qui est passé sur la Vue d'ensemble. Deux écrans
  // suffisent : un pour demander et relancer, un pour voir et décider.
  //
  // La Vue d'ensemble entre donc dans cette section, tout en gardant son entrée
  // primaire dans le bandeau : c'est la page la plus ouverte de l'application,
  // la reléguer à deux clics aurait été un recul. Elle est bien une page de
  // disponibilités, elle se range ici aussi.
  { libelle:'Disponibilités', href:'suivi-dispo.html', entrees:[
    { libelle:'Demandes titulaires', href:'suivi-dispo.html', pages:['suivi-dispo.html'] },
    { libelle:"Vue d'ensemble", href:'recap.html', pages:['recap.html'] },
    // Tout ce qui part vers l'équipe passe par là : relancer une dispo,
    // annoncer une option, dire qu'une date est validée. C'était éparpillé sur
    // les boutons de chaque page, donc fait de mémoire et jamais tracé.
    { libelle:'Messages', href:'messages.html', pages:['messages.html'] },
  ]},
  // Le tableau de bord passe en tête et devient la porte de l'espace : la page
  // Avancement dit l'état, le tableau de bord dit quoi faire — c'est par là
  // qu'on entre le matin.
  { libelle:'Technique', href:'technique-taches.html', entrees:[
    { libelle:'Tableau de bord', href:'technique-taches.html', pages:['technique-taches.html'] },
    { libelle:'Avancement', href:'technique.html', pages:['technique.html','technique-date.html'] },
    { libelle:'Salles', href:'salles.html', pages:['salles.html','salle.html'] },
    { libelle:'Matériel', href:'materiel.html', pages:['materiel.html'] },
    { libelle:'Véhicules & chauffeurs', href:'vehicules.html', pages:['vehicules.html'] },
    { libelle:'Fiches techniques', href:'fiches-techniques.html', pages:['fiches-techniques.html'] },
    { libelle:'Partage', href:'partage.html', pages:['partage.html','technique-partage.html'] },
    { libelle:'Page salle', href:'page-salle.html', pages:['page-salle.html'] },
  ]},
  // Deux façons de lire la même donnée : le tableau croisé pour décider qui
  // joue quoi, et la feuille par date pour le dire à quelqu'un d'extérieur.
  { libelle:"Vue d'ensemble", href:'recap.html', entrees:[
    { libelle:'Le tableau', href:'recap.html', pages:['recap.html'] },
    { libelle:'Plateau par date', href:'plateau.html', pages:['plateau.html'] },
  ]},
  // Le budget sort de l'administration : chiffrer un projet est un travail de
  // production, pas un réglage de l'outil, et le ranger sous « Admin » le
  // faisait chercher à trois clics. Il garde en revanche la même porte — les
  // comptes 'admin' seulement (voir requireSuperAdminAuth sur chaque page) :
  // les cachets et les marges ne se montrent pas à toute l'équipe.
  { libelle:'Budget', href:'budget.html', admin:true, entrees:[
    { libelle:'Tableau de bord', href:'budget.html', pages:['budget.html'] },
    { libelle:'Devis et budgets', href:'devis.html', pages:['devis.html','devis-editeur.html'] },
    { libelle:'Clients', href:'devis-clients.html', pages:['devis-clients.html'] },
  ]},
  // Réservée aux comptes 'admin' : elle n'entre dans le bandeau qu'après
  // vérification (voir ajouterEntreesAdmin), pour éviter d'afficher à toute
  // l'équipe une porte qui lui serait refusée.
  { libelle:'Admin', href:'admin-dashboard.html', admin:true, entrees:[
    { libelle:'Tableau de bord', href:'admin-dashboard.html', pages:['admin-dashboard.html'] },
  ]},
];

/* Les entrées réservées du bandeau (Budget, Admin), ajoutées après coup.
 *
 * Le rôle se lit côté base (isSuperAdmin), donc de façon asynchrone : attendre
 * cette réponse avant de dessiner le bandeau ferait clignoter toute la
 * navigation à chaque page. On dessine donc sans elles, et on les ajoute si le
 * compte y a droit — ce qui évite au passage de montrer aux comptes 'user' une
 * porte qui leur serait refusée.
 *
 * Sans réponse (page publique à jeton, session absente, base injoignable),
 * elles restent absentes : c'est le comportement prudent. Elles ne remplacent
 * évidemment pas le garde de chaque page réservée, qui reste seul à protéger.
 *
 * Toutes les sections marquées admin:true sont traitées, dans l'ordre du
 * modèle — la section courante est déjà dessinée par le bandeau, on la saute.
 */
async function ajouterEntreesAdmin(topbar, sectionCourante){
  const reservees = CURIEUX_SECTIONS.filter(s => s.admin && s !== sectionCourante);
  if(!reservees.length) return;
  const nav = topbar.querySelector('.co-topnav');
  if(!nav || typeof CurieuxDB === 'undefined') return;

  let autorise = false;
  try{ autorise = await CurieuxDB.isSuperAdmin(); }
  catch(e){ return; }
  if(!autorise || nav.querySelector('[data-entree-admin]')) return;

  /* Chaque entrée se place à SA position du modèle, pas en bout de bandeau :
     « Budget » vient avant « Admin » quel que soit l'écran d'où l'on vient. La
     section courante, elle, est déjà dans le bandeau — on insère avant le
     premier lien qui, dans le modèle, la suit. */
  reservees.forEach(sec => {
    const lien = document.createElement('a');
    lien.href = sec.href;
    lien.textContent = sec.libelle;
    lien.setAttribute('data-entree-admin', '1');
    const rang = CURIEUX_SECTIONS.indexOf(sec);
    const suivant = Array.from(nav.querySelectorAll('a')).find(a => {
      const s = CURIEUX_SECTIONS.find(x => x.href === a.getAttribute('href'));
      return s && CURIEUX_SECTIONS.indexOf(s) > rang;
    });
    nav.insertBefore(lien, suivant || null);
  });
}

// La clé d'une page, telle que les sections la déclarent. C'est le nom de
// fichier, sauf pour les écrans qu'un paramètre suffit à distinguer :
// tournees.html et tournees.html?type=recording sont deux entrées de menu
// différentes servies par le même fichier, il faut donc que la clé les
// sépare — sans quoi « Tournées » resterait allumé sur un recording.
function curieuxPageCourante(){
  const fichier = (location.pathname.split('/').pop() || 'accueil.html').toLowerCase();
  let type = '';
  try{ type = new URLSearchParams(location.search).get('type') || ''; }catch(e){}
  return type === 'recording' ? `${fichier}?type=recording` : fichier;
}

function curieuxSectionCourante(page){
  return CURIEUX_SECTIONS.find(sec => {
    if(sec.pages && sec.pages.includes(page)) return true;
    return (sec.entrees || []).some(e => (e.pages || [e.href]).includes(page));
  }) || null;
}

// Le bandeau est posé en premier enfant du <body> et le rembourrage horizontal
// passe du <body> au .wrap (voir base.css) : sinon le bandeau s'arrêtait à
// 16 px des bords et le collant se décalait du haut de la fenêtre.
function initCurieuxTopbar(){
  if(!document.body){
    document.addEventListener('DOMContentLoaded', initCurieuxTopbar);
    return;
  }
  if(document.querySelector('.co-topbar')) return;

  const page = curieuxPageCourante();
  const section = curieuxSectionCourante(page);

  const topbar = document.createElement('header');
  topbar.className = 'co-topbar';
  const liens = CURIEUX_SECTIONS
    .filter(sec => !sec.admin || sec === section)
    .map(sec => {
      const actif = sec === section ? ' aria-current="page"' : '';
      return `<a href="${sec.href}"${actif}>${sec.libelle}</a>`;
    }).join('');

  topbar.innerHTML = `
    <div class="co-topbar-in">
      <a class="co-topbar-logo-link" href="accueil.html" aria-label="Accueil — Curieux orchestre">
        <img class="co-topbar-logo" src="assets/images/logo-droit-noir.png" alt="Curieux orchestre">
      </a>
      <nav class="co-topnav" aria-label="Sections">${liens}</nav>
      <div class="page-nav co-topbar-actions" style="display:contents;"></div>
      <button type="button" class="co-theme-btn" id="curieuxThemeToggle" title="Basculer clair / sombre">Sombre</button>
      <span class="co-avatar" id="curieuxAvatar" title="Compte">·</span>
    </div>`;
  document.body.insertBefore(topbar, document.body.firstChild);
  document.body.classList.add('co-has-topbar');

  // Sous-menu de la section courante. L'accueil et la vue d'ensemble n'en ont
  // pas : un seul écran chacun, une barre vide serait du bruit.
  if(section && section.entrees && section.entrees.length){
    const sub = document.createElement('div');
    sub.className = 'co-subnav';
    const items = section.entrees.map(e => {
      const actif = (e.pages || [e.href]).includes(page) ? ' aria-current="page"' : '';
      return `<a href="${e.href}"${actif}>${e.libelle}</a>`;
    }).join('');
    sub.innerHTML = `<div class="co-subnav-in">
        <span class="co-subnav-title">${section.libelle}</span>${items}
      </div>`;
    topbar.insertAdjacentElement('afterend', sub);
  }

  // L'ancien en-tête (logo + rangée de menus déroulants) est retiré : son rôle
  // est repris par le bandeau. On le retire plutôt que de le masquer, pour ne
  // pas laisser deux menus dans l'ordre de tabulation.
  document.querySelectorAll('.brand-header').forEach(el => el.remove());
  document.querySelectorAll('nav.page-nav[data-curieux-nav]').forEach(el => el.remove());

  ajouterEntreesAdmin(topbar, section);
  initCurieuxThemeToggle();
  initCurieuxAvatar();
  try{ if(typeof initGlobalSearch === 'function') initGlobalSearch(topbar.querySelector('.co-topbar-actions')); }catch(e){}
  initCurieuxRaccourciRecherche();
}

// Le champ annonce « ⌘K » : le raccourci existe donc pour de vrai (⌘K sur Mac,
// Ctrl+K ailleurs). Ctrl+K est le raccourci « effacer jusqu'à la fin de ligne »
// dans un champ de saisie sous macOS, on ne le détourne donc pas quand la frappe
// vient déjà d'un champ.
function initCurieuxRaccourciRecherche(){
  document.addEventListener('keydown', (e)=>{
    if(e.key !== 'k' && e.key !== 'K') return;
    if(!(e.metaKey || e.ctrlKey)) return;
    const dansUnChamp = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '');
    if(dansUnChamp && !e.metaKey) return;
    const champ = document.getElementById('globalSearchInput');
    if(!champ) return;
    e.preventDefault();
    champ.focus();
    champ.select();
  });
}

// --- Bascule clair / sombre ------------------------------------------------
// Le site suivait le thème du système sans échappatoire. La maquette ajoute une
// bascule manuelle : le choix est retenu (localStorage) et l'emporte sur le
// système, « auto » reste possible en effaçant la préférence.
function curieuxThemePrefere(){
  try{ return localStorage.getItem('curieuxTheme') || ''; }catch(e){ return ''; }
}

function initCurieuxThemeToggle(){
  const btn = document.getElementById('curieuxThemeToggle');
  if(!btn) return;
  const maj = ()=>{
    const sombre = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.textContent = sombre ? 'Clair' : 'Sombre';
    btn.setAttribute('aria-pressed', sombre ? 'true' : 'false');
  };
  btn.addEventListener('click', ()=>{
    const sombre = document.documentElement.getAttribute('data-theme') === 'dark';
    try{ localStorage.setItem('curieuxTheme', sombre ? 'light' : 'dark'); }catch(e){}
    try{ applyAutoTheme(); }catch(e){
      document.documentElement.setAttribute('data-theme', sombre ? 'light' : 'dark');
    }
    maj();
  });
  maj();
  // applyAutoTheme() peut rebasculer le thème pendant la vie de la page (le
  // système change, ou le rappel setInterval de certaines pages) : on suit.
  new MutationObserver(maj).observe(document.documentElement, { attributes:true, attributeFilter:['data-theme'] });
}

// --- Pastille de compte ---------------------------------------------------
// Reprend l'initiale de la personne connectée, et sert de raccourci vers
// l'administration (le tableau de bord n'est pas une section du bandeau, comme
// dans la maquette — il reste accessible depuis l'accueil et depuis ici).
function initCurieuxAvatar(){
  const el = document.getElementById('curieuxAvatar');
  if(!el) return;
  const pose = (email)=>{
    if(!email) return;
    el.textContent = email.trim().charAt(0).toUpperCase();
    el.title = email;
    const lien = document.createElement('a');
    lien.className = 'co-avatar';
    lien.href = 'admin-dashboard.html';
    lien.textContent = el.textContent;
    lien.title = email + ' — administration';
    el.replaceWith(lien);
  };
  try{
    if(typeof CurieuxDB !== 'undefined' && CurieuxDB.getSession){
      Promise.resolve(CurieuxDB.getSession()).then(s => {
        const email = s && s.user && s.user.email;
        if(email) pose(email);
      }).catch(()=>{});
    }
  }catch(e){}
}

// --- Pied de page partagé -------------------------------------------------
// Mentions légales sur toutes les pages, sans le recopier dix-neuf fois.
function injectCurieuxFooter(){
  if(!document.body){
    document.addEventListener('DOMContentLoaded', injectCurieuxFooter);
    return;
  }
  if(document.querySelector('.co-footer')) return;
  const f = document.createElement('footer');
  f.className = 'co-footer';
  // Deux blocs plutôt qu'une phrase : le nom tient la gauche, la mention légale
  // se détache à droite. Le point médian qui les séparait n'avait plus lieu
  // d'être une fois les deux écartés.
  f.innerHTML = '<span class="co-footer-nom">Curieux orchestre</span>'
    + '<a href="mentions-legales.html">Mentions légales et données personnelles</a>';
  document.body.appendChild(f);
}

document.addEventListener('DOMContentLoaded', ()=>{
  try{ initCurieuxTopbar(); }catch(e){}
  try{ injectCurieuxFooter(); }catch(e){}
});
