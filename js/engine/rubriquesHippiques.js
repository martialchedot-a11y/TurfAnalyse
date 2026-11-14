// =============================================================================
// rubriquesHippiques.js (v139, oct. 2026, a la demande de l'utilisateur)
//
// Classement "purement hippique" d'une course a partir de 17 rubriques du
// fichier partants : MP, PtH, MN, RC, RX, MX, CX, IdC, CFP, OR, AR, PtR, PC,
// MA, TG, SC, R10. Sens de chaque rubrique mesure sur les donnees 2026
// (le n° 1 gagne le plus souvent) : plus haut = meilleur, sauf CX, CFP, PC,
// MA (plus bas = meilleur). Score = moyenne des rangs relatifs (rang /
// partants) ; rang 1 = meilleur classement hippique.
//
// Etude (fiche projet "classement-rubriques-vs-cote-2026") : dans les
// selections, le cheval classe 1er ou 2e par les rubriques a fait moins bien
// (regle trot 76 %, Populaire n° 1 99 %) que ceux classes 3e et au-dela
// (111-155 %). Affiche pour verification en reel, sans changer les regles.
// =============================================================================

import { RUBRIQUES } from './rubriques.js';

export const RUBRIQUES_HIPPIQUES = [
  ['MP', true], ['PtH', true], ['MN', true], ['RC', true], ['RX', true], ['MX', true], ['CX', false],
  ['IdC', true], ['CFP', false], ['OR', true], ['AR', true], ['PtR', true], ['PC', false], ['MA', false],
  ['TG', true], ['SC', true], ['R10', true]
];

const IDX = new Map(RUBRIQUES.map((r, i) => [r.nom, i]));

/** Valeur d'une rubrique pour un cheval enregistre (null si absente). */
export function valeurRubrique(h, nom) {
  if (nom === 'SC') return typeof h.sc === 'number' ? h.sc : null;
  if (nom === 'PtR') return typeof h.ptr === 'number' ? h.ptr : null;
  const i = IDX.get(nom);
  const v = i != null && Array.isArray(h.rubriques) ? h.rubriques[i] : null;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Rang "rubriques" de chaque partant d'une course.
 * @param {Array} horses - chevaux de la course (non-partants ignores).
 * @returns {Map<any, number>} numero -> rang (1 = meilleur) ; vide si les
 *   rubriques sont absentes (fichier ancien format).
 */
export function rangsRubriquesCourse(horses) {
  const partants = (horses || []).filter((h) => !h.nonPartant);
  const n = partants.length;
  const res = new Map();
  if (n < 2) return res;
  const sommes = new Map(partants.map((h) => [h.numero, { s: 0, k: 0 }]));
  for (const [nom, haut] of RUBRIQUES_HIPPIQUES) {
    const vals = partants.map((h) => ({ h, v: valeurRubrique(h, nom) })).filter((x) => x.v != null);
    if (vals.length < 2) continue;
    for (const { h, v } of vals) {
      const rang = 1 + vals.filter((x) => (haut ? x.v > v : x.v < v)).length;
      const e = sommes.get(h.numero); e.s += rang / n; e.k += 1;
    }
  }
  const scores = partants.map((h) => ({ numero: h.numero, sc: sommes.get(h.numero).k > 0 ? sommes.get(h.numero).s / sommes.get(h.numero).k : null }))
    .filter((x) => x.sc != null)
    .sort((a, b) => a.sc - b.sc || a.numero - b.numero);
  if (scores.length < 2) return res;
  scores.forEach((x, i) => res.set(x.numero, i + 1));
  return res;
}

/** Groupe d'un rang rubriques pour le suivi ("1-2", "3-5", "6+"). */
export function groupeRangRubriques(rang) {
  if (!(rang > 0)) return null;
  return rang <= 2 ? '1-2' : (rang <= 5 ? '3-5' : '6+');
}

/**
 * Suivi du Bilan (v139) : par selection et par groupe de rang rubriques,
 * nombre de paris gagnant, gagnants et retour (1 euro par pari, simple
 * gagnant seulement). Les jeux sans rang (course non importee, ancien
 * fichier) et les non-partants sont ignores.
 * @param {Array<{sel:string, rangRub?:number|null, gainG:number, nonPartant?:boolean}>} records
 * @returns {Map<string, Map<string, {n:number, reussis:number, retour:number}>>}
 */
export function suiviRangRubriques(records) {
  const out = new Map();
  for (const r of records || []) {
    if (r.nonPartant) continue;
    const g = groupeRangRubriques(r.rangRub);
    if (!g) continue;
    if (!out.has(r.sel)) out.set(r.sel, new Map());
    const m = out.get(r.sel);
    if (!m.has(g)) m.set(g, { n: 0, reussis: 0, retour: 0 });
    const e = m.get(g); e.n++; e.retour += r.gainG || 0; if ((r.gainG || 0) > 0) e.reussis++;
  }
  return out;
}
