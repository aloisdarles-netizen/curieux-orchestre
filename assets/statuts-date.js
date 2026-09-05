/* ---------------------------------------------------------------------------
   Le statut d'une date — la seule définition, partagée.
   ---------------------------------------------------------------------------
   Le savoir était éparpillé : la liste blanche des valeurs recopiée dans cinq
   endroits, les libellés dans quatre, le cycle de la pastille dans un seul.
   Ajouter une valeur voulait dire les retrouver toutes, et en oublier une
   faisait retomber la date en « option » sans que personne ne le voie.

   Quatre états, dans l'ordre où une date les traverse :

     recherche — « à l'étude ». RIEN n'est réservé : on collecte seulement les
                 disponibilités pour savoir si la date est jouable. C'est une
                 hypothèse de travail, souvent large, dont on tirera peut-être
                 une option. C'est le premier état, et il manquait : on était
                 obligé de poser une « option » qui n'en était pas une.

                 La CLÉ reste `recherche` — elle est écrite en base sur des
                 milliers de dates, et la renommer coûterait une migration pour
                 ne rien changer à ce qu'on lit. Seul le LIBELLÉ a changé :
                 « recherche » disait ce que la production fait, pas ce qu'on
                 attend de la personne qui lit. Quelqu'un qui voyait
                 « Recherche » sur une de ses journées ne savait pas s'il
                 devait la garder. « À l'étude » ne promet rien et ne demande
                 rien à tort ; la phrase qui l'accompagne fait le reste.
     option    — la salle nous tient la date. On peut la libérer, mais elle
                 existe des deux côtés.
     validée   — c'est signé, on y va.
     annulée   — ça n'aura pas lieu. La date reste visible, barrée.

   Une date à l'étude et une date en option sont toutes deux des HYPOTHÈSES :
   c'est ce que dit `estHypothese`. La différence, c'est qu'une option engage la
   salle, et pas une date à l'étude.
--------------------------------------------------------------------------- */

const STATUTS_DATE = [
  // `pill` reprend le vocabulaire de la charte (co-pill). Le gris de
  // « à l'étude » est délibéré : rien n'est engagé, il n'y a rien à colorer.
  { cle:'recherche', libelle:"Date à l'étude", court:"À l'étude", pill:'',    ordre:0 },
  { cle:'option',    libelle:'Option',          court:'Option',    pill:'att', ordre:1 },
  { cle:'validee',   libelle:'Validée',         court:'Validée',   pill:'ok',  ordre:2 },
  { cle:'annulee',   libelle:'Annulée',         court:'Annulée',   pill:'ko',  ordre:3 },
];
const STATUT_DATE = Object.fromEntries(STATUTS_DATE.map(s=> [s.cle, s]));
const STATUTS_DATE_CLES = STATUTS_DATE.map(s=> s.cle);

// Toute valeur inconnue — une date d'avant ce changement, un import bancal —
// retombe sur « option », qui était le défaut historique. Jamais sur
// « à l'étude » : on ne dégrade pas une date que quelqu'un a posée.
function statutDate(d){
  const v = d && typeof d === 'object' ? d.statut : d;
  return STATUT_DATE[v] ? v : 'option';
}
function libelleStatut(d){ return STATUT_DATE[statutDate(d)].libelle; }
function courtStatut(d){ return STATUT_DATE[statutDate(d)].court; }
function pillStatut(d){ return STATUT_DATE[statutDate(d)].pill; }

// Le cycle de la pastille, dans l'ordre du tableau : à l'étude → option →
// validée → annulée → à l'étude.
function statutSuivant(d){
  const i = STATUTS_DATE.findIndex(s=> s.cle === statutDate(d));
  return STATUTS_DATE[(i + 1) % STATUTS_DATE.length].cle;
}

function estValidee(d){ return statutDate(d) === 'validee'; }
function estAnnulee(d){ return statutDate(d) === 'annulee'; }
// Rien n'est acquis : ni signé, ni mort. C'est ce qui distingue une date sur
// laquelle on peut engager un camion d'une date sur laquelle on ne peut pas.
function estHypothese(d){ const s = statutDate(d); return s === 'recherche' || s === 'option'; }

if(typeof window !== 'undefined'){
  window.STATUTS_DATE = STATUTS_DATE;
  window.STATUT_DATE = STATUT_DATE;
  window.STATUTS_DATE_CLES = STATUTS_DATE_CLES;
  window.statutDate = statutDate;
  window.libelleStatut = libelleStatut;
  window.courtStatut = courtStatut;
  window.pillStatut = pillStatut;
  window.statutSuivant = statutSuivant;
  window.estValidee = estValidee;
  window.estAnnulee = estAnnulee;
  window.estHypothese = estHypothese;
}
