import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { envoyerDiscord, urlAvecAttente, signalerIncertain, classerErreur, resumeCorps } from './discord.mjs';

const WEBHOOK = 'https://discord.com/api/webhooks/123/jeton';

/* Faux fetch : rejoue une réponse ou une exception, et garde la requête reçue. */
function faux(reponse) {
  const appels = [];
  const fetchImpl = async (url, options) => {
    appels.push({ url, options });
    if (reponse instanceof Error) throw reponse;
    return reponse;
  };
  return { fetchImpl, appels };
}

const rep = (status, corps = '') =>
  new Response(status === 204 ? null : corps, { status, headers: { 'Content-Type': 'application/json' } });

function erreurReseau(code) {
  return new TypeError('fetch failed', { cause: Object.assign(new Error(code), { code }) });
}

test('200 avec ?wait=true : ok, identifiant du message journalisé', async () => {
  const { fetchImpl, appels } = faux(rep(200, JSON.stringify({ id: '1555258564128538689' })));
  const r = await envoyerDiscord(WEBHOOK, { content: 'x' }, { fetchImpl });
  assert.deepEqual(r, { etat: 'ok', detail: 'message 1555258564128538689' });
  assert.equal(new URL(appels[0].url).searchParams.get('wait'), 'true');
  assert.equal(appels[0].options.method, 'POST');
  assert.ok(appels[0].options.signal, 'un délai doit borner l’attente');
});

test('204 sans corps : ok quand même', async () => {
  const { fetchImpl } = faux(rep(204));
  assert.equal((await envoyerDiscord(WEBHOOK, {}, { fetchImpl })).etat, 'ok');
});

test('504 : incertain, jamais échec ni succès', async () => {
  const { fetchImpl, appels } = faux(rep(504, 'gateway time-out'));
  const r = await envoyerDiscord(WEBHOOK, {}, { fetchImpl });
  assert.equal(r.etat, 'incertain');
  assert.match(r.detail, /^HTTP 504/);
  assert.equal(appels.length, 1, 'aucune nouvelle tentative automatique');
});

test('4xx, 500, 502 et 503 : échec (rien n’est parti)', async () => {
  for (const s of [400, 401, 404, 429, 500, 502, 503]) {
    const { fetchImpl, appels } = faux(rep(s, '{"message":"refus"}'));
    const r = await envoyerDiscord(WEBHOOK, {}, { fetchImpl });
    assert.equal(r.etat, 'echec', `HTTP ${s}`);
    assert.equal(appels.length, 1, `HTTP ${s} : aucune nouvelle tentative`);
  }
});

test('délai dépassé : incertain', async () => {
  const { fetchImpl } = faux(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
  assert.equal((await envoyerDiscord(WEBHOOK, {}, { fetchImpl })).etat, 'incertain');
});

test('délai réel : la promesse est bien interrompue', async () => {
  /* Le minuteur d'AbortSignal.timeout ne retient pas Node (en production,
     c'est la connexion ouverte qui le fait) : sans ce maintien, le test
     s'arrêterait avant l'expiration. */
  const maintien = setTimeout(() => {}, 1000);
  const fetchImpl = (url, { signal }) =>
    new Promise((_, rejeter) => signal.addEventListener('abort', () => rejeter(signal.reason)));
  const r = await envoyerDiscord(WEBHOOK, {}, { fetchImpl, delaiMs: 20 });
  clearTimeout(maintien);
  assert.equal(r.etat, 'incertain');
});

test('DNS ou refus de connexion : échec, la requête n’est jamais partie', async () => {
  for (const code of ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED']) {
    const { fetchImpl } = faux(erreurReseau(code));
    assert.deepEqual(await envoyerDiscord(WEBHOOK, {}, { fetchImpl }), { etat: 'echec', detail: code });
  }
});

test('connexion coupée en cours de route : incertain', async () => {
  const { fetchImpl } = faux(erreurReseau('ECONNRESET'));
  assert.equal((await envoyerDiscord(WEBHOOK, {}, { fetchImpl })).etat, 'incertain');
});

test('?wait=true conserve un thread_id existant', () => {
  const u = new URL(urlAvecAttente(`${WEBHOOK}?thread_id=42`));
  assert.equal(u.searchParams.get('thread_id'), '42');
  assert.equal(u.searchParams.get('wait'), 'true');
});

test('URL invalide (secret collé sans https://) : échec, sans aucun appel', async () => {
  const { fetchImpl, appels } = faux(rep(200, '{}'));
  const r = await envoyerDiscord('discord.com/api/webhooks/1/x', {}, { fetchImpl });
  assert.equal(r.etat, 'echec');
  assert.equal(appels.length, 0);
});

test('erreurs survenues avant l’envoi : échec', async () => {
  for (const code of ['UND_ERR_CONNECT_TIMEOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID']) {
    const { fetchImpl } = faux(erreurReseau(code));
    assert.equal((await envoyerDiscord(WEBHOOK, {}, { fetchImpl })).etat, 'echec', code);
  }
  /* Double pile IPv4/IPv6 : une AggregateError dont toutes les erreurs précèdent l'envoi. */
  const agregat = new TypeError('fetch failed', {
    cause: Object.assign(new AggregateError([
      Object.assign(new Error('a'), { code: 'ECONNREFUSED' }),
      Object.assign(new Error('b'), { code: 'ECONNREFUSED' }),
    ]), { code: 'ECONNREFUSED' }),
  });
  assert.equal(classerErreur(agregat).etat, 'echec');
});

test('le délai annoncé est celui réellement appliqué', () => {
  const e = new DOMException('timeout', 'TimeoutError');
  assert.equal(classerErreur(e, 500).detail, 'pas de réponse en 0.5 s');
});

test('vrai 504 Cloudflare en HTML multiligne : détail sur une ligne, sans balises', async () => {
  const page = '<!DOCTYPE html>\n<!--[if lt IE 7]> <html class="no-js"> <![endif]-->\n<head>\n<title>discord.com | 504: Gateway time-out</title>\n</head>\n<body>…</body>';
  const { fetchImpl } = faux(new Response(page, { status: 504, headers: { 'Content-Type': 'text/html' } }));
  const r = await envoyerDiscord(WEBHOOK, {}, { fetchImpl });
  assert.equal(r.etat, 'incertain');
  assert.equal(r.detail, 'HTTP 504 (discord.com | 504: Gateway time-out)');
  assert.equal(resumeCorps('ligne 1\n  ligne 2'), 'ligne 1 ligne 2');
});

test('les redirections sont refusées, pas suivies', async () => {
  const { fetchImpl, appels } = faux(rep(200, '{"id":"1"}'));
  await envoyerDiscord(WEBHOOK, {}, { fetchImpl });
  assert.equal(appels[0].options.redirect, 'error');
});

/* Vrai serveur local : éprouve la forme réelle des erreurs de Node, pas celle qu'on imagine. */
async function serveurLocal(gestion) {
  const serveur = createServer(gestion);
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  return { serveur, url: `http://127.0.0.1:${serveur.address().port}/api/webhooks/1/x` };
}

test('Node réel : une redirection 302 donne un échec, pas un faux succès', async () => {
  const { serveur, url } = await serveurLocal((req, res) => {
    if (req.method === 'POST') { res.writeHead(302, { Location: '/ailleurs' }); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"id":"webhook"}');
  });
  try {
    const r = await envoyerDiscord(url, {}, { delaiMs: 5000 });
    assert.equal(r.etat, 'echec', JSON.stringify(r));
  } finally { serveur.close(); }
});

test('Node réel : port fermé, échec (rien n’est parti)', async () => {
  const { serveur, url } = await serveurLocal(() => {});
  await new Promise((ok) => serveur.close(ok));
  const r = await envoyerDiscord(url, {}, { delaiMs: 5000 });
  assert.equal(r.etat, 'echec', JSON.stringify(r));
});

test('Node réel : 504 avec page HTML, incertain', async () => {
  const { serveur, url } = await serveurLocal((req, res) => {
    res.writeHead(504, { 'Content-Type': 'text/html' });
    res.end('<html>\n<head><title>504 Gateway Time-out</title></head>\n</html>');
  });
  try {
    assert.deepEqual(await envoyerDiscord(url, {}, { delaiMs: 5000 }), { etat: 'incertain', detail: 'HTTP 504 (504 Gateway Time-out)' });
  } finally { serveur.close(); }
});

async function avecCleResend(f) {
  const avant = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = 'cle-de-test';
  try { return await f(); } finally {
    if (avant === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = avant;
  }
}

test('email d’incertitude : clé par script, jour et texte, consigne propre à l’appelant', () => avecCleResend(async () => {
  const { fetchImpl, appels } = faux(rep(200, '{"id":"e1"}'));
  const base = { script: 'publie-cote', salon: 'le salon Pokémon', detail: 'HTTP 504', consigne: 'Ne relance PAS le workflow.', fetchImpl };
  assert.equal(await signalerIncertain({ ...base, contenu: 'Top des hausses' }), true);
  await signalerIncertain({ ...base, contenu: 'Un autre texte' });
  const [c1, c2] = appels.map((a) => a.options.headers['Idempotency-Key']);
  assert.match(c1, /^discord-incertain\/publie-cote\/\d{4}-\d{2}-\d{2}\/[0-9a-f]{16}$/);
  assert.notEqual(c1, c2, 'un second incident du jour doit avoir sa propre clé');
  const corps = JSON.parse(appels[0].options.body);
  assert.match(corps.text, /Regarde le salon Pokémon/);
  assert.match(corps.text, /Ne relance PAS le workflow/);
  assert.match(corps.text, /Top des hausses/);
  const tirets = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
  assert.ok(!tirets.test(corps.text + corps.subject), 'aucun tiret long');
  assert.ok(appels[0].options.signal, 'l’appel à Resend doit être borné dans le temps');
}));

test('email d’incertitude : 409 (même clé, donc même texte) vaut « déjà envoyé »', () => avecCleResend(async () => {
  const { fetchImpl } = faux(rep(409, '{}'));
  assert.equal(await signalerIncertain({ script: 's', salon: 'le salon x', detail: 'd', contenu: 'c', fetchImpl }), true);
}));

test('email d’incertitude : un échec de Resend renvoie false, pour faire échouer l’étape', () => avecCleResend(async () => {
  for (const reponse of [rep(500, '{}'), rep(429, '{}'), erreurReseau('ECONNRESET')]) {
    const { fetchImpl } = faux(reponse);
    assert.equal(await signalerIncertain({ script: 's', salon: 'le salon x', detail: 'd', contenu: 'c', fetchImpl }), false);
  }
}));

test('email d’incertitude : sans RESEND_API_KEY, false', async () => {
  const avant = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  try {
    assert.equal(await signalerIncertain({ script: 's', salon: 'le salon x', detail: 'd', contenu: 'c' }), false);
  } finally {
    if (avant !== undefined) process.env.RESEND_API_KEY = avant;
  }
});

