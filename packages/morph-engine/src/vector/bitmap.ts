import type { Vec2 } from "./geom";

/**
 * Bitmap material, pure and testable (no DOM). An image becomes a grid of CELLS that carry the
 * image's own colours. Bitmap effects move cells, never invent pixels:
 *   - pixel particles: every cell of A flies to a cell of B, matched along a Hilbert curve so
 *     neighbours stay neighbours and the picture's structure survives the flight;
 *   - the hand-off is LOCAL: a cell's pixels disappear exactly when its particle leaves and
 *     appear exactly when it lands, so there is never a global cross-fade.
 */

export interface Placement {
  /** Where the art's centre goes in design space. */
  at: Vec2;
  /** Design pixels per art pixel. */
  scale: number;
  /** The art pixel that lands on `at` (usually the centre of the subject's bounding box). */
  center: Vec2;
}

export const place = (p: Placement, [u, v]: Vec2): Vec2 => [p.at[0] + (u - p.center[0]) * p.scale, p.at[1] + (v - p.center[1]) * p.scale];

export interface Cell {
  /** Design-space centre. */
  x: number; y: number;
  /** Average colour (0..255, straight alpha) of the art block. */
  r: number; g: number; b: number; a: number;
  /** Art-space block origin. */
  u: number; v: number;
}

/** Cut RGBA pixels into `step` × `step` blocks; keep blocks with average alpha ≥ `minAlpha` (0..1). */
export function cellsFromRGBA(data: ArrayLike<number>, width: number, height: number, step: number, placement: Placement, minAlpha = 0.06): Cell[] {
  const cells: Cell[] = [];
  for (let v = 0; v + step <= height; v += step) for (let u = 0; u + step <= width; u += step) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let y = v; y < v + step; y++) for (let x = u; x < u + step; x++) {
      const i = (y * width + x) * 4, al = data[i + 3];
      r += data[i] * al; g += data[i + 1] * al; b += data[i + 2] * al; a += al;
    }
    const n = step * step;
    if (a / n / 255 < minAlpha) continue;
    const [x, y] = place(placement, [u + step / 2, v + step / 2]);
    cells.push({ x, y, r: r / a, g: g / a, b: b / a, a: a / n / 255, u, v });
  }
  return cells;
}

/** Hilbert-curve index of (x, y) in a 2^order grid: nearby points get nearby indices. */
export function hilbert(x: number, y: number, order = 10): number {
  let d = 0;
  for (let s = 1 << (order - 1); s > 0; s >>= 1) {
    const rx = (x & s) > 0 ? 1 : 0, ry = (y & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) {
      if (rx === 1) { x = s - 1 - x; y = s - 1 - y; }
      [x, y] = [y, x];
    }
  }
  return d;
}

/**
 * Pair the cells of A and B so the picture's layout is preserved: both sets are ordered along a
 * Hilbert curve over their OWN bounding boxes (top-left goes to top-left, and so on) and walked
 * in step. The longer list decides the particle count; the shorter one is reused evenly.
 */
export function matchCells(a: readonly Cell[], b: readonly Cell[]): Array<[number, number]> {
  if (!a.length || !b.length) throw new Error("Both images need visible pixels.");
  const order = (cells: readonly Cell[]) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of cells) { x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y); }
    const sx = 1023 / Math.max(1e-9, x1 - x0), sy = 1023 / Math.max(1e-9, y1 - y0);
    return cells.map((c, i) => ({ i, h: hilbert(Math.round((c.x - x0) * sx), Math.round((c.y - y0) * sy)) })).sort((p, q) => p.h - q.h).map(p => p.i);
  };
  const oa = order(a), ob = order(b), n = Math.max(a.length, b.length);
  return Array.from({ length: n }, (_, k) => [oa[Math.floor(k * a.length / n)], ob[Math.floor(k * b.length / n)]]);
}

/** Deterministic 0..1 hash of an integer. */
export function hash01(n: number): number {
  let h = (n * 374761393 + 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 2D value noise in 0..1 (cell size in design px), for organic fronts. */
export function valueNoise(x: number, y: number, size = 60, seed = 0): number {
  const gx = x / size, gy = y / size, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
  const h = (i: number, j: number) => hash01(((i * 73856093) ^ (j * 19349663) ^ (seed * 83492791)) | 0);
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return (h(ix, iy) * (1 - sx) + h(ix + 1, iy) * sx) * (1 - sy) + (h(ix, iy + 1) * (1 - sx) + h(ix + 1, iy + 1) * sx) * sy;
}

export interface Flight {
  from: number; to: number;
  /** Global progress (0..1) at which the particle leaves A and lands on B. */
  release: number; land: number;
  /** Quadratic Bézier control point of the flight. */
  ctrl: Vec2;
}

/**
 * Release order follows a sweep from `origin` (the cause: where the wind hits, where the tap lands),
 * with a little jitter so the front is organic. Flights curve sideways and lift, so the cloud of
 * particles reads as a swirl rather than a straight smear.
 */
export function schedule(a: readonly Cell[], b: readonly Cell[], pairs: ReadonlyArray<readonly [number, number]>, origin: Vec2,
  opts: { spread?: number; flight?: number; swirl?: number; lift?: number; landOrigin?: Vec2 } = {}): Flight[] {
  const spread = opts.spread ?? 0.45, flight = opts.flight ?? 0.42, swirl = opts.swirl ?? 0.45, lift = opts.lift ?? 70;
  // Departures sweep out from the cause in A; arrivals sweep out from `landOrigin` in B. Both
  // fronts are bent by smooth noise. Landing order must NOT follow the Hilbert pairing, or whole
  // square blocks of B complete together and leave straight edges.
  const landOrigin = opts.landOrigin ?? (() => {
    let x = 0, y = 0;
    for (const c of b) { x += c.x; y += c.y; }
    return [x / b.length, y / b.length] as Vec2;
  })();
  let far = 1, farB = 1;
  for (const c of a) far = Math.max(far, Math.hypot(c.x - origin[0], c.y - origin[1]));
  for (const c of b) farB = Math.max(farB, Math.hypot(c.x - landOrigin[0], c.y - landOrigin[1]));
  return pairs.map(([i, j], k) => {
    const pa = a[i], pb = b[j];
    const d = Math.hypot(pa.x - origin[0], pa.y - origin[1]) / far;
    const release = Math.min(1 - flight, spread * (0.75 * d + 0.25 * valueNoise(pa.x, pa.y, 70, 1)));
    const dB = Math.hypot(pb.x - landOrigin[0], pb.y - landOrigin[1]) / farB;
    const wanted = (1 - spread * 0.9) + spread * 0.9 * (0.7 * dB + 0.3 * valueNoise(pb.x, pb.y, 70, 2)) - 0.02 + 0.04 * hash01(k * 5);
    const land = Math.min(1, Math.max(release + flight * 0.6, wanted));
    const len = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1, nx = -(pb.y - pa.y) / len, ny = (pb.x - pa.x) / len;
    const side = (hash01(k * 3 + 2) - 0.5) * 2 * swirl * len;
    const ctrl: Vec2 = [(pa.x + pb.x) / 2 + nx * side, (pa.y + pb.y) / 2 + ny * side - lift * (0.5 + hash01(k * 3 + 3))];
    return { from: i, to: j, release, land, ctrl };
  });
}

/** Position on a flight at global progress t (eased in-out inside the flight window). */
export function flightAt(a: Cell, b: Cell, f: Flight, t: number): { x: number; y: number; p: number } {
  const raw = Math.max(0, Math.min(1, (t - f.release) / Math.max(1e-6, f.land - f.release)));
  const p = raw < 0.5 ? 2 * raw * raw : 1 - (-2 * raw + 2) ** 2 / 2;
  const q = 1 - p;
  return { x: q * q * a.x + 2 * q * p * f.ctrl[0] + p * p * b.x, y: q * q * a.y + 2 * q * p * f.ctrl[1] + p * p * b.y, p: raw };
}
