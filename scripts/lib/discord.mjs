/*
  Envoi vers un webhook Discord, en TROIS issues au lieu de deux.

    ok         Discord a répondu 2xx : le message existe (son identifiant
               est journalisé grâce à ?wait=true).
    incertain  Discord a pu publier sans répondre : HTTP 504, délai dépassé,
               connexion coupée après l'envoi, et par prudence toute erreur
               réseau qu'on ne sait pas situer avant l'envoi.
    echec      Rien n'est parti, de façon certaine ou présumée : 4xx
               (webhook supprimé, contenu refusé, 429 rejeté avant
               traitement), 500, 502, 503 (présumé : seuls des 504 ont été
               observés), URL invalide, redirection, ou connexion jamais
               établie (DNS, refus, réseau injoignable, délai de connexion,
               certificat).

  Pourquoi pas deux issues : trois 504 sur trois avaient bel et bien publié
  le message (10 et 15 septembre, 1er octobre 2026), réponse perdue au bout
  de 30 s par la passerelle de Discord. Compté comme un échec, le 504 a
  fait passer deux tops des hausses pour ratés, et surtout fait republier
  le 18 septembre une annonce déjà en ligne : annonce-discord ne mémorisait
  un article qu'en cas de succès.

  ⚠️ JAMAIS de nouvelle tentative automatique. Les webhooks Discord n'ont
  pas de clé d'idempotence : relancer après un 504 aurait doublé les trois
  messages. Un « incertain » se vérifie à l'œil dans le salon.

  ⚠️ Un « incertain » n'est pas un succès. L'appelant doit envoyer l'email
  (signalerIncertain) ET faire échouer l'étape si cet email n'est pas
  parti : un avertissement dans un passage vert, personne ne le lit.
*/

import { createHash } from 'node:crypto';
import { DESTINATAIRE } from './email.mjs';

/* Erreurs levées AVANT que la requête parte : rien n'a pu être publié. */
const AVANT_ENVOI = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
]);
const estAvantEnvoi = (code) => AVANT_ENVOI.has(code) || /^(CERT_|ERR_TLS_)/.test(code || '');

/* Au-delà des 30 s après lesquelles la passerelle de Discord abandonne. */
export const DELAI_MS = 60_000;

/* Classe une réponse HTTP reçue. */
export function classerStatut(statut) {
  if (statut >= 200 && statut < 300) return 'ok';
  if (statut === 504) return 'incertain';
  return 'echec';
}

/* Classe une exception levée par fetch (aucune réponse reçue). */
export function classerErreur(e, delaiMs = DELAI_MS) {
  if (e?.name === 'TimeoutError') return { etat: 'incertain', detail: `pas de réponse en ${delaiMs / 1000} s` };
  const cause = e?.cause;
  /* redirect: 'error' : on n'a rien posté, fetch a refusé de suivre. */
  if (/redirect/i.test(cause?.message || '')) return { etat: 'echec', detail: 'redirection refusée' };
  /* Double pile IPv4/IPv6 : une erreur par adresse, toutes avant l'envoi. */
  const codes = Array.isArray(cause?.errors) && cause.errors.length
    ? cause.errors.map((x) => x?.code)
    : [cause?.code || e?.code];
  if (codes.every(estAvantEnvoi)) return { etat: 'echec', detail: codes.join(', ') };
  return { etat: 'incertain', detail: codes.filter(Boolean).join(', ') || e?.message || String(e) };
}

/* Ajoute wait=true sans perdre un éventuel ?thread_id= déjà présent. */
export function urlAvecAttente(webhook) {
  const url = new URL(webhook);
  url.searchParams.set('wait', 'true');
  return url.toString();
}

/*
  Résumé lisible d'un corps d'erreur. Le 504 de Discord est une page HTML
  Cloudflare sur plusieurs lignes : brute, elle coupait l'annotation
  GitHub après « <!DOCTYPE html> » et remplissait l'email de balises.
*/
export function resumeCorps(corps) {
  const t = String(corps || '').trim();
  if (!t) return '';
  if (t.startsWith('<')) {
    const titre = t.match(/<title[^>]*>([^<]*)<\/title>/i);
    return titre ? titre[1].replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  }
  return t.replace(/\s+/g, ' ').slice(0, 200);
}

export async function envoyerDiscord(webhook, charge, { fetchImpl = fetch, delaiMs = DELAI_MS } = {}) {
  /* Hors du try : une URL invalide (secret collé sans https://) est un
     échec certain, pas une issue inconnue. */
  let url;
  try {
    url = urlAvecAttente(webhook);
  } catch {
    return { etat: 'echec', detail: 'URL de webhook invalide' };
  }
  let rep;
  try {
    rep = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(charge),
      /* Un POST redirigé deviendrait un GET, auquel le webhook répond 200 :
         un faux succès sans message. */
      redirect: 'error',
      signal: AbortSignal.timeout(delaiMs),
    });
  } catch (e) {
    return classerErreur(e, delaiMs);
  }
  const etat = classerStatut(rep.status);
  if (etat === 'ok') {
    const message = await rep.json().catch(() => null);
    return { etat, detail: message?.id ? `message ${message.id}` : `HTTP ${rep.status}` };
  }
  const resume = resumeCorps(await rep.text().catch(() => ''));
  return { etat, detail: `HTTP ${rep.status}${resume ? ` (${resume})` : ''}` };
}

/*
  Signale un « incertain » par email. La clé d'idempotence porte le script,
  le jour ET une empreinte du texte : rejouer la même étape ne renvoie pas
  l'email, mais un second incident le même jour (autre article) en envoie
  bien un second. Sans l'empreinte, Resend répondait 409 et ce second
  signal était perdu.

  Renvoie true seulement si l'email est parti (ou l'était déjà). L'appelant
  doit faire échouer l'étape sinon.
*/
export async function signalerIncertain({ script, salon, detail, contenu, consigne, fetchImpl = fetch }) {
  const cle = process.env.RESEND_API_KEY;
  if (!cle) {
    console.log('::error::RESEND_API_KEY absente : le Discord incertain ne peut pas être signalé par email.');
    return false;
  }
  const jour = new Date().toISOString().slice(0, 10);
  const empreinte = createHash('sha256').update(String(contenu)).digest('hex').slice(0, 16);
  const texte =
    `Discord n'a pas confirmé la publication (${detail}).\n\n` +
    `Dans les cas observés, le message était quand même publié. Regarde ${salon} : ` +
    `s'il y est, il n'y a rien à faire. S'il manque, colle le texte ci-dessous à la main.\n\n` +
    (consigne ? `${consigne}\n\n` : '') +
    `Texte prévu :\n\n${contenu}\n`;
  try {
    const rep = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cle}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `discord-incertain/${script}/${jour}/${empreinte}`,
      },
      body: JSON.stringify({
        from: 'Cards Trading <contact@cards-trading.com>',
        to: [DESTINATAIRE],
        subject: `Discord à vérifier : ${script} du ${jour}`,
        text: texte,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (rep.status === 409) {
      /* Même clé, donc même texte : déjà signalé (ou requête concurrente). */
      console.log('Email de vérification Discord déjà envoyé pour ce texte (409).');
      return true;
    }
    if (!rep.ok) {
      console.log(`::error::Resend a répondu ${rep.status} : email de vérification Discord non envoyé.`);
      return false;
    }
    console.log('Email de vérification Discord envoyé.');
    return true;
  } catch (e) {
    console.log(`::error::Email de vérification Discord non envoyé : ${e.message}`);
    return false;
  }
}
