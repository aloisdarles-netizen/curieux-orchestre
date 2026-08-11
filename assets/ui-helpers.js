// Petites fonctions utilitaires partagées par toutes les pages — HTML/dates/menu de nav.
// Chargé après brand-assets.js et avant le <script> de chaque page.
// Volontairement PAS de formateurs de date ici : plusieurs pages leur donnaient le même nom
// (fmtDateFR, fmtDateFRLong...) pour des rendus différents (avec/sans année, mois abrégé ou
// non) — les fusionner risquait de changer silencieusement l'affichage de certaines pages.
// Chaque page garde donc ses propres formateurs de date.

function escapeHtml(str){ return (str||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escapeAttr(str){ return escapeHtml(str); }
function fullName(p){ return [p.prenom, p.nom].filter(Boolean).join(' ') || 'Sans nom'; }
function genId(prefix){ return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

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
  document.querySelectorAll('.nav-group-btn').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const group = btn.closest('.nav-group');
      const wasOpen = group.classList.contains('open');
      document.querySelectorAll('.nav-group.open').forEach(g=> g.classList.remove('open'));
      if(!wasOpen) group.classList.add('open');
    });
  });
  document.addEventListener('click', ()=> document.querySelectorAll('.nav-group.open').forEach(g=> g.classList.remove('open')));
}
