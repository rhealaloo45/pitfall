/* Original open-wheel race car — procedural geometry, fictional "Laloo Racing" livery.
   Inspired by the general proportions of modern single-seaters; no real team's
   shapes, logos or branding are reproduced.
   Origin = vehicle centre of mass (matches VehicleSim), +Z forward, +X left. */
import * as THREE from 'three';
import { loft, wingElement, plate, orientStrut, canvasTexture } from '../core/geo.js';
import { CAR_SPEC } from './sim.js';

const G = -0.345;   // ground height at static ride (relative to CoM)

function materials() {
  const carbonTex = canvasTexture(64, 64, (g, w, h) => {
    g.fillStyle = '#101113'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) {
      g.fillStyle = ((x + y) / 8) % 2 ? '#17181b' : '#0c0d0f';
      g.fillRect(x, y, 8, 4); g.fillStyle = ((x + y) / 8) % 2 ? '#0c0d0f' : '#17181b'; g.fillRect(x, y + 4, 8, 4);
    }
  }, { repeat: true });
  carbonTex.repeat.set(6, 6);
  return {
    paint: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0.05, clearcoat: 0.55, clearcoatRoughness: 0.08, envMapIntensity: 0.7 }),
    red: new THREE.MeshPhysicalMaterial({ color: 0xb3121b, roughness: 0.38, metalness: 0.05, clearcoat: 0.55, clearcoatRoughness: 0.08, envMapIntensity: 0.7 }),
    paintDark: new THREE.MeshPhysicalMaterial({ color: 0x6e0a10, roughness: 0.35, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.1 }),
    white: new THREE.MeshPhysicalMaterial({ color: 0xf1f1ee, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.1 }),
    carbon: new THREE.MeshStandardMaterial({ color: 0xffffff, map: carbonTex, roughness: 0.5, metalness: 0.05 }),
    black: new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.6, metalness: 0.2 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.92, metalness: 0 }),
    rim: new THREE.MeshStandardMaterial({ color: 0x26272b, roughness: 0.35, metalness: 0.85 }),
    titanium: new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.3, metalness: 0.9 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xd8dade, roughness: 0.12, metalness: 1 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x0b1420, roughness: 0.05, metalness: 0.6, clearcoat: 1 }),
    rain: new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1010, emissiveIntensity: 0.2 }),
    hair: new THREE.MeshStandardMaterial({ color: 0x1c1517, roughness: 0.75 }),
    suit: new THREE.MeshStandardMaterial({ color: 0x9e1118, roughness: 0.8 }),
  };
}

function decal(text, { w = 256, h = 128, bg = null, fg = '#fff', font = '900 84px "Titillium Web", Arial, sans-serif', stroke = null } = {}) {
  return canvasTexture(w, h, (g) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); } else g.clearRect(0, 0, w, h);
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (stroke) { g.lineWidth = 8; g.strokeStyle = stroke; g.strokeText(text, w / 2, h / 2 + 4); }
    g.fillStyle = fg; g.fillText(text, w / 2, h / 2 + 4);
  });
}
function decalMesh(tex, w, h) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false }));
  return m;
}

function tyreGeometry(r, w) {
  const pts = [];
  const hw = w / 2;
  const prof = [[0.235, -hw], [0.29, -hw], [0.318, -hw + 0.012], [0.334, -hw + 0.04], [r, -hw + 0.08], [r, hw - 0.08], [0.334, hw - 0.04], [0.318, hw - 0.012], [0.29, hw], [0.235, hw]];
  for (const [rr, y] of prof) pts.push(new THREE.Vector2(rr, y));
  const g = new THREE.LatheGeometry(pts, 40);
  g.rotateZ(Math.PI / 2);
  return g;
}

function sidewallTexture() {
  return canvasTexture(512, 512, (g, W) => {
    g.clearRect(0, 0, W, W);
    const c = W / 2;
    g.strokeStyle = '#d7262e'; g.lineWidth = 12; g.beginPath(); g.arc(c, c, W * 0.44, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#e8e8e8'; g.font = '700 30px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const words = ['PITLINE', 'SOFT', 'PITLINE', 'SOFT'];
    words.forEach((word, k) => {
      const a0 = k * Math.PI / 2;
      for (let i = 0; i < word.length; i++) {
        const a = a0 + (i - word.length / 2) * 0.085;
        g.save(); g.translate(c + Math.cos(a) * W * 0.38, c + Math.sin(a) * W * 0.38); g.rotate(a + Math.PI / 2);
        g.fillText(word[i], 0, 0); g.restore();
      }
    });
  });
}
function rimTexture() {
  return canvasTexture(256, 256, (g, W) => {
    const c = W / 2;
    const grd = g.createRadialGradient(c, c, 4, c, c, c);
    grd.addColorStop(0, '#3a3b40'); grd.addColorStop(0.7, '#1b1c1f'); grd.addColorStop(1, '#0f1012');
    g.fillStyle = grd; g.fillRect(0, 0, W, W);
    g.strokeStyle = '#b00f17'; g.lineWidth = 7; g.beginPath(); g.arc(c, c, c * 0.82, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#5a5c62';
    for (let i = 0; i < 10; i++) { g.save(); g.translate(c, c); g.rotate(i * Math.PI / 5); g.fillRect(-3, c * 0.22, 6, c * 0.52); g.restore(); }
    g.fillStyle = '#d7262e'; g.beginPath(); g.arc(c, c, c * 0.14, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0d0d0f'; g.beginPath(); g.arc(c, c, c * 0.07, 0, Math.PI * 2); g.fill();
  });
}

export function buildCar() {
  const M = materials();
  const root = new THREE.Group(); root.name = 'car';
  const body = new THREE.Group(); root.add(body);   // sprung mass (rolls/pitches with the sim quaternion)

  /* ---- monocoque + nose + engine cover ---- */
  const mono = loft([
    { z: 3.02, hw: 0.06, hh: 0.045, yc: -0.17, eTop: 2.2, eBot: 2.6 },
    { z: 2.7, hw: 0.10, hh: 0.065, yc: -0.14 },
    { z: 2.3, hw: 0.14, hh: 0.095, yc: -0.10 },
    { z: 1.9, hw: 0.17, hh: 0.125, yc: -0.06 },
    { z: 1.4, hw: 0.22, hh: 0.165, yc: -0.01 },
    { z: 1.0, hw: 0.27, hh: 0.19, yc: 0.02 },
    { z: 0.5, hw: 0.33, hh: 0.20, yc: 0.01 },
    { z: 0.0, hw: 0.38, hh: 0.21, yc: 0.0 },
    { z: -0.45, hw: 0.34, hh: 0.27, yc: 0.07 },
    { z: -0.95, hw: 0.27, hh: 0.24, yc: 0.06 },
    { z: -1.45, hw: 0.18, hh: 0.17, yc: 0.0 },
    { z: -1.95, hw: 0.11, hh: 0.11, yc: -0.07 },
    { z: -2.2, hw: 0.07, hh: 0.07, yc: -0.09, eTop: 2.2, eBot: 2.4 },
  ], { radial: 32, sub: 5 });
  // livery: red with a carbon lower half and a white pinstripe
  const liv = canvasTexture(512, 1024, (g, W, H) => {
    g.fillStyle = '#b3121b'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#141416'; g.fillRect(0, 0, W * 0.12, H); g.fillRect(W * 0.88, 0, W * 0.12, H);
    g.fillStyle = '#f1f1ee'; g.fillRect(W * 0.12, H * 0.08, W * 0.01, H * 0.5); g.fillRect(W * 0.87, H * 0.08, W * 0.01, H * 0.5);
    // white nose tip band
    g.fillStyle = '#f1f1ee'; g.fillRect(0, 0, W, H * 0.035);
    // dark red top spine stripe on the engine cover
    g.fillStyle = '#6e0a10'; g.fillRect(W * 0.47, H * 0.55, W * 0.06, H * 0.45);
  });
  M.paint.map = liv;
  const monoMesh = new THREE.Mesh(mono, M.paint); body.add(monoMesh);

  // airbox / roll hoop above and behind the driver
  const airbox = loft([
    { z: 0.06, hw: 0.11, hh: 0.10, yc: 0.40, eTop: 2.4, eBot: 2.4 },
    { z: -0.2, hw: 0.12, hh: 0.14, yc: 0.43 },
    { z: -0.6, hw: 0.09, hh: 0.14, yc: 0.36 },
    { z: -1.1, hw: 0.05, hh: 0.10, yc: 0.24 },
    { z: -1.6, hw: 0.03, hh: 0.05, yc: 0.12 },
  ], { radial: 20, sub: 4 });
  body.add(new THREE.Mesh(airbox, M.paint));
  const intake = new THREE.Mesh(new THREE.CircleGeometry(1, 20), M.black);
  intake.scale.set(0.085, 0.07, 1); intake.position.set(0, 0.45, 0.065); body.add(intake);
  // white band on the airbox
  const band = loft([{ z: -0.05, hw: 0.123, hh: 0.125, yc: 0.42 }, { z: -0.16, hw: 0.124, hh: 0.137, yc: 0.43 }], { radial: 20, sub: 2, capStart: false, capEnd: false });
  band.scale(1.02, 1.02, 1);
  body.add(new THREE.Mesh(band, M.white));
  // shark fin
  const fin = new THREE.Mesh(plate([[-0.5, 0.5], [-1.75, 0.3], [-1.85, 0.12], [-1.3, 0.12], [-0.6, 0.36]], 0.012), M.paintDark);
  body.add(fin);

  /* ---- cockpit opening, driver, steering wheel ---- */
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 32), M.black);
  rim.scale.set(0.27, 0.42, 1); rim.rotation.x = Math.PI / 2; rim.position.set(0, 0.205, 0.5); body.add(rim);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(1, 28), M.black);
  hole.scale.set(0.25, 0.4, 1); hole.rotation.x = -Math.PI / 2; hole.position.set(0, 0.208, 0.5); body.add(hole);
  const driver = new THREE.Group(); driver.position.set(0, 0.36, 0.3); body.add(driver);
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), M.suit);
  shoulders.scale.set(0.2, 0.09, 0.14); shoulders.position.set(0, -0.13, -0.02); driver.add(shoulders);
  const helmetTex = canvasTexture(256, 128, (g, W, H) => {
    g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#c8141c'; g.fillRect(0, H * 0.3, W, H * 0.12);
    g.fillStyle = '#12314f'; g.fillRect(0, H * 0.44, W, H * 0.05);
    g.fillStyle = '#c8141c'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(W * (i + 0.5) / 6, H * 0.2, 9, 0, Math.PI * 2); g.fill(); }
  });
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.13, 28, 20), new THREE.MeshPhysicalMaterial({ map: helmetTex, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 }));
  helmet.scale.set(1, 1.02, 1.12); driver.add(helmet);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.133, 24, 10, -Math.PI * 0.32, Math.PI * 0.64, Math.PI * 0.36, Math.PI * 0.2), M.visor);
  visor.scale.set(1, 1.02, 1.12); driver.add(visor);
  // ponytail (from the original design brief: the driver is a woman with a ponytail)
  const tail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.02, -0.13), new THREE.Vector3(0, -0.07, -0.2), new THREE.Vector3(0.005, -0.15, -0.23), new THREE.Vector3(0.01, -0.22, -0.2)]), 10, 0.03, 8), M.hair);
  driver.add(tail);
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.009, 6, 12), M.red); tie.position.set(0, -0.04, -0.155); tie.rotation.x = 1.0; driver.add(tie);
  const wheelG = new THREE.Group(); wheelG.position.set(0, 0.27, 0.78); wheelG.rotation.x = -0.35; body.add(wheelG);
  const steeringWheel = new THREE.Group(); wheelG.add(steeringWheel);
  const sw = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.13, 0.03), M.carbon); steeringWheel.add(sw);
  for (const s of [1, -1]) { const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.08, 4, 8), M.rubber); grip.position.set(0.13 * s, -0.01, 0); steeringWheel.add(grip); }
  const swScreenCanvas = document.createElement('canvas'); swScreenCanvas.width = 128; swScreenCanvas.height = 64;
  const swScreenTex = new THREE.CanvasTexture(swScreenCanvas); swScreenTex.colorSpace = THREE.SRGBColorSpace;
  const swScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.06), new THREE.MeshBasicMaterial({ map: swScreenTex }));
  swScreen.position.set(0, 0.005, 0.017); steeringWheel.add(swScreen);

  /* ---- halo ---- */
  const haloCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.33, 0.21, 0.12), new THREE.Vector3(0.32, 0.42, 0.3), new THREE.Vector3(0.2, 0.5, 0.62),
    new THREE.Vector3(0, 0.52, 0.74), new THREE.Vector3(-0.2, 0.5, 0.62), new THREE.Vector3(-0.32, 0.42, 0.3), new THREE.Vector3(-0.33, 0.21, 0.12)]);
  body.add(new THREE.Mesh(new THREE.TubeGeometry(haloCurve, 40, 0.028, 10), M.titanium));
  const pillar = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.52, 0.74), new THREE.Vector3(0, 0.4, 0.92), new THREE.Vector3(0, 0.2, 1.02)]), 12, 0.03, 8), M.titanium);
  body.add(pillar);

  /* ---- sidepods ---- */
  for (const s of [1, -1]) {
    const pod = loft([
      { z: 0.88, hw: 0.17, hh: 0.16, xc: 0.55 * s, yc: -0.08, eTop: 2.8, eBot: 3.2 },
      { z: 0.55, hw: 0.21, hh: 0.19, xc: 0.56 * s, yc: -0.09 },
      { z: 0.0, hw: 0.2, hh: 0.17, xc: 0.52 * s, yc: -0.11 },
      { z: -0.6, hw: 0.15, hh: 0.13, xc: 0.42 * s, yc: -0.15 },
      { z: -1.2, hw: 0.08, hh: 0.08, xc: 0.3 * s, yc: -0.2 },
      { z: -1.5, hw: 0.04, hh: 0.05, xc: 0.24 * s, yc: -0.22 },
    ], { radial: 24, sub: 4 });
    body.add(new THREE.Mesh(pod, M.paint));
    const inlet = new THREE.Mesh(new THREE.CircleGeometry(1, 20), M.black);
    inlet.scale.set(0.15, 0.13, 1); inlet.position.set(0.56 * s, -0.07, 0.885); body.add(inlet);
    // side number + team name decals
    const num = decalMesh(decal('27', { fg: '#ffffff', stroke: '#0d0d0f' }), 0.34, 0.17);
    num.position.set(0.765 * s, -0.06, 0.25); num.rotation.y = s * Math.PI / 2; body.add(num);
    const team = decalMesh(decal('LALOO', { w: 512, h: 96, fg: '#ffffff', font: '900 70px "Titillium Web", Arial, sans-serif' }), 0.5, 0.094);
    team.position.set(0.335 * s, 0.17, -0.55); team.rotation.y = s * Math.PI / 2; team.rotation.z = s * -0.12; body.add(team);
    // mirrors
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 6), M.carbon);
    orientStrut(stalk, new THREE.Vector3(0.3 * s, 0.18, 0.92), new THREE.Vector3(0.44 * s, 0.3, 0.98)); body.add(stalk);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.06, 0.05), M.red);
    mirror.position.set(0.46 * s, 0.31, 0.98); body.add(mirror);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.045), M.chrome);
    glass.position.set(0.46 * s, 0.31, 0.954); glass.rotation.y = Math.PI; body.add(glass);
  }
  // nose number
  const noseNum = decalMesh(decal('27', { fg: '#ffffff', stroke: '#6e0a10' }), 0.2, 0.1);
  noseNum.rotation.x = -Math.PI / 2 + 0.16; noseNum.rotation.z = Math.PI; noseNum.position.set(0, 0.048, 2.05);
  noseNum.rotation.set(-Math.PI / 2 + 0.17, 0, Math.PI); body.add(noseNum);

  /* ---- floor, plank, diffuser ---- */
  const fl = [[0.22, 1.7], [0.5, 1.2], [0.78, 0.82], [0.8, -0.9], [0.66, -1.45], [0.52, -1.75], [0.5, -2.0]];
  const floorShape = new THREE.Shape();
  floorShape.moveTo(fl[0][0], fl[0][1]);
  for (const [x, z] of fl) floorShape.lineTo(x, z);
  for (const [x, z] of fl.slice().reverse()) floorShape.lineTo(-x, z);
  const floorG = new THREE.ExtrudeGeometry(floorShape, { depth: 0.025, bevelEnabled: false });
  floorG.rotateX(Math.PI / 2);   // shape y → −z ... fix orientation below
  floorG.scale(1, 1, -1);
  const floor = new THREE.Mesh(floorG, M.carbon); floor.position.y = G + 0.06; body.add(floor);
  const diff = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), M.carbon);
  diff.position.set(0, G + 0.14, -2.12); diff.rotation.x = Math.PI / 2 - 0.42; diff.material = M.carbon; body.add(diff);
  for (let i = -2; i <= 2; i++) {
    const strake = new THREE.Mesh(plate([[-1.85, G + 0.07], [-2.35, G + 0.27], [-2.35, G + 0.1]], 0.01), M.carbon);
    strake.position.x = i * 0.2; body.add(strake);
  }

  /* ---- front wing ---- */
  const fw = new THREE.Group(); fw.position.set(0, G + 0.08, 3.05); body.add(fw);
  const el = (span, chord, y, z, aoa, mat) => { const m = new THREE.Mesh(wingElement(span, chord, 0.1, 0.06, aoa), mat); m.position.set(0, y, z); fw.add(m); return m; };
  el(1.9, 0.30, 0.0, 0.0, -0.06, M.carbon);
  el(1.8, 0.17, 0.07, -0.2, -0.32, M.red);
  el(1.7, 0.13, 0.13, -0.3, -0.55, M.white);
  for (const s of [1, -1]) {
    const ep = new THREE.Mesh(plate([[0.03, -0.02], [-0.4, -0.02], [-0.46, 0.2], [-0.25, 0.24], [0.0, 0.12]], 0.018), M.paintDark);
    ep.position.x = 0.95 * s; fw.add(ep);
    const pylon = new THREE.Mesh(plate([[-0.05, 0.02], [-0.35, 0.02], [-0.6, 0.14], [-0.4, 0.15]], 0.012), M.carbon);
    pylon.position.x = 0.07 * s; fw.add(pylon);
  }

  /* ---- rear wing + beam wing + rain light ---- */
  const rw = new THREE.Group(); rw.position.set(0, 0, -2.08); body.add(rw);
  const rmain = new THREE.Mesh(wingElement(1.0, 0.32, 0.12, 0.07, 0.12), M.carbon); rmain.position.set(0, 0.5, 0); rw.add(rmain);
  const flap = new THREE.Mesh(wingElement(1.0, 0.2, 0.1, 0.07, -0.25), M.red); flap.position.set(0, 0.6, -0.22); rw.add(flap);
  const beam = new THREE.Mesh(wingElement(0.86, 0.18, 0.12, 0.05, 0.1), M.carbon); beam.position.set(0, 0.04, -0.05); rw.add(beam);
  const epTex = canvasTexture(256, 256, (g, W, H) => {
    g.fillStyle = '#121315'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#a10c14'; g.fillRect(0, 0, W, H * 0.34);
    g.fillStyle = '#f1f1ee'; g.fillRect(0, H * 0.34, W, H * 0.03);
    g.save(); g.translate(W * 0.5, H * 0.66); g.fillStyle = '#e8e8e8'; g.font = '900 38px "Titillium Web", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('LALOO', 0, 0); g.restore();
  });
  const epMat = new THREE.MeshPhysicalMaterial({ map: epTex, roughness: 0.35, clearcoat: 0.8 });
  for (const s of [1, -1]) {
    const ep = new THREE.Mesh(plate([[0.04, 0.0], [-0.4, 0.0], [-0.42, 0.66], [-0.05, 0.66], [0.04, 0.42]], 0.02), epMat);
    ep.position.x = 0.51 * s; rw.add(ep);
  }
  for (const s of [1, -1]) {
    const neck = new THREE.Mesh(plate([[0.25, 0.0], [0.05, 0.0], [-0.12, 0.52], [-0.05, 0.62], [0.02, 0.55]], 0.014), M.carbon);
    neck.position.x = 0.05 * s; rw.add(neck);
  }
  const rain = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.02), M.rain);
  rain.position.set(0, -0.03, -0.17); rw.add(rain);

  /* ---- wheels + suspension (unsprung parts are positioned every frame) ---- */
  const sideTex = sidewallTexture(), rimTex = rimTexture();
  const sideMat = new THREE.MeshStandardMaterial({ map: sideTex, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 });
  const rimMat = new THREE.MeshStandardMaterial({ map: rimTex, roughness: 0.4, metalness: 0.6 });
  const wheels = [];
  const spec = CAR_SPEC;
  const armMat = M.carbon;
  spec.wheels.forEach((w, i) => {
    const width = w.front ? 0.3 : 0.38;
    const hub = new THREE.Group();                 // position + steer
    const spin = new THREE.Group(); hub.add(spin); // rotation about axle
    const tyre = new THREE.Mesh(tyreGeometry(spec.wheelRadius, width), M.rubber); spin.add(tyre);
    const side = Math.sign(w.x);
    for (const face of [1, -1]) {
      const sw2 = new THREE.Mesh(new THREE.RingGeometry(0.23, 0.335, 48), sideMat);
      sw2.rotation.y = face * Math.PI / 2; sw2.position.x = face * (width / 2 + 0.001); spin.add(sw2);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.235, 32), rimMat);
      disc.rotation.y = face * Math.PI / 2; disc.position.x = face * (width / 2 - 0.02); spin.add(disc);
    }
    // brake duct / upright (does not spin)
    const duct = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.24), M.carbon); duct.position.x = -side * (width / 2 + 0.04); hub.add(duct);
    root.add(hub);
    // wishbones: inner points fixed to the chassis, outer points follow the hub
    const inner = w.front
      ? [[0.17, 0.06, w.z + 0.22], [0.17, 0.06, w.z - 0.2], [0.14, -0.17, w.z + 0.25], [0.14, -0.17, w.z - 0.25], [0.12, 0.12, w.z - 0.05]]
      : [[0.26, 0.04, w.z + 0.28], [0.26, 0.04, w.z - 0.15], [0.24, -0.18, w.z + 0.3], [0.24, -0.18, w.z - 0.2], [0.22, 0.1, w.z + 0.05]];
    const arms = inner.map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1, 6), armMat); root.add(m); return m; });
    wheels.push({ hub, spin, arms, inner: inner.map(p => new THREE.Vector3(p[0] * side, p[1], p[2])), side, width, front: w.front, x: w.x, z: w.z });
  });

  /* ---- contact shadow (cheap grounding under the car) ---- */
  const shadowTex = canvasTexture(128, 256, (g, W, H) => {
    const grd = g.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, H / 2);
    grd.addColorStop(0, 'rgba(0,0,0,0.6)'); grd.addColorStop(0.6, 'rgba(0,0,0,0.35)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
  }, { srgb: false });
  const contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 6.2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 }));
  contactShadow.rotation.x = -Math.PI / 2; contactShadow.renderOrder = 1;

  body.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  root.traverse(o => { if (o.isMesh && o.parent !== body && o !== contactShadow) o.castShadow = true; });

  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();
  let screenTimer = 0;
  return {
    root, body, contactShadow, helmet: driver, rainLight: M.rain, materials: M,
    setLivery(name) {
      const gold = name === 'gold';
      M.paint.map = gold ? canvasTexture(512, 1024, (g, W, H) => { g.fillStyle = '#c99a2e'; g.fillRect(0, 0, W, H); g.fillStyle = '#141416'; g.fillRect(0, 0, W * 0.12, H); g.fillRect(W * 0.88, 0, W * 0.12, H); g.fillStyle = '#fff3c4'; g.fillRect(0, 0, W, H * 0.035); }) : liv;
      M.paint.metalness = gold ? 0.55 : 0.05; M.paint.roughness = gold ? 0.28 : 0.38;
      M.red.color.set(gold ? 0xc99a2e : 0xb3121b); M.red.metalness = gold ? 0.55 : 0.05;
      M.paint.needsUpdate = true;
    },
    /** Pose the car from the interpolated sim state. */
    update(pos, quat, sim, dt, ground) {
      root.position.copy(pos);
      root.quaternion.copy(quat);
      wheels.forEach((wv, i) => {
        const w = sim.wheels[i];
        const y = spec.mountY - w.len;
        wv.hub.position.set(wv.x, y, wv.z);
        wv.hub.rotation.set(0, w.steer || 0, 0);
        wv.spin.rotation.x = w.spin;
        const top = _a.set(wv.x - wv.side * 0.06, y + 0.12, wv.z);
        const bot = _b.set(wv.x - wv.side * 0.06, y - 0.12, wv.z);
        wv.arms.forEach((arm, k) => {
          const outer = k < 2 ? top : k < 4 ? bot : (k === 4 ? bot : top);
          orientStrut(arm, wv.inner[k], outer);
        });
      });
      steeringWheel.rotation.z = -(sim.steerAngle || 0) * 3.2;
      driver.rotation.y = (sim.steerAngle || 0) * 0.6;
      // braking flashes the rain light
      M.rain.emissiveIntensity = sim.brakeLight ? 3 : 0.25;
      // contact shadow sits on the ground under the car, flattened
      if (ground != null) {
        contactShadow.position.set(pos.x, ground + 0.03, pos.z);
        const f = _a.set(0, 0, 1).applyQuaternion(quat);
        contactShadow.rotation.set(-Math.PI / 2, 0, Math.atan2(f.x, f.z));
        const lift = Math.max(0, pos.y - ground - 0.35);
        contactShadow.material.opacity = Math.max(0, 1 - lift * 1.5);
      }
      screenTimer -= dt;
      if (screenTimer <= 0) {
        screenTimer = 0.12;
        const g = swScreenCanvas.getContext('2d');
        g.fillStyle = '#05070a'; g.fillRect(0, 0, 128, 64);
        const n = Math.round(Math.min(1, sim.rpm / 12800) * 12);
        for (let k = 0; k < 12; k++) { g.fillStyle = k < n ? (k < 5 ? '#26d07c' : k < 9 ? '#ff3030' : '#4aa3ff') : '#1a1d22'; g.fillRect(6 + k * 9.7, 4, 7, 8); }
        g.fillStyle = '#fff'; g.font = '700 30px Arial'; g.textAlign = 'center';
        g.fillText(sim.gear === -1 ? 'R' : String(sim.gear), 64, 48);
        g.font = '700 14px Arial'; g.textAlign = 'left'; g.fillText(String(Math.round(sim.speed * 3.6)), 6, 56);
        swScreenTex.needsUpdate = true;
      }
    },
  };
}
