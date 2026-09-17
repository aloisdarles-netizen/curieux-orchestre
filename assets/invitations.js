/* ============================================================================
   Les invitations — le vocabulaire, et lui seul
   ============================================================================
   Deux axes, qu'il ne faut jamais confondre :

     LE TYPE  — pour QUI est l'invitation. Partenaire, presse, famille, perso.
                Il ne consomme rien : il sert à savoir, en fin de tournée, où
                sont parties les places.

     LA PLACE — OÙ la personne s'assoit. Carré Or, CAT 1, CAT 2. C'est LUI qui
                porte le quota, parce que c'est lui que la salle nous alloue.

   Un troisième objet vit à côté, l'AFTERSHOW. Il n'est pas un attribut de
   l'invitation mais une seconde chose qu'on accorde : on peut être à
   l'aftershow sans assister au concert (un partenaire qui a son billet, une
   équipe qui arrive après). C'est un OUI/NON — on y est ou on n'y est pas —
   et il ne se plafonne pas : le traiteur et la sécurité ont besoin du nombre
   de noms, la salle n'impose pas de jauge.

   POURQUOI CE FICHIER EXISTE

   Le suivi vivait dans un tableur, une feuille par tournée. Les colonnes qui
   font tout l'intérêt du suivi — « TYPE INVITATIONS », « Qui invite ? » —
   étaient remplies une fois sur quatre : 12 et 13 lignes sur 49. Ce n'est pas
   de la négligence, c'est le sort de toute colonne facultative dans un
   tableur — on ajoute vite un nom, on ne revient jamais qualifier.

   Ici, ce ne sont pas des colonnes à remplir après coup : ce sont les champs
   du formulaire, et ils sont obligatoires. On ne peut pas demander une place
   sans dire pour qui elle est ni qui l'accorde — le demandeur est d'ailleurs
   pré-rempli par le compte connecté, et choisi dans une liste fermée.
============================================================================ */

/* Les types, dans l'ordre où ils apparaissent à l'écran. Repris tels quels du
   tableur de la saison passée, « GAGNANT-E LCS2 » en moins — cette opération
   n'a plus cours.

   Les couleurs suivent celles du tableur, à une exception près : « Pro » et
   « Créateur de contenu » y étaient tous deux gris, et deux gris identiques
   sur une pastille de huit pixels ne se distinguent pas. Le créateur de
   contenu prend donc le sable de la charte, libre par ailleurs. */
const INVITATION_TYPES = [
  { cle:'partenaire-lcs',    libelle:'Partenaire LCS',      fond:'#e2ece4', encre:'#2f6b46' },
  { cle:'partenaire-tournee',libelle:'Partenaire tournée',  fond:'#f3ddd0', encre:'#96542c' },
  { cle:'partenaire',        libelle:'Partenaire',          fond:'#CEE1F4', encre:'#1f4a75' },
  { cle:'pro',               libelle:'Pro',                 fond:'#eceaec', encre:'#55505a' },
  { cle:'createur-contenu',  libelle:'Créateur de contenu', fond:'#f7ecc9', encre:'#7a6222' },
  { cle:'famille',           libelle:'Famille',             fond:'#dde8f5', encre:'#33587e' },
  { cle:'perso',             libelle:'Perso',               fond:'#e3e0f5', encre:'#4c3f86' },
];
const INVITATION_TYPE = Object.fromEntries(INVITATION_TYPES.map(t=> [t.cle, t]));

/* QUI INVITE. Une liste fermée, et non un champ libre : ce sont les cinq
   personnes de la production qui accordent des invitations. Un champ libre
   donnait « Alois », « aloïs », « AD », « prod » pour une seule et même
   personne — et le bilan de fin de tournée ne savait plus qui avait invité
   qui, ce qui est précisément la question qu'on lui pose.

   Une valeur arrivée d'ailleurs (un import, une ligne d'avant cette liste)
   n'est jamais effacée : elle s'ajoute au menu, marquée hors liste, jusqu'à ce
   qu'on la corrige. */
const DEMANDEURS = ['Aloïs', 'Julie', 'Daniel', 'Gwen', 'Jeanne'];

// Le demandeur d'un compte connecté, par son prénom — accents et casse mis de
// côté, « alois.darles@… » retrouve « Aloïs ». Rien si le compte n'est pas de
// la liste : on préfère un champ vide à un nom faux.
function demandeurDuCompte(email){
  const local = String(email || '').split('@')[0] || '';
  const prenom = local.split(/[._-]+/)[0] || '';
  const nu = (s)=> String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return DEMANDEURS.find(d=> nu(d) === nu(prenom)) || '';
}

/* Les catégories de place par DÉFAUT. Elles ne sont pas figées : chaque projet
   porte sa propre liste (tournee.categoriesPlaces), parce qu'une salle parle
   de Carré Or et la suivante d'Orchestre et de Balcon. Le tableur de la saison
   passée employait déjà les trois ci-dessous — Carré Or et CAT 1 sur les
   Zénith, CAT 2 en plus à la Seine Musicale. */
const PLACES_DEFAUT = [
  { cle:'carre-or', libelle:'Carré Or' },
  { cle:'cat-1',    libelle:'CAT 1' },
  { cle:'cat-2',    libelle:'CAT 2' },
];

/* PAS D'ÉTAT SUR UNE INVITATION. Il y en a eu un — accordée / transmise /
   annulée —, repris de la zone grisée du tableur. Il a été retiré : il n'y a
   pas d'étape d'approbation (on saisit, c'est accordé), une invitation retirée
   se supprime, et « transmise » demandait un geste de plus à chaque export
   pour une information que personne ne relisait.

   La colonne `etat` reste en base avec son défaut 'accordee' : la retirer
   coûterait une migration destructive pour ne rien changer à ce qu'on lit.
   Rien dans l'application ne l'écrit ni ne la lit plus. */

/* Le contingent habituel D'UNE TOURNÉE — pas des Soudaines. Il n'y a pas de
   valeur usuelle : le producteur d'une tournée nous donne dix Carré Or, celui
   de la suivante quatre CAT 1 et rien d'autre. Un chiffre pré-rempli
   « par défaut » se serait donc appliqué faux neuf fois sur dix, et un
   contingent faux fait refuser ou promettre des places à tort.

   Chaque projet porte donc le sien (tournee.contingentUsuel), saisi une fois
   dans son panneau Invitations, et posé d'un clic sur ses dates. */
function contingentUsuel(tournee){
  const c = tournee && tournee.contingentUsuel;
  return c && typeof c === 'object' ? c : {};
}

/* Les catégories de place d'un projet, sa liste propre ou celle par défaut.
   Une liste vide n'est pas un choix : c'est un projet qu'on n'a pas encore
   réglé, et il vaut mieux lui donner les trois usuelles que zéro. */
function placesDuProjet(tournee){
  const l = tournee && Array.isArray(tournee.categoriesPlaces) ? tournee.categoriesPlaces : [];
  const propres = l.filter(c=> c && c.cle && c.libelle);
  return propres.length ? propres : PLACES_DEFAUT.slice();
}
function libellePlace(tournee, cle){
  const c = placesDuProjet(tournee).find(x=> x.cle === cle);
  return c ? c.libelle : (cle || '');
}

/* Le quota d'une date pour une catégorie. Rend null quand rien n'est saisi —
   ce qui veut dire QU'IL N'Y EN A PAS sur cette date : toutes les salles n'ont
   pas de CAT 2, et laisser croire à un réglage oublié faisait chercher une
   information qui n'existe pas. Une catégorie sans contingent n'est donc pas
   proposée à la saisie ; elle le redevient dès qu'on lui pose un nombre. */
function quotaDate(date, clePlace){
  if(!date || !date.quotas) return null;
  const v = date.quotas[clePlace];
  if(v == null || v === '' || !Number.isFinite(Number(v))) return null;
  return Number(v);
}

// Un nombre de places : jamais NaN, jamais négatif.
function nombreInvit(v){
  const n = Number(String(v == null ? '' : v).trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/* L'AFTERSHOW EST UN OUI/NON, pas un nombre. On y est ou on n'y est pas : la
   liste que lisent la sécurité et le traiteur est une liste de NOMS, et un nom
   passe une fois. Quelqu'un qui vient accompagné prend sa propre ligne, où il
   a un nom — ce qu'un « 2 » dans une case ne donne pas au vigile.

   La colonne reste un entier en base (0 ou 1) : la changer en booléen aurait
   coûté une migration pour ne rien changer à ce qu'on lit. */
function aAftershow(i){
  return nombreInvit(i && i.aftershow) > 0;
}

/* Ce qui est consommé sur une date, par catégorie de place, et le nombre de
   personnes à l'aftershow. Les lignes annulées ne comptent pas — c'est tout
   leur objet.

   Rend { places: { <cle>: n }, aftershow: n, lignes: n }.
*/
function consommeSurDate(invitations, dateId){
  const pour = (invitations || []).filter(i=> i && i.dateId === dateId);
  const places = {};
  let aftershow = 0;
  pour.forEach(i=>{
    const n = nombreInvit(i.places);
    if(n && i.categorie) places[i.categorie] = (places[i.categorie] || 0) + n;
    if(aAftershow(i)) aftershow++;
  });
  return { places, aftershow, lignes: pour.length };
}

/* Ce qu'il reste à donner dans une catégorie, sur une date.
   ---------------------------------------------------------------------------
   Rend un nombre, ou null quand la catégorie n'a pas de contingent sur cette
   date — c'est-à-dire qu'elle n'y existe pas. Dans les deux cas on ne peut
   rien y accorder ; la différence est qu'un zéro se lit « tout est donné » et
   un null « il n'y en a pas ici ».

   `saufInv` exclut une invitation du calcul : quand on MODIFIE une ligne, ses
   propres places ne doivent pas se compter contre elle — sans quoi passer une
   ligne de 4 à 5 sur un contingent de 10 déjà rempli à 10 serait refusé alors
   qu'il reste de la place.
*/
function restantPlaces(date, invitations, clePlace, saufInv){
  const q = quotaDate(date, clePlace);
  if(q == null) return null;   // pas de contingent : rien à donner ici
  const dateId = date && date.id;
  const pris = (invitations || [])
    .filter(i=> i && i.dateId === dateId
             && i.categorie === clePlace && (!saufInv || i.id !== saufInv.id))
    .reduce((s, i)=> s + nombreInvit(i.places), 0);
  return q - pris;
}

/* Une ligne qui n'accorde rien ne veut rien dire. C'est la seule règle de
   validité : ni place, ni aftershow, il n'y a pas d'invitation. */
function invitationVide(i){
  return nombreInvit(i && i.places) === 0 && !aAftershow(i);
}

// Le nom affiché d'un·e invité·e. « NOM Prénom », comme dans le tableur, parce
// que c'est l'ordre dans lequel une liste d'entrée se lit et se cherche.
function nomInvite(i){
  const nom = String((i && i.nom) || '').trim();
  const prenom = String((i && i.prenom) || '').trim();
  return [nom.toUpperCase(), prenom].filter(Boolean).join(' ') || '(sans nom)';
}

if(typeof window !== 'undefined'){
  window.INVITATION_TYPES = INVITATION_TYPES;
  window.INVITATION_TYPE = INVITATION_TYPE;
  window.PLACES_DEFAUT = PLACES_DEFAUT;
  window.DEMANDEURS = DEMANDEURS;
  window.demandeurDuCompte = demandeurDuCompte;
  window.contingentUsuel = contingentUsuel;
  window.placesDuProjet = placesDuProjet;
  window.libellePlace = libellePlace;
  window.quotaDate = quotaDate;
  window.nombreInvit = nombreInvit;
  window.aAftershow = aAftershow;
  window.restantPlaces = restantPlaces;
  window.consommeSurDate = consommeSurDate;
  window.invitationVide = invitationVide;
  window.nomInvite = nomInvite;
}
