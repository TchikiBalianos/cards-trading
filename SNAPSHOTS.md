# Snapshots & Versioning

## v0.0.1 (2026-04-25)
**Status:** Initial landing page with responsive design
**Founders:** Julian Schmerkin & Valérian Selvon
**Key Features:**
- Hero section avec carousel de logos TCG
- Section avantages (Acheteur/Vendeur toggle)
- Features carousel (Card Scanner, Market Tracker, Smart Wishlist, Filtres avancés)
- Tableau comparatif vs Cardmarket, eBay, Vinted
- Questionnaire multi-étapes pour inscription beta
- Section seller tools avec carousel
- Design mobile-first responsive (600px, 980px breakpoints)

**Git Tag:** `git tag v0.0.1`

---

## v0.0.2 (2026-04-25)
**Status:** Production-ready with backend integration
**Founders:** Julian Schmerkin & Valérian Selvon
**Major Changes:**
- ✅ Ajout Dragon Ball & Riftbound aux TCG du formulaire
- ✅ Intégration Resend pour envoi d'email
- ✅ Configuration Supabase pour stockage des données
- ✅ API route Vercel (/api/submit-form)
- ✅ Checkbox RGPD avec lien vers mentions légales
- ✅ Pages CGU et Mentions Légales complètes
- ✅ Design amélioré bloc avantages (gradients, animations hover)
- ✅ Responsive corrections pour tablet et mobile
- ✅ Formulaire multi-étapes entièrement fonctionnel
- ✅ Validation côté serveur
- ✅ RLS (Row Level Security) sur Supabase
- ✅ Documentation setup complète

**Performance:**
- Page load: ~2.4s (Vercel CDN)
- API response: ~200ms (Resend + Supabase)

**Testing:**
- ✅ Mobile (320px, 375px, 480px)
- ✅ Tablet (600px, 768px, 980px)
- ✅ Desktop (1280px+)
- ✅ Formulaire submission end-to-end
- ✅ Email delivery verification

**Security:**
- ✅ HTTPS everywhere
- ✅ RGPD compliant
- ✅ Server-side validation
- ✅ Environment variables protected
- ✅ RLS policies active
- ✅ No hardcoded secrets

**Git Tag:** `git tag v0.0.2`

---

## v0.0.3 (2026-04-26)
**Status:** UI/UX Polish & Layout Hardening
**Founders:** Julian Schmerkin & Valérian Selvon
**Major Changes:**
- ✅ **Design UI/UX global** : Intégration de `AOS` pour des animations au scroll (fade-up).
- ✅ **Hero Section** : 
  - Refonte du layout avec `align-items: stretch` et `gap` dynamique (`vh`) pour un espacement vertical harmonieux et responsive, particulièrement sur grand écran (1080p+).
  - Ajout d'un halo radial d'arrière-plan.
  - **Fix du chevauchement boutons/carousel** : Augmentation largeur du contenu texte (60% → 100% avec max-width: 600px), padding-bottom desktop (140px → 200px), ajout margin-top: auto au button-container, adaptations breakpoints tablet (980px) et mobile.
- ✅ **Comparatif & Mobile** : Effet néon (glow bleu) sur la colonne Cards-Trading en desktop. Remplacement du tableau par des cartes interactives sur mobile.
- ✅ **Formulaire (Beta)** :
  - Rendu de la hauteur 100% dynamique (`height: auto` gérée en JS avec `offsetHeight` et transitions) pour épouser le contenu de chaque étape (évite les espaces vides ou coupures).
  - Correction de l'image de fin (Goku) qui écrasait le conteneur en absolue : remise dans le flux normal.
  - Fixation du bouton Valider pour éviter son aplatissement visuel.
- ✅ **Vendeur Pro** : Correction d'une erreur de syntaxe JS (`});`) qui empêchait l'exécution du script. Réactivation de l'affichage des contrôles manuels (`display: flex`) pour naviguer dans le carrousel.
- ✅ **Fonctionnalités** : Ajout d'espace (`padding-bottom`) sous les bullets de pagination pour aérer la section.
- ✅ **Footer & Navigation** : Retrait des adresses email de la colonne "Légal & Contact". Réorganisation de l'ordre global du site (Avantages -> Beta -> Fonctionnalités -> Comparatif -> Vendeur Pro). Structure sticky navbar ajoutée (en cours).

**Git Tag:** `git tag v0.0.3`

---

## v0.0.4 (2026-04-26)
**Status:** Navigation, Layout & Responsive Polish
**Founders:** Julian Schmerkin & Valérian Selvon
**Major Changes:**

### Navigation Sticky
- ✅ Header fixé au top avec glass-morphism backdrop (blur 16px)
- ✅ Menu navigation avec 5 sections : Avantages, Beta, Fonctionnalités, Comparaison, Vendeur Pro
- ✅ Scroll-spy : Active links highlighting automatique basé sur IntersectionObserver
- ✅ Underline animation hover/active sur desktop
- ✅ Hamburger menu animé sur mobile (<768px)
- ✅ Fermeture menu au clic sur lien ou clic extérieur
- ✅ Scroll shrink : Header réduit légèrement après 40px de scroll

### Hero Section - Desktop & Mobile
- ✅ Desktop : Contenu texte width: 100% pour meilleure répartition
- ✅ Mobile : 
  - Text-shadow blanc + webkit-text-stroke sur sous-titre bleu pour lisibilité
  - Tous les textes centrés (text-align: center)
  - Boutons centrés et élargis (85% width, responsive flex-wrap)
  - Padding-bottom augmenté (140px → 200px desktop, 160px mobile)

### Features Section
- ✅ Bullets spacing : Augmenté padding-bottom de 30px → 60px pour meilleur aération

### Vendeur Pro Section
- ✅ Mobile : Conversion carousel 3D en slider horizontal scrollable
- ✅ Touch-friendly (-webkit-overflow-scrolling: touch)
- ✅ Styled scrollbar (rgba bleu gradient)
- ✅ Cards affichées une à la fois en mobile, smooth scroll

### Footer
- ✅ Media query 601px-980px : Layout 3-tiers (Plateforme | TCG | Légal)
- ✅ Mobile (<600px) : Colonne unique préservée
- ✅ Optimal spacing et gap management

**Responsive Design Completed:**
- ✅ Desktop (1280px+): Full navigation, optimal spacing
- ✅ Tablet (768px-980px): Hamburger hidden, 3-column footer
- ✅ Landscape (601px-980px): 3-tier footer layout
- ✅ Mobile (<600px): Single column, hamburger visible
- ✅ All sections tested for layout stability, button clickability, text readability

**Git Tag:** `git tag v0.0.4`

---

## v0.0.5 (2026-04-26)
**Status:** Mobile & Desktop Full Polish — Review Complete
**Founders:** Julian Schmerkin & Valérian Selvon
**Major Changes:**

### Mobile (412px) — Corrections critiques
- ✅ **Navbar** : Plus de débordement horizontal (width 100% au lieu de 100vw, overflow-x hidden sur html/body)
- ✅ **Hero** : Espacements resserrés (titre↔navbar, mockup↔carousel licences)
- ✅ **Beta** : Titre et texte intro centrés, labels formulaire alignés à gauche
- ✅ **Fonctionnalités** : Items de liste contenus dans la card (position relative au lieu d'absolute), image phone visible
- ✅ **Comparaison** : Tableau remplacé par carousel horizontal swipeable (scroll-snap), Cards-Trading mis en avant
- ✅ **Vendeur Pro** : Refonte complète — liste numérotée avec CSS counters (cercles bleus), carousel horizontal scroll (contrôles ‹ › cachés sur mobile)
- ✅ **Fix CSS nesting bug** : `.col-right { .carousel-wrapper { ... } }` → `.carousel-wrapper.col-right { ... }` (selector mismatch corrigé)
- ✅ **Footer** : Layout 3 colonnes (PLATEFORME | TCG SUPPORTÉS | LÉGAL & CONTACT)

### Desktop (1280px) — Vérification complète
- ✅ Hero 2 colonnes, Avantages 3 cartes, Beta formulaire 2 colonnes
- ✅ Fonctionnalités avec carte feature + image device, dots de pagination
- ✅ Comparaison tableau + texte "L'Offre la Plus Complète"
- ✅ Vendeur Pro liste features + carousel 3D avec ‹ › controls
- ✅ Footer 4 colonnes

**Git Tag:** `git tag v0.0.5`

---

## v0.0.6 (2026-04-26)
**Status:** Phase 1 — Micro-animations & Hover Polish
**Founders:** Julian Schmerkin & Valérian Selvon
**Changes:**
- ✅ `@keyframes pulse-dot` — dot actif des fonctionnalités pulse doucement
- ✅ `@keyframes cta-attention` — CTA hero pulse glow toutes les 4s (after 3s delay)
- ✅ `@keyframes label-select` — spring bounce sur la sélection d'option quiz
- ✅ Comparaison table: `tr:hover` highlight subtil sur les lignes desktop
- ✅ Vendeur Pro items desktop: hover lift (`translateX(6px)`) + glow blue
- ✅ Features dots: animation `pulse-dot` sur le dot actif + hover state sur inactifs
- ✅ Licence carousel: pause on mouse hover (mouseleave reprend)
- ✅ Hero CTA button: `animation: cta-attention 4s infinite` pour attirer l'oeil

**Git Tag:** `git tag v0.0.6`

---

## Future Snapshots
À remplir au fur et à mesure des itérations.
