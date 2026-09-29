/*
  Charte visuelle partagée par tous les générateurs d'images sociales
  (vignettes d'articles, visuels de la semaine). Une seule source, sinon un
  TCG finirait avec deux couleurs selon le type de post.
*/

export const BLEU = '#2997ff';
export const FOND = '#07111f';

export const ETIQUETTES = {
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

/*
  Une couleur d'accent par TCG (halo, pastille, filet), validée par Julian
  le 28 septembre 2026. Choisie pour évoquer chaque licence sans en singer le
  logo, et pour rester lisible en accent clair sur le fond bleu nuit.
  Tout ce qui n'a pas de TCG garde le bleu de marque.
*/
export const COULEURS = {
  pokemon: '#f4c430',
  magic: '#8b5cf6',
  'one-piece': '#e5484d',
  yugioh: '#caa14b',
  lorcana: '#2dd4bf',
  'dragon-ball': '#ff7a1a',
  'star-wars': '#5ac8fa',
};

export const accentDe = (categorie) => COULEURS[categorie] || BLEU;

/* XML : cinq caractères doivent être échappés, sinon le SVG est invalide et
   sharp échoue sur un message peu parlant. */
export function echapper(texte) {
  return String(texte)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/*
  Découpe en lignes à partir d'une largeur de caractère ESTIMÉE : la police
  diffère entre le poste et l'agent CI, une mise en page au pixel près serait
  fausse ailleurs. On vise large, mieux vaut une ligne courte qu'un débordement.
*/
export function decouper(texte, taillePolice, largeurMax, facteur = 0.54) {
  const maxCar = Math.floor(largeurMax / (taillePolice * facteur));
  const lignes = [];
  let courante = '';

  /* Typographie française : « mot : suite » met une espace avant les
     deux-points. On recolle la ponctuation haute au mot précédent pour ne
     jamais ouvrir une ligne par « : ». */
  const mots = [];
  for (const mot of String(texte).split(/\s+/).filter(Boolean)) {
    if (/^[:;!?»]$/.test(mot) && mots.length) mots[mots.length - 1] += ' ' + mot;
    else mots.push(mot);
  }

  for (const mot of mots) {
    if (!courante) courante = mot;
    else if ((courante + ' ' + mot).length <= maxCar) courante += ' ' + mot;
    else { lignes.push(courante); courante = mot; }
  }
  if (courante) lignes.push(courante);
  return lignes;
}
