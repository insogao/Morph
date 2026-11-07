---
name: morph-master
description: Make a continuous web-page morph (A turns into B) from the user's own material — text, SVG icons, multi-part SVG illustrations, bitmaps, photos, 3D models (glTF/GLB with named parts) — or from a description alone. Use when someone wants a shape, word, logo, icon or illustrated object to transform into another with a readable in-between, played and scrubbed in the browser.
---

# Morph Master

Turn A into B so a viewer can follow what became what. Everything runs in the browser and is a pure function of time: scrubbable, reversible and exportable as one offline HTML file. A cross-fade is not a morph.

## 1. Diagnose the material first

```bash
npx tsx tools/inspect.ts <files…>
```

Then pick the guide for that material. **Do not use another material's menu.**

| Material | Guide | Main mechanisms |
| --- | --- | --- |
| Text, words, letters, hanzi | [references/inputs/text.md](references/inputs/text.md) | Letter slots: keep / swap / born, stagger, bounce; text ↔ icon |
| One flat shape (icon, logo, silhouette) | [references/inputs/svg-icon.md](references/inputs/svg-icon.md) | Precise vector morph with pins, sequences and loops, echo, holes |
| Multi-part SVG with meaningful parts | [references/inputs/svg-parts.md](references/inputs/svg-parts.md) and [references/part-mapping.md](references/part-mapping.md) | Part remap: split, merge, born, vanish, pose flights; parallel channels |
| Line art, open strokes | `inputs/line-art.md` (planned) | One-line unravel (`lab/line-cat-deer`) |
| Bitmap with transparency (cut-out PNG) | [references/inputs/bitmap.md](references/inputs/bitmap.md) | Pixel particles, two-faced shatter, traced outline + texture wash |
| Photo / opaque image | [references/inputs/photo.md](references/inputs/photo.md) | Tile flip, ink reveal, shatter, particles. **Never promise a subject → subject morph on a photo.** |
| 3D model (glTF / GLB) with named parts | [references/inputs/model-3d.md](references/inputs/model-3d.md) | Point-cloud swirl, exploded reassembly, camera choreography for mismatched silhouettes (matching view, condense → grow), using the same part-mapping method |
| No material, only a description | [../creative-morph/SKILL.md](../creative-morph/SKILL.md) | Organic SDF part field, liquid, splash, particles, growth, 3D. **Prefer this for creatures.** |

Tell the user what their material allows and what it doesn't. `inspect` warnings are written so you can repeat them.

**Across all materials, also consider a shape rhyme** ([references/shape-rhyme.md](references/shape-rhyme.md)): push in on a part of A that already looks like a part of B, hand over there, and pull out on B. A rhyme needs the **same shape and the same colour**: design both ends, or restyle both into one palette. Run `npx tsx tools/rhyme.ts A B`. It is the best route when A and B differ a lot in overall shape, and the **only** subject-to-subject route for photos.

## 2. Plan

- **Parts**: follow [references/part-mapping.md](references/part-mapping.md):
  - inventory the parts by role;
  - pair them by meaning, using `tools/suggest-map.ts` as a second opinion;
  - give every leftover a story;
  - layer the timing;
  - add a cause before the change and a payoff after it.
- **Shapes or text**: decide on pins, the sequence, and the motion layers (bounce, echo, squash) from the vector guide.
- **Motion**: whatever moves (camera, parts, steps of a sequence) follows [references/camera-motion.md](references/camera-motion.md). A camera move means a change of **viewpoint** in real 3D (card space, MM98), not zooming a flat picture. Overlap the steps, keep something always moving, use speed curves (anticipation, brake, release), and hand off inside a hide moment. A visible A → B → C reads as mechanical.
- State your defaults if the user gives none: about 7–8 s, 1280 × 720 design space.

## 3. Build

- **Part morphs are data.** Write `lab/<id>/morph.json` and a three-line `scene.ts` (copy `lab/mm-bulb-balloon`). `validateSpec` explains any mistake. Every part must have exactly one fate.
- **Shape and text morphs** are short scenes on `vector/` (copy the closest `lab/mm-*`).
- **Liquid, glossy or alive**: keep the vector geometry and render it through the SDF part field. Use `render` in `morph.json`, or `framePrims` in code. See the hand-off section of `references/vector-track.md` and MM09 / MM10.
- Title new scenes `MMxx · …` so the player lists them in order. Nothing else needs registering: the player picks up every `lab/*/scene.ts` automatically (`app/main.ts`).

## 4. Verify — three separate claims

The render tools (`frames.mjs`, `pops.mjs`, `check:visual`, `export`) play the **built** player in `dist/`. They rebuild it on their own when any source is newer, and stop with the compiler error when the build fails. Never trust a frame rendered from a failing build.


- `npm run build` and `npm test`: it compiles and the tests pass.
- `npm run check:visual -- <id>`: the same frame comes out whether you seek forward or backward.
- `node tools/frames.mjs <id> t1 t2 …`: **look** at the fastest part of every change, not just the ends, and fix anything that jumps, pops or becomes unreadable.
- `node tools/pops.mjs <id>`: renders at 60 fps and flags frames that change far more than their neighbours (parts teleporting or vanishing for a frame, bridges popping in). It saves before / after pairs. Fix every geometry pop; a HUD label switching colour is fine.

## 5. Deliver

`npm run build && npm run export -- <id> --html-only` writes `gallery/<id>.html`, a single offline file that opens in any modern browser. It contains the whole player and every scene's assets, so expect several MB. Report what you inspected and anything that is still weak.

## Reference

**Guides:**

- [references/vector-track.md](references/vector-track.md): the shape morph API (pins, anchors, modes, sequences, bounce, debug view).
- [references/part-mapping.md](references/part-mapping.md): the general part-mapping method.
- [references/shape-rhyme.md](references/shape-rhyme.md): match cuts through a shared shape. The shape **and the colour** must match, and the shape is morphed until identical before the swap.
- [references/camera-motion.md](references/camera-motion.md): a real viewpoint camera (2.5D card space, drone), coupled curves, speed, hide moments and motion blur.
- `references/inputs/*.md`: one guide per material (text, svg-icon, svg-parts, bitmap, photo, model-3d).

**Tools** (`npx tsx` for `.ts`, `node` for `.mjs`):

| Tool | Use |
| --- | --- |
| `tools/inspect.ts` | Diagnose the material and get its route |
| `tools/suggest-map.ts` | Draft a part mapping |
| `tools/rhyme.ts` | Rank shape rhymes (shape × colour) |
| `tools/camera-profile.ts` | Speed profile of a drone path; flags stalls |
| `tools/frames.mjs` | Render a contact strip of chosen times |
| `tools/pops.mjs` | Find jumps at 60 fps |
| `npm run check:visual` | Check that seeking forward and backward gives the same frame |
| `tools/gif.mjs` | Record a GIF preview |
| `npm run export -- <id> --html-only` | Write the offline deliverable |

**Background:**

- `docs/morph-master/PLAN.md`: the material × effect matrix and the roadmap.
- `docs/morph-master/M1-report.md` … `M6-report.md`: what was measured, what was found to be false, and every user correction.
- `docs/morph-master/blind-test-1.md`: three fresh agents used this skill, and what they missed.
- `docs/morph-master/research-morph-studio.md` and `research-magpie-titles.md`: what was borrowed from mature work.
