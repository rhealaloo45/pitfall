// Shared browser-test harness: static server + headless Chromium with CDN requests
// served from node_modules (the sandbox has no direct CDN access).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.pdf': 'application/pdf', '.json': 'application/json', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary' };

export function serve(port = 0) {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      let p = decodeURIComponent(q.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT)) { r.writeHead(403); r.end(); return; }
      fs.readFile(f, (e, d) => {
        if (e) { r.writeHead(404); r.end('not found'); return; }
        r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d);
      });
    }).listen(port, () => res({ srv, url: `http://localhost:${srv.address().port}` }));
  });
}

export async function launch({ width = 1280, height = 720 } = {}) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/(.*)/, r => {
    const rel = r.request().url().split('three@0.160.0/')[1].split('?')[0];
    r.fulfill({ path: path.join(ROOT, 'node_modules/three', rel), contentType: 'text/javascript' });
  });
  return { browser, ctx };
}
