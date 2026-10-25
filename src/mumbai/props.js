/* Street furniture and life: trees (rain trees, gulmohar, Ashoka, coconut palms)
   built from alpha-tested leaf cards with soft "canopy" normals, street lamps,
   parked cars / taxis / autos / BEST buses with proper silhouettes, tetrapods
   and fishing boats. Everything is instanced and bucketed into spatial chunks
   so frustum and distance culling still work. All geometry and textures are
   generated here (no external assets). */
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { PARKS, HILLS, PLAZAS, RESERVED, WORLD_BOUNDS as WB } from './layout.js';
import { landSD } from './geo2d.js';
import { rng, canvasTexture } from '../core/geo.js';
import { insideSlab } from './diorama.js';
import { districtAt } from './buildings.js';

/* ---------- vertex-painted geometry: colour + (roughness, metalness, paint mask) ---------- */
export function paint(geo, hex, rough = 0.6, metal = 0, tint = 0, emit = 0) {
  if (geo.index) geo = geo.toNonIndexed();
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3), m = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; m[i * 4] = rough; m[i * 4 + 1] = metal; m[i * 4 + 2] = tint; m[i * 4 + 3] = emit; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.setAttribute('rm', new THREE.BufferAttribute(m, 4));
  return geo;
}
const part = (geo, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, rough = 0.6, metal = 0, tint = 0, emit = 0) => {
  geo.scale(sx, sy, sz); geo.rotateX(rx); geo.rotateY(ry); geo.rotateZ(rz); geo.translate(x, y, z);
  return paint(geo, hex, rough, metal, tint, emit);
};
const merge = parts => mergeGeometries(parts);

/** Shared night glow for lamp heads and vehicle lights (0 by day). */
export const GLOW = { value: 0 };
/** Vehicle / prop material: per-vertex roughness, metalness, paint mask and night glow; instance colour only tints painted panels. */
export function vehicleMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uGlow = GLOW;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 rm; varying vec4 vRm;')
      .replace('#include <color_vertex>', `
        vColor = vec3(1.0) * color;
        #ifdef USE_INSTANCING_COLOR
          vColor = mix(vColor, vColor * instanceColor, rm.z);
        #endif
        vRm = rm;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vRm; uniform float uGlow;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRm.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRm.y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor * vRm.w * uGlow;');
  };
  m.customProgramCacheKey = () => 'vehicle-rm4';
  return m;
}

export class Chunked {
  constructor(geo, mat, { chunk = 700, cast = true, receive = true, noAO = false } = {}) { this.geo = geo; this.mat = mat; this.chunk = chunk; this.b = new Map(); this.cast = cast; this.receive = receive; this.noAO = noAO; }
  add(m, color) {
    const e = m.elements, k = Math.floor(e[12] / this.chunk) + ',' + Math.floor(e[14] / this.chunk);
    let a = this.b.get(k); if (!a) this.b.set(k, a = []); a.push([m.clone(), color ? color.clone() : null]);
  }
  build(group) {
    const meshes = [];
    for (const arr of this.b.values()) {
      const im = new THREE.InstancedMesh(this.geo, this.mat, arr.length);
      arr.forEach(([m, c], i) => { im.setMatrixAt(i, m); if (c) im.setColorAt(i, c); });
      im.castShadow = this.cast; im.receiveShadow = this.receive;
      if (this.noAO) im.userData.noAO = true;
      im.computeBoundingSphere();
      group.add(im); meshes.push(im);
    }
    return meshes;
  }
}

/* ======================= foliage ======================= */
/* Atlas (1024²): A green leaf clump [u 0–.5, v .5–1], B flowering gulmohar clump [u .5–1, v .5–1],
   C coconut frond [v .3125–.5], D dry frond [v .1875–.3125], E bark [v 0–.1875]. */
const UVR = { leaf: [0, 0.5, 0.5, 1], bloom: [0.5, 0.5, 1, 1], frond: [0, 0.3125, 1, 0.5], dry: [0, 0.1875, 1, 0.3125], bark: [0, 0.02, 1, 0.17] };

function foliageAtlas() {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), r = rng(4242);
  const greens = ['#3b5a24', '#46682a', '#527433', '#5f7f38', '#2f4a1d', '#6a8a3f', '#4b6b2c'];
  const clump = (ox, oy, flowers) => {
    for (let n = 0; n < 1500; n++) {
      const a = r() * Math.PI * 2, rr = Math.pow(r(), 0.6) * 236;
      const x = ox + 256 + Math.cos(a) * rr, y = oy + 256 + Math.sin(a) * rr * 0.92;
      if (rr > 200 && r() < 0.5) continue;
      const len = 9 + r() * 9, wid = 3.5 + r() * 3, ang = r() * Math.PI * 2;
      const flower = flowers && r() < 0.42;
      g.save(); g.translate(x, y); g.rotate(ang);
      const base = flower ? ['#b8392a', '#cf4e2c', '#a22f24', '#d8642f'][Math.floor(r() * 4)] : greens[Math.floor(r() * greens.length)];
      g.fillStyle = base; g.beginPath(); g.ellipse(0, 0, len, wid, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,230,0.12)'; g.beginPath(); g.ellipse(-len * 0.2, -wid * 0.3, len * 0.6, wid * 0.35, 0, 0, Math.PI * 2); g.fill();
      if (!flower) { g.strokeStyle = 'rgba(20,30,10,0.35)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-len, 0); g.lineTo(len, 0); g.stroke(); }
      g.restore();
    }
    // a few twigs
    g.strokeStyle = 'rgba(70,52,36,0.9)'; g.lineWidth = 3;
    for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(ox + 256, oy + 400); g.quadraticCurveTo(ox + 256 + (r() - 0.5) * 160, oy + 300, ox + 256 + (r() - 0.5) * 300, oy + 140 + r() * 120); g.stroke(); }
  };
  clump(0, 0, false); clump(512, 0, true);
  // coconut fronds: rachis with drooping leaflets (green, then a dry variant)
  const frond = (y0, h, cols, rach) => {
    g.strokeStyle = rach; g.lineWidth = 5; g.beginPath(); g.moveTo(8, y0 + h / 2); g.lineTo(S - 8, y0 + h / 2); g.stroke();
    for (let x = 30; x < S - 20; x += 7) {
      const t = x / S, L = (h / 2 - 6) * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (0.75 + r() * 0.25);
      for (const sgn of [-1, 1]) {
        g.strokeStyle = cols[Math.floor(r() * cols.length)]; g.lineWidth = 3 + r() * 1.5;
        g.beginPath(); g.moveTo(x, y0 + h / 2); g.quadraticCurveTo(x + 18, y0 + h / 2 + sgn * L * 0.6, x + 34, y0 + h / 2 + sgn * L); g.stroke();
      }
    }
  };
  frond(512, 192, ['#56702c', '#647c33', '#4a6226', '#71883c'], '#8a8448');
  frond(704, 128, ['#8a7444', '#9a8352', '#7a6640', '#a68f5c'], '#8f7a4e');
  // bark: grey-brown with vertical fissures and faint rings
  g.fillStyle = '#6b5c4c'; g.fillRect(0, 832, S, 192);
  for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '40,32,26' : '150,135,115'},${0.1 + r() * 0.2})`; g.fillRect(r() * S, 832 + r() * 192, 2 + r() * 3, 8 + r() * 40); }
  for (let y = 840; y < S; y += 14) { g.fillStyle = 'rgba(40,32,26,0.25)'; g.fillRect(0, y, S, 2); }
  // mip chain with coverage-preserving alpha (leaf cards don't thin out with distance)
  const levels = [c];
  const cov0 = coverage(g.getImageData(0, 0, S, S).data);
  let prev = c;
  for (let s = S / 2; s >= 1; s /= 2) {
    const m = document.createElement('canvas'); m.width = m.height = s;
    const mg = m.getContext('2d'); mg.imageSmoothingQuality = 'high'; mg.drawImage(prev, 0, 0, s, s);
    if (s >= 4) {
      const img = mg.getImageData(0, 0, s, s), d = img.data;
      let lo = 1, hi = 6;
      for (let it = 0; it < 12; it++) { const mid = (lo + hi) / 2; if (coverage(d, mid) < cov0) lo = mid; else hi = mid; }
      for (let i = 3; i < d.length; i += 4) d[i] = Math.min(255, d[i] * lo);
      mg.putImageData(img, 0, 0);
    }
    levels.push(m); prev = m;
  }
  const t = new THREE.CanvasTexture(c);
  t.mipmaps = levels; t.generateMipmaps = false;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function coverage(d, k = 1) { let n = 0, tot = 0; for (let i = 3; i < d.length; i += 4) { tot++; if (d[i] * k > 128) n++; } return n / tot; }

/** Foliage material: alpha-to-coverage leaf cards, canopy normals (no back-face flip), soft translucency towards the sun. */
function foliageMaterial(atlas) {
  const m = new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, alphaTest: 0.42, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.8, metalness: 0 });
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader
      .replace('normal *= faceDirection;', '')
      // leaves dissolve near the camera so a chase cam passing under a canopy never sees a wall of leaves
      .replace('#include <alphatest_fragment>', 'diffuseColor.a *= smoothstep(2.2, 5.0, length(vViewPosition));\n#include <alphatest_fragment>')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // light glowing through thin leaves when looking towards the sun
        #if NUM_DIR_LIGHTS > 0
          vec3 Ld = directionalLights[0].direction;
          vec3 Vd = normalize(vViewPosition);
          float back = pow(max(dot(-Vd, Ld), 0.0), 3.0);
          totalEmissiveRadiance += diffuseColor.rgb * directionalLights[0].color * back * 0.18;
        #endif`);
  };
  m.customProgramCacheKey = () => 'foliage-v2';
  return m;
}

/** Leaf cards scattered over an ellipsoid canopy. shape(t) → [rx, ry, rz, cy] or a function of height for cones. */
function canopyCards(geoParts, { n, cx = 0, cy, rx, ry, rz, size, bloom = 0, droop = 0, cone = null, seed = 1, ao = 0.45 }) {
  const r = rng(seed);
  const pos = [], nor = [], uv = [], col = [];
  for (let k = 0; k < n; k++) {
    let px, py, pz, ex, ey, ez;
    if (cone) {
      const t = r(), h = cone.y0 + t * (cone.y1 - cone.y0), rad = cone.r0 + (cone.r1 - cone.r0) * t;
      const a = r() * Math.PI * 2, rr = rad * (0.55 + 0.45 * Math.sqrt(r()));
      px = Math.cos(a) * rr; pz = Math.sin(a) * rr; py = h;
      ex = px; ey = (t - 0.5) * 0.6; ez = pz;
    } else {
      // points biased to the shell (outer leaves), flatter underside
      const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u), rr = 0.55 + 0.45 * Math.pow(r(), 0.5);
      ex = Math.cos(a) * s; ey = u; ez = Math.sin(a) * s;
      if (ey < -0.3) ey = -0.3 - (ey + 0.3) * 0.3;
      px = cx + ex * rx * rr; py = cy + ey * ry * rr; pz = ez * rz * rr;
    }
    const nrm = new THREE.Vector3(ex, ey + 0.35, ez).normalize();
    // card orientation: mostly facing outward, randomly spun
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(ex + (r() - 0.5) * 1.2, ey * 0.6 + 0.3 + (r() - 0.5) * 0.8, ez + (r() - 0.5) * 1.2).normalize());
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), r() * Math.PI * 2));
    const sz = size * (0.75 + r() * 0.5);
    const reg = r() < bloom ? UVR.bloom : UVR.leaf;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const shade = Math.min(1, (1 - ao) + ao * (0.5 + 0.5 * ey) * (cone ? 1 : (0.6 + 0.4 * Math.hypot(ex, ez))));
    const vs = corners.map(([a, b]) => {
      const v = new THREE.Vector3(a * sz / 2, b * sz / 2 - droop * (a * a) * sz * 0.2, 0).applyQuaternion(q);
      return [px + v.x, py + v.y, pz + v.z];
    });
    for (const idx of [0, 1, 2, 0, 2, 3]) {
      const [a, b] = corners[idx];
      pos.push(...vs[idx]); nor.push(nrm.x, nrm.y, nrm.z);
      uv.push(reg[0] + (a * 0.5 + 0.5) * (reg[2] - reg[0]), reg[1] + (b * 0.5 + 0.5) * (reg[3] - reg[1]));
      col.push(shade, shade, shade);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geoParts.push(g);
}
/** Bark-mapped tapered limb from a to b. */
function limb(geoParts, a, b, r0, r1, radial = 5) {
  const dir = new THREE.Vector3().subVectors(b, a), L = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, L, radial, 1, true);
  g.translate(0, L / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  g.translate(a.x, a.y, a.z);
  const ng = g.toNonIndexed();
  const uv = ng.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, UVR.bark[0] + uv.getX(i) * 0.3, UVR.bark[1] + uv.getY(i) * (UVR.bark[3] - UVR.bark[1]));
  const n = ng.attributes.position.count, col = new Float32Array(n * 3).fill(0.85);
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geoParts.push(ng);
}
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export const TREE_SPECIES = {
  rain: seed => {      // rain tree (Samanea saman): short trunk, wide umbrella
    const p = [];
    limb(p, V3(0, -0.3, 0), V3(0.2, 3.6, 0), 0.42, 0.3, 7);
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + 0.4; limb(p, V3(0.2, 3.4, 0), V3(Math.cos(a) * 3.2, 5.6 + (k % 2) * 0.6, Math.sin(a) * 3.2), 0.22, 0.09); }
    canopyCards(p, { n: 42, cy: 6.4, rx: 5.6, ry: 2.2, rz: 5.6, size: 3.1, seed });
    return p;
  },
  gulmohar: seed => {  // flame tree: spreading, red-orange blossom
    const p = [];
    limb(p, V3(0, -0.3, 0), V3(-0.2, 3.2, 0.1), 0.3, 0.22, 6);
    for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + 0.8; limb(p, V3(-0.2, 3.0, 0.1), V3(Math.cos(a) * 2.6, 5.0, Math.sin(a) * 2.6), 0.16, 0.07); }
    canopyCards(p, { n: 36, cy: 5.6, rx: 4.6, ry: 1.9, rz: 4.6, size: 2.65, bloom: 0.5, seed });
    return p;
  },
  peepal: seed => {    // broad rounded crown
    const p = [];
    limb(p, V3(0, -0.3, 0), V3(0, 3.0, 0), 0.38, 0.28, 7);
    for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2; limb(p, V3(0, 2.8, 0), V3(Math.cos(a) * 1.8, 5.2, Math.sin(a) * 1.8), 0.18, 0.08); }
    canopyCards(p, { n: 38, cy: 6.0, rx: 3.9, ry: 3.2, rz: 3.9, size: 2.8, seed });
    return p;
  },
  ashoka: seed => {    // Polyalthia longifolia: the tall, narrow, drooping avenue tree
    const p = [];
    limb(p, V3(0, -0.3, 0), V3(0, 9.5, 0), 0.2, 0.06, 6);
    canopyCards(p, { n: 30, cone: { y0: 1.4, y1: 10.5, r0: 1.5, r1: 0.25 }, size: 2.0, droop: 1, seed, ao: 0.35 });
    return p;
  },
  shrub: seed => {
    const p = [];
    canopyCards(p, { n: 8, cy: 0.7, rx: 1.0, ry: 0.65, rz: 1.0, size: 1.25, seed, ao: 0.3 });
    return p;
  },
  palm: seed => {      // coconut palm: curved ringed trunk, fronds, coconuts
    const p = [], r = rng(seed);
    const lean = 0.8 + r() * 0.8;
    const curve = new THREE.CatmullRomCurve3([V3(0, -0.3, 0), V3(lean * 0.15, 3, 0), V3(lean * 0.5, 6, 0), V3(lean, 8.6, 0)]);
    const tube = new THREE.TubeGeometry(curve, 10, 0.19, 6).toNonIndexed();
    const tuv = tube.attributes.uv;
    for (let i = 0; i < tuv.count; i++) tuv.setXY(i, UVR.bark[0] + tuv.getY(i) * 0.25, UVR.bark[1] + tuv.getX(i) * (UVR.bark[3] - UVR.bark[1]));
    tube.setAttribute('color', new THREE.BufferAttribute(new Float32Array(tube.attributes.position.count * 3).fill(0.9), 3));
    p.push(tube);
    const top = V3(lean, 8.6, 0);
    const nF = 12;
    for (let k = 0; k < nF; k++) {
      const dry = k >= nF - 2;
      const a = k / nF * Math.PI * 2 + r() * 0.3, len = dry ? 3.2 : 3.6 + r() * 0.8, w = dry ? 0.9 : 1.25;
      const rise = dry ? -0.9 : 0.25 + (k % 3) * 0.2;
      const seg = 6, pos = [], nor = [], uv = [], col = [];
      const reg = dry ? UVR.dry : UVR.frond;
      for (let i = 0; i < seg; i++) for (const [t0, t1] of [[i / seg, (i + 1) / seg]]) {
        const P = (t, side) => {
          const d = t * len, y = rise * t * 2.2 - 1.9 * t * t * (dry ? 1.6 : 1);
          const px = Math.cos(a) * d - Math.sin(a) * side * w / 2 * (1 - t * 0.6), pz = Math.sin(a) * d + Math.cos(a) * side * w / 2 * (1 - t * 0.6);
          return [top.x + px, top.y + y - side * 0.12 * t, top.z + pz];
        };
        const quad = [[t0, -1], [t1, -1], [t1, 1], [t0, 1]].map(([t, s]) => [P(t, s), [reg[0] + t * (reg[2] - reg[0]), reg[1] + (s * 0.5 + 0.5) * (reg[3] - reg[1])]]);
        for (const idx of [0, 1, 2, 0, 2, 3]) { pos.push(...quad[idx][0]); uv.push(...quad[idx][1]); nor.push(Math.cos(a) * 0.4, 0.9, Math.sin(a) * 0.4); col.push(0.95, 0.95, 0.95); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      p.push(g);
    }
    for (let k = 0; k < 5; k++) {
      const c = new THREE.SphereGeometry(0.17, 7, 5).toNonIndexed();
      c.translate(top.x + Math.cos(k * 1.3) * 0.28, top.y - 0.35 - (k % 2) * 0.12, top.z + Math.sin(k * 1.3) * 0.28);
      const uvc = c.attributes.uv; for (let i = 0; i < uvc.count; i++) uvc.setXY(i, 0.5, 0.1);
      c.setAttribute('color', new THREE.BufferAttribute(new Float32Array(c.attributes.position.count * 3).fill(0.55), 3));
      p.push(c);
    }
    return p;
  },
};
export function treeGeometry(species = 'rain', seed = 1) {
  const parts = TREE_SPECIES[species](seed).map(g => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k); return g; });
  const g = mergeGeometries(parts);
  g.computeBoundingSphere();
  return g;
}

/* ======================= vehicles ======================= */
/** Side-profile extrusion: pts are [along, up] in metres (rear at 0); width across X, centred. */
function extrudeSide(shape, width, bevel = 0.05) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.01, width - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 5 });
  g.rotateY(-Math.PI / 2);
  g.translate((width - bevel * 2) / 2, 0, 0);
  // smooth across the bevels, keep the panel edges crisp
  const c = toCreasedNormals(g, Math.PI / 3.2);
  if (!c.attributes.uv) c.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(c.attributes.position.count * 2), 2));
  return c;
}
function poly(pts) { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) s.lineTo(p[0], p[1]); s.closePath(); return s; }
/** Lower body with wheel arches. */
function lowerShape(L, belt, nose, tail, wr, wf, wb, ground = 0.3) {
  const s = new THREE.Shape();
  s.moveTo(0, ground); s.lineTo(0, tail); s.lineTo(0.12, belt); s.lineTo(L - 0.25, belt - 0.04); s.lineTo(L, nose); s.lineTo(L, ground);
  s.lineTo(wf + wr + 0.06, ground); s.absarc(wf, ground, wr + 0.06, 0, Math.PI, false);
  s.lineTo(wb + wr + 0.06, ground); s.absarc(wb, ground, wr + 0.06, 0, Math.PI, false);
  s.lineTo(0, ground);
  return s;
}
function wheelSet(L, W, wr, wf, wb, tw = 0.2) {
  const out = [];
  for (const sx of [1, -1]) for (const z of [wf, wb]) {
    out.push(part(new THREE.CylinderGeometry(wr, wr, tw, 10), 0x1b1b1c, sx * (W / 2 - tw / 2 + 0.02), wr, z - L / 2, 0, 0, Math.PI / 2, 1, 1, 1, 0.9));
    out.push(part(new THREE.CylinderGeometry(wr * 0.58, wr * 0.58, 0.02, 8), 0x9a9c9e, sx * (W / 2 + 0.03), wr, z - L / 2, 0, 0, Math.PI / 2, 1, 1, 1, 0.35, 0.8));
  }
  return out;
}
/** Generic modern car (hatch / sedan / suv); body panels take the instance colour. */
function modernCar({ L, W, H, belt, nose, tail, cab0, cab1, roof, glassSlopeF = 0.55, glassSlopeR = 0.35, wr = 0.31 }) {
  const wf = L - 0.78, wb = 0.72;
  const lower = paint(extrudeSide(lowerShape(L, belt, nose, tail, wr, wf, wb), W, 0.07), 0xffffff, 0.32, 0.25, 1);
  const cab = poly([[cab0, belt - 0.02], [cab0 + glassSlopeR, roof], [cab1 - glassSlopeF, roof], [cab1, belt - 0.02]]);
  const glass = paint(extrudeSide(cab, W - 0.16, 0.04), 0x15191c, 0.06, 0.1, 0);
  const roofSlab = paint(extrudeSide(poly([[cab0 + glassSlopeR + 0.02, roof - 0.05], [cab0 + glassSlopeR + 0.05, roof + 0.03], [cab1 - glassSlopeF - 0.05, roof + 0.03], [cab1 - glassSlopeF - 0.02, roof - 0.05]]), W - 0.12, 0.03), 0xffffff, 0.32, 0.25, 1);
  const pillar = paint(new THREE.BoxGeometry(W - 0.12, roof - belt, 0.14).translate(0, (roof + belt) / 2, (cab0 + cab1) / 2 - 0.1), 0xffffff, 0.32, 0.25, 1);
  const parts = [lower, glass, roofSlab, pillar].map(g => { g.translate(0, 0, -L / 2); return g; });
  for (const sx of [1, -1]) {
    parts.push(part(new THREE.BoxGeometry(0.34, 0.12, 0.06), 0xf3f1ea, sx * (W / 2 - 0.3), nose - 0.08, L / 2 + 0.0, 0, 0, 0, 1, 1, 1, 0.15, 0, 0, 0.8));
    parts.push(part(new THREE.BoxGeometry(0.3, 0.12, 0.06), 0x8e1410, sx * (W / 2 - 0.25), tail - 0.08, -L / 2, 0, 0, 0, 1, 1, 1, 0.25, 0, 0, 0.6));
  }
  parts.push(part(new THREE.BoxGeometry(W - 0.1, 0.12, 0.08), 0x232426, 0, 0.42, L / 2 - 0.02, 0, 0, 0, 1, 1, 1, 0.6));
  parts.push(part(new THREE.BoxGeometry(W - 0.1, 0.12, 0.08), 0x232426, 0, 0.42, -L / 2 + 0.02, 0, 0, 0, 1, 1, 1, 0.6));
  parts.push(...wheelSet(L, W, wr, wf, wb));
  return merge(parts);
}
export function carGeometry(kind = 'sedan') {
  if (kind === 'hatch') return modernCar({ L: 3.75, W: 1.68, H: 1.5, belt: 0.95, nose: 0.78, tail: 0.92, cab0: 0.25, cab1: 2.65, roof: 1.48, glassSlopeR: 0.2, glassSlopeF: 0.75 });
  if (kind === 'suv') return modernCar({ L: 4.4, W: 1.8, H: 1.72, belt: 1.12, nose: 0.98, tail: 1.08, cab0: 0.18, cab1: 3.0, roof: 1.72, glassSlopeR: 0.12, glassSlopeF: 0.62, wr: 0.36 });
  return modernCar({ L: 4.25, W: 1.7, H: 1.46, belt: 0.92, nose: 0.76, tail: 0.88, cab0: 0.75, cab1: 3.05, roof: 1.43, glassSlopeR: 0.42, glassSlopeF: 0.72 });
}
/** Kaali-peeli taxi: rounded 1960s sedan, black body, yellow roof. */
export function taxiGeometry() {
  const L = 4.0, W = 1.58, wr = 0.3, wf = L - 0.75, wb = 0.7;
  const lower = paint(extrudeSide(lowerShape(L, 0.92, 0.78, 0.86, wr, wf, wb), W, 0.1), 0x151515, 0.28, 0.2);
  const cab = poly([[0.85, 0.9], [1.25, 1.42], [2.55, 1.42], [3.0, 0.9]]);
  const glass = paint(extrudeSide(cab, W - 0.14, 0.05), 0x141819, 0.06, 0.1);
  const roof = paint(extrudeSide(poly([[1.22, 1.36], [1.26, 1.47], [2.52, 1.47], [2.58, 1.36]]), W - 0.1, 0.05), 0xe6b51c, 0.35, 0.1);
  const parts = [lower, glass, roof].map(g => { g.translate(0, 0, -L / 2); return g; });
  parts.push(part(new THREE.BoxGeometry(0.42, 0.18, 0.22), 0xe9c33a, 0, 1.56, 0.05, 0, 0, 0, 1, 1, 1, 0.4));      // TAXI lamp
  parts.push(part(new THREE.BoxGeometry(W + 0.02, 0.07, L * 0.98), 0xc9c9c6, 0, 0.62, 0, 0, 0, 0, 1, 1, 1, 0.25, 0.9));   // chrome strip
  for (const sx of [1, -1]) parts.push(part(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12), 0xf1efe6, sx * 0.55, 0.72, L / 2 + 0.02, Math.PI / 2, 0, 0, 1, 1, 1, 0.15));
  parts.push(...wheelSet(L, W, wr, wf, wb));
  return merge(parts);
}
/** Auto-rickshaw: black lower body, yellow canvas top, three wheels. */
export function autoGeometry() {
  const parts = [];
  const body = paint(extrudeSide(poly([[0, 0.32], [0, 0.95], [0.25, 1.05], [1.55, 1.05], [2.0, 0.95], [2.55, 0.62], [2.62, 0.32]]), 1.32, 0.08), 0x1a1b1c, 0.4, 0.1);
  body.translate(0, 0, -1.3); parts.push(body);
  const nose = paint(extrudeSide(poly([[1.95, 0.95], [2.15, 1.55], [2.35, 1.6], [2.5, 0.65]]), 1.2, 0.06), 0x1a1b1c, 0.4, 0.1);
  nose.translate(0, 0, -1.3); parts.push(nose);
  const screen = paint(new THREE.BoxGeometry(1.0, 0.55, 0.04).rotateX(-0.35).translate(0, 1.38, 0.9), 0x1d2326, 0.06, 0.1); parts.push(screen);
  const top = paint(extrudeSide(poly([[0.0, 1.7], [0.05, 1.86], [2.2, 1.86], [2.36, 1.62], [2.3, 1.58], [0.1, 1.62]]), 1.42, 0.06), 0xe0b11f, 0.75, 0);
  top.translate(0, 0, -1.3); parts.push(top);
  for (const sx of [1, -1]) parts.push(part(new THREE.BoxGeometry(0.05, 0.75, 0.05), 0x2a2b2c, sx * 0.66, 1.3, -1.1, 0, 0, 0, 1, 1, 1, 0.5, 0.6));
  parts.push(part(new THREE.CylinderGeometry(0.25, 0.25, 0.14, 12), 0x1b1b1c, 0, 0.25, 1.05, 0, 0, Math.PI / 2, 1, 1, 1, 0.9));
  for (const sx of [1, -1]) parts.push(part(new THREE.CylinderGeometry(0.25, 0.25, 0.14, 12), 0x1b1b1c, sx * 0.6, 0.25, -0.85, 0, 0, Math.PI / 2, 1, 1, 1, 0.9));
  parts.push(part(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 10), 0xf1efe6, 0, 1.0, 1.29, Math.PI / 2, 0, 0, 1, 1, 1, 0.15));
  return merge(parts);
}
/** BEST double-decker: signal red, cream band, deep window bands. */
export function busGeometry() {
  const L = 10.6, W = 2.5;
  const parts = [];
  const body = paint(extrudeSide(poly([[0, 0.45], [0, 4.1], [0.15, 4.3], [L - 0.35, 4.3], [L, 4.0], [L, 0.45]]), W, 0.14), 0xa3211c, 0.38, 0.1);
  body.translate(0, 0, -L / 2); parts.push(body);
  for (const [y0, y1] of [[1.45, 2.3], [3.0, 3.9]]) parts.push(part(new THREE.BoxGeometry(W + 0.02, y1 - y0, L - 0.9), 0x15191b, 0, (y0 + y1) / 2, -0.15, 0, 0, 0, 1, 1, 1, 0.06, 0.1));
  parts.push(part(new THREE.BoxGeometry(W + 0.03, 0.22, L - 0.4), 0xe9e1cf, 0, 2.6, 0, 0, 0, 0, 1, 1, 1, 0.4));
  parts.push(part(new THREE.BoxGeometry(W - 0.3, 1.0, 0.06), 0x15191b, 0, 1.9, L / 2 + 0.01, 0, 0, 0, 1, 1, 1, 0.06));
  parts.push(part(new THREE.BoxGeometry(W - 0.4, 0.28, 0.05), 0x1d1d1d, 0, 3.95, L / 2 - 0.02, 0, 0, 0, 1, 1, 1, 0.5));
  for (const sx of [1, -1]) for (const z of [L / 2 - 2.0, -L / 2 + 2.2]) {
    parts.push(part(new THREE.CylinderGeometry(0.5, 0.5, 0.32, 16), 0x1b1b1c, sx * (W / 2 - 0.14), 0.5, z, 0, 0, Math.PI / 2, 1, 1, 1, 0.9));
    parts.push(part(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 12), 0x8f9194, sx * (W / 2 + 0.03), 0.5, z, 0, 0, Math.PI / 2, 1, 1, 1, 0.4, 0.7));
  }
  return merge(parts);
}
/** Koli fishing boat: tapered hull, cabin, mast with a faded flag. */
export function boatGeometry() {
  const hull = new THREE.CylinderGeometry(1.5, 1.0, 1.3, 14, 1, false);
  hull.scale(1, 1, 3.4);
  return merge([
    part(hull, 0xd9d4c8, 0, 0.3, 0, 0, 0, 0, 1, 1, 1, 0.7),
    part(new THREE.BoxGeometry(3.0, 0.22, 9.8), 0x2e5a7a, 0, 0.88, 0, 0, 0, 0, 1, 1, 1, 0.6),
    part(new THREE.BoxGeometry(1.9, 1.2, 2.8), 0xe8e3d6, 0, 1.6, -1.0, 0, 0, 0, 1, 1, 1, 0.7),
    part(new THREE.BoxGeometry(2.0, 0.12, 3.0), 0x9a3a2a, 0, 2.25, -1.0, 0, 0, 0, 1, 1, 1, 0.7),
    part(new THREE.CylinderGeometry(0.06, 0.08, 3.4, 6), 0x5a4532, 0, 2.6, 1.8, 0, 0, 0, 1, 1, 1, 0.8),
    part(new THREE.BoxGeometry(0.02, 0.5, 0.8), 0xb04a32, 0, 4.0, 2.2, 0, 0, 0, 1, 1, 1, 0.8),
  ]);
}
function tetrapodGeometry() {
  const p = [];
  const dirs = [[0, 1, 0], [0.94, -0.33, 0], [-0.47, -0.33, 0.82], [-0.47, -0.33, -0.82]];
  for (const d of dirs) {
    const g = new THREE.CylinderGeometry(0.22, 0.42, 1.1, 8);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d));
    g.translate(0, 0.55, 0); g.applyQuaternion(q);
    p.push(paint(g, 0xa29d93, 0.92));
  }
  return merge(p);
}
/** Street lamp: tapered octagonal pole, curved arm, flat LED head (head is a separate emissive mesh). */
function lampGeometry() {
  const arm = new THREE.TorusGeometry(0.9, 0.06, 6, 14, Math.PI / 2);
  const pole = merge([
    part(new THREE.CylinderGeometry(0.08, 0.13, 7.2, 8), 0x4d5558, 0, 3.6, 0, 0, 0, 0, 1, 1, 1, 0.5, 0.6),
    part(arm, 0x4d5558, 0, 7.2 - 0.9, 0.9, 0, Math.PI / 2, 0, 1, 1, 1, 0.5, 0.6),
    part(new THREE.CylinderGeometry(0.2, 0.24, 0.6, 8), 0x4d5558, 0, 0.3, 0, 0, 0, 0, 1, 1, 1, 0.6, 0.4),
  ]);
  const head = merge([
    part(new THREE.BoxGeometry(0.34, 0.1, 0.75), 0x3a3f42, 0, 7.25, 1.2, 0, 0, 0, 1, 1, 1, 0.45, 0.5),
    part(new THREE.BoxGeometry(0.26, 0.02, 0.6), 0xffe2b0, 0, 7.19, 1.2, 0, 0, 0, 1, 1, 1, 0.3, 0, 0, 1),
  ]);
  return { pole, head, lamp: merge([pole, head]), twin: merge([pole, head, pole.clone().rotateY(Math.PI), head.clone().rotateY(Math.PI)]) };
}

/** Pedestrians: simple original figures (~150 triangles). Clothes take the instance colour. */
export function personGeometry(kind = 'man', skin = 0x7a5238) {
  const P = [];
  const box = (w, h, d, hex, x, y, z, tint = 0, rx = 0, rz = 0, rough = 0.85) => P.push(part(new THREE.BoxGeometry(w, h, d), hex, x, y, z, rx, 0, rz, 1, 1, 1, rough, 0, tint));
  if (kind === 'woman') {
    // saree / salwar: long tapered skirt, fitted top, a dupatta over one shoulder
    P.push(part(new THREE.CylinderGeometry(0.16, 0.27, 0.95, 8), 0xffffff, 0, 0.48, 0, 0, 0, 0, 1, 1, 0.8, 0.85, 0, 1));
    box(0.32, 0.46, 0.2, 0xffffff, 0, 1.17, 0, 1);
    box(0.08, 0.6, 0.06, 0xffffff, 0.12, 1.15, 0.09, 1, 0.2, 0.25);
    for (const sx of [-1, 1]) box(0.07, 0.5, 0.08, skin, sx * 0.2, 1.12, 0, 0, 0, sx * 0.08);
    P.push(part(new THREE.SphereGeometry(0.105, 8, 6), skin, 0, 1.53, 0, 0, 0, 0, 1, 1.12, 1, 0.7));
    P.push(part(new THREE.SphereGeometry(0.112, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), 0x1a1412, 0, 1.55, -0.01, 0, 0, 0, 1, 1, 1, 0.6));
    P.push(part(new THREE.SphereGeometry(0.06, 6, 5), 0x1a1412, 0, 1.5, -0.11, 0, 0, 0, 1, 1, 1, 0.6));      // bun
  } else {
    for (const sx of [-1, 1]) box(0.12, 0.82, 0.14, kind === 'kid' ? 0x2b3440 : 0x3a3f47, sx * 0.08, 0.41, 0, 0, 0, 0, 0.9);   // trousers
    for (const sx of [-1, 1]) box(0.11, 0.05, 0.22, 0x1d1b19, sx * 0.08, 0.025, 0.03);                                      // shoes / chappals
    box(0.36, 0.56, 0.21, 0xffffff, 0, 1.1, 0, 1);                                                                               // shirt / kurta
    for (const sx of [-1, 1]) { box(0.08, 0.3, 0.09, 0xffffff, sx * 0.22, 1.22, 0, 1, 0, sx * 0.1); box(0.065, 0.26, 0.07, skin, sx * 0.25, 0.96, 0, 0, 0, sx * 0.1); }
    P.push(part(new THREE.SphereGeometry(0.105, 8, 6), skin, 0, 1.5, 0, 0, 0, 0, 1, 1.12, 1, 0.7));
    P.push(part(new THREE.SphereGeometry(0.11, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.42), 0x161210, 0, 1.53, -0.005, 0, 0, 0, 1, 1, 1, 0.6));
  }
  const g = merge(P);
  if (kind === 'kid') g.scale(0.72, 0.72, 0.72);
  return g;
}

/* ======================= build ======================= */
export function buildProps(ctx) {
  const { scene, net, terr, colliders, atmo, quality, roads } = ctx;
  const group = new THREE.Group(); group.name = 'props';
  const R = rng(777);
  const D = new THREE.Object3D();
  const C = new THREE.Color();
  const occAt = ctx.layersRef?.buildings?.occAt || (() => false);
  const density = quality.props;
  const vmat = vehicleMaterial();
  const mtx = (x, y, z, ry = 0, s = 1, sy = s) => { D.position.set(x, y, z); D.rotation.set(0, ry, 0); D.scale.set(s, sy, s); D.updateMatrix(); return D.matrix; };
  const nearReserved = (x, z, pad = 0) => RESERVED.some(r => Math.hypot(r.x - x, r.z - z) < r.r + pad) || PLAZAS.some(p => Math.hypot(p.x - x, p.z - z) < p.r * 0.8 + pad);

  /* trees: a few variants per species so neighbours differ */
  const atlas = foliageAtlas();
  const fmat = foliageMaterial(atlas);
  const species = {};
  for (const sp of ['rain', 'gulmohar', 'peepal', 'ashoka', 'palm', 'shrub']) species[sp] = [new Chunked(treeGeometry(sp, 11 + sp.length), fmat, { noAO: true, cast: sp !== 'shrub' })];
  const tint = [new THREE.Color(1, 1, 1), new THREE.Color(0.92, 0.98, 0.88), new THREE.Color(1.05, 1.02, 0.9), new THREE.Color(0.88, 0.92, 0.86)];
  let nTrees = 0;
  const addTree = (sp, x, z, s = 0.85 + R() * 0.35, y = terr.heightAt(x, z)) => {
    species[sp][0].add(mtx(x, y - 0.05, z, R() * Math.PI * 2, s), C.copy(tint[Math.floor(R() * tint.length)]));
    if (sp !== 'shrub') colliders.post(x, z, (sp === 'palm' ? 0.3 : sp === 'ashoka' ? 0.25 : 0.4) * s, y - 1, y + 6);
    nTrees++;
  };
  const streetSpecies = (x, z) => {
    const d = districtAt(x, z).id;
    const r = R();
    if (d === 'bkc' || d === 'lowerParel') return r < 0.6 ? 'ashoka' : 'peepal';
    if (d === 'bandra' || d === 'malabar') return r < 0.5 ? 'rain' : r < 0.8 ? 'gulmohar' : 'peepal';
    return r < 0.45 ? 'rain' : r < 0.65 ? 'gulmohar' : r < 0.85 ? 'peepal' : 'ashoka';
  };
  for (const t of roads.treeSites) {
    if (R() > density) continue;
    if (t.kind === 'palm') addTree('palm', t.x, t.z, 0.9 + R() * 0.3, t.h);
    else if (t.kind === 'median') addTree(R() < 0.5 ? 'ashoka' : 'gulmohar', t.x, t.z, 0.7, t.h);
    else addTree(streetSpecies(t.x, t.z), t.x, t.z, 0.8 + R() * 0.3, t.h);
  }
  // parks, gardens, hills, and loose infill on open ground
  const freeGrass = (x, z) => {
    if (!insideSlab(x, z, 12) || landSD(x, z) < 6 || occAt(x, z) || nearReserved(x, z, 4)) return false;
    const n = net.nearestRoad(x, z, 30);
    if (n && n.d < n.road.T.hw + n.road.T.sidewalk + 2.5 + (n.road.deck ? 3 : 0)) return false;
    for (const nd of Object.values(net.nodes)) if (Math.hypot(nd.x - x, nd.z - z) < nd.R + nd.sw + 3) return false;
    return true;
  };
  for (const p of PARKS) {
    const n = Math.round((p.kind === 'garden' ? 0.02 : 0.005) * p.rx * p.rz * density * 3);
    for (let k = 0; k < n; k++) {
      const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * 0.95;
      const ring = p.kind === 'maidan' ? 0.84 + R() * 0.16 : rr;     // maidans: trees around the edge, open middle
      const lx = Math.cos(a) * p.rx * ring, lz = Math.sin(a) * p.rz * ring;
      const x = p.x + lx * Math.cos(p.rot) - lz * Math.sin(p.rot), z = p.z + lx * Math.sin(p.rot) + lz * Math.cos(p.rot);
      if (freeGrass(x, z)) addTree(p.kind === 'maidan' ? (R() < 0.7 ? 'rain' : 'peepal') : (R() < 0.3 ? 'gulmohar' : R() < 0.5 ? 'shrub' : 'peepal'), x, z, 0.9 + R() * 0.4);
    }
  }
  const step = 12 / Math.sqrt(density);
  for (let z = WB.minZ; z < WB.maxZ; z += step) for (let x = WB.minX; x < WB.maxX; x += step) {
    const jx = x + (R() - 0.5) * step, jz = z + (R() - 0.5) * step;
    let p = 0.1 + districtAt(jx, jz).tree * 0.12;
    for (const h of HILLS) if (Math.hypot(h.x - jx, h.z - jz) < h.r * 1.1) p = 0.55;
    if (R() > p) continue;
    if (freeGrass(jx, jz)) addTree(R() < 0.25 ? 'shrub' : streetSpecies(jx, jz), jx, jz);
  }
  // palms on Chowpatty and the waterfront plazas
  for (let k = 0; k < 26 * density; k++) {
    const x = -300 + R() * 120, z = 340 + R() * 30;
    if (terr.heightAt(x, z) > 0.6 && freeGrass(x, z) !== false) addTree('palm', x, z, 0.9 + R() * 0.3);
  }
  for (const [px, pz, n, rad] of [[905, 1046, 12, 52], [262, -1700, 10, 40], [-520, -1700, 14, 60]]) {
    for (let k = 0; k < n * density; k++) {
      const a = k / n * Math.PI * 2 + R() * 0.2, x = px + Math.cos(a) * rad * (0.85 + R() * 0.15), z = pz + Math.sin(a) * rad * (0.85 + R() * 0.15);
      if (landSD(x, z) > 3 && insideSlab(x, z, 12)) { const nr = net.nearestRoad(x, z, 20); if (!nr || nr.d > nr.road.T.hw + 1) addTree('palm', x, z, 0.9 + R() * 0.3); }
    }
  }
  // shrubs at building corners
  const lots = ctx.layersRef?.buildings?.lots || [];
  for (const L of lots) {
    if (R() > 0.5 * density) continue;
    const c = Math.cos(L.rot), sn = Math.sin(L.rot);
    for (const sx of [-1, 1]) {
      if (R() < 0.4) continue;
      const lx = sx * (L.hx + 1.3), lz = (L.side ? -L.side : 1) * (L.hz + 1.1);
      const x = L.cx + lx * c + lz * sn, z = L.cz - lx * sn + lz * c;
      const nr = net.nearestRoad(x, z, 20);
      if (nr && nr.d < nr.road.T.hw + nr.road.T.sidewalk + 0.6) continue;
      addTree('shrub', x, z, 0.7 + R() * 0.5);
    }
  }
  for (const sp of Object.values(species)) for (const ch of sp) ch.build(group);

  /* lamps (+ warm pools of light at night) */
  const lg = lampGeometry();
  const poles = new Chunked(lg.lamp, vmat), twins = new Chunked(lg.twin, vmat);
  const poolTex = canvasTexture(64, 64, (g) => { const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32); grd.addColorStop(0, 'rgba(255,214,150,0.8)'); grd.addColorStop(0.35, 'rgba(255,205,140,0.35)'); grd.addColorStop(0.7, 'rgba(255,200,130,0.08)'); grd.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = grd; g.fillRect(0, 0, 64, 64); });
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -8 });
  const poolGeo = new THREE.PlaneGeometry(1, 1); poolGeo.rotateX(-Math.PI / 2);
  const pools = new Chunked(poolGeo, poolMat, { cast: false, receive: false, noAO: true });
  let nl = 0;
  for (const l of roads.lampSites) {
    if (l.kind === 'deck') {
      twins.add(mtx(l.x, l.h, l.z, l.dir, 1.1));
      pools.add(mtx(l.x, l.h + 0.05, l.z, 0, 16));
      nl++; continue;
    }
    if (R() > Math.max(0.55, density)) continue;
    (l.kind === 'twin' ? twins : poles).add(mtx(l.x, l.h, l.z, l.dir));
    pools.add(mtx(l.x + Math.sin(l.dir) * 1.2, l.h + 0.03, l.z + Math.cos(l.dir) * 1.2, 0, 12));
    colliders.post(l.x, l.z, 0.18, l.h - 1, l.h + 7);
    nl++;
  }
  poles.build(group); twins.build(group); pools.build(group);

  /* parked vehicles (left-hand traffic: cars face +s on the +lat side) */
  const CAR_COLS = ['#e8e8e5', '#e8e8e5', '#b8bbbe', '#b8bbbe', '#6b6f73', '#1c1e21', '#7a1d1b', '#1e2c45', '#c8c0b0', '#8e2a20', '#3a4a3c'];
  const kinds = [
    { geo: taxiGeometry(), w: 0.34, r: 1.0, len: 4.0 },
    { geo: autoGeometry(), w: 0.22, r: 0.8, len: 2.6 },
    { geo: carGeometry('sedan'), w: 0.16, r: 1.0, len: 4.25, tint: true },
    { geo: carGeometry('hatch'), w: 0.16, r: 1.0, len: 3.75, tint: true },
    { geo: carGeometry('suv'), w: 0.08, r: 1.05, len: 4.4, tint: true },
    { geo: busGeometry(), w: 0.05, r: 1.4, len: 10.6 },
  ];
  const vehBuckets = kinds.map(k => new Chunked(k.geo, vmat));
  const pickKind = () => { let t = R() * kinds.reduce((a, k) => a + k.w, 0); for (let i = 0; i < kinds.length; i++) { t -= kinds[i].w; if (t <= 0) return i; } return 0; };
  let nv = 0;
  for (const r of net.roads) {
    if (r.deck || (r.type !== 'arterial' && r.type !== 'street' && r.type !== 'boulevard')) continue;
    for (const side of [1, -1]) {
      let s = r.trim0 + 14 + R() * 20;
      while (s < r.trim1 - 14) {
        const ki = pickKind(), K = kinds[ki];
        const i = Math.round(s / r.L * (r.n - 1));
        if (r.seaSides && r.seaSides.some(q => q.side === side && i >= q.i0 && i <= q.i1)) { s += 30; continue; }
        if (R() < 0.55 * density) {
          const lat = side * (r.T.hw - (ki === 5 ? 1.6 : 1.2));
          const x = r.x[i] + r.tz[i] * lat, z = r.z[i] - r.tx[i] * lat;
          const ry = Math.atan2(r.tx[i], r.tz[i]) + (side > 0 ? 0 : Math.PI);
          const m = mtx(x, r.h[i], z, ry);
          vehBuckets[ki].add(m, K.tint ? C.set(CAR_COLS[Math.floor(R() * CAR_COLS.length)]) : C.setRGB(1, 1, 1));
          for (const off of [-K.len * 0.3, K.len * 0.3]) colliders.post(x + r.tx[i] * off, z + r.tz[i] * off, K.r, r.h[i] - 1, r.h[i] + (ki === 5 ? 4.5 : 1.8), 'vehicle');
          nv++;
        }
        s += K.len + 6 + R() * 26;
      }
    }
  }
  vehBuckets.forEach(b => b.build(group));

  /* tetrapods along sea walls */
  const tetra = new Chunked(tetrapodGeometry(), vmat, { cast: false });
  for (const r of net.roads) for (const q of r.seaSides || []) {
    for (let i = q.i0; i <= q.i1; i++) {
      for (let k = 0; k < 2; k++) {
        if (R() > 0.75 * density + 0.2) continue;
        const lat = q.lat + q.side * (1.4 + R() * 3.2);
        const x = r.x[i] + r.tz[i] * lat + (R() - 0.5), z = r.z[i] - r.tx[i] * lat + (R() - 0.5);
        D.position.set(x, -0.6 + R() * 0.7, z); D.rotation.set(R() * 3, R() * 3, R() * 3); D.scale.setScalar(1.1 + R() * 0.3); D.updateMatrix();
        tetra.add(D.matrix);
      }
    }
  }
  tetra.build(group);

  /* boats bobbing in the harbour, Back Bay and Mahim Bay */
  const boatGeo = boatGeometry();
  const boatList = [];
  for (const [cx, cz, n, rad] of [[990, 1060, 9, 70], [60, 760, 5, 90], [-330, -1180, 5, 70], [-640, -1640, 4, 60], [1150, 300, 4, 60]]) {
    for (let k = 0; k < n; k++) {
      const x = cx + (R() - 0.5) * rad * 2, z = cz + (R() - 0.5) * rad * 2;
      if (landSD(x, z) > -14 || !insideSlab(x, z, 30)) continue;
      boatList.push({ x, z, ry: R() * Math.PI * 2, ph: R() * 6, s: 0.8 + R() * 0.5 });
    }
  }
  const boats = new THREE.InstancedMesh(boatGeo, vmat, Math.max(1, boatList.length));
  boats.count = boatList.length; boats.castShadow = true;
  group.add(boats);

  /* pedestrians: footpaths, the Gateway plaza, Marine Drive promenade, Chowpatty, campuses */
  const CLOTH = ['#e9e6df', '#d9d4c7', '#3b5578', '#7a2f2a', '#c9a24a', '#2f5d4f', '#e0c9a6', '#5b4f7a', '#b5462f', '#8a8f96', '#d08a3a', '#2a2d33', '#a1325b', '#e7dcc2'];
  const SKIN = [0x6e4a33, 0x7f5639, 0x5d3d2a, 0x8c6243];
  const people = [];
  for (const sk of SKIN.slice(0, 2)) for (const k of ['man', 'woman']) people.push(new Chunked(personGeometry(k, sk), vmat, { cast: true }));
  people.push(new Chunked(personGeometry('kid', SKIN[2]), vmat, { cast: true }));
  let nPeople = 0;
  /** true if nothing solid (walls, posts, landmark footprints, stalls, other people) is within r metres. */
  const freeSpot = (x, z, y, r) => {
    let ok = true;
    colliders.query(x, z, r + 1, o => {
      if (!ok || y < o.y0 - 1 || y > o.y1 + 1) return;
      if (o.t === 0) {
        const dx = o.bx - o.ax, dz = o.bz - o.az, l2 = dx * dx + dz * dz || 1;
        let t = ((x - o.ax) * dx + (z - o.az) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        if (Math.hypot(x - o.ax - dx * t, z - o.az - dz * t) < r) ok = false;
      } else if (Math.hypot(x - o.x, z - o.z) < o.r + r) ok = false;
    });
    return ok;
  };
  const addPerson = (x, z, y, ry) => {
    const i = Math.floor(R() * people.length);
    people[i].add(mtx(x, y, z, ry, 0.92 + R() * 0.14), C.set(CLOTH[Math.floor(R() * CLOTH.length)]));
    colliders.post(x, z, 0.32, y - 0.5, y + 1.8, 'person');
    nPeople++;
  };
  for (const r of net.roads) {
    if (r.deck || !r.T.sidewalk) continue;
    const busy = r.type === 'boulevard' ? 0.5 : r.type === 'arterial' ? 0.32 : 0.18;
    for (let i = 4; i < r.n - 4; i += 3) {
      if (r.s[i] < r.trim0 + 8 || r.s[i] > r.trim1 - 8) continue;
      for (const side of [1, -1]) {
        if (R() > busy * density * 0.55) continue;
        const sea = (r.seaSides || []).some(q => q.side === side && i >= q.i0 && i <= q.i1);
        const lat = side * (r.T.hw + 0.9 + R() * (r.T.sidewalk - 1.6));
        const x = r.x[i] + r.tz[i] * lat + r.tx[i] * (R() - 0.5) * 2, z = r.z[i] - r.tx[i] * lat + r.tz[i] * (R() - 0.5) * 2;
        // along Marine Drive people face the sea; elsewhere they stroll along the footpath
        const along = Math.atan2(r.tx[i], r.tz[i]) + (R() < 0.5 ? 0 : Math.PI);
        const ry = sea && R() < 0.6 ? Math.atan2(r.tz[i] * side, -r.tx[i] * side) + (R() - 0.5) * 0.8 : along + (R() - 0.5) * 0.6;
        if (!freeSpot(x, z, r.h[i], 0.7)) continue;
        addPerson(x, z, r.h[i] + 0.16, ry);
        // some chat in pairs, facing each other
        const bx = x + Math.sin(ry) * 0.85, bz = z + Math.cos(ry) * 0.85;
        if (R() < 0.35 && freeSpot(bx, bz, r.h[i], 0.5)) addPerson(bx, bz, r.h[i] + 0.16, ry + Math.PI + (R() - 0.5) * 0.4);
      }
    }
  }
  for (const [px, pz, n, rad, inner] of [[900, 1046, 70, 40, 14], [-240, 352, 40, 28, 0], [262, -1700, 24, 30, 10], [948, -1206, 22, 30, 6], [-200, -48, 14, 18, 4], [300, 752, 10, 14, 0]]) {
    for (let k = 0; k < n * density; k++) {
      const a = R() * Math.PI * 2, rr = inner + Math.sqrt(R()) * (rad - inner), x = px + Math.cos(a) * rr, z = pz + Math.sin(a) * rr;
      if (occAt(x, z) || landSD(x, z) < 2) continue;
      const nr = net.nearestRoad(x, z, 25); if (nr && nr.d < nr.road.T.hw + 0.6) continue;
      const y = terr.heightAt(x, z);
      if (!freeSpot(x, z, y, 2.2)) continue;            // clear of monuments, stalls, fountains and each other
      addPerson(x, z, y, R() * Math.PI * 2);
    }
  }
  for (const ch of people) ch.build(group);

  /* distance culling: small props vanish into the haze anyway */
  const cullables = group.children.filter(m => m.isInstancedMesh && m !== boats);
  const farSq = (quality.key === 'low' ? 420 : quality.key === 'medium' ? 600 : 750) ** 2;
  let cullT = 0;
  function cull(cam) {
    if ((cullT = (cullT + 1) % 10) !== 0) return;
    for (const m of cullables) { const c = m.boundingSphere.center, r = m.boundingSphere.radius; const dx = c.x - cam.position.x, dz = c.z - cam.position.z; m.visible = dx * dx + dz * dz < farSq + r * r + 2 * r * Math.sqrt(farSq) || cam.position.y > 300; }
  }
  scene.add(group);
  const setNight = v => { GLOW.value = v * 2.6; poolMat.opacity = v * 0.34; };
  setNight(atmo.night.value);
  return {
    group, counts: { trees: nTrees, lamps: nl, vehicles: nv, boats: boatList.length, people: nPeople }, setNight, foliage: fmat, vehicleMaterial: vmat,
    update(t, dt, camera) {
      if (camera) cull(camera);
      boatList.forEach((b, i) => {
        D.position.set(b.x, Math.sin(t * 1.3 + b.ph) * 0.15 - 0.1, b.z);
        D.rotation.set(Math.sin(t * 1.1 + b.ph) * 0.05, b.ry, Math.cos(t * 0.9 + b.ph) * 0.06); D.scale.setScalar(b.s); D.updateMatrix();
        boats.setMatrixAt(i, D.matrix);
      });
      boats.instanceMatrix.needsUpdate = true;
    },
  };
}
