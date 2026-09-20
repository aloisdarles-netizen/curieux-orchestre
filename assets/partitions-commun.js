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
/* L'ANGLAIS EST LÀ PARCE QUE DORICO EXPORTE EN ANGLAIS. Un jeu sorti tel quel
   donne « 120 Oboe », « 510 Violin1 », « 560 DoubleBass » : aucun de ces noms
   n'a de mot français dedans, et la liste entière retombait donc en fin
   d'ordre, à plat. Les deux langues cohabitent dans la même case de la liste —
   c'est le même instrument, il a une seule place dans le conducteur. */
const PARTITIONS_ORDRE_CONDUCTEUR = [
  'piccolo', 'flute', 'hautbois', 'oboe', 'cor anglais', 'english horn',
  'clarinette', 'clarinet', 'clarinette basse', 'bass clarinet',
  'basson', 'bassoon', 'contrebasson', 'contrabassoon', 'saxophone',
  'cor', 'horn', 'french horn', 'trompette', 'trumpet', 'cornet', 'saxhorn',
  'trombone', 'trombone basse', 'bass trombone', 'tuba',
  'timbales', 'timpani', 'percussion', 'batterie', 'drums', 'vibraphone',
  'marimba', 'xylophone', 'glockenspiel',
  'harpe', 'harp', 'piano', 'celesta', 'clavier', 'keyboard', 'orgue', 'organ',
  'accordeon', 'accordion', 'guitare', 'guitar', 'basse',
  'voix', 'voice', 'choeur', 'choir', 'chorus', 'soprano', 'alto voix', 'tenor', 'basse voix',
  'violon', 'violin', 'violon 1', 'violin 1', 'violon 2', 'violin 2',
  'alto', 'viola', 'violoncelle', 'violoncello', 'cello',
  'contrebasse', 'contrabass', 'double bass', 'doublebass',
  'conducteur', 'score',
];

/* Le pupitre d'une partie, déduit de son nom. Six valeurs, celles que la maison
   emploie déjà (musiciens.pupitre est propre, contrairement à instrument).
   L'ordre des règles compte : « clarinette basse » doit tomber dans Bois avant
   que « basse » ne l'envoie dans Cordes. */
/* L'ANGLAIS, ICI AUSSI, ET POUR LA MÊME RAISON. Sur un jeu sorti de Dorico
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
  // « cor anglais » et « saxophone » AVANT les cuivres : sans cette priorité,
  // « cor » attrape le cor anglais, qui est un hautbois. Et « saxhorn » est un
  // cuivre, pas un saxophone — un motif « sax » les confondait.
  // Même piège en anglais, et il est pire : « english horn » EST le cor
  // anglais, donc un bois, et « horn » seul est le cor d'harmonie. Les bois
  // passant les premiers, l'ordre suffit à les départager.
  { pupitre: 'Bois',        motifs: ['piccolo', 'flute', 'flûte', 'hautbois', 'oboe', 'cor anglais', 'english horn',
                                     'clarinette', 'clarinet', 'basson', 'bassoon', 'contrebasson', 'contrabassoon', 'saxophone'] },
  { pupitre: 'Cuivres',     motifs: ['cor', 'horn', 'trompette', 'trumpet', 'cornet', 'saxhorn', 'trombone', 'tuba',
                                     'bugle', 'flugelhorn', 'euphonium'] },
  { pupitre: 'Percussions', motifs: ['percussion', 'timbale', 'timpani', 'batterie', 'drums', 'snare', 'vibraphone',
                                     'marimba', 'xylophone', 'glockenspiel', 'cymbale', 'cymbal', 'caisse claire'] },
  { pupitre: 'Chant',       motifs: ['voix', 'voice', 'chant', 'choeur', 'chœur', 'choir', 'chorus',
                                     'soprano', 'mezzo', 'tenor', 'ténor', 'baryton', 'baritone'] },
  { pupitre: 'Cordes',      motifs: ['violon', 'violin', 'alto', 'viola', 'violoncelle', 'violoncello', 'cello',
                                     'contrebasse', 'contrabass', 'double bass', 'doublebass', 'harpe', 'harp'] },
  { pupitre: 'Autre',       motifs: ['piano', 'clavier', 'keyboard', 'celesta', 'orgue', 'organ', 'synth',
                                     'accordeon', 'accordéon', 'accordion', 'guitare', 'guitar', 'basse',
                                     'conducteur', 'score', 'partition'] },
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
    'Percussions': 'percussions', 'Chant': 'chant', 'Autre': 'autre',
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
}
