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

// Départements par défaut utilisés pour amorcer le registre d'équipes road
// d'une tournée (tournees.equipesRoad) la première fois qu'on l'ouvre —
// ensuite ce sont les équipes nommées par la tournée qui font foi.
const DEPARTEMENTS_ROAD = [
  { label:'Lumière', couleur:'#F5C518' },
  { label:'Son', couleur:'#2F6FED' },
  { label:'Backline', couleur:'#F2994A' },
  { label:'Rigg', couleur:'#27AE60' },
  { label:'Vidéo', couleur:'#E85DA0' },
];
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
  { type:'groupe', libelle:'Direction technique', entrees:[
    { href:'technique.html',          icone:'icone-technique-avancement.svg', libelle:'Avancement par date' },
    { href:'materiel.html',           icone:'icone-technique-materiel.svg',   libelle:'Matériel' },
    { href:'vehicules.html',          icone:'icone-technique-vehicules.svg',  libelle:'Véhicules & chauffeurs' },
    { href:'fiches-techniques.html',  icone:'icone-technique-fiches.svg',     libelle:'Fiches techniques' },
    { href:'partage.html',            icone:'icone-technique-partage.svg',    libelle:'Partage' },
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
  // Depuis la refonte 2026, la navigation est le bandeau prune collant décrit
  // dans nav.js (CURIEUX_SECTIONS) : une rangée de menus déroulants demandait
  // d'ouvrir un déroulant à chaque changement d'écran, ce que l'équipe de prod
  // avait justement signalé. On sort donc ici sans rien rendre — la fonction
  // reste appelée par d'anciens scripts de page, et CURIEUX_NAV plus bas garde
  // la trace de l'ancienne structure.
  if(typeof CURIEUX_SECTIONS !== 'undefined') return;
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

// ---------------------------------------------------------------------------
// Accessibilité des fenêtres modales et des commandes (M2, M3).
//
// M2 — six pages ouvrent des fenêtres modales ; deux seulement se fermaient
// avec Échap, et aucune ne retenait le focus : à la tabulation on sortait de
// la fenêtre pour parcourir la page cachée derrière, sans la voir.
//
// M3 — 18 commandes n'étaient nommées que par un attribut title. Ce n'est pas
// rien (le calcul du nom accessible s'en sert en dernier recours) mais c'est
// fragile : title n'apparaît pas au tactile et son support par les lecteurs
// d'écran est inégal. On le recopie donc en aria-label, qui est fait pour ça.
// ---------------------------------------------------------------------------
const CURIEUX_FOCUSABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]),' +
  ' textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function curieuxModaleOuverte(){
  return document.querySelector('.modal-overlay.open, .modal-overlay[style*="display: flex"], .modal-overlay[style*="display:flex"]');
}

function initCurieuxAccessibilite(){
  // Nomme proprement ce qui n'est nommé que par un title.
  const nommer = () => {
    document.querySelectorAll('button[title], a[title]').forEach(el => {
      if(el.getAttribute('aria-label')) return;
      const texte = (el.textContent || '').trim()
        || [...el.querySelectorAll('img[alt]')].map(i => i.alt.trim()).join(' ').trim();
      if(!texte) el.setAttribute('aria-label', el.getAttribute('title'));
    });
    // Les pictogrammes décoratifs ne doivent pas être annoncés.
    document.querySelectorAll('button > svg, a > svg').forEach(svg => {
      if(!svg.hasAttribute('aria-hidden')) svg.setAttribute('aria-hidden', 'true');
    });
  };
  nommer();
  // Les listes sont reconstruites en permanence : on renomme après coup.
  new MutationObserver(() => nommer())
    .observe(document.body, { childList: true, subtree: true });

  let dernierFocus = null;
  document.addEventListener('focusin', (e) => {
    if(!curieuxModaleOuverte()) dernierFocus = e.target;
  });

  document.addEventListener('keydown', (e) => {
    const modale = curieuxModaleOuverte();
    if(!modale) return;

    if(e.key === 'Escape'){
      // Referme par le bouton de fermeture de la page quand il existe, pour
      // conserver le nettoyage que chaque page fait à sa façon.
      const fermer = modale.querySelector('[data-fermer-modale], .modal-close, [id$="CancelBtn"], [id$="CloseBtn"]');
      if(fermer){ fermer.click(); }
      else { modale.classList.remove('open'); modale.style.display = 'none'; }
      if(dernierFocus && document.contains(dernierFocus)) dernierFocus.focus();
      return;
    }

    if(e.key === 'Tab'){
      const cibles = [...modale.querySelectorAll(CURIEUX_FOCUSABLES)]
        .filter(el => el.offsetParent !== null);
      if(cibles.length === 0) return;
      const premier = cibles[0], dernier = cibles[cibles.length - 1];
      if(e.shiftKey && document.activeElement === premier){ e.preventDefault(); dernier.focus(); }
      else if(!e.shiftKey && document.activeElement === dernier){ e.preventDefault(); premier.focus(); }
      else if(!modale.contains(document.activeElement)){ e.preventDefault(); premier.focus(); }
    }
  });
}

if(typeof document !== 'undefined'){
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initCurieuxAccessibilite);
  } else {
    initCurieuxAccessibilite();
  }
}

// ---------------------------------------------------------------------------
// Rafraîchissement non intrusif (I6).
//
// Chaque page réagissait à un changement distant en reconstruisant intégralement
// son contenu : sur une liste de 107 fiches, on perdait sa position de
// défilement et le champ en cours de saisie. À deux personnes travaillant en
// même temps — exactement ce que le temps réel est censé permettre — la page
// sautait pendant qu'on la parcourait.
//
// Ici, on repousse la reconstruction tant que quelqu'un est en train de faire
// quelque chose, et on restitue la position de défilement le reste du temps.
// Rien n'est perdu : le rafraîchissement en attente est rejoué dès que la
// saisie ou la fenêtre est terminée.
// ---------------------------------------------------------------------------
let _curieuxRenduEnAttente = null;

function _curieuxOccupe(){
  const el = document.activeElement;
  if(el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && el.type !== 'checkbox') return true;
  if(el && el.isContentEditable) return true;
  try{ if(curieuxModaleOuverte()) return true; }catch(e){}
  return false;
}

function curieuxRafraichir(render){
  if(typeof render !== 'function') return;
  if(_curieuxOccupe()){
    // On ne garde que le dernier : les rendus sont idempotents.
    _curieuxRenduEnAttente = render;
    return;
  }
  const x = window.scrollX, y = window.scrollY;
  render();
  // Le rendu remplace des blocs entiers : sans cela, la page remonte en haut.
  if(window.scrollX !== x || window.scrollY !== y) window.scrollTo(x, y);
}

function _curieuxRejouerSiLibre(){
  if(!_curieuxRenduEnAttente || _curieuxOccupe()) return;
  const render = _curieuxRenduEnAttente;
  _curieuxRenduEnAttente = null;
  curieuxRafraichir(render);
}

if(typeof document !== 'undefined'){
  // Fin de saisie, fermeture de fenêtre, retour sur l'onglet : on rattrape.
  document.addEventListener('focusout', ()=> setTimeout(_curieuxRejouerSiLibre, 150));
  document.addEventListener('click', ()=> setTimeout(_curieuxRejouerSiLibre, 150));
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) _curieuxRejouerSiLibre(); });
}

// ============================================================================
// Mode d'emploi d'installation sur téléphone
//
// Les gestes diffèrent selon l'appareil et ne sont devinables par personne :
// sur iPhone il faut passer par le bouton Partager, sur Android le navigateur
// propose lui-même l'installation. On affiche donc les instructions de la
// plateforme réellement utilisée — et rien du tout si l'app est déjà installée.
// ============================================================================
function curieuxAppInstallee(){
  try{
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
        || window.navigator.standalone === true;
  }catch(e){ return false; }
}

function injecterModeEmploiApp(conteneur, options){
  const boite = typeof conteneur === 'string' ? document.getElementById(conteneur) : conteneur;
  if(!boite) return;
  const opt = options || {};
  const nomApp = opt.nom || 'Mon espace';

  if(curieuxAppInstallee()){
    boite.innerHTML = `<div class="app-install app-install-ok">
      <b>C'est installé.</b> Retrouve « ${escapeHtml(nomApp)} » sur ton écran d'accueil.
    </div>`;
    return;
  }

  const ua = navigator.userAgent || '';
  const estIOS = /iPad|iPhone|iPod/.test(ua) || (/Mac/.test(ua) && navigator.maxTouchPoints > 1);
  const estAndroid = /Android/.test(ua);
  // Sur iPhone, seul Safari sait installer : ni Chrome ni Firefox n'ont le geste.
  const safariIOS = estIOS && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);

  const iconePartage = `<svg width="15" height="15" viewBox="0 0 24 24" style="vertical-align:-3px;" aria-hidden="true">
    <path d="M12 3.5v11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
    <polyline points="8.5,7 12,3.5 15.5,7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></polyline>
    <path d="M7 11H5.8A1.8 1.8 0 0 0 4 12.8v6.4A1.8 1.8 0 0 0 5.8 21h12.4a1.8 1.8 0 0 0 1.8-1.8v-6.4A1.8 1.8 0 0 0 18.2 11H17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg>`;

  let etapes;
  if(estIOS && !safariIOS){
    etapes = `<p class="app-install-note">Ouvre cette page dans <b>Safari</b> pour pouvoir l'installer — les autres navigateurs ne le permettent pas sur iPhone.</p>`;
  } else if(estIOS){
    etapes = `<ol class="app-install-etapes">
      <li>Touche ${iconePartage} <b>Partager</b>, en bas de l'écran.</li>
      <li>Fais défiler puis choisis <b>Sur l'écran d'accueil</b>.</li>
      <li>Touche <b>Ajouter</b>, en haut à droite.</li>
    </ol>`;
  } else if(estAndroid){
    etapes = `<ol class="app-install-etapes">
      <li>Ouvre le menu <b>⋮</b>, en haut à droite.</li>
      <li>Choisis <b>Installer l'application</b> (ou « Ajouter à l'écran d'accueil »).</li>
    </ol>`;
  } else {
    etapes = `<p class="app-install-note">Ouvre ce lien sur ton téléphone pour l'installer et l'avoir sous la main comme une application.</p>`;
  }

  boite.innerHTML = `<div class="app-install">
    <b class="app-install-titre">Garde-le sous la main</b>
    <p class="app-install-intro">Installe cette page sur ton téléphone : tu la retrouveras comme une application, et elle restera consultable même sans réseau.</p>
    ${etapes}
    <button type="button" class="app-install-btn" id="installerAppBtn" style="display:none;">Installer l'application</button>
  </div>`;

  // Android propose l'installation par un événement : quand il se déclenche, on
  // remplace les instructions manuelles par un vrai bouton.
  const btn = document.getElementById('installerAppBtn');
  let invite = null;
  window.addEventListener('beforeinstallprompt', (e)=>{
    e.preventDefault();
    invite = e;
    if(btn) btn.style.display = 'block';
    const liste = boite.querySelector('.app-install-etapes');
    if(liste) liste.style.display = 'none';
  });
  if(btn){
    btn.addEventListener('click', async ()=>{
      if(!invite) return;
      invite.prompt();
      await invite.userChoice;
      invite = null;
      btn.style.display = 'none';
    });
  }
  window.addEventListener('appinstalled', ()=> injecterModeEmploiApp(boite, opt));
}

// ============================================================================
// Filet de sécurité sur la feuille de style.
//
// assets/base.css porte tout le socle visuel : sans elle, la page s'affiche en
// texte brut, liens soulignés et logo en taille native. Cela s'est produit en
// production environ une fois sur dix, le service worker faisant échouer la
// requête au moindre incident de stockage (corrigé dans sw.js).
//
// Reste le cas qu'aucun service worker ne couvre : la toute première visite,
// où il n'est pas encore enregistré, et où un simple à-coup de réseau — une
// salle, un partage de connexion — suffit à perdre le fichier. On s'en aperçoit
// alors et on le redemande une fois, sous une adresse neuve pour contourner
// tout cache.
//
// `link.sheet` est le signal : au chargement complet de la page, une feuille
// appliquée en a une, une feuille en échec vaut null.
// ============================================================================
function reprendreFeuilleDeStyle(){
  document.querySelectorAll('link[rel="stylesheet"]').forEach((lien)=>{
    if(lien.sheet || lien.dataset.reprise) return;
    lien.dataset.reprise = '1';
    const neuf = document.createElement('link');
    neuf.rel = 'stylesheet';
    const sep = lien.href.includes('?') ? '&' : '?';
    neuf.href = lien.href + sep + 'reprise=' + Date.now();
    lien.parentNode.insertBefore(neuf, lien.nextSibling);
    console.warn('[Curieux] feuille de style non chargée, seconde tentative :', lien.href);
  });
}
if(typeof window !== 'undefined') window.addEventListener('load', reprendreFeuilleDeStyle);
