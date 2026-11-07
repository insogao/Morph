import flubber from "flubber";
import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import { morphShapes, type MorphOptions, type ShapeMorph } from "../../packages/morph-engine/src/vector/morph";
import { fit, ringPath, type Shape } from "../../packages/morph-engine/src/vector/shape";
import { drawMatch, fillFrame } from "../../packages/morph-engine/src/vector/render";
import { ease } from "../../packages/morph-engine/src/vector/timeline";
import * as S from "../../fixtures/s0/shapes";

/*
 * Vector-track comparison. Each row is one A → B pair, each column one method:
 *   map       — our correspondence: both outlines, point links, corner knots (orange), pins (pink)
 *   flubber   — the library baseline (outer contour of the first piece only)
 *   linear    — our correspondence + straight point interpolation (what path keyframes do)
 *   intrinsic — our correspondence + edge length / turning-angle interpolation
 */

const COLS = ["对应关系 map", "flubber", "linear", "intrinsic"];
const ROWS: Array<{ name: string; a: Shape; b: Shape; options?: MorphOptions }> = [
  { name: "心 → 八角星", a: S.heart, b: S.star8 },
  { name: "E → M（自动旋转）", a: S.letterE, b: S.letterM, options: { rotate: "auto" } },
  { name: "Y → 木", a: S.glyphY, b: S.glyphTree },
  { name: "沙漏 → X + 四菱形", a: S.hourglass, b: S.crossDiamonds, options: { vanish: "partner" } },
];

const CW = 300, RH = 160, X0 = 72, Y0 = 70, SIZE = 118;
const cell = (c: number, r: number): [number, number] => [X0 + CW * c + CW / 2, Y0 + RH * r + RH / 2];

interface Row { linear: ShapeMorph; intrinsic: ShapeMorph; flub: (t: number) => string; a: Shape; b: Shape }
const rows: Row[] = ROWS.map(({ a, b, options }, r) => {
  // Each method draws in its own cell; build shapes per cell from the same source geometry.
  const place = (shape: Shape, c: number) => fit(shape, cell(c, r), SIZE);
  const fa = place(a, 2), fb = place(b, 2), ia = place(a, 3), ib = place(b, 3);
  const pa = place(a, 1), pb = place(b, 1);
  return {
    a: place(a, 0), b: place(b, 0),
    linear: morphShapes(fa, fb, { ...options, mode: "linear" }),
    intrinsic: morphShapes(ia, ib, { ...options, mode: "intrinsic" }),
    flub: flubber.interpolate(ringPath(pa.pieces[0].outer), ringPath(pb.pieces[0].outer), { maxSegmentLength: 3 }),
  };
});
const maps = ROWS.map(({ options }, r) => morphShapes(rows[r].a, rows[r].b, { ...options, mode: "intrinsic" }));

const DURATION = 6;
/** 0 → 1 → 0 with holds, so scrubbing shows both directions. */
function progress(time: number): number {
  if (time < 0.6) return 0;
  if (time < 2.8) return ease("inOut", (time - 0.6) / 2.2);
  if (time < 3.4) return 1;
  if (time < 5.6) return 1 - ease("inOut", (time - 3.4) / 2.2);
  return 0;
}

const INK = "#f2efe6", BG = "#14161b", ACCENT = "#ff6a3d";

export const scene: MorphScene = {
  id: "mm-vs-linear",
  title: "MM01 · 矢量形变对比（M1）",
  duration: DURATION,
  draw(ctx, time) {
    const t = progress(time);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, 1280, 720);
    ctx.font = "600 15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(242,239,230,.7)";
    COLS.forEach((label, c) => ctx.fillText(label, X0 + CW * c + CW / 2, 44));
    ctx.textAlign = "left";
    ctx.font = "13px system-ui, sans-serif";
    ROWS.forEach(({ name }, r) => {
      ctx.save();
      ctx.translate(26, Y0 + RH * r + RH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(242,239,230,.5)";
      ctx.fillText(name, 0, 0);
      ctx.restore();
    });
    ctx.strokeStyle = "rgba(255,255,255,.06)";
    for (let c = 1; c < 4; c++) { ctx.beginPath(); ctx.moveTo(X0 + CW * c, Y0); ctx.lineTo(X0 + CW * c, Y0 + RH * 4); ctx.stroke(); }

    rows.forEach((row, r) => {
      drawMatch(ctx, maps[r], { every: 5 });
      fillFrame(ctx, row.intrinsic.at(t), INK);
      fillFrame(ctx, row.linear.at(t), INK);
      const path = new Path2D(row.flub(t));
      ctx.fillStyle = INK;
      ctx.fill(path);
      if (r === 3) {
        ctx.fillStyle = "rgba(242,239,230,.35)";
        ctx.font = "12px system-ui, sans-serif";
        ctx.textAlign = "center";
        const [x, y] = cell(1, r);
        ctx.fillText("仅外轮廓", x, y + RH / 2 - 8);
        ctx.textAlign = "left";
      }
    });

    // Progress bar.
    ctx.fillStyle = "rgba(255,255,255,.1)";
    ctx.fillRect(X0, 700, CW * 4, 3);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(X0, 700, CW * 4 * (time / DURATION), 3);
  },
};

