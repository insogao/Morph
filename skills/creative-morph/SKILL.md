---
name: creative-morph
description: Design and build continuous procedural object-to-object morph animations from a natural-language brief. Use for semantic part transformations, liquid merging or splitting, particle reassembly, or mesh deformation that needs reproducible browser playback and MP4 export.
---

# Creative Morph

Build one continuous event in which the viewer can track a form, a material, or a moving part from its source to its destination.

## Plan the transformation

1. Identify the source and target silhouettes, their semantic parts, and the user's medium, framing, and duration. If unspecified, start with a silent 6–8 second study at 30 fps. State the defaults you use.
2. Compare three materially different treatments. Consider structural motion, material change, and decomposition followed by reassembly. Pick a treatment with a legible moment of change and workable part relationships.
3. Write a MorphPlan next to the scene. Name parts, mappings, timed events, effects, continuity constraints, and plausible failures with a fallback. Use [the runtime contract](references/runtime.md).
4. Choose two or three visual cues that survive the change. A seam can become a skeleton, a pigment vein can become a flight path, and a tension point can become a droplet. Define where the material goes when something splits.
5. Allocate time to the starting pose, transformation, and a target-specific motion after the change. Avoid a whole-object crossfade as the main transition. Local shading and thin highlights may change with the surface.

## Build and verify

- Resolve the engine using [references/runtime.md](references/runtime.md). Put a new subject pair in its own scene. Use the same pure draw function in the player, contact sheet, and encoder.
- Use contour interpolation for corresponding rings, an implicit field for merge or split, particle assignments for material transport, and a compatible mesh or rig for true depth. Combine them through shared time and part state. Read [references/effect-recipes.md](references/effect-recipes.md) as needed.
- Prototype the hardest beat first. Inspect source, target, and intermediate frames. Repair a broken part correspondence with geometry or a visible handoff.
- Export an offline HTML player and MP4 after the checks pass. Report frame count, what was inspected visually, and any unresolved issues.

The core works without model keys. Use generated assets only when requested and approved for the provider and input. Inspect endpoints before adding generated video as a timed layer.

See [references/source-audit.md](references/source-audit.md) for upstream algorithms and license decisions.
