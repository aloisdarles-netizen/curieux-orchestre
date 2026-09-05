/* ============================================================================
   Les messages de demande et de relance de dispos
   ============================================================================
   Il y avait un message par bouton, écrit en dur, et toujours le même : une
   première demande avait le ton d'une relance, une relance de dernière minute
   celui d'une invitation. Pire, la relance listait TOUTES les dates
   manquantes — sur une tournée de douze dates, le message faisait quinze
   lignes sur un téléphone, et personne ne le lisait jusqu'au lien.

   Huit modèles aujourd'hui — cinq qui demandent une disponibilité, trois qui
   annoncent — et une règle : au-delà de cinq dates on ne les énumère plus, on
   dit combien et sur quelle période. Le lien personnel, lui, est dans tous les
   modèles sans exception — c'est la seule chose que le message doit absolument
   transmettre.

   LE TON, enfin, qui n'est pas un détail : ces messages partent à des gens
   qu'on connaît, et qu'on va retrouver en tournée. Ni raides ni familiers.
   Trois règles tiennent tout le fichier :
     — la charge reste de notre côté (« il ME manque tes dispos », jamais
       « il TE manque ») : sur un message qu'on envoie parfois trois fois,
       ce déplacement sépare la relance du reproche ;
     — on dit pourquoi ça compte (« pour boucler l'équipe »), jamais seulement
       ce qu'on attend ;
     — on remercie en toutes lettres, et on s'excuse quand on dérange. Un
       « Merci ! » sec coûte moins qu'il ne rapporte ;
     — on ne PROMET rien qu'on ne tienne. Ni « on se rattrape à la prochaine »,
       ni « on te reprend sur le prochain projet » : la distribution d'un
       projet à venir ne se décide pas dans un message d'annulation, et une
       promesse faite à quarante personnes à la fois est une promesse qu'on
       manquera devant trente-neuf. On s'engage seulement à tenir au courant,
       ce que le lien permet de faire sans rien promettre.

   Le module ne connaît ni Supabase ni les pages : on lui donne un contexte
   (prénom, projet, lien, dates), il rend un texte et ouvre le bon canal.
============================================================================ */
const CurieuxMessages = (function(){

  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
                'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  // Le premier du mois s'écrit « 1er » — « le 1 septembre » se lit comme une
  // faute dans un message qu'on relit, et ces messages sont relus.
  // Le quantième seul : « 1er », puis « 2 », « 3 »…
  function quantieme(iso){
    const n = parseInt(String(iso || '').split('-')[2], 10);
    return isFinite(n) ? (n === 1 ? '1er' : String(n)) : '';
  }
  function jour(iso){
    const [, m, d] = String(iso || '').split('-');
    if(!d) return '';
    return quantieme(iso) + ' ' + (MOIS[parseInt(m, 10) - 1] || '');
  }

  // Au-delà de ce nombre, on résume au lieu d'énumérer.
  const SEUIL = 5;

  function propres(dates){
    return [...new Set((dates || []).filter(Boolean))].sort();
  }

  // « A, B et C » — jamais « A et B et C ».
  function joindre(items){
    const l = (items || []).filter(Boolean);
    if(l.length <= 1) return l[0] || '';
    return l.slice(0, -1).join(', ') + ' et ' + l[l.length - 1];
  }

  /* « le 3 mai », « les 3, 5 et 9 mai », ou « 8 dates, entre le 3 mai et le
     19 juin » — c'est la règle des cinq.
     Le mois n'est écrit qu'une fois par mois : « les 3, 5 et 9 mai », pas
     « les 3 mai, 5 mai et 9 mai ». À cheval sur deux mois, chacun reprend le
     sien : « les 3, 5 mai et 2 juin ». */
  function listeOuResume(dates, nom){
    const l = propres(dates);
    if(!l.length) return '';
    if(l.length === 1) return 'le ' + jour(l[0]);
    if(l.length <= SEUIL){
      const mois = iso=> String(iso).slice(0, 7);
      const parts = l.map((iso, i)=>
        (i === l.length - 1 || mois(l[i + 1]) !== mois(iso))
          ? jour(iso) : quantieme(iso));
      return 'les ' + joindre(parts);
    }
    return `${l.length} ${nom || 'dates'}, entre le ${jour(l[0])} et le ${jour(l[l.length - 1])}`;
  }

  /* « du 3 mai au 19 juin », la période, sans jamais énumérer — et « du 12 au
     13 mars » quand tout tient dans le même mois : « du 12 mars au 13 mars »
     répète un mot que le lecteur vient de lire, ce qui est la définition même
     d'une phrase mal écrite. */
  function periode(dates){
    const l = propres(dates);
    if(!l.length) return '';
    if(l.length === 1) return 'le ' + jour(l[0]);
    const memeMois = String(l[0]).slice(0, 7) === String(l[l.length - 1]).slice(0, 7);
    return memeMois
      ? `du ${quantieme(l[0])} au ${jour(l[l.length - 1])}`
      : `du ${jour(l[0])} au ${jour(l[l.length - 1])}`;
  }

  // Les dates dont parle un message : celles qui manquent si on les connaît,
  // sinon toutes celles du projet. Un modèle ne doit jamais tomber à vide.
  function enJeu(ctx){
    const m = propres(ctx.manquantes);
    return m.length ? m : propres(ctx.toutes);
  }

  function nomProjet(ctx){ return ctx.projet ? `« ${ctx.projet} »` : 'le projet'; }
  function salut(ctx){ return `Bonjour ${(ctx.prenom || '').trim()}`.trim(); }

  /* Ce que le message doit savoir de la personne à qui il s'adresse.
     -------------------------------------------------------------------------
     Trois choses le changent, et les ignorer produisait des messages faux.

     LE RÔLE, d'abord, qui est le plus important. Un·e titulaire fait partie du
     noyau : on la sollicite d'office, sa place est acquise, et « il me manque
     tes dispos » est la phrase juste. Un·e remplaçant·e est appelé·e au cas par
     cas : on lui DEMANDE quelque chose, sa place n'est pas acquise, et lui
     écrire comme au noyau produit deux erreurs symétriques — un ton qui
     présume, et surtout un malentendu : être sollicité·e n'est pas être
     engagé·e. Les modèles le disent donc en toutes lettres, et une validation
     lui annonce d'abord qu'elle est retenue, ce qui pour elle est LA nouvelle.

     LE TYPE DE PROJET ensuite : on ne « monte pas l'équipe » d'un recording
     comme d'une tournée, et ce qui se tient est une salle ou un studio.

     LE MÉTIER enfin : « caler la distribution » ne veut rien dire pour un·e
     technicien·ne, dont on cale les postes.

     Rien de tout cela n'est deviné : la page passe le rôle lu sur la demande du
     projet (roleSurProjet), le type du projet et le type de personne. En leur
     absence on retombe sur le cas le plus courant — titulaire, tournée,
     musicien·ne — qui est aussi le plus neutre. */
  function mots(ctx){
    const rec = ctx.typeProjet === 'recording';
    return {
      rempla:  ctx.role === 'remplacant',
      prepare: rec ? 'On prépare les séances de' : "On monte l'équipe pour",
      caler:   ctx.personType === 'technicien' ? 'caler les postes' : 'caler la distribution',
      equipe:  ctx.personType === 'technicien' ? "l'équipe technique" : "l'équipe",
    };
  }

  const MODELES = [
    {
      cle: 'premiere',
      libelle: 'Première demande',
      aide: "Présente le projet et la période — sans énumérer les dates.",
      texte(ctx){
        const p = periode(propres(ctx.toutes).length ? ctx.toutes : ctx.manquantes);
        const m = mots(ctx);
        if(m.rempla){
          return [
            salut(ctx) + ',',
            '',
            ponctuer(`On prépare ${nomProjet(ctx)}${p ? ', ' + p : ''}, et on aimerait beaucoup t'avoir avec nous`),
            `Est-ce que tu serais disponible ? Tu peux répondre ici, ça prend une minute :`,
            ctx.lien,
            '',
            // La phrase la plus importante du modèle : sans elle, quelqu'un
            // refuse un autre engagement pour une date qu'on ne lui a jamais
            // promise.
            "Rien n'est arrêté à ce stade — je reviens vers toi dès que l'équipe se dessine.",
            'Merci d\'avance.',
          ].join('\n');
        }
        return [
          salut(ctx) + ',',
          '',
          ponctuer(`${m.prepare} ${nomProjet(ctx)}${p ? ', ' + p : ''}`),
          `Tes disponibilités nous aideraient à ${m.caler} — c'est par ici, et ça prend une minute :`,
          ctx.lien,
          '',
          'Merci d\'avance, et à très vite.',
        ].join('\n');
      },
    },
    {
      cle: 'relance',
      libelle: 'Relance courte',
      aide: 'Deux lignes : ce qui manque, et le lien.',
      texte(ctx){
        const d = listeOuResume(enJeu(ctx));
        const m = mots(ctx);
        if(m.rempla){
          return [
            ponctuer(`${salut(ctx)}, je me permets de revenir vers toi pour ${nomProjet(ctx)}${d ? ' : ' + d : ''}`),
            // « Même un non » : à quelqu'un qui ne nous doit rien, on demande
            // une réponse, pas un oui — et le dire fait répondre.
            `Si tu peux me dire ce que ça donne de ton côté, même un non, ça m'aide à avancer :`,
            ctx.lien,
            '',
            'Merci beaucoup.',
          ].join('\n');
        }
        return [
          // « Il me manque » et non « il te manque » : la charge est de notre
          // côté, pas du sien. Sur un message qu'on envoie parfois trois fois,
          // ce déplacement fait toute la différence entre relancer et
          // reprocher.
          ponctuer(`${salut(ctx)}, il me manque encore tes disponibilités sur ${nomProjet(ctx)}${d ? ' : ' + d : ''}`),
          `Dès que tu as un moment, tout est là — ça m'aiderait beaucoup pour boucler ${m.equipe} :`,
          ctx.lien,
          '',
          'Merci beaucoup.',
        ].join('\n');
      },
    },
    {
      cle: 'butoir',
      libelle: 'Relance avec date butoir',
      aide: "Même chose, plus la date à laquelle on boucle l'équipe.",
      champ: 'On boucle quand ? (ex. « vendredi », « le 12 mai »)',
      texte(ctx){
        const d = listeOuResume(enJeu(ctx));
        const quand = (ctx.butoir || '').trim();
        const m = mots(ctx);
        return [
          ponctuer(`${salut(ctx)}, je reviens vers toi pour tes disponibilités sur ${nomProjet(ctx)}${d ? ' : ' + d : ''}`),
          m.rempla
            // À un·e remplaçant·e, la date butoir est une information loyale :
            // passé ce jour on aura appelé quelqu'un d'autre, et mieux vaut
            // qu'elle l'apprenne maintenant que le jour où l'on ne la rappelle
            // pas.
            ? `On arrête ${m.equipe} ${quand || 'très vite'} — au-delà je ne pourrai malheureusement plus te compter dessus :`
            : `On boucle ${m.equipe} ${quand || 'très vite'} — si tu peux répondre d'ici là, ça m'arrangerait vraiment :`,
          ctx.lien,
          '',
          'Merci, et désolé d\'insister.',
        ].join('\n');
      },
    },
    {
      cle: 'nouvelles',
      libelle: 'Des dates se sont ajoutées',
      aide: "Pour qui a déjà répondu il y a quelque temps — le lien n'a pas changé.",
      texte(ctx){
        const d = listeOuResume(enJeu(ctx));
        return [
          salut(ctx) + ',',
          '',
          ponctuer(`On t'avait demandé tes disponibilités pour ${nomProjet(ctx)} il y a quelque temps — depuis, des dates se sont ajoutées${d ? ' : ' + d : ''}`),
          `Ton lien n'a pas changé, tu peux les compléter au même endroit :`,
          ctx.lien,
          '',
          'Merci beaucoup.',
        ].join('\n');
      },
    },
    {
      cle: 'lien',
      libelle: 'Juste le lien',
      aide: "Une ligne, sans contexte — pour un lien qu'on a perdu.",
      texte(ctx){
        return `${salut(ctx)}, voilà ton lien personnel pour ${nomProjet(ctx)} — il reste valable pour tous tes projets : ${ctx.lien}`;
      },
    },

    /* ------------------------------------------------------------------------
       Informer, et non plus demander.
       ------------------------------------------------------------------------
       Les cinq modèles ci-dessus vont tous chercher quelque chose : une
       réponse, une dispo. Les trois qui suivent ne demandent rien, ils
       annoncent — une option posée, des dates validées, une option qui tombe.

       C'est la même mécanique et ce n'est pas le même geste, d'où le champ
       `contexte`. Sans lui, ces trois-là apparaîtraient dans le menu ▾ du suivi
       des dispos, où les choisir noterait une relance qui n'a pas eu lieu.

       Une règle traverse les trois : ce qu'on annonce, on dit aussi ce qu'il
       faut en faire. « Option » tout seul ne veut rien dire pour quelqu'un qui
       n'est pas dans un bureau de production — au mieux il comprend « je suis
       retenu », ce qui est faux, et il refuse un autre engagement pour une date
       qui peut tomber. On écrit donc la conséquence, à chaque fois.
    ------------------------------------------------------------------------ */
    {
      cle: 'option-posee',
      libelle: 'Option posée',
      aide: "On tient la date côté salle — rien n'est signé.",
      contexte: 'info',
      texte(ctx){
        const l = propres(enJeu(ctx));
        const d = listeOuResume(l);
        const pluriel = l.length !== 1;
        const m = mots(ctx);
        return [
          salut(ctx) + ',',
          '',
          // La date en fin de phrase, toujours : au-delà de cinq, listeOuResume
          // rend « 8 dates, entre le 12 mars et le 19 juin » — une incise qui,
          // posée au milieu, casse la lecture en deux.
          ponctuer(`Bonne nouvelle : on vient de poser une option pour ${nomProjet(ctx)}${d ? ' — ' + d : ''}`),
          m.rempla
            // Deux « rien n'est signé » valent mieux qu'un pour quelqu'un dont
            // la place n'est pas acquise : l'option engage la salle, pas nous,
            // et surtout pas elle.
            ? `On pense à toi dessus, et rien n'est signé — ni de notre côté, ni du tien. Si tu peux garder ${pluriel ? 'ces dates' : 'cette date'} de côté, c'est idéal ; je te confirme dès que c'est arrêté.`
            : `Rien n'est signé pour l'instant. Si tu peux garder ${pluriel ? 'ces dates' : 'cette date'} de côté, c'est idéal — on te confirme dès qu'on en sait plus.`,
          '',
          `Tes dates sont toujours à jour ici :`,
          ctx.lien,
        ].join('\n');
      },
    },
    {
      cle: 'dates-validees',
      libelle: 'Dates validées',
      aide: "C'est signé — la bonne nouvelle, et le lien pour la suite.",
      contexte: 'info',
      texte(ctx){
        const d = listeOuResume(enJeu(ctx));
        const m = mots(ctx);
        return [
          salut(ctx) + ',',
          '',
          // Pour le noyau, la nouvelle est que la date est signée. Pour un·e
          // remplaçant·e, c'est qu'elle est retenue — l'ordre des deux
          // informations n'est pas le même, et c'est la seconde qu'elle attend.
          m.rempla
            ? ponctuer(`C'est confirmé pour ${nomProjet(ctx)}, et on te retient sur ${d || 'les dates prévues'}`)
            : ponctuer(`C'est confirmé pour ${nomProjet(ctx)}${d ? ' — ' + d : ''}`),
          `Les horaires et le reste suivront. Tes dates sont à jour ici :`,
          ctx.lien,
          '',
          'On a hâte de s\'y mettre — à très vite.',
        ].join('\n');
      },
    },
    {
      cle: 'option-levee',
      libelle: 'Date annulée ou option levée',
      aide: "Une date qui tombe doit se dire aussi vite qu'elle s'est posée.",
      contexte: 'info',
      texte(ctx){
        const l = propres(enJeu(ctx));
        const d = listeOuResume(l);
        const pluriel = l.length > 1;

        /* Quand TOUTES les dates d'un projet tombent, ce n'est pas « des dates
           annulées » : c'est le projet qui est annulé, et l'annoncer autrement
           laisse croire qu'il en reste. La personne appelle alors pour savoir
           ce qui subsiste — ce qui est exactement le message qu'on croyait
           avoir envoyé. La page passe le drapeau ; le modèle change de phrase,
           pas de ton.

           « Tout est annulé sur X » plutôt que « X est annulé » : le nom d'un
           projet est tantôt une tournée (féminin), tantôt un recording
           (masculin), et rien dans la donnée ne dit lequel. On écrit donc une
           phrase qui n'a pas d'accord à porter. */
        const tout = !!ctx.projetEntier;
        const ouverture = tout
          ? ponctuer(`Tout est annulé sur ${nomProjet(ctx)} — ${pluriel ? 'toutes les dates tombent' : 'la seule date prévue tombe'}${d ? ' : ' + d : ''}`)
          : ponctuer(`Ce qui était posé sur ${nomProjet(ctx)} ne se fera finalement pas${d ? ' — ' + d : ''}`);

        return [
          salut(ctx) + ',',
          '',
          ouverture,
          /* Pas de « on se rattrape à la prochaine » : c'est une promesse
             d'engagement futur, et un message qui part à quarante personnes ne
             peut en porter aucune. On s'excuse, on remercie, on s'arrête là —
             la seule chose qu'on s'autorise à promettre, c'est de tenir au
             courant, et c'est le rôle du lien. */
          `Tu peux libérer ${pluriel ? 'ces journées' : 'cette journée'}. Merci de ${pluriel ? 'les ' : "l'"}avoir gardée${pluriel ? 's' : ''}, et désolé pour le contretemps.`,
          '',
          `${tout ? 'Tes autres dates sont ici' : 'Le reste de tes dates est ici'} :`,
          ctx.lien,
        ].join('\n');
      },
    },

    /* ------------------------------------------------------------------------
       Le récapitulatif — le message qui accompagne le document.
       ------------------------------------------------------------------------
       Les trois modèles ci-dessus annoncent UN changement : une option posée,
       une validation, une annulation. Ils supposent donc qu'on écrit à chaud,
       à chaque mouvement. En pratique une saison bouge dix fois par mois, et
       personne n'envoie dix messages : les changements s'accumulent, et
       l'équipe finit par apprendre les choses de travers.

       D'où ce quatrième modèle, qui ne dit pas ce qui a changé mais où l'on en
       est — la photographie du jour, avec le document en pièce jointe. C'est
       le seul dont le texte reste court quel que soit le nombre de dates :
       c'est le PDF qui les porte, et le lien qui les tient à jour ensuite.

       Il n'énumère donc aucune date. Recopier dans le corps du message ce que
       le document dit mieux, c'est prendre le risque que les deux se
       contredisent — et c'est toujours le message qu'on croit.
    ------------------------------------------------------------------------ */
    {
      cle: 'recap-doc',
      libelle: 'Le récapitulatif (document)',
      aide: "Un mot court, et le PDF en pièce jointe.",
      contexte: 'info',
      texte(ctx){
        const m = mots(ctx);
        const arrete = ctx.edite ? ` au ${ctx.edite}` : '';

        // Tout est tombé : le document n'est plus un point d'étape, c'est une
        // annulation. Le message doit le dire avant qu'on ouvre la pièce jointe.
        if(ctx.projetEntier){
          return [
            salut(ctx) + ',',
            '',
            ponctuer(`Tout est annulé sur ${nomProjet(ctx)}`),
            `Tu trouveras le détail dans le document joint. Tu peux libérer ces journées — merci de les avoir gardées, et désolé pour le contretemps.`,
            '',
            'Tes autres dates restent ici :',
            ctx.lien,
          ].join('\n');
        }

        return [
          salut(ctx) + ',',
          '',
          ponctuer(`Voici où en est ${nomProjet(ctx)} — le récapitulatif est en pièce jointe, arrêté${arrete}`),
          // La couleur ne se comprend pas toute seule : la légende est dans le
          // PDF, mais la phrase qui dit ce qu'il faut EN FAIRE est ici.
          m.rempla
            ? `Les dates en vert sont validées, celles en ambre sont encore des options : on pense à toi dessus, et rien n'est signé — ni de notre côté, ni du tien.`
            : `Les dates en vert sont validées, celles en ambre sont encore des options : la salle les tient, rien n'est signé. Tant qu'une date n'est pas validée, garde-la de côté sans la bloquer.`,
          '',
          // Le document date du jour, le lien ne date pas : c'est la seule
          // chose que ce message promet, et la seule qu'on puisse tenir.
          'Le document est une photographie du jour. La version toujours à jour est ici :',
          ctx.lien,
        ].join('\n');
      },
    },
  ];

  // Le contexte d'un modèle : 'dispo' quand il va chercher une réponse (les
  // cinq premiers, qui n'avaient pas de champ parce qu'ils étaient seuls au
  // monde), 'info' quand il annonce. Un menu ne montre qu'une famille.
  function contexteDe(m){ return m.contexte || 'dispo'; }
  function modelesDe(contexte){ return MODELES.filter(m=> contexteDe(m) === (contexte || 'dispo')); }

  /* Un point, mais pas deux. Les mois abrégés de listeOuResume finissent
     eux-mêmes par un point — « les 12, 13 mars et 2 avr. » — et une phrase qui
     s'achève sur une liste de dates se terminait donc par « avr.. ». */
  function ponctuer(phrase){
    return /[.!?…]$/.test(phrase) ? phrase : phrase + '.';
  }

  function modele(cle){ return MODELES.find(m=> m.cle === cle) || MODELES[1]; }
  function construire(cle, ctx){ return modele(cle).texte(ctx || {}); }

  // Le numéro tel que wa.me le veut : sans espaces, sans +, et un 0 initial
  // français traduit en 33. Repris à l'identique des pages, qui en avaient
  // chacune leur copie.
  function numeroWhatsapp(tel){
    let chiffres = (tel || '').replace(/[^\d+]/g, '');
    if(chiffres.startsWith('+')) chiffres = chiffres.slice(1);
    else if(chiffres.startsWith('0') && chiffres.length === 10) chiffres = '33' + chiffres.slice(1);
    return chiffres;
  }

  /* WhatsApp si l'on a un numéro, e-mail sinon, presse-papiers en dernier
     recours : personne ne doit se retrouver sans rien parce qu'une fiche est
     incomplète. Rend le canal utilisé. */
  async function envoyer(ctx, texte){
    const wa = numeroWhatsapp(ctx.telephone);
    /* Un canal demandé explicitement passe devant l'ordre habituel. C'est ce
       que réclame un envoi en série : quarante messages qui ouvrent tantôt
       WhatsApp tantôt le client de messagerie, selon ce que porte chaque
       fiche, sont quarante gestes différents à enchaîner.

       S'il n'est pas disponible pour cette personne-là, on retombe sur la
       chaîne normale plutôt que d'échouer : la promesse du module est que
       personne ne reste sans rien parce qu'une fiche est incomplète. */
    const force = ctx.canal || '';
    const partirWhatsapp = ()=>{
      window.open(`https://wa.me/${encodeURIComponent(wa)}?text=${encodeURIComponent(texte)}`, '_blank', 'noopener');
      return 'whatsapp';
    };
    const partirMail = ()=>{
      const sujet = ctx.sujet || ('Tes dispos' + (ctx.projet ? ' — ' + ctx.projet : ''));
      location.href = `mailto:${encodeURIComponent(ctx.email)}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(texte)}`;
      return 'mail';
    };

    if(force === 'mail' && ctx.email) return partirMail();
    if(force === 'whatsapp' && wa) return partirWhatsapp();
    if(wa) return partirWhatsapp();
    if(ctx.email) return partirMail();
    try{
      await navigator.clipboard.writeText(texte);
      if(typeof curieuxFlash === 'function') curieuxFlash('Aucun contact enregistré — message copié');
      else alert('Aucun téléphone ni e-mail pour cette personne — le message est copié.');
    }catch(e){
      alert(texte);
    }
    return 'copie';
  }

  // --- Le menu -------------------------------------------------------------
  let pop = null;
  let styleFait = false;

  function poserStyle(){
    if(styleFait) return;
    styleFait = true;
    const s = document.createElement('style');
    s.textContent = `
      .msg-pop{position:fixed; z-index:200; width:290px; max-width:calc(100vw - 24px);
        background:var(--card); border:1px solid var(--border); border-radius:12px;
        box-shadow:0 14px 34px rgba(20,15,10,.22); padding:6px; display:grid; gap:2px;}
      .msg-pop > button{display:block; width:100%; text-align:left; background:none; border:none;
        border-radius:8px; padding:7px 9px; cursor:pointer; font:inherit; color:var(--text);}
      .msg-pop > button:hover, .msg-pop > button:focus-visible{background:var(--accent-tint); outline:none;}
      .msg-pop > button b{display:block; font-size:13px;}
      .msg-pop > button small{display:block; font-size:11.5px; color:var(--muted); line-height:1.35; margin-top:1px;}
      /* display:flex sur une classe l'emporte sur le [hidden]{display:none}
         de la feuille du navigateur : sans cette règle, le champ de la date
         butoir se voit dès l'ouverture du menu. */
      .msg-pop-champ{display:flex; gap:6px; padding:6px 4px 4px; border-top:1px solid var(--border); margin-top:2px;}
      .msg-pop-champ[hidden]{display:none;}
      .msg-pop-champ input{flex:1; min-width:0; padding:6px 8px; border:1px solid var(--border);
        border-radius:8px; background:var(--bg); color:var(--text); font:inherit; font-size:12.5px;}
      .msg-pop-champ button{border:none; border-radius:8px; padding:6px 10px; cursor:pointer;
        background:var(--prune); color:#fff; font:inherit; font-size:12.5px; font-weight:700;}
      /* Le chevron collé au bouton d'envoi : un seul objet à l'œil, deux gestes. */
      .msg-groupe{display:inline-flex; align-items:stretch; gap:2px;}
      .msg-chevron{border:1px solid var(--border); background:var(--card); color:var(--muted);
        border-radius:8px; padding:0 7px; cursor:pointer; font-size:11px; line-height:1;}
      .msg-chevron:hover{border-color:var(--prune); color:var(--prune);}
    `;
    document.head.appendChild(s);
  }

  function fermer(){ if(pop){ pop.remove(); pop = null; } }
  document.addEventListener('click', (e)=>{
    if(pop && !e.target.closest('.msg-pop') && !e.target.closest('[data-msg-menu]')) fermer();
  }, true);
  document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') fermer(); });
  window.addEventListener('resize', fermer);

  /* Ouvre le menu sous un bouton. `apres` est appelé une fois le message parti
     — c'est là que les pages notent la relance dans dispo_demandes. */
  function ouvrirMenu(ancre, ctx, apres, options){
    poserStyle();
    const dejaOuvert = !!pop;
    fermer();
    if(dejaOuvert) return;

    // Par défaut, la famille « dispo » : c'est ce que le menu a toujours
    // montré, et les deux pages qui l'appellent sans rien préciser demandent
    // une réponse, pas une annonce.
    const liste = modelesDe((options && options.contexte) || 'dispo');

    pop = document.createElement('div');
    pop.className = 'msg-pop';
    pop.innerHTML = liste.map(m=>
      `<button type="button" data-modele="${m.cle}"><b>${escapeHtml(m.libelle)}</b><small>${escapeHtml(m.aide)}</small></button>`
    ).join('') + `<div class="msg-pop-champ" hidden>
        <input type="text" data-msg-butoir>
        <button type="button" data-msg-partir>Envoyer</button>
      </div>`;
    document.body.appendChild(pop);

    const r = ancre.getBoundingClientRect();
    const b = pop.getBoundingClientRect();
    const x = Math.max(8, Math.min(r.left, window.innerWidth - b.width - 8));
    // Sous le bouton, sauf s'il n'y a pas la place — auquel cas au-dessus.
    const y = (r.bottom + b.height + 8 > window.innerHeight) ? Math.max(8, r.top - b.height - 6) : r.bottom + 6;
    pop.style.left = Math.round(x) + 'px';
    pop.style.top = Math.round(y) + 'px';

    const champ = pop.querySelector('.msg-pop-champ');
    const saisie = pop.querySelector('[data-msg-butoir]');
    let choisi = '';

    const partir = async ()=>{
      const texte = construire(choisi, Object.assign({}, ctx, { butoir: saisie.value }));
      fermer();
      const canal = await envoyer(ctx, texte);
      if(typeof apres === 'function') apres(choisi, canal);
    };

    pop.addEventListener('click', (e)=>{
      const bouton = e.target.closest('[data-modele]');
      if(bouton){
        choisi = bouton.dataset.modele;
        const m = modele(choisi);
        // Un modèle qui réclame une précision (la date butoir) montre son
        // champ au lieu de partir tout de suite.
        if(m.champ){
          champ.hidden = false;
          saisie.placeholder = m.champ;
          saisie.focus();
          return;
        }
        partir();
        return;
      }
      if(e.target.closest('[data-msg-partir]')) partir();
    });
    saisie.addEventListener('keydown', (e)=>{ if(e.key === 'Enter'){ e.preventDefault(); partir(); } });
  }

  /* Le chevron à coller à côté d'un bouton d'envoi, dans une chaîne HTML.
     `ref` est la clé sous laquelle la page a rangé le contexte. */
  function chevronHtml(ref, titre){
    return `<button type="button" class="msg-chevron" data-msg-menu="${escapeAttr(ref)}"
      title="${escapeAttr(titre || 'Choisir un modèle de message')}" aria-label="Choisir un modèle de message">▾</button>`;
  }

  return { MODELES, modelesDe, construire, listeOuResume, periode, joindre, numeroWhatsapp, envoyer,
           ouvrirMenu, chevronHtml, fermerMenu: fermer };
})();
