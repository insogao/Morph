# Effect recipes

For organic bodies, limbs and liquid, start with [the SDF part field](sdf-field.md). The recipes below cover the other representations.

## Track a part

Choose a seam, branch, or pigment deposit and trace it through the handoff. `core/parts.ts` compiles named geometry and material callbacks with parent-first world transforms. Store leaf geometry in local coordinates and attach follow-through to the part that carries it.

`core/effects.ts` composes ordered changes over a single clock. Each cue receives state, time, and local progress. A completed cue remains applied, so the next cue can operate on its result.

## Match corresponding contours

Use `effects/contour.ts` for explicit simple-ring matches. Keep holes as separate rings with a deliberate fill rule. Inspect the midpoint for twist and reversed edges. Use a field or multiple carriers for a cut, join, or unmatched hole.

## Move wet material

Use `effects/liquid.ts` for compact elliptical masses with position, radii, and strength. A liquid bridge exists where the combined implicit field crosses the isovalue. Fill the stitched paths with even-odd. Develop the geometry in flat color before adding material and reflections. Look for accidental bubbles or abrupt bridge collapse.

This field produces plausible geometry without a pressure solve or volume conservation. Motivate motion with gravity, tension, or a material transfer. For a painted look, deposit pigment along a moving tip and allow local spread near fresh marks.

Use `renderers/liquid-gl.ts` for WebGL 2 field evaluation and seeded coordinate distortion. Draw the returned canvas at the same origin used in the renderer. The isovalue and distortion control geometry. Ink, water, jelly, metal, wax, and clay affect shading. Use the CPU field as a fallback where WebGL 2 is unavailable and dispose the renderer when it is no longer used.

## Disassemble and reassemble

Use `effects/particles.ts` for seeded sampling and assignments. Group by source and destination before adding turbulence. Drive paths and stagger analytically from time. Let particles reach the correct region before it acquires a coherent target edge. Keep the finished silhouette legible before adding secondary motion.

## Change real volume

Preserve vertex correspondence for compatible meshes. Model both outer and inner surfaces if an opening appears. Use orbit, real lighting, and occlusion to verify depth. Reuse geometry across seeks and dispose owned buffers, materials, and WebGL resources at teardown.
