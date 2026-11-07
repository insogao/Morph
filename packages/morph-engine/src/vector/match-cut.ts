import type { MorphScene } from "../core/scene";
import { contains, type Ring, type Vec2 } from "./geom";
import { morphShapes, type MorphOptions, type ShapeMorph } from "./morph";
import { framePath, mixColor } from "./render";
import { alignEllipse, applyCam, applySim, camThrough, composeSim, describeMask, describeShape, frameEllipse, HOME, invertSim, mapEllipse, simOfPlacement, type Cam, type Ellipse, type Similarity } from "./rhyme";
import { cameraMotion, planMove, type Move, type MoveStyle } from "./camera-move";
import { mapShape, type Shape } from "./shape";
import { ease } from "./timeline";
import type { Art } from "./bitmap-render";
import { fieldMorph } from "./sdf-field";
import type { Placement } from "./bitmap";

/**
 * Shape-rhyme match cut.
 *
 *   A → the camera gathers back, then accelerates IN on A's rhyme part → the hand-off starts before the camera
 *   arrives and ends after it has left (the roll is at full speed through it) → the pull-out overshoots and settles
 *   on B, framed exactly as it would be alone.
 *
 * style "swing" (default): the rhyme part is held filling `fill` of the frame while the camera swings around it.
 * style "dive" (FPV): the camera dives INTO the rhyme part until its colour fills the whole frame — the hide moment —
 *   swaps there, and bursts back out of B's part. Fast, with real motion blur.
 *
 * Both drawings are given in their own home layout (1280 × 720, as if each were the only drawing).
 */

export interface CutPart { id: string; shape: Shape; fill: string }

/** Seconds. go: end of the anticipation · peak: the rhyme moment · land: end of the overshoot · settle · end. */
export interface CutTimes { go: number; peak: number; land: number; settle: number; end: number }
export const DEFAULT_TIMES: CutTimes = { go: 0.9, peak: 2.9, land: 4.9, settle: 5.8, end: 7.6 };

interface MoveOptions {
  style?: MoveStyle;
  times?: Partial<CutTimes>;
  /** Extra bank at the rhyme moment (radians), unwinding by the end. */
  swing?: number;
  /** Motion blur: shutter in seconds (default 1/60; 0 = off). Samples adapt to how far the frame moves. */
  shutter?: number;
}

export interface MatchCutOptions extends MoveOptions {
  id: string;
  title: string;
  a: { parts: CutPart[]; background: string };
  b: { parts: CutPart[]; background: string };
  rhyme: { a: string; b: string };
  /**
   * Secondary pairs that sit near each other once B is laid over A (cup → pot around coffee → soil). They morph
   * during the hand-off instead of cross-fading — a cross-fade of two different big shapes is a muddy double exposure.
   */
  pairs?: Array<[string, string]>;
  /** swing: share of the frame width the rhyme part fills at the peak (default 0.7). */
  fill?: number;
  morph?: MorphOptions;
  /** Override the computed alignment (B home → A world), e.g. from tools/rhyme.ts. */
  align?: Similarity;
  decorate?: (ctx: CanvasRenderingContext2D, layer: "a" | "b", t: number, info: CutInfo) => void;
  overlay?: (ctx: CanvasRenderingContext2D, t: number, info: CutInfo) => void;
}

export interface CutInfo { cam: Cam; hand: number; align: Similarity }

/** Hand-off window around the peak: it starts before the camera arrives and ends after it has left. */
export function handWindow(T: CutTimes, style: MoveStyle): [number, number] {
  if (style === "dive") return [T.peak - 0.28, T.peak + 0.28];
  return [T.peak - 0.36 * (T.peak - T.go), T.peak + 0.45 * (T.land - T.peak)];
}

const distToRing = (r: Ring, p: Vec2) => {
  let m = Infinity;
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey || 1;
    const u = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / l2));
    m = Math.min(m, Math.hypot(p[0] - a[0] - ex * u, p[1] - a[1] - ey * u));
  }
  return m;
};
const inside = (s: Shape, p: Vec2) => s.pieces.some(q => contains(q.outer, p) && !q.holes.some(h => contains(h, p)));
const clearance = (s: Shape, p: Vec2) => Math.min(...s.pieces.flatMap(q => [q.outer, ...q.holes]).map(r => distToRing(r, p)));

/** The point inside BOTH shapes farthest from either boundary (where a dive can fill the frame with colour). */
export function coverPoint(a: Shape, b: Shape, e: Ellipse): { p: Vec2; r: number } {
  let best: { p: Vec2; r: number } = { p: e.c, r: 0 };
  const n = 36, R = e.a * 1.05;
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
    const p: Vec2 = [e.c[0] - R + 2 * R * i / n, e.c[1] - R + 2 * R * j / n];
    if (!inside(a, p) || !inside(b, p)) continue;
    const r = Math.min(clearance(a, p), clearance(b, p));
    if (r > best.r) best = { p, r };
  }
  return best;
}

const HALF_DIAG = Math.hypot(640, 360);

const SCRATCH = new Map<string, CanvasRenderingContext2D>();
function scratch(ctx: CanvasRenderingContext2D, name: string): CanvasRenderingContext2D {
  const w = ctx.canvas.width, h = ctx.canvas.height, key = name + ":" + w + "x" + h;
  let l = SCRATCH.get(key);
  if (!l) {
    const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
    l = c.getContext("2d") as CanvasRenderingContext2D;
    SCRATCH.set(key, l);
  }
  return l;
}

/**
 * Frame renderer with REAL motion blur: sub-frames over the shutter are averaged, as many as the frame's motion
 * needs (none when the camera is slow). Not a smear effect — the same picture at nearby instants.
 */
function withBlur(cam: (t: number) => Cam, shutter: number, render: (ctx: CanvasRenderingContext2D, t: number) => void) {
  return (ctx: CanvasRenderingContext2D, t: number) => {
    const n = shutter > 0 ? Math.max(1, Math.min(10, Math.ceil(cameraMotion(cam(t - shutter / 2), cam(t + shutter / 2)) / 6))) : 1;
    if (n === 1) { render(ctx, t); return; }
    const acc = scratch(ctx, "acc");
    acc.setTransform(1, 0, 0, 1, 0, 0);
    acc.clearRect(0, 0, acc.canvas.width, acc.canvas.height);
    for (let k = 0; k < n; k++) {
      const sub = scratch(ctx, "sub");
      sub.setTransform(1, 0, 0, 1, 0, 0);
      sub.clearRect(0, 0, sub.canvas.width, sub.canvas.height);
      sub.setTransform(ctx.getTransform());
      render(sub, t - shutter / 2 + shutter * (k + 0.5) / n);
      acc.globalAlpha = 1 / (k + 1);                     // running average
      acc.drawImage(sub.canvas, 0, 0);
    }
    acc.globalAlpha = 1;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(acc.canvas, 0, 0);
    ctx.restore();
  };
}

export interface MatchCut {
  align: Similarity;
  move: Move;
  times: CutTimes;
  hand: (t: number) => number;
  morphs: Map<string, { b: string; morph: ShapeMorph }>;
}

/** The pure part (testable): alignment, camera move, hand-off clock, morph pairs. */
export function planMatchCut(opts: MatchCutOptions): MatchCut {
  const ra = opts.a.parts.find(p => p.id === opts.rhyme.a), rb = opts.b.parts.find(p => p.id === opts.rhyme.b);
  if (!ra) throw new Error("No part " + opts.rhyme.a + " in A. Parts: " + opts.a.parts.map(p => p.id).join(", "));
  if (!rb) throw new Error("No part " + opts.rhyme.b + " in B. Parts: " + opts.b.parts.map(p => p.id).join(", "));
  const style = opts.style ?? "swing", T = { ...DEFAULT_TIMES, ...opts.times };
  const eA = describeShape(ra.shape).ellipse;
  const align = opts.align ?? alignEllipse(eA, describeShape(rb.shape).ellipse);
  const end = camThrough(align);
  let peak: Cam;
  if (style === "dive") {
    const cover = coverPoint(ra.shape, mapShape(rb.shape, p => applySim(align, p)), eA);
    if (cover.r <= 0) throw new Error("dive: the two rhyme parts share no interior; use style swing.");
    peak = { c: cover.p, zoom: 1.1 * HALF_DIAG / cover.r, angle: 0 };
  } else peak = frameEllipse(eA, opts.fill ?? 0.7);
  const move = planMove({ home: HOME, peak, end, times: T, style, swing: opts.swing });
  const [h0, h1] = handWindow(T, style);
  const hand = (t: number) => ease("inOut", Math.max(0, Math.min(1, (t - h0) / (h1 - h0))));
  const morphs = new Map<string, { b: string; morph: ShapeMorph }>();
  for (const [ia, ib] of [[opts.rhyme.a, opts.rhyme.b], ...(opts.pairs ?? [])]) {
    const pa = opts.a.parts.find(p => p.id === ia), pb = opts.b.parts.find(p => p.id === ib);
    if (!pa || !pb) throw new Error("Pair " + ia + " → " + ib + ": part not found.");
    if (morphs.has(ia) || [...morphs.values()].some(m => m.b === ib)) throw new Error("Part paired twice: " + ia + " / " + ib);
    morphs.set(ia, { b: ib, morph: morphShapes(pa.shape, mapShape(pb.shape, p => applySim(align, p)), opts.morph ?? {}) });
  }
  return { align, move, times: T, hand, morphs };
}

export function matchCutScene(opts: MatchCutOptions): MorphScene {
  const plan = planMatchCut(opts);
  const S = plan.align, cam = (t: number) => plan.move.camAt(t);
  const bParts = opts.b.parts.map(p => ({ ...p, shape: mapShape(p.shape, q => applySim(S, q)) }));
  const smooth = (x: number) => { const v = Math.max(0, Math.min(1, x)); return v * v * (3 - 2 * v); };
  const render = (ctx: CanvasRenderingContext2D, t: number) => {
    const c = cam(t), h = plan.hand(t), info: CutInfo = { cam: c, hand: h, align: S };
    ctx.fillStyle = mixColor(opts.a.background, opts.b.background, h);
    ctx.fillRect(0, 0, 1280, 720);
    // Pairs morph in layers: the rhyme first, its neighbours a beat later (overlapping, not chained).
    const now = new Map<string, { frame: ReturnType<ShapeMorph["at"]>; fill: string }>();
    let i = 0;
    for (const [ia, { b, morph }] of plan.morphs) {
      const lag = i++ === 0 ? 0 : 0.12, k = smooth((h - lag) / (1 - lag));
      const pa = opts.a.parts.find(p => p.id === ia)!, pb = opts.b.parts.find(p => p.id === b)!;
      const v = { frame: morph.at(k), fill: mixColor(pa.fill, pb.fill, k) };
      now.set("a:" + ia, v); now.set("b:" + b, v);
    }
    const layer = (which: "a" | "b", alpha: number) => {
      if (alpha <= 0.001) return;
      const l = scratch(ctx, "layer");
      l.setTransform(1, 0, 0, 1, 0, 0);
      l.clearRect(0, 0, l.canvas.width, l.canvas.height);
      l.setTransform(ctx.getTransform());
      l.save();
      applyCam(l, c);
      for (const p of which === "a" ? opts.a.parts : bParts) {
        const m = now.get(which + ":" + p.id);
        l.fillStyle = m ? m.fill : p.fill;
        l.fill(framePath(m ? m.frame : p.shape), "nonzero");
      }
      opts.decorate?.(l, which, t, info);
      l.restore();
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = alpha;
      ctx.drawImage(l.canvas, 0, 0);
      ctx.restore();
    };
    // Morphing pairs underneath, opaque (they never thin while the layers cross); each layer repaints them at its
    // own depth with its own occluders.
    ctx.save();
    applyCam(ctx, c);
    for (const p of opts.a.parts) { const m = now.get("a:" + p.id); if (m) { ctx.fillStyle = m.fill; ctx.fill(framePath(m.frame), "nonzero"); } }
    ctx.restore();
    // Leftovers: A's leave in the first 60 % of the hand-off, B's arrive in the last 60 % (short overlap, no ghosts).
    layer("a", 1 - smooth(h / 0.6));
    layer("b", smooth((h - 0.4) / 0.6));
  };
  const draw = withBlur(cam, opts.shutter ?? 1 / 60, render);
  return {
    id: opts.id,
    title: opts.title,
    duration: plan.times.end,
    draw(ctx, t) {
      draw(ctx, t);
      opts.overlay?.(ctx, t, { cam: cam(t), hand: plan.hand(t), align: S });
    },
  };
}

export interface ArtCutOptions extends MoveOptions {
  id: string;
  title: string;
  /** Pictures as they would be framed on their own (placement: art px → 1280 × 720 design). */
  a: { art: Art; placement: Placement; background: string };
  b: { art: Art; placement: Placement; background: string };
  /** A's rhyme region (art px box) — what the camera pushes in on. */
  box: [number, number, number, number];
  /** B art px → A art px, from tools/rhyme.ts (refined by pixel overlap). */
  align: Similarity;
  fill?: number;
  /**
   * Morph the silhouettes before swapping (recommended for flat-toned pictures). The rhymes are SIMILAR, not identical,
   * so a dissolve shows two shapes. Instead, around the rhyme (a disc larger than the frame during the hand-off) both
   * pictures are traced to vector outlines; the hook's outline morphs into the curl's in `ink`, and only once the
   * outlines are identical does the image underneath switch — invisibly.
   */
  silhouette?: { ink: string; window?: [number, number]; /** The cut-outs (with alpha) the toned pictures came from. */ alphaA: Art; alphaB: Art; /** Field grid cells across the disc (default 480). */ grid?: number };
  overlay?: (ctx: CanvasRenderingContext2D, t: number, info: CutInfo) => void;
}

/**
 * Shape-rhyme match cut for pictures (cut-outs or photos): no pixel is deformed. The camera swings in on A's region,
 * B dissolves in laid exactly over it while the camera is still moving, and the pull-out carries on into B.
 */
export function matchCutArtScene(opts: ArtCutOptions): MorphScene & { peakMagnification: number } {
  const T = { ...DEFAULT_TIMES, ...opts.times };
  const pA = simOfPlacement(opts.a.placement), pB = simOfPlacement(opts.b.placement);
  const worldB = composeSim(pA, opts.align);
  const homeWorld = composeSim(worldB, invertSim(pB));
  const e: Ellipse = mapEllipse(pA, describeMask(opts.a.art.data, opts.a.art.width, opts.box, 2).ellipse);
  const peak = frameEllipse(e, opts.fill ?? 0.4);
  const move = planMove({ home: HOME, peak, end: camThrough(homeWorld), times: T, style: "swing", swing: opts.swing });
  // Pictures can't pair their pieces, so a dissolve is a double exposure: keep it short (≈0.6 s) and centred on the
  // fastest, most blurred part of the move, where the eye reads it as one thing changing.
  const h0 = T.peak - 0.28, h1 = T.peak + 0.34;
  const hand = (t: number) => ease("inOut", Math.max(0, Math.min(1, (t - h0) / (h1 - h0))));
  const cam = (t: number) => move.camAt(t);
  const drawArt = (ctx: CanvasRenderingContext2D, art: Art, t: Similarity) => {
    ctx.save();
    ctx.translate(t.to[0], t.to[1]); ctx.rotate(t.angle); ctx.scale(t.scale, t.scale); ctx.translate(-t.from[0], -t.from[1]);
    ctx.drawImage(art.img, 0, 0, art.width, art.height);
    ctx.restore();
  };
  const render = (ctx: CanvasRenderingContext2D, t: number) => {
    const c = cam(t), h = hand(t);
    ctx.fillStyle = mixColor(opts.a.background, opts.b.background, h);
    ctx.fillRect(0, 0, 1280, 720);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    applyCam(ctx, c);
    if (h < 1) drawArt(ctx, opts.a.art, pA);
    if (h > 0) { ctx.globalAlpha = h; drawArt(ctx, opts.b.art, worldB); }
    ctx.restore();
  };
  const sil = opts.silhouette && silhouetteMorph(opts, pA, worldB, e, cam, T);
  const renderSil = (ctx: CanvasRenderingContext2D, t: number) => {
    if (!sil || t < sil.m0 || t >= sil.m1) { render(ctx, t); return; }
    const c = cam(t), k = Math.max(0, Math.min(1, (t - sil.m0) / (sil.m1 - sil.m0)));
    ctx.fillStyle = mixColor(opts.a.background, opts.b.background, k);
    ctx.fillRect(0, 0, 1280, 720);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    applyCam(ctx, c);
    // Outside the disc (off-frame during the hand-off): the picture itself, A then B.
    ctx.save();
    const outside = new Path2D();
    outside.rect(-1e5, -1e5, 2e5, 2e5);
    outside.arc(sil.centre[0], sil.centre[1], sil.radius, 0, Math.PI * 2);
    ctx.clip(outside, "evenodd");
    if (k < 0.5) drawArt(ctx, opts.a.art, pA); else drawArt(ctx, opts.b.art, worldB);
    ctx.restore();
    // Inside: the traced outline of A morphing into the traced outline of B.
    ctx.fillStyle = opts.silhouette!.ink;
    ctx.fill(sil.path(k), "evenodd");
    ctx.restore();
  };
  const draw = withBlur(cam, opts.shutter ?? 1 / 60, sil ? renderSil : render);
  return {
    id: opts.id,
    title: opts.title,
    duration: T.end,
    peakMagnification: opts.a.placement.scale * peak.zoom,
    draw(ctx, t) {
      draw(ctx, t);
      opts.overlay?.(ctx, t, { cam: cam(t), hand: hand(t), align: opts.align });
    },
  };
}

/** Trace both pictures inside a disc that covers the frame for the whole hand-off, and morph the outlines. */
function silhouetteMorph(opts: ArtCutOptions, pA: Similarity, worldB: Similarity, e: Ellipse, cam: (t: number) => Cam, T: CutTimes) {
  // While the camera hovers at the rhyme: the disc stays small, so only the rhyming pieces are inside it.
  const [m0, m1] = opts.silhouette!.window ?? [T.peak - 0.34, T.peak + 0.34];
  // The disc must contain everything on screen while the vector stands in for the pictures.
  let radius = 0;
  for (let t = m0; t <= m1; t += 1 / 120) {
    const c = cam(t);
    radius = Math.max(radius, Math.hypot(c.c[0] - e.c[0], c.c[1] - e.c[1]) + HALF_DIAG / c.zoom);
  }
  radius *= 1.12;
  const centre = e.c;
  // Signed-distance blend of the two silhouettes on one grid over the disc (outline matching twists hooks and spirals).
  const insideOf = (art: Art, sim: Similarity) => {
    const inv = invertSim(sim);
    return (p: Vec2) => {
      if ((p[0] - centre[0]) ** 2 + (p[1] - centre[1]) ** 2 > radius * radius) return false;
      const [x, y] = applySim(inv, p).map(Math.round);
      return x >= 0 && y >= 0 && x < art.width && y < art.height && art.data[(y * art.width + x) * 4 + 3] >= 128;
    };
  };
  const field = fieldMorph(centre, radius, opts.silhouette!.grid ?? 400, insideOf(opts.silhouette!.alphaA, pA), insideOf(opts.silhouette!.alphaB, worldB), 0.5);
  // Blur sub-frames sit close together in k: quantise to 1/240 of the morph and reuse (deterministic either way).
  const cache = new Map<number, Path2D>();
  const path = (k: number) => {
    const q = Math.round(k * 240);
    let p = cache.get(q);
    if (!p) {
      p = new Path2D();
      for (const r of field.at(q / 240)) { p.moveTo(r[0][0], r[0][1]); for (const v of r.slice(1)) p.lineTo(v[0], v[1]); p.closePath(); }
      if (cache.size > 48) cache.delete(cache.keys().next().value!);
      cache.set(q, p);
    }
    return p;
  };
  return { m0, m1, centre, radius, path };
}

/** Convenience for SVG parts: turn a placed SvgDoc into CutParts. */
export const cutParts = (parts: ReadonlyArray<{ id: string; shape: Shape; fill: string | null }>, fallback = "#888"): CutPart[] =>
  parts.map(p => ({ id: p.id, shape: p.shape, fill: p.fill ?? fallback }));
