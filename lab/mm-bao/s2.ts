import { lerp, smooth, span } from "./common";
import { flatFront, flatSide, lerpCam, type Cam3 } from "./proj";
import { camera1 } from "./s1";
import { MX, TUBE, X3, Y2, Z1, ZC, inTube } from "./world";

/*
 * LEVEL 2 · 管道 (pipes) — the camera does the level. At the bottom of the shaft the view is still the flat paper
 * one; it swings round (yaw) to show that the 口 of 入口 is not a letter but a mouth: a pipe running back into the
 * dark. The players jump in and vanish; you follow them from outside by the bulges they push along the pipe, each
 * in its player's colour, a hop on every beat. The camera keeps swinging until it looks along the pipe's last run
 * from the side — flat again — straight into the 口 of 出口, and the players pop out into level 3.
 */
export const SWING: [number, number] = [32.6, 35.2];
const C1: Cam3 = { t: [MX - 140, Y2 - 330, 260], yaw: -0.62, pitch: 0.2, dist: 2100, f: 1180 };
const C2 = (z: number): Cam3 => ({ t: [MX, Y2 - 210, z], yaw: -1.28, pitch: 0.17, dist: 1650, f: 1000 });
export const C3 = flatSide(ZC + 170, Y2 - 230, 0.86, X3);

/** Where the bulges are, averaged (the camera's travelling target along the pipe). */
function tubeZ(b: number) {
  let z = 0, n = 0;
  for (const who of [0, 1]) { const p = inTube(who, b); if (p) { z += p.seg === 1 ? p.z : ZC; n++; } }
  return n ? z / n : b < TUBE[0].in + 1 ? 200 : ZC;
}
/** The camera of level 2, from the flat front view through the 3D shots to the flat side view. */
export function camera2(b: number): Cam3 {
  const c = camera1(Math.min(b, 34)), flat = flatFront(c.x, c.y, c.z);
  if (b < SWING[0]) return flat;
  let cam = lerpCam(flat, C1, smooth(span(b, SWING[0], SWING[1])));
  // travel alongside the pipe with the bulges (the target eases, never jumps)
  const zs = Math.min(Z1 - 200, lerp(260, tubeZ(b), smooth(span(b, 35.2, 37))));
  cam = lerpCam(cam, C2(zs), smooth(span(b, 35, 37.2)));
  cam = lerpCam(cam, C3, smooth(span(b, 40.6, 44.2)));
  return cam;
}
