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
      console.error('Supabase error:', supabaseError);
      return res.status(500).json({ error: 'Database error' });
    }

    // Send email to admin
    const emailContent = `
Nouvelle inscription à la bêta Cards Trading

**Informations personnelles:**
- Nom: ${nom}
- Prénom: ${prenom}
- Email: ${email}

**Profil:**
- Âge: ${age || 'Non spécifié'}
- Genre: ${genre || 'Non spécifié'}
- TCG préférés: ${Array.isArray(tcgs) ? tcgs.join(', ') : tcgs || 'Non spécifié'}
- Plateforme actuelle: ${platform || 'Non spécifié'}
- Profil: ${profile || 'Non spécifié'}

**Consentement RGPD:** ✅ Accepté

Date d'inscription: ${new Date().toLocaleString('fr-FR')}
IP: ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}

---
Ne répondez pas à cet email. Ce message vient de votre formulaire d'inscription Cards Trading.
    `;

    const { error: emailError } = await resend.emails.send({
      from: 'Cards Trading <noreply@cards-trading.vercel.app>',
      to: 'julian.schmerkin@gmail.com',
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

    if (emailError) {
      console.error('Resend error:', emailError);
      // Don't fail the request if email fails - data was saved to DB
    }

    return res.status(200).json({
      success: true,
      message: 'Inscription réussie! Vous recevrez bientôt un email de confirmation.',
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
