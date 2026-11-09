import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import { curve } from "../../packages/morph-engine/src/vector/camera-move";
import { framePath } from "../../packages/morph-engine/src/vector/render";
import { layoutText, type GlyphSet, type Slot } from "../../packages/morph-engine/src/vector/text";
import g500 from "./glyphs-500.json";
import g900 from "./glyphs-900.json";

/*
 * MM76 — 道德经 第四十二章: 道生一，一生二，二生三，三生万物。万物负阴而抱阳，冲气以为和。
 * Every step is the real glyph, and every glyph is made of the step before it:
 *   道 → a point → 一     the point draws out the bar of 一 (Noto's 一 is one rectangle)
 *   一 → 二 → 三          the bar splits; a third bar is born between (二 and 三 are rectangles too: exact)
 *   三 → ☰                三 IS the trigram 乾: its bars even out into three yang lines
 *   ☰ → 八卦 → 六十四卦    ☰ gives birth to the seven other trigrams (lines break into yin), ringed in the Fu Xi
 *                          order; each trigram spreads into eight hexagrams, a second trigram growing outward: 万物
 *   负阴抱阳               the 太极 grows in the middle of the ring
 *   冲气以为和             太极 and ring turn against each other; everything returns to a point, and 道 returns.
 * Two colours. One primitive: a line (a bar that can break into a yin pair) — glyph strokes, yao lines, all the same.
 */

export const INK = "#0c0c0b", CREAM = "#ece3cf";
export const BEAT = 0.5314, INTRO = 4;
const DROP = INTRO * BEAT;
export const BEATS = 52;
export const DURATION = DROP + BEATS * BEAT;

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const v = clamp(x); return v * v * (3 - 2 * v); };
const hit = (x: number) => { const v = clamp(x); return v * v * (2.2 - 1.2 * v); };
const span = (b: number, a0: number, a1: number) => clamp((b - a0) / (a1 - a0));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const TAU = Math.PI * 2;

// ——— the line: one primitive for glyph strokes and yao ———
/** A bar centred at (x, y), width w, height h, turned by `rot`; `yin` 0..1 opens a gap in the middle. */
export interface Line { x: number; y: number; w: number; h: number; rot: number; yin: number; alpha: number }
export function drawLine(ctx: CanvasRenderingContext2D, l: Line) {
  if (l.alpha <= 0.005 || l.w <= 0.01) return;
  ctx.save(); ctx.globalAlpha = l.alpha; ctx.translate(l.x, l.y); ctx.rotate(l.rot);
  const gap = l.yin * 0.26 * l.w;
  if (gap < 0.01) ctx.fillRect(-l.w / 2, -l.h / 2, l.w, l.h);
  else { const half = (l.w - gap) / 2; ctx.fillRect(-l.w / 2, -l.h / 2, half, l.h); ctx.fillRect(gap / 2, -l.h / 2, half, l.h); }
  ctx.restore();
}

// ——— the numbers, from the font (rectangles in font units), placed at 300 px ———
const GK = 0.3, GY = 370;
type R = [number, number, number, number];               // x0, x1, y0, y1 in font units
const bar = ([x0, x1, y0, y1]: R): Line => ({ x: ((x0 + x1) / 2 - 500) * GK, y: ((y0 + y1) / 2 + GY) * GK, w: (x1 - x0) * GK, h: (y1 - y0) * GK, rot: 0, yin: 0, alpha: 1 });
export const YI = bar([35, 967, -469, -310]);
const ER = [bar([136, 866, -720, -559]), bar([53, 949, -147, 21])];
const SAN = [bar([117, 883, -760, -611]), bar([189, 802, -441, -293]), bar([61, 935, -107, 42])];
const mixLine = (a: Line, b: Line, k: number): Line => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k), rot: lerp(a.rot, b.rot, k), yin: lerp(a.yin, b.yin, k), alpha: lerp(a.alpha, b.alpha, k) });

// ——— trigrams and the Fu Xi ring ———
/** Lines bottom → top (1 = yang, 0 = yin), counter-clockwise from the top: 乾 兑 离 震 坤 艮 坎 巽. */
const BAGUA: number[][] = [[1, 1, 1], [1, 1, 0], [1, 0, 1], [1, 0, 0], [0, 0, 0], [0, 0, 1], [0, 1, 0], [0, 1, 1]];
// ☰ as 三 evened out: lines 240 wide, 45 high, 95 apart, bottom line on 三's bottom bar.
const TRI = { w: 240, h: 45, pitch: 95 }, HEX = { w: 100, h: 19, pitch: 34 };
const R8 = 500, R64 = 1300;
/** A line of a trigram/hexagram standing on the ring at angle θ (bottom line nearest the centre). */
function ringLine(theta: number, rInner: number, idx: number, size: { w: number; h: number; pitch: number }, yin: number, alpha = 1, wScale = 1): Line {
  const d = rInner + idx * size.pitch + size.h / 2;
  return { x: Math.cos(theta) * d, y: Math.sin(theta) * d, w: size.w * wScale, h: size.h, rot: theta + Math.PI / 2, yin, alpha };
}
// ☰ in the middle (as 三 sits): θ = −π/2 and an inner radius that puts its bottom line on 三's bottom bar.
const TRI_R0 = -(SAN[2].y) - TRI.h / 2;
const theta8 = (j: number) => -Math.PI / 2 - j * TAU / 8;
const theta64 = (m: number) => -Math.PI / 2 - (m - 3.5) * TAU / 64;

// ——— glyphs and captions ———
const heavy = g900 as GlyphSet, caps = g500 as GlyphSet;
const dao = layoutText(heavy, "道", { at: [0, 0], size: 300 })[0];
const CAPTIONS: Array<[number, string]> = [[-2, "道生一，"], [4, "一生二，"], [8, "二生三，"], [12, "三生万物。"], [24, "万物负阴而抱阳，"], [32, "冲气以为和。"]];
const CAP_Y = 322;
const capSlots: Slot[][] = CAPTIONS.map(([, s]) => layoutText(caps, s, { at: [0, CAP_Y], size: 26, tracking: 0.14 }));
const credit = layoutText(caps, "《道德经》第四十二章", { at: [0, CAP_Y], size: 18, tracking: 0.16 });

// ——— timeline (beats since the drop) and camera ———
export const T = {
  daoIn: [-4, -0.6], daoOut: [0, 1], yi: [0.9, 2], er: [5, 6.4], san: [9, 10.4], even: [12.4, 13.6],
  bagua: [13.6, 18], spread: [18, 22.5], upper: [19.5, 23.5], taiji: [24.5, 29], collapse: [44, 46.5], daoBack: [46, 49], credit: [48, 49.5],
};
export const zoom = curve([{ t: -4, v: 0.94 }, { t: 0, v: 1 }, { t: 12, v: 1.06, d: 0 }, { t: 13.6, v: 1.02, d: 0 }, { t: 15.6, v: 0.34 }, { t: 18, v: 0.31 }, { t: 23.5, v: 0.205 }, { t: 29, v: 0.2, d: -0.001 }, { t: 44, v: 0.19, d: 0 }]);
/** The ring turns slowly once it has formed; the taiji turns the other way, faster through 冲气以为和. */
const ringTurn = curve([{ t: 20, v: 0, d: 0 }, { t: 32, v: 0.18 }, { t: 40, v: 0.62 }, { t: 46.5, v: 0.85, d: 0.03 }]);
export const taijiTurn = curve([{ t: 24.5, v: 0, d: 0 }, { t: 32, v: -0.6 }, { t: 40, v: -TAU - 0.3 }, { t: 46.5, v: -TAU - 1.2, d: -0.12 }]);

/** Every line on screen at beat b (world coordinates, centre of the ring at 0, 0). */
export function lines(b: number): Line[] {
  if (b < T.yi[0]) return [];
  if (b < T.er[0]) {                                      // the point draws out 一
    const k = hit(span(b, T.yi[0], T.yi[1]));
    return [{ ...YI, w: lerp(4, YI.w, k), h: lerp(4, YI.h, Math.min(1, k * 1.6)) }];
  }
  if (b < T.san[0]) {                                     // 一 splits into 二
    const k = hit(span(b, T.er[0], T.er[1]));
    return ER.map(e => mixLine(YI, e, k));
  }
  if (b < T.even[0]) {                                    // a bar is born between: 三
    const k = hit(span(b, T.san[0], T.san[1])), mid = SAN[1];
    return [mixLine(ER[0], SAN[0], k), { ...mid, w: mid.w * k, h: mid.h * Math.min(1, 0.2 + k), alpha: Math.min(1, k * 2) }, mixLine(ER[1], SAN[2], k)];
  }
  const out: Line[] = [];
  if (b < T.bagua[0]) {                                   // 三 evens out into ☰
    const k = smooth(span(b, T.even[0], T.even[1]));
    [2, 1, 0].forEach((s, idx) => out.push(mixLine(SAN[s], ringLine(-Math.PI / 2, TRI_R0, idx, TRI, 0), k)));
    return out;
  }
  const turn = ringTurn(b);
  for (let j = 0; j < 8; j++) {
    // ☰ rises from the middle to the top of the ring; then the other seven are born out of it and fan out along
    // the ring to their places (counter-clockwise, Fu Xi order), their lines breaking into yin as they go.
    const k0 = smooth(span(b, T.bagua[0], T.bagua[0] + 2)), born = T.bagua[0] + 1.6 + j * 0.2;
    const k = j === 0 ? 1 : hit(span(b, born, born + 2.2));
    if (j > 0 && b < born) continue;
    const r = j === 0 ? lerp(TRI_R0, R8, k0) : R8, th = lerp(-Math.PI / 2, theta8(j), k);
    for (let u = 0; u < 8; u++) {
      // spread: eight copies of the trigram slide apart along the ring; each grows a second trigram outward
      const ks = smooth(span(b, T.spread[0] + u * 0.05, T.spread[1] + u * 0.05)), m = j * 8 + u;
      if (u > 0 && b < T.spread[0]) break;
      const theta = lerp(th, theta64(m), ks) + turn, rIn = lerp(r, R64, ks), size = { w: lerp(TRI.w, HEX.w, ks), h: lerp(TRI.h, HEX.h, ks), pitch: lerp(TRI.pitch, HEX.pitch, ks) };
      for (let idx = 0; idx < 3; idx++) out.push(ringLine(theta, rIn, idx, size, (1 - BAGUA[j][idx]) * (j === 0 ? 0 : clamp(k * 1.4 - 0.2)), u === 0 ? (j === 0 ? 1 : Math.min(1, k * 4)) : Math.min(1, ks * 3)));
      const ku = smooth(span(b, T.upper[0] + u * 0.08 + j * 0.03, T.upper[1] + u * 0.08 + j * 0.03));
      if (ku > 0) for (let idx = 0; idx < 3; idx++) out.push(ringLine(theta, rIn, idx + 3, size, (1 - BAGUA[u][idx]) * ku, ku, ku));
    }
  }
  return out;
}

export function drawTaiji(ctx: CanvasRenderingContext2D, R: number, rot: number, z: number) {
  if (R < 0.5) return;
  ctx.save(); ctx.rotate(rot);
  ctx.fillStyle = CREAM;
  ctx.beginPath();
  ctx.arc(0, 0, R, -Math.PI / 2, Math.PI / 2, false);      // the right half…
  ctx.arc(0, R / 2, R / 2, Math.PI / 2, -Math.PI / 2, false);  // …its head bulging at the bottom
  ctx.arc(0, -R / 2, R / 2, Math.PI / 2, -Math.PI / 2, true);  // …and the dark head cut in at the top
  ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -R / 2, R / 7, 0, TAU); ctx.fill();               // light in the dark
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, R / 2, R / 7, 0, TAU); ctx.fill();  // dark in the light
  ctx.strokeStyle = CREAM; ctx.lineWidth = 2.2 / z; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
  ctx.restore();
}

function drawCaptions(ctx: CanvasRenderingContext2D, b: number) {
  ctx.fillStyle = CREAM;
  CAPTIONS.forEach(([at], i) => {
    const next = CAPTIONS[i + 1]?.[0] ?? T.collapse[0];
    const a = smooth(span(b, at, at + 0.7)) * (1 - smooth(span(b, next - 0.35, next + 0.15)));
    if (a <= 0.005) return;
    const rise = (1 - smooth(span(b, at, at + 0.9))) * 10;
    ctx.globalAlpha = a; ctx.save(); ctx.translate(0, rise);
    for (const s of capSlots[i]) ctx.fill(framePath(s.shape), "evenodd");
    ctx.restore();
  });
  const c = smooth(span(b, T.credit[0], T.credit[1]));
  if (c > 0.005) { ctx.globalAlpha = c * 0.6; for (const s of credit) ctx.fill(framePath(s.shape), "evenodd"); }
  ctx.globalAlpha = 1;
}

/** The world of 道生一 … 冲气以为和 (lines and taiji) at MM76's own beat `b`, scaled by `extra` (for reuse). */
export function drawWorld(ctx: CanvasRenderingContext2D, b: number, extra = 1) {
  const z = zoom(b) * extra;
  ctx.save(); ctx.scale(z, z);
  drawTaiji(ctx, 1060 * smooth(span(b, T.taiji[0], T.taiji[1])), taijiTurn(b), z);
  ctx.fillStyle = CREAM;
  for (const l of lines(b)) drawLine(ctx, l);
  ctx.restore();
}

export function drawDao(ctx: CanvasRenderingContext2D, t: number) {
  const b = (t - DROP) / BEAT;
  ctx.save();
  ctx.fillStyle = INK; ctx.fillRect(0, 0, 1280, 720);
  ctx.translate(640, 348);
  // 道 — at the start, and again at the end
  const daoA = smooth(span(b, T.daoIn[0], T.daoIn[1])) * (1 - 0 * b), dIn = smooth(span(b, T.daoBack[0], T.daoBack[1]));
  const daoS = b < T.collapse[0] ? 1 - hit(span(b, T.daoOut[0], T.daoOut[1])) : lerp(0.82, 1, dIn);
  const daoAlpha = b < T.collapse[0] ? daoA : dIn;
  if (daoS > 0.01 && daoAlpha > 0.005) {
    const z = b < T.collapse[0] ? zoom(b) : 1;
    ctx.save(); ctx.globalAlpha = daoAlpha; ctx.scale(z * daoS, z * daoS); ctx.translate(-dao.center[0], -dao.center[1]);
    ctx.fillStyle = CREAM; ctx.fill(framePath(dao.shape), "evenodd"); ctx.restore();
  }
  // the point between 道 and 一 (and at the end, everything returning into it)
  const pt = Math.max(span(b, T.daoOut[0] + 0.5, T.daoOut[1]) * (1 - span(b, T.yi[0], T.yi[0] + 0.4)),
    span(b, T.collapse[1] - 0.8, T.collapse[1]) * (1 - span(b, T.collapse[1], T.daoBack[0] + 1.2)));
  if (pt > 0.01) { ctx.save(); ctx.fillStyle = CREAM; ctx.shadowColor = CREAM; ctx.shadowBlur = 18; ctx.globalAlpha = pt; ctx.beginPath(); ctx.arc(0, b < 20 ? YI.y : 0, 4.5, 0, TAU); ctx.fill(); ctx.restore(); }
  // the world: lines and the taiji, all returning to the point at the end
  const back = 1 - hit(span(b, T.collapse[0], T.collapse[1]));
  if (back > 0.002) {
    const z = zoom(b) * back;
    ctx.save(); ctx.scale(z, z);
    const R = 1060 * smooth(span(b, T.taiji[0], T.taiji[1]));
    drawTaiji(ctx, R, taijiTurn(b), z);
    ctx.fillStyle = CREAM;
    for (const l of lines(b)) drawLine(ctx, l);
    ctx.restore();
  }
  drawCaptions(ctx, b);
  ctx.restore();
}

export const scene: MorphScene = {
  id: "mm-dao",
  title: "MM76 · 道德经四十二章：道 → 一 → 二 → 三（真字，即卦爻）→ 八卦 → 六十四卦圆图 → 太极 → 归于道",
  duration: DURATION,
  draw: drawDao,
};
