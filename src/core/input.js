/* Input — keyboard, gamepad and touch merged into one control state.
   Driving keys are only captured while `enabled` is true, so menus and
   portfolio panels keep normal keyboard behaviour (Tab, Space, Enter…). */

const DRIVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyQ', 'KeyE', 'ShiftLeft', 'ControlLeft']);

export const CONTROLS = [
  ['W / ↑', 'Throttle'],
  ['S / ↓', 'Brake · hold at a stop to reverse'],
  ['A D / ← →', 'Steer'],
  ['Space', 'Handbrake'],
  ['E / Q', 'Shift up / down (manual gearbox)'],
  ['C', 'Change camera'],
  ['R', 'Recover car to the road'],
  ['M', 'Toggle map size'],
  ['G', 'Toggle route guidance'],
  ['F', 'Interact / open nearby destination'],
  ['Esc', 'Pause · close panels'],
];

export class Input {
  constructor() {
    this.enabled = false;
    this.keys = new Set();
    this.state = { throttle: 0, brake: 0, steer: 0, handbrake: false, shiftUp: false, shiftDown: false, analog: false };
    this.touch = { throttle: 0, brake: 0, steer: 0, handbrake: false, active: false };
    this.handlers = {};          // action name → callback (camera, reset, pause…)
    this._down = e => this.onKey(e, true);
    this._up = e => this.onKey(e, false);
    addEventListener('keydown', this._down);
    addEventListener('keyup', this._up);
    addEventListener('blur', () => this.keys.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.keys.clear(); });
    this.prevPad = {};
  }

  on(action, fn) { this.handlers[action] = fn; return this; }
  fire(action) { const h = this.handlers[action]; if (h) h(); }

  onKey(e, down) {
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (typing) return;
    if (e.code === 'Escape' && down) { this.fire('escape'); return; }
    if (!this.enabled) { if (!down) this.keys.delete(e.code); return; }
    if (DRIVE_KEYS.has(e.code)) e.preventDefault();
    if (down) {
      if (e.repeat) { this.keys.add(e.code); return; }
      this.keys.add(e.code);
      switch (e.code) {
        case 'KeyE': this.state.shiftUp = true; break;
        case 'KeyQ': this.state.shiftDown = true; break;
        case 'KeyC': this.fire('camera'); break;
        case 'KeyR': this.fire('reset'); break;
        case 'KeyM': this.fire('map'); break;
        case 'KeyG': this.fire('guide'); break;
        case 'KeyF': case 'Enter': this.fire('interact'); break;
        case 'KeyH': this.fire('help'); break;
      }
    } else this.keys.delete(e.code);
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) { this.keys.clear(); this.state.throttle = this.state.brake = this.state.steer = 0; this.state.handbrake = false; }
    else if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); // stop Space "clicking" buttons
  }

  /** Call once per frame. Keyboard pedals ramp instead of snapping. */
  update(dt) {
    const k = this.keys, s = this.state;
    if (!this.enabled) return s;
    let thr = (k.has('KeyW') || k.has('ArrowUp')) ? 1 : 0;
    let brk = (k.has('KeyS') || k.has('ArrowDown')) ? 1 : 0;
    let steer = ((k.has('KeyA') || k.has('ArrowLeft')) ? 1 : 0) - ((k.has('KeyD') || k.has('ArrowRight')) ? 1 : 0);
    let hb = k.has('Space');
    let analog = false;

    // gamepad (standard mapping)
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || p.mapping !== 'standard') continue;
      const ax = p.axes[0] || 0;
      if (Math.abs(ax) > 0.08) { steer = -Math.sign(ax) * ((Math.abs(ax) - 0.08) / 0.92) ** 1.4; analog = true; }
      const rt = p.buttons[7]?.value || 0, lt = p.buttons[6]?.value || 0;
      if (rt > 0.02) thr = Math.max(thr, rt);
      if (lt > 0.02) brk = Math.max(brk, lt);
      if (p.buttons[0]?.pressed) hb = true;
      const edge = (i, fn) => { const pr = !!p.buttons[i]?.pressed; if (pr && !this.prevPad[i]) fn(); this.prevPad[i] = pr; };
      edge(5, () => s.shiftUp = true); edge(4, () => s.shiftDown = true);
      edge(3, () => this.fire('camera')); edge(2, () => this.fire('interact'));
      edge(9, () => this.fire('escape')); edge(8, () => this.fire('reset'));
      break;
    }
    // touch
    const t = this.touch;
    if (t.active) {
      thr = Math.max(thr, t.throttle); brk = Math.max(brk, t.brake);
      if (Math.abs(t.steer) > 0.01) { steer = t.steer; analog = true; }
      hb = hb || t.handbrake;
    }
    const ramp = (cur, target, up, down) => cur + Math.max(-down * dt, Math.min(up * dt, target - cur));
    s.throttle = ramp(s.throttle, thr, 7, 12);
    s.brake = ramp(s.brake, brk, 9, 14);
    s.steer = steer;
    s.analog = analog;
    s.handbrake = hb;
    return s;
  }

  dispose() {
    removeEventListener('keydown', this._down);
    removeEventListener('keyup', this._up);
  }
}
