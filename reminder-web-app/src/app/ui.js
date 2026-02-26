export class UiState {
  constructor() {
    this.page = "home";

    // Images
    this.images = [];       // [{url, img}]
    this.currentImg = null; // HTMLImageElement
    this.msPerImage = 100;
    this._nextAt = 0;

    // Triggers / words
    this.flashEnabled = false;
    this.everyNImages = 7; // flash after every 7 images
    this._imagesSinceFlash = 0;
    this.triggerTotalMs = 100;    // total flash length (ms)
    this.words = ["OBEY", "SURRENDER", "SLEEP", "DEEPER"];

    // Flash runtime
    this._flashActive = false;
    this._flashStartMs = 0;
    this._flashTotalMs = 0;
    this._flashWord = "";
    this.overlayText = null; // null | {text, phase}
  }

  setPage(page) {
    this.page = page;
  }

  setFlashEnabled(on) {
    this.flashEnabled = !!on;
    if (!this.flashEnabled) {
      this._flashActive = false;
      this.overlayText = null;
      this._flashStartMs = 0;
      this._flashTotalMs = 0;
      this._flashWord = "";
    }
  }

  async addFiles(fileList) {
    const files = Array.from(fileList || []).filter(f => f.type.startsWith("image/"));
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      this.images.push({ url, img });
    }
  }

  clearImages() {
    for (const it of this.images) {
      try { URL.revokeObjectURL(it.url); } catch {}
    }
    this.images = [];
    this.currentImg = null;
    this._nextAt = 0;

    this._flashActive = false;
    this.overlayText = null;
  }

  addWord(raw) {
    const w = String(raw ?? "").trim();
    if (!w) return false;

    const exists = (this.words || []).some(x => String(x).toLowerCase() === w.toLowerCase());
    if (exists) return false;

    if (!this.words) this.words = [];
    this.words.push(w);
    return true;
  }

  removeWordAt(i) {
    if (!this.words) return;
    if (i < 0 || i >= this.words.length) return;
    this.words.splice(i, 1);
  }

  clearWords() {
    this.words = [];
  }

  _pickRandomImageNoRepeat() {
    if (!this.images.length) return null;
    if (this.images.length === 1) return this.images[0].img;

    let next;
    do {
      next = this.images[Math.floor(Math.random() * this.images.length)].img;
    } while (next === this.currentImg);

    return next;
  }

  startSlideshow(nowMs) {
    this._nextAt = 0;
    this.currentImg = this._pickRandomImageNoRepeat();
    this._nextAt = nowMs + this.msPerImage;

    this._imagesSinceFlash = 0;

    this._flashActive = false;
    this.overlayText = null;
  }

  currentImage() {
    // IMPORTANT: do NOT blank the image during flash; we want brief overlay only
    return this.currentImg;
  }

  currentOverlayText() {
    return this.overlayText ?? null;
  }

  _pickRandomWord() {
    const ws = (this.words || [])
      .map(w => (typeof w === "string" ? w : (w?.text ?? w?.word ?? w?.label ?? w)))
      .map(w => String(w ?? "").trim())
      .filter(Boolean);

    if (!ws.length) return "";
    return ws[Math.floor(Math.random() * ws.length)];
  }

  requestFlash(nowMs, totalMs) {
    if (!this.flashEnabled) return false;
    if (this._flashActive) return false; // don't restart during an active flash

    const word = this._pickRandomWord();
    if (!word) return false;

    this._flashActive = true;
    this._flashStartMs = nowMs;
    this._flashTotalMs = Math.max(10, Math.floor(totalMs || this.triggerTotalMs || 100));
    this._flashWord = String(word);
    this._updateFlash(nowMs);
    return true;
  }

  _updateFlash(nowMs) {
    if (!this._flashActive) return;

    const elapsed = nowMs - this._flashStartMs;
    if (elapsed >= this._flashTotalMs) {
      this._flashActive = false;
      this.overlayText = null;
      return;
    }

    const half = this._flashTotalMs / 2;
    const phase = elapsed < half ? 0 : 1;

    // EXACT shape stimulus.js expects: {text, phase}
    this.overlayText = { text: this._flashWord, phase };
  }

  updateSlideshow(nowMs) {
    // keep flash timer updated
    this._updateFlash(nowMs);

    // normal image timing
    if (!this.images.length) return;

    if (this._nextAt === 0) {
      this.currentImg = this._pickRandomImageNoRepeat();
      this._nextAt = nowMs + this.msPerImage;
      return;
    }

    if (nowMs < this._nextAt) return;

    // Advance image
    this.currentImg = this._pickRandomImageNoRepeat();
    this._nextAt = nowMs + this.msPerImage;

    // Count image advances and flash every N images
    this._imagesSinceFlash += 1;

    if (
      this.flashEnabled &&
      !this._flashActive &&
      this._imagesSinceFlash >= this.everyNImages
    ) {
      this._imagesSinceFlash = 0;
      this.requestFlash(nowMs, this.triggerTotalMs);
    }
  }
}