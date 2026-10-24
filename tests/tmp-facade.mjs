import { serve, launch } from './harness.mjs';
const { srv, url } = await serve();
const { browser, ctx } = await launch({ width: 900, height: 600 });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto(url + '/tests/blank.html');
await p.evaluate(async () => {
  const THREE = await import('three');
  const { FacadeBuilder, facadeMaterial, STYLE } = await import('/src/mumbai/buildings.js');
  const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(900, 600); document.body.appendChild(r.domElement);
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x9cc2f2);
  sc.add(new THREE.HemisphereLight(0xffffff, 0x998877, 1.5)); const d = new THREE.DirectionalLight(0xffffff, 2); d.position.set(3, 5, 8); sc.add(d);
  const B = new FacadeBuilder();
  B.pillow(0, 0, 9, 4, 0, 0, 14, { r: 1.2, b: 0.9, col: new THREE.Color(0xf3a7a2), fac: [STYLE.residential, 3.4, 3.4, 12.3], roofCol: new THREE.Color(0xcccccc) });
  sc.add(new THREE.Mesh(B.geometry(), facadeMaterial({ value: 0 })));
  const cam = new THREE.PerspectiveCamera(40, 1.5, 0.1, 200); cam.position.set(0, 7, 22); cam.lookAt(0, 6, 0); r.render(sc, cam);
});
await p.screenshot({ path: 'test-output/facade.png' });
await browser.close(); srv.close();
