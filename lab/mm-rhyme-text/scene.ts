import { cutParts, matchCutScene, type CutPart } from "../../packages/morph-engine/src/vector/match-cut";
import { parseSvg, placeSvg } from "../../packages/morph-engine/src/vector/svg";
import { layoutText, type GlyphSet } from "../../packages/morph-engine/src/vector/text";
import glyphs from "./glyphs.json";
import sunrise from "../../fixtures/s4/sunrise.svg?raw";

/*
 * MM95 — shape-rhyme match cut, text → picture: the O of MORNING is the morning sun.
 * tools/rhyme.ts ranks every O ↔ sun (round ↔ round, its hole closes); meaning picks MORNING's O. It is set in the
 * sun's colour from the start, so the eye is already on it. Push in until the O fills the frame, the O closes into
 * the sun's disc, pull out on the landscape.
 */
const slots = layoutText(glyphs as GlyphSet, "GOOD MORNING", { at: [640, 360], size: 118, tracking: 0.04 });
const words: CutPart[] = slots.map((s, i) => ({ id: s.ch + "@" + i, shape: s.shape, fill: "#2b2d42" }));
const rhyme = words.filter(p => p.id.startsWith("O@")).at(-1)!; // the O of MORNING
rhyme.fill = "#ffb627";
const land = placeSvg(parseSvg(sunrise), [640, 360], 720);

export const scene = matchCutScene({
  id: "mm-rhyme-text",
  title: "MM95 · 形状押韵转场（文字）：MORNING 的 O ↔ 太阳，推近 → 合拢 → 拉远",
  a: { parts: words, background: "#f6efe3" },
  b: { parts: cutParts(land.parts), background: "#fde7c4" },
  rhyme: { a: rhyme.id, b: "sun" },
  // FPV: dive into the O's orange stroke until it fills the frame, swap there, burst out of the sun.
  style: "dive",
  swing: -0.5,
  overlay(ctx, t, { hand }) {
    ctx.font = "600 13px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "rgba(40,30,20,.55)";
    ctx.fillText("MORPH MASTER · SHAPE RHYME · O ↔ sun", 48, 52);
    ctx.textAlign = "right";
    ctx.fillText(t.toFixed(2).padStart(5, "0") + " s   hand-off " + Math.round(hand * 100) + "%", 1232, 52);
    ctx.textAlign = "left";
  },
});
