/* TEST — « Suivi des dispos » ne recrée plus les demandes quand il n'a pas pu
   les lire.
   Le 18/09, une lecture échouée a été prise pour un inventaire vide et 85
   demandes déjà existantes ont été recréées. */
const { chromium } = require('playwright-core');

const DEMAIN = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
const TOURNEES = [{ id:'tour-1', nom:'Projet test', type:'tournee',
  dates:[{ id:'d1', date:DEMAIN, statut:'validee' }], recording:{}, nomenclature:[],
  cachet_statut:'non_defini', cachet_technicien_statut:'non_defini', created_at:'2026-01-01T00:00:00Z' }];
const MUSICIENS = [1,2].map(i=> ({ id:'mus-'+i, prenom:'P'+i, nom:'N'+i, instrument:'Violons',
  pupitre:'Cordes', statut_poste:'titulaire', telephone:'', email:'', notes:'',
  disponibilites:{}, disponibilites_commentaires:{}, reponses_prod:{}, created_at:'2026-01-01T00:00:00Z' }));

async function lancer(browser, { lectureEchoue }) {
  const ctx = await browser.newContext({ viewport:{ width:1280, height:900 } });
  // Une session admin factice : la page est protégée, et c'est son
  // comportement APRÈS l'entrée qui nous intéresse.
  await ctx.addInitScript(() => {
    const dans1h = Math.floor(Date.now()/1000) + 3600;
    localStorage.setItem('sb-nffqcvysweidquouulzs-auth-token', JSON.stringify({
      access_token:'faux', token_type:'bearer', expires_at:dans1h, expires_in:3600,
      refresh_token:'faux', user:{ id:'u1', email:'test@exemple.fr', aud:'authenticated', role:'authenticated' },
    }));
  });
  const page = await ctx.newPage();
  const ecritures = [];
  await page.route(/supabase\.co/, async route => {
    const r = route.request(), u = r.url();
    const table = (u.match(/\/rest\/v1\/([a-z_]+)/) || [])[1];
    if (r.method() !== 'GET') { ecritures.push(r.method() + ' ' + table + ' ' + (r.postData()||'').slice(0,120)); 
      return route.fulfill({ status:201, contentType:'application/json', body:'[]' }); }
    if (table === 'dispo_demandes' && lectureEchoue)
      return route.fulfill({ status:500, contentType:'application/json',
                             body: JSON.stringify({ message:'panne passagère' }) });
    if (table === 'infos_sociales_admins')
      return route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ role:'admin' }) });
    const corps = table === 'tournees' ? TOURNEES : table === 'musiciens' ? MUSICIENS : [];
    return route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(corps) });
  });
  await page.goto('http://localhost:8099/suivi-dispo.html', { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(3000);
  const ou = page.url();
  if (/admin-login/.test(ou)) throw new Error('la page a renvoyé vers la connexion : ' + ou);
  await ctx.close();
  return ecritures.filter(e=> e.includes('dispo_demandes'));
}

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let echecs = 0;
  const verifier = (nom, ok, detail) => { if(!ok) echecs++; console.log(`  ${ok?'✓':'✗'} ${nom}${detail?'\n      '+detail:''}`); };

  console.log('\nA. La lecture réussit et la table est vraiment vide → on pose les liens manquants');
  const a = await lancer(b, { lectureEchoue:false });
  verifier('des demandes sont créées', a.length > 0, a.length + ' écriture(s) : ' + (a[0]||'aucune'));

  console.log('\nB. La lecture ÉCHOUE (500) → on ne crée rien du tout');
  const bb = await lancer(b, { lectureEchoue:true });
  verifier('aucune demande créée', bb.length === 0, bb.length ? bb.join('\n      ') : 'aucune écriture, comme attendu');

  await b.close();
  console.log(echecs ? `\n${echecs} vérification(s) en échec` : '\nToutes les vérifications passent.');
  process.exit(echecs ? 1 : 0);
})();
