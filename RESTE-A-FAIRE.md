# Reste à faire : Cards-Trading

État au **25 octobre 2026**. Les règles durables vivent dans `CLAUDE.md` ; ce
fichier ne liste que ce qui est **ouvert**. Retirer une ligne dès qu'elle est
traitée. Les chantiers clos (incidents du 19 au 22 septembre, fiabilité des
cotes, SEO, vérifications) sont archivés dans `docs/journal-des-corrections.md`.

Le MVP, le recrutement de vendeurs et le financement se suivent hors de ce
dépôt, qui est public.

---

## 🔴 Cette semaine

| Quand | Quoi | Qui |
|---|---|---|
| Dès que possible | Fusionner la pull request n° 15 (article 30e Anniversaire : Pokébox et Classeur constatés en rayon par Julian le 25 octobre, « annoncé » ajouté aux dates encore à venir), puis supprimer sa branche une fois l'article vérifié en production. | Julian |
| Ven 30 oct., en magasin | Decks Combat Mentali-ex et Noctali-ex présents ? La liste officielle d'octobre et Play-in les placent au 30 octobre, le calendrier publié sur X au 6 novembre. | Julian |
| Jeu 12 nov. | Premier top japonais depuis la réouverture (semaine ISO 46) : vérifier le passage, les noms en français complets et l'absence de valeur figée. | Claude, sur demande |
| Début novembre | Article McDonald's : annonce officielle de McDonald's France ou de Pokémon ? L'opération américaine est annoncée pour le 5 novembre ; une confirmation française ferait réécrire la section « Et la France ? ». | Claude, sur demande |

---

## 🟠 Chantiers ouverts

### 1. Mesure du trafic

**Repris plus tard** (arbitrage du 25 octobre) ; le relevé automatique du 28 continue.

**Web Analytics est actif et collecte** depuis le 1er août. Le « introuvable » relevé
le matin du 30 septembre venait d'un mauvais cadrage de l'appel (identifiant d'équipe passé à
l'API), pas d'une désactivation : voir « Mesure du trafic » dans `CLAUDE.md`. Le visiteur, la
source, la page et l'appareil se lisent donc, et un taux de conversion se calcule.

Ce qui manque n'est plus la mesure mais deux choses :

- **La mémoire.** Le plan Hobby ne garde que 31 jours de détail (source, page, appareil). Sans
  relevé en début de mois, le passé se perd. Les relevés vivent dans un dossier Google Drive
  **privé** de Julian (« Cards-Trading · Suivi trafic (privé) »), un document par mois : le dépôt
  est public et les chiffres de trafic n'y ont pas leur place. Septembre est relevé. **Relevé
  automatique le 28 de chaque mois à 10h** (tâche Claude Desktop `releve-trafic-mensuel-cards-trading`,
  premier passage le 28 octobre) : le mois en cours jusqu'à la veille, et les derniers jours du
  mois précédent, que la fenêtre de 31 jours couvre encore. Le 28 existe chaque mois. L'app doit
  être ouverte, sinon la tâche part au lancement suivant.
- **Le trafic lui-même**, très faible, à lire avec le taux d'inscription avant de choisir où
  mettre l'effort (blog, lives WhatNot, réseaux).

Les UTM sont payants (Web Analytics Plus) : la source se lit dans le référent. Les extensions du
Chrome de Julian bloquent le script, ses propres visites ne comptent jamais.

### 2. Illustrations réalistes pour les posts

**En cours côté Julian** (compte et jeton Cloudflare), dans une autre conversation.

Décision de Julian (30 septembre) : niveaux 1 et 2 en test, puis le niveau 3 une fois
tout validé. Niveau 1 : photos réelles et visuels officiels (modèle `photo` existant,
crédit obligatoire). Niveau 2 : images IA d'ambiance dans un nouveau modèle de visuel
`scene`, éprouvé sur 5 images. Niveau 3 : moteur de veille de visuels.

**Niveau 2 : l'outil d'essai est prêt** (`scripts/essai-images-ia.mjs`, workflow manuel
`Essai illustrations IA`). Cinq scènes d'ambiance (table de jeu, boutique de nuit, échange
de cartes, classeur, salle de tournoi), sans carte réelle, sans personnage, sans texte, et
une planche contact où chaque image porte un titre d'exemple aux couleurs de la charte. Rien
n'est committé ni publié : les images vivent dans l'artefact du run, 7 jours. Le modèle de
visuel `scene` ne se construit qu'après lecture de la planche.

**Julian a choisi Cloudflare le 14 octobre.** Il crée le compte gratuit et le jeton Workers AI, puis
pose les secrets GitHub `CLOUDFLARE_ACCOUNT_ID` et `CLOUDFLARE_API_TOKEN` (un agent ne peut ni créer
de compte ni manipuler un jeton). Ensuite, Claude lance
`gh workflow run essai-images-ia.yml --ref main -f fournisseur=cloudflare` et montre la planche.

Contexte de ce choix : il manquait un accès pour le lancer, au choix un compte Cloudflare gratuit avec un jeton Workers AI
(secrets `CLOUDFLARE_ACCOUNT_ID` et `CLOUDFLARE_API_TOKEN`), ou la facturation activée sur la
clé Gemini (`GEMINI_API_KEY` existe, mais la génération d'image y était à quota zéro le 20
août, HTTP 429). Tarifs lus le 30 septembre : FLUX-1-schnell sur Cloudflare tient dans le
quota gratuit de 10 000 neurons par jour ; Gemini 3.1 Flash-Lite Image coûte 0,0336 $ l'image,
soit environ 0,17 $ les cinq. Ne rien bâtir sur `gemini-2.5-flash-image`, arrêté le 2 octobre 2026.

Relu le 2 octobre dans les deux documentations, et instructions données à Julian. **Cloudflare
est la voie conseillée** : Workers AI est inclus dans l'offre gratuite, au-delà du quota les
appels échouent sans rien facturer, et FLUX n'est pas parmi les modèles qui exigent un moyen de
paiement. **Gemini exige désormais un prépaiement de 5 $ minimum**, et la facturation se rattache
à un projet Google : passer par un projet dédié « Cards-Trading » et une clé neuve, jamais par
un projet qui porte déjà d'autres clés, dont la consommation puiserait dans le même crédit.

**Vivier de photos réutilisables, amorcé le 22 octobre** : `data/visuels/vivier.json` (liens, auteur, licence, sujets ; le dépôt ne garde jamais les images d'autrui), contrôlé par `vivier.test.mjs`, et consulté par la routine du samedi. Cinq photos Unsplash pour commencer. Pistes pour l'enrichir, par ordre de valeur : **tes propres photos** (lives WhatNot, salons, boutiques, cartes de ta collection : authentiques et sans question de droits), les **photos de la communauté** avec accord écrit et crédit, le **post cité** sur X (on réutilise le visuel d'un autre sans le copier), puis Unsplash. Les kits presse des éditeurs restent hors du vivier (usage éditorial seulement). Le contrôle anti-robot d'Unsplash bloque désormais la recherche automatique : les ajouts se font à la main, page source lue.

**Niveau 1 : trois photos trouvées le 14 octobre et passées dans le modèle `photo`**, sur
Unsplash (licence Unsplash : usage commercial permis, crédit non exigé mais toujours donné ;
les visuels de cartes ou de figurines qu'elles montrent restent la propriété de leurs éditeurs) :

- Thimo Pedersen, cartes Pokémon anciennes en vrac : `unsplash.com/photos/TWCnHKKhqSo`
- Branden Skeli, une carte Pokémon tenue à la main : `unsplash.com/photos/c4RrAt0MMNc`
- Rajesh Rajput, figurine de Luffy (aucune photo libre de cartes One Piece trouvée) :
  `unsplash.com/photos/5b-TBvF7_5M`

En réserve, deux photos de salon de collection d'Aaron Douglas (`928CzCJk1_w`, `i0plIFWUOAo`),
où l'on voit surtout des jeux vidéo rétro.

**Ce que l'essai a montré** : sur X, le rendu est propre. **Sur Instagram (portrait), une photo en
paysage n'occupe que le haut du cadre** et laisse près de la moitié de l'image en fond flou :
le modèle garde la photo entière pour ne couper ni visage ni carte. À trancher avant tout usage
réel : centrer la photo verticalement, ou recadrer en remplissant le cadre autour d'un point
choisi à la main. Une photo en portrait remplit bien les deux formats.

### 3. Cotes : marché japonais et historique One Piece

- **Le marché japonais est rouvert depuis le 25 octobre** (décision de Julian), après un essai à
  blanc concluant et la correction des noms : une carte japonaise porte désormais son nom
  complet en français (« Méga-Dracaufeu X-ex », plus « Dracaufeu · メガリザードンXex »), et
  chaque post dit s'il s'agit de cartes japonaises ou françaises. Premier passage réel le jeudi
  12 novembre.
- **L'historique One Piece repart de zéro** pour 46 identifiants à variantes multiples, leurs
  séries passées n'étant pas réattribuables. Les variations redeviennent calculables après
  deux relevés, soit début octobre : à contrôler.

### 4. Veille du calendrier 30e Anniversaire

**25 octobre** : Julian confirme la Pokébox et le Coffret Classeur en rayon (correctif en pull request n° 15). Restent à constater les Decks Combat (30 octobre). Le point ci-dessous date du 13 octobre.

Point au 13 octobre 2026, pages relues en texte brut et constat de Julian en magasin le 2
octobre (Bundle et Mini-Tins en rayon, Classeur absent). Ces produits n'ont pas de date certaine
en France, et l'article `pokemon-30e-anniversaire-sortie-mondiale-2026` le dit :

- **Pokébox** : annoncée pour le vendredi 16 octobre par Play-in (fiches « Pokébox 30 Ans »,
  4 boosters et 1 promo), Universtcg (11 octobre) et un calendrier publié sur X ; absente des
  listes officielles de septembre et d'octobre. La fiche « Pokébox » de La Maison du TCG, en
  stock, annonce une carte jumbo : c'est le contenu d'un coffret, pas d'une boîte métal.
- **Coffret Classeur** : sortie le 23 octobre confirmée par Julian le 22 (un contact chez Smyths Toys a déjà reçu les cartons). Absent des rayons le 2 octobre. Pokémon France le place en octobre
  (liste du 1er octobre, sans jour) ; Play-in et Universtcg l'annoncent pour le vendredi 23
  octobre. La Maison du TCG affichait encore « sortie le 2 octobre » le 13.
- **Decks Combat** : 30 octobre selon Play-in, mois confirmé par la liste officielle d'octobre ;
  le calendrier publié sur X les met au 6 novembre.
- **Tripack** : T4 2026 selon Pokémon France ; 13 novembre selon Play-in et le calendrier publié
  sur X, fin novembre selon Universtcg.
- **Collection K.O.** : annoncée au T3 2026, sans date précise, absente des rayons à l'ouverture
  et de la liste officielle d'octobre.

La tâche planifiée `veille-calendrier-pokemon-30-ans` relit chaque lundi à 8h les pages
officielles de Pokémon France jusqu'au 31 décembre 2026. Elle ne modifie rien : elle signale un
changement et Julian décide. N'ajuster l'article qu'à partir de ces pages ou d'un constat en
magasin, jamais d'un blog seul (règle dans `CLAUDE.md`, « Dates de sortie de produits »). La
veille lit aussi les fiches 30 ans de La Maison du TCG, signal secondaire qui donnait encore le 16
septembre pour le Tripack et la Pokébox le 20 septembre, alors qu'aucun n'était sorti.

**Play-in, un signal à lire en plus** : chaque fiche porte « Sortie prévue le … ». Le 13 octobre,
elle donnait le 23 octobre pour le Classeur quand La Maison du TCG gardait le 2. **Un résumé de
moteur de recherche n'est pas une lecture** : le rapport de la veille du 13 octobre prêtait à
Play-in un « 2 octobre » absent de sa fiche, et voyait une confusion dans une description de
Pokébox (4 boosters et 1 promo) qui est bien celle de la boîte métal.

**Contradiction officielle connue** : le communiqué de Pokémon France du 16 septembre (agence
Reset PR) liste la Collection autocollant et la « Boîte 30ᵉ Anniversaire » parmi les produits
disponibles dès le 16, alors que Julian ne les a vues dans aucun magasin et que la page produits
officielle place la Collection autocollant au 4e trimestre. Le constat de Julian prime, ce
communiqué ne doit pas servir à dater les produits.

### 5. File d'annonces : résorbée, à surveiller

Depuis le créneau du dimanche (27 septembre), la file ne prend plus de retard. Au 30
septembre, Buffer a relayé les 18 articles publiés et Discord n'attend qu'un article (OP-18).
Le relais ne sort qu'un article par passage, les dimanches, mardis et vendredis.

### 6. Carte BiP : l'équipe d'agents IA, réglée le 22 octobre

Carte holo « L'équipe IA » placée en **05/20** dans la banque privée, à la demande de Julian : les six agents BMAD réellement installés (Mary, John, Winston, Sally, Amelia, Paige). Les anciennes 05 à 15 passent en 06 à 16 ; l'ancienne 16 « Le top des hausses » sort en réserve, son fait n'étant plus vrai (un top chaque semaine depuis le 13 octobre). Publication prévue le dimanche 8 novembre par la routine du samedi. Chantier à retirer une fois la carte publiée.

### 7. Cote One Piece en euros (priorité de Julian, 14 octobre)

**Repris plus tard** (arbitrage du 25 octobre).

One Piece est dans la rotation du top des hausses, mais **coté en dollars sur le marché
américain** (`scripts/cote-one-piece.mjs` relève optcgapi, converti en euros à taux fixe) :
`optcgapi`, `apitcg` et `tcgcsv` sont adossés à TCGplayer, et TCGdex ne couvre que Pokémon.
Pour un public français, une hausse américaine n'est pas une hausse de son marché. La décision du 20 août écartait l'**API** Cardmarket (compte professionnel exigé) : elle
tient toujours.

**Mais Cardmarket publie des guides de prix publics, sans compte ni clé** :
`downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_<jeu>.json` et
`productList/products_singles_<jeu>.json` (identifiants de jeu : Pokémon 6, One Piece 18, Dragon
Ball 13, Magic 1, Yu-Gi-Oh 3, Lorcana 19). Prix en euros : le moins cher en ligne, la moyenne, la
tendance, et les moyennes de ventes constatées sur 1, 7 et 30 jours. Trouvé dans les notes de
recherche de PokéGator (5 août), **revérifié le 30 septembre** : HTTP 200, fichier One Piece de
2,7 Mo mis à jour le jour même.

À instruire avant d'y toucher : ces adresses ne sont **pas contractualisées** (elles peuvent
disparaître, et leurs conditions d'usage sont à faire valider, d'autant que Cards-Trading est un
concurrent de Cardmarket) ; il faut rapprocher les cartes One Piece d'OPTCG API des produits
Cardmarket par nom et extension. Même piste pour le prix de référence de la story 3.6 du MVP.
Repli en place : `scripts/releve-cotes.mjs` archive chaque semaine la cote One Piece, indexée par
impression.

Consigne de Julian (14 octobre) : passer par Cardmarket **ou une autre source fiable** en euros.
Toute autre source se juge sur les mêmes critères : prix en euros du marché européen, ventes
réellement constatées (pas seulement des offres), mise à jour quotidienne, accès sans contrat
fragile.

---

## 🟡 Améliorations identifiées, non appliquées

Le point 8 se traite **en dernier, avant l'ouverture publique**. Les points 9 à 11 sont **en pause
volontaire** (arbitrages du 25 octobre) : ne pas les relancer sans raison.

### 8. Durcir la gestion des secrets

Décision assumée : les webhooks Discord et les clés d'API ont transité en clair dans une
conversation, l'enjeu étant jugé faible à ce stade. Ils sont en secrets GitHub, **jamais
committés** : le dépôt est public et l'historique git est définitif. À reprendre quand
l'audience ou l'équipe grandira : faire tourner les webhooks et les clés, et envisager un dépôt
privé pour l'automatisation.

### 9. Webhook de bounce Resend

Optionnel. Détecterait les adresses invalides côté serveur plutôt qu'a posteriori dans le
dashboard. Le validateur Damerau-Levenshtein couvre déjà les fautes de frappe courantes.

### 10. Aucun salon Discord interne

Les 7 webhooks configurés pointent tous vers des **salons publics** de la communauté. Il
n'existe aucun canal interne pour la coordination d'équipe, ni d'identifiant Discord de Valérian
côté projet. À créer si les échanges d'équipe doivent passer par Discord.

### 11. Pipeline vidéo TikTok par Seedance : reporté, pas abandonné

Plan complet dans `docs/plans/2026-09-08-pipeline-video-tiktok.md` : un clip de 7 à 10 s généré
en image-to-video depuis la vignette existante, avec repli automatique sur l'image. **Reporté le
19 septembre** : implémentation jugée lourde au regard du gain attendu. Déjà tranché : Seedance en
image-to-video (un text-to-video inventerait un visuel de carte inexistant), Kling et Grok
Imagine écartés au prix à qualité comparable, CapCut écarté faute d'API côté serveur. Le compte
TikTok reste **volontairement personnel** (décision du 19 septembre).

---

## ✅ En place

| Automatisation | Rythme | État |
|---|---|---|
| `keep-alive` | 6 h, plus le cron Vercel quotidien | ✅ les deux bases Supabase |
| Rapport mensuel d'inscriptions | le 1er du mois, dans `/api/keep-alive` | ✅ un seul envoi (idempotence Resend), premier le 1er octobre |
| `publie-articles` | quotidien, démarre vers 11h UTC | ✅ |
| `alerte-relecture` | push sur `blog/**`, rappel quotidien 05:32 UTC | ✅ |
| `alerte-automatisations` | quotidien 06:02 UTC | ✅ |
| `annonce-discord`, `annonce-buffer` | dimanche, mardi, vendredi | ✅ file résorbée |
| `cote-hebdo` | jeudi | ✅ rotation marché français, japonais (rouvert le 25 octobre) et One Piece ; confirmation sur 7 jours, paliers et repli de marché depuis le 13 octobre |
| `newsletter-hebdo` | samedi 13h37 | ✅ |
| `brouillons-sociaux` | à chaque dépôt de `data/social/*.json` | ✅ |
| `controle-social` | quotidien 15:30 UTC | ✅ |
| `essai-images-ia` | manuel | ✅ essai à blanc vérifié en CI le 30 septembre ; Gemini répond 429 (quota d'image nul sans facturation), premier passage réel en attente d'un accès (chantier 2) |
| Routines Claude Desktop | mardi (article Pokémon ou One Piece), vendredi (autres TCG), samedi (posts de la semaine), lundi (veille du calendrier), le 28 (relevé du trafic, depuis le 14 octobre) | ✅ toutes exécutées ; app fermée, elles partent au lancement suivant (celle du samedi 10 a tourné le 13) |
| Validation mobile | testée par Julian sur son téléphone, le 14 octobre | ✅ « tout est ok » (menu, ancres, carrousels, images : la liste de contrôle de l'ancien chantier 6) |
| Pages hub par TCG | statique | ✅ 7 en ligne, au sitemap |

Plus : provenance des inscriptions, CTA en fin d'article, aperçu de lien social, flux RSS,
vignettes par article, balisage FAQPage, `llms.txt`, robots.txt ouvert aux moteurs IA,
traduction des cartes Dresseur japonaises, recoupement des prix contre TCGplayer.
