import { centroid, fracture } from "../../packages/morph-engine/src/effects/fracture";
import { liquidPath, type LiquidMass } from "../../packages/morph-engine/src/effects/liquid";
import { compound, mapShape, type Shape } from "../../packages/morph-engine/src/vector/shape";
import type { Slot } from "../../packages/morph-engine/src/vector/text";
import {
  CREAM, INK, P1, P2, TAU, box, clamp, dust, fillRings, fillShape, fillSlots, glyphFoot, heavy, inQuad, lazyFieldMorph, lerp,
  outBack, outQuad, pathOf, rng, slotBox, smooth, span, thin, uiText, word, type V, type Word,
} from "./common";
import { HEIGHT_E, HEIGHT_T, PLAYERS, k, landings, pose, posed, shapeE, shapeT, type Key, type Pose } from "./player";

/*
 * Title + LEVEL 1 (TYPE) + LEVEL 2 (SHAPE): one flat 2D world, one follow camera.
 *   Title — a hairline & gains weight and splits into its two letters, E and t (& is the ligature of "et").
 *   TYPE — the level is the sentence TWO CAN GO WHERE ONE CANNOT; each word rises into place as a platform as the
 *   players come. E alone bonks its head on ONE; t springs off E's head onto ONE and kicks its O down as a step for E.
 *   Both jump on the giant NOT and ground-pound together: NOT shatters (Voronoi) and they fall through the page.
 *   SHAPE — below, an ink goo sea on cream: they splash in, hop across floating shapes that morph on the beat
 *   (square → circle → triangle), use a seesaw (E's slam catapults t up to a button), the button raises a bridge out
 *   of the goo, and they jump into a ring — a portal that already shows the next world.
 */
// ——— title ———
export const FLOOR = 100;
const AMP = glyphFoot(heavy, "&", [0, FLOOR], 205), AMP_THIN = glyphFoot(thin, "&", [0, FLOOR], 205);
const X_E = -62, X_T = 64;
const ET = compound(mapShape(shapeE, ([x, y]) => [x + X_E, y + FLOOR]), mapShape(shapeT, ([x, y]) => [x + X_T, y + FLOOR]));
const weight = lazyFieldMorph(() => AMP_THIN, () => AMP, [0, 20], 170, 300);
const split = lazyFieldMorph(() => AMP, () => ET, [0, 20], 170, 300);
export const MORPHED = 1.6;                           // players take over from the morph

// ——— level 1: the sentence ———
const S = 150;
const TWO = word(heavy, "TWO", 270, FLOOR, S), CAN = word(heavy, "CAN", TWO.right + 130, 10, S), GO = word(heavy, "GO", CAN.right + 140, FLOOR, S);
const WHERE = word(heavy, "WHERE", GO.right + 130, 40, S), ONE = word(heavy, "ONE", WHERE.right - 170, -170, S);
const CAN2 = word(heavy, "CAN", ONE.right + 95, -170, S), NOT = word(heavy, "NOT", CAN2.right + 26, -250, 340);
const WORDS: Array<{ w: Word; rise: number }> = [
  { w: TWO, rise: 6.6 }, { w: CAN, rise: 9 }, { w: GO, rise: 10.5 }, { w: WHERE, rise: 12 }, { w: ONE, rise: 14 }, { w: CAN2, rise: 16 }, { w: NOT, rise: 17 },
];
const O = ONE.slots[0], N1 = slotBox(ONE.slots[1]), E1 = slotBox(ONE.slots[2]), OB = slotBox(O);
const UNDER = ONE.left - 165;                         // where E stands to give t a leg up (clear of the falling O)
const O_LAND = ONE.left - 20;                         // the O's centre once it lands on WHERE
const O_TOP = WHERE.top - (OB.y1 - OB.y0);
// the O: kicked off ONE at 24, slides left, drops onto WHERE on beat 25
function oAt(b: number): { dx: number; dy: number; rot: number } {
  const cx = (OB.x0 + OB.x1) / 2;
  if (b < 24) return { dx: 0, dy: 0, rot: 0 };
  const slide = outQuad(span(b, 24, 24.45)), fall = inQuad(span(b, 24.45, 25));
  const dx = lerp(0, O_LAND - cx, Math.min(1, slide * 0.75 + span(b, 24.45, 25) * 0.25));
  const dy = (WHERE.top - OB.y1) * fall, land = span(b, 25, 25.35);
  return { dx, dy: dy - 10 * Math.sin(Math.PI * land) * (b > 25 ? 1 : 0), rot: -1.3 * span(b, 24, 25) };
}
const NOT_MID = (NOT.left + NOT.right) / 2;
// the shatter: Voronoi cells over NOT's box; shards keep their piece of the real letters
const SMASH = 31;
const NOT_SHAPE = compound(...NOT.slots.map(s => s.shape));
const NB = box(NOT_SHAPE);
const shards = fracture([[NB.x0 - 4, NB.y0 - 4], [NB.x1 + 4, NB.y0 - 4], [NB.x1 + 4, NB.y1 + 4], [NB.x0 - 4, NB.y1 + 4]], 46, 31, 2).map((cell, i) => {
  const r = rng(300 + i), c = centroid(cell), dx = c[0] - NOT_MID, dy = c[1] - NB.y0;
  return { cell, c, vx: dx * 1.1 + (r() - 0.5) * 160, vy: -120 - r() * 220 + dy * 0.6, spin: (r() - 0.5) * 5 };
});
const cellPaths = shards.map(s => { const p = new Path2D(); s.cell.forEach(([x, y], i) => i ? p.lineTo(x, y) : p.moveTo(x, y)); p.closePath(); return p; });

// ——— level 2: the goo sea ———
export const GOO = 1460;                              // the sea's surface
const PAGE_END = 760;                                 // below this the page is cream
const PLAT_X = [NOT_MID + 380, NOT_MID + 640, NOT_MID + 900, NOT_MID + 1160, NOT_MID + 1420];
const bob = (i: number) => (b: number) => 5 * Math.sin(b * 1.6 + i * 1.3);
const platTop = (i: number) => GOO - 52 - 118;        // the top of every platform shape (at rest)
const SEE = { x: NOT_MID + 1760, y: GOO - 52 - 140 };  // seesaw pivot on its island
const PLANK = 190;                                    // half length
const plankTilt = (b: number) => lerp(0.32, -0.32, outQuad(span(b, 42, 42.28)));
const plankEnd = (side: number, b: number): V => { const a = plankTilt(b); return [SEE.x + side * PLANK * Math.cos(a), SEE.y + side * PLANK * Math.sin(a) - 14]; };
const BUTTON = { x: SEE.x + 380, y: GOO - 620 };       // the high shelf with the button
const BRIDGE_X = [SEE.x + 330, SEE.x + 560, SEE.x + 790, SEE.x + 1020];
const BRIDGE_AT = [45, 46, 47, 48];
const BRIDGE_TOP = GOO - 100;
const RING = { x: SEE.x + 1320, y: GOO - 230, r: 215, hole: 132 };
export const PORTAL = { at: 52.6, through: 56.8 };    // jump into the ring; the camera pushes through its hole

// ——— the tracks ———
const NE = (N1.x0 + N1.x1) / 2;
export const TRACK_E: Key[] = [
  k(-10, X_E, FLOOR, "hold"), k(7, X_E, FLOOR, "hold"),
  k(8, 200, FLOOR, "jump", { h: 120 }),                                   // leapfrog over t
  k(10, TWO.right - 40, FLOOR), k(11, CAN.left + 50, CAN.top, "jump", { h: 70 }),
  k(12, CAN.right - 40, CAN.top), k(13, GO.left + 50, GO.top, "jump", { h: 55 }),
  k(14, GO.right - 40, GO.top), k(15, WHERE.left + 50, WHERE.top, "jump", { h: 70 }),
  k(17, ONE.left + 40, WHERE.top), k(18, ONE.left + 40, WHERE.top, "hold"),
  k(19, ONE.left + 40, WHERE.top, "bonk", { h: Math.max(8, WHERE.top - HEIGHT_E - ONE.bottom) }),
  k(19.6, ONE.left + 40, WHERE.top, "hold"), k(20.5, UNDER, WHERE.top, "run", { dir: 1 }),
  k(25, UNDER, WHERE.top, "hold"), k(26, O_LAND, O_TOP, "jump", { h: 60 }),
  k(27, N1.x0 + 46, ONE.top, "jump", { h: 75 }),
  k(28, (CAN2.left + CAN2.right) / 2 - 30, CAN2.top, "jump", { h: 70 }),
  k(29, NOT.left + 90, NOT.top, "jump", { h: 75 }), k(30, NOT_MID - 70, NOT.top),
  k(30.62, NOT_MID - 70, NOT.top - 190, "ease", { spin: -1 }), k(SMASH, NOT_MID - 70, NOT.top, "fall"),
  k(33.8, NOT_MID + 10, GOO + 30, "fall"),                                // through the page, into the goo
  k(34.4, NOT_MID + 40, GOO + 60, "ease"),
  k(35, PLAT_X[0], platTop(0), "jump", { h: 150, ride: bob(0) }),
  ...PLAT_X.slice(1).map((x, i) => k(36 + i, x, platTop(i + 1), "jump", { h: 80, ride: bob(i + 1) })),
  k(41, PLAT_X[4], platTop(4), "hold", { ride: bob(4) }),
  k(42, plankEnd(-1, 41.99)[0], plankEnd(-1, 41.99)[1], "jump", { h: 230 }),   // the slam
  k(43, plankEnd(-1, 43)[0], plankEnd(-1, 43)[1], "hold"), k(45, plankEnd(-1, 45)[0], plankEnd(-1, 45)[1], "hold"),
  k(46, BRIDGE_X[0], BRIDGE_TOP, "jump", { h: 90 }), k(47, BRIDGE_X[1], BRIDGE_TOP, "jump", { h: 70 }),
  k(48, BRIDGE_X[2], BRIDGE_TOP, "jump", { h: 70 }), k(49, BRIDGE_X[3], BRIDGE_TOP, "jump", { h: 70 }),
  k(50.5, RING.x - 330, BRIDGE_TOP), k(PORTAL.at - 0.4, RING.x - 330, BRIDGE_TOP, "hold"),
  k(PORTAL.at + 1, RING.x - 20, RING.y + 40, "jump", { h: 120, spin: 1 }),
  k(60, RING.x - 20, RING.y + 40, "hold"),
];
export const TRACK_T: Key[] = [
  k(-10, X_T, FLOOR, "hold"), k(8, X_T, FLOOR, "hold"),
  k(10.5, TWO.right - 120, FLOOR), k(11.5, CAN.left + 20, CAN.top, "jump", { h: 70 }),
  k(12.5, CAN.right - 70, CAN.top), k(13.5, GO.left + 30, GO.top, "jump", { h: 55 }),
  k(14.5, GO.right - 80, GO.top), k(15.5, WHERE.left + 30, WHERE.top, "jump", { h: 70 }),
  k(16.5, WHERE.left + 90, WHERE.top), k(20.25, WHERE.left + 90, WHERE.top, "hold"), k(21, UNDER, WHERE.top - HEIGHT_E, "jump", { h: 60 }),   // onto E's head
  k(21.7, UNDER, WHERE.top - HEIGHT_E + 22, "ease"),                      // E crouches under the weight
  k(23, NE, ONE.top, "jump", { h: 210, spin: 1 }),                        // sprung up onto ONE
  k(23.5, NE, ONE.top, "hold", { dir: -1 }), k(24, NE - 50, ONE.top, "run", { dir: -1 }),   // kicks the O
  k(25.2, NE - 50, ONE.top, "hold", { dir: -1 }), k(26.2, (E1.x0 + E1.x1) / 2, ONE.top), k(26.5, (E1.x0 + E1.x1) / 2, ONE.top, "hold"),
  k(27.5, (CAN2.left + CAN2.right) / 2 + 60, CAN2.top, "jump", { h: 70 }),
  k(28.5, CAN2.right - 50, CAN2.top), k(29.5, NOT.left + 200, NOT.top, "jump", { h: 75 }), k(30, NOT_MID + 70, NOT.top),
  k(30.62, NOT_MID + 70, NOT.top - 190, "ease", { spin: 1 }), k(SMASH, NOT_MID + 70, NOT.top, "fall"),
  k(33.85, NOT_MID + 150, GOO + 30, "fall"), k(34.5, NOT_MID + 160, GOO + 60, "ease"),
  k(35.5, PLAT_X[0] + 10, platTop(0), "jump", { h: 150, ride: bob(0) }),
  ...PLAT_X.slice(1).map((x, i) => k(36.5 + i, x, platTop(i + 1), "jump", { h: 80, ride: bob(i + 1) })),
  k(40, PLAT_X[4], platTop(4), "hold", { ride: bob(4) }),
  k(41, plankEnd(1, 41)[0], plankEnd(1, 41)[1], "jump", { h: 90 }),     // waits on the low end
  k(42.28, plankEnd(1, 42.28)[0], plankEnd(1, 42.28)[1], "hold"),
  k(44, BUTTON.x, BUTTON.y, "jump", { h: 260, spin: 1 }),                // catapulted to the button
  k(48.5, BUTTON.x, BUTTON.y, "hold"),
  k(49.5, BRIDGE_X[3] + 60, BRIDGE_TOP, "jump", { h: 50 }),
  k(50.5, RING.x - 200, BRIDGE_TOP), k(PORTAL.at, RING.x - 200, BRIDGE_TOP, "hold"),
  k(PORTAL.at + 1.2, RING.x + 20, RING.y + 40, "jump", { h: 100, spin: 1 }),
  k(60, RING.x + 20, RING.y + 40, "hold"),
];
// E rides the plank's left end down while it tips (E holds its end of the board)
const LAND_E = landings(TRACK_E), LAND_T = landings(TRACK_T);

export function players(b: number): [Pose, Pose] {
  const e = pose(TRACK_E, b), t = pose(TRACK_T, b);
  // E crouches as t lands on its head and springs as t is launched
  const press = Math.sin(Math.PI * span(b, 21, 21.85)) * (b < 21.85 ? 1 : 0), spring = Math.sin(Math.PI * span(b, 21.7, 22.1));
  if (press > 0 || spring > 0) { e.sy *= 1 - 0.22 * press + 0.15 * spring; e.sx = 1 / Math.sqrt(e.sy); }
  // t rides E's head down while E crouches
  if (b > 21 && b < 21.75) t.y = WHERE.top - HEIGHT_E * e.sy;
  // on the plank: both stand on the board as it tips
  if (b >= 42 && b < 45) { const p = plankEnd(-1, b); e.x = p[0]; e.y = p[1]; }
  if (b >= 41 && b < 42.28) { const p = plankEnd(1, b); t.x = p[0]; t.y = p[1]; }
  return [e, t];
}

// ——— camera: follows both players with a lag; pulls out to keep them both in frame ———
export function camera(b: number): { x: number; y: number; z: number } {
  let x = 0, y = 0, span2 = 0; const n = 10;
  for (let j = 0; j < n; j++) {
    const [e, t] = players(b - j * 0.09);
    x += (e.x + t.x) / 2; y += (e.y + t.y) / 2 - 40; span2 += Math.max(Math.abs(e.x - t.x) * 0.56, Math.abs(e.y - t.y));
  }
  x /= n; y /= n; span2 /= n;
  const title = 1 - smooth(span(b, 6.5, 9.5));
  let z = Math.min(1, clamp(560 / (span2 + 260)) * 0.6 + 0.4);
  x = lerp(x, 0, title); y = lerp(y, 30, title); z = lerp(z, 1.75, title);
  return { x, y, z };
}

// ——— drawing ———
function riseOf(w: Word, rise: number, i: number, b: number) {
  const k2 = outBack(span(b, rise + i * 0.09, rise + i * 0.09 + 0.8));
  return { dy: (1 - k2) * 140, a: smooth(span(b, rise + i * 0.09, rise + i * 0.09 + 0.35)) };
}
function drawSentence(ctx: CanvasRenderingContext2D, b: number) {
  ctx.fillStyle = CREAM;
  for (const { w, rise } of WORDS) {
    if (b < rise) continue;
    w.slots.forEach((s, i) => {
      if (w === NOT && b >= SMASH) return;
      const { dy, a } = riseOf(w, rise, i, b);
      ctx.save(); ctx.globalAlpha = a; ctx.translate(0, dy);
      if (w === ONE && i === 0) { const o = oAt(b), c = [(OB.x0 + OB.x1) / 2, (OB.y0 + OB.y1) / 2]; ctx.translate(c[0] + o.dx, c[1] + o.dy); ctx.rotate(o.rot); ctx.translate(-c[0], -c[1]); }
      ctx.fill(pathOf(s.shape), "evenodd"); ctx.restore();
    });
  }
  // the NOT's landing: it slams in heavy
  dust(ctx, [NOT_MID - 200, NOT.bottom], b - 17.8, CREAM, 17, 2);
  dust(ctx, [NOT_MID + 200, NOT.bottom], b - 17.8, CREAM, 18, 2);
  // the shatter
  if (b >= SMASH) {
    const a = b - SMASH;
    shards.forEach((s, i) => {
      const x = s.vx * a, y = s.vy * a + 0.5 * 1500 * a * a;
      if (y > 2600) return;
      ctx.save(); ctx.translate(s.c[0] + x, s.c[1] + y); ctx.rotate(s.spin * a); ctx.translate(-s.c[0], -s.c[1]);
      ctx.clip(cellPaths[i]); ctx.fillStyle = CREAM; ctx.fill(pathOf(NOT_SHAPE), "evenodd"); ctx.restore();
      if (s.c[1] + y > PAGE_END - 200) {
        ctx.save(); ctx.beginPath(); ctx.rect(-1e5, PAGE_END, 2e5, 1e5); ctx.clip();
        ctx.translate(s.c[0] + x, s.c[1] + y); ctx.rotate(s.spin * a); ctx.translate(-s.c[0], -s.c[1]);
        ctx.clip(cellPaths[i]); ctx.fillStyle = INK; ctx.fill(pathOf(NOT_SHAPE), "evenodd"); ctx.restore();
      }
    });
    // the shock: a flat ring on the beat
    const r = span(b, SMASH, SMASH + 0.7);
    if (r < 1) { ctx.strokeStyle = CREAM; ctx.globalAlpha = 1 - r; ctx.lineWidth = 10 * (1 - r) + 1; ctx.beginPath(); ctx.ellipse(NOT_MID, NOT.top, 40 + 520 * outQuad(r), 14 + 90 * outQuad(r), 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
  }
}

// platforms that morph square → circle → triangle on the beat (all sampled as 72-point radial outlines, same top)
const NPT = 72;
function platOutline(kind: number, cx: number, top: number): V[] {
  const out: V[] = [];
  for (let j = 0; j < NPT; j++) {
    const a = -Math.PI / 2 + j / NPT * TAU, dx = Math.cos(a), dy = Math.sin(a);
    let r: number;
    if (kind === 0) r = 59 / Math.max(Math.abs(dx), Math.abs(dy));                       // square, side 118
    else if (kind === 1) r = 59;                                                        // circle
    else { // triangle, apex up, centred so the apex is at the same top
      const R = 78, ang = ((a + Math.PI / 2) % (TAU / 3) + TAU / 3) % (TAU / 3) - Math.PI / 3;
      r = R * Math.cos(Math.PI / 3) / Math.cos(ang);
    }
    const cy = kind === 2 ? top + 78 : top + 59;
    out.push([cx + dx * r, cy + dy * r]);
  }
  return out;
}
function platShape(i: number, b: number): V[] {
  const phase = b + i * 0.5, cycle = Math.floor(phase), u = outBack(clamp((phase - cycle) / 0.35));
  const k0 = ((cycle % 3) + 3) % 3, k1 = (k0 + 1) % 3, top = platTop(i) + bob(i)(b);
  const A = platOutline(k0, PLAT_X[i], top), B = platOutline(k1, PLAT_X[i], top);
  return A.map((p, j) => [lerp(p[0], B[j][0], u), lerp(p[1], B[j][1], u)]);
}
function fillPoly(ctx: CanvasRenderingContext2D, pts: readonly V[]) { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill(); }

function gooMasses(b: number, x0: number, x1: number): LiquidMass[] {
  const out: LiquidMass[] = [];
  for (let x = Math.floor(x0 / 46) * 46; x <= x1; x += 46) out.push({ x, y: GOO + 30 + 4 * Math.sin(x * 0.013 + b * 1.9), radiusX: 50, radiusY: 50 });
  // the splash where they fall in: a crown of drops thrown up, falling back
  for (const [at, cx] of [[33.8, NOT_MID + 10], [33.85, NOT_MID + 150]] as const) {
    const a = b - at; if (a < 0 || a > 2) continue;
    const r = rng(Math.round(cx));
    for (let j = 0; j < 12; j++) {
      const vx = (r() - 0.5) * 420, vy = -(380 + r() * 420), y = GOO + vy * a + 0.5 * 1300 * a * a;
      if (y > GOO + 30) continue;
      out.push({ x: cx + vx * a, y, radiusX: 13, radiusY: 15 });
    }
    const crown = Math.sin(Math.PI * clamp(a / 0.8));
    out.push({ x: cx, y: GOO - 30 * crown, radiusX: 70, radiusY: 46 * crown + 1 });
  }
  // the bridge squares come up out of the goo, dripping
  BRIDGE_X.forEach((x, i) => {
    const a = b - BRIDGE_AT[i]; if (a < 0 || a > 3) return;
    for (let j = 0; j < 3; j++) {
      const t0 = 0.3 + j * 0.35, d = a - t0; if (d < 0) continue;
      const y = BRIDGE_TOP + 40 + 0.5 * 1500 * d * d; if (y > GOO + 20) continue;
      out.push({ x: x - 40 + j * 40, y, radiusX: 11, radiusY: 14 });
    }
  });
  return out;
}
function bridgeRise(i: number, b: number) { return outBack(span(b, BRIDGE_AT[i], BRIDGE_AT[i] + 0.7)); }

function drawGoo(ctx: CanvasRenderingContext2D, b: number, cam: { x: number; z: number }) {
  const half = 700 / cam.z;
  ctx.fillStyle = INK;
  // the floating shapes (behind the surface, they sit in it)
  PLAT_X.forEach((_, i) => fillPoly(ctx, platShape(i, b)));
  // the seesaw: island, fulcrum, plank
  ctx.fillRect(SEE.x - 120, GOO - 52, 240, 200);
  fillPoly(ctx, [[SEE.x, SEE.y], [SEE.x + 70, GOO - 52], [SEE.x - 70, GOO - 52]]);
  ctx.save(); ctx.translate(SEE.x, SEE.y); ctx.rotate(plankTilt(b)); ctx.fillRect(-PLANK - 10, -16, 2 * PLANK + 20, 18); ctx.restore();
  // the shelf and its button
  ctx.fillRect(BUTTON.x - 110, BUTTON.y, 220, 34);
  const press = lerp(1, 0.3, outQuad(span(b, 44, 44.12)));
  ctx.beginPath(); ctx.ellipse(BUTTON.x, BUTTON.y, 44, 30 * press, 0, Math.PI, TAU); ctx.fill();
  // bridge squares
  BRIDGE_X.forEach((x, i) => { const k2 = bridgeRise(i, b); if (k2 <= 0) return; const top = lerp(GOO + 60, BRIDGE_TOP, k2); ctx.fillRect(x - 70, top, 140, GOO + 80 - top); });
  // the ring (portal) — behind it, through its hole, the next world is drawn by the caller
  ctx.save(); ctx.beginPath(); ctx.arc(RING.x, RING.y, RING.r, 0, TAU); ctx.arc(RING.x, RING.y, RING.hole, 0, TAU, true); ctx.fill(); ctx.restore();
  // the sea
  ctx.fill(liquidPath(gooMasses(b, cam.x - half - 100, cam.x + half + 100), { cellSize: 6 }));
  ctx.fillRect(cam.x - half - 100, GOO + 40, 2 * half + 200, 1600);
}

export function drawPlayers(ctx: CanvasRenderingContext2D, poses: [Pose, Pose], hidden = false) {
  if (hidden) return;
  PLAYERS.forEach((p, i) => {
    const s = posed(p.shape, p.height, poses[i]);
    ctx.fillStyle = p.color; ctx.fill(pathOf(s), "evenodd");
  });
}

/** The world from the title through the ring. `portal` draws the next world (screen space) through the ring's hole. */
export function drawPlay(ctx: CanvasRenderingContext2D, b: number, portal?: (ctx: CanvasRenderingContext2D) => void) {
  const base = ctx.getTransform();
  let cam = camera(b);
  // the push through the ring: zoom about the hole
  const push = smooth(span(b, PORTAL.at + 0.6, PORTAL.through));
  if (push > 0) { const zz = cam.z * Math.exp(Math.log(9 / cam.z) * push); cam = { x: lerp(cam.x, RING.x, push ** 0.5), y: lerp(cam.y, RING.y, push ** 0.5), z: zz }; }
  ctx.fillStyle = INK; ctx.fillRect(-700, -400, 1400, 800);
  ctx.save(); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
  // the page below: cream from PAGE_END down
  ctx.fillStyle = CREAM; ctx.fillRect(cam.x - 2000 / cam.z, PAGE_END, 4000 / cam.z, 4000);
  // title floor
  if (b < 16) { ctx.fillStyle = CREAM; const grow = smooth(span(b, -3, 1)); ctx.fillRect(lerp(-30, -900, grow), FLOOR, lerp(60, 900 + TWO.left, grow), 12); }
  // the &
  if (b < MORPHED) {
    const grad = ctx.createLinearGradient(-70, 0, 70, 0), w = lerp(0.5, 0.02, smooth(span(b, 0, 1.4)));
    grad.addColorStop(0, P1); grad.addColorStop(clamp(0.5 - w), P1); grad.addColorStop(clamp(0.5 + w), P2); grad.addColorStop(1, P2);
    const tint = smooth(span(b, -0.4, 0.6));
    if (b < -1) fillShape(ctx, AMP_THIN, CREAM, smooth(span(b, -3.6, -1.6)));
    else {
      const rings = b < 0 ? weight(smooth(span(b, -1, 0))) : split(smooth(span(b, 0, MORPHED)));
      fillRings(ctx, rings, CREAM, 1 - tint);
      const p = new Path2D(); for (const r of rings) { p.moveTo(r[0][0], r[0][1]); for (const q of r) p.lineTo(q[0], q[1]); p.closePath(); }
      ctx.globalAlpha = tint; ctx.fillStyle = grad; ctx.fill(p, "evenodd"); ctx.globalAlpha = 1;
    }
  }
  if (b < 40) drawSentence(ctx, b);
  if (b > 30) drawGoo(ctx, b, cam);
  // through the ring's hole: the next world
  if (portal && b > 43) {
    const sx = (RING.x - cam.x) * cam.z, sy = (RING.y - cam.y) * cam.z, sr = RING.hole * cam.z;
    ctx.save(); ctx.setTransform(base); ctx.beginPath(); ctx.arc(sx, sy, sr + 0.5, 0, TAU); ctx.clip(); portal(ctx); ctx.restore();
  }
  const poses = players(b);
  if (b >= MORPHED) drawPlayers(ctx, poses, b > PORTAL.at + 1.6);
  // landing dust
  const colorAt = (y: number) => y > PAGE_END ? INK : CREAM;
  for (const [i, L] of [LAND_E, LAND_T].entries()) for (const l of L) if (b > l.b && b < l.b + 1) dust(ctx, [l.x, l.y + (l.ride?.(b) ?? 0)], b - l.b, colorAt(l.y), Math.round(l.b * 100) + i, l.power);
  ctx.restore();
  return { cam, poses };
}

// ——— the HUD ———
const TAGS = [uiText("1P", [0, 0], 17, 0.1), uiText("2P", [0, 0], 17, 0.1)];
const TITLE = uiText("A GAME FOR TWO", [0, -150], 30, 0.32), PRESS = uiText("PRESS START", [0, 215], 22, 0.3);
const EQ = uiText("& = E + t", [0, 190], 26, 0.2);
const SENTENCE = ["TWO", "CAN", "GO", "WHERE", "ONE", "CAN", "NOT"];
const sentenceSlots = (() => { const all = uiText("TWO CAN GO WHERE ONE CANNOT", [0, 318], 20, 0.24); const out: Slot[][] = []; let at = 0; for (const w of SENTENCE) { out.push(all.slice(at, at + w.length)); at += w.length; } return out; })();
const VISIT = [9.5, 11, 13, 15, 23, 28, 29];
export const LEVEL_CARDS: Array<[number, number, Slot[]]> = [
  [8, 12.5, uiText("LEVEL 1 · TYPE", [0, 0], 16, 0.3)],
  [35, 39.5, uiText("LEVEL 2 · SHAPE", [0, 0], 16, 0.3)],
];
export function drawLevelCards(ctx: CanvasRenderingContext2D, b: number, cards: Array<[number, number, Slot[]]>, color = CREAM) {
  for (const [a0, a1, sl] of cards) {
    const a = smooth(span(b, a0, a0 + 0.5)) * (1 - smooth(span(b, a1 - 0.6, a1)));
    if (a <= 0) continue;
    const dx = -590 - sl[0].x;
    ctx.save(); ctx.translate(dx, -318); ctx.globalAlpha = a; ctx.fillStyle = color; for (const s of sl) ctx.fill(pathOf(s.shape), "evenodd"); ctx.restore();
  }
}

export function drawPlayHud(ctx: CanvasRenderingContext2D, b: number, cam: { x: number; y: number; z: number }, poses: [Pose, Pose]) {
  ctx.save(); ctx.globalCompositeOperation = "difference";
  // title screen
  fillSlots(ctx, EQ, CREAM, smooth(span(b, -2.2, -1.4)) * (1 - smooth(span(b, 1.4, 2.2))));
  fillSlots(ctx, TITLE, CREAM, smooth(span(b, 2, 2.6)) * (1 - smooth(span(b, 6, 6.6))));
  const blink = b >= 3 && b < 6 ? (b % 1 < 0.6 ? 1 : 0.15) : 0;
  fillSlots(ctx, PRESS, CREAM, blink);
  if (b >= 6 && b < 6.8) { const u = span(b, 6, 6.8); ctx.save(); ctx.translate(0, 215); ctx.scale(1 + 0.6 * u, 1 + 0.6 * u); ctx.translate(0, -215); fillSlots(ctx, PRESS, CREAM, 1 - u); ctx.restore(); }
  // the 1P / 2P tags over the players
  const tagA = smooth(span(b, 2, 2.5)) * (1 - smooth(span(b, 9, 10)));
  if (tagA > 0) poses.forEach((p, i) => {
    const h = i ? HEIGHT_T : HEIGHT_E, x = (p.x - cam.x) * cam.z, y = (p.y - h - 30 - cam.y) * cam.z;
    ctx.save(); ctx.translate(x, y); ctx.globalCompositeOperation = "source-over"; fillSlots(ctx, TAGS[i], PLAYERS[i].color, tagA); ctx.restore();
  });
  // the objective: the sentence, each word lit as they reach it; NOT struck out when it breaks
  const objA = smooth(span(b, 9, 10)) * (1 - smooth(span(b, 33, 34.5)));
  if (objA > 0) sentenceSlots.forEach((sl, i) => fillSlots(ctx, sl, CREAM, objA * (b > VISIT[i] ? 1 : 0.32) * (i === 6 && b > SMASH ? 0.5 : 1)));
  if (b > SMASH && objA > 0) { const sl = sentenceSlots[6], x0 = sl[0].x - 4, x1 = sl[2].x + sl[2].width + 4, k2 = outQuad(span(b, SMASH, SMASH + 0.3)); ctx.fillStyle = CREAM; ctx.globalAlpha = objA; ctx.fillRect(x0, 316, (x1 - x0) * k2, 3); ctx.globalAlpha = 1; }
  drawLevelCards(ctx, b, LEVEL_CARDS);
  ctx.restore();
}

export const prewarmPlay = () => { weight(0.5); split(0.5); };
export const splitMorph = (k: number) => split(k);
export { RING, GOO as GOO_Y };
void [HEIGHT_T, shapeT, rng];
