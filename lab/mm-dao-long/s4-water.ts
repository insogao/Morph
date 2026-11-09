import { liquidPath, type LiquidMass } from "../../packages/morph-engine/src/effects/liquid";
import { drawLine, drawTaiji, lines, taijiTurn, zoom, type Line } from "../mm-dao/scene";
import { CREAM, INK, TAU, clamp, fillShape, glyphAt, heavy, lerp, pathOf, rng, smooth, span, type V } from "./common";

/*
 * 第八章 (beats 123–147): 上善若水。水善利万物而不争，处众人之所恶，故几于道。
 *   The 384 lines of the hexagram ring fall like rain. The light half of the taiji melts — flat liquid (the user's
 *   preferred goo look) — and drips down into a pool. Drops fall into it on the beat; each one joins the water
 *   without a fight (the liquid field merges them) and rings spread. The camera tilts down to the low place
 *   (处众人之所恶): the water fills the frame's lower half, and 道 rises out of it, its reflection trembling.
 */
export const S4 = 123, MM76_AT_S4 = 43.9;             // MM76's beat when this chapter starts
const W0: V = [0, -12];                               // MM76's world origin on screen
const POOL = 318;                                     // the pool's surface (screen, before the tilt)
const TILT = 262;                                     // how far the camera tilts down
const G = 900;                                        // gravity, px / beat²

// the falling lines: the ring as it stood when the chapter began, each released at its own moment
let ring: Array<{ l: Line; release: number; spin: number }> | null = null;
function ringLines() {
  if (ring) return ring;
  const z = zoom(MM76_AT_S4), r = rng(42);
  ring = lines(MM76_AT_S4).map(l => ({ l: { ...l, x: W0[0] + l.x * z, y: W0[1] + l.y * z, w: l.w * z, h: l.h * z }, release: S4 + 0.25 + r() * 3.4, spin: (r() - 0.5) * 2 }));
  return ring;
}
// the taiji, frozen where it stopped turning; its light half sampled into liquid masses
const R = 1060 * zoom(MM76_AT_S4);
const MELT = S4 + 2;
const ROT = taijiTurn(MM76_AT_S4 + (MELT - S4));
function yang([x, y]: V) {
  const c = Math.cos(-ROT), s = Math.sin(-ROT), lx = c * x - s * y, ly = s * x + c * y;
  if (Math.hypot(lx, ly) > R) return false;
  const top = Math.hypot(lx, ly + R / 2), bottom = Math.hypot(lx, ly - R / 2);
  if (top < R / 7) return true;                            // light dot in the dark head
  if (bottom < R / 7) return false;                        // dark dot in the light head
  if (bottom < R / 2) return true;
  if (top < R / 2) return false;
  return lx > 0;
}
const DROPS = (() => {
  const out: Array<{ x: number; y: number; release: number; spread: number }> = [], r = rng(8), step = 15;
  for (let y = -R; y <= R; y += step) for (let x = -R; x <= R; x += step) {
    const p: V = [x + (r() - 0.5) * 5, y + (r() - 0.5) * 5];
    if (!yang(p)) continue;
    // the bottom gives way first, the top last
    out.push({ x: W0[0] + p[0], y: W0[1] + p[1], release: MELT + (1 - (p[1] + R) / (2 * R)) * 2.6 + r() * 0.35, spread: 1.2 + r() * 1.3 });
  }
  return out;
})();
const BEAT_DROPS = [{ at: 128, x: -210 }, { at: 129, x: 140 }, { at: 130, x: -40 }, { at: 131, x: 250 }, { at: 140.5, x: 70 }];

function masses(b: number): LiquidMass[] {
  const out: LiquidMass[] = [];
  for (const d of DROPS) {
    const a = Math.max(0, b - d.release), fallY = d.y + 0.5 * G * 0.35 * a * a, land = fallY >= POOL;
    if (!land) { out.push({ x: d.x, y: fallY, radiusX: 19, radiusY: 19 + Math.min(8, a * 12) }); continue; }
    // landed: spread sideways and flatten into the pool
    const tl = Math.sqrt(2 * (POOL - d.y) / (G * 0.35)), after = clamp((a - tl) / 3);
    out.push({ x: d.x * lerp(1, d.spread, Math.sqrt(after)), y: POOL + 4 + 14 * smooth(after), radiusX: lerp(19, 34, after), radiusY: lerp(19, 13, after) });
  }
  for (const d of BEAT_DROPS) {
    // fall from above the frame and land exactly on the beat
    const h = POOL + 420, t0 = d.at - Math.sqrt(2 * h / G);
    if (b < t0) continue;
    const y = -420 + 0.5 * G * (b - t0) ** 2;
    if (y < POOL) out.push({ x: d.x, y, radiusX: 13, radiusY: 17 });
  }
  return out;
}

const dao = glyphAt(heavy, "道", [0, 148], 210);
export function drawS4(ctx: CanvasRenderingContext2D, b: number) {
  ctx.fillStyle = INK; ctx.fillRect(-700, -400, 1400, 800);
  const tilt = TILT * smooth(span(b, 132.2, 135.4));
  ctx.save(); ctx.translate(0, -tilt);
  // rain: the ring's lines
  ctx.fillStyle = CREAM;
  for (const { l, release, spin } of ringLines()) {
    const a = Math.max(0, b - release), y = l.y + 0.5 * G * a * a;
    if (y > POOL + 40) continue;
    drawLine(ctx, { ...l, y, rot: l.rot + spin * a, alpha: 1 - clamp((y - POOL + 20) / 40) });
  }
  // the taiji: whole until it melts (its outline fades as the light half lets go)
  if (b < MELT + 0.6) {
    ctx.save(); ctx.translate(W0[0], W0[1]); ctx.globalAlpha = 1 - smooth(span(b, MELT, MELT + 0.6));
    drawTaiji(ctx, R, b < MELT ? taijiTurn(MM76_AT_S4 + (b - S4)) : ROT, 1); ctx.restore(); ctx.globalAlpha = 1;
  }
  // the water: melted light, drops, and the pool body below the surface
  if (b >= MELT) {
    ctx.fillStyle = CREAM;
    const fill = smooth(span(b, MELT + 1.4, MELT + 4));
    if (fill > 0) ctx.fillRect(-700, lerp(370, POOL + 8, fill), 1400, 800);
    ctx.globalAlpha = b < MELT + 0.6 ? smooth(span(b, MELT, MELT + 0.6)) : 1;
    ctx.fill(liquidPath(masses(b), { cellSize: 4 }));
    ctx.globalAlpha = 1;
    // rings where the beat drops land
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
    for (const d of BEAT_DROPS) {
      const age = b - d.at;
      if (age < 0 || age > 3) continue;
      for (const lag of [0, 0.35]) {
        const a2 = age - lag; if (a2 <= 0) continue;
        ctx.globalAlpha = 0.55 * (1 - a2 / 3); ctx.beginPath(); ctx.ellipse(d.x, POOL + 24 + a2 * 6, 30 + a2 * 120, 6 + a2 * 16, 0, 0, TAU); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  // 道 rises out of the water; its reflection (dark in the light water) trembles with the last drop's rings
  if (b > 136.6) {
    const rise = smooth(span(b, 137, 139.6)), dy = (1 - rise) * 300, fade = 1 - smooth(span(b, 145.4, 146.8));
    ctx.save(); ctx.beginPath(); ctx.rect(-700, -800, 1400, 800 + POOL); ctx.clip();
    ctx.translate(0, dy); fillShape(ctx, dao, CREAM, fade); ctx.restore();
    const age = b - BEAT_DROPS[4].at;
    for (let d = 0; d < 300; d += 5) {
      const off = age > 0 && age < 4 ? 8 * Math.exp(-age * 0.8) * Math.sin(d / 8 - age * 6) : 0;
      ctx.save(); ctx.beginPath(); ctx.rect(-700, POOL + 8 + d, 1400, 5.4); ctx.clip();
      ctx.globalAlpha = fade * 0.42 * (1 - d / 300) * rise;
      ctx.translate(off, 2 * (POOL + 8) - dy); ctx.scale(1, -1); ctx.fillStyle = INK; ctx.fill(pathOf(dao), "evenodd");
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  // fade to dark at the end of the chapter
  const end = smooth(span(b, 145.6, 147));
  if (end > 0) { ctx.fillStyle = INK; ctx.globalAlpha = end; ctx.fillRect(-700, -400, 1400, 800); ctx.globalAlpha = 1; }
}

export const prewarmS4 = () => { ringLines(); };
