/* 2D geometry + land/sea fields for the Mumbai world. Pure functions (testable in Node). */
import { COAST, RIVER, HILLS, WORLD_BOUNDS } from './layout.js';

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t, cz = az + dz * t;
  return { d: Math.hypot(px - cx, pz - cz), t, cx, cz };
}

/** Distance from p to a polyline, plus the interpolated index along it. */
export function polyDist(px, pz, pts) {
  let best = Infinity, bi = 0, bt = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const r = segDist(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (r.d < best) { best = r.d; bi = i; bt = r.t; }
  }
  return { d: best, i: bi, t: bt };
}

/** Catmull-Rom (centripetal) through 2D points, resampled every `step` metres. */
export function splinePath(ctrl, step = 3) {
  if (ctrl.length === 2) {
    const [a, b] = ctrl, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(L / step)), out = [];
    for (let i = 0; i <= n; i++) out.push([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
    return out;
  }
  const P = [ctrl[0].map((v, k) => 2 * v - ctrl[1][k]), ...ctrl, ctrl[ctrl.length - 1].map((v, k) => 2 * v - ctrl[ctrl.length - 2][k])];
  const dense = [];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    const tj = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5) || 1e-4;
    const t0 = 0, t1 = t0 + tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
    const seg = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 1.0));
    for (let k = 0; k < seg; k++) {
      const t = t1 + (t2 - t1) * k / seg;
      const pt = [0, 1].map(c => {
        const A1 = (t1 - t) / (t1 - t0) * p0[c] + (t - t0) / (t1 - t0) * p1[c];
        const A2 = (t2 - t) / (t2 - t1) * p1[c] + (t - t1) / (t2 - t1) * p2[c];
        const A3 = (t3 - t) / (t3 - t2) * p2[c] + (t - t2) / (t3 - t2) * p3[c];
        const B1 = (t2 - t) / (t2 - t0) * A1 + (t - t0) / (t2 - t0) * A2;
        const B2 = (t3 - t) / (t3 - t1) * A2 + (t - t1) / (t3 - t1) * A3;
        return (t2 - t) / (t2 - t1) * B1 + (t - t1) / (t2 - t1) * B2;
      });
      dense.push(pt);
    }
  }
  dense.push(ctrl[ctrl.length - 1].slice());
  return resample(dense, step);
}

export function resample(pts, step) {
  const out = [pts[0].slice()];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    let [ax, az] = pts[i - 1]; const [bx, bz] = pts[i];
    let seg = Math.hypot(bx - ax, bz - az);
    while (acc + seg >= step) {
      const t = (step - acc) / seg;
      ax = ax + (bx - ax) * t; az = az + (bz - az) * t;
      out.push([ax, az]);
      seg = Math.hypot(bx - ax, bz - az); acc = 0;
    }
    acc += seg;
  }
  const last = pts[pts.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > step * 0.35) out.push(last.slice());
  else out[out.length - 1] = last.slice();
  return out;
}

export function polyLength(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }

/* ---------- land field: signed distance to the coast (positive = land) ---------- */
const CELL = 8;
const B = WORLD_BOUNDS;
const NX = Math.ceil((B.maxX - B.minX) / CELL) + 1, NZ = Math.ceil((B.maxZ - B.minZ) / CELL) + 1;
let SDF = null;

function riverSD(x, z) {
  const { pts, hw } = RIVER;
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const r = segDist(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    const w = hw[i] + (hw[i + 1] - hw[i]) * r.t;
    // taper the far end shut
    const sd = r.d - w;
    if (sd < best) best = sd;
  }
  return best;
}

function computeSDF() {
  SDF = new Float32Array(NX * NZ);
  for (let j = 0; j < NZ; j++) {
    const z = B.minZ + j * CELL;
    for (let i = 0; i < NX; i++) {
      const x = B.minX + i * CELL;
      let d = Infinity;
      for (let k = 0, m = COAST.length - 1; k < COAST.length; m = k++) {
        const r = segDist(x, z, COAST[m][0], COAST[m][1], COAST[k][0], COAST[k][1]);
        if (r.d < d) d = r.d;
      }
      let sd = pointInPoly(x, z, COAST) ? d : -d;
      if (sd > -40) sd = Math.min(sd, riverSD(x, z));
      SDF[j * NX + i] = sd;
    }
  }
}

/** Signed distance to the shoreline in metres (land > 0, water < 0). */
export function landSD(x, z) {
  if (!SDF) computeSDF();
  const fx = (x - B.minX) / CELL, fz = (z - B.minZ) / CELL;
  const i = Math.max(0, Math.min(NX - 2, Math.floor(fx))), j = Math.max(0, Math.min(NZ - 2, Math.floor(fz)));
  const u = Math.min(1, Math.max(0, fx - i)), v = Math.min(1, Math.max(0, fz - j));
  const a = SDF[j * NX + i], b = SDF[j * NX + i + 1], c = SDF[(j + 1) * NX + i], d = SDF[(j + 1) * NX + i + 1];
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/* deterministic value noise */
function hash2(i, j) { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j;
  const s = t => t * t * (3 - 2 * t);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  return (a + (b - a) * s(u)) * (1 - s(v)) + (c + (d - c) * s(u)) * s(v);
}

export const LAND_BASE = 2.4;
/** Natural ground height before roads are cut in. */
export function baseHeight(x, z) {
  const sd = landSD(x, z);
  let h = LAND_BASE;
  for (const hl of HILLS) {
    const d2 = ((x - hl.x) ** 2 + (z - hl.z) ** 2) / (hl.r * hl.r);
    if (d2 < 4) h += hl.h * Math.exp(-d2 * 1.6);
  }
  h += (vnoise(x / 90, z / 90) - 0.5) * 1.6 + (vnoise(x / 23, z / 23) - 0.5) * 0.35;
  if (sd < 14) {
    // bank down to the water, then the seabed
    const t = Math.max(0, Math.min(1, (sd + 6) / 20));
    const bank = t * t * (3 - 2 * t);
    const sea = -1.2 - Math.min(7, Math.max(0, -sd) * 0.12);
    h = sea + (h - sea) * bank;
  }
  return h;
}

export function isWater(x, z) { return landSD(x, z) < -2; }
