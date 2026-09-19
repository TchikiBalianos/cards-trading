# Reste à faire — Cards-Trading

État au **2 septembre 2026**, complété le **19 septembre**. Les règles durables vivent dans `CLAUDE.md` ;
ce fichier ne liste que ce qui est **ouvert**. Retirer une ligne dès
qu'elle est traitée.

---

## 📊 Ce que disent les chiffres (2 septembre)

**26 inscrits, dont 7 sur les sept derniers jours** — contre 16 au total
une semaine plus tôt. La croissance est réelle et récente.

Provenance des inscriptions tracées :

| Source | Inscriptions | Dernière |
|---|---|---|
| `direct` | 4 | 31 août |
| `chatgpt.com` | 3 | 29 août |
| `google.com` | 2 | 30 août |
| `perplexity.ai` | 1 | 20 août |
| Réseaux sociaux (`x`, `instagram`, `tiktok`, `discord`) | **0** | — |

⚠️ **Le constat le plus important du projet à ce jour.** Six inscriptions
sur onze tracées viennent de moteurs de recherche, dont quatre de moteurs
IA. **Aucune ne vient des réseaux sociaux**, alors que Discord, X,
Instagram et TikTok publient automatiquement depuis deux semaines.

Cela ne veut pas dire que les réseaux ne servent à rien — l'audience s'y
construit — mais que **le SEO et les moteurs IA sont, mesurément, le seul
canal qui convertit aujourd'hui**. Toute décision d'arbitrage de temps
devrait en tenir compte.

---

## 🔴 En cours — priorité absolue

### 0. Identification des cartes dans le top des hausses

Signalé par un follower, et le reproche est fondé : le post affiche
« Camérupt 3,54 € (+21 %) », c'est-à-dire le seul nom du Pokémon. Or une
même carte existe en dizaines d'impressions selon l'extension, le numéro,
la langue et la variante, dont les cotes n'ont aucun rapport entre elles.
Annoncer une tendance sans dire DE QUELLE carte on parle ne veut rien dire.

Cible : identifier chaque carte par son nom, le code de son extension, son
numéro de carte, et si la source le permet sa variante et sa langue.

**Tranché le 19 septembre, après vérification dans le code et les données.**
Pour Pokémon, l'information N'EST PAS perdue : `cote-hebdo.mjs` conserve un
`id` qui porte déjà le code d'extension et le numéro (`me01-156`), plus le
nom de l'extension, et l'archive `data/cotes/podiums-hebdo.json` les contient.
Le podium est appauvri au seul moment de la mise en forme, dans
`publie-cote.mjs`. Le correctif est donc localisé et peu risqué.

Deux réserves quand même :

- **La variante reste réellement absente.** TCGdex expose deux séries de prix
  en parallèle (`trend`/`avg30` et `trend-holo`/`avg30-holo`) ; le script lit
  les champs non suffixés, donc il cote une variante sans jamais dire
  laquelle.
- **Il existe un second consommateur.** `scripts/newsletter-hebdo.mjs` lit le
  même archive pour l'email du samedi. Corriger le post du jeudi sans lui
  laisserait la newsletter annoncer « Camérupt » deux jours plus tard.

Sur le marché japonais, `set` reste le nom japonais (« ひかる伝説 ») et
l'image est absente : l'affichage devra retomber sur le code d'extension.

---

### 0 bis. L'archive des cotes One Piece se corrompt chaque semaine

Découvert le 19 septembre en instruisant le point précédent. Rien ne le
signalait, et le fichier seul ne permet pas de le voir.

`releve-cotes.mjs` indexe les cartes par `card_set_id` (`OP14-112`). Or cet
identifiant ne désigne PAS une impression : sur les 5 derniers sets, 159 des
632 identifiants portent 2 ou 3 variantes, avec un écart de cote médian de
x36 entre variantes d'un même identifiant. Exemple réel :

```
OP14-112  Boa Hancock                    6,01 $
OP14-112  Boa Hancock (Alternate Art)   83,68 $
OP14-112  Boa Hancock (SP)             531,82 $
```

L'affectation écrase donc silencieusement : le prix retenu est celui de la
dernière ligne renvoyée par l'API, dont l'ordre n'est pas garanti. Et le nom
est figé à la première apparition, donc une bascule de variante ne se voit
même pas dans le nom archivé.

**Ce n'est pas théorique.** Sur les 227 clés suivies, 150 sont exposées et
**6 ont déjà basculé** en cours d'historique, valeurs concordant au centime
avec la cote de l'autre variante :

```
EB04-061   20/08 : 69,75 $ (Alternate Art)  ->  03/09 : 24 995,95 $ (SP)
OP16-003   20/08 : 37,39 $ (Alternate Art)  ->  03/09 : 2 $ (carte de base)
```

Conséquence : `calculerVariations()` produit aujourd'hui un top 5 entièrement
faux, mené par un « +35 736 % » sur une carte qui n'a pas bougé. Cette
fonction est d'ailleurs la seule des trois à n'avoir **aucun plafond de
plausibilité**, contrairement à `cote-hebdo.mjs` et `cote-one-piece.mjs`.

Ce qui limite l'urgence : One Piece est **hors rotation de publication**
(voir le point 3), donc rien de faux n'est publié aujourd'hui. Ce qui la
maintient : le relevé tourne tous les jeudis et continue d'écrire, donc
l'historique se dégrade semaine après semaine.

⚠️ Corriger la clé ne réparera pas le passé : les 5 relevés existants ne sont
pas réattribuables de façon sûre pour les cartes ambiguës.

---

## 🔵 Prochain chantier décidé

### SEO : volume, maillage interne et pages hub

Décidé le 19 septembre, à enchaîner après la correction ci-dessus. Plan
d'implémentation écrit et committé :
`docs/plans/2026-09-08-seo-volume-maillage-hubs.md`.

Trois volets : l'article du vendredi passe d'optionnel à obligatoire (le
volume indexable double), un lien interne vers un article du même TCG
devient un critère bloquant contrôlé à la publication, et une page hub par
TCG agrège les articles avec un appel à rejoindre la bêta.

---

## 🟠 À observer — premiers passages réels

### 1. Le format X « image + lien en réponse »

Mis en place le 1er septembre, **jamais tourné en conditions réelles**.
Le post principal porte la vignette 1200×630 et le lien part en première
réponse (thread Buffer), pour ne pas subir la pénalité de portée que X
applique aux liens sortants.

Premier vrai passage : jeudi 3 septembre (tâche planifiée
`cards-trading-annonce-storm-emeralda-jeudi`). À vérifier dans les logs
du run Buffer : aucune erreur sur le canal `twitter`, et le rendu réel
du thread sur le compte.

### 2. Validation mobile sur un vrai téléphone

Le navigateur d'audit **ne défile pas** et **ne compose pas de frames** :
aucune transition CSS ne s'exécute, les captures échouent.

Tout ce qui a été affirmé sur la navigation mobile repose sur des valeurs
**cibles**, pas sur un rendu observé. À valider sur le Solanaphone : les
ancres du menu, la fermeture du panneau, les carrousels, et le rendu des
images après les correctifs de ratio.

Le correctif du logo du blog (1er septembre) a été mesuré à 320, 360, 412
et 1280px, mais jamais vu à l'œil sur un téléphone.

---

## 🟡 Améliorations identifiées, non appliquées

### 3. Cote One Piece en euros — abandonnée en l'état

One Piece reste **hors de la rotation du top des hausses**, et c'est
définitif tant qu'aucune source gratuite ne cote en euros.

`optcgapi`, `apitcg` et `tcgcsv` sont tous adossés à TCGplayer, donc en
**dollars sur le marché américain**. TCGdex est le seul à coter en euros
via Cardmarket, et ne couvre que Pokémon. **L'accès Cardmarket est
écarté** : il exige un compte professionnel, décision prise le 20 août,
ne pas y revenir.

Repli en place : `scripts/releve-cotes.mjs` archive chaque semaine la cote
One Piece (185 cartes), pour des variations maison en dollars sur des
fenêtres longues.

### 4. Débordement de « Cardmarket » sous 1100 px

Préexistant, **amélioré mais pas éliminé** (24 px → 15 px à 980 px).
Mot insécable dans une colonne fixe. Invisible au-dessus de 1100 px.

### 5. Compte TikTok personnel

`tchikibalianos` est un compte **personnel**. À convertir en compte
Cards-Trading avant d'y pousser de la promo régulière.

### 6. Durcir la gestion des secrets

Décision assumée : les webhooks Discord et les clés d'API ont transité en
clair dans une conversation, l'enjeu étant jugé faible à ce stade. Ils
sont en secrets GitHub, **jamais committés** — le dépôt est public et
l'historique git est définitif. Vérifié : aucune fuite.

À reprendre quand l'audience ou l'équipe grandira : faire tourner les
webhooks et les clés, et envisager un dépôt privé pour l'automatisation.

### 7. Webhook de bounce Resend

Optionnel. Détecterait les adresses invalides côté serveur plutôt qu'a
posteriori dans le dashboard. Le validateur Damerau-Levenshtein couvre
déjà les fautes de frappe courantes.

### 8. Aucun salon Discord interne

Constaté le 2 septembre en cherchant à faire relire un brouillon à
Valérian : les 7 webhooks configurés pointent tous vers des **salons
publics** de la communauté. Il n'existe aucun canal interne pour la
coordination d'équipe, ni d'identifiant Discord de Valérian côté projet.

À créer si les échanges d'équipe doivent passer par Discord plutôt que
par un autre canal.

### 9. Pipeline vidéo TikTok par Seedance — reporté, pas abandonné

Plan complet écrit et committé :
`docs/plans/2026-09-08-pipeline-video-tiktok.md`. Il remplace l'image fixe
des posts TikTok par un clip de 7 à 10 s généré en image-to-video depuis la
vignette existante, avec repli automatique sur l'image en cas d'échec ou de
plafond de dépense atteint.

**Reporté le 19 septembre** : implémentation jugée lourde au regard du gain
attendu à ce stade. À reproposer quand le reste sera stabilisé, ou si la
portée TikTok redevient un enjeu prioritaire.

Ce qui est déjà tranché et n'a pas à être réinstruit : Seedance en
image-to-video (un text-to-video inventerait un visuel de carte inexistant),
Kling et Grok Imagine écartés au prix à qualité comparable, CapCut écarté
faute d'API de montage et d'export côté serveur.

---

## 📅 Suivi éditorial en cours

- **Jeudi 3 septembre, 10h** — tâche `cards-trading-annonce-storm-emeralda-jeudi` :
  annonce Storm Emeralda sur Discord et Buffer, ce qui libère la file.
- **Vendredi 4 septembre, 8h30** — tâche `cards-trading-publie-op17-vendredi` :
  publie l'article OP-17 avant les crons d'annonce de 11h17 et 12h23.
- **Brouillon Star Wars** (`blog/star-wars-unlimited-cad-bane-suspendu-2026`),
  en attente depuis le 29 août avec un `pubDate` dépassé au 28 août : à
  rafraîchir avant toute publication.

⚠️ Les tâches planifiées ne tournent que si l'application est ouverte à
l'heure prévue ; sinon elles se déclenchent à la prochaine ouverture.

---

## ✅ En place et vérifié

| Automatisation | Rythme | État |
|---|---|---|
| `keep-alive` | 6 h | ✅ les deux bases Supabase, 59 passages |
| `annonce-discord` | mardi, vendredi | ✅ routé par TCG, posts réels vérifiés |
| `annonce-buffer` | mardi, vendredi | ✅ X, Instagram, TikTok |
| `cote-hebdo` | jeudi | ✅ a tourné le 27/08, podium archivé |
| `newsletter-hebdo` | samedi 13h37 | ✅ 2 digests créés et envoyés |

La chaîne complète **cote-hebdo → archivage du podium → newsletter** a
fonctionné : le digest du 29 août contenait bien les trois cartes du
marché japonais relevées le 27.

Plus : provenance des inscriptions, CTA en fin d'article, aperçu de lien
social (URL absolue + vignette 1200×630), flux RSS, vignettes par article,
balisage FAQPage, `llms.txt`, robots.txt ouvert aux moteurs IA, traduction
des cartes Dresseur japonaises, recoupement des prix contre TCGplayer.
