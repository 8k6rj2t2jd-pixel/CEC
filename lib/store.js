'use strict';

const fs = require('fs');
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

const useMongo = !!MONGODB_URI;

let dbPromise = null;
if (useMongo) {
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(MONGODB_URI);
  dbPromise = client.connect().then((c) => c.db());
}

function stripMongoId(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
}

// Cria um CRUD simples (usado tanto para as pecas como para as etiquetas):
// guarda no MongoDB quando MONGODB_URI esta definido, ou num ficheiro JSON
// local caso contrario (desenvolvimento sem precisar de uma base de dados a
// serio).
function createCollectionStore(mongoCollectionName, localFileName, arrayKey) {
  const localFile = path.join(DATA_DIR, localFileName);
  let collectionPromise = null;
  if (useMongo) {
    collectionPromise = dbPromise.then((db) => {
      const col = db.collection(mongoCollectionName);
      col.createIndex({ id: 1 }, { unique: true }).catch(() => {});
      return col;
    });
  }

  function ensureLocalDb() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(localFile)) fs.writeFileSync(localFile, JSON.stringify({ [arrayKey]: [] }, null, 2));
  }
  function readLocalDb() {
    ensureLocalDb();
    try {
      return JSON.parse(fs.readFileSync(localFile, 'utf8'));
    } catch {
      return { [arrayKey]: [] };
    }
  }
  function writeLocalDb(db) {
    ensureLocalDb();
    const tmpFile = `${localFile}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2));
    fs.renameSync(tmpFile, localFile);
  }

  return {
    async list() {
      if (useMongo) {
        const col = await collectionPromise;
        const docs = await col.find().sort({ createdAt: -1 }).toArray();
        return docs.map(stripMongoId);
      }
      return readLocalDb()[arrayKey];
    },
    async get(id) {
      if (useMongo) {
        const col = await collectionPromise;
        return stripMongoId(await col.findOne({ id }));
      }
      return readLocalDb()[arrayKey].find((item) => item.id === id) || null;
    },
    async create(item) {
      if (useMongo) {
        const col = await collectionPromise;
        await col.insertOne({ ...item });
        return item;
      }
      const db = readLocalDb();
      db[arrayKey].unshift(item);
      writeLocalDb(db);
      return item;
    },
    async update(id, patch) {
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
      const db = readLocalDb();
      const idx = db[arrayKey].findIndex((item) => item.id === id);
      if (idx === -1) return null;
      db[arrayKey][idx] = { ...db[arrayKey][idx], ...patch, id, updatedAt: new Date().toISOString() };
      writeLocalDb(db);
      return db[arrayKey][idx];
    },
    async delete(id) {
      if (useMongo) {
        const col = await collectionPromise;
        return stripMongoId(await col.findOneAndDelete({ id }));
      }
      const db = readLocalDb();
      const idx = db[arrayKey].findIndex((item) => item.id === id);
      if (idx === -1) return null;
      const [removed] = db[arrayKey].splice(idx, 1);
      writeLocalDb(db);
      return removed;
    },
  };
}

const partsStore = createCollectionStore('parts', 'pecas.json', 'parts');
const labelsStore = createCollectionStore('labels', 'etiquetas.json', 'labels');
const shipmentsStore = createCollectionStore('shipments', 'envios.json', 'shipments');

module.exports = {
  useMongo,
  listParts: partsStore.list,
  getPart: partsStore.get,
  createPart: partsStore.create,
  updatePart: partsStore.update,
  deletePart: partsStore.delete,
  listLabels: labelsStore.list,
  getLabel: labelsStore.get,
  createLabel: labelsStore.create,
  updateLabel: labelsStore.update,
  deleteLabel: labelsStore.delete,
  listShipments: shipmentsStore.list,
  getShipment: shipmentsStore.get,
  createShipment: shipmentsStore.create,
  updateShipment: shipmentsStore.update,
  deleteShipment: shipmentsStore.delete,
};
