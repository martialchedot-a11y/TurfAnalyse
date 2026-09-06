// =============================================================================
// coteUtils.js
// Portage de la fonction VBA `ConvertirCote` + de l'arrondi VBA (banker's
// rounding / round-half-to-even), identique à la version Swift (TurfEngine).
// =============================================================================

/**
 * Convertit une valeur brute (texte issu d'un CSV, virgule décimale
 * française, espaces, "NP", champ vide...) en Number, ou 0 si non
 * interprétable. Réplique exactement `ConvertirCote()` du VBA.
 * @param {string|null|undefined} valeur
 * @returns {number}
 */
export function convertirCote(valeur) {
  if (valeur === null || valeur === undefined) return 0;
  let str = String(valeur).trim();
  if (str === '') return 0;

  const direct = Number(str);
  if (!Number.isNaN(direct) && str !== '') return direct;

  str = str.replace(/,/g, '.').replace(/\s/g, '');
  const parsed = Number(str);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Réplique la fonction `Round()` de VBA : arrondi "au pair" (banker's
 * rounding / round-half-to-even), PAS l'arrondi "au-dessus" habituel de
 * `Math.round`. Important pour les valeurs qui alimentent des seuils de
 * décision (Value, probabilités).
 * @param {number} valeur
 * @param {number} decimales
 * @returns {number}
 */
export function arrondiVBA(valeur, decimales = 0) {
  const facteur = Math.pow(10, decimales);
  const x = valeur * facteur;
  const floor = Math.floor(x);
  const diff = x - floor;
  const EPSILON = 1e-9; // tolérance pour les imprécisions binaires (ex. 0.49999999999997)
  let rounded;
  if (diff < 0.5 - EPSILON) {
    rounded = floor;
  } else if (diff > 0.5 + EPSILON) {
    rounded = floor + 1;
  } else {
    // Pile à 0.5 (aux imprécisions flottantes près) : arrondi vers le pair le plus proche.
    rounded = floor % 2 === 0 ? floor : floor + 1;
  }
  return rounded / facteur;
}
