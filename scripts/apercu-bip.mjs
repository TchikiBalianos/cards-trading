/**
 * Valide une saison Build in Public et en rend les visuels, sans rien publier.
 *
 * La banque d'épisodes est PRIVÉE (hors de ce dépôt public) : on la passe en
 * argument. Chaque épisode est validé avec les règles exactes d'un post du
 * fichier de semaine (brouillons.mjs : longueur X, hashtags, tirets longs, lien
 * Instagram, prix sans source, carte BiP), comme s'il partait un dimanche.
 *
 *   node scripts/apercu-bip.mjs --saison=<chemin>/saison-1.json
 *   node scripts/apercu-bip.mjs --saison=<chemin>/saison-1.json --sortie=<dossier>
 *
 * Sans --sortie, rien n'est rendu : validation seule (aucun besoin de sharp).
 * Sortie : 0 si tout est valide, 1 sinon.
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { valider, poidsX, texteX } from './lib/brouillons.mjs';

const args = process.argv.slice(2);
const option = (nom) => (args.find((a) => a.startsWith(`--${nom}=`)) || '').split('=').slice(1).join('=');
const chemin = option('saison');
if (!chemin) {
  console.error('Usage : node scripts/apercu-bip.mjs --saison=<fichier> [--sortie=<dossier>]');
  process.exit(2);
}

const saison = JSON.parse(readFileSync(chemin, 'utf8'));
const sortie = option('sortie');

/* Un dimanche quelconque, assez loin pour que la validation n'objecte pas
   « trop tard pour Buffer » : seule la forme du post est jugée ici. */
const SEMAINE = '2030-01-07';
const DIMANCHE = '2030-01-13';

let erreurs = 0;
const vus = new Set();
for (const ep of saison.episodes) {
  if (vus.has(ep.numero)) { console.log(`✗ ${ep.numero} : numéro en double`); erreurs++; }
  vus.add(ep.numero);
  const post = {
    id: `${DIMANCHE}-coulisses`, jour: DIMANCHE, pilier: 'coulisses', licence: 'mixte',
    twitter: ep.twitter, instagram: ep.instagram, visuel: ep.visuel, sources: ep.sources,
  };
  const { erreurs: e } = valider({ semaine: SEMAINE, posts: [post] });
  const poids = ep.twitter ? poidsX(texteX(post)) : 0;
  const nom = ep.visuel ? ep.visuel.nom : '?';
  if (e.length) {
    erreurs += e.length;
    console.log(`✗ ${String(ep.numero).padStart(2, '0')} ${nom}\n    ${e.join('\n    ')}`);
  } else {
    console.log(`✓ ${String(ep.numero).padStart(2, '0')} ${nom.padEnd(26)} X ${String(poids).padStart(3)}/280  ${ep.visuel.rarete.padEnd(7)} ${ep.visuel.illustration.gabarit}`);
  }
}

if (sortie && !erreurs) {
  const { genererVisuel } = await import('./lib/visuel-social.mjs');
  mkdirSync(sortie, { recursive: true });
  for (const ep of saison.episodes) {
    for (const reseau of ['twitter', 'instagram']) {
      const png = await genererVisuel(ep.visuel, 'mixte', reseau);
      writeFileSync(join(sortie, `bip-${String(ep.numero).padStart(2, '0')}-${reseau}.png`), png);
    }
  }
  console.log(`\n${saison.episodes.length * 2} visuels rendus dans ${sortie}`);
}

console.log(erreurs ? `\n${erreurs} erreur(s).` : `\n${saison.episodes.length} épisode(s) valides.`);
process.exit(erreurs ? 1 : 0);
