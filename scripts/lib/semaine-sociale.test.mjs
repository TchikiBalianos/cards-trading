import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  heureParisVersIso, jourParis, lundiDe, ajouterJours, planEditorial,
  repartition, analyser, decrire,
} from './semaine-sociale.mjs';

test('heure d\'été : 10h20 à Paris = 08h20 UTC (valeur relue dans Buffer)', () => {
  assert.equal(heureParisVersIso('2026-10-01', '10:20'), '2026-10-01T08:20:00.000Z');
});

test('heure d\'hiver : le décalage change le dimanche 25 octobre 2026', () => {
  assert.equal(heureParisVersIso('2026-10-24', '10:20'), '2026-10-24T08:20:00.000Z');
  assert.equal(heureParisVersIso('2026-10-25', '10:20'), '2026-10-25T09:20:00.000Z');
  assert.equal(heureParisVersIso('2026-10-26', '11:30'), '2026-10-26T10:30:00.000Z');
});

test('jourParis : un instant tardif en UTC est déjà le lendemain à Paris', () => {
  assert.equal(jourParis('2026-10-01T22:30:00Z'), '2026-10-02');
  assert.equal(jourParis('2026-10-01T08:20:00Z'), '2026-10-01');
});

test('lundiDe et ajouterJours', () => {
  assert.equal(lundiDe('2026-10-04'), '2026-09-28');
  assert.equal(lundiDe('2026-09-28'), '2026-09-28');
  assert.equal(ajouterJours('2026-09-30', 3), '2026-10-03');
});

test('planEditorial : semaine ancrée One Piece, le mardi et le jeudi passent en Pokémon', () => {
  const p = planEditorial('2026-09-28');
  assert.deepEqual(p.map((c) => c.jour), ['2026-09-28', '2026-09-29', '2026-10-01', '2026-10-04']);
  assert.deepEqual(p.map((c) => c.pilier), ['cote', 'actu', 'communaute', 'coulisses']);
  assert.deepEqual(p.map((c) => c.licence), ['pokemon', 'pokemon', 'pokemon', 'mixte']);
  assert.equal(p[2].creneaux.twitter, '2026-10-01T08:20:00.000Z');
});

test('planEditorial : semaine ancrée Pokémon, le mardi et le jeudi passent en One Piece', () => {
  const p = planEditorial('2026-10-05');
  assert.deepEqual(p.map((c) => c.licence), ['pokemon', 'one-piece', 'one-piece', 'mixte']);
});

test('sur deux semaines, Pokémon reste majoritaire et One Piece pèse environ un tiers', () => {
  const posts = [...planEditorial('2026-09-28'), ...planEditorial('2026-10-05')].filter((c) => c.licence !== 'mixte');
  const r = repartition(posts);
  assert.equal(r.pokemon, 4);
  assert.equal(r['one-piece'], 2);
});

const MAINTENANT = '2026-09-29T14:00:00Z'; // mardi

const post = (id, service, status, dueAt) => ({ id, channelService: service, status, dueAt });

test('analyser : rien à signaler quand chaque jour éditorial a son post programmé', () => {
  const posts = [];
  for (const j of ['2026-09-30', '2026-10-01', '2026-10-04', '2026-10-05', '2026-10-06']) {
    posts.push(post(`x${j}`, 'twitter', 'scheduled', heureParisVersIso(j, '10:20')));
    posts.push(post(`i${j}`, 'instagram', 'scheduled', heureParisVersIso(j, '11:30')));
  }
  assert.deepEqual(analyser({ posts, maintenant: MAINTENANT }), []);
});

test('analyser : un brouillon daté de demain est signalé, il ne partira pas sans clic', () => {
  const posts = [post('b1', 'twitter', 'draft', '2026-10-01T08:20:00.000Z')];
  const a = analyser({ posts, maintenant: '2026-09-30T18:00:00Z', editorial: false });
  assert.equal(a.length, 1);
  assert.equal(a[0].type, 'brouillon_non_valide');
  assert.match(decrire(a[0]), /ne partira pas/);
});

test('analyser : un brouillon dont l\'heure est passée est signalé comme périmé', () => {
  const posts = [post('b1', 'twitter', 'draft', '2026-09-29T08:20:00.000Z')];
  const a = analyser({ posts, maintenant: MAINTENANT, editorial: false });
  assert.deepEqual(a.map((x) => x.type), ['brouillon_perime']);
});

test('analyser : un brouillon lointain n\'alerte pas encore', () => {
  const posts = [post('b1', 'twitter', 'draft', '2026-10-04T08:20:00.000Z')];
  assert.deepEqual(analyser({ posts, maintenant: MAINTENANT, editorial: false }), []);
});

test('analyser : deux posts le même jour sur un réseau font un doublon', () => {
  const posts = [
    post('a', 'twitter', 'scheduled', '2026-10-01T08:20:00.000Z'),
    post('b', 'twitter', 'scheduled', '2026-10-01T09:45:00.000Z'),
  ];
  const a = analyser({ posts, maintenant: MAINTENANT, editorial: false });
  assert.equal(a.length, 1);
  assert.equal(a[0].type, 'doublon');
  assert.deepEqual(a[0].ids, ['a', 'b']);
});

test('analyser : un brouillon périmé ne compte pas dans un doublon', () => {
  const posts = [
    post('vieux', 'twitter', 'draft', '2026-09-29T08:20:00.000Z'),
    post('a', 'twitter', 'scheduled', '2026-09-29T15:00:00.000Z'),
  ];
  const types = analyser({ posts, maintenant: MAINTENANT, editorial: false }).map((x) => x.type);
  assert.deepEqual(types, ['brouillon_perime']);
});

test('analyser : un jour éditorial sans post est manquant, un mercredi vide ne l\'est pas', () => {
  const a = analyser({ posts: [], maintenant: MAINTENANT, horizonJours: 3 });
  const manquants = a.filter((x) => x.service === 'twitter').map((x) => x.jour);
  /* mardi 29 → jours 30 (mer), 1er (jeu), 2 (ven) : seul le jeudi est éditorial */
  assert.deepEqual(manquants, ['2026-10-01']);
});

test('analyser : la file de 8 posts programmés déclenche l\'alerte de quota', () => {
  const posts = Array.from({ length: 8 }, (_, i) =>
    post(`p${i}`, 'twitter', 'scheduled', heureParisVersIso(ajouterJours('2026-09-30', i), '10:20')));
  const a = analyser({ posts, maintenant: MAINTENANT, editorial: false, horizonJours: 12 });
  assert.equal(a.filter((x) => x.type === 'quota').length, 1);
});

test('analyser : un post en erreur récent est signalé, un ancien ne l\'est plus', () => {
  const recent = [post('e1', 'instagram', 'error', '2026-09-28T09:30:00.000Z')];
  assert.deepEqual(analyser({ posts: recent, maintenant: MAINTENANT, editorial: false }).map((x) => x.type), ['echec']);
  const ancien = [post('e2', 'instagram', 'error', '2026-09-20T09:30:00.000Z')];
  assert.deepEqual(analyser({ posts: ancien, maintenant: MAINTENANT, editorial: false }), []);
});
