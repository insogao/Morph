import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import type { Vec2 } from "../../packages/morph-engine/src/vector/geom";
import { morphShapes } from "../../packages/morph-engine/src/vector/morph";
import { circle, compound, polygon, shapeFromRings, type Shape } from "../../packages/morph-engine/src/vector/shape";
import { fillFrame, mixColor, strokeFrame } from "../../packages/morph-engine/src/vector/render";
import { bounceOffset, ease, type Bounce } from "../../packages/morph-engine/src/vector/timeline";
import { layoutText, morphWords, staggered, type GlyphSet, type SlotMorph } from "../../packages/morph-engine/src/vector/text";
import set from "./glyphs.json";

/*
 * STORM → SUNNY → ☀ (sun icon), letter by letter.
 *
 * Step 1 (word → word): S is kept and slides; T→U, O→N, R→N, M→Y swap left to right while
 * the rain thins out and the slate sky warms to cream.
 * Step 2 (word → icon): the middle N rounds into the sun's disc; each of the other four
 * letters splits into the two rays nearest to it (S → left rays, U → upper-left + top,
 * N → upper-right + right, Y → lower-right + bottom), so every ray has a visible source.
 * The rays then turn slowly: the sun is "on".
 * Outlines: Inter 800 (OFL-1.1), extracted by tools/glyphs.mjs.
 */

const glyphs = set as GlyphSet;
const AT: Vec2 = [640, 340];
const STORM = layoutText(glyphs, "STORM", { at: AT, size: 176, tracking: 0.08 });
const SUNNY = layoutText(glyphs, "SUNNY", { at: AT, size: 176, tracking: 0.08 });

// ---- The sun icon, drawn by hand: a disc and eight tapered rays. ----
const DISC_R = 92, RAY_R0 = 122, RAY_R1 = 196, RAY_W0 = 38, RAY_W1 = 20;
function ray(deg: number): Shape {
  const a = deg * Math.PI / 180, d: Vec2 = [Math.sin(a), -Math.cos(a)], n: Vec2 = [-d[1], d[0]];
  const at = (r: number, w: number, side: number): Vec2 => [AT[0] + d[0] * r + n[0] * w / 2 * side, AT[1] + d[1] * r + n[1] * w / 2 * side];
  return polygon([at(RAY_R0, RAY_W0, -1), at(RAY_R1, RAY_W1, -1), at(RAY_R1, RAY_W1, 1), at(RAY_R0, RAY_W0, 1)]);
}
const DISC = shapeFromRings([circle(AT, DISC_R, 128)]);
// Angles clockwise from 12 o'clock. Each letter feeds the two rays on its side of the sun.
const SUN_PARTS: Shape[] = [
  compound(ray(225), ray(270)), // S → lower-left, left
  compound(ray(315), ray(0)),   // U → upper-left, top
  DISC,                         // N (middle) → disc
  compound(ray(45), ray(90)),   // N → upper-right, right
  compound(ray(135), ray(180)), // Y → lower-right, bottom
];
const SUN_ORDER = [1, 0.5, 0, 0.5, 1]; // the disc forms first, then rays spread outward

// R → N self-intersects mid-way unless the top-left corners are pinned together (selfHits 2 → 0).
const STEP1: SlotMorph[] = morphWords(STORM, SUNNY).map(s => s.from?.ch === "R" && s.to
  ? { ...s, morph: morphShapes(s.from.shape, s.to.shape, { vanish: "partner", pins: [{ a: { corner: 0 }, b: { corner: 0 } }] }) }
  : s);
const STEP2: SlotMorph[] = SUNNY.map((from, i) => ({
  kind: "swap" as const,
  from,
  to: { ch: i === 2 ? "●" : "✶", shape: SUN_PARTS[i], center: AT, x: AT[0], width: 0, baseline: AT[1] },
  morph: morphShapes(from.shape, SUN_PARTS[i], { vanish: "partner" }),
  order: SUN_ORDER[i],
}));

const HOLD0 = 1.0, M1 = 1.6, H1 = 1.2, M2 = 1.8, H2 = 2.4;
const T1 = HOLD0, T2 = HOLD0 + M1 + H1;
const DURATION = T2 + M2 + H2;
const STAGGER1 = 0.4, STAGGER2 = 0.35;
const BOUNCE: Bounce = { amplitude: 9, frequency: 2.4, decay: 6 };

const SKY_STORM = "#232b38", SKY_SUN = "#fdf0d2";
const INK_STORM = "#d9e0ea", INK_SUN = "#ff8a1f", SUN_COLOR = "#ffae17";
const ECHO = "#ff5a36";
// Slate → cream straight through OKLab passes a dead grey; route it through a dawn blue and a peach.
const SKY_STOPS = [SKY_STORM, "#3f5a8c", "#f4b98a", SKY_SUN];
function skyAt(t: number): string {
  const x = clamp01(t) * (SKY_STOPS.length - 1), i = Math.min(SKY_STOPS.length - 2, Math.floor(x));
  return mixColor(SKY_STOPS[i], SKY_STOPS[i + 1], x - i);
}
// Letters likewise: cold grey → a saturated amber midpoint → orange.
const inkAt = (t: number) => t < 0.5 ? mixColor(INK_STORM, "#ffc14d", t * 2) : mixColor("#ffc14d", INK_SUN, t * 2 - 1);

function slotProgress(slot: SlotMorph, local: number, dur: number, stagger: number): { p: number; phase: number } {
  if (local <= 0) return { p: 0, phase: 0 };
  const phase = staggered(Math.min(1, local / dur), slot.order, stagger);
  const arrive = (slot.order * stagger + (1 - stagger)) * dur;
  return { p: ease("in", phase) + (local > arrive ? bounceOffset(BOUNCE, local - arrive) : 0), phase };
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

/** Deterministic rain: a pure function of time, thinning out as the storm clears. */
function drawRain(ctx: CanvasRenderingContext2D, time: number, amount: number) {
  if (amount <= 0.01) return;
  ctx.strokeStyle = "rgba(200,214,235," + (0.5 * amount).toFixed(3) + ")";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  const N = 90;
  for (let i = 0; i < N; i++) {
    if (i / N > amount) continue; // drops disappear one by one, not all at once
    const seed = Math.sin(i * 127.1) * 43758.5453, r = seed - Math.floor(seed);
    const speed = 900 + r * 500, len = 26 + r * 22;
    const y = ((r * 720 + time * speed) % 820) - 60;
    const x = ((i * 97.3 + r * 60) % 1400) - 60 - y * 0.25;
    ctx.moveTo(x, y);
    ctx.lineTo(x - len * 0.25, y + len);
  }
  ctx.stroke();
}

const TAG: Record<string, string> = { keep: "KEEP", swap: "SWAP", born: "BORN", vanish: "VANISH" };

export const scene: MorphScene = {
  id: "bt-storm-sunny",
  title: "MM91 · STORM → SUNNY → 太阳",
  duration: DURATION,
  draw(ctx, time) {
    const l1 = time - T1, l2 = time - T2;
    const inStep2 = l2 > 0;
    const slots = inStep2 ? STEP2 : STEP1;
    const local = inStep2 ? l2 : l1;
    const dur = inStep2 ? M2 : M1, stagger = inStep2 ? STAGGER2 : STAGGER1;
    const states = slots.map(slot => {
      const { p, phase } = slotProgress(slot, local, dur, stagger);
      return { slot, p, phase, frame: slot.morph.at(p) };
    });

    // Sky: the storm clears with the letter wave (global progress of step 1).
    const clear = smooth(l1 / M1);
    ctx.fillStyle = skyAt(clear);
    ctx.fillRect(0, 0, 1280, 720);
    drawRain(ctx, time, 1 - smooth(l1 / (M1 * 0.8)));

    // Payoff: a soft warm halo grows once the disc has formed, then the rays turn slowly.
    const lit = smooth((l2 - M2 * 0.4) / (M2 * 0.8));
    if (lit > 0) {
      const g = ctx.createRadialGradient(AT[0], AT[1], DISC_R * 0.8, AT[0], AT[1], 330);
      g.addColorStop(0, "rgba(255,190,60," + (0.32 * lit).toFixed(3) + ")");
      g.addColorStop(1, "rgba(255,190,60,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1280, 720);
    }
    const spinT = Math.max(0, l2 - M2 - 0.35);
    const spin = 0.22 * (spinT - (1 - Math.exp(-2 * spinT)) / 2); // starts from rest, then a steady slow turn

    const colorOf = (s: (typeof states)[number]) => {
      if (inStep2) return mixColor(INK_SUN, SUN_COLOR, clamp01(s.p));
      return inkAt(clamp01(s.p));
    };

    const drawAll = (pass: "shadow" | "echo" | "fill") => {
      for (const s of states) {
        const rotating = inStep2 && s.slot.order !== 0 && spin > 0;
        ctx.save();
        // The shadow offset is applied outside the spin so the light stays fixed while rays turn.
        if (pass === "shadow") ctx.translate(7, 9);
        if (rotating) { ctx.translate(AT[0], AT[1]); ctx.rotate(spin); ctx.translate(-AT[0], -AT[1]); }
        if (pass === "shadow") {
          fillFrame(ctx, s.frame, mixColor("#0c1018", "#c98a4a", clear));
        } else if (pass === "echo") {
          if (s.phase > 0 && s.phase < 1) for (let e = 5; e >= 1; e--) {
            const past = slotProgress(s.slot, Math.max(0, local - e * 0.03), dur, stagger).p;
            ctx.globalAlpha = 0.5 * (1 - e / 6);
            strokeFrame(ctx, s.slot.morph.at(past), ECHO, 1.4);
          }
          ctx.globalAlpha = 1;
        } else {
          fillFrame(ctx, s.frame, colorOf(s));
        }
        ctx.restore();
      }
    };
    drawAll("shadow");
    drawAll("echo");
    drawAll("fill");

    // Pairing tags under the target letters while step 1 runs.
    if (!inStep2 && l1 > 0) {
      ctx.font = "700 13px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "center";
      const a = Math.sin(Math.PI * clamp01(l1 / (M1 + H1 * 0.7)));
      for (const { slot } of states) {
        if (!slot.to) continue;
        ctx.globalAlpha = a;
        ctx.fillStyle = slot.kind === "keep" ? "#1d2330" : "rgba(29,35,48,.6)";
        ctx.fillText(TAG[slot.kind] + (slot.from && slot.kind !== "keep" ? " " + slot.from.ch + "→" + slot.to.ch : ""), slot.to.center[0], AT[1] + 150);
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";
    }

    // Frame furniture.
    const hud = mixColor("#c9d1dd", "#3a3226", clear);
    ctx.font = "600 13px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = hud;
    ctx.globalAlpha = 0.7;
    ctx.fillText("MORPH MASTER · WEATHER", 48, 52);
    ctx.textAlign = "right";
    ctx.fillText(time.toFixed(2).padStart(5, "0") + " s", 1232, 52);
    ctx.textAlign = "left";
    const names = ["STORM", "SUNNY", "SUN ☀"];
    const stage = inStep2 ? 2 : l1 > 0 ? 1 : 0;
    names.forEach((n, i) => {
      ctx.globalAlpha = i <= stage ? 0.9 : 0.35;
      ctx.fillStyle = i === stage && stage > 0 ? ECHO : hud;
      ctx.fillText(n, 48 + i * 104, 668);
    });
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = hud;
    ctx.fillRect(48, 684, 1184, 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = ECHO;
    ctx.fillRect(48, 684, 1184 * time / DURATION, 2);
  },
};
