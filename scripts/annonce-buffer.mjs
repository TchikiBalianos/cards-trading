/**
 * Relaie les nouveaux articles de blog vers Buffer (X, Instagram, TikTok).
 *
 * Pendant Discord de `annonce-discord.mjs`, avec le même principe : au plus
 * UN article par exécution, rien si aucune nouveauté, et un état committé
 * pour ne jamais poster deux fois.
 *
 * État SÉPARÉ de celui de Discord (`etat-annonces-buffer.json`) : les deux
 * canaux ont leur propre cadence et leurs propres pannes. Un échec Buffer
 * ne doit pas rejouer une annonce Discord déjà partie, ni l'inverse.
 *
 * Le MCP Buffer n'est pas utilisable ici : il est authentifié par la session
 * Claude. On passe donc par l'API GraphQL avec une clé personnelle
 * (plan gratuit : 1 clé, créée sur publish.buffer.com/settings/api).
 *
 *   node scripts/annonce-buffer.mjs            # met en file
 *   node scripts/annonce-buffer.mjs --dry-run  # affiche sans rien envoyer
 *   node scripts/annonce-buffer.mjs --draft    # crée des brouillons
 *
 * Variable requise : BUFFER_API_KEY
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER_BLOG = join(RACINE, 'src', 'content', 'blog');
const FICHIER_ETAT = join(RACINE, '.github', 'etat-annonces-buffer.json');
const SITE = 'https://cards-trading.com';
const API = 'https://api.buffer.com/graphql';

const SEC = process.argv.includes('--dry-run');
const BROUILLON = process.argv.includes('--draft');

const ETIQUETTES = {
  pokemon: 'Pokémon', magic: 'Magic', 'one-piece': 'One Piece',
  yugioh: 'Yu-Gi-Oh!', lorcana: 'Lorcana', 'dragon-ball': 'Dragon Ball',
  'star-wars': 'Star Wars', guide: 'Guide', actualite: 'Actualité',
  strategie: 'Stratégie',
};

/* Mots-clés par TCG. Volontairement courts et spécifiques : une liste
   générique dilue la portée au lieu de l'étendre. */
const MOTSCLES = {
  pokemon: '#pokemontcg #pokemon #cartespokemon',
  'one-piece': '#onepiececardgame #opcg #onepiece',
  magic: '#magicthegathering #mtg #mtgfr',
  yugioh: '#yugioh #ygo #cartesyugioh',
  lorcana: '#disneylorcana #lorcana',
  'dragon-ball': '#dragonballsuper #dbsfw #dragonball',
  'star-wars': '#starwarsunlimited #swu',
};
const COMMUNS = '#tcg #cartesacollectionner #cardstrading';

function lireFrontmatter(chemin) {
  const m = readFileSync(chemin, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const champs = {};
  for (const ligne of m[1].split(/\r?\n/)) {
    const p = ligne.match(/^([a-zA-Z]+):\s*(.*)$/);
    if (p) champs[p[1]] = p[2].trim().replace(/^["']|["']$/g, '');
  }
  return champs;
}

function chargerEtat() {
  if (!existsSync(FICHIER_ETAT)) return { annonces: [] };
  try {
    const e = JSON.parse(readFileSync(FICHIER_ETAT, 'utf8'));
    return Array.isArray(e.annonces) ? e : { annonces: [] };
  } catch {
    console.warn('⚠️  État illisible, réinitialisé.');
    return { annonces: [] };
  }
}

function articlesPublies() {
  return readdirSync(DOSSIER_BLOG)
    .filter((f) => /\.mdx?$/.test(f))
    .map((f) => ({ slug: f.replace(/\.mdx?$/, ''), fm: lireFrontmatter(join(DOSSIER_BLOG, f)) }))
    .filter((a) => a.fm && a.fm.draft !== 'true' && a.fm.title)
    .filter((a) => new Date(a.fm.pubDate) <= new Date())
    .sort((a, b) => new Date(a.fm.pubDate) - new Date(b.fm.pubDate));
}

async function graphql(requete, variables) {
  const cle = process.env.BUFFER_API_KEY;
  if (!cle) {
    console.error('::error::BUFFER_API_KEY absente.');
    console.error('À créer sur publish.buffer.com/settings/api, puis en secret Actions.');
    process.exit(1);
  }
  const rep = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: requete, variables }),
  });
  const j = await rep.json().catch(() => null);
  if (!rep.ok || !j || j.errors) {
    throw new Error(`Buffer a répondu ${rep.status} — ${JSON.stringify(j?.errors || j)}`);
  }
  return j.data;
}

/*
  Canaux résolus À L'EXÉCUTION plutôt que codés en dur : reconnecter un
  compte dans Buffer lui donne un nouvel identifiant, ce qui casserait
  silencieusement un identifiant figé dans le dépôt.
*/
async function canaux() {
  const d = await graphql(`{ account { organizations { id channels { id service isDisconnected } } } }`);
  const org = d.account.organizations[0];
  const par = {};
  for (const c of org.channels || []) {
    if (!c.isDisconnected) par[c.service] = c.id;
  }
  return par;
}

/* X compte tout lien pour 23 caractères, quelle que soit sa longueur. */
function texteX(fm, url) {
  const LIEN = 23;
  const reste = 280 - LIEN - 4;
  let tete = fm.title;
  if (tete.length > reste) tete = tete.slice(0, reste - 1).trimEnd() + '…';
  return `${tete}\n\n${url}`;
}

function texteInstagram(fm, categorie) {
  const cles = [MOTSCLES[fm.category], COMMUNS].filter(Boolean).join(' ');
  return (
    `${fm.title}\n\n${fm.description || ''}\n\n` +
    `L'article complet est sur le blog — lien en bio 🔗\n\n—\n` +
    `Cards-Trading, la marketplace 100 % TCG : scannez votre carte, elle est ` +
    `en vente. Le paiement reste bloqué jusqu'à réception.\n\n${cles}`
  );
}

function texteTikTok(fm) {
  const cles = [MOTSCLES[fm.category], '#tcg'].filter(Boolean).join(' ');
  let t = fm.description || fm.title;
  if (t.length > 150) t = t.slice(0, 149).trimEnd() + '…';
  return `${t} — cards-trading.com ${cles}`;
}

async function publier(canalId, texte, vignette, metadata) {
  const input = {
    channelId: canalId,
    text: texte,
    assets: vignette
      ? [{ image: { url: vignette, metadata: { altText: 'Vignette de l’article Cards-Trading' } } }]
      : [],
    mode: 'addToQueue',
    needsApproval: false,
    schedulingType: 'automatic',
    ...(BROUILLON ? { saveToDraft: true } : {}),
    ...(metadata ? { metadata } : {}),
  };
  const d = await graphql(
    `mutation ($input: CreatePostInput!) { createPost(input: $input) { id status dueAt } }`,
    { input }
  );
  return d.createPost;
}

/* ── Exécution ─────────────────────────────────────────── */

const etat = chargerEtat();
const attente = articlesPublies().filter((a) => !etat.annonces.includes(a.slug));

if (attente.length === 0) {
  console.log('Rien de neuf à relayer.');
  process.exit(0);
}

const article = attente[0];
const { slug, fm } = article;
const url = `${SITE}/blog/${slug}/?utm_source=`;
const vignette = `${SITE}/assets/social/${slug}.png`;
const categorie = ETIQUETTES[fm.category] || fm.category || 'Article';

console.log(`${attente.length} article(s) en attente — on relaie « ${fm.title} ».`);

if (SEC) {
  console.log('\n[dry-run] X :\n' + texteX(fm, url + 'x'));
  console.log('\n[dry-run] Instagram :\n' + texteInstagram(fm, categorie));
  console.log('\n[dry-run] TikTok :\n' + texteTikTok(fm));
  console.log('\n[dry-run] vignette : ' + vignette);
  process.exit(0);
}

const dispo = await canaux();
const envois = [
  ['twitter', () => publier(dispo.twitter, texteX(fm, url + 'x'), null, null)],
  ['instagram', () => publier(dispo.instagram, texteInstagram(fm, categorie), vignette,
      { instagram: { type: 'post', shouldShareToFeed: true } })],
  ['tiktok', () => publier(dispo.tiktok, texteTikTok(fm), vignette,
      { tiktok: { title: fm.title.slice(0, 90) } })],
];

let reussites = 0;
const echecs = [];

for (const [service, envoyer] of envois) {
  if (!dispo[service]) { console.log(`—  ${service} : non connecté, ignoré.`); continue; }
  try {
    const p = await envoyer();
    console.log(`✅ ${service} : ${p.status}${p.dueAt ? ' pour le ' + p.dueAt : ''}`);
    reussites++;
  } catch (e) {
    /* Un réseau en échec ne doit pas empêcher les autres de partir. */
    console.error(`❌ ${service} : ${e.message}`);
    echecs.push(service);
  }
}

/*
  L'article n'est marqué annoncé QUE si au moins un réseau a reçu le post.
  Sinon on le laisse en attente pour la prochaine exécution — sans quoi une
  panne Buffer ferait disparaître l'article de la file, définitivement.
*/
if (reussites > 0) {
  etat.annonces.push(slug);
  writeFileSync(FICHIER_ETAT, JSON.stringify(etat, null, 2) + '\n');
  console.log(`État mis à jour (${etat.annonces.length} article(s) relayé(s)).`);
}

if (echecs.length) {
  console.error(`::error::Échec sur : ${echecs.join(', ')}`);
  process.exit(1);
}
