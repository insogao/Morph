# Multi-stage stories: A → B → C in one shot

"An acorn grows into an oak, a leaf falls, and in the air it becomes a bird; one continuous shot, not three clips stitched together." Every single-morph rule still applies to each step. What is new is how the steps **join**. Worked example: MM82 `lab/r2-acorn-oak-bird` (blind test round 2, B6).

## The recipe

1. **One world, one camera, one clock.** Every stage is drawn in the same scene and the same `draw(ctx, t)`, and one camera path spans all of them ([camera-motion.md](camera-motion.md)). No cuts and no fades between stages.
2. **Every hand-off has a carrier or a hide moment.**
   - A **carrier** exists in both stages and is the thing the eye follows: the seedling that comes out of the acorn *is* the first trunk segment; the amber leaf *is* the bird, with lobes → feathers, veins → shafts, stem → tail.
   - A **hide moment** covers the swap: the leaf tumbling edge-on, a flat colour filling the frame, the fastest blurred beat.
   - Give each hand-off a **cause**: a raindrop wakes the acorn, a gust knocks the leaf off, the first wing stroke stops the fall.
3. **Stages overlap.** The next one starts while the current one is still finishing, typically 25–40 % of the shorter stage. The camera already rises with the growing tip while the acorn opens, and the push-in starts before the leaf lets go. Use `chain()` (`vector/chain.ts`): it places the stages, gives each its eased progress, and lists the hand-off windows.
4. **Budget the time.** About 2.5–4 s per stage, a short lead-in and a hold of about 1–1.5 s at the end; three stages come to roughly 10–12 s.
5. **Keep the carrier big enough to follow.** A 20 px leaf detaching from a wide tree is missed (the weak point of B6). Push in before the hand-off, or make the carrier larger or brighter than its neighbours.
6. **Plan it as stages.** Write `plan.json` with `"stages": [{ id, source, target, carrier, cause, duration }]` instead of one source / target pair, and give every stage's leftovers a fate as usual.
7. **Verify per hand-off.**
   - `mm frames` densely across every `chain().handoffs` window.
   - `mm qc` compares each in-between with the still moments around it, so it judges a sequence step by step.
   - `mm profile` checks the camera, if the camera is driven by a `PATH`.

## Growth that reads

- Reveal a growing structure by **distance from its root** (path length along the branches), so the growing tip climbs at a steady speed. Revealing by tree depth or by time makes the trunk shoot up almost at once.
- **Thickness depends only on what has already grown** beneath a branch, never on its final size. Otherwise a branch suddenly goes fat when its children appear; `pops` caught this at 4.0 s in B6.
- Roots and trunk flare where they meet the ground; a cylinder pushed into the soil reads as a sausage.

## Drawn material: flat or SDF?

When you draw the material yourself in a flat 2–3 colour style, draw it as flat Canvas 2D or SVG parts and use the vector routes. The SDF part field (`creative-morph`) is for organic **liquid** blends and bodies whose topology changes; on flat art its glossy, bevelled look clashes, and the user prefers flat goo even then (`render.style: "flat"`).

## Where scenes go

Put new scenes in `lab/<id>/scene.ts` (`creative-morph` mentions `demos/`; the player picks up both).
