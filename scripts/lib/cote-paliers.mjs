/*
  Paliers du top des hausses : confirmer chaque hausse sur 7 jours, sans
  jamais rester muet.

  Décision de Julian du 5 octobre 2026, en deux moitiés.

  1. La moyenne des ventes des 7 derniers jours (`avg7`) doit confirmer la
     hausse, pour TOUTES les cartes. Jusque-là, seules les cartes sans cote
     TCGplayer y étaient soumises. Fin septembre, la moyenne sur 30 jours de
     Cardmarket est restée figée une semaine : Méga-Dracaufeu Y-ex et Mewtwo-ex
     de la Team Rocket portaient 346,37 € et 243,97 € le 24 septembre comme le
     1er octobre, au centime. Leur cote du jour comparée à cette base morte a
     fait publier +56 % et +41 %.

  2. Jamais de semaine sans top. On part du palier le plus strict et on
     n'assouplit que s'il ne donne pas trois cartes. La confirmation ne descend
     jamais à zéro : une carte dont les ventes de la semaine sont sous leur
     moyenne du mois ne monte pas, quoi qu'en dise sa cote du jour. Si même le
     dernier palier ne suffit pas, le workflow passe à l'autre marché.

  Mesuré le 13 octobre 2026 sur les 66 cartes cotées qui passent les filtres
  de prix et de liquidité : 0 carte au palier strict, 2 à l'intermédiaire,
  3 au souple, 6 au plancher. L'ancienne règle n'en retenait aucune.
*/

export const PALIERS = [
  { nom: 'strict', variation: 12, confirmation: 15 },
  { nom: 'intermédiaire', variation: 8, confirmation: 5 },
  { nom: 'souple', variation: 5, confirmation: 3 },
  { nom: 'plancher', variation: 3, confirmation: 1 },
];

export const PALIER_LE_PLUS_SOUPLE = PALIERS[PALIERS.length - 1];

/* Écart, en %, entre la moyenne des ventes sur 7 jours et la base sur 30 jours.
   null quand avg7 manque : la hausse n'est alors pas vérifiable. */
export function confirmationAvg7(avg7, reference) {
  if (!(avg7 > 0) || !(reference > 0)) return null;
  return (avg7 / reference - 1) * 100;
}

export function passeLePalier(candidat, palier) {
  return candidat.variationBrute >= palier.variation && candidat.confirmationBrute >= palier.confirmation;
}

/*
  Base sur 30 jours figée : la même carte a déjà été publiée avec EXACTEMENT
  la même moyenne sur 30 jours, un autre jour. Pour une carte qui s'échange,
  c'est impossible : la fenêtre glisse, la moyenne bouge. Le 1er octobre, ce
  contrôle aurait écarté Méga-Dracaufeu Y-ex et Mewtwo-ex de la Team Rocket.
*/
export function motifReferenceFigee(publications, reference, aujourdhui) {
  for (const p of publications || []) {
    if (p.date !== aujourdhui && p.reference === reference) {
      return `moyenne sur 30 jours figée (${reference} €, déjà la base publiée le ${p.date})`;
    }
  }
  return null;
}
