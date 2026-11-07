import { bounds, maxOf, minOf, type Vec2 } from "./geom";
import { morphShapes, type Frame, type MorphOptions, type ShapeMorph } from "./morph";
import { fromPath, mapShape, type Shape } from "./shape";

/**
 * Text on the vector track: glyph slots, word → word with stable letters, text ↔ icon.
 * Glyph outlines come from `tools/glyphs.mjs` (1000-unit em, y down, baseline at 0).
 */

export interface GlyphSet {
  em: number;
  space: number;
  fonts: Record<string, { family: string; weight: number; source: string; capHeight: number }>;
  glyphs: Record<string, { d: string; advance: number; font: string }>;
}

export interface Slot {
  ch: string;
  shape: Shape;
  /** Centre of the glyph's ink box. */
  center: Vec2;
  /** Layout box: left edge, advance width, baseline. */
  x: number; width: number; baseline: number;
}

export interface LayoutOptions {
  /** Centre of the line. */
  at: Vec2;
  /** Font size in design pixels (em size). */
  size: number;
  /** Extra space between letters, in em. */
  tracking?: number;
  /** Per-font scale, e.g. to optically match CJK to Latin cap height. */
  fontScale?: Record<string, number>;
}

const shapeCache = new Map<string, Shape>();

export function layoutText(set: GlyphSet, text: string, options: LayoutOptions): Slot[] {
  const k = options.size / set.em, tracking = (options.tracking ?? 0) * options.size;
  const chars = [...text];
  const missing = chars.filter(c => c.trim() && !set.glyphs[c]);
  if (missing.length) throw new Error("Glyphs not extracted: " + missing.join(" ") + " (run tools/glyphs.mjs with this text).");
  const scaleOf = (c: string) => options.fontScale?.[set.glyphs[c].font] ?? 1;
  const advance = (c: string) => c.trim() ? set.glyphs[c].advance * k * scaleOf(c) : set.space * k;
  const total = chars.reduce((s, c) => s + advance(c), 0) + tracking * Math.max(0, chars.length - 1);
  // Vertically centre on the first font's cap height so mixed lines share a baseline.
  const cap = Object.values(set.fonts)[0]?.capHeight ?? 700;
  const baseline = options.at[1] + cap * k / 2;
  let x = options.at[0] - total / 2;
  const slots: Slot[] = [];
  for (const ch of chars) {
    const w = advance(ch);
    if (ch.trim()) {
      const key = ch + "|" + set.glyphs[ch].font;
      if (!shapeCache.has(key)) shapeCache.set(key, fromPath(set.glyphs[ch].d));
      const s = k * scaleOf(ch), left = x;
      const shape = mapShape(shapeCache.get(key)!, ([gx, gy]) => [left + gx * s, baseline + gy * s]);
      const box = bounds(shape.pieces.map(p => p.outer));
      slots.push({ ch, shape, center: [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2], x, width: w, baseline });
    }
    x += w + tracking;
  }
  return slots;
}

/** A shape used as a single "glyph" slot (an icon in a line of text). */
export function iconSlot(shape: Shape, ch = "◆"): Slot {
  const box = bounds(shape.pieces.map(p => p.outer));
  const center: Vec2 = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2];
  return { ch, shape, center, x: box.min[0], width: box.max[0] - box.min[0], baseline: box.max[1] };
}

export type SlotKind = "keep" | "swap" | "vanish" | "born";

export interface SlotMorph {
  kind: SlotKind;
  from?: Slot;
  to?: Slot;
  morph: ShapeMorph;
  /** Stagger order, 0 = first to move (left to right on the target line). */
  order: number;
}

export interface WordMorphOptions extends MorphOptions {
  /** Keep letters that appear in both words (in order) as rigid slides. Default true. */
  keep?: boolean;
}

/**
 * Monotone slot alignment (edit distance). Same letter = keep (cheap), different letter = swap,
 * unmatched = vanish / born (expensive), plus a cost for how far a slot has to travel.
 * Swapping is preferred to "vanish one, birth another": the viewer should see letters turn
 * into letters, not appear from nothing.
 */
function align(a: readonly Slot[], b: readonly Slot[], keep: boolean, unit: number): Array<[number, number, SlotKind]> {
  const n = a.length, m = b.length;
  const KEEP = 0, SWAP = 1, GAP = 1.45, TRAVEL = 0.6;
  const cost = (i: number, j: number) => (keep && a[i].ch === b[j].ch ? KEEP : SWAP) + TRAVEL * Math.abs(a[i].center[0] - b[j].center[0]) / unit;
  const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const W = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
  for (let i = 1; i <= n; i++) { D[i][0] = i * GAP; W[i][0] = 1; }
  for (let j = 1; j <= m; j++) { D[0][j] = j * GAP; W[0][j] = 2; }
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const sub = D[i - 1][j - 1] + cost(i - 1, j - 1), del = D[i - 1][j] + GAP, ins = D[i][j - 1] + GAP;
    if (sub <= del && sub <= ins) { D[i][j] = sub; W[i][j] = 0; } else if (del <= ins) { D[i][j] = del; W[i][j] = 1; } else { D[i][j] = ins; W[i][j] = 2; }
  }
  const out: Array<[number, number, SlotKind]> = [];
  for (let i = n, j = m; i > 0 && j > 0;) {
    if (W[i][j] === 0) { out.push([i - 1, j - 1, keep && a[i - 1].ch === b[j - 1].ch ? "keep" : "swap"]); i--; j--; }
    else if (W[i][j] === 1) i--; else j--;
  }
  return out.reverse();
}

const EMPTY: Shape = { pieces: [] };

export function morphWords(a: readonly Slot[], b: readonly Slot[], options: WordMorphOptions = {}): SlotMorph[] {
  const widths = [...a, ...b].map(s => s.width);
  const unit = widths.length ? widths.reduce((x, y) => x + y, 0) / widths.length : 1;
  const pairs = align(a, b, options.keep !== false, unit);
  const usedA = new Set(pairs.map(p => p[0])), usedB = new Set(pairs.map(p => p[1]));
  const orderOf = (x: number) => {
    const xs = b.length ? b.map(s => s.center[0]) : a.map(s => s.center[0]);
    const lo = minOf(xs), hi = maxOf(xs);
    return hi > lo ? (x - lo) / (hi - lo) : 0;
  };
  const nearest = (p: Vec2, list: readonly Slot[], used: Set<number>) => {
    let best = Infinity, at = p;
    list.forEach((s, i) => { if (!used.has(i)) return; const d = Math.hypot(s.center[0] - p[0], s.center[1] - p[1]); if (d < best) { best = d; at = s.center; } });
    return at;
  };
  const out: SlotMorph[] = [];
  for (const [i, j, kind] of pairs) {
    const from = a[i], to = b[j];
    // A kept letter is the same outline: slide it rigidly. A swapped one morphs; its extra
    // pieces (the dot of an i, strokes of a hanzi) fly out of or into the partner.
    const morph = kind === "keep"
      ? morphShapes(from.shape, to.shape, { ...options, mode: "linear", rotate: 0, pins: undefined })
      : morphShapes(from.shape, to.shape, { vanish: "partner", ...options });
    out.push({ kind, from, to, morph, order: orderOf(to.center[0]) });
  }
  a.forEach((from, i) => {
    if (usedA.has(i)) return;
    const target = options.vanish === "self" ? from.center : nearest(from.center, b, usedB);
    out.push({ kind: "vanish", from, morph: morphShapes(from.shape, EMPTY, { vanish: target }), order: orderOf(target[0]) });
  });
  b.forEach((to, j) => {
    if (usedB.has(j)) return;
    const source = options.vanish === "self" ? to.center : nearest(to.center, a, usedA);
    out.push({ kind: "born", to, morph: morphShapes(EMPTY, to.shape, { vanish: source }), order: orderOf(to.center[0]) });
  });
  return out.sort((x, y) => x.order - y.order);
}

/**
 * Local progress of slot `order` (0..1) when the whole line runs from 0 to 1 and each slot
 * starts `stagger` (fraction of the line's time) after the previous one.
 */
export function staggered(t: number, order: number, stagger: number): number {
  const span = Math.max(1e-6, 1 - stagger);
  return Math.max(0, Math.min(1, (t - order * stagger) / span));
}

export function slotFrames(slots: readonly SlotMorph[], progress: (slot: SlotMorph) => number): Frame[] {
  return slots.map(s => s.morph.at(progress(s)));
}

export const mergeFrames = (frames: readonly Frame[]): Frame => ({ pieces: frames.flatMap(f => f.pieces) });
