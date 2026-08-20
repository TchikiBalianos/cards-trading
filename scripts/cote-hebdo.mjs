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
function examiner(carte, cm) {
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
    const verdict = examiner(carte, carte.pricing?.cardmarket);
    if (verdict.ok) retenues.push({ ...verdict, set: s.name });
    else rejets[verdict.motif.replace(/\(.*\)/, '').trim()] = (rejets[verdict.motif.replace(/\(.*\)/, '').trim()] || 0) + 1;
  }
}

retenues.sort((a, b) => b.variation - a.variation);
const podium = retenues.slice(0, 3);

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

for (const c of podium) {
  const fr = await nomFrancais(c.dexId);
  /* On garde le nom d'origine à côté : sur une carte japonaise il situe
     la version, sur une carte française il est déjà identique. */
  c.nomFr = fr;
  c.affichage = fr && fr !== c.nom ? `${fr} — ${c.nom}` : c.nom;
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
