'use strict';

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabButtons.forEach((b) => b.classList.remove('active'));
    tabPanels.forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'catalogo') loadParts();
  });
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

let stepIndex = 0; // 0=front, 1=back, 2=label
let stream = null;
let shots = {}; // { front: Blob, back: Blob, label: Blob }

function setStepUi() {
  document.querySelectorAll('.step').forEach((el, i) => {
    el.classList.remove('active', 'done');
    if (i < stepIndex) el.classList.add('done');
    else if (i === stepIndex) el.classList.add('active');
  });
  captureHint.textContent = STEP_HINTS[STEP_LABELS[stepIndex]];
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

btnShoot.addEventListener('click', () => {
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 960;
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(video, 0, 0, w, h);
  canvas.toBlob(
    (blob) => {
      shots[STEP_LABELS[stepIndex]] = blob;
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

btnRetake.addEventListener('click', () => {
  startCamera();
});

btnContinue.addEventListener('click', async () => {
  stopCamera();
  if (stepIndex < 2) {
    stepIndex += 1;
    setStepUi();
    startCamera();
  } else {
    // Todas as 3 fotos tiradas -> mostrar formulário e correr OCR na etiqueta.
    stepIndex = 3;
    setStepUi();
    captureStage.hidden = true;
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
  ocrStatus.textContent = 'A ler a etiqueta… (pode demorar alguns segundos)';

  try {
    const fd = new FormData();
    fd.append('label', shots.label, 'label.jpg');
    const resp = await fetch('/api/ocr', { method: 'POST', body: fd });
    const data = await resp.json();
    ocrStatus.hidden = true;

    if (resp.ok) {
      if (data.rawText) {
        ocrResult.hidden = false;
        ocrRawText.textContent = data.rawText;
      }
      if (data.manufacturer) fieldManufacturer.value = titleCase(data.manufacturer);
      if (data.partTypeHint) fieldPartType.value = data.partTypeHint;
      if (Array.isArray(data.referenceCandidates) && data.referenceCandidates.length) {
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
    }
  } catch (err) {
    console.error(err);
    ocrStatus.hidden = true;
  }
}

function titleCase(str) {
  return str.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.substr(1).toLowerCase());
}

partForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  saveError.hidden = true;

  const fd = new FormData();
  fd.append('front', shots.front, 'front.jpg');
  fd.append('back', shots.back, 'back.jpg');
  fd.append('label', shots.label, 'label.jpg');
  fd.append('partType', fieldPartType.value.trim());
  fd.append('manufacturer', fieldManufacturer.value.trim());
  fd.append('brand', document.getElementById('field-brand').value.trim());
  fd.append('model', document.getElementById('field-model').value.trim());
  fd.append('ref1', fieldRef1.value.trim());
  fd.append('ref2', fieldRef2.value.trim());
  fd.append('quantity', document.getElementById('field-quantity').value || '1');
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
  stepIndex = 0;
  setStepUi();
  partForm.reset();
  partForm.hidden = true;
  saveSuccess.hidden = true;
  captureStage.hidden = false;
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
  const resp = await fetch('/api/parts');
  allParts = await resp.json();
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

  const img = document.createElement('img');
  img.src = `/storage/${part.images.front}`;
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
    renderParts();
  }
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
// Lightbox
// ---------------------------------------------------------------------------
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
document.getElementById('lightbox-close').addEventListener('click', () => (lightbox.hidden = true));
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) lightbox.hidden = true;
});
function openLightbox(src) {
  lightboxImg.src = src;
  lightbox.hidden = false;
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
setStepUi();
startCamera();
