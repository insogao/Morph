# Blind round 2 · B5 — swallow → koi (`r2-swallow-koi`, "MM81 · 水墨燕 → 工笔锦鲤")

Files: `lab/r2-swallow-koi/{scene.ts, rig.ts, swallow.json, koi.json, swallow/*.png, koi/*.png, eval.json}`, deliverable `gallery/r2-swallow-koi.html` (7.2 MB, offline).

## 1. Route and why

**Route: layered cut-out bitmaps → `tools/trace-layers.ts` per layer → per-part texture mesh warp (MM15 `buildMesh`/`meshAt`/`drawMeshTexture`) with the part mapping chosen by meaning (part-mapping.md), plus a pose step (wing fold) before each warp and a moving carrier for the flight.**

- `inspect` says `bitmap` for all 11 files, which sends you to `inputs/bitmap.md`. Its "Per-part morph: layered PNGs" row says trace → part remap → per-layer texture wash. Its "Texture mesh warp" row keeps the painted detail *moving with* the shape. I combined them: the remap decides what becomes what, and the mesh warp carries each layer's painting. Feathers stretch into fin rays, so there is no flat-silhouette stage.
- The colour change runs as its own channel (svg-parts.md §3, "parallel channels"). A radial front spreads out from where the beak touches the water. Outside it, A's warped texture shows; inside it, B's, on the same in-between geometry. So you never see two fish.
- Cause: the swallow glides and banks left (top view), its shadow closes in as it descends, and its wings sweep back for the dive. Then the beak touches the water and ripples spread. Payoff, which only a fish can do: the tail beats (seen from the side it foreshortens about its root), the pectoral fin paddles, and each beat surges the koi forward.

**Rejected:**
- *Pixel particles (MM12)*: they read as "dissolved and rebuilt" and lose the anatomy story (wing → fin), which is the whole point of bird → fish.
- *Shatter (MM13)*: the material is brittle-glossy, which is wrong for ink and silk painting.
- *MM09-style traced outline + SDF + texture wash*: this would flatten the swallow into a silhouette, and the painted texture would only come back at the end. The mesh warp keeps the paint alive the whole time.
- *Shape rhyme / match cut*: forked tail ↔ forked tail is a real shape rhyme, but the colours differ (dark ink vs pale orange). The skill says a rhyme needs the same colour, and restyling with `tone()` would destroy both paintings. I used the rhyme as a *mapping* (streamers → lobes) instead of as a cut.
- *creative-morph / SDF creatures*: the user supplied artwork.
- *Card-space camera*: there is no true viewpoint to change. I used the bird's own flight path as the motion, not a fake zoom.

## 2. Correspondence

| A (swallow, top view, head up) | B (koi, side view, head left) | Story |
| --- | --- | --- |
| body | body | core → core. Pins: beak → snout, rump → tail root. The slim body fills out. |
| wing_right (points **up** after the left turn) | dorsal_fin | spread → spread. It sweeps back about the shoulder until its root→tip lies along the fin's root→tip (pose, then warp). |
| wing_left (points **down** after the turn) | pectoral_fin | spread → spread. It folds back and shrinks to about 0.4×. It crosses from behind the body to in front of it during the fold (two paint copies, 0.6 s ramp, so the z-change never pops). |
| tail: two streamers (one layer, two rings) | tail, **cut along the fork** into an upper and a lower lobe (Sutherland–Hodgman clip from the root to the notch) | forked tail → forked tail. Each streamer widens into one lobe, and the two close into one fan. |
| — | eye (born) | Born with the colour: B's eye layer is painted through the body mesh near the eye, so it appears exactly when the colour front passes the head. That also covers the eye *hole* in koi_body.png, which would otherwise show paper. |
| — | pelvic / anal fins, barbels (inside koi_body.png) | They grow out of the body outline as part of the body warp. They have no separate layer, so they don't get their own story. |
| full.png of both | not used | Only the parts are used, and they reproduce the full image. |

Timing overlaps by design: fold 0.85–2.7 s, warps 2.0–5.0 s (staggered body → wings → streamers), colour front 2.0–5.0 s, swim from 4.4 s, which overlaps the end of the warp. The carrier (position, heading, scale) is built from Hermite curves, with a brake on contact at 2.05 s.

## 3. Where the skill was unclear, wrong or missing

1. **`inspect` has no notion of a layer set.** It reports 11 independent bitmaps. Nothing says "these 5 files share a canvas, so they are one layered drawing". I had to infer the "Per-part morph" row myself.
2. **bitmap.md's "Per-part morph" row is one line**: "Trace each layer → part remap (`inputs/svg-parts.md`) + per-layer texture wash". There is no recipe. `remapScene`/`morph.json` takes SVG strings, not traced layers, and the guide doesn't say how to feed it traced rings or draw textures per part. **I read `lab/mm-glyph-koi/scene.ts`** (to see traced `layers.json` → `shapeFromRings` → `remapParts` with a fake `SvgDoc`) **and `lab/mm-mesh-warp/scene.ts`** (to see the `buildMesh` / `drawMeshTexture` call pattern and the Placement for 2/3-scaled traced rings). Then I chose mesh warp and wrote my own rig instead of `remapParts`.
3. **Mesh warp has no pose or rigid-transform support.** For any pair where parts must turn a lot first (a 90° heading change, wings folding), you have to compose similarities yourself. I wrote `Sim`/`lerpSim`/`compose` in `rig.ts`. I **read `packages/morph-engine/src/vector/mesh.ts`** (the `Mesh` fields, the `pins` option, and `meshQuality` with its "above ~2 % degrade" rule, which appears **only in a code comment, not in the guide**) and **`bitmap-render.ts` `drawMeshTexture`** (to learn that `tex` is in *design* coordinates through the Placement, which is what makes the inverse-pose trick work).
4. **`buildMesh` takes one ring.** A part traced as several rings (the swallow tail has 2) has to be handled by hand. The guide doesn't mention this, and a koi tail that needs to be *split* (1 → 2) has no helper. I wrote a half-plane clip.
5. **`meshQuality` flips at t = 1.** Body 4.8 %, wing_left 4.7 % at the end point. This comes from near-collapsed triangles where the swallow triangles become very thin on B. Mid-way it stays below 3.3 %. The guide's threshold doesn't say whether the end point counts. At t = 1 only B is drawn, via `onB` = identity, so I judged it harmless and confirmed visually.
6. **Mesh warp guidance says "similar subjects only"**, but per *part* this mixed pair (wing → fin, streamer → lobe) warps fine once the parts are posed first. The guide could say: judge similarity per part *after* posing, not per picture.
7. **Pins** accept `Vec2` (from `correspond.ts`). The guide never says what a Vec2 pin means. I guessed "nearest contour point", and that worked.
8. **`npm run mm -- verify/review` is not in SKILL.md at all.** Only the user's prompt told me about it. I read `tools/mm.ts` to learn what verify runs. The qc "holds" output is not explained anywhere: it lists 0.2–0.4 s low-change windows between tail beats, but there are no flags.
9. **frames.mjs**: `--width` only changes the render size, and the screenshot is always 1280 wide. To inspect detail I cropped with PIL. A `--crop`/zoom option is missing.
10. **Frame budget**: there's no guidance on the cost of `drawMeshTexture` (one clip + drawImage per triangle). Measured in the headless preview: about 28 ms/frame during the morph, about 11 ms once only B is drawn. I cut it from 50–58 ms by masking once per side instead of once per part, drawing the shadow from rigid layer images, and blurring at half resolution. I haven't measured a GPU browser.
11. Side-view fish payoffs: part-mapping.md lists `wiggle`/`hinge`, but MM09 swims a side-view koi with a *vertical* sine wave, which is physically a dolphin. I used tail foreshortening instead. The guides don't discuss which payoffs are physically right for the view.

## 4. Verification

`npm run mm -- verify r2-swallow-koi --material novel --note "blind round 2, B5"`:

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
  "visual": "NOT REVIEWED — look at dense frames, then: mm review r2-swallow-koi pass|fail \"…\""
}
```

Then `npm run mm -- review r2-swallow-koi pass "…"` → `lab/r2-swallow-koi/eval.json` visual: pass. `pops.mjs`: 480 steps at 60 fps, no pops. `check:visual`: PASS.

Frames I actually looked at (Read the jpg):
- whole strips at 0–8 s;
- the flight at 0, 0.6, 1.0, 1.3, 1.5, 1.6, 1.9, 2.0, 2.2, 2.45, used to fix the wing tips leaving the frame (lowered the scale and path, folded earlier);
- 1280-px crops at 2.0 / 2.9 / 3.3 / 3.45 / 3.9 / 4.2;
- dense 2.8 → 3.55 every 0.15 s (the fastest warp plus the colour front);
- the payoff at 4.4 → 8.0.

What I fixed from looking:
- v1 had the colour front reach everything by 3.2 s while the shape lagged, so it read as "a small koi inflating". I slowed the front to track the warp and raised the swallow's scale (K 1.3 → 1.55), so the swallow's length is about 0.55 of the koi's.
- The morph settled into a dead hold before the swim, so I started the swim at 4.4 s, overlapping the end of the warp.
- I made the ripples lighter (4 → 3 rings, lower alpha).

## 5. What still looks weak

- **The grey band in the colour front** (about 3.1–3.4 s). Where dark ink fades over white scales, the mix inside the 150 px front edge passes through grey. Moving and brief, but the least beautiful frames.
- **Viewpoint mismatch**: the swallow is seen from above, the koi from the side. I treat the paper as the picture plane (as a scroll painting would), with no 3D reconciliation. The top-view ripples (circles) sit behind a side-view fish.
- **The left wing → pectoral fin shrinks a lot** (about 0.4×). Mid-way (3.0–3.3 s) the pectoral is oversized, and the body looks stubby before it lengthens.
- **The fringe**: mesh triangles cover only the traced 50 % alpha region. The faintest ink-wash feather wisps are cut off, so frame 0 is very slightly crisper than swallow_full.png.
- **The koi ends left of centre**, because it keeps swimming out. The final frame is not a composed hold.
- **Performance** in a real GPU browser hasn't been measured (headless: about 28 ms/frame mid-morph).
