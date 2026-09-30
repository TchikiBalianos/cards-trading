/**
 * Essai des illustrations par IA (niveau 2) : cinq scènes d'ambiance, une planche
 * contact, rien de publié ni de committé.
 *
 * Décidé avec Julian le 30/09/2026 : tester d'abord sur des images d'ambiance, sans
 * carte réelle, sans personnage, sans texte, puis juger sur pièces avant d'aller
 * plus loin (niveau 3). Les règles de l'essai sont dans lib/essai-images.mjs.
 *
 *   node scripts/essai-images-ia.mjs --dry-run                       # plan seul : aucun appel, aucun secret
 *   node scripts/essai-images-ia.mjs --fournisseur=gemini            # 5 images Gemini
 *   node scripts/essai-images-ia.mjs --fournisseur=cloudflare        # 5 images FLUX.1 schnell
 *   node scripts/essai-images-ia.mjs --fournisseur=tous --nombre=1   # celles dont les secrets existent
 *
 * Options : --sortie=dossier (défaut images-ia-test, ignoré par git), --nombre=1 à 5
 * Variables : CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, GEMINI_API_KEY,
 *             GEMINI_MODELE (facultatif, défaut gemini-3.1-flash-lite-image)
 *
 * Sortie : <sortie>/planche-contact.jpg (à regarder en premier), les images une à
 * une, rapport.json. Sous GitHub Actions, un résumé est ajouté à la page du run.
 */

import { appendFileSync } from 'node:fs';
import { lancerEssai } from './lib/essai-images.mjs';

const args = process.argv.slice(2);
const option = (nom) => (args.find((a) => a.startsWith(`--${nom}=`)) || '').split('=').slice(1).join('=');
const drapeau = (nom) => args.includes(`--${nom}`);

/* Une cellule de tableau Markdown ne tolère ni barre verticale ni retour à la ligne. */
const cellule = (t) => String(t).replace(/\|/g, '\\|').replace(/\s+/g, ' ');

function resumeMarkdown(resultats, ignores) {
  const lignes = ['## Essai d\'illustrations IA, niveau 2', '', '| Fournisseur | Scène | Résultat | Durée | Taille |', '|---|---|---|---|---|'];
  for (const r of resultats) {
    lignes.push(r.ok
      ? `| ${r.fournisseur} | ${r.scene} | ✓ ${r.format} | ${(r.ms / 1000).toFixed(1).replace('.', ',')} s | ${Math.round(r.octets / 1024)} ko |`
      : `| ${r.fournisseur} | ${r.scene} | ✗ ${cellule(r.erreur)} | | |`);
  }
  for (const i of ignores) lignes.push('', `${i.fournisseur} ignoré : secret absent (${i.manquants.join(', ')}).`);
  lignes.push('', 'Les images et la planche contact sont dans l\'artefact `images-ia-test` de ce run.');
  return lignes.join('\n') + '\n';
}

try {
  const { resultats, ignores } = await lancerEssai({
    choix: option('fournisseur') || 'tous',
    nombre: option('nombre') ? Number(option('nombre')) : undefined,
    sortie: option('sortie') || 'images-ia-test',
    seulementPlan: drapeau('dry-run'),
  });

  if (process.env.GITHUB_STEP_SUMMARY && resultats.length) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, resumeMarkdown(resultats, ignores));
  }

  const produites = resultats.filter((r) => r.ok).length;
  if (!drapeau('dry-run')) {
    console.log(`\n${produites} image(s) produite(s) sur ${resultats.length} tentée(s).`);
    if (!produites) {
      console.log('::error::Aucune image produite : voir les messages ci-dessus.');
      process.exit(1);
    }
  }
} catch (e) {
  console.log(`::error::${e.message}`);
  process.exit(1);
}
