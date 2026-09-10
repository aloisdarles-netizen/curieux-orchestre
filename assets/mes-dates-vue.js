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
      cases.push(`<span class="cal-case pleine ${escapeAttr(st)}${moi ? ' moi' : ''}" title="${escapeAttr(titre)}">${j}</span>`);
    }
    return `<div class="cal-grille">${cases.join('')}</div>`;
  }

  function vueCalendrier(dates){
    const mois = [...new Set(dates.map(d=> moisDe(d.date)))].sort();
    if(!mois.length) return '';
    // Les mois sans aucune date ne sont pas dessinés : une saison de trois mois
    // actifs étalée sur huit ne doit pas faire défiler cinq grilles vides.
    const corps = mois.map(cle=>`
      <div>
        <div class="mois">${escapeHtml(moisAnnee(cle))}</div>
        ${grilleMois(cle, dates.filter(d=> moisDe(d.date) === cle))}
      </div>`).join('');
    /* La légende sur le côté, en colonne : sous le calendrier, elle tombait
       hors de l'écran dès qu'il y avait plus de deux mois, c'est-à-dire
       toujours. À côté, elle reste sous les yeux pendant qu'on lit la grille —
       et c'est là qu'on en a besoin. Sur téléphone, la place manque : elle
       repasse dessous, en ligne — par la media query qui FERME la feuille de
       style, pas par celle du milieu (voir poserStyle). */
    return `<div class="cal-zone">
      <div class="cal">${corps}</div>
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

  /* L'aperçu : les n prochaines dates en une ligne chacune, et le compte de
     toutes celles à venir. C'est ce que l'espace personnel montre sur
     téléphone quand le bloc complet est replié : la question « quand est-ce
     que je joue ensuite ? » a sa réponse sans rien déplier, et le bloc entier
     reste derrière pour « sur quoi puis-je compter ? ». Le millésime n'est
     écrit que s'il diffère de l'année en cours — « 12 mars » en septembre
     se lirait comme un mois passé. */
  function apercu(charge, n){
    // L'aperçu se sert aussi tout seul — l'espace personnel n'affiche plus que
    // lui, la vue complète ayant son propre écran. Il lui faut donc sa feuille
    // de style sans passer par monter().
    poserStyle();
    const dates = enJeu((Array.isArray(charge && charge.dates) ? charge.dates : [])
      .slice().sort((a, b)=> String(a.date).localeCompare(String(b.date))));
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

  // --- La feuille de style, posée une fois ---------------------------------
  let stylePose = false;
  function poserStyle(){
    if(stylePose) return;
    stylePose = true;
    const s = document.createElement('style');
    s.textContent = `
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
      .cal{display:grid; grid-template-columns:repeat(auto-fill, minmax(232px, 1fr)); gap:14px;}
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
      .cal-case.pleine{font-weight:800; position:relative;}
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
        </div>` + (VUE === 'calendrier' ? vueCalendrier(dates) : vueColonnes());

      conteneur.querySelectorAll('[data-vue]').forEach(b=> b.addEventListener('click', ()=>{
        VUE = b.dataset.vue;
        choisiIci = true;
        if(!media.matches){ try{ localStorage.setItem(CLE_VUE, VUE); }catch(e){} }
        rendre();
      }));
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

  return { monter, apercu, mediaPetitEcran, fraicheur, statutDe, groupeDe, STATUT_MOT };
})();

if(typeof window !== 'undefined') window.CurieuxMesDates = CurieuxMesDates;
