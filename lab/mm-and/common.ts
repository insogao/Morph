import { framePath } from "../../packages/morph-engine/src/vector/render";
import { fromPath, mapShape, type Shape } from "../../packages/morph-engine/src/vector/shape";
import { layoutText, type GlyphSet, type Slot } from "../../packages/morph-engine/src/vector/text";
import g100 from "./glyphs-100.json";
import g600 from "./glyphs-600.json";
import g900 from "./glyphs-900.json";

export { lazyFieldMorph, fillRings, samplePoints } from "../mm-dao-long/common";

// palette: the night, the page, two players
export const INK = "#111113", CREAM = "#ece3cf", P1 = "#ff5a36", P2 = "#2fb0ff";
export const BEAT = 0.5314, INTRO = 4, DROP = INTRO * BEAT;
export const TAU = Math.PI * 2;
export type V = [number, number];

export const clamp = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const v = clamp(x); return v * v * (3 - 2 * v); };
export const outQuad = (x: number) => { const v = clamp(x); return 1 - (1 - v) * (1 - v); };
export const outBack = (x: number) => { const v = clamp(x) - 1; return 1 + v * v * (2.7 * v + 1.7); };
export const inQuad = (x: number) => { const v = clamp(x); return v * v; };
export const span = (b: number, a0: number, a1: number) => clamp((b - a0) / (a1 - a0));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

export const thin = g100 as GlyphSet, ui = g600 as GlyphSet, heavy = g900 as GlyphSet;

/** A glyph with its feet (ink box bottom) at `foot`, horizontally centred on it, at `size` px em. */
export function glyphFoot(set: GlyphSet, ch: string, foot: V, size: number): Shape {
  const raw = fromPath(set.glyphs[ch].d);
  const xs = raw.pieces.flatMap(p => p.outer.map(q => q[0])), ys = raw.pieces.flatMap(p => p.outer.map(q => q[1]));
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, by = Math.max(...ys), k = size / 1000;
  return mapShape(raw, ([x, y]) => [foot[0] + (x - cx) * k, foot[1] + (y - by) * k]);
}
export function box(s: Shape) {
  const xs = s.pieces.flatMap(p => p.outer.map(q => q[0])), ys = s.pieces.flatMap(p => p.outer.map(q => q[1]));
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
const paths = new WeakMap<Shape, Path2D>();
export const pathOf = (s: Shape) => { let p = paths.get(s); if (!p) { p = framePath(s); paths.set(s, p); } return p; };
export function fillShape(ctx: CanvasRenderingContext2D, s: Shape, color: string, alpha = 1) {
  if (alpha <= 0.003) return;
  ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.fill(pathOf(s), "evenodd"); ctx.globalAlpha = 1;
}

/** A word laid out with its cap line (the top players stand on) at `top`, starting at x `left`. */
export interface Word { text: string; slots: Slot[]; left: number; right: number; top: number; bottom: number }
export function word(set: GlyphSet, text: string, left: number, top: number, size: number, tracking = 0.02): Word {
  const probe = layoutText(set, text, { at: [0, 0], size, tracking });
  const b0 = probe.map(s => box(s.shape));
  const pl = Math.min(...b0.map(b => b.x0)), pt = Math.min(...b0.map(b => b.y0));
  const slots = layoutText(set, text, { at: [left - pl, top - pt], size, tracking });
  const bs = slots.map(s => box(s.shape));
  return { text, slots, left, right: Math.max(...bs.map(b => b.x1)), top, bottom: Math.max(...bs.map(b => b.y1)) };
}
export function slotBox(s: Slot) { return box(s.shape); }

/** A line of UI text, centred on `at`, drawn in one colour. */
export function uiText(text: string, at: V, size: number, tracking = 0.12, set: GlyphSet = ui) {
  return layoutText(set, text, { at, size, tracking });
}
export function fillSlots(ctx: CanvasRenderingContext2D, slots: Slot[], color: string, alpha = 1) {
  if (alpha <= 0.003) return;
  ctx.globalAlpha = alpha; ctx.fillStyle = color;
  for (const s of slots) ctx.fill(pathOf(s.shape), "evenodd");
  ctx.globalAlpha = 1;
}

/** Landing dust: small squares kicked sideways along the ground, deterministic per landing. */
export function dust(ctx: CanvasRenderingContext2D, at: V, age: number, color: string, seed: number, power = 1) {
  if (age < 0 || age > 0.9) return;
  const r = rng(seed); ctx.fillStyle = color;
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? 1 : -1, v = (40 + r() * 70) * power, up = (8 + r() * 26) * power, k = outQuad(age / 0.9);
    const x = at[0] + side * (12 + v * k), y = at[1] - up * Math.sin(Math.PI * Math.min(1, k * 1.2)) - 2, s = (3 + r() * 4) * (1 - k);
    if (s <= 0.2) continue;
    ctx.globalAlpha = 0.9 * (1 - k); ctx.fillRect(x - s / 2, y - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
}
