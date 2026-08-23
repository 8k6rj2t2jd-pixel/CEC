'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, '..', 'scripts', 'stock-import-data.json');

// Deteccao conservadora do fabricante da centralina a partir das
// referencias - so atribui quando ha um sinal bem conhecido, para nao
// arriscar um fabricante errado no inventario a serio. Fica em branco
// quando nao ha confianca suficiente (pode preencher-se a mao depois).
//
// Nota: muitos destes codigos vem colados diretamente a um sufixo de
// variante sem espaco nem separador (ex: "EDC15C2", "SID801A",
// "IAW4MP2.15") - por isso so se exige um limite de palavra ANTES do
// prefixo, nao depois.
function inferManufacturer(ref1, ref2) {
  const text = `${ref1} ${ref2}`.toUpperCase();

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

// Le scripts/stock-import-data.json e devolve os objetos "parte" prontos a
// guardar (sem fotos), mais quantas linhas foram ignoradas por nao terem
// nenhuma referencia.
function buildPartsFromStockFile() {
  const rows = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const parts = [];
  let skipped = 0;

  for (const row of rows) {
    const ref1 = slugRefKey(row.ref1);
    const ref2 = slugRefKey(row.ref2);
    if (!ref1 && !ref2) {
      skipped += 1;
      continue;
    }

    const manufacturer = inferManufacturer(ref1, ref2);
    const quantity = Number.isFinite(Number(row.quantidade)) ? Math.max(0, Math.trunc(Number(row.quantidade))) : 0;
    const box = row.caixa && row.caixa !== '-' ? String(row.caixa) : '';
    const itemNumber = row.numero && row.numero !== '-' ? String(row.numero) : '';

    parts.push({
      id: crypto.randomUUID(),
      partType: 'Centralina de injeção',
      manufacturer,
      brand: row.marca || '',
      model: '',
      ref1,
      ref2,
      quantity,
      box,
      itemNumber,
      notes: 'Importado do stock antigo.',
      images: {},
      createdAt: new Date().toISOString(),
    });
  }

  return { parts, skipped };
}

module.exports = { inferManufacturer, buildPartsFromStockFile };
