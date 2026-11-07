# Blind test 1: does the skill alone carry a fresh AI? (2026-11-07)

**Setup.** Each tester was a fresh agent with no conversation context, working in its own copy of the repo. It got:
- a user-style request;
- "read `skills/morph-master/SKILL.md` and follow it";
- an instruction not to read the milestone reports.

All three pairs are new; no demo had used them. Each tester's own notes are in [blind/](blind/).

| | Material | Scene | Result |
| --- | --- | --- | --- |
| B1 | New multi-part SVGs, coffee cup → potted plant (`fixtures/s4`) | MM90 `bt-coffee-plant` | **Good.** Semantic mapping: cup → pot, coffee → soil, saucer → tray, handle → rim, steam → stem and leaves. Weak: the handle passes through a dark lump at about 2.9 s, and the steam lingers over the finished pot. |
| B2 | Text, STORM → SUNNY → a hand-drawn sun | MM91 `bt-storm-sunny` | **Good.** Letters stay readable; the letters split into the disc and rays. Weak: swapping letters look blobby around 2.2 s. |
| B3 | 3D, planet.glb → rocket.glb (3 → 7 parts) | MM92 `bt-planet-rocket` | **Ends good, middle weak.** At 3.0–3.8 s the planet → hull change reads as a blob of dust. |

All three passed build, test, `check:visual` and pops, each tester first, then I re-rendered and looked at the frames myself.

## What the skill got right

- Routing by material worked for SVG and text.
- Every tester produced a meaningful mapping, a story for each leftover part, a cause and a payoff.
- Each fixed several visual problems by actually looking at frames, which is the verify loop the skill asks for.

## Gaps found, and what changed

| Gap (who hit it) | Fix |
| --- | --- |
| The render tools play the **built** `dist/`, and nothing said to rebuild. B1 and B3 each lost about three rounds to stale frames. | `tools/browser.mjs` `ensureBuilt()`: frames, pops, check:visual and export rebuild when any source is newer, and stop with the compiler error on a failed build. SKILL.md says so. |
| `inspect.ts` labelled `.glb` as "photo" and routed to `photo.md` (B3). | `inspect.ts` reads glTF/GLB: kind `model-3d`, part names, triangles, bounds, colours, plus warnings for textures, skins, animations, generic names and multiple primitives. |
| `morph.json` cause and payoff fields, easing names and the time axis were undocumented (B1). | `inputs/svg-parts.md`, "morph.json at a glance": the clock, eases, when to use `pose` and when not to, refs, and the cause and payoff field tables. |
| `pose` swung a short-hop part (handle → rim) across the front (B1). | Documented: `pose` is for long trips. |
| No "rise / drift" cause for steam or smoke (B1). | Documented as missing. **Not built.** |
| Slot data, per-letter pins and report fields didn't match the docs (B2). | `inputs/text.md`, "Slot data and per-letter fixes". `vector-track.md` now says `crossings` is an array. |
| `circle()` and `star()` return rings, not shapes (B2). | Documented: wrap them with `shapeFromRings`. |
| Word → icon with several parts wasn't covered (B2). | `inputs/text.md`, "Word → icon with several parts": letters map to parts, as a small part remap. |
| The 3D rig had the rocket/lighthouse pair hard-coded (B3). | `rig(..., { models: { a, b } })`. |
| No per-part 3D animation, so the flame was fetched by child index (B3). | `Morph3D.part(side, name)`, with the rule about when it's safe to use. |
| `Mapping3D` `spread`, `swirl`, split pairing and the single-window limit were undocumented (B3). | `inputs/model-3d.md`, "`Mapping3D` fields". |
| Thin parts go dark edge-on (B3). | Rule added. |
| A sphere → tall silhouette reads as dust mid-morph (B3). | Rule added, with mitigations marked **not yet verified**. A quick swap to exploded style did not fix it: the globe sits at the model centre and has no outward direction. |
| No mention that new scenes are auto-registered, or that the offline file is several MB (B2). | SKILL.md. |

## Still open

- ~~3D between very different silhouettes~~ **Solved with camera choreography** (the user's idea), added afterwards as MM93 (matching view: planet circle → rocket tail seen along its axis → orbit to reveal) and MM94 (condense into the flame → grow upward). Both are pop-free and pass the seek check. The rule is in `inputs/model-3d.md`, "Camera choreography".
- **A "drift / rise" cause** for steam and smoke.
- B1's handle lump and B2's mid-swap blobs are scene-level polish, left as the testers made them.
- The second blind test should repeat with the fixed skill and new pairs, especially a photo and a cut-out PNG, which this round did not cover.
