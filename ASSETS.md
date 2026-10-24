# Asset & licence manifest

Everything a visitor downloads is listed here: its source, author, licence, and any changes made. Nothing comes from a game, a scraped website or an asset store.

## Code libraries (loaded at runtime from jsDelivr)

| Asset | Source | Author | Licence | Used for | Modifications |
|---|---|---|---|---|---|
| three.js r0.160.0 core (`three.module.js`) | https://cdn.jsdelivr.net/npm/three@0.160.0 | three.js authors | MIT | Rendering in all pages | None |
| three.js add-ons: `GLTFLoader` (circuit), `BufferGeometryUtils`, `RoundedBoxGeometry`, `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `OutputPass` | same package, `examples/jsm/` | three.js authors | MIT (same licence file as the core) | Geometry helpers and optional bloom | None |

The MIT licence requires keeping the copyright notice. It ships inside the files served from the CDN (`Copyright 2010-2023 Three.js Authors`, SPDX `MIT`). Dev-only test tooling (`three` from npm, Playwright preinstalled in CI images) is never shipped to visitors.

## Fonts

| Asset | Source | Author | Licence |
|---|---|---|---|
| Titillium Web (400/600/700/900) | Google Fonts | Accademia di Belle Arti di Urbino | SIL Open Font License 1.1 |

## 3D models: all original, generated in code

| Model | File | Notes |
|---|---|---|
| Open-wheel race car "Laloo Racing #27" | `src/vehicle/car-model.js` | Lofted bodywork, airfoil wings, halo, wheels with fictional "PITLINE" sidewalls. Inspired by modern single-seater proportions; no real team's shapes, logos or liveries. |
| Toy buildings, shop fronts, AC units, awnings, signs | `src/mumbai/buildings.js` | Shop names are fictional and generic (e.g. "Cutting Chai", "Vada Pav Corner"). |
| Landmarks: Gateway of India, Taj Mahal Palace, Bandra–Worli Sea Link pylons, Bandra Fort, Villa Theresa High School, K. C. College, KJSIT, Pit Wall | `src/mumbai/landmarks.js` | Stylised, game-scale interpretations of public buildings, from general public knowledge and the text sources below. No photos or models were copied. In-game panels label them as stylised. |
| Trees, palms, bushes, lamps, taxis, autos, buses, cars, boats, tetrapods | `src/mumbai/props.js` | Generic toy vehicles; no manufacturer branding. |
| Cones, barricades, crates, beach ball, stumps, stools, chai glasses, pigeons, ramps | `src/mumbai/play.js` | |
| Roads, terrain, water, diorama base | `src/mumbai/*.js` | Shaders and geometry written for this project. |
| Original circuit (track, kart, buildings) | `circuit.html` | From the Claude Design handoff for this project. Procedural; its optional GLB hook is empty, so no external model loads. |

## Textures and images

* **Textures:** every texture is drawn at runtime on an HTML canvas (livery, signs, tyre sidewalls, sky gradient, chevrons) or computed in a shader (windows, asphalt, water). None are image files.
* **Menu previews (`assets/previews/*.webp`):** screenshots of this project's own renderer, captured by `tests/make-previews.mjs`.

## Audio

All sound is synthesized live with the Web Audio API (`src/core/audio.js`): engine, tyres, wind, horn, pickups, impacts and pigeon wings. There are no sample files.

## Personal content

* `assets/rhea-laloo-resume.pdf` and `src/shared/portfolio-data.js`: Rhea Laloo's own résumé and the data taken from it.

## Pre-existing repository files not used by the site

`assets/kart.glb`, `assets/rover.glb`, `assets/sedan.obj` and `assets/sedan.mtl` were in the repository before this work. No page loads them, and their provenance isn't documented here. Confirm their licences before using them.

## References consulted (text only, nothing copied into the project)

* Bandra–Worli Sea Link: tower form and height from Wikipedia and engineering write-ups found via web search (inverted-Y / diamond pylons, ~126–128 m; Bandra channel 2 × 250 m spans).
* K. J. Somaiya Institute of Technology: Wikipedia and the institute's infrastructure page (G+8 building on the Somaiya Ayurvihar campus, off the Eastern Express Highway near Sion).
* Villa Theresa High School: Gulf News (an all-girls convent school on Pedder Road). No architectural reference was available, so the building is a generic, stylised school.
* Mood boards supplied by the site owner, used for art direction only and not included in the repository.
* Bruno Simon's portfolio (bruno-simon.com), as general inspiration for playful driving portfolios. No code or assets used.
