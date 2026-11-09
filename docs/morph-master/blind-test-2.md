# Blind test 2 and the reliability pass (2026-11-08)

The goal was to show the skill holds up on material it has never seen, and to fix what an external review found. Each tester was a fresh agent with no context, working in its own copy of the repo, with the skill as its only guide. Every result was verified with `mm verify` and reviewed by looking at dense frames. The records are in `lab/<id>/eval.json` (`npm run mm -- status`), and the testers' own notes are in `blind/r2b*-*.md`.

## Results

| | Material (new to the skill) | Scene | Automatic checks | Visual review |
| --- | --- | --- | --- | --- |
| B4 | Design-tool SVGs: a bee in Illustrator style (`<style>` classes, `<use>`d wings, a clipped stripe group, a hidden guide layer, stroke-only antennae) → a sunflower in Figma style (`rgb()` colours, rotated petal copies) | MM80 `r2-bee-sunflower` | clean | **pass.** The body splits into same-yellow petals, the head becomes the centre, the stinger the stem and the wings the leaves. Weak: a plain yellow "egg" at 2.3–2.6 s. |
| B5 | Layered bitmaps in two styles: an ink-wash swallow from above → a gongbi koi from the side | MM81 `r2-swallow-koi` | clean | **pass, best of the round.** The painting stays one creature; the paint spreads from the head; a swim follows. Weak: the bird shrinks a lot early on; top view → side view is not reconciled. |
| B6 | No material, a three-stage brief: acorn → oak → falling leaf → bird, in one shot | MM82 `r2-acorn-oak-bird` | clean | **pass.** It really is one continuous shot, and every hand-off has a carrier. Weak: the falling leaf is about 20 px; the canopy reads as broccoli. |

All three pass build and tests (110/110), seek determinism and pops, with no qc flags.

**Not covered**, because nothing was available locally and downloading needs the user's go-ahead: real photographs and real-world glTF models (textures, skins).

## What round 2 found, and what changed

| Found | Fix |
| --- | --- |
| A solid part mapped onto a part made of many pieces paired ONE piece; the other 11 grew from points (B4). | `remapParts` splits automatically into every piece (`petals#0…11`), and the reverse merges. Payoffs that name the part apply to every piece. Regression test. |
| Paint order sliding from A's stack to B's stack let a petal cross over the centre for 0.3 s (B4). | Documented, with the fix (reorder, or time the landing). |
| `look` undocumented; a scene couldn't import a local cleaned SVG without an unhelpful test error (B4). | Documented. The test now accepts `./local.svg?raw` and says what it expects. |
| The visual verdict stayed "pass" after the scene changed (B4). | Verdicts carry a fingerprint of the scene's files and show as **stale** after any change. |
| `inspect` listed a layer set as 11 unrelated bitmaps (B5). | `kind: "bitmap-layers"`, with the parts listed and the recipe pointed to. |
| No recipe for per-part warping of layered paintings; the mesh fold limit lived only in a comment (B5). | The bitmap guide has a "per-part morph of a layered subject" recipe (pose, then warp; colour follows shape; keep moving through the landing). `meshQuality` counts in-betweens only. |
| No way to zoom into a region of a frame (B5). | `mm frames … --crop x,y,w,h --width 2560`. |
| The older koi demo (MM09) swam with an up-down wave, which is how a dolphin swims (B5). | MM09 now swims as a fish seen from the side: the tail fan foreshortens on each beat, which pushes the body forward. The rule is in the bitmap guide. |
| No guidance at all for a multi-stage A → B → C story (B6). | New `references/stages.md`: one world, camera and clock; a carrier or hide moment at every hand-off; overlapping stages via `chain()` (`vector/chain.ts`); a time budget; growth that reads; flat vs SDF for drawn art. |
| Card space was required but its API was undocumented; `demos/` vs `lab/` was unclear (B6). | API snippet in `camera-motion.md`; `lab/` stated in `stages.md`. |

## Reliability pass (external code review), checked one by one

| Claim | Real? | What was done |
| --- | --- | --- |
| PNG kind decided by the alpha channel's existence | **Yes.** Fully opaque RGBA photos were routed to the cut-out route. | Decode and measure: the transparent share and the transparent border. |
| Mesh warp folds on concave shapes | **Yes.** Disc → C folded 32 %; a C into its mirror image 63 %. | The boundary now follows the vector track's intrinsic in-between (C → disc went from 4.4 % to 0). The interior fold into deep concavity cannot be fixed by relaxation, which was tried and measured useless, so `meshQuality` gates it with a documented degrade route. MM15 is unchanged. |
| Array spread on large images | **Yes.** `Math.min(...cells)` overflows the stack, as a test demonstrates. | `minOf` / `maxOf` / `pushAll` everywhere it could be large. |
| Weak `MorphSpec` validation | **Partly.** `place.height`, `timing`, `look`, non-object entries and non-numeric motion fields weren't checked. | Added, with 12 malformed-spec regression cases. |
| SVG import limits | **Yes.** `<style>` classes ignored (colours went black); `<use>` dropped; `rgb()`, named and `currentColor` colours broke the colour maths; hidden layers imported; clips silently ignored. | Cascade, `<use>` / `<symbol>` expansion, colour normalisation and hidden-layer skipping; clipped, translucent, bad-colour and broken-use warnings. |
| viewBox anchors | **Yes.** `[x, y]` references for B (vanishTo, payoff pivots) were converted with A's viewBox. | Per-drawing conversion (`svgToDesign`), with a regression test across odd viewBoxes. |

## Quality diagnostics: what works, and what doesn't

`mm qc` measures rendered frames against the still moments around them. It works for every route.

- **Ships:**
  - `vanish` (the subject shrinks away and comes back);
  - `muddy` (chroma lost mid-way). It caught blind test 1's "blue dust becomes white dust" and the blue → terracotta cup.
  - `flat-fill` (a foreign colour fills the frame for more than 0.45 s).

  They are calibrated on the existing scenes. The accepted multi-step sequences (MM02, MM03), MM16 and MM98 raise nothing.
- **Fixed at the source:** colour in-betweens now go through OKLCH, so the cup no longer passes through mauve-grey.
- **Does NOT ship: a blob detector.** Silhouette IoU against both ends, coarse solidity, roundness and edge density were all measured. None separated the rejected planet → rocket dust from accepted morphs, because any morph between different shapes resembles neither end mid-way. Blobs stay a judgement made by looking.

## Workflow

- **One entry point:** `npm run mm -- <command>`, covering inspect, suggest, rhyme, profile, frames, pops, check, qc, gif and export.
- **`mm verify <id>`** runs build, tests, check, pops and qc into `lab/<id>/eval.json`, with a checkpoint after each step.
- **`mm review`** records the visual verdict, tied to a fingerprint.
- **`mm status`** shows the table.

The four claims are kept apart: code, playback, quality signals, visual. Generalisation is recorded per scene, as novel or known material.
