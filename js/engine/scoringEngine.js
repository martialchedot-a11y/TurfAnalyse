import { arrondiVBA } from './coteUtils.js';
import { disciplineCorrespond } from './discipline.js';

// =============================================================================
// scoringEngine.js
// Portage fidèle des fonctions VBA de calcul de scores
// (CalculerScoreForme, CalculerScoreAptitude, CalculerScoreConditions,
//  CalculerScoreCote, CalculerScoreConditionsSimilaires, CalculerCoteProbable)
// du module "AnalysePerformanceChevaux" v6.2 du classeur Excel d'origine.
//
// IMPORTANT — contrat d'appel :
// Toutes les fonctions qui prennent un tableau `perfs` s'attendent à recevoir
// UNIQUEMENT les performances du cheval concerné, déjà triées de la plus
// récente à la plus ancienne.
//
// Forme attendue d'une performance (objet "PerformancePast") :
// { lieu, distance, gains, partants, discipline, allocation, place,
//   redKDist, indiceValeur, poidsPorte }
// =============================================================================

/**
 * @param {Array<Object>} perfs
 * @param {boolean} disciplinePlat
 * @returns {{score:number, nbCourses:number, dernierePlace:number}}
 */
export function scoreForme(perfs, disciplinePlat) {
  let totalPoints = 0;
  let totalPoids = 0;
  let dernierePlace = 0;
  const places = [];
  let compteur = 0;

  for (const perf of perfs) {
    if (compteur >= 6) break;
    compteur += 1;
    const poids = Math.pow(2, 6 - compteur);
    totalPoids += poids;

    const place = perf.place;
    if (place && place > 0) {
      if (compteur === 1) dernierePlace = place;
      if (places.length < 6) places.push(place);

      const nbPartants = perf.partants || 0;
      const ratioPlace = nbPartants > 0 ? place / nbPartants : place / 12;

      switch (place) {
        case 1: totalPoints += 100 * poids; break;
        case 2: totalPoints += 88 * poids; break;
        case 3: totalPoints += 76 * poids; break;
        case 4: totalPoints += 65 * poids; break;
        case 5: totalPoints += 55 * poids; break;
        default: totalPoints += (ratioPlace <= 0.5 ? 45 : 25) * poids;
      }
    }

    if (disciplinePlat) {
      const indiceValeur = perf.indiceValeur;
      if (indiceValeur != null && indiceValeur > 0) {
        if (indiceValeur >= 100) totalPoints += 15 * poids;
        else if (indiceValeur >= 90) totalPoints += 10 * poids;
        else if (indiceValeur >= 80) totalPoints += 5 * poids;
        else if (indiceValeur < 60) totalPoints -= 5 * poids;
      }
      const poidsPorte = perf.poidsPorte;
      if (poidsPorte != null && poidsPorte > 0) {
        if (poidsPorte <= 54) totalPoints += 8 * poids;
        else if (poidsPorte <= 57) totalPoints += 4 * poids;
        else if (poidsPorte >= 62) totalPoints -= 8 * poids;
        else if (poidsPorte >= 60) totalPoints -= 4 * poids;
      }
    } else {
      const redKdist = perf.redKDist;
      if (redKdist != null && redKdist > 0) {
        if (redKdist < 115) totalPoints += 15 * poids;
        else if (redKdist < 118) totalPoints += 10 * poids;
        else if (redKdist < 120) totalPoints += 5 * poids;
      }
    }

    if ((perf.gains || 0) > 5000) totalPoints += 5 * poids;
    if ((perf.allocation || 0) > 50000) totalPoints += 8 * poids;
  }

  let score = 50;
  if (totalPoids > 0) score = totalPoints / totalPoids;

  if (compteur >= 5) score *= 1.08;
  if (compteur <= 1) score *= 0.8;
  if (compteur === 2) score *= 0.9;
  if (dernierePlace === 1) score *= 1.1;

  if (places.length >= 3) {
    const moyenne = places.reduce((a, b) => a + b, 0) / places.length;
    const variance = places.reduce((acc, p) => acc + Math.pow(p - moyenne, 2), 0) / places.length;
    const ecartType = Math.sqrt(variance);
    let bonus;
    if (ecartType <= 1.5) bonus = 12;
    else if (ecartType <= 2.5) bonus = 8;
    else if (ecartType <= 3.5) bonus = 4;
    else if (ecartType <= 5) bonus = 0;
    else if (ecartType <= 7) bonus = -5;
    else bonus = -10;
    score += bonus;
  }

  score = Math.min(100, Math.max(0, score));
  return { score, nbCourses: compteur, dernierePlace };
}

/**
 * @param {Array<Object>} perfs
 * @param {string} lieuJour
 * @param {import('./discipline.js').Discipline} disciplineJour
 * @param {number} distanceJour
 * @param {boolean} disciplinePlat
 * @returns {number}
 */
export function scoreAptitude(perfs, lieuJour, disciplineJour, distanceJour, disciplinePlat) {
  let coursesDistSim = 0, victDistSim = 0, placesDistSim = 0;
  let coursesLieu = 0, victLieu = 0;
  let coursesDisc = 0, victDisc = 0;
  let totalIndice = 0, nbIndice = 0;
  let compteur = 0;

  const lieuJourU = (lieuJour || '').toUpperCase();

  for (const perf of perfs) {
    if (compteur >= 10) break;
    compteur += 1;
    const place = perf.place;

    if (distanceJour > 0 && Math.abs((perf.distance || 0) - distanceJour) <= 300) {
      coursesDistSim += 1;
      if (place) {
        if (place === 1) victDistSim += 1;
        if (place <= 3) placesDistSim += 1;
      }
    }

    if ((perf.lieu || '').trim().toUpperCase() === lieuJourU) {
      coursesLieu += 1;
      if (place === 1) victLieu += 1;
    }

    if (disciplineCorrespond(disciplineJour, perf.discipline)) {
      coursesDisc += 1;
      if (place === 1) victDisc += 1;
    }

    if (disciplinePlat && perf.indiceValeur != null && perf.indiceValeur > 0) {
      totalIndice += perf.indiceValeur;
      nbIndice += 1;
    }
  }

  let scoreDistance;
  if (coursesDistSim > 0) {
    let s = ((victDistSim * 3 + placesDistSim) / (coursesDistSim * 4)) * 45 + 15;
    if (coursesDistSim >= 5) s += 5;
    scoreDistance = s;
  } else {
    scoreDistance = 20;
  }

  let scoreLieu;
  if (coursesLieu > 0) {
    let s = (victLieu / coursesLieu) * 25 + 10;
    if (coursesLieu >= 3) s += 5;
    scoreLieu = s;
  } else {
    scoreLieu = 15;
  }

  const scoreDisc = coursesDisc > 0 ? (victDisc / coursesDisc) * 30 + 15 : 15;

  let score;
  if (disciplinePlat) {
    let scoreIndice = 0;
    if (nbIndice > 0) {
      const indiceMoyen = totalIndice / nbIndice;
      if (indiceMoyen >= 110) scoreIndice = 20;
      else if (indiceMoyen >= 100) scoreIndice = 15;
      else if (indiceMoyen >= 90) scoreIndice = 10;
      else if (indiceMoyen >= 80) scoreIndice = 5;
      else if (indiceMoyen >= 70) scoreIndice = 0;
      else scoreIndice = -5;
    }
    score = scoreDistance + scoreLieu + scoreDisc + scoreIndice;
  } else {
    score = scoreDistance + scoreLieu + scoreDisc;
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * @param {number} reussiteJockey
 * @param {number} reussiteEntraineur
 * @param {string} ferrage
 * @param {boolean} disciplinePlat
 * @returns {number}
 */
export function scoreConditions(reussiteJockey, reussiteEntraineur, ferrage, disciplinePlat) {
  const scoreReussite = (r) => {
    if (!(r > 0)) return 20;
    if (r > 1) return Math.min(40, r * 0.4 + 20);
    return Math.min(40, r * 200 + 20);
  };

  const scoreJockey = scoreReussite(reussiteJockey);
  const scoreEntraineur = scoreReussite(reussiteEntraineur);

  let scoreFerrage;
  if (disciplinePlat) {
    scoreFerrage = 18;
  } else {
    switch ((ferrage || '').trim().toUpperCase()) {
      case '': case '4F': case 'FERRE': scoreFerrage = 18; break;
      case 'DF': case 'DEFERRE': case '4': scoreFerrage = 20; break;
      case 'DA': scoreFerrage = 19; break;
      case 'DP': scoreFerrage = 19; break;
      case 'DAP': case 'DPA': scoreFerrage = 20; break;
      default: scoreFerrage = 15;
    }
  }

  const score = scoreJockey + scoreEntraineur + scoreFerrage;
  return Math.min(100, Math.max(0, score));
}

/**
 * @param {number} cotePredictive
 * @param {number} coteDirecte
 * @param {number} cote8h
 * @returns {number}
 */
export function scoreCote(cotePredictive, coteDirecte, cote8h) {
  let coteMoyenne;
  if (cotePredictive > 0) coteMoyenne = cotePredictive;
  else if (coteDirecte > 0) coteMoyenne = coteDirecte;
  else if (cote8h > 0) coteMoyenne = cote8h;
  else coteMoyenne = 20;

  let score;
  if (coteMoyenne < 2) score = 95;
  else if (coteMoyenne < 3) score = 88;
  else if (coteMoyenne < 4) score = 80;
  else if (coteMoyenne < 5) score = 72;
  else if (coteMoyenne < 7) score = 63;
  else if (coteMoyenne < 10) score = 53;
  else if (coteMoyenne < 15) score = 43;
  else if (coteMoyenne < 25) score = 33;
  else if (coteMoyenne < 40) score = 25;
  else score = 18;

  if (cote8h > 0 && coteDirecte > 0) {
    const tendance = (cote8h - coteDirecte) / cote8h;
    if (tendance > 0.2) score += 10;
    else if (tendance > 0.1) score += 5;
    else if (tendance < -0.2) score -= 8;
    else if (tendance < -0.1) score -= 4;
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * @param {Array<Object>} perfs
 * @param {number} distanceJour
 * @param {string} lieuJour
 * @param {string} disciplineJourBrute - texte BRUT (pas canonicalisé), comme VBA g_Discipline.
 * @returns {number}
 */
export function scoreConditionsSimilaires(perfs, distanceJour, lieuJour, disciplineJourBrute) {
  let score = 0;
  let nb = 0;
  const lieuJourU = (lieuJour || '').toUpperCase();
  const discJourU = (disciplineJourBrute || '').trim().toUpperCase();

  for (const perf of perfs) {
    if (nb >= 10) break;

    if (Math.abs((perf.distance || 0) - distanceJour) <= 300) score += 8;
    if ((perf.lieu || '').trim().toUpperCase() === lieuJourU) score += 6;
    if (discJourU && (perf.discipline || '').toUpperCase().includes(discJourU)) score += 10;

    const place = perf.place;
    if (place && place > 0) {
      if (place === 1) score += 15;
      else if (place === 2) score += 10;
      else if (place === 3) score += 7;
      else if (place >= 4 && place <= 6) score += 4;
    }
    nb += 1;
  }

  if (nb > 0) score /= nb;
  return Math.min(40, Math.max(0, score));
}

/**
 * @param {number} forme
 * @param {number} aptitude
 * @param {number} conditions
 * @param {number} cote
 * @param {number} similaire
 * @returns {number}
 */
export function scoreGlobal(forme, aptitude, conditions, cote, similaire) {
  return forme * 0.35 + aptitude * 0.25 + conditions * 0.15 + cote * 0.1 + similaire * 0.15;
}

/**
 * @param {number[]} scoresGlobalChamp - ScoreGlobal de TOUS les chevaux (y compris celui-ci).
 * @param {number} scoreGlobalCheval
 * @param {number} cotePredictive
 * @param {number} cote8h
 * @param {number} coteDirecte
 * @returns {number}
 */
export function coteProbable(scoresGlobalChamp, scoreGlobalCheval, cotePredictive, cote8h, coteDirecte) {
  const temperature = 75;
  const sommeExp = scoresGlobalChamp.reduce((acc, s) => acc + Math.exp(s / temperature), 0);
  const probVictoire = sommeExp > 0
    ? Math.exp(scoreGlobalCheval / temperature) / sommeExp
    : 1 / Math.max(scoresGlobalChamp.length, 1);
  const coteSoftmax = probVictoire > 0 ? (1 / probVictoire) * 0.82 : 99;

  const poidsSoftmax = 0.6;
  const poidsPred = cotePredictive > 0 ? 0.2 : 0;
  const poids8h = cote8h > 0 ? 0.1 : 0;
  const poidsDirecte = coteDirecte > 0 ? 0.1 : 0;
  const sommePoids = poidsSoftmax + poidsPred + poids8h + poidsDirecte;

  let cp = coteSoftmax * (poidsSoftmax / sommePoids);
  if (poidsPred > 0) cp += cotePredictive * (poidsPred / sommePoids);
  if (poids8h > 0) cp += cote8h * (poids8h / sommePoids);
  if (poidsDirecte > 0) cp += coteDirecte * (poidsDirecte / sommePoids);

  cp = Math.max(1.1, Math.min(99, cp));
  return arrondiVBA(cp, 1);
}
