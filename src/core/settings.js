/* Persistent player settings (per browser). Safe if storage is unavailable. */
const KEY = 'pitfall.settings.v1';

export const QUALITY = {
  low:    { label: 'Low',    pixelRatio: 1.0, shadows: 1024, cascades: 0, shadowFar: 70,  terrainStep: 2, props: 0.5, post: false, ao: false, antialias: true,  far: 2200, texSize: 256 },
  medium: { label: 'Medium', pixelRatio: 1.5, shadows: 2048, cascades: 2, shadowFar: 380, terrainStep: 1, props: 0.8, post: true,  ao: false, antialias: false, far: 3200, texSize: 512 },
  high:   { label: 'High',   pixelRatio: 2.0, shadows: 2048, cascades: 3, shadowFar: 650, terrainStep: 1, props: 1.0, post: true,  ao: true,  antialias: false, far: 4200, texSize: 512 },
};

export const ASSISTS = {
  casual:   { label: 'Casual',   abs: true,  tc: true,  stability: 1.0 },
  standard: { label: 'Standard', abs: true,  tc: true,  stability: 0.5 },
  pro:      { label: 'Pro (off)', abs: false, tc: false, stability: 0 },
};

const DEFAULTS = { v: 3, quality: 'auto', time: 'golden', assists: 'standard', gearbox: 'auto', volume: 0.7, muted: false, camera: 'chase', units: 'kmh', guide: true };

export function detectQuality() {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 1100);
  if (mobile) return 'low';
  // read the actual GPU where the browser exposes it
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return 'low';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    if (/swiftshader|llvmpipe|software/i.test(gpu)) return 'low';
    if (/Intel(?!.*Arc)|Mali|Adreno|PowerVR/i.test(gpu)) return 'medium';
    if (gpu) return 'high';
  } catch { /* fall through */ }
  return (navigator.hardwareConcurrency || 4) <= 4 ? 'medium' : 'high';
}

export function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { s = {}; }
  // v3 changed the art direction: reset the camera / time defaults once
  if ((s.v || 0) < 3) { delete s.camera; delete s.time; }
  return { ...DEFAULTS, ...s, v: 3 };
}
export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: ignore */ }
}
export function resolveQuality(s) {
  // ?quality=low|medium|high overrides the saved setting (handy for testing and support)
  const forced = new URLSearchParams(location.search).get('quality');
  const q = forced in QUALITY ? forced : s.quality === 'auto' ? detectQuality() : s.quality;
  return { key: q, ...QUALITY[q] || QUALITY.medium };
}

/** Small persistent store for progress (discoveries, best lap). */
export const progressStore = {
  get(k, d) { try { const v = localStorage.getItem('pitfall.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('pitfall.' + k, JSON.stringify(v)); } catch { /* ignore */ } },
};

export function webglSupport() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return { ok: false, reason: 'WebGL is not available in this browser.' };
    return { ok: true, webgl2: !!c.getContext('webgl2') };
  } catch (e) { return { ok: false, reason: e.message }; }
}
