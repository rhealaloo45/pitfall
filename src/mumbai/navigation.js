/* Shortest-path routing over the road graph (all roads two-way). */

export class Navigator {
  constructor(net) {
    this.net = net;
    this.adj = {};
    for (const id of Object.keys(net.nodes)) this.adj[id] = [];
    for (const r of net.roads) {
      this.adj[r.from].push({ to: r.to, road: r, fwd: true });
      this.adj[r.to].push({ to: r.from, road: r, fwd: false });
    }
  }

  /** Project a world point onto the network: {road, i, s}. */
  locate(x, z, maxD = 400) {
    const n = this.net.nearestRoad(x, z, Math.min(maxD, 120)) || this.bruteNearest(x, z);
    return n ? { road: n.road, i: n.i, s: n.road.s[n.i], d: n.d } : null;
  }
  bruteNearest(x, z) {
    let best = null, bd = Infinity;
    for (const r of this.net.roads) for (let i = 0; i < r.n; i += 3) {
      const d = Math.hypot(r.x[i] - x, r.z[i] - z); if (d < bd) { bd = d; best = { road: r, i, d }; }
    }
    return best;
  }

  /** Route from (x,z) to (tx,tz). Returns {points:[[x,z]...], length}. */
  route(x, z, tx, tz) {
    const A = this.locate(x, z), Bp = this.locate(tx, tz);
    if (!A || !Bp) return null;
    if (A.road === Bp.road) {
      return { points: this.slice(A.road, A.i, Bp.i).concat([[tx, tz]]), length: Math.abs(A.s - Bp.s) };
    }
    // Dijkstra with two virtual start edges and two virtual goal edges
    const dist = {}, prev = {}, done = new Set();
    for (const id of Object.keys(this.net.nodes)) dist[id] = Infinity;
    dist[A.road.from] = A.s; prev[A.road.from] = { start: true };
    dist[A.road.to] = A.road.L - A.s; prev[A.road.to] = { start: true };
    const goal = { [Bp.road.from]: Bp.s, [Bp.road.to]: Bp.road.L - Bp.s };
    let bestGoal = null, bestCost = Infinity;
    for (;;) {
      let u = null, du = Infinity;
      for (const [id, d] of Object.entries(dist)) if (!done.has(id) && d < du) { du = d; u = id; }
      if (u == null || du >= bestCost) break;
      done.add(u);
      if (goal[u] != null && du + goal[u] < bestCost) { bestCost = du + goal[u]; bestGoal = u; }
      for (const e of this.adj[u]) {
        const nd = du + e.road.L;
        if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = { from: u, road: e.road, fwd: e.fwd }; }
      }
    }
    if (!bestGoal) return null;
    // rebuild node chain
    const chain = [];
    let cur = bestGoal;
    while (prev[cur] && !prev[cur].start) { chain.unshift(prev[cur]); cur = prev[cur].from; }
    const startNode = cur;
    const pts = [];
    // from the car to the first node
    pts.push(...this.slice(A.road, A.i, startNode === A.road.from ? 0 : A.road.n - 1));
    for (const step of chain) pts.push(...this.slice(step.road, step.fwd ? 0 : step.road.n - 1, step.fwd ? step.road.n - 1 : 0));
    pts.push(...this.slice(Bp.road, bestGoal === Bp.road.from ? 0 : Bp.road.n - 1, Bp.i));
    pts.push([tx, tz]);
    return { points: pts, length: bestCost };
  }

  slice(r, i0, i1) {
    const out = [], st = i1 >= i0 ? 1 : -1;
    for (let i = i0; st > 0 ? i <= i1 : i >= i1; i += st * 2) out.push([r.x[i], r.z[i]]);
    out.push([r.x[i1], r.z[i1]]);
    return out;
  }
}

/** Point `ahead` metres along a polyline from its start. */
export function pointAlong(points, ahead) {
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i];
    const l = Math.hypot(bx - ax, bz - az);
    if (acc + l >= ahead) { const t = (ahead - acc) / l; return [ax + (bx - ax) * t, az + (bz - az) * t]; }
    acc += l;
  }
  return points[points.length - 1];
}
