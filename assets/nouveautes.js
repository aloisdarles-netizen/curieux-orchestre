/* ============================================================================
   « Ce qui a changé » — la fenêtre qui s'ouvre une fois, après une mise à jour.
   ============================================================================
   Une mise à jour arrivait sans un mot : le bouton avait bougé, le statut
   s'appelait autrement, la section n'était plus au même endroit — et chacun·e
   le découvrait en cherchant. On le disait sur le groupe, quand on y pensait,
   et ça ne touchait que celles et ceux qui lisaient ce jour-là.

   Ce fichier tient la liste des livraisons, la plus récente en premier. C'est
   le MAINTENEUR qui l'alimente, à la main, au moment du déploiement — en même
   temps qu'il incrémente la version de sw.js. Rien ne la génère : ce qu'on y
   écrit s'adresse à l'équipe, pas à un journal de commits, et on n'y met que
   ce qu'une personne verra ou fera autrement.

   `version` est la DATE ISO de la livraison (AAAA-MM-JJ). Deux raisons : elle
   se lit telle quelle dans la fenêtre, et l'ordre alphabétique des chaînes
   est l'ordre chronologique — la comparaison « plus récent que » n'a besoin
   d'aucun découpage. Deux livraisons le même jour se distinguent par un
   suffixe ('2026-09-10-2'), qui trie encore juste.

   La version vue par chaque personne est un réglage qui la suit d'un appareil
   à l'autre : preferences_utilisateur, page 'nouveautes', { vue }. Le
   localStorage double la mémoire — repli tant que la migration n'est pas
   jouée, ou hors ligne — et on retient la plus récente des deux : une écriture
   serveur qui n'est pas partie ne doit pas rouvrir la fenêtre au prochain
   passage.

   Ne s'affiche que derrière requireAdminAuth / requireSuperAdminAuth (voir
   brand-assets.js) : jamais sur une page ouverte par lien personnel — ces
   pages n'appellent pas les gardes, et les musicien·nes n'ont rien à faire
   de nos changements de bandeau.
   ============================================================================ */

const CURIEUX_NOUVEAUTES = [
  {
    version: '2026-09-20-3',
    titre: 'Les partitions se proposent d\'après les instruments',
    points: [
      "Dans « Qui lit quoi », un bouton « Proposer d'après les instruments… » lit l'instrument de chaque personne de l'opération et le nom de chaque partie du spectacle, et propose qui lit quoi. Jusqu'ici, tout se cochait à la main, personne par personne, y compris les vingt cas évidents.",
      "Le principe est celui du métier : un violoniste a accès aux parties de violon — toutes —, et c'est le pupitre qui décide en répétition qui lit laquelle. La page ne tranche pas Violon 1 contre Violon 2 à la place du chef d'attaque. Quand la fiche porte un numéro (« Violon 2 », « Cor 3 »), seule la partie qui le porte est proposée. Une partie « solo » ne va qu'à une fiche qui dit « solo ».",
      "La page PROPOSE, elle n'affecte pas seule : la fiche liste chaque personne avec ses parties, cochées d'avance ; on décoche, on valide, et seul ce qui est coché s'écrit. Un instrument sans partie dans le spectacle passe « à choisir » parmi les parties de son pupitre.",
      "Ce qui est déjà affecté ne bouge jamais : la proposition ne concerne que les personnes qui n'ont encore aucune partie de ce spectacle sur cette opération. La matrice reste là pour tout le reste, et les affectations posées d'un coup se retirent d'un coup, comme celles de l'en-tête de colonne.",
      "Les fiches de l'annuaire se lisent telles qu'elles sont : « Flutes » et « Flûtes », « Altos », « Violoncelles » avec son espace final, « Contrebasses » — et les parties telles que Dorico les nomme : « Violoncello1 », « DoubleBass », « 120 Oboe », « Horn 1-2 ». Une personne sans instrument renseigné passe « à choisir » parmi les parties de son pupitre, ou « sans proposition » si son pupitre n'en a aucune : dans les deux cas, c'est le signal qu'il manque un mot dans l'annuaire.",
      "Ce qu'on ne devine pas, et qu'on dit : les doublures (le hautbois 2 qui prend le cor anglais), une seconde partie pour quelqu'un qui en a déjà une, le conducteur — qui ne va qu'au chef.",
    ],
  },
  {
    version: '2026-09-20-2',
    titre: 'La reconnaissance des parties se départage autrement, et apprend l\'italien',
    points: [
      "La détection savait déjà lire l'anglais de Dorico. Elle tranchait en revanche par l'ORDRE des règles — la première qui répondait gagnait —, et les motifs se comparent sur le DÉBUT d'un mot : « cor » attrapait donc « Coronation Anthem », et toute une œuvre chorale partait aux cuivres. C'est désormais le MOTIF LE PLUS LONG qui l'emporte : « violin » (6) bat « cor » (3).",
      "Le même changement corrige « Harpsichord », que « harp » rangeait dans les cordes alors que c'est un clavier, et « Corno inglese », qui allait aux cuivres alors que c'est un hautbois. Il rend au passage inutiles les priorités qu'il fallait obtenir en rangeant les bois au-dessus des cuivres — « English horn » gagne par sa longueur, pas par sa place dans la liste.",
      "L'italien s'ajoute à l'anglais : « Corno », « Fagotto », « Violini », « Arpa ». Un matériel gravé en Italie arrive tel quel, et ça ne coûte qu'une ligne de liste. « Synth1 » rentre enfin dans l'ordre du conducteur, où il manquait.",
      "Vérifié par comparaison avant/après sur les seize parties réelles du dépôt et sur une matrice de 56 noms courants (français, anglais, italien, pluriels, divisi) : 56 sur 56 justes, sept cas corrigés, aucune régression.",
      "Rien n'est reclassé rétroactivement : les pupitres corrigés à la main le restent. À côté du bouton « Reclasser N parties… », qui corrige le PUPITRE, un second bouton « Remettre dans l'ordre (N) » corrige la PLACE dans l'ordre du conducteur — et n'apparaît que si la liste se lirait vraiment autrement. Il ne touche ni les pupitres, ni les fichiers, ni les affectations.",
    ],
  },
  {
    version: '2026-09-20-1',
    titre: 'L\'espace du chœur',
    points: [
      "Un spectacle qui porte un chœur ne se distribue pas comme un spectacle qui n'en porte pas : ses voix ne sont pas des parties d'orchestre, et le chœur est presque toujours un ensemble extérieur dont les choristes ne sont pas dans notre annuaire. La fiche du spectacle gagne un bloc « Le chœur », et la page un quatrième onglet.",
      "Un pupitre « Chœur » s'ajoute, DISTINCT de « Chant » qui désigne les solistes. La distinction n'est pas cosmétique : un lot de chœur « tout le chœur » ne porte QUE les voix — jamais le matériel d'orchestre, même par mégarde. La règle est en base, pas seulement dans l'écran.",
      "LA TONALITÉ se note enfin quelque part. Sur la voix quand tout le jeu est dans un ton, sur le numéro quand un seul descend d'un demi-ton. C'est la première chose qu'un chef de chœur demande, la seule que le matériel d'orchestre n'a jamais besoin de porter, et jusqu'ici elle se perdait entre la réunion où elle se décide et le mail où on la redemande. « reb M », « Eb major », « fa# mineur » se saisissent comme ils viennent et se relisent tous de la même façon.",
      "Le chef ou la cheffe de chœur reçoit une page à lui, en français ou en anglais : ses voix rangées dans l'ordre des tessitures — soprano, alto, ténor, basse, et non l'ordre du conducteur, qui met les altos avec les cordes —, leurs tonalités en tête, et tout se prend d'un bloc en une archive ou voix par voix.",
      "Rien n'est assoupli : le fichier propre ne sort jamais du stockage, chaque exemplaire est filigrané à la volée au nom du chœur et journalisé un par un. Lien, code communiqué séparément, date de fin, révocation immédiate — le dispositif est celui des transmissions, parce que c'est le bon.",
      "PLUSIEURS CHŒURS SUR UNE MÊME SÉRIE, parce que c'est la règle et non l'exception : un chœur amateur ne part pas en tournée, et on chante avec la maîtrise à Rennes, le chœur régional à Nantes, une chorale locale pour la dernière. Chaque chœur a son lot, son lien, son code, sa fenêtre — et ses DATES, cochées parmi celles de l'opération.",
      "L'onglet « Chœurs » se lit dès lors par journée : qui chante le 24 janvier, à quel endroit, et combien ils sont. Deux chœurs sur la même date s'y voient d'un coup d'œil, un lot sans date aussi — c'est presque toujours un oubli, et il ne se verrait nulle part ailleurs.",
      "L'effectif annoncé se saisit là où on parle au chœur, et non par mail trois semaines avant : c'est lui qui chiffre les loges, le transport et les repas. Le chiffre mis en avant n'est plus le total de la série — additionner trois chœurs qui ne se croisent jamais ne correspond à aucune journée — mais LE JOUR LE PLUS CHARGÉ, qui est ce sur quoi on commande.",
      "Le chef de chœur voit ses dates en haut de sa page, avant les partitions et avant même le code : c'est sa première question, et le mail les lui redonne. Une date annulée ne lui est jamais montrée.",
      "Deux boutons préparent le mail au chef de chœur, en français ou en anglais : le lien, les voix, leurs tonalités, la fenêtre d'accès, les conditions d'usage — et la demande d'effectif. Le code, lui, reste à envoyer par un autre canal, comme partout ailleurs.",
      "Le même garde-fou que pour les orchestres invités : un chœur est un TIERS au sens des contrats, même quand il chante avec nous. Le matériel de location ne lui est pas plus retransmissible qu'à un autre ensemble.",
    ],
  },
  {
    version: '2026-09-19-5',
    titre: 'Supprimer un spectacle',
    points: [
      "Un spectacle créé en double, un essai, un matériel déposé sous le mauvais nom : il n'y avait aucun moyen de s'en défaire. C'est fait, dans les réglages du spectacle — et c'est réservé aux comptes admin, comme le budget et les devis.",
      "Avant de confirmer, la page dit exactement ce qui part : le nombre de parties, de fichiers et leur poids, les affectations et combien de personnes verront leurs partitions disparaître, les rattachements aux opérations, les transmissions. Puis elle demande de retaper le nom du spectacle.",
      "Elle REFUSE tant qu'un lot est confié à un ensemble extérieur : leur lien cesserait de fonctionner sans qu'ils en soient avertis, et c'est la seule personne qu'on ne peut pas prévenir. Il faut révoquer d'abord.",
      "Rien n'est détruit tant que le ruban « Annuler » est à l'écran — quinze secondes. C'est le seul filet qui rattrape un fichier : les lignes supprimées restent restaurables depuis la corbeille de l'administration, les PDF non.",
      "Pour un spectacle qui ne se joue plus, la bonne manœuvre reste l'ARCHIVAGE, juste au-dessus : il sort des listes et rien n'est perdu. La suppression sert à autre chose.",
    ],
  },
  {
    version: '2026-09-19-4',
    titre: 'Confier un jeu de parties à un autre ensemble',
    points: [
      "Le cas qu'on ne savait pas traiter : un orchestre invité, étranger ou non, qui reprend le programme et doit travailler dessus. Ses musiciens ne sont pas les nôtres — on confie donc le matériel à la MAISON, pas à cinquante personnes une par une.",
      "Ça se prépare dans la fiche du spectacle, sous la distribution interne : le spectacle est déjà choisi, et les opérations proposées sont les siennes. Un troisième onglet, « Transmissions », répond à l'autre question — qu'est-ce qui est dehors en ce moment, chez qui, et jusqu'à quand.",
      "Un lot, c'est un spectacle (en entier ou quelques parties), un ensemble destinataire, la personne qui en répond, un lien, un code et une date de fin. Le destinataire ouvre une page à lui — en français ou en anglais, selon son navigateur — et récupère tout d'un bloc, en une archive, ou partie par partie.",
      "Rien n'est assoupli : le fichier propre ne sort jamais du stockage, chaque exemplaire est filigrané à la volée et journalisé. La mention change seulement de niveau — « confié à Tokyo Symphony » plutôt que le nom d'une personne, ce qui est la bonne responsabilité entre deux maisons. Si l'ensemble accepte de distribuer nominativement, son bibliothécaire saisit le nom de chaque musicien et on retrouve la traçabilité individuelle, sans créer une seule fiche.",
      "Un lot se révoque d'un clic, se prolonge d'un autre, et l'écran dit ce qui est dehors en ce moment, chez qui, jusqu'à quand, et combien d'exemplaires ont été pris.",
      "Deux boutons préparent le mail à envoyer, en français ou en anglais, avec le lien, le code, ce que contient le lot et les conditions d'usage. Il reste à le coller.",
      "Un garde-fou, et il compte : le matériel de LOCATION (Durand, Boosey, Schott…) ne se retransmet pas à un autre ensemble — c'est l'éditeur qui le lui loue. La page ne peut pas le vérifier ; elle demande qu'on l'affirme, et garde la trace de qui l'a fait.",
    ],
  },
  {
    version: '2026-09-19-3',
    titre: 'Les partitions se travaillent dans l\'ordre où la production décide',
    points: [
      "L'écran partait des fichiers : on déposait dans une bibliothèque hors sol, puis un SECOND écran demandait de recroiser à la main une opération et un spectacle — sans que rien ne dise lesquels vont ensemble. L'ordre est maintenant celui de l'exploitation : je crée le spectacle et je dis sur quelle opération il se joue, j'y range ses parties, puis j'y lie ses musiciens.",
      "Tout un spectacle tient désormais dans une page : ses opérations, son matériel, sa distribution opération par opération, ses réglages. On n'en sort plus pour distribuer.",
      "L'ancien onglet « Affectation » devient « Par opération ». Il ne sert plus qu'à la relecture d'avant première répétition : ce qui est programmé sur une opération, et qui n'a rien à jouer.",
      "Un spectacle se crée par une fiche, plus par une boîte de dialogue — c'est la seconde question, « sur quelle opération ? », qui compte. Deux spectacles ne peuvent plus porter le même nom : c'était le matériel coupé en deux tiroirs et la moitié des musiciens servis.",
      "Le code d'accès se crée avec la programmation, et non plus à la première affectation. Déprogrammer un spectacle d'une opération emporte les affectations correspondantes, et rien d'autre : des partitions laissées derrière resteraient visibles chez des musiciens pour une œuvre qui n'est plus jouée — une erreur qui ne se voit que de leur côté.",
      "Les liens et signets qui portaient les anciens noms d'écran continuent d'ouvrir le bon.",
    ],
  },
  {
    version: '2026-09-19-2',
    titre: 'Les partitions ont leur onglet',
    points: [
      "Côté musicien·ne, les partitions quittent le bas de « Mes dates » pour un onglet à elles, à côté des dates. Elles se trouvaient en défilant six cents pixels de colonnes : une partie déposée la veille d'une répétition pouvait ne pas être vue.",
      "L'onglet porte une pastille : le nombre de parties DÉPOSÉES, OUVERTES et jamais téléchargées par la personne. Un compteur qui descend — et non le nombre de partitions qu'elle possède, qui aurait affiché « 12 » toute la saison. Chaque ligne de la liste dit « à prendre » tant qu'elle n'a pas été prise.",
      "L'onglet est là pour TOUS les musicien·nes, avec ou sans partie affectée : vide, il dit « rien pour l'instant, et ça arrivera ici ». Les technicien·nes, qui reçoivent le même lien personnel, ne le voient pas. C'est le métier qui décide, jamais le contenu du jour — un menu qui change de forme d'une semaine à l'autre ne s'explique pas au téléphone.",
      "Rien de nouveau à envoyer : ni lien, ni code, ni message. Les liens en circulation ouvrent le nouvel onglet, et les codes d'opération déjà saisis restent valables.",
    ],
  },
  {
    version: '2026-09-19',
    titre: 'Les partitions',
    points: [
      "Une nouvelle section dans le bandeau : la bibliothèque d'orchestre. On y range le matériel par SPECTACLE — EXPEDITION 33 une fois, pas une fois par opération — et on le sort ensuite pour chaque tournée ou enregistrement.",
      "Le dépôt lit le nom des fichiers et propose la partie de chacun : « 410 Piano_merged.pdf » devient Piano. Ce qu'il n'a pas su reconnaître remonte en tête de liste, pour qu'on ne relise que ce qui pose question.",
      "L'affectation porte sur la partie, pas sur le fichier : un PDF ajouté à trois semaines du concert apparaît tout seul chez ceux qui la lisent. Et « reprendre l'affectation de… » recopie les pupitres d'une opération à l'autre, en écartant ceux qui n'y jouent pas.",
      "Deux compteurs veillent : les parties que personne ne lit, et — celui qu'on oublie — les personnes affectées à l'opération qui n'ont aucune partie. L'effectif est lu dans les dates, jamais dans la nomenclature du devis.",
      "Côté musicien : rien de nouveau à installer, rien à recevoir. Les partitions apparaissent dans l'espace personnel habituel, sous l'opération. Un code par opération, à communiquer séparément du lien, s'y saisit une fois.",
      "Chaque exemplaire téléchargé porte le nom de qui l'a pris — en haut de page, en pied de page, et sous une forme invisible qui permet de retrouver l'origine d'une partition qui circulerait. La musique n'est jamais recouverte : c'est vérifié au pixel.",
    ],
  },
  {
    version: '2026-09-18-5',
    titre: 'Le bilan de projet',
    points: [
      "Une troisième vue dans le suivi, à côté du tableau et du journal : le bilan. Et un PDF d'une page, à la charte, pour l'envoyer au président, à un coproducteur ou à l'expert-comptable.",
      "Il s'ouvre sur le résultat : recette, coût, marge — en vert ou en rouge, et en pourcentage de la recette. Puis un compte de résultat en trois lignes, avec la marge prévue au devis à côté de la marge attendue.",
      "« Où est parti l'argent » : une ligne par section, avec sa part du coût réel en barre. La masse salariale — bruts et charges patronales — y est chiffrée à part, c'est le premier nombre qu'on cherche dans un budget de spectacle.",
      "« Ce qui a dérapé » et « Ce qu'on a économisé » : les cinq plus gros de chaque côté, avec leur chemin dans le budget. Et les postes internalisés à part, chiffrés charges comprises — un poste de 2 100 € assuré en interne en rapporte 3 507.",
      "Huit compteurs : dépenses, fournisseurs, dépense moyenne, postes renseignés sur postes prévus, reste à engager, engagé non payé, provision d'imprévus restante, période couverte.",
      "Et un encadré « à savoir en lisant ce bilan » qui dit ce que le document NE sait pas : les recettes non suivies, les postes sans dépense — factures manquantes ou prestation qui n'a pas eu lieu, le bilan ne tranche pas —, l'engagé non payé, les dépenses sans justificatif. Un bilan qui tait ses trous se fait lire comme s'il savait tout.",
      "Tant que le projet n'est pas clos, le PDF porte le filigrane « En cours » : il décrit une situation, pas un résultat.",
      "Au passage, les tableaux de tous les PDF du site savent enfin aligner une colonne de montants à droite.",
    ],
  },
  {
    version: '2026-09-18-4',
    titre: 'Le suivi dit maintenant si le projet gagne de l’argent',
    points: [
      "Un devis signé est un PRIX, pas une enveloppe de dépenses : le client doit ce montant quoi qu'il arrive. Chaque euro qu'on ne dépense pas est donc un euro gagné — et c'est ce que le suivi affichait le moins bien.",
      "Le suivi porte désormais une recette contractuelle, reprise en un clic du devis client accepté et modifiable à la main (avenant, cession sans devis dans l'outil).",
      "Les chiffres de tête deviennent : recette · dépensé à ce jour · coût à l'atterrissage · MARGE. Et le pied de page porte un vrai compte de résultat en trois lignes — recette, coût complet, marge — avec la marge prévue au devis à côté de la marge attendue.",
      "Quand le suivi est ouvert sur le devis client lui-même, la marge part de zéro : le devis refacture le coût. Tout ce qu'on économise ensuite la creuse dans le bon sens.",
      "Le vert est réservé à la marge. Un écart de poste n'a pas à être célébré — une économie peut cacher une prestation qui n'a pas eu lieu. Le résultat du projet, lui, n'a qu'un sens.",
      "Réserve affichée en clair : la marge ne compte que la cession. Subventions, coproductions, aides à l'emploi et billetterie ne sont pas encore suivies.",
    ],
  },
  {
    version: '2026-09-18-3',
    titre: 'Suivi des dépenses : corriger, compter, internaliser',
    points: [
      "La page reprend la forme de la page Budget — une carte par section, des lignes fines, les montants alignés d'une carte à l'autre. Le tableau à bandes colorées se lisait moins bien.",
      "Tout est déplié d'emblée : on ouvre un suivi pour voir où va l'argent, pas pour cliquer quinze chevrons. « Tout replier » reste là pour la vue d'ensemble.",
      "Corriger une erreur : cliquer le montant réel d'un poste déplie ses dépenses, avec « Modifier » et « Retirer » sur chacune. La fiche d'une dépense porte aussi son bouton « Retirer ». Quinze secondes pour se raviser, comme ailleurs dans l'outil.",
      "Deux façons de chiffrer une dépense, au choix sur chacune : une facture globale, ou une quantité et un prix unitaire — 330 repas à 20 €, 85 fiches de paie à 28 €, 12 nuitées à 95 €. Le montant en découle et ne se tape pas ; le détail est conservé, le journal et l'export le restituent. Les fiches de paie s'ouvrent directement en mode « quantité × prix », au tarif du devis.",
      "Zéro euro est une réponse valable. Un poste facturé au client mais assuré en interne coûte 0 € : il se saisit, à condition de porter un libellé qui le dise. La case « rien de plus à dépenser sur ce poste » fait alors tomber son atterrissage à son réel, et la ligne porte la mention « internalisé ».",
      "Et l'économie est comptée en entier : un poste de direction technique prévu 3 600 € et internalisé fait baisser l'atterrissage de 6 012 € — le salaire et ses 67 % de charges patronales, qui se recalculent toutes seules.",
    ],
  },
  {
    version: '2026-09-18-2',
    titre: 'Le suivi des dépenses',
    points: [
      "Le chiffrage s'arrêtait à la signature : une fois le devis accepté, ce qui était réellement dépensé vivait dans un tableur, et l'écart avec le prévu ne se lisait qu'à la clôture — trop tard pour décider quoi que ce soit.",
      "Budget → Suivi des dépenses. Trois colonnes : prévu, réel, différence. Le prévisionnel est une COPIE du document arrêté, figée le jour où l'on ouvre le suivi : il ne bougera plus, même si le devis est retouché ensuite.",
      "La nomenclature n'est pas à inventer : le suivi reprend l'arbre du devis — sections, groupes, lignes. Une dépense se rattache au niveau qu'on veut, et l'arbre additionne vers le haut. Quinze rangées suffisent à lire un budget de deux cent mille euros.",
      "Les charges patronales ne se saisissent jamais : elles se recalculent sur les bruts réels, avec les taux du document et non ceux des réglages. Le champ prévient qu'il attend un BRUT employeur, et pose la question si le montant ressemble à un coût déjà chargé.",
      "Frais généraux et imprévus restent hors du total d'écart : les premiers n'ont pas de facture, les seconds n'ont pas de réel. Laissés dedans, ils afficheraient 11 % d'économie du premier au dernier jour du projet.",
      "Un quatrième chiffre en tête : l'atterrissage. Pour chaque groupe, le plus élevé du prévu et du dépensé — un poste entamé à 30 % annonce toujours son budget entier, un poste dépassé annonce son dépassement.",
      "Saisie en quatre gestes, en TTC par défaut (c'est ce qui est écrit sur la facture), la TVA déduite toute seule et modifiable. Journal chronologique, recherche, export CSV pour la compta, et un lien vers le dossier Drive du projet avec un bouton qui copie le nom de fichier à donner au justificatif.",
      "Tout est en HT dans les trois colonnes : le devis calcule une TVA collectée sur une cession, les factures portent une TVA déductible — deux grandeurs sans rapport.",
      "Ce tableau ne suit que les dépenses. Cession, subventions, coproductions et billetterie arrivent au prochain lot ; d'ici là, la page le dit en toutes lettres.",
    ],
  },
  {
    version: '2026-09-18',
    titre: 'Correction : le cachet affiché aux technicien·nes',
    points: [
      "Une date peut porter son propre montant — une répétition payée autrement qu'un concert. Ce montant se saisit dans la colonne des musicien·nes, en cachets : il n'a jamais concerné le pôle technique. Il lui était pourtant servi tel quel.",
      "Sur EXPEDITION 33 — 2027, 26 dates portent un montant propre et des technicien·nes y sont affecté·es : 228 affectations personne × date annonçaient le prix d'un cachet de musicien·ne.",
      "Le niveau « date » rejoint donc le niveau « pupitre » : tous deux appartiennent à l'orchestre, et le pôle technique les saute pour tomber sur son propre standard. Une exception nominative reste prioritaire, comme avant.",
      "Sans standard technique renseigné sur la tournée, rien ne s'affiche — mieux vaut un blanc qu'un prix faux. Les trois tournées concernées attendent toujours leur montant.",
    ],
  },
  {
    version: '2026-09-17-5',
    titre: 'Mes remplaçant·es : trois rangs, et on classe au doigt',
    points: [
      "La page ouvrait dix cadres vides d'entrée. Sur un téléphone, il fallait passer sept encadrés « Ajouter un·e remplaçant·e » pour atteindre le bas. Elle en montre maintenant trois, et un de plus que le dernier rempli — il y a toujours une place libre, sans jamais dérouler dans le vide. La limite de dix ne change pas.",
      "Changer l'ordre ne demandait plus qu'un effacement et une ressaisie : il fallait retirer la personne, la remettre au bon rang, recommencer pour les suivantes. On glisse désormais la pastille du rang pour la déplacer, au doigt sur téléphone comme à la souris.",
      "Deux flèches doublent le glisser sur chaque ligne : sur un écran étroit, une main occupée ou un lecteur d'écran, le classement ne doit pas dépendre d'un geste précis.",
      "Un rang est une position, pas une étiquette : passer le troisième en premier décale les deux autres au lieu d'échanger deux noms. Les listes anciennes à trous (un rang 1 et un rang 5) se renumérotent au premier déplacement.",
      "Une personne peut enfin venir du répertoire du téléphone. Sur Android, le navigateur propose directement de choisir un contact ; partout ailleurs — iPhone compris —, on partage la fiche depuis Contacts (« Enregistrer dans Fichiers ») et on la dépose ici. Dans les deux cas l'import remplit seulement le formulaire : rien n'est ajouté avant validation, et un doublon avec le répertoire est signalé sur le champ.",
      "Comme avant, rien n'est enregistré sans un clic sur « Enregistrer ma liste ».",
    ],
  },
  {
    version: '2026-09-17-4',
    titre: 'Le cachet des technicien·nes',
    points: [
      "Une tournée ne portait qu'un cachet standard, pensé pour l'orchestre. Sur leur page de disponibilités, les technicien·nes lisaient donc soit le montant des musicien·nes — faux —, soit « non défini ».",
      "Le panneau Réglages d'une tournée porte maintenant deux montants côte à côte : celui de l'orchestre et celui du pôle technique. Chacun ne voit que le sien.",
      "Les autres niveaux ne changent pas et valent pour tout le monde : une exception nominative passe devant, et le montant propre à une date (une répétition payée autrement) passe devant le standard. Le niveau « pupitre » ne concerne que l'orchestre.",
      "Sans montant technique renseigné, rien ne s'affiche — on n'invente pas un prix.",
    ],
  },
  {
    version: '2026-09-17-3',
    titre: 'Revenir en arrière, sur n’importe quelle action',
    points: [
      "Tout ce qu'on fait dans l'outil est désormais réversible. Deux filets : le ruban « Annuler » sur le moment, et l'historique de l'administration pour tout le reste.",
      "Le journal ne couvrait que l'annuaire et les tournées : une fiche technique, un devis, une invitation, un véhicule, un réglage changeaient sans laisser de trace. Vingt tables de plus y entrent, et chaque entrée porte maintenant son bouton — « Revenir à l'état d'avant » sur une modification, « Restaurer » sur une suppression, « Annuler la création » sur une création.",
      "Ce retour en arrière est lui-même enregistré : il se défait comme le reste, on ne se retrouve jamais coincé.",
      "Sur Tournées et Recording, une suppression pose maintenant un « Annuler » pendant quinze secondes, dans la colonne de gauche. Supprimer une date, retirer les dates à l'étude, supprimer un projet entier, poser un cachet ou un contingent en lot : tout se défait d'un clic.",
      "Ce qui est vraiment irréversible attend la fin de ces quinze secondes. Supprimer une date emporte avec elle sa fiche technique, ses remarques, ses affectations de transport et ses invitations : rien n'est touché tant qu'on peut se raviser, sans quoi la date reviendrait sans ce qui lui était attaché.",
      "Supprimer un projet ne supprime plus rien tout de suite : il disparaît de l'écran, et la ligne ne part qu'une fois la fenêtre refermée. Annuler le fait revenir intact, invitations comprises.",
      "Une seule action à la fois, la dernière — dans un outil où l'on travaille à plusieurs, remonter quatre gestes en arrière reviendrait à défaire celui de quelqu'un d'autre. Au-delà des quinze secondes, la corbeille de l'administration reste là.",
    ],
  },
  {
    version: '2026-09-17-2',
    titre: 'Les récapitulatifs ne perdent plus la moitié de leurs dates',
    points: [
      "Un tableau plus long qu'une feuille était dessiné d'un bloc : tout ce qui dépassait le bas de la page était perdu. Un récapitulatif annonçait « 25 dates validées » et n'en imprimait que sept. Les tableaux longs se coupent maintenant proprement, et rappellent leur intitulé et leurs colonnes en haut de chaque nouvelle feuille. Cela vaut pour tous les PDF : récapitulatifs de dates, plateau par date, pages salle.",
      "La distribution passe sous la ligne de la date, sur toute la largeur, au lieu d'être tassée dans une colonne : vingt-deux noms tenaient sur huit lignes illisibles, ils en prennent trois. Deux fois plus de dates par feuille.",
      "Une date annulée n'affiche plus sa distribution : la journée est libérée, personne n'y joue. Y laisser les noms revenait à imprimer une convocation à un concert qui n'aura pas lieu.",
      "L'avertissement de fin ne parle plus que de ce que le document contient : il annonçait « les options peuvent tomber » à la fin d'un document qui n'en portait aucune.",
    ],
  },
  {
    version: '2026-09-17',
    titre: 'Les invitations sortent du tableur',
    points: [
      "Une section « Invitations » dans le bandeau. Deux écrans : le Récapitulatif, sur lequel on arrive — toutes les dates d'un coup, ce qui est consommé, ce qui reste, ce qui est à compléter — et la Saisie, une date à la fois, où l'on tape un nom et valide à Entrée. Le bouton « Saisir » de chaque ligne du récapitulatif mène droit à la bonne date.",
      "Seules les dates VALIDÉES ont une liste : une option n'est pas tenue, une date à l'étude n'existe pas encore, et promettre des places dessus revient à les reprendre. Une case ouvre le reste pour qui prépare en avance.",
      "À activer projet par projet — panneau « Invitations » d'une tournée. Une préparation ou une résidence n'a pas de public : rien ne s'affiche tant que la case n'est pas cochée.",
      "Le contingent est propre à chaque tournée : celui d'EXPEDITION 33 n'est pas celui de la suivante. On le saisit une fois dans le panneau du projet, un bouton le pose sur ses concerts validés, et il se corrige date par date depuis la saisie. Une catégorie laissée vide veut dire qu'il n'y en a pas dans cette salle — elle n'est simplement pas proposée.",
      "Deux choses à ne plus confondre : le TYPE dit pour qui (partenaire, pro, famille, perso) et ne consomme rien ; la CATÉGORIE dit où l'on s'assoit et porte le quota. Le récapitulatif dit enfin où sont parties les places, par type.",
      "On ne peut pas donner une place qu'on n'a pas. Le menu Catégorie suit le nombre de places demandé : onze places ferment une catégorie qui n'en a que neuf, et le menu bascule tout seul sur celle qui peut accueillir. Une catégorie sans contingent n'apparaît plus du tout — toutes les salles n'ont pas de CAT 2.",
      "La carte de la catégorie passe en ambre quand c'est plein, en rouge si ça déborde, et un bandeau le dit quand tout est épuisé.",
      "L'aftershow est une simple case : on y est ou on n'y est pas. Elle vaut avec ou sans place, et la liste qui part au traiteur et à la sécurité est une liste de noms.",
      "Nom, prénom et « qui invite » sont obligatoires : une liste de « M. Durand » sans prénom se fait refuser à l'entrée quand deux Durand se présentent, et sans le demandeur le bilan de tournée ne dit rien.",
      "« Qui invite » devient une liste fermée — Aloïs, Julie, Daniel, Gwen, Jeanne — au lieu d'un champ libre où la même personne s'écrivait de quatre façons.",
      "Trois exports par date : le PDF mis en page — celui qu'on envoie à la prod et à la salle, une feuille par date, groupée par catégorie —, le CSV pour une billetterie, et le CSV aftershow pour le traiteur et la sécurité. Le PDF existe aussi pour toute la tournée, une page par date.",
      "Le demandeur est pré-rempli avec le compte connecté et le type reste d'une ligne à l'autre : ce sont les colonnes que le tableur n'a jamais réussi à faire remplir.",
    ],
  },
  {
    version: '2026-09-15',
    titre: 'Un cachet par date : les répétitions ne se paient plus comme les concerts',
    points: [
      "Sur une tournée, chaque date porte maintenant son propre cachet, dans une colonne « Cachet » du tableau — comme les séances d'un recording depuis toujours.",
      "Le panneau Cachet pose un montant sur toutes les dates d'une nature d'un seul geste : « Répétitions (3) », « Concerts (5) », « Résidence (1) ». Plus besoin de découper un projet en deux pour payer les répétitions autrement.",
      "Laissée vide, une date reprend le cachet standard du projet — le repère gris du champ rappelle lequel. « Tout effacer » remet tout le projet au standard.",
      "Les musicien·nes voient le montant sous chacune de leurs dates. Leur exception nominative, si elle existe, l'emporte toujours : « toi, c'est tant » ne cesse pas d'être vrai un jour de répétition.",
      "Le chiffrage d'un projet ne compare plus le devis au seul cachet standard quand les dates portent des montants différents : il annonce l'étendue réelle.",
    ],
  },
  {
    version: '2026-09-14',
    titre: 'Où en est chaque date, sur le tableau de service',
    points: [
      "Chaque colonne du tableau de service porte une pastille de couleur à côté de la date : vert c'est signé, ambre c'est une option, contour gris c'est à l'étude, rouge c'est annulé. La couleur de fond reste celle du projet.",
      "Une légende sous le tableau rappelle les couleurs — et n'énumère que les statuts réellement présents.",
      "Le point d'interrogation qui marquait les dates à l'étude disparaît : la pastille le dit mieux, et deux signes pour la même chose au même endroit, c'était un de trop.",
    ],
  },
  {
    version: '2026-09-10-4',
    titre: 'Les dates dans l’agenda, et un calendrier qui se feuillette',
    points: [
      "Sur « Mes dates », un bouton pose les dates validées dans l'agenda du téléphone — et les y tient à jour toutes seules : une date qui s'ajoute apparaît, une salle qui change se corrige, une annulation disparaît. C'est un abonnement, pas une copie : il ne peut pas y avoir de doublon.",
      "Seules les dates validées où la personne joue y vont : ni les options, ni les dates à l'étude. Un agenda dit « je ne suis pas libre ».",
      "Le calendrier montre un mois à la fois, avec deux flèches, au lieu d'empiler quatre grilles sur trois écrans.",
      "Toucher une journée du calendrier dit enfin de quel projet il s'agit — et mène droit à ses dispos quand une demande est en cours.",
      "Les dates à l'étude ne sont plus annoncées comme « prochaines dates » sur l'accueil : rien n'y est réservé, et personne ne doit bloquer une journée pour une date qu'on regarde à peine.",
      "Sur la page des dispos, les deux liens vers les infos et les remplaçant·es sont retirés : les onglets du bas y mènent depuis n'importe quel écran.",
    ],
  },
  {
    version: '2026-09-10-3',
    titre: 'L’espace des musicien·nes devient une application',
    points: [
      "Les cinq pages ouvertes par un lien personnel — l'espace, les dates, les dispos, les infos, les remplaçant·es — partagent maintenant une barre d'onglets en bas de l'écran. Plus besoin de remonter chercher « ← Mon espace » pour changer de page.",
      "Des pastilles signalent ce qui attend : le nombre de demandes de dispo à remplir, un point sur les infos incomplètes ou la liste de remplaçant·es vide.",
      "L'accueil de leur espace ne porte plus la vue complète des dates mais leurs quatre prochaines, avec un lien vers le reste : sur téléphone, la demande de dispo est enfin visible sans faire défiler.",
      "Tous les liens déjà envoyés restent valables — rien à renvoyer.",
      "Sur l'accueil de production, les portes de chaque étiquette sont devenues de vrais boutons, alignés et de même taille. Au passage, l'étiquette Recording était illisible en thème sombre : c'est corrigé.",
    ],
  },
  {
    version: '2026-09-10-2',
    titre: 'Les messages s’écrivent',
    points: [
      "Sur la page Messages, le texte est maintenant modifiable : on part d'un modèle — ou d'une page vide avec « Message libre » — et on écrit ce qu'on veut.",
      "Les mots entre accolades ({prenom}, {projet}, {dates}, {periode}, {lien}, {butoir}) sont remplacés à l'envoi, personne par personne : un seul message écrit, et chacun·e reçoit le sien avec son prénom et son lien.",
      "« Envoyer aux 12, un par un » fait défiler les destinataires : le texte exact, le canal, un bouton. On voit où on en est, et on peut s'arrêter puis reprendre.",
      "Ce qui part est gardé avec sa date et son texte : un mois plus tard, on peut relire ce qu'on avait écrit à quelqu'un.",
    ],
  },
  {
    version: '2026-09-10',
    titre: 'Cachets, récapitulatif, budget',
    points: [
      "Le bouton « Cachet » d'un recording fonctionne à nouveau, et pose un montant commun sur toutes les séances — ou seulement sur celles que tu as cochées.",
      "Le récapitulatif d'un projet s'exporte en PDF au format calendrier, et s'envoie depuis la page Messages.",
      "Le statut « Recherche » d'une date s'appelle maintenant « À l'étude » : rien n'est réservé, on regarde seulement si la date est jouable.",
      "Le budget a sa propre section dans le bandeau — tableau de bord, devis et clients — au lieu de vivre sous Admin.",
      "L'espace Comm, qui ne servait pas, est retiré.",
      "La « vue d'ensemble » s'appelle désormais le tableau de service. Ses lignes se trient et se rangent à ta main, et tes réglages te suivent d'un appareil à l'autre.",
      "Sur téléphone, l'espace musicien·ne ouvre sur le dossier et les dispos ; les précisions se lisent d'un clic au lieu de s'étaler sous les noms.",
      "Une page Documents rassemble les récapitulatifs PDF, et le chant a son pupitre.",
    ],
  },
];

(function(){
  const CLE_LOCALE = 'curieuxNouveautesVue';
  const PAGE_PREF = 'nouveautes';

  // L'entrée la plus récente, sans se fier à l'ordre du tableau : une entrée
  // insérée au mauvais endroit ne doit pas cacher une livraison.
  function derniereVersion(){
    return CURIEUX_NOUVEAUTES.reduce((max, e)=> (e && e.version > max ? e.version : max), '');
  }

  function lireLocale(){
    try{ return localStorage.getItem(CLE_LOCALE) || ''; }catch(e){ return ''; }
  }
  function ecrireLocale(version){
    try{ localStorage.setItem(CLE_LOCALE, version); }catch(e){}
  }

  // La plus récente des deux mémoires, voir l'en-tête.
  async function versionVue(){
    let serveur = '';
    try{
      if(typeof CurieuxDB !== 'undefined' && CurieuxDB.fetchPreferences){
        const prefs = await CurieuxDB.fetchPreferences(PAGE_PREF);
        if(prefs && typeof prefs.vue === 'string') serveur = prefs.vue;
      }
    }catch(e){}
    const locale = lireLocale();
    return serveur > locale ? serveur : locale;
  }

  // Double écriture, sans attendre le serveur : la fenêtre se ferme tout de
  // suite, et un échec d'envoi n'a pas de conséquence visible — le
  // localStorage retient déjà la version.
  function marquerVue(version){
    ecrireLocale(version);
    try{
      if(typeof CurieuxDB !== 'undefined' && CurieuxDB.savePreferences){
        Promise.resolve(CurieuxDB.savePreferences(PAGE_PREF, { vue: version })).catch(()=>{});
      }
    }catch(e){}
  }

  // « 10 septembre 2026 ». Le T12:00 évite qu'un fuseau à l'ouest fasse
  // reculer la date d'un jour ; une version qui n'est pas une date s'affiche
  // telle quelle.
  function dateLisible(version){
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(version || '');
    if(!m) return version || '';
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`);
    if(isNaN(d)) return version;
    return d.toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
  }

  function echapper(s){
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Le style vit ici et non dans base.css : la fenêtre n'a qu'un seul
  // gabarit, et base.css est un actif que d'autres chantiers touchent.
  function poserStyle(){
    if(document.getElementById('curieux-nouveautes-css')) return;
    const css = document.createElement('style');
    css.id = 'curieux-nouveautes-css';
    css.textContent = `
      .co-nouveautes-voile{
        position:fixed; inset:0; z-index:10000; background:rgba(20,15,10,.5);
        display:flex; align-items:center; justify-content:center; padding:20px; overflow-y:auto;
      }
      .co-nouveautes{
        background:var(--card); color:var(--text); border:1px solid var(--border);
        border-radius:var(--radius-lg, 22px); max-width:540px; width:100%; max-height:88vh;
        overflow-y:auto; padding:28px 28px 22px; margin:auto;
        font-family:var(--font-body, inherit); font-size:14px; line-height:1.55;
        box-shadow:0 18px 50px rgba(20,15,10,.22); animation:coFadeUp .25s ease-out;
        outline:none;
      }
      .co-nouveautes h2{
        font-family:var(--font-display); font-size:26px; font-weight:500;
        color:var(--accent); margin:0 0 4px;
      }
      .co-nouveautes-sous{ font-size:12.5px; color:var(--muted); margin:0 0 18px; }
      .co-nouveautes-livraison + .co-nouveautes-livraison{
        margin-top:18px; padding-top:16px; border-top:1px solid var(--border);
      }
      .co-nouveautes-date{
        font-size:11px; font-weight:800; letter-spacing:.06em; text-transform:uppercase;
        color:var(--muted); margin:0 0 2px;
      }
      .co-nouveautes h3{ font-size:15px; font-weight:700; margin:0 0 8px; color:var(--text); }
      .co-nouveautes ul{ margin:0; padding-left:20px; }
      .co-nouveautes li{ margin:0 0 7px; }
      .co-nouveautes li::marker{ color:var(--accent); }
      .co-nouveautes-actions{ display:flex; justify-content:flex-end; margin-top:22px; }
      @media (max-width:480px){ .co-nouveautes{ padding:22px 18px 18px; } }
    `;
    document.head.appendChild(css);
  }

  // Ouvre la fenêtre sur les entrées données. À la fermeture — « Compris »,
  // Échap ou clic sur le voile — la version la plus récente affichée est
  // retenue comme vue, que la fenêtre soit venue d'elle-même ou du pied de
  // page : dans les deux cas la personne a eu les nouveautés sous les yeux.
  function ouvrirNouveautes(entrees){
    if(document.getElementById('curieuxNouveautes')) return;
    if(!document.body || !entrees || !entrees.length) return;
    poserStyle();

    const plusieurs = entrees.length > 1;
    const voile = document.createElement('div');
    voile.className = 'co-nouveautes-voile';
    voile.id = 'curieuxNouveautes';
    voile.innerHTML = `
      <div class="co-nouveautes" role="dialog" aria-modal="true" aria-labelledby="curieuxNouveautesTitre" tabindex="-1">
        <h2 id="curieuxNouveautesTitre">Ce qui a changé</h2>
        <p class="co-nouveautes-sous">${plusieurs
          ? `${entrees.length} mises à jour depuis ton dernier passage.`
          : `Mise à jour du ${echapper(dateLisible(entrees[0].version))}.`}</p>
        ${entrees.map(e => `
          <section class="co-nouveautes-livraison">
            ${plusieurs ? `<p class="co-nouveautes-date">${echapper(dateLisible(e.version))}</p>` : ''}
            ${e.titre ? `<h3>${echapper(e.titre)}</h3>` : ''}
            <ul>${(e.points || []).map(p => `<li>${echapper(p)}</li>`).join('')}</ul>
          </section>`).join('')}
        <div class="co-nouveautes-actions">
          <button type="button" class="co-btn primary" id="curieuxNouveautesOk">Compris</button>
        </div>
      </div>`;

    const rendreFocus = document.activeElement;
    const carte = voile.querySelector('.co-nouveautes');
    const versionAffichee = entrees.reduce((max, e)=> (e.version > max ? e.version : max), '');

    function fermer(){
      document.removeEventListener('keydown', surTouche);
      voile.remove();
      marquerVue(versionAffichee);
      try{ if(rendreFocus && rendreFocus.focus) rendreFocus.focus(); }catch(e){}
    }
    // Le focus reste dans la fenêtre : Tab depuis le bouton revient à la
    // carte, Maj+Tab depuis la carte va au bouton. Il n'y a que ces deux
    // arrêts, inutile de calculer une liste de focusables.
    function surTouche(ev){
      if(ev.key === 'Escape'){ ev.preventDefault(); fermer(); return; }
      if(ev.key !== 'Tab') return;
      const bouton = document.getElementById('curieuxNouveautesOk');
      if(!bouton) return;
      const arrets = [carte, bouton];
      const i = arrets.indexOf(document.activeElement);
      const suivant = ev.shiftKey ? (i <= 0 ? bouton : carte) : (i >= 1 || i === -1 ? carte : bouton);
      ev.preventDefault();
      suivant.focus();
    }
    voile.addEventListener('click', (ev)=>{ if(ev.target === voile) fermer(); });
    voile.querySelector('#curieuxNouveautesOk').addEventListener('click', fermer);
    document.addEventListener('keydown', surTouche);

    document.body.appendChild(voile);
    carte.focus();
  }

  // Le lien du pied de page, qui rouvre toutes les entrées à la demande. Le
  // pied de page est posé par nav.js à DOMContentLoaded, donc avant que les
  // gardes n'appellent afficherNouveautesSiBesoin : à ce moment il existe.
  function injecterLienNouveautes(){
    const pied = document.querySelector('.co-footer');
    if(!pied || pied.querySelector('#curieuxNouveautesLien')) return;
    if(!CURIEUX_NOUVEAUTES.length) return;
    const a = document.createElement('a');
    a.href = '#';
    a.id = 'curieuxNouveautesLien';
    a.textContent = 'Nouveautés';
    a.addEventListener('click', (ev)=>{ ev.preventDefault(); ouvrirNouveautes(CURIEUX_NOUVEAUTES.slice()); });
    pied.appendChild(a);
  }

  // Appelée par les gardes après la révélation de la page. Ne lève jamais :
  // une fenêtre d'information ne doit pas pouvoir faire échouer la garde.
  async function afficherNouveautesSiBesoin(){
    try{
      injecterLienNouveautes();
      const derniere = derniereVersion();
      if(!derniere) return;
      const vue = await versionVue();
      if(vue >= derniere) return;
      // Quelqu'un qui n'a jamais rien vu voit la dernière livraison, pas tout
      // l'historique : les entrées plus anciennes ne lui diraient rien.
      const nonVues = vue
        ? CURIEUX_NOUVEAUTES.filter(e => e && e.version > vue)
        : CURIEUX_NOUVEAUTES.filter(e => e && e.version === derniere);
      nonVues.sort((a, b)=> (a.version < b.version ? 1 : a.version > b.version ? -1 : 0));
      ouvrirNouveautes(nonVues);
    }catch(e){
      console.warn('[nouveautes]', e && e.message ? e.message : e);
    }
  }

  window.afficherNouveautesSiBesoin = afficherNouveautesSiBesoin;
  window.ouvrirNouveautes = ouvrirNouveautes;
})();
