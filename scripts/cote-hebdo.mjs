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

const API = 'https://api.tcgdex.net/v2';

/* ── Garde-fous ────────────────────────────────────────────
   Chaque seuil existe parce qu'un cas réel le justifie. */

/* Au-delà, la source est considérée périmée et le script REFUSE de
   produire un classement. C'est la leçon des 50 jours. */
const FRAICHEUR_MAX_JOURS = 4;

/* Sous ce prix, une variation ne veut rien dire : passer de 0,02 € à
   0,03 € fait « +50 % » et n'intéresse personne. */
const PRIX_PLANCHER_EUR = 1.5;

/* Au-delà, on soupçonne une donnée aberrante plutôt qu'un vrai mouvement.
   Mieux vaut rater une flambée réelle que publier un chiffre faux. */
const HAUSSE_MAX_PLAUSIBLE = 300;

/* En dessous, ce n'est pas une hausse, c'est du bruit de marché. */
const HAUSSE_MIN_INTERESSANTE = 12;

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

/* Repli quand TCGplayer ne cote pas la carte (toutes les japonaises) :
   `avg7` doit dépasser `avg30` d'au moins 15 % pour que la hausse soit
   considérée confirmée sur la semaine, et non portée par une vente
   isolée. Seuil bas à dessein — il écarte les artefacts sans exiger que
   la hausse hebdomadaire égale la hausse instantanée. */
const CONFIRMATION_AVG7 = 1.15;

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
  if (variation < HAUSSE_MIN_INTERESSANTE) return { ok: false, motif: 'variation négligeable' };

  /*
    Deux recoupements possibles, et il en faut TOUJOURS un.

    Le recoupement TCGplayer ne s'applique qu'aux cartes internationales :
    vérifié le 27 août 2026, TCGdex n'expose aucun prix TCGplayer sur les
    cartes japonaises. Or la rotation alterne int/jp — le garde-fou posé
    la veille était donc inopérant une semaine sur deux, sans que rien ne
    le signale.

    Repli pour ces cartes : exiger que la moyenne à 7 jours confirme la
    hausse. Une flambée réelle tire `avg7` au-dessus d'`avg30` ; une vente
    isolée à prix fort gonfle `trend` en laissant `avg7` collé à `avg30`.
    Sur un marché peu liquide comme le japonais, c'est précisément la
    confusion à éviter.
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
  } else {
    const a7 = cm.avg7;
    if (!a7) return { ok: false, motif: 'ni TCGplayer ni avg7 pour recouper' };
    if (a7 < reference * CONFIRMATION_AVG7) {
      return {
        ok: false,
        motif: `pic isolé, avg7 (${a7} €) ne confirme pas la hausse sur 30 j (${reference} €)`,
      };
    }
  }

  return {
    ok: true,
    nom: carte.name,
    dexId: Array.isArray(carte.dexId) ? carte.dexId[0] : null,
    id: carte.id,
    actuel: Math.round(actuel * 100) / 100,
    reference: Math.round(reference * 100) / 100,
    variation: Math.round(variation),
    image: carte.image ? `${carte.image}/high.png` : null,
    maj: cm.updated,
    recoupeTcgplayer: recoupe,
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
    if (verdict.ok) retenues.push({ ...verdict, set: s.name });
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
async function nomFrancais(dexId) {
  if (!dexId) return null;
  try {
    const r = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${dexId}/`);
    if (!r.ok) return null;
    const j = await r.json();
    return j.names?.find((n) => n.language?.name === 'fr')?.name || null;
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
const podium = [];
for (const c of retenues) {
  if (podium.length >= 3) break;

  const fr = await nomFrancais(c.dexId);
  /* Le nom d'espèce n'est ajouté que si le nom de la carte n'est PAS
     en alphabet latin. Sur « Méga-Méganium-ex », préfixer « Méganium »
     est redondant ; sur « エリカのモンジャラ », c'est indispensable. */
  const enLatin = [...c.nom].every((ch) => ch.codePointAt(0) < 0x0370);

  if (!enLatin && !fr) {
    rejets['nom non traduisible'] = (rejets['nom non traduisible'] || 0) + 1;
    continue;
  }

  /* On garde le nom d'origine à côté : sur une carte japonaise il situe
     la version, sur une carte française il est déjà identique. */
  c.nomFr = fr;
  c.affichage = fr && !enLatin ? `${fr} — ${c.nom}` : c.nom;
  podium.push(c);
}

/*
  Aucun résultat n'est un échec ACCEPTABLE, pas une erreur : un marché
  calme est un marché calme. On sort en 0 sans rien publier — mieux vaut
  le silence qu'un classement inventé.
*/
if (EN_JSON) {
  console.log(JSON.stringify({ marche: MARCHE, examinees, retenues: retenues.length, podium, rejets }, null, 2));
} else {
  console.log(`Marché : ${MARCHE === 'jp' ? 'cartes japonaises (cote EUR)' : 'international'}`);
  console.log(`Cartes examinées : ${examinees} — retenues : ${retenues.length}`);
  console.log('Rejets :', Object.entries(rejets).map(([m, n]) => `${m} ×${n}`).join(', ') || 'aucun');
  if (podium.length === 0) {
    console.log('\nAucune hausse significative cette semaine. Rien à publier.');
  } else {
    console.log('\nTop des hausses :');
    for (const [i, c] of podium.entries()) {
      console.log(`  ${i + 1}. ${c.affichage} (${c.set}) — ${c.actuel} € (+${c.variation} %, réf. ${c.reference} €)`);
    }
  }
}

process.exit(0);
