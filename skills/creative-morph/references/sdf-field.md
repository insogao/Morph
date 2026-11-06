# SDF part field

Default representation for organic morphs. `renderers/sdf-gl.ts` renders it. Use `effects/skeleton.ts` to build strokes.

A frame is an ordered list of primitives. Each primitive combines with the accumulated field before it:

| op | effect | blend radius |
| --- | --- | --- |
| `union` (default) | adds material | Width of the liquid bridge between this primitive and everything drawn earlier. Colour, gloss and translucency blend with the same weights. |
| `subtract` | carves | Softness of the cut. Scallops, mouths and holes. |
| `intersect` | clips | Softness of the clip. A halfplane gives a flat underside, and moving its offset away "un-cuts" the shape. |

Shapes are `ellipse`, tapered `capsule`, rounded `box` and `halfplane`. A stroke is a polyline with a radius at each point. It becomes a capsule chain through `strokePrims`. Tentacles, ribs, feathers, stems, legs and drips are all strokes.

## Why it is the default

- **Topology is free.** Splitting, merging, holes and bridges come from moving primitives and changing blend radii, without remeshing.
- **Parts stay identifiable.** If the source and target strokes have the same point count, `blendStroke(a, b, w)` is a per-point correspondence. A rib becomes a tentacle point for point. Make `w` depend on arc length to create a zipper or fork, for example `w(s, t) = smooth((t - t0 - (1 - s) * lag) / dur)`.
- **Material travels with geometry.** Colour mixes where parts fuse. This makes the octopus skin spread from the fused regions rather than cross-fading.
- **It is pure in time.** The renderer is a function of the primitive list, so seeking, reverse playback and export are exact.

## Primitive fields

`color`, `gloss` (0 matte to 1 wet), `sss` (thin-region glow), `mottle` (procedural skin spots), `wobble` (liquid edge noise in world units) and `anchor` (object-space origin for patterns, so texture moves with the part).

Decals (`decal: true`) only paint colour and a bump on the surface: eyes, seams, suckers, spots and highlights. **A union primitive placed entirely inside a body has no visible effect.** Its distance never wins the min, so use a decal for anything on the surface. Put decals after the geometry.

Rigid placement: `transformPrims(prims, angle, pivot, translate, scale)`. Build in a local frame, then sway, swim or lift the whole object.

## Look (per draw call)

`thickness` is the bevel radius of the inflated surface. Use 8–14 for a thin wet film like ink, and 20–28 for a soft body. Also set light direction, key, ambient top and bottom, rim, sss colour, and an optional cast shadow (`shadowOffset`, `shadowSoftness`, `shadowOpacity`). Shadow offset is a cheap and convincing height cue: shrink it to zero for a landing, then grow it and soften it for lift-off.

For depth layering, make separate `draw` calls. Draw the back limbs with a darker key, then the body and front limbs.

## Pitfalls seen in practice

- High-frequency wobble on a large body reads as a brain or rock. Keep wobble noise low-frequency (it is fixed at about 40 px wavelength). Use amplitude ≤ 5 and decay it quickly once the target has formed.
- Consecutive capsules in a chain should use a small `jointBlend` (≤ 1). Larger values bulge at the joints. Use a large `rootBlend` for the first segment so the limb fuses into the body.
- A small blend radius makes a crisp target, and a large radius makes it liquid. Ramp the radius over time from wet to formed.
- When a source part has no target counterpart, retract it into the body (radius → 0) before its replacement appears. Do not leave both on screen. Duplicates are the most common cause of "too many limbs".
- Large primitive counts are fine (up to 512). The cost is per covered pixel, and the renderer scissors to the bounds.
