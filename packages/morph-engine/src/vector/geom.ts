/** Planar geometry for closed polylines. A contour never repeats its first point at the end. */

export type Vec2 = readonly [number, number];
export type Ring = Vec2[];

export const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const scale = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k];
export const lerp2 = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0];

export function rotate(p: Vec2, angle: number, origin: Vec2 = [0, 0]): Vec2 {
  const c = Math.cos(angle), s = Math.sin(angle), x = p[0] - origin[0], y = p[1] - origin[1];
  return [origin[0] + x * c - y * s, origin[1] + x * s + y * c];
}

/** Wrap an angle to (−π, π]. */
export function wrapPi(a: number): number {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  a -= Math.PI;
  return a <= -Math.PI ? Math.PI : a;
}

/** Signed area; positive when the ring runs counter-clockwise in a y-up frame (clockwise on screen). */
export function signedArea(ring: Ring): number {
  let s = 0;
  for (let i = 0, n = ring.length; i < n; i++) s += cross(ring[i], ring[(i + 1) % n]);
  return s / 2;
}

/** Area centroid, falling back to the vertex mean for degenerate rings. */
export function centroid(ring: Ring): Vec2 {
  let a = 0, x = 0, y = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n], c = cross(p, q);
    a += c; x += (p[0] + q[0]) * c; y += (p[1] + q[1]) * c;
  }
  if (Math.abs(a) < 1e-9) {
    const m = ring.reduce((s, p) => add(s, p), [0, 0] as Vec2);
    return scale(m, 1 / Math.max(1, ring.length));
  }
  return [x / (3 * a), y / (3 * a)];
}

export function perimeter(ring: Ring): number {
  let s = 0;
  for (let i = 0, n = ring.length; i < n; i++) s += dist(ring[i], ring[(i + 1) % n]);
  return s;
}

export function bounds(rings: readonly Ring[]): { min: Vec2; max: Vec2 } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const ring of rings) for (const [x, y] of ring) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { min: [x0, y0], max: [x1, y1] };
}

/** Cumulative arc length at each vertex; the last entry is the full perimeter. */
export function arcTable(ring: Ring): number[] {
  const out = [0];
  for (let i = 0, n = ring.length; i < n; i++) out.push(out[i] + dist(ring[i], ring[(i + 1) % n]));
  return out;
}

/** Point at arc-length fraction s (any real; wraps around the closed ring). */
export function pointAt(ring: Ring, table: number[], s: number): Vec2 {
  const total = table[table.length - 1];
  let d = ((s % 1) + 1) % 1 * total;
  let lo = 0, hi = ring.length;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid] <= d) lo = mid; else hi = mid;
  }
  const seg = table[lo + 1] - table[lo];
  const u = seg > 0 ? (d - table[lo]) / seg : 0;
  return lerp2(ring[lo], ring[(lo + 1) % ring.length], u);
}

/** Arc-length fraction of the ring point closest to p. */
export function nearestParam(ring: Ring, table: number[], p: Vec2): number {
  let best = Infinity, at = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n], ab = sub(b, a), len2 = ab[0] ** 2 + ab[1] ** 2;
    const u = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / len2)) : 0;
    const d = dist(p, lerp2(a, b, u));
    if (d < best) { best = d; at = (table[i] + u * (table[i + 1] - table[i])) / table[table.length - 1]; }
  }
  return at;
}

/** Turning angle at every vertex, in (−π, π]. Positive turns follow the ring's own orientation. */
export function turns(ring: Ring): number[] {
  const n = ring.length, out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = sub(ring[i], ring[(i - 1 + n) % n]), b = sub(ring[(i + 1) % n], ring[i]);
    out.push(wrapPi(Math.atan2(b[1], b[0]) - Math.atan2(a[1], a[0])));
  }
  return out;
}

/** Drop points closer than eps to their predecessor, and collinear points. */
export function clean(ring: Ring, eps = 0.25): Ring {
  const out: Vec2[] = [];
  for (const p of ring) if (!out.length || dist(p, out[out.length - 1]) > eps) out.push(p);
  while (out.length > 2 && dist(out[0], out[out.length - 1]) <= eps) out.pop();
  return out;
}

function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = cross(sub(b, a), sub(c, a)), d2 = cross(sub(b, a), sub(d, a));
  const d3 = cross(sub(d, c), sub(a, c)), d4 = cross(sub(d, c), sub(b, c));
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Pairs of non-adjacent edges that properly cross. Grid-bucketed, so it is fast enough for QC. */
export function selfIntersections(ring: Ring, limit = 64): Array<[number, number]> {
  const n = ring.length, hits: Array<[number, number]> = [];
  if (n < 4) return hits;
  const { min, max } = bounds([ring]);
  const cell = Math.max(1e-6, Math.max(max[0] - min[0], max[1] - min[1]) / Math.max(4, Math.sqrt(n)));
  const grid = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    const gx0 = Math.floor((Math.min(a[0], b[0]) - min[0]) / cell), gx1 = Math.floor((Math.max(a[0], b[0]) - min[0]) / cell);
    const gy0 = Math.floor((Math.min(a[1], b[1]) - min[1]) / cell), gy1 = Math.floor((Math.max(a[1], b[1]) - min[1]) / cell);
    for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
      const key = gx + "," + gy;
      const list = grid.get(key);
      if (list) list.push(i); else grid.set(key, [i]);
    }
  }
  const seen = new Set<number>();
  for (const list of grid.values()) {
    for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
      const i = Math.min(list[x], list[y]), j = Math.max(list[x], list[y]);
      if (j - i < 2 || (i === 0 && j === n - 1)) continue;
      const key = i * n + j;
      if (seen.has(key)) continue;
      seen.add(key);
      if (segmentsCross(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) {
        hits.push([i, j]);
        if (hits.length >= limit) return hits;
      }
    }
  }
  return hits;
}

/** True when p lies inside the ring (even-odd). */
export function contains(ring: Ring, p: Vec2): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** Min / max of a large list without spreading it into arguments (spread overflows the stack past ~100k items). */
export function minOf(list: ArrayLike<number>): number { let m = Infinity; for (let i = 0; i < list.length; i++) if (list[i] < m) m = list[i]; return m; }
export function maxOf(list: ArrayLike<number>): number { let m = -Infinity; for (let i = 0; i < list.length; i++) if (list[i] > m) m = list[i]; return m; }
/** Append many items without spreading them into arguments. */
export function pushAll<T>(into: T[], items: ArrayLike<T>): T[] { for (let i = 0; i < items.length; i++) into.push(items[i]); return into; }
