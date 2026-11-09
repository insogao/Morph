import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import type { Mapping3D } from "../../packages/morph-engine/src/renderers/morph3d";
import { noise3, type V3 } from "../../packages/morph-engine/src/vector/cloud";
import { backdrop, buildRig, flicker, glow, hud, mix, orbit, plumeMesh, render, span, type Rig } from "../mm-3d-camera/shared";

/*
 * MM94 — planet → rocket: sphere → pancake → column, each step carried by the camera.
 *   1. the camera rises over the planet. Seen from above, a sphere and a flat disc are the same circle:
 *      the planet whirls down into the rocket's exhaust plume — a flat pancake of hot gas round the nozzle;
 *   2. the camera tilts down to the side: the circle is revealed as a flat pancake;
 *   3. the rocket grows out of the pancake as ONE front, tail to tip (not part by part), and the
 *      camera rises with it. At lift-off the plume stays on the pad and spreads.
 * The plume is a scene-side part (plumeMesh), not in the model: an effect part with a fate of its own.
 */
const radial = (p: V3) => Math.hypot(p[0], p[2]);
const MAPPINGS: Mapping3D[] = [
  // The plume spreads from its centre out.
  { from: ["globe", "ring", "moon"], to: "plume", window: [0.0, 0.3], spread: 0.5, swirl: 0.45,
    land: p => 0.75 * Math.min(1, radial(p) / 1.3) + 0.25 * noise3(p[0], p[1], p[2], 0.35, 2) },
  // The WHOLE rocket grows as one front, tail → tip, regardless of part: one window, spread 1, a height
  // field, and each point leaving the plume only shortly before it lands (flight). Per-part windows made
  // it look assembled piece by piece (user feedback) — a growth must be one continuous front.
  { from: [], to: ["flame", "fin_a", "fin_b", "fin_c", "body", "window", "nose"], bornFrom: "plume", window: [0.3, 1.0], spread: 1, flight: 0.1, swirl: 0.08,
    land: p => 0.95 * ((p[1] + 1.5) / 3.35) + 0.05 * noise3(p[0], p[1], p[2], 0.25, 5) },
];

const T = { rise: [0.5, 2.0], morph: [1.8, 9.0], tilt: [4.0, 5.3], lift: [9.5, 12.0], end: 12.0 } as const;
const PLUME_Y = -1.42, TOP = 1.36;
const uAt = (t: number) => Math.max(0, Math.min(1, (t - T.morph[0]) / (T.morph[1] - T.morph[0])));

let rig: Rig | null = null;
const build = () => {
  // The planet leaves from its rim inwards (a whirl). The plume spreads from the centre out;
  // the rocket lands bottom → top inside every window.
  const release = (p: V3) => 0.6 * (1 - Math.min(1, radial(p) / 1.33)) + 0.1 * ((Math.atan2(p[2], p[0]) + Math.PI) / (2 * Math.PI)) + 0.3 * noise3(p[0], p[1], p[2], 0.35, 1);
  const land = (p: V3) => noise3(p[0], p[1], p[2], 0.35, 2); // every mapping sets its own
  return buildRig(MAPPINGS, release, land, 0.4, [plumeMesh("plume", PLUME_Y)]);
};

export const scene: MorphScene = {
  id: "mm-3d-grow",
  title: "MM94 · 3D 运镜协同②：球 →（俯视）饼状尾焰 →（转镜）向上生长成火箭",
  duration: T.end,
  draw(ctx, t) {
    rig ??= build();
    const { camera, morph, flame } = rig;
    const plume = morph.part("b", "plume");
    const u = uAt(t);
    const lift = span(t, T.lift[0], T.lift[1]);
    const climbU = Math.max(0, Math.min(1, (t - T.lift[0]) / (T.lift[1] - T.lift[0])));
    const climb = climbU * climbU;
    backdrop(ctx, t, 520 * climb, 2 * climbU * lift);

    // Camera: side → straight above (sphere ≡ disc) → down to a low side view (the pancake) → up with the growth.
    const rise = span(t, T.rise[0], T.rise[1]), tilt = span(t, T.tilt[0], T.tilt[1]), grow = Math.max(0, Math.min(1, (u - 0.3) / 0.7));
    orbit(camera,
      mix(mix(mix(0.12, TOP, rise), 0.2, tilt), 0.06, grow),
      mix(mix(mix(9.2, 8.6, rise), 7.2, tilt), 9.6, grow),
      [0, mix(mix(mix(0, -0.7, rise), -1.15, tilt), 0.2, grow) + 0.3 * climb, 0]);

    // Whirl about the axis while it flattens (seen from above: a spiral into the disc), settling window-front.
    morph.group.rotation.y = 4 * Math.PI * span(t, T.rise[0], T.morph[0] + 0.32 * (T.morph[1] - T.morph[0]));
    morph.group.rotation.z = 0.06 * (1 - rise);
    const rumble = span(t, T.morph[1] - 0.1, T.morph[1] + 0.3) * (1 - 0.6 * lift);
    morph.group.position.set(0.012 * rumble * Math.sin(t * 83), -0.15 + 0.008 * rumble * Math.cos(t * 67) + 0.75 * climb, 0);

    // The plume stays on the pad when the rocket climbs, and spreads (solid phase only: it landed long ago).
    const spread = 1 + 0.55 * lift, flat = 1 + 0.25 * lift;
    plume.scale.set(spread, flat, spread);
    plume.position.set(-morph.group.position.x, PLUME_Y * (1 - flat) - 0.75 * climb, 0);

    const on = span(u, 0.33, 0.46);
    const sy = flicker(flame, t, on, lift);
    render(ctx, rig, u);
    // Hot core of the pancake while it forms, then the nozzle glow.
    const core = span(u, 0.12, 0.3);
    glow(ctx, rig, [0, PLUME_Y + 0.05, 0], 120 * (0.92 + 0.08 * Math.sin(t * 29)), core * (1 - 0.5 * on));
    glow(ctx, rig, [0, -1.25 - 0.5 * (sy - 1), 0], (60 + 80 * lift) * (0.9 + 0.1 * Math.sin(t * 37)), on);
    hud(ctx, t, "MORPH MASTER · 3D · SPHERE → PANCAKE → COLUMN · planet → rocket (" + morph.pointCount + " points)");
  },
};
