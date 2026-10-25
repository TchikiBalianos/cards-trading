# Rédaction des articles du blog

Texte sorti de `CLAUDE.md` le 25 octobre 2026 pour alléger le contexte de chaque session, conservé tel quel.
À lire avant de rédiger, programmer ou fusionner un article, ou d'y écrire une date de sortie, un chiffre ou un prix.
Publication et alerte de relecture : `docs/blog-publication.md`.

## Blog : calendrier éditorial

Rotation **déterministe**, calculée par `scripts/prochain-article.mjs` :

```bash
node scripts/prochain-article.mjs 8   # les 8 prochaines semaines
```

- **Mardi** : article obligatoire, alternant **Pokémon / One Piece**
  → 2 Pokémon et 2 One Piece par mois
- **Vendredi** : article obligatoire depuis le 19 septembre 2026, rotation
  sur Magic, Yu-Gi-Oh!, Lorcana, Dragon Ball, Star Wars

> La constante `REF` du script (lundi 27 juillet 2026) fixe l'origine de
> l'alternance. **Ne jamais la modifier** : tout le calendrier, passé comme
> futur, se décalerait.

Deux tâches planifiées rédigent ces articles automatiquement
(`blog-cards-trading-article-hebdo` et `-secondaire`). Elles écrivent
toujours `draft: true` et poussent sur une **branche dédiée**, jamais sur
`main` : la relecture et la fusion restent manuelles.

Le schéma du frontmatter (`src/content.config.ts`) est strict : une
catégorie hors de l'énumération casse le build.

### Supprimer la branche après fusion, sans quoi la routine se bloque

Les deux tâches de rédaction commencent par lister les branches `blog/*`
distantes et s'arrêtent si l'une porte la catégorie de la semaine, pour
ne pas écrire un doublon. Une branche fusionnée mais jamais supprimée
déclenche ce garde-fou à vide.

Cinq d'entre elles traînaient sur le dépôt en septembre 2026, et elles
couvraient quatre des cinq catégories du vendredi. Trois créneaux
consécutifs sont partis en fumée (mardi 15, vendredis 11 et 18) : la
routine démarrait, sortait en une minute, et rendait compte d'un arrêt
parfaitement légitime. Aucune alerte ne pouvait le voir, puisque rien
n'avait échoué. Même famille que le `return 200` inconditionnel de mai
2026 : le mécanisme de sécurité déclenche, et son déclenchement ressemble
à un succès.

**Le symptôme qui trahit ce cas est la durée du passage.** Une rédaction
dure des minutes, souvent des heures. Un passage à soixante-dix secondes
n'a rien écrit, quoi qu'en dise son compte-rendu. C'est la première chose
à regarder quand un article manque sans qu'aucune alerte ne soit partie.

Les consignes ignorent désormais toute branche dont l'article est déjà
sur `main` (`git cat-file -e origin/main:src/content/blog/<slug>.md`),
mais la vraie hygiène reste de supprimer la branche à la fusion.

⚠️ Avant de supprimer, confirmer que l'article répond 200 en production,
pas seulement qu'il est présent sur `main`.

### Dates de sortie de produits : quelles sources croire

Le 20 septembre 2026, une « correction » du calendrier du 30ᵉ Anniversaire
Pokémon est restée quelques heures en production alors qu'elle était fausse :
elle plaçait la Pokébox et les Tripacks au 16 septembre. Julian, présent en
magasin à l'ouverture après douze heures de queue, a constaté qu'ils n'y
étaient pas. Les pages officielles de Pokémon France lui donnaient raison
depuis le 1er septembre.

La correction avait été validée par des sources toutes secondaires : presse
généraliste écrite le matin de la sortie, blogs de revendeurs, calendriers
agrégés. Elles recopient le calendrier **annoncé** et n'ont aucun moyen de
savoir ce qui est **arrivé en rayon**. Certaines appellent même « Pokébox »
les coffrets Amphinobi-ex et Nymphali-ex, qui sont des produits différents.

Hiérarchie à respecter pour toute date de sortie de produit :

1. **Le constat de Julian**, s'il existe : il bat toute source écrite.
2. **Le site officiel de l'éditeur** (pokemon.com/fr, page d'actualités
   datée, puis fiche produit). Il ne donne souvent que des trimestres :
   c'est une information, pas un vide à combler avec un blog.
3. **Fiches produit de revendeurs** (une date par référence) et feuilles de
   distributeurs. **La Maison du TCG** (lamaisondutcg.com), boutique dont
   Julian connaît le sérieux, écrit la date dans la description de chaque
   fiche (« PRÉCOMMANDE: sortie le … »), lisible dans les données
   structurées de la page plutôt que dans le texte affiché. C'est une date
   **annoncée** : le 20 septembre 2026, ses fiches Tripack et Pokébox
   donnaient encore le 16 septembre alors que ni l'un ni l'autre n'était
   sorti, et le Classeur y figurait au 2 octobre alors que les États-Unis
   l'ont repoussé au 4 décembre. Cohérente avec les faits connus pour cinq
   produits sur huit ce jour-là : précieuse pour repérer un changement,
   jamais suffisante seule.
4. **Presse et blogs**, jamais seuls.

Une date que seules les sources 3 et 4 portent s'écrit « annoncée pour »
ou « à confirmer », jamais comme un fait. Distinguer toujours *annoncé*,
*sorti* et *constaté*.

⚠️ Une branche de correction écrite par une session précédente n'est pas une
source, et un message de commit qui affirme un fait sans URL ne prouve rien.
La fusionner sans revérifier le fait lui-même est ce qui a mis la fausse
date en ligne.

### Chiffres et prix dans les articles : jamais inventés

Règle de Julian, 22 septembre 2026 : **il est interdit d'inventer un chiffre ou un
prix ; mieux vaut un vocabulaire plus vague.** Un prix, un taux de tirage, un volume
d'impression ou une statistique n'entre dans un article que s'il a été lu sur la page
d'origine, en entier, et il y est attribué (« selon … »). Sinon, ou si deux sources
divergent, ou si c'est un comptage communautaire encore fragile, on l'écrit en mots :
« nettement plus fréquentes », « une fraction de son prix d'avant-sortie ».

⚠️ **Les résumés d'outils ne sont pas des lectures.** En préparant un seul dossier
(`docs/briefs/2026-09-22-pokemon-scalpers-sortie-mondiale.md`), les résumés d'un
moteur de recherche et d'un outil de lecture ont attribué des chiffres de Kotaku à
Wargamer, daté de l'été 2025 un fait de l'été 2026, et laissé passer un taux (« un
booster sur deux avec une carte ex ») absent de la source qu'il citait. Tout est apparu
en relisant les pages en texte brut dans le navigateur.

Même prudence pour la presse elle-même : un article peut citer un chiffre que sa propre
source ne contient pas. Remonter à la source primaire, ou renoncer au chiffre.
