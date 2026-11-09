import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import type { Vec2 } from "../../packages/morph-engine/src/vector/geom";
import { curve } from "../../packages/morph-engine/src/vector/camera-move";
import { morphShapes } from "../../packages/morph-engine/src/vector/morph";
import { fieldMorph, rasterInside } from "../../packages/morph-engine/src/vector/sdf-field";
import { framePath, mixColor } from "../../packages/morph-engine/src/vector/render";
import { mapShape, type Shape } from "../../packages/morph-engine/src/vector/shape";
import { layoutText, type GlyphSet } from "../../packages/morph-engine/src/vector/text";
import black from "./glyphs-900.json";
import medium from "./glyphs-500.json";

/*
 * MM73 — 俠 (v3, storyboard agreed with the user). The line IS the storyboard; each clause is a real glyph:
 *   「拥有力量，只是强者；」   大 — the real glyph becomes a strong pictograph person, arms out. Strength, unused.
 *   「如何使用力量，」         夾 — two small people walk in and falter; he lowers his arms and lifts them under his
 *                              arms while they brace his side: they hold each other up (the ancient 夾 IS a big
 *                              person with two small ones under his arms). A sway passes through the three and they
 *                              steady it together. The group thickens to the glyph's weight and becomes the real 夾.
 *                              (大's 横 sits lower than 夾's: the arms rising between the two glyphs IS the lift.)
 *   「才决定他能否成为侠。」   俠 — the 亻 of 他 rises out of the sentence and joins 夾 as the real 俠: the person
 *                              the line is about. Then 侠 and the big 亻 turn seal red.
 * Glyph ↔ figure changes are field morphs between shapes posed to rhyme; glyph ↔ glyph (same design) are outline
 * morphs. Figures are pictographs: round strokes and a dot head.
 */

export const INK = "#141414", PAPER = "#f1ebdf", SEAL = "#d31036";
export const DURATION = 15.5;
const CX = 640, CY = 290;

// ——— strokes and poses (unit space, centred on CX, CY; the big glyphs are 400 units) ———
interface Stroke { x0: number; y0: number; x1: number; y1: number; th: number }
interface Pose { heads: Array<[number, number, number]>; strokes: Stroke[] }
const S = (x0: number, y0: number, x1: number, y1: number, th: number): Stroke => ({ x0, y0, x1, y1, th });
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const v = clamp(x); return v * v * (3 - 2 * v); };
const hit = (x: number) => { const v = clamp(x); return v * v * (2.2 - 1.2 * v); };
const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const mixPose = (a: Pose, b: Pose, k: number): Pose => ({
  heads: a.heads.map((h, i) => [lerp(h[0], b.heads[i][0], k), lerp(h[1], b.heads[i][1], k), lerp(h[2], b.heads[i][2], k)]),
  strokes: a.strokes.map((s, i) => { const o = b.strokes[i]; return S(lerp(s.x0, o.x0, k), lerp(s.y0, o.y0, k), lerp(s.x1, o.x1, k), lerp(s.y1, o.y1, k), lerp(s.th, o.th, k)); }),
});
const mirror = (p: Pose): Pose => ({ heads: p.heads.map(([x, y, r]) => [-x, y, r]), strokes: p.strokes.map(s => S(-s.x0, s.y0, -s.x1, s.y1, s.th)) });
/** Thicker strokes (and heads): figures take on the glyph's Black weight before they become it. */
const thick = (p: Pose, f: number): Pose => ({ heads: p.heads.map(([x, y, r]) => [x, y, r * (1 + (f - 1) * 0.5)]), strokes: p.strokes.map(s => ({ ...s, th: s.th * f })) });
/** Rotate a pose about a point (balance: the sway that passes through the group). */
const turn = (p: Pose, a: number, cx: number, cy: number): Pose => {
  const c = Math.cos(a), s = Math.sin(a), r = (x: number, y: number): [number, number] => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
  return { heads: p.heads.map(([x, y, rr]) => [...r(x, y), rr] as [number, number, number]), strokes: p.strokes.map(q => { const [a0, b0] = r(q.x0, q.y0), [a1, b1] = r(q.x1, q.y1); return S(a0, b0, a1, b1, q.th); }) };
};

// Everything is authored in the FINAL frame (camera at rest, the composition sitting on 夾) and placed in depth:
// the protector near the camera (Z 1), the two behind him (Z 1.7) — size is distance, the ancient 夾's big and small
// people read as near and far. A dolly scales each depth about the principal point by Z / (Z − camZ).
// PP is the horizon point implied by the final frame: his feet (y 134, Z 1) and theirs (y 40, Z 1.7) stand on one
// ground plane only if the dolly scales about y = −94. `lift` keeps wide shots framed in the middle of the screen.
const Z_FRONT = 1, Z_BACK = 1.7, PP: [number, number] = [0, -94];
const lift = (camZ: number) => -camZ * 120;
// Figures are drawn as PEOPLE first (user correction: posing them to the glyph made a man doing the splits and two
// bodies no one can stand in). Proportions: head about 1/7 of the height, legs about half, arm span about the height,
// feet about shoulder-width. The jump to the glyph's exaggerated shapes is left to the field morph — the moment the
// people become the character.
// The protector (near; 340 tall, feet on y 134) — body (neck → hip), left arm, right arm, left leg, right leg.
const BIG_HOLD: Pose = { heads: [[0, -182, 24]], strokes: [S(0, -152, 0, -30, 30), S(-4, -132, -166, -128, 28), S(4, -132, 166, -128, 28), S(-4, -30, -66, 134, 30), S(4, -30, 66, 134, 30)] };
/** Running in from the side: body pitched forward, arms and legs swinging. */
function runner(x: number, phase: number): Pose {
  const s = Math.sin(phase), b = 6 * Math.abs(Math.cos(phase));
  return { heads: [[x + 22, -176 + b, 24]], strokes: [S(x + 14, -148 + b, x, -30 + b, 30), S(x + 12, -128 + b, x + 12 + 58 * s, -62 + b, 28),
    S(x + 12, -128 + b, x + 12 - 58 * s, -62 + b, 28), S(x, -30 + b, x + 70 * s, 134, 30), S(x, -30 + b, x - 70 * s, 134, 30)] };
}
/** Planted, knees set, arms drawn in across the chest: the wind-up before the arms fly open. */
const BRACE: Pose = { heads: [[0, -174, 24]], strokes: [S(0, -146, 0, -24, 30), S(-4, -126, 40, -82, 28), S(4, -126, -40, -82, 28), S(-4, -24, -72, 134, 30), S(4, -24, 72, 134, 30)] };
// The two (far; left — the right is the mirror), people too: about 170 tall in the final frame, feet on y 40.
const STAND: Pose = { heads: [[-122, -116, 14]], strokes: [S(-122, -100, -122, -32, 20), S(-122, -94, -138, -48, 16), S(-122, -94, -106, -48, 16), S(-124, -32, -134, 40, 18), S(-120, -32, -110, 40, 18)] };
/** Shrinking down, knees bent, both hands up over the head. */
const COWER: Pose = { heads: [[-128, -72, 14]], strokes: [S(-127, -58, -134, -2, 20), S(-126, -64, -146, -96, 16), S(-126, -64, -106, -96, 16), S(-134, -2, -152, 40, 18), S(-134, -2, -114, 40, 18)] };
/** Behind him, looking out from under his arm, one hand up on it. */
const SMALL_HOLD: Pose = { heads: [[-112, -114, 14]], strokes: [S(-114, -98, -118, -32, 20), S(-116, -92, -136, -50, 16), S(-112, -92, -88, -124, 16), S(-120, -32, -130, 40, 18), S(-116, -32, -104, 40, 18)] };
/** The menace: long shadows of people standing on the camera's side, cast toward the two. */
const BULLY: Pose = { heads: [[0, -300, 26]], strokes: [S(0, -272, 0, -120, 34), S(-6, -250, -74, -150, 30), S(6, -250, 74, -150, 30), S(-4, -120, -40, 0, 34), S(4, -120, 40, 0, 34)] };
const project = (p: Pose, Z: number, camZ: number): Pose => {
  const m = Z / (Z - camZ), dy = lift(camZ), f = (x: number, y: number): [number, number] => [PP[0] + (x - PP[0]) * m, PP[1] + (y - PP[1]) * m + dy];
  return { heads: p.heads.map(([x, y, r]) => [...f(x, y), r * m] as [number, number, number]), strokes: p.strokes.map(q => { const [a0, b0] = f(q.x0, q.y0), [a1, b1] = f(q.x1, q.y1); return S(a0, b0, a1, b1, q.th * m); }) };
};
/** A standing figure laid down as a cast shadow from `base` (feet) toward `tip` (head), `len` 0..1 of the way. */
function shadow(base: [number, number], tip: [number, number], len: number): Pose {
  const dx = tip[0] - base[0], dy = tip[1] - base[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const f = (x: number, y: number): [number, number] => { const v = -y / 320, w = 1.6 * (1 - 0.45 * v); return [base[0] + ux * v * L * len + nx * x * w, base[1] + uy * v * L * len + ny * x * w]; };
  return { heads: BULLY.heads.map(([x, y, r]) => [...f(x, y), r * 1.2 * (1 - 0.4 * (-y / 320))] as [number, number, number]),
    strokes: BULLY.strokes.map(q => { const [a0, b0] = f(q.x0, q.y0), [a1, b1] = f(q.x1, q.y1); return S(a0, b0, a1, b1, q.th * 2.4 * (1 - 0.4 * (-(q.y0 + q.y1) / 640))); }) };
}

// ——— glyphs ———
const glyph = (ch: string, set = black) => layoutText(set as GlyphSet, ch, { at: [0, 0], size: 400 })[0].shape;
const jiaSolo = glyph("夾"), xia = glyph("俠");
const left = (p: Shape["pieces"][number]) => Math.min(...p.outer.map(q => q[0]));
const xiaRen: Shape = { pieces: xia.pieces.filter(p => left(p) < -150) };
const xiaJia: Shape = { pieces: xia.pieces.filter(p => left(p) >= -150) };
const line1 = layoutText(medium as GlyphSet, "拥有力量，只是强者；", { at: [CX, 578], size: 38, tracking: 0.08 });
const line2 = layoutText(medium as GlyphSet, "如何使用力量，才决定他能否成为侠。", { at: [CX, 640], size: 38, tracking: 0.08 });
const TA = line2.findIndex(s => s.ch === "他");
// 他 = 亻 + 也: the 亻 is the leftmost outline piece.
const taPieces = [...line2[TA].shape.pieces].sort((a, b) => left(a) - left(b));
const taRen: Shape = { pieces: taPieces.slice(0, 1) }, taYe: Shape = { pieces: taPieces.slice(1) };

// 夾 makes room: first it moves and narrows as a whole (the glyph does not change), then — once it nearly sits on
// 俠's right part — a short outline morph settles the small design differences. (A direct outline morph twisted it.)
const bbox0 = (sh: Shape) => { const xs = sh.pieces.flatMap(p => p.outer.map(q => q[0])), ys = sh.pieces.flatMap(p => p.outer.map(q => q[1]));
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; };
const ja = bbox0(jiaSolo), jb = bbox0(xiaJia);
const JIA_FIT = { sx: (jb.x1 - jb.x0) / (ja.x1 - ja.x0), sy: (jb.y1 - jb.y0) / (ja.y1 - ja.y0), dx: (jb.x0 + jb.x1) / 2 - (ja.x0 + ja.x1) / 2, dy: (jb.y0 + jb.y1) / 2 - (ja.y0 + ja.y1) / 2 };
const jiaAt = (k: number) => { const sx = lerp(1, JIA_FIT.sx, k), sy = lerp(1, JIA_FIT.sy, k), cx = (ja.x0 + ja.x1) / 2, cy = (ja.y0 + ja.y1) / 2;
  return mapShape(jiaSolo, ([x, y]) => [cx + (x - cx) * sx + JIA_FIT.dx * k, cy + (y - cy) * sy + JIA_FIT.dy * k]); };

// The 亻 of 他 (medium, small, in the line) → the 亻 of 俠 (black, big). Morph the shape where it lands (the small
// one scaled onto the big one's box) and carry it there along an arc.
const bbox = (sh: Shape) => { const xs = sh.pieces.flatMap(p => p.outer.map(q => q[0])), ys = sh.pieces.flatMap(p => p.outer.map(q => q[1]));
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; };
const renTarget: Shape = mapShape(xiaRen, ([x, y]) => [x + CX, y + CY]);
const bs = bbox(taRen), bt = bbox(renTarget);
const FLY_S = (bt.y1 - bt.y0) / (bs.y1 - bs.y0);
const FLY_FROM: Vec2 = [(bs.x0 + bs.x1) / 2, (bs.y0 + bs.y1) / 2], FLY_TO: Vec2 = [(bt.x0 + bt.x1) / 2, (bt.y0 + bt.y1) / 2];
const renLanded = mapShape(taRen, ([x, y]) => [FLY_TO[0] + (x - FLY_FROM[0]) * FLY_S, FLY_TO[1] + (y - FLY_FROM[1]) * FLY_S]);
const renGrow = morphShapes(renLanded, renTarget);

// ——— geometry helpers ———
function strokeRing(s: Stroke, n = 10): Array<[number, number]> {
  const a = Math.atan2(s.y1 - s.y0, s.x1 - s.x0), r = s.th / 2, pts: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) { const u = a - Math.PI / 2 + Math.PI * i / n; pts.push([s.x1 + r * Math.cos(u), s.y1 + r * Math.sin(u)]); }
  for (let i = 0; i <= n; i++) { const u = a + Math.PI / 2 + Math.PI * i / n; pts.push([s.x0 + r * Math.cos(u), s.y0 + r * Math.sin(u)]); }
  return pts;
}
const segDist = (s: Stroke, x: number, y: number) => {
  const dx = s.x1 - s.x0, dy = s.y1 - s.y0, l2 = dx * dx + dy * dy || 1, u = clamp(((x - s.x0) * dx + (y - s.y0) * dy) / l2);
  return Math.hypot(x - s.x0 - u * dx, y - s.y0 - u * dy);
};
const insidePose = (p: Pose, x: number, y: number) => p.heads.some(([hx, hy, r]) => Math.hypot(x - hx, y - hy) < r) || p.strokes.some(s => segDist(s, x, y) < s.th / 2);
function inRing(r: ReadonlyArray<readonly [number, number]>, x: number, y: number) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; }
  return c;
}
const insideShape = (sh: Shape, x: number, y: number) => sh.pieces.some(p => inRing(p.outer, x, y) && !p.holes.some(h => inRing(h, x, y)));
type Rings = ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
const ringsOf = (sh: { pieces: ReadonlyArray<{ outer: ReadonlyArray<readonly [number, number]>; holes: Rings }> }): Rings => sh.pieces.flatMap(p => [p.outer, ...p.holes]);

function poseFill(ctx: CanvasRenderingContext2D, ps: Pose[], color: string) {
  const path = new Path2D();
  for (const p of ps) {
    for (const [x, y, r] of p.heads) { path.moveTo(x + r, y); path.arc(x, y, r, 0, Math.PI * 2); }
    for (const s of p.strokes) { const ring = strokeRing(s); path.moveTo(...ring[0]); for (const q of ring) path.lineTo(...q); path.closePath(); }
  }
  ctx.fillStyle = color; ctx.fill(path, "nonzero");
}
function ringsFill(ctx: CanvasRenderingContext2D, rings: Rings, color: string) {
  const path = new Path2D();
  for (const r of rings) { path.moveTo(r[0][0], r[0][1]); for (const q of r) path.lineTo(q[0], q[1]); path.closePath(); }
  ctx.fillStyle = color; ctx.fill(path, "evenodd");
}

// ——— field morphs (glyph ↔ posed figures): lazy, cached on a 1/240 grid, rasterised inside-tests ———
type FM = { at(k: number): Array<Array<[number, number]>> };
interface Side { poses?: Pose[]; shape?: Shape }
function lazyMorph(c: Vec2, half: number, a: Side, b: Side, n = 300) {
  let fm: FM | null = null; const cache = new Map<number, Array<Array<[number, number]>>>();
  const test = (side: Side) => rasterInside(c, half, n, ctx => side.poses ? poseFill(ctx, side.poses, "#000") : ringsFill(ctx, ringsOf(side.shape!), "#000"))
    ?? ((p: Vec2) => side.poses ? side.poses.some(q => insidePose(q, p[0], p[1])) : insideShape(side.shape!, p[0], p[1]));
  return (k: number) => {
    fm ??= fieldMorph(c, half, n, test(a), test(b), 0.2) as unknown as FM;
    const q = Math.round(clamp(k) * 240);
    if (!cache.has(q)) cache.set(q, fm.at(q / 240));
    return cache.get(q)!;
  };
}
const GROUP_W = 1.45;
const groupHold = (): Pose[] => [BIG_HOLD, SMALL_HOLD, mirror(SMALL_HOLD)];
// The fitted 夾 and 俠's 夾 overlap almost everywhere: a field morph (an outline morph twisted it).
const jiaSettle = lazyMorph([52, 0], 240, { shape: jiaAt(1) }, { shape: xiaJia }, 520);   // fine grid: two glyphs, crisp edges
const groupToJia = lazyMorph([0, 0], 250, { poses: groupHold().map(p => thick(p, GROUP_W)) }, { shape: jiaSolo });

// ——— the timeline (seconds) ———
type W = readonly [number, number];
const T: Record<string, W> = {
  creep: [0.6, 3.0], cower: [1.2, 2.3],
  run: [2.7, 3.9], brace: [3.5, 4.28], open: [4.28, 4.6], retreat: [4.62, 5.4], peekL: [4.85, 5.65], peekR: [5.05, 5.85],
  weight: [7.0, 7.45], jia: [7.4, 8.5],
  line1: [8.7, 9.5], line2a: [9.5, 10.2], line2b: [10.4, 11.2],
  room: [10.9, 11.55], settle: [11.55, 11.97], fly: [11.6, 12.85], back: [12.95, 13.35], red: [13.5, 14.1],
};
// Camera: hold wide; push in on the two (menace); creep while he runs in; jolt back when his arms fly open (the threat
// is stopped); then a calm push to the frame where the three ARE 夾.
// Closer than the final frame while the two are the subject (so he, nearer still, comes in BIG), a menacing push
// toward them, a jolt back as his arms fly open, then a calm settle onto the frame where the three are 夾.
//   menace push on the two → he bursts in and the camera gives way (he must fit the frame) → held still while he
//   braces and throws his arms open (the moment must read) → only THEN the jolt back, and the shadows go.
const camZ = curve([{ t: 0, v: 0.22 }, { t: 0.4, v: 0.22, d: 0 }, { t: 2.7, v: 0.5, d: 0 }, { t: 3.6, v: 0.3, d: 0 },
  { t: 4.62, v: 0.3, d: 0 }, { t: 5.0, v: -0.15, d: 0 }, { t: 6.0, v: -0.08, d: 0.04 }, { t: 7.0, v: 0, d: 0 }]);
const sp = (t: number, w: W) => span(t, w[0], w[1]);

export function drawXia(ctx: CanvasRenderingContext2D, t: number) {
  if (t > 0.15) groupToJia(0);                    // build the fields on still frames (no freeze when they run)
  if (t > 8.55) jiaSettle(0);
  ctx.fillStyle = PAPER;
  ctx.fillRect(-4000, -4000, 10000, 10000);

  ctx.save();
  ctx.translate(CX, CY);
  if (t < T.jia[0]) {
    const cz = camZ(t), w = smooth(sp(t, T.weight));
    // ——— the menace: long shadows creep toward the two; they shrink back when his arms open ———
    const len = smooth(sp(t, T.creep)) * (1 - hit(sp(t, T.retreat)));
    if (len > 0.01) {
      const feetY = PP[1] + (40 - PP[1]) * Z_BACK / (Z_BACK - cz) + lift(cz);
      ctx.save(); ctx.filter = "blur(5px)";                        // cast shadows: soft-edged masses, not drawings
      [[-360, -0.9], [20, 0.05], [340, 0.95]].forEach(([bx, aim]) =>
        poseFill(ctx, [shadow([bx, 520], [aim * 150 * Z_BACK / (Z_BACK - cz), feetY + 26], len * 0.95)], "rgba(20,20,20,0.17)"));
      ctx.restore();
    }
    // ——— the two, behind (farther: smaller, a little paler) ———
    const cower = hit(sp(t, T.cower));
    const two = [hit(sp(t, T.peekL)), hit(sp(t, T.peekR))].map((pk, i) => {
      const p = mixPose(mixPose(STAND, COWER, cower), SMALL_HOLD, pk);
      return thick(project(i ? mirror(p) : p, Z_BACK, cz), lerp(1, GROUP_W, w));
    });
    poseFill(ctx, two, mixColor(INK, PAPER, 0.2 * (1 - w)));
    // ——— the protector, near the camera ———
    if (t > T.run[0]) {
      const k = sp(t, T.run), x = lerp(-860, 0, 1 - (1 - k) * (1 - k)), phase = (t - T.run[0]) * 10 * (1 - 0.5 * k);
      let me = runner(x, phase);
      me = mixPose(me, BRACE, hit(sp(t, T.brace)));
      me = mixPose(me, BIG_HOLD, hit(sp(t, T.open)));
      poseFill(ctx, [thick(project(me, Z_FRONT, cz), lerp(1, GROUP_W, w))], INK);
    }
  } else if (t < T.jia[1]) ringsFill(ctx, groupToJia(sp(t, T.jia)), INK);
  else {
    // ——— 夾, then 俠 ———
    const room = hit(sp(t, T.room)), settle = smooth(sp(t, T.settle)), red = smooth(sp(t, T.red));
    // The field morph is only the in-between: once settled, the real vector glyph (a traced field is stair-stepped).
    ringsFill(ctx, settle >= 1 ? ringsOf(xiaJia) : settle > 0 ? jiaSettle(settle) : room > 0 ? ringsOf(jiaAt(room)) : ringsOf(jiaSolo), INK);
    if (t >= T.fly[1]) ringsFill(ctx, ringsOf(xiaRen), mixColor(INK, SEAL, red));
  }
  ctx.restore();

  // ——— the 亻 of 他 flies up into 俠 ———
  if (t >= T.fly[0] && t < T.fly[1]) {
    // It grows as soon as it leaves the line (ease-out) and takes on the Black weight early, so it reads in flight;
    // the path itself still eases in and lands.
    // 他 sits right under 夾, so a straight flight crosses it (black on black: the 亻 vanished). Instead: up out of the
    // line into the paper lane between 夾 and the text, left along it at the text's own size, and only once clear of
    // 夾 up into its place, growing and taking on the Black weight. A cubic curve keeps it moving (no stops).
    const k = sp(t, T.fly), u = k * k * (3 - 2 * k), lane = 522;
    // Past 夾's left edge along the lane, then up-right into place: it grows on 夾's left, never over it.
    const P = [FLY_FROM, [FLY_FROM[0], lane - 10], [FLY_TO[0] - 150, lane], FLY_TO] as const, w = [(1 - u) ** 3, 3 * u * (1 - u) ** 2, 3 * u * u * (1 - u), u ** 3];
    const cx = w.reduce((a, wi, i) => a + wi * P[i][0], 0), cy = w.reduce((a, wi, i) => a + wi * P[i][1], 0);
    const ks = smooth((u - 0.5) / 0.5), kw = smooth((u - 0.5) / 0.4);
    const sc = Math.exp(Math.log(1 / FLY_S) * (1 - ks));
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-FLY_TO[0], -FLY_TO[1]);
    ctx.fillStyle = INK; ctx.fill(framePath(renGrow.at(kw)), "evenodd");
    ctx.restore();
  }

  // ——— the line, rolled in character by character ———
  const roll = (slots: typeof line1, from: number, to: number, w: W) => {
    for (let i = from; i < to; i++) {
      const s = slots[i], k = hit(span(t, w[0] + (i - from) * 0.05, w[0] + (i - from) * 0.05 + 0.5));
      if (k <= 0) continue;
      ctx.save();
      ctx.beginPath(); ctx.rect(s.x - 4, s.center[1] - 30, s.width + 8, 60); ctx.clip();
      ctx.translate(0, (1 - k) * 44);
      const color = s.ch === "侠" ? mixColor(INK, SEAL, smooth(sp(t, T.red))) : INK;
      if (slots === line2 && i === TA && t >= T.fly[0]) {
        // 他 lends its 亻 to the big glyph and gets it back once 俠 stands.
        ringsFill(ctx, ringsOf(taYe), color);
        const back = hit(sp(t, T.back));
        if (back > 0) { ctx.translate(0, (1 - back) * 40); ringsFill(ctx, ringsOf(taRen), color); }
      } else { ctx.fillStyle = color; ctx.fill(framePath(s.shape), "evenodd"); }
      ctx.restore();
    }
  };
  roll(line1, 0, line1.length, T.line1);
  roll(line2, 0, 7, T.line2a);
  roll(line2, 7, line2.length, T.line2b);
}

export const scene: MorphScene = {
  id: "mm-xia",
  title: "MM73 · 俠：大（强者）→ 三人相扶成「夾」→「他」的亻飞入成「俠」",
  duration: DURATION,
  draw: drawXia,
};
