/*
  Tests du rapport mensuel de /api/keep-alive, sans réseau.

  Le module de la fonction crée un client Resend à l'import : une clé factice
  suffit. Sans variables Supabase, aucun client Supabase n'est créé.
*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.RESEND_API_KEY = 're_cle_factice_pour_les_tests';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_ANON_KEY;

const {
  libelleMois,
  moisPrecedentParis,
  rapportDu,
  cleIdempotence,
  composerRapportMensuel,
  envoyerRapport,
} = await import('../../api/keep-alive.js');

const PREMIER_OCTOBRE = new Date('2026-10-01T04:09:00Z');
const STATS = { total: 29, last_7d: 1, derniere: '2026-09-26T06:50:38.271+00:00' };
const MENSUEL = { mois: '2026-09', mois_precedent: 3 };

test('libelleMois : mois lisible, null si le format est invalide', () => {
  assert.equal(libelleMois('2026-09'), 'septembre 2026');
  assert.equal(libelleMois('2026-12'), 'décembre 2026');
  assert.equal(libelleMois('2026-01'), 'janvier 2026');
  assert.equal(libelleMois('2026-13'), null);
  assert.equal(libelleMois('2026-00'), null);
  assert.equal(libelleMois(''), null);
  assert.equal(libelleMois(undefined), null);
});

test('moisPrecedentParis : bascule à minuit heure de Paris, été comme hiver', () => {
  assert.equal(moisPrecedentParis(PREMIER_OCTOBRE), '2026-09');
  assert.equal(moisPrecedentParis(new Date('2027-01-01T04:00:00Z')), '2026-12');
  /* 22h30 UTC le 30 septembre, il est déjà 00h30 le 1er octobre à Paris (heure d'été) */
  assert.equal(moisPrecedentParis(new Date('2026-09-30T22:30:00Z')), '2026-09');
  assert.equal(moisPrecedentParis(new Date('2026-09-30T21:30:00Z')), '2026-08');
  /* heure d'hiver : 23h30 UTC le 31 décembre, minuit et demi le 1er janvier à Paris */
  assert.equal(moisPrecedentParis(new Date('2026-12-31T23:30:00Z')), '2026-12');
  assert.equal(moisPrecedentParis(new Date('2026-12-31T22:30:00Z')), '2026-11');
});

test('rapportDu : le 1er du mois seulement, plus le lundi', () => {
  assert.equal(rapportDu(PREMIER_OCTOBRE, false), true);
  assert.equal(rapportDu(new Date('2026-10-01T00:00:00Z'), false), true);
  assert.equal(rapportDu(new Date('2026-10-01T23:59:59Z'), false), true);
  assert.equal(rapportDu(new Date('2026-09-30T23:59:59Z'), false), false);
  /* un lundi : c'était le déclencheur de l'ancien rapport hebdomadaire */
  assert.equal(rapportDu(new Date('2026-09-28T04:09:00Z'), false), false);
  assert.equal(rapportDu(new Date('2026-10-05T04:09:00Z'), false), false);
  /* à la demande */
  assert.equal(rapportDu(new Date('2026-09-28T04:09:00Z'), true), true);
});

test("cleIdempotence : une clé par mois, et une clé de test horaire qui n'écrase jamais la vraie", () => {
  assert.equal(cleIdempotence('2026-09', false, PREMIER_OCTOBRE), 'rapport-mensuel/2026-09');
  const test1 = cleIdempotence('2026-09', true, new Date('2026-09-30T14:05:00Z'));
  const test2 = cleIdempotence('2026-09', true, new Date('2026-09-30T14:55:00Z'));
  const test3 = cleIdempotence('2026-09', true, new Date('2026-09-30T15:05:00Z'));
  assert.equal(test1, 'rapport-mensuel-test/2026-09-30T14');
  assert.equal(test1, test2, 'deux tests dans la même heure partagent la clé');
  assert.notEqual(test1, test3);
  assert.notEqual(test1, cleIdempotence('2026-09', false, PREMIER_OCTOBRE));
});

test('rapport normal : sujet, chiffres, dernière inscription en jours civils', () => {
  const r = composerRapportMensuel({ stats: STATS, mensuel: MENSUEL, maintenant: PREMIER_OCTOBRE });
  assert.equal(r.sujet, '📊 Cards Trading : 3 inscriptions en septembre 2026');
  assert.equal(r.mois, '2026-09');
  assert.match(r.html, /Rapport mensuel/);
  assert.match(r.html, /Mois de septembre 2026, envoyé le 01\/10\/2026/);
  assert.match(r.html, />3<\/div>/);
  assert.match(r.html, />29<\/div>/);
  assert.match(r.html, /en septembre 2026/);
  assert.match(r.html, /26\/09\/2026 \(il y a 5 jours\)/);
  assert.match(r.html, /Base de données joignable/);
  assert.match(r.html, /doublons et tests compris/);
  assert.doesNotMatch(r.html, /Aucune inscription depuis/);
});

test('rapport : accord du sujet, zéro et un au singulier', () => {
  const sujet = (n) => composerRapportMensuel({
    stats: STATS, mensuel: { mois: '2026-09', mois_precedent: n }, maintenant: PREMIER_OCTOBRE,
  }).sujet;
  assert.equal(sujet(0), '📊 Cards Trading : 0 inscription en septembre 2026');
  assert.equal(sujet(1), '📊 Cards Trading : 1 inscription en septembre 2026');
  assert.equal(sujet(2), '📊 Cards Trading : 2 inscriptions en septembre 2026');
});

test("rapport : le texte ne dépend que du jour, donc deux appels du même jour sont identiques", () => {
  const matin = composerRapportMensuel({ stats: STATS, mensuel: MENSUEL, maintenant: new Date('2026-10-01T04:09:00Z') });
  const soir = composerRapportMensuel({ stats: STATS, mensuel: MENSUEL, maintenant: new Date('2026-10-01T21:57:00Z') });
  assert.equal(matin.sujet, soir.sujet);
  assert.equal(matin.html, soir.html, "sinon Resend refuserait le second appel pour « charge utile différente »");
});

test("rapport : « d'août », « d'avril », « d'octobre », « de septembre »", () => {
  const rapport = (maintenant, mensuel) => composerRapportMensuel({ stats: STATS, mensuel, maintenant });

  const aout = rapport(new Date('2026-09-01T04:09:00Z'), { mois: '2026-08', mois_precedent: 12 });
  assert.match(aout.html, /Mois d'août 2026, envoyé le 01\/09\/2026/);
  assert.equal(aout.sujet, '📊 Cards Trading : 12 inscriptions en août 2026');

  /* sans le compteur, le sujet reprend le mois déduit de la date */
  assert.equal(rapport(new Date('2026-09-01T04:09:00Z'), null).sujet, "📊 Cards Trading : rapport mensuel d'août 2026");
  assert.equal(rapport(new Date('2026-05-01T04:09:00Z'), null).sujet, "📊 Cards Trading : rapport mensuel d'avril 2026");
  assert.equal(rapport(new Date('2026-11-01T04:09:00Z'), null).sujet, "📊 Cards Trading : rapport mensuel d'octobre 2026");
  assert.equal(rapport(new Date('2027-01-01T04:09:00Z'), null).sujet, '📊 Cards Trading : rapport mensuel de décembre 2026');
  assert.match(rapport(PREMIER_OCTOBRE, MENSUEL).html, /Mois de septembre 2026/);
});

test('rapport sans le compteur du mois : il part quand même, en le disant', () => {
  const r = composerRapportMensuel({ stats: STATS, mensuel: null, maintenant: PREMIER_OCTOBRE });
  assert.equal(r.sujet, '📊 Cards Trading : rapport mensuel de septembre 2026');
  assert.equal(r.mois, '2026-09', 'le mois se déduit de la date quand la base ne le donne pas');
  assert.match(r.html, /compteur du mois indisponible/);
  assert.match(r.html, />29<\/div>/);
});

test('rapport sans statistiques : signalé franchement, sans chiffre inventé', () => {
  const r = composerRapportMensuel({ stats: null, mensuel: MENSUEL, maintenant: PREMIER_OCTOBRE });
  assert.match(r.sujet, /^⚠️ Cards Trading : rapport mensuel incomplet/);
  assert.match(r.html, /Compteurs illisibles/);
  assert.doesNotMatch(r.html, /au total/);
  assert.match(r.html, /aucune/);
});

test('rapport : une dernière inscription vieille de plus de 30 jours est signalée', () => {
  const r = composerRapportMensuel({
    stats: { total: 29, derniere: '2026-08-20T10:00:00Z' }, mensuel: MENSUEL, maintenant: PREMIER_OCTOBRE,
  });
  assert.match(r.html, /Aucune inscription depuis 42 jours/);
});

test('rapport : plus de trace de la cadence hebdomadaire, ni de tiret long', () => {
  for (const mensuel of [MENSUEL, null]) {
    const r = composerRapportMensuel({ stats: STATS, mensuel, maintenant: PREMIER_OCTOBRE });
    const tout = `${r.sujet}\n${r.html}`;
    assert.doesNotMatch(tout, /hebdo|cette semaine|lundi/i);
    assert.doesNotMatch(tout, /[—–]/);
  }
});

/* ── Envoi : l'idempotence et la tolérance aux pannes ─────────────────── */

function reponse(statut, corps) {
  return { ok: statut >= 200 && statut < 300, status: statut, json: async () => corps };
}

test("envoyerRapport : appelle l'API HTTP de Resend avec la clé d'idempotence", async (t) => {
  t.mock.method(console, 'log', () => {});
  const appels = [];
  const fetchImpl = async (url, options) => { appels.push({ url, options }); return reponse(200, { id: 'abc' }); };

  const issue = await envoyerRapport({ sujet: 'Sujet', html: '<p>x</p>' }, 'rapport-mensuel/2026-09', {
    fetchImpl, cleApi: 're_secret',
  });

  assert.equal(issue, 'envoye');
  assert.equal(appels.length, 1);
  assert.equal(appels[0].url, 'https://api.resend.com/emails');
  assert.equal(appels[0].options.method, 'POST');
  assert.equal(appels[0].options.headers['Idempotency-Key'], 'rapport-mensuel/2026-09');
  assert.equal(appels[0].options.headers.Authorization, 'Bearer re_secret');
  const corps = JSON.parse(appels[0].options.body);
  assert.deepEqual(corps.to, ['contact@cards-trading.com']);
  assert.equal(corps.subject, 'Sujet');
  assert.equal(corps.html, '<p>x</p>');
});

test("envoyerRapport : un 409 signifie « déjà envoyé », ce n'est pas une panne", async (t) => {
  const erreurs = t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'log', () => {});
  for (const nom of ['invalid_idempotent_request', 'concurrent_idempotent_requests']) {
    const issue = await envoyerRapport({ sujet: 's', html: 'h' }, 'k', {
      fetchImpl: async () => reponse(409, { name: nom }), cleApi: 'k',
    });
    assert.equal(issue, 'deja_envoye');
  }
  assert.equal(erreurs.mock.callCount(), 0, 'un doublon écarté ne doit pas polluer les logs d\'erreur');
});

test('envoyerRapport : une vraie erreur ou une coupure ne lève jamais', async (t) => {
  const erreurs = t.mock.method(console, 'error', () => {});
  const refus = await envoyerRapport({ sujet: 's', html: 'h' }, 'k', {
    fetchImpl: async () => reponse(422, { name: 'validation_error' }), cleApi: 'k',
  });
  assert.equal(refus, 'echec');
  const coupure = await envoyerRapport({ sujet: 's', html: 'h' }, 'k', {
    fetchImpl: async () => { throw new Error('réseau coupé'); }, cleApi: 'k',
  });
  assert.equal(coupure, 'echec');
  const corpsIllisible = await envoyerRapport({ sujet: 's', html: 'h' }, 'k', {
    fetchImpl: async () => ({ ok: false, status: 500, json: async () => { throw new Error('pas du JSON'); } }), cleApi: 'k',
  });
  assert.equal(corpsIllisible, 'echec');
  assert.equal(erreurs.mock.callCount(), 3);
});
