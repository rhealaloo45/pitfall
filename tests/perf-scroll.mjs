// Scroll-smoothness check for the landing page: scrolls top to bottom with the mouse wheel on a
// retina-sized viewport, with the CPU slowed down (an ordinary laptop, not a dev machine), and reports
// frame times. At 60 Hz a frame has 16.7 ms; anything over ~25 ms reads as a stutter.
// Usage: node tests/perf-scroll.mjs [--throttle 4] [--gpu]
import { serve, launch } from './harness.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] ?? true : d; };
const throttle = +arg('throttle', 4);
const { srv, url } = await serve();
const { browser, ctx } = await launch({ width: 1440, height: 900, gpu: !!arg('gpu', false) });
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
const cdp = await ctx.newCDPSession(page);
await page.goto(url + '/index.html');
await page.waitForFunction(() => window.__backdrop, null, { timeout: 15000 });
await page.waitForFunction(() => performance.getEntriesByType('resource').filter(e => e.name.includes('/assets/reel/')).length >= 120, null, { timeout: 60000 });
await page.waitForTimeout(1500);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });

await page.evaluate(() => {
  window.__frames = []; window.__long = 0;
  let last = performance.now();
  const tick = t => { window.__frames.push(t - last); last = t; if (!window.__stop) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long += e.duration; }).observe({ type: 'longtask', buffered: false }); } catch {}
});
const height = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
await page.mouse.move(720, 450);
for (let y = 0; y < height; y += 90) { await page.mouse.wheel(0, 90); await page.waitForTimeout(16); }
await page.waitForTimeout(300);
const r = await page.evaluate(() => { window.__stop = true; const f = window.__frames.slice(5).sort((a, b) => a - b); return { n: f.length, p50: f[f.length >> 1], p95: f[Math.floor(f.length * 0.95)], max: f[f.length - 1], slow: f.filter(x => x > 25).length, long: Math.round(window.__long) }; });
console.log(`frames ${r.n} · median ${r.p50.toFixed(1)} ms · p95 ${r.p95.toFixed(1)} ms · worst ${r.max.toFixed(0)} ms · stutters (>25 ms) ${r.slow} (${(100 * r.slow / r.n).toFixed(1)}%) · long tasks ${r.long} ms  [cpu ×${throttle}]`);
await browser.close(); srv.close();
