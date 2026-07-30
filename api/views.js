/**
 * Compteur « joueurs inscrits à la bêta » — incrémentation artificielle
 *
 * Approche 100 % déterministe : part de BASE_COUNT le jour BASE_EPOCH et
 * ajoute 1 à 3 inscrits par jour via un PRNG seedé sur le n° de jour.
 * Aucun état serveur — tous les visiteurs voient exactement la même valeur
 * pour une même journée UTC.
 *
 * ⚠️ ALGORITHME DUPLIQUÉ dans public/index.html (fallback client-side).
 *    Toute modification ici doit être répercutée là-bas — sinon un visiteur
 *    dont l'appel API échoue verrait un nombre différent des autres.
 *
 * GET /api/views → { count: <nombre> }
 */

const BASE_COUNT = 263;
const BASE_EPOCH = Date.UTC(2026, 6, 30); // 30 juillet 2026 00:00 UTC (mois 0-indexé)
const DAY_MS = 86_400_000;

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

function dailyIncrement(day) {
  /* Les seeds successifs (d*31337+12345) sont linéairement corrélés :
     le PREMIER output de mulberry32 l'est donc aussi, ce qui produisait
     un motif visible (+3,+1,+3,+1…) et une distribution biaisée.
     On avance le générateur de 2 crans pour casser cette corrélation. */
  const rng = mulberry32(day * 31337 + 12345);
  rng();
  rng();
  return Math.floor(rng() * 3) + 1; // 1, 2 ou 3
}

function getCount(nowMs) {
  const daysSinceBase = Math.max(0, Math.floor((nowMs - BASE_EPOCH) / DAY_MS));
  let total = BASE_COUNT;
  for (let d = 0; d < daysSinceBase; d++) {
    total += dailyIncrement(d);
  }
  return total;
}

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const now = Date.now();

  /* Cache jusqu'au prochain minuit UTC : la valeur ne change qu'une fois
     par jour, donc elle bascule au même instant pour tous les visiteurs
     quel que soit le nœud CDN qui les sert. Plancher à 60 s pour éviter
     un s-maxage=0 juste avant minuit. */
  const msUntilMidnight = DAY_MS - (now % DAY_MS);
  const sMaxAge = Math.max(60, Math.floor(msUntilMidnight / 1000));
  res.setHeader(
    'Cache-Control',
    `public, s-maxage=${sMaxAge}, stale-while-revalidate=600`
  );

  return res.status(200).json({ count: getCount(now) });
}
