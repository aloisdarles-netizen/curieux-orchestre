/* ============================================================================
 * pdf-bilan.js — le bilan de projet, sur une feuille.
 *
 * Le document qu'on envoie au président, au coproducteur ou à l'expert-comptable
 * quand un projet est fini : ce qu'il a rapporté, ce qu'il a coûté, où l'argent
 * est parti, ce qui a dérapé et ce qu'on a économisé.
 *
 * Tous les chiffres viennent de bilanDuSuivi() — le même calcul que l'écran.
 * Ce fichier ne fait aucune addition : il met en page.
 *
 * LE PREMIER TIERS DE LA PAGE PORTE LE RÉSULTAT. C'est la seule chose que
 * beaucoup de lecteurs regarderont, et il ne doit pas falloir tourner la page
 * pour savoir si le projet a gagné de l'argent.
 * ========================================================================== */

function genererBilanPdf(suivi, projet, reglages){
  if(!window.jspdf) throw new Error("la librairie PDF n'est pas chargée");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  registerHostFont(doc);

  const data = suivi.data || {};
  const b = bilanDuSuivi(data, suivi._depenses || []);
  const r = reglages || {};
  const aujourdHui = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const pct = x=> fmtQteDevis(Math.round(x * 1000) / 10) + ' %';
  const sgn = x=> (x >= 0 ? '+' : '−') + fmtEurosDevis(Math.abs(x));

  const composeur = creerComposeurPdf(doc, {
    echelleMin: 0.8, echelleMax: 1,
    fondPage: PDF_CHARTE.fond,
    // Un bilan dont le projet n'est pas clos décrit une situation, pas un
    // résultat. Le filigrane évite qu'il soit relu dans six mois comme définitif.
    filigrane: data.closLe ? '' : 'En cours',
  }).entete({
    titre: data.titre || 'Bilan de projet',
    sousTitre: [projet ? projet.nom : '', data.sourceNumero,
      data.closLe ? 'clos le ' + data.closLe : 'situation au ' + aujourdHui].filter(Boolean).join(' · '),
    mention: 'Bilan de projet',
  });

  // --- 1. LE RÉSULTAT, en haut et en grand ---------------------------------
  const res = b.resultat;
  if(res.recette){
    composeur.pastilles('Résultat', [
      { texte: `Recette ${fmtEurosDevis(res.recette)}`, fond: PDF_CHARTE.bord, encre: PDF_CHARTE.noir },
      { texte: `Coût ${fmtEurosDevis(res.coutAtterrissage)}`, fond: PDF_CHARTE.bord, encre: PDF_CHARTE.noir },
      res.margeAtterrissage >= 0
        ? { texte: `Marge ${sgn(res.margeAtterrissage)}`, fond: PDF_CHARTE.statuts.validee.fond, encre: [255, 255, 255] }
        : { texte: `Perte ${sgn(res.margeAtterrissage)}`, fond: PDF_CHARTE.statuts.annulee.trait, encre: [255, 255, 255] },
      { texte: `soit ${pct(res.recette ? res.margeAtterrissage / res.recette : 0)} de la recette`,
        fond: PDF_CHARTE.fond, encre: PDF_CHARTE.muted },
    ]);
    composeur.tableau('Compte de résultat',
      [{ titre: '', largeur: 3 },
       { titre: 'Au devis', largeur: 2, droite: true },
       { titre: 'Réalisé ou attendu', largeur: 2, droite: true },
       { titre: 'Écart', largeur: 2, droite: true }],
      [
        ['Recette contractuelle', fmtEurosDevis(res.recette), fmtEurosDevis(res.recette), '—'],
        ['Coût du projet', fmtEurosDevis(res.coutPrevu), fmtEurosDevis(res.coutAtterrissage),
          sgn(res.coutAtterrissage - res.coutPrevu)],
        { cellules: ['Marge', sgn(res.margePrevue), sgn(res.margeAtterrissage), sgn(res.gagneSurPlan)], accent: true },
      ],
      'Le coût comprend les charges patronales, les frais généraux et les imprévus : ce sont des charges du projet, '
      + 'même sans facture. Chaque euro non dépensé est un euro gagné.',
      { carte: true });
  } else {
    composeur.encadre("Aucune recette n'est renseignée sur ce suivi : ce document dit ce que le projet a coûté, pas ce qu'il a rapporté.");
    composeur.pastilles('Coût du projet', [
      { texte: `Prévu ${fmtEurosDevis(res.coutPrevu)}`, fond: PDF_CHARTE.bord, encre: PDF_CHARTE.noir },
      { texte: `Attendu ${fmtEurosDevis(res.coutAtterrissage)}`, fond: PDF_CHARTE.bord, encre: PDF_CHARTE.noir },
    ]);
  }

  // --- 2. OÙ EST PARTI L'ARGENT --------------------------------------------
  composeur.tableau('Où est parti l\'argent',
    [{ titre: 'Poste', largeur: 4 },
     { titre: 'Prévu', largeur: 2, droite: true },
     { titre: 'Réel', largeur: 2, droite: true },
     { titre: 'Écart', largeur: 2, droite: true },
     { titre: 'Part du réel', largeur: 1.4, droite: true }],
    b.parSection.map(x=> ({
      cellules: [
        x.titre + (x.quotePart ? ' (quote-part)' : ''),
        fmtEurosDevis(x.prevu), fmtEurosDevis(x.reel),
        x.prevu ? sgn(x.reel - x.prevu) : '—',
        pct(x.part),
      ],
    })),
    `Masse salariale — bruts et charges patronales — ${fmtEurosDevis(b.masseSalariale)}, soit ${pct(b.partMasseSalariale)} du coût réel. `
    + `TVA payée ${fmtEurosDevis(b.tva)}, hors de ces montants.`,
    { carte: true, zebre: true });

  // --- 3. CE QUI EXPLIQUE L'ÉCART ------------------------------------------
  const COLS_ECART = [
    { titre: 'Poste', largeur: 3.4 },
    { titre: 'Dans', largeur: 3 },
    { titre: 'Prévu', largeur: 1.8, droite: true },
    { titre: 'Réel', largeur: 1.8, droite: true },
    { titre: 'Écart', largeur: 1.8, droite: true },
  ];
  const cinq = (liste)=> liste.slice(0, 5).map(x=> ({
    cellules: [x.titre, x.chemin, fmtEurosDevis(x.prevu), fmtEurosDevis(x.reel), sgn(x.ecart)],
  }));
  if(b.derapages.length){
    composeur.tableau('Ce qui a dérapé', COLS_ECART,
      cinq(b.derapages),
      b.derapages.length > 5 ? `Les cinq plus gros sur ${b.derapages.length} postes dépassés.` : '',
      { carte: true, couleur: PDF_CHARTE.statuts.annulee.trait });
  }
  if(b.economies.length){
    composeur.tableau('Ce qu\'on a économisé', COLS_ECART,
      cinq(b.economies),
      b.economies.length > 5 ? `Les cinq plus grosses sur ${b.economies.length} postes tenus sous le budget.` : '',
      { carte: true, couleur: PDF_CHARTE.statuts.validee.fond });
  }
  if(b.internalises.length){
    composeur.tableau('Postes internalisés',
      [{ titre: 'Poste', largeur: 4 },
       { titre: 'Prévu au devis', largeur: 2, droite: true },
       { titre: 'Charges évitées', largeur: 2.4, droite: true },
       { titre: 'Économie réelle', largeur: 2, droite: true }],
      b.internalises.map(x=> ({
        cellules: [x.titre, fmtEurosDevis(x.prevu),
          x.taux ? fmtEurosDevis(x.prevu * x.taux / 100) + ` (${fmtQteDevis(x.taux)} %)` : '—',
          fmtEurosDevis(x.economie)],
      })),
      `Assurés en interne alors qu'ils étaient facturés au client : ${fmtEurosDevis(b.economieInternalisation)} au total, `
      + 'charges patronales comprises.',
      { carte: true, couleur: PDF_CHARTE.statuts.validee.fond });
  }

  // --- 4. LES COMPTEURS ----------------------------------------------------
  const c = b.compteurs;
  composeur.grille([
    { titre: 'Saisie', lignes: [
      ['Dépenses enregistrées', String(c.depenses)],
      ['Fournisseurs distincts', String(c.fournisseurs)],
      ['Dépense moyenne', fmtEurosDevis(c.montantMoyen)],
      c.premiere ? ['Première dépense', c.premiere] : null,
      c.derniere ? ['Dernière dépense', c.derniere] : null,
    ].filter(Boolean) },
    { titre: 'Couverture', lignes: [
      ['Postes prévus', String(c.postesPrevus)],
      ['Postes renseignés', String(c.postesTouches)],
      ['Postes sans dépense', String(b.jamaisTouches.length)],
      ['Reste à engager', fmtEurosDevis(b.resteAEngager)],
    ] },
    { titre: 'Imprévus', lignes: [
      ['Provision au devis', fmtEurosDevis(b.imprevusPrevu)],
      ['Consommée', fmtEurosDevis(b.horsPrevisionnel.reel)],
      ['Disponible', fmtEurosDevis(b.provisionRestante)],
      ['Dépenses hors prévisionnel', String(b.horsPrevisionnel.nb)],
    ] },
  ]);

  // --- 5. LES RÉSERVES -----------------------------------------------------
  // Un encadré et non un paragraphe de pied : une réserve posée en gris clair
  // au bas d'une page se lit comme une clause qu'on saute.
  composeur.encadre('À SAVOIR EN LISANT CE BILAN\n' + reservesBilan(b).map(x=> '— ' + x).join('\n'));

  const nom = [r.nom || 'Les Soudaines', data.titre || 'Bilan'].filter(Boolean).join(' — ');
  composeur.rendre(`Bilan_${(data.titre || 'projet').replace(/[^\w\-]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
  return nom;
}

if(typeof window !== 'undefined') window.genererBilanPdf = genererBilanPdf;
