# Shape rhyme: the match cut (any material)

Sometimes the best morph deforms almost nothing. Find a part of A and a part of B that **already look alike**, then hand A over to B through that part:

1. **Push in** on A's rhyming part (with anticipation and acceleration).
2. **Hand off** there, where the two coincide. B is laid exactly over A, so the rhyming parts sit on top of each other. The hand-off starts before the camera arrives.
3. **Pull out** on B, starting fast and levelling onto B, framed upright as if it were alone.

The three steps **overlap**, and the camera never parks. See [camera-motion.md](camera-motion.md) for the curves, the optional FPV `dive`, and motion blur.

Film calls this a graphic match or match cut (the bone that becomes a satellite). Illustrated title sequences use it constantly: a shape, or one part of it, carries the eye from one object to the next through cuts, camera moves and zooms. Only the rhyming pair has to change, and the pair is similar by construction.

## The condition: same shape AND same colour

A title designer draws both ends of a rhyme, so they can be made identical: the same silhouette **and** the same colour, in a flat 2–3 colour palette. That is why the change reads as one thing.

Material you are **given** rarely matches. The brown umbrella hook and the red tentacle (MM97 v1) dissolved as two different things. The user called it "very poor", and they were right.

You have three options:

1. **Design both ends yourself** (best). When you draw A, B or the in-between scene, draw the rhyme parts in the same colour and the same silhouette (MM98: cream watch face ≡ cream moon, cream window ≡ cream page).
2. **Restyle both into one palette.** `tone(art, { background, ink, light })` turns any cut-out into a flat silhouette in the shared colours (MM97 v2: ink on red). Tell the user that the style changes.
3. **Skip the match cut.**

Even with matched colours, two rhymes are rarely **identical** in shape. Morph the shape until it is identical, then swap (see "Every transition needs its in-between" in [camera-motion.md](camera-motion.md)). A dissolve between two similar shapes still shows two shapes.

Back to the options:

3. **Skip the match cut.** `tools/rhyme.ts` now scores shape × colour and flags `COLOURS DIFFER (ΔE …)`. A shape-only rhyme in different colours is not a rhyme.

**Use it when:**

- A and B have very different overall shapes, so a direct morph has no readable middle;
- the material is a **photo**: no pixel is warped, the rhyme carries the change. This is how a photo can turn into another photo with a story;
- you want a cut between scenes or chapters that still feels like one continuous thought.

| Demo | Material | Rhyme |
| --- | --- | --- |
| MM95 `lab/mm-rhyme-text` | Text → SVG picture | The O of GOOD MORNING ↔ the morning sun (the hole closes) |
| MM96 `lab/mm-rhyme-svg` | SVG → SVG | Coffee surface ↔ the soil in a pot (cup → pot and handle → rim morph around it) |
| MM97 `lab/mm-rhyme-photo` | Pictures restyled into one two-tone palette | Umbrella handle hook ↔ a curled tentacle tip (same ink on the same red) |
| **MM98** `lab/mm-drone-rhyme` | Card space, real 3D drone camera | Watch face ≡ moon, lit window ≡ book page: designed same shape, same colour, same place |
| MM93 / MM94 `lab/mm-3d-*` | 3D | The same idea with a 3D camera: a sphere ↔ the rocket seen along its axis, a sphere ↔ an exhaust pancake seen from above |

## 1. Find the rhyme

```bash
npx tsx tools/rhyme.ts <A> <B> [--top 8]
#   drawing.svg                          every part, by id
#   lab/x/glyphs.json#GOOD MORNING        every letter (ids such as O@5)
#   picture.png@hook=486,522,568,618      named boxes over opaque pixels (image px); "subject" is added automatically
```

Every part is summarised by its **silhouette**: a moment ellipse, plus elongation, circularity, solidity and hole count. Holes cost only a little, because an O can close into a disc. The score ranks **geometry only**. Choose among the top few by **meaning** and colour.

- The rhyme must make sense in B's world. Coffee surface → soil: a drink's dark surface becomes the earth's. Not coffee surface → saucer.
- In text, pick the letter whose word fits: the O of MORNING, not the O of GOOD. Colour it like its partner from the start, so the eye is already on it.
- For pictures, the tool refines the alignment by pixel overlap and prints the transform to paste (`align`: B image px → A image px). **A similarity cannot mirror.** Pick a B part that curls or faces the same way as A's (the tentacle that curls like the hook, not its mirror twin).
- No good rhyme in the top list (score below about 0.6, nothing meaningful)? Use another route. A forced rhyme reads as an arbitrary zoom.

## 2. Build

**Vector** (text slots, SVG parts, drawn icons): `matchCutScene` in `vector/match-cut.ts`. Give both drawings in their own home layout (1280 × 720, as if each were alone).

```ts
matchCutScene({ id, title,
  a: { parts: cutParts(placedA.parts), background },
  b: { parts: cutParts(placedB.parts), background },
  rhyme: { a: "coffee", b: "soil" },
  pairs: [["cup", "pot"], ["handle", "rim"]],   // neighbours that coincide once B is laid over A
  fill: 0.7 });                                 // the rhyme part spans this share of the frame at the peak
```

**Pictures**: `matchCutArtScene({ a: { art, placement }, b: { art, placement }, box, align, fill })`. Flatten cut-outs onto a background if they should behave like photos.

**Move** (`style`, `swing`, `times`, `shutter`):
- `style`: `swing` (default) or `dive` (FPV);
- `swing`: the bank in radians;
- `times`: `{ go, peak, land, settle, end }`, default 0.9 / 2.9 / 4.9 / 5.8 / 7.6 s;
- `shutter`: motion blur, default 1/60 s.

The hand-off window straddles the peak. For pictures it is about 0.6 s, centred on the fastest and most blurred part of the move: a picture dissolve is a double exposure, so keep it short and moving.

## Rules learned building it

- **Around the rhyme, morph the neighbours; don't cross-fade them.** Two different big shapes fading over each other make a muddy double exposure, as the cup and the pot did. Every part with a counterpart nearby (once B is laid over A) goes in `pairs`. Only true leftovers fade.
- **Leftovers fade with little overlap.** A's leave during the first 60 % of the hand-off and B's arrive during the last 60 %. A long overlap leaves grey ghost letters hanging over the picture.
- **The rhyme part is never transparent.** It is painted opaque under both layers, and each layer repaints it at its own depth, so occluders (hills in front of a rising sun) still work.
- **Zoom is limited by resolution for pictures.** At the peak, one art pixel covers `placement.scale × zoom × devicePixelRatio` device pixels (the scene exposes `peakMagnification`). Above about 3 per CSS pixel, the image softens visibly. The rhyming region needs enough source pixels. A 90 px hook in a 1920 picture allows `fill` ≈ 0.4. Vector material can zoom as far as it likes.
- **Zoom moves in log space, around a fixed point.** `lerpCam` keeps the point being zoomed towards still on screen. A linear blend of centre and zoom drifts sideways and feels like a slide, not a push.
- A rhyme by meaning beats a slightly better geometric score. The tool proposes; the story decides.

## Telling the user

- "Your two pictures share a shape, the umbrella's hook and the octopus's curled tentacle, so I can carry one into the other with the camera. No pixel is distorted."
- Without a shared shape, say so, and offer the material's own route (tile flip and the rest for photos, part remap for SVG).
