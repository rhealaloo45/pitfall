/* Road rendering: carriageways, markings (procedural shader), sidewalks with
   painted kerbs, raised medians, junctions, bridge decks, barriers, piers and
   sea walls — plus the matching colliders. */
import * as THREE from 'three';
import { landSD } from './geo2d.js';
import { GROUND_GLSL, groundUniforms } from './ground.js';
import { TEX } from '../core/texgen.js';

class Builder {
  constructor(extra = []) { this.pos = []; this.uv = []; this.idx = []; this.extra = {}; for (const [n, size] of extra) this.extra[n] = { size, data: [] }; this.n = 0; }
  v(x, y, z, u, w, ex = {}) {
    this.pos.push(x, y, z); this.uv.push(u, w);
    for (const [k, e] of Object.entries(this.extra)) { const val = ex[k]; for (let i = 0; i < e.size; i++) e.data.push(val ? val[i] : 0); }
    return this.n++;
  }
  quad(a, b, c, d) { this.idx.push(a, b, c, b, d, c); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('ruv', new THREE.Float32BufferAttribute(this.uv, 2));
    for (const [k, e] of Object.entries(this.extra)) g.setAttribute(k, new THREE.Float32BufferAttribute(e.data, e.size));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

/** Strip along road r between sample indices, from lateral l0 (height dy0) to l1 (dy1). */
function strip(B, r, i0, i1, l0, dy0, l1, dy1, ex, uvMode = 'lat', yFn = null) {
  let prev = null;
  for (let i = i0; i <= i1; i++) {
    const nx = r.tz[i], nz = -r.tx[i];
    const h = r.h[i];
    const yA = yFn ? yFn(i, l0, dy0) : h + dy0, yB = yFn ? yFn(i, l1, dy1) : h + dy1;
    const ua = uvMode === 'lat' ? l0 : 0, ub = uvMode === 'lat' ? l1 : Math.hypot(l1 - l0, dy1 - dy0);
    const a = B.v(r.x[i] + nx * l0, yA, r.z[i] + nz * l0, ua, r.s[i], ex);
    const b = B.v(r.x[i] + nx * l1, yB, r.z[i] + nz * l1, ub, r.s[i], ex);
    if (prev) B.quad(prev[0], prev[1], a, b);
    prev = [a, b];
  }
}

function trimRange(r, pad = 0) {
  let i0 = 0, i1 = r.n - 1;
  while (i0 < r.n - 1 && r.s[i0] < r.trim0 + pad) i0++;
  while (i1 > 0 && r.s[i1] > r.trim1 - pad) i1--;
  return [Math.max(0, i0 - (pad ? 0 : 1)), Math.min(r.n - 1, i1 + (pad ? 0 : 1))];
}

/* filtered (anti-aliased) 1D box: 1 inside |x - c| < w, smooth over one pixel */
const AA_GLSL = /* glsl */`
float aaBox(float x, float c, float w) { float fw = max(fwidth(x), 1e-4); return clamp((w - abs(x - c)) / fw + 0.5, 0.0, 1.0); }
float aaDash(float s, float period, float duty) {
  float fw = max(fwidth(s), 1e-4) / period;
  float f = fract(s / period);
  float on = clamp((duty - f) / fw + 0.5, 0.0, 1.0) * clamp(f / fw + 0.5, 0.0, 1.0);
  return mix(on, duty, smoothstep(0.25, 0.6, fw));     // far away: average coverage
}`;

function asphaltMaterial() {
  const webgl2 = TEX.webgl2;
  const m = new THREE.MeshStandardMaterial({ color: webgl2 ? 0xffffff : 0x4a4946, roughness: 0.88, metalness: 0, side: THREE.DoubleSide });
  if (!webgl2) return m;
  const U = groundUniforms(TEX.groundSize || 512);
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 ruv; attribute vec4 rinfo; attribute vec4 rext; varying vec2 vRuv; varying vec4 vRinfo; varying vec4 vRext; varying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vRuv = ruv; vRinfo = rinfo; vRext = rext; vWPos = (modelMatrix * vec4(position,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRuv; varying vec4 vRinfo; varying vec4 vRext; varying vec3 vWPos;\n' + GROUND_GLSL + AA_GLSL + '\nfloat gMark, gRough; vec2 gTn;')
      .replace('#include <map_fragment>', `
        float lat = vRuv.x, s = vRuv.y; float hw = vRinfo.x, lanes = max(vRinfo.y, 1.0), med = vRinfo.z, kind = vRinfo.w;
        vec2 wp = vWPos.xz;
        vec4 mac = gMacro(wp);
        GSample g = gLayer(wp, 5.0, 5.0, smoothstep(0.35, 0.65, mac.b));
        vec3 base = g.alb * (0.86 + 0.28 * mac.r);
        float ro = g.rough;
        // repair patches: slightly darker, smoother asphalt
        float patchM = smoothstep(0.62, 0.66, mac.a) * step(kind, 1.5);
        base = mix(base, base * 0.78, patchM); ro = mix(ro, 0.8, patchM);
        float al = abs(lat);
        gMark = 0.0;
        if (kind < 1.5) {
          float lw = (hw - med * 0.5) / lanes;
          float o = al - med * 0.5;
          float f = fract(o / lw);
          // wheel paths: polished and darker; oil drip line down the lane centre
          float wheel = exp(-pow((f - 0.27) * lw / 0.45, 2.0)) + exp(-pow((f - 0.73) * lw / 0.45, 2.0));
          float drip = exp(-pow((f - 0.5) * lw / 0.35, 2.0)) * smoothstep(0.4, 0.75, mac.g);
          base *= 1.0 - 0.06 * wheel - 0.12 * drip; ro -= 0.12 * wheel;
          gMark += aaBox(al, hw - 0.4, 0.1);                                           // edge lines
          if (med > 0.01) {
            gMark += aaBox(al, med * 0.5 + 0.22, 0.075);
            for (int k = 1; k < 4; k++) { if (float(k) >= lanes) break;
              gMark += aaDash(s, 9.0, 0.45) * aaBox(al, med * 0.5 + float(k) * lw, 0.075); }
          } else {
            gMark += aaDash(s, 7.0, 0.5) * aaBox(lat, 0.0, 0.08);
          }
          float dz = min(s - vRext.x, vRext.y - s);
          if (vRext.z > 0.5) gMark = max(gMark, aaBox(dz, 3.5, 2.0) * aaDash(lat + hw, 1.1, 0.5) * step(al, hw - 0.7));
          gMark = clamp(gMark, 0.0, 1.0);
          gMark *= 0.55 + 0.45 * smoothstep(0.2, 0.55, g.h + mac.g * 0.5);   // worn paint
        }
        diffuseColor.rgb = mix(base, vec3(0.78, 0.77, 0.73), gMark);
        gRough = mix(ro, 0.62, gMark); gTn = g.n * (1.0 - gMark);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
      .replace('#include <normal_fragment_maps>', 'normal = gPerturb(normal, gTn, -vViewPosition, wp / 5.0);');
  };
  m.customProgramCacheKey = () => 'asphalt-v2';
  return m;
}

function pavementMaterial() {
  const webgl2 = TEX.webgl2;
  const m = new THREE.MeshStandardMaterial({ color: webgl2 ? 0xffffff : 0x9a968e, roughness: 0.85, side: THREE.DoubleSide, shadowSide: THREE.FrontSide });
  if (!webgl2) return m;
  const U = groundUniforms(TEX.groundSize || 512);
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 ruv; attribute vec4 pinfo; varying vec2 vRuv; varying vec4 vPinfo; varying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vRuv = ruv; vPinfo = pinfo; vWPos = (modelMatrix * vec4(position,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRuv; varying vec4 vPinfo; varying vec3 vWPos;\n' + GROUND_GLSL + AA_GLSL + '\nfloat gRough; vec2 gTn; vec2 gUv;')
      .replace('#include <map_fragment>', `
        float k = floor(vPinfo.x + 0.5); vec2 wp = vWPos.xz;
        vec4 mac = gMacro(wp);
        float blend = smoothstep(0.35, 0.65, mac.b);
        vec3 col; float ro; vec2 tn;
        // u across, v along the road (metres); faces use height as v
        vec2 uvRoad = vec2(vRuv.x, vRuv.y);
        vec2 uvFace = vec2(vRuv.y, vWPos.y);
        gUv = uvRoad;
        if (k < 0.5) {                     // paver blocks, laid along the road
          GSample g = gLayer(uvRoad, 6.0, 2.4, 0.0); col = g.alb; ro = g.rough; tn = g.n;
          col *= 0.85 + 0.3 * mac.r;
        } else if (k < 1.5) {              // kerb face painted in black & yellow bands
          gUv = uvFace;
          GSample g = gLayer(uvFace, 3.0, 4.0, blend);
          float band = aaDash(vRuv.y, 1.2, 0.5);
          col = mix(vec3(0.05, 0.05, 0.05), vec3(0.62, 0.46, 0.12), band) * (0.75 + 0.45 * g.alb.r / max(0.2, g.alb.g));
          col = mix(col, g.alb * 0.8, 0.25 * smoothstep(0.45, 0.75, mac.g));       // scuffed paint
          ro = 0.75; tn = g.n * 0.5;
        } else if (k < 3.5) {              // kerb stone / concrete
          gUv = k < 2.5 ? uvFace : uvRoad;
          GSample g = gLayer(gUv, 3.0, 4.0, blend); col = g.alb * (0.85 + 0.3 * mac.r); ro = g.rough; tn = g.n;
        } else if (k < 4.5) {              // planted median
          GSample g = gLayer(wp, 7.0, 3.0, blend); col = g.alb; ro = g.rough; tn = g.n; gUv = wp;
        } else {                           // basalt sea wall, coursed blocks
          gUv = uvFace;
          GSample g = gLayer(uvFace, 4.0, 6.0, blend);
          float cy = vWPos.y / 0.7, row = floor(cy);
          float jx = aaBox(fract(vRuv.y / 1.4 + row * 0.5), 0.0, 0.03) + aaBox(fract(vRuv.y / 1.4 + row * 0.5), 1.0, 0.03);
          float jy = aaBox(fract(cy), 0.0, 0.05) + aaBox(fract(cy), 1.0, 0.05);
          col = g.alb * 1.2 * (1.0 - 0.45 * clamp(jx + jy, 0.0, 1.0));
          ro = g.rough; tn = g.n;
          col *= 1.0 - 0.35 * (1.0 - smoothstep(-0.5, 1.2, vWPos.y));             // wet, algae-dark near the water
        }
        diffuseColor.rgb = col; gRough = ro; gTn = tn;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
      .replace('#include <normal_fragment_maps>', 'normal = gPerturb(normal, gTn, -vViewPosition, gUv);');
  };
  m.customProgramCacheKey = () => 'pavement-v2';
  return m;
}

export function buildRoadMeshes(net, terrain, colliders) {
  const group = new THREE.Group(); group.name = 'roads';
  const A = new Builder([['rinfo', 4], ['rext', 4]]);
  const P = new Builder([['pinfo', 4]]);
  const asphalt = asphaltMaterial(), pavement = pavementMaterial();
  const lampSites = [], treeSites = [], piers = [];

  for (const r of net.roads) {
    const T = r.T;
    const [i0, i1] = trimRange(r);
    const zebra = (T.sidewalk > 0 && !r.deck) ? 1 : 0;
    const info = { rinfo: [T.hw, T.lanes, T.median, r.deck ? 1 : 0], rext: [r.trim0, r.trim1, zebra, 0] };
    const roadW = r.deck ? T.hw + 0.9 : T.hw;
    strip(A, r, i0, i1, -roadW, 0.0, roadW, 0.0, info);

    const painted = (r.type === 'boulevard' || r.type === 'arterial') ? 1 : 2;
    const tint = (r.x[0] * 0.013 + r.z[0] * 0.007) % 1;
    if (T.sidewalk > 0 && !r.deck) {
      for (const side of [1, -1]) {
        const kIn = side * T.hw, kOut = side * (T.hw + T.sidewalk);
        // kerb face, sidewalk top, outer skirt
        strip(P, r, i0, i1, kIn, -0.05, kIn, 0.16, { pinfo: [painted, 0, 0, 0] }, 'face');
        strip(P, r, i0, i1, kIn, 0.16, kOut, 0.16, { pinfo: [0, Math.abs(tint), 0, 0] });
        strip(P, r, i0, i1, kOut, 0.16, kOut, -0.7, { pinfo: [2, 0, 0, 0] }, 'face');
      }
    }
    // medians
    if (T.median > 0) {
      const [m0, m1] = trimRange(r, 9);
      if (m1 > m0) {
        const hm = T.median / 2;
        if (r.deck || T.barrier) {
          // concrete safety barrier in the median
          const prof = [[-hm, 0], [-hm + 0.05, 0.08], [-0.16, 0.35], [-0.12, 0.85], [0.12, 0.85], [0.16, 0.35], [hm - 0.05, 0.08], [hm, 0]];
          for (let k = 0; k < prof.length - 1; k++) strip(P, r, m0, m1, prof[k][0], prof[k][1], prof[k + 1][0], prof[k + 1][1], { pinfo: [3, 0, 0, 0] }, 'face');
          for (let i = m0; i < m1; i++) colliders.wall(r.x[i], r.z[i], r.x[i + 1], r.z[i + 1], r.h[i] - 0.5, r.h[i] + 0.9, 'barrier');
        } else {
          strip(P, r, m0, m1, -hm, 0, -hm, 0.2, { pinfo: [painted, 0, 0, 0] }, 'face');
          strip(P, r, m0, m1, -hm, 0.2, hm, 0.2, { pinfo: [4, 0, 0, 0] });
          strip(P, r, m0, m1, hm, 0.2, hm, 0, { pinfo: [painted, 0, 0, 0] }, 'face');
          for (let i = m0; i < m1; i++) {
            const nx = r.tz[i], nz = -r.tx[i], nx2 = r.tz[i + 1], nz2 = -r.tx[i + 1];
            for (const sd of [1, -1]) colliders.wall(r.x[i] + nx * hm * sd, r.z[i] + nz * hm * sd, r.x[i + 1] + nx2 * hm * sd, r.z[i + 1] + nz2 * hm * sd, r.h[i] - 0.5, r.h[i] + 0.25, 'median');
          }
          // trees / lamps in the median
          for (let i = m0; i <= m1; i += 10) {
            if (r.type === 'boulevard') lampSites.push({ x: r.x[i], z: r.z[i], h: r.h[i] + 0.2, dir: Math.atan2(r.tx[i], r.tz[i]), kind: 'twin', road: r });
            else if (i % 20 === 0) treeSites.push({ x: r.x[i], z: r.z[i], h: r.h[i] + 0.2, kind: 'median' });
          }
        }
      }
    }
    // decks: shoulders, parapets, girders, piers
    if (r.deck) {
      const edge = T.hw + 0.9;
      let segStart = -1;
      for (let i = i0; i <= i1; i++) {
        const elevated = r.deckF[i] > 0.04;
        if (elevated && segStart < 0) segStart = i;
        if ((!elevated || i === i1) && segStart >= 0) {
          const e = i;
          for (const side of [1, -1]) {
            const s = side;
            const prof = [[edge, 0], [edge + 0.05, 0.08], [edge + 0.2, 0.35], [edge + 0.24, 0.85], [edge + 0.5, 0.85], [edge + 0.5, -0.3]];
            for (let k = 0; k < prof.length - 1; k++) strip(P, r, segStart, e, s * prof[k][0], prof[k][1], s * prof[k + 1][0], prof[k + 1][1], { pinfo: [3, 0, 0, 0] }, 'face');
            // girder / embankment side down to the ground
            strip(P, r, segStart, e, s * (edge + 0.5), -0.3, s * (edge + 0.5), 0, { pinfo: [3, 0, 0, 0] }, 'face', (i2, l, dy) => {
              if (dy === 0) {
                const g = terrain.heightAt(r.x[i2] + r.tz[i2] * l, r.z[i2] - r.tx[i2] * l);
                return Math.max(r.h[i2] - 2.4, Math.min(r.h[i2] - 0.3, g - 0.4));
              }
              return r.h[i2] - 0.3;
            });
            for (let i2 = segStart; i2 < e; i2++) {
              const nx = r.tz[i2] * s, nz = -r.tx[i2] * s, nx2 = r.tz[i2 + 1] * s, nz2 = -r.tx[i2 + 1] * s;
              colliders.wall(r.x[i2] + nx * (edge + 0.15), r.z[i2] + nz * (edge + 0.15), r.x[i2 + 1] + nx2 * (edge + 0.15), r.z[i2 + 1] + nz2 * (edge + 0.15), r.h[i2] - 0.6, r.h[i2] + 1.0, 'barrier');
              // from below the ramp you hit the embankment wall
              const gH = terrain.heightAt(r.x[i2] + nx * (edge + 0.5), r.z[i2] + nz * (edge + 0.5));
              if (r.h[i2] - gH < 3.2) colliders.wall(r.x[i2] + nx * (edge + 0.55), r.z[i2] + nz * (edge + 0.55), r.x[i2 + 1] + nx2 * (edge + 0.55), r.z[i2 + 1] + nz2 * (edge + 0.55), gH - 1, r.h[i2] - 0.4, 'embankment');
            }
          }
          // deck underside
          strip(P, r, segStart, e, -(edge + 0.5), -2.4, edge + 0.5, -2.4, { pinfo: [3, 0, 0, 0] }, 'face', (i2, l, dy) => {
            const g = terrain.heightAt(r.x[i2] + r.tz[i2] * l, r.z[i2] - r.tx[i2] * l);
            return Math.max(r.h[i2] - 2.4, Math.min(r.h[i2] - 0.3, g - 0.4));
          });
          // piers
          for (let i2 = segStart; i2 <= e; i2 += r.type === 'sealink' ? 14 : 12) {
            const g = terrain.heightAt(r.x[i2], r.z[i2]);
            if (r.h[i2] - g > 4.2) piers.push({ x: r.x[i2], z: r.z[i2], top: r.h[i2] - 2.3, bottom: Math.min(g, 0) - 1, dir: Math.atan2(r.tx[i2], r.tz[i2]), w: edge * 2, road: r });
          }
          segStart = -1;
        }
      }
    }
    // sea walls where water comes close to the sidewalk
    if (!r.deck && T.sidewalk > 0) {
      for (const side of [1, -1]) {
        const lw = side * (T.hw + T.sidewalk);
        let run = -1;
        for (let i = i0; i <= i1; i++) {
          const nx = r.tz[i] * side, nz = -r.tx[i] * side;
          const wet = landSD(r.x[i] + nx * (Math.abs(lw) + 9), r.z[i] + nz * (Math.abs(lw) + 9)) < 0;
          if (wet && run < 0) run = i;
          if ((!wet || i === i1) && run >= 0) {
            if (i - run > 2) {
              strip(P, r, run, i, lw, 0.16, lw + side * 0.45, 0.16, { pinfo: [3, 0, 0, 0] });
              strip(P, r, run, i, lw + side * 0.45, 0.16, lw + side * 0.45, 0.95, { pinfo: [3, 0, 0, 0] }, 'face');
              strip(P, r, run, i, lw + side * 0.45, 0.95, lw + side * 0.75, 0.95, { pinfo: [3, 0, 0, 0] });
              strip(P, r, run, i, lw + side * 0.75, 0.95, lw + side * 0.75, -3.5, { pinfo: [5, 0, 0, 0] }, 'face', (i2, l, dy) => dy > 0 ? r.h[i2] + dy : Math.min(-1.5, r.h[i2] + dy));
              for (let i2 = run; i2 < i; i2++) {
                const nx1 = r.tz[i2] * side, nz1 = -r.tx[i2] * side, nx2 = r.tz[i2 + 1] * side, nz2 = -r.tx[i2 + 1] * side;
                const L = Math.abs(lw) + 0.6;
                colliders.wall(r.x[i2] + nx1 * L, r.z[i2] + nz1 * L, r.x[i2 + 1] + nx2 * L, r.z[i2 + 1] + nz2 * L, r.h[i2] - 1, r.h[i2] + 1.5, 'seawall');
              }
              (r.seaSides || (r.seaSides = [])).push({ side, i0: run, i1: i, lat: lw + side * 0.75 });
            }
            run = -1;
          }
        }
      }
    }
    // lamp posts and trees along sidewalks
    if (T.sidewalk > 0 && !r.deck) {
      const [s0, s1] = trimRange(r, 6);
      const spacing = r.type === 'boulevard' ? 9 : 12;
      for (let i = s0; i <= s1; i += spacing) for (const side of [1, -1]) {
        const off = side * (T.hw + 0.7);
        const nx = r.tz[i], nz = -r.tx[i];
        const sea = (r.seaSides || []).some(q => q.side === side && i >= q.i0 && i <= q.i1);
        lampSites.push({ x: r.x[i] + nx * off, z: r.z[i] + nz * off, h: r.h[i] + 0.16, dir: Math.atan2(-nx * side, -nz * side), kind: r.type === 'boulevard' ? (sea ? 'necklace' : 'single') : 'single', road: r });
        if (T.sidewalk >= 3 && !sea) {
          const toff = side * (T.hw + T.sidewalk - 1.2);
          const j = Math.min(s1, i + Math.floor(spacing / 2));
          treeSites.push({ x: r.x[j] + r.tz[j] * toff, z: r.z[j] - r.tx[j] * toff, h: r.h[j] + 0.16, kind: 'street', road: r });
        } else if (sea && r.type === 'boulevard') {
          const toff = side * (T.hw + T.sidewalk - 1.4);
          const j = Math.min(s1, i + Math.floor(spacing / 2));
          treeSites.push({ x: r.x[j] + r.tz[j] * toff, z: r.z[j] - r.tx[j] * toff, h: r.h[j] + 0.16, kind: 'palm', road: r });
        }
      }
    } else if (r.deck) {
      const [s0, s1] = trimRange(r, 0);
      for (let i = s0; i <= s1; i += 14) lampSites.push({ x: r.x[i], z: r.z[i], h: r.h[i] + 0.85, dir: Math.atan2(r.tx[i], r.tz[i]), kind: 'deck', road: r });
    }
  }

  /* ---- junction discs + corner sidewalks ---- */
  for (const nd of Object.values(net.nodes)) {
    const segs = 40;
    const c = A.v(nd.x, nd.h + 0.004, nd.z, 0, 0, { rinfo: [0, 0, 0, 2], rext: [0, 0, 0, 0] });
    let prev = -1, first = -1;
    for (let k = 0; k <= segs; k++) {
      const a = k / segs * Math.PI * 2;
      const i = k === segs ? first : A.v(nd.x + Math.cos(a) * nd.R, nd.h + 0.004, nd.z + Math.sin(a) * nd.R, 0, 0, { rinfo: [0, 0, 0, 2], rext: [0, 0, 0, 0] });
      if (k === 0) first = i;
      if (prev >= 0) A.idx.push(c, i, prev);
      prev = i;
    }
    if (nd.sw > 0 && nd.roads.length >= 2) {
      // angular gaps where the roads enter
      const gaps = nd.roads.map(({ road, end }) => {
        const i = end ? road.n - 1 : 0, sgn = end ? -1 : 1;
        const ang = Math.atan2(road.tz[i] * sgn, road.tx[i] * sgn);
        const half = Math.asin(Math.min(0.98, (road.T.hw + (road.T.sidewalk ? 0.1 : 1)) / nd.R));
        return [ang - half, ang + half];
      });
      const blocked = a => gaps.some(([g0, g1]) => { let d = a - (g0 + g1) / 2; d = Math.atan2(Math.sin(d), Math.cos(d)); return Math.abs(d) < (g1 - g0) / 2; });
      const N = 72, R0 = nd.R, R1 = nd.R + nd.sw;
      let run = null;
      const flush = () => {
        if (!run || run.length < 2) { run = null; return; }
        let pv = null;
        for (const a of run) {
          const cx = Math.cos(a), cz = Math.sin(a);
          const v0 = P.v(nd.x + cx * R0, nd.h - 0.05, nd.z + cz * R0, 0, a * R0, { pinfo: [2, 0, 0, 0] });
          const v1 = P.v(nd.x + cx * R0, nd.h + 0.16, nd.z + cz * R0, 0.2, a * R0, { pinfo: [2, 0, 0, 0] });
          const v2 = P.v(nd.x + cx * R0, nd.h + 0.16, nd.z + cz * R0, 0, a * R0, { pinfo: [0, 0, 0, 0] });
          const v3 = P.v(nd.x + cx * R1, nd.h + 0.16, nd.z + cz * R1, nd.sw, a * R0, { pinfo: [0, 0, 0, 0] });
          const v4 = P.v(nd.x + cx * R1, nd.h + 0.16, nd.z + cz * R1, 0, a * R0, { pinfo: [2, 0, 0, 0] });
          const v5 = P.v(nd.x + cx * R1, nd.h - 0.7, nd.z + cz * R1, 0.8, a * R0, { pinfo: [2, 0, 0, 0] });
          if (pv) { P.quad(pv[1], pv[0], v1, v0); P.quad(pv[2], pv[3], v2, v3); P.quad(pv[4], pv[5], v4, v5); }
          pv = [v0, v1, v2, v3, v4, v5];
        }
        run = null;
      };
      for (let k = 0; k <= N; k++) {
        const a = -Math.PI + k / N * Math.PI * 2;
        if (!blocked(a)) { (run || (run = [])).push(a); } else flush();
      }
      flush();
    }
  }

  const asphaltMesh = new THREE.Mesh(A.geometry(), asphalt); asphaltMesh.receiveShadow = true;
  asphaltMesh.material.polygonOffset = true; asphaltMesh.material.polygonOffsetFactor = -1; asphaltMesh.material.polygonOffsetUnits = -1;
  const paveMesh = new THREE.Mesh(P.geometry(), pavement); paveMesh.receiveShadow = true; paveMesh.castShadow = true;
  group.add(asphaltMesh, paveMesh);

  /* ---- piers ---- */
  const concrete = new THREE.MeshStandardMaterial({ color: 0x9a978f, roughness: 0.88 });
  const pierGeo = new THREE.BoxGeometry(1, 1, 1);
  const pierMesh = new THREE.InstancedMesh(pierGeo, concrete, piers.length * 2);
  const capMesh = new THREE.InstancedMesh(pierGeo, concrete, piers.length);
  const d = new THREE.Object3D();
  let pi = 0;
  piers.forEach((p, k) => {
    const H = p.top - p.bottom;
    const twin = p.road.type === 'sealink';
    for (const off of twin ? [-p.w * 0.22, p.w * 0.22] : [0]) {
      d.position.set(p.x + Math.cos(p.dir) * off, p.bottom + H / 2, p.z - Math.sin(p.dir) * off);
      d.rotation.set(0, p.dir, 0); d.scale.set(twin ? 3.2 : 2.6, H, twin ? 3.2 : 2.6); d.updateMatrix();
      pierMesh.setMatrixAt(pi++, d.matrix);
      colliders.post(d.position.x, d.position.z, twin ? 1.8 : 1.5, p.bottom, p.top);
    }
    d.position.set(p.x, p.top - 0.6, p.z); d.rotation.set(0, p.dir, 0); d.scale.set(p.w * 0.85, 1.2, 3.4); d.updateMatrix();
    capMesh.setMatrixAt(k, d.matrix);
  });
  pierMesh.count = pi;
  pierMesh.castShadow = capMesh.castShadow = true; pierMesh.receiveShadow = capMesh.receiveShadow = true;
  group.add(pierMesh, capMesh);

  return { group, lampSites, treeSites, piers, materials: { asphalt, pavement, concrete } };
}
