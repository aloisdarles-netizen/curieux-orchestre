// Recherche globale (musicien·nes, technicien·nes, tournées), ajoutée à la nav de
// chaque page admin via initGlobalSearch(document.querySelector('.page-nav')) — voir
// le bas de chaque page. Interroge la base à chaque frappe (débattue) plutôt que de
// dépendre du cache de chaque page (noms de variables différents partout, pas de
// composant partagé) : ces tables restent petites, le coût est négligeable.
//
// Résultat musicien/technicien -> lien "page?q=nom" : la page cible préremplit son
// propre champ de recherche local avec ce nom (voir initData() de chaque page).
// Résultat tournée -> lien "tournees.html#tournee-ID" : les cartes de tournée ont déjà
// cet id, et tournees.html sait déjà faire défiler jusqu'à un hash (scrollToHash()).
(function(){
  const STYLE = `
    .gsearch-wrap{position:relative; margin-left:auto;}
    .gsearch-input{
      padding:7px 12px; border:1px solid var(--border); border-radius:20px; font-size:12.5px;
      background:var(--card); color:var(--text); font-family:inherit; width:170px; transition:width .2s;
    }
    .gsearch-input:focus{width:230px; outline:2px solid var(--accent); outline-offset:1px;}
    .gsearch-results{
      display:none; position:absolute; top:calc(100% + 6px); right:0; min-width:280px; max-width:340px;
      background:var(--card); border:1px solid var(--border); border-radius:12px; box-shadow:0 12px 30px rgba(20,15,10,.16);
      padding:6px; z-index:60; max-height:360px; overflow-y:auto;
    }
    .gsearch-result{
      display:flex; flex-direction:column; gap:1px; padding:8px 10px; border-radius:8px;
      text-decoration:none; color:var(--text);
    }
    .gsearch-result:hover, .gsearch-result.active{background:var(--accent-tint);}
    .gsearch-result-name{font-weight:700; font-size:13px;}
    .gsearch-result-sub{font-size:11px; color:var(--muted);}
    .gsearch-empty{padding:10px; font-size:12.5px; color:var(--muted); text-align:center;}
    @media (max-width:640px){ .gsearch-input, .gsearch-input:focus{width:120px;} }
  `;

  function escapeHtml(str){
    return String(str || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  /* Les écrans eux-mêmes, lus dans le modèle du bandeau (assets/nav.js).
   *
   * Ils manquaient : la recherche ne trouvait que des données — des personnes
   * et des tournées — jamais une page. Tant que les vingt-six écrans tenaient
   * à plat dans le bandeau, ça se voyait peu ; avec des déroulants, chaque
   * écran est à deux gestes, et une recherche qui ne sait pas dire « Matériel »
   * ne peut pas compenser cette profondeur.
   *
   * Le libellé du groupe et celui de la section entrent dans le texte cherché :
   * « budget » trouve « Suivi des dépenses », « studio » trouve « Feuilles de
   * studio ». Les doublons sont écartés par href — une même page peut être
   * déclarée sous deux clés (tournees.html et tournees.html?type=recording).
   */
  // Personne ne tape « matériel » avec son accent dans un champ de recherche.
  function sansAccent(s){
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function chercherPages(q){
    if(typeof curieuxModele !== 'function') return [];
    const aigu = sansAccent(q);
    const vus = new Set();
    const out = [];
    curieuxModele().forEach(sec => {
      /* Une section réservée ne se cherche que si le bandeau l'affiche, donc
         si le compte y a droit (voir ajouterEntreesReservees) : sans ce filtre,
         taper « budget » proposerait à toute l'équipe quatre portes fermées.
         Tant que la réponse d'isSuperAdmin n'est pas arrivée, elles restent
         absentes — même prudence que le bandeau. */
      if(typeof curieuxDroitSection === 'function' && curieuxDroitSection(sec)
         && typeof estSectionAffichee === 'function' && !estSectionAffichee(sec)) return;
      const entrees = (sec.entrees && sec.entrees.length)
        ? sec.entrees
        : [{ libelle: sec.libelle, href: sec.href }];
      entrees.forEach(e => {
        if(vus.has(e.href)) return;
        const hay = sansAccent([e.libelle, e.groupe, sec.libelle].filter(Boolean).join(' '));
        if(!hay.includes(aigu)) return;
        vus.add(e.href);
        out.push({
          type: 'page',
          label: e.libelle,
          sub: e.groupe ? `${sec.libelle} · ${e.groupe}` : sec.libelle,
          href: e.href,
        });
      });
    });
    return out.slice(0, 5);
  }

  async function runSearch(query){
    const q = query.trim().toLowerCase();
    if(q.length < 2) return [];
    const pages = chercherPages(q);
    if(typeof CurieuxDB === 'undefined') return pages;
    // Les écrans se cherchent dans le modèle du bandeau, en mémoire : ils
    // doivent rester trouvables quand la base ne répond pas. Sans ce garde,
    // une table injoignable emportait tout le résultat, y compris la partie
    // qui n'avait rien demandé à personne.
    let musiciens = [], techniciens = [], tournees = [];
    try{
      [musiciens, techniciens, tournees] = await Promise.all([
        CurieuxDB.fetchAll('musiciens'),
        CurieuxDB.fetchAll('techniciens'),
        CurieuxDB.fetchAll('tournees'),
      ]);
    }catch(e){ return pages; }
    // Les écrans en tête : on tape « matériel » pour y aller, pas pour lire la
    // liste des personnes dont le poste contient le mot.
    const results = pages.slice();
    musiciens.forEach(m=>{
      const name = `${m.prenom || ''} ${m.nom || ''}`.trim();
      const hay = [m.prenom, m.nom, m.instrument, m.pupitre].filter(Boolean).join(' ').toLowerCase();
      if(hay.includes(q)) results.push({ type:'musicien', label: name || 'Sans nom', sub: m.instrument || 'Musicien·ne', href: `annuaire.html?q=${encodeURIComponent(name)}` });
    });
    techniciens.forEach(t=>{
      const name = `${t.prenom || ''} ${t.nom || ''}`.trim();
      const hay = [t.prenom, t.nom, t.poste, t.pole].filter(Boolean).join(' ').toLowerCase();
      if(hay.includes(q)) results.push({ type:'technicien', label: name || 'Sans nom', sub: t.poste || 'Technicien·ne', href: `techniciens.html?q=${encodeURIComponent(name)}` });
    });
    tournees.forEach(t=>{
      if((t.nom || '').toLowerCase().includes(q)){
        // Un recording vit dans la même page, filtrée : sans ?type=recording,
        // le lien ouvrirait la liste des tournées, où sa carte n'existe pas.
        const reco = t.type === 'recording';
        results.push({
          type: 'tournee',
          label: t.nom || (reco ? 'Recording sans nom' : 'Tournée sans nom'),
          sub: reco ? 'Recording' : 'Tournée',
          href: `tournees.html${reco ? '?type=recording' : ''}#tournee-${t.id}`,
        });
      }
    });
    return results.slice(0, 12);
  }

  const TYPE_LABEL = { page:'Écran', musicien:'Musicien·ne', technicien:'Technicien·ne', tournee:'Tournée' };

  window.initGlobalSearch = function(navEl){
    if(!navEl || document.getElementById('globalSearchWrap')) return;
    if(!document.getElementById('gsearchStyle')){
      const style = document.createElement('style');
      style.id = 'gsearchStyle';
      style.textContent = STYLE;
      document.head.appendChild(style);
    }

    const wrap = document.createElement('div');
    wrap.id = 'globalSearchWrap';
    wrap.className = 'gsearch-wrap';
    wrap.innerHTML = `
      <input type="text" id="globalSearchInput" class="gsearch-input" placeholder="Rechercher…  ⌘K" autocomplete="off">
      <div id="globalSearchResults" class="gsearch-results"></div>
    `;
    navEl.appendChild(wrap);

    const input = wrap.querySelector('#globalSearchInput');
    const box = wrap.querySelector('#globalSearchResults');
    let debounceTimer = null;
    let activeIndex = -1;

    function renderResults(results){
      activeIndex = -1;
      if(results.length === 0){
        box.innerHTML = `<div class="gsearch-empty">Aucun résultat.</div>`;
        box.style.display = 'block';
        return;
      }
      box.innerHTML = results.map(r=> `
        <a class="gsearch-result" href="${r.href}">
          <span class="gsearch-result-name">${escapeHtml(r.label)}</span>
          <span class="gsearch-result-sub">${escapeHtml(TYPE_LABEL[r.type])} · ${escapeHtml(r.sub)}</span>
        </a>
      `).join('');
      box.style.display = 'block';
    }

    input.addEventListener('input', ()=>{
      clearTimeout(debounceTimer);
      const q = input.value;
      if(q.trim().length < 2){ box.style.display = 'none'; return; }
      debounceTimer = setTimeout(async ()=>{
        try { const r = await runSearch(q); renderResults(r); } catch(e){ /* silent */ }
      }, 200);
    });
    input.addEventListener('keydown', (e)=>{
      const items = box.querySelectorAll('.gsearch-result');
      if(!items.length) return;
      if(e.key === 'ArrowDown'){ e.preventDefault(); activeIndex = Math.min(activeIndex + 1, items.length - 1); }
      else if(e.key === 'ArrowUp'){ e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); }
      else if(e.key === 'Enter'){ if(activeIndex >= 0) items[activeIndex].click(); return; }
      else if(e.key === 'Escape'){ box.style.display = 'none'; input.blur(); return; }
      else return;
      items.forEach((el, i)=> el.classList.toggle('active', i === activeIndex));
    });
    document.addEventListener('click', (e)=>{
      if(!wrap.contains(e.target)) box.style.display = 'none';
    });
  };
})();
