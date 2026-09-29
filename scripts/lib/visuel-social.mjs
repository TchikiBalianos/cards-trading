/*
  Visuels des posts éditoriaux, sur la même charte que les vignettes d'articles
  (scripts/lib/charte.mjs) : fond bleu nuit, halo et filet à la couleur du TCG.

  Trois modèles, choisis par `spec.type` :
    texte   titre et sous-titre sur fond de charte (annonces, humour, coulisses)
    carte   scan d'une carte à côté du texte (cotes, révélations)
    photo   image de la communauté ou d'un éditeur, crédit obligatoire

  Deux formats : `twitter` en paysage 1200×675 (la timeline X rogne un carré),
  `instagram` en portrait 1080×1350 (le format qui occupe le plus d'écran).
*/

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { FOND, ETIQUETTES, accentDe, echapper, decouper } from './charte.mjs';
import { verifierSpec } from './visuel-spec.mjs';
import { motif, choisirMotif, hachage } from './motifs.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MARQUE = join(RACINE, 'public', 'assets', 'img', 'logo-icon.png');

export const FORMATS = {
  twitter: { largeur: 1200, hauteur: 675, paysage: true },
  instagram: { largeur: 1080, hauteur: 1350, paysage: false },
};

const POLICE = 'Arial, Helvetica, sans-serif';
const SAUT = '\n  ';

export function etiquetteDe(spec, licence) {
  if (spec.etiquette) return spec.etiquette;
  return ETIQUETTES[licence] || (licence === 'mixte' ? 'Cards-Trading' : '');
}

async function telecharger(url) {
  const rep = await fetch(url, { headers: { 'User-Agent': 'Cards-Trading-Social/1.0' } });
  if (!rep.ok) throw new Error(`Image introuvable (${rep.status}) : ${url}`);
  return Buffer.from(await rep.arrayBuffer());
}

/* En-tête commun : marque et nom, posés en haut à gauche. */
async function enTete(L, H, marge) {
  const marque = await sharp(MARQUE)
    .extract({ left: 23, top: 53, width: 360, height: 407 })
    .resize({ height: Math.round(H * 0.085) })
    .toBuffer();
  const svg = `<text x="${marge + Math.round(H * 0.113)}" y="${Math.round(H * 0.122)}"
        font-family="${POLICE}" font-size="${Math.round(H * 0.037)}"
        font-weight="700" fill="#ffffff" letter-spacing="1">Cards-Trading</text>`;
  return { marque, svg, posMarque: { left: marge, top: Math.round(H * 0.057) } };
}

/* Deux posts au titre différent n'ont ni la même famille de motif ni le même dessin. */
function dessinPour(spec, accent, L, H) {
  const graine = hachage(spec.titre || spec.credit || 'cards-trading');
  return motif(choisirMotif(graine), { graine, accent, largeur: L, hauteur: H });
}

function pastille(x, y, H, accent, libelle, tailleRef) {
  if (!libelle) return '';
  const largeur = Math.round(18 + libelle.length * (tailleRef * 0.32));
  return `<rect x="${x}" y="${y}" width="${largeur}" height="${Math.round(H * 0.05)}"
        rx="${Math.round(H * 0.025)}" fill="${accent}" fill-opacity="0.18"
        stroke="${accent}" stroke-opacity="0.55"/>
  <text x="${x + largeur / 2}" y="${y + Math.round(H * 0.033)}" text-anchor="middle"
        font-family="${POLICE}" font-size="${Math.round(H * 0.024)}" font-weight="700"
        fill="${accent}" letter-spacing="1">${echapper(libelle.toUpperCase())}</text>`;
}

/* Le titre pilote la taille : un titre long descend d'un cran plutôt que de
   déborder ou de partir sur six lignes. */
function titrer(texte, H, largeur, maxLignes, echelle) {
  const paliers = [0.058, 0.048, 0.041, 0.035].map((r) => Math.round(H * r * echelle));
  let taille = paliers[0];
  let lignes = decouper(texte, taille, largeur);
  for (const p of paliers.slice(1)) {
    if (lignes.length <= maxLignes) break;
    taille = p;
    lignes = decouper(texte, taille, largeur);
  }
  return { taille, lignes: lignes.slice(0, maxLignes) };
}

function bloc(lignes, x, yDepart, taille, interligne, extra) {
  return lignes.map((l, i) => `<text x="${x}" y="${yDepart + i * interligne}"
        font-family="${POLICE}" font-size="${taille}" ${extra}>${echapper(l)}</text>`).join(SAUT);
}

function fondEtHalo(L, H, accent, cx = '78%', cy = '18%', dessin = '') {
  return `<defs>
    <radialGradient id="halo" cx="${cx}" cy="${cy}" r="62%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.34"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="filet" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${accent}"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${L}" height="${H}" fill="${FOND}"/>
  ${dessin}
  <rect width="${L}" height="${H}" fill="url(#halo)"/>`;
}

function pied(marge, H, L, largeurFiletRatio = 0.35) {
  const haut = Math.round(H * 0.86);
  return `<rect x="${marge}" y="${haut}" width="${Math.round(L * largeurFiletRatio)}" height="4" rx="2" fill="url(#filet)"/>
  <text x="${marge}" y="${haut + Math.round(H * 0.062)}" font-family="${POLICE}"
        font-size="${Math.round(H * 0.028)}" fill="#ffffff" fill-opacity="0.62">cards-trading.com</text>`;
}

/* ── Modèle « texte » ──────────────────────────────────────── */

async function modeleTexte(spec, licence, format) {
  const { largeur: L, hauteur: H, paysage } = format;
  const accent = accentDe(licence);
  const marge = Math.round(L * 0.083);
  const utile = L - marge * 2;
  const echelle = paysage ? 1.45 : 1;

  const { taille, lignes } = titrer(spec.titre, H, utile, paysage ? 4 : 6, echelle);
  const interligne = Math.round(taille * 1.25);
  const hautTitre = Math.round(H * (paysage ? 0.4 : 0.34)) + taille;
  const basTitre = hautTitre + (lignes.length - 1) * interligne;

  const tailleSous = Math.round(H * (paysage ? 0.04 : 0.028));
  const sous = decouper(spec.sous_titre || '', tailleSous, utile, 0.5).slice(0, paysage ? 2 : 5);
  const hautSous = basTitre + Math.round(H * (paysage ? 0.09 : 0.06));
  const t = await enTete(L, H, marge);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}">
  ${fondEtHalo(L, H, accent, '78%', '18%', dessinPour(spec, accent, L, H))}
  ${t.svg}
  ${pastille(marge, Math.round(H * (paysage ? 0.235 : 0.21)), H, accent, etiquetteDe(spec, licence), taille)}
  ${bloc(lignes, marge, hautTitre, taille, interligne, 'font-weight="700" fill="#ffffff"')}
  ${bloc(sous, marge, hautSous, tailleSous, Math.round(tailleSous * 1.45), 'fill="#ffffff" fill-opacity="0.66"')}
  ${pied(marge, H, L)}
</svg>`;

  return sharp(Buffer.from(svg)).composite([{ input: t.marque, ...t.posMarque }]);
}

/* ── Modèle « carte » ──────────────────────────────────────── */

async function modeleCarte(spec, licence, format) {
  const { largeur: L, hauteur: H, paysage } = format;
  const accent = accentDe(licence);
  const marge = Math.round(L * 0.083);

  /* Scan recadré en boîte : les cartes ont un ratio fixe, on ne le déforme
     jamais, on fixe la hauteur et la largeur suit. */
  const hCarte = Math.round(H * (paysage ? 0.66 : 0.44));
  const scan = await sharp(await telecharger(spec.image)).resize({ height: hCarte }).png().toBuffer();
  const meta = await sharp(scan).metadata();

  const xCarte = paysage ? marge : Math.round((L - meta.width) / 2);
  const yCarte = Math.round(H * 0.2);

  const xTexte = paysage ? xCarte + meta.width + Math.round(L * 0.06) : marge;
  const utile = L - xTexte - marge;
  const { taille, lignes } = titrer(spec.titre, H, utile, paysage ? 4 : 3, paysage ? 1.1 : 0.85);
  const interligne = Math.round(taille * 1.25);
  const hautTitre = paysage ? Math.round(H * 0.36) + taille : yCarte + hCarte + Math.round(H * 0.075);

  const tailleSous = Math.round(H * (paysage ? 0.04 : 0.026));
  const sous = decouper(spec.sous_titre || '', tailleSous, utile, 0.5).slice(0, paysage ? 3 : 2);
  const hautSous = hautTitre + (lignes.length - 1) * interligne + Math.round(H * (paysage ? 0.08 : 0.05));
  const t = await enTete(L, H, marge);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}">
  ${fondEtHalo(L, H, accent, paysage ? '30%' : '50%', '45%', dessinPour(spec, accent, L, H))}
  ${t.svg}
  ${paysage ? pastille(xTexte, Math.round(H * 0.25), H, accent, etiquetteDe(spec, licence), taille) : ''}
  ${bloc(lignes, xTexte, hautTitre, taille, interligne, 'font-weight="700" fill="#ffffff"')}
  ${bloc(sous, xTexte, hautSous, tailleSous, Math.round(tailleSous * 1.45), 'fill="#ffffff" fill-opacity="0.66"')}
  ${pied(marge, H, L, 0.3)}
</svg>`;

  return sharp(Buffer.from(svg)).composite([
    { input: t.marque, ...t.posMarque },
    { input: scan, left: xCarte, top: yCarte },
  ]);
}

/* ── Modèle « photo » ──────────────────────────────────────── */

async function modelePhoto(spec, licence, format) {
  const { largeur: L, hauteur: H } = format;
  const accent = accentDe(licence);
  const marge = Math.round(L * 0.05);
  if (!spec.credit) throw new Error('Visuel photo sans crédit : refusé (règle : toujours créditer).');

  /* Une photo de la communauté peut avoir n'importe quel ratio. Recadrer d'office
     coupe les visages ou la carte : on garde l'image ENTIÈRE, posée sur une
     version floutée d'elle-même qui remplit le cadre. */
  const source = await telecharger(spec.image);
  const arriere = await sharp(source).resize(L, H, { fit: 'cover' }).modulate({ brightness: 0.45 }).blur(24).toBuffer();
  const devant = await sharp(source).resize(L, Math.round(H * 0.84), { fit: 'inside' }).toBuffer();
  const fond = await sharp(arriere).composite([{ input: devant, gravity: 'north' }]).png().toBuffer();

  const bande = Math.round(H * 0.16);
  const tailleCredit = Math.round(H * (format.paysage ? 0.04 : 0.026));
  const legende = spec.titre
    ? decouper(spec.titre, tailleCredit * 1.15, L - marge * 2).slice(0, 2)
    : [];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}">
  <defs>
    <linearGradient id="voile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${FOND}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${FOND}" stop-opacity="0.92"/>
    </linearGradient>
  </defs>
  <rect y="${H - bande * 2}" width="${L}" height="${bande * 2}" fill="url(#voile)"/>
  <rect x="${marge}" y="${H - bande + 4}" width="${Math.round(L * 0.12)}" height="4" rx="2" fill="${accent}"/>
  ${bloc(legende, marge, H - bande + Math.round(tailleCredit * 1.9), Math.round(tailleCredit * 1.15), Math.round(tailleCredit * 1.4), 'font-weight="700" fill="#ffffff"')}
  <text x="${marge}" y="${H - Math.round(bande * 0.2)}" font-family="${POLICE}"
        font-size="${tailleCredit}" fill="#ffffff" fill-opacity="0.78">Photo : ${echapper(spec.credit)}</text>
  <text x="${L - marge}" y="${H - Math.round(bande * 0.2)}" text-anchor="end" font-family="${POLICE}"
        font-size="${tailleCredit}" font-weight="700" fill="#ffffff" fill-opacity="0.9">cards-trading.com</text>
</svg>`;

  return sharp(fond).composite([{ input: Buffer.from(svg) }]);
}

/* ── Point d'entrée ────────────────────────────────────────── */

const MODELES = { texte: modeleTexte, carte: modeleCarte, photo: modelePhoto };

/* Renvoie le PNG en mémoire ; l'appelant décide où l'écrire. */
export async function genererVisuel(spec, licence, reseau) {
  verifierSpec(spec);
  const format = FORMATS[reseau];
  if (!format) throw new Error(`Réseau inconnu : ${reseau}`);
  const image = await MODELES[spec.type](spec, licence, format);
  return image.png({ compressionLevel: 9 }).toBuffer();
}
