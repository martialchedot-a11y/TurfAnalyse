// =============================================================================
// jeuSimpleGagnant.js
// "Jeu Simple Gagnant" (v8, aout 2026) : compare la cote REELLE du cheval,
// RANG PAR RANG du classement Score Global, a un SEUIL fixe de rentabilite
// (calibre empiriquement sur 8 mois d'archives, 7456 courses - voir
// HEBERGEMENT.md) :
//
//   Rang 1 : cote > 3,8  -> rendement reel 164,0% (n=3274), ROBUSTE (158,6%
//            meme en retirant les 10 plus gros gains) - de loin le signal
//            le plus solide de tout le backtest.
//   Rang 2 : cote > 5,2  -> rendement reel 103,2% (marge tres fine)
//   Rang 3 : cote > 6,5  -> rendement reel  86,6% (PAS rentable -> EXCLU)
//   Rang 4 : cote > 9,4  -> rendement reel 112,5%
//   Rang 5 : cote > 12,5 -> rendement reel 110,4%
//
// Le rang 1 reste prioritaire des qu'il qualifie ("1er du classement
// seul"). S'il ne qualifie PAS mais qu'UN SEUL des autres rangs (2, 4, 5 -
// le rang 3 reste exclu, jamais rentable seul) depasse le sien, ce cheval
// est joue seul ("Cheval value seul (rang hors 1)") - equivalent a un
// Dutching degenere a 1 cheval, chacun de ces rangs pris isolement etant
// rentable par backtest (103,2% a 112,5%). Le Dutching combinant PLUSIEURS
// chevaux reste EXCLU de cette page (fragile par backtest - voir
// HEBERGEMENT.md) : si 2 rangs ou plus parmi {2, 4, 5} qualifient sans que
// le rang 1 qualifie, le jeu n'est pas jouable.
//
// *** v8 (aout 2026, a la demande de l'utilisateur) *** : condition
// SUPPLEMENTAIRE pour que le rang 1 qualifie ("1er du classement seul") :
// l'ECART de Score Global entre le rang 1 et le rang 2 doit etre >= 10
// (SEUIL_ECART_SCORE_RANG1). Backtest reel (8 mois, rang1 cote > 3,8) :
// sans condition d'ecart, 164,0% de rendement (3274 courses) ; avec
// l'ecart >= 10, le nombre de courses concernees baisse a 1058 mais la
// reussite grimpe de 27,4% a 35,7% et le rendement a 201,1% - ROBUSTE
// (157,6% meme en retirant les 50 plus gros gains sur 378 victoires). Plus
// le modele domine largement son dauphin en Score Global, plus le rang 1
// est fiable - un signal independant de la cote elle-meme (teste et retenu
// apres avoir egalement teste, sans resultat concluant, le mouvement de
// cote 8h->directe et la "value" du rang 1). Cette condition d'ecart ne
// s'applique qu'au rang 1 (jamais testee/validee pour les rangs 2/4/5).
// =============================================================================

export const SEUILS_VALUE_RANG_SIMPLE_GAGNANT = { 1: 3.8, 2: 5.2, 4: 9.4, 5: 12.5 };
const AUTRES_RANGS_SIMPLE_GAGNANT = [2, 4, 5];
export const SEUIL_ECART_SCORE_RANG1 = 10;

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
 *   element avec `.classement`, `.cotePourAffichage` et `.scoreGlobal`.
 * @returns {{rentable:false}
 *          |{rentable:true, rang1Value:boolean,
 *            principal:{chevaux,n,s,rendement},
 *            alternative:null,
 *            recommande:{chevaux,n,s,rendement}}}
 *   Non jouable (`rentable:false`) si aucun cheval ne qualifie, OU si 2
 *   rangs ou plus parmi {2, 4, 5} qualifient alors que le rang 1 ne
 *   qualifie pas (Dutching multi-chevaux exclu, trop fragile). Le rang 1
 *   qualifie seulement si sa cote depasse son seuil ET que son ecart de
 *   Score Global avec le rang 2 est >= `SEUIL_ECART_SCORE_RANG1`.
 *   `principal` = "jouer ce cheval seul" (le rang 1 s'il qualifie, sinon
 *   l'unique autre rang qui qualifie). `alternative` reste `null` (aucun
 *   Dutching multi-chevaux propose sur cette page). `recommande` =
 *   `principal`.
 */
export function jeuSimpleGagnant(chevaux) {
  const parRang = (r) => (chevaux || []).find((c) => c.classement === r && c.cotePourAffichage > 0);

  const rang1 = parRang(1);
  const rang1CoteValue = !!(rang1 && rang1.cotePourAffichage > SEUILS_VALUE_RANG_SIMPLE_GAGNANT[1]);

  let rang1Value = false;
  if (rang1CoteValue) {
    const rang2 = (chevaux || []).find((c) => c.classement === 2);
    const ecartOk = !!(rang2 && typeof rang1.scoreGlobal === 'number' && typeof rang2.scoreGlobal === 'number'
      && (rang1.scoreGlobal - rang2.scoreGlobal) >= SEUIL_ECART_SCORE_RANG1);
    rang1Value = ecartOk;
  }

  if (rang1Value) {
    const principal = poolDutching([rang1]);
    return { rentable: true, rang1Value: true, principal, alternative: null, recommande: principal };
  }

  const autresValue = [];
  for (const rang of AUTRES_RANGS_SIMPLE_GAGNANT) {
    const cheval = parRang(rang);
    if (cheval && cheval.cotePourAffichage > SEUILS_VALUE_RANG_SIMPLE_GAGNANT[rang]) autresValue.push(cheval);
  }
  if (autresValue.length !== 1) return { rentable: false };

  const principal = poolDutching(autresValue);
  return { rentable: true, rang1Value: false, principal, alternative: null, recommande: principal };
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
 * par mode de jeu (`rang1Seul` et `chevalValueSeul`, chacun optionnel sur
 * chaque entree - cf. `js/app.js`, "Transfert bilan"), pour que la page
 * "Bilan Global Simple Gagnant" puisse comparer la progression des deux
 * modes. Les entrees anterieures a cette mise a jour n'ont pas ces deux
 * sous-champs : elles contribuent normalement au cumul global mais PAS aux
 * deux cumuls par mode (traites comme {mise:0, gain:0, net:0} ce jour-la),
 * ce qui cree un ecart attendu entre le cumul global et la somme des deux
 * cumuls par mode sur la periode anterieure a la mise a jour.
 * @param {Array<{date:string, mise:number, gain:number, net:number, rang1Seul?:{mise:number,gain:number,net:number}, chevalValueSeul?:{mise:number,gain:number,net:number}}>} bilans
 * @returns {Array<{date:string, mise:number, gain:number, net:number, cumulMise:number, cumulGain:number, cumulNet:number, cumulRang1Seul:{mise:number,gain:number,net:number}, cumulChevalValueSeul:{mise:number,gain:number,net:number}}>}
 */
export function cumulerBilansJournaliers(bilans) {
  const tries = [...(bilans || [])].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let cumulMise = 0;
  let cumulGain = 0;
  let cumulNet = 0;
  let cumulMiseR1 = 0, cumulGainR1 = 0, cumulNetR1 = 0;
  let cumulMiseCV = 0, cumulGainCV = 0, cumulNetCV = 0;
  return tries.map((b) => {
    cumulMise += b.mise;
    cumulGain += b.gain;
    cumulNet += b.net;
    const r1 = b.rang1Seul || { mise: 0, gain: 0, net: 0 };
    const cv = b.chevalValueSeul || { mise: 0, gain: 0, net: 0 };
    cumulMiseR1 += r1.mise; cumulGainR1 += r1.gain; cumulNetR1 += r1.net;
    cumulMiseCV += cv.mise; cumulGainCV += cv.gain; cumulNetCV += cv.net;
    return {
      ...b, cumulMise, cumulGain, cumulNet,
      cumulRang1Seul: { mise: cumulMiseR1, gain: cumulGainR1, net: cumulNetR1 },
      cumulChevalValueSeul: { mise: cumulMiseCV, gain: cumulGainCV, net: cumulNetCV }
    };
  });
}
