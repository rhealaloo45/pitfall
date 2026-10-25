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
/* Splat-blended ground: per-vertex weights for grass / earth / sand / concrete
   (rock is the remainder), textured from the ground library. Urban land reads as
   compacted earth with patches of grass; maidans, gardens and the green hills
   are grass; beaches are sand. */
export function buildTerrainMeshes(THREE, terr, { tile = 128, step = 1, webgl2 = true, texSize = 512, ground, greenAt = () => 0 } = {}) {
  const { NX, NZ, cell, H, K, SD } = terr;
  const group = new THREE.Group(); group.name = 'terrain';
  const per = Math.round(tile / cell);
  let mat;
  if (webgl2 && ground) {
    mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
    const U = ground.uniforms(texSize);
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 gw; varying vec4 vGw; varying vec3 vWp;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n vGw = gw; vWp = (modelMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec4 vGw; varying vec3 vWp;\n' + ground.GLSL + '\nfloat gRough; vec2 gTn;')
        .replace('#include <map_fragment>', `
          vec2 wp = vWp.xz;
          vec4 mac = gMacro(wp);
          float blend = smoothstep(0.35, 0.65, mac.b);
          vec4 w = vGw;
          // break up the boundaries with the macro noise; grass grows in patches on urban earth
          w.x *= mix(0.45, 1.6, smoothstep(0.3, 0.7, mac.a));
          w.y *= mix(1.3, 0.7, smoothstep(0.3, 0.7, mac.a));
          float rock = max(0.0, 1.0 - (vGw.x + vGw.y + vGw.z + vGw.w));
          float sum = w.x + w.y + w.z + w.w + rock + 1e-4;
          w /= sum; rock /= sum;
          vec3 alb = vec3(0.0); vec2 tn = vec2(0.0); float ro = 0.0;
          if (w.x > 0.01) { GSample g = gLayer(wp, 0.0, 5.0, blend); alb += g.alb * w.x; tn += g.n * w.x; ro += g.rough * w.x; }
          if (w.y > 0.01) { GSample g = gLayer(wp, 1.0, 5.0, blend); alb += g.alb * w.y; tn += g.n * w.y; ro += g.rough * w.y; }
          if (w.z > 0.01) { GSample g = gLayer(wp, 2.0, 6.0, blend); alb += g.alb * w.z; tn += g.n * w.z; ro += g.rough * w.z; }
          if (w.w > 0.01) { GSample g = gLayer(wp, 3.0, 4.0, blend); alb += g.alb * w.w; tn += g.n * w.w; ro += g.rough * w.w; }
          if (rock > 0.01) { GSample g = gLayer(wp, 4.0, 6.0, blend); alb += g.alb * rock; tn += g.n * rock; ro += g.rough * rock; }
          alb *= 0.82 + 0.36 * mac.r;
          // wet sand and rock at the waterline
          float wet = 1.0 - smoothstep(0.15, 0.9, vWp.y);
          alb *= 1.0 - 0.38 * wet; ro = mix(ro, 0.35, wet * 0.8);
          diffuseColor.rgb *= alb;
          gRough = ro; gTn = tn;`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
        .replace('#include <normal_fragment_maps>', 'normal = gPerturb(normal, gTn, -vViewPosition, wp / 5.0);');
    };
    mat.customProgramCacheKey = () => 'terrain-splat';
  } else {
    mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  }
  const C = (h) => new THREE.Color(h);
  const fallback = [C('#68733a'), C('#7b6a55'), C('#b3a285'), C('#a7a39a'), C('#59534d')];
  const col = new THREE.Color();
  for (let tj = 0; tj < NZ - 1; tj += per) for (let ti = 0; ti < NX - 1; ti += per) {
    // skip tiles that are entirely open water
    let anyLand = false;
    for (let j = tj; j <= Math.min(NZ - 1, tj + per) && !anyLand; j += 2) for (let i = ti; i <= Math.min(NX - 1, ti + per); i += 2) if (SD[j * NX + i] > -60) { anyLand = true; break; }
    if (!anyLand) continue;
    const ni = Math.min(per, NX - 1 - ti), nj = Math.min(per, NZ - 1 - tj);
    const vi = Math.floor(ni / step) + 1, vj = Math.floor(nj / step) + 1;
    const pos = new Float32Array(vi * vj * 3), gw = new Float32Array(vi * vj * 4), colA = new Float32Array(vi * vj * 3);
    let p = 0;
    for (let b = 0; b < vj; b++) for (let a = 0; a < vi; a++) {
      const i = ti + a * step, j = tj + b * step, k = j * NX + i;
      const x = WB.minX + i * cell, z = WB.minZ + j * cell;
      pos[p * 3] = x; pos[p * 3 + 1] = H[k]; pos[p * 3 + 2] = z;
      const kk = K[k];
      let w = [0, 0, 0, 0];   // grass, earth, sand, concrete (rock = remainder)
      if (kk === KIND.grass) { const g = greenAt(x, z); w = [g, 1 - g, 0, 0]; }
      else if (kk === KIND.sand || kk === KIND.water) w = [0, 0, 1, 0];
      else if (kk === KIND.dirt) w = [0.15, 0.85, 0, 0];
      else if (kk === KIND.paved) w = [0, 0.15, 0, 0.85];
      // rock stays [0,0,0,0]
      gw.set(w, p * 4);
      col.setRGB(0, 0, 0);
      const wr = Math.max(0, 1 - w[0] - w[1] - w[2] - w[3]);
      [...w, wr].forEach((v, n) => { col.r += fallback[n].r * v; col.g += fallback[n].g * v; col.b += fallback[n].b * v; });
      colA.set([col.r, col.g, col.b], p * 3);
      p++;
    }
    const idx = [];
    for (let b = 0; b < vj - 1; b++) for (let a = 0; a < vi - 1; a++) {
      const q = b * vi + a;
      idx.push(q, q + vi, q + 1, q + 1, q + vi, q + vi + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('gw', new THREE.BufferAttribute(gw, 4));
    g.setAttribute('color', new THREE.BufferAttribute(colA, 3));
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
