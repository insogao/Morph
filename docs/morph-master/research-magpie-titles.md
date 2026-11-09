# Research: the *Magpie Murders* trilogy title sequences (HUGE Designs)

**Sources** (user-provided):
- the trilogy title compilation, about 135 s, at `~/Downloads/The Ultimate _Murders_ Trilogy 喜鹊谋杀案三部曲片头.mp4`;
- the designer's interview in Salon (Nov 2022, Ben Hanbury).

Contact sheets and dense strips are in `source/magpie/`, for analysis only. They are not shipped.

## Measured

- **No hard cuts.** ffmpeg scene detection at threshold 0.3 finds zero cuts in 135 s. Everything is carried by shape, camera and wipes.
- **Motion energy comes in pulses.** Mean frame difference, in 0.5 s bins, alternates bursts of fast movement with short calmer stretches. It is rhythm, not constant speed.

## Transition devices seen (paraphrased)

| Device | Example |
| --- | --- |
| Scale misdirection, then reveal | Round shapes in macro, pulled out and inverted: typewriter keys. |
| Shape rhyme while moving | A fountain-pen nib, the camera rotating around it continuously, becomes a sword. The sword's two white blade lines carry on as the double lines of a road in one-point perspective. |
| Frame-filling wipe as the hide moment | A black ink splat fills the frame. Behind it, the next object is already there. |
| Edge-on hide | A sheet turns edge-on (a thin line) and keeps spinning into a closed book, which opens. |
| Motion blur on whips | The typewriter keys whip up to the page with visible streak blur. |
| Objects crossing between two worlds | A building split by a line down the middle sits in both palettes, red/black and inverted. |
| Music sync | Keys strike on the notes of the theme. |
| Text scramble | Credit letters jumble and resolve, a nod to anagrams. |

## From the interview (paraphrased)

- The flat 2–3 colour palette was chosen to free up **scale**: the camera can go from extremely close to extremely wide, and that keeps the energy up.
- The sequence is built like a book cover: hints, never spoilers.
- Each world has its own palette, and objects travel between them, mirroring the show's two intertwined stories.
- The pen dives into a small detail and becomes a sword while the camera swings around.

## What Morph Master took from it

- [skills/morph-master/references/camera-motion.md](../../skills/morph-master/references/camera-motion.md): coupled, overlapping camera curves, anticipation, brake and release, hide moments, real blur, scale, and an optional FPV dive.
- [skills/morph-master/references/shape-rhyme.md](../../skills/morph-master/references/shape-rhyme.md): the rhyme itself.
- **Not yet taken:**
  - edge-on 3D card turns as a hide moment;
  - ink-splat wipes;
  - two-palette worlds;
  - beat sync;
  - text scramble.

  These are candidates for later demos.

## What I got wrong the first time (user's correction)

1. **The rhymes work because the designer controls both ends.** The shapes match, and so do the colours. Shape alone was not enough: our differently coloured pictures dissolved as two things.
2. **A camera move is a viewpoint change in 3D**: yaw, pitch, roll, distance and lens, with parallax. My 2D zoom-and-rotate of a flat picture felt like the picture sliding, not like flying.

**Fixes.**
- `renderers/card-space.ts` (flat cards in real 3D plus a drone camera) and the MM98 demo.
- Colour in the rhyme score (`colorScore`).
- `tone()` to restyle pictures into a shared palette.
- The rules in `camera-motion.md` and `shape-rhyme.md`.
