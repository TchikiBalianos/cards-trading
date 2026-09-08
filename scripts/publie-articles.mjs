/**
 * Publie automatiquement les articles de blog arrivés à échéance.
 *
 * POURQUOI CE SCRIPT EXISTE. La publication reposait sur une tâche
 * planifiée de l'app Claude Desktop, qui ne tourne que si l'app est
 * ouverte. Le 4 septembre 2026, la tâche `cards-trading-publie-op17-vendredi`
 * était armée pour 08h30 : l'app a démarré à 15h02, soit APRÈS les crons
 * d'annonce Discord (11h17) et Buffer (12h23). L'article OP-17 est resté
 * en brouillon, 404 en production, et le relais du vendredi a republié
 * l'article du mardi faute de nouveauté. Trois jours perdus, sans aucun
 * signal.
 *
 * GitHub Actions ne dépend d'aucun poste allumé. Ce script y est appelé
 * chaque matin, avant les crons d'annonce.
 *
 * CE QU'IL FAIT. Un article est publié quand il réunit trois conditions :
 *   1. il est sur `main` (donc déjà relu et fusionné à la main),
 *   2. il porte `draft: true`,
 *   3. sa `pubDate` est atteinte.
 *
 * La relecture reste donc humaine, comme avant. Ce script ne fait que
 * lever le drapeau au jour dit. Il ne touche à aucune branche `blog/*`.
 *
 * GARDE-FOUS. Un brouillon incomplet ne doit jamais passer en ligne :
 * le sommaire et la FAQ sont obligatoires sur ce blog (voir CLAUDE.md).
 * Un article qui en manque est REFUSÉ et signalé, pas publié.
 *
 *   node scripts/publie-articles.mjs              # publie ce qui est dû
 *   node scripts/publie-articles.mjs --controle   # n'écrit rien, rend compte
 *   node scripts/publie-articles.mjs --date=2026-09-10   # simule un autre jour
 *
 * Sortie : 0 si tout va bien, 1 si un article dû n'a pas pu être publié.
 */

import { writeFileSync, readdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lireArticle, defauts } from './lib/article.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = join(RACINE, 'src', 'content', 'blog');

const CONTROLE = process.argv.includes('--controle');
const argDate = process.argv.find((a) => a.startsWith('--date='));
const AUJOURDHUI = argDate ? argDate.slice(7) : new Date().toISOString().slice(0, 10);

const dus = [];
const refuses = [];
const programmes = [];

for (const fichier of readdirSync(DOSSIER).filter((f) => /\.mdx?$/.test(f))) {
  const chemin = join(DOSSIER, fichier);
  const article = lireArticle(chemin);
  if (!article) {
    refuses.push({ fichier, raisons: ['frontmatter illisible'] });
    continue;
  }
  if (article.champs.draft !== 'true') continue;

  const slug = fichier.replace(/\.mdx?$/, '');
  const entree = { fichier, chemin, slug, article, pubDate: article.champs.pubDate, titre: article.champs.title };

  if (!article.champs.pubDate) {
    refuses.push({ ...entree, raisons: ['pubDate absente'] });
  } else if (article.champs.pubDate > AUJOURDHUI) {
    programmes.push(entree);
  } else {
    const manque = defauts(article);
    if (manque.length) refuses.push({ ...entree, raisons: manque });
    else dus.push(entree);
  }
}

console.log(`Date de référence : ${AUJOURDHUI}${CONTROLE ? ' (contrôle, aucune écriture)' : ''}`);

for (const a of dus) {
  if (!CONTROLE) {
    const fm = a.article.frontmatter.replace(/^draft:\s*true\s*$/m, 'draft: false');
    if (fm === a.article.frontmatter) {
      console.log(`::error::${a.slug} : impossible de basculer draft dans le frontmatter.`);
      process.exitCode = 1;
      continue;
    }
    writeFileSync(a.chemin, `---\n${fm}\n---\n${a.article.corps}`);
  }
  console.log(`PUBLIE  ${a.slug}  (pubDate ${a.pubDate})  ${a.titre}`);
}

for (const a of refuses) {
  console.log(`::error::REFUSE  ${a.slug || a.fichier} : ${a.raisons.join(', ')}`);
  process.exitCode = 1;
}

for (const a of programmes.sort((x, y) => x.pubDate.localeCompare(y.pubDate))) {
  console.log(`attente ${a.slug}  (prévu le ${a.pubDate})  ${a.titre}`);
}

if (!dus.length && !refuses.length && !programmes.length) console.log('Aucun brouillon sur main.');
else if (!dus.length && !refuses.length) console.log('Rien à publier aujourd\'hui.');

// Consommé par le workflow : évite un commit vide quand rien n'a bougé.
if (process.env.GITHUB_OUTPUT) {
  const lignes = [
    `publies=${dus.length}`,
    `slugs=${dus.map((a) => a.slug).join(',')}`,
    // Remonté séparément : un brouillon refusé ne doit pas empêcher la
    // publication des articles valides du même jour. Le workflow laisse
    // donc passer cette étape, publie, puis échoue à la fin sur ce compteur.
    `refuses=${refuses.length}`,
  ];
  appendFileSync(process.env.GITHUB_OUTPUT, lignes.join('\n') + '\n');
}
