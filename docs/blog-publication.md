# Publication des articles du blog

Texte sorti de `CLAUDE.md` le 25 octobre 2026 pour alléger le contexte de chaque session, conservé tel quel.
À lire avant de toucher à `publie-articles`, à l'alerte de relecture ou au flux des branches `blog/*`.
Règles de rédaction (calendrier, dates de sortie, chiffres) : `docs/blog-redaction.md`.

## Publication des articles : jamais depuis un poste

Un article de blog passe en ligne quand `publie-articles.yml` (GitHub
Actions, quotidien à 05:12 UTC) trouve sur `main` un fichier réunissant
trois conditions : `draft: true`, `pubDate` atteinte, et sommaire + FAQ
présents. Il lève le drapeau, génère les vignettes, contrôle le build et
la concordance FAQ, committe, puis **attend le 200 en production**.

La relecture reste humaine : le script ne touche à aucune branche
`blog/*`. Programmer un article, c'est le fusionner sur `main` en
brouillon avec la bonne `pubDate`.

> **Pourquoi ce n'est plus une tâche planifiée de l'app Claude Desktop.**
> Celles-ci ne tournent que si l'app est ouverte. Le 4 septembre 2026, la
> tâche armée pour 08h30 a démarré à 15h02, soit après `annonce-discord`
> (11:17 Paris) et `annonce-buffer` (12:23). L'article OP-17 est resté en
> brouillon, 404 en production, et le relais du vendredi a republié
> l'article du mardi faute de nouveauté. Personne n'a rien vu pendant
> trois jours. Même famille que les crons Vercel « best effort » qui ont
> justifié le doublement du keep-alive : une automatisation qui dépend
> d'un poste allumé n'est pas une automatisation.

### Alerte de relecture par email

`alerte-relecture.yml` prévient Julian dès qu'un brouillon attend, à
`julian.schmerkin@gmail.com` via Resend (secret `RESEND_API_KEY`, déjà en
place). Deux déclencheurs : un **push sur `blog/**`** envoie l'email tout
de suite, et un **cron quotidien à 05:32 UTC** rappelle les branches qui
dépassent 2 jours. L'email porte le verdict des mêmes contrôles que la
publication, plus les points éditoriaux à vérifier.

> **Pourquoi.** Les tâches de rédaction poussent un brouillon sur une
> branche et s'arrêtent là. Rien ne le signalait : le 18 août 2026, un
> article y est resté six jours. Les vérifications du mercredi et du
> samedi le voyaient, mais deux fois par semaine et seulement si l'app
> était ouverte, ce qui faisait dépendre le rythme de publication d'un
> poste allumé.

⚠️ **Le déclencheur `push` ne vaut que pour les branches créées après le
8 septembre 2026.** Sur un push, GitHub exécute le workflow tel qu'il est
*sur la branche poussée* : une branche partie d'un `main` antérieur ne le
contient pas. Le rappel quotidien, lui, tourne depuis `main` et les
couvre toutes.

⚠️ **Le rappel ne part que si une branche dépasse le seuil**, et jamais
sinon. Une alerte quotidienne systématique cesse d'être lue au bout d'une
semaine, soit exactement le jour où elle compte. Le seuil est
`SEUIL_JOURS` dans `scripts/alerte-relecture.mjs`.

Les critères de complétude sont dans `scripts/lib/article.mjs`, partagés
avec `publie-articles.mjs` : séparés, ils divergeraient et l'alerte
annoncerait « publiable » un article que la publication refuserait le
lendemain.

```bash
node scripts/alerte-relecture.mjs --rappel --dry-run
node scripts/alerte-relecture.mjs --branche=blog/<slug> --dry-run
```

⚠️ **Un commit sur la branche ne fusionne rien : Julian s'y est fait
prendre le 22 septembre 2026.** Prévenu par cette alerte, il a cliqué
« Lire l'article » (qui ouvre le fichier sur la branche `blog/<slug>`),
changé `draft: true` en `draft: false` dans l'éditeur GitHub, et committé
là, en pensant qu'une fusion suivrait. Aucune pull request n'a été
ouverte : l'article est resté deux jours hors ligne, jusqu'à ce qu'un
contrôle manuel s'en aperçoive.

Le `draft: false` posé sur la branche aggravait le risque plutôt que de
le résoudre : fusionnée telle quelle, `publie-articles.mjs` l'aurait
ignorée quand même, puisqu'il ne traite que les articles `draft: true`
sur `main`. Ni vignette, ni contrôle du build ou de la FAQ, ni attente du
200, alors que Vercel aurait déployé l'article dès le premier push.

L'email porte donc, pour chaque article, un lien direct
`compare/main...<branche>?expand=1` qui ouvre le formulaire de pull
request en un clic, et une consigne en trois étapes : ne pas toucher au
`draft`, ne rien committer sur la branche, ouvrir la pull request puis la
fusionner. Une branche non fusionnée dont l'article porte `draft: false`
est désormais signalée en rouge dans sa carte. L'email ne promet plus
d'heure de publication précise : mesuré entre le 19 et le 24 septembre
2026, le cron programmé à 05:12 UTC démarre en réalité vers 09:57 UTC
(GitHub retarde ses crons programmés, sans garantie d'horaire), même si
l'ordre avec les crons d'annonce reste largement respecté. Il dit
seulement « le matin même ».

⚠️ **Les corrections d'articles déjà en ligne sont signalées à part** (cartes « Correctif »,
`correctifsDeLaBranche`) : un article corrigé reste servi faux en production tant que sa branche
n'est pas fusionnée, et deux correctifs sont restés trois et dix-huit jours sans email avant le
20 septembre 2026. **Piège si un jour une pull request est fusionnée en *squash*** : la branche
garde des commits absents de `main` et un contenu différent, donc elle repasse pour un correctif
en attente et le rappel repart chaque matin pour une branche morte. Le test d'ancêtre commun ne
sert alors à rien ; celui qui tranche est « `main` a-t-il touché cet article depuis que la
branche s'en est séparée ? » (`git rev-list --count <branche>..origin/main -- <chemin>`, plus de
0 = branche périmée). Non appliqué aujourd'hui, les pull requests étant fusionnées en commit de
fusion ; l'implémentation complète est gardée sous le tag `archive/alerte-relecture-squash`.

**Vignette d'un article corrigé** (30 octobre 2026) : quand un correctif change le titre ou le chapô,
ajouter `vignetteVersion: 2` au frontmatter puis lancer `node scripts/vignettes-sociales.mjs`, sans
`--force`. La vignette prend le suffixe `-v2` (`nomVignette`, `scripts/lib/vignette-article.mjs`), la
page du blog la reprend, et l'ancienne reste en place. Les relais et la newsletter gardent la vignette
d'origine : ils ne concernent que les articles pas encore annoncés. `updatedDate` alimente le
`dateModified` de la page et la mention « Mis à jour le ».

⚠️ **Pas de `[skip ci]` dans le commit de publication**, contrairement aux
commits d'archivage des autres workflows. On a longtemps cru que Vercel
honorait ce marqueur (l'article serait committé et jamais déployé). **Il ne
l'honore pas dans ce dépôt** : vérifié le 5 octobre 2026, les 42 commits
`[skip ci]` de `main` depuis le 27 août portent tous un statut Vercel
« success », et `cote-hebdo` en dépend depuis sa création (sa vignette est
committée avec le marqueur, puis l'étape suivante attend qu'elle soit
servie). La règle reste par prudence : elle ne coûte rien.

⚠️ Le créneau de 05:12 UTC est **avant** les deux crons d'annonce, et
c'est le seul point qui compte dans le choix de l'heure. Le déplacer
après 09:17 UTC ferait attendre chaque article jusqu'au créneau éditorial
suivant, soit trois ou quatre jours.

⚠️ Un brouillon incomplet est **refusé, pas publié** : sans sommaire ni
FAQ d'au moins trois questions, le script sort en erreur et l'article
reste en attente. L'étape est en `continue-on-error` pour qu'un article
bancal n'empêche pas la sortie des articles valides du même jour ;
l'échec est rejoué en fin de job.

```bash
node scripts/publie-articles.mjs --controle              # état du jour, aucune écriture
node scripts/publie-articles.mjs --controle --date=2026-09-10   # simule un autre jour
```
