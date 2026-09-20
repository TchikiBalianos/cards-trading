/**
 * Insère (ou met à jour) le mini sommaire en tête des articles de blog.
 *
 * Convention éditoriale : chaque article porte un sommaire en haut et une
 * FAQ en bas. Le sommaire liste tous les titres de niveau 2.
 *
 *   node scripts/sommaire.mjs                    # tous les articles
 *   node scripts/sommaire.mjs <slug> [<slug>…]   # ciblé
 *   node scripts/sommaire.mjs --verifie          # ne modifie rien, sort 1 si un
 *                                                # sommaire manque ou est périmé
 *
 * Les ancres sont calculées avec github-slugger, la même bibliothèque
 * qu'Astro utilise pour poser les `id` sur les titres. C'est une dépendance
 * transitive : si elle disparaît, le script s'arrête au lieu de produire
 * des ancres fausses silencieusement.
 *
 * ⚠️ Générer l'ancre ne prouve pas qu'elle existe dans la page. Après un
 * `npm run build`, `--verifie-html` compare chaque lien du sommaire aux `id`
 * réellement présents dans `dist/`. C'est le seul contrôle qui tranche.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import GithubSlugger from 'github-slugger';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const BLOG = join(RACINE, 'src', 'content', 'blog');
const DIST = join(RACINE, 'dist', 'blog');

const OUVRE = '<!-- sommaire -->';
const FERME = '<!-- /sommaire -->';

/* Les articles du dépôt cohabitent en LF et en CRLF selon la machine qui les
   a écrits. On travaille toujours en LF, et on restitue la convention du
   fichier à l'écriture : sinon chaque passage réécrirait toutes les lignes et
   noierait le vrai diff. */
function lit(chemin) {
  const brut = readFileSync(chemin, 'utf8');
  return { texte: brut.replace(/\r\n/g, '\n'), crlf: brut.includes('\r\n') };
}

function ecrit(chemin, texte, crlf) {
  writeFileSync(chemin, crlf ? texte.replace(/\n/g, '\r\n') : texte);
}

/* Le corps sans le bloc sommaire : sert autant à relire les titres qu'à
   réécrire le fichier sans dupliquer le bloc à chaque passage. */
function separe(texte) {
  const fin = texte.indexOf('\n---\n', 3);
  if (!texte.startsWith('---') || fin === -1) {
    throw new Error('frontmatter introuvable');
  }
  const enTete = texte.slice(0, fin + 5);
  let corps = texte.slice(fin + 5);

  const debutBloc = corps.indexOf(OUVRE);
  if (debutBloc !== -1) {
    const finBloc = corps.indexOf(FERME);
    if (finBloc === -1) throw new Error('bloc sommaire ouvert mais jamais fermé');
    corps = corps.slice(0, debutBloc) + corps.slice(finBloc + FERME.length);
  }
  return { enTete, corps: corps.replace(/^\n+/, '') };
}

function construitSommaire(corps) {
  const slugger = new GithubSlugger();
  const lignes = [];
  for (const [, titre] of corps.matchAll(/^## (.+)$/gm)) {
    lignes.push(`- [${titre.trim()}](#${slugger.slug(titre.trim())})`);
  }
  if (lignes.length < 2) return null;
  return `${OUVRE}\n**Au sommaire**\n\n${lignes.join('\n')}\n${FERME}`;
}

function articles(cibles) {
  const tous = readdirSync(BLOG).filter((f) => f.endsWith('.md'));
  if (!cibles.length) return tous;
  return cibles.map((c) => {
    const nom = c.endsWith('.md') ? c : `${c}.md`;
    if (!tous.includes(nom)) throw new Error(`article inconnu : ${nom}`);
    return nom;
  });
}

/* Contrôle post-build : chaque ancre du sommaire doit correspondre à un id
   présent dans la page générée. Sans ça, un lien mort passe inaperçu. */
function verifieHtml(noms) {
  let defauts = 0;
  for (const nom of noms) {
    const slug = nom.replace(/\.md$/, '');
    const page = join(DIST, slug, 'index.html');
    if (!existsSync(page)) {
      console.log(`~  ${slug} : pas de page générée (brouillon ?), non vérifié`);
      continue;
    }
    const html = readFileSync(page, 'utf8');
    const ids = new Set([...html.matchAll(/<h[1-6][^>]*\sid="([^"]+)"/g)].map((m) => m[1]));
    const { texte: md } = lit(join(BLOG, nom));
    const { corps } = separe(md);
    const bloc = construitSommaire(corps);
    if (!bloc) continue;
    const morts = [...bloc.matchAll(/\]\(#([^)]+)\)/g)]
      .map((m) => decodeURIComponent(m[1]))
      .filter((ancre) => !ids.has(ancre));
    if (morts.length) {
      defauts++;
      console.error(`KO ${slug} : ancre(s) sans cible → ${morts.join(', ')}`);
    } else {
      console.log(`OK ${slug}`);
    }
  }
  return defauts;
}

const args = process.argv.slice(2);
const verifie = args.includes('--verifie');
const verifieHtmlMode = args.includes('--verifie-html');
const cibles = args.filter((a) => !a.startsWith('--'));
const noms = articles(cibles);

if (verifieHtmlMode) {
  const defauts = verifieHtml(noms);
  console.log(defauts ? `\n${defauts} article(s) en défaut.` : '\nToutes les ancres pointent sur un titre existant.');
  process.exit(defauts ? 1 : 0);
}

let modifies = 0;
let perimes = 0;

for (const nom of noms) {
  const chemin = join(BLOG, nom);
  const { texte, crlf } = lit(chemin);
  const { enTete, corps } = separe(texte);
  const bloc = construitSommaire(corps);

  if (!bloc) {
    console.log(`~  ${nom} : moins de deux titres, sommaire inutile`);
    continue;
  }

  const attendu = `${enTete}\n${bloc}\n\n${corps}`;
  if (attendu === texte) {
    console.log(`=  ${nom}`);
    continue;
  }

  if (verifie) {
    perimes++;
    console.error(`KO ${nom} : sommaire absent ou périmé`);
    continue;
  }

  ecrit(chemin, attendu, crlf);
  modifies++;
  console.log(`->  ${nom}`);
}

if (verifie) {
  console.log(perimes ? `\n${perimes} article(s) à régénérer.` : '\nTous les sommaires sont à jour.');
  process.exit(perimes ? 1 : 0);
}
console.log(`\n${modifies} article(s) modifié(s).`);
