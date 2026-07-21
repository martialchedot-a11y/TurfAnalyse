// =============================================================================
// rubriques.js
// Configuration du "Module 2" (feuille Config_Rubriques du classeur Excel) :
// 18 rubriques techniques, leur sens de tri, et la selection de 5 rubriques
// + 3 associations de rubriques par discipline. Valeurs recopiees telles
// quelles depuis la feuille Config_Rubriques de TurfAnalyse2026v6.1.xlsm.
// =============================================================================

// Ordre et sens de tri (true = plus haut est meilleur / descendant,
// false = plus bas est meilleur / ascendant) — identique a rubDesc() en VBA.
export const RUBRIQUES = [
  { nom: 'RJ', desc: true },   // 0
  { nom: 'RE', desc: true },   // 1
  { nom: 'ED', desc: true },   // 2
  { nom: 'MP', desc: true },   // 3
  { nom: 'PtH', desc: true },  // 4
  { nom: 'MN', desc: true },   // 5
  { nom: 'RC', desc: true },   // 6
  { nom: 'RX', desc: true },   // 7
  { nom: 'MX', desc: true },   // 8
  { nom: 'CX', desc: false },  // 9
  { nom: 'IdC', desc: true },  // 10
  { nom: 'CFP', desc: true },  // 11
  { nom: 'OR', desc: true },   // 12
  { nom: 'PC', desc: false },  // 13
  { nom: 'MA', desc: false },  // 14
  { nom: 'AR', desc: true },   // 15
  { nom: 'TG', desc: true },   // 16
  { nom: 'R10', desc: true }   // 17
];

// Top 5 rubriques utilisees pour le classement Top-N, par discipline
// canonique (indices dans RUBRIQUES). Copie de Config_Rubriques!B2:F6.
const SEL_RUBS = {
  ATTELE: [17, 5, 16, 15, 12],
  MONTE: [17, 5, 15, 12, 3],
  PLAT: [17, 7, 16, 5, 6],
  HAIES: [3, 12, 17, 14, 16],
  STEEPLE: [5, 12, 7, 17, 10]
};

// 3 associations de rubriques (paires [A, B]) par discipline canonique.
// Copie de Config_Rubriques!B10:G14.
const ASSOCIATIONS = {
  ATTELE: [[16, 17], [5, 17], [15, 17]],
  MONTE: [[5, 17], [15, 17], [12, 17]],
  PLAT: [[16, 17], [15, 17], [7, 10]],
  HAIES: [[3, 12], [3, 17], [3, 5]],
  STEEPLE: [[7, 10], [12, 17], [7, 12]]
};

// Discipline par defaut si non reconnue (comme le "Case Else" du VBA).
const DEFAULT_SEL = [0, 1, 2, 3, 4];
const DEFAULT_ASSOC = [[0, 1], [2, 3], [4, 5]];

export function selRubsPourDiscipline(disciplineCanonique) {
  return SEL_RUBS[disciplineCanonique] || DEFAULT_SEL;
}

export function associationsPourDiscipline(disciplineCanonique) {
  return ASSOCIATIONS[disciplineCanonique] || DEFAULT_ASSOC;
}

// Nombre de chevaux retenus par rubrique pour le classement Top-N
// (Config_Rubriques / "Analyse complete courses" cellule C1 = 3 dans le
// classeur d'origine).
export const NB_TOP_DEFAUT = 3;

// -------------------------------------------------------------------
// Utilitaires de classement Top-N par rubrique, partages entre le Module 1
// (bonus rubriques ajoute au Score Global, voir scoreRubriques.js) et le
// Module 2 (Base(s) possible(s) / Danger(s), voir basesEtDangers.js) : les
// deux modules VBA reutilisent la meme logique de tri (GetRubriquesParDiscipline
// + boucle de tri par bulles avec IsNumeric), portee ici une seule fois.
// -------------------------------------------------------------------
export function estNumerique(v) {
  return v !== null && v !== undefined && !Number.isNaN(v);
}

/**
 * Classement Top-N d'une rubrique : les valeurs numeriques sont triees selon
 * le sens de la rubrique (desc ou asc) ; les valeurs manquantes sont
 * toujours repoussees en fin de classement (comme le tri VBA d'origine, qui
 * ne swap jamais deux valeurs non-numeriques entre elles -> ordre d'entree
 * preserve pour elles, via un tri stable).
 * @param {Array} chevaux - chaque element a `.entry.numero` et `.entry.rubriques`.
 * @param {number} rubIdx - index dans RUBRIQUES.
 * @param {number} nbTop
 * @returns {number[]} les numeros des nbTop meilleurs chevaux pour cette rubrique.
 */
export function topNPourRubrique(chevaux, rubIdx, nbTop) {
  const desc = RUBRIQUES[rubIdx].desc;
  const arr = chevaux.map((c) => ({ numero: c.entry.numero, val: c.entry.rubriques?.[rubIdx] ?? null }));
  arr.sort((a, b) => {
    const aNum = estNumerique(a.val);
    const bNum = estNumerique(b.val);
    if (aNum && bNum) return desc ? b.val - a.val : a.val - b.val;
    if (aNum && !bNum) return -1;
    if (!aNum && bNum) return 1;
    return 0;
  });
  return arr.slice(0, nbTop).map((x) => x.numero);
}
