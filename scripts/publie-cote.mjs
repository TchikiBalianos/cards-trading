/**
 * Publie le « top des hausses » hebdomadaire sur Discord et Buffer.
 *
 * Troisième créneau de la semaine, complémentaire du relais d'articles :
 * celui-ci ne dépend pas du calendrier éditorial, il tourne même les
 * semaines sans publication de blog.
 *
 * Enchaîne trois étapes, chacune pouvant s'arrêter proprement :
 *   1. cote-hebdo.mjs calcule le classement (et refuse de le faire si les
 *      prix sont périmés — voir ses garde-fous) ;
 *   2. une vignette 1080×1080 est générée pour Instagram et TikTok ;
 *   3. le post part sur Discord et sur Buffer.
 *
 * ⚠️ Si le classement est vide, on ne publie RIEN et on sort en 0. Un
 * marché calme est un marché calme ; inventer un top serait exactement la
 * faute qu'on cherche à éviter depuis le début.
 *
 *   node scripts/publie-cote.mjs --marche=jp --dry-run
 *
 * Variables : DISCORD_WEBHOOK_DEFAUT (ou _POKEMON), BUFFER_API_KEY
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = join(RACINE, 'public', 'assets', 'social');
const MARQUE = join(RACINE, 'public', 'assets', 'img', 'logo-icon.png');
const SITE = 'https://cards-trading.com';

const args = process.argv.slice(2);
const MARCHE = (args.find((a) => a.startsWith('--marche=')) || '').split('=')[1] || 'int';
const SEC = args.includes('--dry-run');

/*
  Deux phases, parce que Buffer récupère l'image par URL PUBLIQUE : la
  vignette doit être déployée avant qu'on puisse la référencer.

    --phase=preparer  calcule, génère la vignette, écrit le cache
    --phase=publier   relit le cache et envoie

  Entre les deux, le workflow committe l'image et attend que Vercel l'ait
  servie. Sans ce découpage, Buffer recevrait une URL en 404 et le post
  partirait sans visuel — ou serait rejeté.
*/
const PHASE = (args.find((a) => a.startsWith('--phase=')) || '').split('=')[1] || 'tout';
const CACHE = join(RACINE, '.cote-cache.json');

const BLEU = '#2997ff';
const FOND = '#07111f';

/*
  Garde-fou : un seul top des hausses par jour.

  Le podium archivé fait foi. Sans ce contrôle, un déclenchement manuel
  suivi du cron du jeudi republierait le même classement sur Discord et
  Buffer, à quelques heures d'intervalle — un doublon visible par tous
  les abonnés, impossible à rattraper une fois parti.

  Volontairement INACTIF en phase « publier » : à ce moment-là le run
  légitime est déjà engagé (vignette committée et déployée), et l'entrée
  du jour n'est écrite qu'à la fin de cette phase. L'y appliquer
  bloquerait la publication qu'on vient justement de préparer.
*/
if (PHASE !== 'publier' && !SEC) {
  const FICHIER = join(RACINE, 'data', 'cotes', 'podiums-hebdo.json');
  try {
    const historique = JSON.parse(readFileSync(FICHIER, 'utf8'));
    const aujourdhui = new Date().toISOString().slice(0, 10);
    if (Array.isArray(historique) && historique.some((e) => e.date === aujourdhui)) {
      console.log(`Un top des hausses a déjà été publié aujourd'hui (${aujourdhui}). Rien à faire.`);
      process.exit(0);
    }
  } catch {
    /* Fichier absent ou illisible : premier passage, on continue. */
  }
}

/* ── 1. Classement ─────────────────────────────────────── */

const brut = execFileSync(
  process.execPath,
  [
    /* One Piece a sa propre source : optcgapi expose un historique de
       13 jours, la ou TCGdex ne couvre que Pokemon. Les deux scripts
       produisent le MEME contrat JSON, d'ou l'aiguillage ici plutot
       qu'un branchement dans toute la suite. */
    MARCHE === 'op'
      ? join(RACINE, 'scripts', 'cote-one-piece.mjs')
      : join(RACINE, 'scripts', 'cote-hebdo.mjs'),
    ...(MARCHE === 'op' ? [] : [`--marche=${MARCHE}`]),
    '--json',
  ],
  { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
);
const donnees = JSON.parse(brut);

if (!donnees.podium || donnees.podium.length === 0) {
  console.log(`Aucune hausse significative (${donnees.examinees} cartes examinées). Rien à publier.`);
  process.exit(0);
}

const titreMarche =
  MARCHE === 'jp' ? 'Cartes japonaises' : MARCHE === 'op' ? 'One Piece Card Game' : 'Cartes Pokémon';
const mentionSource =
  MARCHE === 'op' ? 'Évolution sur 13 jours' : 'Cote Cardmarket en euros, sur 30 jours';
const motsCles = MARCHE === 'op' ? '#onepiececardgame #opcg' : '#pokemontcg #cartespokemon';
const semaine = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
console.log(`${donnees.podium.length} carte(s) au podium sur ${donnees.examinees} examinées.`);

/* ── 2. Vignette ───────────────────────────────────────── */

function echapper(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/* Un nom trop long casse la mise en page : on tronque plutôt que de
   laisser déborder hors de la toile. */
const court = (t, n) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);

/* Virgule décimale et espace insécable avant le symbole : « 96,54 € ».
   Un « 96.54 € » à l'anglaise sur un compte français fait amateur. */
const DEVISE = MARCHE === 'op' ? '$' : '€';
const euros = (n) => n.toFixed(2).replace('.', ',') + ' ' + DEVISE;

async function vignetteCote() {
  const L = 1080, H = 1080, marge = 90;
  const lignes = donnees.podium.map((c, i) => {
    const y = 430 + i * 165;
    return `
  <text x="${marge}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="46"
        font-weight="700" fill="${BLEU}">${i + 1}</text>
  <text x="${marge + 52}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="40"
        font-weight="700" fill="#ffffff">${echapper(court(c.nomFr || c.nom, 26))}</text>
  <text x="${marge + 52}" y="${y + 46}" font-family="Arial, Helvetica, sans-serif" font-size="32"
        fill="#ffffff" fill-opacity="0.72">${echapper(euros(c.actuel))}</text>
  <text x="${marge + 200}" y="${y + 46}" font-family="Arial, Helvetica, sans-serif" font-size="32"
        font-weight="700" fill="#22c55e">+${c.variation} %</text>`;
  }).join('\n');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}">
  <defs>
    <radialGradient id="halo" cx="78%" cy="18%" r="62%">
      <stop offset="0%" stop-color="${BLEU}" stop-opacity="0.34"/>
      <stop offset="100%" stop-color="${BLEU}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${L}" height="${H}" fill="${FOND}"/>
  <rect width="${L}" height="${H}" fill="url(#halo)"/>
  <text x="212" y="132" font-family="Arial, Helvetica, sans-serif" font-size="40"
        font-weight="700" fill="#ffffff">Cards-Trading</text>
  <text x="${marge}" y="280" font-family="Arial, Helvetica, sans-serif" font-size="58"
        font-weight="700" fill="#ffffff">Top des hausses</text>
  <text x="${marge}" y="336" font-family="Arial, Helvetica, sans-serif" font-size="32"
        fill="${BLEU}">${echapper(titreMarche)} · semaine du ${echapper(semaine)}</text>
${lignes}
  <text x="${marge}" y="972" font-family="Arial, Helvetica, sans-serif" font-size="26"
        fill="#ffffff" fill-opacity="0.5">${echapper(mentionSource)} · cards-trading.com</text>
</svg>`;

  const marque = await sharp(MARQUE)
    .extract({ left: 23, top: 53, width: 360, height: 407 })
    .resize({ height: 92 })
    .toBuffer();

  mkdirSync(SORTIE, { recursive: true });
  /* Nom horodaté : les fichiers de public/assets/ sont servis en cache
     immutable un an. Réutiliser « cote-jp.png » chaque semaine servirait
     éternellement la première image. */
  const nom = `cote-${MARCHE}-${new Date().toISOString().slice(0, 10)}.png`;
  await sharp(Buffer.from(svg))
    .composite([{ input: marque, left: marge, top: 62 }])
    .png({ compressionLevel: 9 })
    .toFile(join(SORTIE, nom));
  return nom;
}

let fichier;
if (PHASE === 'publier') {
  const cache = JSON.parse(readFileSync(CACHE, 'utf8'));
  fichier = cache.fichier;
} else {
  fichier = await vignetteCote();
}
const urlVignette = `${SITE}/assets/social/${fichier}`;
console.log(`Vignette : ${fichier}`);

if (PHASE === 'preparer') {
  writeFileSync(CACHE, JSON.stringify({ fichier, podium: donnees.podium, marche: MARCHE }, null, 2));
  console.log('Cache écrit. La vignette doit être committée et déployée avant la phase « publier ».');
  process.exit(0);
}

/* ── 3. Textes ─────────────────────────────────────────── */

const classement = donnees.podium
  .map((c, i) => `${i + 1}. ${c.nomFr || c.nom} — ${euros(c.actuel)} (+${c.variation} %)`)
  .join('\n');

const lien = `${SITE}/?utm_source=`;
const accroche = `📈 Top des hausses de la semaine — ${titreMarche.toLowerCase()}`;
const socle = `${accroche}\n\n${classement}\n\n${mentionSource}.`;

const textes = {
  discord: `${socle}\n\nLa bêta Cards-Trading ouvre bientôt : <${lien}discord#beta>`,
  twitter: `${accroche}\n\n${classement}\n\n${lien}x\n\n#pokemontcg #cartespokemon`,
  instagram: `${socle}\n\nCards-Trading.com, la marketplace 100 % TCG\n\n${motsCles} #tcg #cartesacollectionner`,
  tiktok: `${socle}\n\nCards-Trading.com, la marketplace 100 % TCG\n\n${motsCles} #tcg #cartesacollectionner`,
};

if (SEC) {
  console.log('\n--- Discord ---\n' + textes.discord);
  console.log('\n--- X ---\n' + textes.twitter);
  console.log('\n--- Instagram ---\n' + textes.instagram);
  console.log('\n[dry-run] rien n’a été envoyé.');
  process.exit(0);
}

/*
  Archive le podium pour la newsletter du samedi.

  Sans ça, le classement calculé ici ne survit que le temps du run
  (.cote-cache.json est gitignore) — le samedi n'aurait rien à relire.
  Placé APRÈS le dry-run (on ne veut pas polluer l'historique d'un essai)
  et indépendamment du succès Discord/Buffer : le digest du samedi doit
  pouvoir afficher les tendances même si les réseaux sociaux ont eu un
  raté ce jeudi-là. Uniquement le marché EUR — 'op' (One Piece, dollars)
  est hors de ce que lit la newsletter.
*/
if (MARCHE !== 'op') {
  const FICHIER_PODIUMS = join(RACINE, 'data', 'cotes', 'podiums-hebdo.json');
  let historique = [];
  try {
    historique = JSON.parse(readFileSync(FICHIER_PODIUMS, 'utf8'));
    if (!Array.isArray(historique)) historique = [];
  } catch {
    /* Fichier absent au premier passage : on part d'un historique vide. */
  }
  historique.push({
    date: new Date().toISOString().slice(0, 10),
    marche: MARCHE,
    podium: donnees.podium,
  });
  mkdirSync(dirname(FICHIER_PODIUMS), { recursive: true });
  writeFileSync(FICHIER_PODIUMS, JSON.stringify(historique, null, 2) + '\n');
  console.log(`Podium archivé dans ${FICHIER_PODIUMS} (${historique.length} entrée(s) au total).`);
}

/* ── 4. Envoi ──────────────────────────────────────────── */

let partis = 0;
const echecs = [];

/* Discord : le salon Pokémon si le classement est pokémon, sinon le
   salon général. */
/* Le salon suit le TCG : un top One Piece dans le salon Pokemon serait
   hors sujet pour ses lecteurs. Repli sur le salon general si le salon
   dedie n'est pas configure. */
const webhook =
  (MARCHE === 'op' ? process.env.DISCORD_WEBHOOK_ONE_PIECE : process.env.DISCORD_WEBHOOK_POKEMON) ||
  process.env.DISCORD_WEBHOOK_DEFAUT;
if (webhook) {
  try {
    const r = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Cards-Trading', content: textes.discord }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    console.log('✅ Discord');
    partis++;
  } catch (e) {
    console.error(`❌ Discord : ${e.message}`);
    echecs.push('discord');
  }
} else {
  console.log('—  Discord : aucun webhook configuré, ignoré.');
}

const cle = process.env.BUFFER_API_KEY;
if (cle) {
  const graphql = async (requete, variables) => {
    const r = await fetch('https://api.buffer.com/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: requete, variables }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || j.errors) throw new Error(JSON.stringify(j?.errors || r.status));
    return j.data;
  };

  const d = await graphql('{ account { organizations { channels { id service isDisconnected } } } }');
  const canaux = {};
  for (const c of d.account.organizations[0].channels || []) {
    if (!c.isDisconnected) canaux[c.service] = c.id;
  }

  const envois = [
    ['twitter', textes.twitter, null, null],
    ['instagram', textes.instagram, urlVignette, { instagram: { type: 'post', shouldShareToFeed: true } }],
    ['tiktok', textes.tiktok, urlVignette, { tiktok: { title: court(accroche, 90) } }],
  ];

  for (const [service, texte, image, metadata] of envois) {
    if (!canaux[service]) { console.log(`—  ${service} : non connecté.`); continue; }
    try {
      const p = await graphql(
        'mutation ($input: CreatePostInput!) { createPost(input: $input) { id status dueAt } }',
        {
          input: {
            channelId: canaux[service],
            text: texte,
            assets: image ? [{ image: { url: image, metadata: { altText: `Top des hausses — ${titreMarche}` } } }] : [],
            mode: 'addToQueue',
            needsApproval: false,
            schedulingType: 'automatic',
            ...(metadata ? { metadata } : {}),
          },
        }
      );
      console.log(`✅ ${service} : ${p.createPost.status}${p.createPost.dueAt ? ' pour le ' + p.createPost.dueAt : ''}`);
      partis++;
    } catch (e) {
      console.error(`❌ ${service} : ${e.message}`);
      echecs.push(service);
    }
  }
} else {
  console.log('—  Buffer : BUFFER_API_KEY absente, ignoré.');
}

console.log(`\n${partis} publication(s) partie(s).`);
if (echecs.length) {
  console.error(`::error::Échec sur : ${echecs.join(', ')}`);
  process.exit(1);
}
