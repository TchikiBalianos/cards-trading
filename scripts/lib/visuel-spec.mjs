/*
  Vérification des spécifications de visuel, SANS dépendance : ni sharp ni
  accès réseau. Séparée de visuel-social.mjs pour que la validation d'un fichier
  de semaine tourne partout, y compris dans un worktree jetable sans
  node_modules (c'est le cas de la routine du samedi).
*/

export const TYPES_VISUEL = ['texte', 'carte', 'photo'];

export function verifierSpec(spec) {
  if (!spec || !TYPES_VISUEL.includes(spec.type)) throw new Error(`Type de visuel inconnu : ${spec && spec.type}`);
  if (spec.type === 'photo' && !spec.credit) throw new Error('Visuel photo sans crédit : refusé (règle : toujours créditer).');
  if (spec.type !== 'photo' && !spec.titre) throw new Error(`Visuel « ${spec.type} » sans titre.`);
  if ((spec.type === 'photo' || spec.type === 'carte') && !spec.image) throw new Error(`Visuel « ${spec.type} » sans image source.`);
  if (spec.image && !/^https:\/\//.test(spec.image)) throw new Error('Image source : lien https attendu.');
}
