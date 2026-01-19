/**
 * DocScanner - Document Scanner Web App
 * Folosește OpenCV.js pentru detectare margini și corecție perspectivă
 */

// ===== GLOBAL STATE =====
const state = {
  cvReady: false,
  stream: null,
  currentPreset: 'auto',
  detectedCorners: null,
  isLocked: false,
  lockFrames: 0,
  flashEnabled: false,
  scans: [],
  currentCapture: null,
  processing: false,
  enhance: true,
  bw: false,
};

// ===== PRESET CONFIGURATIONS =====
const PRESETS = {
  auto: { name: 'Auto', ratio: null },
  a4: { name: 'A4', ratio: 1.414 },
  a5: { name: 'A5', ratio: 1.414 },
  id: { name: 'Buletin', ratio: 0.63 },
  receipt: { name: 'Bon', ratio: 2.5 },
};

// ===== CONSTANTS (VALORI PERMISIVE) =====
const LOCK_THRESHOLD = 4; // Cadre stabile necesare pentru lock
const CORNER_STABILITY = 40; // Pixeli toleranță pentru stabilitate
const MIN_AREA_RATIO = 0.05; // Aria minimă a documentului vs cadru
const MAX_AREA_RATIO = 0.98; // Aria maximă a documentului vs cadru

// ===== DOM ELEMENTS =====
let video, overlay, ctx;
let frameGuide, frameBorder, frameLabel;
let cornerElements = [];
let lockIndicator;
let captureBtn, flashBtn, galleryBtn;
let presetBtns;
let previewModal, previewCanvas, previewCtx;
let galleryModal, galleryGrid;

// ===== INITIALIZATION =====
function onOpenCvReady() {
  console.log('OpenCV.js loaded, waiting for runtime...');

  if (typeof cv !== 'undefined') {
    if (cv.Mat) {
      // Already ready
      state.cvReady = true;
      hideLoading();
      initApp();
      showToast('Scanner pregătit!');
    } else {
      // Wait for runtime
      cv['onRuntimeInitialized'] = () => {
        console.log('OpenCV runtime initialized');
        state.cvReady = true;
        hideLoading();
        initApp();
        showToast('Scanner pregătit!');
      };
    }
  }
}

// Make it global
window.onOpenCvReady = onOpenCvReady;

function initApp() {
  console.log('Initializing app...');

  // Cache DOM elements
  video = document.getElementById('video');
  overlay = document.getElementById('overlay');
  ctx = overlay.getContext('2d');

  frameGuide = document.getElementById('frame-guide');
  frameBorder = document.getElementById('frame-border');
  frameLabel = document.getElementById('frame-label');

  cornerElements = [
    document.getElementById('corner-tl'),
    document.getElementById('corner-tr'),
    document.getElementById('corner-br'),
    document.getElementById('corner-bl'),
  ];

  lockIndicator = document.getElementById('lock-indicator');
  captureBtn = document.getElementById('btn-capture');
  flashBtn = document.getElementById('btn-flash');
  galleryBtn = document.getElementById('btn-gallery');
  presetBtns = document.querySelectorAll('.preset-btn');

  previewModal = document.getElementById('preview-modal');
  previewCanvas = document.getElementById('preview-canvas');
  previewCtx = previewCanvas.getContext('2d');

  galleryModal = document.getElementById('gallery-modal');
  galleryGrid = document.getElementById('gallery-grid');

  // Setup event listeners
  setupEventListeners();

  // Start camera
  startCamera();

  // Load saved scans from localStorage
  loadScans();
}

function setupEventListeners() {
  // Preset buttons
  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => setPreset(btn.dataset.preset));
  });

  // Control buttons
  captureBtn.addEventListener('click', captureDocument);
  flashBtn.addEventListener('click', toggleFlash);
  galleryBtn.addEventListener('click', showGallery);

  // Preview modal
  document.getElementById('btn-back').addEventListener('click', closePreview);
  document.getElementById('btn-confirm').addEventListener('click', confirmScan);
  document.getElementById('btn-adjust').addEventListener('click', toggleAdjustMode);
  document.getElementById('btn-enhance').addEventListener('click', toggleEnhance);
  document.getElementById('btn-bw').addEventListener('click', toggleBW);

  // Gallery modal
  document.getElementById('btn-gallery-back').addEventListener('click', closeGallery);
  document.getElementById('btn-download-all').addEventListener('click', downloadAll);
  document.getElementById('btn-clear-all').addEventListener('click', clearAll);

  // Handle resize
  window.addEventListener('resize', handleResize);

  // Prevent zoom on double tap
  document.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false }
  );
}

// ===== CAMERA =====
async function startCamera() {
  try {
    showLoading('Accesare cameră...');

    const constraints = {
      video: {
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    };

    state.stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = state.stream;

    video.onloadedmetadata = () => {
      video.play();
      handleResize();
      hideLoading();
      console.log('Camera started, beginning frame processing');
      requestAnimationFrame(processFrame);
    };
  } catch (err) {
    hideLoading();
    showToast('Eroare cameră: ' + err.message);
    console.error('Camera error:', err);
  }
}

function handleResize() {
  if (video.videoWidth && video.videoHeight) {
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
  }
}

// ===== FRAME PROCESSING =====
function processFrame() {
  if (!state.cvReady || !video.videoWidth) {
    requestAnimationFrame(processFrame);
    return;
  }

  try {
    // Clear overlay
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    // Detect document corners
    const detectedCorners = detectDocument();

    if (detectedCorners && detectedCorners.length === 4) {
      // Avem document detectat - activează butonul
      captureBtn.disabled = false;

      // Check stability for lock
      checkStability(detectedCorners);

      // Draw detected corners
      drawDetection(detectedCorners);

      // Save corners
      state.detectedCorners = detectedCorners;
    } else {
      // Nu avem document
      resetLock();
      hideCorners();
      state.detectedCorners = null;
    }
  } catch (err) {
    console.error('Frame processing error:', err);
  }

  requestAnimationFrame(processFrame);
}

function detectDocument() {
  let src = null;
  let gray = null;
  let blurred = null;
  let edges = null;
  let dilated = null;
  let kernel = null;
  let contours = null;
  let hierarchy = null;

  try {
    // METODA CORECTĂ: citește prin canvas, nu VideoCapture
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(video, 0, 0);

    // Citește din canvas
    src = cv.imread(tempCanvas);

    // Convert to grayscale
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Apply Gaussian blur
    blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    // Edge detection (Canny)
    edges = new cv.Mat();
    cv.Canny(blurred, edges, 30, 100);

    // Dilate to close gaps
    dilated = new cv.Mat();
    kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    cv.dilate(edges, dilated, kernel);

    // Find contours
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let bestQuad = null;
    let maxArea = 0;
    const frameArea = video.videoWidth * video.videoHeight;

    // Find largest quadrilateral
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);

      if (area < frameArea * MIN_AREA_RATIO || area > frameArea * MAX_AREA_RATIO) {
        continue;
      }

      const peri = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, 0.02 * peri, true);

      if (approx.rows === 4 && cv.isContourConvex(approx) && area > maxArea) {
        maxArea = area;
        bestQuad = [];

        for (let j = 0; j < 4; j++) {
          bestQuad.push({
            x: approx.data32S[j * 2],
            y: approx.data32S[j * 2 + 1],
          });
        }
      }

      approx.delete();
    }

    // Cleanup
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    dilated.delete();
    kernel.delete();
    contours.delete();
    hierarchy.delete();

    if (bestQuad) {
      return orderCorners(bestQuad);
    }

    return null;
  } catch (err) {
    console.error('Detection error:', err.message || err);
    // Cleanup on error
    try {
      if (src) src.delete();
      if (gray) gray.delete();
      if (blurred) blurred.delete();
      if (edges) edges.delete();
      if (dilated) dilated.delete();
      if (kernel) kernel.delete();
      if (contours) contours.delete();
      if (hierarchy) hierarchy.delete();
    } catch (e) {}
    return null;
  }
}

function orderCorners(corners) {
  // Sort by Y coordinate
  const sorted = [...corners].sort((a, b) => a.y - b.y);

  // Top two and bottom two
  const top = sorted.slice(0, 2);
  const bottom = sorted.slice(2, 4);

  // Sort by X coordinate
  top.sort((a, b) => a.x - b.x);
  bottom.sort((a, b) => a.x - b.x);

  return [top[0], top[1], bottom[1], bottom[0]]; // TL, TR, BR, BL
}

function checkStability(newCorners) {
  if (!state.detectedCorners || state.detectedCorners.length !== 4) {
    state.lockFrames = 1;
    return;
  }

  // Check if corners are stable
  let stable = true;
  for (let i = 0; i < 4; i++) {
    const dx = Math.abs(newCorners[i].x - state.detectedCorners[i].x);
    const dy = Math.abs(newCorners[i].y - state.detectedCorners[i].y);

    if (dx > CORNER_STABILITY || dy > CORNER_STABILITY) {
      stable = false;
      break;
    }
  }

  if (stable) {
    state.lockFrames++;
  } else {
    state.lockFrames = 1;
  }

  // Lock după câteva cadre stabile
  if (state.lockFrames >= LOCK_THRESHOLD && !state.isLocked) {
    state.isLocked = true;
    lockIndicator.classList.remove('hidden');
    captureBtn.classList.add('ready');

    // Haptic feedback if available
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  }
}

function resetLock() {
  state.lockFrames = 0;
  state.isLocked = false;
  state.detectedCorners = null;
  lockIndicator.classList.add('hidden');
  captureBtn.classList.remove('ready');
  captureBtn.disabled = true;
}

function drawDetection(corners) {
  if (!corners || corners.length !== 4) return;

  // Scale corners to overlay size
  const scaleX = overlay.width / video.videoWidth;
  const scaleY = overlay.height / video.videoHeight;

  const scaled = corners.map((c) => ({
    x: c.x * scaleX,
    y: c.y * scaleY,
  }));

  // Draw polygon
  ctx.beginPath();
  ctx.moveTo(scaled[0].x, scaled[0].y);
  for (let i = 1; i < 4; i++) {
    ctx.lineTo(scaled[i].x, scaled[i].y);
  }
  ctx.closePath();

  // Fill with semi-transparent overlay
  ctx.fillStyle = state.isLocked ? 'rgba(76, 175, 80, 0.25)' : 'rgba(255, 152, 0, 0.2)';
  ctx.fill();

  // Stroke border
  ctx.strokeStyle = state.isLocked ? '#4CAF50' : '#FF9800';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Update DOM corner indicators position
  const displayScaleX = video.clientWidth / video.videoWidth;
  const displayScaleY = video.clientHeight / video.videoHeight;

  cornerElements.forEach((el, i) => {
    if (el && corners[i]) {
      el.style.left = corners[i].x * displayScaleX + 'px';
      el.style.top = corners[i].y * displayScaleY + 'px';
      el.classList.add('visible');
      el.classList.toggle('locked', state.isLocked);
    }
  });
}

function hideCorners() {
  cornerElements.forEach((el) => {
    if (el) {
      el.classList.remove('visible', 'locked');
    }
  });
}

// ===== CAPTURE & PROCESSING =====
async function captureDocument() {
  if (!state.detectedCorners || state.processing) {
    console.log('Cannot capture: no corners or processing');
    showToast('Poziționează documentul în cadru');
    return;
  }

  console.log('Capturing document...');
  state.processing = true;
  showLoading('Procesare...');

  try {
    // Capture frame from video
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = video.videoWidth;
    captureCanvas.height = video.videoHeight;
    const captureCtx = captureCanvas.getContext('2d');
    captureCtx.drawImage(video, 0, 0);

    // Store capture data
    state.currentCapture = {
      imageData: captureCanvas.toDataURL('image/jpeg', 0.95),
      corners: JSON.parse(JSON.stringify(state.detectedCorners)), // Deep copy
      width: video.videoWidth,
      height: video.videoHeight,
    };

    console.log('Captured corners:', state.currentCapture.corners);

    // Apply perspective correction
    await applyPerspectiveCorrection();

    hideLoading();
    showPreview();
  } catch (err) {
    hideLoading();
    showToast('Eroare la procesare: ' + err.message);
    console.error('Capture error:', err);
  }

  state.processing = false;
}

async function applyPerspectiveCorrection() {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      try {
        const corners = state.currentCapture.corners;

        // Calculate output dimensions
        const width1 = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
        const width2 = Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y);
        const height1 = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y);
        const height2 = Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y);

        const outWidth = Math.round(Math.max(width1, width2));
        const outHeight = Math.round(Math.max(height1, height2));

        console.log('Output dimensions:', outWidth, 'x', outHeight);

        // Create source Mat from image
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(img, 0, 0);

        const src = cv.imread(tempCanvas);

        // Define source and destination points
        const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
          corners[0].x,
          corners[0].y,
          corners[1].x,
          corners[1].y,
          corners[2].x,
          corners[2].y,
          corners[3].x,
          corners[3].y,
        ]);

        const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
          0,
          0,
          outWidth,
          0,
          outWidth,
          outHeight,
          0,
          outHeight,
        ]);

        // Get perspective transform matrix
        const M = cv.getPerspectiveTransform(srcPoints, dstPoints);

        // Apply warp perspective
        const dst = new cv.Mat();
        const dsize = new cv.Size(outWidth, outHeight);
        cv.warpPerspective(
          src,
          dst,
          M,
          dsize,
          cv.INTER_LINEAR,
          cv.BORDER_CONSTANT,
          new cv.Scalar()
        );

        // Apply enhancements if enabled
        if (state.enhance && !state.bw) {
          applyEnhancements(dst);
        }

        if (state.bw) {
          applyBlackWhite(dst);
        }

        // Output to preview canvas
        previewCanvas.width = outWidth;
        previewCanvas.height = outHeight;
        cv.imshow(previewCanvas, dst);

        // Cleanup
        src.delete();
        dst.delete();
        srcPoints.delete();
        dstPoints.delete();
        M.delete();

        console.log('Perspective correction done');
        resolve();
      } catch (err) {
        console.error('Warp error:', err);
        reject(err);
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load captured image'));
    };

    img.src = state.currentCapture.imageData;
  });
}

function applyEnhancements(mat) {
  try {
    // Simple contrast enhancement using convertTo
    const enhanced = new cv.Mat();
    mat.convertTo(enhanced, -1, 1.2, 10); // alpha=1.2 (contrast), beta=10 (brightness)
    enhanced.copyTo(mat);
    enhanced.delete();
  } catch (err) {
    console.error('Enhancement error:', err);
  }
}

function applyBlackWhite(mat) {
  try {
    // Convert to grayscale
    const gray = new cv.Mat();
    cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);

    // Apply adaptive threshold
    const thresh = new cv.Mat();
    cv.adaptiveThreshold(
      gray,
      thresh,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY,
      21,
      10
    );

    // Convert back to RGBA
    cv.cvtColor(thresh, mat, cv.COLOR_GRAY2RGBA);

    gray.delete();
    thresh.delete();
  } catch (err) {
    console.error('B&W error:', err);
  }
}

// ===== PREVIEW =====
function showPreview() {
  previewModal.classList.remove('hidden');
  setTimeout(() => previewModal.classList.add('visible'), 10);
}

function closePreview() {
  previewModal.classList.remove('visible');
  setTimeout(() => {
    previewModal.classList.add('hidden');
    state.currentCapture = null;
  }, 300);
}

async function confirmScan() {
  // Get final image
  const imageData = previewCanvas.toDataURL('image/png');

  // Add to scans
  const scan = {
    id: Date.now(),
    image: imageData,
    timestamp: new Date().toISOString(),
  };

  state.scans.push(scan);
  saveScans();
  updateGalleryCount();

  closePreview();
  showToast('Scanare salvată!');

  // Auto-download
  downloadImage(scan);
}

function toggleAdjustMode() {
  const adjustContainer = document.getElementById('adjust-corners');
  const btn = document.getElementById('btn-adjust');

  if (adjustContainer) {
    adjustContainer.classList.toggle('hidden');
    btn.classList.toggle('active');

    if (!adjustContainer.classList.contains('hidden')) {
      showToast('Funcție în dezvoltare');
    }
  }
}

async function toggleEnhance() {
  state.enhance = !state.enhance;
  document.getElementById('btn-enhance').classList.toggle('active', state.enhance);

  if (state.currentCapture) {
    showLoading('Procesare...');
    await applyPerspectiveCorrection();
    hideLoading();
  }
}

async function toggleBW() {
  state.bw = !state.bw;
  document.getElementById('btn-bw').classList.toggle('active', state.bw);

  if (state.currentCapture) {
    showLoading('Procesare...');
    await applyPerspectiveCorrection();
    hideLoading();
  }
}

// ===== GALLERY =====
function showGallery() {
  renderGallery();
  galleryModal.classList.remove('hidden');
  setTimeout(() => galleryModal.classList.add('visible'), 10);
}

function closeGallery() {
  galleryModal.classList.remove('visible');
  setTimeout(() => galleryModal.classList.add('hidden'), 300);
}

function renderGallery() {
  galleryGrid.innerHTML = '';
  document.getElementById('scan-count').textContent = state.scans.length;

  if (state.scans.length === 0) {
    galleryGrid.innerHTML =
      '<p style="grid-column: 1/-1; text-align: center; color: #999; padding: 40px;">Nicio scanare încă</p>';
    return;
  }

  state.scans.forEach((scan, index) => {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    item.innerHTML = `
            <img src="${scan.image}" alt="Scan ${index + 1}">
            <button class="delete-btn" data-id="${scan.id}">✕</button>
        `;

    item.querySelector('img').addEventListener('click', () => downloadImage(scan));
    item.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteScan(scan.id);
    });

    galleryGrid.appendChild(item);
  });
}

function deleteScan(id) {
  state.scans = state.scans.filter((s) => s.id !== id);
  saveScans();
  renderGallery();
  updateGalleryCount();
  showToast('Scanare ștearsă');
}

function clearAll() {
  if (state.scans.length === 0) {
    showToast('Nu există scanări');
    return;
  }

  if (confirm('Ștergi toate scanările?')) {
    state.scans = [];
    saveScans();
    renderGallery();
    updateGalleryCount();
    showToast('Toate scanările au fost șterse');
  }
}

function downloadAll() {
  if (state.scans.length === 0) {
    showToast('Nicio scanare de descărcat');
    return;
  }

  state.scans.forEach((scan, index) => {
    setTimeout(() => downloadImage(scan, `scan_${index + 1}`), index * 500);
  });

  showToast(`Se descarcă ${state.scans.length} fișiere...`);
}

function downloadImage(scan, filename) {
  const name =
    filename || `scan_${new Date(scan.timestamp).toISOString().slice(0, 19).replace(/[:-]/g, '')}`;

  const link = document.createElement('a');
  link.href = scan.image;
  link.download = `${name}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ===== PRESETS =====
function setPreset(preset) {
  state.currentPreset = preset;

  // Update buttons
  presetBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.preset === preset);
  });

  // Update frame guide
  if (preset === 'auto') {
    frameGuide.classList.add('hidden');
  } else {
    frameGuide.classList.remove('hidden');
    frameGuide.setAttribute('data-preset', preset);
    frameLabel.textContent = PRESETS[preset].name;
  }
}

// ===== FLASH =====
async function toggleFlash() {
  if (!state.stream) return;

  const track = state.stream.getVideoTracks()[0];
  const capabilities = track.getCapabilities ? track.getCapabilities() : {};

  if (!capabilities.torch) {
    showToast('Flash nu este disponibil');
    return;
  }

  state.flashEnabled = !state.flashEnabled;

  try {
    await track.applyConstraints({
      advanced: [{ torch: state.flashEnabled }],
    });

    flashBtn.classList.toggle('active', state.flashEnabled);
    showToast(state.flashEnabled ? 'Flash pornit' : 'Flash oprit');
  } catch (err) {
    showToast('Eroare la activare flash');
    console.error('Flash error:', err);
  }
}

// ===== STORAGE =====
function saveScans() {
  try {
    localStorage.setItem('docscanner_scans', JSON.stringify(state.scans));
  } catch (err) {
    console.warn('Storage full, clearing old scans');
    // Keep only last 3 scans
    state.scans = state.scans.slice(-3);
    try {
      localStorage.setItem('docscanner_scans', JSON.stringify(state.scans));
    } catch (e) {
      console.error('Cannot save scans:', e);
    }
  }
}

function loadScans() {
  try {
    const saved = localStorage.getItem('docscanner_scans');
    if (saved) {
      state.scans = JSON.parse(saved);
      updateGalleryCount();
    }
  } catch (err) {
    console.error('Error loading scans:', err);
    state.scans = [];
  }
}

function updateGalleryCount() {
  const badge = document.getElementById('gallery-count');
  const count = state.scans.length;

  if (badge) {
    badge.textContent = count;
    badge.classList.toggle('hidden', count === 0);
  }
}

// ===== UI HELPERS =====
function showLoading(text = 'Se încarcă...') {
  const loadingText = document.getElementById('loading-text');
  const loading = document.getElementById('loading');

  if (loadingText) loadingText.textContent = text;
  if (loading) loading.classList.remove('hidden');
}

function hideLoading() {
  const loading = document.getElementById('loading');
  if (loading) loading.classList.add('hidden');
}

function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) {
      toast.remove();
    }
  }, 3000);
}

// ===== STARTUP =====
console.log('App.js loaded');
showLoading('Se încarcă OpenCV...');

// Fallback: check if OpenCV is already loaded
if (typeof cv !== 'undefined' && cv.Mat) {
  console.log('OpenCV already available');
  state.cvReady = true;
  hideLoading();
  if (document.readyState === 'complete') {
    initApp();
  } else {
    window.addEventListener('DOMContentLoaded', initApp);
  }
}
