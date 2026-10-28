/* The page's backdrop: Mumbai GP's flight down Marine Drive (frames from tools/reel/capture.mjs),
   fixed behind the content and advanced by scroll — neon line art at the top of the page, rendered
   city by the end. Also drives the chapter rail.

   Markup: <canvas id="city"> and <div id="veil"> fixed behind the page; any element with
   data-frame="n" (and optional data-veil="0–1") is a keyframe; <nav class="rail"> links the chapters.

   Kept cheap so scrolling stays smooth at 60 Hz:
   - frames are fetched once as compressed files, and only the ones near the scroll position are
     decoded, off the main thread (createImageBitmap), so drawing never waits on a decode;
   - the canvas is no bigger than the frames themselves (the compositor scales it up for free);
   - the DOM is only touched when something actually changes. */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;

/** Load order that fills the timeline coarse-to-fine, so any scroll position has a frame early. */
function bisectOrder(n) {
  const out = [0, n - 1], seen = new Set(out);
  for (let step = n; step >= 1; step = Math.floor(step / 2)) {
    for (let i = 0; i < n; i += step) if (!seen.has(i)) { seen.add(i); out.push(i); }
    if (step === 1) break;
  }
  return out;
}

const canvas = document.getElementById('city');
const veil = document.getElementById('veil');
const keys = [...document.querySelectorAll('[data-frame]')];
const rail = document.querySelector('.rail');
const railLinks = rail ? [...rail.querySelectorAll('a')] : [];
const chapters = railLinks.map(a => document.querySelector(a.getAttribute('href')));
const fill = rail && rail.querySelector('.fill');

const N = 120, SRC = 'assets/reel';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const conn = navigator.connection || {};
const slow = conn.saveData || /(^|-)2g|3g/.test(conn.effectiveType || '');
const res = innerWidth * Math.min(devicePixelRatio || 1, 2) > 900 && !slow ? 'd' : 'm';
const SW = res === 'd' ? 1280 : 640, SH = res === 'd' ? 720 : 360;   // frame size
const g = canvas && canvas.getContext('2d', { alpha: false });
const canBitmap = typeof createImageBitmap === 'function';

/* ---------- frames: compressed files for all, decoded bitmaps for a window around the scroll position ---------- */
const files = new Array(N).fill(null);    // Blob (or a decoded <img> where createImageBitmap is missing)
const bitmaps = new Map();                // index → ImageBitmap
const decoding = new Set();
const WIN = 6;                            // decode this many frames either side of the current one
let drawn = -1, want = 0;

function fetchAll() {
  const order = bisectOrder(N);
  let next = 0, active = 0;
  const pump = () => {
    while (active < 6 && next < order.length) {
      const i = order[next++], u = `${SRC}/${res}/${String(i).padStart(3, '0')}.webp`;
      active++;
      const done = () => { active--; pump(); };
      if (canBitmap) fetch(u).then(r => r.blob()).then(b => { files[i] = b; if (Math.abs(i - want) <= WIN) decodeWindow(); else if (drawn < 0) decode(i); }).catch(() => {}).finally(done);
      else { const im = new Image(); im.onload = () => { (im.decode ? im.decode() : Promise.resolve()).catch(() => {}).then(() => { files[i] = im; bitmaps.set(i, im); schedule(); done(); }); }; im.onerror = done; im.src = u; }
    }
  };
  pump();
}
function decode(i) {
  if (!canBitmap || bitmaps.has(i) || decoding.has(i) || !files[i]) return;
  decoding.add(i);
  createImageBitmap(files[i]).then(b => {
    decoding.delete(i);
    if (Math.abs(i - want) > WIN * 2 && drawn >= 0) { b.close(); return; }   // scrolled away meanwhile
    bitmaps.set(i, b); schedule();
  }).catch(() => decoding.delete(i));
}
function decodeWindow() {
  if (!canBitmap) return;
  for (let d = 0; d <= WIN; d++) { decode(want + d); decode(want - d); }
  for (const [i, b] of bitmaps) if (Math.abs(i - want) > WIN * 2 && i !== drawn) { b.close(); bitmaps.delete(i); }
}
function nearest(i) {
  for (let d = 0; d < N; d++) {
    if (bitmaps.has(i - d)) return i - d;
    if (bitmaps.has(i + d)) return i + d;
  }
  return -1;
}

/* ---------- canvas: sized to the frames, not the screen ---------- */
let cw = 0, ch = 0;
function size() {
  const vw = innerWidth, vh = innerHeight;
  const cover = Math.max(vw / SW, vh / SH);           // screen pixels per frame pixel
  const k = clamp(1 / cover, 0.5, Math.min(devicePixelRatio || 1, 2));
  cw = Math.round(vw * k); ch = Math.round(vh * k);
  canvas.width = cw; canvas.height = ch;
  drawn = -1;
}
function draw() {
  const j = nearest(want);
  if (j < 0 || j === drawn) return;
  const im = bitmaps.get(j);
  const s = Math.max(cw / SW, ch / SH), w = SW * s, h = SH * s;
  // keep the right-hand side (the Nariman Point towers, the car's lane) when a tall screen crops the width
  g.drawImage(im, (cw - w) * 0.62, (ch - h) / 2, w, h);
  drawn = j;
}

/* ---------- scroll → frame, veil, chapter ---------- */
let anchors = [], lastVeil = '', lastCur = -1, lastFill = '';
function measure() {
  // a keyframe is reached when its element's middle crosses the middle of the screen
  anchors = keys.map(el => {
    const r = el.getBoundingClientRect(), top = r.top + scrollY;
    return { top, bottom: top + r.height, y: top + r.height / 2, f: +el.dataset.frame, v: el.dataset.veil != null ? +el.dataset.veil : null };
  }).sort((a, b) => a.y - b.y);
  chapterTops = chapters.map(c => (c ? c.getBoundingClientRect().top + scrollY : Infinity));
  maxScroll = Math.max(1, document.documentElement.scrollHeight - innerHeight);
}
let chapterTops = [], maxScroll = 1;
function update() {
  if (!anchors.length) return;
  const vh = innerHeight, sy = scrollY, y = sy + vh * 0.5;
  let a = anchors[0], b = anchors[0];
  if (y >= anchors[anchors.length - 1].y) a = b = anchors[anchors.length - 1];
  else for (let i = 0; i < anchors.length - 1; i++) if (y >= anchors[i].y && y < anchors[i + 1].y) { a = anchors[i]; b = anchors[i + 1]; break; }
  const t = a === b ? 0 : clamp((y - a.y) / (b.y - a.y));
  const here = anchors.find(k => y >= k.top && y < k.bottom);
  const f = reduced ? (here || a).f : lerp(a.f, b.f, t);   // reduced motion: one still per section, no scrubbing
  const nw = Math.round(clamp(f, 0, N - 1));
  if (nw !== want) { want = nw; decodeWindow(); }
  if (g) draw();
  // the veil belongs to whichever section reaches 70% down the screen, so it is dark before dense text arrives
  const yv = sy + vh * 0.7, sec = anchors.find(k => yv >= k.top && yv < k.bottom && k.v != null);
  if (veil && sec && String(sec.v) !== lastVeil) { lastVeil = String(sec.v); veil.style.opacity = lastVeil; }
  // chapter rail: the last chapter whose top has passed 40% of the screen
  let cur = 0;
  for (let i = 0; i < chapterTops.length; i++) if (chapterTops[i] - sy <= vh * 0.4) cur = i;
  if (cur !== lastCur) {
    lastCur = cur;
    railLinks.forEach((l, i) => { l.classList.toggle('on', i === cur); if (i === cur) l.setAttribute('aria-current', 'true'); else l.removeAttribute('aria-current'); });
  }
  const fs = clamp(sy / maxScroll).toFixed(3);
  if (fill && fs !== lastFill) { lastFill = fs; fill.style.transform = `scaleX(${fs})`; }
}

let raf = 0;
const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); };
addEventListener('scroll', schedule, { passive: true });
addEventListener('resize', () => { if (g) size(); measure(); update(); });
new ResizeObserver(() => { measure(); schedule(); }).observe(document.body);
if (g) { size(); fetchAll(); }
measure(); update();
window.__backdrop = { update: () => { measure(); update(); }, frame: () => drawn, want: () => want };   // for tests
