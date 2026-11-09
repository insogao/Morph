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

## Hanzi → the thing it names: the real character first, then a picture that rhymes with it

Many characters are pictures of their meaning. Use that, in this order (user direction, MM72 v2):

1. **Start from the REAL character** in a real font (Noto Sans SC, OFL; extract with `tools/glyphs.mjs --font noto-sc:900`). Never redraw the character yourself: the viewer must recognise it.
2. **Draw the object so that it looks like the character.** Read the glyph and put the object's parts where its strokes are: 竹 → two stalks standing on the 竖 and the 竖钩, leaves lying along the 撇 and the 横, the hook as a low leaf. Hold this picture for a moment; it should still read as the character.
3. **Field-morph the glyph into that picture** (`fieldMorph`, built on `rasterInside`). The font merges each character into one or two outlines, so stroke-by-stroke correspondence is impossible, but two shapes that rhyme blend cleanly. Swap to your own geometry only when the field has reached it exactly (no pop).
4. **Only then change it further:** stretch, grow, regroup (parameter blends of a stroke primitive), or multiply by camera (竹 → 竹林: a pull-back through a depth field, the many growing in waves around the first, paler with distance).
5. **If the object ends as a character again** (people → 夾 in MM73), arrange the **composition** to echo the glyph: who stands where, near or far, arms out. Then **thicken it to the font's weight** and field-morph; thin figures into a Black glyph go blotchy. **Never bend the anatomy to fit the glyph.** Posing a man to 夾's 撇捺 made him do the splits, and the small figures became bodies no one can stand in (user: "完全不合理"). People keep human proportions: head about 1/7 of the height, legs about 1/2, arm span about the height, feet about shoulder-width. The exaggeration happens inside the morph, the moment they become the character.

Use the painters' and the script's own vocabulary: bamboo leaves are painted as 个 and 介; ancient 夾 is a big person with two small ones under its arms.

**Stage the story as an action, not a diagram** (user direction for MM73 俠, after two versions that did not work):
- **Don't open on a static character that has no action.** The first 俠 versions opened on a 大 standing there, then on an invented clamp-then-help conflict; both read as wrong. What worked: people being threatened, and someone stepping in front of them and **throwing his arms open**. The glyph is where the action lands, not where it starts.
- **Size is depth.** In pictographs the big and small people can be read as near and far: 夾 = one person close to the camera with his arms out, two farther away behind him. Author the final frame (the one that sits on the glyph), give each figure a depth, and move a real dolly: `screen = PP + (p − PP)·Z/(Z − camZ)`. Take PP from the final frame, using the horizon at which the near and far feet share one ground.
- **Let the camera serve the beat.** Push in on the threatened (the viewer stands where the menace is); give way as he bursts in, so he fits the frame; hold still while he braces and opens his arms; only after that, jolt back as the threat recedes. A move that runs during the key gesture hides it.
- **Show menace without drawing villains:** soft-edged cast shadows of people on the camera's side, stretching toward the two (blurred masses, not drawings).
- **End on the line, then join the glyphs through the text itself:** 他 = 亻 + 也. The 亻 of 他 rises from the sentence and joins 夾 as 俠 ("the person the line is about"). Make room first (move or narrow as a whole) and settle the last design differences with a field morph (an outline morph between two versions of the same glyph twisted it). **Then draw the real vector glyph:** a traced field is stair-stepped, so use it only for the in-between. **Plan the flight path against what is on screen:** ink over ink vanishes. MM73's 亻 disappeared crossing 夾, then sat on the text. What worked: keep it at text size while it leaves the line, travel the paper lane between the glyph and the text (widen the lane if needed), and grow only once it is clear, moving into its slot from the open side.

**Performance:** build a field morph with `rasterInside` (a canvas fill; about 20 ms), not a point-in-polygon test on every cell (about 750 ms on a 340² grid). Build it during a still hold, so even that cost falls on a frame where nothing moves.

**A text, not one character (MM75, 创世记 1:1–5):** pick the few characters in the text whose shapes already are the picture, and let the rest be captions in real glyphs.
- **The strokes ARE the picture:** 光 radiates from the crossing of its 横 (up, two dots, both arms, both legs), so a burst with one ray along each stroke is its rhyme; field-morph glyph → burst, then scale the burst until it floods the frame. 一 is a plain rectangle in Noto, so a region of colour (the darkness) can fold onto it exactly, with no morph at all.
- **Same glyph, different weight** (hairline 光 → Black 光) is a clean field morph and reads as "the word gaining power".
- **A glyph in a world:** 水 standing over a water line, with a reflection in strips that the ripples displace. The effect is motivated by the text (the spirit moving over the water), not decoration.
- **Two colours and colour blocking** carry a scripture well: dark → flood of light → halves → the divide turns. Colour each caption character by what lies under it, so the text survives every wipe.
- Public-domain texts (和合本 1919, classical poetry) can be quoted in full; modern lyrics cannot.

**Glyphs that are already geometry (MM76, 道德经 42):** in Noto, 一 二 三 are plain rectangles, so 一 → 二 → 三 is a split and a birth of bars that lands on the real glyphs exactly, with no morph. Choose texts whose key characters are like this, and build everything from **one primitive** (here a bar that can break into a yin pair): 三 is the trigram ☰, trigrams become the 64 hexagrams, and the ring becomes a taiji. Rules that held up:
- **Grow the many out of the one along a path**, not from a point: ☰ rises to the top of the ring and the others **fan out of it along the ring**. Flying all of them straight out of the centre made a pile of crossing bars.
- **Pull the camera back in step with the move** that carries a thing toward the frame's edge, or it leaves the frame (☰ rising to the ring).
- A dense ring (64 × 6 bars) is cheap: 0.2 ms a frame; plain `fillRect`s.

**A long text with many effects (MM77, 道德经 five chapters, ~98 s):** the user asked for longer pieces and more effects, beyond the famous lines. What held up:
- **Each effect comes from the words** (no decoration): 非常道 → the glyph shatters along a real fracture; 名 → blown into dust; 玄之又玄 → a double spiral; 众妙之门 → the dust gathers into 门 and the camera goes through its opening; 三十辐共一毂 → spokes lock into a hub; 埏埴 → liquid clay; 凿户牖 → openings carved, panels fall, light on the floor; 上善若水 → the taiji melts and drips; 人法地… → each character nested in the thickest stroke of the next, pulled back like powers of ten.
- **Hand each chapter on through a thing, not a cut:** the hole of the hub becomes the vessel's mouth; the dive into the mouth becomes the dark wall of the room; three emptinesses merge into the point that draws 一; the hexagram ring rains into the water.
- **Let the glyph place itself:** `deepestPoint()` (a distance field) finds a glyph's thickest stroke (where the next character nests) and its emptiest opening (where the camera pushes through 门).
- **Captions with `difference` blending** read on dark, on light, and across every wipe without per-character colour logic.
- **Liquid:** masses must overlap (visible radius ≈ 0.63 × radius at the default iso), or a melt reads as beads; let landed liquid sink into the body so the surface settles flat.

**Good candidates:** characters with regular strokes whose objects are regular or stylised: 竹, 木/林/森, 山, 日/月, 雨, 火, 门, 田, 川, 光 (rays), 一 (a horizon, a divide), 水 (with a water line). **Pictograph people** (thick strokes and a dot head, 金文-like) work as well, because they are regular strokes. **Weak:** realistic animals or people at the end (鸟, 鱼, 马 drawn naturally); see [capabilities.md](../capabilities.md).

## Telling the user

- "Any two words" works. Very long lines (more than about 12 letters) get busy. Suggest a shorter line, or morph word by word.
- Handwritten or script fonts are not bundled. Their connected strokes do not pair letter by letter.
- A font you cannot redistribute (a system font, a commercial font) should not be extracted into a page you ship. Use the bundled OFL fonts, or a font the user owns and is allowed to embed.

## Known limits

- No kerning: layout uses advance widths only.
- One line only; no wrapping.
- Letter pairing is by order and position, not by shape similarity.
