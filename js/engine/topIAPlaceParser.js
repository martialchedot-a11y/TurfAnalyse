// =============================================================================
// topIAPlaceParser.js
// Parseur du fichier quotidien "export-premium-turfbzh-AAAAMMJJ.csv" (Turf
// BZH, abonnement Premium) - ne retient QUE la section "TOP 5 IA PLACE" (le
// fichier contient aussi "Top 5 IA Gagnant", "TOP 5 chance combine" et
// "Selection du Renifleur", non utilisees ici).
//
// *** sept. 2026 (a la demande explicite de l'utilisateur) *** : remplace les
// anciens modules "Predictions externes" (predictionsExternesParser.js) et
// "Ecarts Jockeys/Entraineurs" (ecartsJockeyEntraineurParser.js), tous deux
// retires de l'appli a cette occasion. Sert desormais de signal croise pour
// deux usages :
//   - onglet "Liste des courses" : affiche les courses du jour concernees par
//     le Top 5 IA Place ;
//   - onglet Jeu Simple Gagnant : signale les chevaux du pool Value<=-30 qui
//     figurent AUSSI dans le Top 5 IA Place du jour (tous rangs confondus),
//     avec le(s) rang(s) IA correspondant - constat empirique (backtest
//     9 mois, janv.-sept. 2026, 717 selections IA matchees sur les courses
//     francaises de l'archive) : ce croisement "tous rangs x Value<=-30"
//     donne n=500, reussite Place 75,0%/rendement 101,5%, reussite Gagnant
//     45,8%/rendement 95,4% - environ 3,6x le volume du rang IA 1 seul, pour
//     un rendement Place proche de l'equilibre (legerement positif) et
//     Gagnant legerement negatif. A confirmer sur les mois a venir (risque de
//     sur-ajustement, plusieurs recoupements ayant ete testes avant de
//     retenir celui-ci) - affichage purement informatif, n'entre dans aucun
//     calcul de Score Global/Value/classement/dominance MX+OR+MA.
//
// Format observe (";"-delimite, UTF-8 avec BOM, decimales a la francaise) :
//   Date;Tableau;Course;Heure;Hippodrome;Partants;Cheval;Jockey;"% IA Gagnant";"% IA Placé";Discipline;Arrivée;"Cote PMU"
// La colonne "Course" encode a la fois le numero de course ET le numero du
// cheval, colles sans separateur (ex. "R1C113" = reunion 1 [ignoree, voir
// plus bas], "C" + "1" + "13" = course 1, cheval numero 13) : les 2 DERNIERS
// chiffres sont le numero du cheval (toujours sur 2 chiffres, complete par un
// zero si besoin), ce qui precede est le numero de course. Le numero de
// reunion ("R...") n'est volontairement PAS utilise pour le matching avec nos
// donnees : constat du backtest ci-dessus, la numerotation de reunion de
// Turf BZH (qui inclut toutes les reunions nationales + etrangeres) ne
// correspond pas a celle de nos fichiers d'archive (qui peuvent ne pas
// toutes les lister) - le numero de course AU SEIN d'un hippodrome donne,
// lui, est fiable. Les lignes de la section "TOP 5 IA PLACE" sont deja
// triees par "% IA Place" decroissant dans le fichier source : le rang IA (1
// a 5) est donc simplement l'ordre d'apparition dans cette section.

function splitCSVLine(line, delimiter = ';') {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (const c of line) {
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === delimiter && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim().replace(/^"|"$/g, ''));
}

function parseNombreFr(raw) {
  if (raw === undefined || raw === null || raw === '' || raw === '-') return null;
  const n = parseFloat(String(raw).replace(',', '.').trim());
  return Number.isNaN(n) ? null : n;
}

const SYNONYMES_HIPPODROME_IA = {
  PARISVINCENNES: 'VINCENNES',
  PARISLONGCHAMP: 'LONGCHAMP',
  LATESTEDEBUCH: 'LATESTE',
  CLAIREFONTAINEDEAUVILLE: 'CLAIREFONTAINE'
};

/**
 * Normalise un nom d'hippodrome pour comparaison entre le fichier Turf BZH
 * (accents, tirets) et nos donnees importees (PMU, majuscules sans accents) :
 * majuscules, accents retires, tout caractere non alphanumerique retire, puis
 * quelques synonymes connus ramenes a une forme commune (meme principe que
 * `normaliserHippodrome`, scoringEngine.js, en plus agressif car les 2
 * sources ont des conventions de ponctuation differentes - verifie sur le
 * backtest 9 mois, 430/457 courses francaises matchees directement, les 27
 * restantes couvertes par les synonymes ci-dessus).
 * @param {string|null|undefined} nom
 * @returns {string}
 */
export function normaliserHippodromeIA(nom) {
  const compact = (nom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return SYNONYMES_HIPPODROME_IA[compact] || compact;
}

/**
 * Decode la colonne "Course" du fichier Turf BZH ("R{reunion}C{course}{numero
 * sur 2 chiffres}") en {course, numero}. Le numero de reunion n'est pas
 * retourne (volontairement non utilise, voir commentaire d'en-tete).
 * `null` si le format ne correspond pas.
 * @param {string} raw - ex. "R1C113".
 * @returns {{course:number, numero:number}|null}
 */
export function decoderCourseIA(raw) {
  const m = String(raw || '').trim().match(/^R\d+C(\d+)$/i);
  if (!m) return null;
  const suffixe = m[1];
  if (suffixe.length < 3) return null;
  const numero = parseInt(suffixe.slice(-2), 10);
  const course = parseInt(suffixe.slice(0, -2), 10);
  if (Number.isNaN(numero) || Number.isNaN(course) || numero <= 0 || course <= 0) return null;
  return { course, numero };
}

/**
 * Parse le fichier "export-premium-turfbzh-AAAAMMJJ.csv" et ne retient que la
 * section "TOP 5 IA PLACE", dans l'ordre d'apparition (= rang IA 1 a 5,
 * fichier deja trie par "% IA Place" decroissant).
 * @param {string} csvRaw
 * @returns {Array<{rang:number, date:string, hippodrome:string,
 *   hippodromeNorm:string, heure:string, course:number|null, numero:number|null,
 *   partants:number|null, cheval:string, jockey:string, pctIAGagnant:number|null,
 *   pctIAPlace:number|null, discipline:string, arrivee:string, cotePmu:number|null}>}
 */
export function parseTopIAPlace(csvRaw) {
  // Retire un eventuel BOM UTF-8 en tete de fichier (au cas ou il n'aurait
  // pas deja ete consomme par le decodage en amont).
  const csv = csvRaw && csvRaw.charCodeAt(0) === 0xfeff ? csvRaw.slice(1) : (csvRaw || '');
  const lines = csv.split(/\r?\n/).map((l) => l.replace(/\r$/, '')).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const header = splitCSVLine(lines[0]);
  const idx = new Map();
  header.forEach((name, i) => {
    const c = (name || '').replace(/^D:/, '').trim();
    if (c && !idx.has(c)) idx.set(c, i);
  });
  const posDate = idx.get('Date');
  const posTableau = idx.get('Tableau');
  const posCourse = idx.get('Course');
  const posHeure = idx.get('Heure');
  const posHippodrome = idx.get('Hippodrome');
  const posPartants = idx.get('Partants');
  const posCheval = idx.get('Cheval');
  const posJockey = idx.get('Jockey');
  const posPctGagnant = idx.get('% IA Gagnant');
  const posPctPlace = idx.get('% IA Placé');
  const posDiscipline = idx.get('Discipline');
  const posArrivee = idx.get('Arrivée');
  const posCote = idx.get('Cote PMU');
  if (posTableau === undefined || posCourse === undefined || posHippodrome === undefined) return [];

  const estTop5IAPlace = (v) => {
    const u = (v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
    return u === 'TOP 5 IA PLACE';
  };

  const out = [];
  let rang = 0;
  for (let i = 1; i < lines.length; i++) {
    const row = splitCSVLine(lines[i]);
    if (!estTop5IAPlace(row[posTableau])) continue;
    rang += 1;
    const decode = decoderCourseIA(row[posCourse]);
    const hippodrome = posHippodrome !== undefined ? row[posHippodrome] : '';
    out.push({
      rang,
      date: posDate !== undefined ? row[posDate] : '',
      hippodrome,
      hippodromeNorm: normaliserHippodromeIA(hippodrome),
      heure: posHeure !== undefined ? row[posHeure] : '',
      course: decode ? decode.course : null,
      numero: decode ? decode.numero : null,
      partants: posPartants !== undefined ? parseNombreFr(row[posPartants]) : null,
      cheval: posCheval !== undefined ? row[posCheval] : '',
      jockey: posJockey !== undefined ? row[posJockey] : '',
      pctIAGagnant: posPctGagnant !== undefined ? parseNombreFr(row[posPctGagnant]) : null,
      pctIAPlace: posPctPlace !== undefined ? parseNombreFr(row[posPctPlace]) : null,
      discipline: posDiscipline !== undefined ? row[posDiscipline] : '',
      arrivee: posArrivee !== undefined ? row[posArrivee] : '',
      cotePmu: posCote !== undefined ? parseNombreFr(row[posCote]) : null
    });
  }
  return out;
}

/**
 * Retrouve le rang IA (1 a 5) d'un cheval d'une course donnee dans la liste
 * Top IA Place importee, en comparant hippodrome (normalise) + numero de
 * course (au sein de cet hippodrome) + numero du cheval. `null` si non
 * trouve ou si `topIAPlace` est vide/absent.
 * @param {Array|null|undefined} topIAPlace - retour de `parseTopIAPlace`.
 * @param {string} lieu - nom d'hippodrome de la course du jour (import
 *   courant de l'appli, ex. `context.lieu`).
 * @param {number} numeroCourse
 * @param {number} numeroCheval
 * @returns {number|null}
 */
export function trouverRangIAPlace(topIAPlace, lieu, numeroCourse, numeroCheval) {
  if (!Array.isArray(topIAPlace) || topIAPlace.length === 0) return null;
  const lieuNorm = normaliserHippodromeIA(lieu);
  const trouve = topIAPlace.find((r) =>
    r.hippodromeNorm === lieuNorm && r.course === numeroCourse && r.numero === numeroCheval
  );
  return trouve ? trouve.rang : null;
}
