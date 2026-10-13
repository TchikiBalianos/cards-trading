import test from 'node:test';
import assert from 'node:assert/strict';
import { PALIERS, PALIER_LE_PLUS_SOUPLE, confirmationAvg7, passeLePalier, motifReferenceFigee } from './cote-paliers.mjs';

const candidat = (variationBrute, confirmationBrute) => ({ variationBrute, confirmationBrute });

test('les paliers vont du plus strict au plus souple, sans confirmation nulle', () => {
  for (let i = 1; i < PALIERS.length; i++) {
    assert.ok(PALIERS[i].variation <= PALIERS[i - 1].variation);
    assert.ok(PALIERS[i].confirmation <= PALIERS[i - 1].confirmation);
  }
  assert.ok(PALIER_LE_PLUS_SOUPLE.confirmation > 0);
  assert.deepEqual(PALIERS[0], { nom: 'strict', variation: 12, confirmation: 15 });
});

test('confirmationAvg7 : écart en % de avg7 sur la base, null si une moyenne manque', () => {
  assert.equal(Math.round(confirmationAvg7(491.45, 410.13) * 10) / 10, 19.8);
  assert.ok(confirmationAvg7(242.8, 271.21) < 0);
  assert.equal(confirmationAvg7(null, 100), null);
  assert.equal(confirmationAvg7(0, 100), null);
  assert.equal(confirmationAvg7(100, 0), null);
});

test('relevé du 13 octobre 2026 : aucune carte au palier strict, trois au souple', () => {
  // Valeurs exactes du relevé : variation (cote du jour contre avg30) et confirmation (avg7 contre avg30), en %.
  const releve = [
    ['Flagadoss', 14.106, 4.975],
    ['Pikachu-ex', 11.849, -2.774],
    ['Méga-Momartik-ex', 10.892, -2.920],
    ['Méga-Dracolosse-ex', 10.043, 17.590],
    ['Méga-Ectoplasma-ex', 8.121, 8.479],
    ['Rexillius', 4.949, 4.266],
    ['Espièglerie de Margie', 4.496, 6.399],
    ['Nostenfer', 3.863, 15.451],
  ].map(([nom, v, c]) => ({ nom, ...candidat(v, c) }));
  const noms = (p) => releve.filter((c) => passeLePalier(c, p)).map((c) => c.nom);
  assert.deepEqual(noms(PALIERS[0]), []);
  // Flagadoss monte de 14 % mais ses ventes de la semaine ne dépassent leur moyenne du mois que de 4,98 %.
  assert.deepEqual(noms(PALIERS[1]), ['Méga-Dracolosse-ex', 'Méga-Ectoplasma-ex']);
  assert.deepEqual(noms(PALIERS[2]), ['Flagadoss', 'Méga-Dracolosse-ex', 'Méga-Ectoplasma-ex']);
  assert.equal(noms(PALIERS[3]).length, 6);
  // Pikachu-ex monte sur sa cote du jour mais ses ventes de la semaine sont sous la moyenne du mois.
  assert.ok(!noms(PALIER_LE_PLUS_SOUPLE).includes('Pikachu-ex'));
});

test('une hausse non confirmée sur 7 jours ne passe aucun palier, même forte', () => {
  for (const p of PALIERS) assert.equal(passeLePalier(candidat(56, 0), p), false);
  for (const p of PALIERS) assert.equal(passeLePalier(candidat(40, -5), p), false);
});

test('base sur 30 jours figée : détectée par rapport à une publication d’un autre jour', () => {
  const publications = [{ date: '2026-09-24', actuel: 421.28, reference: 346.37 }];
  assert.match(motifReferenceFigee(publications, 346.37, '2026-10-01'), /figée.*2026-09-24/);
  assert.equal(motifReferenceFigee(publications, 410.13, '2026-10-15'), null);
  // Le même jour (relance de la phase « publier ») n'est pas un gel.
  assert.equal(motifReferenceFigee([{ date: '2026-10-15', reference: 410.13 }], 410.13, '2026-10-15'), null);
  assert.equal(motifReferenceFigee(undefined, 1, '2026-10-15'), null);
});
