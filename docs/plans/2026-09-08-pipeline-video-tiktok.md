# Pipeline vidéo TikTok, plan d'implémentation

> **Pour les agents :** SOUS-SKILL REQUISE : utiliser superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans pour dérouler ce plan tâche par tâche. Les étapes sont en cases à cocher (`- [ ]`).

**But :** publier sur TikTok un clip animé de 7 à 10 s généré depuis la vignette de l'article, au lieu d'une image fixe, sans jamais bloquer la chaîne d'annonce si la génération échoue.

**Architecture :** la vidéo est produite au moment de la PUBLICATION de l'article (dans `publie-articles.yml`, juste après les vignettes), committée dans `public/assets/social/<slug>.mp4` et déployée par Vercel. Sept heures plus tard, `annonce-buffer.mjs` vérifie que le MP4 répond en production et l'envoie à TikTok ; s'il manque ou ne répond pas, l'image carrée actuelle part à sa place. Aucune attente de déploiement n'est ajoutée dans le workflow d'annonce.

**Tech :** Node 20 ESM, GitHub Actions, API Seedance (ByteDance) en image-to-video via fal.ai, API GraphQL Buffer, `node --test` (runner intégré, aucune dépendance ajoutée).

**Spec :** `docs/plans/2026-09-08-strategie-reseaux-seo-design.md`

## Contraintes globales

- Un échec ne passe JAMAIS pour un succès. Historique : un `return 200` inconditionnel a masqué 11 semaines d'inscriptions perdues, et `createPost` de Buffer renvoie un refus en HTTP 200 valide (union `PostActionPayload`, contrôle `__typename` obligatoire).
- Vérification en production avant toute affirmation. Un build vert ne prouve rien sur la landing.
- Le domaine apex répond 307 vers `www.` : tout `curl` de contrôle utilise `-L`, y compris dans les workflows. Un test sans `-L` échoue à son timeout quelle qu'en soit la durée.
- Aucun tiret cadratin dans les textes rédigés (convention typographique française).
- Vercel Hobby : 2 crons déjà pris. Aucune tâche périodique nouvelle, on se greffe sur les workflows GitHub Actions existants.
- Les images de `public/assets/` sont servies en `immutable` pour un an : un fichier remplacé doit changer d'URL. Ne s'applique pas ici (un slug donne un MP4 unique), mais toute reprise de clip existant devra changer de nom.

## Corrections de périmètre constatées en lisant le code

Trois éléments du design étaient déjà en place. Ils sortent du périmètre :

1. **L'habillage de marque des vignettes existe déjà** (`scripts/vignettes-sociales.mjs` pose le mot-clé « Cards-Trading », le logo composité, la pastille de catégorie et `cards-trading.com` en pied). Rien à faire.
2. **Le CTA Instagram existe déjà** (`texteInstagram`, ligne 194 : « lien du site en bio 🔗 »). Seul TikTok en manque.
3. Le volet 1 se réduit donc à la tâche 1 ci-dessous, qui est une ligne.

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `scripts/annonce-buffer.mjs` (modifier) | CTA TikTok, choix vidéo/image, envoi Buffer |
| `scripts/lib/video-seedance.mjs` (créer) | Appel Seedance, plafond de dépense, écriture du MP4 |
| `scripts/lib/video-seedance.test.mjs` (créer) | Tests du plafond et du refus explicite |
| `scripts/genere-video.mjs` (créer) | Entrée CLI pour générer/valider un clip à la main |
| `.github/etat-video.json` (créer) | Dépense du mois en cours, committée |
| `.github/workflows/publie-articles.yml` (modifier) | Génération du clip après les vignettes |
| `package.json` (modifier) | Script `test` |

---

### Tâche 1 : CTA « lien en bio » dans la légende TikTok

**Fichiers :**
- Modifier : `scripts/annonce-buffer.mjs:203-209`
- Modifier : `package.json` (script `test`)
- Test : `scripts/lib/legendes.test.mjs`

**Interfaces :**
- Consomme : rien.
- Produit : `texteTikTok(fm)` contient désormais la chaîne `lien du site en bio`.

- [ ] **Étape 1 : exporter `texteTikTok` pour pouvoir le tester**

Le script exécute du code au chargement (ligne 253 et suivantes), donc un
`import` depuis un test déclencherait un appel réseau. Ajouter l'export ne
suffit pas : il faut aussi garder l'exécution derrière une garde.

Dans `scripts/annonce-buffer.mjs`, remplacer `function texteTikTok(fm) {` par :

```js
export function texteTikTok(fm) {
```

Puis, juste avant le bloc `/* ── Exécution ─── */` (ligne 251), ajouter :

```js
import { pathToFileURL } from 'node:url';

const LANCE_DIRECTEMENT =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
```

et englober tout le bloc d'exécution (de `const etat = chargerEtat();` jusqu'à
la fin du fichier) dans :

```js
if (LANCE_DIRECTEMENT) {
  // ... corps existant inchangé ...
}
```

- [ ] **Étape 2 : écrire le test qui échoue**

Créer `scripts/lib/legendes.test.mjs` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { texteTikTok } from '../annonce-buffer.mjs';

const ARTICLE = {
  title: 'Storm Emeralda : Mega-Rayquaza ex',
  description: 'Le set M6 fait exploser les compteurs.',
  category: 'pokemon',
};

test('la legende TikTok porte un appel a rejoindre le site', () => {
  assert.match(texteTikTok(ARTICLE), /lien du site en bio/);
});

test('la legende TikTok reste sous la limite de 2200 caracteres', () => {
  const long = { ...ARTICLE, description: 'x'.repeat(4000) };
  assert.ok(texteTikTok(long).length <= 2200);
});
```

- [ ] **Étape 3 : ajouter le script de test et lancer**

Dans `package.json`, ajouter à `scripts` :

```json
"test": "node --test scripts/"
```

Lancer : `npm test`
Attendu : ÉCHEC sur le premier test, `lien du site en bio` absent.

- [ ] **Étape 4 : ajouter le CTA**

Dans `texteTikTok`, remplacer la construction du suffixe :

```js
export function texteTikTok(fm) {
  const suffixe =
    `\n\nL'article complet est sur notre blog, lien du site en bio 🔗\n\n` +
    `${SIGNATURE}\n\n${motsCles(fm.category, 4)}`;
  const reste = 2200 - suffixe.length;
  let t = fm.description || fm.title;
  if (t.length > reste) t = t.slice(0, reste - 1).trimEnd() + '…';
  return `${t}${suffixe}`;
}
```

- [ ] **Étape 5 : relancer les tests**

Lancer : `npm test`
Attendu : les deux tests passent.

- [ ] **Étape 6 : vérifier que le script tourne toujours en direct**

Lancer : `node scripts/annonce-buffer.mjs --dry-run`
Attendu : la sortie affiche les cinq blocs `[dry-run]` comme avant, et la
légende TikTok contient la nouvelle ligne. Cette étape prouve que la garde
`LANCE_DIRECTEMENT` n'a pas cassé l'exécution normale.

- [ ] **Étape 7 : committer**

```bash
git add scripts/annonce-buffer.mjs scripts/lib/legendes.test.mjs package.json
git commit -m "feat(buffer): appel a l action dans la legende TikTok"
```

---

### Tâche 2 : module de génération du clip Seedance

**Fichiers :**
- Créer : `scripts/lib/video-seedance.mjs`
- Créer : `scripts/lib/video-seedance.test.mjs`
- Créer : `.github/etat-video.json`

**Interfaces :**
- Consomme : rien.
- Produit :
  - `export async function genereClip({ imagePath, slug, titre, sortie })` → `{ chemin, coutUsd, secondes }`, lève une `Error` explicite en cas d'échec.
  - `export function depenseDuMois(etat, maintenant)` → nombre.
  - `export function plafondAtteint(etat, maintenant, plafondUsd)` → booléen.
  - `export const PLAFOND_USD_DEFAUT = 5;`

- [ ] **Étape 1 : créer l'état de dépense**

Créer `.github/etat-video.json` :

```json
{
  "_lisezmoi": "Depense mensuelle de generation video Seedance, en dollars. Ecrit par scripts/lib/video-seedance.mjs. Le plafond protege d une boucle qui appellerait l API en rafale.",
  "depenses": []
}
```

- [ ] **Étape 2 : écrire les tests du plafond**

Créer `scripts/lib/video-seedance.test.mjs` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { depenseDuMois, plafondAtteint } from './video-seedance.mjs';

const MAINTENANT = new Date('2026-09-15T10:00:00Z');

test('ne compte que les depenses du mois en cours', () => {
  const etat = { depenses: [
    { date: '2026-09-02T08:00:00Z', usd: 0.6 },
    { date: '2026-09-14T08:00:00Z', usd: 0.6 },
    { date: '2026-08-30T08:00:00Z', usd: 4.0 },
  ] };
  assert.equal(Number(depenseDuMois(etat, MAINTENANT).toFixed(2)), 1.2);
});

test('un etat vide vaut zero', () => {
  assert.equal(depenseDuMois({ depenses: [] }, MAINTENANT), 0);
});

test('le plafond bloque au-dela du seuil', () => {
  const etat = { depenses: [{ date: '2026-09-10T08:00:00Z', usd: 5 }] };
  assert.equal(plafondAtteint(etat, MAINTENANT, 5), true);
  assert.equal(plafondAtteint(etat, MAINTENANT, 10), false);
});
```

- [ ] **Étape 3 : lancer le test pour le voir échouer**

Lancer : `npm test`
Attendu : ÉCHEC, `video-seedance.mjs` n'existe pas.

- [ ] **Étape 4 : écrire le module**

Créer `scripts/lib/video-seedance.mjs` :

```js
/**
 * Anime la vignette carrée d'un article en clip court, via Seedance
 * (ByteDance) en IMAGE-TO-VIDEO.
 *
 * Image-to-video et non text-to-video : la vignette porte le visuel réel de
 * la carte et l'habillage de marque. Un text-to-video repartirait de zéro et
 * inventerait un visuel qui ne correspond à aucun produit réel.
 *
 * Le clip est un CONFORT, jamais une dépendance : tout échec doit remonter
 * en exception explicite pour que l'appelant reparte sur l'image fixe.
 * Jamais de succès silencieux, jamais de MP4 tronqué écrit sur le disque.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const API = 'https://fal.run/fal-ai/bytedance/seedance/v1/pro/image-to-video';
export const PLAFOND_USD_DEFAUT = 5;
const SECONDES = 8;
/* Tarif observé en septembre 2026 : ~0,06 $/s en 720p. Sert au plafond,
   pas à la facturation réelle, qui reste celle du fournisseur. */
const COUT_PAR_SECONDE = 0.06;

export function depenseDuMois(etat, maintenant) {
  const mois = maintenant.toISOString().slice(0, 7);
  return (etat.depenses || [])
    .filter((d) => String(d.date).slice(0, 7) === mois)
    .reduce((total, d) => total + Number(d.usd || 0), 0);
}

export function plafondAtteint(etat, maintenant, plafondUsd) {
  return depenseDuMois(etat, maintenant) >= plafondUsd;
}

export function chargerEtat(chemin) {
  if (!existsSync(chemin)) return { depenses: [] };
  try {
    const e = JSON.parse(readFileSync(chemin, 'utf8'));
    return Array.isArray(e.depenses) ? e : { ...e, depenses: [] };
  } catch {
    return { depenses: [] };
  }
}

/**
 * Génère le clip et l'écrit sur le disque.
 * Lève une Error explicite si la clé manque, si le plafond est atteint,
 * si l'API refuse, ou si le fichier reçu est trop petit pour être une vidéo.
 */
export async function genereClip({ imageUrl, slug, titre, sortie, etat, maintenant = new Date(), plafondUsd = PLAFOND_USD_DEFAUT }) {
  const cle = process.env.FAL_KEY;
  if (!cle) throw new Error('FAL_KEY absente');

  if (plafondAtteint(etat, maintenant, plafondUsd)) {
    throw new Error(
      `plafond mensuel atteint (${depenseDuMois(etat, maintenant).toFixed(2)} $ sur ${plafondUsd} $)`
    );
  }

  const invite =
    'slow cinematic camera push in, subtle parallax, soft light rays drifting, ' +
    'gentle particles, the artwork stays sharp and unchanged, no new text, no new logo';

  const rep = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Key ${cle}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: imageUrl,
      prompt: invite,
      duration: SECONDES,
      resolution: '720p',
    }),
    signal: AbortSignal.timeout(300000),
  });

  const j = await rep.json().catch(() => null);
  if (!rep.ok || !j) throw new Error(`Seedance a répondu ${rep.status} — ${JSON.stringify(j)}`);

  const urlVideo = j?.video?.url;
  if (!urlVideo) throw new Error(`réponse sans vidéo — ${JSON.stringify(j).slice(0, 300)}`);

  const bin = await fetch(urlVideo, { signal: AbortSignal.timeout(120000) });
  if (!bin.ok) throw new Error(`téléchargement du clip : HTTP ${bin.status}`);
  const buf = Buffer.from(await bin.arrayBuffer());

  /* Une réponse minuscule est une page d'erreur, pas une vidéo. Même
     garde-fou que pour les fonds de vignette. */
  if (buf.length < 50000) throw new Error(`clip de ${buf.length} octets, trop petit pour être une vidéo`);

  writeFileSync(sortie, buf);
  return { chemin: sortie, coutUsd: SECONDES * COUT_PAR_SECONDE, secondes: SECONDES };
}
```

- [ ] **Étape 5 : relancer les tests**

Lancer : `npm test`
Attendu : les trois tests de plafond passent, plus ceux de la tâche 1.

- [ ] **Étape 6 : committer**

```bash
git add scripts/lib/video-seedance.mjs scripts/lib/video-seedance.test.mjs .github/etat-video.json
git commit -m "feat(video): module de generation de clip Seedance avec plafond mensuel"
```

---

### Tâche 3 : entrée CLI et premier clip validé à la main

**Fichiers :**
- Créer : `scripts/genere-video.mjs`

**Interfaces :**
- Consomme : `genereClip`, `chargerEtat` de `scripts/lib/video-seedance.mjs`.
- Produit : `node scripts/genere-video.mjs --slug=<slug> [--dry-run]`.

- [ ] **Étape 1 : écrire le script CLI**

Créer `scripts/genere-video.mjs` :

```js
#!/usr/bin/env node
/**
 * Génère le clip TikTok d'un article.
 *
 *   node scripts/genere-video.mjs --slug=mon-article
 *   node scripts/genere-video.mjs --slug=mon-article --dry-run
 *
 * Variable requise : FAL_KEY
 *
 * Sortie : public/assets/social/<slug>.mp4, committé puis servi par Vercel.
 * L'absence de clip n'est pas une erreur pour la suite de la chaîne :
 * `annonce-buffer.mjs` repart sur l'image fixe.
 */

import { writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { genereClip, chargerEtat, depenseDuMois } from './lib/video-seedance.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = join(RACINE, 'public', 'assets', 'social');
const ETAT = join(RACINE, '.github', 'etat-video.json');
const SITE = 'https://cards-trading.com';

const slug = (process.argv.find((a) => a.startsWith('--slug=')) || '').split('=')[1];
const SEC = process.argv.includes('--dry-run');

if (!slug) {
  console.error('::error::--slug=<slug> requis');
  process.exit(1);
}

const vignette = join(SORTIE, `${slug}.png`);
if (!existsSync(vignette)) {
  console.error(`::error::vignette absente : ${vignette}`);
  console.error('Lancer d abord : node scripts/vignettes-sociales.mjs');
  process.exit(1);
}

const etat = chargerEtat(ETAT);
const maintenant = new Date();

if (SEC) {
  console.log(`[dry-run] clip de ${slug}`);
  console.log(`[dry-run] image source : ${SITE}/assets/social/${slug}.png`);
  console.log(`[dry-run] sortie : public/assets/social/${slug}.mp4`);
  console.log(`[dry-run] depense du mois : ${depenseDuMois(etat, maintenant).toFixed(2)} $`);
  process.exit(0);
}

try {
  const r = await genereClip({
    imageUrl: `${SITE}/assets/social/${slug}.png`,
    slug,
    sortie: join(SORTIE, `${slug}.mp4`),
    etat,
    maintenant,
  });
  etat.depenses.push({ date: maintenant.toISOString(), slug, usd: r.coutUsd });
  writeFileSync(ETAT, JSON.stringify(etat, null, 2) + '\n');
  console.log(`✅ ${slug}.mp4 (${r.secondes} s, ~${r.coutUsd.toFixed(2)} $)`);
} catch (e) {
  /* Sortie en code 1 pour que le workflow le voie, mais l'étape appelante
     est en continue-on-error : un clip manquant ne doit pas retenir un
     article. L'annonce repartira sur l'image fixe. */
  console.error(`::warning::clip non genere pour ${slug} : ${e.message}`);
  process.exit(1);
}
```

- [ ] **Étape 2 : vérifier le dry-run sans clé**

Lancer : `node scripts/genere-video.mjs --slug=pokemon-storm-emeralda-m6-mega-rayquaza-ex --dry-run`
Attendu : les quatre lignes `[dry-run]`, code de sortie 0, aucun appel réseau.

- [ ] **Étape 3 : générer un vrai clip et le regarder**

Cette étape est un POINT D'ARRÊT : elle demande une clé fal.ai et un
contrôle visuel humain. Ne pas la sauter, ne pas la simuler.

```bash
FAL_KEY=<cle> node scripts/genere-video.mjs --slug=pokemon-storm-emeralda-m6-mega-rayquaza-ex
```

Ouvrir `public/assets/social/pokemon-storm-emeralda-m6-mega-rayquaza-ex.mp4` et
vérifier trois points avant d'aller plus loin :
1. le titre et le logo restent nets et lisibles, sans déformation ;
2. le modèle n'a ajouté ni texte, ni logo, ni carte inventée ;
3. la durée est bien de 7 à 10 s et le fichier fait moins de 20 Mo.

Si un seul point échoue, ajuster `invite` dans `video-seedance.mjs` et
regénérer, plutôt que de continuer.

- [ ] **Étape 4 : committer le script et le clip validé**

```bash
git add scripts/genere-video.mjs public/assets/social/*.mp4 .github/etat-video.json
git commit -m "feat(video): entree CLI de generation de clip et premier clip valide"
```

---

### Tâche 4 : envoi du clip à TikTok, avec repli sur l'image

**Fichiers :**
- Modifier : `scripts/annonce-buffer.mjs:211-249` (fonction `publier`) et `:296-308` (tableau `envois`)

**Interfaces :**
- Consomme : le MP4 servi sur `${SITE}/assets/social/<slug>.mp4`.
- Produit : rien pour les tâches suivantes.

- [ ] **Étape 1 : relever la forme exacte d'un asset vidéo chez Buffer**

`publier()` construit aujourd'hui `assets: [{ image: { url, metadata } }]`. La
forme d'un asset VIDÉO n'est pas connue et ne doit pas être devinée : une
mauvaise forme partirait en HTTP 200 avec un refus dans l'union, donc
silencieusement.

Relever le schéma réel avant de coder, avec l'outil d'introspection Buffer ou
la requête GraphQL :

```graphql
{ __type(name: "CreatePostInput") { inputFields { name type { name kind ofType { name } } } } }
```

puis le type d'entrée des assets. Noter la forme exacte dans le commentaire du
code. Si l'introspection est indisponible, s'arrêter et le signaler plutôt que
d'inventer la forme.

- [ ] **Étape 2 : ajouter la détection du clip en production**

Dans `scripts/annonce-buffer.mjs`, après la déclaration de `vignetteOg`
(ligne 266), ajouter :

```js
const clip = `${SITE}/assets/social/${slug}.mp4`;

/*
  Le clip est produit à la publication de l'article, pas ici : il est donc
  déjà déployé depuis plusieurs heures. On vérifie quand même sa présence
  réelle, car un article publié avant la mise en place du pipeline, ou une
  génération qui a échoué, n'en a pas. Sans ce contrôle, TikTok recevrait
  une URL morte.

  `redirect: 'follow'` est indispensable : l'apex répond 307 vers www., et
  un contrôle sans suivi conclurait à l'absence du fichier.
*/
async function clipDisponible() {
  try {
    const r = await fetch(clip, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(15000) });
    return r.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Étape 3 : accepter une vidéo dans `publier`**

Remplacer la construction de `input.assets` dans `publier` par une signature
qui distingue les deux médias. Remplacer la ligne `async function publier(canalId, texte, vignette, metadata) {` et le bloc `input` par :

```js
async function publier(canalId, texte, media, metadata) {
  /* `media` : { type: 'image' | 'video', url }. La forme de l'asset vidéo
     est celle relevée à l'étape 1 de la tâche 4 ; ne pas la deviner. */
  const asset =
    media == null
      ? null
      : media.type === 'video'
        ? { video: { url: media.url, metadata: { altText: 'Clip de l’article Cards-Trading' } } }
        : { image: { url: media.url, metadata: { altText: 'Vignette de l’article Cards-Trading' } } };

  const input = {
    channelId: canalId,
    text: texte,
    assets: asset ? [asset] : [],
    mode: 'addToQueue',
    needsApproval: false,
    schedulingType: 'automatic',
    ...(BROUILLON ? { saveToDraft: true } : {}),
    ...(metadata ? { metadata } : {}),
  };
```

Le reste de la fonction (la mutation et le contrôle `__typename`) ne change pas.

- [ ] **Étape 4 : adapter les trois appels existants**

Dans le tableau `envois`, remplacer les médias par la nouvelle forme :

```js
const avecClip = await clipDisponible();
console.log(avecClip ? '🎬 TikTok : clip disponible.' : '🖼️  TikTok : pas de clip, image fixe.');

const envois = [
  ['twitter', () => publier(dispo.twitter, texteX(fm), { type: 'image', url: vignetteOg }, {
    twitter: { thread: [{ text: texteX(fm), assets: [imageX] }, { text: `${url}x` }] },
  })],
  ['instagram', () => publier(dispo.instagram, texteInstagram(fm), { type: 'image', url: vignette },
      { instagram: { type: 'post', shouldShareToFeed: true } })],
  ['tiktok', () => publier(dispo.tiktok, texteTikTok(fm),
      avecClip ? { type: 'video', url: clip } : { type: 'image', url: vignette },
      { tiktok: { title: fm.title.slice(0, 90) } })],
];
```

- [ ] **Étape 5 : ajouter le clip au dry-run**

Dans le bloc `if (SEC)`, ajouter avant `process.exit(0)` :

```js
console.log('\n[dry-run] TikTok — media : ' + (await clipDisponible() ? clip : vignette + ' (repli image)'));
```

- [ ] **Étape 6 : vérifier le dry-run**

Lancer : `node scripts/annonce-buffer.mjs --dry-run`
Attendu : la ligne `[dry-run] TikTok — media :` affiche le `.mp4` si le clip
de l'article en tête de file est déployé, sinon le `.png` avec la mention de
repli. Les deux cas sont corrects ; c'est la cohérence entre le message et la
réalité qui est vérifiée ici.

- [ ] **Étape 7 : éprouver en brouillon, sans rien publier**

```bash
gh workflow run annonce-buffer.yml --repo TchikiBalianos/cards-trading -f brouillon=true
```

Un brouillon ne consomme pas l'article : `.github/etat-annonces-buffer.json`
n'est écrit que si un post part réellement. Vérifier ensuite dans Buffer que
le brouillon TikTok porte bien la vidéo et non l'image.

- [ ] **Étape 8 : committer**

```bash
git add scripts/annonce-buffer.mjs
git commit -m "feat(buffer): envoie le clip sur TikTok avec repli sur l image"
```

---

### Tâche 5 : générer le clip à la publication de l'article

**Fichiers :**
- Modifier : `.github/workflows/publie-articles.yml`

**Interfaces :**
- Consomme : `scripts/genere-video.mjs`.
- Produit : `public/assets/social/<slug>.mp4` committé avec l'article publié.

- [ ] **Étape 1 : lire le workflow pour situer l'étape des vignettes**

Lancer : `grep -n "vignette\|commit\|curl" .github/workflows/publie-articles.yml`
Repérer l'étape qui génère les vignettes et celle qui committe. Le clip se
génère APRÈS les vignettes (il en a besoin) et AVANT le commit.

- [ ] **Étape 2 : insérer l'étape de génération**

Juste après l'étape des vignettes, ajouter :

```yaml
      - name: Générer le clip TikTok des articles publiés
        # `continue-on-error` volontaire : un clip manquant n'est pas un
        # motif de retenir un article. L'annonce repartira sur l'image fixe.
        continue-on-error: true
        env:
          FAL_KEY: ${{ secrets.FAL_KEY }}
        run: |
          if [ -z "$FAL_KEY" ]; then
            echo "::warning::FAL_KEY absente, aucun clip genere."
            exit 0
          fi
          for f in $(git diff --name-only HEAD~1 -- src/content/blog/ 2>/dev/null || true); do
            slug=$(basename "$f" .md)
            node scripts/genere-video.mjs --slug="$slug" || true
          done
```

- [ ] **Étape 3 : ajouter le MP4 et l'état au commit existant**

Dans l'étape de commit du workflow, ajouter les deux chemins au `git add`
existant (ne pas créer un second commit) :

```yaml
          git add public/assets/social/ .github/etat-video.json
```

- [ ] **Étape 4 : créer le secret**

Créer `FAL_KEY` dans Settings → Secrets and variables → Actions du dépôt
`TchikiBalianos/cards-trading`, comme `BUFFER_API_KEY`.

- [ ] **Étape 5 : éprouver le workflow à blanc**

Lancer : `node scripts/publie-articles.mjs --controle`
Attendu : l'état du jour s'affiche sans écriture. Cette commande ne teste pas
la génération vidéo, elle vérifie seulement que le workflow n'a pas été cassé.

- [ ] **Étape 6 : vérifier en production après le premier passage réel**

```bash
curl -sIL -o /dev/null -w '%{http_code}\n' "https://cards-trading.com/assets/social/<slug>.mp4"
```

Attendu : `200`. Le `-L` n'est pas optionnel : sans lui, l'apex répond 307 et
le contrôle conclut à tort que le fichier manque.

- [ ] **Étape 7 : committer**

```bash
git add .github/workflows/publie-articles.yml
git commit -m "feat(publication): genere le clip TikTok avec les vignettes"
```

---

## Auto-revue

**Couverture de la spec.** Le design demande : clip 7 à 10 s en image-to-video
(tâche 2, `SECONDES = 8`, endpoint `image-to-video`), repli sur image fixe en
cas d'échec ou de plafond (tâches 2 et 4), clé en secret Actions (tâche 5),
validation visuelle avant mise en service (tâche 3, étape 3), CTA TikTok
(tâche 1). L'habillage de vignette demandé par le design est déjà en place et
documenté comme tel en tête de plan.

**Inconnue assumée.** La forme de l'asset vidéo chez Buffer est relevée à
l'exécution (tâche 4, étape 1) plutôt que devinée, avec consigne explicite de
s'arrêter si l'introspection échoue. C'est le seul endroit du plan où le code
n'est pas donné en entier, et c'est délibéré : inventer cette forme
produirait exactement le type de panne silencieuse que ce projet a déjà payé.

**Cohérence des types.** `genereClip` reçoit `imageUrl` (tâche 2) et est
appelée avec `imageUrl` (tâche 3). `publier` reçoit `media: { type, url }`
(tâche 4, étape 3) et les trois appels passent cette forme (étape 4).
`chargerEtat(chemin)` est exporté en tâche 2 et importé en tâche 3.
