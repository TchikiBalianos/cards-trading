# Supabase et keep-alive

Texte intégral de la section « Supabase » de `CLAUDE.md`, sorti le 25 octobre 2026 pour alléger le contexte de
chaque session, conservé tel quel. `CLAUDE.md` n'en garde que les règles courtes.
À lire avant de toucher à `/api/keep-alive`, à son rapport mensuel ou au planificateur qui l'appelle.

## Supabase : danger permanent

Projet `frbwmzgaqmylilzciptg` (région eu-west-1), **plan gratuit**.

> Le plan gratuit **met le projet en pause après ~7 jours d'inactivité**.
> En pause, le hostname ne résout plus (`ENOTFOUND`) et toutes les écritures
> échouent. Les données restent intactes et le projet est restaurable depuis
> le dashboard (bouton *Resume project*).

`/api/keep-alive` existe uniquement pour empêcher ça. Il est appelé par
**deux planificateurs redondants**, et c'est volontaire :

| Source | Fréquence | Historique consultable |
|---|---|---|
| Cron Vercel (`vercel.json`) | 1×/jour, 04:00 UTC | non (logs Hobby limités à 1 h) |
| GitHub Actions (`.github/workflows/keep-alive.yml`) | toutes les 6 h | oui, onglet Actions |

**Pourquoi deux** : en août 2026, Supabase a averti d'une mise en pause alors
que le cron Vercel était actif. Les crons du plan Hobby sont « best effort »
(fenêtre d'1 h, aucune garantie) et la rétention de logs d'1 h empêche même de
vérifier a posteriori s'ils sont partis. GitHub Actions donne la fréquence ET
la traçabilité. Le repo étant public, les minutes sont illimitées.

⚠️ Le ping doit appeler la **RPC `beta_stats()`**, pas un `SELECT` sur
`beta_submissions` : RLS filtre intégralement le SELECT pour la clé anon, ce
qui ne renvoie aucune ligne et ne suffisait pas à marquer l'activité.

⚠️ GitHub désactive les workflows planifiés d'un repo **public** après 60 jours
sans commit. Le rythme de publication du blog suffit à l'éviter, mais en cas de
longue pause du projet, penser à réactiver le workflow.

RLS : INSERT anonyme autorisé, SELECT réservé aux authentifiés. La clé anon
ne peut donc pas lire la table : utiliser la RPC `beta_stats()` pour les agrégats.

### Rapport mensuel : un seul envoi, malgré les appels multiples

Le 1er de chaque mois (jour UTC), `/api/keep-alive` envoie à `contact@cards-trading.com` un
rapport de santé : inscriptions du mois écoulé, total, dernière inscription, base joignable.
Il vaut aussi test de la chaîne d'email : un mois sans rapport est un signal. Avant le
30 septembre 2026 il était hebdomadaire, envoyé « le lundi ».

⚠️ **Ce endpoint est appelé plusieurs fois par jour** : une fois par le cron Vercel, et toutes
les 6 h par `keep-alive.yml` (avec du retard). Tout ce qu'on y greffe s'exécute donc plusieurs
fois. Le rapport du lundi partait en **quatre exemplaires identiques** (constatés les 7, 14, 21
et 28 septembre 2026, entre 04h et 23h UTC). Le rapport mensuel passe par l'API HTTP de Resend
avec un en-tête `Idempotency-Key` (`rapport-mensuel/AAAA-MM`) : les appels suivants du même
jour reçoivent la même réponse, sans renvoyer d'email. Le SDK `resend` installé (3.5.0) ne
connaît pas cette option, d'où un `fetch` direct. Le texte du rapport ne dépend que du jour
civil, sans quoi Resend refuserait le second appel pour « charge utile différente » (409,
traité comme « déjà envoyé »).

Le chiffre du mois vient de la fonction SQL `beta_stats_mois_precedent()` (mois calendaire
Europe/Paris, définition dans `supabase/migrations/`). **`beta_stats()` n'a pas été touchée** :
c'est celle du ping qui empêche la pause de Supabase. Si la nouvelle fonction manque, le
rapport part quand même, sans le chiffre du mois.

Test à la demande : `GET /api/keep-alive?rapport=1` envoie un rapport, au plus un par heure
(clé d'idempotence horaire, distincte de celle du vrai rapport). Tests hors réseau :
`node --test scripts/lib/rapport-mensuel.test.mjs`.

Le « total » du rapport compte **toutes les soumissions** du formulaire, doublons et tests
compris : ce n'est pas le nombre de personnes inscrites.
