/* ============================================================================
 * qr.js — un encodeur QR minimal, en mode octet, niveau de correction M.
 *
 * Pourquoi l'écrire plutôt que prendre une librairie ? Le site est servi en
 * statique et n'a pas de chaîne de build : chaque dépendance est un fichier
 * recopié dans assets/vendor/ qu'il faudra relire et remettre à jour. Pour la
 * seule chose dont on a besoin — transformer une URL de 70 caractères en carré
 * noir et blanc — deux cent cinquante lignes lisibles valent mieux qu'un pavé
 * minifié de cinquante kilo-octets.
 *
 * Le champ d'application est volontairement étroit : mode octet uniquement,
 * niveau M uniquement, versions 1 à 10. C'est très largement assez pour un lien
 * personnel (version 10 tient 216 octets de données), et ça évite d'avoir à
 * embarquer les tables complètes des quarante versions.
 *
 * L'encodage est vérifié contre l'implémentation de référence python-qrcode :
 * pour un même texte, la matrice produite ici est identique module par module.
 * Voir outils/verifier-qr.py.
 *
 *   const { taille, modules } = genererMatriceQr('https://exemple.fr/…');
 *   modules[y][x] === true  →  module noir
 * ========================================================================== */
(function(global){
  'use strict';

  // Niveau M : le compromis habituel pour un code imprimé — 15 % du symbole
  // peut être abîmé (pli, tache, agrafe) sans empêcher la lecture.
  const NIVEAU_M = 0b00;

  // Par version : [nombre de codets de correction par bloc,
  //                [nombre de blocs du groupe 1, codets de données par bloc],
  //                [nombre de blocs du groupe 2, codets de données par bloc]]
  // Tiré de la table 9 de l'ISO/IEC 18004, colonne « M ».
  const BLOCS_M = {
    1:  [10, [1, 16]],
    2:  [16, [1, 28]],
    3:  [26, [1, 44]],
    4:  [18, [2, 32]],
    5:  [24, [2, 43]],
    6:  [16, [4, 27]],
    7:  [18, [4, 31]],
    8:  [22, [2, 38], [2, 39]],
    9:  [22, [3, 36], [2, 37]],
    10: [26, [4, 43], [1, 44]],
  };

  // Centres des motifs d'alignement, par version.
  const ALIGNEMENTS = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
  };

  function capaciteDonnees(version){
    const def = BLOCS_M[version];
    let n = 0;
    for(let i = 1; i < def.length; i++) n += def[i][0] * def[i][1];
    return n;
  }

  // ---------------------------------------------------------------------------
  // Arithmétique du corps de Galois GF(256), pour la correction Reed-Solomon.
  // ---------------------------------------------------------------------------
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  (function tablesGalois(){
    let x = 1;
    for(let i = 0; i < 255; i++){
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if(x & 0x100) x ^= 0x11D; // polynôme primitif du QR
    }
    for(let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();

  function multiplier(a, b){
    if(a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  // Polynôme générateur de degré n, développé par multiplications successives
  // par (x - α^i).
  function polynomeGenerateur(n){
    let g = [1];
    for(let i = 0; i < n; i++){
      const suivant = new Array(g.length + 1).fill(0);
      for(let j = 0; j < g.length; j++){
        suivant[j] ^= g[j];
        suivant[j + 1] ^= multiplier(g[j], EXP[i]);
      }
      g = suivant;
    }
    return g;
  }

  // Reste de la division du message par le générateur : ce sont les codets de
  // correction.
  function codetsCorrection(donnees, nbCorrection){
    const g = polynomeGenerateur(nbCorrection);
    const reste = new Array(nbCorrection).fill(0);
    for(let i = 0; i < donnees.length; i++){
      const facteur = donnees[i] ^ reste[0];
      reste.shift();
      reste.push(0);
      if(facteur !== 0){
        for(let j = 0; j < nbCorrection; j++){
          reste[j] ^= multiplier(g[j + 1], facteur);
        }
      }
    }
    return reste;
  }

  // ---------------------------------------------------------------------------
  // Codes BCH — format (15,5) et version (18,6).
  // ---------------------------------------------------------------------------
  function bch(valeur, generateur, longueurGenerateur){
    let v = valeur;
    while(bitsUtiles(v) >= longueurGenerateur){
      v ^= generateur << (bitsUtiles(v) - longueurGenerateur);
    }
    return v;
  }
  function bitsUtiles(v){
    let n = 0;
    while(v !== 0){ n++; v >>>= 1; }
    return n;
  }
  function infoFormat(niveau, masque){
    const donnees = (niveau << 3) | masque;
    const reste = bch(donnees << 10, 0b10100110111, 11);
    return ((donnees << 10) | reste) ^ 0b101010000010010;
  }
  function infoVersion(version){
    const reste = bch(version << 12, 0b1111100100101, 13);
    return (version << 12) | reste;
  }

  // ---------------------------------------------------------------------------
  // Mise en flux binaire des données.
  // ---------------------------------------------------------------------------
  function encoderOctets(octets, version){
    const bits = [];
    const pousser = (valeur, longueur)=>{
      for(let i = longueur - 1; i >= 0; i--) bits.push((valeur >>> i) & 1);
    };
    pousser(0b0100, 4);                                   // indicateur mode octet
    pousser(octets.length, version < 10 ? 8 : 16);        // indicateur de longueur
    octets.forEach(o=> pousser(o, 8));

    const capacite = capaciteDonnees(version) * 8;
    // Terminateur, puis alignement sur l'octet.
    for(let i = 0; i < 4 && bits.length < capacite; i++) bits.push(0);
    while(bits.length % 8 !== 0) bits.push(0);

    // Remplissage jusqu'à la capacité, avec les deux octets de bourrage du
    // standard alternés.
    const bourrage = [0b11101100, 0b00010001];
    let k = 0;
    while(bits.length < capacite){
      pousser(bourrage[k % 2], 8);
      k++;
    }

    const codets = [];
    for(let i = 0; i < bits.length; i += 8){
      let octet = 0;
      for(let j = 0; j < 8; j++) octet = (octet << 1) | bits[i + j];
      codets.push(octet);
    }
    return codets;
  }

  // Découpage en blocs, calcul de la correction, puis entrelacement : les codets
  // de tous les blocs sont mêlés pour qu'une salissure locale n'emporte jamais
  // un bloc entier.
  function entrelacer(codets, version){
    const def = BLOCS_M[version];
    const nbCorrection = def[0];
    const blocs = [];
    let curseur = 0;
    for(let g = 1; g < def.length; g++){
      const [nbBlocs, tailleDonnees] = def[g];
      for(let b = 0; b < nbBlocs; b++){
        const donnees = codets.slice(curseur, curseur + tailleDonnees);
        curseur += tailleDonnees;
        blocs.push({ donnees, correction: codetsCorrection(donnees, nbCorrection) });
      }
    }

    const sortie = [];
    const maxDonnees = Math.max(...blocs.map(b=> b.donnees.length));
    for(let i = 0; i < maxDonnees; i++){
      blocs.forEach(b=>{ if(i < b.donnees.length) sortie.push(b.donnees[i]); });
    }
    for(let i = 0; i < nbCorrection; i++){
      blocs.forEach(b=> sortie.push(b.correction[i]));
    }
    return sortie;
  }

  // ---------------------------------------------------------------------------
  // Construction de la matrice.
  // ---------------------------------------------------------------------------
  function matriceVide(taille){
    const m = [];
    for(let i = 0; i < taille; i++) m.push(new Array(taille).fill(null));
    return m;
  }

  function poserMotifsFixes(m, version){
    const taille = m.length;
    const poser = (x, y, v)=>{ if(x >= 0 && y >= 0 && x < taille && y < taille) m[y][x] = v; };

    // Motifs de détection de position, aux trois coins, avec leur séparateur.
    [[0, 0], [taille - 7, 0], [0, taille - 7]].forEach(([ox, oy])=>{
      for(let y = -1; y <= 7; y++){
        for(let x = -1; x <= 7; x++){
          const dansCarre = x >= 0 && x <= 6 && y >= 0 && y <= 6;
          const noir = dansCarre && (x === 0 || x === 6 || y === 0 || y === 6 ||
                                     (x >= 2 && x <= 4 && y >= 2 && y <= 4));
          poser(ox + x, oy + y, noir);
        }
      }
    });

    // Motifs de synchronisation.
    for(let i = 8; i < taille - 8; i++){
      m[6][i] = i % 2 === 0;
      m[i][6] = i % 2 === 0;
    }

    // Motifs d'alignement — sauf là où ils chevaucheraient un motif de position.
    const centres = ALIGNEMENTS[version];
    centres.forEach(cy=> centres.forEach(cx=>{
      const coinHautGauche = cx <= 8 && cy <= 8;
      const coinHautDroit = cx >= taille - 9 && cy <= 8;
      const coinBasGauche = cx <= 8 && cy >= taille - 9;
      if(coinHautGauche || coinHautDroit || coinBasGauche) return;
      for(let y = -2; y <= 2; y++){
        for(let x = -2; x <= 2; x++){
          m[cy + y][cx + x] = Math.max(Math.abs(x), Math.abs(y)) !== 1;
        }
      }
    }));

    // Module toujours noir, sous le motif de position bas-gauche.
    m[taille - 8][8] = true;

    // Emplacements réservés à l'information de format : marqués occupés pour
    // que le placement des données les évite, remplis plus tard.
    for(let i = 0; i < 9; i++){
      if(m[8][i] === null) m[8][i] = false;
      if(m[i][8] === null) m[i][8] = false;
    }
    for(let i = 0; i < 8; i++){
      if(m[8][taille - 1 - i] === null) m[8][taille - 1 - i] = false;
      if(m[taille - 1 - i][8] === null) m[taille - 1 - i][8] = false;
    }

    // Information de version, à partir de la version 7.
    if(version >= 7){
      const bits = infoVersion(version);
      for(let i = 0; i < 18; i++){
        const bit = ((bits >>> i) & 1) === 1;
        m[Math.floor(i / 3)][taille - 11 + (i % 3)] = bit;
        m[taille - 11 + (i % 3)][Math.floor(i / 3)] = bit;
      }
    }
  }

  // Le parcours en zigzag du standard : deux colonnes à la fois, de droite à
  // gauche, en alternant montée et descente, en sautant la colonne 6 qui porte
  // le motif de synchronisation.
  function placerDonnees(m, reserve, codets){
    const taille = m.length;
    let bit = 0;
    const total = codets.length * 8;
    let montant = true;
    for(let colonneDroite = taille - 1; colonneDroite > 0; colonneDroite -= 2){
      if(colonneDroite === 6) colonneDroite = 5;
      for(let pas = 0; pas < taille; pas++){
        const y = montant ? taille - 1 - pas : pas;
        for(let d = 0; d < 2; d++){
          const x = colonneDroite - d;
          if(reserve[y][x]) continue;
          let valeur = false;
          if(bit < total){
            valeur = ((codets[bit >>> 3] >>> (7 - (bit & 7))) & 1) === 1;
            bit++;
          }
          m[y][x] = valeur;
        }
      }
      montant = !montant;
    }
  }

  const MASQUES = [
    (x, y)=> (x + y) % 2 === 0,
    (x, y)=> y % 2 === 0,
    (x, y)=> x % 3 === 0,
    (x, y)=> (x + y) % 3 === 0,
    (x, y)=> (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
    (x, y)=> ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y)=> (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y)=> (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];

  // Les quatre pénalités du standard : elles départagent les huit masques, et
  // écartent les motifs qui gêneraient un lecteur (longues plages, carrés unis,
  // faux motifs de position, déséquilibre noir/blanc).
  function penalite(m){
    const taille = m.length;
    let score = 0;

    const plage = (lire)=>{
      for(let a = 0; a < taille; a++){
        let compte = 1;
        for(let b = 1; b < taille; b++){
          if(lire(a, b) === lire(a, b - 1)) compte++;
          else { if(compte >= 5) score += 3 + (compte - 5); compte = 1; }
        }
        if(compte >= 5) score += 3 + (compte - 5);
      }
    };
    plage((y, x)=> m[y][x]);
    plage((x, y)=> m[y][x]);

    for(let y = 0; y < taille - 1; y++){
      for(let x = 0; x < taille - 1; x++){
        const v = m[y][x];
        if(v === m[y][x + 1] && v === m[y + 1][x] && v === m[y + 1][x + 1]) score += 3;
      }
    }

    const motif = [true, false, true, true, true, false, true, false, false, false, false];
    const motifInverse = motif.slice().reverse();
    const correspond = (lire, a, b, reference)=>{
      for(let i = 0; i < reference.length; i++){
        if(lire(a, b + i) !== reference[i]) return false;
      }
      return true;
    };
    [(y, x)=> m[y][x], (x, y)=> m[y][x]].forEach((lire, sens)=>{
      for(let a = 0; a < taille; a++){
        for(let b = 0; b <= taille - motif.length; b++){
          if(correspond(lire, a, b, motif)) score += 40;
          if(correspond(lire, a, b, motifInverse)) score += 40;
        }
      }
      void sens;
    });

    let noirs = 0;
    m.forEach(ligne=> ligne.forEach(v=>{ if(v) noirs++; }));
    const pourcent = (noirs * 100) / (taille * taille);
    score += Math.floor(Math.abs(pourcent - 50) / 5) * 10;
    return score;
  }

  // Les quinze bits de format se lisent du plus significatif au moins
  // significatif : le rang j du parcours porte le bit 14 - j. Ils sont écrits
  // deux fois, pour qu'un coin abîmé ne rende pas le symbole illisible.
  function poserFormat(m, masque){
    const taille = m.length;
    const valeur = infoFormat(NIVEAU_M, masque);
    for(let j = 0; j < 15; j++){
      const bit = ((valeur >>> (14 - j)) & 1) === 1;

      // Première copie, autour du motif de position haut-gauche : la rangée 8
      // de gauche à droite, puis la colonne 8 de bas en haut, en enjambant la
      // rangée et la colonne 6 qui portent les motifs de synchronisation.
      if(j <= 5) m[8][j] = bit;
      else if(j === 6) m[8][7] = bit;
      else if(j === 7) m[8][8] = bit;
      else if(j === 8) m[7][8] = bit;
      else m[14 - j][8] = bit;

      // Seconde copie : sept modules en colonne sous le motif bas-gauche — le
      // huitième est le module toujours noir, qu'on ne touche pas — puis huit
      // modules en rangée à gauche du motif haut-droit.
      if(j <= 6) m[taille - 1 - j][8] = bit;
      else m[8][taille - 15 + j] = bit;
    }
  }

  function genererMatriceQr(texte){
    const octets = Array.from(new TextEncoder().encode(String(texte)));

    let version = 0;
    for(let v = 1; v <= 10; v++){
      // 4 bits de mode, 8 ou 16 bits de longueur, puis les octets.
      const entete = 4 + (v < 10 ? 8 : 16);
      if(entete + octets.length * 8 <= capaciteDonnees(v) * 8){ version = v; break; }
    }
    if(!version) throw new Error('Texte trop long pour un QR de version 10 en niveau M.');

    const taille = version * 4 + 17;
    const codets = entrelacer(encoderOctets(octets, version), version);

    // La réserve garde la trace des modules occupés par les motifs fixes : le
    // parcours des données doit les enjamber.
    const base = matriceVide(taille);
    poserMotifsFixes(base, version);
    const reserve = base.map(ligne=> ligne.map(v=> v !== null));

    let meilleure = null, meilleurScore = Infinity;
    for(let masque = 0; masque < 8; masque++){
      const essai = base.map(ligne=> ligne.slice());
      placerDonnees(essai, reserve, codets);
      for(let y = 0; y < taille; y++){
        for(let x = 0; x < taille; x++){
          if(!reserve[y][x] && MASQUES[masque](x, y)) essai[y][x] = !essai[y][x];
        }
      }
      poserFormat(essai, masque);
      const score = penalite(essai);
      if(score < meilleurScore){ meilleurScore = score; meilleure = essai; }
    }

    return { taille, version, modules: meilleure };
  }

  global.genererMatriceQr = genererMatriceQr;
})(typeof window !== 'undefined' ? window : globalThis);
