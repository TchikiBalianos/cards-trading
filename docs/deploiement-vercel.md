# Déploiement Vercel : deux pièges, récits complets

Texte sorti de la section « Vercel : contraintes du plan Hobby » de `CLAUDE.md` le 25 octobre 2026, conservé tel quel.
`CLAUDE.md` garde la règle courte de chacun ; la « règle précédente » citée ci-dessous est celle-ci : le domaine apex
redirige en 307 vers `www.`, donc utiliser `curl -L`.

- ⚠️ **Le `curl -L` de la règle précédente vaut AUSSI dans les workflows.**
  Un test d'attente qui interroge l'apex sans `-L` reçoit 307 et n'atteint
  jamais 200 : il échoue au bout de son timeout, quelle qu'en soit la durée.

  `cote-hebdo` committe sa vignette puis attend qu'elle soit servie avant
  de publier. Ce test tournait sans `-L` : les trois premiers passages
  réels du 27 août 2026 ont tous échoué là, après que le calcul, la
  vignette et le commit avaient pourtant réussi.

  **Le piège se referme deux fois**, et c'est le plus important à retenir :
  vérifier la même URL à la main avec `curl -L` répond 200, ce qui fait
  conclure « la vignette est bien là, le workflow a juste été trop
  impatient ». J'ai perdu deux itérations à élargir le timeout (5 → 12 min)
  et à documenter une fausse cause (« les déploiements Vercel s'empilent »)
  avant de comparer les deux commandes :

  ```bash
  curl -s  -o /dev/null -w '%{http_code}' "https://cards-trading.com/…"  # 307
  curl -sL -o /dev/null -w '%{http_code}' "https://cards-trading.com/…"  # 200
  ```

  Reproduire **exactement** la commande qui échoue, options comprises,
  avant de théoriser sur sa cause.

⚠️ **Le déploiement automatique sur push peut s'arrêter sans le moindre
message d'erreur : l'app GitHub de Vercel demande parfois une validation
de permissions.** Constaté le 28 septembre 2026 : `main` a reçu six
commits sans qu'aucun ne se déploie, ni en production ni même en preview.
`git push` rapportait un succès normal à chaque fois.

Cause trouvée sur `github.com/settings/installations` : l'app **Vercel**
y affichait « Permission updates requested. Review request. », en
attente depuis un moment. Tant qu'elle n'est pas validée (passkey ou
2FA, action qu'un agent ne peut pas faire à la place de l'humain), GitHub
cesse d'envoyer certains événements à l'app, dont les push sur `main`,
sans que rien ne le signale côté dépôt.

Le signal qui tranche : comparer, pour un commit donné, `gh api
repos/<owner>/<repo>/commits/<sha>/status` à l'heure du push. Une
automatisation saine dépose un statut `Vercel` à la même minute. Une
absence totale de statut (pas un échec, une ABSENCE) sur plusieurs
commits d'affilée pointe vers ce blocage, pas vers un bug de build.

```bash
gh api repos/TchikiBalianos/cards-trading/commits/<sha>/status \
  --jq '.statuses[] | "\(.context) \(.state) \(.created_at)"'
```

Le déploiement manuel via l'API Vercel (`create_deployment`, gitSource
type `github`, `sha` explicite) reste possible en attendant que la
permission soit validée, mais vérifier le SHA réellement déployé plutôt
que de faire confiance à `ref: "main"`, qui peut résoudre une vieille
position si Vercel n'a pas non plus reçu le dernier push.
