# Architecture

The planner runs in the Agent. It compares alternatives and writes a MorphPlan whose part links describe what can be tracked through each handoff. The runtime evaluates authored geometry and material state at a requested time. It can be used in a browser without a model API.

| Layer | Contract | Current implementation |
| --- | --- | --- |
| Planning | Parts, alternatives, links, beats, constraints, risks | JSON schema and relational plan validation |
| Part evaluation | Named local geometry and material plus inherited transforms | Parent-first affine graph and one-to-many links |
| Contour | Explicit corresponding rings | Flubber adapter with separate rings |
| SDF part field | Ordered primitives with smooth union/subtract/intersect, stroke skeletons, decals | `renderers/sdf-gl.ts` (two-pass WebGL 2: float field → inflated lighting, SSS, cast shadow) and `effects/skeleton.ts` |
| Wet geometry | Compact mass field, split, merge, and holes | Canvas marching squares and WebGL 2 field with optional noise distortion |
| Particle transport | Seeded source and target samples and repeatable motion | Grouped assignment, analytic paths and independent secondary motion |
| Volume | Real 3D geometry and material state | Three.js layer composited into the shared frame |
| Composition | Pure function of requested scene time | Effect cues and a shared seek/play/reverse host |
| Delivery | Exact endpoint frames and reproducible encoding | Inline Vite build, Chromium and H.264 via FFmpeg |

The two liquid paths approximate shape motion. Their field can change topology, but it does not solve incompressible flow, conserve volume, or produce a simulation from arbitrary input images. The 3D example authors a compatible procedural mesh. Arbitrary mesh retopology and semantic segmentation are left to authored geometry or future adapters.

The upstream audit records exact SHAs, the code paths reviewed, screenshots from actual runs, and licensing decisions. Only Flubber and Three.js are upstream runtime dependencies. The remaining projects provided reference techniques and comparisons.

The SDF part field is the default for organic morphs since it unifies semantic parts and liquid topology in one representation. See `docs/roadmap.md` for the rationale.
