/* The Arabian Sea, Back Bay and the harbour — one physically-lit surface out to
   the horizon. MeshStandardMaterial (so it gets the sky reflection, sun glitter,
   cascaded shadows and fog for free) with two scrolling layers of a mipmapped
   wave normal map, distance-dependent roughness (keeps the sun path broad and
   stable instead of sparkling), shallow-water tint and a shore foam line from a
   coast-distance field. */
import * as THREE from 'three';
import { WORLD_BOUNDS as B } from './layout.js';
import { landSD } from './geo2d.js';
import { waveNormalMap } from '../core/texgen.js';
import { fogUniforms } from './atmosphere.js';

export function buildWater(atmo, { far = 4000 } = {}) {
  // coast-distance field (8 m cells) for depth tint and foam
  const cell = 8, W = Math.ceil((B.maxX - B.minX) / cell) + 1, H = Math.ceil((B.maxZ - B.minZ) / cell) + 1;
  const data = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const sd = landSD(B.minX + i * cell, B.minZ + j * cell);
    data[j * W + i] = Math.max(0, Math.min(255, Math.round(128 + sd * 0.85)));
  }
  const coast = new THREE.DataTexture(data, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  coast.magFilter = coast.minFilter = THREE.LinearFilter; coast.needsUpdate = true;

  const waves = waveNormalMap(256, 7);
  const U = {
    uTime: { value: 0 }, uWaves: { value: waves }, uCoast: { value: coast },
    uBounds: { value: new THREE.Vector4(B.minX, B.minZ, (W - 1) * cell, (H - 1) * cell) },
    uShallow: { value: new THREE.Color('#566b5c') }, uDeep: { value: new THREE.Color('#1e4350') },
    uNight: atmo.night, uFar: { value: far },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.08, metalness: 0, envMapIntensity: 1 });
  mat.onBeforeCompile = sh => {
    fogUniforms(sh);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n vWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWorldP;
        uniform float uTime, uNight, uFar; uniform sampler2D uWaves, uCoast; uniform vec4 uBounds; uniform vec3 uShallow, uDeep;
        float gSd, gFoam, gDist;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 cuv = (vWorldP.xz - uBounds.xy) / uBounds.zw;
        bool inside = all(greaterThan(cuv, vec2(0.0))) && all(lessThan(cuv, vec2(1.0)));
        gSd = inside ? (texture2D(uCoast, cuv).r * 255.0 - 128.0) / 0.85 : -150.0;   // metres from shore (negative = water)
        gDist = length(vWorldP - cameraPosition);
        float depthF = smoothstep(-3.0, -110.0, gSd);
        diffuseColor.rgb = mix(uShallow, uDeep, depthF);
        // shore foam: a broken line that breathes with the swell
        float swell = sin(gSd * 0.45 + uTime * 1.3) * 0.5 + 0.5;
        float breakup = texture2D(uWaves, vWorldP.xz / 23.0 + vec2(uTime * 0.01, 0.0)).r;
        gFoam = smoothstep(-4.5, -1.0, gSd) * (0.55 + 0.45 * swell) * smoothstep(0.35, 0.6, breakup + 0.25);
        gFoam *= 1.0 - smoothstep(60.0, 400.0, gDist);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.86, 0.84), gFoam);`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = mix(0.045, 0.2, smoothstep(25.0, 1400.0, gDist));
        roughnessFactor = mix(roughnessFactor, 0.7, gFoam);`)
      .replace('#include <normal_fragment_maps>', `
        vec2 wp = vWorldP.xz;
        vec3 w1 = texture2D(uWaves, wp / 52.0 + uTime * vec2(0.0045, 0.0028)).xyz * 2.0 - 1.0;
        vec3 w2 = texture2D(uWaves, mat2(0.8, -0.6, 0.6, 0.8) * wp / 14.0 + uTime * vec2(-0.011, 0.009)).xyz * 2.0 - 1.0;
        vec3 w3 = texture2D(uWaves, mat2(-0.5, 0.87, -0.87, -0.5) * wp / 4.3 + uTime * vec2(0.02, -0.017)).xyz * 2.0 - 1.0;
        float calm = mix(1.0, 0.55, smoothstep(-2.0, -25.0, -abs(gSd + 30.0)));   // a little calmer in the bay
        vec2 slope = (w1.xy * 0.55 + w2.xy * 0.45 + w3.xy * 0.25 * (1.0 - smoothstep(20.0, 120.0, gDist))) * calm;
        vec3 nW = normalize(vec3(slope.x, 1.0, slope.y));
        normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // night: warm city light scattered in the water near the shore
        totalEmissiveRadiance += vec3(1.0, 0.62, 0.32) * uNight * 0.05 * smoothstep(-160.0, -8.0, gSd) * (0.4 + 0.6 * breakup);`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        // the mesh ends at the far plane: finish the fade to the horizon colour before it does
        #ifdef USE_FOG
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogCol, smoothstep(uFar * 0.55, uFar * 0.92, gDist));
        #endif`);
  };
  mat.customProgramCacheKey = () => 'mumbai-water';
  // a large radial grid centred on the camera (snapped, so it never swims): dense near, coarse far
  const rings = [], R = [0, 40, 90, 160, 260, 420, 700, 1100, 1700, 2600, 4000, 6500];
  const seg = 64, pos = [], idx = [];
  R.forEach((r, i) => { for (let k = 0; k < seg; k++) { const a = k / seg * Math.PI * 2; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); } rings.push(i); });
  for (let i = 0; i < R.length - 1; i++) for (let k = 0; k < seg; k++) {
    const a = i * seg + k, b = i * seg + (k + 1) % seg, c = a + seg, d = b + seg;
    idx.push(a, b, c, b, d, c);   // counter-clockwise seen from above
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.name = 'water';
  return {
    mesh, material: mat,
    setFar(f) { U.uFar.value = f; },
    update(t, camera) {
      U.uTime.value = t;
      if (camera) { mesh.position.set(Math.round(camera.position.x / 50) * 50, 0, Math.round(camera.position.z / 50) * 50); U.uFar.value = camera.far; }
    },
  };
}
