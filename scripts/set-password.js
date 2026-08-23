'use strict';

// Gera a hash de uma senha para usar na variavel de ambiente
// ADMIN_PASSWORD_HASH. Uso: node scripts/set-password.js "a-sua-senha"

const bcrypt = require('bcryptjs');

const password = process.argv[2];
if (!password) {
  console.error('Uso: node scripts/set-password.js "a-sua-senha"');
  process.exit(1);
}
if (password.length < 6) {
  console.error('Escolha uma senha com pelo menos 6 caracteres.');
  process.exit(1);
}

// Custo 10: equilibra segurança com velocidade de login, sobretudo em
// hosting gratuito com pouco CPU (ex: Render free tier), onde um custo
// mais alto (12) podia levar vários segundos a cada tentativa de entrada.
const hash = bcrypt.hashSync(password, 10);
console.log('\nDefina esta variavel de ambiente no seu servidor/hosting:\n');
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
console.log('\n(Opcionalmente tambem ADMIN_USER=o-nome-de-utilizador-que-quiser, por omissao "admin")\n');
