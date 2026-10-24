/* Sea and river: one large plane with a procedural wave shader (no textures).
   Fresnel sky reflection, sun glint, shoreline tint/foam from the coast
   distance field, and night-time light streaks. */
import * as THREE from 'three';
import { WORLD_BOUNDS as B } from './layout.js';
import { landSD } from './geo2d.js';

export function buildWater(atmo) {
  // coast-distance texture (8 m cells) for shoreline effects
  const cell = 8, W = Math.ceil((B.maxX - B.minX + 2000) / cell), H = Math.ceil((B.maxZ - B.minZ + 2000) / cell);
  const data = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = B.minX - 1000 + i * cell, z = B.minZ - 1000 + j * cell;
    const inside = x > B.minX && x < B.maxX && z > B.minZ && z < B.maxZ;
    const sd = inside ? landSD(x, z) : -300;
    data[j * W + i] = Math.max(0, Math.min(255, Math.round(128 + sd * 0.85)));
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;

  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
    uSky: { value: new THREE.Color(0.6, 0.7, 0.8) }, uHorizon: { value: new THREE.Color(0.8, 0.8, 0.8) },
    uDeep: { value: new THREE.Color(0x1d3a40) }, uShallow: { value: new THREE.Color(0x4f6f63) },
    uCoast: { value: tex }, uBounds: { value: new THREE.Vector4(B.minX - 1000, B.minZ - 1000, W * cell, H * cell) },
    uNight: atmo.night,
  }]);
  const mat = new THREE.ShaderMaterial({
    uniforms, fog: true, transparent: false,
    vertexShader: /* glsl */`
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uSun, uSunCol, uSky, uHorizon, uDeep, uShallow; uniform sampler2D uCoast; uniform vec4 uBounds; uniform float uNight;
      varying vec3 vW;
      #include <fog_pars_fragment>
      float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
      vec2 wave(vec2 p, vec2 d, float k, float sp, float a){ float ph = dot(p,d)*k + uTime*sp; return d * cos(ph) * a * k; }
      void main(){
        vec2 p = vW.xz;
        vec2 g = wave(p, normalize(vec2(1.0,0.35)), 0.11, 1.3, 0.35) + wave(p, normalize(vec2(0.6,-1.0)), 0.23, 1.9, 0.16)
               + wave(p, normalize(vec2(-0.9,0.4)), 0.47, 2.6, 0.07) + wave(p, normalize(vec2(0.2,1.0)), 0.9, 3.4, 0.03);
        float n = vn(p*0.9 + uTime*0.25) - 0.5, n2 = vn(p*2.7 - uTime*0.4) - 0.5;
        vec3 N = normalize(vec3(-g.x + n*0.12 + n2*0.05, 1.0, -g.y + n2*0.12));
        vec3 V = normalize(cameraPosition - vW);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 R = reflect(-V, N);
        vec3 sky = mix(uHorizon, uSky, smoothstep(0.0, 0.5, R.y));
        vec2 cuv = (p - uBounds.xy) / uBounds.zw;
        float sd = (texture2D(uCoast, cuv).r * 255.0 - 128.0) / 0.85;
        float shallow = smoothstep(-70.0, -2.0, sd);
        vec3 body = mix(uDeep, uShallow, shallow) * (0.55 + 0.45 * (1.0 - uNight));
        vec3 col = mix(body, sky, fres * 0.85);
        float spec = pow(max(dot(R, normalize(uSun)), 0.0), 220.0) * step(0.0, uSun.y);
        col += uSunCol * spec * 3.0;
        // foam along the shore and around tetrapods
        float foamBand = smoothstep(-9.0, -1.0, sd) * (1.0 - smoothstep(-1.0, 0.5, sd));
        float foam = foamBand * smoothstep(0.45, 0.75, vn(p*0.45 + vec2(uTime*0.3, 0.0)) + 0.25*sin(sd*1.3 + uTime*1.6));
        col = mix(col, vec3(0.86, 0.88, 0.86) * (0.4 + 0.6*(1.0-uNight)), foam * 0.7);
        // night: warm reflections of the city lights on the water near the shore
        col += vec3(1.0, 0.72, 0.38) * uNight * smoothstep(-160.0, -10.0, sd) * pow(max(0.0, n2 + 0.5), 6.0) * 1.3 * smoothstep(0.2, 0.0, abs(N.x));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const geo = new THREE.PlaneGeometry(B.maxX - B.minX + 6000, B.maxZ - B.minZ + 6000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((B.minX + B.maxX) / 2, 0, (B.minZ + B.maxZ) / 2);
  mesh.receiveShadow = false;
  mesh.name = 'water';
  return {
    mesh,
    update(t) {
      uniforms.uTime.value = t;
      uniforms.uSun.value.copy(atmo.sunDir);
      uniforms.uSunCol.value.copy(atmo.sun.color).multiplyScalar(atmo.T && atmo.T.elev > -3 ? 1 : 0.15);
      uniforms.uSky.value.copy(atmo.zenith); uniforms.uHorizon.value.copy(atmo.horizon);
    },
  };
}
