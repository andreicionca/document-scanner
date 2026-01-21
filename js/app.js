// js/app.js
const DOC_TYPES = {
  'buletin-nou': { label: 'Buletin nou', ratio: 1.585 },
  'buletin-vechi': { label: 'Buletin vechi', ratio: 1.42 },
  'certificat-vechi': { label: 'Certificat naștere vechi', ratio: 1.41 },
  'certificat-nou': { label: 'Certificat naștere nou', ratio: 0.707 },
  pasaport: { label: 'Pașaport deschis', ratio: 1.41 },
  a4: { label: 'Document A4', ratio: 0.707 },
};

class ScannerApp {
  constructor() {
    this.pages = [];
    this.currentType = null;
    this.stream = null;
  }

  init() {
    this.bindEvents();
  }

  bindEvents() {
    // Selectare tip document
    document.querySelectorAll('.doc-type').forEach((btn) => {
      btn.onclick = () => this.selectType(btn.dataset.type);
    });

    // Cameră
    document.getElementById('btn-back-home').onclick = () => this.goHome();
    document.getElementById('btn-capture').onclick = () => this.capture();

    // Preview
    document.getElementById('btn-retake').onclick = () => this.showScreen('camera');
    document.getElementById('btn-confirm').onclick = () => this.confirmPage();

    // Final
    document.getElementById('btn-add-more').onclick = () => this.goHome();
    document.getElementById('btn-download').onclick = () => this.downloadPDF();
    document.getElementById('btn-finish').onclick = () => this.showScreen('final');
  }

  async selectType(type) {
    this.currentType = type;
    await this.startCamera();

    // Setează ghidajul
    const ghidaj = document.getElementById('ghidaj');
    ghidaj.setAttribute('data-type', type);
    document.getElementById('ghidaj-label').textContent = DOC_TYPES[type].label;

    this.showScreen('camera');
  }

  async startCamera() {
    if (this.stream) return; // deja pornită

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 4096 },
          height: { ideal: 2160 },
        },
      });
      document.getElementById('preview').srcObject = this.stream;
    } catch (err) {
      alert('Nu am putut accesa camera: ' + err.message);
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  capture() {
    const video = document.getElementById('preview');
    const canvas = document.getElementById('preview-canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    this.showScreen('preview');
  }

  confirmPage() {
    const canvas = document.getElementById('preview-canvas');
    this.pages.push({
      data: canvas.toDataURL('image/jpeg', 0.9),
      type: this.currentType,
    });
    this.updatePagesIndicator();
    this.goHome();
  }

  goHome() {
    this.showScreen('home');
    this.renderPagesList();
  }

  updatePagesIndicator() {
    const indicator = document.getElementById('pages-indicator');
    const count = document.getElementById('pages-count');

    if (this.pages.length > 0) {
      indicator.classList.remove('hidden');
      count.textContent = this.pages.length;
    } else {
      indicator.classList.add('hidden');
    }
  }

  renderPagesList() {
    const list = document.getElementById('pages-list');
    list.innerHTML = this.pages
      .map(
        (page, i) => `
      <div class="page-thumb">
        <img src="${page.data}" alt="Pagina ${i + 1}">
        <span class="page-number">${i + 1}</span>
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

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF();

    for (let i = 0; i < this.pages.length; i++) {
      if (i > 0) pdf.addPage();

      const img = new Image();
      img.src = this.pages[i].data;
      await new Promise((resolve) => (img.onload = resolve));

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgRatio = img.width / img.height;

      let width = pageWidth - 20;
      let height = width / imgRatio;

      if (height > pageHeight - 20) {
        height = pageHeight - 20;
        width = height * imgRatio;
      }

      const x = (pageWidth - width) / 2;
      const y = (pageHeight - height) / 2;

      pdf.addImage(this.pages[i].data, 'JPEG', x, y, width, height);
    }

    pdf.save('documente-scanate.pdf');
  }

  showScreen(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    document.getElementById(`screen-${name}`).classList.add('active');
  }
}

const app = new ScannerApp();
app.init();
