const { chromium } = require('playwright-core');
const { SEED, preparerContexte, CHROMIUM } = require('./outils/capture.cjs');

// Une demande par titulaire, aucune réponse : la relance apparaît.
SEED.dispo_demandes = SEED.musiciens.slice(0, 3).map((m, i)=> ({
  id: 'dem-' + i, tourneeId: 'demo-tour1', personType: 'musicien', personId: m.id, dates: [],
}));
// Personne ne répond : toutes les dates manquent (8 > 5, la règle doit jouer).
SEED.musiciens.forEach(m=> { m.disponibilites = {}; });

(async ()=>{
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  await preparerContexte(ctx);
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', e=> erreurs.push(String(e)));
  await page.goto('http://127.0.0.1:8099/suivi-dispo.html', { waitUntil:'networkidle' });
  await page.evaluate(()=> document.documentElement.style.visibility = 'visible');
  await page.waitForTimeout(900);

  // La règle des cinq, testée directement.
  console.log('RESUME', JSON.stringify(await page.evaluate(()=> ({
    une: CurieuxMessages.listeOuResume(['2027-05-03']),
    trois: CurieuxMessages.listeOuResume(['2027-05-03','2027-05-05','2027-05-09']),
    huit: CurieuxMessages.listeOuResume(['2027-05-03','2027-05-05','2027-05-09','2027-05-11','2027-05-13','2027-05-15','2027-06-01','2027-06-19']),
    periode: CurieuxMessages.periode(['2027-05-03','2027-06-19']),
  })), null, 1));

  const chevrons = await page.$$('[data-msg-menu]');
  console.log('CHEVRONS', chevrons.length);
  if(!chevrons.length){ console.log('HTML', (await page.content()).slice(0, 500)); await browser.close(); return; }

  await chevrons[0].click();
  await page.waitForTimeout(250);
  console.log('MODELES', JSON.stringify(await page.$$eval('.msg-pop [data-modele]', els=> els.map(e=> e.querySelector('b').textContent))));

  // Le texte réellement produit pour chaque modèle, sur le premier contexte.
  const textes = await page.evaluate(()=>{
    const ref = document.querySelector('[data-msg-menu]').dataset.msgMenu;
    const c = contextesMessage.get(ref);
    return CurieuxMessages.MODELES.map(m=> m.libelle + '\n----\n' + CurieuxMessages.construire(m.cle, Object.assign({}, c, { butoir: 'vendredi' })));
  });
  textes.forEach(t=> console.log('\n===== ' + t));

  await page.screenshot({ path: '/tmp/modeles-menu.png' });
  console.log('\nERREURS', JSON.stringify(erreurs));
  await browser.close();
})();
