import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import { layoutText, type Slot } from "../../packages/morph-engine/src/vector/text";
import { drawWorld as drawSheng } from "../mm-dao/scene";
import { BEAT, CREAM, DROP, INK, caps, pathOf, smooth, span } from "./common";
import { drawS1, prewarm } from "./s1-name";
import { drawS2 } from "./s2-wu";
import { S4, drawS4, prewarmS4 } from "./s4-water";
import { drawS5, prewarmS5 } from "./s5-fa";

/*
 * MM77 — 道德经 选（第一、十一、四十二、八、二十五章）, ~98 s on the user's track. Each chapter is made of effects
 * its own words call for, and each hands on to the next through a thing, not a cut:
 *   第一章    weight morph · Voronoi shatter · dust wipe · double spiral · dust → 门 · push through the door
 *   第十一章  spokes lock into a hub · the wheel turns round a still hole · hole → vessel mouth · liquid clay ·
 *             dive into the mouth · door and windows carved, panels fall · light and lattice on the floor ·
 *             three emptinesses → one point
 *   第四十二章 (MM76) 一 → 二 → 三 → ☰ → 八卦 → 64-hexagram ring → taiji
 *   第八章    the ring rains down · the taiji's light melts into water · beat drops and rings · tilt down · 道
 *             rises from the water, reflection trembling
 *   第二十五章 人 in 地 in 天 in 道 in 自然 — nested pull-back · the frame flips over, tile by tile
 * Captions are the text itself (real glyphs), drawn with a difference blend so they read on dark and on light.
 */
export const BEATS = 180;
export const DURATION = DROP + BEATS * BEAT;
const S3 = 80;

const CAPTIONS: Array<[number, string]> = [
  [-2.5, "道可道，非常道。"], [5.5, "名可名，非常名。"], [12, "无名天地之始，有名万物之母。"], [18, "此两者同出而异名，同谓之玄。"], [23.5, "玄之又玄，众妙之门。"],
  [32, "三十辐共一毂，"], [38, "当其无，有车之用。"], [44, "埏埴以为器，"], [50, "当其无，有器之用。"], [56, "凿户牖以为室，"], [63, "当其无，有室之用。"], [70, "故有之以为利，无之以为用。"],
  [80, "道生一，"], [83.1, "一生二，"], [87.1, "二生三，"], [91.1, "三生万物。"], [103.1, "万物负阴而抱阳，"], [111.1, "冲气以为和。"],
  [S4, "上善若水。"], [127.5, "水善利万物而不争，"], [132, "处众人之所恶，"], [137, "故几于道。"],
  [147.5, "人法地，"], [151.5, "地法天，"], [155.5, "天法道，"], [159.5, "道法自然。"],
];
const ENDS: Record<number, number> = { 4: 31.4, 11: 79.2, 17: 122.6, 21: 146.2, 25: 175 };
const CHAPTERS: Array<[number, number, string]> = [[-3, 31.5, "第一章"], [32, 79.5, "第十一章"], [80, 122.8, "第四十二章"], [S4, 146.5, "第八章"], [147, 172.5, "第二十五章"]];
const CAP_Y = 322;
const capSlots: Slot[][] = CAPTIONS.map(([, s]) => layoutText(caps, s, { at: [0, CAP_Y], size: 25, tracking: 0.14 }));
const chapSlots: Slot[][] = CHAPTERS.map(([, , s]) => { const sl = layoutText(caps, s, { at: [0, 0], size: 15, tracking: 0.3 }); const dx = -590 - sl[0].x; return layoutText(caps, s, { at: [dx, -316], size: 15, tracking: 0.3 }); });
const credit = layoutText(caps, "《道德经》第一 · 十一 · 四十二 · 八 · 二十五章", { at: [0, CAP_Y], size: 16, tracking: 0.16 });

function drawText(ctx: CanvasRenderingContext2D, b: number) {
  ctx.save(); ctx.globalCompositeOperation = "difference"; ctx.fillStyle = CREAM;
  CAPTIONS.forEach(([at], i) => {
    const next = ENDS[i] ?? CAPTIONS[i + 1][0];
    const a = smooth(span(b, at, at + 0.7)) * (1 - smooth(span(b, next - 0.35, next + 0.15)));
    if (a <= 0.005) return;
    ctx.globalAlpha = a; ctx.save(); ctx.translate(0, (1 - smooth(span(b, at, at + 0.9))) * 10);
    for (const s of capSlots[i]) ctx.fill(pathOf(s.shape), "evenodd");
    ctx.restore();
  });
  CHAPTERS.forEach(([a0, a1], i) => {
    const a = smooth(span(b, a0, a0 + 1)) * (1 - smooth(span(b, a1 - 0.8, a1))) * 0.55;
    if (a <= 0.005) return;
    ctx.globalAlpha = a; for (const s of chapSlots[i]) ctx.fill(pathOf(s.shape), "evenodd");
  });
  const c = smooth(span(b, 172.5, 174)) * 0.7;
  if (c > 0.005) { ctx.globalAlpha = c; for (const s of credit) ctx.fill(pathOf(s.shape), "evenodd"); }
  ctx.restore();
}

export function drawDaoLong(ctx: CanvasRenderingContext2D, t: number) {
  const b = (t - DROP) / BEAT;
  ctx.save(); ctx.translate(640, 360);
  if (b < -3.6) { prewarm(); prewarmS4(); prewarmS5(); }   // all one-off builds on the dark first frames
  if (b < 32) drawS1(ctx, b);
  else if (b < S3) drawS2(ctx, b);
  else if (b < S4) {
    ctx.fillStyle = INK; ctx.fillRect(-700, -400, 1400, 800);
    ctx.save(); ctx.translate(0, -12); drawSheng(ctx, b - S3 + 0.9); ctx.restore();
  } else if (b < 147) drawS4(ctx, b);
  else drawS5(ctx, b);
  drawText(ctx, b);
  ctx.restore();
}

export const scene: MorphScene = {
  id: "mm-dao-long",
  title: "MM77 · 道德经五章（一、十一、四十二、八、二十五）：碎裂 · 尘 · 双螺旋 · 门 · 车毂 · 液态陶器 · 凿户牖 · 光影 · 卦象 · 太极融化成水 · 倒影 · 层层嵌套拉远 · 翻牌",
  duration: DURATION,
  draw: drawDaoLong,
};
