/* ============================================================================
 * devis-commun.js — le modèle et le moteur de calcul de l'espace Devis.
 *
 * Partagé entre la liste (devis.html), l'éditeur (devis-editeur.html) et le
 * PDF (pdf-devis.js) : les totaux affichés à l'écran et imprimés au client
 * sortent du MÊME calcul, ils ne peuvent pas diverger.
 *
 * ATTENTION à deux champs de noms proches et de sens opposés :
 *   - projetId groupe les VARIANTES d'un même chiffrage entre elles (le budget
 *     interne, le devis client qui en sort, la variante « avec clip »). C'est
 *     lui qui fait une carte dans devis.html. Il ne désigne rien d'autre.
 *   - tourneeId rattache le chiffrage à une TOURNÉE ou un RECORDING de la table
 *     tournees. Vide tant qu'on n'a rien rattaché. C'est par lui que le devis
 *     connaît le nombre de dates, l'effectif attendu et le cachet standard.
 *
 * Le document devis (stocké tel quel en jsonb) :
 *   { id, projetId, tourneeId, variante, retenue, numero, statut, fige,
 *     titre, clientId, date, validiteJours, conditionsReglement, acomptePct,
 *     intervention, rendus:[{titre, texte}], horsDevisTexte, memo,
 *     taux:{auteur, musicien, production}, fraisGenerauxPct, imprevusPct,
 *     fichesPaie:{nb, prix}, tvaDefaut, remise:{libelle, montant},
 *     sections:[{ id, titre, remuneration, tva|null, groupes:[
 *       { id, titre, lignes:[{ id, intitule, infos, noms, journees, qte,
 *         unite, prix, regime, etat, discuter, tva|null }] } ] }] }
 *
 * Une ligne :
 *   - total = journées × qté × prix (chaque facteur vaut 1 s'il est vide) —
 *     le double multiplicateur vient du devis réel « 5 journées × 17
 *     musiciens × 280 € » ;
 *   - regime ('auteur'|'musicien'|'production'|'facture'|'aucun') décide des
 *     charges patronales. 'facture' = prestataire qui facture : pas de
 *     charges, comme la ligne « Forfait fact. » du tableur historique ;
 *   - etat ('incluse'|'optionnelle'|'hors_devis') : une optionnelle est
 *     chiffrée mais hors totaux, une hors-devis s'affiche à 0 € ;
 *   - discuter : surlignée (le jaune du tableur), sans effet sur les calculs.
 * ========================================================================== */

/* Les régimes de charges — [clé, libellé, libellé court, qui c'est].
 *
 * Le court sert aux jetons de la feuille, où la place est comptée ; le libellé
 * et l'explication servent partout où l'on décide.
 *
 * LA LIGNE DE PARTAGE, qui n'est pas une convention interne mais la loi : le
 * cachet est RÉSERVÉ AUX ARTISTES-INTERPRÈTES. Un·e technicien·ne ne peut pas
 * être payé·e au cachet, quelle que soit sa mission. C'est ce qui sépare
 * « Cachet » de « Production », et non le montant ou la durée.
 *   - artistes  → annexe X de l'assurance chômage, rémunération au cachet ;
 *   - technicien·nes → annexe VIII, rémunération à l'heure ou à la journée ;
 *   - administratif·ves permanent·es → régime général.
 *
 * Pourquoi le taux artiste (60 %) est INFÉRIEUR au taux production (67 %)
 * alors que l'intermittence coûte plus cher : une partie des cotisations de
 * Sécurité sociale des artistes se calcule sur 70 % du brut seulement, après
 * un abattement de 30 % pour frais professionnels. En sens inverse, la
 * réduction générale de cotisations patronales ne s'applique PAS aux artistes,
 * alors qu'elle joue pour les autres. Les deux effets se compensent en partie ;
 * les taux d'ici restent des moyennes de maison, à ajuster dans Réglages.
 *
 * RÉSERVE ASSUMÉE : « Production » couvre deux populations aux règles
 * différentes — technicien·nes intermittent·es (annexe VIII, chômage à 11,40 %)
 * et permanent·es administratif·ves (régime général, chômage à 4 %). Un taux
 * unique est donc une approximation. Elle tient tant que le mélange reste
 * stable d'un devis à l'autre ; si l'écart devient sensible, il faudra scinder
 * le régime en deux plutôt que moyenner.
 */
const DEVIS_REGIMES = [
  // « Prod. » disait « production » — mot qui, dans une maison de production,
  // désigne aussi bien le projet entier que l'équipe ou le budget. Le jeton
  // nomme donc les deux populations qu'il couvre, sans ambiguïté possible avec
  // les artistes.
  ['production', 'Technicien·ne ou administratif·ve', 'Tech./adm.',
   "Toute personne salariée qui n'est PAS artiste : ingé son, régie, lumière, plateau, "
   + "direction technique, administration, chargé·e de production. Payée à l'heure ou à "
   + "la journée — jamais au cachet."],
  ['musicien', 'Artiste au cachet', 'Cachet',
   "Les artistes-interprètes, et eux seuls : musicien·nes, chef·fe d'orchestre, "
   + "choristes, solistes. Le cachet leur est réservé par la loi."],
  ['auteur', 'Auteur·rice', 'Auteur',
   "L'écriture, pas l'exécution : commande d'arrangement, d'orchestration, de "
   + "composition. Régime et taux distincts des deux précédents."],
  ['facture', 'Prestataire facturé', 'Facturé',
   "Qui vous envoie une facture : société, indépendant·e, auto-entrepreneur·se. "
   + "Vous n'êtes pas l'employeur, aucune charge patronale n'est due."],
  ['aucun', 'Sans charges', '—',
   "Tout ce qui n'est pas de la rémunération : studio, matériel, transport, repas, "
   + "hébergement, droits, achats."],
];

// L'explication d'un régime, pour les infobulles et les légendes.
function expliquerRegimeDevis(cle){
  const r = DEVIS_REGIMES.find(x=> x[0] === cle);
  return r ? (r[3] || r[1]) : '';
}

function typeDocDe(d){
  if(d && d.typeDoc) return d.typeDoc;
  if(d && (d.fige || d.numero || (d.statut && d.statut !== 'brouillon'))) return 'devis';
  return 'budget';
}

const DEVIS_STATUTS = {
  brouillon: 'Brouillon',
  envoye:    'Envoyé',
  accepte:   'Accepté',
  refuse:    'Refusé',
};

// projetId groupe les variantes (voir l'en-tête) ; tourneeId rattache à une
// tournée ou un recording ; typeProjet ne sert qu'à choisir le gabarit de
// sections — un disque ne se découpe pas comme une tournée.
function nouveauDevis(reglages, projetId, tourneeId, typeProjet){
  const r = reglages || {};
  return {
    id: genId('devis'),
    projetId: projetId || genId('projet'),
    tourneeId: tourneeId || '',
    typeDoc: 'budget', budgetId: '',
    variante: '', retenue: false,
    numero: '', statut: 'brouillon', fige: false,
    titre: '', clientId: '', date: '',
    validiteJours: r.validiteJours != null ? r.validiteJours : 30,
    conditionsReglement: r.conditionsReglement || '',
    acomptePct: 30,
    intervention: '', rendus: [], horsDevisTexte: '', memo: '',
    taux: {
      auteur: r.tauxAuteur != null ? r.tauxAuteur : 4,
      musicien: r.tauxMusicien != null ? r.tauxMusicien : 60,
      production: r.tauxProduction != null ? r.tauxProduction : 67,
    },
    fraisGenerauxPct: 10, imprevusPct: 7,
    fichesPaie: { nb: 0, prix: 28 },
    tvaDefaut: r.tvaDefaut != null ? r.tvaDefaut : 20,
    remise: { libelle: 'Remise commerciale', montant: 0 },
    sections: gabaritSectionsDevis(typeProjet),
  };
}

// Un devis de tournée se découpe en rémunération puis VHR et matériel ; un
// devis de recording en rémunération, studio et post-production. Même moteur,
// charpente différente : on part du bon squelette plutôt que de renommer des
// sections à la main à chaque disque.
function gabaritSectionsDevis(typeProjet){
  const titres = typeProjet === 'recording'
    ? [['Rémunération équipe (brut hors charges)', true], ['Studio et technique', false], ['Post-production', false]]
    : [['Rémunération équipe (brut hors charges)', true], ['VHR et matériel', false]];
  return titres.map(([titre, remuneration])=> ({
    id: genId('sec'), titre, remuneration, tva: null, horsFG: false,
    groupes: [{ id: genId('grp'), titre: '', lignes: [] }],
  }));
}

/* Ce qu'une tournée (ou un recording) sait déjà, et que le devis retapait.
 *
 * Le devis réel dit « 5 journées × 17 musiciens × 280 € ». Ces trois nombres
 * existent déjà côté projet : le nombre de dates validées, le total de la
 * nomenclature, et le cachet standard. On les lit ici une fois, pour que
 * l'éditeur puisse les reporter et signaler quand ils ont divergé.
 *
 * Les dates ANNULÉES ne comptent pas — un devis ne se chiffre pas dessus. Les
 * options non plus dans « validees », mais on rend les deux : au stade du
 * budget, on chiffre volontiers l'ensemble des dates envisagées.
 */
function chiffresDuProjet(tournee){
  if(!tournee) return null;
  const dates = (tournee.dates || []).filter(d=> d.statut !== 'annulee');
  const validees = dates.filter(d=> d.statut === 'validee');
  const effectif = (tournee.nomenclature || []).reduce((n, r)=> n + (devisNombre(r.nombre, 0)), 0);
  return {
    id: tournee.id,
    nom: tournee.nom || '',
    estRecording: tournee.type === 'recording',
    dates: dates.length,
    datesValidees: validees.length,
    effectif,
    cachet: tournee.cachetStatut === 'defini' && tournee.cachetMontant != null
      ? devisNombre(tournee.cachetMontant, 0) : null,
  };
}

// Les lignes qui décrivent la présence de l'équipe : ce sont elles qui portent
// le nombre de journées, l'effectif et le cachet, et donc elles seules que le
// report du projet et l'alerte de divergence regardent.
function lignesCachetDevis(d){
  const trouvees = [];
  (d.sections || []).forEach(sec=>{
    if(!sec.remuneration) return;
    (sec.groupes || []).forEach(grp=> (grp.lignes || []).forEach(l=>{
      if(l.regime === 'musicien' && l.etat !== 'hors_devis') trouvees.push(l);
    }));
  });
  return trouvees;
}

/* De l'argent qui devrait porter des charges et n'en porte pas.
 *
 * Le moteur ne compte les charges patronales que sur les lignes d'une section
 * cochée « rémunération » (voir calculerDevis). C'est le bon garde-fou — mais
 * il est silencieux : le sélecteur de régime n'est même pas affiché hors des
 * sections de rémunération. Une ligne qui porte « musicien » et qui atterrit,
 * par déplacement ou par décochage de sa section, dans une section ordinaire
 * cesse d'engendrer ses charges sans que rien ne le dise. Sur un devis à
 * 200 000 €, cela peut faire disparaître des dizaines de milliers d'euros.
 *
 * Cette fonction rend la liste de ces lignes-là, pour que l'éditeur puisse le
 * signaler. Elle ne corrige rien : recocher la section ou changer le régime
 * sont deux décisions différentes, et c'est à la production de trancher.
 *
 * Le régime « facture » (prestataire qui facture) et « aucun » ne sont PAS
 * concernés : ils ne doivent effectivement engendrer aucune charge, où qu'ils
 * se trouvent.
 */
const DEVIS_REGIMES_CHARGES = ['auteur', 'musicien', 'production'];

function lignesSansChargesAttendues(d){
  const trouvees = [];
  (d.sections || []).forEach(sec=>{
    if(sec.remuneration) return;
    (sec.groupes || []).forEach(grp=> (grp.lignes || []).forEach(l=>{
      if(l.etat !== 'incluse') return;
      if(!DEVIS_REGIMES_CHARGES.includes(l.regime)) return;
      if(totalLigneDevis(l) <= 0) return;
      trouvees.push({ ligne: l, section: sec, total: totalLigneDevis(l) });
    }));
  });
  return trouvees;
}

/* Ce que le devis dit, comparé à ce que le projet dit.
 * Rend la liste des écarts en clair, vide quand tout concorde. Purement
 * indicatif : les deux peuvent légitimement diverger (on chiffre parfois une
 * date en plus « au cas où »), on signale, on ne corrige jamais tout seul.
 */
function ecartsDevisProjet(d, chiffres){
  if(!chiffres) return [];
  const lignes = lignesCachetDevis(d);
  if(!lignes.length) return [];
  const ecarts = [];

  const journees = [...new Set(lignes.map(l=> devisNombre(l.journees, 1)))];
  const attendu = chiffres.datesValidees || chiffres.dates;
  if(attendu && journees.length === 1 && journees[0] !== attendu){
    ecarts.push(`${fmtQteDevis(journees[0])} journée${journees[0] > 1 ? 's' : ''} chiffrée${journees[0] > 1 ? 's' : ''} pour ${attendu} date${attendu > 1 ? 's' : ''} au planning`);
  }

  const effectifs = [...new Set(lignes.map(l=> devisNombre(l.qte, 1)))];
  if(chiffres.effectif && effectifs.length === 1 && effectifs[0] !== chiffres.effectif){
    ecarts.push(`${fmtQteDevis(effectifs[0])} personne${effectifs[0] > 1 ? 's' : ''} chiffrée${effectifs[0] > 1 ? 's' : ''} pour ${chiffres.effectif} attendue${chiffres.effectif > 1 ? 's' : ''} à la nomenclature`);
  }

  const prix = [...new Set(lignes.map(l=> devisNombre(l.prix, 0)))];
  if(chiffres.cachet != null && prix.length === 1 && prix[0] !== chiffres.cachet){
    ecarts.push(`${fmtEurosDevis(prix[0])} par cachet ici, ${fmtEurosDevis(chiffres.cachet)} sur le projet`);
  }

  return ecarts;
}

function nouvelleLigneDevis(remuneration){
  return {
    id: genId('lig'), intitule: '', infos: '', noms: '',
    journees: '', qte: 1, unite: '', prix: 0,
    regime: remuneration ? 'production' : 'aucun',
    etat: 'incluse', discuter: false, tva: null,
  };
}

// Un nombre saisi (vide, virgule française, texte) → nombre exploitable.
function devisNombre(v, defaut){
  if(v === '' || v == null) return defaut != null ? defaut : 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? (defaut != null ? defaut : 0) : n;
}

function totalLigneDevis(l){
  if(l.etat === 'hors_devis') return 0;
  return devisNombre(l.journees, 1) * devisNombre(l.qte, 1) * devisNombre(l.prix, 0);
}

/* Le calcul complet. Rend tout ce que l'écran et le PDF affichent :
 * sous-totaux par section, charges par régime, coûts comptables, remise,
 * ventilation de TVA par taux, options à part. */
function calculerDevis(devis){
  const d = devis || {};
  const taux = d.taux || {};
  const tvaDefaut = devisNombre(d.tvaDefaut, 20);

  const sections = [];
  const options = [];
  // Assiettes de charges par régime, et la TVA à laquelle chaque assiette se
  // rattache (celle de la section d'où viennent les lignes).
  // Les cinq régimes, y compris les deux qui n'engendrent rien : on veut
  // pouvoir MONTRER que leur argent est bien compté quelque part et qu'il ne
  // produit aucune charge par décision, non par oubli. Seules les trois
  // premières clés sont reprises dans chargesLignes.
  const assiettes = { auteur: 0, musicien: 0, production: 0, facture: 0, aucun: 0 };
  // Assiette des seules sections SORTIES de la base des frais généraux : leurs
  // charges patronales doivent en sortir aussi, sinon on facturerait des frais
  // généraux sur les charges d'un poste qu'on a justement voulu exclure.
  const assiettesHorsFG = { auteur: 0, musicien: 0, production: 0, facture: 0, aucun: 0 };
  let totalSectionsDansFG = 0;

  (d.sections || []).forEach(sec=>{
    const tvaSection = sec.tva != null && sec.tva !== '' ? devisNombre(sec.tva, tvaDefaut) : tvaDefaut;
    let sousTotal = 0;
    const groupes = (sec.groupes || []).map(grp=>{
      const lignes = (grp.lignes || []).map(l=>{
        const total = totalLigneDevis(l);
        const tvaLigne = l.tva != null && l.tva !== '' ? devisNombre(l.tva, tvaSection) : tvaSection;
        if(l.etat === 'optionnelle'){
          options.push({ ligne: l, section: sec, total, tva: tvaLigne });
          return { ligne: l, total, tva: tvaLigne };
        }
        sousTotal += total;
        if(sec.remuneration && l.etat === 'incluse' && assiettes[l.regime] != null){
          assiettes[l.regime] += total;
          if(sec.horsFG) assiettesHorsFG[l.regime] += total;
        }
        return { ligne: l, total, tva: tvaLigne };
      });
      return { groupe: grp, lignes };
    });
    if(!sec.horsFG) totalSectionsDansFG += sousTotal;
    sections.push({ section: sec, groupes, sousTotal, tva: tvaSection });
  });

  const chargesLignes = [
    { cle: 'auteur',     libelle: 'Charges sociales patronales auteur',     taux: devisNombre(taux.auteur, 4) },
    { cle: 'musicien',   libelle: 'Charges sociales patronales musiciens',  taux: devisNombre(taux.musicien, 60) },
    { cle: 'production', libelle: 'Charges sociales patronales production', taux: devisNombre(taux.production, 67) },
  ].map(c=> ({ ...c, assiette: assiettes[c.cle], montant: assiettes[c.cle] * c.taux / 100 }));
  const chargesTotal = chargesLignes.reduce((s, c)=> s + c.montant, 0);

  const totalSections = sections.reduce((s, x)=> s + x.sousTotal, 0);
  // La base des frais généraux et des imprévus : par défaut tout ce qui précède
  // — les sections ET les charges (la formule du tableur historique). Les
  // sections cochées « hors base » en sortent, elles et leurs charges : c'est
  // ce qu'exigent certains financeurs (voir l'arrêté du 7 février 2011, qui
  // plafonne les frais généraux à 7 % d'une assiette définie).
  const chargesHorsFG = chargesLignes.reduce(
    (s, c)=> s + assiettesHorsFG[c.cle] * c.taux / 100, 0);
  const baseFG = totalSectionsDansFG + (chargesTotal - chargesHorsFG);
  const sectionsHorsFG = sections.filter(x=> x.section.horsFG).map(x=> x.section.titre || 'section sans titre');
  const fraisGeneraux = baseFG * devisNombre(d.fraisGenerauxPct, 0) / 100;
  const imprevus = baseFG * devisNombre(d.imprevusPct, 0) / 100;
  const fp = d.fichesPaie || {};
  const fichesPaie = devisNombre(fp.nb, 0) * devisNombre(fp.prix, 0);
  const coutsComptables = fraisGeneraux + imprevus + fichesPaie;

  const remise = devisNombre((d.remise || {}).montant, 0);
  const totalHT = totalSections + chargesTotal + coutsComptables - remise;

  // Ventilation de TVA : les lignes portent leur taux ; les charges, frais
  // généraux, imprévus, fiches de paie et la remise suivent le taux par défaut
  // du devis (à faire préciser par la compta si un projet mélange les taux de
  // façon plus fine — les montants, eux, restent justes par construction).
  const parTaux = new Map();
  const poser = (tauxTva, montant)=>{
    if(!montant) return;
    const t = Math.round(devisNombre(tauxTva, 0) * 100) / 100;
    parTaux.set(t, (parTaux.get(t) || 0) + montant);
  };
  sections.forEach(s=> s.groupes.forEach(g=> g.lignes.forEach(x=>{
    if(x.ligne.etat === 'incluse') poser(x.tva, x.total);
  })));
  poser(tvaDefaut, chargesTotal + coutsComptables - remise);
  const ventilationTva = [...parTaux.entries()]
    .sort((a, b)=> a[0] - b[0])
    .map(([t, base])=> ({ taux: t, base, montant: base * t / 100 }));
  const totalTVA = ventilationTva.reduce((s, v)=> s + v.montant, 0);

  return {
    sections, chargesLignes, chargesTotal, assiettes, sectionsHorsFG,
    totalSections, baseFG, fraisGeneraux, imprevus, fichesPaie, coutsComptables,
    remise, totalHT, ventilationTva, totalTVA, totalTTC: totalHT + totalTVA,
    options, optionsTotal: options.reduce((s, o)=> s + o.total, 0),
  };
}

/* « Caler sur un montant cible » : le total HT est affine dans le pourcentage
 * d'imprévus — total(p) = total(0) + base × p/100 — donc le p exact se déduit
 * sans tâtonner. C'est le geste que le tableur faisait à la main (imprévus à
 * 6,94356 % pour tomber pile sur 35 000,00 €). Rend null si la base est nulle
 * ou si la cible demanderait un pourcentage négatif. */
function resoudreImprevusPourCible(devis, cibleHT){
  const sans = calculerDevis({ ...devis, imprevusPct: 0 });
  if(!sans.baseFG) return null;
  const p = (devisNombre(cibleHT, 0) - sans.totalHT) / sans.baseFG * 100;
  return p < 0 ? null : p;
}

// toLocaleString('fr-FR') sépare les milliers d'une espace fine insécable
// (U+202F) — que la police Host embarquée dans les PDF ne possède pas : les
// montants y perdaient leur séparateur (« 35000,00 € »). On la remplace par
// une espace ordinaire, identique à l'œil et présente dans toutes les polices.
function fmtEurosDevis(n){
  const v = devisNombre(n, 0);
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/[\u202F\u00A0]/g, ' ') + ' €';
}
// Pour les quantités : « 5 », « 0,5 », jamais « 5,00 ».
function fmtQteDevis(n){
  const v = devisNombre(n, 0);
  return v.toLocaleString('fr-FR', { maximumFractionDigits: 3 }).replace(/[\u202F\u00A0]/g, ' ');
}

/* Prochain numéro : DEV-2026-004. La séquence repart à 1 chaque année, et se
 * déduit des numéros déjà attribués — attribué au passage en « envoyé »,
 * jamais en brouillon, pour ne pas trouer la séquence avec des essais. */
function prochainNumeroDevis(tous){
  const annee = new Date().getFullYear();
  const prefixe = `DEV-${annee}-`;
  let max = 0;
  (tous || []).forEach(d=>{
    if((d.numero || '').startsWith(prefixe)){
      const n = parseInt(d.numero.slice(prefixe.length), 10);
      if(!isNaN(n) && n > max) max = n;
    }
  });
  return prefixe + String(max + 1).padStart(3, '0');
}
