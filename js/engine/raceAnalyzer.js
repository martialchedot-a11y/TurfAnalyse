import * as ScoringEngine from './scoringEngine.js';
import * as ProbabilityEngine from './probabilityEngine.js';
import { arrondiVBA } from './coteUtils.js';
import { calculerBonusRubriques } from './scoreRubriques.js';

// =============================================================================
// raceAnalyzer.js
// Orchestrateur portant `CalculerTousLesScores` + `SimulerProbabilitesTop3` +
// `TrierChevaux` + `AfficherResultats` + `AjouterResume` (VBA, module
// "AnalysePerformanceChevaux" v6.2), pour UNE course. Inclut depuis la mise
// a jour v6.2 le bonus rubriques (`CalculerScoreRubriquesCourse`), ajoute
// directement (non pondere) au Score Global de chaque cheval - voir
// scoreRubriques.js.
//
// Hors périmètre V1 (volontairement non porté) : modules "Analyse complète
// courses" / "Comparaison" / trios / couplés / calcul bayésien de
// combinaisons de paris.
// =============================================================================

/**
 * @typedef {Object} HorseEntry
 * @property {number} numero
 * @property {string} nom
 * @property {string} ferrage
 * @property {string} sexeAge
 * @property {number} reussiteJockey
 * @property {number} reussiteEntraineur
 * @property {number} cote8h
 * @property {number} coteDirecte
 * @property {number} cotePredictive
 */

/**
 * @typedef {Object} CourseContext
 * @property {string} lieu
 * @property {import('./discipline.js').Discipline} discipline
 * @property {string} disciplineBrute
 * @property {number} distanceJour
 * @property {number} allocation
 * @property {number} nbPartants
 */

/**
 * Calcule le classement prédictif complet d'une course.
 * @param {Array<{entry: HorseEntry, historique: Array<Object>}>} horses
 * @param {CourseContext} context
 * @param {boolean} useCote8hPourValue - "Oui = C8, Non = Directe" (question posée par AnalyseReunion en VBA).
 */
export function analyser(horses, context, useCote8hPourValue) {
  const disciplinePlat = context.discipline.estPlat;

  // Bonus rubriques (Module 1 v6.2, CalculerScoreRubriquesCourse) : calcule
  // une seule fois pour TOUT le champ (necessite de comparer les chevaux
  // entre eux, meme config Top-N/discipline que le Module 2), puis ajoute
  // tel quel (non pondere) au Score Global de chaque cheval ci-dessous.
  const bonusRubriquesParNumero = calculerBonusRubriques(horses, context.discipline.canonical);

  // PASSE 1 : scores de base + ScoreGlobal
  const results = horses.map((h) => {
    const forme = ScoringEngine.scoreForme(h.historique, disciplinePlat);
    const aptitude = ScoringEngine.scoreAptitude(
      h.historique, context.lieu, context.discipline, context.distanceJour, disciplinePlat
    );
    const conditions = ScoringEngine.scoreConditions(
      h.entry.reussiteJockey, h.entry.reussiteEntraineur, h.entry.ferrage, disciplinePlat
    );
    const cote = ScoringEngine.scoreCote(h.entry.cotePredictive, h.entry.coteDirecte, h.entry.cote8h);
    const similaire = ScoringEngine.scoreConditionsSimilaires(
      h.historique, context.distanceJour, context.lieu, context.disciplineBrute
    );
    const bonusRubriques = bonusRubriquesParNumero.get(h.entry.numero) ?? 0;
    const global = ScoringEngine.scoreGlobal(forme.score, aptitude, conditions, cote, similaire) + bonusRubriques;

    // cotePourAffichage : Directe si connue, sinon 8h (comme dans AfficherResultats).
    const cotePourAffichage = h.entry.coteDirecte > 0 ? h.entry.coteDirecte : (h.entry.cote8h > 0 ? h.entry.cote8h : null);

    return {
      entry: h.entry,
      nbCourses: forme.nbCourses,
      dernierePlace: forme.dernierePlace,
      scoreForme: forme.score,
      scoreAptitude: aptitude,
      scoreConditions: conditions,
      scoreCote: cote,
      scoreSimilaire: similaire,
      scoreRubriques: bonusRubriques,
      scoreGlobal: global,
      cotePourAffichage,
      coteProbable: 0,
      value: 0,
      probVictoire: 0,
      probTop2: 0,
      probTop3: 0,
      indiceConfianceCheval: 0,
      classement: 0,
      recommandation: ''
    };
  });

  // PASSE 2 : cote probable + Value (nécessite le ScoreGlobal de TOUT le champ)
  const scoresChamp = results.map((r) => r.scoreGlobal);
  for (const r of results) {
    r.coteProbable = ScoringEngine.coteProbable(
      scoresChamp, r.scoreGlobal, r.entry.cotePredictive, r.entry.cote8h, r.entry.coteDirecte
    );

    let coteMarche;
    if (useCote8hPourValue) {
      coteMarche = r.entry.cote8h > 0 ? r.entry.cote8h : (r.entry.coteDirecte > 0 ? r.entry.coteDirecte : r.entry.cotePredictive);
    } else {
      coteMarche = r.entry.coteDirecte > 0 ? r.entry.coteDirecte : (r.entry.cote8h > 0 ? r.entry.cote8h : r.entry.cotePredictive);
    }
    if (coteMarche > 0 && r.coteProbable > 0) {
      r.value = arrondiVBA((coteMarche - r.coteProbable) / r.coteProbable * 100);
    } else {
      r.value = 0;
    }
  }

  // Probabilités Plackett-Luce (Top1/Top2/Top3) sur tout le champ
  const probas = ProbabilityEngine.probabilites(scoresChamp);
  results.forEach((r, i) => {
    r.probVictoire = probas[i].probVictoire;
    r.probTop2 = probas[i].probTop2;
    r.probTop3 = probas[i].probTop3;
    r.indiceConfianceCheval = probas[i].indiceConfiance;
  });

  // TRI (réplique TrierChevaux : Value<0 toujours devant Value>=0 ; au sein
  // d'un même groupe, tri par ProbVictoire+ProbTop3 décroissant)
  results.sort((a, b) => {
    const scoreA = a.probVictoire + a.probTop3;
    const scoreB = b.probVictoire + b.probTop3;
    const aNeg = a.value < 0;
    const bNeg = b.value < 0;
    if (aNeg === bNeg) return scoreB - scoreA;
    return aNeg ? -1 : 1;
  });
  results.forEach((r, i) => { r.classement = i + 1; });

  // RECOMMANDATIONS PAR RANG (réplique AfficherResultats).
  // NB : dans le classeur d'origine, le champ InfoCheval.Cote (distinct de
  // Cote8h/CoteDirecte/CotePredictive) n'est JAMAIS renseigné et reste à 0,
  // ce qui rend la condition "Cote <= 50" toujours vraie pour les rangs 9+.
  // La logique ci-dessous est donc la forme EFFECTIVEMENT exécutée par le
  // classeur (portage fidèle du comportement réel, pas de l'intention).
  for (const r of results) {
    const rang = r.classement;
    const { value, scoreGlobal: global } = r;
    if (rang >= 1 && rang <= 5) {
      if (value > 100) r.recommandation = 'Favori fragile';
      else if (value <= -30 && global >= 80) r.recommandation = 'Base très solide';
      else if (value <= -30 && global >= 60) r.recommandation = 'Base solide';
      else r.recommandation = 'Favori';
    } else if (rang >= 6 && rang <= 8) {
      r.recommandation = (value <= -30 && global >= 50) ? 'Outsider solide' : 'Outsider';
    } else {
      r.recommandation = value <= -30 ? 'Attention joué' : 'Eliminable';
    }
  }

  return { chevaux: results, resume: buildSummary(results) };
}

// -------------------------------------------------------------------
// RÉSUMÉ (réplique AjouterResume)
// -------------------------------------------------------------------
function buildSummary(chevaux) {
  const n = chevaux.length;
  const numero = (idx) => chevaux[idx].entry.numero;

  const bases = n >= 3 ? [numero(0), numero(1), numero(2)] : chevaux.map((c) => c.entry.numero);

  let outsiders = [];
  if (n >= 5) {
    outsiders = [numero(3), numero(4)];
    if (n >= 6) outsiders.push(numero(5));
    if (n >= 7) outsiders.push(numero(6));
    if (n >= 8) outsiders.push(numero(7));
  }

  const categorie = (predicate) => {
    const out = [];
    for (const c of chevaux) {
      if (predicate(c)) {
        out.push({ numero: c.entry.numero, value: c.value });
        if (out.length >= 5) break;
      }
    }
    return out;
  };

  const anormalementDelaisses = categorie((c) => c.value >= 20 && c.scoreGlobal >= 50);
  const coteLogique = categorie((c) => c.value >= -10 && c.value <= 10 && c.scoreGlobal >= 50);
  const plusJoue = categorie((c) => c.value > -30 && c.value < -10 && c.scoreGlobal >= 50);
  const tresJoueMefiance = categorie((c) => c.value <= -30 && c.scoreGlobal >= 50);

  const tierce = n >= 3 ? [numero(0), numero(1), numero(2)] : [];
  const quarte = n >= 4 ? [numero(0), numero(1), numero(2), numero(3)] : null;
  const quinte = n >= 5 ? [numero(0), numero(1), numero(2), numero(3), numero(4)] : null;
  const multi7 = n >= 7 ? Array.from({ length: 7 }, (_, i) => numero(i)) : null;

  const confiance = n >= 3
    ? (chevaux[0].scoreGlobal + chevaux[1].scoreGlobal + chevaux[2].scoreGlobal) / 3
    : (n > 0 ? chevaux[0].scoreGlobal : 0);

  let lisibiliteCourse;
  if (confiance >= 75) lisibiliteCourse = 'Course lisible';
  else if (confiance >= 55) lisibiliteCourse = 'Course ouverte';
  else lisibiliteCourse = 'Course très ouverte';

  let ecartTop3Vs4eme = null;
  let hierarchie = null;
  if (n >= 4) {
    const e = chevaux[0].scoreGlobal - chevaux[3].scoreGlobal;
    ecartTop3Vs4eme = e;
    if (e >= 15) hierarchie = 'Hiérarchie claire';
    else if (e >= 8) hierarchie = 'Hiérarchie serrée';
    else hierarchie = 'Pas de hiérarchie nette';
  }

  const confianceProbaTop3 = n >= 3
    ? (chevaux[0].probTop3 + chevaux[1].probTop3 + chevaux[2].probTop3) / 3
    : 0;

  const chevalLePlusSur = n > 0
    ? { numero: chevaux[0].entry.numero, probTop3: chevaux[0].probTop3, marge: chevaux[0].indiceConfianceCheval }
    : null;

  return {
    bases, outsiders, anormalementDelaisses, coteLogique, plusJoue, tresJoueMefiance,
    tierce, quarte, quinte, multi7, indiceConfiance: confiance, lisibiliteCourse,
    ecartTop3Vs4eme, hierarchie, confianceProbaTop3, chevalLePlusSur
  };
}

// -------------------------------------------------------------------
// VALEUR DES COUPLES (methode terrain, independante du modele de score)
// -------------------------------------------------------------------

/**
 * "Valeur des couples" : associe chaque base confirmee (Module 2, cf.
 * basesEtDangers.js - meme liste que "Simple gagnant/place (la Base)" dans
 * app.js) a chaque cheval du groupe Trio (Base(s)/Danger(s) + cote(s)
 * cible(s), cf. combinaisonsSuggereesHtml dans app.js), et calcule pour
 * chaque paire une valeur approximative de couple :
 *
 *   valeur = (cote Base x cote autre cheval) / 2
 *
 * Formule volontairement simple (mise a l'unite, sans commission/TRJ reel
 * du PMU), methode terrain classique - a titre indicatif, independante du
 * modele de score/probabilites utilise ailleurs dans l'app. Une meme paire
 * n'est jamais comptee deux fois (ex. si deux bases confirmees sont aussi
 * toutes les deux dans le groupe Trio, la paire base1/base2 n'apparait
 * qu'une seule fois), et une base n'est jamais associee a elle-meme.
 *
 * @param {Array<{entry:{numero:number}, cotePourAffichage:(number|null)}>} chevaux
 * @param {number[]} basesNumeros - numeros des bases confirmees (Module 2).
 * @param {number[]} autresNumeros - numeros du groupe Trio (bases/dangers/cotes cibles).
 * @returns {Array<{baseNumero:number, autreNumero:number, baseCote:number, autreCote:number, valeur:number}>}
 */
export function calculerValeurCouples(chevaux, basesNumeros, autresNumeros) {
  const coteParNumero = new Map((chevaux || []).map((c) => [c.entry.numero, c.cotePourAffichage]));
  const vues = new Set();
  const couples = [];
  for (const baseNumero of (basesNumeros || [])) {
    const baseCote = coteParNumero.get(baseNumero);
    if (baseCote == null || baseCote <= 0) continue;
    for (const autreNumero of (autresNumeros || [])) {
      if (autreNumero === baseNumero) continue;
      const cle = [baseNumero, autreNumero].sort((a, b) => a - b).join('-');
      if (vues.has(cle)) continue;
      vues.add(cle);
      const autreCote = coteParNumero.get(autreNumero);
      if (autreCote == null || autreCote <= 0) continue;
      const valeur = arrondiVBA((baseCote * autreCote) / 2, 2);
      couples.push({ baseNumero, autreNumero, baseCote, autreCote, valeur });
    }
  }
  return couples;
}

// -------------------------------------------------------------------
// INDICE DE CONVERGENCE (heuristique, PAS une correlation statistique)
// -------------------------------------------------------------------

/**
 * Libelles des 5 signaux, dans l'ordre fixe utilise par `signaux` ci-dessous
 * (reutilise pour l'affichage cote app.js).
 */
export const LIBELLES_SIGNAUX_CONVERGENCE = {
  coteResserree: 'cote resserree',
  formeAuDessus: 'forme',
  aptitudeAuDessus: 'aptitude',
  conditionsAuDessus: 'conditions',
  bonusRubriquesPositif: 'bonus rubriques'
};

/**
 * Indice de convergence : pour chaque cheval de la course, compte combien
 * de signaux INDEPENDANTS pointent dans le meme sens favorable :
 *
 *  1. `coteResserree` — la cote se resserre nettement entre le matin (8h) et
 *     la cote directe (tendance > 10%, meme seuil deja utilise par
 *     `scoringEngine.scoreCote` pour bonifier le Score Cote) : signe que le
 *     marche (l'ensemble des parieurs) se porte de plus en plus sur ce
 *     cheval.
 *  2. `formeAuDessus` — Score Forme au-dessus de la moyenne du champ pour
 *     cette course precise (forme relative, pas un seuil absolu arbitraire).
 *  3. `aptitudeAuDessus` — Score Aptitude au-dessus de la moyenne du champ.
 *  4. `conditionsAuDessus` — Score Conditions (jockey/entraineur/ferrage)
 *     au-dessus de la moyenne du champ.
 *  5. `bonusRubriquesPositif` — Bonus Rubriques (Module 1 v6.2) strictement
 *     positif : au moins une rubrique technique ou ce cheval figure dans le
 *     Top N du champ.
 *
 * *** Important — a bien comprendre *** : ceci est une regle de bon sens,
 * TRANSPARENTE (chaque signal est explicite et verifiable), mais ce n'est
 * PAS une correlation statistique prouvee : etablir qu'une combinaison de
 * signaux "predit" fiablement une arrivee demanderait de la comparer a un
 * historique consequent de resultats reels (backtesting), ce que cette
 * fonction ne fait pas. A prendre comme UN element de plus parmi d'autres
 * (Value, Base(s)/Danger(s), cote(s) cible(s)...), pas comme une prediction
 * a elle seule.
 *
 * @param {Array<{entry:{numero:number, nom:string, cote8h:number, coteDirecte:number}, scoreForme:number, scoreAptitude:number, scoreConditions:number, scoreRubriques:number}>} chevaux - result.chevaux de RaceAnalyzer.analyser().
 * @returns {Array<{numero:number, nom:string, nbSignaux:number, signaux:Object<string,boolean>}>} trie par nbSignaux decroissant (nombre de chevaux inchange, stable entre chevaux a egalite).
 */
export function calculerIndiceConvergence(chevaux) {
  const n = (chevaux || []).length;
  if (n === 0) return [];

  const moyenne = (fn) => chevaux.reduce((acc, c) => acc + fn(c), 0) / n;
  const moyForme = moyenne((c) => c.scoreForme || 0);
  const moyAptitude = moyenne((c) => c.scoreAptitude || 0);
  const moyConditions = moyenne((c) => c.scoreConditions || 0);

  return chevaux.map((c) => {
    const cote8h = c.entry.cote8h;
    const coteDirecte = c.entry.coteDirecte;
    const coteResserree = (cote8h > 0 && coteDirecte > 0) && (((cote8h - coteDirecte) / cote8h) > 0.1);
    const formeAuDessus = (c.scoreForme || 0) > moyForme;
    const aptitudeAuDessus = (c.scoreAptitude || 0) > moyAptitude;
    const conditionsAuDessus = (c.scoreConditions || 0) > moyConditions;
    const bonusRubriquesPositif = (c.scoreRubriques || 0) > 0;

    const signaux = { coteResserree, formeAuDessus, aptitudeAuDessus, conditionsAuDessus, bonusRubriquesPositif };
    const nbSignaux = Object.values(signaux).filter(Boolean).length;

    return { numero: c.entry.numero, nom: c.entry.nom, nbSignaux, signaux };
  }).sort((a, b) => b.nbSignaux - a.nbSignaux);
}
