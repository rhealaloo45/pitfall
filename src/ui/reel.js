/* Scroll-scrubbed picture: as the element moves up the screen, it plays through pre-rendered
   frames (neon line-art Mumbai → the rendered city → onto the car). No pinning: it costs no
   extra scrolling. Frames come from tools/reel/capture.mjs.

   <div class="scrub" data-src="assets/reel" data-frames="120" data-step="2">
     <img src="assets/reel/d/119.webp" alt="…"><canvas aria-hidden="true"></canvas>
   </div>
*/
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

/** Load order that fills the timeline coarse-to-fine, so scrubbing works early. */
function bisectOrder(n) {
  const out = [0, n - 1], seen = new Set(out);
  for (let step = n; step >= 1; step = Math.floor(step / 2)) {
    for (let i = 0; i < n; i += step) if (!seen.has(i)) { seen.add(i); out.push(i); }
    if (step === 1) break;
  }
  return out;
}

export function mountScrub(el) {
  const canvas = el.querySelector('canvas'), g = canvas.getContext('2d');
  const total = +el.dataset.frames || 120, step = +el.dataset.step || 1;
  const idx = [];
  for (let i = 0; i < total; i += step) idx.push(i);
  if (idx[idx.length - 1] !== total - 1) idx.push(total - 1);
  const N = idx.length;

  el.classList.add('scrub-js');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.classList.add('scrub-static'); return; }   // the still only

  const conn = navigator.connection || {};
  const big = el.getBoundingClientRect().width * (devicePixelRatio || 1) > 760;
  const res = big && !conn.saveData && !/(^|-)2g|3g/.test(conn.effectiveType || '') ? 'd' : 'm';
  canvas.width = res === 'd' ? 1280 : 640; canvas.height = res === 'd' ? 720 : 360;
  const url = i => `${el.dataset.src}/${res}/${String(idx[i]).padStart(3, '0')}.webp`;

  const imgs = new Array(N).fill(null);
  let started = false, drawn = -1, want = 0;
  const nearest = i => {
    for (let d = 0; d < N; d++) {
      if (i - d >= 0 && imgs[i - d]) return i - d;
      if (i + d < N && imgs[i + d]) return i + d;
    }
    return -1;
  };
  function load() {
    if (started) return; started = true;
    const order = bisectOrder(N);
    let next = 0, active = 0;
    const pump = () => {
      while (active < 6 && next < order.length) {
        const i = order[next++], im = new Image();
        active++; im.decoding = 'async';
        im.onload = () => { imgs[i] = im; active--; if (Math.abs(i - want) <= Math.abs(nearest(want) - want)) draw(want); pump(); };
        im.onerror = () => { active--; pump(); };
        im.src = url(i);
      }
    };
    pump();
  }
  function draw(i) {
    const j = nearest(i);
    if (j < 0 || j === drawn) return;
    g.drawImage(imgs[j], 0, 0, canvas.width, canvas.height);
    if (drawn < 0) el.classList.add('ready');
    drawn = j;
  }
  // 0 when the picture's top edge enters at the bottom of the screen; 1 once its centre is 40% of the way down
  function update() {
    const r = el.getBoundingClientRect(), vh = innerHeight;
    const start = vh, end = vh * 0.4 - r.height / 2;
    want = Math.round(clamp((start - r.top) / (start - end)) * (N - 1));
    draw(want);
  }

  let raf = 0, visible = false;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); };
  new IntersectionObserver(es => { if (es[0].isIntersecting) load(); }, { rootMargin: '120% 0px' }).observe(el);
  new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) schedule(); }).observe(el);
  addEventListener('scroll', () => { if (visible) schedule(); }, { passive: true });
  addEventListener('resize', schedule);
  update();
  el.scrub = { update, frame: () => drawn, total: N };   // for tests
}

for (const el of document.querySelectorAll('.scrub')) mountScrub(el);
