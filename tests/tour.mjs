// Visual tour: node tests/tour.mjs '[{"name":"x","x":0,"z":0,"h":0,"time":"night"}]'
import { serve, launch } from './harness.mjs';
const { srv, url } = await serve();
const { browser, ctx } = await launch({ width: +(process.env.W || 960), height: +(process.env.H || 540) });
const p = await ctx.newPage();
const HIDEHUD = process.env.HUD === '0';
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto(url + '/mumbai.html' + (process.env.Q ? '?quality=' + process.env.Q : ''));
await p.waitForFunction(() => window.__game && !document.getElementById('btnFree').disabled, null, { timeout: 180000 });
await p.click('#btnFree'); await p.waitForTimeout(300); await p.keyboard.press('Space');
await p.waitForFunction(() => window.__game.state.mode === 'drive', null, { timeout: 120000 });
await p.evaluate(hide => { document.querySelectorAll('#help,#toasts').forEach(e => e.style.visibility = 'hidden'); const P = window.__game.pipeline; if (P) { P.minScale = 1; P.scale = 1; P.applyScale(); P.adapt = () => {}; } if (hide) document.getElementById('hud').style.visibility = 'hidden'; }, HIDEHUD);
for (const s of JSON.parse(process.argv[2] || '[]')) {
  await p.evaluate(s => {
    const g = window.__game, V = g.sim.pos.constructor;
    if (s.hud === 0) document.getElementById('hud').style.visibility = 'hidden';
    if (s.time) g.atmo.set(s.time);
    if (s.road) {
      // place on a named road: fraction along it, left lane, facing along (dir ±1)
      const r = g.world.net.roads.find(q => q.id.startsWith(s.road)), i = Math.round((s.f ?? 0.5) * (r.n - 1)), dir = s.dir ?? 1;
      const lat = dir * (r.T.median / 2 + (r.T.hw - r.T.median / 2) * 0.35);
      s.x = r.x[i] + r.tz[i] * lat; s.z = r.z[i] - r.tx[i] * lat; s.h = Math.atan2(r.tx[i] * dir, r.tz[i] * dir) + (s.dh || 0); s.y = r.h[i] + 2;
    }
    g.sim.reset(new V(s.x, g.world.groundAt(s.x, s.z, s.y ?? 1000), s.z), s.h);
    if (s.cam) g.rig.mode = s.cam;
    g.rig.snapTo(g.sim.pos, g.sim.quat);
    if (g.state.mode === 'panel') g.closePanel();
    g.advanceSim(0.5);
    if (g.state.mode === 'panel') g.closePanel();
    if (s.look) { const c = g.camera; c.position.set(...s.look[0]); c.lookAt(...s.look[1]); g.rig.script = { update: () => false }; }
    else g.rig.script = null;
  }, s);
  await p.waitForTimeout(s.wait || 1800);
  await p.screenshot({ path: `test-output/tour-${s.name}.png`, timeout: 240000 });
}
await browser.close(); srv.close();
