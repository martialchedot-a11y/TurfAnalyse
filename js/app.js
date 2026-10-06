import * as DB from './db.js';
import * as CSVImporter from './engine/csvImporter.js';
import * as RaceAnalyzer from './engine/raceAnalyzer.js';
import { disciplineFromRaw } from './engine/discipline.js';
import { calculerBasesEtDangers, libelleNiveauBase } from './engine/basesEtDangers.js';
import { calculerCotesCibles } from './engine/cotesCibles.js';
import { apparierCotesZeturf } from './engine/zeturfParser.js';
import { fetchCotesPmu, fetchResultatPmu, fetchRapportsPmu, extraireRapportsSimpleGagnant, extraireRapportsSimplePlace, extraireRapportsCoupleGagnant, extraireRapportsTrio } from './engine/pmuApi.js';
import { misesJeuSimpleGagnant, MISES_PRESETS_JEU_SIMPLE_GAGNANT, rendementBilan, cumulerBilansJournaliers, SEUIL_VALUE_SIMPLE_GAGNANT, multiplicateurMiseJoursAbsenceRang1, SEUIL_JOURS_ABSENCE_MISE_RENFORCEE } from './engine/jeuSimpleGagnant.js';
import { jeuSimpleGP, bilanJourSimpleGP } from './engine/jeuSimpleGP.js';
import { estDansFenetreAvantDepart, estAujourdHui } from './engine/surveillance.js';
import { parseTopIAPlace, trouverRangIAPlace, normaliserHippodromeIA } from './engine/topIAPlaceParser.js';
import { COTE_MIN_NOUVEAU_D4, COTE_MAX_NOUVEAU_D4, cleCheval, estTrot, jourDe, extraireFerrures, indexerFerrures, ferrurePrecedente, statutNouveauD4, libelleFerrure, normaliserFerrure } from './engine/nouveauD4.js';
import { SELECTIONS, ORDRE_SELECTIONS, RANG_COTE_MAX_D4, SEUIL_VALUE_D4, affinerNouveauD4, resultatJeu, bilanHistorique } from './engine/jeuxDuJour.js';
import { parsePopularite, selectionFavoriPopulaire, cleFavori, normaliserNomCheval, top5IAPlaceDepuisPopularite } from './engine/favoriPopulaire.js';
import { fetchCotesTurfBzh, fetchRapportsTurfBzh, fetchCoteBzhParPartant, fetchJourneePartantsBzh, _diagnosticCoteBzh } from './engine/turfBzhApi.js';
import { REGLE_TROT_GF, evaluerRegleTrotGF, choisirGainsCourse, ageDepuisSexeAge, estDisciplineTrot, bilanRegleTrotGF } from './engine/regleTrotGF.js';

// =============================================================================
// app.js
// Application principale (routeur + rendu). Pas de framework : rendu par
// chaines HTML + delegation d'evenements, pour rester un fichier unique
// facile a heberger sur GitHub Pages / Netlify sans etape de build.
// =============================================================================

const appEl = document.getElementById('app');
const topbarEl = document.getElementById('topbar');
const tabbarEl = document.getElementById('tabbar');

/**
 * Charge le snapshot "Top IA Place" du jour importe (cf.
 * js/engine/topIAPlaceParser.js), s'il existe - remplace (sept. 2026, a la
 * demande explicite de l'utilisateur) les anciens modules "Predictions
 * externes" et "Ecarts Jockeys/Entraineurs". Purement informatif : n'entre
 * dans aucun calcul de Score Global/Value/classement/dominance MX+OR+MA.
 * @returns {Promise<Array|null>} lignes du Top 5 IA Place (rang 1 a 5), ou
 *   `null` si rien n'a ete importe.
 */
async function chargerTopIAPlace() {
  const enregistrement = await DB.getTopIAPlace();
  const rowsExport = enregistrement && Array.isArray(enregistrement.rows) && enregistrement.rows.length > 0 ? enregistrement.rows : null;
  // v127 (a la demande de l'utilisateur) : le fichier Popularite suffit a
  // reconstituer le Top 5 IA Place (identique a l'export premium, verifie
  // sur 32 jours). On l'utilise des qu'il est importe, sauf si un export
  // premium du meme jour ou plus recent est aussi en base (il reste alors
  // prioritaire).
  const pop = await chargerPopularite();
  if (!pop) return rowsExport;
  const jourDe = (d) => { try { return new Date(d).toISOString().slice(0, 10); } catch { return ''; } };
  const jourPop = jourDe(pop.dateVal);
  if (rowsExport && jourDe(enregistrement.dateVal) >= jourPop) return rowsExport;
  return topIAPlaceDepuisPopularite(pop, jourPop);
}

let cacheTopIAPopularite = { cle: null, rows: null };

/**
 * Top 5 IA Place deduit du fichier Popularite, au format attendu par
 * `trouverRangIAPlace` (hippodrome + numero de course + numero de cheval).
 * Le fichier Popularite ne donne pas l'hippodrome : il est retrouve en
 * rapprochant chaque cheval du Top 5 d'une reunion importee du MEME jour
 * (nom + numero de course + numero de cheval). Un cheval du Top 5 dont la
 * course n'est pas importee est simplement absent du resultat (il ne
 * pourrait de toute facon correspondre a aucune course affichee). Resultat
 * memorise tant que ni le fichier ni la liste des reunions ne changent.
 */
async function topIAPlaceDepuisPopularite(pop, jourPop) {
  const top5 = top5IAPlaceDepuisPopularite(pop.rows);
  if (top5.length === 0) return null;
  const meetings = (await DB.getAllMeetings()).filter((m) => new Date(m.date).toISOString().slice(0, 10) === jourPop);
  const cle = `${pop.importedAt}|${meetings.map((m) => m.id).join(',')}`;
  if (cacheTopIAPopularite.cle === cle) return cacheTopIAPopularite.rows;
  const parNom = new Map(top5.map((r) => [`${r.nomNorm}|${r.course}|${r.numero}`, r]));
  const rows = [];
  const vus = new Set();
  for (const meeting of meetings) {
    for (const race of await DB.getRacesForMeeting(meeting.id)) {
      for (const h of await DB.getHorsesForRace(race.id)) {
        const r = parNom.get(`${normaliserNomCheval(h.nom)}|${race.numeroCourse}|${h.numero}`);
        if (!r || vus.has(r.rang)) continue;
        vus.add(r.rang);
        const lieu = race.lieu || meeting.hippodrome || '';
        rows.push({
          rang: r.rang, date: jourPop, hippodrome: lieu, hippodromeNorm: normaliserHippodromeIA(lieu), heure: race.heureDepart || '',
          course: race.numeroCourse, numero: h.numero, partants: null, cheval: r.cheval, jockey: '',
          pctIAGagnant: r.iaGagnant, pctIAPlace: r.iaPlace, discipline: r.discipline, arrivee: '', cotePmu: r.cote
        });
      }
    }
  }
  rows.sort((a, b) => a.rang - b.rang);
  const resultat = rows.length > 0 ? rows : null;
  cacheTopIAPopularite = { cle, rows: resultat };
  return resultat;
}

/**
 * Recupere les cotes en direct d'une course en essayant D'ABORD l'API
 * turf.bzh (source officielle et documentee - voir js/engine/turfBzhApi.js),
 * si le proxy externe est configure, et ne se replie sur l'ancienne cascade
 * PMU.fr (js/engine/pmuApi.js, `fetchCotesPmu`) QUE si turf.bzh ne repond
 * pas (proxy non configure, panne, ou aucune cote exploitable). Meme forme
 * de retour dans les deux cas ({numero, cote, nom}), donc substituable sans
 * aucun changement aux 3 points d'appel existants (mise a jour 1 clic sur
 * une course, sur toute la reunion, et surveillance auto). fetchCotesPmu
 * levant une exception en cas d'echec total (contrairement a turf.bzh qui
 * renvoie null), on ne l'appelle qu'en repli, jamais en parallele.
 * @param {Date|string} date
 * @param {number} numReunion
 * @param {number} numCourse
 * @returns {Promise<Array<{numero:number, cote:number|null, nom:string}>>}
 */
async function fetchCotesAvecFallback(date, numReunion, numCourse) {
  const viaTurfBzh = await fetchCotesTurfBzh(date, numReunion, numCourse);
  if (viaTurfBzh) return viaTurfBzh;
  return fetchCotesPmu(date, numReunion, numCourse);
}

/**
 * Recupere les rapports officiels d'une course en essayant D'ABORD l'API
 * turf.bzh (voir fetchCotesAvecFallback ci-dessus pour le meme principe), et
 * se replie sur `fetchRapportsPmu` (PMU.fr) si turf.bzh ne repond pas. Le
 * JSON turf.bzh est deja normalise a la meme forme que celui de PMU (voir
 * `normaliserRapportsTurfBzh`), donc les extracteurs existants
 * (extraireRapportsSimpleGagnant/SimplePlace/CoupleGagnant/Trio) fonctionnent
 * sans changement quelle que soit la source utilisee. Ne leve jamais
 * d'exception (meme contrat que fetchRapportsPmu) : renvoie `null` si aucune
 * des deux sources n'a de rapports disponibles.
 * @param {Date|string} date
 * @param {number} numReunion
 * @param {number} numCourse
 * @returns {Promise<Array|null>}
 */
async function fetchRapportsAvecFallback(date, numReunion, numCourse) {
  const viaTurfBzh = await fetchRapportsTurfBzh(date, numReunion, numCourse);
  if (viaTurfBzh) return viaTurfBzh;
  return fetchRapportsPmu(date, numReunion, numCourse);
}

/**
 * Charge le snapshot "Popularite" du jour importe (fichier
 * "Popularite_chevaux_AAAAMMJJ.xlsx", cf. js/engine/favoriPopulaire.js) -
 * oct. 2026, a la demande explicite de l'utilisateur. Remplace l'import
 * "Supplementation PMU" (retire en v126).
 * @returns {Promise<{dateVal:string, rows:Array}|null>}
 */
async function chargerPopularite() {
  const e = await DB.getPopularite();
  return e && Array.isArray(e.rows) && e.rows.length > 0 ? e : null;
}

/**
 * Calcule la regle "Favori populaire" (favori + le plus populaire + n. 1 IA
 * Gagnant de sa course ; selection du jour = plus petite cote) a partir du
 * fichier Popularite importe. Les chevaux retrouves dans une reunion
 * importee DU MEME JOUR (rapprochement par nom + numero de course + numero
 * de cheval - la numerotation des reunions Turf BZH ne correspond pas
 * toujours a la notre, cf. topIAPlaceParser.js) utilisent leur cote directe
 * a jour a la place de la cote du fichier, et sont cliquables.
 * @returns {Promise<null|{qualifies:Array, selection:Object|null, nbCourses:number,
 *   liens:Map<string,{raceId:string, horseId:string, hippodrome:string, heureDepart:string}>, jour:string}>}
 */
async function calculerFavoriPopulaire() {
  const pop = await chargerPopularite();
  if (!pop) return null;
  const jour = new Date(pop.dateVal).toISOString().slice(0, 10);
  const parNom = new Map();
  for (const r of pop.rows) parNom.set(`${r.nomNorm}|${r.course}|${r.numero}`, r);
  const cotes = new Map();
  const liens = new Map();
  const meetings = (await DB.getAllMeetings()).filter((m) => new Date(m.date).toISOString().slice(0, 10) === jour);
  for (const meeting of meetings) {
    const races = await DB.getRacesForMeeting(meeting.id);
    for (const race of races) {
      const horses = await DB.getHorsesForRace(race.id);
      for (const h of horses) {
        const r = parNom.get(`${normaliserNomCheval(h.nom)}|${race.numeroCourse}|${h.numero}`);
        if (!r) continue;
        const cle = cleFavori(r);
        // getAllMeetings est trie du plus recent au plus ancien : en cas de
        // reimport de la meme reunion, on garde la copie la plus recente.
        if (liens.has(cle)) continue;
        liens.set(cle, { raceId: race.id, horseId: h.id, hippodrome: meeting.hippodrome || race.lieu || '', heureDepart: race.heureDepart || '' });
        if (h.coteDirecte > 0) cotes.set(cle, h.coteDirecte);
      }
    }
  }
  return { ...selectionFavoriPopulaire(pop.rows, { cotes }), liens, jour };
}

/**
 * Carte "Favori populaire" affichee en haut de "Courses du jour". Chaine
 * vide si le fichier Popularite n'a pas ete importe.
 */
function carteFavoriPopulaireHtml(fp) {
  if (!fp) return '';
  const dateTxt = new Date(fp.jour).toLocaleDateString('fr-FR');
  const ligne = (q, principal) => {
    const lien = fp.liens.get(cleFavori(q));
    const lieu = lien && lien.hippodrome ? `${escapeHtml(lien.hippodrome)} - ` : '';
    const heure = lien && lien.heureDepart ? `${escapeHtml(lien.heureDepart)} - ` : '';
    const ecart = q.secondeCote > 0 ? ` &middot; 2e cote ${fmt1(q.secondeCote)}` : '';
    const source = q.coteSource === 'directe' ? 'cote directe' : 'cote du fichier';
    return `
      <div class="list-item${lien ? ' clickable' : ''}"${lien ? ` data-goto="race/${lien.raceId}"` : ''}>
        <div>
          <div class="bold">${principal ? '<span class="small tag-green bold">&Agrave; jouer en simple gagnant</span><br>' : ''}${heure}${lieu}R${q.reunion}C${q.course} - N&deg;${q.numero} ${escapeHtml(q.cheval)}</div>
          <div class="muted small">Cote ${fmt1(q.coteRetenue)} (${source})${ecart} &middot; ${escapeHtml(q.discipline)} &middot; IA Gagnant ${q.iaGagnant != null ? fmt1(q.iaGagnant) : '?'}&nbsp;% &middot; Popularit&eacute; ${q.popularite != null ? fmt0(q.popularite) : '?'}${lien ? '' : ' &middot; course non import&eacute;e'}</div>
        </div>
        ${lien ? '<div class="muted">&rsaquo;</div>' : ''}
      </div>`;
  };
  let corps;
  if (!fp.selection) {
    corps = '<p class="muted small">Aucun favori ne remplit les trois conditions aujourd\'hui.</p>';
  } else {
    const autres = fp.qualifies.slice(1);
    corps = `<div class="list-group">${ligne(fp.selection, true)}</div>`
      + (autres.length > 0
        ? `<details style="margin-top:8px;"><summary class="small bold">Autres favoris qualifi&eacute;s (${autres.length}), par cote croissante</summary><div class="list-group" style="margin-top:6px;">${autres.map((q) => ligne(q, false)).join('')}</div></details>`
        : '');
  }
  return `
    <div class="card" style="margin-bottom:10px;">
      <h3>Favori populaire du ${dateTxt}</h3>
      ${corps}
      <p class="muted small" style="margin-top:8px;">R&egrave;gle : favori de sa course + le plus populaire + n&deg;&nbsp;1 IA Gagnant (fichier Popularit&eacute; Turf BZH) ; on joue le qualifi&eacute; &agrave; la plus petite cote. Test 01/01-13/09/2026 : 255 paris, 67&nbsp;% de gagnants, rendement gagnant 108&nbsp;% (plac&eacute; 99&nbsp;%) - &agrave; confirmer en r&eacute;el. La plus petite cote peut changer jusqu'au d&eacute;part : rafra&icirc;chir les cotes avant de jouer.</p>
    </div>`;
}

/**
 * Regle "Nouveau D4" (v128, cf. js/engine/nouveauD4.js) pour un ensemble de
 * courses : chevaux de trot deferres des 4 pieds aujourd'hui alors qu'ils ne
 * l'etaient pas a leur course precedente.
 * @param {Array<{meeting:Object, race:Object, horses:Array}>} courses
 * @param {Array} toutesPerfs - DB.getAllPerformances()
 * @param {Array} ferrures - enregistrements du magasin `ferrures`
 * @returns {Array<{meeting, race, horse, cote:number|null, precedente:Object, statut:string}>}
 */
function evaluerNouveauxD4(courses, toutesPerfs, ferrures) {
  const candidats = [];
  for (const c of courses) {
    if (!estTrot(c.race.discipline)) continue;
    for (const h of c.horses) if (normaliserFerrure(h.ferrage) === 'D4') candidats.push({ ...c, horse: h });
  }
  if (candidats.length === 0) return [];
  const noms = new Set(candidats.map((c) => cleCheval(c.horse.nom)));
  const perfsParNom = new Map();
  for (const p of toutesPerfs || []) {
    const n = cleCheval(p.nomCheval);
    if (!noms.has(n)) continue;
    if (!perfsParNom.has(n)) perfsParNom.set(n, []);
    perfsParNom.get(n).push(p);
  }
  const index = indexerFerrures(ferrures);
  const out = [];
  for (const c of candidats) {
    const h = c.horse;
    const jour = jourDe(c.meeting.date);
    const precedente = ferrurePrecedente(h.nom, jour, index, perfsParNom.get(cleCheval(h.nom)));
    const cote = h.coteDirecte > 0 ? h.coteDirecte : (h.cote8h > 0 ? h.cote8h : null);
    const statut = statutNouveauD4({ ferrage: h.ferrage, cote, precedente });
    if (statut) out.push({ meeting: c.meeting, race: c.race, horse: h, cote, precedente, statut });
  }
  return out;
}

/** Cote "marche" d'un cheval : cote directe, sinon cote 8h, sinon null. */
function coteMarcheDe(h) {
  return h.coteDirecte > 0 ? h.coteDirecte : (h.cote8h > 0 ? h.cote8h : null);
}

/**
 * Value (cote directe) de chaque cheval d'une course, par identifiant -
 * meme calcul que la fiche course en mode "cote directe".
 * @returns {Map<string, number|null>}
 */
function valuesDirectesCourse(meeting, race, horseRecords, toutesPerfs) {
  const jour = new Date(meeting.date).toISOString().slice(0, 10);
  const horses = horseRecords.map((h) => ({ entry: h, historique: CSVImporter.historiquePour(h.nom, toutesPerfs, jour) }));
  const context = {
    lieu: race.lieu,
    discipline: disciplineFromRaw(race.discipline),
    disciplineBrute: race.discipline,
    typeCourse: race.typeCourse,
    distanceJour: race.distanceJour,
    allocation: race.allocation,
    nbPartants: horses.length
  };
  const result = RaceAnalyzer.analyser(horses, context, false);
  return new Map(result.chevaux.map((c) => [c.entry.id, typeof c.value === 'number' ? c.value : null]));
}

/**
 * Complete les elements de `evaluerNouveauxD4` avec l'affinage v129 (parmi
 * les 4 plus petites cotes de la course + Value <= -30). La Value n'est
 * calculee que pour les courses qui ont au moins un nouveau D4 a cote 6-30.
 */
function affinerItemsD4(items, toutesPerfs, horsesParRaceId) {
  const valuesParRace = new Map();
  return items.map((it) => {
    const horses = horsesParRaceId.get(it.race.id) || [];
    let value = null;
    if (it.statut === 'jouer') {
      if (!valuesParRace.has(it.race.id)) valuesParRace.set(it.race.id, valuesDirectesCourse(it.meeting, it.race, horses, toutesPerfs));
      value = valuesParRace.get(it.race.id).get(it.horse.id) ?? null;
    }
    const affine = affinerNouveauD4({ statut: it.statut, cote: it.cote, cotesCourse: horses.map(coteMarcheDe), value });
    return { ...it, value, affine };
  });
}

/** Texte "ce qui manque" d'un nouveau D4 en attente. */
function manqueD4Txt(it) {
  const m = [];
  if (it.affine.manque.includes('rang')) m.push(`${it.affine.rangCote ? `${it.affine.rangCote}e` : '?'} cote de la course (il faut les ${RANG_COTE_MAX_D4} plus petites)`);
  if (it.affine.manque.includes('value')) m.push(`Value ${it.value != null ? fmt0(it.value) : '?'} (il faut &le; ${SEUIL_VALUE_D4})`);
  return m.join(' ; ');
}

/** Carte "Nouveau D4" de "Courses du jour" (v129 : regle affinee). Chaine vide si aucun cheval concerne. */
function carteNouveauD4Html(items, plusieursDates) {
  if (!items || items.length === 0) return '';
  const tri = (a, b) => (jourDe(a.meeting.date) < jourDe(b.meeting.date) ? -1 : jourDe(a.meeting.date) > jourDe(b.meeting.date) ? 1 : minutesDepart(a.race.heureDepart) - minutesDepart(b.race.heureDepart));
  const ligne = (it) => {
    const date = plusieursDates ? `<span class="small tag-blue bold" style="margin-right:6px;">${new Date(it.meeting.date).toLocaleDateString('fr-FR')}</span>` : '';
    const prec = it.precedente;
    const src = prec.source === 'partants' ? 'fichier partants' : (prec.source === 'historique' ? 'historique' : 'historique, ferrure non renseign&eacute;e');
    const attente = it.affine.niveau === 'attente' ? `<div class="small tag-orange">Manque : ${manqueD4Txt(it)}</div>` : '';
    return `
      <div class="list-item clickable" data-goto="race/${it.race.id}">
        <div>
          <div class="bold">${date}${it.race.heureDepart ? `${escapeHtml(it.race.heureDepart)} - ` : ''}${escapeHtml(it.meeting.hippodrome || it.race.lieu || '')} - C${it.race.numeroCourse} - N&deg;${it.horse.numero} ${escapeHtml(it.horse.nom)}</div>
          <div class="muted small">Cote ${it.cote ? fmt1(it.cote) : '?'}${it.affine.rangCote ? ` (${it.affine.rangCote}e cote)` : ''}${it.value != null ? ` &middot; Value ${fmt0(it.value)}` : ''} &middot; course pr&eacute;c&eacute;dente le ${new Date(prec.jour).toLocaleDateString('fr-FR')} : ${prec.source === 'incertain' ? 'ferrure inconnue (non renseign&eacute;e dans l\'historique)' : `${escapeHtml(libelleFerrure(prec.ferrure))} (${src})`}</div>
          ${attente}
        </div>
        <div class="muted">&rsaquo;</div>
      </div>`;
  };
  const jouer = items.filter((i) => i.affine.niveau === 'jouer').sort(tri);
  const attente = items.filter((i) => i.affine.niveau === 'attente').sort(tri);
  const horsCote = items.filter((i) => i.statut === 'hors_cote').sort(tri);
  const aVerifier = items.filter((i) => i.statut === 'a_verifier').sort(tri);
  const bloc = (titre, liste) => (liste.length > 0
    ? `<details style="margin-top:8px;"><summary class="small bold">${titre} (${liste.length})</summary><div class="list-group" style="margin-top:6px;">${liste.map(ligne).join('')}</div></details>`
    : '');
  return `
    <div class="card" style="margin-bottom:10px;">
      <h3>Nouveau D4 (trot)</h3>
      ${jouer.length > 0
        ? `<p class="small tag-green bold" style="margin:0 0 6px;">&Agrave; jouer en simple gagnant (${jouer.length})</p><div class="list-group">${jouer.map(ligne).join('')}</div>`
        : '<p class="muted small">Aucun nouveau D4 ne remplit les trois conditions pour l\'instant.</p>'}
      ${bloc('En attente de confirmation par les cotes', attente)}
      ${bloc(`Nouveaux D4 hors cote ${COTE_MIN_NOUVEAU_D4}-${COTE_MAX_NOUVEAU_D4} (non jou&eacute;s)`, horsCote)}
      ${bloc('&Agrave; v&eacute;rifier : ferrure de la course pr&eacute;c&eacute;dente non renseign&eacute;e', aVerifier)}
      <p class="muted small" style="margin-top:8px;">R&egrave;gle : cheval de trot d&eacute;ferr&eacute; des 4 pieds aujourd'hui alors qu'il ne l'&eacute;tait pas &agrave; sa course pr&eacute;c&eacute;dente, cote sup&eacute;rieure &agrave; ${COTE_MIN_NOUVEAU_D4} et au plus &eacute;gale &agrave; ${COTE_MAX_NOUVEAU_D4}, parmi les ${RANG_COTE_MAX_D4} plus petites cotes de sa course, Value &le; ${SEUIL_VALUE_D4}. Test 01/01-13/09/2026 : 424 paris (1,7 par jour), 15,6&nbsp;% de gagnants, rendement gagnant 115&nbsp;%, plus longue s&eacute;rie perdante 23 - &agrave; confirmer en r&eacute;el.</p>
    </div>`;
}

/**
 * v129 : collecte, sur toutes les reunions importees, les jeux des QUATRE
 * selections retenues (cf. js/engine/jeuxDuJour.js). Chaque jeu a un
 * `niveau` : 'jouer' (toutes les conditions sont remplies avec les cotes
 * actuelles) ou 'attente' (eligible, mais une condition liee aux cotes
 * n'est pas - encore - remplie).
 * @returns {Promise<{courses:Array<{meeting, race, jour:string, nbPartants:number, jeux:Array}>,
 *   toutesCourses:Array<{meeting, race, horses:Array}>, itemsD4:Array, fp:Object|null,
 *   favoriNonImporte:Object|null, ia1NonImporte:Object|null, jourPop:string|null}>}
 */
async function collecterJeuxDuJour() {
  const meetingsBruts = await DB.getAllMeetings();
  // getAllMeetings est trie du plus recent au plus ancien : en cas de
  // reimport de la meme reunion, on ne garde que la copie la plus recente.
  const vusMeetings = new Set();
  const meetings = meetingsBruts.filter((m) => {
    const k = `${jourDe(m.date)}|${m.numeroReunion}|${String(m.hippodrome || '').trim().toUpperCase()}`;
    if (vusMeetings.has(k)) return false;
    vusMeetings.add(k);
    return true;
  });
  const toutesPerfs = await DB.getAllPerformances();
  const topIAPlace = await chargerTopIAPlace();
  const pop = await chargerPopularite();
  const jourPop = pop ? jourDe(pop.dateVal) : null;
  let fp = null;
  try { fp = await calculerFavoriPopulaire(); } catch (err) { console.error('Favori populaire', err); }

  const favoriParHorseId = new Map();
  if (fp) {
    fp.qualifies.forEach((q, i) => {
      const lien = fp.liens.get(cleFavori(q));
      if (lien) favoriParHorseId.set(lien.horseId, { q, principal: i === 0 });
    });
  }
  const rang1 = (topIAPlace || []).find((r) => r.rang === 1) || null;
  const jourRang1 = rang1 && /^\d{4}-\d{2}-\d{2}$/.test(String(rang1.date || '')) ? rang1.date : null;

  const toutesCourses = [];
  for (const meeting of meetings) {
    for (const race of await DB.getRacesForMeeting(meeting.id)) {
      const horses = await DB.getHorsesForRace(race.id);
      if (horses.length > 0) toutesCourses.push({ meeting, race, horses });
    }
  }
  const horsesParRaceId = new Map(toutesCourses.map((c) => [c.race.id, c.horses]));

  let itemsD4 = [];
  try {
    const trot = toutesCourses.filter((c) => estTrot(c.race.discipline));
    itemsD4 = affinerItemsD4(evaluerNouveauxD4(trot, toutesPerfs, await DB.getAllFerrures()), toutesPerfs, horsesParRaceId);
  } catch (err) { console.error('Nouveau D4', err); }
  const d4ParRace = new Map();
  for (const it of itemsD4) {
    if (it.affine.niveau === 'non') continue;
    if (!d4ParRace.has(it.race.id)) d4ParRace.set(it.race.id, []);
    d4ParRace.get(it.race.id).push(it);
  }

  const courses = [];
  for (const { meeting, race, horses } of toutesCourses) {
    const jour = jourDe(meeting.date);
    const jeux = [];
    const ajouter = (sel, niveau, h, extra = {}) => jeux.push({
      sel, niveau, horse: h, numero: h.numero, nom: h.nom, cote: coteMarcheDe(h), paris: SELECTIONS[sel].paris, info: '', ...extra
    });

    // 1. Favori populaire : le qualifie a la plus petite cote du jour est a
    // jouer ; les autres qualifies restent "en attente" (la plus petite cote
    // peut changer jusqu'au depart).
    for (const h of horses) {
      const f = favoriParHorseId.get(h.id);
      if (!f) continue;
      ajouter('favori', f.principal ? 'jouer' : 'attente', h, {
        cote: f.q.coteRetenue,
        info: f.principal
          ? `plus petite cote des ${fp.qualifies.length} favoris qualifi&eacute;s du jour`
          : `qualifi&eacute;, mais pas la plus petite cote du jour (${fmt1(fp.selection.coteRetenue)})`
      });
    }

    // 2. Rang 1 IA Place : gagnant + place, sans condition de cote.
    if (rang1 && (!jourRang1 || jourRang1 === jour)) {
      const h = horses.find((x) => rangIAPlacePour(topIAPlace, race.lieu, race.numeroCourse, x.numero) === 1);
      if (h) ajouter('ia1', 'jouer', h, { info: `IA Plac&eacute; ${rang1.pctIAPlace != null ? `${fmt1(rang1.pctIAPlace)}&nbsp;%` : 'n&deg;&nbsp;1 du jour'}` });
    }

    // 3. Regle trot "gains faibles" (figee le 29/09/2026 : logique inchangee).
    try {
      if (estDisciplineTrot(disciplineFromRaw(race.discipline).canonical)) {
        const ev = evaluerCourseRegleTrotGF(race, horses);
        if (ev.applicable) {
          const detail = (c) => `Cote_BZH ${c.coteBzh != null ? fmt1(c.coteBzh) : '?'} &middot; gains ${c.ratioGains != null ? `${Math.round(c.ratioGains * 100)}&nbsp;%` : '-'} du plus riche &middot; dernier signe ${escapeHtml(c.dernierSigne || '-')}${c.age === 4 ? ' &middot; 4 ans (&agrave; surveiller)' : ''}`;
          for (const c of ev.retenus) {
            const h = horses.find((x) => x.numero === c.numero);
            if (h) ajouter('trot', 'jouer', h, { cote: c.cotePmu, info: detail(c) });
          }
          for (const c of ev.aConfirmer) {
            const h = horses.find((x) => x.numero === c.numero);
            if (h) ajouter('trot', 'attente', h, { cote: c.cotePmu, info: `Cote_BZH inconnue (&agrave; jouer si &lt; ${REGLE_TROT_GF.COTE_BZH_MAX}) &middot; ${detail(c)}` });
          }
        }
      }
    } catch (err) { console.error('Regle trot GF', err); }

    // 4. Nouveau D4 affine.
    for (const it of d4ParRace.get(race.id) || []) {
      ajouter('d4', it.affine.niveau, it.horse, {
        cote: it.cote,
        info: it.affine.niveau === 'jouer'
          ? `${it.affine.rangCote}e cote de la course &middot; Value ${fmt0(it.value)} &middot; pr&eacute;c&eacute;dente : ${escapeHtml(libelleFerrure(it.precedente.ferrure))}`
          : `manque : ${manqueD4Txt(it)}`
      });
    }

    if (jeux.length > 0) courses.push({ meeting, race, jour, nbPartants: horses.length, jeux });
  }

  const favoriNonImporte = fp && fp.selection && !fp.liens.get(cleFavori(fp.selection)) ? fp.selection : null;
  let ia1NonImporte = null;
  if (pop && !(rang1 && (!jourRang1 || jourRang1 === jourPop))) {
    ia1NonImporte = top5IAPlaceDepuisPopularite(pop.rows, 1)[0] || null;
  }
  return { courses, toutesCourses, itemsD4, fp, favoriNonImporte, ia1NonImporte, jourPop };
}

/** Libelle des paris d'un jeu ("Gagnant" / "Gagnant + Place"). */
function parisTxt(paris) {
  return paris.includes('P') ? 'Gagnant + Plac&eacute;' : 'Gagnant';
}

/** Badges des jeux d'une course pour "Courses du jour". */
function badgesJeuxCourseHtml(jeux) {
  return ORDRE_SELECTIONS.map((sel) => {
    const liste = jeux.filter((j) => j.sel === sel);
    if (liste.length === 0) return '';
    const jouer = liste.filter((j) => j.niveau === 'jouer');
    const attente = liste.filter((j) => j.niveau === 'attente');
    const nums = (l) => l.map((j) => `N&deg;${j.numero}`).join(', ');
    return `${jouer.length > 0 ? `<div class="small tag-green bold" style="margin-top:3px;">${SELECTIONS[sel].nom} : ${nums(jouer)} &agrave; jouer (${parisTxt(SELECTIONS[sel].paris)})</div>` : ''}${attente.length > 0 ? `<div class="small tag-orange bold" style="margin-top:3px;">${SELECTIONS[sel].nom} : ${nums(attente)} en attente des cotes</div>` : ''}`;
  }).join('');
}

/**
 * Rafraichit les cotes directes d'une liste de courses (meme mecanisme que
 * le bouton "Mettre a jour les cotes de toute la reunion"), puis - pour les
 * courses de trot sans aucune Cote_BZH - recupere Cote_BZH / gains / musique
 * (regle trot). Les arrivees ne sont pas touchees.
 * @param {Array<{meeting, race}>} courses
 * @param {function(string)} onProgress - recoit du HTML.
 */
async function rafraichirCotesCourses(courses, onProgress) {
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < courses.length; i++) {
    const { meeting, race } = courses[i];
    onProgress(`Mise &agrave; jour des cotes ${i + 1}/${courses.length} (${escapeHtml(meeting.hippodrome || '')} - Course ${race.numeroCourse})...`);
    if (!(meeting.numeroReunion > 0)) { fail++; continue; }
    try {
      const dateVal = new Date(meeting.date).toISOString().slice(0, 10);
      const horseRecords = await DB.getHorsesForRace(race.id);
      const cotesPmu = await fetchCotesAvecFallback(dateVal, meeting.numeroReunion, race.numeroCourse);
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
      ok++;
    } catch (err) {
      console.error('Rafraichissement des cotes echoue pour', meeting.hippodrome, race.numeroCourse, err);
      fail++;
    }
    if (i < courses.length - 1) await new Promise((resolve) => setTimeout(resolve, 400));
  }
  let bzh = null;
  try {
    const sansBzh = [];
    for (const c of courses) {
      if (!estDisciplineTrot(disciplineFromRaw(c.race.discipline).canonical)) continue;
      const horseRecords = await DB.getHorsesForRace(c.race.id);
      if (horseRecords.length > 0 && !horseRecords.some((h) => h.coteBzh != null)) sansBzh.push({ meeting: c.meeting, race: c.race, horseRecords });
    }
    if (sansBzh.length > 0) bzh = await recupererCotesBzhGroupees(sansBzh, onProgress);
  } catch (err) { console.error('Cote_BZH (rafraichissement groupe)', err); }
  return { ok, fail, bzh };
}

/**
 * Recupere l'arrivee officielle (si elle manque) puis les rapports simple
 * gagnant / simple place d'une liste de courses. Les cotes ne sont pas
 * touchees.
 * @param {Array<{meeting, race}>} cibles
 * @param {function(string)} progress - recoit du HTML.
 */
async function recupererResultatsCourses(cibles, progress) {
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < cibles.length; i++) {
    const { meeting, race } = cibles[i];
    progress(`R&eacute;sultat ${i + 1}/${cibles.length} (${escapeHtml(meeting.hippodrome || '')} - Course ${race.numeroCourse})...`);
    try {
      const dateVal = new Date(meeting.date).toISOString().slice(0, 10);
      let change = false;
      if (CSVImporter.parseOrdreArrivee(race.arriveeBrute || '').length === 0) {
        const arrivee = await fetchResultatPmu(dateVal, meeting.numeroReunion, race.numeroCourse);
        if (arrivee && arrivee.length > 0) { race.arriveeBrute = arrivee.join('-'); change = true; }
      }
      if (CSVImporter.parseOrdreArrivee(race.arriveeBrute || '').length > 0) {
        const json = await fetchRapportsAvecFallback(dateVal, meeting.numeroReunion, race.numeroCourse);
        if (json) {
          race.rapportSimpleGagnant = extraireRapportsSimpleGagnant(json);
          race.rapportSimplePlace = extraireRapportsSimplePlace(json);
          change = true;
        }
      }
      if (change) { await DB.updateRace(race); ok++; }
    } catch (err) {
      console.error('Resultat jeux du jour', meeting.hippodrome, race.numeroCourse, err);
      fail++;
    }
    if (i < cibles.length - 1) await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return { ok, fail };
}

/**
 * Jeux finaux ('jouer') des reunions importees, avec leur resultat.
 * @returns {Array} lignes {sel, meeting, race, jour, nbPartants, numero, nom, cote, paris, resultat, couru}
 */
function jeuxFinauxAvecResultat(data) {
  const lignes = [];
  for (const c of data.courses) {
    const ordre = CSVImporter.parseOrdreArrivee(c.race.arriveeBrute || '');
    for (const j of c.jeux) {
      if (j.niveau !== 'jouer') continue;
      lignes.push({ ...j, meeting: c.meeting, race: c.race, jour: c.jour, nbPartants: c.nbPartants, couru: ordre.length > 0, resultat: resultatJeu(j, ordre, c.nbPartants, c.race.rapportSimpleGagnant, c.race.rapportSimplePlace) });
    }
  }
  return lignes;
}

/** Enregistrement d'historique (magasin `jeuxHistorique`) d'un jeu resolu. */
function enregistrementJeuHistorique(l) {
  return {
    id: `${l.jour}|${l.sel}|${l.meeting.numeroReunion}|${l.race.numeroCourse}|${l.numero}`,
    jour: l.jour, sel: l.sel, hippodrome: l.meeting.hippodrome || l.race.lieu || '', reunion: l.meeting.numeroReunion,
    course: l.race.numeroCourse, heure: l.race.heureDepart || '', numero: l.numero, nom: l.nom, cote: l.cote,
    joueP: l.paris.includes('P'), gagnant: l.resultat.gagnant, place: l.resultat.place, gainG: l.resultat.gainG, gainP: l.resultat.gainP
  };
}

// Reperes du test 01/01 - 13/09/2026 (cf. page "Methode").
const REPERES_TEST_SELECTIONS = {
  'favori|G': '108&nbsp;%', 'ia1|G': '105&nbsp;%', 'ia1|P': '104&nbsp;%', 'trot|G': '113&nbsp;%', 'd4|G': '115&nbsp;%'
};

/**
 * Page "Bilan" (v130) : bilan de chacune des quatre selections + bilan
 * global, a 1 euro par pari, sur l'historique cumule des jeux resolus. Les
 * jeux resolus des reunions importees sont enregistres a chaque ouverture de
 * la page ; l'historique survit a "Vider les reunions importees".
 */
async function renderBilan() {
  renderTopbar('Bilan');
  appEl.innerHTML = '<div class="card"><p class="muted">Calcul en cours...</p></div>';
  const data = await collecterJeuxDuJour();
  const finals = jeuxFinauxAvecResultat(data);
  const resolus = finals.filter((l) => l.resultat && l.resultat.gain != null);
  if (resolus.length > 0) await DB.addJeuxHistorique(resolus.map(enregistrementJeuHistorique));
  const enAttente = [...new Map(finals.filter((l) => !l.resultat || l.resultat.gain == null).map((l) => [l.race.id, l])).values()];
  const historique = await DB.getAllJeuxHistorique();

  const euro = (x) => `${x >= 0 ? '+' : ''}${x.toFixed(2)}`;
  const pct = (r) => (r == null ? '-' : `${Math.round(r * 100)}&nbsp;%`);
  const cls = (l) => (l.n === 0 ? '' : (l.net >= 0 ? 'tag-green' : 'tag-red'));
  const td = 'style="padding:6px 4px; text-align:right; border-top:1px solid var(--border);"';
  const tdG = 'style="padding:6px 4px; text-align:left; border-top:1px solid var(--border);"';
  const tableBilan = (records) => {
    const b = bilanHistorique(records);
    const ligne = (l, nom, repere) => `<tr${l.sel === 'total' ? ' class="bold"' : ''}>
        <td ${tdG}>${nom}</td><td ${td}>${l.n}</td><td ${td}>${l.n > 0 ? `${Math.round((l.reussis / l.n) * 100)}&nbsp;%` : '-'}</td>
        <td ${td} class="${cls(l)}">${l.n > 0 ? euro(l.net) : '-'}</td><td ${td} class="bold ${cls(l)}">${pct(l.rendement)}</td><td ${td} class="muted">${repere}</td></tr>`;
    return `<table style="width:100%; border-collapse:collapse; font-size:13px;">
      <tr class="muted small"><th style="text-align:left; padding:4px;">S&eacute;lection</th><th style="text-align:right; padding:4px;">Paris</th><th style="text-align:right; padding:4px;">R&eacute;ussite</th><th style="text-align:right; padding:4px;">Net&nbsp;&euro;</th><th style="text-align:right; padding:4px;">Rend.</th><th style="text-align:right; padding:4px;">Test</th></tr>
      ${b.lignes.map((l) => ligne(l, `${SELECTIONS[l.sel].court} <span class="muted small">${l.pari === 'G' ? 'gagnant' : 'plac&eacute;'}</span>`, REPERES_TEST_SELECTIONS[`${l.sel}|${l.pari}`] || '')).join('')}
      ${ligne(b.total, 'Bilan global', '')}
    </table>`;
  };

  const jours = [...new Set(historique.map((r) => r.jour))].sort().reverse();
  const fr = (j) => new Date(j).toLocaleDateString('fr-FR');
  const jourHtml = (jour) => {
    const recs = historique.filter((r) => r.jour === jour).sort((a, b) => ORDRE_SELECTIONS.indexOf(a.sel) - ORDRE_SELECTIONS.indexOf(b.sel) || minutesDepart(a.heure) - minutesDepart(b.heure));
    const t = bilanHistorique(recs).total;
    const res = (r) => {
      const g = r.gainG > 0 ? `<span class="tag-green bold">gagn&eacute; ${r.gainG.toFixed(2)}</span>` : '<span class="tag-red">gagnant perdu</span>';
      const p = r.joueP ? (r.gainP > 0 ? ` &middot; <span class="tag-green bold">plac&eacute; ${r.gainP.toFixed(2)}</span>` : ' &middot; <span class="tag-red">plac&eacute; perdu</span>') : '';
      return g + p;
    };
    return `<details style="border-top:1px solid var(--border); padding:6px 0;">
      <summary class="small"><span class="bold">${fr(jour)}</span> &middot; ${t.n} pari(s) &middot; <span class="bold ${cls(t)}">${euro(t.net)}&nbsp;&euro; (${pct(t.rendement)})</span></summary>
      ${recs.map((r) => `<p class="small" style="margin:4px 0 0 12px;"><span class="bold">${SELECTIONS[r.sel].court}</span> &middot; ${escapeHtml(r.hippodrome)} C${r.course} N&deg;${r.numero} ${escapeHtml(r.nom || '')} (cote ${r.cote ? fmt1(r.cote) : '?'}) : ${res(r)}</p>`).join('')}
      <button class="btn btn-secondary" data-suppr-jour="${jour}" style="margin:8px 0 0 12px; font-size:12px; padding:4px 10px;">Retirer cette journ&eacute;e du bilan</button>
    </details>`;
  };

  appEl.innerHTML = `
    ${enAttente.length > 0 ? `<div class="card" style="margin-bottom:10px;">
      <p class="small" style="margin:0 0 6px;">${enAttente.length} course(s) import&eacute;e(s) avec un jeu sans arriv&eacute;e ou sans rapport : pas encore au bilan.</p>
      <button class="btn btn-primary btn-block" data-resultats-bilan>R&eacute;cup&eacute;rer arriv&eacute;es et rapports (${enAttente.length})</button>
      <div id="bilan-status"></div>
    </div>` : ''}
    <div class="card" style="margin-bottom:10px;">
      <h3 style="margin-bottom:2px;">Bilan par s&eacute;lection</h3>
      <p class="muted small" style="margin:0 0 8px;">${jours.length > 0 ? `Du ${fr(jours[jours.length - 1])} au ${fr(jours[0])} &middot; ${jours.length} journ&eacute;e(s) &middot; 1&nbsp;&euro; par pari` : 'Aucun jeu r&eacute;solu pour l\'instant.'}</p>
      ${tableBilan(historique)}
      <p class="muted small" style="margin-top:8px;">&laquo; Test &raquo; = rendement mesur&eacute; du 01/01 au 13/09/2026 (voir l'onglet M&eacute;thode). Sur quelques dizaines de paris, l'&eacute;cart avec le test ne prouve rien dans un sens ni dans l'autre.</p>
    </div>
    ${jours.length > 0 ? `<div class="card" style="margin-bottom:10px;">
      <h3 style="margin-bottom:6px;">Par journ&eacute;e</h3>
      ${jours.map(jourHtml).join('')}
    </div>` : ''}
    <div class="card" style="margin-bottom:10px;">
      <p class="muted small" style="margin:0 0 8px;">Les jeux r&eacute;solus des r&eacute;unions import&eacute;es sont ajout&eacute;s automatiquement &agrave; l'ouverture de cette page, avec les cotes en base &agrave; ce moment-l&agrave;. L'historique est conserv&eacute; quand vous videz les r&eacute;unions, et fait partie de la sauvegarde.</p>
      <button class="btn btn-secondary btn-block" data-goto="regletrot" style="margin-bottom:8px;">R&egrave;gle trot &laquo; gains faibles &raquo; : suivi d&eacute;taill&eacute; oct.-d&eacute;c.</button>
      <button class="btn btn-secondary btn-block" data-goto="simplegpancien" style="margin-bottom:8px;">Ancien suivi : Top 5 IA Plac&eacute; &times; Value &le; -30</button>
      <button class="btn btn-secondary btn-block" data-goto="bilanglobalsimplegagnant" style="margin-bottom:8px;">Bilan global de l'ancien suivi</button>
      ${jours.length > 0 ? '<button class="btn btn-secondary btn-block" data-reset-bilan>Effacer tout l\'historique du bilan</button>' : ''}
    </div>`;
  bindGoto();

  const btn = appEl.querySelector('[data-resultats-bilan]');
  if (btn) {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const statusEl = appEl.querySelector('#bilan-status');
      const r = await recupererResultatsCourses(enAttente, (html) => { if (statusEl) statusEl.innerHTML = `<p class="muted small" style="margin-top:8px;">${html}</p>`; });
      if (parseHash()[0] !== 'bilan') return;
      await renderBilan();
      if (r.fail > 0 || r.ok === 0) {
        const el = appEl.querySelector('#bilan-status');
        if (el) el.innerHTML = `<p class="muted small" style="margin-top:8px;">${r.ok} course(s) mise(s) &agrave; jour${r.fail > 0 ? `, ${r.fail} &eacute;chec(s)` : ''}. Les r&eacute;sultats non disponibles restent en attente.</p>`;
      }
    });
  }
  appEl.querySelectorAll('[data-suppr-jour]').forEach((el) => el.addEventListener('click', async () => {
    const jour = el.dataset.supprJour;
    if (!confirm(`Retirer la journ\u00e9e du ${fr(jour)} du bilan ? (Elle y reviendra si ses r\u00e9unions sont encore import\u00e9es.)`)) return;
    await DB.deleteJeuxHistoriqueDuJour(jour);
    await renderBilan();
  }));
  const btnReset = appEl.querySelector('[data-reset-bilan]');
  if (btnReset) {
    btnReset.addEventListener('click', async () => {
      if (!confirm('Effacer tout l\'historique du bilan des quatre s\u00e9lections ?')) return;
      await DB.resetJeuxHistorique();
      await renderBilan();
    });
  }
}

/** Page "Methode" (v130) : synthese theorique des quatre selections. */
function renderMethode() {
  renderTopbar('M\u00e9thode');
  const th = 'style="text-align:right; padding:4px;"';
  const td = 'style="padding:6px 4px; text-align:right; border-top:1px solid var(--border);"';
  const tdG = 'style="padding:6px 4px; text-align:left; border-top:1px solid var(--border);"';
  const carte = (titre, pari, regle, chiffres, note) => `
    <div class="card" style="margin-bottom:10px;">
      <h3 style="margin-bottom:4px;">${titre} <span class="small muted">&middot; ${pari}</span></h3>
      <p class="small" style="margin:0 0 6px;">${regle}</p>
      <p class="small bold" style="margin:0 0 6px;">${chiffres}</p>
      <p class="muted small" style="margin:0;">${note}</p>
    </div>`;
  appEl.innerHTML = `
    <div class="card" style="margin-bottom:10px;">
      <h3 style="margin-bottom:4px;">Le constat de d&eacute;part</h3>
      <p class="small" style="margin:0 0 6px;">Une centaine de variantes ont &eacute;t&eacute; test&eacute;es sur 2026. R&eacute;sultat constant : <span class="bold">la cote contient d&eacute;j&agrave; presque toute l'information</span> des indicateurs (Note IA, IA Gagnant, IA Plac&eacute;, ELO, popularit&eacute;, sagesse des foules). Jouer &laquo; le mieux not&eacute; &raquo; rend 95 &agrave; 105&nbsp;%.</p>
      <p class="small" style="margin:0 0 4px;">Un rendement sup&eacute;rieur n'appara&icirc;t que dans deux cas :</p>
      <p class="small" style="margin:0 0 4px;">&bull; plusieurs signaux ind&eacute;pendants s'accordent sur un m&ecirc;me cheval : forte r&eacute;ussite, petite marge (Favori populaire, Rang 1 IA Plac&eacute;) ;</p>
      <p class="small" style="margin:0 0 6px;">&bull; le public sous-&eacute;value une information : marge plus forte, faible r&eacute;ussite (R&egrave;gle trot, Nouveau D4).</p>
      <p class="small bold" style="margin:0;">Aucune r&egrave;gle ne combine forte r&eacute;ussite et forte marge.</p>
    </div>

    <div class="card" style="margin-bottom:10px;">
      <h3 style="margin-bottom:2px;">Les quatre s&eacute;lections</h3>
      <p class="muted small" style="margin:0 0 8px;">Test du 01/01 au 13/09/2026, rapports officiels, 1&nbsp;&euro; par pari.</p>
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <tr class="muted small"><th style="text-align:left; padding:4px;">S&eacute;lection</th><th ${th}>Paris</th><th ${th}>R&eacute;ussite</th><th ${th}>Rend.</th><th ${th}>S&eacute;rie perd.</th></tr>
        <tr><td ${tdG}>Favori populaire <span class="muted small">G</span></td><td ${td}>255</td><td ${td}>67&nbsp;%</td><td ${td} class="bold">108&nbsp;%</td><td ${td}>courte</td></tr>
        <tr><td ${tdG}>Rang 1 IA Plac&eacute; <span class="muted small">G+P</span></td><td ${td}>275</td><td ${td}>49&nbsp;% / 77&nbsp;%</td><td ${td} class="bold">105&nbsp;% / 104&nbsp;%</td><td ${td}>courte</td></tr>
        <tr><td ${tdG}>R&egrave;gle trot <span class="muted small">G</span></td><td ${td}>581</td><td ${td}>22,5&nbsp;%</td><td ${td} class="bold">113&nbsp;%</td><td ${td}>14</td></tr>
        <tr><td ${tdG}>Nouveau D4 <span class="muted small">G</span></td><td ${td}>424</td><td ${td}>15,6&nbsp;%</td><td ${td} class="bold">115&nbsp;%</td><td ${td}>23</td></tr>
      </table>
      <p class="muted small" style="margin-top:8px;">Rang 1 IA Plac&eacute; : chiffres du site turf.bzh ; mon contr&ocirc;le donne 100 &agrave; 104&nbsp;% en gagnant et 100 &agrave; 101&nbsp;% en plac&eacute;.</p>
    </div>

    ${carte('Favori populaire', 'Gagnant, 1 par jour',
      'Cheval qui est, dans sa course, &agrave; la fois le favori (plus petite cote), le plus populaire et le n&deg;&nbsp;1 IA Gagnant. Parmi les qualifi&eacute;s du jour, on joue celui qui a la plus petite cote.',
      '255 paris &middot; 67&nbsp;% de gagnants &middot; 108&nbsp;% (106 puis 111 sur les deux p&eacute;riodes) &middot; plac&eacute; 99&nbsp;%',
      'Les qualifi&eacute;s pris tous ensemble ne rendent que 96&nbsp;% : c\'est le choix du plus court qui fait le r&eacute;sultat. La plus petite cote peut changer jusqu\'au d&eacute;part.')}
    ${carte('Rang 1 IA Plac&eacute;', 'Gagnant + Plac&eacute;, 1 par jour',
      'Premier du classement IA Plac&eacute; du jour (fichier Popularit&eacute;), toutes courses, &eacute;trang&egrave;res comprises. Sans condition de cote.',
      '275 paris &middot; 49&nbsp;% gagnants / 77&nbsp;% plac&eacute;s &middot; 105&nbsp;% G / 104&nbsp;% P (site)',
      'Les rangs 2 &agrave; 5 sont perdants (93&nbsp;% G / 92&nbsp;% P) et ne sont plus jou&eacute;s. Limit&eacute; aux courses fran&ccedil;aises, le rang 1 tombe &agrave; 85&nbsp;% G / 90&nbsp;% P.')}
    ${carte('R&egrave;gle trot &laquo; gains faibles &raquo;', 'Gagnant, 2,3 par jour',
      'Trot uniquement : Cote_BZH inf&eacute;rieure &agrave; 10, cote PMU entre 3 et 8, gains inf&eacute;rieurs &agrave; 50&nbsp;% du plus riche de la course, derni&egrave;re course rat&eacute;e (4e ou plus, disqualifi&eacute;, arr&ecirc;t&eacute;).',
      '581 paris &middot; 22,5&nbsp;% de gagnants &middot; 113&nbsp;% &middot; s&eacute;rie perdante max 14',
      'R&egrave;gle fig&eacute;e le 29/09/2026, en suivi r&eacute;el du 01/10 au 31/12/2026. Fourchette &agrave; 95&nbsp;% : de -5&nbsp;% &agrave; +31&nbsp;% - non prouv&eacute;e.')}
    ${carte('Nouveau D4', 'Gagnant, 1,7 par jour',
      'Trot : d&eacute;ferr&eacute; des 4 pieds aujourd\'hui alors qu\'il ne l\'&eacute;tait pas &agrave; sa course pr&eacute;c&eacute;dente, cote sup&eacute;rieure &agrave; 6 et au plus &eacute;gale &agrave; 30, parmi les 4 plus petites cotes de sa course, Value &le; -30.',
      '424 paris &middot; 15,6&nbsp;% de gagnants &middot; 115&nbsp;% (111 puis 122) &middot; s&eacute;rie perdante max 23',
      'Sans les deux filtres : 2&nbsp;626 paris, 9&nbsp;%, 111&nbsp;%, s&eacute;rie de 74. Avec les 4 plus petites cotes seules : 934 paris, 13,8&nbsp;%, 115&nbsp;%, s&eacute;rie de 32. La Value n\'augmente pas le rendement : elle divise les paris par deux et raccourcit les s&eacute;ries.')}

    <div class="card" style="margin-bottom:10px;">
      <h3 style="margin-bottom:4px;">Ce qu'on peut attendre</h3>
      <p class="small" style="margin:0 0 4px;">&bull; Environ 6 paris par jour (7 mises avec le plac&eacute; du Rang 1 IA Plac&eacute;).</p>
      <p class="small" style="margin:0 0 4px;">&bull; Rendement d'ensemble, si les tests se confirment : de l'ordre de 105 &agrave; 110&nbsp;%. Hypoth&egrave;se prudente : 100 &agrave; 105&nbsp;%.</p>
      <p class="small" style="margin:0;">&bull; Les deux premi&egrave;res s&eacute;lections donnent la r&eacute;gularit&eacute; ; les deux s&eacute;lections de trot portent l'essentiel du gain esp&eacute;r&eacute;, avec des s&eacute;ries perdantes de 15 &agrave; 25 paris qui restent normales.</p>
    </div>

    <div class="card" style="margin-bottom:10px;">
      <h3 style="margin-bottom:4px;">R&eacute;serves</h3>
      <p class="small" style="margin:0 0 4px;"><span class="bold">1. Cote finale.</span> Les tests utilisent la cote d'arriv&eacute;e. Avec une cote relev&eacute;e plus t&ocirc;t, le Nouveau D4 de base passe de 111&nbsp;% &agrave; 106&nbsp;% (cote du fichier) puis 101&nbsp;% (cote de 8&nbsp;h). D'o&ugrave; la r&egrave;gle : rafra&icirc;chir les cotes quelques minutes avant le d&eacute;part.</p>
      <p class="small" style="margin:0 0 4px;"><span class="bold">2. R&egrave;gles choisies apr&egrave;s coup.</span> Chacune est la meilleure d'une s&eacute;rie d'essais ; une partie de l'avantage mesur&eacute; est due au hasard. Seule la r&egrave;gle trot est fig&eacute;e et suivie en r&eacute;el.</p>
      <p class="small" style="margin:0 0 4px;"><span class="bold">3. Marges faibles.</span> Favori populaire et Rang 1 IA Plac&eacute; sont &agrave; quelques points de 100&nbsp;% : la perte reste possible.</p>
      <p class="small" style="margin:0;"><span class="bold">4. Neuf mois de donn&eacute;es.</span> D&eacute;cision &agrave; prendre fin d&eacute;cembre 2026 sur le bilan r&eacute;el (onglet Bilan).</p>
    </div>

    <div class="card" style="margin-bottom:10px;">
      <h3 style="margin-bottom:4px;">Non retenus</h3>
      <p class="small" style="margin:0;">Test&eacute;s et &eacute;cart&eacute;s : Top base (91&nbsp;% G / 94&nbsp;% P, la Base est le favori 94 fois sur 100), rangs 2 &agrave; 5 IA Plac&eacute;, Top 5 Note IA, ELO, popularit&eacute; seule, Sagesse des Foules, Suppl&eacute;mentation, mouvements de cote, petites r&eacute;unions, dutching. Signaux d'&eacute;limination utiles : cheval de trot referr&eacute; apr&egrave;s avoir couru d&eacute;ferr&eacute;, cote doubl&eacute;e depuis 8&nbsp;h.</p>
    </div>

    <div class="card">
      <h3 style="margin-bottom:4px;">Mode d'emploi</h3>
      <p class="small" style="margin:0 0 4px;">1. <span class="bold">Importer</span> : r&eacute;union du jour, historique des chevaux, fichier Popularit&eacute;.</p>
      <p class="small" style="margin:0 0 4px;">2. <span class="bold">Courses du jour</span> : courses &eacute;ligibles (vert = &agrave; jouer, orange = en attente des cotes).</p>
      <p class="small" style="margin:0 0 4px;">3. <span class="bold">Simple G/P</span> : rafra&icirc;chir les cotes avant le d&eacute;part, jouer les jeux confirm&eacute;s.</p>
      <p class="small" style="margin:0;">4. <span class="bold">Bilan</span> : r&eacute;cup&eacute;rer arriv&eacute;es et rapports, suivre chaque s&eacute;lection.</p>
    </div>`;
}

/** Courses pas encore courues (pas d'arrivee, depart non passe depuis plus de 15 min). */
function coursesARafraichir(toutesCourses) {
  const limite = Date.now() - 15 * 60 * 1000;
  return toutesCourses.filter(({ meeting, race }) => {
    if (CSVImporter.parseOrdreArrivee(race.arriveeBrute || '').length > 0) return false;
    const d = dateDepartCourse(race.heureDepart, meeting.date);
    return !d || d.getTime() >= limite;
  });
}

/**
 * Page "Simple G/P" (v129) : les jeux finaux des quatre selections, apres
 * confirmation par les cotes. L'ancien suivi "Top 5 IA Place x Value <= -30"
 * reste consultable (bouton en bas de page).
 */
async function renderBilanSimpleGagnant() {
  renderTopbar('Jeux du jour');
  appEl.innerHTML = '<div class="card"><p class="muted">Calcul en cours...</p></div>';
  const data = await collecterJeuxDuJour();
  const liensHtml = '<p class="muted small" style="margin-top:10px;">Bilans par s&eacute;lection et bilan global : onglet Bilan.</p>';

  if (data.toutesCourses.length === 0) {
    appEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">\u{1F4B0}</div>
        <p class="bold">Aucune r&eacute;union import&eacute;e</p>
        <p class="muted">Importez la r&eacute;union du jour et le fichier Popularit&eacute; (onglet Importer) pour voir ici les jeux des quatre s&eacute;lections.</p>
      </div>${liensHtml}`;
    bindGoto();
    return;
  }

  // Resultat de chaque jeu (1 euro par pari).
  const lignes = [];
  for (const c of data.courses) {
    const ordre = CSVImporter.parseOrdreArrivee(c.race.arriveeBrute || '');
    for (const j of c.jeux) {
      lignes.push({ ...j, meeting: c.meeting, race: c.race, jour: c.jour, nbPartants: c.nbPartants, resultat: j.niveau === 'jouer' ? resultatJeu(j, ordre, c.nbPartants, c.race.rapportSimpleGagnant, c.race.rapportSimplePlace) : null, couru: ordre.length > 0 });
    }
  }
  const tri = (a, b) => minutesDepart(a.race.heureDepart) - minutesDepart(b.race.heureDepart);
  const jours = [...new Set(data.toutesCourses.map((c) => jourDe(c.meeting.date)))].sort().reverse();
  const aRafraichir = coursesARafraichir(data.toutesCourses);
  const finals = lignes.filter((l) => l.niveau === 'jouer');
  const sansArrivee = [...new Map(finals.filter((l) => !l.couru).map((l) => [l.race.id, l])).values()];
  const sansRapport = [...new Map(finals.filter((l) => l.resultat && l.resultat.gain == null).map((l) => [l.race.id, l])).values()];

  const resultatHtml = (l) => {
    if (l.niveau !== 'jouer') return '';
    const r = l.resultat;
    if (!r) return '';
    const gain = r.gain == null ? 'rapport &agrave; r&eacute;cup&eacute;rer' : `retour ${r.gain.toFixed(2)}&nbsp;&euro; pour ${r.mise}&nbsp;&euro;`;
    if (r.gagnant) return `<div class="small tag-green bold">Gagn&eacute; &middot; ${gain}</div>`;
    if (r.place) return `<div class="small tag-green bold">Plac&eacute; (pas gagnant) &middot; ${gain}</div>`;
    return '<div class="small tag-red bold">Perdu</div>';
  };
  const ligneHtml = (l) => `
      <div class="list-item clickable" data-goto="race/${l.race.id}">
        <div>
          <div class="bold">${l.race.heureDepart ? `${escapeHtml(l.race.heureDepart)} - ` : ''}${escapeHtml(l.meeting.hippodrome || l.race.lieu || '')} - C${l.race.numeroCourse} - N&deg;${l.numero} ${escapeHtml(l.nom)}</div>
          <div class="muted small">${l.niveau === 'jouer' ? `<span class="bold">${parisTxt(l.paris)}</span> &middot; ` : ''}cote ${l.cote ? fmt1(l.cote) : '?'}${l.info ? ` &middot; ${l.info}` : ''}</div>
          ${resultatHtml(l)}
        </div>
        <div class="muted">&rsaquo;</div>
      </div>`;

  const blocSelection = (sel, jour) => {
    const liste = lignes.filter((l) => l.sel === sel && l.jour === jour);
    const jouer = liste.filter((l) => l.niveau === 'jouer').sort(tri);
    const attente = liste.filter((l) => l.niveau === 'attente').sort(tri);
    let extra = '';
    if (jour === data.jourPop) {
      if (sel === 'favori' && data.favoriNonImporte) {
        const q = data.favoriNonImporte;
        extra = `<p class="small tag-orange bold" style="margin:4px 0;">&Agrave; jouer, mais course non import&eacute;e : R${q.reunion}C${q.course} N&deg;${q.numero} ${escapeHtml(q.cheval)} (cote du fichier ${fmt1(q.coteRetenue)}). Importez cette r&eacute;union pour confirmer la cote.</p>`;
      }
      if (sel === 'ia1' && data.ia1NonImporte) {
        const q = data.ia1NonImporte;
        extra = `<p class="small tag-orange bold" style="margin:4px 0;">Rang 1 du jour dans une course non import&eacute;e : R${q.reunion}C${q.course} N&deg;${q.numero} ${escapeHtml(q.cheval)} (IA Plac&eacute; ${fmt1(q.iaPlace)}&nbsp;%, cote du fichier ${q.cote ? fmt1(q.cote) : '?'}).</p>`;
      }
    }
    const vide = jouer.length === 0 && !extra ? '<p class="muted small" style="margin:4px 0;">Aucun jeu confirm&eacute; pour l\'instant.</p>' : '';
    return `
      <div class="card" style="margin-bottom:10px;">
        <h3 style="margin-bottom:4px;">${SELECTIONS[sel].nom} <span class="small muted">&middot; ${parisTxt(SELECTIONS[sel].paris)}</span></h3>
        ${jouer.length > 0 ? `<p class="small tag-green bold" style="margin:0 0 6px;">&Agrave; jouer (${jouer.length})</p><div class="list-group">${jouer.map(ligneHtml).join('')}</div>` : vide}
        ${extra}
        ${attente.length > 0 ? `<details style="margin-top:8px;"><summary class="small bold tag-orange">En attente de confirmation par les cotes (${attente.length})</summary><div class="list-group" style="margin-top:6px;">${attente.map(ligneHtml).join('')}</div></details>` : ''}
      </div>`;
  };

  const manques = [];
  if (!data.jourPop) manques.push('fichier Popularit&eacute; non import&eacute; : Favori populaire et Rang 1 IA Plac&eacute; indisponibles');
  else if (!jours.includes(data.jourPop)) manques.push(`le fichier Popularit&eacute; import&eacute; est celui du ${new Date(data.jourPop).toLocaleDateString('fr-FR')}, qui ne correspond &agrave; aucune r&eacute;union import&eacute;e`);

  appEl.innerHTML = `
    <div class="card" style="margin-bottom:10px;">
      <p class="small muted" style="margin:0;">Jeux finaux des quatre s&eacute;lections, calcul&eacute;s avec les cotes actuellement en base. Les cotes bougent jusqu'au d&eacute;part : rafra&icirc;chissez-les quelques minutes avant chaque course, un jeu peut appara&icirc;tre ou dispara&icirc;tre.</p>
      ${manques.map((m) => `<p class="small tag-orange bold" style="margin:6px 0 0;">${m}.</p>`).join('')}
      <button class="btn btn-primary btn-block" data-refresh-cotes-jeux style="margin-top:8px;"${aRafraichir.length === 0 ? ' disabled' : ''}>Rafra&icirc;chir les cotes (${aRafraichir.length} course${aRafraichir.length > 1 ? 's' : ''} &agrave; venir)</button>
      ${sansArrivee.length + sansRapport.length > 0 ? `<button class="btn btn-secondary btn-block" data-resultats-jeux style="margin-top:8px;">R&eacute;cup&eacute;rer arriv&eacute;es et rapports (${sansArrivee.length + sansRapport.length})</button>` : ''}
      <div id="jeux-status"></div>
    </div>
    ${jours.map((jour) => `
      ${jours.length > 1 ? `<h3 style="margin:14px 0 8px;">${new Date(jour).toLocaleDateString('fr-FR')}</h3>` : ''}
      ${ORDRE_SELECTIONS.map((sel) => blocSelection(sel, jour)).join('')}
    `).join('')}
    ${liensHtml}
  `;
  bindGoto();

  const statusEl = appEl.querySelector('#jeux-status');
  const progress = (html) => { statusEl.innerHTML = `<p class="muted small" style="margin-top:8px;">${html}</p>`; };
  const btnCotes = appEl.querySelector('[data-refresh-cotes-jeux]');
  if (btnCotes && !btnCotes.disabled) {
    btnCotes.addEventListener('click', async () => {
      btnCotes.disabled = true;
      const r = await rafraichirCotesCourses(aRafraichir, progress);
      if (parseHash()[0] !== 'simplegagnant') return;
      await renderBilanSimpleGagnant();
      const el = appEl.querySelector('#jeux-status');
      if (el) el.innerHTML = `<p class="muted small" style="margin-top:8px;">Cotes mises &agrave; jour : ${r.ok} course(s)${r.fail > 0 ? `, ${r.fail} &eacute;chec(s)` : ''}.</p>`;
    });
  }
  const btnRes = appEl.querySelector('[data-resultats-jeux]');
  if (btnRes) {
    btnRes.addEventListener('click', async () => {
      btnRes.disabled = true;
      const cibles = [...new Map([...sansArrivee, ...sansRapport].map((l) => [l.race.id, l])).values()];
      const { ok, fail } = await recupererResultatsCourses(cibles, progress);
      if (parseHash()[0] !== 'simplegagnant') return;
      await renderBilanSimpleGagnant();
      const el = appEl.querySelector('#jeux-status');
      if (el) el.innerHTML = `<p class="muted small" style="margin-top:8px;">R&eacute;sultats : ${ok} course(s) mise(s) &agrave; jour${fail > 0 ? `, ${fail} &eacute;chec(s)` : ''}. Cotes non modifi&eacute;es.</p>`;
    });
  }
}

/**
 * Retrouve le rang IA Place (1 a 5) d'un cheval d'une course, si le Top IA
 * Place du jour a ete importe et que ce cheval y figure. `null` sinon.
 * @param {Array|null} topIAPlace - retour de `chargerTopIAPlace`.
 * @param {string} lieu - `context.lieu` de la course.
 * @param {number} numeroCourse
 * @param {number} numeroCheval
 * @returns {number|null}
 */
function rangIAPlacePour(topIAPlace, lieu, numeroCourse, numeroCheval) {
  return trouverRangIAPlace(topIAPlace, lieu, numeroCourse, numeroCheval);
}

/**
 * HTML du badge "Top N IA Place" pour un cheval, si son rang a ete retrouve
 * dans le Top IA Place du jour importe (cf. `rangIAPlacePour`). Chaine vide
 * si le cheval n'y figure pas ou si rien n'a ete importe.
 * @param {number|null} rang
 * @returns {string}
 */
function badgeTopIAPlaceHtml(rang) {
  if (!rang) return '';
  return ` <span class="small tag-green bold" title="Fait partie du Top 5 IA Place Turf BZH du jour (rang ${rang}) - informatif, n'entre dans aucun calcul de Score Global/Value/classement">Top ${rang} IA Plac&eacute;</span>`;
}

// Version de l'application, affichee dans la barre du haut sur toutes les
// pages (voir renderTopbar) pour permettre de verifier facilement que
// plusieurs appareils (PC, iPhone...) utilisent bien la meme version
// deployee - a la demande de l'utilisateur (aout 2026), suite a des
// classements/selections differents entre appareils dus a des donnees
// locales desynchronisees (cotes, historique). IMPORTANT : a mettre a jour
// EN MEME TEMPS que CACHE_NAME dans sw.js a chaque livraison (meme valeur).
const APP_VERSION = 'v130';

const TABS = [
  { id: 'meetings', label: 'Reunions', icon: '\u{1F3C1}' },
  { id: 'feuvert', label: 'Top base', icon: '\u{1F7E2}' },
  { id: 'liste', label: 'Courses du jour', icon: '⏱️' },
  { id: 'simplegagnant', label: 'Simple G/P', icon: '\u{1F4B0}' },
  { id: 'bilan', label: 'Bilan', icon: '\u{1F4CA}' },
  { id: 'methode', label: 'M\u00e9thode', icon: '\u{1F4D6}' },
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
  const known = ['meetings', 'import', 'feuvert', 'liste', 'simplegagnant', 'bilan', 'methode', 'race'];
  if (parts.length === 0) return 'meetings';
  if (parts[0] === 'race') return 'meetings';
  if (parts[0] === 'resultat') return 'feuvert';
  if (parts[0] === 'bilanglobalsimplegagnant') return 'bilan';
  if (parts[0] === 'regletrot') return 'bilan';
  if (parts[0] === 'simplegpancien') return 'bilan';
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
    } else if (parts[0] === 'bilan') {
      await renderBilan();
    } else if (parts[0] === 'methode') {
      renderMethode();
    } else if (parts[0] === 'simplegpancien') {
      await renderBilanSimpleGPAncien();
    } else if (parts[0] === 'bilanglobalsimplegagnant') {
      await renderBilanGlobalSimpleGagnant();
    } else if (parts[0] === 'regletrot') {
      await renderBilanRegleTrotGF();
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
    const topIAPlace = await chargerTopIAPlace();
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
        await verifierEtNotifierCourse(meeting, race, toutesPerfs, topIAPlace);
      }
    }
  } catch (err) {
    console.error('Surveillance JSG : erreur pendant la verification', err);
  }
}

async function verifierEtNotifierCourse(meeting, race, toutesPerfs, topIAPlace) {
  try {
    const dateVal = new Date(meeting.date).toISOString().slice(0, 10);
    const horseRecords = await DB.getHorsesForRace(race.id);
    const cotesPmu = await fetchCotesAvecFallback(dateVal, meeting.numeroReunion, race.numeroCourse);
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
      typeCourse: race.typeCourse,
      distanceJour: race.distanceJour,
      allocation: race.allocation,
      nbPartants: horsesFinal.length
    };
    const result = RaceAnalyzer.analyser(horsesFinal, context, false);
    const jeu = jeuSimpleGP(result.chevaux, topIAPlace, race.lieu, race.numeroCourse);

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
  const placeTxt = `Place N° ${jeu.place.chevaux.map((c) => c.entry.numero).join('-')}`;
  const gagnantTxt = jeu.gagnant ? ` - Gagnant N°${jeu.gagnant.chevaux[0].entry.numero}` : '';
  const titre = `Simple G/P possible : ${meeting.hippodrome} C${race.numeroCourse}`;
  const corps = `${placeTxt}${gagnantTxt} - depart ${race.heureDepart || ''}`;
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
      <p class="bold">Surveillance auto - Simple G/P</p>
      <p class="small muted">Verifie les cotes 3 min avant le depart de chaque course du jour et notifie si le Simple G/P (Top 5 IA Plac&eacute; &times; Value&le;-30) est rentable. Necessite l'appli ouverte au premier plan.</p>
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
        const cotesPmu = await fetchCotesAvecFallback(dateVal, numReunion, race.numeroCourse);
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
    typeCourse: race.typeCourse,
    distanceJour: race.distanceJour,
    allocation: race.allocation,
    nbPartants: horses.length
  };

  const result = RaceAnalyzer.analyser(horses, context, useCote8h);
  const basesEtDangers = calculerBasesEtDangers(result.chevaux, context.discipline.canonical);
  const cotesCibles = calculerCotesCibles(result.chevaux, context.nbPartants);
  const topIAPlace = await chargerTopIAPlace();
  lastAnalysis = { raceId, result, useCote8h, horseRecords };

  // Regle "Favori populaire" (v126) : badge sur le cheval de CETTE course
  // qui remplit les trois conditions (favori + le plus populaire + n. 1 IA
  // Gagnant), avec mention "du jour" s'il est la selection a jouer.
  const badgesFavori = new Map();
  try {
    const fp = await calculerFavoriPopulaire();
    if (fp) {
      for (const q of fp.qualifies) {
        const lien = fp.liens.get(cleFavori(q));
        if (!lien || lien.raceId !== raceId) continue;
        const duJour = fp.selection && cleFavori(fp.selection) === cleFavori(q);
        badgesFavori.set(lien.horseId, `<div class="small tag-green bold" title="Favori de la course + le plus populaire + n. 1 IA Gagnant (fichier Popularite Turf BZH)${duJour ? ' - plus petite cote des qualifies du jour : a jouer en simple gagnant' : ''}">${duJour ? 'Favori populaire du jour : &agrave; jouer en simple gagnant' : 'Favori populaire'}</div>`);
      }
    }
  } catch (err) { console.error('Favori populaire', err); }

  // Regle "Nouveau D4" (v128) : mention sous le cheval concerne.
  try {
    if (meeting && estTrot(race.discipline) && horseRecords.some((h) => normaliserFerrure(h.ferrage) === 'D4')) {
      const ferrures = await DB.getFerruresPourNoms(horseRecords.map((h) => cleCheval(h.nom)));
      const items = affinerItemsD4(evaluerNouveauxD4([{ meeting, race, horses: horseRecords }], toutesPerfs, ferrures), toutesPerfs, new Map([[race.id, horseRecords]]));
      for (const it of items) {
        const prec = `course pr&eacute;c&eacute;dente : ${escapeHtml(libelleFerrure(it.precedente.ferrure))}`;
        let texte;
        let classe;
        if (it.affine.niveau === 'jouer') { texte = `Nouveau D4 : &agrave; jouer en simple gagnant (${it.affine.rangCote}e cote, Value ${fmt0(it.value)}, ${prec})`; classe = 'tag-green'; }
        else if (it.affine.niveau === 'attente') { texte = `Nouveau D4 en attente - ${manqueD4Txt(it)} (${prec})`; classe = 'tag-orange'; }
        else if (it.statut === 'hors_cote') { texte = `Nouveau D4, cote hors ${COTE_MIN_NOUVEAU_D4}-${COTE_MAX_NOUVEAU_D4} : non jou&eacute; (${prec})`; classe = 'tag-gray'; }
        else { texte = 'Nouveau D4 &agrave; v&eacute;rifier (ferrure pr&eacute;c&eacute;dente non renseign&eacute;e)'; classe = 'tag-orange'; }
        badgesFavori.set(it.horse.id, `${badgesFavori.get(it.horse.id) || ''}<div class="small ${classe} bold">${texte}</div>`);
      }
    }
  } catch (err) { console.error('Nouveau D4', err); }

  appEl.innerHTML = `
    <div class="segmented">
      <button data-cote="false" class="${!useCote8h ? 'active' : ''}">Cote directe</button>
      <button data-cote="true" class="${useCote8h ? 'active' : ''}">Cote 8h</button>
    </div>

    <div id="arrivee-block">${arriveeOfficielleHtml(race)}</div>

    ${couvertureHistoriqueHtml(result.chevaux)}

    <div class="list-group">
      ${result.chevaux.map((c) => horseRowHtml(c, raceId, useCote8h, badgesFavori.get(c.entry.id) || '')).join('')}
    </div>

    <button class="btn btn-secondary btn-block" data-zeturf style="margin-top:8px;">Mettre a jour les cotes en direct</button>
    <div id="zeturf-status"></div>
    <div id="cotebzh-status"></div>
    <div id="regle-trot-gf">${regleTrotGFHtml(race, horseRecords)}</div>

    ${basesEtDangersHtml(basesEtDangers, cotesCibles, result.resume, result.chevaux, context.discipline.canonical, context.lieu, context.typeCourse, topIAPlace, race.numeroCourse)}

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

  bindJeuSimpleGP(result.chevaux, topIAPlace, race.lieu, race.numeroCourse);

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
      const cotesPmu = await fetchCotesAvecFallback(dateVal, numReunion, numCourse);
      const cotesUtilisables = cotesPmu.filter((c) => c.cote != null).map((c) => ({ numero: c.numero, cote: c.cote }));
      const ancienneCoteParNumero = Object.fromEntries(horseRecords.map((h) => [h.numero, h.coteDirecte > 0 ? h.coteDirecte : null]));
      const { correspondances } = apparierCotesZeturf(horseRecords, cotesUtilisables, ancienneCoteParNumero);

      // v126 : on repart des chevaux RELUS en base (et non de la copie
      // chargee a l'ouverture de la page) pour ne pas ecraser la Cote_BZH
      // enregistree entre-temps par `afficherCoteBzh` - c'est ce qui faisait
      // disparaitre les cotes BZH apres une 2e mise a jour.
      const frais = await DB.getHorsesForRace(raceId);
      const updated = frais
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

      // Cote_BZH (a la demande explicite de l'utilisateur) : information
      // COMPLEMENTAIRE et facultative (ne fait tomber ni bloquer aucun
      // affichage principal si absente ou en echec) - l'estimation "juste
      // prix" du modele turf.bzh, a comparer a la cote de marche. Recuperee
      // APRES le re-rendu de la page (qui recree le DOM), puis injectee dans
      // la div persistante #cotebzh-status. Ce n'est ni un pronostic ni une
      // promesse de rendement (voir turfBzhApi.js) : simple complement
      // d'information, affiche seulement si le proxy turf.bzh est configure
      // et que des chevaux de CETTE course y figurent.
      afficherCoteBzh(dateVal, numReunion, race.numeroCourse, horseRecords).catch(() => {});
    } catch (err) {
      btn.disabled = false;
      statusEl.innerHTML = `<p class="muted small" style="margin-top:8px;">Mise a jour automatique impossible (${escapeHtml(err.message || String(err))}). Reessayez plus tard.</p>`;
    }
  });
}

/**
 * Recupere la Cote_BZH (estimation "juste prix" du modele turf.bzh) de
 * CHAQUE partant de la course, via le dossier complet (`fetchCoteBzhParPartant`,
 * qui couvre tous les chevaux - contrairement aux "value-bets", limites a
 * ceux signales du jour toutes courses confondues), et l'injecte dans la
 * petite ligne `[data-cotebzh-cell]` deja presente sur chaque ligne de
 * `horseRowHtml` (reperee par `data-horse-numero`). A la demande explicite
 * de l'utilisateur : Cote_BZH pour chaque concurrent, pas seulement les
 * value-bets. N'affiche RIEN (silencieux) si le proxy turf.bzh n'est pas
 * configure, si l'appel echoue, ou si Cote_BZH est absente pour un cheval
 * donne - purement complementaire, jamais bloquant. En complement,
 * `#cotebzh-status` (si present) rappelle en une ligne que ce n'est ni un
 * pronostic ni une promesse de rendement, uniquement si au moins une valeur
 * a pu etre affichee.
 * @param {string} dateVal - date ISO (AAAA-MM-JJ).
 * @param {number} numReunion
 * @param {number} numCourse
 * @param {Array} horseRecords - chevaux de la course (pour le matching par numero).
 */
async function afficherCoteBzh(dateVal, numReunion, numCourse, horseRecords) {
  const el = appEl.querySelector('#cotebzh-status');
  const parPartant = await fetchCoteBzhParPartant(dateVal, numReunion, numCourse);

  // A la demande de l'utilisateur (retour "la mise a jour des cotes n'affiche
  // pas les cotes BZH") : au lieu de rester totalement silencieux en cas
  // d'echec (contrat d'origine, pour ne jamais bloquer l'affichage
  // principal), on affiche desormais UNE ligne discrete expliquant pourquoi,
  // via le diagnostic memorise par turfBzhApi.js (_diagnosticCoteBzh). Ca
  // reste facultatif/non bloquant : aucune exception, rien d'autre sur la
  // page n'est affecte.
  if (!parPartant || parPartant.length === 0) {
    if (el) {
      const raison = _diagnosticCoteBzh() || 'raison inconnue';
      el.innerHTML = `<p class="muted small" style="margin-top:8px;">Cote_BZH (turf.bzh) indisponible pour cette course : ${escapeHtml(raison)}.</p>`;
    }
    return;
  }

  // Regle Trot « gains faibles » : memorise Cote_BZH / Gains_Totaux /
  // Musique turf.bzh sur chaque cheval (IndexedDB), puis rafraichit le bloc
  // de la regle - la Cote_BZH n'est pas dans le fichier partants importe.
  await enregistrerDonneesBzh(horseRecords, parPartant);
  await rafraichirBlocRegleTrotGF(horseRecords[0] ? horseRecords[0].raceId : null);

  const numeros = new Set(horseRecords.map((h) => h.numero));
  const pertinents = parPartant.filter((p) => p.numero != null && numeros.has(p.numero) && p.coteBzh != null);

  if (pertinents.length === 0) {
    // Le dossier a bien ete recupere (partants trouves), mais aucun d'eux
    // n'a de Cote_BZH renseignee - cas legitime et attendu : le champ
    // Cote_BZH n'est rempli qu'a ~50,3% dans la base turf.bzh (voir
    // CONTEXTE/02-api-turf-bzh.md), certaines courses n'ont donc aucun
    // cheval avec cette donnee.
    if (el) {
      el.innerHTML = '<p class="muted small" style="margin-top:8px;">Cote_BZH (turf.bzh) : dossier recupere, mais aucun cheval de cette course n\'a de Cote_BZH renseignee (champ rempli a environ 50% seulement selon turf.bzh).</p>';
    }
    return;
  }

  let nbAffiches = 0;
  for (const p of pertinents) {
    const ligne = appEl.querySelector(`[data-horse-numero="${p.numero}"]`);
    const cellule = ligne ? ligne.querySelector('[data-cotebzh-cell]') : null;
    if (!cellule) continue;
    cellule.textContent = `Cote_BZH ${p.coteBzh.toFixed(1)}`;
    cellule.style.display = '';
    nbAffiches++;
  }

  if (el) {
    el.innerHTML = nbAffiches > 0
      ? '<p class="muted small" style="margin-top:8px;">Cote_BZH (turf.bzh) affichee ci-dessus pour chaque concurrent concerne : une estimation "juste prix" a comparer a la cote de marche, ni un pronostic ni une promesse de rendement.</p>'
      : '<p class="muted small" style="margin-top:8px;">Cote_BZH (turf.bzh) recuperee, mais aucune ligne de cheval correspondante trouvee sur la page (bug d\'affichage a signaler).</p>';
  }
}

// -------------------------------------------------------------------
// REGLE TROT « GAINS FAIBLES, DERNIERE COURSE RATEE » (figee 29/09/2026)
// Voir js/engine/regleTrotGF.js. 1 EUR simple gagnant par cheval retenu.
// -------------------------------------------------------------------

/**
 * Enregistre sur les chevaux (IndexedDB) les donnees turf.bzh du dossier :
 * Cote_BZH, Gains_Totaux et Musique (si presentes). Ne touche a aucun autre
 * champ. Relit les chevaux en base avant ecriture pour ne pas ecraser une
 * cote directe mise a jour entre-temps.
 * @returns {Promise<number>} nombre de chevaux mis a jour.
 */
async function enregistrerDonneesBzh(horseRecords, parPartant) {
  if (!Array.isArray(parPartant) || parPartant.length === 0 || !horseRecords || horseRecords.length === 0) return 0;
  const raceId = horseRecords[0].raceId;
  const frais = raceId ? await DB.getHorsesForRace(raceId) : horseRecords;
  const parNumero = new Map(parPartant.filter((p) => p.numero != null).map((p) => [p.numero, p]));
  const maj = [];
  for (const h of frais) {
    const p = parNumero.get(h.numero);
    if (!p) continue;
    const suivant = { ...h };
    let change = false;
    if (p.coteBzh != null && p.coteBzh !== h.coteBzh) { suivant.coteBzh = p.coteBzh; change = true; }
    if (p.gainsTotaux != null && p.gainsTotaux !== h.gainsTotauxBzh) { suivant.gainsTotauxBzh = p.gainsTotaux; change = true; }
    if (p.musique && p.musique !== h.musiqueBzh) { suivant.musiqueBzh = p.musique; change = true; }
    if (change) maj.push(suivant);
  }
  if (maj.length > 0) await DB.updateHorses(maj);
  return maj.length;
}

/**
 * Convertit les chevaux d'une course au format attendu par
 * `evaluerRegleTrotGF` (cote PMU = cote directe, sinon cote 8h ; musique du
 * fichier partants, sinon celle de turf.bzh ; gains d'une seule source pour
 * toute la course).
 */
function partantsRegleTrotGF(horseRecords) {
  const { source, gainsDe } = choisirGainsCourse(horseRecords);
  const partants = horseRecords.map((h) => ({
    numero: h.numero,
    nom: h.nom,
    cotePmu: h.coteDirecte > 0 ? h.coteDirecte : (h.cote8h > 0 ? h.cote8h : null),
    coteBzh: h.coteBzh ?? null,
    gains: gainsDe(h),
    musique: h.musique || h.musiqueBzh || '',
    age: ageDepuisSexeAge(h.sexeAge)
  }));
  return { partants, sourceGains: source };
}

function evaluerCourseRegleTrotGF(race, horseRecords) {
  const disc = disciplineFromRaw(race.discipline).canonical;
  const { partants, sourceGains } = partantsRegleTrotGF(horseRecords);
  return { ...evaluerRegleTrotGF(disc, partants), sourceGains };
}

function ligneChevalRegleTrotGFHtml(c) {
  const age4 = c.age === 4 ? ' <span class="tag-orange bold" title="4 ans : ROI historique -24,7 %, a surveiller (non exclus)">4 ans</span>' : '';
  return `<p class="small" style="margin:2px 0;"><span class="bold">N&deg;${c.numero} ${escapeHtml(c.nom)}</span>${age4}
    &middot; cote ${c.cotePmu != null ? fmt1(c.cotePmu) : '-'}
    &middot; BZH ${c.coteBzh != null ? fmt1(c.coteBzh) : '?'}
    &middot; gains ${c.ratioGains != null ? Math.round(c.ratioGains * 100) + '&nbsp;%' : '-'} du max
    &middot; dernier signe ${escapeHtml(c.dernierSigne || '-')}</p>`;
}

/**
 * Bloc "Regle Trot gains faibles" de la page course. Rien pour une course
 * hors trot (la regle perd au plat).
 */
function regleTrotGFHtml(race, horseRecords) {
  if (!estDisciplineTrot(disciplineFromRaw(race.discipline).canonical)) return '';
  const ev = evaluerCourseRegleTrotGF(race, horseRecords);
  const titre = '<p class="bold" style="margin:0 0 4px;">R&egrave;gle Trot &laquo; gains faibles, derni&egrave;re course rat&eacute;e &raquo;</p>';
  const pied = `<p class="muted small" style="margin-top:6px;">1&nbsp;&euro; simple gagnant par cheval retenu : Cote_BZH &lt; 10, cote PMU 3 &agrave; 8, gains &lt; 50&nbsp;% du plus riche, derni&egrave;re course 4e ou au-del&agrave; / D / A. R&egrave;gle fig&eacute;e le 29/09/2026 (suivi oct.-d&eacute;c. 2026) : ROI historique +13,1&nbsp;% mais fourchette 95&nbsp;% de -5,2&nbsp;% &agrave; +31,5&nbsp;%, non prouv&eacute;. Revérifier la cote PMU au d&eacute;part.</p>`;
  if (!ev.applicable) {
    const importAncien = horseRecords.length > 0 && horseRecords.every((h) => h.gains === undefined && h.gainsTotauxBzh == null);
    const aide = importAncien
      ? 'R&eacute;union import&eacute;e avant la v121 (gains et musique non enregistr&eacute;s). R&eacute;importez le fichier partants de cette r&eacute;union (onglet Importer &gt; R&eacute;union du jour).'
      : 'Colonne Gains vide ou absente du fichier partants pour cette course.';
    return `<div class="card" style="margin:10px 0;">${titre}<p class="muted small" style="margin:0;">Non &eacute;valuable : ${escapeHtml(ev.raison || '')}.</p><p class="small tag-orange" style="margin:4px 0 0;">${aide}</p></div>`;
  }
  const musiquesAbsentes = horseRecords.length > 0 && horseRecords.every((h) => !h.musique && !h.musiqueBzh);
  if (musiquesAbsentes) {
    return `<div class="card" style="margin:10px 0;">${titre}<p class="muted small" style="margin:0;">Non &eacute;valuable : musique absente pour tous les partants.</p><p class="small tag-orange" style="margin:4px 0 0;">R&eacute;importez le fichier partants de cette r&eacute;union (onglet Importer &gt; R&eacute;union du jour).</p></div>`;
  }

  let corps = '';
  if (ev.retenus.length > 0) {
    corps += `<p class="small tag-green bold" style="margin:0 0 4px;">&Agrave; jouer : ${ev.retenus.length} cheval(aux) &middot; mise ${ev.retenus.length * REGLE_TROT_GF.MISE}&nbsp;&euro;</p>`;
    corps += ev.retenus.map(ligneChevalRegleTrotGFHtml).join('');
    const ordre = CSVImporter.parseOrdreArrivee(race.arriveeBrute || '');
    if (ordre.length > 0) {
      const gagnant = ev.retenus.find((c) => c.numero === ordre[0]);
      corps += gagnant
        ? `<p class="small tag-green bold" style="margin-top:4px;">Gagn&eacute; : N&deg;${gagnant.numero} (cote ${fmt1(gagnant.cotePmu)})</p>`
        : '<p class="small tag-red bold" style="margin-top:4px;">Perdu</p>';
    }
  } else if (ev.aConfirmer.length === 0) {
    corps += '<p class="small tag-red bold" style="margin:0;">Aucun cheval retenu</p>';
  }
  if (ev.aConfirmer.length > 0) {
    corps += `<p class="small tag-orange bold" style="margin:${ev.retenus.length > 0 ? '6px' : '0'} 0 4px;">&Agrave; confirmer (Cote_BZH inconnue, &agrave; jouer si &lt; 10) :</p>`;
    corps += ev.aConfirmer.map(ligneChevalRegleTrotGFHtml).join('');
  }
  if (ev.nbCoteBzh === 0) {
    corps += '<p class="muted small" style="margin-top:4px;">Cote_BZH pas encore r&eacute;cup&eacute;r&eacute;e : bouton &laquo; Mettre a jour les cotes en direct &raquo;.</p>';
  }
  if (ev.sourceGains === 'csv') {
    corps += '<p class="muted small" style="margin-top:2px;">Gains : colonne Gains du fichier partants (Gains_Totaux turf.bzh non disponible pour tous les partants).</p>';
  }
  return `<div class="card" style="margin:10px 0;">${titre}${corps}${pied}</div>`;
}

async function rafraichirBlocRegleTrotGF(raceId) {
  const el = appEl.querySelector('#regle-trot-gf');
  if (!el || !raceId) return;
  const race = await DB.getRace(raceId);
  if (!race) return;
  const horseRecords = await DB.getHorsesForRace(raceId);
  el.innerHTML = regleTrotGFHtml(race, horseRecords);
}

/**
 * Collecte, sur toutes les reunions importees, les chevaux retenus par la
 * regle (courses de trot uniquement).
 */
async function collecterParisRegleTrotGF() {
  const meetings = await DB.getAllMeetings();
  const paris = [];
  const coursesSansBzh = [];
  for (const meeting of meetings) {
    const races = await DB.getRacesForMeeting(meeting.id);
    const dateISO = new Date(meeting.date).toISOString().slice(0, 10);
    for (const race of races) {
      if (!estDisciplineTrot(disciplineFromRaw(race.discipline).canonical)) continue;
      const horseRecords = await DB.getHorsesForRace(race.id);
      if (horseRecords.length === 0) continue;
      // Toute course de trot sans aucune Cote_BZH en base : candidate a la
      // recuperation groupee (le dossier turf.bzh apporte aussi Gains_Totaux
      // et Musique, utiles meme si la course n'est pas encore evaluable).
      if (!horseRecords.some((h) => h.coteBzh != null)) coursesSansBzh.push({ meeting, race, horseRecords });
      const ev = evaluerCourseRegleTrotGF(race, horseRecords);
      if (!ev.applicable) continue;
      const ordre = CSVImporter.parseOrdreArrivee(race.arriveeBrute || '');
      for (const c of ev.retenus) {
        paris.push({
          meeting, race, dateISO, cheval: c,
          arriveeConnue: ordre.length > 0,
          gagnant: ordre.length > 0 && ordre[0] === c.numero,
          cote: c.cotePmu,
          age: c.age
        });
      }
    }
  }
  paris.sort((a, b) => (b.dateISO.localeCompare(a.dateISO)) || (a.race.numeroCourse - b.race.numeroCourse));
  return { paris, coursesSansBzh };
}

function bilanRegleTrotGFHtml(titre, paris) {
  const resolus = paris.filter((p) => p.arriveeConnue);
  const b = bilanRegleTrotGF(resolus);
  const pct = (x) => (x == null ? '-' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}&nbsp;%`);
  return `<div class="card" style="margin-bottom:10px;">
      <p class="bold" style="margin:0 0 4px;">${titre}</p>
      <p class="small" style="margin:0;">${b.n} pari(s) r&eacute;solu(s) (${paris.length - resolus.length} en attente d'arriv&eacute;e) &middot; gagnants ${b.nGagnants}${b.n > 0 ? ` (${Math.round((b.nGagnants / b.n) * 100)}&nbsp;%)` : ''}</p>
      <p class="small" style="margin:2px 0 0;">Mise ${b.mise.toFixed(2)}&nbsp;&euro; &middot; b&eacute;n&eacute;fice ${b.benefice >= 0 ? '+' : ''}${b.benefice.toFixed(2)}&nbsp;&euro; &middot; <span class="bold ${b.roi == null ? '' : (b.roi >= 0 ? 'tag-green' : 'tag-red')}">ROI ${pct(b.roi)}</span></p>
      <p class="muted small" style="margin:2px 0 0;">Dont 4 ans : ${b.ans4.n} pari(s), ROI ${pct(b.ans4.roi)}</p>
    </div>`;
}

/**
 * Recupere Cote_BZH / Gains_Totaux / Musique pour une liste de courses :
 * d'abord UN appel par journee (GET /v1/journees/{date}/partants, tous les
 * partants du jour), puis, pour les seules courses absentes de cette
 * reponse, repli course par course sur le dossier (1 appel/1,1 s, quota
 * 60/min).
 * @param {Array<{meeting, race, horseRecords}>} liste
 * @param {function(string)} onProgress
 */
async function recupererCotesBzhGroupees(liste, onProgress) {
  let appels = 0;
  let okCourses = 0;
  let sansCote = 0;
  const repli = [];
  const parDate = new Map();
  for (const c of liste) {
    const d = new Date(c.meeting.date).toISOString().slice(0, 10);
    if (!parDate.has(d)) parDate.set(d, []);
    parDate.get(d).push(c);
  }
  let n = 0;
  for (const [dateVal, courses] of parDate) {
    n++;
    onProgress(`Journ&eacute;e ${dateVal.split('-').reverse().join('/')} (${n}/${parDate.size}) : un seul appel pour ${courses.length} course(s)...`);
    const partants = await fetchJourneePartantsBzh(dateVal);
    appels++;
    for (const c of courses) {
      let lignes = partants.filter((p) => p.reunion === c.meeting.numeroReunion && p.course === c.race.numeroCourse);
      // Code RxCy ambigu (2 reunions le meme jour, rarissime) : on garde l'hippodrome de la course.
      const hippos = new Set(lignes.map((p) => p.hippodrome.trim().toUpperCase()).filter(Boolean));
      if (hippos.size > 1) lignes = lignes.filter((p) => p.hippodrome.trim().toUpperCase() === String(c.race.lieu || '').trim().toUpperCase());
      if (lignes.length === 0) { repli.push(c); continue; }
      await enregistrerDonneesBzh(c.horseRecords, lignes.map((p) => ({ numero: p.numero, coteBzh: p.coteBzh, gainsTotaux: p.gainsTotaux, musique: p.musique })));
      if (lignes.some((p) => p.coteBzh != null)) okCourses++; else sansCote++;
    }
    if (parDate.size > 1) await new Promise((r) => setTimeout(r, 1100));
  }
  for (let i = 0; i < repli.length; i++) {
    const { meeting, race, horseRecords } = repli[i];
    onProgress(`Repli course par course ${i + 1}/${repli.length} (${escapeHtml(meeting.hippodrome || '')} C${race.numeroCourse})...`);
    try {
      const dateVal = new Date(meeting.date).toISOString().slice(0, 10);
      const parPartant = await fetchCoteBzhParPartant(dateVal, meeting.numeroReunion, race.numeroCourse);
      appels++;
      await enregistrerDonneesBzh(horseRecords, parPartant);
      if (parPartant.some((p) => p.coteBzh != null)) okCourses++; else sansCote++;
    } catch (err) { console.error('Cote_BZH regle Trot GF', err); sansCote++; }
    if (i < repli.length - 1) await new Promise((r) => setTimeout(r, 1100));
  }
  return { okCourses, sansCote, appels };
}

async function renderBilanRegleTrotGF() {
  renderTopbar('Regle Trot GF', { back: () => navigate('bilan') });
  appEl.innerHTML = '<div class="card"><p class="muted">Calcul en cours...</p></div>';
  const { paris, coursesSansBzh } = await collecterParisRegleTrotGF();
  const suivi = paris.filter((p) => p.dateISO >= REGLE_TROT_GF.DEBUT_SUIVI && p.dateISO <= REGLE_TROT_GF.FIN_SUIVI);
  const sansArrivee = paris.filter((p) => !p.arriveeConnue);
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const sansBzhJour = coursesSansBzh.filter((c) => new Date(c.meeting.date).toISOString().slice(0, 10) === aujourdHui);

  const lignes = paris.slice(0, 300).map((p) => {
    const statut = !p.arriveeConnue ? '<span class="muted">en attente</span>'
      : (p.gagnant ? `<span class="tag-green bold">gagn&eacute; +${(p.cote - 1).toFixed(2)}&nbsp;&euro;</span>` : '<span class="tag-red">perdu -1&nbsp;&euro;</span>');
    return `<div class="list-item clickable" data-goto="race/${p.race.id}" style="display:block;">
        <p class="small" style="margin:0;"><span class="muted">${p.dateISO.split('-').reverse().join('/')} &middot; ${escapeHtml(p.meeting.hippodrome || '')} C${p.race.numeroCourse}</span> &middot; ${statut}</p>
        ${ligneChevalRegleTrotGFHtml(p.cheval)}
      </div>`;
  }).join('');

  appEl.innerHTML = `
    ${bilanRegleTrotGFHtml('Suivi oct.-d&eacute;c. 2026 (courses nouvelles)', suivi)}
    ${bilanRegleTrotGFHtml('Toutes les r&eacute;unions import&eacute;es', paris)}
    <p class="muted small" style="margin:0 0 10px;">Gain calcul&eacute; sur la derni&egrave;re cote directe enregistr&eacute;e (pas le rapport officiel). Les paris ne sont compt&eacute;s que pour les courses dont la Cote_BZH a &eacute;t&eacute; r&eacute;cup&eacute;r&eacute;e. Bilan &agrave; ~150 paris : oriente, ne prouve pas.</p>
    ${sansBzhJour.length > 0 ? `<button class="btn btn-primary btn-block" data-gf-bzh="jour">R&eacute;cup&eacute;rer toutes les Cote_BZH du jour (${sansBzhJour.length} course(s) de trot, 1 appel turf.bzh)</button>` : '<p class="muted small" style="margin:0 0 8px;">Cote_BZH d&eacute;j&agrave; r&eacute;cup&eacute;r&eacute;e pour toutes les courses de trot du jour.</p>'}
    ${coursesSansBzh.length > sansBzhJour.length ? `<button class="btn btn-secondary btn-block" data-gf-bzh="tout" style="margin-top:8px;">R&eacute;cup&eacute;rer les Cote_BZH manquantes de toutes les r&eacute;unions import&eacute;es (${coursesSansBzh.length} course(s), 1 appel par journ&eacute;e)</button>` : ''}
    ${sansArrivee.length > 0 ? `<button class="btn btn-secondary btn-block" data-gf-arrivees style="margin-top:8px;">R&eacute;cup&eacute;rer les arriv&eacute;es manquantes (${new Set(sansArrivee.map((p) => p.race.id)).size} course(s))</button>` : ''}
    <div id="gf-status"></div>
    <div class="list-group" style="margin-top:10px;">${lignes || '<div class="list-item"><p class="muted small" style="margin:0;">Aucun cheval retenu pour l\'instant.</p></div>'}</div>
  `;
  bindGoto();

  const statusEl = appEl.querySelector('#gf-status');
  appEl.querySelectorAll('[data-gf-bzh]').forEach((btnBzh) => btnBzh.addEventListener('click', async () => {
    appEl.querySelectorAll('[data-gf-bzh]').forEach((b) => { b.disabled = true; });
    const liste = btnBzh.dataset.gfBzh === 'jour' ? sansBzhJour : coursesSansBzh;
    const { okCourses, sansCote, appels } = await recupererCotesBzhGroupees(liste, (txt) => {
      statusEl.innerHTML = `<p class="muted small" style="margin-top:8px;">${txt}</p>`;
    });
    await renderBilanRegleTrotGF();
    const st = appEl.querySelector('#gf-status');
    if (st) st.innerHTML = `<p class="muted small" style="margin-top:8px;">Cote_BZH r&eacute;cup&eacute;r&eacute;e pour ${okCourses} course(s) en ${appels} appel(s) turf.bzh${sansCote > 0 ? ` ; ${sansCote} course(s) sans Cote_BZH (champ rempli &agrave; ~50&nbsp;% chez turf.bzh${_diagnosticCoteBzh() ? `, dernier message : ${escapeHtml(_diagnosticCoteBzh())}` : ''})` : ''}.</p>`;
  }));

  const btnArr = appEl.querySelector('[data-gf-arrivees]');
  if (btnArr) btnArr.addEventListener('click', async () => {
    btnArr.disabled = true;
    const courses = [...new Map(sansArrivee.map((p) => [p.race.id, p])).values()];
    for (let i = 0; i < courses.length; i++) {
      const { meeting, race } = courses[i];
      statusEl.innerHTML = `<p class="muted small" style="margin-top:8px;">Arriv&eacute;e ${i + 1}/${courses.length} (${escapeHtml(meeting.hippodrome || '')} C${race.numeroCourse})...</p>`;
      try {
        const dateVal = new Date(meeting.date).toISOString().slice(0, 10);
        const arrivee = await fetchResultatPmu(dateVal, meeting.numeroReunion, race.numeroCourse);
        if (arrivee && arrivee.length > 0) {
          race.arriveeBrute = arrivee.join('-');
          await DB.updateRace(race);
        }
      } catch (err) { console.error('Arrivee regle Trot GF', err); }
      if (i < courses.length - 1) await new Promise((r) => setTimeout(r, 400));
    }
    await renderBilanRegleTrotGF();
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

function horseRowHtml(c, raceId, useCote8h, badgeFavoriHtml = '') {
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
    <div class="horse-row list-item clickable" data-horse="${c.entry.id}" data-horse-numero="${c.entry.numero}">
      <div class="horse-rank">${c.classement}</div>
      <div class="horse-info">
        <div class="name">N&deg;${c.entry.numero} - ${escapeHtml(c.entry.nom)}</div>
        <div class="reco ${recommandationClass(c.recommandation)}">${escapeHtml(c.recommandation)}</div>${badgeFavoriHtml}
      </div>
      <div class="horse-metrics">
        <div class="score">${fmt1(c.scoreGlobal)}</div>
        <div class="sub">Cote ${cotePourAffichage ? fmt1(cotePourAffichage) : '-'}</div>
        <div class="sub muted" data-cotebzh-cell${c.entry.coteBzh != null ? '' : ' style="display:none;"'}>${c.entry.coteBzh != null ? `Cote_BZH ${Number(c.entry.coteBzh).toFixed(1)}` : ''}</div>
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
 * Carte "Simple G/P" (sept. 2026, a la demande explicite de l'utilisateur -
 * remplace ENTIEREMENT l'ancien "Jeu Simple Gagnant" Value&le;-30+MX+OR+MA,
 * juge non rentable dans la duree). Voir js/engine/jeuSimpleGP.js pour le
 * detail de la methode : croisement Top 5 IA Plac&eacute; Turf BZH du jour
 * &times; pool Value&le;-30. Simple PLACE jou&eacute; sur TOUS les chevaux
 * du croisement (pari prioritaire) ; Simple GAGNANT jou&eacute; uniquement
 * si le cheval au rang IA 1 fait partie du croisement.
 * @param {Array} chevaux - result.chevaux
 * @param {Array|null} topIAPlace - chargerTopIAPlace()
 * @param {string} lieu
 * @param {number} numeroCourse
 * @returns {string}
 */
function jeuSimpleGPHtml(chevaux, topIAPlace, lieu, numeroCourse) {
  const jeu = jeuSimpleGP(chevaux, topIAPlace, lieu, numeroCourse);
  if (!jeu.rentable) {
    return `<div class="card" style="margin-bottom:10px;">
        <p class="bold" style="margin:0 0 4px;">Simple G/P</p>
        <p class="small tag-red bold" style="margin:0;">Simple G/P non jouable</p>
        <p class="muted small" style="margin-top:4px;">Aucun cheval Value &le; -30 ne figure dans le Top 5 IA Plac&eacute; Turf BZH du jour (ou Top 5 IA Plac&eacute; non import&eacute; - onglet Importer).</p>
      </div>`;
  }
  const optionsMise = MISES_PRESETS_JEU_SIMPLE_GAGNANT.map((m) => `<option value="${m}">${m}&euro;</option>`).join('');

  const placeListHtml = jeu.rangsIA.map((r) => `N&deg;${r.numero}${badgeTopIAPlaceHtml(r.rang)}`).join(' - ');

  const placeHtml = `
      <p class="small" style="margin:0 0 4px;"><span class="tag-green bold">Simple Place (prioritaire)</span> : ${placeListHtml}</p>
      <div class="field" style="margin-bottom:8px;">
        <label for="jsg-mise-place-select">Mise totale Simple Place</label>
        <select id="jsg-mise-place-select">${optionsMise}</select>
      </div>`;

  const gagnantHtml = jeu.gagnant ? `
      <div class="field" style="margin:10px 0 8px;">
        <label for="jsg-mise-gagnant-select">Mise Simple Gagnant (N&deg;${jeu.gagnant.chevaux[0].entry.numero}, rang IA 1)</label>
        <select id="jsg-mise-gagnant-select">${optionsMise}</select>
      </div>`
    : `<p class="muted small" style="margin-top:8px;">Pas de Simple Gagnant propos&eacute; : le cheval au rang IA 1 ne fait pas partie du croisement Value&le;-30 sur cette course.</p>`;

  return `<div class="card" style="margin-bottom:10px;">
      <p class="bold" style="margin:0 0 4px;">Simple G/P</p>
      ${placeHtml}
      ${gagnantHtml}
      <button class="btn btn-secondary btn-block" id="jsg-calculer-btn">Calculer mise</button>
      <div id="jsg-resultat"></div>
      <p class="muted small" style="margin-top:8px;">Crois&eacute;e s&eacute;lections IA turfbzh (Top 5 IA Plac&eacute;, tous rangs) &times; notre pool Value&le;-30 : sur 214 jours (n=500), r&eacute;ussite Place 75,0% / rendement 101,5% &middot; r&eacute;ussite Gagnant 45,8% / rendement 95,4% (voir HEBERGEMENT.md). Mises en Dutching (proportionnelles a 1/cote) sur chacun des 2 pools.</p>
    </div>`;
}

/**
 * A appeler apres avoir injecte jeuSimpleGPHtml dans le DOM (voir
 * renderRaceDetail) : attache le clic du bouton "Calculer mise" au calcul
 * des mises Dutching Place (tous les chevaux du croisement) et, si
 * applicable, Gagnant (cheval au rang IA 1 seul).
 */
function bindJeuSimpleGP(chevaux, topIAPlace, lieu, numeroCourse) {
  const btn = appEl.querySelector('#jsg-calculer-btn');
  if (!btn) return;
  const jeu = jeuSimpleGP(chevaux, topIAPlace, lieu, numeroCourse);
  if (!jeu.rentable) return;
  btn.addEventListener('click', () => {
    const resultEl = appEl.querySelector('#jsg-resultat');
    if (!resultEl) return;

    const selectPlace = appEl.querySelector('#jsg-mise-place-select');
    const miseTotalePlace = selectPlace ? (Number(selectPlace.value) || 0) : 0;
    const misesPlace = misesJeuSimpleGagnant(jeu.place, miseTotalePlace);

    let gagnantHtml = '';
    if (jeu.gagnant) {
      const selectGagnant = appEl.querySelector('#jsg-mise-gagnant-select');
      const miseTotaleGagnant = selectGagnant ? (Number(selectGagnant.value) || 0) : 0;
      const misesGagnant = misesJeuSimpleGagnant(jeu.gagnant, miseTotaleGagnant);
      if (misesGagnant.length > 0) {
        const m = misesGagnant[0];
        gagnantHtml = `
          <p class="small bold" style="margin-top:10px;">Simple Gagnant</p>
          <div class="stat-grid"><div class="stat-cell"><div class="v">N&deg;${m.numero}</div><div class="l">cote ${fmt1(m.cote)} &middot; mise ${fmt0(m.mise)}&euro; &middot; gain ${fmt0(m.gain)}&euro;</div></div></div>`;
      }
    }

    if (misesPlace.length === 0) { resultEl.innerHTML = gagnantHtml; return; }
    const miseTotaleReelle = misesPlace.reduce((acc, m) => acc + m.mise, 0);
    resultEl.innerHTML = `
      <p class="small bold" style="margin-top:6px;">Simple Place</p>
      <div class="stat-grid">${misesPlace.map((m) => `
        <div class="stat-cell">
          <div class="v">N&deg;${m.numero}</div>
          <div class="l">cote ${fmt1(m.cote)} &middot; mise ${fmt0(m.mise)}&euro; &middot; gain ${fmt0(m.gain)}&euro;</div>
        </div>
      `).join('')}</div>
      <p class="small" style="margin-top:6px;">Mise totale Place : ${fmt0(miseTotaleReelle)}&euro; (mises arrondies &agrave; l'euro, principe du Dutching)</p>
      ${gagnantHtml}
    `;
  });
}

function basesEtDangersHtml(bd, cotesCibles, r, chevaux, disciplineCanonique, hippodrome, typeCourse, topIAPlace, numeroCourse) {
  const conseilJeuCard = conseilJeuHtml(bd, chevaux);
  const jeuSimpleGagnantCard = jeuSimpleGPHtml(chevaux, topIAPlace, hippodrome, numeroCourse);
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
      <h3>Top IA Plac&eacute;s (optionnel)</h3>
      <p class="muted small"><b>Inutile si le fichier Popularit&eacute; du jour est import&eacute; ci-dessous</b> : le Top 5 IA Plac&eacute; en est alors d&eacute;duit automatiquement (m&ecirc;mes chevaux, m&ecirc;mes rangs). Fichier CSV "export-premium-turfbzh-AAAAMMJJ" (Turf BZH Premium), section "TOP 5 IA PLAC&Eacute;" uniquement. Purement indicatif, n'entre dans aucun calcul de Score Global/Value/classement/dominance MX+OR+MA. Utilis&eacute; par "Courses du jour" (courses couvertes par le Top 5 IA du jour) et par la fiche course ("Jeu Simple Gagnant" et "Top IA Plac&eacute; &times; Value"). La date est lue dans le nom du fichier ; chaque r&eacute;import REMPLACE enti&egrave;rement le pr&eacute;c&eacute;dent (voir HEBERGEMENT.md).</p>
      <div class="field"><input type="file" id="file-top-ia-place" accept=".csv,text/csv,text/plain"></div>
    </div>

    <div class="card">
      <h3>Popularit&eacute; des chevaux (optionnel)</h3>
      <p class="muted small">Fichier Excel "Popularite_chevaux_AAAAMMJJ.xlsx" (Turf BZH). Un seul fichier Turf BZH pour deux usages : 1) le Top 5 IA Plac&eacute; du jour (les 5 plus forts IA Plac&eacute;, crois&eacute;s avec Value&le;-30 dans "Courses du jour" et "Simple G/P") ; 2) la r&egrave;gle "Favori populaire" (favori + le plus populaire + n&deg;&nbsp;1 IA Gagnant de sa course). Importer d'abord la r&eacute;union du jour : le Top 5 est rattach&eacute; aux courses import&eacute;es. La date est lue dans le nom du fichier ; chaque r&eacute;import REMPLACE enti&egrave;rement le pr&eacute;c&eacute;dent.</p>
      <div class="field"><input type="file" id="file-popularite" accept=".xlsx"></div>
    </div>

    <div class="card">
      <h3>Historique des ferrures - trot (optionnel)</h3>
      <p class="muted small">Pour la r&egrave;gle "Nouveau D4" : la ferrure de chaque cheval de trot est m&eacute;moris&eacute;e automatiquement &agrave; chaque import de r&eacute;union. Pour d&eacute;marrer avec un historique complet, s&eacute;lectionnez ici <b>plusieurs fichiers partants &agrave; la fois</b> (Analyse_AAAAMMJJ_partants.csv des 2 &agrave; 3 derniers mois) : seules les ferrures sont enregistr&eacute;es, aucune r&eacute;union n'est cr&eacute;&eacute;e. La date est lue dans le nom de chaque fichier. <span id="ferrures-compteur"></span></p>
      <div class="field"><input type="file" id="file-ferrures" accept=".csv,text/csv,text/plain" multiple></div>
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
      <button class="btn btn-secondary btn-block" id="btn-reset-top-ia-place" style="margin-top:8px;">Vider le Top IA Plac&eacute; importe</button>
      <button class="btn btn-secondary btn-block" id="btn-reset-popularite" style="margin-top:8px;">Vider la Popularit&eacute; import&eacute;e</button>
      <button class="btn btn-secondary btn-block" id="btn-reset-ferrures" style="margin-top:8px;">Vider l'historique des ferrures</button>
    </div>

    <div id="import-message"></div>
  `;

  document.getElementById('file-reunion').addEventListener('change', (e) => handleReunionImport(e.target.files[0]));
  document.getElementById('file-perfs').addEventListener('change', (e) => handlePerformancesImport(e.target.files[0]));
  document.getElementById('btn-dedupe-perfs').addEventListener('click', handleDedupePerformances);
  document.getElementById('file-top-ia-place').addEventListener('change', (e) => handleTopIAPlaceImport(e.target.files[0]));
  document.getElementById('file-popularite').addEventListener('change', (e) => handlePopulariteImport(e.target.files[0]));
  document.getElementById('btn-export').addEventListener('click', handleExport);
  document.getElementById('file-backup').addEventListener('change', (e) => handleBackupImport(e.target.files[0]));
  document.getElementById('btn-reset-reunions').addEventListener('click', handleResetReunions);
  document.getElementById('btn-reset-top-ia-place').addEventListener('click', handleResetTopIAPlace);
  document.getElementById('btn-reset-popularite').addEventListener('click', handleResetPopularite);
  document.getElementById('file-ferrures').addEventListener('change', (e) => handleFerruresImport(e.target.files));
  document.getElementById('btn-reset-ferrures').addEventListener('click', handleResetFerrures);
  afficherCompteurFerrures();
}

async function handleResetReunions() {
  const ok = confirm('Vider toutes les reunions importees ? L\'historique des performances ne sera pas touche.');
  if (!ok) return;
  await DB.resetReunions();
  showImportMessage('Reunions importees videes.', false);
}

// *** sept. 2026 (a la demande explicite de l'utilisateur) : import du
// fichier quotidien "export-premium-turfbzh-AAAAMMJJ.csv" (Turf BZH
// Premium) - remplace les anciens modules "Predictions externes" et
// "Ecarts Jockeys/Entraineurs". Seule la section "TOP 5 IA PLACE" est
// retenue (cf. js/engine/topIAPlaceParser.js) ; chaque reimport REMPLACE
// entierement le precedent (photo du jour, pas un historique cumulatif). ***
async function handleTopIAPlaceImport(file) {
  if (!file) return;
  try {
    const csv = await readFileSmart(file);
    const rows = parseTopIAPlace(csv);
    if (rows.length === 0) { showImportMessage('Aucune ligne "TOP 5 IA PLACE" reconnue dans ce fichier.', true); return; }
    const dateVal = extraireDateReunionDepuisNomFichier(file.name) || new Date().toISOString();
    await DB.saveTopIAPlace(dateVal, rows);
    showImportMessage(`Top IA Place importe (${rows.length} ligne${rows.length > 1 ? 's' : ''}).`, false);
  } catch (err) {
    showImportMessage(`Echec de l'import : ${err.message || err}`, true);
  }
}

async function handleResetTopIAPlace() {
  const ok = confirm('Vider le Top IA Place importe ?');
  if (!ok) return;
  await DB.resetTopIAPlace();
  showImportMessage('Top IA Place vide.', false);
}

// *** oct. 2026 (v126, a la demande explicite de l'utilisateur) : import du
// fichier quotidien "Popularite_chevaux_AAAAMMJJ.xlsx" (Turf BZH), pour la
// regle "Favori populaire" (cf. js/engine/favoriPopulaire.js). Remplace
// l'import "Supplementation PMU", retire. Utilise la librairie XLSX deja
// embarquee (js/vendor/xlsx.core.min.js, chargee globalement via index.html
// - voir window.XLSX) ; chaque reimport REMPLACE entierement le precedent
// (photo du jour, pas un historique cumulatif).
async function handlePopulariteImport(file) {
  if (!file) return;
  try {
    const buffer = await file.arrayBuffer();
    // `XLSX.read` avec `type:'array'` attend un VRAI tableau d'octets
    // (Uint8Array), pas l'ArrayBuffer brut : WebKit/iOS Safari renvoie sinon
    // un classeur vide (bug deja rencontre sur l'ancien import
    // Supplementation, sept. 2026).
    const wb = window.XLSX.read(new Uint8Array(buffer), { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    const rows = parsePopularite(raw);
    if (rows.length === 0) { showImportMessage('Aucune ligne reconnue dans ce fichier de Popularite (colonnes "Cheval" et "Code Course" attendues).', true); return; }
    const dateDuNom = extraireDateReunionDepuisNomFichier(file.name);
    const dateVal = dateDuNom || new Date().toISOString();
    await DB.savePopularite(dateVal, rows);
    const { qualifies, selection } = selectionFavoriPopulaire(rows);
    const resume = selection
      ? ` ${qualifies.length} favori(s) qualifie(s) ; selection du jour (cotes du fichier) : R${selection.reunion}C${selection.course} n${selection.numero} ${selection.cheval} (cote ${fmt1(selection.coteRetenue)}).`
      : ' Aucun favori qualifie avec les cotes du fichier.';
    const suffixeDate = dateDuNom
      ? ` Date detectee : ${new Date(dateDuNom).toLocaleDateString('fr-FR')}.`
      : ' Date non detectee dans le nom du fichier : date du jour utilisee.';
    const top5 = top5IAPlaceDepuisPopularite(rows);
    const resumeTop5 = top5.length > 0 ? ` Top 5 IA Place : ${top5.map((r) => `${r.rang}. ${r.cheval} (R${r.reunion}C${r.course} n${r.numero})`).join(' ; ')}.` : '';
    showImportMessage(`Popularite importee (${rows.length} chevaux).${resumeTop5}${resume}${suffixeDate}`, false);
  } catch (err) {
    showImportMessage(`Echec de l'import : ${err.message || err}`, true);
  }
}

async function afficherCompteurFerrures() {
  const el = document.getElementById('ferrures-compteur');
  if (!el) return;
  try {
    const n = await DB.countFerrures();
    el.innerHTML = `<b>${n} ferrure${n > 1 ? 's' : ''} en m&eacute;moire.</b>`;
  } catch { el.textContent = ''; }
}

// v128 : import groupe de fichiers partants pour alimenter l'historique des
// ferrures (regle "Nouveau D4") sans creer de reunions.
async function handleFerruresImport(fileList) {
  const files = [...(fileList || [])];
  if (files.length === 0) return;
  let nbFichiers = 0;
  let nbFerrures = 0;
  const ignores = [];
  try {
    for (const file of files) {
      const dateFichier = extraireDateReunionDepuisNomFichier(file.name);
      if (!dateFichier) { ignores.push(`${file.name} (date absente du nom)`); continue; }
      const races = CSVImporter.parseReunionComplete(await readFileSmart(file));
      const records = extraireFerrures(races, jourDe(dateFichier));
      if (records.length === 0) { ignores.push(`${file.name} (aucun cheval de trot reconnu)`); continue; }
      await DB.addFerrures(records);
      nbFichiers++;
      nbFerrures += records.length;
    }
    let message = `Historique des ferrures : ${nbFerrures} ferrure(s) enregistree(s) depuis ${nbFichiers} fichier(s).`;
    if (ignores.length > 0) message += ` Ignore(s) : ${ignores.slice(0, 5).join(', ')}${ignores.length > 5 ? `, et ${ignores.length - 5} autre(s)` : ''}.`;
    showImportMessage(message, nbFichiers === 0);
  } catch (err) {
    showImportMessage(`Echec de l'import : ${err.message || err}`, true);
  }
  afficherCompteurFerrures();
}

async function handleResetFerrures() {
  const ok = confirm('Vider l\'historique des ferrures ? La regle "Nouveau D4" devra alors se baser sur l\'historique des performances, moins fiable.');
  if (!ok) return;
  await DB.resetFerrures();
  showImportMessage('Historique des ferrures vide.', false);
  afficherCompteurFerrures();
}

async function handleResetPopularite() {
  const ok = confirm('Vider la Popularite importee ?');
  if (!ok) return;
  await DB.resetPopularite();
  showImportMessage('Popularite videe.', false);
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

    // v126 (a la demande de l'utilisateur : "faire en sorte que les cotes
    // BZH restent affichees une fois rapatriees") : un reimport de la meme
    // reunion (ex. fichier partants de midi apres celui du matin) recree
    // les chevaux a neuf ; on reporte donc sur les nouveaux chevaux les
    // donnees turf.bzh deja recuperees (Cote_BZH, gains, musique) de la
    // reunion du MEME jour et du meme numero deja en base.
    const jourImport = new Date(dateReunion || Date.now()).toISOString().slice(0, 10);
    // v128 : memorise la ferrure de chaque cheval de trot (historique
    // cumulatif, regle "Nouveau D4") - non bloquant pour l'import.
    try { await DB.addFerrures(extraireFerrures(races, jourImport)); } catch (err) { console.error('Ferrures', err); }
    const bzhDejaConnu = new Map(); // "reunion-course-numero" -> { coteBzh, gainsTotauxBzh, musiqueBzh }
    try {
      const existants = (await DB.getAllMeetings()).filter((m) => new Date(m.date).toISOString().slice(0, 10) === jourImport && racesParReunion.has(m.numeroReunion));
      for (const m of existants) {
        for (const raceDb of await DB.getRacesForMeeting(m.id)) {
          for (const h of await DB.getHorsesForRace(raceDb.id)) {
            const cle = `${m.numeroReunion}-${raceDb.numeroCourse}-${h.numero}`;
            if (bzhDejaConnu.has(cle)) continue; // meetings tries du plus recent au plus ancien
            if (h.coteBzh != null || h.gainsTotauxBzh != null || h.musiqueBzh) {
              bzhDejaConnu.set(cle, { coteBzh: h.coteBzh ?? null, gainsTotauxBzh: h.gainsTotauxBzh ?? null, musiqueBzh: h.musiqueBzh || null, nom: h.nom });
            }
          }
        }
      }
    } catch (err) { console.error('Report Cote_BZH', err); }
    const reporterBzh = (numReunion, numCourse, h) => {
      const connu = bzhDejaConnu.get(`${numReunion}-${numCourse}-${h.numero}`);
      if (!connu || (connu.nom || '').trim().toUpperCase() !== (h.nom || '').trim().toUpperCase()) return h;
      return {
        ...h,
        coteBzh: h.coteBzh != null ? h.coteBzh : connu.coteBzh,
        ...(connu.gainsTotauxBzh != null ? { gainsTotauxBzh: connu.gainsTotauxBzh } : {}),
        ...(connu.musiqueBzh ? { musiqueBzh: connu.musiqueBzh } : {})
      };
    };

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
        typeCourse: r.context.typeCourse,
        distanceJour: r.context.distanceJour,
        allocation: r.context.allocation,
        heureDepart: r.context.heureDepart,
        arriveeBrute: r.arriveeBrute,
        horses: r.horses.map((h) => reporterBzh(numReunion, r.context.numeroCourse, h))
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

      // *** Filtre confirmation externe retire (sept 2026, a la demande de
      // l'utilisateur : "je n'utilise plus ce fichier") *** - Course feu
      // vert/Top base exigeait auparavant que la Base (trioValueAvecBase)
      // soit confirmee par un fichier de predictions externe importe pour
      // ce jour/hippodrome/course (simple OU double), ce qui limitait la
      // page a zero course en l'absence d'un tel import. Desormais, seule
      // l'existence d'une Base tres solide (trioValueAvecBase non nul) est
      // requise. Le badge "Confirmation externe" reste affiche a titre
      // informatif si un fichier de predictions est neanmoins importe un
      // jour, mais ne conditionne plus l'apparition de la course ici.
      const suggestionBase = trioValueAvecBase(bd, result.chevaux);
      if (!suggestionBase) continue;

      const { base, partenaires } = suggestionBase;
      const cotesCibles = calculerCotesCibles(result.chevaux, context.nbPartants);
      const base5 = coupleValue(result.chevaux, 5);
      const numerosConfirmes = base5 ? confirmationsCotesCibles(base5.candidats, cotesCibles) : [];
      const cle = `${bucketConfiance(score)}-${bucketConfirmations(numerosConfirmes.length)}`;
      const cellule = TRIO_ADAPTATIF_NIVEAUX[cle];
      candidates.push({ meeting, race, score, base, partenaires, cotesCibles, cellule, nbPartants: horses.length });
    }
  }

  if (candidates.length === 0) {
    appEl.innerHTML = `
      ${seuilFeuVertSelectorHtml()}
      <div class="empty-state">
        <div class="icon">\u{1F7E2}</div>
        <p class="bold">Aucune course Top base pour l'instant</p>
        <p class="muted">Une course apparait ici des que son score de configuration est ${libelleFiltreFeuVert(filtre)}, avec entre ${MIN_PARTANTS_FEU_VERT} et ${MAX_PARTANTS_FEU_VERT} partants, au moins la moitie du champ avec un historique de performances retrouve, ET une Base tres solide identifiee.</p>
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
    <div class="list-group">${candidates.map(({ meeting, race, score, base, partenaires, cotesCibles, cellule, nbPartants }) => {
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
// vue d'ensemble des courses du jour, triees par heure de depart, avec un
// decompte en direct pour la prochaine course a partir.
//
// *** sept. 2026 (a la demande explicite de l'utilisateur) : l'ancien
// filtre scoreForme>=70/scoreAptitude>=85 (SEUIL_SCORE_FORME_RANG1/
// SEUIL_SCORE_APTITUDE_RANG1, seuils de l'ancien Jeu Simple Gagnant a
// dominance MX+OR+MA) est ENTIEREMENT RETIRE de cette page ("il faudrait
// egalement supprimer de la page 'courses du jour' les courses que l'on
// gardait avant pour forme>70 et aptitude>85"). Seules sont retenues les
// courses couvertes par le Top 5 IA Place Turf BZH du jour et/ou par la
// Supplementation PMU du jour importee (n'importe quel cheval y figurant),
// quels que soient le nombre de partants ou les scores.
//
// *** sept 2026 (a la demande de l'utilisateur) : la page n'est plus
// verrouillee sur la date REELLE du jour (`estAujourdHui`) mais reprend
// TOUTES les reunions actuellement importees, meme logique que "Bilan
// Simple Gagnant"/`collecterCandidatesSimpleGagnant()` - utile pour
// consulter/tester une journee d'archive ici aussi. Comme pour le
// correctif ENGHIEN R3C6 (v86, Bilan Simple Gagnant), un badge de date +
// un selecteur de date apparaissent des que plusieurs journees sont
// melangees dans les reunions importees, pour eviter la meme confusion
// (etat/fonctions dedies a cette page, independants de ceux de Bilan
// Simple Gagnant). Un bouton "Rafraichir les cotes" est ajoute (reprend le
// mecanisme du bouton "Mettre a jour les cotes de toute la reunion" de la
// fiche reunion, pour toutes les reunions actuellement affichees) : sans
// risque pour cette page, le filtre d'eligibilite ici (scoreForme/
// scoreAptitude) ne depend jamais de la cote, contrairement au Jeu Simple
// Gagnant (cf. le correctif v88 sur "Bilan Simple Gagnant" - rafraichir
// les cotes ici ne peut donc jamais faire disparaitre une course de cette
// liste). Le decompte, lui, reste calcule par rapport a l'heure REELLE
// actuelle : sur une journee d'archive, le depart calcule est simplement
// toujours dans le passe ("Depart passe"), sans decompte actif.
// -------------------------------------------------------------------
let listeCoursesCountdownIntervalId = null;
let filtreDateListeCoursesActuel = null; // null = toutes les dates ; sinon "AAAA-MM-JJ"

function arreterDecompteListeCourses() {
  if (listeCoursesCountdownIntervalId) {
    clearInterval(listeCoursesCountdownIntervalId);
    listeCoursesCountdownIntervalId = null;
  }
}

// *** sept 2026, a la demande de l'utilisateur : alarme sonore 2 minutes
// avant le depart de chaque course de cette page (iPhone) ***
// Limite assumee (choisie par l'utilisateur parmi 2 options proposees) :
// alerte de PREMIER PLAN uniquement - fonctionne tant que la page reste
// ouverte et l'ecran allume, PAS telephone verrouille/appli fermee. Une
// vraie alarme "meme verrouille" demanderait un systeme de notifications
// Push (infrastructure serveur programmee, type fonction externe deja
// utilisee pour les cotes PMU) - hors perimetre ici, volontairement.
//
// Contrainte iOS/Safari : impossible de jouer un son sans un geste
// utilisateur PREALABLE dans la page (aucune lecture audio automatique au
// chargement). D'ou le bouton "Activer l'alarme" ci-dessous : le clic sert
// A LA FOIS a activer l'alarme ET a "deverrouiller" l'audio pour le reste
// de la session (le AudioContext reste utilisable ensuite sans nouveau
// geste, tant que la page n'est pas rechargee). Etat volontairement NON
// persiste (redemarre a chaque rechargement de page/appli), puisque de
// toute facon un nouveau geste sera necessaire a chaque session pour
// debloquer l'audio.
let alarmeListeCoursesActive = false;
let audioCtxAlarmeListeCourses = null;
const racesAlarmeListeCoursesDeclenchees = new Set();
const SEUIL_ALARME_LISTE_COURSES_MS = 2 * 60 * 1000;

/**
 * Joue 3 bips courts (bip-bip-bip) via Web Audio API (oscillateur genere en
 * memoire, aucun fichier audio externe necessaire - coherent avec le
 * fonctionnement hors-ligne de l'appli). Doit etre appelee au moins une
 * fois depuis un gestionnaire de clic (geste utilisateur) avant de pouvoir
 * fonctionner ensuite depuis un `setInterval` sur iOS/Safari.
 */
function jouerBipAlarmeListeCourses() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioCtxAlarmeListeCourses) audioCtxAlarmeListeCourses = new AudioCtx();
    if (audioCtxAlarmeListeCourses.state === 'suspended') audioCtxAlarmeListeCourses.resume();
    const debutBase = audioCtxAlarmeListeCourses.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = audioCtxAlarmeListeCourses.createOscillator();
      const gain = audioCtxAlarmeListeCourses.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      const debut = debutBase + i * 0.35;
      gain.gain.setValueAtTime(0, debut);
      gain.gain.linearRampToValueAtTime(0.4, debut + 0.02);
      gain.gain.linearRampToValueAtTime(0, debut + 0.25);
      osc.connect(gain);
      gain.connect(audioCtxAlarmeListeCourses.destination);
      osc.start(debut);
      osc.stop(debut + 0.3);
    }
  } catch (err) {
    console.error('Alarme "Liste des courses" : lecture du bip impossible', err);
  }
}

function dateFiltreListeCoursesSelectorHtml(datesDisponibles) {
  if (datesDisponibles.length <= 1) return '';
  const actuel = filtreDateListeCoursesActuel && datesDisponibles.includes(filtreDateListeCoursesActuel)
    ? filtreDateListeCoursesActuel
    : '';
  const options = datesDisponibles.map((d) =>
    `<option value="${d}" ${actuel === d ? 'selected' : ''}>${new Date(d).toLocaleDateString('fr-FR')}</option>`
  ).join('');
  return `
    <div class="card" style="margin-bottom:10px;">
      <p class="small tag-orange bold" style="margin:0 0 6px;">Plusieurs journ&eacute;es sont m&eacute;lang&eacute;es dans cette liste (r&eacute;unions non vid&eacute;es entre deux imports) - choisissez une date pour l'isoler.</p>
      <div class="field" style="margin-bottom:0;">
        <label for="liste-courses-filtre-date-select">Filtrer par date</label>
        <select id="liste-courses-filtre-date-select">
          <option value="" ${actuel === '' ? 'selected' : ''}>Toutes les dates (${datesDisponibles.length} journ&eacute;es)</option>
          ${options}
        </select>
      </div>
    </div>`;
}

function bindDateFiltreListeCoursesSelector(onChange) {
  const sel = document.getElementById('liste-courses-filtre-date-select');
  if (!sel) return;
  sel.addEventListener('change', () => {
    filtreDateListeCoursesActuel = sel.value || null;
    onChange();
  });
}

/**
 * Construit un objet Date pour la date de la REUNION (pas necessairement
 * aujourd'hui - la page n'est plus verrouillee a la date reelle du jour,
 * sept 2026) a l'heure de depart indiquee ("HHhMM", tolerant HH:MM/HH.MM -
 * meme format que `minutesDepart`). Renvoie `null` si le format n'est pas
 * reconnu.
 * @param {string} heureDepart
 * @param {string|Date} dateMeeting - `meeting.date`.
 * @returns {Date|null}
 */
function dateDepartCourse(heureDepart, dateMeeting) {
  const m = String(heureDepart || '').match(/(\d{1,2})[h:.](\d{2})/);
  if (!m) return null;
  const heures = Number(m[1]);
  const minutes = Number(m[2]);
  if (!Number.isFinite(heures) || !Number.isFinite(minutes) || heures > 23 || minutes > 59) return null;
  const d = new Date(dateMeeting);
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
  const meetings = await DB.getAllMeetings();
  // Regle "Favori populaire" (v126) : carte en tete de page, independante
  // des reunions importees (le fichier Popularite couvre toutes les courses
  // du jour, y compris etrangeres).
  let carteFavoriHtml = '';
  try { carteFavoriHtml = carteFavoriPopulaireHtml(await calculerFavoriPopulaire()); } catch (err) { console.error('Favori populaire', err); }

  if (meetings.length === 0) {
    appEl.innerHTML = `
      ${carteFavoriHtml}
      <div class="empty-state">
        <div class="icon">\u{1F4C5}</div>
        <p class="bold">Aucune reunion importee</p>
        <p class="muted">Importez une reunion depuis l'onglet "Importer" pour voir apparaitre ici la liste des courses (8 &agrave; 16 partants), tri&eacute;es par heure de d&eacute;part.</p>
      </div>`;
    bindGoto();
    return;
  }

  // v129 (a la demande de l'utilisateur) : cette page liste les courses
  // ELIGIBLES a l'une des quatre selections retenues (Favori populaire, Rang
  // 1 IA Place, Regle trot gains faibles, Nouveau D4 affine) - a jouer ou en
  // attente de confirmation par les cotes. Les jeux finaux sont dans
  // l'onglet "Simple G/P".
  const data = await collecterJeuxDuJour();
  const coursesToutesDates = data.courses.map((c) => ({ meeting: c.meeting, race: c.race, nbPartants: c.nbPartants, jeux: c.jeux }));
  try {
    const plusieursDates = new Set(data.itemsD4.map((i) => jourDe(i.meeting.date))).size > 1;
    carteFavoriHtml += carteNouveauD4Html(data.itemsD4, plusieursDates);
  } catch (err) { console.error('Nouveau D4', err); }
  const aRafraichir = coursesARafraichir(data.toutesCourses);

  const datesDisponibles = [...new Set(coursesToutesDates.map((c) => new Date(c.meeting.date).toISOString().slice(0, 10)))].sort();
  if (filtreDateListeCoursesActuel && !datesDisponibles.includes(filtreDateListeCoursesActuel)) {
    filtreDateListeCoursesActuel = null;
  }
  const courses = filtreDateListeCoursesActuel
    ? coursesToutesDates.filter((c) => new Date(c.meeting.date).toISOString().slice(0, 10) === filtreDateListeCoursesActuel)
    : coursesToutesDates;
  const dateFiltreHtml = dateFiltreListeCoursesSelectorHtml(datesDisponibles);

  if (courses.length === 0) {
    appEl.innerHTML = `
      ${carteFavoriHtml}
      ${dateFiltreHtml}
      <div class="empty-state">
        <div class="icon">\u{1F4C5}</div>
        <p class="bold">Aucune course potentiellement &eacute;ligible pour l'instant</p>
        <p class="muted">Cette liste retient les courses &eacute;ligibles &agrave; l'une des quatre s&eacute;lections : Favori populaire, Rang 1 IA Plac&eacute; (fichier Popularit&eacute; &agrave; importer), R&egrave;gle trot &laquo; gains faibles &raquo; et Nouveau D4.</p>
      </div>`;
    bindGoto();
    bindDateFiltreListeCoursesSelector(renderListeCourses);
    return;
  }

  courses.sort((a, b) => minutesDepart(a.race.heureDepart) - minutesDepart(b.race.heureDepart));

  // Prochaine course a partir : premiere course (dans l'ordre chronologique)
  // dont l'heure de depart calculee (sur la date de SA reunion) est encore
  // dans le futur reel. Sur une journee d'archive, toujours dans le passe -
  // aucune course n'est alors "prochaine" (pas de decompte actif).
  let prochaineIndex = -1;
  for (let i = 0; i < courses.length; i++) {
    const d = dateDepartCourse(courses[i].race.heureDepart, courses[i].meeting.date);
    if (d && d.getTime() > maintenant.getTime()) { prochaineIndex = i; break; }
  }

  const reunionsAffichees = [...new Map(courses.map((c) => [c.meeting.id, c.meeting])).values()];

  appEl.innerHTML = `
    ${carteFavoriHtml}
    ${dateFiltreHtml}
    <button class="btn ${alarmeListeCoursesActive ? 'btn-primary' : 'btn-secondary'} btn-block" data-toggle-alarme-liste style="margin-bottom:8px;">${alarmeListeCoursesActive ? '\u{1F514} Alarme active (2 min avant chaque d&eacute;part)' : '\u{1F515} Activer l\'alarme sonore (2 min avant chaque d&eacute;part)'}</button>
    <p class="muted small" style="margin:-4px 0 8px;">Fonctionne tant que cette page reste ouverte et l'&eacute;cran allum&eacute; (limite iOS : pas d'alarme t&eacute;l&eacute;phone verrouill&eacute;/appli ferm&eacute;e). A r&eacute;activer &agrave; chaque ouverture de l'appli.</p>
    <button class="btn btn-secondary btn-block" data-refresh-cotes-liste style="margin-bottom:10px;"${aRafraichir.length === 0 ? ' disabled' : ''}>Rafra&icirc;chir les cotes (${aRafraichir.length} course${aRafraichir.length > 1 ? 's' : ''} &agrave; venir)</button>
    <p class="muted small" style="margin:-4px 0 8px;">${courses.length} course(s) &eacute;ligible(s). Vert = &agrave; jouer avec les cotes actuelles ; orange = en attente de confirmation par les cotes. Jeux finaux : onglet Simple G/P.</p>
    <div id="liste-courses-cotes-status"></div>
    <div class="list-group">${courses.map(({ meeting, race, nbPartants, jeux }, i) => {
      const dateVal = new Date(meeting.date).toISOString().slice(0, 10);
      const dateLabelHtml = datesDisponibles.length > 1
        ? `<span class="small tag-blue bold" style="margin-right:6px;">${new Date(dateVal).toLocaleDateString('fr-FR')}</span>`
        : '';
      const dateDepart = dateDepartCourse(race.heureDepart, meeting.date);
      const estProchaine = i === prochaineIndex;
      const passee = !estProchaine && dateDepart && dateDepart.getTime() <= maintenant.getTime();
      const decompteHtml = estProchaine
        ? `<span class="small tag-orange bold" id="liste-courses-decompte" data-depart="${dateDepart.getTime()}">D&eacute;part dans ${escapeHtml(formatDecompte(dateDepart.getTime() - maintenant.getTime()))}</span>`
        : (passee ? `<span class="small tag-gray">D&eacute;part pass&eacute;</span>` : '');
      return `
      <div class="list-item clickable" data-goto="race/${race.id}">
        <div>
          <div class="bold">${dateLabelHtml}${race.heureDepart ? `${escapeHtml(race.heureDepart)} - ` : ''}${escapeHtml(meeting.hippodrome)} - Course ${race.numeroCourse}</div>
          <div class="muted small">${escapeHtml(race.discipline)} - ${nbPartants} partants</div>
          ${badgesJeuxCourseHtml(jeux)}
          <div style="margin-top:4px;">${decompteHtml}</div>
        </div>
        <div class="muted">&rsaquo;</div>
      </div>`;
    }).join('')}</div>
  `;

  bindGoto();
  bindDateFiltreListeCoursesSelector(renderListeCourses);

  // Rafraichissement des cotes (sept 2026, a la demande de l'utilisateur) :
  // reprend le mecanisme du bouton "Mettre a jour les cotes de toute la
  // reunion" de la fiche reunion (fetchCotesPmu -> apparierCotesZeturf ->
  // DB.updateHorses), course par course et de facon sequentielle, pour
  // toutes les courses ACTUELLEMENT affichees (apres filtre de date
  // eventuel). Volontairement limite aux cotes (pas de recuperation
  // d'arrivee ici, contrairement a la fiche reunion) : cette page sert a
  // preparer/consulter des courses a venir, pas a suivre des resultats.
  const btnRefresh = appEl.querySelector('[data-refresh-cotes-liste]');
  if (btnRefresh && !btnRefresh.disabled) {
    btnRefresh.addEventListener('click', async () => {
      btnRefresh.disabled = true;
      const statusEl = appEl.querySelector('#liste-courses-cotes-status');
      const r = await rafraichirCotesCourses(aRafraichir, (html) => { if (statusEl) statusEl.innerHTML = `<p class="muted small" style="margin-top:8px;">${html}</p>`; });
      if (parseHash()[0] !== 'liste') return;
      await renderListeCourses();
      const el = appEl.querySelector('#liste-courses-cotes-status');
      if (el) el.innerHTML = `<p class="muted small" style="margin:0 0 8px;">Cotes mises &agrave; jour : ${r.ok} course(s)${r.fail > 0 ? `, ${r.fail} &eacute;chec(s)` : ''}.</p>`;
    });
  }

  // Alarme sonore 2 minutes avant chaque depart (sept 2026, a la demande de
  // l'utilisateur) : le clic sur ce bouton est le geste utilisateur qui
  // "deverrouille" l'audio pour le reste de la session (contrainte iOS).
  const btnAlarme = appEl.querySelector('[data-toggle-alarme-liste]');
  if (btnAlarme) {
    btnAlarme.addEventListener('click', () => {
      alarmeListeCoursesActive = !alarmeListeCoursesActive;
      if (alarmeListeCoursesActive) jouerBipAlarmeListeCourses();
      renderListeCourses();
    });
  }

  if (prochaineIndex >= 0) {
    const raceProchaineId = courses[prochaineIndex].race.id;
    const declencherAlarmeSiSeuilAtteint = (restant) => {
      if (!alarmeListeCoursesActive) return;
      if (raceProchaineId == null || racesAlarmeListeCoursesDeclenchees.has(raceProchaineId)) return;
      if (restant > 0 && restant <= SEUIL_ALARME_LISTE_COURSES_MS) {
        racesAlarmeListeCoursesDeclenchees.add(raceProchaineId);
        jouerBipAlarmeListeCourses();
      }
    };
    // Verification immediate : l'utilisateur peut ouvrir/rouvrir la page
    // alors qu'il reste deja moins de 2 minutes avant le prochain depart.
    declencherAlarmeSiSeuilAtteint(
      dateDepartCourse(courses[prochaineIndex].race.heureDepart, courses[prochaineIndex].meeting.date).getTime() - Date.now()
    );
    listeCoursesCountdownIntervalId = setInterval(() => {
      const el = appEl.querySelector('#liste-courses-decompte');
      if (!el) { arreterDecompteListeCourses(); return; }
      const departTs = Number(el.dataset.depart);
      const restant = departTs - Date.now();
      declencherAlarmeSiSeuilAtteint(restant);
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

      // Filtre confirmation externe retire (sept 2026, cf. Course feu
      // vert/Top base plus haut) - seule une Base tres solide est requise
      // desormais, les 2 pages restent coherentes entre elles (Resultat
      // "reprend les memes courses Top base").
      const suggestionBase = trioValueAvecBase(bd, result.chevaux);
      if (!suggestionBase) continue;

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
        <p class="muted">Cette page suit la reussite des courses dont le score de configuration est ${libelleFiltreFeuVert(filtre)}, avec entre ${MIN_PARTANTS_FEU_VERT} et ${MAX_PARTANTS_FEU_VERT} partants, au moins la moitie du champ avec un historique de performances retrouve, ET une Base tres solide identifiee.</p>
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
          const json = await fetchRapportsAvecFallback(dateVal, a.meeting.numeroReunion, a.race.numeroCourse);
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
  return v === 'gagnant' || v === 'place' ? v : FILTRE_MODE_SIMPLE_GAGNANT_DEFAUT;
}

function setFiltreModeSimpleGagnant(valeur) {
  if (valeur !== 'tous' && valeur !== 'gagnant' && valeur !== 'place') return;
  localStorage.setItem(FILTRE_MODE_SIMPLE_GAGNANT_CLE_STOCKAGE, valeur);
}

// *** sept. 2026, a la demande de l'utilisateur : repurpose complet - le
// filtre ne distingue plus les anciens modes "rang1"/"value" (moteur
// retire) mais si un Simple Gagnant est propose en plus du Simple Place
// (jeu.gagnant !== null, cf. jeuSimpleGP.js) ***
function matchFiltreModeSimpleGagnant(gagnantPresent, filtre) {
  if (filtre === 'gagnant') return gagnantPresent === true;
  if (filtre === 'place') return gagnantPresent === false;
  return true; // 'tous'
}

function filtreModeSimpleGagnantSelectorHtml() {
  const actuel = getFiltreModeSimpleGagnant();
  return `
    <div class="card" style="margin-bottom:10px;">
      <div class="field" style="margin-bottom:0;">
        <label for="jsg-filtre-mode-select">Filtrer par mode</label>
        <select id="jsg-filtre-mode-select">
          <option value="tous" ${actuel === 'tous' ? 'selected' : ''}>Tout l'historique</option>
          <option value="gagnant" ${actuel === 'gagnant' ? 'selected' : ''}>Avec Simple Gagnant (rang IA 1 dans le pool)</option>
          <option value="place" ${actuel === 'place' ? 'selected' : ''}>Simple Place seul</option>
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

// *** sept 2026 *** : filtre par date pour la page "Bilan Simple Gagnant".
// Contexte du bug corrige : collecterCandidatesSimpleGagnant() parcourt
// TOUTES les reunions actuellement stockees (DB.getAllMeetings(), sans
// filtre de date), contrairement a "Liste des courses"/"Courses du jour"
// qui se limitent a estAujourdHui(). C'est volontaire (permet de tester
// une journee d'archive independamment de la date du jour reel), mais tant
// que "Vider toutes les reunions importees" n'a pas ete cliquee entre deux
// imports de jours differents, les courses des deux journees se melangent
// dans une seule liste SANS AUCUNE indication de date sur chaque ligne -
// un utilisateur qui enchaine le test de plusieurs journees d'archive sans
// vider systematiquement entre chacune peut alors attribuer par erreur une
// course a la mauvaise date (cas reel : ENGHIEN R3C6 du 01/08/2026 alors
// laisse en memoire et vu comme faisant partie du test du 08/08/2026).
// Correctif : (1) la date de reunion est desormais affichee sur chaque
// ligne (rowHtml), (2) un selecteur de date apparait des que plusieurs
// journees sont melangees, permettant d'isoler une seule journee (et de
// retrouver alors exactement le meme comportement qu'avant, journee par
// journee, sans etre oblige de vider entre deux tests).
let filtreDateSimpleGagnantActuel = null; // null = toutes les dates ; sinon "AAAA-MM-JJ"

function dateFiltreSimpleGagnantSelectorHtml(datesDisponibles) {
  if (datesDisponibles.length <= 1) return '';
  const actuel = filtreDateSimpleGagnantActuel && datesDisponibles.includes(filtreDateSimpleGagnantActuel)
    ? filtreDateSimpleGagnantActuel
    : '';
  const options = datesDisponibles.map((d) =>
    `<option value="${d}" ${actuel === d ? 'selected' : ''}>${new Date(d).toLocaleDateString('fr-FR')}</option>`
  ).join('');
  return `
    <div class="card" style="margin-bottom:10px;">
      <p class="small tag-orange bold" style="margin:0 0 6px;">Plusieurs journ&eacute;es sont m&eacute;lang&eacute;es dans cette liste (r&eacute;unions non vid&eacute;es entre deux imports) - choisissez une date pour l'isoler.</p>
      <div class="field" style="margin-bottom:0;">
        <label for="jsg-filtre-date-select">Filtrer par date</label>
        <select id="jsg-filtre-date-select">
          <option value="" ${actuel === '' ? 'selected' : ''}>Toutes les dates (${datesDisponibles.length} journ&eacute;es)</option>
          ${options}
        </select>
      </div>
    </div>`;
}

function bindDateFiltreSimpleGagnantSelector(onChange) {
  const sel = document.getElementById('jsg-filtre-date-select');
  if (!sel) return;
  sel.addEventListener('change', () => {
    filtreDateSimpleGagnantActuel = sel.value || null;
    onChange();
  });
}

/**
 * Reconstruit, pour toutes les courses importees, la liste des candidates
 * "Simple G/P rentable" (jeuSimpleGP(...).rentable === true - croisement
 * Top 5 IA Plac&eacute; x Value&le;-30, voir jeuSimpleGP.js). *** sept. 2026,
 * remplace entierement l'ancien jeuSimpleGagnant() (Value<=-30+MX+OR+MA), a
 * la demande explicite de l'utilisateur ***.
 * @returns {Promise<Array>} un element par course candidate : { meeting,
 *   race, nbPartants, jeu }.
 */
async function collecterCandidatesSimpleGagnant() {
  const meetings = await DB.getAllMeetings();
  const toutesPerfs = await DB.getAllPerformances();
  const topIAPlace = await chargerTopIAPlace();
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
        typeCourse: race.typeCourse,
        distanceJour: race.distanceJour,
        allocation: race.allocation,
        nbPartants: horses.length
      };
      const result = RaceAnalyzer.analyser(horses, context, false);

      // *** sept. 2026 (a la demande explicite de l'utilisateur : "la page
      // Simple G/P n'affiche pas les supplementation ... il faudrait
      // egalement que celle-ci soient reperees pour differencier") : cette
      // page collecte desormais 2 signaux DISTINCTS par course, chacun avec
      // son propre bilan financier - Top 5 IA Place x Value<=-30
      // (`jeuSimpleGP`, source 'ia') ET Supplementation PMU x Value<=-30
      // (`jeuSupplementation`, source 'supplementation', Note IA>=SEUIL_NOTE_SUPPLEMENTATION).
      // Une course peut apparaitre 2 fois (une entree par signal rentable) -
      // le badge de source (voir rowHtml) permet de les distinguer. ***
      const jeuIA = jeuSimpleGP(result.chevaux, topIAPlace, race.lieu, race.numeroCourse);
      if (jeuIA.rentable) candidates.push({ meeting, race, nbPartants: horses.length, jeu: jeuIA, source: 'ia' });
      // 30 sept. 2026 : signal 'supplementation' retire (non rentable).
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
/**
 * Recuperation de l'arrivee officielle SEULE (via `fetchResultatPmu`),
 * sans jamais toucher aux cotes des chevaux - voir le commentaire dans
 * `renderBilanSimpleGPAncien()` pour le contexte complet (bug signale par
 * l'utilisateur, sept 2026). Partagee entre les deux branches de rendu de
 * cette page (liste vide apres filtre, ou liste normale).
 * @param {Array} liste - sous-ensemble de `analysees` sans arrivee connue
 *   (chaque element a `.meeting`/`.race`).
 * @param {Function} onDone - callback de re-rendu (ex. `renderBilanSimpleGPAncien`).
 */
function bindRecupererArriveesSimpleGagnant(liste, onDone) {
  const btn = appEl.querySelector('[data-recuperer-arrivees]');
  if (!btn || !Array.isArray(liste) || liste.length === 0) return;
  btn.addEventListener('click', async () => {
    const statusEl = appEl.querySelector('#simple-gagnant-arrivees-status');
    btn.disabled = true;
    let ok = 0;
    let nonDispo = 0;
    let fail = 0;
    for (let i = 0; i < liste.length; i++) {
      const a = liste[i];
      if (statusEl) statusEl.innerHTML = `<p class="muted small" style="margin-top:8px;">Recuperation arrivee ${i + 1}/${liste.length} (${escapeHtml(a.meeting.hippodrome)} - Course ${a.race.numeroCourse})...</p>`;
      try {
        const dateVal = new Date(a.meeting.date).toISOString().slice(0, 10);
        const arrivee = await fetchResultatPmu(dateVal, a.meeting.numeroReunion, a.race.numeroCourse);
        if (arrivee && arrivee.length > 0) {
          a.race.arriveeBrute = arrivee.join('-');
          await DB.updateRace(a.race);
          ok++;
        } else {
          nonDispo++;
        }
      } catch (err) {
        console.error('Recuperation arrivee (Bilan Simple Gagnant) echouee pour', a.meeting.hippodrome, a.race.numeroCourse, err);
        fail++;
      }
      if (i < liste.length - 1) await new Promise((resolve) => setTimeout(resolve, 400));
    }
    if (statusEl) statusEl.innerHTML = `<p class="muted small" style="margin-top:8px;">Recuperation terminee : ${ok} arriv&eacute;e(s) r&eacute;cup&eacute;r&eacute;e(s)${nonDispo > 0 ? `, ${nonDispo} pas encore disponible(s)` : ''}${fail > 0 ? `, ${fail} &eacute;chec(s)` : ''}. Cotes non modifi&eacute;es.</p>`;
    await onDone();
  });
}

async function renderBilanSimpleGPAncien() {
  renderTopbar('Top 5 IA x Value', { back: () => navigate('bilan') });
  const meetings = await DB.getAllMeetings();

  const bilanGlobalLinkHtml = `<button class="btn btn-secondary btn-block" data-goto="bilanglobalsimplegagnant" style="margin-bottom:10px;">Voir le bilan global (historique par jour)</button>
    <button class="btn btn-secondary btn-block" data-goto="regletrot" style="margin-bottom:10px;">R&egrave;gle Trot &laquo; gains faibles &raquo; : paris et suivi</button>`;

  if (meetings.length === 0) {
    appEl.innerHTML = `
      ${bilanGlobalLinkHtml}
      <div class="empty-state">
        <div class="icon">\u{1F4B0}</div>
        <p class="bold">Aucune reunion importee</p>
        <p class="muted">Importez une reunion depuis l'onglet "Importer" pour voir apparaitre ici les courses au Simple G/P rentable. Le bilan global (historique des jours precedents) reste consultable ci-dessus : "Vider les reunions importees" ne l'efface jamais.</p>
      </div>`;
    bindGoto();
    return;
  }

  const candidatesToutesDates = await collecterCandidatesSimpleGagnant();
  const datesCandidates = [...new Set(candidatesToutesDates.map((c) => new Date(c.meeting.date).toISOString().slice(0, 10)))].sort();
  if (filtreDateSimpleGagnantActuel && !datesCandidates.includes(filtreDateSimpleGagnantActuel)) {
    filtreDateSimpleGagnantActuel = null;
  }
  const candidates = filtreDateSimpleGagnantActuel
    ? candidatesToutesDates.filter((c) => new Date(c.meeting.date).toISOString().slice(0, 10) === filtreDateSimpleGagnantActuel)
    : candidatesToutesDates;

  const introHtml = `<div class="card" style="margin-bottom:10px;">
      <p class="small muted" style="margin:0;">Courses dont un Simple G/P est jouable : <span class="tag-blue bold">Top 5 IA Plac&eacute;</span> (croisement du Top 5 IA Plac&eacute; Turf BZH du jour avec notre pool Value&le;-30 - Simple Place sur tout le croisement, Simple Gagnant seulement si le rang IA 1 en fait partie). (La s&eacute;lection Suppl&eacute;mentation a &eacute;t&eacute; retir&eacute;e le 30/09/2026 : non rentable sur avr. 2025 - sept. 2026.) Voir la fiche course pour le d&eacute;tail, et HEBERGEMENT.md pour la m&eacute;thode.</p>
    </div>`;
  const dateFiltreHtml = dateFiltreSimpleGagnantSelectorHtml(datesCandidates);

  if (candidates.length === 0) {
    appEl.innerHTML = `
      ${bilanGlobalLinkHtml}
      ${introHtml}
      ${dateFiltreHtml}
      <div class="empty-state">
        <div class="icon">\u{1F4B0}</div>
        <p class="bold">Aucune course au Simple G/P rentable pour l'instant</p>
        <p class="muted">Une course appara&icirc;t ici d&egrave;s qu'au moins un cheval Value&le;-30 figure dans le Top 5 IA Plac&eacute; Turf BZH du jour (onglet Importer).</p>
      </div>`;
    bindGoto();
    bindDateFiltreSimpleGagnantSelector(renderBilanSimpleGPAncien);
    return;
  }

  const filtreHtml = filtreModeSimpleGagnantSelectorHtml();
  const filtreActuel = getFiltreModeSimpleGagnant();

  candidates.sort((a, b) => minutesDepart(a.race.heureDepart) - minutesDepart(b.race.heureDepart));

  // *** sept. 2026, a la demande de l'utilisateur : remplacement complet de
  // l'ancien moteur (rang1Value/mode8h, MX+OR+MA) par jeuSimpleGP() - le
  // bilan combine desormais 2 paris distincts par course : Simple PLACE
  // (tous les chevaux du croisement, toujours joue si jeu.rentable) et,
  // seulement si le cheval au rang IA 1 fait partie du croisement, Simple
  // GAGNANT (ce seul cheval). "analysees" couvre TOUJOURS la journee
  // entiere (les 2 sous-groupes confondus - "avec Gagnant"/"Place seul"),
  // quel que soit le filtre choisi ci-dessus - le filtre ne change QUE la
  // liste de courses affichee plus bas ("analyseesFiltrees"). ***
  const analysees = candidates.map(({ meeting, race, nbPartants, jeu, source }) => {
    const ordreArrivee = CSVImporter.parseOrdreArrivee(race.arriveeBrute || '');
    if (ordreArrivee.length === 0) {
      return { meeting, race, nbPartants, jeu, source, connu: false, vrai1: null, placeGagne: null, gagnantGagne: null, rapportStatus: 'en_attente', bilan: null };
    }
    const vrai1 = ordreArrivee[0];
    const nbPlaces = nombrePlacesPayees(nbPartants);
    const numerosPlaces = nbPlaces > 0 ? ordreArrivee.slice(0, nbPlaces) : [];
    const placeGagne = jeu.place.chevaux.some((c) => numerosPlaces.includes(c.entry.numero));
    const gagnantGagne = jeu.gagnant ? jeu.gagnant.chevaux.some((c) => c.entry.numero === vrai1) : false;

    const besoinRapportPlace = placeGagne && race.rapportSimplePlace === undefined;
    const besoinRapportGagnant = gagnantGagne && race.rapportSimpleGagnant === undefined;
    if (besoinRapportPlace || besoinRapportGagnant) {
      return { meeting, race, nbPartants, jeu, source, connu: true, vrai1, placeGagne, gagnantGagne, rapportStatus: 'a_recuperer', bilan: null };
    }
    const bilan = bilanJourSimpleGP(jeu, MISE_STANDARD_BILAN_SIMPLE_GAGNANT, MISE_STANDARD_BILAN_SIMPLE_GAGNANT, race.rapportSimpleGagnant, race.rapportSimplePlace, numerosPlaces, vrai1);
    const dividendeConnu = bilan.place.dividendeConnu && (!bilan.gagnant || bilan.gagnant.dividendeConnu);
    if (!dividendeConnu) {
      return { meeting, race, nbPartants, jeu, source, connu: true, vrai1, placeGagne, gagnantGagne, rapportStatus: 'indisponible', bilan: null };
    }
    return { meeting, race, nbPartants, jeu, source, connu: true, vrai1, placeGagne, gagnantGagne, rapportStatus: 'ok', bilan };
  });

  // Net combine (Place + Gagnant s'il existe) d'une entree "analysees" avec
  // bilan calculable.
  const netCombine = (a) => a.bilan.place.net + (a.bilan.gagnant ? a.bilan.gagnant.net : 0);
  const miseCombinee = (a) => a.bilan.place.mise + (a.bilan.gagnant ? a.bilan.gagnant.mise : 0);
  const gainCombine = (a) => a.bilan.place.gain + (a.bilan.gagnant ? a.bilan.gagnant.gain : 0);

  const analyseesFiltrees = analysees.filter((a) => matchFiltreModeSimpleGagnant(a.jeu.gagnant !== null, filtreActuel));

  // *** sept 2026, a la demande de l'utilisateur *** : recuperation de
  // l'arrivee officielle SEULE (sans toucher aux cotes) - voir le detail de
  // ce mecanisme dans HEBERGEMENT.md (bug signale par l'utilisateur).
  const enAttenteArrivee = analysees.filter((a) => !a.connu);
  const arriveeHtml = enAttenteArrivee.length > 0 ? `
    <div class="card" style="margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
        <p class="bold" style="margin:0;">Arriv&eacute;es manquantes (${enAttenteArrivee.length})</p>
        <button class="btn btn-secondary" data-recuperer-arrivees>R&eacute;cup&eacute;rer les arriv&eacute;es</button>
      </div>
      <p class="muted small" style="margin-top:6px;">R&eacute;cup&egrave;re uniquement l'arriv&eacute;e officielle de chaque course ci-dessous, SANS toucher aux cotes - &agrave; utiliser &agrave; la place de "mise &agrave; jour des cotes" une fois vos paris plac&eacute;s.</p>
      <div id="simple-gagnant-arrivees-status"></div>
    </div>` : '';

  if (analyseesFiltrees.length === 0) {
    appEl.innerHTML = `
      ${bilanGlobalLinkHtml}
      ${introHtml}
      ${dateFiltreHtml}
      ${filtreHtml}
      ${arriveeHtml}
      <div class="empty-state">
        <div class="icon">\u{1F4B0}</div>
        <p class="bold">Aucune course ne correspond &agrave; ce filtre pour l'instant</p>
        <p class="muted">${candidates.length} course(s) au Simple G/P rentable au total, mais aucune pour le mode s&eacute;lectionn&eacute;. Changez le filtre ci-dessus pour les voir.</p>
      </div>`;
    bindGoto();
    bindDateFiltreSimpleGagnantSelector(renderBilanSimpleGPAncien);
    bindFiltreModeSimpleGagnantSelector(renderBilanSimpleGPAncien);
    bindRecupererArriveesSimpleGagnant(enAttenteArrivee, renderBilanSimpleGPAncien);
    return;
  }

  // Journee complete (tous modes), pour le taux de reussite, le bilan
  // financier et le transfert.
  const avecResultat = analysees.filter((a) => a.connu);
  const reussies = avecResultat.filter((a) => a.placeGagne);
  const aRecuperer = avecResultat.filter((a) => a.rapportStatus === 'a_recuperer');
  const avecBilan = avecResultat.filter((a) => a.rapportStatus === 'ok');

  // Sous-ensemble filtre (mode choisi ci-dessus), uniquement pour la liste
  // de courses affichee plus bas.
  const avecResultatFiltre = analyseesFiltrees.filter((a) => a.connu);
  const enAttenteFiltre = analyseesFiltrees.filter((a) => !a.connu);

  const tauxHtml = avecResultat.length > 0
    ? `<div class="card" style="text-align:center;">
        <p class="bold" style="font-size:1.6em; margin:0;">${reussies.length}/${avecResultat.length}</p>
        <p class="muted small" style="margin-top:2px;">Pool Simple Place ayant captur&eacute; un cheval effectivement plac&eacute; (${Math.round((reussies.length / avecResultat.length) * 100)}%) sur les courses Simple G/P rentable avec r&eacute;sultat connu</p>
      </div>`
    : `<div class="card"><p class="muted small">Aucun resultat connu pour l'instant. Utilisez le bouton "R&eacute;cup&eacute;rer les arriv&eacute;es" ci-dessus (sans toucher aux cotes).</p></div>`;

  const bilanGlobal = avecBilan.reduce((acc, a) => ({ mise: acc.mise + miseCombinee(a), gain: acc.gain + gainCombine(a) }), { mise: 0, gain: 0 });
  const netGlobal = bilanGlobal.gain - bilanGlobal.mise;

  const rendementGlobal = rendementBilan({ mise: bilanGlobal.mise, gain: bilanGlobal.gain });

  // *** sept. 2026 *** : detail par sous-groupe (independant du filtre
  // affiche, toujours sur la journee entiere) - alimente le sous-bilan
  // sauvegarde par "Transfert bilan" ci-dessous (champs `rang1Seul`/
  // `classement8h` reutilises tels quels pour ne pas casser
  // cumulerBilansJournaliers/l'historique deja transfere - ils portent
  // desormais respectivement "avec Simple Gagnant" et "Simple Place seul").
  const avecBilanAvecGagnant = avecBilan.filter((a) => a.jeu.gagnant !== null);
  const avecBilanPlaceSeul = avecBilan.filter((a) => a.jeu.gagnant === null);
  const bilanAvecGagnant = avecBilanAvecGagnant.reduce((acc, a) => ({ mise: acc.mise + miseCombinee(a), gain: acc.gain + gainCombine(a) }), { mise: 0, gain: 0 });
  const bilanPlaceSeul = avecBilanPlaceSeul.reduce((acc, a) => ({ mise: acc.mise + miseCombinee(a), gain: acc.gain + gainCombine(a) }), { mise: 0, gain: 0 });
  const netAvecGagnant = bilanAvecGagnant.gain - bilanAvecGagnant.mise;
  const netPlaceSeul = bilanPlaceSeul.gain - bilanPlaceSeul.mise;

  // Date du bilan transfere = date des REUNIONS concernees (meeting.date),
  // PAS la date du jour ou le transfert est clique.
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
           <p class="muted small" style="margin-top:6px;">dont avec Simple Gagnant (rang IA 1 dans le pool) : <span class="${netAvecGagnant >= 0 ? 'tag-green' : 'tag-red'} bold">${netAvecGagnant >= 0 ? '+' : ''}${netAvecGagnant.toFixed(2)} &euro;</span>${avecBilanAvecGagnant.length > 0 ? ` (${avecBilanAvecGagnant.length} course${avecBilanAvecGagnant.length > 1 ? 's' : ''})` : ' (aucune course)'}</p>
           <p class="muted small" style="margin-top:2px;">dont Simple Place seul : <span class="${netPlaceSeul >= 0 ? 'tag-green' : 'tag-red'} bold">${netPlaceSeul >= 0 ? '+' : ''}${netPlaceSeul.toFixed(2)} &euro;</span>${avecBilanPlaceSeul.length > 0 ? ` (${avecBilanPlaceSeul.length} course${avecBilanPlaceSeul.length > 1 ? 's' : ''})` : ' (aucune course)'}</p>`
        : `<p class="muted small" style="margin-top:8px;">Cliquez sur "R&eacute;cup&eacute;rer les rapports" pour calculer le bilan financier &agrave; partir des dividendes PMU officiels (Simple Gagnant/Place), sur les courses captur&eacute;es uniquement (une course rat&eacute;e n'a pas besoin de rapport pour conna&icirc;tre son bilan).</p>`}
      <div id="simple-gagnant-rapports-status"></div>
      ${avecBilan.length > 0 ? `
        ${dateTransfert
          ? `<button class="btn btn-primary btn-block" data-transfert-bilan="${dateTransfert}" style="margin-top:10px;">Transfert bilan (${dateTransfert})</button>
             <div id="transfert-bilan-status"></div>
             ${aRecuperer.length > 0 ? `<p class="muted small" style="margin-top:6px;">${aRecuperer.length} course(s) captur&eacute;e(s) en attente de rapport : le bilan transf&eacute;r&eacute; sera partiel. R&eacute;cup&eacute;rez les rapports avant de transf&eacute;rer pour un bilan complet.</p>` : ''}`
          : `<p class="small tag-orange bold" style="margin-top:10px;">Transfert impossible : les courses avec bilan proviennent de plusieurs jours diff&eacute;rents (${datesReunionsAvecBilan.join(', ')}). Videz les r&eacute;unions import&eacute;es et traitez un jour &agrave; la fois pour transf&eacute;rer.</p>`}
      ` : ''}
      <p class="muted small" style="margin-top:8px;">Hypoth&eacute;tique : suppose ${MISE_STANDARD_BILAN_SIMPLE_GAGNANT}&euro; jou&eacute;s en Simple Place (Dutching sur tous les chevaux du croisement) ET, quand applicable, ${MISE_STANDARD_BILAN_SIMPLE_GAGNANT}&euro; en Simple Gagnant (le cheval au rang IA 1), sur toutes les courses rentables du jour (tous modes, quel que soit le filtre choisi ci-dessus) &mdash; ce n'est pas un historique de vos mises reelles. Ne remplace pas votre propre jugement.</p>
    </div>`;

  // *** sept. 2026 (a la demande explicite de l'utilisateur : "il faudrait
  // que celle-ci soient reperees pour differencier les supplementation des
  // top 5 IA place") : badge de source, une course pouvant desormais
  // apparaitre 2 fois (une entree par signal rentable, voir
  // collecterCandidatesSimpleGagnant).
  const sourceBadgeHtml = (source) => source === 'supplementation'
    ? '<span class="small tag-orange bold">Suppl&eacute;mentation</span>'
    : '<span class="small tag-blue bold">Top 5 IA Plac&eacute;</span>';

  const rowHtml = (a) => {
    const dateVal = new Date(a.meeting.date).toISOString().slice(0, 10);
    const dateLabelHtml = datesCandidates.length > 1
      ? `<span class="small tag-blue bold" style="margin-right:6px;">${new Date(dateVal).toLocaleDateString('fr-FR')}</span>`
      : '';
    const gagnantTxt = a.jeu.gagnant ? ` / Gagnant n&deg;${a.jeu.gagnant.chevaux.map((c) => c.entry.numero).join('-')}` : '';
    const placeTxt = `Place n&deg;${a.jeu.place.chevaux.map((c) => c.entry.numero).join('-')}`;
    return `
    <div class="list-item clickable" data-goto="race/${a.race.id}">
      <div>
        <div class="bold">${dateLabelHtml}${sourceBadgeHtml(a.source)} ${a.race.heureDepart ? `${escapeHtml(a.race.heureDepart)} - ` : ''}${escapeHtml(a.meeting.hippodrome)} - Course ${a.race.numeroCourse}</div>
        <div class="muted small">${placeTxt}${gagnantTxt}${a.connu ? ` - Vainqueur n&deg;${a.vrai1}` : ' - En attente de resultat'}</div>
      </div>
      <div style="display:flex; flex-direction:column; align-items:flex-end; gap:2px;">
        ${a.connu
          ? (a.placeGagne ? '<span class="small tag-green bold">Captur&eacute;</span>' : '<span class="small tag-red bold">Rat&eacute;</span>')
          : '<span class="small tag-gray bold">En attente</span>'}
        ${a.rapportStatus === 'ok' ? `<span class="small ${netCombine(a) >= 0 ? 'tag-green' : 'tag-red'} bold">${netCombine(a) >= 0 ? '+' : ''}${netCombine(a).toFixed(2)} &euro;</span>` : ''}
        ${a.rapportStatus === 'indisponible' ? '<span class="small tag-gray">Rapport indisponible</span>' : ''}
        ${a.rapportStatus === 'a_recuperer' ? '<span class="small muted">Rapport non recupere</span>' : ''}
      </div>
    </div>`;
  };

  appEl.innerHTML = `
    ${bilanGlobalLinkHtml}
    ${introHtml}
    ${dateFiltreHtml}
    ${filtreHtml}
    ${arriveeHtml}
    ${tauxHtml}
    ${bilanHtml}
    ${avecResultatFiltre.length > 0 ? `<div class="list-group" style="margin-top:10px;">${avecResultatFiltre.map(rowHtml).join('')}</div>` : ''}
    ${enAttenteFiltre.length > 0 ? `<h3 style="margin-top:16px;">En attente de resultat (${enAttenteFiltre.length})</h3><div class="list-group">${enAttenteFiltre.map(rowHtml).join('')}</div>` : ''}
  `;

  bindGoto();
  bindDateFiltreSimpleGagnantSelector(renderBilanSimpleGPAncien);
  bindFiltreModeSimpleGagnantSelector(renderBilanSimpleGPAncien);
  bindRecupererArriveesSimpleGagnant(enAttenteArrivee, renderBilanSimpleGPAncien);

  // "Transfert bilan" : enregistre le bilan du jour (reussite, mise/gain/net,
  // rendement) dans l'historique manuel (page "Bilan Global Simple Gagnant").
  // Date = date des REUNIONS (meeting.date), PAS la date du jour reel du clic.
  //
  // *** sept. 2026 *** : les champs `rang1Seul`/`classement8h` sont
  // REUTILISES tels quels (compatibilite avec cumulerBilansJournaliers et
  // l'historique deja transfere) pour porter desormais respectivement le
  // sous-bilan "avec Simple Gagnant" et "Simple Place seul".
  // *** sept. 2026, a la demande de l'utilisateur *** : `reussies` mesure
  // uniquement la capture du Simple PLACE (a.placeGagne) - ca n'a jamais
  // reflete le taux de victoire du Simple GAGNANT lui-meme, meme dans le
  // sous-bilan "avec Simple Gagnant" (confusion signalee par l'utilisateur
  // sur la carte du meme nom : "10/10" y affichait la reussite Place, pas
  // Gagnant). `reussiesGagnant` ajoute ce compte separement (uniquement
  // pertinent pour `rang1Seul`, ou jeu.gagnant existe sur toute la liste -
  // vaut 0 pour `classement8h`/Place seul, ou aucun Simple Gagnant n'est
  // joue).
  const sousBilanJour = (liste) => {
    const avecBilanOk = liste.filter((a) => a.rapportStatus === 'ok');
    const mise = avecBilanOk.reduce((acc, a) => acc + miseCombinee(a), 0);
    const gain = avecBilanOk.reduce((acc, a) => acc + gainCombine(a), 0);
    return {
      nbCourses: liste.length,
      reussies: liste.filter((a) => a.placeGagne).length,
      reussiesGagnant: liste.filter((a) => a.gagnantGagne).length,
      mise, gain, net: gain - mise
    };
  };

  const btnTransfert = appEl.querySelector('[data-transfert-bilan]');
  if (btnTransfert && dateTransfert) {
    btnTransfert.addEventListener('click', async () => {
      const statusEl = appEl.querySelector('#transfert-bilan-status');
      const avecResultatDuJour = avecResultat.filter((a) => new Date(a.meeting.date).toISOString().slice(0, 10) === dateTransfert);
      const reussiesDuJour = avecResultatDuJour.filter((a) => a.placeGagne);
      const avecGagnantDuJour = avecResultatDuJour.filter((a) => a.jeu.gagnant !== null);
      const placeSeulDuJour = avecResultatDuJour.filter((a) => a.jeu.gagnant === null);
      const record = {
        id: dateTransfert,
        date: dateTransfert,
        nbCourses: avecResultatDuJour.length,
        reussies: reussiesDuJour.length,
        mise: bilanGlobal.mise,
        gain: bilanGlobal.gain,
        net: netGlobal,
        transferedAt: new Date().toISOString(),
        rang1Seul: sousBilanJour(avecGagnantDuJour),
        classement8h: sousBilanJour(placeSeulDuJour)
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
  // requetes simultanees).
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
          const json = await fetchRapportsAvecFallback(dateVal, a.meeting.numeroReunion, a.race.numeroCourse);
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
      await renderBilanSimpleGPAncien();
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
  renderTopbar('Bilan Global Simple G/P', { back: () => navigate('bilan') });

  const bilans = await DB.getAllBilansJournaliersSimpleGagnant();

  if (bilans.length === 0) {
    appEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">\u{1F4C8}</div>
        <p class="bold">Aucun bilan transf&eacute;r&eacute; pour l'instant</p>
        <p class="muted">Sur la page "Simple G/P", une fois le r&eacute;sultat du jour connu, cliquez sur "Transfert bilan" pour l'ajouter ici.</p>
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
  const modeVide = () => ({ nbCourses: 0, reussies: 0, reussiesGagnant: 0, mise: 0, gain: 0, net: 0 });
  const cumulerMode = (...champs) => bilans.reduce((acc, b) => {
    const champ = champs.find((c) => b[c]);
    const m = (champ ? b[champ] : null) || modeVide();
    return {
      nbCourses: acc.nbCourses + m.nbCourses,
      reussies: acc.reussies + m.reussies,
      reussiesGagnant: acc.reussiesGagnant + (m.reussiesGagnant || 0),
      mise: acc.mise + m.mise, gain: acc.gain + m.gain, net: acc.net + m.net
    };
  }, modeVide());
  const totalRang1Seul = cumulerMode('rang1Seul');
  const totalClassement8h = cumulerMode('classement8h', 'chevalValueSeul');
  const rendementRang1Seul = rendementBilan({ mise: totalRang1Seul.mise, gain: totalRang1Seul.gain });
  const rendementClassement8h = rendementBilan({ mise: totalClassement8h.mise, gain: totalClassement8h.gain });
  const joursSansDetailMode = bilans.filter((b) => !b.rang1Seul || (!b.classement8h && !b.chevalValueSeul)).length;

  // *** sept. 2026, a la demande de l'utilisateur *** : `reussite` ci-dessous
  // reste la capture du Simple PLACE (coherent avec la carte "Simple Place
  // seul", ou seul ce pari existe) ; `avecGagnant` (optionnel) ajoute une
  // ligne separee pour le taux de victoire reel du Simple GAGNANT, la ou il
  // est joue - evite la confusion precedente ou le "X/Y" de la carte "Avec
  // Simple Gagnant" affichait en realite la reussite Place.
  const carteMode = (titre, t, rendement, avecGagnant) => `
    <div class="card" style="text-align:center; flex:1; min-width:200px;">
      <p class="muted small" style="margin:0;">${titre}</p>
      <p class="bold ${t.net >= 0 ? 'tag-green' : 'tag-red'}" style="font-size:1.4em; margin:4px 0;">${t.net >= 0 ? '+' : ''}${t.net.toFixed(2)} &euro;</p>
      <p class="muted small" style="margin:0;">Mise ${t.mise.toFixed(2)} &euro; / Gains ${t.gain.toFixed(2)} &euro; &middot; rendement ${rendement == null ? '-' : (rendement * 100).toFixed(1) + '%'}</p>
      <p class="muted small" style="margin:2px 0 0;">R&eacute;ussite Place : ${t.nbCourses > 0 ? `${t.reussies}/${t.nbCourses} (${Math.round((t.reussies / t.nbCourses) * 100)}%)` : '-'}</p>
      ${avecGagnant ? `<p class="muted small" style="margin:2px 0 0;">R&eacute;ussite Gagnant : ${t.nbCourses > 0 ? `${t.reussiesGagnant}/${t.nbCourses} (${Math.round((t.reussiesGagnant / t.nbCourses) * 100)}%)` : '-'}</p>` : ''}
    </div>`;

  const modesHtml = `
    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:${joursSansDetailMode > 0 ? '4px' : '10px'};">
      ${carteMode('Avec Simple Gagnant (rang IA 1 dans le pool)', totalRang1Seul, rendementRang1Seul, true)}
      ${carteMode('Simple Place seul', totalClassement8h, rendementClassement8h, false)}
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
    <p class="muted small" style="margin-top:10px;">Historique manuel, aliment&eacute; jour par jour via le bouton "Transfert bilan" de la page "Simple G/P". Bilan hypoth&eacute;tique (mise fixe ${MISE_STANDARD_BILAN_SIMPLE_GAGNANT}&euro;/course en Place, autant en Gagnant si applicable, Dutching) - ne remplace pas vos mises r&eacute;elles.</p>
  `;

  appEl.querySelectorAll('[data-supprimer-bilan]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Supprimer le bilan du ${btn.dataset.supprimerBilan} ?`)) return;
      await DB.deleteBilanJournalierSimpleGagnant(btn.dataset.supprimerBilan);
      await renderBilanGlobalSimpleGagnant();
    });
  });
}
