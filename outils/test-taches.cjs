/* TEST — la page des tâches de l'équipe (taches.html), dans Chromium.

   Ce qui doit tenir, au téléphone comme au bureau :
   — la génération automatique n'insère qu'une fois, en « si absent », avec
     des identifiants déterministes, et ne recrée jamais une tâche écartée ;
   — changer l'état n'écrit QUE les colonnes touchées (majPartielle) ;
   — coller une liste de titres crée une sous-tâche par ligne, sans effacer le
     titre qu'on venait de taper ;
   — supprimer attend la fin du « Oups », et une tâche automatique s'écarte ;
   — une lecture en échec, une migration absente ou des règles absentes ne
     créent RIEN.

   Avec CAPTURES=/un/dossier, le test laisse aussi les captures des trois vues,
   de la feuille et du tiroir, en clair et en sombre, à 390 et 1440 px.

     python3 -m http.server 8099 &
     node outils/test-taches.cjs                                              */
const { chromium } = require('playwright-core');
const { preparerContexte, CHROMIUM } = require('./capture.cjs');
const OUT = process.env.CAPTURES || '';
const URL = 'http://127.0.0.1:8099/taches.html';

async function contexte(b, largeur, hauteur, sombre, init){
  const ctx = await b.newContext({ viewport: { width: largeur, height: hauteur }, deviceScaleFactor: 2 });
  if (sombre) process.env.THEME = 'dark'; else delete process.env.THEME;
  await preparerContexte(ctx);
  await ctx.addInitScript(() => { try { localStorage.setItem('curieuxNouveautesVue', '9999'); } catch (e) {} });
  if (init) await ctx.addInitScript(init);
  return ctx;
}
async function ouvrir(ctx){
  const p = await ctx.newPage();
  p.erreurs = [];
  p.on('pageerror', e => p.erreurs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') p.erreurs.push(m.text()); });
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1300);
  await p.evaluate(() => { document.body.style.visibility = 'visible'; });
  return p;
}
let ok = 0, ko = 0;
const verifier = (nom, cond, detail) => { cond ? ok++ : ko++; console.log(`  ${cond ? '✓' : '✗'} ${nom}${cond ? '' : ' — ' + (detail || '')}`); };

(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });

  for (const sombre of [false, true]) {
    const suffixe = sombre ? '-sombre' : '';
    // --- Téléphone ---
    let ctx = await contexte(b, 390, 844, sombre);
    let p = await ouvrir(ctx);
    if (OUT) await p.screenshot({ path: `${OUT}/m-liste${suffixe}.png` });
    if (!sombre) {
      await p.evaluate(() => window.scrollTo(0, 99999));
      await p.waitForTimeout(200);
      if (OUT) await p.screenshot({ path: `${OUT}/m-liste-bas.png` });
      await p.evaluate(() => window.scrollTo(0, 0));
    }
    await p.click('.tt-onglet[data-vue="projets"]'); await p.waitForTimeout(300);
    if (OUT) await p.screenshot({ path: `${OUT}/m-projets${suffixe}.png` });
    await p.click('.tt-onglet[data-vue="calendrier"]'); await p.waitForTimeout(300);
    if (OUT) await p.screenshot({ path: `${OUT}/m-calendrier${suffixe}.png` });
    await p.click('.tt-onglet[data-vue="liste"]'); await p.waitForTimeout(300);
    await p.click('#tache-demo-t-arr .tt-quoi'); await p.waitForTimeout(400);
    if (OUT) await p.screenshot({ path: `${OUT}/m-feuille${suffixe}.png` });
    if (!sombre) {
      await p.evaluate(() => document.querySelector('.tt-p-corps').scrollTo(0, 9999)); await p.waitForTimeout(150);
      if (OUT) await p.screenshot({ path: `${OUT}/m-feuille-bas.png` });
    }
    await p.keyboard.press('Escape'); await p.waitForTimeout(250);
    verifier(`téléphone${suffixe} : Échap ferme la feuille`, !(await p.$('.tt-voile.open')));
    verifier(`téléphone${suffixe} : aucune erreur JS`, p.erreurs.length === 0, p.erreurs.join(' | '));
    const debord = await p.evaluate(() => { const l = document.querySelector('.wrap').scrollWidth; return l > innerWidth + 1; });
    verifier(`téléphone${suffixe} : la page ne défile pas de côté`, !debord);
    const taillesCibles = await p.evaluate(() => [...document.querySelectorAll('.tt-etat, .tt-onglet, .tt-fab, .cal-fleche')]
      .filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed')
      .map(e => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); })
      .filter(x => x > 0 && x < 34));
    verifier(`téléphone${suffixe} : cibles principales ≥ 34 px`, taillesCibles.length === 0, JSON.stringify(taillesCibles));
    await ctx.close();

    // --- Bureau 1440 ---
    ctx = await contexte(b, 1440, 900, sombre);
    p = await ouvrir(ctx);
    if (OUT) await p.screenshot({ path: `${OUT}/d-liste${suffixe}.png` });
    await p.click('.tt-onglet[data-vue="projets"]'); await p.waitForTimeout(300);
    if (OUT) await p.screenshot({ path: `${OUT}/d-projets${suffixe}.png` });
    await p.click('.tt-onglet[data-vue="calendrier"]'); await p.waitForTimeout(300);
    if (OUT) await p.screenshot({ path: `${OUT}/d-calendrier${suffixe}.png`, fullPage: true });
    await p.click('.tt-onglet[data-vue="liste"]'); await p.waitForTimeout(300);
    await p.click('#tache-demo-t-arr .tt-quoi'); await p.waitForTimeout(400);
    if (OUT) await p.screenshot({ path: `${OUT}/d-tiroir${suffixe}.png` });
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    if (!sombre) {
      await p.click('#btnRegles'); await p.waitForTimeout(400);
      if (OUT) await p.screenshot({ path: `${OUT}/d-regles.png` });
      await p.keyboard.press('Escape');
    }
    verifier(`bureau${suffixe} : aucune erreur JS`, p.erreurs.length === 0, p.erreurs.join(' | '));
    await ctx.close();
  }

  console.log('\nInteractions');
  let ctx = await contexte(b, 390, 844, false);
  let p = await ouvrir(ctx);
  const ecrits = () => p.evaluate(() => window.__ecrits);

  // Génération : 3 règles × projets déclenchés, identifiants déterministes.
  let e = await ecrits();
  const gen = e.filter(x => x.siAbsent);
  verifier('génération : une seule insertion « si absent »', gen.length === 1, JSON.stringify(gen.map(x => x.rows.length)));
  verifier('génération : identifiants auto::projet::règle', gen[0] && gen[0].rows.every(r => /^auto::[^:]+::[a-z-]+$/.test(r.id)));
  verifier('génération : les trois règles sur le projet d’octobre',
    gen[0] && ['envoi-partitions', 'edition-partitions', 'impression-partitions'].every(m => gen[0].rows.some(r => r.id === `auto::demo-tour-oct::${m}`)));
  // Relancer la génération ne crée rien de plus.
  await p.evaluate(() => genererAuto()); await p.waitForTimeout(500);
  e = await ecrits();
  verifier('génération relancée : aucune nouvelle insertion', e.filter(x => x.siAbsent).length === 1);

  // Cycle d'état : à faire → en cours, écriture PARTIELLE.
  await p.click('#tache-demo-t-devis .tt-etat'); await p.waitForTimeout(300);
  e = await ecrits();
  const maj = e.filter(x => x.id === 'demo-t-devis').pop();
  verifier('cycle : à faire → en cours, écrit en partiel', maj && maj.colonnes.statut === 'en_cours' && !('libelle' in maj.colonnes) && !('notes' in maj.colonnes), JSON.stringify(maj));

  // Ajout rapide.
  await p.fill('#ajoutRapide', 'Commander les pupitres lumineux');
  await p.press('#ajoutRapide', 'Enter'); await p.waitForTimeout(300);
  e = await ecrits();
  const cree = e.filter(x => x.rows && !x.siAbsent).pop();
  verifier('ajout rapide : une tâche d’équipe créée par moi', cree && cree.rows[0].libelle === 'Commander les pupitres lumineux' && cree.rows[0].genre === 'equipe' && cree.rows[0].auteur === 'alois@lessoudaines.fr');
  verifier('ajout rapide : le champ garde le focus', await p.evaluate(() => document.activeElement && document.activeElement.id === 'ajoutRapide'));

  // Création par la feuille, avec une liste collée en sous-tâches.
  await p.click('#fab'); await p.waitForTimeout(300);
  await p.fill('[data-champ="libelle"]', 'Arrangements du bis');
  await p.evaluate(() => {
    const inp = document.getElementById('pNouvelleST');
    const dt = new DataTransfer(); dt.setData('text/plain', '1. Nausicaä\n2. Porco Rosso\n- Totoro\n');
    inp.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await p.waitForTimeout(200);
  const nbSt = await p.$$eval('#pSousTaches .tt-st', l => l.length);
  verifier('coller une liste : une sous-tâche par ligne, puces retirées', nbSt === 3);
  const libellesSt = await p.$$eval('#pSousTaches [data-st-libelle]', l => l.map(i => i.value));
  verifier('coller une liste : libellés propres', JSON.stringify(libellesSt) === JSON.stringify(['Nausicaä', 'Porco Rosso', 'Totoro']), JSON.stringify(libellesSt));
  await p.click('#pCreer'); await p.waitForTimeout(400);
  e = await ecrits();
  const creation = e.filter(x => x.rows && x.rows.length === 4).pop();
  verifier('création : la mère et ses trois sous-tâches en une écriture', !!creation);
  verifier('création : sous-tâches ordonnées et rattachées',
    creation && creation.rows.slice(1).every((r, i) => r.parentId === creation.rows[0].id && r.ordre === i + 1));

  // Écarter une tâche automatique : jamais supprimée.
  const idAuto = 'auto::demo-tour-oct::impression-partitions';
  await p.click(`[id="tache-${idAuto}"] .tt-quoi`); await p.waitForTimeout(300);
  const libBouton = await p.textContent('#pSupprimer');
  verifier('tâche auto : le bouton dit « Écarter »', libBouton.trim() === 'Écarter', libBouton);
  await p.click('#pSupprimer'); await p.waitForTimeout(300);
  e = await ecrits();
  verifier('tâche auto : écartée (statut), pas supprimée',
    e.some(x => x.id === idAuto && x.colonnes && x.colonnes.statut === 'ecartee') && !e.some(x => x.supprime && [].concat(x.supprime).includes(idAuto)));
  await p.evaluate(() => genererAuto()); await p.waitForTimeout(500);
  e = await ecrits();
  verifier('tâche auto écartée : ne renaît pas', e.filter(x => x.siAbsent).length === 1);

  // Supprimer une tâche manuelle avec ses sous-tâches : différé jusqu'au « Oups ».
  await p.click('#tache-demo-t-arr .tt-quoi'); await p.waitForTimeout(300);
  await p.click('#pSupprimer'); await p.waitForTimeout(300);
  verifier('suppression : la tâche disparaît de l’écran', !(await p.$('#tache-demo-t-arr')));
  e = await ecrits();
  verifier('suppression : rien d’effacé avant la fin du « Oups »', !e.some(x => x.supprime));
  await p.click('.co-annuler-btn'); await p.waitForTimeout(300);
  verifier('Oups : la tâche revient', !!(await p.$('#tache-demo-t-arr')));

  // Échéance calée sur le projet, en création.
  await p.click('#fab'); await p.waitForTimeout(300);
  await p.fill('[data-champ="libelle"]', 'Envoyer le conducteur au chef');
  await p.selectOption('[data-champ="projet"]', 'demo-tour-oct'); await p.waitForTimeout(200);
  await p.click('[data-mode-ech="ancre"]'); await p.waitForTimeout(200);
  const aide = await p.textContent('.tt-champ .tt-aide');
  verifier('échéance calée : la date calculée s’affiche', /→/.test(aide), aide);
  await p.click('#pCreer'); await p.waitForTimeout(300);
  e = await ecrits();
  const calee = e.filter(x => x.rows && x.rows[0] && x.rows[0].libelle === 'Envoyer le conducteur au chef').pop();
  verifier('échéance calée : ancre + j enregistrés, sans date fixe', calee && calee.rows[0].ancre === 'premiere_repetition' && calee.rows[0].j === 7 && !calee.rows[0].echeance);

  verifier('interactions : aucune erreur JS', p.erreurs.length === 0, p.erreurs.join(' | '));
  await ctx.close();

  console.log('\nGarde-fous');
  // Lecture en échec : aucune création.
  ctx = await contexte(b, 390, 844, false, () => { window.__lectureEchouee = ['comm_taches']; });
  p = await ouvrir(ctx);
  e = await p.evaluate(() => window.__ecrits);
  verifier('lecture des tâches en échec : aucune insertion', !e.some(x => x.siAbsent), JSON.stringify(e));
  verifier('lecture en échec : un message le dit', /ne se lisent pas/.test(await p.textContent('#contenu')));
  await ctx.close();

  // Migration absente : bandeau, lecture seule, pas de génération.
  ctx = await contexte(b, 390, 844, false, () => { window.__colonnesAbsentes = ['statut']; });
  p = await ouvrir(ctx);
  e = await p.evaluate(() => window.__ecrits);
  verifier('migration absente : bandeau affiché', /pas encore les tâches d'équipe/.test(await p.textContent('#bandeaux')));
  verifier('migration absente : aucune génération', !e.some(x => x.siAbsent));
  verifier('migration absente : pas d’ajout rapide ni de bouton +', !(await p.$('#ajoutRapide')) && await p.$eval('#fab', f => f.hidden));
  if (OUT) await p.screenshot({ path: `${OUT}/m-migration.png` });
  await ctx.close();

  // Réglages absents : aucune génération, jamais de défaut inventé.
  ctx = await contexte(b, 390, 844, false, () => { window.__sansReglesTaches = true; });
  p = await ouvrir(ctx);
  e = await p.evaluate(() => window.__ecrits);
  verifier('règles absentes : aucune génération', !e.some(x => x.siAbsent));
  await ctx.close();

  await b.close();
  console.log(`\n${ok} / ${ok + ko} vérifications passent.`);
  process.exit(ko ? 1 : 0);
})();
