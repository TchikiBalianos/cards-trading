# Reste à faire : Cards-Trading

État au **30 septembre 2026**. Les règles durables vivent dans `CLAUDE.md` ; ce
fichier ne liste que ce qui est **ouvert**. Retirer une ligne dès qu'elle est
traitée. Les chantiers clos (incidents du 19 au 22 septembre, fiabilité des
cotes, SEO, vérifications) sont archivés dans `docs/journal-des-corrections.md`.

Le MVP, le recrutement de vendeurs et le financement se suivent hors de ce
dépôt, qui est public.

---

## 🔴 Cette semaine

| Quand | Quoi | Qui |
|---|---|---|
| Jeu 1er oct. | Premier **rapport mensuel** d'inscriptions, vers 04h UTC : vérifier qu'il arrive en **un seul** exemplaire (section « Rapport mensuel » de `CLAUDE.md`). | Julian |
| Ven 2 oct. | La routine du vendredi (09:09) écrit l'article **Star Wars** sur une branche `blog/…` : relire, ouvrir la pull request, fusionner. Vérifier aussi en magasin la sortie du Bundle, des Mini-Tins et du Coffret Classeur (voir « Veille du calendrier »). | Julian |
| Sam 3 oct. | **Première exécution réelle** de la routine `social-cards-trading-semaine` : elle n'a jamais tourné, le premier lot a été écrit à la main. Contrôler la durée du passage (quelques minutes sans fichier écrit, c'est un échec silencieux), `data/social/2026-10-05.json`, le workflow `Brouillons sociaux`, puis cliquer **Schedule Post** dans Buffer. | Julian, Claude |
| Lun 5 oct. | La veille du calendrier 30e Anniversaire (08:00) rend son rapport. **Le soir, recontrôler l'article McDonald's** : annonce officielle ? date française ? Deux phrases de l'article sont au présent (voir `docs/briefs/2026-09-30-pokemon-mcdonalds-happy-meal.md`). | Claude, sur demande |
| Mar 6 oct. | L'article `pokemon-mcdonalds-happy-meal-cartes-2026` passe en ligne (`publie-articles`, vers 11h UTC). La routine du mardi doit s'arrêter à son étape 0, la semaine étant couverte : c'est attendu. Vérifier le 200 en production. | Claude |

---

## 🟠 Chantiers ouverts

### 1. Mesure du trafic

Le script Vercel Insights est servi en production (HTTP 200) mais l'API de Web
Analytics répond « introuvable » pour le projet `cards-trading` (30 septembre). À
vérifier dans le tableau de bord Vercel, onglet Analytics : activé ou non.

Sans nombre de visiteurs, aucun taux de conversion : on ne connaît que les inscrits
par source, moteurs IA et Google en tête. Les extensions du Chrome de Julian bloquent
le script, ses propres visites ne comptent jamais.

### 2. Illustrations réalistes pour les posts

Décision de Julian (30 septembre) : niveaux 1 et 2 en test, puis le niveau 3 une fois
tout validé. Niveau 1 : photos réelles et visuels officiels (modèle `photo` existant,
crédit obligatoire). Niveau 2 : images IA d'ambiance dans un nouveau modèle de visuel
`scene`, éprouvé sur 5 images. Niveau 3 : moteur de veille de visuels.

**Bloqué par un accès**, au choix : un compte Cloudflare gratuit avec un jeton Workers AI
(secrets `CLOUDFLARE_ACCOUNT_ID` et `CLOUDFLARE_API_TOKEN`), ou la facturation activée sur la
clé Gemini (`GEMINI_API_KEY` existe, mais la génération d'image y était à quota zéro le 20
août, HTTP 429). Tarifs lus le 30 septembre : FLUX-1-schnell sur Cloudflare tient dans le
quota gratuit de 10 000 neurons par jour ; Gemini 3.1 Flash-Lite Image coûte 0,0336 $ l'image.
Ne rien bâtir sur `gemini-2.5-flash-image`, arrêté le 2 octobre 2026.

### 3. Branche et poste de travail

- `fix/alerte-relecture-articles-modifies` : un commit du 17 septembre (alerter aussi pour
  les corrections d'articles déjà en ligne), jamais fusionné, en **conflit** avec
  `scripts/alerte-relecture.mjs` depuis les correctifs du 22 septembre. À rebaser puis
  fusionner, ou à abandonner.
- `.claude/settings.json` est non suivi dans le dépôt : à committer ou à ignorer.

### 4. Cotes : marché japonais et historique One Piece

- **Le marché japonais reste suspendu** dans `cote-hebdo.yml`. Les garde-fous sont posés et
  mesurés (49 candidats ramenés à 4, les trois cartes gelées écartées), mais aucun passage
  réel ne les a validés. À rouvrir après un déclenchement manuel concluant.
- **L'historique One Piece repart de zéro** pour 46 identifiants à variantes multiples, leurs
  séries passées n'étant pas réattribuables. Les variations redeviennent calculables après
  deux relevés, soit début octobre : à contrôler.

### 5. Veille du calendrier 30e Anniversaire

Quatre produits n'ont pas de date certaine en France, et l'article
`pokemon-30e-anniversaire-sortie-mondiale-2026` le dit :

- **Collection K.O.** : annoncée au T3 2026, sans date précise, absente des rayons à l'ouverture.
- **Coffret Classeur** : deux dates affichées, 2 octobre selon les revendeurs français et 4
  décembre aux États-Unis, faute de date française confirmée.
- **Tripack** : T4 2026, 13 novembre ou fin novembre selon les sources.
- **Pokébox** : 4 décembre selon les distributeurs, absente de la liste officielle de septembre.

Bundle et Mini-Tins (2 octobre) sont à vérifier en rayon ce jour-là.

La tâche planifiée `veille-calendrier-pokemon-30-ans` relit chaque lundi à 8h les pages
officielles de Pokémon France jusqu'au 31 décembre 2026. Elle ne modifie rien : elle signale un
changement et Julian décide. N'ajuster l'article qu'à partir de ces pages ou d'un constat en
magasin, jamais d'un blog seul (règle dans `CLAUDE.md`, « Dates de sortie de produits »). La
veille lit aussi les fiches 30 ans de La Maison du TCG, signal secondaire qui donnait encore le 16
septembre pour le Tripack et la Pokébox le 20 septembre, alors qu'aucun n'était sorti.

**Contradiction officielle connue** : le communiqué de Pokémon France du 16 septembre (agence
Reset PR) liste la Collection autocollant et la « Boîte 30ᵉ Anniversaire » parmi les produits
disponibles dès le 16, alors que Julian ne les a vues dans aucun magasin et que la page produits
officielle place la Collection autocollant au 4e trimestre. Le constat de Julian prime, ce
communiqué ne doit pas servir à dater les produits.

### 6. File d'annonces : résorbée, à surveiller

Depuis le créneau du dimanche (27 septembre), la file ne prend plus de retard. Au 30
septembre, Buffer a relayé les 18 articles publiés et Discord n'attend qu'un article (OP-18).
Le relais ne sort qu'un article par passage, les dimanches, mardis et vendredis.

### 7. Validation mobile sur un vrai téléphone

Le navigateur d'audit **ne défile pas** et **ne compose pas de frames** : aucune transition CSS
ne s'exécute. Tout ce qui a été affirmé sur la navigation mobile repose sur des valeurs
**cibles**, pas sur un rendu observé. À valider sur le Solanaphone : les ancres du menu, la
fermeture du panneau, les carrousels, le rendu des images après les correctifs de ratio et les
quatre corrections d'affichage mobile du 28 septembre.

---

## 🟡 Améliorations identifiées, non appliquées

### 8. Cote One Piece en euros : abandonnée en l'état

One Piece reste **hors de la rotation du top des hausses**, et c'est définitif tant qu'aucune
source gratuite ne cote en euros. `optcgapi`, `apitcg` et `tcgcsv` sont adossés à TCGplayer, donc
en **dollars sur le marché américain**. TCGdex cote en euros via Cardmarket mais ne couvre que
Pokémon. **L'accès Cardmarket est écarté** : il exige un compte professionnel, décision du 20
août, ne pas y revenir. Repli en place : `scripts/releve-cotes.mjs` archive chaque semaine la
cote One Piece, indexée par impression.

### 9. Durcir la gestion des secrets

Décision assumée : les webhooks Discord et les clés d'API ont transité en clair dans une
conversation, l'enjeu étant jugé faible à ce stade. Ils sont en secrets GitHub, **jamais
committés** : le dépôt est public et l'historique git est définitif. À reprendre quand
l'audience ou l'équipe grandira : faire tourner les webhooks et les clés, et envisager un dépôt
privé pour l'automatisation.

### 10. Webhook de bounce Resend

Optionnel. Détecterait les adresses invalides côté serveur plutôt qu'a posteriori dans le
dashboard. Le validateur Damerau-Levenshtein couvre déjà les fautes de frappe courantes.

### 11. Aucun salon Discord interne

Les 7 webhooks configurés pointent tous vers des **salons publics** de la communauté. Il
n'existe aucun canal interne pour la coordination d'équipe, ni d'identifiant Discord de Valérian
côté projet. À créer si les échanges d'équipe doivent passer par Discord.

### 12. Pipeline vidéo TikTok par Seedance : reporté, pas abandonné

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
| `cote-hebdo` | jeudi | ✅ marché international, japonais suspendu |
| `newsletter-hebdo` | samedi 13h37 | ✅ |
| `brouillons-sociaux` | à chaque dépôt de `data/social/*.json` | ✅ |
| `controle-social` | quotidien 15:30 UTC | ✅ |
| Routines Claude Desktop | mardi (article Pokémon ou One Piece), vendredi (autres TCG), samedi (posts de la semaine), lundi (veille du calendrier) | ✅ sauf celle du samedi, jamais exécutée |
| Pages hub par TCG | statique | ✅ 7 en ligne, au sitemap |

Plus : provenance des inscriptions, CTA en fin d'article, aperçu de lien social, flux RSS,
vignettes par article, balisage FAQPage, `llms.txt`, robots.txt ouvert aux moteurs IA,
traduction des cartes Dresseur japonaises, recoupement des prix contre TCGplayer.
