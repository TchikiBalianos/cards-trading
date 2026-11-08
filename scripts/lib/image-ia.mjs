/*
  Génération d'images par IA, pour l'essai des illustrations (niveau 2).

  Deux fournisseurs, un même contrat : un texte en entrée, les octets d'une image
  en sortie. Le module ne sait que parler aux API et décoder leur réponse. Il
  n'écrit rien sur le disque et ne publie rien.

    cloudflare   Workers AI, modèle FLUX.2 [klein] 9B (FLUX.1 schnell, essayé le
                 8 novembre 2026, rendait des images brouillonnes). Niveau gratuit
                 de 10 000 neurones par jour, soit environ 7 images d'un mégapixel
                 par jour, mais il faut un compte Cloudflare, un jeton
                 « Workers AI » et l'identifiant du compte.
    gemini       Modèles d'image de Gemini (« Nano Banana »), via l'API
                 « interactions » (format lu dans la documentation le 30 septembre
                 2026). Facturé à l'image : le 20 août 2026, la clé du dépôt
                 recevait HTTP 429, l'accès gratuit n'ayant aucun quota d'image.

  Les deux se testent sans réseau : `fetchImpl` est injectable.

  ⚠️ Ne jamais mettre un secret dans un message d'erreur. Les erreurs n'embarquent
  que le statut HTTP et le message renvoyé par l'API, jamais les en-têtes envoyés.
*/

/* Limite de FLUX.1 schnell sur Workers AI ; Gemini accepte plus, on s'aligne sur
   la plus stricte pour qu'un même texte passe chez les deux. */
const PROMPT_MAX = 2048;

export const FOURNISSEURS = {
  cloudflare: {
    libelle: 'Cloudflare Workers AI',
    secrets: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'],
    /* FLUX.2 [klein] 9B : 4 étapes fixes, environ 1 364 neurones pour un mégapixel.
       `CLOUDFLARE_MODELE` permet d'en essayer un autre (flux-2-dev, flux-1-schnell...). */
    modele: (env) => (env.CLOUDFLARE_MODELE || '').trim() || '@cf/black-forest-labs/flux-2-klein-9b',
  },
  gemini: {
    libelle: 'Google Gemini',
    secrets: ['GEMINI_API_KEY'],
    /* Le plus économe des modèles d'image (1K seulement). `gemini-2.5-flash-image`
       est arrêté le 2 octobre 2026 : ne pas le reprendre. */
    modele: (env) => (env.GEMINI_MODELE || '').trim() || 'gemini-3.1-flash-lite-image',
  },
};

function verifierFournisseur(nom) {
  if (!Object.hasOwn(FOURNISSEURS, nom)) {
    throw new Error(`Fournisseur inconnu : ${nom} (attendu : ${Object.keys(FOURNISSEURS).join(', ')}).`);
  }
}

/* GitHub Actions passe un secret absent comme une chaîne VIDE, pas comme une
   variable non définie : on teste donc le contenu, pas l'existence. */
export function secretsManquants(fournisseur, env = process.env) {
  verifierFournisseur(fournisseur);
  return FOURNISSEURS[fournisseur].secrets.filter((nom) => !String(env[nom] ?? '').trim());
}

export const fournisseursConfigures = (env = process.env) =>
  Object.keys(FOURNISSEURS).filter((f) => secretsManquants(f, env).length === 0);

export function verifierPrompt(prompt) {
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('Prompt vide.');
  if (prompt.length > PROMPT_MAX) {
    throw new Error(`Prompt trop long (${prompt.length} caractères, ${PROMPT_MAX} au plus).`);
  }
}

/* Les modèles FLUX.2 de Workers AI prennent un formulaire multipart (prompt, width,
   height), pas du JSON ; FLUX.1 schnell prend du JSON. */
const EST_FLUX_2 = /\/flux-2-/;

/* Largeur et hauteur d'environ un mégapixel (le premier est facturé au forfait chez
   Cloudflare), en multiples de 16 comme l'exige la famille FLUX. 16:9 donne 1360 x 768. */
export function dimensions(ratio = '16:9') {
  const [a, b] = String(ratio).split(':').map(Number);
  if (!(a > 0 && b > 0)) throw new Error(`Ratio invalide : ${ratio}`);
  const largeur = Math.sqrt((1024 * 1024 * a) / b);
  const arrondi = (v) => Math.max(256, Math.round(v / 16) * 16);
  return { largeur: arrondi(largeur), hauteur: arrondi((largeur * b) / a) };
}

/* Construit l'appel HTTP sans l'émettre : c'est ce que les tests examinent. */
export function construireRequete(fournisseur, { prompt, env = process.env, ratio = '16:9', etapes = 4 } = {}) {
  verifierFournisseur(fournisseur);
  verifierPrompt(prompt);
  const manquants = secretsManquants(fournisseur, env);
  if (manquants.length) throw new Error(`${fournisseur} : secret absent (${manquants.join(', ')}).`);
  const modele = FOURNISSEURS[fournisseur].modele(env);

  if (fournisseur === 'cloudflare') {
    /* `@` et `/` du nom de modèle restent tels quels : c'est la forme de la doc. */
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID.trim())}/ai/run/${modele}`;
    const autorisation = { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN.trim()}` };

    if (EST_FLUX_2.test(modele)) {
      const { largeur, hauteur } = dimensions(ratio);
      const formulaire = new FormData();
      formulaire.append('prompt', prompt);
      formulaire.append('width', String(largeur));
      formulaire.append('height', String(hauteur));
      /* Pas de `Content-Type` : fetch le pose, avec la frontière du multipart. Pas de
         `steps` non plus : les « klein » sont distillés à 4 étapes fixes. */
      return { modele, url, init: { method: 'POST', headers: autorisation, body: formulaire } };
    }

    return {
      modele,
      url,
      init: {
        method: 'POST',
        headers: { ...autorisation, 'Content-Type': 'application/json' },
        /* `steps` : 1 à 8, 4 par défaut. Ni largeur ni hauteur : FLUX.1 schnell ne les
           documente pas, et un paramètre inconnu peut valoir un 400. */
        body: JSON.stringify({ prompt, steps: Math.min(8, Math.max(1, Math.round(etapes))) }),
      },
    };
  }

  return {
    modele,
    url: 'https://generativelanguage.googleapis.com/v1beta/interactions',
    init: {
      method: 'POST',
      headers: { 'x-goog-api-key': env.GEMINI_API_KEY.trim(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modele,
        input: [{ type: 'text', text: prompt }],
        response_format: { type: 'image', aspect_ratio: ratio },
      }),
    },
  };
}

/* Le format se lit dans les premiers octets, pas dans l'en-tête de la réponse :
   une extension fausse ferait échouer la suite sans message clair. */
export function formatImage(octets) {
  if (octets.length > 3 && octets[0] === 0xff && octets[1] === 0xd8 && octets[2] === 0xff) return 'jpeg';
  if (octets.length > 8 && octets.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (octets.length > 12 && octets.subarray(0, 4).toString('latin1') === 'RIFF' && octets.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  throw new Error('Octets reçus : ni JPEG, ni PNG, ni WebP.');
}

export function extraireCloudflare(json) {
  const b64 = json?.result?.image;
  if (typeof b64 !== 'string' || !b64) throw new Error('cloudflare : réponse sans image (champ result.image absent).');
  return Buffer.from(b64, 'base64');
}

/* Tous les blocs image d'une réponse Gemini, dans l'ordre du document. */
function blocsImage(noeud, acc = []) {
  if (Array.isArray(noeud)) noeud.forEach((n) => blocsImage(n, acc));
  else if (noeud && typeof noeud === 'object') {
    if (noeud.type === 'image' && typeof noeud.data === 'string') acc.push(noeud);
    else Object.values(noeud).forEach((n) => blocsImage(n, acc));
  }
  return acc;
}

function blocsTexte(noeud, acc = []) {
  if (Array.isArray(noeud)) noeud.forEach((n) => blocsTexte(n, acc));
  else if (noeud && typeof noeud === 'object') {
    if (noeud.type === 'text' && typeof noeud.text === 'string') acc.push(noeud.text);
    else Object.values(noeud).forEach((n) => blocsTexte(n, acc));
  }
  return acc;
}

/* On ne lit que `steps` : si la réponse répétait l'entrée, une image envoyée par
   nous ne doit jamais passer pour une image produite. */
export function extraireGemini(json) {
  const racine = json?.steps ?? json;
  const blocs = blocsImage(racine);
  if (!blocs.length) {
    const types = Array.isArray(json?.steps) ? json.steps.map((s) => s?.type).filter(Boolean).join(', ') : '';
    /* Un refus (filtre de sécurité) arrive en texte : il dit pourquoi il n'y a pas d'image. */
    const explication = blocsTexte(racine).join(' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    throw new Error(`gemini : réponse sans image (étapes : ${types || 'aucune'})${explication ? `, le modèle dit : ${explication}` : ''}.`);
  }
  /* Le DERNIER bloc, comme `output_image` dans les SDK : les images intermédiaires
     de la phase de réflexion précèdent le rendu final. */
  return Buffer.from(blocs[blocs.length - 1].data, 'base64');
}

function messageErreur(json, brut) {
  const m = json?.error?.message ?? json?.errors?.[0]?.message;
  return String(m ?? brut ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
}

function erreur(message, statut) {
  const e = new Error(message);
  if (statut) e.statut = statut;
  return e;
}

/*
  Génère UNE image. Lève une erreur claire, jamais de résultat partiel.
  Options : env, fetchImpl, delaiMs (90 s), ratio (Gemini), etapes (Cloudflare).
  L'erreur porte `statut` quand l'API a répondu : 401, 403 et 429 signalent un accès
  ou un quota à régler, inutile de réessayer avec le même.
*/
export async function genererImage(fournisseur, prompt, options = {}) {
  const { env = process.env, fetchImpl = fetch, delaiMs = 90_000, ...reste } = options;
  const { url, init, modele } = construireRequete(fournisseur, { prompt, env, ...reste });
  const debut = Date.now();

  let rep;
  try {
    rep = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(delaiMs) });
  } catch (e) {
    const cause = e?.name === 'TimeoutError' ? `délai de ${Math.round(delaiMs / 1000)} s dépassé` : (e?.message || 'erreur réseau');
    throw erreur(`${fournisseur} : appel impossible (${cause}).`);
  }

  /* Certains modèles Workers AI répondent l'image brute plutôt qu'un JSON. */
  const type = (rep.headers?.get?.('content-type') || '').toLowerCase();
  if (rep.ok && type.startsWith('image/')) {
    const octets = Buffer.from(await rep.arrayBuffer());
    return { fournisseur, modele, octets, format: formatImage(octets), ms: Date.now() - debut };
  }

  const brut = await rep.text();
  let json = null;
  try { json = JSON.parse(brut); } catch { /* corps non JSON : traité plus bas */ }

  if (!rep.ok) throw erreur(`${fournisseur} : HTTP ${rep.status} ${messageErreur(json, brut)}`.trim(), rep.status);
  if (json === null) throw erreur(`${fournisseur} : réponse non JSON (HTTP ${rep.status}).`, rep.status);
  if (json.success === false) throw erreur(`${fournisseur} : refus de l'API ${messageErreur(json, brut)}`.trim(), rep.status);

  const octets = fournisseur === 'cloudflare' ? extraireCloudflare(json) : extraireGemini(json);
  return { fournisseur, modele, octets, format: formatImage(octets), ms: Date.now() - debut };
}
