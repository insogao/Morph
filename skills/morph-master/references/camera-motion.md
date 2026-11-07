# Camera and motion: coupled, with momentum (every route)

This applies to every morph that moves a camera (match cuts, 3D, any push or pull) and to the timing of any multi-step change. It came from the user's critique of the first M6 demos: "there's basically no camera move, and the change isn't smooth. You can see an obvious A → B → C. Real camera moves are coupled: if A → B takes 2 s, B → C already starts at 1.5 s, with speed curves that build up and hit."

## First: a camera move is a change of VIEWPOINT

Zooming, panning and rotating a flat picture in the frame is not a camera move. It reads as the picture moving. The user rejected MM95–97 v2 for exactly this: "these are just objects moving slightly inside the frame".

A camera move makes the viewer feel **their own** angle changing. That takes real 3D: a drone with three rotation axes (yaw, pitch, roll), distance (dolly) and lens (fov), with layers at different depths sliding past each other (parallax) and perspective changing (a page goes from flat-on to a raking view).

For flat art, use **card space** (`renderers/card-space.ts`, MM98):
- every shape is a flat card placed in 3D;
- the drone path is position, look-at target, roll and fov keys on C¹ curves;
- sets are swapped at hide moments;
- the colours are exactly as authored (no tone mapping);
- motion blur is real.

The 2D camera in `match-cut.ts` is only right for a quick, small match within one flat picture.

### Card-space recipe (MM98)

- **Lay each "view" out as a plane facing the camera.** A desk seen from above is simply a card plane the drone looks straight at. Then the next set's rhyme shape can sit in exactly the same place: the moon where the watch face was, the page where the window was.
- **Swap sets when the camera is right against the rhyme shape**, so that one colour fills the frame. Stop "just" covered: a fill of 0.3 s is right, 0.8 s reads as dead air.
- **Build depth into the set**: rows of silhouettes at different z, each a step lighter towards the sky (atmospheric tints). The drone rises over them or skims them, which is the FPV feel.
- **Key the drone like a pilot**:
  - gather back, then dive with the roll spinning;
  - burst out while unrolling;
  - bank into turns;
  - end on a raking orbit, so the last set shows its perspective.

  Give velocities (`d`) at the key moments: zero where the frame is filled, fast just before and after.
- **Never fly a card plane through the lens.** A card that passes the camera's z while it is in view pops to full frame. Route the drone above or beside layers.

### Speed: decisive, not hesitant (user feedback on MM98 v1)

"The camera move is too hesitant; there is no sense of speed." The fix is measurable. Run `npx tsx tools/camera-profile.ts lab/<id>/scene.ts` (the scene exports `PATH`) before rendering, and fix every flag:

- **Gathers are short** (≤ 0.5 s). **Brakes are short and hard** (≤ 0.3 s from top speed to the hide). The long stretches between are **fast**. MM98 went from peaks of 6 u/s to about 20.
- **Never turn by stopping.** Reversing direction along one axis passes through zero speed. Take the U-turn as a wide sideways sweep: the forward speed dies while the sideways speed carries the move (MM98 at 4.1 s, where the minimum went from 1.7 to 7.5 u/s).
- **The FPV stretch is the fastest part**, perceived as speed ÷ distance to what it passes. Skim close to layers.
- **Widen the lens when fast and lengthen it when slow** (fov 37–60°). Together with real blur, this is what speed *feels* like.
- **End holds are short** (about 1.3 s). Music and captions will carry the end; a long static tail reads as hesitation.

## Every transition needs its in-between (user feedback on MM97)

"The shapes aren't completely identical yet, so don't cut straight to the picture: change the shape first, then swap. The core point is that every transition must think through its in-between details."

- **Similar is not identical. Only swap when identical.** For pictures, trace both silhouettes around the rhyme (`traceAlpha`, a disc larger than the frame for the whole hand-off). **Morph the outlines first**, and switch the picture underneath only once they match, which is then invisible. `matchCutArtScene({ silhouette: { ink, alphaA, alphaB } })`.
- **Use a field morph, not outline matching, for aligned silhouettes** (`fieldMorph`, signed-distance blend). Outline correspondence twisted a J-hook into a pinched balloon. The field keeps shared area in place, thins what only A has along its medial axis, and grows what only B has from a line.
- **Spread the change out from the rhyme** (`ripple`). Neighbouring parts (the other tentacles) grow outward from the rhyming one, one after another, instead of all appearing at once.
- **Run the morph while the camera hovers at the rhyme.** The disc then stays small, so only the rhyming pieces are inside it. A long window put the whole octopus in the disc, and the hook had to become a blob.
- **Ask of every frame of the hand-off: what is the eye looking at, and is it continuous?** That covers the shape, the colour, the edges and the neighbours. The checks (`pops`, `check:visual`) find jumps, not missing in-betweens; those you find by looking at dense frames.

## The rules

1. **Overlap the steps, never chain them.** The next step starts before the current one ends. In a match cut, the hand-off starts while the camera is still arriving and ends after it has left. If you can name the moment where one step stops and the next begins, the change will read as A → B → C.
2. **Something is always moving.** Run zoom, roll and position as separate curves with different peaks. When the zoom brakes into the rhyme, the roll is at full speed, so momentum carries the hand-off. Even a hold creeps (about 1 % per second).
3. **Speed curves tell the story:**
   - **anticipation**: a small pull-back and counter-roll before the push (gathering);
   - **acceleration**: the push spends most of its distance late (fast arrival);
   - **brake**: a hard but smooth stop on the subject (impact);
   - **release**: the pull-out starts fast;
   - **settle**: a long, soft tail, with the roll overshooting slightly and coming back.

   Velocity is continuous everywhere: Hermite curves (`curve()` in `vector/camera-move.ts`), never piecewise eases that start and stop at zero.
4. **Hand off inside a hide moment.** Swap the content when the eye can't compare: the frame is filled by one colour (a dive into the shape), the motion is fastest and most blurred, an object is edge-on, or something passes in front of the lens. In the title sequence, an ink splat fills the frame and the pen is a sword behind it; a page turns edge-on and is a book on the other side.
5. **Real motion blur, only when the camera is fast.** Average sub-frames over a shutter of about 1/60 s, with as many samples as the frame's motion needs (`cameraMotion()`), and none when it is slow. This is physical camera blur, not a smear effect. It is also what makes a fast push feel fast.
6. **Never show the edge of the world.**
   - Don't overshoot a pull-out past a drawing that exactly fills the frame: the zoom overshoot defaults to 0, and only the roll overshoots.
   - Compensate zoom for roll: `cos φ + (W/H)·sin φ`, fading to nothing at the rhyme peak, so it never jumps. An unfaded switch caused a real pop.
7. **Use scale freely.** With a flat 2–3 colour palette, a macro detail and a wide view are equally readable. Jumping between them is where the energy comes from (an idea from the title designer's interview).

## Moves available (`vector/camera-move.ts`, used by `matchCutScene` / `matchCutArtScene`)

| Style | Reads as | When |
| --- | --- | --- |
| `swing` (default) | The camera arcs in on the rhyme with a bank (`swing`, in radians), hands over at full roll speed, and pulls out levelling onto B | Most match cuts, and pictures |
| `dive` (FPV, optional) | A fast dive INTO the rhyme part until its colour fills the frame, a swap on that beat, and a burst out of B's part, with motion blur | When the rhyme parts share a solid interior (`coverPoint` finds it) and the moment deserves punch. Use it for one or two beats in a piece, not everywhere. |

The default timing is: anticipation until 0.9 s, the rhyme peak at 2.9 s, landed at 4.9 s, settled at 5.8 s, end at 7.6 s. A dive's frame-filled beat is about 0.3 s; a long flat field of colour reads as dead air.

## Checks

- Print the speed profile (`log zoom` and roll per second against time) before rendering. The peaks of the channels must not line up, and no stretch of more than about 0.5 s may be all zeros except the final hold.
- `pops.mjs` catches discontinuities, such as a compensation switching at the peak.
- Measure frame time in a real browser while stepping frames with `requestAnimationFrame`. Blur sub-frames cost real time; MM95–97 hold 16.7 ms on an M4 at dpr 2.

## Still to apply

- MM93 and MM94 (3D models) use chained eases; move them to coupled curves.
- MM95–97 use the 2D in-frame camera and do not give the viewpoint feel. Their content could be moved into card space.
