#!/usr/bin/env node
/**
 * Prévient par email qu'une automatisation est cassée.
 *
 * POURQUOI CE SCRIPT EXISTE. Du 11 au 18 septembre 2026,
 * `publie-articles.yml` a échoué HUIT jours de suite sur la même ligne
 * (Astro 6 refusant Node 20). Les huit passages étaient rouges dans
 * l'onglet Actions, et rien n'a bougé : l'article Star Wars est resté en
 * brouillon neuf jours, les vignettes de deux articles n'ont jamais été
 * committées, et `annonce-buffer` a échoué en cascade faute de trouver
 * ces images.
 *
 * Le projet avait déjà une alerte pour les brouillons qui traînent
 * (`alerte-relecture.mjs`), mais aucune pour les automatisations mortes.
 *
 * CE QU'IL SIGNALE, et c'est délibérément différent d'un « il y a eu des
 * échecs cette nuit » : l'état COURANT de chaque workflow. Un workflow
 * n'est signalé que si son dernier passage terminé est un échec, et
 * l'email dit depuis combien de passages et depuis quelle date. Huit
 * échecs d'affilée ne doivent pas se lire comme un incident isolé.
 *
 * Corollaire assumé : tant qu'une automatisation reste cassée, l'email
 * revient chaque jour. C'est voulu — le compteur qui monte est
 * précisément ce qui manquait.
 *
 *   node scripts/alerte-automatisations.mjs --dry-run
 *   node scripts/alerte-automatisations.mjs
 *
 * Variables : GITHUB_TOKEN (fourni par Actions), RESEND_API_KEY
 */

const DEPOT = process.env.GITHUB_REPOSITORY || 'TchikiBalianos/cards-trading';
const DESTINATAIRE = 'julian.schmerkin@gmail.com';
const SEC = process.argv.includes('--dry-run');

/* Ce workflow-ci est exclu : s'il échoue, il ne peut pas s'alerter
   lui-même, et le signaler créerait une boucle sans intérêt. */
const EXCLUS = new Set(['Alerte automatisations']);

/* Nombre de passages remontés par workflow. Au-delà, on ne cherche plus à
   dater précisément le début d'une panne : « cassé depuis plus de 15
   passages » suffit à comprendre qu'il faut agir. */
const PROFONDEUR = 15;

/*
  Workflows dont un déclenchement MANUEL peut ne rien publier : `brouillon`
  pour annonce-buffer, `controle_seul` pour publie-articles. Un tel passage
  réussi ne prouve rien sur la chaîne réelle, et il a masqué un incident :
  l'échec d'annonce-buffer du 18 septembre 2026 a été effacé par le test en
  brouillon du lendemain, et l'alerte a annoncé « 0 en échec » alors que
  l'article du vendredi n'avait été relayé nulle part. Pour ces deux-là,
  seuls les passages PLANIFIÉS comptent.

  Coût assumé : après une réparation, un passage manuel réel ne suffit pas à
  faire taire l'alerte, il faut attendre le prochain passage planifié (un
  jour pour publie-articles, trois ou quatre pour annonce-buffer). Mieux
  vaut un email de trop qu'un incident sans email : c'est la raison d'être
  de ce script.
*/
const SEULS_PLANIFIES = new Set(['annonce-buffer.yml', 'publie-articles.yml']);

async function github(chemin) {
  const entetes = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) entetes.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const rep = await fetch(`https://api.github.com/repos/${DEPOT}${chemin}`, { headers: entetes });
  if (!rep.ok) throw new Error(`GitHub a répondu ${rep.status} sur ${chemin}`);
  return rep.json();
}

function jours(iso) {
  return Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
}

/* ── Relevé ────────────────────────────────────────────── */

const { workflows } = await github('/actions/workflows');
if (!Array.isArray(workflows) || workflows.length === 0) {
  console.error('::error::Aucun workflow renvoyé par GitHub. Relevé abandonné.');
  process.exit(1);
}

const casses = [];
let examines = 0;

for (const w of workflows) {
  if (w.state !== 'active' || EXCLUS.has(w.name)) continue;

  const { workflow_runs: runs } = await github(
    `/actions/workflows/${w.id}/runs?per_page=${PROFONDEUR}&status=completed`
  );
  const termines = (runs || []).filter((r) => r.conclusion);
  if (termines.length === 0) continue;
  examines++;

  /* `cancelled` et `skipped` ne disent rien de la santé du workflow : on
     ne retient que le dernier verdict qui tranche. */
  const fichier = w.path.replace('.github/workflows/', '');
  const planifieSeul = SEULS_PLANIFIES.has(fichier);
  const retenus = planifieSeul ? termines.filter((r) => r.event === 'schedule') : termines;
  const verdicts = retenus.filter((r) => ['success', 'failure', 'timed_out'].includes(r.conclusion));
  if (verdicts.length === 0) continue;

  const dernier = verdicts[0];
  if (dernier.conclusion === 'success') continue;

  let suite = 0;
  for (const r of verdicts) {
    if (r.conclusion === 'success') break;
    suite++;
  }
  const premier = verdicts[suite - 1];

  /* Un passage manuel réussi, plus récent que l'échec : on le mentionne
     dans l'email, sans le compter. */
  const masque = planifieSeul
    ? termines.find(
        (r) => r.event !== 'schedule' && r.conclusion === 'success' && new Date(r.created_at) > new Date(dernier.created_at)
      )
    : null;

  casses.push({
    nom: w.name,
    fichier,
    suite,
    complet: suite < verdicts.length,
    depuis: premier.created_at,
    joursDepuis: jours(premier.created_at),
    lien: dernier.html_url,
    conclusion: dernier.conclusion,
    masqueLe: masque ? masque.created_at : null,
  });
}

console.log(`${examines} automatisation(s) examinée(s), ${casses.length} en échec.`);

if (casses.length === 0) {
  /* Rien à dire. Une alerte quotidienne systématique cesse d'être lue au
     bout d'une semaine, soit exactement le jour où elle compte : ce
     constat est déjà consigné dans alerte-relecture.mjs. */
  console.log('Toutes les automatisations sont au vert. Aucun email.');
  process.exit(0);
}

/* Le plus anciennement cassé en tête : c'est celui qui a le plus de
   chances d'avoir déjà fait des dégâts en cascade. */
casses.sort((a, b) => b.suite - a.suite);

/* ── Message ───────────────────────────────────────────── */

const pire = casses[0];
const sujet =
  casses.length === 1
    ? `⚠️ ${pire.nom} échoue depuis ${pire.suite} passage${pire.suite > 1 ? 's' : ''}`
    : `⚠️ ${casses.length} automatisations en échec`;

const ligne = (c) => {
  const duree = c.complet
    ? `${c.suite} passage${c.suite > 1 ? 's' : ''} d'affilée, depuis le ${c.depuis.slice(0, 10)} (${c.joursDepuis} j)`
    : `au moins ${c.suite} passages d'affilée`;
  const note = c.masqueLe
    ? `un passage manuel réussi le ${c.masqueLe.slice(0, 10)} n'est pas compté : il peut n'avoir rien publié (mode brouillon ou contrôle seul)`
    : null;
  return { duree, note };
};

const texte = [
  casses.length === 1
    ? 'Une automatisation est cassée :'
    : `${casses.length} automatisations sont cassées :`,
  '',
  ...casses.flatMap((c) => [
    `- ${c.nom} (${c.fichier})`,
    `  ${ligne(c).duree}`,
    ...(ligne(c).note ? [`  ${ligne(c).note}`] : []),
    `  ${c.lien}`,
    '',
  ]),
  'Rappel : un échec de publication se propage. Le blog qui ne publie pas',
  'prive les annonces de leurs vignettes, et les annonces échouent ensuite',
  'sur des images en 404.',
].join('\n');

const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#0b0f1a;padding:24px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto;background:#131a2b;border-radius:12px;overflow:hidden;">
    <tr><td style="padding:22px 24px;background:#1b2440;">
      <div style="font-size:17px;font-weight:bold;color:#ff6b6b;">Automatisation en échec</div>
      <div style="font-size:13px;color:#8d97ad;padding-top:4px;">Cards-Trading</div>
    </td></tr>
    ${casses
      .map(
        (c) => `<tr><td style="padding:18px 24px;border-bottom:1px solid #232a3a;">
      <div style="font-size:15px;color:#e6ebf5;font-weight:bold;">${c.nom}</div>
      <div style="font-size:12px;color:#7c879c;padding-top:2px;">${c.fichier}</div>
      <div style="font-size:13px;color:#ffb454;padding-top:8px;">${ligne(c).duree}</div>
      ${ligne(c).note ? `<div style="font-size:12px;color:#7c879c;padding-top:4px;">${ligne(c).note}</div>` : ''}
      <div style="padding-top:10px;"><a href="${c.lien}" style="font-size:13px;color:#2997ff;">Voir le dernier passage</a></div>
    </td></tr>`
      )
      .join('')}
    <tr><td style="padding:18px 24px;font-size:12px;color:#7c879c;line-height:1.6;">
      Un échec de publication se propage : le blog qui ne publie pas prive les
      annonces de leurs vignettes, et les annonces échouent ensuite sur des
      images en 404.
    </td></tr>
  </table>
</body></html>`;

if (SEC) {
  console.log('\n--- sujet ---\n' + sujet);
  console.log('\n--- texte ---\n' + texte);
  console.log('\n[dry-run] aucun email envoyé.');
  process.exit(0);
}

if (!process.env.RESEND_API_KEY) {
  console.log('::warning::RESEND_API_KEY absente, aucun email envoyé.');
  process.exit(0);
}

const reponse = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from: 'Cards Trading <contact@cards-trading.com>',
    to: [DESTINATAIRE],
    subject: sujet,
    html,
    text: texte,
  }),
});

const corps = await reponse.json().catch(() => ({}));
if (!reponse.ok) {
  /* Volontairement non bloquant, comme alerte-relecture.mjs : une alerte
     manquée ne doit pas faire échouer le workflow qui la porte, mais elle
     doit rester visible dans les journaux. */
  console.log(`::warning::Resend a répondu ${reponse.status} : ${JSON.stringify(corps)}`);
  process.exit(0);
}

console.log(`Email envoyé à ${DESTINATAIRE} (id ${corps.id}).`);
