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
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

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

/*
  Alerte email en cas de panne.

  Sans ça, une base HS ne produit qu'une ligne de log que personne ne lit —
  c'est précisément comme ça que 11 semaines d'inscriptions ont disparu
  dans le silence. Le cron tournant chaque jour, une panne devient visible
  dans la boîte sous 24 h au lieu de jamais.

  N'envoie RIEN quand tout va bien : zéro email en fonctionnement normal.
*/
async function alerter(motif, detail) {
  try {
    const { error } = await resend.emails.send({
      from: 'Cards Trading <contact@cards-trading.com>',
      to: ['contact@cards-trading.com'],
      subject: '🚨 ALERTE — base de données Cards Trading injoignable',
      html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#c62828;margin:0 0 16px">🚨 La base de données ne répond pas</h2>
  <p style="font-size:15px;line-height:1.6;color:#333">
    La vérification quotidienne a échoué. <strong>Les inscriptions au formulaire
    ne sont probablement plus enregistrées.</strong>
  </p>
  <div style="background:#fff3cd;border-left:4px solid #e65100;padding:14px 18px;border-radius:4px;margin:20px 0;color:#663c00">
    <strong>Motif :</strong> ${motif}<br>
    <span style="font-size:13px">${String(detail || '').slice(0, 300)}</span>
  </div>
  <p style="font-size:15px;line-height:1.6;color:#333"><strong>Que faire :</strong></p>
  <ol style="font-size:14px;line-height:1.8;color:#333">
    <li>Ouvrir <a href="https://supabase.com/dashboard/project/frbwmzgaqmylilzciptg">le projet Supabase</a></li>
    <li>S'il est en pause, cliquer <strong>Resume project</strong> — les données restent intactes</li>
    <li>Vérifier ensuite que le formulaire réenregistre bien</li>
  </ol>
  <p style="font-size:12px;color:#888;margin-top:24px">
    Alerte automatique émise par /api/keep-alive. Tant que la panne dure,
    ce message revient une fois par jour.
  </p>
</div>`,
    });
    if (error) {
      console.error('[keep-alive] alerte email NON envoyée:', JSON.stringify(error));
    } else {
      console.log('[keep-alive] alerte email envoyée');
    }
  } catch (e) {
    /* Les deux canaux sont morts — il ne reste que les logs */
    console.error('[keep-alive] alerte email impossible:', e.message);
  }
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
    await alerter('Configuration Supabase absente', 'SUPABASE_URL ou SUPABASE_ANON_KEY manquante dans Vercel');
    return res.status(500).json({ ok: false, reason: 'not_configured' });
  }

  const t0 = Date.now();
  try {
    const { error } = await supabase
      .from('beta_submissions')
      .select('id', { count: 'exact', head: true });

    if (error) {
      console.error('[keep-alive] ÉCHEC — la base a répondu une erreur:', JSON.stringify(error));
      await alerter('La base a répondu une erreur', error.message);
      return res.status(500).json({ ok: false, reason: 'query_error' });
    }

    console.log(`[keep-alive] OK — base jointe en ${Date.now() - t0}ms`);
    /* On ne renvoie pas le nombre d'inscrits : l'URL est publique. */
    return res.status(200).json({ ok: true });
  } catch (e) {
    /* DNS/réseau : typiquement le projet est en pause ou supprimé */
    console.error('[keep-alive] ÉCHEC — base injoignable:', e.message);
    await alerter('Base injoignable (DNS/réseau)', e.message);
    return res.status(500).json({ ok: false, reason: 'unreachable' });
  }
}
