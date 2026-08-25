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
togglePassword.addEventListener('click', () => {
  const showing = passwordInput.type === 'text';
  passwordInput.type = showing ? 'password' : 'text';
  togglePassword.textContent = showing ? '👁️' : '🙈';
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
