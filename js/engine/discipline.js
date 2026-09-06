// =============================================================================
// discipline.js
// Portage de l'enum Swift `Discipline` (lui-même portage de `EstDisciplinePlat`
// et de la logique de comparaison "souple" utilisée dans `CalculerScoreAptitude`).
// =============================================================================

const PAIRES = ['ATTEL', 'MONT', 'PLAT', 'HAIE', 'STEEPLE'];

/**
 * @typedef {Object} Discipline
 * @property {string} raw - texte brut tel que lu dans le CSV.
 * @property {string} canonical - libellé canonicalisé (ATTELE/MONTE/PLAT/HAIES/STEEPLE/OBSTACLE/<brut en majuscules>).
 * @property {boolean} estPlat - true si Plat/Haies/Steeple/Obstacle (réplique EstDisciplinePlat).
 */

/**
 * @param {string} raw
 * @returns {Discipline}
 */
export function disciplineFromRaw(raw) {
  const d = (raw || '').trim().toUpperCase();
  let canonical;
  if (d.includes('ATTEL')) canonical = 'ATTELE';
  else if (d.includes('MONT')) canonical = 'MONTE';
  else if (d.includes('PLAT')) canonical = 'PLAT';
  else if (d.includes('HAIE')) canonical = 'HAIES';
  else if (d.includes('STEEPLE')) canonical = 'STEEPLE';
  else if (d.includes('OBSTACLE')) canonical = 'OBSTACLE';
  else canonical = d;

  const estPlat = ['PLAT', 'HAIES', 'STEEPLE', 'OBSTACLE'].includes(canonical);

  return { raw: raw || '', canonical, estPlat };
}

/**
 * Réplique la comparaison "souple" de `CalculerScoreAptitude` :
 * égalité stricte, ou les deux textes contiennent le même radical parmi
 * ATTEL/MONT/PLAT/HAIE/STEEPLE.
 * @param {Discipline} disciplineJour
 * @param {string} disciplinePerfRaw
 * @returns {boolean}
 */
export function disciplineCorrespond(disciplineJour, disciplinePerfRaw) {
  const discPerf = (disciplinePerfRaw || '').trim().toUpperCase();
  const discJour = disciplineJour.canonical;
  if (discPerf === discJour) return true;
  return PAIRES.some((p) => discPerf.includes(p) && discJour.includes(p));
}
