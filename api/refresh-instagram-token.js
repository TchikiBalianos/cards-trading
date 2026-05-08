/**
 * /api/refresh-instagram-token — Renouvellement automatique du token Instagram
 *
 * Appelé par le cron Vercel tous les 30 jours (bien avant l'expiration de 60j).
 * Peut aussi être appelé manuellement avec le CRON_SECRET en header.
 *
 * Flow :
 *   1. Rafraîchit le token via l'API Instagram
 *   2. Met à jour la variable INSTAGRAM_TOKEN dans Vercel via l'API Vercel
 *
 * Env vars requises :
 *   INSTAGRAM_TOKEN     — Token actuel (long-lived, 60 jours)
 *   VERCEL_TOKEN        — Token API Vercel (créé sur vercel.com/account/tokens)
 *   VERCEL_PROJECT_ID   — ID du projet Vercel (prj_...)
 *   VERCEL_TEAM_ID      — ID de l'équipe Vercel (team_...)
 *   CRON_SECRET         — Secret pour sécuriser l'endpoint (optionnel mais recommandé)
 */

export default async function handler(req, res) {
  /* ── Sécurité : vérifier l'appelant ────────────────────── */
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  /* ── Vérifier les env vars requises ────────────────────── */
  const currentToken = process.env.INSTAGRAM_TOKEN;
  const vercelToken = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;

  if (!currentToken) {
    return res.status(400).json({ error: 'INSTAGRAM_TOKEN non configuré' });
  }
  if (!vercelToken || !projectId) {
    return res.status(400).json({
      error: 'Variables manquantes',
      missing: [
        !vercelToken && 'VERCEL_TOKEN',
        !projectId && 'VERCEL_PROJECT_ID',
      ].filter(Boolean),
    });
  }

  const teamQuery = teamId ? `?teamId=${teamId}` : '';

  try {
    /* ── 1. Rafraîchir le token via Instagram API ────────── */
    console.log('[refresh-ig] Appel API Instagram pour rafraîchir le token...');

    const refreshRes = await fetch(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${currentToken}`
    );

    if (!refreshRes.ok) {
      const errBody = await refreshRes.text();
      console.error('[refresh-ig] Erreur Instagram:', errBody);
      return res.status(502).json({
        error: 'Échec du rafraîchissement Instagram',
        status: refreshRes.status,
        details: errBody,
      });
    }

    const refreshData = await refreshRes.json();
    const newToken = refreshData.access_token;
    const expiresIn = refreshData.expires_in; // secondes (5184000 = 60 jours)

    if (!newToken) {
      return res.status(502).json({
        error: 'Pas de token dans la réponse Instagram',
        data: refreshData,
      });
    }

    console.log(
      `[refresh-ig] Nouveau token obtenu, expire dans ${Math.round(expiresIn / 86400)} jours`
    );

    /* ── 2. Trouver l'env var INSTAGRAM_TOKEN dans Vercel ── */
    const envsRes = await fetch(
      `https://api.vercel.com/v9/projects/${projectId}/env${teamQuery}`,
      { headers: { Authorization: `Bearer ${vercelToken}` } }
    );

    if (!envsRes.ok) {
      const errBody = await envsRes.text();
      console.error('[refresh-ig] Erreur API Vercel (list envs):', errBody);
      return res.status(502).json({
        error: 'Impossible de lister les env vars Vercel',
        details: errBody,
      });
    }

    const envsData = await envsRes.json();
    const igEnv = envsData.envs?.find((e) => e.key === 'INSTAGRAM_TOKEN');

    /* ── 3. Mettre à jour (ou créer) la variable ─────────── */
    let updateRes;

    if (igEnv) {
      // PATCH l'existante
      updateRes = await fetch(
        `https://api.vercel.com/v9/projects/${projectId}/env/${igEnv.id}${teamQuery}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${vercelToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ value: newToken }),
        }
      );
    } else {
      // Créer une nouvelle
      updateRes = await fetch(
        `https://api.vercel.com/v10/projects/${projectId}/env${teamQuery}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${vercelToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            key: 'INSTAGRAM_TOKEN',
            value: newToken,
            type: 'encrypted',
            target: ['production', 'preview', 'development'],
          }),
        }
      );
    }

    if (!updateRes.ok) {
      const errBody = await updateRes.text();
      console.error('[refresh-ig] Erreur API Vercel (update env):', errBody);
      return res.status(502).json({
        error: 'Impossible de mettre à jour INSTAGRAM_TOKEN sur Vercel',
        details: errBody,
      });
    }

    console.log('[refresh-ig] INSTAGRAM_TOKEN mis à jour sur Vercel avec succès');

    /* ── Réponse succès ──────────────────────────────────── */
    const expirationDate = new Date(
      Date.now() + expiresIn * 1000
    ).toISOString();

    return res.status(200).json({
      success: true,
      message: 'Token Instagram rafraîchi et mis à jour sur Vercel',
      expires_in_days: Math.round(expiresIn / 86400),
      expires_at: expirationDate,
      action: igEnv ? 'updated' : 'created',
    });
  } catch (err) {
    console.error('[refresh-ig] Erreur inattendue:', err);
    return res.status(500).json({
      error: 'Erreur interne',
      message: err.message,
    });
  }
}
