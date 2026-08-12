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
confidentialité de cette clé. Les tables de données courantes (musicien·nes,
tournées, dispos...) restent en RLS `public full access` : tout compte admin
partage les mêmes données. Seule `infos_sociales` (identité civile, n° sécu, RIB)
est restreinte par compte, voir la section dédiée plus bas.

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

## Accès admin par compte (toutes les pages internes)

Toutes les pages admin (accueil, annuaire, technicien·nes, tournées,
disponibilités, suivi, récap, newsletter, feuilles de route, infos sociales...)
sont protégées par un **vrai compte** Supabase Auth (email + mot de passe) —
l'ancien mot de passe partagé "admin" en clair n'existe plus. Avoir un compte ne
suffit pas : il faut en plus figurer dans la liste blanche `infos_sociales_admins`
pour être reconnu comme admin et accéder aux pages (sinon [admin-login.html](admin-login.html)
affiche "compte non autorisé"). C'est la même liste de confiance qui gérait déjà
l'accès à `infos-sociales.html` — elle sert maintenant d'allowlist pour toute l'app.

Les liens personnels envoyés aux musicien·nes/technicien·nes
([dispo-titulaire.html](dispo-titulaire.html), [mes-infos.html](mes-infos.html)) ne
sont **pas concernés** : ils restent publics, identifiés par leur token dans l'URL,
sans compte à créer.

**Créer un compte** — deux façons :
- Self-service : [creer-compte.html](creer-compte.html) (email + mot de passe,
  confirmation par email selon la config Supabase par défaut).
- Depuis le tableau de bord Supabase : Authentication → Users → **Add user** (tu
  peux cocher "Auto Confirm User" pour éviter l'email de confirmation).

Dans les deux cas, le compte créé n'a **aucun accès** tant qu'il n'est pas ajouté à
la liste blanche (policy RLS "self read own admin row" : chaque compte ne peut
vérifier que sa propre appartenance, jamais lister les autres admins).

**Pour autoriser une personne** (après création de son compte) : SQL Editor →
`insert into infos_sociales_admins (email) values ('email@exemple.fr');`. Pour
retirer l'accès de quelqu'un : `delete from infos_sociales_admins where email =
'email@exemple.fr';` (son compte Auth continue d'exister, il perd juste l'accès aux
pages admin et aux infos sociales).

Note : ce système protège l'**accès aux pages** (comptes nommés, révocables, plus
de mot de passe en clair) mais, comme avant, les tables de données courantes
(musicien·nes, tournées...) restent en RLS `public full access` — seule la table
`infos_sociales` (identité civile, n° sécu, RIB) est réellement verrouillée côté
base aux comptes de la liste blanche.

### Auto-saisie côté musicien·nes/technicien·nes (mes-infos.html)

En plus de la saisie côté admin ci-dessus, chaque musicien·ne/technicien·ne peut
remplir et mettre à jour ses propres infos sociales sur `mes-infos.html`, accessible
depuis le même lien personnel que ses réponses de disponibilité
(`dispo-titulaire.html` — un lien "🔒 Renseigner mes infos" y a été ajouté). Pas de
compte à créer : le token du lien fait office d'identification, exactement comme
pour les dispos. Rien à configurer manuellement pour cette partie — `migrations.sql`
suffit (il crée les fonctions `get_own_infos_sociales`/`upsert_own_infos_sociales`
qui vérifient le token avant de toucher `infos_sociales`).
