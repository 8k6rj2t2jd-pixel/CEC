'use strict';

// Guarda as peças (dados + as 3 fotos) no Google Drive da conta com que
// iniciou sessão, em vez de dentro do telemóvel. Assim o catálogo fica
// partilhado entre todos os aparelhos que entrem com essa conta, e as fotos
// ficam visíveis/pesquisáveis normalmente no Google Drive (pasta
// "CatalogoPecas"), servindo também de cópia de segurança automática.

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const ROOT_FOLDER_NAME = 'CatalogoPecas';
const METADATA_FILENAME = 'pecas.json';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

let rootFolderIdCache = null;
let metadataFileIdCache = null;
const folderCache = new Map(); // "parentId/name" -> id
const imageBlobCache = new Map(); // fileId -> Blob

function slugify(value) {
  return (
    String(value || 'diverso')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'diverso'
  );
}

function authHeaders(extra) {
  const token = window.GoogleAuth.getToken();
  if (!token) throw new Error('Sem sessão Google ativa.');
  return { Authorization: `Bearer ${token}`, ...(extra || {}) };
}

async function driveFetch(url, options) {
  const resp = await fetch(url, { ...options, headers: { ...(options && options.headers) } });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Erro do Google Drive (${resp.status}): ${text.slice(0, 200)}`);
  }
  return resp;
}

async function findChild(parentId, name, mimeType) {
  const q = [
    `'${parentId}' in parents`,
    `name = '${name.replace(/'/g, "\\'")}'`,
    'trashed = false',
    mimeType ? `mimeType = '${mimeType}'` : null,
  ]
    .filter(Boolean)
    .join(' and ');
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`;
  const resp = await driveFetch(url, { headers: authHeaders() });
  const data = await resp.json();
  return data.files && data.files[0] ? data.files[0].id : null;
}

async function createFolder(parentId, name) {
  const resp = await driveFetch(`${DRIVE_API}/files?fields=id`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  const data = await resp.json();
  return data.id;
}

async function ensureFolder(parentId, name) {
  const cacheKey = `${parentId}/${name}`;
  if (folderCache.has(cacheKey)) return folderCache.get(cacheKey);
  let id = await findChild(parentId, name, FOLDER_MIME);
  if (!id) id = await createFolder(parentId, name);
  folderCache.set(cacheKey, id);
  return id;
}

async function ensureRootFolder() {
  if (rootFolderIdCache) return rootFolderIdCache;
  rootFolderIdCache = await ensureFolder('root', ROOT_FOLDER_NAME);
  return rootFolderIdCache;
}

async function ensurePath(segments) {
  let parentId = await ensureRootFolder();
  for (const segment of segments) {
    parentId = await ensureFolder(parentId, segment);
  }
  return parentId;
}

async function findMetadataFileId() {
  if (metadataFileIdCache) return metadataFileIdCache;
  const rootId = await ensureRootFolder();
  metadataFileIdCache = await findChild(rootId, METADATA_FILENAME, null);
  return metadataFileIdCache;
}

async function readDb() {
  const fileId = await findMetadataFileId();
  if (!fileId) return { parts: [] };
  const resp = await driveFetch(`${DRIVE_API}/files/${fileId}?alt=media`, { headers: authHeaders() });
  try {
    return await resp.json();
  } catch {
    return { parts: [] };
  }
}

async function writeDb(db) {
  const rootId = await ensureRootFolder();
  const fileId = await findMetadataFileId();
  const body = JSON.stringify(db, null, 2);

  if (fileId) {
    await driveFetch(`${DRIVE_UPLOAD_API}/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body,
    });
    return;
  }

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify({ name: METADATA_FILENAME, parents: [rootId] })], { type: 'application/json' })
  );
  form.append('file', new Blob([body], { type: 'application/json' }));
  const resp = await driveFetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  const data = await resp.json();
  metadataFileIdCache = data.id;
}

async function uploadImage(folderId, filename, blob) {
  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify({ name: filename, parents: [folderId] })], { type: 'application/json' })
  );
  form.append('file', blob);
  const resp = await driveFetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  const data = await resp.json();
  return data.id;
}

async function fetchImageBlob(fileId) {
  if (imageBlobCache.has(fileId)) return imageBlobCache.get(fileId);
  const resp = await driveFetch(`${DRIVE_API}/files/${fileId}?alt=media`, { headers: authHeaders() });
  const blob = await resp.blob();
  imageBlobCache.set(fileId, blob);
  return blob;
}

async function deleteFile(fileId) {
  await driveFetch(`${DRIVE_API}/files/${fileId}`, { method: 'DELETE', headers: authHeaders() });
}

async function listParts() {
  const db = await readDb();
  return (db.parts || []).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

async function getPart(id) {
  const db = await readDb();
  return (db.parts || []).find((p) => p.id === id) || null;
}

async function createPart(part) {
  const folderId = await ensurePath([
    slugify(part.manufacturer),
    slugify(part.partType),
    slugify(`${part.brand}-${part.model}`),
    part.id,
  ]);

  const images = {};
  for (const key of ['front', 'back', 'label']) {
    images[key] = await uploadImage(folderId, `${key}.jpg`, part.images[key]);
  }

  const record = { ...part, images, folderId };
  const db = await readDb();
  db.parts = db.parts || [];
  db.parts.unshift(record);
  await writeDb(db);
  return record;
}

async function updatePart(id, patch) {
  const db = await readDb();
  const idx = (db.parts || []).findIndex((p) => p.id === id);
  if (idx === -1) return null;
  db.parts[idx] = { ...db.parts[idx], ...patch, id, updatedAt: new Date().toISOString() };
  await writeDb(db);
  return db.parts[idx];
}

async function deletePart(id) {
  const db = await readDb();
  const idx = (db.parts || []).findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const [removed] = db.parts.splice(idx, 1);
  await writeDb(db);
  if (removed.folderId) {
    await deleteFile(removed.folderId).catch((err) => console.error('Falha ao apagar pasta no Drive:', err));
  }
  return removed;
}

window.PartsDB = { listParts, getPart, createPart, updatePart, deletePart, fetchImageBlob };
