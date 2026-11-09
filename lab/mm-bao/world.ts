import { mapShape, type Shape } from "../../packages/morph-engine/src/vector/shape";
import { ACC, CREAM, P1, P2, SHAFT, box, clamp, glyphFoot, heavy, lerp, mix, smooth, span, type V } from "./common";
import { FRONT, hex, sideFrame, type Frame, type Solid } from "./proj";

/*
 * One world, three planes. Level 1 lives in the plane z = 0 (a paper side-scroller seen from the front). An elevator
 * takes the players down a shaft to the dark hall of level 2, where the sign 入口 stands: its 口 is the mouth of a
 * pipe that runs back into depth (z), turns at a box elbow, and comes out toward +x as the 口 of 出口. Level 3 lives in
 * the plane x = X3, seen from +x (screen right = +z): the camera that swings round to follow the pipe ends up
 * looking at it flat — the side view of level 2 IS the front view of level 3.
 */
export const FLOOR = 100;                 // level 1 ground
export const Y2 = FLOOR + 1400;           // the hall floor (level 2) and level 3's ground
export const SHAFT_X: V = [2700, 3060];
export const ELEV = { x0: 2712, x1: 3048 };
export const DESCENT: V = [28, 31];
/** the elevator's top: a dip when the heavy one lands, then the ride down */
export function elevTop(b: number) {
  const dip = 26 * Math.sin(Math.PI * span(b, 27, 27.55)) * (b > 27 ? 1 : 0) + 8 * Math.sin(Math.PI * span(b, 26.5, 26.8)) * (b > 26.5 ? 1 : 0);
  return lerp(FLOOR, Y2, smooth(span(b, DESCENT[0], DESCENT[1]))) + dip;
}

// ——— 入口 ———
export const MX = 3750;                   // the mouth's centre x
const MK = 0.44;
export const MOUTH = glyphFoot(heavy, "口", [MX, Y2], 440);
const MB = box(MOUTH);
export const W = MB.x1 - MB.x0, HM = MB.y1 - MB.y0;
const hole = (() => { const h = MOUTH.pieces[0].holes[0]; const xs = h.map(q => q[0]), ys = h.map(q => q[1]); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; })();
export const HOLE = hole;
export const INNER = hole.y1;             // the pipe's inside floor
export const RU = glyphFoot(heavy, "入", [MX, MB.y0 - 26], 210);
export const Z1 = 2400;                   // the straight run into depth
export const ZC = Z1 + W / 2;             // the elbow's centre (z)
export const EXIT_X = MB.x1 + 400;        // the 出口 mouth plane
export const X3 = EXIT_X + 120;           // level 3's plane
export const SIDE = sideFrame(EXIT_X);
// the 口 of 出口, in the side plane (local x = world z), and 出 above it
export const MOUTH2 = glyphFoot(heavy, "口", [ZC, Y2], 440);
export const CHU = glyphFoot(heavy, "出", [ZC, MB.y0 - 26], 210);
void MK;

const SEG2 = 14;
const dx2 = (EXIT_X - MB.x1) / SEG2;
const C = hex(CREAM), DARK = hex("#2b2925"), DEEP = hex("#121212"), YEL = hex(ACC);

// a rectangle as a shape
export const rect = (x0: number, y0: number, x1: number, y1: number): Shape => ({ pieces: [{ outer: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], holes: [] }] } as unknown as Shape);
const scaleAbout = (s: Shape, cx: number, cy: number, k: number) => k === 1 ? s : mapShape(s, ([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);

// ——— the players' way through the pipe: d along (z: 80 → ZC at x = MX), then (x: MX → EXIT_X) ———
const L1 = ZC - 80, L2 = EXIT_X - MX, LT = L1 + L2;
export const TUBE = [{ in: 35, out: 44 }, { in: 35.5, out: 44.5 }];
/** distance along the pipe: hops on the beat (still on each beat, fastest between) */
function along(who: number, b: number) {
  const { in: a, out: o } = TUBE[who], n = o - a, u = clamp((b - a) / n);
  return LT * (u - Math.sin(2 * Math.PI * n * u) / (2 * Math.PI * n));
}
export function inTube(who: number, b: number) {
  if (b < TUBE[who].in || b > TUBE[who].out) return null;
  const d = along(who, b);
  return d < L1 ? { seg: 1, x: MX, z: 80 + d } : { seg: 2, x: MX + (d - L1), z: ZC };
}
const bump = (d: number) => Math.exp(-((d / 150) ** 2));
/** how much the pipe swells at a station, and whose colour it takes */
function swell(seg: 1 | 2, at: number, b: number) {
  let s = 0; const ws = [0, 0];
  for (const who of [0, 1]) {
    const { in: i0, out: o0 } = TUBE[who];
    // after the pop out: the exit mouth swells once more and settles
    if (b > o0 && b < o0 + 0.7) {
      const w = (seg === 2 ? bump(at - EXIT_X) : 0) * (1 - smooth(span(b, o0, o0 + 0.7)));
      s += w; ws[who] += w;
      continue;
    }
    const p = inTube(who, b); if (!p) continue;
    let w = smooth(span(b, i0, i0 + 0.35));
    if (seg === 1 && p.seg === 1) w *= bump(at - p.z);
    else if (seg === 2 && p.seg === 2) w *= bump(at - p.x);
    else if (seg === 1 && p.seg === 2) w *= bump(at - ZC) * Math.max(0, 1 - (p.x - MX) / 200);
    else w = 0;   // leaving the elbow
    // a kick on each beat (they push off inside)
    w *= 0.85 + 0.3 * Math.exp(-((b - i0) % 1) * 4);
    s += w; ws[who] += w;
  }
  // the stronger one's colour; through cream when they are even (never a muddy mix of the two)
  const tot = ws[0] + ws[1], lead = ws[1] > ws[0] ? P2 : P1, amt = tot > 1e-4 ? Math.abs(ws[0] - ws[1]) / tot : 0;
  return { k: 1 + 0.2 * Math.min(1.3, s), tint: mix(CREAM, lead, Math.min(1, Math.max(ws[0], ws[1])) * 0.65 * Math.min(1, amt * 1.6)) };
}

/** Every 3D solid of levels 2–3 at beat b (the pipe with its bulges, the hall floor, the elevator). */
export function solids(b: number, extra: Solid[] = []): Solid[] {
  const out: Solid[] = [];
  // the hall floor: a big slab, flat-lit so it reads as one paper plane
  out.push({ shape: rect(SHAFT_X[0] - 60, Y2, X3, Y2 + 56), z: -500, depth: 3880 + 500, color: C, key: 1e9, flat: 1 });
  // 入 (a sign over the mouth) and 出 (over the exit, in the side plane)
  out.push({ shape: RU, z: 0, depth: 34, color: C });
  out.push({ shape: CHU, z: 0, depth: 34, color: C, frame: SIDE });
  // the straight run, in slices that swell where a player is inside: coarse far from them, fine around them
  const cuts = new Set<number>();
  for (let z = 0; z <= Z1; z += 300) cuts.add(Math.min(Z1, z));
  cuts.add(Z1); cuts.add(60);
  for (const who of [0, 1]) {
    const p = inTube(who, b); if (!p) continue;
    const c = p.seg === 1 ? p.z : ZC;
    for (let z = Math.floor((c - 390) / 26) * 26; z <= c + 390; z += 26) if (z > 0 && z < Z1) cuts.add(z);
  }
  const zs = [...cuts].sort((a, b2) => a - b2);
  for (let i = 0; i < zs.length - 1; i++) {
    const z = zs[i], dz = zs[i + 1] - z, { k, tint } = swell(1, z + dz / 2, b);
    out.push({ shape: scaleAbout(MOUTH, MX, Y2, k), z, depth: dz + 0.6, color: hex(tint), caps: i === 0, inner: i === 0 ? DARK : false, plug: i === 0 ? DEEP : undefined });
  }
  // the elbow: a box open toward −z and +x (its inside back wall is dark: you see it through the exit)
  const top = MB.y0, bot = MB.y1, tTop = hole.y0 - MB.y0, tBot = MB.y1 - hole.y1, tSide = hole.x0 - MB.x0;
  out.push({ shape: rect(MB.x0, top, MB.x1, top + tTop), z: Z1, depth: W, color: C, caps: false });
  out.push({ shape: rect(MB.x0, bot - tBot, MB.x1, bot), z: Z1, depth: W, color: C, caps: false });
  out.push({ shape: rect(MB.x0, top, MB.x0 + tSide, bot), z: Z1, depth: W, color: DARK, cap: DARK });
  out.push({ shape: rect(MB.x0, top, MB.x1, bot), z: Z1 + W - tSide, depth: tSide, color: C, cap: DARK });
  // the run out toward +x (side plane: local x = z, extruded toward −x from the exit plane)
  for (let i = 0; i < SEG2; i++) {
    const x = EXIT_X - (i + 1) * dx2, { k, tint } = swell(2, x + dx2 / 2, b);
    out.push({ shape: scaleAbout(MOUTH2, ZC, Y2, k), z: i * dx2, depth: dx2 + 0.6, color: hex(tint), frame: SIDE, caps: i === 0, inner: i === 0 ? DARK : false, plug: i === 0 ? DEEP : undefined });
  }
  // the elevator: a yellow slab riding the shaft
  const et = elevTop(b);
  out.push({ shape: rect(ELEV.x0, et, ELEV.x1, et + 34), z: -170, depth: 340, color: YEL });
  return out.concat(extra);
}
/** The shaft's back wall (flat, behind everything at the shaft). */
export const shaftRect = rect(SHAFT_X[0], FLOOR, SHAFT_X[1], Y2);
export const SHAFT_C = SHAFT;
export const PLANES: { front: Frame; side: Frame } = { front: FRONT, side: SIDE };
