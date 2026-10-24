// Visual tour: node tests/tour.mjs '[{"name":"x","x":0,"z":0,"h":0,"time":"night"}]'
import { serve, launch } from './harness.mjs';
const { srv, url } = await serve();
const { browser, ctx } = await launch({ width: 960, height: 540 });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto(url + '/mumbai.html');
await p.waitForFunction(() => window.__game && !document.getElementById('btnFree').disabled, null, { timeout: 180000 });
await p.click('#btnFree'); await p.waitForTimeout(300); await p.keyboard.press('Space');
await p.waitForFunction(() => window.__game.state.mode === 'drive', null, { timeout: 30000 });
await p.evaluate(() => document.querySelectorAll('#help,#toasts').forEach(e => e.style.visibility = 'hidden'));
for (const s of JSON.parse(process.argv[2] || '[]')) {
  await p.evaluate(s => {
    const g = window.__game, V = g.sim.pos.constructor;
    if (s.time) g.atmo.set(s.time);
    g.sim.reset(new V(s.x, g.world.groundAt(s.x, s.z, s.y ?? 1000), s.z), s.h);
    if (s.cam) g.rig.mode = s.cam;
    g.rig.snapTo(g.sim.pos, g.sim.quat);
    g.advanceSim(0.5);
  }, s);
  await p.waitForTimeout(s.wait || 1800);
  await p.screenshot({ path: `test-output/tour-${s.name}.png`, timeout: 120000 });
}
await browser.close(); srv.close();
