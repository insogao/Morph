import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import type { Vec2 } from "../../packages/morph-engine/src/vector/geom";
import type { Placement } from "../../packages/morph-engine/src/vector/bitmap";
import { drawMeshTexture, loadArt, type Art } from "../../packages/morph-engine/src/vector/bitmap-render";
import { boundaryAt, meshAt } from "../../packages/morph-engine/src/vector/mesh";
import { curve } from "../../packages/morph-engine/src/vector/camera-move";
import { apply, compose, inverse, lerpSim, KOI_EYE, LANDMARKS, PARTS, S0, P_W, type PartRig } from "./rig";
import swBody from "./swallow/body.png?inline";
import swWingL from "./swallow/wing_left.png?inline";
import swWingR from "./swallow/wing_right.png?inline";
import swTail from "./swallow/tail.png?inline";
import koiBody from "./koi/body.png?inline";
import koiDorsal from "./koi/dorsal.png?inline";
import koiPectoral from "./koi/pectoral.png?inline";
import koiTail from "./koi/tail.png?inline";
import koiEye from "./koi/eye.png?inline";

/*
 * MM81 — an ink-wash swallow (top view) skims down to the water, touches it with its beak and becomes a gongbi koi.
 *
 * Route: layered cut-out bitmaps → traced outlines per layer → per-part TEXTURE MESH WARP (MM15) + part remap by
 * meaning. The painted texture of every part rides its own triangle mesh, so feathers stretch into fin rays.
 *   body        → body        (core: beak → snout, rump → tail root)
 *   wing right  → dorsal fin  (spread: after the left turn it points up; it folds back over the back first)
 *   wing left   → pectoral fin(spread: points down after the turn; folds back, shrinks, comes in front of the body)
 *   two tail streamers → upper / lower lobe of the forked caudal fin (they widen and close into one fan)
 *   koi eye     born with the colour, on the head (the swallow's eye has no layer of its own)
 * Colour: the koi's paint blooms outward from where the beak touched the water (a radial front, like pigment
 * spreading in water); A is removed and B added under the same front, on the same in-between geometry.
 * Cause: the glide, the left bank, the shadow closing in on the bird, the wings sweeping back for the dive.
 * Payoff: things only a fish does — the tail beats (side view: it foreshortens) and the pectoral fin paddles.
 */

const PLACE: Placement = { at: [0, 0], scale: 2 / 3, center: [0, 0] }; // 1920 × 1080 art ↔ 1280 × 720 design
const DURATION = 8.0;
const CONTACT = 2.05;

const art: { a: Record<string, Art>; b: Record<string, Art> } | null = typeof Image === "undefined" ? null : await (async () => {
  const [ab, al, ar, at, bb, bd, bp, bt, be] = await Promise.all([swBody, swWingL, swWingR, swTail, koiBody, koiDorsal, koiPectoral, koiTail, koiEye].map(loadArt));
  return { a: { body: ab, wing_left: al, wing_right: ar, tail: at }, b: { body: bb, dorsal: bd, pectoral: bp, tail: bt, eye: be } };
})();

// ---- Clock. Every channel has its own window; they overlap. ----
const sm = (x: number) => { const u = Math.max(0, Math.min(1, x)); return u * u * (3 - 2 * u); };
const win = (t: number, a: number, b: number) => sm((t - a) / (b - a));
/** Warp ease: slow out of the pose, fastest mid-way, long settle. */
const warpEase = (x: number) => { const u = Math.max(0, Math.min(1, x)); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
const WARP: Record<string, [number, number]> = {
  body: [2.0, 4.8], wing_right: [2.1, 4.6], wing_left: [2.2, 4.7], streamer_right: [2.3, 4.9], streamer_left: [2.4, 5.0],
};
const FOLD: Record<string, [number, number]> = { wing_right: [0.85, 2.6], wing_left: [0.95, 2.7] };
const SWIM = 4.4;
const BEAT = 2 * Math.PI * 1.4; // tail beats per second (rad/s)

// ---- Carrier: the whole creature flies on screen. c = where P_W is drawn, φ = heading turn, σ = height (scale). ----
const CX = curve([{ t: 0, v: 760, d: -40 }, { t: 1.0, v: 715, d: -85 }, { t: CONTACT, v: 640, d: -60 }, { t: 2.7, v: 612, d: -40 }, { t: 5.0, v: 548, d: -28 }, { t: DURATION, v: 478, d: -20 }]);
const CY = curve([{ t: 0, v: 430, d: -120 }, { t: 1.0, v: 404, d: -40 }, { t: CONTACT, v: 362, d: 0 }, { t: DURATION, v: 368, d: 0 }]);
const PHI = curve([{ t: 0, v: 1.45, d: -0.25 }, { t: 1.0, v: 0.62, d: -0.75 }, { t: CONTACT, v: 0.1, d: -0.22 }, { t: 2.9, v: 0, d: 0 }]);
const SIGMA = curve([{ t: 0, v: 0.97, d: -0.01 }, { t: CONTACT, v: 0.92, d: 0 }, { t: 4.6, v: 1.0, d: 0 }]);
/** Screen transform of W at time t. */
function carrier(t: number): DOMMatrix2DInit & { apply: (p: Vec2) => Vec2 } {
  // Each tail beat pushes the koi forward: v = −32·(1 − cos ωt), which starts from zero.
  const sw = Math.max(0, t - SWIM), surge = -32 * (sw - Math.sin(BEAT * sw) / BEAT);
  const c: Vec2 = [CX(t) + surge, CY(t)], phi = PHI(t), s = SIGMA(t);
  const cos = Math.cos(phi) * s, sin = Math.sin(phi) * s;
  const e = c[0] - (cos * P_W[0] - sin * P_W[1]), f = c[1] - (sin * P_W[0] + cos * P_W[1]);
  return { a: cos, b: sin, c: -sin, d: cos, e, f, apply: ([x, y]) => [cos * x - sin * y + e, sin * x + cos * y + f] };
}

// ---- Colour front: radial from the beak's contact point (W space). ----
const FRONT_C = apply(S0, LANDMARKS.BEAK);
const FRONT_W = 150, FRONT_MAX = 760;
const frontR = (t: number) => { const x = Math.max(0, Math.min(1, (t - CONTACT + 0.05) / 2.95)); return FRONT_MAX * (0.18 * x + 0.82 * sm(x)); };

// ---- Per-part geometry at t. ----
const QI: Record<string, ReturnType<typeof inverse>> = Object.fromEntries(Object.values(PARTS).map(p => [p.id, inverse(p.Q)]));
const EYE_TRIS = (() => {
  const m = PARTS.body.mesh;
  return m.tris.filter(([i, j, k]) => {
    const cx = (m.onB[i][0] + m.onB[j][0] + m.onB[k][0]) / 3, cy = (m.onB[i][1] + m.onB[j][1] + m.onB[k][1]) / 3;
    return Math.hypot(cx - KOI_EYE[0], cy - KOI_EYE[1]) < 26;
  });
})();
const TAIL_ROOT_X = LANDMARKS.ROOT[0] + 4;

function geometry(p: PartRig, t: number): Vec2[] {
  const [w0, w1] = WARP[p.id];
  const u = warpEase((t - w0) / (w1 - w0));
  const pos = meshAt(p.mesh, boundaryAt(p.mesh, u));
  const fold = FOLD[p.id];
  let out = pos;
  if (fold) {
    const lam = win(t, fold[0], fold[1]);
    if (lam < 1) {
      const M = compose(lerpSim(S0, p.Q, p.anchor, lam), QI[p.id]);
      out = pos.map(q => apply(M, q));
    }
  }
  // Payoff (only a fish does this): the caudal fin beats — seen from the side it foreshortens about its root —
  // and the pectoral fin paddles about its base.
  const sw = t - SWIM;
  if (sw > 0) {
    const amp = win(t, SWIM, SWIM + 0.9);
    if (p.id.startsWith("streamer") || p.id === "body") {
      const k = 1 - 0.34 * amp * 0.5 * (1 - Math.cos(BEAT * sw));
      const lift = 7 * amp * Math.sin(BEAT * sw - 0.6);
      out = out.map(([x, y]) => x > TAIL_ROOT_X ? [TAIL_ROOT_X + (x - TAIL_ROOT_X) * k, y + lift * (x - TAIL_ROOT_X) / 180] as Vec2 : [x, y] as Vec2);
    }
    if (p.id === "wing_left") {
      const a = 0.2 * win(t, SWIM + 0.2, SWIM + 1.0) * Math.sin(2 * Math.PI * 0.9 * (t - SWIM - 0.2));
      const [rx, ry] = LANDMARKS.PECT_ROOT, c = Math.cos(a), s = Math.sin(a);
      out = out.map(([x, y]) => [rx + (x - rx) * c - (y - ry) * s, ry + (x - rx) * s + (y - ry) * c] as Vec2);
    }
  }
  return out;
}

// ---- Drawing. ----
let layer: CanvasRenderingContext2D | null = null;
let shade: CanvasRenderingContext2D | null = null;
let shadeBlur: CanvasRenderingContext2D | null = null;
const ensure = (c: CanvasRenderingContext2D | null, w: number, h: number) => {
  const g = c ?? document.createElement("canvas").getContext("2d")!;
  if (g.canvas.width !== w || g.canvas.height !== h) { g.canvas.width = w; g.canvas.height = h; }
  return g;
};

type Item = { p: PartRig; pos: Vec2[]; alpha: number };

/**
 * Paint the parts (in paint order) with A's texture outside the colour front and B's inside it, on the same
 * in-between geometry. One layer per side, so the front is masked twice per frame rather than twice per part.
 */
function paintAll(ctx: CanvasRenderingContext2D, items: Item[], r: number) {
  if (!art) return;
  const paintA = (g: CanvasRenderingContext2D) => { for (const { p, pos, alpha } of items) drawMeshTexture(g, art!.a[p.artA], PLACE, p.texA, pos, p.mesh.tris, alpha); };
  const paintB = (g: CanvasRenderingContext2D) => {
    for (const { p, pos, alpha } of items) {
      drawMeshTexture(g, art!.b[p.artB], PLACE, p.mesh.onB, pos, p.mesh.tris, alpha);
      if (p.id === "body") drawMeshTexture(g, art!.b.eye, PLACE, p.mesh.onB, pos, EYE_TRIS, alpha);
    }
  };
  if (r <= 0) return paintA(ctx);
  if (r >= FRONT_MAX) return paintB(ctx);
  masked(ctx, "out", r, paintA);
  masked(ctx, "in", r, paintB);
}

function masked(ctx: CanvasRenderingContext2D, keep: "in" | "out", r: number, paint: (g: CanvasRenderingContext2D) => void) {
  const L = layer!;
  L.setTransform(1, 0, 0, 1, 0, 0);
  L.clearRect(0, 0, L.canvas.width, L.canvas.height);
  L.setTransform(ctx.getTransform());
  paint(L);
  L.globalCompositeOperation = keep === "in" ? "destination-in" : "destination-out";
  const g = L.createRadialGradient(FRONT_C[0], FRONT_C[1], Math.max(0, r - FRONT_W), FRONT_C[0], FRONT_C[1], Math.max(1, r));
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  L.fillStyle = g;
  L.fillRect(-1500, -1500, 4000, 4000);
  L.globalCompositeOperation = "source-over";
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(L.canvas, 0, 0);
  ctx.restore();
}

function paper(ctx: CanvasRenderingContext2D) {
  const g = ctx.createRadialGradient(640, 340, 120, 640, 360, 860);
  g.addColorStop(0, "#f7f2e7");
  g.addColorStop(1, "#e4dac6");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1280, 720);
}

/** Rings on the water where the beak touched it (top view: circles), screen space. */
function ripples(ctx: CanvasRenderingContext2D, t: number) {
  const at = carrier(CONTACT).apply(FRONT_C);
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const life = (t - CONTACT - i * 0.28) / 2.6;
    if (life <= 0 || life >= 1) continue;
    const e = 1 - Math.pow(1 - life, 2.4);
    ctx.globalAlpha = 0.3 * (1 - life) * (1 - i * 0.22);
    ctx.strokeStyle = "#4b5a5e";
    ctx.lineWidth = 2.2 - 1.4 * life;
    ctx.beginPath();
    ctx.arc(at[0], at[1], 6 + e * (300 - i * 40), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The swallow's shadow on the water closes in on it as it descends (top view depth cue). While it is visible the
 * warp has not started, so the layer images are drawn rigidly in their current pose (cheap, and identical).
 */
function shadow(ctx: CanvasRenderingContext2D, t: number) {
  const fade = 1 - win(t, CONTACT - 0.25, CONTACT + 0.2);
  if (fade <= 0 || !art) return;
  const h = 1 - sm(t / CONTACT);              // height above the water
  const S = shade!, k = 0.5;
  S.setTransform(1, 0, 0, 1, 0, 0);
  S.clearRect(0, 0, S.canvas.width, S.canvas.height);
  const G = carrier(t), ox = 58 * h + 4, oy = 84 * h + 6;
  for (const p of Object.values(PARTS)) {
    if (p.id === "streamer_left") continue;  // both streamers share the tail layer
    const fold = FOLD[p.id], M = fold ? lerpSim(S0, p.Q, p.anchor, win(t, fold[0], fold[1])) : S0;
    S.setTransform(G.a! * k, G.b! * k, G.c! * k, G.d! * k, (G.e! + ox) * k, (G.f! + oy) * k);
    S.transform(M.m[0], M.m[1], -M.m[1], M.m[0], M.b[0], M.b[1]);
    const A = art.a[p.artA];
    S.drawImage(A.img, 0, 0, A.width * PLACE.scale, A.height * PLACE.scale);
  }
  // Blur at half resolution (the shadow is soft anyway), then lay it on the water.
  const B = shadeBlur!;
  B.setTransform(1, 0, 0, 1, 0, 0);
  B.clearRect(0, 0, B.canvas.width, B.canvas.height);
  B.filter = `brightness(0) blur(${((3 + 9 * h) * k).toFixed(2)}px)`;
  B.drawImage(S.canvas, 0, 0);
  B.filter = "none";
  ctx.save();
  ctx.globalAlpha = (0.16 + 0.1 * (1 - h)) * fade;
  ctx.drawImage(B.canvas, 0, 0, B.canvas.width, B.canvas.height, 0, 0, 1280, 720);
  ctx.restore();
}

export const scene: MorphScene = {
  id: "r2-swallow-koi",
  title: "MM81 · 水墨燕 → 工笔锦鲤（分层位图描摹 + 逐部件网格形变）",
  duration: DURATION,
  draw(ctx, t) {
    layer = ensure(layer, ctx.canvas.width, ctx.canvas.height);
    shade = ensure(shade, 640, 360);
    shadeBlur = ensure(shadeBlur, 640, 360);
    paper(ctx);
    ripples(ctx, t);
    shadow(ctx, t);
    const geo = (id: string) => geometry(PARTS[id], t);
    const r = frontR(t);
    const G = carrier(t);
    ctx.save();
    ctx.transform(G.a!, G.b!, G.c!, G.d!, G.e!, G.f!);
    // Paint order: dorsal-to-be and tail behind the body; the near wing (→ pectoral) crosses to the front as it folds.
    const front = win(t, 1.7, 2.3), near = geo("wing_left");
    const items: Item[] = ["wing_right", "streamer_right", "streamer_left"].map(id => ({ p: PARTS[id], pos: geo(id), alpha: 1 }));
    if (front < 1) items.push({ p: PARTS.wing_left, pos: near, alpha: 1 });
    items.push({ p: PARTS.body, pos: geo("body"), alpha: 1 });
    if (front > 0) items.push({ p: PARTS.wing_left, pos: near, alpha: front });
    paintAll(ctx, items, r);
    ctx.restore();
    ctx.fillStyle = "rgba(70,60,48,.55)";
    ctx.font = "12px Georgia, serif";
    ctx.fillText("燕 → 鲤   ink-wash swallow → gongbi koi · per-layer texture mesh warp", 48, 52);
  },
};
