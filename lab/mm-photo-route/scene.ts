import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import { flatten, inkReveal, loadArt, tileFlip, type Art } from "../../packages/morph-engine/src/vector/bitmap-render";
import type { Placement } from "../../packages/morph-engine/src/vector/bitmap";
import koiPng from "../../fixtures/s2/koi.png?inline";
import octopusPng from "../../fixtures/s2/octopus_papercut.png?inline";
import swallowPng from "../../fixtures/s2/swallow.png?inline";

/*
 * MM14 — opaque images ("photo route"): no outline to follow, so the change happens across the
 * picture plane, never as a creature-to-creature morph.
 *   1 → 2  tile flip: a wave of tiles turns over from the left (front = first image, back = second)
 *   2 → 3  ink reveal: the third image soaks in from one point with a ragged, feathered edge
 *   3 → 1  blinds: full-width slats turn over top to bottom (the venetian-blind variant of the tile flip)
 * NOTE: there are no real photographs in the project; these are the user's paintings flattened onto
 * an opaque paper colour, so this tests the mechanism, not photographic quality.
 */
// Exactly 16:10, the same aspect as the cropped paintings, so tiles and full draws cover the same area.
const RECT: [number, number, number, number] = [200, 90, 1080, 640];
const load = async () => {
  const [koi, octopus, swallow] = await Promise.all([koiPng, octopusPng, swallowPng].map(loadArt));
  // Crop each painting to a 16:10 window around its subject and flatten it onto paper.
  const crop = (art: Art, cx: number, cy: number, w: number): Art => flatten(art, "#efe6d6", [Math.round(cx - w / 2), Math.round(cy - w * 0.3125), w, Math.round(w * 0.625)]);
  return [crop(koi, 960, 540, 1240), crop(octopus, 550, 370, 760), crop(swallow, 960, 540, 1000)];
};
const arts = typeof Image === "undefined" ? [] : await load();
const fill = (art: Art): Placement => ({ at: [(RECT[0] + RECT[2]) / 2, (RECT[1] + RECT[3]) / 2], scale: (RECT[2] - RECT[0]) / art.width, center: [art.width / 2, art.height / 2] });
const P = arts.map(fill);
const FLIP = [0.8, 3.2], INK = [4.0, 6.6], BLINDS = [7.4, 9.4], END = 10.2;

export const scene: MorphScene = {
  id: "mm-photo-route",
  title: "MM14 · 不透明图（照片路线）：网格翻牌 + 墨晕 + 百叶窗（M4）",
  duration: END,
  draw(ctx, t) {
    ctx.fillStyle = "#24221f";
    ctx.fillRect(0, 0, 1280, 720);
    if (arts.length === 3) {
      ctx.save();
      ctx.beginPath(); ctx.rect(RECT[0] - 30, RECT[1] - 40, RECT[2] - RECT[0] + 60, RECT[3] - RECT[1] + 80); ctx.clip();
      if (t < INK[0]) tileFlip(ctx, arts[0], P[0], arts[1], P[1], RECT, Math.max(0, Math.min(1, (t - FLIP[0]) / (FLIP[1] - FLIP[0]))), { cols: 16, rows: 10 });
      else if (t < BLINDS[0]) inkReveal(ctx, arts[1], P[1], arts[2], P[2], Math.max(0, Math.min(1, (t - INK[0]) / (INK[1] - INK[0]))), [RECT[0] + 220, RECT[1] + 170], 820);
      else tileFlip(ctx, arts[2], P[2], arts[0], P[0], RECT, Math.max(0, Math.min(1, (t - BLINDS[0]) / (BLINDS[1] - BLINDS[0]))), { mode: "blinds", rows: 12 });
      ctx.restore();
    }
    ctx.font = "600 13px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "rgba(240,230,214,.55)";
    ctx.fillText("MORPH MASTER · OPAQUE IMAGES · " + (t < INK[0] ? "TILE FLIP · GRID" : t < BLINDS[0] ? "INK REVEAL" : "TILE FLIP · BLINDS") + "   (paintings flattened onto paper — no real photos in the project)", 48, 52);
    ctx.textAlign = "right";
    ctx.fillText(t.toFixed(2).padStart(5, "0") + " s", 1232, 52);
    ctx.textAlign = "left";
  },
};
