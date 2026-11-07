import type { Prim, RGB } from "../renderers/sdf-gl";
import { arcTable, perimeter, pointAt, turns, type Ring, type Vec2 } from "./geom";
import type { Frame } from "./morph";

/**
 * Vector → SDF hand-off. The vector track keeps driving the GEOMETRY; the SDF part field
 * supplies the MATERIAL (bevel, gloss, liquid wobble, fusing between pieces, translucency).
 * Because both draw the same silhouette at every frame, switching tracks cannot jump:
 * "ink glyph → liquid → creature" is a material schedule over one continuous geometry.
 */

export interface Material {
  color: RGB;
  /** Smooth-union radius with everything drawn before this part (the "liquid bridge"). */
  blend?: number;
  /** Edge wobble amplitude in design pixels. */
  wobble?: number;
  gloss?: number;
  sss?: number;
  mottle?: number;
  /** Hole edges subtract with this blend radius. */
  holeBlend?: number;
  /** Anchor for pattern noise, so mottling travels with the part. */
  anchor?: Vec2;
}

/** Fewer, well-placed vertices: keep every corner, spread the rest by arc length. */
export function simplifyRing(ring: Ring, max = 160): Ring {
  if (ring.length <= max) return ring;
  const table = arcTable(ring), total = table[table.length - 1];
  const t = turns(ring);
  const keep = new Set<number>();
  t.forEach((turn, i) => { if (Math.abs(turn) > 0.5) keep.add(i); });
  const corners = [...keep].slice(0, Math.floor(max / 2));
  const params = new Set(corners.map(i => table[i] / total));
  const rest = max - params.size;
  for (let k = 0; k < rest; k++) params.add(k / rest);
  return [...params].sort((a, b) => a - b).map(s => pointAt(ring, table, s));
}

/** One frame's pieces as SDF primitives: outer contours union (blended), holes subtract. */
export function framePrims(frame: Frame, material: Material, maxPoints = 160): Prim[] {
  const out: Prim[] = [];
  const base = {
    color: material.color, gloss: material.gloss ?? 0.3, sss: material.sss ?? 0, mottle: material.mottle ?? 0,
    wobble: material.wobble ?? 0, anchor: material.anchor,
  };
  for (const piece of frame.pieces) {
    if (piece.outer.length < 3 || perimeter(piece.outer) < 2) continue;
    out.push({ ...base, shape: { kind: "polygon", points: simplifyRing(piece.outer, maxPoints) }, blend: material.blend ?? 0 });
    for (const hole of piece.holes) {
      if (hole.length < 3 || perimeter(hole) < 2) continue;
      out.push({ ...base, op: "subtract", shape: { kind: "polygon", points: simplifyRing(hole, Math.ceil(maxPoints / 2)) }, blend: material.holeBlend ?? 0 });
    }
  }
  return out;
}

/** Decal version of a frame: paints colour (and an optional bump) without changing geometry. */
export function frameDecals(frame: Frame, color: RGB, opacity = 1, bump = 0, maxPoints = 96): Prim[] {
  return frame.pieces.filter(p => p.outer.length >= 3).map(p => ({
    shape: { kind: "polygon" as const, points: simplifyRing(p.outer, maxPoints) }, color, decal: true, opacity, bump,
  }));
}
