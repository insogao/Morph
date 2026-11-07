import { contains, signedArea, type Ring, type Vec2 } from "./geom";
import { matchRings, type Pin } from "./correspond";

/**
 * Texture mesh warp (pure, testable). A part's texture should FOLLOW its shape as it deforms.
 *
 * 1. Boundary: the outlines of A and B are matched by the vector track's correspondence and
 *    sampled at K shared points, so boundary point k of A corresponds to boundary point k of B.
 * 2. Interior: A's part is filled with a triangle mesh (Delaunay over boundary + interior grid).
 *    Every interior vertex gets mean-value coordinates w.r.t. A's boundary polygon.
 * 3. Any boundary at time t carries the whole mesh with it: vertex = Σ wₖ · boundaryₜ[k]. The same
 *    weights against B's boundary tell where each vertex samples B's texture, so A and B can be
 *    drawn ALIGNED on the in-between shape and blended there (warp + blend, not a double exposure).
 */

export type Tri = [number, number, number];

export interface Mesh {
  /** Vertex positions on A (design space). */
  rest: Vec2[];
  /** Where each vertex lands on B (design space): B's texture coordinates. */
  onB: Vec2[];
  tris: Tri[];
  /** Mean-value coordinates of every vertex over the K boundary samples. */
  weights: Float64Array[];
  boundaryA: Vec2[];
  boundaryB: Vec2[];
}

/** Bowyer–Watson Delaunay triangulation of a point set (fine for a few thousand points). */
export function delaunay(points: readonly Vec2[]): Tri[] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const d = Math.max(x1 - x0, y1 - y0) * 20, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const pts: Vec2[] = [...points, [mx - d, my - d], [mx + d, my - d], [mx, my + d]];
  const n = points.length;
  type T = { a: number; b: number; c: number; cx: number; cy: number; r2: number };
  const circum = (a: number, b: number, c: number): T => {
    const [ax, ay] = pts[a], [bx, by] = pts[b], [cx, cy] = pts[c];
    const dd = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)) || 1e-12;
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / dd;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / dd;
    return { a, b, c, cx: ux, cy: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
  };
  let tris: T[] = [circum(n, n + 1, n + 2)];
  for (let i = 0; i < n; i++) {
    const [px, py] = pts[i];
    const bad: T[] = [], keep: T[] = [];
    for (const t of tris) ((px - t.cx) ** 2 + (py - t.cy) ** 2 < t.r2 * (1 + 1e-12) ? bad : keep).push(t);
    const edges = new Map<string, [number, number]>();
    for (const t of bad) for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]] as Array<[number, number]>) {
      const key = u < v ? u + "," + v : v + "," + u;
      if (edges.has(key)) edges.delete(key); else edges.set(key, [u, v]);
    }
    for (const [u, v] of edges.values()) keep.push(circum(u, v, i));
    tris = keep;
  }
  return tris.filter(t => t.a < n && t.b < n && t.c < n).map(t => [t.a, t.b, t.c] as Tri);
}

/** Mean-value coordinates of p w.r.t. a closed polygon (valid for concave polygons too). */
export function meanValue(poly: readonly Vec2[], p: Vec2): Float64Array {
  const n = poly.length, w = new Float64Array(n);
  const d = poly.map(([x, y]) => [x - p[0], y - p[1]] as Vec2), r = d.map(([x, y]) => Math.hypot(x, y));
  for (let i = 0; i < n; i++) if (r[i] < 1e-9) { w[i] = 1; return w; }
  const tanHalf = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = d[i], b = d[(i + 1) % n];
    const cross = a[0] * b[1] - a[1] * b[0], dot = a[0] * b[0] + a[1] * b[1];
    const angle = Math.atan2(cross, dot);
    tanHalf[i] = Math.tan(angle / 2);
  }
  let sum = 0;
  for (let i = 0; i < n; i++) { w[i] = (tanHalf[(i - 1 + n) % n] + tanHalf[i]) / r[i]; sum += w[i]; }
  for (let i = 0; i < n; i++) w[i] /= sum;
  return w;
}

const apply = (w: Float64Array, ring: readonly Vec2[]): Vec2 => {
  let x = 0, y = 0;
  for (let k = 0; k < w.length; k++) if (w[k]) { x += w[k] * ring[k][0]; y += w[k] * ring[k][1]; }
  return [x, y];
};

export function buildMesh(a: Ring, b: Ring, opts: { boundary?: number; spacing?: number; pins?: readonly Pin[] } = {}): Mesh {
  const K = opts.boundary ?? 96, spacing = opts.spacing ?? 16;
  const m = matchRings(a, b, { pins: opts.pins, spacing: 2 });
  const pick = Array.from({ length: K }, (_, k) => Math.floor(k * m.a.length / K));
  const boundaryA = pick.map(i => m.a[i]), boundaryB = pick.map(i => m.b[i]);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of boundaryA) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const near = (p: Vec2) => boundaryA.some((q, i) => {
    const r = boundaryA[(i + 1) % K], ex = r[0] - q[0], ey = r[1] - q[1], l2 = ex * ex + ey * ey || 1;
    const u = Math.max(0, Math.min(1, ((p[0] - q[0]) * ex + (p[1] - q[1]) * ey) / l2));
    return Math.hypot(p[0] - q[0] - ex * u, p[1] - q[1] - ey * u) < spacing * 0.5;
  });
  const interior: Vec2[] = [];
  for (let y = y0 + spacing / 2; y < y1; y += spacing * 0.866) {
    const row = Math.round((y - y0) / (spacing * 0.866));
    for (let x = x0 + (row % 2 ? spacing / 2 : 0); x < x1; x += spacing) {
      const p: Vec2 = [x, y];
      if (contains(boundaryA, p) && !near(p)) interior.push(p);
    }
  }
  const rest = [...boundaryA, ...interior];
  const inside = (t: Tri) => {
    const c: Vec2 = [(rest[t[0]][0] + rest[t[1]][0] + rest[t[2]][0]) / 3, (rest[t[0]][1] + rest[t[1]][1] + rest[t[2]][1]) / 3];
    return contains(boundaryA, c) && Math.abs(signedArea([rest[t[0]], rest[t[1]], rest[t[2]]])) > 1e-3;
  };
  const tris = delaunay(rest).filter(inside);
  const weights = rest.map((p, i) => { if (i < K) { const w = new Float64Array(K); w[i] = 1; return w; } return meanValue(boundaryA, p); });
  return { rest, onB: weights.map(w => apply(w, boundaryB)), tris, weights, boundaryA, boundaryB };
}

/** Vertex positions when the boundary is `ring` (K points, same order as the mesh's boundary). */
export function meshAt(mesh: Mesh, ring: readonly Vec2[]): Vec2[] {
  return mesh.weights.map(w => apply(w, ring));
}

/** Boundary between A and B at progress t (straight interpolation of the matched samples). */
export function boundaryAt(mesh: Mesh, t: number): Vec2[] {
  return mesh.boundaryA.map((p, k) => [p[0] + (mesh.boundaryB[k][0] - p[0]) * t, p[1] + (mesh.boundaryB[k][1] - p[1]) * t] as Vec2);
}

/** Triangles whose orientation flipped (or collapsed) relative to the rest mesh: the warp folded there. */
export function flips(mesh: Mesh, pos: readonly Vec2[]): number {
  let n = 0;
  for (const [i, j, k] of mesh.tris) {
    const a0 = signedArea([mesh.rest[i], mesh.rest[j], mesh.rest[k]]), a1 = signedArea([pos[i], pos[j], pos[k]]);
    if (Math.sign(a0) !== Math.sign(a1) || Math.abs(a1) < Math.abs(a0) * 0.02) n++;
  }
  return n;
}
