/* ============================================================================
 * pdf-prise-en-main.js — la fiche d'accueil qu'on envoie à un·e musicien·ne.
 *
 * Une page par personne, à la charte, qui explique en quatre étapes à quoi sert
 * son espace — et qui porte SON lien, pas un lien générique. C'est là tout
 * l'intérêt : on n'envoie pas une notice d'un côté et un lien de l'autre, on
 * envoie un seul document que la personne peut garder.
 *
 * Le lien est donné deux fois, parce qu'on ne sait pas sur quel écran le PDF
 * sera ouvert : en texte cliquable, pour celui qui le lit sur un ordinateur, et
 * en QR code, pour celui qui veut passer sur son téléphone — or c'est justement
 * sur le téléphone que l'espace sert le plus, et que l'installation en
 * application se fait.
 *
 * Le jeton est un jeton personnel permanent (ensure_acces_personnel) : il ne
 * dépend d'aucune tournée et survit au ménage des anciennes. Une fiche envoyée
 * aujourd'hui marche encore dans deux ans.
 *
 * Dépendances : jsPDF, assets/pdf-charte.js, assets/qr.js, assets/db.js.
 * ========================================================================== */

// Base des liens imprimés sur la fiche. Volontairement fixée à l'adresse de
// production, et NON déduite de location.origin : une fiche générée depuis un
// aperçu Vercel, un domaine de préversion ou le poste local aurait sinon porté
// un lien injoignable pour le destinataire. La fiche est faite pour être
// envoyée à de vraies personnes — son lien doit toujours viser la prod.
// Un appelant peut malgré tout forcer une autre base via options.base.
const BASE_CANONIQUE = 'https://prod.lessoudaines.fr/';

// Ce que la personne peut faire, dans l'ordre où elle le découvrira. Les
// remplaçant·es n'ont pas de liste de remplaçant·es à tenir : l'étape saute.
function etapesPriseEnMain(estTitulaire){
  const etapes = [
    {
      titre: 'Réponds à tes disponibilités',
      sous: "Quand une tournée se prépare, tu reçois un message. Coche les dates où tu es libre, celles où tu ne l'es pas, et celles dont tu n'es pas sûr·e. Tu peux revenir dessus tant que rien n'est arrêté.",
    },
    {
      titre: 'Remplis ton dossier une seule fois (vraiment !)',
      sous: "Identité, adresse, numéro de sécurité sociale, RIB : ce qu'il faut pour t'établir un contrat et te payer. C'est à remplir une fois, pas à chaque tournée.",
    },
  ];
  if(estTitulaire){
    etapes.push({
      titre: 'Donne tes remplaçant·es',
      sous: "Trois personnes minimum, dans TON ordre de préférence : c'est cet ordre qu'on suit quand tu n'es pas disponible. Sans cette liste, on cherche à ta place, et souvent moins bien.",
    });
  }
  etapes.push({
    titre: "Installe-le sur ton téléphone",
    sous: "Ouvre ton lien sur ton mobile, puis ajoute-le à l'écran d'accueil : il s'ouvrira ensuite "
      + "comme une application, en plein écran, sans barre d'adresse ni onglet à retrouver — et "
      + "sans avoir à recoller le lien à chaque fois. "
      + "Sur iPhone, depuis Safari : touche le bouton Partager (le carré avec une flèche vers le "
      + "haut, en bas de l'écran), fais défiler, puis « Sur l'écran d'accueil ». "
      + "Sur Android, depuis Chrome : touche les trois points en haut à droite, puis « Ajouter à "
      + "l'écran d'accueil » — ou accepte la bannière d'installation si elle apparaît d'elle-même.",
  });
  return etapes.map((e, i)=> ({ titre: `${i + 1}. ${e.titre}`, sous: e.sous, puces: [] }));
}

// Le pavé du lien : QR à gauche, adresse cliquable à droite. C'est le cœur de
// la fiche, donc il passe avant les explications.
function blocLienPersonnel(composeur, lien){
  let matrice = null;
  try { matrice = genererMatriceQr(lien); }
  catch(e){ /* Lien anormalement long : on se rabat sur l'adresse seule. */ }

  composeur.libre((k, dessiner, y, o)=>{
    const doc = o.doc;
    const pad = 6 * k;
    const cote = Math.min(38 * k, o.utile * 0.34);   // côté du carré QR
    const hauteur = Math.max(cote + pad * 2, 34 * k);

    if(!dessiner) return hauteur + 4 * k;

    o.fond(o.charte.carte);
    o.trait(o.charte.bord);
    doc.setLineWidth(0.3);
    doc.roundedRect(o.marge, y, o.utile, hauteur, 3, 3, 'FD');

    const xQr = o.marge + pad;
    const yQr = y + (hauteur - cote) / 2;
    if(matrice){
      // Fond blanc obligatoire sous un QR : la zone de silence fait partie du
      // symbole, un lecteur ne trouve rien sans elle.
      doc.setFillColor(255, 255, 255);
      doc.rect(xQr, yQr, cote, cote, 'F');
      const marge = 2;                                  // en modules
      const pas = cote / (matrice.taille + marge * 2);
      doc.setFillColor(o.charte.noir[0], o.charte.noir[1], o.charte.noir[2]);
      for(let ligne = 0; ligne < matrice.taille; ligne++){
        for(let colonne = 0; colonne < matrice.taille; colonne++){
          if(!matrice.modules[ligne][colonne]) continue;
          // Un poil de recouvrement entre modules voisins : sans lui, jsPDF
          // laisse des cheveux blancs entre les carrés, que certains lecteurs
          // prennent pour des modules clairs.
          doc.rect((xQr + (colonne + marge) * pas), (yQr + (ligne + marge) * pas),
                   pas * 1.02, pas * 1.02, 'F');
        }
      }
    }

    const xTexte = xQr + cote + pad;
    const largeur = o.marge + o.utile - pad - xTexte;
    let yTexte = y + pad + 1 * k;

    doc.setFont('Host', 'bold'); doc.setFontSize(7 * k);
    o.encre(o.charte.prune);
    doc.text('TON LIEN PERSONNEL', xTexte, yTexte, { baseline:'top' });
    yTexte += o.hLigne(7 * k) + 1.5 * k;

    doc.setFont('Host', 'bold'); doc.setFontSize(9.5 * k);
    o.encre(o.charte.noir);
    const l = o.lignes(lien.replace(/^https?:\/\//, ''), largeur);
    doc.text(l, xTexte, yTexte, { baseline:'top' });
    doc.link(xTexte, yTexte, largeur, o.hLigne(9.5 * k) * l.length, { url: lien });
    yTexte += o.hLigne(9.5 * k) * l.length + 2 * k;

    doc.setFont('Host', 'normal'); doc.setFontSize(8 * k);
    o.encre(o.charte.muted);
    doc.text(o.lignes(matrice
      ? "Scanne le qr-code avec l'appareil photo de ton téléphone, ou clique sur le lien. Ce lien est à toi, il ne change pas — garde-le."
      : "Ce lien est à toi, il ne change pas — garde-le.", largeur),
      xTexte, yTexte, { baseline:'top' });

    return hauteur + 4 * k;
  });
}

// Une page pour une personne. Le jeton est déjà résolu par l'appelant : cette
// fonction ne parle pas à la base, elle compose.
function pagePriseEnMain(doc, personne, lien){
  const prenom = (personne.prenom || '').trim();
  const nomComplet = [personne.prenom, personne.nom].filter(Boolean).join(' ').trim();
  const estTitulaire = (personne.statutPoste || 'titulaire') !== 'remplacant';

  // Peu de texte sur beaucoup de papier : on laisse la composition grandir
  // jusqu'à occuper la page, plutôt que de rendre une feuille au tiers vide.
  const composeur = creerComposeurPdf(doc, { echelleMax: 1.5, colonnes: 1 }).entete({
    titre: prenom ? `Bienvenue ${prenom}` : 'Bienvenue',
    sousTitre: [personne.instrument, 'Curieux orchestre'].filter(Boolean).join(' · '),
    mention: 'Prise en main',
  });

  composeur.paragraphe(
    "Les Soudaines préparent leurs tournées avec un outil en ligne. C'est là qu'on te "
    + "demande tes disponibilités, qu'on réunit ce qu'il faut pour t'établir un contrat "
    + "et te payer, et que tu nous dis qui peut te remplacer quand tu n'es pas libre. "
    + "Ce qui se perdait dans les fils de mails et les SMS tient maintenant en un seul "
    + "endroit, à jour, où l'on regarde tous les deux la même chose."
  );
  composeur.paragraphe(
    "Rien à installer, aucun mot de passe à retenir : ton lien personnel te reconnaît. "
    + "Tu peux revenir dessus autant de fois que tu veux, corriger ce que tu as saisi, "
    + "et il reste le même d'une tournée à l'autre. Il ne concerne que l'administratif — "
    + "le programme, les horaires de répétition et le reste continuent de passer par les "
    + "canaux habituels."
  );

  blocLienPersonnel(composeur, lien);
  const etapes = etapesPriseEnMain(estTitulaire);
  composeur.cartes(etapes.length === 4 ? 'En quatre étapes' : 'En trois étapes', etapes);
  composeur.paragraphe(
    "Ce lien vaut mot de passe : il ouvre ton dossier, RIB compris. Ne le fais pas suivre. "
    + "Si tu penses l'avoir égaré, dis-le nous, on t'en fait un autre."
    + (nomComplet ? `  ·  Fiche établie pour ${nomComplet}.` : '')
  );

  return composeur;
}

function nomFichierPriseEnMain(personnes){
  if(personnes.length === 1){
    const base = [personnes[0].prenom, personnes[0].nom].filter(Boolean).join('-') || 'musicien';
    return `prise-en-main-${base.replace(/[^\w-]+/g, '-').toLowerCase()}.pdf`;
  }
  return `prise-en-main-${personnes.length}-fiches.pdf`;
}

/* Génère la fiche de prise en main pour une ou plusieurs personnes.
 *
 * personnes : [{id, prenom, nom, instrument, statutPoste}]
 * options   : { personType:'musicien'|'technicien', base:'https://…/' }
 *
 * Renvoie { ok, ignorees:[{personne, raison}] } — une personne dont le jeton
 * n'a pas pu être créé est signalée, pas silencieusement omise : envoyer une
 * fiche sans lien serait pire que ne rien envoyer.
 */
async function genererPriseEnMainPdf(personnes, options){
  const opts = options || {};
  const personType = opts.personType || 'musicien';
  const base = opts.base || BASE_CANONIQUE;

  if(!window.jspdf) return { ok:false, erreur:"La librairie PDF n'a pas pu être chargée." };
  if(!personnes || !personnes.length) return { ok:false, erreur:'Aucune personne sélectionnée.' };

  const ignorees = [];
  const fiches = [];
  for(const personne of personnes){
    const res = await CurieuxDB.ensureAccesPersonnel(personne.id, personType);
    if(!res || !res.token){
      ignorees.push({
        personne,
        raison: res && res.migrationAbsente
          ? "les liens personnels ne sont pas encore activés dans la base"
          : "le lien personnel n'a pas pu être créé",
      });
      continue;
    }
    fiches.push({ personne, lien: `${base}mon-espace.html?token=${encodeURIComponent(res.token)}` });
  }

  if(!fiches.length){
    return { ok:false, ignorees, erreur:"Aucun lien personnel n'a pu être créé." };
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'mm', format:'a4' });
  registerHostFont(doc);
  fiches.forEach((f, i)=>{
    if(i > 0) doc.addPage();
    pagePriseEnMain(doc, f.personne, f.lien).rendre(null);
  });

  const nomFichier = nomFichierPriseEnMain(fiches.map(f=> f.personne));
  // sortie:'blob' rend le document au lieu de le télécharger : c'est ce qui
  // permet de le tendre à la feuille de partage du téléphone (WhatsApp en
  // pièce jointe) plutôt que de seulement le déposer dans les téléchargements.
  if(opts.sortie === 'blob'){
    return { ok:true, generees: fiches.length, ignorees, blob: doc.output('blob'), nomFichier };
  }
  doc.save(nomFichier);
  return { ok:true, generees: fiches.length, ignorees, nomFichier };
}
