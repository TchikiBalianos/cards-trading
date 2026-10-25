# Cards-Trading : Landing page

Landing de la marketplace TCG **Cards-Trading.com**. Éditeur : **Thugz Labs**.
Pile, flux, commandes : `docs/CARTE.md`. Histoire des correctifs : `docs/journal-des-corrections.md`.

## Quand lire quoi

Ce fichier ne garde que les règles valables pour toute tâche. Le détail est rangé : lire le fichier cité **avant** de commencer.

| Quand tu... | Lire |
|---|---|
| touches `public/` (images, logos, `width`/`height`, navigation mobile) | `.claude/rules/landing-public.md` (se charge seul) |
| touches le relais Buffer, les brouillons ou la semaine sociale | `.claude/rules/buffer-api.md` (se charge seul) |
| rédiges, programmes ou fusionnes un article (date de sortie, chiffre, prix compris) | `docs/blog-redaction.md` |
| diagnostiques la publication des articles ou l'alerte de relecture | `docs/blog-publication.md` |
| prépares les posts X, Instagram, Facebook, leurs visuels, les cartes Build in Public | `docs/posts-sociaux.md` |
| touches `/api/keep-alive`, son rapport mensuel ou la pause Supabase | `docs/supabase-keep-alive.md` |
| dépannes un déploiement Vercel (rien ne part, test d'attente en échec) | `docs/deploiement-vercel.md` |
| mesures un rendu, le balisage FAQ ou le trafic Vercel Analytics | `docs/verification-mesures.md` |
| touches `annonce-discord`, `cote-hebdo`, `publie-cote`, `alerte-automatisations` | `docs/discord-cotes-alertes.md` |

## Architecture : le piège principal

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
Cache-busting manuel : `landing.css?v=N` dans `index.html` : **incrémenter N
à chaque modification CSS**, sinon Vercel/le navigateur sert l'ancienne version.

⚠️ **Le numéro de version doit être répercuté sur les `@import`**, pas
seulement sur `landing.css`. Vercel sert les CSS de `public/` avec
`Cache-Control: public, max-age=604800` : **7 jours**. Tant que les
`@import` pointaient vers des URL nues (`url(comparatif.css)`), bumper
`landing.css?v=N` rechargeait le fichier parent mais les 9 enfants
restaient servis depuis le cache : toute correction faite dans
`comparatif.css`, `hero.css`, `features.css`… était invisible une semaine
durant pour un visiteur déjà venu. Découvert le 19 août 2026, après avoir
constaté en production une colonne à l'ancienne largeur alors que le
fichier servi par `curl` était bien le nouveau.

Les deux endroits doivent donc rester synchronisés sur le même N :

```bash
# depuis public/ : remplacer 17 par le nouveau numéro
sed -i -E 's|\.css\?v=[0-9]+\)|.css?v=17)|' landing.css
sed -i -E 's|landing\.css\?v=[0-9]+|landing.css?v=17|' index.html
grep -c "v=17" landing.css   # attendu : 9
```

Vérification : `curl -sI "https://cards-trading.com/comparatif.css"` doit
répondre, et la valeur mesurée dans le navigateur doit correspondre au
fichier, sinon c'est du cache, pas un bug de CSS.

### Remplacer une image : changer l'URL, pas seulement le fichier

Les images de `public/assets/` sont servies en
`Cache-Control: public, max-age=31536000, immutable` : **un an, sans
revalidation**. `immutable` dit explicitement au navigateur de ne jamais
revérifier : réécrire le fichier sous le même nom ne touchera donc
personne l'ayant déjà chargé.

Toute image remplacée doit changer d'URL, par un suffixe dans le `src` :

```html
<img src="assets/img/logo-social-discord.png?v=2" ... />
```

C'est plus strict que pour le CSS (7 jours, revalidable). Constaté le
19 août 2026 en remplaçant le logo Discord quinze minutes après l'avoir
déployé.

## Chaîne d'inscription : à ne jamais casser

`public/index.html` (formulaire) → `POST /api/submit-form` → **Supabase** (table
`beta_submissions`) **+ 2 emails Resend** (notification admin vers
`contact@cards-trading.com`, confirmation vers l'inscrit).

### Règle absolue
Un lead est retenu si **la base OU l'email admin** a réussi. Si les deux
échouent, l'API renvoie **503** : jamais un faux « Inscription réussie ».

**Pourquoi** : entre le 13 mai et le 30 juillet 2026, un `return 200` inconditionnel
a masqué une base en pause. ~11 semaines d'inscriptions perdues, sans aucun signal.
Ne jamais réintroduire un chemin où un échec de persistance passe en succès.

### Signalement
- Base HS → préfixe `[BASE HS] ` dans le sujet de l'email admin + encart d'alerte
- `/api/keep-alive` échoue → email d'alerte automatique sur `contact@`

## Supabase : danger permanent

Projet `frbwmzgaqmylilzciptg` (eu-west-1), **plan gratuit** : **mis en pause après ~7 jours d'inactivité**
(hostname muet, `ENOTFOUND`, écritures en échec ; données intactes, bouton *Resume project*).
`/api/keep-alive` l'empêche, appelé volontairement par **deux planificateurs redondants** : le cron Vercel
(1×/jour, « best effort », logs Hobby limités à 1 h) et GitHub Actions `keep-alive.yml` (toutes les 6 h).

- Le ping appelle la **RPC `beta_stats()`**, pas un `SELECT` sur `beta_submissions` : RLS le filtre pour la
  clé anon (INSERT anonyme autorisé, SELECT réservé aux authentifiés), aucune activité n'est marquée.
- GitHub désactive les workflows planifiés d'un repo **public** après 60 jours sans commit : les réactiver.
- Appelé **plusieurs fois par jour** : tout ce qu'on y greffe doit être idempotent (rapport mensuel avec
  `Idempotency-Key`, tests) : `docs/supabase-keep-alive.md`.

## Vercel : contraintes du plan Hobby

- **2 cron jobs maximum**, déclenchés **au plus une fois par jour**.
  Les deux sont pris : `keep-alive` (quotidien) et `refresh-instagram-token`
  (mensuel). Pour ajouter une tâche périodique, **greffer sur un cron existant**
  plutôt qu'en créer un troisième.
- `vercel.json` : la propriété `public` a été **retirée du schéma Vercel**.
  La remettre casse le déploiement en ~1 seconde, avant tout build.
- Le domaine apex redirige en 307 vers `www.` : utiliser `curl -L`.
- Vercel consomme `s-maxage` et `stale-while-revalidate` et les retire de la
  réponse envoyée au navigateur : voir seulement `Cache-Control: public` est normal.
- ⚠️ **`curl -L` vaut AUSSI dans les workflows** : un test d'attente sans `-L` reçoit 307, n'atteint jamais 200
  et échoue à son timeout. Reproduire **exactement** la commande qui échoue, options comprises, avant de théoriser.
- ⚠️ **Le déploiement sur push peut s'arrêter sans aucune erreur** (l'app GitHub de Vercel attend une validation
  de permissions, action humaine) : `gh api repos/<owner>/<repo>/commits/<sha>/status` sans AUCUN statut `Vercel`
  sur plusieurs commits désigne ce blocage. Récits, déploiement manuel : `docs/deploiement-vercel.md`.

## Vérification : non négociable

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

Mesures en navigateur (headless sans scroll ni animations, `.reveal-h2` décalés de 32px, `scrollWidth` trompeur,
redimensionner la fenêtre et jamais le conteneur) et balisage FAQ (`node scripts/verifie-faq.mjs` doit renvoyer 0) :
lire `docs/verification-mesures.md` avant de conclure. Le rendu animé reste à valider sur un vrai téléphone.

## Ne jamais faire

- Committer une clé (`.env*` est ignoré : vérifier avant tout `git add -A`)
- Réintroduire `"public": true` dans `vercel.json`
- Supprimer des lignes de `beta_submissions` sans demande explicite
- Annoncer un correctif sans l'avoir vérifié en production
- Mettre dans ce dépôt public un chiffre de trafic ou d'inscrits
- Inventer un chiffre ou un prix dans un article, ni modifier la constante `REF` de `scripts/prochain-article.mjs`
- Publier un article depuis un poste, ou pousser sur `main` depuis une tâche de rédaction : `draft: true` sur
  une branche `blog/*`, pull request (un commit sur la branche ne fusionne rien), puis `publie-articles.yml`
- Lancer `annonce-buffer.yml` sans `-f brouillon=true` pour un essai, ou tenir un `createPost` pour réussi
  sans `__typename === 'PostActionSuccess'`
- Réessayer automatiquement un envoi Discord (un 504 n'est pas un échec certain) ou cliquer « Re-run » sur
  un `cote-hebdo` raté
- Toucher à la navigation mobile (zéro JS de scroll) sans raison forte

## Méthode Triade

Sonnet construit, Haiku explore, Opus valide ; l'Aiguilleur (mod) tranche le reste en code.

### Délégation : le contexte principal reste léger
- S'orienter, comprendre où est quoi : agent `eclaireur` (ou Explore). Lis d'abord `docs/CARTE.md` s'il existe.
- Trouver toutes les occurrences d'un symbole : agent `traqueur`.
- Tests, lint, build, toute commande bavarde : agent `auditeur`. Jamais de journal brut ici.
- Lis toi-même seulement les fichiers que tu vas modifier, par plages utiles.

### Architecte (Opus) : trois moments, pas plus
1. Avant de verrouiller un plan qui touche plus de 3 fichiers ou un choix d'architecture : `architecte` avec le plan.
2. Même erreur deux fois : stop, puis `architecte` avec l'objectif, l'erreur exacte et les essais faits.
3. Avant d'annoncer « terminé » : `/triade:revue`.

### Boucle bornée
- Une tâche = un contrat : livrable, contraintes, hors périmètre, critères d'acceptation (`/triade:contrat`).
- 4 tentatives au plus sur un même problème, puis arrêt et point de situation.

### Mémoire du projet
- Après une erreur corrigée, une correction de ma part ou une convention découverte : `/triade:lecon` (une ligne dans `.claude/rules/lecons.md`).
- Vérifie ton travail par une preuve (test, commande, rendu) avant de l'annoncer fait.

### Contexte
- Une tâche par conversation. Entre deux tâches : `/triade:passation` puis `/clear`.
- Réponses courtes : pas de récapitulatif de ce que tu viens de faire, sauf demande.
