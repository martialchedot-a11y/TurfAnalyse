// =============================================================================
// db.js
// Persistance locale via IndexedDB (aucun serveur, aucun compte nécessaire).
// Les données restent sur l'appareil (iPhone ou PC) qui a fait l'import.
// Six magasins : performances (historique, jamais vidé), meetings, races,
// horses (chevaux engagés par course), journal (prédictions journalisées),
// predictionsExternes (fichier tiers optionnel "Predictions_JJMMAAAA_HHMM",
// cf. js/engine/predictionsExternesParser.js - signal de confirmation croisé
// avec la Base, indicatif uniquement).
// =============================================================================

const DB_NAME = 'turf-analyse';
const DB_VERSION = 2;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('performances')) {
        const s = db.createObjectStore('performances', { keyPath: 'id' });
        s.createIndex('nomChevalU', 'nomChevalU', { unique: false });
      }
      if (!db.objectStoreNames.contains('meetings')) {
        db.createObjectStore('meetings', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('races')) {
        const s = db.createObjectStore('races', { keyPath: 'id' });
        s.createIndex('meetingId', 'meetingId', { unique: false });
      }
      if (!db.objectStoreNames.contains('horses')) {
        const s = db.createObjectStore('horses', { keyPath: 'id' });
        s.createIndex('raceId', 'raceId', { unique: false });
      }
      if (!db.objectStoreNames.contains('journal')) {
        db.createObjectStore('journal', { keyPath: 'id' });
      }
      // Ajouté en DB_VERSION 2 : clé = date+hippodrome+course (cf.
      // clePredictionExterne), un 'put' réimporte donc écrase proprement
      // l'ancienne entrée du même jour au lieu d'accumuler des doublons.
      if (!db.objectStoreNames.contains('predictionsExternes')) {
        db.createObjectStore('predictionsExternes', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeNames, mode) {
  return openDB().then((db) => db.transaction(storeNames, mode));
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function uuid() {
  return (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

// -------------------------------------------------------------------
// Performances (historique cumulatif, jamais vidé)
// -------------------------------------------------------------------
export async function addPerformances(perfs) {
  const t = await tx(['performances'], 'readwrite');
  const store = t.objectStore('performances');
  for (const p of perfs) {
    const record = { id: uuid(), ...p, nomChevalU: (p.nomCheval || '').trim().toUpperCase() };
    store.add(record);
  }
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve(perfs.length);
    t.onerror = () => reject(t.error);
  });
}

export async function getAllPerformances() {
  const t = await tx(['performances'], 'readonly');
  return promisify(t.objectStore('performances').getAll());
}

export async function getPerformancesForHorse(nomCheval) {
  const nomU = (nomCheval || '').trim().toUpperCase();
  const t = await tx(['performances'], 'readonly');
  const idx = t.objectStore('performances').index('nomChevalU');
  return promisify(idx.getAll(nomU));
}

// -------------------------------------------------------------------
// Meetings / Races / Horses (réunion du jour importée)
// -------------------------------------------------------------------
export async function saveMeetingWithRaces(meeting, races) {
  const meetingId = uuid();
  const t = await tx(['meetings', 'races', 'horses'], 'readwrite');
  // Respecte la date fournie par l'appelant (ex. date reelle de la reunion
  // extraite du nom du fichier importe) au lieu de toujours ecraser avec la
  // date/heure de l'import - important pour l'import d'archives (jour
  // anterieur), dont les mises a jour de cotes/resultat/rapports doivent
  // interroger l'API PMU avec le bon jour et non celui de l'import.
  t.objectStore('meetings').add({ id: meetingId, ...meeting, date: meeting.date || new Date().toISOString() });

  for (const race of races) {
    const raceId = uuid();
    const { horses, ...raceData } = race;
    t.objectStore('races').add({ id: raceId, meetingId, ...raceData });
    for (const h of horses) {
      t.objectStore('horses').add({ id: uuid(), raceId, ...h });
    }
  }

  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve(meetingId);
    t.onerror = () => reject(t.error);
  });
}

export async function getAllMeetings() {
  const t = await tx(['meetings'], 'readonly');
  const meetings = await promisify(t.objectStore('meetings').getAll());
  return meetings.sort((a, b) => new Date(b.date) - new Date(a.date));
}

export async function getRacesForMeeting(meetingId) {
  const t = await tx(['races'], 'readonly');
  const idx = t.objectStore('races').index('meetingId');
  const races = await promisify(idx.getAll(meetingId));
  return races.sort((a, b) => a.numeroCourse - b.numeroCourse);
}

export async function getHorsesForRace(raceId) {
  const t = await tx(['horses'], 'readonly');
  const idx = t.objectStore('horses').index('raceId');
  return promisify(idx.getAll(raceId));
}

export async function getRace(raceId) {
  const t = await tx(['races'], 'readonly');
  return promisify(t.objectStore('races').get(raceId));
}

export async function updateRace(race) {
  const t = await tx(['races'], 'readwrite');
  t.objectStore('races').put(race);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function deleteMeeting(meetingId) {
  const races = await getRacesForMeeting(meetingId);
  const t = await tx(['meetings', 'races', 'horses'], 'readwrite');
  t.objectStore('meetings').delete(meetingId);
  for (const race of races) {
    t.objectStore('races').delete(race.id);
  }
  const horsesStore = t.objectStore('horses');
  for (const race of races) {
    const idx = horsesStore.index('raceId');
    const req = idx.openCursor(race.id);
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        horsesStore.delete(cursor.primaryKey);
        cursor.continue();
      }
    };
  }
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/**
 * Vide les réunions importées (meetings + races + horses), SANS toucher à
 * l'historique des performances ni au journal de prédictions/statistiques.
 * Utilisé par le bouton "Vider les réunions importées" (onglet Importer).
 */
export async function resetReunions() {
  const t = await tx(['meetings', 'races', 'horses'], 'readwrite');
  t.objectStore('meetings').clear();
  t.objectStore('races').clear();
  t.objectStore('horses').clear();
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function updateHorse(horse) {
  const t = await tx(['horses'], 'readwrite');
  t.objectStore('horses').put(horse);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function updateHorses(horses) {
  const t = await tx(['horses'], 'readwrite');
  const store = t.objectStore('horses');
  for (const h of horses) store.put(h);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// -------------------------------------------------------------------
// Journal des predictions
// -------------------------------------------------------------------
export async function addJournalEntries(entries) {
  const t = await tx(['journal'], 'readwrite');
  const store = t.objectStore('journal');
  for (const e of entries) store.add({ id: uuid(), ...e });
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function getAllJournalEntries() {
  const t = await tx(['journal'], 'readonly');
  const entries = await promisify(t.objectStore('journal').getAll());
  return entries.sort((a, b) => new Date(b.dateEnregistrement) - new Date(a.dateEnregistrement));
}

export async function findJournalEntries(predicate) {
  const all = await getAllJournalEntries();
  return all.filter(predicate);
}

export async function updateJournalEntry(entry) {
  const t = await tx(['journal'], 'readwrite');
  t.objectStore('journal').put(entry);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// -------------------------------------------------------------------
// Predictions externes (fichier tiers optionnel "Predictions_JJMMAAAA_HHMM",
// cf. js/engine/predictionsExternesParser.js). Purement indicatif : croisé
// avec la Base de l'appli pour un badge de confirmation, n'entre dans aucun
// calcul de Score Global/Value/classement.
// -------------------------------------------------------------------

/**
 * Clé de correspondance date+hippodrome+course, utilisée à la fois pour
 * stocker (import) et pour retrouver (affichage) une prédiction externe -
 * garantit que les deux cotés utilisent exactement la même normalisation.
 * @param {string} dateVal - date au format "AAAA-MM-JJ".
 * @param {string} hippodrome
 * @param {number} numeroCourse
 */
export function clePredictionExterne(dateVal, hippodrome, numeroCourse) {
  const h = (hippodrome || '').trim().toUpperCase();
  return `${dateVal}__${h}__C${numeroCourse}`;
}

/**
 * Enregistre (ou remplace, si déjà présente pour le même jour/hippodrome/
 * course) une liste de prédictions externes parsées.
 * @param {string} dateVal - date au format "AAAA-MM-JJ" (extraite du nom du fichier importé).
 * @param {Array} predictions - retour de PredictionsExternesParser.parsePredictionsExternes.
 */
export async function savePredictionsExternes(dateVal, predictions) {
  const t = await tx(['predictionsExternes'], 'readwrite');
  const store = t.objectStore('predictionsExternes');
  for (const p of predictions) {
    const id = clePredictionExterne(dateVal, p.hippodrome, p.numeroCourse);
    store.put({ id, dateVal, ...p, importedAt: new Date().toISOString() });
  }
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve(predictions.length);
    t.onerror = () => reject(t.error);
  });
}

export async function getAllPredictionsExternes() {
  const t = await tx(['predictionsExternes'], 'readonly');
  return promisify(t.objectStore('predictionsExternes').getAll());
}

export async function getPredictionExterne(dateVal, hippodrome, numeroCourse) {
  const id = clePredictionExterne(dateVal, hippodrome, numeroCourse);
  const t = await tx(['predictionsExternes'], 'readonly');
  return promisify(t.objectStore('predictionsExternes').get(id));
}

export async function resetPredictionsExternes() {
  const t = await tx(['predictionsExternes'], 'readwrite');
  t.objectStore('predictionsExternes').clear();
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// -------------------------------------------------------------------
// Export / Import complet (sauvegarde manuelle, utile avant de changer
// d'appareil ou de navigateur puisqu'il n'y a pas de compte/cloud).
// -------------------------------------------------------------------
export async function exportAll() {
  const [performances, meetings, races, horses, journal, predictionsExternes] = await Promise.all([
    getAllPerformances(),
    getAllMeetings(),
    (async () => { const t = await tx(['races'], 'readonly'); return promisify(t.objectStore('races').getAll()); })(),
    (async () => { const t = await tx(['horses'], 'readonly'); return promisify(t.objectStore('horses').getAll()); })(),
    getAllJournalEntries(),
    getAllPredictionsExternes()
  ]);
  return { version: DB_VERSION, exportedAt: new Date().toISOString(), performances, meetings, races, horses, journal, predictionsExternes };
}

export async function importAll(data) {
  const t = await tx(['performances', 'meetings', 'races', 'horses', 'journal', 'predictionsExternes'], 'readwrite');
  for (const p of data.performances || []) t.objectStore('performances').put(p);
  for (const m of data.meetings || []) t.objectStore('meetings').put(m);
  for (const r of data.races || []) t.objectStore('races').put(r);
  for (const h of data.horses || []) t.objectStore('horses').put(h);
  for (const j of data.journal || []) t.objectStore('journal').put(j);
  for (const pe of data.predictionsExternes || []) t.objectStore('predictionsExternes').put(pe);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
