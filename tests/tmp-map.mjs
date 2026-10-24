import { serve, launch } from './harness.mjs';
const { srv, url } = await serve();
const { browser, ctx } = await launch({ width: 1100, height: 1800 });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('ERR', e.message)); p.on('console', m => console.log('LOG', m.text()));
await p.goto(url + '/tests/blank.html');
await p.evaluate(async () => {
  const { buildNetwork } = await import('/src/mumbai/network.js');
  const { renderBaseMap } = await import('/src/mumbai/minimap.js');
  const { PLACES } = await import('/src/mumbai/layout.js');
  const net = buildNetwork();
  const m = renderBaseMap(net);
  const g = m.canvas.getContext('2d');
  g.font = '12px sans-serif'; g.fillStyle = '#fff';
  for (const p of PLACES) { const [x, y] = m.P(p.x, p.z); g.fillRect(x - 3, y - 3, 6, 6); g.fillText(p.name, x + 5, y); }
  for (const r of net.roads) { const i = Math.floor(r.n / 2); const [x, y] = m.P(r.x[i], r.z[i]); g.fillStyle = '#ff0'; g.fillText(r.id, x, y); }
  document.body.appendChild(m.canvas);
});
await p.screenshot({ path: 'test-output/map.png', fullPage: true });
await browser.close(); srv.close();
