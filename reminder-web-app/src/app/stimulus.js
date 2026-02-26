export class StimulusCanvas {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.id = "stimulus";
    this.ctx = this.canvas.getContext("2d");

    this._dpr = window.devicePixelRatio || 1;
    this._onResize = () => this.resize();
  }

  mount(parent) {
    parent.appendChild(this.canvas);
    window.addEventListener("resize", this._onResize);
    this.resize();
  }

  unmount() {
    window.removeEventListener("resize", this._onResize);
    this.canvas.remove();
  }

  resize() {
    const w = Math.floor(window.innerWidth * this._dpr);
    const h = Math.floor(window.innerHeight * this._dpr);
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
  }

  render({ img, eyesClosed, overlayText }) {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // --- Eyes closed screen ---
    if (eyesClosed) {
      this.ctx.fillStyle = "rgb(160, 0, 0)";
      this.ctx.fillRect(0, 0, w, h);

      this.ctx.fillStyle = "white";
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.font = "bold 48px system-ui";
      this.ctx.fillText("EYES CLOSED", w / 2, h / 2);
      return;
    }

    // --- Flash overlay (Phase 0/1) ---
    if (overlayText) {
      // overlayText can be either:
      // 1) a string  (legacy)
      // 2) { text: string, phase: 0|1 } (current)
      const text =
        typeof overlayText === "string"
          ? overlayText
          : String(overlayText.text ?? "");

      const phase =
        typeof overlayText === "object" && overlayText !== null
          ? (overlayText.phase | 0)
          : 0;

      // Phase 0 = black text on white
      // Phase 1 = white text on black
      const bg = phase === 0 ? "white" : "black";
      const fg = phase === 0 ? "black" : "white";

      this.ctx.fillStyle = bg;
      this.ctx.fillRect(0, 0, w, h);

      this.ctx.fillStyle = fg;
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      const fontSize = Math.floor(Math.min(w, h) * 0.18); 
      this.ctx.font = `bold ${fontSize}px system-ui`;
      this.ctx.fillText(text, w / 2, h / 2);
      return;
    }

    // --- Normal image draw ---
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, w, h);

    if (img) {
      const scale = Math.min(w / img.width, h / img.height);
      const iw = img.width * scale;
      const ih = img.height * scale;
      const ix = (w - iw) / 2;
      const iy = (h - ih) / 2;
      this.ctx.drawImage(img, ix, iy, iw, ih);
    }
  }
}