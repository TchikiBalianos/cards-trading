/**
 * Keep-alive Supabase — empêche la mise en pause du projet
 *
 * Le plan gratuit Supabase suspend un projet après ~7 jours sans activité.
 * C'est ce qui est arrivé le 13 mai 2026 : le projet s'est endormi, les
 * insertions du formulaire ont échoué en silence, et des inscriptions ont
 * été perdues jusqu'au 30 juillet.
 *
 * Ce endpoint effectue une requête triviale sur la base. Vercel le déclenche
 * une fois par jour (voir vercel.json) — 7 occasions de réveiller le projet
 * avant que le seuil de pause soit atteint, donc de la marge si une
 * exécution échoue.
 *
 * GET /api/keep-alive → { ok: true }
 *
 * Note RLS : la clé anon n'a pas de politique SELECT sur beta_submissions,
 * la requête renvoie donc un résultat vide. Peu importe — ce qui compte est
 * l'aller-retour effectif jusqu'à Postgres, qui suffit à marquer l'activité.
 */

import { createClient } from '@supabase/supabase-js';

let supabase = null;
try {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
  }
} catch (e) {
  console.error('[keep-alive] createClient a échoué:', e.message);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  /* Jamais de cache : une réponse servie par le CDN n'atteindrait pas
     la base et ne compterait donc pas comme activité. */
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (!supabase) {
    console.error('[keep-alive] ÉCHEC — configuration Supabase absente');
    return res.status(500).json({ ok: false, reason: 'not_configured' });
  }

  const t0 = Date.now();
  try {
    const { error } = await supabase
      .from('beta_submissions')
      .select('id', { count: 'exact', head: true });

    if (error) {
      console.error('[keep-alive] ÉCHEC — la base a répondu une erreur:', JSON.stringify(error));
      return res.status(500).json({ ok: false, reason: 'query_error' });
    }

    console.log(`[keep-alive] OK — base jointe en ${Date.now() - t0}ms`);
    /* On ne renvoie pas le nombre d'inscrits : l'URL est publique. */
    return res.status(200).json({ ok: true });
  } catch (e) {
    /* DNS/réseau : typiquement le projet est déjà en pause ou supprimé */
    console.error('[keep-alive] ÉCHEC — base injoignable:', e.message);
    return res.status(500).json({ ok: false, reason: 'unreachable' });
  }
}
