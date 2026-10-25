# Discord, cote hebdomadaire et alertes d'automatisation

Texte sorti de la section « Vérification » de `CLAUDE.md` le 25 octobre 2026 pour alléger le contexte de chaque session,
conservé tel quel. `CLAUDE.md` garde les deux interdits : ne jamais réessayer automatiquement un envoi Discord, ne jamais
cliquer « Re-run » sur un `cote-hebdo` raté.
À lire avant de toucher à `annonce-discord`, `publie-cote`, `cote-hebdo` ou `alerte-automatisations`.

## Envois Discord et alertes

### Un 504 de Discord n'est pas un échec certain

Trois 504 constatés, trois messages pourtant publiés : `publie-cote.mjs` le 10 septembre et le
1er octobre 2026, `annonce-discord.mjs` le 15 septembre. Chaque fois, le message est créé en
moins de 3 s, puis la passerelle de Discord abandonne la réponse au bout de 30 s (l'identifiant
d'un message Discord contient sa date de création, c'est ce qui l'a prouvé). Comptés comme des
échecs, ils ont fait passer deux tops pour ratés (celui du 1er octobre avec un email d'alerte
par jour jusqu'au jeudi suivant, l'alerte n'existant pas encore le 10 septembre), et surtout
**fait republier le 18 septembre une annonce déjà en ligne** : `annonce-discord` ne mémorisait
un article qu'en cas de succès.

Depuis le 5 octobre 2026, les deux scripts passent par `scripts/lib/discord.mjs`, qui classe un
envoi en trois issues :

- **ok** : 2xx, identifiant du message journalisé grâce à `?wait=true` ;
- **incertain** : 504, délai de 60 s dépassé, connexion coupée, et par prudence toute erreur
  réseau qu'on ne sait pas situer avant l'envoi ;
- **échec** : 4xx, 500, 502, 503 (présumés sans publication : seuls des 504 ont été observés),
  URL de webhook invalide, redirection, ou connexion jamais établie (DNS, refus, réseau
  injoignable, délai de connexion, certificat).

Un « incertain » ne fait plus échouer l'étape, mais il n'est pas un succès : avertissement dans
le journal et **un email** (clé d'idempotence par script, jour et texte : un rejeu ne le renvoie
pas, un second incident du jour si) qui dit quel salon regarder et donne le texte à coller s'il
manque. **Si cet email ne part pas, l'étape échoue** : un avertissement dans un passage vert,
personne ne le lit. `annonce-discord` mémorise l'article avant d'envoyer l'email (étape
« Mémoriser » en `if: always()`) : une annonce manquée se rattrape à la main, une annonce
doublée non. Tests, dont trois sur un vrai serveur local : `node --test
scripts/lib/discord.test.mjs`.

⚠️ **Aucune nouvelle tentative automatique**, jamais : les webhooks Discord n'ont pas de clé
d'idempotence, et les trois 504 auraient tous donné un doublon.

⚠️ **Ne jamais cliquer « Re-run » sur un passage de `cote-hebdo` raté**, ni le relancer à la
main un autre jour. Le marché est recalculé à la date du jour : relancé une autre semaine, un
passage Pokémon peut publier un top One Piece (semaine ISO 41, par exemple), et la phase
« préparer » recalcule de toute façon un autre podium avec une autre vignette. L'option
`sans_discord` ne sert que le jour même, quand Discord est parti et Buffer non, en sachant que
le podium sera recalculé. Le
garde-fou « un seul top par jour » ne protège pas de ce cas, ni d'un Re-run du jour même (il
reprend le commit d'origine, où le podium du jour n'est pas encore archivé), ni jamais du
marché One Piece, qui n'est pas archivé. Quand Discord n'a pas confirmé, le journal affiche le
texte prévu : vérifier d'abord le salon, le coller seulement s'il manque.

⚠️ `alerte-automatisations` ne regarde que le **dernier passage terminé** de chaque workflow.
Le passage #11 du 1er octobre reste rouge jusqu'au suivant (jeudi 8 octobre) : l'email
« Cote hebdomadaire échoue » continue d'ici là, même avec ce correctif en place. L'ignorer,
et surtout ne pas cliquer « Re-run » depuis le lien qu'il contient.

Depuis le 8 octobre 2026, l'email le dit lui-même : `CONSIGNES` (dans
`scripts/alerte-automatisations.mjs`) ajoute sous un workflow sa consigne propre, et le rappel
« images en 404 » ne s'affiche plus que si la chaîne blog puis annonces est en cause. Sous
l'alerte de la cote, il faisait chercher des images qui n'existaient pas. Le chemin du 504 a été
rejoué de bout en bout ce jour-là (phase « publier », faux Discord et faux Resend sur
127.0.0.1, tout autre réseau bloqué) : 504 et email parti, passage vert ; Resend en panne,
passage rouge ; 400, rouge ; 200, vert.
