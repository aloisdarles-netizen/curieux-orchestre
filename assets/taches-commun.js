/* ============================================================================
   Les tâches de l'équipe — ce qui se calcule, sans écran ni réseau
   ============================================================================
   taches.html dessine ; ce module décide. Il ne touche ni au DOM ni à la base :
   il reçoit des projets (lignes de `tournees`) et des tâches (lignes de
   `comm_taches` au format de l'adaptateur) et rend des dates, des états, des
   listes. C'est ce qui permet de le vérifier en Node (outils/
   test-taches-commun.cjs) et de le relire depuis l'accueil pour compter les
   tâches en retard exactement comme la page les montre.

   TROIS RÈGLES QUI TIENNENT TOUT LE RESTE

   1. UNE ÉCHÉANCE CALÉE SUR LE PROJET SE RECALCULE À CHAQUE LECTURE. Une tâche
      « 21 jours avant la première répétition » ne stocke pas de date : elle
      stocke l'ancre et le nombre de jours. Si la répétition avance d'une
      semaine, la tâche avance avec elle, sans que personne n'y pense.

   2. L'ÉTAT D'UNE TÂCHE MÈRE SE DÉDUIT DE SES SOUS-TÂCHES. Il n'est jamais
      stocké : deux personnes qui cochent deux titres au même moment
      calculeraient chacune la mère depuis une liste périmée, et la dernière
      écriture mentirait.

   3. UNE TÂCHE AUTOMATIQUE A UN IDENTIFIANT DÉTERMINISTE —
      « auto::<projet>::<règle> ». La base l'insère en « on conflict do
      nothing » : deux comptes qui ouvrent la page au même instant ne créent
      pas deux fois la même tâche, et une tâche écartée ne renaît jamais.
============================================================================ */

const CurieuxTaches = (function(){
  'use strict';

  const GENRE = 'equipe';

  // L'état, dans l'ordre où une tâche le traverse. « Écartée » n'est pas un
  // état qu'on choisit : c'est ce que devient une tâche automatique qu'on
  // retire — supprimée, elle renaîtrait au chargement suivant.
  const STATUTS = [
    { cle:'a_faire',  libelle:'À faire',  pill:'info' },
    { cle:'en_cours', libelle:'En cours', pill:'att'  },
    { cle:'fait',     libelle:'Fait',     pill:'ok'   },
  ];
  const STATUT = Object.fromEntries(STATUTS.map(s=> [s.cle, s]));
  STATUT.ecartee = { cle:'ecartee', libelle:'Écartée', pill:'' };

  function statutSuivant(cle){
    const i = STATUTS.findIndex(s=> s.cle === cle);
    return STATUTS[(i + 1) % STATUTS.length].cle;
  }

  // Les points d'un projet sur lesquels une échéance peut se caler.
  const ANCRES = [
    { cle:'premiere_repetition', libelle:'la 1re répétition', court:'1re répétition' },
    { cle:'premier_concert',     libelle:'le 1er concert',    court:'1er concert' },
    { cle:'premiere_date',       libelle:'la 1re date',       court:'1re date' },
    { cle:'derniere_date',       libelle:'la dernière date',  court:'dernière date' },
  ];
  const ANCRE = Object.fromEntries(ANCRES.map(a=> [a.cle, a]));

  // Les liens qu'une règle peut poser sur ses tâches. Une liste fermée, et
  // jamais une adresse : une URL lue en base puis posée dans un href serait
  // une porte ouverte.
  const LIENS = {
    '':         { libelle:'Aucun' },
    partitions: { libelle:'Partitions du projet' },
    projet:     { libelle:'Fiche du projet' },
  };

  /* --- Les dates ----------------------------------------------------------- */

  // AUJOURD'HUI, À L'HEURE DE CELUI QUI REGARDE. toISOString() donne la date
  // de Greenwich : entre minuit et deux heures du matin à Paris, elle dit
  // encore « hier », et une tâche du jour passe « en retard » pendant deux
  // heures.
  function aujourdhuiLocal(maintenant){
    const d = maintenant || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function ajouterJours(iso, n){
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + n);
    return dt.toISOString().slice(0, 10);
  }
  function joursEntre(a, b){
    const [ya, ma, da] = a.split('-').map(Number);
    const [yb, mb, db] = b.split('-').map(Number);
    return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
  }

  /* --- Les projets --------------------------------------------------------- */

  function estRecording(projet){ return !!projet && projet.type === 'recording'; }

  // La nature d'une date, ramenée au vocabulaire du projet — la même règle que
  // typeDateValide (ui-helpers.js), recopiée ici pour que le module se charge
  // seul : une date sans nature est un concert, ou une prise en studio.
  const TYPES = {
    tournee:   ['concert', 'repetition', 'residence'],
    recording: ['prise', 'repetition', 'overdub', 'mixage'],
  };
  function typeDe(projet, d){
    const liste = TYPES[estRecording(projet) ? 'recording' : 'tournee'];
    return liste.includes(d && d.type) ? d.type : liste[0];
  }
  // Une résidence est une répétition dans la salle : elle ouvre le travail de
  // la même façon, et c'est avant elle que les partitions doivent être prêtes.
  function estRepetition(projet, d){
    const t = typeDe(projet, d);
    return t === 'repetition' || (!estRecording(projet) && t === 'residence');
  }
  function estConcert(projet, d){
    const t = typeDe(projet, d);
    return estRecording(projet) ? t === 'prise' : t === 'concert';
  }

  // Les dates qui auront lieu : datées, non annulées, dans l'ordre.
  function datesActives(projet){
    return ((projet && projet.dates) || [])
      .filter(d=> d && d.date && d.statut !== 'annulee')
      .slice().sort((a, b)=> a.date.localeCompare(b.date));
  }
  function projetAnnule(projet){
    const dates = ((projet && projet.dates) || []).filter(d=> d && d.date);
    return dates.length > 0 && dates.every(d=> d.statut === 'annulee');
  }
  function bornes(projet){
    const d = datesActives(projet);
    return d.length ? { debut: d[0].date, fin: d[d.length - 1].date } : null;
  }

  /* Le jour sur lequel se cale une ancre, ou null.
     `repli` dit qu'on n'a pas trouvé ce qu'on cherchait et qu'on s'est rabattu
     sur la première date : un projet dont on n'a encore saisi que le concert
     a quand même besoin de ses partitions. Dès que la répétition est saisie,
     l'ancre la retrouve d'elle-même. */
  function dateAncre(projet, ancre){
    const dates = datesActives(projet);
    if(!dates.length) return null;
    const premiere = dates[0], derniere = dates[dates.length - 1];
    if(ancre === 'premiere_date') return { date: premiere.date, repli: false };
    if(ancre === 'derniere_date') return { date: derniere.date, repli: false };
    const cherche = ancre === 'premiere_repetition' ? estRepetition
                  : ancre === 'premier_concert' ? estConcert : null;
    if(!cherche) return null;
    const trouvee = dates.find(d=> cherche(projet, d));
    return trouvee ? { date: trouvee.date, repli: false } : { date: premiere.date, repli: true };
  }

  // Un projet engendre ses tâches automatiques à partir du moment où il est
  // acquis : au moins une date validée — ou, si on l'a réglé ainsi, dès
  // l'option. Une date « à l'étude » n'engage jamais rien.
  function projetDeclenche(projet, declencheur){
    const dates = datesActives(projet);
    // Une valeur inconnue vaut « option », comme dans statuts-date.js : on ne
    // dégrade pas une date que quelqu'un a posée.
    if(declencheur === 'option') return dates.some(d=> d.statut !== 'recherche');
    return dates.some(d=> d.statut === 'validee');
  }

  /* --- Les tâches ---------------------------------------------------------- */

  /* L'échéance d'une tâche : { date, source, repli, perdue }.
       source 'fixe'   — une date en clair ;
       source 'ancre'  — calée sur le projet, recalculée ici ;
       source 'aucune' — pas d'échéance.
     `perdue` : la tâche est calée sur un projet qui n'existe plus, ou qui n'a
     plus aucune date — elle n'a plus de jour, et l'écran doit le dire. */
  function echeanceDe(t, projetsParId){
    if(t.ancre && t.tourneeId){
      const projet = projetsParId && projetsParId.get(t.tourneeId);
      const a = projet ? dateAncre(projet, t.ancre) : null;
      if(!a) return { date: '', source: 'ancre', repli: false, perdue: true };
      return { date: ajouterJours(a.date, -(Number(t.j) || 0)), source: 'ancre', repli: a.repli, perdue: false };
    }
    if(t.echeance) return { date: t.echeance, source: 'fixe', repli: false, perdue: false };
    return { date: '', source: 'aucune', repli: false, perdue: false };
  }

  // Les sous-tâches de chaque tâche, dans l'ordre choisi.
  function enfantsParParent(taches){
    const m = new Map();
    taches.forEach(t=>{
      if(!t.parentId) return;
      if(!m.has(t.parentId)) m.set(t.parentId, []);
      m.get(t.parentId).push(t);
    });
    m.forEach(l=> l.sort((a, b)=> (a.ordre - b.ordre) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || a.id.localeCompare(b.id)));
    return m;
  }

  /* L'état qu'on montre. Sans sous-tâche, c'est l'état de la tâche. Avec :
     toutes faites → fait ; une commencée, une faite, ou la mère passée « en
     cours » à la main → en cours ; sinon à faire. Les sous-tâches écartées ne
     comptent pas. */
  function statutEffectif(t, enfants){
    if(t.statut === 'ecartee') return 'ecartee';
    const vivants = (enfants || []).filter(e=> e.statut !== 'ecartee');
    if(!vivants.length) return STATUT[t.statut] ? t.statut : 'a_faire';
    if(vivants.every(e=> e.statut === 'fait')) return 'fait';
    if(t.statut === 'en_cours' || vivants.some(e=> e.statut === 'en_cours' || e.statut === 'fait')) return 'en_cours';
    return 'a_faire';
  }
  function progression(enfants){
    const vivants = (enfants || []).filter(e=> e.statut !== 'ecartee');
    return { faits: vivants.filter(e=> e.statut === 'fait').length, total: vivants.length };
  }

  /* L'échéance qui PRESSE pour une tâche mère : la sienne, ou celle d'une
     sous-tâche ouverte si elle tombe plus tôt. « Arrangements » pour le
     22 octobre dont un titre est dû le 3 se range au 3. */
  function echeancePressante(t, enfants, projetsParId){
    const dates = [echeanceDe(t, projetsParId).date];
    (enfants || []).forEach(e=>{
      if(e.statut === 'fait' || e.statut === 'ecartee') return;
      dates.push(echeanceDe(e, projetsParId).date);
    });
    const valides = dates.filter(Boolean).sort();
    return valides[0] || '';
  }

  /* Les tâches de premier niveau en retard : ni faites, ni écartées, projet
     non annulé, et une échéance (la leur ou celle d'une sous-tâche ouverte)
     déjà passée. C'est ce que compte la pastille de l'onglet et l'accueil. */
  function enRetard(taches, projetsParId, aujourdhui){
    const miennes = taches.filter(t=> t.genre === GENRE);
    const enfants = enfantsParParent(miennes);
    return miennes.filter(t=>{
      if(t.parentId) return false;
      const s = statutEffectif(t, enfants.get(t.id));
      if(s === 'fait' || s === 'ecartee') return false;
      const projet = t.tourneeId && projetsParId ? projetsParId.get(t.tourneeId) : null;
      if(projet && projetAnnule(projet)) return false;
      const ech = echeancePressante(t, enfants.get(t.id), projetsParId);
      return !!ech && ech < aujourdhui;
    });
  }

  /* --- Les tâches automatiques -------------------------------------------- */

  function idAuto(tourneeId, modeleId){ return `auto::${tourneeId}::${modeleId}`; }

  // Une règle lisible, ou rien. Une règle bancale — ancre inconnue, nombre de
  // jours absurde — ne doit rien engendrer plutôt que d'engendrer n'importe
  // quoi sur tous les projets à la fois.
  function modeleValide(m){
    return !!m && typeof m.id === 'string' && /^[a-z0-9-]{1,60}$/.test(m.id)
      && typeof m.libelle === 'string' && m.libelle.trim() !== ''
      && !!ANCRE[m.ancre] && Number.isInteger(Number(m.j)) && Math.abs(Number(m.j)) <= 365;
  }
  function normaliserReglage(r){
    if(!r || typeof r !== 'object') return null;
    return {
      declencheur: r.declencheur === 'option' ? 'option' : 'validee',
      modeles: (Array.isArray(r.modeles) ? r.modeles : []).filter(modeleValide).map(m=> ({
        id: m.id, libelle: m.libelle.trim(), ancre: m.ancre, j: Number(m.j),
        actif: m.actif !== false, lien: LIENS[m.lien] ? m.lien : '',
      })),
    };
  }

  /* Ce qui manque : pour chaque projet déclenché et chaque règle active, la
     tâche dont l'ancre n'est pas encore passée et qui n'existe pas encore.

     On regarde l'ANCRE et non l'échéance : un projet signé dix jours avant sa
     première répétition a toujours besoin de l'envoi « J-21 » — il naît en
     retard, et c'est exactement ce qu'il doit dire. Un projet déjà commencé,
     lui, n'engendre plus rien : ses partitions sont sur les pupitres.

     `taches` doit être une lecture RÉUSSIE de la table : une liste vide faute
     d'avoir pu lire ferait tout recréer. L'identifiant déterministe rattrape
     le pire, mais la page ne doit même pas essayer. */
  function tachesAutoManquantes(projets, taches, reglage, aujourdhui){
    const r = normaliserReglage(reglage);
    if(!r) return [];
    const existants = new Set(taches.map(t=> t.id));
    const nouvelles = [];
    projets.forEach(p=>{
      if(!p || !p.id || !projetDeclenche(p, r.declencheur)) return;
      r.modeles.forEach(m=>{
        if(!m.actif) return;
        const id = idAuto(p.id, m.id);
        if(existants.has(id)) return;
        const a = dateAncre(p, m.ancre);
        if(!a || a.date < aujourdhui) return;
        nouvelles.push({
          id, genre: GENRE, libelle: m.libelle, notes: '', auteur: '', pour: '',
          statut: 'a_faire', fait: false, faitLe: '', echeance: '',
          tourneeId: p.id, dateId: '', ancre: m.ancre, j: m.j, modele: m.id,
          parentId: '', ordre: 0,
        });
      });
    });
    return nouvelles;
  }

  // Combien une règle créerait de tâches, projet par projet — l'aperçu qu'on
  // montre AVANT d'enregistrer une règle, parce qu'elle s'applique d'un coup à
  // tous les projets signés.
  function apercuReglage(projets, taches, reglage, aujourdhui){
    const n = tachesAutoManquantes(projets, taches, reglage, aujourdhui);
    return { taches: n.length, projets: new Set(n.map(t=> t.tourneeId)).size };
  }

  /* --- Les liens ----------------------------------------------------------- */

  function lienProjet(projet){
    if(!projet) return '';
    return (estRecording(projet) ? 'tournees.html?type=recording' : 'tournees.html')
      + '#tournee-' + encodeURIComponent(projet.id);
  }
  function lienPartitions(projet){
    return projet ? 'partitions.html?operation=' + encodeURIComponent(projet.id) : '';
  }
  // Le lien d'une tâche automatique vient de SA règle, relue à chaque fois :
  // la ligne ne stocke que la clé de la règle, jamais une adresse.
  function lienDe(t, projet, reglage){
    if(!t.modele || !projet) return null;
    const r = normaliserReglage(reglage);
    const m = r && r.modeles.find(x=> x.id === t.modele);
    if(!m || !m.lien) return null;
    if(m.lien === 'partitions') return { href: lienPartitions(projet), libelle: 'Ouvrir les partitions' };
    if(m.lien === 'projet') return { href: lienProjet(projet), libelle: 'Ouvrir le projet' };
    return null;
  }

  return {
    GENRE, STATUTS, STATUT, statutSuivant, ANCRES, ANCRE, LIENS,
    aujourdhuiLocal, ajouterJours, joursEntre,
    estRecording, typeDe, estRepetition, estConcert, datesActives, projetAnnule, bornes,
    dateAncre, projetDeclenche,
    echeanceDe, enfantsParParent, statutEffectif, progression, echeancePressante, enRetard,
    idAuto, modeleValide, normaliserReglage, tachesAutoManquantes, apercuReglage,
    lienProjet, lienPartitions, lienDe,
  };
})();

if(typeof window !== 'undefined') window.CurieuxTaches = CurieuxTaches;
