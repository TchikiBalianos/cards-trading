# Build in Public : la charte des cartes « Set de base »

Décidée le 2 octobre 2026, après un party mode BMAD (Sally, John, Mary, Paige, puis
Winston et Amelia en contradiction et en faisabilité) et l'arbitrage de Julian.

## Le principe

Chaque post Build in Public (BiP) est une **carte numérotée d'un set** : « Set de base »,
saison 1, cartes 01/20 à 20/20. Les collectionneurs lisent ce langage d'instinct, et la
série se reconnaît d'un coup d'œil dans le fil, à côté des cotes et de l'actu.

Objectif, selon Julian : la communication, et à terme attirer des utilisateurs sur le
MVP. Son réseau compte beaucoup de profils tech, IA, gamers et anciens du Web3 : un
peu de technique passe, tant que le bénéfice pour l'utilisateur reste lisible.

## Ce que la carte montre

- **Un cadre maison**, façon carte de TCG, mais sans rien emprunter à une marque : ni
  bordure jaune, ni symbole d'énergie, ni logo d'éditeur. On évoque une carte, on n'en
  copie aucune (risque de pastiche relevé par Sally et Winston).
- **Le numéro dans le set** (« 07/20 »). Il compte les posts de la saison, **jamais**
  l'avancement du MVP : « 41/108 fonctionnalités » se lirait comme un pourcentage de
  retard, et le total bougera au premier recadrage (Winston, John).
- **Trois raretés** : commune (une brique du produit ou de l'atelier), **erreur** (un
  incident raconté, cadre rouge et nom « mal imprimé » comme une erreur d'impression),
  **holo** (un jalon). Pas d'autre rareté : elles s'useraient (Sally).
- **Une fenêtre d'illustration**, avec un gabarit lisible sur téléphone :
  - *plan* : 2 à 4 étapes fléchées, avec en option la « porte » Autoriser / Refuser ;
  - *bordereau* : un ticket en chasse fixe, de 2 à 6 lignes clé / valeur ;
  - *avant / après* : la panne, puis le garde-fou ;
  - *preuve* : une phrase réelle recopiée mot pour mot, avec sa provenance ;
  - *motif* : un des huit motifs maison, pour les cartes d'ouverture ou de clôture.
- **Une ligne d'effet** en bas de carte : la leçon ou le bénéfice, en une phrase.

## Ce qu'elle ne montre jamais

Capture d'écran brute, clé, adresse de serveur, chemin de fichier, email, nombre
d'inscrits, statut juridique, date de lancement, fraction d'avancement. La validation
le refuse dans les textes de la carte (`scripts/lib/carte-bip.mjs`, `verifierBip`).

Pas de date sur l'image non plus : la carte se publie quand on veut, sans contrainte de
calendrier.

## Couleurs et textes

Bleu nuit et bleu de marque. Rouge réservé aux cartes erreur, or et dégradé holo aux
jalons, aucune couleur de licence : le BiP n'appartient à aucun jeu. Les plafonds de
caractères (nom 26, effet 95, titre 70, étape 22…) garantissent la lisibilité ; un texte
qui ne tient pas est refusé, jamais rapetissé jusqu'à l'illisible ni tronqué.

## Les textes des posts

Même cadrage pour un sujet donné, deux tons : X plus direct (le réseau tech y est), une
légende Instagram plus chaleureuse, qui finit par le bénéfice pour le collectionneur et
une question. Aucun incident qui aurait fait du tort à un inscrit. Un coût d'échange avec
l'IA ne s'écrit pas en chiffre dans les posts (règle des prix sourcés).

## Où vivent les épisodes, et comment ils partent

La banque des épisodes est **privée**, hors de ce dépôt public :
`Cards-Trading/Marketing/build-in-public/saison-1.json` sur le poste de Julian. Chaque
samedi, la routine `social-cards-trading-semaine` prend le premier épisode non publié
pour le post « coulisses » du dimanche et le recopie tel quel ; Julian le relit dans
Buffer comme les autres. Rien d'autre à piloter : pas de rotation imposée, pas de date.

```bash
node scripts/apercu-bip.mjs --saison=<banque>                    # validation seule
node scripts/apercu-bip.mjs --saison=<banque> --sortie=<dossier> # + rendu des 2 formats
```

## Bilan prévu au 8e post (proposé par John)

Instagram : au moins deux vraies questions de collectionneurs en commentaire. X : les
cartes « atelier » au-dessus d'environ 200 impressions, notre repère pour un relais
d'article. Sinon, on change l'angle avant de toucher au graphisme.
