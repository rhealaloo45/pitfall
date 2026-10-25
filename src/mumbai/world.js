/* Mumbai GP world assembly — builds every layer progressively and exposes
   the physics interface (surface / collide) used by the vehicle sim. */
import * as THREE from 'three';
import { buildNetwork } from './network.js';
import { buildTerrain, buildTerrainMeshes } from './terrain.js';
import { buildRoadMeshes } from './roads-mesh.js';
import { buildWater } from './water.js';
import { ColliderWorld } from './colliders.js';
import { buildFarField } from './farfield.js';
import { GROUND_GLSL, groundUniforms } from './ground.js';
import { PARKS, HILLS, DISTRICTS } from './layout.js';
import { vnoise } from './geo2d.js';
import { TEX } from '../core/texgen.js';

const tick = () => new Promise(r => setTimeout(r, 0));

/** How green unbuilt land is (0 = compacted urban earth, 1 = grass): maidans, gardens, the wooded hills, leafy districts. */
function greenAt(x, z) {
  let g = 0;
  for (const p of PARKS) {
    const c = Math.cos(p.rot), s = Math.sin(p.rot), lx = (x - p.x) * c + (z - p.z) * s, lz = -(x - p.x) * s + (z - p.z) * c;
    const e = Math.hypot(lx / p.rx, lz / p.rz);
    g = Math.max(g, 1 - Math.max(0, Math.min(1, (e - 0.95) / 0.25)));
  }
  for (const h of HILLS) { const d = Math.hypot(x - h.x, z - h.z) / h.r; if (h.h >= 9) g = Math.max(g, 0.85 * (1 - Math.max(0, Math.min(1, (d - 0.6) / 0.5)))); }
  let best = DISTRICTS[0], bd = Infinity;
  for (const d of DISTRICTS) { const dd = Math.hypot(d.x - x, d.z - z); if (dd < bd) { bd = dd; best = d; } }
  g = Math.max(g, best.tree * 0.45 * (0.5 + vnoise(x / 60, z / 60)));
  return Math.min(1, g);
}

export async function buildWorld({ scene, atmo, quality, progress = () => {}, extras = [] }) {
  const t0 = performance.now();
  const timings = {};
  const step = async (label, frac, fn) => {
    progress(label, frac); await tick();
    const a = performance.now(); const r = await fn(); timings[label] = Math.round(performance.now() - a);
    return r;
  };
  const net = await step('Surveying the coastline', 0.04, () => buildNetwork());
  const terr = await step('Grading the land', 0.12, () => buildTerrain(net));
  const colliders = new ColliderWorld();
  const roads = await step('Laying roads and bridges', 0.24, () => buildRoadMeshes(net, terr, colliders));
  scene.add(roads.group);
  const terrainMesh = await step('Planting the maidans', 0.34, () => buildTerrainMeshes(THREE, terr, {
    step: quality.terrainStep, webgl2: TEX.webgl2, texSize: quality.texSize || 512,
    ground: { GLSL: GROUND_GLSL, uniforms: groundUniforms }, greenAt,
  }));
  scene.add(terrainMesh);
  const water = await step('Filling the Arabian Sea', 0.4, () => buildWater(atmo, { far: quality.far }));
  scene.add(water.mesh);
  const farField = await step('Raising the suburbs', 0.42, () => buildFarField(terr, colliders, quality));
  scene.add(farField.group);

  // later layers (buildings, landmarks, props…) register here and can see earlier ones
  const layers = {};
  const surfaces = [];   // extra drivable surfaces (ramps) registered by layers
  const ctx = { scene, atmo, quality, net, terr, colliders, roads, water, layersRef: layers, surfaces };
  let frac = 0.45;
  for (const [label, fn] of extras) {
    layers[fn.layerName || label] = await step(label, frac, () => fn(ctx));
    frac += (0.97 - 0.45) / extras.length;
  }

  const groundOut = {};
  const world = {
    net, terr, colliders, roads, water, layers, timings,
    buildMs: Math.round(performance.now() - t0),
    surface(x, z, yRef, out) {
      if (!net.roadSurface(x, z, yRef, out)) terr.groundSurface(x, z, out);
      for (const fn of surfaces) fn(x, z, yRef, out);
      return out;
    },
    collide(sim) { return colliders.collideCar(sim); },
    groundAt(x, z, yRef = 1e4) { return world.surface(x, z, yRef, groundOut).h; },
    setNight(v) { farField.setNight(v); for (const l of Object.values(layers)) if (l && l.setNight) l.setNight(v); },
    update(t, dt, camera) {
      water.update(t, camera);
      if (camera && terrainMesh.userData.update) terrainMesh.userData.update(camera);
      for (const l of Object.values(layers)) if (l && l.update) l.update(t, dt, camera);
    },
  };
  progress('Ready', 1);
  return world;
}
