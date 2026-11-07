import type { Prim, RGB, Vec2 } from "../renderers/sdf-gl";

/**
 * Skeleton strokes: the shared representation of limbs, ribs, tentacles, feathers and stems.
 * A stroke is a polyline with a radius per point. Morphing two strokes with the same point
 * count is a per-point blend, which keeps part identity visible through the change.
 */
export interface Stroke {
  points: Vec2[];
  radii: number[];
}

export interface CurveSpec {
  x: number;
  y: number;
  /** Initial heading in radians (0 = +x, π/2 = +y which is downward on screen). */
  angle: number;
  length: number;
  segments: number;
  /** Signed curvature in radians per unit arc length at normalized arc position s ∈ [0, 1]. */
  curvature?: (s: number) => number;
}

/** Integrate a curvature function into a polyline. */
export function curve({ x, y, angle, length, segments, curvature = () => 0 }: CurveSpec): Vec2[] {
  const out: Vec2[] = [[x, y]];
  const step = length / segments;
  let a = angle;
  for (let i = 0; i < segments; i++) {
    const s0 = i / segments, s1 = (i + .5) / segments;
    a += curvature(s0) * step * .5;
    a += curvature(s1) * step * .5;
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    out.push([x, y]);
  }
  return out;
}

export function taper(count: number, root: number, tip: number, power = 1): number[] {
  return Array.from({ length: count }, (_, i) => tip + (root - tip) * Math.pow(1 - i / (count - 1), power));
}

export function blendStroke(a: Stroke, b: Stroke, t: number): Stroke {
  if (a.points.length !== b.points.length) throw new Error("Strokes must have equal point counts to blend.");
  return {
    points: a.points.map((p, i) => [p[0] + (b.points[i][0] - p[0]) * t, p[1] + (b.points[i][1] - p[1]) * t] as Vec2),
    radii: a.radii.map((r, i) => r + (b.radii[i] - r) * t),
  };
}

/** Resample a polyline to n points by arc length. */
export function resample(points: readonly Vec2[], n: number): Vec2[] {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  const total = lengths.at(-1)!;
  const out: Vec2[] = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const target = total * k / (n - 1);
    while (j < points.length - 1 && lengths[j] < target) j++;
    const span = lengths[j] - lengths[j - 1] || 1;
    const t = Math.min(1, Math.max(0, (target - lengths[j - 1]) / span));
    out.push([points[j - 1][0] + (points[j][0] - points[j - 1][0]) * t, points[j - 1][1] + (points[j][1] - points[j - 1][1]) * t]);
  }
  return out;
}

export interface StrokeStyle extends Omit<Prim, "shape" | "color" | "blend"> {
  color: RGB | ((s: number) => RGB);
  /** Blend of the first segment into whatever came before (the body). */
  rootBlend?: number;
  /** Blend between consecutive segments. Small values avoid bulging joints. */
  jointBlend?: number;
}

/** Convert a stroke into tapered capsule primitives. Segments with zero radius are skipped. */
export function strokePrims({ points, radii }: Stroke, style: StrokeStyle): Prim[] {
  const out: Prim[] = [];
  const { color, rootBlend = 0, jointBlend = .6, ...rest } = style;
  for (let i = 0; i < points.length - 1; i++) {
    const ra = radii[i], rb = radii[i + 1];
    if (ra <= .05 && rb <= .05) continue;
    const s = (i + .5) / (points.length - 1);
    out.push({
      ...rest,
      shape: { kind: "capsule", ax: points[i][0], ay: points[i][1], bx: points[i + 1][0], by: points[i + 1][1], ra: Math.max(ra, 0), rb: Math.max(rb, 0) },
      color: typeof color === "function" ? color(s) : color,
      blend: out.length === 0 ? rootBlend : jointBlend,
    });
  }
  return out;
}

/** Point along a polyline at normalized arc parameter s, plus the unit tangent there. */
export function along(points: readonly Vec2[], s: number): { p: Vec2; t: Vec2 } {
  const r = resample(points, 33);
  const f = Math.min(31.999, Math.max(0, s * 32));
  const i = Math.floor(f), u = f - i;
  const a = r[i], b = r[i + 1];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return { p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], t: [(b[0] - a[0]) / len, (b[1] - a[1]) / len] };
}

// ---- small deterministic helpers ----

export function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
export const smooth = (t: number) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const smoother = (t: number) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
/** Smoothstep window from a to b on time. */
export const win = (time: number, a: number, b: number) => smooth((time - a) / (b - a));
export const mixRGB = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const hex = (h: string): RGB => {
  const n = parseInt(h.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
/** Ease with overshoot, for organic settling. */
export const backOut = (t: number, s = 1.4) => { t = clamp(t) - 1; return 1 + t * t * ((s + 1) * t + s); };

/** Rigid transform (rotate by angle about pivot, uniform scale, then translate) applied to primitives. */
export function transformPrims(prims: readonly Prim[], angle: number, pivot: Vec2, translate: Vec2 = [0, 0], scale = 1): Prim[] {
  if (!angle && scale === 1 && !translate[0] && !translate[1]) return prims as Prim[];
  const c = Math.cos(angle), s = Math.sin(angle);
  const P = (x: number, y: number): Vec2 => {
    const dx = (x - pivot[0]) * scale, dy = (y - pivot[1]) * scale;
    return [c * dx - s * dy + pivot[0] + translate[0], s * dx + c * dy + pivot[1] + translate[1]];
  };
  return prims.map(prim => {
    const sh = prim.shape;
    const anchor = prim.anchor ? P(...prim.anchor) : undefined;
    let shape: Prim["shape"];
    if (sh.kind === "ellipse") {
      const [x, y] = P(sh.x, sh.y);
      shape = { kind: "ellipse", x, y, rx: sh.rx * scale, ry: sh.ry * scale, rotation: (sh.rotation ?? 0) + angle };
    } else if (sh.kind === "box") {
      const [x, y] = P(sh.x, sh.y);
      shape = { ...sh, x, y, hw: sh.hw * scale, hh: sh.hh * scale, radius: (sh.radius ?? 0) * scale, rotation: (sh.rotation ?? 0) + angle };
    } else if (sh.kind === "capsule") {
      const [ax, ay] = P(sh.ax, sh.ay), [bx, by] = P(sh.bx, sh.by);
      shape = { kind: "capsule", ax, ay, bx, by, ra: sh.ra * scale, rb: sh.rb * scale };
    } else if (sh.kind === "polygon") {
      shape = { kind: "polygon", points: sh.points.map(([x, y]) => P(x, y)) };
    } else {
      const len = Math.hypot(sh.nx, sh.ny) || 1;
      const nx = sh.nx / len, ny = sh.ny / len;
      const rx = c * nx - s * ny, ry = s * nx + c * ny;
      const offset = scale * (sh.offset - (nx * pivot[0] + ny * pivot[1])) + rx * (pivot[0] + translate[0]) + ry * (pivot[1] + translate[1]);
      shape = { kind: "halfplane", nx: rx, ny: ry, offset };
    }
    return { ...prim, shape, anchor, blend: (prim.blend ?? 0) * scale, wobble: (prim.wobble ?? 0) * scale, bump: (prim.bump ?? 0) * scale };
  });
}
