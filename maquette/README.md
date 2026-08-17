# La maquette, écran par écran

Référence de la refonte 2026, extraite du fichier Claude Design
« Refonte UI/UX Curieux Orchestre ». Un fichier par écran, nommé comme la page
du site qui doit lui correspondre — `tournees.html` ici décrit ce que
`../tournees.html` doit afficher.

`_maquette-complete.html` est la maquette entière : les 19 écrans dans leur
appli mono-page d'origine, avec le bandeau, le sous-menu et les données de
démonstration.

## Pourquoi ces fichiers sont ici

Le dossier `refontecurieuxfichiers 2`, poussé sur les branches `relooking` et
`refonte-ui-ux`, n'est **pas** la maquette : c'est un portage partiel. Il a
repris l'habillage — bandeau prune, sous-menu, titres de section à filet
orange, et surtout `assets/base.css` — mais a laissé les corps de page dans
l'ancien markup. Appliqué tel quel, il donne un site qui a le bon en-tête et le
mauvais contenu.

Deux mesures le montrent :

- `assets/base.css` définit 68 classes `co-*`. Les pages n'en posent que 36.
  Les 32 restantes — dont les 10 classes `co-matrix*` de la grille de
  disponibilités, `co-stat` / `co-stats` / `co-stat-num` des tuiles de chiffres,
  `co-legend*`, `co-rows-head`, `co-savebar`, `co-field-row` — sont livrées et
  jamais utilisées. Le vocabulaire est là, le markup l'ignore.
- Chaque page ne pose qu'une à quatre classes `co-*`, presque toujours celles de
  l'en-tête (`co-page-head`, `co-fade`), jamais celles du corps.

## Comment lire un écran

Ce sont des extraits du moteur de gabarits de Claude Design, pas du HTML à
copier. Trois balises à traduire :

| Balise maquette | Équivalent dans le site |
|---|---|
| `<sc-for list="{{ x }}" as="i">` | une boucle `.map()` dans le JS de la page |
| `<sc-if value="{{ c }}">` | un rendu conditionnel |
| `<x-import … Button variant="primary" size="sm">` | `<button class="co-btn primary sm">` |

Les variantes de bouton employées par la maquette sont `primary`, `secondary` et
`tonic` — toutes trois définies dans `assets/base.css`.

Les `style="…"` inline sont la sortie de l'outil de design : ils donnent les
valeurs visées (espacements, tailles, couleurs), mais doivent passer par les
classes `co-*` et les variables de charte plutôt qu'être recopiés. C'est
exactement la duplication que l'en-tête de `base.css` dit vouloir éviter.

## Deux exports concordants

La maquette a été livrée deux fois : en fichier joint, puis en artefact
`2a157ffc-c813-4283-ba33-469219e2da75`. Les deux bundles ne diffèrent que sur
33 lignes sur 2 475, toutes des identifiants d'assets régénérés à l'export. Le
design lui-même est identique — la référence est sûre.
