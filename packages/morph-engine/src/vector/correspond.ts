import { arcTable, centroid, dist, nearestParam, pointAt, signedArea, sub, turns, type Ring, type Vec2 } from "./geom";

/**
 * Point correspondence between two closed contours.
 *
 * Borrowed concepts (Morph Studio tutorial, our own implementation):
 * - an automatic baseline: the best cyclic start offset plus corner-to-corner alignment;
 * - pins as global constraints: every pin becomes a knot and the whole match is recomputed;
 * - authored points (real corners) are always kept exactly, so both endpoints are exact;
 * - pins that would make trajectories cross are rejected as a fault.
 */

/** Where a pin lands on a contour. Readable names let an AI pin without coordinates. */
export type Anchor =
  | Vec2
  | "top" | "bottom" | "left" | "right"
  | { corner: number }   // n-th corner, counted clockwise from 12 o'clock around the centroid
  | { angle: number }    // degrees, 0 = up, clockwise; the contour point in that direction
  | { s: number };       // raw arc-length fraction

export interface Pin { a: Anchor; b: Anchor }

export interface Corner { s: number; turn: number; p: Vec2 }
export interface Knot { sa: number; sb: number; kind: "pin" | "corner" | "cut" }

export interface RingMatch {
  /** Matched samples: a[i] corresponds to b[i]; equal length. */
  a: Vec2[];
  b: Vec2[];
  knots: Knot[];
  /** Index into a/b for every knot, for drawing pins and corner links. */
  knotIndex: number[];
  offset: number;
}

export class PinOrderError extends Error {}

export const CORNER_TURN = 0.5; // radians (~29°)

export function corners(ring: Ring, table = arcTable(ring), minTurn = CORNER_TURN): Corner[] {
  const total = table[table.length - 1];
  return turns(ring).flatMap((turn, i) => Math.abs(turn) >= minTurn ? [{ s: table[i] / total, turn, p: ring[i] }] : []);
}

function clockAngle(p: Vec2, c: Vec2): number {
  // 0 at 12 o'clock, growing clockwise on screen (y down).
  const a = Math.atan2(p[0] - c[0], -(p[1] - c[1]));
  return a < 0 ? a + 2 * Math.PI : a;
}

const isPoint = (anchor: Anchor): anchor is Vec2 => Array.isArray(anchor);

export function resolveAnchor(ring: Ring, anchor: Anchor, table = arcTable(ring)): number {
  const c = centroid(ring);
  if (isPoint(anchor)) return nearestParam(ring, table, anchor);
  if (typeof anchor === "string") {
    const key = anchor === "top" ? (p: Vec2) => p[1] : anchor === "bottom" ? (p: Vec2) => -p[1]
      : anchor === "left" ? (p: Vec2) => p[0] : (p: Vec2) => -p[0];
    let best = Infinity, at: Vec2 = ring[0];
    for (const p of ring) {
      // Ties (a flat top edge) resolve to the point nearest the centre line.
      const k = key(p) + 1e-6 * dist(p, c);
      if (k < best) { best = k; at = p; }
    }
    return nearestParam(ring, table, at);
  }
  if ("s" in anchor) return ((anchor.s % 1) + 1) % 1;
  if ("corner" in anchor) {
    const list = corners(ring, table).sort((x, y) => clockAngle(x.p, c) - clockAngle(y.p, c));
    if (!list.length) throw new Error("Contour has no corners to pin.");
    return list[((anchor.corner % list.length) + list.length) % list.length].s;
  }
  // Cast a ray from the centroid (0° = up, clockwise on screen) and take the outermost hit,
  // so a direction can land in the middle of a straight edge, not only on a vertex.
  const want = anchor.angle * Math.PI / 180;
  const dir: Vec2 = [Math.sin(want), -Math.cos(want)];
  let far = -Infinity, hit: Vec2 | null = null;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n], e = sub(q, p), w = sub(p, c);
    const den = dir[0] * e[1] - dir[1] * e[0];
    if (Math.abs(den) < 1e-12) continue;
    const r = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * dir[1] - w[1] * dir[0]) / den;
    if (r > 0 && u >= 0 && u <= 1 && r > far) { far = r; hit = [c[0] + dir[0] * r, c[1] + dir[1] * r]; }
  }
  if (hit) return nearestParam(ring, table, hit);
  // The centroid can lie outside the shape (between a figure's legs); then take the
  // contour point whose direction is closest to the requested one.
  let best = Infinity, at = 0;
  for (let i = 0; i < 720; i++) {
    const s = i / 720, p = pointAt(ring, table, s);
    const d = Math.abs(((clockAngle(p, c) - ((want % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    const score = d - 1e-4 * dist(p, c);
    if (score < best) { best = score; at = s; }
  }
  return at;
}

const frac = (x: number) => ((x % 1) + 1) % 1;

/** Normalised samples (centred, unit area) used to compare shapes regardless of size and position. */
function profile(ring: Ring, table: number[], m: number, shift = 0): Vec2[] {
  const c = centroid(ring), k = 1 / Math.sqrt(Math.abs(signedArea(ring)) || 1);
  return Array.from({ length: m }, (_, i) => {
    const p = pointAt(ring, table, i / m + shift);
    return [(p[0] - c[0]) * k, (p[1] - c[1]) * k] as Vec2;
  });
}

/** Best cyclic offset δ so that B(s + δ) follows A(s). Returns δ and its mean squared cost. */
export function bestOffset(a: Ring, b: Ring, ta = arcTable(a), tb = arcTable(b)): { offset: number; cost: number } {
  const m = 96, pa = profile(a, ta, m), pb = profile(b, tb, m * 4);
  let best = Infinity, at = 0;
  for (let shift = 0; shift < m * 4; shift++) {
    let cost = 0;
    for (let i = 0; i < m; i++) {
      const q = pb[(i * 4 + shift) % (m * 4)];
      cost += (pa[i][0] - q[0]) ** 2 + (pa[i][1] - q[1]) ** 2;
      if (cost >= best) break;
    }
    if (cost < best) { best = cost; at = shift; }
  }
  return { offset: at / (m * 4), cost: best / m };
}

/** Cost of matching corner i of A to corner j of B inside one knot interval. */
function cornerCost(ca: Corner, cb: Corner, fa: number, fb: number, ka: number, kb: number, cA: Vec2, cB: Vec2): number {
  const pa = sub(ca.p, cA), pb = sub(cb.p, cB);
  const spatial = Math.hypot(pa[0] * ka - pb[0] * kb, pa[1] * ka - pb[1] * kb);
  const sign = Math.sign(ca.turn) !== Math.sign(cb.turn) ? 0.9 : 0;
  return 1.6 * Math.abs(fa - fb) + 0.8 * spatial + sign + 0.15 * Math.abs(ca.turn - cb.turn);
}

const SKIP = 0.55;

/** Monotone alignment of the corners that fall inside one interval (edit-distance DP). */
function alignCorners(A: Corner[], B: Corner[], fa: number[], fb: number[], ka: number, kb: number, cA: Vec2, cB: Vec2): Array<[number, number]> {
  const n = A.length, m = B.length;
  const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const W = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
  for (let i = 1; i <= n; i++) { D[i][0] = i * SKIP; W[i][0] = 1; }
  for (let j = 1; j <= m; j++) { D[0][j] = j * SKIP; W[0][j] = 2; }
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const match = D[i - 1][j - 1] + cornerCost(A[i - 1], B[j - 1], fa[i - 1], fb[j - 1], ka, kb, cA, cB);
    const skipA = D[i - 1][j] + SKIP, skipB = D[i][j - 1] + SKIP;
    if (match <= skipA && match <= skipB) { D[i][j] = match; W[i][j] = 0; }
    else if (skipA <= skipB) { D[i][j] = skipA; W[i][j] = 1; }
    else { D[i][j] = skipB; W[i][j] = 2; }
  }
  const pairs: Array<[number, number]> = [];
  for (let i = n, j = m; i > 0 || j > 0;) {
    const w = W[i][j];
    if (w === 0) { pairs.push([i - 1, j - 1]); i--; j--; }
    else if (w === 1) i--;
    else j--;
  }
  return pairs.reverse();
}

export interface MatchOptions {
  pins?: readonly Pin[];
  /** Target spacing of generated points, in design pixels. */
  spacing?: number;
  /** Turn more than this (radians) counts as a corner. */
  cornerTurn?: number;
}

export function matchRings(a: Ring, b: Ring, options: MatchOptions = {}): RingMatch {
  const spacing = options.spacing ?? 3;
  const ta = arcTable(a), tb = arcTable(b);
  const La = ta[ta.length - 1], Lb = tb[tb.length - 1];
  const CA = corners(a, ta, options.cornerTurn), CB = corners(b, tb, options.cornerTurn);
  const cA = centroid(a), cB = centroid(b);
  const ka = 1 / Math.sqrt(Math.abs(signedArea(a)) || 1), kb = 1 / Math.sqrt(Math.abs(signedArea(b)) || 1);

  // 1. Hard knots: the user's pins, or one cut placed in the widest corner-free gap.
  let knots: Knot[];
  const { offset } = bestOffset(a, b, ta, tb);
  if (options.pins?.length) {
    knots = options.pins.map(pin => ({ sa: resolveAnchor(a, pin.a, ta), sb: resolveAnchor(b, pin.b, tb), kind: "pin" as const }))
      .sort((x, y) => x.sa - y.sa);
    const base = knots[0].sb;
    let prev = -1;
    for (const k of knots) {
      const rel = frac(k.sb - base);
      // Equal is allowed: several A points may converge on one B point (one-to-many pins).
      if (rel < prev - 1e-9) throw new PinOrderError("Pins cross: their order on the two contours differs, so trajectories would intersect.");
      prev = rel;
    }
  } else {
    const marks = [...CA.map(c => c.s), ...CB.map(c => frac(c.s - offset))].sort((x, y) => x - y);
    let cut = 0;
    if (marks.length) {
      let gap = -1;
      marks.forEach((s, i) => {
        const next = i + 1 < marks.length ? marks[i + 1] : marks[0] + 1;
        if (next - s > gap) { gap = next - s; cut = frac(s + (next - s) / 2); }
      });
    }
    knots = [{ sa: cut, sb: frac(cut + offset), kind: "cut" }];
  }

  // 2. Inside each knot interval, align corners monotonically and add them as knots.
  const all: Knot[] = [];
  for (let k = 0; k < knots.length; k++) {
    const k0 = knots[k], k1 = knots[(k + 1) % knots.length];
    const sa0 = k0.sa, sa1 = k + 1 < knots.length ? k1.sa : k1.sa + 1;
    const sb0 = k0.sb;
    let sb1 = k1.sb;
    while (sb1 < sb0 - 1e-9) sb1 += 1;
    if (knots.length === 1) sb1 = sb0 + 1;
    all.push(k0);
    const spanA = sa1 - sa0, spanB = sb1 - sb0, eps = 1e-6;
    const inA = CA.filter(c => { const r = frac(c.s - sa0); return r > eps && r < spanA - eps; })
      .map(c => ({ c, f: frac(c.s - sa0) / spanA })).sort((x, y) => x.f - y.f);
    const inB = spanB > eps ? CB.filter(c => { const r = frac(c.s - sb0); return r > eps && r < spanB - eps; })
      .map(c => ({ c, f: frac(c.s - sb0) / spanB })).sort((x, y) => x.f - y.f) : [];
    const pairs = alignCorners(inA.map(x => x.c), inB.map(x => x.c), inA.map(x => x.f), inB.map(x => x.f), ka, kb, cA, cB);
    for (const [i, j] of pairs) all.push({ sa: sa0 + inA[i].f * spanA, sb: sb0 + inB[j].f * spanB, kind: "corner" });
  }

  // 3. Dense samples between knots. Every authored corner of either side lands exactly on a sample.
  const outA: Vec2[] = [], outB: Vec2[] = [], knotIndex: number[] = [];
  for (let k = 0; k < all.length; k++) {
    const k0 = all[k], k1 = all[(k + 1) % all.length];
    // Spans may be zero: several pins can share one point (one-to-many).
    const spanA = all.length === 1 ? 1 : frac(k1.sa - k0.sa + 1e-12) - 1e-12;
    const spanB = all.length === 1 ? 1 : frac(k1.sb - k0.sb + 1e-12) - 1e-12;
    knotIndex.push(outA.length);
    if (spanA <= 1e-9 && spanB <= 1e-9) {
      outA.push(pointAt(a, ta, k0.sa));
      outB.push(pointAt(b, tb, k0.sb));
      continue;
    }
    const length = Math.max(spanA * La, spanB * Lb);
    const n = Math.max(1, Math.ceil(length / spacing));
    const fs = new Set<number>();
    for (let i = 0; i < n; i++) fs.add(i / n);
    const extra = [
      ...(spanA > 1e-9 ? CA.map(c => frac(c.s - k0.sa) / spanA).filter(f => f > 1e-6 && f < 1 - 1e-6) : []),
      ...(spanB > 1e-9 ? CB.map(c => frac(c.s - k0.sb) / spanB).filter(f => f > 1e-6 && f < 1 - 1e-6) : []),
    ];
    // Unmatched corners must be kept; drop uniform samples that would sit right next to them.
    const minGap = 0.35 / n;
    const list = [...fs].filter(f => f === 0 || extra.every(e => Math.abs(e - f) > minGap)).concat(extra).sort((x, y) => x - y);
    for (const f of list) {
      outA.push(pointAt(a, ta, k0.sa + f * spanA));
      outB.push(pointAt(b, tb, k0.sb + f * spanB));
    }
  }
  return { a: outA, b: outB, knots: all, knotIndex, offset };
}

/** Mean squared distance of normalised profiles after rotating b by −angle; used to choose a pre-rotation. */
export function rotationCost(a: Ring, b: Ring, angle: number): number {
  const cb = centroid(b), c = Math.cos(-angle), s = Math.sin(-angle);
  const rb = b.map(([x, y]) => [cb[0] + (x - cb[0]) * c - (y - cb[1]) * s, cb[1] + (x - cb[0]) * s + (y - cb[1]) * c] as Vec2);
  return bestOffset(a, rb).cost;
}

export const ringLengthRatio = (a: Ring, b: Ring) => arcTable(a).at(-1)! / arcTable(b).at(-1)!;
export { dist };
