# Input: text (words, letters, hanzi, numbers)

Text morphs on the vector track ([../vector-track.md](../vector-track.md)), using real font outlines. Demo: `lab/mm-word` (MORPH → MASTER → 变形 → ✱ → MORPH).

## What you can make

| Effect | Status | How |
| --- | --- | --- |
| **Word → word, letter by letter** | ✅ `lab/mm-word` | `morphWords(lineA, lineB)`. Same letters slide (KEEP), different ones turn into each other (SWAP), extras are born from or vanish into the nearest partner. |
| Staggered wave (left → right) | ✅ | `staggered(t, slot.order, 0.3–0.4)` |
| Per-letter bounce on arrival | ✅ | `ease("in", phase) + bounceOffset(...)` after the slot's own arrival time |
| Keycap / card behind each letter, squashing | ✅ | scene-level rectangle; see `tileOf` in `lab/mm-word` |
| Echo / outline trail | ✅ | stroke earlier frames before the fill |
| Latin ↔ hanzi | ✅ | Many letters gather into fewer glyphs; the stroke pieces of a hanzi fly out of the partner letter |
| Text → icon, icon → text | ✅ | `morphWords(line, [iconSlot(shape)])`: the middle letter becomes the icon, the rest merge into it |
| Text → object (strokes become parts) | 🔧 M3 | Use `skills/creative-morph` (`lab/glyph-fish`) until the vector → SDF hand-off exists |
| Text → picture through a letter (match cut) | ✅ MM95 | Push in on a letter that rhymes with part of the picture (the O → the sun) and pull out on the picture: `matchCutScene`, see [../shape-rhyme.md](../shape-rhyme.md) |
| Write-on / stroke drawing | 🔧 | Needs single-line fonts; not built yet |
| Shatter, particles | ✅ other tracks | `effects/fracture.ts`, `effects/particles.ts` with glyph outlines as input |

## Steps

1. **Extract the glyphs.** Only the characters you need are written, so the page stays offline and small (about 0.7 KB per glyph).
   ```bash
   node tools/glyphs.mjs --text "MORPH MASTER 变形" --font inter:800 --font noto-sc:900 --out lab/<id>/glyphs.json
   ```
   Fonts are tried in order for each character. Available fonts: `inter` (Latin), `inter-ext` (Latin extended), `noto-sc` (Simplified Chinese), each at weights 100–900. All are OFL-1.1 and the sources are listed in `THIRD-PARTY-NOTICES.txt`. A missing glyph fails loudly.
2. **Lay out each line** at the same centre:
   ```ts
   const a = layoutText(set, "MORPH", { at: [640, 330], size: 168, tracking: 0.16 });
   ```
   Give lines of different length different sizes so that their widths stay similar. Hanzi need a larger `size` (about +15–30%) to look as heavy as Latin capitals.
3. **Pair the slots** with `morphWords(a, b)` and check `slot.kind`. If an important letter should stay but gets swapped, the travel cost was higher than the keep bonus: move the lines closer, or accept the swap.
4. **Animate**: each slot gets its own progress (stagger, then easing, then bounce). Draw tiles first, then echoes, then glyph fills.

## Slot data and per-letter fixes

- `layoutText` returns `Slot[]`: `{ ch, shape, center, x, width, baseline }`.
- `morphWords(a, b)` returns `SlotMorph[]`: `{ kind, from?, to?, morph, order }`. `morph.at(u)` gives the letter's shape at its own progress `u`.
- `morph.report` holds diagnostics (see the vector guide). `selfHits` must be 0. `crossings` is a per-pair **array** of counts, not one number. The mode is per pair, in `report.pairs[i].mode`; there is no top-level `report.mode`.
- **One letter needs its own pins.** For example, R → N crossed over itself mid-swap in a blind test. Re-morph just that slot: `slot.morph = morphShapes(slot.from.shape, slot.to.shape, { pins: [{ a: [x, y], b: [x, y] }] })`. Pin the stems: the vertical strokes both letters share. Use an `[x, y]` point at the top-left of each letter (the nearest contour point is taken), or `{ corner: n }`. That removes most self-crossings. Re-check `report.selfHits`.
- **Drawing your own icon.** `circle()` and `star()` in `vector/shape.ts` return a **ring** (a `Vec2[]`). Wrap it into a shape with `shapeFromRings([ring])`. A multi-piece icon (disc + rays) is `shapeFromRings([disc, ...rays])`.

## Word → icon with several parts

`iconSlot` makes the icon **one** slot: the middle letter becomes it, and the other letters are swallowed. When the icon has meaningful parts (a sun's disc and rays, a face's eyes and mouth), map **letters to parts** instead. Treat it as a small part remap:

- the central letter becomes the main body;
- every other letter splits into the parts on its side, using `morphShapes(letter, partsOnThatSide)`. A multi-piece target is fine: the pieces pair by position;
- stagger the outer letters after the body;
- 1 → N splits from a curly letter (S) read as unravelling, so give curly letters the fewest pieces.

## Telling the user

- "Any two words" works. Very long lines (more than about 12 letters) get busy. Suggest a shorter line, or morph word by word.
- Handwritten or script fonts are not bundled. Their connected strokes do not pair letter by letter.
- A font you cannot redistribute (a system font, a commercial font) should not be extracted into a page you ship. Use the bundled OFL fonts, or a font the user owns and is allowed to embed.

## Known limits

- No kerning: layout uses advance widths only.
- One line only; no wrapping.
- Letter pairing is by order and position, not by shape similarity.
