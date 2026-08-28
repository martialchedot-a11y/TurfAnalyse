import * as DB from './db.js';
import * as CSVImporter from './engine/csvImporter.js';
import * as RaceAnalyzer from './engine/raceAnalyzer.js';
import { disciplineFromRaw } from './engine/discipline.js';
import { calculerBasesEtDangers, libelleNiveauBase } from './engine/basesEtDangers.js';
import { calculerCotesCibles } from './engine/cotesCibles.js';
import { apparierCotesZeturf } from './engine/zeturfParser.js';
import { fetchCotesPmu, fetchResultatPmu, fetchRapportsPmu, extraireRapportsSimpleGagnant, extraireRapportsSimplePlace, extraireRapportsCoupleGagnant, extraireRapportsTrio } from './engine/pmuApi.js';
import { parsePredictionsExternes, niveauConfirmationExterne } from './engine/predictionsExternesParser.js';
import { jeuSimpleGagnant, misesJeuSimpleGagnant, MISES_PRESETS_JEU_SIMPLE_GAGNANT, bilanJeuSimpleGagnant, rendementBilan, cumulerBilansJournaliers, multiplicateurMiseEcartRang1 } from './engine/jeuSimpleGagnant.js';
import { estDansFenetreAvantDepart, estAujourdHui } from './engine/surveillance.js';

// =============================================================================
// app.js
// Application principale (routeur + rendu). Pas de framework : rendu par
// chaines HTML + delegation d'evenements, pour rester un fichier unique
// facile a heberger sur GitHub Pages / Netlify sans etape de build.
// =============================================================================

const appEl = document.getElementById('app');
const topbarEl = document.getElementById('topbar');
const tabbarEl = document.getElementById('tabbar');

// Version de l'application, affichee dans la barre du haut sur toutes les
// pages (voir renderTopbar) pour permettre de verifier facilement que
// plusieurs appareils (PC, iPhone...) utilisent bien la meme version
// deployee - a la demande de l'utilisateur (aout 2026), suite a des
// classements/selections differents entre appareils dus a des donnees
// locales desynchronisees (cotes, historique). IMPORTANT : a mettre a jour
// EN MEME TEMPS que CACHE_NAME dans sw.js a chaque livraison (meme valeur).
const APP_VERSION = 'v77';

const TABS = [
  { id: 'meetings', label: 'Reunions', icon: '\u{1F3C1}' },
  { id: 'feuvert', label: 'Top base', icon: '\u{1F7E2}' },
  { id: 'liste', label: 'Courses du jour', icon: '⏱️' },
  { id: 'simplegagnant', label: 'Simple Gagnant', icon: '\u{1F4B0}' },
  { id: 'import', label: 'Importer', icon: '\u{2B07}\u{FE0F}' }
];

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  return parts;
}

function navigate(path) {
  location.hash = '#/' + path;
}

function currentTab(parts) {
  const known = ['meetings', 'import', 'feuvert', 'liste', 'simplegagnant', 'race'];
  if (parts.length === 0) return 'meetings';
  if (parts[0] === 'race') return 'meetings';
  if (parts[0] === 'resultat') return 'feuvert';
  if (parts[0] === 'bilanglobalsimplegagnant') return 'simplegagnant';
  return known.includes(parts[0]) ? parts[0] : 'meetings';
}

function renderTabbar(active) {
  tabbarEl.innerHTML = TABS.map((t) => `
    <button data-tab="${t.id}" class="${t.id === active ? 'active' : ''}">
      <span class="tab-icon">${t.icon}</span>
      <span>${t.label}</span>
    </button>
  `).join('');
  tabbarEl.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.tab));
  });
}

function renderTopbar(title, { back = null } = {}) {
  topbarEl.innerHTML = `
    ${back ? `<button data-back>‹ Retour</button>` : '<span></span>'}
    <h1>${escapeHtml(title)}</h1>
    <span class="app-version muted small" style="width:60px; text-align:right;" title="Version de l'application - doit etre identique sur tous vos appareils">${APP_VERSION}</span>
  `;
  if (back) topbarEl.querySelector('[data-back]').addEventListener('click', back);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function fmt1(n) { return (Math.round((n ?? 0) * 10) / 10).toFixed(1); }
function fmt0(n) { return Math.round(n ?? 0).toString(); }

// -------------------------------------------------------------------
// ROUTER
// -------------------------------------------------------------------
async function render() {
  const parts = parseHash();
  renderTabbar(currentTab(parts));
  if (parts[0] !== 'liste') arreterDecompteListeCourses();

  try {
    if (parts.length === 0 || parts[0] === 'meetings') {
      if (parts[1]) await renderMeetingRaces(parts[1]);
      else await renderMeetingsList();
    } else if (parts[0] === 'race' && parts[1]) {
      if (parts[2] === 'horse' && parts[3]) await renderHorseDetail(parts[1], parts[3]);
      else await renderRaceDetail(parts[1]);
    } else if (parts[0] === 'import') {
      renderImport();
    } else if (parts[0] === 'feuvert') {
      await renderCourseFeuVert();
    } else if (parts[0] === 'liste') {
      await renderListeCourses();
    } else if (parts[0] === 'resultat') {
      await renderResultatJournee();
    } else if (parts[0] === 'simplegagnant') {
      await renderBilanSimpleGagnant();
    } else if (parts[0] === 'bilanglobalsimplegagnant') {
      await renderBilanGlobalSimpleGagnant();
    } else {
      await renderMeetingsList();
    }
  } catch (err) {
    console.error(err);
    appEl.innerHTML = `<div class="card"><p class="bold">Erreur</p><p class="muted">${escapeHtml(err.message || String(err))}</p></div>`;
  }
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);

// -------------------------------------------------------------------
// SURVEILLANCE AUTOMATIQUE : "Jeu Simple Gagnant" a H-3min (aout 2026)
// A la demande de l'utilisateur : tant que l'appli reste ouverte au premier
// plan, verifie automatiquement les cotes de chaque course du jour 3
// minutes avant son depart theorique, recalcule le Jeu Simple Gagnant
// (engine/jeuSimpleGagnant.js) et envoie une notification navigateur si un
// N rentable est trouve. Le minuteur (setInterval) est un etat de module,
// independant de la page affichee : il continue de tourner quelle que soit
// la route active. *** Limite : suspendu si l'appli passe en arriere-plan
// (ecran verrouille, autre appli au premier plan sur mobile) - pas de vraie
// notification en arriere-plan sans infrastructure de push serveur. ***
// -------------------------------------------------------------------
const SURVEILLANCE_STORAGE_KEY = 'turf-surveillance-jsg-active';
const SURVEILLANCE_INTERVALLE_MS = 20000;
const SURVEILLANCE_AVANCE_MINUTES = 3;

let surveillanceActive = false;
let surveillanceIntervalId = null;
let surveillanceDerniereVerif = null;
let surveillanceCompteur = 0;

/**
 * Safari sur iPhone/iPad expose l'objet global Notification (pour la
 * compatibilite de code), mais n'implemente PAS les notifications locales :
 * new Notification(...) echoue silencieusement, sans lever d'erreur ni
 * afficher quoi que ce soit. Seul le Web Push (infrastructure serveur
 * dediee, absente de cette appli statique) fonctionne sur iOS - voir
 * HEBERGEMENT.md. On detecte donc iOS explicitement plutot que de se fier a
 * la seule presence de l'API, pour ne pas proposer un bouton "Activer" qui
 * ne ferait rien de visible sur iPhone.
 */
function estIOS() {
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ se presente comme "MacIntel" en desktop mode : on distingue
  // via la presence d'un ecran tactile (absente sur un vrai Mac a trackpad).
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

function surveillanceSupportee() {
  return typeof Notification !== 'undefined' && !estIOS();
}

async function demarrerSurveillance() {
  if (!surveillanceSupportee()) return { ok: false, raison: 'unsupported' };
  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') return { ok: false, raison: 'refuse' };

  surveillanceActive = true;
  try { localStorage.setItem(SURVEILLANCE_STORAGE_KEY, '1'); } catch (err) { /* stockage indisponible : sans consequence */ }
  if (!surveillanceIntervalId) {
    surveillanceIntervalId = setInterval(verifierCoursesAVenir, SURVEILLANCE_INTERVALLE_MS);
    verifierCoursesAVenir();
  }
  return { ok: true };
}

function arreterSurveillance() {
  surveillanceActive = false;
  try { localStorage.setItem(SURVEILLANCE_STORAGE_KEY, '0'); } catch (err) { /* stockage indisponible : sans consequence */ }
  if (surveillanceIntervalId) { clearInterval(surveillanceIntervalId); surveillanceIntervalId = null; }
}

async function verifierCoursesAVenir() {
  if (!surveillanceActive) return;
  surveillanceDerniereVerif = new Date();
  try {
    const maintenant = new Date();
    const meetings = await DB.getAllMeetings();
    const toutesPerfs = await DB.getAllPerformances();
    for (const meeting of meetings) {
      if (!estAujourdHui(meeting.date, maintenant)) continue;
      if (!(meeting.numeroReunion > 0)) continue;
      const races = await DB.getRacesForMeeting(meeting.id);
      for (const race of races) {
        if (race.arriveeBrute) continue;
        if (race.notifieJsg) continue;
        if (!race.heureDepart) continue;
        if (!(race.numeroCourse > 0)) continue;
        if (!estDansFenetreAvantDepart(race.heureDepart, maintenant, SURVEILLANCE_AVANCE_MINUTES)) continue;
        await verifierEtNotifierCourse(meeting, race, toutesPerfs);
      }
    }
  } catch (err) {
    console.error('Surveillance JSG : erreur pendant la verification', err);
  }
}

async function verifierEtNotifierCourse(meeting, race, toutesPerfs) {
  try {
    const dateVal = new Date(meeting.date).toISOString().slice(0, 10);
    const horseRecords = await DB.getHorsesForRace(race.id);
    const cotesPmu = await fetchCotesPmu(dateVal, meeting.numeroReunion, race.numeroCourse);
    const cotesUtilisables = cotesPmu.filter((c) => c.cote != null).map((c) => ({ numero: c.numero, cote: c.cote }));
    const ancienneCoteParNumero = Object.fromEntries(horseRecords.map((h) => [h.numero, h.coteDirecte > 0 ? h.coteDirecte : null]));
    const { correspondances } = apparierCotesZeturf(horseRecords, cotesUtilisables, ancienneCoteParNumero);

    const updatedHorses = horseRecords
      .map((h) => {
        const match = correspondances.find((c) => c.numero === h.numero);
        return match ? { ...h, coteDirecte: match.nouvelleCote } : null;
      })
      .filter(Boolean);
    if (updatedHorses.length > 0) await DB.updateHorses(updatedHorses);

    const horsesFinal = horseRecords.map((h) => {
      const maj = updatedHorses.find((u) => u.id === h.id);
      return { entry: maj || h, historique: CSVImporter.historiquePour(h.nom, toutesPerfs, dateVal) };
    });
    const context = {
      lieu: race.lieu,
      discipline: disciplineFromRaw(race.discipline),
      disciplineBrute: race.discipline,
      distanceJour: race.distanceJour,
      allocation: race.allocation,
      nbPartants: horsesFinal.length
    };
    const result = RaceAnalyzer.analyser(horsesFinal, context, false);
    const jeu = jeuSimpleGagnant(result.chevaux, race.lieu);

    if (jeu.rentable) {
      surveillanceCompteur++;
      envoyerNotificationJsg(meeting, race, jeu);
    }
  } catch (err) {
    console.error(`Surveillance JSG : erreur sur la course ${race.id}`, err);
  } finally {
    // Marquee comme verifiee dans tous les cas (rentable, non rentable, ou
    // erreur) pour ne pas re-interroger l'API a chaque cycle de 20s pendant
    // toute la fenetre de 3 minutes.
    race.notifieJsg = true;
    try { await DB.updateRace(race); } catch (err) { /* si l'ecriture echoue, la course sera revue au prochain cycle */ }
  }
}

function envoyerNotificationJsg(meeting, race, jeu) {
  const pool = jeu.recommande;
  const rendementPct = Math.round(pool.rendement * 1000) / 10;
  const modeLabel = libelleModeSimpleGagnant(jeu);
  const titre = `Jeu Simple Gagnant possible : ${meeting.hippodrome} C${race.numeroCourse}`;
  const corps = `${modeLabel} (n° ${pool.chevaux.map((c) => c.entry.numero).join('-')}) - rendement ${rendementPct}% - depart ${race.heureDepart || ''}`;
  try {
    const notif = new Notification(titre, { body: corps, tag: `jsg-${race.id}` });
    notif.onclick = () => {
      window.focus();
      navigate(`race/${race.id}`);
      notif.close();
    };
  } catch (err) {
    console.error('Surveillance JSG : notification impossible', err);
  }
}

function surveillanceBannerHtml() {
  if (!surveillanceSupportee()) {
    const message = estIOS()
      ? `Surveillance auto indisponible sur iPhone/iPad : Safari ne supporte pas les notifications locales pour les pages web (seul le Web Push, avec un serveur dedie, le permettrait - non present dans cette appli). Fonctionne sur PC (Chrome, Edge, Firefox).`
      : `Surveillance automatique indisponible : ce navigateur ne supporte pas les notifications.`;
    return `<div class="card"><p class="small muted">${message}</p></div>`;
  }
  const statutHtml = surveillanceActive
    ? `<span class="tag-green">Active</span> - ${surveillanceCompteur} alerte(s) envoyee(s)${surveillanceDerniereVerif ? ` - derniere verification ${surveillanceDerniereVerif.toLocaleTimeString('fr-FR')}` : ''}`
    : `<span class="muted">Inactive</span>`;
  return `
    <div class="card">
      <p class="bold">Surveillance auto - Jeu Simple Gagnant</p>
      <p class="small muted">Verifie les cotes 3 min avant le depart de chaque course du jour et notifie si le Jeu Simple Gagnant est rentable. Necessite l'appli ouverte au premier plan.</p>
      <p class="small" style="margin:6px 0;">${statutHtml}</p>
      <button class="btn ${surveillanceActive ? 'btn-secondary' : 'btn-primary'} btn-block" data-toggle-surveillance>${surveillanceActive ? 'Desactiver' : 'Activer la surveillance'}</button>
      <div id="surveillance-status"></div>
    </div>
  `;
}

function bindSurveillanceBanner() {
  const btn = appEl.querySelector('[data-toggle-surveillance]');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const statusEl = appEl.querySelector('#surveillance-status');
    if (surveillanceActive) {
      arreterSurveillance();
      renderMeetingsList();
      return;
    }
    btn.disabled = true;
    if (statusEl) statusEl.innerHTML = '<p class="muted small" style="margin-top:8px;">Demande d\'autorisation de notification...</p>';
    const res = await demarrerSurveillance();
    if (!res.ok && statusEl) {
      statusEl.innerHTML = res.raison === 'refuse'
        ? '<p class="small tag-orange" style="margin-top:8px;">Notifications refusees : autorise-les dans les reglages du navigateur pour activer la surveillance.</p>'
        : '<p class="small tag-orange" style="margin-top:8px;">Notifications non supportees par ce navigateur.</p>';
    }
    renderMeetingsList();
  });
}

// Reprise automatique au chargement si la surveillance etait active et que
// la permission est deja accordee (pas de nouvelle demande sans geste
// utilisateur si elle avait ete refusee/jamais demandee).
window.addEventListener('DOMContentLoaded', () => {
  try {
    if (surveillanceSupportee() && localStorage.getItem(SURVEILLANCE_STORAGE_KEY) === '1' && Notification.permission === 'granted') {
      demarrerSurveillance();
    }
  } catch (err) { /* stockage indisponible : pas de reprise automatique */ }
});

// -------------------------------------------------------------------
// REUNIONS
// -------------------------------------------------------------------
async function renderMeetingsList() {
  renderTopbar('Reunions');
  const meetings = await DB.getAllMeetings();

  if (meetings.length === 0) {
    appEl.innerHTML = `
      ${surveillanceBannerHtml()}
      <div class="empty-state">
        <div class="icon">\u{1F3C1}</div>
        <p class="bold">Aucune reunion</p>
        <p class="muted">Importez une reunion depuis l'onglet "Importer".</p>
      </div>`;
    bindSurveillanceBanner();
    return;
  }

  const rows = await Promise.all(meetings.map(async (m) => {
    const races = await DB.getRacesForMeeting(m.id);
    return { m, nbRaces: races.length };
  }));

  appEl.innerHTML = `
    ${surveillanceBannerHtml()}
    <div class="list-group">${rows.map(({ m, nbRaces }) => `
    <div class="list-item clickable" data-goto="meetings/${m.id}">
      <div>
        <div class="bold">${escapeHtml(m.hippodrome)}</div>
        <div class="muted small">Reunion ${m.numeroReunion} - ${nbRaces} course(s) - ${new Date(m.date).toLocaleDateString('fr-FR')}</div>
      </div>
      <div class="muted">&rsaquo;</div>
    </div>
  `).join('')}</div>`;

  bindGoto();
  bindSurveillanceBanner();
}

async function renderMeetingRaces(meetingId) {
  const meetings = await DB.getAllMeetings();
  const meeting = meetings.find((m) => m.id === meetingId);
  renderTopbar(meeting ? meeting.hippodrome : 'Reunion', { back: () => navigate('meetings') });

  const races = await DB.getRacesForMeeting(meetingId);
  if (races.length === 0) {
    appEl.innerHTML = `<div class="empty-state"><p class="muted">Aucune course dans cette reunion.</p></div>`;
    return;
  }

  const rows = await Promise.all(races.map(async (r) => {
    const horses = await DB.getHorsesForRace(r.id);
    return { r, nb: horses.length };
  }));

  appEl.innerHTML = `
    <div class="list-group">${rows.map(({ r, nb }) => `
      <div class="list-item clickable" data-goto="race/${r.id}">
        <div>
          <div class="bold">Course ${r.numeroCourse} - ${escapeHtml(r.discipline)}</div>
          <div class="muted small">${nb} partants - ${Math.round(r.distanceJour)} m - depart ${escapeHtml(r.heureDepart || '')}</div>
          ${(nb < 9 || nb > 16) ? '<div class="small tag-orange">Nombre de partants inhabituel pour le modele (9 a 16 attendus)</div>' : ''}
        </div>
        <div class="muted">&rsaquo;</div>
      </div>
    `).join('')}</div>

    <button class="btn btn-secondary btn-block" data-update-reunion style="margin-top:8px;">Mettre a jour les cotes de toute la reunion</button>
    <div id="reunion-update-status"></div>
  `;

  bindGoto();

  // Mise a jour des cotes en un seul clic pour TOUTE la reunion : reprend,
  // course par course et de facon sequentielle (pour ne pas multiplier les
  // requetes simultanees vers PMU/proxies), exactement le meme mecanisme
  // que le bouton "Mettre a jour les cotes en direct" de renderRaceDetail
  // (fetchCotesPmu -> apparierCotesZeturf -> DB.updateHorses, puis
  // recuperation de l'arrivee si pas encore connue). Les echecs sur une
  // course n'interrompent pas les suivantes (reseau/course pas encore
  // ouverte aux cotes...) : un recapitulatif final indique le nombre de
  // reussites/echecs.
  appEl.querySelector('[data-update-reunion]').addEventListener('click', async () => {
    const btn = appEl.querySelector('[data-update-reunion]');
    const statusEl = appEl.querySelector('#reunion-update-status');

    if (!meeting || !(meeting.numeroReunion > 0)) {
      statusEl.innerHTML = '<p class="muted small" style="margin-top:8px;">Reunion inconnue : impossible de recuperer les cotes automatiquement.</p>';
      return;
    }
    const dateVal = new Date(meeting.date).toISOString().slice(0, 10);
    const numReunion = meeting.numeroReunion;

    btn.disabled = true;
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < races.length; i++) {
      const race = races[i];
      statusEl.innerHTML = `<p class="muted small" style="margin-top:8px;">Mise a jour course ${i + 1}/${races.length} (course ${race.numeroCourse})...</p>`;
      try {
        const horseRecords = await DB.getHorsesForRace(race.id);
        const cotesPmu = await fetchCotesPmu(dateVal, numReunion, race.numeroCourse);
        const cotesUtilisables = cotesPmu.filter((c) => c.cote != null).map((c) => ({ numero: c.numero, cote: c.cote }));
        const ancienneCoteParNumero = Object.fromEntries(horseRecords.map((h) => [h.numero, h.coteDirecte > 0 ? h.coteDirecte : null]));
        const { correspondances } = apparierCotesZeturf(horseRecords, cotesUtilisables, ancienneCoteParNumero);

        const updated = horseRecords
          .map((h) => {
            const match = correspondances.find((c) => c.numero === h.numero);
            return match ? { ...h, coteDirecte: match.nouvelleCote } : null;
          })
          .filter(Boolean);
        if (updated.length > 0) await DB.updateHorses(updated);

        if (!race.arriveeBrute) {
          const arrivee = await fetchResultatPmu(dateVal, numReunion, race.numeroCourse);
          if (arrivee && arrivee.length > 0) {
            race.arriveeBrute = arrivee.join('-');
            await DB.updateRace(race);
          }
        }
        ok++;
      } catch (err) {
        fail++;
      }
    }

    statusEl.innerHTML = `<p class="muted small" style="margin-top:8px;">Mise a jour terminee : ${ok} course(s) mise(s) a jour${fail > 0 ? `, ${fail} echec(s)` : ''}.</p>`;
    await renderMeetingRaces(meetingId);
  });
}

function bindGoto() {
  appEl.querySelectorAll('[data-goto]').forEach((el) => {
    el.addEventListener('click', () => navigate(el.dataset.goto));
  });
}

// -------------------------------------------------------------------
// COURSE : classement predictif
// -------------------------------------------------------------------
let lastAnalysis = null; // { raceId, result, useCote8h }

async function renderRaceDetail(raceId, useCote8h = false) {
  const race = await DB.getRace(raceId);
  if (!race) { appEl.innerHTML = '<div class="card">Course introuvable.</div>'; return; }
  renderTopbar(`Course ${race.numeroCourse}`, { back: () => navigate(`meetings/${race.meetingId}`) });

  const horseRecords = await DB.getHorsesForRace(raceId);
  const toutesPerfs = await DB.getAllPerformances();
  const meetings = await DB.getAllMeetings();
  const meeting = meetings.find((m) => m.id === race.meetingId);
  const dateCourse = meeting ? new Date(meeting.date).toISOString().slice(0, 10) : null;

  const horses = horseRecords.map((h) => ({
    entry: h,
    historique: CSVImporter.historiquePour(h.nom, toutesPerfs, dateCourse)
  }));

  const context = {
    lieu: race.lieu,
    discipline: disciplineFromRaw(race.discipline),
    disciplineBrute: race.discipline,
    distanceJour: race.distanceJour,
    allocation: race.allocation,
    nbPartants: horses.length
  };

  const result = RaceAnalyzer.analyser(horses, context, useCote8h);
  const basesEtDangers = calculerBasesEtDangers(result.chevaux, context.discipline.canonical);
  const cotesCibles = calculerCotesCibles(result.chevaux, context.nbPartants);
  const predictionExterne = meeting
    ? await DB.getPredictionExterne(new Date(meeting.date).toISOString().slice(0, 10), meeting.hippodrome, race.numeroCourse)
    : null;
  lastAnalysis = { raceId, result, useCote8h, horseRecords };

  appEl.innerHTML = `
    <div class="segmented">
      <button data-cote="false" class="${!useCote8h ? 'active' : ''}">Cote directe</button>
      <button data-cote="true" class="${useCote8h ? 'active' : ''}">Cote 8h</button>
    </div>

    <div id="arrivee-block">${arriveeOfficielleHtml(race)}</div>

    ${couvertureHistoriqueHtml(result.chevaux)}

    <div class="list-group">
      ${result.chevaux.map((c) => horseRowHtml(c, raceId, useCote8h)).join('')}
    </div>

    <button class="btn btn-secondary btn-block" data-zeturf style="margin-top:8px;">Mettre a jour les cotes en direct</button>
    <div id="zeturf-status"></div>

    ${basesEtDangersHtml(basesEtDangers, cotesCibles, result.resume, result.chevaux, context.discipline.canonical, predictionExterne, context.lieu)}

    ${resumeHtml(result.resume)}

    <div style="display:flex; gap:10px; margin-top: 8px;">
      <button class="btn btn-secondary btn-block" data-resultat>Resultat</button>
    </div>

    <dialog id="resultat-dialog" class="card" style="border:none; width: 90%; max-width: 420px;">
      <h3>Resultat de la course</h3>
      <div class="field">
        <label>Ordre d'arrivee (numeros separes par des tirets, ex. 10-15-3-7)</label>
        <input type="text" id="arrivee-input" value="${escapeHtml(race.arriveeBrute || '')}">
      </div>
      <div style="display:flex; gap:10px;">
        <button class="btn btn-secondary" id="close-dialog">Fermer</button>
        <button class="btn btn-primary" id="save-arrivee">Enregistrer</button>
      </div>
    </dialog>

  `;

  appEl.querySelectorAll('[data-cote]').forEach((btn) => {
    btn.addEventListener('click', () => renderRaceDetail(raceId, btn.dataset.cote === 'true'));
  });

  appEl.querySelectorAll('[data-horse]').forEach((el) => {
    el.addEventListener('click', () => navigate(`race/${raceId}/horse/${el.dataset.horse}`));
  });

  bindJeuSimpleGagnant(result.chevaux, race.lieu);

  const dialog = appEl.querySelector('#resultat-dialog');
  appEl.querySelector('[data-resultat]').addEventListener('click', () => dialog.showModal());
  appEl.querySelector('#close-dialog').addEventListener('click', () => dialog.close());
  appEl.querySelector('#save-arrivee').addEventListener('click', async () => {
    const raw = appEl.querySelector('#arrivee-input').value;
    race.arriveeBrute = raw;
    await DB.updateRace(race);
    dialog.close();
    render();
  });

  // Mise a jour des cotes en un seul clic : recuperation automatique
  // (PMU.fr, avec repli via fonction externe/proxy deja gere par
  // fetchCotesPmu) puis application immediate aux chevaux de la course,
  // sans etape de confirmation intermediaire. La date/reunion/course sont
  // deja connues (donnees de la reunion importee) : aucune saisie requise.
  appEl.querySelector('[data-zeturf]').addEventListener('click', async () => {
    const btn = appEl.querySelector('[data-zeturf]');
    const statusEl = appEl.querySelector('#zeturf-status');

    if (!meeting || !(meeting.numeroReunion > 0) || !(race.numeroCourse > 0)) {
      statusEl.innerHTML = '<p class="muted small" style="margin-top:8px;">Reunion ou course inconnue : impossible de recuperer les cotes automatiquement.</p>';
      return;
    }
    const dateVal = new Date(meeting.date).toISOString().slice(0, 10);
    const numReunion = meeting.numeroReunion;
    const numCourse = race.numeroCourse;

    btn.disabled = true;
    statusEl.innerHTML = '<p class="muted small" style="margin-top:8px;">Recuperation et mise a jour en cours (plusieurs sources sont tentees automatiquement, jusqu\'a quelques secondes)...</p>';
    try {
      const cotesPmu = await fetchCotesPmu(dateVal, numReunion, numCourse);
      const cotesUtilisables = cotesPmu.filter((c) => c.cote != null).map((c) => ({ numero: c.numero, cote: c.cote }));
      const ancienneCoteParNumero = Object.fromEntries(horseRecords.map((h) => [h.numero, h.coteDirecte > 0 ? h.coteDirecte : null]));
      const { correspondances } = apparierCotesZeturf(horseRecords, cotesUtilisables, ancienneCoteParNumero);

      const updated = horseRecords
        .map((h) => {
          const match = correspondances.find((c) => c.numero === h.numero);
          return match ? { ...h, coteDirecte: match.nouvelleCote } : null;
        })
        .filter(Boolean);
      if (updated.length > 0) await DB.updateHorses(updated);

      // Si l'arrivee officielle est deja connue (course terminee), on la
      // recupere et l'enregistre automatiquement, sans action supplementaire.
      if (!race.arriveeBrute) {
        const arrivee = await fetchResultatPmu(dateVal, numReunion, numCourse);
        if (arrivee && arrivee.length > 0) {
          race.arriveeBrute = arrivee.join('-');
          await DB.updateRace(race);
        }
      }

      // Le re-rendu complet de la page affiche directement les cotes a jour
      // (plus besoin d'ecran de confirmation intermediaire).
      await renderRaceDetail(raceId, useCote8h);
    } catch (err) {
      btn.disabled = false;
      statusEl.innerHTML = `<p class="muted small" style="margin-top:8px;">Mise a jour automatique impossible (${escapeHtml(err.message || String(err))}). Reessayez plus tard.</p>`;
    }
  });
}

function arriveeOfficielleHtml(race) {
  const ordre = CSVImporter.parseOrdreArrivee(race.arriveeBrute || '');
  if (ordre.length === 0) return '';
  return `
    <div class="card" style="margin-bottom:8px;">
      <p class="bold small" style="margin-bottom:4px;">Arrivee officielle</p>
      <p class="bold">${ordre.join(' - ')}</p>
    </div>
  `;
}

// Indicateur de couverture d'historique : compte, pour la course affichee,
// combien de chevaux n'ont AUCUNE performance passee retrouvee dans
// l'historique importe (nbCourses === 0 - cf. ScoringEngine.scoreForme,
// qui applique alors un score par defaut neutre plutot qu'une vraie
// evaluation). Purement informatif, n'entre dans aucun calcul.
// Justification (backtest reel, 3037 courses / 36330 chevaux, voir
// HEBERGEMENT.md) : selon la fraicheur des exports de performances
// fournis, jusqu'a 86,6% des chevaux d'un echantillon pouvaient se
// retrouver dans ce cas - un ecart important a garder en tete en
// consultant le Score Forme/Aptitude/Similaire de ces chevaux.
/**
 * Proportion de chevaux d'une course sans AUCUNE performance passee
 * retrouvee dans l'historique importe (nbCourses === 0 - cf.
 * ScoringEngine.scoreForme, qui applique alors un score par defaut neutre).
 * @param {Array} chevaux - result.chevaux.
 * @returns {number} ratio de 0 (tous ont un historique) a 1 (aucun).
 */
function ratioSansHistorique(chevaux) {
  const total = (chevaux || []).length;
  if (total === 0) return 0;
  const sansHistorique = chevaux.filter((c) => (c.nbCourses || 0) === 0).length;
  return sansHistorique / total;
}

function couvertureHistoriqueHtml(chevaux) {
  const total = (chevaux || []).length;
  if (total === 0) return '';
  const sansHistorique = chevaux.filter((c) => (c.nbCourses || 0) === 0).length;
  if (sansHistorique === 0) return '';
  const ratio = ratioSansHistorique(chevaux);
  const cls = ratio >= 0.75 ? 'tag-red' : (ratio >= 0.4 ? 'tag-orange' : 'tag-gray');
  const pluriel = sansHistorique > 1 ? 'chevaux' : 'cheval';
  return `
    <p class="small ${cls} bold" style="margin: 4px 0 8px;" title="Score Forme/Aptitude/Similaire par defaut (neutre) pour ces chevaux, faute d'historique retrouve.">
      &#9888; ${sansHistorique}/${total} ${pluriel} sans historique de performances trouve
    </p>
  `;
}

function recommandationClass(reco) {
  if (reco === 'Base très solide' || reco === 'Base solide') return 'tag-green';
  if (reco === 'Favori') return 'tag-blue';
  if (reco === 'Outsider solide' || reco === 'Outsider') return 'tag-orange';
  if (reco === 'Eliminable') return 'tag-gray';
  return '';
}

function valueClass(v) {
  if (v >= 30) return 'tag-green';
  if (v >= 10) return 'tag-green';
  if (v >= -10) return 'tag-gray';
  if (v >= -30) return 'tag-orange';
  return 'tag-red';
}

function horseRowHtml(c, raceId, useCote8h) {
  // Affiche la cote correspondant au selecteur actif ("Cote directe" / "Cote
  // 8h") en haut de l'ecran, avec repli sur l'autre cote si celle demandee
  // est absente/0 - coherent avec le calcul de Value (raceAnalyzer.js), qui
  // utilise deja la meme priorite selon ce meme selecteur. Auparavant cette
  // fonction ignorait le selecteur et affichait toujours la cote directe
  // (colonne Z) en priorite, meme en mode "Cote 8h" (colonne Y) : les deux
  // affichages semblaient alors identiques tant qu'aucune mise a jour des
  // cotes en direct n'avait ete faite.
  const cotePourAffichage = useCote8h
    ? (c.entry.cote8h > 0 ? c.entry.cote8h : (c.entry.coteDirecte > 0 ? c.entry.coteDirecte : null))
    : (c.entry.coteDirecte > 0 ? c.entry.coteDirecte : (c.entry.cote8h > 0 ? c.entry.cote8h : null));
  return `
    <div class="horse-row list-item clickable" data-horse="${c.entry.id}">
      <div class="horse-rank">${c.classement}</div>
      <div class="horse-info">
        <div class="name">N&deg;${c.entry.numero} - ${escapeHtml(c.entry.nom)}</div>
        <div class="reco ${recommandationClass(c.recommandation)}">${escapeHtml(c.recommandation)}</div>
      </div>
      <div class="horse-metrics">
        <div class="score">${fmt1(c.scoreGlobal)}</div>
        <div class="sub">Cote ${cotePourAffichage ? fmt1(cotePourAffichage) : '-'}</div>
      </div>
      <div class="horse-value">
        <div class="v ${valueClass(c.value)}">${c.value >= 0 ? '+' : ''}${fmt0(c.value)}%</div>
        <div class="sub">Top3 ${fmt0(c.probTop3)}%</div>
      </div>
    </div>
  `;
}

// Seuil du croisement "course logique / course disputee" ci-dessous.
const SEUIL_MAX_DANGERS = 5; // <= 5 dangers toleres

/**
 * Determine si une course est "logique" (arrivee plausible/previsible) ou
 * "disputee" (compliquee a trouver), en croisant trois signaux deja
 * calcules par le moteur. *** Mise a jour *** : la cote (marche) n'est plus
 * prise en compte ici - ni pour la confirmation de la base, ni pour le
 * comptage des Danger(s) - afin que ce statut reste base uniquement sur les
 * criteres techniques (Module 2) et le classement du Score Global (Module 1),
 * independamment de ce que fait le marche des cotes. On utilise pour cela
 * les champs `baseConfirmeeSansCote`/`dangerSansCote` de basesEtDangers.js
 * (variantes sans filtre de cote de `bases`/`danger`, ces derniers restant
 * inchanges pour l'affichage du bloc "Base(s) possible(s) & Danger(s)") :
 * 1. Au moins une base "solide" ou "tres solide" (Module 1) est confirmee
 *    techniquement (Module 2 : rubriques/associations), quelle que soit sa
 *    cote.
 * 2. Au maximum 5 Danger(s) (Value < -10%, quelle que soit la cote). Un
 *    Danger = cheval delaisse par le modele mais tres joue par le marche.
 *    Au-dela de 5, trop de desaccord pour parler de course logique.
 * 3. "Hierarchie claire" (ecart Top3/4e >= 15 points, cf. resumeHtml) : le
 *    Top3 se detache nettement du reste. *** Note *** : la confiance Top3
 *    moyenne (Plackett-Luce) a ete testee et ecartee comme 3e critere -
 *    verifiee sur des donnees reelles (reunion CLAIREFONTAINE-DEAUVILLE),
 *    elle reste quasi toujours entre 20 et 35% quel que soit le niveau de
 *    domination du favori (le modele dilue la probabilite Top3 entre tous
 *    les partants d'un champ de 11 a 15 chevaux), rendant tout seuil eleve
 *    (ex. 60%) pratiquement inatteignable meme pour des bases tres solides
 *    ecrasantes. L'ecart Top3/4e, lui, varie fortement avec la domination
 *    reelle du favori et est donc un bien meilleur signal ici.
 * Les 3 doivent etre reunis pour "Course logique" ; sinon "Course disputee".
 *
 * *** Libelle "Course disputee" (ex "Course aleatoire") *** : renomme suite
 * a un retour utilisateur, le libelle "aleatoire" laissant penser a tort
 * qu'aucun pick ne pouvait etre fiable sur ce type de course.
 */
function estCourseLogique(bd, r) {
  const baseConfirmee = bd?.baseConfirmeeSansCote ?? false;
  const dangersOK = (bd?.dangerSansCote || []).length <= SEUIL_MAX_DANGERS;
  const hierarchieClaire = r?.hierarchie === 'Hiérarchie claire';
  return baseConfirmee && dangersOK && hierarchieClaire;
}

function annotationCourseHtml(bd, r) {
  return estCourseLogique(bd, r)
    ? '<span class="small tag-green bold">Course logique</span>'
    : '<span class="small tag-orange bold">Course disputée</span>';
}

/**
 * Cheval "prioritaire" pour le pick d'une course : une base "tres solide"
 * confirmee techniquement (Module 2, niveau `confirmee_forte`) ET classee
 * n1 par le Score Global (Module 1), si elle existe.
 *
 * *** Historique important *** : sur le premier backtest (1 mois, 1027
 * courses), cette combinaison affichait 41,7% de victoires / 75,0% de
 * Top3 (n=24), nettement au-dessus du reste. Sur le backtest elargi a 2
 * mois (1995 courses, voir HEBERGEMENT.md), ce chiffre est retombe a
 * 32,4% de victoires / 61,8% de Top3 (n=68) — quasiment identique a la
 * "base confirmee unique" (33,8%/62,8%, n=506) : l'ecart initial etait un
 * effet de petit echantillon (n=24), pas un signal distinct. Utilisee comme
 * "ancre" par la cascade Conseil de jeu (cf. conseilJeu ci-dessous).
 * @param {Object} bd - resultat de calculerBasesEtDangers.
 * @param {Array} chevaux - result.chevaux (pour retrouver le classement).
 * @returns {Object|null} le cheval concerne, ou null si la combinaison n'est pas reunie.
 */
function chevalConfianceMaximale(bd, chevaux) {
  const base = (bd?.bases || []).find((b) => b.niveau === 'confirmee_forte');
  if (!base) return null;
  const cheval = (chevaux || []).find((c) => c.entry.numero === base.numero);
  if (!cheval || cheval.classement !== 1) return null;
  return cheval;
}

/**
 * Niveau de fiabilite indicatif du signal "Base confirmee" (Module 2)
 * selon la discipline, mesure sur le backtest elargi (2 mois, 1995
 * courses, voir HEBERGEMENT.md) : Attele (34,8%, n=394), Steeple (35,7%,
 * n=28) et Haies (38,5%, n=26) forment desormais un groupe "renforce"
 * assez homogene, contre Plat (25,0%, n=204) et Monte (26,9%, n=67) plus
 * moderes. Purement indicatif (affichage), n'entre dans aucun calcul.
 */
function fiabiliteDiscipline(disciplineCanonique) {
  switch (disciplineCanonique) {
    case 'ATTELE':
      return { cls: 'tag-green', label: 'Fiabilite renforcee (Attele)', detail: '34,8% de victoires sur les bases confirmees, n=394' };
    case 'STEEPLE':
      return { cls: 'tag-green', label: 'Fiabilite renforcee (Steeple)', detail: '35,7% de victoires sur les bases confirmees, n=28' };
    case 'HAIES':
      return { cls: 'tag-green', label: 'Fiabilite renforcee (Haies)', detail: '38,5% de victoires sur les bases confirmees, n=26' };
    case 'PLAT':
      return { cls: 'tag-orange', label: 'Fiabilite plus moderee (Plat)', detail: '25,0% de victoires sur les bases confirmees, n=204' };
    case 'MONTE':
      return { cls: 'tag-orange', label: 'Fiabilite plus moderee (Monte)', detail: '26,9% de victoires sur les bases confirmees, n=67' };
    default:
      return null;
  }
}

/**
 * "Trio Value (avec base)" : utilise la meilleure Base tres solide de la
 * course (n'importe quel rang/statut de confirmation - PAS seulement
 * l'ancre stricte de `chevalConfianceMaximale`, confirmee ET classee n1,
 * utilisee par la Suggestion Couple Gagnant) comme base fixe du Trio,
 * puis retient les 5 candidats du reste du champ tries par Value
 * croissante (il faut combiner 2 des 5 avec la base).
 *
 * Remplace l'ancienne "Suggestion Trio" (ancre stricte + 5 candidats,
 * 59,6% quand l'ancre finit deja Top3, n=423, backtest 3 mois). Constat
 * sur le meme principe, reconfirme sur 4 mois/4092 courses : elargir la
 * base a TOUTE Base tres solide (pas seulement l'ancre confirmee+classee
 * n1) et prendre 5 candidats par Value donne **61,2%** quand la base
 * finit deja Top3 (n=923, pour ~10 combinaisons) - legerement mieux, et
 * applicable a bien plus de courses (n=923 contre 423, la base n'ayant
 * plus besoin d'etre confirmee techniquement ET classee n1).
 *
 * @returns {{base:Object, partenaires:Array}|null}
 */
function trioValueAvecBase(bd, chevaux) {
  const numsTresSolides = new Set((bd?.bases || []).filter((b) => b.isTresSolide).map((b) => b.numero));
  if (numsTresSolides.size === 0) return null;
  const candidatsBase = (chevaux || [])
    .filter((c) => numsTresSolides.has(c.entry.numero))
    .sort((a, b) => a.classement - b.classement);
  const base = candidatsBase[0];
  if (!base) return null;
  const autres = (chevaux || []).filter((c) => c.entry.numero !== base.entry.numero);
  const partenaires = [...autres].sort((a, b) => a.value - b.value).slice(0, 5);
  if (partenaires.length === 0) return null;
  return { base, partenaires };
}

const TRIO_VALUE_STATS = '61,2% de reussite quand la base finit deja Top3 (n=923) - backtest 4 mois, 4092 courses';

// A la demande de l'utilisateur (adapter aussi le choix de la "base"),
// meme croisement confiance x confirmations que pour le Coupl&eacute;
// Value, mais applique a la reussite du Trio Value avec base (base deja
// Top3 -> les 2 autres vrais chevaux du Top3 sont-ils dans les 5
// partenaires Value ?). Contrairement au Coupl&eacute; Value, plusieurs
// cellules ont trop peu de courses pour un taux fiable (une base "deja
// Top3" est par nature plus frequente sur les courses a forte confiance) -
// affiche uniquement quand n >= 20 sur le backtest (5 mois, 5050 courses),
// sinon retombe sur le taux global (61,2%). Purement informatif, aucune
// abstention appliquee ici (donnees trop eparses pour trancher, contrairement
// au Coupl&eacute; Value).
const TRIO_ADAPTATIF_NIVEAUX = {
  'forte-forte': { taux: '73,0%', n: 500 },
  'forte-moyenne': { taux: '51,8%', n: 56 },
  'moyenne-forte': { taux: '55,8%', n: 371 },
  'moyenne-moyenne': { taux: '48,0%', n: 227 },
  'faible-moyenne': { taux: '38,7%', n: 31 }
};

// -------------------------------------------------------------------
// FOURCHETTE THEORIQUE DU RAPPORT (basse/haute) : a la demande de
// l'utilisateur, estimation rapide du rapport plausible pour chaque
// suggestion, a partir des cotes actuelles des candidats (avant course,
// donc purement indicatif - le rapport officiel depend des mises reelles
// du public, pas seulement des cotes) :
//  - Coupl&eacute; (2 chevaux) : (cote1 x cote2) / 2 - meme regle que le
//    "rapport estime" verifie sur le backtest (cf. HEBERGEMENT.md).
//    Fourchette basse = les 2 candidats aux cotes les plus BASSES du pool
//    (2 favoris), fourchette haute = les 2 candidats aux cotes les plus
//    HAUTES du pool (2 outsiders).
//  - Trio (base + 2 partenaires) : (produit des 3 cotes) / 10, regle
//    fournie par l'utilisateur (non re-verifiee sur un backtest de
//    rapports Trio reels, contrairement au Coupl&eacute; - aucune donnee
//    de rapport Trio officiel n'est recuperee par l'app). Fourchette
//    basse = base + les 2 partenaires aux cotes les plus basses,
//    fourchette haute = base + les 2 partenaires aux cotes les plus hautes.
// -------------------------------------------------------------------
function fourchetteRapportCouple(candidats) {
  const avecCote = (candidats || []).filter((c) => c.cotePourAffichage > 0);
  if (avecCote.length < 2) return null;
  const triees = [...avecCote].sort((a, b) => a.cotePourAffichage - b.cotePourAffichage);
  const n = triees.length;
  const basse = (triees[0].cotePourAffichage * triees[1].cotePourAffichage) / 2;
  const haute = (triees[n - 1].cotePourAffichage * triees[n - 2].cotePourAffichage) / 2;
  return { basse, haute };
}

function fourchetteRapportTrio(base, partenaires) {
  if (!(base?.cotePourAffichage > 0)) return null;
  const avecCote = (partenaires || []).filter((c) => c.cotePourAffichage > 0);
  if (avecCote.length < 2) return null;
  const triees = [...avecCote].sort((a, b) => a.cotePourAffichage - b.cotePourAffichage);
  const n = triees.length;
  const basse = (base.cotePourAffichage * triees[0].cotePourAffichage * triees[1].cotePourAffichage) / 10;
  const haute = (base.cotePourAffichage * triees[n - 1].cotePourAffichage * triees[n - 2].cotePourAffichage) / 10;
  return { basse, haute };
}

/**
 * @param {{basse:number, haute:number}} fourchette
 * @param {string} detail - texte de l'infobulle.
 * @param {number} [nbCombinaisons] - nombre de combinaisons jouees (= mise
 *   en euros, 1&euro;/combinaison). Si fourni et que la fourchette basse
 *   est INFERIEURE a ce nombre, la fourchette basse est affichee en rouge :
 *   meme dans le scenario le plus defavorable des 2 favoris qui gagnent,
 *   le rapport ne couvrirait pas la mise totale.
 */
function fourchetteRapportHtml(fourchette, detail, nbCombinaisons) {
  if (!fourchette) return '';
  const basseInsuffisante = nbCombinaisons != null && fourchette.basse < nbCombinaisons;
  const basseHtml = basseInsuffisante
    ? `<span class="tag-red bold">${fourchette.basse.toFixed(2)}&euro;</span>`
    : `${fourchette.basse.toFixed(2)}&euro;`;
  const detailComplet = basseInsuffisante
    ? `${detail} - fourchette basse en rouge : inferieure a la mise totale (${nbCombinaisons}&euro; sur ${nbCombinaisons} combinaison${nbCombinaisons > 1 ? 's' : ''} a 1&euro;), meme le scenario bas serait perdant`
    : detail;
  return `<p class="muted small" style="margin-top:2px;" title="${escapeHtml(detailComplet)}">Fourchette th&eacute;orique du rapport : ${basseHtml} &agrave; ${fourchette.haute.toFixed(2)}&euro;</p>`;
}

// -------------------------------------------------------------------
// TRANCHE PROBABLE (prediction statistique, historique) : a la demande de
// l'utilisateur ("peux-tu predire la tranche de rapport probable ?"),
// complete la fourchette theorique (mecanique, basee sur les cotes
// actuelles du pool affiche) par une prediction basee sur la distribution
// REELLE du rapport estime (backtest 5 mois, 5050 courses), conditionnee
// au meme profil confiance x confirmations que le pool adaptatif/les
// badges "Confiance renforcee"/"Base confirmee". P25 a P75 = tranche ou
// est tombee la moitie des rapports reels des courses de ce profil.
//
// Limite assumee : c'est une prediction de POPULATION (le profil de la
// course : score de configuration x confirmations Cotes cibles), pas des
// chevaux precis du jour - moins precise sur UNE course donnee que la
// fourchette theorique (qui, elle, regarde les cotes reelles du pool
// affiche), mais reflete la vraie variabilite/asymetrie des rapports
// observee en pratique (contrairement aux bornes min/max mecaniques de la
// fourchette theorique).
// -------------------------------------------------------------------
const TRANCHE_PROBABLE_COUPLE = {
  'forte-forte': { p25: 5.8, median: 12.0, p75: 31.0, n: 986 },
  'forte-moyenne': { p25: 5.9, median: 14.0, p75: 28.1, n: 101 },
  // Cellule non mesuree (n=0, cf. pool adaptatif) - repli sur la cellule
  // voisine "forte-moyenne".
  'forte-faible': { p25: 5.9, median: 14.0, p75: 28.1, n: 0 },
  'moyenne-forte': { p25: 8.1, median: 18.4, p75: 43.2, n: 1508 },
  'moyenne-moyenne': { p25: 10.4, median: 20.8, p75: 47.1, n: 819 },
  'moyenne-faible': { p25: 12.0, median: 18.8, p75: 29.7, n: 34 },
  'faible-forte': { p25: 14.4, median: 28.3, p75: 63.4, n: 489 },
  'faible-moyenne': { p25: 19.7, median: 37.4, p75: 76.2, n: 1010 },
  'faible-faible': { p25: 28.6, median: 43.1, p75: 79.5, n: 102 }
};

const TRANCHE_PROBABLE_TRIO = {
  'forte-forte': { p25: 9.1, median: 23.6, p75: 69.4, n: 986 },
  'forte-moyenne': { p25: 13.0, median: 29.8, p75: 96.7, n: 101 },
  'forte-faible': { p25: 13.0, median: 29.8, p75: 96.7, n: 0 },
  'moyenne-forte': { p25: 14.6, median: 36.8, p75: 109.1, n: 1508 },
  'moyenne-moyenne': { p25: 17.9, median: 41.8, p75: 134.6, n: 819 },
  'moyenne-faible': { p25: 21.0, median: 33.4, p75: 115.4, n: 34 },
  'faible-forte': { p25: 26.3, median: 61.1, p75: 158.0, n: 489 },
  'faible-moyenne': { p25: 40.4, median: 86.9, p75: 218.9, n: 1010 },
  'faible-faible': { p25: 42.4, median: 98.8, p75: 189.7, n: 102 }
};

/**
 * @param {Object} table - TRANCHE_PROBABLE_COUPLE ou TRANCHE_PROBABLE_TRIO.
 * @param {string} cle - cle de cellule ("confiance-confirmations", cf. bucketConfiance/bucketConfirmations).
 * @returns {string}
 */
function trancheProbableHtml(table, cle) {
  const t = table[cle];
  if (!t) return '';
  const titre = t.n > 0
    ? `50% des courses de ce profil (backtest 5 mois, n=${t.n}) ont eu un rapport reel entre ${t.p25.toFixed(1)}&euro; et ${t.p75.toFixed(1)}&euro;, mediane ${t.median.toFixed(1)}&euro; - prediction basee sur le profil confiance/confirmations de la course, pas sur les chevaux precis du jour`
    : `Cellule non mesuree sur le backtest (n=0, profil tres rare) - repli sur le profil voisin le plus proche`;
  return `<p class="muted small" style="margin-top:2px;" title="${escapeHtml(titre)}">Tranche probable (historique) : ${t.p25.toFixed(1)}&euro; &agrave; ${t.p75.toFixed(1)}&euro; (m&eacute;diane ${t.median.toFixed(1)}&euro;)</p>`;
}

// -------------------------------------------------------------------
// COMBINAISONS DANS LA TRANCHE PROBABLE : a la demande de l'utilisateur,
// affiche - pour le Coupl&eacute; Value uniquement - lesquelles des
// combinaisons du pool ont un rapport theorique ((cote1 x cote2)/2, meme
// regle que la fourchette theorique) qui tombe DANS la tranche probable
// [P25,P75] du profil de la course. Purement informatif : contrairement a
// une piste envisagee plus tot (filtrer/reduire les combinaisons jouees a
// celles-ci), la liste complete des candidats/combinaisons proposee reste
// INCHANGEE - ceci n'est qu'un surlignage visuel, sans effet sur la
// suggestion ni sur la mise.
// -------------------------------------------------------------------
/**
 * @param {Array} candidats - candidats du pool Coupl&eacute; Value affich&eacute; (deja tries Value croissante).
 * @param {{p25:number, p75:number}} tranche
 * @returns {Array<{a:{rang:number,numero:number}, b:{rang:number,numero:number}, rapport:number}>}
 *   `rang` = position dans le pool (1 = meilleure Value), pas le numero du cheval.
 */
function combosDansTrancheProbable(candidats, tranche) {
  if (!Array.isArray(candidats) || !tranche) return [];
  const avecCote = candidats
    .map((c, idx) => ({ c, rang: idx + 1 }))
    .filter((x) => x.c.cotePourAffichage > 0);
  const combos = [];
  for (let i = 0; i < avecCote.length; i++) {
    for (let j = i + 1; j < avecCote.length; j++) {
      const rapport = (avecCote[i].c.cotePourAffichage * avecCote[j].c.cotePourAffichage) / 2;
      if (rapport >= tranche.p25 && rapport <= tranche.p75) {
        combos.push({
          a: { rang: avecCote[i].rang, numero: avecCote[i].c.entry.numero },
          b: { rang: avecCote[j].rang, numero: avecCote[j].c.entry.numero },
          rapport
        });
      }
    }
  }
  return combos.sort((x, y) => (x.a.rang - y.a.rang) || (x.b.rang - y.b.rang));
}

/**
 * @param {Array} candidats - candidats du pool Coupl&eacute; Value affich&eacute;.
 * @param {Object} table - TRANCHE_PROBABLE_COUPLE.
 * @param {string} cle - cle de cellule (bucketConfiance-bucketConfirmations).
 * @returns {string}
 */
function combosDansTrancheHtml(candidats, table, cle) {
  const tranche = table[cle];
  if (!tranche) return '';
  const combos = combosDansTrancheProbable(candidats, tranche);
  const titre = 'Combinaison(s) du pool dont le rapport theorique ((cote1 x cote2)/2) tombe dans la tranche probable du profil (P25-P75, cf. Tranche probable ci-dessus), regroupees par cheval ancre (le mieux classe en Value des 2 de la paire) : "6/8-9" = le cheval N6 forme une combinaison dans la tranche avec le N8 et avec le N9 - purement informatif, n\'exclut aucune combinaison de la suggestion ni du calcul de la mise.';
  if (combos.length === 0) {
    return `<p class="muted small" style="margin-top:2px;" title="${escapeHtml(titre)}">Aucune combinaison du pool n'entre dans la tranche probable.</p>`;
  }
  // Regroupe par cheval "ancre" (le mieux classe en Value des 2 de la paire) ;
  // le rang ne sert qu'a l'ordre de tri/regroupement, l'affichage ne montre
  // que les numeros de chevaux (format demande par l'utilisateur : "6/8-9").
  const groupes = new Map();
  for (const c of combos) {
    if (!groupes.has(c.a.rang)) groupes.set(c.a.rang, { numero: c.a.numero, partenaires: [] });
    groupes.get(c.a.rang).partenaires.push(c.b);
  }
  const texte = [...groupes.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([, g]) => `${g.numero}/${g.partenaires.map((p) => p.numero).join('-')}`)
    .join(' ; ');
  return `<p class="small" style="margin-top:2px;" title="${escapeHtml(titre)}">Coupl&eacute;(s) dans la tranche probable : ${texte}</p>`;
}

/**
 * "Couple Value" : classe TOUT le champ par Value croissante (les
 * chevaux les plus joues par le marche en tete, sans se limiter au Top5
 * du classement) et retient les 5 premiers. Remplace "Couple Top5 x
 * Dangers" suite a un constat fait sur le backtest reel (voir
 * HEBERGEMENT.md) : le classement du moteur trie d'abord
 * par signe de la Value, PUIS par ProbVictoire+ProbTop3 - ce qui peut
 * sous-classer, hors du Top5, un cheval tres joue par le marche (Value
 * tres negative) mais juge moins probable par le modele. Trier
 * directement par Value evite cette perte.
 *
 * Constat chiffre (reconfirme sur 4 mois, 4092 courses) : classer par
 * Value sur tout le champ fait mieux que le Top5 classement, a cout EGAL
 * (10 combinaisons) : 57,3% de reussite (les 2 vrais chevaux du Top2)
 * contre 53,5%. Et malgre l'abandon du critere Danger explicite, rien
 * n'est perdu de ce concept : ce Top5 par Value capture deja
 * naturellement 93,3% des vrais Danger(s) de la course - les deux
 * criteres reposant sur la meme logique de Value negative.
 *
 * @param {Array} chevaux - result.chevaux (avec .value calcule par le moteur).
 * @returns {{candidats:Array}|null}
 */
function coupleValue(chevaux, n = 5) {
  const candidats = [...(chevaux || [])].sort((a, b) => a.value - b.value).slice(0, n);
  if (candidats.length < 2) return null;
  return { candidats };
}

const COUPLE_VALUE_STATS = '57,3% de reussite (les 2 chevaux) pour 10 combinaisons, contre 53,5% pour le Top5 classement a cout egal - capture aussi 93,3% des vrais Danger(s) de la course - backtest 4 mois, 4092 courses';

// -------------------------------------------------------------------
// TRIO VALUE dans Course feu vert/Resultat : a la demande de l'utilisateur,
// remplace le Coupl&eacute; Value comme pari suivi sur ces 2 pages (le
// Coupl&eacute; Value reste inchang&eacute; sur la fiche course elle-meme,
// carte "Coupl&eacute; Value"). Reprend la m&ecirc;me suggestion que la
// carte "Trio Value (avec base)" de la fiche course (trioValueAvecBase :
// Base tres solide + 5 partenaires Value = 10 combinaisons possibles), et
// les rapports officiels PMU du pari TRIO (au lieu de COUPLE_GAGNANT).
// -------------------------------------------------------------------

// Regle PMU standard pour le nombre de places payees au pari Simple Place :
// aucune (moins de 4 partants, marche non propose), 2 places (4 a 7
// partants), 3 places (8 partants et plus).
function nombrePlacesPayees(nbPartants) {
  if (!(nbPartants > 0) || nbPartants < 4) return 0;
  return nbPartants >= 8 ? 3 : 2;
}

/**
 * *** Remplace trioValueReussi *** (a la demande de l'utilisateur : "il
 * faut modifier aussi la reussite du jour sur la page Course feu vert et
 * ne considerer que la base") : la reussite ne porte plus sur le Trio
 * (base + 2 partenaires) mais sur la Base SEULE, au sens Simple Gagnant OU
 * Simple Place (choix explicite de l'utilisateur).
 * @param {Object} bd - resultat de calculerBasesEtDangers.
 * @param {Array} chevaux - result.chevaux.
 * @param {number[]} ordreArrivee - ordre d'arrivee (CSVImporter.parseOrdreArrivee).
 * @param {number} nbPartants
 * @returns {{reussi:boolean, victoire:boolean, place:boolean, top3:number[], base:Object}|null}
 *   null si l'arrivee est inconnue/incomplete ou si aucune suggestion n'existe
 *   (pas de Base tres solide).
 */
function baseReussie(bd, chevaux, ordreArrivee, nbPartants) {
  if (!ordreArrivee || ordreArrivee.length < 3) return null;
  const suggestion = trioValueAvecBase(bd, chevaux);
  if (!suggestion) return null;
  const { base } = suggestion;
  const victoire = base.entry.numero === ordreArrivee[0];
  const nbPlaces = nombrePlacesPayees(nbPartants);
  const place = nbPlaces > 0 && ordreArrivee.slice(0, nbPlaces).includes(base.entry.numero);
  return { reussi: victoire || place, victoire, place, top3: ordreArrivee.slice(0, 3), base };
}

// Mise unitaire (page Resultat) : 1&euro; par pari, choix de l'utilisateur.
const MISE_PAR_COMBINAISON_FEU_VERT = 1;

/**
 * *** Remplace bilanTrioValue *** : bilan financier (hypothetique) Simple
 * Gagnant + Simple Place pour la Base SEULE (1&euro; sur chacun des 2
 * paris - 1&euro; seulement si le marche Place n'existe pas, moins de 4
 * partants). *** Modifie *** (a la demande de l'utilisateur : "afficher la
 * reussite et le rendement en Gagnant et en Place separement") : renvoie
 * desormais 2 bilans distincts (gagnant/place) au lieu d'un seul bilan
 * fusionne, pour ne plus melanger les 2 paris dans un seul chiffre.
 * @param {Object} base - la Base (result.chevaux, avec .entry.numero).
 * @param {number} nbPartants
 * @param {Array<{numero:number, dividende:number}>} rapportsGagnant - voir
 *   extraireRapportsSimpleGagnant (js/engine/pmuApi.js).
 * @param {Array<{numero:number, dividende:number}>} rapportsPlace - voir
 *   extraireRapportsSimplePlace (js/engine/pmuApi.js).
 * @returns {{gagnant:{mise:number,gain:number,net:number}, place:{mise:number,gain:number,net:number}}}
 */
function bilanSimpleBase(base, nbPartants, rapportsGagnant, rapportsPlace) {
  const miseGagnant = MISE_PAR_COMBINAISON_FEU_VERT;
  const misePlace = nombrePlacesPayees(nbPartants) > 0 ? MISE_PAR_COMBINAISON_FEU_VERT : 0;
  const gagnantTrouve = (rapportsGagnant || []).find((r) => r.numero === base.entry.numero);
  const placeTrouve = (rapportsPlace || []).find((r) => r.numero === base.entry.numero);
  const gainGagnant = gagnantTrouve ? gagnantTrouve.dividende * miseGagnant : 0;
  const gainPlace = (placeTrouve && misePlace > 0) ? placeTrouve.dividende * misePlace : 0;
  return {
    gagnant: { mise: miseGagnant, gain: gainGagnant, net: gainGagnant - miseGagnant },
    place: { mise: misePlace, gain: gainPlace, net: gainPlace - misePlace }
  };
}

/**
 * *** Nouveau *** (a la demande de l'utilisateur : "mettre la base a la
 * place du trio [sur Course feu vert] et recuperer le rapport simple
 * gagnant et/ou place") : affiche le rapport officiel PMU Simple
 * Gagnant/Place pour LE numero de la Base uniquement (contrairement au
 * Trio, un Simple ne concerne qu'un seul cheval - pas de combinaison).
 * Un Simple Gagnant n'a de rapport que si la Base a fini 1ere ; un Simple
 * Place n'a de rapport que si elle a fini dans les places payantes (2 ou 3
 * premieres selon le nombre de partants) - d'ou les 2 tableaux distincts.
 * Chaine vide si aucun des deux rapports n'est encore connu (course pas
 * terminee, rapport pas encore demande, ou la Base n'a fini ni 1ere ni
 * placee).
 * @param {Array<{numero:number, dividende:number}>|undefined} rapportsGagnant
 * @param {Array<{numero:number, dividende:number}>|undefined} rapportsPlace
 * @param {number} numeroBase
 * @returns {string}
 */
function rapportSimpleHtml(rapportsGagnant, rapportsPlace, numeroBase) {
  const gagnant = Array.isArray(rapportsGagnant) ? rapportsGagnant.find((r) => r.numero === numeroBase) : null;
  const place = Array.isArray(rapportsPlace) ? rapportsPlace.find((r) => r.numero === numeroBase) : null;
  if (!gagnant && !place) return '';
  const parts = [];
  if (gagnant) parts.push(`Gagnant ${gagnant.dividende.toFixed(2)}&euro;`);
  if (place) parts.push(`Place ${place.dividende.toFixed(2)}&euro;`);
  return `<span class="small tag-green bold" title="Rapport officiel PMU pour 1&euro; mise (Simple Gagnant / Simple Place), pour le numero de la Base uniquement">Rapport officiel : ${parts.join(' / ')}</span>`;
}

/**
 * "Score de configuration" du Coupl&eacute; Value (0 a 5) : a la demande de
 * l'utilisateur ("trouver une configuration de course qui donne un signal
 * positif"), 5 indicateurs connus AVANT le resultat (donc utilisables pour
 * decider si suivre la suggestion, contrairement a des criteres bases sur
 * les vrais gagnants) sont combines en un score simple :
 *
 *  1. Champ reduit : nbPartants <= 10.
 *  2. Coupure nette : ecart de Value >= 20 points entre le 5e candidat
 *     retenu et le 1er cheval exclu (le modele "hesite" moins).
 *  3. Une Base tres solide existe dans la course.
 *  4. Marche resserre : cote du favori (la plus petite cote du champ) < 3.
 *  5. Plusieurs pretendants credibles : au moins 2 chevaux a cote < 5
 *     (contre-intuitif mais verifie : un marche avec PLUSIEURS favoris
 *     credibles est mieux capture par le tri Value qu'un marche avec un
 *     seul favori isole).
 *
 * Verifie sur le backtest reel (4 mois, 4092 courses) : chaque indicateur
 * en plus fait monter la reussite de facon quasi lineaire, de 32,9%
 * (score 0, n=559) a 83,3% (score 5, n=215) - et ce gradient tient meme en
 * isolant les indicateurs 2 a 5 a l'interieur des seuls petits champs OU
 * des seuls grands champs separement (52%->83% et 33%->63% respectivement) :
 * ce ne sont pas 5 variantes du meme signal (nombre de partants), chacune
 * apporte une information reellement independante.
 *
 * @param {Object} bd - resultat de calculerBasesEtDangers (pour la Base tres solide).
 * @param {Array} chevaux - result.chevaux.
 * @returns {number} score de 0 a 5.
 */
function scoreConfigurationCoupleValue(bd, chevaux) {
  let score = 0;
  const champ = chevaux || [];
  if (champ.length > 0 && champ.length <= 10) score++;

  const parValue = [...champ].sort((a, b) => a.value - b.value);
  const value5 = parValue[4] ? parValue[4].value : null;
  const value6 = parValue[5] ? parValue[5].value : null;
  if (value5 != null && value6 != null && (value6 - value5) >= 20) score++;

  if ((bd?.bases || []).some((b) => b.isTresSolide)) score++;

  const avecCote = champ.filter((c) => c.cotePourAffichage != null && c.cotePourAffichage > 0);
  if (avecCote.length > 0) {
    const coteFavori = Math.min(...avecCote.map((c) => c.cotePourAffichage));
    if (coteFavori < 3) score++;
    const nbSous5 = avecCote.filter((c) => c.cotePourAffichage < 5).length;
    if (nbSous5 >= 2) score++;
  }

  return score;
}

const SCORE_CONFIGURATION_NIVEAUX = {
  0: { label: 'Confiance tres faible', cls: 'tag-red', taux: '32,9%', n: 559 },
  1: { label: 'Confiance faible', cls: 'tag-orange', taux: '49,9%', n: 792 },
  2: { label: 'Confiance moyenne', cls: 'tag-orange', taux: '55,7%', n: 984 },
  3: { label: 'Confiance correcte', cls: 'tag-blue', taux: '63,8%', n: 881 },
  4: { label: 'Confiance elevee', cls: 'tag-green', taux: '72,4%', n: 642 },
  5: { label: 'Confiance tres elevee', cls: 'tag-green', taux: '83,3%', n: 215 }
};

// -------------------------------------------------------------------
// CROISEMENT COUPLE VALUE / COTES CIBLES : indicateur independant, base sur
// un calcul different (proximite a une cote "cible" classique du turf -
// NP/4, NP/2, NP, NPx2 - plutot que sur la Value), releve lesquels des 4
// cotes cibles designent un cheval qui fait AUSSI partie des 5 candidats du
// Coupl&eacute; Value. A la demande de l'utilisateur, verifie sur le
// backtest (5 mois, 5050 courses) : la reussite du Coupl&eacute; Value
// grimpe avec le nombre de ces confirmations (gradient quasi lineaire,
// aussi net que celui du score de configuration). Purement indicatif et
// affiche separement, avec les numeros des chevaux concernes (a la demande
// de l'utilisateur) : n'entre dans aucun calcul de Score Global/Value/
// score de configuration/classement (le filtre de Course feu vert/Resultat
// reste inchange).
// -------------------------------------------------------------------
function confirmationsCotesCibles(candidats, cotesCibles) {
  if (!Array.isArray(candidats) || !Array.isArray(cotesCibles)) return [];
  const numsCandidats = new Set(candidats.map((c) => c.entry.numero));
  const numsCote = new Set(cotesCibles.filter((cc) => cc.horse).map((cc) => cc.horse.numero));
  const communs = [];
  for (const num of numsCote) {
    if (numsCandidats.has(num)) communs.push(num);
  }
  return communs.sort((a, b) => a - b);
}

const CONFIRMATION_COTES_CIBLES_NIVEAUX = {
  0: { label: 'Cotes cibles : aucune confirmation', cls: 'tag-gray', taux: null, n: 1 },
  1: { label: 'Cotes cibles : 1 confirmation', cls: 'tag-red', taux: '32,6%', n: 135 },
  2: { label: 'Cotes cibles : 2 confirmations', cls: 'tag-orange', taux: '48,3%', n: 1930 },
  3: { label: 'Cotes cibles : 3 confirmations', cls: 'tag-blue', taux: '61,3%', n: 2382 },
  4: { label: 'Cotes cibles : 4 confirmations', cls: 'tag-green', taux: '75,2%', n: 602 }
};

function confirmationCotesCiblesHtml(numerosConfirmes) {
  if (numerosConfirmes == null) return '';
  const nbConfirm = numerosConfirmes.length;
  const niveau = CONFIRMATION_COTES_CIBLES_NIVEAUX[nbConfirm] || CONFIRMATION_COTES_CIBLES_NIVEAUX[0];
  const titre = niveau.taux
    ? `Reussite du Coupl&eacute; Value mesuree ${niveau.taux} sur le backtest (n=${niveau.n}, 5 mois, 5050 courses) quand ${nbConfirm} des 4 cotes cibles (NP/4, NP/2, NP, NPx2) designe(nt) un cheval deja present parmi les 5 candidats Value`
    : `Cas tres rare sur le backtest (n=${niveau.n} sur 5050 courses) - quasiment aucune donnee pour estimer un taux fiable`;
  const suffixeNumeros = nbConfirm > 0 ? ` (${numerosConfirmes.map((n) => `N&deg;${n}`).join(', ')})` : '';
  return `<span class="small ${niveau.cls} bold" title="${escapeHtml(titre)}">${escapeHtml(niveau.label)}${suffixeNumeros}</span>`;
}

// A la demande de l'utilisateur, croisement du score de configuration (la
// "confiance") avec les confirmations Cotes cibles, verifie sur le
// backtest (5 mois, 5050 courses) - 2 signaux combines retenus car mesures
// sur un echantillon large (contrairement a la grille complete 6x5, dont
// beaucoup de cases ont un n trop petit pour etre fiables) :
//  1. Coupl&eacute; Value : "Confiance renforc&eacute;e" quand le score de
//     configuration est >= 4/5 ET qu'au moins 3 des 5 candidats sont aussi
//     confirmes par une cote cible - 75,6% de reussite (n=986), au-dessus
//     du score seul (72,4% a 83,3%) et des confirmations seules (61,3% a
//     75,2%).
//  2. Trio Value avec base : "Base confirm&eacute;e" quand la base
//     elle-meme (pas les partenaires) est designee par une cote cible -
//     64,2% de reussite (n=1005) contre 41,5% (n=205) sinon, ecart net et
//     bien mesure sur un critere binaire simple.
const SEUIL_SCORE_CONFIANCE_RENFORCEE = 4;
const SEUIL_CONFIRM_CONFIANCE_RENFORCEE = 3;

function confianceRenforceeHtml(score, numerosConfirmes) {
  const nbConfirm = Array.isArray(numerosConfirmes) ? numerosConfirmes.length : 0;
  if (score < SEUIL_SCORE_CONFIANCE_RENFORCEE || nbConfirm < SEUIL_CONFIRM_CONFIANCE_RENFORCEE) return '';
  const titre = 'Reussite du Coupl&eacute; Value mesuree 75,6% (n=986) quand le score de configuration est >= 4/5 ET qu\'au moins 3 des 5 candidats sont aussi confirmes par une cote cible - backtest 5 mois, 5050 courses';
  return `<span class="small tag-green bold" title="${escapeHtml(titre)}">Confiance renforc&eacute;e</span>`;
}

function baseConfirmeeCotesCiblesHtml(base, cotesCibles) {
  if (!base || !Array.isArray(cotesCibles)) return '';
  const numsCote = new Set(cotesCibles.filter((cc) => cc.horse).map((cc) => cc.horse.numero));
  if (!numsCote.has(base.entry.numero)) return '';
  const titre = 'Reussite du Trio Value avec base mesuree 64,2% (n=1005) quand la base est aussi designee par une cote cible, contre 41,5% (n=205) sinon - backtest 5 mois, 5050 courses';
  return `<span class="small tag-green bold" title="${escapeHtml(titre)}">Base confirm&eacute;e (cote cible)</span>`;
}

// -------------------------------------------------------------------
// CONFIRMATION EXTERNE : a la demande de l'utilisateur, croise la Base avec
// un fichier de predictions d'un service TIERS ("Predictions_JJMMAAAA_HHMM",
// importe a part - onglet Importer). Purement indicatif, affiche uniquement
// si l'utilisateur a importe ce fichier pour le bon jour/hippodrome/course -
// n'entre dans aucun calcul de Score Global/Value/classement.
//
// Backtest juillet 2026 (31 fichiers, 958 courses matchees date+hippodrome+
// course, 662 avec une Base identifiee par le moteur) - reussite reelle de
// la Base selon le niveau de citation par le fichier externe :
//   Base citee cotee ET non cotee (double)      : 36,8% victoire (n=340)
//   Base citee dans un seul des 2 groupes        : 30,1% victoire (n=249)
//   Base non citee du tout                       : 16,4% victoire (n=73)
// Reference (Base seule, sans info externe, meme periode) : 30,9% (n=753).
// -------------------------------------------------------------------
const CONFIRMATION_EXTERNE_NIVEAUX = {
  double: { label: 'Confirmation externe double', cls: 'tag-green', taux: '36,8%', n: 340 },
  simple: { label: 'Confirmation externe', cls: 'tag-blue', taux: '30,1%', n: 249 },
  absente: { label: 'Non confirmée (fichier externe)', cls: 'tag-orange', taux: '16,4%', n: 73 }
};

/**
 * @param {Object} base - suggestion.base (cf. trioValueAvecBase), avec base.entry.numero.
 * @param {Object|null|undefined} predictionExterne - retour de DB.getPredictionExterne pour cette course (undefined si aucun fichier importe pour ce jour/hippodrome/course).
 * @returns {string}
 */
function confirmationExterneHtml(base, predictionExterne) {
  if (!base || !predictionExterne) return '';
  const niveau = niveauConfirmationExterne(base.entry.numero, predictionExterne);
  if (!niveau) return '';
  const info = CONFIRMATION_EXTERNE_NIVEAUX[niveau];
  const titre = `Reussite reelle de la Base mesuree ${info.taux} (n=${info.n}) quand elle est dans ce cas de figure - contre 30,9% de reussite moyenne de la Base (n=753) - backtest juillet 2026, 958 courses matchees avec le fichier externe. Fichier tiers, hors moteur de l'appli.`;
  return `<span class="small ${info.cls} bold" title="${escapeHtml(titre)}">${escapeHtml(info.label)}</span>`;
}

// -------------------------------------------------------------------
// POOL ADAPTATIF DU COUPLE VALUE : a la demande de l'utilisateur ("adapter
// le choix des chevaux en fonction de l'indice de confiance et de la
// confirmation cotes cibles"), la taille du pool de candidats (Top-N Value,
// N*(N-1)/2 combinaisons) n'est plus fixee a 5 pour toutes les courses.
//
// Le backtest (5 mois, 5050 courses) croisant le score de configuration
// (confiance, 0-5) et le nombre de confirmations Cotes cibles (0-4, mesure
// sur les 5 premiers candidats Value) montre que plus ces 2 indicateurs
// sont hauts, plus l'arrivee (les 2 vrais chevaux du Top2) se concentre
// dans un petit pool Value - et inversement, un pool plus large est
// necessaire pour la capturer quand la confiance et/ou les confirmations
// sont faibles, au prix de davantage de combinaisons (donc de mise).
//
// 8 cellules mesurees (bucket confiance x bucket confirmations), avec le N
// qui maximise la capture des 2 vrais chevaux pour un cout raisonnable en
// combinaisons - voir HEBERGEMENT.md pour le detail complet de la grille.
// -------------------------------------------------------------------
function bucketConfiance(score) {
  return score <= 1 ? 'faible' : score <= 3 ? 'moyenne' : 'forte';
}
function bucketConfirmations(nbConfirm) {
  return nbConfirm <= 1 ? 'faible' : nbConfirm === 2 ? 'moyenne' : 'forte';
}

const POOL_ADAPTATIF_NIVEAUX = {
  'forte-forte': { n: 5, taux: '75,6%', nCourses: 986, label: 'Confiance forte + confirmations fortes' },
  'forte-moyenne': { n: 6, taux: '77,2%', nCourses: 101, label: 'Confiance forte + confirmations moyennes' },
  // Cellule quasi inexistante en pratique (n=0 sur le backtest : un score
  // de configuration eleve implique presque toujours au moins 2
  // confirmations) - repli prudent sur la cellule voisine "forte-moyenne".
  'forte-faible': { n: 6, taux: '77,2% (repli sur la cellule voisine, non mesuree : n=0)', nCourses: 0, label: 'Confiance forte + confirmations faibles' },
  'moyenne-forte': { n: 6, taux: '73,2%', nCourses: 1509, label: 'Confiance moyenne + confirmations fortes' },
  'moyenne-moyenne': { n: 7, taux: '77,3%', nCourses: 819, label: 'Confiance moyenne + confirmations moyennes' },
  'moyenne-faible': { n: 6, taux: '70,6%', nCourses: 34, label: 'Confiance moyenne + confirmations faibles' },
  'faible-forte': { n: 7, taux: '68,3%', nCourses: 489, label: 'Confiance faible + confirmations fortes' },
  'faible-moyenne': { n: 8, taux: '70,6%', nCourses: 1010, label: 'Confiance faible + confirmations moyennes' },
  // Cellule la plus defavorable : meme un pool de 8 chevaux ne capture les
  // 2 vrais chevaux que 62,7% du temps (n=102) - aucun N raisonnable ne
  // rattrape ce profil, abstention recommandee (n:null).
  'faible-faible': { n: null, taux: '62,7% au mieux (N=8), aucun N raisonnable ne suffit', nCourses: 102, label: 'Confiance faible + confirmations faibles' }
};

/**
 * @param {number} score - score de configuration (0-5).
 * @param {number} nbConfirmations - nb de confirmations Cotes cibles (0-4).
 * @returns {{n:number|null, taux:string, nCourses:number, label:string, cle:string}}
 */
function poolAdaptatifCoupleValue(score, nbConfirmations) {
  const cle = `${bucketConfiance(score)}-${bucketConfirmations(nbConfirmations)}`;
  return { cle, ...POOL_ADAPTATIF_NIVEAUX[cle] };
}

// *** Signal "jeu conseille" (aout 2026, mis a jour sur 8 mois d'archives) ***
// : a la demande de l'utilisateur, suite au tableau ROI reel par profil
// confiance x confirmations, 3 profils s'etaient demarques comme rentables.
// Chiffres actualises sur 8 mois d'archives (janvier a 11 aout 2026, 223
// jours, echantillon de rapports reels elargi a ~140 dividendes contre ~90
// precedemment) :
//   - faible-moyenne : -0.5% de ROI (n=890 courses, largement le plus gros
//     volume des 3 - le ROI est desormais legerement negatif, alors qu'il
//     etait de +18% sur 3 mois et +61% sur 2 mois)
//   - forte-moyenne  : +17% de ROI (n=152 courses - reste positif mais
//     continue de baisser : +75% sur 2 mois, +39% sur 3 mois, +17% sur 8 mois)
//   - moyenne-faible : +4% de ROI (n=41 courses - toujours l'echantillon le
//     plus reduit des 3 ; +61%->+22%->+4% sur 2/3/8 mois)
// *** ROI pondere des 3 profils : ~+1% (quasi nul) ***. La tendance est
// desormais tres claire : plus l'echantillon de rapports reels grandit, plus
// le ROI se rapproche de zero (voire negatif pour le profil le plus gros).
// Les chiffres a 2 et 3 mois etaient optimistes par bruit d'echantillonnage
// (dividendes Couplé tres asymetriques - quelques gros rapports dominaient
// la moyenne). Ce signal n'est donc plus clairement rentable ; il est
// conserve a titre indicatif/exploratoire uniquement - voir HEBERGEMENT.md.
const PROFILS_RENTABLES_COUPLE_VALUE = new Set(['faible-moyenne', 'forte-moyenne', 'moyenne-faible']);

function jeuConseilleHtml(cle) {
  if (!PROFILS_RENTABLES_COUPLE_VALUE.has(cle)) return '';
  const detail = 'Profil identifie comme potentiellement rentable sur un echantillonnage initial de rapports PMU reels, mais le ROI pondere des 3 profils est retombe a environ +1% (quasi nul) sur un echantillon elargi couvrant 8 mois d\'archives - resultat desormais exploratoire uniquement, prudence recommandee. Voir HEBERGEMENT.md';
  return `<p class="small tag-green bold" style="margin:4px 0;" title="${escapeHtml(detail)}">&#9733; Jeu conseill&eacute; (profil identifi&eacute; - signal affaibli, voir HEBERGEMENT.md)</p>`;
}

function coupleValueHtml(bd, chevaux, cotesCibles) {
  const base5 = coupleValue(chevaux, 5);
  if (!base5) return '';
  const score = scoreConfigurationCoupleValue(bd, chevaux);
  const niveau = SCORE_CONFIGURATION_NIVEAUX[score];
  const numerosConfirmes = confirmationsCotesCibles(base5.candidats, cotesCibles);
  const pool = poolAdaptatifCoupleValue(score, numerosConfirmes.length);
  const enTeteBadges = `<span class="small ${niveau.cls} bold" title="Score de configuration ${score}/5 - reussite mesuree ${niveau.taux} sur le backtest (n=${niveau.n}, 4 mois, 4092 courses)">${escapeHtml(niveau.label)} (${score}/5)</span>
          ${confirmationCotesCiblesHtml(numerosConfirmes)}`;

  if (pool.n == null) {
    const titreAbstention = `Profil ${pool.label} : capture des 2 vrais chevaux mesuree ${pool.taux} (n=${pool.nCourses}) - backtest 5 mois, 5050 courses. Aucun pool de taille raisonnable ne rattrape ce profil.`;
    return `<div class="card" style="margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
        <p class="bold" style="margin:0;">Coupl&eacute; Value</p>
        <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">${enTeteBadges}</div>
      </div>
      <p class="small tag-red bold" style="margin:6px 0 0;" title="${escapeHtml(titreAbstention)}">Profil confiance/confirmations trop faible : pas de suggestion Coupl&eacute; Value fiable sur cette course</p>
      ${trancheProbableHtml(TRANCHE_PROBABLE_COUPLE, pool.cle)}
    </div>`;
  }

  const suggestion = pool.n === 5 ? base5 : coupleValue(chevaux, pool.n);
  const { candidats } = suggestion;
  const combos = (candidats.length * (candidats.length - 1)) / 2;
  const titrePool = `Pool adapte au profil ${pool.label} : capture des 2 vrais chevaux mesuree ${pool.taux} (n=${pool.nCourses}) - backtest 5 mois, 5050 courses`;
  const fourchette = fourchetteRapportCouple(candidats);
  const detailFourchette = 'Les 2 cotes les plus basses du pool (fourchette basse, 2 favoris) / les 2 cotes les plus hautes du pool (fourchette haute, 2 outsiders), regle (cote1 x cote2)/2 - meme formule que le rapport estime verifie sur le backtest. Approximation avant course, ne remplace pas le rapport officiel';
  return `<div class="card" style="margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
        <p class="bold" style="margin:0;">Coupl&eacute; Value</p>
        <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
          ${enTeteBadges}
          ${confianceRenforceeHtml(score, numerosConfirmes)}
        </div>
      </div>
      ${jeuConseilleHtml(pool.cle)}
      <p class="small" style="margin:4px 0;" title="${escapeHtml(titrePool)}">${candidats.length} candidat(s) (Value croissante, tout le champ, pool adapt&eacute; au profil) : ${candidats.map((c) => `N&deg;${c.entry.numero}`).join(' - ')} (${combos} combinaison${combos > 1 ? 's' : ''} possible${combos > 1 ? 's' : ''})</p>
      <p class="muted small" style="margin-top:4px;">${escapeHtml(COUPLE_VALUE_STATS)}. Pool adapt&eacute; : ${pool.n} candidats pour ce profil (capture mesur&eacute;e ${pool.taux}, n=${pool.nCourses}). Indicatif, n'entre dans aucun calcul de Score Global/Value/classement.</p>
      ${fourchetteRapportHtml(fourchette, detailFourchette, combos)}
      ${trancheProbableHtml(TRANCHE_PROBABLE_COUPLE, pool.cle)}
      ${combosDansTrancheHtml(candidats, TRANCHE_PROBABLE_COUPLE, pool.cle)}
    </div>`;
}

/**
 * Conseil de jeu global de la course : cascade a 3 niveaux, validee sur le
 * backtest reel (4 mois, 4092 courses, voir HEBERGEMENT.md), en reponse a
 * la question "que jouer sur cette course, si quelque chose ?" :
 *
 *  0. *** Garde-fou ajoute a la demande de l'utilisateur *** : si le score
 *     de configuration du Coupl&eacute; Value (cf. `scoreConfigurationCoupleValue`
 *     ci-dessus) est < 3/5, on s'abstient directement, AVANT meme de
 *     regarder si une ancre ou une Base tres solide existe. Justifie par
 *     le meme backtest : en dessous de 3/5, la reussite du Coupl&eacute;
 *     Value tombe a 48,3% (n=2335) contre 69,4% au-dessus (n=1738) - un
 *     contexte de marche trop flou pour recommander de jouer, quel que
 *     soit par ailleurs le niveau de la Base.
 *  1. Sinon, l'ancre existe (`chevalConfianceMaximale` : Base tres solide
 *     confirmee, classee n1) -> jouer Coupl&eacute; Value (cf. carte
 *     ci-dessous). *** Modifie aout 2026 *** : le Trio a ete retire de
 *     cette recommandation suite a un backtest sur rapports PMU REELS
 *     (juillet 2026, 446 courses "Base tres solide") qui a mesure un ROI
 *     negatif (-38%, mise 4436e / gain 2767e) pour "Trio Value avec base",
 *     contre +22% de ROI pour "Coupl&eacute; Value" (pool adaptatif, 940
 *     courses, mise 16525e / gain 20204e) sur la meme periode. Le Trio
 *     reste affiche plus bas a titre informatif (carte "Trio Value avec
 *     base"), mais n'est plus recommande ici.
 *  2. Sinon, une Base tres solide existe encore quelque part dans la
 *     course (confirmee a un autre rang, ou non confirmee techniquement) -
 *     jouer Simple gagnant/place sur la mieux classee d'entre elles. 40,7%
 *     de victoires / 69,5% de Top3 (n=486) - au moins aussi bon que le
 *     niveau 1, donc pleinement justifie comme repli.
 *  3. Sinon (aucune Base tres solide sur la course) -> s'abstenir. Verifie
 *     sur le backtest : le simple favori du modele tombe alors a
 *     20,7%/49,1% (n=2739), et meme une "Base solide" confirmee (le cran
 *     en dessous) ne rattrape rien (18,0% de victoires sur n=395) : pas
 *     d'edge recuperable en dessous du seuil "tres solide", l'abstention
 *     est donc le choix statistiquement justifie, pas juste une prudence
 *     par defaut.
 *
 * @returns {{type:'couple', pick:Object, scoreConfig:number}|{type:'simple', pick:Object, scoreConfig:number}|{type:'abstention', raison:'config'|'sans_base', scoreConfig:number}}
 */
function conseilJeu(bd, chevaux) {
  const scoreConfig = scoreConfigurationCoupleValue(bd, chevaux);
  if (scoreConfig < 3) return { type: 'abstention', raison: 'config', scoreConfig };

  const ancre = chevalConfianceMaximale(bd, chevaux);
  if (ancre) return { type: 'couple', pick: ancre, scoreConfig };

  const numsTresSolides = new Set((bd?.bases || []).filter((b) => b.isTresSolide).map((b) => b.numero));
  if (numsTresSolides.size > 0) {
    const candidats = (chevaux || [])
      .filter((c) => numsTresSolides.has(c.entry.numero))
      .sort((a, b) => a.classement - b.classement);
    if (candidats.length > 0) return { type: 'simple', pick: candidats[0], scoreConfig };
  }

  return { type: 'abstention', raison: 'sans_base', scoreConfig };
}

const CONSEIL_JEU_STATS = {
  couple: 'Coupl&eacute; Value : +22% de ROI mesure sur rapports PMU reels (juillet 2026, 940 courses, mise 16525e / gain 20204e). Le Trio a ete retire de cette recommandation (-38% de ROI mesure sur la meme periode, 446 courses) - voir HEBERGEMENT.md',
  simple: '40,7% de victoires, 69,5% de Top3 pour ce type de pick (n=486) - backtest 4 mois, 4092 courses',
  abstention_sans_base: 'Sans Base tres solide, le favori du modele tombe a 20,7%/49,1% (n=2739), et une simple Base solide ne rattrape rien (18,0% de victoires, n=395) - backtest 4 mois, 4092 courses',
  abstention_config: 'Score de configuration du Couplé Value < 3/5 : reussite mesuree 48,3% (n=2335) contre 69,4% quand le score est >= 3/5 (n=1738) - backtest 4 mois, 4092 courses. Contexte de marche trop flou (partants, coupure Value, cote du favori...) pour recommander de jouer, meme si une Base existe'
};

function conseilJeuHtml(bd, chevaux) {
  const conseil = conseilJeu(bd, chevaux);
  let titre, cls, statsKey;
  if (conseil.type === 'couple') {
    titre = 'Jouer : Coupl&eacute; Value (voir carte ci-dessous)';
    cls = 'tag-green';
    statsKey = 'couple';
  } else if (conseil.type === 'simple') {
    titre = `Jouer : Simple gagnant/place sur N&deg;${conseil.pick.entry.numero}`;
    cls = 'tag-green';
    statsKey = 'simple';
  } else {
    titre = 'Course difficile';
    cls = 'tag-red';
    statsKey = conseil.raison === 'config' ? 'abstention_config' : 'abstention_sans_base';
  }
  return `<div class="card" style="margin-bottom:10px; border: 2px solid var(--border);">
      <p class="bold" style="margin:0 0 4px;">Conseil de jeu</p>
      <p class="small ${cls} bold" style="margin:0 0 4px;">${titre}</p>
      <p class="muted small" style="margin-top:4px;">${escapeHtml(CONSEIL_JEU_STATS[statsKey])}. Indicatif, n'entre dans aucun calcul de Score Global/Value/classement.</p>
    </div>`;
}

/**
 * Carte "Jeu Simple Gagnant" (voir js/engine/jeuSimpleGagnant.js pour le
 * detail de la methode). Affichee dans le prolongement du "Conseil de jeu"
 * ci-dessus, mais independante de sa cascade (ancre/Base tres solide).
 *
 * *** v10 (aout 2026, a la demande de l'utilisateur) *** : ne retient plus
 * QUE le rang 1 du classement Score Global, selon 2 sources de cote
 * possibles (meme seuil de cote > 3,8 dans les deux cas) :
 *   - "1er du classement seul" : cote DIRECTE (prioritaire), ecart de Score
 *     Global &ge;10 sur le rang 2.
 *   - "1er du classement 8h" : cote 8H, uniquement si la cote directe ne
 *     qualifie pas, ecart &ge;15 (seuil releve depuis v11, voir
 *     jeuSimpleGagnant.js et HEBERGEMENT.md). Remplace l'ancien mode
 *     "Cheval value seul" (rangs 2/4/5 + score Croisement, retire).
 *
 * *** v14 (aout 2026, a la demande de l'utilisateur) *** : ajout d'un seuil
 * `scoreForme >= 70` (en plus de `scoreAptitude >= 85`) et exclusion FERME
 * (jeu non jouable, `jeu.hippodromeExclu === true`) des hippodromes de
 * `HIPPODROMES_EXCLUS_SIMPLE_GAGNANT` (jeuSimpleGagnant.js). Remplace
 * l'ancien warning "hippodrome non rentable en cote 8h" (purement
 * informatif, n'empechait pas de jouer) - voir jeuSimpleGagnant.js pour le
 * detail du backtest et de la transition.
 *
 * *** v15 (aout 2026, a la demande de l'utilisateur) *** : le pool passe de
 * top3 (rang 1 a 3) a top2 (rang 1 a 2) - voir jeuSimpleGagnant.js pour le
 * detail du backtest (rendement/robustesse/reussite en hausse, rang3
 * confirme faible isolement).
 *
 * *** v16 (aout 2026, a la demande de l'utilisateur) *** : le candidat
 * retenu doit en plus avoir un score Croisement (R10/TG/OR/IdC) <=3 (sinon
 * jeu non rentable, sans repli sur l'autre mode) - voir jeuSimpleGagnant.js
 * pour le detail du backtest.
 */
function libelleModeSimpleGagnant(jeu) {
  // Depuis v15, le cheval retenu peut etre le rang 2 du classement
  // (meilleur scoreAptitude du top2), pas seulement le rang 1 - voir
  // jeuSimpleGagnant.js.
  const base = jeu.rangChoisi === 1 ? '1er du classement' : `Top2 (rang ${jeu.rangChoisi})`;
  return jeu.mode8h ? `${base} 8h` : `${base} seul`;
}

function jeuSimpleGagnantHtml(chevaux, hippodrome) {
  const jeu = jeuSimpleGagnant(chevaux, hippodrome);
  if (!jeu.rentable) {
    const raison = jeu.hippodromeExclu
      ? `Cet hippodrome fait partie des hippodromes exclus (non rentables sur l'archive compl&egrave;te, n&ge;15) - voir HEBERGEMENT.md.`
      : `Aucun des 2 premiers du classement Score Global ne qualifie ni en cote directe (seuil 3,8, aptitude &ge;85, forme &ge;70, score Croisement &le;3) ni en cote 8h (seuil 3,8, &eacute;cart &ge;15, aptitude &ge;85, forme &ge;70, score Croisement &le;3).`;
    return `<div class="card" style="margin-bottom:10px;">
        <p class="bold" style="margin:0 0 4px;">Jeu Simple Gagnant</p>
        <p class="small tag-red bold" style="margin:0;">Jeu simple gagnant non jouable</p>
        <p class="muted small" style="margin-top:4px;">${raison} Indicatif, n'entre dans aucun calcul de Score Global/Value/classement.</p>
      </div>`;
  }
  const optionsMise = MISES_PRESETS_JEU_SIMPLE_GAGNANT.map((m) => `<option value="${m}">${m}&euro;</option>`).join('');

  const palierEcartHtml = jeu.ecartScoreRang1 != null ? `
      <div class="field" style="margin-bottom:8px;">
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
          <input type="checkbox" id="jsg-palier-ecart-check">
          <span>Mise par palier d'&eacute;cart (&eacute;cart actuel : ${fmt1(jeu.ecartScoreRang1)} pts)</span>
        </label>
      </div>` : '';

  return `<div class="card" style="margin-bottom:10px;">
      <p class="bold" style="margin:0 0 4px;">Jeu Simple Gagnant</p>
      <p class="small" style="margin:0 0 4px;"><span class="tag-green bold">${libelleModeSimpleGagnant(jeu)}</span> : ${jeu.principal.chevaux.map((c) => `N&deg;${c.entry.numero} (cote ${fmt1(c.cotePourAffichage)})`).join(' - ')}</p>
      <p class="small" style="margin:0 0 8px;">Rendement esp&eacute;r&eacute; : <span class="tag-green bold">${(jeu.principal.rendement * 100).toFixed(1)}%</span></p>
      <div class="field" style="margin-bottom:8px;">
        <label for="jsg-mise-select">Mise totale souhait&eacute;e</label>
        <select id="jsg-mise-select">${optionsMise}</select>
      </div>
      ${palierEcartHtml}
      <button class="btn btn-secondary btn-block" id="jsg-calculer-btn">Calculer mise</button>
      <div id="jsg-resultat"></div>
      <p class="muted small" style="margin-top:8px;">Mise flat sur le rang 1 (Dutching &agrave; 1 cheval, rendement = sa cote). Seuil de cote calibr&eacute; sur archives r&eacute;elles (voir HEBERGEMENT.md).${jeu.ecartScoreRang1 != null ? ' Mise par palier d\'&eacute;cart (optionnelle) : x1 si &eacute;cart &lt;20, x1,5 si 20&ndash;30, x2 si &ge;30 &mdash; +21% de rendement net mesur&eacute; sur l\'archive compl&egrave;te (mode cote directe) pour un risque quasi identique (voir HEBERGEMENT.md).' : ''} Indicatif, n'entre dans aucun calcul de Score Global/Value/classement.</p>
    </div>`;
}

/**
 * A appeler apres avoir injecte jeuSimpleGagnantHtml dans le DOM (voir
 * renderRaceDetail) : attache le clic du bouton "Calculer mise" au calcul
 * de la mise flat sur le rang 1 pour la mise totale choisie.
 */
function bindJeuSimpleGagnant(chevaux, hippodrome) {
  const btn = appEl.querySelector('#jsg-calculer-btn');
  if (!btn) return;
  const jeu = jeuSimpleGagnant(chevaux, hippodrome);
  if (!jeu.rentable) return;
  btn.addEventListener('click', () => {
    const pool = jeu.principal;
    const select = appEl.querySelector('#jsg-mise-select');
    let miseTotale = Number(select.value) || 0;

    let multiplicateurApplique = 1;
    const palierCheck = appEl.querySelector('#jsg-palier-ecart-check');
    if (jeu.ecartScoreRang1 != null && palierCheck && palierCheck.checked) {
      multiplicateurApplique = multiplicateurMiseEcartRang1(jeu.ecartScoreRang1);
      miseTotale = miseTotale * multiplicateurApplique;
    }

    const mises = misesJeuSimpleGagnant(pool, miseTotale);
    const resultEl = appEl.querySelector('#jsg-resultat');
    if (!resultEl || mises.length === 0) return;
    const miseTotaleReelle = mises.reduce((acc, m) => acc + m.mise, 0);
    const palierInfoHtml = multiplicateurApplique !== 1
      ? `<p class="small tag-blue bold" style="margin-top:4px;">Palier d'&eacute;cart appliqu&eacute; : x${fmt1(multiplicateurApplique)} (&eacute;cart ${fmt1(jeu.ecartScoreRang1)} pts)</p>`
      : '';
    resultEl.innerHTML = `
      <div class="stat-grid">${mises.map((m) => `
        <div class="stat-cell">
          <div class="v">N&deg;${m.numero}</div>
          <div class="l">cote ${fmt1(m.cote)} &middot; mise ${fmt0(m.mise)}&euro; &middot; gain ${fmt0(m.gain)}&euro;</div>
        </div>
      `).join('')}</div>
      <p class="small" style="margin-top:6px;">Mise totale : ${fmt0(miseTotaleReelle)}&euro; &middot; gain si l'un de ces ${pool.n} chevaux gagne : de ${fmt0(Math.min(...mises.map((m) => m.gain)))}&euro; &agrave; ${fmt0(Math.max(...mises.map((m) => m.gain)))}&euro; (mises arrondies &agrave; l'euro, principe du Dutching)</p>
      ${palierInfoHtml}
    `;
  });
}

function basesEtDangersHtml(bd, cotesCibles, r, chevaux, disciplineCanonique, predictionExterne, hippodrome) {
  const conseilJeuCard = conseilJeuHtml(bd, chevaux);
  const jeuSimpleGagnantCard = jeuSimpleGagnantHtml(chevaux, hippodrome);
  const coupleValueCard = coupleValueHtml(bd, chevaux, cotesCibles);

  const fiabDisc = bd.bases.some((b) => b.isConfirme) ? fiabiliteDiscipline(disciplineCanonique) : null;
  const fiabDiscHtml = fiabDisc
    ? `<p class="resume-line"><span class="label">Fiabilite bases confirmees (discipline)</span><span class="small ${fiabDisc.cls} bold" title="${escapeHtml(fiabDisc.detail)}">${escapeHtml(fiabDisc.label)}</span></p>`
    : '';

  const basesHtml = bd.bases.length === 0
    ? '<p class="muted small">Aucune base validée par le moteur de score (aucun cheval "Base solide" ou "Base très solide" sur cette course).</p>'
    : `<div class="stat-grid">${bd.bases.map((b) => {
        const { label, tag } = libelleNiveauBase(b.niveau);
        const cls = tag === 'danger-strong' ? 'tag-red' : (tag === 'strong' ? 'tag-blue' : (tag === 'confirmed' ? 'tag-green' : 'tag-gray'));
        return `<div class="stat-cell"><div class="v ${cls}">N&deg;${b.numero}</div><div class="l">${escapeHtml(label)}</div></div>`;
      }).join('')}</div>`;

  const meilleurHtml = bd.meilleur
    ? `<p class="resume-line"><span class="label">Cheval le plus fiable (Module 2)</span><span>N&deg;${bd.meilleur.numero} (${fmt1(bd.meilleur.probTop3)}% Top3, ${fmt1(bd.meilleur.probTop2)}% Top2)</span></p>`
    : '';

  // *** "Top2 fiable" *** : la base a-t-elle un ecart de Score Global
  // suffisant sur son 2e meilleur rival pour avoir de bonnes chances de
  // terminer precisement dans les 2 premiers ? Cf. calculerBasesEtDangers.
  const top2FiableHtml = bd.meilleur
    ? `<p class="resume-line"><span class="label">Top 2 fiable</span><span>${bd.top2Fiable
        ? '<span class="small tag-green bold">Oui</span>'
        : '<span class="small tag-orange bold">Non</span>'} (marge ${fmt1(bd.meilleur.ecartScoreVs2emeRival)} pts de Score Global sur le 2e rival)</span></p>`
    : '';

  const dangerHtml = bd.danger.length === 0
    ? '<p class="muted small">Aucun danger détecté (aucun cheval très joué par le marché en dehors des bases retenues).</p>'
    : `<p class="small tag-red bold">${bd.danger.map((n) => `N&deg;${n}`).join(' - ')}</p>`;

  const cotesCiblesHtml = !cotesCibles || cotesCibles.length === 0 ? '' : `
      <div style="margin: 10px 0; border-top: 1px solid var(--border);"></div>
      <p class="bold small" style="margin-bottom:4px;">Cote(s) cible(s) la plus proche</p>
      <div class="stat-grid">${cotesCibles.map((cc) => `
        <div class="stat-cell">
          <div class="v">${cc.horse ? `N&deg;${cc.horse.numero}` : '&mdash;'}</div>
          <div class="l">Cible ${cc.label} (${fmt1(cc.cible)})${cc.horse ? ` &middot; cote ${fmt1(cc.horse.cote)}` : ''}</div>
        </div>
      `).join('')}</div>
      <p class="muted small" style="margin-top:8px;">Pour chaque cote de référence (NP/4, NP/2, NP, NP x2 partants), le cheval du champ dont la cote actuelle en est la plus proche (à ±100%) — repères classiques favori/outsider, indépendants du Score Global.</p>`;

  return `
    ${conseilJeuCard}
    ${jeuSimpleGagnantCard}
    ${coupleValueCard}
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h3 style="margin:0;">Base(s) possible(s) &amp; Danger(s)</h3>
        ${annotationCourseHtml(bd, r)}
      </div>
      <p class="muted small" style="margin-top:4px;">Croise le classement du moteur de score (Module 1) avec les critères techniques par rubriques (Module 2 : SC, cotes, associations de rubriques).</p>
      <p class="bold small" style="margin-bottom:4px;">Base(s) possible(s)</p>
      ${basesHtml}
      ${meilleurHtml}
      ${top2FiableHtml}
      ${fiabDiscHtml}
      <div style="margin: 10px 0; border-top: 1px solid var(--border);"></div>
      <p class="bold small" style="margin-bottom:4px;">Danger(s)</p>
      ${dangerHtml}
      <p class="muted small" style="margin-top:8px;">Danger(s) = cheval très joué par le marché (Value &lt; -10%, cote &lt;= 50) mais non retenu comme base. Sur un échantillon réel de 51 courses (voir HEBERGEMENT.md), ces chevaux ont un taux de victoire/place nettement supérieur au reste du champ — à prendre au sérieux dans vos combinaisons, pas seulement comme un risque à surveiller.</p>
      ${cotesCiblesHtml}
    </div>
  `;
}

function categorieLine(label, items) {
  const txt = items.length === 0 ? '&mdash;' : items.map((i) => `${i.numero} (${fmt0(i.value)}%)`).join(' - ');
  return `<div class="resume-line"><div class="label">${label}</div><div>${txt}</div></div>`;
}

function resumeHtml(r) {
  return `
    <div class="card">
      <h3>Pronostic suggere</h3>
      <div class="resume-line"><div class="label">Bases (Top 3)</div><div>${r.bases.join(' - ')}</div></div>
      ${r.outsiders.length ? `<div class="resume-line"><div class="label">Outsiders</div><div>${r.outsiders.join(' - ')}</div></div>` : ''}
      ${categorieLine('Delaisse par le marche', r.anormalementDelaisses)}
      ${categorieLine('Cote logique', r.coteLogique)}
      ${categorieLine('Plus joue', r.plusJoue)}
      ${categorieLine('Tres joue (confiance marche)', r.tresJoueMefiance)}

      <div style="margin: 10px 0; border-top: 1px solid var(--border);"></div>
      <div class="resume-line"><div class="label">Indice de confiance</div><div>${fmt1(r.indiceConfiance)} / 100 - ${r.lisibiliteCourse}</div></div>
      ${(r.ecartTop3Vs4eme != null) ? `<div class="resume-line"><div class="label">Ecart Top3 / 4e</div><div>${fmt1(r.ecartTop3Vs4eme)} pts - ${r.hierarchie}</div></div>` : ''}
      <div class="resume-line"><div class="label">Confiance (proba Top3)</div><div>${fmt1(r.confianceProbaTop3)}%</div></div>
      ${r.chevalLePlusSur ? `<div class="resume-line"><div class="label">Cheval le plus sur</div><div>N&deg;${r.chevalLePlusSur.numero} (${fmt1(r.chevalLePlusSur.probTop3)}% Top3, marge ${fmt1(r.chevalLePlusSur.marge)} pts)</div></div>` : ''}

      <p class="muted small" style="margin-top:10px;">Value &gt; +20% = le modele juge ce cheval delaisse par le marche par rapport a son Score Global &middot; Value &lt; -20% = le modele le juge tres joue par rapport a son Score Global. Proba Top3 estimee par modele Plackett-Luce a partir du Score Global.</p>
    </div>
  `;
}

// -------------------------------------------------------------------
// FICHE CHEVAL
// -------------------------------------------------------------------
async function renderHorseDetail(raceId, horseId) {
  renderTopbar('Fiche cheval', { back: () => navigate(`race/${raceId}`) });

  if (!lastAnalysis || lastAnalysis.raceId !== raceId) {
    await renderRaceDetail(raceId, false);
  }
  const c = lastAnalysis.result.chevaux.find((x) => x.entry.id === horseId);
  if (!c) { appEl.innerHTML = '<div class="card">Cheval introuvable.</div>'; return; }

  const toutesPerfs = await DB.getAllPerformances();
  const raceCourante = await DB.getRace(raceId);
  const meetingsPourFiche = await DB.getAllMeetings();
  const meetingCourant = raceCourante ? meetingsPourFiche.find((m) => m.id === raceCourante.meetingId) : null;
  const dateCourseFiche = meetingCourant ? new Date(meetingCourant.date).toISOString().slice(0, 10) : null;
  const historique = CSVImporter.historiquePour(c.entry.nom, toutesPerfs, dateCourseFiche);

  appEl.innerHTML = `
    <div class="card">
      <h2 style="margin-bottom:2px;">N&deg;${c.entry.numero} - ${escapeHtml(c.entry.nom)}</h2>
      <p class="muted">${escapeHtml(c.recommandation)}</p>
    </div>

    <div class="card">
      ${barRow('Score Global', c.scoreGlobal, 100, 'var(--accent)')}
      ${barRow('Forme (35%)', c.scoreForme, 100, 'var(--blue)')}
      ${barRow('Aptitude (25%)', c.scoreAptitude, 100, '#b17adf')}
      ${barRow('Conditions (15%)', c.scoreConditions, 100, '#2ec4b6')}
      ${barRow('Cote (10%)', c.scoreCote, 100, 'var(--orange)')}
      ${barRow('Similaire (15%)', c.scoreSimilaire, 40, 'var(--green)')}
      ${barRow('Bonus Rubriques', c.scoreRubriques, 15, '#e8a838')}
    </div>

    <div class="card">
      <div class="resume-line"><div class="label">Cote probable</div><div>${fmt1(c.coteProbable)}</div></div>
      <div class="resume-line"><div class="label">Value</div><div>${c.value >= 0 ? '+' : ''}${fmt0(c.value)}%</div></div>
      <div class="resume-line"><div class="label">Probabilite victoire</div><div>${fmt1(c.probVictoire)}%</div></div>
      <div class="resume-line"><div class="label">Probabilite Top 3</div><div>${fmt1(c.probTop3)}%</div></div>
      <div class="resume-line"><div class="label">Nb courses (Forme)</div><div>${c.nbCourses}</div></div>
    </div>

    <h3>Historique (${historique.length} courses connues)</h3>
    ${historique.length === 0
      ? '<p class="muted small">Aucune performance connue pour ce cheval. Importez l\'historique depuis l\'onglet "Importer".</p>'
      : `<div class="list-group">${historique.map(perfRowHtml).join('')}</div>`}
  `;
}

function barRow(label, value, max, color) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return `
    <div class="bar-row">
      <div class="bar-label"><span>${label}</span><span class="bold">${fmt1(value)}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%; background:${color};"></div></div>
    </div>
  `;
}

function perfRowHtml(p) {
  const place = p.place;
  const placeTxt = place ? `${place}${place === 1 ? 'er' : 'e'}` : 'NP';
  const placeClass = place === 1 ? 'tag-green' : (place && place <= 3 ? 'tag-orange' : 'tag-gray');
  const dateTxt = p.datePerf ? new Date(p.datePerf).toLocaleDateString('fr-FR') : '';
  return `
    <div class="list-item">
      <div>
        <div class="bold small">${escapeHtml(p.lieu)}</div>
        <div class="muted small">${escapeHtml(p.discipline)} - ${Math.round(p.distance)} m</div>
      </div>
      <div class="bold small ${placeClass}">${placeTxt}</div>
      <div class="muted small">${dateTxt}</div>
    </div>
  `;
}

// -------------------------------------------------------------------
// IMPORT
// -------------------------------------------------------------------
function renderImport() {
  renderTopbar('Importer');
  appEl.innerHTML = `
    <div class="card">
      <h3>Reunion du jour</h3>
      <p class="muted small">Fichier CSV "Reunion complete" : une ligne par cheval par course, 76 colonnes (meme format que celui utilise aujourd'hui pour remplir Excel). Un export "journee complete" regroupant plusieurs reunions dans un seul fichier (76 ou 77 colonnes) est aussi accepte : chaque reunion detectee est alors importee separement.</p>
      <div class="field"><input type="file" id="file-reunion" accept=".csv,text/csv,text/plain"></div>
    </div>

    <div class="card">
      <h3>Historique des chevaux</h3>
      <p class="muted small">Fichier CSV "Performances completes" (16 colonnes). Vient s'ajouter a la base locale de facon cumulative : rien n'est efface. Un reimport du meme fichier remplace proprement les performances deja connues (plus de doublons depuis aout 2026).</p>
      <div class="field"><input type="file" id="file-perfs" accept=".csv,text/csv,text/plain"></div>
      <button class="btn btn-secondary btn-block" id="btn-dedupe-perfs" style="margin-top:8px;">Nettoyer les doublons d'historique</button>
      <p class="muted small" style="margin-top:4px;">A utiliser une fois si vous avez deja importe plusieurs fois les memes fichiers musiques par le passe (sur cet appareil) : supprime les performances en double sans rien perdre.</p>
    </div>

    <div class="card">
      <h3>Predictions externes (optionnel)</h3>
      <p class="muted small">Fichier CSV "Predictions_JJMMAAAA_HHMM" d'un service de pronostics tiers (chevaux Cotee/Non cotee G1-G3, indice ScFi). Sert uniquement de signal de confirmation crois&eacute; avec la Base de l'appli (badge "Confirmation externe") - n'entre dans aucun calcul de Score Global/Value/classement. La date est lue dans le nom du fichier, comme pour la r&eacute;union du jour.</p>
      <div class="field"><input type="file" id="file-predictions-externes" accept=".csv,text/csv,text/plain"></div>
    </div>

    <div class="card">
      <h3>Sauvegarde</h3>
      <p class="muted small">Vos donnees restent uniquement dans ce navigateur (IndexedDB), sans compte ni cloud. Exportez regulierement une sauvegarde, surtout avant de changer d'appareil ou de navigateur.</p>
      <div style="display:flex; gap:10px;">
        <button class="btn btn-secondary btn-block" id="btn-export">Exporter une sauvegarde</button>
        <label class="btn btn-secondary btn-block" style="text-align:center;">
          Importer une sauvegarde
          <input type="file" id="file-backup" accept="application/json" style="display:none;">
        </label>
      </div>
    </div>

    <div class="card">
      <h3>Reinitialisation</h3>
      <p class="muted small">Efface les reunions/courses deja importees (pour repartir propre entre deux journees de courses), sans toucher a l'historique des performances.</p>
      <button class="btn btn-secondary btn-block" id="btn-reset-reunions">Vider les reunions importees</button>
      <button class="btn btn-secondary btn-block" id="btn-reset-predictions-externes" style="margin-top:8px;">Vider les predictions externes importees</button>
    </div>

    <div id="import-message"></div>
  `;

  document.getElementById('file-reunion').addEventListener('change', (e) => handleReunionImport(e.target.files[0]));
  document.getElementById('file-perfs').addEventListener('change', (e) => handlePerformancesImport(e.target.files[0]));
  document.getElementById('btn-dedupe-perfs').addEventListener('click', handleDedupePerformances);
  document.getElementById('file-predictions-externes').addEventListener('change', (e) => handlePredictionsExternesImport(e.target.files[0]));
  document.getElementById('btn-export').addEventListener('click', handleExport);
  document.getElementById('file-backup').addEventListener('change', (e) => handleBackupImport(e.target.files[0]));
  document.getElementById('btn-reset-reunions').addEventListener('click', handleResetReunions);
  document.getElementById('btn-reset-predictions-externes').addEventListener('click', handleResetPredictionsExternes);
}

async function handleResetReunions() {
  const ok = confirm('Vider toutes les reunions importees ? L\'historique des performances ne sera pas touche.');
  if (!ok) return;
  await DB.resetReunions();
  showImportMessage('Reunions importees videes.', false);
}

async function handleResetPredictionsExternes() {
  const ok = confirm('Vider toutes les predictions externes importees ?');
  if (!ok) return;
  await DB.resetPredictionsExternes();
  showImportMessage('Predictions externes videes.', false);
}

/**
 * Nettoie les doublons de performances deja accumules dans IndexedDB (bug
 * corrige en aout 2026 : avant, chaque reimport du meme fichier musiques
 * dupliquait ses lignes au lieu de les remplacer). Voir DB.dedupePerformances.
 */
async function handleDedupePerformances() {
  const ok = confirm('Nettoyer les doublons d\'historique de performances sur cet appareil ? Cette action supprime les entrees en double sans rien perdre (garde une copie de chaque performance).');
  if (!ok) return;
  const { avant, apres, supprimes } = await DB.dedupePerformances();
  showImportMessage(
    supprimes > 0
      ? `Nettoyage termine : ${supprimes} doublon${supprimes > 1 ? 's' : ''} supprime${supprimes > 1 ? 's' : ''} (${avant} -> ${apres} performances).`
      : `Aucun doublon trouve (${avant} performances, deja propre).`,
    false
  );
}

function showImportMessage(text, isError) {
  document.getElementById('import-message').innerHTML =
    `<div class="banner ${isError ? 'error' : 'ok'}">${escapeHtml(text)}</div>`;
}

async function readFileSmart(file) {
  const buffer = await file.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(buffer);
  if (text.includes('�')) {
    // Probable encodage Windows-1252 / Latin-1 (courant pour les exports francais).
    try { text = new TextDecoder('windows-1252').decode(buffer); } catch { /* garde utf-8 */ }
  }
  return text;
}

// Extrait la date REELLE de la reunion depuis le NOM du fichier importe.
// *** Correctif important *** : ni l'ancien format ("AAAAMMJJ-JOURNEE.csv")
// ni le nouveau ("Analyse_AAAAMMJJ_partants.csv") ne contiennent de colonne
// de date dans le CSV lui-meme (seulement une heure de depart) - la date de
// la reunion n'est donc connue qu'a travers le nom du fichier. Avant ce
// correctif, saveMeetingWithRaces horodatait systematiquement la reunion
// avec la date/heure de l'IMPORT (aucune date fournie par l'appelant) :
// sans consequence si on importe le jour meme, mais en cas d'import d'une
// archive (jour anterieur), les mises a jour de cotes/resultat/rapports
// utilisaient alors cette date d'import pour interroger l'API PMU, et
// pointaient donc vers les courses du jour EN COURS (memes numeros de
// reunion/course, mais mauvais jour) plutot que celles de l'archive.
function extraireDateReunionDepuisNomFichier(nomFichier) {
  const nom = nomFichier || '';
  const m = nom.match(/(20\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  const annee = Number(m[1]);
  const mois = Number(m[2]);
  const jour = Number(m[3]);
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return null;
  const date = new Date(Date.UTC(annee, mois - 1, jour));
  // Rejette les combinaisons invalides (ex. "20261332") qui ne "round-trip" pas.
  if (date.getUTCFullYear() !== annee || date.getUTCMonth() !== mois - 1 || date.getUTCDate() !== jour) return null;
  return date.toISOString();
}

async function handleReunionImport(file) {
  if (!file) return;
  try {
    const csv = await readFileSmart(file);
    const races = CSVImporter.parseReunionComplete(csv);
    if (races.length === 0) { showImportMessage('Aucune course reconnue dans ce fichier.', true); return; }

    const dateReunion = extraireDateReunionDepuisNomFichier(file.name);

    // Un meme fichier peut desormais contenir plusieurs reunions (export
    // "journee complete" regroupant toutes les reunions d'une meme journee) :
    // on regroupe les courses par numero de reunion et on cree un "meeting"
    // distinct pour chacune (parseReunionComplete garantit deja qu'aucune
    // course de deux reunions differentes n'est melangee, meme en cas de
    // numeros de course identiques).
    const racesParReunion = new Map();
    for (const r of races) {
      const num = r.context.numeroReunion;
      if (!racesParReunion.has(num)) racesParReunion.set(num, []);
      racesParReunion.get(num).push(r);
    }

    const resumesReunions = [];
    let totalHorses = 0;
    for (const [numReunion, racesReunion] of racesParReunion) {
      const first = racesReunion[0];
      const meeting = {
        numeroReunion: numReunion,
        hippodrome: first.context.lieu,
        ...(dateReunion ? { date: dateReunion } : {})
      };
      const racesToSave = racesReunion.map((r) => ({
        numeroCourse: r.context.numeroCourse,
        lieu: r.context.lieu,
        discipline: r.context.disciplineBrute,
        distanceJour: r.context.distanceJour,
        allocation: r.context.allocation,
        heureDepart: r.context.heureDepart,
        arriveeBrute: r.arriveeBrute,
        horses: r.horses
      }));
      await DB.saveMeetingWithRaces(meeting, racesToSave);

      const nbHorsesReunion = racesReunion.reduce((a, r) => a + r.horses.length, 0);
      totalHorses += nbHorsesReunion;
      resumesReunions.push(`R${numReunion} ${first.context.lieu} (${racesReunion.length} course${racesReunion.length > 1 ? 's' : ''})`);
    }

    const suffixeDate = dateReunion
      ? ` Date detectee : ${new Date(dateReunion).toLocaleDateString('fr-FR')}.`
      : ` Date non detectee dans le nom du fichier : date du jour utilisee par defaut (a verifier si ce n'est pas une archive).`;
    const message = (racesParReunion.size > 1
      ? `${racesParReunion.size} reunions importees : ${resumesReunions.join(', ')} - ${totalHorses} partants au total.`
      : `Reunion importee : ${races.length} course(s), ${totalHorses} partants au total.`) + suffixeDate;
    showImportMessage(message, false);
  } catch (err) {
    showImportMessage(`Echec de l'import : ${err.message || err}`, true);
  }
}

async function handlePerformancesImport(file) {
  if (!file) return;
  try {
    const csv = await readFileSmart(file);
    const perfs = CSVImporter.parsePerformances(csv);
    if (perfs.length === 0) { showImportMessage('Aucune performance reconnue dans ce fichier.', true); return; }
    await DB.addPerformances(perfs);
    showImportMessage(`${perfs.length} performance(s) ajoutee(s) a l'historique.`, false);
  } catch (err) {
    showImportMessage(`Echec de l'import : ${err.message || err}`, true);
  }
}

// La date de la journee concernee n'est, comme pour la reunion du jour, lisible
// que dans le NOM du fichier ("Predictions_JJMMAAAA_HHMM.csv") - reutilise le
// meme extracteur que l'import de reunion pour rester coherent.
async function handlePredictionsExternesImport(file) {
  if (!file) return;
  try {
    const csv = await readFileSmart(file);
    const predictions = parsePredictionsExternes(csv);
    if (predictions.length === 0) { showImportMessage('Aucune prediction externe reconnue dans ce fichier.', true); return; }

    const dateReunion = extraireDateReunionDepuisNomFichier(file.name);
    if (!dateReunion) {
      showImportMessage('Date introuvable dans le nom du fichier (attendu : Predictions_JJMMAAAA_HHMM.csv) - import annule.', true);
      return;
    }
    const dateVal = new Date(dateReunion).toISOString().slice(0, 10);
    await DB.savePredictionsExternes(dateVal, predictions);
    showImportMessage(`${predictions.length} prediction(s) externe(s) importee(s) pour le ${new Date(dateReunion).toLocaleDateString('fr-FR')}.`, false);
  } catch (err) {
    showImportMessage(`Echec de l'import : ${err.message || err}`, true);
  }
}

async function handleExport() {
  const data = await DB.exportAll();
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `turf-analyse-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showImportMessage('Sauvegarde exportee.', false);
}

async function handleBackupImport(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await DB.importAll(data);
    showImportMessage('Sauvegarde restauree.', false);
  } catch (err) {
    showImportMessage(`Echec de la restauration : ${err.message || err}`, true);
  }
}

// -------------------------------------------------------------------
// COURSE FEU VERT : courses dont le score de configuration du Coupl&eacute;
// Value (cf. scoreConfigurationCoupleValue) correspond au filtre choisi par
// l'utilisateur (cf. getFiltreFeuVert ci-dessous - cumulatif "N/5 et plus"
// ou exact "N/5 uniquement", N de 2 a 5, defaut "4/5 et plus"), ET dont le
// nombre de partants est compris entre 8 et 16 (a la demande de
// l'utilisateur - les champs en dehors de cette plage sont ecartes de la
// liste, meme avec un bon score). Remplace l'ancienne page "Courses sures"
// (base solide + Score Global >= 80), a la demande de l'utilisateur, par
// un filtre directement aligne sur l'indicateur de confiance du
// Coupl&eacute; Value.
//
// *** Filtre confirmation externe (ajoute a la demande de l'utilisateur,
// choix explicite d'un VRAI filtre plutot qu'un simple badge) *** : une
// course n'apparait plus en Course feu vert (ni en Resultat) que si sa Base
// tres solide (trioValueAvecBase) est CONFIRMEE - simple ou double - par un
// fichier de predictions externe importe pour le bon jour/hippodrome/
// course (cf. niveauConfirmationExterne,
// js/engine/predictionsExternesParser.js). Consequence assumee : sans
// import de predictions externe pour la journee, la liste reste vide meme
// si des courses remplissent les autres criteres - documente dans le
// message "Aucune course feu vert" ci-dessous.
// -------------------------------------------------------------------
const MIN_PARTANTS_FEU_VERT = 8;
const MAX_PARTANTS_FEU_VERT = 16;

// Filtre de confiance pour Course feu vert/Resultat, choisi par
// l'utilisateur et memorise dans ce navigateur (localStorage) - a la
// demande de l'utilisateur, qui souhaite pouvoir elargir ou resserrer la
// liste depuis l'app, sans intervention sur le code. Les deux pages
// partagent le meme filtre pour rester coherentes entre elles. Deux modes
// possibles (a la demande de l'utilisateur) : "ge" (score de configuration
// >= N, cumulatif) ou "eq" (score de configuration = N, exactement), pour
// N de 2 a 5 - encode en une chaine ("ge4", "eq3", ...) memorisee telle
// quelle.
const FILTRE_FEU_VERT_DEFAUT = 'ge4';
const FILTRE_FEU_VERT_CLE_STOCKAGE = 'turf-filtre-feu-vert';

function parseFiltreFeuVert(brut) {
  const m = /^(ge|eq)([2-5])$/.exec(brut || '');
  if (!m) return null;
  return { mode: m[1], score: Number(m[2]) };
}

function getFiltreFeuVert() {
  return parseFiltreFeuVert(localStorage.getItem(FILTRE_FEU_VERT_CLE_STOCKAGE)) || parseFiltreFeuVert(FILTRE_FEU_VERT_DEFAUT);
}

function setFiltreFeuVert(valeur) {
  if (!parseFiltreFeuVert(valeur)) return;
  localStorage.setItem(FILTRE_FEU_VERT_CLE_STOCKAGE, valeur);
}

function matchFiltreFeuVert(score, filtre) {
  return filtre.mode === 'eq' ? score === filtre.score : score >= filtre.score;
}

// Libelle court utilise apres "est" dans les phrases ("... est &ge; 4/5" /
// "... est exactement 4/5").
function libelleFiltreFeuVert(filtre) {
  return filtre.mode === 'eq' ? `exactement ${filtre.score}/5` : `&ge; ${filtre.score}/5`;
}

function seuilFeuVertSelectorHtml() {
  const actuel = getFiltreFeuVert();
  const actuelValeur = `${actuel.mode}${actuel.score}`;
  const optionsCumul = [2, 3, 4, 5]
    .map((v) => `<option value="ge${v}" ${actuelValeur === `ge${v}` ? 'selected' : ''}>${v}/5 et plus</option>`)
    .join('');
  const optionsExact = [2, 3, 4, 5]
    .map((v) => `<option value="eq${v}" ${actuelValeur === `eq${v}` ? 'selected' : ''}>${v}/5 uniquement</option>`)
    .join('');
  return `
    <div class="card" style="margin-bottom:10px;">
      <div class="field" style="margin-bottom:0;">
        <label for="seuil-feu-vert-select">Indice de confiance</label>
        <select id="seuil-feu-vert-select">
          <optgroup label="Cumulatif">${optionsCumul}</optgroup>
          <optgroup label="Exact">${optionsExact}</optgroup>
        </select>
      </div>
    </div>`;
}

function bindSeuilFeuVertSelector(onChange) {
  const sel = document.getElementById('seuil-feu-vert-select');
  if (!sel) return;
  sel.addEventListener('change', () => {
    setFiltreFeuVert(sel.value);
    onChange();
  });
}

function nbPartantsAcceptableFeuVert(nbPartants) {
  return nbPartants >= MIN_PARTANTS_FEU_VERT && nbPartants <= MAX_PARTANTS_FEU_VERT;
}

// Seuil de couverture d'historique minimal (a la demande de l'utilisateur) :
// une course est ecartee de "Course feu vert"/"Resultat" si PLUS de 50% de
// ses chevaux n'ont aucun historique de performances retrouve (nbCourses
// === 0, cf. ratioSansHistorique ci-dessus) - le Score Forme/Aptitude/
// Similaire de ces chevaux etant alors un defaut neutre plutot qu'une
// vraie evaluation, la Value/le score de configuration deviennent peu
// fiables pour la majorite du champ.
const RATIO_MAX_SANS_HISTORIQUE_FEU_VERT = 0.5;

function couvertureHistoriqueAcceptableFeuVert(chevaux) {
  return ratioSansHistorique(chevaux) <= RATIO_MAX_SANS_HISTORIQUE_FEU_VERT;
}

/**
 * Convertit une heure de depart au format "HHhMM" (ex. "10h59", tel
 * qu'importe depuis le CSV - voir csvImporter.js) en nombre de minutes
 * depuis minuit, pour permettre un tri chronologique. Formats tolerants
 * (HH:MM, HHhMM, HH.MM) ; renvoie Infinity si le format n'est pas
 * reconnu ou si la valeur est absente (course sans heure connue classee
 * en dernier, plutot qu'en tete par un 0 trompeur).
 * @param {string} heureDepart
 * @returns {number}
 */
function minutesDepart(heureDepart) {
  const m = String(heureDepart || '').match(/(\d{1,2})[h:.](\d{2})/);
  if (!m) return Infinity;
  const heures = Number(m[1]);
  const minutes = Number(m[2]);
  if (!Number.isFinite(heures) || !Number.isFinite(minutes)) return Infinity;
  return heures * 60 + minutes;
}

async function renderCourseFeuVert() {
  renderTopbar('Top base');
  const meetings = await DB.getAllMeetings();

  if (meetings.length === 0) {
    appEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">\u{1F7E2}</div>
        <p class="bold">Aucune reunion importee</p>
        <p class="muted">Importez une reunion depuis l'onglet "Importer" pour voir apparaitre ici les courses Top base.</p>
      </div>`;
    return;
  }

  const filtre = getFiltreFeuVert();
  const toutesPerfs = await DB.getAllPerformances();
  const candidates = [];

  for (const meeting of meetings) {
    const races = await DB.getRacesForMeeting(meeting.id);
    const dateValMeeting = new Date(meeting.date).toISOString().slice(0, 10);
    for (const race of races) {
      const horseRecords = await DB.getHorsesForRace(race.id);
      if (horseRecords.length === 0) continue;
      if (!nbPartantsAcceptableFeuVert(horseRecords.length)) continue;

      const horses = horseRecords.map((h) => ({
        entry: h,
        historique: CSVImporter.historiquePour(h.nom, toutesPerfs, dateValMeeting)
      }));
      const context = {
        lieu: race.lieu,
        discipline: disciplineFromRaw(race.discipline),
        disciplineBrute: race.discipline,
        distanceJour: race.distanceJour,
        allocation: race.allocation,
        nbPartants: horses.length
      };
      const result = RaceAnalyzer.analyser(horses, context, false);
      if (!couvertureHistoriqueAcceptableFeuVert(result.chevaux)) continue;
      const bd = calculerBasesEtDangers(result.chevaux, context.discipline.canonical);
      const score = scoreConfigurationCoupleValue(bd, result.chevaux);
      if (!matchFiltreFeuVert(score, filtre)) continue;

      // *** Filtre confirmation externe (a la demande de l'utilisateur) ***
      // Course feu vert n'affiche plus desormais que les courses dont la
      // Base (trioValueAvecBase - la meme que celle du badge "Confirmation
      // externe" sur la fiche course) est CONFIRMEE par le fichier de
      // predictions externe importe pour ce jour/hippodrome/course (simple
      // OU double) - exclut donc aussi les courses sans Base tres solide, et
      // celles pour lesquelles aucune prediction externe n'a ete importee.
      const suggestionBase = trioValueAvecBase(bd, result.chevaux);
      if (!suggestionBase) continue;
      const dateVal = new Date(meeting.date).toISOString().slice(0, 10);
      const predictionExterne = await DB.getPredictionExterne(dateVal, meeting.hippodrome, race.numeroCourse);
      const niveauExterne = niveauConfirmationExterne(suggestionBase.base.entry.numero, predictionExterne);
      if (niveauExterne !== 'double' && niveauExterne !== 'simple') continue;

      const { base, partenaires } = suggestionBase;
      const cotesCibles = calculerCotesCibles(result.chevaux, context.nbPartants);
      const base5 = coupleValue(result.chevaux, 5);
      const numerosConfirmes = base5 ? confirmationsCotesCibles(base5.candidats, cotesCibles) : [];
      const cle = `${bucketConfiance(score)}-${bucketConfirmations(numerosConfirmes.length)}`;
      const cellule = TRIO_ADAPTATIF_NIVEAUX[cle];
      candidates.push({ meeting, race, score, base, partenaires, cotesCibles, cellule, nbPartants: horses.length, predictionExterne });
    }
  }

  if (candidates.length === 0) {
    appEl.innerHTML = `
      ${seuilFeuVertSelectorHtml()}
      <div class="empty-state">
        <div class="icon">\u{1F7E2}</div>
        <p class="bold">Aucune course Top base pour l'instant</p>
        <p class="muted">Une course apparait ici des que son score de configuration est ${libelleFiltreFeuVert(filtre)}, avec entre ${MIN_PARTANTS_FEU_VERT} et ${MAX_PARTANTS_FEU_VERT} partants, au moins la moitie du champ avec un historique de performances retrouve, ET dont la Base (tres solide) est confirmee par un fichier de pr&eacute;dictions externe import&eacute; pour le bon jour/hippodrome/course (onglet Importer). Sans fichier de pr&eacute;dictions externe import&eacute;, aucune course ne peut appara&icirc;tre ici.</p>
      </div>`;
    bindSeuilFeuVertSelector(renderCourseFeuVert);
    return;
  }

  // *** Modifie *** (a la demande de l'utilisateur : "classer les courses
  // feu vert par heure de depart, pas par indice de confiance") : tri
  // chronologique au lieu du tri par score.
  candidates.sort((a, b) => minutesDepart(a.race.heureDepart) - minutesDepart(b.race.heureDepart));

  appEl.innerHTML = `
    ${seuilFeuVertSelectorHtml()}
    <button class="btn btn-secondary btn-block" data-goto="resultat" style="margin-bottom:10px;">Voir la reussite du jour</button>
    <div class="list-group">${candidates.map(({ meeting, race, score, base, partenaires, cotesCibles, cellule, nbPartants, predictionExterne }) => {
      const niveau = SCORE_CONFIGURATION_NIVEAUX[score];
      const statsTrio = cellule
        ? `${cellule.taux} de reussite sur ce profil de confiance/confirmations (n=${cellule.n}, contre 61,2% en moyenne generale - n=923) - backtest 5 mois, 5050 courses`
        : `${TRIO_VALUE_STATS} (profil trop rare sur ce backtest pour un taux specifique)`;
      return `
      <div class="list-item clickable" data-goto="race/${race.id}">
        <div>
          <div class="bold">${race.heureDepart ? `${escapeHtml(race.heureDepart)} - ` : ''}${escapeHtml(meeting.hippodrome)} - Course ${race.numeroCourse}</div>
          <div class="muted small">${escapeHtml(race.discipline)} - ${nbPartants} partants</div>
          <div style="margin-top:4px; display:flex; gap:6px; flex-wrap:wrap;">
            <span class="small ${niveau.cls} bold" title="${escapeHtml(statsTrio)}">${escapeHtml(niveau.label)} (${score}/5)</span>
            ${baseConfirmeeCotesCiblesHtml(base, cotesCibles)}
            ${confirmationExterneHtml(base, predictionExterne)}
            <span class="small tag-blue bold">Base : N&deg;${base.entry.numero}</span>
            ${rapportSimpleHtml(race.rapportSimpleGagnant, race.rapportSimplePlace, base.entry.numero)}
          </div>
        </div>
        <div class="muted">&rsaquo;</div>
      </div>`;
    }).join('')}</div>
  `;

  bindGoto();
  bindSeuilFeuVertSelector(renderCourseFeuVert);
}

// -------------------------------------------------------------------
// LISTE DES COURSES DU JOUR (aout 2026, a la demande de l'utilisateur) :
// vue d'ensemble de TOUTES les courses du jour a 8-16 partants (meme
// fourchette que "Top base" - cf. MIN_PARTANTS_FEU_VERT/MAX_PARTANTS_FEU_VERT
// plus haut), triees par heure de depart, avec un decompte en direct pour la
// prochaine course a partir. Contrairement a "Top base", ne filtre PAS sur le
// score de configuration / la confirmation externe : simple liste de
// consultation (pas un conseil de jeu), limitee aux reunions du jour
// (`estAujourdHui`) puisque le decompte n'a de sens que pour des courses pas
// encore parties.
// -------------------------------------------------------------------
let listeCoursesCountdownIntervalId = null;

function arreterDecompteListeCourses() {
  if (listeCoursesCountdownIntervalId) {
    clearInterval(listeCoursesCountdownIntervalId);
    listeCoursesCountdownIntervalId = null;
  }
}

/**
 * Construit un objet Date pour AUJOURD'HUI (jour de `reference`) a l'heure
 * de depart indiquee ("HHhMM", tolerant HH:MM/HH.MM - meme format que
 * `minutesDepart`). Renvoie `null` si le format n'est pas reconnu.
 * @param {string} heureDepart
 * @param {Date} reference
 * @returns {Date|null}
 */
function dateDepartAujourdHui(heureDepart, reference) {
  const m = String(heureDepart || '').match(/(\d{1,2})[h:.](\d{2})/);
  if (!m) return null;
  const heures = Number(m[1]);
  const minutes = Number(m[2]);
  if (!Number.isFinite(heures) || !Number.isFinite(minutes) || heures > 23 || minutes > 59) return null;
  const d = new Date(reference);
  d.setHours(heures, minutes, 0, 0);
  return d;
}

/**
 * Formate un nombre de millisecondes restantes en "Xh MMm SSs" (ou
 * "MMm SSs" si moins d'1h), pour le decompte de la prochaine course.
 * @param {number} msRestant
 * @returns {string}
 */
function formatDecompte(msRestant) {
  const totalSecondes = Math.max(0, Math.round(msRestant / 1000));
  const h = Math.floor(totalSecondes / 3600);
  const m = Math.floor((totalSecondes % 3600) / 60);
  const s = totalSecondes % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}h ${pad(m)}m ${pad(s)}s` : `${m}m ${pad(s)}s`;
}

async function renderListeCourses() {
  arreterDecompteListeCourses();
  renderTopbar('Liste des courses');
  const maintenant = new Date();
  const meetings = (await DB.getAllMeetings()).filter((m) => estAujourdHui(m.date, maintenant));

  if (meetings.length === 0) {
    appEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">\u{1F4C5}</div>
        <p class="bold">Aucune reunion du jour importee</p>
        <p class="muted">Importez la ou les reunions d'aujourd'hui depuis l'onglet "Importer" pour voir apparaitre ici la liste des courses (8 &agrave; 16 partants), tri&eacute;es par heure de d&eacute;part.</p>
      </div>`;
    return;
  }

  const courses = [];
  for (const meeting of meetings) {
    const races = await DB.getRacesForMeeting(meeting.id);
    for (const race of races) {
      const horseRecords = await DB.getHorsesForRace(race.id);
      if (!nbPartantsAcceptableFeuVert(horseRecords.length)) continue;
      courses.push({ meeting, race, nbPartants: horseRecords.length });
    }
  }

  if (courses.length === 0) {
    appEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">\u{1F4C5}</div>
        <p class="bold">Aucune course entre 8 et 16 partants aujourd'hui</p>
        <p class="muted">Cette liste ne retient que les courses de ${MIN_PARTANTS_FEU_VERT} &agrave; ${MAX_PARTANTS_FEU_VERT} partants (m&ecirc;me fourchette que "Top base").</p>
      </div>`;
    return;
  }

  courses.sort((a, b) => minutesDepart(a.race.heureDepart) - minutesDepart(b.race.heureDepart));

  // Prochaine course a partir : premiere course (dans l'ordre chronologique)
  // dont l'heure de depart calculee est encore dans le futur.
  let prochaineIndex = -1;
  for (let i = 0; i < courses.length; i++) {
    const d = dateDepartAujourdHui(courses[i].race.heureDepart, maintenant);
    if (d && d.getTime() > maintenant.getTime()) { prochaineIndex = i; break; }
  }

  appEl.innerHTML = `
    <div class="list-group">${courses.map(({ meeting, race, nbPartants }, i) => {
      const dateDepart = dateDepartAujourdHui(race.heureDepart, maintenant);
      const estProchaine = i === prochaineIndex;
      const passee = !estProchaine && dateDepart && dateDepart.getTime() <= maintenant.getTime();
      const decompteHtml = estProchaine
        ? `<span class="small tag-orange bold" id="liste-courses-decompte" data-depart="${dateDepart.getTime()}">D&eacute;part dans ${escapeHtml(formatDecompte(dateDepart.getTime() - maintenant.getTime()))}</span>`
        : (passee ? `<span class="small tag-gray">D&eacute;part pass&eacute;</span>` : '');
      return `
      <div class="list-item clickable" data-goto="race/${race.id}">
        <div>
          <div class="bold">${race.heureDepart ? `${escapeHtml(race.heureDepart)} - ` : ''}${escapeHtml(meeting.hippodrome)} - Course ${race.numeroCourse}</div>
          <div class="muted small">${escapeHtml(race.discipline)} - ${nbPartants} partants</div>
          <div style="margin-top:4px;">${decompteHtml}</div>
        </div>
        <div class="muted">&rsaquo;</div>
      </div>`;
    }).join('')}</div>
  `;

  bindGoto();

  if (prochaineIndex >= 0) {
    listeCoursesCountdownIntervalId = setInterval(() => {
      const el = appEl.querySelector('#liste-courses-decompte');
      if (!el) { arreterDecompteListeCourses(); return; }
      const departTs = Number(el.dataset.depart);
      const restant = departTs - Date.now();
      if (restant <= 0) { renderListeCourses(); return; }
      el.textContent = `Départ dans ${formatDecompte(restant)}`;
    }, 1000);
  }
}

// -------------------------------------------------------------------
// RESULTAT (reussite de la journee) : parmi les courses "feu vert" (score
// de configuration filtre selon getFiltreFeuVert, Base tres solide
// confirmee par les predictions externes), quelle proportion a
// effectivement vu sa Base SEULE (Gagnant OU Place) confirmee par
// l'arrivee officielle (cf. baseReussie ci-dessus) - uniquement pour les
// courses dont l'arrivee officielle est deja connue. Les courses feu vert
// sans arrivee connue sont listees a part ("en attente de resultat").
// -------------------------------------------------------------------
async function renderResultatJournee() {
  renderTopbar('Réussite Top base', { back: () => navigate('feuvert') });
  const meetings = await DB.getAllMeetings();

  if (meetings.length === 0) {
    appEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">\u{1F3AF}</div>
        <p class="bold">Aucune reunion importee</p>
        <p class="muted">Importez une reunion depuis l'onglet "Importer" pour suivre ici la reussite des courses Top base.</p>
      </div>`;
    return;
  }

  const filtre = getFiltreFeuVert();
  const toutesPerfs = await DB.getAllPerformances();
  const analysees = [];

  for (const meeting of meetings) {
    const races = await DB.getRacesForMeeting(meeting.id);
    const dateValMeeting = new Date(meeting.date).toISOString().slice(0, 10);
    for (const race of races) {
      const horseRecords = await DB.getHorsesForRace(race.id);
      if (horseRecords.length === 0) continue;
      if (!nbPartantsAcceptableFeuVert(horseRecords.length)) continue;

      const horses = horseRecords.map((h) => ({
        entry: h,
        historique: CSVImporter.historiquePour(h.nom, toutesPerfs, dateValMeeting)
      }));
      const context = {
        lieu: race.lieu,
        discipline: disciplineFromRaw(race.discipline),
        disciplineBrute: race.discipline,
        distanceJour: race.distanceJour,
        allocation: race.allocation,
        nbPartants: horses.length
      };
      const result = RaceAnalyzer.analyser(horses, context, false);
      if (!couvertureHistoriqueAcceptableFeuVert(result.chevaux)) continue;
      const bd = calculerBasesEtDangers(result.chevaux, context.discipline.canonical);
      const score = scoreConfigurationCoupleValue(bd, result.chevaux);
      if (!matchFiltreFeuVert(score, filtre)) continue;

      // Meme filtre confirmation externe que Course feu vert (cf. plus haut) -
      // les deux pages doivent rester coherentes entre elles (Resultat
      // "reprend les memes courses feu vert").
      const suggestionBase = trioValueAvecBase(bd, result.chevaux);
      if (!suggestionBase) continue;
      const dateVal = new Date(meeting.date).toISOString().slice(0, 10);
      const predictionExterne = await DB.getPredictionExterne(dateVal, meeting.hippodrome, race.numeroCourse);
      const niveauExterne = niveauConfirmationExterne(suggestionBase.base.entry.numero, predictionExterne);
      if (niveauExterne !== 'double' && niveauExterne !== 'simple') continue;

      const ordreArrivee = CSVImporter.parseOrdreArrivee(race.arriveeBrute || '');
      const check = baseReussie(bd, result.chevaux, ordreArrivee, context.nbPartants);

      // rapportStatus distingue 4 cas pour le bilan financier ci-dessous :
      // 'en_attente' (arrivee pas encore connue, pas de rapport possible),
      // 'a_recuperer' (arrivee connue, rapport jamais tente), 'indisponible'
      // (rapport recupere mais aucun des 2 rapports Simple Gagnant/Place
      // n'est disponible pour cette course - exclue du bilan) et 'ok'
      // (au moins un des 2 rapports disponible, bilan calcule).
      let rapportStatus = 'en_attente';
      let bilan = null;
      if (check) {
        if (race.rapportSimpleGagnant === undefined) {
          rapportStatus = 'a_recuperer';
        } else if (
          (!Array.isArray(race.rapportSimpleGagnant) || race.rapportSimpleGagnant.length === 0)
          && (!Array.isArray(race.rapportSimplePlace) || race.rapportSimplePlace.length === 0)
        ) {
          rapportStatus = 'indisponible';
        } else {
          rapportStatus = 'ok';
          bilan = bilanSimpleBase(check.base, context.nbPartants, race.rapportSimpleGagnant, race.rapportSimplePlace);
        }
      }

      analysees.push({ meeting, race, score, check, rapportStatus, bilan });
    }
  }

  if (analysees.length === 0) {
    appEl.innerHTML = `
      ${seuilFeuVertSelectorHtml()}
      <div class="empty-state">
        <div class="icon">\u{1F3AF}</div>
        <p class="bold">Aucune course Top base pour l'instant</p>
        <p class="muted">Cette page suit la reussite des courses dont le score de configuration est ${libelleFiltreFeuVert(filtre)}, avec entre ${MIN_PARTANTS_FEU_VERT} et ${MAX_PARTANTS_FEU_VERT} partants, au moins la moitie du champ avec un historique de performances retrouve, ET dont la Base (tres solide) est confirmee par un fichier de pr&eacute;dictions externe import&eacute; pour le bon jour/hippodrome/course (onglet Importer). Sans fichier de pr&eacute;dictions externe import&eacute;, aucune course ne peut appara&icirc;tre ici.</p>
      </div>`;
    bindSeuilFeuVertSelector(renderResultatJournee);
    return;
  }

  const avecResultat = analysees.filter((a) => a.check != null);
  const enAttente = analysees.filter((a) => a.check == null);
  // *** Modifie *** (a la demande de l'utilisateur : "afficher la reussite
  // et le rendement en Gagnant et en Place separement") : 2 compteurs
  // distincts au lieu d'un seul taux "reussi" fusionne (Gagnant OU Place).
  const reussiesGagnant = avecResultat.filter((a) => a.check.victoire);
  const reussiesPlace = avecResultat.filter((a) => a.check.place);
  const aRecuperer = avecResultat.filter((a) => a.rapportStatus === 'a_recuperer');
  const avecBilan = avecResultat.filter((a) => a.rapportStatus === 'ok');

  const tauxHtml = avecResultat.length > 0
    ? `<div class="card">
        <div style="display:flex; justify-content:space-around; text-align:center; flex-wrap:wrap; gap:12px;">
          <div>
            <p class="bold" style="font-size:1.5em; margin:0;">${reussiesGagnant.length}/${avecResultat.length}</p>
            <p class="muted small" style="margin-top:2px;">Gagnant (${Math.round((reussiesGagnant.length / avecResultat.length) * 100)}%)</p>
          </div>
          <div>
            <p class="bold" style="font-size:1.5em; margin:0;">${reussiesPlace.length}/${avecResultat.length}</p>
            <p class="muted small" style="margin-top:2px;">Plac&eacute; (${Math.round((reussiesPlace.length / avecResultat.length) * 100)}%)</p>
          </div>
        </div>
        <p class="muted small" style="margin-top:8px; text-align:center;">R&eacute;ussite de la Base (score ${libelleFiltreFeuVert(filtre)}) sur les courses Top base avec r&eacute;sultat connu</p>
      </div>`
    : `<div class="card"><p class="muted small">Aucun resultat connu pour l'instant parmi les courses Top base. Utilisez la mise a jour des cotes (course ou reunion complete) pour recuperer automatiquement les arrivees officielles.</p></div>`;

  // Bilans Gagnant et Place agreges separement (cf. bilanSimpleBase, qui
  // renvoie desormais { gagnant, place } au lieu d'un seul bilan fusionne).
  const bilanGlobalGagnant = avecBilan.reduce((acc, a) => ({ mise: acc.mise + a.bilan.gagnant.mise, gain: acc.gain + a.bilan.gagnant.gain }), { mise: 0, gain: 0 });
  const bilanGlobalPlace = avecBilan.reduce((acc, a) => ({ mise: acc.mise + a.bilan.place.mise, gain: acc.gain + a.bilan.place.gain }), { mise: 0, gain: 0 });
  const netGagnant = bilanGlobalGagnant.gain - bilanGlobalGagnant.mise;
  const netPlace = bilanGlobalPlace.gain - bilanGlobalPlace.mise;

  const bilanHtml = avecResultat.length === 0 ? '' : `
    <div class="card" style="margin-top:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
        <p class="bold" style="margin:0;">Rendement (hypoth&eacute;tique) de la Base</p>
        <button class="btn btn-secondary" data-recuperer-rapports ${aRecuperer.length === 0 ? 'disabled' : ''}>R&eacute;cup&eacute;rer les rapports${aRecuperer.length > 0 ? ` (${aRecuperer.length})` : ''}</button>
      </div>
      ${avecBilan.length > 0
        ? `<div style="display:flex; gap:24px; flex-wrap:wrap; margin-top:8px;">
            <div>
              <p class="muted small" style="margin:0;">Gagnant</p>
              <p class="bold" style="font-size:1.2em; margin:2px 0 0;">${netGagnant >= 0 ? '+' : ''}${netGagnant.toFixed(2)} &euro;</p>
              <p class="muted small" style="margin-top:2px;">Mise ${bilanGlobalGagnant.mise.toFixed(2)} &euro; / Gains ${bilanGlobalGagnant.gain.toFixed(2)} &euro;</p>
            </div>
            <div>
              <p class="muted small" style="margin:0;">Plac&eacute;</p>
              <p class="bold" style="font-size:1.2em; margin:2px 0 0;">${netPlace >= 0 ? '+' : ''}${netPlace.toFixed(2)} &euro;</p>
              <p class="muted small" style="margin-top:2px;">Mise ${bilanGlobalPlace.mise.toFixed(2)} &euro; / Gains ${bilanGlobalPlace.gain.toFixed(2)} &euro;</p>
            </div>
          </div>
          <p class="muted small" style="margin-top:6px;">Sur ${avecBilan.length} course(s) avec rapport disponible.</p>`
        : `<p class="muted small" style="margin-top:8px;">Cliquez sur "R&eacute;cup&eacute;rer les rapports" pour calculer le rendement &agrave; partir des dividendes PMU officiels (Simple Gagnant/Place), s&eacute;par&eacute;ment pour chaque pari.</p>`}
      <div id="rapports-status"></div>
      <p class="muted small" style="margin-top:8px;">Hypoth&eacute;tique : suppose ${MISE_PAR_COMBINAISON_FEU_VERT}&euro; jou&eacute; sur la Base en Simple Gagnant ET ${MISE_PAR_COMBINAISON_FEU_VERT}&euro; en Simple Place (2&euro; par course), sur toutes les courses Top base du jour &mdash; ce n'est pas un historique de vos mises reelles. Les courses sans aucun rapport disponible sont exclues. Ne remplace pas votre propre jugement.</p>
    </div>`;

  const rowHtml = (a) => {
    const statutBadges = a.check
      ? `<span class="small ${a.check.victoire ? 'tag-green' : 'tag-red'} bold">Gagnant ${a.check.victoire ? '✓' : '✗'}</span><span class="small ${a.check.place ? 'tag-green' : 'tag-red'} bold">Plac&eacute; ${a.check.place ? '✓' : '✗'}</span>`
      : '<span class="small tag-gray bold">En attente</span>';
    const bilanBadges = a.rapportStatus === 'ok'
      ? `<span class="small ${a.bilan.gagnant.net >= 0 ? 'tag-green' : 'tag-red'} bold">G ${a.bilan.gagnant.net >= 0 ? '+' : ''}${a.bilan.gagnant.net.toFixed(2)}&euro;</span><span class="small ${a.bilan.place.net >= 0 ? 'tag-green' : 'tag-red'} bold">P ${a.bilan.place.net >= 0 ? '+' : ''}${a.bilan.place.net.toFixed(2)}&euro;</span>`
      : (a.rapportStatus === 'indisponible' ? '<span class="small tag-gray">Rapport indisponible</span>' : (a.rapportStatus === 'a_recuperer' ? '<span class="small muted">Rapport non recupere</span>' : ''));
    return `
    <div class="list-item clickable" data-goto="race/${a.race.id}">
      <div>
        <div class="bold">${escapeHtml(a.meeting.hippodrome)} - Course ${a.race.numeroCourse}</div>
        <div class="muted small">Score ${a.score}/5${a.check ? ` - Arrivee ${a.check.top3.join('-')}` : ' - En attente de resultat'}</div>
      </div>
      <div style="display:flex; flex-direction:column; align-items:flex-end; gap:2px;">
        ${statutBadges}
        ${bilanBadges}
      </div>
    </div>`;
  };

  appEl.innerHTML = `
    ${seuilFeuVertSelectorHtml()}
    ${tauxHtml}
    ${bilanHtml}
    ${avecResultat.length > 0 ? `<div class="list-group" style="margin-top:10px;">${avecResultat.map(rowHtml).join('')}</div>` : ''}
    ${enAttente.length > 0 ? `<h3 style="margin-top:16px;">En attente de resultat (${enAttente.length})</h3><div class="list-group">${enAttente.map(rowHtml).join('')}</div>` : ''}
  `;

  bindGoto();
  bindSeuilFeuVertSelector(renderResultatJournee);

  // Recuperation des rapports (dividendes officiels) course par course, de
  // facon sequentielle (meme raison que la mise a jour des cotes pour toute
  // la reunion : ne pas multiplier les requetes simultanees). Persiste le
  // resultat (tableau, eventuellement vide) sur chaque course concernee,
  // pour ne plus avoir a le re-demander au prochain affichage de la page.
  const btnRecuperer = appEl.querySelector('[data-recuperer-rapports]');
  if (btnRecuperer && !btnRecuperer.disabled) {
    btnRecuperer.addEventListener('click', async () => {
      const statusEl = appEl.querySelector('#rapports-status');
      btnRecuperer.disabled = true;
      let ok = 0;
      let fail = 0;
      for (let i = 0; i < aRecuperer.length; i++) {
        const a = aRecuperer[i];
        statusEl.innerHTML = `<p class="muted small" style="margin-top:8px;">Recuperation rapport ${i + 1}/${aRecuperer.length} (${escapeHtml(a.meeting.hippodrome)} - Course ${a.race.numeroCourse})...</p>`;
        // Chaque course est traitee independamment (try/catch) : un echec ou
        // une exception inattendue sur une course (reseau, PMU, IndexedDB...)
        // ne doit jamais interrompre le traitement des courses suivantes -
        // sans ce garde-fou, une seule erreur imprevue arretait silencieusement
        // toute la boucle (constate en usage reel : 1 seul rapport recupere
        // sur 3 courses, les 2 suivantes jamais tentees).
        try {
          const dateVal = new Date(a.meeting.date).toISOString().slice(0, 10);
          const json = await fetchRapportsPmu(dateVal, a.meeting.numeroReunion, a.race.numeroCourse);
          if (json) {
            // Rapports Simple Gagnant/Place pour la Base seule (Course feu
            // vert + bilan Resultat, voir rapportSimpleHtml/bilanSimpleBase) -
            // a la demande de l'utilisateur, remplace le Trio Value ici.
            a.race.rapportSimpleGagnant = extraireRapportsSimpleGagnant(json);
            a.race.rapportSimplePlace = extraireRapportsSimplePlace(json);
            await DB.updateRace(a.race);
            ok++;
          } else {
            fail++;
          }
        } catch (err) {
          console.error('Recuperation rapport echouee pour', a.meeting.hippodrome, a.race.numeroCourse, err);
          fail++;
        }
        // Petite pause entre deux courses (hors derniere) : evite d'envoyer
        // plusieurs requetes trop rapprochees vers l'API PMU/la fonction
        // externe/les proxies CORS publics, qui peuvent limiter le debit.
        if (i < aRecuperer.length - 1) await new Promise((resolve) => setTimeout(resolve, 400));
      }
      statusEl.innerHTML = `<p class="muted small" style="margin-top:8px;">Recuperation terminee : ${ok} rapport(s) recupere(s)${fail > 0 ? `, ${fail} echec(s) (reessayez, le bouton ne redemande que les courses encore manquantes)` : ''}.</p>`;
      await renderResultatJournee();
    });
  }
}

// -------------------------------------------------------------------
// BILAN SIMPLE GAGNANT (aout 2026, a la demande de l'utilisateur) :
// remplace la page "Couple rentable" (signal Couple Value retombe a un ROI
// quasi nul sur 8 mois d'archives - voir HEBERGEMENT.md, section devenue
// obsolete). Regroupe, sur une seule page, la liste des courses du jour
// dont le Jeu Simple Gagnant (cf. engine/jeuSimpleGagnant.js, carte "Jeu
// Simple Gagnant" de la fiche course) est rentable ET le bilan financier
// (hypothetique) de la journee, a partir des dividendes PMU officiels
// Simple Gagnant.
// -------------------------------------------------------------------
const MISE_STANDARD_BILAN_SIMPLE_GAGNANT = 10; // euros, hypothese de mise totale par course pour le bilan de la journee (repartie en Dutching)

// Filtre par mode de jeu pour la page "Bilan Simple Gagnant", choisi par
// l'utilisateur et memorise dans ce navigateur (localStorage - meme pattern
// que le filtre de confiance Top base/Resultat ci-dessus). Trois valeurs
// possibles : "rang1" (uniquement les courses ou le rang 1 est jouable),
// "value" (uniquement les courses ou c'est un autre rang, seul, qui est
// jouable), "tous" (les deux confondus, valeur par defaut).
const FILTRE_MODE_SIMPLE_GAGNANT_DEFAUT = 'tous';
const FILTRE_MODE_SIMPLE_GAGNANT_CLE_STOCKAGE = 'turf-filtre-mode-simple-gagnant';

function getFiltreModeSimpleGagnant() {
  const v = localStorage.getItem(FILTRE_MODE_SIMPLE_GAGNANT_CLE_STOCKAGE);
  return v === 'rang1' || v === 'value' ? v : FILTRE_MODE_SIMPLE_GAGNANT_DEFAUT;
}

function setFiltreModeSimpleGagnant(valeur) {
  if (valeur !== 'tous' && valeur !== 'rang1' && valeur !== 'value') return;
  localStorage.setItem(FILTRE_MODE_SIMPLE_GAGNANT_CLE_STOCKAGE, valeur);
}

function matchFiltreModeSimpleGagnant(rang1Value, filtre) {
  if (filtre === 'rang1') return rang1Value === true;
  if (filtre === 'value') return rang1Value === false;
  return true; // 'tous'
}

function filtreModeSimpleGagnantSelectorHtml() {
  const actuel = getFiltreModeSimpleGagnant();
  return `
    <div class="card" style="margin-bottom:10px;">
      <div class="field" style="margin-bottom:0;">
        <label for="jsg-filtre-mode-select">Filtrer par mode</label>
        <select id="jsg-filtre-mode-select">
          <option value="tous" ${actuel === 'tous' ? 'selected' : ''}>Cote directe et cote 8h</option>
          <option value="rang1" ${actuel === 'rang1' ? 'selected' : ''}>1er du classement seul (cote directe)</option>
          <option value="value" ${actuel === 'value' ? 'selected' : ''}>1er du classement 8h</option>
        </select>
      </div>
    </div>`;
}

function bindFiltreModeSimpleGagnantSelector(onChange) {
  const sel = document.getElementById('jsg-filtre-mode-select');
  if (!sel) return;
  sel.addEventListener('change', () => {
    setFiltreModeSimpleGagnant(sel.value);
    onChange();
  });
}

/**
 * Reconstruit, pour toutes les courses importees, la liste des candidates
 * "Jeu Simple Gagnant rentable" (jeuSimpleGagnant(...).rentable === true).
 * @returns {Promise<Array>} un element par course candidate : { meeting,
 *   race, nbPartants, jeu }.
 */
async function collecterCandidatesSimpleGagnant() {
  const meetings = await DB.getAllMeetings();
  const toutesPerfs = await DB.getAllPerformances();
  const candidates = [];

  for (const meeting of meetings) {
    const races = await DB.getRacesForMeeting(meeting.id);
    const dateValMeeting = new Date(meeting.date).toISOString().slice(0, 10);
    for (const race of races) {
      const horseRecords = await DB.getHorsesForRace(race.id);
      if (horseRecords.length < 5) continue;

      const horses = horseRecords.map((h) => ({
        entry: h,
        historique: CSVImporter.historiquePour(h.nom, toutesPerfs, dateValMeeting)
      }));
      const context = {
        lieu: race.lieu,
        discipline: disciplineFromRaw(race.discipline),
        disciplineBrute: race.discipline,
        distanceJour: race.distanceJour,
        allocation: race.allocation,
        nbPartants: horses.length
      };
      const result = RaceAnalyzer.analyser(horses, context, false);
      const jeu = jeuSimpleGagnant(result.chevaux, race.lieu);
      if (!jeu.rentable) continue;

      candidates.push({ meeting, race, nbPartants: horses.length, jeu });
    }
  }
  return candidates;
}

/**
 * Page "Bilan Simple Gagnant" : liste des courses du jour dont le Jeu
 * Simple Gagnant est rentable, ET bilan financier (hypothetique, mise fixe
 * de MISE_STANDARD_BILAN_SIMPLE_GAGNANT euros par course, repartie en
 * Dutching) a partir des dividendes PMU officiels Simple Gagnant. Reutilise
 * race.rapportSimpleGagnant (meme champ que la page Top base/Resultat - si
 * deja recupere pour l'un, l'autre en beneficie sans nouvelle requete).
 *
 * *** Optimisation *** : une course dont le vainqueur reel n'est pas dans le
 * pool retenu n'a jamais besoin d'aller chercher le rapport officiel pour
 * connaitre son bilan (mise perdue quel que soit le dividende du vainqueur).
 */
async function renderBilanSimpleGagnant() {
  renderTopbar('Bilan Simple Gagnant');
  const meetings = await DB.getAllMeetings();

  const bilanGlobalLinkHtml = `<button class="btn btn-secondary btn-block" data-goto="bilanglobalsimplegagnant" style="margin-bottom:10px;">Voir le bilan global (historique par jour)</button>`;

  if (meetings.length === 0) {
    appEl.innerHTML = `
      ${bilanGlobalLinkHtml}
      <div class="empty-state">
        <div class="icon">\u{1F4B0}</div>
        <p class="bold">Aucune reunion importee</p>
        <p class="muted">Importez une reunion depuis l'onglet "Importer" pour voir apparaitre ici les courses au Jeu Simple Gagnant rentable. Le bilan global (historique des jours precedents) reste consultable ci-dessus : "Vider les reunions importees" ne l'efface jamais.</p>
      </div>`;
    bindGoto();
    return;
  }

  const candidates = await collecterCandidatesSimpleGagnant();

  const introHtml = `<div class="card" style="margin-bottom:10px;">
      <p class="small muted" style="margin:0;">Courses dont le Jeu Simple Gagnant est jouable : 1er du classement Score Global, cote &gt; 3,8 ET &eacute;cart de Score Global &ge;10 sur le 2e, en cote directe ou &agrave; d&eacute;faut en cote 8h - voir la fiche course pour le d&eacute;tail, et HEBERGEMENT.md pour la m&eacute;thode.</p>
    </div>`;

  if (candidates.length === 0) {
    appEl.innerHTML = `
      ${bilanGlobalLinkHtml}
      ${introHtml}
      <div class="empty-state">
        <div class="icon">\u{1F4B0}</div>
        <p class="bold">Aucune course au Jeu Simple Gagnant rentable pour l'instant</p>
        <p class="muted">Une course appara&icirc;t ici d&egrave;s que son Jeu Simple Gagnant (cotes r&eacute;elles connues) d&eacute;passe le seuil de rentabilit&eacute; de sa tranche de confiance.</p>
      </div>`;
    bindGoto();
    return;
  }

  const filtreHtml = filtreModeSimpleGagnantSelectorHtml();
  const filtreActuel = getFiltreModeSimpleGagnant();

  candidates.sort((a, b) => minutesDepart(a.race.heureDepart) - minutesDepart(b.race.heureDepart));

  // *** aout 2026 *** : "analysees" couvre TOUJOURS la journee entiere (les
  // deux modes confondus), quel que soit le filtre choisi ci-dessus - le
  // filtre ne change QUE la liste de courses affichee plus bas
  // ("analyseesFiltrees"). Le taux de reussite, le bilan financier et le
  // "Transfert bilan" portent donc toujours sur la journee complete (avec
  // le detail par mode calcule a part), pour alimenter fidelement le cumul
  // par mode de la page "Bilan Global Simple Gagnant" - avant cette mise a
  // jour, un filtre laisse sur "1er du classement seul" au moment du
  // transfert aurait silencieusement sauvegarde un bilan partiel.
  const analysees = candidates.map(({ meeting, race, nbPartants, jeu }) => {
    const pool = jeu.recommande;
    const ordreArrivee = CSVImporter.parseOrdreArrivee(race.arriveeBrute || '');
    if (ordreArrivee.length === 0) {
      return { meeting, race, nbPartants, jeu, pool, connu: false, gagne: null, vrai1: null, rapportStatus: 'en_attente', bilan: null };
    }
    const vrai1 = ordreArrivee[0];
    const gagne = pool.chevaux.some((c) => c.entry.numero === vrai1);

    if (!gagne) {
      const bilan = bilanJeuSimpleGagnant(pool, MISE_STANDARD_BILAN_SIMPLE_GAGNANT, undefined, vrai1);
      return { meeting, race, nbPartants, jeu, pool, connu: true, gagne, vrai1, rapportStatus: 'ok', bilan };
    }
    if (race.rapportSimpleGagnant === undefined) {
      return { meeting, race, nbPartants, jeu, pool, connu: true, gagne, vrai1, rapportStatus: 'a_recuperer', bilan: null };
    }
    const bilan = bilanJeuSimpleGagnant(pool, MISE_STANDARD_BILAN_SIMPLE_GAGNANT, race.rapportSimpleGagnant, vrai1);
    if (!bilan.dividendeConnu) {
      return { meeting, race, nbPartants, jeu, pool, connu: true, gagne, vrai1, rapportStatus: 'indisponible', bilan: null };
    }
    return { meeting, race, nbPartants, jeu, pool, connu: true, gagne, vrai1, rapportStatus: 'ok', bilan };
  });

  const analyseesFiltrees = analysees.filter((a) => matchFiltreModeSimpleGagnant(a.jeu.rang1Value, filtreActuel));

  if (analyseesFiltrees.length === 0) {
    appEl.innerHTML = `
      ${bilanGlobalLinkHtml}
      ${introHtml}
      ${filtreHtml}
      <div class="empty-state">
        <div class="icon">\u{1F4B0}</div>
        <p class="bold">Aucune course ne correspond &agrave; ce filtre pour l'instant</p>
        <p class="muted">${candidates.length} course(s) au Jeu Simple Gagnant rentable au total, mais aucune pour le mode s&eacute;lectionn&eacute;. Changez le filtre ci-dessus pour les voir.</p>
      </div>`;
    bindGoto();
    bindFiltreModeSimpleGagnantSelector(renderBilanSimpleGagnant);
    return;
  }

  // Journee complete (tous modes), pour le taux de reussite, le bilan
  // financier et le transfert.
  const avecResultat = analysees.filter((a) => a.connu);
  const reussies = avecResultat.filter((a) => a.gagne);
  const aRecuperer = avecResultat.filter((a) => a.rapportStatus === 'a_recuperer');
  const avecBilan = avecResultat.filter((a) => a.rapportStatus === 'ok');

  // Sous-ensemble filtre (mode choisi ci-dessus), uniquement pour la liste
  // de courses affichee plus bas.
  const avecResultatFiltre = analyseesFiltrees.filter((a) => a.connu);
  const enAttenteFiltre = analyseesFiltrees.filter((a) => !a.connu);

  const tauxHtml = avecResultat.length > 0
    ? `<div class="card" style="text-align:center;">
        <p class="bold" style="font-size:1.6em; margin:0;">${reussies.length}/${avecResultat.length}</p>
        <p class="muted small" style="margin-top:2px;">Pool ayant captur&eacute; le vainqueur r&eacute;el (${Math.round((reussies.length / avecResultat.length) * 100)}%) sur les courses Simple Gagnant rentable avec r&eacute;sultat connu</p>
      </div>`
    : `<div class="card"><p class="muted small">Aucun resultat connu pour l'instant. Utilisez la mise a jour des cotes (course ou reunion complete) pour recuperer automatiquement les arrivees officielles.</p></div>`;

  const bilanGlobal = avecBilan.reduce((acc, a) => ({ mise: acc.mise + a.bilan.mise, gain: acc.gain + a.bilan.gain }), { mise: 0, gain: 0 });
  const netGlobal = bilanGlobal.gain - bilanGlobal.mise;

  const rendementGlobal = rendementBilan({ mise: bilanGlobal.mise, gain: bilanGlobal.gain });

  // *** aout 2026 *** : detail par mode (independant du filtre affiche,
  // toujours sur la journee entiere) - alimente le sous-bilan sauvegarde
  // par "Transfert bilan" ci-dessous, et permet de l'afficher directement
  // ici avant meme de transferer.
  const avecBilanRang1 = avecBilan.filter((a) => a.jeu.rang1Value === true);
  const avecBilan8h = avecBilan.filter((a) => a.jeu.rang1Value === false);
  const bilanRang1 = avecBilanRang1.reduce((acc, a) => ({ mise: acc.mise + a.bilan.mise, gain: acc.gain + a.bilan.gain }), { mise: 0, gain: 0 });
  const bilan8h = avecBilan8h.reduce((acc, a) => ({ mise: acc.mise + a.bilan.mise, gain: acc.gain + a.bilan.gain }), { mise: 0, gain: 0 });
  const netRang1 = bilanRang1.gain - bilanRang1.mise;
  const net8h = bilan8h.gain - bilan8h.mise;

  // Date du bilan transfere = date des REUNIONS concernees (meeting.date),
  // PAS la date du jour ou le transfert est clique - sinon, transferer le
  // bilan de plusieurs journees d'archive le meme jour reel les ecraserait
  // toutes sous la meme entree (id = date). Si les courses avec bilan
  // proviennent de plusieurs jours differents (reunions de plusieurs jours
  // importees simultanement, sans avoir vide entre les deux), impossible de
  // determiner une date unique : le transfert est desactive dans ce cas.
  const datesReunionsAvecBilan = [...new Set(avecBilan.map((a) => new Date(a.meeting.date).toISOString().slice(0, 10)))];
  const dateTransfert = datesReunionsAvecBilan.length === 1 ? datesReunionsAvecBilan[0] : null;

  const bilanHtml = avecResultat.length === 0 ? '' : `
    <div class="card" style="margin-top:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
        <p class="bold" style="margin:0;">Bilan financier (hypoth&eacute;tique) de la journ&eacute;e</p>
        <button class="btn btn-secondary" data-recuperer-rapports ${aRecuperer.length === 0 ? 'disabled' : ''}>R&eacute;cup&eacute;rer les rapports${aRecuperer.length > 0 ? ` (${aRecuperer.length})` : ''}</button>
      </div>
      ${avecBilan.length > 0
        ? `<p class="bold" style="font-size:1.3em; margin:8px 0 0;">${netGlobal >= 0 ? '+' : ''}${netGlobal.toFixed(2)} &euro;</p>
           <p class="muted small" style="margin-top:2px;">Mise ${bilanGlobal.mise.toFixed(2)} &euro; / Gains ${bilanGlobal.gain.toFixed(2)} &euro; (rendement ${rendementGlobal == null ? '-' : (rendementGlobal * 100).toFixed(1) + '%'}) sur ${avecBilan.length} course(s) avec bilan calculable</p>
           <p class="muted small" style="margin-top:6px;">dont 1er du classement seul (cote directe) : <span class="${netRang1 >= 0 ? 'tag-green' : 'tag-red'} bold">${netRang1 >= 0 ? '+' : ''}${netRang1.toFixed(2)} &euro;</span>${avecBilanRang1.length > 0 ? ` (${avecBilanRang1.length} course${avecBilanRang1.length > 1 ? 's' : ''})` : ' (aucune course)'}</p>
           <p class="muted small" style="margin-top:2px;">dont 1er du classement 8h : <span class="${net8h >= 0 ? 'tag-green' : 'tag-red'} bold">${net8h >= 0 ? '+' : ''}${net8h.toFixed(2)} &euro;</span>${avecBilan8h.length > 0 ? ` (${avecBilan8h.length} course${avecBilan8h.length > 1 ? 's' : ''})` : ' (aucune course)'}</p>`
        : `<p class="muted small" style="margin-top:8px;">Cliquez sur "R&eacute;cup&eacute;rer les rapports" pour calculer le bilan financier &agrave; partir des dividendes PMU officiels (Simple Gagnant), sur les courses gagn&eacute;es uniquement (une course rat&eacute;e n'a pas besoin de rapport pour conna&icirc;tre son bilan).</p>`}
      <div id="simple-gagnant-rapports-status"></div>
      ${avecBilan.length > 0 ? `
        ${dateTransfert
          ? `<button class="btn btn-primary btn-block" data-transfert-bilan="${dateTransfert}" style="margin-top:10px;">Transfert bilan (${dateTransfert})</button>
             <div id="transfert-bilan-status"></div>
             ${aRecuperer.length > 0 ? `<p class="muted small" style="margin-top:6px;">${aRecuperer.length} course(s) captur&eacute;e(s) en attente de rapport : le bilan transf&eacute;r&eacute; sera partiel. R&eacute;cup&eacute;rez les rapports avant de transf&eacute;rer pour un bilan complet (retransf&eacute;rer le m&ecirc;me jour remplace l'entr&eacute;e pr&eacute;c&eacute;dente pour CE jour uniquement, sans toucher aux autres jours de l'historique).</p>` : ''}`
          : `<p class="small tag-orange bold" style="margin-top:10px;">Transfert impossible : les courses avec bilan proviennent de plusieurs jours diff&eacute;rents (${datesReunionsAvecBilan.join(', ')}). Videz les r&eacute;unions import&eacute;es et traitez un jour &agrave; la fois pour transf&eacute;rer.</p>`}
      ` : ''}
      <p class="muted small" style="margin-top:8px;">Hypoth&eacute;tique : suppose ${MISE_STANDARD_BILAN_SIMPLE_GAGNANT}&euro; jou&eacute;s (r&eacute;partis en Dutching) sur le Jeu Simple Gagnant de chaque course, sur toutes les courses rentables du jour (tous modes, quel que soit le filtre choisi ci-dessus - qui ne change que la liste affich&eacute;e plus bas) &mdash; ce n'est pas un historique de vos mises reelles. Les courses gagn&eacute;es sans rapport disponible sont exclues du bilan. Ne remplace pas votre propre jugement.</p>
    </div>`;

  const rowHtml = (a) => `
    <div class="list-item clickable" data-goto="race/${a.race.id}">
      <div>
        <div class="bold">${a.race.heureDepart ? `${escapeHtml(a.race.heureDepart)} - ` : ''}${escapeHtml(a.meeting.hippodrome)} - Course ${a.race.numeroCourse}</div>
        <div class="muted small">${libelleModeSimpleGagnant(a.jeu)} (n&deg;${a.pool.chevaux.map((c) => c.entry.numero).join('-')})${a.connu ? ` - Vainqueur n&deg;${a.vrai1}` : ' - En attente de resultat'}</div>
      </div>
      <div style="display:flex; flex-direction:column; align-items:flex-end; gap:2px;">
        ${a.connu
          ? (a.gagne ? '<span class="small tag-green bold">Captur&eacute;</span>' : '<span class="small tag-red bold">Rat&eacute;</span>')
          : '<span class="small tag-gray bold">En attente</span>'}
        ${a.rapportStatus === 'ok' ? `<span class="small ${a.bilan.net >= 0 ? 'tag-green' : 'tag-red'} bold">${a.bilan.net >= 0 ? '+' : ''}${a.bilan.net.toFixed(2)} &euro;</span>` : ''}
        ${a.rapportStatus === 'indisponible' ? '<span class="small tag-gray">Rapport indisponible</span>' : ''}
        ${a.rapportStatus === 'a_recuperer' ? '<span class="small muted">Rapport non recupere</span>' : ''}
      </div>
    </div>`;

  appEl.innerHTML = `
    ${bilanGlobalLinkHtml}
    ${introHtml}
    ${filtreHtml}
    ${tauxHtml}
    ${bilanHtml}
    ${avecResultatFiltre.length > 0 ? `<div class="list-group" style="margin-top:10px;">${avecResultatFiltre.map(rowHtml).join('')}</div>` : ''}
    ${enAttenteFiltre.length > 0 ? `<h3 style="margin-top:16px;">En attente de resultat (${enAttenteFiltre.length})</h3><div class="list-group">${enAttenteFiltre.map(rowHtml).join('')}</div>` : ''}
  `;

  bindGoto();
  bindFiltreModeSimpleGagnantSelector(renderBilanSimpleGagnant);

  // "Transfert bilan" : enregistre le bilan du jour (reussite, mise/gain/net,
  // rendement) dans l'historique manuel (page "Bilan Global Simple Gagnant").
  // Date = date des REUNIONS (meeting.date), PAS la date du jour reel du clic
  // (cf. calcul de dateTransfert plus haut) - un nouveau transfert pour LE
  // MEME jour de reunions ecrase proprement le precedent pour CE jour
  // uniquement (cf. db.js), sans toucher aux autres jours de l'historique.
  //
  // *** aout 2026 *** : en plus du total global (toutes courses rentables
  // du jour), enregistre aussi le sous-bilan de chacun des deux modes
  // ("rang1Seul", "classement8h"), pour alimenter le cumul par mode de
  // la page "Bilan Global Simple Gagnant" - cf. cumulerBilansJournaliers.
  const sousBilanJour = (liste) => {
    const avecBilanOk = liste.filter((a) => a.rapportStatus === 'ok');
    const mise = avecBilanOk.reduce((acc, a) => acc + a.bilan.mise, 0);
    const gain = avecBilanOk.reduce((acc, a) => acc + a.bilan.gain, 0);
    return { nbCourses: liste.length, reussies: liste.filter((a) => a.gagne).length, mise, gain, net: gain - mise };
  };

  const btnTransfert = appEl.querySelector('[data-transfert-bilan]');
  if (btnTransfert && dateTransfert) {
    btnTransfert.addEventListener('click', async () => {
      const statusEl = appEl.querySelector('#transfert-bilan-status');
      // Ne compte que les courses appartenant reellement a dateTransfert
      // (avecResultat peut, en theorie, contenir des courses "a_recuperer"
      // d'un autre jour si plusieurs journees de reunions sont importees
      // simultanement sans avoir ete videes entre les deux).
      const avecResultatDuJour = avecResultat.filter((a) => new Date(a.meeting.date).toISOString().slice(0, 10) === dateTransfert);
      const reussiesDuJour = avecResultatDuJour.filter((a) => a.gagne);
      const rang1DuJour = avecResultatDuJour.filter((a) => a.jeu.rang1Value === true);
      const classement8hDuJour = avecResultatDuJour.filter((a) => a.jeu.rang1Value === false);
      const record = {
        id: dateTransfert,
        date: dateTransfert,
        nbCourses: avecResultatDuJour.length,
        reussies: reussiesDuJour.length,
        mise: bilanGlobal.mise,
        gain: bilanGlobal.gain,
        net: netGlobal,
        transferedAt: new Date().toISOString(),
        rang1Seul: sousBilanJour(rang1DuJour),
        classement8h: sousBilanJour(classement8hDuJour)
      };
      try {
        await DB.saveBilanJournalierSimpleGagnant(record);
        statusEl.innerHTML = `<p class="small tag-green bold" style="margin-top:6px;">Bilan du ${dateTransfert} transf&eacute;r&eacute; (${netGlobal >= 0 ? '+' : ''}${netGlobal.toFixed(2)} &euro;). <a href="#/bilanglobalsimplegagnant">Voir le bilan global</a></p>`;
      } catch (err) {
        console.error('Transfert bilan echoue', err);
        statusEl.innerHTML = `<p class="small tag-red bold" style="margin-top:6px;">Echec du transfert : ${escapeHtml(err.message || String(err))}</p>`;
      }
    });
  }

  // Recuperation des rapports Simple Gagnant/Place, course par course,
  // sequentielle (meme raison que Top base/Resultat : ne pas multiplier les
  // requetes simultanees) - uniquement pour les courses GAGNEES (voir note
  // au-dessus de renderBilanSimpleGagnant).
  const btnRecuperer = appEl.querySelector('[data-recuperer-rapports]');
  if (btnRecuperer && !btnRecuperer.disabled) {
    btnRecuperer.addEventListener('click', async () => {
      const statusEl = appEl.querySelector('#simple-gagnant-rapports-status');
      btnRecuperer.disabled = true;
      let ok = 0;
      let fail = 0;
      for (let i = 0; i < aRecuperer.length; i++) {
        const a = aRecuperer[i];
        statusEl.innerHTML = `<p class="muted small" style="margin-top:8px;">Recuperation rapport ${i + 1}/${aRecuperer.length} (${escapeHtml(a.meeting.hippodrome)} - Course ${a.race.numeroCourse})...</p>`;
        try {
          const dateVal = new Date(a.meeting.date).toISOString().slice(0, 10);
          const json = await fetchRapportsPmu(dateVal, a.meeting.numeroReunion, a.race.numeroCourse);
          if (json) {
            a.race.rapportSimpleGagnant = extraireRapportsSimpleGagnant(json);
            a.race.rapportSimplePlace = extraireRapportsSimplePlace(json);
            await DB.updateRace(a.race);
            ok++;
          } else {
            fail++;
          }
        } catch (err) {
          console.error('Recuperation rapport Bilan Simple Gagnant echouee pour', a.meeting.hippodrome, a.race.numeroCourse, err);
          fail++;
        }
        if (i < aRecuperer.length - 1) await new Promise((resolve) => setTimeout(resolve, 400));
      }
      statusEl.innerHTML = `<p class="muted small" style="margin-top:8px;">Recuperation terminee : ${ok} rapport(s) recupere(s)${fail > 0 ? `, ${fail} echec(s) (reessayez, le bouton ne redemande que les courses encore manquantes)` : ''}.</p>`;
      await renderBilanSimpleGagnant();
    });
  }
}

// -------------------------------------------------------------------
// BILAN GLOBAL SIMPLE GAGNANT (aout 2026, a la demande de l'utilisateur) :
// historique manuel des bilans quotidiens du Jeu Simple Gagnant, alimente
// via le bouton "Transfert bilan" de la page "Bilan Simple Gagnant"
// ci-dessus (un jour = une entree, retransferer le meme jour remplace
// l'entree precedente - cf. js/db.js). Contrairement au "Bilan Simple
// Gagnant" (qui ne montre que les reunions actuellement importees dans
// l'appli), cette page conserve l'historique meme apres avoir vide les
// reunions importees (bouton "Vider les reunions importees", onglet
// Importer) : c'est le seul endroit ou le suivi financier survit d'un jour
// sur l'autre.
// -------------------------------------------------------------------
async function renderBilanGlobalSimpleGagnant() {
  renderTopbar('Bilan Global Simple Gagnant', { back: () => navigate('simplegagnant') });

  const bilans = await DB.getAllBilansJournaliersSimpleGagnant();

  if (bilans.length === 0) {
    appEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">\u{1F4C8}</div>
        <p class="bold">Aucun bilan transf&eacute;r&eacute; pour l'instant</p>
        <p class="muted">Sur la page "Simple Gagnant", une fois le r&eacute;sultat du jour connu, cliquez sur "Transfert bilan" pour l'ajouter ici.</p>
      </div>`;
    return;
  }

  const avecCumul = cumulerBilansJournaliers(bilans).reverse(); // plus recent en premier

  const totalMise = bilans.reduce((acc, b) => acc + b.mise, 0);
  const totalGain = bilans.reduce((acc, b) => acc + b.gain, 0);
  const totalNet = bilans.reduce((acc, b) => acc + b.net, 0);
  const totalNbCourses = bilans.reduce((acc, b) => acc + b.nbCourses, 0);
  const totalReussies = bilans.reduce((acc, b) => acc + b.reussies, 0);
  const rendementTotal = rendementBilan({ mise: totalMise, gain: totalGain });

  // *** aout 2026, a la demande de l'utilisateur *** : en plus du cumul
  // global ci-dessus (tous modes confondus), cumul SEPARE des deux modes de
  // jeu ("1er du classement seul" / "1er du classement 8h"), a partir des
  // sous-bilans `rang1Seul`/`classement8h` sauvegardes par "Transfert
  // bilan" (page "Bilan Simple Gagnant"). Les jours transferes AVANT cette
  // mise a jour n'ont pas ces deux sous-champs : ils comptent normalement
  // dans le cumul global, mais pas dans ces deux cumuls par mode (d'ou
  // l'ecart possible entre le cumul global et la somme des deux ci-dessous
  // sur la periode anterieure - voir la note sous les deux cartes).
  //
  // *** v10 (aout 2026) *** : le champ `classement8h` remplace l'ancien
  // `chevalValueSeul` (mode "Cheval value seul" retire) - les jours transferes
  // AVANT ce renommage continuent de compter dans ce cumul via un repli sur
  // `chevalValueSeul` (continuite du suivi financier, seul le libelle change).
  const modeVide = () => ({ nbCourses: 0, reussies: 0, mise: 0, gain: 0, net: 0 });
  const cumulerMode = (...champs) => bilans.reduce((acc, b) => {
    const champ = champs.find((c) => b[c]);
    const m = (champ ? b[champ] : null) || modeVide();
    return { nbCourses: acc.nbCourses + m.nbCourses, reussies: acc.reussies + m.reussies, mise: acc.mise + m.mise, gain: acc.gain + m.gain, net: acc.net + m.net };
  }, modeVide());
  const totalRang1Seul = cumulerMode('rang1Seul');
  const totalClassement8h = cumulerMode('classement8h', 'chevalValueSeul');
  const rendementRang1Seul = rendementBilan({ mise: totalRang1Seul.mise, gain: totalRang1Seul.gain });
  const rendementClassement8h = rendementBilan({ mise: totalClassement8h.mise, gain: totalClassement8h.gain });
  const joursSansDetailMode = bilans.filter((b) => !b.rang1Seul || (!b.classement8h && !b.chevalValueSeul)).length;

  const carteMode = (titre, t, rendement) => `
    <div class="card" style="text-align:center; flex:1; min-width:200px;">
      <p class="muted small" style="margin:0;">${titre}</p>
      <p class="bold ${t.net >= 0 ? 'tag-green' : 'tag-red'}" style="font-size:1.4em; margin:4px 0;">${t.net >= 0 ? '+' : ''}${t.net.toFixed(2)} &euro;</p>
      <p class="muted small" style="margin:0;">Mise ${t.mise.toFixed(2)} &euro; / Gains ${t.gain.toFixed(2)} &euro; &middot; rendement ${rendement == null ? '-' : (rendement * 100).toFixed(1) + '%'} &middot; r&eacute;ussite ${t.nbCourses > 0 ? `${t.reussies}/${t.nbCourses} (${Math.round((t.reussies / t.nbCourses) * 100)}%)` : '-'}</p>
    </div>`;

  const modesHtml = `
    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:${joursSansDetailMode > 0 ? '4px' : '10px'};">
      ${carteMode('1er du classement seul (cote directe)', totalRang1Seul, rendementRang1Seul)}
      ${carteMode('1er du classement 8h', totalClassement8h, rendementClassement8h)}
    </div>
    ${joursSansDetailMode > 0 ? `<p class="muted small" style="margin:0 0 10px;">${joursSansDetailMode} jour(s) transf&eacute;r&eacute;(s) avant l'ajout de cette r&eacute;partition par mode ne comptent que dans le bilan global ci-dessus, pas dans ces deux cumuls.</p>` : ''}`;

  const globalHtml = `
    <div class="card" style="text-align:center; margin-bottom:10px;">
      <p class="muted small" style="margin:0;">Bilan cumul&eacute; sur ${bilans.length} jour(s) transf&eacute;r&eacute;(s)</p>
      <p class="bold ${totalNet >= 0 ? 'tag-green' : 'tag-red'}" style="font-size:1.8em; margin:4px 0;">${totalNet >= 0 ? '+' : ''}${totalNet.toFixed(2)} &euro;</p>
      <p class="muted small" style="margin:0;">Mise ${totalMise.toFixed(2)} &euro; / Gains ${totalGain.toFixed(2)} &euro; &middot; rendement ${rendementTotal == null ? '-' : (rendementTotal * 100).toFixed(1) + '%'} &middot; r&eacute;ussite ${totalNbCourses > 0 ? `${totalReussies}/${totalNbCourses} (${Math.round((totalReussies / totalNbCourses) * 100)}%)` : '-'}</p>
    </div>`;

  const rowHtml = (b) => {
    const rendementJour = rendementBilan(b);
    return `
    <div class="list-item">
      <div>
        <div class="bold">${escapeHtml(b.date)}</div>
        <div class="muted small">${b.nbCourses > 0 ? `R&eacute;ussite ${b.reussies}/${b.nbCourses} (${Math.round((b.reussies / b.nbCourses) * 100)}%)` : 'Aucune course'} &middot; rendement ${rendementJour == null ? '-' : (rendementJour * 100).toFixed(1) + '%'}</div>
        <div class="muted small">Cumul&eacute; : <span class="${b.cumulNet >= 0 ? 'tag-green' : 'tag-red'}">${b.cumulNet >= 0 ? '+' : ''}${b.cumulNet.toFixed(2)} &euro;</span></div>
      </div>
      <div style="display:flex; flex-direction:column; align-items:flex-end; gap:2px;">
        <span class="small ${b.net >= 0 ? 'tag-green' : 'tag-red'} bold">${b.net >= 0 ? '+' : ''}${b.net.toFixed(2)} &euro;</span>
        <button class="btn btn-secondary" style="padding:2px 10px; font-size:0.8em;" data-supprimer-bilan="${escapeHtml(b.id)}" title="Supprimer ce jour">Suppr.</button>
      </div>
    </div>`;
  };

  appEl.innerHTML = `
    ${globalHtml}
    ${modesHtml}
    <div class="list-group">${avecCumul.map(rowHtml).join('')}</div>
    <p class="muted small" style="margin-top:10px;">Historique manuel, aliment&eacute; jour par jour via le bouton "Transfert bilan" de la page "Simple Gagnant". Bilan hypoth&eacute;tique (mise fixe ${MISE_STANDARD_BILAN_SIMPLE_GAGNANT}&euro;/course, Dutching) - ne remplace pas vos mises r&eacute;elles.</p>
  `;

  appEl.querySelectorAll('[data-supprimer-bilan]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Supprimer le bilan du ${btn.dataset.supprimerBilan} ?`)) return;
      await DB.deleteBilanJournalierSimpleGagnant(btn.dataset.supprimerBilan);
      await renderBilanGlobalSimpleGagnant();
    });
  });
}
