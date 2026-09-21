/* TEST — la barre « Marquer / Affecter / Oups » survit au redessin du menu.
 *
 * recap.html monte sa barre de modes dans le sous-menu que nav.js dessine au
 * chargement. Or nav.js redessine ce sous-menu une seconde fois, quand la base
 * a répondu sur les droits du compte (appliquerDroits) : pour un compte admin
 * ou direction technique, la réponse ajoute des sections au bandeau, et tout
 * est rejoué — sous-menu compris. Le redessin remplaçait l'ancien sous-menu
 * par un neuf, et emportait la barre avec lui : plus de « Affecter », plus de
 * « Marquer », plus de « Oups », pour tous les comptes qui ont un droit.
 *
 * Le scénario rejoue l'ordre réel : les droits arrivent après que la page a
 * fini de se poser (le faux CurieuxDB répond avec un délai, voir capture.cjs).
 *
 *   python3 -m http.server 8099 &
 *   node outils/test-recap-barre-de-modes.cjs
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

// L'état de la barre, tel que la page le montre.
const etat = (p) => p.evaluate(() => {
  const barre = document.querySelector('.mode-bar');
  const affecter = document.querySelector('.mode-pilules [data-mode="affecter"]');
  const visible = el => !!el && el.getClientRects().length > 0;
  return {
    barrePresente: !!barre,
    dansLeSousMenu: !!(barre && barre.closest('.co-subnav-in')),
    affecterVisible: visible(affecter),
    marquerVisible: visible(document.querySelector('.mode-pilules [data-mode="marquer"]')),
    oupsVisible: visible(document.getElementById('oupsBtn')),
    classeEnHaut: document.body.classList.contains('mode-bar-en-haut'),
    // Les sections que le bandeau montre : dit si le redessin a bien eu lieu.
    sections: [...document.querySelectorAll('.co-topnav [data-section], .co-topnav .co-nav-item > button, .co-topnav > a')]
      .map(el => (el.dataset.section || el.textContent).trim().replace(/\s+/g, ' ')),
  };
});

const ouvrir = async (ctx, url, erreurs) => {
  const p = await ctx.newPage();
  p.on('pageerror', e => erreurs.push(String(e).slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 200)); });
  p.on('dialog', d => d.accept().catch(() => {}));
  await p.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(1000);
  await p.evaluate(() => { const v = document.getElementById('curieuxNouveautes'); if (v) v.remove(); });
  return p;
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  await preparerContexte(ctx);
  const erreurs = [];

  console.log('Compte admin — la base répond après le chargement, le menu est redessiné');
  const p = await ouvrir(ctx, `${BASE}/recap.html`, erreurs);
  let e = await etat(p);
  verifier('le redessin a eu lieu : Admin est dans le bandeau', e.sections.some(s => /Admin/.test(s)), true);
  verifier('la barre de modes est toujours dans la page', e.barrePresente, true);
  verifier('elle est montée dans le sous-menu', e.dansLeSousMenu, true);
  verifier('« Affecter » est visible', e.affecterVisible, true);
  verifier('« Marquer » est visible', e.marquerVisible, true);
  verifier('« Oups » est visible', e.oupsVisible, true);
  verifier('la barre est bien en position haute', e.classeEnHaut, true);

  await p.click('.mode-pilules [data-mode="affecter"]');
  verifier('un clic sur « Affecter » passe la page en mode affecter',
    await p.evaluate(() => document.body.classList.contains('mode-affecter')), true);
  await p.click('.mode-pilules [data-mode="marquer"]');
  verifier('un clic sur « Marquer » revient en mode marquer',
    await p.evaluate(() => document.body.classList.contains('mode-marquer')), true);

  console.log('Compte sans droit particulier — rien à redessiner');
  const q = await ouvrir(ctx, `${BASE}/recap.html?refus=admin&refus=technique`, erreurs);
  e = await etat(q);
  verifier('Admin n’est pas dans le bandeau', e.sections.some(s => /Admin/.test(s)), false);
  verifier('« Affecter » est visible', e.affecterVisible, true);
  verifier('la barre est dans le sous-menu', e.dansLeSousMenu, true);

  console.log('Sur téléphone (390 px) — même compte admin, même redessin');
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await preparerContexte(mobile);
  const m = await ouvrir(mobile, `${BASE}/recap.html`, erreurs);
  e = await etat(m);
  verifier('la barre est dans le sous-menu', e.dansLeSousMenu, true);
  verifier('« Affecter » est visible', e.affecterVisible, true);
  verifier('« Affecter » tient dans l’écran',
    await m.evaluate(() => document.querySelector('.mode-pilules [data-mode="affecter"]').getBoundingClientRect().right <= innerWidth), true);

  verifier('aucune erreur JavaScript', erreurs, []);

  await browser.close();
  console.log(echecs ? `\n${echecs} échec(s)` : '\nTout passe.');
  process.exit(echecs ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
