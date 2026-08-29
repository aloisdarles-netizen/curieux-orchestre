/* ============================================================================
   Les messages de demande et de relance de dispos
   ============================================================================
   Il y avait un message par bouton, écrit en dur, et toujours le même : une
   première demande avait le ton d'une relance, une relance de dernière minute
   celui d'une invitation. Pire, la relance listait TOUTES les dates
   manquantes — sur une tournée de douze dates, le message faisait quinze
   lignes sur un téléphone, et personne ne le lisait jusqu'au lien.

   Un petit menu sur le bouton, cinq modèles, et une règle : au-delà de cinq
   dates on ne les énumère plus, on dit combien et sur quelle période. Le lien
   personnel, lui, est dans tous les modèles sans exception — c'est la seule
   chose que le message doit absolument transmettre.

   Le module ne connaît ni Supabase ni les pages : on lui donne un contexte
   (prénom, projet, lien, dates), il rend un texte et ouvre le bon canal.
============================================================================ */
const CurieuxMessages = (function(){

  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
                'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function jour(iso){
    const [, m, d] = String(iso || '').split('-');
    if(!d) return '';
    return parseInt(d, 10) + ' ' + (MOIS[parseInt(m, 10) - 1] || '');
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
          ? jour(iso) : String(parseInt(iso.split('-')[2], 10)));
      return 'les ' + joindre(parts);
    }
    return `${l.length} ${nom || 'dates'}, entre le ${jour(l[0])} et le ${jour(l[l.length - 1])}`;
  }

  // « du 3 mai au 19 juin » : la période, sans jamais énumérer.
  function periode(dates){
    const l = propres(dates);
    if(!l.length) return '';
    if(l.length === 1) return 'le ' + jour(l[0]);
    return `du ${jour(l[0])} au ${jour(l[l.length - 1])}`;
  }

  // Les dates dont parle un message : celles qui manquent si on les connaît,
  // sinon toutes celles du projet. Un modèle ne doit jamais tomber à vide.
  function enJeu(ctx){
    const m = propres(ctx.manquantes);
    return m.length ? m : propres(ctx.toutes);
  }

  function nomProjet(ctx){ return ctx.projet ? `« ${ctx.projet} »` : 'le projet'; }
  function salut(ctx){ return `Bonjour ${(ctx.prenom || '').trim()}`.trim(); }

  const MODELES = [
    {
      cle: 'premiere',
      libelle: 'Première demande',
      aide: "Présente le projet et la période — sans énumérer les dates.",
      texte(ctx){
        const p = periode(propres(ctx.toutes).length ? ctx.toutes : ctx.manquantes);
        return [
          salut(ctx) + ',',
          '',
          `On monte l'équipe pour ${nomProjet(ctx)}${p ? ', ' + p : ''}.`,
          `Tu peux renseigner tes dispos ici, en deux clics : ${ctx.lien}`,
          '',
          'Merci !',
        ].join('\n');
      },
    },
    {
      cle: 'relance',
      libelle: 'Relance courte',
      aide: 'Deux lignes : ce qui manque, et le lien.',
      texte(ctx){
        const d = listeOuResume(enJeu(ctx));
        return [
          `${salut(ctx)}, il te manque encore ${d || 'des dates'} à renseigner sur ${nomProjet(ctx)}.`,
          `Tout est sur ton lien perso : ${ctx.lien}`,
          '',
          'Merci !',
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
        return [
          `${salut(ctx)}, il me manque encore tes dispos sur ${nomProjet(ctx)}${d ? ' (' + d + ')' : ''}.`,
          `On boucle l'équipe ${quand || 'très vite'} — si tu peux répondre avant, ça m'aiderait beaucoup :`,
          ctx.lien,
          '',
          'Merci !',
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
          `On t'avait demandé tes dispos pour ${nomProjet(ctx)} il y a quelque temps — depuis, des dates se sont ajoutées${d ? ' : ' + d : ''}.`,
          `Ton lien n'a pas changé, tout est là : ${ctx.lien}`,
          '',
          'Merci !',
        ].join('\n');
      },
    },
    {
      cle: 'lien',
      libelle: 'Juste le lien',
      aide: "Une ligne, sans contexte — pour un lien qu'on a perdu.",
      texte(ctx){
        return `Ton lien perso pour tes dispos sur ${nomProjet(ctx)} : ${ctx.lien}`;
      },
    },
  ];

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
    if(wa){
      window.open(`https://wa.me/${encodeURIComponent(wa)}?text=${encodeURIComponent(texte)}`, '_blank', 'noopener');
      return 'whatsapp';
    }
    if(ctx.email){
      const sujet = ctx.sujet || ('Tes dispos' + (ctx.projet ? ' — ' + ctx.projet : ''));
      location.href = `mailto:${encodeURIComponent(ctx.email)}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(texte)}`;
      return 'mail';
    }
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
  function ouvrirMenu(ancre, ctx, apres){
    poserStyle();
    const dejaOuvert = !!pop;
    fermer();
    if(dejaOuvert) return;

    pop = document.createElement('div');
    pop.className = 'msg-pop';
    pop.innerHTML = MODELES.map(m=>
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

  return { MODELES, construire, listeOuResume, periode, joindre, numeroWhatsapp, envoyer,
           ouvrirMenu, chevronHtml, fermerMenu: fermer };
})();
