import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { age, genre, tcgs, platform, profile, nom, prenom, email, rgpd } = req.body;

    // Validate required fields
    if (!nom || !prenom || !email || !rgpd) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // RGPD must be true
    if (!rgpd) {
      return res.status(400).json({ error: 'RGPD consent required' });
    }

    // Save to Supabase
    const { data, error: supabaseError } = await supabase
      .from('beta_submissions')
      .insert([
        {
          nom,
          prenom,
          email,
          age: age || null,
          genre: genre || null,
          tcgs: Array.isArray(tcgs) ? tcgs.join(',') : tcgs,
          platform: platform || null,
          profile: profile || null,
          rgpd_accepted: true,
          submitted_at: new Date().toISOString(),
          ip_address: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
        },
      ]);

    if (supabaseError) {
      // Log but don't block — email must still be sent
      console.error('Supabase error:', supabaseError);
    }

    // ─────────────────────────────────────────────────────────
    // EMAIL 1 — Notification ADMIN à contact@cards-trading.com
    // ─────────────────────────────────────────────────────────
    const adminEmailPromise = resend.emails.send({
      from: 'Cards Trading <contact@cards-trading.com>',
      to: ['contact@cards-trading.com'],
      reply_to: email,
      subject: `✨ Nouvelle inscription beta - ${prenom} ${nom}`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
    h2 { color: #2997ff; }
    .field { margin: 15px 0; }
    .label { font-weight: bold; color: #333; }
    .value { color: #666; }
    .badge { display: inline-block; background: #2997ff; color: white; padding: 5px 10px; border-radius: 4px; font-size: 12px; }
    hr { border: none; border-top: 1px solid #eee; margin: 20px 0; }
    .footer { color: #999; font-size: 12px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <h2>✨ Nouvelle inscription à la bêta</h2>

    <h3>Informations personnelles</h3>
    <div class="field">
      <span class="label">Nom:</span> <span class="value">${nom}</span>
    </div>
    <div class="field">
      <span class="label">Prénom:</span> <span class="value">${prenom}</span>
    </div>
    <div class="field">
      <span class="label">Email:</span> <span class="value"><a href="mailto:${email}">${email}</a></span>
    </div>

    <hr>

    <h3>Profil utilisateur</h3>
    <div class="field">
      <span class="label">Âge:</span> <span class="value">${age || 'Non spécifié'}</span>
    </div>
    <div class="field">
      <span class="label">Genre:</span> <span class="value">${genre || 'Non spécifié'}</span>
    </div>
    <div class="field">
      <span class="label">TCG préférés:</span> <span class="value">${Array.isArray(tcgs) ? tcgs.join(', ') : tcgs || 'Non spécifié'}</span>
    </div>
    <div class="field">
      <span class="label">Plateforme actuelle:</span> <span class="value">${platform || 'Non spécifié'}</span>
    </div>
    <div class="field">
      <span class="label">Profil:</span> <span class="value">${profile || 'Non spécifié'}</span>
    </div>

    <hr>

    <div class="field">
      <span class="badge">✅ RGPD ACCEPTÉ</span>
    </div>

    <div class="footer">
      <p>Date d'inscription: ${new Date().toLocaleString('fr-FR')}</p>
      <p>IP: ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}</p>
    </div>
  </div>
</body>
</html>
      `,
    });

    // ─────────────────────────────────────────────────────────
    // EMAIL 2 — Confirmation USER à l'adresse de l'inscrit
    // ─────────────────────────────────────────────────────────
    const tcgsList = Array.isArray(tcgs) ? tcgs.join(', ') : (tcgs || '');
    const userEmailPromise = resend.emails.send({
      from: 'Cards Trading <contact@cards-trading.com>',
      to: [email],
      reply_to: 'contact@cards-trading.com',
      subject: `🎴 Bienvenue dans la bêta Cards Trading, ${prenom} !`,
      html: `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bienvenue chez Cards Trading</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background-color: #0f0f14; margin: 0; padding: 0; color: #e8e8e8; }
    .wrapper { width: 100%; background: #0f0f14; padding: 30px 0; }
    .container { max-width: 600px; margin: 0 auto; background: linear-gradient(180deg, #1a1a24 0%, #14141c 100%); border-radius: 12px; overflow: hidden; border: 1px solid rgba(41,151,255,0.15); }
    .hero { background: linear-gradient(135deg, #2997ff 0%, #1a6dc4 100%); padding: 36px 24px; text-align: center; color: #fff; }
    .hero h1 { margin: 0 0 8px; font-size: 26px; font-weight: 700; letter-spacing: -0.5px; }
    .hero p { margin: 0; font-size: 15px; opacity: 0.95; }
    .body { padding: 28px 28px 12px; }
    .body p { font-size: 15px; line-height: 1.6; color: #cfcfd6; margin: 0 0 16px; }
    .body strong { color: #fff; }
    .highlight { background: rgba(41,151,255,0.08); border-left: 3px solid #2997ff; padding: 16px 18px; border-radius: 6px; margin: 20px 0; }
    .highlight p { margin: 0; color: #e8e8e8; }
    .recap { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 16px 20px; margin: 20px 0; }
    .recap-row { padding: 6px 0; font-size: 14px; }
    .recap-label { color: #8a8a96; display: inline-block; min-width: 110px; }
    .recap-value { color: #fff; }
    .cta-wrap { text-align: center; margin: 24px 0 8px; }
    .cta { display: inline-block; background: linear-gradient(135deg, #ff6b35 0%, #e85a2a 100%); color: #fff !important; text-decoration: none; padding: 13px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; }
    .divider { height: 1px; background: rgba(255,255,255,0.08); margin: 24px 0; }
    .footer { padding: 18px 28px 28px; text-align: center; font-size: 12px; color: #6b6b75; line-height: 1.5; }
    .footer a { color: #8a8a96; text-decoration: none; }
    .signature { color: #cfcfd6; font-style: italic; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="hero">
        <h1>🎴 Bienvenue ${prenom} !</h1>
        <p>Tu fais maintenant partie des premiers bêta-testeurs de Cards Trading.</p>
      </div>

      <div class="body">
        <p>Salut <strong>${prenom}</strong>,</p>

        <p>Merci pour ton inscription à la bêta de <strong>Cards-Trading</strong> — la nouvelle marketplace dédiée aux fans de TCG. Ton inscription a bien été enregistrée 🎉</p>

        <div class="highlight">
          <p><strong>📬 Et maintenant ?</strong><br>
          On te recontactera par email dès que l'accès anticipé sera disponible. Les premiers inscrits auront la priorité — tu seras parmi les premiers à découvrir la plateforme.</p>
        </div>

        <p><strong>Récapitulatif de ton inscription :</strong></p>

        <div class="recap">
          <div class="recap-row"><span class="recap-label">Email :</span> <span class="recap-value">${email}</span></div>
          ${tcgsList ? `<div class="recap-row"><span class="recap-label">TCG préférés :</span> <span class="recap-value">${tcgsList}</span></div>` : ''}
          ${platform ? `<div class="recap-row"><span class="recap-label">Plateforme actuelle :</span> <span class="recap-value">${platform}</span></div>` : ''}
          ${profile ? `<div class="recap-row"><span class="recap-label">Profil :</span> <span class="recap-value">${profile}</span></div>` : ''}
        </div>

        <div class="cta-wrap">
          <a href="https://discord.gg/JBs3FnK9qP" class="cta">💬 Rejoindre le Discord</a>
        </div>

        <p style="text-align: center; font-size: 13px; color: #8a8a96; margin-top: 12px;">
          Tu y trouveras les coulisses du projet, les sneak peeks et la communauté.
        </p>

        <div class="divider"></div>

        <p class="signature">À très bientôt sur Cards Trading,<br>
        — Julian &amp; Valérian, co-fondateurs</p>
      </div>

      <div class="footer">
        <p>Cet email confirme ton inscription à la bêta. Tu peux nous écrire à <a href="mailto:contact@cards-trading.com">contact@cards-trading.com</a> pour toute question.</p>
        <p style="margin-top: 8px;">© 2026 Cards Trading — Tous droits réservés</p>
      </div>
    </div>
  </div>
</body>
</html>
      `,
    });

    // Envoyer les deux emails en parallèle
    const [adminResult, userResult] = await Promise.allSettled([adminEmailPromise, userEmailPromise]);

    const adminOk = adminResult.status === 'fulfilled' && !adminResult.value.error;
    const userOk  = userResult.status  === 'fulfilled' && !userResult.value.error;

    if (!adminOk) {
      console.error('Resend admin error:', adminResult.status === 'rejected' ? adminResult.reason : JSON.stringify(adminResult.value.error));
    } else {
      console.log('Admin email sent, id:', adminResult.value.data?.id);
    }

    if (!userOk) {
      console.error('Resend user error:', userResult.status === 'rejected' ? userResult.reason : JSON.stringify(userResult.value.error));
    } else {
      console.log('User confirmation email sent, id:', userResult.value.data?.id);
    }

    return res.status(200).json({
      success: true,
      message: 'Inscription réussie! Un email de confirmation t\'a été envoyé.',
      adminEmailSent: adminOk,
      userEmailSent: userOk,
      dbSaved: !supabaseError,
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
}
