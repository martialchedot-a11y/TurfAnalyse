import { arrondiVBA } from './coteUtils.js';

// =============================================================================
// probabilityEngine.js
// Portage exact de `SimulerProbabilitesTop3` (VBA v6.0) : calcul analytique
// (Plackett-Luce) des probabilités de Victoire et de Top 3, à partir du
// ScoreGlobal de chaque cheval. Même température que coteProbable (75).
// =============================================================================

/**
 * @param {number[]} scoresGlobal
 * @returns {Array<{probVictoire:number, probTop2:number, probTop3:number, indiceConfiance:number}>}
 */
export function probabilites(scoresGlobal) {
  const n = scoresGlobal.length;
  if (n === 0) return [];
  const temperature = 75;

  const w = scoresGlobal.map((s) => Math.exp(s / temperature));
  const wTotal = w.reduce((a, b) => a + b, 0);

  const p1 = new Array(n).fill(0);
  const p2 = new Array(n).fill(0);
  const p3 = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    p1[i] = w[i] / wTotal;
  }

  for (let i = 0; i < n; i++) {
    let s2 = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      s2 += (w[j] / wTotal) * (w[i] / (wTotal - w[j]));
    }
    p2[i] = s2;
  }

  if (n >= 3) {
    for (let i = 0; i < n; i++) {
      let s3 = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        for (let k = 0; k < n; k++) {
          if (k === i || k === j) continue;
          s3 += (w[j] / wTotal) * (w[k] / (wTotal - w[j])) * (w[i] / (wTotal - w[j] - w[k]));
        }
      }
      p3[i] = s3;
    }
  }

  const probVictoire = Array.from({ length: n }, (_, i) => arrondiVBA(p1[i] * 100, 1));
  // Prob. Top2 = P(1er) + P(2e exactement) : p1/p2 etaient deja calcules
  // ci-dessus pour obtenir Prob Top3, mais jamais additionnes/exposes seuls
  // jusqu'ici. Sert de base au critere "Top2 fiable" (cf. basesEtDangers.js) :
  // plus precis que Prob Top3 pour estimer la chance qu'un cheval termine
  // precisement dans les 2 premiers (et non les 3 premiers).
  const probTop2 = Array.from({ length: n }, (_, i) => arrondiVBA((p1[i] + p2[i]) * 100, 1));
  const probTop3 = Array.from({ length: n }, (_, i) => arrondiVBA((p1[i] + p2[i] + p3[i]) * 100, 1));

  // Indice de confiance individuel : marge de ProbTop3 avec le cheval suivant
  // une fois trié par ProbTop3 décroissant (réplique la boucle de tri VBA).
  const ordre = Array.from({ length: n }, (_, i) => i).sort((a, b) => probTop3[b] - probTop3[a]);

  const indiceConfiance = new Array(n).fill(0);
  for (let pos = 0; pos < n; pos++) {
    const idx = ordre[pos];
    if (pos < n - 1) {
      const suivant = ordre[pos + 1];
      indiceConfiance[idx] = arrondiVBA(probTop3[idx] - probTop3[suivant], 1);
    } else {
      indiceConfiance[idx] = 0;
    }
  }

  return Array.from({ length: n }, (_, i) => ({
    probVictoire: probVictoire[i],
    probTop2: probTop2[i],
    probTop3: probTop3[i],
    indiceConfiance: indiceConfiance[i]
  }));
}
