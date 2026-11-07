# Input: 3D model (glTF / GLB)

A glTF model with **named parts** (nodes or meshes) is the 3D twin of a multi-part SVG. The same mapping method applies: [../part-mapping.md](../part-mapping.md), with every part given exactly one fate.

Demos:

- MM16 `lab/mm-3d-points`: point-cloud swirl;
- MM17 `lab/mm-3d-exploded`: exploded reassembly. It uses the **same mappings** as MM16, rocket → lighthouse.
- MM93 `lab/mm-3d-camera` and MM94 `lab/mm-3d-grow`: planet → rocket. Two shapes this different need the camera to help (see below). `lab/mm-3d-camera/shared.ts` provides an orbit camera, a backdrop, flame flicker and glow.

## What you can make

| Effect | Reads as | How |
| --- | --- | --- |
| **Point-cloud swirl** (MM16) | It dissolved into its own coloured dust, which rebuilt itself as something else | `new Morph3D(a, b, { mappings, release, land })`. Choose the `release` field (where A dissolves first) and the `land` field (where B forms first). A "top-down, then bottom-up" pair reads naturally. |
| **Exploded reassembly** (MM17) | An exploded-view drawing: parts fly out, change, fly back in | Per mapping: `style: "exploded"`, `explode: distance`, and its own staggered `window`. Foundation parts go first, details last. |
| Born / vanish / split / merge | As in 2D | `from: []` with `bornFrom`, `to: []` with `vanishTo`, lists on either side |
| Procedural 3D (no model) | Solid reshaping | SDF raymarch, `lab/donut-mug` (creative-morph) |

## Steps

0. **Inspect**: `npx tsx tools/inspect.ts model.glb` lists the part names, triangle counts, bounds and base colours, and warns about textures, skins and animations. Use the bounds to decide roles (what is tall, central, small).
1. **Load**: `const parts = await loadGlbParts(urlOf("model.glb?inline"))` at module top level. Add `assetsInclude: ["**/*.glb"]` to the Vite config, which is already done here. List the part names and decide their roles.
2. **Map**: write `Mapping3D[]`. Unmapped or doubly mapped parts throw, as in 2D.
3. **Fields**: `release` and `land` return 0–1 over the surface. Combine a direction (height, distance from an impact) with `noise3` at about 30 %, so the fronts are organic.
4. **Rig**: `rig(id, title, mappings, { models: { a, b }, label, morph: [t0, t1], end })` from `lab/mm-3d-points/rig.ts` gives the camera, lights, a slow turntable and compositing into the 2D player through `ThreeLayer`. Its fields are "A leaves top-down, B builds bottom-up". For your own fields, lights or payoff, copy the file instead.
5. **Check**: run `frames.mjs` and `pops.mjs`, then measure frame time in a real browser (see the M5 report). The headless checks use software WebGL and are slow, but still correct.

## `Mapping3D` fields

| Field | Meaning |
| --- | --- |
| `from`, `to` | Part name or list of names. `[]` means born or vanish. |
| `window: [a, b]` | Fraction of the morph progress (default `[0, 1]`). **One window per mapping**, so the pieces of a split (ring → three fins) move together. To stagger them, stagger the `land` field over the targets instead (for example by angle around the axis). |
| `spread` | Fraction of the window over which departures and arrivals are spread. Small values (about 0.12–0.2) move the part as one recognisable cloud. Large values (about 0.4) give a long dissolving front. Default 0.42. |
| `swirl` | Sideways drift of individual points, as a fraction of the travel. Lower it (about 0.15–0.25) for parts the viewer must follow. |
| `bornFrom`, `vanishTo` | Burst origin or sink, as a part name. |
| `release`, `land` | This mapping's own fields (default: the morph's). Example: a plume that spreads radially while the rocket grows by height. |
| `flight` | Born parts only. Each point leaves its source this fraction of the morph before it lands, instead of all bursting out at the window start. Use it for growth. |
| `style: "exploded"`, `explode` | Fly out as a solid, reshape out there, fly back in (model units). A part sitting **at the model centre** has no outward direction, so it gets a fallback sideways one. Explode mostly peripheral parts. |

**Split pairing:** the points of all `from` parts are pooled, and so are those of all `to` parts. The two pools are matched by Morton (spatial) order, so neighbouring areas stay neighbours.

**Per-part animation:** `morph.part("a" | "b", name)` returns a part's solid mesh. Use it for a flame flicker or a moon orbit while that part is **solid**: before it releases (A) or after it lands (B). Its points don't follow the mesh transform, so reset the transform before the part dissolves. Don't animate exploded parts; the morph positions them.

## Rules learned the hard way

- **Mesh ↔ point hand-off is local.** The times live on mesh vertices, and points take the same barycentric blend, so a pixel vanishes exactly when its point leaves. Never fade the whole mesh against the cloud.
- **Hidden points must leave the clip volume.** A size-0 point still draws one pixel on some GPUs. Exploded parts showed as dotted ghosts until this was fixed.
- **Dissolving shells are double-sided.** Otherwise holes show dark back faces, which read as dirt.
- **An ember edge only suits slow fronts.** Keep the glow narrower than the front (a quarter of its width). With fast, mechanical exploded parts, a glow made whole parts flash, so exploded parts get none.
- **Don't make fronts too fast.** A whole part dissolving in under about 0.2 s reads as a jolt. Exploded parts use a 12 % spread.

- **Very different silhouettes produce a blob in the middle.** In blind test B3, a sphere → tall rocket read as "blue dust becomes white dust" for about half a second. Rocket → lighthouse (tall → tall) doesn't, because the cloud keeps the outline. Disjoint windows alone don't fix it, and neither does the exploded style. **Let the camera do part of the morph** (the user's idea, verified in MM93 and MM94).

## Camera choreography: when the silhouettes don't match

This is the 3D form of the shape rhyme ([../shape-rhyme.md](../shape-rhyme.md)): morph only where A and B already look alike.

A point cloud stays readable only while its outline is close to both ends. For two 3D shapes, look for **the view, or the part, where they already look alike**, and morph there.

| Recipe | How | When |
| --- | --- | --- |
| **Matching view** (MM93) | Find the angle where B's outline matches A's. Seen along its axis, a rocket's tail end (body, fins, flame) is a circle, like the planet. Orbit the camera there during the cause, morph in that view (circle → circle, ring halo → three fin spokes), then orbit back to the hero view, so the depth is revealed **on a solid**. | B is long or deep along one axis and A is round, or any pair where some view of B resembles A. |
| **Shape chain: sphere → pancake → column** (MM94) | Put a flat in-between **between** the two shapes, and reach it with the camera. Seen from straight above, a sphere and a flat disc are the same circle: morph A into the disc there. Tilt down to the side to reveal that it is flat. Then grow B out of the disc, from bottom to top (`bornFrom` the disc, `land` by height), with the camera rising alongside. The disc must **mean** something in B's world. For a rocket it is the exhaust plume, a puffy pancake of hot gas: a scene-side effect part (`plumeMesh` in `lab/mm-3d-camera/shared.ts`) passed as an extra B part. It stays on the pad at lift-off. | B has a natural origin that can be flat or round: an exhaust plume, a puddle, a nest, a root ball, a shockwave ring. |

**Rules for both:**

- **A growth is ONE front, not part by part.** When B grows out of something, put **all** of B's growing parts in **one** mapping: one `window`, `spread: 1`, a `land` field by height and `flight: ~0.1`. The front then sweeps tail → tip across part boundaries, so fins and body rise together. Per-part windows (flame, then fins, then body, then nose) look assembled piece by piece; the user rejected that in MM94. Staggered per-part windows suit assembly (exploded view), not growth.
- **Every step must be a shape the eye accepts from the one before.** For example: circle → circle (another view), disc → column (growth). A planet condensing straight into a pointed flame cone was rejected by the user: round → cone has no logic. Insert the flat step instead.
- **Effect parts may be added scene-side** (plume, splash, smoke). Give them a fate like any part: here the plume is a B part that persists and spreads. Animate them only while solid, through `morph.part("b", name)`.

- **Sequence parts in the matching view.** In MM93 the ring first had to become the fins while the globe stayed solid, and only then did the globe shrink into the body. Run together, the ring's dust swept over the disc and made a blob again.
- Camera moves happen **while the subject is solid**, or in the matching view. Never orbit around the cloud mid-morph.
- Keep the orbit a few degrees off the pole (`orbit()` clamps to ±85°), so `lookAt` keeps a stable "up".
- Light the underside, because a key light from above leaves the bottom view dark.
- Whirl about the shared axis during the change. From the matching view it reads as a roll, which makes "gathering" readable.

- **Thin or flattened parts (rings, fins) go nearly black edge-on.** Add a fill light, or choose a camera angle where they face the key light.

## Telling the user

- "Name the parts in your model (nose, body, …). Without names, mapping by meaning is not possible."
- Textures on the model are not yet carried into the points: points use each part's base colour.
- Skinned or animated models: the bind pose is used, and animations are ignored.
