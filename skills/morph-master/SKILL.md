---
name: morph-master
description: Make a continuous web-page morph (A turns into B) from the user's own material — text, SVG icons, multi-part SVG illustrations, bitmaps, photos, 3D models (glTF/GLB with named parts) — or from a description alone. Use when someone wants a shape, word, logo, icon or illustrated object to transform into another with a readable in-between, played and scrubbed in the browser.
---

# Morph Master

Turn A into B so a viewer can follow what became what. Everything runs in the browser and is a pure function of time: scrubbable, reversible and exportable as one offline HTML file. A cross-fade is not a morph.

## 0. Agree on scope with the user first

This skill polishes a **workflow**, not a few showcase cases. The first step is a short conversation, held before any code is written.

1. **Place the request** against [references/capabilities.md](references/capabilities.md): is it strong, weak or untested for this skill?
2. **Tell the user plainly** what you'll make, which route you'll use and how good to expect it to be. Name the weak spots before they discover them.
3. **Ask for what makes it work.** The most common case: the user wants an **animal or creature**. Say that SVG creatures drawn from scratch look simple and stiff, and ask for reference images or layered artwork (best), or a 3D model. Draw SVG animals only if they don't want to provide references, and say the result will be simple.
4. **Offer the strong alternative** when the request sits on the weak side (photo subject → subject, a point cloud between unlike shapes, match cuts on clashing colours).
5. **Confirm** the material, the route and the length, then build.

If a direction keeps failing, report it and switch to a route from the strong table; don't iterate on a weak direction indefinitely.

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
| No material, only a description | [../creative-morph/SKILL.md](../creative-morph/SKILL.md) for the **mechanism** | Organic SDF part field, liquid, splash, particles, growth, 3D. **Prefer this for creatures.** This skill's rules still apply on top: camera-motion, shape-rhyme, and §4 Verify with `mm verify` / `mm review`. If you draw the material yourself, draw it as SVG parts and use the routes above. |

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
- **More than one change** (A → B → C, a growth then a transformation): follow [references/stages.md](references/stages.md). Use one world, camera and clock; give every hand-off a carrier or a hide moment; let the stages overlap (`chain()`).
- State your defaults if the user gives none: about 7–8 s for one change (10–12 s for three stages), 1280 × 720 design space.

## 3. Build

- **Part morphs are data.** Write `lab/<id>/morph.json` and a three-line `scene.ts` (copy `lab/mm-bulb-balloon`). The SVGs can be imported from `fixtures/…` or from the scene's own folder (`./bee.clean.svg?raw`), for example a cleaned copy with clips flattened and strokes outlined. `validateSpec` explains any mistake. Every part must have exactly one fate.
- **Shape and text morphs** are short scenes on `vector/` (copy the closest `lab/mm-*`).
- **Liquid, glossy or alive**: keep the vector geometry and render it through the SDF part field. Use `render` in `morph.json`, or `framePrims` in code. See the hand-off section of `references/vector-track.md` and MM09 / MM10.
- Title new scenes `MMxx · …` so the player lists them in order. Nothing else needs registering: the player picks up every `lab/*/scene.ts` automatically (`app/main.ts`).

## 4. Verify — four separate claims, recorded

Everything goes through one entry point: `npm run mm -- <command>` (run `npm run mm` for the list). The render tools play the **built** player in `dist/`; they rebuild it when any source is newer and stop with the compiler error when the build fails.

1. **Code**: it builds and the tests pass.
2. **Playback**:
   - `mm check <id>`: the same frame comes out whether you seek forward or backward.
   - `mm pops <id>`: no frame changes far more than its neighbours. Fix every geometry pop; a HUD label switching colour is fine.
3. **Quality signals** (`mm qc <id>`) compare every in-between frame with the still moments around it and flag what users notice:
   - **vanish**: the subject shrinks away and comes back;
   - **muddy**: colours go grey mid-way;
   - **flat-fill**: one foreign colour fills the frame for more than about 0.45 s, which is dead air.

   It also lists the **holds** (still stretches) it compared against; a hold longer than about 1.3 s in the middle of a change reads as hesitation. An empty list does **not** mean the morph looks good. There is no blob detector: no pixel metric could tell an unreadable mass from a good in-between.
4. **Visual**: `mm frames <id> t1 t2 … [--cols 6] [--width 1280]` renders a contact strip. Then **look** at the fastest part of every change, not just the ends, and fix anything that jumps, pops, turns into a blob, vanishes and reappears, or moves the wrong way. For camera moves, `mm profile lab/<id>/scene.ts` flags stalls.

`mm verify <id> [--material novel|known]` runs claims 1–3 and writes them to `lab/<id>/eval.json`. It writes a checkpoint after each step, so an interrupted session keeps what was done. Then record claim 4 yourself with `mm review <id> pass|fail "what you saw"`. A verdict is tied to the scene's files: change the scene and it shows as **stale** until you look again. `mm status` lists every scene's record. Never report a morph as done while its visual verdict is missing.

## 5. Deliver

`mm export <id>` (or `npm run build && npm run export -- <id> --html-only`) writes `gallery/<id>.html`, a single offline file that opens in any modern browser. It contains the whole player and every scene's assets, so expect several MB. Report what you inspected and anything that is still weak.

## Reference

**Guides:**

- [references/vector-track.md](references/vector-track.md): the shape morph API (pins, anchors, modes, sequences, bounce, debug view).
- [references/part-mapping.md](references/part-mapping.md): the general part-mapping method.
- [references/shape-rhyme.md](references/shape-rhyme.md): match cuts through a shared shape. The shape **and the colour** must match, and the shape is morphed until identical before the swap.
- [references/capabilities.md](references/capabilities.md): what this skill does well, badly, and not yet — read it before promising anything.
- [references/scroll-pages.md](references/scroll-pages.md): scroll-driven pages (scrollytelling); the scene is scrubbed by the reader's scroll.
- [references/music-sync.md](references/music-sync.md): cutting to the user's music: measured beat grid, loop clips, audio clock, motion-logo systems, MP4s per aspect.
- [references/stages.md](references/stages.md): multi-stage stories, carriers, overlaps, `chain()`, and growth that reads.
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
| `tools/export-page.mjs`, `tools/page-check.mjs` | Export and check a scroll-driven page (`pages/<name>/`) |
| `tools/beat-grid.py` | Measure a track's beat, drop and loop windows; cut a loopable clip; band levels |
| `tools/page-video.mjs` | Record a page as MP4 (exact frames) with the soundtrack, per aspect |
| `npm run export -- <id> --html-only` | Write the offline deliverable |

**Background:**

- `docs/morph-master/PLAN.md`: the material × effect matrix and the roadmap.
- `docs/morph-master/M1-report.md` … `M6-report.md`: what was measured, what was found to be false, and every user correction.
- `docs/morph-master/blind-test-1.md`: three fresh agents used this skill, and what they missed.
- `docs/morph-master/research-morph-studio.md` and `research-magpie-titles.md`: what was borrowed from mature work.
