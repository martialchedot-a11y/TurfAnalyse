// =============================================================================
// cotesCibles.js
// Portage de la sub VBA `TrouverCotesCibles` / `DeuxPlusProchesdirect`
// (feuille "Cotes cibles" du classeur Excel) : pour 4 cotes "cibles" de
// référence dérivées du nombre de partants (NP/4, NP/2, NP, NP x2), on
// cherche le cheval du champ dont la cote actuelle (colonne "cote actuelle"
// / W dans le classeur, ici `cotePourAffichage` calculé par RaceAnalyzer) en
// est la PLUS PROCHE, dans une tolerance de ±100% autour de la cible (la
// valeur par defaut proposee par l'InputBox de tolerance en VBA).
//
// Ces 4 cotes cibles servent de reperes classiques du turf (le "cheval a
// NP/4" est souvent lu comme un favori net, "NP" ou "NP x2" comme un
// outsider), independamment du Score Global/Value du Module 1.
// =============================================================================

const CIBLES = [
  { label: 'NP/4', calcul: (np) => np / 4 },
  { label: 'NP/2', calcul: (np) => np / 2 },
  { label: 'NP', calcul: (np) => np },
  { label: 'NP x2', calcul: (np) => np * 2 }
];

/**
 * @param {Array} chevaux - `result.chevaux` renvoye par RaceAnalyzer.analyser
 *   (chaque element a `.entry.numero` et `.cotePourAffichage`).
 * @param {number} nbPartants
 * @param {number} tolerance - 1.0 = ±100% autour de la cible (valeur par
 *   defaut de la sub VBA d'origine, proposee dans son InputBox).
 * @returns {Array<{label:string, cible:number, horse: {numero:number, cote:number}|null}>}
 */
export function calculerCotesCibles(chevaux, nbPartants, tolerance = 1.0) {
  if (!(nbPartants > 0)) return [];

  return CIBLES.map(({ label, calcul }) => {
    const cible = calcul(nbPartants);
    const borneMin = cible * (1 - tolerance);
    const borneMax = cible * (1 + tolerance);

    let meilleur = null; // { numero, cote, diff }
    for (const c of chevaux) {
      const cote = c.cotePourAffichage;
      if (cote == null || !(cote > 0)) continue;
      if (cote < borneMin || cote > borneMax) continue;

      const diff = Math.abs(cote - cible);
      if (!meilleur || diff < meilleur.diff) {
        meilleur = { numero: c.entry.numero, cote, diff };
      }
    }

    return {
      label,
      cible,
      horse: meilleur ? { numero: meilleur.numero, cote: meilleur.cote } : null
    };
  });
}
