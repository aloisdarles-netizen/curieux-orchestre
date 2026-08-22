/* ============================================================================
 * Studio — script à coller dans le tableur Google des réservations.
 *
 * Le tableur reste LA source de vérité : d'autres loueurs y écrivent, le
 * studio le tient. Ce script l'expose en petite API JSON pour le site :
 *   - GET  : les jours à venir avec leurs trois créneaux (Option 1 seulement —
 *            les options 2 et 3 ne servent jamais, elles restent ignorées).
 *   - POST : réserver un créneau vacant au nom « Curieux & Friends », ou
 *            annuler une réservation qui porte déjà ce nom (et aucune autre).
 *
 * MISE EN PLACE (une fois, ~5 minutes) :
 *   1. Ouvre le tableur → Extensions → Apps Script.
 *   2. Colle tout ce fichier à la place du contenu par défaut, Enregistre.
 *   3. Roue dentée (Paramètres du projet) → Propriétés du script → ajoute
 *      une propriété nommée SECRET avec une longue valeur aléatoire.
 *      (garde-la : c'est la même à mettre dans Vercel sous STUDIO_SECRET)
 *   4. Déployer → Nouveau déploiement → type « Application Web » :
 *        - Exécuter en tant que : MOI
 *        - Qui a accès : TOUT LE MONDE
 *      → Copie l'URL /exec obtenue (à mettre dans Vercel sous APPS_SCRIPT_URL).
 *   5. À la première exécution, Google demande d'autoriser le script sur ce
 *      tableur : accepte (c'est ton propre compte).
 *
 * Le secret ne circule qu'entre Vercel et ce script : la page du site parle à
 * /api/studio, qui le rajoute côté serveur. Personne ne peut écrire dans le
 * tableur en appelant l'URL /exec sans lui.
 *
 * Colonnes attendues (feuille d'onglet gid=0) :
 *   A lettre du mois · B jour (Lu…) · C date (dd/MM/yy) ·
 *   D nom · E statut · F remarques   (8h30-13h30)
 *   G nom · H statut · I remarques   (13h30-18h30)
 *   J nom · K statut · L remarques   (18h30-21h30)
 *   M… options 2 et 3 — jamais touchées.
 * ========================================================================== */

var NOM_RESERVATION = 'Curieux & Friends';
var CRENEAUX = [
  { cle: 'matin', libelle: '8h30 – 13h30', col: 4 },
  { cle: 'apresmidi', libelle: '13h30 – 18h30', col: 7 },
  { cle: 'soir', libelle: '18h30 – 21h30', col: 10 },
];

function feuille_() {
  var classeur = SpreadsheetApp.getActiveSpreadsheet();
  var feuilles = classeur.getSheets();
  for (var i = 0; i < feuilles.length; i++) {
    if (feuilles[i].getSheetId() === 0) return feuilles[i];
  }
  return feuilles[0];
}

// La date de la colonne C, en ISO — qu'elle soit une vraie date ou du texte
// « 22/08/25 ». Rend null pour les lignes d'en-tête ou vides.
function dateIso_(v) {
  if (v instanceof Date && !isNaN(v)) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var m = String(v || '').match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if (!m) return null;
  var an = m[3].length === 2 ? '20' + m[3] : m[3];
  return an + '-' + m[2] + '-' + m[1];
}

function estVacant_(nom) {
  var n = String(nom || '').trim().toLowerCase();
  return n === '' || n === 'vacant';
}

function reponse_(objet) {
  return ContentService.createTextOutput(JSON.stringify(objet))
    .setMimeType(ContentService.MimeType.JSON);
}

/* GET ?de=2026-08-22&jours=60 — l'état des créneaux, jour par jour. */
function doGet(e) {
  var p = (e && e.parameter) || {};
  var de = p.de || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var nbJours = Math.max(1, Math.min(180, parseInt(p.jours, 10) || 60));
  var jusqua = new Date(de + 'T12:00:00');
  jusqua.setDate(jusqua.getDate() + nbJours);
  var jusquaIso = Utilities.formatDate(jusqua, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  var f = feuille_();
  var valeurs = f.getRange(1, 1, f.getLastRow(), 12).getValues();
  var jours = [];
  for (var i = 0; i < valeurs.length; i++) {
    var iso = dateIso_(valeurs[i][2]);
    if (!iso || iso < de || iso >= jusquaIso) continue;
    var creneaux = [];
    for (var c = 0; c < CRENEAUX.length; c++) {
      var col = CRENEAUX[c].col - 1;
      var nom = String(valeurs[i][col] || '').trim();
      creneaux.push({
        cle: CRENEAUX[c].cle,
        libelle: CRENEAUX[c].libelle,
        nom: estVacant_(nom) ? '' : nom,
        statut: String(valeurs[i][col + 1] || '').trim(),
        remarque: String(valeurs[i][col + 2] || '').trim(),
      });
    }
    jours.push({ date: iso, jour: String(valeurs[i][1] || '').trim(), creneaux: creneaux });
  }
  return reponse_({ ok: true, jours: jours });
}

/* POST {secret, action:'reserver'|'annuler', date:'2026-08-25', creneau:'matin',
 *       remarque:'…'} — écrit dans la feuille, sous verrou pour éviter que deux
 * réservations simultanées ne se marchent dessus. */
function doPost(e) {
  var corps;
  try { corps = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return reponse_({ ok: false, raison: 'corps illisible' }); }

  var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (!secret || corps.secret !== secret) {
    return reponse_({ ok: false, raison: 'refusé' });
  }

  var creneau = null;
  for (var c = 0; c < CRENEAUX.length; c++) {
    if (CRENEAUX[c].cle === corps.creneau) creneau = CRENEAUX[c];
  }
  if (!creneau || !/^\d{4}-\d{2}-\d{2}$/.test(String(corps.date || ''))) {
    return reponse_({ ok: false, raison: 'demande incomplète' });
  }

  var verrou = LockService.getScriptLock();
  verrou.waitLock(10000);
  try {
    var f = feuille_();
    var valeurs = f.getRange(1, 3, f.getLastRow(), 1).getValues();
    var ligne = -1;
    for (var i = 0; i < valeurs.length; i++) {
      if (dateIso_(valeurs[i][0]) === corps.date) { ligne = i + 1; break; }
    }
    if (ligne === -1) return reponse_({ ok: false, raison: 'date absente du tableur' });

    var nomActuel = String(f.getRange(ligne, creneau.col).getValue() || '').trim();

    if (corps.action === 'annuler') {
      if (nomActuel !== NOM_RESERVATION) {
        return reponse_({ ok: false, raison: 'pas notre réservation', par: nomActuel });
      }
      f.getRange(ligne, creneau.col, 1, 3).setValues([['Vacant', 'Vacant', '']]);
      return reponse_({ ok: true });
    }

    // Réservation : uniquement si le créneau est réellement vacant — le
    // tableur peut avoir bougé entre l'affichage et le clic.
    if (!estVacant_(nomActuel)) {
      return reponse_({ ok: false, raison: 'déjà pris', par: nomActuel });
    }
    f.getRange(ligne, creneau.col, 1, 3).setValues([[
      NOM_RESERVATION, 'Confirmé', String(corps.remarque || '').slice(0, 200),
    ]]);
    return reponse_({ ok: true });
  } finally {
    verrou.releaseLock();
  }
}
