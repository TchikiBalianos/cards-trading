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

/*
  Rapport hebdomadaire de santé.

  Greffé sur le cron quotidien plutôt que sur un cron dédié : le plan Hobby
  plafonne à 2 cron jobs et les deux sont pris (keep-alive + instagram).

  Envoyé le lundi. Sa simple ARRIVÉE prouve que la chaîne Resend fonctionne —
  c'est le test des notifications autant que le rapport lui-même. Une semaine
  sans rapport le lundi est en soi un signal.
*/
async function rapportHebdo(stats) {
  /* beta_stats() peut renvoyer null (RPC absente, droits retirés, base
     repartie en pause). Dans ce cas on ne bricole pas un rapport avec des
     « ? » : on le dit franchement, car ne pas connaître ses chiffres EST
     l'information à remonter. */
  const chiffresDispo =
    stats && typeof stats.total === 'number' && typeof stats.last_7d === 'number';

  const total = chiffresDispo ? stats.total : null;
  const semaine = chiffresDispo ? stats.last_7d : null;
  const derniere = stats?.derniere ? new Date(stats.derniere) : null;
  const joursDepuis = derniere
    ? Math.floor((Date.now() - derniere.getTime()) / 86400000)
    : null;

  /* Le trafic arrive par pics (lives WhatNot), donc 0 inscription sur une
     semaine n'est pas anormal en soi. En revanche une dernière inscription
     très ancienne mérite une vérification manuelle du formulaire. */
  const suspect = joursDepuis !== null && joursDepuis > 30;

  /* « 0 inscription » au singulier : correct en français, zéro ne prend
     la marque du pluriel qu'à partir de 2. */
  const sujet = chiffresDispo
    ? `📊 Cards Trading — ${semaine} inscription${semaine > 1 ? 's' : ''} cette semaine`
    : '⚠️ Cards Trading — rapport hebdo incomplet (statistiques illisibles)';

  try {
    const { error } = await resend.emails.send({
      from: 'Cards Trading <contact@cards-trading.com>',
      to: ['contact@cards-trading.com'],
      subject: sujet,
      html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#2997ff;margin:0 0 4px">📊 Rapport hebdomadaire</h2>
  <p style="color:#888;font-size:13px;margin:0 0 24px">Semaine du ${new Date().toLocaleDateString('fr-FR')}</p>

  ${chiffresDispo ? `<div style="display:flex;gap:12px;margin-bottom:24px">
    <div style="flex:1;background:#f5f8ff;border-radius:8px;padding:16px;text-align:center">
      <div style="font-size:32px;font-weight:700;color:#2997ff">${semaine}</div>
      <div style="font-size:13px;color:#666">cette semaine</div>
    </div>
    <div style="flex:1;background:#f7f7f7;border-radius:8px;padding:16px;text-align:center">
      <div style="font-size:32px;font-weight:700;color:#333">${total}</div>
      <div style="font-size:13px;color:#666">au total</div>
    </div>
  </div>` : `<div style="background:#fff3cd;border-left:4px solid #e65100;padding:14px 18px;border-radius:4px;margin-bottom:24px;color:#663c00">
    <strong>⚠️ Compteurs illisibles</strong><br>
    La base répond, mais la fonction <code>beta_stats()</code> n'a rien renvoyé.
    Vérifie qu'elle existe et que le rôle <code>anon</code> a le droit de l'exécuter :<br>
    <span style="font-size:13px">SQL Editor → <code>select public.beta_stats();</code></span>
  </div>`}

  <p style="font-size:15px;color:#333;line-height:1.6">
    <strong>Dernière inscription :</strong>
    ${derniere ? derniere.toLocaleDateString('fr-FR') + ` (il y a ${joursDepuis} jour${joursDepuis > 1 ? 's' : ''})` : 'aucune'}
  </p>

  ${suspect ? `<div style="background:#fff3cd;border-left:4px solid #e65100;padding:14px 18px;border-radius:4px;margin:20px 0;color:#663c00">
    <strong>⚠️ Aucune inscription depuis ${joursDepuis} jours.</strong><br>
    Si tu as fait de la promo récemment, teste le formulaire : il se peut
    qu'il n'enregistre plus.
  </div>` : ''}

  <div style="background:#e8f5e9;border-left:4px solid #2e7d32;padding:14px 18px;border-radius:4px;margin:20px 0;color:#1b5e20">
    <strong>✅ Base de données joignable</strong><br>
    <span style="font-size:13px">Le projet Supabase n'est pas en pause. Vérifié chaque jour.</span>
  </div>

  <p style="font-size:12px;color:#888;margin-top:24px;line-height:1.5">
    Ce message est envoyé chaque lundi. <strong>Le recevoir prouve aussi que
    l'envoi d'emails fonctionne</strong> — si un lundi il n'arrive pas, c'est
    que la chaîne de notification est cassée et que les alertes d'inscription
    ne partent probablement plus non plus.
  </p>
</div>`,
    });
    if (error) {
      console.error('[keep-alive] rapport hebdo NON envoyé:', JSON.stringify(error));
    } else {
      console.log('[keep-alive] rapport hebdo envoyé —', semaine, 'inscription(s) cette semaine');
    }
  } catch (e) {
    console.error('[keep-alive] rapport hebdo impossible:', e.message);
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
    /* RPC plutôt que SELECT : RLS réserve le SELECT aux authentifiés, donc
       avec la clé anon un `.select()` est intégralement filtré et ne renvoie
       aucune ligne — l'activité la plus ténue possible. Le projet a reçu un
       avertissement de mise en pause malgré ce ping quotidien (août 2026).
       beta_stats() est SECURITY DEFINER : l'appeler exécute réellement du SQL
       agrégé côté Postgres, et fournit les compteurs au passage. */
    const { data: stats, error } = await supabase.rpc('beta_stats');

    if (error) {
      console.error('[keep-alive] ÉCHEC — la base a répondu une erreur:', JSON.stringify(error));
      await alerter('La base a répondu une erreur', error.message);
      return res.status(500).json({ ok: false, reason: 'query_error' });
    }

    console.log(
      `[keep-alive] OK — beta_stats exécutée en ${Date.now() - t0}ms` +
      (stats && typeof stats.total === 'number' ? ` (${stats.total} inscrits)` : '')
    );

    /* Rapport hebdomadaire le lundi (getUTCDay() === 1), ou à la demande
       via ?rapport=1 pour tester sans attendre lundi. */
    const forcer = req.query && req.query.rapport === '1';
    if (forcer || new Date().getUTCDay() === 1) {
      /* stats déjà chargées par le ping : pas de second aller-retour */
      await rapportHebdo(stats);
    }

    /* On ne renvoie pas le nombre d'inscrits : l'URL est publique. */
    return res.status(200).json({ ok: true });
  } catch (e) {
    /* DNS/réseau : typiquement le projet est en pause ou supprimé */
    console.error('[keep-alive] ÉCHEC — base injoignable:', e.message);
    await alerter('Base injoignable (DNS/réseau)', e.message);
    return res.status(500).json({ ok: false, reason: 'unreachable' });
  }
}
