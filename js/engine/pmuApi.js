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
// *** Revu (v6) *** : ajout de fetchRapportsPmu, qui reutilise encore la
// meme cascade pour recuperer les RAPPORTS (dividendes officiels PMU, en
// particulier Couplé Gagnant) d'une course terminee, endpoint
// .../rapports-definitifs — utilise par la page "Resultat" (bilan
// financier du jour, voir js/app.js).
//
// *** Revu (v7) *** : bug signale par l'utilisateur (rapport Trio affiche
// tres different de celui vu sur pmu.fr, pour la MEME combinaison gagnante)
// — l'endpoint rapports-definitifs expose en realite DEUX pools PMU
// independants (national et internet), pas un seul comme suppose
// jusqu'ici (voir buildRapportsUrl pour le detail complet). fetchRapportsPmu
// recupere desormais les deux et les fusionne ; extraireRapportsCoupleGagnant/
// extraireRapportsTrio privilegient le pool internet (celui affiche sur
// pmu.fr, l'utilisateur jouant en ligne).
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
/**
 * `type` distingue trois usages : 'participants' (cotes, par defaut),
 * 'resultat' (arrivee officielle) et 'rapports' (dividendes PMU officiels,
 * dont Couplé Gagnant — voir fetchRapportsPmu ci-dessous).
 */
function buildNetlifyFunctionUrl(date, numReunion, numCourse, type = 'participants', specialisation) {
  const params = new URLSearchParams({
    date: formatDatePmu(date),
    reunion: String(numReunion),
    course: String(numCourse),
    type
  });
  if (specialisation) params.set('specialisation', specialisation);
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
function buildExternalFunctionUrl(date, numReunion, numCourse, type = 'participants', specialisation) {
  if (!EXTERNAL_FUNCTION_URL) {
    throw new Error('non configure — voir HEBERGEMENT.md');
  }
  const params = new URLSearchParams({
    date: formatDatePmu(date),
    reunion: String(numReunion),
    course: String(numCourse),
    type
  });
  if (specialisation) params.set('specialisation', specialisation);
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
function creerTentatives(type, specialisation) {
  return [
    { label: 'fonction externe', build: (url, date, numReunion, numCourse) => buildExternalFunctionUrl(date, numReunion, numCourse, type, specialisation) },
    { label: 'fonction serverless Netlify', build: (url, date, numReunion, numCourse) => buildNetlifyFunctionUrl(date, numReunion, numCourse, type, specialisation) },
    { label: 'acces direct', build: (url) => url },
    { label: 'proxy allorigins.win', build: (url) => `${CORS_PROXY_URL}${encodeURIComponent(url)}` },
    { label: 'proxy corsproxy.io', build: (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}` },
    { label: 'proxy codetabs.com', build: (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}` }
  ];
}

const TENTATIVES = creerTentatives('participants');
const TENTATIVES_RESULTAT = creerTentatives('resultat');
// Rapports : deux pools PMU INDEPENDANTS existent pour un meme pari (voir
// buildRapportsUrl et fetchRapportsPmu plus bas) - une liste de tentatives
// par pool, pour que "acces direct"/les proxies (qui utilisent l'URL passee
// telle quelle, deja construite avec ou sans ?specialisation=INTERNET) visent
// le bon pool.
const TENTATIVES_RAPPORTS = creerTentatives('rapports');
const TENTATIVES_RAPPORTS_INTERNET = creerTentatives('rapports', 'INTERNET');

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
 * URL de l'endpoint "rapports-definitifs" de l'API PMU (dividendes officiels
 * une fois la course terminee et les rapports mis en paiement).
 *
 * *** Corrige *** : contrairement a ce qui etait suppose auparavant, cet
 * endpoint ne renvoie PAS les deux pools PMU dans une seule reponse. Ce sont
 * deux pools mutuels INDEPENDANTS (mises/gagnants/dividendes propres a
 * chacun), verifie sur une course reelle (Trio 5-6-16, 09/08/2026) :
 *  - **sans** le parametre `specialisation` : pool "national" (points de
 *    vente + internet AGREGES), types de pari sans prefixe (`TRIO`,
 *    `COUPLE_GAGNANT`...) — celui que l'app recuperait seul jusqu'ici.
 *    Exemple reel : Trio 5-6-16 -> 74,90€ (66,96 gagnants).
 *  - **avec** `?specialisation=INTERNET` : pool **internet uniquement**
 *    (le pari pris via pmu.fr/l'appli PMU), types de pari prefixes `E_`
 *    (`E_TRIO`, `E_COUPLE_GAGNANT`...) — celui affiche sur la page
 *    "Rapports definitifs" de pmu.fr (onglet "e.Trio" etc.). Meme exemple :
 *    5-6-16 -> 228,30€ (10 gagnants) — un pool bien plus petit, donc un
 *    dividende tres different pour la MEME combinaison gagnante.
 * `fetchRapportsPmu` (plus bas) appelle desormais les deux et fusionne les
 * resultats, pour que l'appelant (extraireRapportsCoupleGagnant/
 * extraireRapportsTrio) ait acces aux deux pools et puisse choisir.
 * @param {Date|string} date
 * @param {number} numReunion
 * @param {number} numCourse
 * @param {string} [specialisation] - 'INTERNET' pour le pool internet
 *   uniquement (celui affiche par pmu.fr pour un joueur en ligne) ; omis
 *   pour le pool national (celui habituellement cite en reference, ex.
 *   presse hippique).
 * @returns {string}
 */
export function buildRapportsUrl(date, numReunion, numCourse, specialisation) {
  const suffixe = specialisation ? `?specialisation=${encodeURIComponent(specialisation)}` : '';
  return `${BASE_URL}/${formatDatePmu(date)}/R${numReunion}/C${numCourse}/rapports-definitifs${suffixe}`;
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
 * Extrait, d'une reponse JSON "rapports-definitifs" de l'API PMU (endpoint
 * .../rapports-definitifs, voir buildRapportsUrl — desormais fusionnee par
 * fetchRapportsPmu a partir des DEUX pools, national et internet), les
 * dividendes officiels du pari **Couplé Gagnant** — un rapport par
 * combinaison gagnante (en pratique une seule, sauf cas rarissime).
 *
 * *** Corrige *** (a la demande de l'utilisateur, suite a un ecart constate
 * entre l'appli et pmu.fr sur un rapport Trio — cf. buildRapportsUrl) :
 * privilegie desormais le pool **internet** (`E_COUPLE_GAGNANT`, celui
 * affiche sur la page "Rapports definitifs" de pmu.fr pour un joueur en
 * ligne) et se replie sur le pool **national** (`COUPLE_GAGNANT`) si le
 * premier est absent de la reponse fusionnee. Renvoie un tableau vide si
 * aucun des deux types de pari n'est present (le PMU n'ouvre pas toujours
 * le Couplé Gagnant, notamment sur les tres petits champs). Fonction pure,
 * testable sans reseau.
 * @param {Array} json - reponse (fusionnee) de l'endpoint rapports-definitifs
 *   (tableau d'objets `{typePari, rapports:[{combinaison, dividendePourUnEuro, ...}]}`).
 * @returns {Array<{numeros:number[], dividende:number}>} dividende exprime
 *   en euros pour une mise de 1€ (le champ API `dividendePourUnEuro`, deja
 *   normalise pour 1€ quel que soit le type de pari, est fourni en centimes
 *   et donc divise par 100 ici).
 */
export function extraireRapportsCoupleGagnant(json) {
  if (!Array.isArray(json)) return [];
  const bloc = json.find((p) => p?.typePari === 'E_COUPLE_GAGNANT') || json.find((p) => p?.typePari === 'COUPLE_GAGNANT');
  if (!bloc || !Array.isArray(bloc.rapports)) return [];

  return bloc.rapports
    .map((r) => {
      const numeros = String(r?.combinaison || '')
        .split('-')
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n));
      const dividende = typeof r?.dividendePourUnEuro === 'number' ? r.dividendePourUnEuro / 100 : null;
      return numeros.length === 2 && dividende != null ? { numeros, dividende } : null;
    })
    .filter(Boolean);
}

/**
 * Extrait, d'une reponse JSON "rapports-definitifs" de l'API PMU (endpoint
 * .../rapports-definitifs, voir buildRapportsUrl — desormais fusionnee par
 * fetchRapportsPmu a partir des DEUX pools, national et internet), les
 * dividendes officiels du pari **Trio** — un rapport par combinaison
 * gagnante (en pratique une seule, sauf cas rarissime).
 *
 * *** Corrige *** (bug signale par l'utilisateur : rapport Trio affiche par
 * l'appli tres different de celui vu sur pmu.fr pour la MEME combinaison
 * gagnante — cf. buildRapportsUrl pour le detail complet de la cause) :
 * privilegie desormais le pool **internet** (`E_TRIO`, celui affiche sur la
 * page "Rapports definitifs" de pmu.fr pour un joueur en ligne) et se
 * replie sur le pool **national** (`TRIO`) si le premier est absent de la
 * reponse fusionnee. Renvoie un tableau vide si aucun des deux types de
 * pari n'est present (le PMU n'ouvre pas toujours le Trio, notamment sur
 * les tres petits champs). Fonction pure, testable sans reseau - meme
 * structure que extraireRapportsCoupleGagnant ci-dessus, avec 3 numeros par
 * combinaison au lieu de 2.
 * @param {Array} json - reponse (fusionnee) de l'endpoint rapports-definitifs.
 * @returns {Array<{numeros:number[], dividende:number}>} dividende exprime
 *   en euros pour une mise de 1€.
 */
export function extraireRapportsTrio(json) {
  if (!Array.isArray(json)) return [];
  const bloc = json.find((p) => p?.typePari === 'E_TRIO') || json.find((p) => p?.typePari === 'TRIO');
  if (!bloc || !Array.isArray(bloc.rapports)) return [];

  return bloc.rapports
    .map((r) => {
      const numeros = String(r?.combinaison || '')
        .split('-')
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n));
      const dividende = typeof r?.dividendePourUnEuro === 'number' ? r.dividendePourUnEuro / 100 : null;
      return numeros.length === 3 && dividende != null ? { numeros, dividende } : null;
    })
    .filter(Boolean);
}

/**
 * Extrait, d'une reponse JSON "rapports-definitifs" de l'API PMU (fusionnee
 * par fetchRapportsPmu), le dividende officiel du pari **Simple Gagnant**
 * pour CHAQUE cheval concerne (en pratique un seul : le vainqueur de la
 * course - un Simple Gagnant n'a de rapport que pour le numero qui gagne).
 * Meme priorite E_ (pool internet) que extraireRapportsTrio/CoupleGagnant
 * ci-dessus, avec repli sur le pool national. Fonction pure, testable sans
 * reseau.
 * @param {Array} json - reponse (fusionnee) de l'endpoint rapports-definitifs.
 * @returns {Array<{numero:number, dividende:number}>} dividende exprime
 *   en euros pour une mise de 1€.
 */
export function extraireRapportsSimpleGagnant(json) {
  if (!Array.isArray(json)) return [];
  const bloc = json.find((p) => p?.typePari === 'E_SIMPLE_GAGNANT') || json.find((p) => p?.typePari === 'SIMPLE_GAGNANT');
  if (!bloc || !Array.isArray(bloc.rapports)) return [];

  return bloc.rapports
    .map((r) => {
      const numero = Number(r?.combinaison);
      const dividende = typeof r?.dividendePourUnEuro === 'number' ? r.dividendePourUnEuro / 100 : null;
      return Number.isFinite(numero) && dividende != null ? { numero, dividende } : null;
    })
    .filter(Boolean);
}

/**
 * Extrait, d'une reponse JSON "rapports-definitifs" de l'API PMU (fusionnee
 * par fetchRapportsPmu), le dividende officiel du pari **Simple Place**
 * pour CHAQUE cheval concerne (un rapport par cheval arrive dans les
 * places payantes - 2 ou 3 selon le nombre de partants). Meme priorite E_
 * (pool internet) que les autres extracteurs, avec repli sur le pool
 * national. Fonction pure, testable sans reseau.
 * @param {Array} json - reponse (fusionnee) de l'endpoint rapports-definitifs.
 * @returns {Array<{numero:number, dividende:number}>} dividende exprime
 *   en euros pour une mise de 1€.
 */
export function extraireRapportsSimplePlace(json) {
  if (!Array.isArray(json)) return [];
  const bloc = json.find((p) => p?.typePari === 'E_SIMPLE_PLACE') || json.find((p) => p?.typePari === 'SIMPLE_PLACE');
  if (!bloc || !Array.isArray(bloc.rapports)) return [];

  return bloc.rapports
    .map((r) => {
      const numero = Number(r?.combinaison);
      const dividende = typeof r?.dividendePourUnEuro === 'number' ? r.dividendePourUnEuro / 100 : null;
      return Number.isFinite(numero) && dividende != null ? { numero, dividende } : null;
    })
    .filter(Boolean);
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

/**
 * Une cascade de tentatives (voir TENTATIVES_RAPPORTS/TENTATIVES_RAPPORTS_INTERNET)
 * pour UN SEUL pool (national ou internet, selon `specialisation`). Factorise
 * la boucle commune a fetchRapportsPmu ci-dessous, appelee une fois par pool.
 * Ne leve jamais d'exception : renvoie `null` si toutes les tentatives de CE
 * pool echouent.
 *
 * Garde-fou important pour le pool internet : la fonction externe
 * (EXTERNAL_FUNCTION_URL, ex. Val Town) et la fonction serverless Netlify
 * sont du CODE deploye separement de cette app (voir cloudflare-worker/
 * pmu-cotes.js, netlify/functions/pmu-cotes.js) — si ce code n'a pas encore
 * ete mis a jour pour relayer le parametre `specialisation` vers l'API PMU
 * (ce correctif l'ajoute, mais une fonction externe deja deployee AVANT ne
 * le fait pas tant qu'elle n'est pas re-deployee), elle repond quand meme
 * avec succes, mais avec le pool NATIONAL au lieu du pool internet demande
 * — une reponse valide en apparence, mais fausse. On detecte ce cas (aucun
 * `typePari` prefixe `E_` dans une reponse non vide alors qu'on a demande le
 * pool internet) et on continue la cascade au lieu d'accepter cette
 * tentative : l'acces direct/les proxies suivants utilisent l'URL PMU reelle
 * avec `?specialisation=INTERNET` deja integre dans la chaine, donc toujours
 * corrects independamment du code deploye ailleurs.
 */
async function fetchRapportsUnPool(date, numReunion, numCourse, specialisation, tentatives, timeoutMs) {
  const url = buildRapportsUrl(date, numReunion, numCourse, specialisation);
  for (const tentative of tentatives) {
    try {
      const json = await fetchJson(tentative.build(url, date, numReunion, numCourse), timeoutMs);
      if (!Array.isArray(json)) continue;
      const specialisationIgnoreeParLaSource = specialisation
        && json.length > 0
        && !json.some((p) => typeof p?.typePari === 'string' && p.typePari.startsWith('E_'));
      if (specialisationIgnoreeParLaSource) continue;
      return json;
    } catch {
      // Volontairement ignore, meme principe que fetchResultatPmu ci-dessus.
    }
  }
  return null;
}

/**
 * Tente de recuperer les rapports officiels (dividendes) d'une course
 * terminee, via la meme cascade fiable que fetchCotesPmu/fetchResultatPmu.
 * Contrairement a extraireRapportsCoupleGagnant (fonction pure), celle-ci
 * fait le reseau et renvoie le JSON BRUT de l'endpoint rapports-definitifs
 * (tableau, un objet par type de pari) — a l'appelant d'en extraire ensuite
 * ce qui l'interesse (ex. `extraireRapportsCoupleGagnant`). NE LEVE JAMAIS
 * D'EXCEPTION : renvoie `null` si toutes les tentatives echouent (reseau)
 * OU si les rapports ne sont pas encore mis en paiement, pour ne jamais
 * interrompre la page "Resultat" (bilan financier) qui l'appelle course par
 * course. Un tableau vide (course terminee mais Couplé Gagnant non propose
 * par le PMU pour cette course) est une reponse VALIDE, distincte de `null`
 * (reseau/pas encore disponible) — voir renderResultatJournee (js/app.js),
 * qui distingue les deux cas pour savoir s'il faut reessayer plus tard.
 *
 * *** Corrige *** : recupere desormais les DEUX pools PMU (national ET
 * internet, en parallele — voir buildRapportsUrl pour le detail de cette
 * distinction, decouverte suite a un ecart signale par l'utilisateur entre
 * le rapport Trio affiche par l'appli et celui vu sur pmu.fr) et fusionne
 * les deux tableaux en un seul, pour que l'extraction (qui privilegie
 * desormais le pool internet — l'utilisateur joue en ligne) ait acces aux
 * deux. Si un seul des deux pools repond (l'autre en echec reseau), le
 * resultat de celui qui a reussi est quand meme renvoye (pas de perte totale
 * pour une panne partielle) ; `null` uniquement si les DEUX echouent.
 * @param {Date|string} date
 * @param {number} numReunion
 * @param {number} numCourse
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<Array|null>}
 */
export async function fetchRapportsPmu(date, numReunion, numCourse, { timeoutMs = TIMEOUT_PAR_DEFAUT_MS } = {}) {
  const [national, internet] = await Promise.all([
    fetchRapportsUnPool(date, numReunion, numCourse, undefined, TENTATIVES_RAPPORTS, timeoutMs),
    fetchRapportsUnPool(date, numReunion, numCourse, 'INTERNET', TENTATIVES_RAPPORTS_INTERNET, timeoutMs)
  ]);
  if (!national && !internet) return null;
  return [...(national || []), ...(internet || [])];
}
