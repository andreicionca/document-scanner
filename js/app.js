// js/app.js

const DOC_TYPES = {
  'buletin-nou': { label: 'Buletin nou', ratio: 1.585 },
  'buletin-vechi': { label: 'Buletin vechi', ratio: 1.42 },
  'certificat-vechi': { label: 'Certificat naștere vechi', ratio: 1.41 },
  'certificat-nou': { label: 'Certificat naștere nou', ratio: 0.707 },
  pasaport: { label: 'Pașaport deschis', ratio: 1.41 },
  a4: { label: 'Document A4', ratio: 0.707 },
};

const TIPS = [
  '📱 Ține telefonul deasupra documentului',
  '🔲 Încadrează documentul în chenar',
  '💡 Asigură-te că ai lumină suficientă',
  '✋ Ține telefonul nemișcat la captură',
];

class ScannerApp {
  constructor() {
    this.pages = [];
    this.currentType = 'buletin-nou';
    this.stream = null;
    this.flashOn = false;
    this.currentFilter = 'original';
    this.tipInterval = null;
    this.currentTipIndex = 0;

    this.cropCorners = {
      tl: { x: 2, y: 2 },
      tr: { x: 98, y: 2 },
      bl: { x: 2, y: 98 },
      br: { x: 98, y: 98 },
    };

    this.activeDrag = null;
    this.canvasRect = null;
    this.containerRect = null;
  }

  init() {
    this.bindEvents();
    this.updatePagesUI();
  }

  bindEvents() {
    // Home - selectare tip document
    document.querySelectorAll('.doc-type').forEach((btn) => {
      btn.onclick = () => this.selectTypeAndOpenCamera(btn.dataset.type);
    });

    // Home - previzualizare și descarcă
    document.getElementById('btn-preview-pdf').onclick = () => this.showPreviewPDF();
    document.getElementById('btn-download').onclick = () => this.showDownloadModal();

    // Cameră
    document.getElementById('btn-back-home').onclick = () => this.goHome();
    document.getElementById('btn-type-selector').onclick = () => this.toggleTypeDropdown();
    document.querySelectorAll('.type-option').forEach((btn) => {
      btn.onclick = () => this.changeType(btn.dataset.type);
    });
    document.getElementById('btn-flash').onclick = () => this.toggleFlash();
    document.getElementById('btn-capture').onclick = () => this.capture();

    // Editare
    document.getElementById('btn-back-camera').onclick = () => this.showScreen('camera');
    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.onclick = () => this.applyFilter(btn.dataset.filter);
    });
    document.getElementById('btn-retake').onclick = () => this.showScreen('camera');
    document.getElementById('btn-confirm').onclick = () => this.confirmPage();

    // Confirmare (ecran nou)
    document.getElementById('btn-add-another').onclick = () => this.addAnotherPage();
    document.getElementById('btn-finish-scanning').onclick = () => this.goHome();

    // Modal descărcare
    document.getElementById('btn-modal-cancel').onclick = () => this.hideDownloadModal();
    document.getElementById('btn-modal-confirm').onclick = () => this.downloadWithOptions();

    // Preview PDF
    document.getElementById('btn-back-from-preview').onclick = () => this.showScreen('home');
    document.getElementById('btn-download-from-preview').onclick = () => this.showDownloadModal();

    // Crop corners
    this.initCropDrag();

    // Închide dropdown
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.type-selector')) {
        this.closeTypeDropdown();
      }
    });

    // Resize
    window.addEventListener('resize', () => {
      if (document.getElementById('screen-edit').classList.contains('active')) {
        this.updateCropUI();
      }
    });
  }

  // ==================== NAVIGARE ====================
  showScreen(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    document.getElementById(`screen-${name}`).classList.add('active');

    if (name === 'camera') {
      this.startTips();
    } else {
      this.stopTips();
    }

    if (name === 'edit') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.updateCropUI();
        });
      });
    }

    if (name === 'home') {
      this.updatePagesUI();
    }
  }

  goHome() {
    this.stopCamera();
    this.showScreen('home');
  }

  // ==================== CAMERĂ ====================
  async selectTypeAndOpenCamera(type) {
    this.currentType = type;
    this.updateGhidaj();
    this.updateTypeSelector();
    await this.startCamera();
    this.showScreen('camera');
  }

  async startCamera() {
    if (this.stream) return;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 4096 },
          height: { ideal: 2160 },
        },
      });
      document.getElementById('camera-preview').srcObject = this.stream;

      const track = this.stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities();
      if (!capabilities.torch) {
        document.getElementById('btn-flash').style.display = 'none';
      } else {
        document.getElementById('btn-flash').style.display = '';
      }
    } catch (err) {
      alert('Nu am putut accesa camera: ' + err.message);
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.flashOn = false;
    this.updateFlashUI();
  }

  updateGhidaj() {
    document.getElementById('ghidaj').setAttribute('data-type', this.currentType);
  }

  // ==================== SELECTOR TIP ====================
  toggleTypeDropdown() {
    document.getElementById('type-dropdown').classList.toggle('hidden');
    document.getElementById('btn-type-selector').classList.toggle('open');
  }

  closeTypeDropdown() {
    document.getElementById('type-dropdown').classList.add('hidden');
    document.getElementById('btn-type-selector').classList.remove('open');
  }

  changeType(type) {
    this.currentType = type;
    this.updateGhidaj();
    this.updateTypeSelector();
    this.closeTypeDropdown();
  }

  updateTypeSelector() {
    document.getElementById('current-type-label').textContent = DOC_TYPES[this.currentType].label;
    document.querySelectorAll('.type-option').forEach((opt) => {
      opt.classList.toggle('selected', opt.dataset.type === this.currentType);
    });
  }

  // ==================== LANTERNĂ ====================
  async toggleFlash() {
    if (!this.stream) return;

    const track = this.stream.getVideoTracks()[0];
    this.flashOn = !this.flashOn;

    try {
      await track.applyConstraints({ advanced: [{ torch: this.flashOn }] });
      this.updateFlashUI();
    } catch (err) {
      console.log('Lanterna nu e disponibilă:', err);
    }
  }

  updateFlashUI() {
    const btn = document.getElementById('btn-flash');
    btn.classList.toggle('flash-on', this.flashOn);
    document.getElementById('flash-icon-off').classList.toggle('hidden', this.flashOn);
    document.getElementById('flash-icon-on').classList.toggle('hidden', !this.flashOn);
  }

  // ==================== TIPS ====================
  startTips() {
    this.currentTipIndex = 0;
    this.showCurrentTip();
    this.tipInterval = setInterval(() => {
      this.currentTipIndex = (this.currentTipIndex + 1) % TIPS.length;
      this.showCurrentTip();
    }, 4000);
  }

  stopTips() {
    if (this.tipInterval) {
      clearInterval(this.tipInterval);
      this.tipInterval = null;
    }
  }

  showCurrentTip() {
    document.getElementById('camera-tips').innerHTML =
      `<p class="tip active">${TIPS[this.currentTipIndex]}</p>`;
  }

  // ==================== CAPTURĂ ====================
  capture() {
    const video = document.getElementById('camera-preview');
    const ghidaj = document.getElementById('ghidaj');
    const canvas = document.getElementById('edit-canvas');

    const videoRect = video.getBoundingClientRect();
    const ghidajRect = ghidaj.getBoundingClientRect();

    const scaleX = video.videoWidth / videoRect.width;
    const scaleY = video.videoHeight / videoRect.height;

    const cropX = (ghidajRect.left - videoRect.left) * scaleX;
    const cropY = (ghidajRect.top - videoRect.top) * scaleY;
    const cropWidth = ghidajRect.width * scaleX;
    const cropHeight = ghidajRect.height * scaleY;

    canvas.width = cropWidth;
    canvas.height = cropHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    this.resetCropCorners();
    this.currentFilter = 'original';
    this.updateFilterUI();
    this.updateFilterPreviews();

    this.showScreen('edit');
  }

  // ==================== CROP ====================
  resetCropCorners() {
    this.cropCorners = {
      tl: { x: 0, y: 0 },
      tr: { x: 100, y: 0 },
      bl: { x: 0, y: 100 },
      br: { x: 100, y: 100 },
    };
  }

  initCropDrag() {
    document.querySelectorAll('.crop-corner').forEach((corner) => {
      corner.addEventListener('touchstart', (e) => this.startDrag(e, corner.dataset.corner), {
        passive: false,
      });
      corner.addEventListener('mousedown', (e) => this.startDrag(e, corner.dataset.corner));
    });

    document.addEventListener('touchmove', (e) => this.onDrag(e), { passive: false });
    document.addEventListener('touchend', () => this.endDrag());
    document.addEventListener('mousemove', (e) => this.onDrag(e));
    document.addEventListener('mouseup', () => this.endDrag());
  }

  startDrag(e, cornerKey) {
    e.preventDefault();
    this.activeDrag = cornerKey;
    this.canvasRect = document.getElementById('edit-canvas').getBoundingClientRect();
    this.containerRect = document.querySelector('.crop-container').getBoundingClientRect();
  }

  onDrag(e) {
    if (!this.activeDrag) return;
    e.preventDefault();

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    let x = ((clientX - this.canvasRect.left) / this.canvasRect.width) * 100;
    let y = ((clientY - this.canvasRect.top) / this.canvasRect.height) * 100;

    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));

    this.cropCorners[this.activeDrag] = { x, y };
    this.updateCropUI();
  }

  endDrag() {
    this.activeDrag = null;
  }

  updateCropUI() {
    const canvas = document.getElementById('edit-canvas');
    const container = document.querySelector('.crop-container');
    if (!canvas || !container) return;

    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    const offsetX = canvasRect.left - containerRect.left;
    const offsetY = canvasRect.top - containerRect.top;

    Object.keys(this.cropCorners).forEach((key) => {
      const corner = document.querySelector(`.crop-corner[data-corner="${key}"]`);
      if (!corner) return;

      const pos = this.cropCorners[key];
      corner.style.left = `${offsetX + (pos.x / 100) * canvasRect.width}px`;
      corner.style.top = `${offsetY + (pos.y / 100) * canvasRect.height}px`;
      corner.style.transform = 'translate(-50%, -50%)';
    });
    const polygon = document.getElementById('crop-polygon');
    if (!polygon) return;

    const points = ['tl', 'tr', 'br', 'bl']
      .map((key) => {
        const pos = this.cropCorners[key];
        return `${offsetX + (pos.x / 100) * canvasRect.width},${offsetY + (pos.y / 100) * canvasRect.height}`;
      })
      .join(' ');

    polygon.setAttribute('points', points);
  }
  // ==================== FILTRE ====================
  applyFilter(filter) {
    this.currentFilter = filter;
    this.updateFilterUI();
    document.getElementById('edit-canvas').style.filter = this.getFilterCSS(filter);
  }
  getFilterCSS(filter) {
    switch (filter) {
      case 'grayscale':
        return 'grayscale(100%)';
      case 'high-contrast':
        return 'contrast(150%) brightness(110%)';
      case 'sharpen':
        return 'contrast(110%) brightness(105%)';
      default:
        return 'none';
    }
  }
  updateFilterUI() {
    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.filter === this.currentFilter);
    });
  }
  updateFilterPreviews() {
    const dataUrl = document.getElementById('edit-canvas').toDataURL('image/jpeg', 0.3);
    document.querySelectorAll('.filter-preview').forEach((preview) => {
      preview.style.backgroundImage = `url(${dataUrl})`;
      preview.style.backgroundSize = 'cover';
      preview.style.backgroundPosition = 'center';
    });
  }
  // ==================== CONFIRMARE PAGINĂ ====================
  confirmPage() {
    const sourceCanvas = document.getElementById('edit-canvas');
    const finalCanvas = document.createElement('canvas');
    const finalCtx = finalCanvas.getContext('2d');
    const corners = this.cropCorners;
    const minX = (Math.min(corners.tl.x, corners.bl.x) / 100) * sourceCanvas.width;
    const maxX = (Math.max(corners.tr.x, corners.br.x) / 100) * sourceCanvas.width;
    const minY = (Math.min(corners.tl.y, corners.tr.y) / 100) * sourceCanvas.height;
    const maxY = (Math.max(corners.bl.y, corners.br.y) / 100) * sourceCanvas.height;

    const cropWidth = maxX - minX;
    const cropHeight = maxY - minY;

    finalCanvas.width = cropWidth;
    finalCanvas.height = cropHeight;

    finalCtx.filter = this.getFilterCSS(this.currentFilter);
    finalCtx.drawImage(
      sourceCanvas,
      minX,
      minY,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight
    );

    const imageData = finalCanvas.toDataURL('image/jpeg', 0.9);

    this.pages.push({
      data: imageData,
      type: this.currentType,
      width: cropWidth,
      height: cropHeight,
    });

    // Arată ecranul de confirmare cu imaginea
    document.getElementById('confirm-image').src = imageData;
    this.showScreen('confirm');
  }
  addAnotherPage() {
    // Revine la cameră pentru altă poză
    this.showScreen('camera');
  }
  // ==================== PAGINI UI ====================
  updatePagesUI() {
    const section = document.getElementById('scanned-section');
    const list = document.getElementById('pages-list');
    const count = document.getElementById('pages-count');
    if (this.pages.length === 0) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    count.textContent = this.pages.length;

    list.innerHTML = this.pages
      .map(
        (page, i) => `
  <div class="page-thumb" draggable="true" data-index="${i}">
    <img src="${page.data}" alt="Pagina ${i + 1}">
    <span class="page-thumb-number">${i + 1}</span>
    <button class="page-thumb-delete" data-index="${i}">×</button>
  </div>
`
      )
      .join('');

    list.querySelectorAll('.page-thumb-delete').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        this.deletePage(parseInt(btn.dataset.index));
      };
    });

    this.initPagesDragDrop();
  }
  deletePage(index) {
    this.pages.splice(index, 1);
    this.updatePagesUI();
  }
  initPagesDragDrop() {
    const list = document.getElementById('pages-list');
    const thumbs = list.querySelectorAll('.page-thumb');
    let draggedIndex = null;
    thumbs.forEach((thumb) => {
      thumb.addEventListener('dragstart', (e) => {
        draggedIndex = parseInt(thumb.dataset.index);
        thumb.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      thumb.addEventListener('dragend', () => {
        thumb.classList.remove('dragging');
        draggedIndex = null;
      });

      thumb.addEventListener('dragover', (e) => e.preventDefault());

      thumb.addEventListener('drop', (e) => {
        e.preventDefault();
        const dropIndex = parseInt(thumb.dataset.index);
        if (draggedIndex !== null && draggedIndex !== dropIndex) {
          const [movedPage] = this.pages.splice(draggedIndex, 1);
          this.pages.splice(dropIndex, 0, movedPage);
          this.updatePagesUI();
        }
      });
    });

    this.initTouchDragDrop();
  }
  initTouchDragDrop() {
    const list = document.getElementById('pages-list');
    let touchedItem = null;
    let initialIndex = null;
    list.addEventListener('touchstart', (e) => {
      const thumb = e.target.closest('.page-thumb');
      if (!thumb || e.target.closest('.page-thumb-delete')) return;
      touchedItem = thumb;
      initialIndex = parseInt(thumb.dataset.index);
      setTimeout(() => touchedItem?.classList.add('dragging'), 200);
    });

    list.addEventListener('touchmove', (e) => {
      if (!touchedItem) return;
      const touch = e.touches[0];
      const thumbBelow = document
        .elementFromPoint(touch.clientX, touch.clientY)
        ?.closest('.page-thumb');
      if (thumbBelow && thumbBelow !== touchedItem) {
        const belowIndex = parseInt(thumbBelow.dataset.index);
        const [movedPage] = this.pages.splice(initialIndex, 1);
        this.pages.splice(belowIndex, 0, movedPage);
        initialIndex = belowIndex;
        this.updatePagesUI();
      }
    });

    list.addEventListener('touchend', () => {
      touchedItem?.classList.remove('dragging');
      touchedItem = null;
      initialIndex = null;
    });
  }
  // ==================== PREVIEW PDF ====================
  showPreviewPDF() {
    if (this.pages.length === 0) {
      alert('Adaugă cel puțin o pagină');
      return;
    }
    document.getElementById('preview-pdf-container').innerHTML = this.pages
      .map(
        (page, i) => `
  <div class="preview-pdf-page">
    <img src="${page.data}" alt="Pagina ${i + 1}">
    <span class="preview-pdf-page-number">Pagina ${i + 1} din ${this.pages.length}</span>
  </div>
`
      )
      .join('');

    this.showScreen('preview-pdf');
  }
  // ==================== MODAL DESCĂRCARE ====================
  showDownloadModal() {
    if (this.pages.length === 0) {
      alert('Adaugă cel puțin o pagină');
      return;
    }
    const input = document.getElementById('input-filename');
    const today = new Date().toISOString().split('T')[0];
    input.value = `scanare-${today}`;

    document.getElementById('modal-download').classList.remove('hidden');
    input.focus();
    input.select();
  }
  hideDownloadModal() {
    document.getElementById('modal-download').classList.add('hidden');
  }
  downloadWithOptions() {
    const format = document.querySelector('input[name="format"]:checked').value;
    let filename = document.getElementById('input-filename').value.trim();
    if (!filename) filename = 'documente-scanate';
    filename = filename.replace(/[^a-zA-Z0-9-_\s]/g, '').replace(/\s+/g, '-');

    this.hideDownloadModal();

    if (format === 'pdf') {
      this.downloadPDF(filename);
    } else {
      this.downloadImages(filename);
    }
  }
  // ==================== DESCARCĂ PDF ====================
  async downloadPDF(filename) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF();
    for (let i = 0; i < this.pages.length; i++) {
      if (i > 0) pdf.addPage();

      const page = this.pages[i];
      const img = new Image();
      img.src = page.data;
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

      pdf.addImage(page.data, 'JPEG', x, y, width, height);
    }

    pdf.save(`${filename}.pdf`);
  }
  // ==================== DESCARCĂ IMAGINI ====================
  downloadImages(filename) {
    this.pages.forEach((page, i) => {
      const link = document.createElement('a');
      link.href = page.data;
      link.download = `${filename}-${i + 1}.jpg`;
      link.click();
    });
  }
}
// Pornire aplicație
const app = new ScannerApp();
app.init();
