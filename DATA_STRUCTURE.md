# Cartographie des données — Curieux orchestre (localStorage actuel)

Toutes les données de l'app sont aujourd'hui dans le `localStorage` du navigateur (donc locales à un seul poste). Ce document liste chaque clé, sa forme JSON, qui la lit/écrit, et la table Supabase cible.

## Vue d'ensemble des clés

| Clé localStorage | Fichiers concernés | Nature | → Table Supabase |
|---|---|---|---|
| `musiciens-v1` | annuaire, tournees, disponibilites, recap | tableau d'objets | `musiciens` |
| `techniciens-v1` | techniciens, tournees, recap | tableau d'objets | `techniciens` |
| `tournees-v1` | tournees, disponibilites, newsletter, recap | tableau d'objets (avec `dates[]` imbriqué) | `tournees` |
| `fdr-collection-v1` | feuille-de-route, tournees | tableau d'objets riches | `feuilles_route` |
| `fdr-last-id` | feuille-de-route, tournees | chaîne simple (dernier id ouvert) | **reste en localStorage** (préférence d'UI locale, pas une donnée partagée) |
| `contacts-carnet-v1` | feuille-de-route | tableau d'objets | `carnet_contacts` |
| `newsletter-snapshot-v1` | newsletter | un seul objet (singleton) | `newsletter_snapshot` (table à une ligne) |
| `feuille-de-route-state-v1` | feuille-de-route | ancien blob mono-FDR, gardé uniquement pour migration automatique vers `fdr-collection-v1` au premier chargement | non migré (obsolète) |

## Détail par entité

### `musiciens-v1` → table `musiciens`
Tableau de musicien·nes. Un objet :
```json
{
  "id": "musxxxxxxxxxx",
  "prenom": "Alice",
  "nom": "Martin",
  "instrument": "Violon solo",
  "pupitre": "Cordes",
  "statutPoste": "titulaire",
  "telephone": "06 12 34 56 78",
  "email": "alice.martin@mail.com",
  "notes": "",
  "disponibilites": { "2026-10-15": "dispo", "2027-01-23": "indispo" }
}
```
- `pupitre` ∈ {Cordes, Bois, Cuivres, Percussions, Autre}
- `statutPoste` ∈ {titulaire, remplacant}
- `disponibilites` : map `date ISO → 'dispo'|'indispo'|'incertain'`
- Lu/écrit par : `annuaire.html` (CRUD + import), `disponibilites.html` (édition du champ `disponibilites`), `tournees.html` (lecture pour affectation), `recap.html` (lecture pour le tableau croisé)

### `techniciens-v1` → table `techniciens`
Même forme que `musiciens-v1`, avec `poste`/`pole` au lieu de `instrument`/`pupitre`, pas de `statutPoste` :
```json
{
  "id": "techxxxxxxxxxx",
  "prenom": "Marie", "nom": "Dupont",
  "poste": "Ingé son façade", "pole": "Son",
  "telephone": "...", "email": "...", "notes": "",
  "disponibilites": {}
}
```

### `tournees-v1` → table `tournees`
Tableau de tournées, chacune avec un tableau `dates[]` imbriqué (statuts, affectations, liens de bloc) :
```json
{
  "id": "tourxxxxxxxxxx",
  "nom": "Tournée Automne 2026",
  "dates": [
    {
      "id": "datexxxxxxxxxx",
      "date": "2026-10-15",
      "ville": "Lyon",
      "lieu": "Salle Boris Vian",
      "commentaire": "",
      "statut": "option",
      "musiciensAssignes": ["musxxxx", "musyyyy"],
      "techniciensAssignes": ["techxxxx"],
      "linkedToNext": false
    }
  ]
}
```
- `statut` ∈ {option, validee, annulee}
- `linkedToNext` : bool, sert à former des "blocs" de dates consécutives (départ la veille / retour le lendemain)
- Le tableau `dates` reste imbriqué (JSONB) plutôt que normalisé en table séparée : structure encore mouvante (blocs, statuts) et toujours manipulée comme un tout dans l'UI.
- Lu/écrit par : `tournees.html` (CRUD complet), lu par `disponibilites.html`, `newsletter.html`, `recap.html`

### `fdr-collection-v1` → table `feuilles_route`
Tableau de feuilles de route, une par date/lieu. Objet riche (le plus complexe) :
```json
{
  "id": "fdrxxxxxxxxxx",
  "artistName": "", "eventDate": "2026-10-15", "venueCity": "", "venueSalle": "",
  "logoChoice": "none", "customLogoDataUrl": "",
  "contacts": [ { "role": "", "nom": "", "indicatif": "+33", "tel": "", "email": "" } ],
  "merchandisingOk": false,
  "trajets": [ { "id": "", "label": "Aller", "mode": "train", "train": "", "departVille": "", "departHeure": "", "arriveeVille": "", "arriveeHeure": "", "passengers": [ { "nom": "" } ] } ],
  "planning": [ { "heure": "", "evenement": "", "highlight": false, "type": "" } ],
  "lieu": { "nom": "", "adresse": "", "jauge": "", "billetterie": "" },
  "hotel": { "nom": "", "adresse": "", "tel": "", "checkin": "", "checkout": "", "mapsLink": "", "breakfast": "", "type": "hotel", "typeDetail": "" },
  "ticketLinks": [ { "label": "", "url": "" } ],
  "bonus": ""
}
```
- Stocké en JSONB tel quel (structure évolutive, toujours lue/écrite en bloc).
- `id` et `eventDate` sortis en colonnes réelles pour pouvoir filtrer/trier côté SQL.
- Créée depuis `tournees.html` (bouton "Créer FDR", pousse une entrée minimale `{id, artistName, eventDate}`), éditée en détail dans `feuille-de-route.html`.

### `contacts-carnet-v1` → table `carnet_contacts`
Carnet d'adresses auto-alimenté (déduplique par nom) :
```json
{ "id": "cxxxxxxxxxx", "role": "Régisseur", "nom": "Jean Dupont", "indicatif": "+33", "tel": "6 12 34 56 78", "email": "" }
```
- Écrit automatiquement à chaque fois qu'un contact est saisi dans une feuille de route ; relu via le bouton "📇 Depuis le carnet".

### `newsletter-snapshot-v1` → table `newsletter_snapshot`
Un seul objet (pas un tableau) représentant le dernier envoi du récap :
```json
{ "sentAt": "2026-08-10T14:32:00.000Z", "entries": [ { "key": "tourId|date", "tourneeNom": "", "date": "2026-10-15", "ville": "", "lieu": "", "statut": "option" } ] }
```
- Sert uniquement à calculer le diff (nouveau / changé / annulé) affiché dans `newsletter.html`. Une seule ligne en base (upsert).

## Fonctions clés qui manipulent le stockage (à remplacer par `db.js`)

| Fonction | Fichier(s) | Rôle |
|---|---|---|
| `loadMusicians()` / `saveMusicians()` | annuaire, tournees, disponibilites, recap | CRUD tableau musiciens |
| `loadTechnicians()` / `saveTechnicians()` | techniciens, tournees, recap | CRUD tableau techniciens |
| `loadTournees()` / `saveTournees()` | tournees, disponibilites, newsletter, recap | CRUD tableau tournées |
| `loadFdrCollection()` / `saveFdrCollection()` | feuille-de-route, tournees | CRUD tableau FDR |
| `loadCarnet()` / `saveCarnet()` | feuille-de-route | CRUD carnet |
| `loadSnapshot()` / `saveSnapshot()` | newsletter | lecture/écriture du singleton snapshot |

Toutes suivent le même patron `try{ JSON.parse(localStorage.getItem(KEY)) }catch{ défaut }` en lecture et `localStorage.setItem(KEY, JSON.stringify(...))` en écriture — c'est ce patron que `db.js` doit remplacer par des équivalents asynchrones Supabase, en gardant les mêmes noms de fonctions pour minimiser les changements dans chaque page.
