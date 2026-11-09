import { centroid, rotate, signedArea, wrapPi, type Vec2 } from "./geom";
import { rotationCost } from "./correspond";
import { morphShapes, type Frame, type MorphOptions } from "./morph";
import { mapShape, type Shape } from "./shape";
import { ease as easeFn, type Easing } from "./timeline";
import { mixColor } from "./render";
import type { SvgDoc, SvgPart } from "./svg";

/**
 * Semantic part remapping between two part documents (petal → wing, centre + stem → body).
 *
 * Every source part and every target part must be given a fate by exactly one mapping:
 *   1 → 1   morph            "petal_2" → "wing_ur"
 *   1 → N   split            "petal_1" → ["antenna_l", "antenna_r"]   (clones, each with the target's id)
 *   N → 1   merge            ["center", "stem"] → "body"               (all converge on the target)
 *   N → 0   vanish           "leaf_l" → []      (shrinks into `vanishTo`: a point or a part id)
 *   0 → N   born             [] → "spot_ul"     (grows out of `bornFrom`)
 * N → M with both sides > 1 is refused: break it into smaller mappings.
 */

export interface Mapping {
  from: string | string[];
  to: string | string[];
  /** Normalised time window inside the whole transition. Default [0, 1]. */
  window?: [number, number];
  ease?: Easing;
  /** "pose": fly / turn / scale into the target's pose first, reshape on landing. Default "morph". */
  style?: "morph" | "pose";
  /** Sideways arc of a pose flight, in design pixels (positive bends left of the travel direction). */
  arc?: number;
  /** For splits and merges: delay between successive items, as a fraction of the window. */
  stagger?: number;
  options?: MorphOptions;
  vanishTo?: Vec2 | string;
  bornFrom?: Vec2 | string;
}

export interface PartTrack {
  /** Identity on screen: the target id (or the source id while it vanishes). */
  id: string;
  from?: SvgPart;
  to?: SvgPart;
  kind: "morph" | "split" | "merge" | "vanish" | "born";
  window: [number, number];
  ease: Easing;
  at: (p: number) => Frame;
}

export interface PartFrame { id: string; frame: Frame; fill: string; z: number; kind: PartTrack["kind"]; progress: number }

const EMPTY: Shape = { pieces: [] };
const list = (v: string | string[]) => Array.isArray(v) ? v : [v];

/** Centre, principal-axis angle and size of a shape. */
export function poseOf(shape: Shape): { c: Vec2; angle: number; size: number } {
  const ring = shape.pieces.flatMap(p => p.outer);
  const c = shape.pieces.length === 1 ? centroid(shape.pieces[0].outer) : ring.reduce((s, p) => [s[0] + p[0] / ring.length, s[1] + p[1] / ring.length] as Vec2, [0, 0] as Vec2);
  let xx = 0, yy = 0, xy = 0;
  for (const [x, y] of ring) { const dx = x - c[0], dy = y - c[1]; xx += dx * dx; yy += dy * dy; xy += dx * dy; }
  const area = shape.pieces.reduce((s, p) => s + Math.abs(signedArea(p.outer)), 0);
  return { c, angle: 0.5 * Math.atan2(2 * xy, xx - yy), size: Math.sqrt(area) };
}

/**
 * Pose-first morph: the part travels to the target's position, turns to its axis and takes its
 * size (0 → 70% of the window), then reshapes into the target (35% → 100%), overlapping.
 */
export function poseMorph(a: Shape, b: Shape, options: MorphOptions & { arc?: number } = {}): (p: number) => Frame {
  const pa = poseOf(a), pb = poseOf(b);
  const k = pa.size > 0 ? pb.size / pa.size : 1;
  // The principal axis has no direction: try both and keep the one that matches the outline better.
  const base = wrapPi(pb.angle - pa.angle);
  const candidates = [base, wrapPi(base + Math.PI)];
  const moved = (angle: number) => mapShape(a, p => { const q = rotate(p, angle, pa.c); return [pb.c[0] + (q[0] - pa.c[0]) * k, pb.c[1] + (q[1] - pa.c[1]) * k]; });
  const cost = (angle: number) => rotationCost(moved(angle).pieces[0].outer, b.pieces[0].outer, 0) * (1 + 0.1 * Math.abs(angle));
  const turn = a.pieces.length && b.pieces.length && cost(candidates[1]) < cost(candidates[0]) ? candidates[1] : candidates[0];
  const posed = moved(turn);
  const morph = morphShapes(posed, b, { ...options, rotate: 0 });
  const arc = options.arc ?? 0;
  const travel: Vec2 = [pb.c[0] - pa.c[0], pb.c[1] - pa.c[1]], len = Math.hypot(travel[0], travel[1]) || 1;
  const normal: Vec2 = [-travel[1] / len, travel[0] / len];
  return (p: number) => {
    const u = easeFn("inOut", Math.max(0, Math.min(1, p / 0.7)));
    const v = Math.max(0, Math.min(1.2, (p - 0.35) / 0.65));
    const frame = morph.at(v < 1 ? easeFn("inOut", v) : v);
    // Undo the full pose, then apply the partial one (plus a sideways arc while in flight).
    const lift = arc * Math.sin(Math.PI * u);
    const ku = 1 + (k - 1) * u;
    const ox = pa.c[0] + travel[0] * u + normal[0] * lift, oy = pa.c[1] + travel[1] * u + normal[1] * lift;
    const f = (q: Vec2): Vec2 => {
      const back = rotate([(q[0] - pb.c[0]) / k, (q[1] - pb.c[1]) / k], -turn);
      const r = rotate([back[0] * ku, back[1] * ku], turn * u);
      return [ox + r[0], oy + r[1]];
    };
    return { pieces: frame.pieces.map(piece => ({ outer: piece.outer.map(f), holes: piece.holes.map(h => h.map(f)) })) };
  };
}

export function remapParts(a: SvgDoc, b: SvgDoc, mappings: readonly Mapping[]) {
  const A = new Map(a.parts.map(p => [p.id, p])), B = new Map(b.parts.map(p => [p.id, p]));
  const seenA = new Map<string, number>(), seenB = new Map<string, number>();
  mappings.forEach((m, i) => {
    for (const id of list(m.from)) { if (!A.has(id)) throw new Error("Mapping " + i + ": no source part '" + id + "'."); seenA.set(id, (seenA.get(id) ?? 0) + 1); }
    for (const id of list(m.to)) { if (!B.has(id)) throw new Error("Mapping " + i + ": no target part '" + id + "'."); seenB.set(id, (seenB.get(id) ?? 0) + 1); }
    if (list(m.from).length > 1 && list(m.to).length > 1) throw new Error("Mapping " + i + ": N → M is ambiguous; split it into 1 → N or N → 1 mappings.");
    if (!list(m.from).length && !list(m.to).length) throw new Error("Mapping " + i + " is empty.");
  });
  const unplaced = [...a.parts.filter(p => !seenA.has(p.id)).map(p => "source " + p.id), ...b.parts.filter(p => !seenB.has(p.id)).map(p => "target " + p.id)];
  if (unplaced.length) throw new Error("Every part needs a fate. Unmapped: " + unplaced.join(", ") + ".");
  const twice = [...[...seenA].filter(([, n]) => n > 1).map(([id]) => "source " + id), ...[...seenB].filter(([, n]) => n > 1).map(([id]) => "target " + id)];
  if (twice.length) throw new Error("Parts mapped more than once: " + twice.join(", ") + ".");

  const point = (ref: Vec2 | string | undefined, fallback: Vec2): Vec2 => {
    if (!ref) return fallback;
    if (typeof ref !== "string") return ref;
    const part = B.get(ref) ?? A.get(ref);
    if (!part) throw new Error("No part '" + ref + "' to vanish into / be born from.");
    return poseOf(part.shape).c;
  };
  const tracks: PartTrack[] = [];
  for (const m of mappings) {
    const from = list(m.from).map(id => A.get(id)!), to = list(m.to).map(id => B.get(id)!);
    const window = m.window ?? [0, 1], ease = m.ease ?? "linear";
    const n = Math.max(from.length, to.length), stagger = m.stagger ?? 0;
    const sub = (i: number): [number, number] => {
      const span = window[1] - window[0], d = stagger * span;
      return [window[0] + i * d, window[1] - (n - 1 - i) * d];
    };
    const build = (sa: Shape, sb: Shape) => m.style === "pose" ? poseMorph(sa, sb, { ...m.options, arc: m.arc }) : ((mm => (p: number) => mm.at(p))(morphShapes(sa, sb, { vanish: "partner", ...m.options })));
    if (!to.length) {
      from.forEach((f, i) => {
        const target = point(m.vanishTo, poseOf(f.shape).c);
        const mm = morphShapes(f.shape, EMPTY, { vanish: target });
        tracks.push({ id: f.id, from: f, kind: "vanish", window: sub(i), ease, at: p => mm.at(p) });
      });
    } else if (!from.length) {
      to.forEach((t, i) => {
        const source = point(m.bornFrom, poseOf(t.shape).c);
        const mm = morphShapes(EMPTY, t.shape, { vanish: source });
        tracks.push({ id: t.id, to: t, kind: "born", window: sub(i), ease, at: p => mm.at(p) });
      });
    } else if (from.length === 1 && to.length === 1 && from[0].shape.pieces.length === 1 && to[0].shape.pieces.length >= 3) {
      // One solid part → a part made of many pieces (a body → a ring of 12 petals). Piece matching alone would pair
      // ONE piece and grow the rest from points; split instead: every piece gets its own copy of the source.
      const pieces = to[0].shape.pieces, k = pieces.length, d = (m.stagger ?? 0.4 / k) * (window[1] - window[0]);
      pieces.forEach((pc, i) => tracks.push({ id: to[0].id + "#" + i, from: from[0], to: to[0], kind: "split", ease,
        window: [window[0] + i * d, window[1] - (k - 1 - i) * d], at: build(from[0].shape, { pieces: [pc] }) }));
    } else if (from.length === 1 && to.length === 1 && to[0].shape.pieces.length === 1 && from[0].shape.pieces.length >= 3) {
      // The reverse: many pieces → one solid part. Each piece flows into the whole target (a merge).
      const pieces = from[0].shape.pieces, k = pieces.length, d = (m.stagger ?? 0.4 / k) * (window[1] - window[0]);
      pieces.forEach((pc, i) => tracks.push({ id: to[0].id + "<" + from[0].id + "#" + i, from: from[0], to: to[0], kind: "merge", ease,
        window: [window[0] + i * d, window[1] - (k - 1 - i) * d], at: build({ pieces: [pc] }, to[0].shape) }));
    } else if (from.length === 1 && to.length === 1) {
      tracks.push({ id: to[0].id, from: from[0], to: to[0], kind: "morph", window, ease, at: build(from[0].shape, to[0].shape) });
    } else if (from.length === 1) {
      to.forEach((t, i) => tracks.push({ id: t.id, from: from[0], to: t, kind: "split", window: sub(i), ease, at: build(from[0].shape, t.shape) }));
    } else {
      from.forEach((f, i) => tracks.push({ id: to[0].id + "<" + f.id, from: f, to: to[0], kind: "merge", window: sub(i), ease, at: build(f.shape, to[0].shape) }));
    }
  }

  const zA = new Map(a.parts.map((p, i) => [p.id, i / Math.max(1, a.parts.length - 1)]));
  const zB = new Map(b.parts.map((p, i) => [p.id, i / Math.max(1, b.parts.length - 1)]));
  const at = (t: number): PartFrame[] => tracks.map(tr => {
    const raw = Math.max(0, Math.min(1, (t - tr.window[0]) / Math.max(1e-6, tr.window[1] - tr.window[0])));
    const p = easeFn(tr.ease, raw);
    const fa = tr.from?.fill ?? tr.to?.fill ?? "#000000", fb = tr.to?.fill ?? fa;
    // Paint order moves from the source stack to the target stack as the part arrives.
    const za = tr.from ? zA.get(tr.from.id)! : zB.get(tr.to!.id)!, zb = tr.to ? zB.get(tr.to.id)! : za;
    return { id: tr.id, frame: tr.at(p), fill: fa.startsWith("#") && fb.startsWith("#") ? mixColor(fa, fb, p) : (p < 0.5 ? fa : fb), z: za + (zb - za) * p, kind: tr.kind, progress: p };
  }).sort((x, y) => x.z - y.z);
  return { tracks, at };
}

/** A [start, end] time window → eased 0..1 progress; for independent parallel channels. */
export function channel(time: number, window: readonly [number, number], ease: Easing = "inOut"): number {
  return easeFn(ease, (time - window[0]) / Math.max(1e-6, window[1] - window[0]));
}
