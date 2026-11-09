import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import type { Slot } from "../../packages/morph-engine/src/vector/text";
import type { Pose } from "../mm-and/player";
import { COLORS, HEIGHT, drawPops, drawRadical, placeRings, placer, prewarmBodies } from "./bodies";
import { BEAT, CREAM, DROP, INK, P1, P2, SHAFT, dust, fillSlots, mix, ringsPath, shapeRings, smooth, span, uiText, type V } from "./common";
import { FAR, FRONT, drawSolids, flatFront, flatPath, flatSide, lerpCam, sideFrame, view, type Frame, type View } from "./proj";
import { BODY1, BODY2, LAND1, LAND2, MORPHED, POPS1, RADS1, X1, X2, prewarm1, body1, body2, camera1, drawBubble, drawLevel1, players1, signRings } from "./s1";
import { C3, camera2 } from "./s2";
import { BODY3_1, FUSE, POPS3, RADS3, body31, body32, camera3, dawn, drawHug, drawLevel3, drawLevel3Back, emerge, hugPose, players3, prewarm3 } from "./s3";
import { IRIS, drawCard, drawIris, prewarm4 } from "./s4";
import { FLOOR, HOLE, MOUTH, TUBE, X3, Z1, W, shaftRect, solids } from "./world";

export const BEATS = 96;
export const DURATION = DROP + BEATS * BEAT;
const PH_B = 30.5, PH_C = 44.3;

type Cam2 = { x: number; y: number; z: number };
const worldTf = (ctx: CanvasRenderingContext2D, c: Cam2) => { ctx.scale(c.z, c.z); ctx.translate(-c.x, -c.y); };
const fillPath = (ctx: CanvasRenderingContext2D, p: Path2D, color: string, alpha = 1) => { if (alpha <= 0.003) return; ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.fill(p, "evenodd"); ctx.globalAlpha = 1; };
const placed = (rings: ReadonlyArray<ReadonlyArray<readonly [number, number]>>, p: Pose, scale: number) => placeRings(rings, placer(p, scale));
const atZ = (z: number): Frame => ({ ...FRONT, o: [0, 0, z] });

// ——— phase A: level 1, flat front view (2D canvas + the 3D world drawn through a flat camera) ———
function phaseA(ctx: CanvasRenderingContext2D, b: number) {
  const cam = camera1(b);
  ctx.save(); worldTf(ctx, cam); drawLevel1(ctx, b, cam); ctx.restore();
  drawSolids(ctx, view(flatFront(cam.x, cam.y, cam.z)), solids(b));
  ctx.save(); worldTf(ctx, cam);
  const sg = signRings(b);
  fillPath(ctx, ringsPath(sg.post), "#ffc531"); fillPath(ctx, ringsPath(sg.rings), INK);
  const poses = players1(b), bodies = [body1(b), body2(b)];
  if (b >= MORPHED) poses.forEach((p, i) => fillPath(ctx, ringsPath(placed(bodies[i].rings, p, bodies[i].scale)), COLORS[i]));
  drawBubble(ctx, b, poses[0]);
  for (const r of RADS1) drawRadical(ctx, r, b, bb => placer(players1(bb)[r.who], (r.who ? body2 : body1)(bb).scale));
  for (const [i, L] of [LAND1, LAND2].entries()) for (const l of L) if (b > l.b && b < l.b + 1 && l.b > 2) dust(ctx, [l.x, l.y], b - l.b, l.y > FLOOR + 20 ? CREAM : INK, Math.round(l.b * 100) + i, l.power * ((i === 0 && l.b > 26 && l.b < 28) ? 1.8 : 1));
  drawPops(ctx, POPS1, b, pp => { const i = pp.color === P2 ? 1 : 0, p = players1(pp.b)[i]; return pp.color === P1 || pp.color === P2 ? [p.x, p.y - HEIGHT * bodies[i].scale - 56] : pp.text.startsWith("闩") ? [2250, -470] : [p.x + 40, p.y - 270]; }, cam.z);
  ctx.restore();
  return { cam, poses };
}

// ——— phase B: the pipe (the camera swings in 3D) ———
const HOLE_RING = [[[HOLE.x0, HOLE.y0], [HOLE.x1, HOLE.y0], [HOLE.x1, HOLE.y1], [HOLE.x0, HOLE.y1]]] as Array<Array<[number, number]>>;
function drawExiting(ctx: CanvasRenderingContext2D, v: View, b: number) {
  const ps = players3(b), bodies = [body31(b), body32(b)], f = sideFrame(X3);
  ps.forEach((p, i) => { if (b < TUBE[i].out) return; fillPath(ctx, flatPath(v, f, placed(bodies[i].rings, p, bodies[i].scale * emerge(i, b))), COLORS[i]); });
}
function phaseB(ctx: CanvasRenderingContext2D, b: number) {
  const cam = camera2(b), v = view(cam);
  ctx.fillStyle = INK; ctx.fillRect(-700, -400, 1400, 800);
  fillPath(ctx, flatPath(v, atZ(180), shapeRings(shaftRect)), SHAFT);
  drawSolids(ctx, v, solids(b));
  const sg = signRings(b);
  fillPath(ctx, flatPath(v, FRONT, sg.post), "#ffc531"); fillPath(ctx, flatPath(v, atZ(-1), sg.rings), INK);
  const poses = players1(b), bodies = [body1(b), body2(b)];
  poses.forEach((p, i) => {
    if (b >= TUBE[i].in) return;
    const path = flatPath(v, atZ(p.z), placed(bodies[i].rings, p, bodies[i].scale));
    if (p.z > 1) { ctx.save(); ctx.clip(flatPath(v, FRONT, HOLE_RING)); fillPath(ctx, path, COLORS[i], 1 - smooth(span(b, TUBE[i].in - 0.3, TUBE[i].in))); ctx.restore(); }
    else fillPath(ctx, path, COLORS[i]);
  });
  drawExiting(ctx, v, b);
  return cam;
}

// ——— phase C: level 3, flat side view ———
function camC(b: number) {
  const c = camera3(b);
  return lerpCam(C3, flatSide(c.x, c.y, c.z, X3), smooth(span(b, 44.6, 46.8)));
}
function phaseC(ctx: CanvasRenderingContext2D, b: number) {
  const cam = camC(b), z = cam.f / FAR, c2: Cam2 = { x: cam.t[2], y: cam.t[1], z };
  ctx.fillStyle = INK; ctx.fillRect(-700, -400, 1400, 800);
  ctx.save(); worldTf(ctx, c2); drawLevel3Back(ctx, b, c2); ctx.restore();
  if (c2.x - 720 / z < Z1 + W + 300) drawSolids(ctx, view(cam), solids(b));
  ctx.save(); worldTf(ctx, c2);
  drawLevel3(ctx, b, c2);
  const ps = players3(b), bodies = [body31(b), body32(b)], fade = 1 - smooth(span(b, FUSE, FUSE + 0.25));
  ps.forEach((p, i) => { if (b < TUBE[i].out) return; fillPath(ctx, ringsPath(placed(bodies[i].rings, p, bodies[i].scale * emerge(i, b))), COLORS[i], fade); });
  if (b > FUSE) drawHug(ctx, b, hugPose(b), smooth(span(b, FUSE, FUSE + 0.25)));
  for (const r of RADS3) drawRadical(ctx, r, b, bb => placer(players3(bb)[0], body31(bb).scale));
  drawPops(ctx, POPS3, b, pp => { const h = pp.b > FUSE ? hugPose(pp.b) : null, [e, t] = players3(pp.b); const p = h ?? (pp.text === "日 + 一 = 旦" ? { x: (e.x + t.x) / 2, y: e.y - 160 } : e); return [p.x + (pp.text.length === 1 ? 140 : 0), p.y - HEIGHT - (h ? 110 : 60)] as V; }, z);
  ctx.restore();
  return c2;
}

// ——— HUD (screen space) ———
const TAGS = [uiText("1P", [0, 0], 18, 0.1), uiText("2P", [0, 0], 18, 0.1)];
const TITLE = uiText("双人游戏", [0, -262], 30, 0.5), EQ = uiText("包 + 包", [0, 262], 28, 0.3), PRESS = uiText("按 开始", [0, 262], 24, 0.5);
const CARDS: Array<[number, number, Slot[]]> = [
  [8, 12.5, uiText("第一关 · 偏旁", [0, 0], 18, 0.3)], [31.5, 36, uiText("第二关 · 管道", [0, 0], 18, 0.3)], [46, 50.5, uiText("第三关 · 变化", [0, 0], 18, 0.3)],
];
function hudColor(b: number) { return b < 30 ? INK : mix(CREAM, INK, dawn(b)); }
function drawHud(ctx: CanvasRenderingContext2D, b: number, a: { cam: Cam2; poses: Pose[] } | null) {
  const col = hudColor(b);
  fillSlots(ctx, EQ, col, smooth(span(b, -2.2, -1.4)) * (1 - smooth(span(b, 1.8, 2.5))));
  fillSlots(ctx, TITLE, col, smooth(span(b, 1.6, 2.4)) * (1 - smooth(span(b, 6.4, 7.2))));
  fillSlots(ctx, PRESS, col, b >= 3 && b < 6.4 ? (b % 1 < 0.6 ? 1 : 0.15) : 0);
  if (a) {
    const tagA = smooth(span(b, 2, 2.5)) * (1 - smooth(span(b, 9, 10)));
    if (tagA > 0) a.poses.forEach((p, i) => { ctx.save(); ctx.translate((p.x - a.cam.x) * a.cam.z, (p.y - HEIGHT - 26 - a.cam.y) * a.cam.z); fillSlots(ctx, TAGS[i], COLORS[i], tagA); ctx.restore(); });
  }
  for (const [a0, a1, sl] of CARDS) {
    const al = smooth(span(b, a0, a0 + 0.5)) * (1 - smooth(span(b, a1 - 0.6, a1)));
    if (al <= 0) continue;
    ctx.save(); ctx.translate(-590 - sl[0].x, -318); fillSlots(ctx, sl, col, al); ctx.restore();
  }
}

/** where the hug is on screen when the iris opens (fixed, so the card's 抱 starts exactly there) */
function cardFrom() { const cam = camC(IRIS[0]), z = cam.f / FAR, h = hugPose(IRIS[0]); return { x: (h.x - cam.t[2]) * z, y: (h.y - cam.t[1]) * z, s: z * 150 / 330 }; }

export function drawBao(ctx: CanvasRenderingContext2D, t: number) {
  const b = (t - DROP) / BEAT;
  ctx.save(); ctx.translate(640, 360);
  if (b < -3.6) { prewarm1(); prewarmBodies([BODY1, BODY2, BODY3_1]); prewarm3(); prewarm4(); }
  let a: { cam: Cam2; poses: Pose[] } | null = null;
  if (b < PH_B) a = phaseA(ctx, b);
  else if (b < PH_C) phaseB(ctx, b);
  else if (b < IRIS[1]) {
    const c2 = phaseC(ctx, b);
    if (b >= IRIS[0]) {
      const from = cardFrom(), at = { x: from.x, y: from.y - HEIGHT * 0.7 * c2.z };
      drawIris(ctx, b, at, () => drawCard(ctx, b, from));
    }
  } else {
    drawCard(ctx, b, cardFrom());
  }
  if (b < IRIS[0] + 0.6) drawHud(ctx, b, a);
  ctx.restore();
}
void [X1, X2, MOUTH, FUSE, P1];

export const scene: MorphScene = { id: "mm-bao", title: "MM79 · 包包", duration: DURATION, draw: drawBao };
