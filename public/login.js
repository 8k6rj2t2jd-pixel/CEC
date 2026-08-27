const logoImg = document.getElementById('logo-img');
if (logoImg) logoImg.addEventListener('error', () => logoImg.remove(), { once: true });

const form = document.getElementById('login-form');
const errorEl = document.getElementById('login-error');
const errorText = document.getElementById('login-error-text');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const rememberCheckbox = document.getElementById('remember-me');
const togglePassword = document.getElementById('toggle-password');

// ---------------------------------------------------------------------------
// Ver a senha enquanto se escreve
// ---------------------------------------------------------------------------
// Desenhos em SVG em vez de emojis, para aparecerem iguais em todos os
// aparelhos e herdarem a cor do texto à volta.
const SVG_OPEN =
  '<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
  '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
const SVG_CLOSED =
  '<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
  '<path d="M10.7 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a18 18 0 0 1-2.7 3.7M6.6 6.6A18 18 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 4.5-1"/>' +
  '<path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="m2 2 20 20"/></svg>';

togglePassword.addEventListener('click', () => {
  const showing = passwordInput.type === 'text';
  passwordInput.type = showing ? 'password' : 'text';
  togglePassword.innerHTML = showing ? SVG_OPEN : SVG_CLOSED;
  const label = showing ? 'Mostrar senha' : 'Esconder senha';
  togglePassword.setAttribute('aria-label', label);
  togglePassword.title = label;
  passwordInput.focus();
});

// ---------------------------------------------------------------------------
// "Relembra-me": guarda utilizador e senha neste browser para nao ser preciso
// escrever de cada vez. Fica so neste dispositivo (nunca vai para o
// servidor alem do login normal) - por isso o texto avisa que e "neste
// dispositivo". Desligar a opcao apaga o que estava guardado.
// ---------------------------------------------------------------------------
const REMEMBER_KEY = 'cec-credenciais';

function loadRemembered() {
  try {
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (!saved) return;
    const { username, password } = JSON.parse(saved);
    if (username) usernameInput.value = username;
    if (password) passwordInput.value = password;
    rememberCheckbox.checked = true;
  } catch {
    // Se estiver corrompido ou o browser bloquear o armazenamento, ignora-se
    // e a pessoa escreve as credenciais como sempre.
  }
}

function saveRemembered(username, password) {
  try {
    if (rememberCheckbox.checked) {
      localStorage.setItem(REMEMBER_KEY, JSON.stringify({ username, password }));
    } else {
      localStorage.removeItem(REMEMBER_KEY);
    }
  } catch {
    // Sem armazenamento disponivel, o login continua a funcionar na mesma.
  }
}

rememberCheckbox.addEventListener('change', () => {
  if (!rememberCheckbox.checked) {
    try {
      localStorage.removeItem(REMEMBER_KEY);
    } catch {
      // ignorado de proposito - ver acima
    }
  }
});

loadRemembered();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  const username = usernameInput.value;
  const password = passwordInput.value;
  try {
    const resp = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Utilizador ou senha incorretos.');
    // So se guardam as credenciais depois de o login correr mesmo bem, para
    // nunca ficar gravada uma senha errada.
    saveRemembered(username, password);
    window.location.href = '/';
  } catch (err) {
    errorText.textContent = err.message;
    errorEl.hidden = false;
  }
});
