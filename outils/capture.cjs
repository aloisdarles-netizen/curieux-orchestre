// Extension .cjs et non .js : package.json déclare "type": "module",
// qui ferait lire ce fichier comme un module ES et casserait ses require().
// Capture d'écran des pages du site, en deux formats, avec des données de démo
// injectées avant le chargement — la base est protégée par RLS, une capture
// sans données ne montrerait que des écrans vides.
const { chromium } = require('playwright-core');

const BASE = 'http://127.0.0.1:8099';
const OUT = process.env.CAPTURES || '/tmp/captures';
const FORMATS = { mobile: { width: 390, height: 844 }, bureau: { width: 1280, height: 900 } };

const pages = process.argv[2] ? process.argv[2].split(',') : ['accueil', 'tournees', 'recap'];
const format = process.argv[3] || 'mobile';

// Jeu de démo minimal, servi à la place de Supabase.
const MUS = [
  ['demo-mus-01','Roxanne','Rabatti','Violon solo','Cordes'],['demo-mus-02','Mariane','Minjou','Violon','Cordes'],
  ['demo-mus-03','Pierre-Pascal','Jean','Alto','Cordes'],['demo-mus-04','Marwane','Champ','Violoncelle','Cordes'],
  ['demo-mus-05','Paul-Marie','Kuzma','Violoncelle','Cordes'],['demo-mus-06','Christelle','Raquillet','Flûte','Bois'],
  ['demo-mus-07','Coralie','Menuge','Hautbois','Bois'],['demo-mus-08','Yann','Pannecoucke','Clarinette','Bois'],
].map(([id,prenom,nom,instrument,pupitre]) => ({
  id, prenom, nom, instrument, pupitre, statutPoste:'titulaire', telephone:'06 12 31 52 70',
  email:`${prenom.toLowerCase()}@mail.com`,
  disponibilites:{'2027-01-22':'dispo','2027-03-12':'dispo','2027-03-15':'indispo','2027-03-18':'incertain'},
}));

const DATES = [
  ['2027-01-22','Paris','Studio Ferber — répétitions','validee','Amener les conducteurs v2'],
  ['2027-03-12','Lyon','Salle 3000','validee',''],
  ['2027-03-13','Grenoble','Le Summum','validee',''],
  ['2027-03-15','Marseille','Le Dôme','option',''],
  ['2027-03-18','Toulouse','Zénith','option','Relancer le Zénith avant le 20 févr.'],
].map(([date,ville,lieu,statut,commentaire],i) => ({
  id:`d${i}`, date, ville, lieu, statut, commentaire,
  musiciensAssignes: MUS.slice(0, statut==='option' ? 4 : 8).map(m=>m.id),
  techniciensAssignes:['demo-tech-01','demo-tech-02'], linkedToNext: i===1,
}));

const SEED = {
  musiciens: MUS,
  techniciens: [
    {id:'demo-tech-01',prenom:'Marie',nom:'Dupont',poste:'Ingé son façade',pole:'Son',telephone:'06 32 51 72 90',email:'marie@mail.com',disponibilites:{}},
    {id:'demo-tech-02',prenom:'Léo',nom:'Bernard',poste:'Ingé lumière',pole:'Lumière',telephone:'06 33 52 73 91',email:'leo@mail.com',disponibilites:{}},
  ],
  tournees: [{
    id:'demo-tour1', nom:"L'Atelier de Joe Hisaishi — Printemps 2027",
    cachetStatut:'defini', cachetMontant:320, dates:DATES,
    nomenclature:[{pupitre:'Cordes',nombre:5},{pupitre:'Bois',nombre:4}],
  }],
};

(async () => {
  const browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: FORMATS[format], deviceScaleFactor: 2 });

  // Court-circuite la couche données : les pages appellent CurieuxDB, on lui
  // fait rendre le jeu de démo sans réseau ni authentification.
  await ctx.addInitScript(seed => {
    window.__SEED = seed;

    // La redirection vers la connexion est bloquée au niveau du navigateur
    // (ctx.route plus bas) : location.replace n'est pas redéfinissable, et
    // neutraliser requireAdminAuth par affectation ne tiendrait pas non plus,
    // ui-helpers.js le (re)définissant en chargeant après ce script.

    window.hideCurieuxPageUntilAuth = () => {};
  }, SEED);

  // db.js déclare « const CurieuxDB » : une liaison lexicale, jamais posée sur
  // window. Aucun script injecté ne peut donc l'atteindre. On remplace le
  // fichier lui-même, au niveau réseau, par un faux qui sert le jeu de démo et
  // répond oui aux contrôles d'accès — le garde d'authentification passe alors
  // de lui-même, sans qu'on ait à bloquer la moindre redirection.
  await ctx.route('**/assets/db.js', route => route.fulfill({
    contentType: 'application/javascript; charset=utf-8',
    body: `
const __seed = ${JSON.stringify(SEED)};
const CurieuxDB = new Proxy({
  fetchAll: async t => JSON.parse(JSON.stringify(__seed[t] || [])),
  fetchOne: async () => null,
  subscribe: () => {},
  getSession: async () => ({ user:{ id:'demo', email:'demo@curieux.fr' } }),
  hasAppAccess: async () => true,
  isSuperAdmin: async () => true,
  currentRole: async () => 'admin',
  mesDemandesDispo: async () => null,
  getFicheTechniqueByToken: async () => null,
}, {
  // Toute méthode non prévue renvoie un résultat vide plutôt que de lever :
  // les pages en appellent une bonne trentaine, les énumérer serait autant
  // d'occasions d'en oublier une et de capturer un écran d'erreur.
  get: (c, p) => p in c ? c[p] : async () => null,
});
window.CurieuxDB = CurieuxDB;
`,
  }));

  for (const nom of pages) {
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(String(e).slice(0, 160)));
    page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 160)); });
    await page.goto(`${BASE}/${nom}.html`, { waitUntil:'networkidle', timeout:20000 }).catch(()=>{});
    await page.waitForTimeout(900);
    await page.evaluate(() => { document.documentElement.style.visibility = 'visible'; document.body.style.visibility = 'visible'; });

    // Un défilement horizontal sur téléphone est un défaut en soi : on le mesure.
    const debord = await page.evaluate(() => {
      // Le seul signe fiable d'un débordement est que la page défile vraiment :
      // les rectangles des enfants d'un conteneur à overflow-x:auto dépassent
      // légitimement la fenêtre et donnent sinon un faux positif.
      const largeurDoc = document.documentElement.scrollWidth;
      scrollTo(9999, 0); const defile = scrollX > 0; scrollTo(0, 0);
      const clippe = e => {
        for (let a = e.parentElement; a; a = a.parentElement) {
          const ov = getComputedStyle(a).overflowX;
          if (ov === 'auto' || ov === 'scroll' || ov === 'hidden') return true;
        }
        return false;
      };
      return { defile, largeurDoc, largeurVue: innerWidth,
        coupables: [...document.querySelectorAll('body *')]
          .filter(e => e.getBoundingClientRect().right > innerWidth + 2 && !clippe(e))
          .slice(0, 4).map(e => (e.tagName + '.' + [...e.classList].slice(0,2).join('.')).slice(0, 48)) };
    });
    const f = `${OUT}/${nom}-${format}.png`;
    await page.screenshot({ path:f, fullPage:true });
    const deborde = debord.defile;
    console.log(`${nom.padEnd(16)} ${format.padEnd(7)} ${deborde ? `⚠ DÉBORDE ${debord.largeurDoc}px > ${debord.largeurVue}px → ${debord.coupables.join(', ')}` : '✓ pas de débordement'}${erreurs.length ? ` · ${erreurs.length} erreur(s) JS : ${erreurs[0]}` : ''}`);
    await page.close();
  }
  await browser.close();
})();
