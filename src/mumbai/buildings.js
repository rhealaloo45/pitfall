/* City blocks. Crisp masses with real architectural relief — parapets and
   coping, cornices, Art Deco curved corners and eyebrow bands on Marine Drive,
   stone cornices in Fort, shop canopies, podiums and crowns on towers — skinned
   with the mipmapped facade library (facades.js). Street fronts get 3D signs,
   awnings and AC units aligned to the window grid; roofs get water tanks and
   stair rooms. Everything is merged into a few chunked meshes for culling. */
import * as THREE from 'three';
import { DISTRICTS, RESERVED, PARKS, PLAZAS, WORLD_BOUNDS as WB } from './layout.js';
import { landSD } from './geo2d.js';
import { rng, canvasTexture } from '../core/geo.js';
import { insideSlab } from './diorama.js';
import { STYLE, DIMS, FacadeBuilder, facadeMaterial, rectPts } from './facades.js';
export { STYLE, FacadeBuilder, facadeMaterial, rectPts };

/* ---------- palette: weathered lime plaster, buff stone, faded pastels, tinted glass ---------- */
export const PALETTES = {
  heritage: ['#cdb894', '#c2ad8b', '#bba892', '#d0bf9f', '#b8ab98'],
  deco: ['#ede4d0', '#e9dcc1', '#e8d4c2', '#dbdecf', '#f0e7d4', '#e5d6b3', '#e2d0c8'],
  mid: ['#ddd6c8', '#d8cfbd', '#cfc8bb', '#e2d9c6', '#d4cbb0', '#c9c5bd', '#d8c7b2', '#c8cfca', '#dccfb8', '#c3c8ca', '#d9c3b4'],
  tower: ['#e8e4dc', '#dedad1', '#d5d2cb', '#e5ded2', '#d1d5d6', '#e2dccf'],
  glass: ['#7e98a7', '#6f8a8f', '#8a9ba5', '#7b909d', '#94a4a4', '#6d7f8c'],
  office: ['#d8d5ce', '#cbc9c3', '#ddd7cb', '#c9ccce'],
  chawl: ['#dbd1b0', '#cfc19c', '#d8c8b2', '#c4cab6', '#dfd2bb', '#cdb9a6'],
  industrial: ['#bbb5a8', '#aba89e', '#c4baa5', '#b1b4b0'],
  warehouse: ['#a9a7a0', '#b6ad9a', '#a0a6a4', '#b9b2a3'],
  bungalow: ['#f2eee4', '#ede7d8', '#eae8e1', '#f0e8de'],
};

export function districtAt(x, z) {
  let best = DISTRICTS[0], bd = Infinity;
  for (const d of DISTRICTS) { const dd = Math.hypot(d.x - x, d.z - z); if (dd < bd) { bd = dd; best = d; } }
  return best;
}

/* ---------- street-front detail atlas: shop signs, AC grille ---------- */
export const SHOP_NAMES = ['CUTTING CHAI', 'VADA PAV CORNER', 'IRANI CAFE', 'BOMBAY TAILORS', 'LALOO MOTORS', 'PIT STOP DHABA', 'KEBAB KING', 'MITHAI HOUSE',
  'CYBER CAFE', 'FAST FIX MOBILES', 'BHEL PURI', 'PAAN PALACE', 'SHARMA STORES', 'DOSA EXPRESS', 'JUICE CENTRE', 'CHEMIST 24x7',
  'MODERN BAKERY', 'RADIO REPAIR', 'FILMI POSTERS', 'TYRE & TUBE'];
const SIGN_COLS = [['#8e2a22', '#f3ead8'], ['#1f3d5c', '#f2efe6'], ['#c99a2e', '#2a2420'], ['#2f5d4a', '#f2efe6'], ['#efe9dc', '#8e2a22'], ['#2b2b30', '#e8c46a'], ['#6b3b2a', '#f0e2c8'], ['#f2efe6', '#1f3d5c']];
function detailAtlas() {
  // 1024×1024: column of 20 signs (each 512×48) at left; right half: AC grille + solid white
  return canvasTexture(1024, 1024, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 1024, 1024);
    SHOP_NAMES.forEach((name, i) => {
      const [bg, fg] = SIGN_COLS[i % SIGN_COLS.length];
      const y = i * 50;
      g.fillStyle = bg; g.fillRect(0, y, 512, 48);
      g.strokeStyle = fg; g.globalAlpha = 0.35; g.lineWidth = 2; g.strokeRect(5, y + 5, 502, 38); g.globalAlpha = 1;
      g.fillStyle = fg; g.font = '700 30px "Titillium Web", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      let s = 30; while (g.measureText(name).width > 470 && s > 14) { s -= 2; g.font = `700 ${s}px "Titillium Web", Arial, sans-serif`; }
      g.fillText(name, 256, y + 26);
      g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(0, y + 44, 512, 4);
    });
    // AC unit front at (512..640, 0..96)
    g.fillStyle = '#e9e7e1'; g.fillRect(512, 0, 128, 96);
    g.fillStyle = '#b9bab9'; g.beginPath(); g.arc(560, 48, 34, 0, 7); g.fill();
    g.strokeStyle = '#8d8f90'; g.lineWidth = 2; for (let k = 0; k < 8; k++) { g.beginPath(); g.arc(560, 48, 6 + k * 3.6, 0, 7); g.stroke(); }
    g.fillStyle = '#8a8c90'; for (let k = 0; k < 6; k++) g.fillRect(604, 14 + k * 12, 28, 5);
    g.fillStyle = 'rgba(90,70,40,0.25)'; g.fillRect(512, 80, 128, 16);   // rust/dirt drip
  }, { aniso: 8 });
}
const ATLAS = { sign: i => [0, 1 - (i * 50 + 48) / 1024, 0.5, 1 - (i * 50) / 1024], ac: [0.5, 1 - 96 / 1024, 0.625, 1], white: [0.9, 0.5, 0.95, 0.55] };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

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
  const C = hex => new THREE.Color(hex);
  const tanks = [], rooms = [];
  const pick = arr => arr[Math.floor(R() * arr.length)];
  const white = C('#ffffff'), acCol = C('#ecebe6');
  const stoneTrim = C('#d9c9a6'), concrete = C('#b9b6ae'), coping = C('#d8d4cb');
  let towers = 0, details = 0;
  const snap = (h, bw, margin) => Math.max(bw * 0.5 + margin, (Math.max(1, Math.floor((2 * h - 2 * margin) / bw + 1e-6)) * bw + 2 * margin) / 2);
  const fac = (style, seed) => [style, DIMS[style][1], DIMS[style][0], seed];

  for (const L of lots) {
    const d = L.d;
    let kind = L.kind === 'marine' ? 'deco' : pick(d.styles);
    if (d.id === 'docks') kind = 'warehouse';
    let floors = Math.round(d.h[0] + R() * (d.h[1] - d.h[0]));
    if (kind === 'bungalow') floors = 1 + Math.round(R() * 1.4);
    if (kind === 'deco') floors = 4 + Math.round(R() * 3);
    if (kind === 'chawl') floors = Math.min(floors, 3 + Math.round(R() * 2));
    if (kind === 'heritage') floors = Math.min(floors, 3 + Math.round(R() * 2));
    if (kind === 'warehouse' || kind === 'industrial') floors = kind === 'warehouse' ? 1 : 1 + Math.round(R());
    if (kind === 'mid') floors = Math.min(floors, 10);
    const isTower = (kind === 'tower' || kind === 'glass' || kind === 'office') && floors > 12 && L.hx * L.hz >= 90;
    if ((kind === 'tower' || kind === 'glass' || kind === 'office') && !isTower) floors = Math.min(floors, 12);
    const seed = 1 + Math.floor(R() * 996);
    const S = kind === 'deco' ? STYLE.deco : kind === 'heritage' ? STYLE.heritage : kind === 'glass' ? STYLE.glass : kind === 'office' ? STYLE.office
      : kind === 'chawl' ? STYLE.chawl : kind === 'industrial' || kind === 'warehouse' ? STYLE.industrial : kind === 'bungalow' ? STYLE.bungalow
      : (R() < 0.45 ? STYLE.balcony : STYLE.residential);
    const [bw, fh] = DIMS[S];
    // footprint snapped to whole bays so windows sit symmetrically between the corners
    const hx = snap(L.hx, bw, 0.45), hz = snap(L.hz, bw, 0.45);
    L.hx = hx; L.hz = hz;
    const H = floors * fh;
    const corners = rectPts(L.cx, L.cz, hx, hz, L.rot);
    let gy = Infinity; for (const [x, z] of [[L.cx, L.cz], ...corners]) gy = Math.min(gy, terr.heightAt(x, z));
    gy -= 0.6;
    const g0 = gy + 0.6;                                  // street level: storey lines start here
    const col = C(pick(PALETTES[kind] || PALETTES.mid)).multiplyScalar(0.94 + R() * 0.08);
    const B = getChunk(L.cx, L.cz);
    const F = fac(S, seed);
    const plainF = fac(STYLE.plain, seed), roofF = fac(STYLE.roof, seed);
    const front = -L.side;                                 // local z of the street facade (±1), 0 for infill
    const rp = (ex, ez, y0, y1, c, f, roof = c, chamfer = 0) => B.prism(rectPts(L.cx, L.cz, hx + ex, hz + ez, L.rot, chamfer), y0, y1, c, f, roof, roofF);
    const parapet = (pts, y, h, c) => {
      // outer wall continues up, inner face, coping on top
      B.prism(pts, y, y + h, c, plainF, null);
      const inner = pts.map(([x, z]) => [L.cx + (x - L.cx) * 0.985, L.cz + (z - L.cz) * 0.985]);
      B.prism(inner, y, y + h, c.clone().multiplyScalar(0.9), plainF, null, null, 0, { inward: true });
      B.cap(pts, y + h, coping, plainF);
    };
    let top = g0 + H;
    if (kind === 'bungalow') {
      B.prism(corners, gy, top, col, F, null, null, -0.6);
      B.gable(L.cx, L.cz, hx, hz, L.rot, top, 2.2 + R() * 0.8, C('#ffffff'), fac(STYLE.tiles, seed), col.clone());
      top += 2;
    } else if (isTower) {
      towers++;
      const podF = fac(kind === 'glass' || kind === 'office' ? STYLE.office : STYLE.residential, seed);
      const podFloors = 2 + Math.floor(R() * 2), podH = podFloors * podF[1];
      const podCol = kind === 'glass' ? C(pick(PALETTES.office)) : C(pick(PALETTES.mid));
      B.prism(corners, gy, g0 + podH, podCol, podF, concrete, roofF, -0.6);
      parapet(corners, g0 + podH, 1.1, podCol);
      const k = 0.62 + R() * 0.18;
      const thx = snap(hx * k, bw, 0.45), thz = snap(hz * k, bw, 0.45);
      const tpts = rectPts(L.cx, L.cz, thx, thz, L.rot);
      const tTop = g0 + podH + (floors - podFloors) * fh;
      B.prism(tpts, g0 + podH, tTop, col, F, null, null, podH);
      // crown: slab edge, parapet, machine room, and a frame on residential towers
      B.band(rectPts(L.cx, L.cz, thx + 0.25, thz + 0.25, L.rot), tTop, tTop + 0.45, coping, plainF);
      parapet(tpts, tTop + 0.45, 1.2, kind === 'glass' ? C('#5c666c') : col);
      B.prism(rectPts(L.cx + (R() - 0.5) * thx * 0.4, L.cz, Math.min(4, thx * 0.4), Math.min(3.5, thz * 0.4), L.rot), tTop, tTop + 4.2, concrete, fac(STYLE.concrete, seed), concrete, roofF);
      if (kind === 'glass') for (const sx of [-1, 1]) B.prism(rectPts(L.cx, L.cz, 0.35, thz + 0.4, L.rot).map(([x, z]) => [x + Math.cos(L.rot) * sx * thx, z - Math.sin(L.rot) * sx * thx]), tTop, tTop + 6, C('#9aa3a8'), plainF, C('#9aa3a8'), roofF);
      top = tTop + 4;
    } else {
      const deco = kind === 'deco', heritage = kind === 'heritage';
      const chamfer = deco && front ? 3.4 + R() * 1.6 : 0;
      // deco curved corners face the street: rectPts rounds the +z side, so flip the footprint when the street is at −z
      const rot = chamfer && front < 0 ? L.rot + Math.PI : L.rot;
      const pts = rectPts(L.cx, L.cz, hx, hz, rot, chamfer);
      B.prism(pts, gy, top, col, F, concrete, roofF, -0.6);
      if (deco) {
        // eyebrow bands every storey + a heavier band over the ground floor, stepped parapet and a corner fin
        for (let f = 1; f <= floors; f++) B.band(rectPts(L.cx, L.cz, hx + 0.16, hz + 0.16, rot, chamfer ? chamfer + 0.16 : 0), g0 + f * fh - 0.7, g0 + f * fh - 0.58, col.clone().lerp(white, 0.25), plainF);
        parapet(pts, top, 1.0, col);
        if (chamfer && R() < 0.8) {
          const c = Math.cos(rot), s = Math.sin(rot), sx = R() < 0.5 ? -1 : 1;
          const fx = L.cx + (sx * (hx - chamfer * 0.3)) * c + (hz - chamfer * 0.3) * s, fz = L.cz - (sx * (hx - chamfer * 0.3)) * s + (hz - chamfer * 0.3) * c;
          B.prism(rectPts(fx, fz, 0.5, 0.5, rot + Math.PI / 4), top - 2, top + 4.5, col.clone().lerp(white, 0.2), plainF, col.clone().lerp(white, 0.2), roofF);
        }
      } else if (heritage) {
        B.band(rectPts(L.cx, L.cz, hx + 0.12, hz + 0.12, L.rot), g0 + fh - 0.25, g0 + fh, stoneTrim, fac(STYLE.plainStone, seed));
        B.band(rectPts(L.cx, L.cz, hx + 0.55, hz + 0.55, L.rot), top, top + 0.55, stoneTrim, fac(STYLE.plainStone, seed));
        parapet(rectPts(L.cx, L.cz, hx + 0.2, hz + 0.2, L.rot), top + 0.55, 1.1, stoneTrim);
        if (R() < 0.35) B.gable(L.cx, L.cz, hx - 0.6, hz - 0.6, L.rot, top + 0.55, 3 + R() * 2, C('#d9d4ca'), fac(STYLE.tiles, seed), stoneTrim);
        top += 1.6;
      } else if (kind === 'warehouse' || kind === 'industrial') {
        B.gable(L.cx, L.cz, hx, hz, L.rot, top, 2.4, C(pick(['#9fa3a4', '#a7a29a', '#8f9493'])), fac(STYLE.concrete, seed), col.clone());
      } else {
        if (kind === 'chawl' && R() < 0.55) B.gable(L.cx, L.cz, hx, hz, L.rot, top, 2.6, C('#ffffff'), fac(STYLE.tiles, seed), col.clone());
        else {
          B.band(rectPts(L.cx, L.cz, hx + 0.12, hz + 0.12, L.rot), top - 0.05, top + 0.25, coping, plainF);
          parapet(rectPts(L.cx, L.cz, hx + 0.05, hz + 0.05, L.rot), top + 0.25, 0.95, col);
        }
      }
      // shop canopy on street facades (a concrete slab over the shopfronts)
      L.canopy = front && !deco && kind !== 'warehouse' && kind !== 'industrial' && R() < 0.75;
      if (L.canopy) {
        const c = Math.cos(L.rot), s = Math.sin(L.rot);
        const z0 = front * hz, z1 = front * (hz + 0.9);
        const cp = [[-hx, z0], [hx, z0], [hx, z1], [-hx, z1]].map(([x, z]) => [L.cx + x * c + z * s, L.cz - x * s + z * c]);
        B.band(front > 0 ? cp : cp.slice().reverse(), g0 + fh - 0.08, g0 + fh + 0.1, heritage ? stoneTrim : coping, plainF);
      }
      // roof clutter: Sintex water tanks and a stair room
      if (kind !== 'warehouse' && kind !== 'industrial' && !(kind === 'chawl') && floors >= 2) {
        const nT = kind === 'mid' ? 1 + Math.floor(R() * 3) : Math.floor(R() * 2.5);
        for (let t = 0; t < nT; t++) tanks.push([L.cx + (R() - 0.5) * hx, top, L.cz + (R() - 0.5) * hz, 0.7 + R() * 0.45]);
        if (R() < 0.6 && hx > 4 && hz > 4) {
          const rx = L.cx + (R() - 0.5) * hx * 0.6, rz = L.cz + (R() - 0.5) * hz * 0.6;
          B.prism(rectPts(rx, rz, 1.6, 1.8, L.rot), top, top + 2.8, col.clone().multiplyScalar(0.95), plainF, concrete, roofF);
        }
      }
    }
    colliders.box(L.cx, L.cz, hx, hz, L.rot, gy - 1, top + 6, 'building');
    L.top = top;

    /* 3D street-front details on the road-facing wall, aligned to the window grid */
    if (front && kind !== 'warehouse' && kind !== 'glass' && !isTower && quality.props >= 0.45) {
      const DB = getD(L.cx, L.cz);
      const c = Math.cos(L.rot), s = Math.sin(L.rot);
      const W = (x, y, z) => [L.cx + x * c + z * s, y, L.cz - x * s + z * c];
      const faceRot = L.rot + (front < 0 ? Math.PI : 0);   // local +z of the detail box points away from the wall
      const margin = (2 * hx - Math.floor(2 * hx / bw + 1e-6) * bw) / 2;
      const nCells = Math.floor(2 * hx / bw + 1e-6);
      const shopRow = kind !== 'bungalow' && kind !== 'heritage' && kind !== 'deco' && fract(seed * 0.618034) > 0.25;
      const signOut = L.canopy ? 0.9 : 0.12;
      const zf = front * (hz + 0.02);
      for (let k = 0; k < nCells; k++) {
        const along = margin + (k + 0.5) * bw;
        const lx = front < 0 ? -hx + along : hx - along;
        if (shopRow && R() < 0.8) {
          const si = Math.floor(R() * SHOP_NAMES.length);
          const [x, y, z] = W(lx, L.canopy ? g0 + fh + 0.42 : g0 + fh - 0.35, zf + front * signOut);
          DB.box(x, y, z, bw - 0.4, 0.62, 0.14, faceRot, white, ATLAS.sign(si));
          if (R() < 0.35) {
            const [ax, ay, az] = W(lx, g0 + fh - 0.7, zf + front * 0.55);
            DB.box(ax, ay, az, bw - 0.5, 0.06, 1.1, faceRot, C(pick(['#7f3127', '#3c5f52', '#2f4b63', '#a2733a', '#6b6f73'])), ATLAS.white, 0.28);
          }
          details++;
        }
        for (let f = 1; f < Math.min(floors, 10); f++) {
          if (R() > 0.2) continue;
          const [x, y, z] = W(lx + (bw * 0.5 - 0.55) * (R() < 0.5 ? -1 : 1), g0 + f * fh + 0.55, zf + front * 0.24);
          DB.box(x, y, z, 0.8, 0.52, 0.42, faceRot, acCol, ATLAS.ac);
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
  /* soft contact shadow skirt around every footprint (ambient occlusion on Low/Medium) */
  {
    const P = [], UV = [], I = [];
    for (const L of lots) {
      const pts = rectPts(L.cx, L.cz, L.hx + 0.05, L.hz + 0.05, L.rot), out = rectPts(L.cx, L.cz, L.hx + 2.6, L.hz + 2.6, L.rot);
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
    const tex = canvasTexture(4, 64, (g2) => { const grd = g2.createLinearGradient(0, 0, 0, 64); grd.addColorStop(0, 'rgba(18,16,14,0.38)'); grd.addColorStop(1, 'rgba(18,16,14,0)'); g2.fillStyle = grd; g2.fillRect(0, 0, 4, 64); }, { srgb: false });
    tex.flipY = false;
    const skirt = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6 }));
    skirt.renderOrder = 1; skirt.userData.noAO = true;
    group.add(skirt);
  }
  /* rooftop water tanks: black ribbed polyethylene, the Mumbai skyline's punctuation */
  const d = new THREE.Object3D();
  const tankGeo = new THREE.CylinderGeometry(1, 0.96, 1.5, 14, 4);
  { const p = tankGeo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = 1 + 0.04 * Math.cos(y * 9); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } tankGeo.computeVertexNormals(); }
  tankGeo.translate(0, 0.75, 0);
  const tankMesh = new THREE.InstancedMesh(tankGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 }), Math.max(1, tanks.length));
  const tc = new THREE.Color();
  tanks.forEach(([x, y, z, r], i) => { d.position.set(x, y, z); d.scale.set(r, r, r); d.rotation.set(0, 0, 0); d.updateMatrix(); tankMesh.setMatrixAt(i, d.matrix); tankMesh.setColorAt(i, tc.set(i % 7 === 0 ? 0xdedbd2 : i % 5 === 0 ? 0x2f4e7a : 0x1c1d1f)); });
  tankMesh.count = tanks.length;
  tankMesh.castShadow = true; tankMesh.receiveShadow = true;
  group.add(tankMesh);
  scene.add(group);
  return {
    group, material: mat, count: lots.length, towers, details, occAt, lots,
    setNight(v) { dmat.emissiveIntensity = v * 0.45; },
  };
}
