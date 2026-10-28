/* The page's backdrop: Mumbai GP's flight down Marine Drive (frames from tools/reel/capture.mjs),
   fixed behind the content and advanced by scroll — neon line art at the top of the page, rendered
   city by the end, where the car turns out to be the game. Also drives the chapter rail.

   Markup: <canvas id="city"> and <div id="veil"> fixed behind the page; any element with
   data-frame="n" (and optional data-veil="0–1") is a keyframe at its top edge;
   <nav class="rail"> holds links to the chapters. */
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
const g = canvas && canvas.getContext('2d');
const imgs = new Array(N).fill(null);
let drawn = -1, want = 0, anchors = [];

function nearest(i) {
  for (let d = 0; d < N; d++) {
    if (i - d >= 0 && imgs[i - d]) return i - d;
    if (i + d < N && imgs[i + d]) return i + d;
  }
  return -1;
}
function load() {
  const order = bisectOrder(N);
  let next = 0, active = 0;
  const pump = () => {
    while (active < 6 && next < order.length) {
      const i = order[next++], im = new Image();
      active++; im.decoding = 'async';
      im.onload = () => { imgs[i] = im; active--; if (Math.abs(i - want) <= Math.abs(nearest(want) - want)) draw(true); pump(); };
      im.onerror = () => { active--; pump(); };
      im.src = `${SRC}/${res}/${String(i).padStart(3, '0')}.webp`;
    }
  };
  pump();
}
function size() {
  const pr = Math.min(devicePixelRatio || 1, 1.5);
  canvas.width = Math.round(innerWidth * pr); canvas.height = Math.round(innerHeight * pr);
  drawn = -1;
}
function draw(force) {
  const j = nearest(want);
  if (j < 0 || (j === drawn && !force)) return;
  const im = imgs[j], cw = canvas.width, ch = canvas.height;
  const s = Math.max(cw / im.naturalWidth, ch / im.naturalHeight), w = im.naturalWidth * s, h = im.naturalHeight * s;
  // keep the right-hand side (the Nariman Point towers, the car's lane) when a tall screen crops the width
  g.drawImage(im, (cw - w) * 0.62, (ch - h) / 2, w, h);
  if (drawn < 0) canvas.classList.add('ready');
  drawn = j;
}

/* ---------- scroll → frame, veil, chapter ---------- */
function measure() {
  // a keyframe is reached when its element's middle crosses the middle of the screen
  anchors = keys.map(el => {
    const r = el.getBoundingClientRect(), top = r.top + scrollY;
    return { top, bottom: top + r.height, y: top + r.height / 2, f: +el.dataset.frame, v: el.dataset.veil != null ? +el.dataset.veil : null };
  }).sort((a, b) => a.y - b.y);
}
function update() {
  if (!anchors.length) return;
  const vh = innerHeight, y = scrollY + vh * 0.5;
  let a = anchors[0], b = anchors[0];
  if (y >= anchors[anchors.length - 1].y) a = b = anchors[anchors.length - 1];
  else for (let i = 0; i < anchors.length - 1; i++) if (y >= anchors[i].y && y < anchors[i + 1].y) { a = anchors[i]; b = anchors[i + 1]; break; }
  const t = a === b ? 0 : clamp((y - a.y) / (b.y - a.y));
  const here = anchors.find(k => y >= k.top && y < k.bottom);
  const f = reduced ? (here || a).f : lerp(a.f, b.f, t);   // reduced motion: one still per section, no scrubbing
  want = Math.round(clamp(f, 0, N - 1));
  if (g) draw();
  // the veil belongs to whichever section reaches 70% down the screen, so it is dark before dense text arrives
  const yv = scrollY + vh * 0.7, sec = anchors.find(k => yv >= k.top && yv < k.bottom && k.v != null);
  if (veil && sec) veil.style.opacity = String(sec.v);
  // chapter rail: the last chapter whose top has passed 40% of the screen
  let cur = 0;
  chapters.forEach((c, i) => { if (c && c.getBoundingClientRect().top <= vh * 0.4) cur = i; });
  railLinks.forEach((l, i) => { l.classList.toggle('on', i === cur); if (i === cur) l.setAttribute('aria-current', 'true'); else l.removeAttribute('aria-current'); });
  if (fill) fill.style.transform = `scaleX(${clamp(scrollY / Math.max(1, document.documentElement.scrollHeight - vh)).toFixed(4)})`;
  if (rail) rail.dataset.cur = String(cur + 1).padStart(2, '0');
}

let raf = 0;
const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); };
addEventListener('scroll', schedule, { passive: true });
addEventListener('resize', () => { if (g) size(); measure(); update(); });
new ResizeObserver(() => { measure(); schedule(); }).observe(document.body);
if (g) { size(); load(); }
measure(); update();
window.__backdrop = { update: () => { measure(); update(); }, frame: () => drawn, want: () => want };   // for tests
