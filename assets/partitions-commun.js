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
  'piccolo', 'ottavino', 'flute', 'flauto', 'hautbois', 'oboe', 'cor anglais',
  'english horn', 'corno inglese', 'clarinette', 'clarinet', 'clarinetto',
  'clarinette basse', 'bass clarinet', 'basson', 'bassoon', 'fagotto',
  'contrebasson', 'contrabassoon', 'saxophone', 'saxofono',
  'cor', 'corno', 'corni', 'horn', 'trompette', 'trumpet', 'tromba', 'trombe',
  'cornet', 'saxhorn', 'trombone', 'tromboni', 'posaune', 'trombone basse',
  'bass trombone', 'tuba', 'euphonium',
  'timbales', 'timpani', 'percussion', 'percussioni', 'batterie', 'drums',
  'drum kit', 'caisse claire', 'snare', 'vibraphone', 'marimba', 'xylophone',
  'glockenspiel',
  'harpe', 'harp', 'arpa', 'piano', 'celesta', 'clavier', 'keyboard', 'synth', 'orgue',
  'organ', 'clavecin', 'harpsichord', 'accordeon', 'guitare', 'guitar', 'basse',
  'voix', 'voice', 'choeur', 'chorale', 'chorus', 'choir',
  'soprano', 'mezzo', 'alto voix', 'contralto', 'tenor', 'baryton', 'baritone',
  'basse voix',
  'violon', 'violin', 'violino', 'violini', 'violon 1', 'violon 2', 'alto',
  'viola', 'viole', 'violoncelle', 'violoncello', 'violoncelli', 'cello',
  'contrebasse', 'contrabass', 'double bass', 'doublebass', 'kontrabass',
  'conducteur', 'conductor', 'full score',
];

/* Le pupitre d'une partie, déduit de son nom. Six valeurs, celles que la maison
   emploie déjà (musiciens.pupitre est propre, contrairement à instrument).
   L'ordre des règles compte : « clarinette basse » doit tomber dans Bois avant
   que « basse » ne l'envoie dans Cordes. */
const PARTITIONS_PUPITRES = [
  /* LE CHŒUR PASSE D'ABORD, ET IL L'EMPORTE MÊME S'IL EST PLUS COURT (voir
     partitionsPupitreDe) : « chœur » ne nomme pas un instrument, il nomme une
     SECTION. « Chœur Soprano » est un pupitre de vingt personnes, pas une
     soliste, et c'est le premier mot qui le dit.
     Les motifs se comparent en DÉBUT DE MOT : on n'y met donc que ce qui ne
     peut pas commencer autre chose. « coro » en est exclu pour cette raison —
     il attraperait « Coronation Anthem ». */
  { pupitre: 'Chœur',       motifs: ['choeur', 'chœur', 'chorale', 'chorus', 'choir', 'satb', 'ssaa', 'ttbb'] },
  /* LES NOMS ANGLAIS ET ITALIENS SONT LÀ POUR UNE RAISON CONCRÈTE : Dorico,
     Sibelius et Finale exportent dans la langue de leur interface, et un
     matériel gravé à l'étranger arrive tel quel. « Oboe », « Horn », « Viola »
     tombaient dans « Autre », et il fallait les reclasser un par un — trente
     fois par spectacle. */
  { pupitre: 'Bois',        motifs: ['piccolo', 'ottavino', 'flute', 'flûte', 'flauto', 'hautbois', 'oboe',
                                     'cor anglais', 'english horn', 'corno inglese',
                                     'clarinette', 'clarinet', 'clarinetto',
                                     'basson', 'bassoon', 'fagotto', 'fagott',
                                     'contrebasson', 'contrabassoon', 'controfagotto',
                                     'saxophone', 'saxofono'] },
  { pupitre: 'Cuivres',     motifs: ['cor', 'corno', 'corni', 'horn', 'trompette', 'trumpet', 'tromba', 'trombe',
                                     'cornet', 'saxhorn', 'trombone', 'tromboni', 'posaune', 'tuba',
                                     'bugle', 'euphonium', 'flugelhorn'] },
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
                                     'guitare', 'guitar', 'basse', 'conducteur', 'conductor',
                                     'score', 'partition'] },
];

function partitionsNormaliser(texte) {
  return String(texte || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    /* UNE LETTRE COLLÉE À UN CHIFFRE EST DEUX MOTS. Dorico exporte
       « Violin1 », « Violoncello2 », « Synth1 » : sans cette coupure, aucun
       motif ne commence un mot dans « violin1 », et trente parties d'un
       matériel gravé à l'étranger tombent dans « Autre » et hors de l'ordre
       du conducteur. La coupure vaut aussi pour la comparaison des noms :
       « Violon1 » et « Violon 1 » désignent la même partie, et l'écran doit
       le voir avant d'en créer deux. */
    .replace(/([a-z])(\d)/g, '$1 $2')
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

/* La pastille de pupitre. Le nom y est écrit en toutes lettres : la couleur
   accélère la lecture, elle ne la porte pas seule — un daltonien, une
   impression en noir et blanc et un écran mal réglé doivent donner la même
   page. */
function partitionsPupitreHtml(pupitre, options) {
  const pup = partitionsPupitreNormalise(pupitre);
  const o = options || {};
  const texte = o.texte != null ? o.texte : pup;
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
  window.partitionsPupitreHtml = partitionsPupitreHtml;
  window.partitionsPupitreVar = partitionsPupitreVar;
  window.partitionsJaugeHtml = partitionsJaugeHtml;
  window.partitionsInitiales = partitionsInitiales;
  window.PARTITIONS_VOIX = PARTITIONS_VOIX;
  window.partitionsOrdreVoix = partitionsOrdreVoix;
  window.partitionsTrierVoix = partitionsTrierVoix;
  window.partitionsTonalite = partitionsTonalite;
  window.partitionsTonaliteLangue = partitionsTonaliteLangue;
}
