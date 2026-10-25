// Captures the menu / loader preview images from the running game (self-generated, so no licensing questions).
// Usage: node tests/make-previews.mjs   (needs ffmpeg for the WebP conversion)
import { execFileSync } from 'node:child_process';
import { serve, launch } from './harness.mjs';
const { srv, url } = await serve();
const { browser, ctx } = await launch({ width: 1600, height: 900 });
const webp = (png, out, q = 80) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-c:v', 'libwebp', '-quality', String(q), out]);

let p = await ctx.newPage();
await p.goto(url + '/mumbai.html?quality=high');
await p.waitForFunction(() => window.__game && !document.getElementById('btnFree').disabled, null, { timeout: 240000 });
await p.click('#btnFree');
await p.waitForTimeout(300);
await p.evaluate(() => window.__game.rig.script && window.__game.rig.script.skip());
await p.waitForFunction(() => window.__game.state.mode === 'drive', null, { timeout: 120000 });
await p.evaluate(() => {
  document.querySelectorAll('#hud,#toasts,#help,#introTitle,#skipIntro').forEach(e => e.style.visibility = 'hidden');
  for (const b of window.__game.world.layers.landmarks.beacons) { b.beam.visible = false; b.ring.visible = false; }
  const P = window.__game.pipeline; if (P) { P.minScale = 1; P.scale = 1; P.applyScale(); P.adapt = () => {}; }
});
/** Put the car on a road (fraction f along it, left lane) and frame it with a fixed camera offset in the car's frame. */
const shot = async (file, { road, f, dir = 1, time = 'golden', cam, look }) => {
  await p.evaluate(({ road, f, dir, time, cam, look }) => {
    const g = window.__game, V = g.sim.pos.constructor;
    g.atmo.set(time);
    const r = g.world.net.roads.find(q => q.id.startsWith(road)), i = Math.round(f * (r.n - 1));
    const lat = dir * (r.T.median / 2 + (r.T.hw - r.T.median / 2) * 0.35);
    const x = r.x[i] + r.tz[i] * lat, z = r.z[i] - r.tx[i] * lat, h = Math.atan2(r.tx[i] * dir, r.tz[i] * dir);
    g.sim.reset(new V(x, r.h[i] + 0.4, z), h);
    g.advanceSim(0.6);
    if (g.state.mode === 'panel') g.closePanel();
    const fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);   // forward, right (in world)
    const P = ([a, b, c]) => [g.sim.pos.x + rx * a + fx * c, g.sim.pos.y + b, g.sim.pos.z + rz * a + fz * c];
    const c = P(cam), t = P(look);
    g.rig.script = { update: (dt, rig) => { rig.camera.position.set(...c); rig.camera.up.set(0, 1, 0); rig.camera.lookAt(...t); rig.camera.fov = 42; rig.camera.updateProjectionMatrix(); return false; } };
  }, { road, f, dir, time, cam, look });
  await p.waitForTimeout(4000);
  await p.screenshot({ path: `test-output/${file}.png`, timeout: 240000 });
};
// loader / menu card: the car on Marine Drive at golden hour, framed right of centre with the bay and skyline behind
await shot('prev-mumbai', { road: 'marineDrive', f: 0.62, dir: -1, cam: [-3.2, 1.1, 6.5], look: [2.2, 0.9, -4] });
// street level in Fort / Colaba
await shot('prev-mumbai-street', { road: 'causeway', f: 0.5, dir: 1, cam: [2.4, 1.3, -6.5], look: [-1.0, 1.2, 8] });
await p.close();
webp('test-output/prev-mumbai.png', 'assets/previews/mumbai.webp', 78);
webp('test-output/prev-mumbai-street.png', 'assets/previews/mumbai-street.webp', 78);
if (process.argv.includes('--circuit')) {
  // Original circuit: start the engine and drive a moment
  p = await ctx.newPage();
  await p.goto(url + '/circuit.html');
  await p.waitForTimeout(4000);
  await p.click('#startBtn');
  await p.keyboard.down('KeyW'); await p.waitForTimeout(2500); await p.keyboard.up('KeyW');
  await p.evaluate(() => document.querySelectorAll('#hud,#hint,#toast,#minimap,#lapHud,#menuBtn').forEach(e => e.style.visibility = 'hidden'));
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'test-output/prev-circuit.png', timeout: 120000 });
  webp('test-output/prev-circuit.png', 'assets/previews/circuit.webp', 78);
}
await browser.close(); srv.close();
