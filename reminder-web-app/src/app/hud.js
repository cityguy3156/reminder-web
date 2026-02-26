export class Hud {
  constructor() {
    this.el = document.createElement("div");
    this.el.id = "hud";
    this.el.textContent = "HUD";
  }

  mount(parent) { parent.appendChild(this.el); }
  unmount() { this.el.remove(); }

  set(text) { this.el.textContent = text; }
}
