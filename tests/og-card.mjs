// The card shown when rhealaloo.com is shared (LinkedIn, WhatsApp, Slack): 1200×630, name and line over the
// opening line art. Usage: node tests/og-card.mjs   → assets/og-card.jpg
import { serve, ROOT } from './harness.mjs';
import path from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const { srv, url } = await serve();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(`<!doctype html><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; background: #030405; color: #f1efea; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', Inter, system-ui, sans-serif; overflow: hidden; position: relative; }
  img { position: absolute; right: -150px; top: -70px; height: 770px; opacity: .9; }
  .shade { position: absolute; inset: 0; background: linear-gradient(90deg, #030405 0%, rgba(3,4,5,.94) 36%, rgba(3,4,5,.35) 64%, rgba(3,4,5,0) 82%); }
  .t { position: absolute; left: 76px; top: 88px; width: 720px; }
  .k { font-size: 26px; font-weight: 600; background: linear-gradient(90deg, #39d4ff, #ff5fa8 55%, #ff8a5c); -webkit-background-clip: text; color: transparent; display: inline-block; }
  h1 { margin-top: 16px; font-size: 132px; line-height: .92; letter-spacing: -.045em; font-weight: 800; }
  h1 span { color: #d81f26; }
  p { margin-top: 30px; font-size: 33px; line-height: 1.32; color: #d2cec6; max-width: 640px; }
  p b { color: #f1efea; }
  .u { position: absolute; left: 76px; bottom: 58px; font-size: 26px; font-weight: 600; color: #a6a29a; display: flex; gap: 14px; align-items: center; }
  .u i { width: 10px; height: 10px; border-radius: 50%; background: #d81f26; }
</style>
<img src="${url}/assets/stills/opening-wide.webp"><div class="shade"></div>
<div class="t"><div class="k">AI Engineer · Mumbai</div><h1>Rhea<br>Laloo<span>.</span></h1>
<p>I build <b>AI that notices what's wrong</b>, and <b>agents that act on it</b>.</p></div>
<div class="u"><i></i>rhealaloo.com</div>`);
await page.waitForFunction(() => document.images[0].complete && document.images[0].naturalWidth > 0);
await page.screenshot({ path: path.join(ROOT, 'assets/og-card.jpg'), type: 'jpeg', quality: 86 });
await browser.close(); srv.close();
console.log('wrote assets/og-card.jpg');
