// =============================================================================
// jeuSimpleGagnant.js
// "Jeu Simple Gagnant" (v16, aout 2026) : parmi les 2 PREMIERS du classement
// Score Global (top2, reduit du top3 depuis v15 - voir plus bas), on retient
// celui qui a le meilleur `scoreAptitude`, via DEUX sources de cote
// possibles :
//
//   Course a un hippodrome de `HIPPODROMES_EXCLUS_SIMPLE_GAGNANT` : jeu
//   desactive d'office (v14, voir plus bas).
//   Sinon, parmi les candidats du top2 dont la cote DIRECTE > 3,8 : celui au
//   meilleur scoreAptitude qualifie si ce scoreAptitude >= 85 ET son
//   scoreForme >= 70 (v14) ET son score Croisement (R10/TG/OR/IdC) <= 3
//   (v16, voir plus bas).
//   Sinon (aucun candidat direct ne qualifie), parmi les candidats du top2
//   dont la cote 8H > 3,8 : celui au meilleur scoreAptitude qualifie si son
//   scoreAptitude >= 85 ET son scoreForme >= 70 (v14) ET son ecart de Score
//   Global sur l'AUTRE candidat du top2 est >= 15 ET son score Croisement
//   <= 3 (v16).
//
// La cote DIRECTE reste toujours prioritaire des qu'un candidat qualifie.
// Le candidat retenu n'est plus forcement le rang 1 (voir v13 ci-dessous) -
// c'est desormais l'UNIQUE alternative de la page (le mode "Cheval value
// seul" sur les rangs 2/4/5, et sa condition de score Croisement R10/TG/OR/IdC,
// ont ete retires anterieurement - a la demande de l'utilisateur, aout
// 2026 - le score Croisement est REINTRODUIT en v16 mais sous une forme
// differente : filtre du candidat retenu par le pool top2, pas condition
// du mode "Cheval value seul" desormais disparu). Le paiement/gain reel
// reste toujours base sur la cote la plus a jour disponible
// (`cotePourAffichage`, priorite a la cote directe) au moment du calcul -
// seul le SEUIL DE SELECTION change de source entre les deux modes,
// conformement a la mecanique du pari mutuel PMU (le dividende depend du
// pool a la fermeture des paris, pas de l'heure a laquelle on selectionne
// le cheval - deja verifie sur echantillon reel, voir HEBERGEMENT.md).
//
// *** v16 (aout 2026, a la demande de l'utilisateur) : exclusion des
// candidats "score Croisement = 4" ***
// Suite a une question de l'utilisateur sur les 4 rubriques R10/TG/OR/IdC
// (deja identifiees en v9, voir plus bas - mode desormais disparu), le
// score Croisement (0 a 4, `classementCroisement()` de
// jeuCoupleTrioCroisement.js - nombre de rubriques parmi R10/TG/OR/IdC ou
// le cheval figure dans le top3 du champ) a ete recalcule pour le cheval
// RETENU par le pool v15 actuel, sur l'archive complete (417 fichiers) :
//   score=0 : 164,0% de rendement (n=105) ; score=1 : 127,5% (n=176) ;
//   score=2 : 150,6% (n=249) ; score=3 : 124,1% (n=354) ; score=4 : 105,1%
//   (n=381) - gradient pas parfaitement lisse mais nette rupture entre
//   score=4 (30% du volume, a peine rentable) et le reste.
// Mecanisme identifie : le score Croisement n'apporte PAS d'information
// nouvelle sur la qualite du cheval (scoreAptitude/scoreForme moyens
// quasi identiques, 93 a 96, quel que soit le score) - c'est surtout un
// indicateur indirect du resserrement de la cote (cote moyenne payee :
// 7,70 a score=0, jusqu'a 3,43 a score=4) et il recoupe fortement le mode
// 8h (deja identifie plus faible : 64% des score=4 sont en mode 8h, contre
// 22% pour score<=3). Neanmoins l'effet PERSISTE a l'interieur de CHAQUE
// mode pris separement (directe : 144,7% a score<=3 contre 113,4% a
// score=4 ; 8h : 108,8% contre 100,3%) - pas un simple doublon du mode.
// Seuils testes : score<=1 et score<=2 tentants sur le rendement brut
// (141,1%/145,6%) mais ECHOUENT au test de robustesse (s'effondrent a
// 52,6%/93,4% en retirant seulement les 30 plus gros gains - trop
// concentres sur une poignee de grosses cotes) - ECARTES. Seul score<=3
// (exclusion du seul score=4) tient : n=884 (70% du volume v15), rendement
// 137,0% (contre 127,4% sans filtre), robuste a 105,9% apres retrait des
// 30 plus gros gains, et bat le pool v15 SANS EXCEPTION sur 3 periodes
// chronologiques independantes testees separement (156,0%/132,7%/122,4%
// contre 142,2%/130,3%/111,7%) - retenu, seuil <=3
// (`SEUIL_SCORE_CROISEMENT_MAX`).
// Implementation : apres avoir determine le candidat retenu par la logique
// v15 (top2 + scoreAptitude/scoreForme/ecart, priorite cote directe), son
// score Croisement (calcule sur l'ensemble du champ de la course, pas
// seulement le top2) est verifie EN DERNIER lieu ; s'il depasse 3, le jeu
// devient non rentable d'office - PAS de repli sur l'autre mode (le
// candidat retenu par la cote 8h n'est pas re-teste si le candidat cote
// directe est rejete pour score Croisement, conformement a la methode de
// backtest qui a valide ce filtre). Un cheval sans rubriques exploitables
// obtient un score de 0 par defaut (defensif) et qualifie donc toujours.
//
// *** v15 (aout 2026, a la demande de l'utilisateur) : reduction du pool
// top3 -> top2 ***
// Suite a une question de l'utilisateur sur un cas concret (course non
// selectionnee alors qu'un cheval de rang 5 semblait meilleur en score), la
// couverture du vrai vainqueur par rang de classement a ete recalculee sur
// l'archive complete (courses cote>3,8) : rang1 seul 11,9% (directe)/24,8%
// (8h), top3 41,8%/57,4%, top5 67,3%/76,7%. Deux tailles de pool
// alternatives au top3 ont ete testees avec le moteur reel :
//  - top5 (rangs 1 a 5) : ECHEC, rendement en baisse (113,5% contre 123,6%
//    pour top3), robustesse en baisse (89,2% contre 102,1% apres retrait des
//    30 plus gros gains), stabilite mensuelle en baisse (9/14 contre 12/14
//    mois >100%). Les selections marginales de rang 4/5 (celles qu'ajoute le
//    top5 par rapport au top3) sont nettement faibles isolement (6,4% a 7,1%
//    de reussite) - abandonne, non implemente.
//  - top2 (rangs 1 a 2 uniquement) : SUCCES, rendement en hausse (127,4%
//    contre 123,6% pour top3, n=1265 contre 1365), robustesse en hausse
//    (105,6% contre 102,1% apres retrait des 30 plus gros gains), reussite
//    en hausse (31,6% contre 28,8%). Stabilite mensuelle legerement en
//    retrait en nombre de mois (11/14 contre 12/14 >100%) mais avec une
//    moyenne mensuelle plus elevee. Les selections marginales de rang 3
//    (celles que le top3 avait en plus du top2) sont faibles isolement
//    (13,0% de reussite, 98,1% de rendement, s'effondre a 3,1% apres retrait
//    des 30 plus gros gains) - confirme que le rang 3 n'apportait pas de
//    valeur nette et diluait plutot la performance du pool. Retenu : le pool
//    passe de top3 a top2 (`classement` 1 a 2 uniquement), memes seuils
//    scoreAptitude/scoreForme/hippodromes exclus qu'en v14. RE-VERIFIE avec
//    la fonction `jeuSimpleGagnant()` de production sur l'archive complete.
//
// *** v14 (aout 2026, a la demande de l'utilisateur) : filtre scoreForme +
// exclusion d'hippodromes non rentables ***
// Suite a v13 (108,5% de rendement sur l'archive complete, 2377 selections),
// deux pistes ont ete demandees pour ameliorer le rendement, testees sur la
// meme archive complete (417 fichiers) :
//  - Ecart de `scoreAptitude` entre le candidat retenu et le meilleur des 2
//    autres du top3 (en plus du seuil >=85 deja en place) : NEUTRE, aucune
//    tendance monotone ni gain de robustesse quel que soit le seuil teste
//    (0 a 40) - abandonne, non implemente.
//  - Recherche systematique d'un signal composite (meme demarche que celle
//    qui a trouve `scoreAptitude` en v12) sur TOUS les sous-scores honnetes
//    du candidat retenu : `scoreConditions`, `scoreConditionsSimilaires`,
//    `scoreRubriques` et `nbCourses` ne discriminent pas (ecart gagnant/
//    perdant quasi nul). `scoreCote` montre un ecart de profil (+8,7 pts)
//    mais NE TIENT PAS en filtre reel (rendement plat 106-110% quel que
//    soit le seuil, pas d'amelioration nette) - abandonne. Seul `scoreForme`
//    montre un vrai signal : gradient MONOTONE et DE PLUS EN PLUS ROBUSTE
//    avec le seuil (109,7% a scoreForme>=50, jusqu'a 116,6% a >=80, robuste
//    a 99,8% apres retrait des 30 plus gros gains contre 95,8% a >=50) -
//    retenu, seuil >=70 (`SEUIL_SCORE_FORME_RANG1`).
//  - Segmentation par discipline / nombre de partants / hippodrome du pool
//    v13 complet (2377 selections) : discipline et nombre de partants ne
//    differencient pas nettement (rendement 99-118% selon la tranche, pas
//    de veritable rupture). L'hippodrome, en revanche, montre une nette
//    disparite : sur 46 hippodromes avec un echantillon suffisant (n>=15),
//    18 ressortent structurellement NON rentables (rendement <100%, de
//    14,1% a Meslay du Maine a 90,3% a Mons) - retenus pour EXCLUSION FERME
//    (`HIPPODROMES_EXCLUS_SIMPLE_GAGNANT`), contrairement a l'ancien warning
//    purement informatif de v11 (voir plus bas, desormais retire : liste
//    obsolete, calibree uniquement sur l'ancien mode 8h avant l'elargissement
//    au top3, et partiellement contradictoire avec le nouveau constat -
//    CLAIREFONTAINE DEAUVILLE, qu'elle signalait, s'avere en realite tres
//    rentable, 178,1%, sur le pool v13 actuel).
// Combinees (hippodromes exclus + scoreForme>=70) : n=1350 (57% du volume
// v13, contre 2377), rendement 123,9% (contre 108,5%), robuste a 102,3%
// apres retrait des 30 plus gros gains (contre 95,1% pour v13 sans filtre),
// stable sur 12 des 14 mois de l'archive (meme mauvais mois - juin 2026 -
// qu'a chaque version precedente, effet de marche general). Mode cote
// directe : 970 courses a 132,3% ; mode cote 8h : 380 courses a 102,7%
// (plus modeste mais toujours positif). RE-VERIFIE avec la fonction
// `jeuSimpleGagnant()` de production (pas le script ad-hoc du backtest
// initial) sur l'archive complete : n=1365, rendement 123,6% - concordance
// confirmee (leger ecart de n du a l'ordre d'iteration des egalites de
// scoreAptitude entre les deux scripts, sans impact sur la conclusion).
//
// *** v13 (aout 2026, a la demande de l'utilisateur) : elargissement du
// candidat au top3 (au lieu du rang 1 seul) ***
// Constat de depart (verifie sur l'archive complete, 417 fichiers/12121
// courses cote>3,8, classement honnete post-correctif fuite - voir v12
// ci-dessous) : le vrai vainqueur est dans le top3 du classement honnete
// 51,8% du temps en cote directe et 58,8% en cote 8h (contre 15,9%/35,7%
// pour le rang 1 seul) - donc se limiter au rang 1 laisse volontairement de
// cote une bonne partie des victoires potentiellement atteignables.
// Plusieurs methodes de DEPARTAGE entre les 3 candidats ont ete testees :
//  - Injection d'une victoire fictive tour a tour dans chacun des top3,
//    parier sur celui dont le score injecte est le plus eleve : ECHEC (le
//    vrai vainqueur ne ressort en tete qu'1 fois sur 3, pas mieux que le
//    hasard - 82,7%/83,9% de rendement, MOINS bon que le rang1 seul).
//  - `scoreAptitude` (meme critere honnete que v12), applique au meilleur
//    candidat du top3 plutot qu'au rang 1 seul : SUCCES. Compare a la
//    production v12 (rang1 seul, aptitude>=85) sur la meme archive :
//    v12 = n=1603, 32,6% reussite, 112,0% rendement, robuste a 96,3% apres
//    retrait des 30 plus gros gains ; v13 (top3) = n=2172 (+35,5% de
//    volume), 26,3% reussite, 108,4% rendement, robuste a 94,5%. Les 718
//    courses ou le choix bascule sur le rang2/rang3 (car le rang1 ne
//    passait pas le filtre aptitude) rapportent a elles seules 104,7% de
//    rendement (16,7% reussite) - un vrai ajout de valeur, pas juste du
//    volume dilue. Stabilite mensuelle comparable a v12 (11/14 mois >100%,
//    meme mauvais mois - juin 2026 - sur les deux versions, effet de marche
//    general et non un defaut de la methode).
//  - Tentative de "confirmation" du candidat choisi (injection d'une
//    victoire fictive dans SON historique, exige un ecart >10 sur le
//    meilleur score honnete des 2 autres candidats du top3) : ECHEC et
//    CONTRE-PRODUCTIF. Sur le pool top3+aptitude (n=2172, 108,4%), la
//    confirmation ne retient que 1356 courses a 103,7% (robuste a
//    seulement 88,0%), et les 816 courses REJETEES par la confirmation
//    font en realite MIEUX (116,2%) que celles retenues - preuve que le
//    signal d'injection est inverse au signal utile, comme dans toutes les
//    autres tentatives d'injection testees (v12, voir plus bas). Cette
//    piste n'est PAS implementee.
// Seul `scoreAptitude` applique au top3 (sans confirmation par injection)
// est donc retenu pour v13.
//
// *** v12 (aout 2026) : correctif fuite de donnees + remplacement du filtre
// d'ecart par scoreAptitude (rang1 seul, avant l'elargissement au top3) ***
// Un bug a ete identifie et corrige dans `historiquePour()`
// (`js/engine/csvImporter.js`) : l'historique utilise pour calculer le
// score d'un cheval incluait, par erreur, sa propre performance du jour
// meme (deja connue dans les fichiers d'archive au moment du calcul). Cette
// fuite gonflait artificiellement le score du vainqueur reel (et deprimait
// celui des perdants), ce qui explique les chiffres tres eleves des
// versions precedentes (190,3% / 132,8% cites plus haut dans l'historique -
// CES CHIFFRES ETAIENT UN ARTEFACT DU BUG, pas un edge reel). Une fois le
// bug corrige, le rendement honnete du rang 1 seul tombe a ~91,8% (cote
// directe) / ~88,5% (cote 8h) sur l'archive complete, et l'ancien filtre
// d'ecart de Score Global (qui n'apportait sa valeur QUE via la fuite) ne
// separe plus rien de robuste une fois la fuite corrigee (verifie par
// tranches + retrait des plus gros gains). `scoreAptitude` (adequation aux
// conditions du jour - distance, terrain, hippodrome) a alors ete identifie
// comme le seul critere honnete a la fois discriminant ET robuste,
// remplacant l'ecart en cote directe et s'y ajoutant en cote 8h. D'autres
// pistes honnetes ont ete testees et rejetees a cette etape : injection de
// victoire/place fictive (simple et double), confirmation par injection sur
// le top 8 du classement. Voir HEBERGEMENT.md pour le detail complet.
//
// Historique (versions anterieures a v12) :
// *** v8 (aout 2026) *** : ajout de la condition d'ecart de Score Global
// (>=10, SEUIL_ECART_SCORE_RANG1) pour que le rang 1 qualifie en cote
// directe. Backtest reel (8 mois, rang1 cote > 3,8) : sans condition
// d'ecart, 164,0% de rendement (3274 courses) ; avec l'ecart >= 10, 1058
// courses mais reussite 27,4% -> 35,7% et rendement 201,1% - ROBUSTE
// (157,6% meme en retirant les 50 plus gros gains).
// *** v9 (aout 2026, RETIRE en v10) *** : mode "Cheval value seul" sur les
// rangs 2/4/5 (chacun rentable isolement, 103,2% a 112,5%), avec condition
// de score Croisement (R10/TG/OR/IdC) <=1 pour qualifier. Retire a la
// demande de l'utilisateur et remplace par "1er du classement 8h" (voir
// HEBERGEMENT.md pour le detail de la transition).
// *** v10 (aout 2026, a la demande de l'utilisateur) *** : suppression du
// mode "Cheval value seul", remplace par "1er du classement 8h" (memes
// seuils/ecart que le rang 1 en cote directe, source de cote 8h).
// *** v11 (aout 2026, a la demande de l'utilisateur) *** : seuil d'ecart
// releve de 10 a 15 (SEUIL_ECART_SCORE_RANG1_8H) pour le mode "1er du
// classement 8h" UNIQUEMENT (le mode cote directe garde son seuil de 10).
// Constat : la tranche d'ecart 10-15 etait a peine rentable en 8h (103,4%,
// n=944/3006) - retirer cette tranche degage un rendement plus solide sur le
// reste. Verifie sur l'archive complete (413 fichiers) via le moteur reel
// (jeu.mode8h) : n=2048 (contre 3006, -32% de courses jouees), rendement
// flat 133,6% (contre 124,3%), drawdown max 1,85% de la mise totale (contre
// 1,9%). Combine a la mise par palier d'ecart (voir plus bas) : rendement
// 135,9%, drawdown 1,65%. Le mode cote directe (seuil 10 inchange, 2133
// courses, 190,3%) n'est pas affecte.
//
// *** Mise par palier d'ecart (aout 2026, a la demande de l'utilisateur) ***
// : pour les DEUX modes ci-dessus (rang 1, cote directe OU 8h), mise
// optionnelle PONDEREE par l'ecart de Score Global (rang1 vs rang2) plutot
// que flat. Teste par l'utilisateur sur les 2133 courses "cote directe" de
// l'archive complete (mise de base = 1 unite) : x1 si ecart <20, x1,5 si
// 20<=ecart<30, x2 si ecart>=30 -> net total 2332,2 unites contre 1925,9 en
// mise flat, soit +21,1% de rendement, pour un risque quasiment identique
// (drawdown max 1,45% contre 1,5% en flat, capital min 996,80 contre 994,40
// sur capital de depart 1000). A la difference des mises en % du capital
// (testees et ECARTEES - voir HEBERGEMENT.md : drawdown 15% a 56% pour un
// gain theorique non exploitable car explosif/non plafonne), cette mise
// reste a UNITE FIXE par palier (pas de reinjection des gains), donc sans
// risque de derive. Optionnelle (case a cocher), desactivee par defaut.
//
// *** Warning hippodrome non rentable en cote 8h (aout 2026, RETIRE en v14) ***
// : backtest par hippodrome du mode "1er du classement
// 8h" (seuil d'ecart 15, archive complete 413 fichiers, n=2048). Sur les 68
// hippodromes couverts, 3 ressortent NON rentables (rendement <100%) avec un
// echantillon jugE suffisant (n>=15, seuil de prudence deja utilise ailleurs
// dans l'appli) : CLAIREFONTAINE DEAUVILLE (n=30, 65,3%), MESLAY DU MAINE
// (n=25, 90,0%), BEAUMONT DE LOMAGNE (n=18, 84,4%). Les hippodromes avec
// n<15 ne sont volontairement PAS inclus (echantillon trop faible pour
// conclure, cf. CAVAILLON n=12/97,5%, tout juste sous 100% mais non
// significatif). Le warning est purement informatif : il n'empeche pas de
// jouer, il signale juste un historique defavorable a CET hippodrome
// specifiquement pour LE MODE 8H (le mode cote directe n'est pas concerne).
// =============================================================================

import { classementCroisement } from './jeuCoupleTrioCroisement.js';

export const SEUILS_VALUE_RANG_SIMPLE_GAGNANT = { 1: 3.8 };
export const SEUIL_ECART_SCORE_RANG1 = 10;
export const SEUIL_ECART_SCORE_RANG1_8H = 15;
// Seuil de scoreAptitude (rang1) introduit en v12 (aout 2026) - remplace le
// filtre d'ecart en cote directe, s'ajoute a l'ecart en cote 8h. Voir
// commentaire d'en-tete pour le detail du backtest honnete (post-correctif
// fuite de donnees) qui justifie ce seuil.
export const SEUIL_SCORE_APTITUDE_RANG1 = 85;
// Seuil de scoreForme introduit en v14 (aout 2026) - deuxieme sous-score
// honnete retenu apres recherche systematique sur TOUS les sous-scores
// (profil candidat gagnant vs perdant, top3 cote>3,8) : seul scoreForme
// montre un gradient monotone et de plus en plus robuste avec le seuil,
// contrairement a scoreConditions/scoreSimilaire/scoreRubriques/nbCourses
// (aucun signal) et scoreCote (signal en profil mais ne tient pas en
// filtre reel, teste et ecarte). Voir commentaire d'en-tete pour le detail.
export const SEUIL_SCORE_FORME_RANG1 = 70;

// Hippodromes identifies structurellement NON rentables sur le pool complet
// v13 (top3 + scoreAptitude, cote directe ET 8h confondues), avec un
// echantillon >=15 courses (v14, aout 2026 - voir commentaire d'en-tete).
// Remplace l'ancienne liste `HIPPODROMES_NON_RENTABLES_8H` (calibree
// uniquement sur l'ancien mode "1er du classement 8h" avant l'elargissement
// au top3), devenue obsolete et partiellement contradictoire (un hippodrome
// qu'elle signalait, CLAIREFONTAINE DEAUVILLE, s'avere en realite tres
// rentable sur le pool v13 actuel). Ici, EXCLUSION FERME (contrairement a
// l'ancien warning purement informatif) : une course a l'un de ces
// hippodromes n'est jamais proposee, quel que soit le mode. Noms tels que
// fournis par les CSV (majuscules, sans accents).
export const HIPPODROMES_EXCLUS_SIMPLE_GAGNANT = [
  'LISIEUX', 'PORNICHET LA BAULE', 'DEAUVILLE', 'CAGNES SUR MER',
  'SAINT CLOUD', 'BEAUMONT DE LOMAGNE', 'COMPIEGNE', 'CHATEAUBRIANT',
  'MESLAY DU MAINE', 'MONS', 'ARGENTAN', 'STRASBOURG', 'REIMS', 'CAEN',
  'ROUEN MAUQUENCHY', 'NANTES', 'ANGERS', 'MARSEILLE VIVAUX'
];

/**
 * @param {string|null|undefined} hippodrome - nom brut (`race.lieu`/`context.lieu`).
 * @returns {boolean} true si cet hippodrome fait partie de la liste
 *   `HIPPODROMES_EXCLUS_SIMPLE_GAGNANT` (comparaison insensible a la casse
 *   et aux espaces superflus).
 */
export function estHippodromeExclu(hippodrome) {
  if (!hippodrome) return false;
  const norm = String(hippodrome).trim().toUpperCase();
  return HIPPODROMES_EXCLUS_SIMPLE_GAGNANT.includes(norm);
}

// Seuil maximal de score Croisement (0-4, R10/TG/OR/IdC) introduit en v16
// (aout 2026) - le candidat retenu par la logique top2/scoreAptitude/
// scoreForme n'est finalement propose que si son score Croisement (calcule
// via `classementCroisement()` sur l'ENSEMBLE du champ) ne depasse pas ce
// seuil. Voir commentaire d'en-tete pour le detail du backtest (score=4
// nettement plus faible, 105,1% de rendement contre 137,0% pour score<=3,
// effet qui persiste a l'interieur de chaque mode pris separement).
export const SEUIL_SCORE_CROISEMENT_MAX = 3;

export const MISES_PRESETS_JEU_SIMPLE_GAGNANT = [10, 20, 30, 50, 75, 100, 150, 200];

// Paliers de mise ponderee par ecart de Score Global (rang1 seul, voir
// commentaire d'en-tete). Parcourus dans l'ordre : le dernier palier dont le
// seuil est atteint l'emporte.
export const PALIERS_MISE_ECART_RANG1 = [
  { seuil: 0, multiplicateur: 1 },
  { seuil: 20, multiplicateur: 1.5 },
  { seuil: 30, multiplicateur: 2 }
];

/**
 * Multiplicateur de mise applicable au cheval retenu par `jeuSimpleGagnant`
 * (rang 1 ou 2 depuis v15, rang 1/2/3 en v13-v14) selon son ecart de Score
 * Global sur l'autre candidat du top2 (`jeu.ecartScoreRang1`) - voir
 * `PALIERS_MISE_ECART_RANG1` et le commentaire d'en-tete du fichier.
 * @param {number} ecartScore
 * @returns {number} 1, 1.5 ou 2.
 */
export function multiplicateurMiseEcartRang1(ecartScore) {
  let mult = 1;
  if (typeof ecartScore !== 'number' || Number.isNaN(ecartScore)) return mult;
  for (const p of PALIERS_MISE_ECART_RANG1) {
    if (ecartScore >= p.seuil) mult = p.multiplicateur;
  }
  return mult;
}

/**
 * Construit un pool Dutching (mise proportionnelle a 1/cote) a partir d'une
 * liste de chevaux (elements de result.chevaux, avec `.cotePourAffichage`).
 * @param {Array} pool
 * @returns {{chevaux:Array, n:number, s:number, rendement:number}}
 */
function poolDutching(pool) {
  const s = pool.reduce((acc, c) => acc + 1 / c.cotePourAffichage, 0);
  return { chevaux: pool, n: pool.length, s, rendement: 1 / s };
}

/**
 * @param {Array} chevaux - result.chevaux (RaceAnalyzer.analyser), chaque
 *   element avec `.classement`, `.cotePourAffichage`, `.scoreGlobal`,
 *   `.scoreAptitude`, `.scoreForme` et `.entry.coteDirecte`/`.entry.cote8h`
 *   (cotes reelles brutes).
 * @param {string|null|undefined} [hippodrome] - nom brut de l'hippodrome
 *   (`race.lieu`/`context.lieu`). Si fourni et present dans
 *   `HIPPODROMES_EXCLUS_SIMPLE_GAGNANT`, le jeu est desactive d'office pour
 *   toute la course (voir v14 ci-dessous).
 * @returns {{rentable:false, hippodromeExclu?:true}
 *          |{rentable:true, rang1Value:boolean, mode8h:boolean, rangChoisi:number,
 *            ecartScoreRang1:number|null,
 *            principal:{chevaux,n,s,rendement},
 *            alternative:null,
 *            recommande:{chevaux,n,s,rendement}}}
 *   Depuis v15, la selection porte sur les 2 PREMIERS du classement Score
 *   Global (`classement` 1 a 2, top3 v13 reduit a top2 - voir commentaire
 *   d'en-tete), pas seulement le rang 1. Parmi les candidats du top2 dont
 *   `entry.coteDirecte` depasse le seuil (3,8), celui au meilleur
 *   `scoreAptitude` est retenu (`rang1Value:true, mode8h:false`) si ce
 *   scoreAptitude est >= `SEUIL_SCORE_APTITUDE_RANG1` (85) ET son
 *   scoreForme >= `SEUIL_SCORE_FORME_RANG1` (70, v14). Sinon (aucun
 *   candidat direct ne qualifie), parmi les candidats du top2 dont
 *   `entry.cote8h` depasse le meme seuil, celui au meilleur scoreAptitude
 *   est retenu (`rang1Value:false, mode8h:true`) si son scoreAptitude >=
 *   `SEUIL_SCORE_APTITUDE_RANG1` ET son scoreForme >= `SEUIL_SCORE_FORME_RANG1`
 *   ET que son ecart de Score Global sur l'AUTRE candidat du top2 est >=
 *   `SEUIL_ECART_SCORE_RANG1_8H` (15). La cote directe est toujours
 *   prioritaire quand les deux qualifient. Dans les DEUX modes, le candidat
 *   ainsi retenu doit EN PLUS avoir un score Croisement (R10/TG/OR/IdC,
 *   `classementCroisement()` sur l'ensemble du champ) <=
 *   `SEUIL_SCORE_CROISEMENT_MAX` (3, v16) ; sinon le jeu est non rentable
 *   d'office, SANS repli sur l'autre mode. Non jouable (`rentable:false`)
 *   si l'hippodrome est exclu (`hippodromeExclu:true`), si moins de 2
 *   chevaux ont un `classement` 1-2 (champ trop petit), si aucun candidat
 *   ne qualifie dans aucun des deux modes, ou si le candidat qui aurait
 *   qualifie echoue au filtre de score Croisement. `rangChoisi` =
 *   classement (1 ou 2) du cheval retenu - PLUS FORCEMENT 1 depuis v13.
 *   `principal` = "jouer le cheval retenu seul" (Dutching degenere a 1
 *   cheval, base sur sa cote d'affichage courante - priorite a la cote
 *   directe si connue). `ecartScoreRang1` = ecart de Score Global du
 *   cheval retenu sur l'autre candidat du top2 des que le jeu est
 *   rentable (sert au multiplicateur de mise par palier d'ecart, voir
 *   `multiplicateurMiseEcartRang1` - applicable aux deux modes, et au
 *   filtre de qualification en cote 8h), `null` si non calculable (jeu non
 *   rentable, ou score global manquant sur un candidat).
 */
export function jeuSimpleGagnant(chevaux, hippodrome) {
  if (estHippodromeExclu(hippodrome)) return { rentable: false, hippodromeExclu: true };

  const seuil = SEUILS_VALUE_RANG_SIMPLE_GAGNANT[1];
  const top2 = (chevaux || [])
    .filter((c) => c.classement >= 1 && c.classement <= 2)
    .sort((a, b) => a.classement - b.classement);
  if (top2.length < 2) return { rentable: false };

  const meilleurRivalScore = (cheval) => {
    const scores = top2.filter((c) => c !== cheval).map((c) => c.scoreGlobal).filter((s) => typeof s === 'number');
    return scores.length ? Math.max(...scores) : null;
  };
  const ecartVsRivaux = (cheval) => {
    const rival = meilleurRivalScore(cheval);
    return (rival !== null && typeof cheval.scoreGlobal === 'number') ? cheval.scoreGlobal - rival : null;
  };
  const meilleurAptitude = (liste) => liste.reduce((a, b) => ((b.scoreAptitude || 0) > (a.scoreAptitude || 0) ? b : a));
  const qualifieForme = (cheval) => typeof cheval.scoreForme === 'number' && cheval.scoreForme >= SEUIL_SCORE_FORME_RANG1;
  // Score Croisement (v16) : calcule sur l'ENSEMBLE du champ (pas seulement
  // le top2), un cheval sans rubriques exploitables obtient un score de 0
  // par defaut (defensif, cf. classementCroisement) et qualifie donc
  // toujours.
  const qualifieCroisement = (cheval) => {
    const info = classementCroisement(chevaux).find((c) => c.numero === cheval.entry.numero);
    return (info ? info.score : 0) <= SEUIL_SCORE_CROISEMENT_MAX;
  };

  const candidatsDirecte = top2.filter((c) => c.entry.coteDirecte > seuil && c.cotePourAffichage > 0);
  if (candidatsDirecte.length > 0) {
    const pick = meilleurAptitude(candidatsDirecte);
    if (typeof pick.scoreAptitude === 'number' && pick.scoreAptitude >= SEUIL_SCORE_APTITUDE_RANG1 && qualifieForme(pick)) {
      if (!qualifieCroisement(pick)) return { rentable: false };
      const principal = poolDutching([pick]);
      return { rentable: true, rang1Value: true, mode8h: false, rangChoisi: pick.classement, ecartScoreRang1: ecartVsRivaux(pick), principal, alternative: null, recommande: principal };
    }
  }

  const candidats8h = top2.filter((c) => c.entry.cote8h > seuil && c.cotePourAffichage > 0);
  if (candidats8h.length > 0) {
    const pick = meilleurAptitude(candidats8h);
    const ecart = ecartVsRivaux(pick);
    if (typeof pick.scoreAptitude === 'number' && pick.scoreAptitude >= SEUIL_SCORE_APTITUDE_RANG1 && qualifieForme(pick) && ecart !== null && ecart >= SEUIL_ECART_SCORE_RANG1_8H) {
      if (!qualifieCroisement(pick)) return { rentable: false };
      const principal = poolDutching([pick]);
      return { rentable: true, rang1Value: false, mode8h: true, rangChoisi: pick.classement, ecartScoreRang1: ecart, principal, alternative: null, recommande: principal };
    }
  }

  return { rentable: false };
}

/**
 * Répartition des mises (méthode Dutching) pour un pool (cf. `principal`,
 * `alternative` ou `recommande` de `jeuSimpleGagnant`) et une mise totale
 * souhaitée : mise_i = M x (1/cote_i) / S, arrondie à l'euro le plus proche
 * (mises jouables au guichet PMU). L'arrondi utilise la méthode "au plus
 * fort reste" : chaque mise brute est arrondie à l'euro inférieur, puis les
 * euros restants (pour que la somme des mises arrondies reste exactement
 * égale à la mise totale) sont distribués aux chevaux dont la partie
 * décimale arrondie était la plus grande. Conséquence de l'arrondi : le
 * gain (mise_i x cote_i) n'est plus rigoureusement identique pour tous les
 * chevaux (contrairement au calcul non arrondi), l'écart reste toutefois
 * minime. Pour un pool a 1 seul cheval (mise flat), l'arrondi est trivial.
 * @param {{chevaux:Array, s:number}} pool
 * @param {number} miseTotale - en euros, entier (menu déroulant de presets).
 * @returns {Array<{numero:number, cote:number, mise:number, gain:number}>}
 */
export function misesJeuSimpleGagnant(pool, miseTotale) {
  if (!pool || !Array.isArray(pool.chevaux) || pool.chevaux.length === 0 || !(miseTotale > 0)) return [];

  const brutes = pool.chevaux.map((c) => ({
    numero: c.entry.numero,
    cote: c.cotePourAffichage,
    miseBrute: miseTotale * (1 / c.cotePourAffichage) / pool.s
  }));

  const miseTotaleEntiere = Math.round(miseTotale);
  const misesArrondiesBas = brutes.map((b) => Math.floor(b.miseBrute));
  const totalArrondiBas = misesArrondiesBas.reduce((acc, m) => acc + m, 0);
  const resteADistribuer = miseTotaleEntiere - totalArrondiBas;

  const ordreParReste = brutes
    .map((b, i) => ({ i, reste: b.miseBrute - misesArrondiesBas[i] }))
    .sort((a, b) => b.reste - a.reste);

  const misesFinales = misesArrondiesBas.slice();
  for (let k = 0; k < resteADistribuer && k < ordreParReste.length; k++) {
    misesFinales[ordreParReste[k].i] += 1;
  }

  return brutes.map((b, i) => ({
    numero: b.numero,
    cote: b.cote,
    mise: misesFinales[i],
    gain: misesFinales[i] * b.cote
  }));
}

/**
 * Bilan financier RÉEL (hypothétique : suppose une mise totale fixe, pas un
 * historique de mises effectivement jouées) d'une course pour le Jeu Simple
 * Gagnant, à la demande de l'utilisateur (page "Bilan Simple Gagnant").
 * Compare la mise totale (répartie via `misesJeuSimpleGagnant`) au gain
 * RÉEL si le vainqueur réel de la course fait partie du pool retenu.
 *
 * - Vainqueur hors pool ("raté") : mise totale perdue, sans besoin du
 *   rapport officiel (`dividendeConnu` reste `true` : le bilan est connu
 *   quel que soit le dividende du vainqueur).
 * - Vainqueur dans le pool ("capturé") mais rapport officiel pas encore
 *   récupéré/indisponible : bilan inconnu (`dividendeConnu: false`).
 * - Vainqueur dans le pool ET dividende connu : gain = mise du cheval
 *   vainqueur x son dividende officiel (rapport pour 1€).
 *
 * @param {{chevaux:Array, s:number}} pool - `principal`, `alternative` ou
 *   `recommande` de `jeuSimpleGagnant(chevaux)`.
 * @param {number} miseTotale
 * @param {Array<{numero:number, dividende:number}>|undefined} rapportReel - extraireRapportsSimpleGagnant(json) (js/engine/pmuApi.js).
 * @param {number} vrai1 - numéro du vainqueur réel de la course (1er de l'arrivée).
 * @returns {{mise:number, gain:number, net:number, gagne:boolean, dividendeConnu:boolean}}
 */
export function bilanJeuSimpleGagnant(pool, miseTotale, rapportReel, vrai1) {
  const gagne = !!(pool && Array.isArray(pool.chevaux) && pool.chevaux.some((c) => c.entry.numero === vrai1));
  if (!gagne) return { mise: miseTotale, gain: 0, net: -miseTotale, gagne: false, dividendeConnu: true };

  const mises = misesJeuSimpleGagnant(pool, miseTotale);
  const miseVainqueur = mises.find((m) => m.numero === vrai1);
  const rapport = Array.isArray(rapportReel) ? rapportReel.find((r) => r.numero === vrai1) : null;
  if (!miseVainqueur || !rapport) return { mise: miseTotale, gain: 0, net: -miseTotale, gagne: true, dividendeConnu: false };

  const gain = miseVainqueur.mise * rapport.dividende;
  return { mise: miseTotale, gain, net: gain - miseTotale, gagne: true, dividendeConnu: true };
}

/**
 * Rendement (gain/mise) d'un bilan journalier (ou de tout objet {mise,gain}),
 * en proportion (1 = 100%, comme `jeuSimpleGagnant(...).rendement`).
 * @param {{mise:number, gain:number}} bilan
 * @returns {number|null} null si la mise est nulle (rendement indefini).
 */
export function rendementBilan(bilan) {
  if (!bilan || !(bilan.mise > 0)) return null;
  return bilan.gain / bilan.mise;
}

/**
 * Historique des bilans quotidiens du Jeu Simple Gagnant (page "Bilan Global
 * Simple Gagnant", alimentee manuellement via le bouton "Transfert bilan" de
 * la page "Bilan Simple Gagnant" - un bilan par jour, cf. `js/db.js`). Trie
 * par date CROISSANTE et calcule le cumul (mise/gain/net) jour apres jour,
 * pour afficher la progression du bilan global au fil du temps.
 *
 * *** aout 2026 *** : en plus du cumul global (toutes courses rentables du
 * jour, tous modes confondus), cumule egalement SEPAREMENT les sous-bilans
 * par mode de jeu (`rang1Seul` et `classement8h`, chacun optionnel sur
 * chaque entree - cf. `js/app.js`, "Transfert bilan"), pour que la page
 * "Bilan Global Simple Gagnant" puisse comparer la progression des deux
 * modes. Les entrees anterieures a cette mise a jour n'ont pas ces deux
 * sous-champs : elles contribuent normalement au cumul global mais PAS aux
 * deux cumuls par mode (traites comme {mise:0, gain:0, net:0} ce jour-la),
 * ce qui cree un ecart attendu entre le cumul global et la somme des deux
 * cumuls par mode sur la periode anterieure a la mise a jour.
 *
 * *** v10 (aout 2026) *** : le mode "Cheval value seul" ayant ete remplace
 * par "1er du classement 8h" (voir plus haut), les entrees historiques
 * sauvegardees SOUS L'ANCIEN CHAMP `chevalValueSeul` continuent de compter
 * dans le cumul du 2e mode (repris sous `classement8h` si present, sinon
 * repli sur `chevalValueSeul`) - la continuite du suivi financier n'est pas
 * cassee par ce renommage, seul le libelle affiche change desormais.
 * @param {Array<{date:string, mise:number, gain:number, net:number, rang1Seul?:{mise:number,gain:number,net:number}, classement8h?:{mise:number,gain:number,net:number}, chevalValueSeul?:{mise:number,gain:number,net:number}}>} bilans
 * @returns {Array<{date:string, mise:number, gain:number, net:number, cumulMise:number, cumulGain:number, cumulNet:number, cumulRang1Seul:{mise:number,gain:number,net:number}, cumulClassement8h:{mise:number,gain:number,net:number}}>}
 */
export function cumulerBilansJournaliers(bilans) {
  const tries = [...(bilans || [])].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let cumulMise = 0;
  let cumulGain = 0;
  let cumulNet = 0;
  let cumulMiseR1 = 0, cumulGainR1 = 0, cumulNetR1 = 0;
  let cumulMise8h = 0, cumulGain8h = 0, cumulNet8h = 0;
  return tries.map((b) => {
    cumulMise += b.mise;
    cumulGain += b.gain;
    cumulNet += b.net;
    const r1 = b.rang1Seul || { mise: 0, gain: 0, net: 0 };
    const c8h = b.classement8h || b.chevalValueSeul || { mise: 0, gain: 0, net: 0 };
    cumulMiseR1 += r1.mise; cumulGainR1 += r1.gain; cumulNetR1 += r1.net;
    cumulMise8h += c8h.mise; cumulGain8h += c8h.gain; cumulNet8h += c8h.net;
    return {
      ...b, cumulMise, cumulGain, cumulNet,
      cumulRang1Seul: { mise: cumulMiseR1, gain: cumulGainR1, net: cumulNetR1 },
      cumulClassement8h: { mise: cumulMise8h, gain: cumulGain8h, net: cumulNet8h }
    };
  });
}
