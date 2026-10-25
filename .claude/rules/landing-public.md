---
paths:
  - "public/**"
  - "src/styles/**"
---

# Landing : images, logos de réseaux, navigation mobile

Texte sorti de `CLAUDE.md` le 25 octobre 2026 pour alléger le contexte de chaque session, conservé tel quel.
Ce fichier se charge seul quand on lit un fichier de `public/` ou de `src/styles/`. Règles de cache CSS et d'images
immuables : elles restent dans `CLAUDE.md`.

## Images et logos

### Décliner un logo de réseau social

Règle de la DA : **pastille à la couleur du réseau + le « C » de
Cards-Trading en bleu de marque**, jamais la marque du réseau. La source
canonique est `public/assets/img/logo-icon.png` (512×512, fond
transparent). Les vignettes font 200×200, pastille de rayon 95 centrée,
et le « C » mesure 138px de haut, centre optique à (99, 105) :

```js
const marque = await sharp('public/assets/img/logo-icon.png')
  .extract({ left: 23, top: 53, width: 360, height: 407 })  // cadre la marque
  .resize({ height: 138 })
  .toBuffer({ resolveWithObject: true });
await sharp(Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
     <circle cx="100" cy="100" r="95" fill="COULEUR_DU_RESEAU"/></svg>`))
  .composite([{ input: marque.data, left: 38, top: 36 }])
  .png().toFile('public/assets/img/logo-social-NOM.png');
```

### Effet de bord : attributs `width`/`height` sur les `<img>`

Ces attributs ne sont pas inertes. Le navigateur les applique **comme du CSS
de spécificité 0** (« presentational hints »). Partout où une règle fixe
seulement la largeur (`.logo img`, `.footer-logo`, les cartes de slider),
l'attribut `height` reste actif et **écrase le ratio**.

En août 2026, les avoir ajoutés sur 31 images a écrasé le logo (287×68
affiché en 90×68, soit 69 % de déformation), `goku.png` et les visuels de
slider. Invisible en desktop large, flagrant sur téléphone.

Le garde-fou est en fin de `public/landing.css` :

```css
img { height: auto; }
```

Spécificité (0,0,1) : bat l'attribut, cède à toute règle portée par une
classe : les hauteurs voulues (`features.css`, `hero.css`) sont préservées.
Placée **après les `@import`**, donc gagnante sur les égalités.

⚠️ Ne pas supprimer les attributs pour autant : ils servent à déduire
`aspect-ratio` et à réserver la place avant chargement (gain CLS).
`height: auto` est justement la moitié prévue de ce mécanisme, pas son ennemi.

⚠️ **Une règle portée par une classe bat ce garde-fou : c'est voulu, mais
elle doit alors fournir l'autre moitié de la contrainte.** `features.css`
imposait `height: 80%` à `feature3.webp`, seul visuel portrait du carrousel
(848×981) : l'attribut HTML `width` continuait de s'appliquer et
`max-width: 100%` étirait l'image sur toute la colonne, d'où 30 %
d'écrasement. Dès qu'on fixe une hauteur en CSS sur une image, il faut
ajouter `width: auto` (ou `object-fit: contain`).

**Contrôle après toute modification touchant les images.** Trois pièges à
neutraliser, chacun découvert à ses dépens :

- `object-fit: contain/cover` met le contenu en boîte à lettres sans le
  déformer → ~7 faux positifs sur les logos de TCG si on ne les exclut pas ;
- `getBoundingClientRect()` inclut les transformations 3D : le `rotateY` des
  cartes de carrousel simule ~7 % de déformation. Utiliser
  `offsetWidth`/`offsetHeight` ;
- **les images `loading="lazy"` hors écran ont `naturalWidth === 0`** et
  passent donc au travers d'un filtre naïf. C'est exactement comme ça que
  l'écrasement de `feature3.webp` est resté invisible à trois passes de
  vérification. Il faut charger leur taille native à part.

```js
(async () => {
  const suspects = [];
  for (const i of document.images) {
    const cs = getComputedStyle(i);
    if (cs.objectFit === 'contain' || cs.objectFit === 'cover') continue;
    if (!i.offsetWidth || !i.offsetHeight) continue;
    // contourne le lazy-loading : naturalWidth vaut 0 tant que l'image est hors écran
    const [nw, nh] = await new Promise(ok => {
      const im = new Image();
      im.onload = () => ok([im.naturalWidth, im.naturalHeight]);
      im.onerror = () => ok([0, 0]);
      im.src = i.src;
    });
    if (!nw || !nh) continue;
    const rn = nw / nh;
    if (Math.abs(i.offsetWidth / i.offsetHeight - rn) > 0.03 * rn)
      suspects.push(i.src.split('/').pop() + ' ' + i.offsetWidth + 'x' + i.offsetHeight + ' (natif ' + nw + 'x' + nh + ')');
  }
  return suspects;
})()
```

Attendu : `[]`.

## Navigation mobile (v6)

Historique lourd : 8 tentatives avant que ça tienne. Le principe actuel :
**ne pas y toucher sans raison forte**.

- **Zéro JS de scroll.** Le navigateur gère `<a href="#section">` nativement,
  avec `scroll-behavior: smooth` + `scroll-margin-top` en CSS.
- **Transitions CSS, pas animations.** Les `animation` + `forwards` + reflow
  trick étaient la cause des « ça marche 3 fois puis ça s'arrête ».
- `closeMenuDeferred(80ms)` : le navigateur traite le `href` avant toute
  modification du DOM. Listener `hashchange` en filet de sécurité.
- `pointer-events: none` sur le panneau fermé, `touch-action: manipulation`.

Le skip-link est en `position: fixed` (pas `absolute`) : le `<body>` démarre à
y=60px à cause du margin collapsing de `.hero`, ce qui rendait le lien visible
en permanence par-dessus le logo.
