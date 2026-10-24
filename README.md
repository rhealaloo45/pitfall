# Rhea Laloo — Portfolio Grand Prix

A static site with no build step, deployed by GitHub Pages:

| Page | What it is |
|---|---|
| `index.html` | Environment select: Mumbai GP or the original circuit, plus quick links for recruiters |
| `mumbai.html` | **Mumbai GP**: a toy-diorama Mumbai to drive, with portfolio chapters at Villa Theresa, K. C. College and KJSIT, and the finish at the Gateway |
| `circuit.html` | The original F1 Track Day circuit (preserved) |
| `portfolio.html` | The full portfolio on one page, no driving |

## Run locally

```bash
python3 -m http.server 4173      # then open http://localhost:4173
```

## Tests

```bash
npm install                      # dev-only: three.js for Node tests
npm test                         # vehicle-dynamics + world-generation unit tests (21)
npm run test:e2e                 # headless Chromium: all pages, gameplay, circuit regression, phone (29 checks)
npm run previews                 # re-capture the menu preview images
```

## Code map

```
src/shared/portfolio-data.js   résumé data used by every page (single source of truth)
src/vehicle/sim.js             120 Hz rigid-body car: suspension, tyre friction ellipse, gearbox, aero, assists
src/vehicle/car-model.js       procedural open-wheel car (fictional "Laloo Racing" livery)
src/core/                      input (keyboard/gamepad/touch), synthesized audio, camera rig, settings
src/mumbai/layout.js           the fictionalised city plan: coast, roads, districts, landmarks, destinations
src/mumbai/network.js          road splines, height profiles, junctions, drivable-surface queries
src/mumbai/terrain.js          height grid shaped around roads/plazas; ground meshes
src/mumbai/buildings.js        toy buildings with shader-drawn facades and 3D street fronts
src/mumbai/landmarks.js        Gateway, Taj, Sea Link, Bandra Fort, school, colleges, Pit Wall
src/mumbai/props.js            trees, palms, lamps, parked vehicles, boats, tetrapods
src/mumbai/play.js             knockable props, chai collectibles, ramps, pigeons, traffic
src/mumbai/main.js             game loop, states, HUD, panels, settings, secrets
```

Assets and licences: see [ASSETS.md](ASSETS.md). Everything visual and audible is generated in code.
