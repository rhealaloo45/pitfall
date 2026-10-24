/* Procedural city blocks. Facades (windows, mullions, arches, shopfronts,
   monsoon stains, lit windows at night) are computed in the shader from
   per-vertex facade coordinates, so the whole city needs no texture files. */
import * as THREE from 'three';
import { DISTRICTS, RESERVED, PARKS, PLAZAS, WORLD_BOUNDS as WB } from './layout.js';
import { landSD } from './geo2d.js';
import { rng } from '../core/geo.js';

export const STYLE = { roof: 0, residential: 1, glass: 2, deco: 3, heritage: 4, office: 5, chawl: 6, industrial: 7, bungalow: 8, tiles: 9, plain: 10 };

const FACADE_GLSL = /* glsl */`
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float box2(vec2 f, vec2 a, vec2 b){ vec2 s = step(a, f) * step(f, b); return s.x * s.y; }
`;

export function facadeMaterial(nightU) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uNight = nightU;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 fuv; attribute vec4 fac; varying vec2 vFuv; varying vec4 vFac; varying vec3 vWPos2;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vFuv = fuv; vFac = fac; vWPos2 = (modelMatrix * vec4(position,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight; varying vec2 vFuv; varying vec4 vFac; varying vec3 vWPos2;\n' + FACADE_GLSL + '\nfloat gWin; float gLit; vec3 gLitCol;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float style = vFac.x, fh = vFac.y, bw = vFac.z, seed = vFac.w;
        vec2 fu = vFuv;
        float fl = floor(fu.y / fh);
        vec2 cell = vec2(floor(fu.x / bw), fl);
        vec2 f = vec2(fract(fu.x / bw), fract(fu.y / fh));
        float r = h21(cell + seed * 17.13);
        vec3 wall = diffuseColor.rgb;
        vec3 glass = mix(vec3(0.05, 0.07, 0.09), vec3(0.11, 0.15, 0.18), r);
        float win = 0.0, dark = 0.0;
        gLitCol = vec3(1.0, 0.72, 0.42);
        bool shops = fract(seed * 7.31) > 0.35;
        if (style < 0.5) {
          wall *= 0.82 + 0.25 * vnoise(vWPos2.xz * 0.35);
        } else if (style < 1.5) {               // residential: punched windows, sills, AC boxes
          win = box2(f, vec2(0.24, 0.30), vec2(0.76, 0.80));
          dark = box2(f, vec2(0.2, 0.25), vec2(0.8, 0.30)) * 0.35 + box2(f, vec2(0.78, 0.36), vec2(0.95, 0.56)) * step(0.7, r) * 0.25;
          if (r > 0.88) { win = 0.0; dark += box2(f, vec2(0.24, 0.30), vec2(0.76, 0.80)) * 0.15; }
        } else if (style < 2.5) {               // glass curtain wall
          win = 1.0 - max(step(0.94, f.x), step(0.86, f.y)) * 0.92;
          glass = mix(vec3(0.06, 0.11, 0.13), vec3(0.12, 0.2, 0.22), vnoise(cell * 0.3 + seed));
          gLitCol = vec3(0.85, 0.92, 1.0);
        } else if (style < 3.5) {               // art deco: ribbons + eyebrow shades
          win = box2(f, vec2(0.18, 0.18), vec2(0.82, 0.74));
          dark = box2(f, vec2(0.1, 0.76), vec2(0.9, 0.84)) * 0.45;
          wall *= 1.0 + 0.06 * step(0.92, fract(fu.y / (fh * 4.0)));
        } else if (style < 4.5) {               // heritage stone: arched windows, rusticated base
          vec2 c = vec2(0.5, 0.62);
          float arch = step(length((f - c) * vec2(1.0, 1.4)), 0.24) * step(c.y, f.y);
          win = max(box2(f, vec2(0.26, 0.2), vec2(0.74, 0.62)), arch);
          if (fl < 0.5) { win = min(1.0, box2(f, vec2(0.18, 0.0), vec2(0.82, 0.66)) + step(length((f - vec2(0.5,0.66))*vec2(1.0,1.2)), 0.32) * step(0.66, f.y)); dark = step(0.94, fract(fu.y / 0.6)) * 0.3; }
          wall *= 0.9 + 0.2 * vnoise(fu * vec2(1.6, 2.4));
        } else if (style < 5.5) {               // office: ribbon windows + spandrels
          win = box2(f, vec2(-1.0, 0.36), vec2(2.0, 0.9)) * (1.0 - step(0.965, f.x) * 0.9);
          gLitCol = vec3(0.92, 0.95, 1.0);
        } else if (style < 6.5) {               // chawl: open corridors with railings
          win = box2(f, vec2(0.3, 0.32), vec2(0.7, 0.78));
          float corridor = box2(f, vec2(-1.0, 0.0), vec2(2.0, 0.24));
          dark = corridor * (0.55 - 0.25 * step(0.5, fract(fu.x * 3.0)));
        } else if (style < 7.5) {               // industrial: corrugated + clerestory
          wall *= 0.86 + 0.14 * step(0.5, fract(fu.x * 2.5));
          win = box2(f, vec2(0.1, 0.78), vec2(0.9, 0.92)) * step(fu.y, fh);
          dark = step(fu.y, 4.5) * box2(f, vec2(0.25, 0.0), vec2(0.75, 1.0)) * step(0.6, r) * 0.5;
        } else if (style < 8.5) {               // bungalow: shuttered windows
          win = box2(f, vec2(0.32, 0.3), vec2(0.68, 0.75)) * step(0.35, r);
          dark = (box2(f, vec2(0.2, 0.3), vec2(0.32, 0.75)) + box2(f, vec2(0.68, 0.3), vec2(0.8, 0.75))) * step(0.35, r) * 0.4;
        } else if (style < 9.5) {               // Mangalore tile roof
          wall *= 0.8 + 0.2 * step(0.18, fract(fu.y * 3.2)) + 0.08 * vnoise(fu * 4.0);
        } else {
          wall *= 0.9 + 0.1 * vnoise(fu * 0.8);
        }
        if (((style > 0.5 && style < 1.5) || (style > 2.5 && style < 3.5) || (style > 5.5 && style < 6.5)) && fl < 0.5 && shops) {
          float bay = h21(vec2(cell.x, seed));
          win = box2(f, vec2(0.06, 0.0), vec2(0.94, 0.7)) * step(0.3, bay);
          vec3 shutter = mix(vec3(0.45, 0.47, 0.5), vec3(0.6, 0.62, 0.64), bay);
          vec3 awn = bay < 0.45 ? vec3(0.55, 0.12, 0.1) : bay < 0.7 ? vec3(0.1, 0.32, 0.5) : vec3(0.75, 0.6, 0.15);
          wall = mix(wall, awn, box2(f, vec2(0.02, 0.72), vec2(0.98, 0.86)));
          glass = mix(glass, shutter, step(0.8, bay));
          gLitCol = vec3(1.0, 0.85, 0.6);
        }
        if (style > 0.5 && (style < 1.5 || style > 2.5) && style < 9.5) {
          float streak = vnoise(vec2(fu.x * 0.9, fu.y * 0.04 + seed)) * smoothstep(0.0, 6.0, fu.y);
          wall *= 1.0 - 0.22 * smoothstep(0.55, 0.85, streak);
          wall *= 0.86 + 0.14 * smoothstep(0.0, 1.4, fu.y);
        }
        wall *= 1.0 - dark;
        // anti-alias: far away, blend the pattern to its average so windows don't shimmer
        float aa = smoothstep(0.25, 0.7, max(fwidth(fu.x / bw), fwidth(fu.y / fh)));
        float avgWin = style > 1.5 && style < 2.5 ? 0.85 : style > 4.5 && style < 5.5 ? 0.5 : style > 6.5 ? 0.12 : style < 0.5 || style > 8.5 ? 0.0 : 0.26;
        win = mix(win, avgWin, aa); dark *= 1.0 - aa;
        gWin = clamp(win, 0.0, 1.0);
        gLit = step(0.52, h21(cell + seed * 3.7 + 0.5)) * gWin;
        diffuseColor.rgb = mix(wall, glass, gWin);
      `)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.12, gWin);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = mix(metalnessFactor, 0.55, gWin);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += gLitCol * gLit * uNight * 1.6;');
  };
  return m;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };

/* ---------- geometry accumulator (indexed, flat normals, winding fixed to the normal) ---------- */
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
  /** Quad a,b,c,d (perimeter order) facing `nrm`. */
  quad(a, b, c, d, nrm, col, uvs, fac) {
    const i = [a, b, c, d].map((p, k) => this.vert(p, nrm, col, uvs[k], fac));
    this.tri3(i[0], i[1], i[2], nrm); this.tri3(i[0], i[2], i[3], nrm);
  }
  /** Vertical wall from (x0,z0) to (x1,z1); outward normal is to the right of travel when footprints run clockwise-in-screen (x right, z down). */
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
  /** Gable roof over a rectangle; ridge runs along the longer side. */
  gable(cx, cz, hx, hz, rot, y0, rise, col, fac, endCol) {
    if (hz > hx) return this.gable(cx, cz, hz, hx, rot + Math.PI / 2, y0, rise, col, fac, endCol);
    const c = Math.cos(rot), s = Math.sin(rot);
    const T = (x, z, y) => [cx + x * c + z * s, y, cz - x * s + z * c];
    const ex = hx + 0.5, ez = hz + 0.6;
    const A = T(-ex, -ez, y0), B = T(ex, -ez, y0), C = T(ex, 0, y0 + rise), D = T(-ex, 0, y0 + rise), E = T(ex, ez, y0), F = T(-ex, ez, y0);
    let n1 = norm(cross(sub(B, A), sub(D, A))); if (n1[1] < 0) n1 = n1.map(v => -v);
    let n2 = norm(cross(sub(E, F), sub(D, F))); if (n2[1] < 0) n2 = n2.map(v => -v);
    const slope = Math.hypot(ez, rise);
    this.quad(A, B, C, D, n1, col, [[0, 0], [ex * 2, 0], [ex * 2, slope], [0, slope]], fac);
    this.quad(F, E, C, D, n2, col, [[0, 0], [ex * 2, 0], [ex * 2, slope], [0, slope]], fac);
    const ec = endCol || new THREE.Color(0.9, 0.88, 0.84);
    for (const sx of [-1, 1]) {
      const a = T(sx * hx, -hz, y0), b = T(sx * hx, hz, y0), ap = T(sx * hx, 0, y0 + rise);
      const out = norm([c * sx, 0, -s * sx]);
      const i0 = this.vert(a, out, ec, [0, 0], [STYLE.plain, 3, 3, 0]), i1 = this.vert(b, out, ec, [1, 0], [STYLE.plain, 3, 3, 0]), i2 = this.vert(ap, out, ec, [0.5, 1], [STYLE.plain, 3, 3, 0]);
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

/** Rectangle footprint, optionally with rounded street-side corners (art deco). */
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

/* ---------- city generation ---------- */
const PALETTES = {
  heritage: [0xb19d80, 0x9c8b74, 0xc2ad8e, 0xa59074, 0xb9a487],
  deco: [0xece2c8, 0xeed6c8, 0xdbe5d6, 0xf3ead6, 0xe5d9bb, 0xd9e1e6],
  mid: [0xddd4c4, 0xcdbda6, 0xbdc8cc, 0xe6d6b4, 0xd2c8d9, 0xd8bba5, 0xc7cfb8, 0xe9e1d2],
  tower: [0xece9e1, 0xdedad1, 0xe6e0d3, 0xd5d8da, 0xefe8da],
  glass: [0x39424a, 0x2f383f, 0x48525a],
  office: [0xbdb9b1, 0xa9aaa6, 0xcac3b6],
  chawl: [0xc9a96a, 0xa4b38c, 0xbc9372, 0xd5c492, 0xb7b6a4],
  industrial: [0x938e84, 0xa39b8c, 0x8d9399],
  warehouse: [0x9ea3a6, 0xa9a196, 0x8e979b],
  bungalow: [0xf0ede4, 0xeee4cf, 0xe8efe8],
};
const STYLE_OF = { heritage: STYLE.heritage, deco: STYLE.deco, mid: STYLE.residential, tower: STYLE.residential, glass: STYLE.glass, office: STYLE.office, chawl: STYLE.chawl, industrial: STYLE.industrial, warehouse: STYLE.industrial, bungalow: STYLE.bungalow };

export function districtAt(x, z) {
  let best = DISTRICTS[0], bd = Infinity;
  for (const d of DISTRICTS) { const dd = Math.hypot(d.x - x, d.z - z); if (dd < bd) { bd = dd; best = d; } }
  return best;
}

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
  const tryLot = (cx, cz, hx, hz, rot, d, kind) => {
    const ok = sampleRect(cx, cz, hx, hz, rot, (x, z) => !(landSD(x, z) < 5 || !roadClear(x, z, 1.2) || !freeOf(x, z, 2) || occAt(x, z)));
    if (!ok) return false;
    sampleRect(cx, cz, hx + 1.5, hz + 1.5, rot, (x, z) => { const i = Math.floor((x - OX) / occCell), j = Math.floor((z - OZ) / occCell); if (i >= 0 && j >= 0 && i < ONX && j < ONZ) occ[j * ONX + i] = 1; });
    lots.push({ cx, cz, hx, hz, rot, d, kind });
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
        const width = marine ? 24 + R() * 8 : bkc ? 36 + R() * 24 : bung ? 14 + R() * 8 : 16 + R() * 18;
        const depth = marine ? 20 + R() * 6 : bkc ? 30 + R() * 20 : bung ? 12 + R() * 8 : 14 + R() * 14;
        const setback = marine ? 3 : bkc ? 10 + R() * 8 : bung ? 5 + R() * 4 : 1.2 + R() * 3;
        const off = r.T.hw + r.T.sidewalk + setback + depth / 2;
        const cx = r.x[i] + r.tz[i] * off * side, cz = r.z[i] - r.tx[i] * off * side;
        const rot = Math.atan2(r.tx[i], r.tz[i]) + Math.PI / 2;
        tryLot(cx, cz, width / 2, depth / 2, rot, d, marine ? 'marine' : null);
        s += width + (marine ? 3 : bkc ? 14 + R() * 10 : 2 + R() * 4);
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
  const chunks = new Map();
  const getChunk = (x, z) => { const k = Math.floor((x - OX) / CH) + ',' + Math.floor((z - OZ) / CH); let b = chunks.get(k); if (!b) chunks.set(k, b = new FacadeBuilder()); return b; };
  const col = new THREE.Color(), roofCol = new THREE.Color(), trim = new THREE.Color();
  const tanks = [], boxes = [];
  const pick = arr => arr[Math.floor(R() * arr.length)];
  let towers = 0;
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
    if (style === 'mid') floors = Math.min(floors, 12);
    if ((style === 'tower' || style === 'glass' || style === 'office') && L.hx * L.hz < 90) floors = Math.min(floors, 12);
    const fh = style === 'warehouse' ? 9 : style === 'industrial' ? 5 : style === 'heritage' ? 4.4 : style === 'glass' || style === 'office' ? 3.8 : 3.2;
    const H = Math.max(4, floors * fh + (style === 'heritage' ? 1.5 : 0.6));
    const corners = rectPts(L.cx, L.cz, L.hx, L.hz, L.rot);
    let gy = Infinity; for (const [x, z] of [[L.cx, L.cz], ...corners]) gy = Math.min(gy, terr.heightAt(x, z));
    gy -= 0.6;
    col.set(pick(PALETTES[style] || PALETTES.mid));
    const S = STYLE_OF[style] ?? STYLE.residential;
    const seed = R() * 100;
    const bw = style === 'glass' ? 1.6 : style === 'office' ? 2.0 : style === 'deco' ? 2.6 : style === 'heritage' ? 3.4 : style === 'industrial' || style === 'warehouse' ? 6 : 3.2;
    const fac = [S, fh, bw, seed];
    roofCol.setRGB(0.36 + R() * 0.12, 0.35 + R() * 0.1, 0.33 + R() * 0.08);
    const B = getChunk(L.cx, L.cz);
    const roofFac = [STYLE.roof, 3, 3, seed];
    const plainFac = [STYLE.plain, 3, 3, seed];
    if (style === 'bungalow') {
      B.prism(corners, gy, gy + H, col, fac, null, null, -0.6);
      B.gable(L.cx, L.cz, L.hx, L.hz, L.rot, gy + H, 2.4 + R(), new THREE.Color(0x8a3a28).offsetHSL(0, 0, (R() - 0.5) * 0.08), [STYLE.tiles, 1, 1, seed], col.clone());
    } else if ((style === 'tower' || style === 'glass' || style === 'office') && floors > 12) {
      towers++;
      const podH = 3 * fh + 1;
      const podCol = style === 'glass' ? new THREE.Color(0x8d8f8c) : col.clone();
      B.prism(corners, gy, gy + podH, podCol, [style === 'glass' ? STYLE.office : S, fh, bw, seed], roofCol, roofFac, -0.6);
      const k = 0.62 + R() * 0.2;
      const tp = rectPts(L.cx, L.cz, L.hx * k, L.hz * k, L.rot, style === 'tower' && R() < 0.3 ? 4 : 0);
      B.prism(tp, gy + podH, gy + H, col, fac, roofCol, roofFac, podH - 0.6);
      const cp = rectPts(L.cx, L.cz, L.hx * k * 0.55, L.hz * k * 0.55, L.rot);
      const crown = style === 'glass' ? new THREE.Color(0x2a3036) : col.clone().multiplyScalar(0.92);
      B.prism(cp, gy + H, gy + H + 4 + R() * 4, crown, plainFac, roofCol, roofFac);
    } else {
      const chamfer = style === 'deco' && R() < 0.6 ? 3 + R() * 2 : 0;
      const pts = rectPts(L.cx, L.cz, L.hx, L.hz, L.rot, chamfer);
      B.prism(pts, gy, gy + H, col, fac, roofCol, roofFac, -0.6);
      const cp = rectPts(L.cx, L.cz, L.hx + 0.35, L.hz + 0.35, L.rot, chamfer ? chamfer + 0.35 : 0);
      trim.copy(col).multiplyScalar(style === 'deco' ? 1.05 : 0.88);
      B.prism(cp, gy + H, gy + H + 0.7, trim, plainFac, roofCol, roofFac);
      if (style === 'deco' && R() < 0.7) {
        const tw = rectPts(L.cx, L.cz, Math.min(3, L.hx * 0.25), L.hz * 0.35, L.rot);
        B.prism(tw, gy + H + 0.7, gy + H + 4 + R() * 2, trim, plainFac, roofCol, roofFac);
      }
      if (style === 'warehouse') B.gable(L.cx, L.cz, L.hx, L.hz, L.rot, gy + H + 0.7, 2.2, new THREE.Color(0x7d8487), [STYLE.industrial, 9, 0.4, seed], col.clone());
      if (style !== 'warehouse' && style !== 'heritage' && floors >= 2) {
        const nT = style === 'chawl' || style === 'mid' ? 1 + Math.floor(R() * 3) : Math.floor(R() * 2);
        for (let t = 0; t < nT; t++) tanks.push([L.cx + (R() - 0.5) * L.hx, gy + H + 0.7, L.cz + (R() - 0.5) * L.hz, 0.8 + R() * 0.5]);
        if (R() < 0.6) boxes.push([L.cx + (R() - 0.5) * L.hx * 0.8, gy + H + 0.7, L.cz + (R() - 0.5) * L.hz * 0.8, 2 + R() * 3, 2 + R() * 1.5, 2 + R() * 3, L.rot]);
      }
    }
    colliders.box(L.cx, L.cz, L.hx, L.hz, L.rot, gy - 1, gy + H + 6, 'building');
  }

  const mat = facadeMaterial(atmo.night);
  const group = new THREE.Group(); group.name = 'buildings';
  for (const B of chunks.values()) {
    const m = new THREE.Mesh(B.geometry(), mat);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
  const d = new THREE.Object3D();
  const tankGeo = new THREE.CylinderGeometry(1, 1, 1.6, 10); tankGeo.translate(0, 0.8, 0);
  const tankMesh = new THREE.InstancedMesh(tankGeo, new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.6 }), Math.max(1, tanks.length));
  tanks.forEach(([x, y, z, r], i) => { d.position.set(x, y, z); d.scale.set(r, r, r); d.rotation.set(0, 0, 0); d.updateMatrix(); tankMesh.setMatrixAt(i, d.matrix); });
  tankMesh.count = tanks.length;
  const boxGeo = new THREE.BoxGeometry(1, 1, 1); boxGeo.translate(0, 0.5, 0);
  const boxMesh = new THREE.InstancedMesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x9a978f, roughness: 0.9 }), Math.max(1, boxes.length));
  boxes.forEach(([x, y, z, w, h, dd, rot], i) => { d.position.set(x, y, z); d.scale.set(w, h, dd); d.rotation.set(0, rot, 0); d.updateMatrix(); boxMesh.setMatrixAt(i, d.matrix); });
  boxMesh.count = boxes.length;
  tankMesh.castShadow = boxMesh.castShadow = true;
  group.add(tankMesh, boxMesh);
  scene.add(group);
  return { group, material: mat, count: lots.length, towers };
}
