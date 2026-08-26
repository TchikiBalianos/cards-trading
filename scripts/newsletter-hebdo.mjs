/**
 * Compose le digest hebdomadaire et crée un BROUILLON Resend Broadcast.
 *
 * N'envoie jamais rien tout seul. C'est la différence assumée avec
 * Discord/Buffer : un post social raté se supprime, un email déjà
 * délivré ne se rattrape pas. Julian relit dans le dashboard Resend et
 * clique envoyer lui-même.
 *
 * Contenu : les articles publiés dans les 7 derniers jours (frontmatter,
 * aucune rédaction supplémentaire) + le podium de prix le plus récent
 * archivé par cote-hebdo (déjà recoupé contre TCGplayer à ce stade, voir
 * scripts/cote-hebdo.mjs). L'un des deux peut manquer sans faire échouer
 * le script — seule l'absence des DEUX annule la création du brouillon.
 *
 * Le SDK `resend` installé (3.5.0) ne sait pas créer de broadcasts —
 * vérifié le 26 août 2026, aucune trace de l'API dans le paquet. Plutôt
 * que de mettre à niveau une dépendance partagée avec la chaîne
 * d'inscription (api/submit-form.js, api/keep-alive.js), ce script parle
 * directement à l'API REST de Resend pour tout ce qui touche aux
 * broadcasts — même principe que le GraphQL fait main pour Buffer dans
 * annonce-buffer.mjs. Le SDK reste utilisé pour le seul email de
 * notification, un envoi transactionnel classique.
 *
 *   node scripts/newsletter-hebdo.mjs            # crée le brouillon
 *   node scripts/newsletter-hebdo.mjs --dry-run  # affiche sans rien créer
 *
 * Variables requises : RESEND_API_KEY. Optionnelle : RESEND_SEGMENT_ID
 * (sinon résolu à l'exécution, comme dans api/submit-form.js).
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resend } from 'resend';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER_BLOG = join(RACINE, 'src', 'content', 'blog');
const FICHIER_PODIUMS = join(RACINE, 'data', 'cotes', 'podiums-hebdo.json');
const SITE = 'https://cards-trading.com';
const API_RESEND = 'https://api.resend.com';
const SEPT_JOURS_MS = 7 * 24 * 60 * 60 * 1000;

const SEC = process.argv.includes('--dry-run');

const CATEGORY_LABELS = {
  pokemon: 'Pokemon', magic: 'Magic', 'one-piece': 'One Piece',
  yugioh: 'Yu-Gi-Oh!', lorcana: 'Lorcana', 'dragon-ball': 'Dragon Ball',
  'star-wars': 'Star Wars', guide: 'Guide', actualite: 'Actualite',
  strategie: 'Strategie',
};

function echapper(t) {
  return String(t ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ── 1. Articles de la semaine ─────────────────────────── */

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

function articlesDeLaSemaine() {
  const maintenant = Date.now();
  return readdirSync(DOSSIER_BLOG)
    .filter((f) => /\.mdx?$/.test(f))
    .map((f) => ({ slug: f.replace(/\.mdx?$/, ''), fm: lireFrontmatter(join(DOSSIER_BLOG, f)) }))
    .filter((a) => a.fm && a.fm.draft !== 'true' && a.fm.title)
    .filter((a) => {
      const pub = new Date(a.fm.pubDate).getTime();
      return pub <= maintenant && maintenant - pub <= SEPT_JOURS_MS;
    })
    .sort((a, b) => new Date(a.fm.pubDate) - new Date(b.fm.pubDate));
}

/* ── 2. Podium de la semaine ───────────────────────────── */

function podiumDeLaSemaine() {
  if (!existsSync(FICHIER_PODIUMS)) return null;
  let historique;
  try {
    historique = JSON.parse(readFileSync(FICHIER_PODIUMS, 'utf8'));
  } catch {
    return null;
  }
  if (!Array.isArray(historique) || historique.length === 0) return null;
  const dernier = historique[historique.length - 1];
  const ageJours = (Date.now() - new Date(dernier.date).getTime()) / 86400000;
  /* Plus vieux qu'une semaine : cote-hebdo a probablement raté son
     passage. Mieux vaut omettre la section que republier une donnée
     périmée sous une étiquette « de la semaine ». */
  if (ageJours > 7) return null;
  return dernier;
}

const euros = (n) => n.toFixed(2).replace('.', ',') + ' €';

/* Toujours la plage complète (« du X au Y »), jamais la seule date de
   début isolée : un objet d'email affichant juste « semaine du 19 août »
   un 26 août se lit comme si le message datait du 19, alors qu'il couvre
   la semaine ENTIÈRE jusqu'à aujourd'hui. Calculée une seule fois et
   partagée entre l'objet et le corps pour qu'ils ne puissent pas
   diverger. */
function periodeSemaine() {
  const debut = new Date(Date.now() - SEPT_JOURS_MS);
  const fin = new Date();
  return `${debut.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} au ${fin.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
}

/* ── 3. Composition HTML ───────────────────────────────
   Table-based, styles inline : contrainte de compatibilité email
   (Outlook notamment), pas de <style> ni de mise en page en <div>. */

function ligneArticle(a) {
  const cat = CATEGORY_LABELS[a.fm.category] || a.fm.category;
  const image = `${SITE}/assets/social/${a.slug}-og.png`;
  const lien = `${SITE}/blog/${a.slug}/`;
  return `
        <tr>
          <td style="padding:16px 28px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#171d2b; border-radius:10px;" bgcolor="#171d2b">
              <tr>
                <td>
                  <a href="${lien}" style="text-decoration:none;">
                    <img src="${image}" width="544" height="285" alt="${echapper(a.fm.title)}" border="0" style="display:block; width:100%; height:auto; border-radius:10px 10px 0 0;">
                  </a>
                </td>
              </tr>
              <tr>
                <td style="padding:18px 20px 20px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr><td style="font-family:Arial,Helvetica,sans-serif; font-size:11px; font-weight:bold; letter-spacing:0.06em; text-transform:uppercase; color:#2997ff; padding-bottom:6px;">${echapper(cat)}</td></tr>
                    <tr><td style="font-family:Arial,Helvetica,sans-serif; font-size:17px; line-height:1.35; font-weight:bold; color:#ffffff; padding-bottom:8px;">${echapper(a.fm.title)}</td></tr>
                    <tr><td style="font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:1.55; color:#a9b4c7; padding-bottom:14px;">${echapper(a.fm.description)}</td></tr>
                    <tr><td><a href="${lien}" style="font-family:Arial,Helvetica,sans-serif; font-size:13px; font-weight:bold; color:#2997ff; text-decoration:none;">Lire l'article &rarr;</a></td></tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
}

function ligneCarte(c) {
  return `
              <tr>
                <td style="padding:16px 20px; border-bottom:1px solid #232a3a;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="font-family:Arial,Helvetica,sans-serif; font-size:14px; color:#e6ebf5;">
                        <strong>${echapper(c.affichage || c.nomFr || c.nom)}</strong><br>
                        <span style="font-size:12px; color:#7c879c;">${echapper(c.set)}</span>
                      </td>
                      <td align="right" style="font-family:Arial,Helvetica,sans-serif; font-size:15px; font-weight:bold; color:#3ddc84; white-space:nowrap;">+${c.variation} %</td>
                    </tr>
                  </table>
                </td>
              </tr>`;
}

function sectionPrix(podiumEntry) {
  if (!podiumEntry || !podiumEntry.podium?.length) return '';
  const titreMarche = podiumEntry.marche === 'jp' ? 'cartes japonaises' : 'cartes internationales';
  return `
        <tr>
          <td style="padding:32px 28px 4px; font-family:Arial,Helvetica,sans-serif; font-size:13px; font-weight:bold; letter-spacing:0.08em; text-transform:uppercase; color:#6b93c4;">
            Les hausses de la semaine (Pokémon, ${echapper(titreMarche)})
          </td>
        </tr>
        <tr>
          <td style="padding:14px 28px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#171d2b; border-radius:10px;" bgcolor="#171d2b">
              ${podiumEntry.podium.map(ligneCarte).join('')}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 28px 0; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:1.5; color:#5c6a82;">
            Variations calculées sur Cardmarket, recoupées contre TCGplayer avant publication. Informatif, ne constitue pas un conseil d'achat.
          </td>
        </tr>`;
}

function composerHtml(articles, podiumEntry) {
  const periode = periodeSemaine();

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Cards Trading — Le récap de la semaine</title>
</head>
<body style="margin:0; padding:0; background-color:#0a0e17;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0a0e17;">
<tr>
<td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%; background-color:#12161f; border-radius:12px; overflow:hidden;">
  <tr>
    <td align="center" style="background-color:#0e1420; padding:28px 24px 24px;" bgcolor="#0e1420">
      <img src="${SITE}/assets/img/logo.png" width="160" height="40" alt="Cards Trading" border="0" style="display:block; width:160px; height:40px;">
    </td>
  </tr>
  <tr>
    <td align="center" style="background-color:#1a6dc4; background-image:linear-gradient(135deg,#2997ff,#1a6dc4); padding:32px 24px;" bgcolor="#1a6dc4">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" style="font-family:Arial,Helvetica,sans-serif; font-size:22px; line-height:1.3; font-weight:bold; color:#ffffff;">Le récap de la semaine</td></tr>
        <tr><td align="center" style="font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:1.5; color:#e6f1ff; padding-top:8px;">Semaine du ${echapper(periode)}</td></tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:28px 28px 4px; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:1.6; color:#cfd6e4;">
      Salut,<br><br>
      Voici ce qui s'est passé cette semaine sur Cards Trading.
    </td>
  </tr>
  ${articles.length ? `
  <tr>
    <td style="padding:24px 28px 4px; font-family:Arial,Helvetica,sans-serif; font-size:13px; font-weight:bold; letter-spacing:0.08em; text-transform:uppercase; color:#6b93c4;">
      Les articles de la semaine
    </td>
  </tr>` : ''}
  ${articles.map(ligneArticle).join('')}
  ${sectionPrix(podiumEntry)}
  <tr>
    <td align="center" style="padding:32px 28px 8px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="background-color:#2997ff; border-radius:8px;" bgcolor="#2997ff">
            <a href="${SITE}/" style="display:inline-block; padding:13px 32px; font-family:Arial,Helvetica,sans-serif; font-size:14px; font-weight:bold; color:#ffffff; text-decoration:none;">Voir le site</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:28px 28px 24px; border-top:1px solid #1c2333; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:1.6; color:#5c6a82; text-align:center;">
      Vous recevez cet email parce que vous êtes inscrit à la liste d'attente Cards Trading.<br>
      Cards Trading — édité par Thugz Labs.<br>
      <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#7c879c; text-decoration:underline;">Se désinscrire</a>
    </td>
  </tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
}

function composerTexte(articles, podiumEntry) {
  const lignes = ['Le récap Cards Trading de la semaine', ''];
  if (articles.length) {
    lignes.push('Articles :');
    for (const a of articles) lignes.push(`- ${a.fm.title} : ${SITE}/blog/${a.slug}/`);
    lignes.push('');
  }
  if (podiumEntry?.podium?.length) {
    lignes.push('Hausses de la semaine :');
    for (const c of podiumEntry.podium) {
      lignes.push(`- ${c.affichage || c.nomFr || c.nom} (${c.set}) : +${c.variation} %`);
    }
    lignes.push('');
  }
  lignes.push(`Voir le site : ${SITE}/`);
  lignes.push('');
  lignes.push('Se désinscrire : {{{RESEND_UNSUBSCRIBE_URL}}}');
  return lignes.join('\n');
}

/* ── 4. Résolution du segment Resend ────────────────────
   Même principe que listeDiffusion() dans api/submit-form.js : un
   identifiant codé en dur casserait silencieusement si le segment était
   recréé. « Segments » est le nom actuel de ce qui s'appelait
   « Audiences » côté API — même objet que celui utilisé par le
   formulaire d'inscription. */
async function segmentDiffusion() {
  if (process.env.RESEND_SEGMENT_ID) return process.env.RESEND_SEGMENT_ID;

  const r = await fetch(`${API_RESEND}/segments`, {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) throw new Error(`segments introuvables : HTTP ${r.status} — ${JSON.stringify(j)}`);

  const segments = j.data || [];
  if (segments.length === 0) throw new Error('aucun segment sur ce compte Resend');

  const choisi = segments.find((s) => s.name === 'General') || segments[0];
  console.log('Segment résolu :', choisi.name, choisi.id);
  return choisi.id;
}

/* ── 5. Création du brouillon (jamais d'envoi) ─────────── */

async function creerBrouillon({ segmentId, sujet, html, texte, previewText }) {
  const r = await fetch(`${API_RESEND}/broadcasts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `Digest hebdo — ${new Date().toISOString().slice(0, 10)}`,
      segment_id: segmentId,
      from: 'Cards Trading <contact@cards-trading.com>',
      subject: sujet,
      html,
      text: texte,
      preview_text: previewText,
      /* Volontairement PAS de `send: true`. Le brouillon reste inerte
         tant que Julian ne l'envoie pas lui-même depuis le dashboard. */
    }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.id) {
    throw new Error(`création du brouillon échouée : HTTP ${r.status} — ${JSON.stringify(j)}`);
  }
  return j.id;
}

/* ── Exécution ─────────────────────────────────────────── */

const articles = articlesDeLaSemaine();
const podiumEntry = podiumDeLaSemaine();

if (articles.length === 0 && !podiumEntry) {
  console.log('Rien à digérer cette semaine (aucun article récent, aucun podium récent). Aucun brouillon créé.');
  process.exit(0);
}

console.log(`${articles.length} article(s) de la semaine, podium ${podiumEntry ? `présent (${podiumEntry.podium.length} carte(s), marché ${podiumEntry.marche})` : 'absent'}.`);

const sujet = `Le récap Cards Trading — semaine du ${periodeSemaine()}`;
const previewText = articles[0]?.fm.title || 'Les nouveautés de la semaine sur Cards Trading';
const html = composerHtml(articles, podiumEntry);
const texte = composerTexte(articles, podiumEntry);

if (SEC) {
  console.log('\n--- Sujet ---\n' + sujet);
  console.log('\n--- Texte ---\n' + texte);
  if (process.env.DUMP_HTML) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(process.env.DUMP_HTML, html);
    console.log(`\n[dry-run] HTML écrit dans ${process.env.DUMP_HTML}`);
  }
  console.log('\n[dry-run] aucun brouillon créé.');
  process.exit(0);
}

if (!process.env.RESEND_API_KEY) {
  console.error('::error::RESEND_API_KEY absente.');
  process.exit(1);
}

const resend = new Resend(process.env.RESEND_API_KEY);
const segmentId = await segmentDiffusion();
const broadcastId = await creerBrouillon({ segmentId, sujet, html, texte, previewText });
const urlBrouillon = `https://resend.com/broadcasts/${broadcastId}`;
console.log(`✅ Brouillon créé : ${urlBrouillon}`);

/*
  Notification à contact@cards-trading.com plutôt qu'une adresse
  personnelle codée en dur : c'est déjà la boîte qui reçoit toutes les
  alertes admin du projet (nouvelles inscriptions, pannes keep-alive),
  et le dépôt est public.
*/
try {
  const { error } = await resend.emails.send({
    from: 'Cards Trading <contact@cards-trading.com>',
    to: ['contact@cards-trading.com'],
    subject: `📬 Digest hebdo prêt à relire — ${articles.length} article(s)${podiumEntry ? ', tendances incluses' : ''}`,
    html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#2997ff;margin:0 0 16px">📬 Le digest de la semaine est prêt</h2>
  <p style="font-size:15px;line-height:1.6;color:#333">
    ${articles.length} article(s)${podiumEntry ? ` et les tendances de prix du ${podiumEntry.date}` : ', sans tendances de prix cette semaine'}.
    Rien n'est envoyé tant que vous ne cliquez pas sur « Send » dans le dashboard.
  </p>
  <p style="margin:24px 0">
    <a href="${urlBrouillon}" style="background:#2997ff;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">Relire le brouillon</a>
  </p>
</div>`,
  });
  if (error) console.error('Notification non envoyée :', JSON.stringify(error));
  else console.log('Notification envoyée à contact@cards-trading.com.');
} catch (e) {
  /* Le brouillon existe déjà et c'est l'essentiel : une notification en
     échec ne doit pas faire échouer tout le run. */
  console.error('Notification non envoyée :', e.message);
}
