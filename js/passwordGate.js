// =============================================================================
// js/passwordGate.js
// Barriere de mot de passe COTE CLIENT — un simple frein contre un visiteur
// de passage qui tomberait sur le lien par hasard, PAS une vraie protection :
// le site est 100% statique (GitHub Pages), donc n'importe qui peut lire ce
// fichier (clic droit > Afficher le code source / Inspecter) et y trouver le
// hash du mot de passe, voire contourner completement l'ecran en supprimant
// l'element #passwordGateOverlay depuis la console du navigateur. Ne convient
// pas pour proteger des donnees vraiment sensibles — seulement a decourager
// un acces accidentel via un lien partage.
//
// Le mot de passe n'est jamais stocke en clair ici : seul son hash SHA-256
// est compare (voir HASH_ATTENDU). Une fois valide, l'appareil est memorise
// (localStorage) et l'ecran ne sera plus redemande sur ce meme navigateur
// (jusqu'a effacement des donnees de site).
//
// Pour changer le mot de passe plus tard sans repasser par moi : ouvrez la
// console du navigateur (F12) sur n'importe quelle page HTTPS et executez
//   crypto.subtle.digest('SHA-256', new TextEncoder().encode('VOTRE_NOUVEAU_MDP'))
//     .then(b => console.log(Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2,'0')).join('')))
// puis remplacez HASH_ATTENDU ci-dessous par le resultat affiche.
// =============================================================================

(function () {
  const CLE_STOCKAGE = 'turfanalyse_acces_ok';
  const HASH_ATTENDU = '394d5ba52ef0d2ce57148d3187cdfc4f414a396e5273a30216d4d1604c01e411';

  if (localStorage.getItem(CLE_STOCKAGE) === '1') {
    return; // deja deverrouille sur cet appareil
  }

  async function sha256Hex(texte) {
    const donnees = new TextEncoder().encode(texte);
    const hashBuffer = await crypto.subtle.digest('SHA-256', donnees);
    return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  const overlay = document.createElement('div');
  overlay.id = 'passwordGateOverlay';
  overlay.style.cssText = [
    'position: fixed', 'inset: 0', 'z-index: 999999',
    'background: #0b3d24', 'color: #fff',
    'display: flex', 'align-items: center', 'justify-content: center',
    'font-family: system-ui, sans-serif', 'padding: 24px', 'box-sizing: border-box'
  ].join(';');
  overlay.innerHTML =
    '<form id="passwordGateForm" style="max-width:320px;width:100%;text-align:center;">' +
      '<p style="font-size:1.1rem;margin-bottom:16px;">TurfAnalyse — acces protege</p>' +
      '<input type="password" id="passwordGateInput" autocomplete="off" placeholder="Mot de passe" ' +
        'style="width:100%;padding:12px;font-size:1rem;border-radius:8px;border:none;box-sizing:border-box;margin-bottom:12px;">' +
      '<button type="submit" style="width:100%;padding:12px;font-size:1rem;border-radius:8px;border:none;background:#16a34a;color:#fff;">Valider</button>' +
      '<p id="passwordGateErreur" style="color:#fca5a5;font-size:0.9rem;margin-top:12px;display:none;">Mot de passe incorrect.</p>' +
    '</form>';
  document.documentElement.appendChild(overlay);

  const form = overlay.querySelector('#passwordGateForm');
  const input = overlay.querySelector('#passwordGateInput');
  const erreur = overlay.querySelector('#passwordGateErreur');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hash = await sha256Hex(input.value);
    if (hash === HASH_ATTENDU) {
      localStorage.setItem(CLE_STOCKAGE, '1');
      overlay.remove();
    } else {
      erreur.style.display = 'block';
      input.value = '';
      input.focus();
    }
  });

  setTimeout(() => input.focus(), 50);
})();
