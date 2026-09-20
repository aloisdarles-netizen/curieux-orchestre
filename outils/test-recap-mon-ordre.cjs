/* TEST — « Mon ordre » mêle titulaires et remplaçant·es (récap).
 *
 * Le tri « Mon ordre » promettait que la personne décide de tout, et trois
 * règles le démentaient :
 *   — une ligne que l'ordre ne connaissait pas encore fermait la marche
 *     derrière TOUS les titulaires, si bien qu'un·e remplaçant·e en violon
 *     atterrissait quarante lignes sous les violons ;
 *   — le mode « Titulaires + leurs remplaçant·es » reconstruisait son
 *     regroupement à chaque rendu : le nom glissé revenait aussitôt à sa
 *     place, le geste paraissait sans effet ;
 *   — une ligne indentée n'avait pas de poignée, donc aucun moyen de sortir
 *     de son rattachement.
 *
 * Le glissement est joué par de vrais DragEvent : le glisser-déposer natif de
 * Chromium ne se pilote pas de façon fiable hors d'un vrai bureau, et ce sont
 * les trois écouteurs de la page (dragstart / dragover / drop) qu'il s'agit
 * d'éprouver, pas la plomberie du navigateur.
 *
 *   python3 -m http.server 8099 &
 *   node outils/test-recap-mon-ordre.cjs
 */
const { chromium } = require('playwright-core');
const { preparerContexte, CHROMIUM } = require('./capture.cjs');

const BASE = 'http://127.0.0.1:8099';

let echecs = 0;
const verifier = (nom, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(`  ${ok ? '✓' : '✗'} ${nom}`);
  if (!ok) console.log(`      attendu : ${JSON.stringify(attendu)}\n      obtenu  : ${JSON.stringify(obtenu)}`);
};

// Les noms des lignes de la matrice des musicien·nes, la flèche comprise :
// c'est elle qui dit si la ligne est encore rangée sous un·e titulaire.
const lignes = (p) => p.evaluate(() =>
  [...document.querySelectorAll('#matrixHolderMusiciens [data-ligne]')].map(l =>
    (l.classList.contains('sous-remplacant') ? '↳ ' : '') + l.querySelector('.co-matrix-name b').textContent));

const poignees = (p) => p.evaluate(() =>
  [...document.querySelectorAll('#matrixHolderMusiciens [data-ligne]')]
    .filter(l => !l.querySelector('.co-matrix-name.poignee')).length);

// Un glissement complet, du même bord que le navigateur : la poignée part, la
// cible reçoit le survol puis le dépôt, sur sa moitié haute ou basse.
const glisser = (p, pid, cibleId, moitie) => p.evaluate(([pid, cibleId, moitie]) => {
  const dt = new DataTransfer();
  const src = document.querySelector(`[data-ligne="${pid}"] .co-matrix-name`);
  const dst = document.querySelector(`[data-ligne="${cibleId}"] .co-matrix-name`);
  if (!src || !dst) throw new Error('ligne introuvable : ' + pid + ' → ' + cibleId);
  const r = dst.getBoundingClientRect();
  const y = r.top + r.height * (moitie === 'haut' ? 0.2 : 0.8);
  const x = r.left + r.width / 2;
  const ev = (t, cible, opts) => cible.dispatchEvent(
    new DragEvent(t, Object.assign({ bubbles: true, cancelable: true, dataTransfer: dt }, opts)));
  ev('dragstart', src, {});
  ev('dragover', dst, { clientX: x, clientY: y });
  ev('drop', dst, { clientX: x, clientY: y });
}, [pid, cibleId, moitie]);

const regler = async (p, filtre, tri) => {
  await p.selectOption('#musicienStatutFilter', filtre);
  await p.selectOption('#triLignes', tri);
  await p.waitForTimeout(250);
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  await preparerContexte(ctx);
  const p = await ctx.newPage();
  const erreurs = [];
  p.on('pageerror', e => erreurs.push(String(e).slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 200)); });
  p.on('dialog', d => d.accept().catch(() => {}));

  await p.goto(`${BASE}/recap.html`, { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(1000);
  await p.evaluate(() => { const v = document.getElementById('curieuxNouveautes'); if (v) v.remove(); });

  /* Nour Aït-Saïd (demo-mus-17) est remplaçante en violon et ne figure sur la
     liste de personne. Camille Durand (demo-mus-15) figure sur celle de
     Mariane Minjou (demo-mus-02), sous laquelle elle s'indente. */

  console.log("\n1. Sans ordre construit, une remplaçante inconnue se range à son instrument");
  await regler(p, 'sollicites', 'perso');
  const depart = await lignes(p);
  verifier('elle est au milieu des violons, pas en fin de tableau',
    depart.slice(0, 5),
    ['Pierre-Pascal Jean', 'Camille Durand', 'Nour Aït-Saïd', 'Mariane Minjou', 'Roxanne Rabatti']);
  verifier('toutes les lignes portent une poignée', await poignees(p), 0);

  console.log("\n2. Les autres tris gardent les titulaires devant");
  await regler(p, 'sollicites', 'orchestre');
  const parOrchestre = await lignes(p);
  verifier('les trois remplaçant·es ferment la marche',
    parOrchestre.slice(-3).slice().sort(),
    ['Camille Durand', 'Jules Moreau', 'Nour Aït-Saïd']);

  console.log("\n3. Le glissement tient dans « Titulaires + leurs remplaçant·es »");
  await regler(p, 'noyau_rempl', 'perso');
  verifier("le retour en arrière n'est pas encore proposé", await p.isVisible('#oublierOrdre'), false);
  await glisser(p, 'demo-mus-17', 'demo-mus-02', 'haut');
  await p.waitForTimeout(350);
  const apres = await lignes(p);
  verifier('Nour est passée devant Mariane et ne revient plus en bas',
    apres.slice(0, 4),
    ['Pierre-Pascal Jean', 'Nour Aït-Saïd', 'Mariane Minjou', '↳ Camille Durand']);
  verifier('le retour en arrière est proposé', await p.isVisible('#oublierOrdre'), true);

  console.log("\n4. Une ligne indentée peut quitter son rattachement");
  await glisser(p, 'demo-mus-15', 'demo-mus-08', 'bas');
  await p.waitForTimeout(350);
  const libre = await lignes(p);
  verifier('Camille a perdu sa flèche et suit Yann Pannecoucke',
    libre.slice(libre.indexOf('Yann Pannecoucke'), libre.indexOf('Yann Pannecoucke') + 2),
    ['Yann Pannecoucke', 'Camille Durand']);
  verifier('Jules, jamais touché, garde la sienne', libre.includes('↳ Jules Moreau'), true);

  console.log("\n5. Changer de filtre ne déplace personne d'autre");
  await regler(p, 'sollicites', 'perso');
  const ailleurs = await lignes(p);
  verifier('Jules reste derrière son titulaire, et non relégué en fin de liste',
    ailleurs.slice(ailleurs.indexOf('Marwane Champ'), ailleurs.indexOf('Marwane Champ') + 2),
    ['Marwane Champ', 'Jules Moreau']);
  verifier('Nour garde la place qu\'on lui a donnée', ailleurs[1], 'Nour Aït-Saïd');

  console.log("\n6. Tout remettre dans l'ordre de l'orchestre");
  await regler(p, 'noyau_rempl', 'perso');
  await p.click('#oublierOrdre');
  await p.waitForTimeout(350);
  verifier('le tableau est celui du départ', await lignes(p),
    ['Pierre-Pascal Jean', 'Mariane Minjou', '↳ Camille Durand', 'Roxanne Rabatti',
     'Marwane Champ', '↳ Jules Moreau', 'Paul-Marie Kuzma', 'Yann Pannecoucke',
     'Christelle Raquillet', 'Coralie Menuge', 'Nour Aït-Saïd']);
  verifier('rien n\'est plus retenu',
    await p.evaluate(() => [localStorage.getItem('curieuxRecapOrdre'), localStorage.getItem('curieuxRecapAffranchies')]),
    ['{"musicien":[],"technicien":[]}', '{"musicien":[],"technicien":[]}']);
  verifier('le retour en arrière disparaît', await p.isVisible('#oublierOrdre'), false);

  console.log("\n7. Pas d'erreur JavaScript");
  verifier('console propre', erreurs, []);

  await browser.close();
  console.log(echecs ? `\n${echecs} vérification(s) en échec` : '\nToutes les vérifications passent.');
  process.exit(echecs ? 1 : 0);
})();
