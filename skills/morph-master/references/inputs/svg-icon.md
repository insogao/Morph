# Input: icon / silhouette SVG (one flat shape)

Single-colour marks, logos, glyph-like icons, silhouettes. This is the vector track's home ground: see [../vector-track.md](../vector-track.md).

Demos: `lab/mm-icon-loop` (MM02, finished loop) and `lab/mm-vs-linear` (MM01, method comparison with the correspondence map).

## What you can make

| Effect | Status | Notes |
| --- | --- | --- |
| Precise shape → shape, with pins | ✅ | Corners stay sharp. Pin 12 o'clock and 6 o'clock when both shapes are symmetric. |
| Sequence and loop (A → B → C → A) | ✅ | `sequence(steps, true)`; each step has its own duration, easing, bounce and pins |
| Bounce, echo / extrusion, tilt and squash, OKLab colour | ✅ | Scene layers; see MM02 |
| Holes opening and closing | ✅ | Unmatched holes shrink to their own centre |
| Many pieces ↔ one | ✅ | `vanish: "self"` (in place) or `"partner"` (fly in or out) |
| Turned letter-like shapes | ✅ | `rotate: "auto"` |
| Melt into liquid, then become a creature | 🔧 | Needs the vector → SDF hand-off (planned) |
| Shatter, particles, growth fill | ✅ other tracks | Feed the outline to `fracture`, `particles` or `growth` |

## Steps

1. `npx tsx tools/inspect.ts icon.svg`: expect `svg-icon`. If it says `svg-parts` and the parts have meaning, use [svg-parts.md](svg-parts.md).
2. Build the shape with `const doc = placeSvg(parseSvg(text), [640, 360], 300)`, then `{ pieces: doc.parts.flatMap(p => p.shape.pieces) }`. A path string also works: `fit(fromPath(d), at, h)`.
3. Morph with `morphShapes` or `sequence`. Look at `drawMatch` and `report.selfHits` (must be 0).

## Telling the user

- The quality comes from the correspondence. Pins fix the rare bad match, so offer one or two at named spots ("tip to tip").
- Very different shapes (a thin line to a fat disc) morph correctly but look like a squeeze. Suggest an intermediate shape (A → circle → B) or a different mechanism.
