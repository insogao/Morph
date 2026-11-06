---
name: creative-morph
description: Design and build continuous procedural object-to-object morph animations (A turns into B) from a natural-language brief. Use for semantic part transformations, liquid melting, merging or splitting, particle reassembly, or mesh deformation that needs reproducible browser playback and MP4 export.
---

# Creative Morph

Build one continuous event in which the viewer can track a form, a material, or a moving part from its source to its destination. A crossfade is not a morph.

## Plan the transformation

1. Identify the source and target, their semantic parts, and the user's medium, framing, and duration. If unspecified, use a silent 7–8 second study at 30 fps, 1280×720 design space. State the defaults you use.
2. Read [references/planning.md](references/planning.md). Compare three treatments that use materially different mechanisms (structural, material, deconstructive). Pick the one with the most legible middle frames and a visible cause.
3. Choose devices that make the change inevitable: an environmental cause, a pre-figuring hint (splash drops where feather tips will land), material transport (a part travels to become a detail), and a payoff motion only the target can make.
4. Give every unmatched part a fate: merge, split, retract, absorb, or leave behind. Never leave a source part and its replacement on screen together.
5. Write `plan.json` next to the scene with parts, mappings, timed beats, effects, constraints, and risks phrased as a viewer would see them.

## Pick the mechanism

Read [references/effect-catalog.md](references/effect-catalog.md). It lists ten mechanisms, each with a runnable demo, what the viewer reads it as, and when it fits. In short:

| Effect | Use |
| --- | --- |
| Organic bodies, limbs, liquid, melt, split/merge, topology change | **SDF part field** (`renderers/sdf-gl.ts` + `effects/skeleton.ts`). This is the default. Read [references/sdf-field.md](references/sdf-field.md). |
| Brittle or painted objects breaking and rebuilding | Voronoi shards (`effects/fracture.ts`) with two-faced pieces |
| Line art, neon, wire | One continuous polyline resampled on both shapes, peeled through a flight curve |
| Something growing into the target | Space colonization (`effects/growth.ts`) |
| Dissolve into grains and reassemble | Particle tracks (`effects/particles.ts`), routed through a legible intermediate formation such as an orbit, not a straight cloud |
| True depth and volume, solids | Raymarched 3D SDF via `renderers/shader-layer.ts`, or Three.js meshes (`renderers/three.ts`) |
| Matching simple outlines | Contour rings (`effects/contour.ts`, Flubber) |

These mechanisms compose because they share one clock and one 2D canvas. Draw them as successive layers within the same `draw(ctx, t)`, and hand off on a carrier visible in both.

## Build and verify

- Follow [references/runtime.md](references/runtime.md) for scene layout, commands, and the player API. Put a new subject pair in `demos/<id>/scene.ts` with `plan.json`.
- Build every part in a local frame as a pure function of `t`. Use seeded randomness only. Place the whole object with `transformPrims`.
- Prototype the hardest beat first. Iterate with `node tools/frames.mjs <id> t1 t2 …` to see specific times side by side. Look closely at the transformation window, not only the endpoints.
- Run `npm run build`, `npm test`, and `npm run check:visual -- <id>`, then inspect the contact sheet at 0/10/25/50/75/90/100%. Fix any jump, pop-in, duplicate part, or unreadable middle frame. Record each fix at its timestamp.
- Export with `npm run export -- <id> --width 1280` (then `--width 1920`). Report the frame count, what you inspected, and any unresolved issues. Keep "it compiles", "the tests pass", and "it looks right" as separate claims.

The core works without model keys. Use generated video only when the user requests it and approves the provider and input. Inspect its endpoints before adding it as a timed layer.

See [references/effect-recipes.md](references/effect-recipes.md) for the older contour, particle, and mesh recipes, and [references/source-audit.md](references/source-audit.md) for upstream algorithms and licenses.
