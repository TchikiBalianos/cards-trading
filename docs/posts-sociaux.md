# Posts éditoriaux X, Instagram et Facebook

Texte sorti de `CLAUDE.md` le 25 octobre 2026 pour alléger le contexte de chaque session, conservé tel quel.
À lire avant de préparer, valider ou modifier les posts, leurs visuels ou les cartes Build in Public.
Les pièges de l'API Buffer (brouillon daté, `editPost`, quotas, étiquettes) sont dans `.claude/rules/buffer-api.md`,
qui se charge seul sur les scripts Buffer.

## Posts éditoriaux X et Instagram : un par jour, validés dans Buffer

Depuis le 29 septembre 2026, les réseaux ne se limitent plus au relais des articles.
Un post par réseau et par jour, cible **Pokémon 70 % / One Piece 30 %**, inspirée de
@ActuPokemon7 (actu, cotes, humour) et @pokeitem_ (build in public).

**Grille.** Les relais automatiques tiennent le mercredi (article du mardi), le vendredi
(cotes) et le samedi (article du vendredi). L'éditorial prend les quatre autres jours,
calculés par `planEditorial` dans `scripts/lib/semaine-sociale.mjs` :

| Jour | Pilier | Licence |
|---|---|---|
| Lundi | « Ça vaut combien ? » (cote sourcée) | Pokémon |
| Mardi | Actu (révélation, calendrier, anecdote) | inverse de l'article du mardi |
| Jeudi | Humour et communauté | inverse de l'article du mardi |
| Dimanche | Coulisses (build in public) | mixte |

Créneaux : X 10h20, Instagram 11h30 (heure de Paris, converties par `Intl`, le
passage à l'heure d'hiver tombe le 25 octobre 2026). TikTok reste le compte personnel de
Julian, hors périmètre. **Facebook** (page Cards Trading) y entre le 23 octobre 2026 : même
légende qu'Instagram, où « lien du site en bio » devient un vrai lien (`texteFacebook`), même
visuel portrait, même heure ; les relais d'articles et de cotes y partent aussi.

**Sortie du jour** (Julian, 30 octobre 2026) : un post qui annonce une sortie le jour même part
**le matin** sur Instagram et Facebook (`instagram.heure` à 09:30), sans attendre 11h30 ou 15h00.

**Circuit.** La routine du samedi (tâche Desktop `social-cards-trading-semaine`) écrit
`data/social/<lundi>.json` et le pousse sur `main`. Ce push déclenche
`brouillons-sociaux.yml` : validation, visuels (`scripts/lib/visuel-social.mjs`, modèles
texte, carte, photo), commit, attente du 200 en production, puis création de
**brouillons datés** dans Buffer et email à Julian. Il relit dans Buffer et clique
**Schedule Post**. `controle-social.yml` (quotidien, 15:30 UTC) le prévient seulement
si quelque chose cloche.

```bash
node scripts/semaine-sociale.mjs --plan                       # grille de la semaine à préparer
node scripts/brouillons-sociaux.mjs --valider                 # règles éditoriales, sans réseau
node scripts/brouillons-sociaux.mjs --phase=brouillons --dry-run
node scripts/semaine-sociale.mjs --controle --dry-run         # exige BUFFER_API_KEY
```

### Règles éditoriales, refusées par `valider` avant tout envoi

Aucun tiret long. Un prix, un pourcentage ou une cote exige `sources` (liens lus en
entier, règle du 22 septembre 2026 sur les chiffres). X : 280 caractères pondérés,
2 hashtags au plus. Instagram : 5 hashtags au plus, aucun lien (« lien du site en bio »).
Une photo exige un `credit`, porté par le visuel et **jamais dans la légende** (Julian,
23 octobre 2026).

**Lexique des raretés Pokémon** (Julian, 18 octobre 2026) : les fans français disent **AR**
(une étoile dorée, « Illustration rare »), **ALT** (deux étoiles dorées, « Illustration
spéciale rare ») et **GOLD** (trois étoiles dorées, « Méga Hyper Rare »). TCGdex renvoie les
noms officiels : les traduire. `valider` refuse les noms officiels dans les textes comme sur
le visuel. Depuis le 21 octobre 2026, la règle vaut aussi pour les **articles Pokémon** : le
nom officiel n'y est admis qu'entre parenthèses juste après le terme des fans, et l'email de
relecture signale tout écart (`points_de_vigilance`, lexique partagé dans `lexique.mjs`).
**Une phrase par ligne** : `unePhraseParLigne` (dans `brouillons.mjs`) passe à la
ligne après chaque fin de phrase au moment de l'envoi à Buffer, sans toucher aux listes
numérotées, aux abréviations ni aux citations.

**Vivier de photos** (`data/visuels/vivier.json`, 22 octobre 2026) : le catalogue des photos
réutilisables pour un visuel `photo`, avec auteur, licence, page source et sujets. Le dépôt
étant public, il ne garde que des liens. Trois licences admises, contrôlées par
`vivier.test.mjs` : `unsplash`, `propre` (photo de Cards-Trading servie sous
`public/assets/social/photos/`, sans visage ni donnée personnelle) et `autorisation` (photo
de la communauté, avec le lien de l'accord écrit dans `preuve`). Les visuels officiels des
éditeurs n'y entrent pas : leurs kits presse sont réservés à un usage éditorial.

**Piliers d'appoint** (22 octobre 2026) : `calendrier`, `guide`, `duel` et `retro`, hors de
la grille de `planEditorial`, pour un post en plus un jour de relais (heure décalée, X
10:50, Instagram 15:00). **Occasionnels** (Julian, 25 octobre 2026) : au plus un par semaine,
ajouté à la main et seulement quand il y a un vrai sujet (des sorties à dater, un vrai
anniversaire). La routine du samedi n'en écrit jamais.

Une photo dont la licence n'exige pas de crédit (aujourd'hui Unsplash seul,
`HOTES_CREDIT_FACULTATIF` dans `visuel-spec.mjs`) garde son `credit` dans la spec, mais il
quitte le visuel X ; il reste sur celui d'Instagram, où la photo est centrée entre deux
bandes de flou (décisions de Julian, 14 octobre 2026). Ajouter un hébergeur à la liste
seulement après avoir lu sa licence à la source. Un visuel refait après publication porte
`visuel.version` (2, 3…) : son fichier prend le suffixe `-v2`, et le circuit l'utilise ensuite
pour les autres réseaux.

**Le post cité est notre meilleur format sur X** : le lien du post d'origine en fin de
texte a donné nos meilleures impressions (430 et 342, contre environ 200 pour un relais
d'article). @pokeitem_ tire son record d'une vidéo d'humour qui parle à tous, 60 fois sa
médiane : l'humour communautaire n'est pas du remplissage.

**Ce que ce système ne fait pas** : le temps réel. Les alertes de réapprovisionnement,
premier moteur de portée d'@ActuPokemon7, ne se planifient pas une semaine à l'avance.
Julian a choisi de ne pas les couvrir.

### Build in Public : les cartes « Set de base »

Le post « coulisses » du dimanche est une carte numérotée d'un set (visuel `type: "bip"`,
`scripts/lib/carte-bip.mjs`), tirée d'une banque d'épisodes **privée**, hors de ce dépôt.
Charte complète : `docs/build-in-public/charte.md`. Le numéro compte les posts de la
saison, jamais l'avancement du MVP. La validation refuse toute fuite (clé, IP, email,
chemin) dans les textes de la carte, et les lignes trop longues plutôt que de les couper.
La police DejaVu Sans Mono est installée par `brouillons-sociaux.yml` : sans elle, les
bordereaux en chasse fixe débordent.

### Fonds des visuels : des motifs dessinés, plus d'IA

Le fond IA de Pollinations.ai est tombé le 29 septembre 2026 (HTTP 402 depuis l'accès
anonyme, puis 500 sur limite de débit en amont, le nouvel accès `gen.pollinations.ai`
exigeant une clé). `scripts/lib/motifs.mjs` le remplace : huit familles en SVG (rayons,
hexagones, courbes de niveau, demi-teinte, constellation, vagues, diagonales, orbites),
choisies et déclinées par le slug de l'article ou le titre du post, à la couleur
d'accent de la licence. Sans réseau, sans clé, et le même slug redonne toujours la
même image.

⚠️ **Ne jamais `--force` sur l'existant.** Régénérer une vignette publiée change l'image
sous la même URL, alors que `/assets/` est servi en cache immuable d'un an : personne ne
la reverrait. Seules les vignettes créées après le 30 septembre 2026 portent un motif,
les autres gardent leur fond d'origine. `VIGNETTES_SORTIE=<dossier>` permet de juger un
rendu sans toucher à `public/`.
