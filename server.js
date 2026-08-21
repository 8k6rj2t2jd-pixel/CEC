'use strict';

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const multer = require('multer');
const ExcelJS = require('exceljs');

const store = require('./lib/store');
const images = require('./lib/images');
const { readLabel } = require('./lib/ocr');
const auth = require('./lib/auth');
const { buildPartsFromStockFile } = require('./lib/stockImport');

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

// Sem isto, as sessoes ficam so em memoria - qualquer reinicio do servidor
// (ex: o plano gratuito do Render "adormece" com inatividade e acorda como
// processo novo) apaga todas as sessoes, desligando quem tinha a sessao
// iniciada a meio de uma tarefa. Com MONGODB_URI definido, as sessoes ficam
// guardadas no Mongo e sobrevivem a reinicios.
const sessionConfig = {
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PRODUCTION,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
};
if (process.env.MONGODB_URI) {
  sessionConfig.store = MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions',
  });
}
app.use(session(sessionConfig));

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
app.get('/login-bg.svg', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'login-bg.svg')));

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
  const startedAt = Date.now();
  console.log(`[OCR] a processar ${req.file.originalname} (${Math.round(req.file.size / 1024)}KB)...`);
  try {
    const result = await readLabel(req.file.path);
    const ms = Date.now() - startedAt;
    console.log(
      `[OCR] concluido em ${ms}ms - fabricante=${result.manufacturer || '(nenhum)'} ` +
        `referencias=${JSON.stringify(result.referenceCandidates)} textoBruto="${result.rawText.slice(0, 200)}"`
    );
    res.json(result);
  } catch (err) {
    console.error(`[OCR] falhou apos ${Date.now() - startedAt}ms:`, err);
    res.status(500).json({ error: 'Falha ao ler a etiqueta.' });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

app.get('/api/parts', async (req, res) => {
  const { q, partType, manufacturer, brand } = req.query;
  let parts = await store.listParts();

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

app.get('/api/parts/:id', async (req, res) => {
  const part = await store.getPart(req.params.id);
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
  async (req, res) => {
    const files = req.files || {};
    const providedKeys = ['front', 'back', 'label'].filter((key) => files[key]);
    const cleanupTmp = () => {
      for (const key of Object.keys(files)) {
        for (const f of files[key]) fs.unlink(f.path, () => {});
      }
    };

    const { category, partType, manufacturer, brand, model, ref1, ref2, quantity, notes } = req.body;
    if (!partType || !manufacturer) {
      cleanupTmp();
      return res.status(400).json({ error: 'Tipo de peca e fabricante sao obrigatorios.' });
    }

    const id = crypto.randomUUID();
    const partImages = {};

    try {
      if (images.useCloud) {
        for (const key of providedKeys) {
          const file = files[key][0];
          const uploaded = await images.uploadImage(file.path, id);
          partImages[key] = { url: uploaded.url, publicId: uploaded.publicId };
        }
        cleanupTmp();
      } else if (providedKeys.length) {
        const folder = path.join(
          STORAGE_DIR,
          slugify(manufacturer),
          slugify(partType),
          slugify(`${brand || 'sem-marca'}-${model || 'sem-modelo'}`),
          id
        );
        fs.mkdirSync(folder, { recursive: true });
        for (const key of providedKeys) {
          const file = files[key][0];
          const ext = path.extname(file.originalname) || '.jpg';
          const destName = `${key}${ext}`;
          fs.renameSync(file.path, path.join(folder, destName));
          const rel = path.relative(STORAGE_DIR, path.join(folder, destName)).split(path.sep).join('/');
          partImages[key] = { url: `/storage/${rel}`, publicId: null };
        }
      }
    } catch (err) {
      console.error('[parts] falha ao enviar as fotos:', err);
      cleanupTmp();
      return res.status(500).json({ error: `Falha ao guardar as fotos (${err.message || err}).` });
    }

    const part = {
      id,
      category: category === 'quadrante' ? 'quadrante' : 'centralina',
      partType,
      manufacturer,
      brand: brand || '',
      model: model || '',
      ref1: ref1 || '',
      ref2: ref2 || '',
      quantity: Number.isFinite(Number(quantity)) ? Math.max(0, Math.trunc(Number(quantity))) : 1,
      notes: notes || '',
      images: partImages,
      createdAt: new Date().toISOString(),
    };

    try {
      await store.createPart(part);
      res.status(201).json(part);
    } catch (err) {
      console.error('[parts] falha ao gravar na base de dados:', err);
      res.status(500).json({ error: `Falha ao gravar na base de dados (${err.message || err}).` });
    }
  }
);

app.patch('/api/parts/:id', async (req, res) => {
  const allowed = ['category', 'partType', 'manufacturer', 'brand', 'model', 'ref1', 'ref2', 'quantity', 'notes'];
  const patch = {};
  for (const key of allowed) {
    if (key in req.body) patch[key] = req.body[key];
  }
  if ('quantity' in patch) {
    patch.quantity = Math.max(0, Math.trunc(Number(patch.quantity) || 0));
  }
  const updated = await store.updatePart(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'Peca nao encontrada.' });
  res.json(updated);
});

// Adiciona ou troca fotos numa peca ja existente (ex: peca guardada sem foto
// na altura, e agora quer-se acrescentar). So mexe nos slots enviados -
// front/back/label sao todos opcionais e os que ja existiam ficam tal como
// estavam.
app.post(
  '/api/parts/:id/photos',
  upload.fields([
    { name: 'front', maxCount: 1 },
    { name: 'back', maxCount: 1 },
    { name: 'label', maxCount: 1 },
  ]),
  async (req, res) => {
    const files = req.files || {};
    const providedKeys = ['front', 'back', 'label'].filter((key) => files[key]);
    const cleanupTmp = () => {
      for (const key of Object.keys(files)) {
        for (const f of files[key]) fs.unlink(f.path, () => {});
      }
    };

    if (!providedKeys.length) {
      cleanupTmp();
      return res.status(400).json({ error: 'Nenhuma foto enviada.' });
    }

    const part = await store.getPart(req.params.id);
    if (!part) {
      cleanupTmp();
      return res.status(404).json({ error: 'Peca nao encontrada.' });
    }

    const partImages = { ...(part.images || {}) };

    try {
      if (images.useCloud) {
        for (const key of providedKeys) {
          const file = files[key][0];
          const uploaded = await images.uploadImage(file.path, part.id);
          partImages[key] = { url: uploaded.url, publicId: uploaded.publicId };
        }
        cleanupTmp();
      } else {
        const folder = path.join(
          STORAGE_DIR,
          slugify(part.manufacturer),
          slugify(part.partType),
          slugify(`${part.brand || 'sem-marca'}-${part.model || 'sem-modelo'}`),
          part.id
        );
        fs.mkdirSync(folder, { recursive: true });
        for (const key of providedKeys) {
          const file = files[key][0];
          const ext = path.extname(file.originalname) || '.jpg';
          const destName = `${key}${ext}`;
          fs.renameSync(file.path, path.join(folder, destName));
          const rel = path.relative(STORAGE_DIR, path.join(folder, destName)).split(path.sep).join('/');
          partImages[key] = { url: `/storage/${rel}`, publicId: null };
        }
      }
    } catch (err) {
      console.error('[parts] falha ao enviar fotos adicionais:', err);
      cleanupTmp();
      return res.status(500).json({ error: `Falha ao guardar as fotos (${err.message || err}).` });
    }

    const updated = await store.updatePart(part.id, { images: partImages });
    res.json(updated);
  }
);

app.delete('/api/parts/:id', async (req, res) => {
  const removed = await store.deletePart(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Peca nao encontrada.' });

  const imgs = Object.values(removed.images || {});
  if (images.useCloud) {
    for (const img of imgs) {
      if (img && img.publicId) await images.deleteImage(img.publicId);
    }
  } else {
    const firstUrl = (imgs[0] && imgs[0].url) || '';
    // So tenta apagar a pasta se houver mesmo um caminho local guardado -
    // sem isto, uma peca sem fotos fazia "rel" ficar vazio e apagava a
    // pasta STORAGE_DIR inteira (todas as fotos de todas as pecas).
    if (firstUrl) {
      const rel = firstUrl.replace(/^\/storage\//, '');
      const folder = path.join(STORAGE_DIR, path.dirname(rel));
      fs.rm(folder, { recursive: true, force: true }, () => {});
    }
  }

  res.json({ ok: true });
});

// Rota temporaria para importar em massa o stock antigo (scripts/stock-
// import-data.json), sem fotos - alternativa ao Shell do Render (que exige
// plano pago). Recusa correr outra vez se ja houver pecas com a nota de
// importacao, para nao duplicar tudo sem querer.
app.post('/api/admin/import-stock', async (req, res) => {
  try {
    const existing = await store.listParts();
    const alreadyImported = existing.some((p) => (p.notes || '').includes('Importado do stock antigo'));
    if (alreadyImported) {
      return res.status(409).json({
        error: 'Já existem peças importadas do stock antigo no catálogo. Para evitar duplicar tudo, não repeti a importação automaticamente.',
      });
    }

    const { parts, skipped } = buildPartsFromStockFile();
    let created = 0;
    let withManufacturer = 0;
    for (const part of parts) {
      await store.createPart(part);
      created += 1;
      if (part.manufacturer) withManufacturer += 1;
    }
    res.json({ created, withManufacturer, skipped });
  } catch (err) {
    console.error('[import-stock] falha:', err);
    res.status(500).json({ error: `Falha na importação (${err.message || err}).` });
  }
});

app.get('/api/export.xlsx', async (req, res) => {
  try {
    const parts = await store.listParts();
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

      const front = part.images && part.images.front;
      if (front && front.url) {
        try {
          let buffer = null;
          let ext = 'jpeg';
          if (front.publicId) {
            const resp = await fetch(front.url);
            if (resp.ok) buffer = Buffer.from(await resp.arrayBuffer());
          } else {
            const localPath = path.join(STORAGE_DIR, front.url.replace(/^\/storage\//, ''));
            if (fs.existsSync(localPath)) {
              buffer = fs.readFileSync(localPath);
              ext = path.extname(localPath).slice(1).toLowerCase() || 'jpeg';
            }
          }
          if (buffer) {
            const imageId = workbook.addImage({ buffer, extension: ext === 'jpg' ? 'jpeg' : ext });
            sheet.addImage(imageId, {
              tl: { col: 0, row: rowIndex - 1 },
              ext: { width: 90, height: 90 },
            });
          }
        } catch (imgErr) {
          console.error('Falha ao incluir foto no Excel:', imgErr);
        }
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
