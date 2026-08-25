# Reste à faire — Cards-Trading

État au **25 août 2026**. Les règles durables vivent dans `CLAUDE.md` ;
ce fichier ne liste que ce qui est **ouvert**. Retirer une ligne dès
qu'elle est traitée.

**Rien ne bloque aujourd'hui.** Tous les secrets sont en place, les quatre
workflows tournent.

---

## Observer la FAQ dans les moteurs conversationnels

Le balisage `FAQPage` est en ligne depuis le 24 aout 2026, verifie servi
et valide. Reste a constater s il est repris : poser a Perplexity et a
ChatGPT une question couverte par la FAQ (« combien coute la vente d une
carte sur Cards-Trading ») et regarder si la reponse cite le site.

Le delai est de plusieurs semaines, ces moteurs ne reindexent pas a la
demande. Aucune action a prevoir si la reponse ne vient pas tout de suite.

## 🟢 Le 25 août : la routine article a tourné pour de vrai

Le garde-fou anti-doublon ajouté aux deux tâches planifiées (voir
`~/.claude/scheduled-tasks/blog-cards-trading-article-hebdo/SKILL.md`)
a passé son premier vrai test ce matin : la tâche du mardi 9h a détecté
que l'article Bandai (catégorie `actualite`) ne couvrait PAS le créneau
Pokémon obligatoire, et a rédigé
`blog/pokemon-worlds-2026-san-francisco-meta-standard` sans rien dupliquer.
Un second passage (fact-check) a corrigé un prix et des noms d'attaques
à 11h37 le même jour.

**À review avant vendredi 28 août** — l'article traite des Championnats
du Monde qui commencent ce jour-là, sa valeur retombe vite après :
```
git fetch origin blog/pokemon-worlds-2026-san-francisco-meta-standard
git show origin/blog/pokemon-worlds-2026-san-francisco-meta-standard:src/content/blog/pokemon-worlds-2026-san-francisco-meta-standard.md
```
2034 mots, `draft: true`, FAQ présente, image vérifiée. Reste la relecture
humaine avant de retirer `draft: true` et fusionner.

## 🟠 À observer — ce qui reste vraiment ouvert

### 1. Le premier passage réel de chaque automatisation

**Discord est désormais vérifié en conditions réelles** : le run de ce
matin (25 août, 09h53 UTC) a bien posté un article publié — le Dragon
Ball Story Booster 01 — sur le vrai webhook. La file traite un article
par exécution, du plus ancien au plus récent ; Bandai (24 août) partira
au prochain passage, vendredi.

Restent deux choses jamais vues en conditions réelles :

| À observer | Quand | Ce qui peut casser |
|---|---|---|
| Publication d'un post Buffer | aujourd'hui, ~12h23 | l'API a accepté la mise en file, pas la publication |
| Validation du média par Instagram et TikTok | idem | la vignette peut être refusée au moment de publier |
| Enchaînement de `cote-hebdo` | jeudi | commit → déploiement Vercel → publication, jamais joué bout en bout |

Le point le plus fragile est le troisième : le workflow committe la
vignette, **attend que l'URL réponde 200**, puis publie. La vérification
remplace un délai fixe, mais l'enchaînement complet reste à voir.

Vérifié le 25 août : la chaîne d'inscription fonctionne de bout en bout
(base + email admin + opt-in newsletter, testé en conditions réelles).
Vérifier aussi que la colonne `source` de `beta_submissions` se remplit
avec `x`, `instagram`, `discord`. C'est elle qui dira quel canal convertit
— et pour l'instant elle n'a enregistré aucune inscription réelle.

### 2. Défilement et animations sur un vrai téléphone

Le navigateur d'audit **ne défile pas** et **ne compose pas de frames** :
aucune transition CSS ne s'exécute, les captures d'écran échouent.

Tout ce qui a été affirmé sur la navigation mobile repose sur des valeurs
**cibles**, pas sur un rendu observé. À valider sur le Solanaphone : les
7 ancres du menu, la fermeture du panneau, les carrousels, et le rendu des
images après le correctif de ratio.

---

## 🟡 Améliorations identifiées, non appliquées

### 3. Cote One Piece en euros — abandonnée en l'état

One Piece reste **hors de la rotation du top des hausses**, et c'est
définitif tant qu'aucune source gratuite ne cote en euros.

Vérifié le 20 août : `optcgapi`, `apitcg` et `tcgcsv` sont tous adossés à
TCGplayer, donc en **dollars sur le marché américain**. TCGdex est le seul
à coter en euros via Cardmarket, et ne couvre que Pokémon.

**L'accès Cardmarket est écarté** : il exige un compte professionnel, que
Julian ne souhaite pas ouvrir. Décision prise le 20 août, ne pas y revenir.

Reste le repli : `scripts/releve-cotes.mjs` archive chaque semaine la cote
One Piece (185 cartes). Il permettra des variations maison — en dollars,
mais sur des fenêtres longues. À rebrancher dans le format si vous décidez
qu'une cote en dollars vaut mieux que pas de cote du tout.

### 4. Visuels générés par IA — service gratuit trouvé, gain à arbitrer

**Pollinations.ai** répond au besoin, vérifié le 20 août :

| Critère | Réalité mesurée |
|---|---|
| Clé d'API | aucune |
| Palier anonyme | 1 requête / 15 s (largement suffisant) |
| Licence | MIT, usage commercial permis |
| Appel réel | HTTP 200 en 1,6 s, image exploitable |
| Coût | 0 € |

Limites : dimensions **approximatives** (1200×630 demandé → 1059×556, à
recadrer avec `sharp`), un seul modèle sur le palier anonyme, sortie JPEG,
et un filigrane possible que `nologo=true` a évité sur les essais.

**Intégration prouvée** : fond IA + texte vectoriel composé par-dessus.
C'est le bon découpage — l'IA sait faire une ambiance, pas une typographie
ni une marque. Un essai sans cette séparation a produit une forme
pseudo-logo malgré la consigne « no logo ».

⚠️ **Mais le gain est marginal sur la vignette de cote** : pour que le texte
blanc reste lisible quel que soit le fond généré, il faut l'assombrir de
45 %. À ce niveau, la différence avec le dégradé déterministe se voit à
peine. Ne pas l'appliquer là.

**Où ça vaudrait le coup** : les vignettes d'ARTICLE, où un fond thématique
par TCG (dresseurs Pokémon, navire One Piece, arène Magic) apporterait une
vraie variété — là où la vignette actuelle est identique d'un article à
l'autre au titre près.

La clé Gemini reste en secret `GEMINI_API_KEY` : elle marchera si la
facturation Google est activée, mais elle n'est plus nécessaire.

### 5. Débordement de « Cardmarket » sous 1100 px

Préexistant, **amélioré mais pas éliminé** (24 px → 15 px à 980 px).
Mot insécable dans une colonne fixe. Invisible au-dessus de 1100 px.

### 6. Compte TikTok personnel

`tchikibalianos` est un compte **personnel**. À convertir en compte
Cards-Trading avant d'y pousser de la promo régulière.

### 7. Durcir la gestion des secrets

Décision assumée : les webhooks Discord et les clés d'API ont transité en
clair dans une conversation, l'enjeu étant jugé faible à ce stade. Ils
sont en secrets GitHub, **jamais committés** — le dépôt est public et
l'historique git est définitif. Vérifié : aucune fuite.

À reprendre quand l'audience ou l'équipe grandira : faire tourner les
webhooks et les clés, et envisager un dépôt privé pour l'automatisation.

### 8. Webhook de bounce Resend

Optionnel. Détecterait les adresses invalides côté serveur plutôt qu'a
posteriori dans le dashboard. Le validateur Damerau-Levenshtein couvre
déjà les fautes de frappe courantes.

---

## ✅ En place et vérifié

| Automatisation | Rythme | État |
|---|---|---|
| `keep-alive` | 6 h | ✅ les deux bases Supabase |
| `annonce-discord` | mardi, vendredi | ✅ routé par TCG, 7 webhooks validés, premier post réel le 25/08 |
| `annonce-buffer` | mardi, vendredi | ✅ X, Instagram, TikTok |
| `cote-hebdo` | jeudi | ⏳ jamais tourné en réel |

Plus : provenance des inscriptions (`beta_submissions.source`), CTA en fin
d'article, aperçu de lien social corrigé (URL absolue + vignette 1200×630),
flux RSS, vignettes 1080×1080 par article.
