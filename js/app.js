import * as DB from './db.js';
import * as CSVImporter from './engine/csvImporter.js';
import * as RaceAnalyzer from './engine/raceAnalyzer.js';
import { disciplineFromRaw } from './engine/discipline.js';
import { calculerBasesEtDangers, libelleNiveauBase } from './engine/basesEtDangers.js';
import { calculerCotesCibles } from './engine/cotesCibles.js';
import { apparierCotesZeturf } from './engine/zeturfParser.js';
import { fetchCotesPmu, fetchResultatPmu, fetchRapportsPmu, extraireRapportsCoupleGagnant } from './engine/pmuApi.js';

// =============================================================================
// app.js
// Application principale (routeur + rendu). Pas de framework : rendu par
// chaines HTML + delegation d'evenements, pour rester un fichier unique
// facile a heberger sur GitHub Pages / Netlify sans etape de build.
// =============================================================================

const appEl = document.getElementById('app');
const topbarEl = document.getElementById('topbar');
const tabbarEl = document.getElementById('tabbar');

const TABS = [
  { id: 'meetings', label: 'Reunions', icon: '\u{1F3C1}' },
  { id: 'feuvert', label: 'Course feu vert', icon: '\u{1F7E2}' },
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
  const known = ['meetings', 'import', 'feuvert', 'race'];
  if (parts.length === 0) return 'meetings';
  if (parts[0] === 'race') return 'meetings';
  if (parts[0] === 'resultat') return 'feuvert';
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
    <span style="width:60px"></span>
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
    } else if (parts[0] === 'resultat') {
      await renderResultatJournee();
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
// REUNIONS
// -------------------------------------------------------------------
async function renderMeetingsList() {
  renderTopbar('Reunions');
  const meetings = await DB.getAllMeetings();

  if (meetings.length === 0) {
    appEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">\u{1F3C1}</div>
        <p class="bold">Aucune reunion</p>
        <p class="muted">Importez une reunion depuis l'onglet "Importer".</p>
      </div>`;
    return;
  }

  const rows = await Promise.all(meetings.map(async (m) => {
    const races = await DB.getRacesForMeeting(m.id);
    return { m, nbRaces: races.length };
  }));

  appEl.innerHTML = `<div class="list-group">${rows.map(({ m, nbRaces }) => `
    <div class="list-item clickable" data-goto="meetings/${m.id}">
      <div>
        <div class="bold">${escapeHtml(m.hippodrome)}</div>
        <div class="muted small">Reunion ${m.numeroReunion} - ${nbRaces} course(s) - ${new Date(m.date).toLocaleDateString('fr-FR')}</div>
      </div>
      <div class="muted">&rsaquo;</div>
    </div>
  `).join('')}</div>`;

  bindGoto();
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

  const horses = horseRecords.map((h) => ({
    entry: h,
    historique: CSVImporter.historiquePour(h.nom, toutesPerfs)
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

    ${basesEtDangersHtml(basesEtDangers, cotesCibles, result.resume, result.chevaux, context.discipline.canonical)}

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
function couvertureHistoriqueHtml(chevaux) {
  const total = (chevaux || []).length;
  if (total === 0) return '';
  const sansHistorique = chevaux.filter((c) => (c.nbCourses || 0) === 0).length;
  if (sansHistorique === 0) return '';
  const ratio = sansHistorique / total;
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
 * a un retour utilisateur - ce badge et le badge "Course fiable" (cf.
 * estCourseFiable ci-dessous) repondent a des questions DIFFERENTES (l'un
 * juge l'ensemble du peloton, l'autre un cheval precis) et peuvent donc
 * legitimement coexister : sur le backtest reel (3037 courses), 67,6% des
 * courses avec un badge "Course fiable" affichent AUSSI ce badge (n=619)
 * sans que cela nuise a la fiabilite du pick (34,1% de victoires contre
 * 32,0% quand la course est au contraire jugee "logique"). L'ancien libelle
 * "aleatoire" laissait penser a une contradiction avec "fiable" ; voir
 * `noteCoherenceCourseFiableHtml` pour le rappel affiche a l'utilisateur
 * quand les deux badges apparaissent ensemble.
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
 * Rappel affiche quand "Course fiable" et "Course disputee" apparaissent
 * ensemble sur la meme course (cas frequent : 67,6% des "Course fiable" sur
 * le backtest reel, voir estCourseLogique ci-dessus) : les deux badges ne
 * se contredisent pas, ils mesurent des choses differentes.
 */
function noteCoherenceCourseFiableHtml(bd, r, chevaux) {
  const fiable = !!estCourseFiable(bd, chevaux);
  const logique = estCourseLogique(bd, r);
  if (!fiable || logique) return '';
  return '<p class="muted small" style="margin-top:4px;">"Course fiable" et "Course disputée" affichés ensemble : pas de contradiction. "Course fiable" juge UN cheval precis (une base confirmee bien classee) ; "Course disputée" juge l\'ensemble du peloton (beaucoup de chevaux tres joues par le marche et/ou pas d\'ecart net en tete). Sur le backtest reel, ce cas de figure ne nuit pas au pick (34,1% de victoires contre 32,0% en course jugee "logique").</p>';
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
 * effet de petit echantillon (n=24), pas un signal distinct. Cette
 * fonction reste utilisee pour PRIORISER le pick affiche par
 * `estCourseFiable` (elle reste une base tres solide confirmee, ce qui ne
 * fait pas de mal), mais n'est plus presentee comme un niveau de
 * confiance superieur - voir `estCourseFiable`.
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
 * "Course fiable" : synthese de la meilleure methode trouvee, en analysant
 * le backtest reel (2 mois, 1995 courses, voir HEBERGEMENT.md) COURSE PAR
 * COURSE (un seul "pick" par course, pas cheval par cheval), pour repondre
 * a la question "quelle course a la plus grande probabilite de se
 * gagner ?". Un seul niveau (pas de distinction "confiance maximale" vs
 * "base confirmee unique" : sur le grand echantillon, les deux se
 * confondent statistiquement, voir `chevalConfianceMaximale`) :
 *  - Priorite au pick `chevalConfianceMaximale` s'il existe, sinon une
 *    base confirmee UNIQUE (une seule base confirmee dans toute la
 *    course, forte ou simple), classee 1ere ou 2e par le Score Global.
 *  - Ensemble : 33,6% de victoires / 62,7% de Top3 sur 28,8% des courses
 *    (n=574/1995).
 * Note testee et ECARTEE comme niveau de repli supplementaire : utiliser
 * seul le badge "Course logique + Hierarchie claire" en l'absence de base
 * confirmee ne marche pas (22,9% de victoires sur l'echantillon, n=48 -
 * moins bien que le simple favori du modele sans aucun filtre, 25,9%) :
 * ce fallback n'a PAS ete retenu ici.
 * @returns {{pick:Object}|null}
 */
function estCourseFiable(bd, chevaux) {
  const confMax = chevalConfianceMaximale(bd, chevaux);
  if (confMax) return { pick: confMax };

  const confirmees = (bd?.bases || []).filter((b) => b.isConfirme);
  if (confirmees.length === 1) {
    const cheval = (chevaux || []).find((c) => c.entry.numero === confirmees[0].numero);
    if (cheval && (cheval.classement === 1 || cheval.classement === 2)) {
      return { pick: cheval };
    }
  }
  return null;
}

/**
 * Bonus indicatifs (affiches en plus, n'excluent aucune course) : sur le
 * backtest elargi (2 mois, 1995 courses), un petit champ (<=10 partants)
 * et les disciplines Attele/Steeple/Haies sont associes a une bien
 * meilleure fiabilite du badge "Course fiable". Les deux bonus reunis
 * montent a 44,0% de victoires / 66,7% de Top3 (n=84) contre 33,6%/62,7%
 * sans distinction.
 */
function bonusCourseFiable(nbPartants, disciplineCanonique) {
  return {
    petitChamp: nbPartants <= 10,
    disciplineFavorable: disciplineCanonique === 'ATTELE' || disciplineCanonique === 'STEEPLE' || disciplineCanonique === 'HAIES'
  };
}

const COURSE_FIABLE_STATS = '33,6% de victoires, 62,7% de Top3 sur le backtest (n=574, 2 mois, 1995 courses)';

function courseFiableHtml(bd, chevaux, disciplineCanonique) {
  const fiable = estCourseFiable(bd, chevaux);
  if (!fiable) return '';
  const { pick } = fiable;
  const nbPartants = (chevaux || []).length;
  const { petitChamp, disciplineFavorable } = bonusCourseFiable(nbPartants, disciplineCanonique);

  const bonusTags = [
    petitChamp ? '<span class="small tag-green bold">Petit champ</span>' : '',
    disciplineFavorable ? '<span class="small tag-green bold">Discipline favorable</span>' : ''
  ].filter(Boolean).join(' ');

  const bonusNote = (petitChamp && disciplineFavorable)
    ? ' Les deux bonus reunis (petit champ + discipline favorable) montent a 44,0% de victoires / 66,7% de Top3 sur le backtest (n=84).'
    : '';

  return `<div class="card" style="border: 2px solid var(--tag-green, #2e7d32); margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
        <p class="bold" style="margin:0;">&#9989; Course fiable : N&deg;${pick.entry.numero}</p>
        <div>${bonusTags}</div>
      </div>
      <p class="muted small" style="margin-top:4px;">${escapeHtml(COURSE_FIABLE_STATS)}.${bonusNote} Indicatif, n'entre dans aucun calcul de Score Global/Value/classement.</p>
    </div>`;
}

/**
 * Ancre + 5 chevaux candidats, calcul PARTAGE par les deux suggestions
 * "Couplé Gagnant" et "Trio" ci-dessous : quand l'ancre existe
 * (chevalConfianceMaximale - Base très solide confirmée, classée n°1),
 * les 5 AUTRES chevaux les plus adaptes a lui etre associes.
 *
 * Méthode validée sur le backtest réel (4 mois, 4092 courses, voir
 * HEBERGEMENT.md) : parmi plusieurs critères testés pour choisir ces 5
 * chevaux (rang du modèle, Danger, ProbTop3, Convergence), c'est la
 * **Value croissante** (les chevaux les plus joués par le marché, Value
 * la plus négative en premier, hors ancre) qui capture le mieux le(s)
 * partenaire(s) réel(s) du Top2/Top3 - aussi bien pour le Couplé Gagnant
 * (80,1% de réussite quand l'ancre finit Top2, n=482, contre 75,7% avec
 * le rang du modèle) que pour le Trio (59,6% quand l'ancre finit Top3,
 * n=423, contre 55,6% avec le rang du modèle - mesure d'origine sur 3
 * mois, cf. Trio Value avec base ci-dessous pour la version actuelle).
 * Purement indicatif : n'entre dans aucun calcul de Score
 * Global/Value/classement.
 * @returns {{anchor:Object, partenaires:Array}|null}
 */
function candidatsCombinaison(bd, chevaux) {
  const anchor = chevalConfianceMaximale(bd, chevaux);
  if (!anchor) return null;
  const autres = (chevaux || []).filter((c) => c.entry.numero !== anchor.entry.numero);
  const partenaires = [...autres].sort((a, b) => a.value - b.value).slice(0, 5);
  if (partenaires.length === 0) return null;
  return { anchor, partenaires };
}

const COUPLE_GAGNANT_STATS = '80,1% de reussite quand l\'ancre finit Top2 (n=482), 44,5% de Couples Gagnants reussis au global (n=386/867) - backtest 4 mois, 4092 courses';

function suggestionCoupleGagnantHtml(bd, chevaux) {
  const suggestion = candidatsCombinaison(bd, chevaux);
  if (!suggestion) return '';
  const { anchor, partenaires } = suggestion;
  return `<div class="card" style="margin-bottom:10px;">
      <p class="bold" style="margin:0 0 4px;">Suggestion Coupl&eacute; Gagnant (5 chevaux max)</p>
      <p class="small" style="margin:0 0 4px;">Ancre : <span class="tag-green bold">N&deg;${anchor.entry.numero}</span> + un des : ${partenaires.map((p) => `N&deg;${p.entry.numero}`).join(' - ')}</p>
      <p class="muted small" style="margin-top:4px;">${escapeHtml(COUPLE_GAGNANT_STATS)}. Indicatif, n'entre dans aucun calcul de Score Global/Value/classement.</p>
    </div>`;
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

function trioValueAvecBaseHtml(bd, chevaux) {
  const suggestion = trioValueAvecBase(bd, chevaux);
  if (!suggestion) return '';
  const { base, partenaires } = suggestion;
  return `<div class="card" style="margin-bottom:10px;">
      <p class="bold" style="margin:0 0 4px;">Trio Value (avec base)</p>
      <p class="small" style="margin:0 0 4px;">Base : <span class="tag-green bold">N&deg;${base.entry.numero}</span> + 2 des : ${partenaires.map((p) => `N&deg;${p.entry.numero}`).join(' - ')} (10 combinaisons possibles)</p>
      <p class="muted small" style="margin-top:4px;">${escapeHtml(TRIO_VALUE_STATS)}. Indicatif, n'entre dans aucun calcul de Score Global/Value/classement.</p>
    </div>`;
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
function coupleValue(chevaux) {
  const candidats = [...(chevaux || [])].sort((a, b) => a.value - b.value).slice(0, 5);
  if (candidats.length < 2) return null;
  return { candidats };
}

const COUPLE_VALUE_STATS = '57,3% de reussite (les 2 chevaux) pour 10 combinaisons, contre 53,5% pour le Top5 classement a cout egal - capture aussi 93,3% des vrais Danger(s) de la course - backtest 4 mois, 4092 courses';

/**
 * Verifie si la suggestion Coupl&eacute; Value (cf. coupleValue ci-dessus)
 * a effectivement capture les 2 vrais chevaux du Top2 de l'arrivee, pour
 * une course dont le resultat est deja connu. Reprend exactement le meme
 * critere de succes que celui utilise pour mesurer COUPLE_VALUE_STATS sur
 * le backtest (voir HEBERGEMENT.md).
 * @param {Array} chevaux - result.chevaux.
 * @param {number[]} ordreArrivee - ordre d'arrivee (CSVImporter.parseOrdreArrivee).
 * @returns {{reussi:boolean, top2:number[], candidats:Array}|null} null si
 *   l'arrivee est inconnue/incomplete ou si aucune suggestion n'existe.
 */
function coupleValueReussi(chevaux, ordreArrivee) {
  if (!ordreArrivee || ordreArrivee.length < 2) return null;
  const suggestion = coupleValue(chevaux);
  if (!suggestion) return null;
  const top2 = ordreArrivee.slice(0, 2);
  const numerosCandidats = new Set(suggestion.candidats.map((c) => c.entry.numero));
  const reussi = top2.every((n) => numerosCandidats.has(n));
  return { reussi, top2, candidats: suggestion.candidats };
}

// Mise par combinaison retenue pour le bilan financier du Coupl&eacute;
// Value (page Resultat) : 1&euro; par combinaison, choix de l'utilisateur.
// Les 5 candidats du Coupl&eacute; Value forment C(5,2) = 10 combinaisons
// "Coupl&eacute; Gagnant" possibles (paires non ordonnees, comme la regle
// PMU reelle du Coupl&eacute; Gagnant) : la mise totale par course est donc
// 10 &times; MISE_PAR_COMBINAISON_FEU_VERT.
const MISE_PAR_COMBINAISON_FEU_VERT = 1;

/**
 * Bilan financier (hypothetique) du Coupl&eacute; Value pour UNE course,
 * une fois les rapports PMU officiels connus : mise, gain et solde net en
 * jouant MISE_PAR_COMBINAISON_FEU_VERT sur chacune des C(5,2) = 10
 * combinaisons possibles entre les 5 candidats du Coupl&eacute; Value (cf.
 * coupleValue ci-dessus). Le "Coupl&eacute; Gagnant" PMU ne tenant pas
 * compte de l'ordre des 2 chevaux (contrairement au "Coupl&eacute; Ordre"),
 * chaque combinaison est comparee sans ordre au rapport officiel.
 * @param {Array} candidats - les 5 candidats du Coupl&eacute; Value (result.chevaux, tries).
 * @param {Array<{numeros:number[], dividende:number}>} rapports - voir
 *   extraireRapportsCoupleGagnant (js/engine/pmuApi.js) ; `dividende` en
 *   euros pour une mise de 1&euro;.
 * @returns {{mise:number, gain:number, net:number, nbCombinaisons:number}}
 */
function bilanCoupleValue(candidats, rapports) {
  const champ = candidats || [];
  const combos = [];
  for (let i = 0; i < champ.length; i++) {
    for (let j = i + 1; j < champ.length; j++) {
      combos.push([champ[i].entry.numero, champ[j].entry.numero]);
    }
  }
  const mise = combos.length * MISE_PAR_COMBINAISON_FEU_VERT;
  let gain = 0;
  for (const [a, b] of combos) {
    const match = (rapports || []).find((r) =>
      (r.numeros[0] === a && r.numeros[1] === b) || (r.numeros[0] === b && r.numeros[1] === a)
    );
    if (match) gain += match.dividende * MISE_PAR_COMBINAISON_FEU_VERT;
  }
  return { mise, gain, net: gain - mise, nbCombinaisons: combos.length };
}

/**
 * Affiche le rapport officiel PMU du Coupl&eacute; Gagnant (combinaison(s)
 * gagnante(s) reelle(s) + dividende pour 1&euro;), quand il est deja connu
 * (course terminee ET rapport recupere via le bouton "Recuperer les
 * rapports", page Resultat - voir extraireRapportsCoupleGagnant,
 * js/engine/pmuApi.js). Chaine vide si le rapport n'est pas encore connu
 * (course pas terminee, rapport pas encore demande, ou Coupl&eacute;
 * Gagnant non propose par le PMU pour cette course).
 * @param {Array<{numeros:number[], dividende:number}>|undefined} rapports
 * @returns {string}
 */
function rapportCoupleGagnantHtml(rapports) {
  if (!Array.isArray(rapports) || rapports.length === 0) return '';
  const texte = rapports
    .map((r) => `N&deg;${r.numeros[0]}-N&deg;${r.numeros[1]} &rarr; ${r.dividende.toFixed(2)}&euro;`)
    .join(' / ');
  return `<span class="small tag-green bold" title="Rapport officiel PMU pour 1&euro; mise (Coupl&eacute; Gagnant)">Rapport officiel : ${texte}</span>`;
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

function coupleValueHtml(bd, chevaux) {
  const suggestion = coupleValue(chevaux);
  if (!suggestion) return '';
  const { candidats } = suggestion;
  const combos = (candidats.length * (candidats.length - 1)) / 2;
  const score = scoreConfigurationCoupleValue(bd, chevaux);
  const niveau = SCORE_CONFIGURATION_NIVEAUX[score];
  return `<div class="card" style="margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
        <p class="bold" style="margin:0;">Coupl&eacute; Value</p>
        <span class="small ${niveau.cls} bold" title="Score de configuration ${score}/5 - reussite mesuree ${niveau.taux} sur le backtest (n=${niveau.n}, 4 mois, 4092 courses)">${escapeHtml(niveau.label)} (${score}/5)</span>
      </div>
      <p class="small" style="margin:4px 0;">${candidats.length} candidat(s) (Value croissante, tout le champ) : ${candidats.map((c) => `N&deg;${c.entry.numero}`).join(' - ')} (${combos} combinaison${combos > 1 ? 's' : ''} possible${combos > 1 ? 's' : ''} - jamais plus de 10, limite aux 5 premiers)</p>
      <p class="muted small" style="margin-top:4px;">${escapeHtml(COUPLE_VALUE_STATS)}. Indicatif, n'entre dans aucun calcul de Score Global/Value/classement.</p>
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
 *     confirmee, classee n1) -> jouer Coupl&eacute; Gagnant et/ou Trio (cf.
 *     cartes ci-dessous). 39,3% de victoires / 67,5% de Top3 (n=867).
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
 * @returns {{type:'couple_trio', pick:Object, scoreConfig:number}|{type:'simple', pick:Object, scoreConfig:number}|{type:'abstention', raison:'config'|'sans_base', scoreConfig:number}}
 */
function conseilJeu(bd, chevaux) {
  const scoreConfig = scoreConfigurationCoupleValue(bd, chevaux);
  if (scoreConfig < 3) return { type: 'abstention', raison: 'config', scoreConfig };

  const ancre = chevalConfianceMaximale(bd, chevaux);
  if (ancre) return { type: 'couple_trio', pick: ancre, scoreConfig };

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
  couple_trio: '39,3% de victoires, 67,5% de Top3 quand l\'ancre existe (n=867) - backtest 4 mois, 4092 courses',
  simple: '40,7% de victoires, 69,5% de Top3 pour ce type de pick (n=486) - backtest 4 mois, 4092 courses',
  abstention_sans_base: 'Sans Base tres solide, le favori du modele tombe a 20,7%/49,1% (n=2739), et une simple Base solide ne rattrape rien (18,0% de victoires, n=395) - backtest 4 mois, 4092 courses',
  abstention_config: 'Score de configuration du Couplé Value < 3/5 : reussite mesuree 48,3% (n=2335) contre 69,4% quand le score est >= 3/5 (n=1738) - backtest 4 mois, 4092 courses. Contexte de marche trop flou (partants, coupure Value, cote du favori...) pour recommander de jouer, meme si une Base existe'
};

function conseilJeuHtml(bd, chevaux) {
  const conseil = conseilJeu(bd, chevaux);
  let titre, cls, statsKey;
  if (conseil.type === 'couple_trio') {
    titre = 'Jouer : Coupl&eacute; Gagnant et/ou Trio (voir suggestions ci-dessous)';
    cls = 'tag-green';
    statsKey = 'couple_trio';
  } else if (conseil.type === 'simple') {
    titre = `Jouer : Simple gagnant/place sur N&deg;${conseil.pick.entry.numero}`;
    cls = 'tag-green';
    statsKey = 'simple';
  } else {
    titre = 'S\'abstenir de jouer cette course';
    cls = 'tag-red';
    statsKey = conseil.raison === 'config' ? 'abstention_config' : 'abstention_sans_base';
  }
  return `<div class="card" style="margin-bottom:10px; border: 2px solid var(--border);">
      <p class="bold" style="margin:0 0 4px;">Conseil de jeu</p>
      <p class="small ${cls} bold" style="margin:0 0 4px;">${titre}</p>
      <p class="muted small" style="margin-top:4px;">${escapeHtml(CONSEIL_JEU_STATS[statsKey])}. Indicatif, n'entre dans aucun calcul de Score Global/Value/classement.</p>
    </div>`;
}

function basesEtDangersHtml(bd, cotesCibles, r, chevaux, disciplineCanonique) {
  const conseilJeuCard = conseilJeuHtml(bd, chevaux);
  const courseFiable = courseFiableHtml(bd, chevaux, disciplineCanonique);
  const coupleGagnant = suggestionCoupleGagnantHtml(bd, chevaux);
  const trioValue = trioValueAvecBaseHtml(bd, chevaux);
  const coupleValueCard = coupleValueHtml(bd, chevaux);

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
    ${courseFiable}
    ${coupleGagnant}
    ${trioValue}
    ${coupleValueCard}
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h3 style="margin:0;">Base(s) possible(s) &amp; Danger(s)</h3>
        ${annotationCourseHtml(bd, r)}
      </div>
      ${noteCoherenceCourseFiableHtml(bd, r, chevaux)}
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
      <p class="muted small">A garder en tete : sur un echantillon reel de 51 courses (verification manuelle, voir HEBERGEMENT.md), les chevaux "tres joues" (Value tres negatif) ont statistiquement mieux performe que les chevaux "delaisses" (Value tres positif) &mdash; le marche a plus souvent raison que l'ecart de Value ne le suggere. A interpreter avec prudence, pas comme une regle absolue.</p>
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
  const historique = CSVImporter.historiquePour(c.entry.nom, toutesPerfs);

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
      <p class="muted small">Fichier CSV "Performances completes" (16 colonnes). Vient s'ajouter a la base locale de facon cumulative : rien n'est efface.</p>
      <div class="field"><input type="file" id="file-perfs" accept=".csv,text/csv,text/plain"></div>
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
    </div>

    <div id="import-message"></div>
  `;

  document.getElementById('file-reunion').addEventListener('change', (e) => handleReunionImport(e.target.files[0]));
  document.getElementById('file-perfs').addEventListener('change', (e) => handlePerformancesImport(e.target.files[0]));
  document.getElementById('btn-export').addEventListener('click', handleExport);
  document.getElementById('file-backup').addEventListener('change', (e) => handleBackupImport(e.target.files[0]));
  document.getElementById('btn-reset-reunions').addEventListener('click', handleResetReunions);
}

async function handleResetReunions() {
  const ok = confirm('Vider toutes les reunions importees ? L\'historique des performances ne sera pas touche.');
  if (!ok) return;
  await DB.resetReunions();
  showImportMessage('Reunions importees videes.', false);
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

async function handleReunionImport(file) {
  if (!file) return;
  try {
    const csv = await readFileSmart(file);
    const races = CSVImporter.parseReunionComplete(csv);
    if (races.length === 0) { showImportMessage('Aucune course reconnue dans ce fichier.', true); return; }

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
      const meeting = { numeroReunion: numReunion, hippodrome: first.context.lieu };
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

    const message = racesParReunion.size > 1
      ? `${racesParReunion.size} reunions importees : ${resumesReunions.join(', ')} - ${totalHorses} partants au total.`
      : `Reunion importee : ${races.length} course(s), ${totalHorses} partants au total.`;
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
// Value (cf. scoreConfigurationCoupleValue) est >= 3/5, ET dont le nombre
// de partants est compris entre 8 et 16 (a la demande de l'utilisateur -
// les champs en dehors de cette plage sont ecartes de la liste, meme avec
// un bon score). Remplace l'ancienne page "Courses sures" (base solide +
// Score Global >= 80), a la demande de l'utilisateur, par un filtre
// directement aligne sur l'indicateur de confiance du Coupl&eacute; Value.
// -------------------------------------------------------------------
const SEUIL_FEU_VERT = 3;
const MIN_PARTANTS_FEU_VERT = 8;
const MAX_PARTANTS_FEU_VERT = 16;

function nbPartantsAcceptableFeuVert(nbPartants) {
  return nbPartants >= MIN_PARTANTS_FEU_VERT && nbPartants <= MAX_PARTANTS_FEU_VERT;
}

async function renderCourseFeuVert() {
  renderTopbar('Course feu vert');
  const meetings = await DB.getAllMeetings();

  if (meetings.length === 0) {
    appEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">\u{1F7E2}</div>
        <p class="bold">Aucune reunion importee</p>
        <p class="muted">Importez une reunion depuis l'onglet "Importer" pour voir apparaitre ici les courses feu vert.</p>
      </div>`;
    return;
  }

  const toutesPerfs = await DB.getAllPerformances();
  const candidates = [];

  for (const meeting of meetings) {
    const races = await DB.getRacesForMeeting(meeting.id);
    for (const race of races) {
      const horseRecords = await DB.getHorsesForRace(race.id);
      if (horseRecords.length === 0) continue;
      if (!nbPartantsAcceptableFeuVert(horseRecords.length)) continue;

      const horses = horseRecords.map((h) => ({
        entry: h,
        historique: CSVImporter.historiquePour(h.nom, toutesPerfs)
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
      const bd = calculerBasesEtDangers(result.chevaux, context.discipline.canonical);
      const score = scoreConfigurationCoupleValue(bd, result.chevaux);
      if (score < SEUIL_FEU_VERT) continue;

      const suggestion = coupleValue(result.chevaux);
      candidates.push({ meeting, race, score, suggestion, nbPartants: horses.length });
    }
  }

  if (candidates.length === 0) {
    appEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">\u{1F7E2}</div>
        <p class="bold">Aucune course feu vert pour l'instant</p>
        <p class="muted">Une course apparait ici des que son score de configuration du Coupl&eacute; Value atteint ${SEUIL_FEU_VERT}/5, avec entre ${MIN_PARTANTS_FEU_VERT} et ${MAX_PARTANTS_FEU_VERT} partants.</p>
      </div>`;
    return;
  }

  candidates.sort((a, b) => b.score - a.score);

  appEl.innerHTML = `
    <button class="btn btn-secondary btn-block" data-goto="resultat" style="margin-bottom:10px;">Voir la reussite du jour</button>
    <div class="list-group">${candidates.map(({ meeting, race, score, suggestion, nbPartants }) => {
      const niveau = SCORE_CONFIGURATION_NIVEAUX[score];
      return `
      <div class="list-item clickable" data-goto="race/${race.id}">
        <div>
          <div class="bold">${escapeHtml(meeting.hippodrome)} - Course ${race.numeroCourse}</div>
          <div class="muted small">${escapeHtml(race.discipline)} - ${nbPartants} partants</div>
          <div style="margin-top:4px; display:flex; gap:6px; flex-wrap:wrap;">
            <span class="small ${niveau.cls} bold" title="Reussite mesuree ${niveau.taux} sur le backtest (n=${niveau.n}, 4 mois, 4092 courses)">${escapeHtml(niveau.label)} (${score}/5)</span>
            ${suggestion ? `<span class="small tag-blue bold">Coupl&eacute; Value : ${suggestion.candidats.map((c) => `N&deg;${c.entry.numero}`).join('-')}</span>` : ''}
            ${rapportCoupleGagnantHtml(race.rapportCoupleGagnant)}
          </div>
        </div>
        <div class="muted">&rsaquo;</div>
      </div>`;
    }).join('')}</div>
  `;

  bindGoto();
}

// -------------------------------------------------------------------
// RESULTAT (reussite de la journee) : parmi les courses "feu vert" (score
// de configuration Coupl&eacute; Value >= 3/5), quelle proportion a
// effectivement vu ses 2 vrais chevaux du Top2 dans les 5 candidats
// suggeres (cf. coupleValueReussi ci-dessus) - uniquement pour les courses
// dont l'arrivee officielle est deja connue. Les courses feu vert sans
// arrivee connue sont listees a part ("en attente de resultat").
// -------------------------------------------------------------------
async function renderResultatJournee() {
  renderTopbar('Resultat feu vert', { back: () => navigate('feuvert') });
  const meetings = await DB.getAllMeetings();

  if (meetings.length === 0) {
    appEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">\u{1F3AF}</div>
        <p class="bold">Aucune reunion importee</p>
        <p class="muted">Importez une reunion depuis l'onglet "Importer" pour suivre ici la reussite des courses feu vert.</p>
      </div>`;
    return;
  }

  const toutesPerfs = await DB.getAllPerformances();
  const analysees = [];

  for (const meeting of meetings) {
    const races = await DB.getRacesForMeeting(meeting.id);
    for (const race of races) {
      const horseRecords = await DB.getHorsesForRace(race.id);
      if (horseRecords.length === 0) continue;
      if (!nbPartantsAcceptableFeuVert(horseRecords.length)) continue;

      const horses = horseRecords.map((h) => ({
        entry: h,
        historique: CSVImporter.historiquePour(h.nom, toutesPerfs)
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
      const bd = calculerBasesEtDangers(result.chevaux, context.discipline.canonical);
      const score = scoreConfigurationCoupleValue(bd, result.chevaux);
      if (score < SEUIL_FEU_VERT) continue;

      const ordreArrivee = CSVImporter.parseOrdreArrivee(race.arriveeBrute || '');
      const check = coupleValueReussi(result.chevaux, ordreArrivee);

      // rapportStatus distingue 4 cas pour le bilan financier ci-dessous :
      // 'en_attente' (arrivee pas encore connue, pas de rapport possible),
      // 'a_recuperer' (arrivee connue, rapport jamais tente), 'indisponible'
      // (rapport recupere mais le PMU n'a pas ouvert le Coupl&eacute; Gagnant
      // pour cette course - exclue du bilan, non reessayee automatiquement)
      // et 'ok' (rapport disponible, bilan calcule).
      let rapportStatus = 'en_attente';
      let bilan = null;
      if (check) {
        if (race.rapportCoupleGagnant === undefined) {
          rapportStatus = 'a_recuperer';
        } else if (!Array.isArray(race.rapportCoupleGagnant) || race.rapportCoupleGagnant.length === 0) {
          rapportStatus = 'indisponible';
        } else {
          rapportStatus = 'ok';
          bilan = bilanCoupleValue(check.candidats, race.rapportCoupleGagnant);
        }
      }

      analysees.push({ meeting, race, score, check, rapportStatus, bilan });
    }
  }

  if (analysees.length === 0) {
    appEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">\u{1F3AF}</div>
        <p class="bold">Aucune course feu vert pour l'instant</p>
        <p class="muted">Cette page suit la reussite des courses dont le score de configuration Coupl&eacute; Value est >= ${SEUIL_FEU_VERT}/5, avec entre ${MIN_PARTANTS_FEU_VERT} et ${MAX_PARTANTS_FEU_VERT} partants.</p>
      </div>`;
    return;
  }

  const avecResultat = analysees.filter((a) => a.check != null);
  const enAttente = analysees.filter((a) => a.check == null);
  const reussies = avecResultat.filter((a) => a.check.reussi);
  const aRecuperer = avecResultat.filter((a) => a.rapportStatus === 'a_recuperer');
  const avecBilan = avecResultat.filter((a) => a.rapportStatus === 'ok');

  const tauxHtml = avecResultat.length > 0
    ? `<div class="card" style="text-align:center;">
        <p class="bold" style="font-size:1.6em; margin:0;">${reussies.length}/${avecResultat.length}</p>
        <p class="muted small" style="margin-top:2px;">Coupl&eacute; Value reussi (${Math.round((reussies.length / avecResultat.length) * 100)}%) sur les courses feu vert (score >= ${SEUIL_FEU_VERT}/5) avec resultat connu</p>
      </div>`
    : `<div class="card"><p class="muted small">Aucun resultat connu pour l'instant parmi les courses feu vert. Utilisez la mise a jour des cotes (course ou reunion complete) pour recuperer automatiquement les arrivees officielles.</p></div>`;

  const bilanGlobal = avecBilan.reduce((acc, a) => ({ mise: acc.mise + a.bilan.mise, gain: acc.gain + a.bilan.gain }), { mise: 0, gain: 0 });
  const netGlobal = bilanGlobal.gain - bilanGlobal.mise;

  const bilanHtml = avecResultat.length === 0 ? '' : `
    <div class="card" style="margin-top:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
        <p class="bold" style="margin:0;">Bilan financier (hypoth&eacute;tique) Coupl&eacute; Value</p>
        <button class="btn btn-secondary" data-recuperer-rapports ${aRecuperer.length === 0 ? 'disabled' : ''}>R&eacute;cup&eacute;rer les rapports${aRecuperer.length > 0 ? ` (${aRecuperer.length})` : ''}</button>
      </div>
      ${avecBilan.length > 0
        ? `<p class="bold" style="font-size:1.3em; margin:8px 0 0;">${netGlobal >= 0 ? '+' : ''}${netGlobal.toFixed(2)} &euro;</p>
           <p class="muted small" style="margin-top:2px;">Mise ${bilanGlobal.mise.toFixed(2)} &euro; / Gains ${bilanGlobal.gain.toFixed(2)} &euro; sur ${avecBilan.length} course(s) avec rapport disponible</p>`
        : `<p class="muted small" style="margin-top:8px;">Cliquez sur "R&eacute;cup&eacute;rer les rapports" pour calculer le bilan financier &agrave; partir des dividendes PMU officiels (Coupl&eacute; Gagnant).</p>`}
      <div id="rapports-status"></div>
      <p class="muted small" style="margin-top:8px;">Hypoth&eacute;tique : suppose ${MISE_PAR_COMBINAISON_FEU_VERT}&euro; jou&eacute; sur CHACUNE des 10 combinaisons Coupl&eacute; Gagnant possibles entre les 5 candidats du Coupl&eacute; Value, sur toutes les courses feu vert du jour &mdash; ce n'est pas un historique de vos mises reelles. Les courses o&ugrave; le PMU n'a pas propose le Coupl&eacute; Gagnant (champ trop reduit une fois les non-partants retires, etc.) sont exclues du bilan, faute de rapport officiel disponible. Ne remplace pas votre propre jugement.</p>
    </div>`;

  const rowHtml = (a) => `
    <div class="list-item clickable" data-goto="race/${a.race.id}">
      <div>
        <div class="bold">${escapeHtml(a.meeting.hippodrome)} - Course ${a.race.numeroCourse}</div>
        <div class="muted small">Score ${a.score}/5${a.check ? ` - Arrivee ${a.check.top2.join('-')}` : ' - En attente de resultat'}</div>
      </div>
      <div style="display:flex; flex-direction:column; align-items:flex-end; gap:2px;">
        ${a.check
          ? (a.check.reussi ? '<span class="small tag-green bold">Reussi</span>' : '<span class="small tag-red bold">Rate</span>')
          : '<span class="small tag-gray bold">En attente</span>'}
        ${a.rapportStatus === 'ok' ? `<span class="small ${a.bilan.net >= 0 ? 'tag-green' : 'tag-red'} bold">${a.bilan.net >= 0 ? '+' : ''}${a.bilan.net.toFixed(2)} &euro;</span>` : ''}
        ${a.rapportStatus === 'indisponible' ? '<span class="small tag-gray">Coupl&eacute; Gagnant indisponible</span>' : ''}
        ${a.rapportStatus === 'a_recuperer' ? '<span class="small muted">Rapport non recupere</span>' : ''}
      </div>
    </div>`;

  appEl.innerHTML = `
    ${tauxHtml}
    ${bilanHtml}
    ${avecResultat.length > 0 ? `<div class="list-group" style="margin-top:10px;">${avecResultat.map(rowHtml).join('')}</div>` : ''}
    ${enAttente.length > 0 ? `<h3 style="margin-top:16px;">En attente de resultat (${enAttente.length})</h3><div class="list-group">${enAttente.map(rowHtml).join('')}</div>` : ''}
  `;

  bindGoto();

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
            a.race.rapportCoupleGagnant = extraireRapportsCoupleGagnant(json);
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
