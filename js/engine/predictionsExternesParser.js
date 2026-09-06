// =============================================================================
// predictionsExternesParser.js
// Parse le fichier "Predictions_JJMMAAAA_HHMM.csv" d'un service de pronostics
// TIERS (pas notre moteur), fourni optionnellement par l'utilisateur en plus
// de sa reunion du jour, pour servir de signal de confirmation externe croise
// avec la Base de l'appli. N'entre dans AUCUN calcul de Score Global/Value/
// classement/score de configuration - purement indicatif et affiche a part.
//
// Structure du fichier (confirmee par l'utilisateur sur des exports reels
// d'aout 2026, cf. HEBERGEMENT.md pour le detail) :
//  - "Cotée G1/G2/G3 N°+Cote" et "Non cotée G1/G2/G3 N°+Cote" : jusqu'a 6
//    chevaux cites par le pronostiqueur AVANT la course (predictions reelles,
//    se figent au depart d'apres l'utilisateur, sauf "hors cote").
//  - "ScFi" : indice de fiabilite du pronostic (0-100), connu avant la course.
//  - "Rapport Prévu" : tranche de rapport Simple Gagnant anticipee, connue
//    avant la course.
//  - "SG" et "Arrivée" : PAS des predictions malgre leur nom - ce sont le
//    rapport et l'ordre d'arrivee REELS, remplis par le service une fois la
//    course terminee (vides tant que la course n'est pas partie). Confirme
//    par un test croise avec les resultats PMU reels (12 courses, 12/12
//    identiques a l'arrivee officielle, y compris des courses parties
//    plusieurs heures apres l'export du fichier).
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

function buildHeaderIndex(headerRow) {
  const map = new Map();
  headerRow.forEach((name, i) => {
    const clean = (name || '').trim();
    if (clean && !map.has(clean)) map.set(clean, i);
  });
  return map;
}

function parseCoteOuRapport(raw) {
  const v = Number((raw || '').replace(',', '.').replace('€', '').trim());
  return Number.isFinite(v) && v > 0 ? v : null;
}

function parseNumero(raw) {
  const v = parseInt((raw || '').trim(), 10);
  return Number.isFinite(v) ? v : null;
}

/**
 * Parse le CSV "Predictions_JJMMAAAA_HHMM.csv" en une entree par course.
 * @param {string} csv
 * @returns {Array<{
 *   numeroCourse: number,
 *   hippodrome: string,
 *   heureDepart: string,
 *   cotee: Array<{numero:number, cote:number|null}>,
 *   nonCotee: Array<{numero:number, cote:number|null}>,
 *   scFi: number|null,
 *   rapportPrevu: string,
 *   sgReel: number|null,
 *   arriveeReelle: number[]
 * }>}
 */
export function parsePredictionsExternes(csv) {
  const rows = linesOf(csv);
  if (rows.length === 0) return [];

  const header = buildHeaderIndex(rows[0]);
  const dataRows = rows.slice(1);

  function get(row, name) {
    const idx = header.get(name);
    if (idx == null || idx >= row.length) return '';
    return row[idx] || '';
  }

  function paire(row, nomNumero, nomCote) {
    const numero = parseNumero(get(row, nomNumero));
    if (numero == null) return null;
    return { numero, cote: parseCoteOuRapport(get(row, nomCote)) };
  }

  const out = [];
  for (const row of dataRows) {
    const cxRaw = get(row, 'Cx');
    const numeroCourse = parseInt(cxRaw.replace(/\D/g, ''), 10);
    if (!Number.isFinite(numeroCourse) || numeroCourse <= 0) continue;

    const hippodrome = get(row, 'Hippodrome').trim();
    if (!hippodrome) continue;

    const cotee = [
      paire(row, 'Cotée G1 N°', 'Cotée G1 Cote'),
      paire(row, 'Cotée G2 N°', 'Cotée G2 Cote'),
      paire(row, 'Cotée G3 N°', 'Cotée G3 Cote')
    ].filter(Boolean);
    const nonCotee = [
      paire(row, 'Non cotée G1 N°', 'Non cotée G1 Cote'),
      paire(row, 'Non cotée G2 N°', 'Non cotée G2 Cote'),
      paire(row, 'Non cotée G3 N°', 'Non cotée G3 Cote')
    ].filter(Boolean);

    const scFiRaw = get(row, 'ScFi').replace(',', '.').trim();
    const scFi = scFiRaw !== '' && Number.isFinite(Number(scFiRaw)) ? Number(scFiRaw) : null;

    const arriveeRaw = get(row, 'Arrivée').trim();
    const arriveeReelle = arriveeRaw
      ? arriveeRaw.split(/[-–]/).map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n))
      : [];

    out.push({
      numeroCourse,
      hippodrome,
      heureDepart: get(row, 'Départ').trim(),
      cotee,
      nonCotee,
      scFi,
      rapportPrevu: get(row, 'Rapport Prévu').trim(),
      sgReel: parseCoteOuRapport(get(row, 'SG')),
      arriveeReelle
    });
  }
  return out;
}

/**
 * Determine si un numero de cheval (typiquement la Base de l'appli) est cite
 * par la prediction externe d'une course, et dans quel(s) groupe(s).
 *
 * Backtest juillet 2026 (31 fichiers, 958 courses matchees date+hippodrome+
 * course avec notre propre archive, 662 avec une Base identifiee par le
 * moteur) - reussite reelle de la Base selon ce niveau :
 *   'double'  (cite a la fois cotee ET non cotee) : 36,8% victoire (n=340)
 *   'simple'  (cite dans un seul des deux groupes) : 30,1% victoire (n=249)
 *   'absente' (non cite du tout)                   : 16,4% victoire (n=73)
 * Reference (Base seule, sans info externe, meme periode) : 30,9% (n=753).
 *
 * @param {number} numero
 * @param {{cotee: Array<{numero:number}>, nonCotee: Array<{numero:number}>}} prediction
 * @returns {'double'|'simple'|'absente'|null} null si aucune prediction fournie.
 */
export function niveauConfirmationExterne(numero, prediction) {
  if (!prediction) return null;
  const inCotee = (prediction.cotee || []).some((c) => c.numero === numero);
  const inNonCotee = (prediction.nonCotee || []).some((c) => c.numero === numero);
  if (inCotee && inNonCotee) return 'double';
  if (inCotee || inNonCotee) return 'simple';
  return 'absente';
}
