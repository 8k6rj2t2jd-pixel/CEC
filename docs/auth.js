'use strict';

// Login com a conta Google (Google Identity Services) + gestão do token de
// acesso usado para falar com a API do Google Drive. Só quem tiver a conta
// Google autorizada (configurada na Google Cloud Console) consegue entrar -
// é a própria Google a impedir o acesso a qualquer outra conta.

let tokenClient = null;
let accessToken = null;
let refreshTimer = null;
let authChangeListener = () => {};

function initGoogleAuth(clientId, onAuthChange) {
  authChangeListener = onAuthChange || (() => {});

  if (!clientId) {
    authChangeListener({ signedIn: false, error: 'not-configured' });
    return;
  }
  if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
    authChangeListener({ signedIn: false, error: 'gis-not-loaded' });
    return;
  }

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: 'https://www.googleapis.com/auth/drive.file',
    callback: (resp) => {
      if (resp.error) {
        accessToken = null;
        authChangeListener({ signedIn: false, error: resp.error });
        return;
      }
      accessToken = resp.access_token;
      authChangeListener({ signedIn: true });
      scheduleSilentRefresh();
    },
  });

  // Tenta entrar em silêncio (sem mostrar nada ao utilizador) caso já haja
  // sessão Google + consentimento dado anteriormente.
  tokenClient.requestAccessToken({ prompt: '' });
}

function signIn() {
  if (!tokenClient) return;
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

function signOut() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken, () => {});
  }
  accessToken = null;
  clearTimeout(refreshTimer);
  authChangeListener({ signedIn: false });
}

function getToken() {
  return accessToken;
}

function scheduleSilentRefresh() {
  clearTimeout(refreshTimer);
  // Os tokens da Google costumam durar ~1h; renova-se em silêncio aos 50min.
  refreshTimer = setTimeout(() => {
    if (tokenClient) tokenClient.requestAccessToken({ prompt: '' });
  }, 50 * 60 * 1000);
}

window.GoogleAuth = { initGoogleAuth, signIn, signOut, getToken };
