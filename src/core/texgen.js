/* Procedural texture generation — every texture is generated once at load,
   tileable, and uploaded with full mipmaps + anisotropic filtering, so surfaces
   stay smooth at distance instead of shimmering (the old shaders evaluated
   hash patterns per pixel, which cannot be filtered).

   Albedo textures are sRGB; data textures (normal / roughness / masks) are linear. */
import * as THREE from 'three';

export const TEX = { aniso: 8, webgl2: true, facadeSize: 512 };
export function setMaxAnisotropy(renderer) { TEX.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy()); TEX.webgl2 = renderer.capabilities.isWebGL2; }

/** Deterministic PRNG. */
export function rng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/** Periodic value noise on an n×n lattice (tileable over [0,1)). */
export function periodicNoise(n, seed = 1) {
  const r = rng(seed), L = new Float32Array(n * n);
  for (let i = 0; i < L.length; i++) L[i] = r();
  return (u, v) => {
    const x = u * n, y = v * n;
    const xi = Math.floor(x), yi = Math.floor(y);
    let fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const i0 = ((xi % n) + n) % n, j0 = ((yi % n) + n) % n, i1 = (i0 + 1) % n, j1 = (j0 + 1) % n;
    const a = L[j0 * n + i0], b = L[j0 * n + i1], c = L[j1 * n + i0], d = L[j1 * n + i1];
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };
}
/** Tileable fBm built from periodic noises with doubling lattice sizes. */
export function periodicFbm(base, octaves, seed = 1, gain = 0.5) {
  const N = []; for (let o = 0; o < octaves; o++) N.push(periodicNoise(base << o, seed + o * 101));
  let norm = 0, a = 1; for (let o = 0; o < octaves; o++) { norm += a; a *= gain; }
  return (u, v) => { let s = 0, a2 = 1; for (let o = 0; o < octaves; o++) { s += a2 * N[o](u, v); a2 *= gain; } return s / norm; };
}

export function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function finish(t, { srgb, repeat = true, aniso = TEX.aniso, mips = true }) {
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = mips;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
/** Texture from a 2D canvas drawing. */
export function texFromCanvas(c, opts = {}) { return finish(new THREE.CanvasTexture(c), { srgb: true, ...opts }); }
/** RGBA8 data texture. */
export function texFromData(data, w, h, opts = {}) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  return finish(t, { srgb: false, ...opts });
}

/** Height field (Float32, w×h, tileable) → tangent-space normal map bytes (RGB) with optional A channel. */
export function heightToNormal(H, w, h, strength = 2, out = null, alpha = null) {
  const d = out || new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xm = (x - 1 + w) % w, xp = (x + 1) % w, ym = (y - 1 + h) % h, yp = (y + 1) % h;
    const dx = (H[y * w + xp] - H[y * w + xm]) * strength, dy = (H[yp * w + x] - H[ym * w + x]) * strength;
    const l = Math.hypot(dx, dy, 1);
    const k = (y * w + x) * 4;
    d[k] = (-dx / l * 0.5 + 0.5) * 255; d[k + 1] = (dy / l * 0.5 + 0.5) * 255; d[k + 2] = (1 / l * 0.5 + 0.5) * 255;
    d[k + 3] = alpha ? alpha[y * w + x] : 255;
  }
  return d;
}

/** Read a canvas back as a Float32 luminance height field (0..1). */
export function canvasHeight(c) {
  const w = c.width, h = c.height, px = c.getContext('2d').getImageData(0, 0, w, h).data, H = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) H[i] = (px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11) / 255;
  return H;
}

/** Draw `fn(x, y)` at every wrap offset so shapes crossing an edge tile seamlessly. */
export function wrapDraw(w, h, x, y, r, fn) {
  for (const ox of [0, -w, w]) for (const oy of [0, -h, h]) {
    const X = x + ox, Y = y + oy;
    if (X + r < 0 || X - r > w || Y + r < 0 || Y - r > h) continue;
    fn(X, Y);
  }
}

/** Ocean wave normal map: sum of sines with integer wave vectors (exactly tileable). */
export function waveNormalMap(size = 256, seed = 3) {
  const r = rng(seed), waves = [];
  for (let i = 0; i < 34; i++) {
    let kx, ky; do { kx = Math.round((r() - 0.5) * 22); ky = Math.round((r() - 0.5) * 22); } while (Math.hypot(kx, ky) < 2);
    const k = Math.hypot(kx, ky);
    // bias wave directions towards the prevailing south-westerly swell
    const dir = Math.abs((kx * 0.8 - ky * 0.6) / k);
    waves.push([kx, ky, (0.35 + dir) / Math.pow(k, 1.25), r() * Math.PI * 2]);
  }
  const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size; let h = 0;
    for (const [kx, ky, a, p] of waves) h += a * Math.sin((kx * u + ky * v) * Math.PI * 2 + p);
    H[y * size + x] = h;
  }
  return texFromData(heightToNormal(H, size, size, 1.6), size, size);
}
