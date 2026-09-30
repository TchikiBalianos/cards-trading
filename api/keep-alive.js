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
 *
 * Le 1er de chaque mois (jour UTC), il envoie aussi le rapport mensuel de
 * santé décrit plus bas. `?rapport=1` en envoie un à la demande, pour tester.
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
  Rapport mensuel de santé.

  Greffé sur le cron quotidien plutôt que sur un cron dédié : le plan Hobby
  plafonne à 2 cron jobs et les deux sont pris (keep-alive + instagram).

  Envoyé le 1er de chaque mois (jour UTC), pour le mois calendaire écoulé. Sa
  simple ARRIVÉE prouve que la chaîne Resend fonctionne : c'est le test des
  notifications autant que le rapport lui-même. Un mois sans rapport est en soi
  un signal. Une panne de la base, elle, déclenche une alerte dans la journée.

  ⚠️ Ce endpoint est appelé PLUSIEURS FOIS par jour : une fois par le cron
  Vercel, et toutes les 6 h par le workflow GitHub keep-alive.yml (avec du
  retard). Le rapport d'origine, hebdomadaire, s'envoyait à chaque appel d'un
  lundi : quatre exemplaires identiques chaque lundi, constatés les 7, 14, 21
  et 28 septembre 2026. L'envoi passe donc par l'API HTTP de Resend avec un
  en-tête Idempotency-Key : les appels suivants reçoivent la même réponse sans
  renvoyer d'email. Le SDK resend installé (3.5.0) ne connaît pas cette option,
  d'où le fetch direct.

  Les fonctions ci-dessous sont exportées pour être testées sans réseau
  (scripts/lib/rapport-mensuel.test.mjs). Vercel n'utilise que l'export par défaut.
*/

const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

/* « 2026-09 » devient « septembre 2026 » ; null si le format est invalide. */
export function libelleMois(aaaaMm) {
  const morceaux = String(aaaaMm || '').split('-');
  const annee = Number(morceaux[0]);
  const mois = Number(morceaux[1]);
  if (!annee || !(mois >= 1 && mois <= 12)) return null;
  return `${MOIS[mois - 1]} ${annee}`;
}

/* Mois calendaire précédent, à l'heure de Paris, au format « AAAA-MM ». Même
   règle que la fonction SQL beta_stats_mois_precedent() : c'est le repli quand
   la base ne la fournit pas. */
export function moisPrecedentParis(maintenant = new Date()) {
  const parties = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', year: 'numeric', month: 'numeric',
  }).formatToParts(maintenant);
  let annee = Number(parties.find((p) => p.type === 'year').value);
  let mois = Number(parties.find((p) => p.type === 'month').value) - 1;
  if (mois === 0) { mois = 12; annee -= 1; }
  return `${annee}-${String(mois).padStart(2, '0')}`;
}

/* Jour civil à Paris, au format AAAA-MM-JJ. */
function jourParis(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

/* Jours civils écoulés entre deux instants, à l'heure de Paris. Pas de division
   de millisecondes : le résultat ne change qu'à minuit, donc deux appels dans
   la même journée composent exactement le même texte, ce qui évite un refus
   pour « charge utile différente » côté Resend. */
function joursCivilsEcoules(depuis, jusqua) {
  const a = Date.parse(`${jourParis(depuis)}T00:00:00Z`);
  const b = Date.parse(`${jourParis(jusqua)}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

/* Le rapport part le 1er du mois (jour UTC), ou à la demande. */
export function rapportDu(maintenant, forcer) {
  return Boolean(forcer) || maintenant.getUTCDate() === 1;
}

/* Clé d'idempotence Resend, valable 24 h. Le vrai rapport a une clé par mois :
   tous les appels du 1er n'envoient qu'un email. Le test à la demande a sa
   propre clé, à l'heure, pour ne jamais masquer le vrai rapport et pour borner
   le nombre d'emails qu'une URL publique peut déclencher. */
export function cleIdempotence(mois, forcer, maintenant) {
  if (!forcer) return `rapport-mensuel/${mois}`;
  return `rapport-mensuel-test/${maintenant.toISOString().slice(0, 13)}`;
}

/* Compose le sujet et le corps, sans effet de bord.
   `stats` vient de beta_stats() (total, derniere), `mensuel` de
   beta_stats_mois_precedent() (mois, mois_precedent) : l'un comme l'autre peut
   être null. */
export function composerRapportMensuel({ stats, mensuel, maintenant = new Date() }) {
  /* beta_stats() peut renvoyer null (RPC absente, droits retirés, base
     repartie en pause). On ne bricole pas un rapport avec des « ? » : on le
     dit franchement, car ne pas connaître ses chiffres EST l'information à
     remonter. */
  const totalDispo = Boolean(stats) && typeof stats.total === 'number';
  const total = totalDispo ? stats.total : null;

  const moisCompte = mensuel && typeof mensuel.mois === 'string' && libelleMois(mensuel.mois)
    ? mensuel.mois
    : moisPrecedentParis(maintenant);
  const libelle = libelleMois(moisCompte);
  /* « d'août », « d'avril », « d'octobre » : l'élision devant une voyelle. */
  const deLibelle = /^[aeiouyéèêàâîôû]/i.test(libelle) ? `d'${libelle}` : `de ${libelle}`;
  const compteMois = mensuel && typeof mensuel.mois_precedent === 'number'
    ? mensuel.mois_precedent
    : null;

  const derniere = stats && stats.derniere ? new Date(stats.derniere) : null;
  const derniereValide = derniere && !Number.isNaN(derniere.getTime());
  const joursDepuis = derniereValide ? joursCivilsEcoules(derniere, maintenant) : null;

  /* Le trafic arrive par pics (lives WhatNot), donc 0 inscription sur un
     mois n'est pas anormal en soi. En revanche une dernière inscription très
     ancienne mérite une vérification manuelle du formulaire. */
  const suspect = joursDepuis !== null && joursDepuis > 30;

  /* « 0 inscription » au singulier : correct en français, zéro ne prend la
     marque du pluriel qu'à partir de 2. */
  let sujet;
  if (!totalDispo) {
    sujet = '⚠️ Cards Trading : rapport mensuel incomplet (statistiques illisibles)';
  } else if (compteMois === null) {
    sujet = `📊 Cards Trading : rapport mensuel ${deLibelle}`;
  } else {
    sujet = `📊 Cards Trading : ${compteMois} inscription${compteMois > 1 ? 's' : ''} en ${libelle}`;
  }

  const dateEnvoi = maintenant.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
  const derniereTexte = derniereValide
    ? `${derniere.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} (${
      joursDepuis === 0 ? "aujourd'hui" : `il y a ${joursDepuis} jour${joursDepuis > 1 ? 's' : ''}`
    })`
    : 'aucune';

  const tuiles = totalDispo
    ? `<div style="display:flex;gap:12px;margin-bottom:8px">
    <div style="flex:1;background:#f5f8ff;border-radius:8px;padding:16px;text-align:center">
      ${compteMois !== null
    ? `<div style="font-size:32px;font-weight:700;color:#2997ff">${compteMois}</div>
      <div style="font-size:13px;color:#666">en ${libelle}</div>`
    : `<div style="font-size:24px;font-weight:700;color:#e65100">?</div>
      <div style="font-size:13px;color:#666">compteur du mois indisponible</div>`}
    </div>
    <div style="flex:1;background:#f7f7f7;border-radius:8px;padding:16px;text-align:center">
      <div style="font-size:32px;font-weight:700;color:#333">${total}</div>
      <div style="font-size:13px;color:#666">au total</div>
    </div>
  </div>
  <p style="font-size:12px;color:#888;margin:0 0 24px">Toutes les soumissions du formulaire, doublons et tests compris.</p>`
    : `<div style="background:#fff3cd;border-left:4px solid #e65100;padding:14px 18px;border-radius:4px;margin-bottom:24px;color:#663c00">
    <strong>⚠️ Compteurs illisibles</strong><br>
    La base répond, mais la fonction <code>beta_stats()</code> n'a rien renvoyé.
    Vérifie qu'elle existe et que le rôle <code>anon</code> a le droit de l'exécuter :<br>
    <span style="font-size:13px">SQL Editor → <code>select public.beta_stats();</code></span>
  </div>`;

  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#2997ff;margin:0 0 4px">📊 Rapport mensuel</h2>
  <p style="color:#888;font-size:13px;margin:0 0 24px">Mois ${deLibelle}, envoyé le ${dateEnvoi}</p>

  ${tuiles}

  <p style="font-size:15px;color:#333;line-height:1.6">
    <strong>Dernière inscription :</strong>
    ${derniereTexte}
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
    Ce message est envoyé le 1er de chaque mois. <strong>Le recevoir prouve aussi que
    l'envoi d'emails fonctionne</strong> : si un mois il n'arrive pas, la chaîne de
    notification est peut-être cassée et les alertes d'inscription ne partent
    probablement plus non plus. Une panne de la base, elle, déclenche une alerte
    dans la journée.
  </p>
</div>`;

  return { sujet, html, mois: moisCompte };
}

/* Envoi par l'API HTTP de Resend, avec la clé d'idempotence. Ne lève jamais :
   un rapport raté ne doit pas faire échouer le ping qui garde la base éveillée.
   Retourne 'envoye', 'deja_envoye' (409 : même clé déjà utilisée dans les
   dernières 24 h, donc l'email est déjà parti) ou 'echec'. */
export async function envoyerRapport(
  { sujet, html },
  cle,
  { fetchImpl = fetch, cleApi = process.env.RESEND_API_KEY } = {}
) {
  try {
    const reponse = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cleApi}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': cle,
      },
      body: JSON.stringify({
        from: 'Cards Trading <contact@cards-trading.com>',
        to: ['contact@cards-trading.com'],
        subject: sujet,
        html,
      }),
      signal: AbortSignal.timeout(6000),
    });
    const corps = await reponse.json().catch(() => ({}));
    if (reponse.ok) {
      console.log('[keep-alive] rapport mensuel accepté par Resend, id', corps.id, 'clé', cle);
      return 'envoye';
    }
    if (reponse.status === 409) {
      console.log('[keep-alive] rapport mensuel déjà envoyé (', corps.name || 'doublon', '), rien de plus');
      return 'deja_envoye';
    }
    console.error('[keep-alive] rapport mensuel NON envoyé:', reponse.status, JSON.stringify(corps));
    return 'echec';
  } catch (e) {
    console.error('[keep-alive] rapport mensuel impossible:', e.message);
    return 'echec';
  }
}

async function rapportMensuel(stats, forcer, maintenant) {
  /* Le compteur du mois vient d'une fonction SQL dédiée : beta_stats(), celle
     du ping quotidien, reste intacte. Si la nouvelle manque ou échoue, le
     rapport part quand même, sans le chiffre du mois. */
  let mensuel = null;
  try {
    const { data, error } = await supabase.rpc('beta_stats_mois_precedent');
    if (error) {
      console.error('[keep-alive] compteur du mois illisible:', JSON.stringify(error));
    } else if (data && typeof data.mois_precedent === 'number') {
      mensuel = data;
    }
  } catch (e) {
    console.error('[keep-alive] compteur du mois impossible:', e.message);
  }

  const rapport = composerRapportMensuel({ stats, mensuel, maintenant });
  await envoyerRapport(rapport, cleIdempotence(rapport.mois, forcer, maintenant));
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

    /* Rapport mensuel le 1er du mois (jour UTC), ou à la demande via
       ?rapport=1 pour tester sans attendre. Plusieurs appels tombent le 1er :
       l'idempotence de Resend garantit un seul email. */
    const forcer = req.query && req.query.rapport === '1';
    const maintenant = new Date();
    if (rapportDu(maintenant, forcer)) {
      /* stats déjà chargées par le ping : pas de second aller-retour */
      await rapportMensuel(stats, forcer, maintenant);
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
