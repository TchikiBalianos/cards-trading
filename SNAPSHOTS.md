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
**Status:** Navigation & Layout Refinement
**Founders:** Julian Schmerkin & Valérian Selvon
**Major Changes:**
- ✅ **Navigation Sticky** :
  - Header fixé au top avec glass-morphism backdrop (blur 16px)
  - Menu navigation avec 5 sections : Avantages, Beta, Fonctionnalités, Comparaison, Vendeur Pro
  - Scroll-spy : Active links highlighting automatique basé sur IntersectionObserver
  - Underline animation hover/active sur desktop
  - Hamburger menu animé sur mobile (<768px)
  - Fermeture menu au clic sur lien ou clic extérieur
  - Transition smooth scale-in hamburger (45deg rotations)
  - Scroll shrink : Header réduit légèrement après 40px de scroll
- ✅ **Hero Section Hero** : Corrigé complètement le chevauchement boutons/carousel
  - Contenu texte width: 100% (avec max-width: 600px)
  - Padding-bottom augmenté (140px → 200px)
  - Margin-top: auto sur buttons pour positionnement optimal
  - Adaptations responsive à tous les breakpoints (980px, 768px, 600px)
- ✅ **CSS Enhancements** :
  - rgba backdrop-filter pour effet glassmorphism moderne
  - Z-index management (1000 header, 1001 hamburger)
  - Transitions fluides (0.3s à 0.35s ease)
  - Fixed positioning avec perfect viewport coverage

**Responsive Breakpoints:**
- Desktop (1280px+): Navigation horizontale complète
- Tablet (768px-980px): Navigation horizontale, hamburger caché, layout column hero
- Mobile (<768px): Hamburger visible, menu déroulant fixe, navigation collapse

**Git Tag:** `git tag v0.0.4`

---

## Future Snapshots
À remplir au fur et à mesure des itérations.
