// =============================================================================
// populaireN1.js (v138, oct. 2026, a la demande de l'utilisateur)
//
// 5e selection, EN OBSERVATION (suivie sur le papier, pas jouee) :
// "Populaire n° 1" - simple GAGNANT, tous les chevaux retenus.
//
// Regle (fichier Popularite Turf BZH, courses francaises hors Mons) :
//   1. cheval le plus suivi de sa course (Rang de popularite 1) ;
//   2. 3e cote de sa course (donc non favori) ;
//   3. cote de 4 a 8 (4 inclus, 8 exclu) ;
//   4. Note IA parmi les 3 meilleures de sa course.
//
// Backtest (CSV Popularite 01/01 - 21/10/2026, rapport = cote finale PMU du
// CSV) : 476 paris (1,6/jour), 20,2 % de gagnants, rendement gagnant 119 %
// (janv.-mars 120 / avril-juin 114 / juil.-oct. 123), 111 % sans les 5 plus
// gros gains. Version sans le filtre "3e cote" (n° 1 popularite non favori,
// cote 4-8, Note IA top 3) : 1 305 paris, 108 %, aucun mois sous 90 %.
// Regle choisie apres de nombreux essais : suivi reel avant de la jouer.
// Voir la fiche projet "popularite-n1-non-favori-2026".
//
// Fonctions pures, testables sans navigateur.
// =============================================================================

import { rangDeCote } from './jeuxDuJour.js';

export const REGLE_POP1 = { COTE_MIN: 4, COTE_MAX: 8, RANG_COTE: 3, RANG_NOTE_MAX: 3 };

/** Normalise un nom d'hippodrome : majuscules sans accents, separateurs -> espace. */
export function normaliserHippodrome(nom) {
  return String(nom || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

// Hippodromes francais du backtest (base turf.bzh, zone France), Mons
// (Belgique) exclu.
export const HIPPODROMES_FRANCAIS = new Set([
  'AGEN', 'AIX LES BAINS', 'AMIENS', 'ANGERS', 'ARGENTAN', 'AUTEUIL', 'BEAUMONT DE LOMAGNE',
  'BORDEAUX LE BOUSCAT', 'CABOURG', 'CAEN', 'CAGNES SUR MER', 'CAVAILLON', 'CHANTILLY', 'CHARTRES',
  'CHATEAUBRIANT', 'CHERBOURG', 'CHOLET', 'CLAIREFONTAINE', 'COMPIEGNE', 'CORDEMAIS', 'CRAON', 'DAX',
  'DEAUVILLE', 'DIEPPE', 'DIVONNE LES BAINS', 'ENGHIEN', 'FEURS', 'FONTAINEBLEAU', 'GRAIGNES', 'HYERES',
  'LA CAPELLE', 'LA TESTE', 'LAVAL', 'LE CROISE LAROCHE', 'LE LION D ANGERS', 'LE MANS',
  'LE MONT SAINT MICHEL', 'LES SABLES D OLONNE', 'LISIEUX', 'LYON LA SOIE', 'LYON PARILLY',
  'MARSEILLE BORELY', 'MARSEILLE VIVAUX', 'MAUQUENCHY', 'MAURE DE BRETAGNE', 'MESLAY DU MAINE',
  'MONT DE MARSAN', 'MOULINS', 'NANCY', 'NANTES', 'PARIS VINCENNES', 'VINCENNES', 'PARISLONGCHAMP',
  'PARIS LONGCHAMP', 'LONGCHAMP', 'PAU', 'PONTCHATEAU', 'PORNICHET', 'RAMBOUILLET', 'REIMS',
  'SAINT BRIEUC', 'SAINT CLOUD', 'SAINT GALMIER', 'SAINT MALO', 'SALON DE PROVENCE', 'STRASBOURG',
  'TARBES', 'TOULOUSE', 'VICHY', 'VIRE'
]);

/** true si l'hippodrome fait partie des hippodromes francais du backtest. */
export function estHippodromeFrancais(nom) {
  return HIPPODROMES_FRANCAIS.has(normaliserHippodrome(nom));
}

const estNP = (r) => String(r.position || '').toUpperCase() === 'NP';

/**
 * Selection "Populaire n° 1".
 * @param {Array} rows - retour de `parsePopularite` (champs reunion, course,
 *   numero, popularite = Suivis, noteIA, cote, hippodrome...).
 * @param {{cotes?: Map<string, number>, cle?: Function, hippodromeDe?: Function}} [options]
 *   `cotes` : cotes plus recentes par cle de cheval (cle(r) = "R-C-N") ;
 *   `hippodromeDe(r)` : hippodrome de la ligne (par defaut r.hippodrome).
 * @returns {Array<Object>} une entree par cheval retenu ou proche :
 *   { ...ligne, coteRetenue, coteSource, rangCote, rangNote, niveau, raison }
 *   niveau 'jouer' (les 4 conditions), 'attente' (n° 1 popularite + Note IA
 *   top 3, cote ou rang de cote pas encore dans la cible mais proches).
 */
export function selectionPopulaireN1(rows, options = {}) {
  const cotes = options.cotes || new Map();
  const cle = options.cle || ((r) => `${r.reunion}-${r.course}-${r.numero}`);
  const hippodromeDe = options.hippodromeDe || ((r) => r.hippodrome);
  const parCourse = new Map();
  for (const r of rows || []) {
    if (!(r.reunion > 0 && r.course > 0 && r.numero > 0) || estNP(r)) continue;
    const k = `${r.reunion}-${r.course}`;
    if (!parCourse.has(k)) parCourse.set(k, []);
    parCourse.get(k).push(r);
  }
  const out = [];
  for (const partants of parCourse.values()) {
    if (!estHippodromeFrancais(hippodromeDe(partants[0]))) continue;
    const suivis = partants.map((r) => (typeof r.popularite === 'number' ? r.popularite : 0));
    const maxSuivis = Math.max(...suivis);
    if (!(maxSuivis > 0)) continue;
    const coteDe = (r) => {
      const c = cotes.get(cle(r));
      return c > 0 ? { cote: c, source: 'directe' } : { cote: r.cote > 0 ? r.cote : null, source: 'fichier' };
    };
    const cotesCourse = partants.map((r) => coteDe(r).cote);
    for (const r of partants) {
      if (r.popularite !== maxSuivis) continue;
      if (typeof r.noteIA !== 'number') continue;
      const rangNote = 1 + partants.filter((x) => typeof x.noteIA === 'number' && x.noteIA > r.noteIA).length;
      if (rangNote > REGLE_POP1.RANG_NOTE_MAX) continue;
      const { cote, source } = coteDe(r);
      const rangCote = rangDeCote(cote, cotesCourse);
      if (rangCote == null) continue;
      const okCote = cote >= REGLE_POP1.COTE_MIN && cote < REGLE_POP1.COTE_MAX;
      const okRang = rangCote === REGLE_POP1.RANG_COTE;
      const rn = rangNote === 1 ? '1re' : `${rangNote}e`;
      let niveau = null;
      let raison = '';
      if (okCote && okRang) {
        niveau = 'jouer';
        raison = `n&deg;&nbsp;1 popularit&eacute; &middot; 3e cote &middot; Note IA ${rn} de la course`;
      } else if (rangCote >= 2 && rangCote <= 4 && cote >= 3 && cote < 10) {
        niveau = 'attente';
        const manque = [];
        if (!okRang) manque.push(`${rangCote}e cote (il faut la 3e)`);
        if (!okCote) manque.push(`cote ${cote} hors 4-8`);
        raison = `n&deg;&nbsp;1 popularit&eacute;, Note IA ${rn} ; manque : ${manque.join(', ')}`;
      }
      if (niveau) out.push({ ...r, coteRetenue: cote, coteSource: source, rangCote, rangNote, niveau, raison });
    }
  }
  return out;
}
