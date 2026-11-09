import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import { curve } from "../../packages/morph-engine/src/vector/camera-move";
import { framePath } from "../../packages/morph-engine/src/vector/render";
import { fieldMorph, rasterInside } from "../../packages/morph-engine/src/vector/sdf-field";
import { circle, fromPath, mapShape, type Shape } from "../../packages/morph-engine/src/vector/shape";
import { layoutText, type GlyphSet, type Slot } from "../../packages/morph-engine/src/vector/text";
import g500 from "./glyphs-500.json";
import g100 from "./glyphs-100.json";
import g900 from "./glyphs-900.json";
import gLatin from "./glyphs-latin.json";

/*
 * MM75 — 创世记 1:1–5 (和合本, 1919, public domain), cut to the user's track. Every picture is a real glyph or comes
 * out of one:
 *   水   the deep: a faint 水 above a still water line; the spirit (a point of light) moves over the face of the
 *        water, a ripple on every beat, and the glyph's reflection trembles as the rings pass; then 水 sinks.
 *   光   "神说：要有光" — the point blooms into a hairline 光, which gains weight (100 → 900), and then its strokes
 *        become rays: 光 already radiates from the crossing of its 横 (up, the two dots, both arms, both legs), so the
 *        glyph field-morphs into a burst of light along its own strokes. The burst floods the frame.
 *   分开 dark rises from below and halves the world: 昼 on the light, 夜 on the dark.
 *   晚上 / 早晨  the divide turns a full circle: evening (dark above), morning (light above again).
 *   头一日  the darkness folds into a bar — the 一 of 头一日 (Noto's 一 is a plain rectangle, so the fold lands on the
 *        real glyph exactly).
 * Two colours (ink, cream); captions are the verse itself in real glyphs, coloured by what lies under each character.
 */

export const INK = "#0d0c0b", CREAM = "#efe6d2";
export const BEAT = 0.5314, INTRO = 4;
const DROP = INTRO * BEAT;
export const BEATS = 52;
export const DURATION = DROP + BEATS * BEAT;

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const v = clamp(x); return v * v * (3 - 2 * v); };
const hit = (x: number) => { const v = clamp(x); return v * v * (2.2 - 1.2 * v); };
const span = (b: number, a0: number, a1: number) => clamp((b - a0) / (a1 - a0));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
type V = [number, number];

// ——— glyphs ———
const caps: GlyphSet = { ...(g500 as GlyphSet), fonts: { ...(g500 as GlyphSet).fonts, ...(gLatin as GlyphSet).fonts }, glyphs: { ...(g500 as GlyphSet).glyphs, ...(gLatin as GlyphSet).glyphs } };
const heavy = g900 as GlyphSet;
/** A glyph in font units (1000 em, y down, baseline 0) placed by a map. */
const glyph = (set: GlyphSet, ch: string, map: (p: V) => V): Shape => mapShape(fromPath(set.glyphs[ch].d), p => map(p as V));

// 光 sits with the crossing of its 横 (font units 496, −428) on the light's centre.
const LIGHT: V = [0, -30], GS = 320 / 1000;
const atLight = ([x, y]: V): V => [LIGHT[0] + (x - 496) * GS, LIGHT[1] + (y + 428) * GS];
const guangThin = glyph(g100 as GlyphSet, "光", atLight), guang = glyph(heavy, "光", atLight);

/** The burst: a core on the crossing and one ray along each stroke of 光, pointing where the stroke points. */
const RAYS: Array<[number, number, number]> = [          // direction (font units, from the crossing) and length
  [0, -1, 640], [-1, 0, 600], [1, 0, 600],                // 丨 up, 横 left and right
  [-266, -242, 620], [334, -242, 620],                    // the two dots
  [-436, 458, 660], [130, 488, 640], [404, 300, 560],     // 丿 down-left, 乚 down and its hook
];
function burstRings(): V[][] {
  const out: V[][] = [circle([496, -428], 165, 72) as V[]];
  for (const [dx, dy, len] of RAYS) {
    const l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l, w = 70;
    out.push([[496 - uy * w, -428 + ux * w], [496 + ux * len, -428 + uy * len], [496 + uy * w, -428 - ux * w]]);
  }
  return out.map(r => r.map(atLight));
}
const BURST = burstRings();

// 水: faint, above the still water.
const WATER_Y = 40;
const SHUI_C: V = [0, -150], SS = 250 / 1000;
const shui = glyph(heavy, "水", ([x, y]) => [SHUI_C[0] + (x - 500) * SS, SHUI_C[1] + (y + 380) * SS]);

// 昼 on the light, 夜 on the dark.
const zhou = layoutText(heavy, "昼", { at: [0, -175], size: 170 })[0], ye = layoutText(heavy, "夜", { at: [0, 185], size: 170 })[0];

// 一: the darkness folds onto it. Its outline is a rectangle (font units 35..967 × −469..−310), centred on the divide.
const YS = 360 / 1000;
const YI = { x0: (35 - 501) * YS, x1: (967 - 501) * YS, y0: (-469 + 389.5) * YS, y1: (-310 + 389.5) * YS };

// ——— captions: the verse, phrase by phrase (beat of entry) ———
const CAPTIONS: Array<[number, string]> = [
  [-3.5, "起初，神创造天地。"], [2, "地是空虚混沌，渊面黑暗；"], [7, "神的灵运行在水面上。"],
  [15, "神说：“要有光”，"], [21, "就有了光。"], [25, "神看光是好的，"], [28, "就把光暗分开了。"],
  [32, "神称光为“昼”，称暗为“夜”。"], [39.5, "有晚上，"], [42.5, "有早晨，"], [46, "这是头一日。"],
];
const CAP_Y = 300;
const capSlots: Slot[][] = CAPTIONS.map(([, s]) => layoutText(caps, s, { at: [0, CAP_Y], size: 26, tracking: 0.1 }));
const credit = layoutText(caps, "创世记 1:1–5 · 和合本", { at: [0, 340], size: 15, tracking: 0.12 });

// ——— field morphs (built lazily, frames cached on a 1/240 grid) ———
function paintRings(ctx: CanvasRenderingContext2D, rings: ReadonlyArray<ReadonlyArray<readonly [number, number]>>, rule: CanvasFillRule) {
  const p = new Path2D(); for (const r of rings) { p.moveTo(r[0][0], r[0][1]); for (const q of r) p.lineTo(q[0], q[1]); p.closePath(); } ctx.fill(p, rule);
}
function inRing(r: ReadonlyArray<readonly [number, number]>, x: number, y: number) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const shapeRings = (s: Shape) => s.pieces.flatMap(p => [p.outer, ...p.holes]);
const insideShape = (s: Shape) => (q: readonly [number, number]) => s.pieces.some(p => inRing(p.outer, q[0], q[1]) && !p.holes.some(h => inRing(h, q[0], q[1])));
const HALF = 260, GRID = 400;
const rasterShape = (s: Shape) => rasterInside(LIGHT, HALF, GRID, ctx => paintRings(ctx, shapeRings(s), "evenodd")) ?? insideShape(s);
type Morph = { at(k: number): V[][] };
function lazyMorph(make: () => Morph) {
  let m: Morph | null = null; const cache = new Map<number, V[][]>();
  return (k: number) => { m ??= make(); const q = Math.round(k * 240); if (!cache.has(q)) cache.set(q, m.at(q / 240)); return cache.get(q)!; };
}
const weightMorph = lazyMorph(() => fieldMorph(LIGHT, HALF, GRID, rasterShape(guangThin), rasterShape(guang)) as unknown as Morph);
const burstMorph = lazyMorph(() => fieldMorph(LIGHT, HALF, GRID, rasterShape(guang),
  rasterInside(LIGHT, HALF, GRID, ctx => BURST.forEach(r => paintRings(ctx, [r], "nonzero"))) ?? (q => BURST.some(r => inRing(r, q[0], q[1]))), 0.3) as unknown as Morph);
const fillRings = (ctx: CanvasRenderingContext2D, rings: V[][], color: string, rule: CanvasFillRule = "evenodd") => { ctx.fillStyle = color; paintRings(ctx, rings, rule); };

// ——— the timeline, in beats since the drop ———
const T = {
  shui: [-2.5, 1.5], line: [-0.5, 2], spirit: [7, 13], rise: [13, 15], sink: [12, 15.5],
  bloom: [16, 17], weight: [17, 19], burst: [19.25, 21], flood: [21.5, 24],
  split: [28, 30.5], words: [32, 33.5], wordsOut: [38, 39.5], turn: [39.5, 45.5], fold: [46, 48.5], credit: [48.5, 50],
};
/** Spirit: enters from the left over the water and glides to the middle, then rises to where the light will be. */
const spiritX = curve([{ t: 6, v: -760 }, { t: T.spirit[1], v: 0, d: 0 }]);
const spiritAt = (b: number): V => {
  const x = spiritX(b), up = smooth(span(b, T.rise[0], T.rise[1]));
  return [x, lerp(WATER_Y - 16, LIGHT[1], up)];
};
/** A slow push all through the dark, a little faster as the light is spoken; released once the light has flooded. */
const zoom = curve([{ t: -4, v: 1 }, { t: 13, v: 1.05 }, { t: 21.3, v: 1.14, d: 0.01 }, { t: 24.2, v: 1, d: 0 }]);
/** The divide's angle: evening (dark above) at π, morning (light above) at 2π — one continuous turn. */
const turn = curve([{ t: T.turn[0], v: 0, d: 0 }, { t: 42.5, v: Math.PI, d: 1.25 }, { t: T.turn[1], v: 2 * Math.PI, d: 0 }]);

/** Where is it dark? (what the captions read against) */
function darkAt(b: number, [x, y]: readonly [number, number]): boolean {
  if (b < T.flood[0]) return true;
  if (b < T.flood[1]) return Math.hypot(x - LIGHT[0], y - LIGHT[1]) > floodScale(b) * 165 * GS;
  if (b < T.split[0]) return false;
  if (b < T.fold[0]) {
    const a = turn(b), d = splitEdge(b);
    return -Math.sin(a) * x + Math.cos(a) * y > d;
  }
  const r = foldRect(b);
  return x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1;
}
const floodScale = (b: number) => lerp(1, 19, hit(span(b, T.flood[0], T.flood[1])));
const splitEdge = (b: number) => lerp(420, 0, hit(span(b, T.split[0], T.split[1])));
function foldRect(b: number) {
  const k = smooth(span(b, T.fold[0], T.fold[1]));
  return { x0: lerp(-720, YI.x0, k), x1: lerp(720, YI.x1, k), y0: lerp(0, YI.y0, k), y1: lerp(440, YI.y1, k) };
}

// ——— drawing ———
let shuiPath: Path2D | null = null;
function drawWater(ctx: CanvasRenderingContext2D, b: number) {
  shuiPath ??= framePath(shui);
  const a = 0.3 * smooth(span(b, T.shui[0], T.shui[1])), sink = 320 * smooth(span(b, T.sink[0], T.sink[1]));
  const fade = 1 - smooth(span(b, T.sink[1] - 1.2, T.sink[1]));
  // the water line, drawn out from the middle
  const w = 700 * smooth(span(b, T.line[0], T.line[1]));
  ctx.strokeStyle = CREAM; ctx.globalAlpha = 0.28 * fade; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-w, WATER_Y); ctx.lineTo(w, WATER_Y); ctx.stroke();
  // 水 above the water (clipped: it sinks below the surface)
  if (a > 0.005 && fade > 0.005) {
    ctx.save(); ctx.beginPath(); ctx.rect(-700, -500, 1400, 500 + WATER_Y); ctx.clip();
    ctx.globalAlpha = a * fade; ctx.fillStyle = CREAM; ctx.translate(0, sink); ctx.fill(shuiPath, "evenodd");
    ctx.restore();
    // its reflection, in strips that the ripples displace; fainter with depth
    const rip = ripples(b);
    for (let d = 0; d < 280; d += 5) {
      let off = 0;
      for (const r of rip) if (Math.abs(r.x) - r.rx < 150) off += 7 * Math.exp(-r.age * 0.7) * Math.sin(d / 7 - r.age * 5.5) * clamp(r.age * 3);
      ctx.save(); ctx.beginPath(); ctx.rect(-700, WATER_Y + d, 1400, 5.4); ctx.clip();
      ctx.globalAlpha = a * fade * 0.85 * (1 - d / 280);
      ctx.translate(off, 2 * WATER_Y - sink); ctx.scale(1, -1); ctx.fill(shuiPath, "evenodd");
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}
/** One ripple on every beat while the spirit moves over the water. */
function ripples(b: number) {
  const out: Array<{ x: number; age: number; rx: number }> = [];
  for (let k = T.spirit[0]; k <= T.spirit[1]; k++) {
    const age = b - k;
    if (age < 0 || age > 4) continue;
    out.push({ x: spiritX(k), age, rx: 130 * age });
  }
  return out;
}
function drawRipples(ctx: CanvasRenderingContext2D, b: number) {
  const fade = 1 - smooth(span(b, T.sink[1] - 1.2, T.sink[1]));
  ctx.strokeStyle = CREAM; ctx.lineWidth = 1.3;
  for (const r of ripples(b)) {
    ctx.globalAlpha = 0.4 * (1 - r.age / 4) * fade;
    ctx.beginPath(); ctx.ellipse(r.x, WATER_Y, Math.max(0.1, r.rx), Math.max(0.1, r.rx * 0.14), 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function drawSpirit(ctx: CanvasRenderingContext2D, b: number) {
  if (b < 6 || b >= T.bloom[0] + 0.3) return;
  const [x, y] = spiritAt(b), a = 1 - smooth(span(b, T.bloom[0], T.bloom[0] + 0.3));
  ctx.save(); ctx.fillStyle = CREAM; ctx.shadowColor = CREAM; ctx.shadowBlur = 22;
  ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
  if (b < T.rise[1]) {                                   // its reflection, while it is near the water
    ctx.globalAlpha = a * 0.3 * (1 - smooth(span(b, T.rise[0], T.rise[0] + 1)));
    ctx.beginPath(); ctx.arc(x, 2 * WATER_Y - y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function drawLight(ctx: CanvasRenderingContext2D, b: number) {
  if (b < T.bloom[0] || b >= T.flood[1]) return;
  if (b < T.weight[0]) {                                  // the point blooms into a hairline 光
    const s = lerp(0.03, 1, hit(span(b, T.bloom[0], T.bloom[1])));
    ctx.save(); ctx.translate(LIGHT[0], LIGHT[1]); ctx.scale(s, s); ctx.translate(-LIGHT[0], -LIGHT[1]);
    ctx.fillStyle = CREAM; ctx.fill(framePath(guangThin), "evenodd"); ctx.restore();
  } else if (b < T.burst[0]) {                            // the word gains weight
    const k = hit(span(b, T.weight[0], T.weight[1]));
    if (k >= 1) { ctx.fillStyle = CREAM; ctx.fill(framePath(guang), "evenodd"); } else fillRings(ctx, weightMorph(k), CREAM);
  } else if (b < T.burst[1]) {                            // its strokes become rays
    fillRings(ctx, burstMorph(smooth(span(b, T.burst[0], T.burst[1]))), CREAM);
  } else {                                                // the burst floods the frame
    const s = floodScale(b);
    ctx.save(); ctx.translate(LIGHT[0], LIGHT[1]); ctx.scale(s, s); ctx.translate(-LIGHT[0], -LIGHT[1]);
    ctx.fillStyle = CREAM; BURST.forEach(r => paintRings(ctx, [r], "nonzero")); ctx.restore();
  }
}
function drawDay(ctx: CanvasRenderingContext2D, b: number) {
  ctx.fillStyle = CREAM; ctx.fillRect(-800, -500, 1600, 1000);
  if (b < T.split[0]) return;
  ctx.fillStyle = INK;
  if (b < T.fold[0]) {
    ctx.save(); ctx.rotate(turn(b)); ctx.fillRect(-1000, splitEdge(b), 2000, 1200); ctx.restore();
  } else {
    const r = foldRect(b);
    if (r.x1 - r.x0 < YI.x1 - YI.x0 + 0.5 && r.y1 - r.y0 < YI.y1 - YI.y0 + 0.5) {   // landed: the real glyph
      ctx.fill(framePath(glyph(heavy, "一", ([x, y]) => [(x - 501) * YS, (y + 389.5) * YS])), "evenodd");
    } else ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
  }
  // 昼 on the light, 夜 on the dark (they ride the divide until it turns)
  const k = smooth(span(b, T.words[0], T.words[1])) * (1 - smooth(span(b, T.wordsOut[0], T.wordsOut[1])));
  if (k > 0.005) for (const [s, color] of [[zhou, INK], [ye, CREAM]] as const) {
    const sc = 0.86 + 0.14 * k;
    ctx.save(); ctx.globalAlpha = k; ctx.translate(s.center[0], s.center[1]); ctx.scale(sc, sc); ctx.translate(-s.center[0], -s.center[1]);
    ctx.fillStyle = color; ctx.fill(framePath(s.shape), "evenodd"); ctx.restore();
  }
}
function drawCaptions(ctx: CanvasRenderingContext2D, b: number) {
  CAPTIONS.forEach(([at], i) => {
    const next = CAPTIONS[i + 1]?.[0] ?? 1e9;
    const a = smooth(span(b, at, at + 0.7)) * (1 - smooth(span(b, next - 0.35, next + 0.15)));
    if (a <= 0.005) return;
    const rise = (1 - smooth(span(b, at, at + 0.9))) * 10;
    for (const s of capSlots[i]) {
      ctx.globalAlpha = a; ctx.fillStyle = darkAt(b, s.center) ? CREAM : INK;
      ctx.save(); ctx.translate(0, rise); ctx.fill(framePath(s.shape), "evenodd"); ctx.restore();
    }
  });
  const c = smooth(span(b, T.credit[0], T.credit[1]));
  if (c > 0.005) for (const s of credit) { ctx.globalAlpha = c * 0.6; ctx.fillStyle = darkAt(b, s.center) ? CREAM : INK; ctx.fill(framePath(s.shape), "evenodd"); }
  ctx.globalAlpha = 1;
}

export function drawGenesis(ctx: CanvasRenderingContext2D, t: number) {
  const b = (t - DROP) / BEAT;
  ctx.save();
  ctx.translate(640, 360);
  if (b < T.flood[1]) {
    ctx.fillStyle = INK; ctx.fillRect(-800, -500, 1600, 1000);
    // build the light's morphs while the screen is still dark and nothing depends on them
    if (b < -3.6) { weightMorph(0); burstMorph(0); }
    const z = zoom(b);
    ctx.save(); ctx.translate(LIGHT[0], LIGHT[1]); ctx.scale(z, z); ctx.translate(-LIGHT[0], -LIGHT[1]);
    drawWater(ctx, b); drawRipples(ctx, b); drawSpirit(ctx, b); drawLight(ctx, b);
    ctx.restore();
  } else drawDay(ctx, b);
  drawCaptions(ctx, b);
  ctx.restore();
}

export const scene: MorphScene = {
  id: "mm-genesis",
  title: "MM75 · 创世记 1:1–5：水面上的灵 → 光（字的笔画即光芒）→ 光暗分开 → 晚上早晨 → 黑暗折成「头一日」的一",
  duration: DURATION,
  draw: drawGenesis,
};
