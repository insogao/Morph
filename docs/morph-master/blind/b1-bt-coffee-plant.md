# Blind notes · bt-coffee-plant (MM90 · coffee cup → potted plant)

Files: `lab/bt-coffee-plant/morph.json`, `lab/bt-coffee-plant/scene.ts`, export `gallery/bt-coffee-plant.html`.
Timing: 1.2 s cause + 4.2 s morph + 2.6 s payoff = 8.0 s. Place `[640, 372]`, height 600, flat render.

## 1. Route and why

`tools/inspect.ts` reported both files as `kind: "svg-parts"` with no warnings: 7 and 8 filled parts, all with ids, the same 400×400 viewBox and the same flat style. So I took the **multi-part SVG route** (`references/inputs/svg-parts.md` + `references/part-mapping.md`) and built a data-only `morph.json` scene. I kept the **flat** render, with no SDF or liquid. The artwork is flat, and nothing in the story melts or pours (the coffee *settles* into soil, which reads fine as a plain morph), so per section 3b liquid would only add webbing.

## 2. Part mapping and story

Roles. Coffee: cup = core, saucer = support/base, handle = support, coffee = surface/detail, steam ×3 = emits.
Plant: pot = core, tray = base, rim = support/edge, soil = surface, stem = support, leaves ×3 = spread.

| Mapping | Window / ease | Why |
| --- | --- | --- |
| cup → pot | [0.00, 0.62] inOut | core → core: the vessel stays a vessel and turns from blue glaze to terracotta |
| coffee → soil | [0.02, 0.62] inOut | a dark-brown top surface becomes a dark-brown top surface. Same colour family and place |
| saucer → tray | [0.05, 0.66] inOut | the thing under it becomes the thing under it |
| handle → rim | [0.06, 0.68] inOut | the ceramic loop slides up and unbends into the band around the pot's mouth. This is the only leftover on the hardware side, and it gets a 1:1 fate instead of vanishing |
| steam_c → stem + leaf_c (split, stagger 0.1) | [0.12, 0.95] in | "what rises from the cup becomes what grows from the pot". The central wisp is vertical like the stem; its top half becomes the top leaf |
| steam_l → leaf_l | [0.16, 0.97] in | the side wisps unfurl into the side leaves, on the same sides |
| steam_r → leaf_r | [0.20, 1.00] in | same, staggered last |

Leftovers: 7 → 8 parts, so one split is needed. I spent it on the steam column (steam_c → stem + leaf_c), the part that is literally a vertical rising thing, rather than on the cup or the saucer. Nothing vanishes and nothing is born.

Cause: `pulse` on the three steam wisps (0.3), the steam "breathing" before it starts to grow. Payoff: `wiggle` on each leaf about its base, with phases offset. A cup cannot do this; leaves in a breeze can. The ease `"in"` on the steam mappings matters for the story: the steam lingers while the cup becomes the pot, then the plant *sprouts* faster towards the end, which reads as growth.

Suggest-map draft vs final: I kept cup→pot and saucer→tray (structure). I rejected handle→leaf_r (pose flight), coffee→stem+soil, saucer→tray+rim, steam_c+steam_r→leaf_c (merge) and steam_l→leaf_l, all flagged LOW or meaningless.

## 3. Where the skill was unclear, wrong or missing

1. **`frames.mjs`, `pops.mjs` and `check:visual` render `dist/`, not the source.** The skill lists `npm run build` and the frame tools as separate claims, and never says you must rebuild after every `morph.json` edit before rendering frames. I lost three iterations looking at stale frames (I changed eases and windows and nothing changed) before reading `tools/browser.mjs` (`buildOffline("dist/index.html")`). This is the biggest gap. The skill should say "rebuild before every frames/pops run", or the tools should rebuild or warn when the build is stale.
2. **Cause/payoff parameters are not documented.** part-mapping.md lists the types (`sway`, `pulse`, `wiggle`, …) but not their fields. I had to read `packages/morph-engine/src/vector/director.ts` (the `Cause`/`Payoff` types, lines 27–40) to learn that `wiggle` needs `parts` + `pivot` and takes `amount`/`rate`/`phase`, what units `amount` uses (radians for wiggle/sway, a fraction for pulse, px for shake), and that pivots are SVG coordinates or `"id@top"` refs.
3. **Mapping fields and easing names**: svg-parts.md shows `ease: "out"` and `"inOut"` but never lists the valid easings. I read `packages/morph-engine/src/vector/timeline.ts` to find `linear | in | out | inOut | inOutQuint | anticipate`. The default (`linear`) is also only in `remap.ts`.
4. **Scene registration**: the skill doesn't say whether a new `lab/<id>` needs registering. I grepped and found `app/main.ts`, which globs `lab/*/scene.ts`. A one-line note would have saved the search.
5. **The time axis isn't spelled out**: windows are fractions of the morph phase only (cause → M0, morph M0..M1), and the payoff starts blending in at M1 − 0.2 s. I worked this out from `director.ts` lines 102–170 so I could pick frame times for the fastest part.
6. **Perceived speed vs progress**: with `inOut`, the leaves looked complete at about 70% of the morph and then there was dead air. The skill says to "look at the fastest part" but gives no hint that area interpolation makes thin→wide shapes look done early, or that `ease: "in"` is the tool for growth. I found it by trial.
7. **`style: "pose"` on a 90° turn** (handle vertical → rim horizontal): the flight swung the handle as an arch across the front of the cup. The guide recommends pose for things that "travel or turn a lot", but for a short-distance part with a big turn, plain morph looked cleaner. A warning about this would help.
8. **Pulse cause visibility**: on small parts (steam about 650 px² area) the `pulse` cause is barely visible in still frames even at amount 0.3. There is no "rise" or "drift" cause, which is what steam actually wants.
9. Minor: the title convention `MMxx · …` plus the HUD label `look.label` is not explained. I copied the field from the bulb demo.

## 4. Verification

- `npm run build`: OK (only the usual chunk-size warning).
- `npm test`: 85 / 85 pass.
- `npm run check:visual -- bt-coffee-plant`: **PASS** (`.morph/bt-coffee-plant-contact.jpg`).
- `node tools/frames.mjs bt-coffee-plant …` at 0–1.0 (cause), 2.4/2.7/3.0 (cup→pot, handle→rim), 3.4–5.4 (steam→plant, the fastest part is about 4.6–5.4), and 6.0/7.2 (payoff wiggle). I looked at every sheet and fixed what was wrong:
  - the handle's pose flight drew an arch across the cup, so I switched it to a plain morph;
  - the leaves finished early and left dead air, so I switched the steam to ease `in` with earlier windows;
  - the cup windows were tightened so the pot finishes before the plant sprouts.
- `node tools/pops.mjs bt-coffee-plant`: `480 steps at 60 fps, mean change 0.058` / `no pops (no frame changes more than 2.5× its neighbours)`.
- Export: `npm run export -- bt-coffee-plant --html-only` → `gallery/bt-coffee-plant.html` (about 5.9 MB, offline).

## 5. Still weak

- **handle → rim** passes through a lopsided dark lump at the pot's top-right (about 2.7–3.1 s) before it spreads into the rim. It's readable, but not elegant.
- **Side leaves float free of the stem** while they grow (about 4.4–5.0 s), because they morph from wisps that hang in the air. They only attach at the end.
- **The cause is subtle**: the steam pulse is hard to notice. A real "steam rises/drifts" cause would read better.
- Steam keeps its grey for most of its window (ease `in` also delays the colour mix), so there is a stretch where the finished pot sits under grey steam. That's arguably nice ("still steaming"), but it slightly reads as two separate acts.
- No comparison against a cross-fade was rendered (the skill suggests MM05-style comparison). It was skipped for time.
