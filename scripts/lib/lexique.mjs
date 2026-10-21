/*
  Lexique des raretés Pokémon (Julian, 18/10/2026) : les fans français disent
  AR (une étoile dorée), ALT (deux) et GOLD (trois), pas les noms officiels que
  renvoie TCGdex. Partagé par la validation des posts (brouillons.mjs, bloquant)
  et la relecture des articles (article.mjs, simple point de vigilance).
*/

const LEXIQUE_RARETES = [
  [/special\s+illustration\s+rare|illustration\s+sp[ée]ciale\s+rare/i, 'ALT (deux étoiles dorées)'],
  [/hyper\s+rare/i, 'GOLD (trois étoiles dorées)'],
  [/illustration\s+rare/i, 'AR (une étoile dorée)'],
];

/* `explicationsPermises` : dans un article, le nom officiel peut suivre le terme
   des fans entre parenthèses (« ALT (illustration spéciale rare) ») pour le
   lecteur qui le cherche. Un post, trop court pour ça, n'y a pas droit. */
export function ecartsDeLexique(texte, { explicationsPermises = false } = {}) {
  const t = explicationsPermises ? String(texte).replace(/\b(AR|ALT|GOLD)\b\**\s*\([^)]*\)/g, '') : String(texte);
  return LEXIQUE_RARETES
    .filter(([re]) => re.test(t))
    .map(([re, terme]) => `« ${t.match(re)[0]} » s'écrit ${terme}`);
}
