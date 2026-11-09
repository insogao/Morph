import { curve } from "../../packages/morph-engine/src/vector/camera-move";
import { mapShape, shapeFromRings, type Shape } from "../../packages/morph-engine/src/vector/shape";
import { CREAM, INK, P1, P2, TAU, box, clamp, glyphFoot, heavy, lerp, outQuad, rng, slotBox, smooth, span, uiText, word, fillSlots, type V } from "./common";
import { PLAYERS, k, pose, posed, type Key, type Pose } from "./player";
import { drawSolid, drawSolids, hex, lerpCam, project, view, type Cam3, type Solid, type View } from "./proj";
import { FLOOR, splitMorph } from "./s1-play";

/*
 * 2P SPLIT → LEVEL 3 (DEPTH) → the join. One 3D world of flat shapes extruded along z.
 *   SPLIT — the screen splits: left is E's view, a long-lens side view on a cream page (flat, 2D); right is t's view,
 *   the same world in perspective on the night (2.5D). They climb the same stairs in their own lanes, a half beat
 *   apart. Then the divider sweeps away while E's camera swings round to meet t's: the flat level was a side view of
 *   a 3D one all along.
 *   DEPTH — the stairs lead to a giant extruded AND. E waits on the A, t crosses N to the D (passing E in depth).
 *   The camera orbits; they bounce in call and response. They leap toward each other over N, meet in the air and
 *   fuse back into & (the same field morph as the title, reversed), which drops onto the N. The camera swings to a
 *   front view: AND, with & on top.
 */
export const SPLIT = 55, MERGE = [63.5, 67.5] as const, LEAP = 79, MEET = 81, FUSED = 82, LANDED = 83, FRONT = [83, 86] as const;
const ZE = -70, ZT = 70;

// ——— the world ———
const rect = (x0: number, y0: number, x1: number, y1: number): Shape => shapeFromRings([[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]]);
const STEP = 66.4, STEP_X = (i: number) => 150 + i * 175;
const BLOCKS: Array<{ shape: Shape; z: number; depth: number }> = [
  { shape: rect(-1100, 0, 120, 170), z: -180, depth: 360 },
  ...Array.from({ length: 7 }, (_, i) => ({ shape: rect(STEP_X(i), -STEP * (i + 1), STEP_X(i) + 150, 170), z: -180, depth: 360 })),
];
const TOP = -STEP * 7;
const AND = word(heavy, "AND", 1560, TOP, 640, 0.07);
const [A, N, D] = AND.slots.map(slotBox);
const AX = (A.x0 + A.x1) / 2, DX = (D.x0 + D.x1) / 2;
BLOCKS.push({ shape: rect(STEP_X(6), TOP, A.x0 + 40, TOP + 34), z: -180, depth: 360 });   // the top walk to the A
const LETTERS = AND.slots.map(s => ({ shape: s.shape, z: -110, depth: 220 }));
// N's tops: the left stem (with the diagonal's start) and the right stem
const nTop = N.y0, NL = N.x0 + (N.x1 - N.x0) * 0.2, NR = N.x1 - (N.x1 - N.x0) * 0.11;
const MX = NL + 14, MY = TOP - 330;                                                         // where they meet

// ——— tracks ———
const stepsE: Key[] = Array.from({ length: 7 }, (_, i) => k(58 + i, STEP_X(i) + 50, -STEP * (i + 1), "jump", { h: 60, z: ZE }));
const stepsT: Key[] = Array.from({ length: 7 }, (_, i) => k(58.5 + i, STEP_X(i) + 100, -STEP * (i + 1), "jump", { h: 60, z: ZT }));
const bounce = (x: number, y: number, z: number, from: number, to: number, off: number): Key[] => {
  const out: Key[] = [];
  for (let b = from + off; b + 1 <= to; b += 2) out.push(k(b + 0.55, x, y, "hold", { z }), k(b + 1, x, y, "jump", { h: 26, z }));
  return out;
};
export const TRACK3_E: Key[] = [
  k(-10, -520, 0, "hold", { z: ZE }), k(55.5, -520, 0, "hold", { z: ZE }), k(57.2, 60, 0, "run", { z: ZE }),
  ...stepsE,
  k(66.6, A.x0 - 10, TOP, "run", { z: ZE }), k(67.5, AX - 30, A.y0, "jump", { h: 60, z: ZE }),
  ...bounce(AX - 30, A.y0, ZE, 68, LEAP, 0),
  k(LEAP, AX - 30, A.y0, "hold", { z: ZE }),
  k(MEET, MX - 62, MY, "jump", { h: 150, z: 0, spin: 1, soft: true }), k(MEET + 3, MX - 62, MY, "hold", { z: 0 }),
];
export const TRACK3_T: Key[] = [
  k(-10, -700, 0, "hold", { z: ZT }), k(56, -700, 0, "hold", { z: ZT }), k(57.7, 0, 0, "run", { z: ZT }),
  ...stepsT,
  k(67, A.x0 - 40, TOP, "run", { z: ZT }), k(68, AX + 30, A.y0, "jump", { h: 60, z: ZT }),
  k(69, NL, nTop, "jump", { h: 70, z: ZT }), k(70, NR, nTop, "jump", { h: 70, z: ZT }), k(71, D.x0 + 60, D.y0, "jump", { h: 70, z: ZT }),
  k(71.6, DX, D.y0, "run", { z: ZT }),
  ...bounce(DX, D.y0, ZT, 72, LEAP, 1),
  k(LEAP, DX, D.y0, "hold", { z: ZT, dir: -1 }),
  k(MEET, MX + 64, MY, "jump", { h: 150, z: 0, spin: -1, soft: true }), k(MEET + 3, MX + 64, MY, "hold", { z: 0 }),
];
function players3(b: number): [Pose, Pose] { return [pose(TRACK3_E, b), pose(TRACK3_T, b)]; }
function lagged(b: number, f: (p: [Pose, Pose]) => [number, number, number]): [number, number, number] {
  const n = 8, acc: [number, number, number] = [0, 0, 0];
  for (let j = 0; j < n; j++) { const v = f(players3(b - j * 0.08)); acc[0] += v[0] / n; acc[1] += v[1] / n; acc[2] += v[2] / n; }
  return acc;
}

// ——— cameras ———
const camLeft = (b: number): Cam3 => { const [x, y] = lagged(b, ([e]) => [e.x, e.y, 0]); return { t: [x + 60, y - 70, 0], yaw: 0, pitch: 0, dist: 9000, f: 9000 * 0.92 }; };
const camRight = (b: number): Cam3 => { const [x, y, z] = lagged(b, ([, t]) => [t.x, t.y, t.z]); return { t: [x + 40, y - 80, z], yaw: -0.62, pitch: 0.34, dist: 1150, f: 1000 }; };
const yaw = curve([{ t: MERGE[1], v: -0.5 }, { t: 72, v: -0.32 }, { t: LEAP, v: 0.55 }, { t: MEET, v: 0.3 }, { t: LANDED, v: 0.12 }, { t: FRONT[1], v: 0, d: 0 }]);
const pitch = curve([{ t: MERGE[1], v: 0.3 }, { t: 74, v: 0.36 }, { t: LEAP, v: 0.22 }, { t: LANDED, v: 0.1 }, { t: FRONT[1], v: 0, d: 0 }]);
const logDist = curve([{ t: MERGE[1], v: Math.log(1350) }, { t: 72, v: Math.log(1550) }, { t: LEAP, v: Math.log(1650) }, { t: MEET, v: Math.log(1250) }, { t: LANDED, v: Math.log(1700) }, { t: FRONT[1], v: Math.log(7000), d: 0 }]);
const logF = curve([{ t: MERGE[1], v: Math.log(1000) }, { t: LANDED, v: Math.log(1000) }, { t: FRONT[1], v: Math.log(7000 * 0.66), d: 0 }]);
const FINAL: [number, number, number] = [(AND.left + AND.right) / 2, TOP + 120, 0];
function camShared(b: number): Cam3 {
  const [x, y, z] = lagged(b, ([e, t]) => [(e.x + t.x) / 2, (e.y + t.y) / 2, (e.z + t.z) / 2]);
  const toMeet = smooth(span(b, LEAP, MEET)), fin = smooth(span(b, LANDED - 0.5, FRONT[1]));
  let t: [number, number, number] = [x + 40, y - 90, z];
  t = [lerp(t[0], MX, toMeet), lerp(t[1], MY + 40, toMeet), lerp(t[2], 0, toMeet)];
  if (b > MEET) { const fall = andAt(b), w = 0.6 * smooth(span(b, MEET, FUSED + 0.3)); t = [lerp(t[0], fall.x, w), lerp(t[1], fall.y + 40, w), lerp(t[2], 0, w)]; }
  t = [lerp(t[0], FINAL[0], fin), lerp(t[1], FINAL[1], fin), lerp(t[2], FINAL[2], fin)];
  return { t, yaw: yaw(Math.max(b, MERGE[1])), pitch: pitch(Math.max(b, MERGE[1])), dist: Math.exp(logDist(Math.max(b, MERGE[1]))), f: Math.exp(logF(Math.max(b, MERGE[1]))) };
}

// ——— the & after the fuse: drops onto the N ———
function andAt(b: number) {
  const fall = clamp((b - FUSED) / (LANDED - FUSED));
  const y = lerp(MY, nTop, fall * fall), land = span(b, LANDED, LANDED + 0.45);
  const squash = b >= LANDED ? 1 - 0.3 * (1 - land) * (1 - land) : 1 + 0.12 * fall;
  return { x: MX, y, squash };
}
const AMP3 = glyphFoot(heavy, "&", [0, 0], 205);
const AMP_W = box(AMP3);

// ——— palettes ———
const PAGE = { bg: CREAM, solid: hex(INK) }, NIGHT = { bg: INK, solid: hex(CREAM) };
export const mix = (a: [number, number, number], b: [number, number, number], u: number): [number, number, number] => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
export const css = (c: [number, number, number]) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

const CRUMBLE = 71.5;
function world(b: number, solidColor: [number, number, number]): Solid[] {
  const out: Solid[] = [];
  BLOCKS.forEach((s, i) => {
    const a = b - (CRUMBLE + (BLOCKS.length - 1 - i) * 0.22);
    if (a <= 0) { out.push({ ...s, color: solidColor }); return; }
    const dy = 0.5 * 2600 * a * a; if (dy > 2500) return;
    out.push({ ...s, shape: mapShape(s.shape, ([x, y]) => [x, y + dy]), color: solidColor });
  });
  for (const s of LETTERS) out.push({ ...s, color: solidColor });
  const ps = players3(b), fused = b >= MEET + 0.02;
  if (!fused || b < FUSED) PLAYERS.forEach((p, i) => { if (b >= MEET && b < FUSED) return; out.push({ shape: posed(p.shape, p.height, ps[i]), z: ps[i].z - 14, depth: 28, color: hex(p.color) }); });
  return out;
}

function drawFuse(ctx: CanvasRenderingContext2D, v: View, b: number) {
  if (b < MEET) return;
  let shape: Shape;
  if (b < FUSED) {
    const rings = splitMorph(1 - smooth(span(b, MEET, FUSED)));
    shape = shapeFromRings(rings.map(r => r.map(([x, y]) => [x + MX, y - FLOOR + MY] as V)));
  } else {
    const a = andAt(b);
    shape = mapShape(AMP3, ([x, y]) => [a.x + x * (1 / Math.sqrt(a.squash)), a.y + y * a.squash]);
  }
  // walls in each player's colour, split down the middle (they are the two players' sides of one shape)
  const c1 = hex(P1), c2 = hex(P2), mid = (box(shape).x0 + box(shape).x1) / 2;
  drawSolid(ctx, v, { shape, z: -14, depth: b < FUSED ? 28 + 20 * span(b, MEET, FUSED) : 48, color: c1, colorAt: x => x < mid ? c1 : c2 }, 0.62);
  // the face in the two players' colours
  const bx = box(shape), [x0, y0] = project(v, bx.x0, (bx.y0 + bx.y1) / 2, -14), [x1] = project(v, bx.x1, (bx.y0 + bx.y1) / 2, -14);
  const g = ctx.createLinearGradient(x0, y0, x1, y0), w = 0.04;
  g.addColorStop(0, P1); g.addColorStop(0.5 - w, P1); g.addColorStop(0.5 + w, P2); g.addColorStop(1, P2);
  const path = new Path2D();
  for (const p of shape.pieces) for (const r of [p.outer, ...p.holes]) { r.forEach(([x, y], i) => { const [px, py] = project(v, x, y, -14); if (i) path.lineTo(px, py); else path.moveTo(px, py); }); path.closePath(); }
  ctx.fillStyle = g; ctx.fill(path, "evenodd");
  // the landing: a ring of dust across the N's top
  const age = b - LANDED;
  if (age > 0 && age < 1.2) {
    const r = rng(83), u = outQuad(age / 1.2);
    ctx.fillStyle = CREAM;
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * TAU + r() * 0.2, rad = 40 + 260 * u * (0.7 + r() * 0.5), [px, py] = project(v, MX + Math.cos(a) * rad, nTop - 6 - 30 * Math.sin(Math.PI * u) * r(), Math.sin(a) * rad * 0.7);
      const s = 7 * (1 - u); ctx.globalAlpha = 1 - u; ctx.fillRect(px - s / 2, py - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }
}

function render(ctx: CanvasRenderingContext2D, cam: Cam3, b: number, bg: string, solid: [number, number, number], cx: number) {
  ctx.fillStyle = bg; ctx.fillRect(-700, -400, 1400, 800);
  ctx.save(); ctx.translate(cx, 0);
  const v = view(cam);
  drawSolids(ctx, v, world(b, solid));
  drawFuse(ctx, v, b);
  ctx.restore();
}

const TAG1 = uiText("1P · E", [0, 0], 15, 0.24), TAG2 = uiText("2P · t", [0, 0], 15, 0.24);
const CARD3 = uiText("LEVEL 3 · DEPTH", [0, 0], 16, 0.3);
export const DEPTH_CARDS = [[68, 72.5, CARD3]] as const;

export function drawDepth(ctx: CanvasRenderingContext2D, b: number) {
  const u = smooth(span(b, MERGE[0], MERGE[1]));
  if (u >= 1) { render(ctx, camShared(b), b, NIGHT.bg, NIGHT.solid, 0); return; }
  const shared = camShared(MERGE[1]);
  const L = lerpCam(camLeft(b), u > 0 ? camShared(Math.max(b, MERGE[1])) : shared, u), R = lerpCam(camRight(b), shared, u);
  const div = lerp(0, -690, u ** 1.6);
  // right: t's view, perspective, the night
  ctx.save(); ctx.beginPath(); ctx.rect(div, -400, 1400, 800); ctx.clip();
  render(ctx, R, b, NIGHT.bg, NIGHT.solid, lerp(320, 0, u));
  ctx.restore();
  // left: E's view, flat, on the page (its palette turns to the night as it swings round)
  if (div > -660) {
    ctx.save(); ctx.beginPath(); ctx.rect(-700, -400, div + 700, 800); ctx.clip();
    render(ctx, L, b, PAGE.bg, PAGE.solid, lerp(-320, 0, u));
    ctx.restore();
  }
  // the divider and the two tags
  ctx.fillStyle = INK; ctx.fillRect(div - 5, -400, 10, 800);
  const a = 1 - smooth(span(b, MERGE[0], MERGE[0] + 1));
  ctx.save(); ctx.translate(-616 - TAG1[0].x, -318); fillSlots(ctx, TAG1, P1, a); ctx.restore();
  ctx.save(); ctx.translate(div + 24 - TAG2[0].x, -318); fillSlots(ctx, TAG2, P2, a); ctx.restore();
}

export { TOP as DEPTH_TOP };
