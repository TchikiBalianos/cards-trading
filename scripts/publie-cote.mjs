/**
 * Publie le « top des hausses » hebdomadaire sur Discord et Buffer.
 *
 * Troisième créneau de la semaine, complémentaire du relais d'articles :
 * celui-ci ne dépend pas du calendrier éditorial, il tourne même les
 * semaines sans publication de blog.
 *
 * Enchaîne trois étapes, chacune pouvant s'arrêter proprement :
 *   1. cote-hebdo.mjs calcule le classement (et refuse de le faire si les
 *      prix sont périmés — voir ses garde-fous) ;
 *   2. une vignette 1080×1080 est générée pour Instagram et TikTok ;
 *   3. le post part sur Discord et sur Buffer.
 *
 * ⚠️ Si le classement est vide, on ne publie RIEN et on sort en 0. Un
 * marché calme est un marché calme ; inventer un top serait exactement la
 * faute qu'on cherche à éviter depuis le début.
 *
 *   node scripts/publie-cote.mjs --marche=jp --dry-run
 *
 * Variables : DISCORD_WEBHOOK_DEFAUT (ou _POKEMON), BUFFER_API_KEY
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = join(RACINE, 'public', 'assets', 'social');
const MARQUE = join(RACINE, 'public', 'assets', 'img', 'logo-icon.png');
const SITE = 'https://cards-trading.com';

const args = process.argv.slice(2);
const MARCHE = (args.find((a) => a.startsWith('--marche=')) || '').split('=')[1] || 'int';
const SEC = args.includes('--dry-run');

/*
  Reprise après échec partiel.

  Discord et Buffer sont publiés à la suite : Discord peut réussir puis
  Buffer échouer, et c'est arrivé dès le premier passage réel (27 août
  2026). Relancer tel quel reposterait sur Discord un message déjà vu par
  la communauté. Cette option permet de ne rejouer que ce qui manque.
*/
const SANS_DISCORD = args.includes('--sans-discord');

/*
  Deux phases, parce que Buffer récupère l'image par URL PUBLIQUE : la
  vignette doit être déployée avant qu'on puisse la référencer.

    --phase=preparer  calcule, génère la vignette, écrit le cache
    --phase=publier   relit le cache et envoie

  Entre les deux, le workflow committe l'image et attend que Vercel l'ait
  servie. Sans ce découpage, Buffer recevrait une URL en 404 et le post
  partirait sans visuel — ou serait rejeté.
*/
const PHASE = (args.find((a) => a.startsWith('--phase=')) || '').split('=')[1] || 'tout';
const CACHE = join(RACINE, '.cote-cache.json');

const BLEU = '#2997ff';
const FOND = '#07111f';

/*
  Garde-fou : un seul top des hausses par jour.

  Le podium archivé fait foi. Sans ce contrôle, un déclenchement manuel
  suivi du cron du jeudi republierait le même classement sur Discord et
  Buffer, à quelques heures d'intervalle — un doublon visible par tous
  les abonnés, impossible à rattraper une fois parti.

  Volontairement INACTIF en phase « publier » : à ce moment-là le run
  légitime est déjà engagé (vignette committée et déployée), et l'entrée
  du jour n'est écrite qu'à la fin de cette phase. L'y appliquer
  bloquerait la publication qu'on vient justement de préparer.
*/
if (PHASE !== 'publier' && !SEC) {
  const FICHIER = join(RACINE, 'data', 'cotes', 'podiums-hebdo.json');
  try {
    const historique = JSON.parse(readFileSync(FICHIER, 'utf8'));
    const aujourdhui = new Date().toISOString().slice(0, 10);
    if (Array.isArray(historique) && historique.some((e) => e.date === aujourdhui)) {
      console.log(`Un top des hausses a déjà été publié aujourd'hui (${aujourdhui}). Rien à faire.`);
      process.exit(0);
    }
  } catch {
    /* Fichier absent ou illisible : premier passage, on continue. */
  }
}

/* ── 1. Classement ─────────────────────────────────────── */

const brut = execFileSync(
  process.execPath,
  [
    /* One Piece a sa propre source : optcgapi expose un historique de
       13 jours, la ou TCGdex ne couvre que Pokemon. Les deux scripts
       produisent le MEME contrat JSON, d'ou l'aiguillage ici plutot
       qu'un branchement dans toute la suite. */
    MARCHE === 'op'
      ? join(RACINE, 'scripts', 'cote-one-piece.mjs')
      : join(RACINE, 'scripts', 'cote-hebdo.mjs'),
    ...(MARCHE === 'op' ? [] : [`--marche=${MARCHE}`]),
    '--json',
  ],
  { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
);
const donnees = JSON.parse(brut);

/*
  Un podium, c'est trois lignes. En dessous, on ne publie pas.

  Ce n'est pas un raffinement : avec le plancher de prix relevé à 10 € le
  19 septembre 2026, le marché japonais ne retenait plus qu'UNE carte sur
  400 examinées. Un « top des hausses » à une ligne n'est pas un top, et la
  vignette comme les textes sont dessinés pour trois entrées.

  C'est la même doctrine que le cas vide, déjà en place depuis l'origine :
  un marché calme est un marché calme, et le silence vaut mieux qu'un
  classement bancal. On le dit dans les journaux pour que la semaine sans
  publication soit lisible, et non prise pour une panne.
*/
const PODIUM_MINIMUM = 3;

if (!donnees.podium || donnees.podium.length < PODIUM_MINIMUM) {
  console.log(
    `Podium incomplet : ${donnees.podium?.length || 0} carte(s) retenue(s) sur ` +
    `${donnees.examinees} examinées, ${PODIUM_MINIMUM} minimum. Rien à publier.`
  );
  process.exit(0);
}

const titreMarche =
  MARCHE === 'jp' ? 'Cartes japonaises' : MARCHE === 'op' ? 'One Piece Card Game' : 'Cartes Pokémon';

/*
  Mention de source : ce que la mesure EST réellement.

  Jusqu'au 19 septembre 2026, l'accroche annonçait « hausses de la semaine »
  pendant que la mention disait « sur 30 jours ». La mesure n'est ni l'une
  ni l'autre : le script calcule (trend − avg30) / avg30, soit l'écart entre
  la cote du jour et la moyenne des ventes du mois. Deux formulations
  fausses pour une même ligne, sur le visuel comme dans la légende.

  Sur l'international, « toutes langues confondues » n'est pas une prudence
  de façade : vérifié en appliquant le filtre de langue sur une fiche
  Cardmarket, aucune ligne de cote ne bouge, seule la liste d'annonces
  change. La cote est publiée par PRODUIT, et l'exemplaire français le moins
  cher partait à 1,60 € quand l'anglais partait à 2,50 €, pour la même carte
  au même instant.

  Sur le japonais c'est l'inverse, et c'est à revendiquer : les cartes
  japonaises ont leurs propres fiches produit chez Cardmarket, donc leur
  cote est bien mono-langue.
*/
const mentionSource =
  MARCHE === 'op'
    ? 'Évolution sur 13 jours'
    : MARCHE === 'jp'
      ? 'Écart entre la cote du jour et la moyenne des ventes sur 30 jours. Cardmarket en euros, cartes japonaises'
      : 'Écart entre la cote du jour et la moyenne des ventes sur 30 jours. Cardmarket en euros, toutes langues confondues';

/* Version courte pour le pied de vignette, où la ligne est unique. */
const mentionCourte =
  MARCHE === 'op'
    ? 'Évolution sur 13 jours'
    : 'Cote du jour contre moyenne des ventes sur 30 jours · Cardmarket';

const motsCles = MARCHE === 'op' ? '#onepiececardgame #opcg' : '#pokemontcg #cartespokemon';
const semaine = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
console.log(`${donnees.podium.length} carte(s) au podium sur ${donnees.examinees} examinées.`);

/* ── 2. Vignette ───────────────────────────────────────── */

function echapper(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/* Un nom trop long casse la mise en page : on tronque plutôt que de
   laisser déborder hors de la toile. */
const court = (t, n) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);

/*
  Nom de la CARTE, pas du Pokémon.

  `nomFr` est le nom d’espèce récupéré chez PokéAPI : le lire en premier
  dégradait « Méga-Camérupt-ex » en « Camérupt », c’est-à-dire en un nom qui
  désigne des dizaines d’impressions aux cotes sans rapport. Signalé par un
  follower le 19 septembre 2026, vérifié dans l’archive : le podium du
  3 septembre portait bien `affichage: "Méga-Camérupt-ex"` pendant que le post
  annonçait « Camérupt ».

  `affichage` est construit pour ça par cote-hebdo.mjs. Même chaîne de repli
  que newsletter-hebdo.mjs, qui la faisait déjà correctement : elle couvre
  One Piece, où `affichage` n’existe pas.
*/
const nomCarte = (c) => c.affichage || c.nomFr || c.nom;
/* Virgule décimale et espace insécable avant le symbole : « 96,54 € ».
   Un « 96.54 € » à l'anglaise sur un compte français fait amateur. */
const DEVISE = MARCHE === 'op' ? '$' : '€';
const euros = (n) => n.toFixed(2).replace('.', ',') + ' ' + DEVISE;

async function vignetteCote() {
  const L = 1080, H = 1080, marge = 90;
  const lignes = donnees.podium.map((c, i) => {
    const y = 430 + i * 165;
    /*
      Troisième ligne : extension en clair et référence complète, avec le
      dénominateur. La place existe (166 px sous le dernier bloc, 81 px
      entre deux entrées) et, contrairement au texte des réseaux, rien ici
      n'est compté.

      Le dénominateur porte un signal éditorial : « 286/217 » veut dire
      carte secrète. Deux des trois cartes du podium du 17 septembre en
      étaient, et rien ne le disait.
    */
    const situe = [c.set, c.refLongue].filter(Boolean).join(' · ');
    return `
  <text x="${marge}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="46"
        font-weight="700" fill="${BLEU}">${i + 1}</text>
  <text x="${marge + 52}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="40"
        font-weight="700" fill="#ffffff">${echapper(court(nomCarte(c), 36))}</text>
  <text x="${marge + 52}" y="${y + 46}" font-family="Arial, Helvetica, sans-serif" font-size="32"
        fill="#ffffff" fill-opacity="0.72">${echapper(euros(c.actuel))}</text>
  <text x="${marge + 240}" y="${y + 46}" font-family="Arial, Helvetica, sans-serif" font-size="32"
        font-weight="700" fill="#22c55e">+${c.variation} %</text>${situe ? `
  <text x="${marge + 52}" y="${y + 84}" font-family="Arial, Helvetica, sans-serif" font-size="26"
        fill="#ffffff" fill-opacity="0.5">${echapper(court(situe, 46))}</text>` : ''}`;
  }).join('\n');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}">
  <defs>
    <radialGradient id="halo" cx="78%" cy="18%" r="62%">
      <stop offset="0%" stop-color="${BLEU}" stop-opacity="0.34"/>
      <stop offset="100%" stop-color="${BLEU}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${L}" height="${H}" fill="${FOND}"/>
  <rect width="${L}" height="${H}" fill="url(#halo)"/>
  <text x="212" y="132" font-family="Arial, Helvetica, sans-serif" font-size="40"
        font-weight="700" fill="#ffffff">Cards-Trading</text>
  <text x="${marge}" y="280" font-family="Arial, Helvetica, sans-serif" font-size="58"
        font-weight="700" fill="#ffffff">Top des hausses</text>
  <text x="${marge}" y="336" font-family="Arial, Helvetica, sans-serif" font-size="32"
        fill="${BLEU}">${echapper(titreMarche)} · semaine du ${echapper(semaine)}</text>
${lignes}
  <text x="${marge}" y="972" font-family="Arial, Helvetica, sans-serif" font-size="26"
        fill="#ffffff" fill-opacity="0.5">${echapper(mentionCourte)} · cards-trading.com</text>
</svg>`;

  const marque = await sharp(MARQUE)
    .extract({ left: 23, top: 53, width: 360, height: 407 })
    .resize({ height: 92 })
    .toBuffer();

  mkdirSync(SORTIE, { recursive: true });
  /* Nom horodaté : les fichiers de public/assets/ sont servis en cache
     immutable un an. Réutiliser « cote-jp.png » chaque semaine servirait
     éternellement la première image. */
  const nom = `cote-${MARCHE}-${new Date().toISOString().slice(0, 10)}.png`;

  /*
    En essai à blanc, on DESSINE mais on n'écrit pas dans public/assets/.

    Le mode « affiche sans rien envoyer » laissait sinon un PNG non suivi
    dans le dépôt à chaque essai, que le prochain `git add` aurait emporté
    sans qu'on le veuille.

    Le rendu est quand même exécuté : c'est là que se révèlent les SVG
    invalides, un titre qui déborde ou une police manquante. Ne pas
    dessiner du tout ferait passer un essai qui ne prouve rien.
  */
  const image = await sharp(Buffer.from(svg))
    .composite([{ input: marque, left: marge, top: 62 }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  if (SEC) {
    console.log(`[dry-run] vignette rendue (${Math.round(image.length / 1024)} Ko), non écrite : ${nom}`);
    return nom;
  }

  writeFileSync(join(SORTIE, nom), image);
  return nom;
}

let fichier;
/*
  En phase « publier », le classement vient du CACHE et non d’un nouvel
  appel à l’API.

  La vignette a été construite en phase « préparer », committée, puis il
  s’écoule 2 à 12 minutes d’attente du déploiement Vercel. Recalculer ici
  produisait des textes décrivant un podium que l’image ne montre pas : les
  prix bougent, et depuis l’ajout des garde-fous une carte peut même sortir
  du classement entre les deux phases.

  Le cache portait déjà `podium` depuis l’origine, personne ne le relisait.
*/
if (PHASE === 'publier') {
  const cache = JSON.parse(readFileSync(CACHE, 'utf8'));
  fichier = cache.fichier;
  if (!Array.isArray(cache.podium) || cache.podium.length === 0) {
    console.error("::error::Cache sans podium. La phase « préparer » doit tourner avant.");
    process.exit(1);
  }
  donnees.podium = cache.podium;
} else {
  fichier = await vignetteCote();
}
const urlVignette = `${SITE}/assets/social/${fichier}`;
console.log(`Vignette : ${fichier}`);

if (PHASE === 'preparer') {
  writeFileSync(CACHE, JSON.stringify({ fichier, podium: donnees.podium, marche: MARCHE }, null, 2));
  console.log('Cache écrit. La vignette doit être committée et déployée avant la phase « publier ».');
  process.exit(0);
}

/* ── 3. Textes ─────────────────────────────────────────── */

/*
  Référence d'impression, accolée au nom : « (ASC 286) ».

  C'est ce qui rend la cote vérifiable, et ce n'est pas une convention de
  marchand : cette référence est imprimée en bas de la carte française
  (ligne « [I] [ASC FR] 286/217 »), et Cardmarket titre lui-même
  « Dracaufeu ex (OBF 125) » sur son propre site français. Le lecteur
  retrouve donc la carte exacte sans rien avoir à apprendre.

  Sans elle, le podium du 17 septembre annonçait « Dracaufeu 427,58 € »
  pour un Méga-Dracaufeu Y-ex en illustration spéciale : un prix qui
  paraissait aberrant faute de dire de quelle carte il s'agissait.

  Repli silencieux si la référence manque (podiums archivés avant le
  19 septembre 2026, marché One Piece) : le nom seul vaut mieux qu'une
  parenthèse vide.
*/
const reference = (c) => (c.refCourte ? ` (${c.refCourte})` : '');

/* Séparateur : point médian, comme en pied de vignette. La convention
   typographique du projet écarte le tiret cadratin. */
const SEP = ' · ';

const ligne = (c, i, avecSet) =>
  `${i + 1}. ${nomCarte(c)}${avecSet && c.set ? ', ' + c.set : ''}${reference(c)}` +
  `${SEP}${euros(c.actuel)} (+${c.variation} %)`;

const classementRiche = donnees.podium.map((c, i) => ligne(c, i, true)).join('\n');
const classementCourt = donnees.podium.map((c, i) => ligne(c, i, false)).join('\n');
const classementSobre = donnees.podium
  .map((c, i) => `${i + 1}. ${nomCarte(c)}${SEP}${euros(c.actuel)} (+${c.variation} %)`)
  .join('\n');

/*
  Poids d'un texte selon les règles de X, et non son nombre de caractères.

  Une URL compte 23 quelle que soit sa longueur, et les caractères japonais
  comme les emoji comptent DOUBLE : « ニンフィアGX » pèse 12 et non 6. Le
  symbole « € » et les points de suspension comptent double eux aussi.

  Sans cette mesure, une semaine japonaise paraît tenir alors qu'elle
  dépasse. Le post serait alors rejeté par Buffer et X perdu pour la
  semaine, alors que Discord et Instagram seraient déjà partis.
*/
const LIMITE_X = 280;
function poidsX(texte) {
  let poids = 0;
  const sansUrl = String(texte).replace(/https?:\/\/\S+/g, () => { poids += 23; return ''; });
  for (const ch of sansUrl) {
    const c = ch.codePointAt(0);
    const large =
      c === 0x20ac || c === 0x2026 ||
      (c >= 0x1100 &&
        (c <= 0x115f || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) ||
         (c >= 0xf900 && c <= 0xfaff) || (c >= 0x1f300 && c <= 0x1faff)));
    poids += large ? 2 : 1;
  }
  return poids;
}

const lien = `${SITE}/?utm_source=`;
/* Plus de « de la semaine » : la mesure compare la cote du JOUR a la
   moyenne des ventes du MOIS, elle ne dit rien de la semaine ecoulee.
   La cadence hebdomadaire reste portee par le sous-titre de la vignette,
   qui date la publication et non le mouvement. */
const accroche = `📈 Top des hausses · ${titreMarche.toLowerCase()}`;
const socle = `${accroche}\n\n${classementRiche}\n\n${mentionSource}.`;

/*
  X est le seul réseau contraint : 280 caractères, contre 2000 sur Discord
  et 2200 sur Instagram et TikTok. On y retient donc la forme la plus riche
  qui TIENNE, mesurée et non supposée, et on le journalise quand il faut se
  rabattre. Jamais de troncature muette : ce projet en a déjà payé le prix.
*/
const SAUT2 = String.fromCharCode(10) + String.fromCharCode(10);
/*
  AUCUN lien dans le corps du post X : il part en première réponse.

  Le projet l'a déjà établi pour les annonces d'articles, mais le post de
  cotes n'avait jamais reçu ce traitement. X limite délibérément la
  diffusion des posts sortants pour garder les lecteurs sur la plateforme,
  de l'ordre de 30 à 50 % de portée initiale.

  Le constat est chiffré sur ce post précis : celui du 18 septembre 2026
  totalise 151 impressions, 0 clic, 0 réaction et 0 repost, lien dans le
  corps et sans visuel.

  Effet de bord utile : le lien pesait 23 caractères dans le budget de X,
  qui reviennent au classement.
*/
const texteX = (cl) => accroche + SAUT2 + cl + SAUT2 + motsCles;
/*
  X est figé sur la forme COURTE, pas sur la plus riche qui tiendrait.

  Mesuré : la forme riche pèse exactement 280 sur 280 cette semaine, soit
  zéro marge. Elle passerait donc certaines semaines et pas d’autres, selon
  la longueur des noms de cartes (médiane 10 caractères, mais 27 au 99e
  centile). Le lecteur verrait la mise en forme changer d’une semaine à
  l’autre sans raison visible, ce qui est pire qu’une forme un peu plus
  sobre mais constante.

  La forme riche reste sur Discord, Instagram et TikTok, où la place ne
  manque pas.

  La forme sobre n’est qu’un filet : elle n’a jamais servi, mais si un jour
  trois noms très longs se présentaient ensemble, mieux vaut un post sans
  référence qu’aucun post.
*/
const candidatsX = [
  ['courte', classementCourt],
  ['sobre', classementSobre],
];
const [formeX, classementX] =
  candidatsX.find(([, cl]) => poidsX(texteX(cl)) <= LIMITE_X) ||
  candidatsX[candidatsX.length - 1];

/* Avertir seulement si l’on descend SOUS la forme attendue. Le premier
   candidat est le cas nominal, pas un repli. */
if (formeX !== candidatsX[0][0]) {
  console.warn(
    `::warning::X : forme « ${formeX} » retenue (${poidsX(texteX(classementX))}/${LIMITE_X}), ` +
    `la forme attendue pesait ${poidsX(texteX(candidatsX[0][1]))}.`
  );
}
if (poidsX(texteX(classementX)) > LIMITE_X) {
  console.error(
    `::error::Même la forme sobre dépasse la limite de X ` +
    `(${poidsX(texteX(classementX))}/${LIMITE_X}). Rien n'est envoyé sur X.`
  );
  process.exit(1);
}

const textes = {
  discord: `${socle}\n\nLa bêta Cards-Trading ouvre bientôt : <${lien}discord#beta>`,
  twitter: texteX(classementX),
  instagram: `${socle}\n\nCards-Trading.com, la marketplace 100 % TCG\n\n${motsCles} #tcg #cartesacollectionner`,
  tiktok: `${socle}\n\nCards-Trading.com, la marketplace 100 % TCG\n\n${motsCles} #tcg #cartesacollectionner`,
};

if (SEC) {
  console.log('\n--- Discord ---\n' + textes.discord);
  console.log('\n--- X ---\n' + textes.twitter);
  console.log('\n--- Instagram ---\n' + textes.instagram);
  console.log('\n[dry-run] rien n’a été envoyé.');
  process.exit(0);
}

/*
  Archive le podium pour la newsletter du samedi.

  Sans ça, le classement calculé ici ne survit que le temps du run
  (.cote-cache.json est gitignore) — le samedi n'aurait rien à relire.
  Placé APRÈS le dry-run (on ne veut pas polluer l'historique d'un essai)
  et indépendamment du succès Discord/Buffer : le digest du samedi doit
  pouvoir afficher les tendances même si les réseaux sociaux ont eu un
  raté ce jeudi-là. Uniquement le marché EUR — 'op' (One Piece, dollars)
  est hors de ce que lit la newsletter.
*/
if (MARCHE !== 'op') {
  const FICHIER_PODIUMS = join(RACINE, 'data', 'cotes', 'podiums-hebdo.json');
  let historique = [];
  try {
    historique = JSON.parse(readFileSync(FICHIER_PODIUMS, 'utf8'));
    if (!Array.isArray(historique)) historique = [];
  } catch {
    /* Fichier absent au premier passage : on part d'un historique vide. */
  }
  historique.push({
    date: new Date().toISOString().slice(0, 10),
    marche: MARCHE,
    podium: donnees.podium,
  });
  mkdirSync(dirname(FICHIER_PODIUMS), { recursive: true });
  writeFileSync(FICHIER_PODIUMS, JSON.stringify(historique, null, 2) + '\n');
  console.log(`Podium archivé dans ${FICHIER_PODIUMS} (${historique.length} entrée(s) au total).`);
}

/* ── 4. Envoi ──────────────────────────────────────────── */

let partis = 0;
const echecs = [];

/* Discord : le salon Pokémon si le classement est pokémon, sinon le
   salon général. */
/* Le salon suit le TCG : un top One Piece dans le salon Pokemon serait
   hors sujet pour ses lecteurs. Repli sur le salon general si le salon
   dedie n'est pas configure. */
const webhook =
  (MARCHE === 'op' ? process.env.DISCORD_WEBHOOK_ONE_PIECE : process.env.DISCORD_WEBHOOK_POKEMON) ||
  process.env.DISCORD_WEBHOOK_DEFAUT;
if (SANS_DISCORD) {
  console.log('—  Discord : sauté (--sans-discord), reprise après échec partiel.');
} else if (webhook) {
  try {
    const r = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Cards-Trading', content: textes.discord }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    console.log('✅ Discord');
    partis++;
  } catch (e) {
    console.error(`❌ Discord : ${e.message}`);
    echecs.push('discord');
  }
} else {
  console.log('—  Discord : aucun webhook configuré, ignoré.');
}

const cle = process.env.BUFFER_API_KEY;
if (cle) {
  const graphql = async (requete, variables) => {
    const r = await fetch('https://api.buffer.com/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: requete, variables }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || j.errors) throw new Error(JSON.stringify(j?.errors || r.status));
    return j.data;
  };

  /*
    La liste passe par la requête RACINE `channels`, et non par
    `account.organizations[].channels` : ce chemin-là répond FORBIDDEN à
    une clé personnelle, quel que soit son périmètre. Même correctif que
    dans annonce-buffer.mjs (27 août 2026) — les deux scripts ont leur
    propre copie du code Buffer, et celle-ci avait été oubliée.
  */
  const d = await graphql('{ account { organizations { id } } }');
  const org = d.account.organizations[0];
  const liste = await graphql(
    'query ($input: ChannelsInput!) { channels(input: $input) { id service isDisconnected } }',
    { input: { organizationId: org.id } }
  );
  const canaux = {};
  for (const c of liste.channels || []) {
    if (!c.isDisconnected) canaux[c.service] = c.id;
  }

  const envois = [
    /*
      ⚠️ Le `thread` doit contenir TOUS les messages, le premier compris,
      et son texte doit répéter EXACTEMENT celui du post. Ne mettre que la
      réponse produit un thread incohérent. Même forme que
      scripts/annonce-buffer.mjs, vérifiée le 1er septembre 2026 sur un
      brouillon de test.
    */
    ['twitter', textes.twitter, null, {
      twitter: {
        thread: [
          { text: textes.twitter },
          { text: lien + String.fromCharCode(120) },
        ],
      },
    }],
    ['instagram', textes.instagram, urlVignette, { instagram: { type: 'post', shouldShareToFeed: true } }],
    ['tiktok', textes.tiktok, urlVignette, { tiktok: { title: court(accroche, 90) } }],
  ];

  for (const [service, texte, image, metadata] of envois) {
    if (!canaux[service]) { console.log(`—  ${service} : non connecté.`); continue; }
    try {
      /*
        `createPost` renvoie une UNION depuis août 2026 : un refus du
        réseau (quota, entrée invalide, rejet) arrive en donnée VALIDE,
        pas dans `errors`. Sans contrôle du __typename, un post rejeté
        passerait pour un succès. Même correctif que dans
        annonce-buffer.mjs, oublié ici.
      */
      const d2 = await graphql(
        `mutation ($input: CreatePostInput!) {
           createPost(input: $input) {
             __typename
             ... on PostActionSuccess { post { id status dueAt } }
             ... on RestProxyError { message code }
             ... on InvalidInputError { message }
             ... on LimitReachedError { message }
             ... on UnauthorizedError { message }
             ... on NotFoundError { message }
             ... on UnexpectedError { message }
           }
         }`,
        {
          input: {
            channelId: canaux[service],
            text: texte,
            assets: image ? [{ image: { url: image, metadata: { altText: `Top des hausses — ${titreMarche}` } } }] : [],
            mode: 'addToQueue',
            needsApproval: false,
            schedulingType: 'automatic',
            ...(metadata ? { metadata } : {}),
          },
        }
      );
      const r = d2.createPost;
      if (r.__typename !== 'PostActionSuccess') {
        throw new Error(`${r.__typename}${r.code ? ' ' + r.code : ''} : ${r.message}`);
      }
      console.log(`✅ ${service} : ${r.post.status}${r.post.dueAt ? ' pour le ' + r.post.dueAt : ''}`);
      partis++;
    } catch (e) {
      console.error(`❌ ${service} : ${e.message}`);
      echecs.push(service);
    }
  }
} else {
  console.log('—  Buffer : BUFFER_API_KEY absente, ignoré.');
}

console.log(`\n${partis} publication(s) partie(s).`);
if (echecs.length) {
  console.error(`::error::Échec sur : ${echecs.join(', ')}`);
  process.exit(1);
}
