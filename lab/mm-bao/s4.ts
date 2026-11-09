import { mapShape, type Shape } from "../../packages/morph-engine/src/vector/shape";
import { CREAM, INK, P1, P2, TAU, box, clamp, fillSlots, glyphFoot, heavy, lazyFieldMorph, lerp, outBack, pathOf, ringsPath, smooth, span, uiText, type V } from "./common";

/*
 * The clear: a cream iris opens from the hug; 抱 flies to the middle of the card and lands. The two lines of the
 * proverb come up — 一个人走得快 / 两个人走得远 (alone you go fast, together you go far) — and at the end the hug lets
 * go: 抱 divides back into 包 包, the title in reverse, and they hop on the last beats.
 */
export const IRIS: V = [72, 73.4];
const BIG = 330, Y0 = 40;
const HUG_BIG = glyphFoot(heavy, "抱", [0, Y0], BIG), HB = box(HUG_BIG), SPLIT = HB.x0 + 0.33 * (HB.x1 - HB.x0);
const BAO2 = (x: number) => mapShape(glyphFoot(heavy, "包", [0, 0], 210), ([a, b]) => [a + x, b + Y0]);
const PAIR: Shape = { pieces: [...BAO2(-125).pieces, ...BAO2(125).pieces] } as Shape;
const part = lazyFieldMorph(() => HUG_BIG, () => PAIR, [0, Y0 - 150], 300, 320);
export const PART = 88;
const L1 = uiText("一个人走得快", [0, 150], 30, 0.3), L2 = uiText("两个人走得远", [0, 200], 30, 0.3);
const CLEAR = uiText("双人通关", [0, -262], 20, 0.5), END = uiText("完", [0, 300], 18, 0.5);

/** Where the hug is on screen at the iris (passed in), so the card's 抱 starts from there. */
export function drawCard(ctx: CanvasRenderingContext2D, b: number, from: { x: number; y: number; s: number }) {
  ctx.fillStyle = CREAM; ctx.fillRect(-700, -400, 1400, 800);
  const fly = smooth(span(b, IRIS[0] + 0.4, IRIS[1] + 1.2));
  const land = Math.sin(Math.PI * span(b, IRIS[1] + 1.1, IRIS[1] + 1.6)) * (b > IRIS[1] + 1.1 ? 1 : 0);
  const s = lerp(from.s, 1, fly), x = lerp(from.x, 0, fly), y = lerp(from.y - Y0 * from.s, 0, fly);
  const sq = 1 - 0.16 * land;
  const g = ctx.createLinearGradient(HB.x0, 0, HB.x1, 0);
  const w = b < PART ? 0.005 : lerp(0.005, 0.5, smooth(span(b, PART + 0.6, PART + 1.6)));
  g.addColorStop(0, P1); g.addColorStop(clamp((SPLIT - HB.x0) / (HB.x1 - HB.x0) - w), P1); g.addColorStop(clamp((SPLIT - HB.x0) / (HB.x1 - HB.x0) + w), P2); g.addColorStop(1, P2);
  ctx.save(); ctx.translate(x, y + Y0 * s); ctx.scale(s / Math.sqrt(sq), s * sq); ctx.translate(0, -Y0);
  if (b < PART) { ctx.fillStyle = g; ctx.fill(pathOf(HUG_BIG), "evenodd"); }
  else {
    const u = smooth(span(b, PART, PART + 1.4)), rings = part(u);
    // after parting, the two hop on the beat (alternating)
    if (u >= 1) {
      for (const [i, cx] of [[0, -125], [1, 125]] as const) {
        const ph = (b - (PART + 1.4) - i * 0.5), h = ph > 0 ? 40 * Math.abs(Math.sin(Math.PI * ph)) : 0;
        ctx.save(); ctx.beginPath(); ctx.rect(i ? 0 : -500, -500, 500, 1000); ctx.clip(); ctx.translate(0, -h);
        ctx.fillStyle = i ? P2 : P1; ctx.fill(pathOf(PAIR), "evenodd"); ctx.restore();
        void cx;
      }
    } else { ctx.fillStyle = g; ctx.fill(ringsPath(rings), "evenodd"); }
  }
  ctx.restore();
  fillSlots(ctx, L1, INK, smooth(span(b, 76, 76.8)));
  fillSlots(ctx, L2, INK, smooth(span(b, 78, 78.8)));
  fillSlots(ctx, CLEAR, INK, 0.6 * smooth(span(b, 80, 81)));
  fillSlots(ctx, END, INK, 0.6 * smooth(span(b, 92, 93)));
}
/** The iris: a cream disc opening from the hug (screen coords). */
export function drawIris(ctx: CanvasRenderingContext2D, b: number, at: { x: number; y: number }, card: () => void) {
  const u = span(b, IRIS[0], IRIS[1]); if (u <= 0) return;
  const r = 1500 * u * u + 2;
  ctx.save(); ctx.beginPath(); ctx.arc(at.x, at.y, r, 0, TAU); ctx.clip(); card(); ctx.restore();
}
export const prewarm4 = () => { part(0.5); };
