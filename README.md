# Rhea Laloo — Portfolio Grand Prix

A static site with no build step, deployed by GitHub Pages:

| Page | What it is |
|---|---|
| `index.html` | Environment select: Mumbai GP or the original circuit, plus quick links for recruiters. A scroll reel shows Mumbai as neon line art that renders into the city and lands in a laptop |
| `mumbai.html` | **Mumbai GP**: a compact, stylised-real Mumbai to drive — Marine Drive, the Sea Link, Fort, Bandra, BKC — with portfolio chapters at the Pit Wall (career, shown on the grid before the race), K. C. College and KJSIT (the finish). The timed route is ~4 km; the map (M) and Pause → Progress jump straight to any chapter. |
| `circuit.html` | The original F1 Track Day circuit (preserved) |
| `portfolio.html` | The full portfolio on one page, no driving (a short version of the reel at the end) |

## Run locally

```bash
python3 -m http.server 4173      # then open http://localhost:4173
```

## Tests

```bash
npm install                      # dev-only: three.js for Node tests
npm test                         # vehicle-dynamics + world-generation unit tests (21)
npm run test:e2e                 # headless Chromium: all pages, reels, gameplay, circuit regression, phone (46 checks)
npm run previews                 # re-capture the menu / title-screen previews (needs ffmpeg)
npm run reel                     # re-render the scroll-reel frames into assets/reel (needs a GPU, ~1 min)
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

## The scroll reel

`tools/reel/capture.mjs` loads `mumbai.html` in headless Chromium on the real GPU and, for each of 120 frames,
renders the golden-hour city plus depth, normal and layer passes (`tools/reel/page.js`). Edges of those passes
become the neon line art (buildings white, roads cyan, palms pink, the car red, the sea as faint glints), and a
wipe that sweeps from the camera outwards blends line art into the render. Frames are saved as WebP at 1280 px
(`assets/reel/d`, ~7.5 MB) and 640 px for phones (`assets/reel/m`, ~2.7 MB).

`src/ui/reel.js` pins the section, draws the frame for the scroll position on a canvas (frames load coarse-to-fine
once the section is near), then scales the picture from full-bleed into the laptop. Reduced motion or no script
shows the last frame, unpinned.

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
src/ui/reel.js, reel.css       the scroll reel on the menu and portfolio pages
tools/reel/                    renders the reel frames from the live game
```

Assets and licences: see [ASSETS.md](ASSETS.md). Everything visual and audible is generated in code.
