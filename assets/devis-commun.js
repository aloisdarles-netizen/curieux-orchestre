/* ============================================================================
 * devis-commun.js — le modèle et le moteur de calcul de l'espace Devis.
 *
 * Partagé entre la liste (devis.html), l'éditeur (devis-editeur.html) et le
 * PDF (pdf-devis.js) : les totaux affichés à l'écran et imprimés au client
 * sortent du MÊME calcul, ils ne peuvent pas diverger.
 *
 * Le document devis (stocké tel quel en jsonb) :
 *   { id, projetId, variante, retenue, numero, statut, fige,
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

// [clé, libellé complet, libellé court]. Le court sert aux pastilles de la
// feuille de chiffrage, où la place est comptée ; le complet reste pour les
// écrans qui expliquent (charges, aide).
const DEVIS_REGIMES = [
  ['production', 'Production',           'Prod.'],
  ['musicien',   'Musicien·ne (cachet)', 'Cachet'],
  ['auteur',     'Auteur·rice',          'Auteur'],
  ['facture',    'Prestataire facturé',  'Facturé'],
  ['aucun',      'Sans charges',         '—'],
];

const DEVIS_STATUTS = {
  brouillon: 'Brouillon',
  envoye:    'Envoyé',
  accepte:   'Accepté',
  refuse:    'Refusé',
};

function nouveauDevis(reglages, projetId){
  const r = reglages || {};
  return {
    id: genId('devis'),
    projetId: projetId || genId('projet'),
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
    sections: [
      { id: genId('sec'), titre: 'Rémunération équipe (brut hors charges)', remuneration: true, tva: null, horsFG: false, groupes: [
        { id: genId('grp'), titre: '', lignes: [] },
      ]},
      { id: genId('sec'), titre: 'VHR et matériel', remuneration: false, tva: null, horsFG: false, groupes: [
        { id: genId('grp'), titre: '', lignes: [] },
      ]},
    ],
  };
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
  const assiettes = { auteur: 0, musicien: 0, production: 0 };
  // Assiette des seules sections SORTIES de la base des frais généraux : leurs
  // charges patronales doivent en sortir aussi, sinon on facturerait des frais
  // généraux sur les charges d'un poste qu'on a justement voulu exclure.
  const assiettesHorsFG = { auteur: 0, musicien: 0, production: 0 };
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
