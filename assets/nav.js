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
  { libelle:'Annuaires', href:'annuaire.html', entrees:[
    { libelle:'Musicien·nes', href:'annuaire.html', pages:['annuaire.html'] },
    { libelle:'Technicien·nes', href:'techniciens.html', pages:['techniciens.html'] },
    { libelle:'Remplacements', href:'remplacements.html', pages:['remplacements.html'] },
    { libelle:'Infos sociales', href:'infos-sociales.html', pages:['infos-sociales.html'] },
  ]},
  { libelle:'Disponibilités', href:'disponibilites.html', entrees:[
    { libelle:'Grille interne', href:'disponibilites.html', pages:['disponibilites.html'] },
    { libelle:'Demandes titulaires', href:'suivi-dispo.html', pages:['suivi-dispo.html'] },
  ]},
  { libelle:'Technique', href:'technique.html', entrees:[
    { libelle:'Avancement', href:'technique.html', pages:['technique.html','technique-date.html'] },
    { libelle:'Matériel', href:'materiel.html', pages:['materiel.html'] },
    { libelle:'Véhicules & chauffeurs', href:'vehicules.html', pages:['vehicules.html'] },
    { libelle:'Fiches techniques', href:'fiches-techniques.html', pages:['fiches-techniques.html'] },
    { libelle:'Partage', href:'partage.html', pages:['partage.html','technique-partage.html'] },
    { libelle:'Page salle', href:'page-salle.html', pages:['page-salle.html'] },
  ]},
  { libelle:"Vue d'ensemble", href:'recap.html', pages:['recap.html'] },
];

function curieuxPageCourante(){
  return (location.pathname.split('/').pop() || 'accueil.html').toLowerCase();
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
  const liens = CURIEUX_SECTIONS.map(sec => {
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
