import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

/*
  /llms.txt — résumé du site en Markdown, destiné aux moteurs
  conversationnels (proposition llmstxt.org).

  À dire honnêtement : AUCUN moteur n'a confirmé publiquement consommer ce
  fichier. Perplexity, OpenAI et Google lisent le HTML. On l'expose quand
  même parce que le coût est nul et que le format se répand — mais ce
  n'est pas lui qui fait le référencement, c'est le balisage de la page.

  Généré à la construction plutôt que posé en dur dans `public/` : la
  liste des articles se périme sinon dès la publication suivante.
*/

const SITE = 'https://cards-trading.com';

export const GET: APIRoute = async () => {
  const articles = (await getCollection('blog', ({ data }) => !data.draft))
    .sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime());

  const lignes = [
    '# Cards-Trading',
    '',
    "> Place de marché française dédiée aux cartes à collectionner (TCG).",
    "> On y met une carte en vente en la scannant, et le paiement de",
    "> l'acheteur reste bloqué jusqu'à la réception. Éditée par Thugz Labs.",
    '',
    "La plateforme est en bêta fermée : l'inscription à la liste d'attente",
    'est ouverte, gratuite et sans engagement.',
    '',
    '## Ce qu’il faut savoir',
    '',
    '- **Jeux acceptés** : Pokémon, One Piece Card Game, Magic: The Gathering,',
    '  Yu-Gi-Oh!, Disney Lorcana, Dragon Ball Super, Riftbound,',
    '  Star Wars Unlimited. Cartes en français, anglais et japonais.',
    '- **Commission** : 3 % côté vendeur et 3 % côté acheteur, ramenés à 0 %',
    '  pendant toute la bêta. Ni frais de mise en vente, ni abonnement.',
    "- **Paiement** : bloqué jusqu'à réception de la carte, le vendeur est",
    '  payé une fois la livraison confirmée.',
    "- **Mise en vente** : par scan de la carte depuis l'application, sans",
    '  formulaire ni photo à cadrer.',
    '',
    '## Pages principales',
    '',
    `- [Accueil et inscription à la bêta](${SITE}/): présentation, comparatif`,
    '  avec les plateformes existantes, questions fréquentes, formulaire.',
    `- [Blog](${SITE}/blog/): actualité et analyse des marchés TCG.`,
    `- [Conditions générales](${SITE}/cgu.html)`,
    `- [Mentions légales](${SITE}/mentions-legales.html)`,
    '',
    '## Articles',
    '',
    ...articles.map(
      (a) =>
        `- [${a.data.title}](${SITE}/blog/${a.id}/): ${a.data.description}` +
        ` (${a.data.pubDate.toISOString().slice(0, 10)})`
    ),
    '',
  ];

  return new Response(lignes.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
