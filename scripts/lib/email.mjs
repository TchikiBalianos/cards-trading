/*
  Envoi d'email via Resend, NON BLOQUANT : une alerte manquée ne doit pas faire
  échouer le workflow qui la porte, mais elle reste visible dans les journaux
  (même choix que alerte-relecture.mjs et alerte-automatisations.mjs).
*/

export const DESTINATAIRE = process.env.SOCIAL_DESTINATAIRE || 'julian.schmerkin@gmail.com';

export function echapperHtml(t) {
  return String(t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function envoyerEmail({ sujet, texte, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.log('::warning::RESEND_API_KEY absente, aucun email envoyé.');
    return false;
  }
  const rep = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Cards Trading <contact@cards-trading.com>',
      to: [DESTINATAIRE],
      subject: sujet,
      html,
      text: texte,
    }),
  });
  const corps = await rep.json().catch(() => ({}));
  if (!rep.ok) {
    console.log(`::warning::Resend a répondu ${rep.status} : ${JSON.stringify(corps)}`);
    return false;
  }
  console.log(`Email envoyé à ${DESTINATAIRE} (id ${corps.id}).`);
  return true;
}

/* Gabarit commun : même habillage que les autres alertes du projet. */
export function gabarit({ titre, couleur = '#ff6b6b', corps }) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#0b0f1a;padding:24px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto;background:#131a2b;border-radius:12px;overflow:hidden;">
    <tr><td style="padding:22px 24px;background:#1b2440;">
      <div style="font-size:17px;font-weight:bold;color:${couleur};">${echapperHtml(titre)}</div>
      <div style="font-size:13px;color:#8d97ad;padding-top:4px;">Cards-Trading, réseaux sociaux</div>
    </td></tr>
    ${corps}
  </table>
</body></html>`;
}
