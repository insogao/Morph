import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import { remapScene, validateSpec, type MorphSpec } from "../../packages/morph-engine/src/vector/director";
import base from "../mm-candle-tulip/morph.json";
import source from "../../fixtures/s1g/candle.svg?raw";
import target from "../../fixtures/s1g/tulip.svg?raw";

/*
 * MM11 — the same candle → tulip mappings with two liquid materials, side by side on one clock:
 *   left   render.style "flat"   — 2D goo: solid colours, smooth liquid silhouettes, no bevel or lighting
 *   right  render.style "glossy" — bevelled, lit, translucent 3D material
 */
const variant = (x: number, style: "flat" | "glossy"): MorphSpec => {
  const spec = structuredClone(base) as unknown as MorphSpec;
  spec.id = "mm-liquid-compare-" + style;
  spec.place = { at: [x, 380], height: 560 };
  spec.render = { ...spec.render!, style, shadow: style === "flat" ? 0 : 0.3 };
  spec.look = { ...spec.look, legend: false, label: " " };
  return validateSpec(spec);
};
const left = remapScene(variant(330, "flat"), source, target);
const right = remapScene(variant(950, "glossy"), source, target);

export const scene: MorphScene = {
  id: "mm-liquid-compare",
  title: "MM11 · 液态材质对照：扁平 2D vs 立体光泽（同一份映射）",
  duration: left.duration,
  draw(ctx, t) {
    for (const [half, x0] of [[left, 0], [right, 640]] as const) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, 0, 640, 720);
      ctx.clip();
      half.draw(ctx, t);
      ctx.restore();
    }
    ctx.fillStyle = "rgba(242,230,214,.12)";
    ctx.fillRect(639, 70, 2, 590);
    ctx.font = "600 14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(242,230,214,.8)";
    ctx.fillText("flat · 扁平 2D 液态", 330, 48);
    ctx.fillText("glossy · 立体光泽", 950, 48);
    ctx.textAlign = "left";
  },
};
