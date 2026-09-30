/*
  Essai des illustrations par IA (niveau 2) : cinq scènes d'ambiance, une planche
  contact pour juger, rien de publié.

  But : savoir si une image d'ambiance produite par IA tient sous la charte du site
  (fond bleu nuit, halo, titre blanc) avant de décider de l'intégrer aux vignettes
  d'articles et aux posts. La planche montre donc chaque image AVEC un titre
  d'exemple posé dessus, et non à nu.

  Règles de l'essai, tenues par `verifierScenes` et donc par les tests :
    - aucune carte réelle, aucun personnage, aucune licence nommée : un fond IA ne
      doit jamais singer la propriété d'un éditeur (Pokémon, One Piece, ...) ;
    - aucun texte dans l'image : les modèles déforment les lettres, et un mot
      inventé sur une « carte » passerait pour un vrai produit ;
    - au plus cinq scènes par fournisseur, sans relance : le coût maximal d'un
      passage est connu d'avance.

  Les images restent dans `sortie`, hors du dépôt (ignoré par git). Leur usage
  éditorial se décide après lecture de la planche, pas avant.
*/

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FOND, BLEU, echapper, decouper } from './charte.mjs';
import { FOURNISSEURS, genererImage, secretsManquants, fournisseursConfigures } from './image-ia.mjs';

const POLICE = 'Arial, Helvetica, sans-serif';

/* Suffixe commun : la charte visuelle et les interdits, dits au modèle. */
export const STYLE = 'Photographic, cinematic look, deep navy blue and electric blue color palette, soft rim lighting, shallow depth of field, high detail. No text, no letters, no numbers, no logos, no watermark, no real trading cards, no fictional characters, no recognizable faces.';

export const SCENES = [
  {
    id: 'table-de-jeu',
    libelle: 'Table de jeu',
    prompt: 'Top-down view of a wooden game table covered with stacks of blank collectible cards with plain dark blue backs, transparent card sleeves, colorful dice and a warm desk lamp glow.',
  },
  {
    id: 'boutique-nuit',
    libelle: 'Boutique de nuit',
    prompt: 'Interior of a cozy hobby shop at night, shelves of colorful unlabeled boxes, display cases, a blue neon glow coming through the front window, empty shop with nobody inside.',
  },
  {
    id: 'echange-mains',
    libelle: 'Échange de cartes',
    prompt: 'Close-up of two people\'s hands exchanging a few blank collectible cards across a table, only the hands and forearms visible, blurred background.',
  },
  {
    id: 'classeur',
    libelle: 'Classeur de collection',
    prompt: 'Macro photograph of an open collector\'s binder with empty transparent card pockets, a few blank cards slightly out of focus, soft window light.',
  },
  {
    id: 'salle-tournoi',
    libelle: 'Salle de tournoi',
    prompt: 'Wide high-angle view of a card tournament hall, long rows of tables, players as small distant blurred silhouettes, cool blue ambient light, no readable signs.',
  },
];

/* Licences et personnages qu'aucune scène ne doit nommer. Liste volontairement
   courte : elle garde un garde-fou, elle ne prétend pas être exhaustive. */
const INTERDITS = [
  'pokemon', 'pikachu', 'one piece', 'luffy', 'dragon ball', 'goku', 'magic the gathering',
  'yu-gi-oh', 'yugioh', 'lorcana', 'star wars', 'digimon', 'naruto', 'disney', 'marvel', 'mickey',
];

const sansAccent = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const inviteDe = (scene) => `${scene.prompt} ${STYLE}`;

export function verifierScenes(scenes = SCENES) {
  if (!scenes.length || scenes.length > 8) throw new Error(`Entre 1 et 8 scènes attendues (${scenes.length} reçues).`);
  const vus = new Set();
  for (const s of scenes) {
    if (!/^[a-z0-9-]+$/.test(s.id || '')) throw new Error(`Identifiant de scène invalide : ${s.id}`);
    if (vus.has(s.id)) throw new Error(`Scène en double : ${s.id}`);
    vus.add(s.id);
    const invite = inviteDe(s);
    if (!/no text/i.test(invite)) throw new Error(`${s.id} : la scène n'interdit pas le texte dans l'image.`);
    if (!/no real trading cards/i.test(invite)) throw new Error(`${s.id} : la scène n'interdit pas les vraies cartes.`);
    const bas = sansAccent(invite);
    const nomme = INTERDITS.find((t) => bas.includes(t));
    if (nomme) throw new Error(`${s.id} : la scène nomme « ${nomme} », propriété d'un éditeur.`);
  }
}

/* Choisit les fournisseurs à appeler. En « tous », ceux dont les secrets manquent
   sont écartés et signalés ; nommé explicitement, un fournisseur sans secret est
   une erreur : on ne passe pas sous silence un essai qu'on a demandé. */
export function resoudreFournisseurs(choix, env = process.env, seulementPlan = false) {
  const tous = Object.keys(FOURNISSEURS);
  if (choix === 'tous') {
    if (seulementPlan) return { actifs: tous, ignores: [] };
    const actifs = fournisseursConfigures(env);
    const ignores = tous.filter((f) => !actifs.includes(f)).map((f) => ({ fournisseur: f, manquants: secretsManquants(f, env) }));
    return { actifs, ignores };
  }
  if (!tous.includes(choix)) throw new Error(`Choix inconnu : ${choix} (attendu : tous, ${tous.join(', ')}).`);
  if (!seulementPlan) {
    const manquants = secretsManquants(choix, env);
    if (manquants.length) {
      throw new Error(`${choix} : secret absent (${manquants.join(', ')}). À ajouter dans les secrets Actions du dépôt.`);
    }
  }
  return { actifs: [choix], ignores: [] };
}

/* Tarif publié, relevé le 30 septembre 2026 pour le modèle par défaut seulement :
   indicatif, à reverifier avant d'industrialiser. */
const TARIF_GEMINI_PAR_IMAGE_USD = 0.0336;
const MODELE_TARIFE = 'gemini-3.1-flash-lite-image';

function coutIndicatif(fournisseur, modele, nombre) {
  if (fournisseur === 'cloudflare') return 'niveau gratuit (10 000 neurones par jour selon la documentation)';
  if (modele !== MODELE_TARIFE) return 'tarif non relevé pour ce modèle';
  return `environ ${(nombre * TARIF_GEMINI_PAR_IMAGE_USD).toFixed(2).replace('.', ',')} $ au tarif relevé le 30 septembre 2026`;
}

const secondes = (ms) => (ms / 1000).toFixed(1).replace('.', ',');
const kilo = (octets) => `${Math.round(octets / 1024)} ko`;

/* Titre d'exemple posé sur l'image, dans l'esprit des vignettes du site. */
const surimpression = (L, H) => {
  const haut = Math.round(H * 0.4);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}">
  <defs>
    <linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${FOND}" stop-opacity="0"/>
      <stop offset="1" stop-color="${FOND}" stop-opacity="0.92"/>
    </linearGradient>
  </defs>
  <rect y="${haut}" width="${L}" height="${H - haut}" fill="url(#v)"/>
  <rect x="14" y="${H - 66}" width="66" height="20" rx="10" fill="${BLEU}"/>
  <text x="47" y="${H - 52}" text-anchor="middle" font-family="${POLICE}" font-size="11" font-weight="700" fill="${FOND}">Exemple</text>
  <text x="14" y="${H - 20}" font-family="${POLICE}" font-size="19" font-weight="700" fill="#ffffff">Le titre d'un article s'affiche ici</text>
</svg>`;
};

/*
  Planche contact : une colonne par scène, une ligne par fournisseur. Un échec
  occupe sa case avec le message reçu, pour qu'un trou ne passe pas pour un oubli.
  Renvoie un JPEG en mémoire.
*/
export async function planche(resultats, { titre = 'Essai d\'illustrations IA', sousTitre = '' } = {}) {
  /* Import DYNAMIQUE : sharp n'est nécessaire qu'ici, le reste de l'essai (plan,
     validation des scènes) doit tourner sans lui. */
  const { default: sharp } = await import('sharp');

  const fournisseurs = [...new Set(resultats.map((r) => r.fournisseur))];
  const scenes = [...new Set(resultats.map((r) => r.scene))];
  const CL = 420;
  const CH = 236;
  const LEGENDE = 46;
  const GOUTTIERE = 16;
  const ENTETE = 64;
  const largeur = GOUTTIERE + scenes.length * (CL + GOUTTIERE);
  const hauteur = ENTETE + fournisseurs.length * (CH + LEGENDE + GOUTTIERE);

  const pieces = [];
  let textes = '';
  for (const [i, f] of fournisseurs.entries()) {
    for (const [j, s] of scenes.entries()) {
      const r = resultats.find((x) => x.fournisseur === f && x.scene === s);
      const x = GOUTTIERE + j * (CL + GOUTTIERE);
      const y = ENTETE + i * (CH + LEGENDE + GOUTTIERE);
      const libelle = r?.libelle || s;

      if (r?.ok) {
        const vignette = await sharp(r.buffer)
          .resize(CL, CH, { fit: 'cover' })
          .composite([{ input: Buffer.from(surimpression(CL, CH)) }])
          .flatten({ background: FOND })
          .jpeg({ quality: 88 })
          .toBuffer();
        pieces.push({ input: vignette, left: x, top: y });
        textes += `
  <text x="${x}" y="${y + CH + 19}" font-family="${POLICE}" font-size="14" font-weight="700" fill="#ffffff">${echapper(libelle)}</text>
  <text x="${x}" y="${y + CH + 37}" font-family="${POLICE}" font-size="12" fill="#ffffff" fill-opacity="0.6">${echapper(`${f} · ${secondes(r.ms)} s · ${kilo(r.octets)}`)}</text>`;
      } else {
        const lignes = decouper(r ? r.erreur : 'Non exécuté', 12, CL - 28).slice(0, 7);
        textes += `
  <rect x="${x}" y="${y}" width="${CL}" height="${CH}" rx="6" fill="#1b2440"/>
  <text x="${x + 14}" y="${y + 28}" font-family="${POLICE}" font-size="14" font-weight="700" fill="#ff6b6b">${r ? 'Échec' : 'Non exécuté'}</text>
  ${lignes.map((l, k) => `<text x="${x + 14}" y="${y + 52 + k * 18}" font-family="${POLICE}" font-size="12" fill="#ffffff" fill-opacity="0.75">${echapper(l)}</text>`).join('\n  ')}
  <text x="${x}" y="${y + CH + 19}" font-family="${POLICE}" font-size="14" font-weight="700" fill="#ffffff">${echapper(libelle)}</text>
  <text x="${x}" y="${y + CH + 37}" font-family="${POLICE}" font-size="12" fill="#ffffff" fill-opacity="0.6">${echapper(f)}</text>`;
      }
    }
  }

  const base = `<svg xmlns="http://www.w3.org/2000/svg" width="${largeur}" height="${hauteur}">
  <rect width="${largeur}" height="${hauteur}" fill="${FOND}"/>
  <text x="${GOUTTIERE}" y="30" font-family="${POLICE}" font-size="22" font-weight="700" fill="#ffffff">${echapper(titre)}</text>
  <text x="${GOUTTIERE}" y="52" font-family="${POLICE}" font-size="13" fill="#ffffff" fill-opacity="0.6">${echapper(sousTitre)}</text>${textes}
</svg>`;

  return sharp(Buffer.from(base)).composite(pieces).jpeg({ quality: 90 }).toBuffer();
}

/*
  Déroule l'essai. `generer` est injectable (les tests n'ont besoin d'aucun réseau).
  Renvoie { resultats, ignores, sortie } ; écrit les images, `planche-contact.jpg`
  et `rapport.json` dans `sortie`.

  Un 401, 403 ou 429 arrête le fournisseur concerné : c'est un accès ou un quota à
  régler, les scènes suivantes échoueraient à l'identique. Tout autre échec ne
  concerne que sa scène, les suivantes sont tentées.
*/
export async function lancerEssai({
  choix = 'tous',
  nombre = SCENES.length,
  sortie = 'images-ia-test',
  seulementPlan = false,
  env = process.env,
  generer = genererImage,
  journal = console.log,
} = {}) {
  verifierScenes();
  const n = Number.isFinite(nombre) ? Math.min(SCENES.length, Math.max(1, Math.round(nombre))) : SCENES.length;
  const scenes = SCENES.slice(0, n);
  const { actifs, ignores } = resoudreFournisseurs(choix, env, seulementPlan);

  if (!actifs.length) {
    const detail = ignores.map((i) => `${i.fournisseur} (${i.manquants.join(', ')})`).join(' ; ');
    throw new Error(`Aucun fournisseur configuré. Secrets absents : ${detail}.`);
  }

  journal(`Scènes (${scenes.length}) :`);
  for (const s of scenes) journal(`  ${s.id} : ${inviteDe(s)}`);
  for (const f of actifs) {
    const modele = FOURNISSEURS[f].modele(env);
    journal(`${FOURNISSEURS[f].libelle} (${modele}) : ${scenes.length} image(s). Coût : ${coutIndicatif(f, modele, scenes.length)}.`);
  }
  for (const i of ignores) journal(`::warning::${i.fournisseur} ignoré, secret absent (${i.manquants.join(', ')}).`);

  if (seulementPlan) {
    journal('Essai à blanc : aucun appel émis.');
    return { resultats: [], ignores, sortie };
  }

  await mkdir(sortie, { recursive: true });
  const resultats = [];

  for (const f of actifs) {
    for (const [index, s] of scenes.entries()) {
      const base = { fournisseur: f, scene: s.id, libelle: s.libelle };
      try {
        const r = await generer(f, inviteDe(s), { env, ratio: '16:9' });
        const extension = r.format === 'jpeg' ? 'jpg' : r.format;
        const fichier = `${f}-${String(index + 1).padStart(2, '0')}-${s.id}.${extension}`;
        await writeFile(join(sortie, fichier), r.octets);
        resultats.push({ ...base, ok: true, modele: r.modele, fichier, ms: r.ms, octets: r.octets.length, format: r.format, buffer: r.octets });
        journal(`✓ ${f}  ${s.id}  ${secondes(r.ms)} s  ${kilo(r.octets.length)}  ${r.format}`);
      } catch (e) {
        resultats.push({ ...base, ok: false, erreur: e.message });
        journal(`✗ ${f}  ${s.id}  ${e.message}`);
        if ([401, 403, 429].includes(e.statut)) {
          journal(`::warning::${f} : accès ou quota à régler (HTTP ${e.statut}), scènes suivantes non tentées.`);
          break;
        }
      }
    }
  }

  const produites = resultats.filter((r) => r.ok);
  if (produites.length) {
    const date = new Date().toISOString().slice(0, 10);
    const jpeg = await planche(resultats, {
      titre: 'Essai d\'illustrations IA, niveau 2',
      sousTitre: `${date} · ${produites.length} image(s) sur ${scenes.length * actifs.length} demandée(s) · titre d'exemple posé sur chaque image`,
    });
    await writeFile(join(sortie, 'planche-contact.jpg'), jpeg);
  }
  await writeFile(
    join(sortie, 'rapport.json'),
    JSON.stringify({ choix, resultats: resultats.map(({ buffer, ...r }) => r), ignores }, null, 2) + '\n',
  );

  return { resultats, ignores, sortie };
}
