# Réseaux sociaux et SEO : lever le plafond de conversion

*8 septembre 2026*

## Le constat qui déclenche ce chantier

Sur 26 inscrits, 11 ont une provenance connue : 6 viennent des moteurs de
recherche et des moteurs IA (ChatGPT, Google, Perplexity), **aucun des réseaux
sociaux**, malgré deux semaines de publication automatique.

Les chiffres Buffer des 30 derniers jours situent le problème :

| Compte | Posts | Réactions | Commentaires | Portée |
|---|---|---|---|---|
| TikTok `tchikibalianos` | 15 | 169 | 47 | 6171 |
| X `CardsTradingCom` | 6 | 7 | 1 | 1365 impressions |
| Instagram `cardstradingcom` | 6 | 9 | 6 | 395 |

TikTok concentre 91 % de l'engagement. Le taux d'engagement global (3,45 %) est
correct : les gens réagissent, ils ne s'inscrivent pas.

Deux hypothèses ont été écartées en vérifiant plutôt qu'en supposant :

- **« Le compte TikTok ne renvoie à rien vers la marque. »** Faux. La bio dit
  déjà « TCG addict. Pokemon, OnePiece, Dragon Ball [...] 🚧 Building 👉
  Cards-Trading.com ». Seuls l'avatar et le pseudo restent personnels.
- **« C'est un problème d'audience héritée. »** Insuffisant. La portée (6171)
  dépasse largement les 436 abonnés : la distribution vient de l'algorithme,
  pas des abonnés historiques.

Ce qui reste, et que ce chantier attaque : les posts TikTok automatiques sont
des **images statiques**, format que l'algorithme pousse bien moins que la
vidéo native.

## Contraintes posées

- Pas de rebrand du compte TikTok : Julian y publie encore du contenu personnel.
- Pas de tournage : aucune solution ne doit exiger du temps de captation.
- Facebook et YouTube hors périmètre (plan Buffer gratuit limité à 3 canaux).
- SEO et réseaux avancent en parallèle, sans priorité de l'un sur l'autre.

## Ce qu'on construit

### 1. Filet de sécurité immédiat

Habillage de marque sur les vignettes sociales générées, et CTA « lien en bio »
explicite dans les légendes TikTok et Instagram. Livrable en quelques heures,
indépendant du reste : un post reste identifiable comme Cards-Trading même
sorti de son contexte, sans passer par la bio.

### 2. Pipeline vidéo TikTok via Seedance

Un module isolé transforme la vignette existante en clip de 7 à 10 secondes,
en **image-to-video** et non en text-to-video. La distinction est le cœur de la
décision : la vignette porte le visuel réel de la carte, le modèle n'y ajoute
que du mouvement. Un text-to-video génèrerait une scène depuis zéro, avec le
risque d'inventer un visuel de carte qui ne correspond à aucun produit réel.

Seedance a été retenu parmi trois candidats viables (Kling ~0,075 $/s, Grok
Imagine, Seedance ~0,06 $/s) : le moins cher à la seconde, et ByteDance connaît
les codes du format court. CapCut a été écarté : pas d'API de montage ni
d'export côté serveur, seulement des contournements non officiels via son
moteur interne, incompatibles avec une automatisation sans surveillance.

Intégration dans `annonce-buffer.mjs`, canal TikTok uniquement. **Repli
automatique sur l'image statique** si l'appel échoue ou si un plafond de dépense
mensuel est atteint : la chaîne d'annonce ne doit jamais se bloquer sur un
souci d'API. Clé en secret GitHub Actions, comme `BUFFER_API_KEY`.

Un premier clip est généré sur un article existant et validé à l'œil avant
toute mise en service automatique.

### 3. SEO, trois volets simultanés

- **Article du vendredi obligatoire.** Il passe de facultatif à garanti, ce qui
  double le volume indexable. Effet de bord utile : 2 articles par semaine pour
  2 créneaux d'annonce par semaine, donc la file d'annonce cesse de prendre du
  retard structurellement.
- **Maillage interne.** Les nouveaux articles lient les anciens du même TCG
  dans le corps du texte, pas seulement en pied de page. La règle est contrôlée
  dans `scripts/lib/article.mjs`, au même endroit que le sommaire et la FAQ,
  pour qu'elle soit vérifiée à la publication plutôt qu'espérée.
- **Pages hub par TCG.** Des pages Astro agrègent les articles par jeu avec un
  CTA d'inscription, pour capter les recherches génériques (« carte pokemon
  prix ») en plus des articles d'actualité.

## Vérification

Chaque volet se prouve en production, jamais au build : un build vert ne dit
rien sur la landing, et ce projet a une histoire de correctifs annoncés sans
preuve.

- Clip Seedance validé visuellement avant automatisation.
- Pages hub vérifiées en ligne après déploiement, pas seulement en local.
- Le contrôle de maillage échoue bruyamment sur un article non conforme plutôt
  que de le laisser passer, comme le fait déjà le contrôle sommaire/FAQ.
- Le repli sur image statique se teste en simulant un échec d'API, pour
  confirmer qu'un post part quand même.
