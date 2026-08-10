# Schéma Supabase — Curieux orchestre

Projet : `nffqcvysweidquouulzs`. Ce document décrit les tables créées par `migrations.sql`.

## Principe général

- **Pas de compte utilisateur.** Toutes les tables ont RLS activé avec une policy unique `for all using (true) with check (true)` : accès public en lecture/écriture avec la clé anonyme (`sb_publishable_...`). C'est équivalent à l'ancien localStorage (aucune barrière), mais partagé entre tous les postes.
- **Realtime activé** sur toutes les tables : toute modification faite par une personne apparaît instantanément chez les autres (Supabase Realtime, canal Postgres Changes).
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
4. Vérifier dans **Table Editor** que les 6 tables sont bien créées, et dans **Database → Replication** que Realtime est actif sur ces 6 tables.
