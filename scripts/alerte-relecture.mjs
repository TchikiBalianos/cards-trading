/**
 * Prévient par email qu'un article attend une relecture.
 *
 * POURQUOI. Les tâches de rédaction du mardi et du vendredi poussent leurs
 * brouillons sur une branche `blog/<slug>` et s'arrêtent là : ni relecture,
 * ni fusion. Rien ne signalait leur existence. Le 18 août 2026, un article
 * est resté six jours sur sa branche avant qu'un audit manuel ne le
 * retrouve. Les vérifications du mercredi et du samedi le voyaient, mais
 * deux fois par semaine seulement, et à condition que l'app soit ouverte.
 *
 * DEUX DÉCLENCHEMENTS, deux besoins différents :
 *   --branche=blog/<slug>   à chaque push, pour la réactivité ;
 *   --rappel                chaque matin, pour que rien ne s'enlise.
 *
 * Le rappel ne part que si une branche dépasse SEUIL_JOURS. Tant qu'aucune
 * ne traîne, aucun email : une alerte quotidienne systématique cesse d'être
 * lue au bout d'une semaine, et c'est exactement le jour où elle comptait.
 *
 *   node scripts/alerte-relecture.mjs --rappel --dry-run
 *   node scripts/alerte-relecture.mjs --branche=blog/mon-article --dry-run
 *
 * Sortie : 0 même sans rien à signaler, et 0 même si Resend refuse. Une
 * alerte qui échoue ne doit pas teindre en rouge le workflow qui la porte.
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lireArticle, defauts, points_de_vigilance, compterMots, listerPublies } from './lib/article.mjs';

/*
  Articles déjà publiés sur main, relevés UNE fois.

  Même base que publie-articles.mjs pour le contrôle de maillage : si
  les deux scripts jugeaient sur des listes différentes, l’alerte
  annoncerait « publiable » un article que la publication refuserait.
*/
const RACINE = join(fileURLToPath(new URL('..', import.meta.url)));
const PUBLIES = listerPublies(join(RACINE, 'src', 'content', 'blog'));

const DEPOT = 'TchikiBalianos/cards-trading';
const SEUIL_JOURS = 2;
const DESTINATAIRE = process.env.RELECTURE_DESTINATAIRE || 'julian.schmerkin@gmail.com';

const RAPPEL = process.argv.includes('--rappel');
const SEC = process.argv.includes('--dry-run');
const argBranche = process.argv.find((a) => a.startsWith('--branche='));
const BRANCHE = argBranche ? argBranche.slice(10) : null;

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** L'article porté par une branche, lu sans jamais la sortir dans l'arbre de travail. */
function articleDeLaBranche(ref) {
  let fichiers;
  try {
    fichiers = git('diff', '--name-only', `origin/main...${ref}`, '--', 'src/content/blog/')
      .split('\n')
      .filter((f) => /\.mdx?$/.test(f));
  } catch {
    return null;
  }
  if (!fichiers.length) return null;

  const chemin = fichiers[0];
  const slug = chemin.replace(/^.*\//, '').replace(/\.mdx?$/, '');

  // Déjà sur main ? Alors le travail est intégré et la branche n'est plus
  // qu'un résidu : la signaler « à relire » serait un faux positif.
  let surMain = true;
  try {
    git('cat-file', '-e', `origin/main:${chemin}`);
  } catch {
    surMain = false;
  }

  const tmp = join(process.env.RUNNER_TEMP || tmpdir(), `relecture-${slug}.md`);
  writeFileSync(tmp, git('show', `${ref}:${chemin}`), 'utf8');
  const article = lireArticle(tmp);
  if (!article) return null;

  const dernier = git('log', '-1', '--format=%cI', ref);

  return {
    slug,
    chemin,
    surMain,
    branche: ref.replace(/^origin\//, ''),
    ageJours: Math.floor((Date.now() - new Date(dernier)) / 86400000),
    titre: article.champs.title || slug,
    description: article.champs.description || '',
    categorie: article.champs.category || 'sans catégorie',
    pubDate: article.champs.pubDate || 'absente',
    mots: compterMots(article),
    bloquants: defauts(article, PUBLIES.filter((p) => p.slug !== slug)),
    vigilance: points_de_vigilance(article),
  };
}

function toutesLesBranches() {
  return git('branch', '-r', '--list', 'origin/blog/*')
    .split('\n')
    .map((b) => b.trim())
    .filter(Boolean);
}

function branchesEnAttente() {
  return toutesLesBranches().map(articleDeLaBranche).filter((a) => a && !a.surMain);
}

/**
 * Les articles DÉJÀ publiés que cette branche modifie, sans en créer de
 * nouveau. Cas distinct du brouillon : ce n'est pas une rédaction qui
 * attend d'être complétée puis fusionnée avec `draft: true` retiré, c'est
 * une correction sur un article déjà en ligne, qui attend juste d'être
 * fusionnée telle quelle. `defauts()` et `points_de_vigilance()` n'ont
 * ici aucun sens : un correctif n'a pas à satisfaire les critères d'un
 * brouillon neuf.
 *
 * Sans ce second cas, une branche de correction restait invisible : son
 * fichier touché existait déjà sur `main`, donc `surMain` était vrai, et
 * `branchesEnAttente` l'excluait — pas de doublon à craindre, mais pas
 * d'alerte non plus. Deux correctifs sont restés 3 et 18 jours sans
 * qu'aucun email ne parte (constaté le 20 septembre 2026 : une date
 * fausse sur l'article du 30e Anniversaire, en production tout ce temps).
 */
function correctifsDeLaBranche(ref) {
  let fichiers;
  try {
    fichiers = git('diff', '--name-only', `origin/main...${ref}`, '--', 'src/content/blog/')
      .split('\n')
      .filter((f) => /\.mdx?$/.test(f))
      .filter((f) => {
        try {
          git('cat-file', '-e', `origin/main:${f}`);
          return true;
        } catch {
          return false;
        }
      });
  } catch {
    return null;
  }
  if (!fichiers.length) return null;

  const dernier = git('log', '-1', '--format=%cI', ref);

  return {
    branche: ref.replace(/^origin\//, ''),
    ageJours: Math.floor((Date.now() - new Date(dernier)) / 86400000),
    fichiers: fichiers.map((chemin) => ({
      chemin,
      slug: chemin.replace(/^.*\//, '').replace(/\.mdx?$/, ''),
    })),
  };
}

function correctifsEnAttente() {
  return toutesLesBranches().map(correctifsDeLaBranche).filter(Boolean);
}

const echapper = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const jours = (n) => (n === 0 ? "aujourd'hui" : `il y a ${n} jour${n > 1 ? 's' : ''}`);

/* Composition du message */

function carte(a) {
  const verdict = a.bloquants.length
    ? `<span style="color:#ff8a7a;">Incomplet : ${echapper(a.bloquants.join(', '))}</span>`
    : `<span style="color:#3ddc84;">Structure complète, publiable en l'état</span>`;

  const vigilance = a.vigilance.length
    ? `<tr><td style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:1.6; color:#e0b341; padding-top:8px;">À vérifier : ${echapper(a.vigilance.join(' · '))}</td></tr>`
    : '';

  const lien = `https://github.com/${DEPOT}/blob/${a.branche}/${a.chemin}`;
  const diff = `https://github.com/${DEPOT}/compare/main...${a.branche}`;

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#171d2b; border-radius:10px; margin-bottom:14px;" bgcolor="#171d2b">
      <tr><td style="padding:20px 22px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font-family:Arial,Helvetica,sans-serif; font-size:11px; font-weight:bold; letter-spacing:0.06em; text-transform:uppercase; color:#2997ff; padding-bottom:6px;">${echapper(a.categorie)} &nbsp;&middot;&nbsp; ${jours(a.ageJours)} &nbsp;&middot;&nbsp; ${a.mots} mots</td></tr>
          <tr><td style="font-family:Arial,Helvetica,sans-serif; font-size:17px; line-height:1.35; font-weight:bold; color:#ffffff; padding-bottom:8px;">${echapper(a.titre)}</td></tr>
          <tr><td style="font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:1.55; color:#a9b4c7; padding-bottom:10px;">${echapper(a.description)}</td></tr>
          <tr><td style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:1.6;">${verdict}</td></tr>
          ${vigilance}
          <tr><td style="padding-top:14px;">
            <a href="${lien}" style="font-family:Arial,Helvetica,sans-serif; font-size:13px; font-weight:bold; color:#2997ff; text-decoration:none;">Lire l'article &rarr;</a>
            &nbsp;&nbsp;
            <a href="${diff}" style="font-family:Arial,Helvetica,sans-serif; font-size:13px; color:#7c879c; text-decoration:none;">voir le diff</a>
          </td></tr>
        </table>
      </td></tr>
    </table>`;
}

function carteCorrectif(c) {
  const diff = `https://github.com/${DEPOT}/compare/main...${c.branche}`;
  const liste = c.fichiers.map((f) => echapper(f.slug)).join(', ');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#171d2b; border-radius:10px; margin-bottom:14px;" bgcolor="#171d2b">
      <tr><td style="padding:20px 22px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font-family:Arial,Helvetica,sans-serif; font-size:11px; font-weight:bold; letter-spacing:0.06em; text-transform:uppercase; color:#e0b341; padding-bottom:6px;">Correctif &nbsp;&middot;&nbsp; ${jours(c.ageJours)}</td></tr>
          <tr><td style="font-family:Arial,Helvetica,sans-serif; font-size:17px; line-height:1.35; font-weight:bold; color:#ffffff; padding-bottom:8px;">${echapper(c.branche)}</td></tr>
          <tr><td style="font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:1.55; color:#a9b4c7; padding-bottom:10px;">Modifie ${c.fichiers.length > 1 ? 'des articles déjà publiés' : 'un article déjà publié'} : ${liste}.</td></tr>
          <tr><td style="padding-top:4px;">
            <a href="${diff}" style="font-family:Arial,Helvetica,sans-serif; font-size:13px; font-weight:bold; color:#2997ff; text-decoration:none;">Voir le diff &rarr;</a>
          </td></tr>
        </table>
      </td></tr>
    </table>`;
}

function composerHtml(articles, correctifs, immediat) {
  const morceaux = [];
  if (articles.length) {
    morceaux.push(
      immediat
        ? "Un nouvel article vient d'être rédigé et attend ta relecture."
        : `${articles.length} article${articles.length > 1 ? 's' : ''} attend${articles.length > 1 ? 'ent' : ''} depuis plus de ${SEUIL_JOURS} jours.`
    );
  }
  if (correctifs.length) {
    morceaux.push(
      immediat
        ? 'Une branche corrige un article déjà en ligne et attend sa fusion.'
        : `${correctifs.length} correctif${correctifs.length > 1 ? 's' : ''} sur des articles déjà en ligne attend${correctifs.length > 1 ? 'ent' : ''} depuis plus de ${SEUIL_JOURS} jours.`
    );
  }
  const intro = morceaux.join(' ');

  const sectionCorrectifs = correctifs.length
    ? `<tr><td style="padding-top:${articles.length ? '6px' : '0'};">${correctifs.map(carteCorrectif).join('')}</td></tr>`
    : '';

  const noteFusion = articles.length
    ? `<strong style="color:#ffffff;">Pour programmer la publication</strong><br>
       Fusionne l'article sur <span style="color:#2997ff;">main</span> en gardant <span style="color:#2997ff;">draft: true</span>, et mets la <span style="color:#2997ff;">pubDate</span> au jour voulu.
       Le workflow <span style="color:#2997ff;">publie-articles.yml</span> le met en ligne ce matin-là à 07h12, avant les crons d'annonce, et vérifie lui-même le 200 en production.`
    : `<strong style="color:#ffffff;">Pour appliquer un correctif</strong><br>
       Vérifie d'abord le diff : si la branche retire un élément présent sur <span style="color:#2997ff;">main</span> (sommaire, vignette, section ajoutée depuis), c'est elle qui est périmée, pas l'inverse, et il faut la supprimer plutôt que la fusionner. Sinon, fusionne-la sur <span style="color:#2997ff;">main</span> pour répercuter le changement au prochain déploiement.`;

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0; padding:0; background-color:#0a0e17;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0e17" style="background-color:#0a0e17;">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

        <tr><td style="font-family:Arial,Helvetica,sans-serif; font-size:13px; font-weight:bold; letter-spacing:0.08em; text-transform:uppercase; color:#6b93c4; padding-bottom:6px;">Cards-Trading &nbsp;&middot;&nbsp; relecture</td></tr>
        <tr><td style="font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:1.6; color:#e6ebf5; padding-bottom:20px;">${echapper(intro)}</td></tr>

        <tr><td>${articles.map(carte).join('')}</td></tr>
        ${sectionCorrectifs}

        <tr><td style="padding-top:10px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#101725; border-radius:10px;" bgcolor="#101725">
            <tr><td style="padding:18px 22px; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:1.7; color:#a9b4c7;">
              ${noteFusion}
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:18px 4px 0; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:1.5; color:#5c6a82;">
          Envoyé par alerte-relecture.mjs. Le rappel quotidien ne part que si une branche dépasse ${SEUIL_JOURS} jours, et s'arrête de lui-même une fois la branche fusionnée.
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function composerTexte(articles, correctifs) {
  const blocsArticles = articles.map((a) => {
    const lignes = [
      a.titre,
      `  ${a.categorie} | ${jours(a.ageJours)} | ${a.mots} mots | pubDate ${a.pubDate}`,
      `  ${a.description}`,
      a.bloquants.length
        ? `  INCOMPLET : ${a.bloquants.join(', ')}`
        : `  Structure complète, publiable en l'état`,
    ];
    if (a.vigilance.length) lignes.push(`  À vérifier : ${a.vigilance.join(' | ')}`);
    lignes.push(`  https://github.com/${DEPOT}/blob/${a.branche}/${a.chemin}`);
    return lignes.join('\n');
  });

  const blocsCorrectifs = correctifs.map((c) => {
    const lignes = [
      `[correctif] ${c.branche}`,
      `  ${jours(c.ageJours)} | modifie : ${c.fichiers.map((f) => f.slug).join(', ')}`,
      `  https://github.com/${DEPOT}/compare/main...${c.branche}`,
    ];
    return lignes.join('\n');
  });

  return [...blocsArticles, ...blocsCorrectifs].join('\n\n');
}

/* Exécution */

let articles;
let correctifs;
if (BRANCHE) {
  const ref = BRANCHE.startsWith('origin/') ? BRANCHE : `origin/${BRANCHE}`;
  const a = articleDeLaBranche(ref);
  articles = a && !a.surMain ? [a] : [];
  const c = correctifsDeLaBranche(ref);
  correctifs = c ? [c] : [];
} else if (RAPPEL) {
  articles = branchesEnAttente().filter((a) => a.ageJours >= SEUIL_JOURS);
  correctifs = correctifsEnAttente().filter((c) => c.ageJours >= SEUIL_JOURS);
} else {
  console.error('Usage : --branche=blog/<slug> ou --rappel');
  process.exit(2);
}

if (!articles.length && !correctifs.length) {
  console.log(
    RAPPEL
      ? `Aucune branche en attente depuis plus de ${SEUIL_JOURS} jours.`
      : 'Rien à signaler sur cette branche (déjà sur main, ou aucun article/correctif dessus).'
  );
  process.exit(0);
}

articles.sort((x, y) => y.ageJours - x.ageJours);
correctifs.sort((x, y) => y.ageJours - x.ageJours);

const sujet = BRANCHE
  ? articles.length
    ? `Article à relire : ${articles[0].titre}`
    : `Correctif à fusionner : ${correctifs[0].branche}`
  : `${articles.length + correctifs.length} branche${articles.length + correctifs.length > 1 ? 's' : ''} en attente${articles.length && correctifs.length ? ' (relecture + correctifs)' : ''}`;

const html = composerHtml(articles, correctifs, Boolean(BRANCHE));
const texte = composerTexte(articles, correctifs);

console.log(`Sujet : ${sujet}\n`);
console.log(texte);

if (SEC) {
  if (process.env.DUMP_HTML) {
    writeFileSync(process.env.DUMP_HTML, html);
    console.log(`\n[dry-run] HTML écrit dans ${process.env.DUMP_HTML}`);
  }
  console.log('\n[dry-run] aucun email envoyé.');
  process.exit(0);
}

if (!process.env.RESEND_API_KEY) {
  console.log('::warning::RESEND_API_KEY absente, aucun email envoyé.');
  process.exit(0);
}

const reponse = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from: 'Cards Trading <contact@cards-trading.com>',
    to: [DESTINATAIRE],
    subject: sujet,
    html,
    text: texte,
  }),
});

const corps = await reponse.json().catch(() => ({}));
if (!reponse.ok) {
  // Volontairement non bloquant : une alerte manquée ne doit pas faire
  // échouer le workflow qui la porte, mais elle doit rester visible.
  console.log(`::warning::Resend a répondu ${reponse.status} : ${JSON.stringify(corps)}`);
  process.exit(0);
}

console.log(`Email envoyé à ${DESTINATAIRE} (id ${corps.id}).`);
