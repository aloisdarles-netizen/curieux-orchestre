/* ============================================================================
   « Ce qui a changé » — la fenêtre qui s'ouvre une fois, après une mise à jour.
   ============================================================================
   Une mise à jour arrivait sans un mot : le bouton avait bougé, le statut
   s'appelait autrement, la section n'était plus au même endroit — et chacun·e
   le découvrait en cherchant. On le disait sur le groupe, quand on y pensait,
   et ça ne touchait que celles et ceux qui lisaient ce jour-là.

   Ce fichier tient la liste des livraisons, la plus récente en premier. C'est
   le MAINTENEUR qui l'alimente, à la main, au moment du déploiement — en même
   temps qu'il incrémente la version de sw.js. Rien ne la génère : ce qu'on y
   écrit s'adresse à l'équipe, pas à un journal de commits, et on n'y met que
   ce qu'une personne verra ou fera autrement.

   `version` est la DATE ISO de la livraison (AAAA-MM-JJ). Deux raisons : elle
   se lit telle quelle dans la fenêtre, et l'ordre alphabétique des chaînes
   est l'ordre chronologique — la comparaison « plus récent que » n'a besoin
   d'aucun découpage. Deux livraisons le même jour se distinguent par un
   suffixe ('2026-09-10-2'), qui trie encore juste.

   La version vue par chaque personne est un réglage qui la suit d'un appareil
   à l'autre : preferences_utilisateur, page 'nouveautes', { vue }. Le
   localStorage double la mémoire — repli tant que la migration n'est pas
   jouée, ou hors ligne — et on retient la plus récente des deux : une écriture
   serveur qui n'est pas partie ne doit pas rouvrir la fenêtre au prochain
   passage.

   Ne s'affiche que derrière requireAdminAuth / requireSuperAdminAuth (voir
   brand-assets.js) : jamais sur une page ouverte par lien personnel — ces
   pages n'appellent pas les gardes, et les musicien·nes n'ont rien à faire
   de nos changements de bandeau.
   ============================================================================ */

const CURIEUX_NOUVEAUTES = [
  {
    version: '2026-09-10-2',
    titre: 'Les messages s’écrivent',
    points: [
      "Sur la page Messages, le texte est maintenant modifiable : on part d'un modèle — ou d'une page vide avec « Message libre » — et on écrit ce qu'on veut.",
      "Les mots entre accolades ({prenom}, {projet}, {dates}, {periode}, {lien}, {butoir}) sont remplacés à l'envoi, personne par personne : un seul message écrit, et chacun·e reçoit le sien avec son prénom et son lien.",
      "« Envoyer aux 12, un par un » fait défiler les destinataires : le texte exact, le canal, un bouton. On voit où on en est, et on peut s'arrêter puis reprendre.",
      "Ce qui part est gardé avec sa date et son texte : un mois plus tard, on peut relire ce qu'on avait écrit à quelqu'un.",
    ],
  },
  {
    version: '2026-09-10',
    titre: 'Cachets, récapitulatif, budget',
    points: [
      "Le bouton « Cachet » d'un recording fonctionne à nouveau, et pose un montant commun sur toutes les séances — ou seulement sur celles que tu as cochées.",
      "Le récapitulatif d'un projet s'exporte en PDF au format calendrier, et s'envoie depuis la page Messages.",
      "Le statut « Recherche » d'une date s'appelle maintenant « À l'étude » : rien n'est réservé, on regarde seulement si la date est jouable.",
      "Le budget a sa propre section dans le bandeau — tableau de bord, devis et clients — au lieu de vivre sous Admin.",
      "L'espace Comm, qui ne servait pas, est retiré.",
      "La « vue d'ensemble » s'appelle désormais le tableau de service. Ses lignes se trient et se rangent à ta main, et tes réglages te suivent d'un appareil à l'autre.",
      "Sur téléphone, l'espace musicien·ne ouvre sur le dossier et les dispos ; les précisions se lisent d'un clic au lieu de s'étaler sous les noms.",
      "Une page Documents rassemble les récapitulatifs PDF, et le chant a son pupitre.",
    ],
  },
];

(function(){
  const CLE_LOCALE = 'curieuxNouveautesVue';
  const PAGE_PREF = 'nouveautes';

  // L'entrée la plus récente, sans se fier à l'ordre du tableau : une entrée
  // insérée au mauvais endroit ne doit pas cacher une livraison.
  function derniereVersion(){
    return CURIEUX_NOUVEAUTES.reduce((max, e)=> (e && e.version > max ? e.version : max), '');
  }

  function lireLocale(){
    try{ return localStorage.getItem(CLE_LOCALE) || ''; }catch(e){ return ''; }
  }
  function ecrireLocale(version){
    try{ localStorage.setItem(CLE_LOCALE, version); }catch(e){}
  }

  // La plus récente des deux mémoires, voir l'en-tête.
  async function versionVue(){
    let serveur = '';
    try{
      if(typeof CurieuxDB !== 'undefined' && CurieuxDB.fetchPreferences){
        const prefs = await CurieuxDB.fetchPreferences(PAGE_PREF);
        if(prefs && typeof prefs.vue === 'string') serveur = prefs.vue;
      }
    }catch(e){}
    const locale = lireLocale();
    return serveur > locale ? serveur : locale;
  }

  // Double écriture, sans attendre le serveur : la fenêtre se ferme tout de
  // suite, et un échec d'envoi n'a pas de conséquence visible — le
  // localStorage retient déjà la version.
  function marquerVue(version){
    ecrireLocale(version);
    try{
      if(typeof CurieuxDB !== 'undefined' && CurieuxDB.savePreferences){
        Promise.resolve(CurieuxDB.savePreferences(PAGE_PREF, { vue: version })).catch(()=>{});
      }
    }catch(e){}
  }

  // « 10 septembre 2026 ». Le T12:00 évite qu'un fuseau à l'ouest fasse
  // reculer la date d'un jour ; une version qui n'est pas une date s'affiche
  // telle quelle.
  function dateLisible(version){
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(version || '');
    if(!m) return version || '';
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`);
    if(isNaN(d)) return version;
    return d.toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
  }

  function echapper(s){
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Le style vit ici et non dans base.css : la fenêtre n'a qu'un seul
  // gabarit, et base.css est un actif que d'autres chantiers touchent.
  function poserStyle(){
    if(document.getElementById('curieux-nouveautes-css')) return;
    const css = document.createElement('style');
    css.id = 'curieux-nouveautes-css';
    css.textContent = `
      .co-nouveautes-voile{
        position:fixed; inset:0; z-index:10000; background:rgba(20,15,10,.5);
        display:flex; align-items:center; justify-content:center; padding:20px; overflow-y:auto;
      }
      .co-nouveautes{
        background:var(--card); color:var(--text); border:1px solid var(--border);
        border-radius:var(--radius-lg, 22px); max-width:540px; width:100%; max-height:88vh;
        overflow-y:auto; padding:28px 28px 22px; margin:auto;
        font-family:var(--font-body, inherit); font-size:14px; line-height:1.55;
        box-shadow:0 18px 50px rgba(20,15,10,.22); animation:coFadeUp .25s ease-out;
        outline:none;
      }
      .co-nouveautes h2{
        font-family:var(--font-display); font-size:26px; font-weight:500;
        color:var(--accent); margin:0 0 4px;
      }
      .co-nouveautes-sous{ font-size:12.5px; color:var(--muted); margin:0 0 18px; }
      .co-nouveautes-livraison + .co-nouveautes-livraison{
        margin-top:18px; padding-top:16px; border-top:1px solid var(--border);
      }
      .co-nouveautes-date{
        font-size:11px; font-weight:800; letter-spacing:.06em; text-transform:uppercase;
        color:var(--muted); margin:0 0 2px;
      }
      .co-nouveautes h3{ font-size:15px; font-weight:700; margin:0 0 8px; color:var(--text); }
      .co-nouveautes ul{ margin:0; padding-left:20px; }
      .co-nouveautes li{ margin:0 0 7px; }
      .co-nouveautes li::marker{ color:var(--accent); }
      .co-nouveautes-actions{ display:flex; justify-content:flex-end; margin-top:22px; }
      @media (max-width:480px){ .co-nouveautes{ padding:22px 18px 18px; } }
    `;
    document.head.appendChild(css);
  }

  // Ouvre la fenêtre sur les entrées données. À la fermeture — « Compris »,
  // Échap ou clic sur le voile — la version la plus récente affichée est
  // retenue comme vue, que la fenêtre soit venue d'elle-même ou du pied de
  // page : dans les deux cas la personne a eu les nouveautés sous les yeux.
  function ouvrirNouveautes(entrees){
    if(document.getElementById('curieuxNouveautes')) return;
    if(!document.body || !entrees || !entrees.length) return;
    poserStyle();

    const plusieurs = entrees.length > 1;
    const voile = document.createElement('div');
    voile.className = 'co-nouveautes-voile';
    voile.id = 'curieuxNouveautes';
    voile.innerHTML = `
      <div class="co-nouveautes" role="dialog" aria-modal="true" aria-labelledby="curieuxNouveautesTitre" tabindex="-1">
        <h2 id="curieuxNouveautesTitre">Ce qui a changé</h2>
        <p class="co-nouveautes-sous">${plusieurs
          ? `${entrees.length} mises à jour depuis ton dernier passage.`
          : `Mise à jour du ${echapper(dateLisible(entrees[0].version))}.`}</p>
        ${entrees.map(e => `
          <section class="co-nouveautes-livraison">
            ${plusieurs ? `<p class="co-nouveautes-date">${echapper(dateLisible(e.version))}</p>` : ''}
            ${e.titre ? `<h3>${echapper(e.titre)}</h3>` : ''}
            <ul>${(e.points || []).map(p => `<li>${echapper(p)}</li>`).join('')}</ul>
          </section>`).join('')}
        <div class="co-nouveautes-actions">
          <button type="button" class="co-btn primary" id="curieuxNouveautesOk">Compris</button>
        </div>
      </div>`;

    const rendreFocus = document.activeElement;
    const carte = voile.querySelector('.co-nouveautes');
    const versionAffichee = entrees.reduce((max, e)=> (e.version > max ? e.version : max), '');

    function fermer(){
      document.removeEventListener('keydown', surTouche);
      voile.remove();
      marquerVue(versionAffichee);
      try{ if(rendreFocus && rendreFocus.focus) rendreFocus.focus(); }catch(e){}
    }
    // Le focus reste dans la fenêtre : Tab depuis le bouton revient à la
    // carte, Maj+Tab depuis la carte va au bouton. Il n'y a que ces deux
    // arrêts, inutile de calculer une liste de focusables.
    function surTouche(ev){
      if(ev.key === 'Escape'){ ev.preventDefault(); fermer(); return; }
      if(ev.key !== 'Tab') return;
      const bouton = document.getElementById('curieuxNouveautesOk');
      if(!bouton) return;
      const arrets = [carte, bouton];
      const i = arrets.indexOf(document.activeElement);
      const suivant = ev.shiftKey ? (i <= 0 ? bouton : carte) : (i >= 1 || i === -1 ? carte : bouton);
      ev.preventDefault();
      suivant.focus();
    }
    voile.addEventListener('click', (ev)=>{ if(ev.target === voile) fermer(); });
    voile.querySelector('#curieuxNouveautesOk').addEventListener('click', fermer);
    document.addEventListener('keydown', surTouche);

    document.body.appendChild(voile);
    carte.focus();
  }

  // Le lien du pied de page, qui rouvre toutes les entrées à la demande. Le
  // pied de page est posé par nav.js à DOMContentLoaded, donc avant que les
  // gardes n'appellent afficherNouveautesSiBesoin : à ce moment il existe.
  function injecterLienNouveautes(){
    const pied = document.querySelector('.co-footer');
    if(!pied || pied.querySelector('#curieuxNouveautesLien')) return;
    if(!CURIEUX_NOUVEAUTES.length) return;
    const a = document.createElement('a');
    a.href = '#';
    a.id = 'curieuxNouveautesLien';
    a.textContent = 'Nouveautés';
    a.addEventListener('click', (ev)=>{ ev.preventDefault(); ouvrirNouveautes(CURIEUX_NOUVEAUTES.slice()); });
    pied.appendChild(a);
  }

  // Appelée par les gardes après la révélation de la page. Ne lève jamais :
  // une fenêtre d'information ne doit pas pouvoir faire échouer la garde.
  async function afficherNouveautesSiBesoin(){
    try{
      injecterLienNouveautes();
      const derniere = derniereVersion();
      if(!derniere) return;
      const vue = await versionVue();
      if(vue >= derniere) return;
      // Quelqu'un qui n'a jamais rien vu voit la dernière livraison, pas tout
      // l'historique : les entrées plus anciennes ne lui diraient rien.
      const nonVues = vue
        ? CURIEUX_NOUVEAUTES.filter(e => e && e.version > vue)
        : CURIEUX_NOUVEAUTES.filter(e => e && e.version === derniere);
      nonVues.sort((a, b)=> (a.version < b.version ? 1 : a.version > b.version ? -1 : 0));
      ouvrirNouveautes(nonVues);
    }catch(e){
      console.warn('[nouveautes]', e && e.message ? e.message : e);
    }
  }

  window.afficherNouveautesSiBesoin = afficherNouveautesSiBesoin;
  window.ouvrirNouveautes = ouvrirNouveautes;
})();
