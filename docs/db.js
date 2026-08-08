'use strict';

// Guarda as peças (dados + as 3 fotos, como Blobs) diretamente no telemóvel,
// usando o IndexedDB do browser. Não há servidor nem internet envolvidos a
// partir daqui - os dados ficam neste aparelho e neste browser. Por isso
// convém usar sempre o mesmo telemóvel/browser e fazer cópias de segurança
// de vez em quando (botão "Exportar cópia de segurança" no catálogo).

const DB_NAME = 'cec-catalogo';
const DB_VERSION = 1;
const STORE = 'parts';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDb().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

async function listParts() {
  const store = await tx(STORE, 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    req.onerror = () => reject(req.error);
  });
}

async function getPart(id) {
  const store = await tx(STORE, 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function createPart(part) {
  const store = await tx(STORE, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.add(part);
    req.onsuccess = () => resolve(part);
    req.onerror = () => reject(req.error);
  });
}

async function updatePart(id, patch) {
  const existing = await getPart(id);
  if (!existing) return null;
  const updated = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
  const store = await tx(STORE, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(updated);
    req.onsuccess = () => resolve(updated);
    req.onerror = () => reject(req.error);
  });
}

async function deletePart(id) {
  const existing = await getPart(id);
  if (!existing) return null;
  const store = await tx(STORE, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve(existing);
    req.onerror = () => reject(req.error);
  });
}

window.PartsDB = { listParts, getPart, createPart, updatePart, deletePart };
