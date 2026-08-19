# Reste à faire — Cards-Trading

État au **19 août 2026**. Les règles durables vivent dans `CLAUDE.md` ;
ce fichier ne liste que ce qui est **ouvert**. Retirer une ligne dès qu'elle
est traitée.

---

## 🔴 Urgent — action de Julian requise

### 1. Secret GitHub `SUPABASE_APP_ANON_KEY` absent

**La base Supabase de la marketplace n'est actuellement pingée par personne.**

Le workflow `.github/workflows/keep-alive.yml` a deux jobs. Vérifié le
19 août :

| Job | État |
|---|---|
| `Base landing (via /api/keep-alive)` | ✅ success |
| `Base marketplace (RPC ping directe)` | ❌ failure |

`gh api repos/TchikiBalianos/cards-trading/actions/secrets` renvoie une
liste **vide** : le secret n'a jamais été créé. Le job échoue donc à chaque
exécution depuis le 18 août 18:15, et c'est **volontaire** — il échoue
bruyamment plutôt que de faire semblant de pinger.

**Le risque est exactement celui de l'incident des 11 semaines** : projet
Supabase en pause après ~7 jours d'inactivité, écritures qui échouent en
silence.

> ⚠️ **Le croisement qui piège** : la clé vient du projet Supabase
> **`cards-trading-app`**, mais le secret doit être créé dans le dépôt
> GitHub **`cards-trading`** — celui qui héberge le workflow. Les secrets
> Actions sont portés par le dépôt, jamais partagés entre dépôts, et il
> n'y a pas de secret d'organisation (compte personnel).
>
> Le poser dans `cards-trading-app` ne sert à rien : le workflow ne s'y
> trouve pas. Erreur commise le 19 août 2026.
>
> Et c'est bien `cards-trading` qu'il faut, malgré son nom : ce dépôt est
> **public**, donc ses minutes Actions sont illimitées. `cards-trading-app`
> est privé et consommerait le quota.

À faire :
1. Dashboard Supabase → projet **`cards-trading-app`**
   (`uxewpdnkjsdfizaoerpo`) → *Project Settings* → *API Keys* → copier la
   clé **anon / publishable**.
2. GitHub → dépôt **`cards-trading`** (pas `-app`) → *Settings* →
   *Secrets and variables* → *Actions* → *New repository secret*.
   URL directe : `github.com/TchikiBalianos/cards-trading/settings/secrets/actions`
3. Nom exact : `SUPABASE_APP_ANON_KEY`. Coller la clé.
4. Relancer le workflow et vérifier que les deux jobs passent :

```bash
gh workflow run keep-alive.yml && sleep 45 && gh run list --workflow=keep-alive.yml --limit 1
```

> Ne jamais coller cette clé dans le code ni dans un commit.

---

## 🟠 À valider — hors de portée de l'environnement de test

### 2. Défilement et animations sur un vrai téléphone

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

### 5. Webhook de bounce Resend

Optionnel. Permettrait de détecter les adresses invalides côté serveur
plutôt que de découvrir les rebonds a posteriori dans le dashboard. Le
validateur Damerau-Levenshtein côté formulaire couvre déjà les fautes de
frappe les plus courantes.

### 6. Revue de direction artistique — traitée

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
