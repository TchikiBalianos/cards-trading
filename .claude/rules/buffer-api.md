---
paths:
  - "scripts/annonce-buffer.mjs"
  - "scripts/brouillons-sociaux.mjs"
  - "scripts/semaine-sociale.mjs"
  - "scripts/lib/buffer.mjs"
  - "scripts/lib/brouillons.mjs"
  - "scripts/lib/semaine-sociale.mjs"
  - ".github/workflows/annonce-buffer.yml"
  - ".github/workflows/brouillons-sociaux.yml"
  - ".github/workflows/controle-social.yml"
---

# Buffer : pièges de l'API

Texte sorti de `CLAUDE.md` et de `docs/posts-sociaux.md` le 25 octobre 2026, conservé tel quel.
Ce fichier se charge seul quand on lit un des scripts ou workflows Buffer listés dans l'en-tête.
Règles éditoriales des posts : `docs/posts-sociaux.md`.

## Buffer : l'API change sous les pieds

Le relais d'articles vers X, Instagram et TikTok passe par
`scripts/annonce-buffer.mjs`, lancé par `.github/workflows/annonce-buffer.yml`
les dimanches, mardis et vendredis. Entre le 23 et le 25 août 2026, **deux évolutions
simultanées** de l'API GraphQL l'ont cassé net, sans préavis ni changement
de version. Le premier symptôme fait accuser la clé : ce n'est pas elle.

### `channels` : seule la requête racine passe

`account { organizations { channels } }` répond **FORBIDDEN** à une clé
personnelle. La requête racine renvoie exactement les mêmes champs :

```graphql
query ($input: ChannelsInput!) {
  channels(input: $input) { id service isDisconnected }
}
```

Le message « Not authorized to access this resource » oriente vers un
problème de périmètre. Il n'en est rien : vérifié le 27 août 2026 avec une
clé neuve portant les 9 permissions proposées, sans effet. Il n'existe
aucun scope `channels:*` à cocher, la liste s'arrête à `account`, `posts`,
`ideas`, `insights` et `engagements`.

⚠️ Ne pas figer les identifiants de canaux dans le dépôt pour contourner :
reconnecter un compte dans Buffer lui en attribue un nouveau, et le relais
partirait alors silencieusement vers le vide.

### `createPost` : un refus arrive en réponse **valide**

Le type de retour est devenu `PostActionPayload`, une **union** dont seul
`PostActionSuccess` porte le post. Les six autres membres sont des erreurs
(`InvalidInputError`, `LimitReachedError`, `RestProxyError`,
`UnauthorizedError`, `NotFoundError`, `UnexpectedError`), toutes porteuses
d'un `message`.

C'est le piège de fond, et il survivra à cet incident : **un rejet du réseau
ne remplit plus `errors`**. La réponse est un HTTP 200 sans la moindre
erreur GraphQL. Un code qui teste `if (j.errors)` conclut au succès, sort
l'article de la file, et le post n'existe nulle part. Même famille que le
`return 200` inconditionnel de mai 2026 sur `/api/submit-form`.

Le `__typename` est donc obligatoire, et son contrôle aussi :

```js
if (r.__typename !== 'PostActionSuccess') throw new Error(r.message);
```

### Éprouver sans rien publier

Le workflow accepte un mode brouillon, qui crée les posts sans les mettre
en file :

```bash
gh workflow run annonce-buffer.yml --repo TchikiBalianos/cards-trading -f brouillon=true
```

Un brouillon ne consomme pas l'article : `.github/etat-annonces-buffer.json`
n'est écrit que si un post part réellement. Sans quoi un simple test
retirerait l'article de la file et il ne serait jamais annoncé.

### Pièges de l'API Buffer, éprouvés le 29 septembre 2026

- **Un brouillon daté ne part jamais tout seul.** Il apparaît au calendrier à son
  créneau, mais seul le clic « Schedule Post » (onglet Drafts, vue All Channels ou appli
  mobile) le programme. Un brouillon oublié est donc silencieux : c'est le premier
  contrôle de `controle-social` (brouillon daté de demain, ou déjà passé).
- **`editPost` refuse de changer une date seule** : « Post must have either text or
  media ». Il faut renvoyer le contenu. C'est pourquoi il n'existe pas de rééquilibrage
  automatique d'un relais tombé le même jour qu'un post éditorial : le contrôle le signale
  (« doublon »), Julian déplace le post dans Buffer.
- **Plan gratuit : 10 posts programmés par canal**, brouillons illimités. Au-delà, les
  relais automatiques répondent `LimitReachedError`. Le contrôle alerte dès 8.
- **L'API ne crée pas d'étiquettes** : les posts éditoriaux sont suivis par leurs
  identifiants (`buffer` dans le fichier de semaine), pas par tag.
- **Relancer est sans danger** : un brouillon identique (même canal, même heure, même
  texte) est adopté au lieu d'être recréé, et les identifiants sont écrits au fur et à
  mesure. Le commit des identifiants porte `[skip ci]`, celui des visuels **jamais**, par
  prudence (Vercel ne l'honore pas dans ce dépôt, voir `docs/blog-publication.md`).
