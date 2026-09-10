/* ============================================================================
   L'agenda d'une personne, au format que tous les calendriers savent lire
   ============================================================================
   Les dates validées vivaient dans une page web. Pour les avoir dans son
   téléphone, il fallait les recopier une par une — et recommencer à chaque
   changement de salle, à chaque date ajoutée, à chaque annulation. Personne ne
   le faisait deux fois : les musicien·nes gardaient leur propre liste, qui
   divergeait de la nôtre dès la première semaine.

   POURQUOI UN ABONNEMENT ET PAS UN FICHIER

   La demande était : « ajouter les dates validées à l'agenda, et vérifier
   qu'elles n'y sont pas déjà ». Aucune page web ne peut LIRE l'agenda de
   quelqu'un — le navigateur ne le permet pas, et c'est heureux. Un fichier
   .ics téléchargé ne peut donc rien vérifier : il pose des événements, et
   c'est au calendrier de deviner s'il les connaît déjà.

   Un calendrier ABONNÉ règle la question autrement, et mieux : ce n'est plus
   une copie qu'on importe, c'est une source que le téléphone relit tout seul,
   plusieurs fois par jour. Une date ajoutée apparaît. Une salle qui change se
   corrige. Une date annulée disparaît. Il ne peut pas y avoir de doublon,
   puisqu'il n'y a jamais eu qu'une seule liste.

   Le fichier téléchargé reste proposé sur la page, pour qui préfère. Ses
   événements portent alors un UID stable (l'identifiant de la date en base) :
   réimporter le même fichier met à jour les événements existants au lieu d'en
   créer de nouveaux, dans tous les calendriers qui respectent la norme. C'est
   le mieux qu'un fichier puisse faire — d'où l'abonnement mis en avant.

   CE QU'ON PUBLIE, ET CE QU'ON NE PUBLIE PAS

   Uniquement les dates VALIDÉES où la personne est distribuée. Ni les options
   — rien n'est signé, et une option dans un agenda se lit comme un engagement
   —, ni les dates à l'étude, ni celles où elle est seulement sollicitée. Un
   agenda dit « je ne suis pas libre » : il ne doit contenir que ce qui est
   vrai.

   SÉCURITÉ

   Le jeton est déjà l'identité de ces pages : mes_dates() est une fonction
   « security definer » ouverte au rôle anonyme, et le lien personnel donne
   accès aux mêmes données depuis le navigateur. Ce point d'entrée n'expose
   donc rien de plus — il remet en forme ce que la personne peut déjà lire.
   Le jeton est validé avant tout appel, et la réponse ne porte ni téléphone,
   ni e-mail, ni la moindre coordonnée.

   Appel : /api/agenda?jeton=<jeton>       (et webcal://…/api/agenda?jeton=…)
============================================================================ */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nffqcvysweidquouulzs.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_-QZnJEZi01-5fjkjv_2SPw_wODqHcJQ';

// Même règle que partout : les jetons de l'app sont alphanumériques. Tout le
// reste est refusé plutôt que transmis à la base.
const JETON_VALIDE = /^[A-Za-z0-9_-]{1,128}$/;

// Le domaine qui sert de suffixe aux UID. Ce n'est pas une adresse à joindre,
// c'est ce que la norme appelle un « domaine de confiance » : il rend l'UID
// unique au monde, et il doit rester STABLE — le changer ferait perdre à tous
// les calendriers le lien avec les événements déjà posés.
const DOMAINE_UID = 'lessoudaines.fr';

/* Une valeur d'ICS ne contient jamais de retour à la ligne nu, et la
   virgule, le point-virgule et la contre-oblique s'y échappent. Sans cela une
   salle nommée « Cité de la musique, Paris » coupe la ligne en deux et le
   fichier entier devient illisible. */
function texte(v) {
  return String(v == null ? '' : v)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/* La norme plie les lignes à 75 octets, la suite préfixée d'une espace. Les
   noms de salles accentués dépassent vite, et un pliage au milieu d'un
   caractère UTF-8 produit un fichier corrompu : on compte donc en octets et on
   ne coupe jamais une séquence multi-octets. */
function plier(ligne) {
  const octets = Buffer.from(ligne, 'utf8');
  if (octets.length <= 75) return ligne;
  const morceaux = [];
  let debut = 0;
  let limite = 75;
  while (debut < octets.length) {
    let fin = Math.min(debut + limite, octets.length);
    // Reculer tant qu'on est au milieu d'un caractère (octet de continuation).
    while (fin > debut && fin < octets.length && (octets[fin] & 0xc0) === 0x80) fin--;
    morceaux.push(octets.slice(debut, fin).toString('utf8'));
    debut = fin;
    limite = 74; // les lignes suivantes portent une espace en tête
  }
  return morceaux.join('\r\n ');
}

function horodatage(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/* Le numéro de révision d'un événement. La norme veut qu'il CROISSE pour
   qu'une mise à jour soit prise en compte : un condensé du contenu, qui varie
   sans jamais croître, ferait ignorer la moitié des corrections. On compte
   donc les jours écoulés depuis une origine fixe. Deux exports le même jour
   donnent le même numéro — donc aucun remaniement inutile ; un export plus
   tard en donne un plus grand, et la salle corrigée s'applique. */
const ORIGINE = Date.UTC(2020, 0, 1);
function revision(maintenant) {
  return Math.floor((maintenant.getTime() - ORIGINE) / 86400000);
}

// Le lendemain, en date pure : DTEND d'un événement d'une journée est exclusif.
function lendemain(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function construireIcs(charge, maintenant) {
  const dates = Array.isArray(charge && charge.dates) ? charge.dates : [];
  const rev = revision(maintenant);
  const stamp = horodatage(maintenant);

  const retenues = dates.filter((d) =>
    d && d.statut === 'validee' && d.affecte === true && /^\d{4}-\d{2}-\d{2}$/.test(d.date || ''));

  const lignes = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Curieux orchestre//Mes dates//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    // Le nom que porte le calendrier une fois abonné, chez Apple comme chez
    // Google. Sans lui, il s'appelle par son adresse.
    'X-WR-CALNAME:Curieux orchestre',
    'X-WR-CALDESC:Les dates validées où tu joues. Mise à jour automatique.',
    // À quelle fréquence le téléphone revient lire. Une heure : une date
    // annulée le matin est partie de l'agenda avant midi.
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ];

  retenues.forEach((d) => {
    const projet = (d.tourneeNom || '').trim() || 'Curieux orchestre';
    const ville = (d.ville || '').trim();
    const lieu = (d.lieu || '').trim();
    const ou = [lieu, ville].filter(Boolean).join(', ');
    lignes.push(
      'BEGIN:VEVENT',
      // L'identifiant de la date en base : il ne bouge pas, donc un
      // réimport retrouve l'événement au lieu d'en poser un second.
      `UID:curieux-${texte(d.dateId || d.date)}@${DOMAINE_UID}`,
      `DTSTAMP:${stamp}`,
      `SEQUENCE:${rev}`,
      `DTSTART;VALUE=DATE:${String(d.date).replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${lendemain(d.date)}`,
      `SUMMARY:${texte(projet + (ville ? ' · ' + ville : ''))}`,
      ou ? `LOCATION:${texte(ou)}` : null,
      `DESCRIPTION:${texte(
        'Date validée — Curieux orchestre.\n' +
        'Cette page suit le projet au jour le jour ; seul le contrat d\'engagement vaut engagement.'
      )}`,
      'STATUS:CONFIRMED',
      // La journée compte comme occupée : c'est tout l'intérêt de la mettre là.
      'TRANSP:OPAQUE',
      'END:VEVENT'
    );
  });

  lignes.push('END:VCALENDAR');
  return lignes.filter(Boolean).map(plier).join('\r\n') + '\r\n';
}

export default async function handler(req, res) {
  const params = new URL(req.url, `https://${req.headers.host || 'localhost'}`).searchParams;
  const jeton = params.get('jeton') || params.get('token') || '';

  if (!JETON_VALIDE.test(jeton)) {
    res.status(400).json({ erreur: 'Jeton invalide.' });
    return;
  }

  let charge = null;
  try {
    const rep = await fetch(`${SUPABASE_URL}/rest/v1/rpc/mes_dates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ p_token: jeton }),
    });
    if (rep.ok) charge = await rep.json();
  } catch (e) {
    charge = null;
  }

  /* Un jeton révoqué, ou une base injoignable : on rend un calendrier VIDE et
     non une erreur. Un calendrier abonné qui répond 500 fait afficher une
     alerte au téléphone à chaque relève — plusieurs fois par jour, pour rien.
     Vide, il se tait ; et si le jeton revit, les dates reviennent seules. */
  const ics = construireIcs(charge && !charge.migrationAbsente ? charge : { dates: [] }, new Date());

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="curieux-mes-dates.ics"');
  // Une heure de cache, la même durée que celle annoncée dans le calendrier.
  res.setHeader('Cache-Control', 'public, max-age=3600');
  // Des dates personnelles : aucun intermédiaire n'a à les indexer.
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.status(200).send(ics);
}
