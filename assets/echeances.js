/* ---------------------------------------------------------------------------
   Ce qui expire : habilitations, autorisations, carnets ATA.
   ---------------------------------------------------------------------------
   Trois angles morts de l'audit, de même nature. Une habilitation électrique,
   un CACES, un arrêté de voirie, un carnet ATA : tous portent une date, tous
   se périment, et aucun n'était surveillé. Le problème se découvrait le jour
   du montage, quand il est trop tard.

   Une règle traverse tout le fichier : « pas de date » n'est pas « valide ».
   C'est un troisième état, dit comme tel. Confondre les deux, c'est partir en
   tournée en croyant qu'un point est réglé.
--------------------------------------------------------------------------- */

// `accord` porte le genre du libellé : « habilitation périmée » mais « CACES
// périmé ». Un détail, mais c'est ce qui distingue un texte écrit d'un texte
// assemblé.
const HABILITATION_TYPES = [
  { cle:'electrique', libelle:'Habilitation électrique', accord:'e', exemple:'B1V, BR, BC…' },
  { cle:'caces',      libelle:'CACES',                   accord:'',  exemple:'R489 cat. 3, R486 nacelle…' },
  { cle:'hauteur',    libelle:'Travail en hauteur',      accord:'',  exemple:'port du harnais' },
  { cle:'sst',        libelle:'Sauveteur secouriste',    accord:'',  exemple:'SST' },
  { cle:'autre',      libelle:'Autre titre',             accord:'',  exemple:'' },
];
const HABILITATION_ACCORD = Object.fromEntries(HABILITATION_TYPES.map(t=> [t.cle, t.accord]));
const HABILITATION_LIBELLE = Object.fromEntries(HABILITATION_TYPES.map(t=> [t.cle, t.libelle]));

const AUTORISATION_TYPES = [
  { cle:'voirie',        libelle:'Occupation de voirie' },
  { cle:'stationnement', libelle:'Stationnement des semis' },
  { cle:'badges',        libelle:'Badges & accréditations' },
  { cle:'autre',         libelle:'Autre autorisation' },
];
const AUTORISATION_LIBELLE = Object.fromEntries(AUTORISATION_TYPES.map(t=> [t.cle, t.libelle]));

const AUTORISATION_STATUTS = [
  { cle:'a_demander', libelle:'À demander', sev:'non' },
  { cle:'demande',    libelle:'Demandée',   sev:'att' },
  { cle:'obtenu',     libelle:'Obtenue',    sev:'ok'  },
  { cle:'refuse',     libelle:'Refusée',    sev:'ko'  },
];
const AUTORISATION_STATUT = Object.fromEntries(AUTORISATION_STATUTS.map(s=> [s.cle, s]));

function _jour(){ return new Date().toISOString().slice(0,10); }

/* L'état d'une échéance, à une date de référence.
 *
 * `reference` est le jour qui compte : aujourd'hui pour une habilitation qu'on
 * consulte, mais LE JOUR DU CONCERT quand on affecte quelqu'un dessus. Un titre
 * valable aujourd'hui et périmé le soir du montage ne vaut rien — c'est
 * précisément l'erreur que l'outil doit rendre impossible.
 */
function etatEcheance(expireLe, seuils, reference){
  if(!expireLe) return { etat:'inconnu', jours:null };
  const jour = reference || _jour();
  const jours = daysBetween(jour, String(expireLe).slice(0,10));
  const [orange, rouge] = seuils || [60, 15];
  if(jours < 0) return { etat:'perime', jours };
  if(jours <= rouge) return { etat:'bientot_rouge', jours };
  if(jours <= orange) return { etat:'bientot', jours };
  return { etat:'valide', jours };
}

const ECHEANCE_LIBELLE = {
  valide:'Valide', bientot:'Expire bientôt', bientot_rouge:'Expire très bientôt',
  perime:'Périmé', inconnu:'Sans date connue',
};
// Le gris de « inconnu » est délibéré : ce n'est pas une alerte, c'est un trou
// dans la fiche. Le rouge est réservé à ce qui est faux le jour J.
const ECHEANCE_SEV = { valide:'ok', bientot:'att', bientot_rouge:'ko', perime:'ko', inconnu:'' };

function texteEcheance(e){
  if(e.etat === 'inconnu') return 'sans date de fin';
  if(e.etat === 'perime') return e.jours === -1 ? 'périmé depuis hier' : `périmé depuis ${-e.jours} jours`;
  if(e.jours === 0) return "expire aujourd'hui";
  if(e.jours === 1) return 'expire demain';
  return `expire dans ${e.jours} jours`;
}

// Les habilitations d'une personne, avec leur état à la date de référence.
function habilitationsDe(personne, seuils, reference){
  return ((personne && personne.habilitations) || []).map(h=> ({
    ...h,
    libelle: HABILITATION_LIBELLE[h.type] || 'Titre',
    accord: HABILITATION_ACCORD[h.type] || '',
    etat: etatEcheance(h.expireLe, seuils, reference),
  }));
}

// La pire des habilitations d'une personne — ce qu'on montre sur une tuile.
// « inconnu » ne pèse pas dans le pire : une fiche vide ne doit pas crier au
// rouge, elle doit se remplir.
const _RANG = { perime:3, bientot_rouge:2, bientot:1, valide:0, inconnu:0 };
function pireHabilitation(personne, seuils, reference){
  const liste = habilitationsDe(personne, seuils, reference).filter(h=> h.etat.etat !== 'inconnu');
  if(!liste.length) return null;
  return liste.reduce((pire, h)=> _RANG[h.etat.etat] > _RANG[pire.etat.etat] ? h : pire);
}

/* L'état d'une autorisation face à une date de concert.
 *
 * Deux axes se croisent : ce qu'on en a fait (à demander / demandée / obtenue)
 * et le temps qui reste. Une autorisation obtenue ne presse plus, quelle que
 * soit la date ; une autorisation encore à demander à dix jours du concert
 * presse beaucoup.
 */
function etatAutorisation(a, joursRestants, seuils){
  const statut = AUTORISATION_STATUT[a && a.statut] || AUTORISATION_STATUTS[0];
  if(statut.cle === 'obtenu') return { sev:'ok', statut, presse:false };
  if(statut.cle === 'refuse') return { sev:'ko', statut, presse:true };
  if(joursRestants == null || joursRestants < 0) return { sev: statut.sev, statut, presse:false };
  const [orange, rouge] = seuils || [30, 10];
  if(joursRestants <= rouge) return { sev:'ko', statut, presse:true };
  if(joursRestants <= orange) return { sev:'att', statut, presse:true };
  return { sev: statut.sev, statut, presse:false };
}

if(typeof window !== 'undefined'){
  window.HABILITATION_TYPES = HABILITATION_TYPES;
  window.HABILITATION_LIBELLE = HABILITATION_LIBELLE;
  window.HABILITATION_ACCORD = HABILITATION_ACCORD;
  window.AUTORISATION_TYPES = AUTORISATION_TYPES;
  window.AUTORISATION_LIBELLE = AUTORISATION_LIBELLE;
  window.AUTORISATION_STATUTS = AUTORISATION_STATUTS;
  window.AUTORISATION_STATUT = AUTORISATION_STATUT;
  window.etatEcheance = etatEcheance;
  window.ECHEANCE_LIBELLE = ECHEANCE_LIBELLE;
  window.ECHEANCE_SEV = ECHEANCE_SEV;
  window.texteEcheance = texteEcheance;
  window.habilitationsDe = habilitationsDe;
  window.pireHabilitation = pireHabilitation;
  window.etatAutorisation = etatAutorisation;
}
