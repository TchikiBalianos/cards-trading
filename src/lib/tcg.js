/**
 * Les TCG couverts par le blog, et leurs libellés lisibles.
 *
 * Posé dans un module partagé plutôt que recopié : la page hub
 * (`src/pages/tcg/[categorie].astro`) et l'index du blog
 * (`src/pages/blog/index.astro`) doivent nommer les jeux de la même façon,
 * sinon la navigation dirait « one-piece » d'un côté et « One Piece Card
 * Game » de l'autre.
 *
 * ⚠️ Ce sont les catégories adossées à un JEU. `guide`, `actualite` et
 * `strategie` existent aussi dans `src/content.config.ts` mais sont des
 * rubriques transverses : elles n'ont pas de page hub, une page « Guide »
 * n'ayant aucun sens pour un lecteur qui cherche un jeu.
 */
export const LIBELLES_TCG = {
  pokemon: 'Pokémon',
  magic: 'Magic: The Gathering',
  'one-piece': 'One Piece Card Game',
  yugioh: 'Yu-Gi-Oh!',
  lorcana: 'Disney Lorcana',
  'dragon-ball': 'Dragon Ball Fusion World',
  'star-wars': 'Star Wars Unlimited',
};

/** Forme courte, pour une barre de navigation où la place est comptée. */
export const LIBELLES_COURTS = {
  pokemon: 'Pokémon',
  magic: 'Magic',
  'one-piece': 'One Piece',
  yugioh: 'Yu-Gi-Oh!',
  lorcana: 'Lorcana',
  'dragon-ball': 'Dragon Ball',
  'star-wars': 'Star Wars',
};

/** Ce que le lecteur vient chercher sur la page d'un jeu. */
export const ACCROCHES_TCG = {
  pokemon: 'sorties, cotes et guides pour collectionner sans se tromper',
  magic: 'actualité des éditions, prix du marché et analyses de format',
  'one-piece': 'sorties, cotes du scellé et des cartes à l’unité, méta',
  yugioh: 'nouvelles extensions, cotes et guides de collection',
  lorcana: 'sorties, raretés et suivi des prix du marché',
  'dragon-ball': 'extensions, cotes et guides pour la collection',
  'star-wars': 'actualité du format, suspensions et rotation',
};

/** Vrai si la catégorie désigne un jeu, et non une rubrique transverse. */
export const estTcg = (categorie) => categorie in LIBELLES_TCG;
