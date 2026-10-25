# Carte du dépôt : Cards-Trading (landing-page-cards-trading-main)

**But du projet**
Landing de la marketplace TCG Cards-Trading.com (éditeur Thugz Labs), avec blog, formulaire de bêta et automatisations sociales.
Le site est en ligne sur https://cards-trading.com.

**Pile technique**
- Landing : HTML statique, CSS (`public/*.css`), JS vanilla
- Blog : Astro 6 (`output: static`, adaptateur Vercel), Content Collections
- API : fonctions serverless Vercel ESM (`api/*.js`)
- Données : Supabase (table `beta_submissions`), Resend (emails et liste de diffusion) ; `@upstash/redis` est déclaré (`package.json:18`) mais importé nulle part
- Automatisations : scripts Node (`scripts/*.mjs`), GitHub Actions

**Arborescence utile**
- `public/` : landing (`index.html`, `cgu.html`, `mentions-legales.html`), CSS, `easter-eggs.js`
- `src/pages/`, `src/layouts/`, `src/components/` : blog Astro et pages `tcg/[categorie]`
- `src/content/blog/` : articles Markdown
- `src/lib/tcg.js` : libellés et accroches par TCG
- `api/` : `submit-form.js`, `keep-alive.js`, `views.js`, `social-feed.js`, `refresh-instagram-token.js`
- `scripts/` : publication, Buffer, Discord, newsletter, cotes (tests dans `scripts/lib/*.test.mjs`)
- `data/` : cotes, réseaux sociaux, visuels (JSON)
- `supabase/migrations/` : schéma SQL
- `docs/` : briefs, plans, journal des corrections
- `.github/workflows/` : crons de publication, alertes, keep-alive

**Points d'entrée**
- `public/index.html` : landing et formulaire d'inscription
- `api/submit-form.js:123` : `handler` de l'inscription
- `astro.config.mjs:6` : configuration Astro (site, sortie statique, adaptateur Vercel)
- `vercel.json` : crons (`refresh-instagram-token` mensuel, `keep-alive` quotidien), en-têtes de sécurité et de cache

**Flux principaux**
1. Inscription : `public/index.html:1904` → `POST /api/submit-form` (`api/submit-form.js:123`) → insert Supabase (`:173`) + 2 emails Resend (`:240`, `:325`)
2. Règle d'échec : `api/submit-form.js:446` renvoie 503 si la base et l'email admin échouent (jamais de faux succès)
3. Blog : `src/content/blog/*.md` → `src/pages/blog/[...slug].astro:5` (`getStaticPaths`, exclut les `draft`) → `astro build`
4. Publication : `.github/workflows/publie-articles.yml:74` (cron `:32`, 05:12 UTC) lève `draft` via `scripts/publie-articles.mjs:91`, pousse sur `main` (`:107`), puis attend le 200 en production (`:112`)
5. Keep-alive Supabase : `api/keep-alive.js:341`, appelé par le cron Vercel et par `.github/workflows/keep-alive.yml:22` (toutes les 6 h)

**Commandes**
- Installer : `npm install`
- Lancer en dev : `npm run dev` ; prévisualiser : `npm run preview`
- Construire : `npm run build` (ne compile que le blog, `public/` est copié tel quel)
- Tester : `npm test` (`node --test "scripts/**/*.test.mjs"`)

**Pièges connus**
- Supabase plan gratuit : pause après environ 7 jours d'inactivité, d'où `keep-alive` (CLAUDE.md:188)
- Cache CSS : incrémenter `landing.css?v=N` ET les `@import` (CLAUDE.md:26), cache de 7 jours (CLAUDE.md:31)
- Images `public/assets/` en `immutable` (1 an) : changer l'URL, pas seulement le fichier (CLAUDE.md:55)
- Vercel Hobby : 2 crons maximum, ne pas en ajouter un troisième (CLAUDE.md:251)
- `vercel.json` : ne jamais remettre `"public": true`, cela casse le déploiement (CLAUDE.md:255)
- Apex `cards-trading.com` redirige en 307 vers `www` : utiliser `curl -L`, aussi dans les workflows (CLAUDE.md:257)
- API Buffer changée sans préavis en août 2026 (CLAUDE.md:322) : ne pas accuser la clé
- Navigation mobile : zéro JS de scroll, ne pas y toucher sans raison (CLAUDE.md:691)
- Ne jamais committer `.env*` ; noms des variables de `.env.local.example` : `RESEND_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `NODE_ENV`
