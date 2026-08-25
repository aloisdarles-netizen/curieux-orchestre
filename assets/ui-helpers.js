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
      // Un bloc de tournée s'ouvre la veille et se referme le lendemain — mais
      // seulement s'il y a un trajet. Quand on joue à Paris ou tout près, il
      // n'y en a pas : chacun vient le jour même et rentre le soir. C'est ce
      // que dit « Aucun » dans la colonne Voyage, et veille/lendemain valent
      // alors null plutôt qu'une date de voyage qui n'existe pas.
      const premier = blocDates[0];
      const dernier = blocDates[blocDates.length - 1];
      blocDates.forEach((d, idx)=> map.set(d.id, {
        blocDates, idx, isFirst: idx===0, isLast: idx===blocDates.length-1, groupIndex,
        veille: premier.travelMode === 'aucun' ? null : addDaysIso(premier.date, -1),
        lendemain: dernier.travelMode === 'aucun' ? null : addDaysIso(dernier.date, 1)
      }));
    }
    i = j + 1;
  }
  return map;
}

// ============================================================================
// Une salle, une fiche technique.
//
// Le suivi technique était indexé par date : quatre soirs au Millenium
// donnaient quatre fiches à remplir, quatre plans de scène à demander, quatre
// questionnaires envoyés à la même salle — pour un seul montage. Ce qu'on
// prépare, ce n'est pas une date, c'est une VENUE : le déchargement, le plan
// de charge, les roadies et le rigg valent pour toute la série.
//
// On regroupe donc les dates qui se suivent dans le calendrier ET partagent le
// même endroit. « Qui se suivent » veut dire adjacentes dans la liste du
// projet : deux passages au même endroit à un mois d'intervalle, c'est deux
// montages, donc deux fiches.
//
// Une date sans endroit renseigné ne se regroupe avec rien : on ne peut pas
// affirmer que c'est le même lieu.
// ============================================================================

// Clé d'endroit : ville + lieu, insensible à la casse et aux espaces. Vide si
// l'on ne sait pas où l'on joue.
function cleEndroitDate(d){
  const ville = ((d && d.ville) || '').trim().toLowerCase();
  const lieu = ((d && d.lieu) || '').trim().toLowerCase();
  return (ville || lieu) ? `${ville}|${lieu}` : '';
}

// Découpe une liste de dates TRIÉE en séries au même endroit.
//
// aUneFiche(dateId) — optionnel — dit si une date porte déjà des données
// techniques. La série est alors portée par la première date qui en a, et non
// par la première date tout court : les fiches déjà remplies avant ce
// regroupement restent celles qu'on ouvre, au lieu d'être remplacées par une
// fiche vierge.
function groupesFicheTechnique(datesTriees, aUneFiche){
  const groupes = [];
  (datesTriees || []).forEach(d=>{
    const cle = cleEndroitDate(d);
    const dernier = groupes[groupes.length - 1];
    if(dernier && cle && dernier.cle === cle) dernier.dates.push(d);
    else groupes.push({ cle, dates: [d] });
  });
  return groupes.map(g=>{
    const porteuse = (typeof aUneFiche === 'function' && g.dates.find(d=> aUneFiche(d.id))) || g.dates[0];
    return {
      id: porteuse.id,                 // la date qui porte la fiche
      reference: porteuse,
      dates: g.dates,
      // Les autres dates de la série qui ont malgré tout leur propre fiche :
      // on ne les efface pas en silence, on les signale.
      autresFiches: typeof aUneFiche === 'function'
        ? g.dates.filter(d=> d.id !== porteuse.id && aUneFiche(d.id))
        : [],
    };
  });
}

// Retrouve la série d'une date donnée (pour une page ouverte sur ?d=…).
function groupeFicheDe(datesTriees, dateId, aUneFiche){
  return groupesFicheTechnique(datesTriees, aUneFiche).find(g=> g.dates.some(d=> d.id === dateId)) || null;
}

// « 22 → 24 janv. » quand la série couvre plusieurs jours, la date seule sinon.
// Formatage autonome : fmtDateFR vit dans chaque page, pas ici.
function libelleSerieDates(dates, options){
  const liste = (dates || []).filter(d=> d.date).map(d=> d.date).sort();
  if(liste.length === 0) return '';
  const fmt = (iso)=> new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR',
    Object.assign({ day:'numeric', month:'short' }, options || {}));
  if(liste.length === 1) return fmt(liste[0]);
  return `${fmt(liste[0])} → ${fmt(liste[liste.length - 1])}`;
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

// ============================================================================
// Vocabulaire des projets — tournée ou recording
//
// Un enregistrement en studio se planifie comme une tournée : mêmes dates,
// mêmes affectations, mêmes blocs, même feuille par jour. Ce qui change tient
// en quelques mots — on va dans un studio, pas dans une salle ; on y fait une
// séance, pas un concert — et en trois ou quatre champs propres au studio.
//
// D'où ce dictionnaire, plutôt qu'un module parallèle : les treize pages qui
// lisent déjà « tournees » continuent de fonctionner, et seuls les endroits
// que l'on LIT VRAIMENT (en-tête de page, tableau des dates, feuille de route)
// vont chercher le mot juste. Remplacer les 322 « salle » et 220 « tournée »
// du code n'apporterait rien : ce sont des noms de variables et de colonnes,
// personne ne les voit.
// ============================================================================

const CURIEUX_VOCABULAIRE = {
  tournee: {
    type: 'tournee',
    projet: 'tournée', projets: 'tournées',
    Projet: 'Tournée', Projets: 'Tournées',
    unProjet: 'une tournée', ceProjet: 'cette tournée',
    lieu: 'salle', Lieu: 'Salle',
    colonneLieu: 'Ville · lieu',
    // Les natures de date proposées dans le tableau : [valeur, libellé, icône].
    // Une tournée ne se compose pas que de concerts : on répète aussi hors
    // résidence — une journée de travail, sans public, qui n'occupe pas la
    // salle de la même façon et ne se paie pas forcément pareil.
    typesDate: [
      ['concert',    'Concert',    '♪'],
      ['repetition', 'Répétition', '⟳'],
      ['residence',  'Résidence',  '⌂'],
    ],
    pastille: '',
  },
  recording: {
    type: 'recording',
    projet: 'recording', projets: 'recordings',
    Projet: 'Recording', Projets: 'Recordings',
    unProjet: 'un recording', ceProjet: 'ce recording',
    lieu: 'studio', Lieu: 'Studio',
    colonneLieu: 'Ville · studio',
    typesDate: [
      ['prise',      'Prise',       '●'],
      ['repetition', 'Répétition',  '⌂'],
      ['overdub',    'Overdub',     '◐'],
      ['mixage',     'Mixage',      '▤'],
    ],
    pastille: 'Recording',
  },
};

// Les trois créneaux d'une journée de studio. Purement informatif : l'équipe
// est affectée à la journée (voir tournees.html), la séance dit seulement à
// quelle heure on attend le monde.
const CURIEUX_SEANCES = [
  ['journee', 'Journée',      '9h00 – 18h00'],
  ['matin',   'Matin',        '8h30 – 13h30'],
  ['aprem',   'Après-midi',   '13h30 – 18h30'],
  ['soir',    'Soir',         '18h30 – 21h30'],
];

function estRecording(projet){
  return !!projet && (typeof projet === 'string' ? projet : projet.type) === 'recording';
}

// Accepte un objet tournée, une chaîne de type, ou rien du tout : toujours un
// vocabulaire utilisable en retour, celui de la tournée par défaut.
function vocabulaireProjet(projet){
  return estRecording(projet) ? CURIEUX_VOCABULAIRE.recording : CURIEUX_VOCABULAIRE.tournee;
}

// Libellé d'une séance de studio ('Après-midi'), vide si la date n'en porte pas.
function libelleSeance(cle, avecHoraire){
  const s = CURIEUX_SEANCES.find(x => x[0] === cle);
  if(!s) return '';
  return avecHoraire ? `${s[1]} (${s[2]})` : s[1];
}

// Nature d'une date, ramenée à une valeur valide pour le type de projet.
// Une date de tournée retypée en recording garderait sinon « concert ».
function typeDateValide(projet, valeur){
  const v = vocabulaireProjet(projet);
  return v.typesDate.some(t => t[0] === valeur) ? valeur : v.typesDate[0][0];
}

function libelleTypeDate(projet, valeur){
  const v = vocabulaireProjet(projet);
  const t = v.typesDate.find(x => x[0] === valeur) || v.typesDate[0];
  return t[1];
}

function iconeTypeDate(projet, valeur){
  const v = vocabulaireProjet(projet);
  const t = v.typesDate.find(x => x[0] === valeur) || v.typesDate[0];
  return t[2];
}

// Pastille « Recording » à coller à côté d'un nom de projet, partout où les
// deux natures se mélangent (dispos, vue d'ensemble, avancement technique,
// feuilles de route). Rien pour une tournée : c'est le cas courant, et une
// pastille sur chaque ligne ne distinguerait plus rien.
function pastilleProjetHtml(projet){
  return estRecording(projet) ? '<span class="co-pastille-projet">Recording</span>' : '';
}

// Même repère, en texte brut, pour les endroits où le HTML ne s'affiche pas :
// une <option> de liste déroulante, un export texte, un message WhatsApp.
function suffixeProjetTexte(projet){
  return estRecording(projet) ? ' · Recording' : '';
}

// ============================================================================
// Titulaire de quoi ?
//
// Deux questions se cachaient derrière un seul mot :
//   · qui fait partie du NOYAU de l'orchestre — celles et ceux à qui l'on
//     demande ses dispos d'office, sur toutes les opérations ;
//   · qui TIENT LE POSTE sur un projet donné, par opposition à qui vient en
//     remplacement.
//
// La première est une propriété de la personne (musiciens.statut_poste). La
// seconde appartient au couple (personne, projet), et vit donc sur la demande
// de dispo. Quelqu'un peut parfaitement tenir le poste sur une tournée sans
// appartenir au noyau : on a besoin de ses dispos là, et nulle part ailleurs.
// ============================================================================

// Fait-elle partie du noyau — donc sollicitée d'office sur tous les projets ?
function estDuNoyau(personne){
  return !!personne && (personne.statutPoste || 'titulaire') === 'titulaire';
}

// Rôle sur UN projet : celui inscrit sur la demande s'il y en a un, sinon on
// s'en remet au statut global (les demandes créées avant cette distinction
// n'en portent pas).
function roleSurProjet(demande, personne){
  const r = demande && demande.role;
  if(r === 'titulaire' || r === 'remplacant') return r;
  return estDuNoyau(personne) ? 'titulaire' : 'remplacant';
}

function libelleRoleProjet(role){
  return role === 'remplacant' ? 'Remplaçant·e' : 'Titulaire';
}

// ============================================================================
// Le minimum d'une fiche sociale exploitable.
//
// Coordonnées + identité civile de base : de quoi établir un contrat. Le reste
// (RIB, n° sécu, contact d'urgence…) est conseillé mais pas bloquant — beaucoup
// de gens ne l'ont pas sous la main au premier passage.
//
// Cette liste est lue à deux endroits : mes-infos.html, qui la badge et signale
// ce qui manque au fil de la saisie, et mon-espace.html, qui l'annonce en
// arrivant. La fonction SQL mes_demandes_dispo renvoie un booléen par clé — les
// trois doivent parler des mêmes champs, d'où cette source unique.
//
// source : 'person' = fiche d'annuaire (musiciens/techniciens), 'info' = fiche
// sociale (infos_sociales).
// ============================================================================
const CURIEUX_INFOS_REQUISES = [
  { key:'telephone',     label:'Téléphone',           source:'person' },
  { key:'email',         label:'Email',               source:'person' },
  { key:'genre',         label:'Genre',               source:'info' },
  { key:'dateNaissance', label:'Date de naissance',   source:'info' },
  { key:'lieuNaissance', label:'Ville de naissance',  source:'info' },
  { key:'nationalite',   label:'Nationalité',         source:'info' },
  { key:'adresse',       label:'Adresse postale',     source:'info' },
];

// Les libellés de ce qui manque, à partir des booléens rendus par
// mes_demandes_dispo ({ telephone:true, adresse:false, … }).
function infosRequisesManquantes(remplies){
  const r = remplies || {};
  return CURIEUX_INFOS_REQUISES.filter(f=> !r[f.key]).map(f=> f.label);
}

// ============================================================================
// Parse d'une liste collée depuis une messagerie (WhatsApp, mail, notes).
//
// Le format qu'on reçoit vraiment n'est pas un tableau : c'est un fil de
// discussion recopié. Des titres d'instrument avec « (rempla Untel) », des
// puces truffées de caractères invisibles, des téléphones dans quatre
// graphies, des emails seuls sur leur ligne, des remarques entre parenthèses,
// des noms de famille en capitales. Ce parseur lit tout cela ; la modale
// d'aperçu reste le filet de sécurité — rien ne s'importe sans relecture.
//
// Retourne null si le texte ne ressemble pas à ce format (aucun titre de
// section reconnu), pour laisser leur chance aux deux autres parseurs.
// ============================================================================
function parseListeMessageriePaste(text){
  if(!text || text.includes('\t')) return null;          // un tableau a son parseur

  // Caractères invisibles des messageries : gluons (U+2060), espaces sans
  // chasse (U+200B/U+FEFF), espaces insécables — la puce « •⁠  ⁠» en est pleine.
  const nettoyer = (l)=> l
    .replace(/[⁠​﻿‎‏]/g, '')
    .replace(/ /g, ' ')
    .replace(/^[\s]*(?:[•·▪◦*–—-]|\d{1,2}[.)])\s*/, '')  // puces et numérotation
    .replace(/\s+/g, ' ')
    .trim();

  const TEL = /(?:\+33[\s.\-]?|0)\s*[1-9](?:[\s.\-]?\d{2}){4}/;
  const EMAIL = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/;

  // « Violon solo (rempla Roxanne Rabatti) : » — avec ou sans deux-points.
  const enteteRempla = /^(.{2,60}?)\s*\(\s*rempla[a-zç]*\.?\s+([^)]+?)\s*\)\s*:?\s*$/i;
  // « Piano: » — un mot ou deux suivis d'un deux-points, sans téléphone ni email.
  const enteteSimple = /^([A-Za-zÀ-ÿ'’ \-\/]{2,40}?)\s*:\s*$/;

  const lignes = text.split('\n').map(nettoyer);
  if(!lignes.some(l=> enteteRempla.test(l) || enteteSimple.test(l))) return null;

  const rows = [];
  const ignorees = [];
  let section = '';
  let remplaDe = '';
  let auMoinsUnRempla = false;
  let derniere = null;                                    // pour les lignes de suite

  const normaliserTel = (brut)=>{
    let d = brut.replace(/[^\d+]/g, '');
    if(d.startsWith('+33')) d = '0' + d.slice(3);
    if(d.length !== 10) return brut.trim();               // format inattendu : tel quel
    return d.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  };
  // BESTAUTTE → Bestautte, mais « Le Meur » et les traits d'union survivent.
  const casserLesCapitales = (mot)=> mot.length > 1 && mot === mot.toUpperCase() && /[A-ZÀ-Ý]/.test(mot)
    ? mot.split('-').map(p=> p.charAt(0) + p.slice(1).toLowerCase()).join('-')
    : mot;

  for(const ligne of lignes){
    if(!ligne) continue;

    const mRempla = ligne.match(enteteRempla);
    if(mRempla){
      section = mRempla[1].trim();
      remplaDe = mRempla[2].trim();
      auMoinsUnRempla = true;
      derniere = null;
      continue;
    }
    const mSimple = ligne.match(enteteSimple);
    if(mSimple && !TEL.test(ligne) && !EMAIL.test(ligne)){
      section = mSimple[1].trim();
      remplaDe = '';
      derniere = null;
      continue;
    }

    // Un titre général avant toute section (« CONSTELLATION CURIEUX ») : tout
    // en capitales, pas de contact — on l'écarte en le disant.
    if(!section && ligne === ligne.toUpperCase() && !TEL.test(ligne) && !EMAIL.test(ligne)){
      ignorees.push(ligne);
      continue;
    }

    // Démontage de la ligne : notes entre parenthèses, téléphone, email.
    let reste = ligne;
    const notes = [];
    reste = reste.replace(/\(([^)]*)\)/g, (_, dedans)=>{ notes.push(dedans.trim()); return ' '; });
    let tel = '';
    const mTelNote = notes.join(' ').match(TEL);          // « (Intercon +33 6…) »
    reste = reste.replace(TEL, (m)=>{ tel = normaliserTel(m); return ' '; });
    if(!tel && mTelNote) tel = normaliserTel(mTelNote[0]);
    const notesSansTel = notes.map(n=> n.replace(TEL, '').replace(/\s+/g,' ').trim()).filter(Boolean);
    let email = '';
    reste = reste.replace(EMAIL, (m)=>{ email = m; return ' '; });
    const nomBrut = reste.replace(/[\s\-–—:]+$/g, '').replace(/^[\s\-–—:]+/g, '').replace(/\s+/g, ' ').trim();

    // Ligne sans nom : elle complète la personne du dessus (email seul,
    // téléphone seul, remarque seule).
    if(!nomBrut){
      if(derniere){
        if(tel && !derniere.telephone) derniere.telephone = tel;
        if(email && !derniere.email) derniere.email = email;
        if(notesSansTel.length) derniere.notes = [derniere.notes, ...notesSansTel].filter(Boolean).join(' · ');
      } else if(tel || email || notesSansTel.length){
        ignorees.push(ligne);
      }
      continue;
    }

    // Prénom / nom : les mots tout en capitales font le nom de famille ;
    // sinon, premier mot prénom, le reste nom.
    const mots = nomBrut.split(' ');
    const caps = mots.filter(m=> m.length > 1 && m === m.toUpperCase() && /[A-ZÀ-Ý]/.test(m));
    let prenom, nom;
    if(caps.length && caps.length < mots.length){
      nom = caps.map(casserLesCapitales).join(' ');
      prenom = mots.filter(m=> !caps.includes(m)).join(' ');
    } else {
      prenom = mots[0];
      nom = mots.slice(1).map(casserLesCapitales).join(' ');
    }

    derniere = {
      prenom, nom,
      field3: section,
      remplaDe,
      telephone: tel, email,
      notes: notesSansTel.join(' · '),
    };
    rows.push(derniere);
  }

  if(!rows.length) return null;
  const statutDefaut = auMoinsUnRempla ? 'remplacant' : 'titulaire';
  rows.forEach(r=>{ r.statutPoste = statutDefaut; });
  return { rows, ignorees };
}
