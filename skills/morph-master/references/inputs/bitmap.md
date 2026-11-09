# Input: bitmap with transparency (cut-out PNG / WebP)

A PNG with an alpha channel has an **outline**, so it can do almost everything an SVG can, and it keeps its real painted texture. Run `npx tsx tools/inspect.ts file.png`: `kind: "bitmap"` means you are on this route.

Demos:

- MM12 `lab/mm-pixel-particles`: pixel particles;
- MM13 `lab/mm-shatter-flip`: two-faced shatter;
- MM09 `lab/mm-glyph-koi`: traced outline + texture wash.

## Choose by what the viewer should believe

| Effect | Use when | How |
| --- | --- | --- |
| **Pixel particles** (MM12) | Any two cut-outs. "It dissolved and rebuilt itself." | `new PixelMorph(artA, placeA, artB, placeB, { step: 5, origin })`. The cells carry the real colours and are matched along a Hilbert curve, so the layout survives. Hand-off is per cell, never a cross-fade. |
| **Two-faced shatter** (MM13) | Brittle, painted, glossy objects. "It broke and was rebuilt as something else." | `new ShatterMorph(…, { count: 80–120, impact })`. The shards lift, turn over (front = A, back = B) and settle. |
| **Traced outline + texture wash** (MM09) | The target must keep its painted detail and the change should be a real shape morph. | Trace with `npx tsx tools/trace-layers.ts --out layers.json --copy img name=a.png …` (error < 1 px). Morph the outlines on the vector track (optionally with liquid material), then wash the painting into the landed silhouette. |
| Per-part morph | Layered PNGs, one file per part | Trace each layer → part remap (`inputs/svg-parts.md`) + per-layer texture wash. |
| **Texture mesh warp** (MM15) | Two paintings of the **same kind of thing** (two koi, two faces, two flowers) whose painted detail should flow from one into the other | Per part: `buildMesh(outlineA, outlineB)` → `meshAt(mesh, boundaryAt(mesh, t))` → `drawMeshTexture(ctx, artA, p, mesh.rest, pos, mesh.tris)` and then B with `mesh.onB` at alpha β. A and B are aligned on the in-between shape before they blend, so there's no double exposure. Check the `flips` count: it measured ≤ 0.25 % on the koi pair. |

## Rules learned the hard way

- **Landing order must not follow the pairing.** Hilbert pairing keeps the layout, but if arrivals also follow it, whole square blocks of B finish together and leave straight edges. Use `landOrigin` (an arrival sweep from a meaningful point, such as the head) with smooth noise. This is the default in `schedule`.
- **No unmotivated payoff.** A wobble or bounce after the morph looked wrong when nothing caused it. Add a payoff only if it is something only B does and the story needs it. Otherwise hold the final image.
- **Cracks follow the real fracture lines or don't exist.** Arbitrary crack strokes looked fake. `ShatterMorph.drawCracks(ctx, progress, t)` draws the actual shard edges outward from the impact, engraved and masked by the image's alpha. They stay on each piece until it lifts off. If cracks don't fit the material, skip them and break directly.
- Run `node tools/pops.mjs <id>`. The first frame of motion after a still stretch can score high: a start is not a pop.

## Steps

1. **Load**: `const art = await loadArt(pngImportedWith ?inline)` at module top level (so every frame is deterministic), then `fitArt(art, [640, 372], 500)` to centre the subject at a chosen height.
2. **Cause**: a sweep needs an `origin`, the place where something happens (rain on the canopy, a tap, a gust). Draw that cause before the change.
3. **Payoff**: animate the finished image (bob, squash, sway) with a canvas transform.
4. **Check**: run `node tools/frames.mjs` on the middle of the change and `node tools/pops.mjs <id>`.

## Telling the user

- **Same canvas, same light, same scale** for A and B gives the best result. Mismatched styles still morph, but they read as two pictures.
- **Pixel particles don't move texture within an outline.** The texture travels as coloured cells. For "the painted pattern stretches with the shape", use the mesh warp (MM15).
- **Mesh warp needs similar subjects. Measure before you use it:** `meshQuality(mesh).worstFlipShare`, the worst share of folded triangles over the whole warp.
  - The boundary follows the vector track's intrinsic in-between, which keeps ordinary concave shapes fold-free (C → disc: 0 %).
  - Into a deeply concave target the interior still folds (disc → C: 31 %; a C into its mirror image: 60 %), and no relaxation fixes that.
  - **Above about 2 %, degrade**: morph the silhouette with `fieldMorph` (sdf-field.ts) and cross-fade the texture inside it, split the part into sub-parts and warp each, or use particles or shatter.
- **Layered art shows a faint seam where parts were split** (anti-aliased layer edges overlap). It's a property of the source layers.
- **Hidden parts are not invented.** If B shows something A hid (the back of a wing), it comes from B's pixels, not from A's.
- **Very large images** are cut into more cells. Keep `step` at about 4–6 design px, which gives roughly 4,000–8,000 particles at 60 fps in Chrome.

**Two cut-outs that share a shape** (a hook and a curl, a dome and a head) can also be carried by a match cut instead of a morph. See [../shape-rhyme.md](../shape-rhyme.md) and MM97.

## Per-part morph of a layered subject (MM81, swallow → koi)

`inspect` reports a **layer set** (`name_full.png` plus `name_<part>.png`) as one subject (`kind: "bitmap-layers"`).

1. Trace every layer (`tools/trace-layers.ts`), map the parts by meaning, and give every leftover a fate.
2. **Pose, then warp.** Move and turn each part as a whole along the creature's path first: a wing folds about its shoulder, and the whole body rides one flight path. Then mesh-warp its texture onto the partner's outline, so the mesh only carries the shape change. A part that must split (two tail streamers into two lobes of one fan) needs its outline cut along the fork; the mesh builder takes one outline per part.
3. **Colour follows shape, not ahead of it.** If B's paint arrives before B's shape, it reads as "a small koi inflating". Spread the paint from where the change starts (the head) at the speed of the shape.
4. **Keep moving through the landing.** Start the payoff (the swim) while the warp is finishing; a still moment between them reads as a stop.
5. Check `meshQuality` (in-betweens only; ≤ 2 % folded triangles).

**Natural motion matters as much as the mapping.**
- A **fish swims by lateral undulation**. From the side you see the tail fan foreshorten as it beats, and each beat pushes the body forward. An up-down wave is how a dolphin swims; the older koi demo got this wrong.
- **Birds** glide and bank. Wings fold back towards the body before a dive, and the downstroke is the power stroke.
