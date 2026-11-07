import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import { createSdfRenderer, type Prim, type RGB, type SdfRenderer } from "../../packages/morph-engine/src/renderers/sdf-gl";
import { hex, lerp, mixRGB, smooth, win } from "../../packages/morph-engine/src/effects/skeleton";
import { bounds, centroid, rotate, type Ring, type Vec2 } from "../../packages/morph-engine/src/vector/geom";
import type { Frame } from "../../packages/morph-engine/src/vector/morph";
import { remapParts } from "../../packages/morph-engine/src/vector/remap";
import { framePrims } from "../../packages/morph-engine/src/vector/sdf-bridge";
import { shapeFromRings, type Shape } from "../../packages/morph-engine/src/vector/shape";
import type { SvgDoc } from "../../packages/morph-engine/src/vector/svg";
import { layoutText, type GlyphSet } from "../../packages/morph-engine/src/vector/text";
import glyphSet from "../mm-word/glyphs.json";
import traced from "./layers.json";
import bodyPng from "./img/body.png?inline";
import tailPng from "./img/tail.png?inline";
import dorsalPng from "./img/dorsal.png?inline";
import pectoralPng from "./img/pectoral.png?inline";
import eyePng from "./img/eye.png?inline";

/*
 * MM09 — the real-font character 鱼 (Noto Sans SC 900) becomes a painted koi.
 *
 * Geometry: vector track. The target outlines are TRACED from the user's layered koi painting
 *           (assets/generated/koi, OpenAI ImageGen for this project; tools/trace-layers.ts), so the
 *           liquid ink reforms into the painting's exact silhouette, part by part.
 * Material: SDF part field — flat ink → liquid (bevel, gloss, wobble, fusing) → settled body.
 * Texture:  once the silhouette has landed, the gongbi painting washes in from head to tail with an
 *           ink-bleed edge (a spatial reveal of texture, not geometry: geometry cannot invent scales).
 * Payoff:   the painted layers are drawn in thin vertical strips, so the swim wave bends the painting.
 */

const traceLayers = traced.layers as unknown as Record<string, { rings: Array<Array<[number, number]>> }>;
const layerShape = (name: string): Shape => {
  const s = shapeFromRings(traceLayers[name].rings as Ring[]);
  // Keep the main outline; drop small openings (the eye socket in the body layer) — the eye is drawn on top.
  return { pieces: s.pieces.slice(0, 1).map(p => ({ outer: p.outer, holes: [] })) };
};
const RAW = { body: layerShape("body"), tail: layerShape("tail"), dorsal: layerShape("dorsal"), pectoral: layerShape("pectoral") };
// The painting fills half the canvas; enlarge the koi (geometry and texture alike) around its centre.
const raw = bounds(Object.values(RAW).flatMap(s => s.pieces.map(p => p.outer)));
const K = 1.35, PIVOT: Vec2 = [(raw.min[0] + raw.max[0]) / 2, (raw.min[1] + raw.max[1]) / 2];
const grow = ([x, y]: Vec2): Vec2 => [PIVOT[0] + (x - PIVOT[0]) * K, PIVOT[1] + (y - PIVOT[1]) * K];
const KOI = Object.fromEntries(Object.entries(RAW).map(([id, sh]) => [id, { pieces: sh.pieces.map(p => ({ outer: p.outer.map(grow), holes: [] })) }])) as unknown as Record<keyof typeof RAW, Shape>;
const box = bounds(Object.values(KOI).flatMap(s => s.pieces.map(p => p.outer)));
const C: Vec2 = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2 + 10];

const INK: RGB = hex("#161311"), ORANGE: RGB = hex("#e8582c"), PALE: RGB = hex("#f3e7d8"), FIN: RGB = hex("#f6d2bd"), WATER: RGB = hex("#a9cfdc");

// --- Source: the glyph, centred where the koi will be. ---
const [glyph] = layoutText(glyphSet as GlyphSet, "鱼", { at: C, size: 360 });
// In Noto Sans SC 900, ⺈ and 田 are one connected outline (田's four counters are holes); the base stroke is the other.
const pieces = [...glyph.shape.pieces].sort((a, b) => centroid(a.outer)[1] - centroid(b.outer)[1]);
if (pieces.length !== 2) throw new Error("Expected 鱼 to have 2 pieces in this font, got " + pieces.length);
const TURN = -Math.PI / 2;
const turned = (s: Shape, a: number): Shape => ({ pieces: s.pieces.map(p => ({ outer: p.outer.map(q => rotate(q, a, C)), holes: p.holes.map(h => h.map(q => rotate(q, a, C))) })) });
const glyphShapes = pieces.map(p => ({ pieces: [p] }));

const doc = (parts: Array<[string, Shape]>): SvgDoc => ({
  viewBox: [0, 0, 1280, 720], issues: { openPaths: [], strokeOnly: [], gradients: [], texts: 0, images: 0, anonymous: 0 },
  parts: parts.map(([id, shape], z) => ({ id, shape, fill: "#000000", stroke: null, z, groups: [] })),
});
const near = (x: number) => KOI.body.pieces[0].outer.filter(p => Math.abs(p[0] - x) < 20).map(p => p[1]);
const dorsalC = centroid(KOI.dorsal.pieces[0].outer), pectoralC = centroid(KOI.pectoral.pieces[0].outer);
const plan = remapParts(doc([["glyph_upper", turned(glyphShapes[0], TURN)], ["glyph_base", turned(glyphShapes[1], TURN)]]),
  doc([["tail", KOI.tail], ["dorsal", KOI.dorsal], ["body", KOI.body], ["pectoral", KOI.pectoral]]), [
    { from: "glyph_upper", to: "body", window: [0, 0.85], ease: "inOut" },
    { from: "glyph_base", to: "tail", window: [0.05, 0.9], ease: "inOut", options: { vanish: "partner" } },
    { from: [], to: "dorsal", bornFrom: [dorsalC[0], Math.min(...near(dorsalC[0])) + 18], window: [0.45, 1], ease: "out" },
    { from: [], to: "pectoral", bornFrom: [pectoralC[0], Math.max(...near(pectoralC[0])) - 14], window: [0.5, 1], ease: "out" },
  ]);

// --- Textures, decoded before the scene is used so every frame is deterministic. ---
const load = async (src: string) => { const img = new Image(); img.src = src; await img.decode(); return img; };
const IMAGES: HTMLImageElement[] = typeof Image === "undefined" ? [] : await Promise.all([tailPng, dorsalPng, bodyPng, pectoralPng, eyePng].map(load));
const ART_SCALE = traced.scale as number; // 1920 × 1080 art → 1280 × 720 design

// --- Clock. ---
const DROP = [0.2, 1.0], TURN_T = [1.2, 2.4], REMAP = [2.5, 5.0], WASH = [4.9, 6.2], SWIM = [6.0, 9.0];
const DURATION = 9.0;
const melt = (t: number) => win(t, 1.1, 2.4), alive = (t: number) => win(t, 3.0, 4.8);

/** The swim wave: tail-weighted sideways bend plus a slow drift to the left. Shared by geometry and texture. */
const swimDy = (x: number, t: number) => {
  const amp = 13 * win(t, SWIM[0], SWIM[0] + 0.8);
  const u = Math.max(0, Math.min(1, (x - box.min[0]) / (box.max[0] - box.min[0])));
  return amp * Math.sin(x * 0.014 - t * 6.2) * u * u;
};
const swimDx = (t: number) => -110 * smooth((t - SWIM[0] - 0.3) / 2.8);
function swim(frame: Frame, t: number): Frame {
  const dx = swimDx(t);
  const f = ([x, y]: Vec2): Vec2 => [x + dx, y + swimDy(x, t)];
  return { pieces: frame.pieces.map(p => ({ outer: p.outer.map(f), holes: p.holes.map(h => h.map(f)) })) };
}

function prims(t: number): Prim[] {
  const m = melt(t), k = alive(t), settle = win(t, WASH[0] - 0.4, WASH[0] + 0.3);
  const out: Prim[] = [];
  const liquid = { gloss: lerp(lerp(0.06, 0.7, m), 0.45, k), wobble: (6 * m * (1 - k) + 1.2 * k) * (1 - settle), anchor: C };
  if (t < REMAP[0]) {
    const a = TURN * smooth((t - TURN_T[0]) / (TURN_T[1] - TURN_T[0]));
    glyphShapes.forEach((s, i) => out.push(...framePrims(turned(s, a), { ...liquid, color: INK, blend: i ? 22 * m : 0, holeBlend: 6 * m })));
  } else {
    const tr = (t - REMAP[0]) / (REMAP[1] - REMAP[0]);
    for (const part of plan.at(Math.min(1, tr))) {
      const fin = part.id !== "body";
      // Ink → orange → cream for the body (a straight ink → cream mix passes through a dead grey).
      const color = fin ? mixRGB(INK, FIN, k) : k < 0.55 ? mixRGB(INK, ORANGE, k / 0.55) : mixRGB(ORANGE, PALE, (k - 0.55) / 0.45);
      // Fusing bridges fade out as the painting arrives, so the SDF silhouette equals the painted one.
      const blend = lerp(22, fin ? 10 : 6, k) * (1 - settle);
      out.push(...framePrims(swim(part.frame, t), { ...liquid, color, blend: out.length ? blend : 0, sss: (fin ? 0.9 : 0.4) * k, holeBlend: 6 }));
    }
  }
  const fall = (t - DROP[0]) / (DROP[1] - DROP[0]);
  if (fall > 0 && fall < 1.35) {
    const y = lerp(-40, C[1] - 30, Math.min(1, fall * fall));
    const squash = fall > 1 ? 1 - (fall - 1) / 0.35 : 1;
    out.push({ shape: { kind: "ellipse", x: C[0] + 8, y, rx: 22 * (fall > 1 ? 1 + (fall - 1) * 3 : 1) * squash, ry: 30 * squash }, color: WATER, gloss: 1, sss: 0.8, blend: 14 });
  }
  return out;
}

/** Draw a painted layer in thin vertical strips so the swim wave bends it, revealed up to `front`. */
function painted(ctx: CanvasRenderingContext2D, img: HTMLImageElement, t: number, front: number, layer: CanvasRenderingContext2D) {
  const h = img.height * ART_SCALE, strip = 5, dx = swimDx(t);
  layer.save();
  layer.resetTransform();
  layer.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
  layer.restore();
  // x runs over the art in unscaled design units; each strip lands where `grow` puts it.
  for (let x = Math.max(0, raw.min[0] - 20); x < raw.max[0] + 20; x += strip) {
    const [gx, gy] = grow([x, 0]);
    layer.drawImage(img, x / ART_SCALE, 0, strip / ART_SCALE + 1, img.height, gx + dx, gy + swimDy(gx + strip * K / 2, t), strip * K + 0.8, h * K);
  }
  // Ink-bleed front: everything behind it is painted, ahead of it is still bare body.
  if (front < box.max[0] + 200) {
    layer.globalCompositeOperation = "destination-in";
    const g = layer.createLinearGradient(front - 120, 0, front, 0);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    layer.fillStyle = g;
    layer.fillRect(-100, -100, 1480, 920);
    layer.globalCompositeOperation = "source-over";
  }
  ctx.save();
  ctx.resetTransform();
  ctx.drawImage(layer.canvas, 0, 0);
  ctx.restore();
}

function paper(ctx: CanvasRenderingContext2D, t: number) {
  const g = ctx.createRadialGradient(640, 330, 80, 640, 360, 820);
  g.addColorStop(0, "#f3ead6");
  g.addColorStop(1, "#d8cbb0");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1280, 720);
  ctx.strokeStyle = "#5f7d8a";
  ctx.lineWidth = 1.2;
  for (const [start, cx] of [[DROP[1], C[0] + 8], [SWIM[0] + 0.2, C[0] + 60 + swimDx(t)]] as Array<[number, number]>) {
    for (let r = 0; r < 4; r++) {
      const life = (t - start - r * 0.22) / 1.6;
      if (life <= 0 || life >= 1) continue;
      ctx.globalAlpha = (1 - life) * 0.4;
      ctx.beginPath();
      ctx.ellipse(cx, C[1] + 6, 60 + life * 340, 26 + life * 140, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#5b4c3a";
  ctx.font = "12px Georgia, serif";
  ctx.fillText("MORPH MASTER  /  GLYPH → LIQUID → PAINTED KOI   鱼 (Noto Sans SC) · koi layers traced from the user's painting", 48, 52);
}

let renderer: SdfRenderer | null = null;
let layer: CanvasRenderingContext2D | null = null;
export const scene: MorphScene = {
  id: "mm-glyph-koi",
  title: "MM09 · 真实字体「鱼」→ 工笔锦鲤（描摹分层图 + 矢量 → SDF，M3b）",
  duration: DURATION,
  draw(ctx, t) {
    renderer ??= createSdfRenderer();
    if (!layer) layer = document.createElement("canvas").getContext("2d")!;
    if (layer.canvas.width !== ctx.canvas.width || layer.canvas.height !== ctx.canvas.height) { layer.canvas.width = ctx.canvas.width; layer.canvas.height = ctx.canvas.height; }
    layer.setTransform(ctx.getTransform());
    paper(ctx, t);
    const m = melt(t), k = alive(t);
    renderer.draw(ctx, prims(t), {
      thickness: lerp(lerp(1.5, 14, m), 16, k), time: t, seed: 2, light: [-0.4, -0.7, 0.6],
      keyColor: [1, 0.97, 0.9], ambientTop: [0.62, 0.6, 0.56], ambientBottom: [0.3, 0.26, 0.22], rimColor: [1, 0.95, 0.85], sssColor: [1, 0.55, 0.25],
      shadowOffset: [lerp(1, 16, Math.max(m * 0.5, k)), lerp(2, 22, Math.max(m * 0.5, k))], shadowSoftness: lerp(1.5, 14, k), shadowOpacity: lerp(0.15, 0.24, k), shadowColor: [0.2, 0.15, 0.1],
    });
    // Texture wash, head → tail, in paint order (tail and dorsal behind the body, pectoral and eye in front).
    const u = (t - WASH[0]) / (WASH[1] - WASH[0]);
    if (u > 0) {
      const front = lerp(box.min[0] - 40, box.max[0] + 220, smooth(Math.min(1, u))) + swimDx(t);
      for (const img of IMAGES) painted(ctx, img, t, front, layer);
    }
  },
};
