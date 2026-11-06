import type { Vec2 } from "../renderers/sdf-gl";
import { rng } from "./skeleton";

/** Clip a convex-or-not polygon by the halfplane dot(n, p) <= c (Sutherland–Hodgman). */
function clip(poly: Vec2[], nx: number, ny: number, c: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = nx * a[0] + ny * a[1] - c, db = nx * b[0] + ny * b[1] - c;
    if (da <= 0) out.push(a);
    if ((da <= 0) !== (db <= 0)) {
      const u = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
    }
  }
  return out;
}

export function area(poly: readonly Vec2[]) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

export function centroid(poly: readonly Vec2[]): Vec2 {
  let x = 0, y = 0, s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const k = a[0] * b[1] - b[0] * a[1];
    x += (a[0] + b[0]) * k; y += (a[1] + b[1]) * k; s += k;
  }
  if (Math.abs(s) < 1e-9) return poly[0];
  return [x / (3 * s), y / (3 * s)];
}

export function inside(poly: readonly Vec2[], x: number, y: number) {
  let r = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[j];
    if ((y1 > y) !== (y2 > y) && x < x1 + (x2 - x1) * (y - y1) / (y2 - y1)) r = !r;
  }
  return r;
}

/**
 * Voronoi fracture of a polygon. Each cell is the polygon clipped by the bisectors to all
 * other seeds (convex cells intersected with the outline). Lloyd relaxation evens out sizes.
 */
export function fracture(outline: readonly Vec2[], count: number, seed: number, relax = 2): Vec2[][] {
  const r = rng(seed);
  const xs = outline.map(p => p[0]), ys = outline.map(p => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let seeds: Vec2[] = [];
  while (seeds.length < count) {
    const p: Vec2 = [x0 + r() * (x1 - x0), y0 + r() * (y1 - y0)];
    if (inside(outline, p[0], p[1])) seeds.push(p);
  }
  let cells: Vec2[][] = [];
  for (let pass = 0; pass <= relax; pass++) {
    // Clip a convex hull box first so non-convex outlines still clip correctly per cell.
    cells = seeds.map((s, i) => {
      let cell: Vec2[] = [[x0 - 1, y0 - 1], [x1 + 1, y0 - 1], [x1 + 1, y1 + 1], [x0 - 1, y1 + 1]];
      for (let j = 0; j < seeds.length && cell.length; j++) {
        if (i === j) continue;
        const o = seeds[j];
        const nx = o[0] - s[0], ny = o[1] - s[1];
        cell = clip(cell, nx, ny, nx * (s[0] + o[0]) / 2 + ny * (s[1] + o[1]) / 2);
      }
      return cell;
    });
    if (pass < relax) seeds = cells.map((c, i) => c.length > 2 ? centroid(c) : seeds[i]);
  }
  // Intersect convex cells with the (possibly concave) outline by sampling: keep the convex
  // cell but clip to the outline's edges that face the cell. For mildly concave outlines,
  // clipping by each outline edge's supporting line near the cell is enough.
  return cells.map(cell => clipToOutline(cell, outline)).filter(c => c.length > 2 && Math.abs(area(c)) > 4);
}

/** Polygon ∩ polygon for convex `cell` and arbitrary simple `outline` via Weiler–Atherton-lite: sample + hull fallback. */
function clipToOutline(cell: Vec2[], outline: readonly Vec2[]): Vec2[] {
  // Clip the outline (subject) by the convex cell (clipper). Result is exact for convex clippers.
  let poly = [...outline] as Vec2[];
  const orient = area(cell) > 0 ? 1 : -1;
  for (let i = 0; i < cell.length && poly.length; i++) {
    const a = cell[i], b = cell[(i + 1) % cell.length];
    // Inside is to the left of edge a→b for counter-clockwise cells.
    const nx = (b[1] - a[1]) * orient, ny = -(b[0] - a[0]) * orient;
    poly = clip(poly, nx, ny, nx * a[0] + ny * a[1]);
  }
  return poly;
}

/** Resample a closed polygon to n points by perimeter. */
export function resampleClosed(poly: readonly Vec2[], n: number): Vec2[] {
  const pts = [...poly, poly[0]];
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = len.at(-1)!;
  const out: Vec2[] = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const target = total * k / n;
    while (j < pts.length - 1 && len[j] < target) j++;
    const u = (target - len[j - 1]) / ((len[j] - len[j - 1]) || 1);
    out.push([pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * u, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * u]);
  }
  // Start at the top-most point so corresponding rings do not twist.
  let start = 0;
  out.forEach((p, i) => { if (p[1] < out[start][1]) start = i; });
  return [...out.slice(start), ...out.slice(0, start)];
}

/**
 * Pair cells of A with cells of B. Both sets are normalized to their own bounding boxes and
 * matched greedily by nearest normalized centroid, so relative layout is preserved
 * (top-left fragments travel to the top-left of the target).
 */
export function matchCells(a: readonly Vec2[][], b: readonly Vec2[][]): number[] {
  const norm = (cells: readonly Vec2[][]) => {
    const cs = cells.map(centroid);
    const xs = cs.map(c => c[0]), ys = cs.map(c => c[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    return cs.map(c => [(c[0] - x0) / ((x1 - x0) || 1), (c[1] - y0) / ((y1 - y0) || 1)] as Vec2);
  };
  const na = norm(a), nb = norm(b);
  const pairs: [number, number, number][] = [];
  na.forEach((p, i) => nb.forEach((q, j) => pairs.push([Math.hypot(p[0] - q[0], p[1] - q[1]), i, j])));
  pairs.sort((x, y) => x[0] - y[0]);
  const result = new Array(a.length).fill(-1), used = new Set<number>();
  for (const [, i, j] of pairs) {
    if (result[i] >= 0 || used.has(j)) continue;
    result[i] = j;
    used.add(j);
  }
  return result;
}
