// =============================================================================
// nouveauD4.js (oct. 2026, v128, a la demande explicite de l'utilisateur)
//
// Regle "Nouveau D4" (trot attele et monte) : un cheval est QUALIFIE s'il
// court aujourd'hui deferre des 4 pieds ("D4") alors qu'il ne l'etait PAS a
// sa course precedente. Il est A JOUER en simple gagnant quand sa cote est
// strictement superieure a 6 et inferieure ou egale a 30.
//
// Backtest qui motive la regle (01/01 - 13/09/2026, rapports officiels,
// 61 638 partants au trot, ferrure de la course precedente lue dans le
// fichier partants de cette course) :
//   - D4 -> D4 (meme ferrure)                : n=14 045, rendement gagnant 73%
//   - pas D4 -> D4 (nouveau D4), toutes cotes : n=5 379, 99% (place 88%)
//   - nouveau D4, cote 6 a 30                 : n=2 626 (~10,6 paris/jour),
//     reussite 9,1%, rendement gagnant 111% (janv.-mai 105%, juin-sept.
//     118%), place 91% ; 8 mois sur 9 >= 100% ; IC 90% : 97-125%.
//   - controle D4 -> D4, cote 6 a 30          : 80%.
// Reserves : reussite faible (longues series perdantes), tranche de cote
// choisie apres coup, cote finale dans le backtest, gagnant uniquement.
// Voir la fiche projet "backtest-changements-de-conditions-2026".
//
// *** Fiabilite de la ferrure precedente ***
// L'historique "_musiques" (performances) a un champ ferrure VIDE pour
// environ 21% des courses reellement courues D4 : un champ vide n'y prouve
// donc pas que le cheval etait ferre. La source fiable est la ferrure du
// fichier partants de la course precedente, memorisee dans le magasin
// IndexedDB `ferrures` a chaque import de reunion (et via l'import
// "Historique des ferrures"). D'ou trois niveaux :
//   - 'partants'   : ferrure precedente lue dans un fichier partants (fiable)
//   - 'historique' : lue dans l'historique des performances ET non vide
//                    (fiable : une valeur renseignee y est exacte)
//   - 'incertain'  : derniere course connue seulement par l'historique, avec
//                    un champ ferrure vide -> a verifier a la main.
//
// Fonctions pures, testables sans navigateur.
// =============================================================================

export const COTE_MIN_NOUVEAU_D4 = 6;   // strictement superieur
export const COTE_MAX_NOUVEAU_D4 = 30;  // inferieur ou egal

/** Cle de rapprochement d'un cheval : majuscules, espaces de bord retires. */
export function cleCheval(nom) {
  return String(nom ?? '').trim().toUpperCase();
}

/** Ferrure normalisee ("D4", "DA", "DP", "PA DP", "PA", "P4", "PP" ou "" = ferre). */
export function normaliserFerrure(raw) {
  return String(raw ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
}

/** Vrai pour une discipline de trot (attele ou monte). */
export function estTrot(disciplineBrute) {
  const d = String(disciplineBrute ?? '').toUpperCase();
  return d.includes('ATTEL') || d.includes('MONT');
}

/** "AAAA-MM-JJ" a partir d'une date ISO / Date ; '' si invalide. */
export function jourDe(date) {
  if (!date) return '';
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/**
 * Extrait les ferrures a memoriser d'un fichier partants deja parse
 * (`parseReunionComplete`) : un enregistrement par cheval de trot.
 * @param {Array} races - retour de `CSVImporter.parseReunionComplete`.
 * @param {string} jour - "AAAA-MM-JJ" de la reunion.
 * @returns {Array<{id:string, nomU:string, jour:string, ferrure:string}>}
 */
export function extraireFerrures(races, jour) {
  const out = [];
  if (!jour) return out;
  for (const r of races || []) {
    if (!estTrot(r.context && r.context.disciplineBrute)) continue;
    for (const h of r.horses || []) {
      const nomU = cleCheval(h.nom);
      if (!nomU) continue;
      out.push({ id: `${nomU}|${jour}`, nomU, jour, ferrure: normaliserFerrure(h.ferrage) });
    }
  }
  return out;
}

/**
 * Index des ferrures memorisees : nom -> liste triee par jour croissant.
 * @param {Array<{nomU:string, jour:string, ferrure:string}>} records
 * @returns {Map<string, Array<{jour:string, ferrure:string}>>}
 */
export function indexerFerrures(records) {
  const idx = new Map();
  for (const r of records || []) {
    if (!r || !r.nomU || !r.jour) continue;
    if (!idx.has(r.nomU)) idx.set(r.nomU, []);
    idx.get(r.nomU).push({ jour: r.jour, ferrure: normaliserFerrure(r.ferrure) });
  }
  for (const l of idx.values()) l.sort((a, b) => (a.jour < b.jour ? -1 : a.jour > b.jour ? 1 : 0));
  return idx;
}

/**
 * Ferrure de la course precedente d'un cheval, strictement AVANT `jour`.
 * @param {string} nom
 * @param {string} jour - "AAAA-MM-JJ" de la course du jour.
 * @param {Map} indexFerrures - retour de `indexerFerrures`.
 * @param {Array<{datePerf:string, discipline:string, deferreOuIndiceValeur:string}>} [historique]
 *   performances du cheval (toutes dates, n'importe quel ordre).
 * @returns {null|{ferrure:string, jour:string, source:'partants'|'historique'|'incertain'}}
 */
export function ferrurePrecedente(nom, jour, indexFerrures, historique) {
  const nomU = cleCheval(nom);
  let rec = null;
  const liste = indexFerrures ? indexFerrures.get(nomU) : null;
  if (liste) for (const r of liste) { if (r.jour < jour) rec = r; else break; }

  let perf = null;
  for (const p of historique || []) {
    const jp = jourDe(p.datePerf);
    if (!jp || jp >= jour || !estTrot(p.discipline)) continue;
    if (!perf || jp > perf.jour) perf = { jour: jp, ferrure: normaliserFerrure(p.deferreOuIndiceValeur) };
  }

  if (rec && (!perf || rec.jour >= perf.jour)) return { ferrure: rec.ferrure, jour: rec.jour, source: 'partants' };
  if (perf) {
    return perf.ferrure !== ''
      ? { ferrure: perf.ferrure, jour: perf.jour, source: 'historique' }
      : { ferrure: '', jour: perf.jour, source: 'incertain' };
  }
  return null;
}

/**
 * Evalue la regle pour un cheval.
 * @param {{ferrage:string, cote:number|null, precedente:null|{ferrure:string, source:string}}} c
 * @returns {null|'jouer'|'hors_cote'|'a_verifier'}
 *   null = pas un nouveau D4 (pas D4 aujourd'hui, deja D4 la derniere fois,
 *   ou aucune course precedente connue).
 */
export function statutNouveauD4({ ferrage, cote, precedente }) {
  if (normaliserFerrure(ferrage) !== 'D4') return null;
  if (!precedente) return null;
  if (precedente.ferrure === 'D4') return null;
  if (precedente.source === 'incertain') return 'a_verifier';
  const dansLaTranche = cote > COTE_MIN_NOUVEAU_D4 && cote <= COTE_MAX_NOUVEAU_D4;
  return dansLaTranche ? 'jouer' : 'hors_cote';
}

/** Libelle lisible d'une ferrure ("" -> "ferre"). */
export function libelleFerrure(f) {
  const n = normaliserFerrure(f);
  return n === '' ? 'ferré' : n;
}
