# Part mapping: how to turn any A into any B

This is a method, not a template. The flower → butterfly demo is one result of it. Do not copy its mappings: petals were wings there because of what petals and wings *do*. Your pair has its own parts, and they will map differently.

## The idea

A good morph tells the viewer **where every part of A went and where every part of B came from**. That story is written in `morph.json` as mappings, which the code enforces: each part appears exactly once. Geometry can only propose pairs. The meaning is your job.

## Step 1 · Inventory by role

Run `npx tsx tools/inspect.ts a.svg b.svg`. For every part of both drawings, write down its **role**:

| Role | Question | Examples |
| --- | --- | --- |
| **core** | Where is the mass? What is it, really? | glass, envelope, canopy, bell, body, trunk |
| **spread** | What opens, fans out or catches air or water? | petals, wings, fins, canopy edge, sails, leaves |
| **support** | What holds it up or connects it to the ground? | stem, handle, shaft, legs, base, rope, string |
| **senses / emits** | What looks, feels or radiates? | eyes, antennae, filament, rays, whiskers, lights |
| **detail** | What is a mark on a surface? | spots, stripes, buttons, scales, windows |
| **environment** | What isn't the object at all? | sun, cloud, ground, waves |

## Step 2 · Pair by role, then position, then size

Pair parts that share a role. Same role, same side and similar size is the strongest pair. Some cross-role pairs also tell good stories:

- **support → appendage**: shaft → tentacles, stem → body, handle → tail;
- **emits → environment**: rays → sun;
- **spread → spread**: petals → wings, fins → wings.

Then run the geometric draft as a second opinion:

```bash
npx tsx tools/suggest-map.ts a.svg b.svg --id my-morph > draft.json
```

Read its `review`. High-confidence lines are usually right about **structure** (core → core, a radial split). Lines marked `⚠ LOW` are where you must decide by meaning. On the test pairs the draft got about half the mappings right (see the table below). Never ship it unread.

## Step 3 · Balance the counts, and give every leftover a story

| Situation | Operator | Make it read |
| --- | --- | --- |
| One part becomes several | **split** `{ from: "x", to: ["a", "b", …] }` | Stagger 0.08–0.12, so the viewer sees one thing divide |
| Several parts become one | **merge** `{ from: ["x", "y"], to: "a" }` | Stagger, so each one visibly arrives |
| A detail appears in B | **born** `{ from: [], to: [...], bornFrom? }` | Late (window ≈ 0.65–0.98) and from a meaningful source. A reveal, not a pop |
| A part of A has no place in B | **vanish** `{ from: "x", to: [], vanishTo: "part@top" }` | Into something that "absorbs" it (the tip sinks into the bell), not into nowhere |

Two parts swapping roles (N ↔ M with both sides above 1) is refused. Split it into smaller mappings.

## Step 4 · Choose how each part moves

- **Does it travel or turn a lot?** Use `style: "pose"`, so it flies, turns and resizes first, then reshapes on landing. Give an `arc` that bends away from the centre (left-side parts and right-side parts arc opposite ways).
- **Does it stay roughly in place?** Use the default morph.
- **Similar shapes on both sides?** Pin them only if the in-between goes lopsided (see `vector-track.md`).

**When the overall outlines differ a lot** (round → tall), no pairing makes the middle readable on its own. Change *where* the morph happens instead:

- morph in a **view** where A and B look alike, then reveal the rest with a camera move (3D);
- or **condense A into one small part of B** that shares A's character, and grow the rest of B out of it.

See "Camera choreography" in [inputs/model-3d.md](inputs/model-3d.md). The second recipe works in 2D too: `bornFrom` that part.

## Step 5 · Time it as overlapping layers

```text
core       ███████████████████░░░░   [0.05, 0.80]
spread       ░███████████████░░░░░   [0.00–0.15 → 0.60–0.75], staggered
support        ░░████████████████░   [0.12 → 0.76–0.92]
details                   ░░░██████  [0.65 → 0.98]
```

- Never give every mapping `[0, 1]`: it reads as a blur.
- Never chain them end to end: it reads as a slideshow.
- About 4 s of morph, plus about 1 s of cause before it and 2.5 s of payoff after it.

## Step 6 · Cause before, payoff after

| Cause (before) | Fits |
| --- | --- |
| `sway` around the base | Planted or hanging things: plants, umbrellas, lamps |
| `wind` streaks | Light things that can be carried |
| `pulse` | Glowing, living or breathing things |
| `shake` | Mechanical or electric things, tension building |

| Payoff (after): something only B can do | Fits |
| --- | --- |
| `flap` (fold to an axis) | Wings seen from above |
| `hinge` (rotate at a joint) | Limbs and wings seen from the side; the downstroke goes below the body line |
| `wiggle` | Antennae, tentacles, tails, ropes |
| `pulse` | Bells (jellyfish), hearts, suns, lights |
| `spin` | Wheels, propellers, flowers in a breeze |
| `bob` + `lift` | Anything that floats or flies away |

## Worked results

These are four pairs from different domains. Look at how the decisions differ.

| Pair | Draft right | Draft wrong → fixed by meaning | Key move |
| --- | --- | --- | --- |
| flower → butterfly (MM04) | 4 petals → 4 wings | centre → spot ✗ → centre + stem + leaves **merge** into the body. Antennae "born" ✗ → **split** from the top petal | spread → spread, with pose flights |
| light bulb → balloon (MM07) | glass → envelope; 3 rays **merge** into the sun | filament → basket ✗ → filament **splits** into the ropes; base + contact → basket. Stripes are **born** from the envelope | emits → environment |
| umbrella → jellyfish (MM08) | canopy → bell; shaft **splits** into tentacles | tip / handle → eyes ✗ → handle uncurls into the central tentacle; tip **vanishes** into the bell top; eyes are born late | support → appendage |
| fish → bird (MM06) | body, tail, eye | fins → wings need **pose** flights; the pattern is its own channel | parallel channels (outline, pattern, background) |

## Anti-patterns

- **Copying a demo's mapping**: "petals are wings" is not a rule. It works only when A has spreading parts and B has spreading parts.
- **Mapping by position alone**: the draft does this. Its low-confidence lines are exactly where position lies.
- **Everything at once, or everything in sequence**: see Step 5.
- **Vanishing or being born "in place" with no reason**: give a source or destination that means something.
- **A payoff the source could also do**: a flower can sway, so swaying is not a butterfly payoff. Flapping is.
- **Cross-fading parts that don't match**: if nothing can become a part, it is *born*. Admit it and time it late.

## When this route is the wrong one

- **The user gave no artwork and the subject is a creature**: flat SVG animals look stiff. Prefer the organic SDF track (`skills/creative-morph`), which is built for bodies, limbs and liquid. If you do have part SVGs of a creature, consider `"render": { "track": "sdf" }` for volume and gloss. Use liquid fusion only where things really flow together (see `inputs/svg-parts.md`, section 3b).
- **A single silhouette with no meaningful parts**: use `inputs/svg-icon.md`.
- **Photos or textured bitmaps**: use `inputs/bitmap.md` or `inputs/photo.md`, not part remapping.

## Self-check before you show it

1. For every mapping, can you say in one sentence why X becomes Y?
2. Freeze the 50% frame (`node tools/frames.mjs <id> <t>`): can a viewer point at a part and say what it was and what it is becoming?
3. Is the cause visible before anything morphs? Is the payoff something only B can do?
4. Run `npm test` and `npm run check:visual -- <id>`.
