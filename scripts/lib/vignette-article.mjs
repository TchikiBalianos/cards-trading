/**
 * Nom de fichier de la vignette sociale d'un article, partagé par le générateur
 * (`scripts/vignettes-sociales.mjs`) et la page du blog (`src/pages/blog/[...slug].astro`).
 *
 * `/assets/` est servi en cache immuable d'un an : une vignette réécrite sous le
 * même nom ne serait revue par personne. Un article corrigé après publication
 * porte donc `vignetteVersion: 2` (puis 3…) dans son frontmatter, et sa vignette
 * prend le suffixe `-v2`, comme le `visuel.version` des posts sociaux.
 *
 * Le frontmatter arrive en nombre côté Astro et en texte côté générateur.
 */
export function nomVignette(slug, version, suffixe = '') {
  const v = Number(version);
  const marque = Number.isInteger(v) && v > 1 ? `-v${v}` : '';
  return `${slug}${marque}${suffixe}.png`;
}
