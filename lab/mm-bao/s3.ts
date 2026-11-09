import { liquidPath, type LiquidMass } from "../../packages/morph-engine/src/effects/liquid";
import { mapShape, type Shape } from "../../packages/morph-engine/src/vector/shape";
import { k, landings, pose, type Key, type Pose } from "../mm-and/player";
import { HEIGHT, bodyAt, pop, type Change, type Pop, type Rad } from "./bodies";
import {
  ACC, CREAM, ICE, INK, P1, P2, SUN, WATER, box, clamp, dust, glyphFoot, heavy, inQuad, lazyFieldMorph, lerp, mix, outBack, outQuad, pathOf, rng, smooth, span, type V,
} from "./common";
import { BODY1, BODY2 } from "./s1";
import { HOLE, TUBE, Y2, ZC } from "./world";

/*
 * LEVEL 3 · 变化 (change) — the world's words change state, on the beat, under the players' feet. Plane x = X3,
 * coordinates (u, v) = (world z, world y).
 *   冰 → 水: a bridge of ice tiles over water; each tile, once both have left it, loses its 冫 (the two drops fall)
 *   and is 水 — water — and sinks into the water it now is.
 *   一 → 二 → 三: a ladder that counts up, one bar a beat, just ahead of the climbers.
 *   日 + 一 = 旦: at the top they stand on a bar, the sun 日 rises behind them onto it — 旦, dawn — and the dark goes.
 *   扌 + 包 = 抱: a hand comes down; 1P takes it and becomes the arms, 2P is the 包 held: 抱, a hug. As one glyph
 *   they make the jump to the goal that neither could.
 */
// ——— the bridge ———
export const WATER_U: V = [3880, 5060];
const WS = Y2 + 18;
const ICE_U = [4000, 4230, 4460, 4690, 4920];
const ICE_SIZE = 150;
const iceAt = (u: number) => glyphFoot(heavy, "冰", [u, WS + 30], ICE_SIZE);
const ICE0 = iceAt(0), IB = box(ICE0);
const TT = WS + 30 - (IB.y1 - IB.y0);                      // tile top
const dotIx = ICE0.pieces.map((p, i) => ({ i, x1: box({ pieces: [p] } as Shape).x1 })).filter(q => q.x1 < IB.x0 + 0.31 * (IB.x1 - IB.x0)).map(q => q.i);
const DOTS: Shape = { pieces: ICE0.pieces.filter((_, i) => dotIx.includes(i)) } as Shape;
const BODY_ICE: Shape = { pieces: ICE0.pieces.filter((_, i) => !dotIx.includes(i)) } as Shape;
const SHUI = glyphFoot(heavy, "水", [0, WS + 30], ICE_SIZE);
const melt = lazyFieldMorph(() => BODY_ICE, () => SHUI, [0, WS + 30 - 75], 90, 200);
const MELT = ICE_U.map((_, i) => 48.62 + i);
// ——— the ladder 三 ———
export const LADX = 5560;
const SAN = glyphFoot(heavy, "三", [LADX, Y2], 560);
const BARS = SAN.pieces.map(p => ({ p, b: box({ pieces: [p] } as Shape) })).sort((a, b) => b.b.y0 - a.b.y0);   // bottom first
const BAR_AT = [53.3, 54.3, 55.3];
const barTop = (i: number) => BARS[i].b.y0;
// ——— dawn: 旦 ———
export const DX = LADX + 692;
const DAN = glyphFoot(heavy, "旦", [DX, barTop(2) + 114], 800);
const sunIx = DAN.pieces.map((p, i) => ({ i, h: box({ pieces: [p] } as Shape) })).sort((a, b) => a.h.y0 - b.h.y0)[0].i;
const SUN_SHAPE: Shape = { pieces: [DAN.pieces[sunIx]] } as Shape, DAN_BAR: Shape = { pieces: DAN.pieces.filter((_, i) => i !== sunIx) } as Shape;
const DB = box(DAN_BAR);
export const RISE: V = [56.8, 60.6];
export const dawn = (b: number) => smooth(span(b, RISE[0] + 0.8, RISE[1] + 0.6));
const sunDy = (b: number) => 980 * (1 - outQuad(span(b, RISE[0], RISE[1])));
// ——— the hug and the goal ———
export const HUG = 62, FUSE = 62.55;
const CX = DX - 10;
const HUG_SIZE = 150;
const BAO_HUG = glyphFoot(heavy, "抱", [0, 0], HUG_SIZE), HB = box(BAO_HUG);
const HUG_SPLIT = HB.x0 + 0.33 * (HB.x1 - HB.x0);          // 扌 | 包
export const GOAL = { u0: DX + 640, u1: DX + 1500, v: Y2 - 300 };
const GOAL_U = DX + 860, FLAG_U = DX + 1180;
const LEAP: V = [63.5, 65.5];

// ——— tracks (u, v) from the pop out of 出口 ———
const OUTV = HOLE.y1;
export const TRACK3_1: Key[] = [
  k(TUBE[0].out, ZC, OUTV, "hold"), k(TUBE[0].out + 1, ZC + 330, Y2, "jump", { h: 130 }),
  k(45.6, ZC + 330, Y2, "hold"), k(47, WATER_U[0] - 70, Y2),
  ...ICE_U.map((u, i) => k(48 + i, u + 26, TT, "jump", { h: 80 })),
  k(53, 5190, Y2, "jump", { h: 70 }), k(53.5, LADX - 300, Y2),
  k(54, LADX - 140, barTop(0), "jump", { h: 70 }), k(55, LADX - 60, barTop(1), "jump", { h: 220 }), k(56, LADX + 40, barTop(2), "jump", { h: 220 }),
  k(56.4, LADX + 40, barTop(2), "hold"), k(57, DX - 170, DB.y0, "jump", { h: 120 }),
  k(61.5, DX - 170, DB.y0, "hold"), k(62.5, CX - 47, DB.y0, "jump", { h: 150 }),   // takes the 扌, lands as the arms
  k(70, CX - 47, DB.y0, "hold"),
];
export const TRACK3_2: Key[] = [
  k(TUBE[1].out, ZC, OUTV, "hold"), k(TUBE[1].out + 1, ZC + 190, Y2, "jump", { h: 110 }),
  k(46, ZC + 190, Y2, "hold"), k(47.5, WATER_U[0] - 150, Y2),
  ...ICE_U.map((u, i) => k(48.5 + i, u - 30, TT, "jump", { h: 80 })),
  k(53.5, 5060, Y2, "jump", { h: 70 }), k(54, LADX - 380, Y2),
  k(54.5, LADX - 210, barTop(0), "jump", { h: 70 }), k(55.5, LADX - 120, barTop(1), "jump", { h: 220 }), k(56.5, LADX - 60, barTop(2), "jump", { h: 220 }),
  k(57, LADX - 60, barTop(2), "hold"), k(57.5, DX + 70, DB.y0, "jump", { h: 160 }),
  k(61.6, DX + 70, DB.y0, "hold"), k(62.4, CX + 26, DB.y0),
  k(70, CX + 26, DB.y0, "hold"),
];
// the hug: one glyph, its own track
export const TRACK_HUG: Key[] = [
  k(FUSE, CX, DB.y0, "hold"), k(LEAP[0], CX, DB.y0, "hold"),
  k(LEAP[1], GOAL_U, GOAL.v, "jump", { h: 300, spin: 1 }),
  ...Array.from({ length: 7 }, (_, i) => k(LEAP[1] + 1 + i, GOAL_U, GOAL.v, "jump", { h: i % 2 ? 26 : 46 })),
  k(80, GOAL_U, GOAL.v, "hold"),
];
export const BODY3_1: Change[] = [...BODY1, { b: HUG, to: "扌", dur: 0.45 }];
export const BODY3_2: Change[] = BODY2;
export const RADS3: Rad[] = [{ ch: "扌", who: 0, grab: HUG, hover: [DX - 120, DB.y0 - 250], whole: true, from: 59.4 }];
export const POPS3: Pop[] = [
  pop(48.8, "冰 → 水", ACC), pop(53.35, "一", ACC), pop(54.35, "二", ACC), pop(55.35, "三", ACC),
  pop(60.4, "日 + 一 = 旦", ACC), pop(62.7, "扌 + 包 = 抱", ACC), pop(65.8, "通关", ACC),
];
const L31 = landings(TRACK3_1), L32 = landings(TRACK3_2), LH = landings(TRACK_HUG);

export function players3(b: number): [Pose, Pose] {
  const e = pose(TRACK3_1, b), t = pose(TRACK3_2, b);
  // tiles dip under a landing: ride them
  for (const p of [e, t]) for (let i = 0; i < ICE_U.length; i++) if (Math.abs(p.x - ICE_U[i]) < 80 && Math.abs(p.y - TT) < 2) p.y += tileDip(i, b);
  return [e, t];
}
export const hugPose = (b: number) => pose(TRACK_HUG, b);
/** the pop out of the pipe: they come out small (from inside, far) and grow as they reach the camera */
export const emerge = (who: number, b: number) => b < TUBE[who].out ? 0 : lerp(0.5, 1, outBack(span(b, TUBE[who].out, TUBE[who].out + 0.4)));
export const body31 = (b: number) => bodyAt(BODY3_1, b), body32 = (b: number) => bodyAt(BODY3_2, b);

function tileDip(i: number, b: number) {
  let d = 0;
  for (const t0 of [48 + i, 48.5 + i]) { const a = b - t0; if (a > 0 && a < 0.6) d += 12 * Math.sin(Math.PI * a / 0.6); }
  return d;
}

// ——— camera: the side view follows the pair; it pulls back for the sunrise and settles on the goal ———
export function camera3(b: number): { x: number; y: number; z: number } {
  let x = 0, y = 0, sp = 0; const n = 10;
  for (let j = 0; j < n; j++) {
    const bb = b - j * 0.09, [e, t] = players3(bb);
    const h = bb > FUSE ? hugPose(bb) : null;
    const ex = h ? h.x : e.x, ey = h ? h.y : e.y, tx = h ? h.x : t.x, ty = h ? h.y : t.y;
    x += (ex + tx) / 2; y += (ey + ty) / 2 - 60; sp += Math.max(Math.abs(ex - tx) * 0.56, Math.abs(ey - ty));
  }
  x /= n; y /= n; sp /= n;
  let z = Math.min(0.95, clamp(560 / (sp + 260)) * 0.6 + 0.4);
  // the sunrise: back off to show the sun on the bar
  const wide = smooth(span(b, 56.6, 58.2)) * (1 - smooth(span(b, 61, 62.2)));
  x = lerp(x, DX, wide); y = lerp(y, DB.y0 - 330, wide); z = lerp(z, 0.62, wide);
  // the leap: frame both ends
  const leap = smooth(span(b, 63, 64)) * (1 - smooth(span(b, 66.5, 68)));
  x = lerp(x, (CX + GOAL_U) / 2, leap * 0.7); z = lerp(z, 0.7, leap);
  return { x, y, z };
}

// ——— drawing (u, v world transform set) ———
function gooMasses(b: number, u0: number, u1: number): LiquidMass[] {
  const out: LiquidMass[] = [];
  for (let u = Math.floor(u0 / 44) * 44; u <= u1; u += 44) out.push({ x: u, y: WS + 34 + 4 * Math.sin(u * 0.012 + b * 1.7), radiusX: 46, radiusY: 46 });
  // the drops of 冫 hitting the water, and the ripple where each 水 sinks
  ICE_U.forEach((u, i) => {
    const a = b - MELT[i]; if (a < 0 || a > 2.2) return;
    const r = rng(i + 9);
    for (let j = 0; j < 6; j++) {
      const t0 = 0.42, d = a - t0; if (d < 0) continue;
      const vx = (r() - 0.5) * 220, vy = -(160 + r() * 200), y = WS + vy * d + 0.5 * 1500 * d * d;
      if (y > WS + 30) continue;
      out.push({ x: u - 40 + vx * d, y, radiusX: 9, radiusY: 11 });
    }
    const crown = Math.sin(Math.PI * clamp((a - 0.5) / 0.9));
    if (crown > 0) out.push({ x: u, y: WS + 10 - 22 * crown, radiusX: 70, radiusY: 30 * crown + 1 });
  });
  return out;
}
const fillAt = (ctx: CanvasRenderingContext2D, s: Shape, dx: number, dy: number, color: string) => { ctx.save(); ctx.translate(dx, dy); ctx.fillStyle = color; ctx.fill(pathOf(s), "evenodd"); ctx.restore(); };

export function drawLevel3Back(ctx: CanvasRenderingContext2D, b: number, cam: { x: number; y: number; z: number }) {
  // the sky: the dark lifts into dawn as the sun comes up
  const d = dawn(b), hw = 720 / cam.z, hh = 420 / cam.z;
  if (d > 0) {
    const g = ctx.createLinearGradient(0, cam.y - hh, 0, cam.y + hh);
    g.addColorStop(0, mix(INK, "#3b2a55", d)); g.addColorStop(0.55, mix(INK, "#ff9e6b", d)); g.addColorStop(1, mix(INK, "#ffd59a", d));
    ctx.fillStyle = g; ctx.fillRect(cam.x - hw, cam.y - hh, 2 * hw, 2 * hh);
  }
  // the sun rises behind the bar
  if (b > RISE[0] - 0.5) {
    const dy = sunDy(b), sb = box(SUN_SHAPE);
    ctx.save(); ctx.translate(0, dy);
    ctx.fillStyle = SUN; ctx.globalAlpha = 0.25 * d; ctx.beginPath(); ctx.arc((sb.x0 + sb.x1) / 2, (sb.y0 + sb.y1) / 2, 420 + 30 * Math.sin(b * Math.PI), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = SUN; ctx.fill(pathOf(SUN_SHAPE), "evenodd"); ctx.restore();
  }
}

export function drawLevel3(ctx: CanvasRenderingContext2D, b: number, cam: { x: number; y: number; z: number }) {
  const d = dawn(b), land = mix(CREAM, INK, 0.92 * smooth(span(b, 58.85, 59.25)));
  const hh = 420 / cam.z;
  // ground after the water, under the ladder; the goal plateau
  ctx.fillStyle = land;
  ctx.fillRect(WATER_U[1], Y2, LADX + 360 - WATER_U[1], 56);
  ctx.fillRect(GOAL.u0, GOAL.v, GOAL.u1 - GOAL.u0, Math.max(0, cam.y + hh - GOAL.v));
  // ice tiles: 冰; once both have left, the 冫 drops fall and the rest is 水, sinking
  ICE_U.forEach((u, i) => {
    const a = b - MELT[i], dip = tileDip(i, b);
    if (a < 0) { fillAt(ctx, ICE0, u, dip, ICE); return; }
    // the two drops
    const fall = 0.5 * 1500 * Math.min(a, 0.6) ** 2;
    if (a < 0.6) fillAt(ctx, DOTS, u - 6 * a, dip + fall, mix(ICE, WATER, a));
    // the rest becomes 水 and sinks
    const rings = melt(smooth(span(a, 0.05, 0.5))), sink = 190 * inQuad(span(a, 0.35, 1.4));
    if (a < 1.5) { ctx.save(); ctx.translate(u, dip + sink); ctx.fillStyle = mix(ICE, WATER, smooth(span(a, 0.15, 0.8))); const p = new Path2D(); for (const r of rings) { p.moveTo(r[0][0], r[0][1]); for (const q of r) p.lineTo(q[0], q[1]); p.closePath(); } ctx.fill(p, "evenodd"); ctx.restore(); }
  });
  // the water (over the sinking 水)
  ctx.fillStyle = WATER;
  ctx.fill(liquidPath(gooMasses(b, WATER_U[0] - 30, WATER_U[1] + 30), { cellSize: 6 }));
  ctx.fillRect(WATER_U[0] - 30, WS + 60, WATER_U[1] - WATER_U[0] + 60, 2000);
  // the ladder counts up: a bar per beat, growing out from its middle
  BARS.forEach((bar, i) => {
    const g = outBack(span(b, BAR_AT[i], BAR_AT[i] + 0.45)); if (g <= 0) return;
    const cx = (bar.b.x0 + bar.b.x1) / 2, cy = (bar.b.y0 + bar.b.y1) / 2;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(g, Math.min(1, 0.4 + g)); ctx.translate(-cx, -cy); ctx.fillStyle = land; ctx.fill(pathOf({ pieces: [bar.p] } as Shape), "evenodd"); ctx.restore();
  });
  // the bar of 旦 (the sun is drawn behind, in the back layer)
  if (b > 55) { const g = outBack(span(b, 55.6, 56.2)); const cx = (DB.x0 + DB.x1) / 2, cy = (DB.y0 + DB.y1) / 2; ctx.save(); ctx.translate(cx, cy); ctx.scale(g, Math.min(1, 0.4 + g)); ctx.translate(-cx, -cy); ctx.fillStyle = land; ctx.fill(pathOf(DAN_BAR), "evenodd"); ctx.restore(); }
  // the goal flag: 终, raised when they land
  {
    const up = outBack(span(b, LEAP[1] + 0.2, LEAP[1] + 1)), top = GOAL.v - 330;
    ctx.fillStyle = land; ctx.fillRect(FLAG_U - 5, top, 10, GOAL.v - top);
    const fy = lerp(GOAL.v - 90, top, up), wave = 6 * Math.sin(b * 3);
    ctx.fillStyle = ACC; ctx.beginPath(); ctx.moveTo(FLAG_U + 5, fy); ctx.lineTo(FLAG_U + 150, fy + 8 + wave); ctx.lineTo(FLAG_U + 150, fy + 98 + wave); ctx.lineTo(FLAG_U + 5, fy + 90); ctx.fill();
    fillAt(ctx, ZHONG, FLAG_U + 78, fy + 6 + wave / 2, INK);
  }
  // landing dust
  for (const [i, L] of [L31, L32, LH].entries()) for (const l of L) if (b > l.b && b < l.b + 1 && l.b > 44.5) dust(ctx, [l.x, l.y], b - l.b, i === 2 ? ACC : land, Math.round(l.b * 100) + i, i === 2 ? 1.6 : 1);
}
const ZHONG = glyphFoot(heavy, "终", [0, 80], 76);

/** The hug: 抱 with 扌 in 1P's colour and 包 in 2P's, fading in over the two bodies at the fuse. */
export function drawHug(ctx: CanvasRenderingContext2D, b: number, p: Pose, alpha = 1) {
  const mid = HEIGHT * 0.7;
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.translate(p.x, p.y - mid); ctx.rotate(p.rot); ctx.scale(p.sx, p.sy); ctx.translate(0, mid);
  const path = pathOf(BAO_HUG);
  ctx.save(); ctx.beginPath(); ctx.rect(-400, -400, 400 + HUG_SPLIT, 800); ctx.clip(); ctx.fillStyle = P1; ctx.fill(path, "evenodd"); ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(HUG_SPLIT, -400, 800, 800); ctx.clip(); ctx.fillStyle = P2; ctx.fill(path, "evenodd"); ctx.restore();
  ctx.restore();
}
export const HUG_GLYPH = BAO_HUG;
export const prewarm3 = () => { melt(0.5); };
void mapShape;
