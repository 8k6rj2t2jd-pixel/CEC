'use strict';

const fs = require('fs');
const path = require('path');

// A folha de stock original (a mesma que deu origem às peças que já estão no
// catálogo) tem uma coluna "Número" que na altura não foi importada. Este
// módulo volta a cruzar as duas coisas para preencher esse número nas peças
// que já existem, sem mexer em mais nada.
const DATA_FILE = path.join(__dirname, '..', 'scripts', 'stock-import-data.json');

// Normaliza para comparar: tira espaços a mais, maiúsculas/minúsculas e
// caracteres que só atrapalham a comparação (a mesma referência aparece
// escrita ora com espaço ora sem, ora com barra ora com hífen).
function normRef(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[\s.\-/]+/g, '')
    .trim();
}

function normPlain(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

// O número vem como "18  19" quando a mesma linha cobre duas peças iguais
// (quantidade 2, que ocupam dois lugares na caixa). Guarda-se tal como está,
// só com os espaços arrumados.
function normNumber(value) {
  return normPlain(value).replace(/\s+/g, ' ');
}

function loadStockRows() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

// Constrói três níveis de procura, do mais exato ao mais tolerante. Cada
// chave guarda uma lista, porque a mesma referência pode aparecer em várias
// linhas - cada linha só pode ser usada uma vez, para nunca se dar o mesmo
// número a duas peças diferentes.
function buildIndex(rows) {
  const byRefRefBox = new Map();
  const byRefRef = new Map();
  const byRef = new Map();

  const push = (map, key, value) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  };

  rows.forEach((row, order) => {
    const numero = normNumber(row.numero);
    if (!numero || numero === '-') return;
    const r1 = normRef(row.ref1);
    const r2 = normRef(row.ref2);
    const box = normPlain(row.caixa);
    const entry = { numero, order, used: false };

    if (r1 || r2) {
      push(byRefRefBox, `${r1}|${r2}|${box}`, entry);
      push(byRefRef, `${r1}|${r2}`, entry);
      if (r1) push(byRef, r1, entry);
    }
  });

  return { byRefRefBox, byRefRef, byRef };
}

function takeFirstUnused(list) {
  if (!list) return null;
  for (const entry of list) {
    if (!entry.used) return entry;
  }
  return null;
}

// Procura o número de uma peça, do critério mais exato para o menos exato:
// referência 1 + referência 2 + caixa, depois só as duas referências, e por
// fim só a referência 1.
function findNumberFor(part, index) {
  const r1 = normRef(part.ref1);
  const r2 = normRef(part.ref2);
  const box = normPlain(part.box);

  const candidates = [
    index.byRefRefBox.get(`${r1}|${r2}|${box}`),
    index.byRefRef.get(`${r1}|${r2}`),
    r1 ? index.byRef.get(r1) : null,
  ];

  for (let level = 0; level < candidates.length; level += 1) {
    const entry = takeFirstUnused(candidates[level]);
    if (entry) return { entry, level };
  }
  return null;
}

// Decide que peças passam a ter número. Não grava nada - devolve só a lista
// de alterações, para quem chama poder gravar e contar.
//
// "overwrite" a falso (o normal) só preenche peças que ainda não tenham
// número, para nunca estragar um número escrito à mão.
function planItemNumbers(parts, { overwrite = false } = {}) {
  const rows = loadStockRows();
  const index = buildIndex(rows);

  const updates = [];
  let alreadyHad = 0;
  let notFound = 0;
  const byLevel = [0, 0, 0];

  // Faz primeiro as peças com as duas referências preenchidas: são as que
  // dão a correspondência mais fiável, e assim ficam com as linhas certas
  // antes de as peças mais vagas começarem a consumir candidatos.
  const ordered = [...parts].sort((a, b) => {
    const score = (p) => (p.ref1 ? 1 : 0) + (p.ref2 ? 1 : 0) + (p.box ? 1 : 0);
    return score(b) - score(a);
  });

  let outOfStock = 0;

  for (const part of ordered) {
    // Caixa "-" na folha quer dizer que a peça já esteve em stock e agora não
    // está: guarda-se a referência, com 0 em stock e sem número de lugar.
    // Estas nunca podem apanhar o número de outra linha só por partilharem a
    // referência - ficariam com um lugar que não é delas.
    if (!normPlain(part.box) || normPlain(part.box) === '-') {
      outOfStock += 1;
      continue;
    }

    if (!overwrite && normPlain(part.itemNumber)) {
      alreadyHad += 1;
      // Marca a linha correspondente como usada mesmo sem alterar nada. Sem
      // isto, correr o preenchimento uma segunda vez deixava essas linhas
      // livres e o número acabava por ser dado a outra peça qualquer.
      const hit = findNumberFor(part, index);
      if (hit) hit.entry.used = true;
      continue;
    }

    const hit = findNumberFor(part, index);
    if (!hit) {
      notFound += 1;
      continue;
    }
    hit.entry.used = true;
    byLevel[hit.level] += 1;
    updates.push({ id: part.id, itemNumber: hit.entry.numero });
  }

  return { updates, alreadyHad, notFound, outOfStock, byLevel, totalRows: rows.length };
}

module.exports = { planItemNumbers, normRef, normNumber };
