import { test } from 'node:test';
import assert from 'node:assert/strict';
import { referenceCarte, idExtensionPokemontcgio, corroborerExtension } from './reference-carte.mjs';

/* ── Forme de la référence ─────────────────────────────── */

test('la reference complete porte le code, le numero et le total imprime', () => {
  assert.deepEqual(referenceCarte({ localId: '286', setCode: 'ASC', setTotal: 217 }), {
    refCourte: 'ASC 286',
    refLongue: 'ASC 286/217',
  });
});

test('le total est aligne sur la largeur du numero, comme a l impression', () => {
  assert.equal(referenceCarte({ localId: '120', setCode: 'POR', setTotal: 88 }).refLongue, 'POR 120/088');
  assert.equal(referenceCarte({ localId: '7', setCode: 'POR', setTotal: 88 }).refLongue, 'POR 7/88');
});

test('une promo sans total garde la seule forme courte', () => {
  assert.deepEqual(referenceCarte({ localId: '206', setCode: 'SVP', setTotal: null }), {
    refCourte: 'SVP 206',
    refLongue: 'SVP 206',
  });
});

test('sans numero ou sans code, aucune reference n est inventee', () => {
  assert.deepEqual(referenceCarte({ localId: null, setCode: 'ASC', setTotal: 217 }), { refCourte: null, refLongue: null });
  assert.deepEqual(referenceCarte({ localId: '12', setCode: '', setTotal: 217 }), { refCourte: null, refLongue: null });
});

/* ── Correspondance d'identifiants ─────────────────────── */

test('les identifiants TCGdex se convertissent vers ceux de pokemontcg.io', () => {
  assert.equal(idExtensionPokemontcgio('me02.5'), 'me2pt5');
  assert.equal(idExtensionPokemontcgio('me03'), 'me3');
  assert.equal(idExtensionPokemontcgio('me10'), 'me10');
  assert.equal(idExtensionPokemontcgio('sv08.5'), 'sv8pt5');
  assert.equal(idExtensionPokemontcgio('swsh12.5'), 'swsh12pt5');
});

test('un identifiant sans equivalent connu ne donne rien, on ne devine pas', () => {
  for (const id of ['SM1p', 'swshp', 'A1', '', null, undefined]) assert.equal(idExtensionPokemontcgio(id), null, String(id));
});

/* ── Recoupement ───────────────────────────────────────── */

const reponse = (status, corps) => ({ ok: status >= 200 && status < 300, status, json: async () => corps });
const rapide = { delaiMs: 0 };
const carteAsc = { setId: 'me02.5', setCode: 'ASC', setTotal: 217, localId: '294' };
const extensionAsc = { data: { printedTotal: 217, total: 295, ptcgoCode: 'ASC' } };

test('deux bases qui donnent le meme total : confirmee', async () => {
  const r = await corroborerExtension(carteAsc, { ...rapide, cache: new Map(), fetchImpl: async () => reponse(200, extensionAsc) });
  assert.equal(r.statut, 'confirmee');
});

test('un total different : divergente, avec l ecart nomme', async () => {
  const r = await corroborerExtension(carteAsc, {
    ...rapide,
    cache: new Map(),
    fetchImpl: async () => reponse(200, { data: { printedTotal: 218, total: 295, ptcgoCode: 'ASC' } }),
  });
  assert.equal(r.statut, 'divergente');
  assert.match(r.ecarts[0], /217.*218/);
});

test('un numero au-dela de l extension est une divergence', async () => {
  const r = await corroborerExtension(
    { ...carteAsc, localId: '400' },
    { ...rapide, cache: new Map(), fetchImpl: async () => reponse(200, extensionAsc) },
  );
  assert.equal(r.statut, 'divergente');
});

test('un code different est note mais ne bloque pas', async () => {
  const r = await corroborerExtension(carteAsc, {
    ...rapide,
    cache: new Map(),
    fetchImpl: async () => reponse(200, { data: { printedTotal: 217, total: 295, ptcgoCode: 'AHR' } }),
  });
  assert.equal(r.statut, 'confirmee');
  assert.equal(r.notes.length, 1);
});

test('une base qui echoue trois fois : indisponible, jamais une erreur', async () => {
  let appels = 0;
  const r = await corroborerExtension(carteAsc, {
    ...rapide,
    cache: new Map(),
    fetchImpl: async () => {
      appels++;
      return reponse(502, null);
    },
  });
  assert.equal(r.statut, 'indisponible');
  assert.equal(appels, 3);
});

test('une erreur reseau est absorbee et le nouvel essai peut reussir', async () => {
  let appels = 0;
  const r = await corroborerExtension(carteAsc, {
    ...rapide,
    cache: new Map(),
    fetchImpl: async () => {
      appels++;
      if (appels === 1) throw new Error('ECONNRESET');
      return reponse(200, extensionAsc);
    },
  });
  assert.equal(r.statut, 'confirmee');
  assert.equal(appels, 2);
});

test('une extension inconnue de la seconde base : indisponible', async () => {
  const r = await corroborerExtension(carteAsc, { ...rapide, cache: new Map(), fetchImpl: async () => reponse(404, null) });
  assert.equal(r.statut, 'indisponible');
});

test('sans equivalent ou sans total, le recoupement est sans objet et n appelle rien', async () => {
  const jamais = async () => {
    throw new Error('ne doit pas etre appele');
  };
  assert.equal((await corroborerExtension({ ...carteAsc, setId: 'SM1p' }, { cache: new Map(), fetchImpl: jamais })).statut, 'non_applicable');
  assert.equal((await corroborerExtension({ ...carteAsc, setTotal: null }, { cache: new Map(), fetchImpl: jamais })).statut, 'non_applicable');
});

test('deux cartes de la meme extension ne font qu un seul appel', async () => {
  let appels = 0;
  const options = {
    ...rapide,
    cache: new Map(),
    fetchImpl: async () => {
      appels++;
      return reponse(200, extensionAsc);
    },
  };
  await corroborerExtension(carteAsc, options);
  await corroborerExtension({ ...carteAsc, localId: '286' }, options);
  assert.equal(appels, 1);
});
