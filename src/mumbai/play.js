/* Playful layer: knock-over props, chai collectibles, jump ramps, Gateway
   pigeons, ambient toy traffic, and little secrets. Lightweight custom physics:
   props are independent bodies that bounce, tumble and settle; the car's
   tested vehicle simulation is untouched. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PLAZAS, PARKS } from './layout.js';
import { rng, canvasTexture } from '../core/geo.js';
import { paint, taxiGeometry, autoGeometry, carGeometry, busGeometry } from './props.js';

const V = THREE.Vector3;
const part = (g, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return paint(g, hex); };
const merge = parts => mergeGeometries(parts.map(g => (g.index ? g.toNonIndexed() : g)));
const RB = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));

/* ---------- prop models (origin at the base) ---------- */
const MODELS = {
  cone: () => merge([part(new THREE.ConeGeometry(0.32, 0.85, 12), 0xff6a1f, 0, 0.5, 0), part(new THREE.CylinderGeometry(0.2, 0.25, 0.12, 12), 0xffffff, 0, 0.45, 0), part(RB(0.7, 0.08, 0.7, 0.03), 0xff6a1f, 0, 0.04, 0)]),
  barricade: () => merge([part(RB(2.2, 0.32, 0.12, 0.05), 0xf6c21c, 0, 0.9, 0), part(RB(2.2, 0.32, 0.12, 0.05), 0x1d1d22, 0, 0.55, 0), part(RB(0.12, 1.1, 0.5, 0.04), 0xd93a2b, -0.95, 0.55, 0), part(RB(0.12, 1.1, 0.5, 0.04), 0xd93a2b, 0.95, 0.55, 0)]),
  crate: () => merge([part(RB(0.9, 0.7, 0.7, 0.06), 0xd99a5b, 0, 0.35, 0), part(RB(0.94, 0.1, 0.74, 0.03), 0xb57a42, 0, 0.62, 0), ...[0xf2683c, 0xf5c542, 0x7cc35c].map((c, i) => part(new THREE.IcosahedronGeometry(0.13, 0), c, -0.25 + i * 0.25, 0.75, 0))]),
  ball: () => merge([part(new THREE.SphereGeometry(0.8, 16, 12, 0, Math.PI * 2 / 3), 0xf25a5a, 0, 0.8, 0), part(new THREE.SphereGeometry(0.8, 16, 12, Math.PI * 2 / 3, Math.PI * 2 / 3), 0xffffff, 0, 0.8, 0), part(new THREE.SphereGeometry(0.8, 16, 12, Math.PI * 4 / 3, Math.PI * 2 / 3), 0x3fa9f5, 0, 0.8, 0)]),
  stumps: () => merge([0, 1, 2].map(i => part(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6), 0xf3e4c3, -0.12 + i * 0.12, 0.4, 0)).concat([part(RB(0.34, 0.04, 0.05, 0.02), 0xc98f4a, 0, 0.82, 0)])),
  stool: () => merge([part(new THREE.CylinderGeometry(0.28, 0.24, 0.08, 12), 0x2fa864, 0, 0.5, 0), ...[0, 1, 2, 3].map(i => part(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5), 0x2fa864, Math.cos(i * 1.57) * 0.18, 0.25, Math.sin(i * 1.57) * 0.18))]),
};
const PROPS = {
  cone:      { r: 0.35, mass: 0.02, bounce: 0.35, floor: 0, pitch: 1.4 },
  barricade: { r: 1.0,  mass: 0.07, bounce: 0.25, floor: 0, pitch: 0.8 },
  crate:     { r: 0.5,  mass: 0.05, bounce: 0.25, floor: 0, pitch: 0.9 },
  ball:      { r: 0.8,  mass: 0.01, bounce: 0.75, floor: 0, pitch: 1.8, roll: true },
  stumps:    { r: 0.3,  mass: 0.005, bounce: 0.3, floor: 0, pitch: 2.2 },
  stool:     { r: 0.3,  mass: 0.01, bounce: 0.3, floor: 0, pitch: 1.6 },
};

export function buildPlay(ctx) {
  const { scene, net, terr, colliders, atmo, quality, surfaces } = ctx;
  const group = new THREE.Group(); group.name = 'play';
  const R = rng(4242);
  const D = new THREE.Object3D();
  const ground = (x, z, y = 50) => { const o = {}; if (!net.roadSurface(x, z, y, o)) terr.groundSurface(x, z, o); return Math.max(o.h, o.water ? 0 : -9); };
  const roadPoint = (id, frac, lat = 0) => { const r = net.roads.find(q => q.id === id); const i = Math.round(frac * (r.n - 1)); return { x: r.x[i] + r.tz[i] * lat, z: r.z[i] - r.tx[i] * lat, h: r.h[i], dir: Math.atan2(r.tx[i], r.tz[i]), r, i }; };

  /* ================= knockable props ================= */
  const props = [];
  const add = (kind, x, z, ry = R() * 6.28, y) => props.push({ kind, x, z, y: y ?? ground(x, z), ry, rx: 0, rz: 0, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, home: null, awake: false, rest: 0, ...PROPS[kind] });
  // Metro works on Colaba Causeway: a coned-off lane with barricades
  for (let k = 0; k < 14; k++) { const p = roadPoint('causeway', 0.3 + k * 0.022, 6.2); add('cone', p.x, p.z, R(), p.h); }
  for (let k = 0; k < 4; k++) { const p = roadPoint('causeway', 0.33 + k * 0.07, 8.0); add('barricade', p.x, p.z, p.dir + Math.PI / 2, p.h); }
  // Peddar Road and Worli Sea Face cone chicanes
  for (const [id, f0, lat] of [['peddar', 0.55, -5], ['worliSeaFace', 0.4, 5], ['bkcAve', 0.35, 4], ['marineDriveS', 0.5, -4.5]])
    for (let k = 0; k < 8; k++) { const p = roadPoint(id, f0 + k * 0.012, lat + (k % 2) * 2.5 * Math.sign(lat)); add('cone', p.x, p.z, R(), p.h); }
  // fruit-crate pyramids by the Colaba market and Chowpatty
  for (const [cx, cz] of [[668, 958], [-222, 340], [598, 818]]) {
    const y0 = ground(cx, cz);
    [[-1, 0, 1], [-0.5, 0.5], [0]].forEach((row, lvl) => row.forEach(o => add('crate', cx + o * 0.95, cz, 0, y0 + lvl * 0.72)));
  }
  // chai stall stools
  for (let k = 0; k < 6; k++) add('stool', -290 + k * 13 + 3, 356 + 2.5);
  // beach ball at Chowpatty, cricket on the Oval Maidan
  add('ball', -255, 348);
  const oval = PARKS.find(p => p.id === 'oval');
  add('stumps', oval.x, oval.z - 10, 0); add('stumps', oval.x, oval.z + 10, 0);
  add('ball', oval.x + 18, oval.z + 25);
  for (const p of props) p.home = { x: p.x, y: p.y, z: p.z, ry: p.ry };

  const meshes = {};
  const pmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
  for (const kind of Object.keys(MODELS)) {
    const list = props.filter(p => p.kind === kind);
    if (!list.length) continue;
    const m = new THREE.InstancedMesh(MODELS[kind](), pmat, list.length);
    m.castShadow = true; m.receiveShadow = true;
    list.forEach((p, i) => { p.mesh = m; p.idx = i; });
    group.add(m); meshes[kind] = m;
  }
  const write = p => {
    D.position.set(p.x, p.y, p.z); D.rotation.set(p.rx, p.ry, p.rz); D.scale.setScalar(1); D.updateMatrix();
    p.mesh.setMatrixAt(p.idx, D.matrix); p.mesh.instanceMatrix.needsUpdate = true;
  };
  props.forEach(write);
  const pgrid = new Map(); const pkey = (x, z) => Math.floor(x / 20) + ',' + Math.floor(z / 20);
  const rehash = () => { pgrid.clear(); for (const p of props) { const k = pkey(p.x, p.z); let a = pgrid.get(k); if (!a) pgrid.set(k, a = []); a.push(p); } };
  rehash();

  /* ================= jump ramps ================= */
  const ramps = [];
  const addRamp = (x, z, dir, len = 9, width = 5.5, height = 1.9) => {
    const base = ground(x, z);
    ramps.push({ x, z, dir, len, width, height, base, c: Math.cos(dir), s: Math.sin(dir) });
  };
  addRamp(oval.x, oval.z + 45, Math.PI, 10, 6, 2.2);       // across the Oval Maidan
  addRamp(oval.x, oval.z - 45, 0, 10, 6, 2.2);
  addRamp(-240, 352, Math.PI / 2 + 0.2, 8, 5, 1.6);        // sand kicker at Chowpatty
  { const p = PLAZAS.find(q => q.id === 'bkcPlaza'); addRamp(p.x - 30, p.z + 8, Math.PI / 2, 9, 6, 2.0); }
  { const sp = PARKS.find(q => q.id === 'shivaji'); addRamp(sp.x + 40, sp.z, -Math.PI / 2, 9, 6, 2.0); }
  // local coords: u along travel (0 at the bottom lip), w across
  const rampLocal = (r, x, z) => { const dx = x - r.x, dz = z - r.z; return [dx * r.s + dz * r.c, dx * r.c - dz * r.s]; };
  surfaces.push((x, z, yRef, out) => {
    for (const r of ramps) {
      if (Math.abs(x - r.x) > r.len + 2 || Math.abs(z - r.z) > r.len + 2) continue;
      const [u, w] = rampLocal(r, x, z);
      if (u < 0 || u > r.len || Math.abs(w) > r.width / 2) continue;
      const h = r.base + r.height * (u / r.len);
      if (h <= yRef + 0.6 && h >= out.h - 0.01) {
        const g = r.height / r.len, nl = Math.hypot(g, 1);
        out.h = h; out.nx = -g * r.s / nl; out.ny = 1 / nl; out.nz = -g * r.c / nl; out.kind = 'road'; out.mu = 1; out.rough = 0.006; out.water = false;
      }
    }
  });
  const chevron = canvasTexture(128, 256, g => { g.fillStyle = '#f6c21c'; g.fillRect(0, 0, 128, 256); g.fillStyle = '#1d1d22'; for (let k = -2; k < 8; k++) { g.beginPath(); g.moveTo(0, k * 40); g.lineTo(64, k * 40 + 30); g.lineTo(128, k * 40); g.lineTo(128, k * 40 + 16); g.lineTo(64, k * 40 + 46); g.lineTo(0, k * 40 + 16); g.closePath(); g.fill(); } });
  for (const r of ramps) {
    const sh = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(r.len, 0), new THREE.Vector2(r.len, r.height), new THREE.Vector2(r.len - 0.4, r.height)]);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: r.width, bevelEnabled: false });
    geo.translate(0, 0, -r.width / 2);
    geo.rotateY(-Math.PI / 2);         // shape x → world +z (travel), extrusion → world x
    const top = new THREE.Mesh(geo, [new THREE.MeshStandardMaterial({ color: 0xf26d5b, roughness: 0.6 }), new THREE.MeshStandardMaterial({ map: chevron, roughness: 0.5 })]);
    // ExtrudeGeometry groups: 0 = caps (sides), 1 = walls (incl. the slope)
    top.position.set(r.x, r.base - 0.02, r.z); top.rotation.y = r.dir;
    top.castShadow = true; top.receiveShadow = true;
    group.add(top);
    const ex = r.x + r.s * r.len, ez = r.z + r.c * r.len;
    colliders.wall(ex - r.c * r.width / 2, ez + r.s * r.width / 2, ex + r.c * r.width / 2, ez - r.s * r.width / 2, r.base - 1, r.base + r.height - 0.3, 'ramp');
    const flag = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 3), new THREE.MeshStandardMaterial({ color: 0xd93a2b }));
    flag.position.set(ex + r.c * (r.width / 2 + 0.6), r.base + r.height + 0.8, ez - r.s * (r.width / 2 + 0.6)); flag.rotation.z = -Math.PI / 2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, r.height + 1.5, 6), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    pole.position.set(flag.position.x, r.base + (r.height + 1.5) / 2, flag.position.z);
    group.add(flag, pole);
  }

  /* ================= cutting-chai collectibles (27, like the car number) ================= */
  const spots = [];
  const roadSpot = (id, f, lat = 0, lift = 1.3) => { const p = roadPoint(id, f, lat); spots.push([p.x, p.h + lift, p.z]); };
  roadSpot('apollo', 0.25, 4); roadSpot('causeway', 0.75, -4); roadSpot('cuffe', 0.5, 4); roadSpot('marineDriveS', 0.3, 5);
  roadSpot('marineDriveN', 0.25, 5); roadSpot('marineDriveN', 0.7, -5); roadSpot('vnr2', 0.5, 0); roadSpot('girgaon2', 0.5, 0);
  roadSpot('peddar', 0.3, -4); roadSpot('peddar', 0.8, 4); roadSpot('worliSeaFace', 0.7, 0); roadSpot('seaLink', 0.45, 5);
  roadSpot('seaLink', 0.7, -5); roadSpot('bandstand', 0.6, 0); roadSpot('paliHill', 0.5, 0); roadSpot('bandraBkc', 0.5, 4);
  roadSpot('bkcSion', 0.5, 4); roadSpot('freeway', 0.2, 4); roadSpot('freeway', 0.55, -4); roadSpot('freeway', 0.85, 4);
  roadSpot('central', 0.5, 0); roadSpot('dadarSion', 0.4, 0);
  spots.push([926, ground(926, 1052) + 1.3, 1052]);                                   // through the Gateway arch
  for (const r of ramps.slice(0, 2)) spots.push([r.x + r.s * (r.len + 8), r.base + r.height + 3.2, r.z + r.c * (r.len + 8)]);  // airborne over the maidan ramps
  spots.push([-548, ground(-548, -1572) + 1.3, -1572]);                               // inside Bandra Fort
  spots.push([PARKS.find(p => p.id === 'shivaji').x, ground(-60, -1120) + 1.3, -1120]);
  const chaiGeo = merge([
    part(new THREE.CylinderGeometry(0.3, 0.22, 0.62, 12, 1, true), 0xdfeff5, 0, 0.31, 0),
    part(new THREE.CylinderGeometry(0.27, 0.22, 0.48, 12), 0xb8763c, 0, 0.26, 0),
    part(new THREE.TorusGeometry(0.29, 0.03, 6, 16), 0xffffff, 0, 0.6, 0, Math.PI / 2),
  ]);
  const chaiMesh = new THREE.InstancedMesh(chaiGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, emissive: 0x6a3a10, emissiveIntensity: 0.25 }), spots.length);
  const haloMesh = new THREE.InstancedMesh(new THREE.TorusGeometry(0.75, 0.06, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.75 }), spots.length);
  chaiMesh.castShadow = true;
  group.add(chaiMesh, haloMesh);
  const chai = spots.map(([x, y, z], i) => ({ x, y, z, i, got: false }));

  /* ================= Gateway pigeons ================= */
  const birds = [];
  const plaza = PLAZAS.find(p => p.id === 'gatewayPlaza');
  for (let k = 0; k < 46; k++) {
    let x, z; do { x = 870 + R() * 46; z = 1022 + R() * 50; } while (x > 916 && x < 936 && Math.abs(z - 1052) < 26);
    birds.push({ x, z, y: plaza.h + 0.05, hx: x, hz: z, ry: R() * 6, vx: 0, vy: 0, vz: 0, t: 0, flying: false, ph: R() * 6 });
  }
  const birdGeo = merge([
    part(new THREE.SphereGeometry(0.16, 8, 6), 0x8d93a3, 0, 0.2, 0),
    part(new THREE.SphereGeometry(0.1, 8, 6), 0x6f7586, 0, 0.32, 0.12),
    part(new THREE.ConeGeometry(0.04, 0.08, 4), 0xf2a33c, 0, 0.31, 0.24, Math.PI / 2),
    part(new THREE.BoxGeometry(0.42, 0.02, 0.14), 0x7a8090, 0, 0.24, -0.02),
  ]);
  const birdMesh = new THREE.InstancedMesh(birdGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), birds.length);
  birdMesh.castShadow = true;
  group.add(birdMesh);
  let flockAway = 0;

  /* ================= ambient toy traffic (left-hand) ================= */
  const kinds = [taxiGeometry(), autoGeometry(), carGeometry(), busGeometry()];
  const tCols = [0xf26d5b, 0x6fc2e8, 0xf7d154, 0x9ad17f, 0xb99ce0];
  const nT = Math.round(36 * quality.props);
  const traffic = [];
  const roadsOK = net.roads.filter(r => r.type !== 'street' || R() < 0.5);
  for (let k = 0; k < nT; k++) {
    const r = roadsOK[Math.floor(R() * roadsOK.length)];
    const kind = R() < 0.4 ? 0 : R() < 0.5 ? 1 : R() < 0.85 ? 2 : 3;
    traffic.push({ r, s: r.trim0 + R() * (r.trim1 - r.trim0), dir: R() < 0.5 ? 1 : -1, v: 0, vmax: kind === 3 ? 9 : 10 + R() * 5, kind, spin: 0, spinV: 0, bump: 0, x: 0, y: 0, z: 0, yaw: 0, col: tCols[k % tCols.length] });
  }
  const tMeshes = kinds.map((g, ki) => {
    const n = traffic.filter(t => t.kind === ki).length;
    const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }), Math.max(1, n));
    m.count = n; m.castShadow = true; group.add(m); return m;
  });
  { const counts = [0, 0, 0, 0]; for (const t of traffic) { t.mi = counts[t.kind]++; if (t.kind === 2) tMeshes[2].setColorAt(t.mi, new THREE.Color(t.col)); } }
  const nodeRoads = id => net.nodes[id].roads;
  function placeTraffic(t) {
    const r = t.r, f = Math.max(0, Math.min(r.L, t.s)) / r.L * (r.n - 1), i = Math.min(r.n - 2, Math.floor(f)), a = f - i;
    const lane = r.T.median / 2 + (r.T.hw - r.T.median / 2) * (r.T.lanes > 1 ? 0.3 : 0.5);
    const lat = t.dir * lane;   // +lat is the driver's left when travelling +s
    const x = r.x[i] + (r.x[i + 1] - r.x[i]) * a, z = r.z[i] + (r.z[i + 1] - r.z[i]) * a;
    t.x = x + r.tz[i] * lat; t.z = z - r.tx[i] * lat; t.y = r.h[i] + (r.h[i + 1] - r.h[i]) * a;
    t.yaw = Math.atan2(r.tx[i] * t.dir, r.tz[i] * t.dir);
  }
  traffic.forEach(placeTraffic);

  /* ================= update ================= */
  const stats = { knocked: 0 };
  let hooks = {};
  const carPts = [new V(), new V(), new V()];
  const api = {
    group, props, chai, ramps, traffic, stats,
    setHooks(h) { hooks = h; },
    collected: new Set(),
    restoreCollected(ids) { for (const i of ids) { const c = chai[i]; if (c) { c.got = true; api.collected.add(i); } } },
    honk(sim) {
      // pigeons scatter; nearby traffic and parked taxis answer
      if (Math.hypot(sim.pos.x - 900, sim.pos.z - 1046) < 70) scatter(sim.pos, 2);
      const near = traffic.filter(t => Math.hypot(t.x - sim.pos.x, t.z - sim.pos.z) < 45);
      if (near.length && hooks.reply) hooks.reply(near.length);
    },
    update(t, dt, camera, sim) {
      if (!sim) return;
      const f = sim.forward(new V()); const fl = Math.hypot(f.x, f.z) || 1;
      [2.05, 0.3, -1.55].forEach((o, k) => carPts[k].set(sim.pos.x + f.x / fl * o, sim.pos.y, sim.pos.z + f.z / fl * o));
      const speed = sim.speed;

      /* props: car contact */
      const ck = [];
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const arr = pgrid.get((Math.floor(sim.pos.x / 20) + a) + ',' + (Math.floor(sim.pos.z / 20) + b)); if (arr) ck.push(...arr); }
      for (const p of ck) {
        if (Math.abs(p.y - sim.pos.y) > 2.5) continue;
        for (const c of carPts) {
          const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
          if (d > p.r + 0.95 || speed < 0.6) continue;
          const nx = d > 0.01 ? dx / d : f.x, nz = d > 0.01 ? dz / d : f.z;
          const push = Math.max(speed * 1.05, 3) * (p.roll ? 1.25 : 1);
          p.vx = sim.vel.x * 1.05 + nx * push * 0.5; p.vz = sim.vel.z * 1.05 + nz * push * 0.5;
          p.vy = 2.5 + speed * (p.roll ? 0.3 : 0.18);
          p.wx = (R() - 0.5) * 14; p.wy = (R() - 0.5) * 10; p.wz = (R() - 0.5) * 14;
          if (!p.awake) { stats.knocked++; if (hooks.knock) hooks.knock(p, stats.knocked); }
          p.awake = true; p.rest = 0;
          sim.vel.multiplyScalar(1 - p.mass);
          if (hooks.tock) hooks.tock(Math.min(1, speed / 25), p.pitch);
          if (p.kind === 'crate') for (const q of props) if (q !== p && q.kind === 'crate' && Math.hypot(q.x - p.x, q.z - p.z) < 2.5) { q.awake = true; q.vy += 1.5 + R(); q.vx += (R() - 0.5) * 3 + nx * 2; q.vz += (R() - 0.5) * 3 + nz * 2; q.wx = (R() - 0.5) * 8; q.wz = (R() - 0.5) * 8; }
          break;
        }
      }
      /* props: integrate */
      let moved = false;
      for (const p of props) {
        if (!p.awake) continue;
        moved = true;
        p.vy -= 22 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.rx += p.wx * dt; p.ry += p.wy * dt; p.rz += p.wz * dt;
        const g = ground(p.x, p.z, p.y + 2);
        if (p.y < g) {
          p.y = g;
          if (p.vy < -1.2) p.vy *= -p.bounce; else p.vy = 0;
          const fr = p.roll ? 0.985 : 0.88;
          p.vx *= fr; p.vz *= fr; p.wx *= 0.75; p.wy *= 0.85; p.wz *= 0.75;
          if (!p.roll) { p.rx *= 0.9; p.rz *= 0.9; }   // settle upright-ish like a toy
          if (Math.hypot(p.vx, p.vz) < 0.12 && Math.abs(p.vy) < 0.3) { p.rest += dt; if (p.rest > 0.4) { p.awake = false; p.vx = p.vz = p.vy = 0; } }
        }
        if (g < -0.5 && p.y < 0) { p.awake = false; p.respawn = 6; }      // fell in the sea
        write(p);
      }
      if (moved) rehash();
      for (const p of props) if (p.respawn != null) { p.respawn -= dt; if (p.respawn <= 0) { Object.assign(p, { x: p.home.x, y: p.home.y, z: p.home.z, ry: p.home.ry, rx: 0, rz: 0, respawn: null }); write(p); rehash(); } }

      /* chai: spin, bob, collect */
      chai.forEach((c, i) => {
        if (c.got) { D.scale.setScalar(0.0001); D.position.set(c.x, -50, c.z); D.updateMatrix(); chaiMesh.setMatrixAt(i, D.matrix); haloMesh.setMatrixAt(i, D.matrix); return; }
        const y = c.y + Math.sin(t * 2 + i) * 0.18;
        D.position.set(c.x, y, c.z); D.rotation.set(0, t * 1.6 + i, 0); D.scale.setScalar(1.25); D.updateMatrix(); chaiMesh.setMatrixAt(i, D.matrix);
        D.position.y = y + 0.35; D.rotation.set(Math.PI / 2, 0, t); D.scale.setScalar(1 + Math.sin(t * 3 + i) * 0.08); D.updateMatrix(); haloMesh.setMatrixAt(i, D.matrix);
        if (Math.hypot(c.x - sim.pos.x, c.z - sim.pos.z) < 3.2 && Math.abs(c.y - (sim.pos.y + 1)) < 2.6) {
          c.got = true; api.collected.add(i);
          if (hooks.chai) hooks.chai(api.collected.size, chai.length, c);
        }
      });
      chaiMesh.instanceMatrix.needsUpdate = true; haloMesh.instanceMatrix.needsUpdate = true;

      /* pigeons */
      const dG = Math.hypot(sim.pos.x - 900, sim.pos.z - 1046);
      if (dG < 30 && speed > 3) for (const b of birds) if (!b.flying && Math.hypot(b.x - sim.pos.x, b.z - sim.pos.z) < 13) { scatter(sim.pos, 1); break; }
      if (flockAway > 0) flockAway -= dt;
      birds.forEach((b, i) => {
        if (b.flying) {
          b.t += dt;
          if (b.t < 7) { b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.vy *= 0.995; b.ry = Math.atan2(b.vx, b.vz); }
          else {   // circle back and land
            const dx = b.hx - b.x, dz = b.hz - b.z, dist = Math.hypot(dx, dz);
            const sp = Math.min(9, dist * 1.5 + 1);
            b.x += dx / (dist || 1) * sp * dt; b.z += dz / (dist || 1) * sp * dt;
            b.y += ((plaza.h + 0.05) - b.y) * Math.min(1, dt * 0.8);
            b.ry = Math.atan2(dx, dz);
            if (dist < 0.3 && b.y < plaza.h + 0.3) { b.flying = false; b.y = plaza.h + 0.05; }
          }
          const flap = Math.sin(t * 30 + b.ph) * 0.4;
          D.position.set(b.x, b.y, b.z); D.rotation.set(0, b.ry, flap); D.scale.set(1, 1, 1);
        } else {
          const peck = Math.max(0, Math.sin(t * 3 + b.ph * 3)) * 0.35;
          D.position.set(b.x, b.y, b.z); D.rotation.set(peck, b.ry + Math.sin(t * 0.5 + b.ph) * 0.4, 0); D.scale.setScalar(1);
        }
        D.updateMatrix(); birdMesh.setMatrixAt(i, D.matrix);
      });
      birdMesh.instanceMatrix.needsUpdate = true;

      /* traffic */
      for (const tr of traffic) {
        // slow for the player when they're close ahead in our direction
        const fx = Math.sin(tr.yaw), fz = Math.cos(tr.yaw);
        const dx = sim.pos.x - tr.x, dz = sim.pos.z - tr.z;
        const ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
        const blocked = ahead > 0 && ahead < 14 && side < 3.2 && Math.abs(sim.pos.y - tr.y) < 3;
        const target = blocked ? 0 : tr.vmax;
        tr.v += Math.max(-9 * dt, Math.min(3 * dt, target - tr.v));
        tr.s += tr.v * dt * tr.dir;
        if (tr.s > tr.r.trim1 + tr.r.T.hw || tr.s < tr.r.trim0 - tr.r.T.hw) {
          // pick the next road at the junction
          const nodeId = tr.dir > 0 ? tr.r.to : tr.r.from;
          const opts = nodeRoads(nodeId).filter(e => e.road !== tr.r);
          const nxt = opts.length ? opts[Math.floor(R() * opts.length)] : { road: tr.r, end: tr.dir > 0 ? 1 : 0 };
          tr.r = nxt.road; tr.dir = nxt.end === 0 ? 1 : -1; tr.s = nxt.end === 0 ? tr.r.trim0 : tr.r.trim1;
        }
        placeTraffic(tr);
        // bumper cars: the player can shove traffic around
        const hitD = tr.kind === 3 ? 2.2 : 1.6;
        for (const c of carPts) {
          const ex = tr.x - c.x, ez = tr.z - c.z, d = Math.hypot(ex, ez);
          if (d < hitD + 0.9 && Math.abs(sim.pos.y - tr.y) < 2) {
            const nx = ex / (d || 1), nz = ez / (d || 1);
            const pen = hitD + 0.9 - d;
            sim.pos.x -= nx * pen * 0.7; sim.pos.z -= nz * pen * 0.7;
            const vn = sim.vel.x * nx + sim.vel.z * nz;
            if (vn > 0) {
              const k = tr.kind === 3 ? 1.6 : 1.25;
              sim.vel.x -= nx * vn * k; sim.vel.z -= nz * vn * k;
              tr.spinV += (R() < 0.5 ? -1 : 1) * Math.min(8, vn * 0.5); tr.bump = Math.min(1, vn / 15);
              if (hooks.bump) hooks.bump(tr, vn);
            }
            break;
          }
        }
        tr.spin += tr.spinV * dt; tr.spinV *= Math.exp(-dt * 2.5); tr.spin *= Math.exp(-dt * 1.2);
        tr.bump *= Math.exp(-dt * 4);
        D.position.set(tr.x, tr.y + tr.bump * 0.6, tr.z); D.rotation.set(0, tr.yaw + tr.spin, tr.bump * 0.2); D.scale.setScalar(1); D.updateMatrix();
        tMeshes[tr.kind].setMatrixAt(tr.mi, D.matrix);
      }
      tMeshes.forEach(m => { m.instanceMatrix.needsUpdate = true; });
    },
  };
  function scatter(from, strength) {
    let n = 0;
    for (const b of birds) {
      if (b.flying) continue;
      const dx = b.x - from.x, dz = b.z - from.z, d = Math.hypot(dx, dz) || 1;
      b.flying = true; b.t = 0; n++;
      b.vx = dx / d * (4 + R() * 4) + (R() - 0.5) * 3; b.vz = dz / d * (4 + R() * 4) + (R() - 0.5) * 3; b.vy = 4 + R() * 4 * strength;
    }
    if (n && hooks.pigeons && flockAway <= 0) { flockAway = 8; hooks.pigeons(n); }
  }
  // initial placement
  api.update(0, 0, null, { pos: new V(1e6, 0, 1e6), vel: new V(), speed: 0, forward: o => o.set(0, 0, 1) });
  scene.add(group);
  return api;
}
