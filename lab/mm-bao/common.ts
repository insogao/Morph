import { framePath } from "../../packages/morph-engine/src/vector/render";
import { fromPath, mapShape, type Shape } from "../../packages/morph-engine/src/vector/shape";
import { layoutText, type GlyphSet, type Slot } from "../../packages/morph-engine/src/vector/text";
import g100 from "./glyphs-100.json";
import g500 from "./glyphs-500.json";
import g900 from "./glyphs-900.json";

export { lazyFieldMorph, fillRings } from "../mm-dao-long/common";
export { clamp, smooth, outQuad, outBack, inQuad, span, lerp, rng, dust, BEAT, INTRO, DROP, TAU, type V } from "../mm-and/common";

// palette: paper day (level 1), the dark underneath (levels 2–3), two players, the pickups
export const INK = "#111113", CREAM = "#ece3cf", P1 = "#ff5a36", P2 = "#2fb0ff", ACC = "#ffc531";
export const SHAFT = "#26262b", WATER = "#3d74a8", ICE = "#cfe9f2", SUN = "#ff8f3a";

export const thin = g100 as GlyphSet, ui = g500 as GlyphSet, heavy = g900 as GlyphSet;

/** A glyph with its feet (ink box bottom) at `foot`, horizontally centred on its ink box, `size` px em. */
export function glyphFoot(set: GlyphSet, ch: string, foot: [number, number], size: number): Shape {
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
export function ringsPath(rings: ReadonlyArray<ReadonlyArray<readonly [number, number]>>) {
  const p = new Path2D();
  for (const r of rings) { if (!r.length) continue; p.moveTo(r[0][0], r[0][1]); for (const q of r) p.lineTo(q[0], q[1]); p.closePath(); }
  return p;
}
export const shapeRings = (s: Shape) => s.pieces.flatMap(p => [p.outer, ...p.holes]) as Array<Array<[number, number]>>;

/** A line of UI text centred on `at`. */
export function uiText(text: string, at: [number, number], size: number, tracking = 0.12, set: GlyphSet = ui) {
  return layoutText(set, text, { at, size, tracking });
}
export function fillSlots(ctx: CanvasRenderingContext2D, slots: Slot[], color: string, alpha = 1) {
  if (alpha <= 0.003) return;
  ctx.globalAlpha = alpha; ctx.fillStyle = color;
  for (const s of slots) ctx.fill(pathOf(s.shape), "evenodd");
  ctx.globalAlpha = 1;
}
export const mix = (a: string, b: string, k: number) => {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b), c = A.map((v, i) => Math.round(v + (B[i] - v) * Math.max(0, Math.min(1, k))));
  return "#" + c.map(v => v.toString(16).padStart(2, "0")).join("");
};
