/* Toy-diorama atmosphere: gradient backdrop (no realistic sky), warm key light,
   lavender fill, soft haze, and an environment map built from the same gradient
   so reflections match the mood. Each time of day is a colour script. */
import * as THREE from 'three';

export const TIMES = {
  morning: { label: 'Morning',     top: '#9cc2f2', mid: '#cfe0f5', bottom: '#f7dccb', sun: 0xffe2b8, sunI: 3.4, elev: 44, azim: 140, hemiSky: 0xc8d6ff, hemiGround: 0xe9c39a, hemiI: 0.95, fog: 0xdfe2ef, fogD: 0.00042, night: 0, exposure: 0.8 },
  golden:  { label: 'Golden hour', top: '#8fb0ea', mid: '#f3c9b8', bottom: '#ffc58f', sun: 0xffc27a, sunI: 3.0, elev: 22, azim: 250, hemiSky: 0xc6c8f2, hemiGround: 0xf2b788, hemiI: 1.05, fog: 0xf0cdb8, fogD: 0.00048, night: 0.1, exposure: 0.8 },
  dusk:    { label: 'Dusk',        top: '#3b4a8f', mid: '#a06aa8', bottom: '#f39c7a', sun: 0xff9a6a, sunI: 1.4, elev: 10, azim: 262, hemiSky: 0x8a86d0, hemiGround: 0xa0607a, hemiI: 0.9, fog: 0xa77a9e, fogD: 0.0005, night: 0.65, exposure: 0.95 },
  night:   { label: 'Night',       top: '#141c4a', mid: '#2a2f7a', bottom: '#6a3f86', sun: 0x8fa6ff, sunI: 0.55, elev: 55, azim: 320, hemiSky: 0x4b55b8, hemiGround: 0x3a2850, hemiI: 0.75, fog: 0x2b2f6e, fogD: 0.0005, night: 1, exposure: 1.05 },
};
export const DEFAULT_TIME = 'morning';

function gradientTexture(T) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, T.top); grd.addColorStop(0.55, T.mid); grd.addColorStop(1, T.bottom);
  g.fillStyle = grd; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Atmosphere {
  constructor(renderer, scene) {
    this.renderer = renderer; this.scene = scene;
    this.night = { value: 0 };                 // shared uniform: windows, lamps, signs
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.05;
    const sc = this.sun.shadow.camera; sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 10; sc.far = 900;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1); scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xcccccc, 0.0005);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    // environment: a sphere with the same gradient, a warm "sun" patch and a sandy floor
    this.envScene = new THREE.Scene();
    this.envMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() }, sunCol: { value: new THREE.Color() } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top, mid, bottom, sunCol, sunDir; varying vec3 vD;
        void main(){ float y = vD.y; vec3 c = y > 0.0 ? mix(mid, top, smoothstep(0.0, 0.8, y)) : mix(mid, bottom * 0.7, smoothstep(0.0, -0.4, y));
          c += sunCol * pow(max(dot(vD, sunDir), 0.0), 60.0) * 3.0; gl_FragColor = vec4(c, 1.0); }`,
    });
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.envMat));
    this.sunDir = new THREE.Vector3();
    this.horizon = new THREE.Color(); this.zenith = new THREE.Color();
  }

  setShadowQuality(size) {
    if (!size) { this.sun.castShadow = false; return; }
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(size, size);
  }

  set(key) {
    const T = TIMES[key] || TIMES[DEFAULT_TIME]; this.key = key in TIMES ? key : DEFAULT_TIME; this.T = T;
    const phi = THREE.MathUtils.degToRad(90 - T.elev), theta = THREE.MathUtils.degToRad(T.azim);
    this.sunDir.set(Math.sin(theta) * Math.sin(phi), Math.cos(phi), -Math.cos(theta) * Math.sin(phi)).normalize();
    this.lightDir = this.sunDir;
    if (this.bg) this.bg.dispose();
    this.bg = gradientTexture(T);
    this.scene.background = this.bg;
    this.sun.color.set(T.sun); this.sun.intensity = T.sunI;
    this.hemi.color.set(T.hemiSky); this.hemi.groundColor.set(T.hemiGround); this.hemi.intensity = T.hemiI;
    this.scene.fog.color.set(T.fog); this.scene.fog.density = T.fogD;
    this.renderer.toneMappingExposure = T.exposure;
    this.night.value = T.night;
    this.horizon.set(T.mid); this.zenith.set(T.top);
    const u = this.envMat.uniforms;
    u.top.value.set(T.top); u.mid.value.set(T.mid); u.bottom.value.set(T.bottom);
    u.sunDir.value.copy(this.sunDir); u.sunCol.value.set(T.sun).multiplyScalar(T.night > 0.5 ? 0.1 : 1);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0.03);
    this.scene.environment = this.envRT.texture;
    if (this.onChange) this.onChange(T);
  }

  /** Keep the shadow frustum centred on the player (texel-snapped to avoid shimmer). */
  follow(target) {
    const d = this.sunDir;
    const step = 150 / (this.sun.shadow.mapSize.x || 1024);
    const tx = Math.round(target.x / step) * step, tz = Math.round(target.z / step) * step;
    this.sun.target.position.set(tx, target.y, tz);
    this.sun.position.set(tx + d.x * 400, target.y + d.y * 400, tz + d.z * 400);
    this.sun.target.updateMatrixWorld();
  }
}
