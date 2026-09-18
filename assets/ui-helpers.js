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

// ============================================================================
// Où l'orchestre est chez lui.
//
// Un bloc de dates annonçait un départ la veille et un retour le lendemain,
// quelle que soit la ville. Pour des répétitions en région parisienne, c'est
// faux : on vient le matin et on rentre le soir. La liste des villes de base
// (réglages) dit où c'est le cas ; une date qui s'y déroule naît sans transport.
//
// Comparaison sans casse ni accents : « Saint-Denis » et « saint denis » sont
// le même endroit, et personne ne saisit deux fois pareil.
// ============================================================================
let CURIEUX_VILLES_BASE = [];
function poserVillesBase(liste){
  CURIEUX_VILLES_BASE = (liste || []).map(normaliserVille).filter(Boolean);
}
function normaliserVille(v){
  return (v || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function estVilleDeBase(ville){
  const v = normaliserVille(ville);
  return !!v && CURIEUX_VILLES_BASE.includes(v);
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
/* ============================================================================
   Demander ses dispos à quelqu'un, hors du circuit d'office
   ============================================================================
   Le moteur est celui du bloc « Ajouter quelqu'un à ce projet » de
   suivi-dispo : une demande limitée aux dates cochées. Ce qui manquait, c'est
   de pouvoir le faire d'où l'on part — d'une fiche d'annuaire — sans traverser
   trois pages. Écrit ici, et non dans chaque annuaire, pour n'avoir qu'une
   implémentation à corriger.

   La personne n'est pas prévenue par cette action : c'est le bouton
   « Relancer » de Demandes titulaires qui porte le message, et lui seul.
============================================================================ */
async function curieuxDemanderDispos({ personne, personType, projets, demandes, apres, projetId, datesCochees }){
  const aVenir = new Date().toISOString().slice(0, 10);
  // Seuls les projets qui ont encore une date à répondre : proposer une
  // tournée finie n'aurait aucun sens.
  const candidats = (projets || []).filter(t=>
    (t.dates || []).some(d=> d.date && d.date >= aVenir && d.statut !== 'annulee'));
  if(!candidats.length){
    alert("Aucun projet à venir n'a de date à proposer.");
    return;
  }

  const nom = fullName(personne);
  const ancien = document.getElementById('curieuxDemandeOverlay');
  if(ancien) ancien.remove();

  const ov = document.createElement('div');
  ov.id = 'curieuxDemandeOverlay';
  ov.style.cssText = 'position:fixed; inset:0; background:rgba(20,22,23,.55); display:grid; place-items:center; z-index:200; padding:20px;';
  ov.innerHTML = `
    <div style="background:var(--card); border:1px solid var(--border); border-radius:var(--radius-lg, 22px); padding:24px 26px; max-width:520px; width:100%; max-height:85vh; overflow:auto;">
      <h2 style="font-family:var(--font-display); font-size:21px; font-weight:500; color:var(--accent); margin:0 0 4px;">Demander ses dispos</h2>
      <p style="font-size:13px; color:var(--muted); margin:0 0 16px;">À ${escapeHtml(nom)}, sur les dates de ton choix. Son lien personnel lui montrera ce projet.</p>
      <label style="display:block; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); margin-bottom:4px;">Projet</label>
      <select id="cdProjet" style="width:100%; padding:9px 11px; border:1px solid var(--border); border-radius:8px; font-size:13.5px; background:var(--card); color:var(--text); font-family:inherit; margin-bottom:14px;">
        ${candidats.map(t=> `<option value="${escapeAttr(t.id)}"${t.id === projetId ? ' selected' : ''}>${escapeHtml((t.nom || 'Sans nom') + suffixeProjetTexte(t))}</option>`).join('')}
      </select>
      <div id="cdEtat" style="font-size:12.5px; margin-bottom:8px;"></div>
      <label style="display:block; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); margin-bottom:4px;">Dates proposées</label>
      <div id="cdDates" style="border:1px solid var(--border); border-radius:8px; padding:8px 10px; max-height:220px; overflow:auto;"></div>
      <div style="display:flex; gap:8px; margin-top:16px; flex-wrap:wrap;">
        <button type="button" class="co-btn ghost sm" id="cdTout">Tout (dé)cocher</button>
        ${/* margin-left:auto plutôt qu'une cale élastique : sur téléphone la
             rangée passe à la ligne, et les deux boutons de décision restent
             ensemble à droite au lieu de se retrouver séparés. */''}
        <button type="button" class="co-btn ghost md" id="cdAnnuler" style="margin-left:auto;">Annuler</button>
        <button type="button" class="co-btn primary md" id="cdOk">Demander</button>
      </div>
    </div>`;
  document.body.appendChild(ov);

  // Cases pré-cochées : ce qui vient de l'appelant — la case grisée sur
  // laquelle on a cliqué. Une seule fois, sinon changer de projet et revenir
  // recocherait ce que l'on vient de décocher.
  let precoche = new Set(datesCochees || []);

  const selProjet = ov.querySelector('#cdProjet');
  const boiteDates = ov.querySelector('#cdDates');
  const etat = ov.querySelector('#cdEtat');

  function demandeExistante(){
    return (demandes || []).find(d=> d.tourneeId === selProjet.value
      && d.personType === personType && d.personId === personne.id);
  }
  function peindre(){
    const t = candidats.find(x=> x.id === selProjet.value);
    const dates = (t.dates || []).filter(d=> d.date && d.date >= aVenir && d.statut !== 'annulee')
      .sort((a, b)=> a.date.localeCompare(b.date));
    const dem = demandeExistante();
    const dejaToutes = dem && !(dem.dates && dem.dates.length);
    const deja = new Set((dem && dem.dates) || []);
    etat.innerHTML = !dem ? ''
      : (dejaToutes
        ? `<span class="co-pill ok">Déjà sollicité·e sur tout ce projet</span>`
        : `<span class="co-pill att">Déjà sollicité·e sur ${deja.size} date${deja.size > 1 ? 's' : ''}</span> <span style="color:var(--muted);">— cocher en ajoute.</span>`);
    boiteDates.innerHTML = dates.map(d=> `
      <label style="display:flex; align-items:flex-start; gap:9px; padding:5px 2px; font-size:13px; line-height:1.45; ${deja.has(d.id) || dejaToutes ? 'opacity:.55;' : ''}">
        <input type="checkbox" value="${escapeAttr(d.id)}" ${deja.has(d.id) || dejaToutes ? 'checked disabled' : (precoche.has(d.id) ? 'checked' : '')}
          style="width:16px; height:16px; margin-top:2px; flex-shrink:0; accent-color:var(--accent);">
        <span><b>${escapeHtml(new Date(d.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday:'short', day:'2-digit', month:'short' }))}</b>
        ${d.ville ? ' · ' + escapeHtml(d.ville) : ''}${d.lieu ? ' <span style="color:var(--muted);">' + escapeHtml(d.lieu) + '</span>' : ''}
        ${deja.has(d.id) || dejaToutes ? ' <span style="color:var(--muted); font-size:11.5px;">(déjà demandée)</span>' : ''}</span>
      </label>`).join('') || '<div style="color:var(--muted); font-size:13px; padding:6px 2px;">Aucune date à venir sur ce projet.</div>';
  }
  selProjet.addEventListener('change', peindre);
  peindre();
  precoche = new Set();

  ov.querySelector('#cdTout').addEventListener('click', ()=>{
    const libres = [...boiteDates.querySelectorAll('input:not(:disabled)')];
    const cible = !libres.every(c=> c.checked);
    libres.forEach(c=> c.checked = cible);
  });
  const fermer = ()=> ov.remove();
  ov.querySelector('#cdAnnuler').addEventListener('click', fermer);
  ov.addEventListener('click', (e)=>{ if(e.target === ov) fermer(); });

  ov.querySelector('#cdOk').addEventListener('click', async ()=>{
    const btn = ov.querySelector('#cdOk');
    const choisies = [...boiteDates.querySelectorAll('input:not(:disabled):checked')].map(c=> c.value);
    if(!choisies.length){
      alert('Aucune date cochée — rien à demander.');
      return;
    }
    btn.disabled = true; btn.textContent = 'Envoi…';
    const res = await curieuxPoserDemandeDispo({
      tourneeId: selProjet.value, personType, personId: personne.id,
      dateIds: choisies, demandes,
    });
    if(res.error){
      alert("La demande n'a pas pu être enregistrée :\n\n" + res.error.message);
      btn.disabled = false; btn.textContent = 'Demander';
      return;
    }
    fermer();
    curieuxFlash(`Dispos demandées à ${nom} — ${choisies.length} date${choisies.length > 1 ? 's' : ''}.`);
    if(typeof apres === 'function') apres(res.demande);
  });
}

/* Un mot qui passe. Le codebase n'avait qu'alert() pour dire « c'est fait »,
 * ce qui oblige à cliquer pour accuser réception d'une bonne nouvelle. Les
 * ennuis gardent alert(), les réussites passent par ici.
 */
function curieuxFlash(message){
  let hote = document.getElementById('curieuxFlash');
  if(!hote){
    hote = document.createElement('div');
    hote.id = 'curieuxFlash';
    hote.style.cssText = 'position:fixed; left:50%; bottom:26px; transform:translateX(-50%); z-index:300; display:grid; gap:8px; justify-items:center; pointer-events:none;';
    document.body.appendChild(hote);
  }
  const mot = document.createElement('div');
  mot.textContent = message;
  mot.style.cssText = 'background:var(--text, #16181a); color:var(--card, #fff); padding:10px 16px; border-radius:999px; font-size:13.5px; font-weight:600; box-shadow:0 6px 20px rgba(0,0,0,.22); opacity:0; transition:opacity .18s ease, transform .18s ease; transform:translateY(6px);';
  hote.appendChild(mot);
  requestAnimationFrame(()=>{ mot.style.opacity = '1'; mot.style.transform = 'translateY(0)'; });
  setTimeout(()=>{
    mot.style.opacity = '0'; mot.style.transform = 'translateY(6px)';
    setTimeout(()=> mot.remove(), 250);
  }, 3200);
}

/* Créer ou étendre la demande — le cœur, sans interface, pour que la Vue
 * d'ensemble puisse l'appeler d'un simple clic sur une case grisée.
 *
 * Une demande dont les dates sont vides vaut pour TOUT le projet : on ne la
 * restreint jamais en y ajoutant une date, ce serait retirer un droit en
 * croyant en donner un.
 */
async function curieuxPoserDemandeDispo({ tourneeId, personType, personId, dateIds, demandes }){
  // Le jeton permanent d'abord : sans lui, la personne n'a aucun moyen de
  // répondre à ce qu'on vient de lui demander.
  try{ await CurieuxDB.ensureAccesPersonnel(personId, personType); }catch(e){}
  const liste = demandes || [];
  const existante = liste.find(d=> d.tourneeId === tourneeId
    && d.personType === personType && d.personId === personId);
  if(existante){
    if(!(existante.dates && existante.dates.length)) return { error: null, demande: existante };
    const fusion = [...new Set(existante.dates.concat(dateIds))];
    existante.dates = fusion;
    const { error } = await CurieuxDB.upsertOne('dispo_demandes', existante);
    return { error, demande: existante };
  }
  const entree = { id: genId('demande'), tourneeId, personType, personId, dates: dateIds, role: null };
  const { error } = await CurieuxDB.upsertOne('dispo_demandes', entree);
  if(!error) liste.push(entree);
  return { error, demande: entree };
}

/* ============================================================================
   Revenir à son espace, depuis n'importe quelle page personnelle
   ============================================================================
   Les pages qu'un·e musicien·ne ouvre par son lien — ses dispos, ses infos,
   ses remplaçant·es — n'ont pas de menu : ce sont des pages publiques, sans
   compte. Deux d'entre elles portaient un petit lien gris sous le logo, la
   troisième rien du tout, et il fallait dans tous les cas remonter tout en
   haut d'un formulaire de trente dates pour le trouver.

   Un seul bouton, posé ici pour les quatre pages à la fois, et qui suit le
   défilement. Il ne s'affiche que sur un lien personnel (?token=) et jamais
   sur l'espace lui-même — on n'y revient pas quand on y est.

   Le jeton est repris tel quel de l'URL courante : c'est lui, et lui seul,
   qui identifie la personne d'une page à l'autre.
============================================================================ */
function injecterRetourEspace(){
  if(typeof document === 'undefined') return;
  if(!document.body){
    document.addEventListener('DOMContentLoaded', injecterRetourEspace);
    return;
  }
  if(document.getElementById('curieuxRetourEspace')) return;
  const page = (location.pathname.split('/').pop() || '').replace(/\.html$/, '');
  if(page === 'mon-espace') return;
  const jeton = new URLSearchParams(location.search).get('token');
  if(!jeton) return;

  const hote = document.querySelector('.wrap') || document.body;
  const lien = document.createElement('a');
  lien.id = 'curieuxRetourEspace';
  lien.href = 'mon-espace.html?token=' + encodeURIComponent(jeton);
  lien.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" style="flex-shrink:0;">'
    + '<path d="M11 5.5 4.5 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>'
    + '<line x1="5.5" y1="12" x2="19.5" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line>'
    + '</svg><span>Mon espace</span>';
  lien.style.cssText = 'position:sticky; top:8px; z-index:15; display:flex; width:max-content;'
    + ' align-items:center; gap:7px; margin:-6px 0 18px; padding:9px 15px; border-radius:999px;'
    + ' background:var(--card,#fff); color:var(--accent-dark,#5a1037); border:1.5px solid var(--border,#f0dbe6);'
    + ' font-size:13px; font-weight:800; text-decoration:none; font-family:inherit;'
    + ' box-shadow:0 4px 14px rgba(20,15,10,.10);';
  lien.addEventListener('mouseenter', ()=>{ lien.style.borderColor = 'var(--accent,#791649)'; });
  lien.addEventListener('mouseleave', ()=>{ lien.style.borderColor = 'var(--border,#f0dbe6)'; });

  // Sous le logo quand il y en a un : « ← Mon espace » se lit là où l'œil
  // cherche déjà de quel site il s'agit.
  const logo = hote.querySelector('.brand-logo-img');
  if(logo && logo.parentElement === hote) hote.insertBefore(lien, logo.nextSibling);
  else hote.insertBefore(lien, hote.firstChild);
}
injecterRetourEspace();

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
    { href:'suivi-dispo.html',    icone:'icone-demandes-titulaires.svg',   libelle:'Demandes titulaires' },
    { href:'recap.html',          icone:'icone-disponibilites.svg',        libelle:'Tableau de service' },
  ]},
  { type:'groupe', libelle:'Direction technique', entrees:[
    { href:'technique-taches.html',   icone:'icone-technique-avancement.svg', libelle:'Tableau de bord' },
    { href:'technique.html',          icone:'icone-technique-avancement.svg', libelle:'Avancement par date' },
    { href:'salles.html',             icone:'icone-technique-fiches.svg',     libelle:'Salles' },
    { href:'materiel.html',           icone:'icone-technique-materiel.svg',   libelle:'Matériel' },
    { href:'vehicules.html',          icone:'icone-technique-vehicules.svg',  libelle:'Véhicules & chauffeurs' },
    { href:'fiches-techniques.html',  icone:'icone-technique-fiches.svg',     libelle:'Fiches techniques' },
    { href:'partage.html',            icone:'icone-technique-partage.svg',    libelle:'Partage' },
  ]},
  { type:'lien', href:'recap.html', icone:'icone-vue-ensemble.svg', libelle:'Tableau de service' },
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
  // Un panneau déplié au clic — les dates à cocher de Demandes titulaires, par
  // exemple — est aussi fragile qu'une fenêtre modale. Sans cette ligne, un
  // rendu mis en attente pendant la frappe se déclenchait au premier clic qui
  // suit (voir l'écouteur plus bas) et refermait le panneau à l'instant même
  // où il s'ouvrait. La page qui l'ouvre pose l'attribut, et le retire en le
  // refermant.
  try{ if(document.querySelector('[data-panneau-ouvert]')) return true; }catch(e){}
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

/* L'ordre de l'orchestre.
 *
 * L'annuaire posait déjà cette règle et l'expliquait : « on classe par pupitre
 * (ordre de l'orchestre, pas alphabétique) ». Les pages de disponibilités,
 * elles, triaient par ordre alphabétique — on y cherchait donc un pupitre
 * entier en sautant de ligne en ligne, alors que la règle existait à côté.
 *
 * Elle vit ici pour que les deux la partagent. Le rang inconnu passe en fin de
 * liste plutôt qu'en tête : une personne sans pupitre renseigné ne doit pas
 * ouvrir le tableau.
 */
// « Chant » : des chanteur·euses s'engagent sur certaines tournées, à un cachet
// qui n'est pas celui de l'orchestre. Le pupitre est facultatif par nature
// (une nomenclature ne le porte que si on l'y ajoute) ; il se place avant
// « Autre » pour que les voix ne se retrouvent pas dans le fourre-tout.
//
// Cette liste est LA référence : les selects de l'annuaire et de la
// nomenclature en dérivent (voir curieuxOptionsPupitreHtml), après qu'on a
// retrouvé cinq copies en dur qui ne se connaissaient pas.
const CURIEUX_PUPITRES = ["Chef d'orchestre", 'Cordes', 'Bois', 'Cuivres', 'Percussions', 'Chant', 'Autre'];

function curieuxRangPupitre(personne){
  const i = CURIEUX_PUPITRES.indexOf((personne && personne.pupitre) || 'Autre');
  return i === -1 ? 99 : i;
}

/* Les <option> d'un select de pupitre, avec la valeur courante sélectionnée.
 *
 * Tolérant à une valeur hors liste : la base n'impose rien sur
 * musiciens.pupitre, et le jeu de démo comme d'anciennes fiches portent
 * « Piano » ou « Chef ». Un select qui ne connaît pas la valeur affiche sa
 * première option, et la prochaine sauvegarde réécrit la fiche avec — c'est
 * ainsi que des fiches se retrouvaient rétrogradées en « Autre » (ou en
 * « Chef d'orchestre » dans une nomenclature) pour avoir été ouvertes. On
 * ajoute donc une option ad hoc, sélectionnée, plutôt que de perdre la valeur.
 */
function curieuxOptionsPupitreHtml(valeur){
  const v = valeur == null ? '' : String(valeur);
  const liste = v && !CURIEUX_PUPITRES.includes(v) ? [...CURIEUX_PUPITRES, v] : CURIEUX_PUPITRES;
  return liste.map(p=> `<option value="${escapeAttr(p)}"${p === v ? ' selected' : ''}>${escapeHtml(p)}</option>`).join('');
}

/* La position dans le pupitre (musiciens.rang) : « 1 », « 2 », « solo »,
 * « tutti ». Un texte court, pas un entier — « solo » n'est pas un nombre et
 * c'est pourtant la première place. Comparaison numérique quand les deux le
 * sont (« 2 » avant « 10 »), et la position vide en dernier : qui n'en a pas
 * ne doit pas ouvrir le pupitre. */
function curieuxCompareRang(a, b){
  const ra = a == null ? '' : String(a).trim(), rb = b == null ? '' : String(b).trim();
  if(ra === rb) return 0;
  if(!ra) return 1;
  if(!rb) return -1;
  return ra.localeCompare(rb, 'fr', { numeric: true, sensitivity: 'base' });
}

/* Pupitre, instrument, position, puis nom : l'ordre d'une nomenclature.
 * Les technicien·nes n'ont pas de pupitre mais un pôle, pour lequel aucun
 * ordre de métier n'est établi : elles et ils restent donc classé·es par pôle
 * alphabétique, ce qui les regroupe déjà — c'est le seul point où cette
 * fonction ne fait pas ce que son nom promet, et c'est voulu. */
function curieuxComparePupitrePuisNom(a, b){
  // Seulement si l'un des deux a un pupitre : sinon (deux technicien·nes) ce
  // rang vaudrait « Autre » pour tout le monde et n'apprendrait rien.
  if(((a && a.pupitre) || '') || ((b && b.pupitre) || '')){
    const ia = curieuxRangPupitre(a), ib = curieuxRangPupitre(b);
    if(ia !== ib) return ia - ib;
    // numeric : « Violon 2 » avant « Violon 10 », si l'instrument porte lui-même
    // un numéro.
    const instA = (a && a.instrument) || '', instB = (b && b.instrument) || '';
    const ci = instA.localeCompare(instB, 'fr', { numeric: true, sensitivity: 'base' });
    if(ci !== 0) return ci;
    const cr = curieuxCompareRang(a && a.rang, b && b.rang);
    if(cr !== 0) return cr;
  }
  const polA = (a && a.pole) || '', polB = (b && b.pole) || '';
  if(polA !== polB) return polA.localeCompare(polB, 'fr');
  return fullName(a).localeCompare(fullName(b), 'fr');
}

/* Le cachet d'une personne sur une tournée, et d'où il vient.
 *
 * Trois étages, du plus particulier au plus général :
 *   1. l'exception individuelle (table cachet_overrides) ;
 *   2. le cachet propre à sa ligne de nomenclature — {pupitre, nombre, cachet},
 *      le champ cachet étant facultatif : c'est ainsi qu'une tournée paie ses
 *      chanteur·euses à part sans une exception par personne ;
 *   3. le cachet standard de la tournée (cachetStatut/cachetMontant).
 *
 * Écrit une seule fois, ici, parce que trois écrans le lisaient chacun à sa
 * façon : le devis (qui ignorait tout sauf le standard), le rappel du projet
 * dans l'éditeur, et le lien personnel — qui, lui, ne reçoit l'exception que
 * par sa RPC à jeton et la passe en troisième argument.
 *
 * `tournee` est l'objet camelCase de l'adaptateur. Rend { montant, source }
 * avec source ∈ 'individuel' | 'pupitre' | 'standard' | null (montant null).
 */
function curieuxCachetPupitre(tournee, pupitre){
  const ligne = ((tournee && tournee.nomenclature) || []).find(r=>
    r && r.pupitre === pupitre && r.cachet != null && r.cachet !== '' && Number.isFinite(Number(r.cachet)));
  return ligne ? Number(ligne.cachet) : null;
}
/* Le cachet qui s'applique, du plus précis au plus général.
   ---------------------------------------------------------------------------
   Quatre niveaux, et l'ordre n'est pas négociable — c'est lui qui décide ce
   qu'on paie :

     1. individuel — négocié avec UNE personne (cachet_overrides). Il porte sur
        le service, quel qu'il soit : « toi, c'est tant » ne cesse pas d'être
        vrai un jour de répétition.
     2. pupitre    — le chant, un·e soliste : une exception de poste. Ne
        concerne que l'orchestre : un·e technicien·ne n'a pas de pupitre, ce
        niveau est sauté pour elle ou lui.
     3. LA DATE    — le montant propre à cette journée-là (`cachetSeance`).
        C'est le niveau qui manquait aux tournées : une répétition et un
        concert du même projet ne se paient pas pareil, et il fallait jusqu'ici
        soit un seul montant pour tout, soit découper le projet en deux — ce
        qui aurait dédoublé l'équipe, la nomenclature, les demandes de dispo et
        les liens envoyés aux musicien·nes, pour une question d'argent.
        NIVEAU D'ORCHESTRE, comme le pupitre : le panneau de la tournée n'a
        qu'un champ par date, saisi en cachets, à côté du seul standard des
        musicien·nes. Le servir au pôle technique lui annonçait le prix d'un
        cachet de répétition.
     4. standard   — le montant du projet, pour les dates qui n'ont rien dit.
        IL Y EN A DEUX : celui de l'orchestre et celui du pôle technique. Un
        régisseur n'est pas payé au cachet d'un violon, et lui servir le
        montant des musicien·nes — ce que faisait cette fonction — annonçait un
        prix faux à trente-huit personnes.

   `date` est facultatif : les appels qui ne parlent pas d'une date précise —
   un bandeau de projet, un devis — gardent exactement le comportement d'avant.
   `pourTechnicien` l'est aussi : sans lui, c'est l'orchestre, comme avant.
--------------------------------------------------------------------------- */
function curieuxCachetResolu(tournee, pupitre, override, date, pourTechnicien){
  if(override != null && override !== '' && Number.isFinite(Number(override))){
    return { montant: Number(override), source: 'individuel' };
  }
  // Les deux niveaux du milieu sont ceux de l'ORCHESTRE, et d'elle seule : le
  // cachet d'un pupitre, comme le montant propre à une date, se saisissent
  // dans la colonne des musicien·nes et valent en cachets. Un·e technicien·ne
  // les saute tous les deux et tombe sur son propre standard — sans quoi une
  // répétition payée 120 € aux musicien·nes annoncerait 120 € au régisseur.
  if(!pourTechnicien){
    const duPupitre = curieuxCachetPupitre(tournee, pupitre);
    if(duPupitre != null) return { montant: duPupitre, source: 'pupitre' };
    const deLaDate = curieuxCachetDate(date);
    if(deLaDate != null) return { montant: deLaDate, source: 'date' };
  }
  const statut = pourTechnicien ? (tournee && tournee.cachetTechnicienStatut) : (tournee && tournee.cachetStatut);
  const montant = pourTechnicien ? (tournee && tournee.cachetTechnicienMontant) : (tournee && tournee.cachetMontant);
  if(statut === 'defini' && montant != null && montant !== '' && Number.isFinite(Number(montant))){
    return { montant: Number(montant), source: 'standard' };
  }
  return { montant: null, source: null };
}

// Le montant propre à une date, ou null. Un seul endroit lit ce champ, pour que
// « vide » veuille dire la même chose partout : ni 0, ni NaN, ni chaîne vide.
function curieuxCachetDate(date){
  if(!date) return null;
  const v = date.cachetSeance;
  if(v == null || v === '' || !Number.isFinite(Number(v))) return null;
  return Number(v);
}

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
