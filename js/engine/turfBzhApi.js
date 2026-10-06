// =============================================================================
// turfBzhApi.js (sept. 2026, a la demande explicite de l'utilisateur)
//
// Client pour l'API turf.bzh (https://www.turf.bzh/api-docs.php), source
// PAYANTE (Licence API + abonnement actif) mais officielle et documentee,
// contrairement a l'API PMU utilisee jusqu'ici (js/engine/pmuApi.js) qui
// n'est ni documentee ni officiellement autorisee pour un usage tiers.
//
// *** IMPORTANT - cle API et securite *** : la cle turf.bzh (`tbz_live_...`)
// donne acces au quota de l'utilisateur (60 appels/minute, 10 000/jour) et a
// ses credits IA - elle ne doit JAMAIS etre embarquee dans ce fichier ni dans
// aucun code qui s'execute dans le navigateur (elle serait alors visible de
// n'importe qui via les outils de developpement). Comme pour pmuApi.js
// (EXTERNAL_FUNCTION_URL), ce module n'appelle donc jamais directement
// www.turf.bzh : il passe systematiquement par un PROXY externe, deploye
// separement (voir val-town/turf-bzh-proxy.ts et HEBERGEMENT.md), qui seul
// connait la cle (stockee cote serveur, jamais dans le code source du proxy)
// et la rajoute a chaque appel relaye vers l'API turf.bzh reelle.
//
// *** IMPORTANT - champs non verifies en conditions reelles *** : l'API
// turf.bzh documente le SENS de chaque champ (voir CONTEXTE/02 et 03 du pack
// fourni par l'utilisateur) mais son schema OpenAPI ne detaille pas la forme
// JSON exacte (noms de cles) de chaque reponse - impossible de l'interroger
// en direct depuis cet environnement de developpement (reseau sandbox sans
// acces a turf.bzh, cle non partagee dans le chat par securite). Les noms de
// champs ci-dessous (num/name/cote/rapport_pour_1_euro/masse/etc.) sont ceux
// documentes dans le pack, mais n'ont PAS pu etre confirmes sur une reponse
// reelle. Toute extraction ci-dessous est donc volontairement TOLERANTE
// (plusieurs noms de cles candidats essayes dans l'ordre) plutot que stricte,
// exactement comme pour le fix iPhone de Supplementation.xlsx (voir
// supplementationParser.js) : en cas de resultat vide/incorrect a l'usage,
// signalez-le avec un exemple de reponse JSON reelle pour affiner l'extraction.
// =============================================================================

/**
 * URL absolue du proxy externe (Val Town recommande - voir
 * val-town/turf-bzh-proxy.ts et HEBERGEMENT.md), qui relaie les appels vers
 * https://www.turf.bzh/api/v1/... en y ajoutant l'entete Authorization
 * (cle stockee cote serveur, jamais ici). Laisser vide ('') si non deploye :
 * toutes les fonctions de ce module renvoient alors silencieusement `null`
 * (cotes/rapports) ou un tableau vide (value-bets), sans jamais lever
 * d'exception ni bloquer l'application - les fonctions PMU existantes
 * (js/engine/pmuApi.js) restent le mecanisme de repli.
 */
let PROXY_URL = 'https://Marty--fbcbfc88bb4511f18fd01607ee4eb77e.web.val.run';

/**
 * Reservee aux tests automatises (tests/engine.test.js), meme principe que
 * `_setExternalFunctionUrlPourTests` dans pmuApi.js. Ne pas utiliser en
 * dehors des tests.
 */
export function _setProxyUrlPourTests(url) {
  PROXY_URL = url;
}

const TIMEOUT_PAR_DEFAUT_MS = 10000;

/**
 * Raison du dernier echec/absence de Cote_BZH par partant (voir
 * `fetchCoteBzhParPartant`/`_diagnosticCoteBzh`) - a la demande de
 * l'utilisateur suite au retour "la mise a jour des cotes n'affiche pas les
 * cotes BZH" : sans cette memoire, l'echec restait totalement silencieux
 * (contrat volontaire des autres fonctions de ce fichier) et impossible a
 * diagnostiquer sans acces reseau direct a turf.bzh depuis l'environnement
 * de developpement. `null` tant qu'aucun appel n'a ete tente, ou apres un
 * appel reussi avec au moins un partant extrait.
 */
let _derniereErreurCoteBzh = null;

/**
 * Reservee au diagnostic (affichage app.js + rapport a l'utilisateur en cas
 * de probleme) : raison du dernier echec de `fetchCoteBzhParPartant`, ou
 * `null` si le dernier appel a reussi (ou si aucun appel n'a encore ete
 * tente).
 * @returns {string|null}
 */
export function _diagnosticCoteBzh() {
  return _derniereErreurCoteBzh;
}

/**
 * Construit l'URL d'appel au proxy pour une route turf.bzh donnee.
 * @param {string} path - chemin apres /v1/, sans barre oblique initiale
 *   (ex. "courses/2026-09-27/R1C4/cotes").
 * @param {Object<string,string|number>} [params] - parametres de requete
 *   turf.bzh (ex. { n: 20 }), relayes tels quels par le proxy.
 * @returns {string}
 */
export function buildProxyUrl(path, params) {
  const q = new URLSearchParams({ path, ...(params || {}) });
  return `${PROXY_URL}?${q.toString()}`;
}

/**
 * Code course au format turfiste attendu par l'API turf.bzh ("R1C4").
 * @param {number} numReunion
 * @param {number} numCourse
 * @returns {string}
 */
export function codeRC(numReunion, numCourse) {
  return `R${numReunion}C${numCourse}`;
}

async function fetchJson(url, timeoutMs = TIMEOUT_PAR_DEFAUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`reponse HTTP ${response.status}`);
    const enveloppe = await response.json();
    // Toutes les reponses turf.bzh sont enveloppees { data, meta } (succes)
    // ou { error } (echec) - voir CONTEXTE/02-api-turf-bzh.md section 1.
    if (enveloppe && enveloppe.error) {
      throw new Error(enveloppe.error.message || 'erreur API turf.bzh');
    }
    return enveloppe && 'data' in enveloppe ? enveloppe.data : enveloppe;
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error(`delai depasse (> ${Math.round(timeoutMs / 1000)}s)`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Premiere valeur non nulle/undefined parmi plusieurs cles candidates d'un
 * objet - utilitaire pour l'extraction tolerante (voir note en tete de
 * fichier).
 */
function premiereCle(obj, cles) {
  for (const c of cles) {
    if (obj && obj[c] != null) return obj[c];
  }
  return null;
}

/**
 * Extrait {numero, cote, nom} de la reponse "cotes" de l'API turf.bzh
 * (GET /courses/{date}/{rc}/cotes), au MEME format que `mapParticipantsPmu`
 * (js/engine/pmuApi.js) afin de rester directement substituable partout ou
 * fetchCotesPmu est appele (voir fetchCotesTurfBzh). Fonction pure, testable
 * sans reseau.
 * @param {Object} data - bloc `data` de la reponse (tableau de partants
 *   attendu, sous une cle candidate parmi celles testees ci-dessous).
 * @returns {Array<{numero:number, cote:number|null, nom:string}>}
 */
export function mapCotesTurfBzh(data) {
  const partants = Array.isArray(data) ? data : (premiereCle(data, ['partants', 'cotes', 'chevaux']) || []);
  if (!Array.isArray(partants)) return [];
  return partants
    .map((p) => {
      const numeroBrut = premiereCle(p, ['num', 'numero', 'numPmu']);
      if (numeroBrut == null) return null;
      const numero = typeof numeroBrut === 'number' ? numeroBrut : Number(numeroBrut);
      const coteBrute = premiereCle(p, ['cote', 'cote_directe', 'coteDirecte']);
      const cote = typeof coteBrute === 'number' && coteBrute > 0 ? coteBrute : null;
      const nom = premiereCle(p, ['name', 'nom', 'cheval', 'Cheval']) || '';
      return { numero, cote, nom };
    })
    .filter((p) => p && Number.isFinite(p.numero));
}

/**
 * Recupere les cotes PMU en direct pour une course, via l'API turf.bzh (le
 * proxy externe, voir PROXY_URL). Renvoie `null` (jamais d'exception) si le
 * proxy n'est pas configure ou si l'appel echoue, pour que l'appelant puisse
 * basculer silencieusement sur `fetchCotesPmu` (js/engine/pmuApi.js) en
 * repli, exactement comme pour `fetchResultatPmu`/`fetchRapportsPmu`.
 * @param {Date|string} date
 * @param {number} numReunion
 * @param {number} numCourse
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<Array<{numero:number, cote:number|null, nom:string}>|null>}
 */
export async function fetchCotesTurfBzh(date, numReunion, numCourse, { timeoutMs = TIMEOUT_PAR_DEFAUT_MS } = {}) {
  if (!PROXY_URL) return null;
  const dateVal = typeof date === 'string' ? date.slice(0, 10) : new Date(date).toISOString().slice(0, 10);
  try {
    const url = buildProxyUrl(`courses/${dateVal}/${codeRC(numReunion, numCourse)}/cotes`);
    const data = await fetchJson(url, timeoutMs);
    const cotes = mapCotesTurfBzh(data);
    return cotes.length > 0 ? cotes : null;
  } catch {
    return null;
  }
}

/**
 * Normalise la reponse "rapports" de l'API turf.bzh vers la MEME forme que
 * la reponse (fusionnee) `rapports-definitifs` de l'API PMU (voir
 * js/engine/pmuApi.js, buildRapportsUrl/extraireRapports*) : un tableau
 * d'objets `{typePari, rapports:[{combinaison, dividendePourUnEuro}]}`, avec
 * un prefixe `E_` pour le pool "en ligne" (equivalent du pool "internet" cote
 * PMU, cf. doc turf.bzh section "Les deux masses PMU"). Grace a cette
 * normalisation, `extraireRapportsSimpleGagnant`/`extraireRapportsSimplePlace`/
 * `extraireRapportsCoupleGagnant`/`extraireRapportsTrio` (pmuApi.js)
 * fonctionnent SANS MODIFICATION sur les deux sources. Fonction pure,
 * testable sans reseau.
 * @param {Array} data - bloc `data` de la reponse turf.bzh (tableau de
 *   lignes de rapports, une ligne par combinaison/pari/masse).
 * @returns {Array<{typePari:string, rapports:Array<{combinaison:string, dividendePourUnEuro:number}>}>}
 */
export function normaliserRapportsTurfBzh(data) {
  const lignes = Array.isArray(data) ? data : (premiereCle(data, ['rapports', 'lignes']) || []);
  if (!Array.isArray(lignes)) return [];

  const groupes = new Map();
  for (const r of lignes) {
    const pari = premiereCle(r, ['type_pari', 'pari', 'typePari']);
    const masse = premiereCle(r, ['masse']);
    const combinaison = premiereCle(r, ['combinaison', 'combinaison_gagnante']);
    const dividendeEnEuros = premiereCle(r, ['rapport_pour_1_euro', 'rapport_pour_la_mise_de_base', 'dividendePourUnEuro']);
    if (!pari || combinaison == null || dividendeEnEuros == null) continue;
    // Pool "en ligne" -> prefixe E_ (equivalent internet PMU) ; tout le
    // reste (point_de_vente, ou masse absente = pool agrege) -> sans
    // prefixe (equivalent national PMU).
    const typePari = masse === 'en_ligne' ? `E_${pari}` : String(pari);
    if (!groupes.has(typePari)) groupes.set(typePari, []);
    // *** en centimes *** : turf.bzh exprime rapport_pour_1_euro directement
    // en euros (voir CONTEXTE/02-api-turf-bzh.md), alors que
    // extraireRapportsCoupleGagnant/Trio/SimpleGagnant/SimplePlace
    // (pmuApi.js, reutilisees telles quelles sur cette source normalisee)
    // divisent systematiquement par 100 le champ `dividendePourUnEuro` -
    // convention de l'API PMU, qui l'exprime en centimes. Sans ce x100, le
    // dividende affiche serait 100x trop petit.
    groupes.get(typePari).push({ combinaison: String(combinaison), dividendePourUnEuro: Number(dividendeEnEuros) * 100 });
  }
  return Array.from(groupes.entries()).map(([typePari, rapports]) => ({ typePari, rapports }));
}

/**
 * Recupere les rapports officiels (dividendes) d'une course terminee, via
 * l'API turf.bzh, deja normalises (voir `normaliserRapportsTurfBzh`) pour
 * etre passes directement aux fonctions d'extraction de pmuApi.js. Renvoie
 * `null` (jamais d'exception) si le proxy n'est pas configure, si les
 * rapports ne sont pas encore disponibles, ou en cas d'echec reseau - meme
 * contrat que `fetchRapportsPmu`, pour un repli silencieux.
 * @param {Date|string} date
 * @param {number} numReunion
 * @param {number} numCourse
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<Array|null>}
 */
export async function fetchRapportsTurfBzh(date, numReunion, numCourse, { timeoutMs = TIMEOUT_PAR_DEFAUT_MS } = {}) {
  if (!PROXY_URL) return null;
  const dateVal = typeof date === 'string' ? date.slice(0, 10) : new Date(date).toISOString().slice(0, 10);
  try {
    const url = buildProxyUrl(`courses/${dateVal}/${codeRC(numReunion, numCourse)}/rapports`);
    const data = await fetchJson(url, timeoutMs);
    const normalise = normaliserRapportsTurfBzh(data);
    return normalise.length > 0 ? normalise : null;
  } catch {
    return null;
  }
}

/**
 * Extrait {numero, nom, coteBzh, cote} de la reponse "value-bets" de l'API
 * turf.bzh (GET /value-bets, composite Cote_BZH_fiable - chevaux dont la
 * cote de marche semble trop haute par rapport a l'estimation maison).
 * Rappel du pack fourni par l'utilisateur : CE N'EST NI UN PRONOSTIC NI UNE
 * PROMESSE DE RENDEMENT, seulement un ecart mesure entre deux estimations.
 * Fonction pure, testable sans reseau.
 * @param {Array} data
 * @returns {Array<{numero:number|null, nom:string, coteBzh:number|null, cote:number|null}>}
 */
export function mapValueBetsTurfBzh(data) {
  const lignes = Array.isArray(data) ? data : (premiereCle(data, ['value_bets', 'chevaux']) || []);
  if (!Array.isArray(lignes)) return [];
  return lignes.map((l) => ({
    numero: (() => { const n = premiereCle(l, ['num', 'numero']); return n != null ? Number(n) : null; })(),
    nom: premiereCle(l, ['name', 'nom', 'cheval']) || '',
    coteBzh: (() => { const v = premiereCle(l, ['Cote_BZH', 'cote_bzh', 'coteBzh']); return v != null ? Number(v) : null; })(),
    cote: (() => { const v = premiereCle(l, ['cote', 'Cote']); return v != null ? Number(v) : null; })()
  }));
}

/**
 * Recupere les "value-bets" du jour (ou d'une date passee) via l'API
 * turf.bzh - purement informatif, affiche a titre de complement (voir
 * HEBERGEMENT.md). Renvoie un tableau vide (jamais d'exception) si le proxy
 * n'est pas configure ou en cas d'echec.
 * @param {{ n?: number, date?: string, timeoutMs?: number }} [options]
 * @returns {Promise<Array<{numero:number|null, nom:string, coteBzh:number|null, cote:number|null}>>}
 */
export async function fetchValueBetsTurfBzh({ n, date, timeoutMs = TIMEOUT_PAR_DEFAUT_MS } = {}) {
  if (!PROXY_URL) return [];
  try {
    const url = buildProxyUrl('value-bets', { n, date });
    const data = await fetchJson(url, timeoutMs);
    return mapValueBetsTurfBzh(data);
  } catch {
    return [];
  }
}

/**
 * Extrait {numero, nom, coteBzh} de la liste des partants d'une reponse
 * "dossier" de l'API turf.bzh (GET /courses/{date}/{rc}/dossier), qui
 * assemble entre autres la fiche et ses partants pour TOUS les chevaux de la
 * course (contrairement a `mapValueBetsTurfBzh`, qui ne renvoie que les
 * chevaux signales comme "value bets" du jour, toutes courses confondues).
 * A la demande explicite de l'utilisateur : afficher Cote_BZH pour CHAQUE
 * concurrent de la course, pas seulement ceux en value-bet. Fonction pure,
 * testable sans reseau - meme tolerance de noms de cles que le reste du
 * fichier (voir note en tete de fichier : schema non verifie en conditions
 * reelles).
 * @param {Object} data - bloc `data` de la reponse dossier (objet dont une
 *   cle candidate porte la liste des partants).
 * @returns {Array<{numero:number, nom:string, coteBzh:number|null, gainsTotaux:number|null, musique:string|null}>}
 */
export function mapCoteBzhDossier(data) {
  const fiche = premiereCle(data, ['fiche', 'course']) || data;
  const clePartantsTrouvee = Array.isArray(fiche) ? null : premiereCle(fiche, ['partants', 'chevaux', 'engages']);
  const cleRacineTrouvee = clePartantsTrouvee == null ? premiereCle(data, ['partants', 'chevaux', 'engages']) : null;
  const partantsBrut = Array.isArray(fiche) ? fiche : (clePartantsTrouvee ?? cleRacineTrouvee);

  // Cas 1 : AUCUNE des cles candidates (fiche.partants/chevaux/engages, ou a
  // la racine) n'a ete trouvee du tout - la liste des partants est ailleurs
  // dans le JSON, sous un nom qu'on ne teste pas encore. Avant ce correctif,
  // ce cas retombait silencieusement sur un tableau vide `[]` sans aucun
  // diagnostic (bug signale par l'utilisateur : le message affiche restait
  // le meme, generique, d'un appel a l'autre). On liste maintenant les cles
  // presentes a la racine ET dans `fiche`, pour identifier le bon nom sans
  // ouvrir la console du navigateur.
  if (partantsBrut == null) {
    const clesRacine = data && typeof data === 'object' ? Object.keys(data) : [];
    const clesFiche = fiche && typeof fiche === 'object' && fiche !== data ? Object.keys(fiche) : [];
    // Le message affiche dans l'appli (app.js -> #cotebzh-status) inclut
    // maintenant le CONTENU brut (tronque), pas seulement les noms de cles :
    // le retour utilisateur precedent ("Cles a la racine : ok") a montre
    // qu'une seule cle nommee ne suffit pas a comprendre le probleme - il
    // faut aussi voir sa valeur (ex. `{"ok":true}` seul suggere une reponse
    // d'un tout autre type que le dossier attendu, pas juste un nom de champ
    // a ajouter aux cles candidates).
    let contenuBrut;
    try {
      contenuBrut = JSON.stringify(data).slice(0, 300);
    } catch {
      contenuBrut = '(non serialisable)';
    }
    _derniereErreurCoteBzh = `dossier recu, mais aucune cle partants/chevaux/engages trouvee (ni a la racine, ni dans "fiche"). Cles a la racine : ${clesRacine.join(', ') || '(aucune)'}${clesFiche.length ? ' ; cles dans fiche : ' + clesFiche.join(', ') : ''}. Contenu recu (tronque) : ${contenuBrut}`;
    try {
      console.warn('[turfBzhApi] ' + _derniereErreurCoteBzh);
    } catch { /* environnement sans console : ignore */ }
    return [];
  }

  // Cas 2 : une cle candidate a ete trouvee, mais sa valeur n'est pas un
  // tableau (ex. un objet, une chaine).
  if (!Array.isArray(partantsBrut)) {
    _derniereErreurCoteBzh = `dossier recu, la cle partants trouvee n'est pas un tableau (type ${typeof partantsBrut})`;
    try {
      console.warn('[turfBzhApi] ' + _derniereErreurCoteBzh + '. Valeur recue :', JSON.stringify(partantsBrut).slice(0, 500));
    } catch { /* environnement sans console : ignore */ }
    return [];
  }
  const partants = partantsBrut;

  // Cas 3 : un tableau a ete trouve mais il est vide.
  if (partants.length === 0) {
    _derniereErreurCoteBzh = 'dossier recu, le tableau de partants trouve est vide (0 element)';
    return [];
  }

  const resultats = partants
    .map((p) => {
      const numeroBrut = premiereCle(p, ['num', 'numero', 'numPmu', 'Numero']);
      if (numeroBrut == null) return null;
      const numero = typeof numeroBrut === 'number' ? numeroBrut : Number(numeroBrut);
      const nom = premiereCle(p, ['name', 'nom', 'cheval', 'Cheval']) || '';
      const coteBzhBrute = premiereCle(p, ['Cote_BZH', 'cote_bzh', 'coteBzh', 'cotebzh']);
      const coteBzh = typeof coteBzhBrute === 'number' ? coteBzhBrute : (coteBzhBrute != null ? Number(coteBzhBrute) : null);
      // Regle Trot « gains faibles » (sept. 2026) : gains de carriere et
      // musique du dossier turf.bzh, si presents (noms de cles tolerants,
      // schema non verifie en conditions reelles - voir en-tete).
      const gainsBruts = premiereCle(p, ['Gains_Totaux', 'gains_totaux', 'gainsTotaux', 'GainsTotaux']);
      const gainsTotaux = gainsBruts != null && gainsBruts !== '' ? Number(String(gainsBruts).replace(',', '.').replace(/\s/g, '')) : null;
      const musique = premiereCle(p, ['Musique', 'musique']);
      return {
        numero,
        nom,
        coteBzh: Number.isFinite(coteBzh) ? coteBzh : null,
        gainsTotaux: Number.isFinite(gainsTotaux) ? gainsTotaux : null,
        musique: musique != null ? String(musique) : null
      };
    })
    .filter((p) => p && Number.isFinite(p.numero));

  // Cas 4 : le tableau de partants a bien des elements, mais aucun n'a de
  // numero exploitable sous les cles candidates testees (num/numero/numPmu/
  // Numero) - le nom reel de ce champ dans la reponse turf.bzh differe donc
  // de celui documente. On liste les cles du premier partant recu.
  if (resultats.length === 0) {
    const clesPremierPartant = partants[0] && typeof partants[0] === 'object' ? Object.keys(partants[0]) : [];
    _derniereErreurCoteBzh = `dossier recu avec ${partants.length} partant(s), mais aucune cle numero/num/numPmu/Numero reconnue. Cles presentes sur le 1er partant : ${clesPremierPartant.join(', ') || '(objet vide ou non standard)'}`;
    try {
      console.warn('[turfBzhApi] ' + _derniereErreurCoteBzh + '. Premier partant complet :', JSON.stringify(partants[0]).slice(0, 500));
    } catch { /* environnement sans console : ignore */ }
  }

  return resultats;
}

/**
 * Recupere, pour CHAQUE partant d'une course (terminee ou a venir), sa
 * Cote_BZH (estimation "juste prix" du modele turf.bzh - voir mise en garde
 * dans HEBERGEMENT.md : ni un pronostic ni une promesse de rendement), via le
 * dossier complet de la course. `historique=0` (nous avons deja notre propre
 * historique importe) et aucune autre section demandee, pour alleger l'appel
 * - voir CONTEXTE/02-api-turf-bzh.md section 4. Renvoie un tableau vide
 * (jamais d'exception) si le proxy n'est pas configure ou en cas d'echec,
 * pour un repli silencieux (cette information reste facultative).
 * @param {Date|string} date
 * @param {number} numReunion
 * @param {number} numCourse
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<Array<{numero:number, nom:string, coteBzh:number|null}>>}
 */
export async function fetchCoteBzhParPartant(date, numReunion, numCourse, { timeoutMs = TIMEOUT_PAR_DEFAUT_MS } = {}) {
  if (!PROXY_URL) {
    _derniereErreurCoteBzh = 'proxy turf.bzh non configure (PROXY_URL vide)';
    return [];
  }
  const dateVal = typeof date === 'string' ? date.slice(0, 10) : new Date(date).toISOString().slice(0, 10);
  const url = buildProxyUrl(`courses/${dateVal}/${codeRC(numReunion, numCourse)}/dossier`, { historique: 0 });
  try {
    const data = await fetchJson(url, timeoutMs);
    const partants = mapCoteBzhDossier(data);
    if (partants.length === 0) {
      // mapCoteBzhDossier a deja renseigne _derniereErreurCoteBzh si la
      // forme etait inattendue ; sinon (tableau de partants trouve mais
      // vide, ou aucun numero exploitable), on precise ici.
      if (!_derniereErreurCoteBzh) _derniereErreurCoteBzh = 'dossier recu, mais aucun partant exploitable (numero absent sur chaque ligne ?)';
    } else {
      _derniereErreurCoteBzh = null;
    }
    return partants;
  } catch (err) {
    _derniereErreurCoteBzh = `appel dossier turf.bzh en echec (${url}) : ${(err && err.message) || String(err)}`;
    return [];
  }
}


/**
 * Parse un code course turfiste ("R1C4") -> { reunion: 1, course: 4 }.
 * @param {string} code
 * @returns {{reunion:number, course:number}|null}
 */
export function parseCodeRC(code) {
  const m = String(code || '').toUpperCase().match(/R\s*(\d+)\s*C\s*(\d+)/);
  return m ? { reunion: Number(m[1]), course: Number(m[2]) } : null;
}

function nombreTolerant(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Extrait les partants de la reponse "journee" de l'API turf.bzh
 * (GET /v1/journees/{date}/partants - TOUS les partants de TOUTES les
 * courses du jour en UN seul appel, voir CONTEXTE/02 section 3.2). La base
 * renomme `Course` -> `code_course`, `Numero` -> `num`, `Cheval` -> `name`
 * (CONTEXTE/02 section 3.1). Forme exacte non verifiee en conditions
 * reelles : on accepte une liste plate de partants (chacun portant son
 * code course) OU une liste de courses portant chacune ses partants.
 * Fonction pure, testable sans reseau.
 * @param {*} data
 * @returns {Array<{reunion:number, course:number, hippodrome:string, numero:number,
 *   nom:string, coteBzh:number|null, gainsTotaux:number|null, musique:string|null}>}
 */
export function mapJourneePartantsBzh(data) {
  let lignes = Array.isArray(data) ? data : premiereCle(data, ['partants', 'lignes', 'courses', 'data']);
  if (!Array.isArray(lignes)) return [];
  // Liste de courses -> aplatie en partants, le code course etant porte par la course.
  const aplaties = [];
  for (const l of lignes) {
    const sous = l && premiereCle(l, ['partants', 'chevaux']);
    if (Array.isArray(sous)) {
      for (const p of sous) aplaties.push({ __course: l, ...p });
    } else {
      aplaties.push(l);
    }
  }
  return aplaties.map((p) => {
    const c = p.__course || {};
    const code = premiereCle(p, ['code_course', 'Course', 'course', 'rc']) ?? premiereCle(c, ['code_course', 'Course', 'course', 'rc']);
    let rc = parseCodeRC(code);
    if (!rc) {
      const r = nombreTolerant(premiereCle(p, ['reunion', 'Reunion', 'num_reunion']) ?? premiereCle(c, ['reunion', 'Reunion', 'num_reunion']));
      const k = nombreTolerant(premiereCle(p, ['num_course', 'numero_course', 'NumCourse']) ?? premiereCle(c, ['num_course', 'numero_course', 'NumCourse']));
      rc = r != null && k != null ? { reunion: r, course: k } : null;
    }
    const numero = nombreTolerant(premiereCle(p, ['num', 'numero', 'Numero', 'numPmu']));
    if (!rc || numero == null) return null;
    const musique = premiereCle(p, ['Musique', 'musique']);
    return {
      reunion: rc.reunion,
      course: rc.course,
      hippodrome: String(premiereCle(p, ['hippodrome', 'Hippodrome']) ?? premiereCle(c, ['hippodrome', 'Hippodrome']) ?? ''),
      numero,
      nom: String(premiereCle(p, ['name', 'nom', 'Cheval', 'cheval']) || ''),
      coteBzh: nombreTolerant(premiereCle(p, ['Cote_BZH', 'cote_bzh', 'coteBzh'])),
      gainsTotaux: nombreTolerant(premiereCle(p, ['Gains_Totaux', 'gains_totaux', 'gainsTotaux'])),
      musique: musique != null && musique !== '' ? String(musique) : null
    };
  }).filter(Boolean);
}

/**
 * Tous les partants d'une journee en UN appel (quota : 1 appel). Renvoie
 * un tableau vide (jamais d'exception) si le proxy n'est pas configure ou
 * en cas d'echec ; la raison est alors disponible via `_diagnosticCoteBzh()`.
 * @param {Date|string} date
 * @param {{ discipline?: string, timeoutMs?: number }} [options]
 */
export async function fetchJourneePartantsBzh(date, { discipline, timeoutMs = 30000 } = {}) {
  if (!PROXY_URL) {
    _derniereErreurCoteBzh = 'proxy turf.bzh non configure (PROXY_URL vide)';
    return [];
  }
  const dateVal = typeof date === 'string' ? date.slice(0, 10) : new Date(date).toISOString().slice(0, 10);
  const params = { champs: 'tout', non_partants: 'inclus' };
  if (discipline) params.discipline = discipline;
  const url = buildProxyUrl(`journees/${dateVal}/partants`, params);
  try {
    const data = await fetchJson(url, timeoutMs);
    const partants = mapJourneePartantsBzh(data);
    if (partants.length === 0) {
      let brut;
      try { brut = JSON.stringify(data).slice(0, 300); } catch { brut = '(non serialisable)'; }
      _derniereErreurCoteBzh = `journee turf.bzh recue mais aucun partant reconnu. Contenu (tronque) : ${brut}`;
    } else {
      _derniereErreurCoteBzh = null;
    }
    return partants;
  } catch (err) {
    _derniereErreurCoteBzh = `appel journee turf.bzh en echec (${url}) : ${(err && err.message) || String(err)}`;
    return [];
  }
}
