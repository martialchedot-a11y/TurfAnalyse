// =============================================================================
// jeuSimpleGP.js (sept. 2026, a la demande explicite de l'utilisateur)
//
// Remplace ENTIEREMENT, pour la selection/le jeu affiche/les bilans, l'ancien
// moteur "Jeu Simple Gagnant" (Value<=-30 + dominance stricte MX+OR+MA, voir
// jeuSimpleGagnant.js) - motif invoque par l'utilisateur : "le signal
// (value<=-30 + filtre MX+OR+MA) n'a plus grand interet puisque non
// rentable" (edge mesure en nette erosion, voir commentaire d'en-tete de
// jeuSimpleGagnant.js, 150-250% de rendement en 2024 contre ~103% sur les 12
// derniers mois). jeuSimpleGagnant.js n'est pas supprime (fonctions
// generiques encore utilisees : `misesJeuSimpleGagnant`, `bilanJeuSimpleGagnant`,
// `rendementBilan`, `cumulerBilansJournaliers`, `SEUIL_VALUE_SIMPLE_GAGNANT`)
// mais son moteur de SELECTION (`jeuSimpleGagnant()`, dominance MX+OR+MA)
// n'est plus appele nulle part dans l'UI/les bilans.
//
// Nouveau signal ("Simple G/P") : croisement du Top 5 IA Place Turf BZH du
// jour (voir topIAPlaceParser.js) avec notre pool Value<=-30 (meme seuil que
// l'ancien moteur) - deja explore et documente comme le croisement
// "IA Place x Value<=-30" (voir candidatsIAPlaceValueHtml, HEBERGEMENT.md) :
// sur 214 jours (n=500), reussite Place 75,0% / rendement 101,5%, reussite
// Gagnant 45,8% / rendement 95,4%.
//
// Methode de mise, a la demande explicite de l'utilisateur : "le simple
// place est a privilegier, le simple Gagnant ne pouvant etre envisage que
// pour le top 1 IA place" :
//   - Simple PLACE : joue sur TOUS les chevaux du croisement (Top 5 IA Place,
//     tous rangs 1 a 5, ET Value<=-30), pari PRIORITAIRE.
//   - Simple GAGNANT : joue UNIQUEMENT si, parmi ce meme croisement, le
//     cheval au rang IA 1 y figure (il ne peut y avoir qu'un seul cheval au
//     rang IA 1 par course) - sinon aucun Simple Gagnant n'est propose.
// Les deux paris utilisent une repartition Dutching (mise proportionnelle a
// 1/cote, comme l'ancien moteur - voir `misesJeuSimpleGagnant`, reutilisee
// telle quelle ici) sur leurs pools respectifs.
// =============================================================================

import { SEUIL_VALUE_SIMPLE_GAGNANT, misesJeuSimpleGagnant, bilanJeuSimpleGagnant } from './jeuSimpleGagnant.js';
import { trouverRangIAPlace } from './topIAPlaceParser.js';

export { SEUIL_VALUE_SIMPLE_GAGNANT, misesJeuSimpleGagnant };

/**
 * Construit un pool Dutching (mise proportionnelle a 1/cote) a partir d'une
 * liste de chevaux (elements de result.chevaux, avec `.cotePourAffichage`).
 * Copie locale de la fonction du meme nom dans jeuSimpleGagnant.js (non
 * exportee la-bas).
 * @param {Array} chevaux
 * @returns {{chevaux:Array, n:number, s:number, rendement:number}}
 */
function poolDutching(chevaux) {
  const s = chevaux.reduce((acc, c) => acc + 1 / c.cotePourAffichage, 0);
  return { chevaux, n: chevaux.length, s, rendement: 1 / s };
}

/**
 * "Simple G/P" (sept. 2026) : croise le pool Value<=-30 (meme seuil que
 * l'ancien Jeu Simple Gagnant) avec le Top 5 IA Place Turf BZH du jour
 * importe (tous rangs 1 a 5). Voir commentaire d'en-tete pour la methode
 * complete.
 * @param {Array} chevaux - result.chevaux (RaceAnalyzer.analyser).
 * @param {Array|null} topIAPlace - chargerTopIAPlace() (app.js).
 * @param {string} lieu - hippodrome (normalise en interne par trouverRangIAPlace).
 * @param {number} numeroCourse
 * @returns {{rentable:false}
 *          |{rentable:true,
 *             place:{chevaux:Array,n:number,s:number,rendement:number},
 *             gagnant:{chevaux:Array,n:number,s:number,rendement:number}|null,
 *             rangsIA:Array<{numero:number, rang:number}>}}
 *   `rentable:false` si aucun cheval Value<=-30 ne figure dans le Top 5 IA
 *   Place du jour (ou si le Top 5 IA Place n'a pas ete importe). `place` =
 *   pool Dutching de TOUS les chevaux du croisement (rangs 1 a 5), toujours
 *   present si `rentable:true`. `gagnant` = pool Dutching a 1 seul cheval
 *   (celui au rang IA 1), uniquement s'il fait partie du croisement -
 *   `null` sinon (aucun Simple Gagnant proposable cette course-la).
 */
export function jeuSimpleGP(chevaux, topIAPlace, lieu, numeroCourse) {
  const poolValue = (chevaux || []).filter((c) => typeof c.value === 'number' && c.value <= SEUIL_VALUE_SIMPLE_GAGNANT);
  if (poolValue.length === 0 || !topIAPlace) return { rentable: false };

  const avecRangIA = poolValue
    .map((c) => ({ cheval: c, rangIA: trouverRangIAPlace(topIAPlace, lieu, numeroCourse, c.entry.numero) }))
    .filter((x) => x.rangIA != null)
    .sort((a, b) => a.rangIA - b.rangIA);
  if (avecRangIA.length === 0) return { rentable: false };

  const place = poolDutching(avecRangIA.map((x) => x.cheval));
  const gagnantMatch = avecRangIA.find((x) => x.rangIA === 1) || null;
  const gagnant = gagnantMatch ? poolDutching([gagnantMatch.cheval]) : null;

  return {
    rentable: true,
    place,
    gagnant,
    rangsIA: avecRangIA.map((x) => ({ numero: x.cheval.entry.numero, rang: x.rangIA }))
  };
}

/**
 * Bilan financier (hypothetique) du pari Simple PLACE du "Simple G/P" :
 * contrairement au Simple Gagnant (un seul vainqueur possible), PLUSIEURS
 * chevaux du pool peuvent se placer simultanement - chacun rapporte alors
 * son propre dividende officiel sur sa propre mise (repartition Dutching).
 * @param {{chevaux:Array, s:number}} poolPlace - `jeu.place` de `jeuSimpleGP`.
 * @param {number} miseTotale
 * @param {Array<{numero:number, dividende:number}>|undefined} rapportsPlace - extraireRapportsSimplePlace(json) (js/engine/pmuApi.js).
 * @param {number[]} numerosPlaces - numeros des chevaux effectivement places
 *   (arrivee officielle, tronquee au nombre de places payees de la course -
 *   `nombrePlacesPayees(nbPartants)`, cotesCibles.js).
 * @returns {{mise:number, gain:number, net:number, dividendeConnu:boolean}}
 */
export function bilanPlaceSimpleGP(poolPlace, miseTotale, rapportsPlace, numerosPlaces) {
  if (!poolPlace || !Array.isArray(poolPlace.chevaux) || poolPlace.chevaux.length === 0 || !(miseTotale > 0)) {
    return { mise: 0, gain: 0, net: 0, dividendeConnu: true };
  }
  const places = poolPlace.chevaux.filter((c) => (numerosPlaces || []).includes(c.entry.numero));
  if (places.length === 0) return { mise: miseTotale, gain: 0, net: -miseTotale, dividendeConnu: true };

  const mises = misesJeuSimpleGagnant(poolPlace, miseTotale);
  let gain = 0;
  let manque = false;
  for (const c of places) {
    const m = mises.find((mm) => mm.numero === c.entry.numero);
    const r = Array.isArray(rapportsPlace) ? rapportsPlace.find((rr) => rr.numero === c.entry.numero) : null;
    if (!m || !r) { manque = true; continue; }
    gain += m.mise * r.dividende;
  }
  if (manque) return { mise: miseTotale, gain: 0, net: -miseTotale, dividendeConnu: false };
  return { mise: miseTotale, gain, net: gain - miseTotale, dividendeConnu: true };
}

/**
 * Bilan financier (hypothetique) complet du "Simple G/P" pour une course :
 * combine le bilan Simple Place (`bilanPlaceSimpleGP`, sur `jeu.place`,
 * toujours joue si `jeu.rentable`) et, s'il existe, le bilan Simple Gagnant
 * (reutilise `bilanJeuSimpleGagnant` de jeuSimpleGagnant.js, sur `jeu.gagnant`).
 * @param {Object} jeu - resultat de `jeuSimpleGP` (`rentable:true`).
 * @param {number} misePlaceTotale
 * @param {number} miseGagnantTotale
 * @param {Array<{numero:number, dividende:number}>|undefined} rapportsGagnant
 * @param {Array<{numero:number, dividende:number}>|undefined} rapportsPlace
 * @param {number[]} numerosPlaces
 * @param {number} vrai1 - numero du vainqueur reel (1er de l'arrivee).
 * @returns {{place:{mise:number,gain:number,net:number,dividendeConnu:boolean},
 *            gagnant:{mise:number,gain:number,net:number,gagne:boolean,dividendeConnu:boolean}|null}}
 */
export function bilanJourSimpleGP(jeu, misePlaceTotale, miseGagnantTotale, rapportsGagnant, rapportsPlace, numerosPlaces, vrai1) {
  const place = bilanPlaceSimpleGP(jeu.place, misePlaceTotale, rapportsPlace, numerosPlaces);
  const gagnant = jeu.gagnant ? bilanJeuSimpleGagnant(jeu.gagnant, miseGagnantTotale, rapportsGagnant, vrai1) : null;
  return { place, gagnant };
}
