# Déploiement web (Vercel)

L'app est du HTML/JS statique sans étape de build — le déploiement Vercel est donc
la partie la plus simple du projet : il n'y a rien à compiler, juste à héberger les
fichiers tels quels.

## Pré-requis

- Un compte [Vercel](https://vercel.com) (gratuit pour un usage de ce type).
- Le dossier `curieux-orchestre/` versionné dans un dépôt Git (GitHub/GitLab/Bitbucket),
  ou déployable directement en local via la CLI Vercel (voir plus bas).

## Déployer via l'interface Vercel (recommandé)

1. Pousse le dossier `curieux-orchestre/` dans un dépôt Git.
2. Sur [vercel.com/new](https://vercel.com/new), importe ce dépôt.
3. Dans les réglages du projet :
   - **Framework Preset** : `Other` (pas de framework).
   - **Build Command** : laisser vide (rien à builder).
   - **Output Directory** : `.` (racine du dossier, ou le sous-dossier
     `curieux-orchestre/` si le dépôt contient d'autres projets à côté).
   - **Install Command** : laisser vide.
4. Déploie. Vercel sert les fichiers `.html` tels quels ; l'URL d'accueil sera
   `https://<ton-projet>.vercel.app/accueil.html` (ou configure une redirection
   `/` → `/accueil.html`, voir plus bas).

## Déployer via la CLI Vercel (sans dépôt Git)

Depuis le dossier `curieux-orchestre/` :

```bash
npx vercel --prod
```

Répondre aux questions (nom de projet, etc.) — aucun build n'est nécessaire, Vercel
détecte un site statique.

## Rediriger `/` vers `/accueil.html`

Un fichier [vercel.json](vercel.json) est déjà présent à la racine du projet — il
sert `/accueil.html` quand quelqu'un visite `/`, sans changer l'URL affichée
(rewrite, pas redirect) :

```json
{
  "rewrites": [
    { "source": "/", "destination": "/accueil.html" }
  ]
}
```

Ne pas ajouter de champ `"framework"` : Vercel n'accepte que des valeurs parmi une
liste fermée de frameworks connus, et aucune ne correspond à "site statique sans
framework" — dans ce cas, il faut simplement omettre le champ.

## Variables d'environnement / secrets

**Aucune variable d'environnement Vercel n'est nécessaire.** Les identifiants
Supabase (`SUPABASE_URL`, clé anonyme) sont écrits en dur dans
[assets/db.js](assets/db.js) — c'est volontaire : cette app n'a pas de build step
pour lire des env vars au runtime, et la clé anonyme Supabase n'est de toute façon
pas un secret à cacher (voir [SUPABASE_SCHEMA.md](SUPABASE_SCHEMA.md)). La sécurité
d'accès aux données repose sur les règles RLS définies dans `migrations.sql`, pas
sur la confidentialité de cette clé.

Si un jour l'app passe à un vrai système de comptes/permissions, c'est à ce
moment-là qu'il faudra revoir ce choix (clé de service, variables d'env Vercel,
policies RLS par utilisateur).

## Domaine personnalisé

Une fois déployé, un domaine personnalisé (ex: `outils.curieux-orchestre.fr`) peut
être ajouté depuis **Project Settings → Domains** dans Vercel — aucun impact sur le
code, l'app fonctionne à l'identique quel que soit le domaine.

## Après déploiement

- L'app web et l'app locale (fichiers `.html` ouverts en `file://`) pointent vers
  **la même base Supabase** : les données sont partagées entre les deux, pas besoin
  de choisir l'un ou l'autre.
- Aucune étape de migration de données supplémentaire n'est nécessaire pour passer
  du local au web — c'est déjà la même base de données dans les deux cas.
