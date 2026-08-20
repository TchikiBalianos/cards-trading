# Reste à faire — Cards-Trading

État au **19 août 2026**. Les règles durables vivent dans `CLAUDE.md` ;
ce fichier ne liste que ce qui est **ouvert**. Retirer une ligne dès qu'elle
est traitée.

---

## 🟠 À valider — hors de portée de l'environnement de test

### 1. Surveiller les premiers posts automatiques

La chaîne complète est en place et vérifiée :

| Canal | Média requis | État |
|---|---|---|
| X | texte seul | relayé automatiquement ✅ |
| Instagram *business* | image | vignette 1080×1080 ✅ |
| TikTok | image ou carrousel | vignette 1080×1080 ✅ |
| Discord | — | routé par TCG ✅ |

`annonce-buffer.yml` tourne mardi et vendredi à 12 h 23 (Paris),
`annonce-discord.yml` à 11 h 17. API GraphQL Buffer
(`https://api.buffer.com/graphql`, clé personnelle en secret), endpoint et
mutation vérifiés par introspection.

**Reste à observer**, ce que seul le temps dira :

- qu'un post parte réellement sur les trois réseaux — l'API a accepté les
  mises en file, ce qui est une forte présomption mais pas une preuve ;
- que la vignette générée passe la validation d'Instagram et de TikTok
  au moment de la publication, pas seulement à la mise en file ;
- que la colonne `source` de `beta_submissions` se remplisse avec
  `x`, `instagram`, `discord` — c'est elle qui dira quel canal convertit.

**Génération d'images par IA — vérifié le 20 août 2026 :**

| Modèle | ID exact | Palier gratuit API |
|---|---|---|
| Nano Banana 2 | `gemini-3.1-flash-image` | « Not available » |
| Nano Banana 2 Lite | `gemini-3.1-flash-lite-image` | « Not available » |
| Nano Banana Pro | `gemini-3-pro-image` | « Not available » |
| GPT Image 2 | `gpt-image-2-2026-04-21` | non documenté |

Le gratuit concerne AI Studio et ChatGPT, pas l'API — or c'est l'API qu'il
faut depuis un job. Coût négligeable cela dit : ~3 à 5 centimes l'image,
quelques euros par an. Le sujet est la clé, pas la dépense.

⚠️ L'IA doit rester une **surcouche** : quota épuisé ou refus de
modération laisseraient la chaîne sans image, donc muette. La vignette
déterministe reste le repli.

TikTok est un compte **personnel**, à convertir avant d'y pousser de la
promo régulière.

Limites du plan gratuit Buffer : 10 posts programmés, 3 canaux, 1 clé API.

### 2. Format récurrent piloté par les données — BLOQUÉ par la fraîcheur

Objectif : un 3ᵉ post hebdomadaire automatisé (« top des hausses »,
carte du jour) pour compléter le relais d'articles, qui ne fournit que
1 à 2 posts par semaine.

**Vérifié le 20 août 2026, et ça ne marche pas en l'état :**

- `api.pokemontcg.io` fonctionne sans clé et expose bien les champs
  nécessaires (`avg1`, `avg7`, `avg30`, `trendPrice`), ce qui permettrait
  de calculer une variation **sans stocker d'historique** ;
- **mais les prix sont gelés** : sur 40 cartes échantillonnées, les 39
  qui ont un prix portent toutes la même date, `2026/07/01` — 50 jours
  de retard. Un « top des hausses de la semaine » annoncerait des
  mouvements vieux de deux mois ;
- l'endpoint `/sets` répond 500/502 et la requête par plage de dates
  renvoie 400 : l'API est en outre instable ;
- `apitcg.com` couvre bien plusieurs TCG (One Piece, Magic, Digimon,
  Riftbound…) mais se présente comme une base de **cartes**, sans
  mention de prix.

**Conclusion** : le format « variation de prix » n'est pas tenable avec
les sources actuelles. Ne pas le construire — il produirait du contenu
faux publiquement.

Pistes de repli, fiables celles-là : calendrier des sorties de sets,
carte à l'honneur (visuel + anecdote), rétrospective d'un set. Les
images de cartes et les métadonnées sont stables, seuls les prix ne le
sont pas.

Une source de prix fraîche (API Cardmarket, qui demande un compte
professionnel et OAuth) reste la seule voie pour le format initial.

### 3. Défilement et animations sur un vrai téléphone

Le navigateur d'audit **ne défile pas** (`window.scrollTo` sans effet) et
**ne compose pas de frames** : aucune transition ni animation CSS ne
s'exécute, et `computer{action:"screenshot"}` échoue systématiquement.

Tout ce qui a été affirmé sur la navigation mobile repose donc sur des
valeurs **cibles** mesurées transitions neutralisées, pas sur un rendu animé
observé. À valider sur le Solanaphone :

- les 7 ancres du menu hamburger, sur plusieurs cycles d'affilée ;
- la fluidité de la fermeture du panneau ;
- les carrousels (flèches, pas de saut visuel) ;
- le rendu des images après le correctif de ratio du 19 août.

---

## 🟡 Améliorations identifiées, non appliquées

### 3. Consolidation des tokens du design system

Tables prêtes dans `scratchpad/audit-3-volets.md`. **Délibérément non
appliqué** : le gain est cosmétique et le risque de régression élevé sur
une feuille de style qui pilote la landing entière. À faire à froid, une
section à la fois, avec mesure avant/après.

### 4. Débordement de « Cardmarket » sous 1100 px

Préexistant, **amélioré mais pas éliminé** le 19 août (24 px → 15 px à
980 px de viewport). « Cardmarket » est un mot insécable dans une colonne
en largeur fixe : il déborde légèrement de sa cellule. Purement cosmétique,
invisible au-dessus de 1100 px. Piste : passer les en-têtes concurrents en
`font-size` fluide, ou raccourcir le libellé.

### 5. Durcir la gestion des secrets quand le projet grossira

Décision assumée le 19 août 2026 : les URL de webhook Discord ont été
transmises en clair dans une conversation, l'enjeu étant jugé faible à ce
stade. Elles sont bien stockées en secrets GitHub, **jamais committées** —
le dépôt `cards-trading` est public, un webhook dans l'historique git
serait exploitable par n'importe qui, définitivement.

À reprendre quand l'audience ou l'équipe grandira :

- faire **tourner** les webhooks Discord (les recréer, les anciens
  deviennent inertes) ;
- même chose pour la clé anon Supabase de la marketplace ;
- vérifier qu'aucun secret n'a fui dans l'historique
  (`git log -p | grep -i "discord.com/api/webhooks"`) ;
- envisager un dépôt privé pour la partie automatisation, ou
  l'*environnement* GitHub avec revue obligatoire.

Un webhook Discord compromis permet de poster n'importe quoi dans le
salon sous l'identité du serveur — nuisance de réputation, pas fuite de
données.

### 6. Webhook de bounce Resend

Optionnel. Permettrait de détecter les adresses invalides côté serveur
plutôt que de découvrir les rebonds a posteriori dans le dashboard. Le
validateur Damerau-Levenshtein côté formulaire couvre déjà les fautes de
frappe les plus courantes.

### 7. Revue de direction artistique — traitée

Audit mené le 19 août sur 5 largeurs (1440 / 1280 / 1024 / 768 / 390).
**Les 12 points relevés ont été appliqués**, sauf deux écarts assumés,
documentés en commentaire dans le CSS :

- **`.social-grid` garde son `max-width: 900px`.** La variante proposée
  (`min(900px, 82%)`) a été mesurée : elle *rétrécit* la grille entre
  1024 et 1220 px, où le retrait passait de 54 px à 134 px. Un cap en px
  sur une grille de trois cartes est un choix de lisibilité.
- **Les alphas de dégradé (bleus 0,08 / 0,12) ne sont pas fusionnés.** Ce
  sont des points d'arrêt dont l'écart avec leur voisin porte l'effet ;
  les aplatir se verrait. Seuls les doublons hors dégradé l'ont été.
- **`#888` conservé** : c'est le tiret « — » du comparatif, terne à
  dessein face au ✓ vert et au ✕ rouge. Rôle distinct, pas un doublon.

Point de vigilance introduit : le titre de `features` passe de 37 à 45 px
en desktop et occupe désormais 3 lignes dans sa colonne (168 px de haut,
sans débordement — la colonne absorbe). C'est le prix de l'échelle
unique. Si le rendu déplaît, raccourcir le libellé plutôt que de
réintroduire une taille dérogatoire.

---

## ✅ Traité récemment — ne pas refaire

- **20 août** — annonce Discord automatisée, routée par TCG. Les 7 webhooks
  sont en secrets GitHub (jamais committés) et **validés un par un** par un
  `GET` sur l'URL du webhook, qui renvoie le nom du salon visé sans rien y
  poster : Pokémon News, OnePiece News, Magic News, Dragon Ball News,
  Lorcana News, Yu-Gi-Oh! News, Actus TCG. Les 10 catégories du schéma sont
  couvertes, les 4 transverses par le filet `DEFAUT`. Premier post réel
  vérifié, et relance immédiate sans doublon.
- **20 août** — flux RSS sur `/rss.xml`, 7 articles, liens en
  `?utm_source=rss`.
- **19 août** — keep-alive vert sur les DEUX bases. Le secret
  `SUPABASE_APP_ANON_KEY` avait d'abord été posé sur le dépôt
  `cards-trading-app` au lieu de `cards-trading` — les secrets Actions sont
  portés par le dépôt. Une fois au bon endroit, le job échouait encore : le
  test de succès cherchait `"ok":true` sans espaces alors que PostgREST
  renvoie `"ok" : true`. Corrigé, les deux jobs passent.
- **19 août** — provenance des inscriptions capturée
  (`beta_submissions.source` : `utm_source` > référent > `direct`). Chaîne
  testée de bout en bout en production, ligne de test supprimée.

- **19 août** — ratio des images restauré (`img { height: auto }` en fin de
  `landing.css`). Vérifié en production : 0 image déformée sur 52.
- **19 août** — « Cards-Trading » du comparatif tenait sur deux lignes entre
  980 et 1270 px de viewport. Colonne 22 % → 26 %, en-tête à 15 px. Vérifié
  de 980 à 1440 px : une seule ligne partout.
- **19 août** — cache-busting propagé aux 9 `@import`. Les CSS importés
  étaient servis 7 jours depuis le cache, ce qui masquait les correctifs.
  Voir `CLAUDE.md`, section CSS.
- **19 août** — audit DA appliqué en trois lots : correctifs ciblés
  (CTA du hero à égalité et au-dessus du seuil tactile, liens de footer
  passés de 15 px à 44 px, police Arial involontaire éliminée sur 38
  éléments, séparateur manquant, gouttière de `features`), puis échelle
  typographique `--h2-section` et échelle d'espacement `--space-*`, puis
  unification des rayons, lueurs et gris. Écart entre les six titres de
  section : **11 px avant, 0,0 px après**, à toutes les largeurs.
