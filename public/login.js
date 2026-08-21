const logoImg = document.getElementById('logo-img');
if (logoImg) logoImg.addEventListener('error', () => logoImg.remove(), { once: true });

const form = document.getElementById('login-form');
const errorEl = document.getElementById('login-error');
const errorText = document.getElementById('login-error-text');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  try {
    const resp = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Utilizador ou senha incorretos.');
    window.location.href = '/';
  } catch (err) {
    errorText.textContent = err.message;
    errorEl.hidden = false;
  }
});
