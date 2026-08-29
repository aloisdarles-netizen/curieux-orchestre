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

L'ordre de grandeur retenu pour juger les propositions : **60 personnes × 80
dates**. Soit près de 4 800 cases par matrice, et deux matrices par page. Ce
chiffre revient souvent dans ce qui suit — c'est lui qui sépare ce qui tient de
ce qui plie.

---

## 3. Ce qui gêne aujourd'hui

Les constats sont rangés par ce qu'un lecteur ressent, pas par discipline
d'audit : personne ne se dit « j'ai un problème d'UI », on se dit « le tableau
me ment » ou « je ne sais pas qui relancer ».

### 3.1 Le même signe ne veut pas dire la même chose

**Le vert dit deux choses opposées selon la page.** `--ok` (#2f8f5b) signifie
« disponible » sur la Grille interne (`disponibilites.html:35, 61`) et sur la
page du ou de la titulaire, mais « affecté·e » sur la Vue d'ensemble
(`recap.html:211`) — où « disponible » devient le bleu `--accent-tint`. Le
symbole ✓ suit le même sort : il vaut « je suis dispo » ici, « tu joues » là.
Quelqu'un qui passe d'un écran à l'autre — ce qui est le parcours normal —
relit deux fois la même couleur avec deux sens contraires. Pire, l'export PDF
de la Grille interne colorie « dispo » en bleu (`disponibilites.html:370`)
alors que son propre écran l'affiche en vert : le document imprimé contredit la
page dont il sort.

**Trois vocabulaires pour trois portes d'entrée.** L'onglet s'appelle
« Disponibilités », sa page d'atterrissage « Demandes titulaires », sa voisine
« Grille interne », et la page primaire du menu « Vue d'ensemble » — qui est en
réalité, elle aussi, une page de disponibilités. L'entrée de menu « Grille
interne » ouvre par ailleurs une page dont le titre affiché est
« Disponibilités » (`nav.js:48` contre `disponibilites.html:129`). Rien
n'indique laquelle sert à quoi.

### 3.2 Le tableau ne répond pas aux questions qu'on lui pose

**« Cette date est-elle complète ? » n'a pas de réponse.** La matrice se lit
parfaitement en ligne — une personne, sa saison — et pas du tout en colonne. Il
faut compter les cases à l'œil pour savoir s'il manque un violon le 15 mars.
Le socle prévoit pourtant la ligne de totaux (`.co-matrix-total`,
`base.css:763-764`) : elle n'est utilisée nulle part dans le projet.

**« Qui n'a pas répondu ? » a deux réponses chiffrées contradictoires.** La Vue
d'ensemble compte une personne en attente si elle n'a pas rempli *toutes* les
dates à venir du projet (`recap.html:1064`) ; Demandes titulaires ne compte que
les dates réellement couvertes par son lien (`suivi-dispo.html:653-657`). Une
personne sollicitée sur 3 dates d'une tournée qui en compte 12, et qui a
répondu à ses 3 dates, s'affiche « ✓ Répondu » sur une page et alimente le
compteur d'attente sur l'autre. Les deux chiffres sont visibles à un clic l'un
de l'autre.

**Les précisions manquent là où l'on décide.** Elles se lisent sur la Vue
d'ensemble — bulle au survol, bloc récapitulatif dessous — mais `suivi-dispo.html`,
la page où l'on choisit qui relancer, ne les affiche jamais. Or c'est
exactement là qu'elles serviraient : comprendre *pourquoi* quelqu'un est
incertain avant de lui réécrire. Le parcours demander → comprendre → relancer
traverse deux pages à chaque tour.

**La date de la dernière relance ne s'affiche pas sur la page de relance.**
L'information existe (`lastReminderAt`) et la Vue d'ensemble la montre en face
de chaque nom (« ✉ 12 mars » / « ✉ jamais »). Demandes titulaires, elle, ne
l'affiche pas : on y lit « Relancer » ou « Première relance », sans savoir si
l'on a écrit hier ou il y a trois semaines.

**« Relancer les retardataires » ne laisse aucune trace.** La fonction
(`suivi-dispo.html:860-894`) copie un bloc de texte dans le presse-papiers, mais
n'appelle jamais `markReminderSent` — contrairement aux boutons de relance
individuels (l. 1616, 1625, 1640). Après une relance groupée, tout le monde
reste étiqueté « Première relance » et le décompte des personnes déjà relancées
est faux. Au balayage suivant, on réécrit à des gens contactés la veille.

### 3.3 Ce que la personne à l'autre bout ne peut pas dire

**Le troisième statut n'existe pas côté titulaire.** Sa page n'offre que deux
boutons, Disponible et Indisponible (`dispo-titulaire.html:633-634`). Le style du
bouton « à confirmer » est pourtant déjà écrit vingt lignes plus haut (l. 98), et
les trois autres pages lisent et affichent cet état. Résultat : l'incertitude —
qui est l'information la plus utile à une production, celle qui appelle un
arbitrage — n'a aucun canal propre et se déverse dans le champ de texte libre.
D'où, mécaniquement, une part des précisions à dépouiller à la main.

**L'enregistrement automatique ne s'annonce pas.** Le texte de `#saveStatus`
(l. 228) change au fil des sauvegardes, mais sans `aria-live` : une personne qui
navigue au lecteur d'écran n'entend jamais que sa réponse est partie. C'est le
point exact sur lequel le projet a le plus travaillé — le filet, la relecture,
« ✓ Enregistré et vérifié » — et il reste muet pour une partie des gens.

### 3.4 La page tient mal la charge qu'on lui demande

À 60 personnes × 80 dates, chaque matrice porte environ 4 800 cases, et la page
en affiche deux. Or `renderAll()` reconstruit l'intégralité des deux matrices en
`innerHTML` — à chaque frappe dans le champ de recherche, à chaque clic sur une
case, et à chaque événement temps réel, lequel déclenche en plus un
rechargement complet de la table concernée. Le soin déjà pris pour préserver la
position de défilement à travers ces re-rendus montre que le problème a été
rencontré ; à cette échelle, il cesse d'être une gêne pour devenir le plafond
de la page.

**Sur téléphone, la Vue d'ensemble perd ses repères.** En dessous de 760 px,
l'en-tête collant est masqué (`recap.html:304`) : les dates perdent le nom et la
couleur de leur projet, et il reste une liste de jours sans appartenance.

### 3.5 Deux personnes qui travaillent en même temps s'écrasent

Les disponibilités vivent dans une map JSONB par personne, réécrite **en bloc** à
chaque modification : la Vue d'ensemble et la Grille interne envoient la fiche
entière (`upsertOne`), et la fonction du lien à jeton fait
`disponibilites = p_disponibilites` (`migrations.sql:3310`), remplacement
complet. Si un·e titulaire enregistre depuis son téléphone pendant que la
production corrige une case, le dernier écrit gagne et l'autre modification
disparaît — sans le moindre signal.

Ce qu'il faut noter : **la parade existe déjà dans le projet**.
`upsertOneVersionne` (`db.js:788-802`) n'écrit que si la ligne porte encore la
version lue, et renvoie sinon un conflit avec la version distante. Son
commentaire la réserve explicitement aux devis. Le mécanisme est écrit, testé,
utilisé — simplement pas branché là où deux personnes écrivent vraiment en même
temps.

**Un abonnement temps réel ne se déclenche jamais.** La publication Realtime
liste sept tables (`migrations.sql:944`) ; `remplacant_prefs` n'en fait pas
partie. Or la Vue d'ensemble s'y abonne (`recap.html:1463`) pour ranger les
remplaçant·es sous leur titulaire. Quand quelqu'un modifie sa liste, la page ne
bouge pas, et rien ne dit qu'elle est périmée.

### 3.6 Le thème sombre et l'impression

En thème sombre, le circuit « réponse de la production » est écrit en prune
littéral (`--prune`, #791649) sur fond sombre — un contraste de l'ordre de
1,5:1, à la limite du lisible. La nuance a son importance : sur la page du ou
de la titulaire, le texte de la réponse lui-même reste en crème lisible
(`.reponse-prod`, l. 142-146) ; ce sont son libellé « Réponse de la
production » et son filet qui s'effacent. Côté production en revanche, la bulle
de précision, la réponse qu'on y lit et l'étiquette de projet sont bien touchées.
Les symboles blancs des statuts tombent eux aussi très bas sur les aplats de la
palette sombre, ce qui ramène l'information à la couleur seule alors que le
symbole est justement là pour éviter ça.

**Il n'y a aucun `@media print` dans tout le dépôt** — zéro occurrence. Ctrl+P
sur la Vue d'ensemble donne une page inutilisable (barre de modes flottante
comprise), et rien n'oriente vers l'export PDF, qui est pourtant excellent et
pensé pour ça.

### 3.7 Les pages ne racontent pas tout à fait la même histoire

**Une date annulée reste une colonne pleine et cliquable.** Le statut `annulee`
existe, se pose à la main dans les tournées et s'affiche en pastille barrée
là-bas. Mais ni `allDateEntries` (Vue d'ensemble) ni `allDates` (Grille interne)
ne le filtrent : un concert annulé continue d'occuper sa colonne, on peut y
marquer des disponibilités, et il compte dans le nombre de dates affiché sur la
puce du projet. Sur une saison, ce sont des colonnes qui ne servent qu'à
encombrer — et une source d'erreur, puisqu'on peut y affecter quelqu'un.

**L'ordre des lignes n'est pas celui de l'orchestre.** L'annuaire pose
explicitement `PUPITRE_ORDER` — chef d'orchestre, cordes, bois, cuivres,
percussions — avec le commentaire « ordre de l'orchestre, pas alphabétique ».
Les trois pages de disponibilités, elles, trient alphabétiquement. On y cherche
donc un pupitre entier en sautant de ligne en ligne, alors que la règle de
rangement existe déjà à côté.

**« Pas sollicité·e » n'existe que sur la Vue d'ensemble.** Toute la sémantique
construite autour de « lui a-t-on seulement demandé ? » — les hachures, la règle
d'office, les exclusions manuelles — s'arrête à cette page. La Grille interne
affiche les mêmes personnes sur les mêmes dates sans distinguer « n'a pas
répondu » de « on ne lui a rien demandé ».

**Le même menu « Afficher » n'a ni les mêmes choix ni le même défaut** d'une
grille à l'autre (trois options démarrant sur « Titulaires uniquement » ici,
cinq démarrant sur « Titulaires + sollicité·es » là), alors qu'ils portent le
même identifiant. Et la nature « recording » se signale de plusieurs façons
selon la page — voile assombri, mention « Rec », pastille — alors que
`pastilleProjetHtml()` existe dans `ui-helpers.js` en désignant nommément les
dispos comme lieu d'emploi. Une seule des quatre pages l'appelle.

### 3.8 Deux fois le même tableau

Le point qui revient le plus dans l'historique. Le tableau croisé est écrit deux
fois : une fois pour l'écran, une fois pour le PDF (`recap.html:1466-1912`). Les
deux implémentations ont divergé trois fois en cinq jours — l'export sortait
sans un seul musicien parce qu'il ne connaissait pas les nouvelles valeurs du
filtre ; les cases affectées sortaient vides parce que la police embarquée n'a
ni ✓ ni ✕ ; les projets n'étaient pas nommés. Chaque correction a été faite des
deux côtés, à la main. Tant que la règle « l'export imprime le tableau qu'on a
sous les yeux » repose sur deux codes parallèles, elle sera vraie le jour où on
l'écrit et fausse trois commits plus tard.

Enfin, `SUPABASE_SCHEMA.md` et `DATA_STRUCTURE.md` décrivent une base qui
n'existe plus : ils annoncent un accès public sans compte et six tables, alors
que le schéma réel a des rôles, des fonctions `security definer`, des jetons et
un journal d'audit. La carte du modèle de données est aujourd'hui trompeuse pour
qui arrive.

---

## 4. Où ces pages pourraient aller

Trois horizons. Rien n'est à faire dans l'urgence ; l'ordre proposé est celui du
rapport entre ce que ça coûte et ce que ça rend lisible.

### 4.1 Court terme — chacune tient seule

Aucune ne touche au schéma de données, aucune ne dépend d'une autre.

**Une seule source de vérité pour les quatre états.** Extraire dans `base.css`
et dans un petit module partagé le triplet couleur + symbole + libellé de
`dispo` / `indispo` / `incertain` / `affecté·e`, et le faire consommer par les
quatre pages *et* par les deux exports PDF. C'est la correction de fond de
§3.1 : aujourd'hui chaque page redéclare ses propres classes, et c'est ainsi que
le vert a pu prendre deux sens. Décision à prendre au passage — je proposerais
de réserver le vert à « affecté·e » (l'état le plus fort, celui qui engage) et
de garder le bleu pour « disponible ».

**Rendre le « à confirmer » au titulaire.** Un troisième bouton dans
`dispo-titulaire.html` ; le style existe déjà. C'est la proposition la plus
rentable du lot : elle coûte quelques lignes et elle fait remonter une
information qui, aujourd'hui, se perd en texte libre.

**Réconcilier le compteur d'attente.** Extraire le calcul « à qui manque-t-il
une réponse ? » dans une fonction unique appelée par les deux pages, en retenant
la définition de Demandes titulaires (ne compter que les dates couvertes par le
lien), qui est la juste.

**Activer la ligne de totaux par date.** Le composant `.co-matrix-total` attend
dans le socle. Une ligne sous la matrice, indiquant par colonne le nombre de
disponibles et le nombre d'affecté·es, donne la lecture verticale qui manque —
« il me manque un alto le 15 mars » se lit alors sans compter.

**Afficher la date de dernière relance là où l'on relance**, et inscrire la
trace de relance dans l'action groupée (§3.2).

**Reprendre les contrastes du thème sombre** sur le circuit des précisions et
des réponses, en passant par une variable qui bascule au lieu du prune littéral.

**Basculer la Grille interne sur `.co-matrix`.** Elle est la page de *saisie* et
c'est la seule à ne pas avoir d'en-tête de dates collant : sur ordinateur, on
saisit en allant vérifier du regard la colonne, dix lignes plus haut. À noter
que le problème ne touche que l'ordinateur — sur téléphone, `base.css` replie ce
tableau en liste et réinjecte la date devant chaque case. Le composant du socle
apporte l'en-tête collant, la colonne de noms figée et les cibles tactiles à
44 px, gratuitement.

**Un `@media print` minimal** sur les quatre pages : masquer la barre flottante
et les filtres, et poser une ligne qui renvoie vers l'export PDF.

**Écarter les dates annulées des deux grilles**, ou au minimum les barrer et les
rendre inertes. Une ligne de filtre dans `allDateEntries` et `allDates`.

**Trier les lignes dans l'ordre de l'orchestre** en réutilisant `PUPITRE_ORDER`
et le comparateur de l'annuaire, au lieu du tri alphabétique.

**Faire survivre recherche et filtres au rafraîchissement temps réel** sur
Demandes titulaires.

### 4.2 Moyen terme — la forme des pages

**Un module de rendu partagé, écran et PDF confondus.** C'est la réponse à §3.7,
et la plus structurante des propositions moyennes : tant que le tableau est
écrit deux fois, il divergera. Une fonction qui décrit une cellule (état,
couleur, symbole, précision) et deux traducteurs — un vers le DOM, un vers
jsPDF — rendent la règle « l'export imprime ce qu'on a sous les yeux » vraie par
construction.

**Des vues par question plutôt que par objet.** Aujourd'hui les pages sont
organisées par ce qu'elles contiennent (les gens, les projets, la grille). Les
questions réelles sont : *qui manque à l'appel ?*, *qui est dispo le 15 mars ?*,
*où en est ce projet ?* Demandes titulaires a déjà inventé le patron — deux
vues, un choix retenu dans le navigateur — et il marche bien. L'étendre à la Vue
d'ensemble donnerait une vue par date (une colonne dépliée, les gens rangés par
pupitre, les manques en tête) à côté de la vue par personne actuelle.

**Le rendu incrémental.** À 4 800 cases, reconstruire les deux matrices à chaque
frappe est le vrai plafond (§3.4). Ne re-rendre que les lignes touchées, et
filtrer la recherche en masquant plutôt qu'en reconstruisant — ce que fait déjà
`filtrerPersonnes` dans Demandes titulaires — suffirait sans introduire de
framework.

**Des regroupements repliables par pupitre et par pôle.** Le socle sait déjà
dessiner des bandes de groupe. Replier les cordes quand on travaille les vents
divise par trois la hauteur à balayer.

**Et la question de fond : faut-il encore trois lieux ?** La Vue d'ensemble sait
déjà saisir les disponibilités (mode Marquer), avec en plus le contexte des
projets, la recherche, les précisions et l'annulation. La Grille interne n'a
plus qu'une chose en propre : l'import d'un tableur collé. Il y a une trajectoire
naturelle où elle devient cet import — un écran d'entrée de données, appelé
depuis la Vue d'ensemble — et où l'écosystème passe de trois écrans à deux :
*un endroit pour demander et relancer*, *un endroit pour voir et décider*.
Cela demanderait aussi de renommer les pages pour qu'elles disent ce qu'elles
font.

### 4.3 Long terme — les fondations

**La table `disponibilites` normalisée.** Une ligne par (personne, date) plutôt
qu'une map JSONB par personne : `(type_personne, personne_id, date, statut,
precision, mis_a_jour, source)`. Ce que ça débloque, du point de vue de la
lisibilité — car c'est bien de ça qu'il s'agit, pas de propreté pour elle-même :

- l'écriture cellule par cellule met fin à l'écrasement silencieux (§3.5) ;
- « qui est dispo le 15 mars ? » devient une requête, donc une vue possible
  sans charger tout le monde ;
- les compteurs (taux de réponse, manques par date) se calculent côté base au
  lieu d'être recomptés en JavaScript à chaque rendu ;
- `mis_a_jour` par cellule permet enfin de dire « répondu hier » plutôt que
  « répondu » ;
- l'archivage par saison devient possible sans alourdir le tableau.

Le chemin de migration reste idempotent, dans l'esprit de `migrations.sql` :
créer la table, la remplir depuis les maps existantes, écrire des deux côtés
pendant une période, puis basculer les lectures et retirer la map. Rien n'oblige
à tout faire d'un coup.

**L'étape intermédiaire, bien moins coûteuse : étendre `upsertOneVersionne` aux
fiches de personnes.** Elle ne réorganise rien, elle transforme un écrasement
silencieux en conflit signalé (« quelqu'un a modifié cette fiche entre-temps —
voici sa version »). Si une seule chose devait être faite du chapitre long
terme, ce serait celle-là.

**Des agrégats côté SQL pour les compteurs**, afin que les bandeaux de chiffres
cessent d'exiger le chargement de cinq tables entières par page — et que le
temps réel n'entraîne plus le rechargement complet d'une table à chaque
modification d'une seule ligne.

**Une notion de saison**, pour archiver sans que le tableau s'allonge
indéfiniment ; la case « afficher les dates passées » est la bonne intention,
mais elle ne borne rien.

**Réconcilier les deux référentiels de date.** Les demandes ciblent des
identifiants de dates ; les réponses sont indexées par jour calendaire. Déplacer
une date d'un jour orpheline donc la réponse qui s'y rattachait, sans que
personne ne le voie. C'est le genre de faux silencieux qui, sur une page qu'on
consulte pour décider, coûte cher.

---

## 5. Si l'on ne devait retenir que trois choses

1. **Un signe, un sens.** Le vert qui change de signification d'une page à
   l'autre, et le tableau écrit deux fois, sont le même problème : il n'y a pas
   de source unique pour dire à quoi ressemble une disponibilité. C'est le
   chantier qui rend tous les autres plus faciles.
2. **Rendre le « à confirmer » au titulaire.** Quelques lignes, et la
   production récupère une information qu'elle dépouille aujourd'hui à la main.
3. **Brancher `upsertOneVersionne` sur les fiches de personnes.** La protection
   contre l'écrasement est déjà écrite dans le projet ; elle ne demande qu'à
   servir là où deux personnes écrivent vraiment en même temps.

