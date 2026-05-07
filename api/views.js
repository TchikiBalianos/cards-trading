/**
 * Compteur « joueurs inscrits à la bêta » — incrémentation artificielle
 *
 * Approche 100 % déterministe : part de 51 le jour du lancement et
 * ajoute 5 à 8 inscrits par jour via un PRNG seedé sur le n° de jour.
 * Tous les visiteurs voient la même valeur — aucun état serveur requis.
 *
 * GET /api/views → { count: <nombre> }
 */

const SEED = 51;
const LAUNCH_EPOCH = Date.UTC(2026, 4, 7); // 7 mai 2026 00:00 UTC (mois 0-indexé)

/* mulberry32 — PRNG 32-bit rapide et reproductible */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getCount() {
  const now = Date.now();
  const daysSinceLaunch = Math.max(
    0,
    Math.floor((now - LAUNCH_EPOCH) / 86_400_000)
  );
  let total = SEED;
  for (let d = 0; d < daysSinceLaunch; d++) {
    const rng = mulberry32(d * 31337 + 12345);
    total += Math.floor(rng() * 4) + 5; // 5, 6, 7 ou 8
  }
  return total;
}

export default function handler(req, res) {
  /* Cache 1 h au CDN, stale-while-revalidate 10 min — la valeur ne
     change qu'une fois par jour, pas besoin de la recalculer à chaque hit */
  res.setHeader(
    'Cache-Control',
    'public, s-maxage=3600, stale-while-revalidate=600'
  );

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({ count: getCount() });
}
