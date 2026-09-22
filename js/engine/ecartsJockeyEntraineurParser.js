// =============================================================================
// ecartsJockeyEntraineurParser.js
// Parse les fichiers CSV "Statistiques Ecarts Jockeys | Turf BZH" et
// "Statistiques Ecarts Entraineurs | Turf BZH" (export depuis turf.bzh,
// converti en CSV par l'utilisateur avant import). Ce sont des PHOTOS DE
// L'INSTANT PRESENT (fenetre glissante des 90 derniers jours a la date de
// l'export), pas un historique date par course - voir le commentaire
// d'en-tete de `statutFormeJockeyEntraineur` ci-dessous pour l'implication
// methodologique importante.
//
// Colonnes attendues (2 lignes d'en-tete : un titre, puis les vraies
// colonnes) : Jockey/Entraineur, Courses du jour, EG, EC, EP, Courses,
// Victoires, % Vict., Places, % Pl., Nb Fav, % Fav G, % Fav Pl., 10 dernieres.
//
// A la demande de l'utilisateur (sept. 2026) : croisement empirique sur le
// pool Value<=-30 (90 derniers jours d'archive, la meme fenetre que celle
// couverte par ces fichiers) - quand le jockey ET l'entraineur ont chacun un
// % Vict. >= 10% (et au moins 15 courses chacun, pour la fiabilite du taux) :
//   n=1341, reussite 30,8%, rendement 111,3%
// contre le reste (au moins un des deux < 10%) :
//   n=2061, reussite 17,1%, rendement 78,7%
// Ecart robuste sur la quinzaine la plus recente de la fenetre (fuite de
// donnees minimale) comme sur le reste (106,8%/84,7% vs 112,3%/77,4%) - voir
// HEBERGEMENT.md pour le detail complet et la reserve methodologique (une
// photo instantanee des 90 derniers jours contient forcement un peu
// d'information posterieure a certaines courses de cette meme fenetre : le
// resultat n'est donc PAS un backtest propre, seulement une premiere
// indication encourageante). Le signal est de ce fait suivi PROSPECTIVEMENT
// (affichage indicatif uniquement, aucun gate sur la selection du moteur)
// avant toute decision de l'integrer au calcul de `jeuSimpleGagnant()`.
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

function detecterDelimiteur(headerLine) {
  return (headerLine.match(/;/g) || []).length >= (headerLine.match(/,/g) || []).length ? ';' : ',';
}

/**
 * Normalise un nom de jockey/entraineur pour le matching entre les fichiers
 * Ecarts (format "M. Guarnieri", parfois pollue par un compteur "3 courses"
 * concatene au nom - artefact du site source) et le fichier partants du jour
 * (format "M.GUARNIERI", colonnes DrivJock/Entraineur, cf. csvImporter.js).
 * @param {string} nom
 * @returns {string} nom normalise (majuscules, sans espace/tiret/apostrophe),
 *   ou '' si vide.
 */
export function normaliserNomJockeyEntraineur(nom) {
  if (!nom) return '';
  let n = String(nom).trim();
  // Artefact du site source : parfois "X. Nom3 courses" (compteur colle au nom).
  n = n.replace(/\d+\s*courses?$/i, '').trim();
  if (n.startsWith('Mme ')) n = n.slice(4);
  return n.toUpperCase().replace(/[\s\-']/g, '');
}

function parseNombre(raw) {
  if (raw === undefined || raw === null || raw === '' || raw === '-') return null;
  const n = parseInt(String(raw).trim(), 10);
  return Number.isNaN(n) ? null : n;
}

function parsePourcentage(raw) {
  if (raw === undefined || raw === null) return null;
  const n = parseFloat(String(raw).replace('%', '').replace(',', '.').trim());
  return Number.isNaN(n) ? null : n;
}

/**
 * Parse un fichier "Statistiques Ecarts Jockeys/Entraineurs | Turf BZH" (CSV).
 * @param {string} csv
 * @returns {Map<string, Object>} cle = nom normalise -> stats.
 */
export function parseEcarts(csv) {
  const lines = csv.split(/\r?\n/).map((l) => l.replace(/\r$/, '')).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return new Map();

  const delim = detecterDelimiteur(lines[1] || lines[0]);
  // La 1ere ligne est un titre ("Statistiques Ecarts ... | Turf BZH"), pas un
  // en-tete de colonnes : on cherche la ligne qui contient "Vict" pour reperer
  // le vrai en-tete, avec repli sur la ligne 2 (index 1) si non trouvee.
  let headerRowIdx = lines.findIndex((l) => /vict/i.test(l));
  if (headerRowIdx < 0) headerRowIdx = 1;

  const out = new Map();
  for (let i = headerRowIdx + 1; i < lines.length; i++) {
    const row = splitCSVLine(lines[i], delim);
    if (row.length < 13 || !row[0]) continue;
    const nomBrut = row[0];
    const cle = normaliserNomJockeyEntraineur(nomBrut);
    if (!cle) continue;
    out.set(cle, {
      nom: nomBrut,
      EG: parseNombre(row[2]),
      EC: parseNombre(row[3]),
      EP: parseNombre(row[4]),
      courses: parseNombre(row[5]),
      victoires: parseNombre(row[6]),
      pctVict: parsePourcentage(row[7]),
      places: parseNombre(row[8]),
      pctPl: parsePourcentage(row[9]),
      nbFav: parseNombre(row[10]),
      pctFavG: parsePourcentage(row[11]),
      pctFavPl: parsePourcentage(row[12])
    });
  }
  return out;
}

// Seuils retenus pour le badge "en forme" (voir commentaire d'en-tete du
// fichier pour le detail du croisement empirique qui les justifie).
export const SEUIL_COURSES_FIABILITE = 15;
export const SEUIL_PCT_VICT_FORME = 10;

/**
 * Determine si un cheval a un jockey ET un entraineur "en forme" au sens du
 * croisement teste (les deux >= 10% de victoires sur 90 jours, avec au moins
 * 15 courses chacun pour que le taux soit fiable). Purement indicatif -
 * n'entre dans aucun calcul de Score Global/Value/classement/dominance
 * MX+OR+MA (voir le caveat de fuite de donnees en tete de fichier).
 * @param {Object|undefined} statsJockey - entree de la Map retournee par parseEcarts.
 * @param {Object|undefined} statsEntraineur - idem.
 * @returns {'enForme'|'insuffisant'|'inconnu'}
 *   'enForme' : les deux criteres remplis.
 *   'insuffisant' : les deux stats sont connues mais au moins un des deux
 *     criteres n'est pas rempli.
 *   'inconnu' : jockey et/ou entraineur non trouve dans les fichiers importes.
 */
export function statutFormeJockeyEntraineur(statsJockey, statsEntraineur) {
  if (!statsJockey || !statsEntraineur) return 'inconnu';
  const jOk = statsJockey.courses >= SEUIL_COURSES_FIABILITE && statsJockey.pctVict >= SEUIL_PCT_VICT_FORME;
  const eOk = statsEntraineur.courses >= SEUIL_COURSES_FIABILITE && statsEntraineur.pctVict >= SEUIL_PCT_VICT_FORME;
  return jOk && eOk ? 'enForme' : 'insuffisant';
}

/**
 * Version "cheval" de `statutFormeJockeyEntraineur` : retrouve les stats du
 * jockey/entraineur du cheval (via `c.entry.jockeyNom`/`c.entry.entraineurNom`,
 * cf. csvImporter.js) dans les dictionnaires importés, puis applique le
 * même critère.
 * @param {Object} c - élément de result.chevaux (RaceAnalyzer.analyser), avec `.entry.jockeyNom`/`.entry.entraineurNom`.
 * @param {Object|null} dataJockeys - `data` stocké par DB.getEcartsJockeyEntraineur('jockeys') (objet nom normalisé -> stats), ou null si jamais importé.
 * @param {Object|null} dataEntraineurs - idem pour 'entraineurs'.
 * @returns {'enForme'|'insuffisant'|'inconnu'}
 */
export function statutFormeCheval(c, dataJockeys, dataEntraineurs) {
  const nomJ = c?.entry?.jockeyNom;
  const nomE = c?.entry?.entraineurNom;
  if (!nomJ || !nomE || !dataJockeys || !dataEntraineurs) return 'inconnu';
  const statsJ = dataJockeys[normaliserNomJockeyEntraineur(nomJ)];
  const statsE = dataEntraineurs[normaliserNomJockeyEntraineur(nomE)];
  return statutFormeJockeyEntraineur(statsJ, statsE);
}
