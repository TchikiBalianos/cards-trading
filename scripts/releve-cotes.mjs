/**
 * Relève et archive les cotes, pour se constituer un historique maison.
 *
 * Plan de secours, et couverture des TCG dont aucune source ne publie
 * d'évolution. Cas concret : One Piece. `optcgapi.com` donne un prix
 * courant et rien d'autre — aucune moyenne, aucun historique, donc aucune
 * variation calculable. En relevant nous-mêmes chaque semaine, la
 * variation devient calculable à partir du DEUXIÈME relevé.
 *
 * Pokémon n'en a pas besoin (TCGdex publie avg7/avg30), mais est relevé
 * quand même : le jour où TCGdex tombe ou change, l'historique est déjà là.
 * Se constituer une mémoire coûte peu ; la reconstituer après coup est
 * impossible.
 *
 *   node scripts/releve-cotes.mjs --tcg=one-piece
 *   node scripts/releve-cotes.mjs --tcg=one-piece --variations
 *
 * Archive : data/cotes/<tcg>.json, committé — auditable, sans base de
 * données, et versionné comme le reste du projet.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = join(RACINE, 'data', 'cotes');

const args = process.argv.slice(2);
const TCG = (args.find((a) => a.startsWith('--tcg=')) || '').split('=')[1] || 'one-piece';
const VARIATIONS = args.includes('--variations');

/* Un relevé par semaine, 26 gardés : six mois de mémoire, largement de
   quoi calculer des variations à 1, 4 ou 12 semaines. Au-delà le fichier
   grossit sans servir — et il est committé à chaque fois. */
const RELEVES_MAX = 26;

/* Sous ce prix une variation ne veut rien dire, comme pour le calcul
   Pokémon : passer de 0,10 à 0,15 $ fait « +50 % » sans intérêt. */
const PRIX_PLANCHER = 2;

/* Deux relevés le même jour n'apporteraient rien et fausseraient les
   écarts hebdomadaires. */
function dejaReleveAujourdhui(archive) {
  const auj = new Date().toISOString().slice(0, 10);
  return archive.releves?.some((r) => r.date === auj);
}

/* ── Sources ───────────────────────────────────────────── */

/*
  One Piece via optcgapi.com : prix courant en USD, avec un `date_scraped`
  par carte qui permet de vérifier la fraîcheur — contrairement à d'autres
  sources muettes sur ce point.
*/
async function releverOnePiece() {
  /*
    Liste des sets résolue À L'EXÉCUTION, jamais codée en dur.

    Première version : ['OP-16', 'OP-15', 'OP-14']. Deux 404 sur trois —
    la numérotation One Piece est irrégulière (OP-16, mais aussi
    « OP14-EB04 », « PRB-01 », « EB-03 »). Deviner un identifiant de set
    ne marche pas, et un 404 silencieux aurait donné un historique
    tronqué sans que rien ne le signale.
  */
  const repSets = await fetch('https://optcgapi.com/api/allSets/');
  if (!repSets.ok) throw new Error(`liste des sets : HTTP ${repSets.status}`);
  const tous = await repSets.json();
  if (!Array.isArray(tous) || tous.length === 0) throw new Error('liste des sets vide');

  const sets = tous.slice(-5).map((s) => s.set_id);
  console.log(`Sets relevés : ${sets.join(', ')}`);
  const cartes = {};

  for (const set of sets) {
    const rep = await fetch(`https://optcgapi.com/api/sets/${set}/`);
    if (!rep.ok) {
      console.warn(`⚠️  ${set} : HTTP ${rep.status}, ignoré.`);
      continue;
    }
    const liste = await rep.json();
    if (!Array.isArray(liste)) continue;

    for (const c of liste) {
      const prix = Number(c.market_price);
      if (!Number.isFinite(prix) || prix < PRIX_PLANCHER) continue;
      /* card_set_id identifie la carte de façon stable d'un relevé à
         l'autre, contrairement au nom qui peut varier. */
      const id = c.card_set_id || `${set}-${c.card_name}`;
      cartes[id] = { nom: c.card_name, set: c.set_name || set, prix, releve: c.date_scraped };
    }
  }
  return cartes;
}

const SOURCES = { 'one-piece': releverOnePiece };

/* ── Archive ───────────────────────────────────────────── */

function charger(tcg) {
  const f = join(DOSSIER, `${tcg}.json`);
  if (!existsSync(f)) return { tcg, cartes: {}, releves: [] };
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    /* Archive corrompue : on repart plutôt que de planter, en le disant.
       Perdre l'historique est regrettable, bloquer la publication l'est
       davantage. */
    console.warn('⚠️  Archive illisible, réinitialisée.');
    return { tcg, cartes: {}, releves: [] };
  }
}

function enregistrer(archive) {
  mkdirSync(DOSSIER, { recursive: true });
  writeFileSync(join(DOSSIER, `${archive.tcg}.json`), JSON.stringify(archive, null, 2) + '\n');
}

/* ── Variations ────────────────────────────────────────── */

/*
  Compare le dernier relevé au plus ancien disponible dans la fenêtre
  demandée. On ne fabrique RIEN : s'il n'y a qu'un relevé, il n'y a pas
  de variation, et le script le dit.
*/
function calculerVariations(archive, semaines = 4) {
  const dates = archive.releves.map((r) => r.date).sort();
  if (dates.length < 2) return { pret: false, releves: dates.length };

  const derniere = dates[dates.length - 1];
  const cible = dates[Math.max(0, dates.length - 1 - semaines)];

  const mouvements = [];
  for (const [id, c] of Object.entries(archive.cartes)) {
    const avant = c.historique?.[cible];
    const apres = c.historique?.[derniere];
    if (!avant || !apres || avant < PRIX_PLANCHER) continue;
    const variation = ((apres - avant) / avant) * 100;
    if (!Number.isFinite(variation) || Math.abs(variation) < 10) continue;
    mouvements.push({ id, nom: c.nom, set: c.set, avant, apres, variation: Math.round(variation) });
  }
  mouvements.sort((a, b) => b.variation - a.variation);
  return { pret: true, de: cible, a: derniere, ecart: dates.length - 1, mouvements };
}

/* ── Exécution ─────────────────────────────────────────── */

const archive = charger(TCG);

if (VARIATIONS) {
  const r = calculerVariations(archive);
  if (!r.pret) {
    console.log(`Historique insuffisant : ${r.releves} relevé(s). Il en faut au moins 2.`);
    console.log('Le calcul deviendra possible au prochain relevé hebdomadaire.');
    process.exit(0);
  }
  console.log(`Variations du ${r.de} au ${r.a} (${r.ecart} relevé(s) d'écart) :`);
  if (r.mouvements.length === 0) console.log('  aucun mouvement significatif.');
  for (const m of r.mouvements.slice(0, 5)) {
    console.log(`  ${m.variation > 0 ? '+' : ''}${m.variation} %  ${m.nom} (${m.set}) — ${m.avant} $ → ${m.apres} $`);
  }
  process.exit(0);
}

if (dejaReleveAujourdhui(archive)) {
  console.log('Relevé déjà effectué aujourd’hui. Rien à faire.');
  process.exit(0);
}

const source = SOURCES[TCG];
if (!source) {
  console.error(`::error::Aucune source déclarée pour « ${TCG} ».`);
  process.exit(1);
}

const cartes = await source();
const nb = Object.keys(cartes).length;
if (nb === 0) {
  /* Zéro carte signale une source en panne, pas un marché calme : on
     échoue bruyamment plutôt que d'écrire un relevé vide qui polluerait
     l'historique. */
  console.error('::error::La source n’a renvoyé aucune carte. Relevé abandonné.');
  process.exit(1);
}

const auj = new Date().toISOString().slice(0, 10);
for (const [id, c] of Object.entries(cartes)) {
  if (!archive.cartes[id]) archive.cartes[id] = { nom: c.nom, set: c.set, historique: {} };
  archive.cartes[id].historique[auj] = c.prix;
}

archive.releves.push({ date: auj, cartes: nb });

/* Élagage : on retire les relevés les plus anciens ET leurs prix, sinon
   le fichier enfle indéfiniment. */
if (archive.releves.length > RELEVES_MAX) {
  const aJeter = archive.releves.slice(0, archive.releves.length - RELEVES_MAX).map((r) => r.date);
  archive.releves = archive.releves.slice(-RELEVES_MAX);
  for (const c of Object.values(archive.cartes)) {
    for (const d of aJeter) delete c.historique[d];
  }
  console.log(`Élagage : ${aJeter.length} relevé(s) ancien(s) retiré(s).`);
}

enregistrer(archive);
console.log(`Relevé du ${auj} : ${nb} carte(s) archivée(s).`);
console.log(`Historique : ${archive.releves.length} relevé(s), ${Object.keys(archive.cartes).length} carte(s) suivie(s).`);
