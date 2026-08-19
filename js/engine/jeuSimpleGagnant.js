// =============================================================================
// jeuSimpleGagnant.js
// "Jeu Simple Gagnant" (v4, aout 2026) : remplace le systeme "N chevaux
// dynamique selon la confiance" par une regle plus directement validee par
// backtest reel (8 mois d'archives, 7456 courses - voir HEBERGEMENT.md), qui
// compare la cote REELLE du cheval, RANG PAR RANG du classement Score
// Global, a un SEUIL fixe de rentabilite (calibre empiriquement) :
//
//   Rang 1 : cote > 3,8  -> rendement reel 164,0% (n=3274), ROBUSTE (158,6%
//            meme en retirant les 10 plus gros gains) - de loin le signal le
//            plus solide, pris isolement.
//   Rang 2 : cote > 5,2  -> rendement reel 103,2% (marge tres fine)
//   Rang 3 : cote > 6,5  -> rendement reel  86,6% (PAS rentable -> EXCLU)
//   Rang 4 : cote > 9,4  -> rendement reel 112,5%
//   Rang 5 : cote > 12,5 -> rendement reel 110,4%
//
// *** Decision (aout 2026, a la demande de l'utilisateur) *** : le rang 1
// est nettement le plus rentable pris seul - il est donc TOUJOURS
// prioritaire ("principal") des qu'il depasse son seuil. Les rangs 2, 4 et 5
// sont trop proches de 100% pour etre joues seuls avec la meme confiance,
// mais RESTENT utiles COMBINES : un Dutching sur tous les rangs "value"
// simultanement (parmi 1, 2, 4, 5 - le rang 3 reste exclu, jamais rentable
// seul et diluant le pool par backtest) donne un rendement de 120,2% sur
// 4761 courses, robuste (108,3% meme en retirant les 50 plus gros gains).
// Ce Dutching est donc propose en option ALTERNATIVE ("quand meme"), jamais
// a la place du rang 1 seul quand celui-ci est deja jouable - mais reste la
// SEULE proposition si le rang 1 ne depasse pas son seuil alors que d'autres
// rangs depassent le leur.
//
// Cas particulier : si un seul cheval au total (quel que soit son rang parmi
// 1/2/4/5) depasse son seuil, il est joue seul (pas de Dutching possible a 1
// seul cheval) - equivalent a un Dutching degenere a N=1 (rendement = sa
// cote).
// =============================================================================

export const SEUILS_VALUE_RANG_SIMPLE_GAGNANT = { 1: 3.8, 2: 5.2, 4: 9.4, 5: 12.5 };
const RANGS_SIMPLE_GAGNANT = [1, 2, 4, 5];

export const MISES_PRESETS_JEU_SIMPLE_GAGNANT = [10, 20, 30, 50, 75, 100, 150, 200];

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
 *   element avec `.classement` et `.cotePourAffichage`.
 * @returns {{rentable:false}
 *          |{rentable:true, rang1Value:boolean,
 *            principal:{chevaux,n,s,rendement}|null,
 *            alternative:{chevaux,n,s,rendement}|null,
 *            recommande:{chevaux,n,s,rendement}}}
 *   `principal` = "jouer ce cheval seul" (rang 1 s'il est value, sinon
 *   l'unique cheval value s'il n'y en a qu'un). `alternative` = Dutching sur
 *   TOUS les chevaux value (rang 1 inclus s'il en fait partie), propose des
 *   que 2 chevaux ou plus depassent leur seuil. `recommande` = celui a
 *   utiliser par defaut (mises, bilan, notification) : `principal` si
 *   present, sinon `alternative`.
 */
export function jeuSimpleGagnant(chevaux) {
  const parRang = (r) => (chevaux || []).find((c) => c.classement === r && c.cotePourAffichage > 0);

  const valueList = [];
  for (const rang of RANGS_SIMPLE_GAGNANT) {
    const cheval = parRang(rang);
    if (cheval && cheval.cotePourAffichage > SEUILS_VALUE_RANG_SIMPLE_GAGNANT[rang]) valueList.push(cheval);
  }
  if (valueList.length === 0) return { rentable: false };

  const rang1 = parRang(1);
  const rang1Value = !!(rang1 && valueList.includes(rang1));

  let principal = null;
  if (rang1Value) {
    principal = poolDutching([rang1]);
  } else if (valueList.length === 1) {
    principal = poolDutching(valueList);
  }

  let alternative = null;
  if (valueList.length >= 2) {
    alternative = poolDutching(valueList);
  }

  if (!principal && !alternative) return { rentable: false };

  return { rentable: true, rang1Value, principal, alternative, recommande: principal || alternative };
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
