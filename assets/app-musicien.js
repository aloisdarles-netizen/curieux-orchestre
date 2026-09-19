/* ============================================================================
   L'espace musicien·ne, comme une application
   ============================================================================
   Les pages ouvertes par un lien personnel — l'espace, les dates, les dispos,
   les infos, les remplaçant·es, les partitions — étaient des pages web
   empilées. On arrivait sur l'une d'elles, et pour aller ailleurs il fallait
   remonter tout en haut chercher un « ← Mon espace », revenir au sommaire,
   redescendre. Rien ne disait où l'on était ni ce qui existait à côté : la
   personne qui installait la page sur son téléphone se retrouvait avec une
   icône ouvrant un sommaire.

   Ce fichier pose la coque qui manquait : une barre en haut qui nomme l'écran,
   une barre d'onglets en bas qui nomme les destinations, et des pastilles
   qui disent ce qui attend. C'est tout ce qui sépare un site d'une application
   — et c'est exactement ce qu'on peut donner sans compte, sans serveur de plus,
   sans rien changer aux pages elles-mêmes.

   QUATRE PRINCIPES

   1. LE JETON VOYAGE. Il n'y a pas de session : le lien EST l'identité. Chaque
      onglet reprend donc le jeton de l'adresse courante. Une seule fonction le
      lit, et aucune page n'a plus à y penser.

   2. LA COQUE NE PARLE PAS AU RÉSEAU. Elle peint les onglets et les pastilles
      depuis un petit état gardé en sessionStorage, écrit par l'espace quand il
      charge ses données. Ajouter une requête par page pour afficher un point
      de couleur serait payer une demi-seconde d'attente sur chaque écran, sur
      des téléphones souvent en 4G au fond d'une salle.

   3. UNE PAGE D'ÉCRAN, PAS UNE PILE. Un sous-écran (remplir ses dispos sur un
      projet) porte une flèche de retour ; les destinations, elles, ne
      s'empilent pas — on passe de l'une à l'autre, comme dans n'importe quelle
      application, sans jamais avoir à revenir en arrière.

   4. LA BARRE SE DÉCIDE PAR LE MÉTIER, PAS PAR LE STOCK. Deux destinations
      ne s'affichent pas pour tout le monde — les remplaçant·es, réservés aux
      titulaires, et les partitions, réservées aux musicien·nes. Ce qui les
      décide est un ÉTAT DURABLE de la personne, jamais le contenu du jour :
      un onglet qui apparaîtrait le jour où on affecte une partie et
      disparaîtrait le jour où on la retire donnerait à chacun une
      application différente, impossible à expliquer au téléphone. Un pupitre
      a cinq onglets en permanence, une régie en a quatre.

   Chargé après ui-helpers.js sur les pages à jeton. Sans jeton, le module ne
   fait rien : les pages d'équipe gardent leur bandeau prune.
============================================================================ */

const CurieuxAppMusicien = (function(){
  'use strict';

  /* Les destinations, dans l'ordre où elles apparaissent en bas. Une page de
     plus — dispo-titulaire — est un sous-écran : elle allume « Accueil » et
     reçoit une flèche de retour, parce qu'on y entre depuis un projet précis
     et qu'on en ressort vers là d'où l'on vient.

     L'ordre n'est pas décoratif : les deux premiers onglets sont ce qu'on
     VIENT faire (voir ses dates, prendre ses partitions), les deux derniers
     ce qu'on doit ENTRETENIR (son dossier, ses remplaçant·es). Les partitions
     se rangent donc contre les dates — même geste, même moment de la saison —
     et non en bout de barre. */
  const ONGLETS = [
    { cle:'accueil',    page:'mon-espace.html',     libelle:'Accueil',     titre:'Mon espace' },
    { cle:'dates',      page:'mes-dates.html',      libelle:'Mes dates',   titre:'Mes dates' },
    { cle:'partitions', page:'mes-partitions.html', libelle:'Partitions',  titre:'Mes partitions', musicien:true },
    { cle:'infos',      page:'mes-infos.html',      libelle:'Mes infos',   titre:'Mes informations' },
    { cle:'rempla',     page:'mes-remplacants.html',libelle:'Remplaçants', titre:'Mes remplaçant·es', titulaire:true },
  ];
  const SOUS_ECRANS = {
    'dispo-titulaire.html': { onglet:'accueil', titre:'Mes disponibilités' },
  };

  // Des icônes au trait, dessinées à la même graisse que celles de l'espace :
  // deux jeux de traits différents dans la même barre se voient tout de suite.
  const ICONES = {
    accueil: '<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"/><path d="M9.5 20.5v-6h5v6"/>',
    dates:   '<rect x="3.5" y="5" width="17" height="15.5" rx="2.2"/><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3"/><path d="M8.5 13.8 10.7 16l4.3-4.3"/>',
    infos:   '<rect x="3.5" y="5.5" width="17" height="13" rx="2.2"/><circle cx="9" cy="11" r="2.1"/><path d="M5.6 16.2a3.7 3.7 0 0 1 6.8 0M14.5 10h4M14.5 13.4h4"/>',
    rempla:  '<path d="M4 7.5h11a4 4 0 0 1 4 4v1"/><path d="M12 4.3 15.2 7.5 12 10.7"/><path d="M20 16.5H9a4 4 0 0 1-4-4v-1"/><path d="M12 13.3 8.8 16.5 12 19.7"/>',
    // Une page portée, et non une double croche seule : seule la page dit que
    // ce qu'on vient chercher ici est un DOCUMENT à emporter. La note isolée
    // aurait aussi bien pu annoncer un enregistrement à écouter.
    partitions: '<rect x="4.4" y="3.3" width="15.2" height="17.4" rx="2.3"/><path d="M8 7.9h8M8 10.7h8"/><circle cx="10.1" cy="16.6" r="1.85"/><path d="M11.95 16.6V12.4"/>',
  };
  const svg = (d, taille)=> `<svg class="app-onglet-icone" width="${taille || 22}" height="${taille || 22}" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true">${d}</svg>`;

  function pageCourante(){ return (location.pathname.split('/').pop() || '').toLowerCase(); }
  function jeton(){ return new URLSearchParams(location.search).get('token') || ''; }
  function lien(page){ return `${page}?token=${encodeURIComponent(jeton())}`; }
  function echapper(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, c=>
      ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  /* ------------------------------------------------------------------------
     L'état, gardé le temps de la visite.

     Ce qu'il faut pour peindre la coque — le prénom, le statut, ce qui reste à
     faire — est déjà lu par l'espace personnel. On le range ici pour que les
     autres écrans l'affichent sans redemander. sessionStorage et non
     localStorage : deux personnes peuvent ouvrir leur lien sur le même
     téléphone, et l'état de l'une n'a rien à faire dans l'onglet de l'autre.
     La clé porte le jeton, ce qui rend la confusion impossible même dans un
     seul onglet.
     ------------------------------------------------------------------------ */
  function cle(){ return 'curieuxAppEtat:' + jeton(); }
  let etatCourant = null;

  function lireEtat(){
    if(etatCourant) return etatCourant;
    try{
      const brut = sessionStorage.getItem(cle());
      etatCourant = brut ? JSON.parse(brut) : {};
    }catch(e){ etatCourant = {}; }
    return etatCourant;
  }

  /* Ce que la page vient d'apprendre. Fusionné, jamais remplacé : un écran qui
     ne connaît que le prénom ne doit pas effacer les pastilles que l'espace
     avait posées. */
  function etat(patch){
    const e = Object.assign(lireEtat(), patch || {});
    etatCourant = e;
    try{ sessionStorage.setItem(cle(), JSON.stringify(e)); }catch(err){}
    peindre();
    return e;
  }

  /* ------------------------------------------------------------------------
     Les pastilles : ce qui attend, sur l'onglet où c'est.

     Un nombre quand il y en a un — « 3 dispos à remplir » se compte —, un point
     quand la chose est binaire : un dossier est complet ou ne l'est pas. Rien
     du tout quand il n'y a rien : une barre d'onglets constellée de points
     cesse d'être lue au bout de trois jours.
     ------------------------------------------------------------------------ */
  function pastille(cleOnglet){
    const e = lireEtat();
    if(cleOnglet === 'accueil' && e.disposAFaire > 0) return String(e.disposAFaire);
    // Un nombre qui DESCEND : les partitions qu'on peut prendre et qu'on n'a
    // jamais prises, jamais le total de celles qu'on possède. Voir
    // compterPartitions dans mes-dates-vue.js.
    if(cleOnglet === 'partitions' && e.partitionsNeuves > 0) return String(e.partitionsNeuves);
    if(cleOnglet === 'infos'  && e.infosIncompletes) return '•';
    if(cleOnglet === 'rempla' && e.remplaVides) return '•';
    return '';
  }

  /* Deux onglets ne s'affichent pas pour tout le monde, et leurs deux règles
     sont volontairement INVERSES — parce que l'erreur la plus coûteuse n'est
     pas la même des deux côtés.

     REMPLAÇANTS se montre TANT QU'ON NE SAIT PAS. Retirer un onglet à
     quelqu'un qui y avait droit serait la pire des deux erreurs.

     PARTITIONS se cache tant qu'on ne sait pas, parce qu'ici la pire erreur
     est l'autre : sur les cinquante-neuf liens personnels en circulation,
     quinze vont à des technicien·nes qui n'auront jamais de partition, et un
     onglet qui n'ouvre jamais rien apprend à ne plus regarder la barre.

     CE QUI DÉCIDE EST LE MÉTIER, ET NON LE STOCK. Une première version
     regardait si la personne avait des parties affectées. C'était deux fois
     faux. D'abord parce que l'onglet serait apparu le jour de l'affectation
     et aurait disparu le jour du retrait : une application dont le menu
     change de forme ne s'explique pas au téléphone — « touche Partitions » /
     « je n'ai pas Partitions ». Ensuite parce qu'un·e musicien·ne ne pouvait
     pas découvrir que la chose existe avant qu'on lui donne quelque chose.
     L'onglet vide dit maintenant ce qu'il faut : rien pour l'instant, et ça
     viendra là.

     personType vient de mes_dates comme de mes_demandes_dispo, toutes deux
     déjà lues en tête des deux écrans d'entrée : l'onglet est donc peint au
     PREMIER rendu, sans apparaître après coup.

     Le `|| e.partitions > 0` est une ceinture. L'affectation se fait
     aujourd'hui depuis l'effectif d'une opération, donc sur des musicien·nes ;
     si un jour une partie était confiée à quelqu'un d'autre — un·e
     chef·fe de chant, une régie qui suit la partition — il faut que
     l'onglet apparaisse quand même, plutôt que de perdre en silence un
     matériel qu'on lui a bel et bien attribué. */
  function ongletsVisibles(){
    const e = lireEtat();
    return ONGLETS.filter(o=>{
      /* L'ÉCRAN OÙ L'ON EST SE MONTRE TOUJOURS, quelle que soit la règle. Une
         barre qui n'allume rien pendant qu'on lit une page donne le sentiment
         d'être sorti de l'application, et le cas arrive pour de vrai : lien
         ouvert directement, navigation privée où l'état de session ne se
         garde pas, onglet resté ouvert pendant qu'une affectation changeait. */
      if(contexte && o.cle === contexte.onglet) return true;
      if(o.titulaire && e.titulaire === false) return false;
      if(o.musicien && !(e.musicien === true || e.partitions > 0)) return false;
      return true;
    });
  }

  // --- La feuille de style, posée une fois ---------------------------------
  let styleFait = false;
  function poserStyle(){
    if(styleFait) return;
    styleFait = true;
    const s = document.createElement('style');
    s.id = 'curieux-app-style';
    s.textContent = `
      /* La coque prend la main sur la mise en page des cinq pages : elles
         gardent leur contenu, la coque leur donne leurs marges. */
      body.app-musicien{
        padding-top:calc(70px + env(safe-area-inset-top, 0px));
        /* 72 px de barre, plus le retrait du bas de l'écran, plus le talon de
           10 px que la barre s'ajoute quand ce retrait vaut zéro. */
        padding-bottom:calc(82px + max(10px, env(safe-area-inset-bottom, 0px)));
        /* Le rebond élastique laissait apparaître un liseré blanc sous la barre
           d'onglets en mode application : c'est le détail qui trahit une page
           web déguisée. */
        overscroll-behavior-y:none;
      }
      /* Le logo que chaque page posait en tête de sa colonne : la barre le
         porte désormais. Le sélecteur vise la colonne, pas la classe — la
         marque de la barre porte la même, c'est elle qui reçoit sa source. */
      body.app-musicien .wrap .brand-logo-img{display:none;}
      body.app-musicien #curieuxRetourEspace{display:none !important;}

      /* La barre « Enregistrer » de trois écrans — infos, remplaçant·es,
         dispos — était collée au bas de la fenêtre, exactement là où passent
         maintenant les onglets. Elle monte d'une hauteur de barre : deux
         choses à faire au même endroit, c'est un enregistrement perdu sur
         deux. Et tant qu'elle est là, la page se réserve la place de lire son
         dernier champ au-dessus des deux barres. */
      body.app-musicien .save-bar{
        z-index:45;
        bottom:calc(72px + max(10px, env(safe-area-inset-bottom, 0px)));
        padding-bottom:12px;
      }
      body.app-musicien:has(.save-bar.visible){
        padding-bottom:calc(154px + max(10px, env(safe-area-inset-bottom, 0px)));
      }

      /* Le titre de l'écran est dans la barre : celui que la page répétait
         dessous — « Mes infos » sous « Mes informations » — s'efface. C'est
         la barre qui porte le <h1> de la page, la structure des titres reste
         donc entière. « Bonjour Camille », lui, n'est pas un titre d'écran
         mais une salutation : il reste. */
      body.app-musicien #content > h1:first-child{display:none;}
      /* Deux écrans posent leur titre dans une .entete plutôt que dans
         #content — « Mes dates » et « Mes partitions ». La barre le porte
         déjà : il s'efface des deux, et l'en-tête se recolle en haut. */
      body.app-musicien.app-ecran-dates .entete .co-h1,
      body.app-musicien.app-ecran-partitions .entete .co-h1{display:none;}
      body.app-musicien.app-ecran-dates .entete,
      body.app-musicien.app-ecran-partitions .entete{padding-top:2px;}

      .app-barre{
        position:fixed; top:0; left:0; right:0; z-index:40;
        height:calc(70px + env(safe-area-inset-top, 0px));
        padding-top:env(safe-area-inset-top, 0px);
        display:flex; align-items:center; gap:11px;
        /* Les coins arrondis d'un téléphone rognent les extrémités : les
           retraits latéraux s'ajoutent au rembourrage, ils ne le remplacent
           pas. */
        padding-left:calc(15px + env(safe-area-inset-left, 0px));
        padding-right:calc(15px + env(safe-area-inset-right, 0px));
        background:var(--card); border-bottom:1px solid transparent;
        transition:border-color .18s, box-shadow .18s;
      }
      .app-barre.pose{border-bottom-color:var(--border); box-shadow:0 2px 12px rgba(20,15,10,.05);}
      .app-barre-titre{
        flex:1; min-width:0; font-family:var(--font-display); font-size:16.5px; font-weight:500;
        color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin:0;
      }
      .app-retour{
        flex:0 0 auto; width:38px; height:38px; margin-left:-8px; border:none; background:none;
        color:var(--accent-dark); display:grid; place-items:center; border-radius:11px;
        cursor:pointer; text-decoration:none; -webkit-tap-highlight-color:transparent;
      }
      .app-retour:active{background:var(--border);}
      /* La marque, à la taille où on la reconnaît. À 19 px elle se lisait comme
         une mention légale en tête d'un site ; c'est ici l'en-tête d'une
         application, et c'est la première chose que voit quelqu'un qui ouvre
         l'icône posée sur son écran d'accueil. */
      .app-marque{
        flex:0 0 auto; height:34px; width:auto; display:block;
      }
      /* Le prénom en bout de barre : sur un téléphone partagé, ou quand deux
         liens traînent dans l'historique, c'est la seule chose qui dit de qui
         est l'espace qu'on regarde. */
      .app-qui{
        flex:0 0 auto; font-size:12.5px; font-weight:700; color:var(--muted);
        max-width:30vw; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
      }
      /* Sous 420 px, la marque et le nom de l'écran prennent toute la barre :
         le prénom s'efface plutôt que de rogner le titre. On sait de qui est
         l'espace en touchant Accueil, où « Bonjour Camille » est écrit en
         grand — et une barre d'onglets personnelle ne laisse guère de doute. */
      @media (max-width:419px){ .app-qui{display:none;} }

      /* ----------------------------------------------------------------------
         La barre d'onglets, et les bords d'un téléphone.

         Elle était collée en bas de fenêtre avec, pour seul dégagement, le retrait
         bas du système. Deux choses la rognaient. D'abord ce retrait vaut ZÉRO
         tant que la page ne déclare pas « viewport-fit=cover » — ce que la coque
         fait maintenant elle-même sur les cinq pages ; sans lui, aucune des
         valeurs de retrait n'existe et la barre se posait sur l'indicateur
         d'accueil. Ensuite les coins arrondis mangent les extrémités : le
         premier et le dernier onglet perdaient un bout de leur libellé.

         D'où : les retraits latéraux ajoutés au rembourrage, un talon de 10 px
         quand le retrait bas est nul (téléphone à bord droit, navigateur de
         bureau), et un onglet dont la zone tactile ne dépend plus de l'écran.
         ---------------------------------------------------------------------- */
      .app-onglets{
        position:fixed; left:0; right:0; bottom:0; z-index:40;
        display:flex; align-items:stretch;
        padding-bottom:max(10px, env(safe-area-inset-bottom, 0px));
        padding-left:env(safe-area-inset-left, 0px);
        padding-right:env(safe-area-inset-right, 0px);
        background:var(--card); border-top:1px solid var(--border);
        box-shadow:0 -8px 24px rgba(20,15,10,.07);
      }
      .app-onglet{
        flex:1 1 0; min-width:0; display:flex; flex-direction:column; align-items:center;
        justify-content:center; gap:4px; padding:11px 3px 10px; text-decoration:none;
        /* L'encre du texte à 72 % plutôt que le gris des mentions secondaires :
           un onglet est une commande, pas une note de bas de page. Le contraste
           passe d'environ 4:1 à 6:1, et l'accord se fait tout seul en thème
           sombre, où --text est déjà clair. */
        color:var(--text); opacity:.72;
        font-size:11px; font-weight:800; letter-spacing:.01em;
        position:relative; -webkit-tap-highlight-color:transparent;
      }
      .app-onglet span{max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
      .app-onglet:active .app-onglet-icone{transform:scale(.9);}
      .app-onglet-icone{transition:transform .12s;}
      .app-onglet.actif{color:var(--accent-dark); opacity:1;}
      .app-onglet.actif .app-onglet-icone{stroke-width:2.05;}
      /* Le trait sous l'onglet actif, plutôt qu'un fond : la barre reste claire,
         et l'œil retrouve sa position d'un écran à l'autre sans la chercher. */
      .app-onglet.actif::before{
        content:''; position:absolute; top:0; left:50%; transform:translateX(-50%);
        width:26px; height:3px; border-radius:0 0 3px 3px; background:var(--accent);
      }
      .app-onglet-pastille{
        position:absolute; top:5px; left:calc(50% + 7px);
        min-width:16px; height:16px; padding:0 4px; border-radius:999px;
        background:var(--secondary); color:#fff; font-size:10px; font-weight:800;
        display:grid; place-items:center; line-height:1; box-shadow:0 0 0 2px var(--card);
      }
      .app-onglet-pastille.point{min-width:9px; width:9px; height:9px; padding:0; font-size:0; top:8px;}

      /* Cinq onglets sur un téléphone de 360 px : chacun tombe à 72 px, et
         « Remplaçants » n'y tient plus. Le libellé se resserre plutôt que de
         se faire couper — « Remplaçan… » ne se lit pas, il se devine, et on
         ne vise pas ce qu'on devine. Le compte est porté par data-nb, posé au
         rendu : il ne vaut 5 que pour un pupitre titulaire en production. */
      .app-onglets[data-nb="5"] .app-onglet{
        font-size:10.5px; padding-left:1px; padding-right:1px; letter-spacing:0;
      }
      .app-onglets[data-nb="5"] .app-onglet-pastille{left:calc(50% + 5px);}

      /* Sur écran large, la barre du bas n'a plus de sens : le pouce n'est pas
         là. Les mêmes onglets remontent sous le titre, en une rangée de pilules
         centrée sur la colonne de contenu. */
      @media (min-width:761px){
        body.app-musicien{padding-top:126px; padding-bottom:48px;}
        /* Les onglets sont remontés en haut : la barre d'enregistrement
           retrouve le bas de la fenêtre, où elle était. */
        body.app-musicien .save-bar{bottom:0; padding-bottom:calc(12px + env(safe-area-inset-bottom, 0px));}
        body.app-musicien:has(.save-bar.visible){padding-bottom:96px;}
        .app-barre{height:70px; padding-left:22px; padding-right:22px;}
        .app-onglets{
          top:70px; bottom:auto; border-top:none; border-bottom:1px solid var(--border);
          justify-content:center; gap:6px; padding:8px 16px;
        }
        .app-onglet{
          flex:0 0 auto; flex-direction:row; gap:8px; padding:8px 16px; border-radius:999px;
          font-size:13px; background:var(--bg); border:1px solid transparent;
        }
        .app-onglets[data-nb="5"] .app-onglet{
          font-size:13px; padding-left:16px; padding-right:16px; letter-spacing:.01em;
        }
        .app-onglet:hover{border-color:var(--border);}
        .app-onglet.actif{background:var(--accent); color:#fff;}
        .app-onglet.actif::before{display:none;}
        .app-onglet-pastille{position:static; box-shadow:none; margin-left:2px;}
        .app-onglet.actif .app-onglet-pastille{background:#fff; color:var(--accent-dark);}
        .app-onglet-pastille.point{margin-left:4px;}
      }
    `;
    document.head.appendChild(s);
  }

  // --- Le rendu ------------------------------------------------------------
  let barre = null, onglets = null, contexte = null;

  function peindre(){
    if(!onglets || !contexte) return;
    const e = lireEtat();

    /* Le nombre d'onglets réellement affichés, porté sur la barre : c'est lui
       qui resserre les libellés à cinq (voir la feuille de style). Posé au
       rendu et non à la construction — l'onglet des partitions apparaît quand
       l'écran apprend qu'il y en a, c'est-à-dire après la barre. */
    const liste = ongletsVisibles();
    onglets.setAttribute('data-nb', String(liste.length));

    onglets.innerHTML = liste.map(o=>{
      const actif = o.cle === contexte.onglet;
      const p = pastille(o.cle);
      return `<a class="app-onglet${actif ? ' actif' : ''}" href="${echapper(lien(o.page))}"
        ${actif ? 'aria-current="page"' : ''}>
        ${svg(ICONES[o.cle])}
        <span>${echapper(o.libelle)}</span>
        ${p ? `<span class="app-onglet-pastille${p === '•' ? ' point' : ''}"
          aria-label="${p === '•' ? 'à compléter' : p + ' à faire'}">${p === '•' ? '' : echapper(p)}</span>` : ''}
      </a>`;
    }).join('');

    /* Le prénom en bout de barre, partout sauf sur l'accueil : là, le grand
       « Bonjour Camille » juste dessous le dit déjà, et deux fois le même
       prénom à dix pixels d'écart se lit comme une maladresse. */
    const qui = barre.querySelector('.app-qui');
    if(qui) qui.textContent = contexte.onglet === 'accueil' ? '' : (e.prenom || '').trim();
  }

  /* Le titre de l'écran. Une page peut l'affiner — « Les dates de Camille » —
     mais le défaut vient de la table des onglets : sans lui, la barre resterait
     vide le temps du chargement, et une barre vide se lit comme une panne. */
  function titre(texte){
    if(!barre) return;
    const t = barre.querySelector('.app-barre-titre');
    if(t) t.textContent = texte || '';
  }

  function monter(){
    const page = pageCourante();
    const sous = SOUS_ECRANS[page];
    const onglet = sous ? sous.onglet : (ONGLETS.find(o=> o.page === page) || {}).cle;
    if(!onglet) return null;              // page qui n'appartient pas à l'espace
    if(!jeton()) return null;             // lien incomplet : la page dira quoi faire
    if(document.getElementById('curieuxAppBarre')) return api;

    /* Les retraits d'écran n'existent qu'à cette condition.
       -----------------------------------------------------------------------
       Sur iPhone, env(safe-area-inset-*) vaut ZÉRO tant que la page ne demande
       pas à occuper l'écran jusqu'aux bords. Toute la géométrie de la coque en
       dépend : sans cette ligne, la barre du bas se pose sur l'indicateur
       d'accueil et les coins arrondis rognent le premier et le dernier onglet.
       On corrige la balise plutôt que de la réécrire dans cinq pages — c'est
       un réglage de la coque, il vit avec elle. */
    const vp = document.querySelector('meta[name="viewport"]');
    if(vp && !/viewport-fit/.test(vp.content)) vp.content += ', viewport-fit=cover';

    poserStyle();
    document.body.classList.add('app-musicien', 'app-ecran-' + onglet);
    contexte = { page, onglet, sousEcran: !!sous };

    const defaut = sous ? sous.titre : (ONGLETS.find(o=> o.cle === onglet) || {}).titre;

    barre = document.createElement('header');
    barre.id = 'curieuxAppBarre';
    barre.className = 'app-barre';
    barre.innerHTML = sous
      ? `<a class="app-retour" href="${echapper(lien('mon-espace.html'))}" aria-label="Revenir à mon espace">
           <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 5 8 12l6.5 7"/></svg>
         </a>
         <h1 class="app-barre-titre">${echapper(defaut || '')}</h1>`
      : `<img class="app-marque brand-logo-img" alt="Curieux orchestre">
         <h1 class="app-barre-titre">${echapper(defaut || '')}</h1>
         <span class="app-qui"></span>`;

    onglets = document.createElement('nav');
    onglets.id = 'curieuxAppOnglets';
    onglets.className = 'app-onglets';
    onglets.setAttribute('aria-label', 'Mon espace');

    document.body.insertBefore(barre, document.body.firstChild);
    document.body.appendChild(onglets);

    // Le logo de la barre suit la même règle que partout : c'est brand-assets
    // qui choisit la variante claire ou sombre.
    try{ if(typeof applyBrandLogo === 'function') applyBrandLogo(); }catch(e){}

    /* La barre ne se sépare du contenu qu'une fois qu'on a défilé. En haut de
       page, une ligne horizontale de plus n'apporte rien ; dès que du texte
       passe dessous, elle devient nécessaire. */
    const suivre = ()=> barre.classList.toggle('pose', window.scrollY > 4);
    window.addEventListener('scroll', suivre, { passive:true });
    suivre();

    peindre();
    return api;
  }

  const api = { monter, etat, titre, jeton, lien, lireEtat };
  return api;
})();

// Un `const` de premier niveau ne se pose pas sur window : les pages qui
// testent `window.CurieuxAppMusicien` avant d'appeler la coque ne verraient
// rien.
if(typeof window !== 'undefined') window.CurieuxAppMusicien = CurieuxAppMusicien;

/* Posé tout de suite si le corps existe, au chargement sinon : les pages
   déclarent leurs scripts dans <head>, et la coque doit être en place avant
   que le contenu ne se peigne — un décalage de la barre du haut au premier
   rendu se voit. */
(function(){
  const poser = ()=>{ try{ CurieuxAppMusicien.monter(); }catch(e){} };
  if(document.body) poser();
  else document.addEventListener('DOMContentLoaded', poser);
})();
