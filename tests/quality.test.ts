import { test } from "node:test";
import assert from "node:assert/strict";
import { frameStats, qualityFlags } from "../packages/morph-engine/src/vector/quality";
import { mixColor, colorDistance } from "../packages/morph-engine/src/vector/render";

const W = 160, H = 90;
/** A frame: flat background with a filled disc of one colour and radius (0 = no disc). */
function frame(bg: [number, number, number], fg: [number, number, number], r: number, fillAll = false) {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const inside = fillAll || Math.hypot(x - W / 2, y - H / 2) < r, c = inside ? fg : bg, i = (y * W + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  return frameStats(d, W, H);
}
const run = (fn: (u: number) => ReturnType<typeof frameStats>) => {
  const times: number[] = [], stats = [];
  for (let k = 0; k <= 60; k++) { const t = k / 12, u = Math.max(0, Math.min(1, (t - 1.5) / 2)); times.push(t); stats.push(fn(u)); }
  return qualityFlags(times, stats).flags.map(f => f.kind);
};
const BG: [number, number, number] = [240, 236, 228];

test("qc: a clean colour change between two vivid colours raises nothing", () => {
  const hex = (u: number) => mixColor("#3d5a80", "#e07a5f", u);
  const rgb = (h: string): [number, number, number] => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  assert.deepEqual(run(u => frame(BG, rgb(hex(u)), 25)), []);
});

test("qc: a grey middle is flagged muddy", () => {
  // A real in-between keeps moving (here the disc breathes), so the grey stretch is not a hold.
  assert.deepEqual(run(u => frame(BG, u > 0.2 && u < 0.8 ? [128, 128, 128] : u < 0.5 ? [61, 90, 160] : [224, 100, 60], 22 + 6 * Math.sin(u * 9))), ["muddy"]);
});

test("qc: shrinking away and coming back is flagged vanish", () => {
  assert.deepEqual(run(u => frame(BG, [200, 60, 60], 25 * Math.abs(1 - 2 * u) + 1)), ["vanish"]);
});

test("qc: one foreign colour filling the frame for long is flagged; a short hide moment is not", () => {
  const long = run(u => u > 0.2 && u < 0.8 ? frame(BG, [239, 230, 212], 0, true) : frame(BG, [200, 60, 60], 25));
  assert.ok(long.includes("flat-fill"));
  const times: number[] = [], stats = [];
  for (let k = 0; k <= 60; k++) { const t = k / 12; times.push(t); stats.push(Math.abs(t - 2.5) < 0.12 ? frame(BG, [239, 230, 212], 0, true) : frame(BG, [200, 60, 60], 25)); }
  assert.ok(!qualityFlags(times, stats).flags.some(f => f.kind === "flat-fill"));
});

test("mixColor keeps chroma between far-apart hues (no grey middle)", () => {
  const chroma = (h: string) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); return Math.max(r, g, b) - Math.min(r, g, b); };
  const mid = mixColor("#3d5a80", "#e07a5f", 0.5);
  assert.ok(chroma(mid) > 0.6 * Math.min(chroma("#3d5a80"), chroma("#e07a5f")), mid);
  assert.equal(mixColor("#3d5a80", "#e07a5f", 0), "#3d5a80");
  assert.equal(mixColor("#3d5a80", "#e07a5f", 1), "#e07a5f");
  assert.ok(colorDistance(mixColor("#777777", "#e07a5f", 0.5), "#ab7b6d") < 0.05, "grey ends fall back to OKLab");
});
