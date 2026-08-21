'use strict';

// Importa em massa as pecas do ficheiro Excel de stock antigo (ja convertido
// para scripts/stock-import-data.json), sem fotos - usa store.createPart()
// diretamente (nao passa pelo servidor HTTP), por isso corre tanto contra o
// MongoDB (quando MONGODB_URI esta definido) como contra o ficheiro JSON
// local, exatamente como o resto da app.
//
// Uso: node scripts/import-stock.js
// (correr no Shell do Render, para escrever na mesma base de dados que o
// site a serio usa - la o MONGODB_URI ja esta definido.)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('../lib/store');

const DATA_FILE = path.join(__dirname, 'stock-import-data.json');

// Deteccao conservadora do fabricante da centralina a partir das
// referencias - so atribui quando ha um sinal bem conhecido, para nao
// arriscar um fabricante errado no inventario a serio. Fica em branco
// quando nao ha confianca suficiente (pode preencher-se a mao depois).
function inferManufacturer(ref1, ref2) {
  const text = `${ref1} ${ref2}`.toUpperCase();

  // Bosch: numeracao classica de 10 digitos a comecar por 0 (028X/0261/0265/
  // 0280/0281/0285/etc.), usada pela Bosch em toda a industria automovel.
  // Testado sem remover o espaco entre ref1 e ref2, para nao perder o limite
  // de palavra entre as duas referencias.
  // Nota: muitos destes codigos vem colados diretamente a um sufixo de
  // variante sem espaco nem separador (ex: "EDC15C2", "SID801A",
  // "IAW4MP2.15") - por isso so se exige um limite de palavra ANTES do
  // prefixo, nao depois.
  if (/\b0[12][0-9]{8}\b/.test(text)) return 'Bosch';
  if (/\bEDC1[5-7]|\bMED1\d\b|\bME7\b/.test(text)) return 'Bosch';

  if (/\bSID\d{3}|\bSIMOS|\bMSA\d|\bMEV17|\bMP[357]\b|\bMA3\b/.test(text)) return 'Siemens/Continental';
  if (/\bIAW|\bMJD/.test(text)) return 'Magneti Marelli';
  if (/\bDDCR|\bDCM\d/.test(text)) return 'Delphi/Lucas';
  if (/\bSIRIUS\d|\bEMS3\d+\b|\bS3000\b|\bSAFIR\d\b/.test(text)) return 'Sagem';

  return '';
}

function slugRefKey(ref) {
  return String(ref || '').replace(/\s+/g, ' ').trim();
}

async function main() {
  const rows = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  console.log(`A importar ${rows.length} pecas...`);

  let created = 0;
  let withManufacturer = 0;
  let skipped = 0;

  for (const row of rows) {
    const ref1 = slugRefKey(row.ref1);
    const ref2 = slugRefKey(row.ref2);
    if (!ref1 && !ref2) {
      skipped += 1;
      continue;
    }

    const manufacturer = inferManufacturer(ref1, ref2);
    if (manufacturer) withManufacturer += 1;

    const quantity = Number.isFinite(Number(row.quantidade)) ? Math.max(0, Math.trunc(Number(row.quantidade))) : 0;

    const locationBits = [];
    if (row.caixa && row.caixa !== '-') locationBits.push(`Caixa ${row.caixa}`);
    if (row.numero && row.numero !== '-') locationBits.push(`Nº ${row.numero}`);
    const notes = locationBits.length ? `Importado do stock antigo (${locationBits.join(', ')}).` : 'Importado do stock antigo.';

    const part = {
      id: crypto.randomUUID(),
      partType: 'Centralina de injeção',
      manufacturer,
      brand: row.marca || '',
      model: '',
      ref1,
      ref2,
      quantity,
      notes,
      images: {},
      createdAt: new Date().toISOString(),
    };

    await store.createPart(part);
    created += 1;
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
