# Reste à faire — Cards-Trading

État au **20 août 2026**. Les règles durables vivent dans `CLAUDE.md` ;
ce fichier ne liste que ce qui est **ouvert**. Retirer une ligne dès
qu'elle est traitée.

**Rien ne bloque aujourd'hui.** Tous les secrets sont en place, les quatre
workflows tournent.

---

## 🟠 À observer — le seul vrai point ouvert

### 1. Le premier passage réel de chaque automatisation

Tout a été vérifié à blanc, mais trois choses n'ont **jamais tourné en
conditions réelles** :

| À observer | Quand | Ce qui peut casser |
|---|---|---|
| Publication d'un post Buffer | au prochain article | l'API a accepté la mise en file, pas la publication |
| Validation du média par Instagram et TikTok | idem | la vignette peut être refusée au moment de publier |
| Enchaînement de `cote-hebdo` | jeudi | commit → déploiement Vercel → publication, jamais joué bout en bout |

Le point le plus fragile est le troisième : le workflow committe la
vignette, **attend que l'URL réponde 200**, puis publie. La vérification
remplace un délai fixe, mais l'enchaînement complet reste à voir.

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

### 4. Visuels générés par IA — bloqué par la facturation Google

La vignette déterministe fonctionne et reste le **repli garanti**. Un visuel
IA viendrait en surcouche, jamais en remplacement : quota épuisé ou refus de
modération laisseraient sinon la chaîne muette.

Clé Gemini de Julian en secret `GEMINI_API_KEY`. **Testée le 20 août :**

| Test | Résultat |
|---|---|
| Liste des modèles | ✅ HTTP 200 |
| Texte (`gemini-3.6-flash`) | ✅ répond |
| Image (`gemini-3.1-flash-image`) | ❌ HTTP 429, quota épuisé |
| Image Lite | ❌ HTTP 429 |

La clé est valide et le palier gratuit marche pour le texte. La génération
d'images est à **zéro quota**, conforme à la page tarifaire Google qui
affiche « Not available » en colonne *Free Tier* pour les quatre modèles
d'image.

**Action requise côté Julian** : activer la facturation sur le projet Google
Cloud lié à la clé. Le coût resterait de l'ordre de quelques euros par an
au rythme prévu (~3 à 5 centimes l'image, 1 à 2 images par semaine). Une
fois fait, le script d'appel est à écrire — une demi-journée.

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
| `annonce-discord` | mardi, vendredi | ✅ routé par TCG, 7 webhooks validés |
| `annonce-buffer` | mardi, vendredi | ✅ X, Instagram, TikTok |
| `cote-hebdo` | jeudi | ⏳ jamais tourné en réel |

Plus : provenance des inscriptions (`beta_submissions.source`), CTA en fin
d'article, aperçu de lien social corrigé (URL absolue + vignette 1200×630),
flux RSS, vignettes 1080×1080 par article.
