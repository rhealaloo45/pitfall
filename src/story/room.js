/* My room, behind the lit window at the end of the street — my real desk, with the view I'd like one day:
   a curved ultrawide in front of a window onto the Queen's Necklace at night; on the desk the "eat sleep
   code" sign, a black-and-teal model of the race car, a little driver figurine, a white keyboard on a Monza
   desk mat, a succulent; a navy felt pinboard (photos, a cat, a badge, my K. C. College lanyard, the weekly
   timetable); fairy lights, a shelf with books, a trophy and the 1st-rank certificate, a floor lamp.
   Original stand-ins only: no real team, brand or device logos. Coordinates match the facade window in
   world.js (the room spans x 9.9–17.7, z 321.8–336.2). */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { ink, facadeMat } from './world.js';
import { buildCar } from '../vehicle/car-model.js';
import { CAR_SPEC } from '../vehicle/sim.js';

export const ROOM = { x0: 9.9, x1: 17.7, y0: 10, y1: 14, z0: 321.8, z1: 336.2, win: { z0: 325, z1: 333, y0: 10.8, y1: 13.4 } };
const mat = (color, o = {}) => ink(new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o }));
const glowMat = (color) => ink(new THREE.MeshBasicMaterial({ color, toneMapped: false }));
const put = (o, x, y, z) => { o.position.set(x, y, z); return o; };
const box = (w, h, d, m, x, y, z) => put(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m), x, y, z);
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const HAND = '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive';
const SANS = '-apple-system, "SF Pro Display", Inter, Arial, sans-serif';

/* ---------- painted textures ---------- */
function necklaceView() {
  return canvasTex(1280, 640, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h * 0.6); sky.addColorStop(0, '#060b1d'); sky.addColorStop(1, '#2b2448');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + (i % 5) / 8})`; g.fillRect((i * 137) % w, (i * 71) % (h * 0.4), 1.6, 1.6); }
    const base = h * 0.57;
    for (let i = 0; i < 34; i++) {
      const x = w * 0.4 + i * 22 + (i % 3) * 5, bw = 14 + (i % 4) * 5, bh = 34 + ((i * 37) % 110);
      g.fillStyle = '#121a2e'; g.fillRect(x, base - bh, bw, bh);
      for (let y = base - bh + 4; y < base - 3; y += 6) for (let xx = x + 3; xx < x + bw - 3; xx += 5) if (((xx * 7 + y * 3) | 0) % 3 === 0) { g.fillStyle = '#ffd38f'; g.fillRect(xx, y, 2, 2); }
    }
    const sea = g.createLinearGradient(0, base, 0, h); sea.addColorStop(0, '#0d1a33'); sea.addColorStop(1, '#050a14');
    g.fillStyle = sea; g.fillRect(0, base, w, h - base);
    for (let i = 0; i <= 72; i++) {
      const t = i / 72, x = -50 + t * (w * 0.96), y = base + 2 + Math.sin(t * Math.PI) * h * 0.2 * (1 - t * 0.4);
      const r = g.createRadialGradient(x, y, 0, x, y, 13); r.addColorStop(0, 'rgba(255,226,170,1)'); r.addColorStop(0.3, 'rgba(255,190,110,.5)'); r.addColorStop(1, 'rgba(255,170,80,0)');
      g.fillStyle = r; g.fillRect(x - 13, y - 13, 26, 26);
      g.fillStyle = 'rgba(255,190,110,.22)'; g.fillRect(x - 1.5, y + 7, 3, 28 + (i % 4) * 7);
    }
  });
}
/** The navy felt pinboard: photos, a cat, a badge, the K. C. College lanyard, the weekly timetable. */
function pinboard() {
  return canvasTex(1024, 446, (g, w, h) => {
    g.fillStyle = '#1d2b55'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5200; i++) { g.fillStyle = i % 2 ? 'rgba(10,16,40,.35)' : 'rgba(80,100,170,.16)'; g.fillRect((i * 53) % w, (i * 97) % h, 2, 2); }
    const pinAt = (x, y, c) => { g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(x + 2, y + 3, 8, 0, Math.PI * 2); g.fill(); g.fillStyle = c; g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(x - 2, y - 2, 3, 0, Math.PI * 2); g.fill(); };
    const polaroid = (x, y, rot, drawPhoto) => {
      g.save(); g.translate(x, y); g.rotate(rot);
      g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(6, 8, 150, 176);
      g.fillStyle = '#f7f5f0'; g.fillRect(0, 0, 150, 176);
      g.save(); g.beginPath(); g.rect(10, 10, 130, 130); g.clip(); drawPhoto(10, 10, 130); g.restore();
      g.restore();
    };
    // two friends
    polaroid(40, 40, -0.04, (x, y, s) => {
      const gr = g.createLinearGradient(0, y, 0, y + s); gr.addColorStop(0, '#c9d7e4'); gr.addColorStop(1, '#e9e2d6'); g.fillStyle = gr; g.fillRect(x, y, s, s);
      [[x + 42, '#3d6fb8'], [x + 88, '#2a2c33']].forEach(([cx, c]) => { g.fillStyle = c; g.fillRect(cx - 18, y + 70, 36, 60); g.fillStyle = '#d9a98a'; g.beginPath(); g.arc(cx, y + 56, 15, 0, Math.PI * 2); g.fill(); g.fillStyle = '#2a1d16'; g.beginPath(); g.arc(cx, y + 50, 15, Math.PI, 0); g.fill(); });
    });
    pinAt(115, 44, '#3fbf6a');
    // the badge
    g.save(); g.translate(300, 120);
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.arc(4, 6, 64, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f4f4f2'; g.beginPath(); g.arc(0, 0, 64, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2f6db5'; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 58, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#1f3e73'; g.font = `700 20px ${SANS}`; g.textAlign = 'center'; g.fillText('Move more.', 0, -2); g.fillText('Feel better.', 0, 24); g.textAlign = 'left';
    g.restore();
    pinAt(300, 52, '#f2c230');
    // the cat
    polaroid(410, 60, 0.05, (x, y, s) => {
      g.fillStyle = '#e9e1d2'; g.fillRect(x, y, s, s); g.fillStyle = '#8f6a4c'; g.fillRect(x, y + s * 0.62, s, s);
      g.fillStyle = '#141414'; g.beginPath(); g.ellipse(x + 70, y + 98, 30, 30, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(x + 72, y + 58, 19, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(x + 57, y + 48); g.lineTo(x + 60, y + 30); g.lineTo(x + 68, y + 43); g.fill();
      g.beginPath(); g.moveTo(x + 77, y + 43); g.lineTo(x + 86, y + 30); g.lineTo(x + 88, y + 48); g.fill();
      g.fillStyle = '#d8c23a'; g.beginPath(); g.arc(x + 66, y + 57, 2.5, 0, Math.PI * 2); g.arc(x + 79, y + 57, 2.5, 0, Math.PI * 2); g.fill();
    });
    pinAt(485, 64, '#e8e8e8');
    // a sticky note
    g.save(); g.translate(600, 250); g.rotate(-0.06); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(5, 6, 130, 130); g.fillStyle = '#ffe773'; g.fillRect(0, 0, 130, 130);
    g.fillStyle = '#2a2420'; g.font = `600 24px ${HAND}`; g.fillText('chub-guard', 12, 48); g.fillText('→ PyPI ✓', 12, 84); g.restore();
    pinAt(665, 254, '#d8312f');
    // the K. C. College lanyard, hung from a pin
    g.save();
    g.strokeStyle = '#2f6fd8'; g.lineWidth = 20; g.lineCap = 'round';
    g.beginPath(); g.moveTo(640, 30); g.bezierCurveTo(600, 160, 700, 190, 660, 70); g.stroke();
    g.fillStyle = '#ffffff'; g.font = `800 13px ${SANS}`;
    g.translate(612, 120); g.rotate(1.25); g.fillText('K.C. COLLEGE', 0, 0);
    g.restore();
    pinAt(640, 30, '#3fbf6a');
    // the weekly timetable
    g.save(); g.translate(740, 30); g.rotate(0.02);
    g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(6, 8, 250, 300); g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, 250, 300);
    g.strokeStyle = '#c9c4ba'; g.lineWidth = 1; for (let x = 0; x <= 250; x += 83) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 300); g.stroke(); }
    g.beginPath(); g.moveTo(0, 30); g.lineTo(250, 30); g.stroke();
    g.fillStyle = '#333'; g.font = `700 12px ${SANS}`; ['SUNDAY', 'MONDAY', 'TUESDAY'].forEach((d, i) => g.fillText(d, 8 + i * 83, 20));
    g.font = `500 15px ${HAND}`;
    [['#222', '7:30–9:30 · XAI'], ['#c22', 'mock test'], ['#222', '9:30–11 · break'], ['#222', '11 – sleep + NLP'], ['#c22', 'revise!'], ['#222', 'THURSDAY'], ['#222', 'gym 7am']].forEach(([c, t], i) => { g.fillStyle = c; g.fillText(t, 10, 58 + i * 34); });
    g.strokeStyle = '#c22'; g.lineWidth = 2; g.beginPath(); g.moveTo(8, 92); g.lineTo(120, 86); g.stroke();
    g.restore();
    pinAt(860, 34, '#f2c230');
  });
}
function poster(img) {
  return canvasTex(512, 720, (g, w, h) => {
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#111'; g.fillRect(28, 28, w - 56, h - 200);
    if (img) { const s = Math.max((w - 56) / img.width, (h - 200) / img.height), iw = img.width * s, ih = img.height * s; g.save(); g.beginPath(); g.rect(28, 28, w - 56, h - 200); g.clip(); g.drawImage(img, 28 + (w - 56 - iw) * 0.7, 28 + (h - 200 - ih) / 2, iw, ih); g.restore(); }
    g.fillStyle = '#c8151d'; g.font = `800 64px ${SANS}`; g.fillText('MUMBAI GP', 30, h - 100);
    g.fillStyle = '#555'; g.font = `500 24px ${SANS}`; g.fillText('a city, drawn in code', 32, h - 58);
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
/** Dark desk mat with a circuit outline and MONZA in the corner. */
function matTex() {
  return canvasTex(1024, 460, (g, w, h) => {
    g.fillStyle = '#232528'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 6; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(620, 110); g.lineTo(900, 110); g.quadraticCurveTo(950, 112, 940, 160); g.lineTo(900, 330); g.quadraticCurveTo(880, 370, 830, 360); g.lineTo(700, 330); g.lineTo(660, 360); g.lineTo(560, 350);
    g.quadraticCurveTo(520, 345, 530, 300); g.lineTo(560, 200); g.lineTo(590, 190); g.quadraticCurveTo(600, 120, 620, 110); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.28)'; g.font = `800 54px ${SANS}`; g.fillText('MONZA', 60, h - 50);
  });
}
function keysTex() {
  return canvasTex(560, 220, (g, w, h) => {
    g.fillStyle = '#d9dade'; g.fillRect(0, 0, w, h);
    const rows = [14, 14, 13, 12, 11];
    rows.forEach((n, r) => { const kw = (w - 20) / 14.6; let x = 10 + (14 - n) * kw * 0.3; for (let i = 0; i < n; i++) { const ww = (r === 4 && i === 5) ? kw * 4 : kw - 4; g.fillStyle = '#fbfbfc'; g.fillRect(x, 10 + r * 41, ww, 36); x += ww + 4; } });
  });
}
function pouchTex() {
  return canvasTex(256, 340, (g, w, h) => {
    g.fillStyle = '#efe6d2'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 18; i++) { g.fillStyle = ['#3f8f6b', '#d9734a', '#2f5d8a', '#e2b53c'][i % 4]; g.beginPath(); g.ellipse(30 + (i * 53) % 200, 40 + (i * 37) % 180, 16, 7, i, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#e6e2da'; g.fillRect(20, 230, w - 40, 80); g.fillStyle = '#555'; g.font = `600 18px ${SANS}`; g.fillText('SINGLE ORIGIN', 32, 262); g.font = `400 14px ${SANS}`; g.fillText('medium roast', 32, 288);
  });
}
function glowTexture() {
  return canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,236,200,1)'); r.addColorStop(0.3, 'rgba(255,200,130,.5)'); r.addColorStop(1, 'rgba(255,170,90,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
}
/** A curved strip (part of a cylinder around a centre on the viewer's side), facing −x: the ultrawide's face. */
function curvedPanel(cx, cy, cz, radius, arc, height, n = 32) {
  const pos = [], uv = [], idx = [], half = arc / radius / 2;
  for (let i = 0; i <= n; i++) {
    const a = -half + (i / n) * 2 * half, x = cx + Math.cos(a) * radius, z = cz + Math.sin(a) * radius;
    pos.push(x, cy - height / 2, z, x, cy + height / 2, z); uv.push(i / n, 0, i / n, 1);
    if (i < n) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
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

  /* ---- inner walls (warm white, like mine), plank floor, a rug ---- */
  const wallM = mat(0xece6dc, { roughness: 0.95 }), ceilM = mat(0xf1ece3, { roughness: 0.95 });
  const plane = (w, h, m, x, y, z, ry, rx = 0) => { const q = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); q.position.set(x, y, z); q.rotation.set(rx, ry, 0); q.receiveShadow = true; G.add(q); return q; };
  plane(R.z1 - R.z0, R.y1 - R.y0, wallM, R.x1 - 0.04, (R.y0 + R.y1) / 2, dz, -Math.PI / 2);
  plane(R.x1 - R.x0, R.y1 - R.y0, wallM, (R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2, R.z0 + 0.04, 0);
  plane(R.x1 - R.x0, R.y1 - R.y0, wallM, (R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2, R.z1 - 0.04, Math.PI);
  plane(R.x1 - R.x0, R.z1 - R.z0, ceilM, (R.x0 + R.x1) / 2, R.y1 - 0.04, dz, 0, Math.PI / 2);
  plane(R.z1 - R.z0, W.y0 - R.y0, wallM, R.x0 + 0.02, (R.y0 + W.y0) / 2, dz, Math.PI / 2);
  plane(R.z1 - R.z0, R.y1 - W.y1, wallM, R.x0 + 0.02, (W.y1 + R.y1) / 2, dz, Math.PI / 2);
  plane(W.z0 - R.z0, W.y1 - W.y0, wallM, R.x0 + 0.02, (W.y0 + W.y1) / 2, (R.z0 + W.z0) / 2, Math.PI / 2);
  plane(R.z1 - W.z1, W.y1 - W.y0, wallM, R.x0 + 0.02, (W.y0 + W.y1) / 2, (W.z1 + R.z1) / 2, Math.PI / 2);
  const floor = plane(R.x1 - R.x0, R.z1 - R.z0, mat(0x8a5a3a, { roughness: 0.55 }), (R.x0 + R.x1) / 2, R.y0 + 0.01, dz, 0, -Math.PI / 2);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4.6), mat(0xffffff, { map: rugTex(), roughness: 1 })); rug.rotation.set(-Math.PI / 2, 0, Math.PI / 2); rug.position.set(14.0, R.y0 + 0.016, dz); rug.receiveShadow = true; G.add(rug);

  /* ---- the dream: a window behind the desk, onto the Queen's Necklace ---- */
  const wy = 11.98, wwid = 2.7, whgt = 1.38;   // its lower edge sits just behind the monitor
  const view = new THREE.Mesh(new THREE.PlaneGeometry(wwid, whgt), glowMat(0xffffff)); view.material.map = necklaceView();
  view.position.set(R.x1 - 0.05, wy, dz); view.rotation.y = -Math.PI / 2; G.add(view);
  const wood = mat(0x2a1d14, { roughness: 0.5 });
  G.add(box(0.1, 0.08, wwid + 0.16, wood, R.x1 - 0.07, wy - whgt / 2 - 0.04, dz), box(0.1, 0.08, wwid + 0.16, wood, R.x1 - 0.07, wy + whgt / 2 + 0.04, dz));
  G.add(box(0.1, whgt + 0.16, 0.08, wood, R.x1 - 0.07, wy, dz - wwid / 2 - 0.04), box(0.1, whgt + 0.16, 0.08, wood, R.x1 - 0.07, wy, dz + wwid / 2 + 0.04));
  G.add(box(0.28, 0.04, wwid + 0.3, mat(0xe8e0d2), R.x1 - 0.16, wy - whgt / 2 - 0.08, dz));   // sill

  /* ---- pinboard (left of the window), poster (right) ---- */
  const pinTex = pinboard();
  G.add(box(0.03, 1.02, 2.38, wood, R.x1 - 0.03, 12.15, dz - 3.55));
  const pin = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.0), mat(0xffffff, { map: pinTex, emissiveMap: pinTex, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 1 }));
  pin.position.set(R.x1 - 0.055, 12.15, dz - 3.55); pin.rotation.y = -Math.PI / 2; G.add(pin);
  const posterTex = poster(null);
  const post = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.55), mat(0xffffff, { map: posterTex, emissiveMap: posterTex, emissive: 0xffffff, emissiveIntensity: 0.22, roughness: 0.7 }));
  post.position.set(R.x1 - 0.04, 12.25, dz + 3.4); post.rotation.y = -Math.PI / 2; G.add(post);
  new THREE.ImageLoader().load(stillUrl, img => { const t = poster(img); post.material.map = t; post.material.emissiveMap = t; post.material.needsUpdate = true; });

  /* ---- fairy lights along the top of the back wall ---- */
  const nF = 40, fairyPts = [], bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.03, 8, 6), glowMat(0xffd59a), nF), M = new THREE.Matrix4();
  for (let i = 0; i < nF; i++) {
    const t = i / (nF - 1), z = R.z0 + 0.6 + t * (R.z1 - R.z0 - 1.2), sag = Math.sin((t * 4 % 1) * Math.PI) * 0.2;
    fairyPts.push(R.x1 - 0.12, R.y1 - 0.22 - sag, z); bulbs.setMatrixAt(i, M.makeTranslation(R.x1 - 0.12, R.y1 - 0.22 - sag, z));
  }
  const fairyGlow = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(fairyPts, 3)),
    new THREE.PointsMaterial({ map: glowTexture(), size: 0.42, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffc98a }));
  fairyGlow.userData.moving = true;
  G.add(bulbs, fairyGlow);

  /* ---- the desk: white, like mine ---- */
  const white = mat(0xf3f2ee, { roughness: 0.55 }), dark = mat(0x26292e, { roughness: 0.5 }), top = R.y0 + 0.76;
  const dX = 17.27, dDepth = 0.72, dW = 2.8;
  G.add(box(dDepth, 0.04, dW, white, dX, top - 0.02, dz));
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) G.add(box(0.05, 0.74, 0.05, white, dX + sx * (dDepth / 2 - 0.05), R.y0 + 0.37, dz + sz * (dW / 2 - 0.06)));
  // desk mat, keyboard, mouse
  const deskMat = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.43), mat(0xffffff, { map: matTex(), roughness: 1 })); deskMat.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); deskMat.position.set(17.05, top + 0.003, dz + 0.02); G.add(deskMat);
  G.add(box(0.12, 0.01, 0.29, mat(0xe6e7ea, { roughness: 0.4, metalness: 0.2 }), 17.0, top + 0.009, dz - 0.04));
  const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.11), mat(0xffffff, { map: keysTex(), roughness: 0.6 })); keys.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); keys.position.set(17.0, top + 0.0145, dz - 0.04); keys.userData.noEdges = true; G.add(keys);
  const mouse = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), mat(0x1c1e22, { roughness: 0.35 })); mouse.scale.set(1.0, 0.45, 1.7); mouse.position.set(17.02, top + 0.012, dz + 0.32); G.add(mouse);

  /* ---- the curved ultrawide, its stand and a light bar ---- */
  const sR = 1.8, sArc = 0.86, sH = 0.37, sY = top + 0.44, sX = 17.33, cx = sX - sR;
  const screen = new THREE.Mesh(curvedPanel(cx, sY, dz, sR, sArc, sH), ink(new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false, side: THREE.DoubleSide })));
  screen.userData.keep = true; screen.userData.noEdges = true; G.add(screen);
  const shell = new THREE.Mesh(curvedPanel(cx, sY, dz, sR + 0.018, sArc + 0.022, sH + 0.022), mat(0x222428, { roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide })); G.add(shell);
  const back = new THREE.Mesh(curvedPanel(cx, sY, dz, sR + 0.05, sArc * 0.8, sH * 0.8), mat(0x2c2e33, { roughness: 0.5, side: THREE.DoubleSide })); G.add(back);
  G.add(box(0.05, sY - top - 0.05, 0.08, mat(0x3a3c41, { metalness: 0.5, roughness: 0.4 }), sX + 0.09, (top + sY) / 2 - 0.02, dz));
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 24, 1, false, -0.9, 1.8), mat(0x3a3c41, { metalness: 0.5, roughness: 0.4 })); base.position.set(sX + 0.16, top + 0.006, dz); base.rotation.y = Math.PI / 2; G.add(base);
  G.add(box(0.06, 0.028, 0.46, dark, sX + 0.02, sY + sH / 2 + 0.03, dz));
  /* ---- under the screen: eat sleep code, the model car, the figurine, a succulent, coffee, an adapter ---- */
  const teal = mat(0x5fa9a1, { roughness: 0.7 });
  new FontLoader().load('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json', font => {
    const words = ['eat', 'sleep', 'code'], parts = [];
    words.forEach((wd, i) => {
      const tg = new TextGeometry(wd, { font, size: 0.048, height: 0.022, curveSegments: 4, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 2 });
      tg.computeBoundingBox(); const bb = tg.boundingBox; tg.translate(-(bb.max.x + bb.min.x) / 2, (2 - i) * 0.052, 0);
      parts.push(tg);
    });
    const sign = new THREE.Mesh(mergeGeometries(parts), teal); sign.rotation.y = -Math.PI / 2; sign.position.set(sX + 0.02, top + 0.004, dz - 0.12); sign.castShadow = true;
    sign.userData.noEdges = true; G.add(sign); sign.updateMatrixWorld(true);
  });
  // the model car: our race car, in black and teal, about 1:18
  const model = buildCar();
  const repaint = new Map();   // one recoloured copy per original material
  model.root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    const ms = [].concat(o.material).map(m0 => { if (!repaint.has(m0)) { const m = m0.clone(); if (m.color) { const h = m.color.getHex(); if (h === 0xc0121b) m.color.set(0x14171b); else if (h === 0xffffff) m.color.set(0x16b3a6); } repaint.set(m0, ink(m)); } return repaint.get(m0); });
    o.material = Array.isArray(o.material) ? ms : ms[0];
  });
  const fake = { wheels: [0, 1, 2, 3].map(() => ({ len: CAR_SPEC.restLength, steer: 0, spin: 0 })), steerAngle: 0, brakeLight: false, rpm: 0, gear: 1, speed: 0 };
  model.update(new THREE.Vector3(), new THREE.Quaternion(), fake, 0.016, null);
  const ms = 0.056;
  model.root.scale.setScalar(ms); model.root.position.set(sX - 0.02, top + 0.345 * ms, dz + 0.24); model.root.rotation.set(0, Math.PI, 0);
  G.add(model.root);
  // the driver figurine
  const fig = new THREE.Group(); fig.position.set(sX - 0.02, top, dz - 0.36);
  const suit = mat(0x15171b, { roughness: 0.5 }), helm = mat(0xf1c21b, { roughness: 0.3 }), vis = mat(0x0e0f12, { roughness: 0.15, metalness: 0.5 });
  fig.add(box(0.03, 0.004, 0.03, mat(0x2a2c30), 0, 0.002, 0));
  for (const s of [-1, 1]) { fig.add(put(new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.006, 0.045, 6), suit), 0, 0.026, s * 0.007)); fig.add(put(new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.035, 6), suit), 0, 0.066, s * 0.017)); }
  fig.add(put(new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.026, 3, 8), suit), 0, 0.068, 0));
  fig.add(put(new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 10), helm), 0, 0.1, 0));
  const visor = put(new THREE.Mesh(new THREE.SphereGeometry(0.0122, 12, 8, -0.9, 1.8, 1.2, 0.7), vis), 0, 0.1, 0); visor.rotation.y = -Math.PI / 2; fig.add(visor);
  G.add(fig);
  // succulent, coffee pouch, power brick
  const pot = put(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.038, 0.07, 14), mat(0xf6f5f2)), sX + 0.02, top + 0.035, dz + 1.15);
  const spikes = mergeGeometries([...Array(11)].map((_, i) => new THREE.ConeGeometry(0.012, 0.09, 5).translate(0, 0.045, 0).rotateZ(0.35 + (i % 3) * 0.15).rotateY(i * 2.3)));
  const succ = put(new THREE.Mesh(spikes, mat(0x5f9a58, { flatShading: true })), sX + 0.02, top + 0.07, dz + 1.15);
  const pouch = box(0.035, 0.17, 0.12, mat(0xffffff, { map: pouchTex(), roughness: 0.8 }), sX + 0.05, top + 0.085, dz - 1.1);
  const brick = box(0.06, 0.1, 0.13, mat(0x1a1b1e, { roughness: 0.6 }), sX + 0.06, top + 0.05, dz + 0.85);
  G.add(pot, succ, pouch, brick);
  // chair, pushed back a little
  const brass = mat(0xb08a4a, { roughness: 0.35, metalness: 0.8 });
  const chair = new THREE.Group(); chair.position.set(16.1, R.y0, dz + 0.95); chair.rotation.y = 0.5;
  chair.add(box(0.52, 0.08, 0.5, dark, 0, 0.48, 0), box(0.08, 0.62, 0.48, dark, -0.25, 0.82, 0), box(0.06, 0.45, 0.06, brass, 0, 0.23, 0));
  G.add(chair);

  /* ---- shelf on the side wall: books, a trophy, the 1st-rank certificate ---- */
  const oak = mat(0xb98a5e, { roughness: 0.55 }), sz = R.z1 - 0.17;
  G.add(box(2.6, 0.04, 0.3, oak, 14.6, 12.05, sz));
  [0x3f6fb5, 0xd9a23c, 0x9b4d6a, 0x4c8c74, 0xe6e0d4, 0xc8553d, 0x2d3e5a].forEach((c, i) => G.add(box(0.06, 0.26 + (i % 3) * 0.05, 0.2, mat(c), 13.5 + i * 0.075, 12.2 + (i % 3) * 0.025, sz)));
  const cup = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.05, 0], [0.05, 0.02], [0.015, 0.04], [0.015, 0.09], [0.07, 0.12], [0.08, 0.2], [0.075, 0.2], [0.06, 0.125], [0, 0.12]].map(([x, y]) => new THREE.Vector2(x, y)), 18), mat(0xd9ab3b, { metalness: 0.9, roughness: 0.25 }));
  G.add(put(cup, 14.75, 12.07, sz));
  const cert = canvasTex(256, 192, (g, w, h) => { g.fillStyle = '#faf6ec'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c9a24a'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20); g.fillStyle = '#2a2420'; g.font = '700 26px Georgia, serif'; g.textAlign = 'center'; g.fillText('1st Rank', w / 2, 86); g.font = '400 16px Georgia, serif'; g.fillText('B.Tech IT', w / 2, 116); g.fillText('CGPA 9.95', w / 2, 140); });
  const certM = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.25), mat(0xffffff, { map: cert })); certM.position.set(15.35, 12.21, sz - 0.02); certM.rotation.set(-0.12, Math.PI, 0);
  G.add(certM, box(0.38, 0.29, 0.02, wood, 15.35, 12.21, sz + 0.005));
  G.add(put(new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 1), mat(0x4f8c4a, { flatShading: true })), 15.75, 12.2, sz), put(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.1, 10), mat(0xc97b52)), 15.75, 12.12, sz));

  /* ---- floor lamp in the corner ---- */
  const fl = new THREE.Group(); fl.position.set(17.15, R.y0, R.z1 - 0.6);
  fl.add(box(0.28, 0.03, 0.28, brass, 0, 0.015, 0), put(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.6, 6), brass), 0, 0.8, 0));
  fl.add(put(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.3, 18, 1, true), ink(new THREE.MeshStandardMaterial({ color: 0xf0e2c8, emissive: 0xffc58a, emissiveIntensity: 0.9, side: THREE.DoubleSide }))), 0, 1.65, 0));
  G.add(fl);

  /* ---- light: the monitor's light bar, the floor lamp, the window, the attack's red ---- */
  const lampLight = new THREE.SpotLight(0xffc690, 0, 3.2, 1.0, 0.7, 1.5); lampLight.position.set(sX - 0.05, sY + sH / 2 + 0.05, dz); lampLight.target.position.set(16.95, top, dz);
  const floorLight = new THREE.PointLight(0xffc68f, 0, 7, 1.5); floorLight.position.set(16.9, 11.7, R.z1 - 0.8);
  const moon = new THREE.PointLight(0x7f9cff, 0, 6, 1.8); moon.position.set(17.3, 12.5, dz);
  const alarm = new THREE.PointLight(0xff2030, 0, 10, 1.4); alarm.position.set(12.5, 13.2, dz);
  G.add(lampLight, lampLight.target, floorLight, moon, alarm);
  // the attack: packets streaming into the screen
  const pk = new THREE.InstancedMesh(new THREE.BoxGeometry(0.014, 0.014, 0.014), new THREE.MeshBasicMaterial({ color: 0xff2233, toneMapped: false }), 140);
  pk.visible = false; pk.frustumCulled = false; pk.userData.moving = true;
  G.add(pk);
  return { group: G, lights: { lampLight, floorLight, moon, alarm }, fairy: { bulbs, glow: fairyGlow }, packets: pk, screenTarget: new THREE.Vector3(sX - 0.06, sY, dz) };
}
