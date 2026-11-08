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
/* Le 8 novembre 2026, le premier essai (FLUX.1 schnell, cartes « vierges », consignes
   en négatif) donnait des images brouillonnes : un classeur en dalles de verre, une
   salle floue. FLUX.2 comprend une phrase complète : chaque scène décrit donc ce
   qu'on VEUT voir (des cartes vues de dos, unies, bleu marine) plutôt que ce qu'on
   évite, et garde le bas du cadre sombre, là où la vignette pose le titre. */
export const STYLE = 'Premium editorial photograph, 35mm lens, cinematic lighting, deep navy blue and electric blue color grade with a warm golden accent, soft rim light, shallow depth of field, realistic textures, crisp focus on the subject. No text, no letters, no numbers, no logos, no watermark, no real trading cards, no fictional characters, no recognizable faces.';

export const SCENES = [
  {
    id: 'table-de-jeu',
    libelle: 'Table de jeu',
    prompt: 'A dark wooden gaming table at night seen from a low angle, tidy stacks of trading cards lying face down with plain navy blue backs, a few cards fanned out, clear card sleeves, polished dice, and a warm desk lamp casting a golden pool of light. The lower third of the frame fades into deep shadow.',
  },
  {
    id: 'boutique-nuit',
    libelle: 'Boutique de nuit',
    prompt: 'A cozy independent game shop at night, seen from the doorway: wooden shelves of colorful board game boxes, a glass display counter, warm lamps, and electric blue neon light spilling through the front window onto the floor. Quiet and inviting. The lower third of the frame fades into deep shadow.',
  },
  {
    id: 'echange-mains',
    libelle: 'Échange de cartes',
    /* Reformulée le 8 novembre 2026 : la version avec des mains qui se passent des cartes
       a reçu deux fois HTTP 500 de Workers AI (deux requêtes différentes, les quatre autres
       scènes passant), sans doute un filtre de contenu. Aucune présence humaine ici. */
    prompt: 'Close-up photograph of two small stacks of trading cards, shown from their plain navy blue backs, sliding toward each other across a wooden table as if being traded. Warm friendly light, a softly blurred game shop with blue lights behind. The lower third of the frame fades into deep shadow.',
  },
  {
    id: 'classeur',
    libelle: 'Classeur de collection',
    prompt: 'Macro photograph of a collector\'s binder lying open on a dark desk, clear plastic pockets each holding a trading card shown from its plain navy blue back, soft window light from the left, a mug and card sleeves blurred in the background. The lower third of the frame fades into deep shadow.',
  },
  {
    id: 'salle-tournoi',
    libelle: 'Salle de tournoi',
    prompt: 'Wide cinematic view of a large tournament hall, long rows of tables with players seen from behind, small and softly blurred, cool blue ambient light, light haze, ceiling lights turning into soft bokeh. The lower third of the frame fades into deep shadow.',
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
  if (fournisseur === 'cloudflare') {
    const base = 'niveau gratuit de 10 000 neurones par jour selon la documentation';
    /* Tarif de la page Workers AI lu le 8 novembre 2026 : 1 363,64 neurones pour le premier mégapixel. */
    return modele.endsWith('/flux-2-klein-9b') ? `${base}, environ ${Math.round(nombre * 1364)} neurones pour cette passe` : base;
  }
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
  scene = '',
  sortie = 'images-ia-test',
  seulementPlan = false,
  env = process.env,
  generer = genererImage,
  journal = console.log,
} = {}) {
  verifierScenes();
  /* `scene` vise UNE scène par son identifiant (rejouer celle qu'un 500 a fait échouer
     sans repayer les autres) ; sans elle, `nombre` prend les premières dans l'ordre. */
  let scenes;
  if (scene) {
    const voulue = SCENES.find((s) => s.id === scene);
    if (!voulue) throw new Error(`Scène inconnue : ${scene} (attendu : ${SCENES.map((s) => s.id).join(', ')}).`);
    scenes = [voulue];
  } else {
    const n = Number.isFinite(nombre) ? Math.min(SCENES.length, Math.max(1, Math.round(nombre))) : SCENES.length;
    scenes = SCENES.slice(0, n);
  }
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
    for (const s of scenes) {
      const base = { fournisseur: f, scene: s.id, libelle: s.libelle };
      try {
        const r = await generer(f, inviteDe(s), { env, ratio: '16:9' });
        const extension = r.format === 'jpeg' ? 'jpg' : r.format;
        /* Le rang est celui de la liste complète : rejouée seule, la scène garde son numéro. */
        const fichier = `${f}-${String(SCENES.indexOf(s) + 1).padStart(2, '0')}-${s.id}.${extension}`;
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
