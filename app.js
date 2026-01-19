/**
 * DocScanner - Simplu și Robust
 * Captură → Selectare colțuri manual → Crop → Export
 */

// ===== STATE =====
const state = {
  cvReady: false,
  stream: null,
  capturedImage: null,
  corners: [],
  scans: [],
  currentFilter: 'original',
  facingMode: 'environment',
};

// ===== DOM =====
let video, cropCanvas, cropCtx, previewCanvas, previewCtx;
let handles = [];
let cropContainer;

// ===== INIT =====
function onOpenCvReady() {
  if (typeof cv !== 'undefined') {
    if (cv.Mat) {
      initAfterCV();
    } else {
      cv['onRuntimeInitialized'] = initAfterCV;
    }
  }
}
window.onOpenCvReady = onOpenCvReady;

function initAfterCV() {
  state.cvReady = true;
  hideLoading();
  init();
  showToast('Gata de scanare!');
}

function init() {
  video = document.getElementById('video');
  cropCanvas = document.getElementById('crop-canvas');
  cropCtx = cropCanvas.getContext('2d');
  previewCanvas = document.getElementById('preview-canvas');
  previewCtx = previewCanvas.getContext('2d');
  cropContainer = document.getElementById('crop-container');

  handles = [
    document.getElementById('handle-tl'),
    document.getElementById('handle-tr'),
    document.getElementById('handle-br'),
    document.getElementById('handle-bl'),
  ];

  setupEvents();
  startCamera();
  loadScans();
}

function setupEvents() {
  // Camera
  document.getElementById('btn-capture').onclick = capture;
  document.getElementById('btn-gallery').onclick = () => showScreen('gallery');
  document.getElementById('btn-switch').onclick = switchCamera;

  // Crop
  document.getElementById('btn-crop-back').onclick = () => showScreen('camera');
  document.getElementById('btn-crop-done').onclick = applyCrop;

  // Preview
  document.getElementById('btn-preview-back').onclick = () => showScreen('crop');
  document.getElementById('btn-save').onclick = saveScan;

  document.querySelectorAll('.option-btn').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.option-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentFilter = btn.dataset.filter;
      applyFilter();
    };
  });

  // Gallery
  document.getElementById('btn-gallery-back').onclick = () => showScreen('camera');
  document.getElementById('btn-download-all').onclick = downloadAll;
  document.getElementById('btn-clear-all').onclick = clearAll;

  // Corner dragging
  handles.forEach((handle, i) => {
    handle.addEventListener('touchstart', (e) => startDrag(e, i), { passive: false });
    handle.addEventListener('mousedown', (e) => startDrag(e, i));
  });
}

// ===== CAMERA =====
async function startCamera() {
  try {
    if (state.stream) {
      state.stream.getTracks().forEach((t) => t.stop());
    }

    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });

    video.srcObject = state.stream;
    video.play();
  } catch (err) {
    showToast('Eroare cameră: ' + err.message);
  }
}

function switchCamera() {
  state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
  startCamera();
}

function capture() {
  // Capturează frame-ul curent
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);

  state.capturedImage = canvas;

  // Afișează în crop canvas
  cropCanvas.width = canvas.width;
  cropCanvas.height = canvas.height;
  cropCtx.drawImage(canvas, 0, 0);

  // Setează colțuri default (margini cu padding)
  const pad = 50;
  state.corners = [
    { x: pad, y: pad }, // TL
    { x: canvas.width - pad, y: pad }, // TR
    { x: canvas.width - pad, y: canvas.height - pad }, // BR
    { x: pad, y: canvas.height - pad }, // BL
  ];

  showScreen('crop');

  // Așteaptă să se afișeze ecranul apoi poziționează handles
  setTimeout(updateHandles, 100);
}

// ===== CROP / CORNER SELECTION =====
function updateHandles() {
  const rect = cropCanvas.getBoundingClientRect();
  const scaleX = rect.width / cropCanvas.width;
  const scaleY = rect.height / cropCanvas.height;

  handles.forEach((handle, i) => {
    const x = rect.left + state.corners[i].x * scaleX;
    const y = rect.top + state.corners[i].y * scaleY;
    handle.style.left = x + 'px';
    handle.style.top = y + 'px';
  });

  updatePolygon();
}

function updatePolygon() {
  const rect = cropCanvas.getBoundingClientRect();
  const scaleX = rect.width / cropCanvas.width;
  const scaleY = rect.height / cropCanvas.height;

  const points = state.corners
    .map((c) => {
      const x = rect.left + c.x * scaleX;
      const y = rect.top + c.y * scaleY;
      return `${x},${y}`;
    })
    .join(' ');

  document.getElementById('crop-polygon').setAttribute('points', points);
}

function startDrag(e, cornerIndex) {
  e.preventDefault();

  const rect = cropCanvas.getBoundingClientRect();
  const scaleX = cropCanvas.width / rect.width;
  const scaleY = cropCanvas.height / rect.height;

  function onMove(e) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    // Calculează poziția relativă la canvas
    let x = (clientX - rect.left) * scaleX;
    let y = (clientY - rect.top) * scaleY;

    // Limitează la dimensiunile imaginii
    x = Math.max(0, Math.min(cropCanvas.width, x));
    y = Math.max(0, Math.min(cropCanvas.height, y));

    state.corners[cornerIndex] = { x, y };
    updateHandles();
  }

  function onEnd() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onEnd);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd);
}

// ===== PERSPECTIVE WARP =====
function applyCrop() {
  if (!state.cvReady) {
    showToast('OpenCV nu e încărcat');
    return;
  }

  showLoading('Procesare...');

  setTimeout(() => {
    try {
      const corners = state.corners;

      // Calculează dimensiunile output
      const w1 = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
      const w2 = Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y);
      const h1 = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y);
      const h2 = Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y);

      const outW = Math.round(Math.max(w1, w2));
      const outH = Math.round(Math.max(h1, h2));

      // OpenCV warp
      const src = cv.imread(state.capturedImage);

      const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
        corners[0].x,
        corners[0].y,
        corners[1].x,
        corners[1].y,
        corners[2].x,
        corners[2].y,
        corners[3].x,
        corners[3].y,
      ]);

      const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outW, 0, outW, outH, 0, outH]);

      const M = cv.getPerspectiveTransform(srcPts, dstPts);
      const dst = new cv.Mat();
      cv.warpPerspective(src, dst, M, new cv.Size(outW, outH));

      // Salvează rezultatul
      previewCanvas.width = outW;
      previewCanvas.height = outH;
      cv.imshow(previewCanvas, dst);

      // Store original for filters
      state.warpedMat = dst.clone();

      // Cleanup
      src.delete();
      srcPts.delete();
      dstPts.delete();
      M.delete();
      dst.delete();

      hideLoading();
      showScreen('preview');
    } catch (err) {
      hideLoading();
      showToast('Eroare: ' + err.message);
      console.error(err);
    }
  }, 50);
}

function applyFilter() {
  if (!state.warpedMat) return;

  const src = state.warpedMat.clone();
  const dst = new cv.Mat();

  try {
    switch (state.currentFilter) {
      case 'enhance':
        src.convertTo(dst, -1, 1.3, 10);
        break;

      case 'bw':
        cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);
        cv.adaptiveThreshold(
          dst,
          dst,
          255,
          cv.ADAPTIVE_THRESH_GAUSSIAN_C,
          cv.THRESH_BINARY,
          21,
          10
        );
        break;

      case 'grayscale':
        cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);
        break;

      default:
        src.copyTo(dst);
    }

    cv.imshow(previewCanvas, dst);
  } catch (err) {
    console.error('Filter error:', err);
  }

  src.delete();
  dst.delete();
}

// ===== SAVE & GALLERY =====
function saveScan() {
  const imageData = previewCanvas.toDataURL('image/png');

  const scan = {
    id: Date.now(),
    image: imageData,
    date: new Date().toLocaleString('ro-RO'),
  };

  state.scans.unshift(scan);
  saveScans();
  updateBadge();

  // Download automat
  downloadImage(imageData, `scan_${scan.id}`);

  showToast('Salvat!');
  showScreen('camera');

  // Cleanup
  if (state.warpedMat) {
    state.warpedMat.delete();
    state.warpedMat = null;
  }
}

function renderGallery() {
  const grid = document.getElementById('gallery-grid');
  const count = document.getElementById('scan-count');

  count.textContent = state.scans.length;

  if (state.scans.length === 0) {
    grid.innerHTML =
      '<p style="grid-column:1/-1; text-align:center; padding:40px; color:#666;">Nicio scanare</p>';
    return;
  }

  grid.innerHTML = state.scans
    .map(
      (scan) => `
        <div class="gallery-item" data-id="${scan.id}">
            <img src="${scan.image}" alt="Scan">
            <button class="delete-btn">✕</button>
        </div>
    `
    )
    .join('');

  grid.querySelectorAll('.gallery-item img').forEach((img) => {
    img.onclick = () => downloadImage(img.src, 'scan');
  });

  grid.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = parseInt(btn.parentElement.dataset.id);
      state.scans = state.scans.filter((s) => s.id !== id);
      saveScans();
      renderGallery();
      updateBadge();
    };
  });
}

function downloadImage(dataUrl, name) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${name}.png`;
  a.click();
}

function downloadAll() {
  state.scans.forEach((scan, i) => {
    setTimeout(() => downloadImage(scan.image, `scan_${i + 1}`), i * 300);
  });
}

function clearAll() {
  if (confirm('Ștergi toate?')) {
    state.scans = [];
    saveScans();
    renderGallery();
    updateBadge();
  }
}

function saveScans() {
  try {
    localStorage.setItem('scans', JSON.stringify(state.scans));
  } catch (e) {
    state.scans = state.scans.slice(0, 5);
    localStorage.setItem('scans', JSON.stringify(state.scans));
  }
}

function loadScans() {
  try {
    state.scans = JSON.parse(localStorage.getItem('scans')) || [];
    updateBadge();
  } catch (e) {
    state.scans = [];
  }
}

function updateBadge() {
  const badge = document.getElementById('gallery-badge');
  badge.textContent = state.scans.length;
  badge.classList.toggle('hidden', state.scans.length === 0);
}

// ===== UI =====
function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');

  if (name === 'gallery') renderGallery();
  if (name === 'crop') setTimeout(updateHandles, 50);
}

function showLoading(text) {
  document.getElementById('loading-text').textContent = text;
  document.getElementById('loading').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loading').classList.add('hidden');
}

function showToast(msg) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// ===== START =====
showLoading('Se încarcă OpenCV...');

// Fallback dacă OpenCV e deja încărcat
if (typeof cv !== 'undefined' && cv.Mat) {
  initAfterCV();
}
