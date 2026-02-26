// src/app/debounce.js
console.log("debounce.js loaded");


export class ClosedEdgeTrigger {
  constructor({ closeDelayS = 0.12, openDelayS = 0.12 } = {}) {
    this.closeDelayS = closeDelayS;
    this.openDelayS = openDelayS;

    this._closedSince = null;
    this._openSince = null;
    this._active = false;
  }

  update(eyesOk, nowS) {
    let on = false;
    let off = false;

    if (!eyesOk) {
      this._openSince = null;
      if (this._closedSince === null) this._closedSince = nowS;

      if (!this._active && (nowS - this._closedSince) >= this.closeDelayS) {
        this._active = true;
        on = true;
      }
    } else {
      this._closedSince = null;
      if (this._openSince === null) this._openSince = nowS;

      if (this._active && (nowS - this._openSince) >= this.openDelayS) {
        this._active = false;
        off = true;
      }
    }

    return { on, off, active: this._active };
  }
}
