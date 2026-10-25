/* Atmosphere: analytic sky (gradient + sun glow + high cloud), aerial-perspective
   fog that matches the sky at the horizon (warmer towards the sun, thinner with
   height), image-based lighting rendered from the same sky, and sun shadows —
   cascaded on Medium/High so the whole visible city casts shadows, a single
   player-following map on Low.

   Colours are art-directed per time of day (sRGB hex, converted to linear). */
import * as THREE from 'three';
import { CSM } from 'three/addons/csm/CSM.js';

export const TIMES = {
  morning: {
    label: 'Morning', elev: 26, azim: 102,
    zenith: '#4f7fbf', horizon: '#c9d3da', glow: '#ffe2b8', sunHaze: '#fff0d8', ground: '#4c4f50',
    skyI: 1.0, fogI: 1.05, sun: '#fff0dc', sunI: 3.3, fogD: 0.00042, clouds: 0.35, night: 0, exposure: 0.92,
  },
  golden: {
    label: 'Golden hour', elev: 15, azim: 250,
    zenith: '#3c6aab', horizon: '#e6c3a2', glow: '#ffb067', sunHaze: '#ffa95e', ground: '#4a4744',
    skyI: 1.0, fogI: 1.0, sun: '#ffc690', sunI: 3.2, fogD: 0.00046, clouds: 0.55, night: 0.06, exposure: 0.95,
  },
  dusk: {
    label: 'Dusk', elev: -2.5, azim: 262, lightElev: 5,
    zenith: '#1c2c55', horizon: '#c98c6e', glow: '#ff8a4f', sunHaze: '#ff8f5a', ground: '#2b2a2e',
    skyI: 0.55, fogI: 0.55, sun: '#ff9c66', sunI: 0.55, fogD: 0.0005, clouds: 0.45, night: 0.7, exposure: 1.2,
  },
  night: {
    label: 'Night', elev: 38, azim: 140, moon: true,
    zenith: '#070a14', horizon: '#3b3138', glow: '#000000', sunHaze: '#4a3a30', ground: '#141318',
    skyI: 0.45, fogI: 0.42, sun: '#9fb4ff', sunI: 0.28, fogD: 0.00048, clouds: 0.18, night: 1, exposure: 1.55,
  },
};
export const DEFAULT_TIME = 'golden';

/* ---------- fog: aerial perspective shared by every material ---------- */
export const FOG_UNIFORMS = {
  fogSunColor: { value: new THREE.Color(0, 0, 0) },
  fogSunDir: { value: new THREE.Vector3(0, 1, 0) },
  fogHeight: { value: new THREE.Vector2(0.0045, 0) },   // x: density falloff per metre, y: base height
};
THREE.ShaderChunk.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif`;
THREE.ShaderChunk.fog_vertex = /* glsl */`
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorld = ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz;   // camera → vertex, world space
#endif`;
THREE.ShaderChunk.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform vec3 fogSunColor;
  uniform vec3 fogSunDir;
  uniform vec2 fogHeight;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
THREE.ShaderChunk.fog_fragment = /* glsl */`
#ifdef USE_FOG
  float fogDist = length( vFogWorld );
  #ifdef FOG_EXP2
    float fogTau = fogDensity * fogDensity * fogDist * fogDist;
    if ( fogHeight.x > 0.0 ) {
      // exponential height fog: average density along the ray
      float fa = clamp( fogHeight.x * vFogWorld.y, -60.0, 60.0 );
      float integ = abs( fa ) > 1e-4 ? ( 1.0 - exp( - fa ) ) / fa : 1.0;
      fogTau *= exp( - fogHeight.x * max( cameraPosition.y - fogHeight.y, 0.0 ) ) * integ;
    }
    float fogFactor = 1.0 - exp( - fogTau );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  vec3 fogDirN = vFogWorld / max( fogDist, 1e-3 );
  vec3 fogCol = fogColor + fogSunColor * pow( max( dot( fogDirN, fogSunDir ), 0.0 ), 5.0 );
  #ifdef TONE_MAPPING
    fogCol = toneMapping( fogCol );
  #endif
  fogCol = linearToOutputTexel( vec4( fogCol, 1.0 ) ).rgb;
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, fogFactor );
#endif`;

/** Add the shared fog uniforms to a compiled shader (call from onBeforeCompile). */
export function fogUniforms(shader) { Object.assign(shader.uniforms, FOG_UNIFORMS); }
// safety net: materials without their own onBeforeCompile still get the uniforms
THREE.Material.prototype.onBeforeCompile = function (shader) { fogUniforms(shader); };

/* ---------- sky ---------- */
const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4( mat3( viewMatrix ) * position, 1.0 );
  gl_Position = vec4( p.xy, p.w * 0.99999, p.w );
}`;
const SKY_FRAG = /* glsl */`
uniform vec3 uZenith, uHorizon, uGlow, uGround, uSunDir, uSunCol, fogColor, fogSunColor;
uniform float uNight, uTime, uEnv, uCloud, uSunVis;
varying vec3 vDir;
float h21( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float vn( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( h21( i ), h21( i + vec2( 1, 0 ) ), f.x ), mix( h21( i + vec2( 0, 1 ) ), h21( i + vec2( 1, 1 ) ), f.x ), f.y ); }
float fbm( vec2 p ) { float a = 0.5, s = 0.0; for ( int i = 0; i < 5; i ++ ) { s += a * vn( p ); p = p * 2.03 + vec2( 17.1, 3.7 ); a *= 0.5; } return s; }
void main() {
  vec3 d = normalize( vDir );
  float y = d.y;
  float cosT = dot( d, uSunDir );
  float up = clamp( y, 0.0, 1.0 );
  vec3 col = mix( uHorizon, uZenith, pow( up, 0.42 ) );
  float mu = max( cosT, 0.0 );
  col += uGlow * ( pow( mu, 5.0 ) * 0.45 + pow( mu, 48.0 ) * 0.9 ) * ( 1.0 - 0.55 * pow( up, 0.5 ) );
  // horizon: blend to the exact fog colour so distant geometry melts into the sky
  vec3 fogC = fogColor + fogSunColor * pow( mu, 5.0 );
  col = mix( fogC, col, smoothstep( 0.0, 0.16, y ) );
  // high cloud: thin streaks, lit from the sun side
  if ( uCloud > 0.0 && y > 0.0 ) {
    vec2 uv = d.xz / ( y + 0.15 );
    float n = fbm( vec2( uv.x * 0.9, uv.y * 2.2 ) + vec2( uTime * 0.004, 0.0 ) );
    float c = smoothstep( 0.52, 0.86, n ) * uCloud * smoothstep( 0.02, 0.22, y );
    vec3 lit = mix( uHorizon * 1.1, uGlow * 1.6 + uHorizon * 0.6, pow( mu, 3.0 ) );
    col = mix( col, lit, c * 0.75 );
  }
  if ( y < 0.0 ) col = uEnv > 0.5 ? mix( fogC, uGround, smoothstep( 0.0, -0.18, y ) ) : fogC;
  // environment only: a soft skyline band so paint and glass reflect a city, not a void
  if ( uEnv > 0.5 && y > -0.02 && y < 0.09 ) {
    float az = atan( d.z, d.x );
    float hgt = 0.018 + 0.05 * vn( vec2( az * 9.0, 1.0 ) ) * vn( vec2( az * 31.0, 4.0 ) );
    float m = step( y, hgt );
    vec3 bldg = uGround * 0.9 + uSunCol * 0.04 * ( 1.0 - uNight );
    bldg += vec3( 1.0, 0.72, 0.42 ) * uNight * 0.25 * step( 0.72, vn( vec2( az * 160.0, y * 260.0 ) ) );
    col = mix( col, bldg, m * 0.85 );
  }
  // sun disc (the IBL gets a broad hotspot instead, to keep reflections calm)
  float disc = smoothstep( 0.99965, 0.99985, cosT ) * uSunVis * step( -0.01, y );
  col += uSunCol * disc * ( uEnv > 0.5 ? 2.0 : 14.0 );
  // stars
  if ( uNight > 0.5 && y > 0.05 && uEnv < 0.5 ) {
    vec2 sp = d.xz / ( y + 1.0 ) * 380.0;
    float s = step( 0.9965, h21( floor( sp ) ) ) * smoothstep( 0.05, 0.35, y );
    col += vec3( 0.55, 0.6, 0.75 ) * s * 0.6;
  }
  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function skyMaterial(shared, env) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uEnv: { value: env ? 1 : 0 } },
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
}
const lin = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);

/** Layer 1 = small street detail. Cameras that should see it must enable layer 1. */
export const DETAIL_LAYER = 1;
export function markDetail(obj) { obj.traverse(o => o.layers.set(DETAIL_LAYER)); return obj; }

export class Atmosphere {
  constructor(renderer, scene) {
    this.renderer = renderer; this.scene = scene;
    this.night = { value: 0 };                 // shared uniform: windows, lamps, signs
    this.sunDir = new THREE.Vector3(0, 1, 0);  // towards the sun (sky)
    this.lightDir = new THREE.Vector3(0, 1, 0);// towards the light actually used for shading
    this.horizon = new THREE.Color(); this.zenith = new THREE.Color();
    this.listeners = [];
    // single sun (Low quality, or before cascades are enabled)
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.shadow.bias = -0.0003; this.sun.shadow.normalBias = 0.04;
    const sc = this.sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 10; sc.far = 900;
    scene.add(this.sun, this.sun.target);
    scene.fog = new THREE.FogExp2(0xcccccc, 0.0005);
    // sky
    this.skyU = {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() }, uSunDir: { value: this.sunDir }, uSunCol: { value: new THREE.Color() },
      fogColor: { value: new THREE.Color() }, fogSunColor: FOG_UNIFORMS.fogSunColor,
      uNight: this.night, uTime: { value: 0 }, uCloud: { value: 0.5 }, uSunVis: { value: 1 },
    };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMaterial(this.skyU, false));
    this.sky.frustumCulled = false; this.sky.renderOrder = 1e6; this.sky.name = 'sky';
    this.sky.userData.noAO = true;
    scene.add(this.sky);
    scene.background = null;
    // environment (IBL) rendered from the same sky
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMaterial(this.skyU, true));
    this.envSky.frustumCulled = false;
    this.envScene.add(this.envSky);
    this.csm = null;
    this.prepared = new WeakSet();
  }

  /** Shadows. Q.cascades > 0 → cascaded shadow maps over Q.shadowFar metres; otherwise one map around the player. */
  setShadowQuality(Q, camera) {
    const size = Q.shadows || 0;
    if (!size) { this.sun.castShadow = false; return; }
    if (Q.cascades > 1 && camera && this.renderer.capabilities.isWebGL2) {
      this.sun.castShadow = false; this.sun.visible = false;
      this.csm = new CSM({
        camera, parent: this.scene, cascades: Q.cascades, maxFar: Q.shadowFar || 500, mode: 'practical',
        shadowMapSize: size, lightDirection: new THREE.Vector3(0, -1, 0), lightIntensity: 3, lightNear: 1, lightFar: 3000, lightMargin: 300,
      });
      this.csm.fade = true;
      // small street detail (layer 1: trees, cars, props) only casts into the near cascades
      const detailCascades = Q.cascades >= 3 ? 2 : 1;
      this.csm.lights.forEach((l, i) => { l.shadow.bias = -0.0002; l.shadow.camera.layers.mask = i < detailCascades ? 3 : 1; });
      return;
    }
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.camera.layers.mask = 3;
  }

  /** Give every material the fog uniforms and (with cascades) the CSM defines. Safe to call repeatedly. */
  prepareMaterials(root) {
    const csm = this.csm, seen = this.prepared;
    const breaks = [];
    root.traverse(o => {
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        if (seen.has(m)) continue;
        seen.add(m);
        const own = Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile') ? m.onBeforeCompile : null;
        const lit = csm && !m.isShaderMaterial && !m.isMeshBasicMaterial && !m.isSpriteMaterial && !m.isPointsMaterial && !m.isLineBasicMaterial && !m.isMeshDepthMaterial && !m.isMeshDistanceMaterial;
        if (lit) { m.defines = m.defines || {}; m.defines.USE_CSM = 1; m.defines.CSM_CASCADES = csm.cascades; if (csm.fade) m.defines.CSM_FADE = ''; }
        if (!own && !lit) continue;   // prototype hook already adds fog uniforms
        const key = (own ? own.toString() : '') + (lit ? '|csm' + csm.cascades : '');
        m.onBeforeCompile = function (shader, renderer) {
          if (own) own.call(this, shader, renderer);
          fogUniforms(shader);
          if (lit) {
            csm.getExtendedBreaks(breaks);
            shader.uniforms.CSM_cascades = { value: breaks };
            shader.uniforms.cameraNear = { value: csm.camera.near };
            shader.uniforms.shadowFar = { value: Math.min(csm.camera.far, csm.maxFar) };
            csm.shaders.set(m, shader);
          }
        };
        m.customProgramCacheKey = () => key;
        if (lit) csm.shaders.set(m, null);
        m.needsUpdate = true;
      }
    });
  }

  set(key) {
    const T = TIMES[key] || TIMES[DEFAULT_TIME]; this.key = key in TIMES ? key : DEFAULT_TIME; this.T = T;
    const dirFrom = (elev, azim, out) => {
      const phi = THREE.MathUtils.degToRad(90 - elev), theta = THREE.MathUtils.degToRad(azim);
      return out.set(Math.sin(theta) * Math.sin(phi), Math.cos(phi), -Math.cos(theta) * Math.sin(phi)).normalize();
    };
    dirFrom(T.elev, T.azim, this.sunDir);
    dirFrom(Math.max(T.lightElev ?? T.elev, 4), T.azim, this.lightDir);
    const u = this.skyU;
    u.uZenith.value.copy(lin(T.zenith, T.skyI)); u.uHorizon.value.copy(lin(T.horizon, T.skyI));
    u.uGlow.value.copy(lin(T.glow, T.skyI * 0.9)); u.uGround.value.copy(lin(T.ground, T.skyI * 0.5));
    u.uSunCol.value.copy(lin(T.sun, 1)); u.uCloud.value = T.clouds; u.uSunVis.value = T.moon ? 0.25 : (T.elev > -1 ? 1 : 0);
    const fogC = lin(T.horizon, T.fogI);
    u.fogColor.value.copy(fogC);
    this.scene.fog.color.copy(fogC); this.scene.fog.density = T.fogD;
    FOG_UNIFORMS.fogSunColor.value.copy(lin(T.sunHaze, T.fogI * (T.moon ? 0.15 : 0.55)));
    FOG_UNIFORMS.fogSunDir.value.copy(this.sunDir);
    this.horizon.copy(fogC); this.zenith.copy(u.uZenith.value);
    // lights
    const col = new THREE.Color(T.sun);
    this.sun.color.copy(col); this.sun.intensity = T.sunI;
    if (this.csm) {
      this.csm.lightDirection.copy(this.lightDir).negate();
      for (const l of this.csm.lights) { l.color.copy(col); l.intensity = T.sunI; }
    }
    this.renderer.toneMappingExposure = T.exposure;
    this.night.value = T.night;
    // image-based lighting from the same sky
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0.02, 0.1, 100);
    this.scene.environment = this.envRT.texture;
    for (const fn of this.listeners) fn(T);
  }

  /** Per frame: cascades follow the camera; the single sun map follows the player (texel-snapped). */
  update(camera, target, t = 0) {
    this.skyU.uTime.value = t;
    if (this.csm) { this.csm.update(); return; }
    const d = this.lightDir;
    const step = 140 / (this.sun.shadow.mapSize.x || 1024);
    const tx = Math.round(target.x / step) * step, tz = Math.round(target.z / step) * step;
    this.sun.target.position.set(tx, target.y, tz);
    this.sun.position.set(tx + d.x * 400, target.y + d.y * 400, tz + d.z * 400);
    this.sun.target.updateMatrixWorld();
  }
  /** Back-compat for callers that only track the player. */
  follow(target) { if (!this.csm) this.update(null, target); }
  /** Fit the cascades to the widest field of view the chase camera reaches (call after resize). */
  fitCascades(camera, fov) {
    if (!this.csm) return;
    const f = camera.fov, far = camera.far;
    const portrait = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(25)) / Math.max(0.3, camera.aspect))) + 14;
    camera.fov = Math.min(110, Math.max(f, fov, portrait)); camera.updateProjectionMatrix();
    this.csm.updateFrustums();
    camera.fov = f; camera.far = far; camera.updateProjectionMatrix();
  }
}
