import { convertirCote } from './coteUtils.js';
import { disciplineFromRaw } from './discipline.js';

// =============================================================================
// csvImporter.js
// Portage de `ImportReunionComplete` / `IdentifierCoursesDepuisCSV` /
// `ChargerDonneesChevauxCourse` (VBA) : import du même fichier CSV
// (point-virgule) que celui utilisé pour remplir la feuille "Réunion
// complète" (76 colonnes), et de la base de performances passées
// ("Performances complètes", 16 colonnes). Voir TurfAnalyse-iOS/TurfEngine
// pour le détail du mapping de colonnes (identique ici).
// =============================================================================

function splitCSVLine(line, delimiter = ';') {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (const c of line) {
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === delimiter && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim().replace(/^"|"$/g, ''));
}

function linesOf(csv) {
  return csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => splitCSVLine(l));
}

function field(row, index1Based) {
  const idx = index1Based - 1;
  if (idx < 0 || idx >= row.length) return '';
  return row[idx];
}

function intField(row, index1Based) {
  const raw = field(row, index1Based);
  const n = parseInt(raw, 10);
  if (!Number.isNaN(n)) return n;
  return Math.trunc(convertirCote(raw));
}

function doubleField(row, index1Based) {
  return convertirCote(field(row, index1Based));
}

/**
 * Parse le CSV "Réunion complète" (76 colonnes) et regroupe les lignes par
 * n° de course (colonne 59), comme `IdentifierCoursesDepuisCSV` +
 * `ChargerDonneesChevauxCourse` en VBA.
 * @param {string} csv
 * @returns {Array<{context: Object, horses: Array<Object>, arriveeBrute: string}>}
 */
export function parseReunionComplete(csv) {
  let rows = linesOf(csv);
  if (rows.length === 0) return [];
  if (Number.isNaN(parseInt(field(rows[0], 1), 10))) {
    rows = rows.slice(1);
  }

  const parRace = new Map();
  const ordreRaces = [];
  for (const row of rows) {
    const numCourse = intField(row, 59);
    if (!parRace.has(numCourse)) {
      parRace.set(numCourse, []);
      ordreRaces.push(numCourse);
    }
    parRace.get(numCourse).push(row);
  }

  const result = [];
  for (const numCourse of ordreRaces) {
    const rowsCourse = parRace.get(numCourse);
    const first = rowsCourse[0];
    if (!first) continue;

    const disciplineBrute = field(first, 62);
    const context = {
      lieu: field(first, 60),
      discipline: disciplineFromRaw(disciplineBrute),
      disciplineBrute,
      distanceJour: doubleField(first, 66),
      allocation: doubleField(first, 65),
      nbPartants: intField(first, 67),
      numeroCourse: numCourse,
      numeroReunion: intField(first, 58),
      heureDepart: field(first, 61)
    };

    const horses = rowsCourse.map((row) => ({
      numero: intField(row, 1),
      nom: field(row, 2).trim(),
      ferrage: field(row, 3),
      sexeAge: field(row, 4),
      reussiteJockey: convertirCote(field(row, 8)),
      reussiteEntraineur: convertirCote(field(row, 10)),
      cote8h: convertirCote(field(row, 25)),
      coteDirecte: convertirCote(field(row, 26)),
      cotePredictive: convertirCote(field(row, 57)),
      // --- Champs "Module 2" (rubriques techniques / Base(s) possible(s) / Danger(s)) ---
      // Ordre = RUBRIQUES dans rubriques.js : RJ,RE,ED,MP,PtH,MN,RC,RX,MX,CX,IdC,CFP,OR,PC,MA,AR,TG,R10
      // `null` (et non 0) pour un champ vide, afin de reproduire IsNumeric()
      // en VBA : un champ vide est repousse en fin de classement Top-N,
      // quel que soit le sens de tri, plutot que traite comme un vrai 0.
      rubriques: [8, 10, 11, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 43, 44, 41, 45, 47]
        .map((col) => { const raw = field(row, col); return raw.trim() === '' ? null : convertirCote(raw); }),
      sc: convertirCote(field(row, 46)),
      p1: field(row, 15),
      p2: field(row, 16)
    }));

    result.push({ context, horses, arriveeBrute: field(first, 70) });
  }
  return result;
}

/**
 * Reproduit `CompterChevauxCourse` : filtre standard PMU/trot (9 à 16 partants).
 */
export function coursesValides(races, minPartants = 9, maxPartants = 16) {
  return races.filter((r) => r.horses.length >= minPartants && r.horses.length <= maxPartants);
}

/**
 * Parse la colonne "Arrivee" ("10-15-3-7-...") en ordre d'arrivée (numéros),
 * comme `EnregistrerHistorique` en VBA.
 * @param {string} raw
 * @returns {number[]}
 */
export function parseOrdreArrivee(raw) {
  if (!raw || raw === '0' || raw.toLowerCase() === 'non disponible') return [];
  return raw.split('-').map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
}

/**
 * Parse le CSV "Performances complètes" (16 colonnes) -> historique brut.
 * @param {string} csv
 * @returns {Array<Object>}
 */
export function parsePerformances(csv) {
  let rows = linesOf(csv);
  if (rows.length === 0) return [];
  if (field(rows[0], 1).toUpperCase().includes('NOM')) {
    rows = rows.slice(1);
  }

  const out = [];
  for (const row of rows) {
    const nom = field(row, 1).trim();
    if (!nom) continue;

    const placeRaw = field(row, 14);
    const placeInt = parseInt(placeRaw, 10);
    const place = (!Number.isNaN(placeInt) && placeInt > 0) ? placeInt : null;

    const redKRaw = field(row, 15).replace(',', '.');
    const redK = Number(redKRaw);

    const coteVal = doubleField(row, 16);

    out.push({
      nomCheval: nom,
      datePerf: parseDate(field(row, 2)),
      lieu: field(row, 3),
      distance: doubleField(row, 4),
      gains: doubleField(row, 5),
      partants: intField(row, 6),
      corde: intField(row, 7),
      cordage: field(row, 8),
      deferreOuIndiceValeur: field(row, 9),
      poids: doubleField(row, 10),
      discipline: field(row, 11),
      typeCourse: field(row, 12),
      allocation: doubleField(row, 13),
      place,
      redKDist: Number.isNaN(redK) ? null : redK,
      cote: coteVal > 0 ? coteVal : null
    });
  }
  return out;
}

function parseDate(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  const serial = Number(trimmed);
  if (!Number.isNaN(serial) && trimmed !== '') {
    // Numéro de série Excel : jours depuis 1899-12-30.
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + serial * 86400000).toISOString();
  }
  const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).toISOString();
  }
  return null;
}

/**
 * Ajoute les champs dérivés `indiceValeur` / `poidsPorte` (utilisés en
 * Plat/Haies/Steeple) à partir de `deferreOuIndiceValeur` / `poids`, et
 * calcule `redKDist` "utilisable" (0 si absent). Utile pour préparer les
 * objets renvoyés par `parsePerformances` avant de les passer au moteur de
 * score (qui lit directement `indiceValeur`/`poidsPorte`).
 * @param {Object} perf
 */
export function enrichirPerformance(perf) {
  const indiceValeur = Number(String(perf.deferreOuIndiceValeur || '').replace(',', '.'));
  return {
    ...perf,
    indiceValeur: Number.isNaN(indiceValeur) ? null : indiceValeur,
    poidsPorte: perf.poids > 0 ? perf.poids : null
  };
}

/**
 * Regroupe et trie l'historique d'un cheval nommé (le plus récent en
 * premier), tel qu'attendu par toutes les fonctions du moteur de score.
 * @param {string} nomCheval
 * @param {Array<Object>} toutesPerfs
 */
export function historiquePour(nomCheval, toutesPerfs) {
  const nomU = (nomCheval || '').trim().toUpperCase();
  return toutesPerfs
    .filter((p) => (p.nomCheval || '').trim().toUpperCase() === nomU)
    .map(enrichirPerformance)
    .sort((a, b) => {
      if (a.datePerf && b.datePerf) return new Date(b.datePerf) - new Date(a.datePerf);
      if (!a.datePerf && b.datePerf) return 1;
      if (a.datePerf && !b.datePerf) return -1;
      return 0;
    });
}
