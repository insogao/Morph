import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import { rotate, type Vec2 } from "../../packages/morph-engine/src/vector/geom";
import type { Frame } from "../../packages/morph-engine/src/vector/morph";
import { fit } from "../../packages/morph-engine/src/vector/shape";
import { fillFrame, mixColor, strokeFrame } from "../../packages/morph-engine/src/vector/render";
import { sequence, type Bounce } from "../../packages/morph-engine/src/vector/timeline";
import * as S from "../../fixtures/s0/shapes";

/*
 * Icon loop — ring → Y → 木 → 人 → ring, on the precise vector track.
 *
 * Motion-design grammar, all deterministic functions of time:
 * - each arrival slams in (ease-in) and rings out with an inertial bounce;
 * - while the mark moves, its recent outlines stack behind it into a short extrusion (echo);
 * - a transform channel tilts and squashes the whole mark only during the morph;
 * - colour moves in OKLab; the ring's hole closes into the Y and reopens at the end.
 */

const C: Vec2 = [640, 352];
const H = 300;
const BOUNCE: Bounce = { amplitude: 9, frequency: 2.4, decay: 5.5 };
const STEPS = [
  { shape: S.ring, name: "RING", color: "#ff5b35" },
  { shape: S.glyphY, name: "FORK", color: "#ffc93c" },
  { shape: S.glyphTree, name: "TREE", color: "#35d39a" },
  { shape: S.glyphPerson, name: "WALK", color: "#5b82ff" },
];

const seq = sequence(STEPS.map((s, i) => ({
  shape: fit(s.shape, C, H),
  hold: i === 0 ? 0.55 : 0.75,
  morph: 0.85,
  ease: "in" as const,
  bounce: BOUNCE,
  // Both ends of every pair are mirror-symmetric: pin 12 o'clock to 12 o'clock and 6 to 6
  // so the in-betweens stay symmetric too (without pins the cut point can tilt them).
  options: { vanish: "self" as const, pins: [{ a: { angle: 0 }, b: { angle: 0 } }, { a: { angle: 180 }, b: { angle: 180 } }] },
  data: { name: s.name, color: s.color },
})), true);

const color = (i: number) => (STEPS[i % STEPS.length].color);
const BG = "#101114", PAPER = "#f4f1ea";

/** Whole-mark transform: a tilt and squash that only exist while the shape is moving. */
function stage(frame: Frame, phase: number, step: number): Frame {
  const swing = Math.sin(Math.PI * phase);
  const dir = step % 2 ? 1 : -1;
  const tilt = dir * 0.12 * swing;
  const sx = 1 + 0.07 * swing, sy = 1 - 0.09 * swing;
  const map = (p: Vec2): Vec2 => rotate([C[0] + (p[0] - C[0]) * sx, C[1] + (p[1] - C[1]) * sy], tilt, C);
  return { pieces: frame.pieces.map(p => ({ outer: p.outer.map(map), holes: p.holes.map(h => h.map(map)) })) };
}

function markAt(time: number) {
  const s = seq.at(time);
  const moving = time >= seq.windows[s.step - 1][0] && time <= seq.windows[s.step - 1][1];
  const frame = stage(s.frame, moving ? s.phase : 0, s.step);
  const fill = mixColor(color(s.step - 1), color(s.step), Math.max(0, Math.min(1, s.progress)));
  return { ...s, frame, fill, moving };
}

function grid(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = "rgba(244,241,234,.045)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 40; x < 1280; x += 40) { ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, 720); }
  for (let y = 32; y < 720; y += 40) { ctx.moveTo(0, y + .5); ctx.lineTo(1280, y + .5); }
  ctx.stroke();
  // Registration crosses around the mark.
  ctx.strokeStyle = "rgba(244,241,234,.28)";
  for (const [x, y] of [[440, 172], [840, 172], [440, 532], [840, 532]] as Vec2[]) {
    ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 7); ctx.stroke();
  }
}

function hud(ctx: CanvasRenderingContext2D, time: number, step: number, progress: number, fill: string) {
  ctx.font = "600 13px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillStyle = "rgba(244,241,234,.55)";
  ctx.fillText("MORPH MASTER · VECTOR TRACK", 48, 52);
  ctx.textAlign = "right";
  ctx.fillText(time.toFixed(2).padStart(5, "0") + " s", 1232, 52);
  ctx.textAlign = "left";
  // Step ticks: the arriving step lights up as its morph completes.
  const names = [...STEPS.map(s => s.name), STEPS[0].name];
  names.forEach((name, i) => {
    const x = 48 + i * 112, active = i === step ? Math.max(0, Math.min(1, progress)) : i < step ? 1 : 0;
    ctx.fillStyle = i === step || i === step - 1 ? fill : "rgba(244,241,234,.35)";
    ctx.globalAlpha = i === step ? 0.35 + 0.65 * active : i === step - 1 ? 1 - 0.65 * Math.max(0, Math.min(1, progress)) : 1;
    ctx.fillText(String(i % STEPS.length + 1).padStart(2, "0") + " " + name, x, 676);
    ctx.globalAlpha = 1;
  });
  ctx.fillStyle = "rgba(244,241,234,.12)";
  ctx.fillRect(48, 690, 560, 2);
  ctx.fillStyle = fill;
  ctx.fillRect(48, 690, 560 * Math.min(1, time / seq.duration), 2);
}

export const scene: MorphScene = {
  id: "mm-icon-loop",
  title: "MM02 · 图标循环（M1）",
  duration: seq.duration,
  draw(ctx, time) {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, 1280, 720);
    grid(ctx);
    const now = markAt(time);

    // Echo: earlier outlines, offset down-right, form a short extrusion only while moving.
    const ECHOES = 9;
    for (let k = ECHOES; k >= 1; k--) {
      const past = markAt(Math.max(0, time - k * 0.028));
      const shift = k * 2.2;
      const frame = { pieces: past.frame.pieces.map(p => ({ outer: p.outer.map(([x, y]) => [x + shift, y + shift] as Vec2), holes: p.holes.map(h => h.map(([x, y]) => [x + shift, y + shift] as Vec2)) })) };
      ctx.globalAlpha = 0.5 * (1 - k / (ECHOES + 1));
      strokeFrame(ctx, frame, past.fill, 1.2);
    }
    ctx.globalAlpha = 1;
    // Solid shadow block under the mark (flat motion-graphics depth).
    const shadow = { pieces: now.frame.pieces.map(p => ({ outer: p.outer.map(([x, y]) => [x + 10, y + 10] as Vec2), holes: p.holes.map(h => h.map(([x, y]) => [x + 10, y + 10] as Vec2)) })) };
    fillFrame(ctx, shadow, "rgba(0,0,0,.45)");
    fillFrame(ctx, now.frame, now.fill);
    strokeFrame(ctx, now.frame, PAPER, 1.4);

    hud(ctx, time, now.step, now.progress, now.fill);
  },
};
