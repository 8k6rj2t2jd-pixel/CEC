'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const ExcelJS = require('exceljs');

const store = require('./lib/store');
const { readLabel } = require('./lib/ocr');
const auth = require('./lib/auth');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(DATA_DIR, 'storage');
const TMP_DIR = path.join(DATA_DIR, 'tmp');
const PUBLIC_DIR = path.join(__dirname, 'public');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

for (const dir of [STORAGE_DIR, TMP_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

if (!process.env.SESSION_SECRET) {
  console.warn(
    'Aviso: SESSION_SECRET nao definido - a usar um valor aleatorio gerado agora.\n' +
      'As sessoes ficam invalidas sempre que o servidor reiniciar. Defina SESSION_SECRET\n' +
      'nas variaveis de ambiente do seu hosting para evitar isso.'
  );
}
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: IS_PRODUCTION,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  })
);

// ---------------------------------------------------------------------------
// Autenticacao
// ---------------------------------------------------------------------------
app.get('/login', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'login.html')));

app.post('/api/login', async (req, res) => {
  const ip = req.ip;
  if (auth.isLocked(ip)) {
    return res.status(429).json({ error: 'Demasiadas tentativas. Tente novamente dentro de 1 minuto.' });
  }
  const { username, password } = req.body || {};
  const ok = await auth.checkCredentials(username, password);
  if (!ok) {
    auth.registerFailure(ip);
    return res.status(401).json({ error: 'Utilizador ou senha incorretos.' });
  }
  auth.registerSuccess(ip);
  req.session.authenticated = true;
  req.session.username = username;
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// Ficheiros que a pagina de login precisa mesmo sem sessao (imagens/estilo).
app.get('/style.css', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'style.css')));
app.get('/logo.png', (req, res, next) => {
  const logoPath = path.join(PUBLIC_DIR, 'logo.png');
  if (fs.existsSync(logoPath)) return res.sendFile(logoPath);
  next();
});

app.use(auth.requireAuth);

app.use(express.static(PUBLIC_DIR));
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

app.get('/api/export.xlsx', async (req, res) => {
  try {
    const parts = store.listParts();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Catálogo de Peças');

    sheet.columns = [
      { header: 'Foto', key: 'foto', width: 14 },
      { header: 'Tipo de peça', key: 'partType', width: 28 },
      { header: 'Fabricante', key: 'manufacturer', width: 18 },
      { header: 'Marca do veículo', key: 'brand', width: 18 },
      { header: 'Modelo', key: 'model', width: 16 },
      { header: 'Referência 1', key: 'ref1', width: 18 },
      { header: 'Referência 2', key: 'ref2', width: 20 },
      { header: 'Quantidade', key: 'quantity', width: 12 },
      { header: 'Notas', key: 'notes', width: 24 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const rowIndex = i + 2;
      sheet.addRow({
        partType: part.partType,
        manufacturer: part.manufacturer,
        brand: part.brand,
        model: part.model,
        ref1: part.ref1,
        ref2: part.ref2,
        quantity: part.quantity,
        notes: part.notes,
      });
      sheet.getRow(rowIndex).height = 70;

      const frontPath = part.images && part.images.front ? path.join(STORAGE_DIR, part.images.front) : null;
      if (frontPath && fs.existsSync(frontPath)) {
        const ext = path.extname(frontPath).slice(1).toLowerCase();
        const imageId = workbook.addImage({
          buffer: fs.readFileSync(frontPath),
          extension: ext === 'jpg' ? 'jpeg' : ext,
        });
        sheet.addImage(imageId, {
          tl: { col: 0, row: rowIndex - 1 },
          ext: { width: 90, height: 90 },
        });
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="catalogo-pecas-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Erro ao gerar Excel:', err);
    res.status(500).json({ error: 'Falha ao gerar o ficheiro Excel.' });
  }
});

app.listen(PORT, () => {
  console.log(`Catalogo de pecas disponivel em http://localhost:${PORT}`);
});
