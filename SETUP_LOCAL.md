# Utiliser Curieux orchestre en local

Application HTML/JS statique, sans étape de build. Toutes les données (musicien·nes,
technicien·nes, tournées, feuilles de route, carnet de contacts, snapshot newsletter)
sont stockées dans Supabase (cloud) et synchronisées en temps réel entre tous les
postes qui ouvrent l'app — il n'y a plus besoin d'être sur le même ordinateur pour
partager les données.

## Pré-requis

- Un navigateur récent (Chrome, Safari, Firefox, Edge).
- Une connexion internet (l'app appelle Supabase au chargement de chaque page et
  maintient une connexion temps réel).

## Ouvrir l'app

Double-clique sur [accueil.html](accueil.html), ou utilise le lanceur macOS
(icône sur le Bureau / Dock, cf. section suivante) qui ouvre automatiquement cette
page dans le navigateur par défaut.

Aucune installation, aucun `npm install`, aucun serveur à lancer : les fichiers
`.html` s'ouvrent directement en `file://`.

## Lanceur macOS (Bureau / Dock)

Un lanceur `.app` a déjà été créé sur le Bureau ("Curieux orchestre.app"). Il ouvre
directement [accueil.html](accueil.html) dans le navigateur par défaut. Tu peux le
glisser dans le Dock pour un accès permanent.

## Base de données Supabase

Le projet Supabase est déjà configuré et ses identifiants sont écrits en dur dans
[assets/db.js](assets/db.js) — la clé utilisée est la clé **anonyme/publique**
(`sb_publishable_...`), volontairement non secrète : la sécurité vient des règles
d'accès (RLS) définies dans [migrations.sql](migrations.sql), pas de la
confidentialité de cette clé. Il n'y a pas de compte utilisateur : tout le monde qui
a l'app partage les mêmes données, comme c'était le cas avec le stockage local avant
la migration — sauf que maintenant c'est partagé entre postes au lieu d'être
enfermé sur une seule machine.

**Si tu dois recréer le projet Supabase** (nouveau projet, changement de compte) :
1. Crée un projet sur [supabase.com](https://supabase.com).
2. Va dans **SQL Editor** → colle le contenu de [migrations.sql](migrations.sql) → **Run**.
3. Récupère l'URL du projet et la clé anonyme dans **Project Settings → API**.
4. Remplace `SUPABASE_URL` et `SUPABASE_ANON_KEY` en haut de
   [assets/db.js](assets/db.js).

Voir [SUPABASE_SCHEMA.md](SUPABASE_SCHEMA.md) pour le détail des tables, et
[DATA_STRUCTURE.md](DATA_STRUCTURE.md) pour la correspondance avec l'ancienne
structure locale.

## Vérifier que tout fonctionne

Ouvre la console du navigateur (Cmd+Option+J sur Chrome/Safari) sur n'importe quelle
page : si tu vois `[CurieuxDB] fetchAll(...) Could not find the table...`, le script
`migrations.sql` n'a pas (ou plus) été appliqué sur le projet Supabase visé par
`assets/db.js` — retourne dans le SQL Editor de Supabase et relance-le (il est
idempotent, sans risque de le rejouer).

## Travailler à plusieurs en simultané

Chaque page (annuaire, tournées, disponibilités, vue d'ensemble, feuille de route...)
se met à jour automatiquement quand quelqu'un d'autre modifie une donnée depuis un
autre poste — pas besoin de recharger la page.

## Zone protégée "Infos sociales" (infos-sociales.html)

Contrairement au reste de l'app (accès public via la clé anonyme, voir plus haut),
[infos-sociales.html](infos-sociales.html) stocke des données sensibles nécessaires à
une embauche (identité civile, n° de sécurité sociale, RIB, statut intermittent) et
exige un **vrai compte** Supabase Auth (email + mot de passe), en plus du mot de passe
d'accueil de l'app. Ça ne se configure pas tout seul en rejouant `migrations.sql` —
deux étapes manuelles sont nécessaires dans le tableau de bord Supabase :

1. **Activer les comptes email** — Authentication → Providers → vérifier que
   "Email" est activé (c'est le cas par défaut sur un projet neuf).
2. **Créer un compte** — Authentication → Users → **Add user** → renseigne l'email
   de la personne autorisée et un mot de passe (tu peux cocher "Auto Confirm User"
   pour éviter l'email de confirmation). Le compte pourra ensuite se connecter
   directement sur `infos-sociales.html`.

Une fois `migrations.sql` rejoué (il crée la table `infos_sociales` et une liste
blanche `infos_sociales_admins`, déjà pré-remplie avec
`alois.darles@lessoudaines.fr`), seuls les comptes présents dans
`infos_sociales_admins` peuvent lire ou écrire ces données — imposé côté base par
une policy RLS dédiée, pas juste côté app.

**Pour autoriser une nouvelle personne** (après lui avoir créé un compte comme à
l'étape 2 ci-dessus) : SQL Editor → `insert into infos_sociales_admins (email)
values ('email@exemple.fr');`. Pour retirer l'accès de quelqu'un : `delete from
infos_sociales_admins where email = 'email@exemple.fr';` (son compte Auth continue
d'exister, il perd juste l'accès à cette table précise).

### Auto-saisie côté musicien·nes/technicien·nes (mes-infos.html)

En plus de la saisie côté admin ci-dessus, chaque musicien·ne/technicien·ne peut
remplir et mettre à jour ses propres infos sociales sur `mes-infos.html`, accessible
depuis le même lien personnel que ses réponses de disponibilité
(`dispo-titulaire.html` — un lien "🔒 Renseigner mes infos" y a été ajouté). Pas de
compte à créer : le token du lien fait office d'identification, exactement comme
pour les dispos. Rien à configurer manuellement pour cette partie — `migrations.sql`
suffit (il crée les fonctions `get_own_infos_sociales`/`upsert_own_infos_sociales`
qui vérifient le token avant de toucher `infos_sociales`).
