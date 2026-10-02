import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { verifierBip, svgBip, RARETES, GABARITS } from './carte-bip.mjs';
import { verifierSpec } from './visuel-spec.mjs';
import { genererVisuel, FORMATS } from './visuel-social.mjs';
import { valider } from './brouillons.mjs';

const ILLUSTRATIONS = {
  plan: { gabarit: 'plan', etapes: ['L\'agent veut agir', 'Autoriser ou refuser ?', 'Sans réponse : refusé'], porte: 1 },
  bordereau: { gabarit: 'bordereau', entete: 'L\'ÉQUIPE', lignes: [['Produit', 'Julian'], ['Dev', 'Val'], ['Archi', 'Winston (IA)']] },
  'avant-apres': { gabarit: 'avant-apres', avant: '8 jours d\'échecs, aucune alerte', apres: 'Une alerte chaque matin si ça casse' },
  preuve: { gabarit: 'preuve', ligne: 'la vérification ne sort plus du site', legende: 'message de commit, 19/09/2026' },
  motif: { gabarit: 'motif' },
};

const spec = (extra = {}) => ({
  type: 'bip', numero: 7, total: 20, rarete: 'commune',
  nom: 'La porte', titre: 'Une IA qui code, oui. Une IA qui décide seule, non.',
  sous_titre: 'Chaque commande sensible attend un clic humain.',
  effet: 'Une commande sensible ne part jamais sans le clic d\'un humain.',
  illustration: ILLUSTRATIONS.plan,
  ...extra,
});

test('une carte valide passe, et passe aussi la validation générale des visuels', () => {
  assert.doesNotThrow(() => verifierBip(spec()));
  assert.doesNotThrow(() => verifierSpec(spec()));
});

test('les champs obligatoires et les bornes sont contrôlés', () => {
  assert.throws(() => verifierBip(spec({ numero: 0 })), /numero/);
  assert.throws(() => verifierBip(spec({ numero: 21 })), /total/);
  assert.throws(() => verifierBip(spec({ rarete: 'ultra' })), /rareté inconnue/);
  assert.throws(() => verifierBip(spec({ nom: '' })), /nom/);
  assert.throws(() => verifierBip(spec({ nom: 'x'.repeat(27) })), /nom.*trop long/);
  assert.throws(() => verifierBip(spec({ effet: 'x'.repeat(96) })), /effet.*trop long/);
  assert.throws(() => verifierBip(spec({ illustration: { gabarit: 'capture' } })), /gabarit/);
});

test('plan : 2 à 4 étapes courtes, une porte qui désigne une étape', () => {
  assert.throws(() => verifierBip(spec({ illustration: { gabarit: 'plan', etapes: ['seule'] } })), /2 à 4/);
  assert.throws(() => verifierBip(spec({ illustration: { gabarit: 'plan', etapes: ['a', 'b', 'c', 'd', 'e'] } })), /2 à 4/);
  assert.throws(() => verifierBip(spec({ illustration: { gabarit: 'plan', etapes: ['a', 'x'.repeat(23)] } })), /étape 2/);
  assert.throws(() => verifierBip(spec({ illustration: { gabarit: 'plan', etapes: ['a', 'b'], porte: 2 } })), /porte/);
});

test('bordereau : de 2 à 6 paires [clé, valeur] bornées', () => {
  assert.throws(() => verifierBip(spec({ illustration: { gabarit: 'bordereau', lignes: [['a', 'b']] } })), /2 à 6/);
  assert.throws(() => verifierBip(spec({ illustration: { gabarit: 'bordereau', lignes: [['a', 'b'], ['c']] } })), /paire/);
  assert.throws(() => verifierBip(spec({ illustration: { gabarit: 'bordereau', lignes: [['a', 'b'], ['c', 'x'.repeat(17)]] } })), /valeur 2/);
});

test('une preuve exige sa provenance', () => {
  assert.throws(() => verifierBip(spec({ illustration: { gabarit: 'preuve', ligne: 'une phrase' } })), /legende/);
});

test('aucun secret ni tiret long ne peut entrer dans une image (dépôt public)', () => {
  const fuites = [
    'contact julian@exemple.fr', 'serveur 37.59.119.243', 'cle sk_live_abc123', 're_AbCdEf123456',
    'eyJhbGciOiJIUzI1NiJ9xx', '/home/julian/code', 'C:\\Projets',
  ];
  for (const f of fuites) {
    assert.throws(() => verifierBip(spec({ illustration: { gabarit: 'preuve', ligne: f, legende: 'test' } })), /refusé/, f);
  }
  assert.throws(() => verifierBip(spec({ effet: 'Un tiret — interdit' })), /tiret long/);
});

test('le SVG est déterministe et échappe le texte', () => {
  const s = spec({ nom: 'Cartes & <balises>' });
  assert.equal(svgBip(s, FORMATS.twitter), svgBip(s, FORMATS.twitter));
  assert.ok(svgBip(s, FORMATS.twitter).includes('Cartes &amp; &lt;balises&gt;'));
});

test('la carte affiche son numéro dans le set, sans date', () => {
  const svg = svgBip(spec(), FORMATS.instagram);
  assert.ok(svg.includes('07/20'));
  assert.ok(svg.includes('CARTE 07/20'));
  assert.ok(!/20\d\d-\d\d/.test(svg), 'aucune date AAAA-MM sur l\'image');
});

test('chaque gabarit et chaque rareté se rendent aux deux formats', async () => {
  for (const g of GABARITS) {
    for (const rarete of RARETES) {
      for (const reseau of ['twitter', 'instagram']) {
        const png = await genererVisuel(spec({ rarete, illustration: ILLUSTRATIONS[g] }), 'mixte', reseau);
        const meta = await sharp(png).metadata();
        assert.equal(meta.width, FORMATS[reseau].largeur, `${g} ${rarete} ${reseau}`);
        assert.equal(meta.height, FORMATS[reseau].hauteur, `${g} ${rarete} ${reseau}`);
      }
    }
  }
});

test('un post « coulisses » avec une carte BiP passe la validation du fichier de semaine', () => {
  const semaine = {
    semaine: '2026-10-05',
    posts: [{
      id: '2026-10-11-coulisses', jour: '2026-10-11', pilier: 'coulisses', licence: 'mixte',
      twitter: { texte: 'Carte 07/20 de notre build in public. #buildinpublic' },
      instagram: { texte: 'Carte 07/20.\n\nCards-Trading.com, la marketplace 100 % TCG\nLien du site en bio 🔗\n\n#buildinpublic' },
      visuel: spec(),
    }],
  };
  assert.deepEqual(valider(semaine).erreurs, []);
});
