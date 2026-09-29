import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { MOTIFS, motif, choisirMotif, hachage, prng } from './motifs.mjs';

const options = (graine) => ({ graine, accent: '#f4c430', largeur: 1200, hauteur: 630 });

test('hachage : stable, entier, sensible au texte', () => {
  assert.equal(hachage('op18'), hachage('op18'));
  assert.notEqual(hachage('op18'), hachage('op17'));
  assert.ok(Number.isInteger(hachage('op18')));
});

test('prng : même graine, même suite', () => {
  const a = prng(42);
  const b = prng(42);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

test('choisirMotif : toujours l\'une des huit familles', () => {
  for (const slug of ['a', 'op18', 'pokemon-worlds-2026', 'star-wars-cad-bane']) {
    assert.ok(MOTIFS.includes(choisirMotif(hachage(slug))));
  }
});

test('un motif est déterministe : même graine, même dessin', () => {
  for (const nom of MOTIFS) assert.equal(motif(nom, options(7)), motif(nom, options(7)));
});

test('deux graines donnent deux dessins différents', () => {
  for (const nom of MOTIFS) assert.notEqual(motif(nom, options(1)), motif(nom, options(2)), nom);
});

test('chaque famille produit un SVG que sharp sait rendre', async () => {
  for (const nom of MOTIFS) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">${motif(nom, options(hachage(nom)))}</svg>`;
    const meta = await sharp(Buffer.from(svg)).png().metadata();
    assert.equal(meta.width, 1200, nom);
  }
});

test('un motif inconnu est refusé', () => {
  assert.throws(() => motif('inexistant', options(1)), /Motif inconnu/);
});

test('la couleur d\'accent de la licence se retrouve dans le dessin', () => {
  for (const nom of MOTIFS) assert.ok(motif(nom, { ...options(3), accent: '#e5484d' }).includes('#e5484d'), nom);
});
