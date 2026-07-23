import test from 'node:test';
import assert from 'node:assert/strict';

import { convertirCote, arrondiVBA } from '../js/engine/coteUtils.js';
import * as ScoringEngine from '../js/engine/scoringEngine.js';
import * as ProbabilityEngine from '../js/engine/probabilityEngine.js';
import * as RaceAnalyzer from '../js/engine/raceAnalyzer.js';
import * as CSVImporter from '../js/engine/csvImporter.js';
import { disciplineFromRaw } from '../js/engine/discipline.js';
import { RUBRIQUES, selRubsPourDiscipline, associationsPourDiscipline } from '../js/engine/rubriques.js';
import { calculerBasesEtDangers, libelleNiveauBase } from '../js/engine/basesEtDangers.js';
import { calculerBonusRubriques } from '../js/engine/scoreRubriques.js';
import { calculerCotesCibles } from '../js/engine/cotesCibles.js';
import { parseCotesZeturf, apparierCotesZeturf } from '../js/engine/zeturfParser.js';
import { formatDatePmu, buildParticipantsUrl, buildCourseUrl, buildProxiedUrl, mapParticipantsPmu, extraireArriveePmu, fetchCotesPmu, fetchResultatPmu, _setExternalFunctionUrlPourTests } from '../js/engine/pmuApi.js';

function approx(actual, expected, tolerance = 0.01, message) {
  assert.ok(Math.abs(actual - expected) <= tolerance, message || `${actual} != ${expected} (±${tolerance})`);
}

// -------------------------------------------------------------------
// ConvertirCote / arrondiVBA
// -------------------------------------------------------------------
test('convertirCote gere virgule francaise, espaces, vide, non numerique', () => {
  assert.equal(convertirCote('3,5'), 3.5);
  assert.equal(convertirCote('12.5'), 12.5);
  assert.equal(convertirCote(' 4,2 '), 4.2);
  assert.equal(convertirCote(''), 0);
  assert.equal(convertirCote(null), 0);
  assert.equal(convertirCote('NP'), 0);
});

test('arrondiVBA arrondit au pair (banker rounding)', () => {
  assert.equal(arrondiVBA(2.5, 0), 2);
  assert.equal(arrondiVBA(3.5, 0), 4);
  assert.equal(arrondiVBA(1.25, 1), 1.2);
  assert.equal(arrondiVBA(3.14159, 2), 3.14);
});

// -------------------------------------------------------------------
// ScoreForme
// -------------------------------------------------------------------
test('scoreForme: aucun historique -> 40 (50 de base puis x0.8)', () => {
  const r = ScoringEngine.scoreForme([], false);
  assert.equal(r.score, 40);
  assert.equal(r.nbCourses, 0);
  assert.equal(r.dernierePlace, 0);
});

test('scoreForme: une victoire nette en Attele -> 100 (clampe)', () => {
  const perf = { lieu: 'VINCENNES', distance: 2700, gains: 0, partants: 12, discipline: 'ATTELE', allocation: 0, place: 1, redKDist: 110 };
  const r = ScoringEngine.scoreForme([perf], false);
  approx(r.score, 100, 0.001);
  assert.equal(r.nbCourses, 1);
  assert.equal(r.dernierePlace, 1);
});

// -------------------------------------------------------------------
// ScoreCote
// -------------------------------------------------------------------
test('scoreCote: tranches de cote', () => {
  assert.equal(ScoringEngine.scoreCote(1.5, 0, 0), 95);
  assert.equal(ScoringEngine.scoreCote(3.5, 0, 0), 80);
  assert.equal(ScoringEngine.scoreCote(0, 0, 0), 33);
});

test('scoreCote: tendance de baisse de cote', () => {
  const score = ScoringEngine.scoreCote(0, 4.0, 6.0);
  assert.equal(score, 82);
});

// -------------------------------------------------------------------
// ScoreConditions
// -------------------------------------------------------------------
test('scoreConditions: cas simple attele', () => {
  const score = ScoringEngine.scoreConditions(50, 0, 'DF', false);
  assert.equal(score, 80);
});

test('scoreConditions: ferrage neutre en Plat', () => {
  const score = ScoringEngine.scoreConditions(0, 0, 'peu importe', true);
  assert.equal(score, 58);
});

// -------------------------------------------------------------------
// Probabilites Plackett-Luce
// -------------------------------------------------------------------
test('probabilites: somme des ProbVictoire proche de 100%', () => {
  const probas = ProbabilityEngine.probabilites([80, 60, 40, 20, 55]);
  const somme = probas.reduce((a, p) => a + p.probVictoire, 0);
  approx(somme, 100, 0.2);
});

test('probabilites: ordre croissant avec le score', () => {
  const probas = ProbabilityEngine.probabilites([80, 60, 40, 20]);
  for (let i = 0; i < probas.length - 1; i++) {
    assert.ok(probas[i].probVictoire > probas[i + 1].probVictoire);
    assert.ok(probas[i].probTop3 > probas[i + 1].probTop3);
  }
});

test('probabilites: avec 3 partants ProbTop3 proche de 100%', () => {
  const probas = ProbabilityEngine.probabilites([80, 55, 30]);
  for (const p of probas) approx(p.probTop3, 100, 0.2);
});

test('probabilites: ProbTop2 = ProbVictoire + Prob(2e exactement), toujours entre ProbVictoire et ProbTop3', () => {
  const probas = ProbabilityEngine.probabilites([80, 60, 40, 20, 55]);
  for (const p of probas) {
    assert.ok(p.probTop2 >= p.probVictoire, `ProbTop2 (${p.probTop2}) >= ProbVictoire (${p.probVictoire})`);
    assert.ok(p.probTop2 <= p.probTop3, `ProbTop2 (${p.probTop2}) <= ProbTop3 (${p.probTop3})`);
  }
});

test('probabilites: avec 2 partants ProbTop2 proche de 100% pour les deux', () => {
  const probas = ProbabilityEngine.probabilites([70, 40]);
  for (const p of probas) approx(p.probTop2, 100, 0.2);
});

// -------------------------------------------------------------------
// RaceAnalyzer
// -------------------------------------------------------------------
test('RaceAnalyzer: smoke test 3 chevaux', () => {
  const context = {
    lieu: 'VINCENNES',
    discipline: disciplineFromRaw('ATTELE'),
    disciplineBrute: 'ATTELE',
    distanceJour: 2700,
    allocation: 40000,
    nbPartants: 3
  };
  const horses = [
    { entry: { numero: 1, nom: 'ALPHA', ferrage: '', sexeAge: '', reussiteJockey: 0, reussiteEntraineur: 0, cote8h: 3.0, coteDirecte: 2.8, cotePredictive: 3.0 }, historique: [] },
    { entry: { numero: 2, nom: 'BETA', ferrage: '', sexeAge: '', reussiteJockey: 0, reussiteEntraineur: 0, cote8h: 8.0, coteDirecte: 9.0, cotePredictive: 8.5 }, historique: [] },
    { entry: { numero: 3, nom: 'GAMMA', ferrage: '', sexeAge: '', reussiteJockey: 0, reussiteEntraineur: 0, cote8h: 20.0, coteDirecte: 25.0, cotePredictive: 22.0 }, historique: [] }
  ];
  const result = RaceAnalyzer.analyser(horses, context, false);

  assert.equal(result.chevaux.length, 3);
  const classements = result.chevaux.map((c) => c.classement).sort();
  assert.deepEqual(classements, [1, 2, 3]);

  const sommeProbVictoire = result.chevaux.reduce((a, c) => a + c.probVictoire, 0);
  approx(sommeProbVictoire, 100, 0.2);

  assert.equal(result.resume.bases.length, 3);
  assert.equal(result.resume.tierce.length, 3);
});

test('RaceAnalyzer.analyser: seuil Value <= -50 pour "Base tres solide" (rangs 1-5), Value <= -30 pour "Base solide" (backtest 3 mois, voir HEBERGEMENT.md)', () => {
  const contextATTELE = {
    lieu: 'VINCENNES',
    discipline: disciplineFromRaw('ATTELE'),
    disciplineBrute: 'ATTELE',
    distanceJour: 2700,
    allocation: 40000,
    nbPartants: 5
  };
  const h = (numero, nom, cote, reussiteJockey, reussiteEntraineur) => ({
    entry: { numero, nom, ferrage: 'DEFERRE', sexeAge: '', reussiteJockey, reussiteEntraineur, cote8h: cote, coteDirecte: cote, cotePredictive: cote },
    historique: []
  });

  // Cas A : Value = -48 (entre -50 et -30), ScoreGlobal >= 60 -> "Base solide"
  // (et NON "Base tres solide", puisque -48 > -50).
  const resultA = RaceAnalyzer.analyser([
    h(1, 'CIBLE', 1.5, 0.5, 0.5),
    h(2, 'RIVAL_A', 3.0, 0.5, 0.5),
    h(3, 'RIVAL_B', 5.0, 0.3, 0.3),
    h(4, 'RIVAL_C', 8.0, 0.1, 0.1),
    h(5, 'RIVAL_D', 15.0, 0.05, 0.05)
  ], contextATTELE, false);
  const cibleA = resultA.chevaux.find((c) => c.entry.nom === 'CIBLE');
  assert.equal(cibleA.classement, 1);
  approx(cibleA.value, -48, 1);
  assert.ok(cibleA.scoreGlobal >= 60);
  assert.equal(cibleA.recommandation, 'Base solide');

  // Cas B : meme champ (rang 1, ScoreGlobal >= 60) mais Value = -54 (<= -50)
  // -> bascule en "Base tres solide".
  const resultB = RaceAnalyzer.analyser([
    h(1, 'CIBLE', 1.3, 0.5, 0.5),
    h(2, 'RIVAL_A', 3.0, 0.6, 0.6),
    h(3, 'RIVAL_B', 4.0, 0.5, 0.5),
    h(4, 'RIVAL_C', 6.0, 0.4, 0.4),
    h(5, 'RIVAL_D', 10.0, 0.3, 0.3)
  ], contextATTELE, false);
  const cibleB = resultB.chevaux.find((c) => c.entry.nom === 'CIBLE');
  assert.equal(cibleB.classement, 1);
  approx(cibleB.value, -54, 1);
  assert.ok(cibleB.scoreGlobal >= 60);
  assert.equal(cibleB.recommandation, 'Base très solide');
});

test('RaceAnalyzer.calculerValeurCouples: associe la base a chaque autre cheval du groupe (hors elle-meme), valeur = (cote base x cote autre) / 2', () => {
  const chevaux = [
    { entry: { numero: 1 }, cotePourAffichage: 2.8 },
    { entry: { numero: 2 }, cotePourAffichage: 9.0 },
    { entry: { numero: 3 }, cotePourAffichage: 25.0 }
  ];
  // Trio inclut la base elle-meme (comportement reel de app.js : basesNums
  // est inclus dans trioNums) : la base ne doit jamais etre associee a
  // elle-meme.
  const couples = RaceAnalyzer.calculerValeurCouples(chevaux, [1], [1, 2, 3]);

  assert.equal(couples.length, 2);
  assert.equal(couples[0].baseNumero, 1);
  assert.equal(couples[0].autreNumero, 2);
  approx(couples[0].valeur, 12.6, 0.01);
  assert.equal(couples[1].baseNumero, 1);
  assert.equal(couples[1].autreNumero, 3);
  approx(couples[1].valeur, 35, 0.01);
});

test('RaceAnalyzer.calculerValeurCouples: ne compte jamais deux fois la meme paire (deux bases confirmees associees l\'une a l\'autre)', () => {
  const chevaux = [
    { entry: { numero: 1 }, cotePourAffichage: 2.8 },
    { entry: { numero: 2 }, cotePourAffichage: 9.0 },
    { entry: { numero: 3 }, cotePourAffichage: 25.0 }
  ];
  // 1 et 2 sont toutes les deux des bases confirmees et toutes les deux
  // dans le Trio : la paire 1-2 ne doit apparaitre qu'une seule fois.
  const couples = RaceAnalyzer.calculerValeurCouples(chevaux, [1, 2], [1, 2, 3]);

  assert.equal(couples.length, 3);
  const cles = couples.map((c) => [c.baseNumero, c.autreNumero].sort((a, b) => a - b).join('-'));
  assert.deepEqual(new Set(cles).size, 3, 'aucune paire ne doit etre dupliquee');
  assert.ok(cles.includes('1-2'));
  assert.ok(cles.includes('1-3'));
  assert.ok(cles.includes('2-3'));
});

test('RaceAnalyzer.calculerValeurCouples: ignore les chevaux (base ou autre) dont la cote est inconnue, sans lever d\'exception', () => {
  const chevaux = [
    { entry: { numero: 1 }, cotePourAffichage: null },
    { entry: { numero: 2 }, cotePourAffichage: 9.0 }
    // numero 3 absent du tableau (cote totalement inconnue).
  ];
  const couples = RaceAnalyzer.calculerValeurCouples(chevaux, [1, 2], [1, 2, 3]);
  // base 1 : cote inconnue -> aucune paire generee pour cette base.
  // base 2 : autre=1 (cote inconnue) et autre=3 (absent) -> aucune paire retenue.
  assert.deepEqual(couples, []);
});

test('RaceAnalyzer.calculerValeurCouples: renvoie un tableau vide si aucune base confirmee', () => {
  const chevaux = [
    { entry: { numero: 1 }, cotePourAffichage: 2.8 },
    { entry: { numero: 2 }, cotePourAffichage: 9.0 }
  ];
  assert.deepEqual(RaceAnalyzer.calculerValeurCouples(chevaux, [], [1, 2]), []);
});

// -------------------------------------------------------------------
// Indice de convergence
// -------------------------------------------------------------------
test('RaceAnalyzer.calculerIndiceConvergence: cumule les 5 signaux (cote resserree, forme/aptitude/conditions au-dessus de la moyenne, bonus rubriques positif) et trie par nbSignaux decroissant', () => {
  const chevaux = [
    // Tendance cote : (5.0-4.0)/5.0 = 0.20 > 0.10 -> resserree. Tous les
    // scores au-dessus de la moyenne du champ (50) + bonus rubriques > 0.
    { entry: { numero: 1, nom: 'ALPHA', cote8h: 5.0, coteDirecte: 4.0 }, scoreForme: 80, scoreAptitude: 80, scoreConditions: 80, scoreRubriques: 6 },
    // Cote stable (tendance 0), scores tous a la moyenne exacte (donc pas
    // strictement au-dessus), aucun bonus rubriques.
    { entry: { numero: 2, nom: 'BETA', cote8h: 4.0, coteDirecte: 4.0 }, scoreForme: 50, scoreAptitude: 50, scoreConditions: 50, scoreRubriques: 0 },
    // Cote qui se degrade (drift), scores sous la moyenne.
    { entry: { numero: 3, nom: 'GAMMA', cote8h: 10.0, coteDirecte: 12.0 }, scoreForme: 20, scoreAptitude: 20, scoreConditions: 20, scoreRubriques: 0 }
  ];

  const resultat = RaceAnalyzer.calculerIndiceConvergence(chevaux);

  assert.equal(resultat.length, 3);
  // ALPHA cumule les 5 signaux et doit arriver en tete.
  assert.equal(resultat[0].numero, 1);
  assert.equal(resultat[0].nom, 'ALPHA');
  assert.equal(resultat[0].nbSignaux, 5);
  assert.deepEqual(resultat[0].signaux, {
    coteResserree: true, formeAuDessus: true, aptitudeAuDessus: true, conditionsAuDessus: true, bonusRubriquesPositif: true
  });
  // BETA (exactement a la moyenne, "au-dessus" est une comparaison stricte)
  // et GAMMA (sous la moyenne, cote qui se degrade) n'ont aucun signal actif.
  const parNumero = Object.fromEntries(resultat.map((r) => [r.numero, r.nbSignaux]));
  assert.equal(parNumero[2], 0);
  assert.equal(parNumero[3], 0);
});

test('RaceAnalyzer.calculerIndiceConvergence: seuil du resserrement de cote est strictement > 10% (10% pile ne compte pas)', () => {
  const base = { scoreForme: 50, scoreAptitude: 50, scoreConditions: 50, scoreRubriques: 0 };
  const chevaux = [
    // (10-9)/10 = 0.10 pile -> ne doit PAS etre considere comme resserree.
    { entry: { numero: 1, nom: 'PILE', cote8h: 10.0, coteDirecte: 9.0 }, ...base },
    // (10-8.9)/10 = 0.11 -> resserree.
    { entry: { numero: 2, nom: 'JUSTE_AU_DESSUS', cote8h: 10.0, coteDirecte: 8.9 }, ...base }
  ];
  const resultat = RaceAnalyzer.calculerIndiceConvergence(chevaux);
  const parNumero = Object.fromEntries(resultat.map((r) => [r.numero, r.signaux.coteResserree]));
  assert.equal(parNumero[1], false);
  assert.equal(parNumero[2], true);
});

test('RaceAnalyzer.calculerIndiceConvergence: tolere les cotes manquantes/nulles sans lever d\'exception, et renvoie [] pour un champ vide', () => {
  const chevaux = [
    { entry: { numero: 1, nom: 'SANS_COTE', cote8h: 0, coteDirecte: 0 }, scoreForme: 50, scoreAptitude: 50, scoreConditions: 50, scoreRubriques: 0 },
    { entry: { numero: 2, nom: 'COTE_DIRECTE_SEULE', cote8h: 0, coteDirecte: 5.0 }, scoreForme: 50, scoreAptitude: 50, scoreConditions: 50, scoreRubriques: 0 }
  ];
  const resultat = RaceAnalyzer.calculerIndiceConvergence(chevaux);
  assert.equal(resultat.length, 2);
  assert.equal(resultat.every((r) => r.signaux.coteResserree === false), true);

  assert.deepEqual(RaceAnalyzer.calculerIndiceConvergence([]), []);
});

// -------------------------------------------------------------------
// CSVImporter
// -------------------------------------------------------------------
test('parseOrdreArrivee', () => {
  assert.deepEqual(CSVImporter.parseOrdreArrivee('10-15-3-7'), [10, 15, 3, 7]);
  assert.deepEqual(CSVImporter.parseOrdreArrivee(''), []);
  assert.deepEqual(CSVImporter.parseOrdreArrivee('Non disponible'), []);
});

test('parseReunionComplete regroupe par course', () => {
  const headers = 'Numero;Nom;VH ou Ferrage;SA;DP;Gains;DrivJock;RJ;Entraineur;RE;ED;CJE;JA;Musique;P1;P2;P3;P4;P5;P6;P7;P8;P9;P10;C8;CD;CZ;MP;PtH;MN;RC;RX;MX;CX;IdC;CFP;OR;IX;IF;CR;AR;PtR;PC;MA;TG;SC;R10;Record;Nom Pere;Nom Mere;Valeur Pere;Valeur Mere;Score Geniteur Pere;Score Geniteur Mere;Top Geniteur;Cla Score Pedigree;Cote Calc;Reunion;Course;LieuCourse;Heure;Discipline;Autostart;TypeCourse;Allocation;Distance;Partants;NonPartants;Age;Arrivee;RCM;IdD;IdP;ScFi;Tranche prevue;MMX';
  const row1 = '1;LUPIN;D4;M5;;192070;C.MARTENS;46;V.MARTENS;54;100;21;46;6a1a4a;;;;;;;;;;;3,5;2,8;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;3,2;1;1;ENGHIEN;10h59;ATTELE;;E;40000;2700;9;0;6;1-2-3;;;;;;';
  const row2 = '2;KANO;D4;M6;;227470;C.MEGISSIER;41;C.MEGISSIER;39;80;25,8;16;3a1a2a;;;;;;;;;;;9;9,5;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;8,8;1;1;ENGHIEN;10h59;ATTELE;;E;40000;2700;9;0;6;1-2-3;;;;;;';
  const csv = [headers, row1, row2].join('\n');

  const races = CSVImporter.parseReunionComplete(csv);
  assert.equal(races.length, 1);
  assert.equal(races[0].horses.length, 2);
  assert.equal(races[0].context.lieu, 'ENGHIEN');
  assert.equal(races[0].context.nbPartants, 9);
  assert.equal(races[0].horses[0].nom, 'LUPIN');
  approx(races[0].horses[0].coteDirecte, 2.8, 0.001);
  assert.deepEqual(CSVImporter.parseOrdreArrivee(races[0].arriveeBrute), [1, 2, 3]);
});

test('parseReunionComplete: rubriques Module 2 (null pour champ vide, valeur sinon)', () => {
  const headers = 'Numero;Nom;VH ou Ferrage;SA;DP;Gains;DrivJock;RJ;Entraineur;RE;ED;CJE;JA;Musique;P1;P2;P3;P4;P5;P6;P7;P8;P9;P10;C8;CD;CZ;MP;PtH;MN;RC;RX;MX;CX;IdC;CFP;OR;IX;IF;CR;AR;PtR;PC;MA;TG;SC;R10;Record;Nom Pere;Nom Mere;Valeur Pere;Valeur Mere;Score Geniteur Pere;Score Geniteur Mere;Top Geniteur;Cla Score Pedigree;Cote Calc;Reunion;Course;LieuCourse;Heure;Discipline;Autostart;TypeCourse;Allocation;Distance;Partants;NonPartants;Age;Arrivee;RCM;IdD;IdP;ScFi;Tranche prevue;MMX';
  // RJ=col8, RE=col10, ED=col11, MP=col28, SC=col46, P1=col15 (colonnes verifiees par decoupage programmatique du CSV pour garantir l'alignement exact des 76 colonnes).
  const row1 = '1;LUPIN;D4;M5;;192070;C.MARTENS;46;V.MARTENS;54;100;21;46;6a1a4a;2;;;;;;;;;;3,5;2,8;;10;;;;;;;;;;;;;;;;;;5;;;;;;;;;;;3,2;1;1;ENGHIEN;10h59;ATTELE;;E;40000;2700;9;0;6;1-2-3;;;;;;';
  const row2 = '2;KANO;D4;M6;;227470;C.MEGISSIER;41;C.MEGISSIER;39;80;25,8;16;3a1a2a;;;;;;;;;;;9;9,5;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;8,8;1;1;ENGHIEN;10h59;ATTELE;;E;40000;2700;9;0;6;1-2-3;;;;;;';
  const csv = [headers, row1, row2].join('\n');

  const races = CSVImporter.parseReunionComplete(csv);
  const lupin = races[0].horses.find((h) => h.nom === 'LUPIN');
  const kano = races[0].horses.find((h) => h.nom === 'KANO');

  // LUPIN a bien RJ=46, RE=54, ED=100, MP(idx3)=10, SC=5, P1='2'.
  assert.equal(lupin.rubriques[0], 46);
  assert.equal(lupin.rubriques[1], 54);
  assert.equal(lupin.rubriques[2], 100);
  assert.equal(lupin.rubriques[3], 10);
  assert.equal(lupin.sc, 5);
  assert.equal(lupin.p1, '2');

  // KANO a bien RJ/RE/ED renseignes (41/39/80, colonnes reussite jockey/entraineur
  // deja utilisees ailleurs) mais aucun des autres champs Module 2 (MP et suivants) ->
  // ceux-ci doivent etre `null` (pas 0), pour que le classement Top-N le repousse en
  // fin de liste (IsNumeric() cote VBA), contrairement a un vrai 0.
  assert.equal(kano.rubriques[0], 41);
  assert.equal(kano.rubriques[1], 39);
  assert.equal(kano.rubriques[2], 80);
  assert.ok(kano.rubriques.slice(3).every((v) => v === null));
  assert.equal(kano.sc, 0);
});

test('parseReunionComplete: variante "journee" a 77 colonnes (colonne "Pedigree Faible" en plus) decale correctement les champs a partir de "Cote Calc"', () => {
  const header76 = 'Numero;Nom;VH ou Ferrage;SA;DP;Gains;DrivJock;RJ;Entraineur;RE;ED;CJE;JA;Musique;P1;P2;P3;P4;P5;P6;P7;P8;P9;P10;C8;CD;CZ;MP;PtH;MN;RC;RX;MX;CX;IdC;CFP;OR;IX;IF;CR;AR;PtR;PC;MA;TG;SC;R10;Record;Nom Pere;Nom Mere;Valeur Pere;Valeur Mere;Score Geniteur Pere;Score Geniteur Mere;Top Geniteur;Cla Score Pedigree;Cote Calc;Reunion;Course;LieuCourse;Heure;Discipline;Autostart;TypeCourse;Allocation;Distance;Partants;NonPartants;Age;Arrivee;RCM;IdD;IdP;ScFi;Tranche prevue;MMX'.split(';');
  assert.equal(header76.length, 76);
  // "Pedigree Faible" est inseree juste apres "Cla Score Pedigree" (colonne
  // 56, index 55) et juste avant "Cote Calc" (colonne 57 en format standard).
  const header77 = [...header76.slice(0, 56), 'Pedigree Faible', ...header76.slice(56)];
  assert.equal(header77.length, 77);
  assert.equal(header77[56], 'Pedigree Faible');
  assert.equal(header77[57], 'Cote Calc');

  const row76 = '1;LUPIN;D4;M5;;192070;C.MARTENS;46;V.MARTENS;54;100;21;46;6a1a4a;;;;;;;;;;;3,5;2,8;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;3,2;1;1;ENGHIEN;10h59;ATTELE;;E;40000;2700;9;0;6;1-2-3;;;;;;'.split(';');
  assert.equal(row76.length, 76);
  const row77 = [...row76.slice(0, 56), 'VALEUR_PEDIGREE_FAIBLE', ...row76.slice(56)];
  assert.equal(row77.length, 77);

  const csv = [header77.join(';'), row77.join(';')].join('\n');
  const races = CSVImporter.parseReunionComplete(csv);

  assert.equal(races.length, 1);
  assert.equal(races[0].context.numeroReunion, 1);
  assert.equal(races[0].context.numeroCourse, 1);
  assert.equal(races[0].context.lieu, 'ENGHIEN');
  assert.equal(races[0].context.heureDepart, '10h59');
  assert.equal(races[0].context.disciplineBrute, 'ATTELE');
  assert.equal(races[0].context.allocation, 40000);
  assert.equal(races[0].context.distanceJour, 2700);
  assert.equal(races[0].context.nbPartants, 9);
  assert.deepEqual(CSVImporter.parseOrdreArrivee(races[0].arriveeBrute), [1, 2, 3]);
  assert.equal(races[0].horses[0].nom, 'LUPIN');
  approx(races[0].horses[0].coteDirecte, 2.8, 0.001);
  approx(races[0].horses[0].cotePredictive, 3.2, 0.001);
});

test('parseReunionComplete: un fichier "journee" multi-reunions ne fusionne pas deux courses de meme numero mais de reunions differentes', () => {
  const header = 'Numero;Nom;VH ou Ferrage;SA;DP;Gains;DrivJock;RJ;Entraineur;RE;ED;CJE;JA;Musique;P1;P2;P3;P4;P5;P6;P7;P8;P9;P10;C8;CD;CZ;MP;PtH;MN;RC;RX;MX;CX;IdC;CFP;OR;IX;IF;CR;AR;PtR;PC;MA;TG;SC;R10;Record;Nom Pere;Nom Mere;Valeur Pere;Valeur Mere;Score Geniteur Pere;Score Geniteur Mere;Top Geniteur;Cla Score Pedigree;Cote Calc;Reunion;Course;LieuCourse;Heure;Discipline;Autostart;TypeCourse;Allocation;Distance;Partants;NonPartants;Age;Arrivee;RCM;IdD;IdP;ScFi;Tranche prevue;MMX';
  const rowReunion1Champs = '1;LUPIN;D4;M5;;192070;C.MARTENS;46;V.MARTENS;54;100;21;46;6a1a4a;;;;;;;;;;;3,5;2,8;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;3,2;1;1;ENGHIEN;10h59;ATTELE;;E;40000;2700;9;0;6;1-2-3;;;;;;'.split(';');
  assert.equal(rowReunion1Champs.length, 76);

  // Reunion 2 : meme structure, mais numero de reunion (colonne 58, index 57)
  // et lieu (colonne 60, index 59) differents, avec le MEME numero de
  // course (colonne 59, index 58 = "1") que la reunion 1 - exactement le
  // cas qui, sans regroupement par (reunion, course), fusionnerait a tort
  // les deux courses et dupliquerait les numeros de chevaux.
  const rowReunion2Champs = [...rowReunion1Champs];
  rowReunion2Champs[1] = 'KANO';
  rowReunion2Champs[57] = '2';
  rowReunion2Champs[59] = 'VINCENNES';
  assert.equal(rowReunion2Champs.length, 76);

  const csv = [header, rowReunion1Champs.join(';'), rowReunion2Champs.join(';')].join('\n');
  const races = CSVImporter.parseReunionComplete(csv);

  assert.equal(races.length, 2, 'les deux courses n°1 de reunions differentes doivent rester separees, pas fusionnees');
  const race1 = races.find((r) => r.context.numeroReunion === 1);
  const race2 = races.find((r) => r.context.numeroReunion === 2);
  assert.ok(race1 && race2);
  assert.equal(race1.context.numeroCourse, 1);
  assert.equal(race2.context.numeroCourse, 1);
  assert.equal(race1.context.lieu, 'ENGHIEN');
  assert.equal(race2.context.lieu, 'VINCENNES');
  assert.equal(race1.horses.length, 1);
  assert.equal(race2.horses.length, 1);
  assert.equal(race1.horses[0].nom, 'LUPIN');
  assert.equal(race2.horses[0].nom, 'KANO');
});

// -------------------------------------------------------------------
// rubriques.js (config "Module 2" par discipline)
// -------------------------------------------------------------------
test('selRubsPourDiscipline / associationsPourDiscipline: 5 rubriques + 3 associations valides par discipline', () => {
  for (const disc of ['ATTELE', 'MONTE', 'PLAT', 'HAIES', 'STEEPLE']) {
    const sel = selRubsPourDiscipline(disc);
    assert.equal(sel.length, 5, `sel rubriques ${disc}`);
    sel.forEach((idx) => assert.ok(idx >= 0 && idx < RUBRIQUES.length, `index rubrique valide (${disc})`));

    const assoc = associationsPourDiscipline(disc);
    assert.equal(assoc.length, 3, `associations ${disc}`);
    assoc.forEach(([a, b]) => {
      assert.ok(a >= 0 && a < RUBRIQUES.length);
      assert.ok(b >= 0 && b < RUBRIQUES.length);
    });
  }
});

test('selRubsPourDiscipline: discipline inconnue -> repli par defaut', () => {
  assert.deepEqual(selRubsPourDiscipline('INCONNUE'), [0, 1, 2, 3, 4]);
  assert.deepEqual(associationsPourDiscipline('INCONNUE'), [[0, 1], [2, 3], [4, 5]]);
});

// -------------------------------------------------------------------
// basesEtDangers.js (Module 2 : Base(s) possible(s) / Danger(s))
// -------------------------------------------------------------------
function makeChevalATTELE({ numero, rubriquesVal, sc, cote8h, cotePredictive, p1, p2, recommandation, value, probTop3, probTop2, scoreGlobal, cotePourAffichage }) {
  // Discipline ATTELE : SEL_RUBS=[17,5,16,15,12] (R10,MN,TG,AR,OR), ASSOCIATIONS=[[16,17],[5,17],[15,17]].
  const rubriques = new Array(18).fill(null);
  if (rubriquesVal != null) {
    for (const idx of [17, 5, 16, 15, 12]) rubriques[idx] = rubriquesVal;
  }
  return {
    entry: { numero, rubriques, sc, cote8h, cotePredictive, p1, p2 },
    recommandation, value, probTop3, probTop2, scoreGlobal, cotePourAffichage
  };
}

test('calculerBasesEtDangers: base confirmee techniquement, base non confirmee, et danger', () => {
  const chevaux = [
    makeChevalATTELE({ numero: 1, rubriquesVal: 10, sc: 5, cote8h: 3, cotePredictive: 3.5, p1: '2', p2: '', recommandation: 'Base très solide', value: 5, probTop3: 70, cotePourAffichage: 3 }),
    makeChevalATTELE({ numero: 2, rubriquesVal: 8, sc: 5, cote8h: 4, cotePredictive: 4, p1: '3', p2: '', recommandation: 'Base solide', value: 2, probTop3: 60, cotePourAffichage: 4 }),
    makeChevalATTELE({ numero: 3, rubriquesVal: 6, sc: 0, cote8h: 5, cotePredictive: 5, p1: '1', p2: '', recommandation: 'Base solide', value: -5, probTop3: 50, cotePourAffichage: 5 }),
    makeChevalATTELE({ numero: 4, rubriquesVal: null, sc: 5, cote8h: 20, cotePredictive: 22, p1: '2', p2: '', recommandation: 'Favori', value: -25, probTop3: 20, cotePourAffichage: 15 })
  ];

  const result = calculerBasesEtDangers(chevaux, 'ATTELE');

  // Un seul cheval "Base très solide" -> seul lui devient base (les "Base solide" sont ignores tant qu'il y a une "tres solide").
  assert.equal(result.bases.length, 1);
  assert.equal(result.bases[0].numero, 1);
  assert.equal(result.bases[0].isTresSolide, true);
  assert.equal(result.bases[0].isConfirme, true);
  assert.equal(result.bases[0].niveau, 'confirmee_forte');

  const { label, tag } = libelleNiveauBase(result.bases[0].niveau);
  assert.equal(tag, 'danger-strong');
  assert.ok(label.includes('confirmée'));

  // Meilleur cheval (ProbTop3 le plus haut parmi les bases/Base solide) = cheval 1.
  assert.equal(result.meilleur.numero, 1);

  // Cheval 4 : Value < -10 et cote jouable (<=50), non retenu comme base -> danger.
  assert.deepEqual(result.danger, [4]);
});

test('calculerBasesEtDangers: aucune base tres solide -> repli sur les bases solides', () => {
  const chevaux = [
    makeChevalATTELE({ numero: 1, rubriquesVal: 10, sc: 5, cote8h: 3, cotePredictive: 3.5, p1: '2', p2: '', recommandation: 'Base solide', value: 5, probTop3: 70, cotePourAffichage: 3 }),
    makeChevalATTELE({ numero: 2, rubriquesVal: 8, sc: 5, cote8h: 4, cotePredictive: 4, p1: '3', p2: '', recommandation: 'Favori', value: -2, probTop3: 60, cotePourAffichage: 4 })
  ];
  const result = calculerBasesEtDangers(chevaux, 'ATTELE');
  assert.equal(result.bases.length, 1);
  assert.equal(result.bases[0].numero, 1);
  assert.equal(result.bases[0].isTresSolide, false);
});

test('calculerBasesEtDangers: aucun danger si aucune Value tres negative avec cote jouable', () => {
  const chevaux = [
    makeChevalATTELE({ numero: 1, rubriquesVal: 10, sc: 5, cote8h: 3, cotePredictive: 3.5, p1: '2', p2: '', recommandation: 'Base très solide', value: 5, probTop3: 70, cotePourAffichage: 3 }),
    makeChevalATTELE({ numero: 2, rubriquesVal: 8, sc: 5, cote8h: 4, cotePredictive: 4, p1: '3', p2: '', recommandation: 'Favori', value: -25, probTop3: 60, cotePourAffichage: 80 })
  ];
  const result = calculerBasesEtDangers(chevaux, 'ATTELE');
  // cheval 2 a Value<-10 mais cote (80) > 50 -> pas jouable -> pas de danger.
  assert.deepEqual(result.danger, []);
});

test('calculerBasesEtDangers v2 : une Recommandation Base tres solide/solide n\'est retenue que si cote predictive ET cote C8 sont toutes deux <= 12 (cotesOK)', () => {
  const chevaux = [
    // Base très solide mais cote8h (C8) > 12 -> exclue malgre la Recommandation du Module 1.
    makeChevalATTELE({ numero: 1, rubriquesVal: 10, sc: 5, cote8h: 15, cotePredictive: 3.5, p1: '2', p2: '', recommandation: 'Base très solide', value: 5, probTop3: 80, cotePourAffichage: 15 }),
    // Base très solide mais cotePredictive (CM) > 12 -> exclue.
    makeChevalATTELE({ numero: 2, rubriquesVal: 10, sc: 5, cote8h: 3, cotePredictive: 13, p1: '2', p2: '', recommandation: 'Base très solide', value: 5, probTop3: 75, cotePourAffichage: 3 }),
    // Base solide avec les deux cotes <= 12 -> seule base retenue au final (repli sur "Base solide").
    makeChevalATTELE({ numero: 3, rubriquesVal: 8, sc: 5, cote8h: 4, cotePredictive: 4, p1: '3', p2: '', recommandation: 'Base solide', value: 2, probTop3: 55, cotePourAffichage: 4 })
  ];
  const result = calculerBasesEtDangers(chevaux, 'ATTELE');
  assert.equal(result.bases.length, 1);
  assert.equal(result.bases[0].numero, 3);
  assert.equal(result.meilleur.numero, 3);
});

test('calculerBasesEtDangers : baseConfirmeeSansCote reste vrai meme si la seule base confirmee techniquement a une cote predictive > 12 (filtree hors de `bases` par cotesBaseOK)', () => {
  const chevaux = [
    // Base très solide, confirmee techniquement : sc>0, cote8h=5 (<=12) et
    // cotePredictive=30 (>12, mais Y/BE=5/30=0.167<0.5 -> pas rejete par
    // estCandidatTechnique). En revanche cotesBaseOK (v2, exige les DEUX
    // cotes <=12) exclut ce cheval de `bases`/`isConfirme`.
    makeChevalATTELE({ numero: 1, rubriquesVal: 10, sc: 5, cote8h: 5, cotePredictive: 30, p1: '2', p2: '', recommandation: 'Base très solide', value: 5, probTop3: 80, cotePourAffichage: 5 }),
    makeChevalATTELE({ numero: 2, rubriquesVal: 1, sc: 0, cote8h: 20, cotePredictive: 20, p1: '', p2: '', recommandation: 'Favori', value: -5, probTop3: 20, cotePourAffichage: 20 })
  ];
  const result = calculerBasesEtDangers(chevaux, 'ATTELE');
  // Confirme que le cheval 1 est bien exclu de `bases` (cotePredictive=30 > 12).
  assert.equal(result.bases.length, 0);
  // Mais bien confirme techniquement (Module 2) independamment de la cote.
  assert.equal(result.baseConfirmeeSansCote, true);
});

test('calculerBasesEtDangers : baseConfirmeeSansCote est faux si aucune recommandation Base solide/tres solide n\'est confirmee techniquement', () => {
  const chevaux = [
    makeChevalATTELE({ numero: 1, rubriquesVal: 1, sc: 1, cote8h: 3, cotePredictive: 3, p1: '', p2: '', recommandation: 'Base très solide', value: 5, probTop3: 80, cotePourAffichage: 3 }),
    makeChevalATTELE({ numero: 2, rubriquesVal: 1, sc: 1, cote8h: 20, cotePredictive: 20, p1: '', p2: '', recommandation: 'Favori', value: -5, probTop3: 20, cotePourAffichage: 20 })
  ];
  const result = calculerBasesEtDangers(chevaux, 'ATTELE');
  assert.equal(result.baseConfirmeeSansCote, false);
});

test('calculerBasesEtDangers : dangerSansCote compte les Value < -10% sans filtre de cote jouable (<=50)', () => {
  const chevaux = [
    makeChevalATTELE({ numero: 1, rubriquesVal: 10, sc: 5, cote8h: 3, cotePredictive: 3.5, p1: '2', p2: '', recommandation: 'Base très solide', value: 5, probTop3: 70, cotePourAffichage: 3 }),
    makeChevalATTELE({ numero: 2, rubriquesVal: 8, sc: 5, cote8h: 4, cotePredictive: 4, p1: '3', p2: '', recommandation: 'Favori', value: -25, probTop3: 60, cotePourAffichage: 80 })
  ];
  const result = calculerBasesEtDangers(chevaux, 'ATTELE');
  // cheval 2 : Value<-10 mais cote (80) > 50 -> absent de `danger` (jouable
  // uniquement), mais present dans dangerSansCote (pas de filtre de cote).
  assert.deepEqual(result.danger, []);
  assert.deepEqual(result.dangerSansCote, [2]);
});

test('calculerBasesEtDangers : top2Fiable est vrai si l\'ecart de Score Global de la base sur son 2e meilleur rival est >= 15 points', () => {
  const chevaux = [
    // Base retenue (cote OK), Score Global tres largement devant les autres.
    makeChevalATTELE({ numero: 1, rubriquesVal: 10, sc: 5, cote8h: 3, cotePredictive: 3.5, p1: '2', p2: '', recommandation: 'Base très solide', value: 5, probTop3: 80, probTop2: 30, scoreGlobal: 95, cotePourAffichage: 3 }),
    // Meilleur rival (hors la base) : 80.
    makeChevalATTELE({ numero: 2, rubriquesVal: 1, sc: 1, cote8h: 20, cotePredictive: 20, p1: '', p2: '', recommandation: 'Favori', value: -5, probTop3: 22, probTop2: 18, scoreGlobal: 80, cotePourAffichage: 20 }),
    // 2e meilleur rival (hors la base) : 75 -> ecart = 95-75 = 20 >= 15.
    makeChevalATTELE({ numero: 3, rubriquesVal: 1, sc: 1, cote8h: 20, cotePredictive: 20, p1: '', p2: '', recommandation: 'Favori', value: -5, probTop3: 18, probTop2: 14, scoreGlobal: 75, cotePourAffichage: 20 }),
    makeChevalATTELE({ numero: 4, rubriquesVal: 1, sc: 1, cote8h: 20, cotePredictive: 20, p1: '', p2: '', recommandation: 'Favori', value: -5, probTop3: 10, probTop2: 8, scoreGlobal: 50, cotePourAffichage: 20 })
  ];
  const result = calculerBasesEtDangers(chevaux, 'ATTELE');
  assert.ok(result.meilleur);
  assert.equal(result.meilleur.numero, 1);
  assert.equal(result.meilleur.probTop2, 30);
  assert.equal(result.meilleur.ecartScoreVs2emeRival, 20);
  assert.equal(result.top2Fiable, true);
});

test('calculerBasesEtDangers : top2Fiable est faux si l\'ecart de Score Global de la base sur son 2e meilleur rival est < 15 points, meme avec un Score Global eleve', () => {
  const chevaux = [
    // Base retenue, Score Global eleve mais deux rivaux tres proches derriere.
    makeChevalATTELE({ numero: 1, rubriquesVal: 10, sc: 5, cote8h: 3, cotePredictive: 3.5, p1: '2', p2: '', recommandation: 'Base très solide', value: 5, probTop3: 80, probTop2: 25, scoreGlobal: 90, cotePourAffichage: 3 }),
    // Meilleur rival : 88.
    makeChevalATTELE({ numero: 2, rubriquesVal: 1, sc: 1, cote8h: 20, cotePredictive: 20, p1: '', p2: '', recommandation: 'Favori', value: -5, probTop3: 22, probTop2: 24, scoreGlobal: 88, cotePourAffichage: 20 }),
    // 2e meilleur rival : 76 -> ecart = 90-76 = 14 < 15.
    makeChevalATTELE({ numero: 3, rubriquesVal: 1, sc: 1, cote8h: 20, cotePredictive: 20, p1: '', p2: '', recommandation: 'Favori', value: -5, probTop3: 18, probTop2: 20, scoreGlobal: 76, cotePourAffichage: 20 }),
    makeChevalATTELE({ numero: 4, rubriquesVal: 1, sc: 1, cote8h: 20, cotePredictive: 20, p1: '', p2: '', recommandation: 'Favori', value: -5, probTop3: 10, probTop2: 8, scoreGlobal: 50, cotePourAffichage: 20 })
  ];
  const result = calculerBasesEtDangers(chevaux, 'ATTELE');
  assert.ok(result.meilleur);
  assert.equal(result.meilleur.ecartScoreVs2emeRival, 14);
  assert.equal(result.top2Fiable, false);
});

test('calculerBasesEtDangers : top2Fiable est faux (sans exception) quand aucune base n\'est retenue', () => {
  const chevaux = [
    makeChevalATTELE({ numero: 1, rubriquesVal: 1, sc: 1, cote8h: 20, cotePredictive: 20, p1: '', p2: '', recommandation: 'Favori', value: -5, probTop3: 20, probTop2: 15, scoreGlobal: 70, cotePourAffichage: 20 })
  ];
  const result = calculerBasesEtDangers(chevaux, 'ATTELE');
  assert.equal(result.meilleur, null);
  assert.equal(result.top2Fiable, false);
});

// -------------------------------------------------------------------
// scoreRubriques.js (Module 1 v6.2 : bonus rubriques ajoute au Score Global,
// CalculerScoreRubriquesCourse - meme config Top-N/discipline que le Module 2
// mais bonus non pondere ajoute directement, independant de basesEtDangers.js)
// -------------------------------------------------------------------
function makeChevalRubriques(numero, { r10, mn, tg, ar, or_ } = {}) {
  // Discipline ATTELE : SEL_RUBS=[17,5,16,15,12] = R10,MN,TG,AR,OR.
  const rubriques = new Array(18).fill(null);
  if (r10 !== undefined) rubriques[17] = r10;
  if (mn !== undefined) rubriques[5] = mn;
  if (tg !== undefined) rubriques[16] = tg;
  if (ar !== undefined) rubriques[15] = ar;
  if (or_ !== undefined) rubriques[12] = or_;
  return { entry: { numero, rubriques } };
}

test('calculerBonusRubriques: bonus proportionnel au nombre de rubriques (parmi les 5 de la discipline) ou le cheval est dans le Top N', () => {
  const chevaux = [
    makeChevalRubriques(1, { r10: 10, mn: 1, tg: 1, ar: null, or_: 5 }),
    makeChevalRubriques(2, { r10: 8, mn: 10, tg: 1, ar: null, or_: 5 }),
    makeChevalRubriques(3, { r10: 1, mn: 8, tg: 10, ar: null, or_: 5 })
  ];
  const bonus = calculerBonusRubriques(chevaux, 'ATTELE', 2, 3);
  // R10 top2=[1,2] ; MN top2=[2,3] ; TG top2=[3,1] (tri stable, egalite 1/1 -> ordre d'entree) ;
  // AR (tout null) top2=[1,2] (ordre d'entree preserve) ; OR (tout egal=5) top2=[1,2] (idem).
  assert.equal(bonus.get(1), 12); // R10, TG, AR, OR = 4 x 3
  assert.equal(bonus.get(2), 12); // R10, MN, AR, OR = 4 x 3
  assert.equal(bonus.get(3), 6);  // MN, TG = 2 x 3
});

test('calculerBonusRubriques: nbTop >= nombre de chevaux -> tous recoivent le bonus maximal (5 rubriques x bonusParRubrique)', () => {
  const chevaux = [
    makeChevalRubriques(1, {}),
    makeChevalRubriques(2, {}),
    makeChevalRubriques(3, {})
  ];
  const bonus = calculerBonusRubriques(chevaux, 'ATTELE'); // defaut : nbTop=4, bonusParRubrique=3
  assert.equal(bonus.get(1), 15);
  assert.equal(bonus.get(2), 15);
  assert.equal(bonus.get(3), 15);
});

// -------------------------------------------------------------------
// cotesCibles.js (Cote(s) cible(s) la plus proche : TrouverCotesCibles / DeuxPlusProchesdirect)
// -------------------------------------------------------------------
function makeChevalCote(numero, cotePourAffichage) {
  return { entry: { numero }, cotePourAffichage };
}

test('calculerCotesCibles: 4 cibles (NP/4, NP/2, NP, NP x2) et le cheval le plus proche de chacune', () => {
  // NP=12 -> cibles = 3, 6, 12, 24.
  const chevaux = [
    makeChevalCote(1, 2.9),   // tres proche de NP/4=3
    makeChevalCote(2, 6.2),   // tres proche de NP/2=6
    makeChevalCote(3, 11.5),  // tres proche de NP=12
    makeChevalCote(4, 25),    // tres proche de NP x2=24
    makeChevalCote(5, 50)     // hors tolerance pour toutes les cibles
  ];

  const result = calculerCotesCibles(chevaux, 12);
  assert.equal(result.length, 4);

  const parLabel = Object.fromEntries(result.map((r) => [r.label, r]));
  assert.equal(parLabel['NP/4'].cible, 3);
  assert.equal(parLabel['NP/4'].horse.numero, 1);
  assert.equal(parLabel['NP/2'].cible, 6);
  assert.equal(parLabel['NP/2'].horse.numero, 2);
  assert.equal(parLabel['NP'].cible, 12);
  assert.equal(parLabel['NP'].horse.numero, 3);
  assert.equal(parLabel['NP x2'].cible, 24);
  assert.equal(parLabel['NP x2'].horse.numero, 4);
});

test('calculerCotesCibles: aucun cheval dans la tolerance -> horse null', () => {
  // NP=8 -> cible NP/4=2 ; tolerance +-100% => bornes [0,4]. Aucun cheval avec cote <=4 ici.
  const chevaux = [makeChevalCote(1, 50), makeChevalCote(2, 80)];
  const result = calculerCotesCibles(chevaux, 8);
  const np4 = result.find((r) => r.label === 'NP/4');
  assert.equal(np4.horse, null);
});

test('calculerCotesCibles: nbPartants invalide -> tableau vide', () => {
  assert.deepEqual(calculerCotesCibles([{ entry: { numero: 1 }, cotePourAffichage: 5 }], 0), []);
  assert.deepEqual(calculerCotesCibles([{ entry: { numero: 1 }, cotePourAffichage: 5 }], null), []);
});

// -------------------------------------------------------------------
// zeturfParser.js (mise a jour des cotes en direct par copier-coller depuis Zeturf, PMU, ou tout site)
// -------------------------------------------------------------------
test('parseCotesZeturf: format simple "numero cote" par ligne', () => {
  const texte = '1  3,5\n2  9.2\n3  15';
  const result = parseCotesZeturf(texte);
  assert.deepEqual(result.map((r) => [r.numero, r.cote]), [[1, 3.5], [2, 9.2], [3, 15]]);
});

test('parseCotesZeturf: tolere du texte parasite entre le numero et la cote (nom, jockey...)', () => {
  const texte = '7   LUPIN   C.MARTENS   3,5\n12   KANO   C.MEGISSIER   9,2';
  const result = parseCotesZeturf(texte);
  assert.deepEqual(result.map((r) => [r.numero, r.cote]), [[7, 3.5], [12, 9.2]]);
});

test('parseCotesZeturf: ignore les lignes sans au moins 2 nombres ou aux valeurs implausibles', () => {
  const texte = 'Partants\n1 seul-nombre\n99 5,5\n3 1000';
  const result = parseCotesZeturf(texte);
  // "1 seul-nombre" n'a qu'un seul nombre -> ignoree.
  // "99 5,5" : numero hors plage (1-30) -> ignoree.
  // "3 1000" : cote hors plage plausible (<999) -> ignoree.
  assert.deepEqual(result, []);
});

test('apparierCotesZeturf: associe les numeros reconnus aux chevaux de la course, signale les autres', () => {
  const chevauxCourse = [
    { numero: 1, nom: 'LUPIN' },
    { numero: 2, nom: 'KANO' }
  ];
  const cotesDetectees = [
    { numero: 1, cote: 3.5 },
    { numero: 2, cote: 9.2 },
    { numero: 8, cote: 20 } // ne fait pas partie de cette course
  ];
  const { correspondances, nonReconnus } = apparierCotesZeturf(chevauxCourse, cotesDetectees, { 1: 4.0, 2: 8.0 });

  assert.equal(correspondances.length, 2);
  assert.deepEqual(correspondances[0], { numero: 1, nom: 'LUPIN', ancienneCote: 4.0, nouvelleCote: 3.5 });
  assert.deepEqual(correspondances[1], { numero: 2, nom: 'KANO', ancienneCote: 8.0, nouvelleCote: 9.2 });

  assert.equal(nonReconnus.length, 1);
  assert.equal(nonReconnus[0].numero, 8);
});

// -------------------------------------------------------------------
// pmuApi.js (recuperation automatique des cotes via l'API non officielle
// utilisee par pmu.fr, avec repli sur proxy CORS puis sur le collage manuel)
// -------------------------------------------------------------------
test('formatDatePmu: formate en DDMMYYYY', () => {
  assert.equal(formatDatePmu(new Date(2026, 6, 10)), '10072026'); // 10 juillet 2026 (mois 0-indexe)
  assert.equal(formatDatePmu('2026-01-05'), '05012026');
});

test('buildParticipantsUrl: construit l\'URL attendue par l\'API PMU', () => {
  const url = buildParticipantsUrl(new Date(2026, 6, 10), 1, 4);
  assert.equal(url, 'https://offline.turfinfo.api.pmu.fr/rest/client/7/programme/10072026/R1/C4/participants');
});

test('mapParticipantsPmu: extrait numero/cote/nom, tolere les champs manquants', () => {
  const json = {
    participants: [
      { numPmu: 1, nom: 'LUPIN', dernierRapportDirect: { rapport: 3.5 } },
      { numPmu: 2, nom: 'KANO', dernierRapportDirect: { rapport: 9.2 } },
      { numPmu: 3, nom: 'ZANDO' }, // pas encore de rapport direct disponible
      { numPmu: 4, nom: 'NONPARTANT', dernierRapportDirect: { rapport: 0 } } // rapport a 0 -> non exploitable
    ]
  };
  const result = mapParticipantsPmu(json);
  assert.deepEqual(result, [
    { numero: 1, cote: 3.5, nom: 'LUPIN' },
    { numero: 2, cote: 9.2, nom: 'KANO' },
    { numero: 3, cote: null, nom: 'ZANDO' },
    { numero: 4, cote: null, nom: 'NONPARTANT' }
  ]);
});

test('mapParticipantsPmu: reponse vide ou malformee -> tableau vide, pas d\'exception', () => {
  assert.deepEqual(mapParticipantsPmu({}), []);
  assert.deepEqual(mapParticipantsPmu({ participants: [] }), []);
  assert.deepEqual(mapParticipantsPmu(null), []);
});

test('mapParticipantsPmu + apparierCotesZeturf: le mapping PMU se branche directement sur l\'appariement generique', () => {
  const json = {
    participants: [
      { numPmu: 1, nom: 'LUPIN', dernierRapportDirect: { rapport: 4.5 } },
      { numPmu: 2, nom: 'KANO', dernierRapportDirect: { rapport: 7.0 } }
    ]
  };
  const cotesPmu = mapParticipantsPmu(json).map((p) => ({ numero: p.numero, cote: p.cote }));
  const chevauxCourse = [{ numero: 1, nom: 'LUPIN' }, { numero: 2, nom: 'KANO' }];
  const { correspondances } = apparierCotesZeturf(chevauxCourse, cotesPmu, { 1: 3.5, 2: 9.2 });
  assert.deepEqual(correspondances, [
    { numero: 1, nom: 'LUPIN', ancienneCote: 3.5, nouvelleCote: 4.5 },
    { numero: 2, nom: 'KANO', ancienneCote: 9.2, nouvelleCote: 7.0 }
  ]);
});

test('buildProxiedUrl: enveloppe l\'URL PMU avec le proxy CORS public de repli', () => {
  const url = buildParticipantsUrl(new Date(2026, 6, 10), 1, 4);
  const proxied = buildProxiedUrl(url);
  assert.equal(proxied, `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
});

test('fetchCotesPmu: utilise en priorite la fonction externe si elle est configuree (avant meme la fonction Netlify)', async (t) => {
  const jsonOk = { participants: [{ numPmu: 1, nom: 'LUPIN', dernierRapportDirect: { rapport: 4.5 } }] };
  const appelsRecus = [];
  const fetchOriginal = global.fetch;
  global.fetch = async (url) => {
    appelsRecus.push(url);
    return { ok: true, json: async () => jsonOk };
  };
  _setExternalFunctionUrlPourTests('https://mon-mini-site.netlify.app/.netlify/functions/pmu-cotes');
  t.after(() => {
    global.fetch = fetchOriginal;
    _setExternalFunctionUrlPourTests('');
  });

  const cotes = await fetchCotesPmu(new Date(2026, 6, 10), 1, 4);
  assert.deepEqual(cotes, [{ numero: 1, cote: 4.5, nom: 'LUPIN' }]);
  assert.equal(appelsRecus.length, 1, 'doit reussir des la 1ere tentative (fonction externe), avant Netlify/direct/proxies');
  assert.ok(appelsRecus[0].startsWith('https://mon-mini-site.netlify.app/.netlify/functions/pmu-cotes?'));
  assert.ok(appelsRecus[0].includes('date=10072026') && appelsRecus[0].includes('reunion=1') && appelsRecus[0].includes('course=4'));
});

test('fetchCotesPmu: utilise en priorite la fonction serverless Netlify (meme origine, aucun CORS)', async (t) => {
  const jsonOk = { participants: [{ numPmu: 1, nom: 'LUPIN', dernierRapportDirect: { rapport: 4.5 } }] };
  const appelsRecus = [];
  const fetchOriginal = global.fetch;
  global.fetch = async (url) => {
    appelsRecus.push(url);
    return { ok: true, json: async () => jsonOk };
  };
  // Fonction externe non configuree pour ce test : on veut isoler le
  // comportement de repli sur la fonction Netlify (voir le test dedie a la
  // fonction externe ci-dessus).
  _setExternalFunctionUrlPourTests('');
  t.after(() => { global.fetch = fetchOriginal; });

  const cotes = await fetchCotesPmu(new Date(2026, 6, 10), 1, 4);
  assert.deepEqual(cotes, [{ numero: 1, cote: 4.5, nom: 'LUPIN' }]);
  assert.equal(appelsRecus.length, 1, 'doit reussir des la 1ere tentative, sans passer par le direct ni les proxies');
  assert.ok(appelsRecus[0].startsWith('/.netlify/functions/pmu-cotes?'));
  assert.ok(appelsRecus[0].includes('date=10072026') && appelsRecus[0].includes('reunion=1') && appelsRecus[0].includes('course=4'));
});

test('fetchCotesPmu: si la fonction Netlify est absente (404, ex. GitHub Pages), bascule sur l\'appel direct puis les proxies', async (t) => {
  const jsonOk = { participants: [{ numPmu: 1, nom: 'LUPIN', dernierRapportDirect: { rapport: 4.5 } }] };
  const appelsRecus = [];
  const fetchOriginal = global.fetch;
  global.fetch = async (url) => {
    appelsRecus.push(url);
    if (url.startsWith('/.netlify/functions/')) {
      return { ok: false, status: 404 }; // fonction non deployee (site statique sans Netlify)
    }
    if (!url.includes('allorigins.win')) {
      throw new TypeError('Failed to fetch'); // simule un blocage CORS sur l'appel direct
    }
    return { ok: true, json: async () => jsonOk };
  };
  _setExternalFunctionUrlPourTests(''); // isole le repli Netlify -> direct -> proxy, sans fonction externe
  t.after(() => { global.fetch = fetchOriginal; });

  const cotes = await fetchCotesPmu(new Date(2026, 6, 10), 1, 4);
  assert.deepEqual(cotes, [{ numero: 1, cote: 4.5, nom: 'LUPIN' }]);
  assert.equal(appelsRecus.length, 3, 'doit avoir tente la fonction Netlify, puis le direct, puis le proxy');
  assert.ok(appelsRecus[0].startsWith('/.netlify/functions/'));
  assert.ok(!appelsRecus[1].includes('allorigins.win') && !appelsRecus[1].startsWith('/.netlify/'), 'deuxieme appel = URL directe');
  assert.ok(appelsRecus[2].includes('allorigins.win'), 'troisieme appel = via proxy');
});

test('fetchCotesPmu: bascule sur un 2e proxy (corsproxy.io) si Netlify, direct ET allorigins.win echouent tous', async (t) => {
  const jsonOk = { participants: [{ numPmu: 1, nom: 'LUPIN', dernierRapportDirect: { rapport: 4.5 } }] };
  const appelsRecus = [];
  const fetchOriginal = global.fetch;
  global.fetch = async (url) => {
    appelsRecus.push(url);
    if (url.includes('corsproxy.io')) {
      return { ok: true, json: async () => jsonOk };
    }
    throw new TypeError('Failed to fetch'); // simule une panne de tout ce qui precede
  };
  _setExternalFunctionUrlPourTests('');
  t.after(() => { global.fetch = fetchOriginal; });

  const cotes = await fetchCotesPmu(new Date(2026, 6, 10), 1, 4);
  assert.deepEqual(cotes, [{ numero: 1, cote: 4.5, nom: 'LUPIN' }]);
  assert.equal(appelsRecus.length, 4, 'doit avoir tente Netlify, direct, allorigins, puis corsproxy.io');
  assert.ok(appelsRecus[3].includes('corsproxy.io'));
});

test('fetchCotesPmu: n\'attend pas indefiniment un service qui ne repond plus (timeout + bascule rapide)', async (t) => {
  const jsonOk = { participants: [{ numPmu: 1, nom: 'LUPIN', dernierRapportDirect: { rapport: 4.5 } }] };
  const appelsRecus = [];
  const fetchOriginal = global.fetch;
  global.fetch = (url, opts) => {
    appelsRecus.push(url);
    if (!url.includes('allorigins.win')) {
      // Simule un ou plusieurs services qui restent muets (ni succes ni
      // echec) : seul l'abort du timeout doit permettre de passer a la
      // tentative suivante.
      return new Promise((resolve, reject) => {
        opts.signal.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }
    return Promise.resolve({ ok: true, json: async () => jsonOk });
  };
  _setExternalFunctionUrlPourTests('');
  t.after(() => { global.fetch = fetchOriginal; });

  const debut = Date.now();
  const cotes = await fetchCotesPmu(new Date(2026, 6, 10), 1, 4, { timeoutMs: 30 });
  const duree = Date.now() - debut;

  assert.deepEqual(cotes, [{ numero: 1, cote: 4.5, nom: 'LUPIN' }]);
  assert.equal(appelsRecus.length, 3, 'doit avoir abandonne Netlify puis direct (timeout) avant de reussir via allorigins');
  assert.ok(duree < 2000, `doit basculer rapidement grace au timeout (dure ${duree}ms)`);
});

test('fetchCotesPmu: leve une erreur claire listant toutes les tentatives si tout echoue', async (t) => {
  const fetchOriginal = global.fetch;
  global.fetch = async () => { throw new TypeError('Failed to fetch'); };
  t.after(() => { global.fetch = fetchOriginal; });

  await assert.rejects(
    () => fetchCotesPmu(new Date(2026, 6, 10), 1, 4),
    // 6 tentatives depuis l'ajout de la fonction externe (voir pmuApi.js v5)
    // en tete de cascade, avant la fonction Netlify.
    /Recuperation automatique impossible apres 6 tentative/
  );
});

// -------------------------------------------------------------------
// pmuApi.js : arrivee officielle (endpoint course PMU, sans /participants)
// -------------------------------------------------------------------
test('buildCourseUrl: construit l\'URL de l\'endpoint course (sans /participants)', () => {
  const url = buildCourseUrl(new Date(2026, 6, 10), 1, 4);
  assert.equal(url, 'https://offline.turfinfo.api.pmu.fr/rest/client/7/programme/10072026/R1/C4');
});

test('extraireArriveePmu: aplatit ordreArrivee (avec ex-aequo) quand la course est terminee', () => {
  const json = { arriveeDefinitive: true, ordreArrivee: [[4], [3], [1, 5], [2], [7]] };
  assert.deepEqual(extraireArriveePmu(json), [4, 3, 1, 5, 2, 7]);
});

test('extraireArriveePmu: renvoie null si la course n\'est pas encore terminee ou structure inattendue', () => {
  assert.equal(extraireArriveePmu({ arriveeDefinitive: false, ordreArrivee: [[1]] }), null);
  assert.equal(extraireArriveePmu({ ordreArrivee: [[1]] }), null);
  assert.equal(extraireArriveePmu({ arriveeDefinitive: true, ordreArrivee: [] }), null);
  assert.equal(extraireArriveePmu({ arriveeDefinitive: true }), null);
  assert.equal(extraireArriveePmu(null), null);
});

test('fetchResultatPmu: utilise la fonction Netlify (type=resultat) et renvoie l\'arrivee si la course est terminee', async (t) => {
  const appelsRecus = [];
  const fetchOriginal = global.fetch;
  global.fetch = async (url) => {
    appelsRecus.push(url);
    return { ok: true, json: async () => ({ arriveeDefinitive: true, ordreArrivee: [[4], [3], [1]] }) };
  };
  _setExternalFunctionUrlPourTests(''); // isole le repli sur la fonction Netlify
  t.after(() => {
    global.fetch = fetchOriginal;
    _setExternalFunctionUrlPourTests('');
  });

  const arrivee = await fetchResultatPmu(new Date(2026, 6, 10), 1, 4);
  assert.deepEqual(arrivee, [4, 3, 1]);
  assert.equal(appelsRecus.length, 1);
  assert.ok(appelsRecus[0].startsWith('/.netlify/functions/pmu-cotes?'));
  assert.ok(appelsRecus[0].includes('type=resultat'));
});

test('fetchResultatPmu: renvoie null (sans jamais lever d\'exception) si la course n\'est pas encore terminee', async (t) => {
  const fetchOriginal = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ arriveeDefinitive: false }) });
  t.after(() => { global.fetch = fetchOriginal; });

  const arrivee = await fetchResultatPmu(new Date(2026, 6, 10), 1, 4);
  assert.equal(arrivee, null);
});

test('fetchResultatPmu: renvoie null (sans jamais lever d\'exception) si toutes les tentatives echouent', async (t) => {
  const fetchOriginal = global.fetch;
  global.fetch = async () => { throw new TypeError('Failed to fetch'); };
  t.after(() => { global.fetch = fetchOriginal; });

  const arrivee = await fetchResultatPmu(new Date(2026, 6, 10), 1, 4);
  assert.equal(arrivee, null);
});
