/* ---------------------------------------------------------------------------
   L'avancement technique d'une date — la seule définition, partagée.
   ---------------------------------------------------------------------------
   technique.html dessinait ses six postes, technique-taches.html en redessinait
   une copie inventée : deux définitions de « réglé » pour la même date, dont
   une fausse. Elles vivent ici, en un seul endroit.

   Ce que l'audit reprochait aux six postes d'origine : ils sortaient TOUS de la
   table moyens_salle. Une date pouvait donc afficher « 6/6 réglés » sans camion,
   sans chauffeur, sans équipe technique et sans que la fiche technique soit
   partie — trois choses qui, le jour venu, empêchent le concert bien plus
   sûrement qu'une vacation de chariot non confirmée.

   Neuf postes, donc, dans l'ordre où on s'en occupe : ce qui part vers la salle,
   ce que la salle répond, ce qu'on amène. L'ordre est fixe — l'œil apprend où
   regarder, c'est la couleur qui dit l'état.
--------------------------------------------------------------------------- */

// [orange, rouge] en jours avant la date. Réglables depuis le tableau de bord
// (reglages.technique_seuils) ; ces valeurs-ci sont le repli et la référence.
const TECHNIQUE_SEUILS_DEFAUT = {
  planScene:    [45, 21],
  planCharge:   [30, 14],
  fiche:        [45, 21],
  dechargement: [21, 10],
  vacations:    [14, 7],
  transport:    [21, 10],
  equipe:       [30, 14],
  option:       [21, 10],
  // Celui-ci se compte à l'envers : l'ÂGE d'une remarque non traitée, en jours.
  remarque:     [3, 7],
};

const TECHNIQUE_SEUILS_LIBELLES = {
  planScene:    'Plan de scène — à demander à la salle',
  planCharge:   'Plan de charge — à envoyer au bureau de contrôle',
  fiche:        'Fiche technique — à envoyer à la salle',
  dechargement: 'Déchargement — combien de semis en simultané',
  vacations:    'Vacations roadies, chariots et rigg — à faire confirmer',
  transport:    'Camion et chauffeur — à affecter',
  equipe:       'Équipe technique — à composer',
  option:       'Date encore en option — à signer ou libérer',
  remarque:     "Remarque reçue et non traitée — compté en jours d'attente",
};

function techniqueSeuil(seuils, cle){
  const v = (seuils || {})[cle];
  if(Array.isArray(v) && v.length === 2 && Number.isFinite(+v[0]) && Number.isFinite(+v[1])){
    return [Number(v[0]), Number(v[1])];
  }
  return TECHNIQUE_SEUILS_DEFAUT[cle];
}

// Un poste : une clé stable, un intitulé fixe, et son état du moment.
function techniquePoste(cle, sev, libelle, valeur){ return { cle, sev, libelle, valeur }; }

function techniquePostePlan(m){
  if(!m || m.planStatut === 'non_demande') return techniquePoste('planScene', 'non', 'Plan de scène', 'à demander');
  if(m.planStatut === 'demande')           return techniquePoste('planScene', 'att', 'Plan de scène', 'demandé, en attente');
  if(m.planValideNous && m.planValideSalle) return techniquePoste('planScene', 'ok', 'Plan de scène', 'validé des deux côtés');
  if(m.planValideNous)  return techniquePoste('planScene', 'att', 'Plan de scène', 'côté salle manquant');
  if(m.planValideSalle) return techniquePoste('planScene', 'att', 'Plan de scène', 'notre validation manque');
  return techniquePoste('planScene', 'att', 'Plan de scène', 'reçu, à valider');
}
function techniquePosteCharge(m){
  if(!m || m.planChargeStatut === 'non_envoye') return techniquePoste('planCharge', 'non', 'Plan de charge', 'à envoyer');
  if(m.planChargeStatut === 'envoye') return techniquePoste('planCharge', 'att', 'Plan de charge', 'envoyé, en attente');
  return techniquePoste('planCharge', 'ok', 'Plan de charge', 'validé');
}
function techniquePosteFiche(m){
  if(!m || !m.ficheEnvoyeeLe) return techniquePoste('fiche', 'non', 'Fiche technique', 'pas encore envoyée');
  const d = new Date(m.ficheEnvoyeeLe + 'T00:00:00');
  const jour = isNaN(d) ? m.ficheEnvoyeeLe : d.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' });
  return techniquePoste('fiche', 'ok', 'Fiche technique', 'envoyée le ' + jour);
}
function techniquePosteDechargement(m){
  if(!m || m.nombreSemisSimultanees == null) return techniquePoste('dechargement', 'non', 'Déchargement', 'à renseigner');
  const n = m.nombreSemisSimultanees;
  return techniquePoste('dechargement', 'ok', 'Déchargement', `${n} semi${n > 1 ? 's' : ''} en simultané`);
}
function techniquePosteVacations(cle, vacs, libelle){
  const liste = vacs || [];
  if(!liste.length) return techniquePoste(cle, 'non', libelle, 'aucune vacation');
  const confirmees = liste.filter(v=> v.confirme).length;
  return techniquePoste(cle, confirmees >= liste.length ? 'ok' : 'att',
    libelle, `${confirmees}/${liste.length} confirmée${liste.length > 1 ? 's' : ''}`);
}

// Camion et chauffeur se lisent dans affectations_transport, une ligne par
// date. Sur une série de soirs au même endroit, le poste n'est réglé que si
// CHAQUE date a les deux : c'est le soir oublié qui coûte cher, pas le premier.
function techniquePosteTransport(dates, affectationsParDate){
  const n = dates.length;
  let complet = 0, partiel = 0;
  dates.forEach(d=>{
    const a = affectationsParDate.get(d.id);
    if(a && a.vehiculeId && a.chauffeurId) complet++;
    else if(a && (a.vehiculeId || a.chauffeurId)) partiel++;
  });
  if(complet === n) return techniquePoste('transport', 'ok', 'Camion & chauffeur', n > 1 ? `${n} dates couvertes` : 'affectés');
  if(complet === 0 && partiel === 0) return techniquePoste('transport', 'non', 'Camion & chauffeur', 'rien d’affecté');
  return techniquePoste('transport', 'att', 'Camion & chauffeur', `${complet}/${n} date${n > 1 ? 's' : ''} complète${n > 1 ? 's' : ''}`);
}

// L'équipe technique de la date, telle que la tournée l'affecte. La barre est
// basse — au moins une personne par date — mais elle sépare « personne n'est
// prévu » de « quelqu'un l'est », ce que rien ne disait.
function techniquePosteEquipe(dates){
  const n = dates.length;
  const garnies = dates.filter(d=> (d.techniciensAssignes || []).length > 0).length;
  if(garnies === n){
    const total = new Set(dates.flatMap(d=> d.techniciensAssignes || [])).size;
    return techniquePoste('equipe', 'ok', 'Équipe technique', `${total} personne${total > 1 ? 's' : ''}`);
  }
  if(garnies === 0) return techniquePoste('equipe', 'non', 'Équipe technique', 'personne d’affecté');
  return techniquePoste('equipe', 'att', 'Équipe technique', `${garnies}/${n} date${n > 1 ? 's' : ''} pourvue${n > 1 ? 's' : ''}`);
}

// L'avancement d'une salle (une date, ou une série de soirs au même endroit).
//   moyens              : la ligne moyens_salle de la date de référence, ou null
//   dates               : les dates du groupe (objets de tournee.dates)
//   affectationsParDate : Map(dateId -> affectation_transport)
function techniquePostes(moyens, dates, affectationsParDate){
  const d = dates && dates.length ? dates : [];
  const aff = affectationsParDate || new Map();
  return [
    techniquePosteFiche(moyens),
    techniquePostePlan(moyens),
    techniquePosteCharge(moyens),
    techniquePosteDechargement(moyens),
    techniquePosteVacations('vacations', moyens && moyens.roadiesVacations, 'Roadies'),
    techniquePosteVacations('vacations', moyens && moyens.chariotsVacations, 'Chariots'),
    techniquePosteVacations('vacations', moyens && moyens.riggVacations, 'Rigg'),
    techniquePosteTransport(d, aff),
    techniquePosteEquipe(d),
  ];
}

if(typeof window !== 'undefined'){
  window.TECHNIQUE_SEUILS_DEFAUT = TECHNIQUE_SEUILS_DEFAUT;
  window.TECHNIQUE_SEUILS_LIBELLES = TECHNIQUE_SEUILS_LIBELLES;
  window.techniqueSeuil = techniqueSeuil;
  window.techniquePostes = techniquePostes;
}
