// World generation sanity tests (pure data — no WebGL needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNetwork } from '../src/mumbai/network.js';
import { buildTerrain } from '../src/mumbai/terrain.js';
import { landSD } from '../src/mumbai/geo2d.js';
import { PLACES, SPAWN } from '../src/mumbai/layout.js';

const net = buildNetwork();
const terr = buildTerrain(net);

function segX(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}

test('ground roads stay on land; only decks cross water', () => {
  const bad = [];
  for (const r of net.roads) {
    for (let i = 0; i < r.n; i++) {
      if (r.deck && r.deckF[i] > 0.05) continue;
      const sd = landSD(r.x[i], r.z[i]);
      if (sd < r.T.hw + 1) bad.push(`${r.id}@${i} (${r.x[i].toFixed(0)},${r.z[i].toFixed(0)}) sd=${sd.toFixed(1)}`);
    }
  }
  assert.deepEqual(bad.slice(0, 12), []);
});

test('roads only meet at junctions', () => {
  const hits = [];
  const R = net.roads;
  for (let a = 0; a < R.length; a++) for (let b = a + 1; b < R.length; b++) {
    const A = R[a], Bq = R[b];
    const shared = [A.from, A.to].filter(n => n === Bq.from || n === Bq.to).map(n => net.nodes[n]);
    for (let i = 0; i < A.n - 1; i += 1) for (let j = 0; j < Bq.n - 1; j += 1) {
      const p = [A.x[i], A.z[i]], q = [A.x[i + 1], A.z[i + 1]], c = [Bq.x[j], Bq.z[j]], d = [Bq.x[j + 1], Bq.z[j + 1]];
      if (Math.abs(p[0] - c[0]) > 40 || Math.abs(p[1] - c[1]) > 40) continue;
      if (!segX(p, q, c, d)) continue;
      if (shared.some(n => Math.hypot(n.x - p[0], n.z - p[1]) < n.R + 40)) continue;
      // grade-separated crossings are fine (one road on a deck)
      if (Math.abs(A.h[i] - Bq.h[j]) > 5) continue;
      hits.push(`${A.id} × ${Bq.id} near (${p[0].toFixed(0)},${p[1].toFixed(0)})`);
    }
  }
  assert.deepEqual([...new Set(hits)], []);
});

test('road grades are drivable (< 13%) and junction heights match', () => {
  for (const r of net.roads) {
    let maxG = 0;
    for (let i = 1; i < r.n; i++) maxG = Math.max(maxG, Math.abs(r.h[i] - r.h[i - 1]) / Math.max(0.1, r.s[i] - r.s[i - 1]));
    assert.ok(maxG < 0.13, `${r.id} grade ${(maxG * 100).toFixed(1)}%`);
    assert.ok(Math.abs(r.h[0] - net.nodes[r.from].h) < 0.05, `${r.id} start height`);
    assert.ok(Math.abs(r.h[r.n - 1] - net.nodes[r.to].h) < 0.05, `${r.id} end height`);
  }
});

test('every destination is reachable from a road', () => {
  for (const p of PLACES) {
    const near = net.nearestRoad(p.x, p.z, 120);
    assert.ok(near && near.d < 75, `${p.id} is ${near ? near.d.toFixed(0) : '>120'} m from a road`);
  }
});

test('spawn point is on a road surface', () => {
  const out = {};
  const ok = net.roadSurface(SPAWN.x, SPAWN.z, 50, out);
  assert.ok(ok && out.kind === 'road', 'spawn on carriageway');
});

test('terrain: elevated Sea Link stays above the water, ground below roads', () => {
  const sl = net.roads.find(r => r.id === 'seaLink');
  const mid = Math.floor(sl.n / 2);
  assert.ok(sl.h[mid] > 12, `deck height ${sl.h[mid]}`);
  assert.ok(terr.heightAt(sl.x[mid], sl.z[mid]) < 0, 'water under the bridge');
  const out = {};
  const md = net.roads.find(r => r.id === 'marineDriveN');
  const i = Math.floor(md.n / 2);
  net.roadSurface(md.x[i], md.z[i], 50, out);
  assert.ok(terr.heightAt(md.x[i], md.z[i]) < out.h, 'terrain is below the road');
});
