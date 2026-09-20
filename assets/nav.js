// ============================================================================
// Navigation — bandeau fixe + sous-menu contextuel.
//
// Pourquoi : l'irritant n°1 relevé par l'équipe de prod était « la navigation
// et l'ergo globale ». Le menu d'origine était une rangée de menus déroulants
// à ouvrir un par un, et passer d'un écran d'une section à l'autre (grille des
// dispos → demandes titulaires, avancement technique → matériel) demandait
// systématiquement de rouvrir un déroulant. La refonte 2026 l'a remplacé par :
//
//   - le bandeau prune collant : les sections restent visibles partout ;
//   - la section courante déplie un sous-menu, lui aussi collant, qui donne
//     accès en un clic à tous ses écrans — plus d'aller-retour par l'accueil.
//
// ----------------------------------------------------------------------------
// DEUX MODÈLES COEXISTENT (septembre 2026)
// ----------------------------------------------------------------------------
// v1 — CURIEUX_SECTIONS : la rangée plate de onze entrées, telle qu'elle est en
//      production depuis la refonte. Conservée ici mot pour mot : c'est le
//      chemin de retour, pas une reconstitution.
//
// v2 — CURIEUX_SECTIONS_V2 : cinq déroulants nommés par métier (Production,
//      Distribution, Technique, Annuaires, Gestion) + un raccourci direct vers
//      le tableau de service. Onze entrées de niveau 1 réclamaient ~1600 px
//      pour un compte admin : sur un portable, la rangée défilait
//      horizontalement, barre de défilement masquée. Cinq déroulants tiennent
//      dans ~1250 px, recherche comprise.
//
//      Le sous-menu contextuel est CONSERVÉ en v2, et c'est le point clé : le
//      déroulant sert à atteindre n'importe quel écran en un clic depuis
//      n'importe où, le sous-menu à circuler dans la section courante sans
//      rien rouvrir. Sans lui, la v2 rejouerait l'irritant n°1.
//
// COMMENT BASCULER :
//   - durablement, pour tout le monde : CURIEUX_NAV_DEFAUT ci-dessous ('v1'
//     restaure exactement le menu actuel, sans autre modification) ;
//   - pour soi, sans redéploiement : ajouter ?nav=v1 (ou ?nav=v2) à l'URL de
//     n'importe quelle page. Le choix est retenu dans ce navigateur jusqu'au
//     prochain ?nav=.
// ============================================================================

const CURIEUX_NAV_DEFAUT = 'v2';

// Le paramètre d'URL l'emporte et se retient : on ouvre une page avec ?nav=v1,
// on continue à naviguer, et tout le site reste en v1 tant qu'on n'a pas
// demandé ?nav=v2. C'est ce qui permet à quelqu'un de comparer les deux menus
// sur la même base de données, sans toucher au code ni gêner les autres.
function curieuxNavVersion(){
  let demande = '';
  try{ demande = new URLSearchParams(location.search).get('nav') || ''; }catch(e){}
  if(demande === 'v1' || demande === 'v2'){
    try{ localStorage.setItem('curieuxNav', demande); }catch(e){}
    return demande;
  }
  let retenu = '';
  try{ retenu = localStorage.getItem('curieuxNav') || ''; }catch(e){}
  if(retenu === 'v1' || retenu === 'v2') return retenu;
  return CURIEUX_NAV_DEFAUT === 'v1' ? 'v1' : 'v2';
}

// ============================================================================
// v1 — le menu actuel. NE PAS MODIFIER : c'est l'état de retour.
// ============================================================================

// Chaque section : un libellé, la page ouverte par le clic sur la section, et
// ses écrans. « pages » liste les fichiers qui doivent allumer l'entrée — un
// écran de détail (technique-date, feuille-de-route) allume l'entrée de sa
// liste parente plutôt que de disparaître du menu.
const CURIEUX_SECTIONS = [
  { libelle:'Accueil', href:'accueil.html', pages:['accueil.html'] },
  { libelle:'Tournées', href:'tournees.html', entrees:[
    { libelle:'Gérer les tournées', href:'tournees.html', pages:['tournees.html'] },
    { libelle:'Feuilles de route', href:'feuilles-de-route.html', pages:['feuilles-de-route.html','feuille-de-route.html'] },
    { libelle:'Journal des changements', href:'newsletter.html', pages:['newsletter.html'] },
  ]},
  /* Les invitations sont une section à part entière, pas une entrée sous
     Tournées : on y passe plusieurs fois par semaine en pleine tournée — pour
     ajouter une demande, relire une liste, la transmettre à la salle — et une
     page qu'on ouvre aussi souvent ne se cherche pas à deux clics.

     Un seul écran, donc pas de sous-menu : le projet se choisit dans la page,
     pas dans le bandeau, parce qu'on en change en cours de travail. */
  { libelle:'Invitations', href:'invitations.html', pages:['invitations.html'] },
  /* Les partitions sont une section à part entière, et pas une sous-entrée de
     Tournées : on y range le matériel d'un SPECTACLE, qui survit à l'opération
     et sert aux quatre suivantes. La ranger sous une opération dirait le
     contraire de ce que la page organise.

     Un seul écran, donc pas de sous-menu : le spectacle et l'opération se
     choisissent dans la page, parce qu'on passe de l'un à l'autre en cours de
     travail — on dépose, on affecte, on revient déposer ce qui manquait. */
  { libelle:'Partitions', href:'partitions.html', pages:['partitions.html','partitions.html?type=recording'] },
  // Les enregistrements en studio vivent dans les mêmes pages que les tournées,
  // filtrées par ?type=recording : mêmes dates, mêmes affectations, mêmes
  // feuilles, seul le vocabulaire change (voir CURIEUX_VOCABULAIRE).
  { libelle:'Recording', href:'tournees.html?type=recording', entrees:[
    { libelle:'Gérer les recordings', href:'tournees.html?type=recording', pages:['tournees.html?type=recording'] },
    { libelle:'Feuilles de studio', href:'feuilles-de-route.html?type=recording', pages:['feuilles-de-route.html?type=recording','feuille-de-route.html?type=recording'] },
  ]},
  { libelle:'Annuaires', href:'annuaire.html', entrees:[
    { libelle:'Musicien·nes', href:'annuaire.html', pages:['annuaire.html'] },
    { libelle:'Technicien·nes', href:'techniciens.html', pages:['techniciens.html'] },
    { libelle:'Remplacements', href:'remplacements.html', pages:['remplacements.html'] },
    { libelle:'Infos sociales', href:'infos-sociales.html', pages:['infos-sociales.html'] },
  ]},
  // « Demandes titulaires » en tête, et donc page d'atterrissage de l'onglet :
  // c'est de là qu'on part — on demande leurs disponibilités, puis on regarde
  // le tableau.
  //
  // La « Grille interne » a disparu : elle montrait la même matrice que la Vue
  // d'ensemble, en sachant moins de choses (ni les projets, ni qui a été
  // sollicité, ni les précisions), et n'avait plus en propre que l'import de
  // réponses collées — qui est passé sur le tableau de service. Deux écrans
  // suffisent : un pour demander et relancer, un pour voir et décider.
  //
  // Le tableau de service entre donc dans cette section, tout en gardant son entrée
  // primaire dans le bandeau : c'est la page la plus ouverte de l'application,
  // la reléguer à deux clics aurait été un recul. Elle est bien une page de
  // disponibilités, elle se range ici aussi.
  { libelle:'Disponibilités', href:'suivi-dispo.html', entrees:[
    { libelle:'Demandes titulaires', href:'suivi-dispo.html', pages:['suivi-dispo.html'] },
    { libelle:'Tableau de service', href:'recap.html', pages:['recap.html'] },
    // Tout ce qui part vers l'équipe passe par là : relancer une dispo,
    // annoncer une option, dire qu'une date est validée. C'était éparpillé sur
    // les boutons de chaque page, donc fait de mémoire et jamais tracé.
    { libelle:'Messages', href:'messages.html', pages:['messages.html'] },
    // Le récapitulatif des dates en PDF. Il vivait en dernière étape des
    // messages, mais on le génère souvent sans écrire à personne — pour
    // l'imprimer ou le passer à un partenaire — et il n'a besoin ni de lien
    // personnel ni de trace d'envoi : il a sa page, à côté.
    { libelle:'Documents', href:'documents.html', pages:['documents.html'] },
  ]},
  // Le tableau de bord passe en tête et devient la porte de l'espace : la page
  // Avancement dit l'état, le tableau de bord dit quoi faire — c'est par là
  // qu'on entre le matin.
  { libelle:'Technique', href:'technique-taches.html', entrees:[
    { libelle:'Tableau de bord', href:'technique-taches.html', pages:['technique-taches.html'] },
    { libelle:'Avancement', href:'technique.html', pages:['technique.html','technique-date.html'] },
    { libelle:'Salles', href:'salles.html', pages:['salles.html','salle.html'] },
    { libelle:'Matériel', href:'materiel.html', pages:['materiel.html'] },
    { libelle:'Véhicules & chauffeurs', href:'vehicules.html', pages:['vehicules.html'] },
    { libelle:'Fiches techniques', href:'fiches-techniques.html', pages:['fiches-techniques.html'] },
    { libelle:'Partage', href:'partage.html', pages:['partage.html','technique-partage.html'] },
    { libelle:'Page salle', href:'page-salle.html', pages:['page-salle.html'] },
  ]},
  /* Deux façons de lire la même donnée : le tableau croisé pour décider qui
     joue quoi, et la feuille par date pour le dire à quelqu'un d'extérieur.

     « Vue d'ensemble » ne disait rien : toutes les pages de l'outil sont des
     vues d'ensemble de quelque chose. « Tableau de service » est le nom que le
     métier donne depuis toujours à ce document — la grille qui dit qui est
     appelé sur quel service — et il s'entend sans explication d'un pupitre à
     l'autre. */
  { libelle:'Tableau de service', href:'recap.html', entrees:[
    { libelle:'Le tableau', href:'recap.html', pages:['recap.html'] },
    { libelle:'Plateau par date', href:'plateau.html', pages:['plateau.html'] },
  ]},
  // Le budget sort de l'administration : chiffrer un projet est un travail de
  // production, pas un réglage de l'outil, et le ranger sous « Admin » le
  // faisait chercher à trois clics. Il garde en revanche la même porte — les
  // comptes 'admin' seulement (voir requireSuperAdminAuth sur chaque page) :
  // les cachets et les marges ne se montrent pas à toute l'équipe.
  { libelle:'Budget', href:'budget.html', admin:true, entrees:[
    { libelle:'Tableau de bord', href:'budget.html', pages:['budget.html'] },
    { libelle:'Devis et budgets', href:'devis.html', pages:['devis.html','devis-editeur.html'] },
    { libelle:'Suivi des dépenses', href:'suivi.html', pages:['suivi.html'] },
    { libelle:'Clients', href:'devis-clients.html', pages:['devis-clients.html'] },
  ]},
  // Réservée aux comptes 'admin' : elle n'entre dans le bandeau qu'après
  // vérification (voir ajouterEntreesAdmin), pour éviter d'afficher à toute
  // l'équipe une porte qui lui serait refusée.
  { libelle:'Admin', href:'admin-dashboard.html', admin:true, entrees:[
    { libelle:'Tableau de bord', href:'admin-dashboard.html', pages:['admin-dashboard.html'] },
  ]},
];

// ============================================================================
// v2 — cinq déroulants nommés par métier.
//
// Le principe : le niveau 1 nomme le MÉTIER (qui fait ce travail), pas l'objet.
// Un poste = un menu, un menu = huit entrées au plus, réparties en groupes
// titrés. Aucune URL ne change, aucun fichier n'est renommé : seul l'ordre de
// rangement bouge.
//
// Règle qui tient toute la structure : UN ÉCRAN = UNE SEULE ENTRÉE DE MENU.
// C'est elle qui corrige au passage le défaut de la v1, où recap.html était
// déclaré deux fois (entrée sous « Disponibilités » ET section à part entière) :
// curieuxSectionCourante() retournant la première correspondance, la section
// « Tableau de service » ne s'allumait jamais. Ici recap.html n'est déclaré
// qu'une fois, sous Distribution ; le bouton du bandeau n'est qu'un raccourci
// vers cette entrée (voir CURIEUX_RACCOURCIS_V2).
//
// « sticker » n'a rien à voir avec le bandeau : c'est l'habillage de la tuile
// correspondante sur l'accueil, qui lit ce même modèle (voir
// curieuxHomeSections plus bas). Un seul modèle nourrit les deux, ce qui rend
// impossible la divergence qu'on avait — l'accueil ignorait cinq écrans que le
// bandeau proposait (Invitations, Partitions, Messages, Plateau par date,
// Suivi des dépenses).
// ============================================================================

const CURIEUX_SECTIONS_V2 = [
  /* PRODUCTION — l'opération : ce qui se vend, se date, se joue.
     Absorbe quatre entrées de niveau 1 de la v1 (Tournées, Recording,
     Invitations, Partitions). Les groupes titrés préservent ce que la v1
     disait en les séparant : une partition appartient à un SPECTACLE et
     survit à l'opération, d'où son propre groupe « Bibliothèque » et non une
     place à la suite des feuilles de route. */
  { libelle:'Production', href:'tournees.html',
    sticker:{ fond:'#CEE1F4', encre:'#791649', chip:'♩', chipFond:'#791649', chipEncre:'#FCF2F0', chipTilt:'-6deg', tilt:'-1.1deg', lienFond:'rgba(252,242,240,.9)', lienEncre:'#791649' },
    entrees:[
      { groupe:'Tournées', libelle:'Gérer les tournées', href:'tournees.html', pages:['tournees.html'] },
      { groupe:'Tournées', libelle:'Feuilles de route', href:'feuilles-de-route.html', pages:['feuilles-de-route.html','feuille-de-route.html'] },
      // Mêmes pages que les tournées, filtrées par ?type=recording : mêmes
      // dates, mêmes affectations, mêmes feuilles, seul le vocabulaire change
      // (voir CURIEUX_VOCABULAIRE).
      { groupe:'Recording', libelle:'Gérer les recordings', href:'tournees.html?type=recording', pages:['tournees.html?type=recording'] },
      { groupe:'Recording', libelle:'Feuilles de studio', href:'feuilles-de-route.html?type=recording', pages:['feuilles-de-route.html?type=recording','feuille-de-route.html?type=recording'] },
      { groupe:'Autour de la date', libelle:'Invitations', href:'invitations.html', pages:['invitations.html'] },
      { groupe:'Autour de la date', libelle:'Journal des changements', href:'newsletter.html', pages:['newsletter.html'] },
      { groupe:'Bibliothèque', libelle:'Partitions', href:'partitions.html', pages:['partitions.html','partitions.html?type=recording'] },
    ]},

  /* DISTRIBUTION — qui joue quoi, quand.
     Ex-« Disponibilités », renommée : le mot couvrait mal Messages et
     Documents, qui ne sont pas des disponibilités mais ce qu'on en fait.
     « Plateau par date » rejoint le tableau de service, dont il est l'autre
     lecture : le tableau croisé pour décider, la feuille par date pour le dire
     à quelqu'un d'extérieur. */
  { libelle:'Distribution', href:'recap.html',
    sticker:{ fond:'#FEC9E0', encre:'#791649', chip:'✓', chipFond:'#EC4B15', chipEncre:'#FCF2F0', chipTilt:'5deg', tilt:'.9deg', lienFond:'rgba(252,242,240,.9)', lienEncre:'#791649' },
    entrees:[
      { groupe:'Décider', libelle:'Tableau de service', href:'recap.html', pages:['recap.html'] },
      { groupe:'Décider', libelle:'Plateau par date', href:'plateau.html', pages:['plateau.html'] },
      { groupe:'Collecter', libelle:'Demandes titulaires', href:'suivi-dispo.html', pages:['suivi-dispo.html'] },
      // Tout ce qui part vers l'équipe passe par là : relancer une dispo,
      // annoncer une option, dire qu'une date est validée.
      { groupe:'Transmettre', libelle:'Messages', href:'messages.html', pages:['messages.html'] },
      // Le récapitulatif des dates en PDF, qu'on génère souvent sans écrire à
      // personne — pour l'imprimer ou le passer à un partenaire.
      { groupe:'Transmettre', libelle:'Documents', href:'documents.html', pages:['documents.html'] },
    ]},

  /* TECHNIQUE — contenu identique à la v1, simplement groupé.
     Huit entrées : c'est la section la plus fournie, et le plafond que la
     structure se donne. Au-delà, il faudra couper, pas allonger. */
  { libelle:'Technique', href:'technique-taches.html',
    sticker:{ fond:'#141617', encre:'#FCF2F0', chip:'⚙', chipFond:'#FCF2F0', chipEncre:'#141617', chipTilt:'-5deg', tilt:'-.8deg', lienFond:'rgba(252,242,240,.19)', lienEncre:'#FCF2F0' },
    entrees:[
      // Le tableau de bord en tête : la page Avancement dit l'état, le tableau
      // de bord dit quoi faire — c'est par là qu'on entre le matin.
      { groupe:'Piloter', libelle:'Tableau de bord', href:'technique-taches.html', pages:['technique-taches.html'] },
      { groupe:'Piloter', libelle:'Avancement par date', href:'technique.html', pages:['technique.html','technique-date.html'] },
      { groupe:'Ressources', libelle:'Salles', href:'salles.html', pages:['salles.html','salle.html'] },
      { groupe:'Ressources', libelle:'Matériel', href:'materiel.html', pages:['materiel.html'] },
      { groupe:'Ressources', libelle:'Véhicules & chauffeurs', href:'vehicules.html', pages:['vehicules.html'] },
      { groupe:'Documents & partage', libelle:'Fiches techniques', href:'fiches-techniques.html', pages:['fiches-techniques.html'] },
      { groupe:'Documents & partage', libelle:'Partage', href:'partage.html', pages:['partage.html','technique-partage.html'] },
      { groupe:'Documents & partage', libelle:'Page salle publique', href:'page-salle.html', pages:['page-salle.html'] },
    ]},

  /* ANNUAIRES — les fiches qui survivent aux projets.
     Contenu inchangé : ce menu n'avait pas de défaut, on ne le renomme donc
     pas. « Remplacements » y reste : c'est l'état des listes de remplaçant·es
     tenues par les titulaires, donc une propriété des fiches, pas un acte de
     distribution. */
  { libelle:'Annuaires', href:'annuaire.html',
    sticker:{ fond:'#791649', encre:'#FCF2F0', chip:'☎', chipFond:'#FEC9E0', chipEncre:'#791649', chipTilt:'5deg', tilt:'1deg', lienFond:'rgba(252,242,240,.19)', lienEncre:'#FCF2F0' },
    entrees:[
      { groupe:'Personnes', libelle:'Musicien·nes', href:'annuaire.html', pages:['annuaire.html'] },
      { groupe:'Personnes', libelle:'Technicien·nes', href:'techniciens.html', pages:['techniciens.html'] },
      { groupe:'Personnes', libelle:'Remplacements', href:'remplacements.html', pages:['remplacements.html'] },
      { groupe:'Cadre social', libelle:'Infos sociales', href:'infos-sociales.html', pages:['infos-sociales.html'] },
    ]},

  /* GESTION — réservée aux comptes 'admin' (voir requireSuperAdminAuth sur
     chaque page) : les cachets et les marges ne se montrent pas à toute
     l'équipe.

     Fusionne l'ex-« Budget » et l'ex-« Admin », qui n'avait qu'un seul écran —
     une entrée de niveau 1 pour une page, c'était le symptôme le plus net de
     la rangée plate.

     Placée en dernier, et c'est délibéré : le rôle se lit de façon asynchrone
     (isSuperAdmin), donc ce menu apparaît après le premier rendu. En bout de
     bandeau, rien de ce qui précède ne se décale sous le curseur.

     « Clients » reste ici plutôt que de rejoindre les Annuaires, dont c'est
     pourtant un : devis-clients.html est sous requireSuperAdminAuth, le
     déplacer créerait un menu à permissions mixtes où une entrée sur cinq
     renvoie une porte fermée. */
  { libelle:'Gestion', href:'budget.html', admin:true,
    sticker:{ fond:'#EC4B15', encre:'#FCF2F0', chip:'€', chipFond:'#FCF2F0', chipEncre:'#EC4B15', chipTilt:'-5deg', tilt:'-.9deg', lienFond:'rgba(252,242,240,.22)', lienEncre:'#FCF2F0' },
    entrees:[
      { groupe:'Budget', libelle:'Tableau de bord', href:'budget.html', pages:['budget.html'] },
      { groupe:'Budget', libelle:'Devis et budgets', href:'devis.html', pages:['devis.html','devis-editeur.html'] },
      { groupe:'Budget', libelle:'Suivi des dépenses', href:'suivi.html', pages:['suivi.html'] },
      { groupe:'Budget', libelle:'Clients', href:'devis-clients.html', pages:['devis-clients.html'] },
      { groupe:'Administration', libelle:'Comptes et accès', href:'admin-dashboard.html', pages:['admin-dashboard.html'] },
    ]},
];

/* Les raccourcis du bandeau : des boutons pleins, à droite des déroulants.
 *
 * Ce ne sont PAS des sections — ils ne portent aucun écran en propre, ils
 * pointent vers une entrée déjà déclarée dans un menu. C'est ce qui permet de
 * donner au tableau de service la place qu'il mérite (la page la plus ouverte
 * de l'application, la mettre à deux clics serait un recul) sans le déclarer
 * deux fois dans le modèle, faute qui rendait sa section injoignable en v1.
 *
 * Conséquence voulue : sur recap.html, c'est le sous-menu Distribution qui se
 * déplie — donc le plateau, les demandes titulaires, les messages et les
 * documents restent tous à un clic depuis le tableau.
 */
const CURIEUX_RACCOURCIS_V2 = [
  { libelle:'Tableau de service', href:'recap.html', pages:['recap.html'] },
];

function curieuxModele(){
  return curieuxNavVersion() === 'v1' ? CURIEUX_SECTIONS : CURIEUX_SECTIONS_V2;
}

/* Les entrées réservées du bandeau (v1 : Budget, Admin ; v2 : Gestion),
 * ajoutées après coup.
 *
 * Le rôle se lit côté base (isSuperAdmin), donc de façon asynchrone : attendre
 * cette réponse avant de dessiner le bandeau ferait clignoter toute la
 * navigation à chaque page. On dessine donc sans elles, et on les ajoute si le
 * compte y a droit — ce qui évite au passage de montrer aux comptes 'user' une
 * porte qui leur serait refusée.
 *
 * Sans réponse (page publique à jeton, session absente, base injoignable),
 * elles restent absentes : c'est le comportement prudent. Elles ne remplacent
 * évidemment pas le garde de chaque page réservée, qui reste seul à protéger.
 *
 * Toutes les sections marquées admin:true sont traitées, dans l'ordre du
 * modèle — la section courante est déjà dessinée par le bandeau, on la saute.
 */
async function ajouterEntreesAdmin(topbar, sectionCourante){
  const modele = curieuxModele();
  const reservees = modele.filter(s => s.admin && s !== sectionCourante);
  if(!reservees.length) return;
  const nav = topbar.querySelector('.co-topnav');
  if(!nav || typeof CurieuxDB === 'undefined') return;

  let autorise = false;
  try{ autorise = await CurieuxDB.isSuperAdmin(); }
  catch(e){ return; }
  if(!autorise || nav.querySelector('[data-entree-admin]')) return;

  const v2 = curieuxNavVersion() === 'v2';

  /* Chaque entrée se place à SA position du modèle, pas en bout de bandeau :
     « Budget » vient avant « Admin » quel que soit l'écran d'où l'on vient. La
     section courante, elle, est déjà dans le bandeau — on insère avant le
     premier élément qui, dans le modèle, la suit. */
  reservees.forEach(sec => {
    const rang = modele.indexOf(sec);
    const elements = Array.from(nav.children);
    const suivant = elements.find(el => {
      const s = modele.find(x => x.libelle === el.getAttribute('data-section'));
      return s && modele.indexOf(s) > rang;
    });
    const el = v2 ? construireDeroulant(sec, null) : construireLienPlat(sec);
    el.setAttribute('data-entree-admin', '1');
    nav.insertBefore(el, suivant || null);
    if(v2) brancherDeroulant(el);
  });

  // Le panneau téléphone est dessiné d'un bloc : on le redessine plutôt que
  // d'y insérer la section au bon endroit à la main.
  if(v2) redessinerPanneauMobile();
}

function construireLienPlat(sec){
  const lien = document.createElement('a');
  lien.href = sec.href;
  lien.textContent = sec.libelle;
  lien.setAttribute('data-section', sec.libelle);
  return lien;
}

// La clé d'une page, telle que les sections la déclarent. C'est le nom de
// fichier, sauf pour les écrans qu'un paramètre suffit à distinguer :
// tournees.html et tournees.html?type=recording sont deux entrées de menu
// différentes servies par le même fichier, il faut donc que la clé les
// sépare — sans quoi « Tournées » resterait allumé sur un recording.
function curieuxPageCourante(){
  const fichier = (location.pathname.split('/').pop() || 'accueil.html').toLowerCase();
  let type = '';
  try{ type = new URLSearchParams(location.search).get('type') || ''; }catch(e){}
  return type === 'recording' ? `${fichier}?type=recording` : fichier;
}

function curieuxSectionCourante(page){
  return curieuxModele().find(sec => {
    if(sec.pages && sec.pages.includes(page)) return true;
    return (sec.entrees || []).some(e => (e.pages || [e.href]).includes(page));
  }) || null;
}

// ---------------------------------------------------------------------------
// v2 — construction d'un déroulant.
//
// Ouverture au CLIC, jamais au survol : le survol est intenable sur tablette
// (il faut un premier appui pour ouvrir, qui déclenche le lien) et
// inutilisable au clavier. Une fois qu'un menu est ouvert, en revanche, le
// survol d'un voisin bascule dessus — c'est le comportement d'une barre de
// menus de système d'exploitation, et il évite de refermer/rouvrir pour
// comparer deux menus.
// ---------------------------------------------------------------------------
function construireDeroulant(sec, page){
  const item = document.createElement('div');
  item.className = 'co-nav-item';
  item.setAttribute('data-section', sec.libelle);

  const id = 'conav-' + sec.libelle.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
  const courante = page && (sec.entrees || []).some(e => (e.pages || [e.href]).includes(page));

  // Les entrées sont regroupées dans l'ordre du modèle : un groupe est une
  // suite d'entrées portant le même libellé de groupe, pas un tri. L'ordre du
  // modèle est donc l'ordre affiché, groupes compris.
  const groupes = [];
  (sec.entrees || []).forEach(e => {
    const titre = e.groupe || '';
    const dernier = groupes[groupes.length - 1];
    if(dernier && dernier.titre === titre) dernier.entrees.push(e);
    else groupes.push({ titre, entrees:[e] });
  });

  const corps = groupes.map(g => {
    const liens = g.entrees.map(e => {
      const actif = page && (e.pages || [e.href]).includes(page) ? ' aria-current="page"' : '';
      return `<a role="menuitem" href="${e.href}"${actif}>${e.libelle}</a>`;
    }).join('');
    const titre = g.titre ? `<p class="co-nav-groupe-titre">${g.titre}</p>` : '';
    return `<div class="co-nav-groupe">${titre}${liens}</div>`;
  }).join('');

  item.innerHTML = `
    <button type="button" class="co-nav-btn" aria-expanded="false" aria-haspopup="true"
            aria-controls="${id}"${courante ? ' data-courante="1"' : ''}>
      ${sec.libelle}<span class="co-nav-caret" aria-hidden="true"></span>
    </button>
    <div class="co-nav-menu" id="${id}" role="menu" aria-label="${sec.libelle}" hidden>${corps}</div>`;
  return item;
}

function fermerDeroulants(sauf){
  document.querySelectorAll('.co-nav-item.ouvert').forEach(item => {
    if(item === sauf) return;
    item.classList.remove('ouvert');
    const btn = item.querySelector('.co-nav-btn');
    const menu = item.querySelector('.co-nav-menu');
    if(btn) btn.setAttribute('aria-expanded', 'false');
    if(menu) menu.hidden = true;
  });
}

function ouvrirDeroulant(item, focaliserPremier){
  fermerDeroulants(item);
  item.classList.add('ouvert');
  const btn = item.querySelector('.co-nav-btn');
  const menu = item.querySelector('.co-nav-menu');
  if(btn) btn.setAttribute('aria-expanded', 'true');
  if(menu) menu.hidden = false;

  /* Le débordement se mesure à l'ouverture plutôt que de se deviner en CSS :
     la largeur d'un menu dépend de son entrée la plus longue (« Véhicules &
     chauffeurs »), et la position du dernier déroulant dépend du rôle du
     compte — Gestion n'apparaît qu'après la réponse d'isSuperAdmin. Aligné à
     droite, le menu rentre. */
  if(menu){
    item.removeAttribute('data-aligne-droite');
    const bord = menu.getBoundingClientRect().right;
    if(bord > document.documentElement.clientWidth - 8) item.setAttribute('data-aligne-droite', '1');
  }

  if(focaliserPremier && menu){
    const premier = menu.querySelector('a');
    if(premier) premier.focus();
  }
}

function brancherDeroulant(item){
  const btn = item.querySelector('.co-nav-btn');
  const menu = item.querySelector('.co-nav-menu');
  if(!btn || !menu) return;

  btn.addEventListener('click', (e)=>{
    e.stopPropagation();
    if(item.classList.contains('ouvert')) fermerDeroulants(null);
    else ouvrirDeroulant(item, false);
  });

  // Bascule au survol seulement si un menu est DÉJÀ ouvert (voir le commentaire
  // de construireDeroulant).
  item.addEventListener('mouseenter', ()=>{
    if(document.querySelector('.co-nav-item.ouvert') && !item.classList.contains('ouvert')){
      ouvrirDeroulant(item, false);
    }
  });

  btn.addEventListener('keydown', (e)=>{
    if(e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' '){
      e.preventDefault();
      ouvrirDeroulant(item, true);
    }
  });

  menu.addEventListener('keydown', (e)=>{
    const liens = Array.from(menu.querySelectorAll('a'));
    const i = liens.indexOf(document.activeElement);
    if(e.key === 'ArrowDown'){ e.preventDefault(); (liens[i + 1] || liens[0]).focus(); }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); (liens[i - 1] || liens[liens.length - 1]).focus(); }
    else if(e.key === 'Escape'){ e.preventDefault(); fermerDeroulants(null); btn.focus(); }
    else if(e.key === 'Tab'){ fermerDeroulants(null); }
  });
}

// Fermetures globales : un clic ailleurs, Échap depuis n'importe où, et le
// retour arrière du navigateur sur une page restaurée depuis le cache.
function brancherFermetureGlobale(){
  if(document.body.hasAttribute('data-conav-branche')) return;
  document.body.setAttribute('data-conav-branche', '1');
  document.addEventListener('click', (e)=>{
    if(!e.target.closest('.co-nav-item')) fermerDeroulants(null);
    if(!e.target.closest('.co-nav-mobile') && !e.target.closest('.co-burger')) fermerPanneauMobile();
  });
  document.addEventListener('keydown', (e)=>{
    if(e.key !== 'Escape') return;
    fermerDeroulants(null);
    fermerPanneauMobile();
  });
}

// ---------------------------------------------------------------------------
// v2 — le panneau téléphone.
//
// Cinq déroulants ne tiennent pas sous 900 px, et l'application est
// installable (PWA) : elle se consulte en tournée, sur un téléphone. Le
// panneau affiche tout à plat — sections, groupes, écrans — plutôt qu'en
// accordéons : sur un écran qui défile, un accordéon ajoute un appui par
// section pour économiser un défilement qui ne coûte rien.
// ---------------------------------------------------------------------------
function construirePanneauMobile(page){
  const sections = curieuxModele().filter(sec => !sec.admin || estSectionAffichee(sec));
  const blocs = sections.map(sec => {
    const entrees = (sec.entrees && sec.entrees.length) ? sec.entrees : [{ libelle:sec.libelle, href:sec.href, pages:sec.pages }];
    // Les groupes ne sont pas titrés ici : cinq sections déjà titrées plus
    // treize intertitres feraient plus d'étiquettes que de portes sur un
    // écran de téléphone. Un simple écart marque le changement de groupe —
    // « Gérer les recordings » ne colle plus à « Feuilles de route ».
    let groupePose = null;
    const liens = entrees.map(e => {
      const actif = page && (e.pages || [e.href]).includes(page) ? ' aria-current="page"' : '';
      const groupe = e.groupe || '';
      const saut = (groupePose !== null && groupe !== groupePose) ? ' class="debut-groupe"' : '';
      groupePose = groupe;
      return `<a href="${e.href}"${saut}${actif}>${e.libelle}</a>`;
    }).join('');
    return `<div class="co-nav-mobile-bloc"><p class="co-nav-mobile-titre">${sec.libelle}</p>${liens}</div>`;
  }).join('');

  /* La bascule clair/sombre descend ici sous 640 px. Mesuré : à 390 px, le
     bandeau faisait 408 px de contenu — logo, raccourci, bascule et pastille
     de compte ne tiennent pas ensemble, et la page défilait latéralement. La
     bascule est le seul de ces quatre éléments dont on peut se passer d'un
     geste : elle descend dans le panneau plutôt que de disparaître. */
  const reglages = `<div class="co-nav-mobile-bloc co-nav-mobile-reglages">
      <p class="co-nav-mobile-titre">Affichage</p>
      <button type="button" class="co-nav-mobile-theme" id="coNavMobileTheme"></button>
    </div>`;

  const panneau = document.createElement('div');
  panneau.className = 'co-nav-mobile';
  panneau.id = 'coNavMobile';
  panneau.hidden = true;
  panneau.innerHTML = `<div class="co-nav-mobile-in">${blocs}${reglages}</div>`;
  brancherThemeMobile(panneau);
  return panneau;
}

// Le bouton du panneau ne refait pas la bascule : il actionne celui du bandeau,
// qui reste la seule implémentation (préférence retenue, suivi du thème
// système, libellé). Il n'en reprend que l'étiquette.
function brancherThemeMobile(panneau){
  const btn = panneau.querySelector('#coNavMobileTheme');
  if(!btn) return;
  const maj = ()=>{
    const sombre = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.textContent = sombre ? 'Passer en clair' : 'Passer en sombre';
    btn.setAttribute('aria-pressed', sombre ? 'true' : 'false');
  };
  btn.addEventListener('click', ()=>{
    const source = document.getElementById('curieuxThemeToggle');
    if(source) source.click();
    maj();
  });
  maj();
  new MutationObserver(maj).observe(document.documentElement, { attributes:true, attributeFilter:['data-theme'] });
}

// Une section réservée n'entre dans le panneau que si elle est déjà dans le
// bandeau : c'est ajouterEntreesAdmin qui tranche, et redessinerPanneauMobile
// qui rejoue ce rendu une fois la réponse arrivée.
function estSectionAffichee(sec){
  const nav = document.querySelector('.co-topnav');
  if(!nav) return false;
  return !!nav.querySelector(`[data-section="${sec.libelle}"]`);
}

function redessinerPanneauMobile(){
  const ancien = document.getElementById('coNavMobile');
  if(!ancien) return;
  const ouvert = !ancien.hidden;
  const neuf = construirePanneauMobile(curieuxPageCourante());
  neuf.hidden = !ouvert;
  ancien.replaceWith(neuf);
}

function fermerPanneauMobile(){
  const panneau = document.getElementById('coNavMobile');
  const btn = document.querySelector('.co-burger');
  if(panneau) panneau.hidden = true;
  if(btn) btn.setAttribute('aria-expanded', 'false');
}

// Le bandeau est posé en premier enfant du <body> et le rembourrage horizontal
// passe du <body> au .wrap (voir base.css) : sinon le bandeau s'arrêtait à
// 16 px des bords et le collant se décalait du haut de la fenêtre.
function initCurieuxTopbar(){
  if(!document.body){
    document.addEventListener('DOMContentLoaded', initCurieuxTopbar);
    return;
  }
  if(document.querySelector('.co-topbar')) return;

  const v2 = curieuxNavVersion() === 'v2';
  const page = curieuxPageCourante();
  const section = curieuxSectionCourante(page);

  const topbar = document.createElement('header');
  topbar.className = 'co-topbar';
  if(v2) document.body.classList.add('co-nav-v2');

  // En v1, les sections réservées ne s'affichent que si on y est déjà ; en v2
  // c'est identique, ajouterEntreesAdmin fait le reste dans les deux cas.
  const liens = v2 ? '' : curieuxModele()
    .filter(sec => !sec.admin || sec === section)
    .map(sec => {
      const actif = sec === section ? ' aria-current="page"' : '';
      return `<a href="${sec.href}" data-section="${sec.libelle}"${actif}>${sec.libelle}</a>`;
    }).join('');

  const raccourcis = v2 ? CURIEUX_RACCOURCIS_V2.map(r => {
    const actif = (r.pages || [r.href]).includes(page) ? ' aria-current="page"' : '';
    return `<a class="co-raccourci" href="${r.href}"${actif}>${r.libelle}</a>`;
  }).join('') : '';

  const burger = v2
    ? `<button type="button" class="co-burger" aria-expanded="false" aria-controls="coNavMobile" aria-label="Menu">☰</button>`
    : '';

  topbar.innerHTML = `
    <div class="co-topbar-in">
      ${burger}
      <a class="co-topbar-logo-link" href="accueil.html" aria-label="Accueil — Curieux orchestre">
        <img class="co-topbar-logo" src="assets/images/logo-droit-noir.png" alt="Curieux orchestre">
      </a>
      <nav class="co-topnav" aria-label="Sections">${liens}</nav>
      ${raccourcis}
      <div class="page-nav co-topbar-actions" style="display:contents;"></div>
      <button type="button" class="co-theme-btn" id="curieuxThemeToggle" title="Basculer clair / sombre">Sombre</button>
      <span class="co-avatar" id="curieuxAvatar" title="Compte">·</span>
    </div>`;
  document.body.insertBefore(topbar, document.body.firstChild);
  document.body.classList.add('co-has-topbar');

  if(v2){
    const nav = topbar.querySelector('.co-topnav');
    curieuxModele()
      .filter(sec => !sec.admin || sec === section)
      .forEach(sec => {
        const item = construireDeroulant(sec, page);
        nav.appendChild(item);
        brancherDeroulant(item);
      });
    topbar.insertAdjacentElement('afterend', construirePanneauMobile(page));
    const btnBurger = topbar.querySelector('.co-burger');
    if(btnBurger){
      btnBurger.addEventListener('click', (e)=>{
        e.stopPropagation();
        const panneau = document.getElementById('coNavMobile');
        if(!panneau) return;
        const ouvrir = panneau.hidden;
        panneau.hidden = !ouvrir;
        btnBurger.setAttribute('aria-expanded', ouvrir ? 'true' : 'false');
        fermerDeroulants(null);
      });
    }
    brancherFermetureGlobale();
  }

  // Sous-menu de la section courante. Conservé en v2 : c'est lui qui évite de
  // rouvrir un déroulant pour passer d'un écran à l'autre d'une même section —
  // l'irritant qui avait fait supprimer les déroulants d'origine.
  // L'accueil n'en a pas : un seul écran, une barre vide serait du bruit.
  if(section && section.entrees && section.entrees.length){
    const sub = document.createElement('div');
    sub.className = 'co-subnav';
    const items = section.entrees.map(e => {
      const actif = (e.pages || [e.href]).includes(page) ? ' aria-current="page"' : '';
      return `<a href="${e.href}"${actif}>${e.libelle}</a>`;
    }).join('');
    sub.innerHTML = `<div class="co-subnav-in">
        <span class="co-subnav-title">${section.libelle}</span>${items}
      </div>`;
    const apres = document.getElementById('coNavMobile') || topbar;
    apres.insertAdjacentElement('afterend', sub);
  }

  // L'ancien en-tête (logo + rangée de menus déroulants) est retiré : son rôle
  // est repris par le bandeau. On le retire plutôt que de le masquer, pour ne
  // pas laisser deux menus dans l'ordre de tabulation.
  document.querySelectorAll('.brand-header').forEach(el => el.remove());
  document.querySelectorAll('nav.page-nav[data-curieux-nav]').forEach(el => el.remove());

  ajouterEntreesAdmin(topbar, section);
  initCurieuxThemeToggle();
  initCurieuxAvatar();
  try{ if(typeof initGlobalSearch === 'function') initGlobalSearch(topbar.querySelector('.co-topbar-actions')); }catch(e){}
  initCurieuxRaccourciRecherche();
}

// Le champ annonce « ⌘K » : le raccourci existe donc pour de vrai (⌘K sur Mac,
// Ctrl+K ailleurs). Ctrl+K est le raccourci « effacer jusqu'à la fin de ligne »
// dans un champ de saisie sous macOS, on ne le détourne donc pas quand la frappe
// vient déjà d'un champ.
function initCurieuxRaccourciRecherche(){
  document.addEventListener('keydown', (e)=>{
    if(e.key !== 'k' && e.key !== 'K') return;
    if(!(e.metaKey || e.ctrlKey)) return;
    const dansUnChamp = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '');
    if(dansUnChamp && !e.metaKey) return;
    const champ = document.getElementById('globalSearchInput');
    if(!champ) return;
    e.preventDefault();
    champ.focus();
    champ.select();
  });
}

// --- Bascule clair / sombre ------------------------------------------------
// Le site suivait le thème du système sans échappatoire. La maquette ajoute une
// bascule manuelle : le choix est retenu (localStorage) et l'emporte sur le
// système, « auto » reste possible en effaçant la préférence.
function curieuxThemePrefere(){
  try{ return localStorage.getItem('curieuxTheme') || ''; }catch(e){ return ''; }
}

function initCurieuxThemeToggle(){
  const btn = document.getElementById('curieuxThemeToggle');
  if(!btn) return;
  const maj = ()=>{
    const sombre = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.textContent = sombre ? 'Clair' : 'Sombre';
    btn.setAttribute('aria-pressed', sombre ? 'true' : 'false');
  };
  btn.addEventListener('click', ()=>{
    const sombre = document.documentElement.getAttribute('data-theme') === 'dark';
    try{ localStorage.setItem('curieuxTheme', sombre ? 'light' : 'dark'); }catch(e){}
    try{ applyAutoTheme(); }catch(e){
      document.documentElement.setAttribute('data-theme', sombre ? 'light' : 'dark');
    }
    maj();
  });
  maj();
  // applyAutoTheme() peut rebasculer le thème pendant la vie de la page (le
  // système change, ou le rappel setInterval de certaines pages) : on suit.
  new MutationObserver(maj).observe(document.documentElement, { attributes:true, attributeFilter:['data-theme'] });
}

// --- Pastille de compte ---------------------------------------------------
// Reprend l'initiale de la personne connectée, et sert de raccourci vers
// l'administration (le tableau de bord n'est pas une section du bandeau, comme
// dans la maquette — il reste accessible depuis l'accueil et depuis ici).
function initCurieuxAvatar(){
  const el = document.getElementById('curieuxAvatar');
  if(!el) return;
  const pose = (email)=>{
    if(!email) return;
    el.textContent = email.trim().charAt(0).toUpperCase();
    el.title = email;
    const lien = document.createElement('a');
    lien.className = 'co-avatar';
    lien.href = 'admin-dashboard.html';
    lien.textContent = el.textContent;
    lien.title = email + ' — administration';
    el.replaceWith(lien);
  };
  try{
    if(typeof CurieuxDB !== 'undefined' && CurieuxDB.getSession){
      Promise.resolve(CurieuxDB.getSession()).then(s => {
        const email = s && s.user && s.user.email;
        if(email) pose(email);
      }).catch(()=>{});
    }
  }catch(e){}
}

// --- Planche d'accueil -----------------------------------------------------
// L'accueil lisait sa propre liste de liens, distincte de celle du bandeau. Les
// deux ont divergé : cinq écrans proposés par le bandeau manquaient à l'accueil
// (Invitations, Partitions, Messages, Plateau par date, Suivi des dépenses). En
// v2, l'accueil lit le modèle du bandeau — la divergence redevient impossible.
// En v1, il garde sa liste d'origine, passée en secours.
function curieuxHomeSections(secours){
  if(curieuxNavVersion() === 'v1') return secours;
  return CURIEUX_SECTIONS_V2.map(sec => Object.assign({
    titre: sec.libelle,
    liens: (sec.entrees || []).map(e => [e.libelle, e.href]),
  }, sec.sticker || {}));
}

// --- Pied de page partagé -------------------------------------------------
// Mentions légales sur toutes les pages, sans le recopier dix-neuf fois.
function injectCurieuxFooter(){
  if(!document.body){
    document.addEventListener('DOMContentLoaded', injectCurieuxFooter);
    return;
  }
  if(document.querySelector('.co-footer')) return;
  const f = document.createElement('footer');
  f.className = 'co-footer';
  // Deux blocs plutôt qu'une phrase : le nom tient la gauche, la mention légale
  // se détache à droite. Le point médian qui les séparait n'avait plus lieu
  // d'être une fois les deux écartés.
  f.innerHTML = '<span class="co-footer-nom">Curieux orchestre</span>'
    + '<a href="mentions-legales.html">Mentions légales et données personnelles</a>';
  document.body.appendChild(f);
}

document.addEventListener('DOMContentLoaded', ()=>{
  try{ initCurieuxTopbar(); }catch(e){}
  try{ injectCurieuxFooter(); }catch(e){}
});
