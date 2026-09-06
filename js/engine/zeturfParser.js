import { convertirCote } from './coteUtils.js';

// =============================================================================
// zeturfParser.js
// Aucun site de paris tiers n'autorise en pratique un site statique comme
// celui-ci a interroger directement ses cotes depuis le navigateur (pas de
// serveur ici pour contourner les protections CORS, et ce serait de toute
// facon fragile/contraire aux CGU d'un site comme Zeturf). A la place :
// l'utilisateur copie le texte de la page de cotes Zeturf (Ctrl+A / Ctrl+C
// sur le tableau des partants) et le colle dans l'app, qui detecte pour
// chaque ligne un numero de cheval et sa cote la plus recente.
//
// Heuristique par ligne (tolerante a du texte parasite entre les deux,
// comme le nom du cheval, le jockey, etc., copie depuis un tableau HTML) :
//   - le PREMIER nombre entier plausible (1-30, sans virgule/point) de la
//     ligne est pris comme numero de cheval ;
//   - le DERNIER nombre plausible comme cote (>=1.01 et <999), la cote
//     etant toujours la derniere colonne d'un tableau de cotes.
// Les lignes sans au moins 2 nombres, ou dont le "numero" ne ressemble pas
// a un numero de corde, sont ignorees silencieusement.
// =============================================================================

const NOMBRE_RE = /\d+(?:[.,]\d+)?/g;

/**
 * @param {string} texte - texte colle depuis la page Zeturf.
 * @returns {Array<{numero:number, cote:number, ligneBrute:string}>}
 */
export function parseCotesZeturf(texte) {
  if (!texte) return [];
  const resultats = [];

  for (const ligneBrute of texte.split(/\r?\n/)) {
    const ligne = ligneBrute.trim();
    if (!ligne) continue;

    const tokens = ligne.match(NOMBRE_RE);
    if (!tokens || tokens.length < 2) continue;

    const premier = tokens[0];
    const dernier = tokens[tokens.length - 1];

    // Le numero de cheval doit etre un entier "propre" (pas de virgule/point)
    // et rester dans une plage plausible (1 a 30 partants).
    if (/[.,]/.test(premier)) continue;
    const numero = parseInt(premier, 10);
    if (!(numero >= 1 && numero <= 30)) continue;

    const cote = convertirCote(dernier);
    if (!(cote >= 1.01 && cote < 999)) continue;

    // Evite de confondre le numero lui-meme avec la cote sur une ligne a un
    // seul vrai nombre suivi d'un numero repete (ex. "7  7" -> improbable
    // mais on l'ecarte par prudence, ce n'est pas une cote exploitable).
    if (tokens.length === 2 && premier === dernier) continue;

    resultats.push({ numero, cote, ligneBrute: ligne });
  }

  return resultats;
}

/**
 * Associe les cotes detectees (numero -> cote) aux chevaux de la course en
 * cours (par numero), pour preparer un apercu avant application.
 * @param {Array<{numero:number, nom:string}>} chevauxCourse - entries des chevaux de la course (avec .numero, .nom).
 * @param {Array<{numero:number, cote:number}>} cotesDetectees - resultat de parseCotesZeturf.
 * @returns {{ correspondances: Array<{numero:number, nom:string, ancienneCote:number|null, nouvelleCote:number}>, nonReconnus: Array<{numero:number, cote:number}> }}
 */
export function apparierCotesZeturf(chevauxCourse, cotesDetectees, ancienneCoteParNumero = {}) {
  const numerosCourse = new Set(chevauxCourse.map((c) => c.numero));
  const correspondances = [];
  const nonReconnus = [];
  const dejaVus = new Set();

  for (const { numero, cote } of cotesDetectees) {
    if (dejaVus.has(numero)) continue; // garde la premiere occurrence par cheval
    dejaVus.add(numero);

    if (numerosCourse.has(numero)) {
      const cheval = chevauxCourse.find((c) => c.numero === numero);
      correspondances.push({
        numero,
        nom: cheval ? cheval.nom : '',
        ancienneCote: ancienneCoteParNumero[numero] ?? null,
        nouvelleCote: cote
      });
    } else {
      nonReconnus.push({ numero, cote });
    }
  }

  return { correspondances, nonReconnus };
}
