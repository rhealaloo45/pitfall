/* Landmarks — stylised, game-scale interpretations built from public reference
   (silhouettes and arrangement, not measured reproductions). */
import * as THREE from 'three';
import { PLACES, PLAZAS } from './layout.js';
import { FacadeBuilder, facadeMaterial, rectPts, STYLE } from './buildings.js';
import { facadeTextures, LAYER } from './facades.js';
import { TEX } from '../core/texgen.js';
import { canvasTexture, orientStrut, mergeStaticByMaterial } from '../core/geo.js';

/** Dressed stone projected in world space (no UVs needed), from the mipmapped facade library:
    blocks bw × bh metres, tinted `color`, with mortar relief in the normal map. */
export function stoneMaterial(color, bw = 1.1, bh = 0.55, rough = 0.88) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough });
  if (!TEX.webgl2) return m;
  const T = facadeTextures(TEX.facadeSize || 512);
  const U = { uFacA: { value: T.A }, uFacB: { value: T.B }, uStoneScale: { value: new THREE.Vector2(3 * bw, 6 * bh) } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSWp; varying vec3 vSWn;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vSWp = (modelMatrix * vec4(position,1.0)).xyz; vSWn = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        precision highp sampler2DArray; uniform sampler2DArray uFacA, uFacB; uniform vec2 uStoneScale;
        varying vec3 vSWp; varying vec3 vSWn; vec2 gSN; vec2 gSUv; float gSRough;`)
      .replace('#include <map_fragment>', `
        vec3 an = abs(vSWn);
        vec2 p = an.y > 0.7 ? vSWp.xz : (an.x > an.z ? vSWp.zy : vSWp.xy);
        gSUv = p / uStoneScale;
        vec4 sA = texture(uFacA, vec3(gSUv, ${LAYER.stone}.0));
        vec4 sB = texture(uFacB, vec3(gSUv, ${LAYER.stone}.0));
        diffuseColor.rgb *= sA.rgb * 1.25;
        gSN = sB.rg * 2.0 - 1.0; gSRough = sB.b;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(roughness, gSRough, 0.5);')
      .replace('#include <normal_fragment_maps>', `{
        vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition); vec2 st0 = dFdx(gSUv), st1 = dFdy(gSUv);
        vec3 q1p = cross(q1, normal), q0p = cross(normal, q0);
        vec3 Tt = q1p * st0.x + q0p * st1.x, Bt = q1p * st0.y + q0p * st1.y;
        float det = max(dot(Tt, Tt), dot(Bt, Bt)); float sc = det == 0.0 ? 0.0 : inversesqrt(det);
        normal = normalize(Tt * gSN.x * sc + Bt * gSN.y * sc + normal * sqrt(max(0.0, 1.0 - dot(gSN, gSN))));
      }`);
  };
  m.customProgramCacheKey = () => 'stone-v2';
  return m;
}

function signTexture(lines, { w = 1024, h = 192, bg = '#1a2433', fg = '#f4efe2', accent = null, font = 'Titillium Web' } = {}) {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (accent) { g.fillStyle = accent; g.fillRect(0, h - 14, w, 14); }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((ln, i) => {
      const size = i === 0 ? h * (lines.length > 1 ? 0.42 : 0.56) : h * 0.22;
      g.font = `${i === 0 ? 900 : 600} ${size}px "${font}", Arial, sans-serif`;
      const y = lines.length === 1 ? h / 2 : i === 0 ? h * 0.4 : h * 0.78;
      let s = size; while (g.measureText(ln).width > w * 0.92 && s > 10) { s -= 2; g.font = `${i === 0 ? 900 : 600} ${s}px "${font}", Arial, sans-serif`; }
      g.fillText(ln, w / 2, y);
    });
  });
}

/** Frame helper: local +z points from `c` toward the nearest road. */
function frame(net, cx, cz) {
  const n = net.nearestRoad(cx, cz, 200);
  const r = n.road, i = n.i;
  let fx = r.x[i] - cx, fz = r.z[i] - cz; const L = Math.hypot(fx, fz); fx /= L; fz /= L;
  const rot = Math.atan2(fx, fz);
  const c = Math.cos(rot), s = Math.sin(rot);
  const edge = L - (r.T.hw + r.T.sidewalk);
  return { rot, edge, road: r, i, T: (x, z) => [cx + x * c + z * s, cz - x * s + z * c] };
}

export function buildLandmarks(ctx) {
  const { scene, net, terr, colliders, atmo } = ctx;
  const group = new THREE.Group(); group.name = 'landmarks';
  const fb = new FacadeBuilder();
  const facMat = facadeMaterial(atmo.night);
  const basalt = stoneMaterial(0xc6a573, 1.2, 0.6);
  const darkStone = stoneMaterial(0x7d7062, 0.9, 0.45, 0.95);
  const whiteStone = stoneMaterial(0xe9e2d3, 1.4, 0.7, 0.8);
  const plaster = new THREE.MeshStandardMaterial({ color: 0xece4d2, roughness: 0.85 });
  const maroon = new THREE.MeshStandardMaterial({ color: 0x7a2a28, roughness: 0.7 });
  const red = new THREE.MeshStandardMaterial({ color: 0x8a2a20, roughness: 0.55, metalness: 0.1 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x40454c, roughness: 0.45, metalness: 0.7 });
  const add = (geo, mat, x, y, z, ry = 0, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = cast; m.receiveShadow = true; group.add(m); return m; };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const plazaH = id => PLAZAS.find(p => p.id === id).h;
  const markers = [];

  /* =============== Gateway of India =============== */
  {
    const g0 = plazaH('gatewayPlaza') + 0.05, cx = 926, cz = 1052;
    const archShape = (W, H, aw, ah) => {
      const s = new THREE.Shape(), r = aw / 2, spring = ah - r;
      s.moveTo(-W / 2, 0); s.lineTo(-r, 0); s.lineTo(-r, spring);
      s.absarc(0, spring, r, Math.PI, 0, true);
      s.lineTo(r, 0); s.lineTo(W / 2, 0); s.lineTo(W / 2, H); s.lineTo(-W / 2, H); s.closePath();
      return s;
    };
    const extrude = (shape, depth) => { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 14 }); g.translate(0, 0, -depth / 2); g.rotateY(Math.PI / 2); return g; };
    // plinth & steps to the water
    add(box(30, 1.2, 52), basalt, cx + 2, g0 - 0.5, cz);
    for (let k = 0; k < 6; k++) add(box(1.4, 0.45, 40), basalt, cx + 16.5 + k * 1.3, g0 - 0.6 - k * 0.45, cz, 0, false);
    // central arch block
    add(extrude(archShape(22, 21, 8.4, 16.2), 14), basalt, cx, g0, cz);
    // wings with smaller arches
    for (const s of [1, -1]) add(extrude(archShape(9, 13.5, 4, 9), 12), basalt, cx, g0, cz + s * 15.5);
    // cornices, attic and jali parapet
    add(box(15, 1, 24), basalt, cx, g0 + 21.3, cz);
    add(box(14.4, 2.2, 23), darkStone, cx, g0 + 22.8, cz);
    for (const s of [1, -1]) { add(box(13, 0.8, 9.6), basalt, cx, g0 + 13.8, cz + s * 15.5); add(box(12.4, 1.4, 9), darkStone, cx, g0 + 14.9, cz + s * 15.5); }
    add(box(14.6, 0.7, 22.6), basalt, cx, g0 + 16.9, cz);   // band at the arch crown
    // pilasters on both faces
    for (const fx of [-7.2, 7.2]) for (const pz of [-10.2, -5.4, 5.4, 10.2]) add(box(0.5, 20.6, 1.1), basalt, cx + fx, g0 + 10.3, cz + pz);
    // central dome behind the attic
    const dome = add(new THREE.SphereGeometry(6.2, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), basalt, cx, g0 + 23.6, cz); dome.scale.y = 0.75;
    add(new THREE.CylinderGeometry(6.4, 6.4, 1.2, 28), darkStone, cx, g0 + 23.4, cz);
    // four corner turrets with domes and finials
    for (const tx of [-6.8, 6.8]) for (const tz of [-10.3, 10.3]) {
      add(new THREE.CylinderGeometry(1.7, 1.9, 8.5, 8), basalt, cx + tx, g0 + 22.5, cz + tz);
      add(new THREE.CylinderGeometry(2.0, 2.0, 0.6, 8), darkStone, cx + tx, g0 + 26.9, cz + tz);
      const d = add(new THREE.SphereGeometry(1.7, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), basalt, cx + tx, g0 + 27.2, cz + tz); d.scale.y = 1.2;
      add(new THREE.ConeGeometry(0.25, 1.6, 6), basalt, cx + tx, g0 + 30, cz + tz);
    }
    for (const s of [1, -1]) for (const tz of [-4, 4]) {
      add(new THREE.CylinderGeometry(1.0, 1.1, 4.5, 8), basalt, cx + 5.4, g0 + 16.2, cz + s * 15.5 + tz);
      const d = add(new THREE.SphereGeometry(1.05, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), basalt, cx + 5.4, g0 + 18.4, cz + s * 15.5 + tz); d.scale.y = 1.25;
    }
    // inner arch shadow (soffit darkening)
    add(box(13.8, 0.2, 8.2), darkStone, cx, g0 + 16.0, cz, 0, false);
    // colliders: arch piers (the central arch is open — you can drive through)
    colliders.box(cx, cz - 7.6, 7, 3.4, Math.PI / 2, g0 - 1, g0 + 30, 'landmark');
    colliders.box(cx, cz + 7.6, 7, 3.4, Math.PI / 2, g0 - 1, g0 + 30, 'landmark');
    for (const s of [1, -1]) colliders.box(cx, cz + s * 15.5, 6, 4.5, 0, g0 - 1, g0 + 20, 'landmark');
    colliders.wall(cx + 15.5, cz - 22, cx + 15.5, cz + 22, g0 - 3, g0 + 1.2, 'steps');
  }

  /* =============== Taj Mahal Palace (stylised) =============== */
  {
    const cx = 846, cz = 1102, gy = terr.heightAt(cx, cz) - 0.5;
    const cream = new THREE.Color(0xdcc9a4), roof = new THREE.Color(0x6b6156);
    const fac = [STYLE.heritage, 4.3, 3.4, 113];
    const H = 6 * 4.3;
    fb.prism(rectPts(cx, cz, 9, 34, 0), gy, gy + H, cream, fac, roof, [STYLE.roof, 3, 3, 1]);
    fb.prism(rectPts(cx - 18, cz + 26, 18, 8, 0), gy, gy + H - 4.3, cream, fac, roof, [STYLE.roof, 3, 3, 2]);
    fb.prism(rectPts(cx - 18, cz - 26, 18, 8, 0), gy, gy + H - 4.3, cream, fac, roof, [STYLE.roof, 3, 3, 3]);
    fb.prism(rectPts(cx, cz, 9.6, 34.6, 0), gy + H, gy + H + 1.2, cream.clone().multiplyScalar(0.92), [STYLE.plain, 3, 3, 0], roof, [STYLE.roof, 3, 3, 4]);
    // the famous red central dome on a drum, and corner domes
    add(new THREE.CylinderGeometry(7.5, 7.5, 5, 24), whiteStone, cx, gy + H + 3.6, cz);
    const dm = add(new THREE.SphereGeometry(7.8, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), red, cx, gy + H + 6, cz); dm.scale.y = 1.15;
    add(new THREE.ConeGeometry(0.5, 4, 8), whiteStone, cx, gy + H + 16, cz);
    for (const dz of [-30, 30]) for (const dx of [-6, 6]) {
      add(new THREE.CylinderGeometry(2.3, 2.3, 3, 12), whiteStone, cx + dx, gy + H + 2.6, cz + dz);
      const d = add(new THREE.SphereGeometry(2.5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), red, cx + dx, gy + H + 4, cz + dz); d.scale.y = 1.3;
    }
    for (const dz of [-14, 14]) { const d = add(new THREE.SphereGeometry(3.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), red, cx + 7, gy + H + 1.2, cz + dz); d.scale.y = 1.2; }
    colliders.box(cx, cz, 9, 34, 0, gy - 1, gy + H + 10);
    colliders.box(cx - 18, cz + 26, 18, 8, 0, gy - 1, gy + H);
    colliders.box(cx - 18, cz - 26, 18, 8, 0, gy - 1, gy + H);
  }

  /* =============== Pit Wall — Career HQ + start/finish gantry =============== */
  {
    const p = PLACES.find(q => q.id === 'pitwall');
    const gy = terr.heightAt(p.x, p.z);
    // pavilion
    fb.prism(rectPts(p.x, p.z - 10, 14, 6, 0), gy - 0.4, gy + 7.6, new THREE.Color(0x2a2e35), [STYLE.glass, 3.8, 1.6, 77], new THREE.Color(0x33373d), [STYLE.roof, 3, 3, 5]);
    add(box(30, 0.5, 14), steel, p.x, gy + 7.9, p.z - 9.5);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 2.4), new THREE.MeshStandardMaterial({ map: signTexture(['PIT WALL', 'CAREER HQ · FINISH'], { bg: '#121418', accent: '#d81f26' }), emissive: 0xffffff, emissiveIntensity: 0.25, emissiveMap: null }));
    sign.material.emissiveMap = sign.material.map;
    sign.position.set(p.x, gy + 9.5, p.z - 3.6); group.add(sign);
    add(box(16.4, 2.8, 0.3), steel, p.x, gy + 9.5, p.z - 3.8);
    colliders.box(p.x, p.z - 10, 14, 6, 0, gy - 1, gy + 9);
    // gantry over Apollo Bunder with five start lights
    const r = net.roads.find(q => q.id === 'apollo');
    let gi = 0, bd = 1e9; for (let i = 0; i < r.n; i++) { const d = Math.abs(r.x[i] - 832); if (d < bd) { bd = d; gi = i; } }
    const nx = r.tz[gi], nz = -r.tx[gi], h = r.h[gi];
    const span = r.T.hw + r.T.sidewalk + 0.6;
    for (const s of [1, -1]) {
      add(box(0.8, 7.5, 0.8), steel, r.x[gi] + nx * span * s, h + 3.75, r.z[gi] + nz * span * s);
      colliders.post(r.x[gi] + nx * span * s, r.z[gi] + nz * span * s, 0.6, h - 1, h + 7);
    }
    const beam = add(box(span * 2 + 1, 1.1, 1.0), steel, r.x[gi], h + 7.2, r.z[gi], Math.atan2(nx, nz) + Math.PI / 2);
    beam.rotation.y = Math.atan2(r.tx[gi], r.tz[gi]) + Math.PI / 2;
    const lights = [];
    for (let k = 0; k < 5; k++) {
      const off = (k - 2) * 1.6;
      const lm = new THREE.MeshStandardMaterial({ color: 0x2a0606, emissive: 0xff2a1a, emissiveIntensity: 0, roughness: 0.3 });
      const housing = add(new THREE.BoxGeometry(0.62, 1.5, 0.5), steel, r.x[gi] + nx * off + r.tx[gi] * 0.6, h + 6.9, r.z[gi] + nz * off + r.tz[gi] * 0.6, Math.atan2(r.tx[gi], r.tz[gi]), false);
      for (const dy of [0.32, -0.3]) { const l = add(new THREE.SphereGeometry(0.2, 12, 8), lm, r.x[gi] + nx * off + r.tx[gi] * 0.86, h + 6.9 + dy, r.z[gi] + nz * off + r.tz[gi] * 0.86, 0, false); l.scale.z = 0.5; l.rotation.y = Math.atan2(r.tx[gi], r.tz[gi]); }
      void housing;
      lights.push(lm);
    }
    const timing = new THREE.Mesh(new THREE.PlaneGeometry(5, 1), new THREE.MeshBasicMaterial({ map: signTexture(['MUMBAI GP · START / FINISH'], { bg: '#0d0f12', fg: '#ffd166', h: 160 }) }));
    timing.position.set(r.x[gi] - r.tx[gi] * 0.52, h + 8.4, r.z[gi] - r.tz[gi] * 0.52); timing.rotation.y = Math.atan2(r.tx[gi], r.tz[gi]); group.add(timing);
    // chequered line across the road
    const chk = canvasTexture(256, 32, g => { for (let y = 0; y < 2; y++) for (let x = 0; x < 16; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#eee'; g.fillRect(x * 16, y * 16, 16, 16); } });
    const line = new THREE.Mesh(new THREE.PlaneGeometry(r.T.hw * 2 - 0.6, 1.6), new THREE.MeshStandardMaterial({ map: chk, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4 }));
    line.rotation.x = -Math.PI / 2; line.rotation.z = Math.atan2(nx, nz) + Math.PI / 2;
    line.position.set(r.x[gi], h + 0.02, r.z[gi]); line.rotation.order = 'YXZ'; line.rotation.set(-Math.PI / 2, 0, 0); line.rotateZ(Math.atan2(r.tx[gi], r.tz[gi]) * -1 + 0);
    line.rotation.set(0, Math.atan2(r.tx[gi], r.tz[gi]), 0); line.rotateX(-Math.PI / 2);
    group.add(line);
    markers.startLights = lights;
  }

  /* =============== Villa Theresa High School (stylised) =============== */
  {
    const cx = -196, cz = -48;
    const F = frame(net, cx, cz);
    const gy = plazaH('vtCourt') + 0.05;
    const front = F.edge - 1.2;               // compound wall line, just behind the sidewalk
    const W = 40;
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xe6dcc8, roughness: 0.9 });
    const wall = (x0, z0, x1, z1, hgt = 2.3) => {
      const [ax, az] = F.T(x0, z0), [bx, bz] = F.T(x1, z1);
      const L = Math.hypot(bx - ax, bz - az);
      add(box(L, hgt, 0.35), wallMat, (ax + bx) / 2, gy + hgt / 2 - 0.4, (az + bz) / 2, Math.atan2(bz - az, bx - ax) * -1);
      add(box(L, 0.18, 0.5), maroon, (ax + bx) / 2, gy + hgt - 0.3, (az + bz) / 2, Math.atan2(bz - az, bx - ax) * -1, false);
      colliders.wall(ax, az, bx, bz, gy - 1, gy + hgt, 'wall');
    };
    wall(-W, front, -5, front); wall(5, front, W, front);
    wall(-W, front, -W, -38); wall(W, front, W, -38); wall(-W, -38, W, -38);
    // gate pillars + arch sign
    for (const s of [-5.6, 5.6]) { const [px, pz] = F.T(s, front); add(box(1.2, 4.2, 1.2), plaster, px, gy + 1.7, pz); add(box(1.5, 0.3, 1.5), maroon, px, gy + 3.9, pz); colliders.post(px, pz, 0.8, gy - 1, gy + 4); }
    const [sx, sz] = F.T(0, front);
    const signMat = new THREE.MeshStandardMaterial({ map: signTexture(['VILLA THERESA HIGH SCHOOL', 'PEDDAR ROAD · MUMBAI'], { bg: '#f3ecdc', fg: '#6b1f22', accent: '#6b1f22' }), roughness: 0.6 });
    const sg = add(box(12, 1.6, 0.25), [plaster, plaster, plaster, plaster, signMat, signMat], sx, gy + 4.6, sz, F.rot);
    // main block (L-shape): open corridors facing the courtyard, maroon bands
    const cream = new THREE.Color(0xece2cc), roofC = new THREE.Color(0x5c5550);
    const bfac = [STYLE.chawl, 3.7, 3.0, 42];
    const blockA = rectPts(...F.T(0, -26), 30, 7, F.rot);
    fb.prism(blockA, gy - 0.5, gy + 15.4, cream, bfac, roofC, [STYLE.roof, 3, 3, 6]);
    fb.prism(rectPts(...F.T(0, -26), 30.4, 7.4, F.rot), gy + 15.4, gy + 16.2, new THREE.Color(0x7a2a28), [STYLE.plain, 3, 3, 0], roofC, [STYLE.roof, 3, 3, 6]);
    const blockB = rectPts(...F.T(-24, -6), 6, 13, F.rot);
    fb.prism(blockB, gy - 0.5, gy + 11.7, cream, bfac, roofC, [STYLE.roof, 3, 3, 7]);
    fb.prism(rectPts(...F.T(-24, -6), 6.4, 13.4, F.rot), gy + 11.7, gy + 12.5, new THREE.Color(0x7a2a28), [STYLE.plain, 3, 3, 0], roofC, [STYLE.roof, 3, 3, 7]);
    // pediment over the entrance + name board on the building
    const [ex, ez] = F.T(0, -18.8);
    add(box(9, 4, 1.2), plaster, ex, gy + 13.6, ez, F.rot);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.2), new THREE.MeshStandardMaterial({ map: signTexture(['VILLA THERESA'], { bg: '#7a2a28', fg: '#f6efe0', h: 160 }) }));
    const [bx2, bz2] = F.T(0, -18.15); board.position.set(bx2, gy + 13.4, bz2); board.rotation.y = F.rot; group.add(board);
    colliders.box(...F.T(0, -26), 30, 7, F.rot, gy - 1, gy + 16);
    colliders.box(...F.T(-24, -6), 6, 13, F.rot, gy - 1, gy + 12);
    // courtyard: court markings and a flagpole
    const court = canvasTexture(512, 256, g => { g.fillStyle = '#9d8d76'; g.fillRect(0, 0, 512, 256); g.strokeStyle = '#f2efe6'; g.lineWidth = 5; g.strokeRect(14, 14, 484, 228); g.beginPath(); g.moveTo(256, 14); g.lineTo(256, 242); g.stroke(); g.beginPath(); g.arc(256, 128, 40, 0, 7); g.stroke(); });
    const cm = add(new THREE.PlaneGeometry(26, 14), new THREE.MeshStandardMaterial({ map: court, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }), ...[F.T(8, -6)[0], gy + 0.02, F.T(8, -6)[1]], 0, false);
    cm.rotation.set(-Math.PI / 2, 0, F.rot);
    const [fx, fz] = F.T(14, front - 4);
    add(new THREE.CylinderGeometry(0.08, 0.1, 9, 8), steel, fx, gy + 4.5, fz);
  }

  /* =============== K. C. College, Churchgate (stylised) =============== */
  {
    const cx = 302, cz = 752;
    const F = frame(net, cx, cz);
    const gy = plazaH('kcCourt') + 0.05;
    const pts = rectPts(...F.T(0, -12), 20, 9, F.rot);
    fb.prism(pts, gy - 0.5, gy + 26, new THREE.Color(0xe3dccb), [STYLE.office, 3.6, 2.2, 217], new THREE.Color(0x5d5852), [STYLE.roof, 3, 3, 8]);
    fb.prism(rectPts(...F.T(0, -12), 20.4, 9.4, F.rot), gy + 26, gy + 27, new THREE.Color(0x24486e), [STYLE.plain, 3, 3, 0], new THREE.Color(0x5d5852), [STYLE.roof, 3, 3, 8]);
    colliders.box(...F.T(0, -12), 20, 9, F.rot, gy - 1, gy + 28);
    const [cx2, cz2] = F.T(0, -1.8);
    add(box(10, 0.4, 4), steel, cx2, gy + 4, cz2, F.rot);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(14, 2), new THREE.MeshStandardMaterial({ map: signTexture(['K. C. COLLEGE', 'CHURCHGATE'], { bg: '#24486e', fg: '#ffffff' }) }));
    const [sx, sz] = F.T(0, -2.9); s.position.set(sx, gy + 24.6, sz); s.rotation.y = F.rot; group.add(s);
  }

  /* =============== K. J. Somaiya Institute of Technology, Sion (stylised) =============== */
  {
    const cx = 952, cz = -1214;
    const F = frame(net, cx, cz);
    const gy = plazaH('kjsitForecourt') + 0.05;
    const grey = new THREE.Color(0xdad6cd), terracotta = new THREE.Color(0x9a4a32), roofC = new THREE.Color(0x56524d);
    // main block: G+8, as described on the institute's site
    const main = rectPts(...F.T(0, -30), 32, 10, F.rot);
    fb.prism(main, gy - 0.5, gy + 34, grey, [STYLE.office, 3.7, 2.4, 311], roofC, [STYLE.roof, 3, 3, 9]);
    for (let k = 1; k <= 3; k++) fb.prism(rectPts(...F.T(0, -30), 32.3, 10.3, F.rot), gy + k * 11 - 0.6, gy + k * 11, terracotta, [STYLE.plain, 3, 3, 0], null, null);
    fb.prism(rectPts(...F.T(0, -30), 32.4, 10.4, F.rot), gy + 34, gy + 35.2, terracotta, [STYLE.plain, 3, 3, 0], roofC, [STYLE.roof, 3, 3, 9]);
    colliders.box(...F.T(0, -30), 32, 10, F.rot, gy - 1, gy + 36);
    // second (newer) block to the side
    fb.prism(rectPts(...F.T(42, -14), 10, 16, F.rot), gy - 0.5, gy + 19, new THREE.Color(0x3a444b), [STYLE.glass, 3.8, 1.6, 413], roofC, [STYLE.roof, 3, 3, 10]);
    fb.prism(rectPts(...F.T(42, -14), 10.4, 16.4, F.rot), gy + 19, gy + 20, terracotta, [STYLE.plain, 3, 3, 0], roofC, [STYLE.roof, 3, 3, 10]);
    colliders.box(...F.T(42, -14), 10, 16, F.rot, gy - 1, gy + 21);
    // entrance portico + name on the facade
    const [px, pz] = F.T(0, -18.5);
    add(box(16, 0.6, 5), terracottaMat(), px, gy + 5.2, pz, F.rot);
    for (const s of [-7, 7]) { const [qx, qz] = F.T(s, -17); add(box(0.7, 5, 0.7), plaster, qx, gy + 2.5, qz); colliders.post(qx, qz, 0.5, gy - 1, gy + 5); }
    const name = new THREE.Mesh(new THREE.PlaneGeometry(26, 2.2), new THREE.MeshStandardMaterial({ map: signTexture(['K. J. SOMAIYA INSTITUTE OF TECHNOLOGY', 'SION · MUMBAI'], { bg: '#f1ece2', fg: '#7c2b1f', accent: '#7c2b1f' }), roughness: 0.6 }));
    const [nx, nz] = F.T(0, -19.75); name.position.set(nx, gy + 30.5, nz); name.rotation.y = F.rot; group.add(name);
    // campus gate arch at the drive entrance
    const [g1x, g1z] = F.T(-8, F.edge - 2), [g2x, g2z] = F.T(8, F.edge - 2);
    for (const [x, z] of [[g1x, g1z], [g2x, g2z]]) { add(box(1.4, 6, 1.4), plaster, x, gy + 2.6, z); colliders.post(x, z, 0.9, gy - 1, gy + 6); }
    const [gx, gz] = F.T(0, F.edge - 2);
    const gm = new THREE.MeshStandardMaterial({ map: signTexture(['KJSIT', 'SOMAIYA AYURVIHAR CAMPUS'], { bg: '#7c2b1f', fg: '#ffffff', h: 220 }) });
    add(box(17.4, 2, 0.6), [plaster, plaster, plaster, plaster, gm, gm], gx, gy + 6.4, gz, F.rot);
  }
  function terracottaMat() { return new THREE.MeshStandardMaterial({ color: 0x9a4a32, roughness: 0.8 }); }

  /* =============== Bandra Fort (Castella de Aguada) =============== */
  {
    const cx = -548, cz = -1572, gy = plazaH('fortGround');
    const pts = [[-14, -8], [-4, -14], [10, -12], [15, 0], [9, 11], [-6, 12], [-15, 3]];
    const W = (a, b, hgt) => {
      const [ax, az] = [cx + a[0], cz + a[1]], [bx, bz] = [cx + b[0], cz + b[1]];
      const L = Math.hypot(bx - ax, bz - az), ang = -Math.atan2(bz - az, bx - ax);
      const n = Math.ceil(L / 2.4);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const hh = hgt * (0.55 + 0.45 * Math.abs(Math.sin(k * 1.7 + a[0]))) + (k % 3 === 0 ? 0 : 0);
        add(box(L / n + 0.05, hh, 1.6), darkStone, x, gy + hh / 2 - 0.5, z, ang);
        if (k % 2 === 0) add(box(0.9, 0.9, 1.6), darkStone, x, gy + hh - 0.05, z, ang);
      }
      colliders.wall(ax, az, bx, bz, gy - 1, gy + hgt, 'fort');
    };
    for (let i = 0; i < pts.length; i++) if (i !== 5) W(pts[i], pts[(i + 1) % pts.length], 5 + (i % 3) * 1.5);
    // inner keep and steps
    add(box(7, 8.5, 6), darkStone, cx + 2, gy + 3.8, cz - 2);
    for (let k = 0; k < 6; k++) add(box(2.4, 0.4, 0.8), darkStone, cx + 6.2, gy + 0.2 + k * 0.4, cz - 4 + k * 0.8);
    colliders.box(cx + 2, cz - 2, 3.5, 3, 0, gy - 1, gy + 9);
  }

  /* =============== Bandra–Worli Sea Link pylons & stays =============== */
  const cables = [];
  {
    const r = net.roads.find(q => q.id === 'seaLink');
    const concrete = new THREE.MeshStandardMaterial({ color: 0xc9c5bc, roughness: 0.75 });
    const leg = new THREE.BoxGeometry(1, 1, 1);
    const strutBox = (A, B, w, d) => { const m = new THREE.Mesh(leg, concrete); orientStrut(m, A, B); m.scale.x = w; m.scale.z = d; m.castShadow = true; m.receiveShadow = true; group.add(m); return m; };
    for (const [frac, height, spread] of [[0.6, 78, 13], [0.3, 52, 9]]) {
      const i = Math.round(frac * (r.n - 1));
      const x = r.x[i], z = r.z[i], h = r.h[i], tx = r.tx[i], tz = r.tz[i];
      const P = (along, y) => new THREE.Vector3(x + tx * along, y, z + tz * along);
      const head0 = h + height * 0.62;
      for (const s of [1, -1]) {
        strutBox(P(s * spread * 1.25, -2), P(s * spread, h - 2.5), 2.6, 3.2);           // flaring lower leg
        strutBox(P(s * spread, h - 2.5), P(s * 1.6, head0), 2.2, 2.8);                    // converging upper leg
        colliders.post(P(s * spread, h).x, P(s * spread, h).z, 1.6, h - 4, h + 6);
      }
      strutBox(P(0, head0 - 2), P(0, h + height), 3.4, 4.2);                                 // tower head
      strutBox(P(-spread * 0.9, h - 3.2), P(spread * 0.9, h - 3.2), 2.2, 4);                 // cross beam under the deck
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2020, emissiveIntensity: 1.5 }));
      tip.position.copy(P(0, h + height + 0.8)); group.add(tip);
      // fan of stays in the central plane, anchored in the median
      const n = 11;
      for (const s of [1, -1]) for (let k = 0; k < n; k++) {
        const ay = head0 + 4 + (h + height - 3 - head0 - 4) * (k / (n - 1));
        const along = s * (18 + k * (spread * 0.9 + height * 0.11));
        let j = i + Math.round(along / (r.L / (r.n - 1)));
        j = Math.max(0, Math.min(r.n - 1, j));
        cables.push([P(0, ay), new THREE.Vector3(r.x[j], r.h[j] + 0.9, r.z[j])]);
      }
    }
    const cg = new THREE.CylinderGeometry(0.11, 0.11, 1, 5);
    const cm = new THREE.InstancedMesh(cg, new THREE.MeshStandardMaterial({ color: 0xe8e6df, roughness: 0.4, metalness: 0.5 }), cables.length);
    const o = new THREE.Object3D();
    cables.forEach(([a, b], k) => { orientStrut(o, a, b); o.updateMatrix(); cm.setMatrixAt(k, o.matrix); });
    group.add(cm);
  }

  /* =============== Girgaum Chowpatty stalls =============== */
  {
    // food stalls: whitewashed counters under faded tarpaulin awnings on poles
    const tarps = [0x8e3a2e, 0x3e5f7a, 0xa8843e, 0x3f6b55, 0x7e4658, 0x9a5e36].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, side: THREE.DoubleSide }));
    const counter = new THREE.MeshStandardMaterial({ color: 0xe2dccf, roughness: 0.85 });
    for (let k = 0; k < 7; k++) {
      const x = -300 + k * 13, z = 352 + Math.sin(k) * 4;
      const gy = terr.heightAt(x, z);
      if (gy < 0.4) continue;
      add(box(3.4, 1.1, 1.6), counter, x, gy + 0.55, z);
      add(box(3.2, 0.9, 0.12), counter, x, gy + 1.5, z - 0.7);                  // back board
      for (const sx of [-1.6, 1.6]) for (const sz of [-0.9, 0.9]) add(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), steel, x + sx, gy + 1.3, z + sz, 0, false);
      const t = add(box(3.9, 0.05, 2.6), tarps[k % tarps.length], x, gy + 2.62, z);
      t.rotation.x = -0.12;
      colliders.box(x, z, 1.7, 0.9, 0, gy - 1, gy + 3);
    }
  }

  /* =============== BKC plaza: fountain + signature tower =============== */
  {
    const p = PLAZAS.find(q => q.id === 'bkcPlaza');
    add(new THREE.CylinderGeometry(9, 9.4, 0.8, 40), whiteStone, p.x, p.h + 0.4, p.z);
    const water = add(new THREE.CircleGeometry(8.4, 40), new THREE.MeshStandardMaterial({ color: 0x2b6f86, roughness: 0.05, metalness: 0.3 }), p.x, p.h + 0.75, p.z, 0, false);
    water.rotation.x = -Math.PI / 2;
    add(new THREE.CylinderGeometry(0.6, 1.4, 4, 16), whiteStone, p.x, p.h + 2.6, p.z);
    colliders.post(p.x, p.z, 9.2, p.h - 1, p.h + 2);
    const tx = p.x + 30, tz = p.z - 46, gy = terr.heightAt(tx, tz) - 0.5;
    fb.prism(rectPts(tx, tz, 16, 16, 0.3, 6), gy, gy + 150, new THREE.Color(0x2f3a42), [STYLE.glass, 3.9, 1.6, 777], new THREE.Color(0x24292e), [STYLE.roof, 3, 3, 3]);
    fb.prism(rectPts(tx, tz, 9, 9, 0.3), gy + 150, gy + 162, new THREE.Color(0x24292e), [STYLE.plain, 3, 3, 0], new THREE.Color(0x24292e), [STYLE.roof, 3, 3, 3]);
    colliders.box(tx, tz, 16, 16, 0.3, gy - 1, gy + 160);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), new THREE.MeshStandardMaterial({ map: signTexture(['BKC'], { bg: '#0f1720', fg: '#ffffff', h: 220, accent: '#c8151d' }), emissiveIntensity: 0.4, emissive: 0xffffff }));
    s.material.emissiveMap = s.material.map;
    s.position.set(p.x, p.h + 3, p.z + 30); group.add(s);
    add(box(12.4, 3.4, 0.4), steel, p.x, p.h + 3, p.z + 29.75);
  }

  const fbMesh = new THREE.Mesh(fb.geometry(), facMat);
  fbMesh.castShadow = fbMesh.receiveShadow = true;
  group.add(fbMesh);

  /* =============== destination beacons =============== */
  const beaconMat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  // soft light shaft: bright core, feathered edges, fading upward (no hard cylinder walls)
  const beamMat = c => new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(c) }, uOp: { value: 0.5 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying float vY; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); vY = uv.y; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform vec3 uCol; uniform float uOp; varying vec3 vN; varying vec3 vV; varying float vY; void main(){ float core = pow(abs(dot(normalize(vN), normalize(vV))), 3.0); float a = core * (1.0 - vY) * (1.0 - vY) * smoothstep(0.0, 0.04, vY) * uOp; gl_FragColor = vec4(uCol * a, 1.0); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const beacons = [], bursts = [];
  for (const pl of PLACES) {
    let y = terr.heightAt(pl.x, pl.z);
    if (pl.elevated) { const out = {}; net.roadSurface(pl.x, pl.z, 100, out); y = out.h || y; }
    else { const out = {}; if (net.roadSurface(pl.x, pl.z, y + 2, out)) y = Math.max(y, out.h); }
    // portfolio chapters glow warm amber, landmarks a pale gold — no neon
    const color = pl.kind === 'chapter' ? 0xffa53a : 0xe8d6a8;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, 70, 20, 1, true), beamMat(color));
    beam.position.set(pl.x, y + 35, pl.z); beam.renderOrder = 5; beam.userData.noAO = true;
    beam.material.uniforms.uOp.value = pl.kind === 'chapter' ? 0.55 : 0.35;
    const ring = new THREE.Mesh(new THREE.RingGeometry(pl.r * 0.55, pl.r * 0.55 + 0.35, 64), beaconMat(color));
    ring.rotation.x = -Math.PI / 2; ring.position.set(pl.x, y + 0.15, pl.z); ring.material.opacity = 0.45; ring.userData.noAO = true;
    beam.userData.dynamic = ring.userData.dynamic = true;
    group.add(beam, ring);
    beacons.push({ id: pl.id, beam, ring, base: y });
  }

  const merged = mergeStaticByMaterial(group);
  scene.add(group);
  return {
    group, beacons, startLights: markers.startLights, merged,
    setVisited(id) { const b = beacons.find(q => q.id === id); if (b) { b.beam.material.uniforms.uOp.value = 0.1; b.ring.material.opacity = 0.12; } },
    celebrate(id) {
      const b = beacons.find(q => q.id === id); if (!b) return;
      const burst = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.25, 64), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
      burst.rotation.x = -Math.PI / 2; burst.position.copy(b.ring.position); burst.position.y += 0.2; burst.userData.t = 0;
      group.add(burst); bursts.push(burst);
    },
    update(t, dt = 0.016) {
      for (const b of beacons) { b.ring.scale.setScalar(1 + Math.sin(t * 2.2) * 0.04); }
      for (let i = bursts.length - 1; i >= 0; i--) { const m = bursts[i]; m.userData.t += dt; const k = m.userData.t / 1.2; m.scale.setScalar(1 + k * 22); m.material.opacity = 0.6 * (1 - k) * (1 - k); if (k >= 1) { group.remove(m); m.geometry.dispose(); bursts.splice(i, 1); } }
    },
  };
}
