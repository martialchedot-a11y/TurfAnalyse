// =============================================================================
// jeuSimpleGagnant.js
// "Jeu Simple Gagnant" : a la demande de l'utilisateur (aout 2026), remplace
// les cartes "Course fiable", "Suggestion Couplé Gagnant" et "Trio Value
// (avec base)" retirees de la fiche course. Méthode de mise "Dutching"
// (rendement identique quel que soit le cheval gagnant parmi les N retenus)
// appliquée aux N premiers chevaux du classement Score Global ayant une cote
// réelle connue (cotePourAffichage) — N choisi DYNAMIQUEMENT par course,
// plutôt que fixe.
//
// *** Origine des seuils de rentabilité (v2, aout 2026) *** : backtest réel
// sur 8 mois d'archives (janvier - 11 août 2026, 7437 courses, voir
// HEBERGEMENT.md). Constat initial : pour chaque N de 1 à 8, réussite
// cumulée = probabilité qu'un des N premiers du classement gagne réellement
// la course (26,2% / 45,4% / 60,8% / 71,4% / 79,4% / 84,7% / 89,1% / 92,6%),
// seuil de rentabilité = 1 / réussite cumulée.
//
// *** Affinement par indice de confiance *** : l'utilisateur a ensuite
// vérifié que cette réussite cumulée varie fortement selon le score de
// configuration Couplé Value (0-5, cf. `scoreConfigurationCoupleValue` dans
// app.js) — jusqu'à un facteur 2 sur le rang 1 seul (17,6% en confiance
// faible contre 35,6% en confiance forte). Les seuils sont donc calculés
// SÉPARÉMENT pour 3 tranches de confiance (faible 0-1, moyenne 2-3, forte
// 4-5), toujours vérifiés sur le rapport Simple Gagnant RÉEL (colonne SG des
// fichiers Predictions) : dans les 3 tranches, N=1 reste non rentable même
// en confiance forte (rapport réel 248% < seuil 281%) — exclu dans tous les
// cas — tandis qu'à partir de N=2 le rapport réel dépasse le seuil dans les
// 3 tranches. La tranche "moyenne" retombe presque exactement sur l'ancienne
// grille unique (qui pesait ~48% de l'échantillon).
//
// Le "rendement probable" d'une course donnée, pour un N choisi, est calculé
// avec les cotes RÉELLES du jour (pas les seuils historiques ci-dessus, qui
// ne servent que de comparaison) via la formule Dutching classique :
//   S = somme(1/cote_i) pour les N chevaux retenus
//   rendement = 1/S (identique au "rendement" affiché par l'utilisateur : un
//   Dutching sur S=0,825 donne 1/0,825 = 121,2% de rendement)
// On retient le plus GRAND N (2 à 8, limité par le nombre de chevaux cotés
// disponibles sur la course) dont le rendement dépasse le seuil de
// rentabilité DE SA TRANCHE DE CONFIANCE — pour maximiser la couverture tout
// en restant rentable. Exception : en confiance FAIBLE, N=2 et N=3 sont
// exclus d'office (minimum imposé de 4 chevaux joués), le classement Score
// Global étant jugé trop peu fiable dans cette tranche pour miser sur un
// pool aussi étroit.
// =============================================================================

export const SEUILS_RENDEMENT_SIMPLE_GAGNANT = {
  faible: { 2: 3.03, 3: 2.17, 4: 1.71, 5: 1.47, 6: 1.30, 7: 1.22, 8: 1.16 },
  moyenne: { 2: 2.16, 3: 1.58, 4: 1.35, 5: 1.22, 6: 1.16, 7: 1.11, 8: 1.08 },
  forte: { 2: 1.68, 3: 1.34, 4: 1.22, 5: 1.14, 6: 1.09, 7: 1.05, 8: 1.02 }
};

export const MISES_PRESETS_JEU_SIMPLE_GAGNANT = [10, 20, 30, 50, 75, 100, 150, 200];

// En confiance faible, le classement Score Global est moins fiable : on
// impose un minimum de 4 chevaux joues (au lieu de 2) pour eviter de miser
// sur un pool trop etroit alors que la confiance dans le classement est
// justement basse. Confiance moyenne/forte : minimum inchange (2).
const MIN_N_PAR_TRANCHE = { faible: 4, moyenne: 2, forte: 2 };

/**
 * Convertit un score de configuration Couplé Value (0-5) en tranche de
 * confiance ("faible"/"moyenne"/"forte") utilisée pour choisir la grille de
 * seuils. Un score absent/inconnu (null/undefined) retombe sur "moyenne"
 * (comportement proche de l'ancienne grille unique), plutôt que de bloquer
 * le calcul.
 * @param {number|null|undefined} scoreConfiance - 0 à 5.
 * @returns {'faible'|'moyenne'|'forte'}
 */
export function trancheConfiance(scoreConfiance) {
  if (scoreConfiance == null) return 'moyenne';
  return scoreConfiance <= 1 ? 'faible' : scoreConfiance <= 3 ? 'moyenne' : 'forte';
}

/**
 * @param {Array} chevaux - result.chevaux (RaceAnalyzer.analyser), chaque
 *   élément avec `.classement` et `.cotePourAffichage`.
 * @param {number|null|undefined} scoreConfiance - score de configuration
 *   Couplé Value (0-5) de cette course, cf. `scoreConfigurationCoupleValue`
 *   dans app.js. Détermine la grille de seuils appliquée (voir en-tête).
 * @returns {{rentable:true, n:number, chevaux:Array, s:number, rendement:number, seuil:number, tranche:string}
 *          |{rentable:false}}
 */
export function jeuSimpleGagnant(chevaux, scoreConfiance) {
  const avecCote = (chevaux || [])
    .filter((c) => c.cotePourAffichage > 0)
    .sort((a, b) => a.classement - b.classement);

  if (avecCote.length < 2) return { rentable: false };

  const tranche = trancheConfiance(scoreConfiance);
  const seuils = SEUILS_RENDEMENT_SIMPLE_GAGNANT[tranche];

  const maxN = Math.min(8, avecCote.length);
  const minN = MIN_N_PAR_TRANCHE[tranche];
  let meilleurN = null;
  for (let n = minN; n <= maxN; n++) {
    const pool = avecCote.slice(0, n);
    const s = pool.reduce((acc, c) => acc + 1 / c.cotePourAffichage, 0);
    const rendement = 1 / s;
    if (rendement > seuils[n]) meilleurN = n;
  }
  if (meilleurN == null) return { rentable: false };

  const pool = avecCote.slice(0, meilleurN);
  const s = pool.reduce((acc, c) => acc + 1 / c.cotePourAffichage, 0);
  return { rentable: true, n: meilleurN, chevaux: pool, s, rendement: 1 / s, seuil: seuils[meilleurN], tranche };
}

/**
 * Répartition des mises (méthode Dutching) pour un jeu rentable
 * (cf. jeuSimpleGagnant) et une mise totale souhaitée : mise_i = M x
 * (1/cote_i) / S, arrondie à l'euro le plus proche (mises jouables au
 * guichet PMU). L'arrondi utilise la méthode "au plus fort reste" : chaque
 * mise brute est arrondie à l'euro inférieur, puis les euros restants (pour
 * que la somme des mises arrondies reste exactement égale à la mise totale)
 * sont distribués aux chevaux dont la partie décimale arrondie était la
 * plus grande. Conséquence de l'arrondi : le gain (mise_i x cote_i) n'est
 * plus rigoureusement identique pour tous les chevaux (contrairement au
 * calcul non arrondi), l'écart reste toutefois minime.
 * @param {Object} jeu - jeuSimpleGagnant(chevaux) avec rentable=true.
 * @param {number} miseTotale - en euros, entier (menu déroulant de presets).
 * @returns {Array<{numero:number, cote:number, mise:number, gain:number}>}
 */
export function misesJeuSimpleGagnant(jeu, miseTotale) {
  if (!jeu || !jeu.rentable || !(miseTotale > 0)) return [];

  const brutes = jeu.chevaux.map((c) => ({
    numero: c.entry.numero,
    cote: c.cotePourAffichage,
    miseBrute: miseTotale * (1 / c.cotePourAffichage) / jeu.s
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
 * @param {Object} jeu - jeuSimpleGagnant(chevaux, scoreConfiance) avec rentable=true.
 * @param {number} miseTotale
 * @param {Array<{numero:number, dividende:number}>|undefined} rapportReel - extraireRapportsSimpleGagnant(json) (js/engine/pmuApi.js).
 * @param {number} vrai1 - numéro du vainqueur réel de la course (1er de l'arrivée).
 * @returns {{mise:number, gain:number, net:number, gagne:boolean, dividendeConnu:boolean}}
 */
export function bilanJeuSimpleGagnant(jeu, miseTotale, rapportReel, vrai1) {
  const gagne = !!(jeu && jeu.rentable && jeu.chevaux.some((c) => c.entry.numero === vrai1));
  if (!gagne) return { mise: miseTotale, gain: 0, net: -miseTotale, gagne: false, dividendeConnu: true };

  const mises = misesJeuSimpleGagnant(jeu, miseTotale);
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
 * @param {Array<{date:string, mise:number, gain:number, net:number}>} bilans
 * @returns {Array<{date:string, mise:number, gain:number, net:number, cumulMise:number, cumulGain:number, cumulNet:number}>}
 */
export function cumulerBilansJournaliers(bilans) {
  const tries = [...(bilans || [])].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let cumulMise = 0;
  let cumulGain = 0;
  let cumulNet = 0;
  return tries.map((b) => {
    cumulMise += b.mise;
    cumulGain += b.gain;
    cumulNet += b.net;
    return { ...b, cumulMise, cumulGain, cumulNet };
  });
}
