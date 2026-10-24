// End-to-end regression suite (headless Chromium, software WebGL).
// Usage: node tests/e2e.mjs
import { serve, launch } from './harness.mjs';

const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };
const { srv, url } = await serve();
const { browser, ctx } = await launch({ width: 960, height: 540 });
const pageErrors = page => { const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200)); }); return errs; };

try {
  /* ---------- menu ---------- */
  let p = await ctx.newPage(); let errs = pageErrors(p);
  await p.goto(url + '/index.html');
  const links = await p.$$eval('a', as => as.map(a => a.getAttribute('href')));
  check('menu links to both worlds and the portfolio', ['mumbai.html', 'circuit.html', 'portfolio.html'].every(h => links.includes(h)));
  check('menu previews exist', (await p.$$eval('.shot', s => s.length)) === 2);
  check('menu has no errors', errs.length === 0, errs.join('; '));
  await p.close();

  /* ---------- portfolio ---------- */
  p = await ctx.newPage(); errs = pageErrors(p);
  await p.goto(url + '/portfolio.html');
  const items = await p.$$eval('.item', x => x.length);
  check('portfolio renders resume content', items >= 9, `${items} items`);
  check('portfolio résumé link', await p.$('a[href="assets/rhea-laloo-resume.pdf"]'));
  check('portfolio has no errors', errs.length === 0, errs.join('; '));
  await p.close();

  /* ---------- original circuit (regression) ---------- */
  p = await ctx.newPage(); errs = pageErrors(p);
  await p.goto(url + '/circuit.html');
  await p.waitForFunction(() => window.__trackReady === true, null, { timeout: 60000 });
  await p.click('#startBtn');
  await p.keyboard.down('KeyW'); await p.waitForTimeout(3000); await p.keyboard.up('KeyW');
  const kmh = +(await p.textContent('#speedVal'));
  check('circuit: start engine and accelerate', kmh > 0, `${kmh} km/h (software WebGL is slow; any motion proves input → physics)`);
  check('circuit: menu button visible', await p.isVisible('#menuBtn'));
  check('circuit: no errors', errs.length === 0, errs.join('; '));
  await p.close();

  /* ---------- Mumbai GP ---------- */
  p = await ctx.newPage(); errs = pageErrors(p);
  const t0 = Date.now();
  await p.goto(url + '/mumbai.html');
  await p.waitForFunction(() => window.__game && !document.getElementById('btnFree').disabled, null, { timeout: 120000 });
  const buildS = await p.evaluate(() => window.__game.world.buildMs / 1000);
  check('mumbai: city builds', true, `page ready in ${((Date.now() - t0) / 1000).toFixed(1)} s, city ${buildS.toFixed(1)} s`);
  await p.click('#btnFree');
  await p.waitForTimeout(400);
  await p.keyboard.press('Space');                     // skip the intro
  await p.waitForFunction(() => window.__game.state.mode === 'drive', null, { timeout: 20000 });
  check('mumbai: intro skips into drive mode', true);
  const g = (fn, arg) => p.evaluate(fn, arg);
  const tp = (x, z, h, v = 0) => g(([x, z, h, v]) => { const G = window.__game, V = G.sim.pos.constructor; G.sim.reset(new V(x, G.world.groundAt(x, z), z), h); if (v) G.sim.vel.copy(G.sim.forward().multiplyScalar(v)); G.rig.snapTo(G.sim.pos, G.sim.quat); }, [x, z, h, v]);
  // spawn lane + acceleration
  // keyboard → input → physics (wall-clock: any motion counts)
  await p.keyboard.down('KeyW'); await p.waitForTimeout(1500); await p.keyboard.up('KeyW');
  check('mumbai: keyboard drives the car', await g(() => window.__game.sim.speed > 0.2));
  // gameplay checks below advance simulated time directly, so they don't depend on render speed
  const adv = (sec, inp) => g(([sec, inp]) => window.__game.advanceSim(sec, inp), [sec, inp]);
  await g(() => { const G = window.__game; G.sim.vel.set(0, 0, 0); });
  await adv(3, { throttle: 1 });
  const sp = await g(() => window.__game.sim.speed * 3.6);
  check('mumbai: car accelerates', sp > 70, `${sp.toFixed(0)} km/h after 3 s`);
  // pause and resume
  await p.keyboard.press('Escape');
  check('mumbai: Esc pauses', (await g(() => window.__game.state.mode)) === 'pause');
  await p.keyboard.press('Escape');
  check('mumbai: Esc resumes', (await g(() => window.__game.state.mode)) === 'drive');
  // portfolio chapter panel: arrive slowly at Villa Theresa
  await tp(-228, -48, 0);
  await adv(0.5);
  await p.waitForTimeout(300);
  const panel = await g(() => window.__game.state.mode === 'panel' || document.getElementById('prompt').style.display === 'flex');
  check('mumbai: Villa Theresa chapter opens (or prompts)', panel);
  if (await g(() => window.__game.state.mode !== 'panel')) await p.keyboard.press('KeyF');
  await p.waitForTimeout(300);
  const title = await p.textContent('#panelTitle');
  check('mumbai: chapter panel shows the school', /Villa Theresa/.test(title), title);
  const before = await g(() => window.__game.sim.pos.toArray());
  await p.waitForTimeout(800);
  const after = await g(() => window.__game.sim.pos.toArray());
  check('mumbai: world is paused while reading', before.every((v, i) => Math.abs(v - after[i]) < 1e-6));
  await p.keyboard.press('Escape');
  check('mumbai: panel closes back to driving', (await g(() => window.__game.state.mode)) === 'drive');
  // collect a chai glass
  const chai0 = await g(() => window.__game.world.layers.play.collected.size);
  const c = await g(() => { const ch = window.__game.world.layers.play.chai.find(c => !c.got && c.y < 30); return [ch.x, ch.z]; });
  await tp(c[0], c[1], 0);
  await adv(0.3);
  const chai1 = await g(() => window.__game.world.layers.play.collected.size);
  check('mumbai: chai collectible picked up', chai1 === chai0 + 1, `${chai0} → ${chai1}`);
  // knock cones over on Colaba Causeway
  const cone = await g(() => { const pr = window.__game.world.layers.play.props.find(q => q.kind === 'cone'); return [pr.x, pr.z]; });
  const k0 = await g(() => window.__game.world.layers.play.stats.knocked);
  await g(([x, z]) => {
    const G = window.__game, V = G.sim.pos.constructor;
    const loc = G.nav.locate(x, z), r = loc.road, i = Math.max(0, loc.i - 3);   // 9 m back along the road, same lateral offset
    const lat = (x - r.x[loc.i]) * r.tz[loc.i] - (z - r.z[loc.i]) * r.tx[loc.i];
    const sx = r.x[i] + r.tz[i] * lat, sz = r.z[i] - r.tx[i] * lat;
    G.sim.reset(new V(sx, G.world.groundAt(sx, sz), sz), Math.atan2(x - sx, z - sz));
    G.sim.vel.copy(G.sim.forward().multiplyScalar(12)); G.rig.snapTo(G.sim.pos, G.sim.quat);
  }, cone);
  await adv(2, { throttle: 0.4 });
  const k1 = await g(() => window.__game.world.layers.play.stats.knocked);
  check('mumbai: props can be knocked over', k1 > k0, `${k0} → ${k1}`);
  // ramp airtime
  const ramp = await g(() => { const r = window.__game.world.layers.play.ramps[0]; return [r.x - r.s * 25, r.z - r.c * 25, r.dir]; });
  await tp(ramp[0], ramp[1], ramp[2], 26);
  const air = await g(() => { const G = window.__game; let a = 0; for (let k = 0; k < 120; k++) { G.advanceSim(1 / 30, { throttle: 1 }); if (G.sim.contacts === 0) a += 1 / 30; } return a; });
  check('mumbai: ramp launches the car', air >= 0.3, `${air.toFixed(2)} s airborne`);
  // recovery
  await p.keyboard.press('KeyR');
  await p.waitForTimeout(700);
  await adv(1);
  const onRoad = await g(() => { const G = window.__game; return G.sim.wheels.some(w => w.surface.kind === 'road'); });
  check('mumbai: R recovers onto a road', onRoad);
  // horn, night mode, resize
  await p.keyboard.press('KeyH');
  await g(() => { window.__game.atmo.set('night'); });
  await p.waitForTimeout(600);
  await p.setViewportSize({ width: 700, height: 900 });
  await p.waitForFunction(() => Math.abs(window.__game.camera.aspect - 700 / 900) < 0.01, null, { timeout: 15000 }).catch(() => {});
  const asp = await g(() => window.__game.camera.aspect);
  check('mumbai: resize updates the camera', Math.abs(asp - 700 / 900) < 0.01, asp.toFixed(3));
  const fps = await g(() => Math.round(1000 / window.__game.state.frameMs));
  const info = await g(() => { const r = window.__game.renderer.info.render; return `${r.calls} draw calls, ${(r.triangles / 1e6).toFixed(2)} M tris`; });
  check('mumbai: runs', true, `${fps} fps (software WebGL), ${info}`);
  check('mumbai: no errors', errs.length === 0, errs.join('; '));
  await p.close();
} catch (e) {
  check('suite completed', false, e.message);
}
await browser.close(); srv.close();
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
