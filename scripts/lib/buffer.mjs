/*
  Client Buffer partagé par le pipeline social (brouillons, contrôle).

  ⚠️ `annonce-buffer.mjs` et `publie-cote.mjs` gardent chacun leur PROPRE copie
  du client, écrite avant celui-ci. Trois copies divergent : un correctif
  d'API doit être reporté dans les trois (le contournement de `channels` du
  27 août 2026 l'a déjà prouvé, une copie avait été oubliée). Ne les migrer
  vers ce module qu'avec un essai réel de chacun.
*/

const API = 'https://api.buffer.com/graphql';

export async function graphql(requete, variables) {
  const cle = process.env.BUFFER_API_KEY;
  if (!cle) throw new Error('BUFFER_API_KEY absente.');
  const rep = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: requete, variables }),
  });
  const j = await rep.json().catch(() => null);
  if (!rep.ok || !j || j.errors) {
    throw new Error(`Buffer a répondu ${rep.status} : ${JSON.stringify(j?.errors || j)}`);
  }
  return j.data;
}

/* Organisation et canaux résolus à l'exécution : reconnecter un compte lui
   donne un nouvel identifiant. Requête RACINE `channels`, l'autre chemin
   répond FORBIDDEN à une clé personnelle. */
export async function contexte() {
  const d = await graphql('{ account { organizations { id } } }');
  const organisation = d.account.organizations[0].id;
  const liste = await graphql(
    'query ($input: ChannelsInput!) { channels(input: $input) { id service isDisconnected } }',
    { input: { organizationId: organisation } },
  );
  const canaux = {};
  for (const c of liste.channels || []) if (!c.isDisconnected) canaux[c.service] = c.id;
  return { organisation, canaux };
}

/* Tous les posts d'une fenêtre, pagination comprise. */
export async function listerPosts({ organisation, statuts, debut, fin }) {
  const posts = [];
  let apres = null;
  do {
    const d = await graphql(
      `query ($input: PostsInput!, $after: String) {
         posts(first: 100, after: $after, input: $input) {
           pageInfo { hasNextPage endCursor }
           edges { node { id status dueAt channelService channelId text } }
         }
       }`,
      {
        after: apres,
        input: {
          organizationId: organisation,
          filter: { status: statuts, dueAt: { start: debut, end: fin } },
          sort: [{ field: 'dueAt', direction: 'asc' }],
        },
      },
    );
    posts.push(...d.posts.edges.map((e) => e.node));
    apres = d.posts.pageInfo.hasNextPage ? d.posts.pageInfo.endCursor : null;
  } while (apres);
  return posts;
}

/*
  Crée un post daté. `brouillon: true` le crée en brouillon DATÉ : il garde son
  heure mais ne part qu'après le clic « Schedule Post » de Julian dans Buffer
  (onglet Drafts, vue All Channels ou appli mobile).

  Depuis août 2026, `createPost` renvoie une UNION : un refus arrive en donnée
  valide, jamais dans `errors`. Sans le contrôle du __typename, un post rejeté
  passerait pour un succès.
*/
export async function creerPost({ canal, texte, image, alt, dueAt, brouillon, metadata }) {
  const input = {
    channelId: canal,
    text: texte,
    assets: image ? [{ image: { url: image, metadata: { altText: alt || 'Visuel Cards-Trading' } } }] : [],
    mode: 'customScheduled',
    dueAt,
    needsApproval: false,
    schedulingType: 'automatic',
    ...(brouillon ? { saveToDraft: true } : {}),
    ...(metadata ? { metadata } : {}),
  };
  const d = await graphql(
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
    { input },
  );
  const r = d.createPost;
  if (r.__typename !== 'PostActionSuccess') {
    throw new Error(`${r.__typename}${r.code ? ' ' + r.code : ''} : ${r.message}`);
  }
  return r.post;
}

export async function supprimerPost(id) {
  const d = await graphql(
    'mutation ($input: DeletePostInput!) { deletePost(input: $input) { __typename } }',
    { input: { id } },
  );
  if (d.deletePost.__typename !== 'DeletePostSuccess') throw new Error(`Suppression refusée : ${d.deletePost.__typename}`);
}
