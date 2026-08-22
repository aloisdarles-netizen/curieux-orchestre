/* ============================================================================
 * studio-commun.js — ce que partagent l'affichage mural (studio.html) et la
 * page de réservation (studio-reserver.html) du studio.
 *
 * La donnée vient du tableur Google (source de vérité partagée avec le studio
 * et les autres loueurs), exposé par outils/studio-apps-script.gs et relayé
 * par /api/studio. Le jeton d'accès voyage dans l'URL de la page
 * (…?jeton=XXX) et repart en en-tête vers l'API.
 *
 * « ?jeton=demo » sert un planning de démonstration sans toucher au réseau :
 * pour montrer la page, la capturer, ou la tester avant la mise en place du
 * script côté tableur.
 * ========================================================================== */

'use strict';

const NOM_NOUS = 'Curieux & Friends';

const JOURS_FR = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
const MOIS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
                 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

const CRENEAUX_VIDES = [
  { cle: 'matin', libelle: '8h30 – 13h30', nom: '', statut: '', remarque: '' },
  { cle: 'apresmidi', libelle: '13h30 – 18h30', nom: '', statut: '', remarque: '' },
  { cle: 'soir', libelle: '18h30 – 21h30', nom: '', statut: '', remarque: '' },
];

function jetonStudio(){
  return new URLSearchParams(location.search).get('jeton') || '';
}

function isoDe(date){
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}
function isoDuJour(){ return isoDe(new Date()); }

function escapeHtmlStudio(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* Jeu de démonstration : trois semaines plausibles, avec nos créneaux, ceux
 * d'autres loueurs, et des vacants — de quoi juger les deux pages. */
function planningDemo(nbJours){
  const occupations = {
    2:  [['matin', NOM_NOUS, 'Répétition cordes'], ['apresmidi', NOM_NOUS, '']],
    3:  [['apresmidi', 'Arpeggio', 'Clip Theo Ould']],
    5:  [['matin', 'Le Philtre', ''], ['apresmidi', 'Le Philtre', ''], ['soir', 'Le Philtre', '']],
    8:  [['soir', NOM_NOUS, 'Filage']],
    9:  [['matin', 'Travaux', 'Intervention fibre']],
    12: [['matin', NOM_NOUS, ''], ['apresmidi', NOM_NOUS, ''], ['soir', NOM_NOUS, 'Enregistrement']],
    15: [['apresmidi', 'Arpeggio', '']],
  };
  const jours = [];
  const base = new Date(); base.setHours(12, 0, 0, 0);
  for(let i = 0; i < nbJours; i++){
    const date = new Date(base); date.setDate(base.getDate() + i);
    const creneaux = CRENEAUX_VIDES.map(c=> ({ ...c }));
    (occupations[i] || []).forEach(([cle, nom, remarque])=>{
      const c = creneaux.find(x=> x.cle === cle);
      if(c){ c.nom = nom; c.statut = 'Confirmé'; c.remarque = remarque; }
    });
    jours.push({ date: isoDe(date), jour: JOURS_FR[date.getDay()], creneaux });
  }
  return jours;
}

/* Le planning à partir d'aujourd'hui. Rend la liste des jours, ou lève une
 * erreur au message montrable tel quel. */
async function chargerPlanningStudio(nbJours){
  const jeton = jetonStudio();
  if(jeton === 'demo') return planningDemo(nbJours);
  if(!jeton) throw new Error('Ce lien est incomplet — il lui manque son jeton.');

  const rep = await fetch(`/api/studio?jours=${encodeURIComponent(nbJours)}`, {
    headers: { 'X-Studio-Jeton': jeton },
  });
  const donnees = await rep.json().catch(()=> null);
  if(!rep.ok || !donnees || donnees.ok !== true){
    throw new Error((donnees && donnees.erreur) || 'Le planning est injoignable pour le moment.');
  }
  return donnees.jours || [];
}

/* Réserver ou annuler un créneau. Rend la réponse du tableur telle quelle :
 * { ok:true } ou { ok:false, raison, par }. En démo, répond oui sans réseau. */
async function ecrireCreneauStudio(action, date, creneau, remarque){
  const jeton = jetonStudio();
  if(jeton === 'demo') return { ok: true, demo: true };

  const rep = await fetch('/api/studio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Studio-Jeton': jeton },
    body: JSON.stringify({ action, date, creneau, remarque: remarque || '' }),
  });
  const donnees = await rep.json().catch(()=> null);
  if(!donnees) return { ok: false, raison: 'Le tableur est injoignable.' };
  return donnees;
}
