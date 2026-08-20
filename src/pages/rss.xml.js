/**
 * Flux RSS du blog — https://cards-trading.com/rss.xml
 *
 * Sert deux usages :
 *   1. les lecteurs de flux, et le référencement (un flux valide est un
 *      signal de fraîcheur pour les moteurs) ;
 *   2. l'automatisation sociale — Buffer, Zapier, Make et consorts savent
 *      consommer un RSS pour alimenter une file de publication. C'est le
 *      moyen le plus simple d'alimenter Instagram et X sans développer
 *      une intégration par réseau.
 *
 * Les brouillons sont exclus, comme sur /blog. Le lien porte
 * `utm_source=rss` pour que la colonne `source` de beta_submissions
 * distingue ce canal des autres.
 */

import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

const ETIQUETTES = {
  pokemon: 'Pokémon',
  magic: 'Magic',
  'one-piece': 'One Piece',
  yugioh: 'Yu-Gi-Oh!',
  lorcana: 'Lorcana',
  'dragon-ball': 'Dragon Ball',
  'star-wars': 'Star Wars',
  guide: 'Guide',
  actualite: 'Actualité',
  strategie: 'Stratégie',
};

export async function GET(context) {
  const articles = (await getCollection('blog', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.pubDate - a.data.pubDate
  );

  return rss({
    title: 'Cards Trading — le blog TCG',
    description:
      'Actualité, guides et analyses du marché des cartes à collectionner : ' +
      'Pokémon, One Piece, Magic, Yu-Gi-Oh!, Lorcana, Dragon Ball.',
    site: context.site,
    /* false, et non true : la barre oblique est déjà posée avant la query
       dans `link` ci-dessous. Avec `true`, Astro en ajoute une APRÈS la
       query string et produit `?utm_source=rss/`, une URL malformée. */
    trailingSlash: false,
    items: articles.map((article) => ({
      title: article.data.title,
      description: article.data.description,
      pubDate: article.data.pubDate,
      link: `/blog/${article.id}/?utm_source=rss`,
      categories: [ETIQUETTES[article.data.category] || article.data.category],
      author: article.data.author,
    })),
    customData: '<language>fr-FR</language>',
  });
}
