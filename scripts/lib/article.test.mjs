import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defauts } from './article.mjs';

/* Corps minimal qui passe tous les autres controles : sommaire, FAQ de
   trois questions, et plus de 2000 signes. */
const CORPS_COMPLET = [
  '## Sommaire',
  '- un',
  'x'.repeat(2100),
  '## FAQ',
  '### Une question ?',
  'Reponse.',
  '### Une deuxieme ?',
  'Reponse.',
  '### Une troisieme ?',
  'Reponse.',
].join('\n\n');

const article = (corps, categorie = 'pokemon') => ({
  corps,
  champs: { title: 'T', description: 'D', category: categorie },
});

const AUTRES = [
  { slug: 'guide-demarrage-pokemon-tcg', categorie: 'pokemon' },
  { slug: 'top-cartes-magic-2026', categorie: 'magic' },
];

test('un article sans lien vers un article du meme TCG est refuse', () => {
  const m = defauts(article(CORPS_COMPLET), AUTRES);
  assert.ok(m.some((d) => /lien interne/i.test(d)), m.join(' | '));
});

test('un lien vers un article du meme TCG suffit', () => {
  const corps = CORPS_COMPLET + '\n\nVoir [notre guide](/blog/guide-demarrage-pokemon-tcg/).';
  assert.deepEqual(defauts(article(corps), AUTRES), []);
});

test('un lien vers un autre TCG ne compte pas', () => {
  const corps = CORPS_COMPLET + '\n\nVoir [Magic](/blog/top-cartes-magic-2026/).';
  const m = defauts(article(corps), AUTRES);
  assert.ok(m.some((d) => /lien interne/i.test(d)));
});

test('le premier article d un TCG n est pas bloque', () => {
  const seul = [{ slug: 'top-cartes-magic-2026', categorie: 'magic' }];
  assert.deepEqual(defauts(article(CORPS_COMPLET), seul), []);
});

test('sans contexte, le comportement d avant est preserve', () => {
  assert.deepEqual(defauts(article(CORPS_COMPLET)), []);
});

test('le motif nomme un exemple de cible', () => {
  const m = defauts(article(CORPS_COMPLET), AUTRES);
  const ligne = m.find((d) => /lien interne/i.test(d));
  assert.match(ligne, /guide-demarrage-pokemon-tcg/);
});

/* Les controles preexistants ne doivent pas avoir bouge. */
test('un article sans sommaire reste refuse', () => {
  const corps = CORPS_COMPLET.replace('## Sommaire', '');
  assert.ok(defauts(article(corps), []).includes('sommaire'));
});

test('une FAQ trop courte reste refusee', () => {
  const corps = [
    '## Sommaire',
    'x'.repeat(2100),
    '## FAQ',
    '### Une seule question ?',
    'Reponse.',
  ].join('\n\n');
  assert.ok(defauts(article(corps), []).some((d) => /FAQ trop courte/.test(d)));
});

test('une categorie hors enumeration reste refusee', () => {
  const m = defauts(article(CORPS_COMPLET, 'flipo'), []);
  assert.ok(m.some((d) => /hors énumération/.test(d)));
});
