/*
  Visuel « carte BiP » : les posts Build in Public, présentés comme les cartes
  numérotées d'un set (« Set de base », saison 1).

  DA décidée le 2 octobre 2026 (party mode BMAD, puis Julian) :
    - une carte façon TCG, mais un cadre MAISON : ni bordure jaune, ni symbole
      d'énergie, ni logo d'éditeur. On évoque une carte, on n'en copie aucune ;
    - un numéro dans le set (« 07/20 ») : il compte les posts de la saison,
      jamais l'avancement du MVP (une fraction de fonctionnalités se lirait
      comme un pourcentage de retard) ;
    - trois raretés : commune, erreur (un incident raconté) et holo (un jalon) ;
    - bleu nuit et bleu de marque, rouge réservé aux cartes erreur, aucune
      couleur de licence : le BiP n'appartient à aucun jeu ;
    - dans la fenêtre d'illustration, un gabarit lisible sur téléphone : plan
      (étapes fléchées, avec une « porte » Autoriser / Refuser), bordereau
      (ticket en chasse fixe), avant / après, preuve (une phrase réelle
      recopiée), ou motif. Jamais de capture d'écran brute.
    - jamais de date sur l'image : la carte se publie quand on veut.

  Module PUR : il compose du SVG et ne lit ni fichier ni réseau. Le logo est
  incrusté par visuel-social.mjs, qui appelle svgBip().
*/

import { FOND, BLEU, echapper, decouper } from './charte.mjs';
import { motif, choisirMotif, hachage } from './motifs.mjs';

export const POLICE = 'Arial, Helvetica, sans-serif';
/* DejaVu Sans Mono existe sur le poste ET sur l'agent CI (installée par le
   workflow) : la chasse fixe y fait 0,6 em, la largeur des lignes est connue. */
export const MONO = "'DejaVu Sans Mono', Consolas, monospace";
const LARGEUR_MONO = 0.61;

export const RARETES = ['commune', 'erreur', 'holo'];
export const GABARITS = ['plan', 'bordereau', 'avant-apres', 'preuve', 'motif'];

const ROUGE = '#ff6b6b';
const OR = '#fcd34d';
const TEXTE = '#e8eef8';
const GRIS = '#8fa3c2';
const CORPS = '#0c1728';
const FENETRE = '#0f2038';

/* Plafonds en caractères : au-delà, le texte ne tient plus dans sa zone à la
   taille prévue. On refuse plutôt que de rapetisser jusqu'à l'illisible. */
export const MAX = {
  nom: 26, effet: 95, titre: 70, sous_titre: 120,
  etape: 22, entete: 24, cle: 12, valeur: 16, cote: 50, ligne: 60, legende: 40,
};

/* Le dépôt est public : aucun secret ne doit pouvoir entrer dans une image,
   même recopié par erreur depuis un journal. */
const SECRETS = [
  [/\b(?:sk|rk|pk)_(?:live|test)_/i, 'clé Stripe'],
  [/\bre_[A-Za-z0-9]{8,}/, 'clé Resend'],
  [/\beyJ[A-Za-z0-9_-]{10,}/, 'jeton'],
  [/AIza[0-9A-Za-z_-]{20,}|\bAQ\.[A-Za-z0-9_-]{20,}/, 'clé Google'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}|github_pat_/, 'jeton GitHub'],
  [/[\w.+-]+@[\w-]+\.[a-z]{2,}/i, 'adresse email'],
  [/\b\d{1,3}(?:\.\d{1,3}){3}\b/, 'adresse IP'],
  [/\/home\/|\b[A-Za-z]:\\/, 'chemin de fichier'],
];

function textes(spec) {
  const il = spec.illustration || {};
  return [
    spec.nom, spec.effet, spec.titre, spec.sous_titre,
    ...(il.etapes || []), il.entete, ...((il.lignes || []).flat()),
    il.avant, il.apres, il.ligne, il.legende,
  ].filter((t) => typeof t === 'string');
}

function borne(champ, valeur, max, obligatoire = true) {
  if (valeur === undefined || valeur === null || valeur === '') {
    if (obligatoire) throw new Error(`Carte BiP : « ${champ} » manquant.`);
    return;
  }
  if (typeof valeur !== 'string') throw new Error(`Carte BiP : « ${champ} » doit être un texte.`);
  if (valeur.length > max) throw new Error(`Carte BiP : « ${champ} » trop long (${valeur.length} caractères, ${max} au plus).`);
}

export function verifierBip(spec) {
  if (!Number.isInteger(spec.numero) || spec.numero < 1 || spec.numero > 999) throw new Error('Carte BiP : « numero » entier de 1 à 999 attendu.');
  if (!Number.isInteger(spec.total) || spec.total < spec.numero || spec.total > 999) throw new Error('Carte BiP : « total » entier, au moins égal au numéro, attendu.');
  if (!RARETES.includes(spec.rarete)) throw new Error(`Carte BiP : rareté inconnue « ${spec.rarete} » (${RARETES.join(', ')}).`);
  borne('nom', spec.nom, MAX.nom);
  borne('effet', spec.effet, MAX.effet);
  borne('titre', spec.titre, MAX.titre);
  borne('sous_titre', spec.sous_titre, MAX.sous_titre, false);

  const il = spec.illustration;
  if (!il || !GABARITS.includes(il.gabarit)) throw new Error(`Carte BiP : gabarit d'illustration inconnu (${GABARITS.join(', ')}).`);
  if (il.gabarit === 'plan') {
    if (!Array.isArray(il.etapes) || il.etapes.length < 2 || il.etapes.length > 4) throw new Error('Carte BiP : un plan a de 2 à 4 étapes.');
    il.etapes.forEach((e, i) => borne(`étape ${i + 1}`, e, MAX.etape));
    if (il.porte !== undefined && !(Number.isInteger(il.porte) && il.porte >= 0 && il.porte < il.etapes.length)) {
      throw new Error('Carte BiP : « porte » doit désigner une étape du plan.');
    }
  } else if (il.gabarit === 'bordereau') {
    borne('entete', il.entete, MAX.entete, false);
    if (!Array.isArray(il.lignes) || il.lignes.length < 2 || il.lignes.length > 6) throw new Error('Carte BiP : un bordereau a de 2 à 6 lignes.');
    il.lignes.forEach((l, i) => {
      if (!Array.isArray(l) || l.length !== 2) throw new Error(`Carte BiP : ligne ${i + 1} du bordereau, paire [clé, valeur] attendue.`);
      borne(`clé ${i + 1}`, l[0], MAX.cle);
      borne(`valeur ${i + 1}`, l[1], MAX.valeur);
    });
  } else if (il.gabarit === 'avant-apres') {
    borne('avant', il.avant, MAX.cote);
    borne('apres', il.apres, MAX.cote);
  } else if (il.gabarit === 'preuve') {
    borne('ligne', il.ligne, MAX.ligne);
    /* Une preuve sans provenance n'en est pas une. */
    borne('legende', il.legende, MAX.legende);
  }

  for (const t of textes(spec)) {
    for (const [re, quoi] of SECRETS) {
      if (re.test(t)) throw new Error(`Carte BiP : ${quoi} détecté dans « ${t.slice(0, 40)} », refusé (dépôt public).`);
    }
    if (/[–—]/.test(t)) throw new Error('Carte BiP : tiret long interdit.');
  }
}

/* ── Dessin de la carte (coordonnées locales, w × h) ─────────── */

const r = (n) => Math.round(n * 10) / 10;

/* Taille qui fait tenir un libellé sur UNE ligne, bornée par le haut. */
function tailleUneLigne(texte, largeur, tailleMax, facteur = 0.56) {
  return r(Math.min(tailleMax, largeur / Math.max(1, texte.length * facteur)));
}

function cadre(rarete, id) {
  if (rarete === 'holo') {
    return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7fe0ff"/><stop offset="30%" stop-color="#a78bfa"/>
      <stop offset="55%" stop-color="#f472b6"/><stop offset="78%" stop-color="${OR}"/>
      <stop offset="100%" stop-color="#7fe0ff"/></linearGradient>`;
  }
  const [a, b] = rarete === 'erreur' ? [ROUGE, '#8f2d3a'] : [BLEU, '#1d4f94'];
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${a}"/><stop offset="100%" stop-color="${b}"/></linearGradient>`;
}

function symbole(rarete, cx, cy, t) {
  if (rarete === 'commune') return `<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(t * 0.5)}" fill="${BLEU}"/>`;
  if (rarete === 'erreur') {
    const d = t * 0.6;
    return `<polygon points="${r(cx)},${r(cy - d)} ${r(cx + d)},${r(cy)} ${r(cx)},${r(cy + d)} ${r(cx - d)},${r(cy)}" fill="${ROUGE}"/>`;
  }
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rayon = i % 2 === 0 ? t * 0.7 : t * 0.3;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${r(cx + rayon * Math.cos(a))},${r(cy + rayon * Math.sin(a))}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${OR}"/>`;
}

function fleche(x, y1, y2, couleur, t) {
  return `<line x1="${r(x)}" y1="${r(y1)}" x2="${r(x)}" y2="${r(y2 - t * 0.6)}" stroke="${couleur}" stroke-width="${r(t * 0.22)}" stroke-linecap="round"/>
    <polygon points="${r(x - t * 0.5)},${r(y2 - t * 0.75)} ${r(x + t * 0.5)},${r(y2 - t * 0.75)} ${r(x)},${r(y2)}" fill="${couleur}"/>`;
}

function gabaritPlan(il, x, y, wi, hi) {
  const n = il.etapes.length;
  const poids = il.etapes.map((_, i) => (i === il.porte ? 1.7 : 1));
  const pad = hi * 0.05;
  const ecart = hi * 0.075;
  const unite = (hi - 2 * pad - (n - 1) * ecart) / poids.reduce((a, b) => a + b, 0);
  const bx = x + wi * 0.07;
  const bw = wi * 0.86;
  let cy = y + pad;
  const morceaux = [];
  il.etapes.forEach((etape, i) => {
    const bh = unite * poids[i];
    const porte = i === il.porte;
    const derniere = i === n - 1;
    const remplissage = derniere ? BLEU : '#15305a';
    const opacite = derniere ? 0.28 : 1;
    morceaux.push(`<rect x="${r(bx)}" y="${r(cy)}" width="${r(bw)}" height="${r(bh)}" rx="${r(wi * 0.035)}"
      fill="${remplissage}" fill-opacity="${opacite}" stroke="${BLEU}" stroke-opacity="0.75" stroke-width="${r(wi * 0.006)}"/>`);
    const taille = tailleUneLigne(etape, bw * 0.9, Math.min(wi * 0.068, unite * 0.42));
    const yTexte = porte ? cy + unite * 0.5 + taille * 0.35 : cy + bh / 2 + taille * 0.35;
    morceaux.push(`<text x="${r(bx + bw / 2)}" y="${r(yTexte)}" text-anchor="middle" font-family="${POLICE}"
      font-size="${taille}" font-weight="700" fill="#ffffff">${echapper(etape)}</text>`);
    if (porte) {
      const ph = unite * 0.46;
      const py = cy + unite * 0.95;
      const pw = bw * 0.4;
      const ts = r(Math.min(ph * 0.5, pw / (9 * 0.56)));
      morceaux.push(`<rect x="${r(bx + bw * 0.06)}" y="${r(py)}" width="${r(pw)}" height="${r(ph)}" rx="${r(ph / 2)}" fill="${BLEU}"/>
      <text x="${r(bx + bw * 0.06 + pw / 2)}" y="${r(py + ph / 2 + ts * 0.35)}" text-anchor="middle" font-family="${POLICE}" font-size="${ts}" font-weight="700" fill="#ffffff">Autoriser</text>
      <rect x="${r(bx + bw * 0.54)}" y="${r(py)}" width="${r(pw)}" height="${r(ph)}" rx="${r(ph / 2)}" fill="none" stroke="${ROUGE}" stroke-width="${r(wi * 0.006)}"/>
      <text x="${r(bx + bw * 0.54 + pw / 2)}" y="${r(py + ph / 2 + ts * 0.35)}" text-anchor="middle" font-family="${POLICE}" font-size="${ts}" font-weight="700" fill="${ROUGE}">Refuser</text>`);
    }
    if (i < n - 1) morceaux.push(fleche(bx + bw / 2, cy + bh + ecart * 0.15, cy + bh + ecart * 0.9, BLEU, wi * 0.045));
    cy += bh + ecart;
  });
  return morceaux.join('\n    ');
}

function gabaritBordereau(il, x, y, wi, hi) {
  const tx = x + wi * 0.06;
  const tw = wi * 0.88;
  const ty = y + hi * 0.07;
  const th = hi * 0.86;
  const pad = tw * 0.07;
  const n = il.lignes.length;
  const lignesTicket = n + (il.entete ? 1.6 : 0) + 1.4;
  const taille = r(Math.min((tw - 2 * pad) / (30 * LARGEUR_MONO), (th * 0.82) / (lignesTicket * 1.5)));
  const pas = taille * 1.5;
  const morceaux = [`<rect x="${r(tx)}" y="${r(ty)}" width="${r(tw)}" height="${r(th)}" rx="${r(wi * 0.015)}" fill="#eef3fb"/>`];
  /* Perforations : le ticket se reconnaît à ses bords. */
  for (let px = tx + tw * 0.06; px < tx + tw - tw * 0.03; px += tw * 0.09) {
    morceaux.push(`<circle cx="${r(px)}" cy="${r(ty)}" r="${r(wi * 0.012)}" fill="${FENETRE}"/><circle cx="${r(px)}" cy="${r(ty + th)}" r="${r(wi * 0.012)}" fill="${FENETRE}"/>`);
  }
  let cy = ty + pad + taille;
  if (il.entete) {
    morceaux.push(`<text x="${r(tx + tw / 2)}" y="${r(cy)}" text-anchor="middle" font-family="${MONO}" font-size="${taille}" font-weight="700" fill="${CORPS}" letter-spacing="1">${echapper(il.entete)}</text>`);
    cy += taille * 0.7;
    morceaux.push(`<line x1="${r(tx + pad)}" y1="${r(cy)}" x2="${r(tx + tw - pad)}" y2="${r(cy)}" stroke="${CORPS}" stroke-opacity="0.45" stroke-dasharray="${r(taille * 0.4)} ${r(taille * 0.3)}"/>`);
    cy += pas;
  }
  const largeurCar = taille * LARGEUR_MONO;
  for (const [cle, valeur] of il.lignes) {
    const finCle = tx + pad + cle.length * largeurCar + taille * 0.4;
    const debutValeur = tx + tw - pad - valeur.length * largeurCar - taille * 0.4;
    morceaux.push(`<text x="${r(tx + pad)}" y="${r(cy)}" font-family="${MONO}" font-size="${taille}" fill="#4a5a75">${echapper(cle)}</text>
      <text x="${r(tx + tw - pad)}" y="${r(cy)}" text-anchor="end" font-family="${MONO}" font-size="${taille}" font-weight="700" fill="${CORPS}">${echapper(valeur)}</text>`);
    if (debutValeur > finCle) {
      morceaux.push(`<line x1="${r(finCle)}" y1="${r(cy - taille * 0.25)}" x2="${r(debutValeur)}" y2="${r(cy - taille * 0.25)}" stroke="${CORPS}" stroke-opacity="0.35" stroke-dasharray="${r(taille * 0.12)} ${r(taille * 0.3)}"/>`);
    }
    cy += pas;
  }
  /* Petit code-barres, dessiné à partir de l'en-tête : décoratif et stable. */
  const graine = hachage(il.entete || il.lignes.flat().join('|'));
  let bxx = tx + pad;
  const bh = taille * 1.2;
  const by = ty + th - pad * 0.6 - bh;
  for (let i = 0; bxx < tx + tw * 0.62; i++) {
    const bw = ((graine >> (i % 24)) & 3) + 1;
    morceaux.push(`<rect x="${r(bxx)}" y="${r(by)}" width="${r(bw * wi * 0.004)}" height="${r(bh)}" fill="${CORPS}" fill-opacity="0.75"/>`);
    bxx += (bw + 1.5) * wi * 0.004;
  }
  return morceaux.join('\n    ');
}

function croix(cx, cy, t, couleur) {
  return `<path d="M${r(cx - t)} ${r(cy - t)} L${r(cx + t)} ${r(cy + t)} M${r(cx + t)} ${r(cy - t)} L${r(cx - t)} ${r(cy + t)}" stroke="${couleur}" stroke-width="${r(t * 0.45)}" stroke-linecap="round"/>`;
}

function coche(cx, cy, t, couleur) {
  return `<polyline points="${r(cx - t)},${r(cy)} ${r(cx - t * 0.25)},${r(cy + t * 0.75)} ${r(cx + t)},${r(cy - t * 0.7)}" fill="none" stroke="${couleur}" stroke-width="${r(t * 0.45)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function gabaritAvantApres(il, x, y, wi, hi) {
  const px = x + wi * 0.06;
  const pw = wi * 0.88;
  const ph = hi * 0.4;
  const taille = r(wi * 0.06);
  const panneau = (py, libelle, texte, couleur, fond, icone) => {
    const lignes = couper(texte, taille, pw * 0.86);
    if (lignes.length > 2) throw new Error(`Carte BiP : « ${texte.slice(0, 30)} » ne tient pas en deux lignes.`);
    return `<rect x="${r(px)}" y="${r(py)}" width="${r(pw)}" height="${r(ph)}" rx="${r(wi * 0.03)}" fill="${fond}" stroke="${couleur}" stroke-opacity="0.6" stroke-width="${r(wi * 0.006)}"/>
    ${icone(px + pw * 0.09, py + ph * 0.24, wi * 0.028, couleur)}
    <text x="${r(px + pw * 0.16)}" y="${r(py + ph * 0.24 + taille * 0.36)}" font-family="${POLICE}" font-size="${r(taille * 0.8)}" font-weight="700" fill="${couleur}" letter-spacing="2">${libelle}</text>
    ${lignes.map((l, i) => `<text x="${r(px + pw * 0.07)}" y="${r(py + ph * 0.55 + i * taille * 1.3)}" font-family="${POLICE}" font-size="${taille}" font-weight="700" fill="#ffffff">${echapper(l)}</text>`).join('\n    ')}`;
  };
  const y1 = y + hi * 0.06;
  const y2 = y + hi * 0.54;
  return [
    panneau(y1, 'AVANT', il.avant, ROUGE, '#24141e', croix),
    fleche(x + wi / 2, y1 + ph + hi * 0.01, y2 - hi * 0.01, BLEU, wi * 0.04),
    panneau(y2, 'APRÈS', il.apres, BLEU, '#0f2a4a', coche),
  ].join('\n    ');
}

function gabaritPreuve(il, x, y, wi, hi) {
  const px = x + wi * 0.06;
  const pw = wi * 0.88;
  const py = y + hi * 0.14;
  const ph = hi * 0.58;
  const taille = r(Math.min(wi * 0.078, (pw * 0.84) / (18 * LARGEUR_MONO)));
  const lignes = decouper(il.ligne, taille, pw * 0.84, LARGEUR_MONO + 0.02);
  if (lignes.length > 4) throw new Error('Carte BiP : la preuve ne tient pas en quatre lignes.');
  const hauteurTexte = lignes.length * taille * 1.35;
  const y0 = py + (ph - hauteurTexte) / 2 + taille;
  return `<rect x="${r(px)}" y="${r(py)}" width="${r(pw)}" height="${r(ph)}" rx="${r(wi * 0.02)}" fill="#08111e" stroke="${BLEU}" stroke-opacity="0.4" stroke-width="${r(wi * 0.005)}"/>
    <rect x="${r(px)}" y="${r(py)}" width="${r(wi * 0.016)}" height="${r(ph)}" fill="${BLEU}"/>
    <text x="${r(px + pw * 0.08)}" y="${r(py + taille * 2.1)}" font-family="${POLICE}" font-size="${r(taille * 2.4)}" font-weight="700" fill="${BLEU}" fill-opacity="0.55">“</text>
    ${lignes.map((l, i) => `<text x="${r(px + pw * 0.08)}" y="${r(y0 + i * taille * 1.35)}" font-family="${MONO}" font-size="${taille}" fill="#ffffff">${echapper(l)}</text>`).join('\n    ')}
    <text x="${r(px)}" y="${r(py + ph + taille * 1.7)}" font-family="${POLICE}" font-size="${r(taille * 0.8)}" font-style="italic" fill="${GRIS}">${echapper(il.legende)}</text>`;
}

function gabaritMotif(spec, x, y, wi, hi, id) {
  const graine = hachage(`${spec.nom}|${spec.numero}`);
  const accent = spec.rarete === 'erreur' ? ROUGE : spec.rarete === 'holo' ? OR : BLEU;
  return `<svg x="${r(x)}" y="${r(y)}" width="${r(wi)}" height="${r(hi)}" viewBox="0 0 ${Math.round(wi)} ${Math.round(hi)}">
      ${motif(choisirMotif(graine), { graine, accent, largeur: Math.round(wi), hauteur: Math.round(hi) })}
    </svg>
    <text x="${r(x + wi / 2)}" y="${r(y + hi / 2 + wi * 0.09)}" text-anchor="middle" font-family="${POLICE}" font-size="${r(wi * 0.26)}" font-weight="700" fill="#ffffff" fill-opacity="0.9" id="${id}-num">${String(spec.numero).padStart(2, '0')}</text>`;
}

/* La carte entière, en coordonnées locales (0..w, 0..h). */
export function svgCarte(spec, w, h, id = 'bip') {
  const p = w * 0.035;
  const ix = p + w * 0.045;
  const iw = w - 2 * ix;
  const iy = p + h * 0.115;
  const ih = h * 0.45;
  const il = spec.illustration;
  const couleur = spec.rarete === 'erreur' ? ROUGE : spec.rarete === 'holo' ? OR : BLEU;

  let illustration;
  if (il.gabarit === 'plan') illustration = gabaritPlan(il, ix, iy, iw, ih);
  else if (il.gabarit === 'bordereau') illustration = gabaritBordereau(il, ix, iy, iw, ih);
  else if (il.gabarit === 'avant-apres') illustration = gabaritAvantApres(il, ix, iy, iw, ih);
  else if (il.gabarit === 'preuve') illustration = gabaritPreuve(il, ix, iy, iw, ih);
  else illustration = gabaritMotif(spec, ix, iy, iw, ih, id);

  const tNom = tailleUneLigne(spec.nom, w * 0.74, w * 0.064, 0.58);
  const tEffet = r(w * 0.05);
  const effet = couper(spec.effet, tEffet, iw);
  if (effet.length > 4) throw new Error('Carte BiP : l\'effet ne tient pas en quatre lignes.');
  const yType = iy + ih + h * 0.04;
  const yEffet = yType + h * 0.065;
  const yBas = h - p - h * 0.045;
  const numero = `${String(spec.numero).padStart(2, '0')}/${String(spec.total).padStart(2, '0')}`;
  const typeLigne = spec.rarete === 'erreur' ? 'Carte erreur · Build in public' : 'Build in public · Saison 1';

  /* Carte erreur : le nom « mal imprimé », décalé en rouge, comme une erreur
     d'impression recherchée par les collectionneurs. */
  const nomFantome = spec.rarete === 'erreur'
    ? `<text x="${r(p + w * 0.05 + w * 0.008)}" y="${r(p + h * 0.072 + w * 0.006)}" font-family="${POLICE}" font-size="${tNom}" font-weight="700" fill="${ROUGE}" fill-opacity="0.5">${echapper(spec.nom)}</text>`
    : '';
  const reflet = spec.rarete === 'holo'
    ? `<rect x="${r(ix)}" y="${r(iy)}" width="${r(iw)}" height="${r(ih)}" rx="${r(w * 0.02)}" fill="url(#${id}-reflet)"/>`
    : '';

  return `<defs>
    ${cadre(spec.rarete, `${id}-cadre`)}
    <linearGradient id="${id}-reflet" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/><stop offset="45%" stop-color="#ffffff" stop-opacity="0.14"/>
      <stop offset="55%" stop-color="#a78bfa" stop-opacity="0.12"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="${r(-w * 0.03)}" y="${r(-w * 0.03)}" width="${r(w * 1.06)}" height="${r(h + w * 0.06)}" rx="${r(w * 0.07)}" fill="${couleur}" fill-opacity="0.12"/>
  <rect width="${r(w)}" height="${r(h)}" rx="${r(w * 0.05)}" fill="url(#${id}-cadre)"/>
  <rect x="${r(p)}" y="${r(p)}" width="${r(w - 2 * p)}" height="${r(h - 2 * p)}" rx="${r(w * 0.035)}" fill="${CORPS}"/>
  ${nomFantome}
  <text x="${r(p + w * 0.05)}" y="${r(p + h * 0.072)}" font-family="${POLICE}" font-size="${tNom}" font-weight="700" fill="#ffffff">${echapper(spec.nom)}</text>
  ${symbole(spec.rarete, w - p - w * 0.075, p + h * 0.055, w * 0.05)}
  <rect x="${r(ix)}" y="${r(iy)}" width="${r(iw)}" height="${r(ih)}" rx="${r(w * 0.02)}" fill="${FENETRE}" stroke="${couleur}" stroke-opacity="0.7" stroke-width="${r(w * 0.006)}"/>
  ${illustration}
  ${reflet}
  <text x="${r(ix)}" y="${r(yType)}" font-family="${POLICE}" font-size="${r(w * 0.034)}" font-style="italic" fill="${spec.rarete === 'erreur' ? ROUGE : GRIS}">${typeLigne}</text>
  ${effet.map((l, i) => `<text x="${r(ix)}" y="${r(yEffet + i * tEffet * 1.32)}" font-family="${POLICE}" font-size="${tEffet}" fill="${TEXTE}">${echapper(l)}</text>`).join('\n  ')}
  <line x1="${r(ix)}" y1="${r(yBas - h * 0.04)}" x2="${r(ix + iw)}" y2="${r(yBas - h * 0.04)}" stroke="${couleur}" stroke-opacity="0.35"/>
  <text x="${r(ix)}" y="${r(yBas)}" font-family="${MONO}" font-size="${r(w * 0.032)}" fill="${GRIS}" letter-spacing="1">SET DE BASE · S1</text>
  <text x="${r(ix + iw - w * 0.06)}" y="${r(yBas)}" text-anchor="end" font-family="${MONO}" font-size="${r(w * 0.042)}" font-weight="700" fill="#ffffff">${numero}</text>
  ${symbole(spec.rarete, ix + iw - w * 0.022, yBas - w * 0.014, w * 0.03)}`;
}

/* Coupe en lignes sans jamais séparer un nombre de son unité (« 12 h »,
   « 35 min ») ni un guillemet français de son mot : un caractère réservé
   protège l'espace pendant la découpe, puis redevient une espace insécable. */
const COLLE = '\uE000';
export function couper(texte, taille, largeur, facteur) {
  const protege = String(texte)
    .replace(/(\d) (?=(?:h|min|Go|jours?|ans?|tests?)\b)/g, `$1${COLLE}`)
    .replace(/« /g, `«${COLLE}`).replace(/ »/g, `${COLLE}»`);
  return decouper(protege, taille, largeur, facteur).map((l) => l.split(COLLE).join('\u00a0'));
}

/* ── Mise en page de la scène ───────────────────────────────── */

export function miseEnPage(format) {
  const { largeur: L, hauteur: H, paysage } = format;
  if (paysage) {
    const ch = Math.round(H - 2 * 48);
    const cw = Math.round(ch * 0.716);
    const cx = 64;
    const colonne = cx + cw + 70;
    return { L, H, paysage, carte: { x: cx, y: 48, w: cw, h: ch }, colonne, largeurColonne: L - colonne - 64, xEntete: colonne };
  }
  const ch = Math.round(H * 0.56);
  const cw = Math.round(ch * 0.716);
  return { L, H, paysage, carte: { x: Math.round((L - cw) / 2), y: 214, w: cw, h: ch }, colonne: 70, largeurColonne: L - 140, xEntete: 70 };
}

function grille(L, H) {
  const g = 36;
  return `<pattern id="bip-grille" width="${g}" height="${g}" patternUnits="userSpaceOnUse">
      <path d="M ${g} 0 L 0 0 0 ${g}" fill="none" stroke="${BLEU}" stroke-opacity="0.07" stroke-width="1"/>
    </pattern>`;
}

/* La scène complète, sans le logo (incrusté ensuite par sharp). `entete` est le
   fragment SVG du nom de marque fourni par visuel-social.mjs. */
export function svgBip(spec, format, entete = '') {
  verifierBip(spec);
  const m = miseEnPage(format);
  const { L, H } = m;
  const { x, y, w, h } = m.carte;
  const kicker = `BUILD IN PUBLIC · CARTE ${String(spec.numero).padStart(2, '0')}/${String(spec.total).padStart(2, '0')}`;

  let texte;
  if (m.paysage) {
    const xc = m.colonne;
    const largeur = m.largeurColonne;
    const ordre = [52, 46, 40, 35];
    let taille = ordre[0];
    let lignes = couper(spec.titre, taille, largeur);
    for (const t of ordre.slice(1)) { if (lignes.length <= 3) break; taille = t; lignes = couper(spec.titre, taille, largeur); }
    if (lignes.length > 4) throw new Error('Carte BiP : titre trop long pour le format paysage.');
    const yKicker = Math.round(H * 0.31);
    const yTitre = yKicker + 34 + taille;
    const interligne = Math.round(taille * 1.18);
    const finTitre = yTitre + (lignes.length - 1) * interligne;
    const tailleSous = 25;
    const placeSous = Math.floor((H * 0.83 - (finTitre + 46)) / (tailleSous * 1.4)) + 1;
    const sousComplet = spec.sous_titre ? couper(spec.sous_titre, tailleSous, largeur, 0.5) : [];
    const sous = sousComplet.length <= Math.min(3, placeSous) ? sousComplet : [];
    texte = `${entete}
  <text x="${xc}" y="${yKicker}" font-family="${POLICE}" font-size="17" font-weight="700" fill="${BLEU}" letter-spacing="2">${echapper(kicker)}</text>
  ${lignes.map((l, i) => `<text x="${xc}" y="${yTitre + i * interligne}" font-family="${POLICE}" font-size="${taille}" font-weight="700" fill="#ffffff">${echapper(l)}</text>`).join('\n  ')}
  ${sous.map((l, i) => `<text x="${xc}" y="${finTitre + 46 + i * Math.round(tailleSous * 1.4)}" font-family="${POLICE}" font-size="${tailleSous}" fill="#ffffff" fill-opacity="0.66">${echapper(l)}</text>`).join('\n  ')}
  <rect x="${xc}" y="${Math.round(H * 0.875)}" width="${Math.round(largeur * 0.45)}" height="4" rx="2" fill="${BLEU}"/>
  <text x="${xc}" y="${Math.round(H * 0.875) + 38}" font-family="${POLICE}" font-size="19" fill="#ffffff" fill-opacity="0.62">cards-trading.com</text>`;
  } else {
    const xc = m.colonne;
    const largeur = m.largeurColonne;
    const ordre = [54, 48, 42];
    let taille = ordre[0];
    let lignes = couper(spec.titre, taille, largeur);
    for (const t of ordre.slice(1)) { if (lignes.length <= 2) break; taille = t; lignes = couper(spec.titre, taille, largeur); }
    if (lignes.length > 3) throw new Error('Carte BiP : titre trop long pour le format portrait.');
    const yKicker = y + h + 62;
    const yTitre = yKicker + 22 + taille;
    const interligne = Math.round(taille * 1.16);
    const finTitre = yTitre + (lignes.length - 1) * interligne;
    const sousComplet = lignes.length < 3 && spec.sous_titre ? couper(spec.sous_titre, 29, largeur, 0.5) : [];
    const sous = sousComplet.length <= 2 ? sousComplet : [];
    texte = `${entete}
  <text x="${xc}" y="${yKicker}" font-family="${POLICE}" font-size="24" font-weight="700" fill="${BLEU}" letter-spacing="2">${echapper(kicker)}</text>
  ${lignes.map((l, i) => `<text x="${xc}" y="${yTitre + i * interligne}" font-family="${POLICE}" font-size="${taille}" font-weight="700" fill="#ffffff">${echapper(l)}</text>`).join('\n  ')}
  ${sous.map((l, i) => `<text x="${xc}" y="${finTitre + 50 + i * 40}" font-family="${POLICE}" font-size="29" fill="#ffffff" fill-opacity="0.66">${echapper(l)}</text>`).join('')}
  <text x="${L - 70}" y="${H - 44}" text-anchor="end" font-family="${POLICE}" font-size="26" fill="#ffffff" fill-opacity="0.62">cards-trading.com</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}">
  <defs>
    ${grille(L, H)}
    <radialGradient id="bip-halo" cx="${m.paysage ? '22%' : '50%'}" cy="${m.paysage ? '50%' : '42%'}" r="60%">
      <stop offset="0%" stop-color="${BLEU}" stop-opacity="0.30"/>
      <stop offset="100%" stop-color="${BLEU}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${L}" height="${H}" fill="${FOND}"/>
  <rect width="${L}" height="${H}" fill="url(#bip-grille)"/>
  <rect width="${L}" height="${H}" fill="url(#bip-halo)"/>
  <g transform="translate(${x} ${y})">
  ${svgCarte(spec, w, h)}
  </g>
  ${texte}
</svg>`;
}
