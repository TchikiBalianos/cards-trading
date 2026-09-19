import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSemaine, semaineNo } from '../prochain-article.mjs';

test('le creneau du vendredi est obligatoire', () => {
  const p = planSemaine(0);
  assert.equal(p.articles[1].jour, 'vendredi');
  assert.equal(p.articles[1].statut, 'obligatoire');
});

test('le creneau du mardi reste obligatoire', () => {
  assert.equal(planSemaine(0).articles[0].statut, 'obligatoire');
});

test('l alternance Pokemon / One Piece est preservee', () => {
  assert.equal(planSemaine(0).articles[0].categorie, 'pokemon');
  assert.equal(planSemaine(1).articles[0].categorie, 'one-piece');
  assert.equal(planSemaine(2).articles[0].categorie, 'pokemon');
});

/*
  Sentinelle sur la constante REF. Si cette assertion casse, c'est que la
  date d'origine a ete modifiee et que TOUT le calendrier, passe comme
  futur, s'est decale. CLAUDE.md l'interdit explicitement.
*/
test('la reference du calendrier n a pas bouge', () => {
  assert.equal(planSemaine(0).lundi, '2026-07-27');
});

test('une semaine anterieure a la reference ne casse pas la rotation', () => {
  assert.ok(['pokemon', 'one-piece'].includes(planSemaine(-3).articles[0].categorie));
});

test('semaineNo est coherent avec planSemaine', () => {
  const n = semaineNo(new Date('2026-07-29T12:00:00Z'));
  assert.equal(planSemaine(n).lundi, '2026-07-27');
});

test('le secondaire tourne sur les autres TCG', () => {
  const vus = new Set();
  for (let n = 0; n < 5; n++) vus.add(planSemaine(n).articles[1].categorie);
  assert.equal(vus.size, 5, 'cinq semaines doivent donner cinq TCG distincts');
  assert.ok(!vus.has('pokemon') && !vus.has('one-piece'));
});
