'use strict';

const bcrypt = require('bcryptjs');

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';

if (!ADMIN_PASSWORD_HASH) {
  console.error(
    '\nERRO: variavel de ambiente ADMIN_PASSWORD_HASH nao definida.\n' +
      'Corra "node scripts/set-password.js <a-sua-senha>" para gerar uma hash\n' +
      'e defina-a como variavel de ambiente antes de arrancar o servidor.\n'
  );
  process.exit(1);
}

// Protecao simples contra tentativas repetidas de login (nao substitui um
// verdadeiro rate limiter distribuido, mas chega para uma ferramenta interna
// pequena): bloqueia um IP durante 1 minuto apos 5 tentativas falhadas.
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60 * 1000;
const attempts = new Map(); // ip -> { count, lockedUntil }

function isLocked(ip) {
  const entry = attempts.get(ip);
  return Boolean(entry && entry.lockedUntil && entry.lockedUntil > Date.now());
}

function registerFailure(ip) {
  const entry = attempts.get(ip) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
    entry.count = 0;
  }
  attempts.set(ip, entry);
}

function registerSuccess(ip) {
  attempts.delete(ip);
}

async function checkCredentials(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string') return false;
  if (username !== ADMIN_USER) return false;
  return bcrypt.compare(password, ADMIN_PASSWORD_HASH);
}

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Sessao expirada. Inicie sessao novamente.' });
  return res.redirect('/login');
}

module.exports = { checkCredentials, requireAuth, isLocked, registerFailure, registerSuccess, ADMIN_USER };
