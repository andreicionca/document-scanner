// Elemente DOM
const video = document.getElementById('video');
const canvasScan = document.getElementById('canvas-scan');
const canvasResult = document.getElementById('canvas-result');
const btnCapture = document.getElementById('btn-capture');
const btnRetry = document.getElementById('btn-retry');
const btnDownload = document.getElementById('btn-download');
const message = document.getElementById('message');
const guideFrame = document.querySelector('.guide-frame');
const cameraWrapper = document.querySelector('.camera-wrapper');
const resultWrapper = document.getElementById('result-wrapper');

// Variabile globale
let scanner = null;
let stream = null;
let isDocumentDetected = false;
let scanInterval = null;

// Așteptăm să se încarce OpenCV
function waitForOpenCV(callback) {
  if (typeof cv !== 'undefined' && cv.Mat) {
    callback();
  } else {
    setTimeout(() => waitForOpenCV(callback), 100);
  }
}

// Inițializare
function init() {
  waitForOpenCV(() => {
    console.log('OpenCV încărcat!');
    scanner = new jscanify();
    startCamera();
  });
}

// Pornește camera
async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment', // Camera din spate
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });

    video.srcObject = stream;
    video.onloadedmetadata = () => {
      video.play();
      startScanning();
    };
  } catch (error) {
    console.error('Eroare la accesarea camerei:', error);
    message.textContent = 'Nu am putut accesa camera';
  }
}

// Oprește camera
function stopCamera() {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
}

// Începe scanarea continuă
function startScanning() {
  const ctx = canvasScan.getContext('2d');

  scanInterval = setInterval(() => {
    if (video.readyState !== video.HAVE_ENOUGH_DATA) return;

    // Setează dimensiunile canvas-ului
    canvasScan.width = video.videoWidth;
    canvasScan.height = video.videoHeight;

    // Desenează frame-ul curent
    ctx.drawImage(video, 0, 0);

    // Detectează documentul
    try {
      const corners = scanner.findPaperContour(canvasScan);

      if (corners && isValidDocument(corners)) {
        documentDetected();
      } else {
        documentNotDetected();
      }
    } catch (e) {
      // OpenCV poate arunca erori ocazional
    }
  }, 200); // Verifică de 5 ori pe secundă
}

// Verifică dacă documentul detectat e valid (suficient de mare)
function isValidDocument(corners) {
  if (!corners || corners.length < 4) return false;

  // Calculează aria aproximativă
  const width = Math.abs(corners[1].x - corners[0].x);
  const height = Math.abs(corners[2].y - corners[0].y);
  const area = width * height;

  // Documentul trebuie să ocupe cel puțin 10% din cadru
  const frameArea = canvasScan.width * canvasScan.height;
  return area > frameArea * 0.1;
}

// Document detectat
function documentDetected() {
  if (!isDocumentDetected) {
    isDocumentDetected = true;
    guideFrame.classList.add('detected');
    message.classList.add('success');
    message.textContent = 'Document detectat! Apasă butonul';
    btnCapture.disabled = false;
  }
}

// Document nu e detectat
function documentNotDetected() {
  if (isDocumentDetected) {
    isDocumentDetected = false;
    guideFrame.classList.remove('detected');
    message.classList.remove('success');
    message.textContent = 'Încadrează documentul în chenar';
    btnCapture.disabled = true;
  }
}

// Capturează documentul
function captureDocument() {
  if (!isDocumentDetected) return;

  const ctx = canvasScan.getContext('2d');
  canvasScan.width = video.videoWidth;
  canvasScan.height = video.videoHeight;
  ctx.drawImage(video, 0, 0);

  try {
    // Extrage și corectează perspectiva
    const resultCanvas = scanner.extractPaper(canvasScan, 600, 400);

    // Copiază rezultatul
    canvasResult.width = resultCanvas.width;
    canvasResult.height = resultCanvas.height;
    canvasResult.getContext('2d').drawImage(resultCanvas, 0, 0);

    // Afișează rezultatul
    showResult();
  } catch (e) {
    console.error('Eroare la extragere:', e);
    message.textContent = 'Eroare. Încearcă din nou.';
  }
}

// Afișează rezultatul
function showResult() {
  stopCamera();
  cameraWrapper.classList.add('hidden');
  btnCapture.classList.add('hidden');
  resultWrapper.classList.add('visible');
}

// Încearcă din nou
function retry() {
  resultWrapper.classList.remove('visible');
  cameraWrapper.classList.remove('hidden');
  btnCapture.classList.remove('hidden');
  isDocumentDetected = false;
  btnCapture.disabled = true;
  startCamera();
}

// Descarcă imaginea
function downloadImage() {
  const link = document.createElement('a');
  link.download = 'document-scanat.png';
  link.href = canvasResult.toDataURL('image/png');
  link.click();
}

// Event listeners
btnCapture.addEventListener('click', captureDocument);
btnRetry.addEventListener('click', retry);
btnDownload.addEventListener('click', downloadImage);

// Pornește aplicația
init();
