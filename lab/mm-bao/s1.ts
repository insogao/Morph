import { fromPath, mapShape, type Shape } from "../../packages/morph-engine/src/vector/shape";
import { k, landings, pose, type Key, type Pose } from "../mm-and/player";
import { G, HEIGHT, bodyAt, placer, pop, type Change, type Pop, type Rad } from "./bodies";
import {
  ACC, CREAM, INK, P1, P2, TAU, box, clamp, dust, fillRings, glyphFoot, heavy, lazyFieldMorph, lerp, outBack, outQuad, pathOf, smooth, span, thin, type V,
} from "./common";
import { DESCENT, ELEV, FLOOR, MX, SHAFT_X, Y2, elevTop, shaftRect } from "./world";

/*
 * Title + LEVEL 1 · 偏旁 (radicals), a paper side-scroller in the plane z = 0.
 *   Title — a hairline 包 gains weight and divides like a cell: 包 → 包包, the two players.
 *   偏旁 — 1P jumps into a floating 氵 and becomes 泡, a bubble that floats; 2P rides it across a pit of spikes. The
 *   bubble pops at the far side. 2P catches a 火 and becomes 炮: 1P climbs onto the cannon and is fired onto a gate,
 *   闩 — a door with its bolt across. 1P stamps; the bolt drops out (闩 → 门) and the door swings open for 2P. 1P
 *   swallows a 饣 — 饱, big and heavy — and lands on the elevator: its sign flips 上 → 下 and down they go.
 */
// ——— title ———
const TITLE_SIZE = 240;
const BAO_THIN = glyphFoot(thin, "包", [0, FLOOR], TITLE_SIZE), BAO = glyphFoot(heavy, "包", [0, FLOOR], TITLE_SIZE);
export const X1 = -64, X2 = 64;
const weight = lazyFieldMorph(() => BAO_THIN, () => BAO, [0, FLOOR - 112], 170, 300);
export const MORPHED = 1.6;

// ——— level 1 layout ———
export const PIT: V = [900, 1500];
const PIT_FLOOR = FLOOR + 250;
const GX = 2250, GSIZE = 520;                                    // the gate
const gateRaw = fromPath(heavy.glyphs["闩"].d), gb = box(gateRaw), GK = GSIZE / 1000, gcx = (gb.x0 + gb.x1) / 2;
const gx = (x: number) => GX + (x - gcx) * GK, gy = (y: number) => FLOOR + (y - gb.y1) * GK;
const GATE = glyphFoot(heavy, "闩", [GX, FLOOR], GSIZE);
const boltIx = GATE.pieces.map((p, i) => ({ i, h: box({ pieces: [p] } as Shape) })).sort((a, b) => (a.h.y1 - a.h.y0) - (b.h.y1 - b.h.y0))[0].i;
const FRAME: Shape = { pieces: GATE.pieces.filter((_, i) => i !== boltIx) } as Shape, BOLT: Shape = { pieces: [GATE.pieces[boltIx]] } as Shape;
const BB = box(BOLT);
export const GATE_TOP = gy(-829);
const PANEL = { x0: gx(232), x1: gx(800), y0: gy(-560), y1: FLOOR };
export const UNBOLT = 22;
// the cannon: 2P as 炮 tilts up and fires 1P onto the gate
const CAN_X = 1840, FIRE = 20;
const tilt = (b: number) => -0.5 * smooth(span(b, 19.2, 19.8)) * (1 - smooth(span(b, 20.6, 21.3)));
const recoil = (b: number) => -40 * Math.sin(Math.PI * span(b, FIRE, FIRE + 0.4)) * (b > FIRE ? 1 : 0);
const canPose = (b: number): Pose => ({ x: CAN_X + recoil(b), y: FLOOR, z: 0, sx: 1, sy: 1, rot: tilt(b), dir: 1 });
const muzzle = (b: number) => placer(canPose(b), 1)([0, -HEIGHT]);
const M20 = muzzle(FIRE);

// ——— the radicals and the changes ———
export const BODY1: Change[] = [{ b: -99, to: "包" }, { b: 11, to: "泡" }, { b: 15.5, to: "包" }, { b: 25, to: "饱", dur: 0.5 }, { b: 29.2, to: "包", dur: 0.5 }];
export const BODY2: Change[] = [{ b: -99, to: "包" }, { b: 17.5, to: "炮" }, { b: 20.6, to: "包" }];
const apex = (x: number, h: number): V => [x - 0.33 * 110, FLOOR - h - 0.475 * 110];
export const RADS1: Rad[] = [
  { ch: "氵", who: 0, grab: 11, drop: 15.5, fly: [-60, -380], hover: apex(820, 170) },
  { ch: "火", who: 1, grab: 17.5, drop: 20.6, fly: [-200, -520], hover: apex(1770, 160) },
  { ch: "饣", who: 0, grab: 25, drop: 29.2, fly: [-120, -460], hover: apex(2605, 150) },
];
export const POPS1: Pop[] = [
  pop(11.1, "包 + 氵 = 泡", P1), pop(17.6, "包 + 火 = 炮", P2), pop(22.1, "闩 → 门", ACC), pop(25.1, "包 + 饣 = 饱", P1), pop(27.4, "上 → 下", ACC),
];

// ——— the tracks (plane z = 0; the last keys jump into the 口 of 入口, z > 0) ———
const ride = (b: number) => 6 * Math.sin(Math.PI * (b - 12.5));
export const TRACK1: Key[] = [
  k(-10, X1, FLOOR, "hold"), k(7.5, X1, FLOOR, "hold"),
  k(8.5, 140, FLOOR, "jump", { h: 120 }),                                  // leapfrog over 2P
  k(10.5, 740, FLOOR),
  k(11, 820, FLOOR - 170, "jump", { h: 20, soft: true }),                  // into the 氵 → 泡
  k(12.5, 900, FLOOR - 150, "ease", { soft: true }),
  k(15.5, 1600, FLOOR - 80, "ease"),                                     // float over the pit, 2P aboard
  k(16, 1600, FLOOR, "fall"), k(17.5, 1640, FLOOR, "hold"), k(18.5, 1730, FLOOR),
  k(19, CAN_X, FLOOR - HEIGHT, "jump", { h: 80 }),                        // onto the cannon
  k(FIRE, M20[0], M20[1], "hold"),
  k(21.5, GX + 60, GATE_TOP, "jump", { h: 200, spin: 1 }),               // fired onto the gate
  k(21.75, GX + 60, GATE_TOP - 46, "ease"), k(UNBOLT, GX + 60, GATE_TOP, "fall"),   // the stamp
  k(23, GX + 60, GATE_TOP, "hold"), k(24, 2540, FLOOR, "jump", { h: 80 }),
  k(24.5, 2540, FLOOR, "hold"), k(25.5, 2650, FLOOR, "jump", { h: 150 }),   // into the 饣 → 饱
  k(26, 2650, FLOOR, "hold"), k(27, 2950, FLOOR, "fall"),                // the heavy landing on the elevator
  k(31, 2950, Y2, "hold"),
  k(31.5, 2950, Y2, "hold"), k(33.6, 3540, Y2), k(34, 3540, Y2, "hold"),
  k(35, MX - 20, Y2 - 100, "jump", { h: 120, z: 90 }),                   // into the pipe
  k(36, MX - 20, Y2 - 100, "hold", { z: 90 }),
];
export const TRACK2: Key[] = [
  k(-10, X2, FLOOR, "hold"), k(8.4, X2, FLOOR, "hold"),
  k(11.5, 780, FLOOR), k(12.5, 900, FLOOR - 150 - HEIGHT, "jump", { h: 90 }),   // onto the bubble
  k(15.5, 1600, FLOOR - 80 - HEIGHT, "hold"), k(16.3, 1700, FLOOR, "fall"),
  k(17, 1700, FLOOR, "hold"), k(18, CAN_X, FLOOR, "jump", { h: 160 }),          // into the 火 → 炮
  k(22.3, CAN_X, FLOOR, "hold"), k(24.2, 2470, FLOOR),                     // through the opened door
  k(25.5, 2470, FLOOR, "hold"), k(26.5, 2790, FLOOR, "jump", { h: 110 }),   // onto the elevator
  k(31, 2790, Y2, "hold"),
  k(31.8, 2790, Y2, "hold"), k(34.1, 3420, Y2), k(34.5, 3420, Y2, "hold"),
  k(35.5, MX + 30, Y2 - 100, "jump", { h: 150, z: 90 }),
  k(36.5, MX + 30, Y2 - 100, "hold", { z: 90 }),
];
const LAND1 = landings(TRACK1), LAND2 = landings(TRACK2);

/** Poses of both players in level 1 (and the hall, until they enter the pipe), with the shared moments. */
export function players1(b: number): [Pose, Pose] {
  const e = pose(TRACK1, b), t = pose(TRACK2, b);
  // the bubble bobs; 2P rides on it; it gives under 2P's landing
  if (b >= 12.5 && b < 15.5) e.y += ride(b);
  const give = Math.sin(Math.PI * span(b, 12.5, 13.2)) * (b > 12.5 && b < 13.2 ? 1 : 0);
  if (give > 0) { e.sy *= 1 - 0.32 * give; e.sx = 1 / Math.sqrt(e.sy); }
  if (b >= 12.5 && b < 15.5) { t.x = e.x; t.y = e.y - HEIGHT * e.sy; }
  // the cannon: 2P tilts and recoils; 1P sits on its muzzle until the shot
  if (b >= 18.2 && b < 22.3) { const c = canPose(b); t.x = c.x; t.rot = c.rot; }
  if (b >= 19 && b < FIRE) { const m = muzzle(b), u = smooth(span(b, 19, 19.25)); e.x = lerp(e.x, m[0], u); e.y = lerp(e.y, m[1], u); e.rot = lerp(e.rot, tilt(b), u); }
  // on the elevator
  if (b >= 26.5 && b < 31) t.y = elevTop(b);
  if (b >= 27 && b < 31) e.y = elevTop(b);
  // into the pipe: depth only in the last moment of the jump (they dive through the mouth)
  for (const [p, at] of [[e, 35], [t, 35.5]] as const) if (b > at - 1 && b < at + 1) p.z = 90 * smooth(span(b, at - 0.32, at));
  return [e, t];
}
export const body1 = (b: number) => bodyAt(BODY1, b), body2 = (b: number) => bodyAt(BODY2, b);

// ——— camera: follows both with a lag, pulls out to keep both in frame ———
export function camera1(b: number): { x: number; y: number; z: number } {
  let x = 0, y = 0, sp = 0; const n = 10;
  for (let j = 0; j < n; j++) {
    const [e, t] = players1(b - j * 0.09);
    x += (e.x + t.x) / 2; y += (e.y + t.y) / 2 - 50; sp += Math.max(Math.abs(e.x - t.x) * 0.56, Math.abs(e.y - t.y));
  }
  x /= n; y /= n; sp /= n;
  const title = 1 - smooth(span(b, 6.5, 9.5));
  let z = Math.min(1, clamp(560 / (sp + 260)) * 0.6 + 0.4);
  x = lerp(x, 0, title); y = lerp(y, -10, title); z = lerp(z, 1.6, title);
  return { x, y, z };
}

// ——— drawing (world transform already set) ———
export function drawLevel1(ctx: CanvasRenderingContext2D, b: number, cam: { x: number; y: number; z: number }) {
  const hw = 720 / cam.z, hh = 420 / cam.z;
  ctx.fillStyle = CREAM; ctx.fillRect(cam.x - hw, cam.y - hh, 2 * hw, 2 * hh);
  // the earth below the line, the pit, the shaft
  ctx.fillStyle = INK; ctx.fillRect(cam.x - hw, FLOOR, 2 * hw, Math.max(0, cam.y + hh - FLOOR));
  ctx.fillStyle = CREAM; ctx.fillRect(PIT[0], FLOOR - 1, PIT[1] - PIT[0], PIT_FLOOR - FLOOR + 1);
  ctx.fillStyle = INK;
  for (let x = PIT[0] + 6; x < PIT[1] - 40; x += 48) { ctx.beginPath(); ctx.moveTo(x, PIT_FLOOR); ctx.lineTo(x + 21, PIT_FLOOR - 46); ctx.lineTo(x + 42, PIT_FLOOR); ctx.fill(); }
  ctx.fillStyle = "#26262b"; ctx.fill(pathOf(shaftRect));
  // the title: hairline 包 → heavy → divides in two
  if (b < MORPHED) {
    if (b < -1) { ctx.globalAlpha = smooth(span(b, -3.6, -1.6)); ctx.fillStyle = INK; ctx.fill(pathOf(BAO_THIN), "evenodd"); ctx.globalAlpha = 1; }
    else if (b < 0) fillRings(ctx, weight(smooth(span(b, -1, 0))), INK, 1);
    else {
      // division: the big 包 shrinks to player size while two copies peel apart, ink turning into the two colours
      const u = smooth(span(b, 0, 1.1)), apart = outBack(span(b, 0.35, MORPHED)), k2 = lerp(TITLE_SIZE / 110, 1, u);
      const stretch = 1 + 0.22 * Math.sin(Math.PI * span(b, 0.35, 1.25));
      for (const [i, x, col] of [[0, X1, P1], [1, X2, P2]] as const) {
        ctx.save(); ctx.translate(x * apart, FLOOR); ctx.scale(k2 * stretch, k2 / stretch);
        const sh = G("包");
        ctx.fillStyle = INK; ctx.globalAlpha = i === 0 ? 1 - smooth(span(b, 0.2, 0.9)) : 0; ctx.fill(pathOf(sh), "evenodd");
        ctx.fillStyle = col; ctx.globalAlpha = smooth(span(b, 0.2, 0.9)) * (i === 0 ? 1 : smooth(span(b, 0.3, 0.6))); ctx.fill(pathOf(sh), "evenodd");
        ctx.restore(); ctx.globalAlpha = 1;
      }
    }
  }
  // the gate: a door panel behind the bolt; the bolt drops out, the door swings open
  const open = outBack(span(b, UNBOLT + 0.15, UNBOLT + 0.75));
  ctx.fillStyle = "#c9bea6";
  ctx.fillRect(PANEL.x0, PANEL.y0, (PANEL.x1 - PANEL.x0) * lerp(1, 0.1, open), PANEL.y1 - PANEL.y0);
  ctx.fillStyle = INK; ctx.fill(pathOf(FRAME), "evenodd");
  {
    const a = Math.max(0, b - UNBOLT), fall = Math.min(FLOOR - BB.y1, 0.5 * 2600 * (a / 2) ** 2 * 4);
    const bounce = a > 0 && fall >= FLOOR - BB.y1 ? 10 * Math.abs(Math.sin(Math.PI * span(a, 0.55, 0.85))) : 0;
    const cx = (BB.x0 + BB.x1) / 2, cy = (BB.y0 + BB.y1) / 2, slide = 30 * outQuad(span(a, 0, 0.3));
    ctx.save(); ctx.translate(cx + slide, cy + fall - bounce); ctx.rotate(-0.12 * smooth(span(a, 0, 0.5))); ctx.translate(-cx, -cy); ctx.fill(pathOf(BOLT), "evenodd"); ctx.restore();
  }
  dust(ctx, [GX + 60, GATE_TOP], b - UNBOLT, INK, 220, 1.4);
  // the shot: a flash at the muzzle on the beat
  const f = span(b, FIRE, FIRE + 0.45);
  if (f > 0 && f < 1) {
    const m = M20, a = tilt(FIRE) - Math.PI / 2;
    ctx.fillStyle = ACC; ctx.globalAlpha = 1 - f;
    for (let i = 0; i < 7; i++) {
      const ang = a + (i - 3) * 0.32, r0 = 30 + 40 * outQuad(f), r1 = r0 + 60 * (1 - f) + 12;
      ctx.beginPath(); ctx.moveTo(m[0] + Math.cos(ang - 0.08) * r0, m[1] + Math.sin(ang - 0.08) * r0); ctx.lineTo(m[0] + Math.cos(ang) * r1, m[1] + Math.sin(ang) * r1); ctx.lineTo(m[0] + Math.cos(ang + 0.08) * r0, m[1] + Math.sin(ang + 0.08) * r0); ctx.fill();
    }
    ctx.strokeStyle = INK; ctx.lineWidth = 4 * (1 - f) + 1; ctx.beginPath(); ctx.arc(m[0], m[1], 20 + 70 * outQuad(f), 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
  }
}

/** The bubble around 1P while it is 泡, and its pop. */
export function drawBubble(ctx: CanvasRenderingContext2D, b: number, e: Pose) {
  const on = smooth(span(b, 11, 11.4));
  if (b < 11 || b > 16.2) return;
  const cx = e.x, cy = e.y - HEIGHT / 2, r = 86;
  if (b < 15.5) {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(e.sx * lerp(0.6, 1, on), e.sy * lerp(0.6, 1, on));
    ctx.strokeStyle = P1; ctx.globalAlpha = 0.55 * on; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.8 * on; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, r - 16, -2.2, -1.5); ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1;
  } else {
    const a = span(b, 15.5, 16.1);
    ctx.strokeStyle = P1; ctx.lineWidth = 5 * (1 - a) + 1; ctx.globalAlpha = 1 - a;
    for (let i = 0; i < 10; i++) { const ang = i / 10 * TAU, rr = r + 70 * outQuad(a); ctx.beginPath(); ctx.arc(cx, cy, rr, ang, ang + 0.3); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
}

/** The elevator's sign: a 上 on a post that flips over (around its horizontal axis) to 下 when the heavy one lands. */
const SIGN_UP = glyphFoot(heavy, "上", [0, 0], 64), SIGN_DOWN = glyphFoot(heavy, "下", [0, 0], 64);
export function signRings(b: number): { rings: Array<Array<[number, number]>>; post: Array<Array<[number, number]>> } {
  const top = elevTop(b), x = ELEV.x1 - 22, u = smooth(span(b, 27.15, 27.75)), c = Math.cos(Math.PI * u);
  const g = u < 0.5 ? SIGN_UP : SIGN_DOWN, gb2 = box(g), cy = (gb2.y0 + gb2.y1) / 2, py = top - 200;
  const rings = g.pieces.flatMap(p => [p.outer, ...p.holes]).map(r => r.map(([gx2, gy2]) => [x + gx2, py + cy + (gy2 - cy) * Math.abs(c)] as [number, number]));
  const post = [[[x - 4, top], [x + 4, top], [x + 4, py + 40], [x - 4, py + 40]]] as Array<Array<[number, number]>>;
  const plate = [[[x - 46, py + cy - 44 * Math.abs(c)], [x + 46, py + cy - 44 * Math.abs(c)], [x + 46, py + cy + 44 * Math.abs(c)], [x - 46, py + cy + 44 * Math.abs(c)]]] as Array<Array<[number, number]>>;
  return { rings, post: [...post, ...plate] };
}
export { LAND1, LAND2, DESCENT, SHAFT_X };
export const prewarm1 = () => { weight(0.5); };
