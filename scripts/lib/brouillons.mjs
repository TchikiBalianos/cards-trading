/*
  Fichier de semaine `data/social/<lundi>.json` : validation et construction des
  envois vers Buffer. Module PUR (aucun réseau, aucune lecture), pour que les
  règles éditoriales soient testées et refusent un fichier fautif AVANT que
  quoi que ce soit n'atteigne Buffer.

  Format :
  {
    "semaine": "2026-09-28",                        // le lundi
    "posts": [{
      "id": "2026-10-01-communaute",                // jour + pilier
      "jour": "2026-10-01",
      "pilier": "communaute",                       // cote | actu | communaute | coulisses
      "licence": "pokemon",                         // pokemon | one-piece | mixte
      "twitter":   { "texte": "...", "citation": "https://x.com/…/status/…" },
      "instagram": { "texte": "..." },
      "visuel": { "type": "texte|carte|photo", ... },
      "sources": ["https://…"],                     // obligatoire dès qu'un prix ou un % apparaît
      "buffer": { "twitter": "<id>", "instagram": "<id>" }   // écrit par le pipeline
    }]
  }
*/

import { PILIERS, lundiDe, ajouterJours, jourParis } from './semaine-sociale.mjs';
import { verifierSpec } from './visuel-spec.mjs';

export const LICENCES = ['pokemon', 'one-piece', 'mixte'];
export const SITE = 'https://cards-trading.com';
const MAX_X = 280;
const MAX_INSTAGRAM = 2200;
const RE_CITATION = /^https:\/\/(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/status\/\d+/;

/* X compte un lien pour 23 caractères et un emoji pour 2. Le décompte est
   volontairement prudent : mieux vaut refuser un texte limite que voir Buffer
   rejeter le post au moment de le programmer. */
export function poidsX(texte) {
  const sansLien = String(texte).replace(/https?:\/\/\S+/g, ' '.repeat(23));
  let p = 0;
  for (const c of sansLien) p += /\p{Extended_Pictographic}/u.test(c) ? 2 : 1;
  return p;
}

export function compterHashtags(texte) {
  return (String(texte).match(/#[\p{L}\p{N}_]+/gu) || []).length;
}

/* Le texte réellement envoyé à X : la citation se place EN FIN de texte, c'est
   ce qui fait de X un post cité (nos meilleurs chiffres viennent de là). */
export function texteX(post) {
  const t = post.twitter.texte.trim();
  return post.twitter.citation ? `${t}\n\n${post.twitter.citation}` : t;
}

export function fichierVisuel(post, reseau) {
  return `semaine/${post.id}-${reseau}.png`;
}

export function urlVisuel(post, reseau) {
  return `${SITE}/assets/social/${fichierVisuel(post, reseau)}`;
}

export function valider(donnees, { maintenant } = {}) {
  const erreurs = [];
  const avertissements = [];
  const err = (post, m) => erreurs.push(`${post ? post.id || '?' : 'fichier'} : ${m}`);

  if (!donnees || typeof donnees !== 'object') return { erreurs: ['fichier illisible'], avertissements };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(donnees.semaine || '')) err(null, '« semaine » doit être une date AAAA-MM-JJ');
  else if (lundiDe(donnees.semaine) !== donnees.semaine) err(null, `« semaine » doit être un lundi (${donnees.semaine})`);
  if (!Array.isArray(donnees.posts) || donnees.posts.length === 0) {
    err(null, 'aucun post');
    return { erreurs, avertissements };
  }

  const demain = maintenant ? ajouterJours(jourParis(maintenant), 1) : null;
  const vus = new Set();

  for (const post of donnees.posts) {
    if (!post.id) { err(post, 'identifiant manquant'); continue; }
    if (vus.has(post.id)) err(post, 'identifiant en double');
    vus.add(post.id);

    if (!PILIERS[post.pilier]) err(post, `pilier inconnu « ${post.pilier} »`);
    if (!LICENCES.includes(post.licence)) err(post, `licence inconnue « ${post.licence} »`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(post.jour || '')) { err(post, 'jour invalide'); continue; }
    if (post.id !== `${post.jour}-${post.pilier}`) err(post, `l'identifiant doit valoir « ${post.jour}-${post.pilier} »`);
    if (donnees.semaine && (post.jour < donnees.semaine || post.jour > ajouterJours(donnees.semaine, 6))) {
      err(post, `le jour ${post.jour} sort de la semaine du ${donnees.semaine}`);
    }
    const deja = post.buffer && post.buffer.twitter && post.buffer.instagram;
    if (demain && !deja && post.jour < demain) err(post, `le jour ${post.jour} n'est plus assez loin pour être validé dans Buffer`);

    const x = post.twitter;
    const ig = post.instagram;
    if (!x || !x.texte) err(post, 'texte X manquant');
    if (!ig || !ig.texte) err(post, 'texte Instagram manquant');

    if (x && x.texte) {
      if (poidsX(texteX(post)) > MAX_X) err(post, `texte X trop long (${poidsX(texteX(post))} sur ${MAX_X})`);
      if (compterHashtags(x.texte) > 2) err(post, 'X : 2 hashtags au maximum');
      if (x.citation && !RE_CITATION.test(x.citation)) err(post, 'citation X : lien x.com/<compte>/status/<id> attendu');
    }
    if (ig && ig.texte) {
      if (ig.texte.length > MAX_INSTAGRAM) err(post, `texte Instagram trop long (${ig.texte.length} sur ${MAX_INSTAGRAM})`);
      if (compterHashtags(ig.texte) > 5) err(post, 'Instagram : 5 hashtags au maximum');
      if (/https?:\/\//.test(ig.texte)) err(post, 'Instagram : aucun lien dans la légende (il n\'est pas cliquable), écrire « lien du site en bio »');
    }

    const tout = `${x ? x.texte : ''}\n${ig ? ig.texte : ''}`;
    if (/[\u2014\u2013]/.test(tout)) err(post, 'tiret long interdit (virgule, deux-points ou parenthèses à la place)');

    /* Règle de Julian (22/09/2026) : un chiffre n'entre que s'il a été lu à sa
       source et attribué. Un prix ou un pourcentage sans source est refusé. */
    const sources = Array.isArray(post.sources) ? post.sources.filter((s) => /^https?:\/\//.test(s)) : [];
    /* « 100 % TCG » est dans la signature de la marque, pas un pourcentage. */
    const sansSignature = tout.replace(/100\s*%\s*TCG/gi, '');
    if ((/[€$%]/.test(sansSignature) || post.pilier === 'cote') && sources.length === 0) {
      err(post, 'prix, pourcentage ou cote sans « sources » (liens lus en entier)');
    }

    if (!post.visuel) {
      err(post, 'visuel manquant (Instagram exige une image)');
    } else {
      try { verifierSpec(post.visuel); } catch (e) { err(post, e.message); }
      if (post.visuel.type === 'photo' && post.visuel.credit) {
        const cr = String(post.visuel.credit).replace(/^@/, '').toLowerCase();
        if (!tout.toLowerCase().includes(cr)) err(post, `photo de ${post.visuel.credit} : le crédit doit aussi figurer dans le texte du post`);
      }
    }
  }
  return { erreurs, avertissements };
}

/* Ce qui doit partir dans Buffer pour un post et un réseau. */
export function construireEnvoi(post, reseau, dueAt) {
  const alt = `Cards-Trading : ${post.visuel.titre || post.visuel.credit || post.pilier}`;
  if (reseau === 'twitter') {
    return { texte: texteX(post), image: urlVisuel(post, reseau), alt, dueAt, metadata: undefined };
  }
  return {
    texte: post.instagram.texte.trim(),
    image: urlVisuel(post, reseau),
    alt,
    dueAt,
    metadata: { instagram: { type: 'post', shouldShareToFeed: true } },
  };
}
