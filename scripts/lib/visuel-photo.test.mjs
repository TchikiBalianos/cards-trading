import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { creditObligatoire } from './visuel-spec.mjs';
import { genererVisuel, dispositionPhoto, FORMATS } from './visuel-social.mjs';

const UNSPLASH = 'https://images.unsplash.com/photo-1613771404784-3a5686aa2be3?w=2400';
const AILLEURS = 'https://exemple.com/photo-de-la-communaute.jpg';

test('le crédit n\'est facultatif que pour une photo Unsplash', () => {
  assert.equal(creditObligatoire({ image: UNSPLASH }), false);
  assert.equal(creditObligatoire({ image: AILLEURS }), true);
  assert.equal(creditObligatoire({ image: 'https://plus.unsplash.com/premium_photo-1.jpg' }), true);
  assert.equal(creditObligatoire({ image: 'pas une adresse' }), true);
});

test('Instagram : une photo en paysage est centrée, une photo en portrait reste en haut', () => {
  const ig = FORMATS.instagram;
  const H = ig.hauteur;
  const paysage = dispositionPhoto(ig, 720, 1);
  assert.equal(paysage.yPhoto, (H - 720) / 2);
  assert.equal(paysage.debutVoile, paysage.yPhoto + 720, 'le voile ne touche pas la photo');
  assert.ok(paysage.yPhoto + 720 <= H - paysage.bande, 'la photo reste au-dessus de la bande du texte');

  assert.equal(dispositionPhoto(ig, Math.round(H * 0.84), 1).yPhoto, 0);
  const carre = dispositionPhoto(ig, 1080, 1);
  assert.equal(carre.yPhoto + 1080, H - carre.bande, 'un carré descend jusqu\'à la bande, pas au-delà');
});

test('X : la photo reste en haut et la légende ne déborde jamais sur la ligne du crédit', () => {
  const x = FORMATS.twitter;
  const une = dispositionPhoto(x, 567, 1);
  assert.equal(une.yPhoto, 0);
  assert.equal(une.yLegende, x.hauteur - une.bande + Math.round(une.tailleCredit * 1.9), 'une ligne : placement inchangé');
  const deux = dispositionPhoto(x, 567, 2);
  const derniere = deux.yLegende + deux.interligne;
  assert.ok(derniere <= deux.yBas - Math.round(deux.tailleCredit * 1.2), 'la seconde ligne reste au-dessus du crédit');
  assert.equal(une.yLegende - une.yFilet, deux.yLegende - deux.yFilet, 'le filet remonte avec la légende');
});

/* Rendu réel, sans réseau : `fetch` renvoie une image rouge 3:2. */
async function rendre(image, reseau) {
  const rouge = await sharp({ create: { width: 1500, height: 1000, channels: 3, background: '#ff0000' } }).png().toBuffer();
  const avant = globalThis.fetch;
  globalThis.fetch = async () => new Response(rouge);
  try {
    return await genererVisuel({ type: 'photo', image, credit: 'Thimo Pedersen / Unsplash', titre: 'Essai' }, 'pokemon', reseau);
  } finally {
    globalThis.fetch = avant;
  }
}

test('rendu : photo centrée sur Instagram, flou au-dessus et en dessous', async () => {
  const png = await rendre(UNSPLASH, 'instagram');
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const rougeA = (y) => data[(y * info.width + Math.round(info.width / 2)) * info.channels];
  const d = dispositionPhoto(FORMATS.instagram, 720, 1);
  assert.ok(rougeA(d.yPhoto + 5) > 240, 'haut de la photo, rouge vif');
  assert.ok(rougeA(d.yPhoto - 5) < 200, 'au-dessus, le flou assombri');
  assert.ok(rougeA(d.yPhoto + 715) > 240, 'bas de la photo, rouge vif');
  assert.ok(rougeA(d.yPhoto + 725) < 200, 'en dessous, le flou assombri');
});

test('rendu : sans obligation, le crédit quitte le visuel X et reste sur Instagram', async () => {
  assert.notDeepEqual(await rendre(UNSPLASH, 'twitter'), await rendre(AILLEURS, 'twitter'));
  assert.deepEqual(await rendre(UNSPLASH, 'instagram'), await rendre(AILLEURS, 'instagram'));
});
