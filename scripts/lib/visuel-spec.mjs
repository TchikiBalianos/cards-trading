/*
  Vérification des spécifications de visuel, SANS dépendance : ni sharp ni
  accès réseau. Séparée de visuel-social.mjs pour que la validation d'un fichier
  de semaine tourne partout, y compris dans un worktree jetable sans
  node_modules (c'est le cas de la routine du samedi).

  `bip` : la carte numérotée des posts Build in Public (voir carte-bip.mjs, pur
  lui aussi : il ne dépend que de charte.mjs et motifs.mjs).
*/

import { verifierBip } from './carte-bip.mjs';

export const TYPES_VISUEL = ['texte', 'carte', 'photo', 'bip'];

/* Hébergeurs dont la licence n'exige pas de créditer l'auteur. Licence Unsplash
   lue le 14/10/2026 : usage commercial libre, « aucune permission requise »,
   l'attribution est seulement appréciée (Unsplash+ est servi par un autre hôte,
   et reste donc crédité). Pour ces photos, le crédit quitte le visuel X mais reste
   sur celui d'Instagram (décision de Julian, 14/10/2026). Le `credit` reste exigé
   dans la spec : on sait toujours qui a pris la photo. */
export const HOTES_CREDIT_FACULTATIF = ['images.unsplash.com'];

export function creditObligatoire(spec) {
  try {
    return !HOTES_CREDIT_FACULTATIF.includes(new URL(spec.image).hostname);
  } catch {
    return true;
  }
}

export function verifierSpec(spec) {
  if (!spec || !TYPES_VISUEL.includes(spec.type)) throw new Error(`Type de visuel inconnu : ${spec && spec.type}`);
  if (spec.type === 'photo' && !spec.credit) throw new Error('Visuel photo sans crédit : refusé (règle : toujours créditer).');
  if (spec.type !== 'photo' && !spec.titre) throw new Error(`Visuel « ${spec.type} » sans titre.`);
  if ((spec.type === 'photo' || spec.type === 'carte') && !spec.image) throw new Error(`Visuel « ${spec.type} » sans image source.`);
  if (spec.image && !/^https:\/\//.test(spec.image)) throw new Error('Image source : lien https attendu.');
  if (spec.type === 'bip') verifierBip(spec);
}
