/**
 * Vérifie que le balisage FAQPage est le MIROIR EXACT de la FAQ visible.
 *
 * Google traite un FAQPage sans contenu correspondant comme du balisage
 * trompeur : la pénalité porte sur la page, pas seulement sur l'extrait.
 * Le risque n'est pas de mal l'écrire au départ, c'est de modifier une
 * réponse dans le HTML en oubliant le JSON-LD, ou l'inverse.
 *
 *   node scripts/verifie-faq.mjs
 *
 * Sortie 0 si les deux concordent, 1 sinon.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(RACINE, 'public', 'index.html'), 'utf8');

/* Le HTML porte des entités et des espaces insécables que le JSON n'a pas.
   On ramène les deux côtés à la même forme avant de comparer, sinon tout
   « 3 % » signale une fausse divergence. */
function normalise(t) {
  return t
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&middot;/g, '·')
    .replace(/\u00a0/g, ' ')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/* ── Côté visible ─────────────────────────────────────────── */
const visibles = [];
const bloc = html.match(/<section class="faq"[\s\S]*?<\/section>/);
if (!bloc) {
  console.error('❌ Section .faq introuvable dans public/index.html');
  process.exit(1);
}
const items = bloc[0].matchAll(
  /<details class="faq-item">\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>/g
);
for (const m of items) visibles.push([normalise(m[1]), normalise(m[2])]);

/* ── Côté balisage ────────────────────────────────────────── */
const script = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
if (!script) {
  console.error('❌ Bloc JSON-LD introuvable');
  process.exit(1);
}
let graphe;
try {
  graphe = JSON.parse(script[1])['@graph'] || [];
} catch (e) {
  console.error(`❌ JSON-LD invalide : ${e.message}`);
  process.exit(1);
}
const noeud = graphe.find((n) => n['@type'] === 'FAQPage');
if (!noeud) {
  console.error('❌ Aucun nœud FAQPage dans le @graph');
  process.exit(1);
}
const balises = noeud.mainEntity.map((q) => [
  normalise(q.name),
  normalise(q.acceptedAnswer.text),
]);

/* ── Comparaison ──────────────────────────────────────────── */
const ecarts = [];
if (visibles.length !== balises.length) {
  ecarts.push(`${visibles.length} question(s) visible(s) contre ${balises.length} balisée(s)`);
}
for (let i = 0; i < Math.max(visibles.length, balises.length); i++) {
  const v = visibles[i];
  const b = balises[i];
  if (!v) { ecarts.push(`#${i + 1} balisée mais absente du HTML : « ${b[0]} »`); continue; }
  if (!b) { ecarts.push(`#${i + 1} visible mais non balisée : « ${v[0]} »`); continue; }
  if (v[0] !== b[0]) ecarts.push(`#${i + 1} question divergente :\n    HTML : ${v[0]}\n    JSON : ${b[0]}`);
  if (v[1] !== b[1]) ecarts.push(`#${i + 1} réponse divergente :\n    HTML : ${v[1]}\n    JSON : ${b[1]}`);
}

if (ecarts.length) {
  console.error('❌ FAQ visible et balisage FAQPage désynchronisés :\n');
  for (const e of ecarts) console.error('  · ' + e);
  console.error('\nCorriger les deux, puis relancer.');
  process.exit(1);
}

console.log(`✅ ${visibles.length} question(s) : le balisage FAQPage reflète exactement la FAQ visible.`);
