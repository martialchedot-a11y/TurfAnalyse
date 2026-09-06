// =============================================================================
// jeuCoupleTrioCroisement.js
// "Jeu Croisement Couplé/Trio" (aout 2026, a la demande de l'utilisateur) :
// mise flat 1e (ou plus) par combinaison sur un GROUPE DE CHEVAUX QUALIFIES
// obtenu en croisant 4 rubriques (R10, TG, OR, IdC) - score par cheval =
// nombre de fois qu'il figure dans le top-3 de CHACUNE de ces 4 rubriques
// (0 a 4). Un cheval est "qualifie" si son score >= SEUIL_QUALIFICATION_CROISEMENT.
//
// *** Origine (aout 2026) *** : a la suite d'un backtest de reussite sur 8
// mois d'archives, l'utilisateur a demande une validation en argent REEL. Un
// echantillon de 51 a 59 courses (1 course sur ~115, rapports recuperes via
// l'API PMU rapports-definitifs), avec un pool alors de TAILLE FIXE (3
// chevaux pour le Couple, 4 pour le Trio, toujours completes par depart
// (somme des rangs) meme quand moins de chevaux avaient un accord reel entre
// rubriques), donnait : Couple Gagnant rendement reel 148,5% (n=59, robuste),
// Trio rendement reel 128,7% (n=51, plus fragile - voir HEBERGEMENT.md pour
// le detail complet de cette premiere validation).
//
// *** Revu (v2, pool a TAILLE VARIABLE) *** : l'utilisateur a fait remarquer
// qu'un pool toujours complete a 3 ou 4 chevaux force parfois un cheval
// "de remplissage" (retenu par le seul departage, sans accord reel entre
// rubriques) - deja visible via l'ancien indice de confiance (score minimal
// du pool). Plutot que de completer artificiellement, le pool est desormais
// le GROUPE de tous les chevaux qualifies (score >= 3/4), de taille
// naturellement variable course par course : 0, 1, 2, 3 ou 4+ chevaux.
// Backtest de REUSSITE sur l'archive complete (8 mois, courses 8-16
// partants, 6720 courses), segmente par taille du groupe qualifie :
//   - Couple (paire(s) parmi le groupe) : taille=2 (48,5% des courses) ->
//     8,3% de reussite (n=3262, 1 seule combinaison jouee) ; taille=3
//     (14,1% des courses) -> 22,7% de reussite (n=948, 3 combinaisons) -
//     cette derniere correspond presque exactement a l'ancien filtre
//     "confiance >= 3" applique au pool fixe (22,8%), ce qui confirme la
//     coherence des deux methodes sur ce cas. Taille=4 (n=4 seulement) trop
//     rare pour conclure - plafonnee par securite (voir PLAFOND_POOL_CROISEMENT).
//   - Trio (triplet(s) parmi le groupe) : necessite au moins 3 chevaux
//     qualifies. Taille=3 (14,1% des courses) -> 5,4% de reussite (n=948, 1
//     seule combinaison) ; taille=4 (n=4) trop rare pour conclure.
// *** Prudence *** : ces chiffres de reussite (taille variable) ne sont PAS
// encore verifies en argent reel a ce niveau de detail - seuls les chiffres
// globaux de la version precedente (pool fixe) l'ont ete. L'echantillon
// global reste petit (51-59 courses) compare aux 3000-7000+ courses des
// autres backtests de cette appli.
// =============================================================================

import { RUBRIQUES } from './rubriques.js';

// Les 4 rubriques croisees (voir origine ci-dessus) : indices dans RUBRIQUES.
const RUB_NOMS_CROISEMENT = ['R10', 'TG', 'OR', 'IdC'];
const RUB_IDX_CROISEMENT = RUB_NOMS_CROISEMENT.map((n) => RUBRIQUES.findIndex((r) => r.nom === n));

// Score minimal (sur 4) pour qu'un cheval soit retenu dans le "groupe
// qualifie" (voir origine ci-dessus pour les chiffres de reussite par
// taille de groupe). Un cheval avec un score < ce seuil n'est jamais inclus
// dans un pool, meme s'il n'y a personne d'autre pour completer.
export const SEUIL_QUALIFICATION_CROISEMENT = 3;

// Nombre minimal de chevaux qualifies pour que le pari soit jouable.
export const MIN_CHEVAUX_COUPLE = 2;
export const MIN_CHEVAUX_TRIO = 3;

// Securite si le groupe qualifie est exceptionnellement grand (rarissime en
// pratique - au plus 4 chevaux observes sur 6720 courses de l'archive) :
// on ne retient jamais plus de ce nombre de chevaux, pour rester dans la
// zone testee et eviter un nombre de combinaisons demesure.
export const PLAFOND_POOL_CROISEMENT = 4;

// Fourchette de partants retenue (a la demande de l'utilisateur, aout 2026) :
// EN DESSOUS de 8 partants, le PMU ne propose souvent QUE le Couple Ordre /
// Trio Ordre (paris ou l'ORDRE d'arrivee compte) au lieu du Couple Gagnant /
// Trio (ordre indifferent) sur lesquels ce module est construit - deja
// observe lors de l'echantillonnage reel (3 courses <8 partants exclues
// pour cette raison, voir HEBERGEMENT.md). AU-DESSUS de 16 partants, borne
// haute demandee par l'utilisateur. Cette fourchette (8-16) est aussi celle
// deja utilisee ailleurs dans l'appli pour "Top base" (voir
// MIN/MAX_PARTANTS_FEU_VERT, js/app.js).
export const MIN_PARTANTS_CROISEMENT = 8;
export const MAX_PARTANTS_CROISEMENT = 16;

export const MISES_PRESETS_CROISEMENT = [1, 2, 3, 5, 10];

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
 * capture par un pool plus large.
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
 * Construit le "groupe qualifie" (score >= SEUIL_QUALIFICATION_CROISEMENT),
 * plafonne a PLAFOND_POOL_CROISEMENT chevaux (les meilleurs, en cas
 * d'exception rarissime).
 * @param {Array} classement - classementCroisement(chevaux).
 * @returns {Array<{numero:number, score:number, sommeRangs:number}>}
 */
function groupeQualifie(classement) {
  return classement.filter((x) => x.score >= SEUIL_QUALIFICATION_CROISEMENT).slice(0, PLAFOND_POOL_CROISEMENT);
}

/**
 * @param {Array} chevaux - voir classementCroisement.
 * @returns {{
 *   jouable: boolean,
 *   classement: Array,
 *   groupeQualifie: Array,
 *   coupleJouable: boolean,
 *   poolCouple: number[]|null,
 *   confianceCouple: number|null,
 *   trioJouable: boolean,
 *   poolTrio: number[]|null,
 *   confianceTrio: number|null
 * }}
 *   `jouable` = coupleJouable OU trioJouable (au moins un des deux paris
 *   possible). `confiance*` = score (>= SEUIL_QUALIFICATION_CROISEMENT) du
 *   membre le plus faible du pool concerne, `null` si ce pari n'est pas
 *   jouable.
 */
export function jeuCoupleTrioCroisement(chevaux) {
  const valides = (chevaux || []).filter((c) => c && c.entry && typeof c.entry.numero === 'number');
  if (valides.length < MIN_PARTANTS_CROISEMENT || valides.length > MAX_PARTANTS_CROISEMENT) {
    return { jouable: false, classement: [], groupeQualifie: [], coupleJouable: false, poolCouple: null, confianceCouple: null, trioJouable: false, poolTrio: null, confianceTrio: null };
  }

  const classement = classementCroisement(valides);
  const groupe = groupeQualifie(classement);

  const coupleJouable = groupe.length >= MIN_CHEVAUX_COUPLE;
  const trioJouable = groupe.length >= MIN_CHEVAUX_TRIO;

  return {
    jouable: coupleJouable || trioJouable,
    classement,
    groupeQualifie: groupe,
    coupleJouable,
    poolCouple: coupleJouable ? groupe.map((x) => x.numero) : null,
    confianceCouple: coupleJouable ? Math.min(...groupe.map((x) => x.score)) : null,
    trioJouable,
    poolTrio: trioJouable ? groupe.map((x) => x.numero) : null,
    confianceTrio: trioJouable ? Math.min(...groupe.map((x) => x.score)) : null
  };
}

/**
 * Bilan financier REEL du Couple Gagnant pour une course : mise
 * `miseParCombinaison` sur CHACUNE des paires du pool (taille variable,
 * 2 a PLAFOND_POOL_CROISEMENT chevaux qualifies - voir origine en tete de
 * fichier). Capture si les 2 premiers de l'arrivee sont tous les deux dans
 * le pool (peu importe l'ordre). En cas de capture, le dividende reel est
 * celui de la combinaison EXACTEMENT gagnante (une seule des combinaisons
 * jouees paie).
 *
 * Si le Couple n'est PAS jouable pour cette course (moins de
 * MIN_CHEVAUX_COUPLE chevaux qualifies), AUCUNE mise n'est engagee (mise=0,
 * net=0) : contrairement a l'ancienne version a pool fixe, on ne force plus
 * de pari sur un pool incomplet.
 *
 * @param {Object} jeu - jeuCoupleTrioCroisement(chevaux).
 * @param {number} miseParCombinaison - en euros, mise unitaire par combinaison.
 * @param {number[]|undefined} ordreArrivee - numeros dans l'ordre d'arrivee
 *   (au moins les 2 premiers) ; undefined/vide si l'arrivee n'est pas encore connue.
 * @param {Array<{numeros:number[], dividende:number}>|undefined} rapportReel -
 *   extraireRapportsCoupleGagnant(json) (js/engine/pmuApi.js).
 * @returns {{mise:number, gain:number, net:number, gagne:boolean|null, dividendeConnu:boolean}}
 *   gagne=null si l'arrivee n'est pas encore connue.
 */
export function bilanCoupleCroisement(jeu, miseParCombinaison, ordreArrivee, rapportReel) {
  if (!jeu || !jeu.coupleJouable) return { mise: 0, gain: 0, net: 0, gagne: false, dividendeConnu: true };

  const nbCombos = combinaisons(jeu.poolCouple.length, 2);
  const mise = (miseParCombinaison || 0) * nbCombos;

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
 * Bilan financier REEL du Trio pour une course : meme principe que
 * bilanCoupleCroisement, avec un pool de taille variable (3 a
 * PLAFOND_POOL_CROISEMENT chevaux qualifies) et les 3 premiers de
 * l'arrivee a capturer. Mise=0 si le Trio n'est pas jouable pour cette
 * course (moins de MIN_CHEVAUX_TRIO chevaux qualifies).
 * @param {Object} jeu - jeuCoupleTrioCroisement(chevaux).
 * @param {number} miseParCombinaison
 * @param {number[]|undefined} ordreArrivee - au moins les 3 premiers.
 * @param {Array<{numeros:number[], dividende:number}>|undefined} rapportReel -
 *   extraireRapportsTrio(json) (js/engine/pmuApi.js).
 * @returns {{mise:number, gain:number, net:number, gagne:boolean|null, dividendeConnu:boolean}}
 */
export function bilanTrioCroisement(jeu, miseParCombinaison, ordreArrivee, rapportReel) {
  if (!jeu || !jeu.trioJouable) return { mise: 0, gain: 0, net: 0, gagne: false, dividendeConnu: true };

  const nbCombos = combinaisons(jeu.poolTrio.length, 3);
  const mise = (miseParCombinaison || 0) * nbCombos;

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
