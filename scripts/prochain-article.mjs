#!/usr/bin/env node
/**
 * Calendrier éditorial du blog Cards-Trading.
 *
 * Règle demandée :
 *  - 1 à 2 articles par semaine
 *  - le 1er article de la semaine ALTERNE Pokémon / One Piece
 *    → 2 Pokémon et 2 One Piece par mois
 *  - le 2e article tourne sur les autres TCG
 *
 * Déterministe : la même semaine donne toujours le même résultat, quel que
 * soit le moment où on lance le script. Aucun état à stocker.
 *
 *   node scripts/prochain-article.mjs           → semaine courante
 *   node scripts/prochain-article.mjs 8         → les 8 prochaines semaines
 */

import { readdirSync, readFileSync } from 'node:fs';

/* Lundi de référence : semaine 0 = Pokémon. Ne jamais changer cette date,
   sinon toute l'alternance passée et future se décale. */
const REF = Date.UTC(2026, 6, 27); // lundi 27 juillet 2026
const SEMAINE = 604800000;

const AUTRES = ['magic', 'yugioh', 'lorcana', 'dragon-ball', 'star-wars'];

const LIBELLE = {
  pokemon: 'Pokémon', 'one-piece': 'One Piece', magic: 'Magic: The Gathering',
  yugioh: 'Yu-Gi-Oh!', lorcana: 'Lorcana', 'dragon-ball': 'Dragon Ball',
  'star-wars': 'Star Wars',
};

function lundiDe(d) {
  const t = new Date(d);
  const j = (t.getUTCDay() + 6) % 7; // 0 = lundi
  return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - j);
}

export function semaineNo(date = new Date()) {
  return Math.floor((lundiDe(date) - REF) / SEMAINE);
}

/* Modulo toujours positif : sans ça, une semaine antérieure à la référence
   donne un index négatif et casse la rotation. */
const mod = (a, b) => ((a % b) + b) % b;

export function planSemaine(n) {
  const ancre = mod(n, 2) === 0 ? 'pokemon' : 'one-piece';
  const secondaire = AUTRES[mod(n, AUTRES.length)];
  const lundi = new Date(REF + n * SEMAINE);
  return {
    semaine: n,
    lundi: lundi.toISOString().slice(0, 10),
    articles: [
      { jour: 'mardi', categorie: ancre, libelle: LIBELLE[ancre], statut: 'obligatoire' },
      { jour: 'vendredi', categorie: secondaire, libelle: LIBELLE[secondaire], statut: 'optionnel' },
    ],
  };
}

/* Ce qui existe déjà, pour éviter les doublons de sujet */
function dejaPublies() {
  try {
    return readdirSync('src/content/blog')
      .filter((f) => f.endsWith('.md'))
      .map((f) => {
        const t = readFileSync(`src/content/blog/${f}`, 'utf8');
        return {
          fichier: f,
          categorie: (t.match(/^category:\s*"?([^"\n]+)"?/m) || [])[1],
          date: (t.match(/^pubDate:\s*([0-9-]+)/m) || [])[1],
        };
      });
  } catch { return []; }
}

const n = Number(process.argv[2]) || 1;
const debut = semaineNo();

console.log('\n  CALENDRIER ÉDITORIAL — blog Cards-Trading\n');
for (let i = 0; i < n; i++) {
  const p = planSemaine(debut + i);
  const [a1, a2] = p.articles;
  console.log(`  Semaine du ${p.lundi}`);
  console.log(`    ${a1.jour.padEnd(9)} ${a1.libelle.padEnd(22)} (${a1.statut})`);
  console.log(`    ${a2.jour.padEnd(9)} ${a2.libelle.padEnd(22)} (${a2.statut})\n`);
}

const pub = dejaPublies();
if (pub.length) {
  const parCat = {};
  pub.forEach((p) => { parCat[p.categorie] = (parCat[p.categorie] || 0) + 1; });
  console.log('  Déjà publié : ' + Object.entries(parCat).map(([c, v]) => `${c}×${v}`).join(', ') + '\n');
}
