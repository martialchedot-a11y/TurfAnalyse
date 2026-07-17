// =============================================================================
// cloudflare-worker/pmu-cotes.js
// Equivalent de netlify/functions/pmu-cotes.js, mais pour Cloudflare Workers.
// Utile depuis la migration vers GitHub Pages (qui ne supporte pas les
// fonctions serverless) : sans cette fonction, l'appli retombe sur des
// proxys CORS publics gratuits (allorigins.win, corsproxy.io, codetabs.com),
// qui se sont reveles peu fiables (tous en panne simultanement a l'usage).
//
// Un Cloudflare Worker fait un appel SERVEUR-A-SERVEUR a l'API PMU, jamais
// soumis aux restrictions CORS (celles-ci ne s'appliquent qu'aux requetes
// emises par un navigateur) — exactement le meme principe que la fonction
// Netlify, en restant gratuit (100 000 requetes/jour offertes, sans risque
// de facturation surprise).
//
// Deploiement (voir HEBERGEMENT.md pour le detail pas-a-pas) :
// 1. Creer un compte gratuit sur https://workers.cloudflare.com
// 2. Dashboard > Workers & Pages > Create > "Hello World" (Worker), lui
//    donner un nom (ex. "pmu-cotes").
// 3. Cliquer "Edit code", remplacer TOUT le contenu par ce fichier, Deploy.
// 4. Copier l'URL affichee (ex. https://pmu-cotes.VOTRE-COMPTE.workers.dev).
// 5. Coller cette URL dans js/engine/pmuApi.js, constante
//    CLOUDFLARE_WORKER_URL (voir ce fichier), puis re-deposer les fichiers
//    modifies sur GitHub Pages.
//
// Appel depuis le frontend (voir js/engine/pmuApi.js) :
//   https://pmu-cotes.VOTRE-COMPTE.workers.dev?date=DDMMYYYY&reunion=1&course=4&type=participants
//
// Le parametre `type` distingue deux usages :
// - "participants" (par defaut) : cotes en direct, tape l'endpoint .../participants.
// - "resultat" : arrivee officielle (une fois la course terminee), tape
//   l'endpoint course PMU SANS le suffixe /participants (qui contient alors
//   `arriveeDefinitive` et `ordreArrivee`).
// =============================================================================

const BASE_URL = 'https://offline.turfinfo.api.pmu.fr/rest/client/7/programme';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const reunion = searchParams.get('reunion');
    const course = searchParams.get('course');
    const type = searchParams.get('type');

    if (!date || !reunion || !course) {
      return new Response(
        JSON.stringify({ error: 'Parametres manquants (date, reunion, course requis).' }),
        { status: 400, headers: corsHeaders() }
      );
    }

    const suffixe = type === 'resultat' ? '' : '/participants';
    const url = `${BASE_URL}/${date}/R${reunion}/C${course}${suffixe}`;

    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      const text = await response.text();

      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: `Reponse HTTP ${response.status} de l'API PMU.` }),
          { status: response.status, headers: corsHeaders() }
        );
      }

      // On relaie tel quel le JSON de l'API PMU (deja au bon format attendu
      // par mapParticipantsPmu cote frontend), en ajoutant simplement
      // l'en-tete CORS necessaire pour que le navigateur accepte la reponse.
      return new Response(text, { status: 200, headers: corsHeaders() });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: `Echec de l'appel serveur a l'API PMU : ${err.message || err}` }),
        { status: 502, headers: corsHeaders() }
      );
    }
  }
};
