import { mapShape, type Shape } from "../../packages/morph-engine/src/vector/shape";
import { P1, P2, TAU, box, clamp, glyphFoot, heavy, lerp, smooth, span } from "./common";

/*
 * The two players: the E and the t that & is made of ("et"). A player is a real glyph with its feet at the origin;
 * its motion is a track of keys, each key saying where it is on a beat and how it got there (run, jump, fall, ease,
 * hold, bonk). Jumps land ON a beat; poses add a squat before a take-off, stretch in the air and a squash on
 * landing, so the letters read as bodies with weight. A key may ride a moving platform (`ride`: extra y over time).
 */
export const SIZE = 112;
export const shapeE = glyphFoot(heavy, "E", [0, 0], SIZE), shapeT = glyphFoot(heavy, "t", [0, 0], SIZE);
export const HEIGHT_E = -box(shapeE).y0, HEIGHT_T = -box(shapeT).y0;
export const PLAYERS = [{ shape: shapeE, color: P1, height: HEIGHT_E, tag: "1P" }, { shape: shapeT, color: P2, height: HEIGHT_T, tag: "2P" }];

export type Kind = "run" | "jump" | "fall" | "ease" | "hold" | "bonk";
export interface Key { b: number; x: number; y: number; z?: number; kind?: Kind; h?: number; spin?: number; dir?: number; soft?: boolean; ride?: (b: number) => number }
export interface Pose { x: number; y: number; z: number; sx: number; sy: number; rot: number; dir: number }

export const k = (b: number, x: number, y: number, kind: Kind = "run", more: Partial<Key> = {}): Key => ({ b, x, y, kind, ...more });

/** Landing moments of a track: [beat, x, y, power]. */
export function landings(track: Key[]) {
  return track.filter((q, i) => i > 0 && (q.kind === "jump" || q.kind === "fall" || q.kind === "bonk")).map(q => ({ b: q.b, x: q.x, y: q.y, power: q.kind === "fall" ? 1.5 : 1, ride: q.ride }));
}

export function pose(track: Key[], b: number): Pose {
  let i = 0;
  while (i < track.length - 1 && b >= track[i + 1].b) i++;
  const a = track[i], n = b >= a.b ? track[i + 1] : undefined;
  let x = a.x, y = a.y, z = a.z ?? 0, sy = 1, rot = 0, dir = a.dir ?? 1;
  let ride = a.ride?.(b) ?? 0;
  if (n) {
    const u = clamp((b - a.b) / (n.b - a.b)), kind = n.kind ?? "run", nz = n.z ?? z;
    dir = n.dir ?? (Math.sign(n.x - a.x) || a.dir || 1);
    const rn = n.ride?.(b) ?? 0;
    if (kind === "hold") { /* stay */ }
    else if (kind === "run") {
      x = lerp(a.x, n.x, u); y = lerp(a.y, n.y, u); z = lerp(z, nz, u); ride = lerp(ride, rn, u);
      if (Math.abs(n.x - a.x) > 1) { const step = Math.abs(Math.sin(Math.PI * 2 * (b - a.b))); y -= 6 * step; rot = 0.1 * dir; sy = 1 + 0.05 * step; }
    } else if (kind === "ease") {
      const q = smooth(u); x = lerp(a.x, n.x, q); y = lerp(a.y, n.y, q); z = lerp(z, nz, q); ride = lerp(ride, rn, q);
      rot = (n.spin ?? 0) * TAU * q; if (n.spin) sy = 1 + 0.1 * Math.sin(Math.PI * q);
    } else if (kind === "fall") {
      x = lerp(a.x, n.x, u); y = lerp(a.y, n.y, u * u); z = lerp(z, nz, u); ride = lerp(ride, rn, u);
      sy = 1 + 0.2 * u; rot = (n.spin ?? 0) * TAU * u;
    } else if (kind === "jump") {
      const h = n.h ?? 80;
      x = lerp(a.x, n.x, u); z = lerp(z, nz, u); ride = lerp(ride, rn, u);
      y = lerp(a.y, n.y, u) - 4 * h * u * (1 - u);
      const st = Math.abs(2 * u - 1);
      sy = 1 + 0.16 * st; rot = (n.spin ?? 0) * TAU * smooth(u) + 0.08 * dir * (1 - st);
    } else if (kind === "bonk") {
      // straight up into a ceiling (h px of room), a hard stop, and back down
      const h = n.h ?? 20, up = Math.min(u / 0.3, 1), down = clamp((u - 0.3) / 0.7);
      x = lerp(a.x, n.x, u);
      y = u < 0.3 ? a.y - h * Math.sin(up * Math.PI / 2) : lerp(a.y - h, n.y, down * down);
      sy = u < 0.3 ? 1 + 0.15 * up : lerp(0.72, 1.06, smooth((u - 0.3) / 0.3));
      rot = u > 0.3 ? 0.18 * Math.sin((u - 0.3) * 18) * (1 - down) : 0;
    }
    // the squat before a take-off from the NEXT key
    const after = track[i + 2];
    if (after && (after.kind === "jump" || after.kind === "bonk") && (kind === "hold" || kind === "run") && b > n.b - 0.22) sy *= 1 - 0.24 * span(b, n.b - 0.22, n.b);
  }
  // squash on landing
  if ((a.kind === "jump" || a.kind === "fall" || a.kind === "bonk") && !a.soft) {
    const q = 1 - span(b, a.b, a.b + 0.4), power = a.kind === "fall" ? 0.4 : 0.3;
    sy *= 1 - power * q * q;
  }
  return { x, y: y + ride, z, sx: 1 / Math.sqrt(sy), sy, rot, dir };
}

/** The player's outline at a pose, in world (x, y) — feet at the pose point; rotation about the body's middle. */
export function posed(shape: Shape, height: number, p: Pose): Shape {
  const c = Math.cos(p.rot), s = Math.sin(p.rot), mid = height / 2;
  return mapShape(shape, ([x, y]) => {
    const lx = x * p.sx, ly = y * p.sy + mid;
    return [p.x + c * lx - s * ly, p.y - mid + s * lx + c * ly];
  });
}
