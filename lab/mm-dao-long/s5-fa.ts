import type { Shape } from "../../packages/morph-engine/src/vector/shape";
import { CREAM, INK, clamp, deepestPoint, glyphAt, heavy, lerp, pathOf, rng, smooth, span, type V } from "./common";

/*
 * 第二十五章 (beats 147–180): 人法地，地法天，天法道，道法自然。
 *   A nested pull-back ("powers of ten"): 人 sits inside the thickest stroke of 地, 地 inside a stroke of 天, 天 inside
 *   道, 道 inside 自 of 自然 — each placed at its parent's deepest point (distance field), so it really lies within
 *   the ink. Colours alternate (cream on ink on cream…), so every pull-back turns the frame over. The camera zooms
 *   about the fixed point of each pair of views (no drift: the child stays exactly where it sits).
 *   Then the whole frame flips over tile by tile (diagonal wave, per-tile jitter) to a quiet last card: 道.
 */
interface Level { ch: string; at: V; size: number; color: string; unit: Shape }
const unit = (ch: string) => glyphAt(heavy, ch, [0, 0], 1000);
const LEVELS: Level[] = (() => {
  const zi = { ch: "自", at: [-165, 0] as V, size: 300, color: CREAM, unit: unit("自") };
  const ran = { ch: "然", at: [165, 0] as V, size: 300, color: CREAM, unit: unit("然") };
  const chain = ["道", "天", "地", "人"], out: Level[] = [ran, zi];
  let parent = zi;
  chain.forEach((ch, i) => {
    const shape = glyphAt(heavy, parent.ch, parent.at, parent.size), deep = deepestPoint(shape, true, 220, 0.35);
    const lvl = { ch, at: deep.at, size: 2 * deep.depth * 0.82 / 0.93, color: i % 2 === 0 ? INK : CREAM, unit: unit(ch) };
    out.push(lvl); parent = lvl;
  });
  return out;                                         // outermost first (drawing order)
})();
const ren = LEVELS[5], di = LEVELS[4], tian = LEVELS[3], dao = LEVELS[2];
const VIEWS: Array<{ c: V; z: number }> = [ren, di, tian, dao].map(l => ({ c: l.at, z: 300 / l.size })).concat([{ c: [0, 0], z: 1 }]);
const MOVES = [148.6, 152.6, 156.6, 160.6];           // each pull-back: 2.8 beats

function camera(b: number): { c: V; z: number } {
  let n = 0;
  while (n < MOVES.length && b >= MOVES[n] + 2.8) n++;
  if (n === MOVES.length) return { c: [0, 0], z: lerp(1, 0.93, smooth(span(b, 163.4, 168))) };
  const A = VIEWS[n], B = VIEWS[n + 1], u = smooth(span(b, MOVES[n], MOVES[n] + 2.8));
  if (u <= 0) return A;
  const z = Math.exp(lerp(Math.log(A.z), Math.log(B.z), u));
  const F: V = [(B.c[0] * B.z - A.c[0] * A.z) / (B.z - A.z), (B.c[1] * B.z - A.c[1] * A.z) / (B.z - A.z)];
  return { c: [F[0] - (F[0] - A.c[0]) * A.z / z, F[1] - (F[1] - A.c[1]) * A.z / z], z };
}

function drawWorld(ctx: CanvasRenderingContext2D, b: number) {
  ctx.fillStyle = INK; ctx.fillRect(-700, -400, 1400, 800);
  const cam = camera(b);
  for (const l of LEVELS) {
    const k = cam.z * l.size / 1000, x = (l.at[0] - cam.c[0]) * cam.z, y = (l.at[1] - cam.c[1]) * cam.z;
    if (k * 1000 < 0.4) continue;                       // smaller than a pixel
    const appear = l === ren ? smooth(span(b, 147, 148.2)) : 1;
    ctx.save(); ctx.translate(x, y); ctx.scale(k * (0.94 + 0.06 * appear), k * (0.94 + 0.06 * appear));
    ctx.globalAlpha = appear; ctx.fillStyle = l.color; ctx.fill(pathOf(l.unit), "evenodd"); ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ——— the tile flip ———
const FLIP = 168, TW = 64, TH = 60, COLS = 20, ROWS = 12;
const jitter = (() => { const r = rng(25); return Array.from({ length: COLS * ROWS }, () => r() * 0.4); })();
let faces: { front: OffscreenCanvas; back: OffscreenCanvas } | null = null;
const lastDao = glyphAt(heavy, "道", [0, -36], 132);
function makeFaces() {
  if (typeof OffscreenCanvas === "undefined") return null;
  const face = (paint: (c: CanvasRenderingContext2D) => void) => {
    const cv = new OffscreenCanvas(2560, 1440), c = cv.getContext("2d") as unknown as CanvasRenderingContext2D;
    c.setTransform(2, 0, 0, 2, 1280, 720); paint(c); return cv;
  };
  return {
    front: face(c => drawWorld(c, FLIP)),
    back: face(c => { c.fillStyle = CREAM; c.fillRect(-700, -400, 1400, 800); c.fillStyle = INK; c.fill(pathOf(lastDao), "evenodd"); }),
  };
}

export const prewarmS5 = () => { faces ??= makeFaces(); };
export function drawS5(ctx: CanvasRenderingContext2D, b: number) {
  if (b < FLIP) {
    drawWorld(ctx, b);
    // in from the dark the last chapter ended on
    const k = 1 - smooth(span(b, 147, 148.6));
    if (k > 0) { ctx.fillStyle = INK; ctx.globalAlpha = k; ctx.fillRect(-700, -400, 1400, 800); ctx.globalAlpha = 1; }
    return;
  }
  faces ??= makeFaces();
  if (!faces) { drawWorld(ctx, b); return; }
  ctx.fillStyle = INK; ctx.fillRect(-700, -400, 1400, 800);
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    const delay = (i + j) / (COLS + ROWS - 2) * 2.4 + jitter[j * COLS + i], phi = Math.PI * smooth(span(b, FLIP + delay, FLIP + delay + 0.9));
    const c = Math.cos(phi), face = c >= 0 ? faces.front : faces.back, x = -640 + i * TW, y = -360 + j * TH;
    if (Math.abs(c) < 0.01) continue;
    ctx.save(); ctx.translate(x + TW / 2, y + TH / 2); ctx.scale(Math.abs(c), 1);
    ctx.drawImage(face, (i * TW) * 2, (j * TH) * 2, TW * 2, TH * 2, -TW / 2, -TH / 2, TW, TH);
    ctx.restore();
  }
  ctx.globalAlpha = clamp(1);
}
