/* TEST — la proposition d'affectation d'après les instruments.

   Deux choses à tenir. D'abord la LECTURE du texte libre : les 25 valeurs
   réelles de musiciens.instrument (pluriels, accents, espace final, « Violon
   solo », « Violon 2 ») et les formes de Dorico côté parties (« Violoncello1 »,
   « DoubleBass », « 120 Oboe ») doivent tomber sur le même instrument. Ensuite
   la PROPOSITION : chacun reçoit les parties de son instrument, le numéro de
   la fiche restreint, un choix dans le pupitre sinon — et surtout ce qu'on ne
   touche jamais.

     node outils/test-partitions-proposition.cjs                              */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets', 'partitions-commun.js'), 'utf8'), ctx);
const { partitionsInstrumentDe: lire, partitionsProposerAffectations: proposer } = ctx.window;

let echecs = 0, total = 0;
const verifier = (nom, obtenu, attendu) => {
  total++;
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(`  ${ok ? '✓' : '✗'} ${nom}` + (ok ? '' : `\n      attendu : ${JSON.stringify(attendu)}\n      obtenu  : ${JSON.stringify(obtenu)}`));
};
const court = (t) => { const l = lire(t); return l ? [l.nom, l.numeros, l.solo] : null; };

console.log('\n1. Lire les 25 valeurs réelles de musiciens.instrument');
[
  ['', null],
  ['Accordeon', ['Accordéon', [], false]],
  ['Guitare', ['Guitare', [], false]],
  ['Piano', ['Piano', [], false]],
  ['Voix', ['Voix', [], false]],
  ['Basson', ['Basson', [], false]],
  ['Clarinette', ['Clarinette', [], false]],
  ['Flutes', ['Flûte', [], false]],
  ['Flûtes', ['Flûte', [], false]],
  ['Hautbois', ['Hautbois', [], false]],
  ['Saxophone', ['Saxophone', [], false]],
  ['Alto', ['Alto', [], false]],
  ['Altos', ['Alto', [], false]],
  ['Contrebasse', ['Contrebasse', [], false]],
  ['Contrebasses', ['Contrebasse', [], false]],
  ['Violon 2', ['Violon', [2], false]],
  ['Violon solo', ['Violon', [], true]],
  ['Violoncelle solo', ['Violoncelle', [], true]],
  ['Violoncelles', ['Violoncelle', [], false]],
  ['Violoncelles ', ['Violoncelle', [], false]],
  ['Violons', ['Violon', [], false]],
  ['Cor', ['Cor', [], false]],
  ['Saxhorn', ['Saxhorn', [], false]],
  ['Trombone', ['Trombone', [], false]],
  ['Percussions', ['Percussion', [], false]],
].forEach(([t, att]) => verifier(JSON.stringify(t), court(t), att));

console.log('\n2. Lire les noms de parties — Dorico, français, italien, numéros');
[
  ['WZO – 540 Violoncello1', ['Violoncelle', [1], false]],
  ['WZO – 550 Violoncello2', ['Violoncelle', [2], false]],
  ['WZO – 560 DoubleBass', ['Contrebasse', [], false]],
  ['120 Oboe', ['Hautbois', [], false]],
  ['510 Violin1', ['Violon', [1], false]],
  ['Violin II', ['Violon', [2], false]],
  ['Cor 1-2', ['Cor', [1, 2], false]],
  ['Cor 3-4', ['Cor', [3, 4], false]],
  ['EXP33 - Cor 3-4 - v2', ['Cor', [3, 4], false]],
  ['2e violon', ['Violon', [2], false]],
  ['Second Violin', ['Violon', [2], false]],
  ['Premier cor', ['Cor', [1], false]],
  ['Alto Flute', ['Flûte alto', [], false]],
  ['Bass Clarinet', ['Clarinette basse', [], false]],
  ['Cor anglais', ['Cor anglais', [], false]],
  ['English Horn', ['Cor anglais', [], false]],
  ['Violini I', ['Violon', [1], false]],
  ['Corni 1-2', ['Cor', [1, 2], false]],
  ['Timbales', ['Timbales', [], false]],
  ['Timpani', ['Timbales', [], false]],
  ['Conducteur', ['Conducteur', [], false]],
  ['Full score', ['Conducteur', [], false]],
  ['Guitare basse', ['Guitare basse', [], false]],
  ['Tutti', null],
  ['Coronation Anthem - Violin 1', ['Violon', [1], false]],
  ['Trompette 1 in C', ['Trompette', [1], false]],
  // Le préfixe nomme un instrument : c'est le dernier segment qui compte.
  ['Concerto pour violon – Flûte 1', ['Flûte', [1], false]],
  ['Concerto pour piano - Violon 1', ['Violon', [1], false]],
  ['Horn Concerto - Violin 1', ['Violon', [1], false]],
  // Le registre qualifie, il ne nomme pas.
  ['Sax alto', ['Saxophone', [], false]],
  ['Alto Sax', ['Saxophone', [], false]],
  ['Sax alto 1', ['Saxophone', [1], false]],
  ['Tenor Trombone', ['Trombone', [], false]],
  ['Alto Clarinet', ['Clarinette', [], false]],
  ['Partition piano', ['Piano', [], false]],
  ['Conductor', ['Conducteur', [], false]],
  ['Conductor Score', ['Conducteur', [], false]],
  // Les pluriels, mot par mot.
  ['Cors anglais', ['Cor anglais', [], false]],
  ['Double Basses', ['Contrebasse', [], false]],
  ['Bass Clarinets', ['Clarinette basse', [], false]],
  ['Contrabass Clarinet', ['Clarinette contrebasse', [], false]],
  // Les numéros, quel que soit le signe entre eux.
  ['Cor 1,2', ['Cor', [1, 2], false]],
  ['Cor 1/2', ['Cor', [1, 2], false]],
  ['Cor (1-2)', ['Cor', [1, 2], false]],
  ['Oboe I, II', ['Hautbois', [1, 2], false]],
  ['Cor 1 & 2', ['Cor', [1, 2], false]],
].forEach(([t, att]) => verifier(JSON.stringify(t), court(t), att));

console.log('\n2b. Les alias ne changent pas la glose des noms déjà connus');
verifier('« Contrabass clarinet » glosé en allemand', ctx.window.partitionsNomTraduit('Contrabass clarinet', 'de'), 'Kontrabassklarinette');
verifier('« Cor 1-2 » glosé en anglais, comme avant', ctx.window.partitionsNomTraduit('Cor 1-2', 'en'), 'Horn 1-2');
verifier('« Violoncello2 » glosé en anglais, comme avant', ctx.window.partitionsNomTraduit('Violoncello2', 'en'), 'Cello2');

/* Un jeu sorti de Dorico, tel qu'il arrive : anglais, numéros collés. */
const P = (id, nom, pupitre) => ({ id, nom, pupitre });
const parties = [
  P('ob', 'WZO – 120 Oboe', 'Bois'),
  P('cl', 'WZO – 130 Clarinet', 'Bois'),
  P('bn', 'WZO – 140 Bassoon', 'Bois'),
  P('hn12', 'WZO – 210 Horn 1-2', 'Cuivres'),
  P('hn34', 'WZO – 220 Horn 3-4', 'Cuivres'),
  P('tbn', 'WZO – 240 Trombone', 'Cuivres'),
  P('timp', 'WZO – 310 Timpani', 'Percussions'),
  P('perc', 'WZO – 320 Percussion', 'Percussions'),
  P('pno', 'WZO – 410 Piano', 'Autre'),
  P('vn1', 'WZO – 510 Violin1', 'Cordes'),
  P('vn2', 'WZO – 520 Violin2', 'Cordes'),
  P('va', 'WZO – 530 Viola', 'Cordes'),
  P('vc1', 'WZO – 540 Violoncello1', 'Cordes'),
  P('vc2', 'WZO – 550 Violoncello2', 'Cordes'),
  P('db', 'WZO – 560 DoubleBass', 'Cordes'),
  P('sc', 'WZO – 000 Full score', 'Autre'),
  P('sop', 'Soprano', 'Chœur'),
  P('alt', 'Alto', 'Chœur'),
];
const M = (id, nom, pupitre, instrument, extra) => Object.assign(
  { personType: 'musicien', personId: id, nom, pupitre, instrument, nbDates: 2 }, extra || {});
const effectif = [
  M('m-ob', 'Coralie', 'Bois', 'Hautbois'),
  M('m-cl', 'Alberto', 'Bois', 'Clarinette'),
  M('m-fl', 'Christelle', 'Bois', 'Flûtes'),          // aucune flûte dans ce jeu → à choisir dans les bois
  M('m-bn', 'Nil', 'Bois', 'Basson'),
  M('m-hn-a', 'Elodie', 'Cuivres', 'Cor'),             // deux parties de cor, pas de numéro → les deux
  M('m-hn-b', 'Hugo', 'Cuivres', 'Cor 3'),             // le 3 restreint
  M('m-hn-c', 'Camille', 'Cuivres', 'Premier cor'),    // l'ordinal devant restreint
  M('m-tbn', 'Abel', 'Cuivres', 'Trombone'),
  M('m-sxh', 'Amelie', 'Cuivres', 'Saxhorn'),          // pas de saxhorn → à choisir dans les cuivres
  M('m-perc', 'Théo', 'Percussions', 'Percussions'),   // une seule « Percussion » ; les timbales ne lui sont pas proposées
  M('m-pno', 'Lou', 'Autre', 'Piano'),
  M('m-vn-solo', 'Alec', 'Cordes', 'Violon solo'),     // le violon solo a tout
  M('m-vn2', 'Mariane', 'Cordes', 'Violon 2'),         // le numéro restreint
  M('m-vn', 'Sacha', 'Cordes', 'Violons'),             // les deux
  M('m-va', 'Jules', 'Cordes', 'Altos'),               // Viola, PAS la voix d'alto du chœur
  M('m-vc-solo', 'Inès', 'Cordes', 'Violoncelle solo'),// le violoncelle solo a tout
  M('m-vc', 'Paul', 'Cordes', 'Violoncelles '),        // les deux
  M('m-db', 'Lilas', 'Cordes', 'Contrebasses'),        // DoubleBass
  M('m-voix', 'Rose', 'Chant', 'Voix'),                // rien : les voix sont au chœur, exclues
  M('m-chef', 'Léo', "Chef d'orchestre", ''),          // Full score
  M('m-vide', 'Anonyme', 'Autre', ''),                 // sans proposition : « Autre » ne dit rien
  M('m-deja', 'Déjà', 'Cordes', 'Violon 2'),           // déjà servi : jamais touché
  M('m-hors', 'Fantôme', 'Cordes', 'Alto', { horsEffectif: true, nbDates: 0 }),
  Object.assign(M('t-1', 'Régie', '', ''), { personType: 'technicien' }),
];
const affectations = [
  { id: 'op::vn2::m-deja', tourneeId: 'op', partieId: 'vn2', personType: 'musicien', personId: 'm-deja' },
  { id: 'op::hn12::x', tourneeId: 'op', partieId: 'hn12', personType: 'musicien', personId: 'x' },
];

console.log('\n3. Proposer — chacun reçoit les parties de son instrument');
const prop = proposer(parties, effectif, affectations);
const prop_ = Object.fromEntries(prop.proposees.map(x => [x.personne.personId, x.parties.map(p => p.id)]));
const motifs = Object.fromEntries(prop.proposees.map(x => [x.personne.personId, x.motif]));
const choix = Object.fromEntries(prop.aChoisir.map(x => [x.personne.personId, x.choix.map(p => p.id)]));
const sans = prop.sansProposition.map(x => x.personne.personId);

verifier('proposées', prop_, {
  'm-ob': ['ob'], 'm-cl': ['cl'], 'm-bn': ['bn'],
  'm-hn-a': ['hn12', 'hn34'],          // « Cor » : les deux, le pupitre décide
  'm-hn-b': ['hn34'],                  // « Cor 3 » : le numéro restreint
  'm-hn-c': ['hn12'],                  // « Premier cor »
  'm-tbn': ['tbn'], 'm-perc': ['perc'], 'm-pno': ['pno'],
  'm-vn-solo': ['vn1', 'vn2'],         // le violon solo a tout
  'm-vn2': ['vn2'],                    // « Violon 2 » : le numéro restreint
  'm-vn': ['vn1', 'vn2'],              // « Violons » : les deux
  'm-va': ['va'], 'm-vc-solo': ['vc1', 'vc2'], 'm-vc': ['vc1', 'vc2'], 'm-db': ['db'],
  'm-chef': ['sc'],
});
verifier('motifs', [motifs['m-ob'], motifs['m-hn-a'], motifs['m-hn-b'], motifs['m-chef']],
  ['la seule partie « Hautbois »', 'toutes les parties « Cor » — le pupitre décide', 'le 3 de la fiche', 'le conducteur, pour le chef']);
verifier('à choisir — flûte sans partie : les autres bois', choix['m-fl'], ['ob', 'cl', 'bn']);
verifier('à choisir — saxhorn sans partie : les cuivres, la partie déjà lue en queue', choix['m-sxh'], ['hn34', 'tbn', 'hn12']);
verifier('sans proposition', sans, ['m-voix', 'm-vide']);
verifier('déjà servis : comptés, jamais proposés', prop.dejaServis, 1);
verifier('techniciens : comptés, jamais proposés', prop.techniciens, 1);
verifier('hors effectif : ni proposé ni compté', [prop_['m-hors'], choix['m-hors'], sans.includes('m-hors')], [undefined, undefined, false]);
verifier('la voix d’alto du chœur ne reçoit jamais un altiste',
  prop.proposees.some(x => x.parties.some(p => p.id === 'alt' || p.id === 'sop')), false);
verifier('le conducteur ne va qu’au chef',
  prop.proposees.filter(x => x.parties.some(p => p.id === 'sc')).map(x => x.personne.personId), ['m-chef']);
verifier('ordre : celui de l’effectif', prop.proposees.map(x => x.personne.personId),
  ['m-ob', 'm-cl', 'm-bn', 'm-hn-a', 'm-hn-b', 'm-hn-c', 'm-tbn', 'm-perc', 'm-pno', 'm-vn-solo', 'm-vn2', 'm-vn', 'm-va', 'm-vc-solo', 'm-vc', 'm-db', 'm-chef']);

console.log('\n4. Cas limites');
const seules = (p) => p.proposees.map(x => x.parties.map(q => q.id));
verifier('un seul cor, fiche « Cor 3 » : la seule partie',
  seules(proposer([P('hn', 'Cor', 'Cuivres')], [M('a', 'A', 'Cuivres', 'Cor 3')], [])), [['hn']]);
verifier('un seul violon numéroté 1, fiche « Violon 2 » : la seule partie quand même',
  seules(proposer([P('vn1', 'Violin1', 'Cordes')], [M('a', 'A', 'Cordes', 'Violon 2')], [])), [['vn1']]);
verifier('deux parties portent le même numéro : les deux',
  seules(proposer([P('a', 'Violon 1 divisi a', 'Cordes'), P('b', 'Violon 1 divisi b', 'Cordes'), P('c', 'Violon 2', 'Cordes')],
    [M('m', 'M', 'Cordes', 'Violon 1')], [])), [['a', 'b']]);
verifier('une partie « Violon solo » ne va pas aux tutti',
  seules(proposer([P('s', 'Violon solo', 'Cordes'), P('v1', 'Violon 1', 'Cordes'), P('v2', 'Violon 2', 'Cordes')],
    [M('a', 'A', 'Cordes', 'Violons')], [])), [['v1', 'v2']]);
verifier('… mais au violon solo, avec le reste',
  seules(proposer([P('s', 'Violon solo', 'Cordes'), P('v1', 'Violon 1', 'Cordes'), P('v2', 'Violon 2', 'Cordes')],
    [M('a', 'A', 'Cordes', 'Violon solo')], [])), [['s', 'v1', 'v2']]);
verifier('deux pupitres instrumentaux différents ne se répondent pas : partie rangée aux Bois, altiste des Cordes',
  (() => { const p = proposer([P('x', 'Alto', 'Bois')], [M('a', 'A', 'Cordes', 'Altos')], []); return [p.proposees.length, p.sansProposition.length]; })(),
  [0, 1]);
verifier('la partie de même pupitre reste proposée en choix quand la lecture du nom ne suffit pas',
  (() => { const p = proposer([P('x', 'Alto', 'Bois'), P('y', 'Violon', 'Cordes')], [M('a', 'A', 'Cordes', 'Altos')], []);
    return p.aChoisir.map(t => t.choix.map(q => q.id)); })(), [['y']]);
verifier('un alto (voix) en pupitre Chant ne prend pas la partie d’alto (cordes)',
  (() => { const p = proposer([P('va', 'Alto', 'Cordes')], [M('m', 'M', 'Chant', 'Alto')], []); return [p.proposees.length, p.sansProposition.length]; })(),
  [0, 1]);
verifier('pupitre vide côté partie : l’instrument suffit',
  seules(proposer([P('va', 'Alto', '')], [M('m', 'M', 'Cordes', 'Altos')], [])), [['va']]);
verifier('partie « Chef d’orchestre » par pupitre, même sans nom connu',
  seules(proposer([P('x', 'WZO', "Chef d'orchestre")], [M('m', 'M', "Chef d'orchestre", '')], [])), [['x']]);
verifier('effectif vide, parties vides : rien ne casse',
  proposer([], [], []), { proposees: [], aChoisir: [], sansProposition: [], dejaServis: 0, techniciens: 0 });

console.log(`\n${total - echecs}/${total} vérifications passent${echecs ? ` — ${echecs} ÉCHEC(S)` : ''}.`);
process.exit(echecs ? 1 : 0);
