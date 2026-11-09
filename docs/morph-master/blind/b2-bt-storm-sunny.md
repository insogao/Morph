# BLIND-NOTES · bt-storm-sunny (MM91 · STORM → SUNNY → 太阳)

Files: `lab/bt-storm-sunny/scene.ts`, `lab/bt-storm-sunny/glyphs.json`, export `gallery/bt-storm-sunny.html`.
8.0 s, 1280×720 (skill defaults).

## 1. Route

Text guide (`references/inputs/text.md`) on the vector track. The material is two words plus an icon I draw, with no user files, so I skipped `tools/inspect.ts`. The text guide lists word → word (`morphWords`) and text → icon. "The letter changes must be readable" calls for crisp real-font outlines with keep/swap slots, so I used the vector track and not the SDF/creative-morph route. The sun is flat art, which also points to vector. Template: copied `lab/mm-word`.

## 2. Slot plan

Step 1, STORM → SUNNY (`morphWords`, Inter 800, size 176, same centre):

| from | to | kind | note |
| --- | --- | --- | --- |
| S | S | keep | rigid slide (almost no travel) |
| T | U | swap | |
| O | N | swap | the O's hole closes |
| R | N | swap | pinned `{corner:0}`↔`{corner:0}`: without it `selfHits` was 2, with it 0 |
| M | Y | swap | |

No born or vanish slots (both words have 5 letters). The stagger runs left to right (0.4), with ease-in plus a bounce. A short echo trails each moving letter, and KEEP / SWAP x→y tags sit under the letters. Cause: rain thins out drop by drop and the sky warms slate → dawn blue → peach → cream along with the wave. Letters go cold grey → amber → orange, routed through saturated midpoints following the skill's "colour through ink" advice.

Step 2, SUNNY → sun icon. The sun is hand-built: a disc plus 8 tapered rays made with `circle` / `polygon` / `compound`. I did **not** use `iconSlot`, because the guide says it makes the middle letter the icon and the rest merge into it, so four letters would just be swallowed. Instead I wrote custom SlotMorphs, all "swap", each letter split into its two nearest rays with `vanish: "partner"` (the second ray grows out of the letter):

- middle N → disc (order 0: forms first)
- S → lower-left and left rays; U → upper-left and top (order 0.5 / 1)
- right N → upper-right and right; Y → lower-right and bottom
- Payoff: a warm halo grows once the disc exists, then the rays start turning slowly from rest (the sun is "on"). Shadow offset stays fixed while the rays turn.

## 3. Where the skill was unclear, wrong or missing (and where I read code)

1. **Scene contract / registration**: SKILL.md says "copy the closest `lab/mm-*`", but not that the player picks up `lab/*/scene.ts` by glob. I read `app/main.ts` to confirm a new folder is enough. Small gap.
2. **`morphWords` / `iconSlot` / `SlotMorph` signatures**: text.md names the functions but not their shapes. I read `packages/morph-engine/src/vector/text.ts` for three things: the `SlotMorph` fields, to build my own slots for the icon step; how `order` drives the stagger; and how to override one slot's options (pins for R→N only). text.md gives no way to pass per-slot pins, so I had to rebuild that slot's morph myself.
3. **Text → multi-piece icon**: the guide only offers `iconSlot` (one slot, everyone merges into it). The obvious design for "word → icon with many parts" is letters splitting into icon parts. That is possible but undocumented. I had to work out that 1 piece → 2 pieces with `vanish: "partner"` gives a split, from the vector-track `vanish` row plus the code.
4. **`circle` / `star` return a Ring, not a Shape**: vector-track.md lists them next to `fit` / `fromPath` as if they built shapes. I read `shape.ts` and found you need `shapeFromRings([circle(...)])`. `polygon` returns a Shape. The docs don't say this.
5. **`m.report` fields**: vector-track.md says `selfHits` "at 25/50/75%" and that `pairs[].mode` exists. Actually `report.mode` is undefined, and `crossings` is an array. I checked `selfHits` with a throwaway tsx probe; the skill gives no snippet for printing the report per slot.
6. **Pins for letters**: the guide covers pins for symmetric shapes only. Which anchor fixes a letter self-intersection (R→N) was trial and error: `left` and `top` failed; `bottom` and `{corner:0}` worked.
7. **Do frames/pops need a fresh build?** Not stated. I ran `npm run build` before each frames/pops run to be safe.
8. **Export size**: the "single offline file" is 5.9 MB. It seems to contain the whole app or player, not just this scene. The skill doesn't mention size.

I did not read any `*-report.md`.

## 4. Verification

- `npm run build`: OK (only the vite chunk-size warning). `npm test`: 85 pass, 0 fail.
- `npm run check:visual -- bt-storm-sunny`: **PASS** (contact sheet `.morph/bt-storm-sunny-contact.jpg`).
- `node tools/frames.mjs` at 0.5, 1.4–2.6 (every 0.1–0.2 s, the fastest swaps), 3.2, 4.1–5.6 (every 0.2 s, the splits), 5.3/5.45 enlarged, 5.8, 7.9. I looked at every frame image.
  - Fixed after looking: (a) the sky went through a dead grey at 1.8 s → routed through blue and peach stops; (b) the letter colour was a washed-out pale pink mid-swap → amber midpoint; (c) the ray shadows rotated with the spin (shadow offset was inside the rotation) → offset moved outside; (d) the rain was barely visible → higher alpha; (e) R→N self-intersected → pin.
- `node tools/pops.mjs bt-storm-sunny`: `480 steps at 60 fps, mean change 0.572 — no pops (no frame changes more than 2.5× its neighbours)`.
- Export: `gallery/bt-storm-sunny.html` (5.9 MB, offline).

## 5. Still weak

- Mid-swap shapes (T→U, M→Y, R→N at about 2.1–2.3 s) are briefly blobby or folded. They are readable thanks to the stagger and tags, but not elegant.
- In step 2 the disc grows over the inner U/N for a few frames (around 4.8 s) before they leave. The S flies a long way, and its curl into two rays reads as "S unravels" rather than a clear split.
- The middle of the sky ramp (around 1.9 s) is still a slightly dusty pink-beige.
- Orange letters on cream are lower contrast than STORM on slate.
- The HUD "SUN ☀" glyph falls back to whatever the monospace font has.
- Only the stills and the pops metric were checked; I did not watch real-time playback in a browser.
