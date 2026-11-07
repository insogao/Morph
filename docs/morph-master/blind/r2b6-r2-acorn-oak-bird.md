# Blind round 2 · B6 — acorn → oak → leaf → bird (`r2-acorn-oak-bird`, "MM82 · 橡果 → 橡树 → 落叶 → 飞鸟（一镜到底）")

Files: `lab/r2-acorn-oak-bird/scene.ts`, `lab/r2-acorn-oak-bird/plan.json`, `lab/r2-acorn-oak-bird/eval.json`, deliverable `gallery/r2-acorn-oak-bird.html` (6.2 MB, offline). 11.5 s, 1280×720.

## 1. Routes and why

- Material: none, so the morph-master table sent me to `skills/creative-morph/SKILL.md` (the row for "a description only").
- **Acorn → oak: effect-catalog #7, growth fill** (`effects/growth.ts` `colonize`, demo `lab/seed-rabbit`). The catalog row ("B has volume and A is small or alive (seed …)") matches the brief exactly.
- **Leaf → bird: a hand-built point-for-point vector morph** in Canvas 2D. Both shapes are sampled at the same arc-length parameter, plus a tumble about the midrib as the hide moment.
  - I did not use the SDF part field, although it is the creative-morph default. My memory notes record that the user prefers flat 2D goo and dislikes glossy 3D on flat art, and a flat tree next to a glossy SDF bird would clash.
  - No catalog row fits "a flat shape becomes another flat shape by a tumble". The closest are #1 (liquid) and the morph-master svg-icon route, but that route needs SVG input.
- **Camera: a 2.5D parallax rig I wrote myself**, not `renderers/card-space.ts`.
  - It has 5 depth layers (sun 0.06, far hills 0.22, mid hills 0.5, tree plane 1, foreground tufts 1.3). Each layer's zoom is z^f and its offset is scaled by f, so layers slide against each other.
  - `curve()` from `vector/camera-move.ts` drives x, y, log-zoom and roll, each on its own Hermite keys.
  - camera-motion.md says a flat zoom is "not a camera move" and points to card space. Parallax layers give that viewpoint feel more cheaply and keep the flat look. I did not read card-space.ts, so I can't say whether it would have been better.

## 2. How the three stages are chained, and what makes the hand-offs continuous

There is one world, one camera and one clock, with no cut and no fade. Every hand-off has a **carrier** that exists in both stages, and every stage starts before the previous one has finished.

| Hand-off | Carrier | Overlap |
| --- | --- | --- |
| acorn → tree (1.35–2.3 s) | The seedling that comes out of the crack **is** the first trunk segment: the same `colonize` node chain, revealed by path distance from the root, so the tip moves at a steady speed. The radicle carries on into the root system. The shell halves are pushed apart by the trunk as it thickens and stay at its base. The cap is lifted off and lands beside the trunk. | The camera is already tilting up and pulling out with the tip (z 4.8 → 1.0) while the acorn is still opening. |
| tree → leaf (4.3–5.9 s) | One leaf on the lower-right edge of the crown ripens from green to amber while the tree is still growing (prefigure). A gust runs left to right through the grass as a wave (`gust(t, x)` delayed by x), shakes the crown and releases the leaf (cause). | The last clumps are still budding when the leaf ripens. The camera starts pushing toward the leaf (5.4 s) before it detaches (5.7 s). |
| leaf → bird (6.7–8.2 s) | The leaf tumbles about its midrib and is edge-on at about 7.03 s (hide moment). It reopens as the bird, point for point: its left and right halves are the two wings. The leaf's lobe valleys and the wing's feather notches sit at the **same arc-length s**, so the lobes slide into primaries. The veins are drawn from the same outline samples, so they become feather shafts. The petiole becomes the tail and the leaf tip becomes the beak tip. The colour stays amber throughout; the dark primaries, head cap and beak fade in only after the shape has formed. | The morph runs **during** the fall. The wings first open flat into a glide; the first beat is a downstroke that stops the fall (7.62 s). The camera pull-out to the wide shot begins (8.1 s) while the flaps are still building. The bird flies into depth (shrinks) toward the sun. |

The tree stays on screen to the end, so the last frame contains every stage's result: the oak, the cap and shell at its base (tiny), and the bird as a speck.

## 3. Where the skill was unclear, wrong or missing for a multi-stage story

1. **No multi-stage guidance anywhere.**
   - SKILL.md, planning.md and the plan schema are all A → B: one `source`, one `target`, 7–8 s.
   - The only chaining advice is effect-catalog "Combining mechanisms" (≤ 3 mechanisms, hand off on a shared carrier) and camera-motion "overlap the steps". That turned out to be the right principle, but nothing says how to plan an A → B → C *story* or how to budget time per stage. I guessed 11.5 s.
   - **Missing:** a "chain" section, i.e. one beat table per hand-off, plus a rule that each stage's *result* must be the next stage's *carrier* (sprout = trunk, leaf = bird).
2. **`plan.json` schema can't express an intermediate subject.**
   - `schemas/morph-plan.schema.json` and `core/plan.ts` `validatePlan` allow only source and target. The leaf exists in neither, so I had to fold the tree into "source" and also into "target" (part `oak`).
   - I read `packages/morph-engine/src/core/plan.ts` and `demos/ink-bird/plan.json` to learn the exact shape. runtime.md only says "use the same ID and duration in the plan schema".
3. **Scene location conflict.**
   - creative-morph/runtime.md says to put new scenes in `demos/<id>/`, while morph-master says `lab/<id>/`, and `mm verify` writes `lab/<id>/eval.json`. I went with lab/.
   - Neither SKILL.md mentions `npm run mm` (verify / review / qc) at all. I found it only through the task prompt and `npm run mm -- --help`.
4. **Growth API usage.**
   - The catalog names `growth.colonize`, but nothing documents how to *reveal* it over time or how to draw it. I read the top of `lab/seed-rabbit/scene.ts` and `packages/morph-engine/src/effects/growth.ts`.
   - From seed-rabbit I learned to reveal by node order. Its comment notes this keeps the growth speed even, but for a tree that made the trunk climb almost instantly. I switched to path distance from the root.
5. **Pipe-model radius is a trap for animated growth.**
   - `growth.ts` returns the *final* radii. If a branch is drawn at its final thickness the moment it appears, you get fat stubs and a branch that thickens in one frame (pops.mjs flagged 4.017 s).
   - My fix was to recompute the pipe model each frame over the tips that have grown so far, with the weight of each new tip ramping in.
   - **Missing:** one sentence on this in the catalog row or in growth.ts.
6. **Card space vs. 2D.**
   - camera-motion.md firmly says to use card space for a camera move, but it gives no API summary, and `tools/camera-profile.ts` expects a `PATH` export in card-space form.
   - My parallax rig therefore couldn't use the profile tool. I skipped it, and I had to guess whether a custom parallax rig "counts".
7. **The SDF-is-default rule conflicts with flat style.**
   - Nothing in creative-morph says when *not* to use SDF for flat illustration. That came only from my memory notes.
   - morph-master's vector route requires SVG input, so there is no documented "draw your own vector shapes" path for a description-only brief.
8. **What I read outside the skill, and why:**
   - `core/scene.ts` (the MorphScene interface, ramp)
   - `effects/skeleton.ts` exports (`rng`, `win`, `backOut`)
   - `vector/camera-move.ts` (`curve` signature)
   - `effects/growth.ts`
   - top of `lab/seed-rabbit/scene.ts`
   - `core/plan.ts` and `demos/ink-bird/plan.json`
   - `tests/engine.test.ts` (to see whether plan.json is auto-validated: it is)
   - `tools/frames.mjs` header (options)

   Each was a lookup of a signature or file shape. None was a design question.

## 4. Verification

- `npm run mm -- verify r2-acorn-oak-bird --material novel --note "blind round 2, B6"`:

```json
{
  "code": { "ok": true, "tests": "108 pass, 0 fail" },
  "playback": { "deterministic": true, "pops": [] },
  "quality": [],
  "visual": "NOT REVIEWED — look at dense frames, then: mm review r2-acorn-oak-bird pass|fail \"…\""
}
```

- eval.json quality: `flags: []`, and `holds: [[11.17, 11.5]]`, which is the intended end hold.
- pops: the first run flagged **4.017 s** (×2.8; a branch suddenly fat). Fixed with the live pipe model; the next run reported "no pops".
- Frames I looked at, at full resolution: 0.6, 1.3–2.3 (every 0.2 s), 2.9, 3.0–5.5, 5.5–6.15 (dense), 6.9–7.7 (every 0.1 s), 7.85–11.5.
- Visual fixes, by timestamp:

| Time | What I saw | Fix |
| --- | --- | --- |
| 1.9 s | The trunk was already huge | Distance-based reveal plus live thickness |
| 1.6–2.3 s | The wet patch looked like a hole, and extended above the ground | A soft gradient, clipped to the soil |
| 0.6 s | The whole acorn was drawn as two halves, so it looked pre-split | Drawn as one nut until it cracks |
| 3.8–4.5 s | Fat stubby branches | Live pipe model |
| 5.45 s | A sausage trunk with a round blob poking into the soil | Clipped at the ground, root flare added, thinner trunk |
| 6.1–7.0 s | The falling leaf was too small and edge-on for too long | Larger scale, flip moved to 6.72–7.34 s |
| 7.4 s | The wings flapped while half-morphed, so it looked like a folded leaf | Glide-open first, downstroke after |
| 7.6 s | Body too thin | Widened body and head |

- `npm run mm -- review r2-acorn-oak-bird pass "…"` is recorded in eval.json.
- `npm run export -- r2-acorn-oak-bird --html-only` wrote `gallery/r2-acorn-oak-bird.html`.

## 5. What still looks weak

- **The detach moment is small.** The amber leaf is about 20 px on screen at 5.5–5.9 s among a busy canopy. A viewer can miss which leaf left until about 6.2 s, when the camera has pushed in.
- **The middle of leaf → bird (7.25–7.5 s)** reads as "a lobed leaf spreading" more than "leaf becoming wings". The wing span runs diagonally because the heading is still turning. It is continuous but not crisp.
- **The canopy** is a pile of three-tone circles: pleasant flat illustration, but a little "broccoli". The individual oak leaves only read up close.
- **The gust** is subtle in stills: a grass wave and a 13 px crown sway. It is fine in motion, but it could be stronger as the cause.
- **The sapling** at 2.9–3.6 s is a tall bare stem with two leaves on top, a bit spindly.
- **The bird is seen from behind**, so there is no eye. It is small and recedes quickly, and the last 1.5 s it is just a speck.
- I did not use card space or real motion blur, and I did not run `camera-profile.ts`.
- Nobody but me has watched it play in real time. My review is based on still frames only.
