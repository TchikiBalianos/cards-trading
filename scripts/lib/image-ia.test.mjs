import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  FOURNISSEURS, secretsManquants, fournisseursConfigures, construireRequete, verifierPrompt,
  formatImage, extraireCloudflare, extraireGemini, genererImage,
} from './image-ia.mjs';

const ENV = { CLOUDFLARE_ACCOUNT_ID: 'compte123', CLOUDFLARE_API_TOKEN: 'jeton-secret-cf', GEMINI_API_KEY: 'cle-secrete-gemini' };

const image = (format) => sharp({ create: { width: 8, height: 8, channels: 3, background: '#2997ff' } })[format]().toBuffer();
const reponse = (statut, corps, entetes = { 'content-type': 'application/json' }) =>
  new Response(typeof corps === 'string' || Buffer.isBuffer(corps) ? corps : JSON.stringify(corps), { status: statut, headers: entetes });

/* ── Secrets et validation ─────────────────────────────────── */

test('un secret vide compte pour absent (GitHub passe les secrets absents en chaîne vide)', () => {
  assert.deepEqual(secretsManquants('gemini', { GEMINI_API_KEY: '' }), ['GEMINI_API_KEY']);
  assert.deepEqual(secretsManquants('gemini', { GEMINI_API_KEY: '   ' }), ['GEMINI_API_KEY']);
  assert.deepEqual(secretsManquants('cloudflare', { CLOUDFLARE_API_TOKEN: 'x' }), ['CLOUDFLARE_ACCOUNT_ID']);
  assert.deepEqual(secretsManquants('gemini', ENV), []);
});

test('fournisseursConfigures ne garde que ceux dont tous les secrets sont là', () => {
  assert.deepEqual(fournisseursConfigures({ GEMINI_API_KEY: 'k' }), ['gemini']);
  assert.deepEqual(fournisseursConfigures({ CLOUDFLARE_ACCOUNT_ID: 'a' }), []);
  assert.deepEqual(fournisseursConfigures(ENV), ['cloudflare', 'gemini']);
});

test('un fournisseur inconnu est refusé, y compris les noms hérités d\'Object', () => {
  for (const nom of ['openai', 'constructor', '__proto__', 'toString']) {
    assert.throws(() => secretsManquants(nom, ENV), /Fournisseur inconnu/, nom);
    assert.throws(() => construireRequete(nom, { prompt: 'x', env: ENV }), /Fournisseur inconnu/, nom);
  }
});

test('verifierPrompt : vide et trop long refusés', () => {
  assert.throws(() => verifierPrompt(''), /vide/);
  assert.throws(() => verifierPrompt('   '), /vide/);
  assert.throws(() => verifierPrompt(undefined), /vide/);
  assert.throws(() => verifierPrompt('a'.repeat(2049)), /trop long/);
  assert.doesNotThrow(() => verifierPrompt('a'.repeat(2048)));
});

/* ── Construction des requêtes ─────────────────────────────── */

test('requête Cloudflare : URL du modèle, jeton en Bearer, prompt et 4 étapes par défaut', () => {
  const { url, init, modele } = construireRequete('cloudflare', { prompt: 'une table', env: ENV });
  assert.equal(modele, '@cf/black-forest-labs/flux-1-schnell');
  assert.equal(url, 'https://api.cloudflare.com/client/v4/accounts/compte123/ai/run/@cf/black-forest-labs/flux-1-schnell');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer jeton-secret-cf');
  assert.deepEqual(JSON.parse(init.body), { prompt: 'une table', steps: 4 });
});

test('requête Cloudflare : les étapes restent dans 1 à 8', () => {
  const pas = (etapes) => JSON.parse(construireRequete('cloudflare', { prompt: 'x', env: ENV, etapes }).init.body).steps;
  assert.equal(pas(99), 8);
  assert.equal(pas(0), 1);
  assert.equal(pas(6), 6);
});

test('requête Cloudflare : l\'identifiant de compte est encodé dans l\'URL', () => {
  const { url } = construireRequete('cloudflare', { prompt: 'x', env: { ...ENV, CLOUDFLARE_ACCOUNT_ID: 'a/../b' } });
  assert.ok(url.includes('/accounts/a%2F..%2Fb/ai/run/'), url);
});

test('requête Gemini : API interactions, clé en en-tête, texte et ratio demandés', () => {
  const { url, init, modele } = construireRequete('gemini', { prompt: 'une boutique', env: ENV, ratio: '4:5' });
  assert.equal(modele, 'gemini-3.1-flash-lite-image');
  assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
  assert.equal(init.headers['x-goog-api-key'], 'cle-secrete-gemini');
  assert.deepEqual(JSON.parse(init.body), {
    model: 'gemini-3.1-flash-lite-image',
    input: [{ type: 'text', text: 'une boutique' }],
    response_format: { type: 'image', aspect_ratio: '4:5' },
  });
  assert.ok(!url.includes('cle-secrete-gemini'), 'la clé ne doit jamais figurer dans l\'URL');
});

test('requête Gemini : GEMINI_MODELE remplace le modèle par défaut, une valeur vide non', () => {
  assert.equal(construireRequete('gemini', { prompt: 'x', env: { ...ENV, GEMINI_MODELE: 'gemini-3.1-flash-image' } }).modele, 'gemini-3.1-flash-image');
  assert.equal(construireRequete('gemini', { prompt: 'x', env: { ...ENV, GEMINI_MODELE: '  ' } }).modele, 'gemini-3.1-flash-lite-image');
});

test('secret absent : l\'erreur nomme la variable, jamais une valeur', () => {
  assert.throws(
    () => construireRequete('cloudflare', { prompt: 'x', env: { CLOUDFLARE_API_TOKEN: 'jeton-secret-cf' } }),
    (e) => e.message.includes('CLOUDFLARE_ACCOUNT_ID') && !e.message.includes('jeton-secret-cf'),
  );
});

/* ── Format et extraction ──────────────────────────────────── */

test('formatImage reconnaît JPEG, PNG et WebP par leurs premiers octets', async () => {
  assert.equal(formatImage(await image('jpeg')), 'jpeg');
  assert.equal(formatImage(await image('png')), 'png');
  assert.equal(formatImage(await image('webp')), 'webp');
  assert.throws(() => formatImage(Buffer.from('<html>erreur</html>')), /ni JPEG, ni PNG, ni WebP/);
  assert.throws(() => formatImage(Buffer.alloc(0)), /ni JPEG/);
});

test('extraireCloudflare lit result.image en base64', async () => {
  const jpeg = await image('jpeg');
  assert.deepEqual(extraireCloudflare({ result: { image: jpeg.toString('base64') }, success: true }), jpeg);
  assert.throws(() => extraireCloudflare({ result: {} }), /sans image/);
  assert.throws(() => extraireCloudflare({}), /sans image/);
});

test('extraireGemini prend le DERNIER bloc image des étapes (le rendu final)', () => {
  const json = {
    steps: [
      { type: 'model_output', content: [{ type: 'image', data: Buffer.from('intermediaire').toString('base64') }] },
      { type: 'model_output', content: [{ type: 'text', text: 'voici' }, { type: 'image', data: Buffer.from('final').toString('base64') }] },
    ],
  };
  assert.equal(extraireGemini(json).toString(), 'final');
});

test('extraireGemini ignore une image qui figurerait dans l\'entrée répétée', () => {
  const json = {
    input: [{ type: 'image', data: Buffer.from('envoyee').toString('base64') }],
    steps: [{ type: 'model_output', content: [{ type: 'image', data: Buffer.from('produite').toString('base64') }] }],
  };
  assert.equal(extraireGemini(json).toString(), 'produite');
});

test('extraireGemini : sans image, l\'erreur donne les étapes reçues et le texte du modèle', () => {
  const json = { steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Je ne peux pas générer cette image.' }] }] };
  assert.throws(() => extraireGemini(json), (e) =>
    /sans image/.test(e.message) && e.message.includes('model_output') && e.message.includes('Je ne peux pas générer'));
  assert.throws(() => extraireGemini({}), /étapes : aucune/);
});

/* ── genererImage, sans réseau ─────────────────────────────── */

test('genererImage Cloudflare : appelle l\'URL du modèle et décode le JPEG', async () => {
  const jpeg = await image('jpeg');
  const appels = [];
  const fetchImpl = async (url, init) => {
    appels.push({ url, init });
    return reponse(200, { result: { image: jpeg.toString('base64') }, success: true, errors: [], messages: [] });
  };
  const r = await genererImage('cloudflare', 'une table', { env: ENV, fetchImpl });
  assert.equal(appels.length, 1);
  assert.ok(appels[0].url.endsWith('/ai/run/@cf/black-forest-labs/flux-1-schnell'));
  assert.ok(appels[0].init.signal, 'un délai maximal doit être armé');
  assert.deepEqual(r.octets, jpeg);
  assert.equal(r.format, 'jpeg');
  assert.equal(r.fournisseur, 'cloudflare');
  assert.equal(typeof r.ms, 'number');
});

test('genererImage Gemini : décode l\'image du dernier bloc', async () => {
  const png = await image('png');
  const fetchImpl = async () => reponse(200, { id: 'i1', steps: [{ type: 'model_output', content: [{ type: 'image', data: png.toString('base64') }] }] });
  const r = await genererImage('gemini', 'une boutique', { env: ENV, fetchImpl });
  assert.equal(r.format, 'png');
  assert.equal(r.modele, 'gemini-3.1-flash-lite-image');
});

test('genererImage : une réponse image brute est acceptée (certains modèles Workers AI)', async () => {
  const png = await image('png');
  const fetchImpl = async () => reponse(200, png, { 'content-type': 'image/png' });
  const r = await genererImage('cloudflare', 'x', { env: ENV, fetchImpl });
  assert.deepEqual(r.octets, png);
  assert.equal(r.format, 'png');
});

test('genererImage : HTTP 429 lève une erreur avec `statut` et le message de l\'API, sans la clé', async () => {
  const fetchImpl = async () => reponse(429, { error: { code: 429, message: 'Quota exceeded for image generation', status: 'RESOURCE_EXHAUSTED' } });
  await assert.rejects(
    () => genererImage('gemini', 'x', { env: ENV, fetchImpl }),
    (e) => e.statut === 429 && /HTTP 429 Quota exceeded/.test(e.message) && !e.message.includes('cle-secrete-gemini'),
  );
});

test('genererImage : erreur Cloudflare au format { errors: [...] }', async () => {
  const fetchImpl = async () => reponse(401, { success: false, errors: [{ code: 10000, message: 'Authentication error' }] });
  await assert.rejects(() => genererImage('cloudflare', 'x', { env: ENV, fetchImpl }), (e) => e.statut === 401 && /Authentication error/.test(e.message));
});

test('genererImage : HTTP 200 avec success:false est un échec', async () => {
  const fetchImpl = async () => reponse(200, { success: false, errors: [{ message: 'Model overloaded' }] });
  await assert.rejects(() => genererImage('cloudflare', 'x', { env: ENV, fetchImpl }), /refus de l'API Model overloaded/);
});

test('genererImage : corps non JSON en 200, et page HTML en 502', async () => {
  await assert.rejects(() => genererImage('gemini', 'x', { env: ENV, fetchImpl: async () => reponse(200, 'pas du json', { 'content-type': 'text/plain' }) }), /non JSON/);
  await assert.rejects(
    () => genererImage('gemini', 'x', { env: ENV, fetchImpl: async () => reponse(502, '<html>Bad gateway</html>', { 'content-type': 'text/html' }) }),
    (e) => e.statut === 502 && /Bad gateway/.test(e.message),
  );
});

test('genererImage : panne réseau et délai dépassé sont nommés, sans secret', async () => {
  await assert.rejects(
    () => genererImage('gemini', 'x', { env: ENV, fetchImpl: async () => { throw new TypeError('fetch failed'); } }),
    (e) => /appel impossible \(fetch failed\)/.test(e.message) && e.statut === undefined,
  );
  await assert.rejects(
    () => genererImage('gemini', 'x', { env: ENV, delaiMs: 5000, fetchImpl: async () => { throw new DOMException('timeout', 'TimeoutError'); } }),
    /délai de 5 s dépassé/,
  );
});

test('genererImage : des octets qui ne sont pas une image sont refusés', async () => {
  const fetchImpl = async () => reponse(200, { result: { image: Buffer.from('ceci n\'est pas une image').toString('base64') } });
  await assert.rejects(() => genererImage('cloudflare', 'x', { env: ENV, fetchImpl }), /ni JPEG, ni PNG, ni WebP/);
});

test('FOURNISSEURS : deux fournisseurs, secrets déclarés', () => {
  assert.deepEqual(Object.keys(FOURNISSEURS), ['cloudflare', 'gemini']);
  assert.deepEqual(FOURNISSEURS.gemini.secrets, ['GEMINI_API_KEY']);
});
