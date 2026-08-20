/**
 * Génère une vignette carrée par article de blog, pour Instagram et TikTok.
 *
 * Ces deux réseaux REFUSENT les posts sans média (vérifié via l'API Buffer).
 * Le `heroImage` des articles n'est qu'un logo de TCG : insuffisant. Cette
 * vignette est le repli garanti — déterministe, sans dépendance réseau,
 * sans coût, donc toujours disponible.
 *
 * Un visuel généré par IA donnera mieux, mais ne doit PAS remplacer ce
 * repli : un quota épuisé ou un refus de modération laisserait sinon la
 * chaîne de publication sans image, donc muette. Prévoir l'IA en surcouche,
 * pas en substitution.
 *
 *   node scripts/vignettes-sociales.mjs           # ne régénère que le manquant
 *   node scripts/vignettes-sociales.mjs --force   # tout régénérer
 *
 * Sortie : public/assets/social/<slug>.png (1080×1080), servi ensuite par
 * https://cards-trading.com/assets/social/<slug>.png — une URL publique,
 * ce dont Buffer a besoin pour récupérer le média.
 */

import sharp from 'sharp';
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER_BLOG = join(RACINE, 'src', 'content', 'blog');
const SORTIE = join(RACINE, 'public', 'assets', 'social');
const MARQUE = join(RACINE, 'public', 'assets', 'img', 'logo-icon.png');
const FORCER = process.argv.includes('--force');

const COTE = 1080;
const BLEU = '#2997ff';
const FOND = '#07111f';

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

function lireFrontmatter(chemin) {
  const m = readFileSync(chemin, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const champs = {};
  for (const ligne of m[1].split(/\r?\n/)) {
    const p = ligne.match(/^([a-zA-Z]+):\s*(.*)$/);
    if (p) champs[p[1]] = p[2].trim().replace(/^["']|["']$/g, '');
  }
  return champs;
}

/* XML : cinq caractères doivent être échappés, sinon le SVG est invalide et
   sharp échoue sur un message peu parlant. */
function echapper(texte) {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/*
  Découpe en lignes à partir d'une largeur de caractère ESTIMÉE.

  Pas de mesure réelle : la police disponible diffère entre ma machine et
  l'agent CI, donc une mise en page au pixel près serait fausse ailleurs.
  On vise large (0.54 em par caractère pour du gras) et on laisse de la
  marge — mieux vaut une ligne courte qu'un débordement.
*/
function decouper(texte, taillePolice, largeurMax, facteur = 0.54) {
  const maxCar = Math.floor(largeurMax / (taillePolice * facteur));
  const lignes = [];
  let courante = '';

  /* Typographie française : « mot : suite » place une espace avant les
     deux-points, ce qui en fait un « mot » à part. Le laisser commencer
     une ligne donne « : le set… ». On le recolle au mot précédent. */
  const mots = [];
  for (const mot of texte.split(/\s+/)) {
    if (/^[:;!?»]$/.test(mot) && mots.length) mots[mots.length - 1] += ' ' + mot;
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

async function vignette(slug, fm) {
  const categorie = ETIQUETTES[fm.category] || fm.category || '';

  /* Le titre pilote la taille : un titre long descend d'un cran plutôt
     que de déborder ou de partir sur six lignes. */
  let taille = 62;
  let lignes = decouper(fm.title, taille, 860);
  if (lignes.length > 4) { taille = 52; lignes = decouper(fm.title, taille, 880); }
  if (lignes.length > 5) { taille = 44; lignes = decouper(fm.title, taille, 900); }
  lignes = lignes.slice(0, 6);

  const interligne = Math.round(taille * 1.25);
  const hautTitre = 360;

  /* Le chapô occupe le bas, resté vide dans la première version : le bloc
     de titre s'arrêtait vers 600px et plus rien jusqu'au filet. */
  const basTitre = hautTitre + (lignes.length - 1) * interligne;
  const chapo = decouper(fm.description || '', 30, 880, 0.5).slice(0, 3);
  const hautChapo = basTitre + 64;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${COTE}" height="${COTE}">
  <defs>
    <radialGradient id="halo" cx="78%" cy="18%" r="62%">
      <stop offset="0%" stop-color="${BLEU}" stop-opacity="0.34"/>
      <stop offset="100%" stop-color="${BLEU}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="filet" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${BLEU}"/>
      <stop offset="100%" stop-color="${BLEU}" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="${COTE}" height="${COTE}" fill="${FOND}"/>
  <rect width="${COTE}" height="${COTE}" fill="url(#halo)"/>

  <text x="212" y="132" font-family="Arial, Helvetica, sans-serif" font-size="40"
        font-weight="700" fill="#ffffff" letter-spacing="1">Cards-Trading</text>

  <rect x="90" y="228" width="${18 + categorie.length * 20}" height="54" rx="27"
        fill="${BLEU}" fill-opacity="0.18" stroke="${BLEU}" stroke-opacity="0.55"/>
  <text x="${90 + (18 + categorie.length * 20) / 2}" y="264" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="700"
        fill="${BLEU}" letter-spacing="1">${echapper(categorie.toUpperCase())}</text>

  ${lignes
    .map(
      (l, i) =>
        `<text x="90" y="${hautTitre + i * interligne}" font-family="Arial, Helvetica, sans-serif"
        font-size="${taille}" font-weight="700" fill="#ffffff">${echapper(l)}</text>`
    )
    .join('\n  ')}

  ${chapo
    .map(
      (l, i) =>
        `<text x="90" y="${hautChapo + i * 44}" font-family="Arial, Helvetica, sans-serif"
        font-size="30" fill="#ffffff" fill-opacity="0.66">${echapper(l)}</text>`
    )
    .join('\n  ')}

  <rect x="90" y="905" width="420" height="4" rx="2" fill="url(#filet)"/>
  <text x="90" y="972" font-family="Arial, Helvetica, sans-serif" font-size="30"
        fill="#ffffff" fill-opacity="0.62">cards-trading.com</text>
</svg>`;

  /* Marque cadrée comme pour les logos sociaux : logo-icon.png porte une
     marge transparente qui, prise telle quelle, laissait un fragment du
     « C » détaché à droite. Mêmes coordonnées que dans CLAUDE.md. */
  const marque = await sharp(MARQUE)
    .extract({ left: 23, top: 53, width: 360, height: 407 })
    .resize({ height: 92 })
    .toBuffer();

  await sharp(Buffer.from(svg))
    .composite([{ input: marque, left: 90, top: 62 }])
    .png({ compressionLevel: 9 })
    .toFile(join(SORTIE, `${slug}.png`));
}

/* ── Exécution ─────────────────────────────────────────── */

mkdirSync(SORTIE, { recursive: true });

const articles = readdirSync(DOSSIER_BLOG)
  .filter((f) => /\.mdx?$/.test(f))
  .map((f) => ({ slug: f.replace(/\.mdx?$/, ''), fm: lireFrontmatter(join(DOSSIER_BLOG, f)) }))
  .filter((a) => a.fm && a.fm.draft !== 'true' && a.fm.title);

let faites = 0;
for (const a of articles) {
  const cible = join(SORTIE, `${a.slug}.png`);
  if (!FORCER && existsSync(cible)) continue;
  await vignette(a.slug, a.fm);
  console.log(`✅ ${a.slug}.png`);
  faites++;
}

console.log(
  faites === 0
    ? `Rien à générer (${articles.length} article(s) déjà couverts).`
    : `${faites} vignette(s) générée(s) sur ${articles.length} article(s).`
);
