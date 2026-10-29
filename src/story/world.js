/* The landing-page story world: one street the car drives down, past the problems each project
   solves — potholes (RoadHawk), cows (the cattle app), people at a crossing (ADHD / mental-fitness
   models) — to a building whose lit window is my room: a desk, a laptop (chub-guard, then the log
   attack). Small, flat-shaded and built in code so it renders at 60 fps on ordinary laptops.

   Coordinates: the road runs along +Z, centred on x = 0; the car drives in the lane at x = +2.2.
   Every material goes through ink(): a shared uniform blends the whole scene to white-on-black line art. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const INK = { value: 1 };          // 1 = black-and-white line art, 0 = full colour
export const LINES = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false });
const DARK = new THREE.Color(0x030405);

/** Patch a material so INK blends it to black (the fill behind the white edges). */
export function ink(m) {
  if (m.userData.inked) return m;
  m.userData.inked = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uInk = INK;
    sh.fragmentShader = 'uniform float uInk;\n' + sh.fragmentShader.replace('#include <dithering_fragment>',
      '#include <dithering_fragment>\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.012, 0.014, 0.018), uInk);');
  };
  m.customProgramCacheKey = () => 'ink' + (m.type || '');
  return m;
}
const mat = (color, o = {}) => ink(new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o }));
/** White outline edges for every mesh under root (shown while INK is up). Static groups get all their
    edges baked into one line object; moving ones (the car) keep an outline per part. */
export function outline(root, angle = 30, { bake = true } = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), M = new THREE.Matrix4(), pts = [], v = new THREE.Vector3();
  const meshes = [];
  root.traverse(o => { if (o.isMesh && !o.isInstancedMesh && !o.userData.noEdges && !o.userData.moving && o.geometry) meshes.push(o); });
  for (const o of meshes) {
    const eg = new THREE.EdgesGeometry(o.geometry, angle);
    if (!bake) { const e = new THREE.LineSegments(eg, LINES); e.userData.edge = true; o.add(e); continue; }
    M.multiplyMatrices(inv, o.matrixWorld);
    const a = eg.attributes.position.array;
    for (let k = 0; k < a.length; k += 3) { v.set(a[k], a[k + 1], a[k + 2]).applyMatrix4(M); pts.push(v.x, v.y, v.z); }
    eg.dispose();
  }
  if (bake && pts.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const l = new THREE.LineSegments(g, LINES); l.userData.edge = true; l.frustumCulled = false; root.add(l);
  }
}
/** Merge a static group's meshes by material (fewer draw calls, also in the shadow pass). */
export function mergeByMaterial(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), buckets = new Map(), drop = [];
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.keep || Array.isArray(o.material)) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const b = buckets.get(o.material) || { geos: [], cast: false, recv: false, noEdges: o.userData.noEdges };
    b.geos.push(g); b.cast ||= o.castShadow; b.recv ||= o.receiveShadow; buckets.set(o.material, b); drop.push(o);
  });
  for (const o of drop) o.parent.remove(o);
  for (const [m, b] of buckets) {
    const mesh = new THREE.Mesh(mergeGeometries(b.geos), m); mesh.castShadow = b.cast; mesh.receiveShadow = b.recv; mesh.userData.noEdges = b.noEdges;
    root.add(mesh);
  }
}
/** Static from here on: matrices are computed once, not every frame. */
export function freeze(root) {
  root.updateMatrixWorld(true);
  root.traverse(o => { if (!o.userData.moving) { o.matrixAutoUpdate = false; } });
}
const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); return b; };

/* ---------------- textures ---------------- */
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
/* A facade tile is 6 m × 9 m: two 3 m bays by three 3 m floors, so windows are real-sized whatever the
   building. Five styles, so neighbours differ: 0 grilled windows with AC units, 1 balconies, 2 modern ribbon
   glazing, 3 tall windows with louvred shutters, 4 a mix. The albedo is near-white (each building's material
   tints it); the emissive map holds only the windows lit after dark. */
const PX = 64;   // texture pixels per metre
/** [width, height, sill above the floor] of the window in a bay, in metres (also used for the line art). */
function windowRect(style, bay) {
  const st = style === 4 ? (bay ? 2 : 0) : style;
  return st === 0 ? [1.5, 1.4, 0.9] : st === 1 ? [2.6, 2.55, 0.1] : st === 2 ? [2.7, 1.7, 0.75] : [1.1, 1.9, 0.55];
}
function glassPane(g, x, y, w, h, cool) {
  const gr = g.createLinearGradient(x, y, x + w * 0.3, y + h);
  gr.addColorStop(0, cool ? '#8aa2b6' : '#8796a4'); gr.addColorStop(0.55, cool ? '#4d6478' : '#55626e'); gr.addColorStop(1, cool ? '#34465a' : '#3d4650');
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = 'rgba(255,255,255,0.13)'; g.beginPath(); g.moveTo(x + w * 0.2, y); g.lineTo(x + w * 0.5, y); g.lineTo(x + w * 0.1, y + h); g.lineTo(x - w * 0.2, y + h); g.fill();
  g.restore();
}
function curtain(g, x, y, w, h, r) {
  if (r() > 0.55) return;
  g.globalAlpha = 0.85; g.fillStyle = ['#eadfc8', '#c9a27c', '#8e3b3b', '#5f7d8c', '#d8c27a'][Math.floor(r() * 5)];
  const cw = w * (0.22 + r() * 0.3); g.fillRect(r() < 0.5 ? x + 3 : x + w - 3 - cw, y + 3, cw, h - 6); g.globalAlpha = 1;
}
function sunshade(g, x, y, w) {   // the concrete chajja over a window, and its shadow
  g.fillStyle = '#ece9e3'; g.fillRect(x, y, w, 9);
  const gr = g.createLinearGradient(0, y + 9, 0, y + 32); gr.addColorStop(0, 'rgba(0,0,0,0.26)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(x + 4, y + 9, w - 8, 23);
}
function sill(g, x, y, w) { g.fillStyle = '#e6e2da'; g.fillRect(x, y, w, 7); g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(x + 2, y + 7, w - 4, 4); }
function streak(g, x, y, len, r) {   // rain stains running down from a ledge
  const gr = g.createLinearGradient(0, y, 0, y + len); gr.addColorStop(0, 'rgba(70,62,54,0.17)'); gr.addColorStop(1, 'rgba(70,62,54,0)');
  g.fillStyle = gr; g.fillRect(x, y, 3 + r() * 6, len);
}
function facadeTex(style) {
  let s = 4219 + style * 977; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const W = 6 * PX, H = 9 * PX, lit = [], shutterC = ['#3f7a6e', '#4f6f9a', '#7a8f4a', '#a8743a'][style % 4];
  const map = canvasTex(W, H, g => {
    g.fillStyle = '#f3f1ec'; g.fillRect(0, 0, W, H);
    // soft weathering blotches, kept off the edges so the tile repeats without seams
    for (let i = 0; i < 26; i++) {
      const rad = 18 + r() * 46, x = rad + r() * (W - 2 * rad), y = rad + r() * (H - 2 * rad), gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(95,85,72,${(0.03 + r() * 0.04).toFixed(3)})`); gr.addColorStop(1, 'rgba(95,85,72,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let f = 0; f < 3; f++) {
      const base = H - f * 3 * PX;   // canvas y of this floor's slab (canvas y grows downwards)
      g.fillStyle = '#e2ded6'; g.fillRect(0, base - 10, W, 10);              // slab edge
      g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(0, base % H, W, 4);       // and its shadow on the floor below
      for (let b = 0; b < 2; b++) {
        const st = style === 4 ? (b ? 2 : 0) : style, [ww, wh, sl] = windowRect(style, b);
        const w = ww * PX, h = wh * PX, x = b * 3 * PX + (3 * PX - w) / 2, y = base - sl * PX - h, on = r() < 0.45, tone = r();
        if (st === 1) {
          // a recessed balcony: shadowy recess, a glass door at the back, a railing in front
          const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#5f5a53'); gr.addColorStop(1, '#8a847b');
          g.fillStyle = gr; g.fillRect(x, y, w, h);
          const dx = x + w * 0.12, dw = w * 0.42; glassPane(g, dx, y + 14, dw, h - 14); curtain(g, dx, y + 14, dw, h - 14, r);
          g.strokeStyle = '#cfd2d6'; g.lineWidth = 4; g.strokeRect(dx, y + 14, dw, h - 14);
          lit.push([dx, y + 14, dw, h - 14, on, tone]);
          const ry = y + h - 1.0 * PX;
          if (r() < 0.4) { g.strokeStyle = '#d9d4cc'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + 6, ry - 34); g.lineTo(x + w - 6, ry - 30); g.stroke(); for (let c = x + 16; c < x + w - 16; c += 14 + r() * 10) { g.fillStyle = ['#c0392b', '#2e86c1', '#f4d03f', '#ffffff', '#8e44ad'][Math.floor(r() * 5)]; g.fillRect(c, ry - 32, 9, 14 + r() * 10); } }
          for (let c = x + 8; c < x + w - 8; c += 30) if (r() < 0.45) { g.fillStyle = '#9a5b3c'; g.fillRect(c, ry - 12, 14, 12); g.fillStyle = ['#4f8f4a', '#3e7a43', '#6aa35b'][Math.floor(r() * 3)]; g.beginPath(); g.arc(c + 7, ry - 18, 11, 0, Math.PI * 2); g.fill(); }
          g.fillStyle = '#ebe8e2'; g.fillRect(x - 4, ry - 6, w + 8, 6);   // rail
          g.fillStyle = '#d6d2ca'; for (let c = x + 4; c < x + w - 2; c += 9) g.fillRect(c, ry, 3, h - (ry - y) - 8);
          g.fillStyle = '#ece9e3'; g.fillRect(x - 6, y + h - 8, w + 12, 12);   // balcony slab edge
          streak(g, x - 4, y + h + 4, 40 + r() * 50, r); streak(g, x + w - 4, y + h + 4, 40 + r() * 50, r);
        } else if (st === 2) {
          // modern ribbon glazing: big panes, slim dark frames, no grills
          glassPane(g, x, y, w, h, true); curtain(g, x, y, w, h, r);
          g.strokeStyle = '#2f3338'; g.lineWidth = 4; g.strokeRect(x, y, w, h);
          g.lineWidth = 3; g.beginPath(); for (let c = 1; c < 3; c++) { g.moveTo(x + w * c / 3, y); g.lineTo(x + w * c / 3, y + h); } g.stroke();
          g.fillStyle = '#d8d4cc'; g.fillRect(x - 2, y + h, w + 4, 5);
          lit.push([x, y, w, h, on, tone]);
          streak(g, x + 6, y + h + 5, 30 + r() * 40, r);
        } else {
          glassPane(g, x, y, w, h); curtain(g, x, y, w, h, r);
          g.strokeStyle = '#d4d7db'; g.lineWidth = 5; g.strokeRect(x, y, w, h);
          g.lineWidth = 3; g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y + h); g.stroke();
          lit.push([x, y, w, h, on, tone]);
          if (st === 0) {
            // a window grill, and an AC unit beside some windows
            g.strokeStyle = '#3f4348'; g.lineWidth = 2.5; g.beginPath();
            for (let c = x + 8; c < x + w - 4; c += 11) { g.moveTo(c, y - 3); g.lineTo(c, y + h + 2); }
            g.moveTo(x - 3, y + h * 0.5); g.lineTo(x + w + 3, y + h * 0.5); g.stroke();
            if (r() < 0.55) {
              const ax = r() < 0.5 ? x + w + 5 : x - 43, ay = y + h - 30;
              g.fillStyle = '#e1e0db'; g.fillRect(ax, ay, 38, 26); g.strokeStyle = '#b4b3ae'; g.lineWidth = 1.5;
              g.beginPath(); for (let c = ay + 5; c < ay + 24; c += 4) { g.moveTo(ax + 4, c); g.lineTo(ax + 22, c); } g.stroke();
              g.beginPath(); g.arc(ax + 30, ay + 13, 6, 0, Math.PI * 2); g.stroke();
              g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(ax + 2, ay + 26, 36, 4);
              streak(g, ax + 16, ay + 30, 50 + r() * 60, r);
            }
          } else {
            // tall windows with louvred wooden shutters folded back
            for (const sx of [x - w * 0.5 - 4, x + w + 4]) {
              g.fillStyle = shutterC; g.fillRect(sx, y, w * 0.5, h);
              g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 1.5; g.beginPath(); for (let c = y + 6; c < y + h - 3; c += 6) { g.moveTo(sx + 3, c); g.lineTo(sx + w * 0.5 - 3, c); } g.stroke();
            }
          }
          sunshade(g, x - 12, y - 18, w + 24); sill(g, x - 6, y + h, w + 12);
          streak(g, x - 6, y + h + 9, 40 + r() * 60, r); streak(g, x + w, y + h + 9, 40 + r() * 60, r);
        }
      }
    }
  });
  const glow = canvasTex(W / 2, H / 2, g => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W / 2, H / 2);
    for (const [x, y, w, h, on, c] of lit) if (on) { g.fillStyle = c < 0.15 ? '#dfe8ff' : c < 0.6 ? '#ffcf8a' : '#ffbd6e'; g.fillRect(x / 2 + 2, y / 2 + 2, w / 2 - 4, h / 2 - 4); }
  });
  return { map, glow };
}
/** Shopfronts for the ground floors, in one atlas: a signboard over an open shop or a rolled-down shutter.
    A few set up the project the drive is passing (placed where the camera looks at that beat: side of the road (+1 shows on screen-left) and z); the rest are everyday
    shops with a few puns on the toolkit mixed in. The emissive map lights the signs and open shops after dark. */
const SHOPS = [
  { name: 'RASPBERRY PI', sub: 'BAKERY', board: '#b23a2e', open: 1, at: [1, 66] },       // potholes (RoadHawk ran on one)
  { name: 'TO LET', toLet: 1, at: [1, 116] },                                             // the quiet stretch before the cows
  { name: 'DOODH DAIRY', sub: 'FRESH MILK', board: '#1f6fa8', open: 1, at: [1, 198] },   // the herd
  { name: 'CALM MIND', sub: 'CLINIC', board: '#3c8d7a', open: 1, at: [1, 254] },          // the crossing
  { name: 'CODE CAFÉ', sub: 'OPEN LATE', board: '#2d2d2d', open: 1, at: [1, 272] },       // on the way to my building
  { name: 'CHEMIST', sub: '24 HOURS', board: '#0f7a8a', open: 1 },
  { name: 'PYTHON & SONS', sub: 'HARDWARE', board: '#d39b2a', dark: 1, open: 1 },
  { name: 'TAILORS', board: '#2b4f8c', open: 0 },
  { name: 'STATIONERY', board: '#5b3b7a', open: 1 },
  { name: 'PANDAS', sub: 'GENERAL STORE', board: '#1f6f5c', open: 1 },
  { name: 'OPTICIANS', board: '#6a6f78', open: 0 },
  { name: 'FLASK CHAI', sub: 'TEA · SNACKS', board: '#c8553d', open: 1 },
  { name: 'SWEET MART', board: '#a8326e', open: 1 },
  { name: 'GIT REPAIRS', sub: 'WE FIX BRANCHES', board: '#3d3d46', open: 1 },
];
const SHOP_COLS = 4, SHOP_ROWS = 4;
function shopAtlas() {
  const CW = 256, CH = 192, FONT = 'Helvetica, Arial, sans-serif';
  let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const shutter = (g, x, y, w, h) => {
    const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#b0b3b5'); gr.addColorStop(1, '#8b8e91'); g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(0,0,0,0.13)'; for (let c = y + 3; c < y + h; c += 5) g.fillRect(x, c, w, 1.5);
    const gg = g.createLinearGradient(0, y + h - 30, 0, y + h); gg.addColorStop(0, 'rgba(60,50,40,0)'); gg.addColorStop(1, 'rgba(60,50,40,0.3)'); g.fillStyle = gg; g.fillRect(x, y + h - 30, w, 30);
  };
  const text = (g, t, x, y, px, maxW) => { g.font = `bold ${px}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y, maxW); };
  const map = canvasTex(CW * SHOP_COLS, CH * SHOP_ROWS, g => {
    SHOPS.forEach((sh, i) => {
      const x = (i % SHOP_COLS) * CW, y = Math.floor(i / SHOP_COLS) * CH;
      g.fillStyle = '#d9d4ca'; g.fillRect(x, y, CW, CH);
      const ox = x + 10, oy = y + 60, ow = CW - 20, oh = CH - 60;
      if (sh.toLet) {
        // an empty shop: the old board painted over, the shutter down, and a notice on it
        g.fillStyle = '#c4baa7'; g.fillRect(x + 6, y + 6, CW - 12, 48);
        g.fillStyle = 'rgba(255,255,255,0.18)'; for (let c = 0; c < 6; c++) g.fillRect(x + 20 + r() * (CW - 60), y + 12 + r() * 30, 20 + r() * 40, 3);
        shutter(g, ox, oy, ow, oh);
        const bw = 168, bh = 74, bx = x + (CW - bw) / 2, by = oy + 22;
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(bx + 3, by + 4, bw, bh);
        g.fillStyle = '#fbfaf6'; g.fillRect(bx, by, bw, bh);
        g.fillStyle = '#c62828'; text(g, 'TO LET', bx + bw / 2, by + 26, 30, bw - 16);
        g.fillStyle = '#1f1f1f'; text(g, 'OPEN TO AI/ML ROLES', bx + bw / 2, by + 56, 13, bw - 14);
      } else {
        g.fillStyle = sh.board; g.fillRect(x + 6, y + 6, CW - 12, 48);
        g.fillStyle = sh.dark ? '#1d1d1d' : '#fff8ec';
        if (sh.sub) { text(g, sh.name, x + CW / 2, y + 25, 24, CW - 30); text(g, sh.sub, x + CW / 2, y + 45, 11, CW - 40); }
        else text(g, sh.name, x + CW / 2, y + 30, 27, CW - 30);
        if (sh.open) {
          g.fillStyle = '#2b2722'; g.fillRect(ox, oy, ow, oh);
          for (let sy = oy + 20; sy < oy + oh - 44; sy += 24) {
            g.fillStyle = '#5a5045'; g.fillRect(ox + 8, sy + 16, ow - 16, 3);
            for (let c = ox + 10; c < ox + ow - 14; c += 8 + Math.floor(r() * 5)) { g.fillStyle = ['#d9534f', '#f0ad4e', '#5bc0de', '#e8e2d0', '#5cb85c', '#9b7fd1'][Math.floor(r() * 6)]; g.fillRect(c, sy + 4 + Math.floor(r() * 4), 6, 12); }
          }
          g.fillStyle = '#7d6449'; g.fillRect(ox + 14, oy + oh - 34, ow * 0.55, 34);
          g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(ox, oy, ow, oh);
          shutter(g, ox, oy, ow, 18);
        } else shutter(g, ox, oy, ow, oh);
      }
      g.fillStyle = '#c9c3b8'; g.fillRect(x, y + 56, 6, CH - 56); g.fillRect(x + CW - 6, y + 56, 6, CH - 56);
    });
  });
  const glow = canvasTex(CW * SHOP_COLS / 2, CH * SHOP_ROWS / 2, g => {
    g.fillStyle = '#000'; g.fillRect(0, 0, CW * SHOP_COLS / 2, CH * SHOP_ROWS / 2);
    SHOPS.forEach((sh, i) => {
      if (sh.toLet) return;
      const x = (i % SHOP_COLS) * CW / 2, y = Math.floor(i / SHOP_COLS) * CH / 2;
      g.globalAlpha = 0.7; g.fillStyle = sh.board; g.fillRect(x + 3, y + 3, CW / 2 - 6, 24); g.globalAlpha = 1;
      g.fillStyle = '#fff6e0';
      if (sh.sub) { text(g, sh.name, x + CW / 4, y + 12.5, 12, CW / 2 - 15); text(g, sh.sub, x + CW / 4, y + 22.5, 5.5, CW / 2 - 20); }
      else text(g, sh.name, x + CW / 4, y + 15, 13.5, CW / 2 - 15);
      if (sh.open) { g.fillStyle = 'rgba(255,214,150,0.55)'; g.fillRect(x + 5, y + 39, CW / 2 - 10, CH / 2 - 39); }
    });
  });
  return { map, glow };
}
export const NIGHT = { mats: [] };   // facade materials whose windows light up after dark

const WINDOW_SETS = [];
export function facadeMat(tint, seed, w, h) {
  if (!WINDOW_SETS.length) for (let i = 0; i < 5; i++) WINDOW_SETS.push(facadeTex(i));
  const set = WINDOW_SETS[seed % WINDOW_SETS.length];
  const map = set.map.clone(), glow = set.glow.clone();   // clones share the image: one upload each
  for (const t of [map, glow]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / 6, h / 9); t.needsUpdate = true; }
  const m = mat(tint, { map, emissiveMap: glow, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.9 });
  NIGHT.mats.push(m);
  return m;
}
/** The windows of a street-facing facade as lines, so the line art has detail (appended to pts). The texture's
    bays start at the face's UV origin: the far end on the left side of the road, the near end on the right. */
function windowLines(sx, z0, w, h, style, pts) {
  const x = sx * 9.58;
  for (let f = 1; f * 3 + 1 < h; f++) for (let bay = 0; bay * 3 + 3 <= w + 0.01; bay++) {
    const [ww, wh, sl] = windowRect(style, bay % 2), u = bay * 3 + 1.5, zc = sx < 0 ? z0 + w - u : z0 + u;
    const y0 = f * 3 + sl, y1 = y0 + wh, za = zc - ww / 2, zb = zc + ww / 2;
    pts.push(x, y0, za, x, y0, zb, x, y0, zb, x, y1, zb, x, y1, zb, x, y1, za, x, y1, za, x, y0, za);
  }
}

/* ---------------- the street ---------------- */
export function buildStreet(scene) {
  const G = new THREE.Group(); G.name = 'street'; scene.add(G);
  const L = 376;   // z −30 → 346, where Marine Drive takes over
  const asphalt = mat(0x2c2f34, { roughness: 0.95 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(12, L), asphalt);
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0, L / 2 - 30); road.receiveShadow = true; road.userData.noEdges = true;
  G.add(road);
  // lane paint: centre dashes and edge lines
  const paint = mat(0xf2efe6, { roughness: 0.7 });
  const dashes = []; for (let z = -30; z < L - 30; z += 9) dashes.push(new THREE.BoxGeometry(0.16, 0.02, 4.2).translate(0, 0.01, z));
  const dm = new THREE.Mesh(mergeGeometries(dashes), paint); dm.userData.noEdges = true; G.add(dm);
  for (const x of [-5.6, 5.6]) { const e = box(0.14, 0.02, L, paint, x, 0.01, L / 2 - 30); e.userData.noEdges = true; G.add(e); }
  // pavements + kerbs
  const pave = mat(0xb9b4aa), kerb = mat(0xe4ded2);
  for (const sx of [-1, 1]) {
    G.add(box(3.4, 0.16, L, pave, sx * 7.7, 0.08, L / 2 - 30));
    G.add(box(0.3, 0.2, L, kerb, sx * 6.05, 0.1, L / 2 - 30));
  }
  // buildings either side: real-sized floors with shops on the ground, ledges, parapets and water tanks on the
  // roofs; a row of taller towers behind gives the street a skyline
  const tints = [0xe9e3d8, 0xd7dde4, 0xe6d3c3, 0xcfd6cc, 0xded7e6];
  const byTint = tints.map(() => []), winPts = [], trim = [], tanks = [], shops = [];
  const awnC = [0xa63a32, 0x2f6b4f, 0x2c5b8a, 0xc9962f], awn = awnC.map(() => []);
  // a box whose UVs repeat one facade tile every 6 m across and 9 m up, so one material fits every size
  const tiled = (d, h, w) => {
    const g = new THREE.BoxGeometry(d, h, w), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) { const face = Math.floor(i / 4), across = face < 2 ? w : d, up = face < 2 || face > 3 ? h : w; uv.setXY(i, uv.getX(i) * across / 6, uv.getY(i) * up / 9); }
    return g;
  };
  const roof = (cx, cz, d, w, h, k) => {
    trim.push(new THREE.BoxGeometry(d + 0.2, 0.7, w + 0.2).translate(cx, h + 0.35, cz));   // parapet
    for (let i = 0; i < 1 + (k % 3); i++) { const rr = 0.55 + ((k + i) % 3) * 0.1; tanks.push(new THREE.CylinderGeometry(rr, rr, 1.15, 14).translate(cx + d * (0.2 * i - 0.2), h + 1.28, cz + w * (((k + i) % 3) * 0.25 - 0.25))); }
    if (k % 2 === 0) trim.push(new THREE.BoxGeometry(2.6, 2.4, 3).translate(cx + d * 0.15, h + 1.9, cz + w * 0.2));   // stair room
  };
  let k = 0;
  const units = [];
  for (const sx of [-1, 1]) {
    for (let z = -40; z < 336; ) {
      const w = 10 + ((k * 7) % 9), h = 3 * (3 + ((k * 13) % 5)), d = 9 + ((k * 5) % 6);
      if (sx > 0 && z + w > 312) break;   // my building, then Marine Drive
      if (z + w > 340) break;
      const ti = k % tints.length, style = (11 + ti) % 5, fx = sx * 9.6, cx = sx * (9.6 + d / 2), cz = z + w / 2;
      byTint[ti].push(tiled(d, h, w).translate(cx, h / 2, cz));
      windowLines(sx, z, w, h, style, winPts);
      // a concrete ledge at every floor of the street face, and a canopy over the shops
      for (let y = 6; y < h - 1; y += 3) trim.push(new THREE.BoxGeometry(0.3, 0.14, w).translate(fx - sx * 0.15, y, cz));
      trim.push(new THREE.BoxGeometry(0.7, 0.16, w).translate(fx - sx * 0.35, 3.5, cz));
      roof(cx, cz, d, w, h, k);
      // shopfronts on the ground floor (which shop goes where is decided once every unit is known)
      const n = Math.max(1, Math.round(w / 4.6)), uw = w / n;
      for (let i = 0; i < n; i++) units.push({ sx, fx, uw, zc: z + (i + 0.5) * uw, odd: (k + i) % 2 });
      z += w + 1.5; k++;
    }
  }
  // the story's shops go to the unit nearest their spot; everyday ones fill the rest, never twice in a row
  SHOPS.forEach((sh, c) => {
    if (!sh.at) return;
    const [side, z] = sh.at, u = units.filter(u => u.sx === side && u.c === undefined).sort((a, b) => Math.abs(a.zc - z) - Math.abs(b.zc - z))[0];
    if (u) u.c = c;
  });
  const fill = SHOPS.map((sh, c) => c).filter(c => !SHOPS[c].at);
  let f = 0;
  for (const u of units) if (u.c === undefined) u.c = fill[(f++ * 4) % fill.length];
  for (const { sx, fx, uw, zc, odd, c } of units) {
    const col = c % SHOP_COLS, row = Math.floor(c / SHOP_COLS), q = new THREE.PlaneGeometry(uw - 0.3, 3.2), uv = q.attributes.uv;
    for (let j = 0; j < uv.count; j++) uv.setXY(j, (col + uv.getX(j)) / SHOP_COLS, 1 - (row + 1 - uv.getY(j)) / SHOP_ROWS);
    shops.push(q.rotateY(-sx * Math.PI / 2).translate(fx - sx * 0.03, 1.76, zc));
    if (SHOPS[c].open && !odd) awn[((Math.floor(zc) % 4) + 4) % 4].push(new THREE.BoxGeometry(1.0, 0.05, uw - 0.5).rotateZ(sx * 0.35).translate(fx - sx * 0.5, 2.38, zc));
  }
  for (const sx of [-1, 1]) for (let z = -30, i = 0; z < 296; i++) {
    const w = 14 + ((i * 5) % 8), d = 14, h = 3 * (9 + ((i * 7) % 8)), cx = sx * (27 + ((i * 3) % 6) + d / 2), cz = z + w / 2;
    byTint[(i + 2) % tints.length].push(tiled(d, h, w).translate(cx, h / 2, cz));
    roof(cx, cz, d, w, h, i + 1);
    z += w + 6 + ((i * 11) % 14);
  }
  byTint.forEach((geos, i) => { if (!geos.length) return; const b = new THREE.Mesh(mergeGeometries(geos), facadeMat(tints[i], 11 + i, 6, 9)); b.receiveShadow = true; G.add(b); });
  G.add(new THREE.Mesh(mergeGeometries(trim), mat(0xe6e1d7, { roughness: 0.9 })), new THREE.Mesh(mergeGeometries(tanks), mat(0x232527, { roughness: 0.55 })));
  const atlas = shopAtlas(), shopMat = mat(0xffffff, { map: atlas.map, emissiveMap: atlas.glow, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.8 });
  NIGHT.mats.push(shopMat); G.add(new THREE.Mesh(mergeGeometries(shops), shopMat));
  awn.forEach((geos, i) => { if (geos.length) G.add(new THREE.Mesh(mergeGeometries(geos), mat(awnC[i], { roughness: 0.8 }))); });
  const wl = new THREE.BufferGeometry(); wl.setAttribute('position', new THREE.Float32BufferAttribute(winPts, 3));
  const winLines = new THREE.LineSegments(wl, LINES); winLines.userData.edge = true; G.add(winLines);
  // trees on the pavement
  const trunk = mat(0x6b5240), leaf = mat(0x5f8f4e, { flatShading: true });
  const trG = new THREE.CylinderGeometry(0.14, 0.2, 2.4, 6).translate(0, 1.2, 0), crG = new THREE.IcosahedronGeometry(1.6, 1).scale(1, 0.9, 1).translate(0, 3.3, 0);
  const spots = [];
  for (let z = 6; z < 330; z += 17) for (const sx of [-1, 1]) if (!(z > 225 && z < 262) && !(sx > 0 && z > 300)) spots.push([sx * 7.4, 0.16, z + (sx > 0 ? 8 : 0)]);   // keep the crossing clear
  const trI = new THREE.InstancedMesh(trG, trunk, spots.length), crI = new THREE.InstancedMesh(crG, leaf, spots.length);
  const M4 = new THREE.Matrix4(), edgePts = [], eT = new THREE.EdgesGeometry(trG, 30).attributes.position.array, eC = new THREE.EdgesGeometry(crG, 30).attributes.position.array;
  spots.forEach(([x, y, z], i) => {
    M4.makeTranslation(x, y, z); trI.setMatrixAt(i, M4); crI.setMatrixAt(i, M4);
    for (const e of [eT, eC]) for (let k = 0; k < e.length; k += 3) edgePts.push(e[k] + x, e[k + 1] + y, e[k + 2] + z);
  });
  trI.castShadow = crI.castShadow = true; trI.userData.noEdges = crI.userData.noEdges = true;
  const tl = new THREE.BufferGeometry(); tl.setAttribute('position', new THREE.Float32BufferAttribute(edgePts, 3));
  const treeLines = new THREE.LineSegments(tl, LINES); treeLines.userData.edge = true;
  G.add(trI, crI, treeLines);
  return G;
}

/* ---------------- potholes (RoadHawk) ---------------- */
export function buildPotholes(scene) {
  const holes = [];
  const pit = mat(0x101318, { roughness: 0.25, metalness: 0.2 }), rim = mat(0x8a8c8f, { roughness: 1 });
  const spots = [[2.6, 44, 0.8], [0.9, 53, 0.55], [3.4, 61, 0.95], [-2.6, 66, 0.7], [2.0, 74, 0.6], [4.1, 83, 0.75], [1.2, 92, 0.85], [-1.4, 99, 0.6]];
  spots.forEach(([x, z, r0], i) => {
    const r = r0 * 1.25;
    const shape = (rr, jitter) => {
      const pts = [];
      for (let a = 0; a < 14; a++) { const t = a / 14 * Math.PI * 2, j = 1 + Math.sin(t * 3 + i) * jitter + Math.cos(t * 5 + i * 2) * jitter * 0.6; pts.push(new THREE.Vector2(Math.cos(t) * rr * j * 1.3, Math.sin(t) * rr * j)); }
      return new THREE.ShapeGeometry(new THREE.Shape(pts));
    };
    const g = new THREE.Group();
    const a = new THREE.Mesh(shape(r * 1.18, 0.16), rim), b = new THREE.Mesh(shape(r, 0.2), pit);
    a.rotation.x = b.rotation.x = -Math.PI / 2; a.position.y = 0.012; b.position.y = 0.016;
    g.add(a, b); g.position.set(x, 0, z); g.rotation.y = i * 1.3;
    scene.add(g);
    holes.push({ obj: g, size: new THREE.Vector3(r * 3, 0.3, r * 2.4) });
  });
  return holes;
}

/* ---------------- cows (cattle app) — zebu with the hump ---------------- */
function cow(coat, patch) {
  const c = new THREE.Group();
  const C = mat(coat, { flatShading: true }), P = mat(patch, { flatShading: true }), H = mat(0xd8cdb8), D = mat(0x2a2522);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.3, 4, 10), C); body.rotation.z = Math.PI / 2; body.rotation.y = Math.PI / 2; body.position.y = 1.2; body.scale.set(1, 1, 0.95);
  const hump = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), C); hump.position.set(0, 1.78, 0.55);
  const spot = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), P); spot.position.set(0.32, 1.35, -0.3); spot.scale.set(0.45, 0.9, 1.2);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 0.6, 8), C); neck.position.set(0, 1.45, 1.05); neck.rotation.x = 0.9;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.62), C); head.position.set(0, 1.55, 1.38); head.rotation.x = 0.35;
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.26, 0.24), H); snout.position.set(0, 1.4, 1.68); snout.rotation.x = 0.35;
  c.add(body, hump, spot, neck, head, snout);
  for (const sx of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 6), H); horn.position.set(sx * 0.17, 1.86, 1.3); horn.rotation.z = -sx * 0.5;
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.12), C); ear.position.set(sx * 0.3, 1.66, 1.28); ear.rotation.z = sx * 0.3;
    c.add(horn, ear);
    for (const z of [-0.6, 0.62]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.95, 6), C); leg.position.set(sx * 0.27, 0.48, z);
      const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.1, 6), D); hoof.position.set(sx * 0.27, 0.05, z);
      c.add(leg, hoof);
    }
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.9, 5), C); tail.position.set(0, 1.0, -1.12); tail.rotation.x = 0.25;
  c.add(tail);
  c.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return c;
}
export function buildCows(scene) {
  const herd = [];
  const set = [[3.2, 186, -1.9, 0xf1ece2, 0xb9b2a6, 'healthy'], [-0.9, 192, 0.5, 0xd8c7ad, 0x8b6f52, 'healthy'], [4.4, 199, 2.6, 0xeee8dc, 0x9a8d7c, 'check'], [0.4, 204, -0.6, 0xc9b79a, 0x6f5843, 'healthy']];
  for (const [x, z, ry, a, b, tag] of set) {
    const c = cow(a, b); c.position.set(x, 0, z); c.rotation.y = ry; scene.add(c); mergeByMaterial(c);
    herd.push({ obj: c, tag, size: new THREE.Vector3(1.6, 2.1, 3.1) });
  }
  return herd;
}

/* ---------------- the crossing: signal, zebra, people (ADHD / mental fitness) ---------------- */
export function buildCrossing(scene) {
  const G = new THREE.Group(); scene.add(G);
  const white = mat(0xf4f1ea, { roughness: 0.7 });
  for (let x = -5; x <= 5; x += 1.25) { const s = box(0.7, 0.02, 5.2, white, x, 0.012, 249); s.userData.noEdges = false; G.add(s); }
  const stop = box(5.4, 0.02, 0.4, white, 2.9, 0.012, 245.2); G.add(stop);
  // the signal on the car's side
  const metal = mat(0x2d3035, { roughness: 0.5, metalness: 0.4 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 6, 8), metal); pole.position.set(6.4, 3, 244.6);
  const arm = box(3.6, 0.16, 0.16, metal, 4.7, 5.8, 244.6);
  const head = box(0.5, 1.4, 0.45, metal, 3.3, 5.1, 244.6);
  G.add(pole, arm, head);
  const lamp = (hex, y) => { const m = ink(new THREE.MeshStandardMaterial({ color: 0x111111, emissive: hex, emissiveIntensity: 0.05 })); const l = new THREE.Mesh(new THREE.CircleGeometry(0.16, 14), m); l.position.set(3.3, y, 244.36); l.rotation.y = Math.PI; l.userData.noEdges = true; G.add(l); return m; };
  const lights = { red: lamp(0xff2a1a, 5.55), amber: lamp(0xffb020, 5.1), green: lamp(0x2bff7a, 4.65) };
  G.children.forEach(o => { o.userData.keep = true; });   // the signal stays as separate parts
  // people: simple figures, each with a "brain" that lights up when the model looks at them
  const skins = [0x8a5a3c, 0x6b4428, 0xa0704c, 0x7d5034, 0x5e3b24, 0x9a6a46];
  const clothes = [0xe0474c, 0x3f7cd8, 0xf2b630, 0x44a37b, 0x9b59d0, 0xf07f3c];
  const people = [];
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Group();
    const cl = mat(clothes[i]), sk = mat(skins[i]), tr = mat(0x2c3340);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 3, 8), cl); torso.position.y = 1.18;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), sk); head.position.y = 1.72;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(0x1b1512)); hair.position.y = 1.75;
    const legs = [], arms = [];
    for (const sx of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(sx * 0.11, 0.86, 0);
      const lm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.62, 2, 6), tr); lm.position.y = -0.42; leg.add(lm);
      const arm = new THREE.Group(); arm.position.set(sx * 0.3, 1.42, 0);
      const am = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.48, 2, 6), cl); am.position.y = -0.3; arm.add(am);
      p.add(leg, arm); legs.push(leg); arms.push(arm);
    }
    p.add(torso, head, hair);
    p.traverse(o => { if (o.isMesh) o.castShadow = true; o.userData.moving = true; o.userData.keep = true; });
    p.userData.moving = true;
    // brain: a glowing wire icosahedron with neurons
    const brain = new THREE.Group();
    const bw = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.34, 1)), new THREE.LineBasicMaterial({ color: i % 2 ? 0x39d4ff : 0xff5fa8, transparent: true, opacity: 0, depthWrite: false }));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x39d4ff : 0xff5fa8, transparent: true, opacity: 0, depthWrite: false }));
    glow.userData.noEdges = true;
    brain.add(bw, glow); brain.position.y = 1.74; brain.scale.setScalar(0.001);
    for (const o of [brain, bw, glow]) { o.userData.moving = true; o.userData.keep = true; }
    p.add(brain);
    const dir = i % 2 ? 1 : -1;
    p.userData = { moving: true, keep: true, legs, arms, brain, bw, glow, dir, lane: 247.2 + (i % 3) * 1.5, delay: i * 0.12, speed: 0.9 + (i % 3) * 0.12 };
    p.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    G.add(p); people.push({ obj: p, size: new THREE.Vector3(0.7, 1.95, 0.7) });
  }
  return { group: G, lights, people };
}

/* ---------------- sky ---------------- */
export function buildSky(scene) {
  const u = { top: { value: new THREE.Color(0x2b4a7a) }, bottom: { value: new THREE.Color(0xf3c9a2) }, uInk: INK };
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: u,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; uniform float uInk; varying vec3 vP; void main(){ float t = smoothstep(-0.05, 0.55, vP.y); vec3 c = mix(bottom, top, t); gl_FragColor = vec4(mix(c, vec3(0.012,0.014,0.018), uInk), 1.0); }',
  });
  const s = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), m); s.userData.noEdges = true; s.frustumCulled = false;
  scene.add(s);
  return u;
}
export { DARK };
