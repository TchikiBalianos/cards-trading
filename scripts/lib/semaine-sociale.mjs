/*
  Cœur PUR du pipeline social : aucun réseau, aucune lecture de fichier.
  Tout ce qui décide (quel jour, quelle licence, quelle anomalie) vit ici pour
  pouvoir être testé sans Buffer.

  Grille éditoriale, un post par réseau et par jour. Les jours restants sont
  remplis par les automatisations existantes :
    mercredi  relais de l'article du mardi (annonce-buffer)
    vendredi  top des hausses (cote-hebdo)
    samedi    relais de l'article du vendredi (annonce-buffer)
  Le lundi, le mardi, le jeudi et le dimanche appartiennent donc à l'éditorial.
*/

import { semaineNo, planSemaine } from '../prochain-article.mjs';

export const FUSEAU = 'Europe/Paris';

/* Créneaux dans les plages validées par Julian (X 9h-11h, Instagram 11h-16h). */
export const CRENEAUX = { twitter: '10:20', instagram: '11:30' };

/* Le plan gratuit de Buffer plafonne à 10 posts programmés PAR canal. */
export const QUOTA_BUFFER = 10;
export const SEUIL_QUOTA = 8;

export const PILIERS = {
  cote: { libelle: 'Ça vaut combien ?', consigne: 'cote sourcée d’une carte ou d’un produit, jamais de chiffre inventé' },
  actu: { libelle: 'Actu', consigne: 'révélation, calendrier, anecdote cachée, avec source' },
  communaute: { libelle: 'Humour et communauté', consigne: 'post cité, question, « cette sensation quand… »' },
  coulisses: { libelle: 'Coulisses', consigne: 'build in public : ce qui avance sur Cards-Trading, chiffres vérifiés' },
};

/* ── Fuseau de Paris ───────────────────────────────────────── */

/* Décalage de Paris par rapport à UTC, en minutes, à un instant donné.
   Passer par Intl évite de coder en dur l'heure d'été : le passage à l'heure
   d'hiver tombe le dimanche 25 octobre 2026, en pleine période utile. */
export function decalageParis(instantMs) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSEAU, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instantMs));
  const v = (t) => Number(parts.find((p) => p.type === t).value);
  const commeUtc = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second'));
  return Math.round((commeUtc - instantMs) / 60000);
}

/* « 2026-10-01 » + « 10:20 » (heure de Paris) → instant ISO en UTC. */
export function heureParisVersIso(jour, hhmm) {
  const [a, m, j] = jour.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const naif = Date.UTC(a, m - 1, j, h, mi);
  let t = naif - decalageParis(naif) * 60000;
  /* Deuxième passe : le décalage se lit à l'instant CORRIGÉ, pas à l'instant naïf,
     sinon un créneau proche du changement d'heure tombe une heure à côté. */
  t = naif - decalageParis(t) * 60000;
  return new Date(t).toISOString();
}

/* Instant ISO → jour civil à Paris (« 2026-10-01 »). */
export function jourParis(iso) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(iso));
  const v = (t) => parts.find((p) => p.type === t).value;
  return `${v('year')}-${v('month')}-${v('day')}`;
}

export function ajouterJours(jour, n) {
  const [a, m, j] = jour.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10);
}

export function lundiDe(jour) {
  const [a, m, j] = jour.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  return ajouterJours(jour, -((d.getUTCDay() + 6) % 7));
}

/* ── Plan éditorial ────────────────────────────────────────── */

/*
  La licence du mardi est l'OPPOSÉE de l'article de blog du mardi, et le jeudi
  reprend la même : sur deux semaines, Pokémon garde environ 70 % des posts
  éditoriaux et One Piece le reste, sans qu'aucun état ne soit stocké.
*/
export function planEditorial(lundi) {
  const ancre = planSemaine(semaineNo(new Date(`${lundi}T00:00:00Z`))).articles[0].categorie;
  const autre = ancre === 'pokemon' ? 'one-piece' : 'pokemon';
  return [
    { jour: ajouterJours(lundi, 0), pilier: 'cote', licence: 'pokemon' },
    { jour: ajouterJours(lundi, 1), pilier: 'actu', licence: autre },
    { jour: ajouterJours(lundi, 3), pilier: 'communaute', licence: autre },
    { jour: ajouterJours(lundi, 6), pilier: 'coulisses', licence: 'mixte' },
  ].map((c) => ({
    ...c,
    id: `${c.jour}-${c.pilier}`,
    creneaux: {
      twitter: heureParisVersIso(c.jour, CRENEAUX.twitter),
      instagram: heureParisVersIso(c.jour, CRENEAUX.instagram),
    },
  }));
}

/* Répartition des licences sur les créneaux d'un fichier de semaine. */
export function repartition(posts) {
  const c = {};
  for (const p of posts) c[p.licence] = (c[p.licence] || 0) + 1;
  return c;
}

/* ── Contrôle ──────────────────────────────────────────────── */

const SERVICES = ['twitter', 'instagram'];
const EN_ATTENTE = new Set(['draft', 'needs_approval']);
const PART_OU_PARTI = new Set(['scheduled', 'sending', 'sent']);

/*
  `posts` : { id, status, dueAt, channelService } lus dans Buffer.
  Renvoie une liste d'anomalies, vide si tout va bien. Trois familles :

  - brouillon_perime / brouillon_non_valide : un brouillon daté ne part JAMAIS
    tout seul, c'est le piège du circuit « validation dans Buffer ». Le seul
    signal qui compte est donc : un brouillon dont l'heure approche.
  - manquant : un jour éditorial sans aucun post sur un réseau.
  - doublon : deux posts le même jour sur le même réseau.
  - echec : Buffer a refusé ou raté un post récent (statut « error »). Les posts
    de Julian sur TikTok sont hors périmètre, seuls X et Instagram sont lus.
  - quota : la file approche des 10 posts, au-delà les relais automatiques
    échouent en LimitReachedError.
*/
/*
  « manquant » ne regarde que les 2 prochains jours. Plus loin, l'alerte serait
  du bruit : la semaine suivante n'est écrite que le samedi par la routine, et
  un vendredi soir « lundi est vide » est normal. Le samedi et le dimanche, c'est
  l'absence du FICHIER de la semaine qui prévient (semaine-sociale.mjs).
*/
export function analyser({ posts, maintenant, horizonJours = 8, horizonManquant = 2, editorial = true }) {
  const anomalies = [];
  const aujourdhui = jourParis(maintenant);
  const fin = ajouterJours(aujourdhui, horizonJours);
  const jourSuivant = ajouterJours(aujourdhui, 1);

  for (const service of SERVICES) {
    const duReseau = posts.filter((p) => p.channelService === service && p.dueAt);
    const parJour = {};
    for (const p of duReseau) (parJour[jourParis(p.dueAt)] ||= []).push(p);

    for (const p of duReseau) {
      if (p.status === 'error' && new Date(p.dueAt) > new Date(new Date(maintenant).getTime() - 3 * 86400000)) {
        anomalies.push({ type: 'echec', service, jour: jourParis(p.dueAt), id: p.id });
      }
      if (!EN_ATTENTE.has(p.status)) continue;
      const j = jourParis(p.dueAt);
      if (new Date(p.dueAt) <= new Date(maintenant)) {
        anomalies.push({ type: 'brouillon_perime', service, jour: j, id: p.id });
      } else if (j <= jourSuivant) {
        anomalies.push({ type: 'brouillon_non_valide', service, jour: j, id: p.id });
      }
    }

    for (const [jour, liste] of Object.entries(parJour)) {
      if (jour < aujourdhui || jour > fin) continue;
      /* Un brouillon périmé ne compte pas : il ne partira pas. */
      const vivants = liste.filter((p) => PART_OU_PARTI.has(p.status) || (EN_ATTENTE.has(p.status) && new Date(p.dueAt) > new Date(maintenant)));
      if (vivants.length > 1) anomalies.push({ type: 'doublon', service, jour, ids: vivants.map((p) => p.id) });
    }

    if (editorial) {
      for (let i = 1; i <= horizonManquant; i++) {
        const jour = ajouterJours(aujourdhui, i);
        const iso = new Date(`${jour}T12:00:00Z`).getUTCDay(); // 0 = dimanche
        const editorialJour = [1, 2, 4, 0].includes(iso);
        if (editorialJour && !(parJour[jour] || []).length) {
          anomalies.push({ type: 'manquant', service, jour });
        }
      }
    }

    const files = duReseau.filter((p) => p.status === 'scheduled').length;
    if (files >= SEUIL_QUOTA) anomalies.push({ type: 'quota', service, file: files, plafond: QUOTA_BUFFER });
  }
  return anomalies;
}

const LIBELLES = {
  echec: (a) => `${nomService(a.service)} : le post du ${a.jour} est en erreur dans Buffer, il n'est pas parti.`,
  semaine_absente: (a) => `Aucun fichier data/social/${a.semaine}.json : la semaine du ${a.semaine} n'est pas préparée.`,
  brouillon_perime: (a) => `${nomService(a.service)} : brouillon du ${a.jour} jamais programmé, son heure est passée, il ne partira pas.`,
  brouillon_non_valide: (a) => `${nomService(a.service)} : brouillon du ${a.jour} pas encore programmé dans Buffer, il ne partira pas sans ton clic.`,
  manquant: (a) => `${nomService(a.service)} : aucun post prévu le ${a.jour}.`,
  doublon: (a) => `${nomService(a.service)} : ${a.ids.length} posts le même jour (${a.jour}).`,
  quota: (a) => `${nomService(a.service)} : ${a.file} posts en file sur ${a.plafond} autorisés, les relais automatiques risquent d'être refusés.`,
};

export function nomService(s) {
  return s === 'twitter' ? 'X' : s === 'instagram' ? 'Instagram' : s;
}

export function decrire(anomalie) {
  return LIBELLES[anomalie.type](anomalie);
}
