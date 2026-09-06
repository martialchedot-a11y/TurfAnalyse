import { selRubsPourDiscipline, topNPourRubrique } from './rubriques.js';

// =============================================================================
// scoreRubriques.js
// Portage de `CalculerScoreRubriquesCourse` (module VBA "AnalysePerformanceChevaux"
// / Module 1, v6.2) : un bonus ajoute DIRECTEMENT (non pondere) au Score Global
// de chaque cheval, selon le nombre de rubriques techniques (parmi les 5
// selectionnees pour la discipline, meme config que le Module 2 "Base(s)
// possible(s) / Danger(s)") ou il figure dans le Top N du champ.
//
// Bonus = (nb de rubriques ou le cheval est dans le Top N) x BONUS_PAR_RUBRIQUE.
// Avec 5 rubriques et BONUS_PAR_RUBRIQUE=3, le bonus va de 0 a 15 points.
//
// NB_TOP par defaut = 4 ici (constante locale a CalculerScoreRubriquesCourse
// en VBA, lue depuis la cellule C1 de la feuille "Analyse complete courses"
// avec repli sur 4 si absente/invalide) - DIFFERENT du NB_TOP_DEFAUT=3 utilise
// par le Module 2 (basesEtDangers.js), qui est une configuration distincte.
// Sans equivalent de cellule Excel configurable ici, on utilise directement
// la valeur de repli (4).
// =============================================================================

const BONUS_PAR_RUBRIQUE_DEFAUT = 3;
const NB_TOP_DEFAUT_SCORE = 4;

/**
 * @param {Array} chevaux - chaque element a `.entry.numero` et `.entry.rubriques`
 *   (meme forme que pour `calculerBasesEtDangers`) ; typiquement le tableau
 *   `horses` de raceAnalyzer.js (avant construction des `results`).
 * @param {string} disciplineCanonique - ex. "ATTELE", "PLAT"...
 * @param {number} nbTop
 * @param {number} bonusParRubrique
 * @returns {Map<number, number>} bonus (0 a nbRubriques*bonusParRubrique) par numero de cheval.
 */
export function calculerBonusRubriques(
  chevaux,
  disciplineCanonique,
  nbTop = NB_TOP_DEFAUT_SCORE,
  bonusParRubrique = BONUS_PAR_RUBRIQUE_DEFAUT
) {
  const selRubs = selRubsPourDiscipline(disciplineCanonique);

  const bonusParNumero = new Map();
  for (const c of chevaux) bonusParNumero.set(c.entry.numero, 0);

  for (const rubIdx of selRubs) {
    const top = topNPourRubrique(chevaux, rubIdx, nbTop);
    for (const numero of top) {
      bonusParNumero.set(numero, (bonusParNumero.get(numero) ?? 0) + bonusParRubrique);
    }
  }

  return bonusParNumero;
}
