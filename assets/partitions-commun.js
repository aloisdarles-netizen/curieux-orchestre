/* ============================================================================
 * partitions-commun.js — reconnaître une partie dans un nom de fichier.
 *
 * Le dépôt est le moment coûteux. On sort trente PDF de Dorico, nommés comme
 * Dorico les nomme — « 410 Piano_merged.pdf », « Violon 1.pdf », « EXP33 - Cor
 * 3-4 - v2.pdf » — et il faut dire de quelle partie chacun relève. Fait à la
 * main, c'est quarante minutes et deux erreurs ; deviné correctement, c'est
 * deux minutes de relecture.
 *
 * CE FICHIER NE DEVINE PAS L'INSTRUMENT D'UNE PERSONNE, et c'est délibéré.
 * musiciens.instrument est du texte libre : 25 valeurs distinctes sur 114
 * fiches, avec « Flutes » et « Flûtes », « Alto » et « Altos », « Contrebasse »
 * et « Contrebasses », et un « Violoncelles » à espace final. On ne peut RIEN
 * y apparier automatiquement sans se tromper. L'affectation reste donc
 * nominative — c'est un choix, pas un renoncement : une partie donnée à la
 * mauvaise personne se découvre à la première répétition.
 *
 * Ce qu'on devine ici, c'est seulement le lien FICHIER → PARTIE, où les deux
 * côtés sont saisis par la même personne dans le même vocabulaire.
 * ========================================================================== */

/* L'ordre du conducteur. Une liste de parties triée par ordre alphabétique se
   lit comme un annuaire ; triée ainsi, elle se lit comme une partition — et un
   trou saute aux yeux, ce qui est tout l'intérêt au moment du dépôt. */
const PARTITIONS_ORDRE_CONDUCTEUR = [
  'piccolo', 'flute', 'hautbois', 'cor anglais', 'clarinette', 'clarinette basse',
  'basson', 'contrebasson', 'saxophone',
  'cor', 'trompette', 'cornet', 'saxhorn', 'trombone', 'trombone basse', 'tuba',
  'timbales', 'percussion', 'batterie', 'vibraphone', 'marimba', 'xylophone',
  'harpe', 'piano', 'celesta', 'clavier', 'orgue', 'accordeon', 'guitare', 'basse',
  'voix', 'choeur', 'soprano', 'alto voix', 'tenor', 'basse voix',
  'violon', 'violon 1', 'violon 2', 'alto', 'violoncelle', 'contrebasse',
  'conducteur',
];

/* Le pupitre d'une partie, déduit de son nom. Six valeurs, celles que la maison
   emploie déjà (musiciens.pupitre est propre, contrairement à instrument).
   L'ordre des règles compte : « clarinette basse » doit tomber dans Bois avant
   que « basse » ne l'envoie dans Cordes. */
const PARTITIONS_PUPITRES = [
  // « cor anglais » et « saxophone » AVANT les cuivres : sans cette priorité,
  // « cor » attrape le cor anglais, qui est un hautbois. Et « saxhorn » est un
  // cuivre, pas un saxophone — un motif « sax » les confondait.
  { pupitre: 'Bois',        motifs: ['piccolo', 'flute', 'flûte', 'hautbois', 'cor anglais', 'clarinette', 'basson', 'saxophone'] },
  { pupitre: 'Cuivres',     motifs: ['cor', 'trompette', 'cornet', 'saxhorn', 'trombone', 'tuba', 'bugle', 'euphonium'] },
  { pupitre: 'Percussions', motifs: ['percussion', 'timbale', 'batterie', 'vibraphone', 'marimba', 'xylophone', 'glockenspiel', 'cymbale', 'caisse claire'] },
  { pupitre: 'Chant',       motifs: ['voix', 'chant', 'choeur', 'chœur', 'soprano', 'mezzo', 'tenor', 'ténor', 'baryton'] },
  { pupitre: 'Cordes',      motifs: ['violon', 'alto', 'violoncelle', 'cello', 'contrebasse', 'harpe'] },
  { pupitre: 'Autre',       motifs: ['piano', 'clavier', 'celesta', 'orgue', 'synth', 'accordeon', 'accordéon', 'guitare', 'basse', 'conducteur', 'partition'] },
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

function partitionsPupitreDe(nom) {
  const n = partitionsNormaliser(nom);
  if (!n) return '';
  for (const regle of PARTITIONS_PUPITRES) {
    for (const motif of regle.motifs) {
      const m = partitionsNormaliser(motif);
      // Un motif doit commencer un mot : « cor » ne doit pas attraper
      // « accordeon », et « alto » ne doit pas attraper « altoparlante ».
      if (new RegExp('(^|\\s)' + m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(n)) return regle.pupitre;
    }
  }
  return 'Autre';
}

/* La place d'une partie dans l'ordre du conducteur. Les parties inconnues
   passent à la fin plutôt qu'au début : une partie qu'on n'a pas su classer se
   relit mieux en bas de liste qu'intercalée au milieu des bois. */
function partitionsOrdreDe(nom) {
  const n = partitionsNormaliser(nom);
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
  "Chef d'orchestre", 'Bois', 'Cuivres', 'Percussions', 'Chant', 'Cordes', 'Autre',
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
    'Percussions': 'percussions', 'Chant': 'chant', 'Autre': 'autre',
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
  { fr: 'Cor',               en: 'Horn',               de: 'Horn',            es: 'Trompa',           it: 'Corno',               nl: 'Hoorn',           ja: 'ホルン' },
  { fr: 'Trompette',         en: 'Trumpet',            de: 'Trompete',        es: 'Trompeta',         it: 'Tromba',              nl: 'Trompet',         ja: 'トランペット' },
  { fr: 'Cornet',            en: 'Cornet',             de: 'Kornett',         es: 'Corneta',          it: 'Cornetta',            nl: 'Kornet',          ja: 'コルネット' },
  { fr: 'Bugle',             en: 'Flugelhorn',         de: 'Flügelhorn',      es: 'Fiscorno',         it: 'Flicorno',            nl: 'Bugel',           ja: 'フリューゲルホルン' },
  { fr: 'Saxhorn',           en: 'Saxhorn',            de: 'Saxhorn',         es: 'Saxhorn',          it: 'Flicorno basso',      nl: 'Saxhoorn',        ja: 'サクソルン' },
  { fr: 'Trombone',          en: 'Trombone',           de: 'Posaune',         es: 'Trombón',          it: 'Trombone',            nl: 'Trombone',        ja: 'トロンボーン' },
  { fr: 'Trombone basse',    en: 'Bass trombone',      de: 'Bassposaune',     es: 'Trombón bajo',     it: 'Trombone basso',      nl: 'Bastrombone',     ja: 'バストロンボーン' },
  { fr: 'Tuba',              en: 'Tuba',               de: 'Tuba',            es: 'Tuba',             it: 'Tuba',                nl: 'Tuba',            ja: 'チューバ' },
  { fr: 'Euphonium',         en: 'Euphonium',          de: 'Euphonium',       es: 'Bombardino',       it: 'Eufonio',             nl: 'Eufonium',        ja: 'ユーフォニアム' },

  // Percussions
  { fr: 'Timbales',          en: 'Timpani',            de: 'Pauken',          es: 'Timbales',         it: 'Timpani',             nl: 'Pauken',          ja: 'ティンパニ' },
  { fr: 'Percussion',        en: 'Percussion',         de: 'Schlagwerk',      es: 'Percusión',        it: 'Percussioni',         nl: 'Slagwerk',        ja: '打楽器' },
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
  { fr: 'Accordéon',         en: 'Accordion',          de: 'Akkordeon',       es: 'Acordeón',         it: 'Fisarmonica',         nl: 'Accordeon',       ja: 'アコーディオン' },
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
  { fr: 'Violon',            en: 'Violin',             de: 'Violine',         es: 'Violín',           it: 'Violino',             nl: 'Viool',           ja: 'ヴァイオリン' },
  { fr: 'Violoncelle',       en: 'Cello',              de: 'Violoncello',     es: 'Violonchelo',      it: 'Violoncello',         nl: 'Cello',           ja: 'チェロ', alias: ['cello'] },
  { fr: 'Contrebasse',       en: 'Double bass',        de: 'Kontrabass',      es: 'Contrabajo',       it: 'Contrabbasso',        nl: 'Contrabas',       ja: 'コントラバス' },

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
}
