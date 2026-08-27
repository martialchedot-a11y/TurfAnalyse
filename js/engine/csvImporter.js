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

/**
 * Construit un index nom de colonne -> position 1-based, a partir de la
 * ligne d'en-tete. Permet de resoudre les colonnes par NOM plutot que par
 * position fixe : le format "Reunion complete" a deja change 2 fois
 * (variante "journee" avec la colonne "Pedigree Faible" en plus, puis le
 * format "Analyse_AAAAMMJJ_partants" qui deplace "Cote Calc" et ajoute
 * plusieurs colonnes ailleurs dans le fichier) sans jamais renommer les
 * colonnes deja utilisees par le moteur - la resolution par nom absorbe
 * ces changements de position automatiquement, sans nouvelle logique de
 * "decalage" a ecrire a chaque fois.
 * @param {string[]} headerRow
 * @returns {Map<string, number>}
 */
function buildHeaderIndex(headerRow) {
  const map = new Map();
  headerRow.forEach((name, i) => {
    const clean = (name || '').trim();
    if (clean && !map.has(clean)) map.set(clean, i + 1);
  });
  return map;
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

// Noms de colonnes (Module 2 / rubriques techniques), dans l'ordre attendu
// par RUBRIQUES dans rubriques.js : RJ,RE,ED,MP,PtH,MN,RC,RX,MX,CX,IdC,CFP,OR,PC,MA,AR,TG,R10.
const NOMS_RUBRIQUES = ['RJ', 'RE', 'ED', 'MP', 'PtH', 'MN', 'RC', 'RX', 'MX', 'CX', 'IdC', 'CFP', 'OR', 'PC', 'MA', 'AR', 'TG', 'R10'];

// Positions de repli (format "standard" historique, 76 colonnes), utilisees
// uniquement si le fichier n'a pas de ligne d'en-tete exploitable (cas rare).
const POSITIONS_REPLI = {
  ferrage: 3, sexeAge: 4, c8: 25, cd: 26, coteCalc: 57,
  rubriques: { RJ: 8, RE: 10, ED: 11, MP: 28, PtH: 29, MN: 30, RC: 31, RX: 32, MX: 33, CX: 34, IdC: 35, CFP: 36, OR: 37, PC: 43, MA: 44, AR: 41, TG: 45, R10: 47 },
  sc: 46, p1: 15, p2: 16,
  reunion: 58, course: 59, lieuCourse: 60, heure: 61, discipline: 62,
  allocation: 65, distance: 66, partants: 67, arrivee: 70
};

/**
 * Parse le CSV "Réunion complète" et regroupe les lignes par réunion + n° de
 * course, comme `IdentifierCoursesDepuisCSV` + `ChargerDonneesChevauxCourse`
 * en VBA.
 *
 * *** Resolution des colonnes par NOM (pas par position fixe) *** : le
 * format source a deja change 2 fois - la variante "journee" (colonne
 * "Pedigree Faible" en plus, juste avant "Cote Calc") puis le format
 * "Analyse_AAAAMMJJ_partants" (qui deplace "Cote Calc" juste apres les
 * colonnes P1-P10, ajoute "Handicap"/"Median" au milieu du fichier, et 10
 * colonnes supplementaires a la fin) - sans jamais renommer les colonnes
 * deja utilisees par le moteur. Plutot que de coder un nouveau "decalage"
 * a chaque nouvelle variante, chaque colonne est resolue par son NOM dans
 * la ligne d'en-tete : ce mecanisme absorbe automatiquement les
 * changements de position (insertions, deplacements), tant que les noms
 * de colonnes utilises par le moteur restent les memes. A defaut d'en-tete
 * exploitable (cas rare), on retombe sur les positions fixes du format
 * "standard" historique (76 colonnes, cf. POSITIONS_REPLI).
 *
 * Un fichier "journee"/"Analyse_" contenant plusieurs reunions, le
 * regroupement se fait sur la paire (numero de reunion, numero de course)
 * et non sur le seul numero de course, afin de ne pas fusionner a tort
 * deux courses de meme numero mais de reunions differentes.
 * @param {string} csv
 * @returns {Array<{context: Object, horses: Array<Object>, arriveeBrute: string}>}
 */
export function parseReunionComplete(csv) {
  let rows = linesOf(csv);
  if (rows.length === 0) return [];

  let headerIndex = null;
  if (Number.isNaN(parseInt(field(rows[0], 1), 10))) {
    headerIndex = buildHeaderIndex(rows[0]);
    rows = rows.slice(1);
  }
  if (rows.length === 0) return [];

  // Resout une colonne par nom(s) (le premier trouve dans l'en-tete gagne),
  // avec repli sur une position fixe si aucun en-tete n'a pu etre lu.
  function col(noms, repli) {
    if (headerIndex) {
      for (const n of noms) {
        if (headerIndex.has(n)) return headerIndex.get(n);
      }
    }
    return repli;
  }

  const posFerrage = col(['Ferrure', 'VH ou Ferrage'], POSITIONS_REPLI.ferrage);
  const posSexeAge = col(['SA'], POSITIONS_REPLI.sexeAge);
  const posC8 = col(['C8'], POSITIONS_REPLI.c8);
  const posCD = col(['CD'], POSITIONS_REPLI.cd);
  const posCoteCalc = col(['Cote Calc'], POSITIONS_REPLI.coteCalc);
  const posRubriques = NOMS_RUBRIQUES.map((nom) => col([nom], POSITIONS_REPLI.rubriques[nom]));
  const posSC = col(['SC'], POSITIONS_REPLI.sc);
  const posP1 = col(['P1'], POSITIONS_REPLI.p1);
  const posP2 = col(['P2'], POSITIONS_REPLI.p2);
  const posReunion = col(['Reunion'], POSITIONS_REPLI.reunion);
  const posCourse = col(['Course'], POSITIONS_REPLI.course);
  const posLieuCourse = col(['LieuCourse'], POSITIONS_REPLI.lieuCourse);
  const posHeure = col(['Heure'], POSITIONS_REPLI.heure);
  const posDiscipline = col(['Discipline'], POSITIONS_REPLI.discipline);
  const posAllocation = col(['Allocation'], POSITIONS_REPLI.allocation);
  const posDistance = col(['Distance'], POSITIONS_REPLI.distance);
  const posPartants = col(['Partants'], POSITIONS_REPLI.partants);
  const posArrivee = col(['Arrivee'], POSITIONS_REPLI.arrivee);

  const parReunionCourse = new Map();
  const ordre = [];
  for (const row of rows) {
    const numReunion = intField(row, posReunion);
    const numCourse = intField(row, posCourse);
    const cle = `${numReunion}-${numCourse}`;
    if (!parReunionCourse.has(cle)) {
      parReunionCourse.set(cle, []);
      ordre.push(cle);
    }
    parReunionCourse.get(cle).push(row);
  }

  const result = [];
  for (const cle of ordre) {
    const rowsCourse = parReunionCourse.get(cle);
    const first = rowsCourse[0];
    if (!first) continue;

    const disciplineBrute = field(first, posDiscipline);
    const context = {
      lieu: field(first, posLieuCourse),
      discipline: disciplineFromRaw(disciplineBrute),
      disciplineBrute,
      distanceJour: doubleField(first, posDistance),
      allocation: doubleField(first, posAllocation),
      nbPartants: intField(first, posPartants),
      numeroCourse: intField(first, posCourse),
      numeroReunion: intField(first, posReunion),
      heureDepart: field(first, posHeure)
    };

    const horses = rowsCourse.map((row) => ({
      numero: intField(row, 1),
      nom: field(row, 2).trim(),
      ferrage: field(row, posFerrage),
      sexeAge: field(row, posSexeAge),
      reussiteJockey: convertirCote(field(row, posRubriques[0])),
      reussiteEntraineur: convertirCote(field(row, posRubriques[1])),
      cote8h: convertirCote(field(row, posC8)),
      coteDirecte: convertirCote(field(row, posCD)),
      cotePredictive: convertirCote(field(row, posCoteCalc)),
      // --- Champs "Module 2" (rubriques techniques / Base(s) possible(s) / Danger(s)) ---
      // `null` (et non 0) pour un champ vide, afin de reproduire IsNumeric()
      // en VBA : un champ vide est repousse en fin de classement Top-N,
      // quel que soit le sens de tri, plutot que traite comme un vrai 0.
      rubriques: posRubriques.map((posCol) => { const raw = field(row, posCol); return raw.trim() === '' ? null : convertirCote(raw); }),
      sc: convertirCote(field(row, posSC)),
      p1: field(row, posP1),
      p2: field(row, posP2)
    }));

    result.push({ context, horses, arriveeBrute: field(first, posArrivee) });
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
  // Format "Analyse_AAAAMMJJ_musiques" : "AAAA-MM-JJ" ou "AAAA-MM-JJ HH:MM:SS"
  // (l'heure est toujours a 00:00:00 en pratique, mais on l'ignore de toute
  // facon - seule la date importe pour l'historique de performances).
  const mIso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]\d{1,2}:\d{2}(:\d{2})?)?$/);
  if (mIso) {
    const [, y, mo, d] = mIso;
    return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).toISOString();
  }
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
 *
 * *** Fix fuite de données/lookahead (aout 2026, à la demande de
 * l'utilisateur) *** : le fichier musiques contient TOUTES les courses
 * connues du cheval, y compris - le cas échéant - la course en cours
 * d'étude elle-même (son propre résultat), si sa date coïncide avec celle
 * de la course analysée. Sans exclusion, l'historique utilisé pour calculer
 * le Score Global d'une course intègre alors le résultat de CETTE MÊME
 * course, ce qui fausse l'analyse (le cheval "sait" déjà qu'il a gagné/perdu
 * la course qu'on est censé prédire). Le paramètre `dateCourseAExclure`
 * (format "AAAA-MM-JJ", optionnel) retire de l'historique toute performance
 * dont la date correspond exactement à celle de la course étudiée.
 * @param {string} nomCheval
 * @param {Array<Object>} toutesPerfs
 * @param {string|null|undefined} [dateCourseAExclure] - date "AAAA-MM-JJ" de
 *   la course en cours d'analyse ; toute performance de CETTE date est
 *   exclue de l'historique retourné (fuite de données évitée).
 */
export function historiquePour(nomCheval, toutesPerfs, dateCourseAExclure) {
  const nomU = (nomCheval || '').trim().toUpperCase();
  return toutesPerfs
    .filter((p) => (p.nomCheval || '').trim().toUpperCase() === nomU)
    .filter((p) => !dateCourseAExclure || !p.datePerf || String(p.datePerf).slice(0, 10) !== dateCourseAExclure)
    .map(enrichirPerformance)
    .sort((a, b) => {
      if (a.datePerf && b.datePerf) return new Date(b.datePerf) - new Date(a.datePerf);
      if (!a.datePerf && b.datePerf) return 1;
      if (a.datePerf && !b.datePerf) return -1;
      return 0;
    });
}
