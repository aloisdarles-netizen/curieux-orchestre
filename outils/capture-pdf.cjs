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

  const [fichier, requete] = cible.split('?');
  await page.goto(`${BASE}/${fichier}.html${requete ? '?' + requete : ''}`, { waitUntil: 'networkidle', timeout: 20000 });
  // Le logo du bandeau PDF est chargé en arrière-plan (voir brand-assets.js et
  // pdf-charte.js) : sans cette pause, on capture un document sans logo.
  await page.waitForTimeout(1200);

  // Quatrième argument : un sélecteur à cliquer d'abord — pour atteindre la
  // date dont on veut l'export avant d'appuyer sur le bouton.
  if (process.argv[4]) {
    const prealable = await page.$(process.argv[4]);
    if (prealable) { await prealable.click(); await page.waitForTimeout(500); }
    else console.log(`  (rien à cliquer pour « ${process.argv[4]} »)`);
  }

  const bouton = await page.$(selecteur);
  if (!bouton) {
    console.log(`Aucun élément « ${selecteur} » sur ${fichier}.`);
    await browser.close();
    return;
  }

  const attente = page.waitForEvent('download', { timeout: 20000 });
  await bouton.click();
  const telechargement = await attente;
  const chemin = path.join(OUT, `${fichier}.pdf`);
  await telechargement.saveAs(chemin);

  console.log(`${fichier.padEnd(20)} → ${chemin}${erreurs.length ? ` · ${erreurs.length} erreur(s) JS : ${erreurs[0]}` : ''}`);
  await browser.close();
})();
