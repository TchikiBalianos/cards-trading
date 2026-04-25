# 🚀 Setup Guide - Cards Trading Backend

Ce guide explique comment configurer Resend, Supabase et déployer l'application sur Vercel.

## 📋 Prérequis

- Compte GitHub (déjà connecté à Vercel)
- Compte Supabase (gratuit)
- Compte Resend (gratuit pour 100 emails/jour)

---

## 1️⃣ Configuration Resend

### Créer un compte Resend
1. Allez sur [resend.com](https://resend.com)
2. Créez un compte gratuit
3. Allez dans **Settings** → **API Keys**
4. Copiez votre **API Key** (commence par `re_`)

### Domaine Email (Important)
- Gratuit : `noreply@cards-trading.vercel.app` (fourni par défaut)
- Personnalisé : ajouter un domaine personnalisé si désiré

---

## 2️⃣ Configuration Supabase

### Créer un projet Supabase
1. Allez sur [supabase.com](https://supabase.com)
2. Cliquez **"New Project"**
3. Remplissez :
   - **Project Name:** `cards-trading`
   - **Database Password:** Générez une forte password
   - **Region:** EU (si vous êtes en Europe)
4. Attendez que le projet soit créé (2-3 minutes)

### Créer la Table
1. Allez sur **SQL Editor**
2. Créez une **New Query**
3. Collez le contenu de `supabase/migrations/create_beta_submissions.sql`
4. Cliquez **Run**

### Récupérer les Clés
1. Allez sur **Settings** → **API**
2. Copiez :
   - **Project URL** (commence par `https://...supabase.co`)
   - **anon public key** (votre clé d'accès public)

---

## 3️⃣ Configuration Vercel

### Ajouter les Variables d'Environnement
1. Allez sur [vercel.com/dashboard](https://vercel.com/dashboard)
2. Sélectionnez le projet **cards-trading**
3. Allez dans **Settings** → **Environment Variables**
4. Ajoutez ces variables :

```
RESEND_API_KEY = re_xxxxxxxxxxxx (de Resend)
SUPABASE_URL = https://xxxx.supabase.co (de Supabase)
SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (de Supabase)
```

5. Cliquez **Save**

### Redéployer
1. Allez dans **Deployments**
2. Cliquez sur le dernier déploiement
3. Cliquez **Redeploy** pour que les nouvelles variables d'env soient utilisées

---

## 4️⃣ Tester Localement

### Installation des dépendances
```bash
npm install
```

### Créer .env.local
```bash
cp .env.local.example .env.local
```

Puis remplissez avec vos clés Resend et Supabase.

### Lancer le serveur local
```bash
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000)

### Tester le formulaire
1. Remplissez le questionnaire
2. Acceptez le RGPD
3. Cliquez "Valider"
4. Vérifiez que vous recevez un email à **julian.schmerkin@gmail.com**
5. Allez sur Supabase → **Table Editor** → `beta_submissions` pour voir la donnée

---

## 🔒 Sécurité

✅ **Ce qui est fait :**
- Validation côté serveur
- Chiffrement en transit (HTTPS)
- Row Level Security (RLS) sur Supabase
- API key Resend sécurisée (env variable)
- Pas de données sensibles en public

⚠️ **À faire :**
- Ajouter rate limiting si déploiement public
- Monitorer les logs Resend/Supabase
- Faire des backups Supabase régulièrement

---

## 📊 Structure de la Base de Données

Table `beta_submissions`:
```
id              (BigInt, PK)
nom             (String)
prenom          (String)
email           (String, indexed)
age             (String)
genre           (String)
tcgs            (Text, comma-separated)
platform        (String)
profile         (String)
rgpd_accepted   (Boolean)
submitted_at    (Timestamp, indexed)
ip_address      (String)
created_at      (Timestamp)
```

---

## 🐛 Troubleshooting

### "Email not sending"
- Vérifiez la clé API Resend dans Vercel Settings
- Vérifiez que l'email est vérifié dans Resend console

### "Database error"
- Vérifiez `SUPABASE_URL` et `SUPABASE_ANON_KEY` dans Vercel
- Vérifiez que la table est créée dans Supabase
- Activez les logs API Supabase pour déboguer

### "CORS error"
- Ne devrait pas arriver car c'est un API interne Vercel
- Si ça arrive, vérifiez les headers dans `/api/submit-form.js`

---

## 📚 Liens Utiles

- [Resend Docs](https://resend.com/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Vercel Docs](https://vercel.com/docs)
- [RGPD compliance](https://gdpr-info.eu/)

---

**Dernière mise à jour:** 25 avril 2026
