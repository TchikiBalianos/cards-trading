/**
 * Lecture et contrôle des articles de blog, partagés par les scripts qui
 * décident de leur sort : `publie-articles.mjs` (publie ce qui est dû) et
 * `alerte-relecture.mjs` (prévient qu'un brouillon attend).
 *
 * Les deux doivent juger un article selon les MÊMES critères. Séparés, ils
 * divergeraient : l'alerte annoncerait « prêt à publier » un article que la
 * publication refuserait le lendemain, et l'écart ne se verrait qu'au
 * moment où il fait perdre une journée.
 */

import { readFileSync } from 'node:fs';

/** Catégories acceptées par src/content.config.ts. Une valeur hors liste casse le build. */
export const CATEGORIES = [
  'pokemon', 'magic', 'one-piece', 'yugioh', 'lorcana', 'dragon-ball',
  'star-wars', 'guide', 'actualite', 'strategie',
];

/** Découpe le frontmatter du corps, sans dépendance externe. */
export function lireArticle(chemin) {
  const brut = readFileSync(chemin, 'utf8');
  const m = brut.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return null;
  const champs = {};
  for (const ligne of m[1].split(/\r?\n/)) {
    const c = ligne.match(/^(\w+):\s*(.*)$/);
    if (c) champs[c[1]] = c[2].trim().replace(/^["']|["']$/g, '');
  }
  return { brut, frontmatter: m[1], champs, corps: m[2] };
}

/**
 * Ce qui EMPÊCHE une publication. Volontairement souple sur la forme (les
 * titres de FAQ varient) et strict sur le fond : il faut de vraies questions
 * et un sommaire, structure obligatoire de tout article du blog.
 */
export function defauts(article) {
  const manque = [];
  if (!/<!--\s*sommaire\s*-->|^##\s*Sommaire/im.test(article.corps)) manque.push('sommaire');
  const faq = article.corps.match(/^##\s*(FAQ|Questions?[^\n]*)$/im);
  if (!faq) manque.push('section FAQ');
  else {
    const apres = article.corps.slice(article.corps.indexOf(faq[0]));
    const questions = (apres.match(/^###\s+\S/gm) || []).length;
    if (questions < 3) manque.push(`FAQ trop courte (${questions} question(s), 3 minimum)`);
  }
  if (article.corps.trim().length < 2000) manque.push('corps trop court (moins de 2000 signes)');
  if (!article.champs.title) manque.push('titre absent');
  if (!article.champs.description) manque.push('description absente');
  if (!article.champs.category) manque.push('catégorie absente');
  else if (!CATEGORIES.includes(article.champs.category))
    manque.push(`catégorie « ${article.champs.category} » hors énumération, le build casserait`);
  return manque;
}

/**
 * Ce qui MÉRITE UN COUP D'ŒIL sans bloquer : des règles éditoriales qu'un
 * script ne peut trancher seul. Sert à orienter la relecture humaine, pas à
 * refuser un article.
 */
export function points_de_vigilance(article) {
  const points = [];

  // « 0 % de commission pendant la bêta », JAMAIS une durée chiffrée : la
  // bêta n'a pas de terme annoncé et un engagement daté nous lierait.
  const duree = article.corps.match(/commission[^.]{0,80}?(\d+\s*(mois|semaines?|jours?))/i)
    || article.corps.match(/(\d+\s*(mois|semaines?))[^.]{0,60}?commission/i);
  if (duree) points.push(`durée de commission chiffrée : « ${duree[1]} » — la formule est « pendant toute la bêta »`);

  if (!/\]\(\/blog\//.test(article.corps)) points.push('aucun lien croisé vers un autre article');
  if (!/cards-trading\.com|\/#beta/i.test(article.corps)) points.push('aucun appel à rejoindre la bêta');

  const mots = article.corps.trim().split(/\s+/).length;
  if (mots < 900) points.push(`article court (${mots} mots)`);

  return points;
}

/** Nombre de mots du corps, pour situer l'effort de relecture. */
export function compterMots(article) {
  return article.corps.trim().split(/\s+/).length;
}
