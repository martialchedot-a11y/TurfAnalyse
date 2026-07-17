// =============================================================================
// netlify/functions/pmu-cotes.js
// Fonction serverless Netlify : recupere les cotes PMU cote SERVEUR, sans
// AUCUNE restriction CORS (contrairement a un appel direct depuis le
// navigateur, qui echoue quasi systematiquement — voir js/engine/pmuApi.js).
// Un appel serveur-a-serveur n'est jamais soumis aux regles CORS : celles-ci
// ne s'appliquent qu'aux requetes emises par un navigateur.
//
// C'est le moyen le PLUS FIABLE de recuperer les cotes automatiquement : plus
// besoin de dependre d'un proxy CORS public tiers (allorigins.win,
// corsproxy.io...), qui restent utilises en repli uniquement si cette
// fonction n'est pas disponible (par ex. si l'app est hebergee sur GitHub
// Pages, qui ne supporte pas les fonctions serverless).
//
// Aucune installation ni configuration necessaire : Netlify detecte
// automatiquement ce dossier via netlify.toml (a la racine du projet), y
// compris pour un deploiement manuel par glisser-deposer. Gratuit sur le
// plan Netlify gratuit (largement suffisant pour un usage personnel).
//
// Appel depuis le frontend :
//   /.netlify/functions/pmu-cotes?date=DDMMYYYY&reunion=1&course=4&type=participants
//
// Le parametre `type` distingue deux usages :
// - "participants" (par defaut) : cotes en direct, tape l'endpoint .../participants.
// - "resultat" : arrivee officielle (une fois la course terminee), tape
//   l'endpoint course PMU SANS le suffixe /participants (qui contient alors
//   `arriveeDefinitive` et `ordreArrivee`).
// =============================================================================

const BASE_URL = 'https://offline.turfinfo.api.pmu.fr/rest/client/7/programme';

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const params = event.queryStringParameters || {};
  const { date, reunion, course, type } = params;

  if (!date || !reunion || !course) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Parametres manquants (date, reunion, course requis).' })
    };
  }

  const suffixe = type === 'resultat' ? '' : '/participants';
  const url = `${BASE_URL}/${date}/R${reunion}/C${course}${suffixe}`;

  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const text = await response.text();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: `Reponse HTTP ${response.status} de l'API PMU.` })
      };
    }

    // On relaie tel quel le JSON de l'API PMU (deja au bon format attendu par
    // mapParticipantsPmu cote frontend), en ajoutant simplement l'en-tete
    // CORS necessaire pour que le navigateur accepte la reponse.
    return { statusCode: 200, headers, body: text };
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: `Echec de l'appel serveur a l'API PMU : ${err.message || err}` })
    };
  }
};
