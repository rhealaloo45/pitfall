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
  // first visit: the career chapter (Pit Wall) opens on the grid before any driving
  await p.waitForFunction(() => window.__game.state.mode === 'panel', null, { timeout: 20000 });
  check('mumbai: career briefing opens on the grid', /AI Engineer/.test(await p.textContent('#panelTitle')) && /Start driving/.test(await p.textContent('#panelClose')), await p.textContent('#panelTitle'));
  await p.keyboard.press('Escape');
  await p.waitForFunction(() => window.__game.state.mode === 'drive', null, { timeout: 20000 });
  check('mumbai: intro skips into drive mode', true);
  const g = (fn, arg) => p.evaluate(fn, arg);
  const tp = (x, z, h, v = 0) => g(([x, z, h, v]) => { const G = window.__game, V = G.sim.pos.constructor; G.sim.reset(new V(x, G.world.groundAt(x, z), z), h); if (v) G.sim.vel.copy(G.sim.forward().multiplyScalar(v)); G.rig.snapTo(G.sim.pos, G.sim.quat); }, [x, z, h, v]);
  // spawn lane + acceleration
  // keyboard → input → physics (wall-clock: any motion counts)
  // software WebGL can take a second or two per frame here, so hold W until the car moves (or give up)
  await p.keyboard.down('KeyW');
  await p.waitForFunction(() => window.__game.sim.speed > 0.2, null, { timeout: 20000, polling: 100 }).catch(() => {});
  await p.keyboard.up('KeyW');
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
  // portfolio chapter panel: arrive slowly at K. C. College
  await tp(300, 785, 0);
  await adv(0.5);
  await p.waitForTimeout(300);
  const panel = await g(() => window.__game.state.mode === 'panel' || document.getElementById('prompt').style.display === 'flex');
  check('mumbai: K. C. College chapter opens (or prompts)', panel);
  if (await g(() => window.__game.state.mode !== 'panel')) await p.keyboard.press('KeyF');
  await p.waitForTimeout(300);
  const title = await p.textContent('#panelTitle');
  check('mumbai: chapter panel shows the college', /K\. C\. College/.test(title), title);
  check('mumbai: school years merged into one chapter', /Villa Theresa/.test(await p.textContent('#panelBody')));
  const before = await g(() => window.__game.sim.pos.toArray());
  await p.waitForTimeout(800);
  const after = await g(() => window.__game.sim.pos.toArray());
  check('mumbai: world is paused while reading', before.every((v, i) => Math.abs(v - after[i]) < 1e-6));
  await p.keyboard.press('Escape');
  check('mumbai: panel closes back to driving', (await g(() => window.__game.state.mode)) === 'drive');
  // fast travel from Pause → Progress (Bandra Fort sits on a slope: the car must land, not launch)
  await p.keyboard.press('Escape');
  await p.click('#pause nav button[data-pane="progress"]');
  await p.click('#pausePane [data-go="bandraFort"]');
  const ft = await g(() => { const G = window.__game; let vy = 0; for (let k = 0; k < 30; k++) { G.advanceSim(1 / 60); vy = Math.max(vy, Math.abs(G.sim.vel.y)); } return { mode: G.state.mode, d: Math.hypot(G.sim.pos.x + 528, G.sim.pos.z + 1578), vy }; });
  check('mumbai: Pause → Progress → Go there jumps to the place', ft.mode === 'drive' && ft.d < 30, `${ft.d.toFixed(0)} m away`);
  check('mumbai: fast travel lands on the road', ft.vy < 2, `max vertical speed ${ft.vy.toFixed(2)} m/s`);
  // big map click jumps to a chapter and opens it
  await p.keyboard.press('KeyM');
  const pt = await g(() => {   // screen point of KJSIT on the big map, via the map's own picker
    const c = document.getElementById('bigmapCanvas'), b = c.getBoundingClientRect();
    for (let y = 0; y < c.height; y += 3) for (let x = 0; x < c.width; x += 3) if (window.__game.bigmapPick(x, y, 3) === 'kjsit') return [b.left + x * b.width / c.width, b.top + y * b.height / c.height];
    return null;
  });
  if (pt) await p.mouse.click(pt[0], pt[1]);
  await p.waitForTimeout(300);
  check('mumbai: clicking a chapter on the map jumps there', pt && (await g(() => window.__game.state.mode)) === 'panel' && /Somaiya/.test(await p.textContent('#panelTitle')), pt ? '' : 'KJSIT not found on the map');
  await p.keyboard.press('Escape');
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
  /* ---------- Mumbai GP timed route: briefing → lights → 3 sectors → finish at KJSIT ---------- */
  p = await ctx.newPage(); errs = pageErrors(p);
  await p.addInitScript(() => localStorage.removeItem('pitfall.mumbai.visited'));   // a first-time visitor
  await p.goto(url + '/mumbai.html');
  await p.waitForFunction(() => window.__game && !document.getElementById('btnGP').disabled, null, { timeout: 120000 });
  await p.click('#btnGP'); await p.waitForTimeout(400);
  await p.keyboard.press('Space');
  await p.waitForFunction(() => window.__game.state.mode === 'panel', null, { timeout: 20000 });
  check('gp: Pit Wall briefing before the race', /Start the race/.test(await p.textContent('#panelClose')) && /Experience/.test(await p.textContent('#panelBody')));
  await p.keyboard.press('Escape');
  await p.waitForFunction(() => window.__game.state.lapRunning, null, { timeout: 15000 });
  check('gp: lights out after the briefing', true);
  const route = await p.evaluate(async () => {
    const G = window.__game, { PLACES, SPAWN, GP_ROUTE } = await import('/src/mumbai/layout.js');
    let L = 0, a = SPAWN;
    for (const id of GP_ROUTE.slice(1)) { const b = PLACES.find(q => q.id === id); L += G.nav.route(a.x, a.z, b.x, b.z).length; a = b; }
    return { L, n: GP_ROUTE.length - 1 };
  });
  check('gp: route is a short sprint', route.L < 4500, `${(route.L / 1000).toFixed(1)} km over ${route.n} sectors`);
  const fin = await p.evaluate(async () => {
    const G = window.__game, V = G.sim.pos.constructor, { PLACES, GP_ROUTE } = await import('/src/mumbai/layout.js');
    for (const id of GP_ROUTE.slice(1)) {
      const pl = PLACES.find(q => q.id === id);
      G.sim.reset(new V(pl.x, G.world.groundAt(pl.x, pl.z), pl.z), 0); G.rig.snapTo(G.sim.pos, G.sim.quat);
      G.advanceSim(0.3); if (G.state.mode === 'panel' && id !== 'kjsit') G.closePanel();
    }
    return { gp: G.state.gp, mode: G.state.mode, title: document.getElementById('panelTitle').textContent };
  });
  check('gp: finish at KJSIT stops the clock and opens the chapter', !fin.gp && fin.mode === 'panel' && /Somaiya/.test(fin.title), fin.title);
  check('gp: no errors', errs.length === 0, errs.join('; '));
  await p.close();

  /* ---------- phone: touch controls & low quality ---------- */
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' });
  await phone.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await phone.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/(.*)/, r => { const rel = r.request().url().split('three@0.160.0/')[1].split('?')[0]; r.fulfill({ path: new URL('../node_modules/three/' + rel, import.meta.url).pathname, contentType: 'text/javascript' }); });
  p = await phone.newPage(); errs = pageErrors(p);
  await p.goto(url + '/mumbai.html');
  await p.waitForFunction(() => window.__game && !document.getElementById('btnFree').disabled, null, { timeout: 120000 });
  await p.tap('#btnFree'); await p.waitForTimeout(400);
  await p.evaluate(() => window.__game.rig.script && window.__game.rig.script.skip());
  await p.waitForFunction(() => window.__game.state.mode === 'panel', null, { timeout: 20000 });   // career briefing on the grid
  await p.tap('#panelClose');
  await p.waitForFunction(() => window.__game.state.mode === 'drive', null, { timeout: 20000 });
  check('phone: touch controls shown', await p.isVisible('#tThr'));
  const box = await p.locator('#tThr').boundingBox();
  await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  check('phone: low graphics quality auto-selected', await p.evaluate(() => window.__game.renderer.getPixelRatio() <= 1));
  check('phone: no errors', errs.length === 0, errs.join('; '));
  await phone.close();
} catch (e) {
  check('suite completed', false, e.message);
}
await browser.close(); srv.close();
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
