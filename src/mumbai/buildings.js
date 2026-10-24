/* Toy-diorama city blocks: pillowy rounded buildings with bold framed windows,
   doors and striped awnings drawn in the shader, plus real 3D street-front
   details (AC units, awnings, shop signs) on buildings facing the road. */
import * as THREE from 'three';
import { DISTRICTS, RESERVED, PARKS, PLAZAS, WORLD_BOUNDS as WB } from './layout.js';
import { landSD } from './geo2d.js';
import { rng, canvasTexture } from '../core/geo.js';
import { insideSlab } from './diorama.js';

export const STYLE = { roof: 0, residential: 1, glass: 2, deco: 3, heritage: 4, office: 5, chawl: 6, industrial: 7, bungalow: 8, tiles: 9, plain: 10 };

const FACADE_GLSL = /* glsl */`
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float rbox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
`;

/** Window, frame, door and awning shapes per style, in metres within one facade cell. */
export function facadeMaterial(nightU) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uNight = nightU;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 fuv; attribute vec4 fac; varying vec2 vFuv; varying vec4 vFac;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vFuv = fuv; vFac = fac;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight; varying vec2 vFuv; varying vec4 vFac;\n' + FACADE_GLSL + '\nfloat gGlass; float gLit; vec3 gLitCol;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float style = floor(vFac.x + 0.5), fh = vFac.y, bw = vFac.z, seed = floor(vFac.w + 0.5);   // rounded: interpolated varyings jitter, and hashes amplify jitter
        vec2 fu = vFuv;
        float fl = floor(fu.y / fh);
        vec2 cell = vec2(floor(fu.x / bw), fl);
        vec2 pm = (vec2(fract(fu.x / bw), fract(fu.y / fh)) - 0.5) * vec2(bw, fh);   // metres from cell centre
        float r = h21(cell + seed * 17.13);
        float aw = max(fwidth(pm.x), fwidth(pm.y)) * 1.2 + 0.004;
        vec3 wall = diffuseColor.rgb;
        vec3 frameCol = vec3(0.96, 0.93, 0.86);
        vec3 glassTop = vec3(0.42, 0.6, 0.82), glassBot = vec3(0.13, 0.2, 0.38);
        float d = 9.0, frameW = 0.14, glassOnly = 0.0;
        vec2 wsize = vec2(0.55, 0.7); vec2 wofs = vec2(0.0, 0.15); float wr = 0.18;
        gLitCol = vec3(1.0, 0.78, 0.45);
        bool ground = fl < 0.5;
        bool shop = fract(seed * 7.31) > 0.3 && ground;
        if (style < 0.5 || style > 8.5) {
          if (style > 8.5 && style < 9.5) wall *= 0.86 + 0.14 * step(0.25, fract(fu.y * 2.6));    // tile courses
        } else {
          if (style < 1.5) { wsize = vec2(0.55, 0.68); }
          else if (style < 2.5) { wsize = vec2(bw * 0.5 - 0.08, fh * 0.5 - 0.06); wofs = vec2(0.0); wr = 0.05; frameW = 0.0; glassOnly = 1.0; glassTop = vec3(0.45, 0.72, 0.9); glassBot = vec3(0.18, 0.42, 0.66); gLitCol = vec3(0.85, 0.94, 1.0); }
          else if (style < 3.5) { wsize = vec2(0.42, 0.95); wofs = vec2(0.0, 0.1); wr = 0.4; }
          else if (style < 4.5) { wsize = vec2(0.6, 1.05); wofs = vec2(0.0, 0.05); wr = 0.58; }
          else if (style < 5.5) { wsize = vec2(bw * 0.5 + 0.02, 0.62); wofs = vec2(0.0, 0.25); wr = 0.0; frameW = 0.0; glassOnly = 1.0; gLitCol = vec3(0.92, 0.96, 1.0); }
          else if (style < 6.5) { wsize = vec2(0.45, 0.62); wofs = vec2(0.0, 0.25); }
          else if (style < 7.5) { wsize = vec2(bw * 0.4, 0.35); wofs = vec2(0.0, fh * 0.28); wr = 0.1; wall *= 0.9 + 0.1 * step(0.5, fract(fu.x * 1.6)); }
          else { wsize = vec2(0.5, 0.6); wofs = vec2(0.0, 0.1); }
          d = rbox(pm - wofs, wsize, min(wr, min(wsize.x, wsize.y)));
          // chawl: open corridor band with white railing on every floor
          if (style > 5.5 && style < 6.5) {
            float band = step(pm.y, -fh * 0.5 + 0.9);
            wall = mix(wall, wall * 0.62, band);
            wall = mix(wall, frameCol, band * step(0.75, fract(fu.x * 1.25)) * step(-fh * 0.5 + 0.1, pm.y));
          }
          // bungalow shutters
          if (style > 7.5) { float sh = step(abs(abs(pm.x) - 0.72), 0.17) * step(abs(pm.y - 0.1), 0.6); wall = mix(wall, mix(vec3(0.2,0.55,0.45), vec3(0.75,0.3,0.25), step(0.5, fract(seed))), sh); }
          // ground floor: doors, shop openings and striped awnings
          if (ground && style < 7.5 && !(style > 1.5 && style < 2.5)) {
            if (shop) {
              d = rbox(pm - vec2(0.0, -0.25), vec2(bw * 0.5 - 0.3, fh * 0.5 - 0.6), 0.1);
              float awn = step(abs(pm.y - (fh * 0.5 - 0.45)), 0.32) * step(abs(pm.x), bw * 0.5 - 0.15);
              vec3 ac = h21(vec2(cell.x * 0.37, seed)) < 0.33 ? vec3(0.86, 0.18, 0.16) : h21(vec2(cell.x * 0.37, seed)) < 0.66 ? vec3(0.13, 0.55, 0.42) : vec3(0.2, 0.4, 0.78);
              wall = mix(wall, mix(ac, vec3(0.97), step(0.5, fract(fu.x * 1.4))), awn);
              glassTop = vec3(0.98, 0.85, 0.55); glassBot = vec3(0.55, 0.32, 0.18);
              gLitCol = vec3(1.0, 0.86, 0.6);
            } else if (fract(cell.x * 0.334 + seed) < 0.34) {
              d = rbox(pm - vec2(0.0, -0.35), vec2(0.6, 1.25), 0.25);
              glassTop = vec3(0.55, 0.32, 0.2); glassBot = vec3(0.38, 0.2, 0.12);
            }
          }
        }
        float inside = 1.0 - smoothstep(-aw, aw, d + frameW);
        float framed = (1.0 - smoothstep(-aw, aw, d)) - inside;
        // bevelled frame: lit from above
        float bevel = clamp(0.5 + (pm.y - wofs.y) * 0.35, 0.0, 1.0);
        vec3 fc = frameCol * (0.82 + 0.25 * bevel);
        float gy = clamp((pm.y - wofs.y) / (wsize.y * 2.0) + 0.5, 0.0, 1.0);
        vec3 gc = mix(glassBot, glassTop, gy);
        gc += 0.18 * step(0.82, fract((pm.x + pm.y) * 0.9 + 0.2)) * (1.0 - glassOnly * 0.5);   // diagonal highlight
        if (r > 0.9 && style > 0.5 && style < 8.5 && !(style > 1.5 && style < 2.5) && !ground) { gc = mix(wall, vec3(0.95, 0.9, 0.82), 0.5); }  // a few curtains drawn
        // soft ambient occlusion at the base and a little sky light at the top
        wall *= mix(0.72, 1.0, smoothstep(0.0, 2.2, fu.y));
        // far away: blend to average so windows don't shimmer
        float far = smoothstep(0.08, 0.25, aw);
        inside *= 1.0 - far * 0.6; framed *= 1.0 - far;
        vec3 col = mix(wall, fc, framed);
        col = mix(col, gc, inside);
        gGlass = inside;
        gLit = step(0.5, h21(cell + seed * 3.7 + 0.5)) * inside;
        diffuseColor.rgb = col;
      `)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.18, gGlass);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += gLitCol * gLit * uNight * 1.7;');
  };
  return m;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };

/* ---------- geometry accumulator (indexed; winding fixed to the intended normal) ---------- */
export class FacadeBuilder {
  constructor() { this.P = []; this.N = []; this.C = []; this.U = []; this.F = []; this.I = []; this.n = 0; }
  vert(p, n, col, uv, fac) {
    this.P.push(p[0], p[1], p[2]); this.N.push(n[0], n[1], n[2]); this.C.push(col.r, col.g, col.b);
    this.U.push(uv[0], uv[1]); this.F.push(fac[0], fac[1], fac[2], fac[3]); return this.n++;
  }
  tri3(i0, i1, i2, n) {
    const a = this.P.slice(i0 * 3, i0 * 3 + 3), b = this.P.slice(i1 * 3, i1 * 3 + 3), c = this.P.slice(i2 * 3, i2 * 3 + 3);
    if (dot(cross(sub(b, a), sub(c, a)), n) >= 0) this.I.push(i0, i1, i2); else this.I.push(i0, i2, i1);
  }
  quad(a, b, c, d, nrm, col, uvs, fac) {
    const i = [a, b, c, d].map((p, k) => this.vert(p, nrm, col, uvs[k], fac));
    this.tri3(i[0], i[1], i[2], nrm); this.tri3(i[0], i[2], i[3], nrm);
  }
  wall(x0, z0, x1, z1, y0, y1, col, fac, u0 = 0, vBase = 0) {
    const L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.01) return;
    const n = [(z1 - z0) / L, 0, -(x1 - x0) / L];
    this.quad([x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], n, col,
      [[u0, vBase], [u0 + L, vBase], [u0 + L, vBase + y1 - y0], [u0, vBase + y1 - y0]], fac);
  }
  cap(pts, y, col, fac, down = false) {
    const n = [0, down ? -1 : 1, 0];
    const ids = pts.map(([x, z]) => this.vert([x, y, z], n, col, [x, z], fac));
    for (let i = 1; i < ids.length - 1; i++) this.tri3(ids[0], ids[i], ids[i + 1], n);
  }
  prism(pts, y0, y1, col, fac, roofCol, roofFac, vBase = 0) {
    let u = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      this.wall(a[0], a[1], b[0], b[1], y0, y1, col, fac, u, vBase);
      u += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    if (roofCol) this.cap(pts, y1, roofCol, roofFac);
  }
  /**
   * Pillowy block: rounded vertical corners (radius r) and a rounded roof edge (radius b),
   * smooth normals so it shades like a soft toy. Facade u runs around the perimeter starting
   * at local (−hx + r, −hz), heading +x.
   */
  pillow(cx, cz, hx, hz, rot, y0, y1, { r = 1, b = 0.8, col, fac, roofCol, vBase = 0, bevelCol = null }) {
    r = Math.max(0.05, Math.min(r, hx * 0.48, hz * 0.48));
    b = Math.min(b, (y1 - y0) * 0.3, r + 0.6, hx * 0.4, hz * 0.4);
    const c = Math.cos(rot), s = Math.sin(rot);
    const W = (x, z) => [cx + x * c + z * s, cz - x * s + z * c];
    const Wn = (nx, nz) => [nx * c + nz * s, -nx * s + nz * c];
    // footprint ring (local) with outward normals
    const ring = [];
    const seg = r > 1.5 ? 5 : 3;
    const corners = [[hx - r, -hz + r, -Math.PI / 2], [hx - r, hz - r, 0], [-hx + r, hz - r, Math.PI / 2], [-hx + r, -hz + r, Math.PI]];
    for (const [ax, az, a0] of corners) for (let i = 0; i <= seg; i++) {
      const a = a0 + i / seg * Math.PI / 2;
      ring.push([ax + Math.cos(a) * r, az + Math.sin(a) * r, Math.cos(a), Math.sin(a)]);
    }
    // perimeter u, starting at (−hx + r, −hz): ring[] starts at the end of edge 1, so rotate it
    ring.unshift(ring.pop());
    const start = [-hx + r, -hz, 0, -1];
    ring.unshift(start);
    // remove duplicate start/end
    const R2 = [];
    for (const p of ring) { const q = R2[R2.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4) R2.push(p); }
    const loopPts = R2;
    const us = [0]; for (let i = 1; i <= loopPts.length; i++) { const a = loopPts[i - 1], q = loopPts[i % loopPts.length]; us.push(us[i - 1] + Math.hypot(q[0] - a[0], q[1] - a[1])); }
    const yW = y1 - b;
    const nL = loopPts.length;
    // wall band
    const wallIdx = [];
    for (let i = 0; i <= nL; i++) {
      const p = loopPts[i % nL];
      const [wx, wz] = W(p[0], p[1]); const [nx, nz] = Wn(p[2], p[3]);
      const a = this.vert([wx, y0, wz], [nx, 0, nz], col, [us[i], vBase], fac);
      const q = this.vert([wx, yW, wz], [nx, 0, nz], col, [us[i], vBase + yW - y0], fac);
      wallIdx.push([a, q, [nx, 0, nz]]);
    }
    for (let i = 0; i < nL; i++) {
      const [a0, q0, n0] = wallIdx[i], [a1, q1, n1] = wallIdx[i + 1];
      const n = norm([n0[0] + n1[0], 0, n0[2] + n1[2]]);
      this.tri3(a0, a1, q1, n); this.tri3(a0, q1, q0, n);
    }
    // rounded roof edge
    const bc = bevelCol || col;
    const plain = [STYLE.plain, 3, 3, fac[3]];
    const steps = 3;
    let prev = null;
    for (let k = 0; k <= steps; k++) {
      const th = k / steps * Math.PI / 2;
      const inset = b * (1 - Math.cos(th)), y = yW + b * Math.sin(th);
      const row = [];
      for (let i = 0; i <= nL; i++) {
        const p = loopPts[i % nL];
        const [wx, wz] = W(p[0] - p[2] * inset, p[1] - p[3] * inset); const [nx, nz] = Wn(p[2], p[3]);
        const n = norm([nx * Math.cos(th), Math.sin(th), nz * Math.cos(th)]);
        row.push([this.vert([wx, y, wz], n, k === steps ? roofCol || bc : bc, [us[i], vBase + y - y0], k === steps && roofCol ? [STYLE.roof, 3, 3, fac[3]] : plain), n]);
      }
      if (prev) for (let i = 0; i < nL; i++) {
        const n = norm([prev[i][1][0] + row[i + 1][1][0], prev[i][1][1] + row[i + 1][1][1], prev[i][1][2] + row[i + 1][1][2]]);
        this.tri3(prev[i][0], prev[i + 1][0], row[i + 1][0], n); this.tri3(prev[i][0], row[i + 1][0], row[i][0], n);
      }
      prev = row;
    }
    // roof cap
    const capPts = loopPts.map(p => W(p[0] - p[2] * b, p[1] - p[3] * b));
    this.cap(capPts, y1, roofCol || bc, [STYLE.roof, 3, 3, fac[3]]);
    return { us, loopPts, r };
  }
  /** Gable roof over a rectangle; ridge along the longer side. */
  gable(cx, cz, hx, hz, rot, y0, rise, col, fac, endCol) {
    if (hz > hx) return this.gable(cx, cz, hz, hx, rot + Math.PI / 2, y0, rise, col, fac, endCol);
    const c = Math.cos(rot), s = Math.sin(rot);
    const T = (x, z, y) => [cx + x * c + z * s, y, cz - x * s + z * c];
    const ex = hx + 0.6, ez = hz + 0.7;
    const A = T(-ex, -ez, y0), B = T(ex, -ez, y0), C = T(ex, 0, y0 + rise), D = T(-ex, 0, y0 + rise), E = T(ex, ez, y0), F = T(-ex, ez, y0);
    let n1 = norm(cross(sub(B, A), sub(D, A))); if (n1[1] < 0) n1 = n1.map(v => -v);
    let n2 = norm(cross(sub(E, F), sub(D, F))); if (n2[1] < 0) n2 = n2.map(v => -v);
    const slope = Math.hypot(ez, rise);
    this.quad(A, B, C, D, n1, col, [[0, 0], [ex * 2, 0], [ex * 2, slope], [0, slope]], fac);
    this.quad(F, E, C, D, n2, col, [[0, 0], [ex * 2, 0], [ex * 2, slope], [0, slope]], fac);
    const ec = endCol || new THREE.Color(0.95, 0.92, 0.86);
    for (const sx of [-1, 1]) {
      const a = T(sx * hx, -hz, y0), b2 = T(sx * hx, hz, y0), ap = T(sx * hx, 0, y0 + rise);
      const out = norm([c * sx, 0, -s * sx]);
      const i0 = this.vert(a, out, ec, [0, 0], [STYLE.plain, 3, 3, 0]), i1 = this.vert(b2, out, ec, [1, 0], [STYLE.plain, 3, 3, 0]), i2 = this.vert(ap, out, ec, [0.5, 1], [STYLE.plain, 3, 3, 0]);
      this.tri3(i0, i1, i2, out);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('fuv', new THREE.Float32BufferAttribute(this.U, 2));
    g.setAttribute('fac', new THREE.Float32BufferAttribute(this.F, 4));
    g.setIndex(this.I);
    g.computeBoundingSphere();
    return g;
  }
}

/** Rectangle footprint, optionally with rounded street-side corners. */
export function rectPts(cx, cz, hx, hz, rot, chamfer = 0) {
  const c = Math.cos(rot), s = Math.sin(rot);
  let local;
  if (chamfer > 0) {
    const k = Math.min(chamfer, hx * 0.45, hz * 0.45);
    local = [[-hx, -hz], [hx, -hz]];
    const arc = (ax, az, a0) => { for (let i = 0; i <= 3; i++) { const a = a0 + i / 3 * Math.PI / 2; local.push([ax + Math.cos(a) * k, az + Math.sin(a) * k]); } };
    arc(hx - k, hz - k, 0);
    arc(-hx + k, hz - k, Math.PI / 2);
  } else local = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
  return local.map(([x, z]) => [cx + x * c + z * s, cz - x * s + z * c]);
}

/* ---------- toy palette ---------- */
export const PALETTES = {
  heritage: [0xe7b989, 0xd9a274, 0xefc89a, 0xdcae82],
  deco: [0xf6e6c8, 0xf9c9b6, 0xc4e7d4, 0xf4dc9e, 0xcadcf4, 0xf3bdc8],
  mid: [0xf28c62, 0xf5c85c, 0x6fbcab, 0xb79bdc, 0xf3a7a2, 0x8fc4ec, 0xf4e3c3, 0xe7796a, 0x9fd27f, 0xf0a65a],
  tower: [0xf9e7d2, 0xd9cdf2, 0xc9ebe2, 0xfbd3c0, 0xcfe0f6, 0xf6efe2, 0xf5d68e],
  glass: [0xeef3f6, 0xcfe7f2, 0xe9e3f5],
  office: [0xe9e2d6, 0xd9dde3, 0xf0e1cf],
  chawl: [0xf3c46b, 0x9fd08e, 0xf29e7b, 0xa9c8ee, 0xeeb2c9],
  industrial: [0xbac5cc, 0xd8c8a6, 0xa9c3b9],
  warehouse: [0xe86f52, 0x4f9fd6, 0x6cc29e, 0xf1b34a],
  bungalow: [0xfdf8ee, 0xfbeedb, 0xeff6ee],
};
const STYLE_OF = { heritage: STYLE.heritage, deco: STYLE.deco, mid: STYLE.residential, tower: STYLE.residential, glass: STYLE.glass, office: STYLE.office, chawl: STYLE.chawl, industrial: STYLE.industrial, warehouse: STYLE.industrial, bungalow: STYLE.bungalow };
const CORNER = { deco: 4.5, mid: 1.4, tower: 2.4, glass: 1.6, office: 1.2, heritage: 0.7, chawl: 0.9, industrial: 0.6, warehouse: 0.4, bungalow: 0.5 };

export function districtAt(x, z) {
  let best = DISTRICTS[0], bd = Infinity;
  for (const d of DISTRICTS) { const dd = Math.hypot(d.x - x, d.z - z); if (dd < bd) { bd = dd; best = d; } }
  return best;
}

/* ---------- street-front detail atlas: shop signs, AC grille, awning stripes ---------- */
export const SHOP_NAMES = ['CUTTING CHAI', 'VADA PAV CORNER', 'IRANI CAFE', 'BOMBAY TAILORS', 'LALOO MOTORS', 'PIT STOP DHABA', 'KEBAB KING', 'MITHAI HOUSE',
  'CYBER CAFE', 'FAST FIX MOBILES', 'BHEL PURI', 'PAAN PALACE', 'SHARMA STORES', 'DOSA EXPRESS', 'JUICE CENTRE', 'CHEMIST 24x7',
  'MODERN BAKERY', 'RADIO REPAIR', 'FILMI POSTERS', 'TYRE & TUBE'];
const SIGN_COLS = [['#d93a2b', '#fff6e0'], ['#1d6fb8', '#ffffff'], ['#f4c542', '#2a2420'], ['#2e9e6e', '#ffffff'], ['#7b4fc9', '#fff2d6'], ['#fafafa', '#d93a2b'], ['#2b2b33', '#ffd166'], ['#f08a3c', '#ffffff']];
function detailAtlas() {
  // 1024×1024: column of 20 signs (each 512×48) at left; right half: AC grille + solid white
  return canvasTexture(1024, 1024, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 1024, 1024);
    SHOP_NAMES.forEach((name, i) => {
      const [bg, fg] = SIGN_COLS[i % SIGN_COLS.length];
      const y = i * 50;
      g.fillStyle = bg; g.fillRect(0, y, 512, 48);
      g.fillStyle = fg; g.font = '900 34px "Titillium Web", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      let s = 34; while (g.measureText(name).width > 480 && s > 14) { s -= 2; g.font = `900 ${s}px "Titillium Web", Arial, sans-serif`; }
      g.fillText(name, 256, y + 26);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, y + 44, 512, 4);
    });
    // AC unit front at (512..640, 0..96)
    g.fillStyle = '#f4f4f2'; g.fillRect(512, 0, 128, 96);
    g.fillStyle = '#c8c9cc'; g.beginPath(); g.arc(560, 48, 34, 0, 7); g.fill();
    g.fillStyle = '#9fa1a6'; for (let k = 0; k < 6; k++) { g.save(); g.translate(560, 48); g.rotate(k * Math.PI / 3); g.fillRect(-3, -30, 6, 26); g.restore(); }
    g.fillStyle = '#8a8c90'; for (let k = 0; k < 6; k++) g.fillRect(604, 14 + k * 12, 28, 5);
  }, { aniso: 8 });
}
const ATLAS = { sign: i => [0, 1 - (i * 50 + 48) / 1024, 0.5, 1 - (i * 50) / 1024], ac: [0.5, 1 - 96 / 1024, 0.625, 1], white: [0.9, 0.5, 0.95, 0.55] };

class DetailBuilder {
  constructor() { this.P = []; this.N = []; this.C = []; this.UV = []; this.I = []; this.n = 0; }
  /** Oriented box; faces get `uv` rect on the front (+z local) and white elsewhere. */
  box(cx, cy, cz, w, h, d, rot, col, front = ATLAS.white, tilt = 0) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const faces = [
      [[0, 0, 1], front], [[0, 0, -1], ATLAS.white], [[1, 0, 0], ATLAS.white], [[-1, 0, 0], ATLAS.white], [[0, 1, 0], ATLAS.white], [[0, -1, 0], ATLAS.white],
    ];
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const X = (lx, ly, lz) => { const y2 = ly * ct - lz * st, z2 = ly * st + lz * ct; return [cx + lx * c + z2 * s, cy + y2, cz - lx * s + z2 * c]; };
    const NR = (nx, ny, nz) => { const y2 = ny * ct - nz * st, z2 = ny * st + nz * ct; return [nx * c + z2 * s, y2, -nx * s + z2 * c]; };
    for (const [n, uv] of faces) {
      const [nx, ny, nz] = n;
      const t1 = Math.abs(ny) > 0.5 ? [1, 0, 0] : [-nz, 0, nx];
      const t2 = [ny * t1[2] - nz * t1[1], nz * t1[0] - nx * t1[2], nx * t1[1] - ny * t1[0]];
      const local = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [
        (nx * 0.5 + t1[0] * a * 0.5 + t2[0] * b * 0.5) * w, (ny * 0.5 + t1[1] * a * 0.5 + t2[1] * b * 0.5) * h, (nz * 0.5 + t1[2] * a * 0.5 + t2[2] * b * 0.5) * d]);
      const pts = local.map(([lx, ly, lz]) => X(lx, ly, lz));
      const nn = NR(nx, ny, nz);
      // front face: map the texture upright as seen from outside (+x right, +y up)
      const uvs = local.map(([lx, ly]) => nz > 0.5
        ? [uv[0] + (uv[2] - uv[0]) * (lx / w + 0.5), uv[1] + (uv[3] - uv[1]) * (ly / h + 0.5)]
        : [uv[0], uv[1]]);
      const base = this.n;
      pts.forEach((p, k) => { this.P.push(...p); this.N.push(...nn); this.C.push(col.r, col.g, col.b); this.UV.push(...uvs[k]); this.n++; });
      const A = pts[0], Bp = pts[1], C = pts[2];
      if (dot(cross(sub(Bp, A), sub(C, A)), nn) >= 0) this.I.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else this.I.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.UV, 2));
    g.setIndex(this.I); g.computeBoundingSphere();
    return g;
  }
}

/* ---------- city generation ---------- */
export function buildBuildings(ctx) {
  const { scene, net, terr, colliders, atmo, quality } = ctx;
  const R = rng(20240611);
  const occCell = 4;
  const OX = WB.minX, OZ = WB.minZ;
  const ONX = Math.ceil((WB.maxX - WB.minX) / occCell), ONZ = Math.ceil((WB.maxZ - WB.minZ) / occCell);
  const occ = new Uint8Array(ONX * ONZ);
  const nodeList = Object.values(net.nodes);
  const roadClear = (x, z, pad) => {
    const n = net.nearestRoad(x, z, 50);
    if (n && n.d < n.road.T.hw + n.road.T.sidewalk + pad + (n.road.deck ? 4 : 0)) return false;
    for (const nd of nodeList) if (Math.hypot(nd.x - x, nd.z - z) < nd.R + nd.sw + pad + 1) return false;
    return true;
  };
  const freeOf = (x, z, pad) => {
    for (const r of RESERVED) if (Math.hypot(r.x - x, r.z - z) < r.r + pad) return false;
    for (const p of PLAZAS) if (Math.hypot(p.x - x, p.z - z) < p.r + pad) return false;
    for (const p of PARKS) {
      const c = Math.cos(p.rot), s = Math.sin(p.rot), lx = (x - p.x) * c + (z - p.z) * s, lz = -(x - p.x) * s + (z - p.z) * c;
      if (Math.hypot(lx / (p.rx + pad), lz / (p.rz + pad)) < 1) return false;
    }
    return true;
  };
  const occAt = (x, z) => {
    const i = Math.floor((x - OX) / occCell), j = Math.floor((z - OZ) / occCell);
    return i < 0 || j < 0 || i >= ONX || j >= ONZ || occ[j * ONX + i];
  };
  const sampleRect = (cx, cz, hx, hz, rot, fn) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let a = -hx; a <= hx + 0.01; a += Math.max(1, Math.min(3, hx / 2))) for (let b = -hz; b <= hz + 0.01; b += Math.max(1, Math.min(3, hz / 2)))
      if (fn(cx + a * c + b * s, cz - a * s + b * c) === false) return false;
    return true;
  };
  const lots = [];
  const tryLot = (cx, cz, hx, hz, rot, d, kind, side = 0) => {
    const ok = sampleRect(cx, cz, hx, hz, rot, (x, z) => !(landSD(x, z) < 5 || !insideSlab(x, z, 14) || !roadClear(x, z, 1.2) || !freeOf(x, z, 2) || occAt(x, z)));
    if (!ok) return false;
    sampleRect(cx, cz, hx + 1.5, hz + 1.5, rot, (x, z) => { const i = Math.floor((x - OX) / occCell), j = Math.floor((z - OZ) / occCell); if (i >= 0 && j >= 0 && i < ONX && j < ONZ) occ[j * ONX + i] = 1; });
    lots.push({ cx, cz, hx, hz, rot, d, kind, side });
    return true;
  };

  /* 1. street frontage */
  for (const r of net.roads) {
    if (r.deck && r.type !== 'bridge') continue;
    for (const side of [1, -1]) {
      let s = r.trim0 + 10;
      while (s < r.trim1 - 10) {
        const i = Math.min(r.n - 1, Math.max(0, Math.round(s / r.L * (r.n - 1))));
        const d = districtAt(r.x[i], r.z[i]);
        const marine = r.id.startsWith('marineDrive');
        const bkc = d.id === 'bkc', bung = d.id === 'bandra';
        const width = marine ? 24 + R() * 8 : bkc ? 36 + R() * 24 : bung ? 14 + R() * 8 : 15 + R() * 15;
        const depth = marine ? 20 + R() * 6 : bkc ? 30 + R() * 20 : bung ? 12 + R() * 8 : 14 + R() * 12;
        const setback = marine ? 3 : bkc ? 10 + R() * 8 : bung ? 5 + R() * 4 : 1.2 + R() * 2.5;
        const off = r.T.hw + r.T.sidewalk + setback + depth / 2;
        const cx = r.x[i] + r.tz[i] * off * side, cz = r.z[i] - r.tx[i] * off * side;
        const rot = Math.atan2(r.tx[i], r.tz[i]) + Math.PI / 2;
        tryLot(cx, cz, width / 2, depth / 2, rot, d, marine ? 'marine' : 'front', side);
        s += width + (marine ? 3 : bkc ? 14 + R() * 10 : 1.5 + R() * 3);
      }
    }
  }
  /* 2. infill blocks */
  const step = 30;
  const density = quality.props < 0.6 ? 0.6 : 0.92;
  for (let z = WB.minZ + 20; z < WB.maxZ - 20; z += step) for (let x = WB.minX + 20; x < WB.maxX - 20; x += step) {
    const jx = x + (R() - 0.5) * step * 0.6, jz = z + (R() - 0.5) * step * 0.6;
    if (landSD(jx, jz) < 12) continue;
    const d = districtAt(jx, jz);
    if (R() > (d.id === 'docks' ? 0.4 : density)) continue;
    const near = net.nearestRoad(jx, jz, 400);
    const rot = near ? Math.atan2(near.road.tx[near.i], near.road.tz[near.i]) + Math.PI / 2 : 0;
    const big = d.id === 'bkc' || d.id === 'docks' || (d.styles.includes('industrial') && R() < 0.4);
    const hx = big ? 14 + R() * 14 : 8 + R() * 9, hz = big ? 12 + R() * 12 : 7 + R() * 8;
    tryLot(jx, jz, hx, hz, rot, d, null);
  }

  /* 3. geometry, chunked for frustum culling */
  const CH = 320;
  const chunks = new Map(), dchunks = new Map();
  const key = (x, z) => Math.floor((x - OX) / CH) + ',' + Math.floor((z - OZ) / CH);
  const getChunk = (x, z) => { const k = key(x, z); let b = chunks.get(k); if (!b) chunks.set(k, b = new FacadeBuilder()); return b; };
  const getD = (x, z) => { const k = key(x, z); let b = dchunks.get(k); if (!b) dchunks.set(k, b = new DetailBuilder()); return b; };
  const col = new THREE.Color(), roofCol = new THREE.Color();
  const tanks = [];
  const pick = arr => arr[Math.floor(R() * arr.length)];
  const white = new THREE.Color(0xffffff), acCol = new THREE.Color(0xf4f2ee);
  let towers = 0, details = 0;
  for (const L of lots) {
    const d = L.d;
    let style = L.kind === 'marine' ? 'deco' : pick(d.styles);
    if (d.id === 'docks') style = 'warehouse';
    let floors = Math.round(d.h[0] + R() * (d.h[1] - d.h[0]));
    if (style === 'bungalow') floors = 1 + Math.round(R() * 1.4);
    if (style === 'deco') floors = 4 + Math.round(R() * 3);
    if (style === 'chawl') floors = Math.min(floors, 3 + Math.round(R() * 2));
    if (style === 'heritage') floors = Math.min(floors, 3 + Math.round(R() * 3));
    if (style === 'warehouse') floors = 1;
    if (style === 'mid') floors = Math.min(floors, 10);
    if ((style === 'tower' || style === 'glass' || style === 'office') && L.hx * L.hz < 90) floors = Math.min(floors, 12);
    const fh = style === 'warehouse' ? 9 : style === 'industrial' ? 5 : style === 'heritage' ? 4.2 : style === 'glass' || style === 'office' ? 3.8 : 3.4;
    const H = Math.max(4, floors * fh + 0.8);
    const corners = rectPts(L.cx, L.cz, L.hx, L.hz, L.rot);
    let gy = Infinity; for (const [x, z] of [[L.cx, L.cz], ...corners]) gy = Math.min(gy, terr.heightAt(x, z));
    gy -= 0.6;
    col.set(pick(PALETTES[style] || PALETTES.mid));
    const S = STYLE_OF[style] ?? STYLE.residential;
    const seed = Math.floor(R() * 997);
    const bw = style === 'glass' ? 2.2 : style === 'office' ? 2.6 : style === 'deco' ? 2.8 : style === 'heritage' ? 3.6 : style === 'industrial' || style === 'warehouse' ? 6 : 3.4;
    const fac = [S, fh, bw, seed];
    roofCol.copy(col).multiplyScalar(0.82).lerp(new THREE.Color(0xb9b2aa), 0.35);
    const B = getChunk(L.cx, L.cz);
    const cr = CORNER[style] ?? 1;
    const bevelCol = col.clone().lerp(white, 0.25);
    let geomInfo = null;
    if (style === 'bungalow') {
      geomInfo = B.pillow(L.cx, L.cz, L.hx, L.hz, L.rot, gy, gy + H, { r: 0.5, b: 0.3, col, fac, roofCol: col, vBase: -0.6 });
      B.gable(L.cx, L.cz, L.hx, L.hz, L.rot, gy + H, 2.4 + R(), new THREE.Color(0xd2603f).offsetHSL(0, 0, (R() - 0.5) * 0.08), [STYLE.tiles, 1, 1, seed], col.clone());
    } else if ((style === 'tower' || style === 'glass' || style === 'office') && floors > 12) {
      towers++;
      const podH = 3 * fh + 0.8;
      const podCol = new THREE.Color(pick(PALETTES.mid));
      geomInfo = B.pillow(L.cx, L.cz, L.hx, L.hz, L.rot, gy, gy + podH, { r: cr + 0.6, b: 0.8, col: podCol, fac: [style === 'glass' ? STYLE.office : S, fh, bw, seed], roofCol: podCol.clone().multiplyScalar(0.85), vBase: -0.6 });
      const k = 0.62 + R() * 0.2;
      B.pillow(L.cx, L.cz, L.hx * k, L.hz * k, L.rot, gy + podH - 0.2, gy + H, { r: cr + (style === 'tower' ? 2 : 0.8), b: 1.4, col, fac, roofCol, vBase: podH - 0.8, bevelCol });
      const crownCol = style === 'glass' ? new THREE.Color(0x5fa8d8) : new THREE.Color(pick(PALETTES.mid));
      B.pillow(L.cx, L.cz, L.hx * k * 0.5, L.hz * k * 0.5, L.rot, gy + H - 0.4, gy + H + 3 + R() * 4, { r: 1.2, b: 1, col: crownCol, fac: [STYLE.plain, 3, 3, seed], roofCol: crownCol });
    } else {
      geomInfo = B.pillow(L.cx, L.cz, L.hx, L.hz, L.rot, gy, gy + H, { r: cr, b: style === 'warehouse' ? 0.3 : 0.9, col, fac, roofCol: style === 'warehouse' ? null : roofCol, vBase: -0.6, bevelCol });
      if (style === 'deco' && R() < 0.7) {
        const tc = col.clone().lerp(white, 0.4);
        B.pillow(L.cx, L.cz, Math.min(3, L.hx * 0.25), L.hz * 0.4, L.rot, gy + H - 0.4, gy + H + 3.5 + R() * 2, { r: 1.2, b: 0.8, col: tc, fac: [STYLE.plain, 3, 3, seed], roofCol: tc });
      }
      if (style === 'warehouse') B.gable(L.cx, L.cz, L.hx, L.hz, L.rot, gy + H, 2.2, new THREE.Color(pick([0xe9eef2, 0xd5dde3, 0xf0ece4])), [STYLE.industrial, 9, 0.6, seed], col.clone());
      if (style !== 'warehouse' && style !== 'heritage' && floors >= 2) {
        const nT = style === 'chawl' || style === 'mid' ? 1 + Math.floor(R() * 3) : Math.floor(R() * 2);
        for (let t = 0; t < nT; t++) tanks.push([L.cx + (R() - 0.5) * L.hx, gy + H, L.cz + (R() - 0.5) * L.hz, 0.8 + R() * 0.5]);
      }
    }
    colliders.box(L.cx, L.cz, L.hx, L.hz, L.rot, gy - 1, gy + H + 6, 'building');

    /* 3D street-front details on the road-facing wall, aligned to the shader's window grid */
    if ((L.kind === 'front' || L.kind === 'marine') && L.side && geomInfo && style !== 'warehouse' && style !== 'glass' && quality.props >= 0.45) {
      const DB = getD(L.cx, L.cz);
      const r = geomInfo.r, hx = L.hx, hz = L.hz;
      const Lx = 2 * hx - 2 * r, Lz = 2 * hz - 2 * r, arc = Math.PI * r / 2;
      const front = -L.side;                       // local z of the street facade (±1)
      const U0 = front < 0 ? 0 : Lx + Lz + 2 * arc;
      const c = Math.cos(L.rot), s = Math.sin(L.rot);
      const W = (x, y, z) => [L.cx + x * c + z * s, y, L.cz - x * s + z * c];
      const faceRot = L.rot + (front < 0 ? Math.PI : 0);   // local +z of the detail box points away from the wall
      const nCells = Math.floor((U0 + Lx) / bw) + 1;
      const shopRow = style !== 'bungalow' && fract(seed * 7.31) > 0.3;
      for (let k = 0; k < nCells; k++) {
        const u = (k + 0.5) * bw;
        if (u < U0 + 0.8 || u > U0 + Lx - 0.8) continue;
        const lx = front < 0 ? u - hx + r : hx - r - (u - U0);
        const zf = front * (hz + 0.02);
        // shop signs above ground-floor openings, chunky tilted awnings over some
        if (shopRow && bw >= 2.8) {
          const si = Math.floor(R() * SHOP_NAMES.length);
          const [x, y, z] = W(lx, gy + 0.6 + fh - 0.75, zf + front * 0.12);
          DB.box(x, y, z, bw - 0.5, 0.62, 0.18, faceRot, white, ATLAS.sign(si));
          if (R() < 0.55) {
            const [ax, ay, az] = W(lx, gy + 0.6 + fh - 1.35, zf + front * 0.62);
            DB.box(ax, ay, az, bw - 0.6, 0.12, 1.25, faceRot, new THREE.Color(pick([0xd93a2b, 0x2e9e6e, 0x1d6fb8, 0xf0a33c])), ATLAS.white, 0.32);
          }
          details++;
        }
        // AC units hanging under upper-floor windows
        for (let f = 1; f < Math.min(floors, 9); f++) {
          if (R() > 0.22) continue;
          const [x, y, z] = W(lx + 0.85 * (R() < 0.5 ? -1 : 1), gy + 0.6 + f * fh + 0.35, zf + front * 0.25);
          DB.box(x, y, z, 0.85, 0.55, 0.45, faceRot, acCol, ATLAS.ac);
          details++;
        }
      }
    }
  }
  function fract(v) { return v - Math.floor(v); }

  const mat = facadeMaterial(atmo.night);
  const group = new THREE.Group(); group.name = 'buildings';
  for (const B of chunks.values()) {
    const m = new THREE.Mesh(B.geometry(), mat);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
  const atlas = detailAtlas();
  const dmat = new THREE.MeshStandardMaterial({ vertexColors: true, map: atlas, roughness: 0.6, emissive: 0xffffff, emissiveMap: atlas, emissiveIntensity: 0 });
  for (const D of dchunks.values()) {
    if (!D.n) continue;
    const m = new THREE.Mesh(D.geometry(), dmat);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
  /* soft contact shadow skirt around every footprint (cheap ambient occlusion) */
  {
    const P = [], UV = [], I = [];
    for (const L of lots) {
      const pts = rectPts(L.cx, L.cz, L.hx + 0.05, L.hz + 0.05, L.rot), out = rectPts(L.cx, L.cz, L.hx + 3.2, L.hz + 3.2, L.rot);
      const y = terr.heightAt(L.cx, L.cz) + 0.06;
      for (let k = 0; k < 4; k++) {
        const a = pts[k], b = pts[(k + 1) % 4], c = out[(k + 1) % 4], e = out[k];
        const base = P.length / 3;
        for (const [q, v] of [[a, 0], [b, 0], [c, 1], [e, 1]]) { P.push(q[0], Math.max(y, terr.heightAt(q[0], q[1]) + 0.06), q[1]); UV.push(0.5, v); }
        I.push(base, base + 2, base + 1, base, base + 3, base + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    g.setIndex(I); g.computeBoundingSphere();
    const tex = canvasTexture(4, 64, (g2) => { const grd = g2.createLinearGradient(0, 0, 0, 64); grd.addColorStop(0, 'rgba(40,30,60,0.42)'); grd.addColorStop(1, 'rgba(40,30,60,0)'); g2.fillStyle = grd; g2.fillRect(0, 0, 4, 64); }, { srgb: false });
    tex.flipY = false;
    const skirt = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6 }));
    skirt.renderOrder = 1;
    group.add(skirt);
  }
  const d = new THREE.Object3D();
  const tankGeo = new THREE.CylinderGeometry(1, 1, 1.6, 12); tankGeo.translate(0, 0.8, 0);
  const tankMesh = new THREE.InstancedMesh(tankGeo, new THREE.MeshStandardMaterial({ color: 0x3b6fd1, roughness: 0.5 }), Math.max(1, tanks.length));
  const tc = new THREE.Color();
  tanks.forEach(([x, y, z, r], i) => { d.position.set(x, y, z); d.scale.set(r, r, r); d.rotation.set(0, 0, 0); d.updateMatrix(); tankMesh.setMatrixAt(i, d.matrix); tankMesh.setColorAt(i, tc.set(i % 5 === 0 ? 0xf0f0ea : i % 3 ? 0x2b2d33 : 0x3b6fd1)); });
  tankMesh.count = tanks.length;
  tankMesh.castShadow = true;
  group.add(tankMesh);
  scene.add(group);
  return {
    group, material: mat, count: lots.length, towers, details, occAt, lots,
    setNight(v) { dmat.emissiveIntensity = v * 0.55; },
  };
}
