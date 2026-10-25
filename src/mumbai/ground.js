/* Ground library: grass, earth, sand, concrete, basalt, asphalt, paver blocks and
   planted soil, painted once into two mipmapped texture arrays (like facades.js):
     A (sRGB)  rgb albedo, a height
     B (linear) rg normal, b roughness, a unused
   plus a large macro-variation texture. The GLSL helpers sample each layer twice
   at different scales/rotations and blend with the macro noise, which hides
   tiling without any per-pixel hashing (so nothing shimmers). */
import * as THREE from 'three';
import { rng, periodicFbm, periodicNoise, canvas } from '../core/texgen.js';

export const G = { grass: 0, earth: 1, sand: 2, concrete: 3, rock: 4, asphalt: 5, pavers: 6, planted: 7 };
export const G_TILE = { 0: 5, 1: 5, 2: 6, 3: 4, 4: 6, 5: 5, 6: 2.4, 7: 3 };      // metres per tile
const N = 8;

const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

/** Each painter fills alb (Float32 rgb 0..255), hgt (0..1) and rough (0..1) for an S×S tile. */
const PAINT = {
  [G.grass](S, alb, hgt, rough) {
    const f1 = periodicFbm(6, 5, 11), f2 = periodicFbm(24, 3, 12), dry = periodicFbm(3, 3, 13);
    const c0 = hex('#5e6c34'), c1 = hex('#7a8842'), c2 = hex('#96915a'), soil = hex('#6b5a44');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S, i = y * S + x;
      const a = f1(u, v), b = f2(u, v), d = dry(u, v);
      let c = mixc(c0, c1, clamp01(a * 1.6 - 0.3));
      c = mixc(c, c2, clamp01((d - 0.55) * 3));
      c = mixc(c, soil, clamp01((0.32 - a) * 4) * 0.7);
      const k = 0.85 + b * 0.3;
      alb[i * 3] = c[0] * k; alb[i * 3 + 1] = c[1] * k; alb[i * 3 + 2] = c[2] * k;
      hgt[i] = b * 0.6 + a * 0.4; rough[i] = 0.92;
    }
    // blades: short strokes
    const r = rng(5);
    for (let n = 0; n < S * 40; n++) {
      const x = r() * S, y = r() * S, len = 2 + r() * S / 80, ang = -Math.PI / 2 + (r() - 0.5) * 1.2;
      const lit = 0.75 + r() * 0.5;
      for (let t = 0; t < len; t++) {
        const px = Math.floor(x + Math.cos(ang) * t + S) % S, py = Math.floor(y + Math.sin(ang) * t + S) % S, i = py * S + px;
        alb[i * 3] *= lit; alb[i * 3 + 1] *= lit * 1.02; alb[i * 3 + 2] *= lit;
        hgt[i] = Math.min(1, hgt[i] + 0.25 * (1 - t / len));
      }
    }
  },
  [G.earth](S, alb, hgt, rough) {     // compacted urban earth: red-brown laterite, grit, a few pebbles
    const f1 = periodicFbm(5, 5, 21), f2 = periodicFbm(32, 2, 22), wet = periodicFbm(3, 2, 23);
    const c0 = hex('#6e5d4b'), c1 = hex('#8a735a'), c2 = hex('#5d554c');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S, i = y * S + x;
      const a = f1(u, v), b = f2(u, v), w = wet(u, v);
      let c = mixc(c0, c1, clamp01(a * 1.5 - 0.2)); c = mixc(c, c2, clamp01((w - 0.5) * 2.5));
      const k = 0.88 + b * 0.24;
      alb[i * 3] = c[0] * k; alb[i * 3 + 1] = c[1] * k; alb[i * 3 + 2] = c[2] * k;
      hgt[i] = a * 0.5 + b * 0.5; rough[i] = 0.95;
    }
    const r = rng(9);
    for (let n = 0; n < S * 0.6; n++) {
      const cx = r() * S, cy = r() * S, rad = 0.8 + r() * S / 220, tone = 0.62 + r() * 0.25;
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
        if (dx * dx + dy * dy > rad * rad) continue;
        const px = Math.floor(cx + dx + S) % S, py = Math.floor(cy + dy + S) % S, i = py * S + px;
        alb[i * 3] = 150 * tone; alb[i * 3 + 1] = 140 * tone; alb[i * 3 + 2] = 128 * tone;
        hgt[i] = 0.7 + 0.3 * (1 - Math.hypot(dx, dy) / rad);
      }
    }
  },
  [G.sand](S, alb, hgt, rough) {      // Chowpatty: grey-beige sand with wind ripples
    const f1 = periodicFbm(4, 4, 31), f2 = periodicFbm(64, 2, 32);
    const c0 = hex('#a8977c'), c1 = hex('#c4b394');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S, i = y * S + x;
      const a = f1(u, v), b = f2(u, v);
      const rip = Math.sin((v * 22 + a * 2.2) * Math.PI * 2) * 0.5 + 0.5;
      const c = mixc(c0, c1, clamp01(a * 1.4 - 0.2 + rip * 0.12));
      const k = 0.9 + b * 0.2;
      alb[i * 3] = c[0] * k; alb[i * 3 + 1] = c[1] * k; alb[i * 3 + 2] = c[2] * k;
      hgt[i] = rip * 0.5 + b * 0.3; rough[i] = 0.97;
    }
  },
  [G.concrete](S, alb, hgt, rough) {  // cast concrete with 2 m joints and stains
    const f1 = periodicFbm(4, 5, 41), f2 = periodicFbm(48, 2, 42), st = periodicFbm(3, 3, 43);
    const c0 = hex('#9e9a92'), c1 = hex('#b3aea4'), stain = hex('#6f6a61');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S, i = y * S + x;
      const a = f1(u, v), b = f2(u, v), s = st(u, v);
      let c = mixc(c0, c1, clamp01(a * 1.3 - 0.15)); c = mixc(c, stain, clamp01((s - 0.58) * 3) * 0.6);
      const k = 0.92 + b * 0.16;
      const jx = Math.min(x % (S / 2), S / 2 - x % (S / 2)), jy = Math.min(y % (S / 2), S / 2 - y % (S / 2));
      const joint = Math.min(jx, jy) < S / 400 + 0.6 ? 0.55 : 1;
      alb[i * 3] = c[0] * k * joint; alb[i * 3 + 1] = c[1] * k * joint; alb[i * 3 + 2] = c[2] * k * joint;
      hgt[i] = joint < 1 ? 0.1 : 0.5 + b * 0.2; rough[i] = 0.88 - (s - 0.5) * 0.2;
    }
  },
  [G.rock](S, alb, hgt, rough) {      // Deccan basalt: dark, fractured
    const f1 = periodicFbm(6, 6, 51), cr = periodicNoise(10, 52), f2 = periodicFbm(40, 2, 53);
    const c0 = hex('#4e4a46'), c1 = hex('#6c665d');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S, i = y * S + x;
      const a = f1(u, v), crack = Math.abs(cr(u, v) - 0.5) < 0.02 ? 0.5 : 1, b = f2(u, v);
      const c = mixc(c0, c1, clamp01(a * 1.6 - 0.3));
      const k = (0.85 + b * 0.3) * crack;
      alb[i * 3] = c[0] * k; alb[i * 3 + 1] = c[1] * k; alb[i * 3 + 2] = c[2] * k;
      hgt[i] = a * 0.8 + b * 0.2 - (crack < 1 ? 0.3 : 0); rough[i] = 0.8;
    }
  },
  [G.asphalt](S, alb, hgt, rough) {   // worn asphalt: grey binder, light and dark aggregate
    const f1 = periodicFbm(4, 4, 61), f2 = periodicFbm(96, 2, 62);
    const c0 = hex('#3d3c3a'), c1 = hex('#4c4b48');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S, i = y * S + x;
      const a = f1(u, v), b = f2(u, v);
      const c = mixc(c0, c1, clamp01(a * 1.4 - 0.2));
      const k = 0.85 + b * 0.3;
      alb[i * 3] = c[0] * k; alb[i * 3 + 1] = c[1] * k; alb[i * 3 + 2] = c[2] * k;
      hgt[i] = b * 0.6; rough[i] = 0.86;
    }
    const r = rng(17);
    for (let n = 0; n < S * S / 40; n++) {
      const cx = r() * S, cy = r() * S, rad = 0.5 + r() * S / 420, light = r() < 0.5;
      const t = light ? 74 + r() * 26 : 42 + r() * 12;
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
        if (dx * dx + dy * dy > rad * rad) continue;
        const px = Math.floor(cx + dx + S) % S, py = Math.floor(cy + dy + S) % S, i = py * S + px;
        alb[i * 3] = t; alb[i * 3 + 1] = t * 0.98; alb[i * 3 + 2] = t * 0.95;
        hgt[i] = 0.6 + 0.4 * (1 - Math.hypot(dx, dy) / (rad + 0.01)); rough[i] = light ? 0.7 : 0.9;
      }
    }
  },
  [G.pavers](S, alb, hgt, rough) {    // footpath paver blocks, running bond, a few faded red rows
    const f1 = periodicFbm(4, 4, 71), f2 = periodicFbm(64, 2, 72);
    const grey = hex('#8c8983'), red = hex('#8a5f55'), r = rng(73);
    const rows = 12, cols = 6, bh = S / rows, bwid = S / cols;
    const tones = []; for (let k = 0; k < rows * cols * 2; k++) tones.push(0.88 + r() * 0.2);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S, i = y * S + x;
      const row = Math.floor(y / bh), off = (row % 2) * bwid / 2, xx = (x + off) % S, col = Math.floor(xx / bwid);
      const ex = Math.min(xx % bwid, bwid - xx % bwid), ey = Math.min(y % bh, bh - y % bh);
      const e = Math.min(ex, ey), jw = S / 512 * 1.5;
      const bevel = clamp01((e - jw) / (S / 256));
      const base = row % 12 === 5 ? red : grey;
      const k = tones[row * cols + col] * (0.9 + f2(u, v) * 0.2) * (0.92 + f1(u, v) * 0.16);
      const jk = e < jw ? 0.45 : 0.75 + 0.25 * bevel;
      alb[i * 3] = base[0] * k * jk; alb[i * 3 + 1] = base[1] * k * jk; alb[i * 3 + 2] = base[2] * k * jk;
      hgt[i] = e < jw ? 0 : 0.4 + 0.6 * bevel; rough[i] = 0.85;
    }
  },
  [G.planted](S, alb, hgt, rough) {   // median planting: dark soil with low clipped shrubs
    const f1 = periodicFbm(8, 5, 81), f2 = periodicFbm(32, 3, 82);
    const soil = hex('#4a3f33'), leaf0 = hex('#3d5a2a'), leaf1 = hex('#5d7a38');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S, i = y * S + x;
      const a = f1(u, v), b = f2(u, v);
      const cover = clamp01((a - 0.4) * 5);
      const c = mixc(soil, mixc(leaf0, leaf1, b), cover);
      const k = 0.8 + b * 0.35;
      alb[i * 3] = c[0] * k; alb[i * 3 + 1] = c[1] * k; alb[i * 3 + 2] = c[2] * k;
      hgt[i] = cover * (0.5 + b * 0.5); rough[i] = 0.9;
    }
  },
};

let CACHE = null;
export function groundTextures(S = 512) {
  if (CACHE && CACHE.S === S) return CACHE;
  const A = new Uint8Array(S * S * 4 * N), B = new Uint8Array(S * S * 4 * N);
  const alb = new Float32Array(S * S * 3), hgt = new Float32Array(S * S), rough = new Float32Array(S * S);
  for (let l = 0; l < N; l++) {
    PAINT[l](S, alb, hgt, rough);
    const tile = G_TILE[l], relief = 0.02 * (S / tile) * 0.5;   // ~2 cm of relief
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x, k = (l * S * S + i) * 4;
      A[k] = Math.min(255, alb[i * 3]); A[k + 1] = Math.min(255, alb[i * 3 + 1]); A[k + 2] = Math.min(255, alb[i * 3 + 2]); A[k + 3] = hgt[i] * 255;
      const xm = (x - 1 + S) % S, xp = (x + 1) % S, ym = (y - 1 + S) % S, yp = (y + 1) % S;
      const dx = (hgt[y * S + xp] - hgt[y * S + xm]) * relief, dy = (hgt[yp * S + x] - hgt[ym * S + x]) * relief;
      const len = Math.hypot(dx, dy, 1);
      B[k] = (-dx / len * 0.5 + 0.5) * 255; B[k + 1] = (-dy / len * 0.5 + 0.5) * 255; B[k + 2] = rough[i] * 255; B[k + 3] = 255;
    }
  }
  const mk = (data, srgb) => {
    const t = new THREE.DataArrayTexture(data, S, S, N);
    t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true; return t;
  };
  // macro variation: r broad tone, g medium tone, b blend mask for anti-tiling, a patchiness
  const M = 256, md = new Uint8Array(M * M * 4);
  const m1 = periodicFbm(4, 4, 91), m2 = periodicFbm(16, 3, 92), m3 = periodicFbm(8, 3, 93), m4 = periodicFbm(6, 4, 94);
  for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
    const u = x / M, v = y / M, k = (y * M + x) * 4;
    md[k] = m1(u, v) * 255; md[k + 1] = m2(u, v) * 255; md[k + 2] = m3(u, v) * 255; md[k + 3] = m4(u, v) * 255;
  }
  const macro = new THREE.DataTexture(md, M, M, THREE.RGBAFormat);
  macro.wrapS = macro.wrapT = THREE.RepeatWrapping; macro.generateMipmaps = true; macro.minFilter = THREE.LinearMipmapLinearFilter; macro.magFilter = THREE.LinearFilter; macro.needsUpdate = true;
  CACHE = { S, A: mk(A, true), B: mk(B, false), macro };
  return CACHE;
}

/* GLSL: anti-tiled sampling of one ground layer. Needs uGA, uGB (sampler2DArray), uMacro. */
export const GROUND_GLSL = /* glsl */`
precision highp sampler2DArray;
uniform sampler2DArray uGA, uGB; uniform sampler2D uMacro;
struct GSample { vec3 alb; vec2 n; float rough; float h; };
GSample gLayer(vec2 uvm, float layer, float tile, float blend) {
  vec2 uv = uvm / tile;
  vec2 uv2 = mat2(0.8, -0.6, 0.6, 0.8) * uv * 0.37 + vec2(0.31, 0.17);
  vec2 dx = dFdx(uv), dy = dFdy(uv), dx2 = dFdx(uv2), dy2 = dFdy(uv2);
  vec4 a1 = textureGrad(uGA, vec3(uv, layer), dx, dy), a2 = textureGrad(uGA, vec3(uv2, layer), dx2, dy2);
  vec4 b1 = textureGrad(uGB, vec3(uv, layer), dx, dy), b2 = textureGrad(uGB, vec3(uv2, layer), dx2, dy2);
  GSample s;
  s.alb = mix(a1.rgb, a2.rgb, blend); s.h = mix(a1.a, a2.a, blend);
  s.n = mix(b1.rg, b2.rg, blend) * 2.0 - 1.0; s.rough = mix(b1.b, b2.b, blend);
  return s;
}
vec4 gMacro(vec2 wp) { return texture(uMacro, wp / 260.0) * 0.6 + texture(uMacro, wp / 61.0 + 0.5) * 0.4; }
// tangent-space normal → view space via the screen-space cotangent frame of the UVs
vec3 gPerturb(vec3 nView, vec2 tn, vec3 viewPos, vec2 uv) {
  vec3 q0 = dFdx(viewPos), q1 = dFdy(viewPos);
  vec2 st0 = dFdx(uv), st1 = dFdy(uv);
  vec3 q1perp = cross(q1, nView), q0perp = cross(nView, q0);
  vec3 T = q1perp * st0.x + q0perp * st1.x;
  vec3 B = q1perp * st0.y + q0perp * st1.y;
  float det = max(dot(T, T), dot(B, B));
  float sc = det == 0.0 ? 0.0 : inversesqrt(det);
  return normalize(T * (tn.x * sc) + B * (tn.y * sc) + nView * sqrt(max(0.0, 1.0 - dot(tn, tn))));
}
`;

export function groundUniforms(S) {
  const T = groundTextures(S);
  return { uGA: { value: T.A }, uGB: { value: T.B }, uMacro: { value: T.macro } };
}
