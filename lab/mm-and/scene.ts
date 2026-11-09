import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import { BEAT, DROP } from "./common";
import { PORTAL, drawLevelCards, drawPlay, drawPlayHud, prewarmPlay } from "./s1-play";
import { DEPTH_CARDS, drawDepth } from "./s3-depth";
import { FLIP, drawEnd, prewarmEnd } from "./s4-end";

export const BEATS = 96;
export const DURATION = DROP + BEATS * BEAT;

export function drawAnd(ctx: CanvasRenderingContext2D, t: number) {
  const b = (t - DROP) / BEAT;
  ctx.save(); ctx.translate(640, 360);
  if (b < -3.6) { prewarmPlay(); prewarmEnd(); }
  if (b < PORTAL.through) {
    const { cam, poses } = drawPlay(ctx, b, c => drawDepth(c, b));
    drawPlayHud(ctx, b, cam, poses);
  } else if (b < FLIP) drawDepth(ctx, b);
  else drawEnd(ctx, b);
  ctx.save(); ctx.globalCompositeOperation = "difference"; drawLevelCards(ctx, b, DEPTH_CARDS as never); ctx.restore();
  ctx.restore();
}

export const scene: MorphScene = { id: "mm-and", title: "MM78 · &", duration: DURATION, draw: drawAnd };
