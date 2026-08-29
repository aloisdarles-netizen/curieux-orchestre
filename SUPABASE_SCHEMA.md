# Schéma Supabase — Curieux orchestre

Projet : `nffqcvysweidquouulzs`. Ce document décrit les tables créées par `migrations.sql`.

> **Deux parties, deux régimes.** Ce qui suit — les principes, les intentions —
> s'écrit et se relit à la main : c'est le *pourquoi*, et aucune base ne sait le
> raconter. La section « Le schéma tel qu'il est », plus bas, est en revanche
> produite depuis la base par `outils/schema-courant.mjs` : c'est le *quoi*, et
> le corriger à la main revient à écrire une carte fausse. Une fois de plus.
>
> ```sh
> npm i postgres --no-save
> SUPABASE_DB_URL='postgresql://…' node outils/schema-courant.mjs
> SUPABASE_DB_URL='postgresql://…' node outils/schema-courant.mjs --verifier
> ```
>
> À relancer après chaque strate ajoutée à `migrations.sql`.

## Principe général

- **Un accès public, et des portes gardées.** Ce document a longtemps annoncé
  « pas de compte utilisateur » et une policy unique `using (true)` sur toutes
  les tables : ce n'est plus vrai. Il y a désormais des comptes, des rôles
  (dont `admin`), des liens à jeton pour les titulaires qui n'ont pas de compte,
  et des fonctions `security definer` par lesquelles passe tout ce qu'un jeton
  autorise. La section générée ci-dessous dit, table par table, ce qu'il en est
  réellement — c'est elle qui fait foi.
- **Realtime : sur une partie des tables seulement.** Là encore, « toutes les
  tables » était faux, et un abonnement posé sur une table non publiée ne se
  déclenche jamais sans que rien ne le signale. La liste exacte est produite
  plus bas.
- **IDs texte**, pas des UUID Postgres : on garde le format `genId('prefixe')` déjà généré côté client (ex: `mus1a2b3c4d`), pour ne rien changer à la logique de création d'ID dans l'app.
- **JSONB pour les structures imbriquées** (dates de tournée, contenu de feuille de route) plutôt qu'un éclatement en sous-tables : ces structures bougent encore souvent et sont toujours lues/écrites en bloc par l'app — les normaliser aurait forcé une réécriture bien plus large sans bénéfice réel aujourd'hui.

## Tables

### `musiciens`
Un·e musicien·ne par ligne. Colonnes : `id`, `prenom`, `nom`, `instrument`, `pupitre`, `statut_poste` (`titulaire`/`remplacant`), `telephone`, `email`, `notes`, `disponibilites` (jsonb, map `date → statut`).

### `techniciens`
Même forme, avec `poste`/`pole` au lieu de `instrument`/`pupitre`.

### `tournees`
Une tournée par ligne. `dates` (jsonb) contient le tableau complet des dates (ville, lieu, commentaire, statut option/validée/annulée, musiciens/techniciens affectés, liaison de bloc `linkedToNext`).

### `feuilles_route`
Une feuille de route par ligne. `data` (jsonb) contient tout l'objet (contacts, trajets, planning, lieu, hôtel, liens billetterie...) — identique à ce qui était sérialisé dans `fdr-collection-v1`.

### `carnet_contacts`
Carnet d'adresses auto-alimenté depuis les feuilles de route (régisseurs, contacts salle...).

### `newsletter_snapshot`
Une seule ligne (`id = 1`), remplacée à chaque "Marquer comme envoyé" dans la page Newsletter. Sert de référence pour calculer le diff (nouveau / changé / annulé) au prochain envoi.

## Ce qui reste en localStorage (volontairement non migré)

- `fdr-last-id` : mémorise juste la dernière feuille de route ouverte sur *ce* poste, pour la rouvrir si on arrive sur `feuille-de-route.html` sans paramètre `?id=`. C'est une préférence d'affichage locale, pas une donnée métier — pas besoin de la partager entre postes.
- `feuille-de-route-state-v1` : ancien format (une seule FDR globale, avant la collection). Gardé uniquement pour la migration automatique ponctuelle vers `fdr-collection-v1` au premier chargement ; jamais réécrit depuis.

## Comment appliquer le schéma

1. Ouvrir le projet Supabase → **SQL Editor** → **New query**.
2. Coller le contenu de `migrations.sql`.
3. **Run**. Toutes les instructions sont idempotentes (`create table if not exists`, `drop policy if exists`) — tu peux relancer le script sans risque si besoin.
4. Régénérer la carte ci-dessous (`node outils/schema-courant.mjs`) et relire ce
   qu'elle dit : c'est la seule vérification qui porte sur ce qui existe
   vraiment. Compter les tables à la main dans le Table Editor, c'est ce qui a
   laissé ce document affirmer pendant des semaines qu'il y en avait six.

<!-- SCHEMA-COURANT:DEBUT -->

*La carte n'a pas encore été produite. Lancer `node outils/schema-courant.mjs`
avec `SUPABASE_DB_URL` pour la remplir — elle décrira alors les tables,
colonnes, policies, index, publications temps réel et fonctions réellement en
place.*

<!-- SCHEMA-COURANT:FIN -->
