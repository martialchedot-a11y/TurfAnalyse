// =============================================================================
// jeuCoupleTrioCroisement.js
// "Jeu Croisement Couplé/Trio" (aout 2026, a la demande de l'utilisateur) :
// mise mise de flat 1e (ou plus) par combinaison sur un pool de chevaux
// obtenu en croisant 4 rubriques (R10, TG, OR, IdC) - score par cheval =
// nombre de fois qu'il figure dans le top-3 de CHACUNE de ces 4 rubriques
// (0 a 4), depart&eacute;g&eacute; par la somme de ses rangs (plus petite = mieux)
// sur les 4 rubriques.
//
// *** Origine (aout 2026) *** : a la suite d'un backtest de reussite sur 8
// mois d'archives (janvier - aout 2026, ~7370 courses), l'utilisateur a
// demande une validation en argent REEL (pas seulement la frequence ou le
// bon combo figure dans le pool, mais le rendement avec les VRAIS dividendes
// PMU). Un echantillon de 51 a 59 courses (1 course sur ~115, reparties sur
// les 8 mois, rapports recuperes via l'API PMU rapports-definitifs) donne :
//   - Couple Gagnant, pool de 3 chevaux (K=3, 3 combinaisons) : 22,0% de
//     reussite, rendement reel 148,5% (n=59). Robuste : retire le plus gros
//     gain de l'echantillon (82,50e), le rendement reste ~102% (>100%) - le
//     resultat n'est pas porte par un seul coup de chance.
//   - Trio, pool de 4 chevaux (K=4, 4 combinaisons) : 17,6% de reussite,
//     rendement reel 128,7% (n=51). FRAGILE : retire son plus gros gain
//     (86,20e), le rendement retombe a ~86% (<100%) - ce resultat tient
//     largement a une seule grosse combinaison gagnante, donc moins fiable
//     statistiquement que le Couple.
// Ces tailles de pool (K=3 pour le Couple, K=4 pour le Trio) sont donc celles
// retenues ici, et PAS les autres tailles testees (K=2 a K=7) qui donnaient
// un rendement reel moindre ou non mesure sur echantillon reel.
//
// *** Prudence *** : l'echantillon reste petit (51-59 courses, contre 3000 a
// 7000+ courses pour les autres backtests de cette appli) - a la difference
// du Jeu Simple Gagnant, ce jeu n'a PAS encore ete valide sur un large
// echantillon reel. La page "Bilan Croisement" (voir js/app.js) accumule un
// vrai historique au fil du temps, sans qu'aucune mise reelle ne soit
// necessaire pour cela : l'idee est de laisser le bilan grandir avant de
// eventuellement jouer en argent reel.
// =============================================================================

import { RUBRIQUES } from './rubriques.js';

// Les 4 rubriques croisees (voir origine ci-dessus) : indices dans RUBRIQUES.
const RUB_NOMS_CROISEMENT = ['R10', 'TG', 'OR', 'IdC'];
const RUB_IDX_CROISEMENT = RUB_NOMS_CROISEMENT.map((n) => RUBRIQUES.findIndex((r) => r.nom === n));

// Tailles de pool retenues (voir note d'origine ci-dessus - validees en
// argent reel, pas les autres tailles testees).
export const TAILLE_POOL_COUPLE = 3; // C(3,2) = 3 combinaisons
export const TAILLE_POOL_TRIO = 4;   // C(4,3) = 4 combinaisons

// Fourchette de partants retenue (a la demande de l'utilisateur, aout 2026) :
// EN DESSOUS de 8 partants, le PMU ne propose souvent QUE le Couple Ordre /
// Trio Ordre (paris ou l'ORDRE d'arrivee compte) au lieu du Couple Gagnant /
// Trio (ordre indifferent) sur lesquels ce module est construit - deja
// observe lors de l'echantillonnage reel (voir origine en tete de fichier :
// 3 courses <8 partants exclues pour cette raison). AU-DESSUS de 16
// partants, borne haute demandee par l'utilisateur. Cette fourchette (8-16)
// est aussi celle deja utilisee ailleurs dans l'appli pour "Top base" (voir
// MIN/MAX_PARTANTS_FEU_VERT, js/app.js).
export const MIN_PARTANTS_CROISEMENT = 8;
export const MAX_PARTANTS_CROISEMENT = 16;

export const MISES_PRESETS_CROISEMENT = [1, 2, 3, 5, 10];

// Seuil de confiance Couple recommande par defaut (voir confiancePool
// ci-dessous pour l'origine des chiffres : 22,8% de reussite a partir de ce
// seuil, contre 17,0% toutes confiances confondues).
export const CONFIANCE_COUPLE_RECOMMANDEE = 3;

/**
 * @param {number} n
 * @param {number} k
 * @returns {number} nombre de combinaisons C(n,k).
 */
export function combinaisons(n, k) {
  if (k > n || k < 0) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return Math.round(r);
}

/**
 * Egalite de deux tableaux de numeros, ordre indifferent (les paris Couple
 * Gagnant/Trio sont indifferents a l'ordre d'arrivee).
 * @param {number[]} a
 * @param {number[]} b
 */
export function memesNumeros(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

/**
 * `petit` est-il entierement contenu dans `grand` (ordre indifferent) ?
 * Utilise pour verifier qu'un vainqueur/place (2 ou 3 numeros) est bien
 * capture par un pool plus large (3 ou 4 numeros).
 * @param {number[]} petit
 * @param {number[]} grand
 */
export function estSousEnsemble(petit, grand) {
  if (!Array.isArray(petit) || !Array.isArray(grand)) return false;
  const set = new Set(grand);
  return petit.every((n) => set.has(n));
}

/**
 * Toutes les combinaisons de taille `k` d'un tableau de numeros (ordre
 * croissant a l'interieur de chaque combinaison), utilisees pour l'affichage
 * des combinaisons a jouer au guichet.
 * @param {number[]} pool
 * @param {number} k
 * @returns {number[][]}
 */
export function combinaisonsDuPool(pool, k) {
  const tries = [...pool].sort((a, b) => a - b);
  const resultat = [];
  function recurse(depart, courant) {
    if (courant.length === k) { resultat.push([...courant]); return; }
    for (let i = depart; i < tries.length; i++) {
      courant.push(tries[i]);
      recurse(i + 1, courant);
      courant.pop();
    }
  }
  recurse(0, []);
  return resultat;
}

/**
 * Classement croisement (score 0-4 + somme des rangs) : identique a la
 * methode utilisee pour le backtest reel (voir origine en tete de fichier),
 * pour que le pool affiche en direct corresponde exactement a celui valide.
 * @param {Array} chevaux - result.chevaux (RaceAnalyzer.analyser), chaque
 *   element avec `.entry.numero` et `.entry.rubriques` (tableau de 18
 *   valeurs, dans l'ordre RUBRIQUES - voir csvImporter.js).
 * @returns {Array<{numero:number, score:number, sommeRangs:number}>} trie
 *   par score decroissant puis somme des rangs croissante (meilleur en tete).
 */
export function classementCroisement(chevaux) {
  const valides = (chevaux || []).filter((c) => c && c.entry && typeof c.entry.numero === 'number');
  if (valides.length === 0) return [];

  const rangParCheval = new Map(valides.map((c) => [c.entry.numero, { sommeRangs: 0, score: 0 }]));

  for (const idx of RUB_IDX_CROISEMENT) {
    if (idx < 0) continue; // rubrique introuvable (config incoherente) : ignoree plutot que de planter
    const desc = RUBRIQUES[idx].desc;
    const vals = valides
      .map((c) => ({ numero: c.entry.numero, val: c.entry.rubriques?.[idx] ?? null }))
      .filter((x) => x.val !== null && x.val !== undefined && !Number.isNaN(x.val));
    vals.sort((a, b) => (desc ? b.val - a.val : a.val - b.val));
    vals.forEach((x, i) => {
      const rang = i + 1;
      const st = rangParCheval.get(x.numero);
      st.sommeRangs += rang;
      if (rang <= 3) st.score++;
    });
    // Chevaux sans valeur pour cette rubrique : rang de penalite (n+1), pour
    // ne jamais les avantager par rapport a un cheval reellement classe.
    for (const c of valides) {
      if (!vals.some((v) => v.numero === c.entry.numero)) {
        rangParCheval.get(c.entry.numero).sommeRangs += valides.length + 1;
      }
    }
  }

  return [...rangParCheval.entries()]
    .map(([numero, st]) => ({ numero, ...st }))
    .sort((a, b) => (b.score - a.score) || (a.sommeRangs - b.sommeRangs));
}

/**
 * Indice de confiance d'un pool (0-4) : le score (nombre de rubriques ou il
 * figure en top-3, cf. classementCroisement) du membre le PLUS FAIBLE du
 * pool - c'est-a-dire celui qui doit le plus a la somme des rangs (tie-break)
 * plutot qu'a un accord reel entre plusieurs rubriques. Un pool dont tous les
 * membres ont un score eleve est un signal plus fort qu'un pool ou le
 * dernier membre n'est retenu que par defaut.
 *
 * *** Origine (aout 2026) *** : backtest sur l'archive compl&egrave;te (8
 * mois, courses 8-16 partants, ~6720 courses) : pour le Couple (K=3), la
 * reussite passe de 17,0% (toutes confiances) a 22,8% en ne retenant que les
 * courses ou confianceCouple >= 3 (n=952, ~14% des courses) - signal clair
 * et sur un echantillon consequent. Pour le Trio (K=4), le meme filtre
 * n'apporte PAS d'amelioration nette (echantillon trop clairseme au-dessus
 * de confiance=2, 12,0% au mieux contre 11,4% globalement) : la confiance
 * n'est donc, pour l'instant, un filtre utile QUE pour le Couple. Ces
 * chiffres portent sur la REUSSITE (pas encore verifiee en argent reel a ce
 * niveau de detail - contrairement aux chiffres globaux Couple/Trio, voir
 * origine en tete de fichier).
 * @param {Array} classement - classementCroisement(chevaux).
 * @param {number} tailleP0ol - TAILLE_POOL_COUPLE ou TAILLE_POOL_TRIO.
 * @returns {number}
 */
function confiancePool(classement, taillePool) {
  const pool = classement.slice(0, taillePool);
  return pool.length === 0 ? 0 : Math.min(...pool.map((x) => x.score));
}

/**
 * @param {Array} chevaux - voir classementCroisement.
 * @returns {{jouable:true, classement:Array, poolCouple:number[], poolTrio:number[], confianceCouple:number, confianceTrio:number}
 *          |{jouable:false}}
 */
export function jeuCoupleTrioCroisement(chevaux) {
  const valides = (chevaux || []).filter((c) => c && c.entry && typeof c.entry.numero === 'number');
  if (valides.length < MIN_PARTANTS_CROISEMENT || valides.length > MAX_PARTANTS_CROISEMENT) return { jouable: false };

  const classement = classementCroisement(valides);
  if (classement.length < TAILLE_POOL_TRIO) return { jouable: false };

  return {
    jouable: true,
    classement,
    poolCouple: classement.slice(0, TAILLE_POOL_COUPLE).map((x) => x.numero),
    poolTrio: classement.slice(0, TAILLE_POOL_TRIO).map((x) => x.numero),
    confianceCouple: confiancePool(classement, TAILLE_POOL_COUPLE),
    confianceTrio: confiancePool(classement, TAILLE_POOL_TRIO)
  };
}

/**
 * Bilan financier REEL du Couple Gagnant (K=3, 3 combinaisons) pour une
 * course : mise `miseParCombinaison` sur CHACUNE des 3 paires du pool.
 * Capture si les 2 premiers de l'arrivee sont tous les deux dans le pool
 * (peu importe l'ordre). En cas de capture, le dividende reel est celui de
 * la combinaison EXACTEMENT gagnante (une seule des 3 combinaisons paie).
 *
 * @param {Object} jeu - jeuCoupleTrioCroisement(chevaux) avec jouable=true.
 * @param {number} miseParCombinaison - en euros, mise unitaire par combinaison.
 * @param {number[]|undefined} ordreArrivee - numeros dans l'ordre d'arrivee
 *   (au moins les 2 premiers) ; undefined/vide si l'arrivee n'est pas encore connue.
 * @param {Array<{numeros:number[], dividende:number}>|undefined} rapportReel -
 *   extraireRapportsCoupleGagnant(json) (js/engine/pmuApi.js).
 * @returns {{mise:number, gain:number, net:number, gagne:boolean|null, dividendeConnu:boolean}}
 *   gagne=null si l'arrivee n'est pas encore connue (mise/gain non significatifs dans ce cas).
 */
export function bilanCoupleCroisement(jeu, miseParCombinaison, ordreArrivee, rapportReel) {
  const nbCombos = combinaisons(TAILLE_POOL_COUPLE, 2);
  const mise = (miseParCombinaison || 0) * nbCombos;

  if (!jeu || !jeu.jouable) return { mise, gain: 0, net: -mise, gagne: false, dividendeConnu: true };
  if (!Array.isArray(ordreArrivee) || ordreArrivee.length < 2) {
    return { mise, gain: 0, net: -mise, gagne: null, dividendeConnu: false };
  }

  const top2 = ordreArrivee.slice(0, 2);
  const gagne = estSousEnsemble(top2, jeu.poolCouple);
  if (!gagne) return { mise, gain: 0, net: -mise, gagne: false, dividendeConnu: true };

  const rapport = Array.isArray(rapportReel) ? rapportReel.find((r) => memesNumeros(r.numeros, top2)) : null;
  if (!rapport) return { mise, gain: 0, net: -mise, gagne: true, dividendeConnu: false };

  const gain = (miseParCombinaison || 0) * rapport.dividende;
  return { mise, gain, net: gain - mise, gagne: true, dividendeConnu: true };
}

/**
 * Bilan financier REEL du Trio (K=4, 4 combinaisons) pour une course : meme
 * principe que bilanCoupleCroisement, avec un pool de 4 chevaux et les 3
 * premiers de l'arrivee a capturer (4 combinaisons de 3, une seule paie).
 * @param {Object} jeu - jeuCoupleTrioCroisement(chevaux) avec jouable=true.
 * @param {number} miseParCombinaison
 * @param {number[]|undefined} ordreArrivee - au moins les 3 premiers.
 * @param {Array<{numeros:number[], dividende:number}>|undefined} rapportReel -
 *   extraireRapportsTrio(json) (js/engine/pmuApi.js).
 * @returns {{mise:number, gain:number, net:number, gagne:boolean|null, dividendeConnu:boolean}}
 */
export function bilanTrioCroisement(jeu, miseParCombinaison, ordreArrivee, rapportReel) {
  const nbCombos = combinaisons(TAILLE_POOL_TRIO, 3);
  const mise = (miseParCombinaison || 0) * nbCombos;

  if (!jeu || !jeu.jouable) return { mise, gain: 0, net: -mise, gagne: false, dividendeConnu: true };
  if (!Array.isArray(ordreArrivee) || ordreArrivee.length < 3) {
    return { mise, gain: 0, net: -mise, gagne: null, dividendeConnu: false };
  }

  const top3 = ordreArrivee.slice(0, 3);
  const gagne = estSousEnsemble(top3, jeu.poolTrio);
  if (!gagne) return { mise, gain: 0, net: -mise, gagne: false, dividendeConnu: true };

  const rapport = Array.isArray(rapportReel) ? rapportReel.find((r) => memesNumeros(r.numeros, top3)) : null;
  if (!rapport) return { mise, gain: 0, net: -mise, gagne: true, dividendeConnu: false };

  const gain = (miseParCombinaison || 0) * rapport.dividende;
  return { mise, gain, net: gain - mise, gagne: true, dividendeConnu: true };
}
