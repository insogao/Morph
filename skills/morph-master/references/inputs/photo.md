# Input: photo or opaque image (no transparency)

An opaque image has **no outline**, only a rectangle of pixels. Do not promise "this cat turns into that dog". Any shape change would be a guess. Change the picture *as a picture*: across its plane, in pieces, or with a reveal.

Demo: MM14 `lab/mm-photo-route` (tile flip, then ink reveal). In the project it was tested on paintings flattened onto paper. **No real photographs have been tested yet.**

| Effect | Reads as | How |
| --- | --- | --- |
| **Tile flip, grid** (default, preferred) | A wall of cards turning over | `tileFlip(ctx, a, pa, b, pb, rect, t, { cols, rows, origin })`. Use 12–18 columns. The wave runs diagonally from a corner (or another meaningful point), and each tile gets its own timing jitter (built in). Without the jitter, a column of tiles turns together and reads as vertical blinds. |
| **Tile flip, blinds** | Venetian blinds turning, top to bottom | `tileFlip(…, { mode: "blinds", rows: 10–14 })`. Full-width slats on a horizontal axis. Offer it as an alternative; some people prefer it. |
| **Ink reveal** | The new picture soaks in like ink | `inkReveal(ctx, a, pa, b, pb, t, origin, reach)`. Ragged, feathered edge. Start where the subject's attention is. |
| **Shatter** | The picture breaks and re-forms | `ShatterMorph` with `region: rect`, so the whole rectangle shatters |
| **Shape-rhyme match cut** (MM97) | One subject carried into the other by a shared shape: push in, dissolve where they coincide, pull out | `matchCutArtScene` with the box and the alignment from `tools/rhyme.ts "a.png@name=box" "b.png@name=box"`. No warping, so it is honest for photos. Needs a real rhyme and enough source pixels in the region. See [../shape-rhyme.md](../shape-rhyme.md). |
| **Pixel particles** | The picture dissolves and rebuilds | `PixelMorph` works on opaque images too (every block becomes a cell). Use a larger `step` (6–8 px), because the image is full of cells. |

Tiles and slats at rest are drawn as one clipped image per face. Drawing them one by one leaves hairline seams.

## Steps

1. `inspect` says `kind: "photo"`. Tell the user what that means (see below).
2. Crop A and B to **the same aspect ratio** and use one rectangle for both. A different aspect makes the picture's edges jump at hand-offs (MM14 had exactly this pop, and `pops.mjs` found it).
3. Pick the effect from the table, give it an origin, and check it with `frames.mjs` and `pops.mjs`.

## Telling the user

- "Photos change as pictures: tiles, reveals, shards, particles, or a **match cut** when the two share a shape (a round lamp and the moon, a curl and a curl). If you want the subject itself to transform (cat → dog), I need a cut-out with a transparent background, or the parts as separate layers. Then I can use the bitmap or part route."
- Automatic subject cut-out (segmentation) is not built in.
