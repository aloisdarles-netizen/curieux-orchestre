/* TEST — les tâches de l'équipe : ancres, échéances, états, tâches automatiques.

   Ce qui doit tenir, et qu'aucun écran ne montre d'un coup :
   — l'ancre « 1re répétition » trouve la répétition (ou la résidence, ou la
     répétition d'un recording), et se rabat sur la 1re date quand il n'y en a
     pas encore ;
   — une échéance calée sur le projet SUIT le projet quand ses dates bougent ;
   — la génération ne crée rien deux fois, ne recrée jamais une tâche écartée,
     n'engendre rien pour un projet en option (sauf réglage contraire), annulé,
     ou déjà commencé ;
   — l'état d'une tâche mère se déduit de ses sous-tâches ;
   — « aujourd'hui » est la date locale, pas celle de Greenwich.

     node outils/test-taches-commun.cjs                                       */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets', 'taches-commun.js'), 'utf8'), ctx);
const T = ctx.window.CurieuxTaches;

let echecs = 0, total = 0;
const verifier = (nom, obtenu, attendu) => {
  total++;
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(`  ${ok ? '✓' : '✗'} ${nom}` + (ok ? '' : `\n      attendu : ${JSON.stringify(attendu)}\n      obtenu  : ${JSON.stringify(obtenu)}`));
};

const AUJ = '2026-09-23';
const REGLAGE = {
  declencheur: 'validee',
  modeles: [
    { id: 'envoi-partitions', libelle: 'Envoi des partitions numériques aux musicien·nes', ancre: 'premiere_repetition', j: 21, actif: true, lien: 'partitions' },
    { id: 'edition-partitions', libelle: 'Édition des partitions', ancre: 'premiere_repetition', j: 7, actif: true, lien: 'partitions' },
    { id: 'impression-partitions', libelle: 'Impression des partitions', ancre: 'premiere_repetition', j: 2, actif: true, lien: 'partitions' },
  ],
};

// Le projet de la demande : deux répétitions, puis le concert du 22 octobre.
const octobre = {
  id: 'oct', nom: 'Concert du 22 octobre', type: 'tournee', dates: [
    { id: 'd3', date: '2026-10-22', type: 'concert', statut: 'validee' },
    { id: 'd1', date: '2026-10-20', type: 'repetition', statut: 'validee' },
    { id: 'd2', date: '2026-10-21', type: 'repetition', statut: 'validee' },
  ],
};
const parId = (...projets) => new Map(projets.map(p => [p.id, p]));

console.log('\n1. Les ancres');
verifier('1re répétition : le 20, pas le 22', T.dateAncre(octobre, 'premiere_repetition'), { date: '2026-10-20', repli: false });
verifier('1er concert', T.dateAncre(octobre, 'premier_concert'), { date: '2026-10-22', repli: false });
verifier('1re date', T.dateAncre(octobre, 'premiere_date'), { date: '2026-10-20', repli: false });
verifier('dernière date', T.dateAncre(octobre, 'derniere_date'), { date: '2026-10-22', repli: false });
verifier('une résidence compte comme une répétition (tournée)',
  T.dateAncre({ id: 'r', type: 'tournee', dates: [{ date: '2026-11-10', type: 'concert' }, { date: '2026-11-05', type: 'residence' }] }, 'premiere_repetition'),
  { date: '2026-11-05', repli: false });
verifier('recording : la répétition, pas la prise',
  T.dateAncre({ id: 'rec', type: 'recording', dates: [{ date: '2026-12-02', type: 'prise' }, { date: '2026-12-01', type: 'repetition' }] }, 'premiere_repetition'),
  { date: '2026-12-01', repli: false });
verifier('recording : « 1er concert » est la 1re prise',
  T.dateAncre({ id: 'rec', type: 'recording', dates: [{ date: '2026-12-02', type: 'prise' }, { date: '2026-12-01', type: 'repetition' }] }, 'premier_concert'),
  { date: '2026-12-02', repli: false });
verifier('pas encore de répétition : repli sur la 1re date, signalé',
  T.dateAncre({ id: 'x', dates: [{ date: '2026-11-15', type: 'concert' }] }, 'premiere_repetition'),
  { date: '2026-11-15', repli: true });
verifier('une date sans nature est un concert',
  T.dateAncre({ id: 'x', dates: [{ date: '2026-11-15' }] }, 'premier_concert'),
  { date: '2026-11-15', repli: false });
verifier('une répétition annulée ne compte plus',
  T.dateAncre({ id: 'x', dates: [{ date: '2026-11-01', type: 'repetition', statut: 'annulee' }, { date: '2026-11-03', type: 'repetition', statut: 'validee' }] }, 'premiere_repetition'),
  { date: '2026-11-03', repli: false });
verifier('tout annulé : aucune ancre',
  T.dateAncre({ id: 'x', dates: [{ date: '2026-11-01', statut: 'annulee' }] }, 'premiere_repetition'), null);
verifier('ancre inconnue : rien', T.dateAncre(octobre, 'n_importe_quoi'), null);

console.log('\n2. Les échéances');
const envoi = { id: 'auto::oct::envoi-partitions', tourneeId: 'oct', ancre: 'premiere_repetition', j: 21 };
verifier('J-21 avant le 20 octobre = 29 septembre', T.echeanceDe(envoi, parId(octobre)).date, '2026-09-29');
verifier('J négatif = après : J+2 après la dernière date',
  T.echeanceDe({ tourneeId: 'oct', ancre: 'derniere_date', j: -2 }, parId(octobre)).date, '2026-10-24');
const avance = JSON.parse(JSON.stringify(octobre));
avance.dates.find(d => d.id === 'd1').date = '2026-10-13';
verifier('la répétition avance d\'une semaine : la tâche suit', T.echeanceDe(envoi, parId(avance)).date, '2026-09-22');
verifier('projet supprimé : échéance perdue', T.echeanceDe(envoi, parId()).perdue, true);
verifier('date fixe', T.echeanceDe({ echeance: '2026-10-01' }, parId()).date, '2026-10-01');
verifier('sans échéance', T.echeanceDe({}, parId()).source, 'aucune');
verifier('passage de mois et d\'année', T.ajouterJours('2026-12-30', 3), '2027-01-02');

console.log('\n3. La génération automatique');
const gen1 = T.tachesAutoManquantes([octobre], [], REGLAGE, AUJ);
verifier('trois tâches pour le projet du 22 octobre', gen1.map(t => t.id), [
  'auto::oct::envoi-partitions', 'auto::oct::edition-partitions', 'auto::oct::impression-partitions']);
verifier('elles portent ancre, jours et règle', [gen1[0].ancre, gen1[0].j, gen1[0].modele, gen1[0].genre, gen1[0].statut],
  ['premiere_repetition', 21, 'envoi-partitions', 'equipe', 'a_faire']);
verifier('deuxième passage : rien de plus', T.tachesAutoManquantes([octobre], gen1, REGLAGE, AUJ), []);
const ecartee = gen1.map(t => t.modele === 'edition-partitions' ? Object.assign({}, t, { statut: 'ecartee' }) : t);
verifier('une tâche écartée ne renaît pas', T.tachesAutoManquantes([octobre], ecartee, REGLAGE, AUJ), []);
const enOption = { id: 'opt', dates: [{ date: '2026-11-20', type: 'repetition', statut: 'option' }] };
verifier('projet en option : rien (déclencheur « validée »)', T.tachesAutoManquantes([enOption], [], REGLAGE, AUJ).length, 0);
verifier('projet en option : trois (déclencheur « option »)',
  T.tachesAutoManquantes([enOption], [], Object.assign({}, REGLAGE, { declencheur: 'option' }), AUJ).length, 3);
verifier('date à l\'étude : rien, même en « option »',
  T.tachesAutoManquantes([{ id: 'etu', dates: [{ date: '2026-11-20', statut: 'recherche' }] }], [], Object.assign({}, REGLAGE, { declencheur: 'option' }), AUJ).length, 0);
verifier('projet annulé : rien',
  T.tachesAutoManquantes([{ id: 'ann', dates: [{ date: '2026-11-20', type: 'repetition', statut: 'annulee' }] }], [], REGLAGE, AUJ).length, 0);
verifier('projet déjà commencé (ancre passée) : rien',
  T.tachesAutoManquantes([{ id: 'vieux', dates: [{ date: '2026-09-10', type: 'repetition', statut: 'validee' }, { date: '2026-10-01', type: 'concert', statut: 'validee' }] }], [], REGLAGE, AUJ).length, 0);
const serre = { id: 'serre', dates: [{ date: '2026-10-03', type: 'repetition', statut: 'validee' }] };
const genSerre = T.tachesAutoManquantes([serre], [], REGLAGE, AUJ);
verifier('projet signé 10 jours avant : les trois naissent, l\'envoi déjà en retard',
  [genSerre.length, T.enRetard(genSerre, parId(serre), AUJ).map(t => t.modele)], [3, ['envoi-partitions']]);
verifier('une règle désactivée n\'engendre rien',
  T.tachesAutoManquantes([octobre], [], { declencheur: 'validee', modeles: [Object.assign({}, REGLAGE.modeles[0], { actif: false })] }, AUJ), []);
verifier('une règle bancale est ignorée',
  T.tachesAutoManquantes([octobre], [], { modeles: [{ id: 'x', libelle: '', ancre: 'premiere_repetition', j: 3 }, { id: 'Y Z', libelle: 'a', ancre: 'premiere_repetition', j: 3 }, { id: 'ok', libelle: 'a', ancre: 'lune', j: 3 }] }, AUJ), []);
verifier('réglage absent : rien (jamais de défaut inventé)', T.tachesAutoManquantes([octobre], [], null, AUJ), []);
verifier('aperçu d\'une règle', T.apercuReglage([octobre, serre, enOption], [], REGLAGE, AUJ), { taches: 6, projets: 2 });

console.log('\n4. Les sous-tâches et l\'état déduit');
const mere = { id: 'm', genre: 'equipe', statut: 'a_faire', libelle: 'Arrangements' };
const e = (id, statut, ordre) => ({ id, genre: 'equipe', parentId: 'm', statut, ordre });
verifier('sans sous-tâche : son propre état', T.statutEffectif(Object.assign({}, mere, { statut: 'en_cours' }), []), 'en_cours');
verifier('rien de commencé : à faire', T.statutEffectif(mere, [e('a', 'a_faire'), e('b', 'a_faire')]), 'a_faire');
verifier('une faite sur deux : en cours', T.statutEffectif(mere, [e('a', 'fait'), e('b', 'a_faire')]), 'en_cours');
verifier('toutes faites : fait', T.statutEffectif(mere, [e('a', 'fait'), e('b', 'fait')]), 'fait');
verifier('une écartée ne retient pas la mère', T.statutEffectif(mere, [e('a', 'fait'), e('b', 'ecartee')]), 'fait');
verifier('progression 1/2 (l\'écartée ne compte pas)', T.progression([e('a', 'fait'), e('b', 'a_faire'), e('c', 'ecartee')]), { faits: 1, total: 2 });
const liste = [mere, e('b', 'a_faire', 2), e('a', 'a_faire', 1), e('c', 'a_faire', 1)];
verifier('l\'ordre des sous-tâches', T.enfantsParParent(liste).get('m').map(x => x.id), ['a', 'c', 'b']);
verifier('l\'échéance d\'une sous-tâche ouverte presse la mère',
  T.echeancePressante(Object.assign({}, mere, { echeance: '2026-10-22' }), [Object.assign(e('a', 'a_faire'), { echeance: '2026-10-03' }), Object.assign(e('b', 'fait'), { echeance: '2026-09-01' })], parId()),
  '2026-10-03');
verifier('cycle de l\'état', [T.statutSuivant('a_faire'), T.statutSuivant('en_cours'), T.statutSuivant('fait')], ['en_cours', 'fait', 'a_faire']);

console.log('\n5. Les retards');
const retard = [
  { id: 'r1', genre: 'equipe', statut: 'a_faire', echeance: '2026-09-20' },
  { id: 'r2', genre: 'equipe', statut: 'fait', echeance: '2026-09-20' },
  { id: 'r3', genre: 'equipe', statut: 'a_faire', echeance: '2026-09-23' },
  { id: 'r4', genre: 'technique', fait: false, echeance: '2026-09-01' },
  { id: 'r5', genre: 'equipe', statut: 'a_faire', echeance: '2026-09-01', tourneeId: 'ann' },
  { id: 'r6', genre: 'equipe', statut: 'a_faire', echeance: '2026-12-01' },
  { id: 'r7', genre: 'equipe', parentId: 'r6', statut: 'en_cours', echeance: '2026-09-15' },
];
const annule = { id: 'ann', dates: [{ date: '2026-10-01', statut: 'annulee' }] };
verifier('en retard : la tâche échue et la mère d\'une sous-tâche échue — pas la faite, pas celle du jour, pas la technique, pas celle d\'un projet annulé',
  T.enRetard(retard, parId(annule), AUJ).map(t => t.id), ['r1', 'r6']);

console.log('\n6. Aujourd\'hui, à l\'heure de Paris');
process.env.TZ = 'Europe/Paris';
verifier('00 h 30 à Paris le 24 = le 24 (Greenwich dirait encore le 23)',
  T.aujourdhuiLocal(new Date('2026-09-23T22:30:00Z')), '2026-09-24');

console.log('\n7. Les liens');
verifier('lien partitions', T.lienDe(gen1[0], octobre, REGLAGE), { href: 'partitions.html?operation=oct', libelle: 'Ouvrir les partitions' });
verifier('lien projet d\'un recording',
  T.lienProjet({ id: 'r 1', type: 'recording' }), 'tournees.html?type=recording#tournee-r%201');
verifier('une tâche manuelle n\'a pas de lien de règle', T.lienDe({ id: 'x' }, octobre, REGLAGE), null);

console.log(`\n${total - echecs} / ${total} vérifications passent.${echecs ? ' ÉCHEC.' : ''}\n`);
process.exit(echecs ? 1 : 0);
