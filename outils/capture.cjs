// Extension .cjs et non .js : package.json déclare "type": "module",
// qui ferait lire ce fichier comme un module ES et casserait ses require().
// Capture d'écran des pages du site, en deux formats, avec des données de démo
// injectées avant le chargement — la base est protégée par RLS, une capture
// sans données ne montrerait que des écrans vides.
const { chromium } = require('playwright-core');

const BASE = 'http://127.0.0.1:8099';
const OUT = process.env.CAPTURES || '/tmp/captures';
const FORMATS = { mobile: { width: 390, height: 844 }, bureau: { width: 1280, height: 900 } };

const pages = process.argv[2] ? process.argv[2].split(',') : ['accueil', 'tournees', 'recap'];
const format = process.argv[3] || 'mobile';

// Jeu de démo minimal, servi à la place de Supabase.
const MUS = [
  ['demo-mus-01','Roxanne','Rabatti','Violon solo','Cordes'],['demo-mus-02','Mariane','Minjou','Violon','Cordes'],
  ['demo-mus-03','Pierre-Pascal','Jean','Alto','Cordes'],['demo-mus-04','Marwane','Champ','Violoncelle','Cordes'],
  ['demo-mus-05','Paul-Marie','Kuzma','Violoncelle','Cordes'],['demo-mus-06','Christelle','Raquillet','Flûte','Bois'],
  ['demo-mus-07','Coralie','Menuge','Hautbois','Bois'],['demo-mus-08','Yann','Pannecoucke','Clarinette','Bois'],
].map(([id,prenom,nom,instrument,pupitre]) => ({
  id, prenom, nom, instrument, pupitre, statutPoste:'titulaire', telephone:'06 12 31 52 70',
  email:`${prenom.toLowerCase()}@mail.com`,
  disponibilites:{'2027-01-22':'dispo','2027-03-12':'dispo','2027-03-15':'indispo','2027-03-18':'incertain'},
}));

// Deux remplaçant·es, disponibles là où des titulaires manquent : sans eux, la
// section « Remplaçant·es proposé·es » du panneau d'affectation ne peut pas
// s'afficher, et une capture ne dirait rien de ce qu'elle vaut.
MUS.push(
  { id:'demo-mus-15', prenom:'Camille', nom:'Durand', instrument:'Violon', pupitre:'Cordes',
    statutPoste:'remplacant', rang:1, telephone:'06 26 45 66 84', email:'camille@mail.com',
    disponibilites:{'2027-03-15':'dispo','2027-03-13':'dispo'} },
  { id:'demo-mus-16', prenom:'Jules', nom:'Moreau', instrument:'Violoncelle', pupitre:'Cordes',
    statutPoste:'remplacant', rang:2, telephone:'06 27 46 67 85', email:'jules@mail.com',
    disponibilites:{'2027-03-15':'dispo'} },
);

const DATES = [
  ['2027-01-22','Paris','Studio Ferber — répétitions','validee','Amener les conducteurs v2'],
  ['2027-03-12','Lyon','Salle 3000','validee',''],
  ['2027-03-13','Grenoble','Le Summum','validee',''],
  ['2027-03-15','Marseille','Le Dôme','option',''],
  ['2027-03-18','Toulouse','Zénith','option','Relancer le Zénith avant le 20 févr.'],
].map(([date,ville,lieu,statut,commentaire],i) => ({
  id:`d${i}`, date, ville, lieu, statut, commentaire,
  musiciensAssignes: MUS.slice(0, statut==='option' ? 4 : 8).map(m=>m.id),
  techniciensAssignes:['demo-tech-01','demo-tech-02'], linkedToNext: i===1,
}));

// L'espace Devis se capture avec les devis réels d'exemple : le fichier de
// modèles est LA vérité (les mêmes données que le bouton d'import de la page).
const EXEMPLES_DEVIS = require('../modeles/devis-exemples.json');

const SEED = {
  // Le premier chiffrage est rattaché à la tournée de démo : sans cela, ni le
  // rappel de budget sur la carte de tournée ni le rappel de projet dans
  // l'éditeur n'ont quoi que ce soit à montrer.
  devis: EXEMPLES_DEVIS.devis.map((d, i) => (i === 0 ? { ...d, tourneeId: 'demo-tour1' } : d)),
  devis_clients: EXEMPLES_DEVIS.clients,
  devis_postes: [
    { id:'demo-poste-01', intitule:'Ingénieur du son', unite:'Journée', prix:280, regime:'production' },
    { id:'demo-poste-02', intitule:'Musicien·ne (cachet)', unite:'Cachets', prix:280, regime:'musicien' },
    { id:'demo-poste-03', intitule:'Déjeuner', unite:'Repas', prix:20, regime:'aucun' },
  ],
  musiciens: MUS,
  techniciens: [
    {id:'demo-tech-01',prenom:'Marie',nom:'Dupont',poste:'Ingé son façade',pole:'Son',telephone:'06 32 51 72 90',email:'marie@mail.com',disponibilites:{}},
    {id:'demo-tech-02',prenom:'Léo',nom:'Bernard',poste:'Ingé lumière',pole:'Lumière',telephone:'06 33 52 73 91',email:'leo@mail.com',disponibilites:{}},
  ],
  // Un lot, un sous-lot et un lot sans provenance, avec des mouvements des deux
  // sens : sans eux, l'agenda du matériel se capture vide et ne dit rien.
  prestataires: [{ id:'demo-prest-01', nom:'DUSHOW', notes:'',
    adresse:'12 rue de la Fonderie, 93200 Saint-Denis', telephone:'01 48 09 20 20',
    contactNom:'Sylvain, magasin' }],
  chauffeurs: [
    { id:'demo-chauf-01', prenom:'Bruno', nom:'Marchand', telephone:'06 45 78 91 23', email:'' },
    { id:'demo-chauf-02', prenom:'Sonia', nom:'Vialla', telephone:'06 77 12 34 56', email:'' },
  ],
  // Trois semis, dont une partagée entre les deux tournées : c'est elle qui
  // doit déclencher l'alerte de chevauchement.
  vehicules: [
    { id:'demo-veh-01', nom:'Semi 1 — son', type:'semi', hayon:true, chauffeurDefautId:'demo-chauf-01' },
    { id:'demo-veh-02', nom:'Semi 2 — lumière', type:'semi', hayon:false, chauffeurDefautId:'demo-chauf-02' },
    { id:'demo-veh-03', nom:'Semi 3 — structure', type:'semi', hayon:true, chauffeurDefautId:'' },
  ],
  // Cinq échanges couvrant les cinq états, dont un déposé sans retour calé
  // (celui qui doit remonter en tête du suivi) et un sur la seconde tournée.
  echanges: [
    { id:'demo-ech-01', tourneeId:'demo-tour1', lotId:'demo-lot-01',
      vehiculeId:'demo-veh-02', vehiculeRetourId:'demo-veh-02', chauffeurId:'',
      prestataireId:'demo-prest-01', portee:'partiel', elements:'Console FOH — carte son HS',
      motif:'panne', depotDate:'2027-03-13', depotHeure:'09:00',
      recupDate:'', recupHeure:'', etat:'depose',
      notes:'Dossier SAV 4471 — ils rappellent lundi.' },
    { id:'demo-ech-02', tourneeId:'demo-tour1', lotId:'demo-lot-01',
      vehiculeId:'demo-veh-02', vehiculeRetourId:'demo-veh-02', chauffeurId:'',
      prestataireId:'demo-prest-01', portee:'partiel', elements:'6 découpes 614',
      motif:'complement', depotDate:'2027-03-16', depotHeure:'14:00',
      recupDate:'2027-03-16', recupHeure:'18:30', etat:'planifie', notes:'' },
    { id:'demo-ech-03', tourneeId:'demo-tour1', lotId:'demo-lot-03',
      vehiculeId:'demo-veh-01', vehiculeRetourId:'demo-veh-01', chauffeurId:'',
      prestataireId:'', portee:'total', elements:'', motif:'retour',
      depotDate:'', depotHeure:'', recupDate:'', recupHeure:'',
      etat:'a_planifier', notes:'À caler avec le régisseur cuivres.' },
    { id:'demo-ech-04', tourneeId:'demo-tour1', lotId:'demo-lot-01',
      vehiculeId:'demo-veh-02', vehiculeRetourId:'demo-veh-03', chauffeurId:'demo-chauf-01',
      prestataireId:'demo-prest-01', portee:'partiel', elements:'2 ponts alu 3 m',
      motif:'echange', depotDate:'2027-03-11', depotHeure:'07:30',
      recupDate:'2027-03-12', recupHeure:'11:00', etat:'recupere', notes:'' },
    // Seconde tournée, même semi, même jour : le chevauchement à signaler.
    { id:'demo-ech-05', tourneeId:'demo-tour2', lotId:'demo-lot-04',
      vehiculeId:'demo-veh-02', vehiculeRetourId:'demo-veh-02', chauffeurId:'',
      prestataireId:'demo-prest-01', portee:'partiel', elements:'Ampli de secours',
      motif:'panne', depotDate:'2027-03-13', depotHeure:'15:00',
      recupDate:'', recupHeure:'', etat:'depose', notes:'' },
  ],
  lots_materiel: [
    { id:'demo-lot-01', nom:'kit light', categorie:'lumiere', parentId:'', provenanceId:'demo-prest-01',
      tourneeId:'demo-tour1', vehiculeId:'demo-veh-02',
      priseEnCharge:{ date:'2027-03-10', heure:'08:00', prestataireId:'demo-prest-01', notes:'Quai nord, demander Sylvain' },
      description:'', elements:[], datePrepa:'2027-03-10', datePickup:'2027-03-11',
      mouvements:[
        { id:'mvt1', date:'2027-03-12', heure:'12:30', type:'sortie', description:'switch desk' },
        { id:'mvt2', date:'2027-03-12', heure:'18:00', type:'entree', description:'console de remplacement' },
        { id:'mvt3', date:'2027-03-15', heure:'', type:'sortie', description:'retour des barres non utilisées' },
      ],
      retourPrestataireDate:'2027-03-20', retourPrestataireHeurePickup:'08:00',
      retourPrestataireHeureLivraison:'14:30', notes:'' },
    { id:'demo-lot-02', nom:'Barres LED sol', categorie:'lumiere', parentId:'demo-lot-01', provenanceId:'demo-prest-01',
      tourneeId:'demo-tour1', vehiculeId:'demo-veh-02', priseEnCharge:{},
      description:'', elements:[], datePrepa:'', datePickup:'',
      mouvements:[{ id:'mvt4', date:'2027-03-13', heure:'09:15', type:'entree', description:'complément de 6 barres' }],
      retourPrestataireDate:'', retourPrestataireHeurePickup:'', retourPrestataireHeureLivraison:'', notes:'' },
    { id:'demo-lot-03', nom:'Backline cuivres', categorie:'backline', parentId:'', provenanceId:'',
      tourneeId:'demo-tour1', vehiculeId:'demo-veh-01',
      priseEnCharge:{ date:'2027-03-09', heure:'14:00', prestataireId:'', notes:'' },
      description:'2 amplis, 1 pédalier', elements:[], datePrepa:'2027-03-09', datePickup:'',
      mouvements:[], retourPrestataireDate:'', retourPrestataireHeurePickup:'',
      retourPrestataireHeureLivraison:'', notes:'' },
    { id:'demo-lot-04', nom:'Kit son Nocturnes', categorie:'son', parentId:'', provenanceId:'demo-prest-01',
      tourneeId:'demo-tour2', vehiculeId:'demo-veh-02',
      priseEnCharge:{ date:'2027-03-12', heure:'09:30', prestataireId:'demo-prest-01', notes:'' },
      description:'', elements:[], datePrepa:'', datePickup:'', mouvements:[],
      retourPrestataireDate:'2027-03-25', retourPrestataireHeurePickup:'09:00',
      retourPrestataireHeureLivraison:'16:00', notes:'' },
    // Volontairement sans tournée : c'est lui qui déclenche le rattrapage.
    { id:'demo-lot-05', nom:'Praticables (ancien)', categorie:'structure', parentId:'', provenanceId:'',
      tourneeId:'', vehiculeId:'', priseEnCharge:{},
      description:'', elements:[], datePrepa:'', datePickup:'', mouvements:[],
      retourPrestataireDate:'', retourPrestataireHeurePickup:'',
      retourPrestataireHeureLivraison:'', notes:'' },
  ],
  // Deux remarques reçues depuis des liens partagés, dont une déjà traitée.
  remarques: [
    { id:'rem1', tourneeId:'demo-tour1', dateId:'d1', accesId:'acc-salle-01',
      auteur:'Salle 3000 — Lyon', sujet:'Horaires',
      message:"Le load in à 8h est trop tôt : notre quai n'ouvre qu'à 9h.",
      traitee:false, createdAt:'2026-08-20T09:12:00Z' },
    { id:'rem2', tourneeId:'demo-tour1', dateId:'d1', accesId:'acc-sm-01',
      auteur:'Karim (stage manager)', sujet:'Déchargement',
      message:'La fosse est inaccessible en semi, il faut passer par le côté cour.',
      traitee:true, createdAt:'2026-08-19T16:40:00Z' },
  ],
  // Trois listes de remplaçant·es aux trois états : complète, incomplète, vide.
  remplacant_prefs: [
    { id:'demo-mus-01', items:[
      { rang:1, source:'roster', personId:'demo-mus-15' },
      { rang:2, source:'libre', prenom:'Hélène', nom:'Vasseur' },
      { rang:3, source:'libre', prenom:'Tom', nom:'Riquier' },
    ]},
    { id:'demo-mus-02', items:[
      { rang:1, source:'roster', personId:'demo-mus-15' },
    ]},
    // Une liste qui inverse l'ordre alphabétique : si le panneau la suit
    // vraiment, Jules passe avant Camille.
    { id:'demo-mus-04', items:[
      { rang:1, source:'roster', personId:'demo-mus-16' },
      { rang:2, source:'roster', personId:'demo-mus-15' },
    ]},
  ],
  // Trois dossiers sociaux aux trois états : vide, commencé, complet.
  infos_sociales: [
    { id:'demo-mus-01', personType:'musicien',
      dateNaissance:'1991-04-12', lieuNaissance:'Marseille', nationalite:'française',
      adresse:'12 rue des Lilas, 75011 Paris', numSecu:'1 91 04 13 055 123 45',
      iban:'FR76 3000 4000 0300 0000 0000 143', titulaireCompte:'Roxanne Rabatti',
      numCongesSpectacles:'CS-882145', numAudiens:'AU-559021', extra:{} },
    { id:'demo-mus-02', personType:'musicien',
      dateNaissance:'1988-11-03', lieuNaissance:'Lyon', nationalite:'',
      adresse:'', numSecu:'', iban:'', titulaireCompte:'',
      numCongesSpectacles:'', numAudiens:'', extra:{} },
    { id:'demo-mus-03', personType:'musicien', extra:{} },
  ],
  // Deux accès de partage, dont un de salle : c'est lui qui porte les boutons
  // PDF et Écrire de partage.html.
  acces_logistique: [
    { id:'acc-sm-01', libelle:'Karim (stage manager)', tourneeId:'demo-tour1',
      type:'stage_manager', datesIds:[], email:'', actif:true },
    { id:'acc-salle-01', libelle:'Salle 3000 — Lyon', tourneeId:'demo-tour1',
      type:'salle', datesIds:['d1'], email:'regie@salle3000.fr', actif:true },
  ],
  tournees: [{
    id:'demo-tour1', nom:"L'Atelier de Joe Hisaishi — Printemps 2027",
    cachetStatut:'defini', cachetMontant:320, dates:DATES,
    nomenclature:[{pupitre:'Cordes',nombre:5},{pupitre:'Bois',nombre:4}],
    // Les exigences de la tournée : elles ne changent pas d'une date à l'autre,
    // et descendent jusqu'aux liens de salle et de stage manager.
    techniqueTournee:{
      pointsJus:[
        {id:'j1', position:'Jardin lointain', puissance:'400 A', typePrise:'P17 tri 400A', differentiel:'300 mA'},
        {id:'j2', position:'Cour face', puissance:'125 A', typePrise:'P17 tri 125A', differentiel:'30 mA'},
        {id:'j3', position:'Régie façade', puissance:'32 A', typePrise:'P17 tri 32A', differentiel:'30 mA'},
      ],
      accesScene:[
        {id:'a1', position:'Quai nord', notes:'de plain-pied'},
        {id:'a2', position:'Côté cour', notes:'12 marches'},
      ],
      multis:{nombre:3, depart:'Jardin lointain', notes:'60 m, passage sous gradin'},
    },
  }, {
    // Une seconde tournée menée en parallèle : sans elle, l'alerte de
    // chevauchement n'a rien à comparer et le suivi ne montre qu'un chantier.
    id:'demo-tour2', nom:'Nocturnes — Automne 2027',
    cachetStatut:'non_defini', cachetMontant:null, nomenclature:[],
    dates:[
      {id:'n0', date:'2027-03-13', ville:'Reims', lieu:'La Cartonnerie', statut:'validee',
       commentaire:'', musiciensAssignes:[], techniciensAssignes:[]},
      {id:'n1', date:'2027-03-19', ville:'Metz', lieu:'Les Trinitaires', statut:'option',
       commentaire:'', musiciensAssignes:[], techniciensAssignes:[]},
    ],
    techniqueTournee:{},
  }, {
    // Un enregistrement en studio : même table, même page, filtrée par
    // ?type=recording. Sans lui, la page Recording se capture vide.
    id:'demo-reco1', nom:'Album — Les Soudaines vol. II', type:'recording',
    cachetStatut:'defini', cachetMontant:280, nomenclature:[{pupitre:'Cordes',nombre:8}],
    recording:{
      label:'Les Soudaines Records', directionArtistique:'Claire Fontenoy',
      livraison:'24 bits / 96 kHz — stems + mix stéréo',
      lienMasters:'https://drive.google.com/drive/folders/demo-masters',
    },
    dates:[
      {id:'r0', date:'2027-02-08', ville:'Paris', lieu:'Studio Ferber', cabine:'Grand studio',
       titres:'Ouverture, Nocturne', seance:'journee', type:'prise', statut:'validee',
       commentaire:'Balance micros dès 8h.', travelMode:'train', linkedToNext:true,
       musiciensAssignes:MUS.slice(0,6).map(m=>m.id), techniciensAssignes:['demo-tech-01']},
      {id:'r1', date:'2027-02-09', ville:'Paris', lieu:'Studio Ferber', cabine:'Grand studio',
       titres:'Marche, Épilogue', seance:'matin', type:'prise', statut:'validee',
       commentaire:'', travelMode:'train',
       musiciensAssignes:MUS.slice(0,6).map(m=>m.id), techniciensAssignes:['demo-tech-01']},
      {id:'r2', date:'2027-02-15', ville:'Paris', lieu:'Studio Ferber', cabine:'Cabine B',
       titres:'Solos violon', seance:'aprem', type:'overdub', statut:'option',
       commentaire:'', travelMode:'train',
       musiciensAssignes:['demo-mus-01'], techniciensAssignes:[]},
      {id:'r3', date:'2027-03-02', ville:'Bruxelles', lieu:'ICP Studios', cabine:'',
       titres:'', seance:'soir', type:'mixage', statut:'option',
       commentaire:'Mixage avec le DA.', travelMode:'train',
       musiciensAssignes:[], techniciensAssignes:['demo-tech-01']},
    ],
    techniqueTournee:{},
  }],
  // Deux feuilles : une de route (date de tournée) et une de studio (séance de
  // recording). Sans elles, feuilles-de-route.html se capture vide dans les
  // deux sens et on ne voit rien de ce que le filtre par nature change.
  feuilles_route: [
    { id:'demo-fdr-01', artistName:"L'Atelier de Joe Hisaishi", eventDate:'2027-03-12',
      venueCity:'Lyon', venueSalle:'Salle 3000', projetType:'tournee',
      contacts:[{ id:'c1', role:'Régie', nom:'Karim Bel', indicatif:'+33', tel:'6 12 00 11 22', email:'karim@salle3000.fr' }],
      trajets:[{ id:'t1', label:'Aller', mode:'train', train:'TGV 6607',
                 departVille:'Paris Gare de Lyon', departHeure:'08:12',
                 arriveeVille:'Lyon Part-Dieu', arriveeHeure:'10:08',
                 passengers:[{ id:'pa1', nom:'Orchestre', voiture:'12', place:'41' }] }],
      planning:[{ id:'p1', heure:'14:00', texte:'Balances', highlight:false, tag:'' },
                { id:'p2', heure:'20:30', texte:'Concert', highlight:true, tag:'' }],
      lieu:{ nom:'Salle 3000 — Cité internationale', adresse:'50 quai Charles de Gaulle, 69006 Lyon', jauge:'2 900 pax', billetterie:'1840' },
      hotel:{ nom:'Hôtel Mercure Cité Internationale', adresse:'Quai Charles de Gaulle, Lyon', tel:'04 78 17 50 50',
              checkin:'15:00', checkout:'11:00', mapsLink:'', breakfast:'inclus', type:'hotel', typeDetail:'' },
      partitions:{ lien:'https://drive.google.com/drive/folders/demo-partitions', note:'Version du 2 mars', parPersonne:[] },
      bonus:'Loges au niveau -1.', merchandisingOk:true, ticketLinks:[] },
    { id:'demo-fdr-02', artistName:'Album — Les Soudaines vol. II', eventDate:'2027-02-08',
      venueCity:'Paris', venueSalle:'Studio Ferber', projetType:'recording',
      studio:{ cabine:'Grand studio', titres:'Ouverture, Nocturne' },
      contacts:[{ id:'c2', role:'Direction artistique', nom:'Claire Fontenoy', indicatif:'+33', tel:'6 44 55 66 77', email:'claire@lessoudaines.fr' },
                { id:'c3', role:'Ingé son', nom:'Marie Dupont', indicatif:'+33', tel:'6 32 51 72 90', email:'marie@mail.com' }],
      trajets:[],
      planning:[{ id:'p3', heure:'08:30', texte:'Installation et balance micros', highlight:false, tag:'' },
                { id:'p4', heure:'10:00', texte:'Première prise — Ouverture', highlight:true, tag:'' },
                { id:'p5', heure:'13:00', texte:'Déjeuner', highlight:false, tag:'repas' }],
      lieu:{ nom:'Studio Ferber', adresse:'96 rue du Faubourg Saint-Antoine, 75012 Paris', jauge:'', billetterie:'' },
      hotel:{ nom:'', adresse:'', tel:'', checkin:'', checkout:'', mapsLink:'', breakfast:'', type:'hotel', typeDetail:'' },
      partitions:{ lien:'https://drive.google.com/drive/folders/demo-partitions-studio', note:'Conducteurs v3', parPersonne:[] },
      bonus:'Prévoir les sourdines pour les cuivres.', merchandisingOk:false, ticketLinks:[],
      // Ce que l'application pose d'office sur une feuille de studio : ni
      // voyage ni hôtel, l'orchestre enregistre dans sa propre ville.
      sectionsEnabled:{ voyage:false, hotel:false } },
  ],
  // Une fiche de date déjà remplie, pour capturer technique-date.html.
  moyens_salle: [{
    id:'demo-tour1::d1', tourneeId:'demo-tour1', dateId:'d1',
    planStatut:'recu', planUrl:'https://exemple.fr/plan.pdf',
    planValideNous:true, planValideSalle:false, planChargeStatut:'envoye',
    bureauElectriqueSurPlace:true, bureauElectriqueHoraire:'14h00',
    bureauElectriqueNom:'Michel Ferrand', bureauElectriqueTel:'06 11 22 33 44',
    bureauElectriqueDossierUrl:'https://exemple.fr/dossier-elec.pdf',
    bureauAccrocheSurPlace:false, bureauAccrocheHoraire:'', bureauAccrocheNom:'',
    bureauAccrocheTel:'', bureauAccrocheDossierUrl:'',
    nombreSemisSimultanees:3,
    emplacementsDechargement:[
      {emplacement:'cote_scene', niveau:'sol'}, {emplacement:'fosse', niveau:'sol'},
      {emplacement:'scene', niveau:'scene'},
    ],
    accesNotes:'Porte de 3,50 m, 12 marches côté cour.',
    horairesJournee:[{id:'h1', label:'Load in', heure:'08:00'},{id:'h2', label:'Get in', heure:'14:00'}],
    // Les moyens demandés sont le cœur de la demande faite à une salle : sans
    // eux, on jugeait le PDF salle sans sa partie principale.
    roadiesVacations:[
      {horaireDebut:'08:00',horaireFin:'13:00',nombreDemande:12,notes:'accès par le quai nord'},
      {horaireDebut:'23:00',horaireFin:'01:30',nombreDemande:10},
    ],
    chariotsVacations:[
      {horaireDebut:'08:00',horaireFin:'13:00',nombreChariotsDemande:2,nombreCaristesDemande:2,confirme:true},
    ],
    riggVacations:[
      {horaireDebut:'08:00',horaireFin:'12:00',nombreDemande:4,nombreSol:1,nombreGrill:3},
    ],
    hauteurGrill:'17', ouvertureScene:'25', profondeurScene:'12', puissance:'2× 400A',
    typeCourant:'triphasé', chargeMaxAccroche:'2 t', typeSol:'béton',
    pointsDistribution:[
      {id:'p1', position:'Jardin lointain', notes:'coffret 400 A, cadenassé'},
      {id:'p2', position:'Sous scène côté cour', notes:'2× 63 A'},
    ],
    contactsSalle:[], contactsTechniciensIds:[], planImagePath:'', semisPositions:[], notes:'',
  }, {
    // Une seconde fiche de date : sans elle, le filtre &dates= de page-salle.html
    // n'aurait rien à filtrer et son export ne se vérifierait pas.
    id:'demo-tour1::d3', tourneeId:'demo-tour1', dateId:'d3',
    planStatut:'non_demande', planUrl:'', planValideNous:false, planValideSalle:false,
    planChargeStatut:'non_envoye',
    bureauElectriqueSurPlace:true, bureauElectriqueHoraire:'', bureauElectriqueNom:'',
    bureauElectriqueTel:'', bureauElectriqueDossierUrl:'',
    bureauAccrocheSurPlace:true, bureauAccrocheHoraire:'', bureauAccrocheNom:'',
    bureauAccrocheTel:'', bureauAccrocheDossierUrl:'',
    nombreSemisSimultanees:2,
    emplacementsDechargement:[{emplacement:'scene', niveau:'scene'},{emplacement:'fosse', niveau:'sol'}],
    accesNotes:'', horairesJournee:[{id:'h9', label:'Load in', heure:'10:00'}],
    roadiesVacations:[], chariotsVacations:[], riggVacations:[],
    hauteurGrill:'12', ouvertureScene:'20', profondeurScene:'', puissance:'250A',
    typeCourant:'', chargeMaxAccroche:'', typeSol:'',
    contactsSalle:[], contactsTechniciensIds:[], planImagePath:'', semisPositions:[], notes:'',
  }],
  // Réponse de get_recap_logistique — technique-partage.html ne lit pas les
  // tables, mais cette seule fonction. Assez de dates pour que le sommaire ait
  // quelque chose à sommer, en snake_case comme le renvoie la base.
  __recap: {
    libelle:'Logistique de tournée', type:'stage_manager', datesIds:[],
    tournee: {
      id:'demo-tour1', nom:'EXPEDITION 33',
      equipesRoad:[{id:'eq1',label:'Lumière',couleur:'#F5C518'},{id:'eq2',label:'Son',couleur:'#3b82f6'}],
      techniqueTournee:{
        pointsJus:[
          {id:'j1', position:'Jardin lointain', puissance:'400 A', typePrise:'P17 tri 400A', differentiel:'300 mA'},
          {id:'j2', position:'Cour face', puissance:'125 A', typePrise:'P17 tri 125A', differentiel:'30 mA'},
          {id:'j3', position:'Régie façade', puissance:'32 A', typePrise:'P17 tri 32A', differentiel:'30 mA'},
        ],
        accesScene:[
          {id:'a1', position:'Quai nord', notes:'de plain-pied'},
          {id:'a2', position:'Côté cour', notes:'12 marches'},
        ],
        multis:{nombre:3, depart:'Jardin lointain', notes:'60 m, passage sous gradin'},
      },
      dates:[
        {id:'r0',date:'2027-03-10',ville:'Épernay',lieu:'Le Millenium'},
        {id:'r1',date:'2027-03-12',ville:'Lyon',lieu:'Salle 3000'},
        {id:'r2',date:'2027-03-13',ville:'Grenoble',lieu:'Le Summum'},
        {id:'r3',date:'2027-03-15',ville:'Marseille',lieu:'Le Dôme'},
        {id:'r4',date:'2027-03-18',ville:'Toulouse',lieu:'Zénith'},
        {id:'r5',date:'2027-03-20',ville:'Bordeaux',lieu:'Arkéa Aréna'},
        {id:'r6',date:'2027-03-22',ville:'Nantes',lieu:'Zénith Métropole'},
        {id:'r7',date:'2027-03-24',ville:'Rennes',lieu:'Le Liberté'},
      ],
    },
    moyens: [
      { date_id:'r0', nombre_semis_simultanees:4,
        emplacements_dechargement:[
          {emplacement:'cote_scene', niveau:'sol'}, {emplacement:'fosse', niveau:'sol'},
          {emplacement:'scene', niveau:'scene'}, {emplacement:'scene', niveau:'les_deux'},
        ],
        hauteur_grill:'17', ouverture_scene:'25', puissance:'2× 400A',
        bureau_electrique_sur_place:true, bureau_electrique_horaire:'08:00',
        bureau_electrique_nom:'Michel Ferrand', bureau_electrique_tel:'06 11 22 33 44',
        bureau_electrique_dossier_url:'https://exemple.fr/dossier-elec.pdf',
        bureau_accroche_sur_place:false,
        contacts_salle:[{role:'rigg', nom:'Michel', tel:'06 11 22 33 44'}],
        horaires_journee:[{heure:'08:00',label:'Load in'},{heure:'12:30',label:'Get in'}],
        roadies_vacations:[{horaireDebut:'11:00',horaireFin:'16:00',nombreDemande:26,equipes:[{equipeId:'eq1',nombre:5},{equipeId:'eq2',nombre:5}]}],
        chariots_vacations:[{horaireDebut:'06:00',horaireFin:'12:30',nombreChariotsDemande:2,nombreCaristesDemande:2,confirme:true}],
        points_distribution:[
          {id:'p1', position:'Jardin lointain', notes:'coffret 400 A, cadenassé'},
          {id:'p2', position:'Sous scène côté cour', notes:'2× 63 A'},
        ],
        rigg_vacations:[], acces_notes:'Porte de 3,50 m, 12 marches côté cour.' },
      // Une journée volontairement surchargée : c'est elle qui met à l'épreuve
      // la promesse de la feuille unique des exports PDF (voir pdf-charte.js).
      { date_id:'r1', nombre_semis_simultanees:6,
        emplacements_dechargement:[
          {emplacement:'scene', niveau:'scene'}, {emplacement:'cote_scene', niveau:'sol'},
          {emplacement:'fosse', niveau:'sol'}, {emplacement:'scene', niveau:'les_deux'},
          {emplacement:'autre', niveau:'sol'}, {emplacement:'cote_scene', niveau:'scene'},
        ],
        hauteur_grill:'14 m sous grill, 12 m sous passerelle', ouverture_scene:'18',
        puissance:'400A + 2× 125A', 
        bureau_electrique_sur_place:true, bureau_electrique_horaire:'07:30',
        bureau_electrique_nom:'Cabinet Vasseur', bureau_electrique_tel:'06 44 55 66 77',
        bureau_accroche_sur_place:true, bureau_accroche_horaire:'08:30',
        bureau_accroche_nom:'Structura', bureau_accroche_tel:'06 88 99 00 11',
        contacts_salle:[
          {role:'régie générale', nom:'Sophie Marlin', tel:'06 21 32 43 54'},
          {role:'accueil', nom:'Karim Belaïd', tel:'06 65 76 87 98'},
          {role:'sécurité', nom:'Poste central', tel:'04 72 00 00 00'},
        ],
        horaires_journee:[
          {heure:'06:00',label:'Arrivée des semis'}, {heure:'07:30',label:'Load in'},
          {heure:'09:00',label:'Montage lumière'}, {heure:'11:00',label:'Montage son'},
          {heure:'13:00',label:'Pause déjeuner'}, {heure:'14:30',label:'Balances'},
          {heure:'17:00',label:'Get in'}, {heure:'19:30',label:'Ouverture des portes'},
          {heure:'20:30',label:'Lever de rideau'}, {heure:'23:00',label:'Load out'},
        ],
        roadies_vacations:[
          {horaireDebut:'07:30',horaireFin:'13:00',nombreDemande:24,notes:'accès par la rue arrière',
           equipes:[{equipeId:'eq1',nombre:8},{equipeId:'eq2',nombre:6}]},
          {horaireDebut:'23:00',horaireFin:'02:00',nombreDemande:18,
           equipes:[{equipeId:'eq1',nombre:6},{equipeId:'eq2',nombre:6}]},
        ],
        chariots_vacations:[
          {horaireDebut:'06:00',horaireFin:'13:00',nombreChariotsDemande:3,nombreCaristesDemande:3,confirme:true},
          {horaireDebut:'23:00',horaireFin:'02:00',nombreChariotsDemande:2,nombreCaristesDemande:2},
        ],
        rigg_vacations:[
          {horaireDebut:'07:30',horaireFin:'12:00',nombreDemande:6,nombreSol:2,nombreGrill:4,notes:'harnais fournis'},
        ],
        points_distribution:[
          {id:'p1', position:'Jardin lointain', notes:'coffret 400 A cadenassé — clé en régie'},
          {id:'p2', position:'Cour face', notes:'2× 125 A'},
          {id:'p3', position:'Régie façade', notes:'32 A sur ligne propre'},
        ],
        acces_notes:'Quai de déchargement à 40 m du plateau, pente de 6 %. Porte de 3,20 m par 3,80 m. Prévoir des plaques de roulage pour la traversée du hall, sol en parquet protégé.' },
    ],
    lots: [
      { id:'demo-lot-01', nom:'kit light', parent_id:null, description:'',
        mouvements:[
          { id:'mvt1', date:'2027-03-12', heure:'12:30', type:'sortie', description:'switch desk' },
          { id:'mvt2', date:'2027-03-12', heure:'18:00', type:'entree', description:'console de remplacement' },
          { id:'mvt3', date:'2027-03-10', heure:'', type:'sortie', description:'retour des barres non utilisées' },
        ],
        retour_prestataire_date:'2027-03-10', retour_prestataire_heure:'08:00',
        retour_prestataire_heure_livraison:'14:30' },
      { id:'demo-lot-03', nom:'Backline cuivres', parent_id:null, description:'2 amplis, 1 pédalier',
        mouvements:[], retour_prestataire_date:null, retour_prestataire_heure:'', retour_prestataire_heure_livraison:'' },
    ],
    carnets:[], vehicules:[], chauffeurs:[], affectationsTransport:[],
    fichesTechniques:[], techniciensContacts:[],
  },
};

// Prépare un contexte navigateur où le site croit parler à Supabase. Exporté :
// outils/capture-pdf.cjs s'en sert aussi, plutôt que de recopier le faux
// CurieuxDB — deux copies auraient divergé au premier champ ajouté.
async function preparerContexte(ctx) {

  // THEME=dark force le mode sombre : le choix manuel stocké dans localStorage
  // l'emporte sur le système (voir applyAutoTheme dans brand-assets.js), c'est
  // donc le canal fiable pour capturer les deux thèmes.
  if (process.env.THEME === 'dark') {
    await ctx.addInitScript(() => { try { localStorage.setItem('curieuxTheme', 'dark'); } catch (e) {} });
  }

  // Court-circuite la couche données : les pages appellent CurieuxDB, on lui
  // fait rendre le jeu de démo sans réseau ni authentification.
  await ctx.addInitScript(seed => {
    window.__SEED = seed;

    // La redirection vers la connexion est bloquée au niveau du navigateur
    // (ctx.route plus bas) : location.replace n'est pas redéfinissable, et
    // neutraliser requireAdminAuth par affectation ne tiendrait pas non plus,
    // ui-helpers.js le (re)définissant en chargeant après ce script.

    window.hideCurieuxPageUntilAuth = () => {};
  }, SEED);

  // db.js déclare « const CurieuxDB » : une liaison lexicale, jamais posée sur
  // window. Aucun script injecté ne peut donc l'atteindre. On remplace le
  // fichier lui-même, au niveau réseau, par un faux qui sert le jeu de démo et
  // répond oui aux contrôles d'accès — le garde d'authentification passe alors
  // de lui-même, sans qu'on ait à bloquer la moindre redirection.
  await ctx.route('**/assets/db.js', route => route.fulfill({
    contentType: 'application/javascript; charset=utf-8',
    body: `
const __seed = ${JSON.stringify(SEED)};
const CurieuxDB = new Proxy({
  fetchAll: async t => JSON.parse(JSON.stringify(__seed[t] || [])),
  fetchOne: async () => null,
  // Rend null, comme la base quand aucun instantané n'existe encore — la
  // liste vide du Proxy ferait croire à un instantané présent mais sans entries.
  fetchSnapshot: async () => null,
  subscribe: () => {},
  syncCollection: async () => ({ error: null }),
  upsertOne: async () => ({ error: null }),
  getSession: async () => ({ user:{ id:'demo', email:'demo@curieux.fr' } }),
  hasAppAccess: async () => true,
  // « ?refus=admin » ou « ?refus=technique » dans l'URL fait répondre non au
  // contrôle correspondant : c'est le seul moyen de capturer l'écran d'accès
  // réservé, qu'on ne verrait jamais avec un compte autorisé.
  isSuperAdmin: async () => !location.search.includes('refus=admin'),
  hasDirectionTechniqueAccess: async () => !location.search.includes('refus=technique'),
  currentRole: async () => 'admin',
  // Deux demandes en attente, une par nature de projet : c'est le seul moyen de
  // vérifier que l'espace perso ne leur donne pas la même icône.
  mesDemandesDispo: async () => ({
    personId:'demo-mus-01', personType:'musicien', prenom:'Roxanne', nom:'Rabatti',
    statutPoste:'titulaire',
    demandes:[
      { token:'jeton-demo', tourneeNom:"L'Atelier de Joe Hisaishi — Printemps 2027",
        tourneeType:'tournee', repondu:false, creeLe:'2026-08-01T10:00:00Z' },
      { token:'jeton-demo-reco', tourneeNom:'Album — Les Soudaines vol. II',
        tourneeType:'recording', repondu:false, creeLe:'2026-08-02T10:00:00Z' },
    ],
  }),
  // Pages à jeton : la tournée est rendue telle qu'elle est en base (colonnes
  // brutes), la personne aussi.
  getTourneeByToken: async () => {
    const t = __seed.tournees[0];
    return { id:t.id, nom:t.nom, dates:t.dates, cachet_statut:'defini', cachet_montant:320 };
  },
  // Un jeton personnel permanent désigne une personne sans passer par une
  // demande de dispo : c'est le cas que servaient mal mes-infos et
  // mes-remplacants.
  resolvePersonToken: async () => ({ person_id: __seed.musiciens[0].id, person_type: 'musicien' }),
  getOwnPersonByToken: async () => JSON.parse(JSON.stringify(__seed.musiciens[0])),
  // Fiche sociale complète : sinon dispo-titulaire.html ouvre sa modale de
  // complétion au chargement, qui recouvre la page et bloque toute capture.
  getInfosSocialesByToken: async () => ({
    genre:'f', prenomCivil:'', dateNaissance:'1991-04-12', lieuNaissance:'Marseille',
    nationalite:'française', adresse:'12 rue des Lilas, 75011 Paris',
    numSecu:'1 91 04 13 055 123 45', iban:'FR76 3000 4000 0300 0000 0000 143',
    bic:'AGRIFRPP', titulaireCompte:'Roxanne Rabatti',
    numCongesSpectacles:'CS-882145', numAudiens:'AU-559021',
    contactUrgenceNom:'Jean Rabatti', contactUrgenceTel:'06 99 88 77 66',
    tailleVetement:'M', extra:{},
  }),
  getCachetOverrideByToken: async () => null,
  // Jeton personnel permanent : la fiche de prise en main en dépend, et un
  // jeton vide ferait rendre une fiche sans lien — donc sans QR à relire.
  ensureAccesPersonnel: async (id) => ({ token: 'demo-jeton-' + id }),
  getContactProduction: async () => ({ nom:'Aloïs — production', telephone:'06 12 34 56 78' }),
  // Le tableau des comptes de l'admin : sans lui, la page se capture vide et
  // la case d'accès à la direction technique reste invisible.
  // Réglages de l'espace Devis : l'identité légale telle que la migration la
  // pré-remplit — sans elle, l'en-tête du PDF de devis se capture vide.
  fetchDevisReglages: async () => ({
    absent: false, nom: 'LES SOUDAINES', siret: '938 916 244 00016',
    adresse: '61 rue de Lyon 75012 Paris', ape: 'Arts du spectacle vivant (90.01Z)',
    tvaIntracom: 'FR82938916244', representant: 'Représentée par Daniel SICARD, son président',
    email: 'lessoudaines@gmail.com', tel: '+33 6 08 18 43 90',
    tauxAuteur: 4, tauxMusicien: 60, tauxProduction: 67,
    tvaDefaut: 20, validiteJours: 30,
    conditionsReglement: 'Acompte de 30 % à la commande, solde à livraison. Paiement à 30 jours.',
  }),
  saveDevisReglages: async () => ({ error: null }),
  listAccounts: async () => [
    { email:'alois@lessoudaines.fr', role:'admin', direction_technique:true },
    { email:'marie@lessoudaines.fr', role:'user', direction_technique:true },
    { email:'leo@lessoudaines.fr', role:'user', direction_technique:false },
  ],
  getFicheTechniqueByToken: async () => null,
  // Le jeton choisit le gabarit : les trois (stage manager, technicien,
  // salle) partagent la même page et n'en montrent pas les mêmes blocs.
  getRemarquesParJeton: async () => [],
  ajouterRemarqueParJeton: async () => ({ ok: true }),
  getRecapLogistique: async (jeton) => {
    if(!__seed.__recap) return null;
    const types = { salle:'salle', technicien:'technicien' };
    return { ...__seed.__recap, type: types[jeton] || 'stage_manager' };
  },
}, {
  // Toute méthode non prévue renvoie une liste vide plutôt que de lever : les
  // pages en appellent une bonne trentaine, les énumérer serait autant
  // d'occasions d'en oublier une et de capturer un écran d'erreur. La liste
  // vide plutôt que null, car la plupart de ces méthodes rendent des
  // collections et les appelants enchaînent aussitôt sur .length ou .map.
  get: (c, p) => p in c ? c[p] : async () => [],
});
window.CurieuxDB = CurieuxDB;

// Le vrai db.js expose aussi la base publique des liens partagés ; ce faux le
// remplaçant au niveau réseau, on redéfinit lienPublic à l'identique — sinon les
// pages qui composent un lien de partage lèvent « lienPublic is not defined ».
const CURIEUX_BASE_PUBLIQUE = 'https://prod.lessoudaines.fr/';
function lienPublic(fichier, requete){ return CURIEUX_BASE_PUBLIQUE + fichier + (requete ? '?' + requete : ''); }
window.CURIEUX_BASE_PUBLIQUE = CURIEUX_BASE_PUBLIQUE;
window.lienPublic = lienPublic;

// Plusieurs pages appellent supabaseClient.rpc() directement, sans passer par
// CurieuxDB — dispo-titulaire.html notamment. Sans ce faux client, elles
// tombent sur un ReferenceError avant d'avoir rien affiché.
const __rpc = {
  get_dispo_demande_by_token: [{
    id:'jeton-demo', tournee_id:'demo-tour1', person_type:'musicien',
    person_id:'demo-mus-01', dates:[],
  }],
  get_contact_production: [{ nom:'Aloïs — production', telephone:'06 12 34 56 78' }],
};
const supabaseClient = {
  rpc: async (nom) => ({ data: (nom in __rpc) ? __rpc[nom] : [], error: null }),
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
};
window.supabaseClient = supabaseClient;
`,
  }));

}

const CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

async function capturer() {
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const ctx = await browser.newContext({ viewport: FORMATS[format], deviceScaleFactor: 2 });
  await preparerContexte(ctx);

  for (const nom of pages) {
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(String(e).slice(0, 160)));
    page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 160)); });
    // Un nom de page peut porter sa requête — « technique-partage?jeton=demo » —
    // pour les écrans qui ne s'ouvrent que sur un jeton.
    const [fichier, requete] = nom.split('?');
    const reponse = await page.goto(`${BASE}/${fichier}.html${requete ? '?' + requete : ''}`, { waitUntil:'networkidle', timeout:20000 }).catch(()=>null);
    // Sans ce contrôle, un serveur local arrêté rend une page d'erreur du
    // navigateur — qui ne déborde évidemment pas, et se signale donc d'un « ✓ »
    // parfaitement rassurant. On préfère l'échec bruyant.
    if (!reponse || !reponse.ok()) {
      console.log(`${fichier.padEnd(16)} ${format.padEnd(7)} ✗ PAGE INJOIGNABLE (${reponse ? reponse.status() : 'pas de réponse'}) — le serveur local tourne-t-il ? python3 -m http.server 8099`);
      process.exitCode = 1;
      await page.close();
      continue;
    }
    await page.waitForTimeout(900);
    // Quatrième argument : un sélecteur à cliquer avant la capture. Sans lui,
    // les panneaux et fenêtres qui ne s'ouvrent qu'au clic — l'affectation, les
    // liens de dispo — resteraient invisibles à la relecture.
    if (process.argv[4]) {
      const cible = await page.$(process.argv[4]);
      if (cible) { await cible.click(); await page.waitForTimeout(700); }
      else console.log(`  (rien à cliquer pour « ${process.argv[4]} »)`);
    }
    await page.evaluate(() => { document.documentElement.style.visibility = 'visible'; document.body.style.visibility = 'visible'; });

    // Un défilement horizontal sur téléphone est un défaut en soi : on le mesure.
    const debord = await page.evaluate(() => {
      // Le seul signe fiable d'un débordement est que la page défile vraiment :
      // les rectangles des enfants d'un conteneur à overflow-x:auto dépassent
      // légitimement la fenêtre et donnent sinon un faux positif.
      const largeurDoc = document.documentElement.scrollWidth;
      scrollTo(9999, 0); const defile = scrollX > 0; scrollTo(0, 0);
      const clippe = e => {
        for (let a = e.parentElement; a; a = a.parentElement) {
          const ov = getComputedStyle(a).overflowX;
          if (ov === 'auto' || ov === 'scroll' || ov === 'hidden') return true;
        }
        return false;
      };
      // La chaîne d'ancêtres, pas seulement la balise : « SPAN. » ne dit rien,
      // « div.legend > span > svg » désigne le fautif du premier coup d'œil.
      const chaine = e => {
        const c = [];
        for (let a = e; a && a !== document.body; a = a.parentElement) {
          const cls = typeof a.className === 'string' && a.className.trim()
            ? '.' + a.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
          c.unshift(a.tagName.toLowerCase() + cls);
        }
        return c.slice(-3).join(' > ');
      };
      return { defile, largeurDoc, largeurVue: innerWidth,
        coupables: [...document.querySelectorAll('body *')]
          .filter(e => e.getBoundingClientRect().right > innerWidth + 2 && !clippe(e))
          .slice(0, 3).map(e => `${chaine(e)} (→${Math.round(e.getBoundingClientRect().right)}px)`) };
    });
    const f = `${OUT}/${fichier}-${format}.png`;
    // Cinquième argument : un sélecteur à cadrer. Une page de formulaire fait
    // dix mille pixels de haut ; relire un détail dessus revient à le chercher
    // dans une vignette. On capture alors le seul bloc qui nous occupe.
    const cadre = process.argv[5] ? await page.$(process.argv[5]) : null;
    if(cadre) await cadre.screenshot({ path:f });
    else await page.screenshot({ path:f, fullPage:true });
    const deborde = debord.defile;
    console.log(`${fichier.padEnd(16)} ${format.padEnd(7)} ${deborde ? `⚠ DÉBORDE ${debord.largeurDoc}px > ${debord.largeurVue}px → ${debord.coupables.join(', ')}` : '✓ pas de débordement'}${erreurs.length ? ` · ${erreurs.length} erreur(s) JS : ${erreurs[0]}` : ''}`);
    await page.close();
  }
  await browser.close();
}

module.exports = { SEED, preparerContexte, CHROMIUM, FORMATS };

if (require.main === module) capturer();
