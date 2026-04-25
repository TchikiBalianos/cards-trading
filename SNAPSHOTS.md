# Snapshots & Versioning

## v0.0.1 (2026-04-25)
**Status:** Initial landing page with responsive design
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

## Future Snapshots
À remplir au fur et à mesure des itérations.
