/* Terrain: a 4 m height grid derived from the natural ground, with roads,
   plazas and parks blended in. Provides off-road physics queries and
   chunked render meshes. Pure data except buildMeshes(THREE). */
import { WORLD_BOUNDS as B, PLAZAS, PARKS } from './layout.js';
import { baseHeight, landSD, vnoise } from './geo2d.js';

export const KIND = { grass: 0, sand: 1, dirt: 2, paved: 3, water: 4, rock: 5 };
const KIND_NAMES = ['grass', 'sand', 'dirt', 'paved', 'water', 'rock'];
const MU = [0.62, 0.5, 0.7, 0.95, 0.4, 0.75];
const ROUGH = [0.03, 0.035, 0.03, 0.006, 0, 0.05];
const sm = (a, b, t) => { const u = Math.max(0, Math.min(1, (t - a) / (b - a))); return u * u * (3 - 2 * u); };

export function buildTerrain(net, { cell = 4 } = {}) {
  const NX = Math.ceil((B.maxX - B.minX) / cell) + 1, NZ = Math.ceil((B.maxZ - B.minZ) / cell) + 1;
  const H = new Float32Array(NX * NZ), K = new Uint8Array(NX * NZ), SD = new Float32Array(NX * NZ);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const x = B.minX + i * cell, z = B.minZ + j * cell, k = j * NX + i;
    H[k] = baseHeight(x, z);
    const sd = landSD(x, z); SD[k] = sd;
    K[k] = sd < -1 ? KIND.water : sd < 9 ? (vnoise(x / 40, z / 40) > 0.45 ? KIND.rock : KIND.sand) : KIND.grass;
  }
  // beaches: Chowpatty & Bandstand get wide sand
  const beach = (cx, cz, r) => {
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const x = B.minX + i * cell, z = B.minZ + j * cell, k = j * NX + i;
      if (Math.hypot(x - cx, z - cz) < r && SD[k] > -1 && SD[k] < 34) { K[k] = KIND.sand; H[k] = Math.min(H[k], 0.3 + SD[k] * 0.06); }
    }
  };
  beach(-245, 348, 75);

  /* ---- road stamps: closest road per cell ---- */
  const RD = new Float32Array(NX * NZ).fill(1e9), RH = new Float32Array(NX * NZ), RW = new Float32Array(NX * NZ), RC = new Float32Array(NX * NZ);
  const BLEND = 16;
  for (const r of net.roads) {
    const T = r.T;
    for (let s = 0; s < r.n - 1; s++) {
      const f = r.deck ? Math.max(r.deckF[s], r.deckF[s + 1]) : 0;
      const elevated = r.deck && f > 0.08;
      const cw = T.hw + 2, W = T.hw + T.sidewalk + (T.sidewalk ? 0 : 1.2);
      const reach = W + BLEND;
      const x0 = Math.min(r.x[s], r.x[s + 1]) - reach, x1 = Math.max(r.x[s], r.x[s + 1]) + reach;
      const z0 = Math.min(r.z[s], r.z[s + 1]) - reach, z1 = Math.max(r.z[s], r.z[s + 1]) + reach;
      const i0 = Math.max(0, Math.floor((x0 - B.minX) / cell)), i1 = Math.min(NX - 1, Math.ceil((x1 - B.minX) / cell));
      const j0 = Math.max(0, Math.floor((z0 - B.minZ) / cell)), j1 = Math.min(NZ - 1, Math.ceil((z1 - B.minZ) / cell));
      const ax = r.x[s], az = r.z[s], dx = r.x[s + 1] - ax, dz = r.z[s + 1] - az, l2 = dx * dx + dz * dz;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = B.minX + i * cell, z = B.minZ + j * cell, k = j * NX + i;
        let t = ((x - ax) * dx + (z - az) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
        const h = r.h[s] + (r.h[s + 1] - r.h[s]) * t;
        if (elevated) {
          // keep the ground below the deck under ramps (embankment side walls hide the gap)
          if (d < W + 2 && h - H[k] < 4 && SD[k] > 0) H[k] = Math.min(H[k], h - 1.2);
          continue;
        }
        if (d < RD[k]) { RD[k] = d; RH[k] = h; RW[k] = W; RC[k] = cw; }
      }
    }
  }
  // junction discs
  for (const nd of Object.values(net.nodes)) {
    const reach = nd.R + nd.sw + BLEND;
    const i0 = Math.max(0, Math.floor((nd.x - reach - B.minX) / cell)), i1 = Math.min(NX - 1, Math.ceil((nd.x + reach - B.minX) / cell));
    const j0 = Math.max(0, Math.floor((nd.z - reach - B.minZ) / cell)), j1 = Math.min(NZ - 1, Math.ceil((nd.z + reach - B.minZ) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = B.minX + i * cell, z = B.minZ + j * cell, k = j * NX + i;
      const d = Math.hypot(x - nd.x, z - nd.z) - nd.R + 2;
      if (d < RD[k]) { RD[k] = Math.max(0, d); RH[k] = nd.h; RW[k] = nd.R + nd.sw - (nd.R - 2); RC[k] = 2; }
    }
  }
  for (let k = 0; k < H.length; k++) {
    const d = RD[k]; if (d > 1e8) continue;
    const W = RW[k], cw = RC[k];
    if (d < cw) { H[k] = RH[k] - 0.25; if (K[k] !== KIND.water) K[k] = KIND.paved; }
    else if (d < W) { H[k] = RH[k] + 0.04; K[k] = KIND.paved; }
    else if (d < W + BLEND) { const t = sm(W, W + BLEND, d); H[k] = (RH[k] + 0.04) * (1 - t) + H[k] * t; }
  }
  /* ---- plazas: flatten + pave ---- */
  for (const p of PLAZAS) {
    const ph = baseHeight(p.x, p.z);
    p.h = ph;
    const reach = p.r + 14;
    for (let j = 0; j < NZ; j++) {
      const z = B.minZ + j * cell; if (Math.abs(z - p.z) > reach) continue;
      for (let i = 0; i < NX; i++) {
        const x = B.minX + i * cell; if (Math.abs(x - p.x) > reach) continue;
        const k = j * NX + i, d = Math.hypot(x - p.x, z - p.z);
        if (d > reach || SD[k] < 0) continue;
        if (RD[k] < RC[k]) continue;               // never lift the terrain above a carriageway
        const t = sm(p.r, reach, d);
        H[k] = (ph + 0.05) * (1 - t) + H[k] * t;
        if (d < p.r) K[k] = KIND[p.surface];
      }
    }
  }
  /* ---- parks: gentle flatten so maidans read as level grounds ---- */
  for (const p of PARKS) {
    const ph = baseHeight(p.x, p.z), c = Math.cos(p.rot), s = Math.sin(p.rot);
    for (let j = 0; j < NZ; j++) {
      const z = B.minZ + j * cell; if (Math.abs(z - p.z) > p.rz + 40) continue;
      for (let i = 0; i < NX; i++) {
        const x = B.minX + i * cell; if (Math.abs(x - p.x) > p.rx + 40) continue;
        const k = j * NX + i;
        const lx = (x - p.x) * c + (z - p.z) * s, lz = -(x - p.x) * s + (z - p.z) * c;
        const e = Math.hypot(lx / p.rx, lz / p.rz);
        if (e > 1.25 || RD[k] < RW[k] + 2) continue;
        const t = sm(0.9, 1.25, e);
        if (p.kind === 'maidan') H[k] = (ph) * (1 - t) + H[k] * t;
      }
    }
  }

  function idx(x, z) {
    const fx = (x - B.minX) / cell, fz = (z - B.minZ) / cell;
    const i = Math.max(0, Math.min(NX - 2, Math.floor(fx))), j = Math.max(0, Math.min(NZ - 2, Math.floor(fz)));
    return { i, j, u: Math.min(1, Math.max(0, fx - i)), v: Math.min(1, Math.max(0, fz - j)) };
  }
  function heightAt(x, z) {
    const { i, j, u, v } = idx(x, z), k = j * NX + i;
    return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + NX] * (1 - u) + H[k + NX + 1] * u) * v;
  }
  function groundSurface(x, z, out) {
    const { i, j, u, v } = idx(x, z), k = j * NX + i;
    const a = H[k], b = H[k + 1], c = H[k + NX], d = H[k + NX + 1];
    const h = (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    const dhx = ((b - a) * (1 - v) + (d - c) * v) / cell, dhz = ((c - a) * (1 - u) + (d - b) * u) / cell;
    const nl = Math.hypot(dhx, 1, dhz);
    const kk = K[(j + (v > 0.5 ? 1 : 0)) * NX + i + (u > 0.5 ? 1 : 0)];
    out.nx = -dhx / nl; out.ny = 1 / nl; out.nz = -dhz / nl;
    out.kind = KIND_NAMES[kk]; out.mu = MU[kk]; out.rough = ROUGH[kk];
    if (h < 0.05) { out.water = true; out.h = h; out.kind = 'water'; }
    else { out.water = false; out.h = h; }
    return out;
  }

  return { NX, NZ, cell, H, K, SD, heightAt, groundSurface, roadDist: RD };
}

/* ---------- render meshes ---------- */
export function buildTerrainMeshes(THREE, terr, { tile = 128, step = 1 } = {}) {
  const { NX, NZ, cell, H, K, SD } = terr;
  const group = new THREE.Group(); group.name = 'terrain';
  const per = Math.round(tile / cell);
  const col = new THREE.Color();
  const grassA = new THREE.Color(0x5b7a37), grassB = new THREE.Color(0x7a8f45), grassC = new THREE.Color(0x46652c);
  const sand = new THREE.Color(0xd6c29a), wetSand = new THREE.Color(0xa99772), dirt = new THREE.Color(0x8a7556), paved = new THREE.Color(0xa49c90), rock = new THREE.Color(0x4f4b45), sea = new THREE.Color(0x3d5f62);
  const detail = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'); const img = g.createImageData(256, 256);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let p = 0; p < 256 * 256; p++) { const v = 200 + rnd() * 55; img.data[p * 4] = v; img.data[p * 4 + 1] = v; img.data[p * 4 + 2] = v; img.data[p * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
    for (let n = 0; n < 2200; n++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,240' : '30,40,20'},${0.08 + rnd() * 0.1})`; g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 2 + rnd() * 5); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = sh => {
    // world-space detail tiling so tiles line up seamlessly
    sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vMapUv = (modelMatrix * vec4(position,1.0)).xz / 9.0;');
  };
  for (let tj = 0; tj < NZ - 1; tj += per) for (let ti = 0; ti < NX - 1; ti += per) {
    // skip tiles that are entirely open water
    let anyLand = false;
    for (let j = tj; j <= Math.min(NZ - 1, tj + per) && !anyLand; j += 2) for (let i = ti; i <= Math.min(NX - 1, ti + per); i += 2) if (SD[j * NX + i] > -60) { anyLand = true; break; }
    if (!anyLand) continue;
    const ni = Math.min(per, NX - 1 - ti), nj = Math.min(per, NZ - 1 - tj);
    const vi = Math.floor(ni / step) + 1, vj = Math.floor(nj / step) + 1;
    const pos = new Float32Array(vi * vj * 3), colA = new Float32Array(vi * vj * 3), uv = new Float32Array(vi * vj * 2);
    let p = 0;
    for (let b = 0; b < vj; b++) for (let a = 0; a < vi; a++) {
      const i = ti + a * step, j = tj + b * step, k = j * NX + i;
      const x = WB.minX + i * cell, z = WB.minZ + j * cell;
      pos[p * 3] = x; pos[p * 3 + 1] = H[k]; pos[p * 3 + 2] = z;
      const kk = K[k];
      const nz = vnoise(x / 30, z / 30), nz2 = vnoise(x / 7, z / 7);
      if (kk === KIND.grass) { col.copy(grassA).lerp(grassB, nz * 0.8).lerp(grassC, Math.max(0, nz2 - 0.55) * 1.4); }
      else if (kk === KIND.sand) col.copy(sand).lerp(wetSand, Math.max(0, 1 - SD[k] / 10));
      else if (kk === KIND.dirt) col.copy(dirt).lerp(grassA, nz * 0.3);
      else if (kk === KIND.paved) col.copy(paved).multiplyScalar(0.9 + nz2 * 0.15);
      else if (kk === KIND.rock) col.copy(rock).multiplyScalar(0.8 + nz2 * 0.4);
      else col.copy(sea);
      if (H[k] < 0) col.lerp(sea, Math.min(1, -H[k] / 3));
      colA[p * 3] = col.r; colA[p * 3 + 1] = col.g; colA[p * 3 + 2] = col.b;
      uv[p * 2] = x / 9; uv[p * 2 + 1] = z / 9;
      p++;
    }
    const idx = [];
    for (let b = 0; b < vj - 1; b++) for (let a = 0; a < vi - 1; a++) {
      const q = b * vi + a;
      idx.push(q, q + vi, q + 1, q + 1, q + vi, q + vi + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colA, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    group.add(m);
  }
  return group;
}
import { WORLD_BOUNDS as WB } from './layout.js';
