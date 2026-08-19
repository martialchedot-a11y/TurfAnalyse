// =============================================================================
// jeuSimpleGagnant.js
// "Jeu Simple Gagnant" (v5, aout 2026) : compare la cote REELLE du cheval,
// RANG PAR RANG du classement Score Global, a un SEUIL fixe de rentabilite
// (calibre empiriquement sur 8 mois d'archives, 7456 courses - voir
// HEBERGEMENT.md) :
//
//   Rang 1 : cote > 3,8  -> rendement reel 164,0% (n=3274), ROBUSTE (158,6%
//            meme en retirant les 10 plus gros gains) - de loin le signal le
//            plus solide, pris isolement.
//   Rang 2 : cote > 5,2  -> rendement reel 103,2% (marge tres fine)
//   Rang 3 : cote > 6,5  -> rendement reel  86,6% (PAS rentable -> EXCLU)
//   Rang 4 : cote > 9,4  -> rendement reel 112,5%
//   Rang 5 : cote > 12,5 -> rendement reel 110,4%
//
// *** v5 : le rang 1 est desormais OBLIGATOIRE (aout 2026, a la demande de
// l'utilisateur) *** : un Dutching combinant les rangs 2/4/5 (rang 1 exclu
// du pool) est certes rentable en moyenne (120,2% sur 4761 courses,
// 2+ chevaux "value" parmi 1/2/4/5), mais un test cible a montre que ce
// resultat est PORTE PAR LA QUEUE de la distribution (gros gains rares) :
// isole aux seules courses ou le rang 1 NE qualifie PAS (le cas ou le
// Dutching serait la SEULE proposition de l'appli), le rendement retombe a
// 102,8% sur 2137 courses et devient NEGATIF des qu'on retire les 5 a 10
// plus gros gains (97,9% / 94,4%) - un profil fragile, comparable au
// Croisement Couple/Trio. Ce jeu n'est donc plus JOUABLE si le rang 1 ne
// depasse pas son seuil, quels que soient les autres rangs.
//
// Quand le rang 1 QUALIFIE (le seul cas desormais jouable), il reste
// TOUJOURS la proposition "principale" (jeu seul, 164% de rendement). Si
// d'autres rangs (2, 4, 5 - le rang 3 reste exclu, jamais rentable seul)
// depassent AUSSI leur seuil, un Dutching combinant tous les chevaux
// "value" (rang 1 inclus) est propose EN PLUS, en option "alternative"
// facultative - jamais a la place du rang 1 seul.
// =============================================================================

export const SEUILS_VALUE_RANG_SIMPLE_GAGNANT = { 1: 3.8, 2: 5.2, 4: 9.4, 5: 12.5 };
const AUTRES_RANGS_SIMPLE_GAGNANT = [2, 4, 5];

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
 *          |{rentable:true, rang1Value:true,
 *            principal:{chevaux,n,s,rendement},
 *            alternative:{chevaux,n,s,rendement}|null,
 *            recommande:{chevaux,n,s,rendement}}}
 *   Non jouable (`rentable:false`) des que le rang 1 ne depasse pas son
 *   seuil (cote > 3,8), quels que soient les autres rangs. `principal` =
 *   "jouer le rang 1 seul" (toujours present quand rentable=true).
 *   `alternative` = Dutching sur le rang 1 + tous les autres rangs "value"
 *   (2/4/5), propose en COMPLEMENT facultatif des que 2 chevaux ou plus
 *   depassent leur seuil - jamais seul, jamais a la place du rang 1.
 *   `recommande` = `principal` (rang 1 seul), utilise par defaut pour les
 *   mises/le bilan/la notification.
 */
export function jeuSimpleGagnant(chevaux) {
  const parRang = (r) => (chevaux || []).find((c) => c.classement === r && c.cotePourAffichage > 0);

  const rang1 = parRang(1);
  const rang1Value = !!(rang1 && rang1.cotePourAffichage > SEUILS_VALUE_RANG_SIMPLE_GAGNANT[1]);
  if (!rang1Value) return { rentable: false };

  const valueList = [rang1];
  for (const rang of AUTRES_RANGS_SIMPLE_GAGNANT) {
    const cheval = parRang(rang);
    if (cheval && cheval.cotePourAffichage > SEUILS_VALUE_RANG_SIMPLE_GAGNANT[rang]) valueList.push(cheval);
  }

  const principal = poolDutching([rang1]);
  const alternative = valueList.length >= 2 ? poolDutching(valueList) : null;

  return { rentable: true, rang1Value: true, principal, alternative, recommande: principal };
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
