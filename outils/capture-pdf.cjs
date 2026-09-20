// Relire les PDF que le site produit, sans les ouvrir à la main.
//
// Les exports sont générés dans le navigateur par jsPDF : le seul moyen de
// savoir ce qu'ils donnent est de les faire produire pour de vrai. Ce script
// ouvre la page avec le jeu de démo (le même faux CurieuxDB que capture.cjs,
// importé et non recopié), clique le bouton d'export, récupère le fichier
// téléchargé, et le rend en images page par page.
//
//   python3 -m http.server 8099 &
//   node outils/capture-pdf.cjs "technique-partage?jeton=demo" "[data-pdf]"
//   python3 outils/pdf-en-images.py /tmp/captures/technique-partage.pdf
const path = require('path');
const { chromium } = require('playwright-core');
const { preparerContexte, CHROMIUM } = require('./capture.cjs');

const BASE = 'http://127.0.0.1:8099';
const OUT = process.env.CAPTURES || '/tmp/captures';

const cible = process.argv[2] || 'technique-partage?jeton=demo';
const selecteur = process.argv[3] || '[data-pdf]';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await preparerContexte(ctx);

  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 200)); });
  // Playwright referme seul les alertes : sans ce témoin, un export refusé par
  // une alerte ressemble à un export qui n'a jamais répondu.
  page.on('dialog', (d) => { erreurs.push(`alerte : ${d.message().slice(0, 160)}`); d.dismiss().catch(() => {}); });

  const [fichier, requete] = cible.split('?');
  await page.goto(`${BASE}/${fichier}.html${requete ? '?' + requete : ''}`, { waitUntil: 'networkidle', timeout: 20000 });
  // Le logo du bandeau PDF est chargé en arrière-plan (voir brand-assets.js et
  // pdf-charte.js) : sans cette pause, on capture un document sans logo.
  await page.waitForTimeout(1200);

  // Le voile des nouveautés s'ouvre par-dessus la page au premier passage et
  // avale tous les clics : le bouton d'export restait injoignable, et l'outil
  // rendait « aucun téléchargement » là où la page marchait très bien.
  // capture.cjs l'écartait déjà de son côté ; il manquait ici.
  await page.evaluate(() => { const v = document.getElementById('curieuxNouveautes'); if (v) v.remove(); });

  // Quatrième argument : les sélecteurs à cliquer d'abord, séparés par « | » —
  // pour atteindre la date voulue, ou cocher les arrêts d'une mission, avant
  // d'appuyer sur le bouton d'export.
  for (const sel of (process.argv[4] || '').split('|').filter(Boolean)) {
    const prealable = await page.$(sel);
    if (prealable) { await prealable.click(); await page.waitForTimeout(300); }
    else console.log(`  (rien à cliquer pour « ${sel} »)`);
  }

  const bouton = await page.$(selecteur);
  if (!bouton) {
    console.log(`Aucun élément « ${selecteur} » sur ${fichier}.`);
    await browser.close();
    return;
  }

  const attente = page.waitForEvent('download', { timeout: 20000 });
  await bouton.click();
  let telechargement = null;
  try { telechargement = await attente; }
  catch {
    console.log(`Aucun téléchargement après le clic sur « ${selecteur} ».`);
    erreurs.forEach((e) => console.log(`  · ${e}`));
    await browser.close();
    process.exitCode = 1;
    return;
  }
  const chemin = path.join(OUT, `${fichier}.pdf`);
  await telechargement.saveAs(chemin);

  console.log(`${fichier.padEnd(20)} → ${chemin}${erreurs.length ? ` · ${erreurs.length} erreur(s) JS : ${erreurs[0]}` : ''}`);
  await browser.close();
})();
