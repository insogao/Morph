# Vector track (precise shape morph)

Use this track for crisp, flat artwork: icons, logos, letters, glyph-like marks, silhouettes. It keeps straight edges straight and corners sharp. For soft or liquid change, use the SDF part field instead (`skills/creative-morph`).

Code: `packages/morph-engine/src/vector/`. Demos: `lab/mm-vs-linear` (method comparison plus correspondence map), `lab/mm-icon-loop` (finished motion piece).

## Build shapes

```ts
import { fromPath, polygon, compound, shapeFromRings, circle, star, fit } from ".../vector/shape";
const logo = fit(fromPath(svgPathData), [640, 360], 300); // centre on (640, 360), 300 px tall
```

- `fromPath(d)` accepts all SVG path commands (M L H V C S Q T A Z, absolute and relative).
- Rings nested inside other rings become holes automatically.
- Separate closed subpaths become separate **pieces**.
- Put source and target in the same place and at the same size with `fit` before morphing, unless the move itself is part of the design.

## Morph two shapes

```ts
import { morphShapes } from ".../vector/morph";
const m = morphShapes(a, b, { pins, rotate: "auto", vanish: "self" });
const frame = m.at(progress);            // progress 0..1, may overshoot for bounce
fillFrame(ctx, frame, color);            // from .../vector/render
```

| Option | Values | Use |
| --- | --- | --- |
| `mode` | `"auto"` (default), `"intrinsic"`, `"linear"` | `intrinsic` interpolates edge lengths and turning angles. It keeps stroke widths and letter-like structure, which works best when the shape turns. `linear` moves each point straight. `auto` uses intrinsic unless it self-intersects. |
| `pins` | `[{ a: Anchor, b: Anchor, piece?, hole? }]` | Force points to correspond. Each pin is a global constraint and the whole match is recomputed. Use 0–3 pins. |
| `rotate` | radians or `"auto"` | Turn the target back before matching, then replay the turn (for example E → M works best rotated about 90°). |
| `vanish` | `"self"`, `"partner"`, `[x, y]` | Where unmatched pieces and holes shrink to or grow from. `self` means in place. `partner` means fly into or out of the nearest matched piece, which gives a merge or split look. |
| `pairs` | `[[i, j]]` | Force piece i of A to become piece j of B. |

**Anchors** (for pins):

- `"top" | "bottom" | "left" | "right"`;
- `{ angle: deg }`: the ray from the centroid, where 0 is up and angles go clockwise;
- `{ corner: n }`: the n-th corner, counted clockwise from 12 o'clock;
- `[x, y]`: the nearest contour point;
- `{ s }`: a raw arc-length fraction.

**When to pin:**

- **Both ends are mirror-symmetric** → pin `{angle: 0}` to `{angle: 0}` and `{angle: 180}` to `{angle: 180}`. Without these pins the in-betweens can go lopsided (verified on Y → 木).
- **A specific part must travel to a specific place** → pin it, for example "heart tip becomes the star's top point": `{ a: "bottom", b: "top" }`.
- **Two pins whose order differs on the two contours throw `PinOrderError`.** That pin set would make trajectories cross, so change the pins.

## Sequences, bounce, loop

```ts
import { sequence } from ".../vector/timeline";
const seq = sequence([
  { shape: A, hold: 0.5 },
  { shape: B, morph: 0.85, hold: 0.75, ease: "in", bounce: { amplitude: 9, frequency: 2.4, decay: 5.5 }, options: { pins } },
  { shape: C, morph: 0.85, hold: 0.75, ease: "in", bounce: { amplitude: 9, frequency: 2.4, decay: 5.5 } },
], true); // true = loop back to A
const { frame, step, progress, phase } = seq.at(time);
```

- Each step has its own duration, easing, bounce and pins.
- For bounce, use `ease: "in"` so the shape arrives with speed and the bounce reads as an impact. `"inOut"` arrives with no speed, so the bounce looks like a separate wobble.
- Bounce parameters are the usual motion-design trio. Amplitude is overshoot in percent; Morph Studio's defaults are 12 / 3 / 5.

## Motion-design layers (see `lab/mm-icon-loop`)

These are scene-level and pure functions of time:

| Layer | How |
| --- | --- |
| Echo / extrusion | Draw `seq.at(time − k·dt)` outlines with offset k·d and fading alpha, before the fill |
| Tilt and squash | A transform applied to the frame, scaled by `sin(π·phase)` so it exists only while moving |
| Colour | `mixColor(a, b, progress)` (OKLab) |
| Flat shadow | The same frame offset by a few pixels, filled dark, drawn under the mark |

## Check your work

- **Debug view**: `drawMatch(ctx, morph)` draws both outlines, the point links, corner knots (orange) and pins (pink). If a link crosses the shape oddly, add a pin there.
- **Numbers**: `m.report` has `selfHits` (self-intersections at 25/50/75%, must be 0), `crossings` (an array, one count per pair: crossing straight trajectories, a hint for difficult pairs), `pairs[].angle` and `mode`, and `vanished` / `born` piece indices.
- **Frames**: `node tools/frames.mjs <scene> t1 t2 …` — look at the fastest part of each morph, not only the ends.

## Known limits

- Open paths (line art) are closed implicitly. Use the one-line or stroke mechanisms for line drawings.
- Pieces are paired by position and size. For semantic pairing (petal → wing) pass `pairs`.
- Strokes are drawn by the scene, not morphed as a separate channel yet.

## Hand-off to the SDF part field (vector geometry, SDF material)

When a crisp shape should **melt, turn liquid, gain volume or come alive**, keep the vector track driving the geometry and render the frames through the SDF renderer:

```ts
import { framePrims, frameDecals } from ".../vector/sdf-bridge";
const prims = framePrims(frame, { color: [r, g, b], blend, wobble, gloss, sss, mottle, holeBlend });
renderer.draw(ctx, prims, { thickness, light, shadowOffset, … });   // renderers/sdf-gl.ts
```

- Each piece becomes a `polygon` primitive: outer contours union, holes subtract. Outlines are simplified to ≤160 points, keeping every corner.
- **The material is a schedule over time; the geometry stays continuous.** Ramp `thickness` (flat ink → bevelled), `wobble` (liquid edges), `blend` (pieces fuse with liquid bridges), `gloss` and `sss`. Bring them back down when the target settles. Since both tracks draw the same silhouette, the switch cannot jump.
- **Small parts on top of a body** (eyes, spots, stripes) get swallowed by a smooth union. Draw them with `frameDecals`, which paint colour and bump without changing the geometry.
- **Colour through ink**: going straight from black to a light colour passes through a dead grey. Route it through a saturated midpoint (ink → orange → cream).
- **Spec-driven part morphs**: add `"render": { "track": "sdf", "style": "flat", "wobble": [0, 8, 0.6], "blend": [0, 26, 5], "fuse": [[…]] }` to `morph.json` (each value is [before, mid-morph, after]).
- **Rules that prevent bug-like pops** (all enforced by the player, measured with `tools/pops.mjs`):
  - decide once whether a part is a surface decal, never per frame;
  - cap each bridge by the part's own size, so it grows with a part being born;
  - fuse only parts that flow together (fuse groups), never split clones.

Demos:

- `lab/mm-glyph-koi` (MM09): the real-font 鱼 lies down, melts and reforms into the exact traced silhouette of the user's layered koi painting, then the painting washes in and swims;
- `lab/mm-candle-tulip` (MM10): liquid as the story. The wax melts and pools into the pot, leaves sprout from the pool, the wick becomes the stem and the flame splits into petals. Data only, with a `fuse` group.
- **Texture from the user's art**: when the user has layered PNGs, trace them (`npx tsx tools/trace-layers.ts --out layers.json --copy img name=layer.png …`). The traced outlines become the vector target, and the painting washes in once the silhouette has landed (MM09). Draw the painted layers in thin strips if they must bend.
