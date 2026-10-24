/* Road network: splines, height profiles, junctions, spatial index and
   analytic drivable-surface queries. Pure data (no rendering) → testable in Node. */
import { NODES, ROADS, ROAD_TYPES, COAST } from './layout.js';
import { splinePath, resample, landSD, baseHeight, polyLength } from './geo2d.js';

const STEP = 3;
const sm = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

function coastSlice(from, to) {
  const near = p => { let bi = 0, bd = Infinity; COAST.forEach((c, i) => { const d = Math.hypot(c[0] - p[0], c[1] - p[1]); if (d < bd) { bd = d; bi = i; } }); return bi; };
  const a = near(from), b = near(to);
  const out = [];
  if (a <= b) for (let i = a; i <= b; i++) out.push(COAST[i]);
  else for (let i = a; i >= b; i--) out.push(COAST[i]);
  return out;
}

function offsetInland(pts, dist) {
  const dense = resample(pts, 6);
  const out = [];
  for (let i = 0; i < dense.length; i++) {
    const p = dense[Math.max(0, i - 1)], n = dense[Math.min(dense.length - 1, i + 1)];
    let tx = n[0] - p[0], tz = n[1] - p[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    let nx = -tz, nz = tx;
    const [x, z] = dense[i];
    if (landSD(x + nx * 10, z + nz * 10) < landSD(x - nx * 10, z - nz * 10)) { nx = -nx; nz = -nz; }
    out.push([x + nx * dist, z + nz * dist]);
  }
  // smooth (several passes of a 7-tap average) so the road flows
  let cur = out;
  for (let pass = 0; pass < 4; pass++) {
    cur = cur.map((p, i) => {
      if (i === 0 || i === cur.length - 1) return p;
      let sx = 0, sz = 0, n = 0;
      for (let k = -3; k <= 3; k++) { const q = cur[Math.max(0, Math.min(cur.length - 1, i + k))]; sx += q[0]; sz += q[1]; n++; }
      return [sx / n, sz / n];
    });
  }
  return cur;
}

export function buildNetwork() {
  const nodes = {};
  const mkNode = (id, x, z) => (nodes[id] = { id, x, z, h: 0, roads: [], R: 0, sw: 0 });
  for (const [id, [x, z]] of Object.entries(NODES)) mkNode(id, x, z);

  const defs = [];
  for (const r of ROADS) {
    if (r.shore) {
      const pts = offsetInland(coastSlice(r.shore.from, r.shore.to), r.shore.offset);
      mkNode(r.ends[0], ...pts[0]);
      mkNode(r.ends[1], ...pts[pts.length - 1]);
      if (r.split) {
        const [nid, zSplit] = Object.entries(r.split)[0];
        let si = 0, bd = Infinity;
        pts.forEach((p, i) => { const d = Math.abs(p[1] - zSplit); if (d < bd) { bd = d; si = i; } });
        mkNode(nid, ...pts[si]);
        defs.push({ ...r, id: r.id + 'N', from: r.ends[0], to: nid, poly: pts.slice(0, si + 1) });
        defs.push({ ...r, id: r.id + 'S', from: nid, to: r.ends[1], poly: pts.slice(si) });
      } else defs.push({ ...r, from: r.ends[0], to: r.ends[1], poly: pts });
    } else defs.push(r);
  }

  for (const n of Object.values(nodes)) n.h = baseHeight(n.x, n.z);

  const roads = defs.map(d => {
    const type = ROAD_TYPES[d.type];
    const A = nodes[d.from], Bn = nodes[d.to];
    let path;
    if (d.poly) {
      const ctrl = resample(d.poly, 18);
      ctrl[0] = [A.x, A.z]; ctrl[ctrl.length - 1] = [Bn.x, Bn.z];
      path = splinePath(ctrl, STEP);
    } else path = splinePath([[A.x, A.z], ...d.pts, [Bn.x, Bn.z]], STEP);
    const n = path.length;
    const s = new Float32Array(n), x = new Float32Array(n), z = new Float32Array(n), tx = new Float32Array(n), tz = new Float32Array(n);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      x[i] = path[i][0]; z[i] = path[i][1];
      if (i) acc += Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]);
      s[i] = acc;
    }
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let dx = x[b] - x[a], dz = z[b] - z[a]; const l = Math.hypot(dx, dz) || 1;
      tx[i] = dx / l; tz[i] = dz / l;
    }
    const L = acc;
    // height profile
    const base = new Float32Array(n), h = new Float32Array(n), deckF = new Float32Array(n);
    for (let i = 0; i < n; i++) base[i] = baseHeight(x[i], z[i]);
    if (d.deck) {
      const ramp = d.deck.ramp;
      for (let i = 0; i < n; i++) {
        const t = s[i] / L;
        const lin = A.h + (Bn.h - A.h) * t;
        const f = sm(s[i] / ramp) * sm((L - s[i]) / ramp);
        deckF[i] = f;
        h[i] = lin + d.deck.h * f;
      }
    } else {
      const W = 12;
      const tmp = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let sum = 0, c = 0;
        for (let k = -W; k <= W; k++) { const j = Math.max(0, Math.min(n - 1, i + k)); sum += Math.max(base[j], 1.2); c++; }
        tmp[i] = sum / c;
      }
      const e0 = A.h - tmp[0], e1 = Bn.h - tmp[n - 1];
      for (let i = 0; i < n; i++) { const t = s[i] / L; h[i] = tmp[i] + e0 * (1 - t) + e1 * t; }
    }
    const road = { id: d.id, name: d.name, type: d.type, T: type, from: d.from, to: d.to, n, s, x, z, tx, tz, h, base, deckF, L, deck: !!d.deck };
    A.roads.push({ road, end: 0 }); Bn.roads.push({ road, end: 1 });
    return road;
  });

  // junction sizes
  for (const nd of Object.values(nodes)) {
    let hw = 0, sw = 0;
    for (const { road } of nd.roads) { hw = Math.max(hw, road.T.hw); sw = Math.max(sw, road.T.sidewalk); }
    nd.sw = sw;
    nd.R = nd.roads.length >= 3 ? hw + 3 : nd.roads.length === 2 ? hw * 0.8 : hw + 8;
    if (nd.id === 'gateway') nd.R = 30;
    if (nd.id === 'kjsit') nd.R = 18;
  }
  for (const r of roads) {
    r.trim0 = nodes[r.from].R * 0.92;
    r.trim1 = r.L - nodes[r.to].R * 0.92;
  }

  /* ---- spatial index of road segments ---- */
  const CELL = 24, grid = new Map();
  const key = (i, j) => i * 100003 + j;
  for (const r of roads) {
    const reach = r.T.hw + r.T.sidewalk + 2;
    for (let i = 0; i < r.n - 1; i++) {
      const x0 = Math.min(r.x[i], r.x[i + 1]) - reach, x1 = Math.max(r.x[i], r.x[i + 1]) + reach;
      const z0 = Math.min(r.z[i], r.z[i + 1]) - reach, z1 = Math.max(r.z[i], r.z[i + 1]) + reach;
      for (let gi = Math.floor(x0 / CELL); gi <= Math.floor(x1 / CELL); gi++)
        for (let gj = Math.floor(z0 / CELL); gj <= Math.floor(z1 / CELL); gj++) {
          const k = key(gi, gj);
          let a = grid.get(k); if (!a) grid.set(k, a = []);
          a.push(r, i);
        }
    }
  }
  const nodeList = Object.values(nodes);

  /** Nearest road sample to (x,z) (any height). */
  function nearestRoad(x, z, maxD = 60) {
    let best = null, bd = maxD;
    const gi = Math.floor(x / CELL), gj = Math.floor(z / CELL);
    const rr = Math.ceil(maxD / CELL);
    for (let a = -rr; a <= rr; a++) for (let b = -rr; b <= rr; b++) {
      const arr = grid.get(key(gi + a, gj + b)); if (!arr) continue;
      for (let k = 0; k < arr.length; k += 2) {
        const r = arr[k], i = arr[k + 1];
        const d = Math.hypot(r.x[i] - x, r.z[i] - z);
        if (d < bd) { bd = d; best = { road: r, i, d }; }
      }
    }
    return best;
  }

  /**
   * Road-surface candidates at (x,z). Picks the highest surface at or below yRef + 0.6.
   * Returns false if no road surface applies (caller falls back to terrain).
   */
  function roadSurface(x, z, yRef, out) {
    let found = false, bestH = -Infinity;
    let inNode = null;
    for (const nd of nodeList) {
      const d = Math.hypot(nd.x - x, nd.z - z);
      if (d < nd.R) {
        if (nd.h <= yRef + 0.6 && nd.h > bestH) { bestH = nd.h; found = true; out.kind = 'road'; out.nx = 0; out.ny = 1; out.nz = 0; out.rough = 0.004; out.mu = 1; inNode = nd; }
      } else if (d < nd.R + nd.sw && nd.roads.length >= 3) {
        // junction corner sidewalks (only outside every incident carriageway)
        let onCarriage = false;
        for (const { road, end } of nd.roads) {
          const i = end ? road.n - 1 : 0;
          const lat = Math.abs((x - nd.x) * -road.tz[i] + (z - nd.z) * road.tx[i]);
          const along = ((x - nd.x) * road.tx[i] + (z - nd.z) * road.tz[i]) * (end ? -1 : 1);
          if (along > 0 && lat < road.T.hw + 0.3) onCarriage = true;
        }
        if (!onCarriage && nd.h + 0.16 <= yRef + 0.6 && nd.h + 0.16 > bestH) { bestH = nd.h + 0.16; found = true; out.kind = 'kerb'; out.nx = 0; out.ny = 1; out.nz = 0; out.rough = 0.012; out.mu = 0.95; }
      }
    }
    const gi = Math.floor(x / CELL), gj = Math.floor(z / CELL);
    const arr = grid.get(key(gi, gj));
    if (arr) {
      for (let k = 0; k < arr.length; k += 2) {
        const r = arr[k], i = arr[k + 1];
        const ax = r.x[i], az = r.z[i], bx = r.x[i + 1], bz = r.z[i + 1];
        const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
        let t = ((x - ax) * dx + (z - az) * dz) / l2;
        if (t < -0.02 || t > 1.02) continue;
        t = Math.max(0, Math.min(1, t));
        const cx = ax + dx * t, cz = az + dz * t;
        const l = Math.sqrt(l2);
        const lat = ((x - ax) * dz - (z - az) * dx) / l;   // signed lateral offset
        const al = Math.abs(lat);
        const h = r.h[i] + (r.h[i + 1] - r.h[i]) * t;
        const sAt = r.s[i] + (r.s[i + 1] - r.s[i]) * t;
        const T = r.T;
        let hh, kind, rough = 0.004, mu = 1;
        if (al <= T.hw) { hh = h; kind = 'road'; }
        else if (r.deck && (r.deckF[i] > 0.12 || T.barrier) && al <= T.hw + 0.9) { hh = h; kind = 'road'; rough = 0.008; }
        else if (!r.deck && al <= T.hw + T.sidewalk && !inNode && sAt > r.trim0 && sAt < r.trim1) {
          const kerb = Math.min(1, (al - T.hw) / 0.25);
          hh = h + 0.16 * kerb; kind = 'kerb'; rough = 0.012; mu = 0.95;
        } else continue;
        if (inNode && kind !== 'road') continue;
        if (hh <= yRef + 0.6 && hh > bestH) {
          bestH = hh; found = true;
          const g = (r.h[i + 1] - r.h[i]) / l;           // grade along the road
          const nl = Math.hypot(g, 1);
          out.nx = -g * dx / l / nl; out.ny = 1 / nl; out.nz = -g * dz / l / nl;
          out.kind = kind; out.rough = rough; out.mu = mu;
          out.road = r; out.lat = lat; out.sAt = sAt;
        }
        void cx; void cz;
      }
    }
    if (found) { out.h = bestH; out.water = false; }
    return found;
  }

  return { nodes, roads, nearestRoad, roadSurface, CELL };
}
