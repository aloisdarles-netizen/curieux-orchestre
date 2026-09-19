/* TEST — les quatre issues de « Enregistrer ma liste ».
   Le cas 3 est celui qui laissait le bouton figé sur « Enregistrement… ». */
const { chromium } = require('playwright-core');
const fs = require('fs');
const fx = {
  resolve: JSON.stringify([{ person_id:'mus-titulaire', person_type:'musicien' }]),
  person:  JSON.stringify([{ id:'mus-titulaire', prenom:'Camille', nom:'Durand', instrument:'Violons',
                             pupitre:'Cordes', statut_poste:'titulaire', telephone:'', email:'',
                             disponibilites:{}, disponibilites_commentaires:{}, reponses_prod:{} }]),
  roster:  JSON.stringify([
    { id:'mus-a', person_type:'musicien', prenom:'Alix',    nom:'Rinaudo', role_label:'Percussions' },
    { id:'mus-b', person_type:'musicien', prenom:'Claire',  nom:'Bernard', role_label:'Violons' },
    { id:'mus-c', person_type:'musicien', prenom:'Camille', nom:'Leroy',   role_label:'Violon 2' }]),
  prefs:   JSON.stringify([{ id:'mus-titulaire', person_type:'musicien', items:[
    { rang:1, source:'roster', personId:'mus-b', personType:'musicien' },
    { rang:2, source:'roster', personId:'mus-c', personType:'musicien' }] }]),
};
let echecs = 0;
const verifier = (nom, obtenu, attendu) => {
  const ok = obtenu === attendu;
  if (!ok) echecs++;
  console.log(`  ${ok ? '✓' : '✗'} ${nom}\n      attendu : ${JSON.stringify(attendu)}\n      obtenu  : ${JSON.stringify(obtenu)}`);
};

async function scenario(b, nom, opts) {
  const ctx = await b.newContext({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
  const p = await ctx.newPage();
  let base = JSON.parse(fx.prefs);
  await p.route(/supabase\.co/, async r => {
    const n = (r.request().url().match(/\/rpc\/([a-z_]+)/) || [])[1];
    if (n === 'resolve_person_token')     return r.fulfill({status:200,contentType:'application/json',body:fx.resolve});
    if (n === 'get_own_person_by_token')  return r.fulfill({status:200,contentType:'application/json',body:fx.person});
    if (n === 'get_roster_for_picker')    return r.fulfill({status:200,contentType:'application/json',body:fx.roster});
    if (n === 'get_own_remplacant_prefs') return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(base)});
    if (n === 'upsert_own_remplacant_prefs'){
      if (opts.refuseEcriture) return r.fulfill({status:403,contentType:'application/json',body:JSON.stringify({message:'refusé'})});
      if (!opts.baseIgnore) base[0].items = JSON.parse(r.request().postData()).p_items;
      return r.fulfill({status:204,body:''});
    }
    return r.fulfill({status:200,contentType:'application/json',body:'null'});
  });
  // Un db.js périmé : la version en cache n'expose pas la fonction d'écriture.
  if (opts.fonctionAbsente) {
    const src = fs.readFileSync(require('path').join(__dirname, '..', 'assets', 'db.js'), 'utf8')
                  .replace('getRemplacantPrefsByToken, upsertRemplacantPrefsByToken,', 'getRemplacantPrefsByToken,');
    await p.route('**/assets/db.js', r => r.fulfill({ status:200, contentType:'application/javascript', body: src }));
  }
  await p.goto('http://localhost:8099/mes-remplacants.html?token=TEST', { waitUntil:'domcontentloaded' });
  await p.evaluate(() => { document.documentElement.style.visibility='visible'; });
  await p.waitForTimeout(900);
  await p.evaluate(() => { const v=document.getElementById('curieuxNouveautes'); if(v) v.remove(); });

  await p.click('[data-edit="3"]');
  await p.fill('#rrSearchInput','Rinaudo'); await p.waitForTimeout(350);
  await (await p.$('#rrSearchResults [data-pick], #rrSearchResults button, #rrSearchResults .rr-result')).click();
  await p.waitForTimeout(300);
  await p.click('#saveBtn');
  await p.waitForTimeout(1200);

  const etat = await p.evaluate(() => ({
    statut: document.getElementById('saveStatus').textContent,
    bouton: document.getElementById('saveBtn').textContent,
    cliquable: !document.getElementById('saveBtn').disabled,
    listeEncoreLa: document.querySelectorAll('.rr-row.filled').length,
  }));
  console.log('\n' + nom);
  verifier('message', etat.statut, opts.attenduStatut);
  verifier('bouton revenu à son libellé', etat.bouton, 'Enregistrer ma liste');
  verifier('bouton de nouveau cliquable', etat.cliquable, opts.attenduCliquable);
  verifier('la saisie est conservée (3 personnes)', etat.listeEncoreLa, 3);
  await ctx.close();
}

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  await scenario(b, '1. La base prend l\'écriture', { attenduStatut:'✓ Liste enregistrée.', attenduCliquable:false });
  await scenario(b, '2. La base refuse (403)',     { refuseEcriture:true, attenduStatut:'Pas enregistré — vérifie ta connexion et réessaie.', attenduCliquable:true });
  await scenario(b, '3. db.js périmé en cache : la fonction d\'écriture manque', { fonctionAbsente:true, attenduStatut:'Pas enregistré — vérifie ta connexion et réessaie.', attenduCliquable:true });
  await scenario(b, '4. 204 rendu, mais rien d\'écrit en base', { baseIgnore:true, attenduStatut:'Enregistrement non confirmé — réessaie.', attenduCliquable:true });
  await b.close();
  console.log(echecs ? `\n${echecs} vérification(s) en échec` : '\nToutes les vérifications passent.');
  process.exit(echecs ? 1 : 0);
})();
