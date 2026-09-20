/* TEST — la proposition d'affectation d'après les instruments.

   Deux choses à tenir. D'abord la LECTURE du texte libre : les 26 valeurs
   réelles de musiciens.instrument (pluriels, accents, espace final, « Violon
   solo », « Violon 2 ») et les formes de Dorico côté parties (« Violoncello1 »,
   « DoubleBass », « 120 Oboe ») doivent tomber sur le même instrument. Ensuite
   la PROPOSITION : ce qui est sûr, ce qui est probable, ce qui se demande, et
   ce qui ne se devine pas — et surtout ce qu'on ne touche jamais.

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

console.log('\n1. Lire les 26 valeurs réelles de musiciens.instrument');
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
].forEach(([t, att]) => verifier(JSON.stringify(t), court(t), att));

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
  M('m-fl', 'Christelle', 'Bois', 'Flûtes'),          // aucune flûte dans ce jeu → autres du pupitre
  M('m-bn', 'Nil', 'Bois', 'Basson'),
  M('m-hn-a', 'Elodie', 'Cuivres', 'Cor'),             // deux parties de cor, pas de numéro → à trancher
  M('m-hn-b', 'Hugo', 'Cuivres', 'Cor 3'),             // le 3 tranche
  M('m-hn-c', 'Camille', 'Cuivres', 'Premier cor'),    // l'ordinal devant tranche
  M('m-tbn', 'Abel', 'Cuivres', 'Trombone'),
  M('m-sxh', 'Amelie', 'Cuivres', 'Saxhorn'),          // pas de saxhorn → autres du pupitre
  M('m-perc', 'Théo', 'Percussions', 'Percussions'),   // une seule « Percussion » ; timbales en « même pupitre »
  M('m-pno', 'Lou', 'Autre', 'Piano'),
  M('m-vn-solo', 'Alec', 'Cordes', 'Violon solo'),     // probable → Violin1
  M('m-vn2', 'Mariane', 'Cordes', 'Violon 2'),         // sûr → Violin2
  M('m-vn', 'Sacha', 'Cordes', 'Violons'),             // à trancher entre 1 et 2
  M('m-va', 'Jules', 'Cordes', 'Altos'),               // sûr → Viola, PAS la voix d'alto du chœur
  M('m-vc-solo', 'Inès', 'Cordes', 'Violoncelle solo'),// probable → Violoncello1
  M('m-vc', 'Paul', 'Cordes', 'Violoncelles '),        // à trancher entre 1 et 2
  M('m-db', 'Lilas', 'Cordes', 'Contrebasses'),        // sûr → DoubleBass
  M('m-voix', 'Rose', 'Chant', 'Voix'),                // rien : les voix sont au chœur, exclues
  M('m-chef', 'Léo', "Chef d'orchestre", ''),          // sûr → Full score
  M('m-vide', 'Anonyme', 'Autre', ''),                 // sans proposition : « Autre » ne dit rien
  M('m-deja', 'Déjà', 'Cordes', 'Violon 2'),           // déjà servi : jamais touché
  M('m-hors', 'Fantôme', 'Cordes', 'Alto', { horsEffectif: true, nbDates: 0 }),
  Object.assign(M('t-1', 'Régie', '', ''), { personType: 'technicien' }),
];
const affectations = [
  { id: 'op::vn2::m-deja', tourneeId: 'op', partieId: 'vn2', personType: 'musicien', personId: 'm-deja' },
  { id: 'op::hn12::x', tourneeId: 'op', partieId: 'hn12', personType: 'musicien', personId: 'x' },
];

console.log('\n3. Proposer');
const prop = proposer(parties, effectif, affectations);
const sure = Object.fromEntries(prop.sures.map(x => [x.personne.personId, x.partie.id]));
const prob = Object.fromEntries(prop.probables.map(x => [x.personne.personId, x.partie.id]));
const tran = Object.fromEntries(prop.aTrancher.map(x => [x.personne.personId, { memes: x.memes.map(p => p.id), autres: x.autres.map(p => p.id) }]));
const sans = prop.sansProposition.map(x => x.personne.personId);

verifier('sûres', sure, {
  'm-ob': 'ob', 'm-cl': 'cl', 'm-bn': 'bn', 'm-hn-b': 'hn34', 'm-hn-c': 'hn12', 'm-tbn': 'tbn',
  'm-perc': 'perc', 'm-pno': 'pno', 'm-vn2': 'vn2', 'm-va': 'va', 'm-db': 'db', 'm-chef': 'sc',
});
verifier('probables', prob, { 'm-vn-solo': 'vn1', 'm-vc-solo': 'vc1' });
verifier('à trancher — cor sans numéro : le 3-4 (sans lecteur) en tête', tran['m-hn-a'], { memes: ['hn34', 'hn12'], autres: ['tbn'] });
verifier('à trancher — violons', tran['m-vn'], { memes: ['vn1', 'vn2'], autres: ['va', 'vc1', 'vc2', 'db'] });
verifier('à trancher — violoncelles : le Violin2 déjà lu passe en queue', tran['m-vc'], { memes: ['vc1', 'vc2'], autres: ['vn1', 'va', 'db', 'vn2'] });
verifier('à trancher — flûte sans partie : les autres bois', tran['m-fl'], { memes: [], autres: ['ob', 'cl', 'bn'] });
verifier('à trancher — saxhorn sans partie : les autres cuivres', tran['m-sxh'], { memes: [], autres: ['hn34', 'tbn', 'hn12'] });
verifier('sans proposition', sans, ['m-voix', 'm-vide']);
verifier('déjà servis : comptés, jamais proposés', prop.dejaServis, 1);
verifier('techniciens : comptés, jamais proposés', prop.techniciens, 1);
verifier('hors effectif : ni proposé ni compté', [sure['m-hors'], prob['m-hors'], tran['m-hors'], sans.includes('m-hors')], [undefined, undefined, undefined, false]);
verifier('la voix d’alto du chœur ne reçoit jamais un altiste',
  [...prop.sures, ...prop.probables].some(x => x.partie.id === 'alt' || x.partie.id === 'sop'), false);
verifier('le conducteur ne va qu’au chef',
  [...prop.sures, ...prop.probables].filter(x => x.partie.id === 'sc').map(x => x.personne.personId), ['m-chef']);
verifier('ordre : celui de l’effectif', prop.sures.map(x => x.personne.personId),
  ['m-ob', 'm-cl', 'm-bn', 'm-hn-b', 'm-hn-c', 'm-tbn', 'm-perc', 'm-pno', 'm-vn2', 'm-va', 'm-db', 'm-chef']);

console.log('\n4. Cas limites');
verifier('un seul cor, fiche « Cor 3 » : sûr — il n\u2019y a que celui-là',
  (() => { const p = proposer([P('hn', 'Cor', 'Cuivres')], [M('a', 'A', 'Cuivres', 'Cor 3')], []); return [p.sures.map(x => x.partie.id), p.probables.length]; })(),
  [['hn'], 0]);
verifier('un seul violon, numéroté 1, fiche « Violon 2 » : probable, numéroté autrement',
  (() => { const p = proposer([P('vn1', 'Violin1', 'Cordes')], [M('a', 'A', 'Cordes', 'Violon 2')], []); return [p.sures.length, p.probables.map(x => x.partie.id)]; })(),
  [0, ['vn1']]);
verifier('deux parties portent le même numéro : à trancher entre elles',
  (() => { const p = proposer([P('a', 'Violon 1 divisi a', 'Cordes'), P('b', 'Violon 1 divisi b', 'Cordes'), P('c', 'Violon 2', 'Cordes')],
    [M('m', 'M', 'Cordes', 'Violon 1')], []); return p.aTrancher.map(x => x.memes.map(q => q.id)); })(),
  [['a', 'b']]);
verifier('violon solo sans « 1 » nulle part : à trancher, pas probable',
  (() => { const p = proposer([P('a', 'Violon A', 'Cordes'), P('b', 'Violon B', 'Cordes')], [M('m', 'M', 'Cordes', 'Violon solo')], []);
    return [p.probables.length, p.aTrancher.length]; })(),
  [0, 1]);
verifier('un alto (voix) en pupitre Chant ne prend pas la partie d’alto (cordes)',
  (() => { const p = proposer([P('va', 'Alto', 'Cordes')], [M('m', 'M', 'Chant', 'Alto')], []); return [p.sures.length, p.sansProposition.length]; })(),
  [0, 1]);
verifier('pupitre vide côté partie : l’instrument suffit',
  (() => { const p = proposer([P('va', 'Alto', '')], [M('m', 'M', 'Cordes', 'Altos')], []); return p.sures.map(x => x.partie.id); })(),
  ['va']);
verifier('partie « Chef d’orchestre » par pupitre, même sans nom connu',
  (() => { const p = proposer([P('x', 'WZO', "Chef d'orchestre")], [M('m', 'M', "Chef d'orchestre", '')], []); return p.sures.map(x => x.partie.id); })(),
  ['x']);
verifier('effectif vide, parties vides : rien ne casse',
  proposer([], [], []), { sures: [], probables: [], aTrancher: [], sansProposition: [], dejaServis: 0, techniciens: 0 });

console.log(`\n${total - echecs}/${total} vérifications passent${echecs ? ` — ${echecs} ÉCHEC(S)` : ''}.`);
process.exit(echecs ? 1 : 0);
