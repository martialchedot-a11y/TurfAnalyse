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
import { formatDatePmu, buildParticipantsUrl, buildCourseUrl, buildRapportsUrl, buildProxiedUrl, mapParticipantsPmu, extraireArriveePmu, extraireRapportsCoupleGagnant, extraireRapportsTrio, extraireRapportsSimpleGagnant, extraireRapportsSimplePlace, fetchCotesPmu, fetchResultatPmu, fetchRapportsPmu, _setExternalFunctionUrlPourTests } from '../js/engine/pmuApi.js';
import { parsePredictionsExternes, niveauConfirmationExterne } from '../js/engine/predictionsExternesParser.js';
import { jeuSimpleGagnant, misesJeuSimpleGagnant, SEUILS_VALUE_RANG_SIMPLE_GAGNANT, bilanJeuSimpleGagnant, rendementBilan, cumulerBilansJournaliers } from '../js/engine/jeuSimpleGagnant.js';
import { combinaisons, memesNumeros, estSousEnsemble, combinaisonsDuPool, classementCroisement, jeuCoupleTrioCroisement, bilanCoupleCroisement, bilanTrioCroisement, MIN_PARTANTS_CROISEMENT, MAX_PARTANTS_CROISEMENT, SEUIL_QUALIFICATION_CROISEMENT, MIN_CHEVAUX_COUPLE, MIN_CHEVAUX_TRIO, PLAFOND_POOL_CROISEMENT } from '../js/engine/jeuCoupleTrioCroisement.js';
import { minutesDepuisMinuit, estDansFenetreAvantDepart, estAujourdHui } from '../js/engine/surveillance.js';

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

test('scoreConditions: bonus reussite historique en deferre (>=50% podiums, >=3 courses)', () => {
  const historique = [
    { discipline: 'ATTELE', deferreOuIndiceValeur: 'D4', place: 1 },
    { discipline: 'ATTELE', deferreOuIndiceValeur: 'DA', place: 2 },
    { discipline: 'ATTELE', deferreOuIndiceValeur: 'DP', place: 5 },
    { discipline: 'MONTE', deferreOuIndiceValeur: '', place: 1 } // ferre : ignore
  ];
  const score = ScoringEngine.scoreConditions(0, 0, 'DF', false, historique);
  assert.equal(score, 66); // base (RJ=0,RE=0,DF) = 20+20+20=60 + bonus 6
});

test('scoreConditions: malus reussite historique en deferre (<50% podiums, >=3 courses)', () => {
  const historique = [
    { discipline: 'ATTELE', deferreOuIndiceValeur: 'D4', place: 6 },
    { discipline: 'ATTELE', deferreOuIndiceValeur: 'DA', place: 8 },
    { discipline: 'ATTELE', deferreOuIndiceValeur: 'DP', place: 4 }
  ];
  const score = ScoringEngine.scoreConditions(0, 0, 'DF', false, historique);
  assert.equal(score, 57); // base (RJ=0,RE=0,DF) = 60 - malus 3
});

test('scoreConditions: pas de bonus/malus si moins de 3 courses en deferre dans l historique', () => {
  const historique = [
    { discipline: 'ATTELE', deferreOuIndiceValeur: 'D4', place: 1 },
    { discipline: 'ATTELE', deferreOuIndiceValeur: 'DA', place: 2 }
  ];
  const score = ScoringEngine.scoreConditions(0, 0, 'DF', false, historique);
  assert.equal(score, 60); // moins de 3 courses deferre -> pas de bonus, base = 60
});

test('scoreConditions: pas de bonus/malus si le cheval ne court pas deferre aujourd hui', () => {
  const historique = [
    { discipline: 'ATTELE', deferreOuIndiceValeur: 'D4', place: 1 },
    { discipline: 'ATTELE', deferreOuIndiceValeur: 'DA', place: 2 },
    { discipline: 'ATTELE', deferreOuIndiceValeur: 'DP', place: 3 }
  ];
  const score = ScoringEngine.scoreConditions(0, 0, '', false, historique);
  assert.equal(score, 58); // ferre aujourd'hui -> scoreFerrage=18, base = 20+20+18=58, pas de bonus historique
});

test('scoreConditions: le bonus historique deferre est ignore en Plat', () => {
  const historique = [
    { discipline: 'ATTELE', deferreOuIndiceValeur: 'D4', place: 1 },
    { discipline: 'ATTELE', deferreOuIndiceValeur: 'DA', place: 2 },
    { discipline: 'ATTELE', deferreOuIndiceValeur: 'DP', place: 3 }
  ];
  const score = ScoringEngine.scoreConditions(0, 0, 'DF', true, historique);
  assert.equal(score, 58); // identique au test Plat existant, historique ignore
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

test('parseReunionComplete: format "Analyse_AAAAMMJJ_partants" (colonnes deplacees/renommees, resolues par nom) - "Cote Calc" juste apres P10, "Ferrure" a la place de "VH ou Ferrage", colonnes "Handicap"/"Median" et 10 colonnes finales en plus', () => {
  // Reproduit la structure reelle du nouveau format (88 colonnes) : Cote
  // Calc deplacee juste apres P10 (au lieu d'etre juste avant Reunion),
  // "Handicap" insere avant "Ferrure" (= ancien "VH ou Ferrage"), "Median"
  // insere apres IX, et 10 colonnes supplementaires en toute fin de
  // fichier - aucune ne doit perturber la resolution des champs utilises
  // par le moteur, puisqu'elle se fait desormais par NOM de colonne.
  const header = '"N°";"Nom";"Handicap";"Ferrure";"SA";"DP";"Gains";"DrivJock";"RJ";"Entraineur";"RE";"ED";"CJE";"JA";"Musique";"P1";"P2";"P3";"P4";"P5";"P6";"P7";"P8";"P9";"P10";"Cote Calc";"C8";"CD";"CZ";"MP";"PtH";"MN";"RC";"RX";"MX";"CX";"IdC";"CFP";"OR";"IX";"Median";"IF";"CR";"AR";"PtR";"PC";"MA";"TG";"SC";"R10";"Record";"Nom Pere";"Nom Mere";"Valeur Pere";"Valeur Mere";"Score Geniteur Pere";"Score Geniteur Mere";"Top Geniteur";"Cla Score Pedigree";"Reunion";"Course";"LieuCourse";"Heure";"Discipline";"Autostart";"TypeCourse";"Allocation";"Distance";"Partants";"NonPartants";"Age";"Arrivee";"RCM";"IdD";"IdP";"ScFi";"Tranche prevue";"MMX";"IndForme";"ClasCoefReussite";"ScoreBase";"ScoreSignaux";"ClaCote";"ClasED";"ClasHMP";"ClaHisto";"ClaTMatic";"ClaOR"';
  // Ligne de donnees construite programmatiquement (position exacte de
  // chaque champ retrouvee par indexOf sur le meme tableau d'en-tete) pour
  // garantir l'alignement des 88 colonnes, plutot qu'un decoupage manuel
  // sujet a erreur de comptage.
  const headerCols = header.split(';').map((c) => c.replace(/^"|"$/g, ''));
  const row1Cols = new Array(headerCols.length).fill('');
  const set = (nom, val) => { row1Cols[headerCols.indexOf(nom)] = val; };
  set('N°', '1'); set('Nom', 'LUPIN'); set('Ferrure', 'D4'); set('SA', 'M5'); set('Gains', '192070');
  set('DrivJock', 'C.MARTENS'); set('RJ', '46'); set('Entraineur', 'V.MARTENS'); set('RE', '54'); set('ED', '100');
  set('CJE', '21'); set('JA', '46'); set('Musique', '6a1a4a');
  set('Cote Calc', '3,2'); set('C8', '3,5'); set('CD', '2,8');
  set('Reunion', '1'); set('Course', '1'); set('LieuCourse', 'ENGHIEN'); set('Heure', '10h59'); set('Discipline', 'ATTELE');
  set('TypeCourse', 'E'); set('Allocation', '40000'); set('Distance', '2700'); set('Partants', '9'); set('NonPartants', '0'); set('Age', '6'); set('Arrivee', '1-2-3');
  const row1 = row1Cols.map((v) => `"${v}"`).join(';');
  const csv = [header, row1].join('\n');

  const races = CSVImporter.parseReunionComplete(csv);
  assert.equal(races.length, 1);
  assert.equal(races[0].context.lieu, 'ENGHIEN');
  assert.equal(races[0].context.numeroReunion, 1);
  assert.equal(races[0].context.numeroCourse, 1);
  assert.equal(races[0].context.nbPartants, 9);
  assert.equal(races[0].context.allocation, 40000);
  assert.deepEqual(CSVImporter.parseOrdreArrivee(races[0].arriveeBrute), [1, 2, 3]);

  const lupin = races[0].horses[0];
  assert.equal(lupin.ferrage, 'D4', '"Ferrure" (nouveau nom) doit alimenter le meme champ que l\'ancien "VH ou Ferrage"');
  assert.equal(lupin.rubriques[0], 46, 'RJ retrouve par nom malgre le decalage');
  assert.equal(lupin.rubriques[1], 54, 'RE retrouve par nom malgre le decalage');
  approx(lupin.coteDirecte, 2.8, 0.001);
  approx(lupin.cote8h, 3.5, 0.001);
  approx(lupin.cotePredictive, 3.2, 0.001, '"Cote Calc" retrouvee par nom meme deplacee juste apres P10');
});

test('parsePerformances: nouveau format de date "AAAA-MM-JJ HH:MM:SS" (fichier "Analyse_AAAAMMJJ_musiques")', () => {
  const header = '"Nom";"DatePerf";"Lieu";"Dist";"Gains";"Partants";"Corde";"Cordage";"Deferre";"Poid";"Discipline";"TypeCourse";"Allocation";"Place";"RedKDist";"Cote"';
  const row = '"APPEN";"2026-06-03 00:00:00";"LA TESTE DE BUCH";"1200";"5880";"12";"3";"DROITE";"";"56,5";"PLAT";"R";"21000";"3";"";"5,6"';
  const csv = [header, row].join('\n');

  const perfs = CSVImporter.parsePerformances(csv);
  assert.equal(perfs.length, 1);
  assert.equal(perfs[0].nomCheval, 'APPEN');
  assert.equal(perfs[0].datePerf, new Date(Date.UTC(2026, 5, 3)).toISOString());
  assert.equal(perfs[0].place, 3);
  approx(perfs[0].cote, 5.6, 0.001);
});

test('parsePerformances: format de date "AAAA-MM-JJ" (sans heure) reste supporte', () => {
  const header = '"Nom";"DatePerf";"Lieu";"Dist";"Gains";"Partants";"Corde";"Cordage";"Deferre";"Poid";"Discipline";"TypeCourse";"Allocation";"Place";"RedKDist";"Cote"';
  const row = '"APPEN";"2026-06-03";"LA TESTE DE BUCH";"1200";"5880";"12";"3";"DROITE";"";"56,5";"PLAT";"R";"21000";"3";"";"5,6"';
  const csv = [header, row].join('\n');

  const perfs = CSVImporter.parsePerformances(csv);
  assert.equal(perfs[0].datePerf, new Date(Date.UTC(2026, 5, 3)).toISOString());
});

// -------------------------------------------------------------------
// predictionsExternesParser.js (fichier tiers optionnel "Predictions_JJMMAAAA_HHMM")
// -------------------------------------------------------------------
const PREDICTIONS_EXTERNES_HEADER = 'Rx;Cx;Hippodrome;Départ;Discipline;Cat.;Allocation;Distance;Partants;NP;Age M.;MRC;IdD;IdP;Cotée G1 N°;Cotée G1 Cote;Cotée G2 N°;Cotée G2 Cote;Cotée G3 N°;Cotée G3 Cote;Non cotée G1 N°;Non cotée G1 Cote;Non cotée G2 N°;Non cotée G2 Cote;Non cotée G3 N°;Non cotée G3 Cote;ScFi;Rapport Prévu;SG;Arrivée';

test('parsePredictionsExternes: parse une ligne complete (cotee/non cotee, ScFi, Rapport Prevu, SG/Arrivee reels)', () => {
  const row = 'R3;C1;DIVONNE LES BAINS;10h59;ATTELE;E;10000;2700;10;;;;;;16;16;1;18,6;14;18,1;5;3,3;2;2,5;9;10,5;32,6;15€+;3,3;5-6-16-3-1';
  const csv = [PREDICTIONS_EXTERNES_HEADER, row].join('\n');

  const predictions = parsePredictionsExternes(csv);
  assert.equal(predictions.length, 1);
  const p = predictions[0];
  assert.equal(p.numeroCourse, 1);
  assert.equal(p.hippodrome, 'DIVONNE LES BAINS');
  assert.deepEqual(p.cotee, [{ numero: 16, cote: 16 }, { numero: 1, cote: 18.6 }, { numero: 14, cote: 18.1 }]);
  assert.deepEqual(p.nonCotee, [{ numero: 5, cote: 3.3 }, { numero: 2, cote: 2.5 }, { numero: 9, cote: 10.5 }]);
  approx(p.scFi, 32.6, 0.001);
  assert.equal(p.rapportPrevu, '15€+');
  approx(p.sgReel, 3.3, 0.001);
  assert.deepEqual(p.arriveeReelle, [5, 6, 16, 3, 1]);
});

test('parsePredictionsExternes: colonnes G2/G3 vides ignorees (champ facultatif), SG/Arrivee vides avant la course', () => {
  const row = 'R1;C2;DEAUVILLE;14h31;PLAT;;;;;;;;;;7;4;;;;;7;4;2;9,9;3;8,6;40.0;4-8€;;';
  const csv = [PREDICTIONS_EXTERNES_HEADER, row].join('\n');

  const predictions = parsePredictionsExternes(csv);
  assert.equal(predictions.length, 1);
  const p = predictions[0];
  assert.deepEqual(p.cotee, [{ numero: 7, cote: 4 }]);
  assert.equal(p.nonCotee.length, 3);
  assert.equal(p.sgReel, null);
  assert.deepEqual(p.arriveeReelle, []);
});

test('parsePredictionsExternes: ignore les lignes sans numero de course exploitable', () => {
  const row = 'R1;;DEAUVILLE;14h31;PLAT;;;;;;;;;;7;4;;;;;;;;;;;40.0;4-8€;;';
  const csv = [PREDICTIONS_EXTERNES_HEADER, row].join('\n');
  assert.deepEqual(parsePredictionsExternes(csv), []);
});

test('niveauConfirmationExterne: double (cotee + non cotee), simple (un seul groupe), absente, et null sans prediction', () => {
  const prediction = {
    cotee: [{ numero: 6, cote: 1.7 }, { numero: 1, cote: 3.3 }],
    nonCotee: [{ numero: 1, cote: 3.3 }, { numero: 6, cote: 1.7 }, { numero: 5, cote: 8.3 }]
  };
  assert.equal(niveauConfirmationExterne(6, prediction), 'double');
  assert.equal(niveauConfirmationExterne(5, prediction), 'simple');
  assert.equal(niveauConfirmationExterne(9, prediction), 'absente');
  assert.equal(niveauConfirmationExterne(6, null), null);
  assert.equal(niveauConfirmationExterne(6, undefined), null);
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

// -------------------------------------------------------------------
// pmuApi.js : rapports officiels (dividendes, endpoint rapports-definitifs)
// -------------------------------------------------------------------
test('buildRapportsUrl: construit l\'URL de l\'endpoint rapports-definitifs (pool national, sans specialisation)', () => {
  const url = buildRapportsUrl(new Date(2026, 6, 10), 1, 4);
  assert.equal(url, 'https://offline.turfinfo.api.pmu.fr/rest/client/7/programme/10072026/R1/C4/rapports-definitifs');
});

test('buildRapportsUrl: ajoute ?specialisation=INTERNET pour le pool internet (celui affiche sur pmu.fr)', () => {
  const url = buildRapportsUrl(new Date(2026, 6, 10), 1, 4, 'INTERNET');
  assert.equal(url, 'https://offline.turfinfo.api.pmu.fr/rest/client/7/programme/10072026/R1/C4/rapports-definitifs?specialisation=INTERNET');
});

// Reponse reelle observee sur l'API PMU (course a 11 partants, 04/08/2026,
// R1/C5). *** Corrige *** : COUPLE_GAGNANT (pool national) et E_COUPLE_GAGNANT
// (pool internet) viennent en realite de DEUX appels distincts a l'endpoint
// (l'un sans specialisation, l'autre avec ?specialisation=INTERNET) - voir
// buildRapportsUrl/fetchRapportsPmu. Les deux tableaux sont regroupes ici
// pour simuler la reponse FUSIONNEE que renvoie desormais fetchRapportsPmu,
// telle que consommee par extraireRapportsCoupleGagnant/extraireRapportsTrio.
const RAPPORTS_JSON_REEL = [
  { typePari: 'SIMPLE_GAGNANT', miseBase: 200, rapports: [{ combinaison: '6', dividendePourUnEuro: 380 }] },
  {
    typePari: 'COUPLE_GAGNANT', miseBase: 200, rapports: [
      { combinaison: '6-1', dividendePourUnEuro: 4070 },
      { combinaison: '6-NP', dividendePourUnEuro: 1090 }
    ]
  },
  {
    typePari: 'E_COUPLE_GAGNANT', miseBase: 100, rapports: [
      { combinaison: '6-1', dividendePourUnEuro: 4980 }
    ]
  }
];

test('extraireRapportsCoupleGagnant: privilegie E_COUPLE_GAGNANT (pool internet, affiche sur pmu.fr) sur COUPLE_GAGNANT (national)', () => {
  const rapports = extraireRapportsCoupleGagnant(RAPPORTS_JSON_REEL);
  assert.deepEqual(rapports, [{ numeros: [6, 1], dividende: 49.80 }]);
});

test('extraireRapportsCoupleGagnant: se replie sur COUPLE_GAGNANT (national) si E_COUPLE_GAGNANT absent', () => {
  const json = [RAPPORTS_JSON_REEL[1]]; // uniquement le bloc COUPLE_GAGNANT (national)
  const rapports = extraireRapportsCoupleGagnant(json);
  assert.deepEqual(rapports, [{ numeros: [6, 1], dividende: 40.70 }]);
});

test('extraireRapportsCoupleGagnant: tableau vide si aucun des deux types n\'est present (Couple Gagnant non propose)', () => {
  assert.deepEqual(extraireRapportsCoupleGagnant([RAPPORTS_JSON_REEL[0]]), []);
  assert.deepEqual(extraireRapportsCoupleGagnant([]), []);
  assert.deepEqual(extraireRapportsCoupleGagnant(null), []);
  assert.deepEqual(extraireRapportsCoupleGagnant(undefined), []);
});

// Reponse fictive (meme principe que RAPPORTS_JSON_REEL, mais pour le pari
// Trio - 3 numeros par combinaison), inspiree du cas reel signale par
// l'utilisateur (Trio 5-6-16 du 09/08/2026 : 74,90€ pool national contre
// 228,30€ pool internet, pour la MEME combinaison gagnante).
const RAPPORTS_TRIO_JSON = [
  { typePari: 'SIMPLE_GAGNANT', miseBase: 200, rapports: [{ combinaison: '6', dividendePourUnEuro: 380 }] },
  {
    typePari: 'TRIO', miseBase: 100, rapports: [
      { combinaison: '6-1-9', dividendePourUnEuro: 18540 }
    ]
  },
  {
    typePari: 'E_TRIO', miseBase: 100, rapports: [
      { combinaison: '6-1-9', dividendePourUnEuro: 19200 }
    ]
  }
];

test('extraireRapportsTrio: privilegie E_TRIO (pool internet, affiche sur pmu.fr) sur TRIO (national)', () => {
  const rapports = extraireRapportsTrio(RAPPORTS_TRIO_JSON);
  assert.deepEqual(rapports, [{ numeros: [6, 1, 9], dividende: 192.00 }]);
});

test('extraireRapportsTrio: se replie sur TRIO (national) si E_TRIO absent', () => {
  const json = [RAPPORTS_TRIO_JSON[1]]; // uniquement le bloc TRIO (national)
  const rapports = extraireRapportsTrio(json);
  assert.deepEqual(rapports, [{ numeros: [6, 1, 9], dividende: 185.40 }]);
});

test('extraireRapportsTrio: tableau vide si aucun des deux types n\'est present (Trio non propose)', () => {
  assert.deepEqual(extraireRapportsTrio([RAPPORTS_TRIO_JSON[0]]), []);
  assert.deepEqual(extraireRapportsTrio([]), []);
  assert.deepEqual(extraireRapportsTrio(null), []);
  assert.deepEqual(extraireRapportsTrio(undefined), []);
});

// Reponse reelle verifiee via l'API PMU (R1C1 du 09/08/2026, pool internet
// ?specialisation=INTERNET) : arrivee 5-6-..., e-Simple Gagnant 7,60€ sur le
// N°5, e-Simple Place 2,30€ (N°5) et 1,30€ (N°6). Utilisee pour la Base sur
// Course feu vert (voir rapportSimpleHtml, js/app.js) - a la demande de
// l'utilisateur ("mettre la base a la place du trio et recuperer le rapport
// simple gagnant et/ou place").
const RAPPORTS_SIMPLE_JSON = [
  {
    typePari: 'SIMPLE_GAGNANT', miseBase: 200, rapports: [
      { combinaison: '5', dividendePourUnEuro: 890 }
    ]
  },
  {
    typePari: 'SIMPLE_PLACE', miseBase: 200, rapports: [
      { combinaison: '5', dividendePourUnEuro: 200 },
      { combinaison: '6', dividendePourUnEuro: 120 }
    ]
  },
  {
    typePari: 'E_SIMPLE_GAGNANT', miseBase: 100, rapports: [
      { combinaison: '5', dividendePourUnEuro: 760 }
    ]
  },
  {
    typePari: 'E_SIMPLE_PLACE', miseBase: 100, rapports: [
      { combinaison: '5', dividendePourUnEuro: 230 },
      { combinaison: '6', dividendePourUnEuro: 130 }
    ]
  }
];

test('extraireRapportsSimpleGagnant: privilegie E_SIMPLE_GAGNANT (internet) sur SIMPLE_GAGNANT (national)', () => {
  assert.deepEqual(extraireRapportsSimpleGagnant(RAPPORTS_SIMPLE_JSON), [{ numero: 5, dividende: 7.60 }]);
});

test('extraireRapportsSimpleGagnant: se replie sur SIMPLE_GAGNANT (national) si E_SIMPLE_GAGNANT absent', () => {
  const json = [RAPPORTS_SIMPLE_JSON[0]]; // uniquement le bloc national
  assert.deepEqual(extraireRapportsSimpleGagnant(json), [{ numero: 5, dividende: 8.90 }]);
});

test('extraireRapportsSimpleGagnant: tableau vide si aucun des deux types n\'est present', () => {
  assert.deepEqual(extraireRapportsSimpleGagnant([RAPPORTS_SIMPLE_JSON[1]]), []);
  assert.deepEqual(extraireRapportsSimpleGagnant([]), []);
  assert.deepEqual(extraireRapportsSimpleGagnant(null), []);
  assert.deepEqual(extraireRapportsSimpleGagnant(undefined), []);
});

test('extraireRapportsSimplePlace: privilegie E_SIMPLE_PLACE (internet), renvoie un rapport par cheval place', () => {
  assert.deepEqual(extraireRapportsSimplePlace(RAPPORTS_SIMPLE_JSON), [
    { numero: 5, dividende: 2.30 },
    { numero: 6, dividende: 1.30 }
  ]);
});

test('extraireRapportsSimplePlace: se replie sur SIMPLE_PLACE (national) si E_SIMPLE_PLACE absent', () => {
  const json = [RAPPORTS_SIMPLE_JSON[1]]; // uniquement le bloc national
  assert.deepEqual(extraireRapportsSimplePlace(json), [
    { numero: 5, dividende: 2.00 },
    { numero: 6, dividende: 1.20 }
  ]);
});

test('extraireRapportsSimplePlace: tableau vide si aucun des deux types n\'est present', () => {
  assert.deepEqual(extraireRapportsSimplePlace([RAPPORTS_SIMPLE_JSON[0]]), []);
  assert.deepEqual(extraireRapportsSimplePlace([]), []);
  assert.deepEqual(extraireRapportsSimplePlace(null), []);
  assert.deepEqual(extraireRapportsSimplePlace(undefined), []);
});

test('fetchRapportsPmu: appelle les 2 pools (national + internet) via la fonction Netlify et fusionne les reponses', async (t) => {
  const appelsRecus = [];
  const fetchOriginal = global.fetch;
  const NATIONAL = [RAPPORTS_JSON_REEL[0], RAPPORTS_JSON_REEL[1]];
  const INTERNET = [RAPPORTS_JSON_REEL[2]];
  global.fetch = async (url) => {
    appelsRecus.push(url);
    const json = url.includes('specialisation=INTERNET') ? INTERNET : NATIONAL;
    return { ok: true, json: async () => json };
  };
  _setExternalFunctionUrlPourTests('');
  t.after(() => {
    global.fetch = fetchOriginal;
    _setExternalFunctionUrlPourTests('');
  });

  const json = await fetchRapportsPmu(new Date(2026, 6, 10), 1, 4);
  assert.deepEqual(json, [...NATIONAL, ...INTERNET]);
  assert.equal(appelsRecus.length, 2);
  assert.ok(appelsRecus.some((u) => u.startsWith('/.netlify/functions/pmu-cotes?') && u.includes('type=rapports') && !u.includes('specialisation')));
  assert.ok(appelsRecus.some((u) => u.startsWith('/.netlify/functions/pmu-cotes?') && u.includes('type=rapports') && u.includes('specialisation=INTERNET')));
});

test('fetchRapportsPmu: pool internet - ignore une reponse sans bloc E_ (source pas encore mise a jour) et continue la cascade', async (t) => {
  const appelsRecus = [];
  const fetchOriginal = global.fetch;
  const NATIONAL_SEUL = [RAPPORTS_JSON_REEL[1]]; // jamais de bloc E_ (simule une fonction Netlify pas a jour)
  const INTERNET_REEL = [RAPPORTS_JSON_REEL[2]];
  global.fetch = async (url) => {
    appelsRecus.push(url);
    if (url.includes('specialisation=INTERNET')) {
      // La "fonction Netlify" (premiere tentative reelle, la fonction
      // externe etant desactivee ci-dessous) ignore le parametre et renvoie
      // toujours le national ; "l'acces direct" (URL PMU reelle, tentative
      // suivante) repond correctement avec le bloc E_.
      if (url.startsWith('/.netlify/functions/pmu-cotes')) {
        return { ok: true, json: async () => NATIONAL_SEUL };
      }
      return { ok: true, json: async () => INTERNET_REEL };
    }
    return { ok: true, json: async () => NATIONAL_SEUL };
  };
  _setExternalFunctionUrlPourTests('');
  t.after(() => {
    global.fetch = fetchOriginal;
    _setExternalFunctionUrlPourTests('');
  });

  const json = await fetchRapportsPmu(new Date(2026, 6, 10), 1, 4);
  assert.deepEqual(json, [...NATIONAL_SEUL, ...INTERNET_REEL]);
});

test('fetchRapportsPmu: renvoie null (sans jamais lever d\'exception) si toutes les tentatives echouent', async (t) => {
  const fetchOriginal = global.fetch;
  global.fetch = async () => { throw new TypeError('Failed to fetch'); };
  t.after(() => { global.fetch = fetchOriginal; });

  const json = await fetchRapportsPmu(new Date(2026, 6, 10), 1, 4);
  assert.equal(json, null);
});

// -------------------------------------------------------------------
// Jeu Simple Gagnant v6 (aout 2026) : ne joue QUE le rang 1 du classement
// Score Global, uniquement s'il depasse son seuil de cote (3,8). Le
// Dutching multi-rangs (v4/v5) a ete retire entierement de cette page ;
// `alternative` vaut donc toujours `null` dans le retour de
// `jeuSimpleGagnant`.
// -------------------------------------------------------------------
function chevalPourJsg(numero, classement, cote) {
  return { entry: { numero }, classement, cotePourAffichage: cote };
}

test('jeuSimpleGagnant: non rentable si aucun cheval (rangs 1/2/4/5) ne depasse son seuil', () => {
  assert.deepEqual(jeuSimpleGagnant([]), { rentable: false });
  const chevaux = [
    chevalPourJsg(1, 1, 3.5),  // <= 3,8
    chevalPourJsg(2, 2, 5.0),  // <= 5,2
    chevalPourJsg(3, 3, 50),   // rang 3 : toujours exclu, meme avec une cote enorme
    chevalPourJsg(4, 4, 9.0),  // <= 9,4
    chevalPourJsg(5, 5, 12.0)  // <= 12,5
  ];
  assert.deepEqual(jeuSimpleGagnant(chevaux), { rentable: false });
});

test('jeuSimpleGagnant: rang 1 seul depasse son seuil -> principal = rang 1 seul, pas d\'alternative', () => {
  const chevaux = [
    chevalPourJsg(1, 1, 4.0),  // > 3,8 -> value
    chevalPourJsg(2, 2, 5.0),  // <= 5,2
    chevalPourJsg(4, 4, 9.0),  // <= 9,4
    chevalPourJsg(5, 5, 12.0)  // <= 12,5
  ];
  const jeu = jeuSimpleGagnant(chevaux);
  assert.equal(jeu.rentable, true);
  assert.equal(jeu.rang1Value, true);
  assert.ok(jeu.principal);
  assert.deepEqual(jeu.principal.chevaux.map((c) => c.entry.numero), [1]);
  assert.equal(jeu.principal.n, 1);
  approx(jeu.principal.rendement, 4.0, 1e-9); // Dutching a 1 cheval = sa cote
  assert.equal(jeu.alternative, null);
  assert.equal(jeu.recommande, jeu.principal);
});

test('jeuSimpleGagnant: rang 1 non value mais un seul autre rang value -> non jouable (rang 1 obligatoire)', () => {
  const chevaux = [
    chevalPourJsg(1, 1, 3.0),  // <= 3,8
    chevalPourJsg(2, 2, 5.0),  // <= 5,2
    chevalPourJsg(4, 4, 10.0), // > 9,4 -> value, mais rang 1 non value
    chevalPourJsg(5, 5, 12.0)  // <= 12,5
  ];
  assert.deepEqual(jeuSimpleGagnant(chevaux), { rentable: false });
});

test('jeuSimpleGagnant: rang 1 value + un autre rang value -> principal = rang 1 seul, pas de Dutching (retire en v6)', () => {
  const chevaux = [
    chevalPourJsg(1, 1, 4.0),  // > 3,8 -> value
    chevalPourJsg(2, 2, 6.0),  // > 5,2 -> value, mais n'entre plus en jeu
    chevalPourJsg(4, 4, 9.0),  // <= 9,4
    chevalPourJsg(5, 5, 12.0)  // <= 12,5
  ];
  const jeu = jeuSimpleGagnant(chevaux);
  assert.equal(jeu.rentable, true);
  assert.equal(jeu.rang1Value, true);
  assert.deepEqual(jeu.principal.chevaux.map((c) => c.entry.numero), [1]);
  approx(jeu.principal.rendement, 4.0, 1e-9);
  assert.equal(jeu.alternative, null);
  assert.equal(jeu.recommande, jeu.principal);
});

test('jeuSimpleGagnant: rang 1 non value meme si 2 autres rangs value -> non jouable (Dutching seul retire, backtest fragile 102,8%)', () => {
  const chevaux = [
    chevalPourJsg(1, 1, 3.0),  // <= 3,8
    chevalPourJsg(2, 2, 6.0),  // > 5,2 -> value
    chevalPourJsg(4, 4, 9.0),  // <= 9,4
    chevalPourJsg(5, 5, 13.0)  // > 12,5 -> value
  ];
  assert.deepEqual(jeuSimpleGagnant(chevaux), { rentable: false });
});

test('jeuSimpleGagnant: le rang 3 est toujours exclu (jamais "value"), meme entoure de rangs qui, eux, qualifient', () => {
  const chevaux = [
    chevalPourJsg(1, 1, 4.0),  // > 3,8 -> value
    chevalPourJsg(3, 3, 100),  // rang 3 : jamais pris en compte
  ];
  const jeu = jeuSimpleGagnant(chevaux);
  assert.equal(jeu.rentable, true);
  assert.deepEqual(jeu.principal.chevaux.map((c) => c.entry.numero), [1]); // pas le n°3
  assert.equal(jeu.alternative, null);
});

test('jeuSimpleGagnant: rang 1 sans cote reelle connue (null) -> non jouable, meme si un autre rang est value', () => {
  const chevaux = [
    { entry: { numero: 1 }, classement: 1, cotePourAffichage: null }, // rang 1 sans cote -> non value
    chevalPourJsg(2, 2, 6.0) // > 5,2 -> value, mais insuffisant sans le rang 1
  ];
  assert.deepEqual(jeuSimpleGagnant(chevaux), { rentable: false });
});

test('misesJeuSimpleGagnant: methode Dutching arrondie a l\'euro, exemple 4 chevaux/mise totale 100e', () => {
  // Cotes 3/5/6/8 : S = 1/3+1/5+1/6+1/8 = 0,8250, rendement = 1/S = 121,2%.
  // Mises brutes = M x (1/cote_i) / S = 40,40 / 24,24 / 20,20 / 15,15,
  // arrondies a l'euro le plus proche par la methode "au plus fort reste"
  // (le cheval avec le plus grand reste apres arrondi a l'euro inferieur
  // recoit l'euro manquant en premier) : ici le cheval 1 (reste 0,404, le
  // plus grand) recoit l'euro supplementaire -> 41/24/20/15, dont la somme
  // vaut exactement 100e (mises jouables au guichet). Le gain (mise_i x
  // cote_i) n'est alors plus rigoureusement identique pour tous
  // (123/120/120/120), a la difference du calcul non arrondi.
  const chevaux = [3, 5, 6, 8].map((cote, i) => chevalPourJsg(i + 1, i + 1, cote));
  const s = chevaux.reduce((acc, c) => acc + 1 / c.cotePourAffichage, 0); // 0,825
  const pool = { chevaux, n: 4, s, rendement: 1 / s };
  const mises = misesJeuSimpleGagnant(pool, 100);
  assert.equal(mises.length, 4);
  assert.deepEqual(mises.map((m) => m.mise), [41, 24, 20, 15]);
  for (const m of mises) assert.ok(Number.isInteger(m.mise)); // mises arrondies a l'euro
  assert.equal(mises.reduce((acc, m) => acc + m.mise, 0), 100); // la somme des mises vaut exactement M
  assert.deepEqual(mises.map((m) => m.gain), [123, 120, 120, 120]);
});

test('misesJeuSimpleGagnant: mise flat sur un pool a 1 seul cheval', () => {
  const chevaux = [chevalPourJsg(1, 1, 4.0)];
  const pool = { chevaux, n: 1, s: 1 / 4.0, rendement: 4.0 };
  const mises = misesJeuSimpleGagnant(pool, 100);
  assert.equal(mises.length, 1);
  assert.equal(mises[0].mise, 100);
  assert.equal(mises[0].gain, 400);
});

test('misesJeuSimpleGagnant: la somme des mises arrondies vaut toujours exactement la mise totale', () => {
  // Verifie la propriete generale (pas seulement l'exemple ci-dessus) sur
  // plusieurs pools/mises totales : l'arrondi "au plus fort reste" garantit
  // que l'ecart d'arrondi ne se perd jamais, quel que soit le nombre de
  // chevaux ou la mise totale choisie parmi les presets.
  const jeux = [
    [4, 7, 9].map((cote, i) => chevalPourJsg(i + 1, i + 1, cote)),
    [2.5, 3.2, 4.8, 5.5, 11].map((cote, i) => chevalPourJsg(i + 1, i + 1, cote))
  ];
  for (const chevaux of jeux) {
    const s = chevaux.reduce((acc, c) => acc + 1 / c.cotePourAffichage, 0);
    const pool = { chevaux, n: chevaux.length, s, rendement: 1 / s };
    for (const miseTotale of [10, 20, 30, 50, 75, 100, 150, 200]) {
      const mises = misesJeuSimpleGagnant(pool, miseTotale);
      assert.equal(mises.reduce((acc, m) => acc + m.mise, 0), miseTotale);
    }
  }
});

test('misesJeuSimpleGagnant: tableau vide si pool absent/vide ou mise totale invalide', () => {
  assert.deepEqual(misesJeuSimpleGagnant(null, 100), []);
  assert.deepEqual(misesJeuSimpleGagnant({ chevaux: [] }, 100), []);
  const chevaux = [3, 5].map((cote, i) => chevalPourJsg(i + 1, i + 1, cote));
  const s = chevaux.reduce((acc, c) => acc + 1 / c.cotePourAffichage, 0);
  const pool = { chevaux, n: 2, s, rendement: 1 / s };
  assert.deepEqual(misesJeuSimpleGagnant(pool, 0), []);
  assert.deepEqual(misesJeuSimpleGagnant(pool, -10), []);
});

// -------------------------------------------------------------------
// bilanJeuSimpleGagnant (bilan financier reel, page "Bilan Simple Gagnant")
// -------------------------------------------------------------------
test('bilanJeuSimpleGagnant: course ratee (vainqueur hors pool) -> mise perdue, sans besoin du rapport', () => {
  const chevaux = [chevalPourJsg(1, 1, 4.0), chevalPourJsg(2, 2, 6.0)];
  const jeu = jeuSimpleGagnant(chevaux); // rentable, recommande = rang1 seul (n°1)
  const bilan = bilanJeuSimpleGagnant(jeu.recommande, 100, undefined, 99); // numero 99 : hors pool
  assert.deepEqual(bilan, { mise: 100, gain: 0, net: -100, gagne: false, dividendeConnu: true });
});

test('bilanJeuSimpleGagnant: vainqueur dans le pool mais rapport pas encore recupere -> dividendeConnu false', () => {
  const chevaux = [chevalPourJsg(1, 1, 4.0), chevalPourJsg(2, 2, 6.0)];
  const jeu = jeuSimpleGagnant(chevaux);
  const bilan = bilanJeuSimpleGagnant(jeu.recommande, 100, undefined, 1);
  assert.equal(bilan.gagne, true);
  assert.equal(bilan.dividendeConnu, false);
  assert.equal(bilan.gain, 0);
  assert.equal(bilan.net, -100);
});

test('bilanJeuSimpleGagnant: vainqueur dans le pool mais dividende absent du rapport -> dividendeConnu false', () => {
  const chevaux = [chevalPourJsg(1, 1, 4.0), chevalPourJsg(2, 2, 6.0)];
  const jeu = jeuSimpleGagnant(chevaux);
  const rapport = [{ numero: 99, dividende: 12 }]; // ne concerne pas le vainqueur
  const bilan = bilanJeuSimpleGagnant(jeu.recommande, 100, rapport, 1);
  assert.equal(bilan.dividendeConnu, false);
});

test('bilanJeuSimpleGagnant: vainqueur dans le pool et dividende connu -> gain = mise du vainqueur x dividende reel', () => {
  const chevaux = [chevalPourJsg(1, 1, 4.0), chevalPourJsg(2, 2, 6.0)];
  const jeu = jeuSimpleGagnant(chevaux); // principal = rang1 seul (n°1)
  const mises = misesJeuSimpleGagnant(jeu.recommande, 100);
  const miseVainqueur = mises.find((m) => m.numero === 1);
  const rapport = [{ numero: 1, dividende: 4.2 }];
  const bilan = bilanJeuSimpleGagnant(jeu.recommande, 100, rapport, 1);
  assert.equal(bilan.dividendeConnu, true);
  assert.equal(bilan.gagne, true);
  approx(bilan.gain, miseVainqueur.mise * 4.2, 0.001);
  approx(bilan.net, miseVainqueur.mise * 4.2 - 100, 0.001);
});

test('bilanJeuSimpleGagnant: jeu non rentable -> traite comme rate (mise perdue)', () => {
  const bilan = bilanJeuSimpleGagnant(null, 50, undefined, 1);
  assert.deepEqual(bilan, { mise: 50, gain: 0, net: -50, gagne: false, dividendeConnu: true });
});

test('rendementBilan: gain/mise, null si mise nulle ou absente', () => {
  approx(rendementBilan({ mise: 100, gain: 121.2 }), 1.212, 0.001);
  assert.equal(rendementBilan({ mise: 0, gain: 0 }), null);
  assert.equal(rendementBilan(null), null);
  assert.equal(rendementBilan(undefined), null);
});

test('cumulerBilansJournaliers: trie par date croissante et cumule mise/gain/net jour apres jour', () => {
  // Fournis dans le desordre (comme ils pourraient arriver de la DB) pour
  // verifier que le tri par date est bien applique avant le cumul.
  const bilans = [
    { date: '2026-08-18', mise: 30, gain: 20, net: -10 },
    { date: '2026-08-16', mise: 40, gain: 60, net: 20 },
    { date: '2026-08-17', mise: 50, gain: 45, net: -5 }
  ];
  const cumul = cumulerBilansJournaliers(bilans);
  assert.deepEqual(cumul.map((c) => c.date), ['2026-08-16', '2026-08-17', '2026-08-18']);
  assert.deepEqual(cumul.map((c) => c.cumulNet), [20, 15, 5]);
  assert.deepEqual(cumul.map((c) => c.cumulMise), [40, 90, 120]);
  assert.deepEqual(cumul.map((c) => c.cumulGain), [60, 105, 125]);
  // Les champs d'origine restent inchanges sur chaque entree.
  assert.equal(cumul[0].mise, 40);
  assert.equal(cumul[2].net, -10);
});

test('cumulerBilansJournaliers: tableau vide -> tableau vide', () => {
  assert.deepEqual(cumulerBilansJournaliers([]), []);
  assert.deepEqual(cumulerBilansJournaliers(undefined), []);
});

// -------------------------------------------------------------------
// jeuCoupleTrioCroisement.js (Jeu Croisement Couple/Trio - R10/TG/OR/IdC)
// Indices RUBRIQUES : IdC=10, OR=12, TG=16, R10=17.
// -------------------------------------------------------------------
function chevalCroisement(numero, { r10, tg, or_, idc } = {}) {
  const rubriques = new Array(18).fill(null);
  if (r10 !== undefined) rubriques[17] = r10;
  if (tg !== undefined) rubriques[16] = tg;
  if (or_ !== undefined) rubriques[12] = or_;
  if (idc !== undefined) rubriques[10] = idc;
  return { entry: { numero, rubriques } };
}

test('combinaisons: C(n,k) usuel, 0 si k>n', () => {
  assert.equal(combinaisons(3, 2), 3);
  assert.equal(combinaisons(4, 3), 4);
  assert.equal(combinaisons(2, 3), 0);
  assert.equal(combinaisons(5, 0), 1);
});

test('memesNumeros: egalite ordre indifferent', () => {
  assert.equal(memesNumeros([4, 9], [9, 4]), true);
  assert.equal(memesNumeros([4, 9], [4, 8]), false);
  assert.equal(memesNumeros([4, 9], [4, 9, 1]), false);
});

test('estSousEnsemble: petit entierement contenu dans grand, ordre indifferent', () => {
  assert.equal(estSousEnsemble([9, 4], [4, 9, 13]), true);
  assert.equal(estSousEnsemble([9, 4], [4, 13, 12]), false);
  assert.equal(estSousEnsemble([], [1, 2]), true);
});

test('combinaisonsDuPool: toutes les paires/triplets, tries', () => {
  assert.deepEqual(combinaisonsDuPool([9, 4, 13], 2), [[4, 9], [4, 13], [9, 13]]);
  assert.deepEqual(combinaisonsDuPool([9, 4, 13, 2], 3), [[2, 4, 9], [2, 4, 13], [2, 9, 13], [4, 9, 13]]);
});

test('classementCroisement: score = nb de rubriques (parmi R10/TG/OR/IdC) ou le cheval est top-3, departage par somme des rangs', () => {
  // 6 chevaux, valeurs strictement distinctes par rubrique : R10/TG/OR
  // classent 1,2,4,5,3,6 (dans cet ordre) ; IdC classe 1,3,5,2,4,6 - de sorte
  // que le cheval 2 sorte du top-3 IdC (remplace par le cheval 5).
  const chevaux = [
    chevalCroisement(1, { r10: 10, tg: 10, or_: 10, idc: 10 }), // 1er partout -> score 4
    chevalCroisement(2, { r10: 9, tg: 9, or_: 9, idc: 1 }),     // top3 R10/TG/OR, hors top3 IdC -> score 3
    chevalCroisement(3, { r10: 2, tg: 2, or_: 2, idc: 9 }),     // top3 IdC seulement -> score 1
    chevalCroisement(4, { r10: 8, tg: 8, or_: 8, idc: 0.5 }),   // top3 R10/TG/OR -> score 3
    chevalCroisement(5, { r10: 7, tg: 7, or_: 7, idc: 8 }),     // top3 IdC seulement -> score 1
    chevalCroisement(6, { r10: 1, tg: 1, or_: 1, idc: 0.3 })    // jamais top3 -> score 0
  ];
  const classement = classementCroisement(chevaux);
  assert.equal(classement[0].numero, 1);
  assert.equal(classement[0].score, 4);
  assert.equal(classement[0].sommeRangs, 4); // rang 1 sur les 4 rubriques
  assert.equal(classement[1].numero, 2);
  assert.equal(classement[1].score, 3);
});

test('classementCroisement: valeur manquante -> rang de penalite (n+1), jamais avantage', () => {
  const chevaux = [
    chevalCroisement(1, { r10: 5, tg: 5, or_: 5, idc: 5 }),
    chevalCroisement(2, { r10: 4 }), // TG/OR/IdC absents
    chevalCroisement(3, { r10: 3, tg: 3, or_: 3, idc: 3 })
  ];
  const classement = classementCroisement(chevaux);
  const c2 = classement.find((c) => c.numero === 2);
  // Sur TG/OR/IdC (absents), penalite = n+1 = 4 chacun -> 12, + rang R10 (2e sur 3 = 2) = 14.
  assert.equal(c2.sommeRangs, 14);
  assert.equal(c2.score, 1); // top-3 sur R10 uniquement (seule rubrique ou il a une valeur)
});

test('jeuCoupleTrioCroisement: non jouable si moins de MIN_PARTANTS_CROISEMENT chevaux', () => {
  const chevaux = Array.from({ length: MIN_PARTANTS_CROISEMENT - 1 }, (_, i) => chevalCroisement(i + 1, { r10: i, tg: i, or_: i, idc: i }));
  assert.equal(jeuCoupleTrioCroisement(chevaux).jouable, false);
  assert.equal(jeuCoupleTrioCroisement([]).jouable, false);
});

test('jeuCoupleTrioCroisement: non jouable au-dela de MAX_PARTANTS_CROISEMENT (17 partants)', () => {
  const chevaux = Array.from({ length: MAX_PARTANTS_CROISEMENT + 1 }, (_, i) => chevalCroisement(i + 1, { r10: i, tg: i, or_: i, idc: i }));
  assert.equal(jeuCoupleTrioCroisement(chevaux).jouable, false);
});

test('jeuCoupleTrioCroisement: pool a taille VARIABLE = chevaux qualifies (score >= SEUIL_QUALIFICATION_CROISEMENT), pas un K fixe', () => {
  // 8 chevaux 8-16 partants, valeurs strictement decroissantes -> classement
  // 1..8 identique sur les 4 rubriques. Seuls les chevaux 1, 2, 3 ont un
  // score de 4 (top-3 partout) ; le cheval 4 (rang 4) a un score de 0.
  const chevaux = Array.from({ length: 8 }, (_, i) => chevalCroisement(i + 1, { r10: 8 - i, tg: 8 - i, or_: 8 - i, idc: 8 - i }));
  const jeu = jeuCoupleTrioCroisement(chevaux);
  assert.equal(jeu.jouable, true);
  // Groupe qualifie = chevaux 1,2,3 uniquement (score 4 >= seuil 3) - PAS un
  // pool fixe a 3 ou 4 chevaux complete par depart comme avant.
  assert.deepEqual(jeu.groupeQualifie.map((x) => x.numero), [1, 2, 3]);
  assert.equal(jeu.coupleJouable, true);
  assert.deepEqual(jeu.poolCouple, [1, 2, 3]);
  assert.equal(jeu.confianceCouple, 4);
  assert.equal(jeu.trioJouable, true); // exactement MIN_CHEVAUX_TRIO (3) qualifies
  assert.deepEqual(jeu.poolTrio, [1, 2, 3]);
  assert.equal(jeu.confianceTrio, 4);
});

test('jeuCoupleTrioCroisement: seulement 2 chevaux qualifies -> Couple jouable (1 combinaison), Trio non jouable', () => {
  // Seuls les chevaux 1 et 2 ont un score >= 3 (les autres sont dilues sur
  // des valeurs trop proches pour degager un accord net entre rubriques).
  const chevaux = [
    chevalCroisement(1, { r10: 10, tg: 10, or_: 10, idc: 10 }),
    chevalCroisement(2, { r10: 9, tg: 9, or_: 9, idc: 9 }),
    ...Array.from({ length: 6 }, (_, i) => chevalCroisement(i + 3, {})) // aucune valeur -> score 0
  ];
  const jeu = jeuCoupleTrioCroisement(chevaux);
  assert.equal(jeu.jouable, true);
  assert.equal(jeu.coupleJouable, true);
  assert.deepEqual(jeu.poolCouple, [1, 2]);
  assert.equal(jeu.confianceCouple, 4);
  assert.equal(jeu.trioJouable, false);
  assert.equal(jeu.poolTrio, null);
  assert.equal(jeu.confianceTrio, null);
});

test('jeuCoupleTrioCroisement: aucun cheval qualifie (score toujours < seuil) -> ni Couple ni Trio jouables', () => {
  // Toutes les valeurs egales -> tri stable, tout le monde "top-3" une seule
  // fois chacun en moyenne mais aucun accord net ; ici on force explicitement
  // des valeurs qui dispersent le score de sorte qu'aucun cheval n'atteigne 3.
  const chevaux = Array.from({ length: 8 }, (_, i) => chevalCroisement(i + 1, {
    r10: i % 4 === 0 ? 10 : null,
    tg: i % 4 === 1 ? 10 : null,
    or_: i % 4 === 2 ? 10 : null,
    idc: i % 4 === 3 ? 10 : null
  }));
  const jeu = jeuCoupleTrioCroisement(chevaux);
  assert.equal(jeu.coupleJouable, false);
  assert.equal(jeu.trioJouable, false);
  assert.equal(jeu.jouable, false);
});

test('jeuCoupleTrioCroisement: le groupe qualifie peut atteindre 4 chevaux (maximum mathematique avec nbTop=3 sur 4 rubriques) - PLAFOND_POOL_CROISEMENT couvre exactement ce cas', () => {
  // 4 chevaux, chacun top-3 dans exactement 3 des 4 rubriques (une rubrique
  // differente exclue a chaque fois) -> score=3 chacun, tous qualifies.
  // Avec nbTop=3 sur 4 rubriques (12 "places" au total), il est
  // mathematiquement impossible qu'un 5e cheval atteigne aussi un score >= 3
  // (il faudrait 15 places) : PLAFOND_POOL_CROISEMENT=4 n'est donc jamais
  // depasse en pratique, ce test verifie qu'il est bien ATTEINT dans ce cas
  // limite plutot que tronque a un nombre plus bas par erreur.
  const chevaux = [
    chevalCroisement(1, { r10: 10, tg: 10, or_: 10, idc: 1 }),
    chevalCroisement(2, { r10: 9, tg: 9, or_: 1, idc: 10 }),
    chevalCroisement(3, { r10: 8, tg: 1, or_: 9, idc: 9 }),
    chevalCroisement(4, { r10: 1, tg: 8, or_: 8, idc: 8 }),
    ...Array.from({ length: 4 }, (_, i) => chevalCroisement(i + 5, {}))
  ];
  const jeu = jeuCoupleTrioCroisement(chevaux);
  assert.equal(jeu.groupeQualifie.length, PLAFOND_POOL_CROISEMENT);
  assert.equal(jeu.poolTrio.length, PLAFOND_POOL_CROISEMENT);
  assert.deepEqual(jeu.groupeQualifie.map((x) => x.numero).sort(), [1, 2, 3, 4]);
});

function jeuFictifCroisement({ coupleJouable = true, poolCouple = null, trioJouable = true, poolTrio = null } = {}) {
  return { jouable: coupleJouable || trioJouable, coupleJouable, poolCouple, trioJouable, poolTrio };
}

test('bilanCoupleCroisement: Couple non jouable pour cette course -> AUCUNE mise engagee (mise=0, net=0)', () => {
  const bilan = bilanCoupleCroisement(jeuFictifCroisement({ coupleJouable: false, poolCouple: null }), 1, [1, 2, 3], undefined);
  assert.equal(bilan.mise, 0);
  assert.equal(bilan.gain, 0);
  assert.equal(bilan.net, 0);
  assert.equal(bilan.gagne, false);
  assert.equal(bilan.dividendeConnu, true);
});

test('bilanCoupleCroisement: mise proportionnelle au NOMBRE REEL de chevaux du pool (variable)', () => {
  // Pool de 2 chevaux -> 1 seule combinaison (pas 3 comme avant).
  const jeu2 = jeuFictifCroisement({ poolCouple: [4, 9] });
  assert.equal(bilanCoupleCroisement(jeu2, 5, [1, 2], undefined).mise, 5); // 1 combo x 5e
  // Pool de 3 chevaux -> 3 combinaisons.
  const jeu3 = jeuFictifCroisement({ poolCouple: [4, 9, 13] });
  assert.equal(bilanCoupleCroisement(jeu3, 5, [1, 2], undefined).mise, 15); // 3 combos x 5e
});

test('bilanCoupleCroisement: arrivee inconnue -> gagne null, dividendeConnu false', () => {
  const jeu = jeuFictifCroisement({ poolCouple: [4, 9, 13] });
  const bilan = bilanCoupleCroisement(jeu, 1, undefined, undefined);
  assert.equal(bilan.gagne, null);
  assert.equal(bilan.dividendeConnu, false);
  assert.equal(bilan.mise, 3);
});

test('bilanCoupleCroisement: vainqueur/2e hors pool -> rate, sans besoin de rapport', () => {
  const jeu = jeuFictifCroisement({ poolCouple: [4, 9, 13] });
  const bilan = bilanCoupleCroisement(jeu, 1, [1, 5, 9], undefined);
  assert.equal(bilan.gagne, false);
  assert.equal(bilan.dividendeConnu, true);
  assert.equal(bilan.net, -3);
});

test('bilanCoupleCroisement: top2 dans le pool mais rapport pas encore recupere -> dividendeConnu false', () => {
  const jeu = jeuFictifCroisement({ poolCouple: [4, 9, 13] });
  const bilan = bilanCoupleCroisement(jeu, 1, [9, 4, 1], undefined);
  assert.equal(bilan.gagne, true);
  assert.equal(bilan.dividendeConnu, false);
});

test('bilanCoupleCroisement: top2 dans le pool et dividende reel connu -> gain = mise x dividende', () => {
  const jeu = jeuFictifCroisement({ poolCouple: [4, 9, 13] });
  const rapport = [{ numeros: [9, 4], dividende: 22.10 }];
  const bilan = bilanCoupleCroisement(jeu, 2, [9, 4, 1], rapport);
  assert.equal(bilan.mise, 6); // 3 combinaisons x 2e
  approx(bilan.gain, 44.20, 0.001);
  approx(bilan.net, 38.20, 0.001);
  assert.equal(bilan.dividendeConnu, true);
});

test('bilanTrioCroisement: Trio non jouable pour cette course -> AUCUNE mise engagee', () => {
  const bilan = bilanTrioCroisement(jeuFictifCroisement({ trioJouable: false, poolTrio: null }), 1, [1, 2, 3], undefined);
  assert.equal(bilan.mise, 0);
  assert.equal(bilan.net, 0);
  assert.equal(bilan.gagne, false);
  assert.equal(bilan.dividendeConnu, true);
});

test('bilanTrioCroisement: mise proportionnelle au NOMBRE REEL de chevaux du pool (variable)', () => {
  // Pool de 3 chevaux -> 1 seule combinaison (pas 4 comme avant).
  const jeu3 = jeuFictifCroisement({ poolTrio: [4, 9, 13] });
  assert.equal(bilanTrioCroisement(jeu3, 2, [4, 9, 13], undefined).mise, 2); // 1 combo x 2e
  // Pool de 4 chevaux -> 4 combinaisons.
  const jeu4 = jeuFictifCroisement({ poolTrio: [4, 9, 13, 2] });
  assert.equal(bilanTrioCroisement(jeu4, 2, [4, 9, 13], undefined).mise, 8); // 4 combos x 2e
});

test('bilanTrioCroisement: top3 dans le pool et dividende reel connu -> gain = mise x dividende (4 combinaisons)', () => {
  const jeu = jeuFictifCroisement({ poolTrio: [4, 9, 13, 2] });
  const rapport = [{ numeros: [4, 9, 13], dividende: 48.00 }];
  const bilan = bilanTrioCroisement(jeu, 1, [9, 13, 4], rapport);
  assert.equal(bilan.mise, 4); // C(4,3) = 4 combinaisons
  assert.equal(bilan.gagne, true);
  approx(bilan.gain, 48.00, 0.001);
  approx(bilan.net, 44.00, 0.001);
});

test('bilanTrioCroisement: un seul des 3 premiers hors pool -> rate', () => {
  const jeu = jeuFictifCroisement({ poolTrio: [4, 9, 13, 2] });
  const bilan = bilanTrioCroisement(jeu, 1, [9, 13, 99], undefined);
  assert.equal(bilan.gagne, false);
  assert.equal(bilan.dividendeConnu, true);
  assert.equal(bilan.net, -4);
});

// -------------------------------------------------------------------
// surveillance.js (surveillance auto Jeu Simple Gagnant, H-3min)
// -------------------------------------------------------------------
test('minutesDepuisMinuit: parse les formats HHhMM/HH:MM/HH.MM et une Date', () => {
  assert.equal(minutesDepuisMinuit('10h59'), 659);
  assert.equal(minutesDepuisMinuit('10:59'), 659);
  assert.equal(minutesDepuisMinuit('10.59'), 659);
  assert.equal(minutesDepuisMinuit('0h05'), 5);
  assert.equal(minutesDepuisMinuit(new Date(2026, 7, 17, 14, 30)), 14 * 60 + 30);
});

test('minutesDepuisMinuit: renvoie null si non reconnu/absent', () => {
  assert.equal(minutesDepuisMinuit(''), null);
  assert.equal(minutesDepuisMinuit(null), null);
  assert.equal(minutesDepuisMinuit('abc'), null);
  assert.equal(minutesDepuisMinuit('25h99'), null);
});

test('estDansFenetreAvantDepart: vrai entre 0 et 3 minutes avant le depart', () => {
  const depart = '14h30';
  assert.equal(estDansFenetreAvantDepart(depart, new Date(2026, 7, 17, 14, 27), 3), true); // exactement 3 min avant
  assert.equal(estDansFenetreAvantDepart(depart, new Date(2026, 7, 17, 14, 28), 3), true);
  assert.equal(estDansFenetreAvantDepart(depart, new Date(2026, 7, 17, 14, 30), 3), true); // au moment du depart
});

test('estDansFenetreAvantDepart: faux en dehors de la fenetre (trop tot, deja parti, heure absente)', () => {
  const depart = '14h30';
  assert.equal(estDansFenetreAvantDepart(depart, new Date(2026, 7, 17, 14, 26), 3), false); // 4 min avant : trop tot
  assert.equal(estDansFenetreAvantDepart(depart, new Date(2026, 7, 17, 14, 31), 3), false); // course deja partie
  assert.equal(estDansFenetreAvantDepart('', new Date(2026, 7, 17, 14, 28), 3), false);
  assert.equal(estDansFenetreAvantDepart(null, new Date(2026, 7, 17, 14, 28), 3), false);
});

test('estAujourdHui: compare uniquement le jour civil (heure locale)', () => {
  const maintenant = new Date(2026, 7, 17, 15, 0);
  assert.equal(estAujourdHui(new Date(2026, 7, 17, 3, 0).toISOString(), maintenant), true);
  assert.equal(estAujourdHui(new Date(2026, 7, 16, 23, 59).toISOString(), maintenant), false);
  assert.equal(estAujourdHui('date-invalide', maintenant), false);
});
