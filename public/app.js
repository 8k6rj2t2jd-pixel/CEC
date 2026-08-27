'use strict';

const logoImg = document.getElementById('logo-img');
if (logoImg) logoImg.addEventListener('error', () => logoImg.remove(), { once: true });

// ---------------------------------------------------------------------------
// Ícones
// ---------------------------------------------------------------------------
// Desenhos em SVG em vez de emojis: aparecem exatamente iguais em todos os
// telemóveis e computadores (os emojis mudam de forma conforme o sistema) e
// herdam a cor e o tamanho do texto à volta. Ficam aqui dentro da app, sem
// depender de nenhum site externo - o que também respeita as regras de
// segurança (CSP) que impedem carregar seja o que for de fora.
const ICON_PATHS = {
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.2 2.4 2.4 4.6-4.9"/>',
  box: '<path d="M20.5 8.4v7.2a1.8 1.8 0 0 1-.9 1.6l-6.7 3.7a1.8 1.8 0 0 1-1.8 0l-6.7-3.7a1.8 1.8 0 0 1-.9-1.6V8.4a1.8 1.8 0 0 1 .9-1.6l6.7-3.7a1.8 1.8 0 0 1 1.8 0l6.7 3.7a1.8 1.8 0 0 1 .9 1.6Z"/><path d="m3.8 7.5 8.2 4.6 8.2-4.6"/><path d="M12 21V12.1"/>',
  folder: '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.2a1.5 1.5 0 0 1 1.2.6l1 1.3a1.5 1.5 0 0 0 1.2.6h6.4A1.5 1.5 0 0 1 20 10v7.5a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 3 17.5Z"/>',
  folderOpen: '<path d="M3 17.5V7.5A1.5 1.5 0 0 1 4.5 6h4.2a1.5 1.5 0 0 1 1.2.6l1 1.3a1.5 1.5 0 0 0 1.2.6h6.4A1.5 1.5 0 0 1 20 10v1"/><path d="m3 17.5 2-6a1.5 1.5 0 0 1 1.4-1h14a1.5 1.5 0 0 1 1.4 2l-1.8 5.5a1.5 1.5 0 0 1-1.4 1H4.5A1.5 1.5 0 0 1 3 17.5Z"/>',
  file: '<path d="M14 3H7a1.8 1.8 0 0 0-1.8 1.8v14.4A1.8 1.8 0 0 0 7 21h10a1.8 1.8 0 0 0 1.8-1.8V7.8Z"/><path d="M13.8 3v3.8a1.4 1.4 0 0 0 1.4 1.4h3.6"/>',
  fileText: '<path d="M14 3H7a1.8 1.8 0 0 0-1.8 1.8v14.4A1.8 1.8 0 0 0 7 21h10a1.8 1.8 0 0 0 1.8-1.8V7.8Z"/><path d="M13.8 3v3.8a1.4 1.4 0 0 0 1.4 1.4h3.6"/><path d="M8.6 13.2h6.8M8.6 16.6h4.6"/>',
  sheet: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9.6h16M4 15.2h16M9.6 4v16"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.2"/><circle cx="9" cy="9.6" r="1.5"/><path d="m4.2 17.4 4.4-4.2a1.6 1.6 0 0 1 2.2 0l3 2.9M14.4 15l1.6-1.5a1.6 1.6 0 0 1 2.2 0l1.6 1.5"/>',
  archive: '<rect x="3" y="4" width="18" height="4.5" rx="1.2"/><path d="M4.8 8.5v10a1.5 1.5 0 0 0 1.5 1.5h11.4a1.5 1.5 0 0 0 1.5-1.5v-10"/><path d="M10.2 12.6h3.6"/>',
  drive: '<rect x="3" y="4.5" width="18" height="15" rx="2.2"/><path d="M3 12.6h18"/><circle cx="6.9" cy="16.2" r="1"/><path d="M10.2 16.2h7.2"/><path d="M8.4 4.5v8.1M15.6 4.5v8.1"/>',
  paperclip: '<path d="M20.5 11.6 12.4 19.7a5 5 0 0 1-7.1-7.1l8.2-8.2a3.4 3.4 0 0 1 4.8 4.8l-8.1 8.1a1.7 1.7 0 0 1-2.4-2.4l7.5-7.4"/>',
  star: '<path d="m12 3.4 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.5l5.8-.8Z"/>',
  externalLink: '<path d="M14.5 3.5H20a.5.5 0 0 1 .5.5v5.5"/><path d="M20.5 3.5 12 12"/><path d="M18.5 13.6v4.9a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2h4.9"/>',
  download: '<path d="M20.5 15.4v3.1a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-3.1"/><path d="m7.6 10.6 4.4 4.4 4.4-4.4"/><path d="M12 15V3.5"/>',
  eye: '<path d="M2.6 12S6 5.6 12 5.6 21.4 12 21.4 12 18 18.4 12 18.4 2.6 12 2.6 12Z"/><circle cx="12" cy="12" r="3.1"/>',
  eyeOff: '<path d="M10.7 5.8A9.6 9.6 0 0 1 12 5.6c6 0 9.4 6.4 9.4 6.4a17.6 17.6 0 0 1-2.6 3.5M6.8 6.9A17.4 17.4 0 0 0 2.6 12s3.4 6.4 9.4 6.4a9.4 9.4 0 0 0 4.2-.9"/><path d="M10 10a2.9 2.9 0 0 0 4 4"/><path d="m3 3 18 18"/>',
  warning: '<path d="M10.6 4.2 2.9 17.6A1.6 1.6 0 0 0 4.3 20h15.4a1.6 1.6 0 0 0 1.4-2.4L13.4 4.2a1.6 1.6 0 0 0-2.8 0Z"/><path d="M12 9.4v4M12 16.8h.01"/>',
  camera: '<path d="M14.6 4.6H9.4L8.1 6.6H4.8a1.9 1.9 0 0 0-1.9 1.9v9.1a1.9 1.9 0 0 0 1.9 1.9h14.4a1.9 1.9 0 0 0 1.9-1.9V8.5a1.9 1.9 0 0 0-1.9-1.9h-3.3Z"/><circle cx="12" cy="13" r="3.3"/>',
};

// Devolve o SVG do ícone como texto, para se poder usar tanto em innerHTML
// como a criar elementos. "size" em pixéis; a cor vem sempre do texto à volta.
function icon(name, size = 16) {
  const d = ICON_PATHS[name];
  if (!d) return '';
  return (
    `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ` +
    `aria-hidden="true" focusable="false">${d}</svg>`
  );
}

// Versão para quando é preciso um elemento a sério (ex: appendChild).
function iconEl(name, size = 16) {
  const span = document.createElement('span');
  span.className = 'icon-wrap';
  span.innerHTML = icon(name, size);
  return span.firstChild;
}

// ---------------------------------------------------------------------------
// Redimensionar fotos antes de enviar - poupa espaço na cloud (Cloudinary)
// sem perda visível de qualidade para ver no catálogo. Não se aplica aos
// ficheiros do repositório de etiquetas (podem ser PDFs de impressão, que
// precisam de ficar tal como estão).
// ---------------------------------------------------------------------------
const MAX_PHOTO_DIMENSION = 1600;
const PHOTO_JPEG_QUALITY = 0.82;

async function resizeImageFile(file, maxDimension = MAX_PHOTO_DIMENSION, quality = PHOTO_JPEG_QUALITY) {
  if (!file || !file.type || !file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    if (Math.max(width, height) > maxDimension) {
      const scale = maxDimension / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    if (bitmap.close) bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob || file;
  } catch (err) {
    console.error('Falha ao redimensionar a foto, a enviar o original:', err);
    return file;
  }
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');
const catalogoGroupBtn = document.getElementById('catalogo-group-btn');
const catalogoSubnav = document.getElementById('catalogo-subnav');

function switchToTab(name) {
  const inCatalogoGroup = name === 'catalogo' || name === 'catalogo-ficheiros';

  tabButtons.forEach((b) => {
    if (b === catalogoGroupBtn) return; // tratado à parte, em baixo
    b.classList.toggle('active', b.dataset.tab === name);
  });
  catalogoGroupBtn.classList.toggle('active', inCatalogoGroup);
  catalogoSubnav.hidden = !inCatalogoGroup;

  tabPanels.forEach((p) => p.classList.toggle('active', p.id === `tab-${name}`));

  if (inCatalogoGroup) loadParts();
  if (name === 'etiquetas') loadLabels();
  if (name === 'envios') loadShipments();
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => switchToTab(btn.dataset.tab));
});

// ---------------------------------------------------------------------------
// Interruptor Centralina/Quadrante (reutilizado no formulario e no catalogo)
// ---------------------------------------------------------------------------
function wireCategoryToggle(container, onChange) {
  const buttons = container.querySelectorAll('.category-btn');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.toggle('active', b === btn));
      onChange(btn.dataset.category);
    });
  });
}

const categoryToggle = document.getElementById('category-toggle');
const fieldCategory = document.getElementById('field-category');
wireCategoryToggle(categoryToggle, (category) => {
  fieldCategory.value = category;
});

// ---------------------------------------------------------------------------
// Captura de fotos (frente, trás, etiqueta)
// ---------------------------------------------------------------------------
const STEP_LABELS = ['front', 'back', 'label'];
const STEP_HINTS = {
  front: 'Aponte à frente da peça e tire a foto.',
  back: 'Vire a peça e fotografe a parte de trás.',
  label: 'Aproxime-se bem da etiqueta, para o texto ocupar o máximo da foto (a app vai tentar lê-la automaticamente).',
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

const thumbs = {
  front: document.getElementById('thumb-front'),
  back: document.getElementById('thumb-back'),
  label: document.getElementById('thumb-label'),
};

function setThumb(step, blob) {
  const img = thumbs[step];
  if (!img) return;
  img.src = URL.createObjectURL(blob);
  img.hidden = false;
}

function clearThumbs() {
  Object.values(thumbs).forEach((img) => {
    img.src = '';
    img.hidden = true;
  });
}

let stream = null;
let shots = {}; // { front: Blob, back: Blob, label: Blob }

// Fotos que ainda faltam tirar com a câmara, por esta ordem.
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
      'Não foi possível aceder à câmara. Verifique as permissões do browser e se está a aceder por HTTPS ou localhost.';
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
}

let ocrPromise = null;

function runOcr(blob) {
  const fd = new FormData();
  fd.append('label', blob, 'label.jpg');
  return fetch('/api/ocr', { method: 'POST', body: fd }).then((resp) =>
    resp.json().then((data) => ({ ok: resp.ok, data }))
  );
}

btnShoot.addEventListener('click', () => {
  const nativeW = video.videoWidth || 1280;
  const nativeH = video.videoHeight || 960;
  // Tira a foto já no tamanho reduzido (poupa espaço na cloud, sem perda
  // visível de qualidade para ver no catálogo).
  const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(nativeW, nativeH));
  const w = Math.round(nativeW * scale);
  const h = Math.round(nativeH * scale);
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(video, 0, 0, w, h);
  canvas.toBlob(
    (blob) => {
      const step = currentCameraStep();
      shots[step] = blob;
      setThumb(step, blob);
      shotPreview.src = URL.createObjectURL(blob);
      shotPreview.hidden = false;
      video.hidden = true;
      btnShoot.hidden = true;
      btnRetake.hidden = false;
      btnContinue.hidden = false;

      // Já vai lendo a etiqueta em segundo plano assim que a foto é tirada,
      // para o formulário aparecer pré-preenchido mais depressa a seguir.
      if (step === 'label') {
        ocrPromise = runOcr(blob).catch((err) => {
          console.error(err);
          return { ok: false, data: {} };
        });
      }
    },
    'image/jpeg',
    PHOTO_JPEG_QUALITY
  );
});

btnRetake.addEventListener('click', () => {
  if (currentCameraStep() === 'label') ocrPromise = null;
  startCamera();
});

btnContinue.addEventListener('click', async () => {
  stopCamera();
  queuePos += 1;
  if (queuePos < cameraQueue.length) {
    setStepUi();
    startCamera();
  } else {
    // Todas as fotos em falta foram tiradas -> mostrar formulário e OCR.
    captureStage.hidden = true;
    setStepUi();
    await showForm();
  }
});

document.getElementById('btn-skip-photos').addEventListener('click', async () => {
  stopCamera();
  captureStage.hidden = true;
  await showForm();
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

async function showForm() {
  partForm.hidden = false;
  saveError.hidden = true;
  ocrResult.hidden = true;
  refCandidates.hidden = true;
  refCandidates.innerHTML = '';

  if (!shots.label) {
    ocrStatus.hidden = true;
    return;
  }

  ocrStatus.hidden = false;
  ocrStatus.classList.remove('error');
  ocrStatus.textContent = 'A ler a etiqueta… (pode demorar alguns segundos)';

  try {
    if (!ocrPromise) ocrPromise = runOcr(shots.label).catch((err) => {
      console.error(err);
      return { ok: false, data: {} };
    });
    const { ok, data } = await ocrPromise;

    if (!ok) {
      ocrStatus.textContent = 'Não foi possível ler a etiqueta automaticamente. Preencha os campos à mão.';
      ocrStatus.classList.add('error');
      return;
    }

    let foundSomething = false;

    if (data.rawText) {
      ocrResult.hidden = false;
      ocrRawText.textContent = data.rawText;
    }
    if (data.manufacturer) {
      fieldManufacturer.value = titleCase(data.manufacturer);
      foundSomething = true;
    }
    if (data.partTypeHint) fieldPartType.value = data.partTypeHint;
    if (Array.isArray(data.referenceCandidates) && data.referenceCandidates.length) {
      foundSomething = true;
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
          else if (!fieldRef2.value) fieldRef2.value = ref.replace(/\s+/g, '');
          else fieldRef2.value = ref.replace(/\s+/g, '');
        });
        refCandidates.appendChild(b);
      });
    }

    if (foundSomething) {
      ocrStatus.hidden = true;
    } else {
      ocrStatus.textContent = 'Não foi possível identificar nada na etiqueta automaticamente. Preencha os campos à mão.';
      ocrStatus.classList.add('error');
    }
  } catch (err) {
    console.error(err);
    ocrStatus.textContent = 'Ocorreu um erro ao ler a etiqueta. Preencha os campos à mão.';
    ocrStatus.classList.add('error');
  }
}

function titleCase(str) {
  return str.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.substr(1).toLowerCase());
}

partForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  saveError.hidden = true;

  const fd = new FormData();
  if (shots.front) fd.append('front', shots.front, 'front.jpg');
  if (shots.back) fd.append('back', shots.back, 'back.jpg');
  if (shots.label) fd.append('label', shots.label, 'label.jpg');
  fd.append('category', fieldCategory.value);
  fd.append('partType', fieldPartType.value.trim());
  fd.append('manufacturer', fieldManufacturer.value.trim());
  fd.append('brand', document.getElementById('field-brand').value.trim());
  fd.append('model', document.getElementById('field-model').value.trim());
  fd.append('ref1', fieldRef1.value.trim());
  fd.append('ref2', fieldRef2.value.trim());
  fd.append('quantity', document.getElementById('field-quantity').value || '1');
  fd.append('box', document.getElementById('field-box').value.trim());
  fd.append('itemNumber', document.getElementById('field-item-number').value.trim());
  fd.append('notes', document.getElementById('field-notes').value.trim());

  try {
    const resp = await fetch('/api/parts', { method: 'POST', body: fd });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Erro ao guardar.');
    partForm.hidden = true;
    saveSuccess.hidden = false;
  } catch (err) {
    saveError.hidden = false;
    saveError.textContent = err.message;
  }
});

document.getElementById('btn-cancel').addEventListener('click', resetCaptureFlow);
document.getElementById('btn-new-another').addEventListener('click', resetCaptureFlow);

function resetCaptureFlow() {
  shots = {};
  ocrPromise = null;
  cameraQueue = ['front', 'back', 'label'];
  queuePos = 0;
  clearThumbs();
  setStepUi();
  partForm.reset();
  categoryToggle.querySelectorAll('.category-btn').forEach((b) => b.classList.toggle('active', b.dataset.category === 'centralina'));
  partForm.hidden = true;
  saveSuccess.hidden = true;
  captureStage.hidden = false;
  resetUploadExistingBlock();
  startCamera();
}

// ---------------------------------------------------------------------------
// Carregar fotos já tiradas (alternativa a usar a câmara, direto em cada
// caixa de foto) - se a foto "Etiqueta" for carregada aqui, a leitura
// automática (OCR) corre à mesma quando se avança para o formulário.
// ---------------------------------------------------------------------------
const btnContinueUpload = document.getElementById('btn-continue-upload');

function resetUploadExistingBlock() {
  document.querySelectorAll('.thumbs input[type=file]').forEach((input) => {
    input.value = '';
  });
  btnContinueUpload.hidden = true;
}

document.querySelectorAll('.thumbs input[type=file]').forEach((input) => {
  input.addEventListener('change', async () => {
    const slot = input.dataset.slot;
    const file = input.files[0];
    if (!file) return;
    const resized = await resizeImageFile(file);
    shots[slot] = resized;
    setThumb(slot, resized);
    setStepUi();
    btnContinueUpload.hidden = false;
  });
});

btnContinueUpload.addEventListener('click', async () => {
  stopCamera();
  captureStage.hidden = true;
  setStepUi();
  await showForm();
});

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------
const partsGrid = document.getElementById('parts-grid');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');
const filterPartType = document.getElementById('filter-partType');
const filterManufacturer = document.getElementById('filter-manufacturer');
const filterModel = document.getElementById('filter-model');
const filterPhoto = document.getElementById('filter-photo');

const statTotal = document.getElementById('stat-total');
const statStock = document.getElementById('stat-stock');
const statManufacturers = document.getElementById('stat-manufacturers');
const statTypes = document.getElementById('stat-types');

let allParts = [];
let categoryFilter = '';

const catalogCategoryToggle = document.getElementById('catalog-category-toggle');
wireCategoryToggle(catalogCategoryToggle, (category) => {
  categoryFilter = category;
  renderParts();
});

function partCategory(part) {
  return part.category || 'centralina';
}

async function loadParts() {
  const resp = await fetch('/api/parts');
  allParts = await resp.json();
  populateFilterOptions();
  updateStats();
  renderParts();
  renderFilesCatalog();
}

function updateStats() {
  statTotal.textContent = allParts.length;
  statStock.textContent = allParts.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);
  statManufacturers.textContent = new Set(allParts.map((p) => p.manufacturer).filter(Boolean)).size;
  statTypes.textContent = new Set(allParts.map((p) => p.partType).filter(Boolean)).size;
}

function populateFilterOptions() {
  const types = Array.from(new Set(allParts.map((p) => p.partType).filter(Boolean))).sort();
  const manufacturers = Array.from(new Set(allParts.map((p) => p.manufacturer).filter(Boolean))).sort();
  const models = Array.from(new Set(allParts.map((p) => p.model).filter(Boolean))).sort();

  fillSelect(filterPartType, types, 'Todos os tipos');
  fillSelect(filterManufacturer, manufacturers, 'Todos os fabricantes');
  fillSelect(filterModel, models, 'Todos os modelos');
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

function partHasPhoto(part) {
  return Boolean(part.images && (part.images.front || part.images.back || part.images.label));
}

function renderParts() {
  const q = searchInput.value.trim().toLowerCase();
  const typeFilter = filterPartType.value;
  const manufacturerFilter = filterManufacturer.value;
  const modelFilter = filterModel.value;
  const photoFilter = filterPhoto.value;

  const filtered = allParts.filter((p) => {
    if (categoryFilter && partCategory(p) !== categoryFilter) return false;
    if (typeFilter && p.partType !== typeFilter) return false;
    if (manufacturerFilter && p.manufacturer !== manufacturerFilter) return false;
    if (modelFilter && p.model !== modelFilter) return false;
    if (photoFilter === 'com' && !partHasPhoto(p)) return false;
    if (photoFilter === 'sem' && partHasPhoto(p)) return false;
    if (q) {
      const haystack = [p.ref1, p.ref2, p.manufacturer, p.brand, p.model, p.partType, p.box, p.itemNumber, p.notes]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  partsGrid.innerHTML = '';
  emptyState.hidden = filtered.length > 0;

  filtered.forEach((part) => {
    partsGrid.appendChild(renderPartCard(part));
  });
}

function renderPartCard(part) {
  const card = document.createElement('div');
  card.className = 'part-card';

  const photoKeys = ['front', 'back', 'label'].filter((key) => part.images && part.images[key] && part.images[key].url);
  if (photoKeys.length) {
    const img = document.createElement('img');
    img.src = part.images[photoKeys[0]].url;
    img.alt = part.partType;
    img.addEventListener('click', () => openLightbox(part));
    card.appendChild(img);
    if (photoKeys.length > 1) {
      const badge = document.createElement('span');
      badge.className = 'photo-count-badge';
      badge.innerHTML = `${icon('camera', 12)} ${photoKeys.length}`;
      card.appendChild(badge);
    }
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'no-photo';
    placeholder.textContent = 'Sem foto';
    card.appendChild(placeholder);
  }

  const body = document.createElement('div');
  body.className = 'body';
  body.innerHTML = `
    <div class="title">${escapeHtml(part.partType)}</div>
    <div class="muted">${escapeHtml(part.manufacturer)} · ${escapeHtml(part.brand)} ${escapeHtml(part.model)}</div>
    <div class="refs">
      ${part.ref1 ? `<div>Ref1: ${escapeHtml(part.ref1)}</div>` : ''}
      ${part.ref2 ? `<div>Ref2: ${escapeHtml(part.ref2)}</div>` : ''}
    </div>
    ${part.box ? `<div class="box-badge">${icon('box', 13)} Caixa ${escapeHtml(part.box)}</div>` : ''}
    ${part.itemNumber ? `<div class="num-badge">Nº ${escapeHtml(part.itemNumber)}</div>` : ''}
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
  const editBtn = document.createElement('button');
  editBtn.textContent = 'Editar';
  editBtn.addEventListener('click', () => openEditModal(part));
  actions.appendChild(editBtn);
  const delBtn = document.createElement('button');
  delBtn.className = 'card-delete';
  delBtn.textContent = 'Eliminar';
  delBtn.addEventListener('click', () => deletePart(part.id));
  actions.appendChild(delBtn);
  body.appendChild(actions);

  const filesBtn = document.createElement('button');
  filesBtn.type = 'button';
  filesBtn.className = 'card-files-btn';
  filesBtn.innerHTML = `${icon('folder', 14)} Ficheiros`;
  filesBtn.addEventListener('click', () => openFilesModal(part));
  body.appendChild(filesBtn);

  card.appendChild(body);
  return card;
}

async function changeQuantity(part, delta, qtyEl) {
  const newQty = Math.max(0, part.quantity + delta);
  const resp = await fetch(`/api/parts/${part.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quantity: newQty }),
  });
  if (resp.ok) {
    part.quantity = newQty;
    qtyEl.textContent = newQty;
  }
}

async function deletePart(id) {
  if (!confirm('Eliminar esta peça e as respetivas fotos?')) return;
  const resp = await fetch(`/api/parts/${id}`, { method: 'DELETE' });
  if (resp.ok) {
    allParts = allParts.filter((p) => p.id !== id);
    updateStats();
    renderParts();
  }
}

// ---------------------------------------------------------------------------
// Editar peça (dados + adicionar/trocar fotos)
// ---------------------------------------------------------------------------
const editOverlay = document.getElementById('edit-overlay');
const editForm = document.getElementById('edit-form');
const editError = document.getElementById('edit-error');
const editCategoryToggle = document.getElementById('edit-category-toggle');
const editFieldCategory = document.getElementById('edit-field-category');
const editThumbs = {
  front: document.getElementById('edit-thumb-front'),
  back: document.getElementById('edit-thumb-back'),
  label: document.getElementById('edit-thumb-label'),
};
const editFields = {
  partType: document.getElementById('edit-field-partType'),
  manufacturer: document.getElementById('edit-field-manufacturer'),
  brand: document.getElementById('edit-field-brand'),
  model: document.getElementById('edit-field-model'),
  ref1: document.getElementById('edit-field-ref1'),
  ref2: document.getElementById('edit-field-ref2'),
  quantity: document.getElementById('edit-field-quantity'),
  box: document.getElementById('edit-field-box'),
  itemNumber: document.getElementById('edit-field-item-number'),
  notes: document.getElementById('edit-field-notes'),
};

wireCategoryToggle(editCategoryToggle, (category) => {
  editFieldCategory.value = category;
});

let editingPartId = null;
let editingPart = null;
const editBadges = {
  front: document.getElementById('edit-badge-front'),
  back: document.getElementById('edit-badge-back'),
  label: document.getElementById('edit-badge-label'),
};
const editPendingPreviewUrls = {};
const editResizedFiles = {};

function clearEditPendingPreviews() {
  for (const key of Object.keys(editPendingPreviewUrls)) {
    URL.revokeObjectURL(editPendingPreviewUrls[key]);
    delete editPendingPreviewUrls[key];
  }
  for (const key of Object.keys(editResizedFiles)) delete editResizedFiles[key];
}

function openEditModal(part) {
  editingPartId = part.id;
  editingPart = part;
  editError.hidden = true;
  clearEditPendingPreviews();

  editFields.partType.value = part.partType || '';
  editFields.manufacturer.value = part.manufacturer || '';
  editFields.brand.value = part.brand || '';
  editFields.model.value = part.model || '';
  editFields.ref1.value = part.ref1 || '';
  editFields.ref2.value = part.ref2 || '';
  editFields.quantity.value = part.quantity || 0;
  editFields.box.value = part.box || '';
  editFields.itemNumber.value = part.itemNumber || '';
  editFields.notes.value = part.notes || '';

  const category = partCategory(part);
  editFieldCategory.value = category;
  editCategoryToggle.querySelectorAll('.category-btn').forEach((b) => b.classList.toggle('active', b.dataset.category === category));

  for (const key of ['front', 'back', 'label']) {
    const url = part.images && part.images[key] && part.images[key].url;
    const img = editThumbs[key];
    if (url) {
      img.src = url;
      img.hidden = false;
    } else {
      img.src = '';
      img.hidden = true;
    }
    editBadges[key].hidden = true;
  }
  editForm.querySelectorAll('.edit-photo-grid input[type=file]').forEach((input) => {
    input.value = '';
  });

  editOverlay.hidden = false;
}

function closeEditModal() {
  editOverlay.hidden = true;
  editingPartId = null;
  editingPart = null;
  clearEditPendingPreviews();
}

// ---------------------------------------------------------------------------
// Ficheiros anexados a uma peça (manuais, faturas, esquemas...) - modal
// próprio, aberto tanto pelo botão "Ficheiros" de cada peça no Catálogo
// simples como a partir do Catálogo de ficheiros.
// ---------------------------------------------------------------------------
const filesOverlay = document.getElementById('files-overlay');
const filesModalTitle = document.getElementById('files-modal-title');
const filesModalList = document.getElementById('files-modal-list');
const filesModalInput = document.getElementById('files-modal-input');
const filesModalFolderInput = document.getElementById('files-modal-folder-input');
const filesFolderLabel = document.getElementById('files-folder-label');
const filesModalStatus = document.getElementById('files-modal-status');
let filesModalPart = null;

// A escolha de uma pasta inteira so existe em browsers de computador; nos
// telemoveis o botao seria so uma armadilha (abre e nao deixa escolher nada).
if ('webkitdirectory' in document.createElement('input')) {
  filesFolderLabel.hidden = false;
}

const FILE_ICONS = {
  'application/pdf': 'file',
  'application/zip': 'archive',
  'application/x-zip-compressed': 'archive',
  'text/plain': 'fileText',
  'text/csv': 'sheet',
};
// Escolhe o desenho conforme o tipo de ficheiro, para se perceber de relance
// o que e cada anexo (um dump de centralina, uma fatura, uma foto...).
function fileIconNameFor(fileType, fileName) {
  if (fileType && fileType.startsWith('image/')) return 'image';
  if (fileType && fileType.includes('word')) return 'fileText';
  if (fileType && (fileType.includes('sheet') || fileType.includes('excel'))) return 'sheet';
  if (fileType && (fileType.includes('presentation') || fileType.includes('powerpoint'))) return 'sheet';
  if (/\.(bin|hex|ori|mod|eep|eeprom|frf|s19|dam|kp|a2l)$/i.test(fileName || '')) return 'drive';
  return FILE_ICONS[fileType] || 'paperclip';
}
function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderFilesModalList(files) {
  filesModalList.innerHTML = '';
  if (!files.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'Ainda não há ficheiros anexados a esta peça.';
    filesModalList.appendChild(empty);
    return;
  }
  files.forEach((file) => {
    const row = document.createElement('div');
    row.className = 'edit-file-row';

    const link = document.createElement('a');
    // Sempre através do próprio site: assim o ficheiro só chega a quem tem
    // sessão iniciada, e nunca circula um endereço que funcione sozinho.
    link.href = `/api/parts/${filesModalPart.id}/files/${file.id}/download`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'edit-file-link';
    link.title = file.fileName || '';
    link.innerHTML = `
      <span class="edit-file-icon">${icon(fileIconNameFor(file.fileType, file.fileName), 20)}</span>
      <span class="edit-file-info">
        <span class="edit-file-name">${escapeHtml(file.fileName || 'Ficheiro')}</span>
        <span class="edit-file-size">${formatFileSize(file.size)}</span>
      </span>
    `;
    row.appendChild(link);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'edit-file-delete';
    delBtn.innerHTML = icon('close', 14);
    delBtn.title = 'Eliminar ficheiro';
    delBtn.addEventListener('click', async () => {
      if (!confirm(`Eliminar "${file.fileName}"?`)) return;
      const resp = await fetch(`/api/parts/${filesModalPart.id}/files/${file.id}`, { method: 'DELETE' });
      const data = await resp.json();
      if (!resp.ok) {
        alert(data.error || 'Falha ao eliminar o ficheiro.');
        return;
      }
      filesModalPart.files = data.files || [];
      renderFilesModalList(filesModalPart.files);
      renderFilesCatalog();
    });
    row.appendChild(delBtn);

    filesModalList.appendChild(row);
  });
}

function openFilesModal(part) {
  filesModalPart = part;
  filesModalTitle.textContent = `Ficheiros — ${part.ref1 || part.ref2 || part.partType || 'peça'}`;
  filesModalInput.value = '';
  filesModalStatus.hidden = true;
  renderFilesModalList(part.files || []);
  filesOverlay.hidden = false;
}
function closeFilesModal() {
  filesOverlay.hidden = true;
  filesModalPart = null;
}
document.getElementById('files-modal-close').addEventListener('click', closeFilesModal);
filesOverlay.addEventListener('click', (e) => {
  if (e.target === filesOverlay) closeFilesModal();
});

const MAX_FILES_PER_UPLOAD = 60;

// Ao escolher uma pasta, o browser inclui tambem o lixo que o sistema
// operativo la deixa (.DS_Store no Mac, Thumbs.db no Windows) - nao vale a
// pena mandar isso para o servidor so para ser recusado.
function isJunkFile(file) {
  const name = (file.name || '').toLowerCase();
  return name.startsWith('.') || name === 'thumbs.db' || name === 'desktop.ini';
}

async function uploadPartFiles(input) {
  const chosen = Array.from(input.files || []);
  if (!chosen.length || !filesModalPart) return;

  const files = chosen.filter((f) => !isJunkFile(f));

  filesModalStatus.hidden = false;
  filesModalStatus.classList.remove('error');

  if (!files.length) {
    filesModalStatus.classList.add('error');
    filesModalStatus.textContent = 'Essa pasta não tem ficheiros que se possam guardar.';
    input.value = '';
    return;
  }

  if (files.length > MAX_FILES_PER_UPLOAD) {
    filesModalStatus.classList.add('error');
    filesModalStatus.textContent = `Escolha no máximo ${MAX_FILES_PER_UPLOAD} ficheiros de cada vez.`;
    input.value = '';
    return;
  }

  filesModalStatus.textContent = files.length === 1 ? 'A enviar…' : `A enviar ${files.length} ficheiros…`;

  const fd = new FormData();
  // Numa pasta, guarda-se o caminho relativo como nome (ex: "dumps/flash.bin")
  // para nao se perder de que subpasta veio cada ficheiro.
  files.forEach((file) => fd.append('file', file, file.webkitRelativePath || file.name));

  try {
    const resp = await fetch(`/api/parts/${filesModalPart.id}/files`, { method: 'POST', body: fd });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Falha ao enviar o ficheiro.');
    filesModalPart.files = data.files || [];
    renderFilesModalList(filesModalPart.files);
    renderFilesCatalog();
    if (data.skipped) {
      filesModalStatus.textContent =
        `${data.added} guardado(s). ${data.skipped} ficheiro(s) ignorado(s) por não serem de um tipo permitido.`;
    } else {
      filesModalStatus.hidden = true;
    }
  } catch (err) {
    filesModalStatus.classList.add('error');
    filesModalStatus.textContent = err.message;
  } finally {
    input.value = '';
  }
}

filesModalInput.addEventListener('change', () => uploadPartFiles(filesModalInput));
filesModalFolderInput.addEventListener('change', () => uploadPartFiles(filesModalFolderInput));

// ---------------------------------------------------------------------------
// Catálogo de ficheiros - lista as peças que já têm ficheiros anexados
// ---------------------------------------------------------------------------
const filesCatalogSearch = document.getElementById('files-catalog-search');
const filesCatalogList = document.getElementById('files-catalog-list');
const filesCatalogEmpty = document.getElementById('files-catalog-empty');

function renderFilesCatalog() {
  const q = filesCatalogSearch.value.trim().toLowerCase();
  const withFiles = allParts.filter((p) => p.files && p.files.length);
  const filtered = q
    ? withFiles.filter((p) => [p.ref1, p.ref2].filter(Boolean).some((r) => r.toLowerCase().includes(q)))
    : withFiles;

  filesCatalogList.innerHTML = '';
  filesCatalogEmpty.hidden = filtered.length > 0;

  filtered.forEach((part) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'files-catalog-item';
    row.innerHTML = `
      <span class="files-catalog-item-main">
        <span class="files-catalog-item-ref">${escapeHtml(part.ref1 || part.ref2 || part.partType || 'Sem referência')}</span>
        <span class="files-catalog-item-sub">${escapeHtml(part.manufacturer)}${part.brand ? ` · ${escapeHtml(part.brand)}` : ''}</span>
      </span>
      <span class="files-catalog-item-count">${part.files.length} ${part.files.length === 1 ? 'ficheiro' : 'ficheiros'}</span>
    `;
    row.addEventListener('click', () => openFilesModal(part));
    filesCatalogList.appendChild(row);
  });
}
filesCatalogSearch.addEventListener('input', renderFilesCatalog);

document.getElementById('edit-close').addEventListener('click', closeEditModal);
document.getElementById('edit-cancel').addEventListener('click', closeEditModal);

editForm.querySelectorAll('.edit-photo-grid input[type=file]').forEach((input) => {
  input.addEventListener('change', async () => {
    const slot = input.dataset.slot;
    const file = input.files[0];
    if (!file) return;
    const resized = await resizeImageFile(file);
    editResizedFiles[slot] = resized;
    if (editPendingPreviewUrls[slot]) URL.revokeObjectURL(editPendingPreviewUrls[slot]);
    const url = URL.createObjectURL(resized);
    editPendingPreviewUrls[slot] = url;
    editThumbs[slot].src = url;
    editThumbs[slot].hidden = false;
    editBadges[slot].hidden = false;
  });
});

editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  editError.hidden = true;

  const patch = {
    category: editFieldCategory.value,
    partType: editFields.partType.value.trim(),
    manufacturer: editFields.manufacturer.value.trim(),
    brand: editFields.brand.value.trim(),
    model: editFields.model.value.trim(),
    ref1: editFields.ref1.value.trim(),
    ref2: editFields.ref2.value.trim(),
    quantity: Number(editFields.quantity.value) || 0,
    box: editFields.box.value.trim(),
    itemNumber: editFields.itemNumber.value.trim(),
    notes: editFields.notes.value.trim(),
  };

  try {
    const resp = await fetch(`/api/parts/${editingPartId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Erro ao guardar alterações.');

    const photoInputs = Array.from(editForm.querySelectorAll('.edit-photo-grid input[type=file]')).filter((i) => i.files[0]);
    if (photoInputs.length) {
      const fd = new FormData();
      photoInputs.forEach((input) => {
        const slot = input.dataset.slot;
        fd.append(slot, editResizedFiles[slot] || input.files[0], `${slot}.jpg`);
      });
      const photoResp = await fetch(`/api/parts/${editingPartId}/photos`, { method: 'POST', body: fd });
      const photoData = await photoResp.json();
      if (!photoResp.ok) throw new Error(photoData.error || 'Erro ao guardar as fotos.');
    }

    closeEditModal();
    await loadParts();
  } catch (err) {
    editError.hidden = false;
    editError.textContent = err.message;
  }
});

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

searchInput.addEventListener('input', renderParts);
filterPartType.addEventListener('change', renderParts);
filterManufacturer.addEventListener('change', renderParts);
filterModel.addEventListener('change', renderParts);
filterPhoto.addEventListener('change', renderParts);

// ---------------------------------------------------------------------------
// Lightbox
// ---------------------------------------------------------------------------
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxPrev = document.getElementById('lightbox-prev');
const lightboxNext = document.getElementById('lightbox-next');
const lightboxCaption = document.getElementById('lightbox-caption');
const lightboxDownload = document.getElementById('lightbox-download');
const lightboxCloseBtn = document.getElementById('lightbox-close');
lightboxCloseBtn.innerHTML = icon('close', 20);
lightboxDownload.innerHTML = icon('download', 20);
lightboxCloseBtn.addEventListener('click', () => (lightbox.hidden = true));
// Nao deixa o clique no botao de transferir fechar a janela por baixo.
lightboxDownload.addEventListener('click', (e) => e.stopPropagation());
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) lightbox.hidden = true;
});

const PHOTO_SLOT_LABELS = { front: 'Frente', back: 'Trás', label: 'Etiqueta' };
let lightboxPhotos = [];
let lightboxIndex = 0;

function showLightboxPhoto(index) {
  lightboxIndex = index;
  const photo = lightboxPhotos[index];
  lightboxImg.src = photo.url;

  // O botao de transferir so aparece quando se sabe de que peca e a foto -
  // e dai que vem o nome do ficheiro (a referencia da peca).
  if (photo.downloadUrl) {
    lightboxDownload.href = photo.downloadUrl;
    lightboxDownload.hidden = false;
  } else {
    lightboxDownload.removeAttribute('href');
    lightboxDownload.hidden = true;
  }

  const showNav = lightboxPhotos.length > 1;
  lightboxPrev.hidden = !showNav;
  lightboxNext.hidden = !showNav;
  if (showNav) {
    lightboxCaption.hidden = false;
    lightboxCaption.textContent = `${lightboxPhotos[index].label} (${index + 1}/${lightboxPhotos.length})`;
  } else {
    lightboxCaption.hidden = true;
  }
}

// Aceita ou um URL unico (ex: pre-visualizacao avulsa) ou uma peca inteira,
// para se poder navegar por todas as fotos que ela tiver (Frente/Trás/Etiqueta).
function openLightbox(srcOrPart) {
  if (typeof srcOrPart === 'string') {
    lightboxPhotos = [{ url: srcOrPart, label: '' }];
  } else {
    const part = srcOrPart;
    lightboxPhotos = ['front', 'back', 'label']
      .filter((key) => part.images && part.images[key] && part.images[key].url)
      .map((key) => ({
        url: part.images[key].url,
        label: PHOTO_SLOT_LABELS[key],
        // Passa pelo servidor para a foto ser guardada com a referencia da
        // peca no nome, em vez do nome aleatorio com que esta na cloud.
        downloadUrl: `/api/parts/${part.id}/photos/${key}/download`,
      }));
  }
  if (!lightboxPhotos.length) return;
  showLightboxPhoto(0);
  lightbox.hidden = false;
}

lightboxPrev.addEventListener('click', (e) => {
  e.stopPropagation();
  showLightboxPhoto((lightboxIndex - 1 + lightboxPhotos.length) % lightboxPhotos.length);
});
lightboxNext.addEventListener('click', (e) => {
  e.stopPropagation();
  showLightboxPhoto((lightboxIndex + 1) % lightboxPhotos.length);
});

// ---------------------------------------------------------------------------
// Excel + logout
// ---------------------------------------------------------------------------
// Preenche de uma vez o "Nº da peça" nas peças que vieram da folha de stock
// antiga e ficaram sem número. Seguro de repetir: só mexe nas que ainda
// estiverem por preencher.
const fillItemNumbersStatus = document.getElementById('fill-item-numbers-status');
document.getElementById('btn-fill-item-numbers').addEventListener('click', async () => {
  if (!confirm('Isto procura o Nº de cada peça na folha de stock original e preenche as que ainda não o têm. Continuar?')) return;

  fillItemNumbersStatus.hidden = false;
  fillItemNumbersStatus.classList.remove('error');
  fillItemNumbersStatus.textContent = 'A procurar e a preencher, pode demorar um bocado…';

  try {
    const resp = await fetch('/api/admin/fill-item-numbers', { method: 'POST' });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Falha ao preencher os números.');
    const partes = [`${data.updated} peças ficaram com o número preenchido`];
    if (data.alreadyHad) partes.push(`${data.alreadyHad} já tinham`);
    if (data.outOfStock) partes.push(`${data.outOfStock} sem lugar na caixa (fora de stock)`);
    if (data.notFound) partes.push(`${data.notFound} sem correspondência na folha`);
    fillItemNumbersStatus.textContent = `Concluído: ${partes.join(', ')}.`;
    await loadParts();
  } catch (err) {
    fillItemNumbersStatus.classList.add('error');
    fillItemNumbersStatus.textContent = err.message;
  }
});

document.getElementById('btn-export-excel').addEventListener('click', () => {
  window.location.href = '/api/export.xlsx';
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login';
});

// ---------------------------------------------------------------------------
// Repositório de etiquetas
// ---------------------------------------------------------------------------
let allLabels = [];
let labelViewMode = 'fabricante';

const labelSearchInput = document.getElementById('label-search');
const labelsResults = document.getElementById('labels-results');
const labelsEmptyState = document.getElementById('labels-empty-state');
const labelViewToggle = document.getElementById('label-view-toggle');

wireCategoryToggle(labelViewToggle, (view) => {
  labelViewMode = view;
  renderLabels();
});

async function loadLabels() {
  const resp = await fetch('/api/labels');
  allLabels = await resp.json();
  renderLabels();
}

function matchesLabelSearch(label, q) {
  if (!q) return true;
  return [label.manufacturer, label.reference, label.fileName]
    .filter(Boolean)
    .some((field) => field.toLowerCase().includes(q));
}

function renderLabels() {
  const q = labelSearchInput.value.trim().toLowerCase();
  labelsResults.innerHTML = '';

  if (labelViewMode === 'indiferenciadas') {
    const unassigned = allLabels.filter((l) => !l.manufacturer).filter((l) => matchesLabelSearch(l, q));
    labelsEmptyState.hidden = unassigned.length > 0;
    const grid = document.createElement('div');
    grid.className = 'labels-grid';
    unassigned.forEach((l) => grid.appendChild(renderLabelCard(l)));
    labelsResults.appendChild(grid);
    return;
  }

  const manufacturers = Array.from(new Set(allLabels.filter((l) => l.manufacturer).map((l) => l.manufacturer))).sort();
  let anyShown = false;

  manufacturers.forEach((manufacturer) => {
    const labelsForManufacturer = allLabels.filter((l) => l.manufacturer === manufacturer);
    const manufacturerMatches = !q || manufacturer.toLowerCase().includes(q);
    const matchingLabels = labelsForManufacturer.filter((l) => matchesLabelSearch(l, q));
    if (q && !manufacturerMatches && !matchingLabels.length) return;
    anyShown = true;

    const group = document.createElement('div');
    group.className = 'label-group';

    const heading = document.createElement('h3');
    heading.className = 'label-group-heading';
    heading.textContent = manufacturer;
    group.appendChild(heading);

    const templates = labelsForManufacturer.filter((l) => l.isTemplate);
    const templateBox = document.createElement('div');
    templateBox.className = 'label-template-box';
    const templateHeading = document.createElement('div');
    templateHeading.className = 'label-template-heading';
    templateHeading.innerHTML = `${icon('star', 13)} Modelos template`;
    templateBox.appendChild(templateHeading);
    if (templates.length) {
      const templateGrid = document.createElement('div');
      templateGrid.className = 'label-template-grid';
      templates.forEach((l) => templateGrid.appendChild(renderLabelCard(l)));
      templateBox.appendChild(templateGrid);
    } else {
      const empty = document.createElement('p');
      empty.className = 'label-template-empty';
      empty.textContent = 'Ainda sem modelo template.';
      templateBox.appendChild(empty);
    }
    group.appendChild(templateBox);

    const others = (manufacturerMatches ? labelsForManufacturer : matchingLabels).filter((l) => !l.isTemplate);
    if (others.length) {
      const othersHeading = document.createElement('div');
      othersHeading.className = 'label-others-heading';
      othersHeading.textContent = 'Outras etiquetas';
      group.appendChild(othersHeading);
      const grid = document.createElement('div');
      grid.className = 'labels-grid';
      others.forEach((l) => grid.appendChild(renderLabelCard(l)));
      group.appendChild(grid);
    }

    labelsResults.appendChild(group);
  });

  labelsEmptyState.hidden = anyShown;
}

// ---------------------------------------------------------------------------
// Ver PDF de uma etiqueta numa janela dentro da própria app (em vez de
// depender do visualizador do browser, que varia muito de telemóvel para
// telemóvel e por vezes nem abre).
// ---------------------------------------------------------------------------
const pdfViewerOverlay = document.getElementById('pdf-viewer-overlay');
const pdfViewerBody = document.getElementById('pdf-viewer-body');
const pdfViewerTitle = document.getElementById('pdf-viewer-title');

function closePdfViewer() {
  pdfViewerOverlay.hidden = true;
  pdfViewerBody.innerHTML = '';
}
document.getElementById('pdf-viewer-close').addEventListener('click', closePdfViewer);
pdfViewerOverlay.addEventListener('click', (e) => {
  if (e.target === pdfViewerOverlay) closePdfViewer();
});

async function openPdfViewer(url, fileName) {
  pdfViewerTitle.textContent = fileName || 'Etiqueta';
  pdfViewerBody.innerHTML = '';
  const status = document.createElement('p');
  status.className = 'hint';
  status.textContent = 'A abrir o PDF…';
  pdfViewerBody.appendChild(status);
  pdfViewerOverlay.hidden = false;

  try {
    const pdfjsLib = await import('/pdfjs/pdf.min.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
    const pdf = await pdfjsLib.getDocument({ url }).promise;
    pdfViewerBody.innerHTML = '';

    const maxPages = Math.min(pdf.numPages, 10);
    const targetWidth = Math.min(pdfViewerBody.clientWidth || 560, 560);
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const baseViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: targetWidth / baseViewport.width });
      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-viewer-page';
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      pdfViewerBody.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    }
    if (pdf.numPages > maxPages) {
      const more = document.createElement('p');
      more.className = 'pdf-viewer-fallback';
      more.textContent = `A mostrar as primeiras ${maxPages} de ${pdf.numPages} páginas.`;
      pdfViewerBody.appendChild(more);
    }
  } catch (err) {
    console.error('Falha ao abrir o PDF:', err);
    pdfViewerBody.innerHTML = '';
    const errMsg = document.createElement('p');
    errMsg.className = 'error';
    errMsg.textContent = 'Não foi possível abrir este PDF.';
    pdfViewerBody.appendChild(errMsg);
  }

  const fallbackLink = document.createElement('a');
  fallbackLink.href = url;
  fallbackLink.target = '_blank';
  fallbackLink.rel = 'noopener';
  fallbackLink.className = 'btn-link';
  fallbackLink.innerHTML = `Abrir o ficheiro original numa aba nova ${icon('externalLink', 13)}`;
  pdfViewerBody.appendChild(fallbackLink);
}

function renderLabelCard(label) {
  const card = document.createElement('div');
  card.className = label.isTemplate ? 'label-card label-template-card' : 'label-card';

  const link = document.createElement('a');
  link.href = label.fileUrl;
  link.target = '_blank';
  link.rel = 'noopener';
  if (label.fileType === 'application/pdf') {
    // Não faz preventDefault - deixa o link abrir o ficheiro original numa
    // aba nova (comportamento normal do target=_blank, sempre fiável) e ao
    // mesmo tempo mostra a pré-visualização aqui na app.
    link.addEventListener('click', () => {
      openPdfViewer(label.fileUrl, label.fileName);
    });
  }

  if (label.thumbnailUrl || /^image\//.test(label.fileType || '')) {
    const img = document.createElement('img');
    img.src = label.thumbnailUrl || label.fileUrl;
    img.alt = label.fileName || '';
    link.appendChild(img);
  } else {
    const fileIcon = document.createElement('div');
    fileIcon.className = 'label-file-icon';
    fileIcon.innerHTML = icon('file', 22);
    link.appendChild(fileIcon);
  }
  card.appendChild(link);

  const caption = document.createElement('div');
  caption.className = 'label-caption';
  caption.textContent = label.reference || label.fileName || '';
  card.appendChild(caption);

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'label-delete';
  delBtn.innerHTML = icon('close', 14);
  delBtn.title = 'Eliminar etiqueta';
  delBtn.addEventListener('click', async () => {
    if (!confirm('Eliminar esta etiqueta?')) return;
    const resp = await fetch(`/api/labels/${label.id}`, { method: 'DELETE' });
    if (resp.ok) {
      allLabels = allLabels.filter((l) => l.id !== label.id);
      renderLabels();
    }
  });
  card.appendChild(delBtn);

  return card;
}

labelSearchInput.addEventListener('input', renderLabels);

const labelUploadOverlay = document.getElementById('label-upload-overlay');
const labelUploadForm = document.getElementById('label-upload-form');
const labelUploadError = document.getElementById('label-upload-error');

document.getElementById('btn-add-label').addEventListener('click', () => {
  labelUploadForm.reset();
  labelUploadError.hidden = true;
  labelUploadOverlay.hidden = false;
});
function closeLabelUpload() {
  labelUploadOverlay.hidden = true;
}
document.getElementById('label-upload-close').addEventListener('click', closeLabelUpload);
document.getElementById('label-upload-cancel').addEventListener('click', closeLabelUpload);

// Gera uma imagem da 1ª página do PDF (ex: um template) para se poder ver
// qual é de relance no repositório, sem ter de abrir cada ficheiro. Carrega
// o pdf.js só quando é mesmo preciso (ficheiro é PDF), para não pesar a app
// nos casos normais (foto).
async function generatePdfThumbnail(file) {
  try {
    const pdfjsLib = await import('/pdfjs/pdf.min.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const page = await pdf.getPage(1);
    const targetWidth = 500;
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = targetWidth / baseViewport.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  } catch (err) {
    console.error('Falha ao gerar a capa do PDF, a guardar sem pré-visualização:', err);
    return null;
  }
}

labelUploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  labelUploadError.hidden = true;

  const fileInput = document.getElementById('label-file-input');
  const file = fileInput.files[0];
  if (!file) {
    labelUploadError.hidden = false;
    labelUploadError.textContent = 'Escolha um ficheiro.';
    return;
  }

  const submitBtn = labelUploadForm.querySelector('button[type=submit]');
  const originalBtnText = submitBtn.textContent;

  const fd = new FormData();
  fd.append('file', file);
  fd.append('manufacturer', document.getElementById('label-field-manufacturer').value.trim());
  fd.append('reference', document.getElementById('label-field-reference').value.trim());
  fd.append('isTemplate', document.getElementById('label-field-template').checked ? 'true' : 'false');

  if (file.type === 'application/pdf') {
    submitBtn.disabled = true;
    submitBtn.textContent = 'A preparar capa…';
    const thumbnail = await generatePdfThumbnail(file);
    if (thumbnail) fd.append('thumbnail', thumbnail, 'capa.jpg');
    submitBtn.textContent = originalBtnText;
  }

  try {
    submitBtn.disabled = true;
    const resp = await fetch('/api/labels', { method: 'POST', body: fd });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Falha ao enviar a etiqueta.');
    allLabels.unshift(data);
    closeLabelUpload();
    renderLabels();
  } catch (err) {
    labelUploadError.hidden = false;
    labelUploadError.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalBtnText;
  }
});

// ---------------------------------------------------------------------------
// Envios - registo de encomendas enviadas, organizado por ano/mês (pastas)
// a partir da data de envio de cada registo.
// ---------------------------------------------------------------------------
let allShipments = [];

const shipmentForm = document.getElementById('shipment-form');
const shipmentError = document.getElementById('shipment-error');
const shipmentsFolders = document.getElementById('shipments-folders');
const shipmentsEmptyState = document.getElementById('shipments-empty-state');
const shipmentsNoMatch = document.getElementById('shipments-no-match');
const shipmentSearchInput = document.getElementById('shipment-search');

const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

async function loadShipments() {
  const resp = await fetch('/api/shipments');
  allShipments = await resp.json();
  renderShipments();
}

function formatDatePt(dateStr) {
  const [y, m, d] = String(dateStr || '').split('-');
  if (!y || !m || !d) return dateStr || '';
  return `${d}/${m}/${y}`;
}

function formatDimensions(s) {
  const parts = [s.length, s.width, s.height].filter((v) => v !== null && v !== undefined);
  if (!parts.length) return '—';
  return `${s.length ?? '—'} × ${s.width ?? '—'} × ${s.height ?? '—'} cm`;
}

function matchesShipmentSearch(s, q) {
  if (!q) return true;
  const haystack = [s.client, s.date, formatDatePt(s.date)].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(q);
}

function renderShipments() {
  shipmentsFolders.innerHTML = '';
  shipmentsEmptyState.hidden = allShipments.length > 0;
  if (!allShipments.length) {
    shipmentsNoMatch.hidden = true;
    return;
  }

  const q = shipmentSearchInput.value.trim().toLowerCase();
  const visible = allShipments.filter((s) => matchesShipmentSearch(s, q));
  shipmentsNoMatch.hidden = visible.length > 0;
  if (!visible.length) return;

  const byYear = new Map();
  visible.forEach((s) => {
    const [y, m] = String(s.date || '').split('-');
    const year = y || '—';
    const month = m ? Number(m) : null;
    if (!byYear.has(year)) byYear.set(year, new Map());
    const byMonth = byYear.get(year);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(s);
  });

  const years = Array.from(byYear.keys()).sort((a, b) => Number(b) - Number(a));

  years.forEach((year, yearIdx) => {
    const byMonth = byYear.get(year);
    const months = Array.from(byMonth.keys()).sort((a, b) => (b ?? 0) - (a ?? 0));
    const yearTotal = months.reduce((sum, m) => sum + byMonth.get(m).length, 0);

    const yearFolder = document.createElement('details');
    yearFolder.className = 'shipment-folder shipment-folder-year';
    if (q || yearIdx === 0) yearFolder.open = true;

    const yearSummary = document.createElement('summary');
    yearSummary.innerHTML = `${icon('folder', 15)} ${year} (${yearTotal} ${yearTotal === 1 ? 'envio' : 'envios'})`;
    yearFolder.appendChild(yearSummary);

    months.forEach((month, monthIdx) => {
      const entries = byMonth.get(month).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
      const monthLabel = month ? MONTH_NAMES_PT[month - 1] : 'Sem data';

      const monthFolder = document.createElement('details');
      monthFolder.className = 'shipment-folder shipment-folder-month';
      if (q || (yearIdx === 0 && monthIdx === 0)) monthFolder.open = true;

      const monthSummary = document.createElement('summary');
      monthSummary.innerHTML = `${icon('folderOpen', 14)} ${escapeHtml(monthLabel)} (${entries.length})`;
      monthFolder.appendChild(monthSummary);

      const table = document.createElement('table');
      table.className = 'shipment-table';
      table.innerHTML = `
        <thead>
          <tr><th>Data</th><th>Cliente</th><th>Peso</th><th>Dimensões (C×L×A)</th><th></th></tr>
        </thead>
        <tbody></tbody>
      `;
      const tbody = table.querySelector('tbody');
      entries.forEach((s) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(formatDatePt(s.date))}</td>
          <td>${escapeHtml(s.client)}</td>
          <td>${s.weight !== null && s.weight !== undefined ? `${s.weight} kg` : '—'}</td>
          <td>${formatDimensions(s)}</td>
          <td></td>
        `;
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn-link shipment-delete';
        delBtn.innerHTML = icon('close', 14);
        delBtn.title = 'Eliminar envio';
        delBtn.addEventListener('click', async () => {
          if (!confirm('Eliminar este envio?')) return;
          const resp = await fetch(`/api/shipments/${s.id}`, { method: 'DELETE' });
          if (resp.ok) {
            allShipments = allShipments.filter((item) => item.id !== s.id);
            renderShipments();
          }
        });
        tr.lastElementChild.appendChild(delBtn);
        tbody.appendChild(tr);
      });
      monthFolder.appendChild(table);
      yearFolder.appendChild(monthFolder);
    });

    shipmentsFolders.appendChild(yearFolder);
  });
}

shipmentSearchInput.addEventListener('input', renderShipments);

shipmentForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  shipmentError.hidden = true;

  const payload = {
    date: document.getElementById('shipment-field-date').value,
    client: document.getElementById('shipment-field-client').value.trim(),
    weight: document.getElementById('shipment-field-weight').value,
    length: document.getElementById('shipment-field-length').value,
    width: document.getElementById('shipment-field-width').value,
    height: document.getElementById('shipment-field-height').value,
  };

  try {
    const resp = await fetch('/api/shipments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Falha ao guardar o envio.');
    allShipments.unshift(data);
    shipmentForm.reset();
    renderShipments();
  } catch (err) {
    shipmentError.hidden = false;
    shipmentError.textContent = err.message;
  }
});

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
setStepUi();
startCamera();
