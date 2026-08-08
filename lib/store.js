'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'pecas.json');

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ parts: [] }, null, 2));
}

function readDb() {
  ensureDb();
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return { parts: [] };
  }
}

// Atomic-ish write: write to temp file then rename, to avoid corrupting the
// JSON if the process is killed mid-write.
function writeDb(db) {
  ensureDb();
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2));
  fs.renameSync(tmpFile, DB_FILE);
}

function listParts() {
  return readDb().parts;
}

function getPart(id) {
  return readDb().parts.find((p) => p.id === id) || null;
}

function createPart(part) {
  const db = readDb();
  db.parts.unshift(part);
  writeDb(db);
  return part;
}

function updatePart(id, patch) {
  const db = readDb();
  const idx = db.parts.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  db.parts[idx] = { ...db.parts[idx], ...patch, id, updatedAt: new Date().toISOString() };
  writeDb(db);
  return db.parts[idx];
}

function deletePart(id) {
  const db = readDb();
  const idx = db.parts.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const [removed] = db.parts.splice(idx, 1);
  writeDb(db);
  return removed;
}

module.exports = { listParts, getPart, createPart, updatePart, deletePart };
