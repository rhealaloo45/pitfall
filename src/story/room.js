/* My room, behind the lit window at the end of the street: warm and lived-in. The desk sits under a window
   onto the Queen's Necklace at night; a pinboard of project notes, a Mumbai GP poster, fairy lights, a shelf
   with books and a trophy, a floor lamp in the corner. The laptop is generic (no logo); its screen is drawn
   by screen.js. Coordinates match the facade window in world.js (the room spans x 9.9–17.7, z 321.8–336.2). */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ink, facadeMat } from './world.js';

export const ROOM = { x0: 9.9, x1: 17.7, y0: 10, y1: 14, z0: 321.8, z1: 336.2, win: { z0: 325, z1: 333, y0: 10.8, y1: 13.4 } };
const mat = (color, o = {}) => ink(new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o }));
const glowMat = (color) => ink(new THREE.MeshBasicMaterial({ color, toneMapped: false }));
const put = (o, x, y, z) => { o.position.set(x, y, z); return o; };
const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); return b; };
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const HAND = '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive';

/* ---------- painted textures ---------- */
function necklaceView() {
  return canvasTex(1024, 512, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h * 0.6); sky.addColorStop(0, '#070c1f'); sky.addColorStop(1, '#2a2346');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + (i % 5) / 8})`; g.fillRect((i * 137) % w, (i * 71) % (h * 0.4), 1.5, 1.5); }
    // the far shore: Nariman Point's towers with lit windows
    const base = h * 0.56;
    for (let i = 0; i < 26; i++) {
      const x = w * 0.42 + i * 22 + (i % 3) * 5, bw = 14 + (i % 4) * 4, bh = 30 + ((i * 37) % 90);
      g.fillStyle = '#121a2e'; g.fillRect(x, base - bh, bw, bh);
      for (let y = base - bh + 4; y < base - 3; y += 6) for (let xx = x + 3; xx < x + bw - 3; xx += 5) if (((xx * 7 + y * 3) | 0) % 3 === 0) { g.fillStyle = '#ffd38f'; g.fillRect(xx, y, 2, 2); }
    }
    // the bay
    const sea = g.createLinearGradient(0, base, 0, h); sea.addColorStop(0, '#0d1a33'); sea.addColorStop(1, '#050a14');
    g.fillStyle = sea; g.fillRect(0, base, w, h - base);
    // the Queen's Necklace: an arc of warm lamps around the bay, and their reflections
    for (let i = 0; i <= 60; i++) {
      const t = i / 60, x = -40 + t * (w * 0.95), y = base + 2 + Math.sin(t * Math.PI) * h * 0.2 * (1 - t * 0.4);
      const r = g.createRadialGradient(x, y, 0, x, y, 12); r.addColorStop(0, 'rgba(255,226,170,1)'); r.addColorStop(0.3, 'rgba(255,190,110,.5)'); r.addColorStop(1, 'rgba(255,170,80,0)');
      g.fillStyle = r; g.fillRect(x - 12, y - 12, 24, 24);
      g.fillStyle = 'rgba(255,190,110,.22)'; g.fillRect(x - 1.5, y + 6, 3, 26 + (i % 4) * 6);
    }
  });
}
function pinboard() {
  return canvasTex(768, 480, (g, w, h) => {
    g.fillStyle = '#b48656'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { g.fillStyle = i % 2 ? 'rgba(90,55,25,.18)' : 'rgba(240,200,150,.14)'; g.fillRect((i * 53) % w, (i * 97) % h, 3, 2); }
    const notes = [['#ffe773', 'chub-guard\n→ PyPI ✓'], ['#ff9fc0', 'RoadHawk:\nCiiA top 80!'], ['#9fe0ff', 'SHAP\n> vibes'], ['#b8f5a6', 'fix the\nflaky test'], ['#ffd08a', 'Yuvai:\n100+ students'], ['#e6d3ff', '9.95 :)']];
    notes.forEach(([c, t], i) => {
      const x = 40 + (i % 3) * 240 + (i * 13) % 30, y = 40 + Math.floor(i / 3) * 220 + (i * 7) % 20;
      g.save(); g.translate(x + 85, y + 85); g.rotate(((i * 37) % 11 - 5) * 0.02); g.translate(-85, -85);
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(6, 8, 170, 170);
      g.fillStyle = c; g.fillRect(0, 0, 170, 170);
      g.fillStyle = '#2a2420'; g.font = `600 30px ${HAND}`;
      t.split('\n').forEach((l, k) => g.fillText(l, 16, 62 + k * 40));
      g.fillStyle = '#d8312f'; g.beginPath(); g.arc(85, 12, 8, 0, Math.PI * 2); g.fill();
      g.restore();
    });
  });
}
function poster(img) {
  return canvasTex(512, 720, (g, w, h) => {
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#111'; g.fillRect(28, 28, w - 56, h - 200);
    if (img) { const s = Math.max((w - 56) / img.width, (h - 200) / img.height), iw = img.width * s, ih = img.height * s; g.save(); g.beginPath(); g.rect(28, 28, w - 56, h - 200); g.clip(); g.drawImage(img, 28 + (w - 56 - iw) * 0.7, 28 + (h - 200 - ih) / 2, iw, ih); g.restore(); }
    g.fillStyle = '#c8151d'; g.font = '800 64px -apple-system, "SF Pro Display", Inter, Arial'; g.fillText('MUMBAI GP', 30, h - 100);
    g.fillStyle = '#555'; g.font = '500 24px -apple-system, "SF Pro Text", Inter, Arial'; g.fillText('a city, drawn in code', 32, h - 58);
  });
}
function rugTex() {
  return canvasTex(256, 384, (g, w, h) => {
    g.fillStyle = '#7a3b2e'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#e8c9a0'; g.lineWidth = 8; g.strokeRect(14, 14, w - 28, h - 28);
    g.strokeStyle = '#2f5d62'; g.lineWidth = 5; g.strokeRect(30, 30, w - 60, h - 60);
    for (let y = 60; y < h - 60; y += 36) { g.fillStyle = (y / 36) % 2 ? '#e8c9a0' : '#2f5d62'; g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w / 2 + 40, y + 18); g.lineTo(w / 2, y + 36); g.lineTo(w / 2 - 40, y + 18); g.closePath(); g.fill(); }
  });
}
function glowTexture() {
  return canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,236,200,1)'); r.addColorStop(0.3, 'rgba(255,200,130,.5)'); r.addColorStop(1, 'rgba(255,170,90,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
}

export function buildRoom(scene, { screenTex, stillUrl }) {
  const G = new THREE.Group(); G.name = 'room'; scene.add(G);
  const R = ROOM, W = R.win, dz = 329;
  /* ---- the building around it ---- */
  const solid = facadeMat(0xe2dace, 77, 22, 30), facade = mat(0xe8e1d6, { roughness: 0.9 }), fx = 9.7;
  G.add(box(14.6, 9.8, 22, solid, 16.8, 4.9, 329), box(14.6, 16, 22, solid, 16.8, 22.2, 329));
  G.add(box(14.6, 4.2, 3.8, solid, 16.8, 12, 319.9), box(14.6, 4.2, 3.8, solid, 16.8, 12, 338.1), box(6.4, 4.2, 14.4, solid, 20.9, 12, 329));
  G.add(box(0.4, W.y0 - 9.8, W.z1 - W.z0, facade, fx, (9.8 + W.y0) / 2, (W.z0 + W.z1) / 2), box(0.4, 14.2 - W.y1, W.z1 - W.z0, facade, fx, (W.y1 + 14.2) / 2, (W.z0 + W.z1) / 2));
  G.add(box(0.4, 4.4, W.z0 - 321.8, facade, fx, 12, (321.8 + W.z0) / 2), box(0.4, 4.4, 336.2 - W.z1, facade, fx, 12, (W.z1 + 336.2) / 2));
  const frame = mat(0x2b2e33, { roughness: 0.4, metalness: 0.3 });
  G.add(box(0.12, 0.1, W.z1 - W.z0, frame, 9.52, W.y0, (W.z0 + W.z1) / 2), box(0.12, 0.1, W.z1 - W.z0, frame, 9.52, W.y1, (W.z0 + W.z1) / 2));

  /* ---- walls: sage above a walnut dado, plank floor, a rug ---- */
  // inner walls as separate planes (the window wall is the facade itself), a hair inside the building's surfaces
  const wallM = mat(0xa7b59c, { roughness: 0.95 }), ceilM = mat(0xe6dccb, { roughness: 0.95 });
  const plane = (w, h, m, x, y, z, ry, rx = 0) => { const q = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); q.position.set(x, y, z); q.rotation.set(rx, ry, 0); q.receiveShadow = true; G.add(q); return q; };
  plane(R.z1 - R.z0, R.y1 - R.y0, wallM, R.x1 - 0.04, (R.y0 + R.y1) / 2, dz, -Math.PI / 2);
  plane(R.x1 - R.x0, R.y1 - R.y0, wallM, (R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2, R.z0 + 0.04, 0);
  plane(R.x1 - R.x0, R.y1 - R.y0, wallM, (R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2, R.z1 - 0.04, Math.PI);
  plane(R.x1 - R.x0, R.z1 - R.z0, ceilM, (R.x0 + R.x1) / 2, R.y1 - 0.04, dz, 0, Math.PI / 2);
  // the inside of the front wall, around the window
  const inner = mat(0xa7b59c, { roughness: 0.95 });
  plane(R.z1 - R.z0, W.y0 - R.y0, inner, R.x0 + 0.02, (R.y0 + W.y0) / 2, dz, Math.PI / 2);
  plane(R.z1 - R.z0, R.y1 - W.y1, inner, R.x0 + 0.02, (W.y1 + R.y1) / 2, dz, Math.PI / 2);
  plane(W.z0 - R.z0, W.y1 - W.y0, inner, R.x0 + 0.02, (W.y0 + W.y1) / 2, (R.z0 + W.z0) / 2, Math.PI / 2);
  plane(R.z1 - W.z1, W.y1 - W.y0, inner, R.x0 + 0.02, (W.y0 + W.y1) / 2, (W.z1 + R.z1) / 2, Math.PI / 2);
  const walnut = mat(0x5e3d28, { roughness: 0.6 }), rail = mat(0x3d281a, { roughness: 0.5 });
  G.add(box(0.05, 1.0, R.z1 - R.z0 - 0.2, walnut, R.x1 - 0.07, R.y0 + 0.5, dz), box(0.08, 0.05, R.z1 - R.z0 - 0.2, rail, R.x1 - 0.08, R.y0 + 1.02, dz));
  for (const sz of [-1, 1]) G.add(box(R.x1 - R.x0 - 0.3, 1.0, 0.05, walnut, (R.x0 + R.x1) / 2, R.y0 + 0.5, dz + sz * (R.z1 - R.z0) / 2 - sz * 0.07), box(R.x1 - R.x0 - 0.3, 0.05, 0.08, rail, (R.x0 + R.x1) / 2, R.y0 + 1.02, dz + sz * (R.z1 - R.z0) / 2 - sz * 0.08));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(R.x1 - R.x0, R.z1 - R.z0), mat(0x8a5a3a, { roughness: 0.55 })); floor.rotation.x = -Math.PI / 2; floor.position.set((R.x0 + R.x1) / 2, R.y0 + 0.01, dz); floor.receiveShadow = true; G.add(floor);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4.6), mat(0xffffff, { map: rugTex(), roughness: 1 })); rug.rotation.x = -Math.PI / 2; rug.rotation.z = Math.PI / 2; rug.position.set(14.0, R.y0 + 0.016, dz); rug.receiveShadow = true; G.add(rug);

  /* ---- the window behind the desk: the Queen's Necklace at night ---- */
  const view = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), glowMat(0xffffff)); view.material.map = necklaceView();
  view.position.set(R.x1 - 0.05, 12.35, dz); view.rotation.y = -Math.PI / 2; G.add(view);
  const wood = mat(0x2a1d14, { roughness: 0.5 });
  G.add(box(0.1, 0.08, 3.56, wood, R.x1 - 0.07, 11.46, dz), box(0.1, 0.08, 3.56, wood, R.x1 - 0.07, 13.24, dz), box(0.1, 1.86, 0.08, wood, R.x1 - 0.07, 12.35, dz - 1.74), box(0.1, 1.86, 0.08, wood, R.x1 - 0.07, 12.35, dz + 1.74), box(0.1, 1.7, 0.05, wood, R.x1 - 0.07, 12.35, dz));
  G.add(box(0.3, 0.05, 3.7, mat(0xe8e0d2), R.x1 - 0.17, 11.43, dz));   // sill

  /* ---- pinboard, poster ---- */
  const pinTex = pinboard();
  const pin = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.44), mat(0xffffff, { map: pinTex, emissiveMap: pinTex, emissive: 0xffffff, emissiveIntensity: 0.32, roughness: 1 })); pin.position.set(R.x1 - 0.075, 12.25, dz - 3.4); pin.rotation.y = -Math.PI / 2; G.add(pin, box(0.04, 1.52, 2.38, wood, R.x1 - 0.03, 12.25, dz - 3.4));
  const posterTex = poster(null);
  const post = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.62), mat(0xffffff, { map: posterTex, emissiveMap: posterTex, emissive: 0xffffff, emissiveIntensity: 0.22, roughness: 0.7 })); post.position.set(R.x1 - 0.04, 12.3, dz + 3.25); post.rotation.y = -Math.PI / 2; G.add(post);
  new THREE.ImageLoader().load(stillUrl, img => { const t = poster(img); post.material.map = t; post.material.emissiveMap = t; post.material.needsUpdate = true; });

  /* ---- fairy lights along the top of the back wall ---- */
  const nF = 38, fairyPts = [], bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.03, 8, 6), glowMat(0xffd59a), nF), M = new THREE.Matrix4();
  for (let i = 0; i < nF; i++) {
    const t = i / (nF - 1), z = R.z0 + 0.6 + t * (R.z1 - R.z0 - 1.2), sag = Math.sin((t * 4 % 1) * Math.PI) * 0.22;
    const p = new THREE.Vector3(R.x1 - 0.12, R.y1 - 0.25 - sag, z); fairyPts.push(p.x, p.y, p.z);
    bulbs.setMatrixAt(i, M.makeTranslation(p.x, p.y, p.z));
  }
  const fairyGlow = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(fairyPts, 3)),
    new THREE.PointsMaterial({ map: glowTexture(), size: 0.42, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffc98a }));
  fairyGlow.userData.moving = true;
  G.add(bulbs, fairyGlow);

  /* ---- desk and what's on it ---- */
  const oak = mat(0xb98a5e, { roughness: 0.55 }), dark = mat(0x26292e, { roughness: 0.5 }), deskX = 16.7, top = R.y0 + 0.76;
  G.add(box(1.1, 0.06, 3.4, oak, deskX, top - 0.03, dz));
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) G.add(box(0.06, 0.73, 0.06, dark, deskX + sx * 0.48, R.y0 + 0.365, dz + sz * 1.62));
  G.add(box(0.5, 0.004, 0.95, mat(0x2e3238, { roughness: 1 }), deskX - 0.1, top + 0.002, dz));   // desk mat
  const alu = ink(new THREE.MeshPhysicalMaterial({ color: 0xd9dbde, roughness: 0.35, metalness: 0.85, clearcoat: 0.3 }));
  const laptop = new THREE.Group(); laptop.position.set(deskX - 0.1, top, dz);
  laptop.add(box(0.3, 0.016, 0.46, alu, 0, 0.008, 0));
  const lid = new THREE.Group(); lid.position.set(0.15, 0.016, 0); lid.rotation.z = -0.3; laptop.add(lid);
  lid.add(box(0.01, 0.3, 0.46, alu, 0.005, 0.15, 0));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.43, 0.27), ink(new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false })));
  scr.position.set(-0.001, 0.152, 0); scr.rotation.y = -Math.PI / 2; scr.userData.keep = true; lid.add(scr);
  laptop.add(box(0.2, 0.002, 0.4, dark, -0.02, 0.017, 0));
  G.add(laptop);
  // desk lamp (warm), mug, headphones, notebook, phone, a little monstera
  const brass = mat(0xb08a4a, { roughness: 0.35, metalness: 0.8 });
  const lamp = new THREE.Group(); lamp.position.set(deskX + 0.22, top, dz - 1.25);
  lamp.add(box(0.2, 0.03, 0.2, brass, 0, 0.015, 0));
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.56, 6), brass); arm.position.set(-0.05, 0.29, 0.05); arm.rotation.x = 0.25; lamp.add(arm);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.17, 16, 1, true), ink(new THREE.MeshStandardMaterial({ color: 0x2c4a3e, emissive: 0xffc58a, emissiveIntensity: 0.45, side: THREE.DoubleSide }))); shade.position.set(-0.13, 0.56, 0.12); shade.rotation.z = 0.6; lamp.add(shade);
  G.add(lamp);
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 14), mat(0xd94848)); mug.position.set(deskX - 0.28, top + 0.05, dz - 0.62);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 12, Math.PI), mat(0xd94848)); handle.position.set(deskX - 0.28, top + 0.055, dz - 0.575); handle.rotation.z = -Math.PI / 2;
  const phone = box(0.14, 0.008, 0.07, mat(0x111316, { roughness: 0.3 }), deskX - 0.32, top + 0.004, dz + 0.55);
  const note = box(0.2, 0.012, 0.15, mat(0xe9dcc0), deskX + 0.05, top + 0.006, dz + 0.72), pen = box(0.012, 0.012, 0.16, mat(0x2a4b8d), deskX + 0.1, top + 0.016, dz + 0.72);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.011, 6, 18, Math.PI), mat(0x1d1f23)); band.position.set(deskX + 0.12, top + 0.03, dz + 1.15); band.rotation.set(-Math.PI / 2, 0, 0.3);
  const cupA = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 14), mat(0x1d1f23)); cupA.position.set(deskX + 0.04, top + 0.02, dz + 1.08);
  const cupB = cupA.clone(); cupB.position.set(deskX + 0.2, top + 0.02, dz + 1.22);
  G.add(mug, handle, phone, note, pen, band, cupA, cupB);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.17, 12), mat(0xe9e3d8)); pot.position.set(deskX + 0.3, top + 0.085, dz + 1.5);
  const leafM = mat(0x3f7a45, { flatShading: true, side: THREE.DoubleSide });
  const leaves = mergeGeometries([0, 1, 2, 3, 4, 5].map(i => new THREE.CircleGeometry(0.11, 9).scale(1, 1.35, 1).translate(0, 0.13, 0).rotateX(-0.6 - (i % 2) * 0.3).rotateY(i * 1.05).translate(0, 0.1 + (i % 3) * 0.05, 0)));
  const plant = new THREE.Mesh(leaves, leafM); plant.position.set(deskX + 0.3, top + 0.15, dz + 1.5);
  G.add(pot, plant);
  // chair, pushed back a little
  const chair = new THREE.Group(); chair.position.set(15.75, R.y0, dz + 0.9); chair.rotation.y = 0.5;
  chair.add(box(0.52, 0.08, 0.5, dark, 0, 0.48, 0), box(0.08, 0.62, 0.48, dark, -0.25, 0.82, 0), box(0.06, 0.45, 0.06, brass, 0, 0.23, 0));
  G.add(chair);

  /* ---- shelf on the side wall: books, a trophy, a framed certificate ---- */
  const sz = R.z1 - 0.17;
  G.add(box(2.6, 0.04, 0.3, oak, 14.6, 12.05, sz));
  [0x3f6fb5, 0xd9a23c, 0x9b4d6a, 0x4c8c74, 0xe6e0d4, 0xc8553d, 0x2d3e5a].forEach((c, i) => G.add(box(0.06, 0.26 + (i % 3) * 0.05, 0.2, mat(c), 13.5 + i * 0.075, 12.2 + (i % 3) * 0.025, sz)));
  const cup = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.05, 0], [0.05, 0.02], [0.015, 0.04], [0.015, 0.09], [0.07, 0.12], [0.08, 0.2], [0.075, 0.2], [0.06, 0.125], [0, 0.12]].map(([x, y]) => new THREE.Vector2(x, y)), 18), mat(0xd9ab3b, { metalness: 0.9, roughness: 0.25 }));
  cup.position.set(14.75, 12.07, sz); G.add(cup);
  const cert = canvasTex(256, 192, (g, w, h) => { g.fillStyle = '#faf6ec'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c9a24a'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20); g.fillStyle = '#2a2420'; g.font = '700 26px Georgia, serif'; g.textAlign = 'center'; g.fillText('1st Rank', w / 2, 86); g.font = '400 16px Georgia, serif'; g.fillText('B.Tech IT', w / 2, 116); g.fillText('CGPA 9.95', w / 2, 140); });
  const certM = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.25), mat(0xffffff, { map: cert })); certM.position.set(15.35, 12.21, sz - 0.02); certM.rotation.y = Math.PI; certM.rotation.x = -0.12;
  G.add(certM, box(0.38, 0.29, 0.02, wood, 15.35, 12.21, sz + 0.005));
  const sp = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 1), mat(0x4f8c4a, { flatShading: true })); sp.position.set(15.75, 12.2, sz); sp.scale.set(1, 1.3, 1); G.add(sp, put(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.1, 10), mat(0xc97b52)), 15.75, 12.12, sz));

  /* ---- floor lamp in the corner ---- */
  const fl = new THREE.Group(); fl.position.set(17.15, R.y0, R.z1 - 0.6);
  fl.add(box(0.28, 0.03, 0.28, brass, 0, 0.015, 0));
  fl.add(put(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.6, 6), brass), 0, 0.8, 0));
  fl.add(put(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.3, 18, 1, true), ink(new THREE.MeshStandardMaterial({ color: 0xf0e2c8, emissive: 0xffc58a, emissiveIntensity: 0.9, side: THREE.DoubleSide }))), 0, 1.65, 0));
  G.add(fl);

  /* ---- light: warm pools, a cool wash from the window, the attack's red ---- */
  const lampLight = new THREE.PointLight(0xffbf80, 0, 6, 1.6); lampLight.position.set(deskX - 0.05, top + 0.55, dz - 1.05);
  const floorLight = new THREE.PointLight(0xffc68f, 0, 7, 1.5); floorLight.position.set(16.9, 11.7, R.z1 - 0.8);
  const fairy = new THREE.PointLight(0xffb27a, 0, 6, 1.5); fairy.position.set(16.8, 13.4, dz);
  const moon = new THREE.PointLight(0x7f9cff, 0, 6, 1.8); moon.position.set(17.2, 12.4, dz);
  const screenGlow = new THREE.PointLight(0x9fc4ff, 0, 2.6, 1.6); screenGlow.position.set(deskX - 0.55, top + 0.25, dz);
  const alarm = new THREE.PointLight(0xff2030, 0, 10, 1.4); alarm.position.set(12.5, 13.2, dz);
  G.add(lampLight, floorLight, fairy, moon, screenGlow, alarm);
  // the attack: packets streaming into the laptop
  const pk = new THREE.InstancedMesh(new THREE.BoxGeometry(0.014, 0.014, 0.014), new THREE.MeshBasicMaterial({ color: 0xff2233, toneMapped: false }), 140);
  pk.visible = false; pk.frustumCulled = false; pk.userData.moving = true;
  G.add(pk);
  return { group: G, laptop, lights: { lampLight, floorLight, fairy, moon, screenGlow, alarm }, fairy: { bulbs, glow: fairyGlow }, packets: pk, screenTarget: new THREE.Vector3(deskX - 0.12, top + 0.17, dz) };
}
