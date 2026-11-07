import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import { fitArt, loadArt, PixelMorph } from "../../packages/morph-engine/src/vector/bitmap-render";
import umbrellaPng from "../../fixtures/s2/umbrella.png?inline";
import octopusPng from "../../fixtures/s2/octopus.png?inline";

/*
 * MM12 — bitmap route, pixel particles: a transparent PNG becomes another (umbrella → octopus).
 * Every particle is a cell of the real image with its real colour. Cells are matched along a
 * Hilbert curve (top-left → top-left …), so the picture's layout survives the flight. The hand-off
 * is local: a cell's pixels vanish exactly when its particle leaves and appear exactly when it lands.
 * Cause: rain hits the canopy; the dissolve sweeps out from where it lands. Arrivals sweep out from
 * the octopus's head with a noisy front, independent of the pairing, so no block edges show.
 */
const [umbrella, octopus] = typeof Image === "undefined" ? [] : await Promise.all([umbrellaPng, octopusPng].map(loadArt));
const AT: [number, number] = [640, 372];
const pa = umbrella && fitArt(umbrella, AT, 500), pb = octopus && fitArt(octopus, AT, 500);
const morph = umbrella && octopus ? new PixelMorph(umbrella, pa!, octopus, pb!, { step: 5, origin: [AT[0], AT[1] - 250], landOrigin: [AT[0], AT[1] - 170], spread: 0.48, flight: 0.44, swirl: 0.5, lift: 90 }) : null;

const RAIN = [0.2, 1.1], MORPH = [1.1, 5.1], END = 6.4;
const BG0 = "#1c2230", BG1 = "#22303a";

function rain(ctx: CanvasRenderingContext2D, t: number) {
  ctx.strokeStyle = "rgba(190,215,235,.55)";
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 26; i++) {
    const x = 470 + ((i * 53) % 340), start = RAIN[0] + (i % 9) * 0.09, u = (t - start) / 0.45;
    if (u <= 0 || u >= 1) continue;
    const y = 40 + u * 120;
    ctx.globalAlpha = 0.7 * Math.sin(Math.PI * u);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 22); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export const scene: MorphScene = {
  id: "mm-pixel-particles",
  title: "MM12 · 位图：像素粒子 雨伞 → 章鱼（M4）",
  duration: END,
  draw(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, 720);
    g.addColorStop(0, BG0); g.addColorStop(1, BG1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1280, 720);
    rain(ctx, t);
    if (!morph) return;
    const u = Math.max(0, Math.min(1, (t - MORPH[0]) / (MORPH[1] - MORPH[0])));
    morph.draw(ctx, u);
    ctx.font = "600 13px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "rgba(220,230,240,.55)";
    ctx.fillText("MORPH MASTER · BITMAP · PIXEL PARTICLES (" + morph.flights.length + " cells)", 48, 52);
    ctx.textAlign = "right";
    ctx.fillText(t.toFixed(2).padStart(5, "0") + " s", 1232, 52);
    ctx.textAlign = "left";
  },
};
