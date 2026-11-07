import type { Vec2 } from "./geom";
import { traceAlpha } from "./trace";

/**
 * Signed-distance morph of two silhouettes on a shared grid (pure).
 *
 * For two shapes that are ALREADY aligned and mostly overlap (a shape rhyme laid over its partner), blending their
 * signed distance fields gives the cleanest in-between: shared area stays put, what only A has thins along its
 * medial axis and goes, what only B has grows from a line to full width. Outline-correspondence morphs twist on
 * hooked or spiral shapes (a J-hook into a curled tentacle pinched and ballooned); fields can't twist.
 */

/** 1D squared Euclidean distance transform (Felzenszwalb–Huttenlocher). */
function edt1(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]]; }
}

/** Squared distance (in cells) from every cell to the nearest cell where `on` is true. */
export function distance2(on: Uint8Array, w: number, h: number): Float64Array {
  const INF = 1e20, g = new Float64Array(w * h);
  const n = Math.max(w, h), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = on[y * w + x] ? 0 : INF;
    edt1(f, h, d, v, z);
    for (let y = 0; y < h; y++) g[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = g[y * w + x];
    edt1(f, w, d, v, z);
    for (let x = 0; x < w; x++) g[y * w + x] = d[x];
  }
  return g;
}

/** Signed distance in cells: negative inside, positive outside. */
export function signedField(inside: Uint8Array, w: number, h: number): Float32Array {
  const outside = new Uint8Array(inside.length);
  for (let i = 0; i < inside.length; i++) outside[i] = inside[i] ? 0 : 1;
  const dIn = distance2(inside, w, h), dOut = distance2(outside, w, h), s = new Float32Array(inside.length);
  for (let i = 0; i < s.length; i++) s[i] = inside[i] ? -(Math.sqrt(dOut[i]) - 0.5) : Math.sqrt(dIn[i]) - 0.5;
  return s;
}

export interface FieldMorph {
  /** Outline rings (world units) of the blended shape at k ∈ [0, 1]. */
  at(k: number): Vec2[][];
}

/**
 * A field morph over a square world region (centre, half-size), from two inside-tests sampled on an n × n grid.
 * `insideA` / `insideB` take world points.
 */
export function fieldMorph(centre: Vec2, half: number, n: number, insideA: (p: Vec2) => boolean, insideB: (p: Vec2) => boolean,
  /** Ripple: cells farther from `centre` start later (0 = all at once). The change spreads out from the rhyme. */
  ripple = 0): FieldMorph {
  const cell = 2 * half / n, x0 = centre[0] - half, y0 = centre[1] - half;
  const sample = (inside: (p: Vec2) => boolean) => {
    const m = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) m[j * n + i] = inside([x0 + (i + 0.5) * cell, y0 + (j + 0.5) * cell]) ? 1 : 0;
    return signedField(m, n, n);
  };
  const sa = sample(insideA), sb = sample(insideB);
  const delay = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) delay[j * n + i] = ripple * Math.min(1, Math.hypot(i + 0.5 - n / 2, j + 0.5 - n / 2) / (n / 2));
  const rgba = new Uint8ClampedArray(n * n * 4);
  return {
    at(k: number) {
      // Encode the blended field as "alpha" with a linear ramp across the zero crossing, so marching squares at
      // 0.5 lands exactly on the zero level set (sub-cell accurate).
      for (let i = 0; i < n * n; i++) {
        const u = ripple ? Math.max(0, Math.min(1, (k - delay[i]) / (1 - ripple))) : k, e = u * u * (3 - 2 * u);
        const f = (1 - e) * sa[i] + e * sb[i];
        rgba[i * 4 + 3] = Math.max(0, Math.min(255, Math.round((0.5 - f * 0.5) * 255)));
      }
      return traceAlpha(rgba, n, n, { tolerance: 0.35, minArea: 0.5 }).map(r => r.map(([x, y]) => [x0 + x * cell, y0 + y * cell] as Vec2));
    },
  };
}
