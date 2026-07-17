// =============================================================================
// pmuApi.js
// Tentative de recuperation AUTOMATIQUE des cotes en direct via l'API REST
// utilisee en interne par pmu.fr :
//   https://offline.turfinfo.api.pmu.fr/rest/client/7/programme/{DDMMYYYY}/R{n}/C{n}/participants
//
// IMPORTANT — cette API n'est PAS documentee ni officiellement autorisee pour
// un usage tiers par le PMU : elle peut changer de format, etre bloquee, ou
// tout simplement ne pas repondre depuis un navigateur (restriction CORS -
// aucune garantie que le serveur autorise les requetes venant d'un autre nom
// de domaine que pmu.fr). C'est un usage "au mieux", sans contrat de service.
//
// *** Revu (v2) *** : ajout de plusieurs proxies CORS publics en cascade + un
// timeout par tentative (voir plus bas), pour ne plus dependre d'un seul
// service tiers en cas de panne.
//
// *** Revu (v3) *** : les proxies CORS publics restent, en pratique,
// fondamentalement peu fiables (services gratuits, sans garantie, souvent
// sur-utilises ou coupes sans preavis) — meme avec plusieurs en cascade, il
// arrive que TOUS soient en panne en meme temps. Le moyen le PLUS FIABLE
// reste d'eviter completement le probleme CORS : c'est desormais possible
// via la fonction serverless `netlify/functions/pmu-cotes.js`, tentee EN
// PREMIER. Un appel serveur-a-serveur (comme celui fait par cette fonction)
// n'est jamais soumis aux regles CORS — celles-ci ne s'appliquent qu'aux
// requetes emises par un navigateur. Si l'app est hebergee sur Netlify (voir
// HEBERGEMENT.md), cette fonction est deployee automatiquement avec le reste
// du site, sans configuration supplementaire. Si elle n'est pas disponible
// (hebergement sur GitHub Pages, qui ne supporte pas les fonctions
// serverless, ou tout autre probleme), l'appli bascule automatiquement sur
// l'ancienne cascade (acces direct puis proxies CORS publics) sans aucune
// action de l'utilisateur.
//
// *** Revu (v4) *** : ajout de fetchResultatPmu, qui reutilise la meme
// cascade fiable pour recuperer l'arrivee officielle d'une course deja
// terminee (endpoint course PMU, sans /participants), afin de l'integrer
// automatiquement a la page course sans saisie manuelle.
//
// *** Revu (v5) *** : depuis la migration vers GitHub Pages, la fonction
// serverless Netlify meme-origine n'est plus disponible, et l'experience
// reelle a montre que les 3 proxys CORS publics de repli peuvent TOUS tomber
// en panne en meme temps (services gratuits, sans garantie). Ajout d'un
// nouveau premier maillon generique : une URL de **fonction externe**
// (EXTERNAL_FUNCTION_URL ci-dessous), hebergee separement de l'app et qui
// fait, elle aussi, un appel serveur-a-serveur jamais soumis aux regles
// CORS (meme principe que la fonction Netlify meme-origine, juste sur un
// domaine different). Cette URL peut pointer vers a peu pres n'importe quel
// service capable d'executer cloudflare-worker/pmu-cotes.js (ou l'equivalent
// netlify/functions/pmu-cotes.js deploye seul, sans le reste du site — voir
// HEBERGEMENT.md pour le detail des deux options testees). Tant que
// EXTERNAL_FUNCTION_URL n'est pas renseignee, cette tentative est simplement
// ignoree (l'application continue de fonctionner via les maillons suivants
// de la cascade).
//
// En cas d'echec de TOUTES les tentatives, l'application DOIT basculer sur le
// collage manuel de texte (voir zeturfParser.js, reutilisable pour n'importe
// quelle source copiee, y compris une page pmu.fr).
// =============================================================================

const BASE_URL = 'https://offline.turfinfo.api.pmu.fr/rest/client/7/programme';

/**
 * URL absolue d'une fonction externe deployee separement de l'app (voir
 * HEBERGEMENT.md), qui execute le meme code que
 * cloudflare-worker/pmu-cotes.js ou netlify/functions/pmu-cotes.js. Plusieurs
 * options equivalentes, au choix :
 *   - Val Town (recommande - gratuit, editeur de code dans le navigateur,
 *     aucun compte Netlify necessaire) : par exemple
 *     'https://votre-nom-pmu-cotes.web.val.run'
 *   - Un mini-site Netlify Functions independant : par exemple
 *     'https://mon-mini-site.netlify.app/.netlify/functions/pmu-cotes'
 *   - Un Cloudflare Worker : par exemple
 *     'https://pmu-cotes.votre-compte.workers.dev'
 * Laisser vide ('') si vous n'avez pas (encore) deploye l'une de ces
 * options : cette tentative sera alors automatiquement ignoree dans la
 * cascade, sans casser le reste du mecanisme de repli.
 */
let EXTERNAL_FUNCTION_URL = 'https://Marty--afc1dfde808e11f1889f1607ee4eb77e.web.val.run';

/**
 * Reservee aux tests automatises (tests/engine.test.js) : permet de simuler
 * EXTERNAL_FUNCTION_URL configuree ou non, independamment de la valeur
 * reellement deployee ci-dessus, pour que les tests de la cascade de repli
 * restent deterministes quelle que soit cette valeur (et ne se cassent pas a
 * chaque fois qu'une fonction externe reelle est renseignee/changee). Ne pas
 * utiliser en dehors des tests.
 */
export function _setExternalFunctionUrlPourTests(url) {
  EXTERNAL_FUNCTION_URL = url;
}

// Proxy CORS public "historique" (allorigins.win), conserve pour compatibilite
// et toujours utilise comme un des maillons de la cascade ci-dessous.
const CORS_PROXY_URL = 'https://api.allorigins.win/raw?url=';

/**
 * URL (relative, meme origine que le site) de la fonction serverless Netlify
 * — voir netlify/functions/pmu-cotes.js. Etant meme-origine, cet appel n'est
 * JAMAIS soumis aux restrictions CORS, contrairement a tous les autres.
 * `type` distingue les cotes ('participants', par defaut) de l'arrivee
 * officielle ('resultat', voir fetchResultatPmu) : la fonction Netlify tape
 * alors l'endpoint course PMU sans le suffixe /participants.
 */
function buildNetlifyFunctionUrl(date, numReunion, numCourse, type = 'participants') {
  const params = new URLSearchParams({
    date: formatDatePmu(date),
    reunion: String(numReunion),
    course: String(numCourse),
    type
  });
  return `/.netlify/functions/pmu-cotes?${params.toString()}`;
}

/**
 * URL de la fonction externe de repli (voir EXTERNAL_FUNCTION_URL ci-dessus).
 * Contrairement a la fonction Netlify meme-origine, elle n'est PAS meme-
 * origine (domaine separe : Val Town, mini-site Netlify independant ou
 * Cloudflare Worker), mais reste exempte de CORS car l'appel a l'API PMU se
 * fait cote serveur, a l'interieur de cette fonction externe. Leve une erreur
 * si non configuree, pour que cette tentative soit simplement comptee comme
 * un echec rapide et ignoree.
 */
function buildExternalFunctionUrl(date, numReunion, numCourse, type = 'participants') {
  if (!EXTERNAL_FUNCTION_URL) {
    throw new Error('non configure — voir HEBERGEMENT.md');
  }
  const params = new URLSearchParams({
    date: formatDatePmu(date),
    reunion: String(numReunion),
    course: String(numCourse),
    type
  });
  return `${EXTERNAL_FUNCTION_URL}?${params.toString()}`;
}

// Cascade de tentatives, de la plus fiable a la plus incertaine :
// 1. Fonction externe (voir plus haut) : aucune restriction CORS, gratuite,
//    a deployer soi-meme (voir HEBERGEMENT.md). Ignoree rapidement si
//    EXTERNAL_FUNCTION_URL n'est pas renseignee.
// 2. Fonction serverless Netlify meme-origine (aucune restriction CORS —
//    voir plus haut). Si le site n'est pas heberge sur Netlify, cette URL
//    renvoie simplement un 404 quasi instantane et on passe a la suite.
// 3. Acces direct (fonctionnerait si le PMU autorisait un jour les requetes
//    cross-origin).
// 4-6. Plusieurs proxies CORS publics independants les uns des autres, pour
//    ne plus dependre d'un seul service tiers en cas de panne — mais qui se
//    sont reveles en pratique peu fiables (peuvent tous tomber en meme temps).
function creerTentatives(type) {
  return [
    { label: 'fonction externe', build: (url, date, numReunion, numCourse) => buildExternalFunctionUrl(date, numReunion, numCourse, type) },
    { label: 'fonction serverless Netlify', build: (url, date, numReunion, numCourse) => buildNetlifyFunctionUrl(date, numReunion, numCourse, type) },
    { label: 'acces direct', build: (url) => url },
    { label: 'proxy allorigins.win', build: (url) => `${CORS_PROXY_URL}${encodeURIComponent(url)}` },
    { label: 'proxy corsproxy.io', build: (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}` },
    { label: 'proxy codetabs.com', build: (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}` }
  ];
}

const TENTATIVES = creerTentatives('participants');
const TENTATIVES_RESULTAT = creerTentatives('resultat');

const TIMEOUT_PAR_DEFAUT_MS = 8000;

/**
 * @param {Date|string} date
 * @returns {string} DDMMYYYY, format attendu par l'API PMU.
 */
export function formatDatePmu(date) {
  // Cas le plus courant : valeur brute d'un <input type="date"> ("YYYY-MM-DD").
  // On l'extrait directement par regex plutot que de passer par `new Date(...)`,
  // qui interprete une chaine "YYYY-MM-DD" comme un instant UTC : selon le
  // fuseau horaire local du navigateur, .getDate()/.getMonth() peuvent alors
  // recomposer la date du jour PRECEDENT ou SUIVANT (decalage d'un jour), ce
  // qui pointerait vers la mauvaise reunion/course. Ce parsing manuel evite le
  // probleme quel que soit le fuseau horaire de l'utilisateur.
  if (typeof date === 'string') {
    const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}${m[2]}${m[1]}`;
  }
  const d = date instanceof Date ? date : new Date(date);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}${mm}${yyyy}`;
}

/**
 * @param {Date|string} date
 * @param {number} numReunion
 * @param {number} numCourse
 * @returns {string}
 */
export function buildParticipantsUrl(date, numReunion, numCourse) {
  return `${BASE_URL}/${formatDatePmu(date)}/R${numReunion}/C${numCourse}/participants`;
}

/**
 * URL de l'endpoint "course" de l'API PMU (SANS le suffixe /participants) :
 * contient, une fois la course terminee, `arriveeDefinitive` (booleen) et
 * `ordreArrivee` (tableau de groupes de numeros, un groupe par rang, avec
 * plusieurs numeros en cas d'ex-aequo) — voir extraireArriveePmu.
 * @param {Date|string} date
 * @param {number} numReunion
 * @param {number} numCourse
 * @returns {string}
 */
export function buildCourseUrl(date, numReunion, numCourse) {
  return `${BASE_URL}/${formatDatePmu(date)}/R${numReunion}/C${numCourse}`;
}

/**
 * Enveloppe une URL avec le proxy CORS public de repli.
 * @param {string} url
 * @returns {string}
 */
export function buildProxiedUrl(url) {
  return `${CORS_PROXY_URL}${encodeURIComponent(url)}`;
}

/**
 * Extrait {numero, cote, nom} de la reponse JSON "participants" de l'API PMU.
 * Tolerant aux champs manquants (cheval non partant, pas encore de rapport
 * direct disponible, structure legerement differente selon les courses...).
 * Fonction pure, testable sans reseau.
 * @param {Object} json
 * @returns {Array<{numero:number, cote:number|null, nom:string}>}
 */
export function mapParticipantsPmu(json) {
  const participants = json?.participants || [];
  return participants
    .map((p) => {
      const numero = p?.numPmu;
      const rapport = p?.dernierRapportDirect?.rapport;
      const cote = typeof rapport === 'number' && rapport > 0 ? rapport : null;
      return { numero, cote, nom: p?.nom || '' };
    })
    .filter((p) => typeof p.numero === 'number');
}

/**
 * Extrait l'ordre d'arrivee officiel d'une reponse JSON "course" de l'API PMU
 * (endpoint SANS /participants, voir buildCourseUrl), sous forme de tableau
 * de numeros de chevaux dans l'ordre d'arrivee (les groupes d'ex-aequo de
 * `ordreArrivee` sont aplatis dans l'ordre). Renvoie `null` si la course
 * n'est pas encore terminee (`arriveeDefinitive` absent/false) ou si la
 * structure est inattendue. Fonction pure, testable sans reseau.
 * @param {Object} json
 * @returns {number[]|null}
 */
export function extraireArriveePmu(json) {
  if (!json || json.arriveeDefinitive !== true || !Array.isArray(json.ordreArrivee) || json.ordreArrivee.length === 0) {
    return null;
  }
  const numeros = json.ordreArrivee.flat().filter((n) => typeof n === 'number');
  return numeros.length > 0 ? numeros : null;
}

/**
 * Requete JSON avec delai maximal (AbortController) : une tentative qui ne
 * repond plus (proxy en panne ou surcharge) est abandonnee au bout de
 * `timeoutMs` au lieu de rester bloquee indefiniment (un `fetch()` normal n'a
 * par defaut AUCUN timeout).
 */
async function fetchJson(url, timeoutMs = TIMEOUT_PAR_DEFAUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`reponse HTTP ${response.status}`);
    }
    return await response.json();
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error(`delai depasse (> ${Math.round(timeoutMs / 1000)}s)`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Tente une recuperation en direct des cotes pour une course donnee, en
 * essayant successivement l'acces direct puis plusieurs proxies CORS publics
 * independants (voir `TENTATIVES` et la note en tete de fichier) : des qu'une
 * tentative renvoie des participants exploitables, on s'arrete la. Chaque
 * tentative est bornee par un timeout pour ne jamais rester bloquee sur un
 * service devenu muet. Laisser l'appelant capturer l'exception (try/catch) et
 * basculer sur le collage manuel si TOUTES les tentatives echouent.
 * @param {Date|string} date
 * @param {number} numReunion
 * @param {number} numCourse
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<Array<{numero:number, cote:number|null, nom:string}>>}
 */
export async function fetchCotesPmu(date, numReunion, numCourse, { timeoutMs = TIMEOUT_PAR_DEFAUT_MS } = {}) {
  const url = buildParticipantsUrl(date, numReunion, numCourse);
  const echecs = [];

  for (const tentative of TENTATIVES) {
    try {
      const json = await fetchJson(tentative.build(url, date, numReunion, numCourse), timeoutMs);
      const cotes = mapParticipantsPmu(json);
      if (cotes.length === 0) {
        echecs.push(`${tentative.label} : aucun participant dans la reponse`);
        continue;
      }
      return cotes;
    } catch (err) {
      echecs.push(`${tentative.label} : ${err.message || err}`);
    }
  }

  throw new Error(
    `Recuperation automatique impossible apres ${TENTATIVES.length} tentative(s) (${echecs.join(' ; ')}). Reunion/course/date incorrecte, ou tous les services (direct + proxies) sont indisponibles pour le moment.`
  );
}

/**
 * Tente de recuperer l'arrivee officielle d'une course, si elle est deja
 * terminee, via la meme cascade fiable que fetchCotesPmu (fonction Netlify
 * puis acces direct puis proxies CORS). Contrairement a fetchCotesPmu, cette
 * fonction NE LEVE JAMAIS D'EXCEPTION : la plupart du temps la course n'est
 * simplement pas encore terminee (situation normale, pas une erreur) ; en cas
 * d'echec de toutes les tentatives ou d'arrivee pas encore disponible, elle
 * renvoie silencieusement `null`, pour ne jamais interrompre le flux
 * principal (rafraichissement des cotes) qui l'appelle en complement.
 * @param {Date|string} date
 * @param {number} numReunion
 * @param {number} numCourse
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<number[]|null>} numeros des chevaux dans l'ordre d'arrivee, ou null.
 */
export async function fetchResultatPmu(date, numReunion, numCourse, { timeoutMs = TIMEOUT_PAR_DEFAUT_MS } = {}) {
  const url = buildCourseUrl(date, numReunion, numCourse);

  for (const tentative of TENTATIVES_RESULTAT) {
    try {
      const json = await fetchJson(tentative.build(url, date, numReunion, numCourse), timeoutMs);
      const numeros = extraireArriveePmu(json);
      if (numeros) return numeros;
    } catch {
      // Volontairement ignore (voir note ci-dessus) : on tente juste la
      // tentative suivante, sans jamais faire remonter d'erreur a l'appelant.
    }
  }
  return null;
}
