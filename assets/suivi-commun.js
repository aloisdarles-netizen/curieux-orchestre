/* ============================================================================
 * suivi-commun.js — le moteur du suivi des dépenses.
 *
 * Partagé entre la page (suivi.html) et les tests : tout ce qui compte de
 * l'argent est ici, rien dans le HTML. Aucune dépendance au DOM.
 *
 * S'appuie sur devis-commun.js (devisNombre, totalLigneDevis, calculerDevis,
 * DEVIS_REGIMES_CHARGES) : le suivi ne réinvente aucune règle de calcul, il
 * rejoue exactement celles du devis sur des montants réels. C'est la seule
 * façon d'être sûr que prévu et réel se comparent.
 *
 * LES QUATRE RÈGLES QUI TIENNENT TOUT, et qu'il ne faut défaire sous aucun
 * prétexte :
 *
 * 1. LE PRÉVISIONNEL EST UNE COPIE. figerSuivi() lit le document une fois et
 *    écrit un arbre autonome. Un budget n'est jamais figé et « Caler sur un
 *    montant cible » réécrit le pourcentage d'imprévus en un clic : une
 *    colonne prévisionnelle vive bougerait sous la colonne réelle, et
 *    personne ne saurait lequel des deux a bougé.
 *
 * 2. LES TAUX VIENNENT DU DOCUMENT, jamais des réglages. Ils sont copiés dans
 *    l'instantané. Le jour où l'on ajuste un taux dans Réglages, les suivis en
 *    cours ne bougent pas — ils décrivent un engagement passé.
 *
 * 3. LES CHARGES PATRONALES NE SE SAISISSENT JAMAIS. Elles se recalculent sur
 *    les bruts réels. Elles pèsent le quart d'un budget de production : les
 *    saisir à la main, c'est se tromper deux fois.
 *
 * 4. TOUT EST EN HT. Le devis calcule une TVA collectée sur une cession, les
 *    factures portent une TVA déductible : deux grandeurs sans rapport. La TVA
 *    se saisit, s'additionne en pied de page et s'exporte — elle n'entre
 *    jamais dans un écart.
 * ========================================================================== */

/* Les postes que calculerDevis() produit et qu'aucune ligne ne porte. Ils
 * deviennent des rangées comme les autres, avec des ids FIXES : tout l'écran
 * est alors uniforme — un nœud, trois colonnes, partout.
 *
 * `cle` désigne le régime dont la rangée porte les charges ; `saisissable`
 * dit si un réel peut s'y rattacher. Les charges ne le sont pas (règle 3), les
 * imprévus non plus : une provision n'a pas de facture, ce qui la consomme est
 * une dépense sans prévisionnel, comptée à part. */
const SUIVI_CALCULES = [
  { id: 'calc-charges-auteur',     cle: 'auteur',     titre: 'Charges patronales — auteur·rice',                saisissable: false },
  { id: 'calc-charges-musicien',   cle: 'musicien',   titre: 'Charges patronales — artistes',                   saisissable: false },
  { id: 'calc-charges-production', cle: 'production', titre: 'Charges patronales — technique et administration', saisissable: false },
  { id: 'calc-fg',                 cle: null,         titre: 'Frais généraux',                                  saisissable: false },
  { id: 'calc-imprevus',           cle: null,         titre: 'Imprévus',                                        saisissable: false },
  { id: 'calc-fp',                 cle: null,         titre: 'Fiches de paie',                                  saisissable: true  },
];

const SUIVI_STATUTS = { paye: 'Payé', engage: 'Engagé' };

// Un identifiant court et imprévisible, comme genId ailleurs dans l'outil.
function suiviId(prefixe){
  if(typeof genId === 'function') return genId(prefixe);
  return prefixe + Math.abs(Date.now()).toString(36) + Math.random().toString(36).slice(2, 12);
}

/* La formule d'une ligne, telle qu'on la relit sous son intitulé : « 3 × 17 ×
 * 280 € ». Les facteurs à 1 disparaissent — « 1 × 1 × 4 500 € » ne dit rien de
 * plus que « 4 500 € » et allonge la rangée. */
function formuleLigne(l){
  const j = devisNombre(l.journees, 1);
  const q = devisNombre(l.qte, 1);
  const p = devisNombre(l.prix, 0);
  const bouts = [];
  if(j !== 1) bouts.push(fmtQteDevis(j));
  if(q !== 1) bouts.push(fmtQteDevis(q));
  bouts.push(fmtEurosDevis(p));
  const formule = bouts.join(' × ');
  return l.unite ? `${formule} · ${l.unite}` : formule;
}

/* FIGER. Copie l'arbre d'un document de devis dans un instantané autonome.
 *
 * LES IDS SONT RENORMALISÉS. Vérifié en base : « grp-0 » existe deux fois dans
 * le même document, dans deux sections différentes — c'est ce que produit un
 * document créé avant que les ids ne soient tirés au hasard. Rattacher une
 * dépense à un id vu deux fois fusionnerait les deux groupes. Tout id déjà
 * rencontré dans CET instantané reçoit donc un identifiant neuf, et l'ancien
 * reste à côté (idSource) pour que le re-figeage sache un jour distinguer
 * « ligne disparue du budget » de « id renommé au premier figeage ».
 *
 * Une ligne optionnelle ou hors devis vaut 0 au prévu : elle n'est pas dans le
 * total du devis, elle ne doit pas l'être ici. Son chiffrage est conservé dans
 * `memo`, rappelé en gris à côté — pour qu'on sache ce qu'on a écarté. */
function figerSuivi(doc, options){
  const opt = options || {};
  const calc = calculerDevis(doc);
  const vus = new Set();
  const neuf = (idSource, prefixe)=>{
    const libre = idSource && !vus.has(idSource) ? idSource : suiviId(prefixe);
    vus.add(libre);
    return libre;
  };

  const arbre = (doc.sections || []).map(sec=>{
    const secId = neuf(sec.id, 'sec');
    const groupes = (sec.groupes || []).map(grp=>{
      const grpId = neuf(grp.id, 'grp');
      const lignes = (grp.lignes || []).map(l=>{
        const nu = totalLigneDevis(l);
        const compte = l.etat === 'incluse';
        return {
          id: neuf(l.id, 'lig'), idSource: l.id || '',
          intitule: l.intitule || '', noms: l.noms || '', infos: l.infos || '',
          formule: formuleLigne(l),
          regime: l.regime || 'aucun', etat: l.etat || 'incluse',
          prevu: compte ? nu : 0,
          memo: compte ? 0 : nu,
        };
      });
      return {
        id: grpId, idSource: grp.id || '', titre: grp.titre || '',
        prevu: lignes.reduce((s, l)=> s + l.prevu, 0),
        lignes,
      };
    });
    return {
      id: secId, idSource: sec.id || '', titre: sec.titre || 'Section sans titre',
      remuneration: !!sec.remuneration, horsFG: !!sec.horsFG,
      prevu: groupes.reduce((s, g)=> s + g.prevu, 0),
      groupes,
    };
  });

  const parCle = {};
  calc.chargesLignes.forEach(c=> { parCle[c.cle] = c; });
  const calcules = SUIVI_CALCULES.map(c=>{
    let prevu = 0;
    if(c.id === 'calc-fg') prevu = calc.fraisGeneraux;
    else if(c.id === 'calc-imprevus') prevu = calc.imprevus;
    else if(c.id === 'calc-fp') prevu = calc.fichesPaie;
    else prevu = (parCle[c.cle] || {}).montant || 0;
    return { id: c.id, cle: c.cle, titre: c.titre, saisissable: c.saisissable, prevu };
  });

  return {
    titre: doc.titre || 'Sans titre',
    sourceTitre: [doc.titre, doc.variante].filter(Boolean).join(' — '),
    sourceType: typeDocDe(doc),
    sourceNumero: doc.numero || '',
    figeLe: opt.aujourdHui || '',
    driveUrl: '',
    // Règle 2 : les taux du DOCUMENT, jamais ceux des réglages.
    taux: Object.assign({ auteur: 4, musicien: 60, production: 67 }, doc.taux || {}),
    tvaDefaut: devisNombre(doc.tvaDefaut, 20),
    fraisGenerauxPct: devisNombre(doc.fraisGenerauxPct, 0),
    imprevusPct: devisNombre(doc.imprevusPct, 0),
    // La remise est une réduction de PRODUIT — ce qu'on consent au client. Elle
    // n'a rien à faire dans un suivi de dépenses. On la garde pour mémoire,
    // hors de tout total, pour que l'écart avec le devis s'explique.
    remiseEcartee: calc.remise,
    // Le détail du devis, pour que la rangée puisse dire « 85 × 28,00 € » et
    // que la saisie propose le même prix unitaire.
    fichesPaie: { nb: devisNombre((doc.fichesPaie || {}).nb, 0), prix: devisNombre((doc.fichesPaie || {}).prix, 0) },
    totalPrevu: arbre.reduce((s, x)=> s + x.prevu, 0) + calcules.reduce((s, c)=> s + c.prevu, 0),
    optionsNonLevees: { nb: calc.options.length, montant: calc.optionsTotal },
    arbre, calcules,
    soldes: [],
    chargesReelles: {},
    closLe: null,
  };
}

/* L'arbre à plat, dans l'ordre d'affichage. Une rangée par nœud, avec son
 * niveau — c'est tout ce dont la page a besoin pour dessiner le tableau. */
function noeudsPlats(data){
  const out = [];
  (data.arbre || []).forEach(sec=>{
    out.push({ niveau: 'section', id: sec.id, titre: sec.titre, prevu: sec.prevu,
               remuneration: sec.remuneration, horsFG: sec.horsFG, sectionId: sec.id });
    (sec.groupes || []).forEach(grp=>{
      out.push({ niveau: 'groupe', id: grp.id, titre: grp.titre || 'Autres lignes',
                 prevu: grp.prevu, sectionId: sec.id, groupeId: grp.id,
                 nbLignes: (grp.lignes || []).length });
      (grp.lignes || []).forEach(l=>{
        out.push({ niveau: 'ligne', id: l.id, titre: l.intitule || 'Sans intitulé',
                   prevu: l.prevu, memo: l.memo, formule: l.formule, noms: l.noms,
                   regime: l.regime, etat: l.etat, sectionId: sec.id, groupeId: grp.id });
      });
    });
  });
  (data.calcules || []).forEach(c=>{
    out.push({ niveau: 'calcule', id: c.id, titre: c.titre, prevu: c.prevu,
               cle: c.cle, saisissable: c.saisissable, calcule: true });
  });
  return out;
}

// Index : pour chaque id de nœud, sa section, son groupe, sa ligne.
function indexerNoeuds(data){
  const idx = new Map();
  (data.arbre || []).forEach(sec=>{
    idx.set(sec.id, { niveau: 'section', section: sec });
    (sec.groupes || []).forEach(grp=>{
      idx.set(grp.id, { niveau: 'groupe', section: sec, groupe: grp });
      (grp.lignes || []).forEach(l=> idx.set(l.id, { niveau: 'ligne', section: sec, groupe: grp, ligne: l }));
    });
  });
  (data.calcules || []).forEach(c=> idx.set(c.id, { niveau: 'calcule', calcule: c }));
  return idx;
}

/* Le régime effectif d'une dépense.
 *
 * Rattachée à une LIGNE, elle hérite du régime de cette ligne : c'est la ligne
 * qui sait si l'argent est un cachet ou une facture de prestataire, et un sac
 * de lignes n'en sait rien. Vérifié dans les devis réels : le groupe « Equipe
 * de production » mêle 'production' (chargé à 67 %) et 'facture' (non chargé).
 * Déduire le régime d'un groupe inventerait des charges.
 *
 * Rattachée plus haut, ou pas rattachée du tout, elle porte le sien — vide par
 * défaut, donc sans charges. */
function regimeEffectif(dep, cible){
  if(dep.regime) return dep.regime;
  if(cible && cible.niveau === 'ligne') return cible.ligne.regime || 'aucun';
  return 'aucun';
}

function montantHt(dep){ return devisNombre(dep.montantHt, 0); }

/* AGRÉGER. Le cœur : pour un instantané et une liste de dépenses, tout ce que
 * la page affiche. Rien ici ne modifie quoi que ce soit.
 *
 * Les dépenses « engagé » comptent dans le réel : un contrat signé est de
 * l'argent qui sortira. On les distingue pour pouvoir l'écrire (« dont 1 200 €
 * engagé ») mais on ne les met pas de côté — une colonne qui ignore l'engagé
 * annonce un projet moins cher qu'il ne sera. */
function agregerSuivi(data, depenses){
  const idx = indexerNoeuds(data);
  const liste = (depenses || []).filter(d=> (d.sens || 'depense') === 'depense');

  const vide = ()=> ({ reel: 0, engage: 0, nb: 0, nbJustif: 0, tva: 0 });
  const propre = new Map();   // ce qui est rattaché DIRECTEMENT à ce nœud
  const orphelines = { reel: 0, engage: 0, nb: 0, tva: 0, lignes: [] };
  const assiettes = { auteur: 0, musicien: 0, production: 0 };
  const horsAssiette = [];    // de l'argent chargeable posé hors rémunération
  let tvaTotale = 0;

  liste.forEach(dep=>{
    const cible = dep.noeudId ? idx.get(dep.noeudId) : null;
    const m = montantHt(dep);
    const t = devisNombre(dep.montantTva, 0);
    tvaTotale += t;

    if(!cible){
      orphelines.reel += m;
      orphelines.tva += t;
      orphelines.nb += 1;
      if(dep.statut === 'engage') orphelines.engage += m;
      orphelines.lignes.push(dep);
    } else {
      const p = propre.get(dep.noeudId) || vide();
      p.reel += m; p.tva += t; p.nb += 1;
      if(dep.statut === 'engage') p.engage += m;
      if(dep.justificatifUrl) p.nbJustif += 1;
      propre.set(dep.noeudId, p);
    }

    // L'assiette réelle suit EXACTEMENT la règle du devis : régime chargeable,
    // section cochée « rémunération », ligne incluse. Ce qui sort de cette
    // règle n'est pas rattrapé en douce — il est signalé, comme le fait déjà
    // lignesSansChargesAttendues() côté devis. Recocher la section ou changer
    // le régime sont deux décisions différentes, et c'est à la production de
    // trancher.
    const reg = regimeEffectif(dep, cible);
    if(DEVIS_REGIMES_CHARGES.indexOf(reg) >= 0 && m > 0){
      const dansRemuneration = cible && cible.section && cible.section.remuneration
        && (cible.niveau !== 'ligne' || cible.ligne.etat === 'incluse');
      if(dansRemuneration) assiettes[reg] += m;
      else horsAssiette.push({ depense: dep, regime: reg, montant: m });
    }
  });

  // Cumul vers le haut : une ligne remonte dans son groupe, un groupe dans sa
  // section. Les dépenses posées directement sur un groupe ou une section
  // s'ajoutent à leur niveau — c'est tout l'intérêt de pouvoir viser haut.
  const cumul = new Map();
  const ajouter = (id, src)=>{
    const c = cumul.get(id) || vide();
    c.reel += src.reel; c.engage += src.engage; c.nb += src.nb;
    c.nbJustif += src.nbJustif || 0; c.tva += src.tva || 0;
    cumul.set(id, c);
  };
  (data.arbre || []).forEach(sec=>{
    (sec.groupes || []).forEach(grp=>{
      (grp.lignes || []).forEach(l=>{
        const p = propre.get(l.id) || vide();
        cumul.set(l.id, Object.assign(vide(), p));
        ajouter(grp.id, p);
      });
      ajouter(grp.id, propre.get(grp.id) || vide());
      ajouter(sec.id, cumul.get(grp.id) || vide());
    });
    ajouter(sec.id, propre.get(sec.id) || vide());
  });

  // RÈGLE 3 : les charges se recalculent, avec les taux du document. Deux
  // échappatoires, parce que la réalité finit toujours par différer d'un taux
  // moyen : un taux constaté en DSN, ou un montant de bordereau qui l'emporte.
  const surcharge = data.chargesReelles || {};
  const chargesLignes = ['auteur', 'musicien', 'production'].map(cle=>{
    const tauxDoc = devisNombre((data.taux || {})[cle], 0);
    const sur = surcharge[cle] || {};
    const taux = sur.taux != null && sur.taux !== '' ? devisNombre(sur.taux, tauxDoc) : tauxDoc;
    const calcule = assiettes[cle] * taux / 100;
    const impose = sur.montant != null && sur.montant !== '';
    return {
      cle, taux, tauxDoc, assiette: assiettes[cle],
      montant: impose ? devisNombre(sur.montant, calcule) : calcule,
      source: impose ? 'bordereau' : (sur.taux != null && sur.taux !== '' ? 'taux constaté' : 'taux du devis'),
    };
  });
  chargesLignes.forEach(c=>{
    const p = cumul.get('calc-charges-' + c.cle) || vide();
    p.reel = c.montant;
    cumul.set('calc-charges-' + c.cle, p);
  });

  // Les fiches de paie se saisissent (c'est une facture de prestataire) ; les
  // frais généraux et les imprévus n'ont pas de réel, par construction.
  const fp = propre.get('calc-fp') || vide();
  cumul.set('calc-fp', Object.assign(vide(), fp));

  const prevuArbre = (data.arbre || []).reduce((s, x)=> s + x.prevu, 0);
  const reelArbre = (data.arbre || []).reduce((s, x)=> s + (cumul.get(x.id) || vide()).reel, 0);
  const chargesPrevues = (data.calcules || []).filter(c=> String(c.id).indexOf('calc-charges-') === 0)
    .reduce((s, c)=> s + c.prevu, 0);
  const chargesReellesTotal = chargesLignes.reduce((s, c)=> s + c.montant, 0);
  const fpPrevu = ((data.calcules || []).find(c=> c.id === 'calc-fp') || {}).prevu || 0;
  const fgPrevu = ((data.calcules || []).find(c=> c.id === 'calc-fg') || {}).prevu || 0;
  const imprevusPrevu = ((data.calcules || []).find(c=> c.id === 'calc-imprevus') || {}).prevu || 0;

  /* LE TOTAL D'ÉCART EXCLUT LES FRAIS GÉNÉRAUX ET LES IMPRÉVUS.
     Les frais généraux n'ont pas de facture : c'est une quote-part de
     structure, donc une marge. Les imprévus n'ont pas de réel par
     construction. Sur un budget réel, les deux pèsent 11 % du total : laissés
     dedans, ils afficheraient 11 % d'économie du premier au dernier jour du
     projet, et l'écart ne voudrait plus rien dire. Ils restent affichés, à
     part, avec la mention. */
  const totalPrevu = prevuArbre + chargesPrevues + fpPrevu;
  const totalReel = reelArbre + chargesReellesTotal + fp.reel + orphelines.reel;

  /* L'ATTERRISSAGE — où l'on finira si rien d'autre ne bouge.
     Pour chaque poste, le plus élevé du prévu et du dépensé : un poste entamé
     à 30 % n'annonce pas 30 % de son budget, il annonce son budget ; un poste
     déjà dépassé annonce son dépassement. C'est une addition de faits, aucune
     extrapolation.

     SOLDÉ défait cette règle pour un nœud : il n'annonce plus que son réel.
     C'est ce qui rend lisible un poste internalisé — le directeur technique
     facturé 3 000 € au client et assuré en interne coûte 0 €, et l'écart de
     −3 000 € est une marge, pas une dépense en retard. Sans « soldé », le
     poste continuerait d'annoncer ses 3 000 € jusqu'à la clôture.

     LA GRANULARITÉ SUIT CELLE DE LA SAISIE. Une ligne renseignée compte pour
     elle-même ; mais dès qu'une dépense est rattachée AU GROUPE (une facture
     qui couvre plusieurs lignes d'un coup), on ne peut plus additionner ligne
     à ligne sans compter deux fois — on retombe alors au niveau du groupe. */
  const soldes = new Set(data.soldes || []);
  let aterArbre = 0;
  const assiettesAter = { auteur: 0, musicien: 0, production: 0 };
  const atterrirNoeud = (prevu, id)=>{
    const c = cumul.get(id) || vide();
    return soldes.has(id) ? c.reel : Math.max(prevu, c.reel);
  };
  (data.arbre || []).forEach(sec=>{
    if(soldes.has(sec.id)){
      aterArbre += (cumul.get(sec.id) || vide()).reel;
      if(sec.remuneration){
        (sec.groupes || []).forEach(grp=> (grp.lignes || []).forEach(l=>{
          if(l.etat !== 'incluse' || DEVIS_REGIMES_CHARGES.indexOf(l.regime) < 0) return;
          assiettesAter[l.regime] += (cumul.get(l.id) || vide()).reel;
        }));
      }
      return;
    }
    (sec.groupes || []).forEach(grp=>{
      const propreGrp = (propre.get(grp.id) || vide()).reel;
      // Une facture posée sur le groupe couvre ses lignes : on ne descend plus.
      const auGroupe = soldes.has(grp.id) || propreGrp !== 0;
      if(auGroupe){
        aterArbre += atterrirNoeud(grp.prevu, grp.id);
      } else {
        aterArbre += (grp.lignes || []).reduce((t, l)=> t + atterrirNoeud(l.prevu, l.id), 0);
      }
      // L'assiette d'atterrissage suit la même logique, sinon les charges
      // d'atterrissage seraient calculées sur un réel encore incomplet.
      if(sec.remuneration){
        (grp.lignes || []).forEach(l=>{
          if(l.etat !== 'incluse') return;
          if(DEVIS_REGIMES_CHARGES.indexOf(l.regime) < 0) return;
          const cl = cumul.get(l.id) || vide();
          assiettesAter[l.regime] += (soldes.has(grp.id) || soldes.has(l.id))
            ? cl.reel : Math.max(l.prevu, cl.reel);
        });
      }
    });
    // Une dépense posée sur la section elle-même n'appartient à aucun groupe.
    aterArbre += (propre.get(sec.id) || vide()).reel;
  });
  const chargesAter = chargesLignes.reduce((s, c)=>
    s + Math.max(c.montant, assiettesAter[c.cle] * c.taux / 100), 0);
  // Ce qui consomme la provision d'imprévus, c'est précisément ce qui n'était
  // pas prévu. Ce qui en reste est encore à dépenser.
  const provisionRestante = Math.max(0, imprevusPrevu - orphelines.reel);
  const atterrissage = aterArbre + chargesAter + Math.max(fpPrevu, fp.reel)
    + orphelines.reel + provisionRestante + fgPrevu;

  return {
    cumul, propre, orphelines, assiettes, chargesLignes, horsAssiette,
    prevuArbre, reelArbre, chargesPrevues, chargesReellesTotal,
    fgPrevu, imprevusPrevu, fpPrevu, fpReel: fp.reel,
    provisionRestante,
    totalPrevu, totalReel, ecart: totalReel - totalPrevu,
    atterrissage, tvaTotale,
    nbDepenses: liste.length,
  };
}

/* La garde « brut ou coût chargé ? ».
 *
 * L'erreur la plus chère possible dans cet outil : recopier le coût chargé du
 * journal de paie dans un champ qui attend un brut. Le réel est faux d'un
 * coup, ET les charges recalculées le sont dans le même sens — sur un budget
 * réel, plus de 60 000 € de faux sans le moindre signal, puisque la ligne de
 * charges est justement celle qu'on ne peut pas relire.
 *
 * Le test est volontairement étroit : on ne s'inquiète que si le montant saisi
 * tombe à 3 % près sur « le prévu, majoré du taux du régime ». Un vrai
 * dépassement de 60 % passe sans question une fois sur mille ; le coût chargé
 * recopié, lui, tombe pile. Rend null quand il n'y a rien à dire. */
function alerteBrutCharge(montant, prevu, regime, taux){
  if(!prevu || prevu <= 0) return null;
  if(DEVIS_REGIMES_CHARGES.indexOf(regime) < 0) return null;
  const t = devisNombre((taux || {})[regime], 0);
  if(t <= 0) return null;
  const attendu = prevu * (1 + t / 100);
  if(montant < attendu * 0.97 || montant > attendu * 1.03) return null;
  return `${fmtEurosDevis(montant)}, c'est exactement le prévu majoré de ${fmtQteDevis(t)} % de charges. `
       + `Ce champ attend le BRUT employeur — les charges sont recalculées toutes seules. `
       + `Si tu recopies un coût chargé, il sera compté deux fois.`;
}

/* Le nom de fichier à donner au justificatif sur le Drive.
 *
 * Un dossier sans convention devient illisible à cent fichiers, et une
 * convention qu'il faut retenir n'est pas tenue. On la met donc dans le
 * presse-papier : le nommage devient un clic.
 * Les caractères interdits par les systèmes de fichiers sautent ; le reste est
 * laissé tel quel, accents et espaces compris — un nom de fichier se lit. */
function nomFichierJustificatif(dep){
  const propre = s=> String(s || '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  const bouts = [
    dep.dateDepense || '',
    propre(dep.fournisseur) || propre(dep.libelle) || 'sans nom',
    fmtEurosDevis(montantHt(dep) + devisNombre(dep.montantTva, 0)),
  ].filter(Boolean);
  return bouts.join(' — ') + '.pdf';
}

// Une dépense neuve, rattachée à un nœud.
function nouvelleDepense(suiviId_, noeudId, aujourdHui){
  return {
    id: suiviId('dep'), suiviId: suiviId_, noeudId: noeudId || '',
    sens: 'depense', libelle: '', fournisseur: '',
    dateDepense: aujourdHui || '', montantHt: 0, montantTva: 0,
    // Facultatifs, et c'est le point : certaines dépenses se comptent
    // (330 repas × 20 €, 85 fiches × 28 €), d'autres arrivent en une facture
    // globale. Les deux doivent se saisir sans détour.
    quantite: null, prixUnitaire: null,
    regime: '', statut: 'paye', justificatifUrl: '', note: '',
  };
}

if(typeof window !== 'undefined'){
  window.SUIVI_CALCULES = SUIVI_CALCULES;
  window.SUIVI_STATUTS = SUIVI_STATUTS;
  window.figerSuivi = figerSuivi;
  window.noeudsPlats = noeudsPlats;
  window.indexerNoeuds = indexerNoeuds;
  window.agregerSuivi = agregerSuivi;
  window.regimeEffectif = regimeEffectif;
  window.alerteBrutCharge = alerteBrutCharge;
  window.nomFichierJustificatif = nomFichierJustificatif;
  window.nouvelleDepense = nouvelleDepense;
  window.formuleLigne = formuleLigne;
}
