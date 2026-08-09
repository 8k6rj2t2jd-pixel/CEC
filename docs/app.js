'use strict';

// ---------------------------------------------------------------------------
// Deteção de referências / fabricante / tipo de peça a partir do texto OCR
// (mesma lógica da versão para servidor, adaptada para correr no browser).
// ---------------------------------------------------------------------------
const KNOWN_MANUFACTURERS = [
  'BOSCH', 'DENSO', 'CONTINENTAL', 'SIEMENS', 'VDO', 'DELPHI',
  'MAGNETI MARELLI', 'MARELLI', 'VALEO', 'HITACHI', 'SAGEM', 'HELLA',
  'TEMIC', 'PANASONIC', 'MITSUBISHI ELECTRIC', 'VISTEON', 'KEIHIN',
  'AISIN', 'JTEKT', 'TRW', 'MOTOROLA',
];

const BOSCH_PREFIX_HINTS = [
  { prefix: '0281', label: 'Centralina de injeção (diesel EDC)' },
  { prefix: '0261', label: 'Centralina de injeção (gasolina Motronic)' },
  { prefix: '0265', label: 'Centralina ABS/ESP' },
  { prefix: '0258', label: 'Sonda lambda' },
  { prefix: '0221', label: 'Bobina de ignição' },
];

function normalizeText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function extractReferences(rawText) {
  const text = rawText.toUpperCase();
  const refs = new Set();
  const boschMatches = text.match(/\b0[\s.]?\d{3}[\s.]?\d{3}[\s.]?\d{3}\b/g) || [];
  for (const m of boschMatches) refs.add(m.replace(/[\s.]/g, ' ').trim());
  const oemMatches = text.match(/\b[A-Z]{0,4}\d{7,13}\b/g) || [];
  for (const m of oemMatches) {
    if (!/^0\d{9}$/.test(m.replace(/\s/g, ''))) refs.add(m);
  }
  return Array.from(refs);
}

function extractManufacturer(rawText) {
  const text = rawText.toUpperCase();
  for (const name of KNOWN_MANUFACTURERS) if (text.includes(name)) return name;
  return null;
}

function extractPartTypeHint(rawText) {
  const compact = rawText.replace(/[\s.]/g, '');
  for (const { prefix, label } of BOSCH_PREFIX_HINTS) if (compact.includes(prefix)) return label;
  return null;
}

function titleCase(str) {
  return str.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.substr(1).toLowerCase());
}

// Lê a etiqueta com o Tesseract a correr localmente no telemóvel (os
// ficheiros de OCR estão em vendor/tesseract/, servidos pelo mesmo site -
// nada é enviado para a internet).
async function readLabel(blob) {
  const { data } = await Tesseract.recognize(blob, 'eng', {
    workerPath: 'vendor/tesseract/worker.min.js',
    corePath: 'vendor/tesseract/tesseract-core-lstm.wasm.js',
    langPath: 'vendor/tesseract/lang',
    gzip: true,
    cacheMethod: 'none',
    errorHandler: () => {},
  });
  const rawText = normalizeText(data.text || '');
  return {
    rawText,
    manufacturer: extractManufacturer(rawText),
    partTypeHint: extractPartTypeHint(rawText),
    referenceCandidates: extractReferences(rawText),
  };
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

function switchToTab(name) {
  tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  tabPanels.forEach((p) => p.classList.toggle('active', p.id === `tab-${name}`));
  if (name === 'catalogo') loadParts();
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => switchToTab(btn.dataset.tab));
});

// ---------------------------------------------------------------------------
// Captura de fotos (frente, trás, etiqueta)
// ---------------------------------------------------------------------------
const STEP_LABELS = ['front', 'back', 'label'];
const STEP_HINTS = {
  front: 'Aponte à frente da peça e tire a foto.',
  back: 'Vire a peça e fotografe a parte de trás.',
  label: 'Fotografe a etiqueta com as referências (a app vai tentar lê-la automaticamente).',
};

const video = document.getElementById('camera-video');
const canvas = document.getElementById('camera-canvas');
const shotPreview = document.getElementById('shot-preview');
const btnShoot = document.getElementById('btn-shoot');
const btnRetake = document.getElementById('btn-retake');
const btnContinue = document.getElementById('btn-continue');
const captureHint = document.getElementById('capture-hint');
const cameraError = document.getElementById('camera-error');
const captureStage = document.getElementById('capture-stage');
const partForm = document.getElementById('part-form');
const saveSuccess = document.getElementById('save-success');

let stream = null;
let shots = {};

// Fotos que ainda faltam tirar com a câmara, por esta ordem. Normalmente as
// 3; quando se vem da "Verificar peça" com a etiqueta já fotografada, fica
// só ['front', 'back'].
let cameraQueue = ['front', 'back', 'label'];
let queuePos = 0;

function currentCameraStep() {
  return cameraQueue[queuePos];
}

function setStepUi() {
  const steps = document.querySelectorAll('.step');
  const confirming = captureStage.hidden;
  STEP_LABELS.forEach((label, i) => {
    steps[i].classList.remove('active', 'done');
    if (shots[label]) steps[i].classList.add('done');
    else if (!confirming && label === currentCameraStep()) steps[i].classList.add('active');
  });
  steps[3].classList.remove('active', 'done');
  if (confirming) steps[3].classList.add('active');
  captureHint.textContent = STEP_HINTS[currentCameraStep()] || '';
}

async function startCamera() {
  cameraError.hidden = true;
  video.hidden = false;
  shotPreview.hidden = true;
  btnShoot.hidden = false;
  btnRetake.hidden = true;
  btnContinue.hidden = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    video.srcObject = stream;
  } catch (err) {
    console.error(err);
    cameraError.hidden = false;
    cameraError.textContent =
      'Não foi possível aceder à câmara. Verifique se deu permissão à app e que está a aceder pelo link https.';
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
}

btnShoot.addEventListener('click', () => {
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 960;
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(video, 0, 0, w, h);
  canvas.toBlob(
    (blob) => {
      shots[currentCameraStep()] = blob;
      shotPreview.src = URL.createObjectURL(blob);
      shotPreview.hidden = false;
      video.hidden = true;
      btnShoot.hidden = true;
      btnRetake.hidden = false;
      btnContinue.hidden = false;
    },
    'image/jpeg',
    0.9
  );
});

btnRetake.addEventListener('click', () => startCamera());

btnContinue.addEventListener('click', async () => {
  stopCamera();
  queuePos += 1;
  if (queuePos < cameraQueue.length) {
    setStepUi();
    startCamera();
  } else {
    captureStage.hidden = true;
    setStepUi();
    await showForm();
  }
});

// ---------------------------------------------------------------------------
// Formulário + OCR
// ---------------------------------------------------------------------------
const ocrStatus = document.getElementById('ocr-status');
const ocrResult = document.getElementById('ocr-result');
const ocrRawText = document.getElementById('ocr-raw-text');
const refCandidates = document.getElementById('ref-candidates');
const fieldPartType = document.getElementById('field-partType');
const fieldManufacturer = document.getElementById('field-manufacturer');
const fieldRef1 = document.getElementById('field-ref1');
const fieldRef2 = document.getElementById('field-ref2');
const saveError = document.getElementById('save-error');

// Quando se vem da "Verificar peça", a etiqueta já foi lida por lá - não
// vale a pena voltar a correr o OCR na mesma foto.
let ocrDataCache = null;

async function showForm() {
  document.getElementById('thumb-front').src = URL.createObjectURL(shots.front);
  document.getElementById('thumb-back').src = URL.createObjectURL(shots.back);
  document.getElementById('thumb-label').src = URL.createObjectURL(shots.label);

  partForm.hidden = false;
  saveError.hidden = true;
  ocrResult.hidden = true;
  refCandidates.hidden = true;
  refCandidates.innerHTML = '';
  ocrStatus.hidden = false;
  ocrStatus.textContent = 'A ler a etiqueta… (a primeira vez demora mais, entretanto descarrega os ficheiros de OCR)';

  try {
    const data = ocrDataCache || (await readLabel(shots.label));
    ocrDataCache = null;
    ocrStatus.hidden = true;

    if (data.rawText) {
      ocrResult.hidden = false;
      ocrRawText.textContent = data.rawText;
    }
    if (data.manufacturer) fieldManufacturer.value = titleCase(data.manufacturer);
    if (data.partTypeHint) fieldPartType.value = data.partTypeHint;
    if (data.referenceCandidates.length) {
      const [first, second] = data.referenceCandidates;
      if (first) fieldRef1.value = first.replace(/\s+/g, '');
      if (second) fieldRef2.value = second;

      refCandidates.hidden = false;
      data.referenceCandidates.forEach((ref) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = ref;
        b.addEventListener('click', () => {
          if (!fieldRef1.value) fieldRef1.value = ref.replace(/\s+/g, '');
          else fieldRef2.value = ref.replace(/\s+/g, '');
        });
        refCandidates.appendChild(b);
      });
    }
  } catch (err) {
    console.error(err);
    ocrStatus.hidden = true;
  }
}

partForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  saveError.hidden = true;

  const partType = fieldPartType.value.trim();
  const manufacturer = fieldManufacturer.value.trim();
  if (!partType || !manufacturer) {
    saveError.hidden = false;
    saveError.textContent = 'Tipo de peça e fabricante são obrigatórios.';
    return;
  }

  const part = {
    id: crypto.randomUUID(),
    partType,
    manufacturer,
    brand: document.getElementById('field-brand').value.trim(),
    model: document.getElementById('field-model').value.trim(),
    ref1: fieldRef1.value.trim(),
    ref2: fieldRef2.value.trim(),
    quantity: Math.max(0, Math.trunc(Number(document.getElementById('field-quantity').value) || 0)),
    notes: document.getElementById('field-notes').value.trim(),
    images: { front: shots.front, back: shots.back, label: shots.label },
    createdAt: new Date().toISOString(),
  };

  try {
    await window.PartsDB.createPart(part);
    partForm.hidden = true;
    saveSuccess.hidden = false;
  } catch (err) {
    console.error(err);
    saveError.hidden = false;
    saveError.textContent = 'Erro ao guardar a peça neste telemóvel.';
  }
});

document.getElementById('btn-cancel').addEventListener('click', resetCaptureFlow);
document.getElementById('btn-new-another').addEventListener('click', resetCaptureFlow);

function resetCaptureFlow() {
  shots = {};
  ocrDataCache = null;
  cameraQueue = ['front', 'back', 'label'];
  queuePos = 0;
  setStepUi();
  partForm.reset();
  partForm.hidden = true;
  saveSuccess.hidden = true;
  captureStage.hidden = false;
  startCamera();
}

// Chamado a partir da "Verificar peça" quando a etiqueta já foi lida por lá:
// só falta fotografar a frente e a trás.
function startNewPartWithLabel(labelBlob, ocrData) {
  shots = { label: labelBlob };
  ocrDataCache = ocrData || {};
  cameraQueue = ['front', 'back'];
  queuePos = 0;
  switchToTab('novo');
  partForm.reset();
  partForm.hidden = true;
  saveSuccess.hidden = true;
  captureStage.hidden = false;
  setStepUi();
  startCamera();
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------
const partsGrid = document.getElementById('parts-grid');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');
const filterPartType = document.getElementById('filter-partType');
const filterManufacturer = document.getElementById('filter-manufacturer');

let allParts = [];

async function loadParts() {
  allParts = await window.PartsDB.listParts();
  populateFilterOptions();
  renderParts();
}

function populateFilterOptions() {
  const types = Array.from(new Set(allParts.map((p) => p.partType).filter(Boolean))).sort();
  const manufacturers = Array.from(new Set(allParts.map((p) => p.manufacturer).filter(Boolean))).sort();
  fillSelect(filterPartType, types, 'Todos os tipos');
  fillSelect(filterManufacturer, manufacturers, 'Todos os fabricantes');
}

function fillSelect(select, values, placeholder) {
  const current = select.value;
  select.innerHTML = `<option value="">${placeholder}</option>`;
  values.forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });
  select.value = current;
}

function renderParts() {
  const q = searchInput.value.trim().toLowerCase();
  const typeFilter = filterPartType.value;
  const manufacturerFilter = filterManufacturer.value;

  const filtered = allParts.filter((p) => {
    if (typeFilter && p.partType !== typeFilter) return false;
    if (manufacturerFilter && p.manufacturer !== manufacturerFilter) return false;
    if (q) {
      const haystack = [p.ref1, p.ref2, p.manufacturer, p.brand, p.model, p.partType, p.notes]
        .filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  partsGrid.innerHTML = '';
  emptyState.hidden = filtered.length > 0;
  filtered.forEach((part) => partsGrid.appendChild(renderPartCard(part)));
}

function renderPartCard(part) {
  const card = document.createElement('div');
  card.className = 'part-card';

  const img = document.createElement('img');
  img.src = URL.createObjectURL(part.images.front);
  img.alt = part.partType;
  img.addEventListener('click', () => openLightbox(img.src));
  card.appendChild(img);

  const body = document.createElement('div');
  body.className = 'body';
  body.innerHTML = `
    <div class="title">${escapeHtml(part.partType)}</div>
    <div class="muted">${escapeHtml(part.manufacturer)} · ${escapeHtml(part.brand)} ${escapeHtml(part.model)}</div>
    <div class="refs">
      ${part.ref1 ? `<div>Ref1: ${escapeHtml(part.ref1)}</div>` : ''}
      ${part.ref2 ? `<div>Ref2: ${escapeHtml(part.ref2)}</div>` : ''}
    </div>
  `;

  const qtyRow = document.createElement('div');
  qtyRow.className = 'qty-row';
  const minusBtn = document.createElement('button');
  minusBtn.textContent = '−';
  const qtyVal = document.createElement('span');
  qtyVal.className = 'qty-val';
  qtyVal.textContent = part.quantity;
  const plusBtn = document.createElement('button');
  plusBtn.textContent = '+';
  minusBtn.addEventListener('click', () => changeQuantity(part, -1, qtyVal));
  plusBtn.addEventListener('click', () => changeQuantity(part, 1, qtyVal));
  qtyRow.append(minusBtn, qtyVal, plusBtn);
  body.appendChild(qtyRow);

  const actions = document.createElement('div');
  actions.className = 'card-actions';
  const delBtn = document.createElement('button');
  delBtn.textContent = 'Eliminar';
  delBtn.addEventListener('click', () => deletePart(part.id));
  actions.appendChild(delBtn);
  body.appendChild(actions);

  card.appendChild(body);
  return card;
}

async function changeQuantity(part, delta, qtyEl) {
  const newQty = Math.max(0, part.quantity + delta);
  await window.PartsDB.updatePart(part.id, { quantity: newQty });
  part.quantity = newQty;
  qtyEl.textContent = newQty;
}

async function deletePart(id) {
  if (!confirm('Eliminar esta peça e as respetivas fotos?')) return;
  await window.PartsDB.deletePart(id);
  allParts = allParts.filter((p) => p.id !== id);
  renderParts();
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

searchInput.addEventListener('input', renderParts);
filterPartType.addEventListener('change', renderParts);
filterManufacturer.addEventListener('change', renderParts);

// ---------------------------------------------------------------------------
// Verificar peça (foto avulsa: câmara ou upload de foto externa, ex. de um
// cliente) — lê a etiqueta e diz se a peça já está no catálogo.
// ---------------------------------------------------------------------------
const checkInput = document.getElementById('check-photo-input');
const checkPreview = document.getElementById('check-preview');
const checkStatus = document.getElementById('check-status');
const checkResults = document.getElementById('check-results');

function normalizeRef(ref) {
  return String(ref || '').replace(/\s+/g, '').toUpperCase();
}

function findMatches(parts, referenceCandidates) {
  const normalizedCandidates = referenceCandidates.map(normalizeRef).filter(Boolean);
  if (!normalizedCandidates.length) return [];
  return parts.filter((p) => {
    const partRefs = [normalizeRef(p.ref1), normalizeRef(p.ref2)].filter(Boolean);
    return partRefs.some((r) => normalizedCandidates.includes(r));
  });
}

document.getElementById('btn-check-photo').addEventListener('click', () => checkInput.click());

checkInput.addEventListener('change', async () => {
  const file = checkInput.files[0];
  if (!file) return;

  checkPreview.src = URL.createObjectURL(file);
  checkPreview.hidden = false;
  checkResults.innerHTML = '';
  checkStatus.hidden = false;
  checkStatus.textContent = 'A ler a foto…';

  try {
    const data = await readLabel(file);
    checkStatus.hidden = true;
    const parts = await window.PartsDB.listParts();
    const matches = findMatches(parts, data.referenceCandidates || []);
    renderCheckResults(file, data, matches);
  } catch (err) {
    console.error(err);
    checkStatus.hidden = true;
    checkResults.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'error';
    p.textContent = 'Não foi possível ler esta foto.';
    checkResults.appendChild(p);
  } finally {
    checkInput.value = '';
  }
});

function renderCheckResults(file, data, matches) {
  checkResults.innerHTML = '';

  if (data.rawText) {
    const raw = document.createElement('p');
    raw.className = 'ocr-raw';
    raw.textContent = `Texto lido: ${data.rawText}`;
    checkResults.appendChild(raw);
  }

  if (matches.length) {
    const heading = document.createElement('p');
    heading.textContent =
      matches.length === 1
        ? 'Esta peça já existe no catálogo:'
        : `Encontradas ${matches.length} peças com estas referências:`;
    checkResults.appendChild(heading);

    matches.forEach((part) => {
      const card = document.createElement('div');
      card.className = 'part-card';

      const img = document.createElement('img');
      img.src = URL.createObjectURL(part.images.front);
      img.alt = part.partType;
      card.appendChild(img);

      const body = document.createElement('div');
      body.className = 'body';
      body.innerHTML = `
        <div class="title">${escapeHtml(part.partType)}</div>
        <div class="muted">${escapeHtml(part.manufacturer)} · ${escapeHtml(part.brand)} ${escapeHtml(part.model)}</div>
        <div class="refs">
          ${part.ref1 ? `<div>Ref1: ${escapeHtml(part.ref1)}</div>` : ''}
          ${part.ref2 ? `<div>Ref2: ${escapeHtml(part.ref2)}</div>` : ''}
        </div>
        <div class="muted">Em stock: <strong class="check-qty">${part.quantity}</strong></div>
      `;

      const actions = document.createElement('div');
      actions.className = 'form-actions';
      const addOneBtn = document.createElement('button');
      addOneBtn.type = 'button';
      addOneBtn.className = 'btn btn-primary';
      addOneBtn.textContent = '+1 ao stock';
      addOneBtn.addEventListener('click', async () => {
        const qtyEl = body.querySelector('.check-qty');
        await changeQuantity(part, 1, qtyEl);
        addOneBtn.textContent = 'Adicionado ✓';
        addOneBtn.disabled = true;
      });
      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'btn';
      viewBtn.textContent = 'Ver no catálogo';
      viewBtn.addEventListener('click', () => {
        switchToTab('catalogo');
        searchInput.value = part.ref1 || part.ref2 || '';
        renderParts();
      });
      actions.append(addOneBtn, viewBtn);
      body.appendChild(actions);

      card.appendChild(body);
      checkResults.appendChild(card);
    });
  } else {
    const p = document.createElement('p');
    p.textContent =
      data.referenceCandidates && data.referenceCandidates.length
        ? `Não encontrei nenhuma peça no catálogo com a(s) referência(s) ${data.referenceCandidates.join(', ')}.`
        : 'Não consegui ler nenhuma referência nesta foto.';
    checkResults.appendChild(p);
  }

  const bottomActions = document.createElement('div');
  bottomActions.className = 'form-actions';

  const addNewBtn = document.createElement('button');
  addNewBtn.type = 'button';
  addNewBtn.className = 'btn btn-primary';
  addNewBtn.textContent = '➕ Adicionar como peça nova';
  addNewBtn.addEventListener('click', () => startNewPartWithLabel(file, data));

  const searchBtn = document.createElement('button');
  searchBtn.type = 'button';
  searchBtn.className = 'btn';
  searchBtn.textContent = '🔎 Procurar no catálogo';
  searchBtn.addEventListener('click', () => {
    switchToTab('catalogo');
    searchInput.value = ((data.referenceCandidates && data.referenceCandidates[0]) || '').replace(/\s+/g, '');
    renderParts();
  });

  bottomActions.append(addNewBtn, searchBtn);
  checkResults.appendChild(bottomActions);
}

// ---------------------------------------------------------------------------
// Exportar cópia de segurança (ficheiro .zip com fotos + dados)
// ---------------------------------------------------------------------------
document.getElementById('btn-export').addEventListener('click', async () => {
  const btn = document.getElementById('btn-export');
  btn.disabled = true;
  btn.textContent = 'A preparar cópia…';
  try {
    const parts = await window.PartsDB.listParts();
    const zip = new window.ZipWriter();
    const manifest = [];

    for (const part of parts) {
      const folder = `${slugify(part.manufacturer)}/${slugify(part.partType)}/${slugify(`${part.brand}-${part.model}`)}/${part.id}`;
      const entry = { ...part, images: {} };
      for (const key of ['front', 'back', 'label']) {
        const buf = new Uint8Array(await part.images[key].arrayBuffer());
        const filename = `${folder}/${key}.jpg`;
        zip.addFile(filename, buf);
        entry.images[key] = filename;
      }
      manifest.push(entry);
    }
    zip.addFile('pecas.json', new TextEncoder().encode(JSON.stringify(manifest, null, 2)));

    const blob = zip.build();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `catalogo-pecas-${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (err) {
    console.error(err);
    alert('Não foi possível criar a cópia de segurança.');
  } finally {
    btn.disabled = false;
    btn.textContent = '⬇️ Exportar cópia de segurança';
  }
});

function slugify(value) {
  return String(value || 'diverso')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'diverso';
}

// ---------------------------------------------------------------------------
// Lightbox
// ---------------------------------------------------------------------------
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
document.getElementById('lightbox-close').addEventListener('click', () => (lightbox.hidden = true));
lightbox.addEventListener('click', (e) => { if (e.target === lightbox) lightbox.hidden = true; });
function openLightbox(src) {
  lightboxImg.src = src;
  lightbox.hidden = false;
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js').catch(() => {});
}

setStepUi();
startCamera();
