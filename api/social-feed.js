/**
 * /api/social-feed — Dernier post tous réseaux confondus
 *
 * Récupère le post le plus récent parmi toutes les plateformes configurées
 * (X, Instagram, + futures). Chaque plateforme nécessite un token en env var.
 * Résultat caché 1h au CDN.
 *
 * GET /api/social-feed → { platform, text, date, image?, url, handle }
 *
 * Env vars requises :
 *   TWITTER_BEARER_TOKEN  — X/Twitter API v2
 *   INSTAGRAM_TOKEN       — Instagram Graph API (long-lived token)
 */

/* ── FETCHERS PAR PLATEFORME ─────────────────────────────── */

async function fetchLatestTweet() {
  const token = process.env.TWITTER_BEARER_TOKEN;
  if (!token) return null;

  try {
    // 1. Récupérer l'ID utilisateur
    const userRes = await fetch(
      'https://api.twitter.com/2/users/by/username/CardsTradingCom',
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!userRes.ok) return null;
    const userData = await userRes.json();
    const userId = userData.data?.id;
    if (!userId) return null;

    // 2. Récupérer le dernier tweet
    const tweetsRes = await fetch(
      `https://api.twitter.com/2/users/${userId}/tweets?max_results=5&tweet.fields=created_at,text,attachments&expansions=attachments.media_keys&media.fields=url,preview_image_url,type`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!tweetsRes.ok) return null;
    const tweetsData = await tweetsRes.json();

    const tweet = tweetsData.data?.[0];
    if (!tweet) return null;

    // Image attachée ?
    let image = null;
    if (tweet.attachments?.media_keys?.length && tweetsData.includes?.media) {
      const media = tweetsData.includes.media.find(
        (m) => m.media_key === tweet.attachments.media_keys[0]
      );
      if (media) image = media.url || media.preview_image_url || null;
    }

    return {
      platform: 'x',
      text: tweet.text,
      date: tweet.created_at,
      image,
      url: `https://x.com/CardsTradingCom/status/${tweet.id}`,
      handle: '@CardsTradingCom',
    };
  } catch (e) {
    console.error('Twitter fetch error:', e.message);
    return null;
  }
}

async function fetchLatestInstagram() {
  const token = process.env.INSTAGRAM_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch(
      `https://graph.instagram.com/me/media?fields=id,caption,timestamp,media_url,permalink,media_type&limit=1&access_token=${token}`
    );
    if (!res.ok) return null;
    const data = await res.json();

    const post = data.data?.[0];
    if (!post) return null;

    return {
      platform: 'instagram',
      text: post.caption || '',
      date: post.timestamp,
      image: post.media_type !== 'VIDEO' ? post.media_url : null,
      url: post.permalink,
      handle: '@CardsTradingCom',
    };
  } catch (e) {
    console.error('Instagram fetch error:', e.message);
    return null;
  }
}

/*
 * ── AJOUTER DE NOUVELLES PLATEFORMES ──
 *
 * Pour ajouter un réseau, créer une fonction async qui retourne :
 *   { platform: string, text: string, date: ISO string, image?: string, url: string, handle: string }
 * ou null si indisponible, puis l'ajouter au tableau `fetchers` ci-dessous.
 *
 * Exemples futurs :
 *   async function fetchLatestTikTok() { ... }
 *   async function fetchLatestLinkedIn() { ... }
 */

const fetchers = [fetchLatestTweet, fetchLatestInstagram];

/* ── HANDLER ─────────────────────────────────────────────── */

export default async function handler(req, res) {
  res.setHeader(
    'Cache-Control',
    'public, s-maxage=3600, stale-while-revalidate=600'
  );

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Fetch tous les réseaux en parallèle
  const results = await Promise.all(fetchers.map((fn) => fn()));
  const posts = results.filter(Boolean);

  if (posts.length === 0) {
    return res.status(200).json({ post: null });
  }

  // Trier par date décroissante → le plus récent en premier
  posts.sort((a, b) => new Date(b.date) - new Date(a.date));

  return res.status(200).json({ post: posts[0] });
}
