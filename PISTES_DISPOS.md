# Les pistes, une par une

Catalogue de ce qui a été identifié dans `AUDIT_LISIBILITE_DISPOS.md`, découpé
en gestes numérotés pour qu'on puisse en discuter un par un — « fais CT-2 et
CT-7 » plutôt que « applique le court terme ».

Chaque fiche dit : le problème, le geste exact, l'effort, et ce à quoi il faut
faire attention. Aucune n'est engagée ; rien n'a été modifié dans l'application.

**Effort** : *petit* = une séance de travail ; *moyen* = une journée ;
*gros* = plusieurs jours, avec une bascule à surveiller.

---

## Court terme — chaque geste tient seul

Aucun ne touche au modèle de données. Aucun ne dépend d'un autre.

### CT-1 · Un seul sens pour le vert
**Effort : petit — aucune dépendance**

*Le problème.* `--ok` (vert) signifie « disponible » sur la Grille interne et
« affecté·e » sur la Vue d'ensemble. L'export PDF de la Grille interne peint
pourtant « dispo » en bleu : la page se contredit elle-même.

*Le geste.* Aligner la Grille interne sur la Vue d'ensemble, qui a la
sémantique la plus riche : le vert plein reste réservé à « affecté·e »,
« disponible » devient l'aplat bleu à encre foncée. Trois retouches dans
`disponibilites.html` : la pastille de bouton (l. 61), la pastille de légende
(l. 32-38), et rien à changer dans le PDF — qui devient juste, et dont le
commentaire « même code couleur que la grille à l'écran » cesse d'être faux.

*Attention.* L'équipe a l'habitude du vert « libre » sur cette page. Le
changement se dit dans le sous-titre de la page, pas dans une note interne.

### CT-2 · Rendre le « à confirmer » aux titulaires
**Effort : petit — aucune dépendance**

*Le problème.* La page du ou de la titulaire n'offre que Disponible et
Indisponible (l. 633-634), alors que les trois pages internes manipulent quatre
états et que le style du troisième bouton est déjà écrit (l. 98). L'incertitude
n'a aucun canal et se déverse dans le champ de précision, qu'il faut dépouiller
à la main.

*Le geste.* Un troisième bouton « À confirmer » dans le groupe de statuts, câblé
sur la valeur `incertain` que tout le reste du système lit déjà.

*Attention.* Vérifier le cas de la personne déjà affectée : le bouton
« indisponible » est verrouillé pour elle, le troisième état doit suivre la même
règle plutôt que d'ouvrir une porte dérobée.

### CT-3 · Une encre de statut par thème
**Effort : petit — aucune dépendance**

*Le problème.* Les symboles ✓ ✕ ? sont en `#fff` littéral. Sur les aplats de la
palette sombre, ils tombent autour de 1,7:1 : le symbole disparaît et
l'information redevient portée par la couleur seule — exactement ce qu'il était
censé éviter, y compris pour les daltonismes.

*Le geste.* Deux jetons dans `base.css` : `--sur-statut` blanc en clair, sombre
en mode sombre, puis remplacer les `color:#fff` aux cinq endroits recensés
(`base.css:760-762`, `recap.html:211-214`, `disponibilites.html:61-63`,
`dispo-titulaire.html:96-98`). Même chose pour le prune du texte des réponses,
avec un jeton d'encre distinct de l'aplat — le patron existe déjà une fois dans
`base.css:646-649`, jamais généralisé.

*Attention.* Garder deux jetons et non une encre unique : le blanc reste le bon
choix sur les aplats du thème clair.

### CT-4 · Signaler (ou masquer) les dates annulées
**Effort : petit — aucune dépendance**

*Le problème.* Une date annulée garde une colonne pleine et cliquable sur les
deux grilles : on peut y marquer des dispos et y affecter quelqu'un. Le statut
est pourtant déjà transporté, simplement jamais testé au rendu.

*Le geste.* Barrer et estomper la colonne (le repère existe déjà dans
`tournees.html`), plus une case « Masquer les dates annulées » cochée par
défaut, à côté de « Afficher aussi les dates passées ».

*Attention.* La Vue d'ensemble écarte déjà les dates annulées à trois endroits
(l. 516, 1033, 1064) : vérifier les trois pour ne pas créer une quatrième règle
divergente.

### CT-5 · Ranger les lignes dans l'ordre de l'orchestre
**Effort : petit — aucune dépendance**

*Le problème.* L'annuaire trie par pupitre avec le commentaire explicite « ordre
de l'orchestre, pas alphabétique ». Les trois pages de dispos trient
alphabétiquement : on cherche un pupitre en sautant de ligne en ligne.

*Le geste.* Réutiliser `PUPITRE_ORDER` et le comparateur de `annuaire.html:358`.
Optionnellement, une bande de groupe par pupitre — le socle sait déjà les
dessiner.

*Attention.* Le tri par pupitre et le rangement des remplaçant·es sous leur
titulaire doivent s'articuler, pas se concurrencer.

### CT-6 · La ligne de totaux par date
**Effort : moyen — aucune dépendance**

*Le problème.* La matrice se lit en ligne (une personne, sa saison) et pas en
colonne : rien ne répond à « cette date est-elle couverte ? ».

*Le geste.* Une rangée finale `.co-matrix-total` — le style existe dans le socle
(`base.css:763-764`) et la maquette de référence la dessine déjà — portant par
colonne le nombre d'affecté·es, et en plus petit le nombre de personnes
disponibles non encore affectées. La donnée est déjà dans `entries` : aucun
calcul supplémentaire, aucune requête.

*Attention.* Le nombre d'affecté·es est absolu, le nombre de disponibles ne
porte que sur les lignes affichées et change donc avec les filtres. Cette
différence doit être écrite dans le libellé, sinon les deux chiffres seront lus
comme équivalents.

### CT-7 · Un historique de relance qui dit vrai
**Effort : petit — aucune dépendance**

*Le problème.* La date de dernière relance n'apparaît pas sur la page où l'on
relance (la Vue d'ensemble l'affiche pourtant). Et « Relancer les retardataires »
copie un texte sans jamais inscrire la trace : tout le monde reste « Première
relance » et le décompte ment.

*Le geste.* Afficher « Relancé le 12 mars » à côté du bouton, en reprenant le
gabarit du badge « ✉ 12 mars » de la Vue d'ensemble ; et faire inscrire la trace
par l'action groupée, derrière une confirmation explicite.

*Attention.* Marquer « relancé » sur une simple copie crée un faux positif si le
message n'est jamais collé — d'où la confirmation, seul garde-fou raisonnable
sans traçage d'envoi.

### CT-8 · Les précisions sur la page où l'on relance
**Effort : moyen — aucune dépendance**

*Le problème.* Pour comprendre *pourquoi* quelqu'un est incertain avant de lui
réécrire, il faut changer de page, le retrouver dans la matrice, survoler, puis
revenir.

*Le geste.* Aucune donnée nouvelle : la page charge déjà les fiches entières,
`disponibilitesCommentaires` est dans le cache, inutilisé. Ajouter sous le nom
une ligne discrète — `💬 12 mars : « je peux si ça finit avant 22h »` — avec le
compte au-delà d'une précision, et le repère orange/prune selon qu'on a répondu.

*Attention.* Les cartes dépliées comptent déjà des centaines de lignes : clamper
à une ligne et se limiter aux dates du projet courant.

### CT-9 · La Grille interne récupère les acquis de la Vue d'ensemble
**Effort : moyen — aucune dépendance**

*Le problème.* C'est la page de *saisie*, et la seule sans en-tête de dates
collant : sur ordinateur, on saisit en allant vérifier la colonne dix lignes
plus haut. Chaque clic re-rend tout le tableau sans restaurer le défilement.

*Le geste.* Plafonner la hauteur avec défilement dans les deux sens, rendre le
`thead` collant, et reprendre à l'identique le bloc de mémoire du défilement de
`recap.html:1010-1024`.

*Attention.* `border-collapse:separate`, nécessaire au `thead` collant, change le
rendu des filets — à vérifier tout de suite sur une grille réelle.

### CT-10 · Un `@media print` minimal
**Effort : petit — aucune dépendance**

*Le problème.* Zéro `@media print` dans tout le dépôt. Ctrl+P donne une feuille
inutilisable, barre flottante comprise, et rien n'oriente vers l'export PDF qui
est pourtant fait pour ça.

*Le geste.* Un bloc unique dans `base.css`, donc valable pour les quatre pages :
masquer navigation, barre de modes et zones d'action ; libérer les fenêtres de
défilement pour que la matrice entière parte à l'impression ; fond blanc, format
paysage. Plus un paragraphe visible seulement à l'impression : « Pour un tirage
complet et paginé, utilisez le bouton Exporter en PDF ».

*Attention.* Cela rend l'impression navigateur *non cassée*, pas belle : à
80 dates elle restera coupée en largeur. Le PDF A3 demeure le bon chemin, et le
message imprimé est là pour le dire.

### CT-11 · Recherche et filtres qui survivent au temps réel
**Effort : petit — aucune dépendance**

*Le problème.* Sur Demandes titulaires, le champ de recherche et le filtre « en
attente » sont reconstruits vides à chaque rafraîchissement temps réel : la
sélection s'efface pendant qu'on travaille.

*Le geste.* Sortir les deux contrôles de la zone re-dessinée, les poser dans le
HTML statique, brancher leurs écouteurs une seule fois, et ré-appliquer le
filtre courant à la fin de chaque rendu. Rien à restaurer puisque plus rien
n'est détruit.

*Attention.* Leur position visuelle change (au-dessus de la carte au lieu de
dedans) : c'est le seul vrai travail, côté CSS.

### CT-12 · La matrice au clavier et au lecteur d'écran
**Effort : moyen — aucune dépendance**

*Le problème.* La Vue d'ensemble écrit désormais en base à chaque clic, et cette
écriture est strictement à la souris. La Grille interne, elle, rend déjà ses
cases en vrais boutons.

*Le geste.* Remplacer le `<span>` de case par un `<button>` portant les mêmes
classes et un `aria-label` composé (« Marie Dupont, 12 mars Lyon : disponible »)
à partir des variables déjà présentes dans la boucle. La délégation de clic
existante continue de fonctionner sans changement.

*Attention.* Le socle impose `min-height:44px` à tout `button` sous 820 px : les
cases gonfleraient sur mobile sans une règle de portée limitée.

---

## Moyen terme — la forme des pages

### MT-1 · Un vocabulaire des statuts partagé
**Effort : moyen — aucune dépendance. C'est la base des autres.**

*Le problème.* Chaque page redéclare les états, le cycle de clic, les couleurs et
les libellés. C'est la cause mécanique de CT-1 et CT-3.

*Le geste.* Un module `assets/dispo-statuts.js` sans dépendance, sur le modèle
de `messages-dispo.js` que les quatre pages chargent déjà : la liste ordonnée des
états, `etatSuivant()` / `etatPrecedent()` (cette dernière n'existe nulle part et
supprime à elle seule le « clic de trop » quand on dépasse la bonne valeur), les
libellés, et le rendu d'une case pour l'écran comme pour le PDF.

*Attention.* Le passage de l'export PDF est l'étape délicate : sortir un PDF
avant et un après pour comparer.

### MT-2 · Un seul moteur de matrice
**Effort : gros — dépend de MT-1**

*Le problème.* Deux implémentations dessinent le même objet sans rien de commun,
et la Grille interne ne profite d'aucun des gains faits sur la Vue d'ensemble.

*Le geste.* Extraire le rendu dans `assets/matrice-dispo.js` exposant une
fonction unique, produisant le composant `.co-matrix` du socle et rendant chaque
case en vrai bouton. La Grille interne quitte son `<table>` et hérite
gratuitement de l'en-tête collant, de la mémoire du défilement et du repli
mobile.

*Attention.* La plus lourde du lot, sur les deux pages les plus ouvertes. Fait
CT-9 obsolète (ne pas faire les deux).

### MT-3 · Un seul comptage
**Effort : moyen — aucune dépendance pour le premier niveau**

*Le problème.* « Combien n'ont pas répondu ? » a deux réponses contradictoires,
et la règle « liste de dates vide = tout le projet » est recopiée sept fois côté
client, une fois en SQL.

*Le geste.* Un module de décision partagé qui porte cette règle une seule fois,
appelé par les deux pages. La définition à retenir est celle de Demandes
titulaires (ne compter que les dates couvertes par le lien), qui est la juste.

*Attention.* Le jour où l'on double cela d'une fonction SQL, on recrée la
divergence en base : ne le faire qu'une fois le module JS en place et partagé.

### MT-4 · Lire le tableau dans l'autre sens
**Effort : moyen — dépend de MT-2 et MT-3**

*Le problème.* La question la plus fréquente au bureau — « qui est dispo le
15 mars ? » — demande de balayer à l'œil une colonne de 76 px sur cent lignes.

*Le geste.* Au-delà de la ligne de totaux (CT-6), une véritable vue par date :
une colonne dépliée, les gens rangés par pupitre, les manques en tête. Le patron
existe déjà dans Demandes titulaires (deux vues, choix retenu).

*Attention.* Des compteurs en gras font autorité immédiatement : s'ils divergent
de ceux de Demandes titulaires, on aura ajouté une troisième vérité. D'où la
dépendance à MT-3.

### MT-5 · Rapatrier le dialogue là où l'on relance
**Effort : moyen — MT-3 souhaitable avant**

Version aboutie de CT-8 : les précisions ne sont plus seulement *affichées* sur
la page de relance, on peut y répondre. Contrepartie honnête à assumer : retirer
la duplication correspondante de la Vue d'ensemble, sans quoi `suivi-dispo.html`
(déjà 1 785 lignes) devient plus difficile à tenir.

### MT-6 · Écrire une case, pas une fiche
**Effort : gros — aucune dépendance technique**

*Le problème.* C'est le risque numéro un du modèle, et il est silencieux. Chaque
écriture remplace la map entière : un·e titulaire qui répond depuis son
téléphone pendant qu'on corrige sa ligne, et les cases de l'un ou l'autre
disparaissent sans erreur. Le temps réel resynchronise l'écran, pas la donnée
perdue.

*Le geste.* Une fonction SQL ciblée qui ne modifie qu'une clé (`jsonb_set` sur
une date) au lieu de remplacer la colonne. Deux personnes sur deux dates
différentes cessent de s'écraser — **sans changer une ligne du modèle**.

*Attention.* On remplace un chemin d'écriture éprouvé sur la donnée la plus
précieuse de l'application. Une fonction mal écrite ne perd pas des cases : elle
perd des réponses de titulaires. À ne pas mener en même temps que MT-2, qui
touche les mêmes fichiers.

### MT-7 · Tenir l'échelle
**Effort : moyen — les premiers pas sont indépendants**

*Le problème.* À 60 personnes × 80 dates, chaque matrice porte ~4 800 cases, et
la page en affiche deux — entièrement reconstruites à chaque frappe de recherche
et à chaque événement temps réel. Dates passées comprises, on approche
8 000 cases.

*Le geste, du plus simple au plus technique.* Une fenêtre de période explicite
(« 3 mois à venir » par défaut, « saison entière » à un clic) ; des projets et
des pupitres repliables ; puis le rendu incrémental — ne re-rendre que les lignes
touchées, et filtrer la recherche en masquant plutôt qu'en reconstruisant, ce que
Demandes titulaires fait déjà.

*Attention.* Le rendu incrémental introduit le risque que l'écran diverge de la
donnée si un chemin de mise à jour est oublié. Les deux premiers pas donnent
l'essentiel du confort sans ce risque.

### MT-8 · Deux pages au lieu de trois
**Effort : moyen — dépend de MT-2**

*Le problème.* Trois écrans montrent la même matrice avec des pouvoirs
différents, rangés dans deux sections de menu, sous des noms qui ne disent pas
qui fait quoi — le menu annonce « Grille interne », la page s'intitule
« Disponibilités », et « Vue d'ensemble » vit hors de la section Disponibilités.

*Le geste.* Une section « Disponibilités » qui les contient toutes : *un endroit
pour demander et relancer*, *un endroit pour voir et décider*. La Grille interne
n'a plus en propre que son import de tableur — elle peut devenir cet import,
appelé depuis la Vue d'ensemble.

*Attention.* **C'est un geste politique autant que technique.** La Grille interne
est l'outil de saisie rapide (« un musicien appelle, je note ») : si sa
disparition rallonge ce geste-là, la fusion sera vécue comme une perte, à raison.
À trancher avec l'équipe, pas au vu du code seul.

---

## Long terme — les fondations

### LT-1 · Une carte fiable du schéma
**Effort : petit — aucune dépendance. Recommandé en premier.**

*Le problème.* `SUPABASE_SCHEMA.md` et `DATA_STRUCTURE.md` décrivent une base qui
n'existe plus : ils annoncent un accès public sans compte et six tables, quand le
schéma réel a des rôles, des fonctions `security definer`, des jetons et un
journal d'audit.

*Le geste.* Un script `outils/schema-courant.mjs` (le dossier existe déjà) qui
interroge le schéma et régénère la documentation : tables et colonnes réelles,
policies effectives, tables réellement publiées en temps réel, fonctions en
vigueur. Vrai par construction, à relancer après chaque strate ajoutée.

*Attention.* Une doc générée dit ce qui *est*, jamais *pourquoi*. Les intentions
écrites en français — une vraie qualité de ce dépôt — restent à la main.

### LT-2 · Rendre les dates de projet requêtables
**Effort : petit pour le premier geste — aucune dépendance**

*Le geste.* Une vue SQL qui déplie le tableau `dates` de chaque tournée en
lignes. `create or replace`, donc rejouable ; aucune donnée déplacée. Deviennent
alors interrogeables : les dates d'une période, les annulées, celles sans
affectation.

*Attention.* Une vue sur du JSONB ne s'indexe pas : c'est un gain de lisibilité
et de non-duplication, **pas un gain de performance**. À dire clairement pour ne
pas en attendre ce qu'elle ne donne pas. C'est aussi le bon moyen d'éprouver ce
qu'apporterait LT-3 avant de s'y engager.

### LT-3 · La disponibilité devient une ligne
**Effort : gros — LT-1 fortement conseillé avant**

*Le geste.* Une table `disponibilites(personne_type, personne_id, jour, statut,
precision, reponse_prod, updated_at)`, les maps JSONB devenant un miroir le temps
de la bascule (double écriture, puis bascule des lectures, puis retrait).

*Ce que ça débloque, côté lisibilité* — car c'est bien de cela qu'il s'agit :
l'écriture par cellule met fin à l'écrasement ; « qui est dispo le 15 mars ? »
devient une requête ; les compteurs se calculent en base au lieu d'être recomptés
à chaque rendu ; `updated_at` par case permet enfin de dire « répondu hier »
plutôt que « répondu » ; l'archivage par saison devient un filtre.

*Attention.* Le vrai coût n'est pas le SQL. C'est que `db.js` repose entièrement
sur « une table = une collection entière en cache » : cette table-là ne s'y range
pas. **MT-6 retire déjà l'essentiel du risque d'écrasement pour bien moins
cher** — LT-3 ne se justifie que si l'on veut aussi les requêtes et les agrégats.

### LT-4 · Des agrégats SQL au service de l'interface
**Effort : moyen — dépend de LT-2, bien plus efficace après LT-3**

Poser en base les calculs que les pages refont chacune à leur façon, à commencer
par la règle « liste de dates vide = tout le projet », aujourd'hui écrite à huit
endroits. Les pages cessent alors de charger cinq tables entières pour afficher
sept chiffres.

*Attention.* Tant que la bascule n'est pas finie, la règle existe en deux
exemplaires — exactement le mal qu'on veut soigner. Migration page par page.

### LT-5 · Saisons et historisation
**Effort : moyen — dépend de LT-3**

Une fois les dispos en lignes, archiver cesse d'être un déménagement pour devenir
un choix de fenêtre : rien à déplacer, donc rien à casser. Une petite table
`saisons` et une lecture par défaut bornée. Au passage, la purge du journal
d'audit, écrite mais jamais appelée.

*Attention.* La saison n'existe pas dans le vocabulaire actuel du produit : il
faut l'inventer, et accepter qu'un découpage ne règle pas les projets à cheval
sur l'été.

### LT-6 · Jetons, sollicitations et relances
**Effort : moyen — LT-1 est un préalable strict**

Séparer l'identité (le lien d'une personne) du droit (la sollicitation sur un
projet et des dates), historiser les relances au lieu d'écraser une seule date,
et fermer la cascade de suppression — aujourd'hui retirer quelqu'un laisse des
jetons vivants et des affectations pointant vers une fiche disparue.

*Attention.* Toucher au routage des jetons **casse des liens déjà envoyés** et
enregistrés dans des conversations WhatsApp : il faut accepter les deux formes
pendant au moins une saison complète.

---

## Si l'on cherche le meilleur rapport effort / effet

Sans rien préjuger de ce que vous déciderez, l'ordre que je proposerais :

1. **CT-2** (le « à confirmer ») — quelques lignes, et une information cesse de
   se perdre en texte libre.
2. **CT-1 et CT-3** ensemble — le code couleur cesse de se contredire, et les
   symboles redeviennent lisibles en sombre.
3. **CT-4, CT-5, CT-7** — trois petits gestes qui retirent chacun une source
   d'erreur quotidienne.
4. **CT-6** — la lecture verticale, qui manque à chaque réunion de distribution.
5. **MT-1** — le vocabulaire partagé, qui empêche les divergences de revenir.
6. **MT-6** — la protection contre l'écrasement, sans toucher au modèle.
7. **LT-1 puis LT-2** — la carte, puis les dates requêtables : de quoi décider en
   connaissance de cause si LT-3 vaut la peine.

MT-8 (deux pages au lieu de trois) est la seule qui ne se tranche pas au vu du
code : elle se décide avec les personnes qui s'en servent tous les jours.
