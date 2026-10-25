/* Procedural car audio (WebAudio) — no sample files, so no licensing questions.
   Engine: a V6-style firing note (3 pulses per crank revolution) built from
   detuned saw/square oscillators, a waveshaper for grit and a throttle-driven
   low-pass. Extra layers: intake noise, tyre squeal, wind, impacts, shift cuts. */

function noiseBuffer(ctx, seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 1234567;
  for (let i = 0; i < len; i++) { seed = (seed * 16807) % 2147483647; d[i] = (seed / 2147483647) * 2 - 1; }
  return buf;
}
function shaper(amount) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * amount) / Math.tanh(amount); }
  return c;
}

export class CarAudio {
  constructor() {
    this.ctx = null; this.started = false; this.volume = 0.7; this.muted = false;
  }

  /** Must be called from a user gesture. */
  start() {
    if (this.started) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.started = true;
    const master = this.master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);

    // ---- engine ----
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.Q.value = 2.2;
    const drive = ctx.createWaveShaper(); drive.curve = shaper(2.4); drive.oversample = '2x';
    const pre = ctx.createGain(); pre.gain.value = 0.55;
    this.oscs = [];
    const layer = (type, mult, gain, detune = 0) => {
      const o = ctx.createOscillator(); o.type = type; o.detune.value = detune;
      const g = ctx.createGain(); g.gain.value = gain;
      o.connect(g).connect(pre); o.start();
      this.oscs.push({ o, mult });
    };
    layer('sawtooth', 1, 0.45, -6);
    layer('sawtooth', 1, 0.35, 7);
    layer('square', 0.5, 0.30);
    layer('sawtooth', 2, 0.16, 3);
    layer('triangle', 4, 0.07);
    // amplitude "rasp": firing-order modulation
    this.am = ctx.createOscillator(); this.am.type = 'square';
    const amDepth = ctx.createGain(); amDepth.gain.value = 0.18;
    const amBias = ctx.createGain(); amBias.gain.value = 0.82;
    this.am.connect(amDepth).connect(amBias.gain); this.am.start();
    pre.connect(drive).connect(amBias).connect(this.engFilter).connect(this.engGain).connect(master);

    // ---- intake / exhaust noise ----
    const nb = noiseBuffer(ctx);
    const mkNoise = () => { const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true; s.start(); return s; };
    this.intake = ctx.createBiquadFilter(); this.intake.type = 'bandpass'; this.intake.Q.value = 1.4;
    this.intakeGain = ctx.createGain(); this.intakeGain.gain.value = 0;
    mkNoise().connect(this.intake).connect(this.intakeGain).connect(master);

    // ---- tyre squeal ----
    this.squealF = ctx.createBiquadFilter(); this.squealF.type = 'bandpass'; this.squealF.frequency.value = 1100; this.squealF.Q.value = 9;
    this.squealGain = ctx.createGain(); this.squealGain.gain.value = 0;
    mkNoise().connect(this.squealF).connect(this.squealGain).connect(master);
    // ---- wind ----
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'lowpass'; this.windF.frequency.value = 500;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    mkNoise().connect(this.windF).connect(this.windGain).connect(master);
    // ---- surface rumble (kerbs, rough road) ----
    this.rumbleF = ctx.createBiquadFilter(); this.rumbleF.type = 'lowpass'; this.rumbleF.frequency.value = 140;
    this.rumbleGain = ctx.createGain(); this.rumbleGain.gain.value = 0;
    mkNoise().connect(this.rumbleF).connect(this.rumbleGain).connect(master);
    this.noise = nb;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05); }
  setMuted(m) { this.muted = m; this.setVolume(this.volume); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  /** Per-frame update from the vehicle sim. */
  update(sim, surfaceRough = 0) {
    if (!this.started || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime, k = 0.03;
    const rpm = sim.rpm;
    const fire = rpm / 60 * 3;                       // V6: 3 firing pulses per revolution
    for (const { o, mult } of this.oscs) o.frequency.setTargetAtTime(fire * mult, t, k);
    this.am.frequency.setTargetAtTime(fire / 3, t, k);
    const thr = sim.throttleOut;
    const load = 0.25 + thr * 0.75;
    let g = (0.10 + 0.20 * load) * (0.6 + 0.4 * Math.min(1, rpm / 9000));
    if (sim.limiter) g *= 0.55 + 0.45 * Math.round((t * 22) % 1);   // limiter stutter
    this.engGain.gain.setTargetAtTime(g, t, sim.shiftTimer > 0 ? 0.01 : k);
    this.engFilter.frequency.setTargetAtTime(500 + thr * 3800 + rpm * 0.18, t, k);
    this.intake.frequency.setTargetAtTime(400 + rpm * 0.25, t, k);
    this.intakeGain.gain.setTargetAtTime(0.02 + 0.07 * thr * rpm / 13000, t, k);

    let slide = 0;
    for (const w of sim.wheels) if (w.contact) slide = Math.max(slide, w.sliding + Math.max(0, Math.abs(w.slipAngle) - 0.12) * 2.2);
    const sp = sim.speed;
    const onRoad = sim.wheels.some(w => w.contact && w.surface.kind === 'road');
    this.squealGain.gain.setTargetAtTime(onRoad ? Math.min(0.22, slide * 0.3) * Math.min(1, sp / 6) : 0, t, 0.05);
    this.squealF.frequency.setTargetAtTime(900 + slide * 500, t, 0.05);
    this.windGain.gain.setTargetAtTime(Math.min(0.22, sp * sp * 0.000045), t, 0.1);
    this.windF.frequency.setTargetAtTime(300 + sp * 14, t, 0.1);
    this.rumbleGain.gain.setTargetAtTime(Math.min(0.35, surfaceRough * sp * 0.02), t, 0.05);

    if (sim.shifted > 0) this.pop(0.09, 1800);
    if (sim.impact > 2500) this.thump(Math.min(1, sim.impact / 20000));
  }

  pop(gain, freq) {
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random()); s.stop(t + 0.15);
  }
  thump(strength) {
    const now = this.ctx.currentTime;
    if (this._lastThump && now - this._lastThump < 0.15) return;
    this._lastThump = now;
    const ctx = this.ctx, t = now;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(35, t + 0.25);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5 * strength, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.32);
    this.pop(0.35 * strength, 700);
  }
  /** Two-tone car horn; `pitch` lets other vehicles answer in a different voice. */
  horn(pitch = 1, dur = 0.42, gain = 0.16) {
    if (!this.started) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.02); g.gain.setValueAtTime(gain, t + dur - 0.05); g.gain.linearRampToValueAtTime(0, t + dur);
    for (const fr of [415 * pitch, 523 * pitch]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = fr; o.connect(f); o.start(t); o.stop(t + dur + 0.02); }
    f.connect(g).connect(this.master);
  }
  /** Bright arpeggio for pickups. */
  pickup(n = 0) {
    if (!this.started) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const base = 740 * Math.pow(2, (n % 5) / 12);
    [1, 1.26, 1.5, 2].forEach((m, i) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = base * m;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t + i * 0.05); g.gain.linearRampToValueAtTime(0.14, t + i * 0.05 + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.05 + 0.25);
      o.connect(g).connect(this.master); o.start(t + i * 0.05); o.stop(t + i * 0.05 + 0.3);
    });
  }
  /** Hollow plastic "tock" for knocking props over. */
  tock(strength = 0.5, pitch = 1) {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    if (this._lastTock && now - this._lastTock < 0.04) return; this._lastTock = now;
    const ctx = this.ctx, t = now;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(320 * pitch, t); o.frequency.exponentialRampToValueAtTime(140 * pitch, t + 0.12);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.25 * strength, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.16);
  }
  /** Wing flutter for pigeons. */
  flutter() {
    if (!this.started) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
    for (let k = 0; k < 14; k++) { g.gain.linearRampToValueAtTime(0.12 * (1 - k / 14), t + k * 0.05 + 0.02); g.gain.linearRampToValueAtTime(0.01, t + k * 0.05 + 0.045); }
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random()); s.stop(t + 0.8);
  }
  /** Start-light beep (go = higher, longer). */
  beep(go = false) {
    if (!this.started) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = go ? 1320 : 660;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.1, t); g.gain.exponentialRampToValueAtTime(0.001, t + (go ? 0.6 : 0.18));
    o.connect(g).connect(this.master); o.start(t); o.stop(t + (go ? 0.62 : 0.2));
  }
  /** UI blip for discoveries. */
  chime() {
    if (!this.started) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [660, 880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t + i * 0.07); g.gain.linearRampToValueAtTime(0.12, t + i * 0.07 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.5);
      o.connect(g).connect(this.master); o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.55);
    });
  }
}
