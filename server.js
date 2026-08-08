'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');

const store = require('./lib/store');
const { readLabel } = require('./lib/ocr');

const PORT = process.env.PORT || 3000;
const STORAGE_DIR = path.join(__dirname, 'storage');
const TMP_DIR = path.join(__dirname, 'data', 'tmp');

for (const dir of [STORAGE_DIR, TMP_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/storage', express.static(STORAGE_DIR));

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TMP_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
});

function slugify(value) {
  return String(value || 'diverso')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'diverso';
}

// Reconhece a etiqueta (foto 3) e devolve sugestoes: fabricante, referencias
// candidatas e texto em bruto, para pre-preencher o formulario. O tipo de
// peca e a marca/modelo do veiculo ficam sempre a cargo do utilizador,
// porque normalmente nao vem impresso na etiqueta.
app.post('/api/ocr', upload.single('label'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta a foto da etiqueta.' });
  try {
    const result = await readLabel(req.file.path);
    res.json(result);
  } catch (err) {
    console.error('Erro no OCR:', err);
    res.status(500).json({ error: 'Falha ao ler a etiqueta.' });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

app.get('/api/parts', (req, res) => {
  const { q, partType, manufacturer, brand } = req.query;
  let parts = store.listParts();

  if (partType) parts = parts.filter((p) => p.partType === partType);
  if (manufacturer) parts = parts.filter((p) => p.manufacturer.toLowerCase() === String(manufacturer).toLowerCase());
  if (brand) parts = parts.filter((p) => p.brand.toLowerCase() === String(brand).toLowerCase());

  if (q) {
    const needle = String(q).toLowerCase();
    parts = parts.filter((p) =>
      [p.ref1, p.ref2, p.manufacturer, p.brand, p.model, p.partType, p.notes]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(needle))
    );
  }

  res.json(parts);
});

app.get('/api/parts/:id', (req, res) => {
  const part = store.getPart(req.params.id);
  if (!part) return res.status(404).json({ error: 'Peca nao encontrada.' });
  res.json(part);
});

app.post(
  '/api/parts',
  upload.fields([
    { name: 'front', maxCount: 1 },
    { name: 'back', maxCount: 1 },
    { name: 'label', maxCount: 1 },
  ]),
  (req, res) => {
    const files = req.files || {};
    if (!files.front || !files.back || !files.label) {
      for (const key of Object.keys(files)) {
        for (const f of files[key]) fs.unlink(f.path, () => {});
      }
      return res.status(400).json({ error: 'Sao precisas as 3 fotos: frente, tras e etiqueta.' });
    }

    const { partType, manufacturer, brand, model, ref1, ref2, quantity, notes } = req.body;
    if (!partType || !manufacturer) {
      for (const key of Object.keys(files)) {
        for (const f of files[key]) fs.unlink(f.path, () => {});
      }
      return res.status(400).json({ error: 'Tipo de peca e fabricante sao obrigatorios.' });
    }

    const id = crypto.randomUUID();
    const folder = path.join(
      STORAGE_DIR,
      slugify(manufacturer),
      slugify(partType),
      slugify(`${brand || 'sem-marca'}-${model || 'sem-modelo'}`),
      id
    );
    fs.mkdirSync(folder, { recursive: true });

    const images = {};
    for (const key of ['front', 'back', 'label']) {
      const file = files[key][0];
      const ext = path.extname(file.originalname) || '.jpg';
      const destName = `${key}${ext}`;
      fs.renameSync(file.path, path.join(folder, destName));
      images[key] = path.relative(STORAGE_DIR, path.join(folder, destName)).split(path.sep).join('/');
    }

    const part = {
      id,
      partType,
      manufacturer,
      brand: brand || '',
      model: model || '',
      ref1: ref1 || '',
      ref2: ref2 || '',
      quantity: Number.isFinite(Number(quantity)) ? Math.max(0, Math.trunc(Number(quantity))) : 1,
      notes: notes || '',
      images,
      createdAt: new Date().toISOString(),
    };

    store.createPart(part);
    res.status(201).json(part);
  }
);

app.patch('/api/parts/:id', (req, res) => {
  const allowed = ['partType', 'manufacturer', 'brand', 'model', 'ref1', 'ref2', 'quantity', 'notes'];
  const patch = {};
  for (const key of allowed) {
    if (key in req.body) patch[key] = req.body[key];
  }
  if ('quantity' in patch) {
    patch.quantity = Math.max(0, Math.trunc(Number(patch.quantity) || 0));
  }
  const updated = store.updatePart(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'Peca nao encontrada.' });
  res.json(updated);
});

app.delete('/api/parts/:id', (req, res) => {
  const removed = store.deletePart(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Peca nao encontrada.' });
  const folder = path.join(STORAGE_DIR, path.dirname(Object.values(removed.images)[0] || ''));
  fs.rm(folder, { recursive: true, force: true }, () => {});
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Catalogo de pecas disponivel em http://localhost:${PORT}`);
});
