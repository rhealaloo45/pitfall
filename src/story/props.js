/* Ready-made low-poly props for the drive, from CC0 packs (Quaternius and KayKit, via Poly Pizza): parked
   cars and taxis, street lights, benches, bins, a hydrant, cones round a pothole; on Marine Drive, benches
   and boats on the bay. They come packed in one compressed file (assets/models/street-kit.glb,
   one scene per model) and are re-materialled with the scene's own ink()-aware materials, so they join the
   black-and-white opening and the night lighting like everything else. See ASSETS.md for the sources. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ink, mergeByMaterial, LINES } from './world.js?v=61';
import { along, LENGTH } from './marine.js?v=61';

/* how big each model should be, and which way it faces (radians to turn it so its front points along +z) */
const SPEC = {
  car_white: { s: 1.27, f: 0 }, car_blue: { s: 1.0, f: 0 }, car_suv: { s: 1.06, f: 0 }, car_hatch: { s: 4.6, f: 0 }, taxi: { s: 4.4, f: 0 }, truck: { s: 1.25, f: 0 },
  streetlight: { s: 1.0 }, streetlight2: { s: 1.0 }, trash: { s: 0.5 }, bin: { s: 0.52 }, hydrant: { s: 1.0 }, bench: { s: 2.7 },
  cone: { s: 1.1 }, barrel: { s: 1.35 }, barrier: { s: 1.0 }, sailboat: { s: 8 }, rowboat: { s: 0.62 }, palm: { s: 3.4 },
};

/** Quantized attributes (int16/int8) become plain floats, so the geometry can be merged and transformed. */
function toFloat(geo) {
  for (const [k, a] of Object.entries(geo.attributes)) {
    if (a.array instanceof Float32Array && !a.isInterleavedBufferAttribute) continue;
    const n = a.count, size = a.itemSize, out = new Float32Array(n * size), get = ['getX', 'getY', 'getZ', 'getW'];
    for (let i = 0; i < n; i++) for (let c = 0; c < size; c++) out[i * size + c] = a[get[c]](i);
    geo.setAttribute(k, new THREE.BufferAttribute(out, size));
  }
}

export async function loadKit(url) {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
  const mats = new Map();
  const remat = (m, isLight) => {
    const key = m.uuid + (isLight ? ':lamp' : '');
    if (!mats.has(key)) {
      // a street light's bulb is warm white, whatever the pack called it; on cars, headlights warm, tail lights red
      const name = m.name || '', lamp = /head|^light$/i.test(name) || (isLight && /light/i.test(name)), tail = !isLight && /tail|brake/i.test(name);
      const s = ink(new THREE.MeshStandardMaterial({
        color: m.color, map: m.map || null, side: m.side, roughness: Math.max(0.45, m.roughness ?? 0.8), metalness: Math.min(0.25, m.metalness ?? 0),
        emissive: lamp ? 0xfff0d0 : tail ? 0xff2a1a : 0x000000, emissiveIntensity: lamp ? 1.4 : tail ? 1.1 : 0,
      }));
      mats.set(key, s);
    }
    return mats.get(key);
  };
  const kit = {};
  for (const scene of gltf.scenes) {
    const isLight = scene.name.startsWith('streetlight');
    scene.traverse(o => { if (o.isMesh) { o.userData.noEdges = true; toFloat(o.geometry); o.material = Array.isArray(o.material) ? o.material.map(m => remat(m, isLight)) : remat(o.material, isLight); } });
    // wrap so scale and facing live on the wrapper, and each clone is placed with one position and heading
    const spec = SPEC[scene.name] || { s: 1 }, inner = new THREE.Group(), wrap = new THREE.Group();
    inner.add(...scene.children); inner.scale.setScalar(spec.s); inner.rotation.y = spec.f || 0; wrap.add(inner);
    mergeByMaterial(wrap); wrap.remove(inner);   // one mesh per material, so each copy is one or two draws, not a dozen
    kit[scene.name] = wrap;
  }
  return kit;
}
const put = (kit, name, x, z, heading = 0, y = 0) => { const o = kit[name].clone(); o.position.set(x, y, z); o.rotation.y = heading; o.userData.kit = name; return o; };
/** Outline edges of a model, worked out once, in the model's own space. */
const EDGES = new Map();
function edgesOf(kit, name) {
  if (!EDGES.has(name)) {
    const w = kit[name], pts = []; w.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(w.matrixWorld).invert(), m = new THREE.Matrix4(), v = new THREE.Vector3();
    w.traverse(o => {
      if (!o.isMesh) return;
      m.multiplyMatrices(inv, o.matrixWorld);
      const e = new THREE.EdgesGeometry(o.geometry, 35).attributes.position;
      for (let i = 0; i < e.count; i++) { v.fromBufferAttribute(e, i).applyMatrix4(m); pts.push(v.x, v.y, v.z); }
    });
    EDGES.set(name, new Float32Array(pts));
  }
  return EDGES.get(name);
}
/** One set of line-art edges for every placed copy in a group (instead of tracing each merged mesh). */
function stampEdges(kit, group) {
  const v = new THREE.Vector3(), copies = group.children.filter(o => o.userData.kit);
  const out = new Float32Array(copies.reduce((n, o) => n + edgesOf(kit, o.userData.kit).length, 0));
  group.updateMatrixWorld(true);
  let j = 0;
  for (const o of copies) {
    const e = edgesOf(kit, o.userData.kit);
    for (let i = 0; i < e.length; i += 3) { v.set(e[i], e[i + 1], e[i + 2]).applyMatrix4(o.matrix); out[j++] = v.x; out[j++] = v.y; out[j++] = v.z; }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(out, 3));
  const l = new THREE.LineSegments(g, LINES); l.userData.edge = true; l.frustumCulled = false;
  return l;
}

/* ---------- the street ---------- */
const clear = (z, zones) => !zones.some(([a, b]) => z > a && z < b);
export function streetProps(street, kit) {
  const G = new THREE.Group(); G.name = 'street-props';
  // parked cars along both kerbs, kept off the potholes, the herd, the crossing, the start and my building
  // the camera often rides on the far side of the road (x < 0), so that side stays clear wherever it passes
  const camPath = [[-40, 30], [108, 206], [208, 290]];
  const right = [[-20, 18], [78, 90], [178, 212], [236, 260], [290, 400]], left = [[-40, 284]];
  const cars = ['taxi', 'car_hatch', 'taxi', 'car_white', 'taxi', 'car_hatch', 'taxi', 'car_blue', 'taxi', 'car_suv'];
  let i = 0;
  for (const [sx, zones, from, to] of [[1, right, 18, 300], [-1, left, -24, 342]]) {
    for (let z = from; z < to; z += 34 + ((i * 7) % 17)) {   // a few, well spaced
      if (!clear(z, zones)) { i++; continue; }
      const name = sx < 0 && i % 9 === 4 ? 'truck' : cars[i % cars.length];
      G.add(put(kit, name, sx * 4.7, z, sx > 0 ? 0 : Math.PI));
      i++;
    }
  }
  // street lights at the kerb between the trees, arms out over the road; benches, bins and a hydrant on the pavement
  for (let z = 12; z < 336; z += 22) for (const sx of [-1, 1]) {
    const lz = z + (sx > 0 ? 0 : 11);
    if (sx > 0 ? z > 276 || (z > 236 && z < 252) : !clear(lz, camPath)) continue;
    G.add(put(kit, (z / 22) % 2 ? 'streetlight' : 'streetlight2', sx * 6.6, z + (sx > 0 ? 0 : 11), sx > 0 ? -Math.PI / 2 : Math.PI / 2));
  }
  for (const [sx, z] of [[1, 34], [-1, 58], [1, 138], [-1, 96], [1, 226], [-1, 300], [1, 160], [1, 104]]) {
    G.add(put(kit, 'bench', sx * 8.7, z, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 0.16), put(kit, z % 2 ? 'trash' : 'bin', sx * 8.8, z + 1.6, 0, 0.16));
  }
  for (const [sx, z] of [[1, 47], [-1, 80], [1, 152], [-1, 320], [1, 284]]) G.add(put(kit, 'hydrant', sx * 6.45, z, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 0.16));
  // road works round the pothole by the kerb: cones, a barrel and a barrier (RoadHawk would have flagged it)
  for (const [x, z] of [[3.15, 80.6], [3.05, 82.4], [3.1, 84.4], [3.35, 86.2]]) G.add(put(kit, 'cone', x, z));
  G.add(put(kit, 'barrel', 5.2, 79.4), put(kit, 'barrier', 5.15, 86.8, Math.PI / 2));
  const lines = stampEdges(kit, G);
  mergeByMaterial(G);
  G.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
  G.add(lines); street.add(G);
  // two cars waiting at the red light on the far side of the crossing; they pull away on green
  const waiting = [put(kit, 'taxi', -2.3, 255.5, Math.PI), put(kit, 'car_hatch', -2.2, 261.5, Math.PI)];
  for (const c of waiting) { c.userData.z0 = c.position.z; c.traverse(o => { o.userData.moving = true; }); street.add(c); }
  return { update(go) { waiting.forEach((c, k) => { c.position.z = c.userData.z0 - Math.max(0, go - k * 0.2) ** 2 * 60; }); } };
}

/* ---------- Marine Drive: benches facing the bay, and boats on it ---------- */
export function marineProps(marine, kit) {
  const G = new THREE.Group(); G.name = 'marine-props';
  for (let s = 40; s < LENGTH - 20; s += 34) { const a = along(s, -10.6); G.add(put(kit, 'bench', a.p.x, a.p.z, a.heading + Math.PI / 2, 0.18)); }
  // boats out on the bay, each with a lantern; far enough out that they can sit still, merged with the benches
  const lanternM = ink(new THREE.MeshBasicMaterial({ color: 0xffd28a, toneMapped: false })), bulb = new THREE.SphereGeometry(0.14, 8, 6);
  [[90, -70, 'sailboat'], [210, -140, 'rowboat'], [330, -55, 'rowboat'], [460, -190, 'sailboat'], [600, -95, 'rowboat'], [720, -60, 'sailboat']].forEach(([s, off, name], k) => {
    const a = along(s, off), b = put(kit, name, a.p.x, a.p.z, a.heading + k * 1.3, -0.05);
    const lantern = new THREE.Mesh(bulb, lanternM); lantern.position.set(0, name === 'sailboat' ? 2.2 : 1.1, 0); b.add(lantern); G.add(b);
  });
  mergeByMaterial(G); marine.add(G);
}
