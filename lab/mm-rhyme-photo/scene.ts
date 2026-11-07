import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import { fitArt, loadArt, tone } from "../../packages/morph-engine/src/vector/bitmap-render";
import { matchCutArtScene } from "../../packages/morph-engine/src/vector/match-cut";
import umbrellaPng from "../../fixtures/s2/umbrella.png?inline";
import octopusPng from "../../fixtures/s2/octopus.png?inline";

/*
 * MM97 — shape-rhyme match cut, pictures: the umbrella's hooked handle ↔ a curled octopus tentacle tip.
 * Both pictures are flattened onto opaque backgrounds, i.e. treated as PHOTOS: no pixel is warped.
 *   tools/rhyme.ts "umbrella.png@hook=486,522,568,618" "octopus.png@curl_bl=405,525,500,612@…"
 *   → hook ↔ curl_bl  score 0.91, pixel overlap 0.78, B → A: scale 0.886, −22.3°.
 * A similarity can't mirror, so the tentacle chosen is one that curls the same way as the hook.
 * Push in on the hook, dissolve to the tentacle laid exactly over it, pull out (turning 22°) on the octopus.
 */
// One shared palette for BOTH pictures (title-design silhouettes): the hook and the tentacle are then the same colour,
// which a match cut needs. In their original colours (brown hook, red tentacle) the dissolve read as two things.
const RED = "#c8283c", INK = "#16161f", CREAM = "#efe6d4";
const PALETTE = { background: RED, ink: INK, light: CREAM, lightAbove: 0.86 };
const loaded = typeof Image === "undefined" ? null : await Promise.all([umbrellaPng, octopusPng].map(loadArt));

const inner: MorphScene | null = loaded && (() => {
  const [u, o] = loaded;
  return matchCutArtScene({
    id: "mm-rhyme-photo",
    title: "",
    a: { art: tone(u, PALETTE), placement: fitArt(u, [640, 372], 560), background: RED },
    b: { art: tone(o, PALETTE), placement: fitArt(o, [640, 372], 560), background: RED },
    box: [486, 522, 568, 618],
    align: { scale: 0.886, angle: -22.3 * Math.PI / 180, from: [458.2, 570.3], to: [531.2, 579.7] },
    fill: 0.42,
    swing: 0.35,
    // The hook and the curl are similar, not identical: morph the outline first, swap the picture only when they match.
    silhouette: { ink: INK, alphaA: u, alphaB: o },
    overlay(ctx, t, { hand }) {
      ctx.font = "600 13px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = "rgba(239,230,212,.6)";
      ctx.fillText("MORPH MASTER · SHAPE RHYME · PICTURES · umbrella hook ↔ tentacle curl (no pixel warped)", 48, 52);
      ctx.textAlign = "right";
      ctx.fillText(t.toFixed(2).padStart(5, "0") + " s   dissolve " + Math.round(hand * 100) + "%", 1232, 52);
      ctx.textAlign = "left";
    },
  });
})();

export const scene: MorphScene = {
  id: "mm-rhyme-photo",
  title: "MM97 · 形状押韵转场（图片 → 同一双色剪影调色板）：伞柄弯钩 ↔ 触手卷尖",
  duration: 7.6,
  draw(ctx, t) { inner?.draw(ctx, t); },
};
