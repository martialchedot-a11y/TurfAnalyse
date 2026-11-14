// =============================================================================
// supplementationParser.js (sept. 2026, a la demande explicite de l'utilisateur)
//
// Parseur du fichier quotidien "Supplementation_PMU_AAAAMMJJ.xlsx" (une note
// IA sur 20 pour une selection restreinte de chevaux "supplementes" chaque
// jour, avec cote et arrivee officielle deja renseignees a posteriori dans
// le fichier). Format observe (feuille "Sheet1") :
//   Ligne 1 : titre ("Supplementation_PMU_AAAAMMJJ") dans la 1ere cellule.
//   Ligne 2 : en-tetes ("Course", "Cheval", "Note IA (/20)", "Heure",
//             "Discipline", "Cote", "Arrivee", "Analyse IA").
//   Ligne 3+ : donnees. La colonne "Course" encode reunion+course+numero
//   (ex. "R1C304" = reunion 1, course 3, cheval numero 04) mais SANS nom
//   d'hippodrome dans ce fichier - le matching avec notre archive se fait
//   donc par NOM DE CHEVAL (normalise), pas par ce code, en cherchant dans
//   toutes les courses du jour (cf. `trouverSupplementation`).
//
// Backtest reel (01-26/09/2026, n=16 selections Note IA>=15,9 ET
// Value<=-30, rapports officiels recuperes manuellement par l'utilisateur) :
// Simple Gagnant reussite 43,8%/rendement 148,1%, Simple Place reussite
// 75,0%/rendement 121,3% - tres prometteur mais echantillon encore reduit.
//
// Cette fonction prend directement le tableau de lignes brutes (tel que
// renvoye par `XLSX.utils.sheet_to_json(sheet, {header:1})` cote app.js,
// qui charge la librairie XLSX globale - voir index.html/sw.js) plutot que
// le classeur lui-meme, pour rester une fonction pure testable sans
// dependance a la librairie XLSX dans les tests unitaires.
// =============================================================================

function normNom(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase()
    .replace(/['’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {Array<Array>} lignesBrutes - lignes de la feuille (header:1).
 * @returns {{dateVal:string|null, rows:Array<{cheval:string, note:number|null, heure:string|null, discipline:string|null, cote:number|null, arrivee:number|null}>}}
 *   `dateVal` au format "AAAA-MM-JJ", deduit d'une cellule "..._AAAAMMJJ"
 *   parmi les premieres lignes, `null` si non trouve. `rows` : une entree
 *   par ligne de donnees valide (cheval non vide).
 */
export function parseSupplementation(lignesBrutes) {
  if (!Array.isArray(lignesBrutes) || lignesBrutes.length === 0) return { dateVal: null, rows: [] };

  // Date : cherchee dans les premieres lignes (titre "..._AAAAMMJJ"), pas
  // necessairement en ligne 0 - certains exports (notamment depuis
  // l'application iPhone/iCloud, cf. bug signale par l'utilisateur : "l'app
  // iphone ne lit pas le fichier supplementation.xlsx") inserent une ligne
  // vide avant le titre, ou omettent le titre.
  let dateVal = null;
  for (let i = 0; i < Math.min(3, lignesBrutes.length) && !dateVal; i++) {
    const cellule = String((lignesBrutes[i] && lignesBrutes[i][0]) || '');
    const m = cellule.match(/(\d{4})(\d{2})(\d{2})\s*$/);
    if (m) dateVal = `${m[1]}-${m[2]}-${m[3]}`;
  }

  // Ligne d'en-tetes : cherchee (au lieu de supposer l'index 1 fixe) -
  // premiere ligne parmi les 5 premieres contenant une cellule "Cheval"
  // (insensible a la casse/espaces). Rend le parseur resilient a une ligne
  // vide/decalee en tete de fichier, plutot que de supposer une structure
  // rigide "titre puis en-tetes" qui peut varier selon l'export.
  let indexEntetes = -1;
  for (let i = 0; i < Math.min(5, lignesBrutes.length); i++) {
    const ligne = lignesBrutes[i];
    if (Array.isArray(ligne) && ligne.some((c) => String(c || '').trim().toLowerCase() === 'cheval')) {
      indexEntetes = i;
      break;
    }
  }
  const indexDepart = indexEntetes >= 0 ? indexEntetes + 1 : 2;

  const rows = [];
  for (let i = indexDepart; i < lignesBrutes.length; i++) {
    const ligne = lignesBrutes[i];
    if (!Array.isArray(ligne) || ligne.length < 2) continue;
    const [, cheval, note, heure, discipline, cote, arrivee] = ligne;
    if (!cheval) continue;
    rows.push({
      cheval: String(cheval).trim(),
      note: typeof note === 'number' ? note : (parseFloat(note) || null),
      heure: heure != null ? String(heure) : null,
      discipline: discipline != null ? String(discipline) : null,
      cote: typeof cote === 'number' ? cote : (parseFloat(cote) || null),
      arrivee: typeof arrivee === 'number' ? arrivee : (parseInt(arrivee, 10) || null)
    });
  }
  return { dateVal, rows };
}

/**
 * Retrouve l'entree Supplementation d'un cheval par nom (normalise : sans
 * accents, majuscules, apostrophes/espaces multiples uniformises).
 * @param {Array|null} rows - `parseSupplementation(...).rows` (ou tableau
 *   equivalent charge depuis IndexedDB).
 * @param {string} nomCheval
 * @returns {{cheval:string, note:number|null, heure:string|null, discipline:string|null, cote:number|null, arrivee:number|null}|null}
 */
export function trouverSupplementation(rows, nomCheval) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const nomU = normNom(nomCheval);
  return rows.find((r) => normNom(r.cheval) === nomU) || null;
}
