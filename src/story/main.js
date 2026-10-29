/* Landing-page story: one scroll-driven drive that runs behind the whole page.
   Act one (the story track): black-and-white line art, then colour as the car comes into focus; potholes
   (RoadHawk), cows (the cattle app), people at a crossing (ADHD / mental-fitness models), then up into my
   room: the laptop (chub-guard) and the attack on it (log anomaly detection). The model's "noticing" is
   drawn as detection boxes over the scene.
   Act two (the rest of the page): out of the window and onto Marine Drive at night; the car cruises the
   Queen's Necklace behind Experience, Education and Contact, and ends on "One more thing".
   Also drives the chapter rail and the veil that keeps text readable over the scene. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCar } from '../vehicle/car-model.js';
import { CAR_SPEC } from '../vehicle/sim.js';
import { INK, LINES, NIGHT, ink, outline, freeze, mergeByMaterial, facadeMat, buildStreet, buildPotholes, buildCows, buildCrossing, buildSky } from './world.js?v=39';
import { buildRoom } from './room.js?v=39';
import { buildMarineDrive, along, LENGTH } from './marine.js?v=39';
import { screenTex, drawScreen, setWallpaper } from './screen.js?v=39';

const $ = id => document.getElementById(id);
const track = $('story'), canvas = $('scene'), detLayer = $('det'), stage = canvas.parentElement, veil = $('veil');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = matchMedia('(max-width: 760px)').matches;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = t => t * t * (3 - 2 * t);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ---------- renderer ---------- */
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
catch (e) { document.documentElement.classList.add('no-3d'); throw e; }
const maxPR = Math.min(devicePixelRatio || 1, small ? 1.5 : 1.75);
let pr = Math.min(maxPR, 1.5);
renderer.setPixelRatio(pr);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = !small;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xf0d2b6, 90, 340);
const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 1500);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const sky = buildSky(scene);
const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x6b5a48, 0.9);
const sun = new THREE.DirectionalLight(0xffe0bd, 2.4);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 140 });
sun.shadow.bias = -0.0004;
scene.add(hemi, sun, sun.target);

/* ---------- shader budget ----------
   Phones (iPhones especially) build every shader variant the first time they see it, and each one can take a
   noticeable fraction of a second. So the scene sticks to as few variants as it can: */
// the car's clear-coat paint needs the heaviest shader there is; plain standard paint looks nearly the same at this size
const stdOf = new Map();
function standardize(root) {
  const conv = m => {
    if (!m.isMeshPhysicalMaterial) return m;
    if (!stdOf.has(m)) {
      const s = THREE.MeshStandardMaterial.prototype.copy.call(new THREE.MeshStandardMaterial(), m);
      if (m.clearcoat > 0.5) s.roughness = m.roughness * 0.7;   // a touch glossier, standing in for the clear coat
      delete s.userData.inked; stdOf.set(m, ink(s));
    }
    return stdOf.get(m);
  };
  root.traverse(o => { if (o.material) o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material); });
}
// low-poly bits (trees, cows, tetrapods, plants) get their faceted look from face normals baked into the geometry,
// so they share the regular shader instead of needing a flat-shaded one
function bakeFlat(root) {
  const geo = new Map(), flipped = new Set(), keep = new Set();
  root.traverse(o => {
    if (!o.isMesh) return;
    const ms = [].concat(o.material);
    if (!ms.every(m => m.flatShading)) { ms.forEach(m => keep.add(m)); return; }
    if (!geo.has(o.geometry)) { const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.computeVertexNormals(); geo.set(o.geometry, g); }
    o.geometry = geo.get(o.geometry); ms.forEach(m => flipped.add(m));
  });
  for (const m of flipped) if (!keep.has(m)) { m.flatShading = false; m.needsUpdate = true; }
}

/* ---------- world ---------- */
const street = buildStreet(scene);
const holes = buildPotholes(scene);
const herd = buildCows(scene);
const crossing = buildCrossing(scene);
const STILL = 'assets/stills/mumbai-gp-car.webp';
const room = buildRoom(scene, { screenTex, stillUrl: STILL });
standardize(room.group);
// the room's lights live outside the room group and are dimmed to 0 instead of hidden: hiding a light changes
// the light setup, and that makes the renderer rebuild every shader in the scene
room.group.updateMatrixWorld(true);
for (const l of [...Object.values(room.lights), room.lights.lampLight.target]) scene.attach(l);
mergeByMaterial(room.group);   // the room's static furniture (and the model car) as a few meshes
setWallpaper(STILL);
const marine = buildMarineDrive(scene, facadeMat);
const car = buildCar();
standardize(car.root);
car.root.traverse(o => { if (o.isMesh) { o.castShadow = true; for (const m of [].concat(o.material)) ink(m); } });
ink(car.contactShadow.material);
const headlight = new THREE.SpotLight(0xfff1dc, 0, 60, 0.55, 0.6, 1.4);
headlight.position.set(0, 0.6, 1.2); headlight.target.position.set(0, -1.5, 22);
car.body.add(headlight, headlight.target);
// a warm streetlight that rides with the car on Marine Drive, so it reads at night
const carLight = new THREE.PointLight(0xffc98f, 0, 16, 1.6); carLight.position.set(-3, 5, 2); car.root.add(carLight);
scene.add(car.root, car.contactShadow);
bakeFlat(scene);
for (const g of [street, crossing.group, room.group]) outline(g);
for (const h of holes) outline(h.obj, 20);
for (const c of herd) outline(c.obj, 35);
outline(car.root, 40, { bake: false });   // the car moves: its outlines ride on each part
car.root.traverse(o => { o.userData.moving = true; });
for (const g of [street, crossing.group, room.group, marine, ...holes.map(h => h.obj), ...herd.map(c => c.obj)]) freeze(g);

let lastEnv = -1;
const envMats = [];
scene.traverse(o => { for (const m of [].concat(o.material || [])) if ('envMapIntensity' in m && !envMats.some(e => e[0] === m)) envMats.push([m, m.envMapIntensity]); });
const sim = { wheels: [0, 1, 2, 3].map(() => ({ len: CAR_SPEC.restLength, steer: 0, spin: 0 })), steerAngle: 0, brakeLight: false, rpm: 5200, gear: 3, speed: 0 };
const carPos = V(2.2, 0.345, 0), carQuat = new THREE.Quaternion();
let carHeading = 0;

/* ---------- timeline: T runs 0 → 1 through the story, 1 → 2 through the rest of the page ---------- */
function keyed(p, keys) {
  if (p <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [p0, v0] = keys[i], [p1, v1] = keys[i + 1];
    if (p <= p1) return v0 + (v1 - v0) * sstep((p - p0) / (p1 - p0));
  }
  return keys[keys.length - 1][1];
}
const CAR_Z = [[0, 0], [0.1, 0], [0.3, 106], [0.44, 172], [0.52, 240.5], [0.63, 240.5], [0.72, 306], [1, 306]];
// act two: distance driven from z = 306 — 40 m to the end of the street, then along Marine Drive
const CAR_D = [[0, 0], [0.12, 0], [1, 40 + LENGTH - 70]];
const carX = z => 2.2 + (z > 34 && z < 104 ? Math.sin((z - 34) * 0.11) * 0.55 : 0);
function placeCar(T) {
  if (T <= 1) {
    const z = keyed(T, CAR_Z), x = carX(z);
    carHeading = Math.atan2((carX(z + 0.5) - x) * 2, 1);
    carPos.set(x, 0.345, z);
    return z;
  }
  const d = keyed(T - 1, CAR_D);
  if (d < 40) { carPos.set(2.2, 0.345, 306 + d); carHeading = 0; }
  else { const a = along(d - 40, 2.2); carPos.set(a.p.x, 0.345, a.p.z); carHeading = a.heading; }
  return 306 + d;
}
// camera keys: fixed points, or offsets in the car's own frame (x = across, y = up, z = ahead)
const rel = (dx, dy, dz) => c => { const s = Math.sin(carHeading), co = Math.cos(carHeading); return V(c.x + co * dx + s * dz, c.y + dy, c.z - s * dx + co * dz); };
const at = (x, y, z) => () => V(x, y, z);
const CAM = [
  { t: 0.0, pos: at(-3.5, 15, -32), look: at(4.5, 1.5, 62), fov: 46 },
  { t: 0.09, pos: at(-9, 7, -14), look: rel(0, 0.6, 10), fov: 42 },
  { t: 0.16, pos: rel(-4.4, 2.7, -8.6), look: rel(0, 0.5, 16), fov: 46 },
  { t: 0.3, pos: rel(-4.4, 2.7, -8.6), look: rel(0, 0.5, 16), fov: 46 },
  { t: 0.37, pos: rel(-7.6, 2.3, 6.5), look: at(1.5, 1.0, 194), fov: 44 },
  { t: 0.44, pos: rel(-6.6, 2.4, 9), look: at(1.0, 1.1, 194), fov: 44 },
  { t: 0.52, pos: at(-8.6, 2.6, 233), look: at(0.4, 1.4, 249.5), fov: 44 },
  { t: 0.62, pos: at(-8.0, 2.4, 237), look: at(0, 1.5, 249), fov: 42 },
  // up to one lit window in the block, through it, and into a small room: the camera stays close, like you're in it
  { t: 0.69, pos: at(4.2, 11.6, 329), look: at(9.6, 11.6, 329), fov: 34, tall: { pos: at(3.2, 11.7, 329), look: at(9.6, 11.85, 329), fov: 58 } },
  { t: 0.745, pos: at(9.25, 11.6, 329), look: at(13.1, 11.25, 329), fov: 52 },
  { t: 0.775, pos: at(10.35, 11.52, 328.55), look: at(13.1, 11.12, 329.05), fov: 60, tall: { pos: at(9.95, 11.5, 329), look: at(13.1, 11.78, 329), fov: 72 } },
  { t: 0.81, pos: at(11.88, 11.3, 328.42), look: at(12.98, 11.06, 328.76), fov: 48, tall: { pos: at(11.7, 11.25, 329), look: at(12.98, 11.02, 329), fov: 64 } },
  { t: 0.88, pos: at(11.91, 11.29, 328.44), look: at(12.98, 11.06, 328.76), fov: 48, tall: { pos: at(11.72, 11.24, 329), look: at(12.98, 11.02, 329), fov: 64 } },
  { t: 1.0, pos: at(11.55, 11.42, 328.52), look: at(12.98, 11.12, 328.92), fov: 54, tall: { pos: at(11.4, 11.35, 329), look: at(12.98, 11.0, 329), fov: 70 } },
  // act two: turn round to the street window, out, down to the car, and along Marine Drive
  { t: 1.06, pos: at(11.8, 11.6, 329), look: at(4, 11.3, 329), fov: 54 },
  { t: 1.12, pos: at(5.5, 13.2, 327), look: rel(0, 0.5, 6), fov: 50 },
  { t: 1.24, pos: rel(-5, 2.8, -10), look: rel(0, 0.6, 14), fov: 48 },
  { t: 1.42, pos: rel(-10.5, 2.6, 2), look: rel(0, 0.9, 3), fov: 44 },
  { t: 1.62, pos: rel(-75, 32, -20), look: rel(22, 0, 95), fov: 50 },   // high over the bay: the Queen's Necklace
  { t: 1.82, pos: rel(-4.6, 2.4, -9.5), look: rel(0, 0.6, 16), fov: 48 },
  { t: 2.0, pos: rel(-7.2, 1.3, 6.2), look: rel(-3.4, 1.3, -2), fov: 40, tall: { pos: rel(-5.4, 1.6, 7.4), look: rel(0, 0.8, -1), fov: 48 } },   // the car on the right, the necklace behind it
];
const _a = V(0, 0, 0), _b = V(0, 0, 0), _la = V(0, 0, 0), _lb = V(0, 0, 0);
function placeCamera(T) {
  let i = 0; while (i < CAM.length - 2 && T > CAM[i + 1].t) i++;
  // tall (phone) screens see less sideways: some shots have their own framing
  const tall = camera.aspect < 0.9, pick = k => (tall && k.tall ? k.tall : k);
  const A = pick(CAM[i]), B = pick(CAM[i + 1]), k0 = CAM[i].t, k1 = CAM[i + 1].t;
  const t = reduced ? (T - k0 < k1 - T ? 0 : 1) : sstep(clamp((T - k0) / (k1 - k0)));
  _a.copy(A.pos(carPos)); _b.copy(B.pos(carPos)); _la.copy(A.look(carPos)); _lb.copy(B.look(carPos));
  camera.position.lerpVectors(_a, _b, t);
  camera.lookAt(_la.lerp(_lb, t));
  camera.fov = A.fov + (B.fov - A.fov) * t; camera.updateProjectionMatrix();
}

/* ---------- detection overlay: what the model notices ---------- */
const targets = [];
const addTarget = (obj, size, label, kind, p0, p1) => {
  const el = document.createElement('div'); el.className = 'box ' + kind; el.innerHTML = `<i></i><span>${label}</span>`;
  detLayer.appendChild(el); targets.push({ obj, size, el, p0, p1, on: false });
};
holes.forEach(h => addTarget(h.obj, h.size, 'pothole', 'hole', 0.15, 0.32));
herd.forEach(c => addTarget(c.obj, c.size, c.tag === 'check' ? 'cow · check health' : 'cow · healthy', c.tag === 'check' ? 'warn' : 'cow', 0.33, 0.47));
crossing.people.forEach(p => addTarget(p.obj, p.size, 'person', 'person', 0.5, 0.63));
const corners = [...Array(8)].map(() => V(0, 0, 0));
function updateBoxes(p, w, h) {
  for (const t of targets) {
    const live = p > t.p0 && p < t.p1;
    let show = false;
    if (live) {
      const o = t.obj.position, s = t.size;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, behind = false;
      for (let k = 0; k < 8; k++) {
        const c = corners[k].set(o.x + (k & 1 ? 0.5 : -0.5) * s.x, o.y + (k & 2 ? s.y : 0.02), o.z + (k & 4 ? 0.5 : -0.5) * s.z).project(camera);
        if (c.z > 1) behind = true;
        x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y);
      }
      const d = camera.position.distanceTo(o);
      show = !behind && x1 > -1 && x0 < 1 && y1 > -1 && y0 < 1 && d < 70 && d > 2.5;
      if (show) {
        const L = (x0 + 1) / 2 * w, R = (x1 + 1) / 2 * w, T = (1 - y1) / 2 * h, B = (1 - y0) / 2 * h;
        t.el.style.transform = `translate(${L.toFixed(1)}px, ${T.toFixed(1)}px)`;
        t.el.style.width = `${Math.max(14, R - L).toFixed(1)}px`; t.el.style.height = `${Math.max(14, B - T).toFixed(1)}px`;
      }
    }
    if (show !== t.on) { t.on = show; t.el.classList.toggle('on', show); }
  }
}

/* ---------- one frame ---------- */
const clock = new THREE.Clock();
let tTarget = 0, tNow = 0, dist = 0, lastD = 0, time = 0;
const dayTop = new THREE.Color(0x2b4a7a), dayBot = new THREE.Color(0xf3c9a2), nightTop = new THREE.Color(0x050a1a), nightBot = new THREE.Color(0x221c38);
const sunDay = new THREE.Color(0xffe0bd), moonC = new THREE.Color(0x9fb4ff);
let avg = 16, adaptT = 0;
function adapt(dt) {
  avg = avg * 0.9 + dt * 1000 * 0.1; adaptT += dt;
  if (adaptT < 1.2) return;
  const next = avg > 24 && pr > 1 ? Math.max(1, pr - 0.25) : avg < 15 && pr < maxPR && adaptT > 4 ? Math.min(maxPR, pr + 0.25) : pr;
  if (next !== pr) { pr = next; renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false); adaptT = 0; }
}
const stageVars = { alert: '', cozy: '' };
function setVar(k, v) { if (stageVars[k] !== v) { stageVars[k] = v; stage.style.setProperty('--' + k, v); } }
function frame() {
  const dt = Math.min(0.05, clock.getDelta()); time += dt; adapt(dt);
  tNow = reduced ? tTarget : tNow + (tTarget - tNow) * (1 - Math.exp(-dt * 7));
  const T = tNow, p = Math.min(1, T), a = Math.max(0, T - 1);

  // style: line art → colour
  INK.value = 1 - sstep(clamp((p - 0.085) / 0.08));
  LINES.opacity = INK.value; LINES.visible = INK.value > 0.01;
  // the car
  const d = placeCar(T);
  carQuat.setFromAxisAngle(V(0, 1, 0), carHeading);
  dist += Math.abs(d - lastD); lastD = d;
  for (const w of sim.wheels) w.spin = dist / CAR_SPEC.wheelRadius;
  sim.steerAngle = 0; sim.brakeLight = (p > 0.49 && p < 0.63) || (T > 1 && T < 1.12);
  car.update(carPos, carQuat, sim, dt, 0);
  // evening falls as we head home, and stays night along Marine Drive (moonlight, the Queen's Necklace)
  const night = sstep(clamp((p - 0.63) / 0.12)), inRoom = T > 0.72 && T < 1.1, outside = clamp((a - 0.08) / 0.06);
  sun.intensity = inRoom ? 0 : 2.4 * (1 - night) + 0.45 * night * (T > 1 ? outside : 1);
  sun.color.lerpColors(sunDay, moonC, night);
  hemi.intensity = 0.9 * (1 - night) + (inRoom ? 0.1 : T > 1 ? 0.32 * outside : 0.07 * night);
  // the studio reflections that make the car shine by day are dimmed after dark
  const env = 1 - night * 0.82;
  if (Math.abs(env - lastEnv) > 0.01) { lastEnv = env; for (const [m, base] of envMats) m.envMapIntensity = base * env; }
  for (const m of NIGHT.mats) m.emissiveIntensity = night * 1.3;
  sky.top.value.lerpColors(dayTop, nightTop, night); sky.bottom.value.lerpColors(dayBot, nightBot, night);
  scene.fog.color.copy(sky.bottom.value); scene.fog.far = T > 1 ? 520 : 340;
  headlight.intensity = night > 0.3 ? 45 * night : 0;
  carLight.intensity = T > 1.1 ? 26 * outside : 0;
  const focus = T > 1.1 || p < 0.66 ? carPos : room.screenTarget;
  sun.position.set(focus.x - 30, 40, focus.z - 22); sun.target.position.copy(focus);
  // the signal: red while people cross, then green
  const L = crossing.lights, go = p > 0.615, amber = p > 0.6 && !go;
  L.red.emissiveIntensity = !go && !amber ? 4 : 0.05; L.amber.emissiveIntensity = amber ? 4 : 0.05; L.green.emissiveIntensity = go ? 4 : 0.05;
  // people cross while it's red; their "brains" light up as the model reads the patterns
  if (p > 0.4 && p < 0.7) crossing.people.forEach(({ obj }, i) => {
    const u = obj.userData, c = clamp((p - 0.47 - u.delay * 0.1) / (0.12 / u.speed));
    const px = -u.dir * 7.6 + u.dir * 15.2 * sstep(c);
    obj.position.set(px, 0.16 * (Math.abs(px) > 6 ? 1 : 0), u.lane);
    const walking = c > 0 && c < 1 ? 1 : 0.15, ph = px * 2.4 + time * (walking < 1 ? 1.5 : 0);
    u.legs[0].rotation.x = Math.sin(ph) * 0.55 * walking; u.legs[1].rotation.x = -Math.sin(ph) * 0.55 * walking;
    u.arms[0].rotation.x = -Math.sin(ph) * 0.45 * walking; u.arms[1].rotation.x = Math.sin(ph) * 0.45 * walking;
    const b = sstep(clamp((p - 0.5) / 0.04)) * (1 - sstep(clamp((p - 0.62) / 0.04)));
    u.brain.scale.setScalar(0.001 + b * (1 + Math.sin(time * 3 + i) * 0.06));
    u.brain.position.y = 1.74 + b * 0.42; u.brain.rotation.y = time * 0.8 + i;
    u.bw.material.opacity = b; u.glow.material.opacity = b * (0.25 + Math.sin(time * 4 + i * 2) * 0.12);
  });
  // my room: warm lamps, fairy lights; then the attack turns it red and packets stream into the laptop
  const RL = room.lights, attack = sstep(clamp((p - 0.885) / 0.05)) * (1 - sstep(clamp((a - 0.02) / 0.05)));
  const roomInView = T > 0.6 && T < 1.16;
  const glowOn = roomInView ? night * (inRoom ? 1 : 0.75) : 0;
  RL.lampLight.intensity = 5 * glowOn * (1 - attack * 0.6); RL.floorLight.intensity = 2.2 * glowOn * (1 - attack * 0.7);
  RL.moon.intensity = 0.9 * glowOn;
  RL.alarm.intensity = roomInView ? attack * (4 + Math.sin(time * 6) * 2) : 0;
  room.fairy.glow.material.size = 0.16 * (0.92 + Math.sin(time * 2.3) * 0.08);
  setVar('alert', (attack * (0.75 + Math.sin(time * 6) * 0.25)).toFixed(3));
  setVar('cozy', (sstep(clamp((T - 0.72) / 0.04)) * (1 - sstep(clamp((T - 1.05) / 0.05)))).toFixed(2));
  room.packets.visible = attack > 0.02;
  if (room.packets.visible) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V(1, 1, 1), tgt = room.screenTarget;
    for (let i = 0; i < 140; i++) {
      const f = (time * 0.6 + i / 140 * 3) % 1, ang = (i * 2.39996) % (Math.PI * 2), rr = 0.35 + ((i * 37) % 17) / 17 * 0.5;
      const from = _a.set(tgt.x + 0.25 + Math.cos(ang) * 0.15, tgt.y + Math.sin(ang) * rr * 0.6, tgt.z + Math.cos(ang * 1.7) * rr);
      const pos = _b.lerpVectors(from, tgt, f * f);
      s.setScalar(attack * (0.6 + (1 - f)));
      room.packets.setMatrixAt(i, m.compose(pos, q, s));
    }
    room.packets.instanceMatrix.needsUpdate = true;
  }
  // the ultrawide: lock screen as we come in, the editor for chub-guard, then the logs during the attack
  if (p > 0.66 && T < 1.12) drawScreen(p > 0.875 ? 'logs' : p > 0.79 ? 'code' : 'lock', time, p > 0.875 ? clamp((p - 0.875) / 0.1) : clamp((p - 0.79) / 0.08));
  // only draw what this part of the page can see
  marine.visible = T > 0.6;
  const onStreet = T < 1.16;
  street.visible = onStreet; crossing.group.visible = T > 0.3 && T < 0.75;
  for (const h of holes) h.obj.visible = T < 0.4;
  for (const c of herd) c.obj.visible = T > 0.25 && T < 0.6;
  room.group.visible = roomInView;
  placeCamera(T);
  updateBoxes(p, canvas.clientWidth, canvas.clientHeight);
  renderer.render(scene, camera);
}

/* ---------- scroll, size, loop ---------- */
let trackTop = 0, trackSpan = 1, afterStart = 0, afterSpan = 1, veils = [];
function measure() {
  const r = track.getBoundingClientRect();
  trackTop = r.top + scrollY; trackSpan = Math.max(1, track.offsetHeight - innerHeight);
  afterStart = trackTop + trackSpan; afterSpan = Math.max(1, document.documentElement.scrollHeight - innerHeight - afterStart);
  veils = [...document.querySelectorAll('[data-veil]')].map(el => { const b = el.getBoundingClientRect(); return { top: b.top + scrollY, bottom: b.bottom + scrollY, v: el.dataset.veil }; });
}
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  // on tall screens the cards sit in the lower half, so the scene is framed in the upper half
  if (w / h < 0.9) camera.setViewOffset(w, h, 0, h * 0.16, w, h); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  measure();
}
let lastVeil = '';
function onScroll() {
  const y = scrollY;
  tTarget = clamp((y - trackTop) / trackSpan) + clamp((y - afterStart) / afterSpan);
  // the veil: dark behind dense sections so text reads, clear during the drive and for "One more thing"
  const mid = y + innerHeight * 0.55, sec = veils.find(v => mid >= v.top && mid < v.bottom), v = sec ? sec.v : '0';
  if (v !== lastVeil) { lastVeil = v; veil.style.opacity = v; }
}
let raf = 0;
const loop = () => { raf = 0; if (document.hidden) return; frame(); raf = requestAnimationFrame(loop); };
document.addEventListener('visibilitychange', () => { if (!document.hidden && !raf) { clock.getDelta(); raf = requestAnimationFrame(loop); } });
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', () => { resize(); onScroll(); });
new ResizeObserver(() => { measure(); onScroll(); }).observe(document.body);
resize(); onScroll(); tNow = tTarget;
// compile every material and upload every texture up front, so nothing stalls mid-scroll. Browsers that can
// build shaders in the background do so while the page stays scrollable.
room.packets.visible = true;
scene.traverse(o => { for (const m of [].concat(o.material || [])) for (const k of ['map', 'emissiveMap', 'normalMap']) if (m[k]) renderer.initTexture(m[k]); });
let started = false;
function start() {
  if (started) return; started = true;
  // one warm-up render with nothing culled uploads every mesh to the GPU now, not mid-scroll when it first appears.
  // It draws to the screen (an offscreen target would build a second set of shaders) and the real first frame
  // replaces it in the same task, so it is never seen.
  const culled = [];
  scene.traverse(o => { if (o.isMesh || o.isPoints || o.isLine) { culled.push([o, o.frustumCulled]); o.frustumCulled = false; } });
  renderer.render(scene, camera);
  for (const [o, f] of culled) o.frustumCulled = f;
  room.packets.visible = false;
  frame();
  raf = requestAnimationFrame(loop);
  document.documentElement.classList.add('scene-ready');
  window.__story = hook;
}
renderer.compile(scene, camera);   // queues every shader build
// wait for them, asking about each shader (not each material) a few times a second; three's compileAsync asks
// about every material every 10 ms, and each question is a round trip to the GPU process
const parallel = !!renderer.extensions.get('KHR_parallel_shader_compile'), giveUp = performance.now() + 8000;
const whenBuilt = () => {
  if (!parallel || performance.now() > giveUp || renderer.info.programs.every(pg => pg.isReady())) start();
  else setTimeout(whenBuilt, 60);
};
setTimeout(whenBuilt, 0);

/* ---------- chapter rail ---------- */
const rail = document.querySelector('.rail');
let railUpdate = () => {};
if (rail) {
  const links = [...rail.querySelectorAll('a')], secs = links.map(a => document.querySelector(a.getAttribute('href'))), fill = rail.querySelector('.fill');
  let cur = -1;
  const upd = () => {
    let c = 0;
    secs.forEach((s, i) => { if (s && s.getBoundingClientRect().top <= innerHeight * 0.45) c = i; });
    if (c !== cur) { cur = c; links.forEach((l, i) => { l.classList.toggle('on', i === c); if (i === c) l.setAttribute('aria-current', 'true'); else l.removeAttribute('aria-current'); }); }
    if (fill) fill.style.transform = `scaleX(${clamp(scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight)).toFixed(3)})`;
  };
  addEventListener('scroll', () => requestAnimationFrame(upd), { passive: true }); upd();
  railUpdate = upd;
}
const hook = { renderer, p: () => Math.min(1, tNow), t: () => tNow, target: () => tTarget, ink: () => INK.value, camera, scene, frame, snap: () => { measure(); onScroll(); tNow = tTarget; frame(); railUpdate(); }, boxes: () => targets.filter(t => t.on).map(t => t.el.textContent), car: () => carPos.clone() };   // for tests
