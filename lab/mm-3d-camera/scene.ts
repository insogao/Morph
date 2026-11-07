import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import type { Mapping3D } from "../../packages/morph-engine/src/renderers/morph3d";
import { noise3, type V3 } from "../../packages/morph-engine/src/vector/cloud";
import { backdrop, buildRig, flicker, glow, hud, mix, orbit, render, span, type Rig } from "./shared";

/*
 * MM93 — planet → rocket, camera along the axis.
 * The blob problem (B3): a sphere's cloud reshaping into a tall cylinder has no readable in-between.
 * Seen straight up the rocket's axis, the rocket's tail end — body, three fins, flame — is a circle too.
 *   1. the camera dives under the planet; the ring opens into a halo around the disc;
 *   2. the morph happens in THAT view, with a whirl: circle → circle, halo → three fin spokes,
 *      and the flame ignites in the middle (the jet, seen end-on);
 *   3. the camera swings back up to the side: the length of the rocket is revealed as a solid.
 */
const MAPPINGS: Mapping3D[] = [
  { from: "ring", to: ["fin_a", "fin_b", "fin_c"], window: [0.0, 0.5], spread: 0.35, swirl: 0.2 },
  { from: "globe", to: ["body", "nose"], window: [0.32, 0.9], spread: 0.4 },
  { from: "moon", to: "window", window: [0.35, 0.9], spread: 0.2, swirl: 0.25 },
  { from: [], to: "flame", bornFrom: "flame", window: [0.78, 1.0], spread: 0.5, swirl: 0.15 },
];

const T = { dive: [0.6, 2.4], morph: [2.0, 5.2], reveal: [5.4, 7.6], lift: [7.9, 10.0], end: 10.0 } as const;
const UNDER = -1.45, SIDE = 0.08;

let rig: Rig | null = null;
const build = () => {
  const radial = (p: V3) => Math.hypot(p[0], p[2]);
  // The planet converges from its rim inwards (as a whirl); the rocket's tail is built from the axis out.
  const release = (p: V3) => 0.6 * (1 - Math.min(1, radial(p) / 1.33)) + 0.1 * ((Math.atan2(p[2], p[0]) + Math.PI) / (2 * Math.PI)) + 0.3 * noise3(p[0], p[1], p[2], 0.35, 1);
  const land = (p: V3) => 0.45 * Math.min(1, radial(p) / 0.81) + 0.25 * ((p[1] + 1.5) / 3.35) + 0.3 * noise3(p[0], p[1], p[2], 0.35, 2);
  return buildRig(MAPPINGS, release, land, 0.5);
};

export const scene: MorphScene = {
  id: "mm-3d-camera",
  title: "MM93 · 3D 运镜协同①：沿轴俯视——星球圆 → 火箭尾部圆 → 转镜看全貌",
  duration: T.end,
  draw(ctx, t) {
    rig ??= build();
    const { camera, morph, flame } = rig;
    const lift = span(t, T.lift[0], T.lift[1]);
    const climbU = Math.max(0, Math.min(1, (t - T.lift[0]) / (T.lift[1] - T.lift[0])));
    const climb = climbU * climbU;
    backdrop(ctx, t, 520 * climb, 2 * climbU * lift);

    // Camera: side → under the axis → back to the side.
    const dive = span(t, T.dive[0], T.dive[1]), reveal = span(t, T.reveal[0], T.reveal[1]);
    const elevation = mix(mix(0.12, UNDER, dive), SIDE, reveal);
    const distance = mix(mix(9.2, 7.6, dive), 9.6, reveal);
    orbit(camera, elevation, distance, [0, mix(mix(0, -0.3, dive), 0.25, reveal) + 0.3 * climb, 0]);

    // Whirl about the axis (a roll on screen while seen from below); two full turns, ending window-front.
    morph.group.rotation.y = 4 * Math.PI * span(t, T.dive[0], T.reveal[0]);
    morph.group.rotation.z = 0.06 * (1 - span(t, T.dive[0], T.morph[0]));
    const rumble = span(t, T.reveal[1] - 0.2, T.reveal[1] + 0.2) * (1 - 0.6 * lift);
    morph.group.position.set(0.012 * rumble * Math.sin(t * 83), -0.15 + 0.008 * rumble * Math.cos(t * 67) + 0.75 * climb, 0);

    const on = span(t, T.morph[1] - 0.2, T.morph[1] + 0.4);
    const sy = flicker(flame, t, on, lift);
    const u = Math.max(0, Math.min(1, (t - T.morph[0]) / (T.morph[1] - T.morph[0])));
    render(ctx, rig, u);
    // The jet: end-on it is a bright disc at the centre of the tail; from the side, a nozzle glow.
    glow(ctx, rig, [0, -1.5 - 0.6 * (sy - 1), 0], (60 + 80 * lift + 50 * (1 - reveal)) * (0.9 + 0.1 * Math.sin(t * 37)), on);
    hud(ctx, t, "MORPH MASTER · 3D · CAMERA ALONG THE AXIS · planet → rocket (" + morph.pointCount + " points)");
  },
};
