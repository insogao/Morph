# What this skill is good at — and what it isn't

Know this before you promise anything. Every rating here comes from a demo that was reviewed, by the user or in a blind test, and the rating says which. Steer users towards the strong side; when a request falls on the weak side, say so up front and offer the strong alternative. **Don't spend effort polishing a weak direction**: finding the route that works beats fixing the one that doesn't.

## Strong: offer these with confidence

| What | Why it works | Evidence |
| --- | --- | --- |
| **Scroll-driven product pages** (scrollytelling: the reader's scroll scrubs the morph) | Scenes are pure functions of time, so scroll IS time; weight-breathing type and icon chains are the strongest material | MM70 `pages/tempo`: landscape and portrait layouts, 60 fps in a real browser, 72 KB offline |
| **Motion-logo systems cut to music** (a mark that becomes its product's icons and back, on the beat, looping) | Icons are our strongest shapes; a measured beat grid makes every landing hit; the loop is the music's own loop | MM71 `pages/hum`: 112.9 BPM, 16-beat seamless loop, 16:9 / 1:1 / 9:16 MP4s with the track. One track so far (see untested) |
| **Hanzi → the thing it names, and back** (竹 → bamboo → 竹林; 三人 → 夾 → 俠) | Start from the real glyph, draw the object to rhyme with it, field-morph until identical, then grow or move the camera; for a character at the end, pose and thicken to the glyph first | MM72 `lab/mm-bamboo-forest` (v2 after the user's direction: the real glyph first), MM73 `lab/mm-xia` (v4: someone steps in front and spreads his arms; size = depth; the 亻 of 他 joins 夾); MM75 `lab/mm-genesis` (光's strokes become rays; darkness folds into 一); MM76 `lab/mm-dao` (一 → 二 → 三 → trigrams → 64 hexagrams → taiji); MM77 `lab/mm-dao-long` (five chapters, ~98 s, ~24 text-motivated effects, 60 fps); all deterministic, no unintended pops |
| **Lyric videos with radical reuse** (lines on the beat; same characters and shared components fly to the next line; route camera) | A general rule: automatic piece matching, no hand animation; works for any CJK text | MM74 `lab/mm-lyric-flight` + `pages/lyric` (original lines, the user's track; no flags, no pops). Copyrighted lyrics: never in the repo |
| **Text and letters**: word → word, letter by letter; text → icon | Glyphs are clean vector shapes with clear correspondences | MM03 (accepted); MM91 (blind test 1, good) |
| **Icons, logos, regular shapes, man-made objects** (cups, bulbs, umbrellas, tools, buildings) | Geometric parts map by meaning and the in-betweens stay readable | MM02, MM07 (accepted); MM90 coffee → plant and MM80 bee → sunflower (blind tests, pass) |
| **Shape rhymes you design yourself** (same shape, same colour, same place), carried by a camera | You control both ends, so the hand-off is seamless | MM98 2.5D drone shot (user: "the 2.5D drone is quite good") |
| **Flat graphic scenes in 2.5D card space** (title-sequence style, 2–3 colours, silhouettes) | Flat art plus real parallax gives a strong sense of space cheaply | MM98 |
| **Game-style MVs with glyph characters** (letters as players: run, jump, bonk, squash and stretch on the beat; levels built from words and shapes; a 2D → 2.5D reveal) | Glyphs are clean bodies; a key-track motion system (jumps land on beats) gives weight; extruded flat type in a tiny perspective renderer (`lab/mm-and/proj.ts`) makes the side view and the 3D view one world, so a camera swing is the reveal | MM78 `lab/mm-and` (~53 s, four levels, split screen, 60 fps in a real browser, no pops); MM79 `lab/mm-bao` (Chinese: radicals as power-ups that rewrite the player glyph — 包 → 泡/炮/饱/抱 — world words that change state on the beat — 闩→门, 上→下, 冰→水, 一二三, 日→旦 — and a glyph 口 that a camera swing reveals as a 3D pipe the players are seen through only as bulges; the projector takes any plane, `lab/mm-bao/proj.ts`) |
| **Painted or bitmap subjects WITH part layers**, A and B of similar build (koi → koi, bird → fish with matching parts) | The painting itself travels (mesh warp per part), so detail never has to be invented | MM81 swallow → koi (blind test 2, best of the round); MM15 |
| **3D models with named parts and similar silhouettes**, or different ones carried by camera choreography | glTF parts map by meaning; the camera hides the silhouette gap | MM16 (accepted); MM94 sphere → pancake → column (accepted after the user's direction) |
| **Photos changing as pictures** (tile flip, ink reveal, shatter) | No subject warp is promised | MM14 (accepted) |
| **One continuous shot across several stages**, with a carrier at every hand-off | The workflow (`stages.md`) holds up even for a three-stage brief | MM82 (blind test 2, pass on continuity) |

## Weak: say so before you start, and offer the strong route instead

| What | What goes wrong | Instead |
| --- | --- | --- |
| **Animals and creatures drawn from scratch as SVG** (birds, fish, mammals) | Hand-drawn vector anatomy looks stiff; wings, fins and gait read wrong. The user found MM06 fish → bird poor ("SVG animals looking bad is a common problem"); the B6 bird ends as a speck. | **Ask for reference images or layered artwork** and use the bitmap route (MM81 quality). Or use a 3D model, or keep the creature small, stylised or silhouetted. Draw SVG animals only if the user explicitly doesn't want to provide references, and say the result will be simple. |
| **Point clouds between very different silhouettes** with no camera help | The middle is an unreadable "dust" mass (blind test 1 B3: "blue dust becomes white dust") | Camera choreography: a matching view or a shape chain (MM93, MM94) |
| **Match cuts on given artwork whose colours differ** | Two things dissolve over each other (MM97 v1: "very poor") | Restyle both into one palette (`tone()`), or don't cut |
| **Mesh warp into a deeply concave target** | The interior folds (31–60 % of triangles) | Field morph of the silhouette plus a texture cross-fade, or split into parts |
| **Photo subject → subject** (this cat into that dog) | No outline, no parts | Picture transitions; or ask for cut-outs or layers |
| **Thousands of individually drawn elements** (a canopy of 7000 leaves) | Below 60 fps in a real browser (51 ms a frame in B6) | Masses plus a few hundred details; check `mm` frame timing in a real browser |
| **Glyph morphs between DIFFERENT words** (hum. → play.) | Letters turn to mush for a beat (MM71 v1, MM70 captions) | Roll the letters (old word rolls out of a slot, new one rolls in, staggered); keep true morphs for weight changes of the same word |
| **2D zoom and roll called "camera movement"** | It reads as the picture moving, not the viewer | Card space (MM98) |

## Untested: don't claim these

- Real photographs, rather than paintings flattened onto a background.
- Real-world glTF: textures, skins, many primitives per node.
- Browsers other than Chromium.
- Long pieces: one tested so far (MM77, ~98 s, five sections, 60 fps). Split a long piece into one file per section with a shared helper module, prewarm every one-off build on the dark first frames, and measure real playback with requestAnimationFrame (a tight seek loop reports GPU flushes as false spikes).
- Music with tempo changes, swing or rubato (MM71's track is a steady grid); hitting lyrics or voice.

## How to use this

- **Before building**, place the request in one of the three tables, then tell the user what you'll make and how good to expect it to be. See SKILL.md §0.
- **After building**, if the result falls short on the weak side, report it honestly and suggest the strong alternative rather than iterating indefinitely.
- **Keep this page current.** When a new demo is reviewed, add it as evidence or move a row; `mm status` lists the recorded verdicts.
