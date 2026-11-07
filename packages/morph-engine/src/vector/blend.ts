import { arcTable, pointAt, type Ring, type Vec2 } from "./geom";
import { corners, matchRings, type Pin } from "./correspond";

/**
 * BlendSpace: ONE contour pulled toward several targets at once by weights.
 * Unlike a sequence (A then B then C) or a split (clones), there is a single object whose
 * shape is base + Σ wᵢ·(targetᵢ − base). Each target is matched to the base once; all
 * matches are resampled onto one shared parameterisation of the base contour.
 */
export interface BlendSpace {
  /** Shared samples of the base contour. */
  base: Vec2[];
  /** targets[i][j] corresponds to base[j]. */
  targets: Vec2[][];
  at(weights: readonly number[]): Vec2[];
}

export function blendSpace(base: Ring, targets: readonly Ring[], options: { pins?: ReadonlyArray<readonly Pin[]>; samples?: number } = {}): BlendSpace {
  if (!targets.length) throw new Error("A blend space needs at least one target.");
  const table = arcTable(base), total = table[table.length - 1];
  const n = options.samples ?? Math.max(64, Math.ceil(total / 3));
  const matches = targets.map((target, k) => matchRings(base, target, { pins: options.pins?.[k] }));
  // Base parameter of every match sample, measured from the base's own start point.
  const info = matches.map(m => {
    const ta = arcTable(m.a), La = ta[ta.length - 1];
    return { m, offset: nearestStart(base, table, m.a[0]), sa: m.a.map((_, i) => ta[i] / La) };
  });
  // Shared samples: uniform, plus every corner of the base and of each target, so no
  // pure state loses a tip to resampling.
  const marks = new Set<number>();
  for (let i = 0; i < n; i++) marks.add(i / n);
  for (const c of corners(base, table)) marks.add(c.s);
  targets.forEach((target, k) => {
    const { m, offset, sa } = info[k];
    for (const c of corners(target)) {
      const i = m.b.findIndex(p => (p[0] - c.p[0]) ** 2 + (p[1] - c.p[1]) ** 2 < 1e-10);
      if (i >= 0) marks.add((((sa[i] + offset) % 1) + 1) % 1);
    }
  });
  const sortedMarks = [...marks].sort((x, y) => x - y);
  const params = sortedMarks.filter((s, i) => i === 0 || s - sortedMarks[i - 1] > 1e-7);
  const sampled = params.map(s => pointAt(base, table, s));
  const along = (k: number, s: number): Vec2 => {
    const { m, offset, sa } = info[k];
    const u = (((s - offset) % 1) + 1) % 1;
    let lo = 0, hi = sa.length;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (sa[mid] <= u) lo = mid; else hi = mid; }
    const next = (lo + 1) % sa.length, s1 = next === 0 ? 1 : sa[next], f = s1 > sa[lo] ? (u - sa[lo]) / (s1 - sa[lo]) : 0;
    const p = m.b[lo], q = m.b[next];
    return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
  };
  const mapped = targets.map((_, k) => params.map(s => along(k, s)));
  return {
    base: sampled,
    targets: mapped,
    at(weights) {
      if (weights.length !== mapped.length) throw new Error("Expected " + mapped.length + " weights.");
      return sampled.map((p, j) => {
        let x = p[0], y = p[1];
        weights.forEach((w, k) => { x += w * (mapped[k][j][0] - p[0]); y += w * (mapped[k][j][1] - p[1]); });
        return [x, y] as Vec2;
      });
    },
  };
}

function nearestStart(ring: Ring, table: number[], p: Vec2): number {
  // Arc-length fraction of the base point the match started from.
  let best = Infinity, at = 0;
  for (let i = 0; i < 720; i++) {
    const q = pointAt(ring, table, i / 720), d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
    if (d < best) { best = d; at = i / 720; }
  }
  return at;
}
