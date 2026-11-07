import { arcTable, dist, nearestParam, perimeter, pointAt, selfIntersections, signedArea, turns, type Ring } from "./geom";
import type { Frame } from "./morph";

/**
 * How much "form" a ring has. A blob is close to a circle: round (isoperimetric ratio → 1)
 * and without corners. The middle frame of a good morph should keep form.
 */
export function formOf(ring: Ring, cornerTurn = 0.5) {
  const area = Math.abs(signedArea(ring)), per = perimeter(ring);
  return {
    corners: turns(ring).filter(t => Math.abs(t) >= cornerTurn).length,
    roundness: per > 0 ? 4 * Math.PI * area / (per * per) : 0,
    area,
  };
}

/** Largest distance from any sample of `a` to the polyline `b` (one-sided Hausdorff). */
export function deviation(a: Ring, b: Ring): number {
  const tb = arcTable(b);
  let worst = 0;
  for (const p of a) worst = Math.max(worst, dist(p, pointAt(b, tb, nearestParam(b, tb, p))));
  return worst;
}

export function frameSelfHits(frame: Frame): number {
  return frame.pieces.reduce((s, p) => s + selfIntersections(p.outer, 16).length + p.holes.reduce((q, h) => q + selfIntersections(h, 16).length, 0), 0);
}
