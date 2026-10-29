/* Marine Drive at night, where the drive goes after my room (and where the car cruises behind the rest of
   the page): the road curves along the bay, the promenade and its sea wall on the inside, the Queen's
   Necklace of lamps, Art Deco fronts and palms on the outside, Nariman Point's towers at the far end.
   Night-only, so nothing here needs line-art outlines. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ink } from './world.js?v=32';

const mat = (color, o = {}) => ink(new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o }));
// the centre line, continuing the straight street from z = 345 and curving round the bay (towards −x)
export const CURVE = new THREE.CatmullRomCurve3([V(0, 345), V(0, 420), V(-14, 520), V(-52, 620), V(-110, 710), V(-185, 780), V(-270, 830), V(-360, 858)], false, 'centripetal');
function V(x, z) { return new THREE.Vector3(x, 0, z); }
const P3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const LENGTH = CURVE.getLength();

/** A point and frame along the curve, `off` metres to the outer (+side) of the centre line. */
const _t = new THREE.Vector3();
export function along(s, off = 0, out = new THREE.Vector3()) {
  const u = Math.min(1, Math.max(0, s / LENGTH));
  CURVE.getPointAt(u, out); CURVE.getTangentAt(u, _t);
  out.x += _t.z * off; out.z -= _t.x * off;
  return { p: out, heading: Math.atan2(_t.x, _t.z), tx: _t.x, tz: _t.z };
}
/** A flat (or vertical, if y1 given) strip following the curve between two offsets. */
function ribbon(o0, o1, y0, n = 160, y1 = null) {
  const pos = [], idx = [], a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const s = i / n * LENGTH;
    along(s, o0, a); along(s, y1 == null ? o1 : o0, b);
    pos.push(a.x, y0, a.z, b.x, y1 == null ? y0 : y1, b.z);
    if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const flip = y1 == null ? g.attributes.normal.getY(0) < 0 : g.attributes.normal.getX(0) * Math.cos(along(0).heading) - g.attributes.normal.getZ(0) * Math.sin(along(0).heading) > 0;
  if (flip) { for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]; g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,236,200,1)'); r.addColorStop(0.25, 'rgba(255,200,120,.55)'); r.addColorStop(1, 'rgba(255,170,80,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildMarineDrive(scene, facadeMat) {
  const G = new THREE.Group(); G.name = 'marine'; scene.add(G);
  // ground under the straight street, so the sea never shows through its gaps
  const land = new THREE.Mesh(new THREE.PlaneGeometry(140, 400), mat(0x2a2b2e)); land.rotation.x = -Math.PI / 2; land.position.set(0, -0.02, 150); G.add(land);
  // the bay
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), mat(0x0a1826, { roughness: 0.32, metalness: 0.1, envMapIntensity: 0.15 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(-500, -0.9, 700); G.add(sea);
  // road, kerbs, promenade, sea wall, the land behind the buildings
  G.add(new THREE.Mesh(ribbon(-7, 7, 0.005), mat(0x2c2f34, { roughness: 0.95 })));
  G.add(new THREE.Mesh(ribbon(-7.4, -12.6, 0.18), mat(0xb4aa98)));                         // promenade
  G.add(new THREE.Mesh(ribbon(-7.0, -7.4, 0.2), mat(0xe8e1d2)));                           // kerb
  G.add(new THREE.Mesh(ribbon(-12.6, -12.9, 0.55), mat(0xcfc6b5)));                        // parapet top
  G.add(new THREE.Mesh(ribbon(-12.9, 0, 0.55, 160, -1.2), mat(0x8f877a)));                 // sea wall face
  G.add(new THREE.Mesh(ribbon(7, 80, 0.12), mat(0x8e877b)));                               // pavement + land
  const paint = mat(0xf2efe6, { roughness: 0.7 }), dashes = [];
  for (let s = 6; s < LENGTH; s += 9) { const a = along(s, 0); dashes.push(new THREE.BoxGeometry(0.16, 0.02, 4.2).rotateY(a.heading).translate(a.p.x, 0.012, a.p.z)); }
  G.add(new THREE.Mesh(mergeGeometries(dashes), paint));
  // tetrapods at the foot of the wall
  const tp = mergeGeometries([0, 1, 2, 3].map(k => new THREE.ConeGeometry(0.45, 1.3, 6).translate(0, 0.65, 0).rotateX(k ? 1.9 : 0).rotateY(k * 2.09)));
  const tetra = new THREE.InstancedMesh(tp, mat(0x9b9488, { flatShading: true }), 140), M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < 140; i++) { const a = along(i / 140 * LENGTH, -14 - (i % 3) * 1.1); e.set(i * 0.7, i * 1.3, i * 0.4); M.compose(P3(a.p.x, -0.95, a.p.z), q.setFromEuler(e), new THREE.Vector3(1, 1, 1)); tetra.setMatrixAt(i, M); }
  G.add(tetra);
  // the Queen's Necklace: lamps along the promenade, their glow, and its reflection in the bay
  const lampsAt = [];
  for (let s = 6; s < LENGTH; s += 10) lampsAt.push(along(s, -8.3, new THREE.Vector3()));
  const poleG = mergeGeometries([new THREE.CylinderGeometry(0.07, 0.1, 6.5, 6).translate(0, 3.25, 0), new THREE.BoxGeometry(0.08, 0.08, 1.2).translate(0, 6.4, 0.55)]);
  const poles = new THREE.InstancedMesh(poleG, mat(0x3a3d42, { metalness: 0.5, roughness: 0.5 }), lampsAt.length);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.24, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe2b0, toneMapped: false }), lampsAt.length);
  const glowPos = [], refl = [];
  lampsAt.forEach((a, i) => {
    q.setFromAxisAngle(P3(0, 1, 0), a.heading + Math.PI / 2);
    M.compose(P3(a.p.x, 0.18, a.p.z), q, new THREE.Vector3(1, 1, 1)); poles.setMatrixAt(i, M);
    const bx = a.p.x + Math.cos(a.heading) * 1.1, bz = a.p.z - Math.sin(a.heading) * 1.1;
    M.compose(P3(bx, 6.3, bz), q, new THREE.Vector3(1, 1, 1)); bulbs.setMatrixAt(i, M);
    glowPos.push(bx, 6.3, bz); refl.push(bx - 3.2 * Math.cos(a.heading), -0.86, bz + 3.2 * Math.sin(a.heading));
  });
  G.add(poles, bulbs);
  const gt = glowTexture();
  const glow = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(glowPos, 3)),
    new THREE.PointsMaterial({ map: gt, size: 12, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffd39a }));
  const reflection = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(refl, 3)),
    new THREE.PointsMaterial({ map: gt, size: 16, sizeAttenuation: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffb76a }));
  G.add(glow, reflection);
  // Art Deco fronts on the outside of the curve: pastel blocks, a rounded corner, a central fin
  const pastels = [0xefe3c8, 0xe8c4b8, 0xcfe0cf, 0xf0dca0, 0xdcd3e8, 0xf3d9c4];
  let k = 0;
  for (let s = 20; s < LENGTH - 30; s += 24, k++) {
    const a = along(s, 18), w = 20, d = 12, h = 13 + (k * 5) % 9;
    const b = new THREE.Group(); b.position.copy(a.p); b.rotation.y = a.heading;
    const m = facadeMat(pastels[k % pastels.length], 3 + k, w, h);
    const body = new THREE.Mesh(new THREE.BoxGeometry(d, h, w - 3), m); body.position.set(0, h / 2, 0);
    const corner = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, h, 18, 1, false, 0, Math.PI), m); corner.position.set(-d / 2 + 3, h / 2, (w - 3) / 2); corner.rotation.y = -Math.PI / 2;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(1.2, h + 3.5, 1.6), mat(pastels[(k + 2) % pastels.length])); fin.position.set(-d / 2 - 0.3, (h + 3.5) / 2, 0);
    const band = mat(0xfaf6ee);
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(d + 0.3, 0.35, w - 2.6), band); b1.position.set(0, h * 0.34, 0);
    const b2 = b1.clone(); b2.position.y = h * 0.67;
    b.add(body, corner, fin, b1, b2);
    G.add(b);
  }
  // palms along the outer pavement
  const trunkG = new THREE.CylinderGeometry(0.16, 0.26, 7, 7).translate(0, 3.5, 0).rotateZ(0.06);
  const frondG = mergeGeometries([...Array(8)].map((_, i) => new THREE.ConeGeometry(0.5, 3.4, 4).scale(1, 1, 0.22).rotateZ(Math.PI / 2 + 0.35).translate(1.6, 0, 0).rotateY(i / 8 * Math.PI * 2).translate(0.42, 7, 0)));
  const nP = 40, trunks = new THREE.InstancedMesh(trunkG, mat(0x7a6249), nP), fronds = new THREE.InstancedMesh(frondG, mat(0x2f5a32, { flatShading: true }), nP);
  for (let i = 0; i < nP; i++) {
    const a = along(14 + i / nP * (LENGTH - 30), 8.8);
    q.setFromAxisAngle(P3(0, 1, 0), i * 1.7);
    M.compose(P3(a.p.x, 0.12, a.p.z), q, new THREE.Vector3(1, 0.9 + (i % 3) * 0.08, 1)); trunks.setMatrixAt(i, M); fronds.setMatrixAt(i, M);
  }
  G.add(trunks, fronds);
  // Nariman Point at the far end: a cluster of tall towers with lit windows
  for (let i = 0; i < 7; i++) {
    const h = 34 + (i * 11) % 30, a = along(LENGTH - 20 + (i % 3) * 8, 24 + i * 9);
    const t = new THREE.Mesh(new THREE.BoxGeometry(12, h, 12), facadeMat(0xc9cfd6, 40 + i, 12, h)); t.position.set(a.p.x, h / 2, a.p.z + i * 6);
    G.add(t);
  }
  G.traverse(o => { o.userData.noEdges = true; });
  return G;
}
