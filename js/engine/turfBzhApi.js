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
 * @returns {Array<{numero:number, nom:string, coteBzh:number|null}>}
 */
export function mapCoteBzhDossier(data) {
  const fiche = premiereCle(data, ['fiche', 'course']) || data;
  const partants = Array.isArray(fiche)
    ? fiche
    : (premiereCle(fiche, ['partants', 'chevaux', 'engages']) || premiereCle(data, ['partants', 'chevaux', 'engages']) || []);
  if (!Array.isArray(partants)) {
    // Cle diagnostic (voir fetchCoteBzhParPartant/_diagnosticCoteBzh) : la
    // reponse a ete recue et parsee (sinon on serait dans le catch de
    // fetchCoteBzhParPartant), mais aucune des cles candidates ne contient
    // un tableau de partants - signe que le schema reel differe de celui
    // documente. On memorise (et logue) la forme brute (tronquee) recue pour
    // pouvoir l'affiner sur un exemple reel.
    _derniereErreurCoteBzh = 'dossier recu mais aucun tableau de partants trouve (cles testees : fiche.partants/chevaux/engages)';
    try {
      console.warn('[turfBzhApi] ' + _derniereErreurCoteBzh + '. Forme recue :', JSON.stringify(data).slice(0, 500));
    } catch { /* environnement sans console : ignore */ }
    return [];
  }
  return partants
    .map((p) => {
      const numeroBrut = premiereCle(p, ['num', 'numero', 'numPmu', 'Numero']);
      if (numeroBrut == null) return null;
      const numero = typeof numeroBrut === 'number' ? numeroBrut : Number(numeroBrut);
      const nom = premiereCle(p, ['name', 'nom', 'cheval', 'Cheval']) || '';
      const coteBzhBrute = premiereCle(p, ['Cote_BZH', 'cote_bzh', 'coteBzh', 'cotebzh']);
      const coteBzh = typeof coteBzhBrute === 'number' ? coteBzhBrute : (coteBzhBrute != null ? Number(coteBzhBrute) : null);
      return { numero, nom, coteBzh: Number.isFinite(coteBzh) ? coteBzh : null };
    })
    .filter((p) => p && Number.isFinite(p.numero));
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
