import * as DB from './db.js';
import * as CSVImporter from './engine/csvImporter.js';
import * as RaceAnalyzer from './engine/raceAnalyzer.js';
import { disciplineFromRaw } from './engine/discipline.js';
import { calculerBasesEtDangers, libelleNiveauBase } from './engine/basesEtDangers.js';
import { calculerCotesCibles } from './engine/cotesCibles.js';
import { apparierCotesZeturf } from './engine/zeturfParser.js';
import { fetchCotesPmu, fetchResultatPmu } from './engine/pmuApi.js';

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
  { id: 'sure', label: 'Courses sures', icon: '\u{2705}' },
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
  const known = ['meetings', 'import', 'sure', 'race'];
  if (parts.length === 0) return 'meetings';
  if (parts[0] === 'race') return 'meetings';
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
    } else if (parts[0] === 'sure') {
      await renderCoursesSures();
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

  appEl.innerHTML = `<div class="list-group">${rows.map(({ r, nb }) => `
    <div class="list-item clickable" data-goto="race/${r.id}">
      <div>
        <div class="bold">Course ${r.numeroCourse} - ${escapeHtml(r.discipline)}</div>
        <div class="muted small">${nb} partants - ${Math.round(r.distanceJour)} m - depart ${escapeHtml(r.heureDepart || '')}</div>
        ${(nb < 9 || nb > 16) ? '<div class="small tag-orange">Nombre de partants inhabituel pour le modele (9 a 16 attendus)</div>' : ''}
      </div>
      <div class="muted">&rsaquo;</div>
    </div>
  `).join('')}</div>`;

  bindGoto();
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

    <div class="list-group">
      ${result.chevaux.map((c) => horseRowHtml(c, raceId)).join('')}
    </div>

    <button class="btn btn-secondary btn-block" data-zeturf style="margin-top:8px;">Mettre a jour les cotes en direct</button>
    <div id="zeturf-status"></div>

    ${basesEtDangersHtml(basesEtDangers, cotesCibles, result.resume)}

    ${resumeHtml(result.resume, basesEtDangers, cotesCibles, result.chevaux)}

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

function horseRowHtml(c, raceId) {
  const cotePourAffichage = c.entry.coteDirecte > 0 ? c.entry.coteDirecte : (c.entry.cote8h > 0 ? c.entry.cote8h : null);
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

// Seuil du croisement "course logique / course aléatoire" ci-dessous.
const SEUIL_MAX_DANGERS = 5; // <= 5 dangers toleres

/**
 * Determine si une course est "logique" (arrivee plausible/previsible) ou
 * "aléatoire" (compliquee a trouver), en croisant trois signaux deja
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
 * Les 3 doivent etre reunis pour "Course logique" ; sinon "Course aléatoire".
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
    : '<span class="small tag-orange bold">Course aléatoire</span>';
}

/**
 * Course sure = base solide/tres solide ET au moins un cheval >= 80 de
 * Score Global ET course jugee "logique" (cf. estCourseLogique ci-dessus) —
 * une course aléatoire n'est jamais retenue, meme si elle a par ailleurs une
 * base et un bon score.
 */
function estCourseSure(bd, chevaux, r) {
  return (bd?.bases?.length > 0)
    && (chevaux || []).some((c) => c.scoreGlobal >= 80)
    && estCourseLogique(bd, r);
}

function basesEtDangersHtml(bd, cotesCibles, r) {
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
      <div style="margin: 10px 0; border-top: 1px solid var(--border);"></div>
      <p class="bold small" style="margin-bottom:4px;">Danger(s)</p>
      ${dangerHtml}
      <p class="muted small" style="margin-top:8px;">Danger(s) = cheval très joué par le marché (Value &lt; -10%, cote &lt;= 50) mais non retenu comme base : à surveiller comme trouble-fête potentiel.</p>
      ${cotesCiblesHtml}
    </div>
  `;
}

function categorieLine(label, items) {
  const txt = items.length === 0 ? '&mdash;' : items.map((i) => `${i.numero} (${fmt0(i.value)}%)`).join(' - ');
  return `<div class="resume-line"><div class="label">${label}</div><div>${txt}</div></div>`;
}

function combinaisonsSuggereesHtml(bd, cotesCibles, r, chevaux) {
  const basesNums = (bd?.bases || []).map((b) => b.numero);
  const dangerNums = bd?.danger || [];
  const ccNums = (cotesCibles || []).filter((cc) => cc.horse).map((cc) => cc.horse.numero);
  const trioNums = [...new Set([...basesNums, ...dangerNums, ...ccNums])];

  // Meilleur outsider (place 4 a 8, cf. RaceAnalyzer.buildSummary : r.outsiders
  // = numeros classes 4e a 8e, dans l'ordre ; le meilleur est donc le 1er).
  const meilleurOutsider = (r?.outsiders || [])[0];
  const outsiderAAfficher = (meilleurOutsider != null && !trioNums.includes(meilleurOutsider)) ? meilleurOutsider : null;

  const line = (label, nums) => `<div class="resume-line"><div class="label">${label}</div><div>${nums.length ? nums.join(' - ') : '&mdash;'}</div></div>`;

  // Valeur des couples : associe chaque base confirmee ("Simple gagnant/place
  // (la Base)" ci-dessus) a chaque cheval du groupe Trio juste en dessous,
  // et calcule (cote Base x cote autre) / 2 pour chaque paire - cf.
  // RaceAnalyzer.calculerValeurCouples pour le detail de la methode.
  const valeurCouples = chevaux ? RaceAnalyzer.calculerValeurCouples(chevaux, basesNums, trioNums) : [];

  return `
      <div style="margin: 10px 0; border-top: 1px solid var(--border);"></div>
      <p class="bold small">Combinaisons suggerees</p>
      ${line('Simple gagnant/place (la Base)', basesNums)}
      ${line('Couple gagnant/place (les Danger(s))', dangerNums)}
      ${line('Trio (Base(s)/Danger(s) + cote(s) cible(s))', trioNums)}
      ${outsiderAAfficher != null ? `<div class="resume-line"><div class="label">Meilleur outsider (place 4 a 8)</div><div>${outsiderAAfficher}</div></div>` : ''}
      ${r?.multi7 ? `<div class="resume-line"><div class="label">Multi 7</div><div>${r.multi7.join(' - ')}</div></div>` : ''}
      ${basesNums.length > 0 ? `<div class="resume-line"><div class="label">Valeur des couples</div><div>${valeurCouples.length > 0
        ? valeurCouples.map((c) => `N&deg;${c.baseNumero}-N&deg;${c.autreNumero} (~${c.valeur.toFixed(2)}&euro;)`).join(', ')
        : '&mdash;'}</div></div>` : ''}
  `;
}

function resumeHtml(r, bd, cotesCibles, chevaux) {
  const auMoinsUneBase = (bd?.bases || []).length > 0;
  return `
    <div class="card">
      <h3>Pronostic suggere</h3>
      <div class="resume-line"><div class="label">Bases (Top 3)</div><div>${r.bases.join(' - ')}</div></div>
      ${r.outsiders.length ? `<div class="resume-line"><div class="label">Outsiders</div><div>${r.outsiders.join(' - ')}</div></div>` : ''}
      ${categorieLine('Anormalement delaisse', r.anormalementDelaisses)}
      ${categorieLine('Cote logique', r.coteLogique)}
      ${categorieLine('Plus joue', r.plusJoue)}
      ${categorieLine('Tres joue, mefiance', r.tresJoueMefiance)}
      ${combinaisonsSuggereesHtml(bd, cotesCibles, r, chevaux)}

      <div style="margin: 10px 0; border-top: 1px solid var(--border);"></div>
      <div class="resume-line"><div class="label">Indice de confiance</div><div>${fmt1(r.indiceConfiance)} / 100 - ${r.lisibiliteCourse}</div></div>
      ${(r.ecartTop3Vs4eme != null) ? `<div class="resume-line"><div class="label">Ecart Top3 / 4e</div><div>${fmt1(r.ecartTop3Vs4eme)} pts - ${r.hierarchie}</div></div>` : ''}
      <div class="resume-line"><div class="label">Confiance (proba Top3)</div><div>${fmt1(r.confianceProbaTop3)}%</div></div>
      ${r.chevalLePlusSur ? `<div class="resume-line"><div class="label">Cheval le plus sur</div><div>N&deg;${r.chevalLePlusSur.numero} (${fmt1(r.chevalLePlusSur.probTop3)}% Top3, marge ${fmt1(r.chevalLePlusSur.marge)} pts)</div></div>` : ''}

      <p class="muted small" style="margin-top:10px;">Value &gt; +20% = cheval sous-cote (opportunite) &middot; Value &lt; -20% = sur-cote (mefiance). Proba Top3 estimee par modele Plackett-Luce a partir du Score Global.</p>
      ${auMoinsUneBase ? '<p class="muted small">Valeur des couples : (cote Base &times; cote autre) / 2 pour chaque base confirmee associee a un cheval du Trio (Base(s)/Danger(s)/cote(s) cible(s)) &mdash; methode terrain simple et independante du modele de score, a titre indicatif.</p>' : ''}
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
      <p class="muted small">Fichier CSV "Reunion complete" : une ligne par cheval par course, 76 colonnes (meme format que celui utilise aujourd'hui pour remplir Excel).</p>
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

    const first = races[0];
    const meeting = { numeroReunion: first.context.numeroReunion, hippodrome: first.context.lieu };
    const racesToSave = races.map((r) => ({
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

    const totalHorses = races.reduce((a, r) => a + r.horses.length, 0);
    showImportMessage(`Reunion importee : ${races.length} course(s), ${totalHorses} partants au total.`, false);
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
// COURSES SURES : courses avec au moins une base solide/tres solide ET au
// moins un cheval avec un Score Global >= 80 (toutes reunions importees).
// -------------------------------------------------------------------
async function renderCoursesSures() {
  renderTopbar('Courses sures');
  const meetings = await DB.getAllMeetings();

  if (meetings.length === 0) {
    appEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">\u{2705}</div>
        <p class="bold">Aucune reunion importee</p>
        <p class="muted">Importez une reunion depuis l'onglet "Importer" pour voir apparaitre ici les courses les plus sures.</p>
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

      if (estCourseSure(bd, result.chevaux, result.resume)) {
        const meilleurScore = Math.max(...result.chevaux.map((c) => c.scoreGlobal));
        candidates.push({ meeting, race, bd, r: result.resume, meilleurScore });
      }
    }
  }

  if (candidates.length === 0) {
    appEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">\u{2705}</div>
        <p class="bold">Aucune course sure pour l'instant</p>
        <p class="muted">Une course apparait ici des qu'elle a une base solide ou tres solide ET au moins un cheval avec un Score Global >= 80.</p>
      </div>`;
    return;
  }

  candidates.sort((a, b) => b.meilleurScore - a.meilleurScore);

  appEl.innerHTML = `<div class="list-group">${candidates.map(({ meeting, race, bd, r, meilleurScore }) => `
    <div class="list-item clickable" data-goto="race/${race.id}">
      <div>
        <div class="bold">${escapeHtml(meeting.hippodrome)} - Course ${race.numeroCourse}</div>
        <div class="muted small">${escapeHtml(race.discipline)} - Base(s) ${bd.bases.map((b) => `N&deg;${b.numero}`).join(', ')} - Meilleur score ${fmt1(meilleurScore)}</div>
        <div style="margin-top:4px;">${annotationCourseHtml(bd, r)}</div>
      </div>
      <div class="muted">&rsaquo;</div>
    </div>
  `).join('')}</div>`;

  bindGoto();
}
