# Cards-Trading — Landing page

Landing de la marketplace TCG **Cards-Trading.com**. Éditeur : **Thugz Labs**.

---

## Architecture — le piège principal

Le projet mélange **deux mondes**, et s'y tromper fait perdre du temps :

| Zone | Techno | Fichiers |
|---|---|---|
| **Landing** | HTML statique brut | `public/index.html`, `public/cgu.html`, `public/mentions-legales.html` |
| **Blog** | Astro 6 + Content Collections | `src/pages/blog/`, `src/layouts/BlogLayout.astro` |
| **API** | Fonctions serverless Vercel | `api/*.js` (ESM, `export default handler`) |

**Conséquence** : toute solution « composant React/Astro » ne couvre que le blog.
Pour qu'une chose s'applique partout (analytics, script global), il faut une
balise `<script>` dupliquée dans les 3 HTML **et** dans `BlogLayout.astro`.

Le build (`npm run build` → `astro build`) ne compile QUE le blog ; `public/`
est copié tel quel. Un build vert ne prouve donc rien sur la landing.

### CSS
`public/landing.css` importe les autres via `@import` (dont `layout.css`).
Cache-busting manuel : `landing.css?v=N` dans `index.html` — **incrémenter N
à chaque modification CSS**, sinon Vercel/le navigateur sert l'ancienne version.

### Effet de bord : attributs `width`/`height` sur les `<img>`

Ces attributs ne sont pas inertes. Le navigateur les applique **comme du CSS
de spécificité 0** (« presentational hints »). Partout où une règle fixe
seulement la largeur — `.logo img`, `.footer-logo`, les cartes de slider —
l'attribut `height` reste actif et **écrase le ratio**.

En août 2026, les avoir ajoutés sur 31 images a écrasé le logo (287×68
affiché en 90×68, soit 69 % de déformation), `goku.png` et les visuels de
slider. Invisible en desktop large, flagrant sur téléphone.

Le garde-fou est en fin de `public/landing.css` :

```css
img { height: auto; }
```

Spécificité (0,0,1) : bat l'attribut, cède à toute règle portée par une
classe — les hauteurs voulues (`features.css`, `hero.css`) sont préservées.
Placée **après les `@import`**, donc gagnante sur les égalités.

⚠️ Ne pas supprimer les attributs pour autant : ils servent à déduire
`aspect-ratio` et à réserver la place avant chargement (gain CLS).
`height: auto` est justement la moitié prévue de ce mécanisme, pas son ennemi.

**Contrôle après toute modification touchant les images** — compare le ratio
affiché au ratio naturel, en excluant `object-fit: contain/cover` qui met le
contenu en boîte à lettres sans le déformer (sinon ~7 faux positifs) :

```js
[...document.images].filter(i => {
  const cs = getComputedStyle(i), r = i.getBoundingClientRect();
  if (!i.naturalWidth || cs.objectFit === 'contain' || cs.objectFit === 'cover') return false;
  return Math.abs(r.width / r.height - i.naturalWidth / i.naturalHeight) > 0.05 * (i.naturalWidth / i.naturalHeight);
}).map(i => i.src.split('/').pop())
```

Attendu : `[]`.

---

## Chaîne d'inscription — à ne jamais casser

`public/index.html` (formulaire) → `POST /api/submit-form` → **Supabase** (table
`beta_submissions`) **+ 2 emails Resend** (notification admin vers
`contact@cards-trading.com`, confirmation vers l'inscrit).

### Règle absolue
Un lead est retenu si **la base OU l'email admin** a réussi. Si les deux
échouent, l'API renvoie **503** — jamais un faux « Inscription réussie ».

**Pourquoi** : entre le 13 mai et le 30 juillet 2026, un `return 200` inconditionnel
a masqué une base en pause. ~11 semaines d'inscriptions perdues, sans aucun signal.
Ne jamais réintroduire un chemin où un échec de persistance passe en succès.

### Signalement
- Base HS → préfixe `[BASE HS] ` dans le sujet de l'email admin + encart d'alerte
- `/api/keep-alive` échoue → email d'alerte automatique sur `contact@`

---

## Supabase — danger permanent

Projet `frbwmzgaqmylilzciptg` (région eu-west-1), **plan gratuit**.

> Le plan gratuit **met le projet en pause après ~7 jours d'inactivité**.
> En pause, le hostname ne résout plus (`ENOTFOUND`) et toutes les écritures
> échouent. Les données restent intactes et le projet est restaurable depuis
> le dashboard (bouton *Resume project*).

`/api/keep-alive` existe uniquement pour empêcher ça. Il est appelé par
**deux planificateurs redondants**, et c'est volontaire :

| Source | Fréquence | Historique consultable |
|---|---|---|
| Cron Vercel (`vercel.json`) | 1×/jour, 04:00 UTC | non — logs Hobby limités à 1 h |
| GitHub Actions (`.github/workflows/keep-alive.yml`) | toutes les 6 h | oui, onglet Actions |

**Pourquoi deux** : en août 2026, Supabase a averti d'une mise en pause alors
que le cron Vercel était actif. Les crons du plan Hobby sont « best effort »
(fenêtre d'1 h, aucune garantie) et la rétention de logs d'1 h empêche même de
vérifier a posteriori s'ils sont partis. GitHub Actions donne la fréquence ET
la traçabilité. Le repo étant public, les minutes sont illimitées.

⚠️ Le ping doit appeler la **RPC `beta_stats()`**, pas un `SELECT` sur
`beta_submissions` : RLS filtre intégralement le SELECT pour la clé anon, ce
qui ne renvoie aucune ligne et ne suffisait pas à marquer l'activité.

⚠️ GitHub désactive les workflows planifiés d'un repo **public** après 60 jours
sans commit. Le rythme de publication du blog suffit à l'éviter, mais en cas de
longue pause du projet, penser à réactiver le workflow.

RLS : INSERT anonyme autorisé, SELECT réservé aux authentifiés. La clé anon
ne peut donc pas lire la table — utiliser la RPC `beta_stats()` pour les agrégats.

---

## Vercel — contraintes du plan Hobby

- **2 cron jobs maximum**, déclenchés **au plus une fois par jour**.
  Les deux sont pris : `keep-alive` (quotidien) et `refresh-instagram-token`
  (mensuel). Pour ajouter une tâche périodique, **greffer sur un cron existant**
  plutôt qu'en créer un troisième.
- `vercel.json` : la propriété `public` a été **retirée du schéma Vercel**.
  La remettre casse le déploiement en ~1 seconde, avant tout build.
- Le domaine apex redirige en 307 vers `www.` — utiliser `curl -L`.
- Vercel consomme `s-maxage` et `stale-while-revalidate` et les retire de la
  réponse envoyée au navigateur : voir seulement `Cache-Control: public` est normal.

---

## Vérification — non négociable

Ce projet a une histoire de correctifs annoncés sans preuve. **Toujours vérifier
en production avant d'affirmer que c'est réglé** :

```bash
# Le déploiement a-t-il vraiment réussi ? (un push ne suffit pas)
gh api repos/TchikiBalianos/cards-trading/deployments --jq '.[0].ref[0:7]'
gh api repos/TchikiBalianos/cards-trading/deployments/<id>/statuses --jq '.[0].state'

# La chaîne d'inscription fonctionne-t-elle ?
curl -sL -X POST https://cards-trading.com/api/submit-form \
  -H "Content-Type: application/json" \
  -d '{"nom":"TEST","prenom":"TEST","email":"test@example.com","rgpd":true}'
# Attendu : {"success":true,...,"dbSaved":true}
```

### Limites de l'environnement de test
- Le navigateur headless **ne défile pas** (`window.scrollTo` sans effet) et ne
  compose pas de frames → **transitions et animations CSS ne s'exécutent pas**.
  Ne jamais conclure « le scroll fonctionne » depuis ce navigateur ; mesurer
  les valeurs CIBLES en neutralisant les transitions, et dire honnêtement que
  le rendu animé reste à valider sur un vrai téléphone.
- Le Chrome de l'utilisateur a des extensions qui **bloquent Vercel Analytics**
  (`transferSize: 0`). Ses propres visites ne sont jamais comptées.

---

## Navigation mobile (v6)

Historique lourd : 8 tentatives avant que ça tienne. Le principe actuel —
**ne pas y toucher sans raison forte** :

- **Zéro JS de scroll.** Le navigateur gère `<a href="#section">` nativement,
  avec `scroll-behavior: smooth` + `scroll-margin-top` en CSS.
- **Transitions CSS, pas animations.** Les `animation` + `forwards` + reflow
  trick étaient la cause des « ça marche 3 fois puis ça s'arrête ».
- `closeMenuDeferred(80ms)` : le navigateur traite le `href` avant toute
  modification du DOM. Listener `hashchange` en filet de sécurité.
- `pointer-events: none` sur le panneau fermé, `touch-action: manipulation`.

Le skip-link est en `position: fixed` (pas `absolute`) : le `<body>` démarre à
y=60px à cause du margin collapsing de `.hero`, ce qui rendait le lien visible
en permanence par-dessus le logo.

---

## Ne jamais faire

- Committer une clé (`.env*` est ignoré — vérifier avant tout `git add -A`)
- Réintroduire `"public": true` dans `vercel.json`
- Supprimer des lignes de `beta_submissions` sans demande explicite
- Annoncer un correctif sans l'avoir vérifié en production

---

## Blog — calendrier éditorial

Rotation **déterministe**, calculée par `scripts/prochain-article.mjs` :

```bash
node scripts/prochain-article.mjs 8   # les 8 prochaines semaines
```

- **Mardi** — article obligatoire, alternant **Pokémon / One Piece**
  → 2 Pokémon et 2 One Piece par mois
- **Vendredi** — article optionnel, rotation sur Magic, Yu-Gi-Oh!, Lorcana,
  Dragon Ball, Star Wars

> La constante `REF` du script (lundi 27 juillet 2026) fixe l'origine de
> l'alternance. **Ne jamais la modifier** : tout le calendrier, passé comme
> futur, se décalerait.

Deux tâches planifiées rédigent ces articles automatiquement
(`blog-cards-trading-article-hebdo` et `-secondaire`). Elles écrivent
toujours `draft: true` et poussent sur une **branche dédiée**, jamais sur
`main` — la relecture et la fusion restent manuelles.

Le schéma du frontmatter (`src/content.config.ts`) est strict : une
catégorie hors de l'énumération casse le build.
