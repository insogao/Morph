import { cutParts, matchCutScene } from "../../packages/morph-engine/src/vector/match-cut";
import { parseSvg, placeSvg } from "../../packages/morph-engine/src/vector/svg";
import coffee from "../../fixtures/s4/coffee.svg?raw";
import plant from "../../fixtures/s4/plant.svg?raw";

/*
 * MM96 — shape-rhyme match cut, SVG: coffee cup → potted plant through the COFFEE SURFACE ↔ SOIL rhyme.
 * tools/rhyme.ts ranks flat ellipses together (coffee, saucer ↔ rim, tray, soil); meaning picks coffee → soil:
 * the dark surface of a drink becomes the dark surface of earth. Push in until the coffee fills the frame,
 * hand it over to the soil laid exactly over it (the cup's mouth becomes the pot's rim around it), pull out.
 */
const A = placeSvg(parseSvg(coffee), [640, 390], 600), B = placeSvg(parseSvg(plant), [640, 390], 600);

export const scene = matchCutScene({
  id: "mm-rhyme-svg",
  title: "MM96 · 形状押韵转场（SVG）：咖啡液面 ↔ 盆土，推近 → 交接 → 拉远",
  a: { parts: cutParts(A.parts), background: "#f4efe6" },
  b: { parts: cutParts(B.parts), background: "#eef2e6" },
  rhyme: { a: "coffee", b: "soil" },
  // Around the rhyme, every part that has a neighbour on the other side morphs into it (no cross-fade double exposure);
  // only the top leaf, with nothing to come from, fades in.
  pairs: [["cup", "pot"], ["handle", "rim"], ["saucer", "tray"], ["steam_c", "stem"], ["steam_l", "leaf_l"], ["steam_r", "leaf_r"]],
  fill: 0.72,
  swing: 0.45,
  overlay(ctx, t, { hand }) {
    ctx.font = "600 13px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "rgba(40,30,20,.55)";
    ctx.fillText("MORPH MASTER · SHAPE RHYME · coffee ↔ soil", 48, 52);
    ctx.textAlign = "right";
    ctx.fillText(t.toFixed(2).padStart(5, "0") + " s   hand-off " + Math.round(hand * 100) + "%", 1232, 52);
    ctx.textAlign = "left";
  },
});
