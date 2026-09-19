# Reste à faire — Cards-Trading

État au **19 septembre 2026**. Les règles durables vivent dans `CLAUDE.md` ;
ce fichier ne liste que ce qui est **ouvert**. Retirer une ligne dès qu'elle
est traitée.

---

## 📊 Ce que disent les chiffres (19 septembre)

**28 inscrits**, dont **2 seulement depuis le 2 septembre**. La croissance
constatée début septembre (7 en une semaine) s'est arrêtée net.

Provenance, relevée directement en base :

| Source | Inscriptions | Dernière |
|---|---|---|
| (non renseignée, avant le traçage) | 15 | 8 août |
| `chatgpt.com` | 4 | 10 sept |
| `direct` | 4 | 31 août |
| `google.com` | 2 | 30 août |
| **`l.instagram.com`** | **1** | **13 sept** |
| `perplexity.ai` | 1 | 20 août |
| `verif-manuelle` | 1 | 25 août |

Deux corrections par rapport à l'état du 2 septembre :

1. **Les réseaux sociaux ont produit leur première inscription**, via
   Instagram le 13 septembre. L'affirmation « aucune ne vient des réseaux »
   n'est plus vraie. Une seule sur treize tracées, mais elle existe.
2. **Le SEO et les moteurs IA restent le canal dominant** : 7 des 13
   inscriptions tracées, dont 5 de moteurs IA. Le constat d'arbitrage tient
   donc toujours, mais sur une base qui a cessé de croître.

⚠️ Le compteur « joueurs déjà inscrits » de la landing est **délibérément
artificiel** (`api/views.js` : base 263, plus 1 à 3 par jour, déterministe).
Ne pas le confondre avec le nombre réel d'inscrits ci-dessus.

---

## 🔴 Chaîne de publication — cassée huit jours, réparée le 19 septembre

### A. Le build refusait Node 20, et personne ne l'a vu

`publie-articles.yml` a **échoué tous les jours du 11 au 18 septembre**,
toujours au même endroit :

```
Node.js v20.20.2 is not supported by Astro!
Please upgrade Node.js to a supported version: ">=22.12.0"
```

Astro 6.3.1 exige Node 22.12 minimum ; les workflows étaient épinglés sur
Node 20. Les six sont passés en Node 22.

**Ce que la panne a coûté**, et c'est la partie instructive :

- L'article Star Wars, dû le 10 septembre et jugé complet par les contrôles,
  est resté en brouillon **neuf jours**.
- Les vignettes des deux articles de septembre étaient générées à chaque
  passage puis **perdues**, le workflow mourant au build juste avant l'étape
  de commit. Elles répondaient 404 en production.
- D'où l'échec en cascade d'`annonce-buffer` les 15 et 18 septembre :
  « InvalidInputError : Image could not be read from its URL » sur les trois
  réseaux.
- Et aucun aperçu de lien social sur ces deux articles.

⚠️ **La leçon à retenir.** Le contrôle local répondait « PUBLIE » sans rien
signaler, parce que le poste tourne déjà en Node 22. C'est l'écart entre le
local et la CI qui a rendu la panne invisible, pas son silence : les huit
passages étaient rouges dans l'onglet Actions. Personne ne les regardait.

### B. Ce qui reste ouvert de cette histoire

- ~~Rien n'alerte quand un workflow échoue~~ **posé le 19 septembre.**
  `alerte-automatisations.yml` tourne chaque jour à 06:02 UTC, après la
  publication et l'alerte de relecture. Il signale l'état COURANT et non
  « des échecs cette nuit » : un workflow n'apparaît que si son dernier
  passage terminé est un échec, et l'email dit depuis combien de passages.
  Éprouvé en CI sur l'état réel : « Publie les articles dus échoue depuis
  10 passages, depuis le 2026-09-09 ». Rien n'est envoyé quand tout est au
  vert.
- **L'article Star Wars n'est pas encore publié** : le prochain passage du
  cron (05:12 UTC) devrait le sortir maintenant que le build passe. À
  vérifier en production.
- **Deux articles attendent d'être annoncés** sur Buffer. Le relais ne sort
  qu'un article par passage, les mardis et vendredis.

---

## 🟠 Fiabilité des cotes — traité le 19 septembre

Le détail est dans les messages de commit et les commentaires de
`scripts/cote-hebdo.mjs`, `publie-cote.mjs` et `releve-cotes.mjs`. En
résumé : nom de carte réellement publié, référence d'impression ajoutée,
garde-fous de liquidité et de non-stagnation, mention factuelle, lien X en
réponse, phase de publication rendue indépendante de l'API, archive One Piece
réindexée par impression.

**Ce qui reste ouvert :**

- **Le post X des cotes n'a toujours pas de visuel.** La vignette du podium
  n'existe qu'en 1080×1080, format que X rogne. Lui donner une image demande
  une maquette 1200×630 : le podium à 165 px d'interligne ne rentre pas dans
  630 px de haut.
- **Le marché japonais reste suspendu** dans `cote-hebdo.yml`. Les garde-fous
  sont posés et mesurés (49 candidats ramenés à 4, les trois cartes gelées
  écartées), mais aucun passage réel ne les a validés. À rouvrir après un
  déclenchement manuel concluant.
- **L'historique One Piece repart de zéro** pour 46 identifiants à variantes
  multiples, leurs séries passées n'étant pas réattribuables. Les variations
  redeviendront calculables pour eux après deux relevés, soit début octobre.

---

## 🔵 Prochain chantier décidé

### SEO : volume, maillage interne et pages hub

Plan d'implémentation écrit et committé :
`docs/plans/2026-09-08-seo-volume-maillage-hubs.md`.

Trois volets : l'article du vendredi passe d'optionnel à obligatoire (le
volume indexable double), un lien interne vers un article du même TCG devient
un critère bloquant contrôlé à la publication, et une page hub par TCG agrège
les articles avec un appel à rejoindre la bêta.

⚠️ La tâche 1 du plan suppose que la rédaction du vendredi soit réellement
déclenchée : elle dépend d'une tâche planifiée Claude Desktop, hors dépôt,
qui ne tourne que si l'application est ouverte.

---

## 🟠 À observer

### 1. Validation mobile sur un vrai téléphone

Le navigateur d'audit **ne défile pas** et **ne compose pas de frames** :
aucune transition CSS ne s'exécute.

Tout ce qui a été affirmé sur la navigation mobile repose sur des valeurs
**cibles**, pas sur un rendu observé. À valider sur le Solanaphone : les
ancres du menu, la fermeture du panneau, les carrousels, et le rendu des
images après les correctifs de ratio.

---

## 🟡 Améliorations identifiées, non appliquées

### 2. Cote One Piece en euros — abandonnée en l'état

One Piece reste **hors de la rotation du top des hausses**, et c'est
définitif tant qu'aucune source gratuite ne cote en euros.

`optcgapi`, `apitcg` et `tcgcsv` sont tous adossés à TCGplayer, donc en
**dollars sur le marché américain**. TCGdex est le seul à coter en euros via
Cardmarket, et ne couvre que Pokémon. **L'accès Cardmarket est écarté** : il
exige un compte professionnel, décision prise le 20 août, ne pas y revenir.

Repli en place : `scripts/releve-cotes.mjs` archive chaque semaine la cote
One Piece, désormais indexée par impression.

### 3. Durcir la gestion des secrets

Décision assumée : les webhooks Discord et les clés d'API ont transité en
clair dans une conversation, l'enjeu étant jugé faible à ce stade. Ils sont
en secrets GitHub, **jamais committés** — le dépôt est public et l'historique
git est définitif. Vérifié : aucune fuite.

À reprendre quand l'audience ou l'équipe grandira : faire tourner les
webhooks et les clés, et envisager un dépôt privé pour l'automatisation.

### 4. Webhook de bounce Resend

Optionnel. Détecterait les adresses invalides côté serveur plutôt qu'a
posteriori dans le dashboard. Le validateur Damerau-Levenshtein couvre déjà
les fautes de frappe courantes.

### 5. Aucun salon Discord interne

Les 7 webhooks configurés pointent tous vers des **salons publics** de la
communauté. Il n'existe aucun canal interne pour la coordination d'équipe, ni
d'identifiant Discord de Valérian côté projet.

À créer si les échanges d'équipe doivent passer par Discord plutôt que par un
autre canal.

### 6. Pipeline vidéo TikTok par Seedance — reporté, pas abandonné

Plan complet écrit et committé :
`docs/plans/2026-09-08-pipeline-video-tiktok.md`. Il remplace l'image fixe des
posts TikTok par un clip de 7 à 10 s généré en image-to-video depuis la
vignette existante, avec repli automatique sur l'image.

**Reporté le 19 septembre** : implémentation jugée lourde au regard du gain
attendu à ce stade.

Ce qui est déjà tranché et n'a pas à être réinstruit : Seedance en
image-to-video (un text-to-video inventerait un visuel de carte inexistant),
Kling et Grok Imagine écartés au prix à qualité comparable, CapCut écarté
faute d'API de montage et d'export côté serveur.

---

## ✅ Vérifié le 19 septembre

| Point | Preuve |
|---|---|
| Format X « image + lien en réponse » | Post OP-17 du 9 sept : `threadCount: 2`, vignette 1200×630 sur le message principal, lien en réponse, aucune erreur. 239 impressions et 2,09 % d'engagement, contre 151 et 0 % pour le post de cotes sans visuel. |
| Débordement de « Cardmarket » | Mesuré au pire cas (981 px) après correctif : 3,5 px de réserve, 4,2 px de la cellule voisine, aucun débordement du document. Les 15 px annoncés jusqu'ici étaient périmés. |
| Vignettes sociales | Les quatre fichiers des deux articles de septembre répondent 200 en production. |
| Chaîne Buffer | Essai en mode brouillon après correctif : twitter, instagram et tiktok acceptés. |
| Compte TikTok | Reste **volontairement personnel** (`tchikibalianos`). Décision du 19 septembre : pas de rebrand, pas de tournage. La ligne « à convertir » était caduque. |

---

## ✅ En place

| Automatisation | Rythme | État |
|---|---|---|
| `keep-alive` | 6 h | ✅ les deux bases Supabase |
| `annonce-discord` | mardi, vendredi | ✅ routé par TCG |
| `annonce-buffer` | mardi, vendredi | ✅ après correctif des vignettes |
| `cote-hebdo` | jeudi | ✅ marché international, japonais suspendu |
| `newsletter-hebdo` | samedi 13h37 | ✅ digests envoyés |
| `publie-articles` | quotidien 05:12 UTC | ✅ après passage en Node 22 |
| `alerte-automatisations` | quotidien 06:02 UTC | ✅ éprouvé en CI |

Plus : provenance des inscriptions, CTA en fin d'article, aperçu de lien
social, flux RSS, vignettes par article, balisage FAQPage, `llms.txt`,
robots.txt ouvert aux moteurs IA, traduction des cartes Dresseur japonaises,
recoupement des prix contre TCGplayer.
