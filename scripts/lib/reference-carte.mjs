/**
 * Référence d'impression d'une carte (« ASC 294/217 ») et recoupement de
 * son dénominateur contre une seconde base de données.
 *
 * POURQUOI CE MODULE. Le code d'extension et le total imprimé viennent
 * tous deux de TCGdex (/sets/{id} : `abbreviation.official` et
 * `cardCount.official`). Une seule source, donc aucun recours si elle se
 * trompe : un total faux s'afficherait comme un fait sur la vignette, dans
 * les posts et dans la newsletter. Il est donc recoupé avec pokemontcg.io,
 * une base indépendante, avant d'être publié.
 *
 * LE RECOUPEMENT SE FAIT PAR EXTENSION, PAS PAR CARTE. L'API de
 * pokemontcg.io répond souvent 500 ou 502 sur /cards/{id} (trois erreurs
 * sur cinq appels le 20 septembre 2026) alors que /sets/{id} a répondu à
 * chaque fois. Et le risque est dans le dénominateur : le numéro, lui,
 * vient de l'identifiant même de la carte.
 *
 * IL NE FAIT JAMAIS ÉCHOUER LE CLASSEMENT. Base injoignable ou extension
 * absente : on garde la valeur de TCGdex et on le dit. Seule une
 * DIVERGENCE avérée retire le dénominateur (« ASC 294 » au lieu de
 * « ASC 294/217 »), parce que la forme courte reste vraie même quand le
 * total est douteux.
 */

const API_PTCG = 'https://api.pokemontcg.io/v2';

/**
 * Forme courte et forme complète de la référence imprimée.
 *
 * La courte, « ASC 286 », est ce qu'imprime le bas de la carte française
 * et ce que Cardmarket emploie dans ses titres. La complète ajoute le
 * dénominateur, aligné sur la largeur du numéro comme à l'impression
 * (« 120/088 » et non « 120/88 »). Sans total (promos, qui n'en portent
 * pas), les deux formes sont identiques : l'inventer serait une erreur
 * factuelle.
 */
export function referenceCarte({ localId, setCode, setTotal }) {
  if (localId == null || !setCode) return { refCourte: null, refLongue: null };
  const num = String(localId);
  const refCourte = `${setCode} ${num}`;
  const total = setTotal ? String(setTotal).padStart(num.length, '0') : null;
  return { refCourte, refLongue: total ? `${setCode} ${num}/${total}` : refCourte };
}

/**
 * Identifiant d'extension TCGdex vers celui de pokemontcg.io :
 * « me02.5 » devient « me2pt5 », « me03 » devient « me3 ».
 * Renvoie null quand l'identifiant n'a pas cette forme (extensions
 * japonaises « SM1p », promos « swshp », Pokémon Pocket « A1 ») : on ne
 * devine pas, le recoupement est alors sans objet.
 */
export function idExtensionPokemontcgio(idTcgdex) {
  const m = String(idTcgdex ?? '').match(/^([a-z]+)0*(\d+)(?:\.(\d+))?$/);
  return m ? `${m[1]}${m[2]}${m[3] ? `pt${m[3]}` : ''}` : null;
}

/* Une extension n'est lue qu'une fois par exécution : deux cartes du
   podium venant de la même extension ne doublent pas les appels. */
const CACHE_EXTENSIONS = new Map();

async function lireExtension(id, { fetchImpl, tentatives, delaiMs, delaiMaxMs }) {
  let derniereErreur = null;
  for (let essai = 1; essai <= tentatives; essai++) {
    try {
      const r = await fetchImpl(`${API_PTCG}/sets/${id}`, { signal: AbortSignal.timeout(delaiMaxMs) });
      if (r.status === 404) return { inconnue: true };
      if (r.ok) return { data: (await r.json()).data ?? null };
      derniereErreur = `HTTP ${r.status}`;
    } catch (e) {
      derniereErreur = e.message;
    }
    if (essai < tentatives) await new Promise((ok) => setTimeout(ok, delaiMs));
  }
  return { erreur: derniereErreur };
}

/**
 * Recoupe le total imprimé et le code d'extension d'une carte.
 *
 * Statuts :
 *  - `confirmee`      les deux bases donnent le même total imprimé ;
 *  - `divergente`     total différent, ou numéro au-delà de l'extension :
 *                     à ne PAS publier tel quel ;
 *  - `indisponible`   base injoignable, extension inconnue ou champ absent :
 *                     on garde TCGdex ;
 *  - `non_applicable` extension sans équivalent connu, ou sans total.
 *
 * Un code d'extension différent est signalé en `notes` sans bloquer : les
 * deux bases n'ont pas toujours la même convention pour les codes, alors
 * que le total imprimé est un fait.
 */
export async function corroborerExtension(
  { setId, setCode = null, setTotal = null, localId = null },
  { fetchImpl = fetch, tentatives = 3, delaiMs = 1500, delaiMaxMs = 10000, cache = CACHE_EXTENSIONS } = {},
) {
  const id = idExtensionPokemontcgio(setId);
  if (!id || setTotal == null) return { statut: 'non_applicable' };

  if (!cache.has(id)) cache.set(id, lireExtension(id, { fetchImpl, tentatives, delaiMs, delaiMaxMs }));
  const lecture = await cache.get(id);

  if (lecture.inconnue) return { statut: 'indisponible', detail: `extension ${id} inconnue de pokemontcg.io` };
  if (lecture.erreur) return { statut: 'indisponible', detail: lecture.erreur };

  const { data } = lecture;
  if (data?.printedTotal == null) return { statut: 'indisponible', detail: 'total imprimé absent de pokemontcg.io' };

  const ecarts = [];
  const notes = [];
  if (Number(data.printedTotal) !== Number(setTotal)) {
    ecarts.push(`total imprimé ${setTotal} (TCGdex) contre ${data.printedTotal} (pokemontcg.io)`);
  }
  if (localId != null && data.total != null && Number.isFinite(Number(localId)) && Number(localId) > Number(data.total)) {
    ecarts.push(`numéro ${localId} au-delà des ${data.total} cartes de l'extension (pokemontcg.io)`);
  }
  if (setCode && data.ptcgoCode && data.ptcgoCode !== setCode) {
    notes.push(`code ${setCode} (TCGdex) contre ${data.ptcgoCode} (pokemontcg.io)`);
  }
  return ecarts.length ? { statut: 'divergente', ecarts, notes } : { statut: 'confirmee', notes };
}
