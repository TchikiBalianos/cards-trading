/**
 * Calcule le « top des hausses » hebdomadaire à partir de cotes réelles.
 *
 * Source : TCGdex (api.tcgdex.net), sans clé ni compte, qui expose les prix
 * Cardmarket en EUR — donc la cote européenne, celle qui parle à un
 * collectionneur français — avec les moyennes avg1/avg7/avg30 et trend.
 *
 * ⚠️ Pourquoi PAS api.pokemontcg.io : ses prix étaient gelés au 2026/07/01,
 * soit 50 jours de retard au moment du test. Publier des « hausses de la
 * semaine » à partir de données de deux mois aurait été une faute
 * publique. D'où les contrôles ci-dessous, non négociables.
 *
 *   node scripts/cote-hebdo.mjs                 # cartes internationales
 *   node scripts/cote-hebdo.mjs --marche=jp     # cartes japonaises, cote EUR
 *   node scripts/cote-hebdo.mjs --json          # sortie brute
 */

import { readFileSync } from 'node:fs';
import { referenceCarte, corroborerExtension } from './lib/reference-carte.mjs';
import { nomFrancaisCarteJaponaise } from './lib/nom-japonais.mjs';
import { PALIERS, PALIER_LE_PLUS_SOUPLE, confirmationAvg7, passeLePalier, motifReferenceFigee } from './lib/cote-paliers.mjs';

const API = 'https://api.tcgdex.net/v2';

/* ── Garde-fous ────────────────────────────────────────────
   Chaque seuil existe parce qu'un cas réel le justifie. */

/* Au-delà, la source est considérée périmée et le script REFUSE de
   produire un classement. C'est la leçon des 50 jours. */
const FRAICHEUR_MAX_JOURS = 4;

/*
  Sous ce prix, une variation ne veut rien dire : passer de 0,02 € à
  0,03 € fait « +50 % » et n'intéresse personne.

  Relevé de 1,50 à 10 € le 19 septembre 2026, sur décision éditoriale.
  À 1,50 €, le podium mêlait une carte à 1,72 € et une à 435 €, ce qui
  décrédibilisait l'ensemble : le lecteur compare des montants sans
  rapport et finit par douter des deux.

  Sur une semaine calme, ce plancher réduit le nombre de candidats : ce
  sont les paliers (scripts/lib/cote-paliers.mjs) qui assouplissent alors
  le seuil de hausse, jamais le plancher de prix.
*/
const PRIX_PLANCHER_EUR = 10;

/* Au-delà, on soupçonne une donnée aberrante plutôt qu'un vrai mouvement.
   Mieux vaut rater une flambée réelle que publier un chiffre faux.

   Abaissé de 300 à 100 le 19 septembre 2026. À 300 il n'avait JAMAIS rien
   filtré : mesuré sur le marché international, la plus forte hausse
   plausible observée est de +26 %, et aucun candidat ne dépasse +50 %. Sur
   le japonais, 6 candidats sur 49 dépassaient 100 %, dont les trois cartes
   gelées publiées les 27 août et 11 septembre. Le plafond ne coûte donc
   rien là où les données vivent, et arrête ce qui ne vit plus. */
const HAUSSE_MAX_PLAUSIBLE = 100;

/*
  ── Liquidité ──────────────────────────────────────────

  La cote d'une carte que personne n'échange n'est pas une cote, c'est un
  vestige. TCGdex ne publie aucun volume de ventes (vérifié : `cardmarket`
  expose exactement 15 clés, et l'API Cardmarket qui, elle, expose
  `countArticles` n'est pas relayée). On travaille donc par indices, tous
  déjà présents dans la réponse et donc gratuits.

  Chacun vient d'un cas réel du podium japonais du 11 septembre 2026 :
  Nymphali SM1p-064 y a été classée PREMIÈRE avec « low: null », c'est-à-dire
  zéro annonce en vente, et un avg1 à 850 € pour un avg30 à 42,58 €.

  Mesuré avant d'être imposé, sur les deux marchés :
    - international, 8 candidats : 1 seul rejet, podium INCHANGÉ ;
    - japonais, 49 candidats : 31 rejets.

  Le seuil de décorrélation est à 5 fois et non 3 : à 3, la mesure écartait
  4 candidats internationaux sur 8 dont un du podium, ce qui est trop pour
  un signal aussi indirect.
*/
const RATIO_LOW_MAX = 5;
const ECART_AVG1_AVG7_MAX = 0.5;

function motifIlliquide(cm, actuel) {
  if (cm.low == null) return 'aucune annonce en vente';
  if (cm.low > actuel) return `cote sous la plus basse annonce (${actuel} € contre ${cm.low} €)`;
  if (cm.low > 0 && actuel > RATIO_LOW_MAX * cm.low)
    return `cote décorrélée de l'offre (${actuel} € contre ${cm.low} € au plus bas)`;
  if (cm.avg7 != null && cm.avg7 === cm.avg30)
    return 'avg7 rigoureusement égal à avg30, fenêtre figée';
  if (cm.avg1 != null && cm.avg != null && cm.avg1 === cm.avg)
    return 'avg1 rigoureusement égal à avg, vente unique';
  if (cm.avg1 != null && cm.avg7 > 0 && Math.abs(cm.avg1 / cm.avg7 - 1) > ECART_AVG1_AVG7_MAX)
    return `dernière vente aberrante (avg1 ${cm.avg1} € contre avg7 ${cm.avg7} €)`;
  return null;
}

/*
  ── Non-stagnation ─────────────────────────────────────

  Le garde-fou décisif, et le seul qui attrape Lucario SM5p-030 : ses
  chiffres sont parfaitement cohérents entre eux, ils sont simplement
  IDENTIQUES depuis le 27 août. Aucun test de liquidité ne peut le voir.

  Une hausse réelle de +172 % ne peut pas rester figée au centime pendant
  23 jours : avg30 l'absorberait mécaniquement. Numérateur ET dénominateur
  inchangés signifient qu'aucune vente n'alimente plus le calcul.

  On compare donc aux podiums DÉJÀ PUBLIÉS, archive qui existe déjà. C'est
  volontairement étroit : ça n'attrape que les cartes qu'on a annoncées
  nous-mêmes, mais c'est exactement le défaut constaté (Mewtwo et Lucario
  publiés deux fois, aux mêmes valeurs, à quinze jours d'écart).
*/
const ARCHIVE_PODIUMS = new URL('../data/cotes/podiums-hebdo.json', import.meta.url);
const dejaPublie = new Map();
try {
  const historique = JSON.parse(readFileSync(ARCHIVE_PODIUMS, 'utf8'));
  for (const entree of Array.isArray(historique) ? historique : []) {
    for (const c of entree.podium || []) {
      if (!c.id) continue;
      const liste = dejaPublie.get(c.id) || [];
      liste.push({ date: entree.date, actuel: c.actuel, reference: c.reference });
      dejaPublie.set(c.id, liste);
    }
  }
} catch {
  /* Archive absente ou illisible : premier passage, rien à comparer. */
}

function motifStagnation(id, actuel, reference) {
  for (const p of dejaPublie.get(id) || []) {
    if (p.actuel === actuel && p.reference === reference) {
      return `déjà publiée le ${p.date} aux mêmes valeurs (${actuel} € / ${reference} €), cote figée`;
    }
  }
  return null;
}

/*
  Recoupement contre TCGplayer (marché américain, USD) — présent dans la
  MÊME réponse TCGdex que Cardmarket, donc sans appel ni dépendance
  supplémentaire. Deux marchés indépendants (vendeurs et acheteurs
  différents) qui divergent trop pour la même carte trahissent plus
  souvent une carte mal identifiée ou un flux de prix aberrant qu'un
  vrai écart de marché.

  Un recoupement direct contre la page Cardmarket elle-même a été essayé
  et écarté : Cloudflare y bloque toute requête HTTP simple (403,
  Cf-Mitigated: challenge, vérifié le 26 août 2026 — même avec un
  user-agent de navigateur). TCGplayer est déjà dans la réponse, donc
  gratuit à vérifier.

  Taux de change FIXE et approximatif : on cherche un ordre de grandeur
  plausible, pas une conversion précise. Une carte sans cotation
  TCGplayer (fréquent sur les promos) n'est pas rejetée pour autant —
  l'absence de second avis n'est pas un signal, contrairement à un
  désaccord entre les deux.
*/
const TAUX_USD_EUR = 0.92;
const RATIO_MARCHES_MAX = 3;

/* Le nom de la variante (holofoil, normal, reverseHolofoil…) change selon
   les cartes ; on prend la première qui a un prix plutôt que de viser un
   nom précis. */
function prixTcgplayerEur(tp) {
  if (!tp) return null;
  for (const cle of Object.keys(tp)) {
    const prix = tp[cle]?.marketPrice;
    if (typeof prix === 'number' && prix > 0) return prix * TAUX_USD_EUR;
  }
  return null;
}

const args = process.argv.slice(2);
const MARCHE = (args.find((a) => a.startsWith('--marche=')) || '').split('=')[1] || 'int';
const EN_JSON = args.includes('--json');
const LOCALE = MARCHE === 'jp' ? 'ja' : 'fr';

async function api(chemin) {
  const rep = await fetch(`${API}/${LOCALE}${chemin}`);
  if (!rep.ok) throw new Error(`TCGdex ${rep.status} sur ${chemin}`);
  return rep.json();
}

const AUJOURDHUI = new Date().toISOString().slice(0, 10);

function joursDepuis(iso) {
  return Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
}

/*
  Une carte n'est retenue que si TOUTES les conditions tiennent. On
  retourne le motif de rejet plutôt qu'un simple faux : quand rien ne
  sort, il faut pouvoir dire pourquoi.
*/
function examiner(carte, cm, tp) {
  if (!cm) return { ok: false, motif: 'aucun prix Cardmarket' };
  if (cm.unit !== 'EUR') return { ok: false, motif: `devise inattendue (${cm.unit})` };

  const age = joursDepuis(cm.updated);
  if (age > FRAICHEUR_MAX_JOURS) return { ok: false, motif: `prix vieux de ${age} jours` };

  const actuel = cm.trend ?? cm.avg1;
  const reference = cm.avg30;
  if (!actuel || !reference) return { ok: false, motif: 'trend ou avg30 manquant' };
  if (actuel < PRIX_PLANCHER_EUR) return { ok: false, motif: `sous le plancher (${actuel} €)` };

  const variation = ((actuel - reference) / reference) * 100;
  if (!Number.isFinite(variation)) return { ok: false, motif: 'variation non calculable' };
  if (variation > HAUSSE_MAX_PLAUSIBLE) return { ok: false, motif: `hausse aberrante (${Math.round(variation)} %)` };
  if (variation < PALIER_LE_PLUS_SOUPLE.variation) return { ok: false, motif: 'variation négligeable' };

  /* Liquidité : une cote sans échanges derrière elle n'est pas publiable.
     Placé APRÈS le seuil de variation pour que les motifs de rejet
     journalisés restent lisibles : on ne veut pas noyer le rapport sous des
     cartes qui, de toute façon, ne bougeaient pas. */
  const illiquide = motifIlliquide(cm, actuel);
  if (illiquide) return { ok: false, motif: illiquide };

  /* Non-stagnation : comparée aux valeurs DÉJÀ PUBLIÉES, arrondies comme
     elles le sont à l'archivage, sans quoi la comparaison échouerait sur
     une décimale. */
  const fige = motifStagnation(
    carte.id,
    Math.round(actuel * 100) / 100,
    Math.round(reference * 100) / 100,
  );
  if (fige) return { ok: false, motif: fige };
  const figee = motifReferenceFigee(dejaPublie.get(carte.id), Math.round(reference * 100) / 100, AUJOURDHUI);
  if (figee) return { ok: false, motif: figee };

  /*
    TCGplayer écarte les ordres de grandeur absurdes, quand il cote la carte
    (jamais les japonaises, vérifié le 27 août 2026). Il ne confirme pas une
    hausse : le 1er octobre, le Méga-Dracaufeu Y-ex était à 539 € chez
    Cardmarket et vers 293 € chez TCGplayer, dans le rapport de 3 toléré.
  */
  const tcgplayerEur = prixTcgplayerEur(tp);
  const recoupe = tcgplayerEur !== null;
  if (recoupe) {
    const ratio = actuel / tcgplayerEur;
    if (ratio > RATIO_MARCHES_MAX || ratio < 1 / RATIO_MARCHES_MAX) {
      return {
        ok: false,
        motif: `incohérent avec TCGplayer (${actuel} € contre ~${tcgplayerEur.toFixed(2)} € converti)`,
      };
    }
  }

  /*
    La moyenne des ventes sur 7 jours doit confirmer la hausse, pour TOUTES
    les cartes depuis le 13 octobre 2026 (voir scripts/lib/cote-paliers.mjs).
    Une flambée réelle tire `avg7` au-dessus d'`avg30` ; une vente isolée à
    prix fort gonfle `trend` en laissant `avg7` collé à `avg30`, voire
    en dessous. Ici on n'écarte que ce qu'AUCUN palier n'accepterait : le
    choix du palier se fait sur l'ensemble des candidats.
  */
  const confirmation = confirmationAvg7(cm.avg7, reference);
  if (confirmation === null) return { ok: false, motif: 'avg7 manquant, hausse non vérifiable sur 7 jours' };
  if (confirmation < PALIER_LE_PLUS_SOUPLE.confirmation) {
    return {
      ok: false,
      motif: `pic isolé, avg7 (${cm.avg7} €) ne confirme pas la hausse sur 30 j (${reference} €)`,
    };
  }

  return {
    ok: true,
    nom: carte.name,
    dexId: Array.isArray(carte.dexId) ? carte.dexId[0] : null,
    id: carte.id,
    actuel: Math.round(actuel * 100) / 100,
    reference: Math.round(reference * 100) / 100,
    variation: Math.round(variation),
    /* Valeurs exactes, pour choisir le palier ; retirées avant l'archivage. */
    variationBrute: variation,
    confirmationBrute: confirmation,
    /* Archivés pour les audits (proposition du 5 octobre 2026) : sans eux, on
       ne pouvait pas dire après coup si une hausse publiée était confirmée. */
    confirmation: Math.round(confirmation * 10) / 10,
    avg7: cm.avg7,
    avg1: cm.avg1 ?? null,
    low: cm.low ?? null,
    image: carte.image ? `${carte.image}/high.png` : null,
    /* Numéro de collection imprimé sur la carte. Déjà dans la réponse de
       /cards/{id}, jeté jusqu'ici : sans lui, « Méga-Zygarde-ex » désigne
       cinq impressions de 0,69 € à 110,18 €, dont trois dans la MÊME
       extension. Le nom et l'extension ne suffisent donc pas. */
    localId: carte.localId ?? null,
    /* Sert à savoir si la variante est ambiguë. Une seule entrée signifie
       qu'il n'y a rien à lever ; plusieurs signifient que le prix publié
       porte sur l'une d'elles sans qu'on puisse la nommer (TCGdex
       n'étiquette pas les sous-variantes : trois « Reverse » d'une même
       carte sont indiscernables). */
    variantesConnues: Array.isArray(carte.variants_detailed) ? carte.variants_detailed.length : null,
    maj: cm.updated,
    recoupeTcgplayer: recoupe,
    /* Conservés pour le rapprochement des cartes Dresseur japonaises :
       ces trois champs ne sont pas traduits et servent de clé vers la
       fiche française. */
    category: carte.category,
    illustrator: carte.illustrator,
    rarity: carte.rarity,
  };
}

/* ── Collecte ──────────────────────────────────────────── */

const sets = await api('/sets');
if (!Array.isArray(sets) || sets.length === 0) throw new Error('aucun set renvoyé');

/*
  Fenêtre de sets volontairement DÉCALÉE de la sortie.

  Première version : les 3 derniers sets. Résultat mesuré, 120 cartes
  examinées et 0 retenue, dont 104 rejetées pour « variation
  négligeable ». C'est logique a posteriori — une carte parue depuis
  quelques jours a `avg30` ≈ `trend`, faute d'historique. Le marché ne
  bouge pas là où il est le plus visible.

  On vise donc des sets sortis quelques mois plus tôt : assez récents
  pour intéresser, assez installés pour avoir une cote qui vit.
*/
const recents = sets.slice(-14, -4);
const retenues = [];
const rejets = {};
let examinees = 0;

for (const s of recents) {
  const detail = await api(`/sets/${s.id}`);
  /* 40 cartes par set : au-delà on multiplie les appels sans rien gagner,
     les cartes chères étant concentrées en fin de numérotation. */
  const echantillon = (detail.cards || []).slice(-40);

  for (const c of echantillon) {
    let carte;
    try {
      carte = await api(`/cards/${c.id}`);
    } catch {
      rejets['carte illisible'] = (rejets['carte illisible'] || 0) + 1;
      continue;
    }
    examinees++;
    const verdict = examiner(carte, carte.pricing?.cardmarket, carte.pricing?.tcgplayer);
    if (verdict.ok) {
      retenues.push({
        ...verdict,
        set: s.name,
        setId: s.id,
        /*
          Code d'extension imprimé (« PAF », « POR »). Il vit sur /sets/{id},
          pas sur la carte, et `detail` est déjà en main : coût réseau nul.

          Repli sur l'identifiant TCGdex : `abbreviation.official` est absent
          sur les 25 sets japonais, où l'id fait office de code (« SM3p »),
          et sur quelques sets internationaux (swshp, Pokémon Pocket).

          `abbreviation.localized` (le code français) est VOLONTAIREMENT
          ignoré : il manque sur la moitié des sets récents, dont me01, me02,
          me04 et me05, c'est-à-dire là où ce classement se joue.
        */
        setCode: detail.abbreviation?.official || s.id,
        /* Dénominateur imprimé. `cardCount.total` compte les variantes et
           peut DÉPASSER le total officiel (me02.5 : 295 contre 318) : c'est
           `official` qui figure sur la carte. */
        setTotal: detail.cardCount?.official ?? null,
      });
    }
    else rejets[verdict.motif.replace(/\(.*\)/, '').trim()] = (rejets[verdict.motif.replace(/\(.*\)/, '').trim()] || 0) + 1;
  }
}

retenues.sort((a, b) => b.variation - a.variation);

/*
  Nom français de l'espèce, via PokéAPI (gratuit, sans clé).

  Indispensable sur le marché japonais : « エリカのモンジャラ » ne dit
  rien à un lecteur français. TCGdex sait filtrer par dexId mais renvoie
  des CARTES, pas le nom canonique de l'espèce — on obtenait « Brindibou
  et Noadkoko d'Alola GX » au lieu de « Noadkoko ».

  Résolu seulement pour le podium : trois appels, pas quatre cents. Un
  échec laisse le nom d'origine plutôt que de faire échouer le script —
  un nom en japonais vaut mieux que pas de publication.
*/
/* Nom de l'espèce en français ET en japonais : le second sert à le
   repérer dans le nom de la carte japonaise (scripts/lib/nom-japonais.mjs). */
async function nomsEspece(dexId) {
  if (!dexId) return null;
  try {
    const r = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${dexId}/`);
    if (!r.ok) return null;
    const j = await r.json();
    const nom = (langue) => j.names?.find((n) => n.language?.name === langue)?.name || null;
    const fr = nom('fr');
    return fr ? { fr, ja: nom('ja-hrkt') || nom('ja') } : null;
  } catch {
    return null;
  }
}

/* Un nom construit à partir d'une forme régionale, « Brillant » ou
   « Radieux » n'est publié que s'il existe tel quel dans la base française
   de TCGdex. Les deux apostrophes y coexistent (« Goupix d'Alola » et
   « Goupix d’Alola »). Base injoignable : on écarte la carte. */
async function existeEnFrancais(nom) {
  for (const variante of new Set([nom, nom.replace(/'/g, '’')])) {
    try {
      const r = await fetch(`${API}/fr/cards?name=eq:${encodeURIComponent(variante)}`);
      if (r.ok) {
        const j = await r.json();
        if (Array.isArray(j) && j.length > 0) return true;
      }
    } catch {
      /* on tente la variante suivante */
    }
  }
  return false;
}

/*
  Cartes DRESSEUR japonaises : PokéAPI ne connaît que les espèces, donc
  aucune traduction n'était possible et le nom japonais ressortait tel
  quel (« ウルトラ調査隊 », vu en production le 27 août 2026).

  Deux niveaux, du plus sûr au plus large :

  1. Table vérifiée à la main (data/traductions-dresseurs.json).
  2. Rapprochement automatique sur TCGdex par ILLUSTRATEUR + catégorie +
     rareté — trois champs qui ne sont PAS traduits et concordent entre
     la fiche japonaise et la fiche française. Retenu UNIQUEMENT si un
     seul candidat sort.

  Le seuil du point 2 n'est pas de la prudence excessive : mesuré sur
  « ウルトラ調査隊 », ces filtres laissent 26 candidats (10 en se
  limitant à l'ère du set). Trancher au hasard aurait publié « Kahili »
  à la place d'« Ultra-Commando ». Un nom faux est pire qu'une carte
  écartée — d'où la table pour les cas ambigus.
*/
let tableDresseurs = null;
function traductionManuelle(nom) {
  if (tableDresseurs === null) {
    try {
      const chemin = new URL('../data/traductions-dresseurs.json', import.meta.url);
      tableDresseurs = JSON.parse(readFileSync(chemin, 'utf8')).traductions || {};
    } catch {
      tableDresseurs = {};
    }
  }
  return tableDresseurs[nom] || null;
}

async function nomFrancaisDresseur(carte) {
  const manuelle = traductionManuelle(carte.name);
  if (manuelle) return manuelle;

  if (!carte.illustrator || !carte.rarity) return null;
  try {
    const params = new URLSearchParams({
      illustrator: carte.illustrator,
      category: 'Dresseur',
      rarity: carte.rarity,
    });
    const r = await fetch(`${API}/fr/cards?${params}`);
    if (!r.ok) return null;
    const candidats = await r.json();
    /* Un seul candidat = correspondance certaine. Au-delà, on ne devine
       pas : la carte sera écartée et son nom journalisé pour être ajouté
       à la table après vérification. */
    return Array.isArray(candidats) && candidats.length === 1 ? candidats[0].name : null;
  } catch {
    return null;
  }
}

/*
  Podium constitué au fil de la traduction, et NON avec un `slice(0, 3)`
  suivi d'une traduction.

  Une carte dont le nom reste en japonais n'a rien à faire dans une
  publication française. Le cas se produit sur les cartes DRESSEUR :
  PokéAPI ne connaît que les espèces, donc une carte sans `dexId` —
  « ウルトラ調査隊 » (Ultra Recon Squad) — ressortait telle quelle.
  Constaté en production le 27 août 2026, en 3e position du podium.

  Vérifié avant de choisir cette approche : TCGdex n'expose aucune
  correspondance entre une carte japonaise et sa version française
  (l'identifiant SM5p-055 répond 404 en locale fr comme en), et sa
  recherche par nom ne traverse pas les langues. Il n'existe donc pas de
  traduction fiable à aller chercher — d'où l'écart au profit de la
  carte suivante, plutôt qu'un affichage illisible.

  On s'arrête dès qu'on a trois cartes nommables : au pire on parcourt
  toutes les retenues, mais l'appel PokéAPI reste rare.
*/
/*
  Préparation d'une carte pour le podium : nom français, référence
  d'impression, recoupement du dénominateur. Faux si son nom reste
  intraduisible. Mémorisée : une carte peut être examinée par plusieurs
  paliers, ses appels réseau ne partent qu'une fois.
*/
const preparees = new Map();
async function preparerCarte(c) {
  if (!preparees.has(c.id)) preparees.set(c.id, await preparerCarteUneFois(c));
  return preparees.get(c.id);
}

async function preparerCarteUneFois(c) {
  /* Le nom d'espèce n'est ajouté que si le nom de la carte n'est PAS
     en alphabet latin. Sur « Méga-Méganium-ex », préfixer « Méganium »
     est redondant ; sur « エリカのモンジャラ », c'est indispensable. */
  const enLatin = [...c.nom].every((ch) => ch.codePointAt(0) < 0x0370);

  /* Espèce via PokéAPI ; à défaut, carte Dresseur via TCGdex. */
  const espece = await nomsEspece(c.dexId);
  let fr = espece?.fr || null;

  /* Carte Pokémon japonaise : le nom COMPLET de la carte, jamais l'espèce
     seule suivie du japonais (« Dracaufeu · メガリザードンXex » pour un
     Méga-Dracaufeu X-ex, essai à blanc du 25 octobre 2026). Nom non
     reconnu : la carte est écartée, comme un Dresseur intraduisible. */
  let nomComplet = null;
  if (!enLatin && fr) {
    const construit = nomFrancaisCarteJaponaise(c.nom, espece);
    if (construit && (construit.simple || (await existeEnFrancais(construit.nom)))) nomComplet = construit.nom;
    else fr = null;
  }
  if (!fr && !enLatin && c.category === 'Trainer') {
    fr = await nomFrancaisDresseur({ name: c.nom, illustrator: c.illustrator, rarity: c.rarity });
  }

  if (!enLatin && !fr && !nomComplet) {
    rejets['nom non traduisible'] = (rejets['nom non traduisible'] || 0) + 1;
    /* Journalisé pour pouvoir enrichir data/traductions-dresseurs.json
       après vérification manuelle : sans ce nom, impossible de savoir
       quoi ajouter. */
    console.error(
      c.category === 'Trainer'
        ? `  ↳ nom non traduisible, à ajouter à la table : ${c.nom} (${c.id})`
        : `  ↳ nom de carte japonaise non reconnu (scripts/lib/nom-japonais.mjs) : ${c.nom} (${c.id})`,
    );
    return false;
  }

  /* `nomFr` garde l'espèce (ou le nom du Dresseur), `nom` le nom d'origine
     pour l'archive. Ce qui se publie est `affichage` : le nom complet en
     français pour une carte japonaise, le nom officiel français d'un
     Dresseur, le nom de la carte telle quelle sur le marché français. */
  c.nomFr = fr;
  c.affichage = nomComplet || (!fr || enLatin ? c.nom : fr);
  /* L'extension japonaise n'a pas de nom français : on dit de quelle
     édition il s'agit, la référence (« SM3p 079 ») situant la carte. Le nom
     japonais de l'extension reste dans `set`, pour l'archive. */
  if (MARCHE === 'jp') c.setAffiche = 'édition japonaise';

  /*
    Référence courte de l'impression : « POR 120/088 ».

    C'est ce qui rend la cote VÉRIFIABLE. Sans elle, un lecteur ne peut pas
    retrouver la carte dont on annonce la hausse, et le prix paraît
    arbitraire : le podium du 17 septembre annonçait « Dracaufeu 427,58 € »
    pour un Méga-Dracaufeu Y-ex en illustration spéciale.

    Le dénominateur est aligné sur la largeur du numéro pour respecter la
    typographie imprimée (« 012/091 » et non « 012/91 »).
  */
  /*
    Forme courte, « ASC 286 » : exactement ce qui est imprimé en bas de la
    carte française (ligne « [I] [ASC FR] 286/217 »), et exactement le
    titre que Cardmarket emploie sur son propre site français
    (« Dracaufeu ex (OBF 125) »). Aucun apprentissage à demander au
    lecteur, et la cote devient vérifiable par copier-coller.

    C'est aussi la seule forme qui tienne sur X en pire cas : mesuré sur
    les 228 noms de la fenêtre balayée, la longueur médiane est de 10
    caractères mais le 99e centile monte à 27. La forme avec
    dénominateur n'en couvre que 90 %.
  */

  /*
    Forme complète pour la vignette, où la place ne manque pas. Le
    dénominateur porte un signal éditorial réel : « 286/217 » signifie
    carte secrète, et deux des trois cartes du podium du 17 septembre en
    étaient.

    Omis sur les promos, qui n'en portent PAS sur la carte (« SVP FR 206 »,
    sans rien d'autre) : l'inventer serait une erreur factuelle.
  */

  /* Le calcul lui-même vit dans le module partagé : la newsletter et
     l'outil de complétion des archives doivent produire EXACTEMENT la même
     chaîne, sans quoi un post et un email désigneraient la même carte de
     deux façons. Couvert par scripts/lib/reference-carte.test.mjs. */
  const { refCourte, refLongue } = referenceCarte({ localId: c.localId, setCode: c.setCode, setTotal: c.setTotal });
  c.refCourte = refCourte;
  c.refLongue = refLongue;

  /*
    Recoupement du dénominateur contre une seconde base, pokemontcg.io
    (scripts/lib/reference-carte.mjs). TCGdex est la seule source du code
    d'extension et du total imprimé : sans recoupement, une erreur de sa
    part s'afficherait comme un fait dans les posts et dans la newsletter.

    Il ne fait JAMAIS échouer le classement. Base injoignable : on garde la
    valeur de TCGdex et on le note. Divergence avérée : on retire le
    dénominateur, la forme courte restant vraie.

    `refVerifiee` : true (confirmée), false (divergente), null (non
    recoupée). Archivé avec la carte, pour savoir après coup ce qui a été
    vérifié et ce qui ne l'a pas été.
  */
  const aUnTotal = c.refLongue != null && c.refLongue !== c.refCourte;
  const recoupement = aUnTotal ? await corroborerExtension(c) : { statut: 'non_applicable' };
  c.refVerifiee = recoupement.statut === 'confirmee' ? true : recoupement.statut === 'divergente' ? false : null;
  if (recoupement.statut === 'divergente') {
    console.error(
      `::warning::Total imprimé non recoupé pour ${c.affichage} (${c.setCode}) : ${recoupement.ecarts.join(' ; ')}. ` +
        `Référence réduite à « ${c.refCourte} ».`,
    );
    c.refLongue = c.refCourte;
  } else if (recoupement.statut === 'indisponible') {
    console.error(`::notice::Total imprimé de ${c.setCode} non recoupé (${recoupement.detail}) : valeur TCGdex conservée.`);
  }
  for (const note of recoupement.notes || []) console.error(`::notice::${c.setCode} : ${note}`);

  return true;
}

/*
  Le palier le plus strict qui donne trois cartes nommables. S'il n'y en a
  aucun, le podium reste incomplet : publie-cote.mjs ne publie pas, et le
  workflow passe à l'autre marché.
*/
let podium = [];
let palier = null;
for (const p of PALIERS) {
  const essai = [];
  for (const c of retenues) {
    if (essai.length >= 3) break;
    if (passeLePalier(c, p) && (await preparerCarte(c))) essai.push(c);
  }
  podium = essai;
  palier = p;
  if (essai.length >= 3) break;
}
for (const c of podium) c.palier = palier.nom;
const sousLePalier = retenues.filter((c) => !passeLePalier(c, palier)).length;
if (sousLePalier) rejets[`sous le palier ${palier.nom}`] = sousLePalier;
const podiumArchivable = podium.map(({ variationBrute, confirmationBrute, ...c }) => c);

/*
  Un podium incomplet n'est pas une erreur du script : il sort en 0, et c'est
  le workflow qui tente l'autre marché. Jamais de classement inventé : un
  palier assouplit le seuil de hausse, jamais la confirmation sur 7 jours.
*/
if (EN_JSON) {
  console.log(JSON.stringify({ marche: MARCHE, examinees, retenues: retenues.length, palier: palier.nom, podium: podiumArchivable, rejets }, null, 2));
} else {
  console.log(`Marché : ${MARCHE === 'jp' ? 'cartes japonaises (cote EUR)' : 'cartes françaises (cote commune à toutes les langues)'}`);
  console.log(`Cartes examinées : ${examinees} · candidates : ${retenues.length} · palier : ${palier.nom}`);
  console.log('Rejets :', Object.entries(rejets).map(([m, n]) => `${m} ×${n}`).join(', ') || 'aucun');
  if (podium.length === 0) {
    console.log('\nAucune hausse significative cette semaine. Rien à publier.');
  } else {
    console.log('\nTop des hausses :');
    for (const [i, c] of podium.entries()) {
      console.log(`  ${i + 1}. ${c.affichage} · ${c.setAffiche || c.set} ${c.refLongue || '?'} · ${c.actuel} € (+${c.variation} %, réf. ${c.reference} €, avg7 +${c.confirmation} %)`);
    }
  }
}

process.exit(0);
