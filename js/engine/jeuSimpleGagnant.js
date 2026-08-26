// =============================================================================
// jeuSimpleGagnant.js
// "Jeu Simple Gagnant" (v12, aout 2026) : ne retient plus QUE le rang 1 du
// classement Score Global, via DEUX sources de cote possibles :
//
//   Cote DIRECTE > 3,8 ET scoreAptitude >= 85
//     -> "1er du classement seul".
//   Cote 8H       > 3,8 ET ecart de Score Global (rang1 vs rang2) >= 15
//                 ET scoreAptitude >= 85
//     -> "1er du classement 8h", UNIQUEMENT si le rang 1 ne qualifie PAS
//        deja en cote directe.
//
// Le rang 1 en cote DIRECTE reste toujours prioritaire des qu'il qualifie.
// S'il ne qualifie pas, on retente EXACTEMENT le meme controle en cote 8h
// (celle du matin, potentiellement differente de la cote directe si le
// marche a bouge depuis) : c'est desormais l'UNIQUE alternative de la page
// (le mode "Cheval value seul" sur les rangs 2/4/5, et sa condition de
// score Croisement R10/TG/OR/IdC, ont ete retires - a la demande de
// l'utilisateur, aout 2026 : le rang 1 reste de loin le signal le plus
// solide et le plus simple a suivre de tout le backtest). Le paiement/gain
// reel reste toujours base sur la cote la plus a jour disponible
// (`cotePourAffichage`, priorite a la cote directe) au moment du calcul -
// seul le SEUIL DE SELECTION change de source entre les deux modes,
// conformement a la mecanique du pari mutuel PMU (le dividende depend du
// pool a la fermeture des paris, pas de l'heure a laquelle on selectionne
// le cheval - deja verifie sur echantillon reel, voir HEBERGEMENT.md).
//
// *** v12 (aout 2026) : correctif fuite de donnees + remplacement du filtre
// d'ecart par scoreAptitude (rang1) ***
// Un bug a ete identifie et corrige dans `historiquePour()`
// (`js/engine/csvImporter.js`) : l'historique utilise pour calculer le
// score d'un cheval incluait, par erreur, sa propre performance du jour
// meme (deja connue dans les fichiers d'archive au moment du calcul). Cette
// fuite gonflait artificiellement le score du vainqueur reel (et deprimait
// celui des perdants), ce qui explique les chiffres tres eleves des
// versions precedentes (190,3% / 132,8% cites plus haut dans l'historique -
// CES CHIFFRES ETAIENT UN ARTEFACT DU BUG, pas un edge reel). Une fois le
// bug corrige, le rendement honnete du rang 1 seul tombe a ~91,8% (cote
// directe) / ~88,5% (cote 8h) sur l'archive complete (417 fichiers/12121
// courses cote>3,8), et l'ancien filtre d'ecart de Score Global (qui
// n'apportait sa valeur QUE via la fuite) ne separe plus rien de robuste
// une fois la fuite corrigee (verifie par tranches + retrait des plus gros
// gains).
// Recherche d'un signal de remplacement honnete (sans triche, donnees
// disponibles avant la course uniquement) : comparaison du profil du rang 1
// quand il gagne reellement vs quand il perd, sur les 12121 courses. Seul
// le `scoreAptitude` (adequation aux conditions du jour - distance,
// terrain, hippodrome) montre une separation nette ET robuste :
//  - Cote directe, scoreAptitude>=85 (n=875, remplace le filtre d'ecart) :
//    21,4% reussite, 119,3% rendement, encore 90,3% apres retrait des 30
//    plus gros gains. Stable sur 11 des 14 mois testes.
//  - Cote 8h, ecart>=15 (inchange) + scoreAptitude>=85 (n=733) : 46,2%
//    reussite, 103,4% rendement (contre 92,6% pour l'ecart seul), encore
//    92,6% apres retrait des 30 plus gros gains. Stable sur 9 des 14 mois.
// D'autres pistes honnetes ont ete testees et rejetees car non robustes ou
// redondantes avec scoreAptitude : injection de victoire/place fictive
// (simple et double), confirmation par injection sur le top 8 du
// classement. Voir HEBERGEMENT.md pour le detail complet de ces tests.
//
// Historique (versions anterieures a v12) :
// *** v8 (aout 2026) *** : ajout de la condition d'ecart de Score Global
// (>=10, SEUIL_ECART_SCORE_RANG1) pour que le rang 1 qualifie en cote
// directe. Backtest reel (8 mois, rang1 cote > 3,8) : sans condition
// d'ecart, 164,0% de rendement (3274 courses) ; avec l'ecart >= 10, 1058
// courses mais reussite 27,4% -> 35,7% et rendement 201,1% - ROBUSTE
// (157,6% meme en retirant les 50 plus gros gains).
// *** v9 (aout 2026, RETIRE en v10) *** : mode "Cheval value seul" sur les
// rangs 2/4/5 (chacun rentable isolement, 103,2% a 112,5%), avec condition
// de score Croisement (R10/TG/OR/IdC) <=1 pour qualifier. Retire a la
// demande de l'utilisateur et remplace par "1er du classement 8h" (voir
// HEBERGEMENT.md pour le detail de la transition).
// *** v10 (aout 2026, a la demande de l'utilisateur) *** : suppression du
// mode "Cheval value seul", remplace par "1er du classement 8h" (memes
// seuils/ecart que le rang 1 en cote directe, source de cote 8h).
// *** v11 (aout 2026, a la demande de l'utilisateur) *** : seuil d'ecart
// releve de 10 a 15 (SEUIL_ECART_SCORE_RANG1_8H) pour le mode "1er du
// classement 8h" UNIQUEMENT (le mode cote directe garde son seuil de 10).
// Constat : la tranche d'ecart 10-15 etait a peine rentable en 8h (103,4%,
// n=944/3006) - retirer cette tranche degage un rendement plus solide sur le
// reste. Verifie sur l'archive complete (413 fichiers) via le moteur reel
// (jeu.mode8h) : n=2048 (contre 3006, -32% de courses jouees), rendement
// flat 133,6% (contre 124,3%), drawdown max 1,85% de la mise totale (contre
// 1,9%). Combine a la mise par palier d'ecart (voir plus bas) : rendement
// 135,9%, drawdown 1,65%. Le mode cote directe (seuil 10 inchange, 2133
// courses, 190,3%) n'est pas affecte.
//
// *** Mise par palier d'ecart (aout 2026, a la demande de l'utilisateur) ***
// : pour les DEUX modes ci-dessus (rang 1, cote directe OU 8h), mise
// optionnelle PONDEREE par l'ecart de Score Global (rang1 vs rang2) plutot
// que flat. Teste par l'utilisateur sur les 2133 courses "cote directe" de
// l'archive complete (mise de base = 1 unite) : x1 si ecart <20, x1,5 si
// 20<=ecart<30, x2 si ecart>=30 -> net total 2332,2 unites contre 1925,9 en
// mise flat, soit +21,1% de rendement, pour un risque quasiment identique
// (drawdown max 1,45% contre 1,5% en flat, capital min 996,80 contre 994,40
// sur capital de depart 1000). A la difference des mises en % du capital
// (testees et ECARTEES - voir HEBERGEMENT.md : drawdown 15% a 56% pour un
// gain theorique non exploitable car explosif/non plafonne), cette mise
// reste a UNITE FIXE par palier (pas de reinjection des gains), donc sans
// risque de derive. Optionnelle (case a cocher), desactivee par defaut.
//
// *** Warning hippodrome non rentable en cote 8h (aout 2026, a la demande de
// l'utilisateur) *** : backtest par hippodrome du mode "1er du classement
// 8h" (seuil d'ecart 15, archive complete 413 fichiers, n=2048). Sur les 68
// hippodromes couverts, 3 ressortent NON rentables (rendement <100%) avec un
// echantillon jugE suffisant (n>=15, seuil de prudence deja utilise ailleurs
// dans l'appli) : CLAIREFONTAINE DEAUVILLE (n=30, 65,3%), MESLAY DU MAINE
// (n=25, 90,0%), BEAUMONT DE LOMAGNE (n=18, 84,4%). Les hippodromes avec
// n<15 ne sont volontairement PAS inclus (echantillon trop faible pour
// conclure, cf. CAVAILLON n=12/97,5%, tout juste sous 100% mais non
// significatif). Le warning est purement informatif : il n'empeche pas de
// jouer, il signale juste un historique defavorable a CET hippodrome
// specifiquement pour LE MODE 8H (le mode cote directe n'est pas concerne).
// =============================================================================

export const SEUILS_VALUE_RANG_SIMPLE_GAGNANT = { 1: 3.8 };
export const SEUIL_ECART_SCORE_RANG1 = 10;
export const SEUIL_ECART_SCORE_RANG1_8H = 15;
// Seuil de scoreAptitude (rang1) introduit en v12 (aout 2026) - remplace le
// filtre d'ecart en cote directe, s'ajoute a l'ecart en cote 8h. Voir
// commentaire d'en-tete pour le detail du backtest honnete (post-correctif
// fuite de donnees) qui justifie ce seuil.
export const SEUIL_SCORE_APTITUDE_RANG1 = 85;

// Hippodromes ou le mode "1er du classement 8h" (seuil 15) s'est avere NON
// rentable sur l'archive complete, avec un echantillon >=15 courses (voir
// commentaire d'en-tete). Noms tels que fournis par les CSV (majuscules,
// sans accents).
export const HIPPODROMES_NON_RENTABLES_8H = [
  'CLAIREFONTAINE DEAUVILLE',
  'MESLAY DU MAINE',
  'BEAUMONT DE LOMAGNE'
];

/**
 * @param {string|null|undefined} hippodrome - nom brut (`race.lieu`/`context.lieu`).
 * @returns {boolean} true si cet hippodrome fait partie de la liste
 *   `HIPPODROMES_NON_RENTABLES_8H` (comparaison insensible a la casse et aux
 *   espaces superflus).
 */
export function estHippodromeNonRentable8h(hippodrome) {
  if (!hippodrome) return false;
  const norm = String(hippodrome).trim().toUpperCase();
  return HIPPODROMES_NON_RENTABLES_8H.includes(norm);
}

export const MISES_PRESETS_JEU_SIMPLE_GAGNANT = [10, 20, 30, 50, 75, 100, 150, 200];

// Paliers de mise ponderee par ecart de Score Global (rang1 seul, voir
// commentaire d'en-tete). Parcourus dans l'ordre : le dernier palier dont le
// seuil est atteint l'emporte.
export const PALIERS_MISE_ECART_RANG1 = [
  { seuil: 0, multiplicateur: 1 },
  { seuil: 20, multiplicateur: 1.5 },
  { seuil: 30, multiplicateur: 2 }
];

/**
 * Multiplicateur de mise applicable au rang 1 ("1er du classement seul")
 * selon son ecart de Score Global avec le rang 2 - voir
 * `PALIERS_MISE_ECART_RANG1` et le commentaire d'en-tete du fichier.
 * @param {number} ecartScore
 * @returns {number} 1, 1.5 ou 2.
 */
export function multiplicateurMiseEcartRang1(ecartScore) {
  let mult = 1;
  if (typeof ecartScore !== 'number' || Number.isNaN(ecartScore)) return mult;
  for (const p of PALIERS_MISE_ECART_RANG1) {
    if (ecartScore >= p.seuil) mult = p.multiplicateur;
  }
  return mult;
}

/**
 * Construit un pool Dutching (mise proportionnelle a 1/cote) a partir d'une
 * liste de chevaux (elements de result.chevaux, avec `.cotePourAffichage`).
 * @param {Array} pool
 * @returns {{chevaux:Array, n:number, s:number, rendement:number}}
 */
function poolDutching(pool) {
  const s = pool.reduce((acc, c) => acc + 1 / c.cotePourAffichage, 0);
  return { chevaux: pool, n: pool.length, s, rendement: 1 / s };
}

/**
 * @param {Array} chevaux - result.chevaux (RaceAnalyzer.analyser), chaque
 *   element avec `.classement`, `.cotePourAffichage`, `.scoreGlobal` et
 *   `.entry.coteDirecte`/`.entry.cote8h` (cotes reelles brutes).
 * @returns {{rentable:false}
 *          |{rentable:true, rang1Value:boolean, mode8h:boolean, ecartScoreRang1:number|null,
 *            principal:{chevaux,n,s,rendement},
 *            alternative:null,
 *            recommande:{chevaux,n,s,rendement}}}
 *   Non jouable (`rentable:false`) si le rang 1 ne qualifie NI en cote
 *   directe NI en cote 8h. Qualifie en cote directe (`rang1Value:true,
 *   mode8h:false`) si `entry.coteDirecte` depasse son seuil ET que
 *   `scoreAptitude` est >= `SEUIL_SCORE_APTITUDE_RANG1` (85, depuis v12) ;
 *   sinon, qualifie en cote 8h (`rang1Value:false, mode8h:true`) si
 *   `entry.cote8h` depasse le meme seuil de cote ET que l'ecart de Score
 *   Global avec le rang 2 est >= `SEUIL_ECART_SCORE_RANG1_8H` (15) ET que
 *   `scoreAptitude` est >= `SEUIL_SCORE_APTITUDE_RANG1` (voir commentaire
 *   d'en-tete pour le detail du backtest qui justifie ce remplacement du
 *   filtre d'ecart par scoreAptitude en cote directe). La cote directe est
 *   toujours prioritaire quand les deux qualifient. `principal` = "jouer le
 *   rang 1 seul" (Dutching degenere a 1 cheval, base sur sa cote
 *   d'affichage courante - priorite a la cote directe si connue). `ecartScoreRang1`
 *   = ecart de Score Global rang1 vs rang2 des que le jeu est rentable
 *   (sert au multiplicateur de mise par palier d'ecart, voir
 *   `multiplicateurMiseEcartRang1` - applicable aux deux modes, et au
 *   filtre de qualification en cote 8h), `null` sinon (rang 2 absent/score
 *   inconnu, ou jeu non rentable).
 */
export function jeuSimpleGagnant(chevaux) {
  const parRang = (r) => (chevaux || []).find((c) => c.classement === r && c.cotePourAffichage > 0);

  const rang1 = parRang(1);
  const rang2 = (chevaux || []).find((c) => c.classement === 2);

  let ecartScoreRang1 = null;
  if (rang1 && rang2 && typeof rang1.scoreGlobal === 'number' && typeof rang2.scoreGlobal === 'number') {
    ecartScoreRang1 = rang1.scoreGlobal - rang2.scoreGlobal;
  }
  const ecartOk8h = ecartScoreRang1 !== null && ecartScoreRang1 >= SEUIL_ECART_SCORE_RANG1_8H;
  const aptitudeOk = !!(rang1 && typeof rang1.scoreAptitude === 'number' && rang1.scoreAptitude >= SEUIL_SCORE_APTITUDE_RANG1);

  if (rang1 && aptitudeOk) {
    const seuil = SEUILS_VALUE_RANG_SIMPLE_GAGNANT[1];
    if (rang1.entry.coteDirecte > seuil) {
      const principal = poolDutching([rang1]);
      return { rentable: true, rang1Value: true, mode8h: false, ecartScoreRang1, principal, alternative: null, recommande: principal };
    }
    if (rang1.entry.cote8h > seuil && ecartOk8h) {
      const principal = poolDutching([rang1]);
      return { rentable: true, rang1Value: false, mode8h: true, ecartScoreRang1, principal, alternative: null, recommande: principal };
    }
  }

  return { rentable: false };
}

/**
 * Répartition des mises (méthode Dutching) pour un pool (cf. `principal`,
 * `alternative` ou `recommande` de `jeuSimpleGagnant`) et une mise totale
 * souhaitée : mise_i = M x (1/cote_i) / S, arrondie à l'euro le plus proche
 * (mises jouables au guichet PMU). L'arrondi utilise la méthode "au plus
 * fort reste" : chaque mise brute est arrondie à l'euro inférieur, puis les
 * euros restants (pour que la somme des mises arrondies reste exactement
 * égale à la mise totale) sont distribués aux chevaux dont la partie
 * décimale arrondie était la plus grande. Conséquence de l'arrondi : le
 * gain (mise_i x cote_i) n'est plus rigoureusement identique pour tous les
 * chevaux (contrairement au calcul non arrondi), l'écart reste toutefois
 * minime. Pour un pool a 1 seul cheval (mise flat), l'arrondi est trivial.
 * @param {{chevaux:Array, s:number}} pool
 * @param {number} miseTotale - en euros, entier (menu déroulant de presets).
 * @returns {Array<{numero:number, cote:number, mise:number, gain:number}>}
 */
export function misesJeuSimpleGagnant(pool, miseTotale) {
  if (!pool || !Array.isArray(pool.chevaux) || pool.chevaux.length === 0 || !(miseTotale > 0)) return [];

  const brutes = pool.chevaux.map((c) => ({
    numero: c.entry.numero,
    cote: c.cotePourAffichage,
    miseBrute: miseTotale * (1 / c.cotePourAffichage) / pool.s
  }));

  const miseTotaleEntiere = Math.round(miseTotale);
  const misesArrondiesBas = brutes.map((b) => Math.floor(b.miseBrute));
  const totalArrondiBas = misesArrondiesBas.reduce((acc, m) => acc + m, 0);
  const resteADistribuer = miseTotaleEntiere - totalArrondiBas;

  const ordreParReste = brutes
    .map((b, i) => ({ i, reste: b.miseBrute - misesArrondiesBas[i] }))
    .sort((a, b) => b.reste - a.reste);

  const misesFinales = misesArrondiesBas.slice();
  for (let k = 0; k < resteADistribuer && k < ordreParReste.length; k++) {
    misesFinales[ordreParReste[k].i] += 1;
  }

  return brutes.map((b, i) => ({
    numero: b.numero,
    cote: b.cote,
    mise: misesFinales[i],
    gain: misesFinales[i] * b.cote
  }));
}

/**
 * Bilan financier RÉEL (hypothétique : suppose une mise totale fixe, pas un
 * historique de mises effectivement jouées) d'une course pour le Jeu Simple
 * Gagnant, à la demande de l'utilisateur (page "Bilan Simple Gagnant").
 * Compare la mise totale (répartie via `misesJeuSimpleGagnant`) au gain
 * RÉEL si le vainqueur réel de la course fait partie du pool retenu.
 *
 * - Vainqueur hors pool ("raté") : mise totale perdue, sans besoin du
 *   rapport officiel (`dividendeConnu` reste `true` : le bilan est connu
 *   quel que soit le dividende du vainqueur).
 * - Vainqueur dans le pool ("capturé") mais rapport officiel pas encore
 *   récupéré/indisponible : bilan inconnu (`dividendeConnu: false`).
 * - Vainqueur dans le pool ET dividende connu : gain = mise du cheval
 *   vainqueur x son dividende officiel (rapport pour 1€).
 *
 * @param {{chevaux:Array, s:number}} pool - `principal`, `alternative` ou
 *   `recommande` de `jeuSimpleGagnant(chevaux)`.
 * @param {number} miseTotale
 * @param {Array<{numero:number, dividende:number}>|undefined} rapportReel - extraireRapportsSimpleGagnant(json) (js/engine/pmuApi.js).
 * @param {number} vrai1 - numéro du vainqueur réel de la course (1er de l'arrivée).
 * @returns {{mise:number, gain:number, net:number, gagne:boolean, dividendeConnu:boolean}}
 */
export function bilanJeuSimpleGagnant(pool, miseTotale, rapportReel, vrai1) {
  const gagne = !!(pool && Array.isArray(pool.chevaux) && pool.chevaux.some((c) => c.entry.numero === vrai1));
  if (!gagne) return { mise: miseTotale, gain: 0, net: -miseTotale, gagne: false, dividendeConnu: true };

  const mises = misesJeuSimpleGagnant(pool, miseTotale);
  const miseVainqueur = mises.find((m) => m.numero === vrai1);
  const rapport = Array.isArray(rapportReel) ? rapportReel.find((r) => r.numero === vrai1) : null;
  if (!miseVainqueur || !rapport) return { mise: miseTotale, gain: 0, net: -miseTotale, gagne: true, dividendeConnu: false };

  const gain = miseVainqueur.mise * rapport.dividende;
  return { mise: miseTotale, gain, net: gain - miseTotale, gagne: true, dividendeConnu: true };
}

/**
 * Rendement (gain/mise) d'un bilan journalier (ou de tout objet {mise,gain}),
 * en proportion (1 = 100%, comme `jeuSimpleGagnant(...).rendement`).
 * @param {{mise:number, gain:number}} bilan
 * @returns {number|null} null si la mise est nulle (rendement indefini).
 */
export function rendementBilan(bilan) {
  if (!bilan || !(bilan.mise > 0)) return null;
  return bilan.gain / bilan.mise;
}

/**
 * Historique des bilans quotidiens du Jeu Simple Gagnant (page "Bilan Global
 * Simple Gagnant", alimentee manuellement via le bouton "Transfert bilan" de
 * la page "Bilan Simple Gagnant" - un bilan par jour, cf. `js/db.js`). Trie
 * par date CROISSANTE et calcule le cumul (mise/gain/net) jour apres jour,
 * pour afficher la progression du bilan global au fil du temps.
 *
 * *** aout 2026 *** : en plus du cumul global (toutes courses rentables du
 * jour, tous modes confondus), cumule egalement SEPAREMENT les sous-bilans
 * par mode de jeu (`rang1Seul` et `classement8h`, chacun optionnel sur
 * chaque entree - cf. `js/app.js`, "Transfert bilan"), pour que la page
 * "Bilan Global Simple Gagnant" puisse comparer la progression des deux
 * modes. Les entrees anterieures a cette mise a jour n'ont pas ces deux
 * sous-champs : elles contribuent normalement au cumul global mais PAS aux
 * deux cumuls par mode (traites comme {mise:0, gain:0, net:0} ce jour-la),
 * ce qui cree un ecart attendu entre le cumul global et la somme des deux
 * cumuls par mode sur la periode anterieure a la mise a jour.
 *
 * *** v10 (aout 2026) *** : le mode "Cheval value seul" ayant ete remplace
 * par "1er du classement 8h" (voir plus haut), les entrees historiques
 * sauvegardees SOUS L'ANCIEN CHAMP `chevalValueSeul` continuent de compter
 * dans le cumul du 2e mode (repris sous `classement8h` si present, sinon
 * repli sur `chevalValueSeul`) - la continuite du suivi financier n'est pas
 * cassee par ce renommage, seul le libelle affiche change desormais.
 * @param {Array<{date:string, mise:number, gain:number, net:number, rang1Seul?:{mise:number,gain:number,net:number}, classement8h?:{mise:number,gain:number,net:number}, chevalValueSeul?:{mise:number,gain:number,net:number}}>} bilans
 * @returns {Array<{date:string, mise:number, gain:number, net:number, cumulMise:number, cumulGain:number, cumulNet:number, cumulRang1Seul:{mise:number,gain:number,net:number}, cumulClassement8h:{mise:number,gain:number,net:number}}>}
 */
export function cumulerBilansJournaliers(bilans) {
  const tries = [...(bilans || [])].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let cumulMise = 0;
  let cumulGain = 0;
  let cumulNet = 0;
  let cumulMiseR1 = 0, cumulGainR1 = 0, cumulNetR1 = 0;
  let cumulMise8h = 0, cumulGain8h = 0, cumulNet8h = 0;
  return tries.map((b) => {
    cumulMise += b.mise;
    cumulGain += b.gain;
    cumulNet += b.net;
    const r1 = b.rang1Seul || { mise: 0, gain: 0, net: 0 };
    const c8h = b.classement8h || b.chevalValueSeul || { mise: 0, gain: 0, net: 0 };
    cumulMiseR1 += r1.mise; cumulGainR1 += r1.gain; cumulNetR1 += r1.net;
    cumulMise8h += c8h.mise; cumulGain8h += c8h.gain; cumulNet8h += c8h.net;
    return {
      ...b, cumulMise, cumulGain, cumulNet,
      cumulRang1Seul: { mise: cumulMiseR1, gain: cumulGainR1, net: cumulNetR1 },
      cumulClassement8h: { mise: cumulMise8h, gain: cumulGain8h, net: cumulNet8h }
    };
  });
}
