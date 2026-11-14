// =============================================================================
// zeCouillon.js (v141, nov. 2026, a la demande de l'utilisateur)
//
// Selection "Ze Couillon" (pari ZEturf : le cheval doit finir EXACTEMENT 4e ;
// paye seulement a partir de 8 partants). Remplace "Populaire n° 1".
//
// Regle (v142, a la demande de l'utilisateur) : courses de TROT (attele ou
// monte) de EXACTEMENT 8 partants (non-partants deduits) ; parmi les chevaux
// de 4e, 5e et 6e cote (cote la plus recente ; ex aequo departages par le
// numero), on joue les 2 meilleurs PtH (fichier partants ; egalite -> plus
// petite cote). Sans PtH (course non importee) : 5e et 6e cotes (regle v141).
// Controle 02/01-18/10/2026 (271 courses de trot a 8 partants, cote finale) :
// 2 meilleurs PtH 35,4 % ; 5e + 6e cote 38,4 % ; les 3 chevaux 49,8 %.
//
// Etude (CSV Popularite 01/01-21/10/2026, cote finale) : 529 courses
// (1,8/jour) ; le 4e est l'une des 4e-6e cotes dans 49 % des courses ; un
// des 2 chevaux (5e + 6e cote) finit 4e dans 36,7 % des courses -> 2 mises,
// equilibre si le rapport moyen du Ze Couillon depasse 5,45 €. Rapports
// ZEturf a saisir a la main (pas fournis par le PMU).
// Fiche projet : "ze-couillon-4e-place-2026".
// =============================================================================

export const REGLE_ZE = { PARTANTS: 8, RANGS: [5, 6], CANDIDATS: [4, 5, 6] };

const estTrotTexte = (d) => /attel|mont|trot|^a$|^m$/i.test(String(d || '').trim());

/**
 * @param {Array<{numero:number, cote:number|null, nonPartant?:boolean, pth?:number|null}>} partants
 * @param {string} discipline
 * @returns {Array<{numero:number, rangCote:number, cote:number, pth:number|null, parPth:boolean}>} chevaux a jouer
 *   ([] si la course ne remplit pas les conditions ou si une cote manque).
 */
export function selectionZeCouillon(partants, discipline) {
  if (!estTrotTexte(discipline)) return [];
  const p = (partants || []).filter((h) => !h.nonPartant);
  if (p.length !== REGLE_ZE.PARTANTS) return [];
  if (p.some((h) => !(h.cote > 0))) return [];
  const tri = [...p].sort((a, b) => a.cote - b.cote || a.numero - b.numero);
  const cand = REGLE_ZE.CANDIDATS.map((r) => ({ numero: tri[r - 1].numero, rangCote: r, cote: tri[r - 1].cote, pth: typeof tri[r - 1].pth === 'number' ? tri[r - 1].pth : null }));
  if (cand.every((c) => c.pth != null)) {
    return [...cand].sort((a, b) => b.pth - a.pth || a.cote - b.cote).slice(0, 2)
      .sort((a, b) => a.rangCote - b.rangCote).map((c) => ({ ...c, parPth: true }));
  }
  return cand.filter((c) => REGLE_ZE.RANGS.includes(c.rangCote)).map((c) => ({ ...c, parPth: false }));
}
