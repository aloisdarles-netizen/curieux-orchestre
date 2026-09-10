/* ============================================================================
   La sélection de projets — ce qui découle d'un choix de tournées
   ============================================================================
   La page Messages et la page Documents partent du même geste : on coche un
   ou plusieurs projets, et tout le reste en découle — les dates à venir, les
   personnes concernées, la demande de dispo de chacun·e, le fait qu'un projet
   soit entièrement annulé. Ce savoir vivait dans messages.html, et le document
   récapitulatif s'en servait sur place. Le jour où le document a pris sa
   propre page, il fallait choisir entre recopier ces fonctions — deux copies
   qui divergent à la première correction, et un « qui est concerné » qui ne
   dit plus la même chose selon la page — ou les sortir ici.

   Le module ne connaît ni Supabase, ni le DOM, ni l'état d'une page : chaque
   fonction reçoit les caches dont elle a besoin (tournées, demandes,
   annuaires) et rend un résultat. C'est ce qui permet à deux pages d'état
   différent de l'appeler sans se marcher dessus, et de le tester sans écran.

   Il porte aussi les mots du calendrier — mois et jours en toutes lettres,
   rang d'engagement des statuts — qui étaient déjà dupliqués entre la vue
   « Mes dates » et le document. Une troisième copie n'était pas une option.
============================================================================ */
const CurieuxSelection = (function(){

  const MOIS_LONGS = ['janvier','février','mars','avril','mai','juin',
                      'juillet','août','septembre','octobre','novembre','décembre'];
  const MOIS_COURTS = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  const JOURS_LONGS = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];

  // L'ordre d'engagement : quand deux projets tombent le même jour, c'est le
  // statut le plus engageant qui donne sa couleur à la case. Le même arbitrage
  // qu'à l'écran (assets/mes-dates-vue.js), et pour la même raison : une
  // journée où l'on joue ne doit pas se peindre en « à l'étude » parce qu'un
  // autre projet cherche encore ses dates.
  const RANG_STATUT = { validee:0, option:1, recherche:2, annulee:3 };

  function aujourdhuiIso(){ return new Date().toISOString().slice(0, 10); }

  // Découpage de la chaîne ISO, jamais new Date() sur une date nue : selon le
  // fuseau, minuit recule d'un jour, et une date de concert fausse d'un jour
  // dans un document imprimé est une erreur qu'on ne rattrape plus.
  function jourLong(iso){
    const [a, m, j] = String(iso || '').split('-').map(n=> parseInt(n, 10));
    if(!j) return '';
    const sem = JOURS_LONGS[(new Date(Date.UTC(a, m - 1, j)).getUTCDay() + 6) % 7];
    return `${sem} ${j === 1 ? '1er' : j} ${MOIS_LONGS[m - 1] || ''}`;
  }
  function jourCourt(iso){
    const [, m, j] = String(iso || '').split('-');
    if(!j) return '';
    const n = parseInt(j, 10);
    return `${n === 1 ? '1er' : n} ${MOIS_COURTS[parseInt(m, 10) - 1] || ''}`;
  }

  // Le jour où un document ou un message a été arrêté, en toutes lettres.
  function editeLe(){
    return new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
  }

  // « A, B et C » — jamais « A et B et C ». La même règle que dans les
  // messages (CurieuxMessages.joindre) : une page qui ne charge pas les
  // modèles de message n'a aucune raison de nommer ses projets autrement.
  function joindre(items){
    const l = (items || []).filter(Boolean);
    if(l.length <= 1) return l[0] || '';
    return l.slice(0, -1).join(', ') + ' et ' + l[l.length - 1];
  }

  // Les tournées cochées, dans l'ordre du cache. `ids` est un Set ou un tableau.
  function projetsChoisis(tournees, ids){
    const voulus = ids instanceof Set ? ids : new Set(ids || []);
    return (tournees || []).filter(t=> voulus.has(t.id));
  }

  /* Les dates des projets choisis, à venir, chacune accompagnée de son projet.
     On les garde appariées plutôt que de recopier le nom du projet dans la
     date : c'est le même document jsonb, et une copie se désynchronise. */
  function datesDesProjets(projets, aujourdhui){
    const today = aujourdhui || aujourdhuiIso();
    const out = [];
    (projets || []).forEach(t=> (t.dates || []).forEach(d=>{
      if(d.date && d.date >= today) out.push({ d, t });
    }));
    out.sort((a, b)=> a.d.date.localeCompare(b.d.date) || (a.t.nom || '').localeCompare(b.t.nom || ''));
    return out;
  }

  function demandePour(demandes, type, id, tourneeId){
    return (demandes || []).find(d=> d.tourneeId === tourneeId && d.personType === type && d.personId === id) || null;
  }

  // Cette personne a-t-elle quelque chose à voir avec CE projet ?
  function concernePar(demandes, type, id, t){
    if(demandePour(demandes, type, id, t.id)) return true;
    const champ = type === 'musicien' ? 'musiciensAssignes' : 'techniciensAssignes';
    return (t.dates || []).some(d=> (d[champ] || []).includes(id));
  }

  // Sollicité·es (une demande de dispo existe) et distribué·es (affecté·e sur
  // au moins une date, même sans demande), sans doublon, par pupitre puis nom.
  function personnesConcernees(projets, demandes, musiciens, techniciens){
    const parCle = new Map();
    const ajoute = (p, type)=>{ if(p) parCle.set(`${type}:${p.id}`, { p, type }); };

    (projets || []).forEach(t=>{
      (demandes || []).filter(d=> d.tourneeId === t.id).forEach(d=>{
        const liste = d.personType === 'musicien' ? (musiciens || []) : (techniciens || []);
        ajoute(liste.find(x=> x.id === d.personId), d.personType);
      });
      (t.dates || []).forEach(d=>{
        (d.musiciensAssignes || []).forEach(id=> ajoute((musiciens || []).find(x=> x.id === id), 'musicien'));
        (d.techniciensAssignes || []).forEach(id=> ajoute((techniciens || []).find(x=> x.id === id), 'technicien'));
      });
    });
    return [...parCle.values()].sort((a, b)=> curieuxComparePupitrePuisNom(a.p, b.p));
  }

  /* Un projet est-il entièrement annulé ?
     On regarde le PROJET, pas ce qui est coché : si toutes ses dates à venir
     portent le statut « annulée », la tournée est annulée, et le message ou le
     document doit le dire ainsi. Annoncer « ces dates ne se feront pas » quand
     il n'en reste aucune laisse croire qu'il en reste. */
  function projetAnnule(t){
    const today = aujourdhuiIso();
    const dates = (t.dates || []).filter(d=> d.date && d.date >= today);
    return dates.length > 0 && dates.every(d=> statutDate(d) === 'annulee');
  }
  function tousAnnules(projets){
    const liste = projets || [];
    return liste.length > 0 && liste.every(projetAnnule);
  }

  return { MOIS_LONGS, MOIS_COURTS, JOURS_LONGS, RANG_STATUT,
           jourLong, jourCourt, editeLe, joindre,
           projetsChoisis, datesDesProjets, demandePour, concernePar,
           personnesConcernees, projetAnnule, tousAnnules };
})();
