import { selRubsPourDiscipline, associationsPourDiscipline, NB_TOP_DEFAUT, topNPourRubrique } from './rubriques.js';

// =============================================================================
// basesEtDangers.js
// Portage du "Module 2" VBA (Module112 : EcrireTableauCourse +
// AnalyserBasesRetenues, v2) : "Base(s) possible(s)" et "Danger(s)" tels
// qu'affiches dans la feuille "Analyse complete courses" du classeur Excel.
//
// Fonctionnement (fidele au VBA v2) :
// 1. Pour 5 rubriques techniques choisies selon la discipline (RJ, RE, ED,
//    MP, PtH, MN, RC, RX, MX, CX, IdC, CFP, OR, PC, MA, AR, TG, R10), on
//    classe les chevaux et on retient le Top N (3 par defaut) de chacune.
// 2. "candidats" = chevaux qui remplissent TOUS les criteres techniques :
//    SC > 0, cote C8 (Y) <= 12, cote predictive (BE) > 0 et cote coherente
//    (pas de gros ecart Y/BE), et un critere "Dp" <= 4 (colonnes P1/P2).
// 3. "candidatsAssoc" = chevaux presents dans le Top N des DEUX rubriques
//    d'au moins une des 3 "meilleures associations" de la discipline.
// 4. Un cheval "confirme techniquement" est present dans candidats ET
//    candidatsAssoc.
// 5. Base(s) possible(s) = chevaux recommandes "Base tres solide" par le
//    Module 1 (moteur de score) ; a defaut, les "Base solide". *** NOUVEAU
//    v2 *** : une recommandation Module 1 n'est retenue comme base QUE si
//    la cote predictive (CM) ET la cote C8 sont toutes deux renseignees et
//    <= 12 (cotesOK). Un cheval recommande "Base solide"/"Base tres solide"
//    dont une des deux cotes depasse 12 (ou est absente) n'est plus retenu
//    comme base. Chaque base retenue affiche ensuite un niveau de confiance
//    selon qu'elle est aussi confirmee techniquement (Module 2) ou non.
// 6. Danger(s) = chevaux avec Value < -10% ET une cote jouable (<= 50),
//    signalant un cheval tres joue par le marche que le modele ne classe
//    pas parmi les bases : a surveiller comme trouble-fete potentiel.
//    (inchange en v2)
//
// Hors perimetre (non porte, trop specifique a la mise en forme Excel) :
// le tableau visuel Top-N complet, le "Score /9" par cheval, le bloc
// "Meilleures associations" affiche colonne par colonne. Seul le RESULTAT
// utile au pronostic (Base(s) possible(s) / Danger(s)) est calcule ici.
// =============================================================================

/**
 * Reproduit le critere technique de `EcrireTableauCourse` /
 * "RECHERCHE DES CANDIDATS POUR BASE" : SC>0, cote C8<=12, cote predictive
 * renseignee et coherente avec C8, et le critere "Dp"<=4 (P1/P2).
 */
function estCandidatTechnique(entry) {
  const sc = entry.sc ?? 0;
  if (!(sc > 0)) return false;

  const Y = entry.cote8h ?? 0;     // C8
  const BE = entry.cotePredictive ?? 0; // Cote Calc
  if (Y > 12) return false;
  if (!(BE > 0)) return false;
  if (BE > 12 && (Y / BE) >= 0.5) return false;

  const p1raw = (entry.p1 || '').trim();
  if (p1raw.toUpperCase() === 'D') {
    const p2 = Number((entry.p2 || '').replace(',', '.'));
    if (Number.isNaN(p2) || p2 > 4) return false;
  } else {
    const p1 = Number(p1raw.replace(',', '.'));
    if (p1raw === '' || Number.isNaN(p1) || p1 > 4) return false;
  }
  return true;
}

/**
 * *** NOUVEAU v2 *** : une recommandation du Module 1 ("Base solide" /
 * "Base tres solide") n'est retenue comme base que si la cote predictive
 * (CM, colonne AA cote Analyse Excel) ET la cote C8 (colonne AH) sont
 * toutes deux renseignees (> 0) et <= 12. Cote coherent avec les champs
 * deja disponibles sur l'entry : `cotePredictive` (Cote Calc) et `cote8h`
 * (C8), les memes utilises par `estCandidatTechnique` pour le critere
 * technique Module 2 (mais applique ici independamment, sur la
 * Recommandation du Module 1).
 */
function cotesBaseOK(entry) {
  const cm = entry.cotePredictive ?? 0;
  const c8 = entry.cote8h ?? 0;
  return cm > 0 && cm <= 12 && c8 > 0 && c8 <= 12;
}

/**
 * @param {Array} chevaux - le tableau `result.chevaux` renvoye par
 *   RaceAnalyzer.analyser (chaque element a `.entry` avec `rubriques`,
 *   `sc`, `p1`, `p2`, `cote8h`, `cotePredictive`, et `.recommandation`,
 *   `.value`, `.probTop3`, `.cotePourAffichage` calcules par le Module 1).
 * @param {string} disciplineCanonique - ex. "ATTELE", "PLAT"...
 * @param {number} nbTop - nombre de chevaux retenus par rubrique (3 par defaut,
 *   comme dans le classeur d'origine).
 */
export function calculerBasesEtDangers(chevaux, disciplineCanonique, nbTop = NB_TOP_DEFAUT) {
  const selRubs = selRubsPourDiscipline(disciplineCanonique);
  const assocPairs = associationsPourDiscipline(disciplineCanonique);

  const topNCache = new Map();
  function topN(rubIdx) {
    if (!topNCache.has(rubIdx)) topNCache.set(rubIdx, topNPourRubrique(chevaux, rubIdx, nbTop));
    return topNCache.get(rubIdx);
  }
  // Precalcul des Top-N necessaires (5 rubriques + rubriques des associations).
  selRubs.forEach(topN);
  assocPairs.forEach(([a, b]) => { topN(a); topN(b); });

  const candidats = new Set(chevaux.filter((c) => estCandidatTechnique(c.entry)).map((c) => c.entry.numero));

  const candidatsAssoc = new Set(
    chevaux
      .filter((c) => assocPairs.some(([a, b]) => topN(a).includes(c.entry.numero) && topN(b).includes(c.entry.numero)))
      .map((c) => c.entry.numero)
  );

  const confirmesTechniquement = new Set([...candidats].filter((n) => candidatsAssoc.has(n)));

  // --- Fusion avec la Recommandation du Module 1 ---
  // v2 : la Recommandation ne compte que si cotesBaseOK(entry) (cote
  // predictive ET cote C8 renseignees et <= 12) - voir note ci-dessus.
  const tresSolides = chevaux.filter((c) => c.recommandation === 'Base très solide' && cotesBaseOK(c.entry)).map((c) => c.entry.numero);
  const solides = chevaux.filter((c) => c.recommandation === 'Base solide' && cotesBaseOK(c.entry)).map((c) => c.entry.numero);
  const basesFinal = tresSolides.length > 0 ? tresSolides : solides;

  const bases = basesFinal.map((numero) => {
    const isTresSolide = tresSolides.includes(numero);
    const isConfirme = confirmesTechniquement.has(numero);
    let niveau;
    if (isTresSolide && isConfirme) niveau = 'confirmee_forte';
    else if (isTresSolide) niveau = 'non_confirmee_forte';
    else if (isConfirme) niveau = 'confirmee';
    else niveau = 'non_confirmee';
    return { numero, isTresSolide, isConfirme, niveau };
  });

  // Meilleur cheval parmi les bases (Base très solide / Base solide), au
  // sens de la Prob. Top3 du Module 1. v2 : soumis au meme filtre
  // cotesBaseOK que ci-dessus (le VBA ne met a jour meilleurNum que dans
  // le bloc "If cotesOK Then").
  let meilleur = null;
  for (const c of chevaux) {
    if ((c.recommandation === 'Base très solide' || c.recommandation === 'Base solide') && cotesBaseOK(c.entry)) {
      if (!meilleur || c.probTop3 > meilleur.probTop3) {
        meilleur = { numero: c.entry.numero, probTop3: c.probTop3, probTop2: c.probTop2 };
      }
    }
  }

  // *** "Top2 fiable" *** : la base retenue (`meilleur`) a-t-elle un ecart de
  // Score Global suffisant sur son 2e meilleur rival pour avoir de bonnes
  // chances de terminer precisement dans les 2 premiers (et non seulement
  // dans les 3 premiers) ? On compare le Score Global de la base au 2e
  // meilleur score du reste du champ (hors la base) : s'il faudrait DEUX
  // autres chevaux pour la reléguer hors du top 2, l'ecart avec ce 2e rival
  // mesure bien cette marge de securite - comparer seulement au 1er rival
  // ne dirait rien de sa capacite a rester 2e si ce 1er rival passe devant.
  //
  // *** Note *** : un premier essai base sur un seuil absolu de Prob Top2
  // (Plackett-Luce, cf. probTop2 ci-dessous, toujours affiche a titre
  // informatif) a ete teste puis ecarte apres verification sur des donnees
  // reelles (reunion CLAIREFONTAINE-DEAUVILLE) - meme probleme que la
  // confiance Top3 abandonnee pour "Course logique" : la Prob Top2 est elle
  // aussi fortement diluee dans un champ de 11 a 15 chevaux (jamais au-dela
  // de 25% environ, quel que soit le niveau de domination reelle),
  // rendant tout seuil absolu impraticable. L'ecart de Score Global, lui,
  // varie fortement avec la domination reelle (4.7 a 21.5 points observes
  // sur les bases de cette reunion), comme deja constate pour "Hierarchie
  // claire" : meme seuil repris ici (>=15 points) par coherence.
  if (meilleur) {
    const scoreBase = chevaux.find((c) => c.entry.numero === meilleur.numero)?.scoreGlobal ?? 0;
    const rivauxScores = chevaux
      .filter((c) => c.entry.numero !== meilleur.numero)
      .map((c) => c.scoreGlobal ?? 0)
      .sort((a, b) => b - a);
    const deuxiemeRival = rivauxScores.length >= 2 ? rivauxScores[1] : (rivauxScores[0] ?? 0);
    meilleur.ecartScoreVs2emeRival = Math.round((scoreBase - deuxiemeRival) * 10) / 10;
  }
  const SEUIL_ECART_TOP2 = 15;
  const top2Fiable = !!meilleur && meilleur.ecartScoreVs2emeRival >= SEUIL_ECART_TOP2;

  // --- Danger(s) : Value < -10% ET cote jouable (<=50) ---
  const danger = chevaux
    .filter((c) => c.value < -10 && c.cotePourAffichage != null && c.cotePourAffichage <= 50)
    .map((c) => c.entry.numero);

  // --- Variantes "sans cote", utilisees par le statut Course logique/aleatoire
  // (app.js) qui ne doit pas dependre de la cote du marche : ---
  // Base confirmee techniquement (Module 2), sur TOUT cheval recommande
  // "Base solide"/"Base tres solide" par le Module 1, SANS le filtre
  // cotesBaseOK (cote predictive/C8 <= 12) applique ci-dessus a `bases`.
  const baseConfirmeeSansCote = chevaux.some((c) =>
    (c.recommandation === 'Base très solide' || c.recommandation === 'Base solide')
    && confirmesTechniquement.has(c.entry.numero)
  );

  // Danger(s) sur Value < -10% uniquement, sans le filtre de cote jouable (<=50).
  const dangerSansCote = chevaux.filter((c) => c.value < -10).map((c) => c.entry.numero);

  return { bases, meilleur, danger, baseConfirmeeSansCote, dangerSansCote, top2Fiable };
}

/**
 * Libelle et description courte d'un niveau de confiance de base, pour
 * l'affichage (correspond aux 4 couleurs du classeur d'origine).
 */
export function libelleNiveauBase(niveau) {
  switch (niveau) {
    case 'confirmee_forte': return { label: 'Base très solide (confirmée)', tag: 'danger-strong' };
    case 'non_confirmee_forte': return { label: 'Base très solide', tag: 'strong' };
    case 'confirmee': return { label: 'Base solide (confirmée)', tag: 'confirmed' };
    default: return { label: 'Base solide', tag: 'plain' };
  }
}
