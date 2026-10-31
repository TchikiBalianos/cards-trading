import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nomVignette } from './vignette-article.mjs';

test('sans version, le nom reste celui de toujours', () => {
  assert.equal(nomVignette('mon-article', undefined), 'mon-article.png');
  assert.equal(nomVignette('mon-article', undefined, '-og'), 'mon-article-og.png');
});

test('la version passe avant le suffixe de format', () => {
  assert.equal(nomVignette('mon-article', 2), 'mon-article-v2.png');
  assert.equal(nomVignette('mon-article', 2, '-og'), 'mon-article-v2-og.png');
});

test('le générateur lit la version en texte, la page en nombre : même nom', () => {
  assert.equal(nomVignette('mon-article', '3', '-og'), nomVignette('mon-article', 3, '-og'));
});

test('une version vide, 1 ou invalide ne change pas le nom', () => {
  for (const version of ['', 1, '1', 'deux', 2.5, null]) {
    assert.equal(nomVignette('mon-article', version), 'mon-article.png');
  }
});
