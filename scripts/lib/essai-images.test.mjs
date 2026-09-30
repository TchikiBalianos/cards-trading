import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  SCENES, STYLE, inviteDe, verifierScenes, resoudreFournisseurs, planche, lancerEssai,
} from './essai-images.mjs';

const ENV_GEMINI = { GEMINI_API_KEY: 'cle-secrete-gemini' };
const ENV_DEUX = { ...ENV_GEMINI, CLOUDFLARE_ACCOUNT_ID: 'compte', CLOUDFLARE_API_TOKEN: 'jeton-secret-cf' };

const jpeg = () => sharp({ create: { width: 64, height: 36, channels: 3, background: '#2997ff' } }).jpeg().toBuffer();

/* Faux générateur : image valide, ou échec programmé pour certains appels. */
async function faux({ echecs = {} } = {}) {
  const octets = await jpeg();
  const appels = [];
  const generer = async (fournisseur, invite) => {
    appels.push({ fournisseur, invite });
    const erreur = echecs[`${fournisseur}#${appels.filter((a) => a.fournisseur === fournisseur).length}`];
    if (erreur) throw Object.assign(new Error(erreur.message), { statut: erreur.statut });
    return { fournisseur, modele: 'modele-test', octets, format: 'jpeg', ms: 4200 };
  };
  return { generer, appels };
}

async function dossierTemporaire(corps) {
  const dossier = await mkdtemp(join(tmpdir(), 'essai-images-'));
  try { return await corps(dossier); } finally { await rm(dossier, { recursive: true, force: true }); }
}

/* ── Scènes ────────────────────────────────────────────────── */

test('les scènes de l\'essai respectent les règles (pas de licence, pas de texte, pas de vraies cartes)', () => {
  assert.doesNotThrow(() => verifierScenes());
  assert.equal(SCENES.length, 5);
  for (const s of SCENES) {
    assert.ok(inviteDe(s).length <= 2048, s.id);
    assert.ok(inviteDe(s).endsWith(STYLE), s.id);
  }
});

test('verifierScenes refuse une scène qui nomme une licence, même accentuée ou en majuscules', () => {
  for (const nom of ['Pokémon', 'POKEMON', 'One Piece', 'Star Wars', 'Yu-Gi-Oh', 'Dragon Ball']) {
    assert.throws(
      () => verifierScenes([{ id: 'x', libelle: 'x', prompt: `A table with ${nom} cards` }]),
      /propriété d'un éditeur/,
      nom,
    );
  }
});

test('verifierScenes refuse les doublons, les identifiants douteux et les listes hors bornes', () => {
  const s = (id) => ({ id, libelle: id, prompt: 'A quiet shop' });
  assert.throws(() => verifierScenes([s('a'), s('a')]), /en double/);
  assert.throws(() => verifierScenes([s('../a')]), /invalide/);
  assert.throws(() => verifierScenes([]), /Entre 1 et 8/);
  assert.throws(() => verifierScenes(Array.from({ length: 9 }, (_, i) => s(`s${i}`))), /Entre 1 et 8/);
});

/* ── Choix des fournisseurs ────────────────────────────────── */

test('« tous » écarte et signale les fournisseurs sans secret', () => {
  const { actifs, ignores } = resoudreFournisseurs('tous', ENV_GEMINI);
  assert.deepEqual(actifs, ['gemini']);
  assert.deepEqual(ignores, [{ fournisseur: 'cloudflare', manquants: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'] }]);
});

test('un fournisseur nommé sans secret est une erreur, sauf en essai à blanc', () => {
  assert.throws(() => resoudreFournisseurs('cloudflare', {}), /secret absent \(CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN\)/);
  assert.deepEqual(resoudreFournisseurs('cloudflare', {}, true), { actifs: ['cloudflare'], ignores: [] });
  assert.deepEqual(resoudreFournisseurs('tous', {}, true).actifs, ['cloudflare', 'gemini']);
  assert.throws(() => resoudreFournisseurs('midjourney', ENV_DEUX), /Choix inconnu/);
});

/* ── Planche contact ───────────────────────────────────────── */

test('planche : dimensions calculées sur la grille, échec affiché dans sa case', async () => {
  const buffer = await jpeg();
  const base = (fournisseur, scene) => ({ fournisseur, scene, libelle: scene });
  const resultats = [
    { ...base('cloudflare', 'a'), ok: true, buffer, ms: 3100, octets: 210000 },
    { ...base('cloudflare', 'b'), ok: false, erreur: 'HTTP 500 Internal error' },
    { ...base('gemini', 'a'), ok: true, buffer, ms: 5400, octets: 480000 },
    { ...base('gemini', 'b'), ok: true, buffer, ms: 5100, octets: 450000 },
  ];
  const meta = await sharp(await planche(resultats, { titre: 'Titre', sousTitre: 'Sous-titre' })).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.equal(meta.width, 16 + 2 * (420 + 16));          // 2 scènes
  assert.equal(meta.height, 64 + 2 * (236 + 46 + 16));    // 2 fournisseurs
});

/* ── Déroulé de l'essai ────────────────────────────────────── */

test('essai complet : images écrites, planche et rapport produits, rapport sans octets ni secret', async () => {
  await dossierTemporaire(async (sortie) => {
    const { generer, appels } = await faux();
    const journal = [];
    const { resultats } = await lancerEssai({ choix: 'gemini', sortie, env: ENV_GEMINI, generer, journal: (l) => journal.push(l) });

    assert.equal(appels.length, 5);
    assert.equal(resultats.filter((r) => r.ok).length, 5);
    const fichiers = (await readdir(sortie)).sort();
    assert.deepEqual(fichiers, [
      'gemini-01-table-de-jeu.jpg', 'gemini-02-boutique-nuit.jpg', 'gemini-03-echange-mains.jpg',
      'gemini-04-classeur.jpg', 'gemini-05-salle-tournoi.jpg', 'planche-contact.jpg', 'rapport.json',
    ]);
    assert.ok((await stat(join(sortie, 'planche-contact.jpg'))).size > 1000);

    const brut = await readFile(join(sortie, 'rapport.json'), 'utf8');
    const rapport = JSON.parse(brut);
    assert.equal(rapport.resultats.length, 5);
    assert.ok(rapport.resultats.every((r) => !('buffer' in r)));
    assert.ok(!brut.includes('cle-secrete-gemini'));
    assert.ok(!journal.join('\n').includes('cle-secrete-gemini'));
  });
});

test('chaque appel reçoit la scène ET le style commun (les interdits sont dits au modèle)', async () => {
  await dossierTemporaire(async (sortie) => {
    const { generer, appels } = await faux();
    await lancerEssai({ choix: 'gemini', nombre: 2, sortie, env: ENV_GEMINI, generer, journal: () => {} });
    assert.equal(appels.length, 2);
    assert.equal(appels[0].invite, inviteDe(SCENES[0]));
    assert.ok(appels[0].invite.includes('No text'));
    assert.ok(appels[0].invite.includes('no real trading cards'));
  });
});

test('le nombre de scènes est borné entre 1 et 5, une valeur absurde retombe sur 5', async () => {
  await dossierTemporaire(async (sortie) => {
    for (const [nombre, attendu] of [[2, 2], [99, 5], [0, 1], [NaN, 5], [undefined, 5]]) {
      const { generer, appels } = await faux();
      await lancerEssai({ choix: 'gemini', nombre, sortie, env: ENV_GEMINI, generer, journal: () => {} });
      assert.equal(appels.length, attendu, `nombre=${nombre}`);
    }
  });
});

test('un 429 arrête CE fournisseur (inutile d\'insister), l\'autre continue', async () => {
  await dossierTemporaire(async (sortie) => {
    const { generer, appels } = await faux({ echecs: { 'cloudflare#1': { message: 'cloudflare : HTTP 429 quota', statut: 429 } } });
    const journal = [];
    const { resultats } = await lancerEssai({ choix: 'tous', sortie, env: ENV_DEUX, generer, journal: (l) => journal.push(l) });

    assert.equal(appels.filter((a) => a.fournisseur === 'cloudflare').length, 1, 'une seule tentative Cloudflare');
    assert.equal(appels.filter((a) => a.fournisseur === 'gemini').length, 5);
    assert.equal(resultats.filter((r) => r.fournisseur === 'cloudflare').length, 1);
    assert.ok(journal.some((l) => l.startsWith('::warning::cloudflare : accès ou quota')));
    assert.ok((await readdir(sortie)).includes('planche-contact.jpg'), 'la planche garde ce qui a réussi');
  });
});

test('un échec ordinaire ne concerne que sa scène, les suivantes sont tentées', async () => {
  await dossierTemporaire(async (sortie) => {
    const { generer, appels } = await faux({ echecs: { 'gemini#2': { message: 'gemini : réponse sans image', statut: undefined } } });
    const { resultats } = await lancerEssai({ choix: 'gemini', sortie, env: ENV_GEMINI, generer, journal: () => {} });
    assert.equal(appels.length, 5);
    assert.deepEqual(resultats.map((r) => r.ok), [true, false, true, true, true]);
  });
});

test('essai à blanc : aucun appel, rien d\'écrit, aucun secret requis', async () => {
  const dossier = await mkdtemp(join(tmpdir(), 'essai-blanc-'));
  const sortie = join(dossier, 'jamais-cree');
  try {
    const { generer, appels } = await faux();
    const journal = [];
    const r = await lancerEssai({ choix: 'tous', sortie, env: {}, seulementPlan: true, generer, journal: (l) => journal.push(l) });
    assert.equal(appels.length, 0);
    assert.deepEqual(r.resultats, []);
    await assert.rejects(() => stat(sortie), /ENOENT/);
    assert.ok(journal.some((l) => l.includes('table-de-jeu')));
    assert.ok(journal.some((l) => l.includes('Essai à blanc')));
  } finally {
    await rm(dossier, { recursive: true, force: true });
  }
});

test('« tous » sans aucun secret : erreur qui nomme ce qui manque', async () => {
  await assert.rejects(
    () => lancerEssai({ choix: 'tous', env: {}, generer: async () => { throw new Error('ne doit pas être appelé'); }, journal: () => {} }),
    /Aucun fournisseur configuré.*CLOUDFLARE_ACCOUNT_ID.*GEMINI_API_KEY/s,
  );
});

test('si tout échoue, pas de planche mais le rapport dit pourquoi', async () => {
  await dossierTemporaire(async (sortie) => {
    const { generer } = await faux({ echecs: { 'gemini#1': { message: 'gemini : HTTP 403 clé refusée', statut: 403 } } });
    const { resultats } = await lancerEssai({ choix: 'gemini', sortie, env: ENV_GEMINI, generer, journal: () => {} });
    assert.equal(resultats.length, 1);
    assert.deepEqual((await readdir(sortie)).sort(), ['rapport.json']);
    const rapport = JSON.parse(await readFile(join(sortie, 'rapport.json'), 'utf8'));
    assert.match(rapport.resultats[0].erreur, /HTTP 403/);
  });
});
