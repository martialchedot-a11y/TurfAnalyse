// =============================================================================
// jeuxDuJour.js (oct. 2026, v129, a la demande explicite de l'utilisateur)
//
// Les QUATRE selections retenues apres les backtests 2026 (01/01 - 13/09) :
//   - 'favori' : "Favori populaire"            -> simple GAGNANT
//   - 'ia1'    : "Rang 1 IA Place"             -> simple GAGNANT + simple PLACE
//   - 'trot'   : "Regle trot gains faibles"    -> simple GAGNANT
//   - 'd4'     : "Nouveau D4" affine           -> simple GAGNANT
//
// Ce fichier ne contient que ce qui est NOUVEAU en v129 : l'affinage du
// "Nouveau D4" (cote 6 a 30 ET parmi les 4 plus petites cotes de la course
// ET Value <= -30) et le calcul du resultat d'un jeu. Les trois autres
// regles restent dans leurs fichiers (favoriPopulaire.js, topIAPlaceParser /
// favoriPopulaire.js, regleTrotGF.js - cette derniere FIGEE le 29/09/2026).
//
// Backtest de l'affinage (01/01 - 13/09/2026, rapports officiels) :
//   - nouveau D4, cote 6-30                     : 2 626 paris, 9,1 %, 111 %,
//     plus longue serie perdante 74 ;
//   - + parmi les 4 plus petites cotes          :   934 paris (3,8/jour),
//     13,8 %, 115 % (janv.-mai 115 / juin-sept. 114), serie perdante 32 ;
//   - + Value <= -30 (cheval tres joue)         :   424 paris (1,7/jour),
//     15,6 %, 115 % (111 / 122), serie perdante 23.
// Voir la fiche projet "affinage-nouveau-d4-2026".
//
// Fonctions pures, testables sans navigateur.
// =============================================================================

export const SELECTIONS = {
  favori: { cle: 'favori', nom: 'Favori populaire', court: 'Favori pop.', paris: ['G'] },
  ia1: { cle: 'ia1', nom: 'Rang 1 IA Placé', court: 'Rang 1 IA Placé', paris: ['G', 'P'] },
  trot: { cle: 'trot', nom: 'Règle trot « gains faibles »', court: 'Règle trot', paris: ['G'] },
  d4: { cle: 'd4', nom: 'Nouveau D4', court: 'Nouveau D4', paris: ['G'] },
  // v141 : Ze Couillon (ZEturf, cheval 4e exact), remplace "Populaire n° 1".
  // Pari 'Q' = 4e place ; suivi a part (hors bilan global : rapports ZEturf
  // saisis a la main).
  ze4: { cle: 'ze4', nom: 'Ze Couillon (4e place, ZEturf)', court: 'Ze Couillon', paris: ['Q'], horsGlobal: true }
};

export const ORDRE_SELECTIONS = ['favori', 'ia1', 'trot', 'd4', 'ze4'];

/** Nombre de "plus petites cotes" de la course parmi lesquelles le nouveau D4 doit figurer. */
export const RANG_COTE_MAX_D4 = 4;
/** Seuil de Value (cheval tres joue par rapport a sa cote probable). */
export const SEUIL_VALUE_D4 = -30;

/**
 * Rang de cote d'un cheval dans sa course : 1 = plus petite cote. Les
 * ex-aequo partagent le meme rang (rang = 1 + nombre de cotes strictement
 * inferieures). `null` si la cote du cheval est inconnue.
 * @param {number|null} cote
 * @param {Array<number|null>} cotesCourse - cotes de TOUS les partants.
 * @returns {number|null}
 */
export function rangDeCote(cote, cotesCourse) {
  if (!(cote > 0)) return null;
  let rang = 1;
  for (const c of cotesCourse || []) if (c > 0 && c < cote) rang++;
  return rang;
}

/**
 * Affinage v129 du "Nouveau D4".
 * @param {{statut:string|null, cote:number|null, cotesCourse:Array, value:number|null}} p
 *   `statut` = retour de `statutNouveauD4` (nouveauD4.js).
 * @returns {{niveau:'jouer'|'attente'|'non', rangCote:number|null, manque:string[]}}
 *   - 'jouer'   : les trois conditions sont remplies ;
 *   - 'attente' : nouveau D4 fiable a cote 6-30, mais rang de cote et/ou
 *                 Value pas (encore) remplis - peut basculer quand les cotes
 *                 bougent ;
 *   - 'non'     : pas un nouveau D4 exploitable (hors tranche de cote,
 *                 ferrure precedente incertaine, etc.).
 */
export function affinerNouveauD4({ statut, cote, cotesCourse, value }) {
  const rangCote = rangDeCote(cote, cotesCourse);
  if (statut !== 'jouer') return { niveau: 'non', rangCote, manque: [] };
  const manque = [];
  if (!(rangCote != null && rangCote <= RANG_COTE_MAX_D4)) manque.push('rang');
  if (!(typeof value === 'number' && value <= SEUIL_VALUE_D4)) manque.push('value');
  return { niveau: manque.length === 0 ? 'jouer' : 'attente', rangCote, manque };
}

/** Nombre de places payees en simple place (0 si moins de 4 partants). */
export function placesPayees(nbPartants) {
  if (!(nbPartants > 0) || nbPartants < 4) return 0;
  return nbPartants >= 8 ? 3 : 2;
}

/**
 * Resultat d'un jeu une fois l'arrivee connue, pour 1 euro par pari.
 * @param {{numero:number, paris:string[]}} jeu
 * @param {number[]} ordreArrivee - numeros dans l'ordre d'arrivee ([] = inconnue).
 * @param {number} nbPartants
 * @param {Array<{numero:number, dividende:number}>|undefined} rapportsG
 * @param {Array<{numero:number, dividende:number}>|undefined} rapportsP
 * @returns {null|{gagnant:boolean, place:boolean|null, mise:number, gain:number|null}}
 *   `null` si l'arrivee est inconnue ; `gain` = `null` si un rapport
 *   necessaire n'est pas encore connu.
 */
export function resultatJeu(jeu, ordreArrivee, nbPartants, rapportsG, rapportsP) {
  const joueP = jeu.paris.includes('P');
  // v134 : cheval non partant -> mise remboursee par le PMU, hors bilan.
  if (jeu.nonPartant) return { nonPartant: true, gagnant: false, place: joueP ? false : null, mise: 0, gain: 0, gainG: 0, gainP: joueP ? 0 : null };
  if (!Array.isArray(ordreArrivee) || ordreArrivee.length === 0) return null;
  // v141 : Ze Couillon (pari 'Q') : gagne si le cheval finit exactement 4e ;
  // rapport ZEturf saisi a la main (jeu.rapportZe).
  if (jeu.paris.includes('Q')) {
    if (ordreArrivee.length < 4) return null;
    const quatrieme = ordreArrivee[3] === jeu.numero;
    const g = quatrieme ? (jeu.rapportZe > 0 ? jeu.rapportZe : null) : 0;
    return { gagnant: quatrieme, place: null, mise: 1, gain: g, gainG: g, gainP: null, quatrieme };
  }
  const gagnant = ordreArrivee[0] === jeu.numero;
  const place = joueP ? ordreArrivee.slice(0, placesPayees(nbPartants)).includes(jeu.numero) : null;
  const div = (liste) => {
    const r = Array.isArray(liste) ? liste.find((x) => x.numero === jeu.numero) : null;
    return r ? r.dividende : null;
  };
  // gainG / gainP : retour de chaque pari (null = rapport pas encore connu).
  const gainG = gagnant ? div(rapportsG) : 0;
  const gainP = !joueP ? null : (place ? div(rapportsP) : 0);
  const incomplet = gainG == null || (joueP && gainP == null);
  return { gagnant, place, mise: jeu.paris.length, gain: incomplet ? null : gainG + (gainP || 0), gainG, gainP };
}

/**
 * Bilan d'une liste de jeux resolus (1 euro par pari).
 * @param {Array<{resultat:Object|null}>} jeux
 */
export function bilanJeux(jeux) {
  let n = 0; let nGagnants = 0; let mise = 0; let gain = 0; let enAttente = 0; let sansRapport = 0;
  for (const j of jeux || []) {
    const r = j.resultat;
    if (!r) { enAttente++; continue; }
    if (r.gain == null) { sansRapport++; continue; }
    if (r.nonPartant) continue;
    n++; mise += r.mise; gain += r.gain;
    if (r.gagnant || r.place) nGagnants++;
  }
  return { n, nGagnants, mise, gain, net: gain - mise, rendement: mise > 0 ? gain / mise : null, enAttente, sansRapport };
}

/**
 * Lignes du bilan de la page "Bilan" (v130), a partir de l'historique des
 * jeux resolus : une ligne par selection et par type de pari (le Rang 1 IA
 * Place a deux lignes : gagnant et place), plus le total. 1 euro par pari.
 * @param {Array<{sel:string, joueP:boolean, gagnant:boolean, place:boolean|null,
 *   gainG:number, gainP:number|null}>} records
 * @returns {{lignes:Array<{sel:string, pari:'G'|'P', n:number, reussis:number,
 *   mise:number, retour:number, net:number, rendement:number|null}>, total:Object}}
 */
export function bilanHistorique(records) {
  const vide = (sel, pari) => ({ sel, pari, n: 0, reussis: 0, mise: 0, retour: 0, net: 0, rendement: null });
  const lignes = [];
  for (const sel of ORDRE_SELECTIONS) for (const pari of SELECTIONS[sel].paris) lignes.push(vide(sel, pari));
  const total = vide('total', 'G+P');
  const ajouter = (l, retour) => { l.n++; l.mise++; l.retour += retour; if (retour > 0) l.reussis++; };
  for (const r of records || []) {
    if (r.nonPartant) continue; // v134 : mise remboursee
    if (!SELECTIONS[r.sel]) continue; // selection supprimee (ex. Populaire n° 1)
    const g = lignes.find((l) => l.sel === r.sel && l.pari === SELECTIONS[r.sel].paris[0]);
    if (!g) continue;
    // Une selection suivie a part (Ze Couillon) a sa ligne mais n'entre pas
    // dans le bilan global.
    const dansTotal = !SELECTIONS[r.sel].horsGlobal;
    ajouter(g, r.gainG || 0); if (dansTotal) ajouter(total, r.gainG || 0);
    if (r.joueP) {
      const p = lignes.find((l) => l.sel === r.sel && l.pari === 'P');
      if (p) { ajouter(p, r.gainP || 0); if (dansTotal) ajouter(total, r.gainP || 0); }
    }
  }
  for (const l of [...lignes, total]) { l.net = l.retour - l.mise; l.rendement = l.mise > 0 ? l.retour / l.mise : null; }
  return { lignes, total };
}

/** Minutes depuis minuit d'une heure "14h45" / "14:45" (Infinity si inconnue). */
function minutesHeure(h) {
  const m = String(h || '').match(/(\d{1,2})\s*[h:]\s*(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : Infinity;
}

/**
 * v140 : le Favori populaire ne se joue qu'UNE fois par jour. Si
 * l'historique contient plusieurs jeux "favori" le meme jour (decision qui a
 * bascule quand les cotes ont ete mises a jour apres coup), on garde celui
 * de la course la plus tot - le seul reellement jouable - et on renvoie les
 * identifiants des autres a supprimer. Les non-partants sont ignores.
 * @param {Array<{id:string, jour:string, sel:string, heure?:string, nonPartant?:boolean}>} records
 * @returns {string[]}
 */
export function doublonsFavoriParJour(records) {
  const parJour = new Map();
  for (const r of records || []) {
    if (r.sel !== 'favori' || r.nonPartant) continue;
    if (!parJour.has(r.jour)) parJour.set(r.jour, []);
    parJour.get(r.jour).push(r);
  }
  const ids = [];
  for (const liste of parJour.values()) {
    if (liste.length < 2) continue;
    liste.sort((a, b) => minutesHeure(a.heure) - minutesHeure(b.heure) || String(a.id).localeCompare(String(b.id)));
    for (const r of liste.slice(1)) ids.push(r.id);
  }
  return ids;
}
