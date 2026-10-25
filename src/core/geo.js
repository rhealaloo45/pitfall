/* Geometry helpers shared by the car and the city. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/**
 * Loft a smooth closed body through superellipse cross-sections placed along Z.
 * section: { z, hw, hh, xc=0, yc=0, eTop=2.6, eBot=3.2 }
 */
export function loft(sections, { radial = 28, sub = 4, capStart = true, capEnd = true } = {}) {
  const keys = ['z', 'hw', 'hh', 'xc', 'yc', 'eTop', 'eBot'];
  const S = sections.map(s => ({ xc: 0, yc: 0, eTop: 2.6, eBot: 3.2, ...s }));
  const rings = [];
  for (let i = 0; i < S.length - 1; i++) {
    for (let k = 0; k < sub; k++) {
      const t = k / sub, r = {};
      for (const key of keys) {
        const a = S[Math.max(0, i - 1)][key], b = S[i][key], c = S[i + 1][key], d = S[Math.min(S.length - 1, i + 2)][key];
        r[key] = catmull(a, b, c, d, t);
      }
      rings.push(r);
    }
  }
  rings.push({ ...S[S.length - 1] });
  const pos = [], uv = [], idx = [];
  const R = radial + 1;
  let vAcc = 0;
  rings.forEach((r, ri) => {
    if (ri > 0) vAcc += Math.abs(r.z - rings[ri - 1].z);
    for (let j = 0; j <= radial; j++) {
      const th = j / radial * Math.PI * 2 - Math.PI / 2;    // start at the bottom centre
      const c = Math.cos(th), s = Math.sin(th);
      const e = s >= 0 ? r.eTop : r.eBot;
      const x = r.xc + r.hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / e);
      const y = r.yc + r.hh * Math.sign(s) * Math.pow(Math.abs(s), 2 / e);
      pos.push(x, y, r.z);
      uv.push(j / radial, vAcc);
    }
  });
  const total = vAcc || 1;
  for (let i = 1; i < uv.length; i += 2) uv[i] /= total;
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * R + j, b = a + 1, c = a + R, d = c + 1;
      // sections run from front (high z) to back; keep faces pointing outward
      if (rings[i].z > rings[i + 1].z) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  }
  const addCap = (ri, flip) => {
    const r = rings[ri];
    const ci = pos.length / 3;
    pos.push(r.xc, r.yc, r.z); uv.push(0.5, ri ? 1 : 0);
    for (let j = 0; j < radial; j++) {
      const a = ri * R + j, b = a + 1;
      if (flip) idx.push(ci, a, b); else idx.push(ci, b, a);
    }
  };
  const forward = rings[0].z > rings[rings.length - 1].z;
  if (capStart) addCap(0, !forward);
  if (capEnd) addCap(rings.length - 1, forward);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Airfoil cross-section shape (chord along +x, thickness along y). */
export function airfoilShape(chord, thick = 0.12, camber = 0.04) {
  const sh = new THREE.Shape();
  const n = 14, top = [], bot = [];
  for (let i = 0; i <= n; i++) {
    const x = (1 - Math.cos(i / n * Math.PI)) / 2;
    const t = 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    const yc = camber * 4 * x * (1 - x);
    top.push([x * chord, (yc + t) * chord]); bot.push([x * chord, (yc - t) * chord]);
  }
  sh.moveTo(top[0][0], top[0][1]);
  for (let i = 1; i < top.length; i++) sh.lineTo(top[i][0], top[i][1]);
  for (let i = bot.length - 1; i >= 0; i--) sh.lineTo(bot[i][0], bot[i][1]);
  return sh;
}

/** Wing element spanning X, chord along −Z (leading edge at z=0). */
export function wingElement(span, chord, thick, camber, aoa = 0) {
  const g = new THREE.ExtrudeGeometry(airfoilShape(chord, thick, camber), { depth: span, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -span / 2);
  // shape x → world −z, shape y → world y, extrude z → world x
  g.rotateY(Math.PI / 2);
  g.rotateX(aoa);
  g.computeVertexNormals();
  return g;
}

/** Thin flat plate from a 2D outline in the (z, y) plane, thickness along x. */
export function plate(points, thickness) {
  const sh = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: thickness, bevelEnabled: false });
  g.translate(0, 0, -thickness / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

/** Cylinder between two points. */
export function strut(a, b, r, mat, radial = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, radial), mat);
  orientStrut(m, A, B);
  return m;
}
const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
export function orientStrut(m, A, B) {
  _d.subVectors(B, A);
  const len = _d.length();
  m.position.copy(A).addScaledVector(_d, 0.5);
  m.scale.set(1, len, 1);
  m.quaternion.setFromUnitVectors(_up, _d.normalize());
}

/** Seeded PRNG (mulberry32) for deterministic procedural content. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Canvas helper → texture. */
export function canvasTexture(w, h, draw, { srgb = true, repeat = false, aniso = 4 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso;
  return t;
}

/**
 * Merge static meshes that share a material into one mesh per material (fewer draw calls).
 * Only direct-or-nested Mesh children of `group` with a single material and no userData.dynamic are merged;
 * world transforms relative to `group` are baked in. Returns the number of meshes removed.
 */
export function mergeStaticByMaterial(group, { keep = () => false } = {}) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  group.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material) || o.userData.dynamic || keep(o)) return;
    const k = o.material.uuid + (o.castShadow ? 'c' : '') + (o.receiveShadow ? 'r' : '') + o.renderOrder;
    let b = buckets.get(k); if (!b) buckets.set(k, b = []); b.push(o);
  });
  let removed = 0;
  const m = new THREE.Matrix4();
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const geos = [];
    for (const o of list) {
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      g.applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld));
      g.clearGroups();
      geos.push(g);
    }
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, list[0].material);
    mesh.castShadow = list[0].castShadow; mesh.receiveShadow = list[0].receiveShadow; mesh.renderOrder = list[0].renderOrder;
    mesh.userData = { ...list[0].userData };
    for (const o of list) { o.parent.remove(o); removed++; }
    group.add(mesh);
    removed--;
  }
  return removed;
}
