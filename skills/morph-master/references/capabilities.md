# What this skill is good at — and what it isn't

Know this before you promise anything. Every rating here comes from a demo that was reviewed, by the user or in a blind test, and the rating says which. Steer users towards the strong side; when a request falls on the weak side, say so up front and offer the strong alternative. **Don't spend effort polishing a weak direction**: finding the route that works beats fixing the one that doesn't.

## Strong: offer these with confidence

| What | Why it works | Evidence |
| --- | --- | --- |
| **Text and letters**: word → word, letter by letter; text → icon | Glyphs are clean vector shapes with clear correspondences | MM03 (accepted); MM91 (blind test 1, good) |
| **Icons, logos, regular shapes, man-made objects** (cups, bulbs, umbrellas, tools, buildings) | Geometric parts map by meaning and the in-betweens stay readable | MM02, MM07 (accepted); MM90 coffee → plant and MM80 bee → sunflower (blind tests, pass) |
| **Shape rhymes you design yourself** (same shape, same colour, same place), carried by a camera | You control both ends, so the hand-off is seamless | MM98 2.5D drone shot (user: "the 2.5D drone is quite good") |
| **Flat graphic scenes in 2.5D card space** (title-sequence style, 2–3 colours, silhouettes) | Flat art plus real parallax gives a strong sense of space cheaply | MM98 |
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
| **2D zoom and roll called "camera movement"** | It reads as the picture moving, not the viewer | Card space (MM98) |

## Untested: don't claim these

- Real photographs, rather than paintings flattened onto a background.
- Real-world glTF: textures, skins, many primitives per node.
- Browsers other than Chromium.
- Long pieces (over about 15 s) and music sync.

## How to use this

- **Before building**, place the request in one of the three tables, then tell the user what you'll make and how good to expect it to be. See SKILL.md §0.
- **After building**, if the result falls short on the weak side, report it honestly and suggest the strong alternative rather than iterating indefinitely.
- **Keep this page current.** When a new demo is reviewed, add it as evidence or move a row; `mm status` lists the recorded verdicts.
