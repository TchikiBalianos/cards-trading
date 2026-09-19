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

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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
 *
 * `autres` liste les articles DÉJÀ publiés, sous la forme
 * { slug, categorie }. Il ne sert qu'au contrôle de maillage interne, et
 * sa valeur par défaut préserve les appels à un seul argument.
 */
export function defauts(article, autres = []) {
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

  /*
    Maillage interne : un article doit renvoyer vers un autre article du
    MÊME TCG. C’est ce qui construit l’autorité thématique par jeu, et
    c'est la seule partie du référencement qu'un script peut vérifier seul.

    Exigé UNIQUEMENT s'il existe déjà un autre article de la même
    catégorie : le premier article d'un TCG n'a rien à lier, et le refuser
    bloquerait l’ouverture de chaque nouveau jeu.

    Le contrôle vivait jusqu’ici dans points_de_vigilance(), donc non
    bloquant et sans notion de TCG : il signalait « aucun lien croisé »
    même quand le lien pointait vers un jeu sans rapport.
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

  if (!/cards-trading\.com|\/#beta/i.test(article.corps)) points.push('aucun appel à rejoindre la bêta');

  const mots = article.corps.trim().split(/\s+/).length;
  if (mots < 900) points.push(`article court (${mots} mots)`);

  return points;
}

/**
 * Articles DÉJÀ publiés, sous la forme { slug, categorie }.
 *
 * Posé ici et non dans chaque appelant : publie-articles.mjs et
 * alerte-relecture.mjs doivent juger un article sur la MÊME liste, sans
 * quoi l'alerte annoncerait « publiable » un article que la publication
 * refuserait le lendemain. C’est la raison d’être de ce fichier.
 *
 * `exclure` retire l’article en cours d’examen : sans lui, un article
 * déjà publié se verrait exiger un lien vers lui-même.
 */
export function listerPublies(dossier, exclure = null) {
  /* Pas d’expression rationnelle ici : endsWith se relit mieux. */
  const estArticle = (f) => f.endsWith('.md') || f.endsWith('.mdx');
  const slugDe = (f) => f.slice(0, f.lastIndexOf('.'));

  return readdirSync(dossier)
    .filter(estArticle)
    .map((f) => ({ f, slug: slugDe(f) }))
    .filter((a) => a.slug !== exclure)
    .map((a) => {
      const lu = lireArticle(join(dossier, a.f));
      if (!lu || lu.champs.draft === 'true') return null;
      return { slug: a.slug, categorie: lu.champs.category || null };
    })
    .filter(Boolean);
}

/** Nombre de mots du corps, pour situer l'effort de relecture. */
export function compterMots(article) {
  return article.corps.trim().split(/\s+/).length;
}
