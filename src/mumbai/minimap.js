/* Minimap + full map, drawn from the same data the world is built from. */
import { COAST, RIVER, PARKS, WORLD_BOUNDS as B, PLACES } from './layout.js';

const SCALE = 0.5;                        // base map pixels per metre
const COLORS = {
  sea: '#1c2c36', land: '#2c2f33', park: '#2f4a2c', road: '#7c8188', major: '#a8adb4', deck: '#d0d4da',
  chapter: '#e8a83c', discovery: '#e8d6a8', done: '#7d8a96', route: '#ff3b3b', player: '#ffffff',
};

export function renderBaseMap(net) {
  const W = Math.ceil((B.maxX - B.minX) * SCALE), H = Math.ceil((B.maxZ - B.minZ) * SCALE);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const P = (x, z) => [(x - B.minX) * SCALE, (z - B.minZ) * SCALE];
  g.fillStyle = COLORS.sea; g.fillRect(0, 0, W, H);
  g.fillStyle = COLORS.land; g.beginPath();
  COAST.forEach(([x, z], i) => { const [px, py] = P(x, z); i ? g.lineTo(px, py) : g.moveTo(px, py); });
  g.closePath(); g.fill();
  // river
  g.strokeStyle = COLORS.sea; g.lineCap = 'round'; g.lineJoin = 'round';
  for (let i = 0; i < RIVER.pts.length - 1; i++) {
    g.lineWidth = (RIVER.hw[i] + RIVER.hw[i + 1]) * SCALE;
    g.beginPath(); g.moveTo(...P(...RIVER.pts[i])); g.lineTo(...P(...RIVER.pts[i + 1])); g.stroke();
  }
  g.fillStyle = COLORS.park;
  for (const p of PARKS) { const [px, py] = P(p.x, p.z); g.beginPath(); g.ellipse(px, py, p.rx * SCALE, p.rz * SCALE, p.rot, 0, Math.PI * 2); g.fill(); }
  // roads: casing then fill
  const draw = (filterDeck, color, extra) => {
    for (const r of net.roads) {
      if (filterDeck !== null && r.deck !== filterDeck) continue;
      g.strokeStyle = color; g.lineWidth = Math.max(2.2, (r.T.hw * 2 + extra) * SCALE);
      g.beginPath();
      for (let i = 0; i < r.n; i += 2) { const [px, py] = P(r.x[i], r.z[i]); i ? g.lineTo(px, py) : g.moveTo(px, py); }
      const [ex, ey] = P(r.x[r.n - 1], r.z[r.n - 1]); g.lineTo(ex, ey);
      g.stroke();
    }
  };
  draw(false, '#17191c', 8); draw(false, COLORS.road, 0);
  draw(true, '#17191c', 8); draw(true, COLORS.deck, 0);
  g.fillStyle = COLORS.road;
  for (const nd of Object.values(net.nodes)) { const [px, py] = P(nd.x, nd.z); g.beginPath(); g.arc(px, py, Math.max(2, nd.R * SCALE), 0, Math.PI * 2); g.fill(); }
  return { canvas: c, P, SCALE };
}

export class Minimap {
  constructor(canvas, base, net) {
    this.c = canvas; this.g = canvas.getContext('2d'); this.base = base; this.net = net;
    this.big = false; this.route = null; this.found = new Set(); this.target = null;
  }
  setRoute(points) { this.route = points; }
  /** Big map only: id of the destination drawn nearest canvas pixel (cx, cy), or null. */
  pick(cx, cy, radius = 18) {
    const { c, base } = this;
    const s = Math.min(c.width / base.canvas.width, c.height / base.canvas.height);
    const ox = (c.width - base.canvas.width * s) / 2, oy = (c.height - base.canvas.height * s) / 2;
    let best = null, bd = radius;
    for (const p of PLACES) {
      const [bx, by] = base.P(p.x, p.z);
      const d = Math.hypot(ox + bx * s - cx, oy + by * s - cy);
      if (d < bd) { bd = d; best = p.id; }
    }
    return best;
  }
  draw(px, pz, heading, extra = {}) {
    const { c, g, base } = this;
    const W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    g.save();
    if (this.big) {
      const s = Math.min(W / base.canvas.width, H / base.canvas.height);
      const ox = (W - base.canvas.width * s) / 2, oy = (H - base.canvas.height * s) / 2;
      g.fillStyle = 'rgba(10,12,16,0.92)'; g.fillRect(0, 0, W, H);
      g.drawImage(base.canvas, ox, oy, base.canvas.width * s, base.canvas.height * s);
      const T = (x, z) => { const [bx, by] = base.P(x, z); return [ox + bx * s, oy + by * s]; };
      this.drawOverlay(g, T, s * base.SCALE, true);
      const [qx, qy] = T(px, pz);
      this.arrow(g, qx, qy, -heading + Math.PI, 9);
    } else {
      // heading-up crop inside a circle
      const R = W / 2;
      g.beginPath(); g.arc(R, R, R - 2, 0, Math.PI * 2); g.clip();
      g.fillStyle = '#1c2c36'; g.fillRect(0, 0, W, H);
      const zoom = extra.zoom || 1.15;            // pixels per base-map pixel
      g.translate(R, R);
      g.rotate(heading - Math.PI);
      const [bx, by] = base.P(px, pz);
      g.scale(zoom, zoom);
      g.drawImage(base.canvas, -bx, -by);
      const T = (x, z) => { const [qx, qy] = base.P(x, z); return [qx - bx, qy - by]; };
      this.drawOverlay(g, T, base.SCALE, false, zoom);
      g.setTransform(1, 0, 0, 1, 0, 0);
      this.arrow(g, R, R, 0, 8);
      // rim
      g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2; g.beginPath(); g.arc(R, R, R - 2, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#e8e8e8'; g.font = '700 11px "Titillium Web", sans-serif'; g.textAlign = 'center';
      const nAng = heading - Math.PI + Math.PI;  // where north (−Z) is after rotation
      g.fillText('N', R + Math.sin(-nAng + Math.PI) * (R - 12) * -1, R - Math.cos(-nAng + Math.PI) * (R - 12) * -1 + 4);
    }
    g.restore();
  }
  drawOverlay(g, T, pxPerM, big, zoom = 1) {
    if (this.route && this.route.length > 1) {
      g.strokeStyle = COLORS.route; g.lineWidth = (big ? 3 : 4 / zoom); g.lineJoin = 'round'; g.lineCap = 'round';
      g.setLineDash(big ? [] : []);
      g.beginPath();
      this.route.forEach(([x, z], i) => { const [qx, qy] = T(x, z); i ? g.lineTo(qx, qy) : g.moveTo(qx, qy); });
      g.stroke();
    }
    for (const p of PLACES) {
      const [qx, qy] = T(p.x, p.z);
      const found = this.found.has(p.id);
      const r = (big ? 6 : 6 / zoom) * (p === this.target ? 1.4 : 1);
      g.fillStyle = found ? COLORS.done : p.kind === 'chapter' ? COLORS.chapter : COLORS.discovery;
      g.strokeStyle = '#0b0d10'; g.lineWidth = big ? 2 : 2 / zoom;
      g.beginPath();
      if (p.kind === 'chapter') { g.rect(qx - r, qy - r, r * 2, r * 2); } else { g.moveTo(qx, qy - r * 1.2); g.lineTo(qx + r, qy); g.lineTo(qx, qy + r * 1.2); g.lineTo(qx - r, qy); g.closePath(); }
      g.fill(); g.stroke();
      if (big) {
        g.font = '700 12px "Titillium Web", sans-serif'; g.textAlign = 'left';
        g.lineWidth = 3; g.strokeStyle = 'rgba(8,10,14,0.9)';
        g.strokeText(p.short || p.name, qx + 9, qy + 4); g.fillStyle = '#eef1f4'; g.fillText(p.short || p.name, qx + 9, qy + 4);
      }
    }
  }
  arrow(g, x, y, rot, s) {
    g.save(); g.translate(x, y); g.rotate(rot);
    g.fillStyle = COLORS.player; g.strokeStyle = '#d81f26'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -s * 1.3); g.lineTo(s * 0.9, s); g.lineTo(0, s * 0.45); g.lineTo(-s * 0.9, s); g.closePath();
    g.fill(); g.stroke(); g.restore();
  }
}
