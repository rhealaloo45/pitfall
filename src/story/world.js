/* The landing-page story world: one street the car drives down, past the problems each project
   solves — potholes (RoadHawk), cows (the cattle app), people at a crossing (ADHD / mental-fitness
   models) — to a building whose lit window is my room: a desk, a laptop (chub-guard, then the log
   attack). Small, flat-shaded and built in code so it renders at 60 fps on ordinary laptops.

   Coordinates: the road runs along +Z, centred on x = 0; the car drives in the lane at x = +2.2.
   Every material goes through ink(): a shared uniform blends the whole scene to white-on-black line art. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const INK = { value: 1 };          // 1 = black-and-white line art, 0 = full colour
export const LINES = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false });
const DARK = new THREE.Color(0x030405);

/** Patch a material so INK blends it to black (the fill behind the white edges). */
export function ink(m) {
  if (m.userData.inked) return m;
  m.userData.inked = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uInk = INK;
    sh.fragmentShader = 'uniform float uInk;\n' + sh.fragmentShader.replace('#include <dithering_fragment>',
      '#include <dithering_fragment>\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.012, 0.014, 0.018), uInk);');
  };
  m.customProgramCacheKey = () => 'ink' + (m.type || '');
  return m;
}
const mat = (color, o = {}) => ink(new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o }));
/** White outline edges for every mesh under root (shown while INK is up). Static groups get all their
    edges baked into one line object; moving ones (the car) keep an outline per part. */
export function outline(root, angle = 30, { bake = true } = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), M = new THREE.Matrix4(), pts = [], v = new THREE.Vector3();
  const meshes = [];
  root.traverse(o => { if (o.isMesh && !o.isInstancedMesh && !o.userData.noEdges && !o.userData.moving && o.geometry) meshes.push(o); });
  for (const o of meshes) {
    const eg = new THREE.EdgesGeometry(o.geometry, angle);
    if (!bake) { const e = new THREE.LineSegments(eg, LINES); e.userData.edge = true; o.add(e); continue; }
    M.multiplyMatrices(inv, o.matrixWorld);
    const a = eg.attributes.position.array;
    for (let k = 0; k < a.length; k += 3) { v.set(a[k], a[k + 1], a[k + 2]).applyMatrix4(M); pts.push(v.x, v.y, v.z); }
    eg.dispose();
  }
  if (bake && pts.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const l = new THREE.LineSegments(g, LINES); l.userData.edge = true; l.frustumCulled = false; root.add(l);
  }
}
/** Merge a static group's meshes by material (fewer draw calls, also in the shadow pass). */
export function mergeByMaterial(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), buckets = new Map(), drop = [];
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.keep || Array.isArray(o.material)) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const b = buckets.get(o.material) || { geos: [], cast: false, recv: false, noEdges: o.userData.noEdges };
    b.geos.push(g); b.cast ||= o.castShadow; b.recv ||= o.receiveShadow; buckets.set(o.material, b); drop.push(o);
  });
  for (const o of drop) o.parent.remove(o);
  for (const [m, b] of buckets) {
    const mesh = new THREE.Mesh(mergeGeometries(b.geos), m); mesh.castShadow = b.cast; mesh.receiveShadow = b.recv; mesh.userData.noEdges = b.noEdges;
    root.add(mesh);
  }
}
/** Static from here on: matrices are computed once, not every frame. */
export function freeze(root) {
  root.updateMatrixWorld(true);
  root.traverse(o => { if (!o.userData.moving) { o.matrixAutoUpdate = false; } });
}
const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); return b; };

/* ---------------- textures ---------------- */
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
/** Window grid for a facade: albedo (calm by day) and an emissive map with only the lit windows (night). */
function windowsTex(seed) {
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const lit = [];
  for (let y = 10; y < 248; y += 22) for (let x = 10; x < 120; x += 24) lit.push([x, y, r() < 0.45]);
  const map = canvasTex(128, 256, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); for (const [x, y] of lit) { g.fillStyle = '#c3cad2'; g.fillRect(x, y, 14, 13); } });
  const glow = canvasTex(128, 256, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); for (const [x, y, on] of lit) if (on) { g.fillStyle = '#ffcf8a'; g.fillRect(x, y, 14, 13); } });
  return { map, glow };
}
export const NIGHT = { mats: [] };   // facade materials whose windows light up after dark

const WINDOW_SETS = [];
function facadeMat(tint, seed, w, h) {
  if (!WINDOW_SETS.length) for (let i = 0; i < 5; i++) WINDOW_SETS.push(windowsTex(11 + i * 7));
  const set = WINDOW_SETS[seed % WINDOW_SETS.length];
  const map = set.map.clone(), glow = set.glow.clone();   // clones share the image: one upload each
  for (const t of [map, glow]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / 6, h / 9); t.needsUpdate = true; }
  const m = mat(tint, { map, emissiveMap: glow, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.9 });
  NIGHT.mats.push(m);
  return m;
}
/** The window grid of a street-facing facade as lines, so the line art has detail. */
function windowLines(x, z0, w, h) {
  const pts = [];
  for (let y = 1.4; y < h - 1; y += 2.6) for (let z = z0 + 1.2; z < z0 + w - 1.2; z += 2.4) {
    const a = [x, y, z], b = [x, y, z + 1.2], c = [x, y + 1.3, z + 1.2], d = [x, y + 1.3, z];
    pts.push(...a, ...b, ...b, ...c, ...c, ...d, ...d, ...a);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const l = new THREE.LineSegments(g, LINES); l.userData.edge = true;
  return l;
}

/* ---------------- the street ---------------- */
export function buildStreet(scene) {
  const G = new THREE.Group(); G.name = 'street'; scene.add(G);
  const L = 420;
  const asphalt = mat(0x2c2f34, { roughness: 0.95 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(12, L), asphalt);
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0, L / 2 - 30); road.receiveShadow = true; road.userData.noEdges = true;
  G.add(road);
  // lane paint: centre dashes and edge lines
  const paint = mat(0xf2efe6, { roughness: 0.7 });
  const dashes = []; for (let z = -30; z < L - 30; z += 9) dashes.push(new THREE.BoxGeometry(0.16, 0.02, 4.2).translate(0, 0.01, z));
  const dm = new THREE.Mesh(mergeGeometries(dashes), paint); dm.userData.noEdges = true; G.add(dm);
  for (const x of [-5.6, 5.6]) { const e = box(0.14, 0.02, L, paint, x, 0.01, L / 2 - 30); e.userData.noEdges = true; G.add(e); }
  // pavements + kerbs
  const pave = mat(0xb9b4aa), kerb = mat(0xe4ded2);
  for (const sx of [-1, 1]) {
    G.add(box(3.4, 0.16, L, pave, sx * 7.7, 0.08, L / 2 - 30));
    G.add(box(0.3, 0.2, L, kerb, sx * 6.05, 0.1, L / 2 - 30));
  }
  // buildings either side: plain massing with window grids, a few heights and tints
  const tints = [0xe9e3d8, 0xd7dde4, 0xe6d3c3, 0xcfd6cc, 0xded7e6];
  let k = 0;
  for (const sx of [-1, 1]) {
    for (let z = -40; z < 395; ) {
      const w = 10 + ((k * 7) % 9), h = 7 + ((k * 13) % 12), d = 9 + ((k * 5) % 6);
      if (sx > 0 && z + w > 312 && z < 346) { z = 346; continue; }   // leave room for my building
      const m = facadeMat(tints[k % tints.length], 11 + k, w, h);
      const b = box(d, h, w, m, sx * (9.6 + d / 2), h / 2, z + w / 2);
      b.receiveShadow = true;
      G.add(b, windowLines(sx * 9.58, z, w, h));
      z += w + 1.5; k++;
    }
  }
  // trees on the pavement
  const trunk = mat(0x6b5240), leaf = mat(0x5f8f4e, { flatShading: true });
  const trG = new THREE.CylinderGeometry(0.14, 0.2, 2.4, 6).translate(0, 1.2, 0), crG = new THREE.IcosahedronGeometry(1.6, 1).scale(1, 0.9, 1).translate(0, 3.3, 0);
  const spots = [];
  for (let z = 6; z < 380; z += 17) for (const sx of [-1, 1]) if (!(z > 225 && z < 262)) spots.push([sx * 7.4, 0.16, z + (sx > 0 ? 8 : 0)]);   // keep the crossing clear
  const trI = new THREE.InstancedMesh(trG, trunk, spots.length), crI = new THREE.InstancedMesh(crG, leaf, spots.length);
  const M4 = new THREE.Matrix4(), edgePts = [], eT = new THREE.EdgesGeometry(trG, 30).attributes.position.array, eC = new THREE.EdgesGeometry(crG, 30).attributes.position.array;
  spots.forEach(([x, y, z], i) => {
    M4.makeTranslation(x, y, z); trI.setMatrixAt(i, M4); crI.setMatrixAt(i, M4);
    for (const e of [eT, eC]) for (let k = 0; k < e.length; k += 3) edgePts.push(e[k] + x, e[k + 1] + y, e[k + 2] + z);
  });
  trI.castShadow = crI.castShadow = true; trI.userData.noEdges = crI.userData.noEdges = true;
  const tl = new THREE.BufferGeometry(); tl.setAttribute('position', new THREE.Float32BufferAttribute(edgePts, 3));
  const treeLines = new THREE.LineSegments(tl, LINES); treeLines.userData.edge = true;
  G.add(trI, crI, treeLines);
  return G;
}

/* ---------------- potholes (RoadHawk) ---------------- */
export function buildPotholes(scene) {
  const holes = [];
  const pit = mat(0x101318, { roughness: 0.25, metalness: 0.2 }), rim = mat(0x8a8c8f, { roughness: 1 });
  const spots = [[2.6, 44, 0.8], [0.9, 53, 0.55], [3.4, 61, 0.95], [-2.6, 66, 0.7], [2.0, 74, 0.6], [4.1, 83, 0.75], [1.2, 92, 0.85], [-1.4, 99, 0.6]];
  spots.forEach(([x, z, r0], i) => {
    const r = r0 * 1.25;
    const shape = (rr, jitter) => {
      const pts = [];
      for (let a = 0; a < 14; a++) { const t = a / 14 * Math.PI * 2, j = 1 + Math.sin(t * 3 + i) * jitter + Math.cos(t * 5 + i * 2) * jitter * 0.6; pts.push(new THREE.Vector2(Math.cos(t) * rr * j * 1.3, Math.sin(t) * rr * j)); }
      return new THREE.ShapeGeometry(new THREE.Shape(pts));
    };
    const g = new THREE.Group();
    const a = new THREE.Mesh(shape(r * 1.18, 0.16), rim), b = new THREE.Mesh(shape(r, 0.2), pit);
    a.rotation.x = b.rotation.x = -Math.PI / 2; a.position.y = 0.012; b.position.y = 0.016;
    g.add(a, b); g.position.set(x, 0, z); g.rotation.y = i * 1.3;
    scene.add(g);
    holes.push({ obj: g, size: new THREE.Vector3(r * 3, 0.3, r * 2.4) });
  });
  return holes;
}

/* ---------------- cows (cattle app) — zebu with the hump ---------------- */
function cow(coat, patch) {
  const c = new THREE.Group();
  const C = mat(coat, { flatShading: true }), P = mat(patch, { flatShading: true }), H = mat(0xd8cdb8), D = mat(0x2a2522);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.3, 4, 10), C); body.rotation.z = Math.PI / 2; body.rotation.y = Math.PI / 2; body.position.y = 1.2; body.scale.set(1, 1, 0.95);
  const hump = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), C); hump.position.set(0, 1.78, 0.55);
  const spot = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), P); spot.position.set(0.32, 1.35, -0.3); spot.scale.set(0.45, 0.9, 1.2);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 0.6, 8), C); neck.position.set(0, 1.45, 1.05); neck.rotation.x = 0.9;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.62), C); head.position.set(0, 1.55, 1.38); head.rotation.x = 0.35;
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.26, 0.24), H); snout.position.set(0, 1.4, 1.68); snout.rotation.x = 0.35;
  c.add(body, hump, spot, neck, head, snout);
  for (const sx of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 6), H); horn.position.set(sx * 0.17, 1.86, 1.3); horn.rotation.z = -sx * 0.5;
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.12), C); ear.position.set(sx * 0.3, 1.66, 1.28); ear.rotation.z = sx * 0.3;
    c.add(horn, ear);
    for (const z of [-0.6, 0.62]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.95, 6), C); leg.position.set(sx * 0.27, 0.48, z);
      const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.1, 6), D); hoof.position.set(sx * 0.27, 0.05, z);
      c.add(leg, hoof);
    }
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.9, 5), C); tail.position.set(0, 1.0, -1.12); tail.rotation.x = 0.25;
  c.add(tail);
  c.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return c;
}
export function buildCows(scene) {
  const herd = [];
  const set = [[3.2, 186, -1.9, 0xf1ece2, 0xb9b2a6, 'healthy'], [-0.9, 192, 0.5, 0xd8c7ad, 0x8b6f52, 'healthy'], [4.4, 199, 2.6, 0xeee8dc, 0x9a8d7c, 'check'], [0.4, 204, -0.6, 0xc9b79a, 0x6f5843, 'healthy']];
  for (const [x, z, ry, a, b, tag] of set) {
    const c = cow(a, b); c.position.set(x, 0, z); c.rotation.y = ry; scene.add(c); mergeByMaterial(c);
    herd.push({ obj: c, tag, size: new THREE.Vector3(1.6, 2.1, 3.1) });
  }
  return herd;
}

/* ---------------- the crossing: signal, zebra, people (ADHD / mental fitness) ---------------- */
export function buildCrossing(scene) {
  const G = new THREE.Group(); scene.add(G);
  const white = mat(0xf4f1ea, { roughness: 0.7 });
  for (let x = -5; x <= 5; x += 1.25) { const s = box(0.7, 0.02, 5.2, white, x, 0.012, 249); s.userData.noEdges = false; G.add(s); }
  const stop = box(5.4, 0.02, 0.4, white, 2.9, 0.012, 245.2); G.add(stop);
  // the signal on the car's side
  const metal = mat(0x2d3035, { roughness: 0.5, metalness: 0.4 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 6, 8), metal); pole.position.set(6.4, 3, 244.6);
  const arm = box(3.6, 0.16, 0.16, metal, 4.7, 5.8, 244.6);
  const head = box(0.5, 1.4, 0.45, metal, 3.3, 5.1, 244.6);
  G.add(pole, arm, head);
  const lamp = (hex, y) => { const m = ink(new THREE.MeshStandardMaterial({ color: 0x111111, emissive: hex, emissiveIntensity: 0.05 })); const l = new THREE.Mesh(new THREE.CircleGeometry(0.16, 14), m); l.position.set(3.3, y, 244.36); l.rotation.y = Math.PI; l.userData.noEdges = true; G.add(l); return m; };
  const lights = { red: lamp(0xff2a1a, 5.55), amber: lamp(0xffb020, 5.1), green: lamp(0x2bff7a, 4.65) };
  G.children.forEach(o => { o.userData.keep = true; });   // the signal stays as separate parts
  // people: simple figures, each with a "brain" that lights up when the model looks at them
  const skins = [0x8a5a3c, 0x6b4428, 0xa0704c, 0x7d5034, 0x5e3b24, 0x9a6a46];
  const clothes = [0xe0474c, 0x3f7cd8, 0xf2b630, 0x44a37b, 0x9b59d0, 0xf07f3c];
  const people = [];
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Group();
    const cl = mat(clothes[i]), sk = mat(skins[i]), tr = mat(0x2c3340);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 3, 8), cl); torso.position.y = 1.18;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), sk); head.position.y = 1.72;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(0x1b1512)); hair.position.y = 1.75;
    const legs = [], arms = [];
    for (const sx of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(sx * 0.11, 0.86, 0);
      const lm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.62, 2, 6), tr); lm.position.y = -0.42; leg.add(lm);
      const arm = new THREE.Group(); arm.position.set(sx * 0.3, 1.42, 0);
      const am = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.48, 2, 6), cl); am.position.y = -0.3; arm.add(am);
      p.add(leg, arm); legs.push(leg); arms.push(arm);
    }
    p.add(torso, head, hair);
    p.traverse(o => { if (o.isMesh) o.castShadow = true; o.userData.moving = true; o.userData.keep = true; });
    p.userData.moving = true;
    // brain: a glowing wire icosahedron with neurons
    const brain = new THREE.Group();
    const bw = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.34, 1)), new THREE.LineBasicMaterial({ color: i % 2 ? 0x39d4ff : 0xff5fa8, transparent: true, opacity: 0, depthWrite: false }));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x39d4ff : 0xff5fa8, transparent: true, opacity: 0, depthWrite: false }));
    glow.userData.noEdges = true;
    brain.add(bw, glow); brain.position.y = 1.74; brain.scale.setScalar(0.001);
    for (const o of [brain, bw, glow]) { o.userData.moving = true; o.userData.keep = true; }
    p.add(brain);
    const dir = i % 2 ? 1 : -1;
    p.userData = { moving: true, keep: true, legs, arms, brain, bw, glow, dir, lane: 247.2 + (i % 3) * 1.5, delay: i * 0.12, speed: 0.9 + (i % 3) * 0.12 };
    p.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    G.add(p); people.push({ obj: p, size: new THREE.Vector3(0.7, 1.95, 0.7) });
  }
  return { group: G, lights, people };
}

/* ---------------- my building: a lit window, and the room behind it ---------------- */
export const ROOM = { x0: 9.9, x1: 17.7, y0: 10, y1: 14, z0: 321.8, z1: 336.2, win: { z0: 325, z1: 333, y0: 10.8, y1: 13.4 } };
export function buildRoom(scene, { screenTex, pictureTex }) {
  const G = new THREE.Group(); G.name = 'room'; scene.add(G);
  const R = ROOM, W = R.win;
  const facade = mat(0xe8e1d6, { roughness: 0.9 }), solid = facadeMat(0xe2dace, 77, 22, 30);
  const fx = 9.7;   // facade centre (0.4 thick, its outer face at x = 9.5)
  // building around the room
  G.add(box(14.6, 9.8, 22, solid, 9.5 + 7.3, 4.9, 329));            // floors below
  G.add(box(14.6, 16, 22, solid, 9.5 + 7.3, 14.2 + 8, 329));        // floors above
  G.add(box(14.6, 4.2, 3.8, solid, 9.5 + 7.3, 12, 318 + 1.9));      // beside the room
  G.add(box(14.6, 4.2, 3.8, solid, 9.5 + 7.3, 12, 340 - 1.9));
  G.add(box(6.4, 4.2, 14.4, solid, 17.7 + 3.2, 12, 329));           // behind
  // front wall pieces around the window
  G.add(box(0.4, W.y0 - 9.8, W.z1 - W.z0, facade, fx, (9.8 + W.y0) / 2, (W.z0 + W.z1) / 2));
  G.add(box(0.4, 14.2 - W.y1, W.z1 - W.z0, facade, fx, (W.y1 + 14.2) / 2, (W.z0 + W.z1) / 2));
  G.add(box(0.4, 4.4, W.z0 - 321.8, facade, fx, 12, (321.8 + W.z0) / 2));
  G.add(box(0.4, 4.4, 336.2 - W.z1, facade, fx, 12, (W.z1 + 336.2) / 2));
  // window frame + mullion
  const frame = mat(0x2b2e33, { roughness: 0.4, metalness: 0.3 });
  G.add(box(0.12, 0.1, W.z1 - W.z0, frame, 9.52, W.y0, (W.z0 + W.z1) / 2), box(0.12, 0.1, W.z1 - W.z0, frame, 9.52, W.y1, (W.z0 + W.z1) / 2));
  // inside: warm walls, wooden floor
  const wall = mat(0xe9dfd0, { roughness: 0.95, side: THREE.BackSide }), floor = mat(0x9a6b45, { roughness: 0.7 });
  // the room's inner walls sit a hair inside the building's surfaces so the two never fight for the same pixels
  const shell = new THREE.Mesh(new THREE.BoxGeometry(R.x1 - R.x0 - 0.08, R.y1 - R.y0 - 0.08, R.z1 - R.z0 - 0.08), wall);
  shell.position.set((R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2, (R.z0 + R.z1) / 2); shell.receiveShadow = true; shell.userData.noEdges = true;
  G.add(shell);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(R.x1 - R.x0, R.z1 - R.z0), floor); fl.rotation.x = -Math.PI / 2; fl.position.set((R.x0 + R.x1) / 2, R.y0 + 0.01, (R.z0 + R.z1) / 2); fl.receiveShadow = true;
  G.add(fl);
  // desk against the back wall
  const wood = mat(0xc89b6d, { roughness: 0.6 }), dark = mat(0x2a2d32, { roughness: 0.5 });
  const dz = 329, deskX = 16.7, top = R.y0 + 0.76;
  G.add(box(1.1, 0.06, 3.2, wood, deskX, top - 0.03, dz));
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) G.add(box(0.06, 0.73, 0.06, dark, deskX + sx * 0.48, R.y0 + 0.365, dz + sz * 1.52));
  // laptop: aluminium, no logo; screen faces the window
  const alu = ink(new THREE.MeshPhysicalMaterial({ color: 0xd9dbde, roughness: 0.35, metalness: 0.85, clearcoat: 0.3 }));
  const laptop = new THREE.Group(); laptop.position.set(deskX - 0.1, top, dz);
  const base = box(0.3, 0.018, 0.46, alu, 0, 0.009, 0); laptop.add(base);
  const lid = new THREE.Group(); lid.position.set(0.15, 0.018, 0); lid.rotation.z = -0.32; laptop.add(lid);
  lid.add(box(0.012, 0.3, 0.46, alu, 0.006, 0.15, 0));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.43, 0.27), ink(new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false })));
  scr.position.set(-0.001, 0.152, 0); scr.rotation.y = -Math.PI / 2; scr.userData.noEdges = true; scr.userData.keep = true; lid.add(scr);
  const keys = box(0.2, 0.002, 0.4, dark, -0.02, 0.019, 0); keys.userData.noEdges = true; laptop.add(keys);
  G.add(laptop);
  // lamp, plant, mug, books, chair, picture
  const lampM = mat(0x262a2f, { roughness: 0.4, metalness: 0.5 });
  const lampG = new THREE.Group(); lampG.position.set(deskX + 0.25, top, dz - 1.15);
  lampG.add(box(0.22, 0.03, 0.22, lampM, 0, 0.015, 0));
  const lArm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.55, 6), lampM); lArm.position.set(-0.05, 0.28, 0.05); lArm.rotation.x = 0.25; lampG.add(lArm);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.16, 12, 1, true), ink(new THREE.MeshStandardMaterial({ color: 0x262a2f, emissive: 0xffc58a, emissiveIntensity: 0.6, side: THREE.DoubleSide }))); shade.position.set(-0.12, 0.55, 0.12); shade.rotation.z = 0.6; lampG.add(shade);
  G.add(lampG);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.2, 10), mat(0xe9e6df)); pot.position.set(deskX + 0.2, top + 0.1, dz + 1.2);
  const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), mat(0x4f8c4a, { flatShading: true })); leaves.position.set(deskX + 0.2, top + 0.36, dz + 1.2); leaves.scale.set(1, 1.3, 1);
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 12), mat(0xd94848)); mug.position.set(deskX - 0.25, top + 0.05, dz - 0.55);
  G.add(pot, leaves, mug);
  const bookC = [0x3f6fb5, 0xd9a23c, 0x9b4d6a, 0x4c8c74, 0xe6e0d4];
  bookC.forEach((c, i) => G.add(box(0.2, 0.26 + (i % 2) * 0.05, 0.05, mat(c), deskX + 0.38, top + 0.14, dz + 0.6 + i * 0.06)));
  const chair = new THREE.Group(); chair.position.set(15.7, R.y0, dz + 1.9); chair.rotation.y = 0.9;
  chair.add(box(0.5, 0.08, 0.5, dark, 0, 0.48, 0), box(0.08, 0.6, 0.5, dark, -0.24, 0.8, 0), box(0.06, 0.45, 0.06, lampM, 0, 0.23, 0));
  G.add(chair);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4.4), mat(0x2f5d62, { roughness: 1 })); rug.rotation.x = -Math.PI / 2; rug.position.set(14.2, R.y0 + 0.015, dz); rug.userData.noEdges = true;
  G.add(rug);
  const shelf = box(0.3, 0.04, 2.2, wood, R.x1 - 0.16, 12.0, dz + 3.6); G.add(shelf);
  [0x3f6fb5, 0xd9a23c, 0x9b4d6a, 0x4c8c74, 0xe6e0d4, 0xc8553d].forEach((c, i) => G.add(box(0.22, 0.3 + (i % 3) * 0.05, 0.06, mat(c), R.x1 - 0.18, 12.18, dz + 2.7 + i * 0.09)));
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.73), ink(new THREE.MeshStandardMaterial({ map: pictureTex, roughness: 0.6 })));
  pic.position.set(R.x1 - 0.03, 12.25, dz - 0.2); pic.rotation.y = -Math.PI / 2; pic.userData.noEdges = true;
  G.add(pic, box(0.03, 0.85, 1.42, mat(0xf2efe9), R.x1 - 0.015, 12.25, dz - 0.2));
  // lights: the desk lamp and a warm ceiling glow; the attack turns them red
  const lampLight = new THREE.PointLight(0xffc58a, 0, 7, 1.6); lampLight.position.set(deskX - 0.1, top + 0.7, dz - 0.9);
  const ceiling = new THREE.PointLight(0xffd6a8, 0, 11, 1.6); ceiling.position.set(13.2, 12.9, dz - 1.5);
  const alarm = new THREE.PointLight(0xff2030, 0, 10, 1.4); alarm.position.set(12, 13, dz);
  const screenGlow = new THREE.PointLight(0x9fc4ff, 0, 3, 1.5); screenGlow.position.set(deskX - 0.6, top + 0.25, dz);
  G.add(lampLight, ceiling, alarm, screenGlow);
  // the attack: red packets streaming in through the window to the laptop
  const pk = new THREE.InstancedMesh(new THREE.BoxGeometry(0.014, 0.014, 0.014), new THREE.MeshBasicMaterial({ color: 0xff2233, toneMapped: false }), 140);
  pk.userData.noEdges = true; pk.visible = false; pk.frustumCulled = false; pk.userData.moving = true;
  G.add(pk);
  return { group: G, laptop, lights: { lampLight, ceiling, alarm, screenGlow }, packets: pk, screenTarget: new THREE.Vector3(deskX - 0.12, top + 0.17, dz) };
}

/* ---------------- sky ---------------- */
export function buildSky(scene) {
  const u = { top: { value: new THREE.Color(0x2b4a7a) }, bottom: { value: new THREE.Color(0xf3c9a2) }, uInk: INK };
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: u,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; uniform float uInk; varying vec3 vP; void main(){ float t = smoothstep(-0.05, 0.55, vP.y); vec3 c = mix(bottom, top, t); gl_FragColor = vec4(mix(c, vec3(0.012,0.014,0.018), uInk), 1.0); }',
  });
  const s = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), m); s.userData.noEdges = true; s.frustumCulled = false;
  scene.add(s);
  return u;
}
export { DARK };
