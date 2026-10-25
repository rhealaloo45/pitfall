/* Render pipeline.
   - Keeps MSAA when post-processing (multisampled HalfFloat target); the previous
     composer rendered into a non-multisampled target, which silently disabled
     anti-aliasing and was the main cause of the jagged edges.
   - Adaptive resolution: renders at the device pixel ratio (capped per quality)
     and scales down only when frames are slow, back up when there is headroom.
   - High: half-resolution GTAO (contact shadows in corners, under cars and trees).
   - Restrained grade after tone mapping: gentle contrast, warmth, vignette, dither. */
import * as THREE from 'three';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.22 }, uSat: { value: 1.04 }, uContrast: { value: 1.05 }, uWarm: { value: 0.02 }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uVignette, uSat, uContrast, uWarm, uTime; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.5) * uContrast + 0.5;
      c += vec3(uWarm, uWarm * 0.35, -uWarm * 0.6) * (1.0 - l);
      float d = length((vUv - 0.5) * vec2(1.25, 1.0));
      c *= 1.0 - uVignette * smoothstep(0.35, 0.95, d);
      c += (fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export async function createPipeline(renderer, scene, camera, Q) {
  const webgl2 = renderer.capabilities.isWebGL2;
  const maxDpr = Math.min(window.devicePixelRatio || 1, Q.pixelRatio);
  const P = { renderer, scene, camera, composer: null, scale: 1, maxDpr, minScale: Q.key === 'low' ? 0.7 : 0.6, frameAvg: 16.7, adaptT: 0, bloom: null, ao: null, grade: null };
  renderer.setPixelRatio(maxDpr);

  if (Q.post && webgl2) {
    try {
      const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }, { ShaderPass }] = await Promise.all([
        import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'),
        import('three/addons/postprocessing/UnrealBloomPass.js'), import('three/addons/postprocessing/OutputPass.js'),
        import('three/addons/postprocessing/ShaderPass.js')]);
      const size = renderer.getSize(new THREE.Vector2());
      const rt = new THREE.WebGLRenderTarget(size.x * maxDpr, size.y * maxDpr, { type: THREE.HalfFloatType, samples: 4 });
      const composer = new EffectComposer(renderer, rt);
      composer.setPixelRatio(maxDpr); composer.setSize(size.x, size.y);
      composer.addPass(new RenderPass(scene, camera));
      if (Q.ao) {
        try {
          const { GTAOPass } = await import('three/addons/postprocessing/GTAOPass.js');
          const ao = new GTAOPass(scene, camera, size.x * maxDpr * 0.5, size.y * maxDpr * 0.5);
          ao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 2.5, scale: 1.0, samples: 12 });
          ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
          ao.blendIntensity = 0.85;
          // the normal/depth pre-pass uses an override material: hide the sky dome, alpha-tested
          // foliage and decals from it (they would otherwise write solid quads into the AO input)
          ao.overrideVisibility = function () {
            const cache = this._visibilityCache;
            this.scene.traverse(o => { cache.set(o, o.visible); if (o.isPoints || o.isLine || o.isSprite || (o.userData && o.userData.noAO)) o.visible = false; });
          };
          const setSize = ao.setSize.bind(ao);
          ao.setSize = (w, h) => setSize(Math.round(w * 0.5), Math.round(h * 0.5));   // half resolution
          composer.addPass(ao); P.ao = ao;
        } catch (e) { P.ao = null; }
      }
      const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.12, 0.45, 1.0);
      composer.addPass(bloom); P.bloom = bloom;
      composer.addPass(new OutputPass());
      const grade = new ShaderPass(GradeShader);
      composer.addPass(grade); P.grade = grade;
      P.composer = composer;
    } catch (e) { P.composer = null; }
  }

  P.setNight = v => {
    if (P.bloom) { P.bloom.strength = 0.12 + v * 0.38; P.bloom.threshold = v > 0.5 ? 0.85 : 1.0; P.bloom.radius = 0.4 + v * 0.2; }
    if (P.grade) { P.grade.uniforms.uWarm.value = v > 0.5 ? -0.01 : 0.02; P.grade.uniforms.uVignette.value = 0.2 + v * 0.12; }
    if (P.ao) P.ao.blendIntensity = v > 0.5 ? 0.55 : 0.85;
  };
  P.setSize = (w, h) => {
    renderer.setSize(w, h);
    if (P.composer) P.composer.setSize(w, h);
  };
  P.applyScale = () => {
    const pr = P.maxDpr * P.scale;
    renderer.setPixelRatio(pr);
    const s = renderer.getSize(new THREE.Vector2());
    if (P.composer) { P.composer.setPixelRatio(pr); P.composer.setSize(s.x, s.y); }
  };
  /** Adaptive resolution: call once per frame with the frame time (ms). */
  P.adapt = (ms, dt) => {
    P.frameAvg = P.frameAvg * 0.92 + ms * 0.08;
    P.adaptT += dt;
    if (P.adaptT < 1.5) return;
    if (P.frameAvg > 24 && P.scale > P.minScale) { P.scale = Math.max(P.minScale, P.scale - 0.1); P.adaptT = 0; P.applyScale(); }
    else if (P.frameAvg < 14 && P.scale < 1) { P.scale = Math.min(1, P.scale + 0.1); P.adaptT = 0; P.applyScale(); }
  };
  P.render = t => {
    if (P.composer) { if (P.grade) P.grade.uniforms.uTime.value = (t || 0) % 100; P.composer.render(); }
    else renderer.render(scene, camera);
  };
  return P;
}
