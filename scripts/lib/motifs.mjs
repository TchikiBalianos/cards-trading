/*
  Motifs génératifs des visuels (vignettes d'articles, posts éditoriaux).

  Pourquoi ce module. Le fond IA (Pollinations.ai) est tombé en 402 puis en 500 le
  29 septembre 2026, et son remplaçant exige une clé. Un fond ne doit jamais
  dépendre d'un service tiers : celui-ci est dessiné en SVG, sans réseau, sans clé,
  et reste identique d'une exécution à l'autre.

  Huit familles de motifs, choisies par le slug ou l'identifiant du contenu, puis
  déclinées par une graine (position, angle, densité). Deux articles d'un même TCG
  n'ont donc ni la même famille ni le même dessin, alors que la couleur d'accent,
  elle, reste celle de la licence.

  Chaque motif renvoie un fragment SVG à poser sur le fond uni et sous le texte.
  Les opacités sont volontairement basses : le motif habille, le titre doit rester
  lisible quelle que soit la graine.
*/

export const MOTIFS = ['rayons', 'hexagones', 'courbes', 'demiteinte', 'constellation', 'vagues', 'diagonales', 'orbites'];

/* Hachage FNV-1a : une graine entière stable à partir d'un texte. */
export function hachage(texte) {
  let h = 0x811c9dc5;
  for (const c of String(texte)) {
    h ^= c.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/* Mulberry32 : générateur pseudo-aléatoire déterministe. */
export function prng(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function choisirMotif(graine) {
  return MOTIFS[graine % MOTIFS.length];
}

const n = (x) => Number(x.toFixed(1));
const entre = (r, a, b) => a + r() * (b - a);

/* Un point de départ hors cadre ou sur un bord, côté choisi par la graine. */
function coin(r, L, H) {
  const cotes = [
    [L * 1.05, -H * 0.05],
    [-L * 0.05, -H * 0.05],
    [L * 1.05, H * 1.05],
    [-L * 0.05, H * 1.05],
  ];
  const [x, y] = cotes[Math.floor(r() * cotes.length)];
  return [x + entre(r, -L * 0.08, L * 0.08), y + entre(r, -H * 0.08, H * 0.08)];
}

/* ── Les huit familles ─────────────────────────────────────── */

function rayons(r, a, L, H) {
  const [ox, oy] = coin(r, L, H);
  const cible = Math.atan2(H / 2 - oy, L / 2 - ox);
  const rayon = Math.hypot(L, H) * 1.4;
  const nb = 22 + Math.floor(r() * 16);
  const demi = entre(r, 0.6, 0.95);
  let angle = cible - demi;
  const pas = (demi * 2) / nb;
  let out = '';
  for (let i = 0; i < nb; i++) {
    const largeur = pas * entre(r, 0.25, 0.7);
    const debut = angle + (pas - largeur) / 2;
    const x1 = ox + rayon * Math.cos(debut);
    const y1 = oy + rayon * Math.sin(debut);
    const x2 = ox + rayon * Math.cos(debut + largeur);
    const y2 = oy + rayon * Math.sin(debut + largeur);
    out += `<polygon points="${n(ox)},${n(oy)} ${n(x1)},${n(y1)} ${n(x2)},${n(y2)}" fill="${a}" fill-opacity="${n(entre(r, 0.03, 0.11) * 100) / 100}"/>`;
    angle += pas;
  }
  return out;
}

function hexagones(r, a, L, H) {
  const [fx, fy] = coin(r, L, H);
  const t = L / entre(r, 9, 15);
  const hauteur = Math.sqrt(3) * t;
  const portee = Math.hypot(L, H) * 0.85;
  let out = '';
  for (let col = -1; col * t * 1.5 < L + t; col++) {
    for (let lig = -1; lig * hauteur < H + hauteur; lig++) {
      const cx = col * t * 1.5;
      const cy = lig * hauteur + (col % 2 ? hauteur / 2 : 0);
      const fondu = Math.max(0, 1 - Math.hypot(cx - fx, cy - fy) / portee);
      if (fondu < 0.05) continue;
      const pts = [0, 1, 2, 3, 4, 5].map((k) => {
        const ang = (Math.PI / 3) * k;
        return `${n(cx + t * 0.94 * Math.cos(ang))},${n(cy + t * 0.94 * Math.sin(ang))}`;
      }).join(' ');
      const plein = r() < 0.2 ? entre(r, 0.1, 0.24) * fondu : 0;
      out += `<polygon points="${pts}" fill="${a}" fill-opacity="${n(plein * 100) / 100}" stroke="${a}" stroke-opacity="${n(0.34 * fondu * 100) / 100}" stroke-width="2"/>`;
    }
  }
  return out;
}

function courbes(r, a, L, H) {
  const cx = entre(r, L * 0.55, L * 1.0);
  const cy = entre(r, H * 0.0, H * 0.5);
  const phi1 = r() * 6.28;
  const phi2 = r() * 6.28;
  const pas = Math.hypot(L, H) / 24;
  let out = '';
  for (let k = 1; k <= 20; k++) {
    const pts = [];
    for (let i = 0; i <= 96; i++) {
      const th = (i / 96) * Math.PI * 2;
      const rr = k * pas * (1 + 0.09 * Math.sin(3 * th + phi1) + 0.05 * Math.sin(5 * th + phi2));
      pts.push(`${n(cx + rr * Math.cos(th))},${n(cy + rr * Math.sin(th))}`);
    }
    out += `<polygon points="${pts.join(' ')}" fill="none" stroke="${a}" stroke-opacity="${n(Math.max(0.06, 0.46 - k * 0.019) * 100) / 100}" stroke-width="${k % 4 === 0 ? 3 : 1.6}"/>`;
  }
  return out;
}

function demiteinte(r, a, L, H) {
  const [ox, oy] = coin(r, L, H);
  const pas = L / entre(r, 22, 32);
  const portee = Math.hypot(L, H) * 0.95;
  let out = '';
  for (let lig = 0; lig * pas < H + pas; lig++) {
    for (let col = 0; col * pas < L + pas; col++) {
      const x = col * pas + (lig % 2 ? pas / 2 : 0);
      const y = lig * pas;
      const f = Math.max(0, 1 - Math.hypot(x - ox, y - oy) / portee);
      const rayon = pas * 0.46 * f * f;
      if (rayon < 0.9) continue;
      out += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(rayon)}" fill="${a}" fill-opacity="0.3"/>`;
    }
  }
  return out;
}

function constellation(r, a, L, H) {
  const nb = 44 + Math.floor(r() * 20);
  const pts = Array.from({ length: nb }, () => [r() * L, r() * H]);
  const seuil = L * 0.2;
  let out = '';
  for (let i = 0; i < nb; i++) {
    for (let j = i + 1; j < nb; j++) {
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
      if (d < seuil) {
        out += `<line x1="${n(pts[i][0])}" y1="${n(pts[i][1])}" x2="${n(pts[j][0])}" y2="${n(pts[j][1])}" stroke="${a}" stroke-opacity="${n((1 - d / seuil) * 0.32 * 100) / 100}" stroke-width="1.4"/>`;
      }
    }
  }
  for (const [x, y] of pts) out += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(entre(r, 1.6, 4.2))}" fill="${a}" fill-opacity="${n(entre(r, 0.3, 0.7) * 100) / 100}"/>`;
  const halos = pts.slice(0, 3);
  out += `<defs>${halos.map((_, i) => `<radialGradient id="mc${i}"><stop offset="0%" stop-color="${a}" stop-opacity="0.28"/><stop offset="100%" stop-color="${a}" stop-opacity="0"/></radialGradient>`).join('')}</defs>`;
  halos.forEach(([x, y], i) => { out += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(H * 0.22)}" fill="url(#mc${i})"/>`; });
  return out;
}

function vagues(r, a, L, H) {
  const couches = 5;
  let out = '';
  for (let k = 0; k < couches; k++) {
    const base = H * (0.52 + k * 0.1);
    const amp = H * entre(r, 0.025, 0.07);
    const freq = entre(r, 1.2, 3.2);
    const phase = r() * 6.28;
    const pts = [`0,${H}`];
    for (let i = 0; i <= 80; i++) {
      const x = (i / 80) * L;
      pts.push(`${n(x)},${n(base + amp * Math.sin((i / 80) * Math.PI * 2 * freq + phase))}`);
    }
    const crete = pts.slice(1).join(' ');
    pts.push(`${L},${H}`);
    out += `<polygon points="${pts.join(' ')}" fill="${a}" fill-opacity="${n((0.03 + k * 0.022) * 100) / 100}"/>`;
    out += `<polyline points="${crete}" fill="none" stroke="${a}" stroke-opacity="0.32" stroke-width="2"/>`;
  }
  return out;
}

function diagonales(r, a, L, H) {
  const angle = entre(r, 18, 38) * (r() < 0.5 ? 1 : -1);
  const nb = 7 + Math.floor(r() * 5);
  const diag = Math.hypot(L, H);
  let out = `<defs><linearGradient id="md" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${a}" stop-opacity="0"/><stop offset="50%" stop-color="${a}" stop-opacity="0.3"/><stop offset="100%" stop-color="${a}" stop-opacity="0"/></linearGradient></defs>`;
  out += `<g transform="rotate(${n(angle)} ${n(L / 2)} ${n(H / 2)})">`;
  let x = -diag * 0.3;
  for (let i = 0; i < nb; i++) {
    const largeur = entre(r, diag * 0.02, diag * 0.11);
    out += `<rect x="${n(x)}" y="${n(-diag * 0.3)}" width="${n(largeur)}" height="${n(diag * 1.6)}" fill="url(#md)" fill-opacity="${n(entre(r, 0.35, 1) * 100) / 100}"/>`;
    x += largeur + entre(r, diag * 0.03, diag * 0.12);
  }
  return `${out}</g>`;
}

function orbites(r, a, L, H) {
  const [cx, cy] = coin(r, L, H);
  const nb = 5 + Math.floor(r() * 3);
  const base = Math.min(L, H) * 0.28;
  let out = `<defs><radialGradient id="mo"><stop offset="0%" stop-color="${a}" stop-opacity="0.32"/><stop offset="100%" stop-color="${a}" stop-opacity="0"/></radialGradient></defs>`;
  out += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(base * 1.7)}" fill="url(#mo)"/>`;
  for (let k = 1; k <= nb; k++) {
    const rayon = base * (0.5 + k * 0.62);
    out += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(rayon)}" fill="none" stroke="${a}" stroke-opacity="${n(Math.max(0.12, 0.5 - k * 0.045) * 100) / 100}" stroke-width="${k % 2 ? 2 : 3.2}"/>`;
    const ang = r() * 6.28;
    out += `<circle cx="${n(cx + rayon * Math.cos(ang))}" cy="${n(cy + rayon * Math.sin(ang))}" r="${n(entre(r, 4, 9))}" fill="${a}" fill-opacity="${n(entre(r, 0.5, 0.9) * 100) / 100}"/>`;
  }
  return out;
}

const FAMILLES = { rayons, hexagones, courbes, demiteinte, constellation, vagues, diagonales, orbites };

/* Fragment SVG d'un motif. `nom` vient de `choisirMotif`, `graine` de `hachage`. */
export function motif(nom, { graine, accent, largeur, hauteur }) {
  const famille = FAMILLES[nom];
  if (!famille) throw new Error(`Motif inconnu : ${nom}`);
  return famille(prng(graine ^ hachage(nom)), accent, largeur, hauteur);
}
