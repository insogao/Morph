import { liquidPath, type LiquidMass } from "../../packages/morph-engine/src/effects/liquid";
import { curve } from "../../packages/morph-engine/src/vector/camera-move";
import { CREAM, INK, TAU, clamp, hit, lerp, outQuad, smooth, span, type V } from "./common";

/*
 * 第十一章 (beats 32–80): 三十辐共一毂…埏埴以为器…凿户牖以为室…故有之以为利，无之以为用。
 * Three useful emptinesses, each made with its own effect, handed on through the emptiness itself:
 *   车  thirty spokes fly in and lock into the hub, the rim draws on, the wheel turns — around a hole that does not.
 *   器  the hole is all that stays; it widens and tilts into a vessel's mouth; clay rises around it as flat liquid.
 *       The camera dives over the vessel into its mouth — darkness.
 *   室  the darkness is a wall: a door and two windows are carved out (a cut traces each, then the panel falls away
 *       on its bottom hinge), lattices go in, and the light through them lies on the floor — the lattice in it too.
 *   用  the three emptinesses — the hole, the mouth, the door — side by side, then one circle, then a point.
 */
const W: V = [0, -20];
const SPOKES = 30, HUB = 30, RIM = 238;
const spin = curve([{ t: 35.5, v: 0, d: 0 }, { t: 39, v: 2.2 }, { t: 42, v: 6.0 }, { t: 44, v: 7.4, d: 0.3 }]);

// ——— the vessel: a lathe profile built from liquid masses that rise from a lump ———
const MOUTH: V = [0, -120], MOUTH_R = 118, MOUTH_RY = 32;
const profile = (f: number) => {            // f: 0 base … 1 mouth; radius
  const y = lerp(205, MOUTH[1] + 10, f);
  const r = f < 0.55 ? lerp(112, 196, Math.sin(f / 0.55 * Math.PI / 2)) : lerp(196, MOUTH_R + 4, smooth((f - 0.55) / 0.45));
  return { y, r };
};
const MASSES = 15;
function vesselMasses(b: number): LiquidMass[] {
  const out: LiquidMass[] = [];
  for (let j = 0; j < MASSES; j++) {
    const f = j / (MASSES - 1), { y, r } = profile(f), k = smooth(span(b, 45 + f * 3.2, 47.4 + f * 3.2));
    const g = smooth(span(b, 45, 45.9));                // the lump swells up out of nothing first
    out.push({ x: 0, y: lerp(232, y, k), radiusX: lerp(70 * g, r, k), radiusY: lerp(46 * g, 52, k) });
  }
  return out;
}
let vesselCache: Path2D | null = null;

// ——— the room ———
type Rect = [number, number, number, number];               // x0, y0, x1, y1
const DOOR: Rect = [-62, -42, 62, 232], WIN1: Rect = [-338, -150, -206, -18], WIN2: Rect = [206, -150, 338, -18];
const FLOOR = 232;
function tracePerimeter(ctx: CanvasRenderingContext2D, [x0, y0, x1, y1]: Rect, k: number) {
  const pts: V[] = [[x0, y1], [x0, y0], [x1, y0], [x1, y1], [x0, y1]], len = 2 * (x1 - x0 + y1 - y0);
  let left = len * k;
  ctx.beginPath(); ctx.moveTo(...pts[0]);
  for (let i = 1; i < pts.length && left > 0; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], l = Math.hypot(bx - ax, by - ay), u = Math.min(1, left / l);
    ctx.lineTo(ax + (bx - ax) * u, ay + (by - ay) * u); left -= l;
  }
  ctx.stroke();
}
/** The patch of light an opening throws on the floor (light from high up, outside, falling toward the viewer). */
function patch([x0, y0, x1, y1]: Rect, drift: number): V[] {
  const lean = 0.5 * drift, depth = 0.42;
  const f = (x: number, y: number): V => { const h = FLOOR - y; return [x + h * lean * 0.6, FLOOR + 18 + (y1 - y) * depth + (FLOOR - y1) * 0.12]; };
  return [f(x0, y1), f(x1, y1), f(x1, y0), f(x0, y0)];
}

function circlePts(c: V, rx: number, ry: number, n = 96): V[] { return Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + i / n * TAU; return [c[0] + Math.cos(a) * rx, c[1] + Math.sin(a) * ry]; }); }
function rectPts([x0, y0, x1, y1]: Rect, n = 96): V[] {
  // walk the perimeter from the top middle, clockwise, n points evenly by length
  const P: V[] = [[(x0 + x1) / 2, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0], [(x0 + x1) / 2, y0]];
  const L = P.slice(1).map((p, i) => Math.hypot(p[0] - P[i][0], p[1] - P[i][1])), tot = L.reduce((a, b) => a + b);
  return Array.from({ length: n }, (_, k) => { let d = k / n * tot, i = 0; while (d > L[i]) { d -= L[i]; i++; } const u = d / L[i]; return [lerp(P[i][0], P[i + 1][0], u), lerp(P[i][1], P[i + 1][1], u)]; });
}
const strokePoly = (ctx: CanvasRenderingContext2D, pts: V[]) => { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.stroke(); };
/** Where 第四十二章's point is born (MM76's 一, at its scale, in this frame). */
export const POINT: V = [0, -18];

export function drawS2(ctx: CanvasRenderingContext2D, b: number) {
  ctx.fillStyle = INK; ctx.fillRect(-700, -400, 1400, 800);
  ctx.strokeStyle = CREAM; ctx.fillStyle = CREAM; ctx.lineCap = "butt";

  // ——— 车 ———
  if (b < 44.2) {
    const dim = 1 - 0.62 * smooth(span(b, 38.4, 39.6)), gone = 1 - smooth(span(b, 41.6, 43.2));
    ctx.save(); ctx.translate(W[0], W[1]);
    ctx.save(); ctx.rotate(spin(b));
    for (let i = 0; i < SPOKES; i++) {
      const t0 = 32.3 + i / SPOKES * 2.2, k = hit(span(b, t0, t0 + 1)), a = -Math.PI / 2 + i / SPOKES * TAU, out = (1 - k) * 900;
      if (k <= 0) continue;
      ctx.save(); ctx.rotate(a); ctx.globalAlpha = Math.min(1, k * 3) * dim * gone;
      ctx.fillRect(HUB + 6 + out, -4.5, RIM - HUB - 6, 9); ctx.restore();
    }
    const rim = smooth(span(b, 34.8, 36.2));
    if (rim > 0) { ctx.globalAlpha = dim * gone; ctx.lineWidth = 15; ctx.beginPath(); ctx.arc(0, 0, RIM, -Math.PI / 2, -Math.PI / 2 + rim * TAU); ctx.stroke(); }
    ctx.restore();
    // the hub (it turns too) and the hole in it (which doesn't — it is the empty that makes the wheel work)
    const hub = smooth(span(b, 32, 32.6));
    ctx.globalAlpha = hub * dim * gone; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(0, 0, HUB, 0, TAU); ctx.stroke();
    ctx.restore();
    // the hole: it lights up, stays, widens and tilts into the mouth of a vessel
    const lit = smooth(span(b, 38.6, 39.8));
    if (lit > 0) {
      const g = smooth(span(b, 42.6, 44.2));
      const c: V = [lerp(W[0], MOUTH[0], g), lerp(W[1], MOUTH[1], g)], rx = lerp(HUB - 6, MOUTH_R, g), ry = rx;
      ctx.globalAlpha = lit; ctx.lineWidth = 3; ctx.shadowColor = CREAM; ctx.shadowBlur = 14 * (1 - g);
      ctx.beginPath(); ctx.ellipse(c[0], c[1], rx, ry, 0, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }
  // ——— 器 ———
  if (b >= 44.2 && b < 56) {
    const tilt = smooth(span(b, 44.2, 45.6));
    // the dive: over the vessel and into its mouth (the body folds under the mouth as we look down)
    const dive = hit(span(b, 51.6, 55.4)), z = Math.exp(lerp(0, Math.log(16), dive)), down = lerp(1, 0.25, smooth(span(b, 51.2, 54)));
    ctx.save(); ctx.translate(MOUTH[0], MOUTH[1]); ctx.scale(z, z);
    ctx.save(); ctx.scale(1, down); ctx.translate(-MOUTH[0], -MOUTH[1]);
    if (b >= 45) {
      if (b > 50.8 && !vesselCache) vesselCache = liquidPath(vesselMasses(51), { cellSize: 3 });
      ctx.fill(b > 50.8 ? vesselCache! : liquidPath(vesselMasses(b), { cellSize: 3 }));
    }
    ctx.restore();
    // the mouth: dark inside, cream rim. It tilts (circle → ellipse), then rounds again as we look straight down.
    const look = smooth(span(b, 51.2, 54)), ry = b < 46 ? lerp(MOUTH_R, MOUTH_RY, tilt) : lerp(MOUTH_RY, MOUTH_R, look);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, 0, MOUTH_R, ry, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = CREAM; ctx.lineWidth = 3 / Math.sqrt(z); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = CREAM;
  }
  // ——— 室 ———
  if (b >= 56 && b < 72) {
    const out = 1 - smooth(span(b, 70.2, 71.6));
    const openings: Array<{ r: Rect; cut: number; fall: number; lattice: number }> = [
      { r: DOOR, cut: 56.4, fall: 58, lattice: -1 },
      { r: WIN1, cut: 59, fall: 60.4, lattice: 61.3 }, { r: WIN2, cut: 59.25, fall: 60.65, lattice: 61.55 },
    ];
    const drift = lerp(1, 1.18, span(b, 63, 70)), light = smooth(span(b, 63.4, 65.6));
    ctx.globalAlpha = out;
    // light first (on the floor, under everything): shafts and patches, with the lattice's shadow in the patches
    if (light > 0) for (const o of openings) {
      const p = patch(o.r, drift), [x0, y0, x1, y1] = o.r;
      ctx.globalAlpha = out * light * 0.07; ctx.beginPath();
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.lineTo(p[2][0], p[2][1]); ctx.lineTo(p[1][0], p[1][1]); ctx.lineTo(p[0][0], p[0][1]); ctx.lineTo(x0, y1); ctx.closePath(); ctx.fill();
      ctx.save(); ctx.beginPath(); p.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.clip();
      // the patch wipes in from the opening's side
      const reach = lerp(p[0][1], Math.max(...p.map(q => q[1])) + 2, light);
      ctx.globalAlpha = out * 0.9; ctx.fillRect(-700, -400, 1400, reach + 400);
      if (o.lattice > 0) {
        ctx.fillStyle = INK; ctx.globalAlpha = out;
        for (const u of [1 / 3, 2 / 3]) {
          const ax = lerp(p[0][0], p[1][0], u), bx = lerp(p[3][0], p[2][0], u);
          ctx.beginPath(); ctx.moveTo(ax - 2.5, p[0][1]); ctx.lineTo(ax + 2.5, p[0][1]); ctx.lineTo(bx + 2.5, p[3][1]); ctx.lineTo(bx - 2.5, p[3][1]); ctx.fill();
          const l = [lerp(p[0][0], p[3][0], u), lerp(p[0][1], p[3][1], u)], r = [lerp(p[1][0], p[2][0], u), lerp(p[1][1], p[2][1], u)];
          ctx.beginPath(); ctx.moveTo(l[0], l[1] - 2.2); ctx.lineTo(r[0], r[1] - 2.2); ctx.lineTo(r[0], r[1] + 2.2); ctx.lineTo(l[0], l[1] + 2.2); ctx.fill();
        }
        ctx.fillStyle = CREAM;
      }
      ctx.restore();
    }
    for (const o of openings) {
      const [x0, y0, x1, y1] = o.r, cut = span(b, o.cut, o.cut + 1.4), fall = span(b, o.fall, o.fall + 0.9);
      if (cut <= 0) continue;
      // through the opening: light (cream). The dark panel falls away on its bottom hinge to reveal it.
      if (fall > 0) {
        ctx.globalAlpha = out; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        const f = 1 - outQuad(fall) ** 1.3;
        ctx.fillStyle = INK; ctx.fillRect(x0 + 2, y1 - (y1 - y0 - 2) * f, x1 - x0 - 4, (y1 - y0 - 2) * f); ctx.fillStyle = CREAM;
      }
      // the cut, traced around the opening
      ctx.globalAlpha = out * (1 - smooth(span(b, o.fall + 0.5, o.fall + 1.2))); ctx.lineWidth = 2.5; ctx.strokeStyle = CREAM;
      if (cut < 1 || fall < 1) tracePerimeter(ctx, o.r, outQuad(cut));
      if (o.lattice > 0) {
        const k = smooth(span(b, o.lattice, o.lattice + 0.8)), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        ctx.globalAlpha = out; ctx.fillStyle = INK;
        for (const u of [1 / 3, 2 / 3]) {
          const x = lerp(x0, x1, u), y = lerp(y0, y1, u), h = (y1 - y0) * k, w = (x1 - x0) * k;
          ctx.fillRect(x - 3, cy - h / 2, 6, h); ctx.fillRect(cx - w / 2, y - 3, w, 6);
        }
        ctx.fillStyle = CREAM;
      }
    }
    ctx.globalAlpha = 1;
  }
  // ——— 用: the three emptinesses, then one ———
  if (b >= 70.5) {
    const shapes: Array<{ pts: V[]; at: number }> = [
      { pts: circlePts([-340, -20], 58, 58), at: 70.8 },
      { pts: circlePts([0, -20], 118, 32), at: 71.3 },
      { pts: rectPts([300, -120, 380, 80]), at: 71.8 },
    ];
    const merge = smooth(span(b, 74.6, 77.2)), shrink = hit(span(b, 77.4, 79.6));
    const target = circlePts([POINT[0], lerp(-20, POINT[1], merge)], lerp(46, 4.5, shrink), lerp(46, 4.5, shrink));
    ctx.lineWidth = lerp(2.5, 1.2, shrink); ctx.strokeStyle = CREAM;
    for (const s of shapes) {
      const k = smooth(span(b, s.at, s.at + 1.1));
      if (k <= 0) continue;
      const pts = s.pts.map((p, i) => [lerp(p[0], target[i][0], merge), lerp(p[1], target[i][1], merge)] as V);
      ctx.globalAlpha = k * (1 - 0.4 * merge);
      ctx.save(); ctx.beginPath(); ctx.rect(-700, -400, 1400 * (b < s.at + 1.1 ? k : 1), 800); ctx.clip(); strokePoly(ctx, pts); ctx.restore();
    }
    if (shrink > 0.6) {
      ctx.globalAlpha = clamp((shrink - 0.6) / 0.4); ctx.shadowColor = CREAM; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.arc(POINT[0], POINT[1], 4.5, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }
}
