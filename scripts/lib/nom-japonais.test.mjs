import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nomFrancaisCarteJaponaise as traduire } from './nom-japonais.mjs';

const DRACAUFEU = { fr: 'Dracaufeu', ja: 'リザードン' };

test('le podium japonais du 25 octobre 2026 ressort en français complet', () => {
  assert.deepEqual(traduire('ライチュウGX', { fr: 'Raichu', ja: 'ライチュウ' }), { nom: 'Raichu-GX', simple: true });
  assert.deepEqual(traduire('メガリザードンXex', DRACAUFEU), { nom: 'Méga-Dracaufeu X-ex', simple: true });
  assert.deepEqual(traduire('メガレックウザex', { fr: 'Rayquaza', ja: 'レックウザ' }), { nom: 'Méga-Rayquaza-ex', simple: true });
});

test('espèce seule, et les mécaniques des différentes ères', () => {
  assert.equal(traduire('リザードン', DRACAUFEU).nom, 'Dracaufeu');
  assert.equal(traduire('リザードンex', DRACAUFEU).nom, 'Dracaufeu-ex');
  assert.equal(traduire('リザードンEX', DRACAUFEU).nom, 'Dracaufeu-EX');
  assert.equal(traduire('リザードンV', DRACAUFEU).nom, 'Dracaufeu V');
  assert.equal(traduire('リザードンVMAX', DRACAUFEU).nom, 'Dracaufeu VMAX');
  assert.equal(traduire('リザードンVSTAR', DRACAUFEU).nom, 'Dracaufeu VSTAR');
  assert.equal(traduire('MリザードンEX', DRACAUFEU).nom, 'M-Dracaufeu-EX');
});

test('caractères pleine chasse normalisés', () => {
  assert.equal(traduire('リザードンＧＸ', DRACAUFEU).nom, 'Dracaufeu-GX');
});

test('formes régionales, Brillant et Radieux : construites mais à vérifier', () => {
  assert.deepEqual(traduire('アローラロコン', { fr: 'Goupix', ja: 'ロコン' }), { nom: "Goupix d'Alola", simple: false });
  assert.deepEqual(traduire('ヒスイゾロアークVSTAR', { fr: 'Zoroark', ja: 'ゾロアーク' }), { nom: 'Zoroark de Hisui VSTAR', simple: false });
  assert.deepEqual(traduire('ひかるレックウザ', { fr: 'Rayquaza', ja: 'レックウザ' }), { nom: 'Rayquaza Brillant', simple: false });
  assert.deepEqual(traduire('かがやくリザードン', DRACAUFEU), { nom: 'Dracaufeu Radieux', simple: false });
});

test('tout élément inconnu écarte la carte plutôt que de deviner', () => {
  assert.equal(traduire('エリカのモンジャラ', { fr: 'Saquedeneu', ja: 'モンジャラ' }), null);
  assert.equal(traduire('ピカチュウ&ゼクロムGX', { fr: 'Pikachu', ja: 'ピカチュウ' }), null);
  assert.equal(traduire('リザードンV-UNION', DRACAUFEU), null);
  assert.equal(traduire('ロケット団のニャース', { fr: 'Miaouss', ja: 'ニャース' }), null);
  assert.equal(traduire('メガリザードンEX', DRACAUFEU), null);
  assert.equal(traduire('ボスの指令', { fr: null, ja: null }), null);
  assert.equal(traduire('ミュウツーGX', DRACAUFEU), null);
});
