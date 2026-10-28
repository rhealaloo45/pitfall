/* Frame-capture helper, loaded into mumbai.html by tools/reel/capture.mjs (not shipped to visitors).
   For each frame it renders the night city normally, then again as neon line art made from the
   geometry (depth + normal + layer passes), and blends the two with a wipe that sweeps outwards
   from the camera — the line-art-to-render effect used by the scroll reel on the landing page. */
import * as THREE from 'three';

const G = window.__game;
const { renderer, scene, camera } = G;

/* ---------------- line-art palette, per scene layer ---------------- */
// line: outline colour · detail: colour for texture detail (windows, lane paint) · k: strength
const LAYERS = {
  buildings: { line: [0.96, 0.92, 0.9], alt: [0.95, 0.74, 0.84], detail: [0.22, 0.83, 1.0], k: 1 },
  landmarks: { line: [1.0, 0.76, 0.36], alt: [1.0, 0.9, 0.7], detail: [1.0, 0.55, 0.3], k: 1 },
  roads:     { line: [0.2, 0.84, 1.0], alt: [0.3, 0.6, 1.0], detail: [0.2, 0.84, 1.0], k: 0.95 },
  props:     { line: [1.0, 0.4, 0.68], alt: [0.75, 0.5, 1.0], detail: [1.0, 0.4, 0.68], k: 0.8 },
  play:      { line: [0.5, 1.0, 0.62], alt: [0.5, 1.0, 0.62], detail: [0.5, 1.0, 0.62], k: 0.8 },
  car:       { line: [1.0, 0.2, 0.2], alt: [1.0, 0.45, 0.35], detail: [1.0, 0.3, 0.25], k: 1.2 },
  terrain:   { line: [0.12, 0.56, 0.48], alt: [0.12, 0.5, 0.56], detail: [0.12, 0.56, 0.48], k: 0.55 },
  farfield:  { line: [0.55, 0.52, 0.85], alt: [0.45, 0.6, 0.85], detail: [0.55, 0.52, 0.85], k: 0.5 },
  water:     { line: [0, 0, 0], alt: [0, 0, 0], detail: [0.12, 0.42, 0.75], k: 0, waves: true },   // no outline, faint wave glints
};
const NAMES = Object.keys(LAYERS);

/* ---------------- geometry passes ---------------- */
const VERT = /* glsl */`
  #include <common>
  #include <batching_pars_vertex>
  varying vec3 vN; varying vec3 vW; varying float vD; varying vec2 vUv;
  uniform mat3 uvT;
  void main() {
    #include <batching_vertex>
    #include <beginnormal_vertex>
    #include <defaultnormal_vertex>
    #include <begin_vertex>
    #include <project_vertex>
    vec4 wp = vec4(transformed, 1.0);
    #ifdef USE_BATCHING
      wp = batchingMatrix * wp;
    #endif
    #ifdef USE_INSTANCING
      wp = instanceMatrix * wp;
    #endif
    vW = (modelMatrix * wp).xyz;
    vN = normalize(transformedNormal);
    vD = -mvPosition.z;
    vUv = (uvT * vec3(uv, 1.0)).xy;
  }`;
const FRAG = /* glsl */`
  uniform int uMode; uniform float uLayer; uniform sampler2D map; uniform float cut;
  varying vec3 vN; varying vec3 vW; varying float vD; varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    #ifdef USE_CUT
      if (texture2D(map, vUv).a < cut) discard;
    #endif
    vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
    if (uMode == 0) gl_FragColor = vec4(n, vD);
    else gl_FragColor = vec4(uLayer, hash(floor(vW.xz / 14.0)), 1.0, 1.0);
  }`;

const mats = new Map();   // `${layer}|${map uuid}` → ShaderMaterial
function passMaterial(layerIdx, orig) {
  const cutMap = orig && orig.map && (orig.alphaTest > 0 || orig.transparent) ? orig.map : null;
  const key = layerIdx + '|' + (cutMap ? cutMap.uuid : '');
  let m = mats.get(key);
  if (!m) {
    m = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
      uniforms: { uMode: { value: 0 }, uLayer: { value: layerIdx }, map: { value: cutMap }, cut: { value: cutMap ? Math.max(0.5, orig.alphaTest || 0) : 0 }, uvT: { value: new THREE.Matrix3() } },
      defines: cutMap ? { USE_CUT: 1 } : {},
    });
    if (cutMap) { if (cutMap.matrixAutoUpdate) cutMap.updateMatrix(); m.uniforms.uvT.value.copy(cutMap.matrix); }
    mats.set(key, m);
  }
  return m;
}

const tagged = [];   // [object, layerIdx | -1 (hide)]
function tagScene() {
  tagged.length = 0;
  const seen = new Set();
  const visit = (root, idx, name) => root.traverse(o => {
    if (seen.has(o)) return; seen.add(o);
    if (o.isPoints || o.isLine || o.isSprite) { tagged.push([o, -1]); return; }
    if (!o.isMesh) return;
    const m0 = Array.isArray(o.material) ? o.material[0] : o.material;
    // see-through extras (searchlight beams, glows, decals) would draw as stray lines
    const ghost = m0 && m0.transparent && (m0.depthWrite === false || m0.blending === THREE.AdditiveBlending || m0.opacity < 0.6 || name === 'landmarks');
    tagged.push([o, ghost || idx < 0 ? -1 : idx]);
  });
  for (const c of scene.children) {
    const name = c === G.car.root ? 'car' : c.name;
    const idx = NAMES.indexOf(name);
    visit(c, name === 'sky' || c === G.car.contactShadow ? -1 : idx, name);
  }
}

const swapped = [];
function swapIn(mode) {
  for (const [o, idx] of tagged) {
    swapped.push([o, o.material, o.visible]);
    if (idx < 0) { o.visible = false; continue; }
    const pm = Array.isArray(o.material) ? o.material.map(m => passMaterial(idx, m)) : passMaterial(idx, o.material);
    for (const m of Array.isArray(pm) ? pm : [pm]) m.uniforms.uMode.value = mode;
    o.material = pm;
  }
}
function swapOut() { for (const [o, m, v] of swapped) { o.material = m; o.visible = v; } swapped.length = 0; }

let rt = null;
function geometryPass(mode, W, H) {
  if (!rt || rt.width !== W || rt.height !== H) {
    if (rt) rt.dispose();
    rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: true, samples: 0 });
  }
  const fog = scene.fog, bg = scene.background, auto = renderer.shadowMap.autoUpdate, cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
  scene.fog = null; scene.background = null; renderer.shadowMap.autoUpdate = false;
  swapIn(mode);
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear();
  renderer.render(scene, camera);
  const out = new Float32Array(W * H * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, W, H, out);
  renderer.setRenderTarget(null);
  swapOut();
  scene.fog = fog; scene.background = bg; renderer.shadowMap.autoUpdate = auto; renderer.setClearColor(cc, ca);
  return out;   // rows bottom-up
}

/* ---------------- image work (CPU) ---------------- */
function boxBlur(src, W, H, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length), n = 2 * r + 1;
  for (let y = 0; y < H; y++) for (let c = 0; c < 3; c++) {
    let acc = 0; const row = y * W;
    for (let x = -r; x <= r; x++) acc += src[(row + Math.min(W - 1, Math.max(0, x))) * 3 + c];
    for (let x = 0; x < W; x++) {
      tmp[(row + x) * 3 + c] = acc / n;
      acc += src[(row + Math.min(W - 1, x + r + 1)) * 3 + c] - src[(row + Math.max(0, x - r)) * 3 + c];
    }
  }
  for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[(Math.min(H - 1, Math.max(0, y)) * W + x) * 3 + c];
    for (let y = 0; y < H; y++) {
      out[(y * W + x) * 3 + c] = acc / n;
      acc += tmp[(Math.min(H - 1, y + r + 1) * W + x) * 3 + c] - tmp[(Math.max(0, y - r) * W + x) * 3 + c];
    }
  }
  return out;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const h2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

/** Composite one frame. reveal 0 → pure line art, 1 → pure render. */
function composite(lit, nd, id, W, H, reveal, frame) {
  const N = W * H;
  // flip the float passes to top-down rows to match the canvas image
  const D = new Float32Array(N), NX = new Float32Array(N), NY = new Float32Array(N), NZ = new Float32Array(N), L = new Int8Array(N), HS = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = ((H - 1 - y) * W + x) * 4, d = y * W + x;
    const geo = id[s + 2] > 0.5;
    D[d] = geo ? nd[s + 3] : Infinity;
    NX[d] = nd[s]; NY[d] = nd[s + 1]; NZ[d] = nd[s + 2];
    L[d] = geo ? Math.round(id[s]) : -1; HS[d] = id[s + 1];
  }
  const lum = new Float32Array(N);
  for (let i = 0; i < N; i++) lum[i] = (lit[i * 4] * 0.3 + lit[i * 4 + 1] * 0.59 + lit[i * 4 + 2] * 0.11) / 255;

  const lines = new Float32Array(N * 3);
  const fill = new Float32Array(N * 3);
  const nb = [1, 0, 0, 1, -1, 0, 0, -1];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const p = y * W + x, lp = L[p];
    if (lp < 0) continue;
    const name = NAMES[lp], P = LAYERS[name], dp = D[p];
    // dark body so silhouettes read against the black sky; the sea stays black
    const shade = name === 'water' ? 0 : 0.035 + 0.03 * Math.max(0, NY[p]) + 0.015 * Math.abs(NX[p]);
    fill[p * 3] = shade * 0.9; fill[p * 3 + 1] = shade * 0.95; fill[p * 3 + 2] = shade * 1.15;
    let e = 0;
    for (let k = 0; k < 8; k += 2) {
      const q = (y + nb[k + 1]) * W + (x + nb[k]), lq = L[q], dq = D[q];
      if (lq < 0) { e = 1; break; }                                    // against the sky
      if (P.waves) continue;
      if (LAYERS[NAMES[lq]].waves && lq !== lp) { e = Math.max(e, 0.9); continue; }   // shoreline
      if (dq - dp > dp * 0.02 + 0.12) { e = 1; break; }                // nearer side of a depth step
      if (lq !== lp && dp <= dq) e = Math.max(e, 0.85);                // layer boundary
      if (k < 4) {                                                     // crease (one side only)
        const c = 1 - (NX[p] * NX[q] + NY[p] * NY[q] + NZ[p] * NZ[q]);
        if (c > 0.22) e = Math.max(e, Math.min(1, 0.45 + c));
        else if (Math.abs(HS[p] - HS[q]) > 1e-4 && lp === lq && name !== 'terrain' && name !== 'roads') e = Math.max(e, 0.5);
      }
    }
    // texture detail (lit windows, lane paint) traced from the render itself
    let det = 0;
    if (dp < 1400) {
      const gx = lum[p + 1] - lum[p - 1], gy = lum[p + W] - lum[p - W];
      const g = Math.abs(gx) + Math.abs(gy);
      det = smooth(0.16, 0.45, g) * (1 - smooth(500, 1400, dp));
      if (P.waves) det = smooth(0.06, 0.22, g) * 0.4 * (1 - smooth(50, 450, dp));
    }
    const fade = name === 'roads' ? 0.12 + 0.88 * (1 - smooth(120, 900, dp)) : 0.3 + 0.7 * (1 - smooth(350, 2600, dp));
    const c = HS[p] > 0.62 ? P.alt : P.line;
    const a = e * P.k * fade, b = det * 0.65 * fade * (e > 0 ? 0 : 1);
    lines[p * 3] = c[0] * a + P.detail[0] * b;
    lines[p * 3 + 1] = c[1] * a + P.detail[1] * b;
    lines[p * 3 + 2] = c[2] * a + P.detail[2] * b;
  }
  const glow = boxBlur(boxBlur(lines, W, H, 3), W, H, 3);

  // reveal: near + low pixels first, then outwards to the horizon, then the sky; blocky glitch at the front
  const band = 0.16, R = reveal * (1.25 + band * 2) - band;
  const out = new Uint8ClampedArray(N * 4);
  const fb = Math.floor(frame / 2);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, d = D[p];
    let t;
    if (d === Infinity) t = smooth(0.5 + 0.3 * (1 - y / H), 0.8 + 0.2 * (1 - y / H), reveal);   // sky: a smooth fade, horizon first
    else {
      const nd01 = Math.min(1, Math.log(Math.max(4, d) / 4) / Math.log(3200 / 4));
      const v = 0.62 * nd01 + 0.38 * (y / H) + (h2(Math.floor(x / 10) + fb * 17.3, Math.floor(y / 10)) - 0.5) * 0.1;
      t = reveal >= 1 ? 1 : reveal <= 0 ? 0 : Math.min(1, Math.max(0, (R - v) / band + 0.5));
    }
    const litMix = smooth(0.2, 0.62, t), over = 1 - smooth(0.5, 1, t);
    const front = (t > 0.05 && t < 0.6) ? (1 - Math.abs(t - 0.33) / 0.28) * 0.35 : 0;   // cyan scan at the wavefront
    for (let c = 0; c < 3; c++) {
      const la = Math.min(1, fill[p * 3 + c] + lines[p * 3 + c] + glow[p * 3 + c] * 0.9);
      const lv = lit[p * 4 + c] / 255;
      let o = la * (1 - litMix) + lv * litMix;
      const ln = Math.min(1, (lines[p * 3 + c] + glow[p * 3 + c] * 0.5) * over * litMix);
      o = 1 - (1 - o) * (1 - ln);
      if (front > 0 && L[p] >= 0) o += front * (c === 0 ? 0.1 : c === 1 ? 0.55 : 0.75);
      out[p * 4 + c] = Math.min(255, o * 255);
    }
    out[p * 4 + 3] = 255;
  }
  return out;
}

/* ---------------- camera path + the car on Marine Drive ---------------- */
const md = G.world.net.roads.find(r => r.name && r.name.includes('Marine') && r.n > 100);
function roadAt(s) {
  // arc length s along Marine Drive (south-east towards Nariman Point), offset into the near lane
  const S = md.s; let i = 0; while (i < md.n - 2 && S[i + 1] < s) i++;
  const f = Math.min(1, Math.max(0, (s - S[i]) / (S[i + 1] - S[i])));
  const x = md.x[i] + (md.x[i + 1] - md.x[i]) * f, z = md.z[i] + (md.z[i + 1] - md.z[i]) * f;
  const tx = md.tx[i], tz = md.tz[i];
  const lane = md.T.median / 2 + (md.T.hw - md.T.median / 2) * 0.28;   // inside lane, clear of parked buses
  return { x: x + tz * lane, z: z - tx * lane, tx, tz, heading: Math.atan2(tx, tz) };
}
const s0 = (() => { let best = 0, bd = Infinity; for (let i = 0; i < md.n; i++) { const d = Math.hypot(md.x[i] - 150, md.z[i] - 620); if (d < bd) { bd = d; best = md.s[i]; } } return best; })();
const V = (a, b, c) => new THREE.Vector3(a, b, c);
const pos = new THREE.Vector3(), quat = new THREE.Quaternion();

function placeCar(frame) {
  const s = s0 + frame * 0.85, r = roadAt(s);
  const y = G.world.groundAt(r.x, r.z, 30);
  G.sim.reset(V(r.x, y, r.z), r.heading);
  for (const w of G.sim.wheels) w.spin = s / G.sim.spec.wheelRadius;
  G.sim.vel.set(r.tx * 25, 0, r.tz * 25);
  pos.copy(G.sim.pos); quat.copy(G.sim.quat);
  G.car.update(pos, quat, G.sim, 1 / 30, y);
  return { p: G.sim.pos.clone(), f: V(r.tx, 0, r.tz) };
}

/** Camera keys; the last ones follow the car so the shot lands in the game's chase camera. */
function keys(total) {
  // a drone dive: off Chowpatty looking down the Queen's Necklace, then down onto the car
  const end = placeCar(total - 1), mid = placeCar(Math.round(total * 0.8));
  return [
    // tracking shot ~65 m out to sea, parallel to the promenade, buildings sliding past on the left
    { f: 0, pos: V(-228, 14, 382), look: V(-44, 18, 343), fov: 46 },
    { f: total * 0.45, pos: V(-18, 16, 491), look: V(190, 18, 640), fov: 46 },
    { f: total * 0.8, pos: mid.p.clone().addScaledVector(mid.f, -28).add(V(0, 9, 0)), look: mid.p.clone().addScaledVector(mid.f, 24), fov: 52 },
    { f: total - 1, pos: end.p.clone().addScaledVector(end.f, -5.8).add(V(0, 1.65, 0)), look: end.p.clone().addScaledVector(end.f, 3.6).add(V(0, 0.62, 0)), fov: 58 },
  ];
}
let K = null, PC = null, LC = null;
function cameraAt(frame, total) {
  if (!K) {
    K = keys(total);
    PC = new THREE.CatmullRomCurve3(K.map(k => k.pos), false, 'centripetal');
    LC = new THREE.CatmullRomCurve3(K.map(k => k.look), false, 'centripetal');
  }
  const n = K.length - 1; let si = 0; while (si < n - 1 && K[si + 1].f <= frame) si++;
  let u = Math.min(1, Math.max(0, (frame - K[si].f) / (K[si + 1].f - K[si].f)));
  if (si === n - 1) u = 1 - (1 - u) * (1 - u) * (1 - u * 0.4);   // settle into the chase camera
  const e = (si + u) / n;
  camera.position.copy(PC.getPoint(e)); camera.up.set(0, 1, 0); camera.lookAt(LC.getPoint(e));
  camera.fov = THREE.MathUtils.lerp(K[si].fov, K[si + 1].fov, u);
  camera.far = 9000; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}

/* ---------------- one frame ---------------- */
const work = document.createElement('canvas'), wg = work.getContext('2d', { willReadFrequently: true });
const outs = {};
function encode(img, W, H, sizes) {
  work.width = W; work.height = H;
  wg.putImageData(new ImageData(img, W, H), 0, 0);
  return Promise.all(sizes.map(([w, h, q]) => {
    let c = outs[w]; if (!c) { c = outs[w] = document.createElement('canvas'); c.width = w; c.height = h; }
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(work, 0, 0, w, h);
    return new Promise(res => c.toBlob(b => { const fr = new FileReader(); fr.onload = () => res(fr.result.split(',')[1]); fr.readAsDataURL(b); }, 'image/webp', q));
  }));
}

window.__reel = {
  async frame(i, total, { reveal, sizes, debug = false }) {
    if (!tagged.length) tagScene();
    const t = 20 + i / 24;
    const car = placeCar(i);
    cameraAt(i, total);
    G.scene.fog.density = G.atmo.T.fogD;
    for (let k = 0; k < 2; k++) { G.atmo.update(camera, car.p, t); G.world.update(t, 1 / 24, camera); G.render(); }
    const el = renderer.domElement, W = el.width, H = el.height;
    work.width = W; work.height = H; wg.drawImage(el, 0, 0);
    const lit = wg.getImageData(0, 0, W, H).data;
    const nd = geometryPass(0, W, H), id = geometryPass(1, W, H);
    const img = composite(lit, nd, id, W, H, reveal, i);
    const res = await encode(img, W, H, sizes);
    if (debug) {
      res.push(...await encode(composite(lit, nd, id, W, H, 0, i), W, H, [[sizes[0][0], sizes[0][1], 0.9]]));
      res.push(...await encode(new Uint8ClampedArray(lit), W, H, [[sizes[0][0], sizes[0][1], 0.9]]));
    }
    return res;
  },
};
