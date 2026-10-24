// Captures the menu preview images from the running game (self-generated, so no licensing questions).
import { serve, launch } from './harness.mjs';
const { srv, url } = await serve();
const { browser, ctx } = await launch({ width: 1280, height: 720 });
// Mumbai: the intro's tabletop overview, without UI
let p = await ctx.newPage();
await p.goto(url + '/mumbai.html');
await p.waitForFunction(() => window.__game, null, { timeout: 120000 });
await p.click('#btnFree');
await p.evaluate(() => { const s = window.__game.rig.script; s.t = 0.6; document.querySelectorAll('#introTitle,#skipIntro,#hud').forEach(e => e.style.visibility = 'hidden'); });
await p.waitForTimeout(1200);
await p.evaluate(() => { const s = window.__game.rig.script; s.t = 2.2; });
await p.waitForTimeout(1500);
await p.screenshot({ path: 'test-output/prev-mumbai.png', timeout: 120000 });
// Mumbai street level
await p.evaluate(() => { const g = window.__game; g.rig.script.skip(); });
await p.waitForTimeout(800);
await p.evaluate(() => { document.querySelectorAll('#hud,#toasts,#help').forEach(e => e.style.visibility = 'hidden'); const g = window.__game; const V = g.sim.pos.constructor; g.sim.reset(new V(-255, g.world.groundAt(-255, 60), 60), 3.14); g.rig.snapTo(g.sim.pos, g.sim.quat); });
await p.waitForTimeout(3500);
await p.screenshot({ path: 'test-output/prev-mumbai-street.png', timeout: 120000 });
await p.close();
// Original circuit: start the engine and drive a moment
p = await ctx.newPage();
await p.goto(url + '/circuit.html');
await p.waitForTimeout(4000);
await p.click('#startBtn');
await p.keyboard.down('KeyW'); await p.waitForTimeout(2500); await p.keyboard.up('KeyW');
await p.evaluate(() => document.querySelectorAll('#hud,#hint,#toast,#minimap,#lapHud,#menuBtn').forEach(e => e.style.visibility = 'hidden'));
await p.waitForTimeout(1500);
await p.screenshot({ path: 'test-output/prev-circuit.png', timeout: 120000 });
await browser.close(); srv.close();
