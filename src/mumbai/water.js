/* Toy water: turquoise shallows → teal depths, soft ripples, animated foam
   lines that follow the coastline, sun glints and sparkles. Clipped to the
   diorama slab. Procedural shader, no textures. */
import * as THREE from 'three';
import { WORLD_BOUNDS as B } from './layout.js';
import { landSD } from './geo2d.js';
import { slabOutline } from './diorama.js';

export function buildWater(atmo) {
  // coast-distance texture (8 m cells) for depth tint and foam
  const cell = 8, W = Math.ceil((B.maxX - B.minX) / cell) + 1, H = Math.ceil((B.maxZ - B.minZ) / cell) + 1;
  const data = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const sd = landSD(B.minX + i * cell, B.minZ + j * cell);
    data[j * W + i] = Math.max(0, Math.min(255, Math.round(128 + sd * 0.85)));
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;

  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
    uSky: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
    uShallow: { value: new THREE.Color(0x5fd6cb) }, uDeep: { value: new THREE.Color(0x2786a8) },
    uCoast: { value: tex }, uBounds: { value: new THREE.Vector4(B.minX, B.minZ, (W - 1) * cell, (H - 1) * cell) },
    uNight: atmo.night,
  }]);
  const mat = new THREE.ShaderMaterial({
    uniforms, fog: true,
    vertexShader: /* glsl */`
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uNight; uniform vec3 uSun, uSunCol, uSky, uHorizon, uShallow, uDeep; uniform sampler2D uCoast; uniform vec4 uBounds;
      varying vec3 vW;
      #include <fog_pars_fragment>
      float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        vec2 g = vec2(cos(p.x*0.09 + t*1.1) + cos(p.y*0.13 - t*0.8)*0.7, sin(p.y*0.1 + t*0.9) + sin(p.x*0.07 + p.y*0.05 + t)*0.6) * 0.06;
        g += (vec2(vn(p*0.35 + t*0.2), vn(p*0.35 - t*0.25 + 9.0)) - 0.5) * 0.12;
        vec3 N = normalize(vec3(g.x, 1.0, g.y));
        vec3 V = normalize(cameraPosition - vW);
        vec2 cuv = (p - uBounds.xy) / uBounds.zw;
        float sd = (texture2D(uCoast, cuv).r * 255.0 - 128.0) / 0.85;     // metres from the shore (negative in water)
        float depth = smoothstep(-4.0, -90.0, sd);
        vec3 body = mix(uShallow, uDeep, depth);
        // toon-ish lighting: two tones + rim
        float ndl = dot(N, normalize(uSun));
        body *= 0.86 + 0.18 * smoothstep(0.85, 1.0, ndl);
        float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
        vec3 col = mix(body, mix(uHorizon, uSky, 0.4), fres * 0.45);
        vec3 R = reflect(-V, N);
        float spec = pow(max(dot(R, normalize(uSun)), 0.0), 140.0);
        col += uSunCol * spec * 1.6 * (1.0 - uNight);
        // foam: a solid shore line plus two travelling rings
        float shore = 1.0 - smoothstep(-2.5, -0.5, sd) * 0.0;
        float edge = smoothstep(-3.2, -1.2, sd);
        float ring1 = smoothstep(0.85, 1.0, sin(sd * 0.55 + t * 1.6) * 0.5 + 0.5) * smoothstep(-22.0, -6.0, sd);
        float wob = vn(p * 0.15 + t * 0.1);
        float foam = max(edge, ring1 * step(0.35, wob)) ;
        col = mix(col, vec3(0.97, 0.99, 1.0) * (0.85 + 0.15 * (1.0 - uNight)), clamp(foam, 0.0, 1.0) * 0.9);
        // sparkles
        float sp = step(0.985, vn(p * 2.2 + vec2(t * 0.6, -t * 0.4))) * (1.0 - uNight) * (1.0 - depth * 0.5);
        col += sp * 0.6;
        // night: deep blue with warm reflections near the city
        col = mix(col, col * vec3(0.32, 0.38, 0.65), uNight * 0.8);
        col += vec3(1.0, 0.75, 0.42) * uNight * smoothstep(-120.0, -6.0, sd) * pow(vn(vec2(p.x * 0.6, p.y * 0.08) + t * 0.3), 5.0) * 1.4;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  // water surface clipped to the inside of the slab rim
  const outline = slabOutline(8, 12);
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ShapeGeometry(shape, 4);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0;
  mesh.name = 'water';
  return {
    mesh,
    update(t) {
      uniforms.uTime.value = t;
      uniforms.uSun.value.copy(atmo.sunDir);
      uniforms.uSunCol.value.copy(atmo.sun.color);
      uniforms.uSky.value.copy(atmo.zenith); uniforms.uHorizon.value.copy(atmo.horizon);
    },
  };
}
