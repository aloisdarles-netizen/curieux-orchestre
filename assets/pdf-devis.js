/* ============================================================================
 * pdf-devis.js — le devis rendu en PDF à la charte, prêt à partir chez le
 * client.
 *
 * Reprend la composition du document historique (l'export du tableur) : bloc
 * légal, en-tête éditorial (date, intervention, rendus en colonnes), sections
 * numérotées ligne à ligne, charges calculées, coûts comptables, total —
 * et y ajoute ce que le tableur ne savait pas faire : ventilation de TVA,
 * options à part, cadre « bon pour accord », numéro et validité.
 *
 * Chaque LIGNE du devis est une section du composeur : un devis de quarante
 * lignes pagine ainsi proprement (le composeur place chaque section entière ou
 * passe à la page suivante), là où un unique grand tableau déborderait du bas
 * de page sans prévenir. L'échelle est verrouillée à 1 : un devis se lit au
 * corps normal, sur autant de pages qu'il faut.
 *
 * Dépendances : jsPDF, pdf-charte.js, devis-commun.js, brand-assets.js.
 * ========================================================================== */

// Colonnes du corps, en fractions de la largeur utile.
const DEVIS_PDF_COLS = {
  intitule: [0, 0.29],
  noms:     [0.30, 0.24],
  journees: [0.55, 0.05],
  qte:      [0.61, 0.045],
  unite:    [0.665, 0.10],
  prix:     [0.77, 0.095],
  total:    [0.875, 0.125],
};

function genererDevisPdf(devis, client, reglages){
  if(!window.jspdf) throw new Error("la librairie PDF n'est pas chargée");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  registerHostFont(doc);

  const calc = calculerDevis(devis);
  const r = reglages || {};
  const composeur = creerComposeurPdf(doc, { echelleMin: 1, echelleMax: 1, mentionDebordement: false }).entete({
    titre: devis.titre || 'Devis',
    sousTitre: [devis.numero, devis.variante ? 'Variante ' + devis.variante : '']
      .filter(Boolean).join(' · '),
    mention: devis.numero || 'Devis',
  });

  const jaune = [255, 240, 170];

  // --- Bloc légal : émetteur à gauche, client à droite ----------------------
  composeur.libre((k, dessiner, y, o)=>{
    const demi = o.utile / 2 - 4;
    const ptNom = 9, ptTexte = 6.8;
    const emetteur = [
      [r.siret ? 'SIRET : ' + r.siret : '', r.adresse].filter(Boolean).join(' ; '),
      r.ape || '',
      r.tvaIntracom ? 'N° TVA intracommunautaire : ' + r.tvaIntracom : '',
      r.representant || '',
      [r.email, r.tel].filter(Boolean).join(' — '),
    ].filter(Boolean);
    const destinataire = client ? [
      [client.siret ? 'SIRET : ' + client.siret : '', client.tvaIntracom ? 'TVA : ' + client.tvaIntracom : ''].filter(Boolean).join(' ; '),
      client.adresse || '',
      [client.contactNom, client.email].filter(Boolean).join(' — '),
    ].filter(Boolean) : [];

    doc.setFont('Host', 'normal'); doc.setFontSize(ptTexte);
    const lE = emetteur.flatMap(t=> o.lignes(t, demi));
    const lD = destinataire.flatMap(t=> o.lignes(t, demi));
    const h = Math.max(
      o.hLigne(ptNom) + lE.length * o.hLigne(ptTexte),
      destinataire.length ? o.hLigne(ptNom) + lD.length * o.hLigne(ptTexte) + 6 : 0
    ) + 4;

    if(dessiner){
      doc.setFont('Host', 'bold'); doc.setFontSize(ptNom); o.encre(o.charte.prune);
      doc.text(r.nom || 'LES SOUDAINES', o.marge, y, { baseline: 'top' });
      doc.setFont('Host', 'normal'); doc.setFontSize(ptTexte); o.encre(o.charte.muted);
      doc.text(lE, o.marge, y + o.hLigne(ptNom) + 1, { baseline: 'top' });

      if(client){
        const x = o.marge + o.utile / 2 + 4;
        o.fond(o.charte.fond); o.trait(o.charte.bord); doc.setLineWidth(0.3);
        doc.roundedRect(x - 3, y - 2, o.utile / 2 - 1, h - 1, 2, 2, 'FD');
        doc.setFont('Host', 'bold'); doc.setFontSize(6.2); o.encre(o.charte.muted);
        doc.setCharSpace(0.1);
        doc.text('DEVIS ADRESSÉ À', x, y, { baseline: 'top' });
        doc.setCharSpace(0);
        doc.setFont('Host', 'bold'); doc.setFontSize(ptNom - 1); o.encre(o.charte.noir);
        doc.text(client.nom || '', x, y + o.hLigne(6.2) + 1, { baseline: 'top' });
        doc.setFont('Host', 'normal'); doc.setFontSize(ptTexte); o.encre(o.charte.muted);
        doc.text(lD, x, y + o.hLigne(6.2) + o.hLigne(ptNom - 1) + 2, { baseline: 'top' });
      }
    }
    return h + 4;
  });

  // --- En-tête éditorial : date, intervention, rendus, hors devis -----------
  const champEditorial = (libelle, texte)=> composeur.libre((k, dessiner, y, o)=>{
    const xTexte = o.marge + 26;
    const largeur = o.utile - 26;
    doc.setFont('Host', 'normal'); doc.setFontSize(7.6);
    const l = o.lignes(texte, largeur);
    const h = Math.max(l.length * o.hLigne(7.6), o.hLigne(7.6)) + 2.4;
    if(dessiner){
      doc.setFont('Host', 'bold'); doc.setFontSize(6.6); o.encre(o.charte.prune);
      doc.text(libelle.toUpperCase(), o.marge, y + 0.4, { baseline: 'top' });
      doc.setFont('Host', 'normal'); doc.setFontSize(7.6); o.encre(o.charte.noir);
      doc.text(l, xTexte, y, { baseline: 'top' });
      o.trait(o.charte.bord); doc.setLineWidth(0.15);
      doc.line(o.marge, y + h - 1.2, o.marge + o.utile, y + h - 1.2);
    }
    return h;
  });

  const dateTexte = [devis.date || 'À définir',
    devis.validiteJours ? `offre valable ${devis.validiteJours} jours` : '']
    .filter(Boolean).join(' — ');
  champEditorial('Date', dateTexte);
  if(devis.intervention) champEditorial('Intervention', devis.intervention);

  const rendus = (devis.rendus || []).filter(x=> (x.titre || x.texte));
  if(rendus.length){
    composeur.libre((k, dessiner, y, o)=>{
      const xTexte = o.marge + 26;
      const largeur = o.utile - 26;
      const colLarg = largeur / rendus.length - 3;
      doc.setFont('Host', 'normal'); doc.setFontSize(7.2);
      const colonnes = rendus.map(x=> ({
        titre: x.titre || '',
        lignes: o.lignes(x.texte || '', colLarg),
      }));
      const h = Math.max(...colonnes.map(c=> o.hLigne(7.2) + 1 + c.lignes.length * o.hLigne(7.2))) + 2.6;
      if(dessiner){
        doc.setFont('Host', 'bold'); doc.setFontSize(6.6); o.encre(o.charte.prune);
        doc.text('RENDUS', o.marge, y + 0.4, { baseline: 'top' });
        colonnes.forEach((c, i)=>{
          const x = xTexte + i * (largeur / rendus.length);
          doc.setFont('Host', 'bold'); doc.setFontSize(7.2); o.encre(o.charte.noir);
          doc.text(c.titre.toUpperCase(), x, y, { baseline: 'top' });
          doc.setFont('Host', 'normal'); o.encre(o.charte.muted);
          doc.text(c.lignes, x, y + o.hLigne(7.2) + 1, { baseline: 'top' });
        });
        o.trait(o.charte.bord); doc.setLineWidth(0.15);
        doc.line(o.marge, y + h - 1.2, o.marge + o.utile, y + h - 1.2);
      }
      return h;
    });
  }
  if(devis.horsDevisTexte) champEditorial('Hors devis', devis.horsDevisTexte);

  // --- Corps : sections numérotées, groupes, lignes -------------------------
  const X = (o, cle)=> o.marge + o.utile * DEVIS_PDF_COLS[cle][0];
  const L = (o, cle)=> o.utile * DEVIS_PDF_COLS[cle][1];

  const enteteColonnes = ()=> composeur.libre((k, dessiner, y, o)=>{
    const h = o.hLigne(6) + 2.2;
    if(!dessiner) return h;
    doc.setFont('Host', 'bold'); doc.setFontSize(6); o.encre(o.charte.muted);
    doc.setCharSpace(0.06);
    doc.text('INTITULÉ', X(o, 'intitule'), y, { baseline: 'top' });
    doc.text('NOM / INFOS', X(o, 'noms'), y, { baseline: 'top' });
    doc.text('JOURS', X(o, 'journees') + L(o, 'journees'), y, { baseline: 'top', align: 'right' });
    doc.text('QTÉ', X(o, 'qte') + L(o, 'qte'), y, { baseline: 'top', align: 'right' });
    doc.text('UNITÉ', X(o, 'unite'), y, { baseline: 'top' });
    doc.text('COÛT UNIT.', X(o, 'prix') + L(o, 'prix'), y, { baseline: 'top', align: 'right' });
    doc.text('TOTAL', X(o, 'total') + L(o, 'total'), y, { baseline: 'top', align: 'right' });
    doc.setCharSpace(0);
    o.trait(o.charte.prune); doc.setLineWidth(0.35);
    doc.line(o.marge, y + h - 1.2, o.marge + o.utile, y + h - 1.2);
    return h;
  });

  calc.sections.forEach((s, si)=>{
    // Titre de section, dans l'idiome des rubriques (filet prune + capitales).
    composeur.libre((k, dessiner, y, o)=>{
      const pt = 8.4;
      const h = o.hLigne(pt) + 3.4;
      if(!dessiner) return h;
      o.fond(o.charte.prune);
      doc.rect(o.marge, y + 1.4, 1.2, o.hLigne(pt) * 0.8, 'F');
      doc.setFont('Host', 'bold'); doc.setFontSize(pt); o.encre(o.charte.prune);
      doc.setCharSpace(0.08);
      doc.text(`${si + 1} —  ${(s.section.titre || 'Section').toUpperCase()}`, o.marge + 3.4, y + 1, { baseline: 'top' });
      doc.setCharSpace(0);
      return h;
    });
    enteteColonnes();

    s.groupes.forEach(g=>{
      if(g.groupe.titre){
        composeur.libre((k, dessiner, y, o)=>{
          const h = o.hLigne(6.8) + 1.6;
          if(!dessiner) return h;
          o.fond(o.charte.fond);
          doc.rect(o.marge, y - 0.6, o.utile, h - 0.4, 'F');
          doc.setFont('Host', 'bold'); doc.setFontSize(6.8); o.encre(o.charte.noir);
          doc.setCharSpace(0.06);
          doc.text(g.groupe.titre.toUpperCase(), o.marge + 1.4, y + 0.4, { baseline: 'top' });
          doc.setCharSpace(0);
          return h;
        });
      }
      g.lignes.forEach(x=>{
        const l = x.ligne;
        composeur.libre((k, dessiner, y, o)=>{
          const pt = 7.4, ptPetit = 6.6;
          doc.setFont('Host', 'normal'); doc.setFontSize(pt);
          const lInt = o.lignes(l.intitule || '', L(o, 'intitule'));
          doc.setFontSize(ptPetit);
          const lNoms = o.lignes([l.noms, l.infos].filter(Boolean).join(' — '), L(o, 'noms'));
          const h = Math.max(lInt.length * o.hLigne(pt), lNoms.length * o.hLigne(ptPetit), o.hLigne(pt)) + 1.8;
          if(!dessiner) return h;

          if(l.discuter){
            doc.setFillColor(jaune[0], jaune[1], jaune[2]);
            doc.rect(o.marge, y - 0.7, o.utile, h - 0.4, 'F');
          }
          const grise = l.etat === 'hors_devis';
          doc.setFont('Host', 'bold'); doc.setFontSize(pt); o.encre(grise ? o.charte.muted : o.charte.noir);
          doc.text(lInt, X(o, 'intitule'), y, { baseline: 'top' });
          doc.setFont('Host', 'normal'); doc.setFontSize(ptPetit); o.encre(o.charte.muted);
          doc.text(lNoms, X(o, 'noms'), y, { baseline: 'top' });

          doc.setFontSize(pt); o.encre(grise ? o.charte.muted : o.charte.noir);
          if(l.etat === 'hors_devis'){
            doc.setFont('Host', 'normal'); o.encre(o.charte.muted);
            doc.text('Hors devis', X(o, 'unite'), y, { baseline: 'top' });
            doc.text('0,00 €', X(o, 'total') + L(o, 'total'), y, { baseline: 'top', align: 'right' });
          } else {
            const j = devisNombre(l.journees, 0);
            if(j) doc.text(fmtQteDevis(j), X(o, 'journees') + L(o, 'journees'), y, { baseline: 'top', align: 'right' });
            doc.text(fmtQteDevis(devisNombre(l.qte, 1)), X(o, 'qte') + L(o, 'qte'), y, { baseline: 'top', align: 'right' });
            doc.setFontSize(ptPetit);
            doc.text(o.lignes(l.unite || '', L(o, 'unite'))[0] || '', X(o, 'unite'), y, { baseline: 'top' });
            doc.setFontSize(pt);
            doc.text(fmtEurosDevis(l.prix), X(o, 'prix') + L(o, 'prix'), y, { baseline: 'top', align: 'right' });
            if(l.etat === 'optionnelle'){
              doc.setFont('Host', 'bold'); doc.setFontSize(ptPetit); o.encre(o.charte.orange);
              doc.text('OPTION  ' + fmtEurosDevis(x.total), X(o, 'total') + L(o, 'total'), y, { baseline: 'top', align: 'right' });
            } else {
              doc.setFont('Host', 'bold');
              doc.text(fmtEurosDevis(x.total), X(o, 'total') + L(o, 'total'), y, { baseline: 'top', align: 'right' });
            }
          }
          o.trait(o.charte.bord); doc.setLineWidth(0.12);
          doc.line(o.marge, y + h - 1, o.marge + o.utile, y + h - 1);
          return h;
        });
      });
    });

    // Sous-total de la section.
    composeur.libre((k, dessiner, y, o)=>{
      const h = o.hLigne(7.8) + 3;
      if(!dessiner) return h;
      doc.setFont('Host', 'bold'); doc.setFontSize(7.2); o.encre(o.charte.prune);
      doc.text(`Sous-total « ${s.section.titre || 'section'} »`, X(o, 'prix') + L(o, 'prix'), y + 1, { baseline: 'top', align: 'right' });
      doc.setFontSize(7.8); o.encre(o.charte.noir);
      doc.text(fmtEurosDevis(s.sousTotal), X(o, 'total') + L(o, 'total'), y + 1, { baseline: 'top', align: 'right' });
      return h;
    });
  });

  // --- Charges patronales ---------------------------------------------------
  const chargesVisibles = calc.chargesLignes.filter(c=> c.assiette > 0);
  if(chargesVisibles.length){
    composeur.libre((k, dessiner, y, o)=>{
      const pt = 8.4;
      const h = o.hLigne(pt) + 3.4;
      if(!dessiner) return h;
      o.fond(o.charte.prune);
      doc.rect(o.marge, y + 1.4, 1.2, o.hLigne(pt) * 0.8, 'F');
      doc.setFont('Host', 'bold'); doc.setFontSize(pt); o.encre(o.charte.prune);
      doc.setCharSpace(0.08);
      doc.text(`${calc.sections.length + 1} —  CHARGES PATRONALES`, o.marge + 3.4, y + 1, { baseline: 'top' });
      doc.setCharSpace(0);
      return h;
    });
    chargesVisibles.forEach(c=>{
      composeur.libre((k, dessiner, y, o)=>{
        const h = o.hLigne(7.4) + 1.8;
        if(!dessiner) return h;
        doc.setFont('Host', 'normal'); doc.setFontSize(7.4); o.encre(o.charte.noir);
        doc.text(c.libelle, X(o, 'intitule'), y, { baseline: 'top' });
        doc.setFontSize(6.6); o.encre(o.charte.muted);
        doc.text(`assiette ${fmtEurosDevis(c.assiette)}`, X(o, 'noms'), y, { baseline: 'top' });
        doc.setFontSize(7.4); o.encre(o.charte.noir);
        doc.text(c.taux.toLocaleString('fr-FR') + ' %', X(o, 'prix') + L(o, 'prix'), y, { baseline: 'top', align: 'right' });
        doc.setFont('Host', 'bold');
        doc.text(fmtEurosDevis(c.montant), X(o, 'total') + L(o, 'total'), y, { baseline: 'top', align: 'right' });
        o.trait(o.charte.bord); doc.setLineWidth(0.12);
        doc.line(o.marge, y + h - 1, o.marge + o.utile, y + h - 1);
        return h;
      });
    });
    composeur.libre((k, dessiner, y, o)=>{
      const h = o.hLigne(7.8) + 3;
      if(!dessiner) return h;
      doc.setFont('Host', 'bold'); doc.setFontSize(7.2); o.encre(o.charte.prune);
      doc.text('Sous-total « Charges patronales »', X(o, 'prix') + L(o, 'prix'), y + 1, { baseline: 'top', align: 'right' });
      doc.setFontSize(7.8); o.encre(o.charte.noir);
      doc.text(fmtEurosDevis(calc.chargesTotal), X(o, 'total') + L(o, 'total'), y + 1, { baseline: 'top', align: 'right' });
      return h;
    });
  }

  // --- Divers (frais généraux, imprévus, fiches de paie, remise) ------------
  const diversLignes = [
    calc.fraisGeneraux ? ['Frais généraux', `${devisNombre(devis.fraisGenerauxPct, 0).toLocaleString('fr-FR')} % de ${fmtEurosDevis(calc.baseFG)}`, calc.fraisGeneraux] : null,
    calc.imprevus ? ['Imprévus', `${devisNombre(devis.imprevusPct, 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} % de ${fmtEurosDevis(calc.baseFG)}`, calc.imprevus] : null,
    calc.fichesPaie ? ['Émission fiches de paie / forfait compta', `${fmtQteDevis((devis.fichesPaie || {}).nb)} fiches × ${fmtEurosDevis((devis.fichesPaie || {}).prix)}`, calc.fichesPaie] : null,
    calc.remise ? [(devis.remise || {}).libelle || 'Remise commerciale', '', -calc.remise] : null,
  ].filter(Boolean);
  if(diversLignes.length){
    composeur.libre((k, dessiner, y, o)=>{
      const pt = 8.4;
      const h = o.hLigne(pt) + 3.4;
      if(!dessiner) return h;
      o.fond(o.charte.prune);
      doc.rect(o.marge, y + 1.4, 1.2, o.hLigne(pt) * 0.8, 'F');
      doc.setFont('Host', 'bold'); doc.setFontSize(pt); o.encre(o.charte.prune);
      doc.setCharSpace(0.08);
      doc.text(`${calc.sections.length + (chargesVisibles.length ? 2 : 1)} —  DIVERS`, o.marge + 3.4, y + 1, { baseline: 'top' });
      doc.setCharSpace(0);
      return h;
    });
    diversLignes.forEach(([libelle, detail, montant])=>{
      composeur.libre((k, dessiner, y, o)=>{
        const h = o.hLigne(7.4) + 1.8;
        if(!dessiner) return h;
        doc.setFont('Host', 'normal'); doc.setFontSize(7.4); o.encre(o.charte.noir);
        doc.text(libelle, X(o, 'intitule'), y, { baseline: 'top' });
        doc.setFontSize(6.6); o.encre(o.charte.muted);
        doc.text(detail, X(o, 'noms'), y, { baseline: 'top' });
        doc.setFont('Host', 'bold'); doc.setFontSize(7.4); o.encre(o.charte.noir);
        doc.text(fmtEurosDevis(montant), X(o, 'total') + L(o, 'total'), y, { baseline: 'top', align: 'right' });
        o.trait(o.charte.bord); doc.setLineWidth(0.12);
        doc.line(o.marge, y + h - 1, o.marge + o.utile, y + h - 1);
        return h;
      });
    });
  }

  // --- Totaux : HT, TVA ventilée, TTC, acompte ------------------------------
  composeur.libre((k, dessiner, y, o)=>{
    const lignesTotaux = [
      ['TOTAL DEVIS (HORS TAXES)', calc.totalHT, true],
      ...calc.ventilationTva.map(v=> [`TVA ${v.taux.toLocaleString('fr-FR')} % (sur ${fmtEurosDevis(v.base)})`, v.montant, false]),
      ['TOTAL TTC', calc.totalTTC, true],
    ];
    const hLignes = lignesTotaux.reduce((s, [, , fort])=> s + o.hLigne(fort ? 9.5 : 7.2) + 1.6, 0);
    const h = hLignes + 8;
    if(!dessiner) return h;

    o.fond(o.charte.fond); o.trait(o.charte.prune); doc.setLineWidth(0.5);
    doc.roundedRect(o.marge + o.utile * 0.42, y, o.utile * 0.58, h - 2, 2.5, 2.5, 'FD');
    let yy = y + 4;
    lignesTotaux.forEach(([libelle, montant, fort])=>{
      doc.setFont('Host', fort ? 'bold' : 'normal');
      doc.setFontSize(fort ? 9.5 : 7.2);
      o.encre(fort ? o.charte.prune : o.charte.muted);
      doc.text(libelle, o.marge + o.utile * 0.42 + 5, yy, { baseline: 'top' });
      o.encre(fort ? o.charte.noir : o.charte.muted);
      doc.text(fmtEurosDevis(montant), o.marge + o.utile - 5, yy, { baseline: 'top', align: 'right' });
      yy += o.hLigne(fort ? 9.5 : 7.2) + 1.6;
    });
    return h;
  });

  if(devis.acomptePct){
    composeur.libre((k, dessiner, y, o)=>{
      const texte = `Acompte à la commande : ${devisNombre(devis.acomptePct, 0).toLocaleString('fr-FR')} % soit ${fmtEurosDevis(calc.totalTTC * devisNombre(devis.acomptePct, 0) / 100)} TTC.`;
      const h = o.hLigne(7.2) + 2;
      if(!dessiner) return h;
      doc.setFont('Host', 'bold'); doc.setFontSize(7.2); o.encre(o.charte.noir);
      doc.text(texte, o.marge + o.utile, y, { baseline: 'top', align: 'right' });
      return h;
    });
  }

  // --- Options (récapitulées hors total) ------------------------------------
  if(calc.options.length){
    composeur.libre((k, dessiner, y, o)=>{
      doc.setFont('Host', 'normal'); doc.setFontSize(7);
      const lignesOpt = calc.options.map(x=> `${x.ligne.intitule || 'Option'} : ${fmtEurosDevis(x.total)} HT`);
      const l = o.lignes('En option, non compris dans le total — ' + lignesOpt.join(' · '), o.utile);
      const h = l.length * o.hLigne(7) + 3;
      if(!dessiner) return h;
      o.encre(o.charte.orange);
      doc.text(l, o.marge, y + 1, { baseline: 'top' });
      return h;
    });
  }

  // --- Conditions + bon pour accord -----------------------------------------
  if(devis.conditionsReglement) composeur.paragraphe(devis.conditionsReglement);

  composeur.libre((k, dessiner, y, o)=>{
    const h = 26;
    if(!dessiner) return h;
    const demi = o.utile / 2 - 4;
    o.trait(o.charte.bord); doc.setLineWidth(0.35);
    doc.roundedRect(o.marge, y + 2, demi, h - 4, 2, 2, 'D');
    doc.roundedRect(o.marge + o.utile / 2 + 4, y + 2, demi, h - 4, 2, 2, 'D');
    doc.setFont('Host', 'bold'); doc.setFontSize(6.4); o.encre(o.charte.muted);
    doc.setCharSpace(0.08);
    doc.text('POUR ' + (r.nom || 'LES SOUDAINES').toUpperCase(), o.marge + 4, y + 5.5, { baseline: 'top' });
    doc.text('BON POUR ACCORD — LE CLIENT', o.marge + o.utile / 2 + 8, y + 5.5, { baseline: 'top' });
    doc.setCharSpace(0);
    doc.setFont('Host', 'normal'); doc.setFontSize(6.2);
    doc.text('Date et signature', o.marge + 4, y + 10, { baseline: 'top' });
    doc.text('Date, mention « bon pour accord » et signature', o.marge + o.utile / 2 + 8, y + 10, { baseline: 'top' });
    return h;
  });

  const nomFichier = `devis-${(devis.numero || devis.titre || 'brouillon').replace(/[^\w-]+/g, '-').toLowerCase()}.pdf`;
  composeur.rendre(nomFichier);
  return doc;
}
