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
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');

const store = require('./lib/store');
const images = require('./lib/images');
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
app.disable('x-powered-by');

// Comprime as respostas (HTML/CSS/JS/JSON) antes de enviar - torna a
// entrada no site e a navegação bem mais rápidas em ligações móveis, sem
// custo de CPU relevante para esta escala de aplicação.
app.use(compression());

// Cabecalhos de seguranca (CSP, no-sniff, sem referrer para fora, etc.) - a
// app so usa scripts/estilos dos seus proprios ficheiros (nada de CDNs nem
// inline), por isso a CSP pode ser estrita.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com'],
        // O visualizador de PDF (pdf.js) tem de conseguir ir buscar o
        // ficheiro - inclui o Cloudinary porque e la que os PDFs ficam
        // guardados em produção.
        connectSrc: ["'self'", 'https://res.cloudinary.com'],
        workerSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: IS_PRODUCTION ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// Limite explicito ao tamanho do JSON aceite - os formularios da app enviam
// poucos KB, por isso nao ha razao para aceitar corpos grandes (seria so
// mais uma forma de gastar memoria do servidor de borla).
app.use(express.json({ limit: '64kb' }));

// ---------------------------------------------------------------------------
// Protecao contra CSRF (pedidos disparados a partir de outro site com o
// cookie de sessao de quem esta autenticado). O cookie ja e SameSite=Strict,
// o que sozinho ja trava a maior parte destes ataques nos browsers atuais;
// isto e a segunda tranca: qualquer pedido que altere dados tem de vir
// mesmo do proprio site.
// ---------------------------------------------------------------------------
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function sameOrigin(req) {
  const origin = req.get('origin') || req.get('referer');
  // Sem Origin nem Referer nao da para provar a proveniencia. Os browsers
  // enviam sempre pelo menos um deles em pedidos deste tipo, por isso
  // recusa-se por precaucao.
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const expectedHost = req.get('host');
    return url.host === expectedHost;
  } catch {
    return false;
  }
}

app.use((req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  if (sameOrigin(req)) return next();
  return res.status(403).json({ error: 'Pedido bloqueado por segurança. Recarregue a página e tente de novo.' });
});

// Trava geral contra abuso/DoS na API (para alem do bloqueio especifico do
// login, abaixo). Generosa o suficiente para uso normal da app.
app.use(
  '/api',
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados pedidos. Tente novamente daqui a pouco.' },
  })
);

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas tentativas de login. Tente novamente mais tarde.' },
});

// Enviar ficheiros e correr o OCR sao as operacoes que mais gastam disco e
// CPU. O limite geral da API (120/min) e generoso demais para elas: 120
// envios de 20 MB encheriam o disco do plano gratuito num minuto. Estes
// limites continuam muito acima do uso normal de uma pessoa a trabalhar.
const uploadRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados envios seguidos. Espere um pouco e tente de novo.' },
});

const ocrRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas leituras seguidas. Espere um pouco e tente de novo.' },
});

// Sem isto, as sessoes ficam so em memoria - qualquer reinicio do servidor
// (ex: o plano gratuito do Render "adormece" com inatividade e acorda como
// processo novo) apaga todas as sessoes, desligando quem tinha a sessao
// iniciada a meio de uma tarefa. Com MONGODB_URI definido, as sessoes ficam
// guardadas no Mongo e sobrevivem a reinicios.
const sessionConfig = {
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: 'cec.sid', // nao anuncia que e Express, ao contrario do "connect.sid"
  cookie: {
    httpOnly: true,
    // "strict": o cookie nunca acompanha pedidos vindos de outro site, nem
    // sequer ao clicar num link - a defesa mais forte contra CSRF. A app so
    // se navega por dentro, por isso nao perde nada com isto.
    sameSite: 'strict',
    // "auto" marca o cookie como Secure sempre que a ligacao e HTTPS, em vez
    // de depender de a variavel NODE_ENV estar bem definida no hosting - se
    // alguem se esquecesse dela, o cookie seguia sem protecao.
    secure: 'auto',
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

app.post('/api/login', loginRateLimiter, async (req, res) => {
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
  // Gera uma sessao nova (em vez de reaproveitar a atual) para nao correr o
  // risco de "session fixation" - um atacante que tivesse conseguido definir
  // antecipadamente o cookie de sessao de alguem nao ganha nada com o login.
  req.session.regenerate((err) => {
    if (err) {
      console.error('[login] falha ao gerar nova sessao:', err);
      return res.status(500).json({ error: 'Falha ao iniciar sessao. Tente novamente.' });
    }
    req.session.authenticated = true;
    req.session.username = username;
    req.session.save(() => res.json({ ok: true }));
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('cec.sid');
    res.json({ ok: true });
  });
});

// Cache curto para ficheiros que mudam com cada deploy (nao tem nomes com
// hash), longo para os que praticamente nunca mudam - reduz pedidos
// repetidos ao navegar na app sem arriscar servir codigo desatualizado
// por muito tempo depois de um deploy.
const SHORT_CACHE_MS = 5 * 60 * 1000;
const LONG_CACHE_MS = 24 * 60 * 60 * 1000;

// Ficheiros que a pagina de login precisa mesmo sem sessao (imagens/estilo).
app.get('/style.css', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'style.css'), { maxAge: SHORT_CACHE_MS }));
app.get('/login.css', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'login.css'), { maxAge: SHORT_CACHE_MS }));
app.get('/login.js', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'login.js'), { maxAge: SHORT_CACHE_MS }));
app.get('/logo.png', (req, res, next) => {
  const logoPath = path.join(PUBLIC_DIR, 'logo.png');
  if (fs.existsSync(logoPath)) return res.sendFile(logoPath, { maxAge: LONG_CACHE_MS });
  next();
});
app.get('/login-bg.svg', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'login-bg.svg'), { maxAge: LONG_CACHE_MS }));
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'favicon.ico'), { maxAge: LONG_CACHE_MS }));
app.get('/favicon.png', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'favicon.png'), { maxAge: LONG_CACHE_MS }));

app.use(auth.requireAuth);

app.use(express.static(PUBLIC_DIR, {
  maxAge: SHORT_CACHE_MS,
  setHeaders: (res, filePath) => {
    // O pdf.js vendorizado (pdfjs-dist) e ficheiros dentro de /pdfjs so
    // mudam se alguem atualizar a dependencia a serio - podem ficar em
    // cache por muito mais tempo que o resto.
    if (filePath.includes(`${path.sep}pdfjs${path.sep}`)) res.setHeader('Cache-Control', `public, max-age=${LONG_CACHE_MS / 1000}`);
  },
}));
// Ficheiros guardados (fotos, etiquetas, dumps). Tudo o que nao seja uma
// foto ou PDF e servido como transferencia forcada: mesmo que alguem
// conseguisse la por um ficheiro com conteudo HTML, o browser guardava-o em
// vez de o abrir como pagina do proprio site (o que permitiria correr
// scripts com a sessao de quem estivesse autenticado).
const INLINE_SAFE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf']);

app.use(
  '/storage',
  express.static(STORAGE_DIR, {
    maxAge: LONG_CACHE_MS,
    setHeaders: (res, filePath) => {
      if (!INLINE_SAFE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
        res.setHeader('Content-Disposition', 'attachment');
      }
    },
  })
);

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TMP_DIR),
    filename: (req, file, cb) => {
      cb(null, `${crypto.randomUUID()}${safeExtension(file.originalname, '.jpg')}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  // So aceita fotos a serio - impede o envio de ficheiros disfarcados
  // (ex: .svg ou .html com script la dentro) atraves dos campos de foto.
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      return cb(new Error('Só são permitidas fotos (JPEG, PNG, WEBP ou HEIC).'));
    }
    cb(null, true);
  },
});

function handleUpload(middleware) {
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || 'Falha ao enviar o ficheiro.' });
      next();
    });
  };
}

// Ficheiros do repositorio de etiquetas: alem de fotos, tambem pode ser um
// PDF exportado do software de criar etiquetas (um modelo/template, por
// exemplo).
const ALLOWED_LABEL_FILE_TYPES = new Set([...ALLOWED_IMAGE_TYPES, 'application/pdf']);

const labelUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TMP_DIR),
    filename: (req, file, cb) => {
      cb(null, `${crypto.randomUUID()}${safeExtension(file.originalname)}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_LABEL_FILE_TYPES.has(file.mimetype)) {
      return cb(new Error('Só são permitidos ficheiros de imagem ou PDF.'));
    }
    cb(null, true);
  },
});

// Ficheiros diversos anexados a uma peça (manuais, faturas, esquemas,
// certificados...) - além de fotos e PDF, também documentos de escritório
// comuns e ficheiros comprimidos. Fica de fora tudo o que possa conter
// código a correr no browser (HTML, SVG) ou ser executável, pelo mesmo
// motivo de segurança dos outros campos de upload da app.
const ALLOWED_PART_FILE_TYPES = new Set([
  ...ALLOWED_IMAGE_TYPES,
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
]);

// Dumps de centralinas (leituras de flash/EEPROM feitas pelas ferramentas de
// programacao) chegam quase sempre como "application/octet-stream", um tipo
// generico demais para se aceitar em bruto - qualquer ficheiro pode alegar
// ser isso. Por isso aceita-se esse tipo apenas quando a extensao e mesmo
// uma das usadas por estas ferramentas.
const ALLOWED_DUMP_EXTENSIONS = new Set([
  '.bin', '.hex', '.ori', '.mod', '.eep', '.eeprom', '.frf', '.s19', '.dam', '.kp', '.a2l',
]);
const GENERIC_BINARY_TYPES = new Set(['application/octet-stream', 'application/x-binary', '']);

function isAllowedPartFile(file) {
  if (ALLOWED_PART_FILE_TYPES.has(file.mimetype)) return true;
  if (GENERIC_BINARY_TYPES.has(file.mimetype || '')) {
    return ALLOWED_DUMP_EXTENSIONS.has(path.extname(file.originalname || '').toLowerCase());
  }
  return false;
}

const partFileUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TMP_DIR),
    filename: (req, file, cb) => {
      cb(null, `${crypto.randomUUID()}${safeExtension(file.originalname)}`);
    },
  }),
  // "files" limita quantos ficheiros por envio; "fileSize" limita cada um.
  // Juntos travam o pior caso (um so pedido a tentar escrever gigabytes no
  // disco do servidor).
  limits: { fileSize: 20 * 1024 * 1024, files: 25, fields: 10, parts: 40 },
  // Ao enviar uma pasta inteira vem sempre lixo do sistema pelo meio
  // (.DS_Store no Mac, Thumbs.db no Windows) e por vezes ficheiros de
  // configuracao das ferramentas. Recusar o pedido todo por causa de um
  // deles deitava fora os dumps bons que vinham no mesmo envio - por isso
  // salta-se o que nao serve e guarda-se o resto, dizendo no fim quantos
  // ficaram de fora.
  fileFilter: (req, file, cb) => {
    if (!isAllowedPartFile(file)) {
      req.skippedFiles = req.skippedFiles || [];
      req.skippedFiles.push(file.originalname);
      return cb(null, false);
    }
    cb(null, true);
  },
});

// ---------------------------------------------------------------------------
// Validacao dos dados que chegam em JSON
// ---------------------------------------------------------------------------
// Sem isto, um pedido feito a mao podia enviar um objeto (ex: {"$ne": null})
// ou um texto enorme onde a app espera uma linha de texto, e isso ia parar
// tal e qual a base de dados. Aqui garante-se que so entra texto simples e
// de tamanho razoavel.
const MAX_FIELD_LENGTH = 300;
const MAX_NOTES_LENGTH = 2000;

function cleanText(value, maxLength = MAX_FIELD_LENGTH) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return ''; // recusa objetos/arrays
  return String(value)
    // Tira caracteres de controlo (incluindo os que "partem" linhas em
    // ficheiros exportados), mantendo acentos e simbolos normais.
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLength);
}

// So aceita caminhos que fiquem mesmo dentro da pasta de armazenamento -
// segunda tranca para nunca se apagar nada fora dela por causa de um valor
// estranho guardado na base de dados.
function resolveInsideStorage(relativePath) {
  const resolved = path.resolve(STORAGE_DIR, relativePath);
  const root = path.resolve(STORAGE_DIR);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

// Extensao segura para o nome com que o ficheiro fica gravado em disco. O
// nome em si e sempre um UUID gerado por nos; isto so garante que a extensao
// vinda do cliente nao traz caracteres estranhos.
function safeExtension(originalName, fallback = '') {
  const ext = path.extname(String(originalName || '')).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : fallback;
}

// Como cada foto se chama no nome do ficheiro transferido.
const PHOTO_SLOT_NAMES = { front: 'frente', back: 'tras', label: 'etiqueta' };

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
app.post('/api/ocr', ocrRateLimiter, handleUpload(upload.single('label')), async (req, res) => {
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
  uploadRateLimiter,
  handleUpload(
    upload.fields([
      { name: 'front', maxCount: 1 },
      { name: 'back', maxCount: 1 },
      { name: 'label', maxCount: 1 },
    ])
  ),
  async (req, res) => {
    const files = req.files || {};
    const providedKeys = ['front', 'back', 'label'].filter((key) => files[key]);
    const cleanupTmp = () => {
      for (const key of Object.keys(files)) {
        for (const f of files[key]) fs.unlink(f.path, () => {});
      }
    };

    const body = req.body || {};
    const category = cleanText(body.category);
    const partType = cleanText(body.partType);
    const manufacturer = cleanText(body.manufacturer);
    const brand = cleanText(body.brand);
    const model = cleanText(body.model);
    const ref1 = cleanText(body.ref1);
    const ref2 = cleanText(body.ref2);
    const box = cleanText(body.box);
    const notes = cleanText(body.notes, MAX_NOTES_LENGTH);
    const quantity = body.quantity;

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
      return res.status(500).json({ error: 'Falha ao guardar as fotos. Tente novamente.' });
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
      box: box || '',
      notes: notes || '',
      images: partImages,
      createdAt: new Date().toISOString(),
    };

    try {
      await store.createPart(part);
      res.status(201).json(part);
    } catch (err) {
      console.error('[parts] falha ao gravar na base de dados:', err);
      res.status(500).json({ error: 'Falha ao gravar na base de dados. Tente novamente.' });
    }
  }
);

app.patch('/api/parts/:id', async (req, res) => {
  const allowed = ['category', 'partType', 'manufacturer', 'brand', 'model', 'ref1', 'ref2', 'box', 'notes'];
  const body = req.body || {};
  const patch = {};
  for (const key of allowed) {
    if (key in body) patch[key] = cleanText(body[key], key === 'notes' ? MAX_NOTES_LENGTH : MAX_FIELD_LENGTH);
  }
  if ('category' in patch) patch.category = patch.category === 'quadrante' ? 'quadrante' : 'centralina';
  if ('quantity' in body) {
    patch.quantity = Math.max(0, Math.trunc(Number(body.quantity) || 0));
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
  uploadRateLimiter,
  handleUpload(
    upload.fields([
      { name: 'front', maxCount: 1 },
      { name: 'back', maxCount: 1 },
      { name: 'label', maxCount: 1 },
    ])
  ),
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
      return res.status(500).json({ error: 'Falha ao guardar as fotos. Tente novamente.' });
    }

    const updated = await store.updatePart(part.id, { images: partImages });
    res.json(updated);
  }
);

// Ficheiros diversos anexados a uma peça (manuais, faturas, esquemas...) -
// aparecem na aba "Ficheiros" ao editar a peça. Vários ficheiros por peça,
// cada um com o seu próprio id para poder apagar individualmente.
app.post('/api/parts/:id/files', uploadRateLimiter, handleUpload(partFileUpload.array('file', 25)), async (req, res) => {
  const files = req.files || [];
  const skipped = req.skippedFiles || [];
  if (!files.length) {
    if (skipped.length) {
      return res.status(400).json({
        error: skipped.length === 1
          ? 'Tipo de ficheiro não permitido.'
          : `Nenhum dos ${skipped.length} ficheiros é de um tipo permitido.`,
      });
    }
    return res.status(400).json({ error: 'Falta o ficheiro.' });
  }
  const cleanupTmp = () => files.forEach((f) => fs.unlink(f.path, () => {}));

  const part = await store.getPart(req.params.id);
  if (!part) {
    cleanupTmp();
    return res.status(404).json({ error: 'Peca nao encontrada.' });
  }

  const newFiles = [];

  try {
    for (const file of files) {
      const fileId = crypto.randomUUID();
      let fileUrl;
      let publicId = null;
      let resourceType = null;

      let deliveryType = null;

      if (images.useCloud) {
        const uploaded = await images.uploadPartFile(file.path, part.id, fileId, file.mimetype);
        // De proposito NAO se guarda o endereco do Cloudinary como "url": os
        // ficheiros das pecas passam a ser servidos sempre pelo proprio site
        // (ver a rota /download), para nunca sair daqui um endereco que
        // funcione sozinho.
        fileUrl = null;
        publicId = uploaded.publicId;
        resourceType = uploaded.resourceType;
        deliveryType = uploaded.deliveryType;
        fs.unlink(file.path, () => {});
      } else {
        const folder = path.join(STORAGE_DIR, 'pecas-ficheiros', part.id);
        fs.mkdirSync(folder, { recursive: true });
        const ext = path.extname(file.originalname) || '';
        const destName = `${fileId}${ext}`;
        fs.renameSync(file.path, path.join(folder, destName));
        fileUrl = `/storage/pecas-ficheiros/${part.id}/${destName}`;
      }

      newFiles.push({
        id: fileId,
        fileName: file.originalname,
        fileType: file.mimetype,
        size: file.size,
        url: fileUrl,
        publicId,
        resourceType,
        deliveryType,
        createdAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error('[parts] falha ao guardar ficheiro:', err);
    cleanupTmp();
    return res.status(500).json({ error: 'Falha ao guardar o ficheiro. Tente novamente.' });
  }

  const partFiles = [...(part.files || []), ...newFiles];
  const updated = await store.updatePart(part.id, { files: partFiles });
  res.status(201).json({ ...updated, skipped: skipped.length, added: newFiles.length });
});

// Transfere a foto de uma peça já com um nome útil - a referência da peça em
// vez do nome aleatorio com que ficou guardada. Passa pelo servidor porque o
// atributo "download" do browser e ignorado quando o ficheiro vem de outro
// dominio (o CDN), e sem isto a foto abria em vez de se guardar.
app.get('/api/parts/:id/photos/:slot/download', async (req, res) => {
  const slot = req.params.slot;
  if (!['front', 'back', 'label'].includes(slot)) {
    return res.status(400).json({ error: 'Foto inválida.' });
  }

  const part = await store.getPart(req.params.id);
  if (!part) return res.status(404).json({ error: 'Peca nao encontrada.' });

  const image = part.images && part.images[slot];
  if (!image || !image.url) return res.status(404).json({ error: 'Foto não encontrada.' });

  // Nome do ficheiro: referencia da peca + qual das fotos e.
  const baseName = slugify(part.ref1 || part.ref2 || part.partType || 'peca');
  const safeName = `${baseName}-${PHOTO_SLOT_NAMES[slot]}.jpg`;

  try {
    if (image.url.startsWith('/storage/')) {
      const safePath = resolveInsideStorage(image.url.replace(/^\/storage\//, ''));
      if (!safePath || !fs.existsSync(safePath)) {
        return res.status(404).json({ error: 'Foto não encontrada.' });
      }
      return res.download(safePath, safeName);
    }

    const upstream = await fetch(image.url);
    if (!upstream.ok) {
      console.error('[fotos] origem respondeu', upstream.status);
      return res.status(502).json({ error: 'Não foi possível obter a foto. Tente novamente.' });
    }
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    console.error('[fotos] falha ao obter a foto:', err);
    return res.status(502).json({ error: 'Não foi possível obter a foto. Tente novamente.' });
  }
});

// Unica porta de entrada para os ficheiros de uma peça. Como toda a API
// exige sessao iniciada, isto garante que ninguem chega a um dump de
// centralina sem entrar no site - nem sequer com o endereco na mao.
app.get('/api/parts/:id/files/:fileId/download', async (req, res) => {
  const part = await store.getPart(req.params.id);
  if (!part) return res.status(404).json({ error: 'Peca nao encontrada.' });

  const target = (part.files || []).find((f) => f.id === req.params.fileId);
  if (!target) return res.status(404).json({ error: 'Ficheiro não encontrado.' });

  // O nome original e usado so para a transferencia sair com um nome
  // reconhecivel - limpo de barras e aspas para nao poder alterar o
  // cabecalho da resposta.
  const safeName = String(target.fileName || 'ficheiro').replace(/[\\/"\r\n]/g, '_').slice(0, 200);

  // Ficheiro guardado em disco (modo local, sem Cloudinary).
  if (!target.publicId) {
    const safePath = target.url && resolveInsideStorage(target.url.replace(/^\/storage\//, ''));
    if (!safePath || !fs.existsSync(safePath)) {
      return res.status(404).json({ error: 'Ficheiro não encontrado.' });
    }
    return res.download(safePath, safeName);
  }

  // Ficheiro no Cloudinary: o servidor gera um link assinado de curta
  // duracao (so ele tem a chave), vai buscar o ficheiro e entrega-o. O
  // browser nunca chega a ver o endereco do Cloudinary.
  try {
    const signed = images.signedUrlFor(target.publicId, target.resourceType, target.deliveryType);
    const upstream = await fetch(signed);
    if (!upstream.ok) {
      console.error('[files] Cloudinary respondeu', upstream.status, 'para', target.publicId);
      return res.status(502).json({ error: 'Não foi possível obter o ficheiro. Tente novamente.' });
    }
    res.setHeader('Content-Type', target.fileType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    const buffer = Buffer.from(await upstream.arrayBuffer());
    return res.send(buffer);
  } catch (err) {
    console.error('[files] falha ao obter o ficheiro:', err);
    return res.status(502).json({ error: 'Não foi possível obter o ficheiro. Tente novamente.' });
  }
});

app.delete('/api/parts/:id/files/:fileId', async (req, res) => {
  const part = await store.getPart(req.params.id);
  if (!part) return res.status(404).json({ error: 'Peca nao encontrada.' });

  const target = (part.files || []).find((f) => f.id === req.params.fileId);
  if (!target) return res.status(404).json({ error: 'Ficheiro não encontrado.' });

  if (images.useCloud) {
    if (target.publicId) await images.deletePartFile(target.publicId, target.resourceType, target.deliveryType);
  } else if (target.url) {
    const safePath = resolveInsideStorage(target.url.replace(/^\/storage\//, ''));
    if (safePath) fs.unlink(safePath, () => {});
  }

  const partFiles = (part.files || []).filter((f) => f.id !== req.params.fileId);
  const updated = await store.updatePart(part.id, { files: partFiles });
  res.json(updated);
});

app.delete('/api/parts/:id', async (req, res) => {
  const removed = await store.deletePart(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Peca nao encontrada.' });

  const imgs = Object.values(removed.images || {});
  if (images.useCloud) {
    for (const img of imgs) {
      if (img && img.publicId) await images.deleteImage(img.publicId);
    }
    for (const file of removed.files || []) {
      if (file && file.publicId) await images.deletePartFile(file.publicId, file.resourceType, file.deliveryType);
    }
  } else {
    const firstUrl = (imgs[0] && imgs[0].url) || '';
    // So tenta apagar a pasta se houver mesmo um caminho local guardado -
    // sem isto, uma peca sem fotos fazia "rel" ficar vazio e apagava a
    // pasta STORAGE_DIR inteira (todas as fotos de todas as pecas).
    if (firstUrl) {
      const rel = firstUrl.replace(/^\/storage\//, '');
      const folder = resolveInsideStorage(path.dirname(rel));
      // "resolveInsideStorage" devolve null se o caminho tentasse sair da
      // pasta de armazenamento, e nunca se apaga a raiz por engano.
      if (folder && folder !== path.resolve(STORAGE_DIR)) {
        fs.rm(folder, { recursive: true, force: true }, () => {});
      }
    }
    const filesFolder = resolveInsideStorage(path.join('pecas-ficheiros', removed.id));
    if (filesFolder) fs.rm(filesFolder, { recursive: true, force: true }, () => {});
  }

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Repositorio de etiquetas: fotos/PDFs de etiquetas ja feitas ou modelos
// template, organizados por fabricante para se poder pesquisar por
// referencia ou fabricante mais tarde. Uma etiqueta sem fabricante definido
// fica "indiferenciada" ate ser classificada.
// ---------------------------------------------------------------------------
app.get('/api/labels', async (req, res) => {
  const labels = await store.listLabels();
  res.json(labels);
});

app.post(
  '/api/labels',
  uploadRateLimiter,
  handleUpload(
    labelUpload.fields([
      { name: 'file', maxCount: 1 },
      { name: 'thumbnail', maxCount: 1 },
    ])
  ),
  async (req, res) => {
    const file = req.files && req.files.file && req.files.file[0];
    // Capa opcional (gerada no browser a partir da 1ª página, quando o
    // ficheiro é um PDF) - so para se poder identificar o template de
    // relance, nao substitui o ficheiro original.
    const thumbnailFile = req.files && req.files.thumbnail && req.files.thumbnail[0];
    if (!file) return res.status(400).json({ error: 'Falta o ficheiro da etiqueta.' });
    const cleanupTmp = () => {
      fs.unlink(file.path, () => {});
      if (thumbnailFile) fs.unlink(thumbnailFile.path, () => {});
    };

    const manufacturer = cleanText(req.body.manufacturer);
    const reference = cleanText(req.body.reference);
    const isTemplate = req.body.isTemplate === 'true' || req.body.isTemplate === 'on';

    const id = crypto.randomUUID();
    let fileUrl;
    let publicId = null;
    let resourceType = null;
    let thumbnailUrl = null;
    let thumbnailPublicId = null;

    try {
      if (images.useCloud) {
        const uploaded = await images.uploadLabelFile(file.path, id, file.mimetype);
        fileUrl = uploaded.url;
        publicId = uploaded.publicId;
        resourceType = uploaded.resourceType;
        fs.unlink(file.path, () => {});

        if (thumbnailFile) {
          const uploadedThumb = await images.uploadLabelFile(thumbnailFile.path, `${id}-capa`, thumbnailFile.mimetype);
          thumbnailUrl = uploadedThumb.url;
          thumbnailPublicId = uploadedThumb.publicId;
          fs.unlink(thumbnailFile.path, () => {});
        }
      } else {
        const folder = path.join(STORAGE_DIR, 'etiquetas', slugify(manufacturer || 'indiferenciadas'), id);
        fs.mkdirSync(folder, { recursive: true });
        const ext = path.extname(file.originalname) || '';
        const destName = `ficheiro${ext}`;
        fs.renameSync(file.path, path.join(folder, destName));
        const rel = path.relative(STORAGE_DIR, path.join(folder, destName)).split(path.sep).join('/');
        fileUrl = `/storage/${rel}`;

        if (thumbnailFile) {
          fs.renameSync(thumbnailFile.path, path.join(folder, 'capa.jpg'));
          const thumbRel = path.relative(STORAGE_DIR, path.join(folder, 'capa.jpg')).split(path.sep).join('/');
          thumbnailUrl = `/storage/${thumbRel}`;
        }
      }
    } catch (err) {
      console.error('[labels] falha ao guardar o ficheiro:', err);
      cleanupTmp();
      return res.status(500).json({ error: 'Falha ao guardar a etiqueta. Tente novamente.' });
    }

    const label = {
      id,
      manufacturer,
      reference,
      isTemplate,
      fileUrl,
      fileName: file.originalname,
      fileType: file.mimetype,
      publicId,
      resourceType,
      thumbnailUrl,
      thumbnailPublicId,
      createdAt: new Date().toISOString(),
    };

    try {
      await store.createLabel(label);
      res.status(201).json(label);
    } catch (err) {
      console.error('[labels] falha ao gravar na base de dados:', err);
      res.status(500).json({ error: 'Falha ao gravar a etiqueta. Tente novamente.' });
    }
  }
);

app.patch('/api/labels/:id', async (req, res) => {
  const body = req.body || {};
  const patch = {};
  for (const key of ['manufacturer', 'reference']) {
    if (key in body) patch[key] = cleanText(body[key]);
  }
  if ('isTemplate' in body) patch.isTemplate = body.isTemplate === true || body.isTemplate === 'true';
  const updated = await store.updateLabel(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'Etiqueta não encontrada.' });
  res.json(updated);
});

app.delete('/api/labels/:id', async (req, res) => {
  const removed = await store.deleteLabel(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Etiqueta não encontrada.' });

  if (images.useCloud) {
    if (removed.publicId) await images.deleteLabelFile(removed.publicId, removed.resourceType);
    if (removed.thumbnailPublicId) await images.deleteLabelFile(removed.thumbnailPublicId, 'image');
  } else if (removed.fileUrl) {
    // So apaga a pasta se houver mesmo um caminho local guardado (mesma
    // proteção usada para as fotos das peças, para nunca apagar o
    // repositorio inteiro por engano).
    const rel = removed.fileUrl.replace(/^\/storage\//, '');
    const folder = resolveInsideStorage(path.dirname(rel));
    if (folder && folder !== path.resolve(STORAGE_DIR)) {
      fs.rm(folder, { recursive: true, force: true }, () => {});
    }
  }

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Envios - registo simples de encomendas enviadas (data, cliente, peso e
// dimensoes). Guardados como lista plana; o agrupamento por ano/mes e feito
// no browser a partir do campo "date" (nao ha pastas fisicas a gerir aqui).
// ---------------------------------------------------------------------------
app.get('/api/shipments', async (req, res) => {
  const shipments = await store.listShipments();
  res.json(shipments);
});

app.post('/api/shipments', async (req, res) => {
  const body = req.body || {};
  const { weight, length, width, height } = body;
  // A data tem de vir mesmo no formato AAAA-MM-DD - e o que o agrupamento
  // por ano/mes no browser espera; qualquer outra coisa estragaria as pastas.
  const date = cleanText(body.date, 10);
  const client = cleanText(body.client);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !client) {
    return res.status(400).json({ error: 'Data de envio e cliente são obrigatórios.' });
  }
  const toNumber = (v) => {
    if (v === undefined || v === null || String(v).trim() === '') return null;
    return Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null;
  };

  const shipment = {
    id: crypto.randomUUID(),
    date,
    client,
    weight: toNumber(weight),
    length: toNumber(length),
    width: toNumber(width),
    height: toNumber(height),
    createdAt: new Date().toISOString(),
  };

  await store.createShipment(shipment);
  res.status(201).json(shipment);
});

app.patch('/api/shipments/:id', async (req, res) => {
  const body = req.body || {};
  const patch = {};
  if ('client' in body) patch.client = cleanText(body.client);
  if ('date' in body) {
    const date = cleanText(body.date, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Data de envio inválida.' });
    }
    patch.date = date;
  }
  for (const key of ['weight', 'length', 'width', 'height']) {
    if (key in body) {
      const v = body[key];
      patch[key] = v === undefined || v === null || typeof v === 'object' || String(v).trim() === ''
        ? null
        : (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null);
    }
  }
  const updated = await store.updateShipment(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'Envio não encontrado.' });
  res.json(updated);
});

app.delete('/api/shipments/:id', async (req, res) => {
  const removed = await store.deleteShipment(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Envio não encontrado.' });
  res.json({ ok: true });
});

// Evita que um valor guardado (referencia, notas, etc.) comecado por
// =, +, -, @ seja interpretado como formula ao abrir o Excel gerado
// ("CSV/Excel injection") - poe uma plica a frente para forcar texto.
function sanitizeForExcel(value) {
  const str = String(value == null ? '' : value);
  return /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
}

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
      { header: 'Caixa', key: 'box', width: 10 },
      { header: 'Notas', key: 'notes', width: 24 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const rowIndex = i + 2;
      sheet.addRow({
        partType: sanitizeForExcel(part.partType),
        manufacturer: sanitizeForExcel(part.manufacturer),
        brand: sanitizeForExcel(part.brand),
        model: sanitizeForExcel(part.model),
        ref1: sanitizeForExcel(part.ref1),
        ref2: sanitizeForExcel(part.ref2),
        quantity: part.quantity,
        box: sanitizeForExcel(part.box),
        notes: sanitizeForExcel(part.notes),
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
            const localPath = resolveInsideStorage(front.url.replace(/^\/storage\//, ''));
            if (localPath && fs.existsSync(localPath)) {
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
