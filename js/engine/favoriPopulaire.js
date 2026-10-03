// =============================================================================
// favoriPopulaire.js (oct. 2026, a la demande explicite de l'utilisateur)
//
// Regle "Favori populaire" : parmi les courses du fichier quotidien
// "Popularite_chevaux_AAAAMMJJ.xlsx" (Turf BZH), un cheval est QUALIFIE s'il
// est, dans SA course, a la fois :
//   1. le favori (plus petite cote),
//   2. le plus populaire (plus forte "Popularite"),
//   3. le n. 1 en "IA Gagnant".
// La SELECTION DU JOUR est le qualifie a la plus petite cote (1 pari simple
// gagnant par jour).
//
// Backtest qui motive la regle (01/01 - 13/09/2026, 256 jours, rapports
// officiels, toutes courses francaises + etrangeres du fichier) :
//   - favoris qualifies (pop. 1 + IA Gagnant 1) : n=1184, reussite 46%,
//     rendement gagnant 96%, place 98% ;
//   - selection du jour (plus petite cote) : n=255, reussite gagnant 67% /
//     place 83%, rendement gagnant 108% (janv.-mai 106%, juin-sept. 111%),
//     place 99%.
// A confirmer en reel : une quarantaine de variantes ont ete essayees avant
// de retenir celle-ci, et le backtest utilise la cote FINALE (en pratique,
// la plus petite cote se releve au dernier moment). Voir la fiche projet
// "backtest-top5-noteia-iaplace".
//
// Fonctions pures, testables sans navigateur ni reseau.
// =============================================================================

function nombreFr(raw) {
  if (raw === undefined || raw === null || raw === '' || raw === '-') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const n = parseFloat(String(raw).replace('%', '').replace(/\s/g, '').replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}

function normEntete(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Normalise un nom de cheval pour le rapprochement fichier Turf BZH <->
 * reunions importees : majuscules, accents retires, suffixe pays "(IT)"
 * retire, tout caractere non alphanumerique retire.
 * @param {string} nom
 * @returns {string}
 */
export function normaliserNomCheval(nom) {
  return String(nom ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\([A-Z]{2,3}\)\s*$/, '')
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Decode "R1C101" -> { reunion:1, course:1, numero:1 } (les 2 derniers
 * chiffres sont le numero du cheval). `null` si le format ne correspond pas.
 * @param {string} raw
 */
export function decoderCodeCourse(raw) {
  const m = String(raw ?? '').trim().match(/^R(\d+)C(\d+)$/i);
  if (!m || m[2].length < 3) return null;
  const numero = parseInt(m[2].slice(-2), 10);
  const course = parseInt(m[2].slice(0, -2), 10);
  const reunion = parseInt(m[1], 10);
  if (!(numero > 0) || !(course > 0) || !(reunion > 0)) return null;
  return { reunion, course, numero };
}

/**
 * Parse le classeur "Popularite_chevaux_AAAAMMJJ.xlsx" (feuille convertie en
 * tableau de lignes, `XLSX.utils.sheet_to_json(sheet, {header:1})`). La ligne
 * d'en-tete ("Cheval", "Code Course", ...) est recherchee dans les 5
 * premieres lignes (la 1re ligne du fichier est un titre).
 * @param {Array<Array>} lignes
 * @returns {Array<{cheval:string, nomNorm:string, reunion:number, course:number,
 *   numero:number, discipline:string, popularite:number|null, iaGagnant:number|null,
 *   iaPlace:number|null, noteIA:number|null, cote:number|null}>}
 */
export function parsePopularite(lignes) {
  if (!Array.isArray(lignes)) return [];
  let iEntete = -1;
  for (let i = 0; i < Math.min(lignes.length, 5); i++) {
    const noms = (lignes[i] || []).map(normEntete);
    if (noms.includes('CHEVAL') && noms.includes('CODECOURSE')) { iEntete = i; break; }
  }
  if (iEntete < 0) return [];
  const noms = lignes[iEntete].map(normEntete);
  const pos = (n) => noms.indexOf(n);
  const pCheval = pos('CHEVAL');
  const pCode = pos('CODECOURSE');
  const pDisc = pos('DISCIPLINE');
  const pPop = pos('POPULARITE');
  const pIAG = pos('IAGAGNANT');
  const pIAP = pos('IAPLACE');
  const pNote = pos('NOTEIA');
  const pCote = pos('COTE');
  const val = (row, p) => (p >= 0 ? row[p] : null);

  const out = [];
  for (const row of lignes.slice(iEntete + 1)) {
    if (!row) continue;
    const cheval = String(val(row, pCheval) ?? '').trim();
    const code = decoderCodeCourse(val(row, pCode));
    if (!cheval || !code) continue;
    out.push({
      cheval,
      nomNorm: normaliserNomCheval(cheval),
      reunion: code.reunion,
      course: code.course,
      numero: code.numero,
      discipline: String(val(row, pDisc) ?? '').trim(),
      popularite: nombreFr(val(row, pPop)),
      iaGagnant: nombreFr(val(row, pIAG)),
      iaPlace: nombreFr(val(row, pIAP)),
      noteIA: nombreFr(val(row, pNote)),
      cote: nombreFr(val(row, pCote))
    });
  }
  return out;
}

/** Cle d'un cheval du fichier (reunion-course-numero Turf BZH). */
export function cleFavori(r) {
  return `${r.reunion}-${r.course}-${r.numero}`;
}

/**
 * Applique la regle "Favori populaire".
 * @param {Array} rows - retour de `parsePopularite`.
 * @param {{ cotes?: Map<string, number> }} [options] - `cotes` : cotes plus
 *   recentes (ex. cote directe de la reunion importee) par `cleFavori` ;
 *   elles remplacent la cote du fichier pour les chevaux concernes.
 * @returns {{ qualifies: Array, selection: Object|null, nbCourses: number }}
 *   `qualifies` tries par cote croissante ; chaque element reprend la ligne
 *   du fichier + `coteRetenue`, `coteSource` ('directe'|'fichier'),
 *   `secondeCote` (2e plus petite cote de la course) et `nbPartants`.
 *   `selection` = premier des `qualifies` (plus petite cote), ou `null`.
 */
export function selectionFavoriPopulaire(rows, { cotes } = {}) {
  const parCourse = new Map();
  for (const r of rows || []) {
    const k = `${r.reunion}-${r.course}`;
    if (!parCourse.has(k)) parCourse.set(k, []);
    parCourse.get(k).push(r);
  }
  const qualifies = [];
  for (const chevaux of parCourse.values()) {
    const avecCote = chevaux
      .map((r) => {
        const directe = cotes ? cotes.get(cleFavori(r)) : null;
        const coteRetenue = directe > 0 ? directe : r.cote;
        return { ...r, coteRetenue, coteSource: directe > 0 ? 'directe' : 'fichier' };
      })
      .filter((r) => r.coteRetenue > 0);
    if (avecCote.length < 2) continue;
    // Favori : plus petite cote ; a cotes egales, le premier dans l'ordre du
    // fichier (un seul favori par course, comme dans le backtest).
    let favori = avecCote[0];
    for (const r of avecCote) if (r.coteRetenue < favori.coteRetenue) favori = r;
    const maxPop = Math.max(...avecCote.map((r) => (r.popularite ?? -Infinity)));
    const maxIAG = Math.max(...avecCote.map((r) => (r.iaGagnant ?? -Infinity)));
    if (favori.popularite == null || favori.iaGagnant == null) continue;
    if (favori.popularite < maxPop || favori.iaGagnant < maxIAG) continue;
    const autres = avecCote.filter((r) => r !== favori).map((r) => r.coteRetenue).sort((a, b) => a - b);
    qualifies.push({ ...favori, secondeCote: autres[0] ?? null, nbPartants: avecCote.length });
  }
  qualifies.sort((a, b) => a.coteRetenue - b.coteRetenue);
  return { qualifies, selection: qualifies[0] || null, nbCourses: parCourse.size };
}
