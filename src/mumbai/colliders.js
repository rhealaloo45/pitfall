/* Static collision world: wall segments and round posts in a spatial hash.
   Each collider has a vertical range [y0, y1] so bridge barriers only stop
   cars on the bridge, and pillars only stop cars underneath. */
import * as THREE from 'three';

const CELL = 16;
const key = (i, j) => i * 73856093 ^ j * 19349663;

export class ColliderWorld {
  constructor() { this.grid = new Map(); this.stamp = 0; this.count = 0; }

  insert(obj, x0, z0, x1, z1) {
    obj._s = 0;
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        const k = key(i, j); let a = this.grid.get(k); if (!a) this.grid.set(k, a = []); a.push(obj);
      }
    this.count++;
  }
  /** Wall from A to B (xz), solid between heights y0 and y1. */
  wall(ax, az, bx, bz, y0, y1, kind = 'wall') {
    if (Math.hypot(bx - ax, bz - az) < 0.05) return;
    const o = { t: 0, ax, az, bx, bz, y0, y1, kind };
    this.insert(o, Math.min(ax, bx) - 1, Math.min(az, bz) - 1, Math.max(ax, bx) + 1, Math.max(az, bz) + 1);
  }
  post(x, z, r, y0, y1, kind = 'post') {
    const o = { t: 1, x, z, r, y0, y1, kind };
    this.insert(o, x - r - 1, z - r - 1, x + r + 1, z + r + 1);
  }
  /** Oriented box footprint (buildings): centre, half sizes, rotation (rad about Y). */
  box(cx, cz, hx, hz, rot, y0, y1, kind = 'building') {
    const c = Math.cos(rot), s = Math.sin(rot);
    const P = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([x, z]) => [cx + x * c + z * s, cz - x * s + z * c]);
    for (let i = 0; i < 4; i++) { const a = P[i], b = P[(i + 1) % 4]; this.wall(a[0], a[1], b[0], b[1], y0, y1, kind); }
  }
  polyline(pts, y0, y1, kind) { for (let i = 0; i < pts.length - 1; i++) this.wall(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], y0, y1, kind); }

  query(x, z, r, cb) {
    this.stamp++;
    for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++)
      for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
        const a = this.grid.get(key(i, j)); if (!a) continue;
        for (const o of a) { if (o._s === this.stamp) continue; o._s = this.stamp; cb(o); }
      }
  }

  /**
   * Resolve the car (three circles along its length) against the world.
   * Returns the largest normal impulse applied (N·s) for audio/camera.
   */
  collideCar(sim) {
    const f = sim.forward(new THREE.Vector3());
    const fl = Math.hypot(f.x, f.z) || 1; const fx = f.x / fl, fz = f.z / fl;
    const R = 0.92;
    const y = sim.pos.y;
    let maxJ = 0;
    const n = new THREE.Vector3(), p = new THREE.Vector3(), J = new THREE.Vector3();
    for (const off of [2.05, 0.3, -1.55]) {
      const cx = sim.pos.x + fx * off, cz = sim.pos.z + fz * off;
      this.query(cx, cz, R + 0.5, o => {
        if (y < o.y0 - 0.2 || y - 0.3 > o.y1) return;
        let nx, nz, d, px, pz;
        if (o.t === 0) {
          const dx = o.bx - o.ax, dz = o.bz - o.az, l2 = dx * dx + dz * dz;
          let t = ((cx - o.ax) * dx + (cz - o.az) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
          px = o.ax + dx * t; pz = o.az + dz * t;
          nx = cx - px; nz = cz - pz; d = Math.hypot(nx, nz);
          if (d >= R || d < 1e-6) return;
          nx /= d; nz /= d;
          const pen = R - d;
          sim.pos.x += nx * pen; sim.pos.z += nz * pen;
        } else {
          nx = cx - o.x; nz = cz - o.z; d = Math.hypot(nx, nz);
          const min = R + o.r;
          if (d >= min || d < 1e-6) return;
          nx /= d; nz /= d;
          px = o.x + nx * o.r; pz = o.z + nz * o.r;
          const pen = min - d;
          sim.pos.x += nx * pen; sim.pos.z += nz * pen;
        }
        // impulse at the contact point (produces yaw when hitting off-centre)
        p.set(px, y, pz); n.set(nx, 0, nz);
        const r = p.clone().sub(sim.pos);
        const vp = new THREE.Vector3().crossVectors(sim.angVel, r).add(sim.vel);
        const vn = vp.dot(n);
        if (vn < 0) {
          const e = Math.min(0.35, 0.1 + -vn * 0.01);
          const j = -(1 + e) * vn / sim.invMassAt(p, n);
          J.copy(n).multiplyScalar(j);
          // wall friction scrubs speed along the wall
          const vt = vp.clone().addScaledVector(n, -vn); vt.y = 0;
          const vtl = vt.length();
          if (vtl > 0.01) {
            const jt = Math.min(0.45 * j, vtl / sim.invMassAt(p, vt.clone().normalize()));
            J.addScaledVector(vt, -jt / vtl);
          }
          sim.applyImpulse(J, p);
          if (j > maxJ) maxJ = j;
        }
      });
    }
    return maxJ;
  }
}
