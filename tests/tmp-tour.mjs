import { serve, launch } from './harness.mjs';
const { srv, url } = await serve();
const { browser, ctx } = await launch({ width: 960, height: 540 });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const t0 = Date.now();
await p.goto(url + '/mumbai.html' + (process.argv[3] || ''));
await p.waitForFunction(() => window.__game || document.querySelector('#loadErr:not(.hidden)'), null, { timeout: 180000 });
console.log('load s', (Date.now() - t0) / 1000, await p.textContent('#loadStage'));
await p.click('#btnFree');
await p.waitForTimeout(500);
await p.evaluate(() => window.__game.rig.script && window.__game.rig.script.skip());
await p.waitForTimeout(800);
const spots = JSON.parse(process.argv[2] || '[]');
for (const s of spots) {
  await p.evaluate(s => {
    const g = window.__game;
    if (s.time) g.atmo.set(s.time);
    const THREE_V = g.sim.pos.constructor;
    const y = g.world.groundAt(s.x, s.z, s.y ?? 1000);
    g.sim.reset(new THREE_V(s.x, y, s.z), s.h);
    if (s.cam) g.rig.mode = s.cam;
    g.rig.snapTo(g.sim.pos, g.sim.quat);
    if (s.v) { const f = g.sim.forward(); g.sim.vel.copy(f.multiplyScalar(s.v)); }
  }, s);
  await p.waitForTimeout(s.wait || 1500);
  await p.screenshot({ path: `test-output/tour-${s.name}.png` });
  console.log(s.name, await p.evaluate(() => { const g = window.__game; return [g.sim.pos.toArray().map(v => v.toFixed(1)).join(','), (g.sim.speed * 3.6).toFixed(0), Math.round(1000 / g.state.frameMs) + 'fps'].join(' '); }));
}
console.log(errs.slice(0, 10).join('\n'));
await browser.close(); srv.close();
