// Analyse une fiche technique de salle (PDF ou image) avec Claude et renvoie
// les champs extraits + les points d'attention. La clé API reste ici, côté
// serveur : elle n'est jamais envoyée au navigateur.
//
// Variable d'environnement requise sur Vercel : ANTHROPIC_API_KEY

import Anthropic from '@anthropic-ai/sdk';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nffqcvysweidquouulzs.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_-QZnJEZi01-5fjkjv_2SPw_wODqHcJQ';

// 60 s est la limite acceptée par tous les plans Vercel ; au-delà, c'est le
// déploiement entier du site qui échoue, pas seulement cette fonction.
export const config = { maxDuration: 60 };

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['salle', 'scene', 'electricite', 'acces', 'contacts', 'horaires', 'points_attention'],
  properties: {
    salle: {
      type: 'object',
      additionalProperties: false,
      required: ['nom', 'ville', 'adresse'],
      properties: {
        nom: { type: 'string', description: "Nom de la salle, chaîne vide si absent" },
        ville: { type: 'string' },
        adresse: { type: 'string' }
      }
    },
    scene: {
      type: 'object',
      additionalProperties: false,
      required: ['hauteur_grill', 'ouverture_scene', 'profondeur_scene', 'charge_max_accroche', 'type_sol'],
      properties: {
        hauteur_grill: { type: 'string', description: "Hauteur sous grill avec l'unité, ex: '14 m'. Chaîne vide si absent." },
        ouverture_scene: { type: 'string', description: "Ouverture de scène (largeur au cadre), ex: '12 m'." },
        profondeur_scene: { type: 'string', description: "Profondeur de scène, ex: '10 m'." },
        charge_max_accroche: { type: 'string', description: "Charge max admissible à l'accroche, ex: '500 kg / point' ou '3 t réparties'." },
        type_sol: { type: 'string', description: "Nature du plateau, ex: 'parquet sur lambourdes', 'béton'." }
      }
    },
    electricite: {
      type: 'object',
      additionalProperties: false,
      required: ['puissance', 'type_courant'],
      properties: {
        puissance: { type: 'string', description: "Puissance disponible avec l'unité, ex: '400 A' ou '250 kVA'. Si plusieurs arrivées, les lister séparées par ' / '." },
        type_courant: { type: 'string', description: "Ex: 'Tri 400V + N + T', 'Mono 230V'." }
      }
    },
    acces: {
      type: 'object',
      additionalProperties: false,
      required: ['nombre_semis_simultanees', 'niveau_dechargement', 'notes'],
      properties: {
        nombre_semis_simultanees: { type: 'string', description: "Nombre de semi-remorques déchargeables en même temps, en chiffres ('2'). Chaîne vide si non précisé." },
        niveau_dechargement: {
          type: 'string',
          enum: ['inconnu', 'scene', 'sol', 'les_deux'],
          description: "'scene' = déchargement de plain-pied au niveau du plateau, 'sol' = au niveau du sol/rue, 'les_deux' si les deux existent, 'inconnu' si le document ne le dit pas."
        },
        notes: { type: 'string', description: "Contraintes d'accès en clair : quai, hauteur de porte, marches, gabarit, distance de portage, stationnement des semis, autorisation de circulation." }
      }
    },
    contacts: {
      type: 'array',
      description: "Contacts techniques de la salle mentionnés dans le document.",
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nom', 'role', 'tel', 'email'],
        properties: {
          nom: { type: 'string' },
          role: { type: 'string', description: "Ex: 'Régisseur général', 'Directeur technique'." },
          tel: { type: 'string' },
          email: { type: 'string' }
        }
      }
    },
    horaires: {
      type: 'array',
      description: "Repères horaires de la journée trouvés dans le document (load in, get in, balances, ouverture des portes…). Vide si le document n'en donne pas.",
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'heure'],
        properties: {
          label: { type: 'string' },
          heure: { type: 'string', description: "Format HH:MM." }
        }
      }
    },
    points_attention: {
      type: 'array',
      description: "Ce qu'une direction technique doit savoir : contraintes inhabituelles, interdictions, coûts cachés, et surtout les informations importantes ABSENTES du document.",
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['niveau', 'libelle', 'detail'],
        properties: {
          niveau: {
            type: 'string',
            enum: ['manquant', 'attention', 'info'],
            description: "'manquant' = information essentielle absente du document ; 'attention' = contrainte ou risque à anticiper ; 'info' = utile à savoir."
          },
          libelle: { type: 'string', description: "Une phrase courte." },
          detail: { type: 'string', description: "Précision, avec la citation ou la page du document quand c'est pertinent." }
        }
      }
    }
  }
};

const SYSTEM = `Tu assistes la direction technique d'un orchestre en tournée. On te donne la fiche technique d'une salle de spectacle et tu en extrais les informations utiles au montage.

Règles :
- N'invente jamais. Si le document ne donne pas une information, laisse la chaîne vide (ou le tableau vide) plutôt que de deviner.
- Recopie les valeurs telles qu'elles figurent, unités comprises. Ne convertis pas.
- Quand une information existe sous plusieurs formes contradictoires dans le document, retiens la plus précise et signale la contradiction dans points_attention.
- points_attention est la partie la plus importante : signale systématiquement les informations essentielles ABSENTES (niveau 'manquant'). Pour un montage d'orchestre, les essentielles sont : puissance électrique et type de courant, hauteur sous grill, charge admissible à l'accroche, conditions de déchargement des semis, et un contact technique joignable.
- Signale aussi (niveau 'attention') tout ce qui coûte cher ou bloque : interdiction d'accroche, plateau non praticable, portage long, créneau de déchargement imposé, personnel de la salle obligatoire, ascenseur unique, restrictions de circulation.
- Rédige en français.`;

function lireCorps(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let brut = '';
    req.on('data', (c) => { brut += c; });
    req.on('end', () => {
      try { resolve(brut ? JSON.parse(brut) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// Le jeton Supabase de l'utilisateur sert à la fois de preuve d'identité et de
// contrôle d'accès : la RPC ne renvoie true que pour les comptes autorisés en
// direction technique. Sans ça, l'endpoint consommerait des crédits pour
// n'importe qui connaissant l'URL.
async function accesAutorise(jeton) {
  const rep = await fetch(`${SUPABASE_URL}/rest/v1/rpc/has_direction_technique_access`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${jeton}`
    },
    body: '{}'
  });
  if (!rep.ok) return false;
  return (await rep.json()) === true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ erreur: 'Méthode non autorisée.' });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ erreur: "La clé ANTHROPIC_API_KEY n'est pas configurée sur le serveur." });
    return;
  }

  const entete = req.headers.authorization || '';
  const jeton = entete.startsWith('Bearer ') ? entete.slice(7) : '';
  if (!jeton) {
    res.status(401).json({ erreur: 'Connexion requise.' });
    return;
  }

  let corps;
  try {
    corps = await lireCorps(req);
  } catch {
    res.status(400).json({ erreur: 'Corps de requête illisible.' });
    return;
  }

  const { fichier, mediaType, nomFichier } = corps || {};
  if (!fichier || !mediaType) {
    res.status(400).json({ erreur: 'Fichier manquant.' });
    return;
  }
  const TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  if (!TYPES.includes(mediaType)) {
    res.status(400).json({ erreur: 'Format non pris en charge — PDF, PNG, JPEG, WebP ou GIF.' });
    return;
  }

  let autorise;
  try {
    autorise = await accesAutorise(jeton);
  } catch {
    res.status(503).json({ erreur: "Impossible de vérifier l'accès pour le moment." });
    return;
  }
  if (!autorise) {
    res.status(403).json({ erreur: "Ton compte n'a pas accès à la direction technique." });
    return;
  }

  const bloc = mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fichier } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: fichier } };

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const stream = client.messages.stream({
      model: 'claude-opus-5',
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      system: SYSTEM,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          bloc,
          { type: 'text', text: `Voici la fiche technique${nomFichier ? ` « ${nomFichier} »` : ''}. Extrais les informations et liste les points d'attention.` }
        ]
      }]
    });
    const message = await stream.finalMessage();
    const texte = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    res.status(200).json({ extraction: JSON.parse(texte), usage: message.usage });
  } catch (e) {
    const statut = e && e.status ? e.status : 502;
    console.error('[analyser-fiche]', e && e.message);
    res.status(statut === 400 ? 502 : statut).json({
      erreur: statut === 429
        ? "Trop de demandes d'un coup — réessaie dans un instant."
        : "L'analyse a échoué. " + (e && e.message ? e.message : '')
    });
  }
}
