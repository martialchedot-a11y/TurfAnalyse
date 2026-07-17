// =============================================================================
// val-town/pmu-cotes.ts
// Version pour Val Town (https://www.val.town) de la fonction "fonction
// externe" utilisee par TurfAnalyse-Web pour recuperer les cotes PMU sans
// restriction CORS — sans dependre de Netlify (utile si vous n'avez plus de
// credit Netlify disponible, ou si vous preferez eviter tout quota/dashboard
// complexe). Val Town propose un editeur de code directement dans le
// navigateur, gratuit, sans ligne de commande ni compte GitHub necessaire.
//
// Contrat identique a netlify/functions/pmu-cotes.js : memes parametres
// (date, reunion, course, type), memes en-tetes CORS ; seule la "forme" de
// la fonction change (un "HTTP val" prend en entree une Request web-standard
// et renvoie une Response web-standard, au lieu du format
// exports.handler(event) de Netlify).
//
// Mise en place (aucune ligne de commande, aucun compte Netlify necessaire) :
// 1. Creez un compte gratuit sur https://www.val.town
// 2. Cliquez sur "+" (nouveau val), donnez-lui un nom (ex. "pmu-cotes").
// 3. Effacez le contenu par defaut de l'editeur, collez tout le code
//    ci-dessous a la place.
// 4. Cliquez sur le bouton "+" en haut a droite de l'editeur, choisissez
//    "HTTP" comme type de declencheur, puis sauvegardez (Ctrl+S ou Cmd+S).
// 5. L'URL de votre fonction s'affiche immediatement, du type
//    https://votre-nom-pmu-cotes.web.val.run — communiquez-la moi pour
//    l'integrer a EXTERNAL_FUNCTION_URL (js/engine/pmuApi.js) et recevoir la
//    version mise a jour de TurfAnalyse-Web.
// =============================================================================

const BASE_URL = 'https://offline.turfinfo.api.pmu.fr/rest/client/7/programme';

export default async function (req: Request): Promise<Response> {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const params = new URL(req.url).searchParams;
  const date = params.get('date');
  const reunion = params.get('reunion');
  const course = params.get('course');
  const type = params.get('type');

  if (!date || !reunion || !course) {
    return new Response(
      JSON.stringify({ error: 'Parametres manquants (date, reunion, course requis).' }),
      { status: 400, headers }
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
        { status: response.status, headers }
      );
    }

    // On relaie tel quel le JSON de l'API PMU (deja au bon format attendu par
    // mapParticipantsPmu cote frontend), en ajoutant simplement l'en-tete
    // CORS necessaire pour que le navigateur accepte la reponse.
    return new Response(text, { status: 200, headers });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Echec de l'appel serveur a l'API PMU : ${err instanceof Error ? err.message : err}` }),
      { status: 502, headers }
    );
  }
}
