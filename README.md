# Rhea Laloo — Portfolio Grand Prix

A static site with no build step, deployed by GitHub Pages:

| Page | What it is |
|---|---|
| `index.html` | The portfolio as a drive: a real-time 3D street that opens as black-and-white line art and comes into colour as the car rolls past the problems each project solves — potholes (RoadHawk), cows (the cattle app), people at a crossing (ADHD / mental-fitness models) — then rises into my room: the laptop (chub-guard) and the attack on it (log anomaly detection). Experience, education, tech specs and contact follow; "One more thing" links the car to Mumbai GP. Résumé, contact and highlights are on the first screen; a chapter rail jumps anywhere. Content comes from `src/shared/portfolio-data.js` |
| `mumbai.html` | **Mumbai GP**: a compact, stylised-real Mumbai to drive — Marine Drive, the Sea Link, Fort, Bandra, BKC — with portfolio chapters at the Pit Wall (career, shown on the grid before the race), K. C. College and KJSIT (the finish). The timed route is ~4 km; the map (M) and Pause → Progress jump straight to any chapter. |
| `circuit.html` | The original F1 Track Day circuit (preserved) |
| `portfolio.html` | Printable one-page résumé |

## Run locally

```bash
python3 -m http.server 4173      # then open http://localhost:4173
```

## Tests

```bash
npm install                      # dev-only: three.js for Node tests
npm test                         # vehicle-dynamics + world-generation unit tests (21)
npm run test:e2e                 # headless Chromium: all pages, the drive and chapter rail, gameplay, circuit regression, phone
npm run previews                 # re-capture the menu / title-screen previews (needs ffmpeg)
npm run perf                     # scroll the landing page with the CPU slowed 4× and report frame times
```

Graphics quality is detected from the GPU (Low / Medium / High) and can be changed in Pause → Settings.
For testing, `mumbai.html?quality=low|medium|high` forces a preset.

## How Mumbai GP is rendered

* **Anti-aliasing kept through post-processing.** Medium/High render into a 4× multisampled HalfFloat target
  (`src/core/post.js`), then bloom (restrained), tone mapping and a light grade. Low renders straight to an
  antialiased canvas. Resolution scales down only when frames are slow, and back up when there is headroom.
* **Atmosphere** (`src/mumbai/atmosphere.js`): an analytic sky with sun glow and high cloud; fog that matches the
  horizon exactly, warms towards the sun and thins with height; image-based lighting rendered from the same sky;
  cascaded shadow maps on Medium/High (small street detail is kept out of the far cascade).
* **Textures are generated once and mipmapped** — nothing is a per-pixel hash pattern, so nothing shimmers:
  `facades.js` (texture arrays of Mumbai facade types: grilled windows with chajjas, balconies, Art Deco,
  Indo-Gothic stone, curtain wall, chawl galleries, shopfronts, roofs), `ground.js` (asphalt, pavers, painted
  kerbs, concrete, grass, earth, sand, basalt with anti-tiling), foliage atlas with coverage-preserving mips.
* **Batching:** buildings are merged into ~320 m chunks, props are instanced per kind in 700 m chunks, static
  landmark and car parts are merged by material, terrain tiles swap to a coarse LOD beyond ~380 m.
  High ≈ 650 draw calls / 3.4 M triangles per frame including shadows and AO; Medium ≈ 300 / 1.8 M.

## The drive (landing page)

`src/story/` is a small, separate three.js scene, not the game: `world.js` builds the street, potholes, cows,
crossing and people, my building and room; `screen.js` draws the laptop's screen (an editor where chub-guard
flags an outdated API, then a log stream where the anomaly model catches an attack); `main.js` maps scroll
position to a timeline (car position, camera shots, line art → colour, dusk → night, the signal, the attack)
and draws the model's detection boxes over the scene. The car is the same procedural car as Mumbai GP.

Everything goes through one `INK` uniform, which blends the whole scene to black so only the white outlines
show: that is the black-and-white opening. Text cards scroll over the pinned canvas, so the page still reads
as a page; with reduced motion the camera cuts between shots, and without WebGL the cards stand alone.

Kept smooth on ordinary 60 Hz laptops: outlines are baked into one object per group, static objects are
frozen (no per-frame matrix work), cows and trees are merged / instanced, window textures are shared, all
materials and textures are compiled and uploaded before the first scroll, shadows are small and only cast by
things that move, the laptop screen only redraws once the room is in view, and the resolution steps down if
frames run slow. `npm run perf` (CPU slowed 4×) holds 60 fps with under 2% of frames over 25 ms.

## Code map

```
src/shared/portfolio-data.js   résumé data used by every page (single source of truth)
src/vehicle/sim.js             120 Hz rigid-body car: suspension, tyre friction ellipse, gearbox, aero, assists
src/vehicle/car-model.js       procedural open-wheel car (fictional "Laloo Racing" livery)
src/core/                      input (keyboard/gamepad/touch), synthesized audio, camera rig, settings
src/mumbai/layout.js           the fictionalised city plan: coast, roads, districts, landmarks, destinations
src/mumbai/network.js          road splines, height profiles, junctions, drivable-surface queries
src/mumbai/terrain.js          height grid shaped around roads/plazas; splat-blended ground meshes with LOD
src/mumbai/facades.js          facade texture arrays + material + facade geometry builder
src/mumbai/ground.js           ground / road texture arrays and anti-tiling GLSL
src/mumbai/buildings.js        city blocks: massing, parapets, cornices, Deco curves, shop fronts, roof tanks
src/mumbai/atmosphere.js       sky, fog, image-based light, sun and cascaded shadows, times of day
src/mumbai/water.js            the sea out to the horizon
src/mumbai/farfield.js         hazy suburbs beyond the northern map edge
src/core/post.js               render pipeline: MSAA composer, adaptive resolution, GTAO, bloom, grade
src/core/texgen.js             texture-generation helpers (tileable noise, normal maps, mip settings)
src/mumbai/landmarks.js        Gateway, Taj, Sea Link, Bandra Fort, school, colleges, Pit Wall
src/mumbai/props.js            leaf-card trees and palms, lamps, cars, taxis, autos, BEST buses, pedestrians, boats
src/mumbai/play.js             knockable props, chai collectibles, ramps, pigeons, traffic
src/mumbai/main.js             game loop, states, HUD, panels, settings, secrets
src/story/                     the landing page's scroll-driven drive (scene, laptop screen, timeline, rail)
```

Assets and licences: see [ASSETS.md](ASSETS.md). Everything visual and audible is generated in code.
