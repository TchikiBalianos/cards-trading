/**
 * Génère les vignettes sociales de chaque article de blog.
 *
 * Instagram et TikTok REFUSENT les posts sans média (vérifié via l'API
 * Buffer), et le `heroImage` des articles n'est qu'un logo de TCG :
 * insuffisant. Deux formats sont produits :
 *   - 1080×1080 pour Instagram et TikTok ;
 *   - 1200×630 pour og:image, format attendu par X et Facebook.
 *
 * Le fond est THÉMATIQUE, généré par Pollinations.ai selon le TCG de
 * l'article (sans clé, licence MIT, usage commercial permis). Le texte,
 * lui, reste vectoriel et posé par-dessus : un modèle génératif rend mal
 * une typographie et invente des logos — constaté.
 *
 * ⚠️ Le fond est un CONFORT, jamais une dépendance. Toute panne, lenteur
 * ou limite de débit retombe sur un dégradé déterministe et la vignette
 * est produite quand même. Éprouvé en conditions réelles : une série de
 * HTTP 429 a fait basculer les 7 articles sur le dégradé, sans qu'aucune
 * vignette ne manque.
 *
 *   node scripts/vignettes-sociales.mjs            # ne génère que le manquant
 *   node scripts/vignettes-sociales.mjs --force    # tout régénérer
 *   node scripts/vignettes-sociales.mjs --sans-ia  # dégradé seul, hors ligne
 *
 * Sortie : public/assets/social/<slug>[-og].png, servi en URL publique —
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

/*
  Deux formats, un seul dessin.

  - carré 1080×1080 pour Instagram et TikTok ;
  - paysage 1200×630 pour og:image, format attendu par X et Facebook.
    Un carré y serait rogné au centre, coupant le titre.

  Les positions sont proportionnelles à la toile plutôt que codées en dur,
  sans quoi la version paysage déborderait par le bas.
*/
/* Séparateur des lignes de <text> dans le SVG. Sorti en constante et
   construit sans échappement : imbriqué dans un gabarit littéral, un
   saut de ligne échappé se lit mal et se casse au moindre outil qui
   retouche le fichier. */
const SAUT = String.fromCharCode(10) + '  ';

const FORMATS = [
  { suffixe: '', largeur: 1080, hauteur: 1080, maxLignesTitre: 5, maxLignesChapo: 3 },
  { suffixe: '-og', largeur: 1200, hauteur: 630, maxLignesTitre: 3, maxLignesChapo: 2 },
];

/* ── Fond thématique généré ────────────────────────────────
   Pollinations.ai : sans clé, licence MIT donc usage commercial permis,
   1 requête / 15 s sur le palier anonyme. Vérifié le 20 août 2026. */

const SANS_IA = process.argv.includes('--sans-ia');

/*
  Une ambiance par TCG. Volontairement SANS personnage ni carte : les
  marques Pokémon, Bandai et consorts ne doivent pas être imitées, et un
  modèle génératif rend mal un personnage identifiable de toute façon.

  Consigne « no text, no letters » systématique — le texte est posé en
  vectoriel par-dessus. Un premier essai sans cette séparation avait
  produit une forme pseudo-logo malgré la consigne.
*/
const AMBIANCES = {
  pokemon: 'lush green forest clearing at dawn, warm golden light through leaves, misty',
  'one-piece': 'vast ocean horizon at sunset, tall waves, warm orange and deep blue sky',
  magic: 'ancient stone library, arcane purple glow, floating dust, candlelight',
  yugioh: 'egyptian sandstone temple interior, golden torchlight, deep shadows',
  lorcana: 'enchanted castle hall, soft teal and gold light, sparkling motes',
  'dragon-ball': 'desert canyon under an orange sky, energy shockwave, dramatic light',
  'star-wars': 'deep space nebula, distant stars, cold blue and violet',
  guide: 'clean abstract geometry, deep navy and electric blue, soft light rays',
  actualite: 'clean abstract geometry, deep navy and electric blue, soft light rays',
  strategie: 'clean abstract geometry, deep navy and electric blue, soft light rays',
};

/*
  Le fond est un CONFORT, jamais une dépendance : toute panne, lenteur ou
  réponse inattendue retombe sur le dégradé déterministe. Une chaîne de
  publication ne doit pas devenir muette parce qu'un service tiers tousse.
*/
/*
  Cadence imposée par le palier anonyme : 1 requête toutes les 15 s.
  Générer les 7 articles d'affilée déclenche un HTTP 429 dès le deuxième —
  constaté. On attend donc entre deux appels, sauf pour le premier.

  En usage normal c'est invisible : 1 à 2 nouveaux articles par semaine.
  Seule une régénération complète (--force) prend quelques minutes.
*/
const PAUSE_POLLINATIONS_MS = 16000;
let dernierAppel = 0;

async function fondThematique(categorie, graine) {
  if (SANS_IA) return null;

  const attente = PAUSE_POLLINATIONS_MS - (Date.now() - dernierAppel);
  if (dernierAppel && attente > 0) {
    await new Promise((r) => setTimeout(r, attente));
  }
  dernierAppel = Date.now();
  const ambiance = AMBIANCES[categorie] || AMBIANCES.guide;
  const invite = encodeURIComponent(
    `${ambiance}, cinematic, atmospheric, no text, no letters, no logo, no people, no characters, no cards`
  );
  const url =
    `https://image.pollinations.ai/prompt/${invite}` +
    `?width=1400&height=1400&nologo=true&seed=${graine}`;

  /*
    Deux tentatives, 45 s chacune.

    Mesuré : le service met 25 à 28 s à rendre une image, et renvoie
    parfois un 429 immédiat avant de répondre normalement au coup
    suivant. Un délai de 25 s coupait donc des appels qui allaient
    aboutir, et un échec sur 429 abandonnait sans raison.
  */
  for (let essai = 1; essai <= 2; essai++) {
    try {
      const rep = await fetch(url, { signal: AbortSignal.timeout(45000) });
      if (!rep.ok) throw new Error(`HTTP ${rep.status}`);
      const buf = Buffer.from(await rep.arrayBuffer());
      /* Une réponse minuscule est une page d'erreur, pas une image. */
      if (buf.length < 5000) throw new Error(`réponse de ${buf.length} octets`);
      return buf;
    } catch (e) {
      if (essai === 1) {
        await new Promise((r) => setTimeout(r, PAUSE_POLLINATIONS_MS));
        continue;
      }
      console.warn(`   ⚠️  fond IA indisponible (${e.message}), dégradé déterministe.`);
      return null;
    }
  }
  return null;
}

/* Graine dérivée du slug : la même vignette régénérée donne le même fond,
   deux articles différents en donnent deux. Sans ça, chaque exécution
   produirait une image différente pour un contenu identique. */
function graineDe(slug) {
  let h = 0;
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) % 100000;
  return h;
}

async function vignette(slug, fm, format, fond) {
  const { largeur: L, hauteur: H, suffixe, maxLignesTitre, maxLignesChapo } = format;
  const categorie = ETIQUETTES[fm.category] || fm.category || '';

  const marge = Math.round(L * 0.083);
  const utile = L - marge * 2;

  /* Le titre pilote la taille : un titre long descend d'un cran plutôt
     que de déborder ou de partir sur six lignes. */
  const paliers = [0.058, 0.048, 0.041, 0.035].map((r) => Math.round(H * r));
  let taille = paliers[0];
  let lignes = decouper(fm.title, taille, utile);
  for (const p of paliers.slice(1)) {
    if (lignes.length <= maxLignesTitre) break;
    taille = p;
    lignes = decouper(fm.title, taille, utile);
  }
  lignes = lignes.slice(0, maxLignesTitre);

  const interligne = Math.round(taille * 1.25);
  const hautTitre = Math.round(H * 0.34) + taille;

  /* Le chapô occupe le bas, resté vide dans la première version : le bloc
     de titre s'arrêtait bien avant le filet. */
  const basTitre = hautTitre + (lignes.length - 1) * interligne;
  const tailleChapo = Math.round(H * 0.028);
  const chapo = decouper(fm.description || '', tailleChapo, utile, 0.5).slice(0, maxLignesChapo);
  const hautChapo = basTitre + Math.round(H * 0.06);

  const largeurPastille = Math.round(18 + categorie.length * (taille * 0.32));
  const hautPastille = Math.round(H * 0.21);
  const hautPied = Math.round(H * 0.86);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}">
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

  <rect width="${L}" height="${H}" fill="${FOND}" fill-opacity="${fond ? 0.62 : 1}"/>
  <rect width="${L}" height="${H}" fill="url(#halo)" fill-opacity="${fond ? 0.5 : 1}"/>

  <text x="${marge + Math.round(H * 0.113)}" y="${Math.round(H * 0.122)}"
        font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(H * 0.037)}"
        font-weight="700" fill="#ffffff" letter-spacing="1">Cards-Trading</text>

  <rect x="${marge}" y="${hautPastille}" width="${largeurPastille}" height="${Math.round(H * 0.05)}"
        rx="${Math.round(H * 0.025)}" fill="${BLEU}" fill-opacity="0.18"
        stroke="${BLEU}" stroke-opacity="0.55"/>
  <text x="${marge + largeurPastille / 2}" y="${hautPastille + Math.round(H * 0.033)}"
        text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
        font-size="${Math.round(H * 0.024)}" font-weight="700" fill="${BLEU}"
        letter-spacing="1">${echapper(categorie.toUpperCase())}</text>

  ${lignes.map((l, i) => `<text x="${marge}" y="${hautTitre + i * interligne}"
        font-family="Arial, Helvetica, sans-serif" font-size="${taille}"
        font-weight="700" fill="#ffffff">${echapper(l)}</text>`).join(SAUT)}

  ${chapo.map((l, i) => `<text x="${marge}" y="${hautChapo + i * Math.round(tailleChapo * 1.45)}"
        font-family="Arial, Helvetica, sans-serif" font-size="${tailleChapo}"
        fill="#ffffff" fill-opacity="0.66">${echapper(l)}</text>`).join(SAUT)}

  <rect x="${marge}" y="${hautPied}" width="${Math.round(L * 0.35)}" height="4" rx="2" fill="url(#filet)"/>
  <text x="${marge}" y="${hautPied + Math.round(H * 0.062)}"
        font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(H * 0.028)}"
        fill="#ffffff" fill-opacity="0.62">cards-trading.com</text>
</svg>`;

  /* Marque cadrée comme pour les logos sociaux : logo-icon.png porte une
     marge transparente qui, prise telle quelle, laissait un fragment du
     « C » détaché à droite. Mêmes coordonnées que dans CLAUDE.md. */
  const marque = await sharp(MARQUE)
    .extract({ left: 23, top: 53, width: 360, height: 407 })
    .resize({ height: Math.round(H * 0.085) })
    .toBuffer();

  /*
    Le fond généré sert de socle, le SVG et la marque se posent dessus.
    Recadrage explicite : Pollinations renvoie des dimensions APPROXIMATIVES
    (1400 demandé, autre chose reçu). Léger flou et assombrissement pour que
    le texte reste lisible quelle que soit l'image produite — on ne contrôle
    pas ce que le modèle va rendre.
  */
  const socle = fond
    ? await sharp(fond)
        .resize(L, H, { fit: 'cover', position: 'centre' })
        .modulate({ brightness: 0.62 })
        .blur(2)
        .toBuffer()
    : null;

  const calques = [{ input: Buffer.from(svg) }, { input: marque, left: marge, top: Math.round(H * 0.057) }];

  await (socle ? sharp(socle) : sharp(Buffer.from(svg)))
    .composite(socle ? calques : [calques[1]])
    .png({ compressionLevel: 9 })
    .toFile(join(SORTIE, `${slug}${suffixe}.png`));
}

/* ── Exécution ─────────────────────────────────────────── */

mkdirSync(SORTIE, { recursive: true });

const articles = readdirSync(DOSSIER_BLOG)
  .filter((f) => /\.mdx?$/.test(f))
  .map((f) => ({ slug: f.replace(/\.mdx?$/, ''), fm: lireFrontmatter(join(DOSSIER_BLOG, f)) }))
  .filter((a) => a.fm && a.fm.draft !== 'true' && a.fm.title);

let faites = 0;
for (const a of articles) {
  const aFaire = FORMATS.filter((fo) => FORCER || !existsSync(join(SORTIE, `${a.slug}${fo.suffixe}.png`)));
  if (aFaire.length === 0) continue;

  /* UN seul appel réseau par article : le même fond sert au carré et au
     paysage, recadré différemment. Deux appels donneraient deux ambiances
     distinctes pour un même article. */
  const fond = await fondThematique(a.fm.category, graineDe(a.slug));

  for (const format of aFaire) {
    await vignette(a.slug, a.fm, format, fond);
    console.log(`✅ ${a.slug}${format.suffixe}.png (${format.largeur}×${format.hauteur})${fond ? '' : ' — dégradé'}`);
    faites++;
  }
}

console.log(
  faites === 0
    ? `Rien à générer (${articles.length} article(s) déjà couverts).`
    : `${faites} vignette(s) générée(s) sur ${articles.length} article(s).`
);
