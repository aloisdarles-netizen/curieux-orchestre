// Petites fonctions utilitaires partagées par toutes les pages — HTML/dates/menu de nav.
// Chargé après brand-assets.js et avant le <script> de chaque page.
// Volontairement PAS de formateurs de date ici : plusieurs pages leur donnaient le même nom
// (fmtDateFR, fmtDateFRLong...) pour des rendus différents (avec/sans année, mois abrégé ou
// non) — les fusionner risquait de changer silencieusement l'affichage de certaines pages.
// Chaque page garde donc ses propres formateurs de date.

// String(str||'') plutôt que (str||'') seul : un nombre ou tout autre valeur non-string
// passée par erreur (ex: un montant en euros) plantait sur .replace, qui n'existe pas
// sur Number.prototype — vu en pratique avec tournees.html/cachetMontant.
function escapeHtml(str){ return String(str||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escapeAttr(str){ return escapeHtml(str); }
function fullName(p){ return [p.prenom, p.nom].filter(Boolean).join(' ') || 'Sans nom'; }
// Le suffixe aléatoire sert aussi de token imprévisible pour les liens perso
// (dispo_demandes.id) : crypto.getRandomValues plutôt que Math.random(), qui
// n'offre aucune garantie d'imprévisibilité.
function genId(prefix){
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  const rand = Array.from(bytes, b=> b.toString(36).padStart(2, '0')).join('');
  return prefix + Date.now().toString(36) + rand;
}

function addDaysIso(iso, delta){
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0,10);
}
function daysBetween(isoA, isoB){
  const [ya,ma,da] = isoA.split('-').map(Number);
  const [yb,mb,db] = isoB.split('-').map(Number);
  return Math.round((Date.UTC(yb,mb-1,db) - Date.UTC(ya,ma-1,da)) / 86400000);
}

// Regroupe des dates triées en blocs via le flag linkedToNext (dates consécutives liées) :
// veille/lendemain calculés sur le bloc entier, groupIndex alterne (0/1) d'un bloc au suivant
// pour permettre de distinguer visuellement deux blocs consécutifs. Les dates isolées
// (non liées) ne sont pas ajoutées à la map retournée.
// IMPORTANT : toujours appeler sur le tableau COMPLET et trié des dates (annulées incluses),
// jamais sur une liste déjà filtrée pour l'affichage — filtrer avant décale artificiellement
// les liaisons linkedToNext.
function computeBlocMap(datesSorted){
  const map = new Map();
  let i = 0;
  let blocGroupIndex = 0;
  while(i < datesSorted.length){
    let j = i;
    while(j < datesSorted.length - 1 && datesSorted[j].linkedToNext) j++;
    const blocDates = datesSorted.slice(i, j+1);
    if(blocDates.length > 1){
      const groupIndex = blocGroupIndex;
      blocGroupIndex++;
      blocDates.forEach((d, idx)=> map.set(d.id, {
        blocDates, idx, isFirst: idx===0, isLast: idx===blocDates.length-1, groupIndex,
        veille: addDaysIso(blocDates[0].date, -1),
        lendemain: addDaysIso(blocDates[blocDates.length-1].date, 1)
      }));
    }
    i = j + 1;
  }
  return map;
}

// Menu de nav groupé (Tournées/Annuaires/Disponibilités en dropdowns) — même comportement
// sur toutes les pages : clic pour ouvrir/fermer, un seul groupe ouvert à la fois, clic
// en dehors pour fermer.
function initNavDropdowns(){
  // Rend le menu partagé au passage : toutes les pages appelaient déjà cette
  // fonction, inutile de leur ajouter un appel de plus.
  try{ renderCurieuxNav(); }catch(e){}
  const fermerTout = ()=> document.querySelectorAll('.nav-group.open').forEach(g=>{
    g.classList.remove('open');
    const b = g.querySelector('.nav-group-btn');
    if(b) b.setAttribute('aria-expanded','false');
  });
  document.querySelectorAll('.nav-group-btn').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const group = btn.closest('.nav-group');
      const wasOpen = group.classList.contains('open');
      fermerTout();
      if(!wasOpen){ group.classList.add('open'); btn.setAttribute('aria-expanded','true'); }
    });
  });
  document.addEventListener('click', fermerTout);
  // Échap referme le menu ouvert : au clavier, il n'y avait aucun moyen d'en
  // sortir sans cliquer ailleurs.
  document.addEventListener('keydown', (e)=>{
    if(e.key !== 'Escape') return;
    const ouvert = document.querySelector('.nav-group.open');
    if(!ouvert) return;
    fermerTout();
    const b = ouvert.querySelector('.nav-group-btn');
    if(b) b.focus();
  });
}

// ---------------------------------------------------------------------------
// Menu de navigation partagé. Il était auparavant recopié à l'identique dans
// dix pages : ajouter une entrée demandait d'éditer dix fichiers, et une seule
// omission suffisait à rendre les menus incohérents. Il est désormais décrit
// une fois ici et rendu à l'ouverture de la page.
//
// Les pages au menu réduit (accueil, infos sociales) gardent volontairement
// leur propre balisage : elles n'ont pas ce menu-là.
// ---------------------------------------------------------------------------
const CURIEUX_NAV = [
  { type:'lien', href:'accueil.html', libelle:'← Accueil', classe:'ghost' },
  { type:'groupe', libelle:'Tournées', entrees:[
    { href:'tournees.html',          icone:'icone-tournees.svg',          libelle:'Gérer les tournées' },
    { href:'feuilles-de-route.html', icone:'icone-feuilles-de-route.svg', libelle:'Feuilles de route' },
    { href:'newsletter.html',        icone:'icone-newsletter.svg',        libelle:'Journal des changements' },
  ]},
  { type:'groupe', libelle:'Annuaires', entrees:[
    { href:'annuaire.html',        icone:'icone-annuaire.svg',    libelle:'Musicien·nes' },
    { href:'techniciens.html',     icone:'icone-techniciens.svg', libelle:'Technicien·nes' },
    { href:'infos-sociales.html',  icone:'cadenas',               libelle:'Infos sociales' },
  ]},
  { type:'groupe', libelle:'Disponibilités', entrees:[
    { href:'disponibilites.html', icone:'icone-disponibilites.svg',        libelle:'Grille interne' },
    { href:'suivi-dispo.html',    icone:'icone-demandes-titulaires.svg',   libelle:'Demandes titulaires' },
  ]},
  { type:'lien', href:'recap.html', icone:'icone-vue-ensemble.svg', libelle:"Vue d'ensemble" },
];

const CURIEUX_ICONE_CADENAS =
  '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style="vertical-align:-2px; margin-right:6px;">' +
  '<rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"></rect>' +
  '<path d="M8 11V7.5a4 4 0 0 1 8 0V11" fill="none" stroke="currentColor" stroke-width="1.6"></path>' +
  '<circle cx="12" cy="15.5" r="1.3" fill="currentColor"></circle></svg>';

function curieuxNavIcone(icone){
  if(!icone) return '';
  if(icone === 'cadenas') return CURIEUX_ICONE_CADENAS;
  return `<img class="nav-icon" src="assets/icones/${icone}" alt="">`;
}

// Rend le menu dans le <nav class="page-nav"> de la page. La page courante est
// marquée aria-current="page" : sans elle, rien n'indiquait où l'on se trouve.
function renderCurieuxNav(){
  const nav = document.querySelector('nav.page-nav[data-curieux-nav]');
  if(!nav || nav.dataset.rendu) return;
  const ici = location.pathname.split('/').pop() || 'accueil.html';
  nav.innerHTML = CURIEUX_NAV.map(item => {
    if(item.type === 'lien'){
      const courant = item.href === ici ? ' aria-current="page"' : '';
      return `<a href="${item.href}"${item.classe ? ` class="${item.classe}"` : ''}${courant}>${curieuxNavIcone(item.icone)}${item.libelle}</a>`;
    }
    const contient = item.entrees.some(e => e.href === ici);
    return `<div class="nav-group">
      <button type="button" class="nav-group-btn"${contient ? ' aria-current="true"' : ''} aria-expanded="false">${item.libelle} <span class="nav-caret" aria-hidden="true">▾</span></button>
      <div class="nav-dropdown">${item.entrees.map(e =>
        `<a href="${e.href}"${e.href === ici ? ' aria-current="page"' : ''}>${curieuxNavIcone(e.icone)}${e.libelle}</a>`
      ).join('')}</div>
    </div>`;
  }).join('');
  nav.dataset.rendu = '1';
}
