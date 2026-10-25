/*
  Nom français COMPLET d'une carte Pokémon japonaise, à partir de son nom
  japonais et du nom de son espèce dans les deux langues (PokéAPI).

  Jusqu'au 25 octobre 2026, le top japonais affichait l'espèce seule suivie
  du nom japonais : « Dracaufeu · メガリザードンXex » pour un Méga-Dracaufeu
  X-ex. L'espèce seule désigne des dizaines d'impressions aux cotes sans
  rapport (même défaut que « Camérupt » pour « Méga-Camérupt-ex », signalé
  par un follower le 19 septembre), et le japonais ne dit rien à un lecteur
  français. Julian a demandé de corriger les noms avant de rouvrir le
  marché japonais.

  Principe : on repère le nom japonais de l'espèce dans celui de la carte,
  puis on traduit ce qui l'entoure à partir d'une liste FERMÉE de préfixes
  et de suffixes. Tout reste inconnu (« エリカの », dresseur propriétaire ;
  « &ゼクロム », duo ; « V-UNION ») rend null : la carte est alors écartée
  du podium, comme une carte Dresseur intraduisible. Un nom faux est pire
  qu'une carte écartée.

  Formes françaises relevées dans TCGdex le 25 octobre 2026 : « Raichu-GX »,
  « Méga-Dracaufeu X-ex », « Méga-Gardevoir-ex », « Mewtwo-EX »,
  « M-Dracaufeu-EX », « Dracaufeu V », « Dracaufeu VMAX », « Zoroark de
  Hisui VSTAR », « Goupix d'Alola », « Miaouss de Galar », « Rayquaza
  Brillant », « Dracaufeu Radieux ».

  `simple` vaut false quand le nom porte une forme régionale, « Brillant »
  ou « Radieux » : ces combinaisons ne sont pas toutes vérifiées (la place
  du suffixe GX après « d'Alola », par exemple), cote-hebdo.mjs les
  confronte donc à TCGdex avant de les publier.
*/

const PREFIXES = [
  ['メガ', { mega: true }],
  ['M', { megaXY: true }],
  ['アローラ', { region: " d'Alola" }],
  ['ガラル', { region: ' de Galar' }],
  ['ヒスイ', { region: ' de Hisui' }],
  ['パルデア', { region: ' de Paldea' }],
  ['ひかる', { qualificatif: ' Brillant' }],
  ['かがやく', { qualificatif: ' Radieux' }],
];

/* Du plus long au plus court : « VMAX » doit passer avant « V ». */
const MECANIQUES = [
  ['VSTAR', ' VSTAR'],
  ['VMAX', ' VMAX'],
  ['GX', '-GX'],
  ['EX', '-EX'],
  ['ex', '-ex'],
  ['V', ' V'],
  ['', ''],
];

export function nomFrancaisCarteJaponaise(nomCarte, { fr, ja }) {
  if (!nomCarte || !fr || !ja) return null;
  const carte = nomCarte.normalize('NFKC').replace(/\s+/g, '');
  const espece = ja.normalize('NFKC').replace(/\s+/g, '');
  const i = carte.indexOf(espece);
  if (i < 0) return null;

  let avant = carte.slice(0, i);
  let apres = carte.slice(i + espece.length);

  const traits = {};
  for (let progres = true; avant && progres; ) {
    progres = false;
    for (const [jp, trait] of PREFIXES) {
      if (avant.startsWith(jp)) {
        Object.assign(traits, trait);
        avant = avant.slice(jp.length);
        progres = true;
        break;
      }
    }
  }
  if (avant) return null;

  let forme = '';
  if (traits.mega && /^[XY]/.test(apres)) {
    forme = ' ' + apres[0];
    apres = apres.slice(1);
  }

  const mecanique = MECANIQUES.find(([jp]) => apres === jp);
  if (!mecanique) return null;
  const [jpMeca, frMeca] = mecanique;

  if (traits.mega) {
    /* La Méga-Évolution de l'ère actuelle ne s'imprime qu'en « ex ». */
    if (jpMeca !== 'ex' || traits.region || traits.qualificatif) return null;
    return { nom: `Méga-${fr}${forme}-ex`, simple: true };
  }
  if (traits.megaXY) {
    /* Ère XY : « MリザードンEX » se dit « M-Dracaufeu-EX ». */
    if (jpMeca !== 'EX' || traits.region || traits.qualificatif) return null;
    return { nom: `M-${fr}-EX`, simple: true };
  }

  const nom = `${fr}${traits.region || ''}${traits.qualificatif || ''}${frMeca}`;
  return { nom, simple: !traits.region && !traits.qualificatif };
}
