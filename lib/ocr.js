'use strict';

const path = require('path');
const Tesseract = require('tesseract.js');
const { Jimp } = require('jimp');

// Dados de idioma incluidos localmente via npm (@tesseract.js-data/eng), para
// que o OCR funcione sem acesso a internet - so o download inicial de pacotes
// npm precisa de rede, nao cada leitura de etiqueta.
const LANG_PATH = path.join(
  path.dirname(require.resolve('@tesseract.js-data/eng/package.json')),
  '4.0.0_best_int'
);

// Fabricantes mais comuns em centralinas/modulos de eletronica automovel.
// Usado para sugerir automaticamente o fabricante a partir do texto da etiqueta.
const KNOWN_MANUFACTURERS = [
  'BOSCH',
  'DENSO',
  'CONTINENTAL',
  'SIEMENS',
  'VDO',
  'DELPHI',
  'MAGNETI MARELLI',
  'MARELLI',
  'VALEO',
  'HITACHI',
  'SAGEM',
  'HELLA',
  'TEMIC',
  'PANASONIC',
  'MITSUBISHI ELECTRIC',
  'VISTEON',
  'KEIHIN',
  'AISIN',
  'JTEKT',
  'TRW',
  'MOTOROLA',
];

// Sugestoes de tipo de peca a partir de prefixos tipicos de referencia Bosch.
// E apenas uma sugestao - o utilizador confirma/ajusta sempre no formulario.
const BOSCH_PREFIX_HINTS = [
  { prefix: '0281', label: 'Centralina de injecao (diesel EDC)' },
  { prefix: '0261', label: 'Centralina de injecao (gasolina Motronic)' },
  { prefix: '0265', label: 'Centralina ABS/ESP' },
  { prefix: '0258', label: 'Sonda lambda' },
  { prefix: '0221', label: 'Bobina de ignicao' },
];

function normalize(text) {
  return text.replace(/\s+/g, ' ').trim();
}

// Referencias no formato Bosch "0 281 010 438" (10 digitos, por vezes com
// espacos), formato VAG/Audi/VW "038 906 018 BA" (grupos + letras finais),
// e referencias OEM tipo "8200066001" / "HOM8200066001".
function extractReferences(rawText) {
  const text = rawText.toUpperCase();
  const refs = new Set();

  const boschMatches = text.match(/\b0[\s.]?\d{3}[\s.]?\d{3}[\s.]?\d{3}\b/g) || [];
  for (const m of boschMatches) {
    refs.add(m.replace(/[\s.]+/g, ' ').trim());
  }

  const vagMatches = text.match(/\b\d{2,3}[\s.]\d{3}[\s.]\d{3}(?:[\s.]?[A-Z]{1,2})?\b/g) || [];
  for (const m of vagMatches) {
    refs.add(m.replace(/[\s.]+/g, ' ').trim());
  }

  const oemMatches = text.match(/\b[A-Z]{0,4}\d{7,13}\b/g) || [];
  for (const m of oemMatches) {
    if (!/^0\d{9}$/.test(m.replace(/\s/g, ''))) {
      refs.add(m);
    }
  }

  return Array.from(refs);
}

function extractManufacturer(rawText) {
  const text = rawText.toUpperCase();
  for (const name of KNOWN_MANUFACTURERS) {
    if (text.includes(name)) return name;
  }
  return null;
}

function extractPartTypeHint(rawText) {
  const compact = rawText.replace(/[\s.]/g, '');
  for (const { prefix, label } of BOSCH_PREFIX_HINTS) {
    if (compact.includes(prefix)) return label;
  }
  return null;
}

// Fotos reais de telemovel sao enormes e tem fundo metalico/riscado, o que
// dificulta muito o OCR. Isto reduz o tamanho (mais rapido) e converte para
// tons de cinzento com contraste esticado, para o Tesseract distinguir
// melhor o texto da etiqueta do fundo.
async function preprocessForOcr(imagePath) {
  try {
    const img = await Jimp.read(imagePath);
    const maxDim = 1800;
    if (Math.max(img.width, img.height) > maxDim) {
      if (img.width >= img.height) img.resize({ w: maxDim });
      else img.resize({ h: maxDim });
    }
    img.greyscale();
    img.normalize();
    return await img.getBuffer('image/jpeg');
  } catch (err) {
    console.error('Falha ao preparar a foto para OCR, a usar a original:', err);
    return imagePath;
  }
}

async function readLabel(imagePath) {
  const processedImage = await preprocessForOcr(imagePath);
  // `errorHandler` keeps a bad/corrupt image from crashing the whole process:
  // without it tesseract.js re-throws worker errors as an uncaught exception
  // in addition to rejecting the returned promise.
  const { data } = await Tesseract.recognize(processedImage, 'eng', {
    langPath: LANG_PATH,
    gzip: true,
    cacheMethod: 'none',
    errorHandler: () => {},
  });
  const rawText = normalize(data.text || '');
  return {
    rawText,
    manufacturer: extractManufacturer(rawText),
    partTypeHint: extractPartTypeHint(rawText),
    referenceCandidates: extractReferences(rawText),
  };
}

module.exports = { readLabel, extractReferences, extractManufacturer, extractPartTypeHint };
