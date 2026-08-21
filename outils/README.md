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
