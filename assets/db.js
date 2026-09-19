// ============================================================================
// Curieux orchestre — couche de persistence Supabase (remplace localStorage).
// Nécessite le script CDN Supabase chargé AVANT ce fichier :
//   <script src="assets/vendor/supabase-js.js"></script>
// (copie locale et versionnée : plus aucune dépendance à un CDN tiers, qui
// pourrait tomber ou servir une version compromise — voir assets/vendor/*.VERSION)
// Toutes les pages appellent les mêmes fonctions qu'avant (loadMusicians,
// saveMusicians, etc.) mais désormais asynchrones — voir MIGRATION dans
// chaque page pour le détail des appels convertis en async/await.
// ============================================================================

const SUPABASE_URL = 'https://nffqcvysweidquouulzs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-QZnJEZi01-5fjkjv_2SPw_wODqHcJQ';

// Base publique canonique de TOUS les liens qu'on partage vers l'extérieur :
// espace perso et dispo (mon-espace, mes-remplacants), accès techniques
// (technique-partage), fiches techniques (fiche-technique), page salle. Fixée à
// la prod, et NON déduite de location.origin : un lien copié — ou collé dans un
// WhatsApp, un mail — depuis un aperçu Vercel, un domaine de préversion ou le
// poste local pointerait sinon vers un hôte injoignable pour son destinataire.
// Un seul endroit à changer si l'adresse de prod évolue (voir aussi le repli
// dans pdf-prise-en-main.js).
const CURIEUX_BASE_PUBLIQUE = 'https://prod.lessoudaines.fr/';
// Compose un lien public : lienPublic('mon-espace.html', 'token=abc').
function lienPublic(fichier, requete){
  return CURIEUX_BASE_PUBLIQUE + fichier + (requete ? '?' + requete : '');
}
if(typeof window !== 'undefined'){
  window.CURIEUX_BASE_PUBLIQUE = CURIEUX_BASE_PUBLIQUE;
  window.lienPublic = lienPublic;
}

const supabaseClient = (typeof window !== 'undefined' && window.supabase)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

if(!supabaseClient){
  console.error("Supabase non chargé : ajoute <script src=\"assets/vendor/supabase-js.js\"></script> avant assets/db.js");
}

// --- Adaptateurs JS <-> colonnes SQL (pour les tables à colonnes réelles) ---
const CurieuxDB = (()=>{

  // « 12 » et « 12,5 » viennent d'un <input type=number> ; '' vient d'un champ
  // vidé, et doit redevenir NULL et non 0 — sans quoi une salle non renseignée
  // annoncerait zéro mètre sous grill et échouerait tout gabarit.
  function _nombreOuNull(v){
    if(v === '' || v === null || v === undefined) return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  // Un texte court facultatif : '' comme null redeviennent NULL, un nombre
  // (une base encore en integer) redevient sa chaîne.
  function _texteOuNull(v){
    if(v === null || v === undefined) return null;
    const s = String(v).trim();
    return s ? s : null;
  }

  const ADAPTERS = {
    musiciens: {
      toDb: (m)=> ({
        id: m.id,
        prenom: m.prenom || '', nom: m.nom || '',
        instrument: m.instrument || '', pupitre: m.pupitre || 'Autre',
        statut_poste: m.statutPoste || 'titulaire',
        // Position dans le pupitre (« 1 », « 2 », « solo ») : un texte court,
        // vide → NULL. La colonne était un entier de « rang de priorité » des
        // remplaçant·es, jamais vraiment exploité ; voir migrations.sql.
        rang: _texteOuNull(m.rang),
        telephone: m.telephone || '', email: m.email || '', notes: m.notes || '',
        disponibilites: m.disponibilites || {},
        disponibilites_commentaires: m.disponibilitesCommentaires || {},
        // Ce que la production répond à une précision laissée sur une date :
        // { "2027-03-12": { texte, auteur, le } }. Voir recap.html.
        reponses_prod: m.reponsesProd || {}
      }),
      fromDb: (r)=> ({
        id: r.id, prenom: r.prenom, nom: r.nom,
        instrument: r.instrument, pupitre: r.pupitre,
        statutPoste: r.statut_poste,
        rang: _texteOuNull(r.rang) || undefined,
        telephone: r.telephone, email: r.email, notes: r.notes,
        disponibilites: r.disponibilites || {},
        disponibilitesCommentaires: r.disponibilites_commentaires || {},
        reponsesProd: r.reponses_prod || {}
      })
    },
    techniciens: {
      toDb: (t)=> ({
        id: t.id,
        prenom: t.prenom || '', nom: t.nom || '',
        poste: t.poste || '', pole: t.pole || 'Autre',
        statut_poste: t.statutPoste || 'titulaire',
        telephone: t.telephone || '', email: t.email || '', notes: t.notes || '',
        disponibilites: t.disponibilites || {},
        disponibilites_commentaires: t.disponibilitesCommentaires || {},
        reponses_prod: t.reponsesProd || {},
        // Habilitation électrique, CACES, travail en hauteur, SST : des titres
        // qui EXPIRENT. Rien ne l'écrivait, et affecter quelqu'un dont le titre
        // a expiré ne provoquait aucune objection.
        habilitations: t.habilitations || []
      }),
      fromDb: (r)=> ({
        id: r.id, prenom: r.prenom, nom: r.nom,
        poste: r.poste, pole: r.pole,
        statutPoste: r.statut_poste || 'titulaire',
        telephone: r.telephone, email: r.email, notes: r.notes,
        disponibilites: r.disponibilites || {},
        disponibilitesCommentaires: r.disponibilites_commentaires || {},
        reponsesProd: r.reponses_prod || {},
        habilitations: r.habilitations || []
      })
    },
    tournees: {
      toDb: (t)=> ({
        id: t.id, nom: t.nom || '', dates: t.dates || [],
        // 'tournee' ou 'recording' : même table, même page, vocabulaire et
        // quelques champs qui changent (voir CURIEUX_VOCABULAIRE).
        type: t.type === 'recording' ? 'recording' : 'tournee',
        // Réglages constants d'un enregistrement (label, direction artistique,
        // format de livraison, dossier des masters). Vide pour une tournée.
        recording: t.recording || {},
        cachet_statut: t.cachetStatut === 'defini' ? 'defini' : 'non_defini',
        cachet_montant: t.cachetStatut === 'defini' ? (t.cachetMontant != null ? t.cachetMontant : null) : null,
        /* Le standard du pôle TECHNIQUE, distinct de celui de l'orchestre : un
           régisseur n'est pas payé au cachet d'un violon. Voir
           curieuxCachetResolu, qui choisit l'un ou l'autre selon la personne. */
        cachet_technicien_statut: t.cachetTechnicienStatut === 'defini' ? 'defini' : 'non_defini',
        cachet_technicien_montant: t.cachetTechnicienStatut === 'defini' ? (t.cachetTechnicienMontant != null ? t.cachetTechnicienMontant : null) : null,
        nomenclature: t.nomenclature || [],
        // [{id, label, couleur}, ...] — équipes road nommées, réutilisées comme
        // base de répartition sur chaque vacation roadies.
        equipes_road: t.equipesRoad || [],
        // Exigences techniques constantes de la tournée — elles ne changent pas
        // d'une date à l'autre, on ne les recopie donc pas sur chaque fiche.
        technique_tournee: t.techniqueTournee || {},
        // Qui a été retiré·e à la main de ce projet (« musicien:id ») : la
        // sollicitation d'office ne les repose pas (voir migrations.sql).
        sollicitation_exclus: t.sollicitationExclus || [],
        // Gère-t-on des invitations sur ce projet, et avec quelles catégories
        // de place ? Le quota, lui, vit dans chaque date (dates[].quotas) :
        // c'est la salle qui alloue, et deux salles n'allouent pas pareil.
        invitations_actives: !!t.invitationsActives,
        categories_places: t.categoriesPlaces || [],
        // Le contingent habituel DE CETTE TOURNÉE, recopié d'un clic sur ses
        // dates. Il n'y a pas de valeur usuelle commune : chaque producteur
        // alloue ce qu'il veut.
        contingent_usuel: t.contingentUsuel || {},
      }),
      fromDb: (r)=> ({ id: r.id, nom: r.nom, dates: r.dates || [], type: r.type === 'recording' ? 'recording' : 'tournee', recording: r.recording || {}, cachetStatut: r.cachet_statut || 'non_defini', cachetMontant: r.cachet_montant, cachetTechnicienStatut: r.cachet_technicien_statut || 'non_defini', cachetTechnicienMontant: r.cachet_technicien_montant, nomenclature: r.nomenclature || [], equipesRoad: r.equipes_road || [], techniqueTournee: r.technique_tournee || {}, sollicitationExclus: r.sollicitation_exclus || [], invitationsActives: !!r.invitations_actives, categoriesPlaces: r.categories_places || [], contingentUsuel: r.contingent_usuel || {} })
    },
    // ——— Outils de direction technique (août 2026) ———
    // Ce que la salle fournit, date par date (B2). "id" = `${tourneeId}::${dateId}`,
    // pour réutiliser upsertOne/removeOne malgré la clé composite.
    // Ce que la salle fournit, date par date. Miroir de lots_materiel : l'un
    // décrit ce qu'on amène, l'autre ce qu'on demande en local.
    moyens_salle: {
      toDb: (m)=> ({
        id: m.id, tournee_id: m.tourneeId, date_id: m.dateId,
        statut: m.statut || 'non_demande',
        plan_statut: m.planStatut || 'non_demande', plan_url: m.planUrl || '',
        // Une validation d'implantation ne vaut que d'un côté : la nôtre ne dit
        // rien de celle de la salle. plan_valide, qui prétendait valoir pour les
        // deux, n'est plus écrite (la colonne reste, pour les rangs anciens).
        plan_valide_nous: !!m.planValideNous,
        plan_valide_salle: !!m.planValideSalle,
        plan_charge_statut: m.planChargeStatut || 'non_envoye',
        // Un bureau d'étude est prévu sur place par défaut : c'est son absence
        // qui fait exception. bureau_*_contact, texte libre, s'est scindé en
        // nom + téléphone, avec le lien du dossier à côté.
        bureau_electrique_sur_place: m.bureauElectriqueSurPlace !== false,
        bureau_electrique_horaire: m.bureauElectriqueHoraire || '',
        bureau_electrique_nom: m.bureauElectriqueNom || '',
        bureau_electrique_tel: m.bureauElectriqueTel || '',
        bureau_electrique_dossier_url: m.bureauElectriqueDossierUrl || '',
        bureau_accroche_sur_place: m.bureauAccrocheSurPlace !== false,
        bureau_accroche_horaire: m.bureauAccrocheHoraire || '',
        bureau_accroche_nom: m.bureauAccrocheNom || '',
        bureau_accroche_tel: m.bureauAccrocheTel || '',
        bureau_accroche_dossier_url: m.bureauAccrocheDossierUrl || '',
        nombre_semis_simultanees: m.nombreSemisSimultanees != null ? m.nombreSemisSimultanees : null,
        // [{emplacement:'scene'|'cote_scene'|'fosse'|'autre',
        //   niveau:'inconnu'|'scene'|'sol'|'les_deux'}, ...] — une entrée par
        // semi simultanée. Le niveau se règle par semi : l'une peut décharger
        // de plain-pied pendant qu'une autre monte sur scène.
        emplacements_dechargement: m.emplacementsDechargement || [],
        // Ce que la salle indique en retour : où sont ses arrivées de courant.
        points_distribution: m.pointsDistribution || [],
        acces_notes: m.accesNotes || '',
        // [{horaireDebut, horaireFin, nombreDemande, confirme, notes, equipes:[{departement,couleur,nombre}]}, ...]
        roadies_vacations: m.roadiesVacations || [],
        // [{horaireDebut, horaireFin, nombreChariotsDemande, confirme,
        //   fourches:[{fourche}], nombreCaristesDemande, notes}, ...]
        chariots_vacations: m.chariotsVacations || [],
        // [{horaireDebut, horaireFin, nombreDemande, confirme, nombreSol, nombreGrill, notes}, ...]
        // nombreSol/nombreGrill : répartition des riggers demandés (un rigger au sol
        // et un rigger au grill ne font pas le même travail) ; leur somme doit
        // retomber sur nombreDemande, contrôlé côté technique-date.html.
        rigg_vacations: m.riggVacations || [],
        // [{id, label, heure}, ...] — repères libres de la journée (load in, get in…)
        horaires_journee: m.horairesJournee || [],
        hauteur_grill: m.hauteurGrill || '', ouverture_scene: m.ouvertureScene || '',
        profondeur_scene: m.profondeurScene || '',
        puissance: m.puissance || '', type_courant: m.typeCourant || '',
        charge_max_accroche: m.chargeMaxAccroche || '',
        type_sol: m.typeSol || '',
        // [{nom, role, tel, email}, ...]
        contacts_salle: m.contactsSalle || [],
        // sous-ensemble de techniciensAssignes de la date, à exposer côté salle
        contacts_techniciens_ids: m.contactsTechniciensIds || [],
        plan_image_path: m.planImagePath || '',
        // [{type:'semi'|'note', vehiculeId, label, xPct, yPct}, ...]
        semis_positions: m.semisPositions || [],
        // Le jour où la fiche technique est partie vers cette salle. Rien ne le
        // disait, et ce n'est pas déductible : la fiche part souvent par un
        // canal que l'outil ne voit pas. L'avancement compte ce poste-là.
        fiche_envoyee_le: m.ficheEnvoyeeLe || null,
        // La salle où se joue cette date, quand on l'a reliée à une fiche de
        // salle. Les colonnes de faits ci-dessus restent lues tant que le lien
        // n'existe pas : relier une date ne perd rien de ce qui y est saisi.
        salle_id: m.salleId || null,
        // Voirie, stationnement des semis, badges : ça se demande des semaines
        // à l'avance, ça se refuse, et ça n'existait nulle part.
        autorisations: m.autorisations || [],
        notes: m.notes || ''
      }),
      fromDb: (r)=> ({
        id: r.id, tourneeId: r.tournee_id, dateId: r.date_id,
        statut: r.statut || 'non_demande',
        planStatut: r.plan_statut || 'non_demande', planUrl: r.plan_url || '',
        planValideNous: !!r.plan_valide_nous,
        planValideSalle: !!r.plan_valide_salle,
        planChargeStatut: r.plan_charge_statut || 'non_envoye',
        bureauElectriqueSurPlace: r.bureau_electrique_sur_place !== false,
        bureauElectriqueHoraire: r.bureau_electrique_horaire || '',
        bureauElectriqueNom: r.bureau_electrique_nom || '',
        bureauElectriqueTel: r.bureau_electrique_tel || '',
        bureauElectriqueDossierUrl: r.bureau_electrique_dossier_url || '',
        bureauAccrocheSurPlace: r.bureau_accroche_sur_place !== false,
        bureauAccrocheHoraire: r.bureau_accroche_horaire || '',
        bureauAccrocheNom: r.bureau_accroche_nom || '',
        bureauAccrocheTel: r.bureau_accroche_tel || '',
        bureauAccrocheDossierUrl: r.bureau_accroche_dossier_url || '',
        nombreSemisSimultanees: r.nombre_semis_simultanees,
        emplacementsDechargement: r.emplacements_dechargement || [],
        pointsDistribution: r.points_distribution || [],
        accesNotes: r.acces_notes || '',
        roadiesVacations: r.roadies_vacations || [],
        chariotsVacations: r.chariots_vacations || [],
        riggVacations: r.rigg_vacations || [],
        horairesJournee: r.horaires_journee || [],
        hauteurGrill: r.hauteur_grill || '', ouvertureScene: r.ouverture_scene || '',
        profondeurScene: r.profondeur_scene || '',
        puissance: r.puissance || '', typeCourant: r.type_courant || '',
        chargeMaxAccroche: r.charge_max_accroche || '',
        typeSol: r.type_sol || '',
        contactsSalle: r.contacts_salle || [],
        contactsTechniciensIds: r.contacts_techniciens_ids || [],
        planImagePath: r.plan_image_path || '',
        semisPositions: r.semis_positions || [],
        ficheEnvoyeeLe: r.fiche_envoyee_le || '',
        salleId: r.salle_id || '',
        autorisations: r.autorisations || [],
        notes: r.notes || '',
        // La version lue, pour que la fiche de date puisse écrire « si personne
        // n'a écrit entre-temps » (upsertOneVersionne). Sans elle, un onglet
        // resté ouvert écrasait en silence la vacation que la salle venait de
        // confirmer et les horaires que le stage manager venait de poser.
        _updatedAt: r.updated_at
      })
    },
    // Une salle vit pour elle-même et survit aux tournées : jouer deux fois au
    // même endroit ne doit pas obliger à ressaisir grill, puissance, charge à
    // l'accroche et contacts. Les faits mesurables sont numériques, d'unité
    // fixe (m, A, kg) — c'est ce qui permet de les comparer au gabarit de la
    // tournée ; le reste est du texte, parce qu'il ne se compare pas.
    salles: {
      toDb: (s)=> ({
        id: s.id, nom: s.nom || '', ville: s.ville || '', adresse: s.adresse || '',
        // null et non 0 : « pas renseigné » n'est pas « zéro mètre ».
        hauteur_grill_m:    _nombreOuNull(s.hauteurGrillM),
        ouverture_scene_m:  _nombreOuNull(s.ouvertureSceneM),
        profondeur_scene_m: _nombreOuNull(s.profondeurSceneM),
        puissance_a:        _nombreOuNull(s.puissanceA),
        charge_accroche_kg: _nombreOuNull(s.chargeAccrocheKg),
        type_courant: s.typeCourant || '', type_sol: s.typeSol || '',
        acces_notes: s.accesNotes || '',
        points_distribution: s.pointsDistribution || [],
        contacts: s.contacts || [],
        lecons: s.lecons || [],
        notes: s.notes || '', fiche_url: s.ficheUrl || ''
      }),
      fromDb: (r)=> ({
        id: r.id, nom: r.nom || '', ville: r.ville || '', adresse: r.adresse || '',
        hauteurGrillM:    r.hauteur_grill_m    == null ? null : Number(r.hauteur_grill_m),
        ouvertureSceneM:  r.ouverture_scene_m  == null ? null : Number(r.ouverture_scene_m),
        profondeurSceneM: r.profondeur_scene_m == null ? null : Number(r.profondeur_scene_m),
        puissanceA:       r.puissance_a        == null ? null : Number(r.puissance_a),
        chargeAccrocheKg: r.charge_accroche_kg == null ? null : Number(r.charge_accroche_kg),
        typeCourant: r.type_courant || '', typeSol: r.type_sol || '',
        accesNotes: r.acces_notes || '',
        pointsDistribution: r.points_distribution || [],
        contacts: r.contacts || [],
        lecons: r.lecons || [],
        notes: r.notes || '', ficheUrl: r.fiche_url || ''
      })
    },
    // Ce qu'on demande à un prestataire pour une tournée. Les prestataires
    // n'avaient aucun canal dans l'outil : la date de récupération se retapait
    // depuis un appel, et rien ne disait si une demande était partie, acceptée
    // ou honorée. Sans montant : le coût est du ressort de la production.
    demandes_materiel: {
      toDb: (d)=> ({
        id: d.id, tournee_id: d.tourneeId || null,
        prestataire_id: d.prestataireId || null,
        objet: d.objet || '', dates_ids: d.datesIds || [],
        statut: d.statut || 'a_demander',
        demande_le: d.demandeLe || null, confirme_le: d.confirmeLe || null, recu_le: d.recuLe || null,
        retrait_date: d.retraitDate || null, retrait_heure: d.retraitHeure || '',
        notes: d.notes || ''
      }),
      fromDb: (r)=> ({
        id: r.id, tourneeId: r.tournee_id || '',
        prestataireId: r.prestataire_id || '',
        objet: r.objet || '', datesIds: r.dates_ids || [],
        statut: r.statut || 'a_demander',
        demandeLe: r.demande_le || '', confirmeLe: r.confirme_le || '', recuLe: r.recu_le || '',
        retraitDate: r.retrait_date || '', retraitHeure: r.retrait_heure || '',
        notes: r.notes || ''
      })
    },
    // Registre partagé des prestataires (provenance matériel, loueur véhicule).
    prestataires: {
      // L'adresse et le téléphone servent aux feuilles de mission des
      // chauffeurs : « chez quel prestataire vas-tu » n'a pas de réponse
      // utilisable sans elles.
      toDb: (p)=> ({ id: p.id, nom: p.nom || '', notes: p.notes || '',
        adresse: p.adresse || '', telephone: p.telephone || '', contact_nom: p.contactNom || '' }),
      fromDb: (r)=> ({ id: r.id, nom: r.nom || '', notes: r.notes || '',
        adresse: r.adresse || '', telephone: r.telephone || '', contactNom: r.contact_nom || '' })
    },
    // Lots de matériel (B3) : ce qu'on AMÈNE. Un lot peut contenir d'autres
    // lots (parentId) — "Kit lumière" peut contenir "Barres LED sol" comme
    // lot à part entière — en plus de ses éléments simples.
    lots_materiel: {
      toDb: (l)=> ({
        id: l.id, nom: l.nom || '', categorie: l.categorie || 'autre',
        parent_id: l.parentId || null,
        provenance_id: l.provenanceId || null,
        tournee_id: l.tourneeId || null,
        dates_ids: l.datesIds || [],
        // [{nom, notes}, ...] — conservé tel quel mais plus édité (l'UI ne s'en sert plus)
        elements: l.elements || [],
        description: l.description || '',
        date_prepa: l.datePrepa || null,
        date_pickup: l.datePickup || null,
        // La semi qui porte ce kit. C'est le pivot de la logistique : un kit
        // sans semi ne peut apparaître sur la feuille de route d'aucun chauffeur.
        vehicule_id: l.vehiculeId || null,
        // Le premier rendez-vous du chauffeur : {date, heure, prestataireId, notes}
        prise_en_charge: l.priseEnCharge || {},
        // [{id, date, heure, type:'sortie'|'entree', description}, ...] — ancien
        // journal plat, conservé en lecture seule : les allers-retours passent
        // désormais par la table echanges, qui sait dire ce qui n'est pas revenu.
        mouvements: l.mouvements || [],
        retour_prestataire_date: l.retourPrestataireDate || null,
        // Le pick up (on charge) et la livraison (ça arrive chez le prestataire)
        // sont deux rendez-vous distincts, souvent à deux bouts de la journée.
        // La colonne historique, qui portait les deux, devient l'heure de pick up.
        retour_prestataire_heure: l.retourPrestataireHeurePickup || '',
        retour_prestataire_heure_livraison: l.retourPrestataireHeureLivraison || '',
        // L'état du kit au retour : {etat, note, photoUrl, faitLe, par}. Sans
        // valorisation — ce qu'a coûté une casse est du ressort de la direction
        // de production, on note ce qui manque, pas ce que ça vaut.
        retour: l.retour || {},
        notes: l.notes || ''
      }),
      fromDb: (r)=> ({
        id: r.id, nom: r.nom, categorie: r.categorie || 'autre',
        parentId: r.parent_id || '',
        provenanceId: r.provenance_id || '',
        tourneeId: r.tournee_id || '',
        datesIds: r.dates_ids || [],
        elements: r.elements || [],
        description: r.description || '',
        datePrepa: r.date_prepa || '', datePickup: r.date_pickup || '',
        vehiculeId: r.vehicule_id || '',
        priseEnCharge: r.prise_en_charge || {},
        mouvements: r.mouvements || [],
        retourPrestataireDate: r.retour_prestataire_date || '',
        retourPrestataireHeurePickup: r.retour_prestataire_heure || '',
        retourPrestataireHeureLivraison: r.retour_prestataire_heure_livraison || '',
        retour: r.retour || {},
        notes: r.notes || ''
      })
    },
    // Un aller-retour chez un prestataire, avec son état. Voir migrations.sql :
    // c'est l'état qui répond à « qu'est-ce qui est parti et n'est pas revenu ».
    echanges: {
      toDb: (e)=> ({
        id: e.id, tournee_id: e.tourneeId || null, lot_id: e.lotId || null,
        vehicule_id: e.vehiculeId || null,
        // Il arrive qu'une semi dépose et qu'une autre récupère.
        vehicule_retour_id: e.vehiculeRetourId || null,
        chauffeur_id: e.chauffeurId || null,
        prestataire_id: e.prestataireId || null,
        portee: e.portee || 'partiel',
        elements: e.elements || '',
        motif: e.motif || 'panne',
        depot_date: e.depotDate || null, depot_heure: e.depotHeure || '',
        recup_date: e.recupDate || null, recup_heure: e.recupHeure || '',
        etat: e.etat || 'a_planifier',
        notes: e.notes || ''
      }),
      fromDb: (r)=> ({
        id: r.id, tourneeId: r.tournee_id || '', lotId: r.lot_id || '',
        vehiculeId: r.vehicule_id || '', vehiculeRetourId: r.vehicule_retour_id || '',
        chauffeurId: r.chauffeur_id || '', prestataireId: r.prestataire_id || '',
        portee: r.portee || 'partiel', elements: r.elements || '',
        motif: r.motif || 'panne',
        depotDate: r.depot_date || '', depotHeure: r.depot_heure || '',
        recupDate: r.recup_date || '', recupHeure: r.recup_heure || '',
        etat: r.etat || 'a_planifier', notes: r.notes || ''
      })
    },
    // Un carnet ATA est attribué à une semi, pour toute la tournée — valable
    // dans toute l'Europe, pas de notion de pays.
    carnets_ata: {
      toDb: (c)=> ({
        id: c.id, numero: c.numero || '',
        tournee_id: c.tourneeId || null, vehicule_id: c.vehiculeId || null,
        emis_le: c.emisLe || null, expire_le: c.expireLe || null,
        statut: c.statut || 'a_demander',
        lots_ids: c.lotsIds || [],
        notes: c.notes || ''
      }),
      fromDb: (r)=> ({
        id: r.id, numero: r.numero || '',
        tourneeId: r.tournee_id || '', vehiculeId: r.vehicule_id || '',
        emisLe: r.emis_le || '', expireLe: r.expire_le || '',
        statut: r.statut || 'a_demander',
        lotsIds: r.lots_ids || [],
        notes: r.notes || ''
      })
    },
    // Tracteur et semi sont deux lignes distinctes : c'est la semi qui porte le
    // hayon, et un tracteur peut tirer une autre semi.
    vehicules: {
      toDb: (v)=> ({
        id: v.id, nom: v.nom || '', type: v.type || 'semi',
        immatriculation: v.immatriculation || '', hayon: !!v.hayon,
        hauteur_m: v.hauteurM != null ? v.hauteurM : null,
        largeur_m: v.largeurM != null ? v.largeurM : null,
        profondeur_m: v.profondeurM != null ? v.profondeurM : null,
        capacite: v.capacite || '', prestataire_id: v.prestataireId || null,
        // Chauffeur habituel de cette semi — reste le même d'une date à l'autre
        // sauf exception gérée par affectations_transport.
        chauffeur_defaut_id: v.chauffeurDefautId || null,
        // Projets sur lesquels le véhicule est engagé. Plusieurs, et non un :
        // une semi louée à l'année sert plusieurs tournées — c'est ce qui
        // permet de voir qu'on l'a promise deux fois le même jour.
        tournees_ids: v.tourneesIds || [],
        notes: v.notes || ''
      }),
      fromDb: (r)=> ({
        id: r.id, nom: r.nom || '', type: r.type || 'semi',
        immatriculation: r.immatriculation || '', hayon: !!r.hayon,
        hauteurM: r.hauteur_m, largeurM: r.largeur_m, profondeurM: r.profondeur_m,
        capacite: r.capacite || '', prestataireId: r.prestataire_id || '',
        chauffeurDefautId: r.chauffeur_defaut_id || '',
        tourneesIds: r.tournees_ids || [],
        notes: r.notes || ''
      })
    },
    chauffeurs: {
      toDb: (c)=> ({
        id: c.id, prenom: c.prenom || '', nom: c.nom || '',
        telephone: c.telephone || '', email: c.email || '',
        prestataire: c.prestataire || '',
        tournees_ids: c.tourneesIds || [],
        notes: c.notes || ''
      }),
      fromDb: (r)=> ({
        id: r.id, prenom: r.prenom || '', nom: r.nom || '',
        telephone: r.telephone || '', email: r.email || '',
        prestataire: r.prestataire || '',
        tourneesIds: r.tournees_ids || [],
        notes: r.notes || ''
      })
    },
    // Affectation souple d'un chauffeur à une semi, par date — jamais figée :
    // un chauffeur peut changer de semi d'une date à l'autre.
    affectations_transport: {
      toDb: (a)=> ({
        id: a.id, tournee_id: a.tourneeId, date_id: a.dateId,
        vehicule_id: a.vehiculeId || null, chauffeur_id: a.chauffeurId || null,
        notes: a.notes || ''
      }),
      fromDb: (r)=> ({
        id: r.id, tourneeId: r.tournee_id, dateId: r.date_id,
        vehiculeId: r.vehicule_id || '', chauffeurId: r.chauffeur_id || '',
        notes: r.notes || ''
      })
    },
    // Fiches techniques (B1) : drive_url pointe directement sur le fichier
    // Drive partagé — toujours à jour, sans synchronisation. version_actuelle
    // est une étiquette libre mise à jour manuellement.
    fiches_techniques: {
      toDb: (f)=> ({
        id: f.id, nom: f.nom || '', tournee_id: f.tourneeId || null,
        drive_url: f.driveUrl || '',
        version_actuelle: f.versionActuelle || '',
        version_le: f.versionLe || null
      }),
      fromDb: (r)=> ({
        id: r.id, nom: r.nom || '', tourneeId: r.tournee_id || '',
        driveUrl: r.drive_url || '', token: r.token,
        versionActuelle: r.version_actuelle || '', versionLe: r.version_le || ''
      })
    },
    // Simple journal (plus de fichier associé — voir fiches_techniques.drive_url).
    fiches_techniques_versions: {
      toDb: (v)=> ({ id: v.id, fiche_id: v.ficheId, label: v.label || '', changelog: v.changelog || '' }),
      fromDb: (r)=> ({ id: r.id, ficheId: r.fiche_id, label: r.label || '', changelog: r.changelog || '', createdAt: r.created_at })
    },
    // Accès à la logistique (B4) — "id" est le jeton du lien. type distingue
    // trois audiences (stage manager / technicien / salle) ; une salle est
    // scopée à une ou plusieurs dates précises, pas à toute la tournée.
    acces_logistique: {
      toDb: (a)=> ({
        id: a.id, libelle: a.libelle || '', tournee_id: a.tourneeId || null,
        type: a.type || 'stage_manager', dates_ids: a.datesIds || [],
        // Adresse du destinataire : sert à pré-adresser le message qui
        // accompagne le PDF, depuis partage.html. Jamais exposée par le lien
        // public (get_recap_logistique ne la renvoie pas).
        email: a.email || '',
        actif: a.actif !== false,
        // Les deux seuls horodatages que NOUS posons. ouvert_le, dernier_acces_le
        // et repondu_le appartiennent au destinataire (toucher_acces, côté
        // serveur) : les renvoyer ici, ce serait réécrire depuis un cache vieux
        // de dix minutes ce que la page publique vient d'enregistrer.
        envoye_le: a.envoyeLe || null,
        relance_le: a.relanceLe || null
      }),
      fromDb: (r)=> ({
        id: r.id, libelle: r.libelle || '', tourneeId: r.tournee_id || '',
        type: r.type || 'stage_manager', datesIds: r.dates_ids || [],
        email: r.email || '',
        actif: r.actif !== false, createdAt: r.created_at,
        envoyeLe: r.envoye_le || '', ouvertLe: r.ouvert_le || '',
        dernierAccesLe: r.dernier_acces_le || '',
        reponduLe: r.repondu_le || '', relanceLe: r.relance_le || ''
      })
    },
    // Exceptions par personne au cachet standard d'une tournée (voir tournees.cachet_montant) —
    // table à part, verrouillée (RLS "admin access" ci-dessous) : contrairement au cachet
    // standard (public, identique pour tout le monde), un montant individualisé est sensible
    // et ne doit être lisible, côté lien perso, que par la personne concernée — jamais par
    // simple lecture de la table (voir get_cachet_override_by_token dans migrations.sql).
    // "id" = `${tourneeId}::${personType}::${personId}`, pour réutiliser upsertOne/removeOne
    // tels quels malgré la clé composite.
    cachet_overrides: {
      toDb: (o)=> ({ id: o.id, tournee_id: o.tourneeId, person_type: o.personType, person_id: o.personId, montant: o.montant }),
      fromDb: (r)=> ({ id: r.id, tourneeId: r.tournee_id, personType: r.person_type, personId: r.person_id, montant: r.montant })
    },
    // Liste personnelle et permanente de remplaçant·es classé·es (mes-remplacants.html) —
    // "id" = le person_id du/de la titulaire. Accessible en lecture directe par les
    // comptes admin/user (RLS "admin access", voir migrations.sql) : contrairement à
    // infos_sociales/dispo_demandes, pas besoin de passer par une fonction à token ici,
    // ce sont les pages admin (annuaire, techniciens) qui consultent cette table.
    remplacant_prefs: {
      toDb: (r)=> ({ id: r.id, person_type: r.personType, items: r.items || [] }),
      fromDb: (r)=> ({ id: r.id, personType: r.person_type, items: r.items || [] })
    },
    // Tâches de l'espace comm (comm.html). Deux natures d'échéance : une tâche
    // libre porte une date en clair (echeance) ; une tâche rattachée à une date
    // de tournée compte en jours avant le concert (j) et suit la date si elle
    // bouge. genre = 'newsletter' pour la tâche mensuelle recréée d'office.
    comm_taches: {
      toDb: (t)=> ({
        id: t.id, libelle: t.libelle || '', notes: t.notes || '',
        auteur: t.auteur || '',
        echeance: t.echeance || null,
        tournee_id: t.tourneeId || null, date_id: t.dateId || null,
        j: (t.j === 0 || t.j) ? t.j : null,
        genre: t.genre || '',
        fait: !!t.fait, fait_le: t.faitLe || null,
      }),
      fromDb: (r)=> ({
        id: r.id, libelle: r.libelle || '', notes: r.notes || '',
        auteur: r.auteur || '',
        echeance: r.echeance || '',
        tourneeId: r.tournee_id || '', dateId: r.date_id || '',
        j: (r.j === 0 || r.j) ? r.j : null,
        genre: r.genre || '',
        fait: !!r.fait, faitLe: r.fait_le || '',
      })
    },
    // Signalements du widget "Signaler un bug" (voir injectBugReportWidget dans
    // brand-assets.js) — écriture publique, lecture réservée aux comptes 'admin'.
    // "type" distingue bug / amélioration / incohérence.
    // Remarques laissées depuis un lien partagé (salle, stage manager) —
    // écriture par la fonction à jeton uniquement, lecture côté production.
    remarques: {
      toDb: (r)=> ({ id: r.id, tournee_id: r.tourneeId || null, date_id: r.dateId || null,
        acces_id: r.accesId || null, auteur: r.auteur || '', sujet: r.sujet || '',
        message: r.message || '', traitee: !!r.traitee }),
      fromDb: (r)=> ({ id: r.id, tourneeId: r.tournee_id || '', dateId: r.date_id || '',
        accesId: r.acces_id || '', auteur: r.auteur || '', sujet: r.sujet || '',
        message: r.message || '', traitee: !!r.traitee, createdAt: r.created_at })
    },
    bug_reports: {
      toDb: (b)=> ({ id: b.id, message: b.message || '', page: b.page || '', type: b.type || 'bug', auteur: b.auteur || '' }),
      fromDb: (r)=> ({ id: r.id, message: r.message, page: r.page, type: r.type || 'bug', auteur: r.auteur || '', createdAt: r.created_at })
    },
    // Liens personnels de demande de dispo envoyés aux titulaires — "id" est le token
    // utilisé dans l'URL du lien (voir dispo-titulaire.html).
    dispo_demandes: {
      toDb: (d)=> ({
        id: d.id, tournee_id: d.tourneeId,
        person_type: d.personType, person_id: d.personId,
        last_responded_at: d.lastRespondedAt || null,
        dates: d.dates || [],
        last_reminder_at: d.lastReminderAt || null,
        // Rôle sur CE projet — titulaire ou remplaçant·e. null : on s'en
        // remet au statut global de la personne (le noyau de l'orchestre).
        role: d.role || null
      }),
      fromDb: (r)=> ({
        id: r.id, tourneeId: r.tournee_id,
        personType: r.person_type, personId: r.person_id,
        lastRespondedAt: r.last_responded_at || undefined,
        dates: r.dates || [],
        // Quand la demande a été posée, et quand on a écrit pour la dernière
        // fois. Le tableau de service s'en sert pour dire, à côté de chaque nom,
        // quand on lui a demandé ses dispos pour la dernière fois.
        creeLe: r.created_at || undefined,
        lastReminderAt: r.last_reminder_at || undefined,
        role: r.role || null
      })
    },
    /* Ce qu'on a envoyé, à qui, et quand.
       -----------------------------------------------------------------------
       Une relance se notait déjà sur la demande de dispo (last_reminder_at),
       mais rien ne gardait trace d'une INFORMATION — « on a posé une option »,
       « c'est validé ». Or c'est justement ce qu'on oublie : sur quarante
       personnes prévenues une à une dans WhatsApp, il suffit d'une
       interruption pour ne plus savoir où l'on s'était arrêté, et quelqu'un
       apprend l'annulation de sa date par un collègue.

       On enregistre l'INTENTION au clic, pas la remise : WhatsApp et le
       client de messagerie s'ouvrent dans une autre application, et rien ne
       nous revient d'eux. C'est la même convention que le reste de l'app, et
       elle vaut d'être sue en lisant la colonne. */
    messages_envoyes: {
      // sujet et texte : le message tel qu'il est parti. Le motif suffisait
      // tant que tout venait d'un modèle ; dès qu'on écrit à la main, c'est
      // le seul moyen de relire ce qu'on a dit à quelqu'un.
      toDb: (m)=> ({
        id: m.id, person_id: m.personId, person_type: m.personType,
        tournee_id: m.tourneeId || null, motif: m.motif || '',
        dates: m.dates || [], canal: m.canal || '', par: m.par || '',
        sujet: m.sujet || '', texte: m.texte || ''
      }),
      fromDb: (r)=> ({
        id: r.id, personId: r.person_id, personType: r.person_type,
        tourneeId: r.tournee_id || '', motif: r.motif || '',
        dates: r.dates || [], canal: r.canal || '', par: r.par || '',
        sujet: r.sujet || '', texte: r.texte || '',
        envoyeLe: r.envoye_le || undefined
      })
    },
    /* Les invitations d'une tournée. Deux axes à ne pas confondre : `type` dit
       pour QUI (partenaire, pro, perso — il ne consomme rien), `categorie` dit
       OÙ l'on s'assoit (Carré Or, CAT 1 — c'est elle qui porte le quota).
       `aftershow` est un oui/non stocké en 0/1 : on peut y être sans assister
       au concert, donc 0 place et l'aftershow coché est une ligne valide.
       `etat` n'est plus utilisée (voir migrations.sql) : on continue de poser
       son défaut pour satisfaire la contrainte NOT NULL de la colonne.
       Voir assets/invitations.js. */
    invitations: {
      toDb: (i)=> ({
        id: i.id, tournee_id: i.tourneeId, date_id: i.dateId,
        nom: i.nom || '', prenom: i.prenom || '', email: i.email || '',
        places: Number(i.places) || 0, categorie: i.categorie || '',
        aftershow: Number(i.aftershow) || 0, type: i.type || '',
        demande_par: i.demandePar || '', etat: i.etat || 'accordee',
        note: i.note || '',
      }),
      fromDb: (r)=> ({
        id: r.id, tourneeId: r.tournee_id || '', dateId: r.date_id || '',
        nom: r.nom || '', prenom: r.prenom || '', email: r.email || '',
        places: Number(r.places) || 0, categorie: r.categorie || '',
        aftershow: Number(r.aftershow) || 0, type: r.type || '',
        demandePar: r.demande_par || '', etat: r.etat || 'accordee',
        note: r.note || '',
        creeLe: r.created_at || undefined, majLe: r.updated_at || undefined,
      })
    },
    feuilles_route: {
      // La FDR entière (contacts, trajets, planning, lieu, hôtel...) tient dans "data".
      // _updatedAt (préfixé pour ne jamais entrer en collision avec un champ du
      // même nom à l'intérieur de "data") sert à détecter les conflits d'édition
      // concurrente, voir feuille-de-route.html.
      toDb: (f)=> ({ id: f.id, data: f }),
      fromDb: (r)=> ({ ...(r.data || {}), id: r.id, _updatedAt: r.updated_at })
    },
    // Espace Devis : trois documents jsonb sur le modèle des feuilles de route.
    // Accès réservé aux comptes 'admin' par RLS (is_admin()) — voir migrations.sql.
    devis: {
      toDb: (d)=> { const { _updatedAt, ...data } = d; return { id: d.id, data }; },
      fromDb: (r)=> ({ ...(r.data || {}), id: r.id, _updatedAt: r.updated_at })
    },
    devis_clients: {
      toDb: (c)=> { const { _updatedAt, ...data } = c; return { id: c.id, data }; },
      fromDb: (r)=> ({ ...(r.data || {}), id: r.id })
    },
    devis_postes: {
      toDb: (p)=> { const { _updatedAt, ...data } = p; return { id: p.id, data }; },
      fromDb: (r)=> ({ ...(r.data || {}), id: r.id })
    },
    /* Suivi des dépenses. Deux tables aux formes volontairement différentes :
       le suivi est un DOCUMENT (l'instantané du prévisionnel s'écrit d'un seul
       tenant et ne se requête jamais ligne à ligne), la dépense est une LIGNE
       (on la filtre, on la trie, on l'additionne, on la saisit une par une).
       Les colonnes étant en snake_case, l'adaptateur n'est pas un confort :
       sans lui la valeur arriverait sous r.montant_ht et jamais sous
       .montantHt, sans la moindre erreur. */
    suivis_budget: {
      toDb: (s)=> ({
        id: s.id,
        projet_id: s.projetId || '',
        budget_id: s.budgetId || '',
        devis_id: s.devisId || '',
        data: s.data || {}
      }),
      fromDb: (r)=> ({
        id: r.id, projetId: r.projet_id || '', budgetId: r.budget_id || '',
        devisId: r.devis_id || '', data: r.data || {}, _updatedAt: r.updated_at
      })
    },
    depenses: {
      toDb: (d)=> ({
        id: d.id,
        suivi_id: d.suiviId,
        noeud_id: d.noeudId || '',
        sens: d.sens || 'depense',
        libelle: d.libelle || '',
        fournisseur: d.fournisseur || '',
        // Une date vide doit partir en null : '' n'est pas une date pour
        // Postgres, et la colonne refuserait la ligne entière.
        date_depense: d.dateDepense || null,
        montant_ht: Number(d.montantHt) || 0,
        montant_tva: Number(d.montantTva) || 0,
        // null et non 0 : « pas de détail » n'est pas « zéro unité ».
        quantite: d.quantite == null || d.quantite === '' ? null : Number(d.quantite),
        prix_unitaire: d.prixUnitaire == null || d.prixUnitaire === '' ? null : Number(d.prixUnitaire),
        regime: d.regime || '',
        statut: d.statut || 'paye',
        justificatif_url: d.justificatifUrl || '',
        note: d.note || ''
      }),
      fromDb: (r)=> ({
        id: r.id, suiviId: r.suivi_id, noeudId: r.noeud_id || '',
        sens: r.sens || 'depense', libelle: r.libelle || '', fournisseur: r.fournisseur || '',
        dateDepense: r.date_depense || '',
        montantHt: Number(r.montant_ht) || 0, montantTva: Number(r.montant_tva) || 0,
        quantite: r.quantite == null ? null : Number(r.quantite),
        prixUnitaire: r.prix_unitaire == null ? null : Number(r.prix_unitaire),
        regime: r.regime || '', statut: r.statut || 'paye',
        justificatifUrl: r.justificatif_url || '', note: r.note || '',
        _updatedAt: r.updated_at
      })
    },
    /* LES PARTITIONS — trois niveaux, et c'est celui du milieu qui travaille.
       Le SPECTACLE range le matériel une fois pour toutes ; la PARTIE (Violon 1,
       Alto, Piano, Conducteur) est l'unité qu'on affecte ; le FICHIER est un PDF,
       et une partie peut en porter plusieurs — une œuvre ajoutée au programme,
       une version corrigée. En affectant la partie et non le fichier, un ajout
       tardif se propage seul à tous ceux qui la lisent. */
    partitions_spectacles: {
      toDb: (s)=> ({
        id: s.id, nom: s.nom || '', compositeur: s.compositeur || '',
        arrangeur: s.arrangeur || '', lien_drive: s.lienDrive || '',
        chiffrer: !!s.chiffrer, archive: !!s.archive, note: s.note || ''
      }),
      fromDb: (r)=> ({
        id: r.id, nom: r.nom || '', compositeur: r.compositeur || '',
        arrangeur: r.arrangeur || '', lienDrive: r.lien_drive || '',
        chiffrer: !!r.chiffrer, archive: !!r.archive, note: r.note || '',
        _updatedAt: r.updated_at
      })
    },
    /* La programmation : « ce spectacle se joue sur cette opération ». C'est la
       ligne qui manquait — le lien se déduisait des affectations, donc il
       n'apparaissait qu'une fois le travail fait. Déclaré à la création du
       spectacle, il permet à la page de n'offrir que les opérations du
       spectacle et que l'effectif de l'opération. L'id est composite
       (`spectacleId::tourneeId`), comme ailleurs ici. */
    partitions_programmations: {
      toDb: (p)=> ({
        id: p.id, spectacle_id: p.spectacleId, tournee_id: p.tourneeId || '',
        note: p.note || ''
      }),
      fromDb: (r)=> ({
        id: r.id, spectacleId: r.spectacle_id, tourneeId: r.tournee_id || '',
        note: r.note || '', _updatedAt: r.updated_at
      })
    },
    partitions_parties: {
      toDb: (p)=> ({
        id: p.id, spectacle_id: p.spectacleId, nom: p.nom || '',
        pupitre: p.pupitre || '', ordre: Number(p.ordre) || 0, note: p.note || ''
      }),
      fromDb: (r)=> ({
        id: r.id, spectacleId: r.spectacle_id, nom: r.nom || '',
        pupitre: r.pupitre || '', ordre: Number(r.ordre) || 0, note: r.note || '',
        _updatedAt: r.updated_at
      })
    },
    partitions_fichiers: {
      toDb: (f)=> ({
        id: f.id, partie_id: f.partieId, titre: f.titre || '',
        chemin: f.chemin || '', nom_origine: f.nomOrigine || '',
        octets: Number(f.octets) || 0,
        // null et non 0 : « nombre de pages inconnu » n'est pas « zéro page ».
        pages: f.pages == null || f.pages === '' ? null : Number(f.pages),
        empreinte: f.empreinte || '', ordre: Number(f.ordre) || 0
      }),
      fromDb: (r)=> ({
        id: r.id, partieId: r.partie_id, titre: r.titre || '',
        chemin: r.chemin || '', nomOrigine: r.nom_origine || '',
        octets: Number(r.octets) || 0, pages: r.pages == null ? null : Number(r.pages),
        empreinte: r.empreinte || '', ordre: Number(r.ordre) || 0,
        _updatedAt: r.updated_at
      })
    },
    partitions_affectations: {
      toDb: (a)=> ({
        id: a.id, tournee_id: a.tourneeId || '', partie_id: a.partieId,
        person_type: a.personType || 'musicien', person_id: a.personId || ''
      }),
      fromDb: (r)=> ({
        id: r.id, tourneeId: r.tournee_id || '', partieId: r.partie_id,
        personType: r.person_type || 'musicien', personId: r.person_id || '',
        _updatedAt: r.updated_at
      })
    },
    // L'id EST l'id de l'opération : une opération, un code.
    partitions_acces: {
      toDb: (a)=> ({
        id: a.id, code: a.code || '', actif: a.actif !== false,
        ouvert_le: a.ouvertLe || null
      }),
      fromDb: (r)=> ({
        id: r.id, code: r.code || '', actif: r.actif !== false,
        ouvertLe: r.ouvert_le || '', _updatedAt: r.updated_at
      })
    },
    /* LE LOT CONFIÉ À UN ENSEMBLE TIERS. Un orchestre étranger qui reprend le
       programme n'a pas de fiches dans l'annuaire, et il n'est pas question
       d'en créer cinquante : on confie le matériel d'un spectacle à une
       MAISON, représentée par une personne nommée, avec un lien et un code.
       `toutesParties` se propage — une partie ajoutée après coup entre dans le
       lot sans qu'on y retouche, comme l'affectation qui porte sur la partie
       et non sur le fichier. */
    partitions_envois: {
      toDb: (e)=> ({
        id: e.id, spectacle_id: e.spectacleId, tournee_id: e.tourneeId || '',
        destinataire: e.destinataire || '', contact_nom: e.contactNom || '',
        contact_email: e.contactEmail || '', jeton: e.jeton, code: e.code || '',
        toutes_parties: e.toutesParties !== false,
        parties: Array.isArray(e.parties) ? e.parties : [],
        ouvert_le: e.ouvertLe || null, expire_le: e.expireLe || null,
        actif: e.actif !== false, nominatif: !!e.nominatif,
        droits_confirmes: !!e.droitsConfirmes, note: e.note || ''
      }),
      fromDb: (r)=> ({
        id: r.id, spectacleId: r.spectacle_id, tourneeId: r.tournee_id || '',
        destinataire: r.destinataire || '', contactNom: r.contact_nom || '',
        contactEmail: r.contact_email || '', jeton: r.jeton, code: r.code || '',
        toutesParties: r.toutes_parties !== false,
        parties: Array.isArray(r.parties) ? r.parties : [],
        ouvertLe: r.ouvert_le || '', expireLe: r.expire_le || '',
        actif: r.actif !== false, nominatif: !!r.nominatif,
        droitsConfirmes: !!r.droits_confirmes, note: r.note || '',
        createdAt: r.created_at, _updatedAt: r.updated_at
      })
    },
    // Lecture seule côté page : c'est /api/partition qui l'écrit, en même temps
    // qu'il pose le jeton invisible sur le PDF.
    partitions_telechargements: {
      toDb: (t)=> ({ id: t.id }),
      fromDb: (r)=> ({
        id: r.id, jetonFiligrane: r.jeton_filigrane, fichierId: r.fichier_id || '',
        tourneeId: r.tournee_id || '', personType: r.person_type || '',
        personId: r.person_id || '', personne: r.personne || '',
        partie: r.partie || '', spectacle: r.spectacle || '',
        operation: r.operation || '', octets: Number(r.octets) || 0,
        createdAt: r.created_at
      })
    },
    carnet_contacts: {
      toDb: (c)=> ({
        id: c.id, role: c.role || '', nom: c.nom || '',
        indicatif: c.indicatif || '', tel: c.tel || '', email: c.email || ''
      }),
      fromDb: (r)=> ({ id: r.id, role: r.role, nom: r.nom, indicatif: r.indicatif, tel: r.tel, email: r.email })
    },
    // Zone protégée (voir infos-sociales.html) : "id" est le même id que dans
    // musiciens/techniciens (une fiche par personne). Accès restreint côté
    // Supabase par RLS (infos_sociales_admins), pas par ce fichier.
    infos_sociales: {
      toDb: (r)=> ({
        id: r.id, person_type: r.personType,
        genre: r.genre || '',
        genre_detail: r.genreDetail || '',
        prenom_civil: r.prenomCivil || '',
        date_naissance: r.dateNaissance || null,
        lieu_naissance: r.lieuNaissance || '',
        nationalite: r.nationalite || '',
        adresse: r.adresse || '',
        num_secu: r.numSecu || '',
        iban: r.iban || '',
        bic: r.bic || '',
        titulaire_compte: r.titulaireCompte || '',
        num_conges_spectacles: r.numCongesSpectacles || '',
        // Plus demandé ni affiché — on continue d'écrire ce qui existe déjà
        // plutôt que d'effacer une saisie au premier enregistrement.
        num_audiens: r.numAudiens || '',
        derniere_visite_medicale: r.derniereVisiteMedicale || null,
        contact_urgence_nom: r.contactUrgenceNom || '',
        contact_urgence_tel: r.contactUrgenceTel || '',
        permis_conduire: r.permisConduire || '',
        permis_conduire_type: r.permisConduireType || '',
        permis_conduire_type_detail: r.permisConduireTypeDetail || '',
        taille_vetement: r.tailleVetement || '',
        extra: r.extra || {}
      }),
      fromDb: (row)=> ({
        id: row.id, personType: row.person_type,
        genre: row.genre || '',
        genreDetail: row.genre_detail || '',
        prenomCivil: row.prenom_civil || '',
        dateNaissance: row.date_naissance || '',
        lieuNaissance: row.lieu_naissance || '',
        nationalite: row.nationalite || '',
        adresse: row.adresse || '',
        numSecu: row.num_secu || '',
        iban: row.iban || '',
        bic: row.bic || '',
        titulaireCompte: row.titulaire_compte || '',
        numCongesSpectacles: row.num_conges_spectacles || '',
        numAudiens: row.num_audiens || '',
        derniereVisiteMedicale: row.derniere_visite_medicale || '',
        contactUrgenceNom: row.contact_urgence_nom || '',
        contactUrgenceTel: row.contact_urgence_tel || '',
        permisConduire: row.permis_conduire || '',
        permisConduireType: row.permis_conduire_type || '',
        permisConduireTypeDetail: row.permis_conduire_type_detail || '',
        tailleVetement: row.taille_vetement || '',
        extra: row.extra || {}
      })
    }
  };

  function adapterFor(table){ return ADAPTERS[table] || { toDb: x=>x, fromDb: x=>x }; }

  // --------------------------------------------------------------------------
  // Suivi des écritures.
  //
  // Auparavant, une écriture qui échouait se contentait d'un console.warn : sur
  // 29 appels, 24 ignoraient l'erreur renvoyée, et certaines pages lançaient même
  // la sauvegarde sans l'attendre après avoir déjà mis à jour l'affichage. Une
  // coupure réseau en salle ou une session expirée pendant la nuit produisait
  // donc exactement le même écran qu'un enregistrement réussi — la modification
  // était perdue sans que personne ne puisse le savoir.
  //
  // Le mécanisme ci-dessous reprend celui qui existait déjà sur la page des
  // musicien·nes (dispo-titulaire.html) et le rend valable partout : l'échec est
  // annoncé, l'opération est conservée pour être rejouée, et fermer l'onglet
  // demande confirmation tant qu'il reste quelque chose à enregistrer.
  // --------------------------------------------------------------------------
  const _echecs = [];           // opérations à rejouer
  let _enCours = 0;             // écritures en vol
  const _abonnes = [];          // callbacks d'affichage

  function _etatEcriture(){
    return { enCours: _enCours, echecs: _echecs.length,
             messages: [...new Set(_echecs.map(e => e.message))] };
  }
  function _notifier(){
    const etat = _etatEcriture();
    _abonnes.forEach(fn => { try{ fn(etat); }catch(e){} });
    _majBandeau(etat);
  }
  // Permet à une page d'afficher l'état à sa façon (voir dispo-titulaire.html,
  // qui a déjà son propre indicateur et n'a pas besoin du bandeau générique).
  function onEtatEcriture(fn){ _abonnes.push(fn); fn(_etatEcriture()); return () => {
    const i = _abonnes.indexOf(fn); if(i >= 0) _abonnes.splice(i, 1);
  }; }

  // Exécute une écriture en la surveillant. `rejouer` doit pouvoir être rappelée
  // telle quelle : c'est ce qui permet le bouton « Réessayer ».
  async function _ecrire(libelle, rejouer){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    _enCours++; _notifier();
    let res;
    try{
      res = await rejouer();
    }catch(err){
      res = { error: { message: err && err.message ? err.message : String(err) } };
    }
    _enCours--;
    if(res && res.error){
      console.warn(`[CurieuxDB] ${libelle}`, res.error.message);
      _echecs.push({ libelle, rejouer, message: _messageLisible(res.error.message) });
    }
    _notifier();
    return res || { error: null };
  }

  // Le nom de la colonne qu'une erreur d'écriture dit introuvable, ou ''.
  // PostgREST : « Could not find the 'reponses_prod' column of 'musiciens' » ;
  // Postgres : « column "reponses_prod" of relation "musiciens" does not exist ».
  function _colonneManquante(error){
    if(!error) return '';
    const code = error.code || '';
    if(code !== 'PGRST204' && code !== '42703') return '';
    const texte = (error.message || '') + ' ' + (error.details || '');
    const m = texte.match(/'([A-Za-z0-9_]+)'/) || texte.match(/"([A-Za-z0-9_]+)"/);
    return m ? m[1] : '';
  }

  /* La table n'existe pas encore dans cette base.
   *
   * Le cas est différent d'une colonne manquante : là, il n'y a rien à retirer
   * de la ligne, l'écriture ne passera pas et la lecture ne rendra jamais rien.
   * Une page qui repose sur une table toute neuve doit pouvoir le DIRE plutôt
   * que d'afficher une liste vide, qui se lit « il n'y a rien » alors que la
   * vérité est « la migration n'est pas jouée ».
   *
   * PGRST205 vient de PostgREST (table absente du cache de schéma), 42P01 de
   * Postgres lui-même (undefined_table).
   */
  function _tableAbsente(error){
    if(!error) return false;
    const code = error.code || '';
    if(code === 'PGRST205' || code === '42P01') return true;
    return /schema cache|does not exist/i.test(error.message || '');
  }

  // Vrai si la table manque à la base. Sert aux pages d'un lot fraîchement
  // déployé à afficher « colle la migration » au lieu d'un écran vide.
  async function tableManquante(table){
    if(!supabaseClient) return false;
    try{
      const res = await supabaseClient.from(table).select('id').limit(1);
      return _tableAbsente(res && res.error);
    }catch(e){ return false; }
  }

  /* Écrire même quand la base a une migration de retard.
   *
   * Le code d'une page part toujours avant le SQL : on déploie, on joue la
   * migration ensuite. Entre les deux, une colonne inconnue de la base faisait
   * échouer TOUTES les écritures de la table — y compris celles qui n'avaient
   * rien à voir avec la nouveauté. On retire la colonne fautive de la ligne et
   * on renvoie : le reste s'enregistre, et la colonne reprend sa place d'
   * elle-même dès la migration jouée. Deux tours au plus, et on abandonne si
   * la colonne nommée n'est même pas dans ce qu'on envoie — sans quoi une
   * erreur mal formée tournerait en rond.
   */
  async function _upsertTolerant(table, rows, onConflict){
    let payload = rows;
    for(let essai = 0; essai < 3; essai++){
      const res = await supabaseClient.from(table).upsert(payload, { onConflict });
      const colonne = _colonneManquante(res && res.error);
      if(!colonne || !payload.some(r=> colonne in r)) return res;
      console.warn(`[CurieuxDB] colonne « ${colonne} » absente de ${table} — écriture sans elle (migration à jouer).`);
      payload = payload.map(r=>{ const c = Object.assign({}, r); delete c[colonne]; return c; });
    }
    return supabaseClient.from(table).upsert(payload, { onConflict });
  }

  // Les messages bruts de Postgres/Supabase ne veulent rien dire pour qui les
  // lit dans une salle de concert : on traduit les deux cas réellement fréquents.
  function _messageLisible(message){
    const m = String(message || '');
    if(/row-level security|JWT|not authorized|permission denied/i.test(m)){
      return "Ta session n'est plus valide — reconnecte-toi pour enregistrer.";
    }
    if(/fetch|network|Failed to fetch|timeout/i.test(m)){
      return "Pas de connexion — la modification n'est pas encore enregistrée.";
    }
    return m;
  }

  async function reessayerEcritures(){
    if(_echecs.length === 0) return { error: null };
    const aRejouer = _echecs.splice(0, _echecs.length);
    _notifier();
    for(const op of aRejouer) await _ecrire(op.libelle, op.rejouer);
    return { error: _echecs.length ? { message: 'Certaines modifications résistent.' } : null };
  }
  function ecrituresEnAttente(){ return _echecs.length > 0 || _enCours > 0; }

  // Bandeau générique, injecté à la première alerte seulement — les pages qui
  // gèrent déjà leur propre indicateur peuvent le désactiver via
  // window.CURIEUX_SANS_BANDEAU_ECRITURE.
  let _bandeau = null;
  function _majBandeau(etat){
    if(typeof document === 'undefined' || window.CURIEUX_SANS_BANDEAU_ECRITURE) return;
    if(etat.echecs === 0){
      if(_bandeau) _bandeau.style.display = 'none';
      return;
    }
    if(!_bandeau){
      _bandeau = document.createElement('div');
      _bandeau.id = 'curieuxEcritureBandeau';
      _bandeau.setAttribute('role', 'alert');
      _bandeau.style.cssText =
        'position:fixed; left:0; right:0; bottom:0; z-index:9999;' +
        'background:#a5313f; color:#fff; padding:11px 16px; font-size:13.5px;' +
        "font-family:'Host Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;" +
        'display:flex; gap:12px; align-items:center; justify-content:center; flex-wrap:wrap;' +
        'box-shadow:0 -4px 16px rgba(0,0,0,.18);';
      const texte = document.createElement('span');
      texte.id = 'curieuxEcritureTexte';
      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.textContent = 'Réessayer';
      bouton.style.cssText =
        'background:#fff; color:#a5313f; border:none; border-radius:8px;' +
        'padding:7px 14px; font-weight:700; font-size:13px; cursor:pointer; font-family:inherit;';
      bouton.addEventListener('click', async () => {
        bouton.disabled = true; bouton.textContent = 'Envoi…';
        await reessayerEcritures();
        bouton.disabled = false; bouton.textContent = 'Réessayer';
      });
      _bandeau.append(texte, bouton);
      (document.body || document.documentElement).appendChild(_bandeau);
    }
    const n = etat.echecs;
    document.getElementById('curieuxEcritureTexte').textContent =
      `${n} modification${n > 1 ? 's' : ''} non enregistrée${n > 1 ? 's' : ''}. ` +
      (etat.messages[0] || '');
    _bandeau.style.display = 'flex';
  }

  if(typeof window !== 'undefined'){
    window.addEventListener('beforeunload', (e) => {
      if(!ecrituresEnAttente()) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  // Récupère toute une collection (équivalent de l'ancien loadXxx()).
  async function fetchAll(table){
    if(!supabaseClient) return [];
    const { data, error } = await supabaseClient.from(table).select('*').order('created_at', { ascending: true });
    if(error){ console.warn(`[CurieuxDB] fetchAll(${table})`, error.message); return []; }
    const adapter = adapterFor(table);
    return (data || []).map(adapter.fromDb);
  }

  // Une seule ligne, par son id — pour vérifier la fraîcheur d'un document
  // ouvert sans recharger toute la table.
  async function fetchOne(table, id){
    if(!supabaseClient) return null;
    const { data, error } = await supabaseClient.from(table).select('*').eq('id', id).maybeSingle();
    if(error){ console.warn(`[CurieuxDB] fetchOne(${table})`, error.message); return null; }
    return data ? adapterFor(table).fromDb(data) : null;
  }

  // Écriture « si personne n'a écrit entre-temps » : ne remplace la ligne que
  // si elle porte encore la version qu'on a lue (_updatedAt). Si quelqu'un
  // d'autre a enregistré depuis, rien n'est écrit et SA version est renvoyée
  // (conflit: true) — au lieu qu'une page restée ouverte écrase en silence le
  // travail des autres. Volontairement hors de la file de rejeu (_ecrire) :
  // rejouer plus tard une écriture versionnée n'aurait aucun sens, sa version
  // serait forcément périmée. Réservé aux tables {id, data} dont l'adaptateur
  // expose _updatedAt (devis).
  async function upsertOneVersionne(table, item){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const adapter = adapterFor(table);
    const { id, ...reste } = adapter.toDb(item);
    const { data: maj, error } = await supabaseClient.from(table)
      .update(reste).eq('id', id)
      .eq('updated_at', item._updatedAt || '1970-01-01T00:00:00Z')
      .select('updated_at');
    if(error){ console.warn(`[CurieuxDB] upsertOneVersionne(${table})`, error.message); return { error }; }
    if(maj && maj.length) return { error: null, _updatedAt: maj[0].updated_at };
    const { data: frais, error: e2 } = await supabaseClient.from(table).select('*').eq('id', id).maybeSingle();
    if(e2) return { error: e2 };
    if(!frais) return { error: null, absent: true };
    return { error: null, conflit: true, distant: adapter.fromDb(frais) };
  }

  // Upsert de toute une collection (équivalent de l'ancien saveXxx(list)) —
  // sans plus jamais supprimer ce qui manquerait de la liste. Avant, syncCollection
  // supprimait tout ce qui n'était pas dans "list", ce qui était dangereux dès que
  // deux admins travaillaient en même temps : un onglet resté ouvert avec une
  // liste devenue périmée pouvait supprimer d'un coup ce qu'une autre personne
  // venait d'ajouter ailleurs. Les suppressions se font maintenant explicitement,
  // via removeOne/removeMany/removePerson (le·la seul·e à savoir "je veux
  // supprimer CETTE ligne précise" est l'action qui déclenche la suppression).
  async function syncCollection(table, list){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const adapter = adapterFor(table);
    const rows = (list || []).map(adapter.toDb);
    if(rows.length === 0) return { error: null };
    return _ecrire(`syncCollection(${table})`,
      () => _upsertTolerant(table, rows, 'id'));
  }

  // Upsert d'une seule ligne — utilisé pour les sauvegardes à haute fréquence
  // (frappe clavier) où re-synchroniser toute la collection à chaque saisie
  // serait inutilement coûteux (voir feuille-de-route.html), et plus généralement
  // partout où on modifie/ajoute UNE ligne connue.
  async function upsertOne(table, item){
    const adapter = adapterFor(table);
    const row = adapter.toDb(item);
    return _ecrire(`upsertOne(${table})`,
      () => _upsertTolerant(table, [row], 'id'));
  }
  async function removeOne(table, id){
    return _ecrire(`removeOne(${table})`,
      () => supabaseClient.from(table).delete().eq('id', id));
  }
  async function removeMany(table, ids){
    if(!ids || ids.length === 0) return { error: null };
    return _ecrire(`removeMany(${table})`,
      () => supabaseClient.from(table).delete().in('id', ids));
  }
  /* Supprimer une date, et ce qui vivait avec elle.
   *
   * Les dates n'existent pas comme lignes : elles vivent dans tournees.dates,
   * une colonne jsonb. Il n'y a donc AUCUNE clé étrangère, et retirer une date
   * du tableau laissait derrière elle sa fiche technique (moyens_salle), les
   * remarques que la salle y avait laissées, les affectations de transport et
   * les tâches qui la visaient — invisibles et inatteignables, alors que la
   * confirmation promettait qu'elle « disparaîtra complètement ».
   *
   * Best-effort, comme removePerson : un compte qui n'aurait pas le droit sur
   * l'une de ces tables ne doit pas empêcher la suppression de la date.
   */
  async function supprimerRattachesDate(tourneeId, dateId){
    if(!supabaseClient) return;
    await Promise.all([
      supabaseClient.from('moyens_salle').delete().eq('id', `${tourneeId}::${dateId}`),
      supabaseClient.from('remarques').delete().eq('tournee_id', tourneeId).eq('date_id', dateId),
      supabaseClient.from('affectations_transport').delete().eq('tournee_id', tourneeId).eq('date_id', dateId),
      supabaseClient.from('comm_taches').delete().eq('tournee_id', tourneeId).eq('date_id', dateId),
      // Les invitations visent une date du jsonb : sans clé étrangère possible,
      // c'est ici qu'on les emporte. Ce sont des noms et des adresses de
      // personnes extérieures — les laisser orphelines serait les conserver
      // sans finalité, donc sans droit.
      supabaseClient.from('invitations').delete().eq('tournee_id', tourneeId).eq('date_id', dateId),
    ]);
  }

  // Supprime un·e musicien·ne/technicien·ne ET les données rattachées ailleurs
  // (fiche infos_sociales, liens dispo_demandes) — sans quoi elles restaient
  // orphelines et invisibles indéfiniment. Best-effort : un compte de rôle
  // 'user' n'a pas accès à infos_sociales (RLS), ce volet échoue silencieusement
  // pour lui, la fiche roster est quand même bien supprimée.
  async function removePerson(table, id){
    if(!supabaseClient) return;
    await Promise.all([
      supabaseClient.from(table).delete().eq('id', id),
      supabaseClient.from('infos_sociales').delete().eq('id', id),
      supabaseClient.from('dispo_demandes').delete().eq('person_id', id),
    ]);
  }

  // Le singleton "newsletter_snapshot" (une seule ligne, id=1) a sa propre API,
  // trop différente du modèle "collection" pour partager syncCollection/fetchAll.
  async function fetchSnapshot(){
    if(!supabaseClient) return null;
    const { data, error } = await supabaseClient.from('newsletter_snapshot').select('*').eq('id', 1).maybeSingle();
    if(error){ console.warn('[CurieuxDB] fetchSnapshot', error.message); return null; }
    if(!data) return null;
    return { sentAt: data.sent_at, entries: data.entries || [] };
  }
  async function saveSnapshot(snap){
    return _ecrire('saveSnapshot',
      () => supabaseClient.from('newsletter_snapshot')
        .upsert({ id: 1, sent_at: snap.sentAt, entries: snap.entries || [] }, { onConflict: 'id' }));
  }

  // Abonnement realtime : callback appelé à chaque INSERT/UPDATE/DELETE sur la
  // table (les pages appellent typiquement render() dedans pour se remettre à
  // jour). Retourne le channel (pour unsubscribe() si besoin, rarement utile
  // vu que les pages vivent le temps d'un onglet).
  function subscribe(table, callback){
    if(!supabaseClient) return null;
    return supabaseClient
      .channel(`realtime:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
      .subscribe();
  }

  // --- Auth : comptes Supabase réels, utilisés pour protéger toutes les pages
  // admin (accueil, annuaire, tournées, infos sociales, ...) — le reste de
  // l'app (liens personnels dispo/mes-infos) reste en accès public par token,
  // voir DEPLOYMENT.md. ---
  async function signIn(email, password){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    return supabaseClient.auth.signInWithPassword({ email, password });
  }
  async function signOut(){
    if(!supabaseClient) return;
    return supabaseClient.auth.signOut();
  }
  async function getSession(){
    if(!supabaseClient) return null;
    const { data } = await supabaseClient.auth.getSession();
    return data.session;
  }
  function onAuthStateChange(callback){
    if(!supabaseClient) return { data: { subscription: { unsubscribe(){} } } };
    return supabaseClient.auth.onAuthStateChange(callback);
  }
  // Changement de mot de passe par le compte connecté lui-même (page admin,
  // section "Mon compte") — ne touche que la session en cours, jamais un
  // autre compte (contrairement à createAccountWithPassword qui en crée un
  // nouveau au nom de quelqu'un d'autre).
  async function updateOwnPassword(newPassword){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    return supabaseClient.auth.updateUser({ password: newPassword });
  }
  // Rôle du compte connecté dans infos_sociales_admins ('admin'|'user'), ou
  // null s'il n'y figure pas — c'est la liste de confiance qui sert
  // d'allowlist pour toute l'app (policy RLS "self read own row" : la
  // requête ne peut renvoyer QUE la ligne du compte courant en lecture simple ;
  // un compte 'admin' peut en plus lister/gérer les autres lignes, voir
  // listAccounts ci-dessous).
  async function getMyRole(){
    if(!supabaseClient) return null;
    const session = await getSession();
    if(!session || !session.user || !session.user.email) return null;
    const { data, error } = await supabaseClient
      .from('infos_sociales_admins').select('role').eq('email', session.user.email).maybeSingle();
    if(error){ console.warn('[CurieuxDB] getMyRole', error.message); return null; }
    return data ? (data.role || 'admin') : null;
  }
  // Accès aux pages admin courantes (annuaires, tournées, dispos...) : tout
  // compte présent dans infos_sociales_admins, quel que soit son rôle.
  async function hasAppAccess(){
    return !!(await getMyRole());
  }
  // Accès aux zones réservées (infos sociales, gestion des comptes) : rôle
  // 'admin' uniquement.
  async function isSuperAdmin(){
    return (await getMyRole()) === 'admin';
  }
  // Direction technique (août 2026) : espace réservé à des comptes désignés
  // explicitement, en plus des comptes 'admin' qui y ont accès de toute façon
  // (voir has_direction_technique_access() dans migrations.sql).
  // L'espace comm suit le même patron que la direction technique : les admins
  // y entrent d'office, les autres via le drapeau « comm » de leur compte
  // (voir has_comm_access() dans migrations.sql).
  async function hasDirectionTechniqueAccess(){
    if(!supabaseClient) return false;
    const { data, error } = await supabaseClient.rpc('has_direction_technique_access');
    if(error){ console.warn('[CurieuxDB] hasDirectionTechniqueAccess', error.message); return false; }
    return !!data;
  }

  // --- Gestion des comptes (page admin-dashboard.html, réservée aux comptes
  // 'admin') : liste/ajoute/retire des lignes dans infos_sociales_admins. Ne
  // liste PAS les comptes Supabase Auth eux-mêmes (ça nécessiterait la clé
  // service_role, jamais utilisée côté client) — seulement la liste blanche
  // qui donne accès à l'app, ce qui est suffisant pour gérer qui a accès. ---
  async function listAccounts(){
    if(!supabaseClient) return [];
    const { data, error } = await supabaseClient
      .from('infos_sociales_admins').select('email, role, direction_technique, comm').order('email');
    if(error){ console.warn('[CurieuxDB] listAccounts', error.message); return []; }
    return data || [];
  }
  async function setAccountRole(email, role){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { error } = await supabaseClient
      .from('infos_sociales_admins').upsert({ email, role }, { onConflict: 'email' });
    if(error) console.warn('[CurieuxDB] setAccountRole', error.message);
    return { error };
  }
  async function setDirectionTechniqueAccess(email, actif){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { error } = await supabaseClient
      .from('infos_sociales_admins').update({ direction_technique: !!actif }).eq('email', email);
    if(error) console.warn('[CurieuxDB] setDirectionTechniqueAccess', error.message);
    return { error };
  }
  async function removeAccount(email){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { error } = await supabaseClient.from('infos_sociales_admins').delete().eq('email', email);
    if(error) console.warn('[CurieuxDB] removeAccount', error.message);
    return { error };
  }

  // Client Supabase secondaire, sans persistance de session : utilisé pour
  // créer un compte AU NOM DE quelqu'un d'autre depuis le dashboard, sans
  // remplacer la session actuelle de l'admin connecté (auth.signUp() sur le
  // client principal authentifierait le navigateur comme ce nouveau compte).
  let adminActionClient = null;
  function getAdminActionClient(){
    if(!adminActionClient && typeof window !== 'undefined' && window.supabase){
      adminActionClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
    }
    return adminActionClient;
  }
  // Crée un compte avec un mot de passe choisi par l'admin (à transmettre à
  // la personne par un canal séparé — SMS, appel...). L'email de confirmation
  // par défaut de Supabase part quand même si l'option est activée sur le
  // projet ; le compte n'a aucun accès tant qu'il n'est pas ajouté à la liste
  // (setAccountRole ci-dessus).
  async function createAccountWithPassword(email, password){
    const client = getAdminActionClient();
    if(!client) return { error: { message: 'Supabase non chargé' } };
    return client.auth.signUp({ email, password });
  }
  // Envoie un lien de connexion par email (sans mot de passe) — crée le
  // compte au premier clic si besoin. N'affecte pas la session de l'admin
  // qui déclenche l'envoi : rien ne change côté navigateur tant que le lien
  // n'est pas ouvert (dans la boîte mail du destinataire).
  //
  // emailRedirectTo doit être précisé explicitement : sans lui, Supabase
  // renvoie vers la Site URL par défaut configurée dans le dashboard du
  // projet (souvent restée sur localhost), ce qui casse le lien pour la
  // personne qui clique dessus — voir admin-login.html qui sait déjà détecter
  // une session issue d'un lien magique et rediriger vers accueil.html.
  // location.origin est vide/"null" en file:// (app ouverte en local) : dans
  // ce cas on n'envoie pas emailRedirectTo plutôt que de pointer vers un
  // chemin local inutilisable pour le destinataire.
  async function sendMagicLinkInvite(email){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const options = { shouldCreateUser: true };
    if(typeof location !== 'undefined' && /^https?:$/.test(location.protocol)){
      options.emailRedirectTo = location.origin + '/admin-login.html';
    }
    return supabaseClient.auth.signInWithOtp({ email, options });
  }

  // Création d'un compte d'équipe sans envoi d'email, via la fonction serveur
  // (voir api/creer-compte-equipe.js). Le compte est créé déjà confirmé :
  // aucune limite d'envoi ne s'applique, on peut en ajouter à la chaîne.
  // Renvoie { fallback: true } si la fonction n'est pas configurée côté
  // serveur — l'appelant retombe alors sur la création classique.
  async function creerCompteEquipeSansEmail(email, motDePasse){
    const session = await getSession();
    if(!session) return { error: { message: 'Session expirée — reconnecte-toi.' } };
    let rep;
    try{
      rep = await fetch('/api/creer-compte-equipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
        body: JSON.stringify({ email, motDePasse })
      });
    }catch(e){
      return { fallback: true };
    }
    if(rep.status === 501 || rep.status === 404) return { fallback: true };
    const data = await rep.json().catch(()=> ({}));
    if(!rep.ok) return { error: { message: data.erreur || `Erreur ${rep.status}.` } };
    return data;
  }

  // À qui appartient ce jeton ? Répond pour un jeton permanent
  // (acces_personnels) comme pour un jeton de demande de dispo.
  //
  // Les pages personnelles se verrouillaient sur get_dispo_demande_by_token,
  // qui ne lit que dispo_demandes : elles refusaient donc un lien personnel
  // permanent — celui-là même que porte la fiche de prise en main — alors que
  // toutes les fonctions qu'elles appellent ensuite l'acceptent.
  async function resolvePersonToken(token){
    if(!supabaseClient) return null;
    const { data, error } = await supabaseClient.rpc('resolve_person_token', { p_token: token });
    if(error){ console.warn('[CurieuxDB] resolvePersonToken', error.message); return null; }
    return (data || [])[0] || null;
  }

  // Espace personnel : identité + demandes de dispo en cours, depuis le jeton
  // permanent comme depuis un ancien jeton de demande.
  async function mesDemandesDispo(token){
    if(!supabaseClient) return null;
    const { data, error } = await supabaseClient.rpc('mes_demandes_dispo', { p_token: token });
    if(error){ console.warn('[CurieuxDB] mesDemandesDispo', error.message); return null; }
    return data || null;
  }

  /* Mes dates : ce qui est confirmé, ce qui est en option, ce qu'on cherche.
     -------------------------------------------------------------------------
     Trois retours possibles, et la page doit les distinguer — c'est pour cela
     qu'on ne se contente pas de `null` partout :
       null                      — le jeton ne vaut rien, ou la lecture a
                                   échoué. La page dit « ce lien n'est plus
                                   valide ».
       { migrationAbsente:true } — la fonction SQL n'existe pas encore sur
                                   cette base. Sans ce cas, la page afficherait
                                   une liste vide, qui se lit « tu n'as aucune
                                   date » alors que la vérité est « la
                                   migration n'est pas jouée ». C'est le
                                   contresens le plus coûteux de tous.
       l'objet                   — identité, heure de la source, et les dates. */
  async function mesDates(token){
    if(!supabaseClient) return null;
    const { data, error } = await supabaseClient.rpc('mes_dates', { p_token: token });
    if(!error) return data || null;
    if(_fonctionAbsente(error)) return { migrationAbsente: true };
    console.warn('[CurieuxDB] mesDates', error.message);
    return null;
  }

  // --- Historique des modifications (audit_log, réservé aux comptes 'admin'
  // par RLS — voir migrations.sql). tableName optionnel pour filtrer. ---
  async function fetchAuditLog(tableName, limit){
    if(!supabaseClient) return [];
    let q = supabaseClient.from('audit_log').select('*').order('changed_at', { ascending: false }).limit(limit || 200);
    if(tableName) q = q.eq('table_name', tableName);
    const { data, error } = await q;
    if(error){ console.warn('[CurieuxDB] fetchAuditLog', error.message); return []; }
    return data || [];
  }

  // --- Corbeille : restauration depuis le journal d'audit -------------------
  // L'interface prévenait qu'"il n'y a pas de corbeille : une suppression est
  // définitive". C'était vrai côté écran, mais pas côté base : le journal
  // conserve déjà l'état complet d'avant chaque suppression (old_data). Il ne
  // manquait donc que la lecture — c'est ce que font les deux fonctions
  // ci-dessous, sans rien ajouter au schéma.
  //
  // infos_sociales est volontairement exclue : son journal ne retient que le
  // NOM des champs modifiés, jamais leurs valeurs (pour ne pas dupliquer un
  // numéro de sécurité sociale dans une table moins cloisonnée). Il n'y a donc
  // rien à restaurer, et c'est délibéré.
  const TABLES_RESTAURABLES = [
    'musiciens', 'techniciens', 'tournees', 'feuilles_route', 'carnet_contacts',
    'dispo_demandes', 'remplacant_prefs', 'cachet_overrides', 'invitations',
    'depenses', 'suivis_budget',
    // Les partitions : le matériel, ses parties, ses fichiers, ses affectations
    // et les codes d'opération. PAS partitions_telechargements — cette table EST
    // déjà un journal, et elle ne porte aucun déclencheur d'audit.
    'partitions_spectacles', 'partitions_programmations', 'partitions_parties',
    'partitions_fichiers', 'partitions_affectations', 'partitions_acces',
    'partitions_envois',
  ];

  // Suppressions restaurables : celles dont la ligne n'a pas été recréée depuis.
  async function fetchCorbeille(limit){
    if(!supabaseClient) return [];
    const { data, error } = await supabaseClient
      .from('audit_log')
      .select('*')
      .eq('action', 'DELETE')
      .in('table_name', TABLES_RESTAURABLES)
      .order('changed_at', { ascending: false })
      .limit(limit || 100);
    if(error){ console.warn('[CurieuxDB] fetchCorbeille', error.message); return []; }

    const entrees = (data || []).filter(e => e.old_data && e.old_data.id != null);
    // Une ligne supprimée puis recréée ne doit plus apparaître comme
    // restaurable, sinon on proposerait d'écraser la version actuelle.
    const parTable = {};
    entrees.forEach(e => { (parTable[e.table_name] = parTable[e.table_name] || new Set()).add(String(e.old_data.id)); });
    const existants = {};
    await Promise.all(Object.entries(parTable).map(async ([table, ids]) => {
      const { data: presents } = await supabaseClient.from(table).select('id').in('id', [...ids]);
      existants[table] = new Set((presents || []).map(r => String(r.id)));
    }));
    // Et si la même ligne a été supprimée plusieurs fois, seule la dernière compte.
    const vus = new Set();
    return entrees.filter(e => {
      const cle = e.table_name + '::' + e.old_data.id;
      if(vus.has(cle)) return false;
      vus.add(cle);
      return !(existants[e.table_name] || new Set()).has(String(e.old_data.id));
    });
  }

  /* REVENIR À L'ÉTAT D'AVANT UNE MODIFICATION, quelle qu'elle soit.
     ---------------------------------------------------------------------------
     La corbeille ne rattrapait que les suppressions. Or le journal conserve
     aussi l'état d'avant chaque MODIFICATION (old_data) et l'état d'après
     chaque CRÉATION (new_data) : de quoi défaire n'importe quel geste, sur
     n'importe quelle table journalisée, et pas seulement le dernier.

     Les trois actions se défont différemment :
       UPDATE — on réécrit la ligne telle qu'elle était ;
       DELETE — on la réinsère ;
       INSERT — on la retire, puisqu'elle n'existait pas avant.

     old_data et new_data sont au format des COLONNES SQL : on n'applique donc
     pas les adaptateurs, qui traduisent depuis le format JavaScript.

     Ce geste est lui-même journalisé : revenir en arrière laisse une trace, et
     se défait comme le reste. On ne perd donc jamais la main.

     infos_sociales reste dehors : son journal ne retient que le NOM des champs
     modifiés, jamais leurs valeurs — il n'y a rien à réécrire, et c'est voulu. */
  async function revenirA(entree){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    if(!entree || !entree.table_name || entree.table_name === 'infos_sociales'){
      return { error: { message: "Cette modification ne peut pas être défaite : le journal n'en garde pas le détail." } };
    }
    const table = entree.table_name;

    if(entree.action === 'INSERT'){
      const id = (entree.new_data && entree.new_data.id != null) ? entree.new_data.id : entree.row_id;
      if(id == null) return { error: { message: 'Ligne introuvable' } };
      return _ecrire(`revenirA(${table})`, () => supabaseClient.from(table).delete().eq('id', id));
    }

    if(!entree.old_data || entree.old_data.id == null){
      return { error: { message: "L'état d'avant n'a pas été conservé pour cette ligne." } };
    }
    // upsert et non insert : sur un UPDATE la ligne existe encore, sur un
    // DELETE elle a disparu. Un seul appel couvre les deux.
    return _ecrire(`revenirA(${table})`,
      () => supabaseClient.from(table).upsert(entree.old_data, { onConflict: 'id' }));
  }

  // Réinsère la ligne telle qu'elle était. old_data est déjà au format des
  // colonnes SQL : on n'applique donc PAS les adaptateurs, qui traduisent
  // depuis le format JavaScript.
  async function restaurerDepuisCorbeille(entree){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    if(!entree || !entree.old_data || !TABLES_RESTAURABLES.includes(entree.table_name)){
      return { error: { message: 'Entrée non restaurable' } };
    }
    const ligne = { ...entree.old_data };
    return _ecrire(`restaurer(${entree.table_name})`,
      () => supabaseClient.from(entree.table_name).insert(ligne));
  }

  // --- Auto-saisie par lien personnel (mes-infos.html, même token que
  // dispo-titulaire.html) : pas d'auth, le token EST l'identification. Passe
  // par des fonctions Postgres dédiées (get/upsert_own_infos_sociales) qui
  // valident le token contre dispo_demandes avant de toucher infos_sociales —
  // la table elle-même reste fermée à la clé anonyme (voir migrations.sql). ---
  async function getInfosSocialesByToken(token){
    if(!supabaseClient) return null;
    const { data, error } = await supabaseClient.rpc('get_own_infos_sociales', { p_token: token });
    if(error){ console.warn('[CurieuxDB] getInfosSocialesByToken', error.message); return null; }
    const row = (data || [])[0];
    return row ? adapterFor('infos_sociales').fromDb(row) : null;
  }
  async function upsertInfosSocialesByToken(token, item){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const payload = adapterFor('infos_sociales').toDb(item);
    const { error } = await supabaseClient.rpc('upsert_own_infos_sociales', { p_token: token, p_payload: payload });
    if(error) console.warn('[CurieuxDB] upsertInfosSocialesByToken', error.message);
    return { error };
  }

  // dispo_demandes n'est plus lisible/écrivable directement par la clé
  // anonyme (voir migrations.sql) : dispo-titulaire.html/mes-infos.html
  // passent par ces deux fonctions dédiées, qui ne donnent accès qu'à UNE
  // ligne précise (celle du token fourni), jamais à la table entière.
  async function getDispoDemandeByToken(token){
    if(!supabaseClient) return null;
    const { data, error } = await supabaseClient.rpc('get_dispo_demande_by_token', { p_token: token });
    if(error){ console.warn('[CurieuxDB] getDispoDemandeByToken', error.message); return null; }
    const row = (data || [])[0];
    return row ? adapterFor('dispo_demandes').fromDb(row) : null;
  }
  async function markDispoRespondedByToken(token){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { error } = await supabaseClient.rpc('mark_dispo_responded_by_token', { p_token: token });
    if(error) console.warn('[CurieuxDB] markDispoRespondedByToken', error.message);
    return { error };
  }

  // musiciens/techniciens ne sont plus écrivables directement par la clé anonyme
  // (voir migrations.sql) : dispo-titulaire.html passe par ces deux fonctions, qui ne
  // touchent que LA fiche de la personne du token fourni, jamais une autre.
  async function updateOwnContactByToken(token, telephone, email){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { error } = await supabaseClient.rpc('update_own_contact_by_token', { p_token: token, p_telephone: telephone, p_email: email });
    if(error) console.warn('[CurieuxDB] updateOwnContactByToken', error.message);
    return { error };
  }
  async function updateOwnDisponibilitesByToken(token, disponibilites, disponibilitesCommentaires, telephone, email){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { error } = await supabaseClient.rpc('update_own_disponibilites_by_token', {
      p_token: token, p_disponibilites: disponibilites, p_disponibilites_commentaires: disponibilitesCommentaires,
      p_telephone: telephone, p_email: email
    });
    if(error) console.warn('[CurieuxDB] updateOwnDisponibilitesByToken', error.message);
    return { error };
  }
  // Renomme le prénom affiché partout dans l'app (mes-infos.html, "Prénom d'usage") :
  // la fonction Postgres préserve l'ancien prénom dans infos_sociales.prenom_civil
  // (seulement s'il n'y était pas déjà) avant d'écraser musiciens/techniciens.prenom —
  // voir update_own_prenom_usage_by_token dans migrations.sql.
  async function updateOwnPrenomUsageByToken(token, prenomUsage){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { error } = await supabaseClient.rpc('update_own_prenom_usage_by_token', { p_token: token, p_prenom_usage: prenomUsage });
    if(error) console.warn('[CurieuxDB] updateOwnPrenomUsageByToken', error.message);
    return { error };
  }

  // Liste personnelle de remplaçant·es classé·es (mes-remplacants.html, même
  // token que dispo-titulaire.html/mes-infos.html) : même principe que
  // getInfosSocialesByToken, la table remplacant_prefs reste fermée à la clé
  // anonyme, tout passe par ces deux fonctions Postgres dédiées.
  async function getRemplacantPrefsByToken(token){
    if(!supabaseClient) return [];
    const { data, error } = await supabaseClient.rpc('get_own_remplacant_prefs', { p_token: token });
    if(error){ console.warn('[CurieuxDB] getRemplacantPrefsByToken', error.message); return []; }
    const row = (data || [])[0];
    return row && Array.isArray(row.items) ? row.items : [];
  }
  async function upsertRemplacantPrefsByToken(token, items){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { error } = await supabaseClient.rpc('upsert_own_remplacant_prefs', { p_token: token, p_items: items });
    if(error) console.warn('[CurieuxDB] upsertRemplacantPrefsByToken', error.message);
    return { error };
  }

  // --- Accès par lien personnel aux données du répertoire (C1) -------------
  // musiciens/techniciens ne sont plus lisibles par la clé anonyme : leur
  // lecture publique exposait 107 fiches avec téléphones, e-mails et notes
  // internes. Les pages à lien personnel passent par ces fonctions, qui ne
  // rendent que le strict nécessaire.
  //
  // Chacune retombe sur l'ancien accès direct si la fonction n'existe pas
  // encore côté base : le site et la migration SQL peuvent ainsi être déployés
  // dans n'importe quel ordre sans jamais couper les liens des musicien·nes.
  function _fonctionAbsente(error){
    return !!error && /(does not exist|Could not find the function|PGRST202)/i.test(error.message || '');
  }

  async function getOwnPersonByToken(token, personType, personId){
    if(!supabaseClient) return null;
    const { data, error } = await supabaseClient.rpc('get_own_person_by_token', { p_token: token });
    if(!error) return (data || [])[0] || null;
    if(!_fonctionAbsente(error)){
      console.warn('[CurieuxDB] getOwnPersonByToken', error.message);
      return null;
    }
    const table = personType === 'musicien' ? 'musiciens' : 'techniciens';
    const res = await supabaseClient.from(table).select('*').eq('id', personId).maybeSingle();
    return res.data || null;
  }

  // Annuaire réduit aux noms, pour choisir ses remplaçant·es : ni téléphone,
  // ni e-mail, ni notes, ni disponibilités.
  async function getRosterForPicker(token){
    if(!supabaseClient) return [];
    const { data, error } = await supabaseClient.rpc('get_roster_for_picker', { p_token: token });
    if(!error){
      return (data || []).map(r => ({
        id: r.id, personType: r.person_type, nom: r.nom, prenom: r.prenom, roleLabel: r.role_label
      }));
    }
    if(!_fonctionAbsente(error)){
      console.warn('[CurieuxDB] getRosterForPicker', error.message);
      return [];
    }
    const [mus, tech] = await Promise.all([
      supabaseClient.from('musiciens').select('id,prenom,nom,instrument'),
      supabaseClient.from('techniciens').select('id,prenom,nom,poste'),
    ]);
    return [
      ...(mus.data || []).map(m => ({ id:m.id, personType:'musicien', nom:m.nom, prenom:m.prenom, roleLabel: m.instrument || 'Musicien·ne' })),
      ...(tech.data || []).map(t => ({ id:t.id, personType:'technicien', nom:t.nom, prenom:t.prenom, roleLabel: t.poste || 'Technicien·ne' })),
    ];
  }

  async function getTourneeByToken(token, tourneeId){
    if(!supabaseClient) return null;
    const { data, error } = await supabaseClient.rpc('get_tournee_by_token', { p_token: token });
    if(!error) return (data || [])[0] || null;
    if(!_fonctionAbsente(error)){
      console.warn('[CurieuxDB] getTourneeByToken', error.message);
      return null;
    }
    const res = await supabaseClient.from('tournees').select('*').eq('id', tourneeId).maybeSingle();
    return res.data || null;
  }

  // Jeton permanent d'une personne (I3), indépendant des tournées : appelé
  // côté admin pour construire un lien qui survit au ménage des vieilles
  // tournées. Renvoie null si la base n'a pas encore la migration.
  // Renvoie { token } en cas de succès, sinon { error } — et non null quelle que
  // soit la cause : confondre « la migration n'est pas passée » avec « l'appel a
  // échoué » affichait un message faux dès que la fonction existait mais levait
  // une erreur.
  async function ensureAccesPersonnel(personId, personType){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { data, error } = await supabaseClient.rpc('ensure_acces_personnel',
      { p_person_id: personId, p_person_type: personType });
    if(error){
      console.warn('[CurieuxDB] ensureAccesPersonnel', error.message);
      return { error, migrationAbsente: _fonctionAbsente(error) };
    }
    return { token: data || null };
  }

  // Cachet individualisé (voir cachet_overrides dans migrations.sql) : la table reste
  // fermée à la clé anonyme, dispo-titulaire.html ne peut lire que le montant de LA
  // personne du token fourni — jamais la liste complète des montants de la tournée.
  async function getCachetOverrideByToken(token){
    if(!supabaseClient) return null;
    const { data, error } = await supabaseClient.rpc('get_cachet_override_by_token', { p_token: token });
    if(error){ console.warn('[CurieuxDB] getCachetOverrideByToken', error.message); return null; }
    const row = (data || [])[0];
    return row && row.montant != null ? row.montant : null;
  }
  // Efface toutes les exceptions de cachet d'une tournée d'un coup — utilisé quand le
  // cachet standard repasse à "non défini" (tournees.html) : une exception n'a de sens
  // que par rapport à un cachet standard existant.
  async function removeCachetOverridesForTournee(tourneeId){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { error } = await supabaseClient.from('cachet_overrides').delete().eq('tournee_id', tourneeId);
    if(error) console.warn('[CurieuxDB] removeCachetOverridesForTournee', error.message);
    return { error };
  }

  // Widget "Signaler un bug" (voir injectBugReportWidget dans brand-assets.js) —
  // écriture seule, table fermée en lecture à la clé anonyme (voir migrations.sql).
  async function reportBug(message, page, type, auteur){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'bug-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    const payload = adapterFor('bug_reports').toDb({ id, message, page, type, auteur });
    let { error } = await supabaseClient.from('bug_reports').insert(payload);
    // La colonne « auteur » est arrivée après coup. Si la migration n'est pas
    // encore passée sur cette base, on renvoie le signalement sans elle plutôt
    // que de perdre le message : savoir qui parle vaut moins que l'entendre.
    if(error && _colonneAbsente(error, 'auteur')){
      const { auteur: _, ...sansAuteur } = payload;
      ({ error } = await supabaseClient.from('bug_reports').insert(sansAuteur));
    }
    if(error) console.warn('[CurieuxDB] reportBug', error.message);
    return { error };
  }

  // PostgREST refuse l'écriture d'une colonne qu'il ne connaît pas (PGRST204),
  // PostgreSQL d'une colonne inexistante (42703). Les deux disent la même chose.
  function _colonneAbsente(error, nom){
    if(!error) return false;
    const code = error.code || '';
    const texte = (error.message || '') + ' ' + (error.details || '');
    return (code === 'PGRST204' || code === '42703') && texte.includes(nom);
  }

  // ==========================================================================
  // Outils de direction technique (août 2026)
  // ==========================================================================

  // Réglages généraux — pour l'instant un seul drapeau, "phase de test", qui
  // conditionne l'accès à l'espace de réinitialisation. Renvoie toujours un
  // objet : si la table n'existe pas encore (migration non passée), on
  // considère qu'on n'est PAS en phase de test, c'est-à-dire le cas le plus
  // prudent — mieux vaut masquer la purge à tort que l'exposer à tort.
  async function fetchReglages(){
    if(!supabaseClient) return { phaseTest: false, absent: true };
    const { data, error } = await supabaseClient.from('reglages').select('*').eq('id', 1).maybeSingle();
    if(error){
      console.warn('[CurieuxDB] fetchReglages', error.message);
      return { phaseTest: false, absent: true };
    }
    return {
      phaseTest: !!(data && data.phase_test),
      villesBase: (data && data.villes_base) || [],
      referentNom: (data && data.referent_nom) || '',
      referentTelephone: (data && data.referent_telephone) || '',
      commTachesTypes: (data && data.comm_taches_types) || null,
      commNewsletterJour: (data && data.comm_newsletter_jour) || 25,
      // Seuils d'alerte du tableau de bord technique : { cle: [orange, rouge] }
      // en jours avant la date. Objet vide = la page garde ses défauts.
      techniqueSeuils: (data && data.technique_seuils) || {},
      absent: !data,
    };
  }

  /* Préférences d'affichage du compte connecté, page par page.
   *
   * La « façon de regarder » — projets masqués, fenêtre de mois, vue choisie —
   * vivait dans le localStorage : par navigateur, donc perdue d'un appareil à
   * l'autre, et invisible pour qui cherche pourquoi un projet « a disparu »
   * chez un·e collègue. Un document jsonb par (compte, page), voir
   * preferences_utilisateur dans migrations.sql.
   *
   * Ni adaptateur ni _ecrire ici. La clé est composite (user_id, page) et
   * upsertOne suppose une colonne id ; et un réglage d'affichage qui n'a pas
   * pu partir ne mérite pas le bandeau « Réessayer » — la page garde son
   * localStorage en repli. Pas d'abonnement realtime non plus : personne
   * d'autre ne modifie nos préférences.
   *
   * L'user_id n'apparaît nulle part côté client : le RLS ne rend que sa
   * ligne, et la base pose auth.uid() par défaut à l'insertion. Le filtrer
   * ici obligerait à connaître l'uid, pour ne rien restreindre de plus. */

  // Table pas encore migrée, ou en cours de l'être : on se tait, la page a
  // ses défauts. Le code seul ne suffit pas — selon la couche qui répond,
  // le nom de la table n'est que dans le message.
  function _preferencesIndisponibles(error){
    if(!error) return false;
    return _tableAbsente(error) || /preferences_utilisateur/.test(error.message || '');
  }

  // Rend l'objet data, ou {} quoi qu'il arrive : session absente, table pas
  // encore créée, hors ligne — la page part de ses défauts sans casser.
  async function fetchPreferences(page){
    if(!supabaseClient) return {};
    try{
      const { data, error } = await supabaseClient.from('preferences_utilisateur')
        .select('data').eq('page', page).maybeSingle();
      if(error){
        if(!_preferencesIndisponibles(error)) console.warn('[CurieuxDB] fetchPreferences', error.message);
        return {};
      }
      return (data && data.data && typeof data.data === 'object') ? data.data : {};
    }catch(e){ return {}; }
  }

  // Fusionne un patch dans les préférences de la page, jamais d'écrasement en
  // bloc : deux onglets peuvent régler deux clés différentes sans se défaire
  // l'un l'autre. Rend { error, data } avec data = l'objet fusionné.
  async function savePreferences(page, patch){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const existant = await fetchPreferences(page);
    const data = { ...existant, ...(patch || {}) };
    try{
      const { error } = await supabaseClient.from('preferences_utilisateur')
        .upsert({ page, data }, { onConflict: 'user_id,page' });
      if(error && !_preferencesIndisponibles(error)) console.warn('[CurieuxDB] savePreferences', error.message);
      return { error: error || null, data };
    }catch(e){
      return { error: { message: e && e.message ? e.message : String(e) }, data };
    }
  }

  // Les jetons permanents de tout un groupe, en une passe.
  //
  // Les liens envoyés portaient jusqu'ici le jeton d'une DEMANDE de dispo. Ce
  // jeton meurt avec la demande — tournée supprimée (cascade), demande retirée,
  // purge des sollicitations techniciennes — et le lien envoyé la semaine
  // d'avant cesse alors de fonctionner sans que personne ne l'ait décidé. Le
  // jeton permanent, lui, appartient à la personne et survit à tout.
  //
  // On lit la table d'un coup, on ne crée que ce qui manque : trente appels
  // réseau par rendu n'auraient pas été tenables.
  async function jetonsPermanentsPour(personnes){
    const carte = new Map();
    if(!supabaseClient) return carte;
    const { data, error } = await supabaseClient.from('acces_personnels').select('*');
    if(!error){
      (data || []).forEach(r=> carte.set(`${r.person_type}:${r.person_id}`, r.token));
    } else {
      console.warn('[CurieuxDB] jetonsPermanentsPour', error.message);
    }
    const manquants = (personnes || []).filter(p=> p && p.id && !carte.has(`${p.type}:${p.id}`));
    for(const p of manquants){
      const res = await ensureAccesPersonnel(p.id, p.type);
      if(res && res.token) carte.set(`${p.type}:${p.id}`, res.token);
    }
    return carte;
  }

  // Les villes où l'orchestre est chez lui : une date qui s'y déroule ne
  // demande pas de trajet, et le bloc qu'elle forme n'annonce pas de départ la
  // veille. Réglé depuis le tableau de bord admin.
  async function setVillesBase(villes){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { error } = await supabaseClient.from('reglages')
      .update({ villes_base: villes || [] }).eq('id', 1);
    if(error) console.warn('[CurieuxDB] setVillesBase', error.message);
    return { error };
  }

  // Les seuils d'alerte du tableau de bord technique, réglés depuis l'écran :
  // { planScene:[45,21], … } — [orange, rouge] en jours avant la date.
  async function setTechniqueSeuils(seuils){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { error } = await supabaseClient.from('reglages')
      .update({ technique_seuils: seuils || {} }).eq('id', 1);
    if(error) console.warn('[CurieuxDB] setTechniqueSeuils', error.message);
    return { error };
  }

  // Le référent de production : qui appeler quand quelque chose cloche. Réglé
  // depuis le tableau de bord admin, lu par les pages internes.
  async function setContactProduction(nom, telephone){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { error } = await supabaseClient.from('reglages')
      .update({ referent_nom: nom || '', referent_telephone: telephone || '' }).eq('id', 1);
    if(error) console.warn('[CurieuxDB] setContactProduction', error.message);
    return { error };
  }
  // Même contact, mais lisible par les pages à jeton : la table reglages est
  // fermée à la clé anonyme, cette fonction n'en sort que ces deux champs.
  async function getContactProduction(){
    if(!supabaseClient) return { nom:'', telephone:'' };
    const { data, error } = await supabaseClient.rpc('get_contact_production');
    if(error){ console.warn('[CurieuxDB] getContactProduction', error.message); return { nom:'', telephone:'' }; }
    const ligne = (data || [])[0] || {};
    return { nom: ligne.nom || '', telephone: ligne.telephone || '' };
  }
  async function setPhaseTest(actif){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    return _ecrire('setPhaseTest',
      () => supabaseClient.from('reglages').upsert({ id: 1, phase_test: !!actif }, { onConflict: 'id' }));
  }

  // --- Sauvegardes automatiques ---------------------------------------------
  // Les archives de devis déposées chaque nuit par api/sauvegarde-devis.js dans
  // le bucket privé « sauvegardes ». La lecture est ouverte aux seuls comptes
  // 'admin' par policy ; le lien de téléchargement est signé, donc temporaire.
  async function listerSauvegardes(){
    if(!supabaseClient) return [];
    const { data, error } = await supabaseClient.storage.from('sauvegardes')
      .list('devis', { limit: 60, sortBy: { column: 'name', order: 'desc' } });
    if(error){ console.warn('[CurieuxDB] listerSauvegardes', error.message); return []; }
    return (data || []).filter(o=> o.name && o.name.endsWith('.json'));
  }
  async function lienSauvegarde(nom){
    if(!supabaseClient) return '';
    const { data, error } = await supabaseClient.storage.from('sauvegardes')
      .createSignedUrl(`devis/${nom}`, 120);
    if(error){ console.warn('[CurieuxDB] lienSauvegarde', error.message); return ''; }
    return (data && data.signedUrl) || '';
  }
  // Déclenche une sauvegarde immédiate, avec le jeton de session de l'admin :
  // c'est la même route que le planificateur appelle chaque nuit.
  async function lancerSauvegardeDevis(){
    if(!supabaseClient) return { erreur: 'Supabase non chargé' };
    const { data } = await supabaseClient.auth.getSession();
    const jeton = data && data.session && data.session.access_token;
    if(!jeton) return { erreur: 'Session expirée — reconnecte-toi.' };
    try{
      const rep = await fetch('/api/sauvegarde-devis', {
        method: 'POST', headers: { Authorization: `Bearer ${jeton}` },
      });
      const corps = await rep.json().catch(()=> ({}));
      if(!rep.ok) return { erreur: corps.erreur || `Erreur ${rep.status}` };
      return corps;
    }catch(e){ return { erreur: e.message }; }
  }

  // Réglages de l'espace Devis (identité de l'émetteur, taux par défaut) —
  // une seule ligne jsonb, réservée aux admins par RLS. `absent:true` signale
  // que la migration n'est pas passée : la page l'explique au lieu de planter.
  async function fetchDevisReglages(){
    if(!supabaseClient) return { absent: true };
    const { data, error } = await supabaseClient.from('devis_reglages').select('*').eq('id', 1).maybeSingle();
    if(error){ console.warn('[CurieuxDB] fetchDevisReglages', error.message); return { absent: true }; }
    if(!data) return { absent: true };
    return { ...(data.data || {}), absent: false };
  }
  async function saveDevisReglages(reglages){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { absent, ...data } = reglages || {};
    return _ecrire('saveDevisReglages',
      () => supabaseClient.from('devis_reglages').upsert({ id: 1, data }, { onConflict: 'id' }));
  }

  // Compte les lignes de chaque table purgeable, pour annoncer ce qu'on
  // s'apprête à supprimer AVANT de le supprimer.
  async function compterLignesPurgeables(){
    if(!supabaseClient) return { lignes: [], error: { message: 'Supabase non chargé' } };
    const { data, error } = await supabaseClient.rpc('compter_lignes_purgeables');
    if(error){
      console.warn('[CurieuxDB] compterLignesPurgeables', error.message);
      return { lignes: [], error, migrationAbsente: _fonctionAbsente(error) };
    }
    return { lignes: (data || []).map(r => ({ table: r.nom_table, lignes: Number(r.lignes) })) };
  }
  // Vide les tables demandées. La liste blanche et le double verrou (compte
  // admin + phase de test) sont côté base : l'interface ne fait que proposer.
  async function purgerDonneesEssai(tables){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    if(!tables || !tables.length) return { resultats: [] };
    const { data, error } = await supabaseClient.rpc('purger_donnees_essai', { p_tables: tables });
    if(error){
      console.warn('[CurieuxDB] purgerDonneesEssai', error.message);
      return { error, migrationAbsente: _fonctionAbsente(error) };
    }
    return { resultats: (data || []).map(r => ({ table: r.table_videe, lignes: Number(r.lignes_supprimees) })) };
  }

  // ——— B1 · fiches techniques ———————————————————————————————————————
  // drive_url reste la source : ce lien pointe directement sur le fichier
  // partagé, donc toujours à jour sans rien à synchroniser. Publier une
  // "version" ne fait que journaliser une étiquette et horodater — aucun
  // fichier ne transite par ici.
  async function publierVersionFiche(ficheId, label, changelog){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const maintenant = new Date().toISOString();
    const maj = await supabaseClient.from('fiches_techniques')
      .update({ version_actuelle: label || '', version_le: maintenant }).eq('id', ficheId);
    if(maj.error) return { error: maj.error };

    const insertion = await supabaseClient.from('fiches_techniques_versions').insert({
      id: _identifiant(), fiche_id: ficheId, label: label || '', changelog: changelog || ''
    });
    if(insertion.error) return { error: insertion.error };
    return { label };
  }
  async function fetchVersionsFiche(ficheId){
    if(!supabaseClient) return [];
    const { data, error } = await supabaseClient.from('fiches_techniques_versions')
      .select('*').eq('fiche_id', ficheId).order('created_at', { ascending: false });
    if(error){ console.warn('[CurieuxDB] fetchVersionsFiche', error.message); return []; }
    return (data || []).map(adapterFor('fiches_techniques_versions').fromDb);
  }
  // Lecture publique du lien canonique : nom, lien Drive vivant, étiquette de
  // version — et rien d'autre.
  async function getFicheTechniqueByToken(token){
    if(!supabaseClient) return null;
    const { data, error } = await supabaseClient.rpc('get_fiche_technique_by_token', { p_token: token });
    if(error){ console.warn('[CurieuxDB] getFicheTechniqueByToken', error.message); return null; }
    const row = (data || [])[0];
    if(!row) return null;
    return { nom: row.nom, driveUrl: row.drive_url, versionActuelle: row.version_actuelle, versionLe: row.version_le };
  }

  // ——— B4 · récapitulatif logistique (trois audiences) ————————————————
  // Un seul aller-retour, côté base, qui ne renvoie que la logistique : ni le
  // répertoire, ni les informations d'embauche ne passent par ce jeton.
  async function getRecapLogistique(token){
    if(!supabaseClient) return null;
    const { data, error } = await supabaseClient.rpc('get_recap_logistique', { p_token: token });
    if(error){ console.warn('[CurieuxDB] getRecapLogistique', error.message); return null; }
    return data || null;
  }
  // Une salle (jeton type='salle') répond à un créneau précis, avec
  // confirmation ou contre-proposition justifiée.
  async function repondreVacationSalle(token, dateId, typeVacation, index, reponse){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { data, error } = await supabaseClient.rpc('repondre_vacation_salle', {
      p_token: token, p_date_id: dateId, p_type_vacation: typeVacation, p_index: index, p_reponse: reponse
    });
    if(error){ console.warn('[CurieuxDB] repondreVacationSalle', error.message); return { error }; }
    return { ok: !!data };
  }
  // Le stage manager (jeton type='stage_manager') positionne ses semis sur
  // le plan d'une date.
  async function enregistrerPositionsSemis(token, dateId, positions){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { data, error } = await supabaseClient.rpc('enregistrer_positions_semis', {
      p_token: token, p_date_id: dateId, p_positions: positions
    });
    if(error){ console.warn('[CurieuxDB] enregistrerPositionsSemis', error.message); return { error }; }
    return { ok: !!data };
  }
  // Une remarque laissée depuis un lien partagé. Bornée à 2000 caractères côté
  // base : un lien public ne doit pas pouvoir écrire un roman.
  async function ajouterRemarqueParJeton(token, dateId, sujet, message){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { data, error } = await supabaseClient.rpc('ajouter_remarque_par_jeton', {
      p_token: token, p_date_id: dateId || null, p_sujet: sujet || '', p_message: message || ''
    });
    if(error){ console.warn('[CurieuxDB] ajouterRemarqueParJeton', error.message); return { error }; }
    return { ok: !!data };
  }
  // Horodate le cycle de vie d'un accès partagé depuis la page publique :
  // 'ouverture' au chargement, 'reponse' après chaque écriture réussie. C'est
  // le seul droit d'écriture du destinataire sur sa propre ligne d'accès, et il
  // ne porte que des dates (voir toucher_acces dans migrations.sql).
  //
  // Volontairement silencieuse : si la migration du Lot C n'a pas encore été
  // passée, la fonction n'existe pas et l'appel échoue — ce n'est pas une
  // raison pour empêcher une salle de confirmer ses vacations.
  async function toucherAcces(token, evenement){
    if(!supabaseClient || !token) return false;
    try{
      const { data, error } = await supabaseClient.rpc('toucher_acces', {
        p_token: token, p_evenement: evenement || 'ouverture'
      });
      if(error) return false;
      return !!data;
    }catch(e){ return false; }
  }
  // Les remarques déjà envoyées par ce lien — pour que son auteur les relise au
  // lieu de croire que rien n'est parti.
  async function getRemarquesParJeton(token){
    if(!supabaseClient) return [];
    const { data, error } = await supabaseClient.rpc('get_remarques_par_jeton', { p_token: token });
    if(error){ console.warn('[CurieuxDB] getRemarquesParJeton', error.message); return []; }
    return (data || []).map(r=> ({ id:r.id, dateId:r.date_id || '', sujet:r.sujet || '',
      message:r.message || '', traitee: !!r.traitee, createdAt: r.created_at }));
  }
  // Rattache à une date le plan de salle déposé par le stage manager. Le fichier
  // lui-même passe par api/deposer-plan-salle.js : le bucket exige un compte, et
  // l'ouvrir à la clé anonyme offrirait un dépôt de fichiers sans
  // authentification à qui lit le code source.
  async function enregistrerPlanSalleParJeton(token, dateId, chemin){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { data, error } = await supabaseClient.rpc('enregistrer_plan_salle_par_jeton', {
      p_token: token, p_date_id: dateId, p_chemin: chemin || ''
    });
    if(error){ console.warn('[CurieuxDB] enregistrerPlanSalleParJeton', error.message); return { error }; }
    return { ok: !!data };
  }
  // Le stage manager (jeton type='stage_manager') modifie les horaires de la
  // journée (load in, get in…) d'une date.
  async function enregistrerHorairesJournee(token, dateId, horaires){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { data, error } = await supabaseClient.rpc('enregistrer_horaires_journee', {
      p_token: token, p_date_id: dateId, p_horaires: horaires
    });
    if(error){ console.warn('[CurieuxDB] enregistrerHorairesJournee', error.message); return { error }; }
    return { ok: !!data };
  }
  // Dépôt d'une image de plan de salle (bucket réutilisé, append-only :
  // chaque dépôt prend un chemin distinct plutôt que d'écraser le précédent,
  // pour ne pas dépendre des policies UPDATE/DELETE du bucket).
  async function deposerPlanSalle(dateKey, fichier){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const suffixe = (fichier.name.match(/\.[a-z0-9]+$/i) || ['.jpg'])[0].toLowerCase();
    const chemin = `plans/${dateKey}-${_identifiant()}${suffixe}`;
    const depot = await supabaseClient.storage.from('fiches-techniques')
      .upload(chemin, fichier, { contentType: fichier.type || 'image/jpeg', upsert: false });
    if(depot.error) return { error: depot.error };
    return { chemin };
  }
  function urlPubliquePlanSalle(chemin){
    if(!chemin || !supabaseClient) return '';
    const { data } = supabaseClient.storage.from('fiches-techniques').getPublicUrl(chemin);
    return (data && data.publicUrl) || '';
  }

  /* ------------------------------------------------------------------------
     LES PARTITIONS
     ------------------------------------------------------------------------
     Le bucket « partitions » est PRIVÉ, et il le reste. Le dépôt se fait ici,
     depuis le navigateur de la production : trente fichiers de 1,7 Mo ne
     passent pas par une fonction serverless, dont le corps de requête est
     plafonné à 4,5 Mo. La LECTURE, elle, ne se fait jamais d'ici : un musicien
     qui recevrait une URL vers le bucket recevrait l'exemplaire PROPRE, celui
     qui ne désigne personne. Il passe par /api/partition, qui lit avec la clé
     de service et ne rend qu'un exemplaire filigrané à son nom.
     ------------------------------------------------------------------------ */

  // upsert:false — on ne remplace jamais un fichier en place. Un chemin porte
  // un identifiant unique, si bien qu'un dépôt ne peut pas en écraser un autre
  // par collision de nom : « Violon 1.pdf » déposé deux fois donne deux
  // fichiers, et c'est à la page de proposer de retirer l'ancien.
  async function deposerPartition(spectacleId, partieId, fichier){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const chemin = `${spectacleId}/${partieId}/${_identifiant()}.pdf`;
    const depot = await supabaseClient.storage.from('partitions')
      .upload(chemin, fichier, { contentType: 'application/pdf', upsert: false });
    if(depot.error) return { error: depot.error };
    return { chemin };
  }

  async function retirerPartition(chemin){
    if(!supabaseClient || !chemin) return { error: null };
    const { error } = await supabaseClient.storage.from('partitions').remove([chemin]);
    if(error) console.warn('[CurieuxDB] retirerPartition', error.message);
    return { error: error || null };
  }

  // Ce que voit un musicien dans son espace, en un seul aller-retour. Le code
  // de l'opération n'est PAS demandé ici : voir qu'on a trois partitions qui
  // attendent est une information utile et sans risque ; c'est pour les
  // télécharger qu'il faut le code.
  async function mesPartitions(token){
    if(!supabaseClient) return null;
    const { data, error } = await supabaseClient.rpc('mes_partitions', { p_token: token });
    if(!error) return data || null;
    if(_fonctionAbsente(error)) return { migrationAbsente: true };
    console.warn('[CurieuxDB] mesPartitions', error.message);
    return null;
  }

  /* Ce que voit un ensemble tiers en ouvrant le lien qu'on lui a confié. Le
     code n'est PAS demandé ici, pour la même raison que du côté des musiciens :
     un bibliothécaire qui ouvre le lien doit voir ce qu'on lui confie — trente
     parties, tant de mégaoctets — avant de chercher le code dans ses mails. */
  async function envoiPartitions(jeton){
    if(!supabaseClient) return null;
    const { data, error } = await supabaseClient.rpc('envoi_partitions', { p_jeton: jeton });
    if(!error) return data || null;
    if(_fonctionAbsente(error)) return { migrationAbsente: true };
    console.warn('[CurieuxDB] envoiPartitions', error.message);
    return null;
  }

  /* Le jeton d'un lot confié. 32 caractères tirés de l'alphabet que
     /api/partition accepte — [A-Za-z0-9_-] —, soit ~190 bits : un lien qui ne
     se devine pas, et qui ne porte AUCUNE information sur ce qu'il ouvre. */
  function nouveauJetonEnvoi(){
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const octets = new Uint8Array(32);
    crypto.getRandomValues(octets);
    return Array.from(octets, b => alphabet[b % alphabet.length]).join('');
  }

  function _identifiant(){
    return (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID().replace(/-/g, '')
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  return {
    fetchAll, fetchOne, tableManquante, syncCollection, upsertOne, upsertOneVersionne, removeOne, removeMany, removePerson, supprimerRattachesDate, fetchSnapshot, saveSnapshot, subscribe,
    fetchReglages, fetchPreferences, savePreferences, setPhaseTest, setVillesBase, setTechniqueSeuils, setContactProduction, getContactProduction, compterLignesPurgeables, purgerDonneesEssai,
    fetchDevisReglages, saveDevisReglages,
    listerSauvegardes, lienSauvegarde, lancerSauvegardeDevis,
    publierVersionFiche, fetchVersionsFiche, getFicheTechniqueByToken,
    getRecapLogistique, repondreVacationSalle, enregistrerPositionsSemis, enregistrerHorairesJournee,
    ajouterRemarqueParJeton, getRemarquesParJeton, enregistrerPlanSalleParJeton, toucherAcces,
    deposerPlanSalle, urlPubliquePlanSalle,
    deposerPartition, retirerPartition, mesPartitions, envoiPartitions, nouveauJetonEnvoi,
    onEtatEcriture, reessayerEcritures, ecrituresEnAttente,
    signIn, signOut, getSession, onAuthStateChange, updateOwnPassword,
    getMyRole, hasAppAccess, isSuperAdmin, hasDirectionTechniqueAccess,
    listAccounts, setAccountRole, removeAccount, setDirectionTechniqueAccess,
    createAccountWithPassword, sendMagicLinkInvite, fetchAuditLog,
    mesDemandesDispo, mesDates, resolvePersonToken, creerCompteEquipeSansEmail,
    fetchCorbeille, restaurerDepuisCorbeille, revenirA,
    getInfosSocialesByToken, upsertInfosSocialesByToken,
    getDispoDemandeByToken, markDispoRespondedByToken,
    updateOwnContactByToken, updateOwnDisponibilitesByToken, updateOwnPrenomUsageByToken,
    getRemplacantPrefsByToken, upsertRemplacantPrefsByToken,
    getOwnPersonByToken, getRosterForPicker, getTourneeByToken, ensureAccesPersonnel, jetonsPermanentsPour,
    getCachetOverrideByToken, removeCachetOverridesForTournee,
    reportBug
  };
})();
