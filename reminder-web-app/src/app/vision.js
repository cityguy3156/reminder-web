import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";

export class VisionEyeGate {
  constructor() {
    this.video = document.createElement("video");
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.autoplay = true;

    this.stream = null;
    this.faceLandmarker = null;

    // Output
    this.hasFace = false;
    this.leftEAR = 0;
    this.rightEAR = 0;
    this.eyesOk = false;

    // Tunables (stricter + stable)
    // Hysteresis: close at a lower threshold, reopen at a higher threshold.
    this.earCloseThresh = 0.18; // stricter "must be really closed"
    this.earOpenThresh  = 0.22; // must be clearly open again

    this.maxFps = 15;
    this._lastInferMs = 0;

    // Consecutive-frame gating
    this.closedFramesRequired = 3; // ~0.2s at 15fps
    this.openFramesRequired   = 2; // ~0.13s at 15fps
    this._closedCount = 0;
    this._openCount = 0;

    // Current state (what App should trust)
    this.eyesOk = false;


    this.lastError = "";
  }

  async start() {
    this.lastError = "";

    // Camera
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: false,
    });
    this.video.srcObject = this.stream;

    await new Promise((resolve) => {
      this.video.onloadedmetadata = () => resolve();
    });
    await this.video.play();

    // Confirm model is actually reachable (Vite: put in /public/models/)
    const modelRes = await fetch("/models/face_landmarker.task", { method: "HEAD" });
    if (!modelRes.ok) {
      throw new Error(`Missing model at /models/face_landmarker.task (HTTP ${modelRes.status}). Put it in public/models/face_landmarker.task`);
    }

    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );

    this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "/models/face_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
  }

  stop() {
    try { this.stream?.getTracks()?.forEach(t => t.stop()); } catch {}
    try { this.faceLandmarker?.close(); } catch {}

    this.stream = null;
    this.faceLandmarker = null;
    this.hasFace = false;
    this.eyesOk = false;
  }

  _dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  _ear(lm, i1, i2, i3, i4, i5, i6) {
    const p1 = lm[i1], p2 = lm[i2], p3 = lm[i3], p4 = lm[i4], p5 = lm[i5], p6 = lm[i6];
    const a = this._dist(p2, p6);
    const b = this._dist(p3, p5);
    const c = this._dist(p1, p4);
    return c > 0 ? (a + b) / (2 * c) : 0;
  }

  update(nowMs) {
    if (!this.faceLandmarker) return;

    const minDt = 1000 / this.maxFps;
    if (nowMs - this._lastInferMs < minDt) return;
    this._lastInferMs = nowMs;

    const res = this.faceLandmarker.detectForVideo(this.video, nowMs);

    const faces = res.faceLandmarks || [];
    if (!faces.length) {
      this.hasFace = false;

      // Treat "no face" as NOT OK (strict), and reset counters so we don't instantly reopen.
      this.eyesOk = false;
      this._closedCount = 0;
      this._openCount = 0;
      return;
    }

    this.hasFace = true;
    const lm = faces[0];

    // Left eye: 33,160,158,133,153,144
    // Right eye: 362,385,387,263,373,380
    const leftEAR = this._ear(lm, 33, 160, 158, 133, 153, 144);
    const rightEAR = this._ear(lm, 362, 385, 387, 263, 373, 380);

    this.leftEAR = leftEAR;
    this.rightEAR = rightEAR;

    const bothAboveOpen = (leftEAR > this.earOpenThresh) && (rightEAR > this.earOpenThresh);
    const eitherBelowClose = (leftEAR < this.earCloseThresh) || (rightEAR < this.earCloseThresh);

    // If currently OPEN, be strict about closing (close if either eye really closes for N frames)
    if (this.eyesOk) {
      if (eitherBelowClose) {
        this._closedCount++;
        this._openCount = 0;
        if (this._closedCount >= this.closedFramesRequired) {
          this.eyesOk = false;
          this._closedCount = 0;
        }
      } else {
        this._closedCount = 0;
      }
    } else {
      // If currently CLOSED, require BOTH eyes clearly open for N frames to reopen
      if (bothAboveOpen) {
        this._openCount++;
        this._closedCount = 0;
        if (this._openCount >= this.openFramesRequired) {
          this.eyesOk = true;
          this._openCount = 0;
        }
      } else {
        this._openCount = 0;
      }
    } 
 }

  statusLine() {
    if (this.lastError) return `VISION ERROR: ${this.lastError}`;
    if (!this.faceLandmarker) return "VISION: not started";
    if (!this.hasFace) return "VISION: no face";
    return `EAR L=${this.leftEAR.toFixed(3)} R=${this.rightEAR.toFixed(3)} (C<${this.earCloseThresh} O>${this.earOpenThresh}) ${this.eyesOk ? "OPEN" : "CLOSED"}`;
  }
}