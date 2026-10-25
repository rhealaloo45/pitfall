/* Beyond the map edge: the suburbs north of Bandra / Kurla, so the city fades
   into haze instead of ending at a cliff. One instanced draw call of simple
   towers with a mipmapped distant-facade texture (lit windows baked in for
   night), on a flat ground plane. The player is kept in by a wall along the
   edge, hidden behind the first row of blocks. */
import * as THREE from 'three';
import { WORLD_BOUNDS as B } from './layout.js';
import { rng, canvas, texFromCanvas } from '../core/texgen.js';

function distantFacade() {
  // 8 bays × 8 floors; RGB albedo (neutral, tinted per building), A unused
  const S = 512, c = canvas(S), g = c.getContext('2d');
  const e = canvas(S), ge = e.getContext('2d');
  const r = rng(11);
  g.fillStyle = '#d8d3c9'; g.fillRect(0, 0, S, S);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
  const cw = S / 8, ch = S / 8;
  for (let fy = 0; fy < 8; fy++) {
    // slab edge / floor band
    g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(0, fy * ch + ch - 6, S, 6);
    for (let bx = 0; bx < 8; bx++) {
      const x = bx * cw + cw * 0.18, y = fy * ch + ch * 0.22, w = cw * 0.64, h = ch * 0.52;
      g.fillStyle = r() < 0.15 ? '#5e676c' : '#3b464d'; g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x, y, w, h * 0.35);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 2, y + h, w + 4, 4);      // sill shadow
      if (r() < 0.42) { const k = 0.55 + r() * 0.45; ge.fillStyle = `rgb(${255 * k | 0},${182 * k | 0},${110 * k | 0})`; ge.fillRect(x, y, w, h); }
    }
  }
  // monsoon streaks
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(40,38,34,${0.03 + r() * 0.05})`; g.fillRect(r() * S, r() * S, 2 + r() * 5, 30 + r() * 120); }
  return { map: texFromCanvas(c), emissive: texFromCanvas(e) };
}

export function buildFarField(terr, colliders, quality) {
  const group = new THREE.Group(); group.name = 'farfield';
  const x0 = -470, x1 = 1170, zEdge = B.minZ;          // land between the Bandra shore and the harbour
  // ground
  const gGeo = new THREE.PlaneGeometry(x1 - x0 + 30, 9000, 8, 40);
  gGeo.rotateX(-Math.PI / 2);
  const p = gGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + (x0 + x1) / 2, z = p.getZ(i) + zEdge + 4 - 4500;
    const near = Math.max(0, Math.min(1, (z - (zEdge - 300)) / 300));     // blend into the terrain edge
    const edgeH = terr.heightAt(Math.max(B.minX, Math.min(B.maxX, x)), zEdge + 2);
    p.setXYZ(i, x, Math.max(0.25, edgeH * near + 0.25 * (1 - near)) - 0.05, Math.min(z, zEdge + 4));
  }
  gGeo.computeVertexNormals();
  const ground = new THREE.Mesh(gGeo, new THREE.MeshStandardMaterial({ color: 0x6d6457, roughness: 0.95 }));
  ground.receiveShadow = true;
  group.add(ground);

  // towers
  const { map, emissive } = distantFacade();
  const mat = new THREE.MeshStandardMaterial({ map, emissiveMap: emissive, emissive: 0x000000, roughness: 0.82, metalness: 0 });
  const night = { value: 0 };
  mat.onBeforeCompile = sh => {
    sh.uniforms.uNight = night;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFac; varying float vRoof; varying float vSeed;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vec3 lp = position * sc;
        vSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
        vFac = (abs(normal.x) > 0.5 ? vec2(lp.z, lp.y + sc.y * 0.5) : vec2(lp.x, lp.y + sc.y * 0.5)) / vec2(25.6, 25.6) + vec2(vSeed * 7.0, floor(vSeed * 5.0) * 0.125);
        vRoof = normal.y > 0.5 ? 1.0 : 0.0;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFac; varying float vRoof; varying float vSeed; uniform float uNight;')
      .replace('#include <map_fragment>', `
        vec4 fT = texture2D(map, vFac);
        diffuseColor.rgb *= mix(fT.rgb, vec3(0.62, 0.6, 0.57), vRoof);`)
      .replace('#include <emissivemap_fragment>', `
        totalEmissiveRadiance = texture2D(emissiveMap, vFac).rgb * (1.0 - vRoof) * uNight * 1.6 * (0.6 + 0.8 * vSeed);`);
  };
  mat.customProgramCacheKey = () => 'farfield-towers';
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.deleteAttribute('uv');
  const r = rng(97);
  const items = [];
  const pitch = 52;
  for (let z = zEdge - 24; z > zEdge - 4200; z -= pitch) {
    for (let x = x0 + 10; x < x1 - 10; x += pitch) {
      const jx = x + (r() - 0.5) * 14, jz = z + (r() - 0.5) * 14;
      const d = zEdge - z;                                   // distance beyond the edge
      if (r() < 0.24 && d > 60) continue;                     // open plots, maidans, rail yards
      const tall = r() < 0.1;
      const h = tall ? 40 + r() * 60 : 10 + r() * 22;
      const w = 16 + r() * 16, dd = 14 + r() * 14;
      items.push([jx, jz, w, h, dd, (r() - 0.5) * 0.25]);
    }
  }
  const inst = new THREE.InstancedMesh(box, mat, items.length);
  const o = new THREE.Object3D(), col = new THREE.Color();
  const tones = ['#e4ddd0', '#d9d4ca', '#cfc6b6', '#e0d3bd', '#c8c8c4', '#d6cab8', '#b9b6ae'];
  items.forEach(([x, z, w, h, d, rot], i) => {
    o.position.set(x, h / 2 + 0.2, z); o.rotation.set(0, rot, 0); o.scale.set(w, h, d); o.updateMatrix();
    inst.setMatrixAt(i, o.matrix);
    inst.setColorAt(i, col.set(tones[i % tones.length]).multiplyScalar(0.85 + r() * 0.15));
  });
  inst.castShadow = true; inst.receiveShadow = true;
  inst.computeBoundingSphere();
  group.add(inst);

  // keep the car in the playable area along the land edge
  colliders.wall(x0 - 40, zEdge + 6, x1 + 40, zEdge + 6, -5, 60, 'edge');
  return { group, setNight(v) { night.value = v; } };
}
