'use strict';

// Importa em massa as pecas do ficheiro Excel de stock antigo (ja convertido
// para scripts/stock-import-data.json), sem fotos - usa store.createPart()
// diretamente (nao passa pelo servidor HTTP), por isso corre tanto contra o
// MongoDB (quando MONGODB_URI esta definido) como contra o ficheiro JSON
// local, exatamente como o resto da app.
//
// Uso: node scripts/import-stock.js
//
// Nota: no plano gratuito do Render nao ha acesso a Shell para correr isto -
// nesse caso use o botao "Importar stock antigo" na aba Catalogo da app,
// que faz o mesmo através do servidor (rota /api/admin/import-stock).

const store = require('../lib/store');
const { buildPartsFromStockFile } = require('../lib/stockImport');

async function main() {
  const { parts, skipped } = buildPartsFromStockFile();
  console.log(`A importar ${parts.length} pecas...`);

  let created = 0;
  let withManufacturer = 0;

  for (const part of parts) {
    await store.createPart(part);
    created += 1;
    if (part.manufacturer) withManufacturer += 1;
    if (created % 100 === 0) console.log(`  ...${created} importadas`);
  }

  console.log('---');
  console.log(`Concluido: ${created} pecas importadas (${withManufacturer} com fabricante identificado, ${created - withManufacturer} ficaram em branco).`);
  if (skipped) console.log(`${skipped} linhas ignoradas (sem nenhuma referencia).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Falha na importacao:', err);
  process.exit(1);
});
