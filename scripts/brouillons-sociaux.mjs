/**
 * Prépare dans Buffer les posts éditoriaux d'une semaine, en BROUILLONS DATÉS.
 *
 * Entrée : `data/social/<lundi>.json` (format décrit dans lib/brouillons.mjs),
 * écrit chaque samedi par la routine de rédaction, ou à la main.
 *
 * Circuit voulu par Julian (28/09/2026) : les brouillons arrivent dans Buffer
 * avec leur date, il les relit et clique « Schedule Post ». Un brouillon ne
 * part JAMAIS tout seul : c'est le contrôle (semaine-sociale.mjs --controle)
 * qui prévient quand un brouillon daté approche sans avoir été programmé.
 *
 *   node scripts/brouillons-sociaux.mjs --valider                 # règles seules, aucun réseau
 *   node scripts/brouillons-sociaux.mjs --phase=visuels           # génère les images manquantes
 *   node scripts/brouillons-sociaux.mjs --phase=attendre          # attend que Vercel les serve
 *   node scripts/brouillons-sociaux.mjs --phase=brouillons        # crée les brouillons + email
 *   node scripts/brouillons-sociaux.mjs --phase=brouillons --dry-run
 *
 * Options : --fichier=data/social/AAAA-MM-JJ.json (sinon tous), --force (visuels)
 * Variables : BUFFER_API_KEY, RESEND_API_KEY
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contexte, listerPosts, creerPost } from './lib/buffer.mjs';
import {
  valider, construireEnvoi, fichierVisuel, urlVisuel, texteX,
} from './lib/brouillons.mjs';
import {
  CRENEAUX, PILIERS, heureParisVersIso, jourParis, ajouterJours, repartition,
} from './lib/semaine-sociale.mjs';
import { envoyerEmail, echapperHtml, gabarit } from './lib/email.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER_DONNEES = join(RACINE, 'data', 'social');
const DOSSIER_IMAGES = join(RACINE, 'public', 'assets', 'social');
const RESEAUX = ['twitter', 'instagram'];

const args = process.argv.slice(2);
const option = (nom) => (args.find((a) => a.startsWith(`--${nom}=`)) || '').split('=').slice(1).join('=');
const drapeau = (nom) => args.includes(`--${nom}`);
const PHASE = option('phase');
const SEC = drapeau('dry-run');

const maintenant = new Date().toISOString();

function fichiers() {
  const un = option('fichier');
  if (un) return [resolve(un)];
  if (!existsSync(DOSSIER_DONNEES)) return [];
  return readdirSync(DOSSIER_DONNEES).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().map((f) => join(DOSSIER_DONNEES, f));
}

function lire(chemin) {
  return { chemin, donnees: JSON.parse(readFileSync(chemin, 'utf8')) };
}

const enregistrer = ({ chemin, donnees }) => writeFileSync(chemin, JSON.stringify(donnees, null, 2) + '\n');

/* Un post est « à traiter » tant qu'un réseau n'a pas son brouillon ET que son
   jour n'est pas passé. Un fichier déjà traité ne fait donc rien de plus. */
function aTraiter(post) {
  const demain = ajouterJours(jourParis(maintenant), 1);
  return post.jour >= demain && RESEAUX.some((r) => !(post.buffer && post.buffer[r]));
}

function heureDe(post, reseau) {
  return heureParisVersIso(post.jour, (post[reseau] && post[reseau].heure) || CRENEAUX[reseau]);
}

/* ── Validation ────────────────────────────────────────────── */

function validerTout(lots) {
  let erreurs = 0;
  for (const { chemin, donnees } of lots) {
    const r = valider(donnees, { maintenant });
    const nom = chemin.split(/[\\/]/).pop();
    if (r.erreurs.length) {
      erreurs += r.erreurs.length;
      for (const e of r.erreurs) console.error(`::error file=data/social/${nom}::${e}`);
    } else {
      const rep = repartition(donnees.posts);
      console.log(`✅ ${nom} : ${donnees.posts.length} post(s), répartition ${JSON.stringify(rep)}`);
    }
  }
  return erreurs;
}

/* ── Exécution ─────────────────────────────────────────────── */

/* Une semaine entièrement passée n'a plus rien à préparer : la valider ferait
   échouer chaque passage suivant sur un vieux fichier. --fichier force le choix. */
const actif = ({ donnees }) => option('fichier')
  || !/^\d{4}-\d{2}-\d{2}$/.test((donnees && donnees.semaine) || '')   /* laissé à la validation, qui le signale */
  || ajouterJours(donnees.semaine, 6) >= jourParis(maintenant);
const lots = fichiers().map(lire).filter(actif);
if (lots.length === 0) {
  console.log('Aucun fichier data/social/*.json, rien à faire.');
  process.exit(0);
}

if (drapeau('valider') || !PHASE) {
  process.exit(validerTout(lots) ? 1 : 0);
}

/* Toute phase qui écrit ou qui envoie commence par refuser un fichier fautif. */
if (validerTout(lots)) process.exit(1);

const travail = lots.flatMap((lot) => lot.donnees.posts.filter(aTraiter).map((post) => ({ lot, post })));
if (travail.length === 0) {
  console.log('Rien à traiter : chaque post a déjà ses brouillons ou son jour est passé.');
  process.exit(0);
}

if (PHASE === 'visuels') {
  /* Import DYNAMIQUE : sharp n'est nécessaire qu'ici. La validation doit tourner
     dans un worktree nu, sans node_modules (routine du samedi). */
  const { genererVisuel } = await import('./lib/visuel-social.mjs');
  mkdirSync(join(DOSSIER_IMAGES, 'semaine'), { recursive: true });
  let faits = 0;
  for (const { post } of travail) {
    for (const reseau of RESEAUX) {
      const sortie = join(DOSSIER_IMAGES, fichierVisuel(post, reseau));
      if (existsSync(sortie) && !drapeau('force')) continue;
      writeFileSync(sortie, await genererVisuel(post.visuel, post.licence, reseau));
      console.log(`🖼️  ${fichierVisuel(post, reseau)}`);
      faits++;
    }
  }
  console.log(faits ? `${faits} visuel(s) généré(s).` : 'Tous les visuels existent déjà.');
  process.exit(0);
}

if (PHASE === 'attendre') {
  /* `fetch` suit les redirections tout seul : pas de piège du 307 sur l'apex
     qui a fait échouer trois passages de cote-hebdo le 27 août 2026. */
  const urls = travail.flatMap(({ post }) => RESEAUX.map((r) => urlVisuel(post, r)));
  const debut = Date.now();
  let restantes = [...urls];
  while (restantes.length && Date.now() - debut < 12 * 60 * 1000) {
    const encore = [];
    for (const u of restantes) {
      const rep = await fetch(u, { method: 'HEAD' }).catch(() => null);
      if (!rep || rep.status !== 200) encore.push(u);
    }
    restantes = encore;
    if (restantes.length) await new Promise((ok) => setTimeout(ok, 10000));
  }
  if (restantes.length) {
    console.error(`::error::Visuels toujours non servis après 12 min : ${restantes.join(', ')}`);
    process.exit(1);
  }
  console.log(`Les ${urls.length} visuel(s) sont servis après ${Math.round((Date.now() - debut) / 1000)} s.`);
  process.exit(0);
}

if (PHASE === 'brouillons') {
  if (SEC) {
    for (const { post } of travail) {
      for (const reseau of RESEAUX) {
        if (post.buffer && post.buffer[reseau]) continue;
        const e = construireEnvoi(post, reseau, heureDe(post, reseau));
        console.log(`\n[dry-run] ${reseau} · ${post.id} · ${e.dueAt}\n${e.texte}\n(image : ${e.image})`);
      }
    }
    process.exit(0);
  }

  const { organisation, canaux } = await contexte();
  const jours = travail.map(({ post }) => post.jour).sort();
  const existants = await listerPosts({
    organisation,
    statuts: ['draft', 'scheduled'],
    debut: `${ajouterJours(jours[0], -1)}T00:00:00Z`,
    fin: `${ajouterJours(jours[jours.length - 1], 2)}T00:00:00Z`,
  });

  const crees = [];
  const echecs = [];
  for (const { lot, post } of travail) {
    post.buffer = post.buffer || {};
    for (const reseau of RESEAUX) {
      if (post.buffer[reseau]) continue;
      const canal = canaux[reseau];
      if (!canal) { console.log(`-  ${reseau} : non connecté, ignoré.`); continue; }
      const envoi = construireEnvoi(post, reseau, heureDe(post, reseau));

      /* Reprise après échec : si un brouillon identique existe déjà (même canal,
         même heure, même texte), on l'ADOPTE au lieu d'en créer un second. */
      const doublon = existants.find((p) => p.channelId === canal
        && new Date(p.dueAt).getTime() === new Date(envoi.dueAt).getTime()
        && (p.text || '').trim() === envoi.texte.trim());
      if (doublon) {
        post.buffer[reseau] = doublon.id;
        enregistrer(lot);
        console.log(`↩️  ${reseau} · ${post.id} : brouillon déjà présent (${doublon.id}), adopté.`);
        continue;
      }

      try {
        const p = await creerPost({ canal, texte: envoi.texte, image: envoi.image, alt: envoi.alt, dueAt: envoi.dueAt, brouillon: true, metadata: envoi.metadata });
        post.buffer[reseau] = p.id;
        /* Écrit tout de suite : un échec plus loin ne doit pas faire recréer ce brouillon. */
        enregistrer(lot);
        crees.push({ post, reseau, id: p.id, dueAt: envoi.dueAt });
        console.log(`✅ ${reseau} · ${post.id} : ${p.status} pour le ${p.dueAt}`);
      } catch (e) {
        console.error(`❌ ${reseau} · ${post.id} : ${e.message}`);
        echecs.push(`${reseau} ${post.id}`);
      }
    }
  }

  if (crees.length) {
    const jourFr = (j) => new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${j}T12:00:00Z`));
    const parPost = new Map();
    for (const c of crees) parPost.set(c.post.id, c.post);
    const cartes = [...parPost.values()].map((post) => `<tr><td style="padding:18px 24px;border-bottom:1px solid #232a3a;">
      <div style="font-size:15px;color:#e6ebf5;font-weight:bold;">${echapperHtml(jourFr(post.jour))} · ${echapperHtml(PILIERS[post.pilier].libelle)}</div>
      <div style="font-size:12px;color:#7c879c;padding:2px 0 10px;">${echapperHtml(post.licence)}</div>
      <img src="${urlVisuel(post, 'twitter')}" width="480" style="max-width:100%;border-radius:8px;" alt="">
      <div style="font-size:13px;color:#c9d2e6;padding-top:10px;white-space:pre-wrap;"><b>X</b> : ${echapperHtml(texteX(post))}</div>
      <div style="font-size:13px;color:#c9d2e6;padding-top:8px;white-space:pre-wrap;"><b>Instagram</b> : ${echapperHtml(post.instagram.texte)}</div>
    </td></tr>`).join('');
    const liens = RESEAUX.filter((r) => canaux[r]).map((r) => `<a href="https://publish.buffer.com/channels/${canaux[r]}/drafts" style="color:#2997ff;">${r === 'twitter' ? 'Brouillons X' : 'Brouillons Instagram'}</a>`).join(' · ');
    const corps = `${cartes}<tr><td style="padding:18px 24px;font-size:13px;color:#c9d2e6;line-height:1.6;">
      <b>À faire :</b> ouvre l'onglet Drafts de Buffer, relis, puis clique <b>Schedule Post</b> sur chaque brouillon (ou dans la vue All Channels, ou sur mobile).
      Un brouillon <b>ne part pas tout seul</b>. Tu seras prévenu si l'un d'eux approche sans avoir été programmé.<br><br>${liens}
    </td></tr>`;
    const sujet = `${crees.length} brouillon${crees.length > 1 ? 's' : ''} à programmer dans Buffer`;
    const texte = `${sujet}\n\n${[...parPost.values()].map((p) => `- ${jourFr(p.jour)} (${PILIERS[p.pilier].libelle})`).join('\n')}\n\nBuffer, onglet Drafts : Schedule Post sur chacun.`;
    await envoyerEmail({ sujet, texte, html: gabarit({ titre: 'Posts de la semaine à valider', couleur: '#2997ff', corps }) });
  }

  if (echecs.length) {
    console.error(`::error::Échec sur : ${echecs.join(', ')}`);
    process.exit(1);
  }
  console.log(`${crees.length} brouillon(s) créé(s).`);
  process.exit(0);
}

console.error(`Phase inconnue : ${PHASE}`);
process.exit(1);
