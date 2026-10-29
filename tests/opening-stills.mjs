// Re-renders the opening-frame stills the landing page shows while the 3D starts up
// (assets/stills/opening-wide.webp and opening-tall.webp). Run after changing what the opening shows.
// Usage: node tests/opening-stills.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { serve, ROOT } from './harness.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const { srv, url } = await serve();
const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
for (const [name, width, height, dpr] of [['opening-wide', 1440, 900, 1], ['opening-tall', 390, 844, 2]]) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/(.*)/, r => r.fulfill({ path: path.join(ROOT, 'node_modules/three', r.request().url().split('three@0.160.0/')[1].split('?')[0]), contentType: 'text/javascript' }));
  const page = await ctx.newPage();
  await page.goto(url + '/index.html');
  await page.waitForFunction(() => window.__story, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  // read the canvas in the same task as a fresh render, so the frame is still in the drawing buffer
  const data = await page.evaluate(() => { scrollTo(0, 0); window.__story.snap(); return document.getElementById('scene').toDataURL('image/webp', 0.72); });
  const out = path.join(ROOT, 'assets/stills', name + '.webp');
  fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
  console.log(path.relative(ROOT, out), fs.statSync(out).size, 'bytes');
  await ctx.close();
}
await browser.close(); srv.close();
