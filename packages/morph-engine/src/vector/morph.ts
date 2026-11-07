import { centroid, dist, rotate, selfIntersections, signedArea, wrapPi, type Ring, type Vec2 } from "./geom";
import { matchRings, rotationCost, type Pin, type RingMatch } from "./correspond";
import { pieceArea, pieceCentroid, type Piece, type Shape } from "./shape";

/**
 * Shape → shape morph on the precise vector track.
 *
 * - `linear` interpolates matched points directly. With a good correspondence this is what
 *   a path-keyframe tool produces; it is kept as the comparison baseline.
 * - `intrinsic` interpolates edge lengths and turning angles, then closes the contour
 *   (after Sederberg et al., "2-D shape blending: an intrinsic solution"). Corners keep
 *   their sharpness through the middle instead of collapsing into a blob.
 * - `auto` uses intrinsic unless it self-intersects where linear does not.
 */
export type Mode = "linear" | "intrinsic" | "auto";

export interface PiecePin extends Pin {
  /** Piece index in the source shape (default 0). */
  piece?: number;
  /** Hole index inside that piece; omit for the outer contour. */
  hole?: number;
}

export interface MorphOptions {
  mode?: Mode;
  /** Extra rotation (radians) applied over the morph, or "auto" to search per piece pair. */
  rotate?: number | "auto";
  pins?: readonly PiecePin[];
  /** Explicit piece pairing [source index, target index]; others are matched automatically. */
  pairs?: ReadonlyArray<readonly [number, number]>;
  /** Unmatched pieces and holes shrink to (or grow from) this point: their own centre, the nearest partner's, or a fixed point. */
  vanish?: "self" | "partner" | Vec2;
  spacing?: number;
}

export interface FramePiece { outer: Ring; holes: Ring[] }
export interface Frame { pieces: FramePiece[] }

interface RingTrack {
  match: RingMatch;
  mode: "linear" | "intrinsic";
  /** Intrinsic data. */
  la: Float64Array; lb: Float64Array; ta: Float64Array; tb: Float64Array; phiA: number; phiB: number;
  ca: Vec2; cb: Vec2;
  /** √|area| of both ends. */
  ra: number; rb: number;
}

interface PairTrack { from: number; to: number; outer: RingTrack; holes: RingTrack[]; spareHoles: Array<{ ring: Ring; side: "a" | "b"; target: Vec2 }>; angle: number; pivotA: Vec2; pivotB: Vec2 }
interface Solo { piece: Piece; side: "a" | "b"; index: number; from: Vec2; to: Vec2 }

export interface MorphReport {
  pairs: Array<{ from: number; to: number; angle: number; mode: string; points: number }>;
  vanished: number[];
  born: number[];
  /** Pairs of linear trajectories that cross (Morph Studio's "fault"); per pair, outer contour. */
  crossings: number[];
  /** Self-intersections of the actual frames at 25/50/75%. */
  selfHits: number;
}

export interface ShapeMorph {
  readonly a: Shape;
  readonly b: Shape;
  at(t: number): Frame;
  readonly report: MorphReport;
  /** Matched rings for the debug view: [pair][0 = outer, 1.. = holes]. */
  readonly matches: RingMatch[][];
}

function edgeData(ring: readonly Vec2[]) {
  const n = ring.length, len = new Float64Array(n), ang = new Float64Array(n);
  let last = NaN;
  for (let i = 0; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n];
    len[i] = dist(p, q);
    ang[i] = len[i] > 1e-9 ? Math.atan2(q[1] - p[1], q[0] - p[0]) : last;
    if (len[i] > 1e-9) last = ang[i];
  }
  // Zero-length edges before the first real one borrow the next real direction.
  let first = 0;
  while (first < n && !Number.isFinite(ang[first])) first++;
  for (let i = 0; i < first; i++) ang[i] = ang[first] ?? 0;
  const turn = new Float64Array(n);
  for (let i = 1; i < n; i++) turn[i] = wrapPi(ang[i] - ang[i - 1]);
  return { len, phi: ang[0], turn };
}

function track(match: RingMatch, mode: "linear" | "intrinsic"): RingTrack {
  const A = edgeData(match.a), B = edgeData(match.b);
  return {
    match, mode, la: A.len, lb: B.len, ta: A.turn, tb: B.turn,
    phiA: A.phi, phiB: A.phi + wrapPi(B.phi - A.phi),
    ca: centroid(match.a), cb: centroid(match.b),
    ra: Math.sqrt(Math.abs(signedArea(match.a))), rb: Math.sqrt(Math.abs(signedArea(match.b))),
  };
}

function ringAt(tr: RingTrack, t: number): Ring {
  const { a, b } = tr.match, n = a.length;
  if (tr.mode === "linear") return a.map((p, i) => [p[0] + (b[i][0] - p[0]) * t, p[1] + (b[i][1] - p[1]) * t] as Vec2);
  const ex = new Float64Array(n), ey = new Float64Array(n);
  let phi = tr.phiA + (tr.phiB - tr.phiA) * t, sx = 0, sy = 0, total = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) phi += tr.ta[i] + (tr.tb[i] - tr.ta[i]) * t;
    const l = Math.max(0, tr.la[i] + (tr.lb[i] - tr.la[i]) * t);
    ex[i] = l * Math.cos(phi); ey[i] = l * Math.sin(phi);
    sx += ex[i]; sy += ey[i]; total += l;
  }
  // Close the contour: spread the gap over the edges in proportion to their length.
  const out: Vec2[] = new Array(n);
  let x = 0, y = 0;
  for (let i = 0; i < n; i++) {
    out[i] = [x, y];
    const w = total > 0 ? Math.hypot(ex[i], ey[i]) / total : 1 / n;
    x += ex[i] - sx * w; y += ey[i] - sy * w;
  }
  const c = centroid(out);
  const target: Vec2 = [tr.ca[0] + (tr.cb[0] - tr.ca[0]) * t, tr.ca[1] + (tr.cb[1] - tr.ca[1]) * t];
  // Keeping edge lengths while angles change inflates the area mid-morph; hold the size
  // on a straight line in √area so the shape neither swells nor shrinks.
  const area = Math.abs(signedArea(out));
  const want = (tr.ra + (tr.rb - tr.ra) * t) ** 2;
  const k = area > 1e-9 ? Math.max(0.5, Math.min(2, Math.sqrt(want / area))) : 1;
  // Orientation: the edge-angle chain only fixes the shape up to a rotation. Take the
  // rotation that best fits the straight in-between (Procrustes), so the mark does not
  // spin just because of where the first edge happens to sit.
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    const px = out[i][0] - c[0], py = out[i][1] - c[1];
    const qx = a[i][0] + (b[i][0] - a[i][0]) * t - target[0], qy = a[i][1] + (b[i][1] - a[i][1]) * t - target[1];
    sxy += px * qy - py * qx; sxx += px * qx + py * qy;
  }
  const rot = Math.atan2(sxy, sxx), cr = Math.cos(rot) * k, sr = Math.sin(rot) * k;
  return out.map(p => {
    const x = p[0] - c[0], y = p[1] - c[1];
    return [x * cr - y * sr + target[0], x * sr + y * cr + target[1]] as Vec2;
  });
}

function hits(tr: RingTrack): number {
  return [0.25, 0.5, 0.75].reduce((s, t) => s + selfIntersections(ringAt(tr, t), 8).length, 0);
}

function chooseMode(match: RingMatch, mode: Mode): RingTrack {
  if (mode !== "auto") return track(match, mode);
  const intrinsic = track(match, "intrinsic");
  const hi = hits(intrinsic);
  if (hi === 0) return intrinsic;
  const linear = track(match, "linear");
  return hits(linear) < hi ? linear : intrinsic;
}

/** Count crossing pairs among straight point trajectories (sub-sampled). */
function trajectoryCrossings(match: RingMatch, stride = 2): number {
  const segs: Array<[Vec2, Vec2]> = [];
  for (let i = 0; i < match.a.length; i += stride) segs.push([match.a[i], match.b[i]]);
  let count = 0;
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const [p, p2] = segs[i], [q, q2] = segs[j];
    const d = (p2[0] - p[0]) * (q2[1] - q[1]) - (p2[1] - p[1]) * (q2[0] - q[0]);
    if (Math.abs(d) < 1e-12) continue;
    const u = ((q[0] - p[0]) * (q2[1] - q[1]) - (q[1] - p[1]) * (q2[0] - q[0])) / d;
    const v = ((q[0] - p[0]) * (p2[1] - p[1]) - (q[1] - p[1]) * (p2[0] - p[0])) / d;
    if (u > 0.02 && u < 0.98 && v > 0.02 && v < 0.98) count++;
  }
  return count;
}

/** Minimum-cost assignment of small sets by exhaustive search, greedy beyond 7 items. */
function assign(n: number, m: number, cost: (i: number, j: number) => number, fixed: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = fixed.map(([i, j]) => [i, j]);
  const freeA = [...Array(n).keys()].filter(i => !fixed.some(f => f[0] === i));
  const freeB = [...Array(m).keys()].filter(j => !fixed.some(f => f[1] === j));
  const k = Math.min(freeA.length, freeB.length);
  if (!k) return out;
  const [small, large, swap] = freeA.length <= freeB.length ? [freeA, freeB, false] : [freeB, freeA, true];
  const c = (s: number, l: number) => swap ? cost(l, s) : cost(s, l);
  if (large.length <= 7) {
    let best = Infinity, bestPick: number[] = [];
    const pick: number[] = [], used = new Set<number>();
    const walk = (i: number, acc: number) => {
      if (acc >= best) return;
      if (i === small.length) { best = acc; bestPick = [...pick]; return; }
      for (const l of large) if (!used.has(l)) {
        used.add(l); pick.push(l);
        walk(i + 1, acc + c(small[i], l));
        used.delete(l); pick.pop();
      }
    };
    walk(0, 0);
    small.forEach((s, i) => out.push(swap ? [bestPick[i], s] : [s, bestPick[i]]));
    return out;
  }
  const options = small.flatMap(s => large.map(l => ({ s, l, v: c(s, l) }))).sort((x, y) => x.v - y.v);
  const us = new Set<number>(), ul = new Set<number>();
  for (const o of options) if (!us.has(o.s) && !ul.has(o.l)) {
    us.add(o.s); ul.add(o.l);
    out.push(swap ? [o.l, o.s] : [o.s, o.l]);
  }
  return out;
}

function pieceCost(a: Piece, b: Piece, scale: number): number {
  const d = dist(pieceCentroid(a), pieceCentroid(b)) / scale;
  const ra = Math.abs(pieceArea(a)), rb = Math.abs(pieceArea(b));
  return d + 0.6 * Math.abs(Math.log((ra + 1) / (rb + 1)));
}

const rotateRing = (ring: Ring, angle: number, origin: Vec2) => ring.map(p => rotate(p, angle, origin));

function pickAngle(a: Ring, b: Ring, mode: number | "auto" | undefined): number {
  if (typeof mode === "number") return mode;
  if (mode !== "auto") return 0;
  let best = rotationCost(a, b, 0), angle = 0;
  for (let deg = -180; deg < 180; deg += 15) {
    if (deg === 0) continue;
    const rad = deg * Math.PI / 180;
    // A rotation must clearly pay for itself; small gains are not worth the extra motion.
    const cost = rotationCost(a, b, rad) * (1 + 0.15 * Math.abs(rad));
    if (cost < best * 0.8) { best = cost; angle = rad; }
  }
  return angle;
}

const ease = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };

export function morphShapes(a: Shape, b: Shape, options: MorphOptions = {}): ShapeMorph {
  const mode = options.mode ?? "auto";
  const all = [...a.pieces, ...b.pieces].flatMap(p => p.outer);
  const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  const scale = Math.max(1, Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)));
  const pairs = assign(a.pieces.length, b.pieces.length, (i, j) => pieceCost(a.pieces[i], b.pieces[j], scale), options.pairs ?? []);
  const matchedA = new Set(pairs.map(p => p[0])), matchedB = new Set(pairs.map(p => p[1]));
  const vanish = options.vanish ?? "self";

  const tracks: PairTrack[] = pairs.map(([i, j]) => {
    const pa = a.pieces[i], pb = b.pieces[j];
    const ca = centroid(pa.outer), cb = centroid(pb.outer);
    const angle = pickAngle(pa.outer, pb.outer, options.rotate);
    // Correspond against the target turned back by `angle`; the rotation is replayed over time.
    const outerB = rotateRing(pb.outer, -angle, cb), holesB = pb.holes.map(h => rotateRing(h, -angle, cb));
    const pinsFor = (hole?: number) => (options.pins ?? []).filter(p => (p.piece ?? 0) === i && p.hole === hole);
    const outer = chooseMode(matchRings(pa.outer, outerB, { pins: pinsFor(), spacing: options.spacing }), mode);
    const hp = assign(pa.holes.length, holesB.length, (x, y) =>
      dist(rotate(centroid(pa.holes[x]), 0, ca), centroid(holesB[y])) / scale + 0.6 * Math.abs(Math.log((Math.abs(signedArea(pa.holes[x])) + 1) / (Math.abs(signedArea(holesB[y])) + 1))), []);
    const holes = hp.map(([x, y]) => chooseMode(matchRings(pa.holes[x], holesB[y], { pins: pinsFor(x), spacing: options.spacing }), mode));
    const spareHoles = [
      ...pa.holes.filter((_, x) => !hp.some(p => p[0] === x)).map(ring => ({ ring, side: "a" as const, target: centroid(ring) })),
      ...holesB.filter((_, y) => !hp.some(p => p[1] === y)).map(ring => ({ ring, side: "b" as const, target: centroid(ring) })),
    ];
    return { from: i, to: j, outer, holes, spareHoles, angle, pivotA: ca, pivotB: cb };
  });

  const partner = (piece: Piece, side: "a" | "b"): Vec2 => {
    if (Array.isArray(vanish)) return vanish as Vec2;
    const c = pieceCentroid(piece);
    if (vanish === "self" || !tracks.length) return c;
    // The nearest matched piece on the opposite side: vanishing pieces fly into it, born pieces fly out of it.
    let best = Infinity, at = c;
    for (const tr of tracks) {
      const q = side === "a" ? tr.pivotB : tr.pivotA;
      const d = dist(c, side === "a" ? tr.pivotA : tr.pivotB);
      if (d < best) { best = d; at = q; }
    }
    return at;
  };
  const solos: Solo[] = [
    ...a.pieces.flatMap((piece, index) => matchedA.has(index) ? [] : [{ piece, side: "a" as const, index, from: pieceCentroid(piece), to: partner(piece, "a") }]),
    ...b.pieces.flatMap((piece, index) => matchedB.has(index) ? [] : [{ piece, side: "b" as const, index, from: partner(piece, "b"), to: pieceCentroid(piece) }]),
  ];

  const at = (t: number): Frame => {
    if (!Number.isFinite(t)) throw new RangeError("Morph time must be finite.");
    const pieces: FramePiece[] = [];
    for (const tr of tracks) {
      const theta = tr.angle * t;
      const outer = ringAt(tr.outer, t);
      const pivot = centroid(outer);
      const turnRing = (r: Ring) => theta ? rotateRing(r, theta, pivot) : r;
      const holes = tr.holes.map(h => turnRing(ringAt(h, t)));
      for (const spare of tr.spareHoles) {
        const k = spare.side === "a" ? 1 - ease(t / 0.85) : ease((t - 0.15) / 0.85);
        if (k <= 1e-3) continue;
        // Spare holes follow the piece's interpolated pivot so they never drift outside it.
        const home = spare.side === "a" ? tr.pivotA : tr.pivotB;
        const off: Vec2 = [pivot[0] - home[0], pivot[1] - home[1]];
        holes.push(turnRing(spare.ring.map(p => [spare.target[0] + (p[0] - spare.target[0]) * k + off[0], spare.target[1] + (p[1] - spare.target[1]) * k + off[1]] as Vec2)));
      }
      pieces.push({ outer: turnRing(outer), holes });
    }
    for (const solo of solos) {
      const k = solo.side === "a" ? 1 - ease(t / 0.85) : ease((t - 0.15) / 0.85);
      if (k <= 1e-3) continue;
      const u = ease(t), c: Vec2 = [solo.from[0] + (solo.to[0] - solo.from[0]) * u, solo.from[1] + (solo.to[1] - solo.from[1]) * u];
      const home = pieceCentroid(solo.piece);
      const map = (p: Vec2): Vec2 => [c[0] + (p[0] - home[0]) * k, c[1] + (p[1] - home[1]) * k];
      pieces.push({ outer: solo.piece.outer.map(map), holes: solo.piece.holes.map(h => h.map(map)) });
    }
    return { pieces };
  };

  const report: MorphReport = {
    pairs: tracks.map(tr => ({ from: tr.from, to: tr.to, angle: tr.angle, mode: tr.outer.mode, points: tr.outer.match.a.length })),
    vanished: solos.filter(s => s.side === "a").map(s => s.index),
    born: solos.filter(s => s.side === "b").map(s => s.index),
    crossings: tracks.map(tr => trajectoryCrossings(tr.outer.match)),
    selfHits: [0.25, 0.5, 0.75].reduce((s, t) => s + at(t).pieces.reduce((q, p) => q + selfIntersections(p.outer, 8).length, 0), 0),
  };
  return { a, b, at, report, matches: tracks.map(tr => [tr.outer.match, ...tr.holes.map(h => h.match)]) };
}
