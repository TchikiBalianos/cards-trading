import { test } from 'node:test';
import assert from 'node:assert/strict';
import { valider, poidsX, compterHashtags, texteX, construireEnvoi, urlVisuel, unePhraseParLigne, texteFacebook, fichierVisuel } from './brouillons.mjs';
import { decouper } from './charte.mjs';

const MAINTENANT = '2026-09-29T14:00:00Z';

const bon = () => ({
  semaine: '2026-09-28',
  posts: [{
    id: '2026-10-01-communaute',
    jour: '2026-10-01',
    pilier: 'communaute',
    licence: 'pokemon',
    twitter: { texte: 'Cette sensation quand la Pikachu est encore dans la boîte 😅 #pokemontcg' },
    instagram: { texte: 'Et toi, ta plus belle surprise en ouverture ?\n\nLien du site en bio 🔗\n\n#pokemontcg #cartespokemon #tcg' },
    visuel: { type: 'texte', titre: 'La Pikachu est encore dans la boîte' },
  }],
});

const erreursDe = (donnees) => valider(donnees, { maintenant: MAINTENANT }).erreurs;

test('un fichier correct passe sans erreur', () => {
  assert.deepEqual(erreursDe(bon()), []);
});

test('poidsX : un lien pèse 23, un emoji pèse 2', () => {
  assert.equal(poidsX('abc'), 3);
  assert.equal(poidsX('a 😅'), 4);
  assert.equal(poidsX('voir https://cards-trading.com/blog/un-tres-long-slug-de-blog/'), 5 + 23);
});

test('compterHashtags', () => {
  assert.equal(compterHashtags('#pokemontcg #cartespokemon salut'), 2);
  assert.equal(compterHashtags('aucun'), 0);
});

test('le tiret long est refusé, sur X comme sur Instagram', () => {
  const d = bon();
  d.posts[0].twitter.texte = 'Une phrase \u2014 avec un tiret long';
  assert.ok(erreursDe(d).some((e) => /tiret long/.test(e)));
  const e = bon();
  e.posts[0].instagram.texte = 'Une phrase \u2013 avec un tiret demi-cadratin';
  assert.ok(erreursDe(e).some((x) => /tiret long/.test(x)));
});

test('un prix sans source est refusé, avec source il passe', () => {
  const d = bon();
  d.posts[0].twitter.texte = 'Ce Pikachu vaut 120 € aujourd\'hui';
  assert.ok(erreursDe(d).some((e) => /sans « sources »/.test(e)));
  d.posts[0].sources = ['https://www.cardmarket.com/fr/Pokemon/Products/Singles/x'];
  assert.deepEqual(erreursDe(d), []);
});

test('un pilier « cote » exige toujours une source', () => {
  const d = bon();
  d.posts[0].pilier = 'cote';
  d.posts[0].id = '2026-10-01-cote';
  assert.ok(erreursDe(d).some((e) => /sans « sources »/.test(e)));
});

test('trop de hashtags refusés : 2 sur X, 5 sur Instagram', () => {
  const d = bon();
  d.posts[0].twitter.texte = 'Salut #a #b #c';
  assert.ok(erreursDe(d).some((e) => /2 hashtags/.test(e)));
  const e = bon();
  e.posts[0].instagram.texte = 'Salut #a #b #c #d #e #f';
  assert.ok(erreursDe(e).some((x) => /5 hashtags/.test(x)));
});

test('un lien dans la légende Instagram est refusé', () => {
  const d = bon();
  d.posts[0].instagram.texte = 'Lis ça https://cards-trading.com';
  assert.ok(erreursDe(d).some((e) => /aucun lien/.test(e)));
});

test('un texte X trop long est refusé', () => {
  const d = bon();
  d.posts[0].twitter.texte = 'a'.repeat(281);
  assert.ok(erreursDe(d).some((e) => /trop long/.test(e)));
});

test('la citation X s\'ajoute en fin de texte et doit être un lien de post', () => {
  const d = bon();
  d.posts[0].twitter.citation = 'https://x.com/ActuPokemon7/status/1234567890';
  assert.deepEqual(erreursDe(d), []);
  assert.ok(texteX(d.posts[0]).endsWith('https://x.com/ActuPokemon7/status/1234567890'));
  d.posts[0].twitter.citation = 'https://exemple.com/pas-un-post';
  assert.ok(erreursDe(d).some((e) => /citation X/.test(e)));
});

test('une photo sans crédit est refusée, mais le crédit ne va jamais dans la légende', () => {
  const d = bon();
  d.posts[0].visuel = { type: 'photo', image: 'https://exemple.com/a.jpg' };
  assert.ok(erreursDe(d).some((e) => /sans crédit/.test(e)));
  d.posts[0].visuel.credit = '@collectionneur';
  assert.deepEqual(erreursDe(d), []);
});

test('un jour déjà passé ou trop proche est refusé tant que rien n\'est créé', () => {
  const d = bon();
  d.posts[0].jour = '2026-09-29';
  d.posts[0].id = '2026-09-29-communaute';
  assert.ok(erreursDe(d).some((e) => /plus assez loin/.test(e)));
  d.posts[0].buffer = { twitter: 'a', instagram: 'b' };
  assert.ok(!erreursDe(d).some((e) => /plus assez loin/.test(e)));
});

test('la semaine doit être un lundi et les jours y rester', () => {
  const d = bon();
  d.semaine = '2026-09-29';
  assert.ok(erreursDe(d).some((e) => /doit être un lundi/.test(e)));
  const e = bon();
  e.posts[0].jour = '2026-10-06';
  e.posts[0].id = '2026-10-06-communaute';
  assert.ok(erreursDe(e).some((x) => /sort de la semaine/.test(x)));
});

test('l\'identifiant doit valoir jour + pilier, sans doublon', () => {
  const d = bon();
  d.posts[0].id = 'autre';
  assert.ok(erreursDe(d).some((e) => /identifiant doit valoir/.test(e)));
  const e = bon();
  e.posts.push({ ...e.posts[0] });
  assert.ok(erreursDe(e).some((x) => /en double/.test(x)));
});

test('un visuel est obligatoire : Instagram refuse un post sans image', () => {
  const d = bon();
  delete d.posts[0].visuel;
  assert.ok(erreursDe(d).some((e) => /visuel manquant/.test(e)));
});

test('construireEnvoi : X reçoit l\'image paysage, Instagram le portrait et ses métadonnées', () => {
  const p = bon().posts[0];
  const x = construireEnvoi(p, 'twitter', '2026-10-01T08:20:00.000Z');
  const ig = construireEnvoi(p, 'instagram', '2026-10-01T09:30:00.000Z');
  assert.equal(x.image, urlVisuel(p, 'twitter'));
  assert.match(x.image, /semaine\/2026-10-01-communaute-twitter\.png$/);
  assert.match(ig.image, /-instagram\.png$/);
  assert.deepEqual(ig.metadata, { instagram: { type: 'post', shouldShareToFeed: true } });
  assert.equal(x.metadata, undefined);
});

test('la signature « 100 % TCG » n\'est pas un pourcentage à sourcer', () => {
  const d = bon();
  d.posts[0].instagram.texte += '\n\nCards-Trading.com, la marketplace 100 % TCG';
  assert.deepEqual(erreursDe(d), []);
  d.posts[0].instagram.texte += '\n\nUne hausse de 20 %';
  assert.ok(erreursDe(d).some((e) => /sans « sources »/.test(e)));
});

test('Facebook reprend la légende Instagram avec un vrai lien, et son visuel portrait', () => {
  const d = bon();
  const p = d.posts[0];
  assert.equal(texteFacebook(p), 'Et toi, ta plus belle surprise en ouverture ?\n\n👉 https://cards-trading.com\n\n#pokemontcg #cartespokemon #tcg');
  const e = construireEnvoi(p, 'facebook', '2026-10-01T09:30:00.000Z');
  assert.deepEqual(e.metadata, { facebook: { type: 'post' } });
  assert.equal(e.image, urlVisuel(p, 'instagram'));
});

test('un visuel refait porte sa version dans son nom de fichier', () => {
  const p = { id: '2026-10-29-communaute', visuel: { type: 'texte', titre: 'T' } };
  assert.equal(fichierVisuel(p, 'twitter'), 'semaine/2026-10-29-communaute-twitter.png');
  p.visuel.version = 2;
  assert.equal(fichierVisuel(p, 'twitter'), 'semaine/2026-10-29-communaute-v2-twitter.png');
  assert.equal(fichierVisuel(p, 'facebook'), 'semaine/2026-10-29-communaute-v2-instagram.png');
});

test('une phrase par ligne, sans casser les listes, les abréviations ni les citations', () => {
  assert.equal(unePhraseParLigne('Flammes Fantasmagoriques. Même Pokémon, deux versions :'),
    'Flammes Fantasmagoriques.\nMême Pokémon, deux versions :');
  assert.equal(unePhraseParLigne('Ça vaut combien ? 💰 Méga-Dracaufeu X-ex'), 'Ça vaut combien ? 💰\nMéga-Dracaufeu X-ex');
  assert.equal(unePhraseParLigne('Tu pars ? Dis-le en commentaire 👇 Et enregistre.'),
    'Tu pars ?\nDis-le en commentaire 👇\nEt enregistre.');
  for (const intact of ['1. Dracaufeu\n2. Pikachu', 'met K.O. les personnages', 'Moi : « Juste un booster, pour voir. »',
    '📅 Alabasta débarque', 'Sortie en 2026. 2 packs', 'Cards-Trading.com, la marketplace',
    'Dans les Play! Pokémon Stores participants', 'Le nouveau Yu-Gi-Oh! Les Maîtres Fantastiques', '10 cartes DON!! Et un deck']) {
    assert.equal(unePhraseParLigne(intact), intact);
  }
});

test('le texte envoyé passe à la ligne après chaque phrase, sur X comme sur Instagram', () => {
  const d = bon();
  d.posts[0].twitter.texte = 'Première phrase. Deuxième phrase.';
  d.posts[0].instagram.texte = 'Une. Deux.';
  assert.equal(texteX(d.posts[0]), 'Première phrase.\nDeuxième phrase.');
  assert.equal(construireEnvoi(d.posts[0], 'instagram', '2026-10-01T09:30:00.000Z').texte, 'Une.\nDeux.');
});

test('lexique des raretés : ALT, AR et GOLD, jamais les noms officiels', () => {
  const d = bon();
  d.posts[0].twitter.texte = '• Illustration spéciale rare (125) : 707 €';
  assert.ok(erreursDe(d).some((e) => /lexique : .*ALT/.test(e)));
  d.posts[0].twitter.texte = '• ALT (125) : 707 €';
  d.posts[0].visuel.titre = 'Méga Hyper Rare 130';
  assert.ok(erreursDe(d).some((e) => /lexique : .*GOLD/.test(e)));
  d.posts[0].visuel.titre = 'GOLD 130';
  d.posts[0].instagram.texte += '\n\nUne Illustration rare';
  assert.ok(erreursDe(d).some((e) => /lexique : .*AR /.test(e)));
});

test('le prix et son symbole restent sur la même ligne du visuel', () => {
  const lignes = decouper('Méga-Dracaufeu X-ex : 707 €', 40, 560);
  assert.ok(lignes.every((l) => l !== '€'), JSON.stringify(lignes));
  assert.ok(lignes.some((l) => l.endsWith('707 €')));
});
