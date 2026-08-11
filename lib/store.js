'use strict';

const fs = require('fs');
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'pecas.json');

const useMongo = !!MONGODB_URI;

let collectionPromise = null;
if (useMongo) {
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(MONGODB_URI);
  collectionPromise = client.connect().then((c) => {
    const col = c.db().collection('parts');
    col.createIndex({ id: 1 }, { unique: true }).catch(() => {});
    return col;
  });
}

function stripMongoId(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
}

// ---------------------------------------------------------------------------
// Fallback local em ficheiro JSON, usado quando MONGODB_URI nao esta
// definido (desenvolvimento local sem precisar de uma base de dados a
// serio).
// ---------------------------------------------------------------------------
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

function writeDb(db) {
  ensureDb();
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2));
  fs.renameSync(tmpFile, DB_FILE);
}

async function listParts() {
  if (useMongo) {
    const col = await collectionPromise;
    const docs = await col.find().sort({ createdAt: -1 }).toArray();
    return docs.map(stripMongoId);
  }
  return readDb().parts;
}

async function getPart(id) {
  if (useMongo) {
    const col = await collectionPromise;
    return stripMongoId(await col.findOne({ id }));
  }
  return readDb().parts.find((p) => p.id === id) || null;
}

async function createPart(part) {
  if (useMongo) {
    const col = await collectionPromise;
    await col.insertOne({ ...part });
    return part;
  }
  const db = readDb();
  db.parts.unshift(part);
  writeDb(db);
  return part;
}

async function updatePart(id, patch) {
  if (useMongo) {
    const col = await collectionPromise;
    const updatedAt = new Date().toISOString();
    const updated = await col.findOneAndUpdate(
      { id },
      { $set: { ...patch, updatedAt } },
      { returnDocument: 'after' }
    );
    return stripMongoId(updated);
  }
  const db = readDb();
  const idx = db.parts.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  db.parts[idx] = { ...db.parts[idx], ...patch, id, updatedAt: new Date().toISOString() };
  writeDb(db);
  return db.parts[idx];
}

async function deletePart(id) {
  if (useMongo) {
    const col = await collectionPromise;
    return stripMongoId(await col.findOneAndDelete({ id }));
  }
  const db = readDb();
  const idx = db.parts.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const [removed] = db.parts.splice(idx, 1);
  writeDb(db);
  return removed;
}

module.exports = { useMongo, listParts, getPart, createPart, updatePart, deletePart };
