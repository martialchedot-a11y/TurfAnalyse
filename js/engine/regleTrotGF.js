// =============================================================================
// regleTrotGF.js (sept. 2026, a la demande explicite de l'utilisateur)
//
// Regle Trot « gains faibles, derniere course ratee » - FIGEE le 29/09/2026,
// a ne plus modifier avant la fin du suivi (octobre a decembre 2026). Voir
// la fiche "claude/regle-trot-gains-faibles.md" du projet "Application Turf
// et turfBZH".
//
// Jouer 1 EUR en SIMPLE GAGNANT sur chaque cheval qui remplit TOUTES ces
// conditions :
//   1. Discipline : trot attele ou trot monte.
//   2. Cote BZH < 10 (champ Cote_BZH de turf.bzh).
//   3. Cote PMU entre 3 et 8 (cote au depart).
//   4. Gains de carriere < 50 % de ceux du cheval le plus riche de la course.
//   5. Derniere course ratee : 1er signe de la musique = 4e ou au-dela (4 a 9,
//      ou 0), ou D (disqualifie), ou A (arrete). Exclus : derniere course
//      1er/2e/3e, et chevaux sans musique (debutants).
// Plusieurs chevaux retenus dans la meme course : on les joue tous.
//
// Resultats mesures (cote finale, simple gagnant) : historique 581 paris,
// 22,5 % de gagnants, ROI +13,1 % (IC95 % -5,2 % a +31,5 % : un resultat
// neutre reste possible). Au plat la meme regle perd (-6,6 %) : trot
// uniquement. Les 4 ans sont a surveiller (-24,7 % sur 263 paris) mais NE
// SONT PAS exclus pendant le suivi.
//
// Fonctions pures (aucun DOM/reseau/IndexedDB), testees dans
// tests/engine.test.js.
// =============================================================================

export const REGLE_TROT_GF = Object.freeze({
  COTE_BZH_MAX: 10,        // Cote_BZH < 10 (strict)
  COTE_PMU_MIN: 3,         // cote PMU >= 3
  COTE_PMU_MAX: 8,         // cote PMU <= 8
  RATIO_GAINS_MAX: 0.5,    // gains < 50 % du plus riche (strict)
  MISE: 1,                 // 1 EUR simple gagnant par cheval retenu
  DATE_FIGEE: '2026-09-29',
  DEBUT_SUIVI: '2026-10-01',
  FIN_SUIVI: '2026-12-31'
});

/**
 * Premier signe (le plus recent) d'une musique ("6a1a4a", "(26) Da 3a",
 * "0m 5m (25) 1m"...). Ignore les marqueurs d'annee "(26)" et les espaces.
 * @param {string} musique
 * @returns {{signe:string, lettre:string}|null} signe en majuscule
 *   ("1".."9", "0", "D", "A", "T", ...) et lettre de discipline en
 *   minuscule ("a" attele, "m" monte, "p" plat...), ou null si musique vide.
 */
export function premierSigneMusique(musique) {
  const s = String(musique ?? '').trim();
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '(') {
      const fin = s.indexOf(')', i);
      if (fin < 0) return null;
      i = fin + 1;
    } else if (/\s|-|\//.test(ch)) {
      i++;
    } else {
      return { signe: ch.toUpperCase(), lettre: (s[i + 1] || '').toLowerCase() };
    }
  }
  return null;
}

/**
 * Condition 5 : derniere course ratee (4 a 9, 0, D ou A). Faux pour une
 * derniere course 1er/2e/3e, pour un debutant (musique vide) et pour tout
 * autre signe (T tombe, R retrogade...).
 * @param {string} musique
 * @returns {boolean}
 */
export function derniereCourseRatee(musique) {
  const p = premierSigneMusique(musique);
  if (!p) return false;
  return ['4', '5', '6', '7', '8', '9', '0', 'D', 'A'].includes(p.signe);
}

/**
 * Age depuis la colonne "SA" (sexe + age, ex. "H5", "F4", "M10").
 * @param {string} sexeAge
 * @returns {number|null}
 */
export function ageDepuisSexeAge(sexeAge) {
  const m = String(sexeAge ?? '').match(/(\d{1,2})/);
  return m ? Number(m[1]) : null;
}

/**
 * Vrai si la discipline canonique (discipline.js) est du trot.
 * @param {string} disciplineCanonique - ATTELE / MONTE / PLAT / ...
 * @returns {boolean}
 */
export function estDisciplineTrot(disciplineCanonique) {
  return disciplineCanonique === 'ATTELE' || disciplineCanonique === 'MONTE';
}

function nombreOuNull(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Evalue la regle sur une course.
 * @param {string} disciplineCanonique
 * @param {Array<{numero:number, nom:string, cotePmu:number|null,
 *   coteBzh:number|null, gains:number|null, musique:string,
 *   age:number|null}>} partants - `gains` doit provenir d'une SEULE source
 *   pour toute la course (voir `choisirGainsCourse`).
 * @returns {{applicable:boolean, raison:string|null, gainsMax:number|null,
 *   nbCoteBzh:number, chevaux:Array, retenus:Array, aConfirmer:Array}}
 *   - `retenus` : les 5 conditions sont remplies (a jouer).
 *   - `aConfirmer` : conditions 1, 3, 4, 5 remplies mais Cote_BZH inconnue
 *     (a verifier apres recuperation de la Cote_BZH).
 */
export function evaluerRegleTrotGF(disciplineCanonique, partants) {
  const R = REGLE_TROT_GF;
  const vide = { applicable: false, raison: null, gainsMax: null, nbCoteBzh: 0, chevaux: [], retenus: [], aConfirmer: [] };
  if (!estDisciplineTrot(disciplineCanonique)) return { ...vide, raison: 'course hors trot (regle propre au trot)' };
  const liste = Array.isArray(partants) ? partants : [];
  if (liste.length === 0) return { ...vide, raison: 'aucun partant' };

  const gainsConnus = liste.map((p) => nombreOuNull(p.gains)).filter((g) => g != null && g >= 0);
  const gainsMax = gainsConnus.length > 0 ? Math.max(...gainsConnus) : null;
  if (gainsMax == null || gainsMax <= 0) return { ...vide, raison: 'gains de carriere indisponibles pour cette course' };

  const chevaux = liste.map((p) => {
    const cotePmu = nombreOuNull(p.cotePmu);
    const coteBzh = nombreOuNull(p.coteBzh);
    const gains = nombreOuNull(p.gains);
    const signe = premierSigneMusique(p.musique);
    const ratioGains = gains != null && gains >= 0 ? gains / gainsMax : null;
    const criteres = {
      coteBzh: coteBzh == null ? null : (coteBzh > 0 && coteBzh < R.COTE_BZH_MAX),
      cotePmu: cotePmu != null && cotePmu >= R.COTE_PMU_MIN && cotePmu <= R.COTE_PMU_MAX,
      gains: ratioGains != null && ratioGains < R.RATIO_GAINS_MAX,
      musique: derniereCourseRatee(p.musique)
    };
    const autres = criteres.cotePmu && criteres.gains && criteres.musique;
    return {
      numero: p.numero,
      nom: p.nom || '',
      age: p.age ?? null,
      cotePmu,
      coteBzh,
      gains,
      ratioGains,
      dernierSigne: signe ? signe.signe : null,
      criteres,
      retenu: autres && criteres.coteBzh === true,
      aConfirmer: autres && criteres.coteBzh === null
    };
  });

  return {
    applicable: true,
    raison: null,
    gainsMax,
    nbCoteBzh: chevaux.filter((c) => c.coteBzh != null).length,
    chevaux,
    retenus: chevaux.filter((c) => c.retenu),
    aConfirmer: chevaux.filter((c) => c.aConfirmer)
  };
}

/**
 * Choisit UNE source de gains pour toute la course, pour que le ratio au
 * plus riche compare des valeurs homogenes : Gains_Totaux turf.bzh (source
 * de la regle) si connu pour TOUS les partants, sinon la colonne "Gains"
 * du fichier partants importe.
 * @param {Array<{gainsTotauxBzh?:number|null, gains?:number|null}>} horses
 * @returns {{source:'bzh'|'csv', gainsDe:function(Object):number|null}}
 */
export function choisirGainsCourse(horses) {
  const liste = Array.isArray(horses) ? horses : [];
  const toutBzh = liste.length > 0 && liste.every((h) => nombreOuNull(h.gainsTotauxBzh) != null);
  if (toutBzh) return { source: 'bzh', gainsDe: (h) => nombreOuNull(h.gainsTotauxBzh) };
  return { source: 'csv', gainsDe: (h) => nombreOuNull(h.gains) };
}

/**
 * Bilan du suivi (simple gagnant, mise fixe).
 * @param {Array<{gagnant:boolean, cote:number|null, age?:number|null,
 *   mise?:number}>} paris - paris dont l'arrivee est connue.
 * @returns {{n:number, nGagnants:number, mise:number, retour:number,
 *   benefice:number, roi:number|null, ans4:{n:number, mise:number,
 *   benefice:number, roi:number|null}}}
 */
export function bilanRegleTrotGF(paris) {
  const acc = { n: 0, nGagnants: 0, mise: 0, retour: 0 };
  const a4 = { n: 0, mise: 0, retour: 0 };
  for (const p of paris || []) {
    const mise = p.mise ?? REGLE_TROT_GF.MISE;
    const retour = p.gagnant && p.cote > 0 ? p.cote * mise : 0;
    acc.n++; acc.mise += mise; acc.retour += retour;
    if (p.gagnant) acc.nGagnants++;
    if (p.age === 4) { a4.n++; a4.mise += mise; a4.retour += retour; }
  }
  const benefice = acc.retour - acc.mise;
  const benef4 = a4.retour - a4.mise;
  return {
    n: acc.n,
    nGagnants: acc.nGagnants,
    mise: acc.mise,
    retour: acc.retour,
    benefice,
    roi: acc.mise > 0 ? benefice / acc.mise : null,
    ans4: { n: a4.n, mise: a4.mise, benefice: benef4, roi: a4.mise > 0 ? benef4 / a4.mise : null }
  };
}
