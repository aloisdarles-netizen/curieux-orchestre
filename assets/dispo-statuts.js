/* ============================================================================
   Le vocabulaire des disponibilités
   ============================================================================
   Un statut de dispo était défini quatre fois : la liste et le cycle de clic
   dans deux pages, les libellés dans deux autres, les symboles ailleurs, et
   les couleurs dans quatre feuilles de style. Rien ne garantissait qu'ils
   disent la même chose — et ils ne le disaient pas : le même vert signifiait
   « disponible » sur un écran et « affecté·e » sur un autre, et l'export PDF
   d'une page contredisait la page dont il sortait.

   Ce module est le seul endroit où l'on décide ce qu'est un statut : son nom
   technique, son libellé en français, son symbole, sa classe, et sa couleur
   pour le PDF. Les pages ne redéfinissent plus rien, elles demandent.

   Il ne connaît ni Supabase, ni le DOM, ni les pages : on lui donne un état,
   il rend de quoi l'afficher. C'est ce qui permet à l'écran et au PDF de
   partir de la même source, au lieu de diverger à la première correction.
============================================================================ */
const CurieuxDispos = (function(){

  /* L'ordre est celui du cycle de clic : rien → disponible → indisponible →
     à confirmer → rien. Il a été choisi pour que les deux réponses les plus
     fréquentes soient à un et deux clics. */
  const ORDRE = ['', 'dispo', 'indispo', 'incertain'];

  /* La table des états. « affecte » n'est pas une réponse de la personne mais
     une décision de la production : il ne fait donc pas partie du cycle, et
     vit ici parce qu'il occupe la même case et doit se distinguer des trois
     autres d'un coup d'œil.

     couleurPdf : la police embarquée du PDF n'a ni ✓ ni ✕ (les marques y sont
     tracées au trait), mais les fonds, eux, doivent être ceux de l'écran. */
  const ETATS = {
    '':          { libelle:'Non renseigné', court:'—', symbole:'—', classe:'',          couleurPdf:null },
    dispo:       { libelle:'Disponible',    court:'Dispo', symbole:'✓', classe:'dispo',     couleurPdf:[206, 225, 244] },
    indispo:     { libelle:'Indisponible',  court:'Indispo', symbole:'✕', classe:'indispo',   couleurPdf:[178, 59, 46] },
    incertain:   { libelle:'À confirmer',   court:'À confirmer', symbole:'?', classe:'incertain', couleurPdf:[184, 121, 42] },
    affecte:     { libelle:'Affecté·e',     court:'Affecté·e', symbole:'✓', classe:'assigned',  couleurPdf:[47, 143, 91] },
  };

  function etat(cle){ return ETATS[cle || ''] || ETATS['']; }
  function libelle(cle){ return etat(cle).libelle; }
  function symbole(cle){ return etat(cle).symbole; }
  function classe(cle){ return etat(cle).classe; }
  function couleurPdf(cle){ return etat(cle).couleurPdf; }

  /* Le clic suivant, et le précédent.
     « Précédent » n'existait nulle part : dépasser la bonne valeur obligeait à
     refaire tout le tour — trois clics, trois écritures en base, et autant de
     rafraîchissements chez les autres. */
  function suivant(cle){
    const i = ORDRE.indexOf(cle || '');
    return ORDRE[(i < 0 ? 0 : i + 1) % ORDRE.length];
  }
  function precedent(cle){
    const i = ORDRE.indexOf(cle || '');
    return ORDRE[((i < 0 ? 0 : i) - 1 + ORDRE.length) % ORDRE.length];
  }

  /* Ce qu'une case doit montrer, une fois croisées les deux questions : la
     production l'a-t-elle retenue sur cette date, et qu'a-t-elle répondu ?
     Une affectation l'emporte : on ne grise jamais quelqu'un qui joue. */
  function etatCellule({ affecte, statut }){
    if(affecte) return 'affecte';
    return ORDRE.includes(statut) ? statut : '';
  }

  /* La phrase que lit un lecteur d'écran, et que porte l'infobulle.
     Un « ✓ » seul ne dit ni qui, ni quand, ni ce qu'il affirme. */
  function annonce({ qui, quand, cle }){
    return [qui, quand].filter(Boolean).join(', ') + ' : ' + libelle(cle).toLowerCase();
  }

  // Les états proposés au clic, pour construire une légende sans la recopier.
  function pourLegende(){
    return ['affecte', 'dispo', 'indispo', 'incertain'].map(c=> ({ cle:c, ...ETATS[c] }));
  }

  /* --------------------------------------------------------------------------
     À qui manque-t-il une réponse ?
     --------------------------------------------------------------------------
     La question la plus posée de l'application, et elle avait deux réponses
     chiffrées contradictoires, visibles à un clic l'une de l'autre : la Vue
     d'ensemble comptait toutes les dates à venir du projet, la page des
     demandes seulement celles que le lien couvrait. Quelqu'un sollicité sur
     trois dates d'une tournée qui en compte douze, et qui avait répondu à ses
     trois, était « ✓ Répondu » d'un côté et « en attente » de l'autre.

     C'est la seconde définition qui est juste : on ne peut pas reprocher à
     quelqu'un de n'avoir pas répondu sur des dates qu'on ne lui a pas
     soumises. Elle est écrite ici, une fois.
  -------------------------------------------------------------------------- */

  /* Les dates d'un projet auxquelles on peut encore répondre : à venir, et pas
     annulées — une date annulée n'attend plus rien de personne. */
  function datesRepondables(projet, aujourdhui){
    const jour = aujourdhui || new Date().toISOString().slice(0, 10);
    return ((projet && projet.dates) || [])
      .filter(d=> d.date && d.date >= jour && d.statut !== 'annulee');
  }

  /* Les dates que CETTE demande couvre réellement.
     Une liste de dates vide veut dire « tout le projet » — c'est la sentinelle
     la plus recopiée de l'application (sept fois côté client, une fois en SQL).
     Elle n'est plus écrite qu'ici. */
  function datesDeLaDemande(demande, repondables){
    const choisies = demande && demande.dates;
    if(!choisies || !choisies.length) return repondables;
    return repondables.filter(d=> choisies.includes(d.id));
  }

  /* Ce qui manque à une personne sur un projet donné : rien de plus que les
     dates qu'on lui a soumises et auxquelles elle n'a pas répondu. */
  function datesManquantes(personne, demande, projet, aujourdhui){
    const concernees = datesDeLaDemande(demande, datesRepondables(projet, aujourdhui));
    const dispo = (personne && personne.disponibilites) || {};
    return concernees.filter(d=> !dispo[d.date]);
  }

  /* L'avancement d'une personne sur un projet : combien de dates soumises,
     combien répondues, et s'il reste quelque chose à attendre. */
  function avancement(personne, demande, projet, aujourdhui){
    const concernees = datesDeLaDemande(demande, datesRepondables(projet, aujourdhui));
    const manquantes = datesManquantes(personne, demande, projet, aujourdhui);
    return {
      concernees,
      manquantes,
      total: concernees.length,
      repondues: concernees.length - manquantes.length,
      complet: concernees.length > 0 && manquantes.length === 0,
      // Un projet sans date répondable ne met personne en attente : sans cela,
      // une tournée passée aurait gonflé le compteur jusqu'à la fin des temps.
      enAttente: concernees.length > 0 && manquantes.length > 0,
    };
  }

  return {
    ORDRE, ETATS,
    etat, libelle, symbole, classe, couleurPdf,
    suivant, precedent, etatCellule, annonce, pourLegende,
    datesRepondables, datesDeLaDemande, datesManquantes, avancement,
  };
})();
