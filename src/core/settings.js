/* Persistent player settings (per browser). Safe if storage is unavailable. */
const KEY = 'pitfall.settings.v1';

export const QUALITY = {
  low:    { label: 'Low',    pixelRatio: 0.85, shadows: 0,    terrainStep: 2, buildingsFar: 900,  props: 0.45, bloom: false, antialias: false, far: 1500 },
  medium: { label: 'Medium', pixelRatio: 1.25, shadows: 1024, terrainStep: 1, buildingsFar: 1500, props: 0.75, bloom: false, antialias: true,  far: 2400 },
  high:   { label: 'High',   pixelRatio: 2.0,  shadows: 2048, terrainStep: 1, buildingsFar: 2400, props: 1.0,  bloom: true,  antialias: true,  far: 3200 },
};

export const ASSISTS = {
  casual:   { label: 'Casual',   abs: true,  tc: true,  stability: 1.0 },
  standard: { label: 'Standard', abs: true,  tc: true,  stability: 0.5 },
  pro:      { label: 'Pro (off)', abs: false, tc: false, stability: 0 },
};

const DEFAULTS = { quality: 'auto', time: 'morning', assists: 'standard', gearbox: 'auto', volume: 0.7, muted: false, camera: 'chase', units: 'kmh', guide: true };

export function detectQuality() {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 1100);
  const cores = navigator.hardwareConcurrency || 4;
  if (mobile) return 'low';
  if (cores <= 4) return 'medium';
  return 'high';
}

export function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { s = {}; }
  return { ...DEFAULTS, ...s };
}
export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: ignore */ }
}
export function resolveQuality(s) {
  const q = s.quality === 'auto' ? detectQuality() : s.quality;
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
