# Lisibilité des pages de disponibilités — audit et pistes d'évolution

Août 2026. Ce document regarde quatre écrans qui, ensemble, portent toute la
question « qui est disponible, quand, et qui n'a pas encore répondu » :

| Écran | Fichier | Rôle | Taille |
|---|---|---|---|
| Vue d'ensemble | `recap.html` | tableau croisé personnes × dates, et depuis peu écriture des dispos et des affectations | 1 912 l. |
| Demandes titulaires | `suivi-dispo.html` | demander, relancer, suivre les réponses | 1 785 l. |
| Grille interne | `disponibilites.html` | saisir/corriger les dispos à la main, importer un tableur | 604 l. |
| Page du ou de la titulaire | `dispo-titulaire.html` | ce que voit la personne qui reçoit son lien | 946 l. |

Il ne propose rien à appliquer dans l'urgence. Il établit d'où l'on vient, ce
qui gêne aujourd'hui, et ce que ces pages pourraient devenir — à trois horizons.

---

## 1. D'où l'on vient : cinq jours, quatre vagues

L'écosystème naît d'un seul coup le 25 août 2026 (`9d1f886`, 3 479 lignes pour
les quatre pages). En cinq jours et une vingtaine de commits dédiés, la
lisibilité a été retravaillée par vagues successives, et l'ordre dans lequel
elles se sont enchaînées dit beaucoup de ce qui compte ici.

**Vague 1 — la confiance, côté musicien·ne.** Le bouton « Valider mes réponses »
disparaît au profit de l'enregistrement automatique (`6799f35`), puis vient le
filet : journal local, envoi de secours, relecture (`91a6682`). Premier
enseignement du projet : sur la page du ou de la titulaire, *lisibilité* a
d'abord voulu dire « savoir que sa réponse est bien partie ».

**Vague 2 — la Vue d'ensemble devient un poste de travail.** Fenêtre de
défilement propre avec dates collantes (`967d86b`), modes Marquer / Affecter et
bouton Oups (`1f4b8c3`), mémoire du défilement qui survit au rafraîchissement
temps réel (`f32564a`), vue par défaut « Titulaires + sollicité·es » (`1dfee44`),
grisage hachuré des dates non sollicitées (`5162e30`), puces de projets à
l'affiche (`9565150`), barre de modes déplacée en bas parce qu'elle entrait en
collision avec l'en-tête collant (`6c21b49`), date de dernière demande sous
chaque nom (`6358481`). La page cesse d'être une vitrine : on y agit.

**Vague 3 — l'impression.** Réécriture de l'export PDF (`247f9ea` : pagination
en tranches de dates, marques tracées au trait parce que la police embarquée
n'a ni ✓ ni ✕), passage en A3 et assombrissement du filet de ligne à l'écran
(`f6f144d`), recherche qui passe outre le filtre de statut (`fa827c0`), et le
principe posé noir sur blanc : « l'export imprime le tableau qu'on a sous les
yeux » (`d747cd3`, `81c3413`).

**Vague 4 — le dialogue.** Bulle de survol nominative et remplaçant·es rangé·es
sous leur titulaire (`1f8d299`), précisions reprises en notes numérotées dans le
PDF (`d5aeb25`), réponse de la production qui fait passer le point d'orange à
prune (`d4c9296`), cinq modèles de message (`a79c231`). Une précision laissée
par quelqu'un cesse d'être un post-it perdu : elle attend une réponse, et se
voit quand elle en a reçu une.

**Trois irritants reviennent d'une vague à l'autre :** les collisions entre
éléments collants ; la perte du défilement à chaque re-rendu temps réel
(corrigée deux fois) ; et surtout **la double implémentation écran / PDF, qui a
divergé trois fois** — c'est le seul endroit du projet où le même tableau est
écrit deux fois, et c'est aussi celui qui casse le plus souvent.

**Le socle est consommé à moitié.** `assets/base.css` (911 lignes) est
remarquablement documenté et fournit un composant de matrice complet
(`.co-matrix` : fenêtre de défilement, colonne de noms collante, en-tête de dates
collant, lignes alternées, cibles tactiles à 44 px). `recap.html` l'utilise ;
`disponibilites.html` — qui est pourtant la page de *saisie*, celle où l'on a le
plus besoin de garder l'en-tête sous les yeux — est restée sur son propre
`<table>`. Et `.co-matrix-total`, la ligne de totaux prévue par le socle, n'est
utilisée nulle part.

---

## 2. Comment cet audit a été mené

Cinq lectures complètes en parallèle (les quatre pages, la couche `db.js` +
`migrations.sql`, l'historique git + le socle CSS), puis six audits par
dimension — UI, UX, utilisateur, SQL, accessibilité, cohérence inter-pages —
chacun suivi d'une contre-lecture adversariale chargée de **réfuter** ses
propres constats en rouvrant le code aux lignes citées. Les constats réfutés
sont écartés, les nuancés conservés avec leur nuance. Les propositions sont
ensuite dérivées des seuls constats survivants.

<!-- SECTIONS 3 (constats) ET 4 (propositions) : complétées après vérification -->
