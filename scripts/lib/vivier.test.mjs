import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifierSpec, creditObligatoire } from './visuel-spec.mjs';
import { LICENCES } from './brouillons.mjs';

/* Le vivier de photos (data/visuels/vivier.json) ne garde que des liens : chaque
   entrée doit dire d'où vient l'image et à quel titre on peut la réutiliser. */
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { photos } = JSON.parse(readFileSync(join(RACINE, 'data', 'visuels', 'vivier.json'), 'utf8'));

test('chaque photo du vivier a une licence admise, un crédit et une source', () => {
  const ids = new Set();
  for (const p of photos) {
    assert.ok(!ids.has(p.id), `identifiant en double : ${p.id}`);
    ids.add(p.id);
    assert.ok(['unsplash', 'propre', 'autorisation'].includes(p.licence), `${p.id} : licence « ${p.licence} »`);
    assert.doesNotThrow(() => verifierSpec({ type: 'photo', image: p.image, credit: p.credit }), p.id);
    assert.match(p.verifie_le || '', /^\d{4}-\d{2}-\d{2}$/, `${p.id} : date de vérification`);
    assert.ok((p.licences_tcg || []).length && p.licences_tcg.every((l) => LICENCES.includes(l)), `${p.id} : licences_tcg`);
    if (p.licence === 'unsplash') {
      assert.equal(creditObligatoire(p), false, `${p.id} : une photo Unsplash doit venir de images.unsplash.com`);
      assert.match(p.page, /^https:\/\/unsplash\.com\/photos\//, `${p.id} : page source`);
    }
    if (p.licence === 'autorisation') assert.match(p.preuve || '', /^https:\/\//, `${p.id} : lien vers l'accord écrit`);
    if (p.licence === 'propre') assert.match(p.image, /^https:\/\/cards-trading\.com\/assets\/social\/photos\//, `${p.id} : photo propre servie par le site`);
  }
});
