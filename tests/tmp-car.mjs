import { serve, launch } from './harness.mjs';
const { srv, url } = await serve();
const { browser, ctx } = await launch({ width: 900, height: 560 });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto(url + '/tests/blank.html');
await p.evaluate(async () => {
  const THREE = await import('three');
  const { buildCar } = await import('/src/vehicle/car-model.js');
  const { Sky } = await import('three/addons/objects/Sky.js');
  const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(900, 560); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.6; r.shadowMap.enabled = true;
  document.body.appendChild(r.domElement);
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x8fa6bf);
  const pm = new THREE.PMREMGenerator(r); const es = new THREE.Scene(); const sky = new Sky(); sky.scale.setScalar(1000); sky.material.uniforms.sunPosition.value.set(0.4, 0.5, 0.3); es.add(sky);
  sc.environment = pm.fromScene(es).texture;
  const sun = new THREE.DirectionalLight(0xffffff, 2.5); sun.position.set(5, 8, 4); sun.castShadow = true; sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.03; sc.add(sun, new THREE.HemisphereLight(0xbfd6ee, 0x55503f, 0.7));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.9 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.345; ground.receiveShadow = true; sc.add(ground);
  const car = buildCar(); sc.add(car.root);
  const sim = { wheels: [0,1,2,3].map(() => ({ len: 0.185, spin: 0, steer: 0 })), steerAngle: 0.2, rpm: 9000, gear: 3, speed: 30 };
  sim.wheels[0].steer = sim.wheels[1].steer = 0.2;
  car.update(new THREE.Vector3(), new THREE.Quaternion(), sim, 1, null);
  const cam = new THREE.PerspectiveCamera(40, 900 / 560, 0.1, 100);
  window.shot = (x, y, z) => { cam.position.set(x, y, z); cam.lookAt(0, 0, 0.2); r.render(sc, cam); };
});
for (const [n, pos] of [['front34', [5, 2.2, 6.5]], ['side', [7.5, 1.2, 0.2]], ['rear34', [-4.5, 2.4, -6.5]], ['top', [0.01, 9, 0.5]]]) {
  await p.evaluate(a => window.shot(...a), pos);
  await p.screenshot({ path: `test-output/car-${n}.png` });
}
await browser.close(); srv.close();
