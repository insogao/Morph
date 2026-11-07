# Input: multi-part SVG (named parts)

Use this for illustrations whose pieces have meaning: petals, wings, fins, eyes. The morph is told as a story of parts. Every source part must go somewhere, and every target part must come from somewhere.

Demos:

- `lab/mm-flower-butterfly` (MM04): part remap, split, merge, born, pose-first flights;
- `lab/mm-flower-butterfly-compare` (MM05): the same morph done as a cross-fade, as automatic pairing, and with semantic mapping;
- `lab/mm-fish-bird` (MM06): parallel channels (outline, pattern, background);
- `lab/mm-bulb-balloon` (MM07) and `lab/mm-umbrella-jellyfish` (MM08): generalisation tests built only from the suggestion tool plus a semantic rewrite.

## 1. Diagnose

```bash
npx tsx tools/inspect.ts flower.svg butterfly.svg
```

- `kind: "svg-parts"` means you are on this route.
- Each part is everything under the nearest `id`, whether that id is on the element itself or on a `<g>`.
- **Warnings to tell the user about:**
  - shapes without ids (semantic mapping needs ids);
  - open paths and stroke-only lines (use the line-art route);
  - gradients (they become a flat colour);
  - `<text>` (convert it to outlines or use the text route);
  - embedded images;
  - **clipped or masked groups.** Clipping is not applied, so content outside the clip shows. Flatten clips in the design tool; or, if you can't, replace the clipped shapes with paths already cut to the clip, which you can hand-edit in the SVG;
  - translucent parts (morphed opaque);
  - unrecognised colours (drawn black);
  - broken `<use>` references.
- **What the importer handles** (Illustrator, Figma and Inkscape exports):
  - `<style>` sheets with `.class`, `#id` and tag rules (cascade: attribute < rule < inline style);
  - `<use>` / `<symbol>` with offsets and transforms;
  - named, `#rgb`, `rgb()`, `hsl()` and `currentColor` colours;
  - hidden layers (`display:none`) are skipped.

Both drawings should share the same canvas and style. Place them with the same `placeSvg(doc, at, height)`.

## 2. Write the mappings (the creative step)

Follow [../part-mapping.md](../part-mapping.md): roles first, the draft from `tools/suggest-map.ts` second, meaning last. Write the result as `lab/<id>/morph.json` (mappings + cause + payoff) and a three-line `scene.ts` that calls `remapScene(validateSpec(spec), source, target)`. Copy `lab/mm-bulb-balloon`. No scene code is needed. The same mappings in code look like this:

```ts
const plan = remapParts(flower, butterfly, [
  { from: "petal_2", to: "wing_ur", style: "pose", arc: -70, window: [0.00, 0.60] },   // fly, turn, land, reshape
  { from: "petal_1", to: ["antenna_l", "antenna_r"], window: [0.42, 0.88], stagger: 0.12 }, // split 1 → N
  { from: ["center", "stem", "leaf_l", "leaf_r"], to: "body", stagger: 0.1 },        // merge N → 1
  { from: [], to: ["spot_ul", "spot_ur"], window: [0.7, 0.98], ease: "out" },        // born
  { from: "leaf_x", to: [], vanishTo: "body" },                                       // vanish into a part
]);
const parts = plan.at(t); // [{ id, frame, fill, z, kind, progress }], sorted by paint order
```

| Choice | When |
| --- | --- |
| `style: "pose"` | The part should visibly **travel**: fly, turn and resize into the target's pose, then reshape as it lands. Use `arc` to bend the flight. Best for petal → wing, fin → wing, leaf → ear. |
| default `morph` | The part stays roughly in place and changes shape (body → body, eye → eye). |
| split `1 → N` | One part becomes several (top petal → two antennae). The clones start identical, then each moves independently. |
| merge `N → 1` | Several parts converge into one (centre + stem + leaves → body). Stagger them, so the viewer sees each one arrive. |
| born / vanish | A part with no counterpart. Give it a source or a destination (`bornFrom`, `vanishTo`: a point or a part id). Late-born details such as spots or a beak read as a "reveal". |
| `window` + `ease` | Each mapping runs on its own clock inside the transition. Overlap the windows, don't chain them. |

**Rules the code enforces:**

- every part appears exactly once (an unmapped or doubly mapped part throws);
- an N → M mapping with both sides above 1 is refused, so break it down.

These errors are the point. They force a fate for every part.

**Story devices that worked:**

- **a visible cause before the change**: wind streaks and a sway;
- **a payoff only the target can make**: a flap and lift-off, a beak opening;
- **holding the target still for half a second** before the payoff.

### morph.json at a glance (fields the validator accepts)

**Clock.** `timing: { cause: 1.0, morph: 4.0, payoff: 2.6 }` (seconds, these are the defaults). The scene runs cause → morph → payoff. A mapping's `window: [a, b]` is a fraction **of the morph phase only** (0 = morph start, 1 = morph end). Payoffs ease in from 0.2 s before the morph ends, so they overlap its last moment.

**Eases:** `linear`, `in`, `out`, `inOut` (default), `inOutQuint`, `anticipate`. Thin-to-wide shapes (a wisp becoming a leaf) look finished early under `inOut`; give them `in` or a later window.

**Styles:** `morph` (default) or `pose`. `pose` flies the part along an arc and is for **long trips**. On a short hop with a big turn (handle → rim on the same cup) it swings the part across the front, so use `morph` there.

**Refs** (pivots, axes, `bornFrom`, `vanishTo`): an `[x, y]` in the SVG's own coordinates, a part id (its centre), or `id@anchor` with `top | bottom | left | right`. Example: `"stem@bottom"`.

| Cause (before the change) | Fields |
| --- | --- |
| `sway` | `pivot: Ref`, `amount` (radians, out and back) |
| `wind` | `direction: "left" \| "right"`, `streaks` |
| `pulse` | `parts?: id[]`, `amount` (scale, breathing in place; weak on small parts) |
| `shake` | `amount` (px, a tremble that builds) |

| Payoff (after the change) | Fields |
| --- | --- |
| `flap` | `parts`, `axis: Ref`, `amount`, `rate`, `lag?: id[]` (top-view wings) |
| `hinge` / `wiggle` | `parts`, `pivot: Ref`, `amount` (rad), `rate` (Hz), `phase` (offset parts for a natural sway) |
| `spin` | `parts`, `pivot`, `turns` |
| `bob` | `amount`, `rate` (whole drawing) |
| `lift` | `to: [dx, dy]` (design px at the end) |
| `pulse` | `parts?`, `amount`, `rate` |

There is no "rise" or "drift" cause yet (steam, smoke). Use `pulse` on the wisps with a larger `amount`, or say that it's missing.

**One part made of many pieces** (a `petals` group with 12 petal paths): a 1 → 1 mapping from a solid part splits automatically into every piece (frames `petals#0 … #11`, staggered by `stagger` or 0.4 ÷ pieces), and the reverse merges. Payoffs and causes that name `petals` apply to every piece. You don't need to give each piece its own id unless the pieces have different stories.

**Paint order travels with the part.** Each part's stacking position slides from its place in A's file to its place in B's while it moves. A part that is low in A and high in B can pass over its neighbours mid-way (a petal over the flower's centre for 0.3 s in blind test B4). Fix it by reordering the elements in the SVG, or by timing the windows so the part has landed before it would cross.

**`look`** (optional): `background`, `ink` and `accent` (colours), `ground` (shadow line, boolean), `legend` (the mapping legend, boolean; turn it off when it crosses the art) and `label` (HUD text).

**Split pieces that should stay attached** (side leaves on a stem): give them later windows than the part they hang on, and `bornFrom: "stem@…"`-style origins. Otherwise they grow in mid-air and only attach at the end.

**When the two drawings differ too much for a remap**, a shape rhyme may carry them: zoom into one part (the coffee surface), hand it over to its rhyme (the soil), and pull out. See [../shape-rhyme.md](../shape-rhyme.md) and MM96.

## 3. Parallel channels (MM06)

When appearance changes independently of shape (scales → feathers, water → clouds), use separate plans or morphs, each with its own clock: `channel(time, [start, end], ease)`.

- **Pattern / texture parts**: run them as their own channel and **clip them to the current silhouette** (`ctx.clip(framePath(body + wing))`), so they read as surface texture rather than floating stickers.
- **Background**: any shape can morph (wave bands → clouds via `poseMorph`). Mix the background colour with `mixColor`.
- **Show the user that the channels are independent**: draw progress bars, or pause one channel while the others continue.

## 3b. Make it liquid or glossy (optional)

Add a `render` block to `morph.json` to draw the mappings through the SDF part field: `"render": { "track": "sdf", "thickness": [7, 18, 12], "wobble": [0, 8, 0.6], "blend": [0, 26, 5], "gloss": [0.35, 0.9, 0.55], "fuse": [["wax", "drip_l", "pot", …]] }`. Each value is [before, mid-morph, after]. `style` is `"flat"` (default: 2D goo, solid colours, matches flat artwork) or `"glossy"` (bevelled, lit, translucent). MM11 shows both on the same mappings. Glossy 3D on flat illustrations tends to look uncanny, so keep flat unless the artwork already has volume. Small marks inside another part of the same drawing (eyes, spots) are decals for the whole morph. Example: MM10 (candle → tulip).

**Liquid bridges only inside `fuse` groups.** Each group is one SDF layer, so bridges cannot reach other parts. Merge sources always fuse; split clones never do. Put things in a group only if they physically flow together (wax, drips and the pool they make). Otherwise the bridges look like strange webbing: an umbrella shaft splitting into tentacles grew webs between them, and that test was dropped.

**Liquid suits stories where something actually melts, pours, pools or condenses** (wax, ink, honey, metal, water). Separating, hard-edged parts (ribs, tentacles splitting off a shaft) look wrong when they fuse.

## 4. Check

- Run `node tools/frames.mjs <id> …` across the middle of the transition. At 50%, can you tell which part is becoming which? If not, adjust the windows so that fewer things move at once, and add an arc.
- Compare against a cross-fade and automatic pairing (MM05). When the parts mean something, the semantic version should be clearly better. Automatic pairing is often fine geometrically, but colours and identity get lost.

## Telling the user

- Their SVG needs **ids on meaningful parts**. Offer to suggest ids from `inspect` output, ordered by position (top, left, …).
- Strokes, gradients, filters and masks are not morphed. They become flat fills or are dropped.
- Two drawings in different styles (outline vs filled, different line weights) morph, but they look like two drawings. Recommend matching styles.
