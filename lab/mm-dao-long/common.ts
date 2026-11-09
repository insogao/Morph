import { framePath } from "../../packages/morph-engine/src/vector/render";
import { distance2, fieldMorph, rasterInside } from "../../packages/morph-engine/src/vector/sdf-field";
import { fromPath, mapShape, type Shape } from "../../packages/morph-engine/src/vector/shape";
import type { GlyphSet } from "../../packages/morph-engine/src/vector/text";
import g500 from "./glyphs-500.json";
import g900 from "./glyphs-900.json";
import g100 from "./glyphs-100.json";

export const INK = "#0c0c0b", CREAM = "#ece3cf";
export const BEAT = 0.5314, INTRO = 4, DROP = INTRO * BEAT;
export const TAU = Math.PI * 2;
export type V = [number, number];

export const clamp = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const v = clamp(x); return v * v * (3 - 2 * v); };
export const hit = (x: number) => { const v = clamp(x); return v * v * (2.2 - 1.2 * v); };
export const outQuad = (x: number) => { const v = clamp(x); return 1 - (1 - v) * (1 - v); };
export const span = (b: number, a0: number, a1: number) => clamp((b - a0) / (a1 - a0));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

export const caps = g500 as GlyphSet, heavy = g900 as GlyphSet, thin = g100 as GlyphSet;

/** A glyph centred on `at` at `size` px (font units: 1000 em, y down, baseline 0; centred on its ink box). */
export function glyphAt(set: GlyphSet, ch: string, at: V, size: number): Shape {
  const raw = fromPath(set.glyphs[ch].d);
  const xs = raw.pieces.flatMap(p => p.outer.map(q => q[0])), ys = raw.pieces.flatMap(p => p.outer.map(q => q[1]));
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, k = size / 1000;
  return mapShape(raw, ([x, y]) => [at[0] + (x - cx) * k, at[1] + (y - cy) * k]);
}
const paths = new WeakMap<Shape, Path2D>();
export const pathOf = (s: Shape) => { let p = paths.get(s); if (!p) { p = framePath(s); paths.set(s, p); } return p; };
export function fillShape(ctx: CanvasRenderingContext2D, s: Shape, color: string, alpha = 1) {
  if (alpha <= 0.003) return;
  ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.fill(pathOf(s), "evenodd"); ctx.globalAlpha = 1;
}

export function inRing(r: ReadonlyArray<readonly [number, number]>, x: number, y: number) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
export const insideShape = (s: Shape) => ([x, y]: readonly [number, number]) => s.pieces.some(p => inRing(p.outer, x, y) && !p.holes.some(h => inRing(h, x, y)));
function paintShape(ctx: CanvasRenderingContext2D, s: Shape) {
  const p = new Path2D();
  for (const piece of s.pieces) for (const r of [piece.outer, ...piece.holes]) { p.moveTo(r[0][0], r[0][1]); for (const q of r) p.lineTo(q[0], q[1]); p.closePath(); }
  ctx.fill(p, "evenodd");
}
/** Inside-test for a shape on an n × n grid over a square region (canvas when available). */
export const rasterShape = (s: Shape, centre: V, half: number, n: number) => rasterInside(centre, half, n, ctx => paintShape(ctx, s)) ?? insideShape(s);

/** A field morph between two shapes, built lazily, frames cached on a 1/240 grid. */
export function lazyFieldMorph(a: () => Shape, b: () => Shape, centre: V, half: number, n: number, ripple = 0) {
  let m: { at(k: number): V[][] } | null = null; const cache = new Map<number, V[][]>();
  return (k: number) => {
    m ??= fieldMorph(centre, half, n, rasterShape(a(), centre, half, n), rasterShape(b(), centre, half, n), ripple) as unknown as { at(k: number): V[][] };
    const q = Math.round(clamp(k) * 240); if (!cache.has(q)) cache.set(q, m.at(q / 240)); return cache.get(q)!;
  };
}
export function fillRings(ctx: CanvasRenderingContext2D, rings: V[][], color: string, alpha = 1) {
  const p = new Path2D(); for (const r of rings) { p.moveTo(r[0][0], r[0][1]); for (const q of r) p.lineTo(q[0], q[1]); p.closePath(); }
  ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.fill(p, "evenodd"); ctx.globalAlpha = 1;
}

/** Points inside a shape on a jittered grid (seeded). */
export function samplePoints(s: Shape, spacing: number, seed: number): V[] {
  const xs = s.pieces.flatMap(p => p.outer.map(q => q[0])), ys = s.pieces.flatMap(p => p.outer.map(q => q[1]));
  const r = rng(seed), test = insideShape(s), out: V[] = [];
  for (let y = Math.min(...ys); y < Math.max(...ys); y += spacing) for (let x = Math.min(...xs); x < Math.max(...xs); x += spacing) {
    const p: V = [x + (r() - 0.5) * spacing * 0.8, y + (r() - 0.5) * spacing * 0.8];
    if (test(p)) out.push(p);
  }
  return out;
}

/**
 * Distance field of a shape over its box (n × n cells): the point deepest inside (thickest stroke), or the point
 * deepest in the empty space (a counter, an opening). `bias` pulls the choice toward the box centre.
 */
export function deepestPoint(s: Shape, inside: boolean, n = 160, bias = 0.15): { at: V; depth: number } {
  const xs = s.pieces.flatMap(p => p.outer.map(q => q[0])), ys = s.pieces.flatMap(p => p.outer.map(q => q[1]));
  const x0 = Math.min(...xs), y0 = Math.min(...ys), size = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0), cell = size / n;
  const test = insideShape(s), m = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) m[j * n + i] = test([x0 + (i + 0.5) * cell, y0 + (j + 0.5) * cell]) ? 1 : 0;
  const on = new Uint8Array(n * n); for (let i = 0; i < n * n; i++) on[i] = inside ? 1 - m[i] : m[i];
  const d = distance2(on, n, n);
  let best = -1, at: V = [0, 0], depth = 0;
  for (let j = 2; j < n - 2; j++) for (let i = 2; i < n - 2; i++) {
    if (inside !== (m[j * n + i] === 1)) continue;
    const dd = Math.sqrt(d[j * n + i]), off = Math.hypot(i - n / 2, j - n / 2) / n, score = dd * (1 - bias * off * 2);
    if (score > best) { best = score; at = [x0 + (i + 0.5) * cell, y0 + (j + 0.5) * cell]; depth = dd * cell; }
  }
  return { at, depth };
}
