import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import { rotate, type Ring, type Vec2 } from "../../packages/morph-engine/src/vector/geom";
import type { Frame } from "../../packages/morph-engine/src/vector/morph";
import { fillFrame, framePath, mixColor } from "../../packages/morph-engine/src/vector/render";
import { channel, poseMorph, remapParts, type Mapping } from "../../packages/morph-engine/src/vector/remap";
import { shapeFromRings, type Shape } from "../../packages/morph-engine/src/vector/shape";
import { parseSvg, placeSvg, type SvgDoc } from "../../packages/morph-engine/src/vector/svg";
import fishSvg from "../../fixtures/s1/fish.svg?raw";
import birdSvg from "../../fixtures/s1/bird.svg?raw";

/*
 * D2 — fish → bird with three PARALLEL channels, each on its own clock:
 *   OUTLINE     body/tail/fins → body/tail/wings, beak is born at the snout   (part remap)
 *   PATTERN     scales → feathers, clipped to the animal's current silhouette (texture-like)
 *   BACKGROUND  water bands rise and become clouds; this channel pauses halfway on purpose
 * The bars at the bottom show each channel's progress; they start, stop and finish independently.
 */

const AT: Vec2 = [600, 330], H = 520;
const fish = placeSvg(parseSvg(fishSvg), AT, H), bird = placeSvg(parseSvg(birdSvg), AT, H);
const svgPoint = ([x, y]: Vec2): Vec2 => [AT[0] + (x - 200) * H / 400, AT[1] + (y - 200) * H / 400];
const only = (doc: SvgDoc, keep: (id: string) => boolean): SvgDoc => ({ ...doc, parts: doc.parts.filter(p => keep(p.id)) });
const PATTERN = new Set(["scales", "feathers"]);

const OUTLINE_MAP: Mapping[] = [
  { from: "body", to: "body", window: [0, 1], ease: "inOut" },
  { from: "tail", to: "tail", window: [0.1, 0.9], ease: "inOut" },
  { from: "fin_dorsal", to: "wing_near", style: "pose", arc: 30, window: [0.05, 0.85] },
  { from: "fin_pectoral", to: "wing_far", style: "pose", arc: -20, window: [0.15, 0.9] },
  { from: "eye", to: "eye", window: [0, 1], ease: "inOut" },
  { from: [], to: "beak", bornFrom: svgPoint([340, 200]), window: [0.55, 1], ease: "out" },
];
const outline = remapParts(only(fish, id => !PATTERN.has(id)), only(bird, id => !PATTERN.has(id)), OUTLINE_MAP);
const pattern = remapParts(only(fish, id => PATTERN.has(id)), only(bird, id => PATTERN.has(id)), [{ from: "scales", to: "feathers", ease: "inOut" }]);

// Background: three water bands → three clouds.
function band(i: number): Shape {
  const top: Vec2[] = [], bottom: Vec2[] = [];
  const y0 = 560 + i * 34;
  for (let x = 70; x <= 1210; x += 10) {
    const y = y0 + 7 * Math.sin(x / 46 + i * 1.7);
    top.push([x, y]); bottom.push([x, y + 12 + 3 * Math.sin(x / 31 + i)]);
  }
  return shapeFromRings([[...top, ...bottom.reverse()]]);
}
function cloud(c: Vec2, w: number, h: number, seed: number): Shape {
  const ring: Ring = [];
  for (let k = 0; k < 160; k++) {
    const a = (k / 160) * Math.PI * 2;
    const puff = 1 + 0.14 * Math.max(0, Math.sin(5 * a + seed)) + 0.06 * Math.sin(9 * a + seed * 2);
    // Flat-ish underside, puffy top.
    const y = Math.sin(a) > 0 ? Math.sin(a) * h * 0.42 : Math.sin(a) * h * puff;
    ring.push([c[0] + Math.cos(a) * w * puff, c[1] + y]);
  }
  return shapeFromRings([ring]);
}
const CLOUDS = [cloud([250, 150], 120, 46, 0.3), cloud([1030, 120], 150, 52, 1.9), cloud([830, 230], 90, 34, 4.1)];
const BG_MORPHS = [0, 1, 2].map(i => poseMorph(band(i), CLOUDS[i], { arc: i === 1 ? -80 : 60 }));

// Clocks (seconds). The background deliberately pauses at 50% between 1.9 s and 3.4 s.
const OUTLINE_T: [number, number] = [1.2, 4.2], PATTERN_T: [number, number] = [2.4, 5.0];
const bgProgress = (t: number) => 0.5 * channel(t, [0.6, 1.9], "inOut") + 0.5 * channel(t, [3.4, 4.8], "inOut");
const FLY: [number, number] = [5.0, 7.6];
const DURATION = 7.6;

const mapFrame = (frame: Frame, f: (p: Vec2) => Vec2): Frame => ({ pieces: frame.pieces.map(p => ({ outer: p.outer.map(f), holes: p.holes.map(h => h.map(f)) })) });
const SHOULDER = svgPoint([222, 196]), FAR_SHOULDER = svgPoint([240, 194]);

/** Before: the fish bobs (back to rest at 1.2 s). After: only a bird flaps and flies off. */
function motion(id: string, frame: Frame, time: number): Frame {
  let out = frame;
  if (time < 1.2) {
    const dy = 7 * Math.sin(2 * Math.PI * time / 1.2);
    return mapFrame(out, ([x, y]) => [x, y + dy]);
  }
  const k = channel(time, [FLY[0] - 0.3, FLY[0] + 0.4], "inOut");
  if (k <= 0) return out;
  const s = time - FLY[0], rate = 2.2;
  // Side view: the wing hinges at the shoulder. From raised (0) the downstroke sweeps the tip
  // back and down below the body line (about 105°), foreshortening a little mid-stroke, then back up.
  const stroke = (lag: number) => 0.5 - 0.5 * Math.cos(2 * Math.PI * rate * s - lag);
  const hinge = (pivot: Vec2, w: number, amount: number) => (p: Vec2): Vec2 => {
    const short = 1 - 0.16 * Math.sin(Math.PI * w);
    const q = rotate(p, -1.85 * amount * w * k, pivot);
    return [pivot[0] + (q[0] - pivot[0]) * short, pivot[1] + (q[1] - pivot[1]) * short];
  };
  if (id === "wing_near" || id === "feathers") out = mapFrame(out, hinge(SHOULDER, stroke(0), 1));
  if (id === "wing_far") out = mapFrame(out, hinge(FAR_SHOULDER, stroke(0.5), 0.85));
  // The body rises on each downstroke and the whole bird flies off up and to the right.
  const fly = channel(time, [FLY[0] + 0.4, FLY[1]], "in");
  const bob = k * 7 * Math.sin(2 * Math.PI * rate * s);
  return mapFrame(out, ([x, y]) => [x + 420 * fly, y - 150 * fly - bob]);
}

function bars(ctx: CanvasRenderingContext2D, values: Array<[string, number, string]>) {
  ctx.font = "600 12px ui-monospace, SFMono-Regular, Menlo, monospace";
  values.forEach(([label, v, color], i) => {
    const y = 612 + i * 24;
    ctx.fillStyle = "rgba(20,30,40,.55)";
    ctx.fillText(label, 48, y + 4);
    ctx.fillStyle = "rgba(20,30,40,.12)";
    ctx.fillRect(196, y, 300, 4);
    ctx.fillStyle = color;
    ctx.fillRect(196, y, 300 * Math.max(0, Math.min(1, v)), 4);
    ctx.fillStyle = "rgba(20,30,40,.55)";
    ctx.fillText(Math.round(100 * Math.max(0, Math.min(1, v))) + "%", 508, y + 4);
  });
}

export const scene: MorphScene = {
  id: "mm-fish-bird",
  title: "MM06 · 鱼 → 鸟 三通道并行（M3）",
  duration: DURATION,
  draw(ctx, time) {
    const bg = bgProgress(time);
    ctx.fillStyle = mixColor("#d9ecf1", "#eef0fb", bg);
    ctx.fillRect(0, 0, 1280, 720);

    // BACKGROUND channel.
    const water = mixColor("#a9d6e5", "#ffffff", bg);
    for (const m of BG_MORPHS) fillFrame(ctx, m(bg), water);

    // OUTLINE channel.
    const to = channel(time, OUTLINE_T, "linear");
    const parts = outline.at(to).map(p => ({ ...p, frame: motion(p.id, p.frame, time) }));
    for (const p of parts) fillFrame(ctx, p.frame, p.fill);

    // PATTERN channel, clipped to the animal's current silhouette so it reads as texture.
    const tp = channel(time, PATTERN_T, "linear");
    const skin = framePath({ pieces: parts.filter(p => ["body", "wing_near"].includes(p.id)).flatMap(p => p.frame.pieces) });
    ctx.save();
    ctx.clip(skin, "nonzero");
    for (const p of pattern.at(tp)) fillFrame(ctx, motion(tp > 0.5 ? "feathers" : "scales", p.frame, time), p.fill);
    ctx.restore();
    // The eye sits above the pattern.
    for (const p of parts) if (p.id === "eye") fillFrame(ctx, p.frame, p.fill);

    ctx.font = "600 13px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "rgba(20,30,40,.55)";
    ctx.fillText("MORPH MASTER · PARALLEL CHANNELS", 48, 52);
    ctx.textAlign = "right";
    ctx.fillText(time.toFixed(2).padStart(5, "0") + " s", 1232, 52);
    ctx.textAlign = "left";
    bars(ctx, [["OUTLINE 轮廓", to, "#3a4fc4"], ["PATTERN 纹样", tp, "#7cc6e0"], ["BACKGROUND 背景", bg, "#8aa0b0"]]);
  },
};
