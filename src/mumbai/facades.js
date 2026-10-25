/* Facade library: Mumbai building skins painted procedurally into two texture
   arrays (one layer per facade type), generated once with full mipmaps.

   Each layer is one bay × one storey, drawn in metres:
     A (sRGB)  rgb = albedo (wall areas neutral, tinted per building), a = tint mask
     B (linear) rg = normal xy, b = roughness, a = window mask (glass reflection + night lights)
   The material samples them with continuous wall UVs (metres / bay size), so the
   GPU filters every window and joint: no per-pixel hash patterns, no shimmer.
   Per-window variation (curtains, lit rooms) is faded to its average once a
   window is only a few pixels wide. */
import * as THREE from 'three';
import { rng, periodicFbm, canvas, TEX } from '../core/texgen.js';
import { fogUniforms } from './atmosphere.js';

/* Style ids stored in the geometry (fac.x). Kept stable for landmarks.js. */
export const STYLE = {
  roof: 0, residential: 1, glass: 2, deco: 3, heritage: 4, office: 5, chawl: 6, industrial: 7, bungalow: 8, tiles: 9, plain: 10,
  balcony: 11, stone: 12, lobby: 13, plainStone: 14, shop: 15, arcade: 16, concrete: 17,
};
/* Texture layers. */
export const LAYER = { resA: 0, resB: 1, deco: 2, heritage: 3, glass: 4, office: 5, chawl: 6, industrial: 7, bungalow: 8, shopA: 9, shopB: 10, arcade: 11, plain: 12, roof: 13, tiles: 14, lobby: 15, stone: 16, concrete: 17 };
const L = LAYER;
const NLAYERS = 18;
/* Bay width × storey height (m) each layer is drawn for. Geometry uses the same numbers. */
export const DIMS = {
  [STYLE.residential]: [3.4, 3.2], [STYLE.balcony]: [3.6, 3.2], [STYLE.glass]: [1.6, 3.9], [STYLE.deco]: [3.0, 3.3], [STYLE.heritage]: [3.8, 4.3],
  [STYLE.office]: [2.6, 3.7], [STYLE.chawl]: [3.0, 3.3], [STYLE.industrial]: [6.0, 5.0], [STYLE.bungalow]: [3.2, 3.4], [STYLE.plain]: [3, 3],
  [STYLE.roof]: [3, 3], [STYLE.tiles]: [1, 1], [STYLE.stone]: [3.8, 4.3], [STYLE.lobby]: [3.2, 4.2], [STYLE.plainStone]: [3, 3], [STYLE.shop]: [3.4, 3.6], [STYLE.arcade]: [3.8, 4.3],
  [STYLE.concrete]: [3, 3],
};
/* style → [upper layer, ground-floor layer (−1: none), ground floor has shop variants] */
const STYLE_LAYERS = {
  [STYLE.roof]: [L.roof, -1], [STYLE.residential]: [L.resA, L.shopA], [STYLE.glass]: [L.glass, L.lobby], [STYLE.deco]: [L.deco, L.shopA],
  [STYLE.heritage]: [L.heritage, L.arcade], [STYLE.office]: [L.office, L.lobby], [STYLE.chawl]: [L.chawl, L.shopA], [STYLE.industrial]: [L.industrial, -1],
  [STYLE.bungalow]: [L.bungalow, -1], [STYLE.tiles]: [L.tiles, -1], [STYLE.plain]: [L.plain, -1], [STYLE.balcony]: [L.resB, L.shopA],
  [STYLE.stone]: [L.heritage, -1], [STYLE.lobby]: [L.lobby, -1], [STYLE.plainStone]: [L.stone, -1], [STYLE.shop]: [L.shopA, L.shopA], [STYLE.arcade]: [L.arcade, L.arcade],
  [STYLE.concrete]: [L.concrete, -1],
};

/* ---------- painter: one shape → five channels ---------- */
class Painter {
  constructor(S, bw, fh) {
    this.S = S; this.bw = bw; this.fh = fh;
    this.ch = {};
    for (const k of ['alb', 'tint', 'hgt', 'rough', 'glass']) {
      const c = canvas(S), g = c.getContext('2d');
      g.setTransform(S / bw, 0, 0, -S / fh, 0, S);   // metres, y up from the floor line
      this.ch[k] = { c, g };
    }
  }
  rectPath(x, y, w, h) { const p = new Path2D(); p.rect(x, y, w, h); return p; }
  /** m: { c: albedo css, t: tint 0..1, h: height 0..1, r: roughness 0..1, g: glass 0..1 }. Omitted channels are left untouched. */
  fill(path, m) {
    const set = (k, v) => { if (v === undefined) return; const { g } = this.ch[k]; g.fillStyle = typeof v === 'number' ? `rgb(${v * 255 | 0},${v * 255 | 0},${v * 255 | 0})` : v; g.fill(path); };
    set('alb', m.c); set('tint', m.t); set('hgt', m.h); set('rough', m.r); set('glass', m.g);
  }
  rect(x, y, w, h, m) { this.fill(this.rectPath(x, y, w, h), m); }
  /** Albedo-only overlay with alpha (shading, dirt). */
  shade(path, css) { const { g } = this.ch.alb; g.fillStyle = css; g.fill(path); }
  shadeRect(x, y, w, h, css) { this.shade(this.rectPath(x, y, w, h), css); }
  gradRect(x, y, w, h, y0, y1, stops) {
    const { g } = this.ch.alb; const grd = g.createLinearGradient(0, y0, 0, y1);
    for (const [o, c] of stops) grd.addColorStop(o, c);
    g.fillStyle = grd; g.fillRect(x, y, w, h);
  }
}

const GLASS = { c: '#1d2428', t: 0, h: 0.05, r: 0.06, g: 1 };
const FRAME = { c: '#c9c8c2', t: 0, h: 0.5, r: 0.4, g: 0 };
const DARKFRAME = { c: '#2a2b2b', t: 0, h: 0.5, r: 0.45, g: 0 };
const WALL = { c: '#e6e6e6', t: 1, h: 0.35, r: 0.86, g: 0 };

/** Window: frame + glass + sliding mullion, recessed (h). */
function windowUnit(p, x, y, w, h, { frame = FRAME, mullions = 1, transom = 0, panes = null } = {}) {
  const f = 0.06;
  p.rect(x - 0.02, y - 0.02, w + 0.04, h + 0.04, { h: 0.1 });                     // reveal
  p.rect(x, y, w, h, frame);
  p.rect(x + f, y + f, w - 2 * f, h - 2 * f, GLASS);
  // a soft sky/room gradient in the glass albedo (reflection does the rest)
  p.gradRect(x + f, y + f, w - 2 * f, h - 2 * f, y, y + h, [[0, 'rgba(255,255,255,0.0)'], [1, 'rgba(160,180,195,0.10)']]);
  for (let k = 1; k <= mullions; k++) p.rect(x + w * k / (mullions + 1) - f / 2, y, f, h, frame);
  if (transom) p.rect(x, y + h * transom - f / 2, w, f, frame);
  if (panes) { const [nx, ny] = panes; for (let i = 1; i < nx; i++) p.rect(x + w * i / nx - 0.015, y, 0.03, h, frame); for (let j = 1; j < ny; j++) p.rect(x, y + h * j / ny - 0.015, w, 0.03, frame); }
  p.shadeRect(x, y + h - 0.12, w, 0.12, 'rgba(0,0,0,0.25)');                      // head shadow
}
function grille(p, x, y, w, h) {
  // Mumbai window grille box: iron bars standing proud of the wall
  const bar = { c: '#34312e', t: 0, h: 0.95, r: 0.55, g: 0 };
  const n = Math.round(w / 0.16);
  for (let i = 0; i <= n; i++) p.rect(x + i * w / n - 0.017, y, 0.034, h, bar);
  for (const fy of [0, 0.33, 0.66, 1]) p.rect(x, y + fy * h - 0.02, w, 0.04, bar);
  p.rect(x - 0.04, y - 0.06, w + 0.08, 0.08, { c: '#3a3633', t: 0, h: 0.95, r: 0.6, g: 0 });   // base plate
}
function ledge(p, x, y, w, h, light = 0.06) {
  p.rect(x, y, w, h, { t: 1, h: 1, r: 0.85, g: 0 });
  p.shadeRect(x, y + h * 0.55, w, h * 0.45, `rgba(255,255,255,${light})`);
  p.shadeRect(x, y - 0.1, w, 0.1, 'rgba(0,0,0,0.22)');   // shadow cast on the wall below
}

const LAYER_PAINT = {
  [L.resA](p, bw, fh) {           // mid-rise residential: window + grille box + concrete chajja
    p.rect(0, 0, bw, fh, WALL);
    p.rect(0, 0, bw, 0.16, { t: 1, h: 0.55, r: 0.85 });
    const ww = 1.8, wx = (bw - ww) / 2, wy = 0.95, wh = 1.35;
    windowUnit(p, wx, wy, ww, wh, { mullions: 1 });
    grille(p, wx - 0.06, wy - 0.02, ww + 0.12, wh + 0.1);
    ledge(p, wx - 0.3, wy + wh + 0.16, ww + 0.6, 0.12);
    p.rect(wx - 0.1, wy - 0.12, ww + 0.2, 0.08, { t: 1, h: 0.8 });                 // sill
  },
  [L.resB](p, bw, fh) {           // balcony bay: recessed loggia, parapet, glazed door
    p.rect(0, 0, bw, fh, WALL);
    const x0 = 0.35, x1 = bw - 0.35;
    p.rect(x0, 0.12, x1 - x0, fh - 0.42, { c: '#6a6660', t: 0.45, h: 0.0, r: 0.9 });  // loggia back wall (in shade)
    p.shadeRect(x0, fh - 0.75, x1 - x0, 0.45, 'rgba(0,0,0,0.35)');
    windowUnit(p, x0 + 0.45, 0.18, 1.1, 2.15, { mullions: 0, transom: 0.8 });
    windowUnit(p, x0 + 1.75, 0.95, 0.95, 1.25, { mullions: 1 });
    p.rect(x0 - 0.02, 0.12, x1 - x0 + 0.04, 1.0, { t: 1, h: 0.9, r: 0.85 });        // parapet
    p.rect(x0 - 0.06, 1.08, x1 - x0 + 0.12, 0.08, { t: 1, h: 1, r: 0.8 });
    p.shadeRect(x0, 1.0, x1 - x0, 0.06, 'rgba(255,255,255,0.08)');
    for (let i = 0; i < 4; i++) p.rect(x0 + 0.3 + i * 0.7, 1.16, 0.06, 0.06, { c: '#2f6b3a', t: 0, h: 1 });   // potted plants
  },
  [L.deco](p, bw, fh) {           // Marine Drive Art Deco: steel windows, eyebrow, speed lines
    p.rect(0, 0, bw, fh, WALL);
    const ww = 1.7, wx = (bw - ww) / 2;
    windowUnit(p, wx, 0.9, ww, 1.5, { frame: { c: '#3f4a48', t: 0, h: 0.5, r: 0.45 }, mullions: 0, panes: [3, 3] });
    ledge(p, 0, 2.62, bw, 0.13, 0.1);                         // eyebrow shade, continuous across bays
    for (const y of [2.86, 3.02]) p.rect(0, y, bw, 0.05, { t: 1, h: 0.75 });   // speed lines
    p.rect(wx - 0.08, 0.8, ww + 0.16, 0.1, { t: 1, h: 0.85 });
  },
  [L.heritage](p, bw, fh) {       // Indo-Gothic: ashlar stone, pointed arch window, string course
    p.rect(0, 0, bw, fh, { c: '#bcbcbc', t: 1, h: 0.4, r: 0.9 });
    const r = rng(41);
    for (let y = 0, row = 0; y < fh; y += 0.43, row++) {
      p.rect(0, y, bw, 0.025, { c: '#8c8478', t: 0.4, h: 0.15 });                  // bed joints
      for (let x = (row % 2) * 0.35; x < bw; x += 0.7) {
        p.rect(x, y, 0.022, 0.43, { c: '#8c8478', t: 0.4, h: 0.15 });
        p.shadeRect(x + 0.03, y + 0.03, 0.64, 0.38, `rgba(${r() < 0.5 ? '0,0,0' : '255,250,240'},${0.03 + r() * 0.05})`);
      }
    }
    const ww = 1.5, wx = (bw - ww) / 2, wy = 0.95, wh = 2.1;
    const arch = (x, y, w, h, inset) => {
      const q = new Path2D(); const cx = x + w / 2, sh = h - w * 0.75;
      q.moveTo(x + inset, y); q.lineTo(x + inset, y + sh);
      q.quadraticCurveTo(x + inset, y + h - inset * 0.5, cx, y + h - inset);
      q.quadraticCurveTo(x + w - inset, y + h - inset * 0.5, x + w - inset, y + sh);
      q.lineTo(x + w - inset, y); q.closePath(); return q;
    };
    p.fill(arch(wx - 0.18, wy - 0.05, ww + 0.36, wh + 0.3, 0), { c: '#d6c29e', t: 0, h: 0.85, r: 0.85 });   // sandstone surround
    p.fill(arch(wx, wy, ww, wh, 0), { c: '#5b5348', t: 0, h: 0.2, r: 0.7 });
    p.fill(arch(wx, wy, ww, wh, 0.07), GLASS);
    p.rect(wx + ww / 2 - 0.03, wy, 0.06, wh - 0.5, { c: '#5b5348', t: 0, h: 0.4 });
    p.rect(wx, wy + wh * 0.55, ww, 0.05, { c: '#5b5348', t: 0, h: 0.4 });
    p.rect(wx - 0.25, wy - 0.16, ww + 0.5, 0.14, { c: '#d6c29e', t: 0, h: 1 });      // sill
    p.rect(0, fh - 0.3, bw, 0.22, { c: '#d6c29e', t: 0, h: 1, r: 0.85 });            // string course
    p.shadeRect(0, fh - 0.4, bw, 0.1, 'rgba(0,0,0,0.25)');
  },
  [L.glass](p, bw, fh) {          // curtain wall: tinted glass, aluminium mullions, spandrel
    p.rect(0, 0, bw, fh, { c: '#5e7684', t: 1, h: 0.2, r: 0.05, g: 1 });
    p.rect(0, 0, bw, 0.95, { c: '#465a66', t: 1, h: 0.25, r: 0.25, g: 0.35 });       // spandrel (opaque glass)
    p.gradRect(0, 0.95, bw, fh - 0.95, 0.95, fh, [[0, 'rgba(255,255,255,0.02)'], [1, 'rgba(255,255,255,0.10)']]);
    const al = { c: '#a7aaab', t: 0, h: 0.8, r: 0.35, g: 0 };
    p.rect(0, 0, 0.07, fh, al); p.rect(bw - 0.035, 0, 0.035, fh, al);
    p.rect(0, 0.92, bw, 0.06, al); p.rect(0, fh - 0.04, bw, 0.04, al);
  },
  [L.office](p, bw, fh) {         // ribbon windows over concrete bands
    p.rect(0, 0, bw, fh, { c: '#c8c8c8', t: 1, h: 0.6, r: 0.88 });
    p.rect(0, 1.0, bw, fh - 1.25, { c: '#2a3338', t: 0, h: 0.05, r: 0.07, g: 1 });
    p.rect(0, 1.0, 0.08, fh - 1.25, { c: '#7d8285', t: 0, h: 0.4, r: 0.4 });
    p.shadeRect(0, fh - 0.4, bw, 0.12, 'rgba(0,0,0,0.3)');
    p.rect(0, 0.93, bw, 0.07, { t: 1, h: 0.9 });
  },
  [L.chawl](p, bw, fh) {          // open corridor (gallery) with doors and an iron railing
    p.rect(0, 0, bw, fh, WALL);
    p.rect(0, 0.18, bw, fh - 0.38, { c: '#8a847a', t: 0.6, h: 0.0, r: 0.9 });          // back wall in the gallery's shade
    p.shadeRect(0, fh - 0.75, bw, 0.55, 'rgba(0,0,0,0.3)');
    p.rect(0.5, 0.18, 0.95, 2.1, { c: '#5a3b26', t: 0, h: 0.1, r: 0.7, g: 0.25 });     // wooden door
    p.rect(0.56, 0.24, 0.83, 1.98, { c: '#6b4630', t: 0, h: 0.15 });
    windowUnit(p, 1.85, 1.0, 0.8, 1.0, { frame: { c: '#3b5a6a', t: 0, h: 0.4, r: 0.5 }, mullions: 1 });
    const bar = { c: '#2d3a40', t: 0, h: 1, r: 0.5 };
    p.rect(0, 0.18, bw, 0.06, bar); p.rect(0, 1.02, bw, 0.06, bar);
    for (let x = 0.05; x < bw; x += 0.12) p.rect(x, 0.18, 0.025, 0.86, bar);
    p.rect(0, 0, bw, 0.18, { t: 1, h: 1, r: 0.85 });                                    // gallery slab edge
  },
  [L.industrial](p, bw, fh) {     // painted brick shed: pilasters, high steel windows
    p.rect(0, 0, bw, fh, { c: '#c4c0ba', t: 1, h: 0.35, r: 0.9 });
    for (let y = 0; y < fh; y += 0.15) p.rect(0, y, bw, 0.012, { h: 0.25 });
    p.rect(0, 0, 0.45, fh, { t: 1, h: 0.75 });
    windowUnit(p, 1.1, 3.0, bw - 1.9, 1.3, { frame: DARKFRAME, mullions: 0, panes: [6, 3] });
    p.rect(1.6, 0, 2.8, 2.6, { c: '#4d5a5e', t: 0, h: 0.2, r: 0.55 });               // roller door
    for (let y = 0.1; y < 2.6; y += 0.09) p.rect(1.6, y, 2.8, 0.025, { c: '#3d474a', h: 0.1 });
  },
  [L.bungalow](p, bw, fh) {       // Bandra cottage: lime-washed wall, louvred shutters
    p.rect(0, 0, bw, fh, WALL);
    const ww = 1.1, wx = (bw - ww) / 2, wy = 0.85, wh = 1.55;
    windowUnit(p, wx, wy, ww, wh, { frame: { c: '#f2efe8', t: 0, h: 0.5, r: 0.5 }, panes: [2, 3] });
    const sh = { c: '#2f6658', t: 0, h: 0.6, r: 0.6 };
    for (const sx of [wx - 0.58, wx + ww + 0.04]) {
      p.rect(sx, wy, 0.54, wh, sh);
      for (let y = wy + 0.08; y < wy + wh - 0.05; y += 0.09) p.shadeRect(sx + 0.04, y, 0.46, 0.035, 'rgba(0,0,0,0.25)');
    }
    p.rect(wx - 0.62, wy + wh + 0.1, ww + 1.24, 0.1, { t: 1, h: 0.9 });
  },
  [L.shopA](p, bw, fh) {          // ground-floor shop: rolling shutter half up, goods inside
    p.rect(0, 0, bw, fh, WALL);
    const x0 = 0.28, x1 = bw - 0.28, top = Math.min(fh - 0.8, 2.75);
    p.rect(x0, 0, x1 - x0, top, { c: '#2b2723', t: 0, h: 0.0, r: 0.9, g: 0.85 });    // interior (lit at night)
    const r = rng(7);
    for (let i = 0; i < 26; i++) {                                                      // shelves of goods
      const gx = x0 + 0.1 + r() * (x1 - x0 - 0.4), gy = 0.5 + Math.floor(r() * 4) * 0.42, w = 0.12 + r() * 0.3;
      p.rect(gx, gy, w, 0.2 + r() * 0.12, { c: ['#8a3b2f', '#c49a3c', '#3c6a8a', '#d7d0c0', '#5b7a3a', '#a85a32'][i % 6], g: 0.6 });
    }
    for (let k = 0; k < 4; k++) p.rect(x0, 0.45 + k * 0.42, x1 - x0, 0.03, { c: '#4a4038', g: 0.6 });
    p.gradRect(x0, 0, x1 - x0, top, 0, top, [[0, 'rgba(0,0,0,0.0)'], [1, 'rgba(0,0,0,0.45)']]);
    const sy = top - 0.75;                                                               // shutter, rolled most of the way up
    p.rect(x0, sy, x1 - x0, top - sy, { c: '#8d918f', t: 0, h: 0.55, r: 0.45, g: 0 });
    for (let y = sy; y < top; y += 0.07) p.rect(x0, y, x1 - x0, 0.02, { c: '#6f7371', h: 0.35 });
    p.rect(x0 - 0.02, top, x1 - x0 + 0.04, 0.22, { c: '#55524d', t: 0, h: 0.9, r: 0.6 }); // shutter box
    p.rect(0, 0, x0, fh, { t: 1, h: 0.6 }); p.rect(x1, 0, bw - x1, fh, { t: 1, h: 0.6 });
    p.rect(0, 0, bw, 0.12, { c: '#77736c', t: 0, h: 0.6, r: 0.9 });                     // step
  },
  [L.shopB](p, bw, fh) {          // glazed shopfront
    p.rect(0, 0, bw, fh, WALL);
    const x0 = 0.25, x1 = bw - 0.25, top = Math.min(fh - 0.7, 2.9);
    p.rect(x0, 0, x1 - x0, top, { c: '#262a2c', t: 0, h: 0.4, r: 0.4 });
    p.rect(x0 + 0.06, 0.45, x1 - x0 - 0.12, top - 0.55, { c: '#30363a', t: 0, h: 0.05, r: 0.06, g: 1 });
    p.rect(x0 + 0.06, 0.06, x1 - x0 - 0.12, 0.38, { c: '#3a3836', t: 0, h: 0.3, r: 0.6 });
    p.rect((bw - 0.06) / 2, 0, 0.06, top, { c: '#262a2c', h: 0.4 });
    const r = rng(9);
    for (let i = 0; i < 10; i++) p.rect(x0 + 0.2 + r() * (x1 - x0 - 0.6), 0.5 + r() * 1.2, 0.2 + r() * 0.25, 0.25 + r() * 0.4, { c: ['#c8b89a', '#7f2f2a', '#e6e0d4', '#3d5a74'][i % 4], g: 1, r: 0.5 });
    p.rect(0, 0, bw, 0.1, { c: '#77736c', t: 0, h: 0.6, r: 0.9 });
  },
  [L.arcade](p, bw, fh) {         // Fort colonnade: round arches in stone, shaded walkway
    p.rect(0, 0, bw, fh, { c: '#bdbdbd', t: 1, h: 0.45, r: 0.9 });
    const q = new Path2D(); const x0 = 0.45, x1 = bw - 0.45, sp = fh - 0.85, rr = (x1 - x0) / 2;
    q.moveTo(x0, 0); q.lineTo(x0, sp - rr); q.arc((x0 + x1) / 2, sp - rr, rr, Math.PI, 0, true); q.lineTo(x1, 0); q.closePath();
    p.fill(q, { c: '#3b3631', t: 0, h: 0.0, r: 0.9, g: 0.5 });
    p.gradRect(x0, 0, x1 - x0, sp, 0, sp, [[0, 'rgba(60,50,40,0.0)'], [1, 'rgba(0,0,0,0.5)']]);
    p.rect(x0 + 0.5, 0, x1 - x0 - 1.0, 2.2, { c: '#2d2b29', g: 0.9 });                // shop door deep inside
    p.rect(0, sp + 0.1, bw, 0.18, { c: '#d6c29e', t: 0, h: 1 });
  },
  [L.plain](p, bw, fh) { p.rect(0, 0, bw, fh, WALL); },
  [L.concrete](p, bw, fh) {
    p.rect(0, 0, bw, fh, { c: '#bdbcb8', t: 1, h: 0.3, r: 0.9 });
    for (let y = 0; y <= fh; y += 1.5) p.rect(0, y - 0.01, bw, 0.02, { h: 0.1 });
    for (let x = 0; x <= bw; x += 1.5) p.rect(x - 0.01, 0, 0.02, fh, { h: 0.1 });
  },
  [L.roof](p, bw, fh) {           // flat concrete roof with bitumen patches
    p.rect(0, 0, bw, fh, { c: '#9a9893', t: 1, h: 0.3, r: 0.95 });
    const r = rng(5);
    for (let i = 0; i < 6; i++) p.shadeRect(r() * bw, r() * fh, 0.3 + r() * 1.2, 0.3 + r() * 1.0, 'rgba(30,30,30,0.18)');
    p.rect(0, 0, bw, 0.03, { c: '#55524e', h: 0.2 }); p.rect(0, 0, 0.03, fh, { c: '#55524e', h: 0.2 });
  },
  [L.tiles](p, bw, fh) {          // Mangalore clay tiles (1 m tile)
    p.rect(0, 0, bw, fh, { c: '#a85638', t: 0.35, h: 0.3, r: 0.75 });
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) {
      const x = i * 0.25 + (row % 2) * 0.125, y = row / 3;
      const q = new Path2D(); q.ellipse(x + 0.125, y + 0.17, 0.11, 0.17, 0, 0, Math.PI * 2);
      p.fill(q, { c: i % 3 ? '#b2603f' : '#9c4c31', h: 0.85 });
      p.shadeRect(x, y, 0.25, 0.04, 'rgba(0,0,0,0.25)');
    }
    for (let i = 0; i <= 4; i++) { const q = new Path2D(); q.ellipse(i * 0.25 - 0.125 + 0.125, 0.5, 0.11, 0.5, 0, 0, Math.PI * 2); }
  },
  [L.lobby](p, bw, fh) {          // tower lobby: tall glazing in a dark frame
    p.rect(0, 0, bw, fh, { c: '#3c4042', t: 0, h: 0.6, r: 0.4 });
    p.rect(0.12, 0.1, bw - 0.24, fh - 0.5, { c: '#2a3236', t: 0, h: 0.05, r: 0.06, g: 1 });
    p.rect(bw / 2 - 0.03, 0.1, 0.06, fh - 0.5, { c: '#3c4042', h: 0.5 });
    p.rect(0, 2.6, bw, 0.05, { c: '#3c4042', h: 0.5 });
  },
  [L.stone](p, bw, fh) {          // dressed basalt
    p.rect(0, 0, bw, fh, { c: '#bdbdbd', t: 1, h: 0.4, r: 0.9 });
    const r = rng(77);
    for (let y = 0, row = 0; y < fh; y += 0.5, row++) {
      p.rect(0, y, bw, 0.03, { c: '#6f6a62', t: 0.3, h: 0.1 });
      for (let x = (row % 2) * 0.5; x < bw; x += 1.0) {
        p.rect(x, y, 0.03, 0.5, { c: '#6f6a62', t: 0.3, h: 0.1 });
        p.shadeRect(x + 0.04, y + 0.04, 0.92, 0.42, `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + r() * 0.06})`);
      }
    }
  },
};
const LAYER_DIMS = {
  [L.resA]: DIMS[STYLE.residential], [L.resB]: DIMS[STYLE.balcony], [L.deco]: DIMS[STYLE.deco], [L.heritage]: DIMS[STYLE.heritage], [L.glass]: DIMS[STYLE.glass],
  [L.office]: DIMS[STYLE.office], [L.chawl]: DIMS[STYLE.chawl], [L.industrial]: DIMS[STYLE.industrial], [L.bungalow]: DIMS[STYLE.bungalow],
  [L.shopA]: [3.4, 3.6], [L.shopB]: [3.4, 3.6], [L.arcade]: DIMS[STYLE.arcade], [L.plain]: [3, 3], [L.roof]: [3, 3], [L.tiles]: [1, 1],
  [L.lobby]: DIMS[STYLE.lobby], [L.stone]: [3, 3], [L.concrete]: [3, 3],
};

let CACHE = null;
/** Paint all layers and pack them into two RGBA8 texture arrays (with mipmaps). */
export function facadeTextures(S = 512) {
  if (CACHE && CACHE.S === S) return CACHE;
  const A = new Uint8Array(S * S * 4 * NLAYERS), B = new Uint8Array(S * S * 4 * NLAYERS);
  // shared plaster noise fields (computed once, reused by every layer)
  const grainF = periodicFbm(16, 4, 3), blotchF = periodicFbm(3, 3, 8);
  const GR = new Float32Array(S * S), BL = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { GR[y * S + x] = grainF(x / S, y / S); BL[y * S + x] = blotchF(x / S, y / S); }
  const H = new Float32Array(S * S);
  for (let layer = 0; layer < NLAYERS; layer++) {
    const [bw, fh] = LAYER_DIMS[layer];
    const p = new Painter(S, bw, fh);
    LAYER_PAINT[layer](p, bw, fh, S);
    const get = k => p.ch[k].g.getImageData(0, 0, S, S).data;
    const alb = get('alb'), tint = get('tint'), hgt = get('hgt'), rough = get('rough'), glass = get('glass');
    const pxPerM = S / bw;
    // canvas row 0 is the top of the tile; texture row 0 must be v = 0 (bottom)
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const src = ((S - 1 - y) * S + x) * 4;
      const t = tint[src] / 255;
      const gr = GR[y * S + x], bl = BL[y * S + x];
      H[y * S + x] = hgt[src] / 255 + (gr - 0.5) * 0.05 * t;
      const k = (layer * S * S + y * S + x) * 4;
      // plaster: fine grain + broad blotches on tinted (wall) areas only
      const var1 = 1 + ((gr - 0.5) * 0.12 + (bl - 0.5) * 0.16) * t;
      A[k] = Math.min(255, alb[src] * var1); A[k + 1] = Math.min(255, alb[src + 1] * var1); A[k + 2] = Math.min(255, alb[src + 2] * var1);
      A[k + 3] = tint[src];
      B[k + 2] = Math.min(255, Math.max(0, rough[src] + (gr - 0.5) * 20 * t));
      B[k + 3] = glass[src];
    }
    // normals from the height field (relief in metres ≈ 0.12 × height value)
    const relief = 0.12 * pxPerM * 0.5;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const xm = (x - 1 + S) % S, xp = (x + 1) % S, ym = (y - 1 + S) % S, yp = (y + 1) % S;
      const dx = (H[y * S + xp] - H[y * S + xm]) * relief, dy = (H[yp * S + x] - H[ym * S + x]) * relief * (bw / fh);
      const l = Math.hypot(dx, dy, 1);
      const k = (layer * S * S + y * S + x) * 4;
      B[k] = (-dx / l * 0.5 + 0.5) * 255; B[k + 1] = (-dy / l * 0.5 + 0.5) * 255;
    }
  }
  const mk = (data, srgb) => {
    const t = new THREE.DataArrayTexture(data, S, S, NLAYERS);
    t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  CACHE = { S, A: mk(A, true), B: mk(B, false), grime: grimeTexture() };
  return CACHE;
}

/** Monsoon weathering: vertical rain streaks (1 = clean). Tileable, 256². */
function grimeTexture() {
  const S = 256, c = canvas(S), g = c.getContext('2d'), r = rng(99);
  g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) {
    const x = r() * S, y = r() * S, w = 1 + r() * 4, h = 20 + r() * 110, a = 0.04 + r() * 0.1;
    const grd = g.createLinearGradient(0, y, 0, y + h);
    grd.addColorStop(0, `rgba(60,55,45,${a})`); grd.addColorStop(1, 'rgba(60,55,45,0)');
    g.fillStyle = grd;
    for (const ox of [0, -S, S]) for (const oy of [0, -S]) g.fillRect(x + ox, y + oy, w, h);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/* ---------- material ---------- */
const layerTable = () => {
  const a = [];
  for (let s = 0; s < 24; s++) { const e = STYLE_LAYERS[s] || [L.plain, -1]; a.push(new THREE.Vector2(e[0], e[1])); }
  return a;
};

/** Facade material. nightU: shared {value} 0..1. Geometry attributes: fuv (m), fac [style, storey h, bay w, seed], ftan, ftint. */
export function facadeMaterial(nightU, { size = TEX.facadeSize || 512, webgl2 = TEX.webgl2 !== false } = {}) {
  if (!webgl2) return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const T = facadeTextures(size);
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
  const U = { uFacA: { value: T.A }, uFacB: { value: T.B }, uGrime: { value: T.grime }, uLayers: { value: layerTable() }, uNight: nightU };
  m.onBeforeCompile = sh => {
    fogUniforms(sh);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 fuv; attribute vec4 fac; attribute vec3 ftan; attribute vec3 ftint;
        varying vec2 vFuv; varying vec4 vFac; varying vec3 vTan; varying vec3 vTint;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vFuv = fuv; vFac = fac; vTint = ftint; vTan = normalize(normalMatrix * ftan);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        precision highp sampler2DArray;
        uniform sampler2DArray uFacA, uFacB; uniform sampler2D uGrime; uniform vec2 uLayers[24]; uniform float uNight;
        varying vec2 vFuv; varying vec4 vFac; varying vec3 vTan; varying vec3 vTint;
        float gGlass, gRough, gLit, gVis; vec2 gN; vec3 gLitCol, gBounce;`)
      .replace('#include <map_fragment>', `
        float style = floor(vFac.x + 0.5), fh = vFac.y, bw = vFac.z, seed = floor(vFac.w + 0.5);   // rounded: varyings jitter
        vec2 lay = uLayers[int(style)];
        vec2 tuv = vec2(vFuv.x / bw, vFuv.y / fh);
        float fl = floor(tuv.y);
        float sh1 = fract(seed * 0.618034), sh2 = fract(seed * 0.381966 + 0.27);
        float layer = lay.x;
        if (lay.y >= 0.0 && fl < 0.5) {
          bool shopStyle = lay.y == 9.0;
          if (!shopStyle || sh1 > 0.25) layer = shopStyle ? lay.y + step(0.62, sh2) : lay.y;
        }
        vec4 tA = texture(uFacA, vec3(tuv, layer));
        vec4 tB = texture(uFacB, vec3(tuv, layer));
        vec2 cell = floor(tuv);
        float rnd = fract(sin(dot(cell + seed * 0.0137, vec2(12.9898, 78.233))) * 43758.5453);
        vec2 dd = fwidth(tuv);
        gVis = 1.0 - smoothstep(0.1, 0.4, max(dd.x, dd.y));     // per-window variation fades with distance
        vec3 alb = mix(tA.rgb, tA.rgb * vTint * 1.25, tA.a);
        // weathering: rain streaks + splash dirt at the base, varied per building
        float dirt = 0.35 + 0.65 * fract(seed * 0.7131);
        float streak = texture(uGrime, vFuv / vec2(19.0, 27.0) + vec2(seed * 0.173, 0.0)).r;
        alb *= mix(1.0, streak, dirt * (1.0 - tB.a * 0.7));
        alb *= 1.0 - 0.22 * dirt * (1.0 - smoothstep(0.0, 1.6, vFuv.y)) * step(0.5, abs(vFac.x - 0.0));
        gGlass = tB.a;
        // windows: some with curtains or blinds drawn
        float curtain = step(0.7, rnd) * gGlass * gVis * step(0.5, fl) * (1.0 - tA.a);
        alb = mix(alb, vec3(0.62, 0.55, 0.45) * (0.7 + 0.5 * fract(rnd * 7.0)), curtain * 0.75);
        diffuseColor.rgb *= alb;
        gRough = mix(tB.b, 0.55, curtain);
        gN = tB.rg * 2.0 - 1.0;
        float lit = mix(0.34, step(0.66, fract(rnd * 3.17 + seed * 0.01)), gVis);
        gLit = gGlass * lit * uNight;
        gLitCol = mix(vec3(1.0, 0.72, 0.42), vec3(0.9, 0.92, 1.0), step(0.85, fract(rnd * 5.3)) * gVis);
        // ground-floor shops and arcades: warm, dimmer, mostly open in the evening
        if (fl < 0.5 && lay.y >= 0.0) { gLitCol = vec3(1.0, 0.64, 0.34) * 0.3; gLit = gGlass * uNight * mix(0.7, step(0.3, rnd), gVis); }
        // street-light bounce on the lower storeys at night
        gBounce = alb * vec3(1.0, 0.62, 0.32) * uNight * 0.05 * (1.0 - smoothstep(3.0, 16.0, vFuv.y));`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
      .replace('#include <normal_fragment_maps>', `
        {
          vec3 tN = vec3(gN, sqrt(max(0.0, 1.0 - dot(gN, gN))));
          vec3 Tv = normalize(vTan - normal * dot(normal, vTan));
          vec3 Bv = cross(Tv, normal);
          normal = normalize(Tv * tN.x + Bv * tN.y + normal * tN.z);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += gLitCol * gLit * 0.8 + gBounce;`);
  };
  m.customProgramCacheKey = () => 'facade-v2';
  return m;
}

/* ---------- geometry ---------- */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };

/** Geometry accumulator for facades (indexed; winding fixed to the intended normal). */
export class FacadeBuilder {
  constructor() { this.P = []; this.N = []; this.C = []; this.U = []; this.F = []; this.T = []; this.I = []; this.n = 0; }
  vert(p, n, col, uv, fac, tan = [1, 0, 0]) {
    this.P.push(p[0], p[1], p[2]); this.N.push(n[0], n[1], n[2]); this.C.push(col.r, col.g, col.b);
    this.U.push(uv[0], uv[1]); this.F.push(fac[0], fac[1], fac[2], fac[3]); this.T.push(tan[0], tan[1], tan[2]); return this.n++;
  }
  tri3(i0, i1, i2, n) {
    const a = this.P.slice(i0 * 3, i0 * 3 + 3), b = this.P.slice(i1 * 3, i1 * 3 + 3), c = this.P.slice(i2 * 3, i2 * 3 + 3);
    if (dot(cross(sub(b, a), sub(c, a)), n) >= 0) this.I.push(i0, i1, i2); else this.I.push(i0, i2, i1);
  }
  quad(a, b, c, d, nrm, col, uvs, fac, tan) {
    const t = tan || norm(sub(b, a));
    const i = [a, b, c, d].map((p, k) => this.vert(p, nrm, col, uvs[k], fac, t));
    this.tri3(i[0], i[1], i[2], nrm); this.tri3(i[0], i[2], i[3], nrm);
  }
  /** Vertical wall from (x0,z0) to (x1,z1); outward normal on the right of the direction of travel. */
  wall(x0, z0, x1, z1, y0, y1, col, fac, u0 = 0, vBase = 0) {
    const L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.01) return;
    const n = [(z1 - z0) / L, 0, -(x1 - x0) / L], t = [(x1 - x0) / L, 0, (z1 - z0) / L];
    this.quad([x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], n, col,
      [[u0, vBase], [u0 + L, vBase], [u0 + L, vBase + y1 - y0], [u0, vBase + y1 - y0]], fac, t);
  }
  cap(pts, y, col, fac, down = false) {
    const n = [0, down ? -1 : 1, 0];
    const ids = pts.map(([x, z]) => this.vert([x, y, z], n, col, [x, z], fac, [1, 0, 0]));
    for (let i = 1; i < ids.length - 1; i++) this.tri3(ids[0], ids[i], ids[i + 1], n);
  }
  /** Extruded footprint. Bays are centred on each straight wall; smooth curves keep a continuous u. */
  prism(pts, y0, y1, col, fac, roofCol, roofFac, vBase = 0, { inward = false } = {}) {
    const N = pts.length, bw = fac[2] || 3;
    const dir = i => { const a = pts[i], b = pts[(i + 1) % N]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l, l]; };
    // group edges into runs separated by sharp corners
    const sharp = i => { const p = dir((i - 1 + N) % N), q = dir(i); return p[0] * q[0] + p[1] * q[1] < 0.87; };
    let start = 0; for (let i = 0; i < N; i++) if (sharp(i)) { start = i; break; }
    const runs = []; let cur = null;
    for (let k = 0; k < N; k++) { const i = (start + k) % N; if (!cur || sharp(i)) runs.push(cur = []); cur.push(i); }
    for (const run of runs) {
      const len = run.reduce((s, i) => s + dir(i)[2], 0);
      let u = -(len - Math.floor(len / bw + 1e-6) * bw) / 2;
      for (const i of run) {
        const a = pts[i], b = pts[(i + 1) % N];
        if (inward) this.wall(b[0], b[1], a[0], a[1], y0, y1, col, fac, u, vBase);
        else this.wall(a[0], a[1], b[0], b[1], y0, y1, col, fac, u, vBase);
        u += dir(i)[2];
      }
    }
    if (roofCol) this.cap(pts, y1, roofCol, roofFac || [STYLE.roof, 3, 3, fac[3]]);
  }
  /** Horizontal band (cornice, floor ledge) proud of the footprint `pts` (already offset by the caller). */
  band(pts, y0, y1, col, fac) {
    this.prism(pts, y0, y1, col, fac, col, fac);
    this.cap(pts, y0, col, fac, true);
  }
  /** Gable roof over a rectangle; ridge along the longer side. */
  gable(cx, cz, hx, hz, rot, y0, rise, col, fac, endCol) {
    if (hz > hx) return this.gable(cx, cz, hz, hx, rot + Math.PI / 2, y0, rise, col, fac, endCol);
    const c = Math.cos(rot), s = Math.sin(rot);
    const T = (x, z, y) => [cx + x * c + z * s, y, cz - x * s + z * c];
    const ex = hx + 0.6, ez = hz + 0.7;
    const A = T(-ex, -ez, y0), B = T(ex, -ez, y0), C = T(ex, 0, y0 + rise), D = T(-ex, 0, y0 + rise), E = T(ex, ez, y0), F = T(-ex, ez, y0);
    let n1 = norm(cross(sub(B, A), sub(D, A))); if (n1[1] < 0) n1 = n1.map(v => -v);
    let n2 = norm(cross(sub(E, F), sub(D, F))); if (n2[1] < 0) n2 = n2.map(v => -v);
    const slope = Math.hypot(ez, rise);
    const tx = norm(sub(B, A));
    this.quad(A, B, C, D, n1, col, [[0, 0], [ex * 2, 0], [ex * 2, slope], [0, slope]], fac, tx);
    this.quad(E, F, D, C, n2, col, [[0, 0], [ex * 2, 0], [ex * 2, slope], [0, slope]], fac, tx.map(v => -v));
    const ec = endCol || new THREE.Color(0.9, 0.88, 0.84);
    for (const sx of [-1, 1]) {
      const a = T(sx * hx, -hz, y0), b2 = T(sx * hx, hz, y0), ap = T(sx * hx, 0, y0 + rise);
      const out = norm([c * sx, 0, -s * sx]);
      const t2 = [-out[2], 0, out[0]];
      const f2 = [STYLE.plain, 3, 3, 0];
      const i0 = this.vert(a, out, ec, [0, 0], f2, t2), i1 = this.vert(b2, out, ec, [2 * hz, 0], f2, t2), i2 = this.vert(ap, out, ec, [hz, rise], f2, t2);
      this.tri3(i0, i1, i2, out);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('ftint', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('color', g.getAttribute('ftint'));      // WebGL1 fallback material uses vertex colours
    g.setAttribute('fuv', new THREE.Float32BufferAttribute(this.U, 2));
    g.setAttribute('fac', new THREE.Float32BufferAttribute(this.F, 4));
    g.setAttribute('ftan', new THREE.Float32BufferAttribute(this.T, 3));
    g.setIndex(this.I);
    g.computeBoundingSphere();
    return g;
  }
}

/** Rectangle footprint, optionally with rounded corners on the +z side (Art Deco street corners). */
export function rectPts(cx, cz, hx, hz, rot, chamfer = 0) {
  const c = Math.cos(rot), s = Math.sin(rot);
  let local;
  if (chamfer > 0) {
    const k = Math.min(chamfer, hx * 0.45, hz * 0.45);
    local = [[-hx, -hz], [hx, -hz]];
    const arc = (ax, az, a0) => { for (let i = 0; i <= 6; i++) { const a = a0 + i / 6 * Math.PI / 2; local.push([ax + Math.cos(a) * k, az + Math.sin(a) * k]); } };
    arc(hx - k, hz - k, 0);
    arc(-hx + k, hz - k, Math.PI / 2);
  } else local = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
  return local.map(([x, z]) => [cx + x * c + z * s, cz - x * s + z * c]);
}
