/**
 * Compteur de "joueurs et collectionneurs inscrits à la bêta"
 * Stocké dans Upstash Redis (KV REST).
 *
 * Endpoints :
 *   GET  /api/views  → renvoie la valeur actuelle (lecture pure)
 *   POST /api/views  → incrémente puis renvoie la nouvelle valeur
 *
 * Variables d'env requises (Vercel + .env.local) :
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *
 * Le compteur est seedé à 62 au premier appel si la clé n'existe pas
 * (valeur de départ marketing). Tous les appels suivants l'incrémentent
 * via INCR (atomique, safe en concurrence).
 */
import { Redis } from '@upstash/redis';

const KEY = 'cards-trading:beta:counter';
const SEED = 42;

let redis = null;
function getRedis() {
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redis;
}

export default async function handler(req, res) {
  // Pas de cache CDN — la valeur change en permanence
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  // Si Upstash n'est pas configuré, renvoyer la valeur seed sans crasher
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return res.status(200).json({ count: SEED, source: 'seed-fallback' });
  }

  try {
    const r = getRedis();

    if (req.method === 'GET') {
      let val = await r.get(KEY);
      if (val === null || val === undefined) {
        await r.set(KEY, SEED);
        val = SEED;
      }
      return res.status(200).json({ count: Number(val) });
    }

    if (req.method === 'POST') {
      // Garantir que la clé est seedée avant le 1er INCR
      const exists = await r.exists(KEY);
      if (!exists) {
        await r.set(KEY, SEED);
      }
      const newVal = await r.incr(KEY);
      return res.status(200).json({ count: Number(newVal) });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Upstash error:', err);
    return res.status(200).json({ count: SEED, source: 'error-fallback' });
  }
}
