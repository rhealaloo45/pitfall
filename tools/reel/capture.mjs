/* Renders the landing-page scroll reel from the live Mumbai GP world.
   Usage:  node tools/reel/capture.mjs                 → all frames into assets/reel/{d,m}/
           node tools/reel/capture.mjs --preview 0,40,80,119 --out <dir>   → a few debug frames
   Needs Playwright's Chromium (npx playwright install chromium) and a GPU. */
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, ROOT } from '../../tests/harness.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const TOTAL = +arg('frames', 120);
const preview = arg('preview', null);
const TIME = arg('time', 'dusk');
const OUT = path.resolve(arg('out', path.join(ROOT, 'assets/reel')));
const W = 1600, H = 900;
const SIZES = (arg('sizes', '1280x720@0.6,640x360@0.55')).split(',').map(t => { const [wh, q] = t.split('@'); const [w, h] = wh.split('x').map(Number); return [w, h, +q]; });
// frames 0–28% are pure line art, the render sweeps in until 68%, the rest is the lit city
const reveal = i => { const t = Math.min(1, Math.max(0, (i / (TOTAL - 1) - 0.28) / 0.4)); return t * t * (3 - 2 * t); };

const { srv, url } = await serve();
const { browser, ctx } = await launch({ width: W, height: H, gpu: true });
await ctx.addInitScript(t => localStorage.setItem('pitfall.settings.v1', JSON.stringify({ v: 3, quality: 'high', time: t })), TIME);
const page = await ctx.newPage();
page.on('pageerror', e => console.error('page error:', e.message));
await page.goto(url + '/mumbai.html');
await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
await page.addScriptTag({ type: 'module', url: url + '/tools/reel/page.js' });
await page.waitForFunction(() => window.__reel, null, { timeout: 30000 });

const frames = preview ? preview.split(',').map(Number) : [...Array(TOTAL).keys()];
for (const d of ['d', 'm']) fs.mkdirSync(path.join(OUT, d), { recursive: true });
const t0 = Date.now();
for (const i of frames) {
  const res = await page.evaluate(([i, n, o]) => window.__reel.frame(i, n, o), [i, TOTAL, { reveal: reveal(i), sizes: SIZES, debug: !!preview }]);
  const name = String(i).padStart(3, '0') + '.webp';
  fs.writeFileSync(path.join(OUT, 'd', name), Buffer.from(res[0], 'base64'));
  fs.writeFileSync(path.join(OUT, 'm', name), Buffer.from(res[1], 'base64'));
  if (preview) {
    fs.writeFileSync(path.join(OUT, `line_${name}`), Buffer.from(res[2], 'base64'));
    fs.writeFileSync(path.join(OUT, `lit_${name}`), Buffer.from(res[3], 'base64'));
  }
  process.stdout.write(`\rframe ${i + 1}/${TOTAL}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
console.log();
await browser.close(); srv.close();
