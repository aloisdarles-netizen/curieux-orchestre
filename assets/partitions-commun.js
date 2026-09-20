/* ============================================================================
 * partitions-commun.js — reconnaître une partie dans un nom de fichier.
 *
 * Le dépôt est le moment coûteux. On sort trente PDF de Dorico, nommés comme
 * Dorico les nomme — « 410 Piano_merged.pdf », « Violon 1.pdf », « EXP33 - Cor
 * 3-4 - v2.pdf » — et il faut dire de quelle partie chacun relève. Fait à la
 * main, c'est quarante minutes et deux erreurs ; deviné correctement, c'est
 * deux minutes de relecture.
 *
 * CE FICHIER N'APPLIQUE JAMAIS SEUL L'INSTRUMENT D'UNE PERSONNE À UNE PARTIE.
 * musiciens.instrument est du texte libre : 25 valeurs distinctes sur 114
 * fiches, avec « Flutes » et « Flûtes », « Alto » et « Altos », « Contrebasse »
 * et « Contrebasses », et un « Violoncelles » à espace final. Il sait le LIRE
 * (partitionsInstrumentDe) et en tirer une PROPOSITION graduée
 * (partitionsProposerAffectations, en bas de ce fichier) ; la décision reste
 * à qui relit la liste et la coche — une partie donnée à la mauvaise personne
 * se découvre à la première répétition, et ce n'est pas un risque qu'on prend
 * en silence.
 *
 * Ce qu'on devine sans relecture, c'est seulement le lien FICHIER → PARTIE,
 * où les deux côtés sont saisis par la même personne dans le même vocabulaire.
 * ========================================================================== */

/* L'ordre du conducteur. Une liste de parties triée par ordre alphabétique se
   lit comme un annuaire ; triée ainsi, elle se lit comme une partition — et un
   trou saute aux yeux, ce qui est tout l'intérêt au moment du dépôt. */
/* L'ANGLAIS EST LÀ PARCE QUE DORICO EXPORTE EN ANGLAIS. Un jeu sorti tel quel
   donne « 120 Oboe », « 510 Violin1 », « 560 DoubleBass » : aucun de ces noms
   n'a de mot français dedans, et la liste entière retombait donc en fin
   d'ordre, à plat. Les deux langues cohabitent dans la même case de la liste —
   c'est le même instrument, il a une seule place dans le conducteur. */
const PARTITIONS_ORDRE_CONDUCTEUR = [
  'piccolo', 'ottavino', 'flute', 'flauto', 'hautbois', 'oboe', 'cor anglais',
  'english horn', 'corno inglese', 'clarinette', 'clarinet', 'clarinetto',
  'clarinette basse', 'bass clarinet', 'basson', 'bassoon', 'fagotto',
  'contrebasson', 'contrabassoon', 'saxophone', 'saxofono',
  'cor', 'corno', 'corni', 'horn', 'french horn', 'trompette', 'trumpet',
  'tromba', 'trombe', 'cornet', 'saxhorn', 'trombone', 'tromboni', 'posaune',
  'trombone basse', 'bass trombone', 'tuba', 'euphonium',
  'timbales', 'timpani', 'percussion', 'percussioni', 'batterie', 'drums',
  'drum kit', 'caisse claire', 'snare', 'vibraphone', 'marimba', 'xylophone',
  'glockenspiel',
  'harpe', 'harp', 'arpa', 'piano', 'celesta', 'clavier', 'keyboard', 'synth',
  'orgue', 'organ', 'clavecin', 'harpsichord', 'accordeon', 'accordion',
  'guitare', 'guitar', 'basse',
  'voix', 'voice', 'choeur', 'chorale', 'chorus', 'choir',
  'soprano', 'mezzo', 'alto voix', 'contralto', 'tenor', 'baryton', 'baritone',
  'basse voix',
  'violon', 'violin', 'violino', 'violini', 'violon 1', 'violin 1',
  'violon 2', 'violin 2', 'alto', 'viola', 'viole', 'violoncelle',
  'violoncello', 'violoncelli', 'cello',
  'contrebasse', 'contrabass', 'double bass', 'doublebass', 'kontrabass',
  'conducteur', 'conductor', 'score', 'full score',
];

/* Les pupitres que la maison emploie (musiciens.pupitre est propre,
   contrairement à instrument), plus le chœur. Ce n'est plus l'ORDRE des règles
   qui départage les cas ambigus mais la LONGUEUR du motif — voir
   partitionsPupitreDe : « clarinette » (10) l'emporte sur « basse » (5) sans
   qu'on ait à ranger les bois au-dessus des cordes.

   L'ANGLAIS, ICI AUSSI, ET POUR LA MÊME RAISON. Sur un jeu sorti de Dorico
   — « Oboe », « Clarinet », « Bassoon », « Horn », « Violin1 », « Viola »,
   « DoubleBass » —, onze parties sur seize tombaient dans « Autre » : la liste
   ne connaissait que des noms français. Le pupitre se lit alors à la main,
   partie par partie, au moment précis où l'on vient de gagner du temps sur le
   dépôt.

   CE QU'ON N'AJOUTE PAS, et c'est délibéré : le mot « bass » seul. Il désigne
   la contrebasse, mais aussi la clarinette basse (un bois) et le trombone
   basse (un cuivre) ; un motif si court renverrait donc aux cordes deux
   instruments qui n'en sont pas. On nomme les formes complètes — « double
   bass », « contrabass » — et on laisse « bass clarinet » et « bass trombone »
   tomber sur leur instrument, qui est écrit juste à côté. */
const PARTITIONS_PUPITRES = [
  /* LE CHŒUR PASSE D'ABORD, ET IL L'EMPORTE MÊME S'IL EST PLUS LONG AILLEURS
     (voir partitionsPupitreDe) : « chœur » ne nomme pas un instrument, il nomme
     une SECTION. « Chœur Soprano » est un pupitre de vingt personnes, pas une
     soliste, et c'est le premier mot qui le dit. Il est distinct de « Chant »,
     qui désigne les solistes — et la distinction n'est pas cosmétique : un lot
     de chœur ne porte que les parties de chœur.
     Les motifs se comparent en DÉBUT DE MOT : on n'y met donc que ce qui ne
     peut pas commencer autre chose. « coro » en est exclu pour cette raison —
     il attraperait « Coronation Anthem ». */
  { pupitre: 'Chœur',       motifs: ['choeur', 'chœur', 'chorale', 'chorus', 'choir', 'satb', 'ssaa', 'ttbb'] },
  /* L'ITALIEN À CÔTÉ DE L'ANGLAIS, pour la même raison : un matériel gravé en
     Italie arrive en « Corno », « Fagotto », « Violini ». C'est plus rare qu'un
     export Dorico en anglais, et ça ne coûte qu'une ligne de liste. */
  { pupitre: 'Bois',        motifs: ['piccolo', 'ottavino', 'flute', 'flûte', 'flauto', 'hautbois', 'oboe',
                                     'cor anglais', 'english horn', 'corno inglese',
                                     'clarinette', 'clarinet', 'clarinetto',
                                     'basson', 'bassoon', 'fagotto', 'fagott',
                                     'contrebasson', 'contrabassoon', 'controfagotto',
                                     'saxophone', 'saxofono'] },
  { pupitre: 'Cuivres',     motifs: ['cor', 'corno', 'corni', 'horn', 'french horn', 'trompette', 'trumpet',
                                     'tromba', 'trombe', 'cornet', 'saxhorn', 'trombone', 'tromboni',
                                     'posaune', 'tuba', 'bugle', 'euphonium', 'flugelhorn'] },
  { pupitre: 'Percussions', motifs: ['percussion', 'percussioni', 'timbale', 'timpani', 'batterie', 'drum',
                                     'vibraphone', 'marimba', 'xylophone', 'glockenspiel', 'cymbale',
                                     'cymbal', 'caisse claire', 'snare', 'tam-tam', 'triangle'] },
  { pupitre: 'Chant',       motifs: ['voix', 'voice', 'chant', 'soprano', 'mezzo', 'tenor', 'ténor',
                                     'baryton', 'baritone', 'contralto'] },
  { pupitre: 'Cordes',      motifs: ['violon', 'violin', 'violino', 'violini', 'alto', 'viola', 'viole',
                                     'violoncelle', 'violoncello', 'violoncelli', 'cello',
                                     'contrebasse', 'contrabass', 'double bass', 'doublebass', 'kontrabass',
                                     'harpe', 'harp', 'arpa'] },
  { pupitre: 'Autre',       motifs: ['piano', 'clavier', 'keyboard', 'celesta', 'orgue', 'organ',
                                     'clavecin', 'harpsichord', 'synth', 'accordeon', 'accordéon',
                                     'accordion', 'guitare', 'guitar', 'basse', 'conducteur', 'conductor',
                                     'score', 'partition'] },
];

function partitionsNormaliser(texte) {
  return String(texte || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Nettoyer un nom de fichier pour en tirer un nom de partie lisible.
   « 410 Piano_merged.pdf » → « Piano ». Les conventions rencontrées :
   un numéro d'œuvre en tête, un suffixe d'export (_merged, _full, -final),
   un numéro de version, une date. On les retire ; ce qui reste est la partie. */
function partitionsNomDepuisFichier(nomFichier) {
  let s = String(nomFichier || '').replace(/\.pdf$/i, '');
  s = s.replace(/[_\-\s]*(merged|full|score|export|final|def|ok|v\d+|rev\d*)\b/gi, ' ');
  s = s.replace(/\b(19|20)\d{2}[-_ ]?\d{2}[-_ ]?\d{2}\b/g, ' ');   // une date
  s = s.replace(/^\s*\d{1,4}\s*[-_.)]?\s*/, '');                    // un numéro d'œuvre en tête
  s = s.replace(/[_]+/g, ' ');
  // On n'aère PAS les tirets : « Cor 1-2 » désigne un pupitre double et doit le
  // rester. Aérer donnait « Cor 1 - 2 », que plus personne ne reconnaît.
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^[-\s]+|[-\s]+$/g, '');
  return s || String(nomFichier || '').replace(/\.pdf$/i, '');
}

/* Le mot commence-t-il ici, et finit-il proprement ? « violon » est dans
   « violon 1 » (le mot s'arrête) mais pas dans « violoncelle » (il continue).
   Sans cette distinction, un fichier « Violon.pdf » s'appariait au violoncelle
   — l'erreur d'appariement la plus coûteuse, parce qu'elle est invisible
   jusqu'à la première répétition. */
function _motEntier(aiguille, meule) {
  let i = meule.indexOf(aiguille);
  while (i >= 0) {
    const avant = i === 0 || meule[i - 1] === ' ';
    const apres = i + aiguille.length === meule.length || meule[i + aiguille.length] === ' ';
    if (avant && apres) return true;
    i = meule.indexOf(aiguille, i + 1);
  }
  return false;
}

/* Le motif commence-t-il un mot du nom ? « cor » ne doit pas attraper
   « accordeon », et « alto » pas « altoparlante ». On n'exige PAS qu'il
   finisse un mot : « Violons », « Flûtes », « Cors 1-2 » sont les formes
   courantes, et un motif au pluriel par instrument serait une liste à
   maintenir deux fois. */
function _motifCommence(motif, nom) {
  const m = partitionsNormaliser(motif);
  if (!m) return false;
  return new RegExp('(^|\\s)' + m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(nom);
}

/* Le pupitre d'une partie, déduit de son nom.

   LE PLUS LONG MOTIF GAGNE, et non la première règle qui répond. C'est la
   correction d'un défaut qui ne se voyait qu'au dépôt de répertoire choral :
   « cor » commence « Coronation Anthem », donc « Coronation Anthem - Violin 1 »
   partait aux cuivres. Comparer les longueurs tranche sans liste d'exceptions —
   « violin » (6) l'emporte sur « cor » (3) —, et fait tomber du même coup les
   priorités qu'il fallait jusqu'ici obtenir par l'ORDRE des règles :
   « English horn » va aux bois parce que « english horn » (12) bat « horn »
   (4), « Clarinette basse » aux bois parce que « clarinette » (10) bat
   « basse » (5). À longueur égale, la première règle l'emporte.

   LE CHŒUR EST HORS CONCOURS. « Chœur Soprano » doit aller au chœur, alors que
   « soprano » (7) bat « chœur » (5) : c'est qu'un nom de SECTION n'est pas un
   nom d'instrument, et qu'il qualifie ce qui suit au lieu de rivaliser avec
   lui. C'est la seule exception, et elle se justifie seule.

   ON NE RECLASSE JAMAIS L'EXISTANT : cette fonction ne tourne qu'à la création
   d'une partie. Les pupitres déjà corrigés à la main le restent. */
function partitionsPupitreDe(nom) {
  const n = partitionsNormaliser(nom);
  if (!n) return '';
  let gagnant = '';
  let longueur = -1;
  for (const regle of PARTITIONS_PUPITRES) {
    for (const motif of regle.motifs) {
      const m = partitionsNormaliser(motif);
      if (m.length <= longueur) continue;            // déjà battu, inutile d'essayer
      if (!_motifCommence(motif, n)) continue;
      if (regle.pupitre === 'Chœur') return 'Chœur';  // hors concours, voir ci-dessus
      gagnant = regle.pupitre;
      longueur = m.length;
    }
  }
  return gagnant || 'Autre';
}

/* La place d'une partie dans l'ordre du conducteur. Les parties inconnues
   passent à la fin plutôt qu'au début : une partie qu'on n'a pas su classer se
   relit mieux en bas de liste qu'intercalée au milieu des bois. */
function partitionsOrdreDe(nom) {
  /* Le chiffre collé au nom est décollé ICI, et seulement ici. Dorico sort
     « Violin1 », « Violoncello2 », « Synth1 » — sans espace. La recherche se
     fait sur des MOTS ENTIERS (voir _motEntier, et la raison qui l'impose :
     « violon » ne doit pas attraper « violoncelle »), si bien que « violin1 »
     n'était aucun des instruments connus et que toute la corde repartait en
     fin de liste, à plat. On ne touche pas à partitionsNormaliser pour autant :
     elle sert aussi à dire si deux parties portent le même nom, et ce n'est pas
     la même question. */
  const n = partitionsNormaliser(nom).replace(/([a-z])(\d)/g, '$1 $2');
  if (!n) return 9000;
  // On cherche l'instrument N'IMPORTE OÙ dans le nom, pas seulement en tête :
  // beaucoup de fichiers sortent préfixés du nom du spectacle
  // (« EXP33 - Cor 3-4 »), et les classer tous à la fin ferait perdre l'ordre
  // du conducteur au moment précis où il sert.
  let meilleur = -1, rang = 9000;
  PARTITIONS_ORDRE_CONDUCTEUR.forEach((cle, i) => {
    const c = partitionsNormaliser(cle);
    if (_motEntier(c, n) && c.length > meilleur) { meilleur = c.length; rang = i * 10; }
  });
  if (rang === 9000) return 9000;
  // Le numéro dans la famille : « Cor 3 » après « Cor 1 ».
  const num = n.match(/(\d+)/);
  return rang + (num ? Math.min(9, Number(num[1])) : 0);
}

/* Apparier un fichier à une partie existante. Trois passes, de la plus sûre à
   la plus lâche, et on dit TOUJOURS laquelle a répondu : une correspondance
   exacte et une correspondance approximative ne se relisent pas avec la même
   attention, et la page doit pouvoir faire remonter les secondes. */
function partitionsApparier(nomFichier, parties) {
  const propose = partitionsNomDepuisFichier(nomFichier);
  const n = partitionsNormaliser(propose);
  const liste = parties || [];
  if (!n) return { partie: null, propose, sûrete: 'aucune' };

  let trouve = liste.find(p => partitionsNormaliser(p.nom) === n);
  if (trouve) return { partie: trouve, propose, sûrete: 'exacte' };

  // Le nom du fichier contient celui de la partie, ou l'inverse : « EXP33 -
  // Violon 1 » pour une partie « Violon 1 », ou « Cor » pour « Cor 1-2 ».
  // L'inclusion doit tomber sur des MOTS ENTIERS — voir _motEntier.
  const candidats = liste.filter(p => {
    const q = partitionsNormaliser(p.nom);
    return q && (_motEntier(q, n) || _motEntier(n, q));
  });
  if (candidats.length === 1) return { partie: candidats[0], propose, sûrete: 'probable' };
  if (candidats.length > 1) {
    /* Plusieurs prétendants : on ne tranche PAS. « Violon » entre « Violon 1 »
       et « Violon 2 » n'a pas de bonne réponse, et en inventer une donne une
       partie fausse qui ne se découvrira qu'à la première répétition. La page
       reçoit la liste et pose la question — c'est une seconde de lecture contre
       un pupitre qui n'a pas sa musique. */
    candidats.sort((a, b) => partitionsNormaliser(a.nom).length - partitionsNormaliser(b.nom).length);
    return { partie: null, propose, sûrete: 'incertaine', candidats };
  }
  return { partie: null, propose, sûrete: 'aucune' };
}

/* Le poids, tel qu'on le lit dans une page de production : jamais plus de trois
   chiffres significatifs, et jamais d'octets bruts au-delà du kilo. */
function partitionsPoids(octets) {
  const o = Number(octets) || 0;
  if (o < 1024) return o + ' o';
  if (o < 1024 * 1024) return (o / 1024).toFixed(0).replace('.', ',') + ' Ko';
  const mo = o / (1024 * 1024);
  if (mo < 10) return mo.toFixed(1).replace('.', ',') + ' Mo';
  if (mo < 1024) return mo.toFixed(0) + ' Mo';
  return (mo / 1024).toFixed(2).replace('.', ',') + ' Go';
}

/* Le code d'une opération. Six caractères, sans les paires qu'on confond en le
   lisant à voix haute au pupitre ou en le recopiant d'un message : pas de O ni
   de 0, pas de I ni de 1, pas de S ni de 5. Ce n'est pas un mot de passe — il
   est vérifié côté base, il vit le temps d'une opération, et il doit surtout ne
   jamais être mal retapé. */
function partitionsNouveauCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRTUVWXYZ2346789';
  const octets = new Uint8Array(6);
  crypto.getRandomValues(octets);
  return Array.from(octets, b => alphabet[b % alphabet.length]).join('');
}

/* ============================================================================
 * LE VOCABULAIRE VISUEL, partagé par l'écran de production et par l'espace du
 * musicien.
 *
 * Les deux écrans montraient la même chose de deux façons différentes : des
 * lignes de texte, sans repère, où l'on relisait chaque intitulé pour savoir
 * de quel pupitre relevait une partie. Une teinte par pupitre suffit à rendre
 * la liste lisible d'un coup d'œil, à condition que ce soit LA MÊME teinte des
 * deux côtés — le musicien qui a appris que sa partie est bleue doit la
 * retrouver bleue quand la production lui en parle.
 *
 * Les teintes elles-mêmes sont dans base.css (--pup-*). Ici, seulement ce qui
 * décide QUEL pupitre, et dans quel ordre.
 * ========================================================================== */

/* L'ordre du conducteur, appliqué aux pupitres. C'est celui de la partition,
   pas l'alphabet : les bois en haut, les cordes en bas, le chef à part. */
const PARTITIONS_PUPITRE_ORDRE = [
  "Chef d'orchestre", 'Bois', 'Cuivres', 'Percussions', 'Chœur', 'Chant', 'Cordes', 'Autre',
];

/* Ramener une valeur de pupitre à l'une des sept. partitions_parties.pupitre
   est rempli par partitionsPupitreDe() et vaut donc toujours l'une d'elles ;
   mais une partie créée à la main avant cette règle, ou reprise d'un import,
   peut porter autre chose. Tout ce qui n'est pas reconnu tombe dans « Autre »
   plutôt que de créer un pupitre fantôme d'une seule partie. */
function partitionsPupitreNormalise(valeur) {
  const v = String(valeur || '').trim();
  if (PARTITIONS_PUPITRE_ORDRE.includes(v)) return v;
  const n = partitionsNormaliser(v);
  const trouve = PARTITIONS_PUPITRE_ORDRE.find(p => partitionsNormaliser(p) === n);
  return trouve || 'Autre';
}

function partitionsRangPupitre(valeur) {
  const i = PARTITIONS_PUPITRE_ORDRE.indexOf(partitionsPupitreNormalise(valeur));
  return i < 0 ? 99 : i;
}

/* Grouper des parties par pupitre, dans l'ordre du conducteur, et sans jamais
   rendre un pupitre vide : une section « Chant » vide au milieu d'un programme
   symphonique est du bruit, pas une information. */
function partitionsGrouperParPupitre(parties) {
  const seaux = new Map();
  (parties || []).forEach(p => {
    const pup = partitionsPupitreNormalise(p.pupitre);
    if (!seaux.has(pup)) seaux.set(pup, []);
    seaux.get(pup).push(p);
  });
  return PARTITIONS_PUPITRE_ORDRE
    .filter(pup => seaux.has(pup))
    .map(pup => ({ pupitre: pup, parties: seaux.get(pup) }));
}

/* ----------------------------------------------------------------------------
   LE MÊME VOCABULAIRE, DANS LA LANGUE DU DESTINATAIRE.

   Le matériel part à l'étranger (voir partition-envoi.html) : le bibliothécaire
   de Leipzig ou de Bilbao lit une page dans sa langue, et sept pastilles
   « BOIS / CUIVRES / CORDES » au milieu. Il les devine — ou il appelle la
   production. Le pupitre CANONIQUE reste français : c'est lui qui est en base,
   qui trie, et qui porte la teinte (data-pup, voir base.css). Seul le MOT
   AFFICHÉ change.
   -------------------------------------------------------------------------- */
const PARTITIONS_PUPITRE_LANGUES = {
  "Chef d'orchestre": { en: 'Conductor',  de: 'Dirigent',    es: 'Dirección',     it: 'Direttore',    nl: 'Dirigent',     ja: '指揮者' },
  'Bois':             { en: 'Woodwind',   de: 'Holzbläser',  es: 'Viento madera', it: 'Legni',        nl: 'Houtblazers',  ja: '木管' },
  'Cuivres':          { en: 'Brass',      de: 'Blechbläser', es: 'Metales',       it: 'Ottoni',       nl: 'Koperblazers', ja: '金管' },
  'Percussions':      { en: 'Percussion', de: 'Schlagwerk',  es: 'Percusión',     it: 'Percussioni',  nl: 'Slagwerk',     ja: '打楽器' },
  'Chœur':            { en: 'Choir',      de: 'Chor',        es: 'Coro',          it: 'Coro',         nl: 'Koor',         ja: '合唱' },
  'Chant':            { en: 'Voices',     de: 'Gesang',      es: 'Canto',         it: 'Canto',        nl: 'Zang',         ja: '声楽' },
  'Cordes':           { en: 'Strings',    de: 'Streicher',   es: 'Cuerdas',       it: 'Archi',        nl: 'Strijkers',    ja: '弦楽器' },
  'Autre':            { en: 'Other',      de: 'Sonstige',    es: 'Otros',         it: 'Altri',        nl: 'Overig',       ja: 'その他' },
};

/* Le nom affichable d'un pupitre. Sans langue, ou dans une langue qu'on ne
   sert pas, c'est le français : tous les écrans de production l'appellent
   ainsi, et une traduction manquante ne doit jamais laisser une pastille
   vide. */
function partitionsPupitreNom(pupitre, langue) {
  const pup = partitionsPupitreNormalise(pupitre);
  const l = String(langue || '').slice(0, 2).toLowerCase();
  if (!l || l === 'fr') return pup;
  const entree = PARTITIONS_PUPITRE_LANGUES[pup];
  return (entree && entree[l]) || pup;
}

/* La pastille de pupitre. Le nom y est écrit en toutes lettres : la couleur
   accélère la lecture, elle ne la porte pas seule — un daltonien, une
   impression en noir et blanc et un écran mal réglé doivent donner la même
   page. */
function partitionsPupitreHtml(pupitre, options) {
  const pup = partitionsPupitreNormalise(pupitre);
  const o = options || {};
  const texte = o.texte != null ? o.texte : partitionsPupitreNom(pup, o.langue);
  return `<span class="co-pup" data-pup="${escapeAttr(pup)}"${o.titre ? ` title="${escapeAttr(o.titre)}"` : ''}>${escapeHtml(texte)}</span>`;
}

/* La variable CSS de la teinte d'un pupitre, pour border-left et aplats. */
function partitionsPupitreVar(pupitre, encre) {
  const cle = {
    "Chef d'orchestre": 'chef', 'Cordes': 'cordes', 'Bois': 'bois', 'Cuivres': 'cuivres',
    'Percussions': 'percussions', 'Chœur': 'choeur', 'Chant': 'chant', 'Autre': 'autre',
  }[partitionsPupitreNormalise(pupitre)] || 'autre';
  return `var(--pup-${cle}${encre ? '-ink' : ''})`;
}

/* ----------------------------------------------------------------------------
   LE NOM DES PARTIES, GLOSÉ DANS LA LANGUE DU DESTINATAIRE.

   Un jeu français annonce « Cor 1-2 », « Alto », « Basson ». Devant un
   bibliothécaire allemand, « Alto » est un piège : il lit une voix d'alto là
   où il y a un pupitre d'altos — et il distribue de travers.

   CE QUI NE CHANGE PAS : le nom de la partie, ni celui du fichier téléchargé.
   Une page qui afficherait « Horn 1-2 » pour un fichier « Cor 1-2.pdf » ferait
   chercher une partie qui ne manque pas. La traduction est une GLOSE, posée à
   côté du nom, et seulement quand elle apprend quelque chose.

   Les formes étrangères sont indexées elles aussi : beaucoup de jeux arrivent
   déjà en anglais ou en italien (« Violoncello », « Klavier »), et le
   destinataire n'a pas à deviner mieux que nous.
   -------------------------------------------------------------------------- */
const PARTITIONS_INSTRUMENTS = [
  // Bois
  { fr: 'Piccolo',           en: 'Piccolo',            de: 'Piccoloflöte',    es: 'Flautín',          it: 'Ottavino',            nl: 'Piccolo',         ja: 'ピッコロ' },
  { fr: 'Flûte',             en: 'Flute',              de: 'Flöte',           es: 'Flauta',           it: 'Flauto',              nl: 'Fluit',           ja: 'フルート' },
  { fr: 'Flûte alto',        en: 'Alto flute',         de: 'Altflöte',        es: 'Flauta alto',      it: 'Flauto contralto',    nl: 'Altfluit',        ja: 'アルトフルート' },
  { fr: 'Hautbois',          en: 'Oboe',               de: 'Oboe',            es: 'Oboe',             it: 'Oboe',                nl: 'Hobo',            ja: 'オーボエ' },
  { fr: 'Cor anglais',       en: 'English horn',       de: 'Englischhorn',    es: 'Corno inglés',     it: 'Corno inglese',       nl: 'Althobo',         ja: 'イングリッシュホルン' },
  { fr: 'Clarinette',        en: 'Clarinet',           de: 'Klarinette',      es: 'Clarinete',        it: 'Clarinetto',          nl: 'Klarinet',        ja: 'クラリネット' },
  { fr: 'Clarinette basse',  en: 'Bass clarinet',      de: 'Bassklarinette',  es: 'Clarinete bajo',   it: 'Clarinetto basso',    nl: 'Basklarinet',     ja: 'バスクラリネット' },
  { fr: 'Basson',            en: 'Bassoon',            de: 'Fagott',          es: 'Fagot',            it: 'Fagotto',             nl: 'Fagot',           ja: 'ファゴット' },
  { fr: 'Contrebasson',      en: 'Contrabassoon',      de: 'Kontrafagott',    es: 'Contrafagot',      it: 'Controfagotto',       nl: 'Contrafagot',     ja: 'コントラファゴット' },
  { fr: 'Saxophone',         en: 'Saxophone',          de: 'Saxophon',        es: 'Saxofón',          it: 'Sassofono',           nl: 'Saxofoon',        ja: 'サクソフォン' },
  { fr: 'Saxophone alto',    en: 'Alto saxophone',     de: 'Altsaxophon',     es: 'Saxofón alto',     it: 'Sassofono contralto', nl: 'Altsaxofoon',     ja: 'アルトサクソフォン' },
  { fr: 'Saxophone ténor',   en: 'Tenor saxophone',    de: 'Tenorsaxophon',   es: 'Saxofón tenor',    it: 'Sassofono tenore',    nl: 'Tenorsaxofoon',   ja: 'テナーサクソフォン' },
  { fr: 'Saxophone baryton', en: 'Baritone saxophone', de: 'Baritonsaxophon', es: 'Saxofón barítono', it: 'Sassofono baritono',  nl: 'Baritonsaxofoon', ja: 'バリトンサクソフォン' },

  // Cuivres
  { fr: 'Cor',               en: 'Horn',               de: 'Horn',            es: 'Trompa',           it: 'Corno',               nl: 'Hoorn',           ja: 'ホルン', alias: ['corni', 'french horn'] },
  { fr: 'Trompette',         en: 'Trumpet',            de: 'Trompete',        es: 'Trompeta',         it: 'Tromba',              nl: 'Trompet',         ja: 'トランペット', alias: ['trombe'] },
  { fr: 'Cornet',            en: 'Cornet',             de: 'Kornett',         es: 'Corneta',          it: 'Cornetta',            nl: 'Kornet',          ja: 'コルネット' },
  { fr: 'Bugle',             en: 'Flugelhorn',         de: 'Flügelhorn',      es: 'Fiscorno',         it: 'Flicorno',            nl: 'Bugel',           ja: 'フリューゲルホルン' },
  { fr: 'Saxhorn',           en: 'Saxhorn',            de: 'Saxhorn',         es: 'Saxhorn',          it: 'Flicorno basso',      nl: 'Saxhoorn',        ja: 'サクソルン' },
  { fr: 'Trombone',          en: 'Trombone',           de: 'Posaune',         es: 'Trombón',          it: 'Trombone',            nl: 'Trombone',        ja: 'トロンボーン', alias: ['tromboni'] },
  { fr: 'Trombone basse',    en: 'Bass trombone',      de: 'Bassposaune',     es: 'Trombón bajo',     it: 'Trombone basso',      nl: 'Bastrombone',     ja: 'バストロンボーン' },
  { fr: 'Tuba',              en: 'Tuba',               de: 'Tuba',            es: 'Tuba',             it: 'Tuba',                nl: 'Tuba',            ja: 'チューバ' },
  { fr: 'Euphonium',         en: 'Euphonium',          de: 'Euphonium',       es: 'Bombardino',       it: 'Eufonio',             nl: 'Eufonium',        ja: 'ユーフォニアム' },

  // Percussions
  { fr: 'Timbales',          en: 'Timpani',            de: 'Pauken',          es: 'Timbales',         it: 'Timpani',             nl: 'Pauken',          ja: 'ティンパニ', alias: ['timbale'] },
  { fr: 'Percussion',        en: 'Percussion',         de: 'Schlagwerk',      es: 'Percusión',        it: 'Percussioni',         nl: 'Slagwerk',        ja: '打楽器', alias: ['percussions'] },
  { fr: 'Batterie',          en: 'Drum kit',           de: 'Drumset',         es: 'Batería',          it: 'Batteria',            nl: 'Drumstel',        ja: 'ドラムセット' },
  { fr: 'Vibraphone',        en: 'Vibraphone',         de: 'Vibraphon',       es: 'Vibráfono',        it: 'Vibrafono',           nl: 'Vibrafoon',       ja: 'ヴィブラフォン' },
  { fr: 'Marimba',           en: 'Marimba',            de: 'Marimba',         es: 'Marimba',          it: 'Marimba',             nl: 'Marimba',         ja: 'マリンバ' },
  { fr: 'Xylophone',         en: 'Xylophone',          de: 'Xylophon',        es: 'Xilófono',         it: 'Xilofono',            nl: 'Xylofoon',        ja: 'シロフォン' },
  { fr: 'Glockenspiel',      en: 'Glockenspiel',       de: 'Glockenspiel',    es: 'Carillón',         it: 'Campanelli',          nl: 'Klokkenspel',     ja: 'グロッケンシュピール' },
  { fr: 'Cymbales',          en: 'Cymbals',            de: 'Becken',          es: 'Platillos',        it: 'Piatti',              nl: 'Bekkens',         ja: 'シンバル' },
  { fr: 'Caisse claire',     en: 'Snare drum',         de: 'Kleine Trommel',  es: 'Caja',             it: 'Tamburo militare',    nl: 'Kleine trom',     ja: 'スネアドラム' },
  { fr: 'Grosse caisse',     en: 'Bass drum',          de: 'Große Trommel',   es: 'Bombo',            it: 'Gran cassa',          nl: 'Grote trom',      ja: 'バスドラム' },
  { fr: 'Triangle',          en: 'Triangle',           de: 'Triangel',        es: 'Triángulo',        it: 'Triangolo',           nl: 'Triangel',        ja: 'トライアングル' },
  { fr: 'Tambourin',         en: 'Tambourine',         de: 'Tamburin',        es: 'Pandereta',        it: 'Tamburello',          nl: 'Tamboerijn',      ja: 'タンバリン', alias: ['タンブリン'] },

  // Claviers, harpe, guitares
  { fr: 'Harpe',             en: 'Harp',               de: 'Harfe',           es: 'Arpa',             it: 'Arpa',                nl: 'Harp',            ja: 'ハープ' },
  { fr: 'Piano',             en: 'Piano',              de: 'Klavier',         es: 'Piano',            it: 'Pianoforte',          nl: 'Piano',           ja: 'ピアノ' },
  { fr: 'Célesta',           en: 'Celesta',            de: 'Celesta',         es: 'Celesta',          it: 'Celesta',             nl: 'Celesta',         ja: 'チェレスタ' },
  { fr: 'Clavier',           en: 'Keyboard',           de: 'Keyboard',        es: 'Teclado',          it: 'Tastiera',            nl: 'Keyboard',        ja: 'キーボード' },
  { fr: 'Orgue',             en: 'Organ',              de: 'Orgel',           es: 'Órgano',           it: 'Organo',              nl: 'Orgel',           ja: 'オルガン' },
  { fr: 'Accordéon',         en: 'Accordion',          de: 'Akkordeon',       es: 'Acordeón',         it: 'Fisarmonica',         nl: 'Accordeon',       ja: 'アコーディオン', alias: ['accordeon'] },
  { fr: 'Guitare',           en: 'Guitar',             de: 'Gitarre',         es: 'Guitarra',         it: 'Chitarra',            nl: 'Gitaar',          ja: 'ギター' },
  { fr: 'Guitare basse',     en: 'Bass guitar',        de: 'E-Bass',          es: 'Bajo eléctrico',   it: 'Basso elettrico',     nl: 'Basgitaar',       ja: 'ベースギター' },

  // Chant
  { fr: 'Voix',              en: 'Voice',              de: 'Singstimme',      es: 'Voz',              it: 'Voce',                nl: 'Zangstem',        ja: '声楽' },
  { fr: 'Chœur',             en: 'Choir',              de: 'Chor',            es: 'Coro',             it: 'Coro',                nl: 'Koor',            ja: '合唱' },
  { fr: 'Soprano',           en: 'Soprano',            de: 'Sopran',          es: 'Soprano',          it: 'Soprano',             nl: 'Sopraan',         ja: 'ソプラノ' },
  { fr: 'Mezzo-soprano',     en: 'Mezzo-soprano',      de: 'Mezzosopran',     es: 'Mezzosoprano',     it: 'Mezzosoprano',        nl: 'Mezzosopraan',    ja: 'メゾソプラノ' },
  { fr: 'Ténor',             en: 'Tenor',              de: 'Tenor',           es: 'Tenor',            it: 'Tenore',              nl: 'Tenor',           ja: 'テノール' },
  { fr: 'Baryton',           en: 'Baritone',           de: 'Bariton',         es: 'Barítono',         it: 'Baritono',            nl: 'Bariton',         ja: 'バリトン' },

  /* « Alto » est LE faux ami du métier : en français c'est le pupitre d'altos,
     partout ailleurs c'est une voix. Le pupitre des parties, lui, range déjà
     « alto » dans les Cordes (PARTITIONS_PUPITRES) — on gloserait donc de la
     même façon, et c'est précisément le mot qu'il fallait traduire. */
  { fr: 'Alto',              en: 'Viola',              de: 'Bratsche',        es: 'Viola',            it: 'Viola',               nl: 'Altviool',        ja: 'ヴィオラ' },
  { fr: 'Violon',            en: 'Violin',             de: 'Violine',         es: 'Violín',           it: 'Violino',             nl: 'Viool',           ja: 'ヴァイオリン', alias: ['violini'] },
  { fr: 'Violoncelle',       en: 'Cello',              de: 'Violoncello',     es: 'Violonchelo',      it: 'Violoncello',         nl: 'Cello',           ja: 'チェロ', alias: ['cello', 'violoncelli'] },
  { fr: 'Contrebasse',       en: 'Double bass',        de: 'Kontrabass',      es: 'Contrabajo',       it: 'Contrabbasso',        nl: 'Contrabas',       ja: 'コントラバス', alias: ['contrabass', 'contrabassi'] },

  // Le reste : la basse au sens large, et le conducteur.
  { fr: 'Basse',             en: 'Bass',               de: 'Bass',            es: 'Bajo',             it: 'Basso',               nl: 'Bas',             ja: 'バス', alias: ['ベース'] },
  { fr: 'Conducteur',        en: 'Full score',         de: 'Partitur',        es: 'Partitura',        it: 'Partitura',           nl: 'Partituur',       ja: '総譜' },
  { fr: 'Partition',         en: 'Score',              de: 'Partitur',        es: 'Partitura',        it: 'Partitura',           nl: 'Partituur',       ja: '楽譜' },
];

/* L'index de toutes les formes connues — française, étrangères, variantes —
   vers l'entrée qui les traduit. La PREMIÈRE rencontrée gagne : « Partitur »
   vaut pour le conducteur comme pour la partition, et les deux disent la même
   chose. */
const PARTITIONS_INSTRUMENTS_INDEX = (function () {
  const index = new Map();
  PARTITIONS_INSTRUMENTS.forEach(e => {
    [e.fr, e.en, e.de, e.es, e.it, e.nl, e.ja].concat(e.alias || []).forEach(forme => {
      const cle = partitionsNormaliser(forme);
      if (cle && !index.has(cle)) index.set(cle, e);
    });
  });
  return index;
})();

/* Traduire le nom d'une partie sans en perdre la structure. On avance mot à
   mot, en essayant TOUJOURS le motif le plus long d'abord : sans cela,
   « Clarinette basse » devient « Clarinet bass » et « Cor anglais » devient
   « Horn english ». Ce qui n'est pas un instrument — un numéro, « 1-2 », un
   préfixe de spectacle, « solo », « divisi » — est recopié tel quel : c'est
   souvent ce qui distingue deux parties, et le perdre serait pire que ne pas
   traduire. */
function partitionsNomTraduit(nom, langue) {
  const l = String(langue || '').slice(0, 2).toLowerCase();
  const source = String(nom || '');
  if (!l || l === 'fr') return source;
  const mots = source.trim().split(/\s+/).filter(Boolean);
  if (!mots.length) return source;

  /* Un groupe de mots ne se teste que si CHACUN porte une lettre. Sans ce
     garde-fou, « EXP33 - Violon 2 » perdait son tiret : partitionsNormaliser
     efface la ponctuation, « - Violon » devenait « violon », et le séparateur
     était mangé par l'appariement. */
  const _aUneLettre = (mot) => /\p{L}/u.test(mot);
  const sortie = [];
  let i = 0;
  while (i < mots.length) {
    let pris = 0, texte = '';
    for (let n = Math.min(3, mots.length - i); n >= 1; n--) {
      const groupe = mots.slice(i, i + n);
      if (!groupe.every(_aUneLettre)) continue;
      const entree = PARTITIONS_INSTRUMENTS_INDEX.get(partitionsNormaliser(groupe.join(' ')));
      if (entree && entree[l]) { pris = n; texte = entree[l]; break; }
    }
    /* Dorico sort parfois « Violoncello2 », sans espace. Le chiffre collé
       n'empêche pas de reconnaître l'instrument — et il doit rester collé,
       parce que c'est lui qui distingue les deux pupitres. */
    if (!pris) {
      const colle = mots[i].match(/^(\p{L}[\p{L}\p{M}'\u2019]*)([0-9].*)$/u);
      const entree = colle && PARTITIONS_INSTRUMENTS_INDEX.get(partitionsNormaliser(colle[1]));
      if (entree && entree[l]) { pris = 1; texte = entree[l] + colle[2]; }
    }
    if (pris) { sortie.push(texte); i += pris; }
    else { sortie.push(mots[i]); i += 1; }
  }
  return sortie.join(' ');
}

/* La jauge segmentée d'un ensemble de parties : un segment par partie, vert si
   elle porte au moins un fichier, rouge sinon. Le title de chaque segment
   nomme la partie — on survole le rouge et on sait quoi redemander à
   l'arrangeur, sans ouvrir le détail. */
function partitionsJaugeHtml(parties, aDesFichiers, options) {
  const liste = parties || [];
  const o = options || {};
  if (!liste.length) return '';
  const pleines = liste.filter(aDesFichiers).length;
  const segments = liste.map(p => {
    const ok = aDesFichiers(p);
    return `<i class="${ok ? '' : 'vide'}" title="${escapeAttr(p.nom + (ok ? '' : ' — aucun fichier'))}"></i>`;
  }).join('');
  // Un <span> et non un <div> : la jauge est posée dans les cartes de spectacle,
  // qui sont des <button> — et un <button> ne contient que du contenu de phrase.
  return `<span class="co-seg${o.fin ? ' fin' : ''}" role="img"
    aria-label="${escapeAttr(pleines + ' partie' + (pleines > 1 ? 's' : '') + ' sur ' + liste.length + ' avec un fichier déposé')}">${segments}</span>`;
}

/* Les initiales d'un spectacle, pour sa pastille. Deux caractères, jamais
   plus : au-delà, ce n'est plus une pastille mais une étiquette, et le nom
   complet est déjà écrit à côté.
   Un second mot purement numérique est écarté au profit des deux premières
   lettres du premier : beaucoup de programmes s'appellent « EXPEDITION 33 »
   ou « Symphonie 5 », et « E3 » ne se reconnaît pas alors que « EX » si. */
function partitionsInitiales(nom) {
  const mots = String(nom || '').trim().split(/[\s\-_]+/).filter(Boolean);
  if (!mots.length) return '\u266a';
  const second = mots[1];
  if (mots.length === 1 || !second || /^[0-9]+$/.test(second)) {
    return mots[0].slice(0, 2).toUpperCase();
  }
  return (mots[0][0] + second[0]).toUpperCase();
}

/* ============================================================================
 * LE CHŒUR — l'ordre des voix, et la tonalité.
 *
 * POURQUOI LES VOIX NE SE TRIENT PAS COMME LES INSTRUMENTS
 * -------------------------------------------------------
 * L'ordre du conducteur range par famille ; un chœur se range par TESSITURE,
 * du plus aigu au plus grave, et c'est un ordre que tout choriste connaît par
 * cœur : soprano, alto, ténor, basse. Passer par PARTITIONS_ORDRE_CONDUCTEUR
 * donnait « Soprano, Ténor, Basse, Alto » — parce qu'« Alto » y désigne d'abord
 * l'instrument à cordes, rangé plus bas. Un chef de chœur qui lit sa liste dans
 * cet ordre croit qu'il manque une voix.
 *
 * Le tri se fait À L'AFFICHAGE et non au dépôt : partitions_parties.ordre est
 * figé à la création de la partie, et les spectacles déjà rangés ne doivent pas
 * avoir à être repris pour que leur chœur se lise droit.
 * ========================================================================== */

/* Les voix, de l'aigu au grave. Les divisi (« Soprano 1 », « Alto 2 ») sont
   portés par le numéro, comme pour les instruments : ils se rangent sous leur
   voix et dans l'ordre. */
const PARTITIONS_VOIX = [
  'soprano', 'mezzo soprano', 'mezzo', 'alto', 'contralto',
  'tenor', 'baryton', 'basse', 'baryton basse',
];

/* Le rang d'une partie de chœur dans l'ordre des tessitures. Une partie qu'on
   ne sait pas classer passe à la fin — comme ailleurs : mieux vaut en bas de
   liste qu'intercalée entre les ténors et les basses. */
function partitionsOrdreVoix(nom) {
  const n = partitionsNormaliser(nom);
  if (!n) return 9000;
  let meilleur = -1, rang = 9000;
  PARTITIONS_VOIX.forEach((cle, i) => {
    const c = partitionsNormaliser(cle);
    if (_motEntier(c, n) && c.length > meilleur) { meilleur = c.length; rang = i * 10; }
  });
  if (rang === 9000) return 9000;
  const num = n.match(/(\d+)/);
  return rang + (num ? Math.min(9, Number(num[1])) : 0);
}

/* Trier des parties de chœur. Utilisé à l'affichage, des deux côtés — l'écran
   de production et la page du chef de chœur doivent donner la MÊME liste dans
   le MÊME ordre, sans quoi on se parle au téléphone en comptant des lignes. */
function partitionsTrierVoix(parties) {
  return (parties || []).slice().sort((a, b) =>
    (partitionsOrdreVoix(a.nom) - partitionsOrdreVoix(b.nom))
    || String(a.nom || '').localeCompare(String(b.nom || ''), 'fr'));
}

const _TONALITE_MODES = {
  maj: 'majeur', majeur: 'majeur', major: 'majeur', dur: 'majeur',
  min: 'mineur', mineur: 'mineur', minor: 'mineur', moll: 'mineur',
};

/* La tonalité, remise en forme — et JAMAIS perdue.
   ----------------------------------------------
   Le champ est libre, et il le reste : une tonalité se saisit vite, entre deux
   coups de fil, et on y tape « reb M », « Eb major », « fa# mineur ». Une
   colonne où l'on lit ces trois formes côte à côte ne se compare pas d'un coup
   d'œil — or c'est exactement ce qu'un chef de chœur y cherche : voir en une
   seconde que le n° 4 descend d'un demi-ton.
   On normalise donc l'altération (♭ et ♯, les vrais signes, pas « b » ni « # »)
   et le mode (« majeur », « mineur »), et on laisse la note DANS LE SYSTÈME OÙ
   ELLE A ÉTÉ SAISIE — latin ou anglo-saxon. Traduire « Eb » en « Mi♭ » serait
   imposer une notation à qui en emploie une autre, souvent parce que sa
   partition la porte.
   CE QU'ON NE RECONNAÎT PAS RESSORT TEL QUEL. « Mode dorien », « idem n° 3 »,
   « à confirmer » sont des réponses justes : les mutiler serait pire que de ne
   rien faire. */
function partitionsTonalite(texte) {
  const brut = String(texte || '').trim().replace(/\s+/g, ' ');
  if (!brut) return '';
  const m = brut.match(
    /^(?:([Dd]o|[Rr][ée]|[Mm]i|[Ff]a|[Ss]ol|[Ll]a|[Ss]i|[A-Ga-g]))\s*(di[eè]se|b[ée]mol|#|♯|b|♭)?\s*(.*)$/);
  if (!m) return brut;
  const [, note, alteration, reste] = m;
  const suite = (reste || '').trim();
  // « M » majuscule est majeur, « m » minuscule est mineur : la casse porte
  // ici toute l'information, elle est donc lue AVANT de passer en minuscules.
  const mode = suite === 'M' ? 'majeur'
    : suite === 'm' ? 'mineur'
    : suite === '' ? ''
    : _TONALITE_MODES[suite.toLowerCase()];
  // Une suite qu'on ne reconnaît pas : ce n'est pas une tonalité qu'on sait
  // lire, et « Basse continue » ne doit pas ressortir « B♭ asse continue ».
  if (mode === undefined) return brut;
  const signe = !alteration ? ''
    : /^(#|♯|di)/i.test(alteration) ? '♯' : '♭';
  const tete = note.length > 1
    ? note[0].toUpperCase() + note.slice(1).toLowerCase()
    : note.toUpperCase();
  return (tete + signe + (mode ? ' ' + mode : '')).replace('Re', 'Ré');
}

/* La même, pour la page bilingue du chœur. Seul le mode change : les notes
   restent telles qu'elles ont été saisies, et « ♭ » se lit partout. */
function partitionsTonaliteLangue(texte, langue) {
  const t = partitionsTonalite(texte);
  if (langue !== 'en' || !t) return t;
  return t.replace(/\bmajeur\b/, 'major').replace(/\bmineur\b/, 'minor');
}

/* ============================================================================
   PROPOSER UNE AFFECTATION D'APRÈS L'INSTRUMENT.

   Ce fichier refusait de le faire, et la raison tenait : musiciens.instrument
   est du texte libre — « Flutes » et « Flûtes », « Alto » et « Altos », un
   « Violoncelles » à espace final. Un appariement APPLIQUÉ sur ce texte se
   serait trompé, et l'erreur ne se serait vue qu'à la première répétition.

   Ce qui change, ce n'est pas la confiance dans le texte, c'est le GESTE : on
   ne pose rien, on PROPOSE. Chaque ligne est graduée — sûre, probable, à
   trancher —, relue et cochée avant d'être écrite, et une affectation déjà
   posée à la main n'est jamais touchée. Le texte libre, lui, se lit avec les
   outils déjà faits pour les noms de fichiers : accents et pluriels effacés,
   formes anglaises de Dorico reconnues (PARTITIONS_INSTRUMENTS), chiffre
   collé décollé, « DoubleBass » aéré.

   CE QU'ON NE DEVINE PAS, et qu'on dit :
   — le numéro dans la famille quand la fiche ne le porte pas. « Cor » devant
     « Cor 1-2 » et « Cor 3-4 » n'a pas de bonne réponse : la personne passe
     « à trancher », les deux parties en choix, la bonne en tête si l'une est
     encore sans lecteur ;
   — les doublures. Le hautbois 2 qui prend le cor anglais, la flûte 2 le
     piccolo : c'est une décision de pupitre, pas une lecture de fiche. La
     partie reste « sans lecteur », et le compteur de la page le dit ;
   — une seconde partie pour quelqu'un qui en a déjà une. La proposition ne
     sert qu'à qui n'a rien ; le reste se fait dans la matrice.
   ========================================================================== */

/* Les ordinaux qu'on rencontre DEVANT l'instrument : « 2e violon », « second
   violin », « premier cor ». Après lui, ce sont des chiffres — « Violon 2 »,
   « Cor 1-2 », « Violin II ». */
const _PARTITIONS_ORDINAUX = {
  premier: 1, premiere: 1, premiers: 1, premieres: 1, '1er': 1, '1ere': 1, '1re': 1, '1ers': 1, '1res': 1,
  first: 1, '1st': 1,
  second: 2, seconde: 2, seconds: 2, secondes: 2, deuxieme: 2, deuxiemes: 2,
  '2e': 2, '2eme': 2, '2emes': 2, '2nd': 2, '2nde': 2, '2nds': 2,
  troisieme: 3, troisiemes: 3, '3e': 3, '3eme': 3, third: 3, '3rd': 3,
  quatrieme: 4, quatriemes: 4, '4e': 4, '4eme': 4, fourth: 4, '4th': 4,
};
const _PARTITIONS_ROMAINS = { i: 1, ii: 2, iii: 3, iv: 4 };
/* « Violon solo » n'est pas un numéro : c'est le chef d'attaque, et il lit le
   premier violon. On le retient pour proposer le 1 — en « probable », parce
   que c'est une convention et non une lecture. */
const _PARTITIONS_SOLO = new Set(['solo', 'soliste', 'solist', 'principal', 'principale', 'concertmaster', 'konzertmeister']);

/* Lire un instrument dans un texte libre — la fiche d'une personne comme le
   nom d'une partie. Rend { entree, nom, numeros, solo } ou null.
     « Violoncelles  »        → Violoncelle, []
     « Violon 2 »             → Violon, [2]
     « Violon solo »          → Violon, [], solo
     « WZO – 540 Violoncello1 » → Violoncelle, [1]   (le 540 est un numéro d'œuvre, pas de pupitre)
     « Cor 1-2 »              → Cor, [1, 2]
     « 560 DoubleBass »       → Contrebasse, []
   Le plus long groupe de mots connu l'emporte, le plus à gauche à longueur
   égale — « Alto Flute » est une flûte alto, pas un alto. Un mot inconnu au
   pluriel se réessaie au singulier : « Flutes », « Altos », « Cors ». */
function partitionsInstrumentDe(texte) {
  const brut = String(texte || '')
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')   // DoubleBass → Double Bass
    .replace(/(\p{L})(\d)/gu, '$1 $2');        // Violoncello1 → Violoncello 1
  const mots = partitionsNormaliser(brut).split(' ').filter(Boolean);
  if (!mots.length) return null;
  const aUneLettre = (m) => /\p{L}/u.test(m);
  const singulier = (m) => (m.length > 3 && m.endsWith('s')) ? m.slice(0, -1) : m;
  let trouve = null;
  for (let i = 0; i < mots.length && !trouve; i++) {
    for (let n = Math.min(3, mots.length - i); n >= 1; n--) {
      const groupe = mots.slice(i, i + n);
      if (!groupe.every(aUneLettre)) continue;
      const entree = PARTITIONS_INSTRUMENTS_INDEX.get(groupe.join(' '))
        || PARTITIONS_INSTRUMENTS_INDEX.get(groupe.map(singulier).join(' '));
      if (entree) { trouve = { entree, debut: i, fin: i + n }; break; }
    }
  }
  if (!trouve) return null;
  const numeros = [];
  for (let j = trouve.fin; j < mots.length; j++) {
    const m = mots[j];
    if (/^\d{1,2}$/.test(m)) numeros.push(Number(m));
    else if (_PARTITIONS_ROMAINS[m]) numeros.push(_PARTITIONS_ROMAINS[m]);
    else if (!/[\p{L}\d]/u.test(m)) continue;   // un tiret long, une parenthèse : on passe
    else break;
  }
  const avant = mots[trouve.debut - 1];
  if (avant && _PARTITIONS_ORDINAUX[avant] && !numeros.includes(_PARTITIONS_ORDINAUX[avant])) {
    numeros.push(_PARTITIONS_ORDINAUX[avant]);
  }
  const solo = mots.slice(trouve.fin).some(m => _PARTITIONS_SOLO.has(m));
  return { entree: trouve.entree, nom: trouve.entree.fr, numeros, solo };
}

/* Le conducteur n'est pas une partie qu'on distribue à l'instrument : il va au
   chef, et à personne d'autre. Reconnu par son pupitre ou par son nom. */
function _partitionsEstConducteur(partie, lu) {
  if (partitionsPupitreNormalise(partie.pupitre) === "Chef d'orchestre") return true;
  return !!(lu && (lu.nom === 'Conducteur' || lu.nom === 'Partition'));
}

/* Deux pupitres peuvent-ils se répondre ? La seule collision réelle est entre
   ce qui se chante et ce qui se joue : « Alto » est un pupitre de cordes dans
   une fiche de musicien et une voix dans un programme de solistes. Le reste
   — un « Autre », un pupitre vide — ne dit rien et ne bloque rien. */
function _partitionsPupitresCompatibles(a, b) {
  const pa = partitionsPupitreNormalise(a), pb = partitionsPupitreNormalise(b);
  if (pa === 'Autre' || pb === 'Autre' || pa === pb) return true;
  const chante = (p) => p === 'Chant' || p === 'Chœur';
  return chante(pa) === chante(pb);
}

/* La proposition elle-même.
     parties      — celles du spectacle
     effectif     — les personnes de l'opération (effectifAffichable)
     affectations — celles déjà posées sur ce spectacle et cette opération
   Rend quatre listes, dans l'ordre de l'effectif :
     sures            [{ personne, partie, lu, motif }]
     probables        [{ personne, partie, lu, motif }]
     aTrancher        [{ personne, lu, memes: [partie], autres: [partie], motif }]
     sansProposition  [{ personne, lu, motif }]
   et deux comptes : dejaServis (personnes qui ont déjà une partie ici, jamais
   touchées) et techniciens (pas de partition pour eux). */
function partitionsProposerAffectations(parties, effectif, affectations) {
  const lues = (parties || []).map(p => ({ partie: p, lu: partitionsInstrumentDe(p.nom) }))
    .filter(x => partitionsPupitreNormalise(x.partie.pupitre) !== 'Chœur');
  const conducteurs = lues.filter(x => _partitionsEstConducteur(x.partie, x.lu));
  const distribuables = lues.filter(x => !conducteurs.includes(x));
  const lecteurs = new Map();   // partieId → nombre de lecteurs déjà posés
  (affectations || []).forEach(a => lecteurs.set(a.partieId, (lecteurs.get(a.partieId) || 0) + 1));
  const servis = new Set((affectations || []).map(a => a.personType + '|' + a.personId));

  const out = { sures: [], probables: [], aTrancher: [], sansProposition: [], dejaServis: 0, techniciens: 0 };
  /* Une partie encore sans lecteur passe en tête des choix : quand il faut
     trancher entre « Cor 1-2 » déjà lu par deux personnes et « Cor 3-4 » que
     personne n'a, la seconde est la réponse neuf fois sur dix. */
  const parManque = (a, b) => (lecteurs.get(a.id) || 0) - (lecteurs.get(b.id) || 0);

  (effectif || []).forEach(personne => {
    if (personne.personType !== 'musicien') { out.techniciens++; return; }
    if (servis.has(personne.personType + '|' + personne.personId)) { out.dejaServis++; return; }
    if (personne.horsEffectif) return;   // une anomalie à régler, pas une personne à servir
    const lu = partitionsInstrumentDe(personne.instrument);
    const pupitre = partitionsPupitreNormalise(personne.pupitre);

    // Le chef : le conducteur, et rien d'autre.
    if (pupitre === "Chef d'orchestre") {
      const libres = conducteurs.map(x => x.partie);
      if (libres.length === 1) out.sures.push({ personne, partie: libres[0], lu, motif: 'chef d’orchestre → conducteur' });
      else if (libres.length > 1) out.aTrancher.push({ personne, lu, memes: libres.slice().sort(parManque), autres: [], motif: 'plusieurs conducteurs' });
      else out.sansProposition.push({ personne, lu, motif: 'aucun conducteur dans ce spectacle' });
      return;
    }

    const memePupitre = distribuables
      .filter(x => pupitre !== 'Autre' && partitionsPupitreNormalise(x.partie.pupitre) === pupitre)
      .map(x => x.partie);

    if (!lu) {
      if (memePupitre.length) out.aTrancher.push({ personne, lu, memes: [], autres: memePupitre.slice().sort(parManque),
        motif: personne.instrument ? `« ${personne.instrument} » n’est pas un instrument connu` : 'instrument non renseigné' });
      else out.sansProposition.push({ personne, lu, motif: personne.instrument ? `« ${personne.instrument} » n’est pas un instrument connu` : 'instrument non renseigné' });
      return;
    }

    const memes = distribuables
      .filter(x => x.lu && x.lu.entree === lu.entree && _partitionsPupitresCompatibles(personne.pupitre, x.partie.pupitre));
    const autres = memePupitre.filter(p => !memes.some(x => x.partie === p));
    const aTrancher = (liste, motif) => out.aTrancher.push({ personne, lu,
      memes: liste.map(x => x.partie).sort(parManque), autres: autres.slice().sort(parManque), motif });

    if (!memes.length) {
      if (autres.length) aTrancher([], `aucune partie « ${lu.nom} » — le pupitre en a d’autres`);
      else out.sansProposition.push({ personne, lu, motif: `aucune partie « ${lu.nom} » dans ce spectacle` });
      return;
    }
    if (memes.length === 1) {
      const x = memes[0];
      const numsPartie = x.lu.numeros;
      const accord = !lu.numeros.length || !numsPartie.length || lu.numeros.some(n => numsPartie.includes(n));
      if (accord) out.sures.push({ personne, partie: x.partie, lu, motif: `seule partie « ${lu.nom} »` });
      else out.probables.push({ personne, partie: x.partie, lu, motif: `seule partie « ${lu.nom} », mais numérotée autrement` });
      return;
    }
    // Plusieurs parties du même instrument : c'est le numéro qui tranche.
    if (lu.numeros.length) {
      const exacts = memes.filter(x => lu.numeros.some(n => x.lu.numeros.includes(n)));
      if (exacts.length === 1) out.sures.push({ personne, partie: exacts[0].partie, lu, motif: `${lu.nom} ${lu.numeros.join('-')}` });
      else if (exacts.length > 1) aTrancher(exacts, `plusieurs parties portent le ${lu.numeros.join('-')}`);
      else aTrancher(memes, `aucune partie ne porte le ${lu.numeros.join('-')}`);
      return;
    }
    if (lu.solo) {
      const premieres = memes.filter(x => x.lu.numeros.includes(1));
      if (premieres.length === 1) { out.probables.push({ personne, partie: premieres[0].partie, lu, motif: 'solo → 1' }); return; }
    }
    aTrancher(memes, `${memes.length} parties « ${lu.nom} », la fiche ne dit pas laquelle`);
  });
  return out;
}

if (typeof window !== 'undefined') {
  window.PARTITIONS_ORDRE_CONDUCTEUR = PARTITIONS_ORDRE_CONDUCTEUR;
  window.partitionsNormaliser = partitionsNormaliser;
  window.partitionsNomDepuisFichier = partitionsNomDepuisFichier;
  window.partitionsPupitreDe = partitionsPupitreDe;
  window.partitionsOrdreDe = partitionsOrdreDe;
  window.partitionsApparier = partitionsApparier;
  window.partitionsPoids = partitionsPoids;
  window.partitionsNouveauCode = partitionsNouveauCode;
  window.PARTITIONS_PUPITRE_ORDRE = PARTITIONS_PUPITRE_ORDRE;
  window.partitionsPupitreNormalise = partitionsPupitreNormalise;
  window.partitionsRangPupitre = partitionsRangPupitre;
  window.partitionsGrouperParPupitre = partitionsGrouperParPupitre;
  window.PARTITIONS_PUPITRE_LANGUES = PARTITIONS_PUPITRE_LANGUES;
  window.partitionsPupitreNom = partitionsPupitreNom;
  window.partitionsPupitreHtml = partitionsPupitreHtml;
  window.PARTITIONS_INSTRUMENTS = PARTITIONS_INSTRUMENTS;
  window.partitionsNomTraduit = partitionsNomTraduit;
  window.partitionsPupitreVar = partitionsPupitreVar;
  window.partitionsJaugeHtml = partitionsJaugeHtml;
  window.partitionsInitiales = partitionsInitiales;
  window.PARTITIONS_VOIX = PARTITIONS_VOIX;
  window.partitionsOrdreVoix = partitionsOrdreVoix;
  window.partitionsTrierVoix = partitionsTrierVoix;
  window.partitionsTonalite = partitionsTonalite;
  window.partitionsTonaliteLangue = partitionsTonaliteLangue;
  window.partitionsInstrumentDe = partitionsInstrumentDe;
  window.partitionsProposerAffectations = partitionsProposerAffectations;
}
