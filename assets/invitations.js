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
   équipe qui arrive après). Il se compte, il ne se plafonne pas — le traiteur
   et la sécurité ont besoin du chiffre, la salle n'impose pas de jauge.

   POURQUOI CE FICHIER EXISTE

   Le suivi vivait dans un tableur, une feuille par tournée. Les colonnes qui
   font tout l'intérêt du suivi — « TYPE INVITATIONS », « Qui invite ? » —
   étaient remplies une fois sur quatre : 12 et 13 lignes sur 49. Ce n'est pas
   de la négligence, c'est le sort de toute colonne facultative dans un
   tableur — on ajoute vite un nom, on ne revient jamais qualifier.

   Ici, ce ne sont pas des colonnes à remplir après coup : ce sont les champs
   du formulaire. On ne peut pas demander une place sans dire pour qui elle
   est, et le demandeur s'inscrit tout seul — c'est le compte connecté.
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

/* Les états d'une invitation.

   Il n'y a pas d'étape d'approbation : on saisit, c'est accordé. Les passes de
   vérification se font en relisant et en corrigeant, pas en validant une file
   d'attente — c'est pourquoi chaque ligne reste modifiable.

   « Transmise » est la zone grisée du tableur : la ligne est partie à la
   salle. Sans cet état, on ne sait plus ce qui reste à envoyer, et on envoie
   deux fois. */
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

const INVITATION_ETATS = [
  { cle:'accordee',  libelle:'Accordée',  court:'Accordée',  pill:'ok'  },
  { cle:'transmise', libelle:'Transmise à la salle', court:'Transmise', pill:'' },
  { cle:'annulee',   libelle:'Annulée',   court:'Annulée',   pill:'ko'  },
];
const INVITATION_ETAT = Object.fromEntries(INVITATION_ETATS.map(e=> [e.cle, e]));

// Toute valeur inconnue retombe sur « accordée » : c'est l'état de création, et
// une ligne mal typée ne doit pas disparaître du décompte.
function etatInvitation(i){
  const v = i && typeof i === 'object' ? i.etat : i;
  return INVITATION_ETAT[v] ? v : 'accordee';
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

/* Le quota d'une date pour une catégorie. Rend null quand rien n'est fixé —
   et null n'est PAS zéro : la salle confirme souvent son contingent tard, et
   un champ vide lu comme « aucune place » ferait refuser des demandes à tort.
   Même règle que le cachet d'une date. */
function quotaDate(date, clePlace){
  if(!date || !date.quotas) return null;
  const v = date.quotas[clePlace];
  if(v == null || v === '' || !Number.isFinite(Number(v))) return null;
  return Number(v);
}

// Un nombre de places ou d'aftershow : jamais NaN, jamais négatif.
function nombreInvit(v){
  const n = Number(String(v == null ? '' : v).trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/* Ce qui est consommé sur une date, par catégorie de place, et le total
   d'aftershow. Les lignes annulées ne comptent pas — c'est tout leur objet.

   Rend { places: { <cle>: n }, aftershow: n, lignes: n }.
*/
function consommeSurDate(invitations, dateId){
  const pour = (invitations || []).filter(i=> i && i.dateId === dateId && etatInvitation(i) !== 'annulee');
  const places = {};
  let aftershow = 0;
  pour.forEach(i=>{
    const n = nombreInvit(i.places);
    if(n && i.categorie) places[i.categorie] = (places[i.categorie] || 0) + n;
    aftershow += nombreInvit(i.aftershow);
  });
  return { places, aftershow, lignes: pour.length };
}

/* Une ligne qui n'accorde rien ne veut rien dire. C'est la seule règle de
   validité : ni place, ni aftershow, il n'y a pas d'invitation. */
function invitationVide(i){
  return nombreInvit(i && i.places) === 0 && nombreInvit(i && i.aftershow) === 0;
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
  window.contingentUsuel = contingentUsuel;
  window.INVITATION_ETATS = INVITATION_ETATS;
  window.INVITATION_ETAT = INVITATION_ETAT;
  window.etatInvitation = etatInvitation;
  window.placesDuProjet = placesDuProjet;
  window.libellePlace = libellePlace;
  window.quotaDate = quotaDate;
  window.nombreInvit = nombreInvit;
  window.consommeSurDate = consommeSurDate;
  window.invitationVide = invitationVide;
  window.nomInvite = nomInvite;
}
