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
import { ecartsDeLexique } from './lexique.mjs';

export const LICENCES = ['pokemon', 'one-piece', 'mixte'];
export const SITE = 'https://cards-trading.com';
const MAX_X = 280;
const MAX_INSTAGRAM = 2200;
const RE_CITATION = /^https:\/\/(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/status\/\d+/;

/* Poids d'un texte selon les règles de X (twitter-text) : un lien pèse 23 ; un caractère
   pèse 1 de U+0000 à U+10FF, de U+2000 à U+200D, de U+2010 à U+201F et de U+2032 à U+2037,
   et 2 partout ailleurs, donc la puce « • », « … », « € », le japonais et les emoji.
   Le 16 novembre 2026, ce décompte ne doublait que les emoji : un post à 279 sur 280 avec
   trois puces pesait 282 pour X, et Buffer l'a refusé à la programmation.
   Les emoji restent comptés double même quand X les compterait simple (« © »), et les
   sélecteurs de variation (U+FE0E, U+FE0F) ne comptent pas : ils suivent l'emoji qu'ils
   précisent. Le décompte reste prudent : mieux vaut refuser un texte limite que voir Buffer
   rejeter le post au moment de le programmer. */
const POIDS_UN = [[0x0000, 0x10ff], [0x2000, 0x200d], [0x2010, 0x201f], [0x2032, 0x2037]];
export function poidsX(texte) {
  const sansLien = String(texte).normalize('NFC').replace(/https?:\/\/\S+/g, ' '.repeat(23));
  let p = 0;
  for (const c of sansLien) {
    const cp = c.codePointAt(0);
    if (cp === 0xfe0e || cp === 0xfe0f) continue;
    const simple = POIDS_UN.some(([debut, fin]) => cp >= debut && cp <= fin) && !/\p{Extended_Pictographic}/u.test(c);
    p += simple ? 1 : 2;
  }
  return p;
}

export function compterHashtags(texte) {
  return (String(texte).match(/#[\p{L}\p{N}_]+/gu) || []).length;
}

/* Une phrase par ligne (demande de Julian, 18/10/2026) : une majuscule qui suit
   un point, un point d'exclamation ou d'interrogation, ou des points de
   suspension, éventuellement suivis d'emojis, passe à la ligne. Un emoji en
   fin de phrase (« Dis-le en commentaire 👇 Et… ») vaut fin de phrase, sauf en
   début de ligne (« 📅 Alabasta »). Prudent par construction : un numéro de
   liste (« 1. Dracaufeu »), une abréviation suivie d'une minuscule (« K.O. les »)
   et un guillemet fermant (« pour voir. » ») restent sur leur ligne, tout comme
   les marques qui finissent par un point d'exclamation (« Play! Pokémon Stores »
   a été coupé en deux le 21/10/2026). Une espace devient un saut de ligne : le
   poids X ne change pas. */
const ESPACES = '[ \\t\\u00a0\\u202f]+';
const EMOJIS = '(?:\\p{Extended_Pictographic}[\\p{Extended_Pictographic}\\u200d\\ufe0f\\p{Emoji_Modifier}]*)';
const MARQUES_EXCLAMATIVES = '(?<!Play|Yu-Gi-Oh|DON|DON!)';
const RE_FIN_PHRASE = new RegExp(`(?<!(?:^|\\n)[ \\t]*\\d{1,3})${MARQUES_EXCLAMATIVES}([.!?…](?:${ESPACES}${EMOJIS})*)${ESPACES}(?=[\\p{Lu}«])`, 'gu');
const RE_FIN_EMOJI = new RegExp(`(?<=\\S${ESPACES})(${EMOJIS}(?:${ESPACES}${EMOJIS})*)${ESPACES}(?=[\\p{Lu}«])`, 'gu');

export function unePhraseParLigne(texte) {
  return String(texte).replace(RE_FIN_PHRASE, '$1\n').replace(RE_FIN_EMOJI, '$1\n');
}

/* Le texte réellement envoyé à X : la citation se place EN FIN de texte, c'est
   ce qui fait de X un post cité (nos meilleurs chiffres viennent de là). */
export function texteX(post) {
  const t = unePhraseParLigne(post.twitter.texte.trim());
  return post.twitter.citation ? `${t}\n\n${post.twitter.citation}` : t;
}

export function texteInstagram(post) {
  return unePhraseParLigne(post.instagram.texte.trim());
}

/* Facebook (ajouté le 23/10/2026) reprend la légende Instagram : même public de
   fil, même longueur. Seule différence, un lien y est cliquable : « lien du site
   en bio » devient le lien lui-même. */
export function texteFacebook(post) {
  return texteInstagram(post).replace(/lien du site en bio\s*🔗?/gi, `👉 ${SITE}`);
}

/* Facebook affiche le visuel portrait d'Instagram. Un visuel refait après
   publication porte `visuel.version` : l'image change d'URL (`-v2`), seule façon
   de passer le cache immuable d'un an de /assets/. */
export function fichierVisuel(post, reseau) {
  const format = reseau === 'facebook' ? 'instagram' : reseau;
  const version = post.visuel && post.visuel.version > 1 ? `-v${post.visuel.version}` : '';
  return `semaine/${post.id}${version}-${format}.png`;
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
    const visible = `${tout}\n${post.visuel ? `${post.visuel.titre || ''}\n${post.visuel.sous_titre || ''}` : ''}`;
    for (const e of ecartsDeLexique(visible)) err(post, `lexique : ${e}`);

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
      /* Le crédit d'une photo se porte sur le visuel (verifierSpec l'exige), jamais
         dans la légende : consigne de Julian du 23/10/2026. */
      try { verifierSpec(post.visuel); } catch (e) { err(post, e.message); }
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
  if (reseau === 'facebook') {
    return { texte: texteFacebook(post), image: urlVisuel(post, reseau), alt, dueAt, metadata: { facebook: { type: 'post' } } };
  }
  return {
    texte: texteInstagram(post),
    image: urlVisuel(post, reseau),
    alt,
    dueAt,
    metadata: { instagram: { type: 'post', shouldShareToFeed: true } },
  };
}
