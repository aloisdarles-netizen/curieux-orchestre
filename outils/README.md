# Voir le rendu du site sans navigateur

`capture.cjs` ouvre les pages du site dans Chromium et en tire des images, en
mobile comme en bureau. Il sert à répondre à une question qu'aucun contrôle de
syntaxe ne tranche : *est-ce que ça a l'air juste ?*

## Pourquoi cet outil existe

La refonte a introduit trois régressions mobiles d'un coup, toutes invisibles
aux vérifications faites jusque-là — syntaxe JavaScript, balises équilibrées,
classes définies, variables CSS résolues. Tout passait, et pourtant les 146
boutons du site avaient perdu leur cible tactile de 44 px et deux écrans
imposaient 1 000 px de défilement horizontal sur un téléphone.

La cause était toujours la même : `assets/base.css` porte des règles mobiles
qui visent des sélecteurs précis, et le passage à la charte les a remplacés
sans que rien ne signale la rupture. Une capture l'aurait montré en une
seconde.

## Utilisation

```sh
npm i playwright-core --no-save          # Chromium est déjà là
python3 -m http.server 8099 &            # servir le site
node outils/capture.cjs tournees,recap mobile
node outils/capture.cjs accueil bureau
node outils/capture.cjs tournees bureau ':nth-match([data-assign], 3)'
node outils/capture.cjs "technique-date?t=demo-tour1&d=d1" mobile "" "fieldset.groupe:nth-of-type(3)"
```

Quatre arguments, tous optionnels :

1. les pages, séparées par des virgules et sans `.html` — chacune peut porter
   sa requête (`technique-partage?jeton=demo`) pour les écrans qui ne s'ouvrent
   que sur un jeton ;
2. `mobile` (390 px) ou `bureau` (1280 px) ;
3. un sélecteur à cliquer avant la capture — sans lui, les panneaux qui ne
   s'ouvrent qu'au clic resteraient invisibles ;
4. un sélecteur à cadrer : une page de formulaire fait dix mille pixels de
   haut, y relire un détail revient sinon à le chercher dans une vignette.

Les images vont dans `$CAPTURES`, `/tmp/captures` par défaut.

Chaque page rapporte trois choses : un débordement horizontal s'il y en a un,
avec les éléments fautifs ; les erreurs JavaScript survenues au chargement ; et
l'image elle-même.

## Relire les PDF

Les exports sont produits dans le navigateur par jsPDF : le seul moyen de
savoir ce qu'ils donnent est de les faire produire pour de vrai, puis de les
regarder. Deux outils s'en chargent.

```sh
pip install pymupdf
node outils/capture-pdf.cjs "technique-partage?jeton=demo" "[data-pdf]" '[data-aller="r1"]'
python3 outils/pdf-en-images.py /tmp/captures/technique-partage.pdf
```

`capture-pdf.cjs` ouvre la page avec le même faux `CurieuxDB` que `capture.cjs`
— importé, non recopié : deux copies auraient divergé au premier champ ajouté —
clique le bouton d'export et récupère le fichier téléchargé. Ses arguments : la
page, le sélecteur du bouton d'export, et un sélecteur à cliquer avant, pour
atteindre la date voulue. `pdf-en-images.py` rend ensuite chaque page en PNG.

Le jeu de démo contient volontairement une journée surchargée — six semis, dix
repères horaires, cinq vacations, une note d'accès longue. C'est elle qui met à
l'épreuve la promesse de `assets/pdf-charte.js` : un export tient sur une seule
feuille A4. Le nombre de pages annoncé par `pdf-en-images.py` le vérifie.

## Comment il contourne l'authentification

Les pages appellent `CurieuxDB`, déclaré `const` dans `assets/db.js` — une
liaison lexicale, jamais posée sur `window`, donc inatteignable depuis un
script injecté. Le garde d'authentification renverrait par ailleurs vers la
page de connexion, et les policies RLS empêchent de toute façon de lire la base
sans compte.

L'outil remplace donc `assets/db.js` au niveau réseau par un faux qui sert un
jeu de démonstration et répond oui aux contrôles d'accès. Le garde passe alors
de lui-même, sans qu'on ait à bloquer la moindre redirection. Un `Proxy` répond
à toute méthode non prévue plutôt que de lever : les pages en appellent une
trentaine, les énumérer serait autant d'occasions d'en oublier une et de
capturer un écran d'erreur.

## Mesurer un débordement correctement

Le premier détecteur signalait un faux positif sur la vue d'ensemble. Il
comparait le rectangle de chaque élément à la largeur de la fenêtre — or les
enfants d'un conteneur à `overflow-x:auto`, comme le menu principal, la
dépassent légitimement.

Le seul signe fiable est que la page défile vraiment : on tente un
`scrollTo(9999, 0)` et on regarde si `scrollX` a bougé. Les éléments fautifs ne
sont listés qu'ensuite, en excluant ceux qu'un ancêtre découpe déjà.

---

# Régénérer la carte du schéma

`schema-courant.mjs` lit la base et réécrit la section « Le schéma tel qu'il
est » de `SUPABASE_SCHEMA.md` : tables, colonnes, policies effectives, index,
tables réellement publiées en temps réel, fonctions et leurs droits.

## Pourquoi cet outil existe

La documentation du schéma a été écrite une fois, juste ce jour-là, et a cessé
de l'être. Elle annonçait « pas de compte utilisateur », une policy
`using (true)` sur toutes les tables et le temps réel partout, alors que la base
avait entre-temps des rôles, des liens à jeton, des fonctions `security definer`
et une publication temps réel qui ne couvrait pas tout — un abonnement posé sur
une table absente de cette liste ne se déclenche jamais, sans que rien ne le
signale.

Une carte fausse est pire qu'une carte absente : on décide en la croyant. Elle
se produit donc depuis la base, et le *pourquoi* — les intentions écrites en
français, qui font la valeur de ces fichiers — reste seul à la main.

## Utilisation

```sh
npm i postgres --no-save                 # pilote SQL, hors dépendances du site
SUPABASE_DB_URL='postgresql://…' node outils/schema-courant.mjs
SUPABASE_DB_URL='postgresql://…' node outils/schema-courant.mjs --verifier
```

L'URI de connexion est dans Supabase → Project Settings → Database → Connection
string. Ce n'est pas la clé publishable de `assets/db.js` : celle-ci ne lit pas
les catalogues système, et c'est très bien ainsi.

`--verifier` ne réécrit rien et sort en échec si la documentation ne correspond
plus à la base — de quoi le lancer après chaque strate ajoutée à
`migrations.sql`.

---

# Les tests

Trois scripts rejouent un bug précis, chacun dans un vrai navigateur. Ils
sortent en échec (code 1) dès qu'une vérification tombe : de quoi les enchaîner
avant un déploiement.

```sh
npm i playwright-core --no-save
python3 -m http.server 8099 &           # les trois servent le site en local
node outils/test-recap-mon-ordre.cjs
node outils/test-remplacants.cjs
node outils/test-suivi-dispo-doublons.cjs
```

| Script | Ce qu'il garde |
| --- | --- |
| `test-recap-mon-ordre.cjs` | Sous « Mon ordre », titulaires et remplaçant·es se rangent dans la même liste : un nom glissé y reste, une ligne indentée peut en sortir, et changer de filtre ne déplace personne d'autre. |
| `test-remplacants.cjs` | Les quatre issues de « Enregistrer ma liste » — dont celle qui laissait le bouton figé sur « Enregistrement… ». |
| `test-suivi-dispo-doublons.cjs` | Une lecture en échec n'est plus prise pour un inventaire vide : le suivi des dispos ne recrée pas 85 demandes existantes. |

Chacun porte en tête le récit du bug qu'il surveille — c'est ce qui permet, des
mois plus tard, de savoir si une vérification qui gêne protège encore quelque
chose.
