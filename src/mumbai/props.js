/* Toy props: trees, palms, lamps, parked vehicles, boats, tetrapods.
   All geometry is procedural; instances are bucketed into spatial chunks so
   frustum culling still works for large counts. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PARKS, HILLS, PLAZAS, RESERVED, WORLD_BOUNDS as WB } from './layout.js';
import { landSD } from './geo2d.js';
import { rng, canvasTexture } from '../core/geo.js';
import { insideSlab } from './diorama.js';

/* ---------- helpers ---------- */
export function paint(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (geo.index) geo = geo.toNonIndexed();
  return geo;
}
const part = (geo, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
  geo.scale(sx, sy, sz); geo.rotateX(rx); geo.rotateY(ry); geo.rotateZ(rz); geo.translate(x, y, z);
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
  return paint(geo, hex);
};
const merge = parts => mergeGeometries(parts.map(g => (g.index ? g.toNonIndexed() : g)));
const RB = (w, h, d, r = 0.2, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));

export class Chunked {
  constructor(geo, mat, { chunk = 300, cast = true, receive = true } = {}) { this.geo = geo; this.mat = mat; this.chunk = chunk; this.b = new Map(); this.cast = cast; this.receive = receive; }
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
      im.computeBoundingSphere();
      group.add(im); meshes.push(im);
    }
    return meshes;
  }
}

/* ---------- toy models ---------- */
export function treeGeometry() {
  const trunk = part(new THREE.CylinderGeometry(0.22, 0.34, 3.2, 7), 0x8b5a3c, 0, 1.6, 0);
  const blob = (x, y, z, r) => { const g = new THREE.IcosahedronGeometry(r, 1); return part(g, 0xffffff, x, y, z); };
  const canopy = merge([blob(0, 4.3, 0, 2.3), blob(1.25, 3.7, 0.5, 1.6), blob(-1.1, 3.9, -0.7, 1.7), blob(0.2, 5.4, -0.3, 1.5)]);
  return { trunk, canopy };
}
export function palmGeometry() {
  const parts = [];
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.35, 2.5, 0), new THREE.Vector3(0.9, 5, 0), new THREE.Vector3(1.6, 7.2, 0)]);
  parts.push(paint(new THREE.TubeGeometry(curve, 10, 0.24, 7), 0xa8774e).toNonIndexed());
  const top = new THREE.Vector3(1.6, 7.2, 0);
  for (let k = 0; k < 7; k++) {
    const leaf = new THREE.PlaneGeometry(0.85, 3.3, 1, 5);
    const p = leaf.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + 1.65, t = y / 3.3;
      p.setXYZ(i, p.getX(i) * (1 - t * 0.7), 0, y);
      p.setY(i, -t * t * 1.6 + t * 0.4);
    }
    leaf.computeVertexNormals();
    const g = part(leaf, k % 2 ? 0x4cb05a : 0x3f9b4f, 0, 0, 0, 0, k / 7 * Math.PI * 2 + 0.3, 0);
    g.translate(top.x, top.y, top.z);
    parts.push(g);
  }
  for (let k = 0; k < 3; k++) parts.push(part(new THREE.IcosahedronGeometry(0.22, 0), 0x7a5a2a, top.x + Math.cos(k * 2.1) * 0.3, top.y - 0.3, Math.sin(k * 2.1) * 0.3));
  return merge(parts);
}
function wheels(w, l, r = 0.36) {
  const out = [];
  for (const sx of [1, -1]) for (const sz of [1, -1]) out.push(part(new THREE.CylinderGeometry(r, r, 0.26, 12), 0x24242a, sx * w / 2, r, sz * l * 0.32, 0, 0, Math.PI / 2));
  return out;
}
export function taxiGeometry() {
  return merge([
    part(RB(1.7, 0.75, 3.8, 0.28), 0x1d1d22, 0, 0.72, 0),
    part(RB(1.5, 0.48, 2.0, 0.2), 0x2a3f6a, 0, 1.28, -0.15),
    part(RB(1.56, 0.16, 2.06, 0.08), 0xf6c21c, 0, 1.56, -0.15),
    part(RB(1.72, 0.32, 3.82, 0.14), 0xf6c21c, 0, 1.02, 0),
    part(RB(0.5, 0.22, 0.3, 0.06), 0xffd84a, 0, 1.73, -0.1),
    part(RB(0.3, 0.14, 0.06, 0.04), 0xfff4c6, 0.55, 0.85, 1.9), part(RB(0.3, 0.14, 0.06, 0.04), 0xfff4c6, -0.55, 0.85, 1.9),
    ...wheels(1.6, 3.8),
  ]);
}
export function autoGeometry() {
  return merge([
    part(RB(1.3, 0.6, 2.6, 0.25), 0x22262a, 0, 0.65, 0),
    part(RB(1.36, 0.12, 2.3, 0.06), 0x2fa864, 0, 0.98, -0.05),
    part(RB(1.4, 0.9, 1.9, 0.35), 0xf5c518, 0, 1.6, -0.25),
    part(RB(1.2, 0.55, 0.08, 0.04), 0x2a3f6a, 0, 1.4, 0.72),
    part(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 12), 0x24242a, 0, 0.33, 1.05, 0, 0, Math.PI / 2),
    part(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 12), 0x24242a, 0.6, 0.33, -0.8, 0, 0, Math.PI / 2),
    part(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 12), 0x24242a, -0.6, 0.33, -0.8, 0, 0, Math.PI / 2),
  ]);
}
export function busGeometry() {
  const p = [part(RB(2.5, 4.3, 10.4, 0.45), 0xd6312b, 0, 2.55, 0)];
  for (const y of [1.95, 3.75]) p.push(part(RB(2.56, 0.85, 9.2, 0.12), 0x29344f, 0, y, 0.1));
  p.push(part(RB(2.58, 0.2, 10.2, 0.08), 0xf4efe4, 0, 2.85, 0));
  p.push(part(RB(2.3, 0.85, 0.1, 0.05), 0x29344f, 0, 3.75, 5.2));
  p.push(...wheels(2.3, 10.4, 0.5).map(g => g));
  return merge(p);
}
export function carGeometry() {
  return merge([
    part(RB(1.75, 0.7, 3.6, 0.32), 0xffffff, 0, 0.72, 0),
    part(RB(1.5, 0.55, 1.9, 0.26), 0x2a3f6a, 0, 1.3, -0.2),
    part(RB(1.55, 0.14, 1.95, 0.07), 0xffffff, 0, 1.6, -0.2),
    ...wheels(1.62, 3.6),
  ]);
}
export function boatGeometry() {
  const hull = new THREE.CylinderGeometry(1.6, 1.1, 1.3, 12, 1, false);
  hull.scale(1, 1, 3.2);
  return merge([
    part(hull, 0xf6f1e6, 0, 0.3, 0),
    part(RB(3.1, 0.25, 9.8, 0.1), 0x2c79c9, 0, 0.75, 0),
    part(RB(2.0, 1.2, 3.2, 0.3), 0xffffff, 0, 1.5, -0.8),
    part(RB(2.04, 0.4, 3.24, 0.1), 0x2c79c9, 0, 1.75, -0.8),
    part(new THREE.CylinderGeometry(0.08, 0.08, 3, 6), 0x6b4b32, 0, 2.6, 1.6),
    part(new THREE.ConeGeometry(0.6, 1.2, 3), 0xe24a3b, 0.35, 3.4, 1.6, 0, 0, -Math.PI / 2),
  ]);
}
function tetrapodGeometry() {
  const p = [];
  const dirs = [[0, 1, 0], [0.94, -0.33, 0], [-0.47, -0.33, 0.82], [-0.47, -0.33, -0.82]];
  for (const d of dirs) {
    const g = new THREE.CylinderGeometry(0.22, 0.42, 1.1, 7);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d));
    g.translate(0, 0.55, 0); g.applyQuaternion(q);
    p.push(paint(g, 0xd9d2c7).toNonIndexed());
  }
  return merge(p);
}
function lampGeometry() {
  const pole = merge([
    part(new THREE.CylinderGeometry(0.09, 0.13, 6.4, 8), 0x3b5566, 0, 3.2, 0),
    part(new THREE.TorusGeometry(0.9, 0.07, 6, 12, Math.PI / 2), 0x3b5566, 0.9 * 0, 6.4, 0, 0, Math.PI / 2, 0),
    part(new THREE.CylinderGeometry(0.22, 0.26, 0.25, 10), 0x3b5566, 0, 0.12, 0),
  ]);
  pole.translate(0, 0, 0);
  const head = part(RB(0.5, 0.22, 0.9, 0.1), 0xfff2c8, 0, 7.15, 0.95);
  return { pole, head };
}

/* ---------- build ---------- */
export function buildProps(ctx) {
  const { scene, net, terr, colliders, atmo, quality, roads } = ctx;
  const group = new THREE.Group(); group.name = 'props';
  const R = rng(777);
  const D = new THREE.Object3D();
  const C = new THREE.Color();
  const occAt = ctx.layersRef?.buildings?.occAt || (() => false);
  const density = quality.props;
  const vmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 });
  const mtx = (x, y, z, ry = 0, s = 1, sy = s) => { D.position.set(x, y, z); D.rotation.set(0, ry, 0); D.scale.set(s, sy, s); D.updateMatrix(); return D.matrix; };
  const nearReserved = (x, z, pad = 0) => RESERVED.some(r => Math.hypot(r.x - x, r.z - z) < r.r + pad) || PLAZAS.some(p => Math.hypot(p.x - x, p.z - z) < p.r * 0.8 + pad);

  /* trees */
  const tg = treeGeometry();
  const trunks = new Chunked(tg.trunk, vmat);
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, flatShading: true });
  const canopies = new Chunked(tg.canopy, canopyMat);
  const greens = [0x5fae4b, 0x6dbb52, 0x4f9e45, 0x7cc35c, 0x58a74f], blooms = [0xf2683c, 0xf5c542, 0xf29bb5];
  let nTrees = 0;
  const addTree = (x, z, s = 0.8 + R() * 0.5, y = terr.heightAt(x, z), allowBloom = true) => {
    const ry = R() * Math.PI * 2;
    trunks.add(mtx(x, y - 0.2, z, ry, s));
    const bloom = allowBloom && R() < 0.16;
    C.set(bloom ? blooms[Math.floor(R() * blooms.length)] : greens[Math.floor(R() * greens.length)]).offsetHSL(0, 0, (R() - 0.5) * 0.06);
    canopies.add(mtx(x, y - 0.2, z, ry, s), C);
    colliders.post(x, z, 0.45 * s, y - 1, y + 6);
    nTrees++;
  };
  /* palms */
  const palms = new Chunked(palmGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }));
  const addPalm = (x, z, y = terr.heightAt(x, z)) => { palms.add(mtx(x, y - 0.1, z, R() * Math.PI * 2, 0.85 + R() * 0.35)); colliders.post(x, z, 0.35, y - 1, y + 7); };

  for (const t of roads.treeSites) {
    if (R() > density) continue;
    if (t.kind === 'palm') addPalm(t.x, t.z, t.h);
    else if (t.kind === 'median') addTree(t.x, t.z, 0.6, t.h, true);
    else addTree(t.x, t.z, 0.75 + R() * 0.3, t.h);
  }
  // parks, gardens, hills, and loose infill on open grass
  const freeGrass = (x, z) => {
    if (!insideSlab(x, z, 12) || landSD(x, z) < 6 || occAt(x, z) || nearReserved(x, z, 4)) return false;
    const n = net.nearestRoad(x, z, 30);
    if (n && n.d < n.road.T.hw + n.road.T.sidewalk + 2.5 + (n.road.deck ? 3 : 0)) return false;
    for (const nd of Object.values(net.nodes)) if (Math.hypot(nd.x - x, nd.z - z) < nd.R + nd.sw + 3) return false;
    return true;
  };
  for (const p of PARKS) {
    const n = Math.round((p.kind === 'garden' ? 0.02 : 0.004) * p.rx * p.rz * density * 3);
    for (let k = 0; k < n; k++) {
      const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * (p.kind === 'maidan' ? 1.0 : 0.95);
      const ring = p.kind === 'maidan' ? 0.82 + R() * 0.18 : rr;     // maidans: trees around the edge, open middle
      const lx = Math.cos(a) * p.rx * ring, lz = Math.sin(a) * p.rz * ring;
      const x = p.x + lx * Math.cos(p.rot) - lz * Math.sin(p.rot), z = p.z + lx * Math.sin(p.rot) + lz * Math.cos(p.rot);
      if (freeGrass(x, z)) addTree(x, z, 0.9 + R() * 0.6);
    }
  }
  const step = 13 / Math.sqrt(density);
  for (let z = WB.minZ; z < WB.maxZ; z += step) for (let x = WB.minX; x < WB.maxX; x += step) {
    const jx = x + (R() - 0.5) * step, jz = z + (R() - 0.5) * step;
    let p = 0.12;
    for (const h of HILLS) if (Math.hypot(h.x - jx, h.z - jz) < h.r * 1.1) p = 0.5;
    if (R() > p) continue;
    if (freeGrass(jx, jz)) addTree(jx, jz);
  }
  // palms on beaches and waterfront plazas
  for (let k = 0; k < 26 * density; k++) {
    const x = -300 + R() * 120, z = 340 + R() * 30;
    if (terr.heightAt(x, z) > 0.6 && freeGrass(x, z) !== false) addPalm(x, z);
  }
  for (const [px, pz, n, rad] of [[905, 1046, 12, 52], [262, -1700, 10, 40], [-520, -1700, 14, 60]]) {
    for (let k = 0; k < n * density; k++) {
      const a = k / n * Math.PI * 2 + R() * 0.2, x = px + Math.cos(a) * rad * (0.85 + R() * 0.15), z = pz + Math.sin(a) * rad * (0.85 + R() * 0.15);
      if (landSD(x, z) > 3 && insideSlab(x, z, 12)) { const nr = net.nearestRoad(x, z, 20); if (!nr || nr.d > nr.road.T.hw + 1) addPalm(x, z); }
    }
  }
  /* bushes & flower beds: front corners of buildings, park edges */
  const bushGeo = merge([part(new THREE.IcosahedronGeometry(1, 1), 0xffffff, 0, 0.55, 0, 0, 0, 0, 1.1, 0.75, 1.1), part(new THREE.IcosahedronGeometry(0.75, 1), 0xffffff, 0.8, 0.45, 0.3, 0, 0, 0, 1, 0.75, 1)]);
  const bushes = new Chunked(bushGeo, canopyMat, { cast: false });
  const bushCols = [0x5fae4b, 0x4f9e45, 0x7cc35c, 0xf06a8a, 0xf5b942, 0xb27ee0];
  const lots = ctx.layersRef?.buildings?.lots || [];
  for (const L of lots) {
    if (R() > 0.55 * density) continue;
    const c = Math.cos(L.rot), sn = Math.sin(L.rot);
    for (const sx of [-1, 1]) {
      if (R() < 0.4) continue;
      const lx = sx * (L.hx + 1.4), lz = (L.side ? -L.side : 1) * (L.hz + 1.2);
      const x = L.cx + lx * c + lz * sn, z = L.cz - lx * sn + lz * c;
      const nr = net.nearestRoad(x, z, 20);
      if (nr && nr.d < nr.road.T.hw + nr.road.T.sidewalk + 0.6) continue;
      C.set(bushCols[R() < 0.7 ? Math.floor(R() * 3) : 3 + Math.floor(R() * 3)]);
      bushes.add(mtx(x, terr.heightAt(x, z) - 0.1, z, R() * 6, 0.7 + R() * 0.5), C);
    }
  }
  trunks.build(group); canopies.build(group); palms.build(group); bushes.build(group);

  /* lamps (+ glowing pools at night) */
  const lg = lampGeometry();
  const poles = new Chunked(lg.pole, vmat);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xffd58a, emissiveIntensity: 0 });
  const heads = new Chunked(lg.head, headMat, { cast: false });
  const poolTex = canvasTexture(64, 64, (g) => { const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32); grd.addColorStop(0, 'rgba(255,214,140,0.9)'); grd.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = grd; g.fillRect(0, 0, 64, 64); });
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -8 });
  const poolGeo = new THREE.PlaneGeometry(1, 1); poolGeo.rotateX(-Math.PI / 2);
  const pools = new Chunked(poolGeo, poolMat, { cast: false, receive: false });
  let nl = 0;
  for (const l of roads.lampSites) {
    if (l.kind === 'deck') {
      poles.add(mtx(l.x, l.h, l.z, l.dir, 1.25)); heads.add(mtx(l.x, l.h, l.z, l.dir, 1.25));
      heads.add(mtx(l.x, l.h, l.z, l.dir + Math.PI, 1.25));
      pools.add(mtx(l.x + Math.sin(l.dir + Math.PI / 2) * 0, l.h + 0.05, l.z, 0, 16));
      nl++; continue;
    }
    if (R() > Math.max(0.55, density)) continue;
    poles.add(mtx(l.x, l.h, l.z, l.dir)); heads.add(mtx(l.x, l.h, l.z, l.dir));
    if (l.kind === 'twin') heads.add(mtx(l.x, l.h, l.z, l.dir + Math.PI));
    pools.add(mtx(l.x + Math.sin(l.dir) * 1.2, l.h + 0.03, l.z + Math.cos(l.dir) * 1.2, 0, 13));
    colliders.post(l.x, l.z, 0.18, l.h - 1, l.h + 7);
    nl++;
  }
  poles.build(group); heads.build(group); pools.build(group);

  /* parked vehicles (left-hand traffic: cars face +s on the +lat side) */
  const kinds = [
    { geo: taxiGeometry(), w: 0.42, r: 1.0, len: 3.8 },
    { geo: autoGeometry(), w: 0.22, r: 0.8, len: 2.6 },
    { geo: carGeometry(), w: 0.26, r: 1.0, len: 3.6, tint: [0xf26d5b, 0x6fc2e8, 0xf7d154, 0x9ad17f, 0xf2f0ea, 0xb99ce0] },
    { geo: busGeometry(), w: 0.1, r: 1.4, len: 10.4 },
  ];
  const vMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05 });
  const vehBuckets = kinds.map(k => new Chunked(k.geo, k.tint ? vMat.clone() : vMat));
  vehBuckets.forEach((b, i) => { if (kinds[i].tint) b.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, color: 0xffffff }); });
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
          const lat = side * (r.T.hw - (ki === 3 ? 1.6 : 1.25));
          const x = r.x[i] + r.tz[i] * lat, z = r.z[i] - r.tx[i] * lat;
          const ry = Math.atan2(r.tx[i], r.tz[i]) + (side > 0 ? 0 : Math.PI);
          const m = mtx(x, r.h[i], z, ry);
          if (K.tint) vehBuckets[ki].add(m, C.set(K.tint[Math.floor(R() * K.tint.length)]));
          else vehBuckets[ki].add(m);
          for (const off of [-K.len * 0.3, K.len * 0.3]) colliders.post(x + r.tx[i] * off, z + r.tz[i] * off, K.r, r.h[i] - 1, r.h[i] + (ki === 3 ? 4.5 : 1.8), 'vehicle');
          nv++;
        }
        s += K.len + 6 + R() * 26;
      }
    }
  }
  vehBuckets.forEach(b => b.build(group));

  /* tetrapods along sea walls */
  const tetra = new Chunked(tetrapodGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
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
  const boats = new THREE.InstancedMesh(boatGeo, vMat, Math.max(1, boatList.length));
  boats.count = boatList.length; boats.castShadow = true;
  group.add(boats);

  /* distance culling: small props vanish into the haze anyway */
  const cullables = group.children.filter(m => m.isInstancedMesh && m !== boats);
  const farSq = (quality.key === 'low' ? 420 : quality.key === 'medium' ? 650 : 900) ** 2;
  let cullT = 0;
  function cull(cam) {
    if ((cullT = (cullT + 1) % 10) !== 0) return;
    for (const m of cullables) { const c = m.boundingSphere.center, r = m.boundingSphere.radius; const dx = c.x - cam.position.x, dz = c.z - cam.position.z; m.visible = dx * dx + dz * dz < farSq + r * r + 2 * r * Math.sqrt(farSq) || cam.position.y > 300; }
  }
  scene.add(group);
  const setNight = v => { headMat.emissiveIntensity = v * 3; poolMat.opacity = v; };
  setNight(atmo.night.value);
  return {
    group, counts: { trees: nTrees, lamps: nl, vehicles: nv, boats: boatList.length }, setNight,
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
