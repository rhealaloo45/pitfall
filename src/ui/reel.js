/* Scroll reel: a pinned section that scrubs through pre-rendered frames as you scroll
   (neon line-art Mumbai → the rendered city → onto the car), then shrinks the picture into a
   device frame. Frames come from tools/reel/capture.mjs. Used by index.html and portfolio.html.

   Markup:
   <section class="reel" data-src="assets/reel" data-frames="120" [data-step="2"] [data-variant="short"]>
     <div class="reel-track"><div class="reel-sticky">
       <div class="reel-device"><div class="reel-screen"><div class="reel-glass"><img class="reel-poster" …><canvas></canvas></div></div>…</div>
       <div class="reel-caption">…</div>
     </div></div>
   </section>
*/
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Load order that fills the timeline coarse-to-fine, so scrubbing works early. */
function bisectOrder(n) {
  const out = [0, n - 1], seen = new Set(out);
  for (let step = n; step >= 1; step = Math.floor(step / 2)) {
    for (let i = 0; i < n; i += step) if (!seen.has(i)) { seen.add(i); out.push(i); }
    if (step === 1) break;
  }
  return out;
}

export function mountReel(section) {
  const track = section.querySelector('.reel-track');
  const sticky = section.querySelector('.reel-sticky');
  const device = section.querySelector('.reel-device');
  const glass = section.querySelector('.reel-glass');
  const canvas = glass.querySelector('canvas');
  const poster = glass.querySelector('.reel-poster');
  const fade = [...section.querySelectorAll('[data-reel-fade]')];
  const backdrop = section.querySelector('.reel-backdrop');
  const g = canvas.getContext('2d');

  const total = +section.dataset.frames || 120;
  const step = +section.dataset.step || 1;
  const idx = [];                       // source frame numbers this reel plays
  for (let i = 0; i < total; i += step) idx.push(i);
  if (idx[idx.length - 1] !== total - 1) idx.push(total - 1);
  const N = idx.length;

  const short = section.dataset.variant === 'short';
  // scroll budget, as fractions of the pinned scroll: scrub the frames, then shrink, then show the caption
  const P = short ? { scrub: [0, 0.74], shrink: [0.66, 0.94], text: [0.86, 1] } : { scrub: [0, 0.78], shrink: [0.7, 0.95], text: [0.88, 1] };

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const conn = navigator.connection || {};
  const small = () => innerWidth < 760;
  const res = (small() || conn.saveData || /(^|-)2g|3g/.test(conn.effectiveType || '')) ? 'm' : 'd';
  canvas.width = res === 'd' ? 1280 : 640; canvas.height = res === 'd' ? 720 : 360;
  const url = i => `${section.dataset.src}/${res}/${String(idx[i]).padStart(3, '0')}.webp`;

  section.classList.add('reel-js');
  if (reduced) { section.classList.add('reel-static'); return; }   // poster only, no pinning

  /* ---------- frames ---------- */
  const imgs = new Array(N).fill(null);
  let started = false, drawn = -1, want = 0;
  function load() {
    if (started) return; started = true;
    const order = bisectOrder(N);
    let next = 0, active = 0;
    const pump = () => {
      while (active < 6 && next < order.length) {
        const i = order[next++], im = new Image();
        active++;
        im.decoding = 'async';
        im.onload = () => { imgs[i] = im; active--; if (drawn < 0 || Math.abs(i - want) < Math.abs(nearest(want) - want) || i === want) schedule(); pump(); };
        im.onerror = () => { active--; pump(); };
        im.src = url(i);
      }
    };
    pump();
  }
  function nearest(i) {
    for (let d = 0; d < N; d++) {
      if (i - d >= 0 && imgs[i - d]) return i - d;
      if (i + d < N && imgs[i + d]) return i + d;
    }
    return -1;
  }
  function draw(i) {
    const j = nearest(i);
    if (j < 0 || j === drawn) return;
    g.drawImage(imgs[j], 0, 0, canvas.width, canvas.height);
    if (drawn < 0) glass.classList.add('ready');
    drawn = j;
  }

  /* ---------- layout ---------- */
  let L = null;
  function measure() {
    device.style.transform = 'none';
    const s = sticky.getBoundingClientRect(), r = glass.getBoundingClientRect(), d = device.getBoundingClientRect();
    const vw = s.width, vh = s.height;
    // start: the picture fills the viewport (cover); on tall phone screens fill the width instead of cropping to a sliver
    const cover = Math.max(vw / r.width, vh / r.height);
    const s0 = vw / vh < 1 ? Math.min(cover, (vw / r.width) * 1.3) : cover;
    const cx = r.left + r.width / 2 - s.left, cy = r.top + r.height / 2 - s.top;
    L = { vw, vh, s0, dx: vw / 2 - cx, dy: vh / 2 - cy, ox: r.left + r.width / 2 - d.left, oy: r.top + r.height / 2 - d.top };
    device.style.transformOrigin = `${L.ox}px ${L.oy}px`;
    update(true);
  }

  /* ---------- scroll ---------- */
  let raf = 0, visible = false;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); };
  function update(force) {
    if (!L) return;
    const t = track.getBoundingClientRect();
    const span = Math.max(1, t.height - L.vh);
    const p = clamp(-t.top / span);
    want = Math.round(clamp((p - P.scrub[0]) / (P.scrub[1] - P.scrub[0])) * (N - 1));
    draw(want);
    const k = smooth(P.shrink[0], P.shrink[1], p);
    const sc = L.s0 + (1 - L.s0) * k;
    device.style.transform = `translate3d(${(L.dx * (1 - k)).toFixed(2)}px, ${(L.dy * (1 - k)).toFixed(2)}px, 0) scale(${sc.toFixed(4)})`;
    section.style.setProperty('--k', k.toFixed(3));
    const tx = smooth(P.text[0], P.text[1], p);
    for (const el of fade) { el.style.opacity = tx.toFixed(3); el.style.transform = `translateY(${((1 - tx) * 14).toFixed(1)}px)`; el.style.pointerEvents = tx > 0.5 ? 'auto' : 'none'; }
    if (backdrop) backdrop.style.opacity = (1 - smooth(0.25, 0.9, k)).toFixed(3);
  }

  new IntersectionObserver(es => { for (const e of es) { if (e.isIntersecting) load(); } }, { rootMargin: '150% 0px' }).observe(section);
  new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) schedule(); }).observe(track);
  addEventListener('scroll', () => { if (visible) schedule(); }, { passive: true });
  let rz = 0;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(measure, 80); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  measure();
  section.reel = { update: () => update(true), frame: () => drawn, total: N };   // for tests
}

for (const s of document.querySelectorAll('section.reel')) mountReel(s);
