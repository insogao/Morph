# Blind run notes: planet → rocket (`bt-planet-rocket`, "MM92 · 3D point cloud: planet → rocket")

Files: `lab/bt-planet-rocket/scene.ts` (the whole scene), `gallery/bt-planet-rocket.html` (offline export, about 6 MB).

## 1. Route and why

- **Material:** 3D glTF with named parts → `references/inputs/model-3d.md` + `part-mapping.md`.
- **Effect:** **point-cloud swirl** (the MM16 mechanism, `Morph3D` with the default `style: "swirl"`), using my own per-mapping `window`s, `spread`s and fields. I didn't use exploded reassembly. A planet isn't a machine that comes apart into components. "Its matter is flung off and builds a rocket" reads more naturally as dust re-accreting, and the swirl keeps the colour hand-off local.
- Fields: `release` is bottom-up plus a 15 % twist around the axis (atan2), with 30 % noise, so the planet unwinds as it spins. `land` is bottom-up with 30 % noise, so the rocket is built from the fins upward.
- Timeline, 8.6 s at 1280 × 720:
  - **cause** 0.2–1.5 s: the planet spins up (1.5 extra turns, with peak speed right as it starts to come apart), and the moon whips around its orbit.
  - **morph** 1.5–5.9 s.
  - **payoff** 5.9–8.6 s: the rocket rumbles, the flame flickers (the real flame mesh is scaled about its base), there is a nozzle glow, and it lifts off while the stars streak downward. The camera follows partway. The planet's tilt (rotation.z) straightens into the upright rocket.

## 2. Part mapping (3 → 7)

| Mapping | Window | Why |
| --- | --- | --- |
| `ring → [fin_a, fin_b, fin_c]` (split) | 0.00–0.58 | spread → spread. The flat band around the core is the part that "sticks out". It breaks into three arcs that fall to the base and become the fins. It goes first because fins are the foundation and the base is built first. |
| `globe → [body, nose]` (split) | 0.08–0.84 | core → core. The planet's mass pours upward into the hull, and its top caps off as the nose. Morton pairing sends the top of the globe to the nose. |
| `moon → window` | 0.42–0.88, spread 0.2, swirl 0.25 | Small round satellite → small round porthole. With a low spread it flies in as **one cloud**, which is the 3D stand-in for a pose flight. It arrives last among the mapped parts, so you can follow it. |
| `[] → flame` (born, `bornFrom: "flame"`) | 0.80–1.00 | **Born part: ignition.** Nothing on a planet is a rocket exhaust. So the flame is admitted as born, late, and as a burst at the nozzle, only once the hull has closed. It then turns straight into the payoff (flicker, glow, lift-off). |

The flame is the only born part. All six other rocket parts come from a planet part.

## 3. Where the skill was unclear, wrong or missing

1. **`tools/inspect.ts` misdiagnoses GLB as a photo.** For both `.glb` files it printed `kind: "photo"`, guide `photo.md`, width/height 0, and the warning "No transparency: treated as a photo… Biological morphs are not offered". SKILL.md says "Diagnose the material first… Do not use another material's menu", so following the tool literally would have sent me down the wrong route. I overrode it from the table row for "3D model".
2. **There's no way to list GLB part names, sizes or positions.** `model-3d.md` step 1 says "List the part names and decide their roles", but no tool does that. I found the names in `fixtures/s3/README.md` and read `tools/make-glb.ts` for geometry: sizes, positions, ring tilt, moon position, flame base y = -0.9 and tip -1.5. I needed the flame numbers for the flicker pivot and the nozzle glow.
3. **The `Mapping3D` fields aren't documented in the skill.** `model-3d.md` mentions `window`, `bornFrom`, `vanishTo`, `explode` and `style`, but not `spread` or per-mapping `swirl`, and it doesn't say what each one does. I read `packages/morph-engine/src/renderers/morph3d.ts` (the interface plus the constructor) to learn:
   - `window` is in morph-u space;
   - `spread` is the fraction of the window used for departures;
   - `bornFrom` may name an A or a B part;
   - how split pairing works (Morton order in `vector/cloud.ts` `pairPools`).
4. **The 3D route has no `morph.json` path.** SKILL.md §3 says "Part morphs are data… write `morph.json` and a three-line scene.ts". That is 2D only. For 3D you have to copy and adapt `lab/mm-3d-points/rig.ts`, and that rig hard-codes the rocket/lighthouse `MODELS`, so it can't be reused with other models. I wrote a full scene.
5. **The frame tools render `dist/`, not the source.** `frames.mjs`, `pops.mjs` and `check:visual` go through `tools/browser.mjs`, which builds from `dist/index.html`. After editing the scene I rendered stale frames until I found this in `tools/browser.mjs`. The skill lists `npm run build` as its own verify step, but never says you must **rebuild before every frames/pops run**. This cost about three wasted iterations: I thought a lighting/rotation fix "didn't work".
6. **No way to animate individual parts in the cause or payoff.** The skill's cause/payoff vocabulary (`sway`, `spin`, `bob + lift`, …) is a 2D `morph.json` feature. In 3D, `Morph3D` exposes only `group`. To flicker the flame I fetched the flame mesh by index: `group.children.filter(Mesh)[9]`, worked out from the constructor's add order (per mapping, B meshes then A meshes). That is fragile and undocumented. I also couldn't make the moon orbit on its own, so the cause spins the whole planet.
7. **Lighting gotcha (not in the skill).** The thin, flattened ring renders almost black when you see it from below or from its rim. I had to add a fill light and pick the starting rotation so the ring's lit top faces the camera.
8. Minor: the skill says to stagger split targets by 0.08–0.12. A 3D mapping has only one window, so per-fin stagger can only come from the `land` field. That isn't said.

## 4. Verification

- `npm run build`: OK, only the usual chunk-size warning.
- `npm test`: 85 pass, 0 fail.
- `npm run check:visual -- bt-planet-rocket`: **PASS** (`.morph/bt-planet-rocket-contact.jpg`).
- `node tools/frames.mjs`: I looked at 0, 0.5, 1.0, 1.5, 2.0, 2.5, 2.7, 3.0, 3.5, 4.0, 4.25, 4.5, 5.0, 5.6, 6.0, 7.0, 7.4, 8.0 and 8.6 s, including the fastest stretch (2.4–4.6 s, where ring, globe and moon are all in flight). What I fixed after looking:
  - the dark ring (fill light plus starting orientation);
  - the end orientation, so the rocket finishes face-on with the window visible;
  - star streaks that read as rain (shortened);
  - the nozzle glow colour.
- `node tools/pops.mjs bt-planet-rocket`: `516 steps at 60 fps, mean change 0.390` / `no pops (no frame changes more than 2.5× its neighbours)`.
- Export: `npm run export -- bt-planet-rocket --html-only` → `gallery/bt-planet-rocket.html`.
- Not done: frame time in a real GPU browser (`model-3d.md` step 5 mentions it). Only headless SwiftShader was used.

## 5. What still looks weak

- **About 3.0–3.5 s, the mid-morph reads as a fuzzy blob.** The globe becomes a uniform pale-blue cloud, then a boxy white cloud, before the hull resolves. At 50 % you can point at the fins (red), the moon (white puff) and the nose (pink top), but the globe → body story is only "blue dust becomes white dust".
- The ring → three fins split is legible as "the cream ring breaks into clumps and drops", but you can't see the three arcs as three separate pieces. There's no per-fin stagger.
- The cause is a whole-planet spin, not a moon orbit. The moon only "orbits" because the group rotates.
- The flame flicker and the nozzle glow are a 2D radial gradient over the 3D render. There's no exhaust particle trail.
- The flame mesh is found by child index, so it would break if the mapping order changed.
- Small dark speckles show inside some clouds mid-flight (back faces or gaps), and a yellow ember line runs along the body's landing front. Both are minor.
