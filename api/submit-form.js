import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const resend = new Resend(process.env.RESEND_API_KEY);

/*
  Client Supabase créé de façon défensive.

  createClient() lève si l'URL est absente ou malformée. Au niveau module,
  cette exception tuait TOUTE la fonction — y compris l'envoi des emails,
  qui est notre filet de sécurité quand la base est indisponible. On isole
  donc la création, et `supabase` vaut null si la config manque.
*/
let supabase = null;
try {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
  } else {
    console.error('[config] SUPABASE_URL ou SUPABASE_ANON_KEY manquante — persistance désactivée');
  }
} catch (e) {
  console.error('[config] createClient a échoué — persistance désactivée:', e.message);
}

/*
  Validation d'email — protège la réputation d'expéditeur.

  Une adresse mal tapée part quand même, rebondit, et Resend enregistre le
  bounce. Sur un domaine jeune, quelques rebonds suffisent à faire basculer
  TOUS les emails en spam — y compris les notifications admin dont dépend la
  détection des leads.

  L'ancienne regex /^[^\s@]+@[^\s@]+\.[^\s@]+$/ acceptait « a@b.c »,
  « jean@gmail.con », « jean@hotmial.fr » : autant de rebonds garantis.

  ⚠️ DUPLIQUÉ dans public/index.html pour le retour immédiat côté client.
     Toute modification ici doit y être répercutée.
*/
const DOMAINES_COURANTS = [
  'gmail.com', 'hotmail.com', 'hotmail.fr', 'outlook.com', 'outlook.fr',
  'yahoo.com', 'yahoo.fr', 'orange.fr', 'wanadoo.fr', 'free.fr', 'sfr.fr',
  'laposte.net', 'live.fr', 'icloud.com', 'bbox.fr', 'aol.com', 'protonmail.com'
];

/* Damerau-Levenshtein : compte l'INVERSION de deux lettres adjacentes comme
   une seule faute. Indispensable — « gmial.com » est une transposition, que
   la distance de Levenshtein classique compte à 2 et laisserait passer. */
function distanceDL(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 1) return 2;
  const d = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cout);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

function validerEmail(email) {
  const valeur = String(email || '').trim().toLowerCase();
  const strict = /^[^\s@]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;
  if (!strict.test(valeur) || valeur.includes('..')) {
    return { ok: false, message: "Cette adresse email n'est pas valide." };
  }
  const partie = valeur.split('@');
  const domaine = partie[1];
  if (!DOMAINES_COURANTS.includes(domaine)) {
    for (const connu of DOMAINES_COURANTS) {
      if (distanceDL(domaine, connu) <= 1) {
        return {
          ok: false,
          message: 'Voulais-tu dire ' + partie[0] + '@' + connu + ' ?',
          suggestion: partie[0] + '@' + connu
        };
      }
    }
  }
  return { ok: true, email: valeur };
}

/*
  Identifiant de la liste de diffusion, résolu À L'EXÉCUTION.

  Ce n'est pas un secret — c'est un identifiant de liste, inexploitable
  sans la clé d'API. Il pourrait donc être écrit en dur, mais il faudrait
  le corriger à la main si la liste était recréée, et l'oubli serait
  silencieux.

  On le demande donc à Resend, en privilégiant `RESEND_SEGMENT_ID` si la
  variable existe. Le résultat est gardé en mémoire du processus : une
  fonction serverless en sert plusieurs requêtes, inutile de redemander à
  chaque inscription.
*/
let listeMemorisee = null;

async function listeDiffusion() {
  if (process.env.RESEND_SEGMENT_ID) return process.env.RESEND_SEGMENT_ID;
  if (listeMemorisee) return listeMemorisee;

  const { data, error } = await resend.audiences.list();
  if (error) throw new Error(`liste introuvable : ${JSON.stringify(error)}`);

  const listes = data?.data || [];
  if (listes.length === 0) throw new Error('aucune liste de diffusion sur ce compte Resend');

  /* « General » si elle existe, sinon la première : un compte qui n'en a
     qu'une ne doit pas exiger de configuration. */
  const choisie = listes.find((l) => l.name === 'General') || listes[0];
  listeMemorisee = choisie.id;
  console.log('Newsletter — liste résolue :', choisie.name, listeMemorisee);
  return listeMemorisee;
}

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { age, genre, tcgs, platform, profile, nom, prenom, email, rgpd, source, newsletter } = req.body;

    /*
      Provenance de l'inscription.

      Champ libre envoyé par le client, donc borné et nettoyé avant d'aller
      en base. Volontairement JAMAIS bloquant : une source absente, vide ou
      farfelue retombe sur « direct » et n'empêche pas l'inscription. La
      chaîne d'inscription prime sur la mesure, toujours.
    */
    const provenance =
      String(source || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._:-]/g, '')
        .slice(0, 60) || 'direct';

    // Validate required fields
    if (!nom || !prenom || !email || !rgpd) {
      return res.status(400).json({ error: 'Des informations sont manquantes ou incomplètes.' });
    }

    // Validation d'email — protège la réputation d'expéditeur
    const verdict = validerEmail(email);
    if (!verdict.ok) {
      return res.status(400).json({ error: verdict.message, suggestion: verdict.suggestion });
    }

    /*
      Persistance Supabase.

      Non bloquante : l'email reste notre filet de sécurité. Mais contrairement
      à avant, un échec ici est SIGNALÉ (sujet de l'email admin) et pris en
      compte dans le statut renvoyé au visiteur — un échec silencieux avait
      fait perdre 3 mois d'inscriptions sans que personne ne s'en aperçoive.
    */
    let supabaseError = null;
    if (!supabase) {
      supabaseError = { message: 'Client Supabase non configuré' };
      console.error('Supabase indisponible — lead conservé uniquement par email');
    } else {
      try {
        const { error } = await supabase
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
              /* Opt-in EXPLICITE, jamais deduit : la case RGPD dit
                 « Aucun marketing », elle ne vaut pas consentement
                 editorial. Tout ce qui n'est pas un vrai true est un non. */
              newsletter: newsletter === true,
              source: provenance,
              submitted_at: new Date().toISOString(),
              ip_address: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
            },
          ]);
        supabaseError = error;
      } catch (e) {
        // createClient peut réussir et l'appel réseau échouer (DNS, projet supprimé)
        supabaseError = { message: e.message };
      }
    }

    if (supabaseError) {
      console.error('Supabase error:', supabaseError);
    }

    /*
      Ajout à la liste de diffusion — UNIQUEMENT sur opt-in explicite.

      Volontairement APRÈS la persistance et volontairement NON bloquant :
      un échec ici ne doit jamais faire perdre un lead. La ligne en base
      fait foi, la liste Resend n'en est qu'une copie de travail qu'on peut
      resynchroniser à tout moment depuis beta_submissions.

      RESEND_SEGMENT_ID en variable d'environnement : un identifiant de
      liste codé en dur casserait silencieusement si la liste était
      recréée.
    */
    if (newsletter === true) {
      try {
        const { error } = await resend.contacts.create({
          email: verdict.email,
          firstName: prenom || undefined,
          lastName: nom || undefined,
          unsubscribed: false,
          audienceId: await listeDiffusion(),
        });
        if (error) console.error('Newsletter — ajout refusé :', JSON.stringify(error));
        else console.log('Newsletter — contact ajouté :', verdict.email);
      } catch (e) {
        console.error('Newsletter — ajout impossible :', e.message);
      }
    }

    const dbSaved = !supabaseError;
    /* Préfixe d'alerte visible dans la liste d'emails, sans avoir à ouvrir */
    const alerte = dbSaved ? '' : '[BASE HS] ';

    // ─────────────────────────────────────────────────────────
    // EMAIL 1 — Notification ADMIN à contact@cards-trading.com
    // ─────────────────────────────────────────────────────────
    const adminEmailPromise = resend.emails.send({
      from: 'Cards Trading <contact@cards-trading.com>',
      to: ['contact@cards-trading.com'],
      reply_to: email,
      subject: `${alerte}✨ Nouvelle inscription bêta — ${prenom} ${nom}`,
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

    ${dbSaved ? '' : `<div style="background:#fff3cd;border-left:4px solid #e65100;padding:14px 18px;border-radius:4px;margin-bottom:20px;color:#663c00">
      <strong>⚠️ Enregistrement en base ÉCHOUÉ</strong><br>
      Ce lead n'existe QUE dans cet email — conservez-le.<br>
      <span style="font-size:12px">Motif : ${String(supabaseError && supabaseError.message || 'inconnu').slice(0, 200)}</span>
    </div>`}

    <h3>Informations personnelles</h3>
    <div class="field">
      <span class="label">Nom :</span> <span class="value">${nom}</span>
    </div>
    <div class="field">
      <span class="label">Prénom :</span> <span class="value">${prenom}</span>
    </div>
    <div class="field">
      <span class="label">Email :</span> <span class="value"><a href="mailto:${email}">${email}</a></span>
    </div>

    <hr>

    <h3>Profil utilisateur</h3>
    <div class="field">
      <span class="label">Âge :</span> <span class="value">${age || 'Non spécifié'}</span>
    </div>
    <div class="field">
      <span class="label">Genre :</span> <span class="value">${genre || 'Non spécifié'}</span>
    </div>
    <div class="field">
      <span class="label">TCG préférés :</span> <span class="value">${Array.isArray(tcgs) ? tcgs.join(', ') : tcgs || 'Non spécifié'}</span>
    </div>
    <div class="field">
      <span class="label">Plateforme actuelle :</span> <span class="value">${platform || 'Non spécifié'}</span>
    </div>
    <div class="field">
      <span class="label">Profil :</span> <span class="value">${profile || 'Non spécifié'}</span>
    </div>
    <div class="field">
      <span class="label">Provenance :</span> <span class="value">${provenance}</span>
    </div>

    <hr>

    <div class="field">
      <span class="badge">✅ RGPD ACCEPTÉ</span>
    </div>

    <div class="footer">
      <p>Date d'inscription : ${new Date().toLocaleString('fr-FR')}</p>
      <p>IP : ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}</p>
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

    /*
      Le lead n'est RETENU que si au moins un canal durable a fonctionné :
      la base, ou la notification admin (qui contient toutes les données).
      L'email de confirmation au visiteur ne compte pas — c'est du confort,
      pas un enregistrement.

      Si les deux ont échoué, ne PAS annoncer "Inscription réussie" : on
      renvoie une erreur pour que le visiteur puisse réessayer. C'est
      exactement ce qui manquait — un 200 systématique a masqué la perte
      des inscriptions pendant trois mois.
    */
    const leadRetenu = dbSaved || adminOk;

    if (!leadRetenu) {
      console.error('PERTE DE LEAD — base ET email admin en échec:', JSON.stringify({ nom, prenom, email }));
      return res.status(503).json({
        error: "Notre système d'inscription est momentanément indisponible. Merci de réessayer dans quelques minutes.",
        dbSaved: false,
        adminEmailSent: false,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Inscription réussie ! Un email de confirmation t\'a été envoyé.',
      adminEmailSent: adminOk,
      userEmailSent: userOk,
      dbSaved,
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: "Une erreur inattendue est survenue. Réessaie dans un instant.", detail: error.message });
  }
}
