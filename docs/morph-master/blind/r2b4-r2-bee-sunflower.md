# Blind round 2 · B4 — bee → sunflower (`r2-bee-sunflower`, "MM80 · Bee → sunflower")

Files: `lab/r2-bee-sunflower/{morph.json, scene.ts, bee.flat.svg, sunflower.split.svg, eval.json}`, deliverable `gallery/r2-bee-sunflower.html` (6.2 MB, offline).
Timing: cause 1.0 s, morph 3.4 s, payoff 2.6 s (7.0 s total), 1280 × 720, flat fills.

## 1. Route and why

`inspect` said `svg-parts` for both files (10 named parts in the bee, 6 in the sunflower), so I used the **part remap** route (`inputs/svg-parts.md` + `part-mapping.md`), with `morph.json` + the three-line `scene.ts`.
I ran `rhyme.ts` as the skill asks: best rhyme was head ↔ seeds/center (round ↔ round) but "COLOURS DIFFER", and the parts carry clear meaning, so a remap tells a better story than a match cut. No camera move (camera-motion.md is about viewpoint changes; nothing here needed one). Flat style, no SDF (nothing melts).

## 2. Part mapping and the story for each leftover

| Bee | Sunflower | Why / story |
| --- | --- | --- |
| `body` (yellow ellipse) | **split** into 12 petals, `pose`, stagger 0.025, window 0.04–0.80 | Same yellow (#F2B705) exactly. The ellipse fans open into the ring: 12 identical clones start stacked as the body, then each turns and flies to its petal. (Shape chain: ellipse → stacked blob → burst.) |
| `head` (black disc) | `center` (brown disc) | Core → core, round → round; the head drops 64 px into the flower's middle and browns. |
| `stinger` | `stem` | Support: the point at the bottom grows down into the stem (and is there before the leaves land). |
| `wing_left/right` | `leaf_left/right`, `pose` with opposite arcs, staggered | Spread → spread; wings fly down to the stem and turn green. |
| `antenna_l/r` | vanish → `head@top` | Leftover: they retract into the head, first thing to go (window 0–0.30). |
| `eye_l/r` | vanish → `head` | Leftover: the eyes blink shut into the head (0–0.24). |
| `stripes` | vanish → `head` (0.06–0.42, ease in) | Leftover: the dark bands slide up and shrink into the head that becomes the dark centre. |
| — | `seeds` born from `center` (0.55–0.85) | Late reveal: the inner seed disc darkens in once the centre has landed. |

Cause: `shake` 3 px (the bee's buzz building). Payoff (only the flower does it): leaves `hinge` at their stem joints (phase-offset), petals `pulse` (a slow breath / bloom).

## 3. Where the skill was unclear, wrong or missing (and where I read code)

1. **1-part → many-pieces target (body → `petals`, 12 pieces in one part).** The skill doesn't say what a 1→1 mapping does when the pieces counts differ. First render: the body collapsed into the bottom petal while 11 petals grew from a point — the ring "appeared" instead of opening. I read `packages/morph-engine/src/vector/morph.ts` (`morphShapes` → `assign`, piece pairing, unmatched pieces grow from the partner) to understand it. Fix: a copy of the sunflower with each petal given its own id (`sunflower.split.svg`, geometry unchanged) so I could use a 1→N **split**. The skill should say: "a multi-piece part paired 1→1 only pairs one piece; split the ids if each piece should come from somewhere."
2. **Paint order during a remap.** A petal clone was drawn over the incoming centre for ~0.3 s, and later the stack of body clones covered the stripes in a single frame (pops.mjs caught it as a ×5.9 pop). The skill doesn't mention that z is interpolated linearly from source-stack index to target-stack index with progress. I read `remap.ts` (`zA/zB`, `z: za + (zb - za) * p`). Fix: reorder the flattened bee so antennae + stripes sit just below the head (they don't overlap anything that changes), and end the head's window earlier (0.66) than the petals'. Worth a paragraph in svg-parts.md ("z moves with progress; reorder layers in the SVG copy if a part crosses another mid-flight").
3. **Legend overlapping the drawing.** With 12 split ids the auto legend becomes one very long line that crossed the stem/leaves. The skill doesn't document `look` at all; I found `look.legend: false` (also `background`, `ink`, `accent`, `ground`, `label`) in `director.ts` (`MorphSpec.look`). It should be in the morph.json field table.
4. **Fixing clip / stroke warnings.** The skill tells you to *tell the user* (release clip, flatten), but not what to do when you must deliver now. I hand-made `bee.flat.svg` (computed stripe ∩ ellipse with arcs; expanded the antenna strokes to filled outlines with a small offset script). A tool (`inspect --flatten`) would help.
5. **scene.ts import paths are constrained by a test.** `tests/director.test.ts` regex requires `import source from "../../<path>?raw"`; my `./bee.flat.svg?raw` made `npm test` fail with a bare `object null is not iterable`. Not in the skill. Fix: `../../lab/r2-bee-sunflower/bee.flat.svg?raw`.
6. `frames.mjs` accepts `--cols` / `--width` (needed to see details large); not mentioned in SKILL.md.
7. `mm qc` reports "holds" (low-change stretches) but the skill doesn't say what counts as acceptable; I shortened the morph (4.2 → 3.4 s) and started the wings/antennae at 0 to cut the post-cause hold, but holds during the gentle payoff remain and are not flagged.
8. The `split` mapping with `pose`: how the clones choose their turn (principal axis, ±π candidate) was only clear from `poseMorph` in `remap.ts`; it behaved well (no clone turns more than 90°), so no change needed.
9. `verify` prints the visual verdict stored in eval.json from an earlier `review`, even after the scene changed — it doesn't invalidate the old review. I re-ran `review` after the final changes.

## 4. `inspect` warnings and what I did

| Warning | Action |
| --- | --- |
| Open paths: antenna_l, antenna_r | Expanded the 7 px round-capped strokes into closed filled outlines (offset of the Bézier ±3.5 px + round caps) in `bee.flat.svg`. They look identical to the original at rest. |
| Stroke-only shapes: antenna_l, antenna_r | Same fix (now filled, so they morph/vanish as shapes). |
| Clipped content on stripes | Released the clip by hand: each stripe is now the exact rectangle ∩ body ellipse (straight top/bottom edges + elliptic arcs). Without this the stripes would stick out of the body as 192 px bars. |
| Translucent wings (0.92) | Made them opaque #CFE8F3: they sit behind the body on a flat background, the difference is invisible. |
| (not warned) hidden `guides` layer, `<use>` defs | Dropped / inlined in the copy. |

`inspect` on `bee.flat.svg` and `sunflower.split.svg`: no warnings. The user's fixtures are untouched. Tell the user: next time Release Clipping Mask + Pathfinder Crop and Outline Stroke in Illustrator.

## 5. Verification

`npm run mm -- verify r2-bee-sunflower --material novel --note "blind round 2, B4"` (final run):

```json
{
  "code": {
    "ok": true,
    "tests": "108 pass, 0 fail"
  },
  "playback": {
    "deterministic": true,
    "pops": []
  },
  "quality": [],
  "visual": "pass"
}
```

`pops.mjs`: "no pops" (after fixing the stripes pop at 2.20 s). `check:visual`: PASS. `qc`: no flags; holds at 0–0.6 (cause build-up), 1.2–1.5, 2.9–4.2 (soft landing), and in the payoff.
Frames looked at (Read the JPGs): 0, 0.8, 1.3, 1.6–3.7 densely (0.15–0.3 s steps), 4.3, 5.4, 6.4, 7.8. Visual review recorded as **pass** (`lab/r2-bee-sunflower/eval.json`).
Export: `gallery/r2-bee-sunflower.html`.

## 6. What still looks weak

- ~2.1–2.4 s: once the stripes, eyes and antennae are gone and before the petals spread, the body is briefly a plain yellow egg with a black ball — the "bee" identity drops a beat before the flower takes over.
- Stripes simply shrink into the head; they have the weakest story (no visible destination in the flower).
- Leaves are a teal mix of wing-blue and green mid-flight; reads fine but not pretty.
- The cause (3 px shake) and payoff (leaf hinge + petal breath) are gentle; a bee "landing" or a sun-turn of the head would be more memorable. A buzz/landing cause isn't in the cause menu.
- The drawing gets smaller and lower in the middle (the flower head sits lower than the bee's head); no camera to cover it.
