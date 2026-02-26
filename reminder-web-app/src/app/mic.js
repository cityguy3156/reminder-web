export class MicRmsGate {
  constructor() {
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.data = null;

    this.rms = 0;
    this.threshold = 0.03;      // tweak later
    this.holdMs = 120;          // must exceed threshold this long to "fail"
    this._overSince = null;

    this.activeFail = false;    // true if currently failing (debounced)
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = this.ctx.createMediaStreamSource(this.stream);

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.data = new Float32Array(this.analyser.fftSize);

    src.connect(this.analyser);
  }

  stop() {
    try { this.stream?.getTracks()?.forEach(t => t.stop()); } catch {}
    try { this.ctx?.close(); } catch {}
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.data = null;
    this.rms = 0;
    this._overSince = null;
    this.activeFail = false;
  }

  update(nowMs) {
    if (!this.analyser || !this.data) return { rms: 0, fail: false };

    this.analyser.getFloatTimeDomainData(this.data);

    let sum = 0;
    for (let i = 0; i < this.data.length; i++) {
      const v = this.data[i];
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.data.length);
    this.rms = rms;

    const over = rms >= this.threshold;

    if (over) {
      if (this._overSince === null) this._overSince = nowMs;
      if (!this.activeFail && (nowMs - this._overSince) >= this.holdMs) {
        this.activeFail = true;
      }
    } else {
      this._overSince = null;
      this.activeFail = false;
    }

    return { rms: this.rms, fail: this.activeFail };
  }
}
