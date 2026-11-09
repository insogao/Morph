import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import { fitArt, loadArt, ShatterMorph } from "../../packages/morph-engine/src/vector/bitmap-render";
import umbrellaPng from "../../fixtures/s2/umbrella.png?inline";
import octopusPng from "../../fixtures/s2/octopus.png?inline";

/*
 * MM13 — bitmap route, two-faced shatter: the picture breaks into Voronoi shards that lift away
 * from a tap, turn over and settle. Each shard's front face is A, its back face is B (both are the
 * real images, clipped), so the change happens as the pieces flip — no cross-fade, no invented pixels.
 * Shards at rest are drawn as one clean image, so there are no seams before or after.
 * Cause: a tap; cracks run out from it along the real fracture lines (the shard edges), engraved
 * into the picture and masked by its alpha, and they stay on each piece until it lifts off.
 */
const [umbrella, octopus] = typeof Image === "undefined" ? [] : await Promise.all([umbrellaPng, octopusPng].map(loadArt));
const AT: [number, number] = [640, 372], TAP: [number, number] = [700, 250];
const pa = umbrella && fitArt(umbrella, AT, 500), pb = octopus && fitArt(octopus, AT, 500);
const morph = umbrella && octopus ? new ShatterMorph(umbrella, pa!, octopus, pb!, { count: 110, seed: 11, impact: TAP, spread: 0.45 }) : null;
const TAP_T = 0.6, MORPH = [1.15, 4.7], END = 6.2;

export const scene: MorphScene = {
  id: "mm-shatter-flip",
  title: "MM13 · 位图：碎裂翻面 雨伞 → 章鱼（M4）",
  duration: END,
  draw(ctx, t) {
    ctx.fillStyle = "#efe9e0";
    ctx.fillRect(0, 0, 1280, 720);
    if (!morph) return;
    // Cause: a tap. Cracks run out from it along the real fracture lines, then the pieces lift.
    const u = Math.max(0, Math.min(1, (t - MORPH[0]) / (MORPH[1] - MORPH[0])));
    morph.draw(ctx, u);
    morph.drawCracks(ctx, (t - TAP_T) / (MORPH[0] - TAP_T + 0.05), u);
    ctx.font = "600 13px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "rgba(30,30,36,.55)";
    ctx.fillText("MORPH MASTER · BITMAP · TWO-FACED SHATTER", 48, 52);
    ctx.textAlign = "right";
    ctx.fillText(t.toFixed(2).padStart(5, "0") + " s", 1232, 52);
    ctx.textAlign = "left";
  },
};
