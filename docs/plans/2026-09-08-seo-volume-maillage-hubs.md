# SEO : volume, maillage interne et pages hub, plan d'implémentation

> **Pour les agents :** SOUS-SKILL REQUISE : utiliser superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans pour dérouler ce plan tâche par tâche. Les étapes sont en cases à cocher (`- [ ]`).

**But :** doubler le volume d'articles indexables, garantir un maillage interne par TCG, et offrir aux moteurs une page d'entrée par jeu, sans casser le calendrier éditorial existant.

**Architecture :** trois changements indépendants. Le calendrier rend l'article du vendredi obligatoire. Le contrôle de complétude partagé (`scripts/lib/article.mjs`) gagne une exigence de lien interne vers un article du même TCG, appliquée à la fois par la publication et par l'alerte de relecture. Le blog Astro gagne une page hub par catégorie, alimentée par la Content Collection existante.

**Tech :** Node 20 ESM, Astro 6 avec Content Collections, `node --test` (runner intégré).

**Spec :** `docs/plans/2026-09-08-strategie-reseaux-seo-design.md`

## Contraintes globales

- La constante `REF` de `scripts/prochain-article.mjs:22` (lundi 27 juillet 2026) ne doit JAMAIS changer : tout le calendrier, passé comme futur, se décalerait.
- `scripts/lib/article.mjs` est partagé par `publie-articles.mjs` et `alerte-relecture.mjs`. Les deux doivent juger un article selon les MÊMES critères, sinon l'alerte annonce « publiable » un article que la publication refusera le lendemain. Toute évolution touche les deux appelants dans le même commit.
- La landing (`public/*.html`) est du HTML statique, le blog est Astro (`src/`). Les pages hub sont du ressort d'Astro uniquement.
- Une catégorie hors de l'énumération de `src/content.config.ts:12-23` casse le build.
- Vérification en production obligatoire : un build vert ne prouve rien.
- Aucun tiret cadratin dans les textes rédigés.

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `scripts/prochain-article.mjs` (modifier) | Statut du créneau du vendredi |
| `scripts/lib/prochain-article.test.mjs` (créer) | Test du calendrier et de l'alternance |
| `scripts/lib/article.mjs` (modifier) | Exigence de maillage interne par TCG |
| `scripts/lib/article.test.mjs` (créer) | Tests du contrôle de maillage |
| `scripts/publie-articles.mjs` (modifier) | Passe le contexte au contrôle |
| `scripts/alerte-relecture.mjs` (modifier) | Passe le même contexte |
| `src/pages/tcg/[categorie].astro` (créer) | Page hub par TCG |
| `src/pages/blog/index.astro` (modifier) | Liens vers les hubs |

---

### Tâche 1 : l'article du vendredi devient obligatoire

**Fichiers :**
- Modifier : `scripts/prochain-article.mjs:47-59` et `:77-94`
- Test : `scripts/lib/prochain-article.test.mjs`

**Interfaces :**
- Consomme : rien.
- Produit : `planSemaine(n).articles[1].statut === 'obligatoire'`.

- [ ] **Étape 1 : mettre l'exécution derrière une garde**

Le script exécute du code au chargement (lignes 77 à 94), ce qui polluerait la
sortie des tests. En tête de fichier, après les imports existants, ajouter :

```js
import { pathToFileURL } from 'node:url';
```

puis englober tout le bloc à partir de `const n = Number(process.argv[2]) || 1;`
jusqu'à la fin du fichier dans :

```js
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // ... corps existant inchangé ...
}
```

- [ ] **Étape 2 : écrire le test qui échoue**

Créer `scripts/lib/prochain-article.test.mjs` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSemaine, semaineNo } from '../prochain-article.mjs';

test('le creneau du vendredi est obligatoire', () => {
  const p = planSemaine(0);
  assert.equal(p.articles[1].jour, 'vendredi');
  assert.equal(p.articles[1].statut, 'obligatoire');
});

test('l alternance Pokemon / One Piece est preservee', () => {
  assert.equal(planSemaine(0).articles[0].categorie, 'pokemon');
  assert.equal(planSemaine(1).articles[0].categorie, 'one-piece');
  assert.equal(planSemaine(2).articles[0].categorie, 'pokemon');
});

test('la reference du calendrier n a pas bouge', () => {
  // Semaine 0 = lundi 27 juillet 2026. Si cette assertion casse, c est que
  // REF a ete modifiee et que tout le calendrier s est decale.
  assert.equal(planSemaine(0).lundi, '2026-07-27');
});

test('une semaine anterieure a la reference ne casse pas la rotation', () => {
  assert.ok(['pokemon', 'one-piece'].includes(planSemaine(-3).articles[0].categorie));
});

test('semaineNo est coherent avec planSemaine', () => {
  const n = semaineNo(new Date('2026-07-29T12:00:00Z'));
  assert.equal(planSemaine(n).lundi, '2026-07-27');
});
```

- [ ] **Étape 3 : lancer le test pour le voir échouer**

Lancer : `npm test`
Attendu : ÉCHEC sur le premier test, `optionnel` au lieu de `obligatoire`.
Les quatre autres passent déjà : ils sont là pour prouver que le changement
ne décale pas le calendrier.

- [ ] **Étape 4 : rendre le vendredi obligatoire**

Dans `planSemaine`, ligne 56, remplacer :

```js
      { jour: 'vendredi', categorie: secondaire, libelle: LIBELLE[secondaire], statut: 'obligatoire' },
```

Mettre aussi l'en-tête du fichier à jour, ligne 6, pour que la règle
documentée corresponde au code :

```js
 *  - 2 articles par semaine, tous deux obligatoires
```

- [ ] **Étape 5 : relancer les tests**

Lancer : `npm test`
Attendu : les cinq tests passent.

- [ ] **Étape 6 : vérifier la sortie du script**

Lancer : `node scripts/prochain-article.mjs 4`
Attendu : les quatre semaines affichent `(obligatoire)` sur les deux lignes.

- [ ] **Étape 7 : committer**

```bash
git add scripts/prochain-article.mjs scripts/lib/prochain-article.test.mjs
git commit -m "feat(editorial): l article du vendredi devient obligatoire"
```

- [ ] **Étape 8 : signaler la dépendance hors dépôt**

Ce changement ne suffit pas à faire écrire l'article. La rédaction est
déclenchée par la tâche planifiée `blog-cards-trading-article-secondaire`,
qui vit dans l'app Claude Desktop et non dans le dépôt. Signaler à Julian que
sa consigne doit être mise à jour pour ne plus traiter le vendredi comme
facultatif, et rappeler le risque déjà documenté : une tâche planifiée
Desktop ne tourne que si l'app est ouverte.

---

### Tâche 2 : exiger un lien interne vers un article du même TCG

**Fichiers :**
- Modifier : `scripts/lib/article.mjs:38-55` et `:62-78`
- Modifier : `scripts/publie-articles.mjs:68`
- Modifier : `scripts/alerte-relecture.mjs:86`
- Test : `scripts/lib/article.test.mjs`

**Interfaces :**
- Consomme : rien.
- Produit : `defauts(article, autres = [])` où `autres` est un tableau de
  `{ slug, categorie }` décrivant les articles DÉJÀ publiés. La valeur par
  défaut préserve le comportement des appels à un seul argument.

- [ ] **Étape 1 : écrire les tests qui échouent**

Créer `scripts/lib/article.test.mjs` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defauts } from './article.mjs';

const CORPS_COMPLET = [
  '## Sommaire',
  '- un',
  'x'.repeat(2100),
  '## FAQ',
  '### Une question ?',
  'Reponse.',
  '### Une deuxieme ?',
  'Reponse.',
  '### Une troisieme ?',
  'Reponse.',
].join('\n\n');

const article = (corps) => ({
  corps,
  champs: { title: 'T', description: 'D', category: 'pokemon' },
});

const AUTRES = [
  { slug: 'guide-demarrage-pokemon-tcg', categorie: 'pokemon' },
  { slug: 'top-cartes-magic-2026', categorie: 'magic' },
];

test('un article sans lien vers un article du meme TCG est refuse', () => {
  const m = defauts(article(CORPS_COMPLET), AUTRES);
  assert.ok(m.some((d) => /lien interne/i.test(d)), m.join(' | '));
});

test('un lien vers un article du meme TCG suffit', () => {
  const corps = CORPS_COMPLET + '\n\nVoir [notre guide](/blog/guide-demarrage-pokemon-tcg/).';
  assert.deepEqual(defauts(article(corps), AUTRES), []);
});

test('un lien vers un autre TCG ne compte pas', () => {
  const corps = CORPS_COMPLET + '\n\nVoir [Magic](/blog/top-cartes-magic-2026/).';
  const m = defauts(article(corps), AUTRES);
  assert.ok(m.some((d) => /lien interne/i.test(d)));
});

test('le premier article d un TCG n est pas bloque', () => {
  const seul = [{ slug: 'top-cartes-magic-2026', categorie: 'magic' }];
  assert.deepEqual(defauts(article(CORPS_COMPLET), seul), []);
});

test('sans contexte, le comportement d avant est preserve', () => {
  assert.deepEqual(defauts(article(CORPS_COMPLET)), []);
});
```

- [ ] **Étape 2 : lancer les tests pour les voir échouer**

Lancer : `npm test`
Attendu : ÉCHEC sur les trois premiers tests. Les deux derniers passent déjà,
ils garantissent qu'on ne bloque ni le premier article d'un TCG, ni un
appelant qui ne fournit pas de contexte.

- [ ] **Étape 3 : ajouter le contrôle**

Dans `scripts/lib/article.mjs`, remplacer la signature et la fin de `defauts` :

```js
/**
 * Ce qui EMPÊCHE une publication. Volontairement souple sur la forme (les
 * titres de FAQ varient) et strict sur le fond : il faut de vraies questions
 * et un sommaire, structure obligatoire de tout article du blog.
 *
 * `autres` liste les articles DÉJÀ publiés, sous la forme
 * { slug, categorie }. Il sert au seul contrôle de maillage interne, et sa
 * valeur par défaut préserve les appels à un argument.
 */
export function defauts(article, autres = []) {
  const manque = [];
  // ... contrôles existants inchangés ...

  /*
    Maillage interne : un article doit renvoyer vers un autre article du MÊME
    TCG. C'est ce qui construit l'autorité thématique par jeu, et c'est la
    seule partie du référencement qu'un script peut vérifier seul.

    Exigé uniquement s'il EXISTE un autre article de la même catégorie : le
    premier article d'un TCG n'a rien à lier, et le refuser bloquerait
    l'ouverture de chaque nouveau jeu.
  */
  const memeTcg = autres.filter((a) => a.categorie === article.champs.category);
  if (memeTcg.length > 0) {
    const lie = memeTcg.some((a) => article.corps.includes(`/blog/${a.slug}`));
    if (!lie) {
      manque.push(
        `aucun lien interne vers un article ${article.champs.category} ` +
        `(${memeTcg.length} disponible(s), par exemple /blog/${memeTcg[0].slug}/)`
      );
    }
  }

  return manque;
}
```

Retirer aussi de `points_de_vigilance` la ligne 71, désormais couverte par un
contrôle bloquant et plus précis :

```js
  if (!/\]\(\/blog\//.test(article.corps)) points.push('aucun lien croisé vers un autre article');
```

- [ ] **Étape 4 : relancer les tests**

Lancer : `npm test`
Attendu : les cinq tests passent.

- [ ] **Étape 5 : brancher le contexte dans LES DEUX appelants**

Les deux doivent changer dans le même commit, sans quoi l'alerte et la
publication divergeraient, ce que l'en-tête de `article.mjs` interdit
explicitement.

Dans `scripts/publie-articles.mjs`, avant la ligne 68, construire la liste des
articles déjà publiés (adapter au nom de la variable locale qui liste les
fichiers du dossier blog) puis :

```js
    const manque = defauts(article, publies);
```

Dans `scripts/alerte-relecture.mjs`, ligne 86 :

```js
    bloquants: defauts(article, publies),
```

Dans les deux cas, `publies` a la forme `[{ slug, categorie }]` et exclut
l'article en cours d'examen.

- [ ] **Étape 6 : vérifier sur l'état réel du dépôt**

Lancer : `node scripts/publie-articles.mjs --controle`
Attendu : la sortie liste les articles du jour et leurs défauts éventuels.
Aucun article publié ne doit apparaître comme bloqué : si c'est le cas, c'est
que la liste `publies` inclut l'article examiné, à corriger.

Lancer : `node scripts/alerte-relecture.mjs --rappel --dry-run`
Attendu : le même verdict que la commande précédente pour un même article.
Un écart entre les deux est le défaut que ce fichier partagé existe pour
empêcher.

- [ ] **Étape 7 : committer**

```bash
git add scripts/lib/article.mjs scripts/lib/article.test.mjs scripts/publie-articles.mjs scripts/alerte-relecture.mjs
git commit -m "feat(blog): exige un lien interne vers un article du meme TCG"
```

---

### Tâche 3 : pages hub par TCG

**Fichiers :**
- Créer : `src/pages/tcg/[categorie].astro`
- Modifier : `src/pages/blog/index.astro`

**Interfaces :**
- Consomme : la collection `blog` et le composant `BlogCard`.
- Produit : une route `/tcg/<categorie>/` par TCG ayant au moins un article.

- [ ] **Étape 1 : créer la page hub**

Créer `src/pages/tcg/[categorie].astro` :

```astro
---
import BlogLayout from '../../layouts/BlogLayout.astro';
import BlogCard from '../../components/BlogCard.astro';
import { getCollection } from 'astro:content';

/* Un hub par TCG réellement couvert. Générer une page pour une catégorie
   sans article donnerait une page vide, que les moteurs traitent comme du
   contenu mince. */
const LIBELLES = {
  pokemon: 'Pokémon',
  magic: 'Magic: The Gathering',
  'one-piece': 'One Piece Card Game',
  yugioh: 'Yu-Gi-Oh!',
  lorcana: 'Disney Lorcana',
  'dragon-ball': 'Dragon Ball Fusion World',
  'star-wars': 'Star Wars Unlimited',
};

export async function getStaticPaths() {
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  const parCategorie = {};
  for (const p of posts) {
    (parCategorie[p.data.category] ||= []).push(p);
  }
  return Object.entries(parCategorie)
    .filter(([categorie]) => categorie in LIBELLES)
    .map(([categorie, articles]) => ({
      params: { categorie },
      props: {
        articles: articles.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()),
      },
    }));
}

const { categorie } = Astro.params;
const { articles } = Astro.props;
const libelle = LIBELLES[categorie];
---

<BlogLayout
  title={`${libelle} : actualites, prix et guides`}
  description={`Toute l actualite ${libelle} sur Cards-Trading : sorties, cotes, guides de collection et analyses de meta.`}
>
  <section class="blog-hero">
    <h1>{libelle}</h1>
    <p>
      {articles.length} article{articles.length > 1 ? 's' : ''} sur {libelle} :
      sorties, prix du marche et guides pour collectionner sans se tromper.
    </p>
    <p>
      <a href="/#beta">Rejoindre la beta de la marketplace</a>, 0 % de
      commission pendant toute la beta.
    </p>
  </section>

  <section class="blog-grid">
    {articles.map((post) => (
      <BlogCard
        title={post.data.title}
        description={post.data.description}
        pubDate={post.data.pubDate}
        heroImage={post.data.heroImage}
        category={post.data.category}
        slug={post.id}
      />
    ))}
  </section>
</BlogLayout>
```

- [ ] **Étape 2 : lier les hubs depuis l'index du blog**

Dans `src/pages/blog/index.astro`, après le bloc `<section class="blog-hero">`
(ligne 19), ajouter la liste des hubs. Elle se déduit des articles chargés,
sans seconde requête :

```astro
  <nav class="blog-hubs" aria-label="Parcourir par jeu">
    {[...new Set(posts.map((p) => p.data.category))]
      .filter((c) => ['pokemon', 'magic', 'one-piece', 'yugioh', 'lorcana', 'dragon-ball', 'star-wars'].includes(c))
      .map((c) => (
        <a href={`/tcg/${c}/`}>{c}</a>
      ))}
  </nav>
```

- [ ] **Étape 3 : contrôler le build**

Lancer : `npm run build`
Attendu : le build passe et la sortie mentionne les routes `/tcg/...`. Rappel :
un build vert ne prouve rien sur la landing, mais ici la cible EST le blog,
donc ce contrôle est pertinent.

- [ ] **Étape 4 : vérifier le rendu en local**

Lancer : `npm run preview` puis ouvrir `/tcg/pokemon/`.
Attendu : le titre, le nombre d'articles, les cartes des articles Pokémon et
le lien vers la bêta. Vérifier qu'aucune catégorie sans article n'a produit
de page.

- [ ] **Étape 5 : committer**

```bash
git add src/pages/tcg/ src/pages/blog/index.astro
git commit -m "feat(blog): pages hub par TCG avec appel a la beta"
```

- [ ] **Étape 6 : vérifier en production après déploiement**

```bash
curl -sL -o /dev/null -w '%{http_code}\n' "https://cards-trading.com/tcg/pokemon/"
```

Attendu : `200`. Sans `-L`, l'apex répond 307 et le contrôle échoue à tort.

Vérifier aussi que le sitemap les a pris :

```bash
curl -sL "https://cards-trading.com/sitemap-0.xml" | grep -c "/tcg/"
```

Attendu : au moins 1. Un hub absent du sitemap ne sera pas exploré.

---

## Auto-revue

**Couverture de la spec.** Le design demande trois volets SEO : vendredi
obligatoire (tâche 1), maillage interne contrôlé au même endroit que le
sommaire et la FAQ (tâche 2, dans `scripts/lib/article.mjs`), pages hub par
TCG avec CTA d'inscription (tâche 3). Les trois sont couverts.

**Dépendance hors dépôt.** La tâche 1 ne suffit pas à faire écrire l'article
du vendredi : la rédaction dépend d'une tâche planifiée Claude Desktop. C'est
signalé explicitement en étape 8 plutôt que passé sous silence, parce qu'un
plan qui laisserait croire au contraire ferait constater l'absence d'articles
plusieurs semaines plus tard.

**Cohérence des types.** `defauts(article, autres = [])` est défini en tâche 2
étape 3 et appelé avec la même forme `[{ slug, categorie }]` aux deux sites
d'appel de l'étape 5. Les catégories utilisées dans les hubs (tâche 3) sont un
sous-ensemble strict de l'énumération de `src/content.config.ts`, donc aucun
risque de casser le build par une valeur hors liste.

**Point non couvert volontairement.** Le design évoque de renforcer la
visibilité dans les moteurs IA. `src/pages/llms.txt.ts` existe déjà et
gagnerait à lister les hubs, mais ce n'est pas dans la spec validée : à
proposer séparément plutôt qu'à glisser ici.
