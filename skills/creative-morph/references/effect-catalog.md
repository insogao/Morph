# Effect catalogue

Pick a mechanism by **what the viewer should believe happened**, then check it against the demo. Every row has a runnable scene in the player (`npm run dev`).

| # | Mechanism | The viewer reads it as | Works best when | Engine pieces | Demo |
| --- | --- | --- | --- | --- | --- |
| 1 | Liquid part field | It softened, sagged, dripped, re-formed | A and B share radial or limb structure (ribs ↔ tentacles, petals ↔ fins) | `sdf-gl` + `skeleton` strokes, `blendStroke`, wobble, decals | `demos/umbrella-octopus` |
| 2 | Splash + fingering | An impact spread it, then it reached out | A is a fluid or blob, and B has extremities (wings, legs, branches) | `sdf-gl` puddle, satellites pre-placed at target tips, blend ramp | `demos/ink-bird` |
| 3 | Particle orbit | It dissolved, circled, and was rebuilt | A and B are both decorative or patterned. The middle needs a legible formation | `particles` + polar routing through an orbit; arrival-gated reveal | `demos/flower-butterfly` |
| 4 | Glyph → object | The writing came alive | A pictograph, letter or logo whose strokes map onto parts | Brush strokes as `Stroke`s, write-on, rotation, stroke-to-part blend | `lab/glyph-fish` |
| 5 | Shatter + reassemble | It broke and was rebuilt as something else | A and B are rigid, brittle or painted (porcelain, glass, stone, paper) | `fracture` (Voronoi + Lloyd), `matchCells`, two-faced shards that flip | `lab/vase-whale` |
| 6 | One-line unravel | The drawing was pulled into a thread and redrawn | Line art, neon, embroidery or wire. Works for any A and B | Both outlines resampled to N points, a flight curve, staggered peel/land | `lab/line-cat-deer` |
| 7 | Growth fill | It grew into that shape | B has volume and A is small or alive (seed, spore, crystal, coral) | `growth.colonize` (space colonization + pipe model), blossoms at tips | `lab/seed-rabbit` |
| 8 | 3D SDF topology morph | The solid object reshaped itself | True depth is needed. A and B have the same hole count, or the hole is made as a dent | `shader-layer` raymarch, smooth union, a part that persists (ring → handle) | `lab/donut-mug` |
| 9 | Lathe mesh | It was thrown or turned into a vessel | Rotationally symmetric targets | Three.js layer, compatible procedural mesh | `demos/volume-vessel` |
| 10 | Mechanism hand-off | One mechanism gives way to another | The best route is mixed (sand flows → particles → jelly body) | Shared clock, layered draws | `examples/hourglass-jellyfish` |

## Combining mechanisms

Chain at most three mechanisms in one piece. Each hand-off must occur on a **shared carrier** that is visible in both representations:

- A liquid stroke tip becomes the first particle of a stream. Sample particles from the SDF surface.
- The last shard to land becomes the seed of a growth.
- An unravelled thread is woven into a liquid part field. The thread points become stroke skeletons.

## Mechanisms not yet built (candidates for the next round)

| Mechanism | Sketch of implementation |
| --- | --- |
| Origami fold | Rigid polygon panels with hinge edges. Per-panel 3D rotation about the crease, with paper shading from the panel normal. A fold sequence is a list of (crease, angle, time). |
| Mosaic / tile flip | Grid tiles with two faces. Flip order follows a wave front from a point of interest. |
| Peel / unwrap | A curl cylinder sweeps across a texture: the region behind it is lifted and shows its back face. |
| Smoke / fluid advection | A stable-fluids solver with fixed steps and checkpoints every N frames for seeking. Advect the dye of A and pull it toward B with a target-attracting force. |
| Swarm / boids | Flocking with a target-shape attraction term. Deterministic integration with checkpoints. |
| Shadow play | A 3D object rotates. Its projected shadow, not the object, becomes B. |
| Macro zoom-through | Zoom into a texture of A until the texture's cell becomes B (fractal handoff). |
| Burn / erosion | A noise-threshold edge with an ember glow consumes A. The ash particles are carried to B. |
| Freeze / crystal | Diffusion-limited aggregation or anisotropic growth front that fills B. Shares the growth.ts structure. |
| Magnetic / ferrofluid | A field with spikes along a target's normals. SDF with angular-frequency displacement. |
