import { perimeter, pushAll, signedArea, type Ring, type Vec2 } from "./geom";
import type { Shape } from "./shape";
import { colorDistance } from "./render";

/**
 * Shape rhymes (graphic match / match cut), pure and testable.
 *
 * Instead of deforming A into B, find a part of A and a part of B that already LOOK alike (a letter O
 * and the sun, a coffee surface and the soil in a pot, an umbrella's canopy and an octopus's head),
 * push the camera in until that part fills the frame, hand it over there — where the two coincide —
 * and pull out on B. Only the rhyming pair has to change, and they are similar by construction.
 *
 * Every shape is summarised by its moment ellipse (centre, semi-axes, angle) plus a few scale-free
 * descriptors. The ellipse also gives the similarity transform that lays B's part onto A's.
 */

export interface Ellipse { c: Vec2; a: number; b: number; angle: number }

export interface Descriptor {
  ellipse: Ellipse;
  area: number;
  /** 4πA / P², 1 for a disc, → 0 for thin or ragged shapes. */
  circularity: number;
  /** b / a of the moment ellipse: 1 round, → 0 long. */
  elongation: number;
  /** Area / convex-hull area: 1 convex, lower for concave (stars, letters with notches). */
  solidity: number;
  holes: number;
  /** Fill colour (hex), when known. A rhyme is shape AND colour. */
  color?: string;
}

/** Ellipse with the same area moments as a weighted point set (centroid + covariance). */
function ellipseFromMoments(m00: number, mx: number, my: number, mxx: number, myy: number, mxy: number): Ellipse {
  const cx = mx / m00, cy = my / m00;
  const sxx = mxx / m00 - cx * cx, syy = myy / m00 - cy * cy, sxy = mxy / m00 - cx * cy;
  const tr = sxx + syy, det = sxx * syy - sxy * sxy, d = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const l1 = tr / 2 + d, l2 = Math.max(0, tr / 2 - d);
  // A uniform ellipse with semi-axes a, b has variances a²/4 and b²/4.
  return { c: [cx, cy], a: 2 * Math.sqrt(l1), b: 2 * Math.sqrt(l2), angle: 0.5 * Math.atan2(2 * sxy, sxx - syy) };
}

/** Area moments of a polygon (signed, so holes subtract). */
function ringMoments(ring: Ring) {
  let m00 = 0, mx = 0, my = 0, mxx = 0, myy = 0, mxy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % ring.length], c = x0 * y1 - x1 * y0;
    m00 += c / 2;
    mx += (x0 + x1) * c / 6; my += (y0 + y1) * c / 6;
    mxx += (x0 * x0 + x0 * x1 + x1 * x1) * c / 12;
    myy += (y0 * y0 + y0 * y1 + y1 * y1) * c / 12;
    mxy += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * c / 24;
  }
  return [m00, mx, my, mxx, myy, mxy];
}

function hullArea(points: readonly Vec2[]): number {
  const p = [...points].sort((u, v) => u[0] - v[0] || u[1] - v[1]);
  if (p.length < 3) return 0;
  const crossO = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Vec2[] = [], upper: Vec2[] = [];
  for (const q of p) { while (lower.length >= 2 && crossO(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (const q of p.reverse()) { while (upper.length >= 2 && crossO(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return Math.abs(signedArea([...lower.slice(0, -1), ...upper.slice(0, -1)]));
}

/**
 * Descriptor of a vector shape. A rhyme is about the SILHOUETTE the eye reads, so everything is measured on the
 * outer contours (an O and a disc share one); holes only count as a small mismatch (an O can close into a disc).
 */
export function describeShape(shape: Shape): Descriptor {
  const acc = [0, 0, 0, 0, 0, 0];
  let per = 0, holes = 0;
  const pts: Vec2[] = [];
  for (const piece of shape.pieces) {
    holes += piece.holes.length;
    const m = ringMoments(piece.outer), sign = Math.sign(m[0]);
    for (let i = 0; i < 6; i++) acc[i] += sign * m[i];
    per += perimeter(piece.outer);
    pushAll(pts, piece.outer);
  }
  const area = acc[0], ellipse = ellipseFromMoments(acc[0], acc[1], acc[2], acc[3], acc[4], acc[5]);
  return {
    ellipse,
    area,
    circularity: Math.min(1, 4 * Math.PI * area / Math.max(1e-9, per * per)),
    elongation: ellipse.b / Math.max(1e-9, ellipse.a),
    solidity: Math.min(1, area / Math.max(1e-9, hullArea(pts))),
    holes,
  };
}

/** Descriptor of the opaque pixels of an RGBA image inside a box [x0, y0, x1, y1] (image pixels). */
export function describeMask(data: ArrayLike<number>, width: number, box: readonly [number, number, number, number], step = 2, alphaMin = 128): Descriptor {
  let m00 = 0, mx = 0, my = 0, mxx = 0, myy = 0, mxy = 0;
  const pts: Vec2[] = [];
  const [x0, y0, x1, y1] = box.map(Math.round);
  let edge = 0;
  const on = (x: number, y: number) => x >= x0 && x < x1 && y >= y0 && y < y1 && data[(y * width + x) * 4 + 3] >= alphaMin;
  for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
    if (!on(x, y)) continue;
    const w = step * step;
    m00 += w; mx += w * x; my += w * y; mxx += w * x * x; myy += w * y * y; mxy += w * x * y;
    if (!on(x + step, y) || !on(x - step, y) || !on(x, y + step) || !on(x, y - step)) { edge += step; pts.push([x, y]); }
  }
  if (!m00) throw new Error("describeMask: no opaque pixels in the box.");
  const ellipse = ellipseFromMoments(m00, mx, my, mxx, myy, mxy);
  let cr = 0, cg = 0, cb = 0, cn = 0;
  for (let y = y0; y < y1; y += step * 2) for (let x = x0; x < x1; x += step * 2) if (on(x, y)) { const i = (y * width + x) * 4; cr += data[i]; cg += data[i + 1]; cb += data[i + 2]; cn++; }
  const hex = "#" + [cr, cg, cb].map(v => Math.round(v / Math.max(1, cn)).toString(16).padStart(2, "0")).join("");
  return { color: hex, ellipse, area: m00, circularity: Math.min(1, 4 * Math.PI * m00 / Math.max(1e-9, edge * edge)), elongation: ellipse.b / Math.max(1e-9, ellipse.a), solidity: Math.min(1, m00 / Math.max(1e-9, hullArea(pts))), holes: 0 };
}

/**
 * How well two shapes rhyme, 0..1 (scale-, position- and rotation-free).
 * Elongation matters most (what the camera can't fix), then circularity and solidity; a hole mismatch costs a little
 * (an O can close into a disc), colour is not judged here — meaning and colour are the caller's tie-break.
 */
export function rhymeScore(a: Descriptor, b: Descriptor): number {
  return shapeScore(a, b) * colorScore(a, b);
}

/** Geometry only. */
export function shapeScore(a: Descriptor, b: Descriptor): number {
  const e = Math.abs(Math.log(Math.max(0.02, a.elongation) / Math.max(0.02, b.elongation)));
  const c = Math.abs(a.circularity - b.circularity), s = Math.abs(a.solidity - b.solidity);
  const h = a.holes === b.holes ? 0 : 0.12;
  return Math.max(0, 1 - 0.55 * e - 0.6 * c - 0.6 * s - h);
}

/**
 * Colour factor: a match cut only reads as ONE thing changing when the rhyming shapes are (nearly) the same colour —
 * title designers draw both ends in one palette. ΔE 0 → 1, ΔE ≥ 0.3 → 0.25. Unknown colour → 1.
 */
export function colorScore(a: Descriptor, b: Descriptor): number {
  if (!a.color || !b.color) return 1;
  return Math.max(0.25, 1 - 2.5 * colorDistance(a.color, b.color));
}

/** Similarity transform x ↦ s·R(θ)·(x − from) + to. */
export interface Similarity { scale: number; angle: number; from: Vec2; to: Vec2 }

export const applySim = (t: Similarity, p: Vec2): Vec2 => {
  const x = (p[0] - t.from[0]) * t.scale, y = (p[1] - t.from[1]) * t.scale, c = Math.cos(t.angle), s = Math.sin(t.angle);
  return [t.to[0] + c * x - s * y, t.to[1] + s * x + c * y];
};

/** a ∘ b (apply b first). */
export function composeSim(a: Similarity, b: Similarity): Similarity {
  return { scale: a.scale * b.scale, angle: a.angle + b.angle, from: b.from, to: applySim(a, b.to) };
}

export const invertSim = (t: Similarity): Similarity => ({ scale: 1 / t.scale, angle: -t.angle, from: t.to, to: t.from });

/** A bitmap placement (art px → design) as a similarity. */
export const simOfPlacement = (p: { at: Vec2; scale: number; center: Vec2 }): Similarity => ({ scale: p.scale, angle: 0, from: p.center, to: p.at });

/** Map an ellipse through a similarity. */
export const mapEllipse = (t: Similarity, e: Ellipse): Ellipse => ({ c: applySim(t, e.c), a: e.a * t.scale, b: e.b * t.scale, angle: e.angle + t.angle });

/**
 * The transform that lays ellipse `b` onto ellipse `a`: equal area, axes aligned (an ellipse's axis is
 * ambiguous by π; the smaller turn wins; near-round shapes don't turn at all).
 */
export function alignEllipse(a: Ellipse, b: Ellipse): Similarity {
  const scale = Math.sqrt((a.a * a.b) / Math.max(1e-9, b.a * b.b));
  // An ellipse's axis means nothing when either shape is roundish: don't turn then.
  const round = Math.max(a.b / Math.max(1e-9, a.a), b.b / Math.max(1e-9, b.a)) > 0.7;
  let angle = round ? 0 : a.angle - b.angle;
  angle = ((angle + Math.PI / 2) % Math.PI + Math.PI) % Math.PI - Math.PI / 2;
  return { scale, angle, from: b.c, to: a.c };
}

/** Opaque pixel samples of an RGBA image inside a box (image px), for overlap scoring. */
export function maskPoints(data: ArrayLike<number>, width: number, box: readonly [number, number, number, number], step = 3, alphaMin = 128): Vec2[] {
  const out: Vec2[] = [];
  for (let y = Math.round(box[1]); y < box[3]; y += step) for (let x = Math.round(box[0]); x < box[2]; x += step)
    if (data[(y * width + x) * 4 + 3] >= alphaMin) out.push([x, y]);
  return out;
}

/**
 * Refine an alignment by overlap: search angle / scale / offset around `init` and keep the transform under which
 * B's pixels land on A's and A's on B's (symmetric coverage). Moment ellipses only get irregular shapes (a hook,
 * a curl) roughly right; this makes them coincide. Note: a similarity cannot MIRROR — pick a B part that curls
 * the same way as A's.
 */
export function refineAlign(a: readonly Vec2[], b: readonly Vec2[], init: Similarity, cell = 4): { align: Similarity; overlap: number } {
  const key = (x: number, y: number) => Math.round(x / cell) * 100003 + Math.round(y / cell);
  const setA = new Set(a.map(([x, y]) => key(x, y)));
  const inv = (t: Similarity, p: Vec2): Vec2 => { // A → B
    const x = p[0] - t.to[0], y = p[1] - t.to[1], c = Math.cos(-t.angle), s = Math.sin(-t.angle);
    return [t.from[0] + (c * x - s * y) / t.scale, t.from[1] + (s * x + c * y) / t.scale];
  };
  const sub = (pts: readonly Vec2[], n: number) => pts.filter((_, i) => i % Math.max(1, Math.floor(pts.length / n)) === 0);
  const sa = sub(a, 900), sb = sub(b, 900);
  const cellB = cell / Math.max(1e-9, init.scale);
  const setB = new Set(b.map(([x, y]) => Math.round(x / cellB) * 100003 + Math.round(y / cellB)));
  const score = (t: Similarity) => {
    let hb = 0, ha = 0;
    for (const p of sb) { const q = applySim(t, p); if (setA.has(key(q[0], q[1]))) hb++; }
    for (const p of sa) { const q = inv(t, p); if (setB.has(Math.round(q[0] / cellB) * 100003 + Math.round(q[1] / cellB))) ha++; }
    return Math.min(hb / sb.length, ha / sa.length);
  };
  let best = init, bestS = score(init);
  // Coarse-to-fine coordinate search.
  for (const [dA, dS, dT] of [[0.35, 0.18, 24], [0.12, 0.07, 10], [0.04, 0.025, 4], [0.015, 0.01, 1.5]] as const) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const t of [
        { ...best, angle: best.angle + dA }, { ...best, angle: best.angle - dA },
        { ...best, scale: best.scale * (1 + dS) }, { ...best, scale: best.scale / (1 + dS) },
        { ...best, to: [best.to[0] + dT, best.to[1]] as Vec2 }, { ...best, to: [best.to[0] - dT, best.to[1]] as Vec2 },
        { ...best, to: [best.to[0], best.to[1] + dT] as Vec2 }, { ...best, to: [best.to[0], best.to[1] - dT] as Vec2 },
      ]) { const sc = score(t); if (sc > bestS + 1e-4) { best = t; bestS = sc; improved = true; } }
    }
  }
  return { align: best, overlap: bestS };
}

export interface RhymeCandidate { a: string; b: string; score: number; align: Similarity; note: string }

/** Rank every (part of A, part of B) pair by rhyme. Parts are { id, d }. */
export function suggestRhymes(as: ReadonlyArray<{ id: string; d: Descriptor }>, bs: ReadonlyArray<{ id: string; d: Descriptor }>, top = 8): RhymeCandidate[] {
  const out: RhymeCandidate[] = [];
  for (const a of as) for (const b of bs) {
    const score = rhymeScore(a.d, b.d), align = alignEllipse(a.d.ellipse, b.d.ellipse);
    const shape = (d: Descriptor) => d.elongation > 0.85 && d.circularity > 0.75 ? "round" : d.elongation < 0.3 ? "long" : d.solidity < 0.75 ? "concave" : "oval";
    const dc = a.d.color && b.d.color ? colorDistance(a.d.color, b.d.color) : 0;
    out.push({ a: a.id, b: b.id, score, align, note: shape(a.d) + " ↔ " + shape(b.d) + (a.d.holes !== b.d.holes ? ", holes " + a.d.holes + " → " + b.d.holes : "") + (dc > 0.08 ? ", COLOURS DIFFER (ΔE " + dc.toFixed(2) + "): restyle both into one palette, or skip" : "") });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, top);
}

// ——— 2D camera ———————————————————————————————————————————————————————————————

/** A 2D camera: world point `c` at the screen centre, magnified by `zoom`, world rotated by −angle. */
export interface Cam { c: Vec2; zoom: number; angle: number }

export const HOME: Cam = { c: [640, 360], zoom: 1, angle: 0 };

export function applyCam(ctx: CanvasRenderingContext2D, cam: Cam, screen: Vec2 = [640, 360]) {
  ctx.translate(screen[0], screen[1]);
  ctx.rotate(-cam.angle);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.c[0], -cam.c[1]);
}

/** The camera that frames an ellipse so its long axis spans `fill` of the frame width (rotated with it if `turn`). */
export function frameEllipse(e: Ellipse, fill = 0.7, turn = false, frame: Vec2 = [1280, 720]): Cam {
  const angle = turn ? e.angle : 0;
  const ca = Math.abs(Math.cos(e.angle - angle)), sa = Math.abs(Math.sin(e.angle - angle));
  const halfW = e.a * ca + e.b * sa, halfH = e.a * sa + e.b * ca;
  return { c: e.c, zoom: fill * Math.min(frame[0] / (2 * halfW), frame[1] / (2 * halfH)), angle };
}

/** The camera that shows a world drawn through similarity `t` exactly as the untransformed world looks at HOME. */
export function camThrough(t: Similarity, home: Cam = HOME): Cam {
  return { c: applySim(t, home.c), zoom: home.zoom / t.scale, angle: home.angle + t.angle };
}

/**
 * Interpolate two cameras like a real push-in / pull-out: zoom moves in log space, and the centre moves so
 * that the point being zoomed towards stays put on screen (no sideways drift that a linear centre would add).
 */
export function lerpCam(a: Cam, b: Cam, k: number): Cam {
  const za = a.zoom, zb = b.zoom, zoom = za * Math.pow(zb / za, k);
  const w = Math.abs(zb - za) < 1e-6 * za ? k : (1 / zoom - 1 / za) / (1 / zb - 1 / za);
  let da = b.angle - a.angle;
  da = Math.atan2(Math.sin(da), Math.cos(da));
  return { c: [a.c[0] + (b.c[0] - a.c[0]) * w, a.c[1] + (b.c[1] - a.c[1]) * w], zoom, angle: a.angle + da * k };
}
