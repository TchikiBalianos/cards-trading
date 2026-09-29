/**
 * Plan et contrôle de la programmation sociale (X et Instagram).
 *
 *   node scripts/semaine-sociale.mjs --plan                  # grille de la semaine à préparer
 *   node scripts/semaine-sociale.mjs --plan --lundi=2026-10-05
 *   node scripts/semaine-sociale.mjs --controle              # lit Buffer, écrit si anomalie
 *   node scripts/semaine-sociale.mjs --controle --dry-run    # affiche sans envoyer d'email
 *
 * Le contrôle ne prévient QUE s'il y a quelque chose à faire : une alerte
 * quotidienne systématique cesse d'être lue au bout d'une semaine, soit
 * exactement le jour où elle compte (même principe que alerte-relecture).
 *
 * Variables : BUFFER_API_KEY, RESEND_API_KEY
 */

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contexte, listerPosts } from './lib/buffer.mjs';
import {
  planEditorial, analyser, decrire, lundiDe, ajouterJours, jourParis, PILIERS, CRENEAUX,
} from './lib/semaine-sociale.mjs';
import { envoyerEmail, echapperHtml, gabarit } from './lib/email.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (nom) => (args.find((a) => a.startsWith(`--${nom}=`)) || '').split('=').slice(1).join('=');
const SEC = args.includes('--dry-run');

const maintenant = new Date().toISOString();
const aujourdhui = jourParis(maintenant);
const jourSemaine = new Date(`${aujourdhui}T12:00:00Z`).getUTCDay(); // 0 = dimanche

const fichierDe = (lundi) => join(RACINE, 'data', 'social', `${lundi}.json`);

/* Du vendredi au dimanche on prépare la semaine SUIVANTE, sinon la courante. */
function lundiCible() {
  const force = option('lundi');
  if (force) return lundiDe(force);
  const courant = lundiDe(aujourdhui);
  return [5, 6, 0].includes(jourSemaine) ? ajouterJours(courant, 7) : courant;
}

if (args.includes('--plan')) {
  const lundi = lundiCible();
  console.log(`\nSemaine du ${lundi} (fichier data/social/${lundi}.json ${existsSync(fichierDe(lundi)) ? 'PRÉSENT' : 'absent'})\n`);
  for (const c of planEditorial(lundi)) {
    console.log(`  ${c.jour}  ${PILIERS[c.pilier].libelle.padEnd(22)} ${c.licence.padEnd(10)} X ${CRENEAUX.twitter}  Instagram ${CRENEAUX.instagram}`);
    console.log(`              ${PILIERS[c.pilier].consigne}`);
  }
  console.log('\nLes mercredi, vendredi et samedi sont remplis par les relais automatiques (articles, cotes).');
  process.exit(0);
}

if (!args.includes('--controle')) {
  console.error('Usage : --plan | --controle [--dry-run]');
  process.exit(1);
}

const { organisation, canaux } = await contexte();
const ids = new Set([canaux.twitter, canaux.instagram].filter(Boolean));
const tous = await listerPosts({
  organisation,
  statuts: ['draft', 'needs_approval', 'scheduled', 'sending', 'sent', 'error'],
  debut: `${ajouterJours(aujourdhui, -3)}T00:00:00Z`,
  fin: `${ajouterJours(aujourdhui, 10)}T00:00:00Z`,
});
/* TikTok est le compte personnel de Julian : hors périmètre. */
const posts = tous.filter((p) => ids.has(p.channelId));

const anomalies = analyser({ posts, maintenant });

/* Le samedi soir et le dimanche, la semaine suivante doit déjà avoir son fichier :
   c'est ce qu'écrit la routine du samedi. Son absence est le seul moyen de voir
   que la routine n'a pas tourné, puisque rien n'aura échoué. */
if ([6, 0].includes(jourSemaine)) {
  const suivant = ajouterJours(lundiDe(aujourdhui), 7);
  if (!existsSync(fichierDe(suivant))) anomalies.push({ type: 'semaine_absente', semaine: suivant });
}

const enFile = posts.filter((p) => p.status === 'scheduled').length;
console.log(`${posts.length} post(s) X/Instagram lus, ${enFile} programmé(s), ${anomalies.length} anomalie(s).`);

if (anomalies.length === 0) {
  console.log('Rien à signaler.');
  process.exit(0);
}

for (const a of anomalies) console.log(`::warning::${decrire(a)}`);

const sujet = anomalies.length === 1 ? `⚠️ Réseaux : ${decrire(anomalies[0]).slice(0, 80)}` : `⚠️ Réseaux : ${anomalies.length} points à traiter`;
const texte = `${anomalies.map((a) => `- ${decrire(a)}`).join('\n')}\n\nBuffer : https://publish.buffer.com/`;
const corps = `<tr><td style="padding:18px 24px;font-size:13px;color:#e6ebf5;line-height:1.7;">
  ${anomalies.map((a) => `<div style="padding:4px 0;">• ${echapperHtml(decrire(a))}</div>`).join('')}
  <div style="padding-top:14px;"><a href="https://publish.buffer.com/" style="color:#2997ff;">Ouvrir Buffer</a></div>
</td></tr>`;

if (SEC) {
  console.log(`\n--- sujet ---\n${sujet}\n\n--- texte ---\n${texte}\n\n[dry-run] aucun email envoyé.`);
  process.exit(0);
}
await envoyerEmail({ sujet, texte, html: gabarit({ titre: 'Programmation des réseaux', corps }) });
