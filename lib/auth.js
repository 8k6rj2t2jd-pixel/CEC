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
// Quanto tempo se guarda o registo de um IP sem novas tentativas. Sem isto o
// mapa crescia para sempre - um atacante a bater de muitos IPs diferentes
// acabava por esgotar a memoria do servidor.
const ATTEMPT_TTL_MS = 15 * 60 * 1000;
const MAX_TRACKED_IPS = 10000;

const attempts = new Map(); // ip -> { count, lockedUntil, seenAt }

function purgeOldAttempts() {
  const now = Date.now();
  for (const [ip, entry] of attempts) {
    const expired = now - entry.seenAt > ATTEMPT_TTL_MS;
    const unlocked = !entry.lockedUntil || entry.lockedUntil < now;
    if (expired && unlocked) attempts.delete(ip);
  }
  // Rede de seguranca: se ainda assim estiver enorme (ataque a serio a
  // decorrer), deita fora as entradas mais antigas em vez de crescer sem fim.
  if (attempts.size > MAX_TRACKED_IPS) {
    const sorted = [...attempts.entries()].sort((a, b) => a[1].seenAt - b[1].seenAt);
    for (const [ip] of sorted.slice(0, attempts.size - MAX_TRACKED_IPS)) attempts.delete(ip);
  }
}

const purgeTimer = setInterval(purgeOldAttempts, 5 * 60 * 1000);
// Nao deixa este temporizador manter o processo vivo sozinho.
if (purgeTimer.unref) purgeTimer.unref();

function isLocked(ip) {
  const entry = attempts.get(ip);
  return Boolean(entry && entry.lockedUntil && entry.lockedUntil > Date.now());
}

function registerFailure(ip) {
  const entry = attempts.get(ip) || { count: 0, lockedUntil: 0, seenAt: 0 };
  entry.count += 1;
  entry.seenAt = Date.now();
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
    entry.count = 0;
  }
  attempts.set(ip, entry);
  if (attempts.size > MAX_TRACKED_IPS) purgeOldAttempts();
}

function registerSuccess(ip) {
  attempts.delete(ip);
}

// Hash descartavel usada so para gastar o mesmo tempo quando o utilizador
// esta errado. Sem isto, um utilizador errado respondia num instante e um
// utilizador certo (com senha errada) demorava o tempo do bcrypt - essa
// diferenca deixava descobrir o nome de utilizador so pelo tempo de resposta.
const DUMMY_HASH = bcrypt.hashSync('senha-que-nunca-sera-usada', 10);

function safeEquals(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return require('crypto').timingSafeEqual(bufA, bufB);
}

async function checkCredentials(username, password) {
  // So strings - impede que um objeto vindo em JSON (ex: {"$ne": null})
  // chegue as camadas de baixo.
  if (typeof username !== 'string' || typeof password !== 'string') {
    await bcrypt.compare('x', DUMMY_HASH);
    return false;
  }
  const userMatches = safeEquals(username, ADMIN_USER);
  // Corre sempre o bcrypt, com a hash a serio ou com a descartavel, para o
  // tempo de resposta ser igual nos dois casos.
  const passwordMatches = await bcrypt.compare(password, userMatches ? ADMIN_PASSWORD_HASH : DUMMY_HASH);
  return userMatches && passwordMatches;
}

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Sessao expirada. Inicie sessao novamente.' });
  return res.redirect('/login');
}

module.exports = { checkCredentials, requireAuth, isLocked, registerFailure, registerSuccess, ADMIN_USER };
