/* The diorama base: a rounded slab under the whole city with layered
   sand/earth sides and a raised rim, so the world reads as a tabletop model. */
import * as THREE from 'three';
import { WORLD_BOUNDS as B } from './layout.js';

export const SLAB = { minX: B.minX + 10, maxX: B.maxX - 10, minZ: B.minZ + 15, maxZ: B.maxZ - 10, r: 90, depth: 26 };

/** Points around the rounded rectangle (clockwise in screen space: x right, z down). */
export function slabOutline(inset = 0, seg = 10) {
  const r = SLAB.r - inset, x0 = SLAB.minX + inset, x1 = SLAB.maxX - inset, z0 = SLAB.minZ + inset, z1 = SLAB.maxZ - inset;
  const pts = [];
  const corner = (cx, cz, a0) => { for (let i = 0; i <= seg; i++) { const a = a0 + i / seg * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r, Math.cos(a), Math.sin(a)]); } };
  corner(x1 - r, z0 + r, -Math.PI / 2);
  corner(x1 - r, z1 - r, 0);
  corner(x0 + r, z1 - r, Math.PI / 2);
  corner(x0 + r, z0 + r, Math.PI);
  return pts;
}

export function insideSlab(x, z, inset = 0) {
  const r = SLAB.r - inset, x0 = SLAB.minX + inset, x1 = SLAB.maxX - inset, z0 = SLAB.minZ + inset, z1 = SLAB.maxZ - inset;
  if (x < x0 || x > x1 || z < z0 || z > z1) return false;
  const cx = Math.max(x0 + r, Math.min(x1 - r, x)), cz = Math.max(z0 + r, Math.min(z1 - r, z));
  return Math.hypot(x - cx, z - cz) <= r;
}

export function buildDiorama(terr) {
  const outer = slabOutline(0, 12);
  const rimIn = slabOutline(9, 12);
  const pos = [], col = [], idx = [];
  const C = c => new THREE.Color(c);
  const bands = [[0, C(0xf3d7a6)], [-3.5, C(0xe9bf86)], [-4.2, C(0xd99c6a)], [-11, C(0xcf9061)], [-11.8, C(0xb97d55)], [-SLAB.depth, C(0x9c6747)]];
  const topAt = (x, z) => Math.max(terr.heightAt(x, z), 0) + 0.9;
  // sides: one column of vertices per outline point, rows at band heights
  const N = outer.length;
  const rows = [];
  for (let k = 0; k < N; k++) {
    const [x, z] = outer[k];
    const top = topAt(x, z);
    const ys = [top, ...bands.slice(1).map(b => b[0])];
    const cs = [bands[0][1], ...bands.slice(1).map(b => b[1])];
    const col0 = [];
    ys.forEach((y, j) => { pos.push(x, y, z); const c = cs[j]; col.push(c.r, c.g, c.b); col0.push(pos.length / 3 - 1); });
    rows.push(col0);
  }
  for (let k = 0; k < N; k++) {
    const a = rows[k], b = rows[(k + 1) % N];
    for (let j = 0; j < a.length - 1; j++) idx.push(a[j], a[j + 1], b[j], b[j], a[j + 1], b[j + 1]);
  }
  // rim top: outer edge to inner edge (raised lip over the water, flush on land)
  const base = pos.length / 3;
  const sand = C(0xf6dfb4);
  for (let k = 0; k < N; k++) {
    const [ox, oz] = outer[k], [ix, iz] = rimIn[k];
    pos.push(ox, topAt(ox, oz), oz); col.push(sand.r, sand.g, sand.b);
    const ih = terr.heightAt(ix, iz);
    pos.push(ix, ih > 0.3 ? ih + 0.05 : topAt(ix, iz), iz); col.push(sand.r, sand.g, sand.b);
  }
  for (let k = 0; k < N; k++) {
    const a = base + k * 2, b = base + ((k + 1) % N) * 2;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  // inner lip face down to the water
  const base2 = pos.length / 3;
  for (let k = 0; k < N; k++) {
    const [ix, iz] = rimIn[k];
    const ih = terr.heightAt(ix, iz);
    pos.push(ix, ih > 0.3 ? ih + 0.05 : topAt(ix, iz), iz); col.push(sand.r, sand.g, sand.b);
    pos.push(ix, -1.5, iz); col.push(0.85, 0.7, 0.5);
  }
  for (let k = 0; k < N; k++) {
    const a = base2 + k * 2, b = base2 + ((k + 1) % N) * 2;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true; mesh.castShadow = false; mesh.name = 'diorama';
  return mesh;
}
