// js/app.js
class ScannerApp {
  constructor() {
    this.pages = [];
    this.stream = null;
  }

  async init() {
    await this.startCamera();
    this.bindEvents();
  }

  async startCamera() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      document.getElementById('preview').srcObject = this.stream;
    } catch (err) {
      alert('Nu am putut accesa camera: ' + err.message);
    }
  }

  bindEvents() {
    document.getElementById('btn-capture').onclick = () => this.capture();
    document.getElementById('btn-retake').onclick = () => this.showScreen('camera');
    document.getElementById('btn-confirm').onclick = () => this.confirmPage();
    document.getElementById('btn-pages').onclick = () => this.showScreen('pages');
    document.getElementById('btn-back').onclick = () => this.showScreen('camera');
    document.getElementById('btn-add').onclick = () => this.showScreen('camera');
    document.getElementById('btn-download').onclick = () => this.downloadPDF();
  }

  capture() {
    const video = document.getElementById('preview');
    const canvas = document.getElementById('edit-canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    this.showScreen('edit');
  }

  confirmPage() {
    const canvas = document.getElementById('edit-canvas');
    this.pages.push(canvas.toDataURL('image/jpeg', 0.8));
    this.updatePageCount();
    this.showScreen('camera');
  }

  updatePageCount() {
    document.getElementById('page-count').textContent = this.pages.length;
    this.renderPages();
  }

  renderPages() {
    const list = document.getElementById('pages-list');
    list.innerHTML = this.pages
      .map(
        (src, i) => `
      <div class="page-thumb">
        <img src="${src}" alt="Pagina ${i + 1}">
      </div>
    `
      )
      .join('');
  }

  async downloadPDF() {
    if (this.pages.length === 0) {
      alert('Adaugă cel puțin o pagină');
      return;
    }

    // Versiune simplă: descarcă imaginile
    // Pentru PDF real, adăugăm jsPDF mai târziu
    const link = document.createElement('a');
    link.href = this.pages[0];
    link.download = 'scan.jpg';
    link.click();
  }

  showScreen(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    document.getElementById(`screen-${name}`).classList.add('active');
  }
}

// Pornire
const app = new ScannerApp();
app.init();
