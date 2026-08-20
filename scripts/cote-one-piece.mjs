/**
 * Top des hausses One Piece, à partir d'un historique réel de 13 jours.
 *
 * Source : optcgapi.com, sans clé. L'endpoint
 * `/api/sets/card/twoweeks/{id}/` renvoie `Day1_Market_Price` …
 * `Day13_Market_Price` — l'évolution quotidienne déjà calculée, en un
 * seul appel par carte. C'est l'équivalent One Piece de ce que TCGdex
 * fournit pour Pokémon.
 *
 * Produit le MÊME contrat JSON que cote-hebdo.mjs, pour que
 * publie-cote.mjs consomme l'un ou l'autre sans le savoir.
 *
 *   node scripts/cote-one-piece.mjs
 *   node scripts/cote-one-piece.mjs --json
 *
 * ⚠️ Aucune clé requise, mais le service est le projet personnel d'un
 * développeur unique qui demande de ne pas le marteler. D'où le
 * plafond d'appels ci-dessous et la pause entre chaque.
 */

const BASE = 'https://www.optcgapi.com/api';

/* ── Garde-fous ────────────────────────────────────────── */

/* Vérifié à la main : la variante « Parallel » de OP01-001 affiche
   568,01 $ sur les treize jours ET porte un `date_scraped` du 9 juin,
   soit deux mois et demi. Série figée et date périmée vont ensemble —
   c'est une carte illiquide dont le prix n'est plus relevé, pas un
   marché stable. Les deux contrôles se recoupent volontairement. */
const FRAICHEUR_MAX_JOURS = 10;
const VALEURS_DISTINCTES_MIN = 3;

const PRIX_PLANCHER = 3;
const HAUSSE_MIN = 12;
const HAUSSE_MAX_PLAUSIBLE = 300;

/* Le service est un hobby project : on borne les appels et on espace. */
const CARTES_MAX = 40;
const PAUSE_MS = 120;

const EN_JSON = process.argv.includes('--json');

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'cards-trading.com (contact@cards-trading.com)' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function joursDepuis(d) {
  return Math.round((Date.now() - new Date(d).getTime()) / 86400000);
}

/* ── 1. Sélection des candidates ───────────────────────── */

/* Liste des sets résolue à l'exécution : la numérotation One Piece est
   irrégulière (OP-16 mais aussi OP14-EB04, PRB-01, EB-03), un
   identifiant deviné renvoie un 404 silencieux. */
const sets = await json(`${BASE}/allSets/`);
const recents = sets.slice(-4).map((s) => s.set_id);

const candidates = [];
for (const set of recents) {
  let liste;
  try {
    liste = await json(`${BASE}/sets/${set}/`);
  } catch {
    continue;
  }
  for (const c of liste) {
    const prix = Number(c.market_price);
    if (Number.isFinite(prix) && prix >= PRIX_PLANCHER && c.card_set_id) {
      candidates.push({ id: c.card_set_id, nom: c.card_name, set: c.set_name || set, prix });
    }
  }
}

/* Les cartes chères d'abord : ce sont celles qui font l'actualité, et
   ça borne le nombre d'appels à l'endpoint d'historique. */
candidates.sort((a, b) => b.prix - a.prix);
const aExaminer = candidates.slice(0, CARTES_MAX);

/* ── 2. Historique carte par carte ─────────────────────── */

const retenues = [];
const rejets = {};
let examinees = 0;

const rejeter = (motif) => { rejets[motif] = (rejets[motif] || 0) + 1; };

for (const c of aExaminer) {
  await dormir(PAUSE_MS);
  let variantes;
  try {
    variantes = await json(`${BASE}/sets/card/twoweeks/${c.id}/`);
  } catch {
    rejeter('historique illisible');
    continue;
  }
  examinees++;

  /* L'endpoint renvoie toutes les variantes d'une carte (normale,
     Parallel, Alternate Art…). On garde la meilleure hausse crédible. */
  for (const v of Array.isArray(variantes) ? variantes : [variantes]) {
    const jours = [];
    for (let d = 1; d <= 13; d++) {
      const x = Number(v[`Day${d}_Market_Price`]);
      if (Number.isFinite(x)) jours.push(x);
    }
    if (jours.length < 13) { rejeter('historique incomplet'); continue; }

    const scrape = v.date_scraped || v.Date_Scraped;
    if (!scrape || joursDepuis(scrape) > FRAICHEUR_MAX_JOURS) { rejeter('relevé périmé'); continue; }

    if (new Set(jours).size < VALEURS_DISTINCTES_MIN) { rejeter('série figée'); continue; }

    const debut = jours[0];
    const fin = jours[jours.length - 1];
    if (!debut || fin < PRIX_PLANCHER) { rejeter('sous le plancher'); continue; }

    const variation = ((fin - debut) / debut) * 100;
    if (!Number.isFinite(variation)) { rejeter('variation non calculable'); continue; }
    if (variation > HAUSSE_MAX_PLAUSIBLE) { rejeter('hausse aberrante'); continue; }
    if (variation < HAUSSE_MIN) { rejeter('variation négligeable'); continue; }

    retenues.push({
      nom: (v.card_name || c.nom || '').trim(),
      nomFr: null, /* les personnages One Piece gardent leur nom en français */
      set: c.set,
      id: c.id,
      actuel: Math.round(fin * 100) / 100,
      reference: Math.round(debut * 100) / 100,
      variation: Math.round(variation),
      devise: 'USD',
      maj: scrape,
    });
  }
}

retenues.sort((a, b) => b.variation - a.variation);
const podium = retenues.slice(0, 3);

if (EN_JSON) {
  console.log(JSON.stringify({ marche: 'op', examinees, retenues: retenues.length, podium, rejets }, null, 2));
} else {
  console.log(`Marché : One Piece Card Game (historique 13 jours)`);
  console.log(`Cartes examinées : ${examinees} — retenues : ${retenues.length}`);
  console.log('Rejets :', Object.entries(rejets).map(([m, n]) => `${m} ×${n}`).join(', ') || 'aucun');
  if (podium.length === 0) {
    console.log('\nAucune hausse significative cette semaine. Rien à publier.');
  } else {
    console.log('\nTop des hausses :');
    for (const [i, c] of podium.entries()) {
      console.log(`  ${i + 1}. ${c.nom} (${c.set}) — ${c.actuel} $ (+${c.variation} %, il y a 13 j : ${c.reference} $)`);
    }
  }
}
