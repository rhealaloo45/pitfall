/* Sky, sun, environment lighting, haze and time of day. Uses three.js' Sky
   shader (MIT, part of the three.js distribution). */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export const TIMES = {
  dawn:    { label: 'Dawn',        elev: 4,   azim: 95,  sun: 0xffb27a, sunI: 1.6, hemiSky: 0x8fa7c8, hemiGround: 0x4a3c30, hemiI: 0.55, fog: 0xc9b6a2, fogD: 0.0011, turb: 9, ray: 2.2, night: 0.35, exposure: 0.62 },
  morning: { label: 'Morning',     elev: 24,  azim: 110, sun: 0xfff0d6, sunI: 2.6, hemiSky: 0xb9d0ea, hemiGround: 0x5c5440, hemiI: 0.55, fog: 0xc9d0d4, fogD: 0.00085, turb: 6, ray: 1.6, night: 0, exposure: 0.5 },
  noon:    { label: 'Midday',      elev: 62,  azim: 170, sun: 0xffffff, sunI: 3.0, hemiSky: 0xc4daf0, hemiGround: 0x60584a, hemiI: 0.8, fog: 0xd9dee2, fogD: 0.0008, turb: 5, ray: 1.2, night: 0, exposure: 0.5 },
  golden:  { label: 'Golden hour', elev: 7,   azim: 262, sun: 0xffa95c, sunI: 2.3, hemiSky: 0x9fb2cf, hemiGround: 0x584231, hemiI: 0.6, fog: 0xd8b48e, fogD: 0.001, turb: 8, ray: 2.6, night: 0.15, exposure: 0.6 },
  dusk:    { label: 'Dusk',        elev: -2,  azim: 268, sun: 0xff7a45, sunI: 0.7, hemiSky: 0x5d6d96, hemiGround: 0x2c2430, hemiI: 0.45, fog: 0x6e6378, fogD: 0.0012, turb: 10, ray: 3, night: 0.8, exposure: 0.85 },
  night:   { label: 'Night',       elev: -18, azim: 300, sun: 0x9fb4ff, sunI: 0.25, hemiSky: 0x24304f, hemiGround: 0x101014, hemiI: 0.35, fog: 0x141a26, fogD: 0.0013, turb: 2, ray: 0.5, night: 1, exposure: 1.0 },
};

export class Atmosphere {
  constructor(renderer, scene) {
    this.renderer = renderer; this.scene = scene;
    this.night = { value: 0 };            // shared uniform: windows, lamps, signs glow
    this.sky = new Sky(); this.sky.scale.setScalar(9000); this.sky.name = 'sky';
    scene.add(this.sky);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.00025; this.sun.shadow.normalBias = 0.04;
    const sc = this.sun.shadow.camera; sc.left = -95; sc.right = 95; sc.top = 95; sc.bottom = -95; sc.near = 10; sc.far = 900;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.7); scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xcccccc, 0.001);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky(); this.envSky.scale.setScalar(1000); this.envScene.add(this.envSky);
    this.sunDir = new THREE.Vector3();
    this.horizon = new THREE.Color(); this.zenith = new THREE.Color();
    this.key = 'morning';
  }

  setShadowQuality(size) {
    if (!size) { this.sun.castShadow = false; return; }
    this.sun.castShadow = true;
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.sun.shadow.mapSize.set(size, size);
  }

  set(key) {
    const T = TIMES[key] || TIMES.morning; this.key = key; this.T = T;
    const phi = THREE.MathUtils.degToRad(90 - T.elev), theta = THREE.MathUtils.degToRad(T.azim);
    // azimuth measured from north (−Z) clockwise toward east (+X)
    this.sunDir.setFromSphericalCoords(1, phi, 0).set(Math.sin(theta) * Math.sin(phi), Math.cos(phi), -Math.cos(theta) * Math.sin(phi));
    for (const sky of [this.sky, this.envSky]) {
      const u = sky.material.uniforms;
      u.turbidity.value = T.turb; u.rayleigh.value = T.ray; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.86;
      u.sunPosition.value.copy(this.sunDir);
    }
    this.sky.visible = true;
    const lightDir = T.elev > -4 ? this.sunDir.clone() : new THREE.Vector3(-0.35, 0.8, 0.45).normalize();   // moonlight from high up at night
    this.lightDir = lightDir;
    this.sun.color.set(T.sun); this.sun.intensity = T.sunI;
    this.hemi.color.set(T.hemiSky); this.hemi.groundColor.set(T.hemiGround); this.hemi.intensity = T.hemiI;
    this.scene.fog.color.set(T.fog); this.scene.fog.density = T.fogD;
    this.renderer.toneMappingExposure = T.exposure;
    this.night.value = T.night;
    this.horizon.set(T.fog); this.zenith.set(T.hemiSky);
    // environment map from the sky for reflections (night: dim it)
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0.02);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = T.night > 0.6 ? 0.2 : 0.65;
    if (this.onChange) this.onChange(T);
  }

  /** Keep the shadow frustum centred on the player. */
  follow(target) {
    const d = this.lightDir || this.sunDir;
    // snap to texel grid to avoid shimmering
    const step = 190 / (this.sun.shadow.mapSize.x || 1024);
    const tx = Math.round(target.x / step) * step, tz = Math.round(target.z / step) * step;
    this.sun.target.position.set(tx, target.y, tz);
    this.sun.position.set(tx + d.x * 400, target.y + Math.max(0.15, d.y) * 400, tz + d.z * 400);
    this.sun.target.updateMatrixWorld();
  }
}
