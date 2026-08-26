# Newsletter hebdomadaire — design

Statut : validé par Julian le 26 août 2026. Prêt pour le plan d'implémentation.

## Contexte

Le formulaire capture déjà l'opt-in newsletter et crée le contact dans
l'audience Resend "General" (`api/submit-form.js`, vérifié fonctionnel le
24 août : ligne en base + email admin + contact Resend créés dans la même
requête). Rien n'envoie encore de newsletter à ces contacts.

Volume actuel : zéro inscrit newsletter confirmé (hors contacts de test).
Ça ne justifie pas une grosse infrastructure — d'où le choix d'un digest
qui recycle un contenu déjà produit plutôt qu'un chantier éditorial à part.

## Décisions validées

| Question | Décision |
|---|---|
| Outil d'envoi | Resend Broadcasts (pas Klaviyo/Mailchimp) |
| Cadence | Hebdomadaire |
| Jour/heure | Samedi 13h37 Paris (cron `37 11 * * 6`) |
| Contenu | Articles de la semaine + tendances de prix (Pokémon, marché EUR) |
| Déclenchement de l'envoi | Manuel — le script crée un brouillon, ne l'envoie jamais |

## Pourquoi Resend et pas Klaviyo/Mailchimp

Le domaine `cards-trading.com` est déjà vérifié sur Resend (DKIM/SPF, mai
2026), l'audience/segment "General" existe déjà et contient les opt-ins.
Resend a une fonctionnalité Broadcasts complète (création en brouillon,
édition, envoi), zéro broadcast envoyé à ce jour donc aucun historique à
casser.

Passer par Klaviyo/Mailchimp voudrait dire : nouvelle vérification DNS du
domaine chez eux, synchronisation des contacts entre deux systèmes (risque
de désynchro avec la base qui fait foi), un abonnement de plus pour une
liste qui démarre à zéro. Ces outils se justifient à une autre échelle
(segmentation avancée, flows e-commerce, A/B testing) que celle du projet
aujourd'hui.

Vérifié techniquement : `create-broadcast` accepte `html` brut en plus du
mode visuel TipTap — on utilisera le HTML brut pour garder l'identité de
marque déjà établie dans les emails transactionnels, au prix de perdre
l'édition visuelle dans le dashboard Resend (compromis assumé : cohérence
visuelle plutôt que confort d'édition, dans un projet qui a toujours
privilégié le premier).

## Architecture

```
Samedi 13h37 Paris
  └─ .github/workflows/newsletter-hebdo.yml
       └─ scripts/newsletter-hebdo.mjs
            ├─ lit src/content/blog/*.md (articles publiés, 7 derniers jours)
            ├─ lit data/cotes/podiums-hebdo.json (podium du jeudi, déjà
            │    recoupé contre TCGplayer en amont — voir "Double check
            │    des prix")
            ├─ compose le HTML (table-based, styles inline, identité de
            │  marque existante — voir gabarit validé)
            ├─ resend.create-broadcast (segment "General", brouillon)
            └─ envoie un email à Julian avec le lien du brouillon
```

### Petit ajout nécessaire à `cote-hebdo`

Le podium du jeudi (top 3 hausses) n'est aujourd'hui **jamais persisté** :
il vit dans `.cote-cache.json` (gitignore) le temps du run GitHub Actions
puis disparaît. Pour que le samedi puisse le relire, `publie-cote.mjs`
doit l'archiver dans un fichier committé, `data/cotes/podiums-hebdo.json`
(append-only : `{date, marche, podium}` par semaine).

Effet de bord nul sur Discord/Buffer, qui continuent de lire directement
`.cote-cache.json` comme avant — c'est un ajout, pas une modification du
chemin existant.

## Double check des prix (ajouté le 26 août, à la demande de Julian)

**Version 1 (abandonnée) :** recoupement contre la page produit
Cardmarket publique. Testé en réel le 26 août : Cardmarket est protégé
par Cloudflare et renvoie 403 (`Cf-Mitigated: challenge`) sur toute
requête HTTP simple, même avec un user-agent de navigateur réaliste.
Aucun scraping possible sans un navigateur complet, hors de proportion
pour ce besoin.

**Version 2 (retenue), implémentée directement dans `cote-hebdo.mjs` :**
TCGdex renvoie, dans la même réponse déjà utilisée, les prix TCGplayer
(marché américain, USD) en plus de Cardmarket (EUR) — vérifié sur des
cartes réelles. Le script convertit le prix TCGplayer en euros (taux
fixe approximatif, 0,92, une conversion précise n'est pas nécessaire
pour un contrôle de plausibilité) et rejette la carte si le ratio entre
les deux marchés dépasse 3x dans un sens ou dans l'autre.

Avantages sur la V1 : zéro nouvelle dépendance, zéro risque de blocage
(API déjà en production), et deux marchés réellement distincts (vendeurs
et acheteurs différents) plutôt qu'un simple second lecteur de la même
donnée Cardmarket — contrairement aux alternatives explorées (PokéWallet,
Pokemon-API.com, CardMarket-api.com), qui republient toutes la même
source. Une carte sans cotation TCGplayer (fréquent sur les promos)
n'est PAS rejetée : l'absence de second avis n'est pas un signal,
contrairement à un désaccord entre les deux marchés.

Comme ce garde-fou vit dans `cote-hebdo.mjs` (pas dans le script de la
newsletter), il profite aussi aux posts Discord/Buffer du jeudi, pas
seulement au digest du samedi. Validé sur un run réel le 26 août : a
effectivement écarté une carte (Méga-Camérupt-ex, 4,70 € Cardmarket
contre ~1,44 € converti TCGplayer, ratio 3,25).

## Contenu de l'email

- **En-tête** : logo, bandeau "Le récap de la semaine"
- **Articles** : un bloc par article publié dans les 7 derniers jours
  (catégorie, titre, accroche, vignette, lien) — tiré du frontmatter,
  aucune rédaction supplémentaire
- **Tendances de prix** : le podium du jeudi (si disponible et recoupé),
  carte + set + variation, avec la mention "informatif, ne constitue pas
  un conseil d'achat"
- **Pied de page** : lien de désabonnement Resend (`{{{RESEND_UNSUBSCRIBE_URL}}}`,
  obligatoire légalement)

Gabarit HTML validé par Julian le 26 août (table-based, styles inline,
identité visuelle sombre/bleu reprise des emails transactionnels
existants). Exemple envoyé et approuvé — articles réels de la semaine
(Pokémon Worlds 2026, Bandai anti-scalping), tendances de prix fictives
pour la maquette.

## Approbation et envoi

`create-broadcast` crée le brouillon, jamais `send-broadcast`. Le script
envoie ensuite un court email à l'adresse perso de Julian avec le lien
direct vers le brouillon dans le dashboard Resend. Julian relit,
ajuste si besoin, et clique envoyer lui-même.

## Cas limites

- Zéro article ET zéro podium cette semaine → aucun brouillon créé, log
  seulement (ne devrait jamais arriver, l'article du mardi est
  obligatoire)
- Podium présent mais toutes les cartes rejetées par le recoupement prix
  → digest envoyé sans section tendances, pas d'échec
- `data/cotes/podiums-hebdo.json` absent ou sans entrée pour la semaine
  (ex. panne du jeudi) → section tendances omise, pas d'échec
- Segment vide → brouillon créé quand même, inoffensif

## Hors scope v1

Pas de fichier d'état "digest déjà généré cette semaine" : un
re-déclenchement manuel créerait un second brouillon, sans risque
puisque rien n'envoie automatiquement. Ajoutable plus tard si ça devient
gênant en pratique.
