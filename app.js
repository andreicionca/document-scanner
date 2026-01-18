// Elemente DOM
const video = document.getElementById('video');
const canvas = document.getElementById('canvas-capture');
const imgResult = document.getElementById('img-result');
const btnCapture = document.getElementById('btn-capture');
const btnFlash = document.getElementById('btn-flash');
const btnRetry = document.getElementById('btn-retry');
const btnDownload = document.getElementById('btn-download');
const message = document.getElementById('message');
const cameraWrapper = document.getElementById('camera-wrapper');
const controls = document.getElementById('controls');
const resultWrapper = document.getElementById('result-wrapper');

// Variabile
let stream = null;
let flashOn = false;

// Pornește aplicația
init();

async function init() {
  await startCamera();
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
    message.textContent = 'Încadrează documentul în chenar';
  } catch (error) {
    console.error('Eroare cameră:', error);
    message.textContent = 'Nu am putut accesa camera';
  }
}

// Oprește camera
function stopCamera() {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
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
    console.error('Lanterna nu e disponibilă:', error);
    message.textContent = 'Lanterna nu e disponibilă';
    setTimeout(() => {
      message.textContent = 'Încadrează documentul în chenar';
    }, 2000);
  }
}

// Capturează poza
function capture() {
  // Setează canvas la dimensiunea video
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  // Desenează frame-ul curent
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);

  // Convertește în imagine
  const imageData = canvas.toDataURL('image/jpeg', 0.9);
  imgResult.src = imageData;

  // Afișează rezultatul
  showResult();
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
  startCamera();
}

// Descarcă imaginea
function download() {
  const link = document.createElement('a');
  link.download = 'document-' + Date.now() + '.jpg';
  link.href = imgResult.src;
  link.click();
}

// Event listeners
btnCapture.addEventListener('click', capture);
btnFlash.addEventListener('click', toggleFlash);
btnRetry.addEventListener('click', retry);
btnDownload.addEventListener('click', download);
