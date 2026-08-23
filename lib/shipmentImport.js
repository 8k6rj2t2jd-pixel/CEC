'use strict';

const crypto = require('crypto');

// Envios de 2026 extraídos da planilha "Envios_Voam_2026.xlsx" enviada pelo
// utilizador (folhas "maio", "junho" e "julho" - as restantes, de agosto a
// dezembro, ainda estavam vazias na altura da importação). Peso convertido
// sempre para kg e dimensões assumidas na ordem Comprimento x Largura x
// Altura, tal como a folha original apresentava.
const SHIPMENTS_TO_IMPORT = [
  { client: 'Paulo Pinto', date: '2026-05-05', weight: 1.88, length: 55, width: 20, height: 20 },
  { client: 'Bruno Xavier', date: '2026-05-05', weight: 0.85, length: 30, width: 20, height: 8 },
  { client: 'Auto Jorgense', date: '2026-05-14', weight: 1.985, length: 35, width: 26, height: 16 },
  { client: 'Pabulo Freitas', date: '2026-06-09', weight: 2.084, length: 40, width: 27, height: 17 },
  { client: 'Paulo Marcelino', date: '2026-06-09', weight: 0.922, length: 20, width: 18, height: 16 },
  { client: 'Sousa e Manso', date: '2026-06-23', weight: 0.848, length: 23, width: 16, height: 12 },
  { client: 'Andre Cardoso', date: '2026-06-25', weight: 4.315, length: 39, width: 26, height: 20 },
  { client: 'Bruno Xavier', date: '2026-07-20', weight: 4.1, length: 26, width: 26, height: 25 },
];

// Evita duplicar um envio que já lá esteja (mesmo cliente + mesma data), para
// ser seguro correr mais do que uma vez sem querer.
function buildShipmentsToImport(existingShipments) {
  const existingKeys = new Set(
    existingShipments.map((s) => `${String(s.client || '').trim().toLowerCase()}|${s.date}`)
  );

  const toCreate = [];
  let skipped = 0;
  for (const entry of SHIPMENTS_TO_IMPORT) {
    const key = `${entry.client.trim().toLowerCase()}|${entry.date}`;
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }
    toCreate.push({
      id: crypto.randomUUID(),
      client: entry.client,
      date: entry.date,
      weight: entry.weight,
      length: entry.length,
      width: entry.width,
      height: entry.height,
      createdAt: new Date().toISOString(),
    });
  }
  return { toCreate, skipped };
}

module.exports = { buildShipmentsToImport };
