/**
 * Annonce sur Discord les nouveaux articles de blog.
 *
 * Poste AU PLUS UN article par exécution : mieux vaut étaler que noyer le
 * salon. Les articles déjà annoncés sont mémorisés dans
 * .github/etat-annonces-discord.json, committé par le workflow — c'est
 * volontairement lisible et auditable : on voit d'un coup d'œil ce qui est
 * parti.
 *
 * Chaque annonce porte un lien waitlist taggé `utm_source=discord`, sans
 * quoi on ne saurait pas si le canal convertit. Voir la colonne `source`
 * de beta_submissions.
 *
 *   node scripts/annonce-discord.mjs            # poste pour de vrai
 *   node scripts/annonce-discord.mjs --dry-run  # affiche sans poster
 *
 * Variable requise (hors dry-run) : DISCORD_WEBHOOK_URL
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RACINE = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DOSSIER_BLOG = join(RACINE, 'src', 'content', 'blog');
const FICHIER_ETAT = join(RACINE, '.github', 'etat-annonces-discord.json');
const SITE = 'https://cards-trading.com';
const SEC = process.argv.includes('--dry-run');

/* Couleur d'accent par TCG — repère visuel immédiat dans le salon. */
const COULEURS = {
  pokemon: 0xffcb05,
  magic: 0xd85c34,
  'one-piece': 0xd42a2a,
  yugioh: 0x8b5cf6,
  lorcana: 0x1e88e5,
  'dragon-ball': 0xf57c00,
  'star-wars': 0x4a5568,
  guide: 0x2997ff,
  actualite: 0x2997ff,
  strategie: 0x2997ff,
};

const ETIQUETTES = {
  pokemon: 'Pokémon',
  magic: 'Magic',
  'one-piece': 'One Piece',
  yugioh: 'Yu-Gi-Oh!',
  lorcana: 'Lorcana',
  'dragon-ball': 'Dragon Ball',
  'star-wars': 'Star Wars',
  guide: 'Guide',
  actualite: 'Actualité',
  strategie: 'Stratégie',
};

/*
  Frontmatter lu à la main plutôt qu'avec un parseur YAML : le schéma est
  fixe (voir src/content.config.ts) et une dépendance de plus sur un
  workflow qui tourne sans surveillance, c'est une panne de plus possible.
*/
function lireFrontmatter(chemin) {
  const brut = readFileSync(chemin, 'utf8');
  const m = brut.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;

  const champs = {};
  for (const ligne of m[1].split(/\r?\n/)) {
    const paire = ligne.match(/^([a-zA-Z]+):\s*(.*)$/);
    if (!paire) continue;
    let valeur = paire[2].trim().replace(/^["']|["']$/g, '');
    champs[paire[1]] = valeur;
  }
  return champs;
}

function chargerEtat() {
  if (!existsSync(FICHIER_ETAT)) return { annonces: [] };
  try {
    const etat = JSON.parse(readFileSync(FICHIER_ETAT, 'utf8'));
    return Array.isArray(etat.annonces) ? etat : { annonces: [] };
  } catch {
    /* Fichier illisible : on repart de zéro plutôt que de planter, quitte
       à réannoncer. Un doublon vaut mieux qu'un workflow cassé. */
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

async function poster(article) {
  const { slug, fm } = article;
  const url = `${SITE}/blog/${slug}/`;
  const categorie = ETIQUETTES[fm.category] || fm.category || 'Article';

  const charge = {
    username: 'Cards-Trading',
    embeds: [
      {
        title: fm.title,
        description: fm.description || '',
        url,
        color: COULEURS[fm.category] ?? 0x2997ff,
        footer: { text: `${categorie} · cards-trading.com` },
        timestamp: new Date(fm.pubDate).toISOString(),
      },
    ],
    content:
      `📰 **Nouvel article** — ${categorie}\n${url}\n\n` +
      `Vous voulez acheter et vendre vos cartes en quelques secondes, ` +
      `paiement bloqué jusqu'à réception ? La bêta ouvre bientôt : ` +
      `<${SITE}/?utm_source=discord#beta>`,
  };

  if (SEC) {
    console.log('[dry-run] aurait posté :\n' + JSON.stringify(charge, null, 2));
    return true;
  }

  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) {
    console.error('::error::DISCORD_WEBHOOK_URL absent.');
    console.error('À créer dans Settings → Secrets and variables → Actions.');
    process.exit(1);
  }

  const rep = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(charge),
  });

  if (!rep.ok) {
    console.error(`::error::Discord a répondu ${rep.status} — ${await rep.text()}`);
    return false;
  }
  console.log(`✅ Annoncé : ${fm.title}`);
  return true;
}

/* ── Exécution ─────────────────────────────────────────── */

const etat = chargerEtat();
const candidats = articlesPublies().filter((a) => !etat.annonces.includes(a.slug));

if (candidats.length === 0) {
  console.log('Rien de neuf à annoncer.');
  process.exit(0);
}

/* Le plus ancien non annoncé : on rattrape dans l'ordre chronologique
   plutôt que de sauter des articles. */
const article = candidats[0];
console.log(`${candidats.length} article(s) en attente, on poste le plus ancien.`);

if (await poster(article)) {
  if (!SEC) {
    etat.annonces.push(article.slug);
    writeFileSync(FICHIER_ETAT, JSON.stringify(etat, null, 2) + '\n');
    console.log(`État mis à jour (${etat.annonces.length} annonce(s) au total).`);
  }
} else {
  process.exit(1);
}
