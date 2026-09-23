// =============================================================================
// surveillance.js
// Logique pure (testable) pour la surveillance automatique "Jeu Simple
// Gagnant" (app.js, aout 2026) : determine si une course entre dans la
// fenetre de declenchement (par defaut 3 minutes avant son heure de depart
// theorique). L'orchestration (minuteur, recuperation des cotes, calcul
// jeuSimpleGagnant, notification navigateur) reste dans app.js car elle
// depend du DOM/IndexedDB/reseau ; ce fichier ne contient que le calcul
// temporel, pour rester testable sans navigateur.
//
// *** Limite connue (a app ouverte uniquement) *** : ce mecanisme repose sur
// un minuteur JavaScript (setInterval) qui tourne tant que l'onglet/l'appli
// est ouvert(e). Si l'appli passe en arriere-plan (ecran verrouille, autre
// appli au premier plan sur mobile), le systeme d'exploitation suspend les
// minuteurs JS et la verification ne se declenche plus de facon fiable -
// aucune notification "vraie" en arriere-plan sans infrastructure de push
// serveur (non presente dans cette appli statique sans backend).
// =============================================================================

/**
 * Convertit une heure de depart ("10h59", tolerant a "10:59"/"10.59") ou un
 * objet Date en nombre de minutes depuis minuit (heure locale).
 * @param {string|Date} valeur
 * @returns {number|null} null si non reconnu.
 */
export function minutesDepuisMinuit(valeur) {
  if (valeur instanceof Date) return valeur.getHours() * 60 + valeur.getMinutes();
  const m = String(valeur || '').match(/(\d{1,2})[h:.](\d{2})/);
  if (!m) return null;
  const heures = Number(m[1]);
  const minutes = Number(m[2]);
  if (heures > 23 || minutes > 59) return null;
  return heures * 60 + minutes;
}

/**
 * Vrai si "maintenant" se trouve dans la fenetre [depart - avanceMinutes ;
 * depart] : la course n'est pas encore partie, et son depart theorique a
 * lieu dans au plus avanceMinutes minutes.
 * @param {string} heureDepart - format "HHhMM" (cf. csvImporter.js).
 * @param {Date} maintenant
 * @param {number} avanceMinutes - par defaut 3 (demande utilisateur).
 * @returns {boolean}
 */
export function estDansFenetreAvantDepart(heureDepart, maintenant, avanceMinutes = 3) {
  const depart = minutesDepuisMinuit(heureDepart);
  if (depart == null) return false;
  const now = minutesDepuisMinuit(maintenant);
  if (now == null) return false;
  const restant = depart - now;
  return restant >= 0 && restant <= avanceMinutes;
}

/**
 * Vrai si la date d'une reunion (ISO) correspond au meme jour civil que
 * "maintenant" (heure locale) - sert a ignorer les reunions d'archives lors
 * de la surveillance en direct.
 * @param {string} dateMeetingISO
 * @param {Date} maintenant
 * @returns {boolean}
 */
export function estAujourdHui(dateMeetingISO, maintenant) {
  const d = new Date(dateMeetingISO);
  if (Number.isNaN(d.getTime())) return false;
  return d.getFullYear() === maintenant.getFullYear()
    && d.getMonth() === maintenant.getMonth()
    && d.getDate() === maintenant.getDate();
}
