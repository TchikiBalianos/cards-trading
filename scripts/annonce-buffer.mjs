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

/*
  Mots-clés par TCG, du plus spécifique au plus large.

  Les recommandations 2026 convergent : 1 à 2 sur X (au-delà de 3
  l'engagement chute), 3 à 5 sur Instagram et TikTok. La précision compte
  plus que le volume — les bons 4 battent les mauvais 25, et les
  génériques (#fyp, #pourtoi) n'apportent rien de mesurable.

  On pioche donc dans cette liste ordonnée selon le réseau, au lieu de
  déverser la même grappe partout.
*/
const MOTSCLES = {
  pokemon: ['#pokemontcg', '#cartespokemon'],
  'one-piece': ['#onepiececardgame', '#opcg'],
  magic: ['#magicthegathering', '#mtgfr'],
  yugioh: ['#yugioh', '#cartesyugioh'],
  lorcana: ['#disneylorcana', '#lorcana'],
  'dragon-ball': ['#DragonBall', '#FusionWorld', '#TCG'],
  'star-wars': ['#starwarsunlimited', '#swu'],
};
const COMMUNS = ['#tcg', '#cartesacollectionner'];

/*
  Une licence peut porter sa grappe complète, arrêtée à la main : on ne lui
  ajoute alors PAS les communs, sinon le 4e slot d'Instagram réintroduit un
  mot-clé écarté. Dragon Ball est dans ce cas depuis le 22 août 2026, sur
  demande : #DragonBall #FusionWorld #TCG, et rien d'autre.
*/
const GRAPPE_FERMEE = new Set(['dragon-ball']);

/* Signature courte. Ne PAS y parler de scan : la promesse produit se joue
   sur la landing, pas dans une légende. */
const SIGNATURE = 'Cards-Trading.com, la marketplace 100 % TCG';

function motsCles(categorie, combien) {
  const propres = MOTSCLES[categorie] || [];
  const liste = GRAPPE_FERMEE.has(categorie) ? propres : [...propres, ...COMMUNS];
  return liste.slice(0, combien).join(' ');
}

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
  /*
    La liste passe par la requête RACINE `channels`, et non par
    `account.organizations[].channels` : ce chemin-là répond FORBIDDEN à une
    clé personnelle. Vérifié le 27 août 2026 sur une clé neuve portant les
    9 permissions disponibles, donc ce n'est pas une question de périmètre.
    Les deux renvoient les mêmes champs.
  */
  const d = await graphql(`{ account { organizations { id } } }`);
  const org = d.account.organizations[0];
  const liste = await graphql(
    `query ($input: ChannelsInput!) { channels(input: $input) { id service isDisconnected } }`,
    { input: { organizationId: org.id } },
  );
  const par = {};
  for (const c of liste.channels || []) {
    if (!c.isDisconnected) par[c.service] = c.id;
  }
  return par;
}

/* X compte tout lien pour 23 caractères, quelle que soit sa longueur.
   2 mots-clés : un post qui en porte 1 ou 2 devance nettement un post
   qui n'en porte aucun, mais 3 font chuter l'engagement. */
function texteX(fm, url) {
  const cles = motsCles(fm.category, 2);
  const LIEN = 23;
  const reste = 280 - LIEN - cles.length - 6;
  let tete = fm.title;
  if (tete.length > reste) tete = tete.slice(0, reste - 1).trimEnd() + '…';
  return `${tete}\n\n${url}\n\n${cles}`;
}

/* Légende resserrée : le titre, le chapô, l'appel, la signature. Rien de
   plus — une légende à rallonge se fait couper par « ... plus » et le
   lecteur ne déplie pas. */
function texteInstagram(fm) {
  return (
    `${fm.title}\n\n${fm.description || ''}\n\n` +
    `L'article complet est sur notre blog, lien du site en bio 🔗\n\n` +
    `${SIGNATURE}\n\n${motsCles(fm.category, 4)}`
  );
}

/* TikTok accepte 2200 caractères de description. Le budget se calcule sur
   le texte complet, signature et mots-clés compris, et seule la description
   est rognée. La borne à 130 d'avant coupait en plein milieu d'une
   phrase dès que le chapô dépassait deux lignes. */
function texteTikTok(fm) {
  const suffixe = `\n\n${SIGNATURE}\n\n${motsCles(fm.category, 4)}`;
  const reste = 2200 - suffixe.length;
  let t = fm.description || fm.title;
  if (t.length > reste) t = t.slice(0, reste - 1).trimEnd() + '…';
  return `${t}${suffixe}`;
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
    `mutation ($input: CreatePostInput!) {
       createPost(input: $input) {
         __typename
         ... on PostActionSuccess { post { id status dueAt } }
         ... on RestProxyError { message code }
         ... on InvalidInputError { message }
         ... on LimitReachedError { message }
         ... on UnauthorizedError { message }
         ... on NotFoundError { message }
         ... on UnexpectedError { message }
       }
     }`,
    { input }
  );
  /*
    Depuis août 2026, createPost renvoie une UNION : un refus du réseau
    arrive en donnée valide, pas dans `errors`. Sans ce contrôle, un post
    rejeté passerait pour un succès et sortirait de la file.
  */
  const r = d.createPost;
  if (r.__typename !== 'PostActionSuccess') {
    throw new Error(`${r.__typename}${r.code ? " " + r.code : ""} : ${r.message}`);
  }
  return r.post;
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

console.log(`${attente.length} article(s) en attente — on relaie « ${fm.title} ».`);

if (SEC) {
  console.log('\n[dry-run] X :\n' + texteX(fm, url + 'x'));
  console.log('\n[dry-run] Instagram :\n' + texteInstagram(fm));
  console.log('\n[dry-run] TikTok :\n' + texteTikTok(fm));
  console.log('\n[dry-run] vignette : ' + vignette);
  process.exit(0);
}

const dispo = await canaux();
const envois = [
  ['twitter', () => publier(dispo.twitter, texteX(fm, url + 'x'), null, null)],
  ['instagram', () => publier(dispo.instagram, texteInstagram(fm), vignette,
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
  Un brouillon ne compte pas non plus : rien n'est parti, l'article doit
  rester en file pour le prochain relais réel.
*/
if (reussites > 0 && !BROUILLON) {
  etat.annonces.push(slug);
  writeFileSync(FICHIER_ETAT, JSON.stringify(etat, null, 2) + '\n');
  console.log(`État mis à jour (${etat.annonces.length} article(s) relayé(s)).`);
}

if (echecs.length) {
  console.error(`::error::Échec sur : ${echecs.join(', ')}`);
  process.exit(1);
}
