/* ============================================================================
   zip.js — assembler une archive dans le navigateur, sans dépendance.
   ============================================================================
   Un bibliothécaire d'orchestre qui reçoit trente-deux parties ne veut pas
   trente-deux téléchargements : il veut un dossier. Sans archive, le navigateur
   déclenche trente-deux enregistrements successifs, demande l'autorisation des
   « téléchargements multiples » au troisième, et laisse trente-deux fichiers en
   vrac dans un dossier Téléchargements qui en contient déjà cent.

   POURQUOI CÔTÉ NAVIGATEUR, ET NON CÔTÉ SERVEUR
   ---------------------------------------------
   Parce que chaque partition doit être filigranée UNE À UNE au moment où elle
   part — c'est la règle du dispositif, et elle ne se négocie pas. Un lot de
   trente-deux parties filigranées, c'est trente-deux passages de pdf-lib :
   plusieurs dizaines de secondes de calcul et près de cent mégaoctets en
   mémoire. Une fonction Vercel est plafonnée à 60 secondes et sa RÉPONSE à
   4,5 Mo — l'archive n'y tiendrait ni en temps ni en taille. Le navigateur du
   destinataire, lui, a tout son temps : il récupère les exemplaires un par un
   (chacun filigrané et journalisé par /api/partition, exactement comme pour un
   musicien) et les range lui-même. Aucune règle n'est contournée, aucun
   plafond n'est approché, et un échec en cours de route laisse les fichiers
   déjà pris téléchargeables un par un.

   POURQUOI LA MÉTHODE « STORE » (AUCUNE COMPRESSION)
   -------------------------------------------------
   Un PDF est déjà compressé : les flux de contenu sont en Flate. Repasser
   deflate dessus gagne 1 à 2 % pour un coût de calcul réel sur une machine
   modeste. On empile donc les fichiers tels quels — ce qui rend ce fichier
   court, lisible et sans dépendance, là où une bibliothèque tierce pèserait
   cent kilo-octets et une entrée de plus dans la politique de sécurité.

   Le format écrit ici est le ZIP classique (APPNOTE 6.3.x, sans ZIP64) : il
   plafonne à 4 Go par archive et 65 535 entrées. Un matériel d'orchestre
   complet pèse quelques dizaines de mégaoctets pour quelques dizaines de
   parties — deux ordres de grandeur en dessous.
   ========================================================================== */

const CurieuxZip = (function(){

  /* La table CRC-32 (polynôme 0xEDB88320), calculée une fois au premier
     appel. Sans elle, le calcul bit à bit est huit fois plus lent — sensible
     sur cent mégaoctets. */
  let TABLE = null;
  function table(){
    if(TABLE) return TABLE;
    TABLE = new Uint32Array(256);
    for(let i = 0; i < 256; i++){
      let c = i;
      for(let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      TABLE[i] = c >>> 0;
    }
    return TABLE;
  }

  function crc32(octets){
    const t = table();
    let c = 0xFFFFFFFF;
    for(let i = 0; i < octets.length; i++) c = t[(c ^ octets[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* La date MS-DOS, en deux mots de 16 bits. Elle ne porte ni fuseau ni
     secondes impaires (le champ des secondes compte par pas de deux) : c'est
     le format, et personne ne lit l'heure d'un fichier dans une archive de
     partitions. Antérieure à 1980, elle n'est pas représentable — on borne. */
  function dateDos(d){
    const an = Math.max(1980, d.getFullYear());
    return {
      date: ((an - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
      heure: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    };
  }

  /* Un nom de fichier acceptable dans une archive, sur les trois systèmes.
     Les caractères interdits de Windows sont les plus restrictifs : on s'aligne
     dessus, sinon l'archive s'ouvre mais refuse de s'extraire. */
  function nomPropre(nom){
    return String(nom || 'fichier')
      .replace(/[\\/:*?"<>|\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'fichier';
  }

  /* Deux parties peuvent porter le même nom — « Violon 1 » déposé deux fois,
     une version corrigée rangée à côté de l'ancienne. Un doublon dans une
     archive s'extrait en écrasant silencieusement le premier : on numérote. */
  function deduplique(noms){
    const vus = new Map();
    return noms.map(n => {
      const cle = n.toLowerCase();
      if(!vus.has(cle)){ vus.set(cle, 1); return n; }
      const rang = vus.get(cle) + 1;
      vus.set(cle, rang);
      const point = n.lastIndexOf('.');
      return point > 0 ? `${n.slice(0, point)} (${rang})${n.slice(point)}` : `${n} (${rang})`;
    });
  }

  /* entrees : [{ nom: 'Violon 1.pdf', octets: Uint8Array | ArrayBuffer }]
     Rend un Blob prêt à être enregistré. */
  function creer(entrees){
    const liste = (entrees || []).map(e => ({
      nom: nomPropre(e.nom),
      octets: e.octets instanceof Uint8Array ? e.octets : new Uint8Array(e.octets),
    }));
    if(liste.length > 65535) throw new Error('Trop de fichiers pour une seule archive.');

    const noms = deduplique(liste.map(e => e.nom));
    const encodeur = new TextEncoder();
    const prepare = liste.map((e, i) => {
      const nomOctets = encodeur.encode(noms[i]);
      return { nomOctets, octets: e.octets, crc: crc32(e.octets) };
    });

    const { date, heure } = dateDos(new Date());

    const tailleLocaux = prepare.reduce((s, e) => s + 30 + e.nomOctets.length + e.octets.length, 0);
    const tailleCentral = prepare.reduce((s, e) => s + 46 + e.nomOctets.length, 0);
    const tampon = new ArrayBuffer(tailleLocaux + tailleCentral + 22);
    const vue = new DataView(tampon);
    const octets = new Uint8Array(tampon);

    let pos = 0;
    const u16 = (v)=>{ vue.setUint16(pos, v, true); pos += 2; };
    const u32 = (v)=>{ vue.setUint32(pos, v >>> 0, true); pos += 4; };

    // --- Les en-têtes locaux, chacun suivi de son fichier ------------------
    prepare.forEach(e => {
      e.offset = pos;
      u32(0x04034B50);
      u16(20);            // version minimale pour extraire : 2.0
      u16(0x0800);        // drapeau 11 : le nom est en UTF-8 (les accents)
      u16(0);             // méthode 0 : stocké tel quel
      u16(heure); u16(date);
      u32(e.crc);
      u32(e.octets.length); u32(e.octets.length);
      u16(e.nomOctets.length); u16(0);
      octets.set(e.nomOctets, pos); pos += e.nomOctets.length;
      octets.set(e.octets, pos); pos += e.octets.length;
    });

    // --- Le répertoire central ---------------------------------------------
    const debutCentral = pos;
    prepare.forEach(e => {
      u32(0x02014B50);
      u16(20);            // version de l'outil qui a écrit
      u16(20);            // version minimale pour extraire
      u16(0x0800);
      u16(0);
      u16(heure); u16(date);
      u32(e.crc);
      u32(e.octets.length); u32(e.octets.length);
      u16(e.nomOctets.length); u16(0); u16(0);   // nom, extra, commentaire
      u16(0);             // disque d'origine
      u16(0);             // attributs internes
      u32(0);             // attributs externes
      u32(e.offset);
      octets.set(e.nomOctets, pos); pos += e.nomOctets.length;
    });

    // --- La fin du répertoire central --------------------------------------
    // La taille du répertoire se retient AVANT d'écrire ce bloc : `pos` avance
    // à chaque champ posé, et la calculer en cours d'écriture donnerait une
    // taille trop grande de vingt-deux octets — une archive que rien n'ouvre.
    const finCentral = pos;
    u32(0x06054B50);
    u16(0); u16(0);
    u16(prepare.length); u16(prepare.length);
    u32(finCentral - debutCentral);
    u32(debutCentral);
    u16(0);

    return new Blob([tampon], { type: 'application/zip' });
  }

  /* Enregistrer un Blob sous un nom donné. L'URL d'objet est révoquée après
     coup : sans cela, cent mégaoctets restent en mémoire tant que l'onglet
     est ouvert — et un bibliothécaire garde son onglet ouvert toute la
     matinée. */
  function enregistrer(blob, nom){
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomPropre(nom);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=> URL.revokeObjectURL(url), 60000);
  }

  return { creer, enregistrer, crc32 };
})();

if(typeof window !== 'undefined') window.CurieuxZip = CurieuxZip;
