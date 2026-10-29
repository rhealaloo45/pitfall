/* My room, behind the lit window at the end of the street — my real desk, with the view I'd like one day:
   a curved ultrawide in front of a window onto the Queen's Necklace at night; on the desk the "eat sleep
   code" sign, a black-and-teal model of the race car, a little driver figurine, a white keyboard on a Monza
   desk mat, a succulent, a rubber duck for debugging, a Raspberry Pi with its camera, a 200 OK mug, my Mac
   (closed), a white mouse, an earbuds case, a round speaker, a phone at 9:41, an apple, sticky notes (TODO: sleep,
   BOX BOX!); a navy felt pinboard (photos, a cat, a badge, my K. C. College lanyard, the weekly timetable) under
   a soft/medium/hard tyre print; LIGHTS OUT and 127.0.0.1 prints either side of the window and a cursive
   "hello" neon over it; a racing seat, a circuit rug, two race tyres as a side table; fairy lights, shelves with
   books, a race helmet, a trophy and the 1st-rank certificate. Original stand-ins only: no real team, brand or device logos. Coordinates match the facade window in
   world.js (the room spans x 9.9–13.1, z 327.2–330.8, y 10–12.8). */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { ink, facadeMat } from './world.js?v=47';
import { buildCar } from '../vehicle/car-model.js';
import { CAR_SPEC } from '../vehicle/sim.js';

// a real-sized bedroom, 3.2 m deep and 3.6 m wide, behind one ordinary window in the block
export const ROOM = { x0: 9.9, x1: 13.1, y0: 10, y1: 12.8, z0: 327.2, z1: 330.8, win: { z0: 327.7, z1: 330.3, y0: 10.9, y1: 12.3 } };
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
/** F1 start lights: five columns lit red, LIGHTS OUT. */
function lightsOutTex() {
  return canvasTex(340, 480, (g, w, h) => {
    g.fillStyle = '#0d0e10'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#26282c'; g.fillRect(22, 58, w - 44, 18);
    for (let i = 0; i < 5; i++) {
      const x = 52 + i * ((w - 104) / 4);
      g.fillStyle = '#1a1b1e'; g.fillRect(x - 24, 76, 48, 100);
      for (const y of [104, 150]) {
        const gr = g.createRadialGradient(x, y, 2, x, y, 24); gr.addColorStop(0, '#ff7a6e'); gr.addColorStop(0.45, '#e10600'); gr.addColorStop(1, 'rgba(225,6,0,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, 24, 0, Math.PI * 2); g.fill(); g.fillStyle = '#ff3b2f'; g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2); g.fill();
      }
    }
    g.fillStyle = '#f4f1ea'; g.font = `800 64px ${SANS}`; g.fillText('LIGHTS', 24, 300); g.fillText('OUT.', 24, 366);
    g.fillStyle = '#8b8e94'; g.font = `600 16px ${SANS}`; g.fillText('SUNDAYS ARE FOR RACING', 26, 428);
  });
}
/** Soft, medium, hard: the three dry tyre compounds. */
function tyresTex() {
  return canvasTex(720, 240, (g, w, h) => {
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h);
    [['SOFT', '#e10600'], ['MEDIUM', '#ffd400'], ['HARD', '#f4f4f4']].forEach(([t, c], i) => {
      const x = 130 + i * 230, y = 104;
      g.fillStyle = '#1b1c1f'; g.beginPath(); g.arc(x, y, 80, 0, Math.PI * 2); g.fill();
      g.strokeStyle = c; g.lineWidth = 10; g.beginPath(); g.arc(x, y, 58, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#3a3c41'; g.beginPath(); g.arc(x, y, 40, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#9a9ca2'; g.beginPath(); g.arc(x, y, 12, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1b1c1f'; g.font = `800 22px ${SANS}`; g.textAlign = 'center'; g.fillText(t, x, 222);
    });
  });
}
/** A pink neon sign: a glowing tube with a hot white core (the Mac's first-boot hello, and hello world). */
function neonTex(text) {
  return canvasTex(1024, 256, (g, w, h) => {
    g.font = `400 150px "Snell Roundhand", "Segoe Script", "Brush Script MT", cursive`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.shadowColor = '#ff2d8f'; g.strokeStyle = '#ff6fb3'; g.lineWidth = 11;
    g.shadowBlur = 44; g.strokeText(text, w / 2, h / 2); g.strokeText(text, w / 2, h / 2); g.shadowBlur = 14; g.strokeText(text, w / 2, h / 2);
    g.shadowBlur = 0; g.strokeStyle = '#fff0f7'; g.lineWidth = 4; g.strokeText(text, w / 2, h / 2);
  });
}
function stickyTex(bg, lines) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, 0, w, 14);
    g.fillStyle = '#2a2a2a'; g.font = `700 30px ${HAND}`; lines.forEach((t, i) => g.fillText(t, 12, 56 + i * 36));
  });
}
/** A rug with a race circuit on it: kerbs all the way round and a chequered start line (an invented track). */
function circuitRugTex() {
  return canvasTex(512, 648, (g, w, h) => {
    g.fillStyle = '#2b2d31'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8d8f94'; g.lineWidth = 6; g.strokeRect(22, 22, w - 44, h - 44);
    const track = () => {
      g.beginPath(); g.moveTo(130, 540); g.lineTo(130, 230); g.quadraticCurveTo(130, 120, 240, 116); g.lineTo(330, 116);
      g.quadraticCurveTo(430, 116, 418, 196); g.quadraticCurveTo(410, 240, 330, 236); g.lineTo(300, 300); g.lineTo(368, 350);
      g.lineTo(392, 460); g.quadraticCurveTo(404, 560, 320, 562); g.lineTo(206, 562); g.quadraticCurveTo(130, 562, 130, 540); g.closePath();
    };
    g.lineJoin = 'round'; g.lineCap = 'round';
    track(); g.strokeStyle = '#f2efe8'; g.lineWidth = 52; g.stroke();
    g.setLineDash([14, 14]); track(); g.strokeStyle = '#d12a22'; g.lineWidth = 52; g.stroke(); g.setLineDash([]);
    track(); g.strokeStyle = '#4a4d53'; g.lineWidth = 40; g.stroke();
    for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) { g.fillStyle = (r + c) % 2 ? '#111' : '#f4f4f4'; g.fillRect(110 + c * 6.7, 380 + r * 7, 6.7, 7); }
    g.fillStyle = '#f2efe8'; g.font = `800 30px ${SANS}`; g.fillText('P1', 440, 610);
  });
}
/** There's no place like home. */
function localhostTex() {
  return canvasTex(340, 480, (g, w, h) => {
    g.fillStyle = '#0f1520'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#5ee0d0'; g.lineWidth = 6; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(110, 170); g.lineTo(170, 112); g.lineTo(230, 170); g.moveTo(126, 156); g.lineTo(126, 220); g.lineTo(214, 220); g.lineTo(214, 156); g.stroke();
    g.strokeRect(156, 182, 28, 38);
    g.fillStyle = '#e8edf2'; g.font = `700 22px ${SANS}`; g.textAlign = 'center'; g.fillText("THERE'S NO PLACE LIKE", w / 2, 296);
    g.fillStyle = '#5ee0d0'; g.font = `700 46px Menlo, Consolas, monospace`; g.fillText('127.0.0.1', w / 2, 356);
    g.fillStyle = '#6b7685'; g.font = `500 14px Menlo, Consolas, monospace`; g.fillText('// home', w / 2, 420);
  });
}
function mugTex() {
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#f4efe8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1f2328'; g.font = `800 40px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('200 OK', w / 2, h / 2 - 6);
    g.fillStyle = '#2e8b57'; g.fillRect(w / 2 - 34, h / 2 + 22, 68, 5);
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

/** Warm-white plaster with a little tooth, so walls aren't flat colour. */
function plasterTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#ece5d9'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) { g.fillStyle = i % 2 ? 'rgba(120,100,80,.05)' : 'rgba(255,255,255,.08)'; g.fillRect((i * 53) % w, (i * 97) % h, 2, 2); }
  });
}
/** A curtain panel: a plane with soft folds, gathered at the rod. */
function curtain(width, height, folds = 7) {
  const g = new THREE.PlaneGeometry(width, height, 24, 6), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const z = p.getX(i), y = p.getY(i); p.setZ(i, Math.sin((z / width) * Math.PI * folds) * (0.03 + 0.012 * (y / height + 0.5))); }
  g.computeVertexNormals();
  return g;
}

export function buildRoom(scene, { screenTex, stillUrl }) {
  const G = new THREE.Group(); G.name = 'room'; scene.add(G);
  const R = ROOM, W = R.win, dz = 329, H = R.y1 - R.y0;
  /* ---- the building around a small room: just one more lit window in the block ---- */
  const solid = facadeMat(0xe2dace, 77, 22, 30), facade = mat(0xe8e1d6, { roughness: 0.9 }), fx = 9.7;
  G.add(box(14.5, 9.8, 22, solid, 16.75, 4.9, 329), box(14.5, 17, 22, solid, 16.75, 21.5, 329));
  G.add(box(14.5, 3.2, 9, solid, 16.75, 11.4, 322.5), box(14.5, 3.2, 9, solid, 16.75, 11.4, 335.5), box(10.7, 3.2, 4, solid, 18.65, 11.4, 329));
  G.add(box(0.4, W.y0 - 9.8, 4, facade, fx, (9.8 + W.y0) / 2, dz), box(0.4, 13.0 - W.y1, 4, facade, fx, (W.y1 + 13.0) / 2, dz));
  G.add(box(0.4, W.y1 - W.y0, W.z0 - 327, facade, fx, (W.y0 + W.y1) / 2, (327 + W.z0) / 2), box(0.4, W.y1 - W.y0, 331 - W.z1, facade, fx, (W.y0 + W.y1) / 2, (W.z1 + 331) / 2));
  /* ---- the street window we fly in through: a slim painted frame, its casements swung open, a plant on the sill ---- */
  const ox = 9.5, wz0 = W.z0, wz1 = W.z1, wcy = (W.y0 + W.y1) / 2, wh = W.y1 - W.y0;
  const winPaint = mat(0x2c6e6a, { roughness: 0.55 }), trimM = mat(0xf3eee4, { roughness: 0.7 });
  const glass = mat(0x5a7487, { roughness: 0.12, metalness: 0.45, envMapIntensity: 2 });
  G.add(box(0.12, 0.08, wz1 - wz0, winPaint, ox + 0.06, W.y1 - 0.04, dz), box(0.12, 0.08, wz1 - wz0, winPaint, ox + 0.06, W.y0 + 0.04, dz));
  for (const z of [wz0 + 0.04, wz1 - 0.04]) G.add(box(0.12, wh, 0.08, winPaint, ox + 0.06, wcy, z));
  const sw = (wz1 - wz0) / 2 - 0.04, sh = wh - 0.1;
  for (const s of [1, -1]) {
    const sash = new THREE.Group();
    sash.add(box(0.05, sh, 0.06, winPaint, 0, 0, s * 0.03), box(0.05, sh, 0.06, winPaint, 0, 0, s * (sw - 0.03)));
    sash.add(box(0.05, 0.07, sw, winPaint, 0, sh / 2 - 0.035, s * sw / 2), box(0.05, 0.07, sw, winPaint, 0, -sh / 2 + 0.035, s * sw / 2));
    sash.add(box(0.012, sh - 0.1, sw - 0.1, glass, 0, 0, s * sw / 2));
    sash.position.set(ox - 0.04, wcy, s > 0 ? wz0 + 0.04 : wz1 - 0.04); sash.rotation.y = -s * 2.0;
    G.add(sash);
  }
  G.add(box(0.3, 0.06, wz1 - wz0 + 0.24, trimM, ox - 0.11, W.y0 - 0.03, dz));
  const clay = mat(0xa65a3a, { roughness: 0.85 }), leafA = mat(0x3f7f45, { flatShading: true }), leafB = mat(0x5c9a4e, { flatShading: true });
  const potZ = wz1 - 0.3;
  G.add(put(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.075, 0.16, 12), clay), ox - 0.12, W.y0 + 0.08, potZ));
  for (const [x, y, z, r, m] of [[0, 0.24, 0, 0.1, leafB], [-0.04, 0.3, -0.05, 0.07, leafA], [0.03, 0.29, 0.06, 0.075, leafA]]) {
    G.add(put(new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0).scale(1.1, 1.2, 1.1), m), ox - 0.12 + x, W.y0 + y, potZ + z));
  }

  /* ---- walls, floor, skirting ---- */
  const plaster = plasterTex(); plaster.wrapS = plaster.wrapT = THREE.RepeatWrapping; plaster.repeat.set(3, 3);
  const wallM = mat(0xffffff, { map: plaster, roughness: 0.95 }), ceilM = mat(0xf2ede4, { roughness: 0.95 });
  const plane = (w, h, m, x, y, z, ry, rx = 0) => { const q = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); q.position.set(x, y, z); q.rotation.set(rx, ry, 0); q.receiveShadow = true; G.add(q); return q; };
  plane(R.z1 - R.z0, H, wallM, R.x1 - 0.02, R.y0 + H / 2, dz, -Math.PI / 2);                 // back wall
  plane(R.x1 - R.x0, H, wallM, (R.x0 + R.x1) / 2, R.y0 + H / 2, R.z0 + 0.02, 0);            // left
  plane(R.x1 - R.x0, H, wallM, (R.x0 + R.x1) / 2, R.y0 + H / 2, R.z1 - 0.02, Math.PI);      // right
  plane(R.x1 - R.x0, R.z1 - R.z0, ceilM, (R.x0 + R.x1) / 2, R.y1 - 0.02, dz, 0, Math.PI / 2);
  // the front wall's inside, around the street window
  plane(R.z1 - R.z0, W.y0 - R.y0, wallM, R.x0 + 0.02, (R.y0 + W.y0) / 2, dz, Math.PI / 2);
  plane(R.z1 - R.z0, R.y1 - W.y1, wallM, R.x0 + 0.02, (W.y1 + R.y1) / 2, dz, Math.PI / 2);
  plane(W.z0 - R.z0, W.y1 - W.y0, wallM, R.x0 + 0.02, (W.y0 + W.y1) / 2, (R.z0 + W.z0) / 2, Math.PI / 2);
  plane(R.z1 - W.z1, W.y1 - W.y0, wallM, R.x0 + 0.02, (W.y0 + W.y1) / 2, (W.z1 + R.z1) / 2, Math.PI / 2);
  plane(R.x1 - R.x0, R.z1 - R.z0, mat(0x7d5233, { roughness: 0.55 }), (R.x0 + R.x1) / 2, R.y0 + 0.005, dz, 0, -Math.PI / 2);
  const skirt = mat(0xf4f1ea, { roughness: 0.6 });
  G.add(box(0.02, 0.08, R.z1 - R.z0, skirt, R.x1 - 0.03, R.y0 + 0.04, dz), box(R.x1 - R.x0, 0.08, 0.02, skirt, (R.x0 + R.x1) / 2, R.y0 + 0.04, R.z0 + 0.03), box(R.x1 - R.x0, 0.08, 0.02, skirt, (R.x0 + R.x1) / 2, R.y0 + 0.04, R.z1 - 0.03));
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.9), mat(0xffffff, { map: circuitRugTex(), roughness: 1 })); rug.rotation.set(-Math.PI / 2, 0, Math.PI / 2); rug.position.set(11.75, R.y0 + 0.012, dz); rug.receiveShadow = true; G.add(rug);

  /* ---- the dream: the window behind the desk, onto the Queen's Necklace, with curtains and fairy lights ---- */
  const wy = 11.58, wwid = 1.75, whgt = 1.18, bx = R.x1 - 0.03;
  const view = new THREE.Mesh(new THREE.PlaneGeometry(wwid, whgt), glowMat(0xffffff)); view.material.map = necklaceView();
  view.position.set(bx - 0.02, wy, dz); view.rotation.y = -Math.PI / 2; G.add(view);
  const wood = mat(0x2a1d14, { roughness: 0.5 }), sill = mat(0xeee7da, { roughness: 0.6 });
  G.add(box(0.06, 0.05, wwid + 0.1, wood, bx - 0.03, wy - whgt / 2 - 0.025, dz), box(0.06, 0.05, wwid + 0.1, wood, bx - 0.03, wy + whgt / 2 + 0.025, dz));
  G.add(box(0.06, whgt + 0.1, 0.05, wood, bx - 0.03, wy, dz - wwid / 2 - 0.025), box(0.06, whgt + 0.1, 0.05, wood, bx - 0.03, wy, dz + wwid / 2 + 0.025), box(0.06, whgt, 0.03, wood, bx - 0.03, wy, dz));
  const rodY = wy + whgt / 2 + 0.16;
  G.add(put(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.5, 8).rotateX(Math.PI / 2), mat(0x2a2c30, { metalness: 0.6, roughness: 0.4 })), bx - 0.12, rodY, dz));
  const linen = mat(0xd8c6ad, { roughness: 1, side: THREE.DoubleSide });
  for (const s of [-1, 1]) { const c = new THREE.Mesh(curtain(0.5, rodY - R.y0 - 0.12), linen); c.rotation.y = -Math.PI / 2; c.position.set(bx - 0.12, (rodY + R.y0 + 0.12) / 2, dz + s * (wwid / 2 + 0.2)); c.castShadow = true; G.add(c); }
  // fairy lights: swagged along the rod and dropping down beside the curtains
  const fairyPts = [];
  for (let i = 0; i <= 44; i++) { const t = i / 44, z = dz - 1.2 + t * 2.4; fairyPts.push(bx - 0.16, rodY - 0.04 - Math.abs(Math.sin(t * Math.PI * 4)) * 0.1, z); }
  for (const s of [-1, 1]) for (let i = 1; i <= 9; i++) fairyPts.push(bx - 0.17, rodY - i * 0.13, dz + s * (wwid / 2 + 0.47) + Math.sin(i * 1.7) * 0.02);
  const nF = fairyPts.length / 3, bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 8, 6), glowMat(0xffd59a), nF), M = new THREE.Matrix4();
  for (let i = 0; i < nF; i++) bulbs.setMatrixAt(i, M.makeTranslation(fairyPts[i * 3], fairyPts[i * 3 + 1], fairyPts[i * 3 + 2]));
  const fairyGlow = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(fairyPts, 3)),
    new THREE.PointsMaterial({ map: glowTexture(), size: 0.16, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffc98a }));
  fairyGlow.userData.moving = true;
  G.add(bulbs, fairyGlow);

  /* ---- left wall: the navy pinboard over the desk, the poster nearer the door ---- */
  const pinTex = pinboard();
  G.add(box(1.3, 0.6, 0.025, wood, 12.42, 11.82, R.z0 + 0.03));
  const pin = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.54), mat(0xffffff, { map: pinTex, emissiveMap: pinTex, emissive: 0xffffff, emissiveIntensity: 0.18, roughness: 1 }));
  pin.position.set(12.42, 11.82, R.z0 + 0.046); G.add(pin);
  const posterTex = poster(null);
  const post = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.87), mat(0xffffff, { map: posterTex, emissiveMap: posterTex, emissive: 0xffffff, emissiveIntensity: 0.12, roughness: 0.7 }));
  post.position.set(10.85, 11.55, R.z0 + 0.03); G.add(post);
  new THREE.ImageLoader().load(stillUrl, img => { const t = poster(img); post.material.map = t; post.material.emissiveMap = t; post.material.needsUpdate = true; });
  const printMat = tex => mat(0xffffff, { map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.12, roughness: 0.7 });
  const black = mat(0x141517, { roughness: 0.5 });
  G.add(box(0.88, 0.32, 0.015, black, 12.42, 12.4, R.z0 + 0.03), put(new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.28), printMat(tyresTex())), 12.42, 12.4, R.z0 + 0.04));
  const lights = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.48), printMat(lightsOutTex())); lights.rotation.y = -Math.PI / 2; lights.position.set(R.x1 - 0.042, 11.74, R.z0 + 0.25);
  G.add(box(0.015, 0.51, 0.37, black, R.x1 - 0.028, 11.74, R.z0 + 0.25), lights);
  const home = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.48), printMat(localhostTex())); home.rotation.y = -Math.PI / 2; home.position.set(R.x1 - 0.042, 11.9, R.z1 - 0.25);
  G.add(box(0.015, 0.51, 0.37, black, R.x1 - 0.028, 11.9, R.z1 - 0.25), home);
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.25), ink(new THREE.MeshBasicMaterial({ map: neonTex('hello'), transparent: true, depthWrite: false, toneMapped: false })));
  neon.rotation.y = -Math.PI / 2; neon.position.set(R.x1 - 0.04, 12.57, dz); neon.userData.noEdges = true; G.add(neon);

  /* ---- right wall: two floating shelves, books, a trailing plant, the trophy, the certificate, a speaker ---- */
  const oak = mat(0xb98a5e, { roughness: 0.55 }), sz = R.z1 - 0.13;
  for (const y of [11.45, 11.95]) G.add(box(0.85, 0.03, 0.22, oak, 12.62, y, sz));
  const bookC = [0x3f6fb5, 0xd9a23c, 0x9b4d6a, 0x4c8c74, 0xe6e0d4, 0xc8553d, 0x2d3e5a, 0x7a5a9e, 0xe2b35a];
  let bx2 = 12.25; bookC.forEach((c, i) => { const h = 0.17 + (i % 3) * 0.03, t = 0.03 + (i % 2) * 0.012; G.add(box(t, h, 0.15, mat(c), bx2, 11.465 + h / 2, sz)); bx2 += t + 0.004; });
  G.add(box(0.15, 0.04, 0.12, mat(0x3f6fb5), 12.7, 11.485, sz), box(0.14, 0.035, 0.11, mat(0xe6e0d4), 12.7, 11.52, sz));   // a lying stack
  const cup = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.03, 0], [0.03, 0.012], [0.009, 0.024], [0.009, 0.055], [0.042, 0.072], [0.048, 0.12], [0.045, 0.12], [0.036, 0.075], [0, 0.072]].map(([x, y]) => new THREE.Vector2(x, y)), 18), mat(0xd9ab3b, { metalness: 0.9, roughness: 0.25 }));
  G.add(put(cup, 12.95, 11.465, sz));
  const cert = canvasTex(256, 192, (g, w, h) => { g.fillStyle = '#faf6ec'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c9a24a'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20); g.fillStyle = '#2a2420'; g.font = '700 26px Georgia, serif'; g.textAlign = 'center'; g.fillText('1st Rank', w / 2, 86); g.font = '400 16px Georgia, serif'; g.fillText('B.Tech IT', w / 2, 116); g.fillText('CGPA 9.95', w / 2, 140); });
  const certG = new THREE.Group(); certG.position.set(12.42, 11.965, sz + 0.03); certG.rotation.set(-0.16, Math.PI, 0);
  certG.add(box(0.22, 0.17, 0.012, wood, 0, 0.085, 0.004), put(new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.14), mat(0xffffff, { map: cert })), 0, 0.085, -0.003));
  certG.children[1].rotation.y = Math.PI; G.add(certG);
  const helmet = new THREE.Group(); helmet.position.set(12.86, 11.965, sz); helmet.rotation.y = -1.05;   // visor towards the room
  helmet.add(put(new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14).scale(1.1, 0.95, 1), mat(0xc8151d, { roughness: 0.3 })), 0, 0.07, 0));
  helmet.add(put(new THREE.Mesh(new THREE.SphereGeometry(0.0768, 20, 10, -0.85, 1.7, 1.0, 0.62).scale(1.1, 0.95, 1), mat(0x101317, { roughness: 0.08, metalness: 0.6 })), 0, 0.07, 0));
  helmet.add(box(0.05, 0.012, 0.09, mat(0xf4f1ea, { roughness: 0.4 }), 0.05, 0.142, 0));
  G.add(helmet);
  const pot2 = put(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.08, 12), mat(0xc97b52)), 12.66, 12.005, sz);
  const vines = mergeGeometries([...Array(16)].map((_, i) => new THREE.SphereGeometry(0.028, 6, 4).scale(1, 0.55, 1.4).translate(Math.sin(i * 1.3) * 0.05, -0.02 - (i % 8) * 0.045, (i < 8 ? -1 : 1) * 0.04 + Math.cos(i) * 0.02)));
  G.add(pot2, put(new THREE.Mesh(vines, mat(0x4f8f4a, { flatShading: true })), 12.66, 12.03, sz - 0.12));

  /* ---- the desk: white, like mine, with everything on it ---- */
  const white = mat(0xf3f2ee, { roughness: 0.55 }), dark = mat(0x26292e, { roughness: 0.5 }), top = R.y0 + 0.76;
  const dX = R.x1 - 0.37, dDepth = 0.7, dW = 1.6;
  G.add(box(dDepth, 0.035, dW, white, dX, top - 0.0175, dz));
  for (const s of [-1, 1]) { G.add(box(dDepth - 0.06, 0.04, 0.04, white, dX, R.y0 + 0.02, dz + s * (dW / 2 - 0.05)), box(0.04, 0.72, 0.04, white, dX, R.y0 + 0.37, dz + s * (dW / 2 - 0.05))); }
  const deskMat = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.36), mat(0xffffff, { map: matTex(), roughness: 1 })); deskMat.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); deskMat.position.set(dX - 0.14, top + 0.002, dz + 0.02); G.add(deskMat);
  G.add(box(0.11, 0.009, 0.27, mat(0xe6e7ea, { roughness: 0.4, metalness: 0.2 }), dX - 0.19, top + 0.008, dz - 0.04));
  const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.1), mat(0xffffff, { map: keysTex(), roughness: 0.6 })); keys.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); keys.position.set(dX - 0.19, top + 0.0128, dz - 0.04); keys.userData.noEdges = true; G.add(keys);
  const mouse = put(new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), mat(0xf3f3f1, { roughness: 0.22 })), dX - 0.18, top + 0.01, dz + 0.27); mouse.scale.set(1, 0.38, 1.75); G.add(mouse);
  /* the curved ultrawide */
  const sR = 1.8, sArc = 0.86, sH = 0.37, sY = top + 0.44, sX = R.x1 - 0.12, cx = sX - sR;
  const screen = new THREE.Mesh(curvedPanel(cx, sY, dz, sR, sArc, sH), ink(new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false, side: THREE.DoubleSide })));
  screen.userData.keep = true; screen.userData.noEdges = true; G.add(screen);
  G.add(new THREE.Mesh(curvedPanel(cx, sY, dz, sR + 0.018, sArc + 0.022, sH + 0.022), mat(0x222428, { roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide })));
  G.add(new THREE.Mesh(curvedPanel(cx, sY, dz, sR + 0.045, sArc * 0.8, sH * 0.8), mat(0x2c2e33, { roughness: 0.5, side: THREE.DoubleSide })));
  const steel = mat(0x3a3c41, { metalness: 0.5, roughness: 0.4 });
  G.add(box(0.05, sY - top - 0.05, 0.08, steel, sX + 0.06, (top + sY) / 2 - 0.02, dz));
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.012, 24, 1, false, -0.9, 1.8), steel); base.position.set(sX + 0.1, top + 0.006, dz); base.rotation.y = Math.PI / 2; G.add(base);
  G.add(box(0.06, 0.026, 0.42, dark, sX + 0.0, sY + sH / 2 + 0.028, dz));                                                   // light bar
  [[0.29, '#ffe773', ['TODO:', 'sleep'], -0.06], [0.375, '#ff9fc0', ['BOX', 'BOX!'], 0.07]].forEach(([o, c, t, tilt]) => {   // sticky notes on the screen's corner
    const n = box(0.003, 0.074, 0.074, mat(0xffffff, { map: stickyTex(c, t), roughness: 0.9 }), cx + Math.sqrt(sR * sR - o * o) - 0.004, sY - sH / 2 + 0.04, dz + o);
    n.rotation.set(tilt, -Math.asin(o / sR), 0); n.userData.noEdges = true; G.add(n);
  });
  // a cable from the monitor down to a socket
  const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(sX + 0.08, sY - 0.1, dz + 0.02), new THREE.Vector3(sX + 0.1, top - 0.02, dz + 0.1), new THREE.Vector3(R.x1 - 0.04, R.y0 + 0.4, dz + 0.32), new THREE.Vector3(R.x1 - 0.03, R.y0 + 0.28, dz + 0.42)]), 20, 0.006, 5), mat(0x18191c));
  G.add(cable, box(0.012, 0.08, 0.08, white, R.x1 - 0.025, R.y0 + 0.28, dz + 0.45));
  /* under the screen: eat sleep code, the model car, the figurine; around it a mug, notebooks, pens, a phone, a bottle */
  const teal = mat(0x5fa9a1, { roughness: 0.7 });
  new FontLoader().load('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json', font => {
    const parts = ['eat', 'sleep', 'code'].map((wd, i) => {
      const tg = new TextGeometry(wd, { font, size: 0.042, height: 0.02, curveSegments: 4, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.0025, bevelSegments: 2 });
      tg.computeBoundingBox(); const bb = tg.boundingBox; tg.translate(-(bb.max.x + bb.min.x) / 2, (2 - i) * 0.046, 0); return tg;
    });
    const sign = new THREE.Mesh(mergeGeometries(parts), teal); sign.rotation.y = -Math.PI / 2; sign.position.set(sX - 0.01, top + 0.004, dz - 0.12); sign.castShadow = true; sign.userData.noEdges = true;
    G.add(sign); sign.updateMatrixWorld(true);
  });
  const model = buildCar(), repaint = new Map();
  model.root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    const ms = [].concat(o.material).map(m0 => { if (!repaint.has(m0)) { const m = m0.clone(); if (m.color) { const h = m.color.getHex(); if (h === 0xc0121b) m.color.set(0x14171b); else if (h === 0xffffff) m.color.set(0x16b3a6); } repaint.set(m0, ink(m)); } return repaint.get(m0); });
    o.material = Array.isArray(o.material) ? ms : ms[0];
  });
  const fake = { wheels: [0, 1, 2, 3].map(() => ({ len: CAR_SPEC.restLength, steer: 0, spin: 0 })), steerAngle: 0, brakeLight: false, rpm: 0, gear: 1, speed: 0 };
  model.update(new THREE.Vector3(), new THREE.Quaternion(), fake, 0.016, null);
  const ms = 0.05; model.root.scale.setScalar(ms); model.root.position.set(sX - 0.04, top + 0.345 * ms, dz + 0.2); model.root.rotation.set(0, Math.PI, 0);
  G.add(model.root);
  const fig = new THREE.Group(); fig.position.set(sX - 0.04, top, dz - 0.33);
  const suit = mat(0x15171b, { roughness: 0.5 }), helm = mat(0xf1c21b, { roughness: 0.3 }), vis = mat(0x0e0f12, { roughness: 0.15, metalness: 0.5 });
  fig.add(box(0.03, 0.004, 0.03, mat(0x2a2c30), 0, 0.002, 0));
  for (const s of [-1, 1]) { fig.add(put(new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.006, 0.045, 6), suit), 0, 0.026, s * 0.007)); fig.add(put(new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.035, 6), suit), 0, 0.066, s * 0.017)); }
  fig.add(put(new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.026, 3, 8), suit), 0, 0.068, 0), put(new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 10), helm), 0, 0.1, 0));
  const visor = put(new THREE.Mesh(new THREE.SphereGeometry(0.0122, 12, 8, -0.9, 1.8, 1.2, 0.7), vis), 0, 0.1, 0); visor.rotation.y = -Math.PI / 2; fig.add(visor);
  G.add(fig);
  const duck = new THREE.Group(), duckM = mat(0xffd23f, { roughness: 0.45 }), eyeM = mat(0x111111, { roughness: 0.3 });
  duck.position.set(sX - 0.13, top, dz - 0.24); duck.rotation.y = Math.PI * 0.85;   // rubber duck debugging, facing whoever sits here
  duck.add(put(new THREE.Mesh(new THREE.SphereGeometry(0.032, 14, 10).scale(1.25, 0.8, 1), duckM), 0, 0.026, 0), put(new THREE.Mesh(new THREE.SphereGeometry(0.021, 12, 10), duckM), 0.022, 0.062, 0));
  duck.add(put(new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.022, 8).rotateZ(-Math.PI / 2), mat(0xf08a24, { roughness: 0.5 })), 0.046, 0.058, 0), put(new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.025, 6).rotateZ(0.9), duckM), -0.04, 0.038, 0));
  for (const s of [-1, 1]) duck.add(put(new THREE.Mesh(new THREE.SphereGeometry(0.0035, 6, 4), eyeM), 0.036, 0.07, s * 0.01));
  G.add(duck);
  const pot = put(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.065, 14), mat(0xf6f5f2)), sX - 0.02, top + 0.033, dz + 0.62);
  const spikes = mergeGeometries([...Array(11)].map((_, i) => new THREE.ConeGeometry(0.011, 0.08, 5).translate(0, 0.04, 0).rotateZ(0.35 + (i % 3) * 0.15).rotateY(i * 2.3)));
  G.add(pot, put(new THREE.Mesh(spikes, mat(0x5f9a58, { flatShading: true })), sX - 0.02, top + 0.065, dz + 0.62));
  G.add(box(0.035, 0.16, 0.11, mat(0xffffff, { map: pouchTex(), roughness: 0.8 }), sX - 0.0, top + 0.08, dz - 0.66));
  const speaker = put(new THREE.Mesh(new THREE.SphereGeometry(0.05, 20, 14), mat(0x8e9196, { roughness: 0.9 })), sX - 0.03, top + 0.04, dz + 0.45); speaker.scale.set(1, 0.82, 1);
  const speakerTop = put(new THREE.Mesh(new THREE.CircleGeometry(0.03, 20), mat(0x1c1d20, { roughness: 0.2, metalness: 0.3 })), sX - 0.03, top + 0.081, dz + 0.45); speakerTop.rotation.x = -Math.PI / 2;
  G.add(speaker, speakerTop);
  const mugM = mat(0xf4efe8, { roughness: 0.4 });
  const mugX = dX - 0.03, mugZ = dz + 0.35;
  const mug = put(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.095, 24), mat(0xffffff, { map: mugTex(), roughness: 0.4 })), mugX, top + 0.048, mugZ); mug.rotation.y = 0.93;   // 200 OK, turned to the chair
  const handle = put(new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.007, 6, 12, Math.PI), mugM), mugX, top + 0.05, mugZ + 0.04); handle.rotation.z = -Math.PI / 2;
  const coffee = put(new THREE.Mesh(new THREE.CircleGeometry(0.034, 14), mat(0x3b2416, { roughness: 0.2 })), mugX, top + 0.088, mugZ); coffee.rotation.x = -Math.PI / 2;
  // a Raspberry Pi with its camera module, like the one in the pothole detector
  const pcb = mat(0x1f7a3a, { roughness: 0.6 }), chipM = mat(0x16171a, { roughness: 0.4 }), portM = mat(0xb8bcc2, { metalness: 0.7, roughness: 0.35 });
  const pi = new THREE.Group(); pi.position.set(dX - 0.01, top, dz + 0.12); pi.rotation.y = 0.35;
  pi.add(box(0.056, 0.004, 0.085, pcb, 0, 0.004, 0), box(0.014, 0.003, 0.014, chipM, 0.004, 0.0075, -0.004), box(0.05, 0.016, 0.018, portM, 0.0, 0.014, 0.035), box(0.016, 0.014, 0.012, portM, -0.017, 0.013, 0.018));
  pi.add(box(0.005, 0.006, 0.05, chipM, 0.024, 0.009, -0.012));   // the GPIO header
  const cam = new THREE.Group(); cam.position.set(-0.05, 0, -0.02); cam.rotation.z = 0.35;
  cam.add(box(0.004, 0.025, 0.025, pcb, 0, 0.0135, 0), put(new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.006, 10).rotateZ(Math.PI / 2), chipM), -0.004, 0.0135, 0));
  pi.add(cam, box(0.03, 0.001, 0.012, mat(0xe8d9a8), -0.032, 0.002, -0.014));   // and its ribbon
  G.add(pi);
  G.add(mug, handle, coffee);
  const alu = mat(0xc9ccd1, { metalness: 0.75, roughness: 0.3 });
  const mac = box(0.215, 0.014, 0.305, alu, dX - 0.1, top + 0.019, dz - 0.5); mac.rotation.y = 0.12;   // my Mac, closed
  G.add(box(0.2, 0.012, 0.15, mat(0xc8553d), dX - 0.13, top + 0.006, dz - 0.6), mac, box(0.012, 0.003, 0.2, mat(0x2a2c30), dX - 0.205, top + 0.019, dz - 0.49));
  // an earbuds case, an apple
  const buds = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.02, 4, 12), mat(0xf6f6f4, { roughness: 0.25 })); buds.rotation.set(0, 0.4, Math.PI / 2); buds.scale.set(1, 1, 0.55);
  G.add(put(buds, dX - 0.27, top + 0.011, dz + 0.16));
  const fruit = new THREE.Group(); fruit.position.set(dX - 0.11, top, dz - 0.32);
  fruit.add(put(new THREE.Mesh(new THREE.SphereGeometry(0.037, 18, 14).scale(1, 0.9, 1), mat(0xb8202a, { roughness: 0.35 })), 0, 0.034, 0));
  fruit.add(put(new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.003, 0.02, 5), mat(0x5a3b22)), 0.002, 0.072, 0));
  const fleaf = put(new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6).scale(1.6, 0.3, 0.8), mat(0x4f8f3a, { roughness: 0.6 })), 0.012, 0.075, 0.004); fleaf.rotation.z = 0.5; fruit.add(fleaf);
  G.add(fruit);
  const holder = put(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.09, 12, 1, true), mat(0x3a3d42, { side: THREE.DoubleSide })), dX + 0.2, top + 0.045, dz - 0.62);
  G.add(holder); [[0.008, 0x2a4b8d], [-0.01, 0xd94848], [0.0, 0x222222], [0.012, 0xe2b53c]].forEach(([o, c], i) => { const p = box(0.008, 0.14, 0.008, mat(c), dX + 0.2 + o, top + 0.1, dz - 0.62 + (i - 1.5) * 0.01); p.rotation.x = (i - 1.5) * 0.12; G.add(p); });
  const phone = box(0.008, 0.15, 0.075, mat(0x111316, { roughness: 0.25 }), dX + 0.05, top + 0.08, dz + 0.68); phone.rotation.z = -0.25; G.add(phone, box(0.06, 0.012, 0.08, dark, dX + 0.08, top + 0.006, dz + 0.68));
  const phoneTex = canvasTex(128, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#3b4a8a'); gr.addColorStop(1, '#c86b8e'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#000'; g.beginPath(); g.roundRect(w / 2 - 22, 10, 44, 13, 6.5); g.fill();
    g.fillStyle = 'rgba(255,255,255,.9)'; g.textAlign = 'center'; g.font = `600 11px ${SANS}`; g.fillText('Thursday 29 October', w / 2, 52); g.font = `700 50px ${SANS}`; g.fillText('9:41', w / 2, 100);
  });
  const phoneScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.068, 0.142), glowMat(0xffffff)); phoneScreen.material.map = phoneTex;
  phoneScreen.position.set(dX + 0.05 - 0.0045, top + 0.08, dz + 0.68); phoneScreen.rotation.set(0, -Math.PI / 2, 0); phoneScreen.rotateX(-0.25); phoneScreen.userData.noEdges = true; G.add(phoneScreen);
  G.add(put(new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.21, 14), mat(0x3f8f86, { roughness: 0.6 })), dX - 0.24, top + 0.105, dz + 0.68));
  // headphones on a hook at the desk's edge
  const hook = box(0.04, 0.02, 0.02, dark, dX - dDepth / 2 + 0.02, top - 0.05, dz + dW / 2 - 0.08);
  const band = put(new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.01, 6, 18, Math.PI), mat(0x1d1f23)), dX - dDepth / 2 - 0.0, top - 0.13, dz + dW / 2 - 0.08); band.rotation.set(0, Math.PI / 2, Math.PI);
  G.add(hook, band, put(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.035, 14).rotateX(Math.PI / 2), mat(0x1d1f23)), dX - dDepth / 2, top - 0.2, dz + dW / 2 - 0.155), put(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.035, 14).rotateX(Math.PI / 2), mat(0x1d1f23)), dX - dDepth / 2, top - 0.2, dz + dW / 2 - 0.005));
  /* ---- on the floor: the chair, a backpack against the desk, a bin, a big plant in the corner ---- */
  const fabric = mat(0x1c1d21, { roughness: 0.8 }), plastic = mat(0x2a2c30, { roughness: 0.5 }), racing = mat(0xc8151d, { roughness: 0.6 });
  const chair = new THREE.Group(); chair.position.set(dX - 0.78, R.y0, dz + 0.78); chair.rotation.y = -1.05;
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, leg = box(0.3, 0.025, 0.04, plastic, Math.cos(a) * 0.15, 0.07, Math.sin(a) * 0.15); leg.rotation.y = -a; chair.add(leg, put(new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), plastic), Math.cos(a) * 0.29, 0.025, Math.sin(a) * 0.29)); }
  chair.add(put(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.36, 10), mat(0x8a8d93, { metalness: 0.7, roughness: 0.3 })), 0, 0.26, 0));
  // a racing-style seat: black with red bolsters, a tall reclined back with wings and a headrest
  chair.add(box(0.48, 0.08, 0.46, fabric, 0, 0.47, 0));
  for (const s of [-1, 1]) chair.add(box(0.46, 0.07, 0.06, racing, 0, 0.53, s * 0.23));
  const seatBack = new THREE.Group(); seatBack.position.set(0.23, 0.5, 0); seatBack.rotation.z = -0.13;
  seatBack.add(box(0.08, 0.8, 0.44, fabric, 0, 0.42, 0));
  for (const s of [-1, 1]) seatBack.add(box(0.12, 0.56, 0.07, racing, -0.03, 0.34, s * 0.235), box(0.1, 0.2, 0.1, fabric, -0.02, 0.74, s * 0.22));
  seatBack.add(box(0.05, 0.13, 0.24, racing, -0.06, 0.72, 0), box(0.02, 0.36, 0.12, racing, -0.045, 0.32, 0));
  chair.add(seatBack);
  for (const s of [-1, 1]) chair.add(box(0.28, 0.03, 0.05, plastic, -0.02, 0.66, s * 0.24), box(0.03, 0.17, 0.03, plastic, 0.05, 0.57, s * 0.24));
  G.add(chair);
  // two race tyres stacked as a side table, a soft and a medium, with a glass top
  const rubber = mat(0x18191b, { roughness: 0.85 }), rim = mat(0x3a3c41, { metalness: 0.6, roughness: 0.35 });
  const tx = dX - 0.28, tz = R.z0 + 0.45;
  [[0.135, '#e10600'], [0.405, '#ffd400']].forEach(([y, c]) => {
    // rounded rubber with the compound's stripe painted round the upper sidewall
    const side = canvasTex(4, 256, (g, w, h) => { g.fillStyle = '#18191b'; g.fillRect(0, 0, w, h); g.fillStyle = c; g.fillRect(0, h * (1 - 0.2), w, h * 0.045); g.fillStyle = '#f4f4f4'; g.fillRect(0, h * (1 - 0.14), w, h * 0.012); });
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.095, 16, 40).rotateX(-Math.PI / 2).scale(1, 1.42, 1), mat(0xffffff, { map: side, roughness: 0.85 }));
    G.add(put(tyre, tx, R.y0 + y, tz), put(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.2, 20), rim), tx, R.y0 + y, tz));
  });
  G.add(put(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 12), mat(0xc8151d, { roughness: 0.4 })), tx, R.y0 + 0.51, tz));   // the wheel nut
  G.add(put(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.3, 14, 1, true), mat(0x9aa0a6, { side: THREE.DoubleSide })), dX + 0.05, R.y0 + 0.15, dz + 0.55));
  const bigPot = put(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.32, 16), mat(0xc97b52)), R.x1 - 0.3, R.y0 + 0.16, R.z1 - 0.3);
  const leaf = mergeGeometries([...Array(9)].map((_, i) => new THREE.CircleGeometry(0.16, 10).scale(1, 1.3, 1).translate(0, 0.2, 0).rotateX(-0.5 - (i % 3) * 0.25).rotateY(i * 0.9).translate(0, 0.25 + (i % 4) * 0.13, 0)));
  G.add(bigPot, put(new THREE.Mesh(leaf, mat(0x3e7a43, { flatShading: true, side: THREE.DoubleSide })), R.x1 - 0.3, R.y0 + 0.32, R.z1 - 0.3));

  /* ---- light: the monitor's light bar, a warm glow by the window, moonlight, the attack's red ---- */
  const lampLight = new THREE.SpotLight(0xffc690, 0, 2.6, 1.05, 0.7, 1.5); lampLight.position.set(sX - 0.03, sY + sH / 2 + 0.05, dz); lampLight.target.position.set(dX - 0.2, top, dz);
  const floorLight = new THREE.PointLight(0xffb27a, 0, 3.4, 1.6); floorLight.position.set(R.x1 - 0.35, rodY - 0.1, dz);
  const moon = new THREE.PointLight(0x7f9cff, 0, 3.2, 1.8); moon.position.set(R.x1 - 0.2, wy, dz);
  const alarm = new THREE.PointLight(0xff2030, 0, 6, 1.4); alarm.position.set(11.0, R.y1 - 0.3, dz);
  G.add(lampLight, lampLight.target, floorLight, moon, alarm);
  const pk = new THREE.InstancedMesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), new THREE.MeshBasicMaterial({ color: 0xff2233, toneMapped: false }), 140);
  pk.visible = false; pk.frustumCulled = false; pk.userData.moving = true;
  G.add(pk);
  return { group: G, lights: { lampLight, floorLight, moon, alarm }, fairy: { bulbs, glow: fairyGlow }, packets: pk, screenTarget: new THREE.Vector3(sX - 0.06, sY, dz) };
}
