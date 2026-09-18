/* ============================================================================
 * suivi-bilan.js — le bilan de fin de projet.
 *
 * Ce que le suivi ne dit pas pendant qu'on saisit : où est parti l'argent, ce
 * qui a dérapé, ce qu'on a économisé, et ce que le projet a rapporté. Un suivi
 * répond à « où en est-on ? » ; un bilan répond à « qu'est-ce qui s'est
 * passé ? ». Les deux questions ne se posent pas au même moment et ne se lisent
 * pas de la même façon.
 *
 * Aucune dépendance au DOM : le même calcul sert l'écran et le PDF, si bien
 * qu'ils ne peuvent pas diverger. S'appuie sur agregerSuivi() — le bilan ne
 * refait aucun total, il les relit et les classe.
 *
 * TOUT CE QUI EST ICI EST UN FAIT, jamais une projection. Un bilan qui
 * extrapole n'est plus un bilan.
 * ========================================================================== */

// Un poste qui compte : celui qui portait un prévisionnel, ou sur lequel de
// l'argent est sorti. Les autres n'apprennent rien.
function _noeudsBilan(data, a){
  const soldes = new Set(data.soldes || []);
  const out = [];
  (data.arbre || []).forEach(sec=>{
    (sec.groupes || []).forEach(grp=>{
      const propreGrp = (a.propre.get(grp.id) || {}).reel || 0;
      // Même règle que l'atterrissage : une facture posée sur le groupe couvre
      // ses lignes, on ne descend plus. Sinon le classement compterait deux fois.
      if(propreGrp !== 0 || !(grp.lignes || []).length){
        const c = a.cumul.get(grp.id) || {};
        out.push({ id: grp.id, titre: grp.titre || 'Autres lignes', chemin: sec.titre,
                   niveau: 'groupe', prevu: grp.prevu, reel: c.reel || 0, nb: c.nb || 0,
                   solde: soldes.has(grp.id) || soldes.has(sec.id), section: sec });
        return;
      }
      (grp.lignes || []).forEach(l=>{
        const c = a.cumul.get(l.id) || {};
        out.push({ id: l.id, titre: l.intitule || 'Sans intitulé',
                   chemin: `${sec.titre} › ${grp.titre || 'Autres lignes'}`,
                   niveau: 'ligne', prevu: l.prevu, reel: c.reel || 0, nb: c.nb || 0,
                   regime: l.regime, etat: l.etat,
                   solde: soldes.has(l.id) || soldes.has(grp.id) || soldes.has(sec.id), section: sec });
      });
    });
  });
  return out;
}

/* Le bilan. Rend tout ce que l'écran et le PDF affichent, dans l'ordre où on
 * le lit : le résultat, puis où est parti l'argent, puis ce qui explique
 * l'écart, puis ce qui reste en suspens. */
function bilanDuSuivi(data, depenses, options){
  const opt = options || {};
  const a = agregerSuivi(data, depenses);
  const deps = (depenses || []).filter(d=> (d.sens || 'depense') === 'depense');
  const noeuds = _noeudsBilan(data, a);

  // --- où est parti l'argent -----------------------------------------------
  const parSection = (data.arbre || []).map(sec=>{
    const c = a.cumul.get(sec.id) || {};
    return { titre: sec.titre, prevu: sec.prevu, reel: c.reel || 0, nb: c.nb || 0 };
  }).filter(x=> x.prevu || x.reel);
  const chargesReelles = a.chargesReellesTotal;
  parSection.push({ titre: 'Charges patronales', prevu: a.chargesPrevues, reel: chargesReelles, nb: 0, calcule: true });
  if(a.fpPrevu || a.fpReel) parSection.push({ titre: 'Fiches de paie', prevu: a.fpPrevu, reel: a.fpReel, nb: 0, calcule: true });
  if(a.fgPrevu) parSection.push({ titre: 'Frais généraux', prevu: a.fgPrevu, reel: a.fgPrevu, nb: 0, calcule: true, quotePart: true });
  if(a.orphelines.reel) parSection.push({ titre: 'Hors prévisionnel', prevu: 0, reel: a.orphelines.reel, nb: a.orphelines.nb });

  const coutTotal = parSection.reduce((s, x)=> s + x.reel, 0);
  parSection.forEach(x=> { x.part = coutTotal ? x.reel / coutTotal : 0; });
  parSection.sort((x, y)=> y.reel - x.reel);

  // La masse salariale : les bruts qui portent des charges, et leurs charges.
  // C'est le premier chiffre qu'on cherche dans un budget de spectacle.
  const bruts = ['auteur', 'musicien', 'production'].reduce((s, c)=> s + (a.assiettes[c] || 0), 0);
  const masseSalariale = bruts + chargesReelles;

  // --- ce qui explique l'écart ---------------------------------------------
  const touches = noeuds.filter(n=> n.nb > 0 || n.solde);
  const derapages = touches.filter(n=> n.reel - n.prevu > 0)
    .map(n=> ({ ...n, ecart: n.reel - n.prevu }))
    .sort((x, y)=> y.ecart - x.ecart);
  /* Un poste internalisé est une économie, mais il a sa propre section — qui
     le chiffre mieux, charges comprises. L'afficher dans les deux ferait lire
     deux fois le même euro. */
  const estInternalise = n=> n.solde && n.reel === 0 && n.prevu > 0;
  const economies = touches.filter(n=> n.prevu > 0 && n.reel - n.prevu < 0 && !estInternalise(n))
    .map(n=> ({ ...n, ecart: n.reel - n.prevu }))
    .sort((x, y)=> x.ecart - y.ecart);

  /* Les postes internalisés : prévus, soldés, et qui n'ont rien coûté.
     L'économie ne vaut pas leur prévisionnel mais leur prévisionnel MAJORÉ DES
     CHARGES qu'ils auraient portées — un poste de 3 600 € au régime technique
     en rapporte 6 012. C'est la seule façon honnête de chiffrer ce qu'on gagne
     à faire soi-même. */
  const internalises = touches.filter(estInternalise).map(n=>{
    const chargeable = n.section && n.section.remuneration
      && DEVIS_REGIMES_CHARGES.indexOf(n.regime) >= 0;
    const taux = chargeable ? devisNombre((data.taux || {})[n.regime], 0) : 0;
    return { ...n, taux, economie: n.prevu * (1 + taux / 100) };
  }).sort((x, y)=> y.economie - x.economie);

  // --- ce qui reste en suspens ---------------------------------------------
  const jamaisTouches = noeuds.filter(n=> n.nb === 0 && !n.solde && n.prevu > 0);
  const resteAEngager = jamaisTouches.reduce((s, n)=> s + n.prevu, 0);
  const engage = deps.filter(d=> d.statut === 'engage');
  const sansJustificatif = deps.filter(d=> !d.justificatifUrl && Math.abs(devisNombre(d.montantHt, 0)) >= devisNombre(opt.seuilJustificatif, 500));

  // --- les compteurs -------------------------------------------------------
  const fournisseurs = [...new Set(deps.map(d=> (d.fournisseur || '').trim()).filter(Boolean))];
  const dates = deps.map(d=> d.dateDepense).filter(Boolean).sort();

  return {
    agregat: a,
    // Le compte de résultat, dans l'ordre où on le lit.
    resultat: {
      recette: a.recette,
      coutPrevu: a.coutPrevuComplet,
      coutReel: coutTotal,
      coutAtterrissage: a.atterrissage,
      margePrevue: a.margePrevue,
      margeAtterrissage: a.margeAtterrissage,
      // Ce qu'on a gagné (ou perdu) par rapport au plan.
      gagneSurPlan: a.margeAtterrissage == null ? null : a.margeAtterrissage - a.margePrevue,
      clos: !!data.closLe,
    },
    parSection, coutTotal,
    masseSalariale, bruts, chargesReelles,
    partMasseSalariale: coutTotal ? masseSalariale / coutTotal : 0,
    derapages, economies, internalises,
    economieInternalisation: internalises.reduce((s, n)=> s + n.economie, 0),
    jamaisTouches, resteAEngager,
    horsPrevisionnel: a.orphelines,
    provisionRestante: a.provisionRestante, imprevusPrevu: a.imprevusPrevu,
    tva: a.tvaTotale,
    compteurs: {
      depenses: deps.length,
      fournisseurs: fournisseurs.length,
      postesTouches: touches.length,
      postesPrevus: noeuds.filter(n=> n.prevu > 0).length,
      engage: engage.length,
      montantEngage: engage.reduce((s, d)=> s + devisNombre(d.montantHt, 0), 0),
      sansJustificatif: sansJustificatif.length,
      montantMoyen: deps.length ? deps.reduce((s, d)=> s + devisNombre(d.montantHt, 0), 0) / deps.length : 0,
      premiere: dates[0] || '', derniere: dates[dates.length - 1] || '',
    },
    fournisseurs,
  };
}

/* Les réserves à imprimer au bas du bilan. Un bilan qui tait ce qu'il ne sait
 * pas se fait lire comme s'il savait tout. Chacune est un fait vérifiable, pas
 * une précaution de style. */
function reservesBilan(b){
  const out = [];
  if(!b.resultat.recette){
    out.push("Aucune recette n'est renseignée : le document dit ce que le projet a coûté, pas ce qu'il a rapporté.");
  } else {
    out.push("La marge ne compte que la cession. Subventions, coproductions, aides à l'emploi et billetterie ne sont pas suivies ici : si le projet en porte, le résultat réel est plus élevé.");
  }
  if(b.resteAEngager > 0){
    out.push(`${b.jamaisTouches.length} poste${b.jamaisTouches.length > 1 ? 's' : ''} prévu${b.jamaisTouches.length > 1 ? 's' : ''} n'${b.jamaisTouches.length > 1 ? 'ont' : 'a'} reçu aucune dépense, pour ${fmtEurosDevis(b.resteAEngager)} : soit les factures manquent, soit ces postes n'ont pas eu lieu. Le bilan ne tranche pas.`);
  }
  if(b.compteurs.montantEngage){
    out.push(`${fmtEurosDevis(b.compteurs.montantEngage)} sont engagés mais pas encore payés : le coût est acquis, la sortie de trésorerie non.`);
  }
  if(b.agregat.horsAssiette.length){
    const somme = b.agregat.horsAssiette.reduce((s, x)=> s + x.montant, 0);
    out.push(`${fmtEurosDevis(somme)} au régime chargeable sont posés hors d'une section de rémunération : ils n'engendrent aucune charge patronale dans ce calcul, comme au devis.`);
  }
  if(b.compteurs.sansJustificatif){
    const n = b.compteurs.sansJustificatif;
    out.push(`${n} dépense${n > 1 ? 's' : ''} de plus de 500 € ${n > 1 ? 'ne portent' : 'ne porte'} pas de lien vers ${n > 1 ? 'leur' : 'son'} justificatif.`);
  }
  out.push('Montants hors taxes. La TVA payée figure à part : elle ne se compare pas à celle du devis, qui est une TVA collectée sur une cession.');
  return out;
}

if(typeof window !== 'undefined'){
  window.bilanDuSuivi = bilanDuSuivi;
  window.reservesBilan = reservesBilan;
}
