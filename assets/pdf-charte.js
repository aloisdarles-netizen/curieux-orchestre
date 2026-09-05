/* ============================================================================
 * Mise en page PDF à la charte — le pendant papier de assets/base.css.
 *
 * Les exports partaient jusqu'ici en tableaux autoTable gris à bandeau rose :
 * un document qui ne ressemblait à rien de ce qu'on voit à l'écran, et qui
 * s'étalait sur deux ou trois feuilles dès qu'une journée était chargée. Or
 * ces PDF sont lus debout dans un quai de déchargement, ou imprimés et punaisés
 * en régie : il leur faut la lisibilité de la page, et UNE feuille.
 *
 * Ce module rejoue donc la composition de l'écran — grille de blocs, pastilles
 * d'horaires, cartes de vacation — avec les couleurs et la typographie de la
 * charte, et garantit la feuille unique.
 *
 * La garantie tient en deux temps. On compose d'abord à blanc, sans rien
 * dessiner, pour mesurer la hauteur réelle du contenu ; on cherche ensuite par
 * dichotomie la plus grande échelle qui le fait tenir, et on ne dessine qu'à
 * la fin. Rien n'est deviné, rien n'est tronqué : c'est le corps du texte qui
 * cède, et seulement de ce qu'il faut.
 *
 * En dessous d'un certain corps le document cesserait d'être lisible : on
 * s'arrête à ECHELLE_MIN et on laisse alors déborder sur une seconde feuille,
 * plutôt que de rendre un papier que personne ne peut lire dans un camion.
 * ========================================================================== */

const PDF_CHARTE = {
  prune:      [121, 22, 73],
  pruneEncre: [252, 242, 240],
  bleu:       [206, 225, 244],
  bleuEncre:  [61, 88, 118],
  orange:     [236, 75, 21],
  rose:       [254, 201, 224],
  noir:       [20, 22, 23],
  fond:       [252, 242, 240],
  carte:      [255, 255, 255],
  bord:       [240, 219, 230],
  muted:      [122, 102, 118],
  ok:         [47, 143, 91],
  // Le bandeau d'une ligne de tableau qu'on veut faire ressortir, et son encre.
  // Un bleu très pâle : il reste un gris clair lisible sous une photocopie en
  // noir et blanc, ce qu'un jaune ou un rose fluo ne font pas.
  accent:     [232, 241, 250],
  accentEncre:[61, 88, 118],

  /* Les quatre statuts d'une date, aux couleurs exactes de l'écran clair
     (--ok, --maybe, --border, --ko-tint dans assets/base.css). Un document
     doit se reconnaître : quelqu'un qui a vu son calendrier dans son espace
     personnel et qui reçoit ce PDF doit y retrouver les mêmes verts et les
     mêmes ambres, sans avoir à relire la légende.
     On ne transpose PAS le thème sombre : un aplat sombre imprimé mange une
     cartouche et rend le chiffre illisible en photocopie.

     Les deux teintes pâles portent en plus un filet : à l'écran la case fait
     trente pixels de côté et l'aplat se voit ; sur le papier elle en fait
     cinq millimètres, et un rose à 3 % de gris disparaît — surtout photocopié.
     Le filet garde la couleur exacte et rend la case lisible comme case. */
  statuts: {
    validee:   { fond:[47, 143, 91],   encre:[255, 255, 255] },
    option:    { fond:[184, 121, 42],  encre:[255, 255, 255] },
    recherche: { fond:[240, 219, 230], encre:[20, 22, 23],  bord:[214, 180, 199] },
    annulee:   { fond:[251, 230, 226], encre:[178, 59, 46], bord:[232, 186, 176] },
  },
};

// Le logo blanc n'était pas préparé pour le PDF — seul le prune l'était, pour
// l'ancien bandeau rose pâle. Le bandeau est désormais prune plein, comme le
// bandeau de navigation du site, et demande donc la version blanche.
let CURIEUX_LOGO_BLANC_PNG = null;
(function prechargerLogoBlancPdf(){
  if(typeof fetch !== 'function' || typeof CURIEUX_LOGO_BLANC_URL === 'undefined') return;
  fetch(CURIEUX_LOGO_BLANC_URL)
    .then(r => r.ok ? r.blob() : Promise.reject(new Error(String(r.status))))
    .then(blob => new Promise((resolve, reject)=>{
      const fr = new FileReader();
      fr.onload = ()=> resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    }))
    .then(dataUrl => { CURIEUX_LOGO_BLANC_PNG = dataUrl; })
    .catch(()=>{});
})();

function creerComposeurPdf(doc, options){
  const o = Object.assign({
    marge: 12,
    // Trois colonnes et non quatre : à 44 mm, « Semis en simultané » se coupait
    // en deux et la valeur se retrouvait seule au-dessus de la fin de son
    // intitulé. À 60 mm, les couples clé/valeur tiennent sur une ligne.
    colonnes: 3,
    largeurBlocMin: 44,
    echelleMin: 0.58,
    // Plafond de l'échelle. Le défaut de 1 convient à une fiche dense. Une page
    // qui porte peu d'information — la demande faite à une salle, souvent une
    // douzaine de valeurs — se retrouvait sinon tassée en haut d'une feuille aux
    // trois quarts blanche : on l'autorise alors à grandir jusqu'à occuper la
    // page, ce qui est aussi ce qui la rend lisible de loin, sur un quai.
    echelleMax: 1,
    hauteurEntete: 25,
    // Texte du filigrane, en gris très clair sous le contenu de chaque page.
    // Vide par défaut : seul un document qui n'engage à rien en porte un.
    filigrane: '',
  }, options || {});

  const LARGEUR = doc.internal.pageSize.getWidth();
  const HAUTEUR = doc.internal.pageSize.getHeight();
  const utile = LARGEUR - o.marge * 2;

  const sections = [];
  let entete = { titre: '', sousTitre: '', mention: '' };

  // --- petits outils ------------------------------------------------------
  // setFontSize parle en points quelle que soit l'unité du document ; tout le
  // reste de ce module raisonne en millimètres. 1 pt = 0,3528 mm.
  const hLigne = (pt)=> pt * 0.3528 * 1.3;
  const encre  = (c)=> doc.setTextColor(c[0], c[1], c[2]);
  const fond   = (c)=> doc.setFillColor(c[0], c[1], c[2]);
  const trait  = (c)=> doc.setDrawColor(c[0], c[1], c[2]);
  const lignes = (texte, largeur)=> doc.splitTextToSize(String(texte == null ? '' : texte), largeur);

  // Une valeur de grille peut être un simple texte, ou {texte, lien} : le lien
  // devient cliquable dans le PDF, et le texte affiché reste court. Une URL
  // entière se coupait en plein milieu d'un mot et occupait deux lignes pour
  // ne rien dire de plus.
  const valeurTexte = (v)=> (v && typeof v === 'object' && 'texte' in v) ? v.texte : v;
  const valeurLien  = (v)=> (v && typeof v === 'object') ? v.lien : null;

  function titreSection(texte, x, y, k, dessiner){
    const pt = 6.8 * k;
    doc.setFont('Host', 'bold'); doc.setFontSize(pt);
    if(dessiner){
      encre(PDF_CHARTE.muted);
      doc.setCharSpace(0.12 * k);
      doc.text(String(texte || '').toUpperCase(), x, y, { baseline:'top' });
      doc.setCharSpace(0);
    }
    return hLigne(pt) + 1.6 * k;
  }

  // --- en-tête ------------------------------------------------------------
  function dessinerEntete(dessiner){
    const h = o.hauteurEntete;
    if(!dessiner) return h;

    fond(PDF_CHARTE.prune);
    doc.rect(0, 0, LARGEUR, h, 'F');

    let xTexte = o.marge;
    if(CURIEUX_LOGO_BLANC_PNG){
      try{
        const props = doc.getImageProperties(CURIEUX_LOGO_BLANC_PNG);
        const ratio = props.width / props.height;
        const logoH = h * 0.42;
        const logoW = logoH * ratio;
        doc.addImage(CURIEUX_LOGO_BLANC_PNG, 'PNG', o.marge, (h - logoH) / 2, logoW, logoH);
        xTexte = o.marge + logoW + 6;
      }catch(e){ /* logo pas encore prêt : le titre prend toute la place */ }
    }

    encre(PDF_CHARTE.pruneEncre);
    doc.setFont('Host', 'bold'); doc.setFontSize(13);
    const titre = lignes(entete.titre, LARGEUR - xTexte - o.marge)[0] || '';
    doc.text(titre, xTexte, h / 2 - (entete.sousTitre ? 3.4 : 1.8), { baseline:'top' });
    if(entete.sousTitre){
      doc.setFont('Host', 'normal'); doc.setFontSize(8.5);
      doc.text(lignes(entete.sousTitre, LARGEUR - xTexte - o.marge)[0] || '',
        xTexte, h / 2 + 1.4, { baseline:'top' });
    }
    return h;
  }

  function piedDePage(debordement){
    const y = HAUTEUR - 7;
    trait(PDF_CHARTE.bord); doc.setLineWidth(0.2);
    doc.line(o.marge, y - 3, LARGEUR - o.marge, y - 3);
    doc.setFont('Host', 'normal'); doc.setFontSize(7);
    encre(PDF_CHARTE.muted);
    doc.text('Curieux orchestre', o.marge, y, { baseline:'top' });
    const droite = entete.mention || '';
    if(droite) doc.text(droite, LARGEUR - o.marge, y, { baseline:'top', align:'right' });
    // Un document pensé pour tenir sur une feuille (feuille de route, page
    // salle) prévient quand il déborde. Un document multi-pages par nature
    // (devis) passe mentionDebordement:false — « suite au verso » sur la
    // DERNIÈRE page serait un contresens.
    if(debordement && o.mentionDebordement !== false){
      doc.text('suite au verso', LARGEUR / 2, y, { baseline:'top', align:'center' });
    }
  }

  // --- sections -----------------------------------------------------------
  const api = {};

  api.entete = function(def){
    entete = Object.assign({ titre:'', sousTitre:'', mention:'' }, def || {});
    return api;
  };

  /* Grille de blocs — la transposition de .fiche-grille : des cartes blanches
     cernées d'un filet, un intitulé en petites capitales, puis des couples
     clé/valeur, la valeur en gras à droite. Les blocs d'une même rangée
     partagent la hauteur de la plus haute, comme le fait CSS grid. */
  api.grille = function(blocs){
    const utiles = (blocs || []).filter(b=> b && (b.lignes || []).length);
    if(!utiles.length) return api;

    sections.push((k, dessiner, yDepart)=>{
      const gap = 2.5;
      let cols = Math.min(utiles.length, o.colonnes);
      while(cols > 1 && (utile - gap * (cols - 1)) / cols < o.largeurBlocMin) cols--;
      const largeurBloc = (utile - gap * (cols - 1)) / cols;
      const pad = 2.6 * k;
      const ptTitre = 6.8 * k, ptTexte = 8 * k;

      // Hauteur d'un bloc : intitulé, puis chaque couple, la clé et la valeur
      // se partageant la largeur et pouvant chacune passer à la ligne.
      const largeurCle = largeurBloc * 0.44 - pad;
      const largeurVal = largeurBloc * 0.56 - pad * 2;
      const mesurerBloc = (b)=>{
        let h = pad + hLigne(ptTitre) + 1.6 * k;
        doc.setFontSize(ptTexte);
        b.lignes.forEach(([cle, val])=>{
          doc.setFont('Host', 'normal');
          const nCle = lignes(cle, largeurCle).length;
          doc.setFont('Host', 'bold');
          const nVal = lignes(valeurTexte(val), largeurVal).length;
          h += hLigne(ptTexte) * Math.max(nCle, nVal) + 1.1 * k;
        });
        return h + pad;
      };

      let y = yDepart;
      let total = 0;
      for(let i = 0; i < utiles.length; i += cols){
        const rangee = utiles.slice(i, i + cols);
        const hRangee = Math.max(...rangee.map(mesurerBloc));
        if(dessiner){
          rangee.forEach((b, j)=>{
            const x = o.marge + j * (largeurBloc + gap);
            fond(PDF_CHARTE.carte); trait(PDF_CHARTE.bord); doc.setLineWidth(0.25);
            doc.roundedRect(x, y, largeurBloc, hRangee, 1.6, 1.6, 'FD');

            let yb = y + pad;
            yb += titreSection(b.titre, x + pad, yb, k, true);

            doc.setFontSize(ptTexte);
            b.lignes.forEach(([cle, val])=>{
              doc.setFont('Host', 'normal'); encre(PDF_CHARTE.muted);
              const lCle = lignes(cle, largeurCle);
              doc.text(lCle, x + pad, yb, { baseline:'top' });

              const lien = valeurLien(val);
              doc.setFont('Host', 'bold');
              encre(lien ? PDF_CHARTE.prune : PDF_CHARTE.noir);
              const lVal = lignes(valeurTexte(val), largeurVal);
              doc.text(lVal, x + largeurBloc - pad, yb, { baseline:'top', align:'right' });
              if(lien){
                const hVal = hLigne(ptTexte) * lVal.length;
                const wVal = Math.max(...lVal.map(t=> doc.getTextWidth(t)));
                doc.link(x + largeurBloc - pad - wVal, yb, wVal, hVal, { url: lien });
              }
              yb += hLigne(ptTexte) * Math.max(lCle.length, lVal.length) + 1.1 * k;
            });
          });
        }
        y += hRangee + gap;
        total += hRangee + gap;
      }
      return total + 2 * k;
    });
    return api;
  };

  /* Pastilles — la transposition de .horaire-chip : une bande de gélules qui
     passent à la ligne, pour ce qui se lit d'un coup d'œil. */
  api.pastilles = function(titre, items){
    const utiles = (items || []).filter(Boolean);
    if(!utiles.length) return api;

    sections.push((k, dessiner, yDepart)=>{
      const pt = 8 * k, padH = 2.8 * k, gap = 2 * k;
      const h = hLigne(pt) + 2.4 * k;
      let y = yDepart;

      y += titreSection(titre, o.marge, y, k, dessiner);
      doc.setFont('Host', 'normal'); doc.setFontSize(pt);

      let x = o.marge;
      utiles.forEach((texte)=>{
        const l = doc.getTextWidth(String(texte)) + padH * 2;
        if(x + l > o.marge + utile){ x = o.marge; y += h + gap; }
        if(dessiner){
          fond(PDF_CHARTE.fond); trait(PDF_CHARTE.bord); doc.setLineWidth(0.25);
          doc.roundedRect(x, y, l, h, h / 2, h / 2, 'FD');
          encre(PDF_CHARTE.noir);
          doc.text(String(texte), x + padH, y + h / 2 - hLigne(pt) / 2 + 0.3, { baseline:'top' });
        }
        x += l + gap;
      });
      return (y + h) - yDepart + 3 * k;
    });
    return api;
  };

  /* Cartes — la transposition de .vacation-pub : un créneau en gras, la
     demande en dessous, et les équipes en pastilles de couleur.

     `pucesEnTete` place la pastille en début de ligne de titre au lieu d'une
     rangée à part : c'est ce qu'il faut pour les mouvements de matériel, où le
     sens (sortie / entrée) se lit avant tout le reste, et où une carte de trois
     étages pour une seule information serait une perte de place. */
  api.cartes = function(titre, cartes, reglages){
    const utiles = (cartes || []).filter(Boolean);
    if(!utiles.length) return api;
    const enTete = !!(reglages && reglages.pucesEnTete);

    sections.push((k, dessiner, yDepart)=>{
      const pad = 2.8 * k;
      const ptTitre = 9 * k, ptSous = 7.6 * k, ptPuce = 7 * k;
      const hPuce = hLigne(ptPuce) + 2 * k;
      const padPuce = 2.6 * k;
      let y = yDepart;

      y += titreSection(titre, o.marge, y, k, dessiner);

      // Largeur d'une pastille : le texte plus ses marges, à corps constant.
      const largeurPuce = (p)=>{
        doc.setFont('Host', 'bold'); doc.setFontSize(ptPuce);
        return doc.getTextWidth(String(p.texte)) + padPuce * 2;
      };

      utiles.forEach((c)=>{
        const puces = (c.puces || []).filter(p=> p && p.texte);
        const decalage = enTete && puces.length
          ? puces.reduce((s, p)=> s + largeurPuce(p) + 1.6 * k, 0) : 0;

        // Pastillon rond numéroté (fiche de prise en main) : chiffre coloré qui
        // ouvre la ligne de titre, comme les pastilles d'avatar du site. Le
        // sous-titre s'indente pour s'aligner sous le titre, pas sous le rond.
        const dNum = 8 * k;
        const indentNum = c.numero ? dNum + 3 * k : 0;

        doc.setFont('Host', 'normal'); doc.setFontSize(ptSous);
        const nSous = c.sous ? lignes(c.sous, utile - pad * 2 - decalage - indentNum).length : 0;
        const hLigneTitre = Math.max(hLigne(ptTitre), c.numero ? dNum : 0, enTete && puces.length ? hPuce : 0);
        const h = pad + hLigneTitre
          + (nSous ? nSous * hLigne(ptSous) + 1 * k : 0)
          + (!enTete && puces.length ? hPuce + 1.6 * k : 0)
          + pad;

        if(dessiner){
          fond(PDF_CHARTE.fond); trait(PDF_CHARTE.bord); doc.setLineWidth(0.25);
          doc.roundedRect(o.marge, y, utile, h, 1.6, 1.6, 'FD');

          let yc = y + pad;
          let xTitre = o.marge + pad;

          if(enTete && puces.length){
            let x = xTitre;
            puces.forEach((p)=>{
              const l = largeurPuce(p);
              fond(p.fond || PDF_CHARTE.bleu);
              doc.roundedRect(x, yc + (hLigneTitre - hPuce) / 2, l, hPuce, hPuce / 2, hPuce / 2, 'F');
              encre(p.encre || PDF_CHARTE.bleuEncre);
              doc.text(String(p.texte), x + padPuce,
                yc + (hLigneTitre - hLigne(ptPuce)) / 2 + 0.3, { baseline:'top' });
              x += l + 1.6 * k;
            });
            xTitre = x;
          }

          if(c.numero){
            const r = dNum / 2;
            const cx = o.marge + pad + r;
            const cy = yc + hLigneTitre / 2;
            fond(c.numeroFond || PDF_CHARTE.bleu);
            doc.circle(cx, cy, r, 'F');
            doc.setFont('Host', 'bold'); doc.setFontSize(ptTitre * 0.92);
            encre(c.numeroEncre || PDF_CHARTE.bleuEncre);
            doc.text(String(c.numero), cx, cy + 0.2 * k, { baseline:'middle', align:'center' });
            xTitre = o.marge + pad + dNum + 3 * k;
          }

          doc.setFont('Host', 'bold'); doc.setFontSize(ptTitre); encre(PDF_CHARTE.noir);
          doc.text(String(c.titre || ''), xTitre,
            yc + (hLigneTitre - hLigne(ptTitre)) / 2, { baseline:'top' });
          if(c.etat){
            doc.setFontSize(ptSous); encre(c.etatCouleur || PDF_CHARTE.ok);
            doc.text(String(c.etat), o.marge + utile - pad,
              yc + (hLigneTitre - hLigne(ptSous)) / 2, { baseline:'top', align:'right' });
          }
          yc += hLigneTitre;

          if(nSous){
            doc.setFont('Host', 'normal'); doc.setFontSize(ptSous); encre(PDF_CHARTE.muted);
            doc.text(lignes(c.sous, utile - pad * 2 - decalage - indentNum), o.marge + pad + decalage + indentNum, yc, { baseline:'top' });
            yc += nSous * hLigne(ptSous) + 1 * k;
          }

          if(!enTete && puces.length){
            let x = o.marge + pad;
            puces.forEach((p)=>{
              const l = largeurPuce(p);
              if(x + l > o.marge + utile - pad) return;   // le reste ne tiendrait pas
              fond(p.fond || PDF_CHARTE.bleu);
              doc.roundedRect(x, yc, l, hPuce, hPuce / 2, hPuce / 2, 'F');
              encre(p.encre || PDF_CHARTE.bleuEncre);
              doc.text(String(p.texte), x + padPuce, yc + hPuce / 2 - hLigne(ptPuce) / 2 + 0.3, { baseline:'top' });
              x += l + 1.6 * k;
            });
          }
        }
        y += h + 2 * k;
      });
      return y - yDepart + 1.5 * k;
    });
    return api;
  };

  /* Grille aérée — la transposition de .salle-champs : l'intitulé en petites
     capitales AU-DESSUS, la valeur en gros dessous. C'est la composition de la
     page salle, et pour de bonnes raisons : une valeur technique doit se
     saisir d'un coup d'œil, pas se chercher au bout d'une ligne pointillée.
     Deux colonnes seulement, pour que les valeurs aient de la place. */
  api.grilleAeree = function(blocs){
    const utiles = (blocs || []).filter(b=> b && (b.lignes || []).length);
    if(!utiles.length) return api;

    sections.push((k, dessiner, yDepart)=>{
      const gap = 4;
      const cols = utiles.length === 1 ? 1 : 2;
      const largeurBloc = (utile - gap * (cols - 1)) / cols;
      const pad = 4.5 * k;
      const ptTitre = 7.2 * k, ptCle = 6.6 * k, ptVal = 12 * k;
      const largeurTexte = largeurBloc - pad * 2;

      const mesurerBloc = (b)=>{
        let h = pad + hLigne(ptTitre) + 3 * k;
        b.lignes.forEach(([cle, val])=>{
          doc.setFont('Host', 'bold'); doc.setFontSize(ptCle);
          const nCle = lignes(cle, largeurTexte).length;
          doc.setFont('Host', 'bold'); doc.setFontSize(ptVal);
          const nVal = lignes(valeurTexte(val), largeurTexte).length;
          h += nCle * hLigne(ptCle) + 0.8 * k + nVal * hLigne(ptVal) + 3.2 * k;
        });
        return h + pad - 3.2 * k;
      };

      let y = yDepart;
      let total = 0;
      for(let i = 0; i < utiles.length; i += cols){
        const rangee = utiles.slice(i, i + cols);
        const hRangee = Math.max(...rangee.map(mesurerBloc));
        if(dessiner){
          rangee.forEach((b, j)=>{
            const x = o.marge + j * (largeurBloc + gap);
            fond(PDF_CHARTE.fond); trait(PDF_CHARTE.bord); doc.setLineWidth(0.25);
            doc.roundedRect(x, y, largeurBloc, hRangee, 2.4, 2.4, 'FD');

            let yb = y + pad;
            doc.setFont('Host', 'bold'); doc.setFontSize(ptTitre);
            encre(PDF_CHARTE.prune);
            doc.setCharSpace(0.14 * k);
            doc.text(String(b.titre || '').toUpperCase(), x + pad, yb, { baseline:'top' });
            doc.setCharSpace(0);
            yb += hLigne(ptTitre) + 3 * k;

            b.lignes.forEach(([cle, val])=>{
              doc.setFont('Host', 'bold'); doc.setFontSize(ptCle); encre(PDF_CHARTE.muted);
              doc.setCharSpace(0.1 * k);
              const lCle = lignes(String(cle).toUpperCase(), largeurTexte);
              doc.text(lCle, x + pad, yb, { baseline:'top' });
              doc.setCharSpace(0);
              yb += lCle.length * hLigne(ptCle) + 0.8 * k;

              const lien = valeurLien(val);
              doc.setFont('Host', 'bold'); doc.setFontSize(ptVal);
              encre(lien ? PDF_CHARTE.prune : PDF_CHARTE.noir);
              const lVal = lignes(valeurTexte(val), largeurTexte);
              doc.text(lVal, x + pad, yb, { baseline:'top' });
              if(lien){
                const wVal = Math.max(...lVal.map(t=> doc.getTextWidth(t)));
                doc.link(x + pad, yb, wVal, lVal.length * hLigne(ptVal), { url: lien });
              }
              yb += lVal.length * hLigne(ptVal) + 3.2 * k;
            });
          });
        }
        y += hRangee + gap;
        total += hRangee + gap;
      }
      return total + 2 * k;
    });
    return api;
  };

  api.paragraphe = function(texte){
    if(!texte) return api;
    sections.push((k, dessiner, yDepart)=>{
      const pt = 8 * k;
      doc.setFont('Host', 'normal'); doc.setFontSize(pt);
      const l = lignes(texte, utile);
      if(dessiner){
        encre(PDF_CHARTE.muted);
        doc.text(l, o.marge, yDepart, { baseline:'top' });
      }
      return l.length * hLigne(pt) + 3 * k;
    });
    return api;
  };

  /* Rubriques — la composition éditoriale de la feuille de route : un filet
     prune, l'intitulé en petites capitales, un trait fin sous le titre, puis
     des couples clé/valeur séparés par des hairlines. Pas de carte, pas de
     cadre : le blanc et les filets font la structure.

     C'est plus lisible que la grille de cartes quand une entrée porte quelques
     lignes de texte plutôt que des valeurs courtes — la carte contraint la
     largeur, la rubrique prend la page.

     blocs : [{ titre, lignes:[[clé, valeur], …] }] */
  api.rubriques = function(blocs){
    const utiles = (blocs || []).filter(b=> b && (b.lignes || []).length);
    if(!utiles.length) return api;

    sections.push((k, dessiner, yDepart)=>{
      const ptTitre = 8 * k, ptTexte = 8.6 * k;
      const largeurCle = Math.max(26 * k, utile * 0.2);
      const largeurVal = utile - largeurCle - 3 * k;
      let y = yDepart;

      utiles.forEach((b, iBloc)=>{
        if(iBloc > 0) y += 3.5 * k;

        // Titre : filet vertical prune, intitulé en capitales espacées.
        doc.setFont('Host', 'bold'); doc.setFontSize(ptTitre);
        const hTitre = hLigne(ptTitre);
        if(dessiner){
          fond(PDF_CHARTE.prune);
          doc.rect(o.marge, y + hTitre * 0.12, 1.1 * k, hTitre * 0.78, 'F');
          encre(PDF_CHARTE.prune);
          doc.setCharSpace(0.1 * k);
          doc.text(String(b.titre || '').toUpperCase(), o.marge + 3.2 * k, y, { baseline:'top' });
          doc.setCharSpace(0);
        }
        y += hTitre + 1.6 * k;
        if(dessiner){
          trait(PDF_CHARTE.bord); doc.setLineWidth(0.25);
          doc.line(o.marge, y, o.marge + utile, y);
        }
        y += 2.4 * k;

        // Lignes : clé à gauche en gras prune, valeur à droite, hairline dessous.
        b.lignes.forEach(([cle, val])=>{
          doc.setFontSize(ptTexte);
          doc.setFont('Host', 'bold');
          const lCle = lignes(cle, largeurCle);
          doc.setFont('Host', 'normal');
          const lVal = lignes(valeurTexte(val), largeurVal);
          const h = Math.max(lCle.length, lVal.length) * hLigne(ptTexte);
          if(dessiner){
            doc.setFont('Host', 'bold'); encre(PDF_CHARTE.prune);
            doc.text(lCle, o.marge, y, { baseline:'top' });
            doc.setFont('Host', 'normal'); encre(PDF_CHARTE.noir);
            doc.text(lVal, o.marge + largeurCle + 3 * k, y, { baseline:'top' });
            const lien = valeurLien(val);
            if(lien) doc.link(o.marge + largeurCle + 3 * k, y, largeurVal, h, { url: lien });
          }
          y += h + 2 * k;
          if(dessiner){
            trait(PDF_CHARTE.bord); doc.setLineWidth(0.15);
            doc.line(o.marge, y - 1 * k, o.marge + utile, y - 1 * k);
          }
        });
      });

      return y - yDepart + 2 * k;
    });
    return api;
  };

  /* Tableau — quand plusieurs valeurs décrivent la même chose et qu'il faut
     dire laquelle est laquelle. « 400 · PWLCK · 300 » ne veut rien dire pour
     une salle ; sous des colonnes intitulées Puissance / Type de prise /
     Différentiel, la même ligne se lit sans explication.

     colonnes : [{titre, largeur}] — largeur en part relative (défaut : égales)
     lignes   : [[val, val, …], …]                                            */
  /* Une ligne de tableau prend deux formes :
   *
   *     ['Musique', 'Roxanne Rabatti', 'Violon solo', '']   — le cas courant
   *     { cellules: [...], accent: true }                   — une ligne à faire ressortir
   *
   * La seconde sert à marquer ce qui change d'un tableau à l'autre (le plateau
   * qui bouge d'une date à la suivante) : un bandeau pâle et une encre bleue,
   * là où le reste est noir sur blanc. Les appelants qui ne connaissent que la
   * première forme empruntent exactement le chemin d'avant. */
  const cellulesDe = (l)=> Array.isArray(l) ? l : ((l && l.cellules) || []);

  api.tableau = function(titre, colonnes, lignes, note){
    const cols = (colonnes || []).filter(Boolean);
    const corps = (lignes || []).filter(l=> l && cellulesDe(l).some(v=> v != null && v !== ''));
    if(!cols.length || !corps.length) return api;

    sections.push((k, dessiner, yDepart)=>{
      const ptTitre = 8 * k, ptEntete = 6.6 * k, ptTexte = 8.6 * k, ptNote = 7 * k;
      const parts = cols.map(c=> c.largeur || 1);
      const total = parts.reduce((a, b)=> a + b, 0);
      const gap = 2.5 * k;
      const largeurs = parts.map(p=> (utile - gap * (cols.length - 1)) * (p / total));
      const xDe = (i)=> o.marge + largeurs.slice(0, i).reduce((a, b)=> a + b, 0) + gap * i;
      let y = yDepart;

      // Intitulé de la section, dans l'idiome de la feuille de route.
      doc.setFont('Host', 'bold'); doc.setFontSize(ptTitre);
      const hTitre = hLigne(ptTitre);
      if(dessiner){
        fond(PDF_CHARTE.prune);
        doc.rect(o.marge, y + hTitre * 0.12, 1.1 * k, hTitre * 0.78, 'F');
        encre(PDF_CHARTE.prune);
        doc.setCharSpace(0.1 * k);
        doc.text(String(titre || '').toUpperCase(), o.marge + 3.2 * k, y, { baseline:'top' });
        doc.setCharSpace(0);
      }
      y += hTitre + 1.8 * k;

      // La légende : sans elle, la ligne de valeurs reste une énigme.
      doc.setFont('Host', 'bold'); doc.setFontSize(ptEntete);
      if(dessiner){
        encre(PDF_CHARTE.muted);
        doc.setCharSpace(0.08 * k);
        cols.forEach((c, i)=> doc.text(String(c.titre || '').toUpperCase(), xDe(i), y, { baseline:'top' }));
        doc.setCharSpace(0);
      }
      y += hLigne(ptEntete) + 1.4 * k;
      if(dessiner){
        trait(PDF_CHARTE.prune); doc.setLineWidth(0.3);
        doc.line(o.marge, y, o.marge + utile, y);
      }
      y += 2.2 * k;

      corps.forEach(ligne=>{
        const cellules = cellulesDe(ligne);
        const accent = !Array.isArray(ligne) && !!ligne.accent;
        doc.setFontSize(ptTexte); doc.setFont('Host', 'normal');
        const decoupes = cols.map((c, i)=> lignes_(cellules[i], largeurs[i]));
        const h = Math.max(...decoupes.map(d=> d.length)) * hLigne(ptTexte);
        if(dessiner){
          // Le bandeau d'abord, le texte par-dessus. Il déborde d'un millimètre
          // de part et d'autre de la colonne des données pour que la ligne se
          // lise comme une bande, et non comme quatre rectangles.
          if(accent){
            fond(PDF_CHARTE.accent);
            doc.rect(o.marge - 1 * k, y - 1.2 * k, utile + 2 * k, h + 2.4 * k, 'F');
          }
          decoupes.forEach((d, i)=>{
            // La première colonne porte le repère — en gras, c'est elle qu'on
            // cherche des yeux sur un plateau.
            doc.setFont('Host', i === 0 ? 'bold' : 'normal');
            encre(accent ? PDF_CHARTE.accentEncre : PDF_CHARTE.noir);
            doc.text(d, xDe(i), y, { baseline:'top' });
          });
        }
        y += h + 2 * k;
        if(dessiner){
          trait(PDF_CHARTE.bord); doc.setLineWidth(0.15);
          doc.line(o.marge, y - 1 * k, o.marge + utile, y - 1 * k);
        }
      });

      if(note){
        doc.setFont('Host', 'normal'); doc.setFontSize(ptNote);
        const l = lignes_(note, utile);
        if(dessiner){ encre(PDF_CHARTE.muted); doc.text(l, o.marge, y + 1 * k, { baseline:'top' }); }
        y += l.length * hLigne(ptNote) + 2 * k;
      }
      return y - yDepart + 3 * k;
    });
    return api;
  };
  // Alias interne : `lignes` est déjà pris par le découpeur de texte.
  const lignes_ = (texte, largeur)=> lignes(texte == null ? '' : texte, largeur);

  /* Le calendrier — la vue de l'espace personnel, sur le papier
     -------------------------------------------------------------------------
     Un récapitulatif en tableaux se lit ligne à ligne : on y cherche une date,
     on ne voit pas un mois. Or ce qu'on demande à ce document, c'est justement
     de répondre d'un coup d'œil à « suis-je pris la semaine du 12 ? ». Le
     calendrier le fait, le tableau non — et c'est déjà la forme que les gens
     ont sous les yeux dans leur espace personnel. On la rejoue donc à
     l'identique : mêmes couleurs, même grille lundi-dimanche, même point sous
     le chiffre pour dire « tu joues », même légende sur le côté.

     Ce que la section reçoit ne parle que de calendrier, jamais de tournée :
     le composeur ignore ce qu'est une date de concert, et doit continuer de
     l'ignorer.

       mois : [{ annee, mois (1 à 12), jours: { 12: { statut, point } } }]
       reglages : { legende:[{statut|point, mot}], note, colonnesMax }

     La hauteur est purement arithmétique — nombre de semaines, hauteur de
     case — donc identique à la mesure et au dessin, ce dont dépend tout le
     calcul d'échelle du composeur. */
  const CAL_JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  // Largeur minimale d'une grille de mois, en millimètres et NON à l'échelle du
  // texte : une grille se lit à sa taille physique, et la faire dépendre de k
  // ferait changer le nombre de mois par rangée en cours de calcul — donc les
  // ruptures de page, donc la hauteur, donc k. On la fixe une fois.
  const CAL_MOIS_MIN = 40;

  api.calendrier = function(titre, mois, reglages){
    const grilles = (mois || []).filter(m=> m && m.annee && m.mois);
    if(!grilles.length) return api;
    const r = Object.assign({ legende: [], note: '', colonnesMax: 3 }, reglages || {});
    const legende = (r.legende || []).filter(l=> l && l.mot);

    /* Une section par RANGÉE de mois, et non une seule pour tout le
       calendrier : le composeur ne sait couper qu'entre deux sections. Une
       saison de huit mois formant un bloc unique déborderait de la feuille
       sans que rien ne puisse l'en empêcher. */
    const gapLeg = 5;
    const largeurLegende = legende.length ? Math.min(38, utile * 0.24) : 0;
    const largeurCal = utile - (largeurLegende ? largeurLegende + gapLeg : 0);
    const gapMois = 4;
    /* La largeur d'un mois ne dépend PAS du nombre de mois. Un projet qui n'en
       compte qu'un se voyait sinon dessiner une grille de quatorze centimètres
       de large, en pleine page, avec des quantièmes de trente points : le même
       objet que le calendrier de la saison, et pourtant méconnaissable. La
       grille garde donc sa taille, et une saison courte laisse simplement de
       la place à droite. */
    let cols = r.colonnesMax;
    while(cols > 1 && (largeurCal - gapMois * (cols - 1)) / cols < CAL_MOIS_MIN) cols--;
    const largeurMois = (largeurCal - gapMois * (cols - 1)) / cols;
    cols = Math.min(cols, grilles.length);

    const rangees = [];
    for(let i = 0; i < grilles.length; i += cols) rangees.push(grilles.slice(i, i + cols));

    rangees.forEach((rangee, iRangee)=>{
      const premiere = iRangee === 0;
      const derniere = iRangee === rangees.length - 1;

      sections.push((k, dessiner, yDepart)=>{
        /* Une grille de calendrier est un objet PHYSIQUE : sept colonnes dans
           une largeur donnée, des cases carrées, un chiffre qui doit tenir
           dedans. Elle ne suit donc pas l'échelle du texte — seuls le titre de
           section et la note du bas la suivent. La faire grossir avec k faisait
           déborder les pastilles sur les cases voisines dès qu'un document
           court autorisait le corps à grandir : « 28 » mordait sur « 27 ».
           Le corps du quantième se déduit de la case, pas de k. */
        const ptTitre = 8 * k, ptNote = 7 * k;
        let y = yDepart;

        // Le bandeau de section, dans l'idiome des tableaux : le document doit
        // avoir l'air d'un seul document.
        if(titre && premiere){
          doc.setFont('Host', 'bold'); doc.setFontSize(ptTitre);
          const hTitre = hLigne(ptTitre);
          if(dessiner){
            fond(PDF_CHARTE.prune);
            doc.rect(o.marge, y + hTitre * 0.12, 1.1 * k, hTitre * 0.78, 'F');
            encre(PDF_CHARTE.prune);
            doc.setCharSpace(0.1 * k);
            doc.text(String(titre).toUpperCase(), o.marge + 3.2 * k, y, { baseline:'top' });
            doc.setCharSpace(0);
          }
          y += hTitre + 2.4 * k;
        }

        // Géométrie d'une grille : un cadre, sept colonnes, des cases carrées.
        // Tout en millimètres, rien à l'échelle du texte.
        const padGrille = 2.2;
        const gapCase = 0.9;
        const largeurCase = (largeurMois - padGrille * 2 - gapCase * 6) / 7;
        const hauteurCase = largeurCase;
        // Le quantième occupe un peu plus de la moitié de sa case : deux
        // chiffres y tiennent avec leur air autour, à toute largeur de grille.
        const ptJour = (largeurCase / 0.3528) * 0.52;
        const ptNom = ptJour * 0.80;
        const ptMois = ptJour * 1.05;
        const ptLeg = 7 * k;
        const hauteurNoms = hLigne(ptNom) + 1;
        const hEnTeteMois = hLigne(ptMois) + 1.6;

        const semainesDe = (m)=>{
          const decalage = (new Date(Date.UTC(m.annee, m.mois - 1, 1)).getUTCDay() + 6) % 7;
          const nbJours = new Date(Date.UTC(m.annee, m.mois, 0)).getUTCDate();
          return { decalage, nbJours, semaines: Math.ceil((decalage + nbJours) / 7) };
        };
        const hauteurMois = (m)=>{
          const { semaines } = semainesDe(m);
          return hEnTeteMois + padGrille * 2 + hauteurNoms
               + semaines * hauteurCase + (semaines - 1) * gapCase;
        };

        const dessinerMois = (m, x, yM)=>{
          const { decalage, nbJours, semaines } = semainesDe(m);
          const hGrille = padGrille * 2 + hauteurNoms + semaines * hauteurCase + (semaines - 1) * gapCase;

          doc.setFont('Host', 'bold'); doc.setFontSize(ptMois);
          encre(PDF_CHARTE.prune);
          doc.text(String(m.libelle || '').toUpperCase(), x, yM, { baseline:'top' });

          const yG = yM + hEnTeteMois;
          fond(PDF_CHARTE.carte); trait(PDF_CHARTE.bord); doc.setLineWidth(0.2);
          doc.roundedRect(x, yG, largeurMois, hGrille, 1.6, 1.6, 'FD');

          const xCase = (col)=> x + padGrille + col * (largeurCase + gapCase);
          const yCase = (sem)=> yG + padGrille + hauteurNoms + sem * (hauteurCase + gapCase);

          doc.setFont('Host', 'bold'); doc.setFontSize(ptNom);
          encre(PDF_CHARTE.muted);
          CAL_JOURS.forEach((n, i)=> doc.text(n, xCase(i) + largeurCase / 2, yG + padGrille,
            { baseline:'top', align:'center' }));

          for(let j = 1; j <= nbJours; j++){
            const idx = decalage + j - 1;
            const cx = xCase(idx % 7), cy = yCase(Math.floor(idx / 7));
            const info = (m.jours || {})[j] || (m.jours || {})[String(j)] || null;
            const st = info && PDF_CHARTE.statuts[info.statut] ? PDF_CHARTE.statuts[info.statut] : null;

            if(st){
              fond(st.fond);
              if(st.bord){
                trait(st.bord); doc.setLineWidth(0.2);
                doc.roundedRect(cx, cy, largeurCase, hauteurCase, 1.2, 1.2, 'FD');
              } else {
                doc.roundedRect(cx, cy, largeurCase, hauteurCase, 1.2, 1.2, 'F');
              }
            }
            doc.setFont('Host', st ? 'bold' : 'normal'); doc.setFontSize(ptJour);
            encre(st ? st.encre : PDF_CHARTE.muted);
            // Le chiffre remonte un peu quand la case porte un point : sinon le
            // point mord dessus et les deux deviennent illisibles.
            const yTexte = cy + hauteurCase / 2 + ((info && info.point) ? -0.45 : 0);
            doc.text(String(j), cx + largeurCase / 2, yTexte, { baseline:'middle', align:'center' });

            // Une date annulée se barre, comme à l'écran.
            if(info && info.statut === 'annulee'){
              const w = doc.getTextWidth(String(j));
              trait(st.encre); doc.setLineWidth(0.25);
              doc.line(cx + largeurCase / 2 - w / 2 - 0.3, yTexte,
                       cx + largeurCase / 2 + w / 2 + 0.3, yTexte);
            }
            // Le point sous le chiffre : la couleur dit le statut, le point dit
            // qu'on y joue. Deux informations, deux signes.
            if(info && info.point){
              fond(st ? st.encre : PDF_CHARTE.noir);
              doc.circle(cx + largeurCase / 2, cy + hauteurCase - 1.25, 0.42, 'F');
            }
          }
        };

        const hRangee = Math.max(...rangee.map(hauteurMois));
        if(dessiner) rangee.forEach((m, j)=> dessinerMois(m, o.marge + j * (largeurMois + gapMois), y));

        /* La légende, dans son cadre, en face de la première rangée — comme la
           colonne de légende à l'écran. Les rangées suivantes lui laissent sa
           largeur pour que toutes les grilles restent alignées. */
        let hLegende = 0;
        if(legende.length && premiere){
          const padLeg = 2.6 * k;
          const hEntree = Math.max(hLigne(ptLeg), 3.2 * k);
          const gapEntree = 1.6 * k;
          hLegende = padLeg * 2 + legende.length * hEntree + (legende.length - 1) * gapEntree;
          if(dessiner){
            const xL = o.marge + largeurCal + gapLeg;
            fond(PDF_CHARTE.carte); trait(PDF_CHARTE.bord); doc.setLineWidth(0.2);
            doc.roundedRect(xL, y, largeurLegende, hLegende, 1.6 * k, 1.6 * k, 'FD');
            doc.setFont('Host', 'normal'); doc.setFontSize(ptLeg);
            legende.forEach((l, i)=>{
              const yE = y + padLeg + i * (hEntree + gapEntree);
              const cote = 2.4 * k;
              if(l.point){
                fond(PDF_CHARTE.noir);
                doc.circle(xL + padLeg + cote / 2, yE + hEntree / 2, 0.8 * k, 'F');
              } else {
                const st = PDF_CHARTE.statuts[l.statut] || { fond: PDF_CHARTE.bord };
                fond(st.fond);
                if(st.bord){
                  trait(st.bord); doc.setLineWidth(0.2);
                  doc.roundedRect(xL + padLeg, yE + (hEntree - cote) / 2, cote, cote, 0.7 * k, 0.7 * k, 'FD');
                } else {
                  doc.roundedRect(xL + padLeg, yE + (hEntree - cote) / 2, cote, cote, 0.7 * k, 0.7 * k, 'F');
                }
              }
              encre(PDF_CHARTE.muted);
              doc.text(String(l.mot), xL + padLeg + cote + 2 * k, yE + hEntree / 2, { baseline:'middle' });
            });
          }
        }

        y += Math.max(hRangee, hLegende);

        if(r.note && derniere){
          doc.setFont('Host', 'normal'); doc.setFontSize(ptNote);
          const l = lignes_(r.note, utile);
          if(dessiner){ encre(PDF_CHARTE.muted); doc.text(l, o.marge, y + 2 * k, { baseline:'top' }); }
          y += l.length * hLigne(ptNote) + 2 * k;
        }
        return y - yDepart + (derniere ? 4 * k : gapMois);
      });
    });
    return api;
  };

  // Une section dessinée à la main, pour ce que la charte ne prévoit pas — un
  // QR code, par exemple. Elle reçoit l'échelle en cours et la boîte à outils
  // du composeur, et rend sa hauteur comme n'importe quelle autre section :
  // elle participe donc au calcul qui fait tenir la page.
  //
  //   composeur.libre((k, dessiner, y, outils) => { … ; return hauteur; })
  api.libre = function(fn){
    if(typeof fn !== 'function') return api;
    const outils = { doc, marge: o.marge, utile, hLigne, encre, fond, trait, lignes, charte: PDF_CHARTE };
    sections.push((k, dessiner, yDepart)=> fn(k, dessiner, yDepart, outils));
    return api;
  };

  // --- rendu --------------------------------------------------------------
  function hauteurTotale(k){
    return sections.reduce((h, s)=> h + s(k, false, 0), 0);
  }

  /* Le filigrane, posé AVANT le contenu de chaque page.
   *
   * On aurait pu le peindre à la fin, en transparence (jsPDF sait le faire via
   * GState). Le dessiner dessous est plus sûr : aucune dépendance à une
   * fonctionnalité optionnelle du moteur, et surtout aucun risque qu'un
   * lecteur PDF qui gère mal la transparence rende le texte illisible sous un
   * aplat gris. Un gris très clair suffit : il se voit, il ne gêne pas.
   */
  const FILIGRANE_ANGLE = 38;
  function poserFiligrane(){
    if(!o.filigrane) return;
    const texte = String(o.filigrane).toUpperCase();
    doc.saveGraphicsState && doc.saveGraphicsState();
    doc.setFont('Host', 'bold');
    doc.setFontSize(74);
    doc.setTextColor(233, 233, 235);
    /* jsPDF pose le texte par son extrémité gauche, puis le fait tourner autour
     * de ce point-là. « align: center » centre donc le mot AVANT la rotation :
     * une fois tourné, il part en haut à gauche. On calcule l'ancrage nous-mêmes
     * — reculer d'une demi-longueur le long de la diagonale — pour que le milieu
     * du mot tombe au milieu de la page. */
    const rad = FILIGRANE_ANGLE * Math.PI / 180;
    const demi = doc.getTextWidth(texte) / 2;
    doc.text(texte, LARGEUR / 2 - demi * Math.cos(rad), HAUTEUR / 2 + demi * Math.sin(rad), {
      baseline: 'middle', angle: FILIGRANE_ANGLE,
    });
    doc.restoreGraphicsState && doc.restoreGraphicsState();
    // Le composeur reprend la main sur les réglages qu'il croit connaître.
    doc.setTextColor(0, 0, 0);
    doc.setCharSpace(0);
  }

  api.rendre = function(nomFichier){
    const dispo = HAUTEUR - o.hauteurEntete - 4 - 12;   // 12 : pied de page
    let k = o.echelleMax;

    /* Rétrécir le texte n'a de sens que si ça fait tenir la page.
       -----------------------------------------------------------------------
       Certaines sections ont une hauteur incompressible — une grille de
       calendrier est un objet physique, elle ne suit pas le corps du texte.
       Quatorze mois de saison ne tiendront jamais sur une feuille : la
       dichotomie descendait alors jusqu'à ECHELLE_MIN, rendait le texte
       illisible, et débordait quand même. On y perdait sur les deux tableaux.

       Si le contenu ne tient pas même au plus petit corps admis, le document
       sera de toute façon sur plusieurs pages : autant le composer à sa taille
       naturelle et le rendre lisible. */
    if(hauteurTotale(o.echelleMin) > dispo){
      k = Math.min(1, o.echelleMax);
    } else if(hauteurTotale(k) > dispo){
      // Dichotomie sur l'échelle : la hauteur ne décroît pas proportionnellement
      // au corps (le texte se replie moins quand il rétrécit), une simple règle
      // de trois donnerait donc un document plus petit que nécessaire.
      let bas = o.echelleMin, haut = o.echelleMax;
      for(let i = 0; i < 14; i++){
        const m = (bas + haut) / 2;
        if(hauteurTotale(m) <= dispo) bas = m; else haut = m;
      }
      k = bas;
    }

    const deborde = hauteurTotale(k) > dispo;
    poserFiligrane();
    dessinerEntete(true);
    let y = o.hauteurEntete + 4;
    // Le pied se posait une seule fois, à la fin : sur un document de deux
    // feuilles, la première partait sans nom d'orchestre ni mention, et
    // « suite au verso » s'imprimait sur la dernière page — là où il n'y a
    // justement pas de suite. On le pose maintenant page par page.
    let pages = 1;
    sections.forEach((s)=>{
      const h = s(k, false, 0);
      if(y + h > HAUTEUR - 12 && y > o.hauteurEntete + 6){
        piedDePage(true);
        doc.addPage();
        pages++;
        poserFiligrane();
        y = o.marge;
      }
      s(k, true, y);
      y += h;
    });
    // Une seule page dont le contenu déborde tout de même (une section plus
    // haute qu'une feuille) : elle a bien une suite. Après une coupure, non.
    piedDePage(deborde && pages === 1);
    if(nomFichier) doc.save(nomFichier);
    return doc;
  };

  return api;
}

// Une URL lisible dans une colonne étroite : le protocole et le « www » ne
// disent rien, et un chemin trop long se réduit par son milieu plutôt que de
// se couper au hasard d'un pli de ligne.
function pdfUrlCourte(url, maxi){
  const nette = String(url || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
  const limite = maxi || 30;
  if(nette.length <= limite) return nette;
  const tete = Math.ceil((limite - 1) / 2);
  return nette.slice(0, tete) + '…' + nette.slice(nette.length - (limite - 1 - tete));
}
