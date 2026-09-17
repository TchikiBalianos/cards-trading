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
 * DEUX NATURES DE BRANCHE, signalées toutes les deux :
 *   nouveau       un article qui n'existe pas encore sur `main` ;
 *   modification  une correction apportée à un article DÉJÀ en ligne.
 *
 * La seconde a longtemps été muette : le script se contentait de vérifier
 * que le fichier existait sur `main` et concluait « déjà intégré ». Une
 * correction d'article publié ne déclenchait donc aucune alerte, alors que
 * c'est précisément le cas où la production sert une information fausse en
 * attendant la fusion. Voir le commentaire de `articleDeLaBranche`.
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
import { lireArticle, defauts, points_de_vigilance, compterMots } from './lib/article.mjs';

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

  // `main` a-t-il touché cet article depuis que la branche s'en est séparée ?
  // Si oui, la branche n'est plus la version courante : soit elle a été
  // fusionnée (y compris en squash, qui réécrit les commits et rend tout test
  // d'ancestralité inopérant, `git rev-list origin/main..branche` comptant
  // alors des commits pourtant intégrés), soit elle a simplement pris du
  // retard. Dans les deux cas la signaler serait nuisible : elle enverrait
  // relire une version périmée, et le rappel quotidien repartirait chaque
  // matin pour des branches mortes. Or une alerte quotidienne systématique
  // cesse d'être lue au bout d'une semaine, soit le jour où elle compte.
  let mainAAvance;
  try {
    mainAAvance = Number(git('rev-list', '--count', `${ref}..origin/main`, '--', chemin)) > 0;
  } catch {
    // Dans le doute, on parle : ce script existe contre le silence.
    mainAAvance = false;
  }
  if (mainAAvance) return null;

  const contenu = git('show', `${ref}:${chemin}`);

  // Que vaut cette branche par rapport à `main` ?
  //   fichier absent de main         → article neuf, jamais publié ;
  //   présent mais contenu différent → retouche d'un article déjà en ligne ;
  //   présent et contenu identique   → travail déjà intégré (fusion écrasée
  //                                    par exemple), la branche n'est plus
  //                                    qu'un résidu et la signaler serait un
  //                                    faux positif.
  //
  // ⚠️ Comparer les CONTENUS, jamais la seule existence du fichier. C'est
  // ce test d'existence qui rendait invisible toute correction apportée à un
  // article DÉJÀ publié : le fichier étant sur `main`, la branche passait
  // pour un résidu. Constaté le 17 septembre 2026 sur
  // `blog/fix-30e-anniversaire-calendrier`, qui corrigeait un calendrier de
  // sortie faux sur un article en ligne depuis huit jours : le script
  // répondait « rien à signaler », et rien n'aurait prévenu Julian. Même
  // famille que les oublis de signalement qui ont justifié ce script.
  let versionMain;
  try {
    versionMain = git('show', `origin/main:${chemin}`);
  } catch {
    versionMain = null;
  }
  if (versionMain !== null && versionMain === contenu) return null;

  const tmp = join(process.env.RUNNER_TEMP || tmpdir(), `relecture-${slug}.md`);
  writeFileSync(tmp, contenu, 'utf8');
  const article = lireArticle(tmp);
  if (!article) return null;

  const dernier = git('log', '-1', '--format=%cI', ref);

  return {
    slug,
    chemin,
    nature: versionMain === null ? 'nouveau' : 'modification',
    branche: ref.replace(/^origin\//, ''),
    ageJours: Math.floor((Date.now() - new Date(dernier)) / 86400000),
    titre: article.champs.title || slug,
    description: article.champs.description || '',
    categorie: article.champs.category || 'sans catégorie',
    pubDate: article.champs.pubDate || 'absente',
    mots: compterMots(article),
    bloquants: defauts(article),
    vigilance: points_de_vigilance(article),
  };
}

function branchesEnAttente() {
  return git('branch', '-r', '--list', 'origin/blog/*')
    .split('\n')
    .map((b) => b.trim())
    .filter(Boolean)
    .map(articleDeLaBranche)
    .filter(Boolean);
}

const echapper = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const jours = (n) => (n === 0 ? "aujourd'hui" : `il y a ${n} jour${n > 1 ? 's' : ''}`);

/* Composition du message */

function carte(a) {
  // Un article neuf se juge sur sa capacité à être publié ; une retouche
  // d'article en ligne se juge sur le fait de n'avoir rien cassé. Deux
  // lectures différentes, donc deux verdicts différents.
  const verdict = a.bloquants.length
    ? `<span style="color:#ff8a7a;">Incomplet : ${echapper(a.bloquants.join(', '))}</span>`
    : a.nature === 'modification'
      ? `<span style="color:#3ddc84;">Structure toujours complète, la correction ne casse rien</span>`
      : `<span style="color:#3ddc84;">Structure complète, publiable en l'état</span>`;

  const etiquette =
    a.nature === 'modification'
      ? `<span style="color:#e0b341;">correction d'un article en ligne</span>`
      : 'nouvel article';

  const vigilance = a.vigilance.length
    ? `<tr><td style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:1.6; color:#e0b341; padding-top:8px;">À vérifier : ${echapper(a.vigilance.join(' · '))}</td></tr>`
    : '';

  const lien = `https://github.com/${DEPOT}/blob/${a.branche}/${a.chemin}`;
  const diff = `https://github.com/${DEPOT}/compare/main...${a.branche}`;

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#171d2b; border-radius:10px; margin-bottom:14px;" bgcolor="#171d2b">
      <tr><td style="padding:20px 22px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font-family:Arial,Helvetica,sans-serif; font-size:11px; font-weight:bold; letter-spacing:0.06em; text-transform:uppercase; color:#2997ff; padding-bottom:6px;">${echapper(a.categorie)} &nbsp;&middot;&nbsp; ${etiquette} &nbsp;&middot;&nbsp; ${jours(a.ageJours)} &nbsp;&middot;&nbsp; ${a.mots} mots</td></tr>
          <tr><td style="font-family:Arial,Helvetica,sans-serif; font-size:17px; line-height:1.35; font-weight:bold; color:#ffffff; padding-bottom:8px;">${echapper(a.titre)}</td></tr>
          <tr><td style="font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:1.55; color:#a9b4c7; padding-bottom:10px;">${echapper(a.description)}</td></tr>
          <tr><td style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:1.6;">${verdict}</td></tr>
          ${vigilance}
          <tr><td style="padding-top:14px;">
            <a href="${a.nature === 'modification' ? diff : lien}" style="font-family:Arial,Helvetica,sans-serif; font-size:13px; font-weight:bold; color:#2997ff; text-decoration:none;">${a.nature === 'modification' ? 'Voir la correction' : "Lire l'article"} &rarr;</a>
            &nbsp;&nbsp;
            <a href="${a.nature === 'modification' ? lien : diff}" style="font-family:Arial,Helvetica,sans-serif; font-size:13px; color:#7c879c; text-decoration:none;">${a.nature === 'modification' ? "lire l'article entier" : 'voir le diff'}</a>
          </td></tr>
        </table>
      </td></tr>
    </table>`;
}

function composerHtml(articles, immediat) {
  const intro = immediat
    ? articles[0].nature === 'modification'
      ? "Un article déjà en ligne vient d'être corrigé et attend ta relecture."
      : "Un nouvel article vient d'être rédigé et attend ta relecture."
    : `${articles.length} article${articles.length > 1 ? 's' : ''} attend${articles.length > 1 ? 'ent' : ''} depuis plus de ${SEUIL_JOURS} jours.`;

  // Le mode d'emploi de la publication programmée n'a de sens que pour un
  // article neuf. Une correction part en ligne au moment de la fusion, sans
  // draft ni pubDate à régler : lui servir la mauvaise consigne ferait
  // chercher un brouillon qui n'existe pas.
  const consignes = articles.some((a) => a.nature === 'nouveau')
    ? `<strong style="color:#ffffff;">Pour programmer la publication</strong><br>
              Fusionne l'article sur <span style="color:#2997ff;">main</span> en gardant <span style="color:#2997ff;">draft: true</span>, et mets la <span style="color:#2997ff;">pubDate</span> au jour voulu.
              Le workflow <span style="color:#2997ff;">publie-articles.yml</span> le met en ligne ce matin-là à 07h12, avant les crons d'annonce, et vérifie lui-même le 200 en production.`
    : `<strong style="color:#ffffff;">Pour mettre la correction en ligne</strong><br>
              Fusionne la branche sur <span style="color:#2997ff;">main</span> : l'article étant déjà publié, Vercel redéploie et la correction est servie sans attendre de cron.
              Tant que la fusion n'est pas faite, la production continue de servir l'ancienne version.`;

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

        <tr><td style="padding-top:10px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#101725; border-radius:10px;" bgcolor="#101725">
            <tr><td style="padding:18px 22px; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:1.7; color:#a9b4c7;">
              ${consignes}
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:18px 4px 0; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:1.5; color:#5c6a82;">
          Envoyé par alerte-relecture.mjs. Le rappel quotidien ne part que si une branche dépasse ${SEUIL_JOURS} jours, et s'arrête de lui-même une fois l'article fusionné.
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function composerTexte(articles) {
  return articles
    .map((a) => {
      const etiquette =
        a.nature === 'modification' ? "correction d'un article en ligne" : 'nouvel article';
      const lignes = [
        a.titre,
        `  ${a.categorie} | ${etiquette} | ${jours(a.ageJours)} | ${a.mots} mots | pubDate ${a.pubDate}`,
        `  ${a.description}`,
        a.bloquants.length
          ? `  INCOMPLET : ${a.bloquants.join(', ')}`
          : a.nature === 'modification'
            ? `  Structure toujours complète, la correction ne casse rien`
            : `  Structure complète, publiable en l'état`,
      ];
      if (a.vigilance.length) lignes.push(`  À vérifier : ${a.vigilance.join(' | ')}`);
      lignes.push(
        a.nature === 'modification'
          ? `  https://github.com/${DEPOT}/compare/main...${a.branche}`
          : `  https://github.com/${DEPOT}/blob/${a.branche}/${a.chemin}`
      );
      return lignes.join('\n');
    })
    .join('\n\n');
}

/* Exécution */

let articles;
if (BRANCHE) {
  const a = articleDeLaBranche(BRANCHE.startsWith('origin/') ? BRANCHE : `origin/${BRANCHE}`);
  articles = a ? [a] : [];
} else if (RAPPEL) {
  articles = branchesEnAttente().filter((a) => a.ageJours >= SEUIL_JOURS);
} else {
  console.error('Usage : --branche=blog/<slug> ou --rappel');
  process.exit(2);
}

if (!articles.length) {
  console.log(
    RAPPEL
      ? `Aucune branche en attente depuis plus de ${SEUIL_JOURS} jours.`
      : 'Rien à signaler sur cette branche (aucun article touché, ou contenu déjà identique à main).'
  );
  process.exit(0);
}

articles.sort((x, y) => y.ageJours - x.ageJours);

const sujet = BRANCHE
  ? `${articles[0].nature === 'modification' ? 'Correction à relire' : 'Article à relire'} : ${articles[0].titre}`
  : `${articles.length} article${articles.length > 1 ? 's' : ''} en attente de relecture`;

const html = composerHtml(articles, Boolean(BRANCHE));
const texte = composerTexte(articles);

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
