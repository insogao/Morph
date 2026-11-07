import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import type { Vec2 } from "../../packages/morph-engine/src/vector/geom";
import { morphShapes } from "../../packages/morph-engine/src/vector/morph";
import { fillFrame } from "../../packages/morph-engine/src/vector/render";
import { remapParts, type Mapping } from "../../packages/morph-engine/src/vector/remap";
import { parseSvg, placeSvg, type SvgDoc } from "../../packages/morph-engine/src/vector/svg";
import { ease } from "../../packages/morph-engine/src/vector/timeline";
import flowerSvg from "../../fixtures/s1/flower.svg?raw";
import butterflySvg from "../../fixtures/s1/butterfly.svg?raw";

/*
 * D1 comparison — the same flower → butterfly three ways, on one clock:
 *   1. cross-fade            (A fades out, B fades in: not a morph)
 *   2. automatic pairing     (all pieces of both drawings paired by position and size; no semantics)
 *   3. semantic part mapping (Morph Master: petals → wings, top petal splits into antennae,
 *                             centre + stem + leaves merge into the body, spots are born)
 */

const H = 330, CENTERS: Vec2[] = [[224, 360], [640, 360], [1056, 360]];
const docs = CENTERS.map(c => ({ a: placeSvg(parseSvg(flowerSvg), c, H), b: placeSvg(parseSvg(butterflySvg), c, H) }));

const MAPPINGS: Mapping[] = [
  { from: "petal_2", to: "wing_ur", style: "pose", arc: -40, window: [0.00, 0.60] },
  { from: "petal_5", to: "wing_ul", style: "pose", arc: 40, window: [0.05, 0.64] },
  { from: "petal_3", to: "wing_lr", style: "pose", arc: -25, window: [0.10, 0.70] },
  { from: "petal_4", to: "wing_ll", style: "pose", arc: 25, window: [0.14, 0.74] },
  { from: ["center", "stem", "leaf_l", "leaf_r"], to: "body", window: [0.12, 0.72], stagger: 0.1, ease: "inOut" },
  { from: "petal_1", to: ["antenna_l", "antenna_r"], window: [0.42, 0.88], stagger: 0.12, ease: "inOut" },
  { from: [], to: ["spot_ur", "spot_ul", "spot_lr", "spot_ll"], window: [0.70, 0.98], stagger: 0.14, ease: "out" },
];
const semantic = remapParts(docs[2].a, docs[2].b, MAPPINGS);
const whole = (doc: SvgDoc) => ({ pieces: doc.parts.flatMap(p => p.shape.pieces) });
const auto = morphShapes(whole(docs[1].a), whole(docs[1].b), { vanish: "partner" });

const DURATION = 6;
const progress = (time: number) => time < 0.6 ? 0 : time > 4.6 ? 1 : (time - 0.6) / 4;
const LABELS = ["1 · 交叉淡化 cross-fade", "2 · 自动配对（无语义）", "3 · 语义部件映射 Morph Master"];
const BG = "#f3ede2", INK = "#23232b", CORAL = "#ff7556";

function drawDoc(ctx: CanvasRenderingContext2D, doc: SvgDoc, alpha: number) {
  ctx.globalAlpha = alpha;
  for (const p of doc.parts) fillFrame(ctx, p.shape, p.fill ?? INK);
  ctx.globalAlpha = 1;
}

export const scene: MorphScene = {
  id: "mm-flower-butterfly-compare",
  title: "MM05 · 花 → 蝴蝶 三方对照（M3）",
  duration: DURATION,
  draw(ctx, time) {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, 1280, 720);
    const t = progress(time);
    ctx.strokeStyle = "rgba(35,35,43,.08)";
    for (const x of [432, 848]) { ctx.beginPath(); ctx.moveTo(x, 110); ctx.lineTo(x, 620); ctx.stroke(); }

    // 1. Cross-fade.
    const f = ease("inOut", t);
    drawDoc(ctx, docs[0].a, 1 - f);
    drawDoc(ctx, docs[0].b, f);
    // 2. Automatic pairing, one colour: pieces have no identity, so colours have nowhere to go.
    fillFrame(ctx, auto.at(ease("inOut", t)), CORAL);
    // 3. Semantic mapping.
    for (const part of semantic.at(t)) fillFrame(ctx, part.frame, part.fill);

    ctx.font = "600 14px system-ui, sans-serif";
    ctx.textAlign = "center";
    LABELS.forEach((label, i) => {
      ctx.fillStyle = i === 2 ? INK : "rgba(35,35,43,.6)";
      ctx.fillText(label, CENTERS[i][0], 96);
    });
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = "rgba(35,35,43,.45)";
    ctx.fillText("颜色无法跟随（片没有身份）", CENTERS[1][0], 626);
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(35,35,43,.12)";
    ctx.fillRect(48, 684, 1184, 2);
    ctx.fillStyle = CORAL;
    ctx.fillRect(48, 684, 1184 * time / DURATION, 2);
  },
};
