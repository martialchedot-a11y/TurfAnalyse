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
// *** Origine des seuils de rentabilité *** : backtest réel sur 8 mois
// d'archives (janvier - 11 août 2026, 7437 courses, voir HEBERGEMENT.md).
// Pour chaque N de 1 à 8, réussite cumulée = probabilité qu'un des N
// premiers du classement gagne réellement la course (26,2% / 45,4% / 60,8% /
// 71,4% / 79,4% / 84,7% / 89,1% / 92,6%). Le seuil de rentabilité (rendement
// minimum requis pour compenser les pertes) = 1 / réussite cumulée :
//   N=2: 220% - N=3: 165% - N=4: 140% - N=5: 126% - N=6: 118% - N=7: 112% - N=8: 108%
// N=1 est volontairement exclu : sur le même backtest, le rapport moyen réel
// obtenu en jouant seulement le 1er (315%) reste EN DESSOUS de son seuil
// théorique (381%) — jouer un seul cheval n'est jamais rentable en pratique,
// contrairement à partir de N=2 où le rapport moyen réel dépasse largement
// le seuil (jusqu'à 674% pour un seuil de 108% sur le top 8).
//
// Le "rendement probable" d'une course donnée, pour un N choisi, est calculé
// avec les cotes RÉELLES du jour (pas les seuils historiques ci-dessus, qui
// ne servent que de comparaison) via la formule Dutching classique :
//   S = somme(1/cote_i) pour les N chevaux retenus
//   rendement = 1/S (identique au "rendement" affiché par l'utilisateur : un
//   Dutching sur S=0,825 donne 1/0,825 = 121,2% de rendement)
// On retient le plus GRAND N (2 à 8, limité par le nombre de chevaux cotés
// disponibles sur la course) dont le rendement dépasse son seuil de
// rentabilité — pour maximiser la couverture tout en restant rentable.
// =============================================================================

export const SEUILS_RENDEMENT_SIMPLE_GAGNANT = {
  2: 2.20,
  3: 1.65,
  4: 1.40,
  5: 1.26,
  6: 1.18,
  7: 1.12,
  8: 1.08
};

export const MISES_PRESETS_JEU_SIMPLE_GAGNANT = [10, 20, 30, 50, 75, 100, 150, 200];

/**
 * @param {Array} chevaux - result.chevaux (RaceAnalyzer.analyser), chaque
 *   élément avec `.classement` et `.cotePourAffichage`.
 * @returns {{rentable:true, n:number, chevaux:Array, s:number, rendement:number, seuil:number}
 *          |{rentable:false}}
 */
export function jeuSimpleGagnant(chevaux) {
  const avecCote = (chevaux || [])
    .filter((c) => c.cotePourAffichage > 0)
    .sort((a, b) => a.classement - b.classement);

  if (avecCote.length < 2) return { rentable: false };

  const maxN = Math.min(8, avecCote.length);
  let meilleurN = null;
  for (let n = 2; n <= maxN; n++) {
    const pool = avecCote.slice(0, n);
    const s = pool.reduce((acc, c) => acc + 1 / c.cotePourAffichage, 0);
    const rendement = 1 / s;
    if (rendement > SEUILS_RENDEMENT_SIMPLE_GAGNANT[n]) meilleurN = n;
  }
  if (meilleurN == null) return { rentable: false };

  const pool = avecCote.slice(0, meilleurN);
  const s = pool.reduce((acc, c) => acc + 1 / c.cotePourAffichage, 0);
  return { rentable: true, n: meilleurN, chevaux: pool, s, rendement: 1 / s, seuil: SEUILS_RENDEMENT_SIMPLE_GAGNANT[meilleurN] };
}

/**
 * Répartition des mises (méthode Dutching) pour un jeu rentable
 * (cf. jeuSimpleGagnant) et une mise totale souhaitée : mise_i = M x
 * (1/cote_i) / S ; gain si CE cheval gagne = mise_i x cote_i = M / S,
 * identique pour tous les chevaux du pool.
 * @param {Object} jeu - jeuSimpleGagnant(chevaux) avec rentable=true.
 * @param {number} miseTotale
 * @returns {Array<{numero:number, cote:number, mise:number, gain:number}>}
 */
export function misesJeuSimpleGagnant(jeu, miseTotale) {
  if (!jeu || !jeu.rentable || !(miseTotale > 0)) return [];
  return jeu.chevaux.map((c) => ({
    numero: c.entry.numero,
    cote: c.cotePourAffichage,
    mise: miseTotale * (1 / c.cotePourAffichage) / jeu.s,
    gain: miseTotale / jeu.s
  }));
}
