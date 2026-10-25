/* Mumbai GP — game controller: renderer, state machine, loop, HUD, panels, settings. */
import * as THREE from 'three';
import { VehicleSim, FixedStepper, CAR_SPEC } from '../vehicle/sim.js';
import { buildCar } from '../vehicle/car-model.js';
import { Input, CONTROLS } from '../core/input.js';
import { CarAudio } from '../core/audio.js';
import { CameraRig, ShotScript } from '../core/camera.js';
import { loadSettings, saveSettings, resolveQuality, QUALITY, ASSISTS, progressStore, webglSupport } from '../core/settings.js';
import { Atmosphere, TIMES } from './atmosphere.js';
import { createPipeline } from '../core/post.js';
import { setMaxAnisotropy, TEX } from '../core/texgen.js';
import { buildWorld } from './world.js';
import { buildBuildings } from './buildings.js';
import { buildLandmarks } from './landmarks.js';
import { buildProps } from './props.js';
import { buildPlay } from './play.js';
import { renderBaseMap, Minimap } from './minimap.js';
import { Navigator, pointAlong } from './navigation.js';
import { PLACES, GP_ROUTE, SPAWN } from './layout.js';
import { panelContent } from '../ui/panels.js';

window.__mumbaiBoot = true;
const $ = id => document.getElementById(id);
const settings = loadSettings();
const Q = resolveQuality(settings);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

const support = webglSupport();
if (!support.ok) {
  $('loadStage').textContent = 'WebGL unavailable';
  $('loadErr').classList.remove('hidden');
  $('loadErr').innerHTML = `${support.reason} <a style="color:#fff" href="portfolio.html">Open the portfolio page instead →</a>`;
  throw new Error('no webgl');
}

/* ---------------- renderer / scene ---------------- */
// With post-processing on, MSAA happens in the composer's multisampled target; otherwise on the canvas.
const renderer = new THREE.WebGLRenderer({ antialias: Q.antialias || !Q.post || !support.webgl2, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = Q.shadows > 0;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.className = 'view';
document.body.prepend(renderer.domElement);
setMaxAnisotropy(renderer);
TEX.facadeSize = Q.texSize || 512; TEX.groundSize = Q.texSize || 512;
renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); toast('Graphics context lost', 'Reload the page to continue'); });

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.15, Q.far);
const atmo = new Atmosphere(renderer, scene);
atmo.setShadowQuality(Q, camera);
atmo.set(settings.time);

/* render pipeline (src/core/post.js) */
let pipeline = null;

/* ---------------- loading ---------------- */
const progress = (label, f) => { $('loadStage').textContent = label; $('loadBar').style.width = Math.round(f * 100) + '%'; };
let world, car, sim, stepper, rig, input, audio, nav, minimap, bigmap;
const state = { mode: 'loading', gp: false, target: null, routeIdx: 0, lapStart: 0, lapRunning: false, panelFor: null,
  visited: new Set(progressStore.get('mumbai.visited', [])), safe: null, flipT: 0, prompt: null, routeTimer: 0, route: null,
  trap: { max: 0, on: false }, frameMs: 16, slowFrames: 0 };

async function boot() {
  try {
    world = await buildWorld({
      scene, atmo, quality: Q, progress,
      extras: [['Raising Marine Drive & the skyline', Object.assign(buildBuildings, { layerName: 'buildings' })], ['Carving the landmarks', Object.assign(buildLandmarks, { layerName: 'landmarks' })], ['Planting palms and parking taxis', Object.assign(buildProps, { layerName: 'props' })], ['Scattering cones, chai and pigeons', Object.assign(buildPlay, { layerName: 'play' })]],
    });
  } catch (e) {
    console.error(e);
    $('loadErr').classList.remove('hidden');
    $('loadErr').innerHTML = `Could not build the city (${e.message}). <a style="color:#fff" href="portfolio.html">Open the portfolio page →</a>`;
    return;
  }
  pipeline = await createPipeline(renderer, scene, camera, Q);
  atmo.listeners.push(T => pipeline.setNight(atmo.night.value));
  pipeline.setNight(atmo.night.value);
  car = buildCar();
  scene.add(car.root, car.contactShadow);
  nav = new Navigator(world.net);
  sim = new VehicleSim(CAR_SPEC, world);
  applyAssists();
  spawnAtStart();
  stepper = new FixedStepper(sim, 120);
  rig = new CameraRig(camera, (x, z, y) => world.groundAt(x, z, y));
  rig.mode = settings.camera;
  if (world.layers.buildings) rig.occluder = (x, z) => world.layers.buildings.occAt(x, z);
  input = new Input();
  audio = new CarAudio(); audio.volume = settings.volume; audio.muted = settings.muted;
  const base = renderBaseMap(world.net);
  minimap = new Minimap($('minimap'), base, world.net);
  bigmap = new Minimap($('bigmapCanvas'), base, world.net); bigmap.big = true;
  for (const id of state.visited) { minimap.found.add(id); bigmap.found.add(id); }
  // headlight for night driving (no visible lamp on the car, just light on the road)
  const head = new THREE.SpotLight(0xfff1dc, 0, 70, 0.55, 0.6, 1.4);
  head.position.set(0, 0.6, 1.2); head.target.position.set(0, -1.5, 22);
  car.body.add(head, head.target); car.headlight = head;
  atmo.listeners.push(() => updateHeadlight());
  updateHeadlight();
  // fog uniforms + cascaded-shadow defines on every material, then pre-compile so the first frames don't hitch
  atmo.prepareMaterials(scene);
  atmo.fitCascades(camera, 78);
  carPose();
  rig.snapTo(sim.pos, sim.quat);
  rig.update(0.016, sim.pos, sim.quat, sim);
  renderer.compile(scene, camera);
  render();
  progress(`Ready — city built in ${(world.buildMs / 1000).toFixed(1)} s`, 1);
  $('btnGP').disabled = false; $('btnFree').disabled = false;
  $('btnGP').focus();
  wireUI();
  wirePlay();
  state.mode = 'ready';
  window.__game = { sim, world, state, rig, camera, input, nav, atmo, startDrive, recover, renderer, scene, advanceSim, openPanel, closePanel, pipeline, render };   // debugging / automated tests
  requestAnimationFrame(loop);
}

function applyAssists() {
  const a = ASSISTS[settings.assists] || ASSISTS.standard;
  sim.assists.abs = a.abs; sim.assists.tc = a.tc; sim.assists.stability = a.stability;
  sim.assists.autoGear = settings.gearbox !== 'manual';
}
function updateHeadlight() { if (car && car.headlight) car.headlight.intensity = atmo.night.value > 0.3 ? 60 * atmo.night.value : 0; if (world) world.setNight(atmo.night.value); }

/* ---------------- start / intro ---------------- */
function start(gp) {
  audio.start();
  state.gp = gp;
  $('loader').classList.add('hidden');
  if (gp) { state.routeIdx = 1; $('lap').style.display = 'block'; }
  else $('lap').style.display = 'none';
  pickTarget();
  playIntro();
}
function playIntro() {
  state.mode = 'intro';
  $('introTitle').classList.remove('hidden'); $('skipIntro').style.display = 'inline-flex';
  const sp = sim.pos, f = sim.forward(new THREE.Vector3());
  const toy = rig.mode === 'toy';
  const behind = toy ? [sp.x - f.x * 15.5, sp.y + 9.2, sp.z - f.z * 15.5] : [sp.x - f.x * 5.8, sp.y + 1.65, sp.z - f.z * 5.8];
  const keys = [
    { t: 0, pos: [2500, 1750, 3000], look: [250, 0, -380], fov: 30 },
    { t: 3.6, pos: [1500, 460, 1750], look: [860, 0, 1000], fov: 36 },
    { t: 6.6, pos: [1012, 38, 1118], look: [905, 14, 1048], fov: 44 },
    { t: 9.0, pos: [sp.x + 16, sp.y + 7, sp.z + 12], look: [sp.x, sp.y + 0.6, sp.z], fov: 48 },
    { t: 10.6, pos: behind, look: [sp.x + f.x * 3.6, sp.y + 0.62, sp.z + f.z * 3.6], fov: toy ? 38 : 58 },
  ];
  const titles = [[0, 'Bombay · the Arabian Sea', 'MUMBAI <span>GP</span>'], [3.6, 'Apollo Bunder · Colaba', 'GRID <span>FORMING</span>'], [6.6, 'Gateway of India', state.gp ? 'FOLLOW THE <span>ROUTE</span>' : 'FREE <span>ROAM</span>'], [9.0, 'Car 27 · Laloo Racing', 'LIGHTS <span>OUT</span>']];
  // open the view for the overview shot, then ease the haze back in
  camera.far = 9000; camera.updateProjectionMatrix();
  const fog0 = atmo.T.fogD;
  rig.script = new ShotScript(keys, () => endIntro());
  const upd = rig.script.update.bind(rig.script);
  rig.script.update = (dt, r) => { const k = Math.min(1, rig.script.t / 7); scene.fog.density = fog0 * (0.15 + 0.85 * k * k); return upd(dt, r); };
  rig.script.titles = titles;
}
function endIntro() {
  if (state.mode !== 'intro') return;
  rig.script = null;
  camera.far = Q.far; camera.updateProjectionMatrix(); scene.fog.density = atmo.T.fogD;
  $('introTitle').classList.add('hidden'); $('skipIntro').style.display = 'none';
  rig.snapTo(sim.pos, sim.quat);
  startDrive();
  if (state.gp) startLights();
  else toast('Free roam', 'Explore — destinations are marked on the map');
  setTimeout(() => { $('help').style.opacity = 0; }, 12000);
}
function startDrive() {
  state.mode = 'drive';
  $('hud').classList.remove('hidden');
  if (isTouch) $('touch').style.display = 'block';
  input.setEnabled(true);
  stepper.resync();
  audio.resume();
}

/* five red lights, then lights out */
function startLights() {
  const L = (world.layers.landmarks && world.layers.landmarks.startLights) || [];
  input.setEnabled(false);
  state.lightsOut = false;
  L.forEach(m => { m.emissiveIntensity = 0; });
  for (let k = 0; k < 5; k++) setTimeout(() => { if (L[k]) L[k].emissiveIntensity = 5; audio.beep(false); }, 600 + k * 750);
  setTimeout(() => {
    L.forEach(m => { m.emissiveIntensity = 0; });
    audio.beep(true);
    input.setEnabled(state.mode === 'drive');
    state.lightsOut = true;
    state.lapStart = performance.now(); state.lapRunning = true;
    toast('Lights out — go!', 'Follow the red line to every chapter; the clock stops at the Pit Wall.');
  }, 600 + 4 * 750 + 700 + Math.random() * 700);
}

/* ---------------- targets / route ---------------- */
function placeById(id) { return PLACES.find(p => p.id === id); }
function pickTarget() {
  if (state.gp) {
    const id = GP_ROUTE[state.routeIdx];
    state.target = id ? placeById(id) : null;
  } else {
    // nearest unvisited chapter, else nearest unvisited discovery
    const pos = sim.pos;
    const left = PLACES.filter(p => !state.visited.has(p.id));
    const pool = left.filter(p => p.kind === 'chapter').length ? left.filter(p => p.kind === 'chapter') : left;
    pool.sort((a, b) => Math.hypot(a.x - pos.x, a.z - pos.z) - Math.hypot(b.x - pos.x, b.z - pos.z));
    state.target = pool[0] || placeById('pitwall');
  }
  minimap.target = bigmap.target = state.target;
  state.routeTimer = 0;
}
function updateRoute(dt) {
  state.routeTimer -= dt;
  if (state.routeTimer > 0 || !state.target) return;
  state.routeTimer = 0.6;
  if (!settings.guide && !state.gp) { state.route = null; minimap.setRoute(null); bigmap.setRoute(null); return; }
  const r = nav.route(sim.pos.x, sim.pos.z, state.target.x, state.target.z);
  state.route = r;
  minimap.setRoute(r ? r.points : null); bigmap.setRoute(r ? r.points : null);
}

/* ---------------- destinations ---------------- */
function checkPlaces() {
  const p = sim.pos;
  let near = null;
  for (const pl of PLACES) {
    const d = Math.hypot(pl.x - p.x, pl.z - p.z);
    if (d > pl.r) continue;
    if (pl.elevated && p.y < 8) continue;
    if (!pl.elevated && p.y > world.terr.heightAt(pl.x, pl.z) + 6 && pl.id !== 'seaLink') continue;
    near = pl;
    if (!state.visited.has(pl.id)) {
      state.visited.add(pl.id); minimap.found.add(pl.id); bigmap.found.add(pl.id);
      if (world.layers.landmarks) { world.layers.landmarks.setVisited(pl.id); world.layers.landmarks.celebrate(pl.id); }
      progressStore.set('mumbai.visited', [...state.visited]);
      audio.chime();
      toast(pl.kind === 'chapter' ? 'Chapter unlocked' : 'Landmark discovered', pl.name);
      if (pl.kind === 'chapter' && sim.speed < 17) { openPanel(pl.id); }
    }
    if (state.target && pl.id === state.target.id) advanceTarget();
  }
  if (near !== state.prompt) {
    state.prompt = near;
    if (near && state.mode === 'drive') { $('promptK').textContent = near.kind === 'chapter' ? 'Portfolio chapter' : 'Landmark'; $('promptT').textContent = near.name; $('prompt').style.display = 'flex'; }
    else $('prompt').style.display = 'none';
  }
}
function advanceTarget() {
  if (state.gp) {
    if (state.target.final) { finishGP(); return; }
    state.routeIdx++;
    toast(`Sector ${state.routeIdx - 1} complete`, fmt((performance.now() - state.lapStart) / 1000));
  }
  pickTarget();
}
function finishGP() {
  const t = (performance.now() - state.lapStart) / 1000;
  state.lapRunning = false;
  const best = progressStore.get('mumbai.best', null);
  if (best == null || t < best) { progressStore.set('mumbai.best', t); toast('New best — Mumbai GP', fmt(t)); }
  else toast('Finish — Mumbai GP', `${fmt(t)} · best ${fmt(best)}`);
  state.gp = false; state.target = null;
  openPanel('pitwall');
  pickTarget();
}
const fmt = s => { const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };

/* ---------------- panels ---------------- */
function openPanel(id) {
  const c = panelContent(id); if (!c) return;
  state.panelFor = id;
  state.modeBeforePanel = state.mode === 'pause' ? 'drive' : state.mode;
  state.mode = 'panel';
  input.setEnabled(false);
  audio.suspend();
  $('panelK').textContent = c.kicker; $('panelTitle').textContent = c.title; $('panelMeta').textContent = c.meta || '';
  $('panelHead').style.background = c.accent; $('panelHead').style.color = c.dark ? '#14161b' : '#fff';
  $('panelBody').innerHTML = c.html;
  const foot = $('panelFoot');
  foot.innerHTML = (c.footer || '') + '<button class="btn primary" id="panelClose">Back to the road <kbd>Esc</kbd></button>';
  $('panelClose').onclick = closePanel;
  $('panelWrap').style.display = 'flex';
  $('panelClose').focus();
}
function closePanel() {
  $('panelWrap').style.display = 'none';
  state.panelFor = null;
  state.mode = 'drive';
  input.setEnabled(true);
  stepper.resync();            // continue exactly where we stopped
  audio.resume();
}

/* ---------------- spawn ---------------- */
/** Place the car in the left lane (India drives on the left) of the road nearest (x, z). */
function placeOnRoad(x, z, heading) {
  const loc = nav.locate(x, z), r = loc.road, i = loc.i;
  const h1 = Math.atan2(r.tx[i], r.tz[i]);
  const fwd = Math.abs(Math.atan2(Math.sin(h1 - heading), Math.cos(h1 - heading))) < Math.PI / 2;
  const lane = (r.T.median / 2 + (r.T.hw - r.T.median / 2) * 0.5) * (fwd ? 1 : -1);
  const px = r.x[i] + r.tz[i] * lane, pz = r.z[i] - r.tx[i] * lane;
  const y = world.groundAt(px, pz, r.h[i] + 3);
  sim.reset(new THREE.Vector3(px, y, pz), fwd ? h1 : h1 + Math.PI);
}
function spawnAtStart() { placeOnRoad(SPAWN.x, SPAWN.z, SPAWN.heading); }

/* ---------------- play hooks, secrets, achievements ---------------- */
let play;
const ach = new Set(progressStore.get('mumbai.ach', []));
function achieve(id, title, sub) {
  if (ach.has(id)) return;
  ach.add(id); progressStore.set('mumbai.ach', [...ach]);
  audio.pickup(4); toast(`Secret · ${title}`, sub);
}
function wirePlay() {
  play = world.layers.play;
  play.restoreCollected(progressStore.get('mumbai.chai', []));
  $('cntChai').textContent = `${play.collected.size}/${play.chai.length}`;
  if (play.collected.size >= play.chai.length) car.setLivery('gold');
  let lastReply = 0, firstBump = true;
  play.setHooks({
    chai(n, total) {
      audio.pickup(n);
      progressStore.set('mumbai.chai', [...play.collected]);
      $('cntChai').textContent = `${n}/${total}`;
      toast(`Cutting chai ${n}/${total}`, n === total ? 'All of them! Gold livery unlocked.' : n === 1 ? 'Collect all 27 for a surprise' : '');
      if (n === total) { car.setLivery('gold'); achieve('chai', 'Chai connoisseur', 'Every cutting chai in Mumbai'); }
    },
    tock(strength, pitch) { audio.tock(strength, pitch); rig.addShake(0.05 * strength); },
    knock(p, n) { if (n === 25) achieve('cones', 'Traffic-cone menace', '25 props sent flying'); },
    pigeons() { audio.flutter(); achieve('pigeons', 'Pigeon whisperer', 'The pigeons of Apollo Bunder are not impressed'); },
    reply(n) { const now = performance.now(); if (now - lastReply < 1500) return; lastReply = now; setTimeout(() => audio.horn(1.38, 0.22, 0.09), 450); if (n > 1) setTimeout(() => audio.horn(0.82, 0.3, 0.08), 800); if (Math.random() < 0.4) toast('Horn OK Please!'); },
    bump(tr, vn) { audio.tock(Math.min(1, vn / 12), 0.6); rig.addShake(Math.min(0.4, vn * 0.03)); if (firstBump && vn > 4) { firstBump = false; toast('Bumper cars!', 'No toy taxis were harmed'); } },
  });
}
const sec = { air: 0, airBest: progressStore.get('mumbai.air', 0), donut: 0, lastYaw: null };
function secrets(dt) {
  // airtime
  if (sim.contacts === 0 && sim.pos.y > world.groundAt(sim.pos.x, sim.pos.z, sim.pos.y) + 0.5) sec.air += dt;
  else if (sec.air > 0) {
    if (sec.air > 0.55) {
      const best = sec.air > sec.airBest;
      if (best) { sec.airBest = sec.air; progressStore.set('mumbai.air', sec.air); }
      toast(`Air time ${sec.air.toFixed(1)} s`, best ? 'Personal best!' : '');
      if (sec.air > 1.2) achieve('air', 'Frequent flyer', 'More than 1.2 s in the air');
    }
    sec.air = 0;
  }
  // through the Gateway arch
  if (Math.abs(sim.pos.z - 1052) < 3.2 && sim.pos.x > 919 && sim.pos.x < 933 && sim.speed > 3) achieve('gateway', 'Through the Gateway', 'You drove through the arch');
  // donut on Shivaji Park
  const yaw = sim.heading;
  if (sec.lastYaw != null && Math.hypot(sim.pos.x + 60, sim.pos.z + 1120) < 70 && sim.speed > 4 && Math.abs(sim.bodySlip) > 0.35) {
    let d = yaw - sec.lastYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); sec.donut += Math.abs(d);
    if (sec.donut > Math.PI * 2) achieve('donut', 'Shivaji Park donut', 'A full 360° slide on the maidan');
  } else sec.donut = Math.max(0, sec.donut - dt * 2);
  sec.lastYaw = yaw;
  // top speed on the Sea Link
  if (sim.forwardSpeed * 3.6 > 280 && sim.pos.y > 10) achieve('v280', '280 over Mahim Bay', 'Flat out on the Sea Link');
}

/* ---------------- recovery ---------------- */
function recover(toSafe = false) {
  let x, z, heading;
  if (toSafe && state.safe) ({ x, z, heading } = state.safe);
  else {
    const loc = nav.locate(sim.pos.x, sim.pos.z) ;
    const r = loc.road, i = loc.i;
    x = r.x[i]; z = r.z[i];
    const h1 = Math.atan2(r.tx[i], r.tz[i]);
    const cur = sim.heading;
    const d = Math.atan2(Math.sin(h1 - cur), Math.cos(h1 - cur));
    heading = Math.abs(d) < Math.PI / 2 ? h1 : h1 + Math.PI;
    // keep left (India drives on the left): offset to the left lane
    const lane = r.T.median / 2 + (r.T.hw - r.T.median / 2) * 0.5;
    const side = heading === h1 ? 1 : -1;
    x += r.tz[i] * lane * side * -1; z += -r.tx[i] * lane * side * -1;
  }
  const fade = $('fade'); fade.style.opacity = 1;
  setTimeout(() => {
    const y = world.groundAt(x, z, sim.pos.y + 40);
    sim.reset(new THREE.Vector3(x, y, z), heading);
    sim.pos.y = Math.max(sim.pos.y, y + 0.35);
    stepper.resync(); rig.snapTo(sim.pos, sim.quat);
    fade.style.opacity = 0;
  }, 260);
}

/* ---------------- HUD ---------------- */
const shiftLeds = [];
for (let i = 0; i < 15; i++) { const e = document.createElement('i'); $('shift').appendChild(e); shiftLeds.push(e); }
const toastBox = $('toasts');
function toast(title, sub) {
  const t = document.createElement('div'); t.className = 'toast';
  t.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
  toastBox.appendChild(t);
  while (toastBox.children.length > 3) toastBox.firstChild.remove();
  setTimeout(() => t.remove(), 3600);
}
let camLabelT = 0;
function hud(dt) {
  const kmh = Math.abs(sim.forwardSpeed) * 3.6;
  const mph = settings.units === 'mph';
  $('speedNum').textContent = Math.round(mph ? kmh / 1.609 : kmh);
  $('speedUnit').textContent = mph ? 'MPH' : 'KM/H';
  $('gearNum').textContent = sim.gear === -1 ? 'R' : sim.gear;
  const rpmF = Math.min(1, (sim.rpm - 4000) / (CAR_SPEC.limiterRpm - 4000));
  $('rpmArc').setAttribute('stroke-dasharray', `${Math.max(0, rpmF) * 160} 400`);
  $('rpmArc').setAttribute('stroke', rpmF > 0.92 ? '#4aa3ff' : rpmF > 0.75 ? '#ff3b3b' : '#d81f26');
  const lit = Math.round(Math.max(0, (sim.rpm - 8500) / (CAR_SPEC.upshiftRpm - 8500)) * 15);
  shiftLeds.forEach((e, i) => e.style.background = i < lit ? (i < 5 ? '#26d07c' : i < 10 ? '#ff3b3b' : '#4aa3ff') : '');
  $('thrBar').style.height = (input.state.throttle * 100) + '%';
  $('brkBar').style.height = (input.state.brake * 100) + '%';
  // objective
  const T = state.target;
  if (T) {
    $('objK').textContent = state.gp ? `Mumbai GP · sector ${state.routeIdx}/${GP_ROUTE.length - 1}` : (T.kind === 'chapter' ? 'Next portfolio chapter' : 'Next landmark');
    $('objT').textContent = T.name;
    const dist = state.route ? state.route.length : Math.hypot(T.x - sim.pos.x, T.z - sim.pos.z);
    $('objD').textContent = dist > 1000 ? (dist / 1000).toFixed(1) + ' km' : Math.round(dist / 10) * 10 + ' m';
    const aim = state.route ? pointAlong(state.route.points, 45) : [T.x, T.z];
    const ang = Math.atan2(aim[0] - sim.pos.x, aim[1] - sim.pos.z) - sim.heading;
    $('objArrow').style.transform = `rotate(${-ang}rad)`;
  } else { $('objT').textContent = 'All destinations found'; $('objD').textContent = ''; }
  const chapters = PLACES.filter(p => p.kind === 'chapter'), disc = PLACES.filter(p => p.kind === 'discovery');
  $('cntCh').textContent = `${chapters.filter(p => state.visited.has(p.id)).length}/${chapters.length}`;
  $('cntDi').textContent = `${disc.filter(p => state.visited.has(p.id)).length}/${disc.length}`;
  if (state.gp && state.lapRunning) {
    $('lapTime').textContent = fmt((performance.now() - state.lapStart) / 1000);
    $('lapSector').textContent = `S${state.routeIdx}`;
  }
  const best = progressStore.get('mumbai.best', null); $('lapBest').textContent = best ? fmt(best) : '—';
  if (camLabelT > 0) { camLabelT -= dt; $('camLabel').style.opacity = camLabelT > 0 ? 1 : 0; }
  minimap.draw(sim.pos.x, sim.pos.z, sim.heading);
  if (bigmapOpen) bigmap.draw(sim.pos.x, sim.pos.z, sim.heading);
}

/* speed traps on the Sea Link and the freeway */
function speedTrap() {
  const loc = sim.wheels[0].surface.road;
  const onFast = loc && (loc.type === 'sealink' || loc.type === 'freeway') && loc.deckF && sim.pos.y > 6;
  if (onFast) { state.trap.on = true; state.trap.max = Math.max(state.trap.max, sim.forwardSpeed * 3.6); }
  else if (state.trap.on) {
    state.trap.on = false;
    const v = Math.round(state.trap.max);
    if (v > 120) {
      const best = progressStore.get('mumbai.trap', 0);
      if (v > best) progressStore.set('mumbai.trap', v);
      toast(`Speed trap · ${v} km/h`, v > best ? 'New personal best' : `Best ${best} km/h`);
    }
    state.trap.max = 0;
  }
}

/** One frame of gameplay: physics (fixed-step inside), recovery, play layer, destinations. */
function driveTick(dt, inp) {
  stepper.advance(dt, inp);
  const up = sim.up(new THREE.Vector3());
  if (up.y < 0.25) state.flipT += dt; else state.flipT = 0;
  const submerged = sim.wheels.every(w => !w.contact) && world.groundAt(sim.pos.x, sim.pos.z, sim.pos.y) < 0.05 && sim.pos.y < 0.4;
  if (state.flipT > 1.8 || submerged || sim.pos.y < -3) { state.flipT = 0; toast('Car recovered'); recover(submerged || sim.pos.y < -3); }
  if (sim.contacts === 4 && sim.wheels.every(w => w.surface.kind === 'road') && up.y > 0.95) {
    state.safeT = (state.safeT || 0) + dt;
    if (state.safeT > 1) { state.safeT = 0; state.safe = { x: sim.pos.x, z: sim.pos.z, heading: sim.heading }; }
  }
  if (sim.impact > 1500) rig.addShake(Math.min(1, sim.impact / 12000));
  let rough = 0; for (const w of sim.wheels) if (w.contact) rough = Math.max(rough, w.surface.rough || 0);
  if (rough > 0.02 && sim.speed > 8) rig.addShake(0.02);
  audio.update(sim, rough);
  play.update(clockT, dt, camera, sim);
  checkPlaces();
  secrets(dt);
  updateRoute(dt);
  speedTrap();
}
/** Test hook: advance gameplay by `seconds` of simulated time, independent of render speed. */
function advanceSim(seconds, inp = {}) {
  const base = { throttle: 0, brake: 0, steer: 0, handbrake: false, shiftUp: false, shiftDown: false, ...inp };
  for (let t = 0; t < seconds - 1e-9; t += 1 / 30) { if (state.mode !== 'drive') break; clockT += 1 / 30; driveTick(1 / 30, { ...base }); }
  carPose(); rig.update(1 / 30, pos, quat, sim);
}

/* ---------------- loop ---------------- */
let last = performance.now(), bigmapOpen = false, clockT = 0;
const pos = new THREE.Vector3(), quat = new THREE.Quaternion();
function carPose() {
  if (stepper) stepper.pose(pos, quat); else { pos.copy(sim.pos); quat.copy(sim.quat); }
  const g = world.groundAt(pos.x, pos.z, pos.y + 0.5);
  sim.brakeLight = input && (input.state.brake > 0.2 && sim.gear > 0);
  car.update(pos, quat, sim, 1 / 60, g);
}
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  clockT += dt;
  state.frameMs = state.frameMs * 0.95 + dt * 1000 * 0.05;
  if (state.mode === 'pause' || state.mode === 'panel' || state.mode === 'ready' && clockT > 0.5 && state.renderedReady) {
    if (state.mode === 'ready') { /* idle behind the title card */ }
    return;
  }
  if (state.mode === 'ready') state.renderedReady = true;
  if (state.mode === 'drive') {
    driveTick(dt, input.update(dt));
    hud(dt);
    if (state.frameMs > 45 && Q.key !== 'low') { state.slowFrames += dt; if (state.slowFrames > 8) { state.slowFrames = -1e9; toast('Running slowly', 'Try a lower graphics quality in Pause → Settings'); } }
  } else if (state.mode === 'intro') {
    const s = rig.script;
    if (s && s.titles) {
      const cur = s.titles.filter(x => x[0] <= s.t).pop();
      if (cur) { $('introK').textContent = cur[1]; $('introT').innerHTML = cur[2]; }
    }
  }
  carPose();
  rig.update(dt, pos, quat, sim);
  camera.updateMatrixWorld();
  atmo.update(camera, pos, clockT);
  world.update(clockT, dt, camera);
  render();
  if (state.mode === 'drive' || state.mode === 'intro') pipeline.adapt(dt * 1000, dt);
}
function render() { pipeline ? pipeline.render(clockT) : renderer.render(scene, camera); }

/* ---------------- pause / settings ---------------- */
function pause() {
  if (state.mode !== 'drive') return;
  state.mode = 'pause';
  input.setEnabled(false); audio.suspend();
  $('pause').style.display = 'flex';
  showPane('settings');
}
function resume() {
  $('pause').style.display = 'none';
  state.mode = 'drive'; input.setEnabled(true); stepper.resync(); audio.resume();
}
function opt(label, key, options, apply, note = '') {
  const row = document.createElement('div'); row.className = 'setting';
  row.innerHTML = `<div>${label}${note ? `<div class="small" style="margin:2px 0 0">${note}</div>` : ''}</div><div class="opts"></div>`;
  const box = row.querySelector('.opts');
  for (const [val, txt] of options) {
    const b = document.createElement('button'); b.textContent = txt;
    if (settings[key] === val) b.classList.add('on');
    b.onclick = () => { settings[key] = val; saveSettings(settings); box.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); apply && apply(val); };
    box.appendChild(b);
  }
  return row;
}
function showPane(name) {
  document.querySelectorAll('#pause nav button').forEach(b => b.classList.toggle('on', b.dataset.pane === name));
  const pane = $('pausePane'); pane.innerHTML = '';
  if (name === 'resume') { resume(); return; }
  if (name === 'restart') { resume(); spawnAtStart(); stepper.resync(); rig.snapTo(sim.pos, sim.quat); if (state.gp) { state.routeIdx = 1; state.lapStart = performance.now(); state.lapRunning = true; pickTarget(); } return; }
  if (name === 'settings') {
    pane.innerHTML = '<h3>Settings</h3>';
    pane.appendChild(opt('Time of day', 'time', Object.entries(TIMES).map(([k, v]) => [k, v.label]), v => { atmo.set(v); updateHeadlight(); }));
    pane.appendChild(opt('Driving assists', 'assists', Object.entries(ASSISTS).map(([k, v]) => [k, v.label]), applyAssists, 'ABS, traction control and stability help'));
    pane.appendChild(opt('Gearbox', 'gearbox', [['auto', 'Automatic'], ['manual', 'Manual (E / Q)']], applyAssists));
    pane.appendChild(opt('Camera', 'camera', [['chase', 'Chase'], ['far', 'Far'], ['tcam', 'T-cam'], ['cockpit', 'Cockpit'], ['toy', 'High']], v => { rig.mode = v; }));
    pane.appendChild(opt('Route guidance (free roam)', 'guide', [[true, 'On'], [false, 'Off']], () => { state.routeTimer = 0; }));
    pane.appendChild(opt('Units', 'units', [['kmh', 'km/h'], ['mph', 'mph']]));
    pane.appendChild(opt('Graphics quality', 'quality', [['auto', 'Auto'], ...Object.entries(QUALITY).map(([k, v]) => [k, v.label])], () => toast('Graphics quality saved', 'Applies when the page reloads'), `Current: ${Q.label}`));
    const vol = document.createElement('div'); vol.className = 'setting';
    vol.innerHTML = `<div>Volume</div><div class="opts"><input type="range" min="0" max="1" step="0.05" value="${settings.volume}"><button class="${settings.muted ? 'on' : ''}">Mute</button></div>`;
    vol.querySelector('input').oninput = e => { settings.volume = +e.target.value; audio.setVolume(settings.volume); saveSettings(settings); };
    vol.querySelector('button').onclick = e => { settings.muted = !settings.muted; audio.setMuted(settings.muted); e.target.classList.toggle('on', settings.muted); saveSettings(settings); };
    pane.appendChild(vol);
    const reload = document.createElement('p'); reload.className = 'small';
    reload.innerHTML = `Renderer: ${support.webgl2 ? 'WebGL 2' : 'WebGL 1'} · ${Q.label} quality · city built in ${(world.buildMs / 1000).toFixed(1)} s · ${Math.round(1000 / state.frameMs)} fps`;
    pane.appendChild(reload);
  }
  if (name === 'controls') {
    pane.innerHTML = '<h3>Controls</h3><div class="controls">' + CONTROLS.map(([k, v]) => `<div>${k.split(' / ').map(x => `<kbd>${x}</kbd>`).join(' ')}</div><div>${v}</div>`).join('') + '</div>' +
      `<p class="small">Gamepad: left stick steers, RT throttle, LT brake, A handbrake, bumpers shift, Y camera, X interact, Start pause.<br>Touch: drag the left pad to steer; pedals on the right.<br>India drives on the left — the recovery puts you in the left lane.</p>`;
  }
  if (name === 'progress') {
    const ch = PLACES.filter(p => p.kind === 'chapter'), di = PLACES.filter(p => p.kind === 'discovery');
    const best = progressStore.get('mumbai.best', null), trap = progressStore.get('mumbai.trap', 0);
    const li = arr => arr.map(p => `<div class="setting"><div>${p.name}</div><div class="opts">${state.visited.has(p.id) ? `<button class="on" data-open="${p.id}">Read</button>` : '<span class="small" style="margin:0">Not found yet</span>'}</div></div>`).join('');
    pane.innerHTML = `<h3>Portfolio chapters</h3>${li(ch)}<h3 style="margin-top:22px">Landmarks</h3>${li(di)}<p class="small">Best Mumbai GP: ${best ? fmt(best) : '—'} · Top speed trap: ${trap || '—'} km/h</p>`;
    pane.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { $('pause').style.display = 'none'; state.mode = 'drive'; openPanel(b.dataset.open); });
  }
}

function wireUI() {
  $('btnGP').onclick = () => start(true);
  $('btnFree').onclick = () => start(false);
  $('skipIntro').onclick = () => rig.script && rig.script.skip();
  document.querySelectorAll('#pause nav button').forEach(b => b.onclick = () => showPane(b.dataset.pane));
  $('btnPause').onclick = pause;
  $('btnCam').onclick = () => input.fire('camera');
  $('btnMap').onclick = () => input.fire('map');
  $('promptBtn').onclick = () => input.fire('interact');
  $('panelWrap').addEventListener('click', e => { if (e.target === $('panelWrap')) closePanel(); });
  input.on('escape', () => {
    if (state.mode === 'intro') { rig.script && rig.script.skip(); return; }
    if (bigmapOpen) { toggleMap(); return; }
    if (state.mode === 'panel') closePanel();
    else if (state.mode === 'pause') resume();
    else if (state.mode === 'drive') pause();
  });
  input.on('camera', () => { const l = rig.cycle(); settings.camera = rig.mode; saveSettings(settings); $('camLabel').textContent = l; camLabelT = 1.5; });
  input.on('reset', () => recover(false));
  input.on('map', toggleMap);
  input.on('guide', () => { settings.guide = !settings.guide; saveSettings(settings); state.routeTimer = 0; toast(`Route guidance ${settings.guide ? 'on' : 'off'}`); });
  input.on('interact', () => { if (state.prompt && state.mode === 'drive') openPanel(state.prompt.id); });
  input.on('horn', () => { if (state.mode !== 'drive') return; audio.horn(); play.honk(sim); });
  addEventListener('keydown', e => { if (state.mode === 'intro' && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); rig.script && rig.script.skip(); } });
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    atmo.fitCascades(camera, 78);
    pipeline.setSize(innerWidth, innerHeight);
    sizeBigmap();
    if (state.mode !== 'drive') render();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state.mode === 'drive') pause(); });
  sizeBigmap();
  if (isTouch) wireTouch();
}
function sizeBigmap() { const c = $('bigmapCanvas'); const r = $('bigmap').getBoundingClientRect(); c.width = Math.max(300, (r.width || innerWidth * 0.84)); c.height = Math.max(300, (r.height || innerHeight * 0.88)); }
function toggleMap() {
  bigmapOpen = !bigmapOpen;
  $('bigmap').style.display = bigmapOpen ? 'block' : 'none';
  if (bigmapOpen) { sizeBigmap(); bigmap.draw(sim.pos.x, sim.pos.z, sim.heading); }
}
function wireTouch() {
  const t = input.touch; t.active = true;
  const pad = (el, on, off) => {
    el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); el.classList.add('on'); on(e); });
    el.addEventListener('pointermove', e => { if (el.hasPointerCapture(e.pointerId)) on(e); });
    const end = () => { el.classList.remove('on'); off(); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  };
  const knob = $('tSteer').querySelector('i');
  pad($('tSteer'), e => {
    const r = $('tSteer').getBoundingClientRect();
    const f = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2.2));
    t.steer = -f; knob.style.transform = `translateX(${f * r.width * 0.38}px)`;
  }, () => { t.steer = 0; knob.style.transform = ''; });
  pad($('tThr'), () => t.throttle = 1, () => t.throttle = 0);
  pad($('tBrk'), () => t.brake = 1, () => t.brake = 0);
  pad($('tHb'), () => t.handbrake = true, () => t.handbrake = false);
  pad($('tAct'), () => input.fire('interact'), () => {});
}

boot();
