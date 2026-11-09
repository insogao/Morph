import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import { bounds, type Vec2 } from "../../packages/morph-engine/src/vector/geom";
import type { Frame } from "../../packages/morph-engine/src/vector/morph";
import { fit } from "../../packages/morph-engine/src/vector/shape";
import { fillFrame, strokeFrame } from "../../packages/morph-engine/src/vector/render";
import { bounceOffset, ease, type Bounce } from "../../packages/morph-engine/src/vector/timeline";
import { iconSlot, layoutText, morphWords, staggered, type GlyphSet, type Slot, type SlotMorph } from "../../packages/morph-engine/src/vector/text";
import set from "./glyphs.json";
import * as S from "../../fixtures/s0/shapes";

/*
 * Word morph — MORPH → MASTER → 变形 → ✱ → MORPH, glyph by glyph.
 *
 * - Slots are aligned by edit distance: the same letter slides (KEEP), a different one
 *   turns into its partner (SWAP), and extras are born from / vanish into the nearest partner.
 * - Each glyph sits on a keycap tile that resizes to the new glyph and squashes while moving.
 * - Slots start left to right (stagger); each slams in and rings out with its own bounce.
 * - Moving glyphs leave a short accent-coloured echo.
 * Outlines: Inter 800 and Noto Sans SC 900 (OFL-1.1), extracted by tools/glyphs.mjs.
 */

const glyphs = set as GlyphSet;
const AT: Vec2 = [640, 330];
const LINES: Slot[][] = [
  layoutText(glyphs, "MORPH", { at: AT, size: 168, tracking: 0.16 }),
  layoutText(glyphs, "MASTER", { at: AT, size: 150, tracking: 0.16 }),
  layoutText(glyphs, "变形", { at: AT, size: 196, tracking: 0.22 }),
  [iconSlot(fit(S.star8, AT, 196), "✱")],
];
const HOLD0 = 0.6, MORPH = 1.35, HOLD = 0.85, STAGGER = 0.38;
const BOUNCE: Bounce = { amplitude: 10, frequency: 2.6, decay: 6 };
const STEPS = LINES.map((line, i) => morphWords(line, LINES[(i + 1) % LINES.length]));
const DURATION = HOLD0 + STEPS.length * (MORPH + HOLD);

const PAPER = "#efe8dc", INK = "#17171b", ACCENT = "#ff4f2e", CAP = "#232329";

function stepAt(time: number) {
  const t = Math.max(0, time - HOLD0);
  const k = Math.min(STEPS.length - 1, Math.floor(t / (MORPH + HOLD)));
  return { k, local: t - k * (MORPH + HOLD) };
}

/** Per-slot progress: staggered start, ease-in arrival, then an inertial bounce. */
function slotProgress(slot: SlotMorph, local: number): { p: number; phase: number } {
  const phase = staggered(Math.min(1, local / MORPH), slot.order, STAGGER);
  const arrive = (slot.order * STAGGER + (1 - STAGGER)) * MORPH;
  return { p: ease("in", phase) + (local > arrive ? bounceOffset(BOUNCE, local - arrive) : 0), phase };
}

type Rect = { x0: number; y0: number; x1: number; y1: number };
const PAD = 22;
const boxOf = (slot: Slot): Rect => {
  const b = bounds(slot.shape.pieces.map(p => p.outer));
  return { x0: b.min[0] - PAD, y0: AT[1] - 128, x1: b.max[0] + PAD, y1: AT[1] + 128 };
};

function tileOf(slot: SlotMorph, p: number, phase: number, frame: Frame): Rect | null {
  let r: Rect;
  if (slot.kind === "born" || slot.kind === "vanish") {
    // Born / vanishing slots: the tile follows the glyph's own current box, so it never shows up empty.
    if (!frame.pieces.length) return null;
    const full = boxOf((slot.to ?? slot.from)!);
    const b = bounds(frame.pieces.map(q => q.outer));
    const s = (b.max[1] - b.min[1]) / Math.max(1, bounds((slot.to ?? slot.from)!.shape.pieces.map(q => q.outer)).max[1] - bounds((slot.to ?? slot.from)!.shape.pieces.map(q => q.outer)).min[1]);
    const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
    const w = (full.x1 - full.x0) * s, h = (full.y1 - full.y0) * s;
    r = { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 };
  } else {
    const a = boxOf(slot.from!), b = boxOf(slot.to!);
    const lerp = (x: number, y: number) => x + (y - x) * Math.max(-0.2, Math.min(1.2, p));
    r = { x0: lerp(a.x0, b.x0), y0: lerp(a.y0, b.y0), x1: lerp(a.x1, b.x1), y1: lerp(a.y1, b.y1) };
  }
  // Squash while moving: wider and shorter at mid-flight.
  const swing = Math.sin(Math.PI * Math.max(0, Math.min(1, phase)));
  const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2, w = (r.x1 - r.x0) * (1 + 0.1 * swing), h = (r.y1 - r.y0) * (1 - 0.14 * swing);
  return { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 };
}

function centerOf(frame: Frame): Vec2 {
  if (!frame.pieces.length) return AT;
  const b = bounds(frame.pieces.map(p => p.outer));
  return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
}

function roundRect(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  const w = r.x1 - r.x0, h = r.y1 - r.y0;
  if (w < 1 || h < 1) return;
  ctx.beginPath();
  ctx.roundRect(r.x0, r.y0, w, h, Math.min(radius, w / 2, h / 2));
}

const TAG: Record<string, string> = { keep: "KEEP", swap: "SWAP", born: "BORN", vanish: "" };

export const scene: MorphScene = {
  id: "mm-word",
  title: "MM03 · 文字逐字形变（M2）",
  duration: DURATION,
  draw(ctx, time) {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, 1280, 720);
    const { k, local } = stepAt(time);
    const holding = time < HOLD0;
    const slots = STEPS[k];

    const states = slots.map(slot => {
      const { p, phase } = holding ? { p: 0, phase: 0 } : slotProgress(slot, local);
      return { slot, p, phase, frame: slot.morph.at(p) };
    });

    // Tiles (keycaps) with a flat drop shadow.
    for (const { slot, p, phase, frame } of states) {
      const r = tileOf(slot, p, phase, frame);
      if (!r) continue;
      ctx.fillStyle = "rgba(23,23,27,.18)";
      roundRect(ctx, { x0: r.x0 + 8, y0: r.y0 + 10, x1: r.x1 + 8, y1: r.y1 + 10 }, 26);
      ctx.fill();
      ctx.fillStyle = CAP;
      roundRect(ctx, r, 26);
      ctx.fill();
    }

    // Echo: recent outlines of glyphs that are moving.
    if (!holding) for (const { slot, phase } of states) {
      if (phase <= 0 || phase >= 1) continue;
      for (let e = 5; e >= 1; e--) {
        const past = slotProgress(slot, Math.max(0, local - e * 0.03)).p;
        ctx.globalAlpha = 0.55 * (1 - e / 6);
        strokeFrame(ctx, slot.morph.at(past), ACCENT, 1.4);
      }
      ctx.globalAlpha = 1;
    }
    for (const { frame } of states) fillFrame(ctx, frame, PAPER);

    // Pairing tags under the target slots, shown while a transition runs.
    ctx.font = "700 12px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    if (!holding) for (const { slot, phase } of states) {
      if (!slot.to || !TAG[slot.kind]) continue;
      const a = Math.sin(Math.PI * Math.max(0, Math.min(1, local / (MORPH + HOLD * 0.6))));
      ctx.globalAlpha = a;
      ctx.fillStyle = slot.kind === "keep" ? INK : slot.kind === "born" ? ACCENT : "rgba(23,23,27,.55)";
      ctx.fillText(TAG[slot.kind] + (slot.from && slot.kind !== "keep" ? " " + slot.from.ch + "→" + slot.to.ch : ""), slot.to.center[0], AT[1] + 160);
      ctx.globalAlpha = 1;
      void phase;
    }
    ctx.textAlign = "left";

    // Frame furniture.
    ctx.font = "600 13px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "rgba(23,23,27,.6)";
    ctx.fillText("MORPH MASTER · TEXT", 48, 52);
    ctx.textAlign = "right";
    ctx.fillText(time.toFixed(2).padStart(5, "0") + " s", 1232, 52);
    ctx.textAlign = "left";
    const names = ["MORPH", "MASTER", "变形", "✱", "MORPH"];
    names.forEach((n, i) => {
      ctx.fillStyle = i === k + 1 && !holding ? ACCENT : i <= k ? INK : "rgba(23,23,27,.35)";
      ctx.fillText(n, 48 + i * 104, 668);
    });
    ctx.fillStyle = "rgba(23,23,27,.12)";
    ctx.fillRect(48, 684, 1184, 2);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(48, 684, 1184 * time / DURATION, 2);
  },
};
