import type { Shape } from "../../packages/morph-engine/src/vector/shape";
import type { Slot } from "../../packages/morph-engine/src/vector/text";
import type { Pose } from "../mm-and/player";
import {
  ACC, P1, P2, TAU, box, clamp, fillSlots, glyphFoot, heavy, lazyFieldMorph, lerp, mix, outBack, outQuad, ringsPath, shapeRings, smooth, span, uiText, type V,
} from "./common";

/*
 * The players are both 包 (a wrapped thing). A radical picked up docks on the left and the glyph BECOMES the word:
 * 包 + 氵 = 泡 (a bubble: floats, springy), 包 + 火 = 炮 (a cannon: launches the other), 包 + 饣 = 饱 (full: big and
 * heavy). Dropping the radical turns it back. The body change is a field morph between the real font glyphs; the
 * flying radical is the real radical glyph, fitted into the left slot of the composite, and fades as the morph lands.
 */
export const SIZE = 110;
const cache = new Map<string, Shape>();
export const G = (ch: string): Shape => { let s = cache.get(ch); if (!s) { s = glyphFoot(heavy, ch, [0, 0], SIZE); cache.set(ch, s); } return s; };
export const HEIGHT = -box(G("包")).y0;
export const COLORS = [P1, P2];
export const SCALE: Record<string, number> = { 饱: 1.45 };

export interface Change { b: number; to: string; dur?: number }
const morphs = new Map<string, (k: number) => V[][]>();
const morphOf = (a: string, b: string) => {
  const key = a + b; let m = morphs.get(key);
  if (!m) { m = lazyFieldMorph(() => G(a), () => G(b), [0, -HEIGHT / 2], 80, 220); morphs.set(key, m); }
  return m;
};
export const prewarmBodies = (lists: Change[][]) => { for (const l of lists) l.forEach((c, i) => { if (i) morphOf(l[i - 1].to, c.to)(0.5); }); };

/** The body's outline (local, feet at the origin) and its size factor at beat b. */
export function bodyAt(list: Change[], b: number): { rings: V[][]; scale: number; state: string; u: number } {
  let i = 0;
  while (i < list.length - 1 && b >= list[i + 1].b) i++;
  const c = list[i], prev = i ? list[i - 1].to : c.to, dur = c.dur ?? 0.4;
  const u = i ? smooth((b - c.b) / dur) : 1;
  const rings = u >= 1 ? shapeRings(G(c.to)) : morphOf(prev, c.to)(u);
  const scale = lerp(SCALE[prev] ?? 1, SCALE[c.to] ?? 1, outBack(clamp((b - c.b) / (dur * 1.4))));
  return { rings, scale, state: u > 0.5 ? c.to : prev, u };
}

/** Local body point → plane point, for a pose and a size factor (rotation about the body's middle). */
export function placer(p: Pose, scale: number) {
  const c = Math.cos(p.rot), s = Math.sin(p.rot), mid = HEIGHT * scale / 2;
  return ([x, y]: readonly [number, number]): V => {
    const lx = x * p.sx * scale, ly = y * p.sy * scale + mid;
    return [p.x + c * lx - s * ly, p.y - mid + s * lx + c * ly];
  };
}
export const placeRings = (rings: ReadonlyArray<ReadonlyArray<readonly [number, number]>>, f: (q: readonly [number, number]) => V) => rings.map(r => r.map(f));

// ——— radicals ———
const SLOT = { x0: -0.47 * SIZE, x1: -0.19 * SIZE, y0: -0.93 * SIZE, y1: -0.02 * SIZE };
const radCache = new Map<string, Shape>();
/** The radical glyph, local to a body: fitted into the composite's left slot. */
export function radical(ch: string): Shape {
  let s = radCache.get(ch);
  if (!s) {
    const raw = glyphFoot(heavy, ch, [0, 0], SIZE), b = box(raw);
    const k = Math.min((SLOT.x1 - SLOT.x0) / (b.x1 - b.x0), (SLOT.y1 - SLOT.y0) / (b.y1 - b.y0));
    const cx = (SLOT.x0 + SLOT.x1) / 2, cy = (SLOT.y0 + SLOT.y1) / 2, bx = (b.x0 + b.x1) / 2, by = (b.y0 + b.y1) / 2;
    s = { pieces: raw.pieces.map(p => ({ outer: p.outer.map(([x, y]) => [cx + (x - bx) * k, cy + (y - by) * k] as [number, number]), holes: p.holes.map(h => h.map(([x, y]) => [cx + (x - bx) * k, cy + (y - by) * k] as [number, number])) })) } as Shape;
    radCache.set(ch, s);
  }
  return s;
}
export const SLOT_C: V = [(SLOT.x0 + SLOT.x1) / 2, (SLOT.y0 + SLOT.y1) / 2];

export interface Rad { ch: string; who: 0 | 1; grab: number; drop?: number; fly?: V; hover: V; /** the radical becomes the whole body */ whole?: boolean; /** it comes down from above, starting at this beat */ from?: number }
/**
 * Draw a radical in plane coordinates: hovering (a pickup, bobbing on the beat), docking into the body's slot,
 * fading into the morph; later thrown off (spent) and fading. `at(b)` gives the owner's placer at beat b.
 */
export function drawRadical(ctx: CanvasRenderingContext2D, r: Rad, b: number, at: (b: number) => (q: readonly [number, number]) => V) {
  const shape = r.whole ? G(r.ch) : radical(r.ch), rings = shapeRings(shape), col = COLORS[r.who];
  const SC: V = r.whole ? [0, -HEIGHT / 2] : SLOT_C;
  const local = (dx: number, dy: number, rot: number, k: number) => (q: readonly [number, number]): V => {
    const x = (q[0] - SC[0]) * k, y = (q[1] - SC[1]) * k;
    return [dx + Math.cos(rot) * x - Math.sin(rot) * y, dy + Math.sin(rot) * x + Math.cos(rot) * y];
  };
  const fill = (pts: V[][], color: string, a: number) => { if (a <= 0.003) return; ctx.globalAlpha = a; ctx.fillStyle = color; ctx.fill(ringsPath(pts), "evenodd"); ctx.globalAlpha = 1; };
  if (r.from !== undefined && b < r.from) return;
  if (b < r.grab - 0.3) {
    const bob = 7 * Math.sin(b * Math.PI), pulse = 1 - (b % 1), down = r.from !== undefined ? 520 * (1 - outQuad(span(b, r.from, r.grab - 0.6))) : 0;
    const h: V = [r.hover[0], r.hover[1] + bob - down];
    // a ring that beats with the music marks it as a pickup
    ctx.strokeStyle = ACC; ctx.lineWidth = 3; ctx.globalAlpha = 0.25 + 0.5 * pulse * pulse;
    ctx.beginPath(); ctx.arc(h[0], h[1], 44 + 10 * (1 - pulse), 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    fill(placeRings(rings, local(h[0], h[1], 0.12 * Math.sin(b * 1.3), r.whole ? 0.8 : 1.15)), ACC, 1);
  } else if (b < r.grab + 0.45) {
    const u = smooth(span(b, r.grab - 0.3, r.grab)), pl = at(Math.min(b, r.grab + 0.45));
    const slot = pl(SC), bob = 7 * Math.sin((r.grab - 0.3) * Math.PI);
    const x = lerp(r.hover[0], slot[0], u), y = lerp(r.hover[1] + bob, slot[1], u);
    if (u < 1) fill(placeRings(rings, local(x, y, 0, lerp(r.whole ? 0.8 : 1.15, 1, u))), mix(ACC, col, u), 1);
    else fill(placeRings(rings, pl), col, 1 - smooth(span(b, r.grab + 0.12, r.grab + 0.45)));
  } else if (r.drop !== undefined && b >= r.drop && b < r.drop + 1.3) {
    const a = b - r.drop, pl = at(r.drop), s0 = pl(SC), v = r.fly ?? [-160, -420];
    const x = s0[0] + v[0] * a, y = s0[1] + v[1] * a + 0.5 * 900 * a * a;
    fill(placeRings(rings, local(x, y, -2.2 * a * Math.sign(v[0] || -1), 1 + 0.2 * a)), mix(col, ACC, smooth(a / 0.5)), 1 - smooth(span(a, 0.6, 1.3)));
  }
}

// ——— popups: the equation of each change, over the spot, rising and fading ———
export interface Pop { b: number; text: string; color: string; slots: Slot[] }
export const pop = (b: number, text: string, color: string): Pop => ({ b, text, color, slots: uiText(text, [0, 0], 30, 0.08) });
export function drawPops(ctx: CanvasRenderingContext2D, pops: Pop[], b: number, where: (p: Pop) => V | null, zoom = 1) {
  for (const p of pops) {
    const a = b - p.b; if (a < 0 || a > 2.4) continue;
    const at = where(p); if (!at) continue;
    const k = outBack(span(a, 0, 0.35)), alpha = 1 - smooth(span(a, 1.8, 2.4));
    const z = k * 0.95 / zoom; ctx.save(); ctx.translate(at[0], at[1] - 26 / zoom * outQuad(a / 2.4)); ctx.scale(z, z); fillSlots(ctx, p.slots, p.color, alpha); ctx.restore();
  }
}
