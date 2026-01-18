// Elemente DOM
const video = document.getElementById('video');
const canvasScan = document.getElementById('canvas-scan');
const canvasResult = document.getElementById('canvas-result');
const btnStart = document.getElementById('btn-start');
const btnCapture = document.getElementById('btn-capture');
const btnFlash = document.getElementById('btn-flash');
const btnRetry = document.getElementById('btn-retry');
const btnDownload = document.getElementById('btn-download');
const message = document.getElementById('message');
const guideFrame = document.getElementById('guide-frame');
const startScreen = document.getElementById('start-screen');
const cameraWrapper = document.getElementById('camera-wrapper');
const controls = document.getElementById('controls');
const resultWrapper = document.getElementById('result-wrapper');

// Variabile
let stream = null;
let scanner = null;
let scanInterval = null;
let flashOn = false;
let isDocumentDetected = false;
let openCvReady = false;

// Verifică dacă OpenCV s-a încărcat
function waitForOpenCV(callback) {
  if (typeof cv !== 'undefined' && cv.Mat) {
    openCvReady = true;
    callback();
  } else {
    setTimeout(() => waitForOpenCV(callback), 100);
  }
}

// Pornește camera (când apeși butonul)
async function start() {
  // Ascunde ecranul de start
  startScreen.classList.add('hidden');
  cameraWrapper.classList.remove('hidden');
  controls.classList.remove('hidden');

  message.textContent = 'Se încarcă OpenCV...';

  // Așteaptă OpenCV
  waitForOpenCV(async () => {
    scanner = new jscanify();
    message.textContent = 'Se pornește camera...';
    await startCamera();
  });
}

// Pornește camera
async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1440 },
      },
    });

    video.srcObject = stream;

    video.onloadedmetadata = () => {
      video.play();
      message.textContent = 'Încadrează documentul în chenar';
      startScanning();
    };
  } catch (error) {
    console.error('Eroare cameră:', error);
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

// Scanare continuă pentru detectare document
function startScanning() {
  const ctx = canvasScan.getContext('2d');

  scanInterval = setInterval(() => {
    if (video.readyState !== video.HAVE_ENOUGH_DATA) return;

    canvasScan.width = video.videoWidth;
    canvasScan.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    try {
      const contour = scanner.findPaperContour(canvasScan);

      if (contour && isValidDocument(contour)) {
        setDetected(true);
      } else {
        setDetected(false);
      }
    } catch (e) {
      // Ignoră erorile OpenCV ocazionale
    }
  }, 200);
}

// Verifică dacă documentul e suficient de mare
function isValidDocument(contour) {
  if (!contour || !contour.data || contour.data.length < 8) return false;

  // Calculează aria din punctele conturului
  const points = [];
  for (let i = 0; i < contour.data.length; i += 2) {
    points.push({ x: contour.data[i], y: contour.data[i + 1] });
  }

  if (points.length < 4) return false;

  // Aria minimă: 10% din cadru
  const frameArea = canvasScan.width * canvasScan.height;
  const minArea = frameArea * 0.1;

  // Calculează aria aproximativă (bounding box)
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const area = width * height;

  return area > minArea;
}

// Setează starea de detectare
function setDetected(detected) {
  if (detected === isDocumentDetected) return;

  isDocumentDetected = detected;

  if (detected) {
    guideFrame.classList.add('detected');
    message.classList.add('success');
    message.textContent = 'Document detectat! Apasă butonul';
    btnCapture.disabled = false;
  } else {
    guideFrame.classList.remove('detected');
    message.classList.remove('success');
    message.textContent = 'Încadrează documentul în chenar';
    btnCapture.disabled = true;
  }
}

// Toggle lanternă
async function toggleFlash() {
  if (!stream) return;

  const track = stream.getVideoTracks()[0];

  try {
    flashOn = !flashOn;
    await track.applyConstraints({
      advanced: [{ torch: flashOn }],
    });
    btnFlash.classList.toggle('active', flashOn);
  } catch (error) {
    message.textContent = 'Lanterna nu e disponibilă';
    setTimeout(() => {
      message.textContent = isDocumentDetected
        ? 'Document detectat! Apasă butonul'
        : 'Încadrează documentul în chenar';
    }, 2000);
  }
}

// Capturează și decupează documentul
function capture() {
  if (!isDocumentDetected) return;

  const ctx = canvasScan.getContext('2d');
  canvasScan.width = video.videoWidth;
  canvasScan.height = video.videoHeight;
  ctx.drawImage(video, 0, 0);

  try {
    // Decupează și corectează perspectiva
    // A4 la 150 DPI: 1240 x 1754 px (pentru calitate bună)
    const resultCanvas = scanner.extractPaper(canvasScan, 1240, 1754);

    // Copiază în canvas-ul de rezultat
    canvasResult.width = resultCanvas.width;
    canvasResult.height = resultCanvas.height;
    canvasResult.getContext('2d').drawImage(resultCanvas, 0, 0);

    showResult();
  } catch (e) {
    console.error('Eroare la decupare:', e);
    message.textContent = 'Eroare. Încearcă din nou.';
    message.classList.remove('success');
  }
}

// Afișează rezultatul
function showResult() {
  stopCamera();
  cameraWrapper.classList.add('hidden');
  controls.classList.add('hidden');
  resultWrapper.classList.add('visible');
}

// Încearcă din nou
function retry() {
  resultWrapper.classList.remove('visible');
  cameraWrapper.classList.remove('hidden');
  controls.classList.remove('hidden');
  flashOn = false;
  btnFlash.classList.remove('active');
  isDocumentDetected = false;
  btnCapture.disabled = true;

  waitForOpenCV(async () => {
    scanner = new jscanify();
    await startCamera();
  });
}

// Descarcă imaginea
function download() {
  const link = document.createElement('a');
  link.download = 'document-' + Date.now() + '.jpg';
  link.href = canvasResult.toDataURL('image/jpeg', 0.9);
  link.click();
}

// Event listeners
btnStart.addEventListener('click', start);
btnCapture.addEventListener('click', capture);
btnFlash.addEventListener('click', toggleFlash);
btnRetry.addEventListener('click', retry);
btnDownload.addEventListener('click', download);
