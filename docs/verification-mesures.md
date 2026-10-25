# Vérification : pièges de mesure

Texte sorti de la section « Vérification » de `CLAUDE.md` le 25 octobre 2026 pour alléger le contexte de chaque session,
conservé tel quel. `CLAUDE.md` garde la règle de fond : vérifier en production avant d'affirmer qu'un correctif est réglé.
À lire avant de conclure sur une mesure de rendu, un balisage FAQ ou un chiffre de trafic.

## Navigateur : faux positifs de mesure

⚠️ **Les titres `.reveal-h2` sont décalés de 32px dans ce navigateur.**
Ils portent `opacity: 0; transform: translateY(32px)`, levés par un
IntersectionObserver au défilement, qui ne se déclenche jamais ici.
`getBoundingClientRect()` incluant les transformations, toute mesure de
position d'un `h2` est fausse de 32px, et un élément suivant paraît
« au-dessus » de lui. Neutraliser avant de conclure :

```js
const m = new DOMMatrix(getComputedStyle(h2).transform);
const basReel = h2.getBoundingClientRect().bottom - m.f;
```

Sans ça, on conclut par exemple qu'un `margin-bottom` « n'a aucun effet »
alors qu'il fonctionne parfaitement : erreur commise le 19 août 2026.

⚠️ **`scrollWidth > clientWidth` n'est PAS une preuve de débordement.**
L'emprise *peinte* d'un élément transformé compte dans le débordement
défilable de son conteneur, même si rien ne dépasse à l'écran. Le chevron
de la FAQ (`::after` de 9px + 2px de bordure, tourné à 45°) peint sur
15,6px : chaque `<summary>` signalait donc 2px de débordement alors que
le chevron reste à 21px du bord de sa carte, absorbé par le `padding`.

Six « défauts » détectés, zéro réel. Même famille que les faux positifs
d'`object-fit` et de `rotateY` déjà consignés dans `.claude/rules/landing-public.md`. Le seul signal
qui tranche est celui du document :

```js
document.documentElement.scrollWidth > innerWidth   // là, c'est vrai
```

Pour un élément précis, comparer les bords réels plutôt que les largeurs :
`element.getBoundingClientRect().right > parent.getBoundingClientRect().right`.

⚠️ **Ce signal du document a lui-même un faux positif : `overflow-x: clip`.**
Le `<body>` le porte, si bien qu'un carrousel volontairement plus large que
l'écran (`#licenceTrack`, 2240px, encapsulé dans un conteneur en
`overflow-x: hidden`) gonfle `documentElement.scrollWidth` sans que rien ne
dépasse ni ne défile. Mesuré le 2 septembre 2026 : 1035px de `scrollWidth`
pour 985px de fenêtre, et pourtant aucun défilement possible.

Le seul test qui tranche est donc de TENTER le défilement :

```js
const de = document.documentElement, avant = de.scrollLeft;
de.scrollLeft = 9999;
const vraiDebordement = de.scrollLeft > 0;   // verdict fiable
de.scrollLeft = avant;
```

⚠️ **Autre piège, sur la mesure d'une largeur responsive :** réduire un
conteneur en JavaScript (`element.style.width = '1050px'`) ne reproduit PAS
un vrai redimensionnement de fenêtre : les `@media` ne se réévaluent pas et
les pourcentages se recalculent sur une autre base. Un balayage de 720 à
1100px fait ainsi conclure « aucun débordement » là où un vrai
`resize_window` à 1050px révèle 10px de débordement sur « Cardmarket ».
Toujours redimensionner la fenêtre, jamais le conteneur.

### Limites de l'environnement de test
- Le navigateur headless **ne défile pas** (`window.scrollTo` sans effet) et ne
  compose pas de frames → **transitions et animations CSS ne s'exécutent pas**.
  Ne jamais conclure « le scroll fonctionne » depuis ce navigateur ; mesurer
  les valeurs CIBLES en neutralisant les transitions, et dire honnêtement que
  le rendu animé reste à valider sur un vrai téléphone.
- Le Chrome de l'utilisateur a des extensions qui **bloquent Vercel Analytics**
  (`transferSize: 0`). Ses propres visites ne sont jamais comptées.

## Balisage et trafic

### Balisage FAQPage : le visible et le JSON-LD doivent concorder

Un `FAQPage` dont les questions-réponses ne figurent pas *visiblement*
sur la page est traité comme du balisage trompeur, et la sanction porte
sur la page entière. Le risque n'est pas de mal l'écrire au départ : c'est
de corriger une réponse dans le HTML et d'oublier le JSON-LD.

```bash
node scripts/verifie-faq.mjs   # 0 si les deux concordent, 1 sinon
```

Le contrôle normalise `&nbsp;`, les entités et les apostrophes typographiques
avant de comparer, sans quoi chaque « 3 % » signale une fausse divergence.

⚠️ Pour éprouver un contrôle de ce genre, viser une chaîne tenant sur **une
seule ligne** : `sed` travaille ligne par ligne et ne remplacera jamais un
texte que le formatage a coupé en deux. Un test qui ne modifie rien laisse
croire que le garde-fou est aveugle.

### Mesure du trafic : Vercel Web Analytics

Actif et collecteur depuis le 1er août 2026 (commit `3fa51b3`, script posé sur toutes les
pages). Trois pièges, tous rencontrés le 30 septembre 2026 :

- **Interroger l'API SANS identifiant d'équipe.** Le projet `cards-trading` répond dans le
  scope personnel : avec `teamId`, Vercel renvoie 404 (« Project not found ») ou « Web
  Analytics not found ». Le matin du 30 septembre, `RESTE-A-FAIRE.md` a consigné à tort
  « l'API répond introuvable, à vérifier dans le tableau de bord » : c'était un mauvais
  cadrage de l'appel, pas une désactivation. Même famille que le `curl` sans `-L` (voir `docs/deploiement-vercel.md`) :
  reproduire l'appel autrement avant de théoriser sur la cause.
- **Le plan Hobby ne donne que les 31 derniers jours** pour toute ventilation (source, page,
  appareil) : au-delà, l'API répond 400. Le compteur global depuis l'activation reste lisible,
  pas son détail. Sans relevé en début de mois, le passé se perd.
- **Les UTM sont payants** (Web Analytics Plus, réponse 402) : la source se lit dans
  `referrerHostname`, jamais dans `utmSource`.

⚠️ **« Visiteurs » sur plusieurs jours est une somme de visiteurs quotidiens.** Un lecteur revenu
trois jours compte trois fois : mesuré le 30 septembre, le total du mois est égal à la somme
des totaux de chaque jour. C'est donc un majorant des personnes distinctes, et un taux de
conversion calculé dessus est une borne basse.

Les chiffres de trafic et d'inscrits n'ont pas leur place ici : le dépôt est public.
