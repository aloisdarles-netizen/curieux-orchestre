/* ---------------------------------------------------------------------------
   Les salles : les faits, le gabarit, le verdict.
   ---------------------------------------------------------------------------
   Il n'existait pas d'entité « salle » : le lieu était un texte libre posé sur
   une date. Jouer deux fois au même endroit obligeait à ressaisir grill,
   puissance, charge à l'accroche, nature du plateau et contacts — et aucune de
   ces saisies ne profitait à la suivante.

   Une salle vit maintenant pour elle-même. Ce fichier tient la définition
   partagée de ses faits mesurables et la seule question qui compte quand on
   cherche où jouer : est-ce que ça passe ?
--------------------------------------------------------------------------- */

// Les cinq faits qu'on compare. Unité fixe, dite dans l'étiquette : un texte
// libre « 12 m environ » ne se compare pas, et c'est exactement ce qui manquait.
//
// `sens` dit dans quel sens le gabarit se lit :
//   'mini' — la salle doit en avoir AU MOINS autant (grill, puissance, charge)
//   'mini' aussi pour l'ouverture et la profondeur : l'orchestre a besoin de
//   place, il n'y a pas de « trop grand ».
const SALLE_FAITS = [
  { cle:'hauteurGrillM',    gab:'hauteurGrillMin',    label:'Hauteur sous grill', unite:'m',  pas:'0.1', sens:'mini' },
  { cle:'ouvertureSceneM',  gab:'ouvertureSceneMin',  label:'Ouverture de scène', unite:'m',  pas:'0.1', sens:'mini' },
  { cle:'profondeurSceneM', gab:'profondeurSceneMin', label:'Profondeur de scène',unite:'m',  pas:'0.1', sens:'mini' },
  { cle:'puissanceA',       gab:'puissanceMin',       label:'Puissance disponible',unite:'A', pas:'1',   sens:'mini' },
  { cle:'chargeAccrocheKg', gab:'chargeAccrocheMin',  label:'Charge à l’accroche',unite:'kg', pas:'10',  sens:'mini' },
];

function salleFaitTexte(salle, f){
  const v = salle ? salle[f.cle] : null;
  return (v == null || v === '') ? '—' : `${v} ${f.unite}`;
}

// Le nom d'usage d'une salle : ce qu'on écrit sur une feuille de route.
function salleLibelle(s){
  if(!s) return '';
  const nom = s.nom || 'Salle sans nom';
  return s.ville && s.ville !== nom ? `${nom} — ${s.ville}` : nom;
}

// Le gabarit de la tournée : les minima qu'une salle doit tenir. Il vit dans
// tournees.technique_tournee.gabarit, à côté des points de jus et des accès
// scène — même nature, mêmes exigences valables partout.
function gabaritDe(tournee){
  const g = (tournee && tournee.techniqueTournee && tournee.techniqueTournee.gabarit) || {};
  const out = {};
  SALLE_FAITS.forEach(f=>{
    const v = g[f.gab];
    out[f.gab] = (v === '' || v == null) ? null : Number(v);
  });
  return out;
}
function gabaritVide(gab){ return SALLE_FAITS.every(f=> gab[f.gab] == null); }

/* Le verdict d'une salle face à un gabarit.
 *
 * Trois issues, et surtout une quatrième qui n'en est pas une : « on ne sait
 * pas ». Une salle dont le grill n'est pas renseigné ne « passe » pas — elle
 * n'a pas répondu. Confondre les deux, c'est partir en tournée en croyant
 * qu'un point est réglé.
 *
 * « juste » est la marge : à moins de 5 % au-dessus du minimum, ça tient sur le
 * papier et se joue sur place. C'est l'information qu'un DT veut voir venir.
 */
const SALLE_MARGE = 0.05;

function verdictSalle(salle, gab){
  const lignes = [];
  let pire = 'ok';
  SALLE_FAITS.forEach(f=>{
    const mini = gab[f.gab];
    if(mini == null) return;                       // pas exigé : rien à dire
    const v = salle ? salle[f.cle] : null;
    if(v == null || v === ''){
      lignes.push({ fait:f, mini, valeur:null, etat:'inconnu' });
      if(pire === 'ok') pire = 'inconnu';
      return;
    }
    const n = Number(v);
    if(n < mini){
      lignes.push({ fait:f, mini, valeur:n, etat:'non' });
      pire = 'non';
    } else if(n < mini * (1 + SALLE_MARGE)){
      lignes.push({ fait:f, mini, valeur:n, etat:'juste' });
      if(pire !== 'non') pire = 'juste';
    } else {
      lignes.push({ fait:f, mini, valeur:n, etat:'ok' });
    }
  });
  if(!lignes.length) return { etat:'sans_gabarit', lignes:[], resume:'aucun gabarit posé' };

  const manquent = lignes.filter(l=> l.etat === 'inconnu');
  const bloquent = lignes.filter(l=> l.etat === 'non');
  const justes   = lignes.filter(l=> l.etat === 'juste');
  // Le résumé nomme au plus deux causes puis compte le reste : quand cinq
  // critères tombent d'un coup, les énumérer tous fait un pavé que personne ne
  // lit, alors que « ça ne passe pas » suffisait déjà à décider.
  const enBref = (liste, dire)=>{
    const dits = liste.slice(0, 2).map(dire);
    const reste = liste.length - dits.length;
    return dits.join(' · ') + (reste > 0 ? ` · et ${reste} autre${reste > 1 ? 's' : ''}` : '');
  };
  const resume =
      bloquent.length ? enBref(bloquent, l=> `${l.fait.label.toLowerCase()} : ${l.valeur} ${l.fait.unite} pour ${l.mini} demandés`)
    : manquent.length ? enBref(manquent, l=> l.fait.label.toLowerCase()) + ' — pas renseigné'
    : justes.length   ? enBref(justes, l=> `${l.fait.label.toLowerCase()} tout juste`)
    : 'tout passe';
  return { etat: pire, lignes, resume };
}

const VERDICT_LIBELLE = {
  ok:'Ça passe', juste:'Ça passe juste', non:'Ça ne passe pas',
  inconnu:'On ne sait pas', sans_gabarit:'Pas de gabarit',
};
// Les mêmes trois couleurs que partout : vert réglé, orange à suivre, rouge
// bloquant. « On ne sait pas » reste gris — ce n'est pas une alerte, c'est un
// trou dans la fiche.
const VERDICT_SEV = { ok:'ok', juste:'att', non:'ko', inconnu:'', sans_gabarit:'' };

if(typeof window !== 'undefined'){
  window.SALLE_FAITS = SALLE_FAITS;
  window.SALLE_MARGE = SALLE_MARGE;
  window.salleFaitTexte = salleFaitTexte;
  window.salleLibelle = salleLibelle;
  window.gabaritDe = gabaritDe;
  window.gabaritVide = gabaritVide;
  window.verdictSalle = verdictSalle;
  window.VERDICT_LIBELLE = VERDICT_LIBELLE;
  window.VERDICT_SEV = VERDICT_SEV;
}
