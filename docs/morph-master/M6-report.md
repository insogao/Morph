# M6: shape-rhyme match cut (2026-11-07)

**Idea (the user's):** illustrated title sequences borrow the shape of an object, or of one part of it, and carry the eye to the next object through cuts, camera moves and zooms. That is a morph effect with almost no deformation.

The 3D camera fixes of MM93 and MM94 were the first instance. M6 makes the method general: every material, a tool to find rhymes, and one engine for the scenes.

## Built

- **`vector/rhyme.ts`**
  - Silhouette descriptors for vector shapes and for opaque-pixel boxes: moment ellipse, elongation, circularity, solidity, holes.
  - `rhymeScore` and `suggestRhymes`.
  - `alignEllipse`, plus `refineAlign` (pixel-overlap search, for pictures).
  - Similarity algebra: apply, compose, invert, placement.
  - A 2D camera: `applyCam`, `frameEllipse`, `camThrough`, and `lerpCam`, which zooms in log space around a fixed point.
- **`vector/match-cut.ts`**
  - `matchCutScene` for vector material: rhyme pair plus neighbour `pairs` morph, leftovers fade in separate layers, and the rhyme part is never transparent.
  - `matchCutArtScene` for pictures: an aligned dissolve, with no pixel warped.
- **`tools/rhyme.ts`**: SVG parts, text letters (`glyphs.json#TEXT`) and named picture boxes, ranked. For pictures it also gives the refined transform.
- **Demos**
  - MM95 `mm-rhyme-text`: the O of MORNING becomes the sun (new `fixtures/s4/sunrise.svg`).
  - MM96 `mm-rhyme-svg`: coffee surface becomes soil.
  - MM97 `mm-rhyme-photo`: umbrella hook becomes a tentacle curl.
- **Tests**: `tests/rhyme.test.ts`, 7 tests covering moments, silhouette rhymes, alignment, `camThrough`, the `lerpCam` fixed point and the mask ellipse. The suite now has 92 tests, all passing.
- **Skill**
  - New `references/shape-rhyme.md`.
  - A pointer in SKILL.md §1 ("across all materials").
  - Rows or notes in the text, SVG-parts, photo, bitmap and 3D guides.

## Found while building

| Problem | Fix |
| --- | --- |
| The tool missed O ↔ sun: the hole made the O's circularity and solidity look unlike a disc. | Measure the **outer silhouette**; holes only cost a small mismatch. |
| An ellipse's angle is meaningless for roundish shapes, but it turned an alignment by 72°. | No turn when either shape has elongation above 0.7. |
| Umbrella canopy ↔ octopus head is a weak geometric rhyme (score 0.3). | The tool found a better one: hook ↔ tentacle curl (0.91, overlap 0.78). |
| The cup and the pot cross-faded into a muddy double exposure. | `pairs`: neighbours morph instead of fading. |
| The pot's rim faded in as a translucent band. | Handle → rim paired as well. |
| Grey ghost letters hung over the sun. | Leftovers fade out over the first 60 % of the hand-off and in over the last 60 %. |
| Pictures soften when zoomed: the hook is about 90 px in a 1920 picture. | `fill` 0.42; the rule and `peakMagnification` are documented. |

## Verification

- `check:visual` passes on MM95, MM96 and MM97.
- `pops.mjs` is clean on MM96 and MM97. MM95 has one flag at 4.23 s; a pixel diff shows it is only the HUD percentage label (benign).
- Frames were checked at the push, the hand-off and the pull, plus a retina-width render of the MM97 hand-off.

## Limits

- `tools/rhyme.ts` boxes for pictures are chosen by the AI (or the user). There is no automatic part segmentation of pictures.
- Picture hand-offs are dissolves. The rhyme makes them read as one thing changing, but different textures still overlap for about a second.
- A similarity can't mirror, and the camera can't stretch, so a wide dome ↔ a round head stays a weak rhyme.
- No real photographs have been tested; the pictures are flattened paintings, as in M4.

## M6.1: coupled camera and motion (after the user's critique and the *Magpie* research)

**User:** "there's basically no camera move, the change isn't smooth, there's an obvious A → B → C; real moves are coupled and use speed curves for build-up and impact." The user also suggested FPV-style fast moves as an optional element.

**Research.** The trilogy titles (135 s) have no hard cuts and pulse in rhythm. Hand-offs hide inside a frame-filling ink splat, an edge-on page, or a blur whip, and the motion never stops at a hand-off. See [research-magpie-titles.md](research-magpie-titles.md).

**Built.**
- `vector/camera-move.ts`:
  - Hermite `curve` with continuous velocity;
  - `planMove`, with separate zoom, roll and position channels;
  - anticipation, late acceleration, brake, fast release and settle;
  - the bank peaks just after the rhyme;
  - a slow creep in the hold;
  - roll-compensating zoom that fades to nothing at the peak;
  - `cameraMotion` to measure how far the frame moves.
- `match-cut.ts`, rewritten:
  - the hand-off straddles the peak;
  - neighbour pairs lag the rhyme slightly;
  - `style: "dive"` (FPV): `coverPoint` finds where both rhyme parts are solid, the camera dives until that colour fills the frame, swaps, and bursts out;
  - real motion blur: adaptive sub-frames over a 1/60 s shutter.
- The new skill reference `camera-motion.md` is linked from SKILL.md §2 and from `shape-rhyme.md`.
- The demos are reworked:
  - MM95 is now an FPV dive into the O;
  - MM96 swings with a 0.45 rad bank;
  - MM97 swings with a 0.35 rad bank and a 0.6 s dissolve.

**Found and fixed.**

| Problem | Fix |
| --- | --- |
| The frame stayed filled with orange for 0.8 s (dead air). | The dive is a sharp V; the filled beat is about 0.3 s. |
| The pull-out overshoot showed the edge of B's drawing. | Zoom overshoot defaults to 0; only the roll overshoots. |
| The roll exposed a frame corner. | Zoom compensation `cos φ + (W/H)·sin φ`. |
| That compensation switched reference at the peak: a 5× pop in MM96 and MM97, found by `pops.mjs`. | It now fades to nothing at the peak and is applied about the screen centre. |
| The bank was slowest exactly at the rhyme. | The bank peaks 0.3 of the pull after the rhyme, so the roll is fastest as the zoom brakes. |

**Verification.**
- 92/92 tests pass.
- `pops.mjs` is clean on MM95, MM96 and MM97.
- `check:visual` passes on all three.
- Real browser: rAF frame stepping, 60 fps, median 16.7 ms and max about 18 ms at dpr 2.

**Open.** MM93 and MM94 (3D) still use chained eases. Retrofit them to coupled curves.

## M6.2: true camera (card space) and colour-matched rhymes, after the second critique

**User:** "you didn't really understand *Magpie*. It works because the shapes are similar **and the colours almost identical** (hand-drawn design makes that possible; your octopus and umbrella can't, so it's very poor). And what you did isn't camera movement, only slight movement of objects in the frame. Camera movement makes the user feel their viewing angle changing: rotation or flipping, like a drone with three rotation axes, plus distance."

**Built.**
- **`renderers/card-space.ts`**:
  - flat shapes as cards in real 3D, rendered unlit with no tone mapping (`ThreeLayer({ flat: true })`);
  - sets with visibility windows, swapped at hide moments;
  - a drone camera driven by C¹ curves on position, look-at, roll and fov;
  - real motion blur, with sub-frames scaled to view rotation plus parallax.
- **MM98 `mm-drone-rhyme`**, original content in title-design grammar, as one continuous 12 s shot:
  - a top shot of a pocket watch spinning on a dark desk; gather, then a dive into the face;
  - cream fills the frame, and the camera bursts out of the same cream moon;
  - rise and pull back over three depth-tinted rows of roofs;
  - an FPV bank, drop and skim into a lit window, which is cream;
  - out of the page of an open book, then a raking orbit across the red desk to the title, set in perspective.
- **Colour in rhymes**:
  - `colorScore` (OKLab ΔE) multiplies the shape score;
  - `tools/rhyme.ts` reads SVG fills and mean picture colours and flags `COLOURS DIFFER`;
  - on coffee → plant, coffee ↔ soil now ranks first.
- **`tone()`**: restyles a cut-out into a shared silhouette palette. MM97 is now ink on red for both pictures.

**Verified.**
- 94/94 tests pass (new: colour score, C¹ curves).
- MM98: `pops.mjs` is clean and `check:visual` passes.
- MM98 in a real browser, stepping frames at dpr 2: median 16.7 ms, p99 18.9 ms.
- MM97 v3: `pops.mjs` is clean and `check:visual` passes.

**Honest status.**
- MM98 is the reference for "camera".
- MM95–97 still use the 2D in-frame camera.
- MM93 and MM94 still use chained eases.

## M6.3: in-between details and speed (third round of feedback)

**User.**
- "With the octopus, the shapes still aren't identical, so don't switch the picture directly. Morph the shape first, then switch. The core is that every transition needs its details thought through."
- "The 2.5D drone is good, but the move is too hesitant, with no sense of speed."

**MM97: silhouette morph, then swap.**
- `vector/trace.ts` moves marching squares and RDP into the engine, with a region `keep` test.
- `vector/sdf-field.ts` adds an exact EDT (Felzenszwalb), signed fields and `fieldMorph` with an outward `ripple`.
- `matchCutArtScene({ silhouette })` works like this:
  - a disc that covers the frame for the whole hand-off;
  - the hook's outline flows into the curl's (shared area stays, the extra shaft thins away, the tip curls);
  - the other tentacles grow outward from it;
  - the picture switches only when the outlines match.
- **Tried first: outline correspondence.** It pinched and ballooned the hook (rejected).
- **Morph window.** A wide window drew the whole octopus into the disc; the fix is a window while the camera hovers.
- **Performance.** Field outlines are cached per 1/240 of k across blur sub-frames, and the grid is 400. Before: 13–19 ms per frame plus a 121 ms spike. After: max 19 ms, with no frame over 20 ms.

**MM98: speed.**
- **Measured with the new `tools/camera-profile.ts`.**
  - The old path peaked at about 6 u/s in the FPV stretch.
  - It nearly stopped (1.7 u/s) at the turn at 5.2 s.
  - It gathered for 1 s and held still for 2.5 s at the end.
- **Rewritten.**
  - A 0.5 s gather, then dives and bursts at about 20 u/s.
  - Brakes of 0.3 s or less into each hide.
  - The U-turn is a sideways sweep (minimum 7.5 u/s).
  - The fov widens to 60° at speed.
  - A shorter end; the total is 9.2 s.
- `camera-profile` reports no stalls; intended brakes are recognised by their zero-velocity keys.

**Verified.**
- 94/94 tests pass.
- `pops.mjs` is clean on MM97 and MM98.
- `check:visual` passes on both.
- Real browser at dpr 2: MM98 median 16.7 ms and p99 17.7 ms; MM97 median 16.7 ms and max 19.3 ms.
