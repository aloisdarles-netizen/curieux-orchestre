/* ============================================================================
   La vue « Mes dates » — ce qui est confirmé, ce qui est encore en option
   ============================================================================
   Ce module a d'abord été une page. Il en est devenu un morceau, le jour où
   l'espace personnel a dû l'accueillir en tête : deux copies du même rendu
   auraient divergé au premier ajustement, et c'est le genre de divergence qui
   se découvre par un musicien qui ne lit pas la même chose que son voisin.

   On lui donne un conteneur et la charge rendue par la fonction SQL mes_dates ;
   il pose sa feuille de style (une fois), rend les colonnes ou le calendrier,
   et retient la forme choisie d'une visite à l'autre.

   Trois règles gouvernent tout ce qui suit.

   1. Un statut de date est un mot de production. Adressé à quelqu'un qui joue,
      il doit dire ce qu'il faut FAIRE :
        validée   → c'est signé, tu peux compter dessus ;
        option    → la salle nous tient la date, rien n'est signé : garde-la
                    sans t'engager ailleurs ;
        à l'étude → rien n'est posé, on demande juste ta dispo ;
        annulée   → libère ta journée.
      Le mot est porté par l'en-tête de sa colonne, qui reste collé en haut
      pendant qu'on descend : à la vingtième ligne comme à la première, on sait
      ce qu'on lit. Une première version répétait la phrase sur chaque carte —
      vingt fois la même phrase, et la page devenait illisible à force de se
      répéter.

   2. Le statut de la DATE et la présence de la PERSONNE sont deux choses
      différentes, et c'est leur croisement qui décide de la colonne (voir
      groupeDe). Une date validée où l'on ne joue pas a d'ailleurs sa colonne à
      elle, « Tu es libre », qui rend la journée là où « Validée » dirait d'y
      compter. Toutes les dates que la base renvoie entrent dans les
      colonnes, y compris celles où l'on nous a seulement demandé notre dispo :
      on nous a demandé de les tenir, nous devons apprendre ici qu'elles sont
      posées ou tombées — pas par un collègue.

   3. Deux formes, deux questions. Les colonnes répondent à « sur quoi puis-je
      compter ? », le calendrier à « suis-je pris le 14 ? ». Aucune ne se répond
      bien dans la forme de l'autre.
============================================================================ */
const CurieuxMesDates = (function(){

  const MOIS_FR = ['janvier','février','mars','avril','mai','juin',
                   'juillet','août','septembre','octobre','novembre','décembre'];
  const JOURS_FR = ['lun.','mar.','mer.','jeu.','ven.','sam.','dim.'];

  /* Découpage de la chaîne ISO plutôt que new Date() : selon le fuseau, minuit
     décale la date d'un jour, et une date de concert fausse d'un jour est pire
     que pas de date du tout. Pour le jour de la semaine, on passe par Date.UTC,
     qui ne connaît pas de fuseau. */
  function partsDe(iso){
    const [a, m, j] = String(iso || '').split('-').map(n=> parseInt(n, 10));
    return { a, m, j };
  }
  function jourNumero(iso){ const p = partsDe(iso); return p.j || 0; }
  function jourSemaine(iso){
    const p = partsDe(iso);
    if(!p.j) return '';
    return JOURS_FR[(new Date(Date.UTC(p.a, p.m - 1, p.j)).getUTCDay() + 6) % 7];
  }
  function jourLong(iso){
    const p = partsDe(iso);
    return p.j ? `${p.j} ${MOIS_FR[p.m - 1] || ''}` : '';
  }
  function moisAnnee(cle){
    const [a, m] = String(cle || '').split('-');
    return `${MOIS_FR[parseInt(m, 10) - 1] || ''} ${a}`;
  }
  function moisDe(iso){ return String(iso || '').slice(0, 7); }

  // « Mis à jour le 4 septembre à 16 h 28 » — l'heure vient de la base, pas du
  // navigateur : une page qui annonce sa fraîcheur doit la tenir de là où vit
  // la donnée.
  function fraicheur(isoUtc){
    const d = new Date(isoUtc);
    if(isNaN(d)) return '';
    const jour = d.toLocaleDateString('fr-FR', { day:'numeric', month:'long' });
    const heure = d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }).replace(':', ' h ');
    return `Mis à jour le ${jour} à ${heure}`;
  }

  const STATUT_MOT = { validee:'Validée', option:'Option', recherche:"À l'étude", annulee:'Annulée' };
  /* Le mot des GROUPES, qui ne sont pas tout à fait les statuts : une date
     validée où l'on ne joue pas n'est pas « validée » de notre point de vue,
     c'est une journée rendue. */
  const GROUPE_MOT = Object.assign({}, STATUT_MOT, { libre:'Tu es libre' });
  /* Le rang décide de la couleur d'une journée qui porte deux projets. Il
     répond à « suis-je pris ce jour-là ? », pas à « quel est le statut le plus
     avancé ? » : une option où l'on joue passe donc devant une date validée où
     l'on ne joue pas — la première peut m'occuper, la seconde jamais. */
  const RANG_STATUT = { validee:0, option:1, recherche:2, annulee:3, libre:4 };
  const LIBELLE_DISPO = { indispo:"tu t'es dit indispo", incertain:'tu as répondu « à confirmer »' };

  function statutDe(d){ return STATUT_MOT[d.statut] ? d.statut : 'option'; }

  const COLONNES = [
    { cle:'validee',   titre:'Validée',   dit:"C'est signé, et tu es dessus. Tu peux compter sur ces dates.",
      vide:"Rien de signé pour l'instant." },
    { cle:'option',    titre:'Option',    dit:"La salle nous tient la date, rien n'est signé. Garde-la sans t'engager ailleurs.",
      vide:'Aucune option en cours.' },
    { cle:'recherche', titre:"À l'étude", dit:"Rien n'est posé : on te demande juste ta dispo. Ne bloque pas ta journée.",
      vide:"Aucune date à l'étude." },
    { cle:'annulee',   titre:'Annulée',   dit:'Ces dates ne se feront pas. Tu peux libérer ces journées.',
      vide:'', siVide:'masquer' },
    /* Le cinquième cas, qu'il fallait bien nommer : la date est confirmée, on
       t'avait demandé ta dispo, et tu n'es pas dessus. La ranger sous
       « Validée » aurait été un contresens ; la taire aurait été pire — la
       personne garde sa soirée pour rien.

       Elle s'est d'abord appelée « Sans toi ». C'était court, exact, et ça
       tombait comme un refus : la personne ouvre son espace, et une pastille
       lui annonce qu'on s'est passé d'elle. Or ce n'est pas ce que la colonne
       a à dire. Elle a à dire qu'une journée qu'on lui avait demandé de tenir
       vient de se libérer — une bonne nouvelle, du point de vue de qui la
       lit. Le titre parle donc d'elle, pas de son absence. */
    { cle:'libre',     titre:'Tu es libre', dit:"Ces dates sont confirmées et ne te concernent pas : ces journées sont à toi.",
      vide:'', siVide:'masquer' },
  ];

  /* Pour les trois statuts autres que « validée », la conduite est la même
     qu'on soit distribué ou seulement sollicité : une option se garde, une
     recherche ne se bloque pas, une annulation se libère. Ils ne se dédoublent
     donc pas. */
  function groupeDe(d){
    const st = statutDe(d);
    if(st === 'validee') return d.affecte ? 'validee' : 'libre';
    return st;
  }

  // --- Une date, une ligne -------------------------------------------------
  function ligne(d, sansProjet){
    const st = statutDe(d);
    const lieu = [d.ville, d.lieu].filter(Boolean).join(' · ');
    const notes = [];

    if(st === 'option' && d.optionExpire){
      notes.push(`<span class="l-note butoir">option jusqu'au ${escapeHtml(jourLong(d.optionExpire))}</span>`);
    }
    /* Trois colonnes mélangent les dates où l'on est distribué et celles où
       l'on nous a seulement demandé notre dispo : il faut donc dire lesquelles.
       Pas « tu joues » sur une option — rien n'est signé, et le mot vaudrait
       promesse ; « pressenti·e », qui est exactement ce que c'est. */
    if(d.affecte && st !== 'validee'){
      notes.push(`<span class="l-note moi">${st === 'annulee' ? 'tu étais dessus' : 'tu es pressenti·e'}</span>`);
    }
    // Sa propre réponse, rappelée seulement quand elle manque ou qu'elle
    // contredit l'affectation : le reste du temps, c'est du bruit.
    if(st !== 'annulee'){
      const rep = d.maDispo || '';
      if(!rep) notes.push('<span class="l-note manque">ta dispo reste à donner</span>');
      else if(rep !== 'dispo') notes.push(`<span class="l-note indispo">${escapeHtml(LIBELLE_DISPO[rep] || rep)}</span>`);
    }

    /* Quand toutes les dates d'un panneau viennent du même projet, son nom est
       écrit dans l'en-tête et disparaît des lignes. « EXPEDITION 33 – 2027 »
       répété vingt-quatre fois n'apprend rien à personne et vole la place de la
       seule chose qui change d'une ligne à l'autre : la ville. */
    const titre = sansProjet
      ? escapeHtml(lieu || 'lieu à venir')
      : escapeHtml(d.tourneeNom || (d.tourneeType === 'recording' ? 'Recording' : 'Projet'));
    const dessous = sansProjet ? '' : `<span>${escapeHtml(lieu || 'lieu à venir')}</span>`;

    return `<div class="ligne${st === 'annulee' ? ' barree' : ''}">
      <span class="l-jour">${escapeHtml(String(jourNumero(d.date)))}<small>${escapeHtml(jourSemaine(d.date))}</small></span>
      <span class="l-ou"><b>${titre}</b>${dessous}${notes.join('')}</span>
    </div>`;
  }

  function unSeulProjet(dates){
    const noms = new Set(dates.map(d=> d.tourneeNom || ''));
    return noms.size === 1 ? [...noms][0] : '';
  }

  function parMois(dates, sansProjet){
    let courant = '';
    return dates.map(d=>{
      let tete = '';
      if(moisDe(d.date) !== courant){
        courant = moisDe(d.date);
        tete = `<div class="mois">${escapeHtml(moisAnnee(courant))}</div>`;
      }
      return tete + ligne(d, sansProjet);
    }).join('');
  }

  // --- La grille d'un mois -------------------------------------------------
  function grilleMois(cle, dates){
    const [a, m] = cle.split('-').map(Number);
    const decalage = (new Date(Date.UTC(a, m - 1, 1)).getUTCDay() + 6) % 7;
    const nbJours = new Date(Date.UTC(a, m, 0)).getUTCDate();

    const parJour = new Map();
    dates.forEach(d=>{
      const j = jourNumero(d.date);
      if(!parJour.has(j)) parJour.set(j, []);
      parJour.get(j).push(d);
    });

    const cases = ['L','M','M','J','V','S','D'].map(n=> `<span class="cal-nom">${n}</span>`);
    for(let i = 0; i < decalage; i++) cases.push('<span class="cal-case vide"></span>');
    for(let j = 1; j <= nbJours; j++){
      const dus = parJour.get(j) || [];
      if(!dus.length){ cases.push(`<span class="cal-case">${j}</span>`); continue; }
      /* La couleur suit le GROUPE et non le statut brut.
         ---------------------------------------------------------------------
         La grille peignait la couleur du statut de la DATE, sans regarder si
         l'on est dessus : une date validée où l'on ne joue pas était aussi
         verte qu'une où l'on joue, à un point de quatre pixels près. On lisait
         donc « je travaille » sur une journée qui était libre — l'erreur la
         plus coûteuse que cette page puisse faire, et dans le mauvais sens :
         on garde une soirée pour rien, ou on refuse autre chose.
         Ces journées-là ont maintenant leur propre allure — le vert en
         contour, pas en aplat — et leur mot dans la légende. Le point sous le
         chiffre reste, pour les options et les recherches où l'on est
         distribué·e : là, la nuance est réelle et la couleur ne la dit pas.

         Deux projets le même jour : c'est le plus engageant qui gagne, au sens
         de RANG_STATUT — celui qui risque de m'occuper. */
      const st = dus.map(groupeDe).sort((x, y)=> RANG_STATUT[x] - RANG_STATUT[y])[0];
      const moi = dus.some(x=> x.affecte);
      const titre = dus.map(x=> `${x.tourneeNom || 'Projet'} — ${GROUPE_MOT[groupeDe(x)]}${x.ville ? ' · ' + x.ville : ''}`).join(' / ');
      /* Une case pleine se touche.
         ---------------------------------------------------------------------
         Le calendrier disait la COULEUR d'une journée, jamais son nom. On y
         voyait un carré vert le 12 mars sans pouvoir apprendre de quel projet
         il s'agissait : l'infobulle du titre n'existe pas au doigt, et c'est
         au doigt que cette page se lit. La case devient donc un bouton, et le
         détail s'écrit sous la grille — projet, ville, salle, statut, et le
         chemin vers ses dispos quand une demande est en cours. */
      cases.push(`<button type="button" class="cal-case pleine ${escapeAttr(st)}${moi ? ' moi' : ''}"
        data-jour="${escapeAttr(dus[0].date)}" title="${escapeAttr(titre)}"
        aria-label="${escapeAttr(jourLong(dus[0].date) + ' — ' + titre)}">${j}</button>`);
    }
    return `<div class="cal-grille">${cases.join('')}</div>`;
  }

  /* Le détail d'une journée, sous la grille.
     -------------------------------------------------------------------------
     `lienDispo` est fourni par la page : elle seule connaît les demandes de
     dispo en cours et leurs jetons. Quand il rend une adresse, on propose d'y
     aller ; sinon on se contente de nommer le projet, ce qui était déjà tout
     ce qui manquait. */
  function detailJour(dates, iso, lienDispo){
    const dus = dates.filter(d=> d.date === iso);
    if(!dus.length) return '';
    const lignes = dus.map(d=>{
      const g = groupeDe(d);
      const ou = [d.ville, d.lieu].filter(Boolean).join(' · ');
      const href = typeof lienDispo === 'function' ? (lienDispo(d) || '') : '';
      return `<div class="cal-detail-ligne">
        <span class="cal-detail-projet">${escapeHtml(d.tourneeNom || 'Projet')}</span>
        <span class="apercu-statut ${escapeAttr(g)}">${escapeHtml(GROUPE_MOT[g])}</span>
        ${ou ? `<span class="cal-detail-ou">${escapeHtml(ou)}</span>` : ''}
        ${href ? `<a class="cal-detail-lien" href="${escapeAttr(href)}">Modifier ma dispo →</a>` : ''}
      </div>`;
    }).join('');
    return `<div class="cal-detail-jour">${escapeHtml(jourSemaine(iso))} ${escapeHtml(jourLong(iso))}</div>${lignes}`;
  }

  /* Le calendrier, un mois à la fois.
     -------------------------------------------------------------------------
     Les mois étaient dessinés à la suite : une saison de quatre mois faisait
     trois écrans de haut sur un téléphone, et il fallait faire défiler pour
     savoir si l'on avait quelque chose en juin. Or on ne lit jamais deux mois
     en même temps — on cherche une journée, dans un mois.

     Un seul mois donc, nommé en toutes lettres, et deux flèches. Les points
     sous la grille disent combien de mois portent des dates : c'est ce que la
     pile disait gratuitement, et qu'un affichage page par page perd s'il ne
     le dit pas. Les mois sans aucune date ne comptent pas — passer par un
     mois vide, c'est croire qu'on s'est trompé de flèche.
     ------------------------------------------------------------------------- */
  function moisDisponibles(dates){
    return [...new Set(dates.map(d=> moisDe(d.date)))].sort();
  }

  function vueCalendrier(dates, idx){
    const mois = moisDisponibles(dates);
    if(!mois.length) return '';
    const i = Math.min(Math.max(0, idx | 0), mois.length - 1);
    const cle = mois[i];
    const points = mois.map((m, k)=>
      `<i class="cal-point${k === i ? ' on' : ''}"></i>`).join('');

    /* La légende sur le côté, en colonne : sous le calendrier, elle tombait
       hors de l'écran dès qu'il y avait plus de deux mois, c'est-à-dire
       toujours. À côté, elle reste sous les yeux pendant qu'on lit la grille —
       et c'est là qu'on en a besoin. Sur téléphone, la place manque : elle
       repasse dessous, en ligne — par la media query qui FERME la feuille de
       style, pas par celle du milieu (voir poserStyle). */
    return `<div class="cal-zone">
      <div class="cal">
        <div class="cal-nav">
          <button type="button" class="cal-fleche" data-cal-prec${i === 0 ? ' disabled' : ''}
            aria-label="Mois précédent">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 5 8 12l6.5 7"/></svg>
          </button>
          <div class="cal-mois-titre" aria-live="polite">${escapeHtml(moisAnnee(cle))}</div>
          <button type="button" class="cal-fleche" data-cal-suiv${i === mois.length - 1 ? ' disabled' : ''}
            aria-label="Mois suivant">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 5 16 12l-6.5 7"/></svg>
          </button>
        </div>
        <div class="cal-mois-bloc">
          ${grilleMois(cle, dates.filter(d=> moisDe(d.date) === cle))}
          <div class="cal-detail" id="calDetail" hidden aria-live="polite"></div>
        </div>
        ${mois.length > 1 ? `<div class="cal-points">${points}</div>` : ''}
      </div>
      <div class="cal-legende">
        <span><i class="cal-puce validee"></i> tu joues, c'est signé</span>
        <span><i class="cal-puce option"></i> option</span>
        <span><i class="cal-puce recherche"></i> à l'étude</span>
        <span><i class="cal-puce libre"></i> tu es libre</span>
        <span><i class="cal-puce annulee"></i> annulée</span>
        <span><i class="cal-puce moi"></i> le point : tu es dessus</span>
      </div>
    </div>`;
  }

  /* Le seuil du téléphone, le même que base.css. Un seul endroit pour le
     poser : la page qui monte la vue a besoin de la même réponse que le
     module, et deux seuils qui divergent d'un pixel donnent une page où le
     bloc est replié mais la vue en colonnes larges, ou l'inverse. */
  function mediaPetitEcran(){
    if(typeof matchMedia !== 'function') return { matches:false, addEventListener(){}, addListener(){} };
    return matchMedia('(max-width: 760px)');
  }

  /* Les dates qui comptent : celles où l'on compte sur la personne. Ni les
     annulées (à libérer), ni les « tu es libre » (validées où elle n'est pas
     distribuée) — les colonnes les montrent pour dire de libérer la journée,
     mais « 12 à venir » doit compter ce qu'on joue, ou ce qu'on tient. */
  function enJeu(dates){
    return dates.filter(d=>{ const g = groupeDe(d); return g !== 'annulee' && g !== 'libre'; });
  }

  /* L'aperçu : les n prochaines dates en une ligne chacune, et leur compte.
     C'est ce que l'espace personnel montre en tête — la question « quand
     est-ce que je joue ensuite ? » a sa réponse sans rien ouvrir, et l'écran
     Mes dates reste derrière pour « sur quoi puis-je compter ? ». Le millésime
     n'est écrit que s'il diffère de l'année en cours — « 12 mars » en
     septembre se lirait comme un mois passé.

     UNE DATE À L'ÉTUDE N'EST PAS UNE PROCHAINE DATE. Rien n'est réservé : on
     regarde seulement si la journée est jouable, et il arrive qu'on n'y donne
     aucune suite. L'annoncer comme la prochaine date, c'est faire bloquer un
     jour qui ne sera peut-être jamais demandé — et c'est aussi repousser hors
     de l'aperçu une option ou une date validée, qui, elles, engagent. Elles
     restent visibles sur l'écran Mes dates, dans leur colonne, qui est
     exactement là pour les dire sans les promettre. */
  function apercu(charge, n){
    // L'aperçu se sert aussi tout seul — l'espace personnel n'affiche plus que
    // lui, la vue complète ayant son propre écran. Il lui faut donc sa feuille
    // de style sans passer par monter().
    poserStyle();
    const dates = enJeu((Array.isArray(charge && charge.dates) ? charge.dates : [])
      .slice().sort((a, b)=> String(a.date).localeCompare(String(b.date))))
      .filter(d=> groupeDe(d) !== 'recherche');
    const anneeCourante = new Date().getFullYear();
    const lignes = dates.slice(0, n || 3).map(d=>{
      const st = groupeDe(d);
      const p = partsDe(d.date);
      const quand = `${jourSemaine(d.date)} ${jourLong(d.date)}${p.a && p.a !== anneeCourante ? ' ' + p.a : ''}`;
      const projet = d.tourneeNom || (d.tourneeType === 'recording' ? 'Recording' : 'Projet');
      return `<span class="apercu-ligne" data-date="${escapeAttr(d.date)}">
        <span class="apercu-jour">${escapeHtml(quand)}</span>
        <span class="apercu-projet">${escapeHtml(projet)}</span>
        <span class="apercu-statut ${escapeAttr(st)}">${escapeHtml(GROUPE_MOT[st])}</span>
      </span>`;
    });
    return { nb: dates.length, html: lignes.length ? `<span class="mdv-apercu">${lignes.join('')}</span>` : '' };
  }

  /* Quelle largeur pour un panneau ?
     -------------------------------------------------------------------------
     Trois colonnes d'un tiers chacune supposent que les trois statuts se
     remplissent également. La réalité ne s'y prête pas : une tournée signée
     donne 24 validées, 0 option, 0 recherche — et deux tiers de la page
     servaient à écrire « aucune option en cours », pendant que les 24 dates
     s'empilaient dans un tiers de largeur sur trois écrans de haut.

     La réponse n'est pas de plafonner la hauteur : un défilement dans un
     défilement cache le contenu au lieu de l'organiser. C'est la LARGEUR qui
     suit le contenu, et le corps y coule en autant de sous-colonnes que la
     place en tient (column-width, dans la feuille ci-dessous). */
  function empan(nb, nbPanneaux){
    if(nbPanneaux <= 1) return 3;
    if(nbPanneaux === 2) return nb >= 10 ? 2 : 1;
    return nb >= 16 ? 2 : 1;
  }


  /* ==========================================================================
     MES PARTITIONS
     ==========================================================================
     Les partitions arrivaient par message : un lien par pupitre, renvoyé à
     chaque ajout, et rien qui dise qui avait réellement récupéré sa partie.
     Elles sont désormais ici, dans l'espace que la personne a déjà — AUCUN
     nouveau lien n'est envoyé, et les liens en circulation restent valides.

     UN ÉCRAN, ET PLUS UN BLOC EN BAS DE PAGE. Le rendu s'est d'abord greffé
     sous les dates : c'était la place la plus proche d'un endroit où l'on
     passe. Elle avait deux défauts qu'un onglet corrige. Le premier est qu'on
     y arrivait par six cents pixels de colonnes de dates — une partition
     déposée la veille d'une répétition se découvrait en défilant. Le second
     est qu'un bloc n'a pas de pastille : rien ne pouvait dire, depuis
     n'importe quel écran, qu'il restait trois parties à prendre.

     Le module rend donc les deux formes, et une seule est utilisée à la fois :
     `titre:false` quand la barre de l'application porte déjà le nom de
     l'écran, `vide:true` quand la page EST celle des partitions — là, ne rien
     dire se lirait comme une panne, alors qu'un cadre « aucune partition »
     greffé sous les dates de quelqu'un à qui on n'en donne jamais serait du
     bruit permanent.

     Le groupement par opération ne change pas : on voit ses parties sous son
     opé, sans dépendre d'une vue que personne n'ouvre.

     LE CODE NE SERT QU'À TÉLÉCHARGER. La liste s'affiche sans lui : savoir
     qu'on a trois partitions qui attendent est utile et sans risque. Exiger le
     code pour seulement les VOIR donnerait un espace qui paraît vide et un
     musicien qui appelle la production. */

  function _clePartitions(jeton, tourneeId){
    return 'curieuxPartitionsCode:' + jeton + ':' + tourneeId;
  }
  // Le code retenu quatorze jours, comme le journal de dispo-titulaire : le
  // temps d'une opération, pas celui d'une saison. Tout est enveloppé — le
  // stockage lève en navigation privée, et une préférence ne doit jamais
  // casser la page.
  function _lireCode(jeton, tourneeId){
    try{
      const j = JSON.parse(localStorage.getItem(_clePartitions(jeton, tourneeId)) || 'null');
      if(!j || !j.quand || Date.now() - j.quand > 14 * 86400000) return '';
      return j.code || '';
    }catch(e){ return ''; }
  }
  function _ecrireCode(jeton, tourneeId, code){
    try{ localStorage.setItem(_clePartitions(jeton, tourneeId), JSON.stringify({ quand: Date.now(), code })); }catch(e){}
  }

  /* Ce que la coque de l'espace musicien a besoin de savoir, en deux nombres.

     `operations` décide de l'EXISTENCE de l'onglet : une opération sans aucun
     fichier compte quand même, parce qu'elle dit quelque chose — on est
     attendu dessus, le matériel arrive. Un·e technicien·ne, lui, n'en a
     aucune, et n'a donc pas d'onglet qui ne lui montrerait jamais rien.

     `neuves` fait la pastille : les fichiers qu'on peut prendre MAINTENANT et
     qu'on n'a jamais pris. Deux exclusions, et chacune évite un compteur qui
     ne descendrait pas — celui d'une opération pas encore ouverte (le fichier
     existe, il ne se télécharge pas), et celui qu'on aurait fait du nombre
     total de partitions, qui aurait affiché « 12 » toute la saison.

     `pris` n'existe qu'une fois la migration jouée : sans lui, `neuves` vaut
     null — aucune pastille, jamais un zéro, qui se lirait « tu as tout pris ».
     */
  function compterPartitions(charge){
    const operations = (charge && charge.operations) || [];
    let fichiers = 0, neuves = 0, su = false;
    operations.forEach(op => (op.parties || []).forEach(p => (p.fichiers || []).forEach(f => {
      fichiers++;
      if(typeof f.pris !== 'boolean') return;
      su = true;
      if(!f.pris && op.ouvert) neuves++;
    })));
    return {
      operations: operations.length,
      fichiers,
      neuves: (su || !fichiers) ? neuves : null,
    };
  }

  function _poids(o){
    const n = Number(o) || 0;
    if(n < 1024 * 1024) return Math.round(n / 1024) + ' Ko';
    return (n / 1048576).toFixed(1).replace('.', ',') + ' Mo';
  }

  /* La teinte du pupitre, si partitions-commun.js est chargé. Les pages qui
     montent ce bloc le chargent (mes-partitions.html) ; mon-espace.html charge
     cette vue sans monter le bloc. La vue ne suppose donc pas que le module
     est là — un bandeau gris vaut mieux qu'une page qui casse. */
  function _teintePupitre(pupitre, encre){
    if(typeof partitionsPupitreVar === 'function') return partitionsPupitreVar(pupitre, encre);
    return encre ? 'var(--muted)' : 'var(--border)';
  }

  /* Monter le bloc dans un conteneur dédié. `charge` est ce que rend
     mes_partitions : { personId, personType, genereLe, operations: [...] }.

     Deux options, et chacune répond à « où suis-je ? » :
       titre:false — la barre de l'application porte déjà « Mes partitions »,
                     le répéter dix pixels dessous se lit comme une maladresse ;
       vide:true   — la page est celle des partitions : quand il n'y en a
                     aucune, elle doit le DIRE. Sans l'option, le bloc
                     s'efface, ce qu'il faut quand il est greffé ailleurs.

     CE QUI A CHANGÉ DANS LA FORME, ET POURQUOI. C'était une liste de liens
     gris, tous pareils, où la partie et le fichier se confondaient. Sur un
     téléphone en coulisse, avant une balance, on cherchait la bonne ligne.
     Chaque partie est maintenant une tuile qu'on vise au pouce, teintée de son
     pupitre — la même teinte que sur l'écran de la production, faute de quoi
     un code couleur devrait s'apprendre deux fois. Le geste, appuyer pour
     avoir sa musique, est redevenu le plus gros élément de l'écran. */
  function monterPartitions(hote, charge, jeton, options){
    if(!hote) return;
    const o = options || {};
    const operations = (charge && charge.operations) || [];
    const chapeau = o.titre === false ? '' : '<h2 class="mdv-part-titre">Mes partitions</h2>';

    if(!operations.length){
      if(!o.vide){ hote.innerHTML = ''; return; }
      poserStyle();
      hote.innerHTML = `<section class="mdv-part">${chapeau}
        <p class="mdv-part-rien">Aucune partition ne t'est attribuée pour l'instant.<br>
          Dès que la production dépose le matériel d'une opération où tu joues, il
          apparaît ici — sans qu'on t'envoie de nouveau lien.</p>
      </section>`;
      return;
    }
    poserStyle();

    const rendre = ()=>{
      hote.innerHTML = `<section class="mdv-part">${chapeau}
        <p class="mdv-part-intro">Chaque exemplaire porte ton nom : il t'est personnellement attribué, et il n'a pas à circuler au-delà de l'orchestre.</p>
        ${operations.map(op => _operationHtml(op, jeton)).join('')}
      </section>`;

      hote.querySelectorAll('[data-part-code]').forEach(form => {
        form.onsubmit = (e)=>{
          e.preventDefault();
          const champ = form.querySelector('input');
          const code = (champ.value || '').trim().toUpperCase();
          if(!/^[A-Za-z0-9-]{1,32}$/.test(code)){ champ.focus(); return; }
          _ecrireCode(jeton, form.dataset.partCode, code);
          rendre();
        };
      });
      hote.querySelectorAll('[data-part-oublier]').forEach(b => b.onclick = ()=>{
        try{ localStorage.removeItem(_clePartitions(jeton, b.dataset.partOublier)); }catch(e){}
        rendre();
      });

      /* « Tout télécharger ». La page ne REDESSINE PAS après coup : `pris` vient
         de la base, et la base ne sera relue qu'au prochain chargement. Redessiner
         ici ne changerait donc aucune pastille et ferait seulement sauter l'écran
         sous le pouce. La phrase d'aide, elle, est nécessaire : plusieurs
         téléchargements d'affilée ne passent pas partout, et un bouton qui échoue
         en silence est pire que pas de bouton. */
      hote.querySelectorAll('[data-part-tout]').forEach(b => b.onclick = ()=>{
        const liens = Array.from(hote.querySelectorAll(
          `[data-part-ope="${b.dataset.partTout}"] [data-part-fic]`));
        liens.forEach((a, i) => setTimeout(()=> a.click(), i * 700));
        const note = b.parentElement.querySelector('.mdv-part-aide');
        if(note) note.textContent = "Si un seul fichier s'ouvre, touche les autres un par un : certains téléphones n'acceptent qu'un téléchargement à la fois.";
      });
    };
    rendre();
  }

  /* Le titre du fichier n'est affiché QUE s'il apporte quelque chose. Une
     partie qui ne porte qu'un fichier nommé comme elle donnait « Violon 1 —
     Violon 1 », ce qui fait douter qu'on regarde la bonne ligne.
     Et quand le titre COMMENCE par le nom de la partie — « Violon 1 — erratum »,
     le cas le plus courant d'un ajout tardif — on ne garde que ce qui suit :
     autrement la ligne disait « Violon 1 — Violon 1 — erratum ». */
  function _suffixe(partie, fichier){
    let titre = (fichier.titre || '').trim();
    if(!titre || (partie.fichiers || []).length < 2) return '';
    const nom = (partie.nom || '').trim();
    if(titre.toLowerCase() === nom.toLowerCase()) return '';
    if(nom && titre.toLowerCase().startsWith(nom.toLowerCase())){
      titre = titre.slice(nom.length).replace(/^[\s\-–—_·:]+/, '').trim();
    }
    return titre ? ' — ' + escapeHtml(titre) : '';
  }

  /* Le cartouche d'une opération : son nom, et ce qu'elle porte. Le compte est
     écrit en toutes lettres — « 4 partitions · 3 à prendre » — parce que c'est
     la première chose qu'on vérifie : ai-je tout ce qu'on m'a annoncé ? */
  function _opeTete(op, compte, droite){
    return `<div class="mdv-part-ope-tete">
      <span class="mdv-part-ope-nom">${escapeHtml(op.nom || 'Opération')}</span>
      ${compte ? `<span class="mdv-part-ope-n">${escapeHtml(compte)}</span>` : ''}
      ${droite || ''}
    </div>`;
  }

  function _operationHtml(op, jeton){
    const parties = op.parties || [];
    const fichiers = parties.reduce((s, p)=> s.concat(p.fichiers || []), []);
    const nbFichiers = fichiers.length;
    const code = op.codeRequis ? _lireCode(jeton, op.tourneeId) : '';

    if(!op.ouvert){
      const quand = op.ouvertLe
        ? `Le matériel de cette opération sera disponible le ${escapeHtml(jourLong(op.ouvertLe))}.`
        : "Le matériel de cette opération n'est pas encore ouvert — il le sera avant les répétitions.";
      return `<div class="mdv-part-ope ferme">
        ${_opeTete(op, '')}
        <p class="mdv-part-vide"><span class="mdv-part-cadenas" aria-hidden="true">⏳</span> ${quand}</p>
      </div>`;
    }

    // Le code manque : on dit ce qui attend, et on demande le code. Jamais
    // l'inverse — un champ nu sans savoir ce qu'il ouvre ne se remplit pas. Les
    // noms des parties sont montrés, teintés : on sait ce qu'on débloque avant
    // d'aller chercher le code dans ses messages.
    if(op.codeRequis && !code){
      const apercu = parties.map(p => `<span class="mdv-part-apercu"
        style="background:${_teintePupitre(p.pupitre)}; color:${_teintePupitre(p.pupitre, true)}">${escapeHtml(p.nom)}</span>`).join('');
      return `<div class="mdv-part-ope verrou">
        ${_opeTete(op, nbFichiers + ' partition' + (nbFichiers > 1 ? 's' : ''))}
        <p class="mdv-part-vide"><span class="mdv-part-cadenas" aria-hidden="true">🔒</span>
          ${nbFichiers} partition${nbFichiers > 1 ? 's t\'attendent' : ' t\'attend'} — saisis le code pour ${nbFichiers > 1 ? 'les' : 'la'} débloquer.</p>
        ${apercu ? `<div class="mdv-part-apercus">${apercu}</div>` : ''}
        <form class="mdv-part-code" data-part-code="${escapeAttr(op.tourneeId)}">
          <input class="co-input" inputmode="latin" autocapitalize="characters" maxlength="32"
                 placeholder="CODE" aria-label="Code de l'opération">
          <button type="submit" class="co-btn primary">Ouvrir</button>
        </form>
        <p class="mdv-part-aide">Le code t'a été communiqué séparément de ce lien. Tu ne le saisis qu'une fois.</p>
      </div>`;
    }

    /* CE QUI EST DÉJÀ PRIS VIENT DE LA BASE, et de nulle part ailleurs.
       partitions_telechargements garde une ligne par exemplaire émis, et
       mes_partitions la rend en un booléen `pris` par fichier. C'est la seule
       source qui vaille : un repère posé dans le navigateur ne dirait que ce
       qu'on a pris SUR CET APPAREIL, et quelqu'un qui a téléchargé au bureau
       puis rouvre la page dans le train verrait sa liste redevenue entière.
       `pris` peut manquer — migration pas encore jouée. On ne dit alors RIEN,
       ni « pris » ni « à prendre » : une ligne muette vaut mieux qu'une ligne
       qui affirme. */
    const tuiles = parties.map(p => (p.fichiers || []).map(f => {
      const url = `/api/partition?jeton=${encodeURIComponent(jeton)}&fichier=${encodeURIComponent(f.id)}`
                + (code ? `&code=${encodeURIComponent(code)}` : '');
      const detail = [p.spectacle, _poids(f.octets), f.pages ? f.pages + ' pages' : '']
                     .filter(Boolean).join(' · ');
      const connu = typeof f.pris === 'boolean';
      const dejaPris = connu && f.pris;
      /* « À prendre », et non « nouveau » : un fichier déposé il y a trois mois
         et jamais téléchargé n'a rien de nouveau, mais il reste à prendre.
         C'est ce que compte la pastille de l'onglet, dit ici ligne par ligne —
         sans quoi on saurait qu'il en reste trois sans savoir lesquelles, sur
         une opération qui en porte douze. */
      const marque = !connu ? ''
        : dejaPris ? '<span class="mdv-fic-pris">Déjà récupérée</span>'
        : '<span class="mdv-part-neuf">à prendre</span>';
      return `<a class="mdv-fic${dejaPris ? ' pris' : ''}" href="${escapeAttr(url)}" download
                 data-part-fic="${escapeAttr(f.id)}">
        <span class="mdv-fic-teinte" style="background:${_teintePupitre(p.pupitre, true)}"></span>
        <span class="mdv-fic-corps">
          <span class="mdv-fic-nom">${escapeHtml(p.nom)}${_suffixe(p, f)}${connu && !dejaPris ? marque : ''}</span>
          <span class="mdv-fic-det">${escapeHtml(detail)}</span>
          ${dejaPris ? marque : ''}
        </span>
        <span class="mdv-fic-btn" aria-hidden="true">↓</span>
      </a>`;
    }).join('')).join('');

    const nbAPrendre = fichiers.filter(f => f.pris === false).length;
    const compte = nbFichiers + ' partition' + (nbFichiers > 1 ? 's' : '')
      + (nbAPrendre ? ' · ' + nbAPrendre + ' à prendre' : '');

    return `<div class="mdv-part-ope" data-part-ope="${escapeAttr(op.tourneeId)}">
      ${_opeTete(op, compte,
        op.codeRequis ? `<button type="button" class="mdv-part-oublier" data-part-oublier="${escapeAttr(op.tourneeId)}">oublier le code</button>` : '')}
      ${tuiles || '<p class="mdv-part-vide">Rien de déposé pour l\'instant.</p>'}
      ${nbFichiers > 1 ? `<div class="mdv-part-pied">
        <button type="button" class="co-btn ghost" data-part-tout="${escapeAttr(op.tourneeId)}">Tout télécharger (${nbFichiers})</button>
        <p class="mdv-part-aide"></p>
      </div>` : ''}
    </div>`;
  }

  // --- La feuille de style, posée une fois ---------------------------------
  let stylePose = false;
  function poserStyle(){
    if(stylePose) return;
    stylePose = true;
    const s = document.createElement('style');
    s.textContent = `
      /* ------------------------------------------------------------------
         MES PARTITIONS — la mise en page.
         C'était une liste de liens gris où rien ne se distinguait. Trois
         règles la rendent utilisable d'une main, debout, en coulisse :
         la tuile fait 56 px de haut et se vise au pouce ; la teinte du
         pupitre court le long de son bord gauche ; ce qui reste à prendre
         le dit, en toutes lettres et pas par une nuance.
         ------------------------------------------------------------------ */
      .mdv-part{margin-top:22px;}
      .mdv-part-titre{font-size:15px; font-weight:800; margin:0 0 2px;}
      .mdv-part-intro{font-size:12.5px; color:var(--muted); margin:0 0 10px; line-height:1.5;}
      .mdv-part-ope{background:var(--card); border:1px solid var(--border); border-radius:var(--radius-md);
        padding:12px 14px 6px; margin-bottom:10px;}
      .mdv-part-ope.verrou{border-color:var(--maybe); padding-bottom:12px;}
      .mdv-part-ope.ferme{padding-bottom:12px;}
      .mdv-part-ope-tete{display:flex; gap:10px; align-items:baseline; flex-wrap:wrap; margin-bottom:8px;}
      .mdv-part-ope-nom{font-size:11.5px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted);
        font-weight:800;}
      .mdv-part-ope-n{font-size:11.5px; font-weight:700;
        background:var(--accent-tint); color:var(--tint-ink); border-radius:999px; padding:2px 9px;}
      .mdv-part-oublier{margin-left:auto; border:none; background:none; color:var(--muted); font:inherit;
        font-size:11px; text-decoration:underline; cursor:pointer; padding:0; min-height:0; letter-spacing:0;
        text-transform:none;}
      .mdv-part-vide{font-size:13px; color:var(--muted); margin:0; line-height:1.55;}
      .mdv-part-cadenas{font-size:14px; margin-right:3px;}
      /* La page des partitions quand il n'y en a aucune. Encadré, et non une
         ligne grise perdue au milieu d'un écran blanc : un écran nu se lit
         comme un chargement qui n'a pas abouti. */
      .mdv-part-rien{
        background:var(--card); border:1px solid var(--border); border-radius:var(--radius-md);
        padding:18px 16px; margin:0; font-size:13.5px; color:var(--muted); line-height:1.6;
        text-align:center;
      }
      .mdv-part-neuf{
        display:inline-block; margin-left:8px; font-size:10px; font-weight:800;
        text-transform:uppercase; letter-spacing:.05em; padding:2px 7px; border-radius:999px;
        background:var(--secondary); color:#fff; vertical-align:1.5px;
      }
      /* L'aperçu des parties sous le cadenas : savoir CE QU'ON DÉBLOQUE avant
         d'aller chercher le code. Un champ nu ne se remplit pas. */
      .mdv-part-apercus{display:flex; flex-wrap:wrap; gap:5px; margin:9px 0 0;}
      .mdv-part-apercu{font-size:11px; font-weight:800; border-radius:999px; padding:3px 10px;}
      .mdv-part-code{display:flex; gap:8px; margin-top:11px; flex-wrap:wrap;}
      .mdv-part-code input{flex:1; min-width:120px; max-width:190px; font-weight:800; letter-spacing:.14em;
        text-transform:uppercase; font-size:17px; text-align:center; padding:11px 10px;}
      .mdv-part-code .co-btn{padding:11px 22px; font-size:14px;}
      .mdv-part-aide{font-size:11.5px; color:var(--muted); margin:7px 0 0; line-height:1.5;}
      .mdv-part-pied{border-top:1px solid var(--border); margin-top:4px; padding:9px 0 8px;}
      .mdv-part-pied .co-btn{width:100%; padding:11px 16px; font-size:13.5px;}
      .mdv-part-pied .mdv-part-aide:empty{display:none;}

      /* La tuile de partition. 4 px de teinte à gauche, le nom en 15 px, la
         flèche dans une pastille de 38 px — la cible tient largement les 44 px
         recommandés en comptant la hauteur de la tuile. */
      .mdv-fic{display:flex; align-items:center; gap:11px; padding:9px 0; min-height:56px;
        border-bottom:1px solid var(--border); text-decoration:none; color:inherit;
        -webkit-tap-highlight-color:transparent;}
      .mdv-fic:last-of-type{border-bottom:none;}
      .mdv-fic-teinte{width:4px; align-self:stretch; border-radius:999px; flex-shrink:0;
        min-height:34px; background:var(--border);}
      .mdv-fic-corps{flex:1; min-width:0;}
      .mdv-fic-nom{display:block; font-weight:800; font-size:15px; line-height:1.3;}
      .mdv-fic-det{display:block; font-size:12px; color:var(--muted); line-height:1.45; margin-top:1px;}
      .mdv-fic-pris{display:block; font-size:11.5px; color:var(--ok); font-weight:700; margin-top:2px;}
      .mdv-fic-pris::before{content:'✓ ';}
      .mdv-fic-btn{width:38px; height:38px; border-radius:50%; flex-shrink:0; display:grid; place-items:center;
        background:var(--accent-solid); color:#fff; font-size:18px; font-weight:800; line-height:1;}
      /* Un simple éclaircissement plutôt qu'un basculement vers --accent-dark :
         la nuit, cette variable vaut un bleu presque blanc, et la flèche
         blanche y disparaissait. */
      .mdv-fic:hover .mdv-fic-btn, .mdv-fic:active .mdv-fic-btn{filter:brightness(1.12);}
      /* Déjà récupérée : la pastille passe en contour. L'action reste possible
         — on retélécharge une partition qu'on a perdue — mais elle cesse
         d'appeler le regard, qui doit aller sur ce qui reste à prendre. */
      .mdv-fic.pris .mdv-fic-btn{background:transparent; border:1.5px solid var(--border); color:var(--muted);}

      .mdv-barre{display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin:4px 0 4px;}
      .mdv-bascule{display:inline-flex; gap:3px; background:var(--bg); border:1px solid var(--border);
        border-radius:999px; padding:3px;}
      .mdv-bascule button{
        border:none; background:none; color:var(--muted); font:inherit; font-size:12.5px; font-weight:700;
        padding:6px 15px; border-radius:999px; cursor:pointer;
      }
      .mdv-bascule button.on{background:var(--accent); color:#fff;}

      .colonnes{
        display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:12px; margin-top:10px;
        /* Chaque colonne à sa propre hauteur : étirées à la plus haute, celle
           qui ne porte qu'une date affichait quinze centimètres de blanc. */
        align-items:start;
      }
      .colonne{
        background:var(--card); border:1px solid var(--border); border-radius:var(--radius);
        padding:0 0 10px; min-width:0; display:flex; flex-direction:column;
      }
      .colonne.empan-2{grid-column:span 2;}
      .colonne.empan-3{grid-column:span 3;}
      /* L'en-tête reste au-dessus pendant qu'on descend : le mot « OPTION »
         doit être sous les yeux à la vingtième ligne comme à la première. */
      .col-tete{
        position:sticky; top:0; z-index:2; border-radius:var(--radius) var(--radius) 0 0;
        padding:10px 13px 9px; border-bottom:1px solid var(--border); background:var(--card);
      }
      .col-mot{
        display:inline-block; font-size:10.5px; font-weight:800; text-transform:uppercase;
        letter-spacing:.07em; padding:4px 10px; border-radius:999px;
      }
      .col-validee .col-mot{background:var(--ok); color:var(--sur-statut);}
      .col-option .col-mot{background:var(--maybe); color:var(--sur-statut);}
      .col-recherche .col-mot{background:var(--border); color:var(--muted);}
      .col-annulee .col-mot{background:var(--ko); color:var(--sur-statut);}
      .col-libre .col-mot{background:var(--accent-tint); color:var(--accent-dark);}
      .col-nb{font-size:12px; font-weight:800; color:var(--muted); margin-left:7px;}
      .col-projet{font-size:12.5px; font-weight:700; color:var(--text); margin-left:9px;}
      .col-dit{display:block; font-size:12px; color:var(--muted); line-height:1.45; margin-top:6px;}
      .col-corps{padding:8px 10px 4px; min-width:0; column-width:230px; column-gap:18px;}
      .col-corps .mois{break-after:avoid;}
      .col-corps .ligne{break-inside:avoid;}

      /* Les statuts sans aucune date ne prennent pas un tiers de la page pour
         annoncer qu'ils sont vides : une ligne grise dessous suffit. */
      .mdv-rien{font-size:12.5px; color:var(--muted); margin:10px 2px 0; line-height:1.5;}

      /* Ce qui dépasse du cadre doit se voir. Le bas s'estompe — un dégradé dit
         qu'on a coupé, une coupe nette ne dit rien — et un bouton ouvre le
         reste. Pas de défilement dans le défilement : une barre imbriquée cache
         le contenu, et sur un téléphone elle se déclenche à la place de la page. */
      .col-corps.tronque{overflow:hidden; position:relative;}
      .col-corps.tronque::after{
        content:''; position:absolute; left:0; right:0; bottom:0; height:64px; pointer-events:none;
        background:linear-gradient(to bottom, transparent, var(--card));
      }
      .voir-suite{
        display:block; width:calc(100% - 20px); margin:0 10px 10px;
        border:1px solid var(--border); background:var(--bg); color:var(--accent-dark);
        font:inherit; font-size:12.5px; font-weight:700; border-radius:999px; padding:7px 12px; cursor:pointer;
      }
      .voir-suite:hover{border-color:var(--accent); color:var(--accent);}

      .mdv .mois{
        font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.05em;
        color:var(--accent-dark); margin:10px 0 5px;
      }
      .col-corps .mois:first-child{margin-top:2px;}

      /* Une date = une ligne : le jour à gauche, toujours à la même place, ce
         qui permet de balayer une colonne au lieu de lire des paragraphes. */
      .mdv .ligne{
        display:flex; align-items:baseline; gap:9px;
        padding:6px 4px; border-bottom:1px solid var(--border);
      }
      .mdv .ligne:last-child{border-bottom:none;}
      .mdv .ligne.barree{opacity:.6;}
      .mdv .ligne.barree .l-jour, .mdv .ligne.barree .l-ou b{text-decoration:line-through;}
      .l-jour{flex:0 0 42px; font-weight:800; font-size:13.5px; font-variant-numeric:tabular-nums; line-height:1.2;}
      .l-jour small{display:block; font-weight:600; font-size:10px; color:var(--muted); text-transform:uppercase;}
      .l-ou{flex:1; min-width:0; font-size:12px; line-height:1.35;}
      .l-ou b{display:block; font-weight:700; font-size:12.5px; color:var(--text);
        overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
      .l-ou span{color:var(--muted); display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
      .l-note{display:block; font-size:11px; font-weight:700; margin-top:2px;}
      .l-note.butoir{color:var(--maybe);}
      .l-note.manque{color:var(--accent-dark);}
      .l-note.indispo{color:var(--ko);}
      .l-note.moi{color:var(--ok);}

      /* Le glissement, sur téléphone seulement. scroll-snap tient la colonne
         alignée sur le bord ; les flèches et les points disent qu'il y a autre
         chose à côté, ce qu'un débordement muet ne dit jamais. */
      .nav-cols{display:none;}
      @media (max-width:760px){
        .colonnes{
          display:flex; gap:10px; overflow-x:auto; scroll-snap-type:x mandatory;
          scrollbar-width:none; -webkit-overflow-scrolling:touch; padding-bottom:4px;
        }
        .colonnes::-webkit-scrollbar{display:none;}
        .colonne{flex:0 0 88%; scroll-snap-align:start;}
        .col-corps{column-width:auto; columns:1;}
        .nav-cols{display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:8px;}
        .nav-cols button{
          border:1px solid var(--border); background:var(--card); color:var(--accent-dark);
          width:34px; height:34px; border-radius:50%; font-size:16px; line-height:1; cursor:pointer;
        }
        .nav-cols button:disabled{opacity:.35;}
        .nav-points{display:flex; gap:6px;}
        .nav-points i{width:7px; height:7px; border-radius:50%; background:var(--border); display:block;}
        .nav-points i.on{background:var(--accent);}
      }

      /* Le filigrane. Posé sur la ZONE et non sur une grille : il traverse
         l'ensemble au lieu de se répéter dans chaque mois. En fond, très
         estompé, et sous les grilles — jamais entre l'œil et un chiffre. */
      .cal-zone{
        display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:18px;
        align-items:start; margin-top:10px; position:relative;
      }
      .cal-zone::before{
        content:''; position:absolute; inset:0; z-index:0; pointer-events:none;
        background:url('assets/images/logo-droit-noir.png') no-repeat center;
        background-size:min(58%, 420px);
        opacity:.045;
      }
      /* Dans le thème sombre l'encre noire du logo disparaît : on l'inverse et
         on la remonte à peine, sinon le filigrane n'existe tout simplement pas. */
      html[data-theme="dark"] .cal-zone::before{filter:invert(1); opacity:.07;}
      .cal-zone > *{position:relative; z-index:1;}
      /* Un seul mois à l'écran : la colonne se plafonne plutôt que de s'étirer
         sur 900 px, où les cases deviendraient des pavés. */
      .cal{max-width:420px;}
      .cal-nav{
        display:flex; align-items:center; justify-content:space-between; gap:10px;
        margin:2px 0 9px;
      }
      .cal-mois-titre{
        flex:1; text-align:center; font-family:var(--font-display); font-size:17px;
        font-weight:500; color:var(--accent-dark); text-transform:capitalize;
      }
      .cal-fleche{
        flex:0 0 auto; width:40px; height:40px; border-radius:12px; cursor:pointer;
        border:1px solid var(--border); background:var(--card); color:var(--accent-dark);
        display:grid; place-items:center; font:inherit; -webkit-tap-highlight-color:transparent;
      }
      .cal-fleche:hover:not(:disabled){border-color:var(--accent);}
      .cal-fleche:active:not(:disabled){transform:scale(.94);}
      /* Désactivée et non masquée : une flèche qui disparaît au premier mois
         fait sauter le titre d'un cran, et on croit avoir cliqué à côté. */
      .cal-fleche:disabled{opacity:.3; cursor:default;}
      /* Combien de mois portent des dates — ce que la pile de grilles disait
         gratuitement, et qu'un affichage page par page doit redire. */
      .cal-points{display:flex; justify-content:center; gap:6px; margin-top:11px;}
      .cal-point{
        width:6px; height:6px; border-radius:50%; background:var(--border); display:block;
      }
      .cal-point.on{background:var(--accent); width:18px; border-radius:99px;}
      .cal-grille{
        display:grid; grid-template-columns:repeat(7, 1fr); gap:3px;
        background:var(--card); border:1px solid var(--border); border-radius:var(--radius); padding:8px;
      }
      .cal-nom{font-size:10px; font-weight:800; color:var(--muted); text-align:center; padding-bottom:2px;}
      .cal-case{
        aspect-ratio:1; display:grid; place-items:center; border-radius:8px;
        font-size:12.5px; color:var(--muted); font-variant-numeric:tabular-nums;
      }
      .cal-case.vide{visibility:hidden;}
      /* La couleur dit le statut, le point sous le chiffre dit qu'on y joue.
         Deux informations, deux signes — les confondre ferait croire qu'une
         date validée est forcément la sienne. */
      /* Une case pleine est un bouton : elle en prend les attributs qu'un
         <button> apporte et qu'un <span> n'avait pas, et perd ceux dont un
         calendrier ne veut pas (bordure, fond gris du navigateur). */
      .cal-case.pleine{
        font-weight:800; position:relative; font-family:inherit; font-size:inherit;
        border:none; cursor:pointer; -webkit-tap-highlight-color:transparent;
      }
      .cal-case.pleine:active{transform:scale(.9);}
      .cal-case.pleine.choisie{box-shadow:0 0 0 2.5px var(--accent); z-index:1;}

      /* Le détail de la journée touchée. Il vit sous la grille et non en
         surimpression : une bulle qui recouvre le calendrier cache justement
         les jours qu'on est en train de comparer. */
      .cal-detail{
        /* Le détail voyage : il se range sous la grille du mois qu'on vient
           de toucher (voir brancherCalendrier), pas en pied de calendrier. */
        background:var(--bg); border:1px solid var(--border);
        border-radius:12px; padding:12px 14px; margin-top:10px;
      }
      .cal-detail-jour{
        font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.05em;
        color:var(--muted); margin-bottom:8px;
      }
      .cal-detail-ligne{
        display:flex; align-items:center; gap:9px; flex-wrap:wrap; padding:6px 0;
        border-top:1px solid var(--border); font-size:13px;
      }
      .cal-detail-ligne:first-of-type{border-top:none; padding-top:0;}
      .cal-detail-projet{font-weight:800;}
      .cal-detail-ou{color:var(--muted); font-size:12.5px;}
      .cal-detail-lien{
        margin-left:auto; font-size:12.5px; font-weight:800; color:var(--accent-dark);
        text-decoration:none; white-space:nowrap;
      }
      .cal-detail-lien:hover{text-decoration:underline;}
      .cal-case.pleine.validee{background:var(--ok); color:var(--sur-statut);}
      .cal-case.pleine.option{background:var(--maybe); color:var(--sur-statut);}
      .cal-case.pleine.recherche{background:var(--border); color:var(--text);}
      .cal-case.pleine.annulee{background:var(--ko-tint); color:var(--ko); text-decoration:line-through;}
      /* La journée rendue : le vert en contour, jamais en aplat. On voit qu'il
         se passe quelque chose ce jour-là, on voit du premier coup d'œil que
         ce n'est pas pour soi. */
      .cal-case.pleine.libre{
        background:transparent; color:var(--ok); font-weight:700;
        box-shadow:inset 0 0 0 1.5px var(--ok);
      }
      .cal-case.moi::after{
        content:''; position:absolute; bottom:3px; width:4px; height:4px; border-radius:50%;
        background:currentColor;
      }
      .cal-legende{
        display:flex; flex-direction:column; gap:9px; font-size:11.5px; color:var(--muted);
        position:sticky; top:12px; padding:11px 13px;
        background:var(--card); border:1px solid var(--border); border-radius:var(--radius);
        white-space:nowrap;
      }
      .cal-legende span{display:inline-flex; align-items:center; gap:7px;}
      .cal-puce{width:11px; height:11px; border-radius:4px; display:inline-block;}
      .cal-puce.validee{background:var(--ok);} .cal-puce.option{background:var(--maybe);}
      .cal-puce.recherche{background:var(--border);} .cal-puce.annulee{background:var(--ko-tint);}
      .cal-puce.libre{background:transparent; box-shadow:inset 0 0 0 1.5px var(--ok);}
      .cal-puce.moi{background:var(--text); border-radius:50%; width:7px; height:7px;}

      /* Le résumé des prochaines dates (voir apercu) : trois lignes qui
         tiennent dans un en-tête, là où les colonnes ou le calendrier ne
         tiennent pas. La pastille reprend les couleurs des en-têtes de
         colonne, pour que le mot se lise de la même façon aux deux endroits. */
      .mdv-apercu{display:flex; flex-direction:column; gap:6px; margin-top:9px;}
      .apercu-ligne{display:flex; align-items:center; gap:9px; min-width:0; font-size:12.5px;}
      .apercu-jour{flex:0 0 auto; font-weight:800; font-variant-numeric:tabular-nums; color:var(--text);}
      .apercu-projet{flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--muted);}
      .apercu-statut{
        flex:0 0 auto; font-size:9.5px; font-weight:800; text-transform:uppercase; letter-spacing:.06em;
        padding:3px 8px; border-radius:999px;
      }
      .apercu-statut.validee{background:var(--ok); color:var(--sur-statut);}
      .apercu-statut.option{background:var(--maybe); color:var(--sur-statut);}
      .apercu-statut.recherche{background:var(--border); color:var(--muted);}
      /* L'aperçu ne montre que les dates qui comptent pour la personne (voir
         aVenirPourMoi) : ni annulées, ni rendues. Les deux styles sont là
         quand même — l'aperçu se rappelle par ailleurs, et un statut sans
         style s'afficherait en pastille grise sans mot. */
      .apercu-statut.libre{background:transparent; color:var(--ok); box-shadow:inset 0 0 0 1.5px var(--ok);}
      .apercu-statut.annulee{background:var(--ko-tint); color:var(--ko);}

      /* Le calendrier sur téléphone — EN FIN DE FEUILLE, et il doit y rester.
         Ces deux règles corrigent .cal-zone et .cal-legende ci-dessus, à
         spécificité égale (une classe) : placées dans la media query du haut,
         avant les règles de base, elles perdaient contre elles et n'avaient
         jamais eu d'effet. La légende restait une colonne collante de
         133 px à côté d'une grille de 232 px dans 314 px de large — elle
         recouvrait le samedi et le dimanche de chaque mois. C'est la leçon
         du repli mobile de base.css, qui finit lui aussi son fichier. */
      @media (max-width:760px){
        .cal-zone{grid-template-columns:minmax(0, 1fr); gap:12px;}
        .cal-legende{
          position:static; flex-direction:row; flex-wrap:wrap; gap:12px;
          background:transparent; border:none; padding:0;
        }
      }
    `;
    document.head.appendChild(s);
  }

  /* Monter la vue dans un conteneur.
     -------------------------------------------------------------------------
     `charge` est l'objet rendu par mes_dates. `options.vueParDefaut` décide de
     la forme quand la personne n'en a encore choisi aucune — l'espace personnel
     ouvre sur le calendrier, la page dédiée sur les colonnes. Le choix, lui,
     est retenu pour toutes les pages : c'est une préférence de lecture, pas un
     réglage de page. Mais c'est une préférence de GRAND écran, voir ci-dessous.

     Rend { rendre, ajuster } : `ajuster` refait les mesures de troncature, à
     appeler quand le conteneur devient visible s'il ne l'était pas au montage
     — un corps caché mesure zéro, et rien n'y est tronqué. */
  function monter(conteneur, charge, options){
    poserStyle();
    const opts = options || {};
    const CLE_VUE = 'curieuxMesDatesVue';
    let moisActif = 0;
    const dates = (Array.isArray(charge && charge.dates) ? charge.dates : [])
      .slice().sort((a, b)=> String(a.date).localeCompare(String(b.date)));

    /* Le calendrier par défaut sur un écran large — c'est la forme qui montre
       une saison d'un coup d'œil. Sur téléphone, ce sont toujours les colonnes
       qui glissent : quatre à six grilles de sept colonnes font deux à trois
       écrans de haut, et la réponse à « suis-je pris le 14 ? » s'y lit à peine
       mieux que dans une liste. Le calendrier reste à un appui, pour la
       session.

       La préférence mémorisée ne vaut donc que pour le grand écran. Elle
       était appliquée partout, et un seul appui sur « Calendrier » — sur
       l'ordinateur, ou sur une autre page — rendait le calendrier définitif
       sur le téléphone, avec sa légende par-dessus le week-end. Dans l'autre
       sens, un choix fait au doigt n'est pas retenu non plus : il ne dit rien
       de ce qu'on veut lire sur un écran large.

       Et la largeur se réévalue : une rotation, une fenêtre qu'on étire,
       traversent le seuil sans recharger la page. */
    const media = mediaPetitEcran();
    function vueInitiale(){
      if(media.matches) return 'colonnes';
      let v = opts.vueParDefaut === 'calendrier' ? 'calendrier' : 'colonnes';
      try{
        const retenu = localStorage.getItem(CLE_VUE);
        if(retenu === 'calendrier' || retenu === 'colonnes') v = retenu;
      }catch(e){}
      return v;
    }
    let VUE = vueInitiale();
    // Un choix fait à la main pendant cette visite survit au changement de
    // largeur : on ne reprend pas à quelqu'un ce qu'il vient de demander.
    let choisiIci = false;

    conteneur.classList.add('mdv');

    function vueColonnes(){
      const remplis = COLONNES.map(c=> ({ c, dates: dates.filter(d=> groupeDe(d) === c.cle) }))
                              .filter(x=> x.dates.length);
      const vides = COLONNES.filter(c=> c.siVide !== 'masquer' && !dates.some(d=> groupeDe(d) === c.cle));

      const cols = remplis.map(({ c, dates: liste })=>{
        const e = empan(liste.length, remplis.length);
        const projet = unSeulProjet(liste);
        return `<section class="colonne col-${c.cle}${e > 1 ? ' empan-' + e : ''}">
          <div class="col-tete">
            <span class="col-mot">${escapeHtml(c.titre)}</span><span class="col-nb">${liste.length}</span>
            ${projet ? `<span class="col-projet">${escapeHtml(projet)}</span>` : ''}
            <span class="col-dit">${escapeHtml(c.dit)}</span>
          </div>
          <div class="col-corps">${parMois(liste, !!projet)}</div>
        </section>`;
      });

      const rien = vides.length ? `<p class="mdv-rien">${escapeHtml(vides.map(c=> c.vide).join(' '))}</p>` : '';
      // Un seul panneau : rien à faire glisser, et des flèches qui ne mènent
      // nulle part valent moins que pas de flèches du tout.
      const nav = cols.length > 1 ? `<div class="nav-cols">
          <button type="button" data-col-prec aria-label="Colonne précédente">‹</button>
          <span class="nav-points" data-col-points>${cols.map((_, i)=> `<i class="${i ? '' : 'on'}"></i>`).join('')}</span>
          <button type="button" data-col-suiv aria-label="Colonne suivante">›</button>
        </div>` : '';

      return `<div class="colonnes" data-colonnes>${cols.join('')}</div>${nav}${rien}`;
    }

    /* Ce qui dépasse, et comment on le dit. La mesure se fait au navigateur,
       jamais sur un nombre de lignes deviné : le corps coule en une à quatre
       sous-colonnes selon la largeur, et vingt dates tiennent parfois
       entièrement là où douze débordaient. */
    function poserTroncatures(){
      const plafond = Math.max(320, Math.round(window.innerHeight * 0.66));
      conteneur.querySelectorAll('.colonne').forEach(panneau=>{
        const corps = panneau.querySelector('.col-corps');
        const ancien = panneau.querySelector('.voir-suite');
        if(ancien) ancien.remove();
        if(!corps) return;
        corps.classList.remove('tronque');
        corps.style.maxHeight = '';
        if(corps.scrollHeight <= plafond + 48) return;

        const n = corps.querySelectorAll('.ligne').length;
        corps.classList.add('tronque');
        corps.style.maxHeight = plafond + 'px';
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'voir-suite';
        b.textContent = `Tout voir — ${n} date${n > 1 ? 's' : ''}`;
        b.addEventListener('click', ()=>{
          const ferme = corps.classList.contains('tronque');
          corps.classList.toggle('tronque', !ferme);
          corps.style.maxHeight = ferme ? '' : plafond + 'px';
          b.textContent = ferme ? 'Replier' : `Tout voir — ${n} date${n > 1 ? 's' : ''}`;
        });
        panneau.appendChild(b);
      });
    }

    /* Le clic sur une journée : elle se nomme, sous la grille.
       -----------------------------------------------------------------------
       Un seul jour ouvert à la fois — deux détails empilés feraient sauter la
       grille, et on perdrait la case qu'on vient de toucher. Reclique sur la
       même journée : elle se referme. */
    function brancherCalendrier(){
      const prec = conteneur.querySelector('[data-cal-prec]');
      const suiv = conteneur.querySelector('[data-cal-suiv]');
      const nbMois = moisDisponibles(dates).length;
      // Changer de mois refait la grille : le détail d'une journée de mars n'a
      // rien à faire sous avril.
      const aller = (sens)=>{
        moisActif = Math.min(Math.max(0, moisActif + sens), nbMois - 1);
        rendre();
      };
      if(prec) prec.addEventListener('click', ()=> aller(-1));
      if(suiv) suiv.addEventListener('click', ()=> aller(1));

      const boite = conteneur.querySelector('#calDetail');
      if(!boite) return;
      let ouvert = '';
      conteneur.querySelectorAll('.cal-case.pleine[data-jour]').forEach(c=>{
        c.addEventListener('click', ()=>{
          const iso = c.dataset.jour;
          const memeJour = ouvert === iso;
          conteneur.querySelectorAll('.cal-case.choisie').forEach(x=> x.classList.remove('choisie'));
          if(memeJour){ ouvert = ''; boite.hidden = true; boite.innerHTML = ''; return; }
          ouvert = iso;
          c.classList.add('choisie');
          boite.innerHTML = detailJour(dates, iso, opts.lienDispo);
          boite.hidden = false;
        });
      });
    }

    function brancherGlissement(){
      const piste = conteneur.querySelector('[data-colonnes]');
      const points = conteneur.querySelector('[data-col-points]');
      const prec = conteneur.querySelector('[data-col-prec]');
      const suiv = conteneur.querySelector('[data-col-suiv]');
      if(!piste || !points || !prec || !suiv) return;

      const colonnes = [...piste.children];
      const majEtat = ()=>{
        const i = Math.round(piste.scrollLeft / Math.max(1, (colonnes[0] || {}).offsetWidth || 1));
        [...points.children].forEach((p, k)=> p.classList.toggle('on', k === i));
        prec.disabled = piste.scrollLeft <= 2;
        suiv.disabled = piste.scrollLeft + piste.clientWidth >= piste.scrollWidth - 2;
      };
      const glisser = (sens)=>{
        const large = ((colonnes[0] || {}).offsetWidth || piste.clientWidth) + 10;
        piste.scrollBy({ left: sens * large, behavior: 'smooth' });
      };
      prec.addEventListener('click', ()=> glisser(-1));
      suiv.addEventListener('click', ()=> glisser(1));
      piste.addEventListener('scroll', majEtat, { passive: true });
      majEtat();
    }

    function rendre(){
      if(!dates.length){
        conteneur.innerHTML = `<div class="co-card co-pad" style="font-size:13.5px; color:var(--muted); line-height:1.6;">
          Aucune date à venir pour l'instant. Tu recevras un message dès qu'un projet se prépare.
        </div>`;
        return;
      }
      conteneur.innerHTML = `<div class="mdv-barre">
          <div class="mdv-bascule" role="group" aria-label="Forme d'affichage">
            <button type="button" data-vue="calendrier" class="${VUE === 'calendrier' ? 'on' : ''}">Calendrier</button>
            <button type="button" data-vue="colonnes" class="${VUE === 'colonnes' ? 'on' : ''}">Par statut</button>
          </div>
        </div>` + (VUE === 'calendrier' ? vueCalendrier(dates, moisActif) : vueColonnes());

      conteneur.querySelectorAll('[data-vue]').forEach(b=> b.addEventListener('click', ()=>{
        VUE = b.dataset.vue;
        choisiIci = true;
        if(!media.matches){ try{ localStorage.setItem(CLE_VUE, VUE); }catch(e){} }
        rendre();
      }));
      if(VUE === 'calendrier') brancherCalendrier();
      if(VUE === 'colonnes'){ brancherGlissement(); poserTroncatures(); }
    }

    function ajuster(){ if(VUE === 'colonnes' && dates.length) poserTroncatures(); }

    /* La troncature dépend de la hauteur de la fenêtre et de la largeur, qui
       décide du nombre de sous-colonnes : une rotation de téléphone change les
       deux. On recalcule, sans reconstruire. */
    let minuteur = null;
    window.addEventListener('resize', ()=>{
      clearTimeout(minuteur);
      minuteur = setTimeout(ajuster, 200);
    });

    // Le seuil franchi dans un sens ou dans l'autre : la forme par défaut se
    // rejoue, sauf si la personne en a choisi une pendant cette visite.
    const surSeuil = ()=>{
      if(choisiIci || !dates.length) return;
      const v = vueInitiale();
      if(v !== VUE){ VUE = v; rendre(); }
    };
    if(media.addEventListener) media.addEventListener('change', surSeuil);
    else if(media.addListener) media.addListener(surSeuil);

    rendre();
    return { rendre, ajuster };
  }

  return { monter, monterPartitions, compterPartitions, apercu, mediaPetitEcran, fraicheur, statutDe, groupeDe, STATUT_MOT };
})();

if(typeof window !== 'undefined') window.CurieuxMesDates = CurieuxMesDates;
