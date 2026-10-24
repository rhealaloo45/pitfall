/* Mumbai GP world assembly — builds every layer progressively and exposes
   the physics interface (surface / collide) used by the vehicle sim. */
import * as THREE from 'three';
import { buildNetwork } from './network.js';
import { buildTerrain, buildTerrainMeshes } from './terrain.js';
import { buildRoadMeshes } from './roads-mesh.js';
import { buildWater } from './water.js';
import { ColliderWorld } from './colliders.js';

const tick = () => new Promise(r => setTimeout(r, 0));

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
  const terrainMesh = await step('Planting the maidans', 0.34, () => buildTerrainMeshes(THREE, terr, { step: quality.terrainStep }));
  scene.add(terrainMesh);
  const water = await step('Filling the Arabian Sea', 0.4, () => buildWater(atmo));
  scene.add(water.mesh);

  const ctx = { scene, atmo, quality, net, terr, colliders, roads, water };
  // later layers (buildings, landmarks, props…) register here
  const layers = {};
  let frac = 0.45;
  for (const [label, fn] of extras) {
    layers[label] = await step(label, frac, () => fn(ctx));
    frac += (0.97 - 0.45) / extras.length;
  }

  const groundOut = {};
  const world = {
    net, terr, colliders, roads, water, layers, timings,
    buildMs: Math.round(performance.now() - t0),
    surface(x, z, yRef, out) {
      if (net.roadSurface(x, z, yRef, out)) return out;
      return terr.groundSurface(x, z, out);
    },
    collide(sim) { return colliders.collideCar(sim); },
    groundAt(x, z, yRef = 1e4) { return world.surface(x, z, yRef, groundOut).h; },
    update(t, dt, camera) {
      water.update(t);
      for (const l of Object.values(layers)) if (l && l.update) l.update(t, dt, camera);
    },
  };
  progress('Ready', 1);
  return world;
}
