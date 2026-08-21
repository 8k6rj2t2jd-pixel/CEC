'use strict';

const logoImg = document.getElementById('logo-img');
if (logoImg) logoImg.addEventListener('error', () => logoImg.remove(), { once: true });

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

function switchToTab(name) {
  tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  tabPanels.forEach((p) => p.classList.toggle('active', p.id === `tab-${name}`));
  if (name === 'catalogo') loadParts();
  if (name === 'etiquetas') loadLabels();
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
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 960;
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
    0.9
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
  startCamera();
}

// Chamado a partir da "Verificar peça" quando se quer adicionar como peça
// nova. Começa sempre do zero (as 3 fotos, formulário em branco) - não
// reaproveita a foto verificada nem os dados que o OCR tinha lido nessa
// altura, para nunca assumir uma referência ou fabricante sem o
// utilizador confirmar.
function startNewPartFromCheck() {
  switchToTab('novo');
  resetCaptureFlow();
}

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
      badge.textContent = `📷 ${photoKeys.length}`;
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
  notes: document.getElementById('edit-field-notes'),
};

wireCategoryToggle(editCategoryToggle, (category) => {
  editFieldCategory.value = category;
});

let editingPartId = null;
const editBadges = {
  front: document.getElementById('edit-badge-front'),
  back: document.getElementById('edit-badge-back'),
  label: document.getElementById('edit-badge-label'),
};
const editPendingPreviewUrls = {};

function clearEditPendingPreviews() {
  for (const key of Object.keys(editPendingPreviewUrls)) {
    URL.revokeObjectURL(editPendingPreviewUrls[key]);
    delete editPendingPreviewUrls[key];
  }
}

function openEditModal(part) {
  editingPartId = part.id;
  editError.hidden = true;
  clearEditPendingPreviews();

  editFields.partType.value = part.partType || '';
  editFields.manufacturer.value = part.manufacturer || '';
  editFields.brand.value = part.brand || '';
  editFields.model.value = part.model || '';
  editFields.ref1.value = part.ref1 || '';
  editFields.ref2.value = part.ref2 || '';
  editFields.quantity.value = part.quantity || 0;
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
  editForm.querySelectorAll('input[type=file]').forEach((input) => {
    input.value = '';
  });

  editOverlay.hidden = false;
}

function closeEditModal() {
  editOverlay.hidden = true;
  editingPartId = null;
  clearEditPendingPreviews();
}

document.getElementById('edit-close').addEventListener('click', closeEditModal);
document.getElementById('edit-cancel').addEventListener('click', closeEditModal);

editForm.querySelectorAll('input[type=file]').forEach((input) => {
  input.addEventListener('change', () => {
    const slot = input.dataset.slot;
    const file = input.files[0];
    if (!file) return;
    if (editPendingPreviewUrls[slot]) URL.revokeObjectURL(editPendingPreviewUrls[slot]);
    const url = URL.createObjectURL(file);
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

    const photoInputs = Array.from(editForm.querySelectorAll('input[type=file]')).filter((i) => i.files[0]);
    if (photoInputs.length) {
      const fd = new FormData();
      photoInputs.forEach((input) => fd.append(input.dataset.slot, input.files[0]));
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
document.getElementById('lightbox-close').addEventListener('click', () => (lightbox.hidden = true));
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) lightbox.hidden = true;
});

const PHOTO_SLOT_LABELS = { front: 'Frente', back: 'Trás', label: 'Etiqueta' };
let lightboxPhotos = [];
let lightboxIndex = 0;

function showLightboxPhoto(index) {
  lightboxIndex = index;
  lightboxImg.src = lightboxPhotos[index].url;
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
      .map((key) => ({ url: part.images[key].url, label: PHOTO_SLOT_LABELS[key] }));
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
    const { ok, data } = await runOcr(file);
    checkStatus.hidden = true;
    if (!ok) {
      renderCheckError('Não foi possível ler esta foto.');
      return;
    }
    const referenceCandidates = Array.isArray(data.referenceCandidates) ? data.referenceCandidates : [];
    const partsResp = await fetch('/api/parts');
    const parts = await partsResp.json();
    const matches = findMatches(parts, referenceCandidates);
    renderCheckResults(file, data, matches);
  } catch (err) {
    console.error(err);
    checkStatus.hidden = true;
    renderCheckError('Ocorreu um erro ao verificar esta foto.');
  } finally {
    checkInput.value = '';
  }
});

function renderCheckError(message) {
  checkResults.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'error';
  p.textContent = message;
  checkResults.appendChild(p);
}

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

      const frontUrl = part.images && part.images.front && part.images.front.url;
      if (frontUrl) {
        const img = document.createElement('img');
        img.src = frontUrl;
        img.alt = part.partType;
        card.appendChild(img);
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
  addNewBtn.addEventListener('click', () => startNewPartFromCheck());

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
// Excel + logout
// ---------------------------------------------------------------------------
document.getElementById('btn-export-excel').addEventListener('click', () => {
  window.location.href = '/api/export.xlsx';
});

const importStockStatus = document.getElementById('import-stock-status');
document.getElementById('btn-import-stock').addEventListener('click', async () => {
  if (!confirm('Isto acrescenta ao catálogo todas as peças do stock antigo (sem fotos). Só deve fazer isto uma vez. Continuar?')) return;

  importStockStatus.hidden = false;
  importStockStatus.classList.remove('error');
  importStockStatus.textContent = 'A importar, pode demorar um bocado…';

  try {
    const resp = await fetch('/api/admin/import-stock', { method: 'POST' });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Falha na importação.');
    importStockStatus.textContent =
      `Importação concluída: ${data.created} peças adicionadas ` +
      `(${data.withManufacturer} com fabricante identificado automaticamente).`;
    await loadParts();
  } catch (err) {
    importStockStatus.classList.add('error');
    importStockStatus.textContent = err.message;
  }
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
    templateHeading.textContent = '⭐ Modelos template';
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

function renderLabelCard(label) {
  const card = document.createElement('div');
  card.className = label.isTemplate ? 'label-card label-template-card' : 'label-card';

  const link = document.createElement('a');
  link.href = label.fileUrl;
  link.target = '_blank';
  link.rel = 'noopener';

  if (/^image\//.test(label.fileType || '')) {
    const img = document.createElement('img');
    img.src = label.fileUrl;
    img.alt = label.fileName || '';
    link.appendChild(img);
  } else {
    const icon = document.createElement('div');
    icon.className = 'label-file-icon';
    icon.textContent = '📄';
    link.appendChild(icon);
  }
  card.appendChild(link);

  const caption = document.createElement('div');
  caption.className = 'label-caption';
  caption.textContent = label.reference || label.fileName || '';
  card.appendChild(caption);

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'label-delete';
  delBtn.textContent = '✕';
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

labelUploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  labelUploadError.hidden = true;

  const fileInput = document.getElementById('label-file-input');
  if (!fileInput.files[0]) {
    labelUploadError.hidden = false;
    labelUploadError.textContent = 'Escolha um ficheiro.';
    return;
  }

  const fd = new FormData();
  fd.append('file', fileInput.files[0]);
  fd.append('manufacturer', document.getElementById('label-field-manufacturer').value.trim());
  fd.append('reference', document.getElementById('label-field-reference').value.trim());
  fd.append('isTemplate', document.getElementById('label-field-template').checked ? 'true' : 'false');

  try {
    const resp = await fetch('/api/labels', { method: 'POST', body: fd });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Falha ao enviar a etiqueta.');
    allLabels.unshift(data);
    closeLabelUpload();
    renderLabels();
  } catch (err) {
    labelUploadError.hidden = false;
    labelUploadError.textContent = err.message;
  }
});

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
setStepUi();
startCamera();
