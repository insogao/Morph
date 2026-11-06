import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import type { Vec2 } from "../../packages/morph-engine/src/renderers/sdf-gl";
import { clamp, lerp, resample, rng, smooth, win } from "../../packages/morph-engine/src/effects/skeleton";

/*
 * One-line unravel. The cat is a single continuous line. Its tail end is pulled loose;
 * the line runs through the air as one thread and re-draws itself, in the same order,
 * as a deer. At every frame the drawing is still exactly one polyline: the not-yet-pulled
 * part of the cat, the thread in flight, and the part of the deer already drawn.
 */

const N = 640;

function spline(points: Vec2[], per = 10): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([
        .5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        .5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(points.at(-1)!);
  return out;
}
const shift = (pts: number[][], dx: number, dy = 0) => pts.map(([x, y]) => [x + dx, y + dy] as Vec2);

// Sitting cat, one stroke, starting at the tail tip.
const CAT = resample(spline(shift([
  [820, 495], [842, 528], [820, 566], [760, 582], [690, 582], [640, 586], [590, 586], [566, 580], [574, 520], [580, 452],
  [586, 402], [574, 352], [548, 322], [550, 290], [562, 264], [552, 214], [592, 248], [622, 246], [662, 214], [656, 262],
  [668, 296], [682, 342], [718, 420], [736, 500], [722, 556], [700, 578], [670, 560], [655, 520],
], -280, -20)), N);

// Standing deer with antlers, one stroke, starting at a hind hoof.
const DEER = resample(spline(shift([
  [770, 592], [768, 520], [780, 470], [796, 432], [770, 404], [700, 398], [620, 404], [570, 388], [548, 340], [536, 304],
  [544, 282], [566, 240], [552, 200], [574, 232], [602, 214], [606, 172], [618, 214], [584, 252], [548, 288], [514, 296],
  [476, 312], [470, 324], [494, 334], [532, 344], [548, 382], [566, 430], [570, 500], [566, 592], [584, 592], [590, 500],
  [610, 460], [680, 462], [744, 466], [748, 520], [752, 592],
], 250, -20)), N);

const PEEL0 = 1.0, PEEL = 2.2, TRAVEL = 1.25, EASE = .32;

/** The flight curve of the thread: a looping ribbon from the cat's tail tip to the deer's first point. */
function flight(u: number, t: number): Vec2 {
  const a = CAT[0], b = DEER[0];
  const loops = Math.sin(Math.PI * u);
  const ang = u * Math.PI * 2 * 2.5 + t * .6;
  return [
    lerp(a[0], b[0], u) + Math.cos(ang) * 110 * loops,
    lerp(a[1], b[1], u) - 170 * loops + Math.sin(ang) * 80 * loops,
  ];
}

function point(i: number, t: number): { p: Vec2; phase: number } {
  const leave = PEEL0 + PEEL * i / N;
  const land = leave + TRAVEL;
  if (t <= leave) return { p: CAT[i], phase: 0 };
  const sigma = clamp((t - leave) / TRAVEL);
  const onThread = flight(sigma, t);
  if (t < land) {
    const e = smooth((t - leave) / EASE);
    return { p: [lerp(CAT[i][0], onThread[0], e), lerp(CAT[i][1], onThread[1], e)], phase: .5 * sigma };
  }
  const e = smooth((t - land) / EASE);
  const from = flight(1, t);
  return { p: [lerp(from[0], DEER[i][0], e), lerp(from[1], DEER[i][1], e)], phase: .5 + .5 * e };
}

const AMBER = [255, 190, 110], CYAN = [120, 230, 255];
const col = (phase: number, a: number) => `rgba(${AMBER.map((v, k) => Math.round(lerp(v, CYAN[k], phase))).join(",")},${a})`;

function breathe(p: Vec2, t: number): Vec2 {
  const b = win(t, 5.0, 5.6);
  // The finished deer lifts its head: points above the shoulder rotate slightly about the neck base.
  const lift = b * (.06 * Math.sin((t - 5) * 2.2));
  if (p[0] > 860 || p[1] > 420) return p;
  const cx = 820, cy = 400, c = Math.cos(lift), s = Math.sin(lift);
  return [cx + c * (p[0] - cx) - s * (p[1] - cy), cy + s * (p[0] - cx) + c * (p[1] - cy)];
}

const r = rng(3);
const stars = Array.from({ length: 220 }, () => [r() * 1280, r() * 720, r() * 1.2 + .2, r() * 6]);

export const scene: MorphScene = {
  id: "line-cat-deer",
  title: "Lab · 一笔抽丝（猫 → 鹿）",
  duration: 7,
  draw(ctx, t) {
    const g = ctx.createRadialGradient(640, 360, 50, 640, 360, 820);
    g.addColorStop(0, "#151a24"); g.addColorStop(1, "#06070b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1280, 720);
    for (const [x, y, s, p] of stars) {
      ctx.fillStyle = `rgba(200,220,255,${.15 + .15 * Math.sin(t * 1.3 + p)})`;
      ctx.fillRect(x, y, s, s);
    }
    const pts = Array.from({ length: N }, (_, i) => point(i, t));
    const placed = pts.map(({ p, phase }) => ({ p: phase >= 1 ? breathe(p, t) : p, phase }));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation = "lighter";
    const CH = 16;
    for (const [w, a] of [[9, .07], [4, .22], [1.6, .95]] as const) {
      ctx.lineWidth = w;
      for (let k = 0; k < N - 1; k += CH) {
        const end = Math.min(N - 1, k + CH);
        ctx.strokeStyle = col(placed[Math.floor((k + end) / 2)].phase, a);
        ctx.beginPath();
        ctx.moveTo(...placed[k].p);
        for (let i = k + 1; i <= end; i++) ctx.lineTo(...placed[i].p);
        ctx.stroke();
      }
    }
    // Sparks at the pen tip where the thread re-draws.
    const head = clamp((t - PEEL0 - TRAVEL) / PEEL) * N;
    if (head > 0 && head < N - 1) {
      const p = placed[Math.floor(head)].p;
      const s = rng(Math.floor(t * 30));
      for (let k = 0; k < 14; k++) {
        ctx.fillStyle = col(1, .7 * s());
        ctx.beginPath();
        ctx.arc(p[0] + (s() - .5) * 24, p[1] + (s() - .5) * 24, s() * 2 + .5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#c8d6ee88";
    ctx.font = "11px ui-monospace, Menlo, monospace";
    ctx.fillText("LAB  /  ONE-LINE UNRAVEL   猫 → 鹿", 44, 50);
  },
};
