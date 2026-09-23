/* TEST — le bandeau tient dans l'écran, du téléphone au bureau, et rien n'y
 * est perdu.
 *
 * Sous 640 px, le bandeau ne garde que menu, logo, tableau de service et
 * pastille de compte. La bascule de thème était déjà descendue dans le panneau
 * ☰ pour cette raison ; restait « Déconnexion », que la garde
 * d'authentification ajoute une fois la session confirmée
 * (injectAdminLogoutButton, brand-assets.js). Ses 97 px portaient la pastille
 * de compte à 417 px : toutes les pages d'équipe défilaient latéralement sur
 * un téléphone de 390 px. Le bouton descend à son tour dans le panneau, qui le
 * relaie.
 *
 * Au bureau, le même bouton manquait au relevé des seuils du bandeau : à
 * 1280 px, « Admin » passait sous « Tableau de service ». Les seuils ont été
 * remesurés avec lui (voir base.css, bloc 2 bis).
 *
 * Le test vérifie les deux moitiés de la promesse : plus de défilement
 * latéral, et la déconnexion toujours à portée — dans le panneau sous 640 px,
 * dans le bandeau au-dessus. Il rejoue l'ordre réel : la garde pose le bouton
 * après la construction du panneau, et les droits le redessinent ensuite (le
 * faux CurieuxDB répond avec un délai, voir capture.cjs).
 *
 *   python3 -m http.server 8099 &
 *   node outils/test-bandeau.cjs
 */
const { chromium } = require('playwright-core');
const { preparerContexte, CHROMIUM } = require('./capture.cjs');

const BASE = 'http://127.0.0.1:8099';
const PAGES = ['accueil', 'tournees', 'technique-taches', 'recap'];

let echecs = 0;
const verifier = (nom, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(`  ${ok ? '✓' : '✗'} ${nom}`);
  if (!ok) console.log(`      attendu : ${JSON.stringify(attendu)}\n      obtenu  : ${JSON.stringify(obtenu)}`);
};

// L'état du bandeau et du panneau, tel que la page le montre.
//
// Tout se mesure contre la largeur de l'APPAREIL, pas contre innerWidth : en
// émulation téléphone, le navigateur élargit la fenêtre de mise en page au
// contenu qui déborde — innerWidth passait alors à 417 px, et une page trop
// large « tenait » dans une fenêtre élargie pour elle.
const etat = (p, largeur) => p.evaluate((largeur) => {
  const visible = el => !!el && el.getClientRects().length > 0;
  const bandeau = [...document.querySelectorAll('.co-topbar-in > *, .co-topbar-actions > *')].filter(visible);
  const bloc = document.querySelector('#coNavMobile .co-nav-mobile-compte');
  const relais = document.getElementById('coNavMobileDeconnexion');
  return {
    deborde: document.documentElement.scrollWidth > largeur,
    // Tout ce que le bandeau affiche tient dans la largeur de l'écran.
    horsEcran: bandeau.filter(el => el.getBoundingClientRect().right > largeur)
      .map(el => el.className || el.id),
    deconnexionDansLeBandeau: visible(document.querySelector('.co-topbar #curieuxAdminLogout')),
    compteDansLePanneau: visible(bloc),
    relaisVisible: visible(relais),
    relaisDansLEcran: visible(relais) && relais.getBoundingClientRect().right <= largeur,
    qui: bloc ? bloc.querySelector('.co-nav-mobile-qui').textContent : null,
    // Au bureau : les sections ne sont ni comprimées, ni glissées sous le
    // raccourci. Un menu comprimé déborde de sa boîte sans rien découper.
    menuComprime: (() => {
      const nav = document.querySelector('.co-topnav');
      const racc = document.querySelector('.co-raccourci');
      const dernier = nav && nav.lastElementChild;
      if (!visible(nav) || !dernier) return false;
      return nav.scrollWidth > nav.clientWidth
        || (visible(racc) && dernier.getBoundingClientRect().right > racc.getBoundingClientRect().left);
    })(),
    // Le redessin des droits a-t-il eu lieu ? Admin n'apparaît qu'après.
    adminDansLePanneau: [...document.querySelectorAll('#coNavMobile .co-nav-mobile-titre')]
      .some(t => /Admin/.test(t.textContent)),
  };
}, largeur);

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

const ouvrirLePanneau = async (p) => {
  await p.click('.co-burger');
  await p.waitForTimeout(150);
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const erreurs = [];

  for (const largeur of [390, 360]) {
    console.log(`Téléphone (${largeur} px) — compte admin, la garde pose « Déconnexion » après coup`);
    const ctx = await browser.newContext({ viewport: { width: largeur, height: 844 }, isMobile: true, hasTouch: true });
    await preparerContexte(ctx);
    for (const nom of PAGES) {
      const p = await ouvrir(ctx, `${BASE}/${nom}.html`, erreurs);
      let e = await etat(p, largeur);
      verifier(`${nom} : la page ne déborde pas`, e.deborde, false);
      verifier(`${nom} : tout le bandeau tient dans l'écran`, e.horsEcran, []);
      verifier(`${nom} : « Déconnexion » a quitté le bandeau`, e.deconnexionDansLeBandeau, false);
      await ouvrirLePanneau(p);
      e = await etat(p, largeur);
      verifier(`${nom} : le redessin des droits a eu lieu`, e.adminDansLePanneau, true);
      verifier(`${nom} : le panneau propose « Se déconnecter »`, e.relaisVisible, true);
      verifier(`${nom} : le bouton tient dans l'écran`, e.relaisDansLEcran, true);
      verifier(`${nom} : le panneau dit avec quel compte on est connecté`, e.qui, 'Connecté·e en tant que demo@curieux.fr');
      await p.close();
    }
    await ctx.close();
  }

  console.log('Téléphone (390 px) — « Se déconnecter » déconnecte pour de vrai');
  const tel = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await preparerContexte(tel);
  // Le faux CurieuxDB garde sa session après signOut : le vrai écran de
  // connexion la verrait et renverrait aussitôt ailleurs, avant qu'on ait pu
  // constater l'arrivée. Une page neutre le remplace pour ce seul cas.
  await tel.route('**/admin-login.html*', r => r.fulfill({ contentType: 'text/html', body: '<p>Connexion</p>' }));
  const t = await ouvrir(tel, `${BASE}/tournees.html`, erreurs);
  await ouvrirLePanneau(t);
  // Sans relais, on constate l'échec plutôt que d'attendre trente secondes un
  // bouton qui ne viendra pas.
  if (await t.$('#coNavMobileDeconnexion')) {
    await Promise.all([
      t.waitForURL(/admin-login\.html/, { timeout: 5000 }).catch(() => {}),
      t.click('#coNavMobileDeconnexion'),
    ]);
  }
  verifier('le relais actionne le bouton du bandeau : retour à la connexion', /admin-login\.html/.test(t.url()), true);

  console.log('Page sans garde (lien technique partagé) — rien à relayer');
  const s = await ouvrir(tel, `${BASE}/technique-partage.html?jeton=demo`, erreurs);
  await ouvrirLePanneau(s);
  let e = await etat(s, 390);
  verifier('pas de bloc Compte dans le panneau', e.compteDansLePanneau, false);
  verifier('la page ne déborde pas', e.deborde, false);
  await tel.close();

  // Les seuils du bandeau, de part et d'autre : 1174/1175 (le panneau cède la
  // place aux menus), 1345/1346 (la recherche apparaît), et 1280, le format
  // bureau de capture.cjs.
  for (const largeur of [700, 1174, 1175, 1280, 1345, 1346, 1440]) {
    console.log(`${largeur} px — « Déconnexion » reste dans le bandeau`);
    const ctx = await browser.newContext({ viewport: { width: largeur, height: 900 } });
    await preparerContexte(ctx);
    const p = await ouvrir(ctx, `${BASE}/tournees.html`, erreurs);
    e = await etat(p, largeur);
    verifier('la page ne déborde pas', e.deborde, false);
    verifier('tout le bandeau tient dans l\'écran', e.horsEcran, []);
    verifier('« Déconnexion » est dans le bandeau', e.deconnexionDansLeBandeau, true);
    verifier('les sections ne passent pas sous le raccourci', e.menuComprime, false);
    // Le panneau n'existe à l'écran que sous le seuil du bandeau : c'est le
    // bouton ☰ qui le dit, pas une largeur recopiée ici de base.css.
    if (await p.isVisible('.co-burger')) {
      await ouvrirLePanneau(p);
      e = await etat(p, largeur);
      verifier('le panneau ne la propose pas une seconde fois', e.compteDansLePanneau, false);
    }
    await ctx.close();
  }

  verifier('aucune erreur JavaScript', erreurs, []);

  await browser.close();
  console.log(echecs ? `\n${echecs} échec(s)` : '\nTout passe.');
  process.exit(echecs ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
