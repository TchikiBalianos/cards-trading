# Reste à faire — Cards-Trading

État au **2 septembre 2026**. Les règles durables vivent dans `CLAUDE.md` ;
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
