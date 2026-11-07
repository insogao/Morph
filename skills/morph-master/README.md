# Morph Master skill

This skill teaches an AI to build continuous web morphs, where A turns into B with an in-between you can follow, from whatever material the user has: text, SVG icons, multi-part SVG illustrations, cut-out bitmaps, photos, or glTF models. A description alone is also enough. The output is a seekable, reversible, offline HTML page; no After Effects and no video pipeline are needed.

- **For the AI:** start at [SKILL.md](SKILL.md). It diagnoses the material, routes to the matching guide, plans, builds, and verifies with three separate checks.
- **For people:** this page is the tour.

## What it can do (GIF previews; open `npm run dev` for the real, scrubbable thing)

**Camera and shape rhymes (M6).** The camera does part of the morph.

| | |
| --- | --- |
| ![MM98](../../docs/morph-master/gifs/mm-drone-rhyme.gif) | **MM98 · 2.5D drone, same-shape same-colour rhymes.** Flat cards in real 3D, with a camera that yaws, pitches, rolls and dollies. Watch face ≡ moon, lit window ≡ book page; each swap happens when one colour fills the frame. |
| ![MM97](../../docs/morph-master/gifs/mm-rhyme-photo.gif) | **MM97 · picture match cut.** Both pictures are restyled into one palette. The hook's outline flows into the tentacle curl (signed-distance morph), and the other tentacles ripple out; the picture swaps only when the outlines are identical. |
| ![MM95](../../docs/morph-master/gifs/mm-rhyme-text.gif) | **MM95 · text → picture.** An FPV dive into the O of MORNING comes out of the sun. |
| ![MM96](../../docs/morph-master/gifs/mm-rhyme-svg.gif) | **MM96 · SVG → SVG.** Coffee surface ↔ soil; the neighbouring parts morph around it. |

**3D models (M5).**

| | |
| --- | --- |
| ![MM94](../../docs/morph-master/gifs/mm-3d-grow.gif) | **MM94 · sphere → pancake → column.** Seen from above, the planet becomes an exhaust plume, and the rocket grows out of it as one continuous front. |
| ![MM93](../../docs/morph-master/gifs/mm-3d-camera.gif) | **MM93 · matching view.** Seen along its axis, the rocket's tail is a circle, like the planet. |
| ![MM17](../../docs/morph-master/gifs/mm-3d-exploded.gif) | **MM17 · exploded reassembly.** glTF parts fly out, reshape, and fly back in. |

**Vector, text and parts (M1–M3).**

| | |
| --- | --- |
| ![MM03](../../docs/morph-master/gifs/mm-word.gif) | **MM03 · letter by letter.** Keep, swap, born; stagger, bounce; text ↔ icon. |
| ![MM02](../../docs/morph-master/gifs/mm-icon-loop.gif) | **MM02 · icon loop.** Pins, sequences, echo, holes. |
| ![MM04](../../docs/morph-master/gifs/mm-flower-butterfly.gif) | **MM04 · semantic part remap.** Written as data (`morph.json`), with a cause before and a payoff after. |
| ![MM10](../../docs/morph-master/gifs/mm-candle-tulip.gif) | **MM10 · flat liquid.** Vector geometry rendered through the SDF part field. |
| ![MM09](../../docs/morph-master/gifs/mm-glyph-koi.gif) | **MM09 · hanzi → painted koi.** Traced painting layers. |

**Bitmaps and photos (M4).**

| | |
| --- | --- |
| ![MM12](../../docs/morph-master/gifs/mm-pixel-particles.gif) | **MM12 · pixel particles.** The landing order follows an organic field, so no rectangles appear. |
| ![MM13](../../docs/morph-master/gifs/mm-shatter-flip.gif) | **MM13 · two-faced shatter and grid tile flip.** |
| ![MM14](../../docs/morph-master/gifs/mm-photo-route.gif) | **MM14 · photo route.** Grid flip, then ink reveal, then blinds. |
| ![MM15](../../docs/morph-master/gifs/mm-mesh-warp.gif) | **MM15 · texture mesh warp.** A cross-fade compared with warp + blend. |

## The ideas that matter (all learned from measured failures, see the M-reports)

- **Diagnose first.** Every material has its own menu. A photo has no outline, so never promise a photo subject → subject warp; a match cut can still carry it.
- **Every part gets exactly one fate**: morph, split, merge, be born or vanish. Pair parts by meaning, and give every leftover a story.
- **Every transition needs its in-between.** Similar is not identical: morph until the shapes ARE identical, then swap.
- **Rhymes need the same shape and the same colour.** Design both ends, or restyle both into one palette.
- **A camera move is a change of viewpoint** (3D, parallax), not zooming a flat picture. Overlap every step, keep something moving, and make the move decisive: short gather, long fast stretch, hard brake, then swap inside a hide moment.
- **Verify three claims separately:** it builds, frames are deterministic when seeking, and nothing pops at 60 fps. Then look at dense frames yourself.

## Run it

```bash
npm install
npm run dev        # player at http://127.0.0.1:5173 — the MM scenes are listed first
npm test           # 94 tests
npm run build && npm run export -- mm-drone-rhyme --html-only   # one offline HTML file in gallery/
```

## Status and known limits

- Not yet tested on real photographs or real-world glTF files (textures, skins).
- MM95 and MM96 still use the 2D in-frame camera, and MM93 and MM94 use older chained moves; only MM98 uses the full drone camera.
- Picture rhymes need source pixels: a 90 px detail in a 1920 px picture allows about 40 % frame fill before it softens.
