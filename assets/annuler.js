/* ============================================================================
   « Annuler » — revenir en arrière sur la dernière action
   ============================================================================
   Une suppression était définitive, et l'application le disait : « elle
   disparaîtra complètement ». C'est vrai, et c'est le problème — on supprime
   une date en croyant en viser une autre, on s'en aperçoit à la seconde qui
   suit, et il n'y a plus rien à faire. Une fenêtre de confirmation ne protège
   de rien : on la lit la première fois, on la valide les cent suivantes.

   Ce module pose donc un ruban en bas de l'écran : ce qui vient d'être fait,
   et un bouton pour le défaire. Quinze secondes — le temps de voir le geste et
   de se raviser, pas celui de revenir une heure plus tard.

   UNE SEULE ACTION À LA FOIS. C'est délibéré : un empilement d'annulations
   demande de savoir ce qu'on défait, et dans un outil de production où trois
   personnes travaillent en même temps, « annuler » quatre gestes en arrière
   défait peut-être celui d'un autre. Une action, la dernière, la sienne.

   CE QUI EST VRAIMENT IRRÉVERSIBLE ATTEND. Certaines actions emportent avec
   elles des lignes d'autres tables — la fiche technique d'une date, ses
   remarques, ses invitations. Les supprimer tout de suite rendrait l'annulation
   à moitié fausse : la date reviendrait sans ce qui lui était attaché. La page
   qui appelle passe donc ce nettoyage en `purger` : il n'est exécuté qu'une
   fois la fenêtre refermée, quand plus personne ne peut revenir en arrière.

   Au-delà de cette fenêtre, il reste la corbeille de l'administration, qui lit
   le journal d'audit et sait restaurer une ligne supprimée.
============================================================================ */

const CurieuxAnnuler = (function(){
  const DUREE = 15000;

  // { texte, retablir, purger, minuteur } — l'action en cours, ou rien.
  let courant = null;
  let ruban = null;

  function elementRuban(){
    if(ruban && document.body.contains(ruban)) return ruban;
    ruban = document.createElement('div');
    ruban.className = 'co-annuler';
    ruban.setAttribute('role', 'status');
    ruban.innerHTML = '<span class="co-annuler-texte"></span>'
      + '<button type="button" class="co-annuler-btn">Annuler</button>'
      + '<button type="button" class="co-annuler-fermer" aria-label="Fermer">×</button>';
    ruban.querySelector('.co-annuler-btn').addEventListener('click', annuler);
    ruban.querySelector('.co-annuler-fermer').addEventListener('click', ()=> oublier(true));
    document.body.appendChild(ruban);
    return ruban;
  }

  /* OÙ SE POSE LE RUBAN.
     -------------------------------------------------------------------------
     Au milieu du bas de l'écran, il passe devant le contenu — et sur la page
     des tournées, devant la ligne de dates qu'on vient justement de modifier.
     Une page qui a une colonne libre le dit : elle marque l'élément qui donne
     la mesure (`data-annuler-ancre`), et le ruban vient s'y aligner, en bas de
     cette colonne, à sa largeur. Il n'y recouvre rien.

     Sans ancre — ou quand la mise en page l'a repliée, c'est-à-dire quand la
     colonne n'est plus une colonne — il retombe au centre. */
  function placer(el){
    let ancre = null;
    try{
      ancre = document.querySelector('[data-annuler-ancre]');
      if(ancre && (ancre.hidden || !ancre.offsetParent)) ancre = null;
    }catch(e){ ancre = null; }
    const r = ancre ? ancre.getBoundingClientRect() : null;
    // Une ancre large n'est plus une colonne mais un bandeau : le ruban y
    // serait aussi mal placé qu'au centre, et beaucoup plus surprenant.
    if(!r || r.width > 420 || r.width < 140){
      el.classList.remove('en-colonne');
      el.style.left = el.style.width = '';
      return;
    }
    el.classList.add('en-colonne');
    el.style.left = Math.round(r.left) + 'px';
    el.style.width = Math.round(r.width) + 'px';
  }

  function afficher(texte, annulable){
    const el = elementRuban();
    el.querySelector('.co-annuler-texte').textContent = texte;
    el.querySelector('.co-annuler-btn').style.display = annulable ? '' : 'none';
    placer(el);
    el.classList.add('vu');
  }
  function cacher(){ if(ruban) ruban.classList.remove('vu'); }

  /* Oublier l'action : elle n'est plus annulable. `purger` s'exécute ici, et
     seulement ici — c'est le moment où l'irréversible le devient vraiment. */
  function oublier(executerPurge){
    if(!courant) return;
    clearTimeout(courant.minuteur);
    const c = courant;
    courant = null;
    cacher();
    if(executerPurge && typeof c.purger === 'function'){
      try{ c.purger(); }catch(e){ console.warn('[annuler] purge', e); }
    }
  }

  /* Proposer une annulation.
     -------------------------------------------------------------------------
     `texte`    — ce qui vient d'être fait, au passé, tel qu'on le lira.
     `retablir` — remet les choses en l'état. Peut être asynchrone.
     `purger`   — le nettoyage irréversible, différé jusqu'à la fermeture.
  */
  function proposer(action){
    if(!action || typeof action.retablir !== 'function') return;
    // La précédente n'est plus annulable : son nettoyage part maintenant.
    oublier(true);
    courant = { texte: action.texte || 'Action effectuée.', retablir: action.retablir, purger: action.purger };
    courant.minuteur = setTimeout(()=> oublier(true), DUREE);
    afficher(courant.texte, true);
  }

  async function annuler(){
    if(!courant) return;
    const c = courant;
    clearTimeout(c.minuteur);
    courant = null;           // le nettoyage différé ne partira pas : c'est tout l'objet
    afficher('Annulation…', false);
    try{
      await c.retablir();
      afficher('Annulé.', false);
      setTimeout(cacher, 2500);
    }catch(e){
      console.warn('[annuler] rétablissement', e);
      afficher("L'annulation a échoué. Recharge la page pour voir l'état réel.", false);
      setTimeout(cacher, 8000);
    }
  }

  /* Quitter la page ferme la fenêtre : le nettoyage différé part avant. Ce
     n'est pas garanti — un onglet tué net ne prévient personne — et le pire
     qui puisse alors arriver est une fiche technique orpheline, invisible,
     exactement ce qui traînait avant qu'on s'en occupe. */
  if(typeof document !== 'undefined'){
    document.addEventListener('visibilitychange', ()=>{
      if(document.visibilityState === 'hidden') oublier(true);
    });
    window.addEventListener('pagehide', ()=> oublier(true));
    // La colonne bouge avec la fenêtre : le ruban la suit.
    window.addEventListener('resize', ()=>{ if(ruban && ruban.classList.contains('vu')) placer(ruban); });
  }

  return { proposer, oublier };
})();

if(typeof window !== 'undefined') window.CurieuxAnnuler = CurieuxAnnuler;
