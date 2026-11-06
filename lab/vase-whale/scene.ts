import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import type { Vec2 } from "../../packages/morph-engine/src/renderers/sdf-gl";
import { centroid, fracture, matchCells, resampleClosed } from "../../packages/morph-engine/src/effects/fracture";
import { clamp, lerp, rng, smooth, smoother, win } from "../../packages/morph-engine/src/effects/skeleton";

/*
 * Shatter → reassemble. A blue-and-white porcelain vase cracks from an impact point,
 * its Voronoi fragments tumble through a vortex, flip over mid-flight, and land as the
 * fragments of a porcelain whale. The front face of every shard carries the vase's
 * painting; the back face carries the whale's. Seams glow, heal, and the whale swims.
 */

const DURATION = 8;
const RING = 22;

function catmull(points: Vec2[], per = 8): Vec2[] {
  const out: Vec2[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([
        .5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        .5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return out;
}

const half: Vec2[] = [[28, 150], [22, 182], [60, 222], [112, 262], [128, 330], [112, 420], [80, 500], [74, 540]];
const VASE = catmull([...half.map(([x, y]) => [640 + x, y + 10] as Vec2), ...[...half].reverse().map(([x, y]) => [640 - x, y + 10] as Vec2)], 6);
const WHALE = catmull([[372, 372], [410, 312], [500, 284], [620, 280], [740, 300], [850, 338], [906, 318], [950, 280], [972, 290], [930, 352],
  [972, 412], [948, 420], [902, 380], [850, 376], [740, 420], [600, 436], [470, 428], [400, 406]], 6);

const cellsA = fracture(VASE, 64, 7);
const cellsB = fracture(WHALE, 64, 19);
const match = matchCells(cellsA, cellsB);
const IMPACT: Vec2 = [736, 268];

type Piece = { ringA: Vec2[]; ringB: Vec2[]; cA: Vec2; cB: Vec2; depart: number; arrive: number; spin: number; turns: number; seed: number };
const rand = rng(23);
const pieces: Piece[] = [];
const usedB = new Set<number>();
cellsA.forEach((cell, i) => {
  let j = match[i];
  if (j < 0) {
    // Extra fragment: fuse into the nearest target cell.
    const c = centroid(cell);
    j = cellsB.map((b, k) => [Math.hypot(centroid(b)[0] - c[0], centroid(b)[1] - c[1]), k]).sort((a, b) => a[0] - b[0])[0][1];
  }
  usedB.add(j);
  pieces.push(makePiece(cell, cellsB[j]));
});
cellsB.forEach((cell, j) => {
  if (usedB.has(j)) return;
  // Unclaimed target cell: borrow the nearest vase fragment (one shard splits in two in flight).
  const c = centroid(cell);
  const src = cellsA.map((a, k) => [Math.hypot(centroid(a)[0] - c[0], centroid(a)[1] - c[1]), k]).sort((a, b) => a[0] - b[0])[0][1];
  pieces.push(makePiece(cellsA[src], cell));
});

function makePiece(a: Vec2[], b: Vec2[]): Piece {
  const cA = centroid(a), cB = centroid(b);
  const ringA = resampleClosed(a, RING).map(([x, y]) => [x - cA[0], y - cA[1]] as Vec2);
  // Back face is shown after a half flip (scaleX = −1), so store it pre-mirrored and reversed.
  const ringB = resampleClosed(b, RING).map(([x, y]) => [-(x - cB[0]), y - cB[1]] as Vec2).reverse();
  const d = Math.hypot(cA[0] - IMPACT[0], cA[1] - IMPACT[1]);
  const depart = 1.75 + d * .0026 + rand() * .08;
  const arrive = 4.7 + (cB[0] - 370) / 600 * .9 + rand() * .15;
  return { ringA, ringB, cA, cB, depart, arrive, spin: (rand() - .5) * 2, turns: rand() > .5 ? 1 : -1, seed: rand() * 100 };
}

const CENTER: Vec2 = [640, 360];
function pose(p: Piece, t: number) {
  const u = smoother((t - p.depart) / (p.arrive - p.depart));
  if (t <= p.depart) return { pos: p.cA, rot: 0, flip: 0, m: 0, u: 0 };
  const aA = Math.atan2(p.cA[1] - CENTER[1], p.cA[0] - CENTER[0]);
  const aB = Math.atan2(p.cB[1] - CENTER[1], p.cB[0] - CENTER[0]);
  const rA = Math.hypot(p.cA[0] - CENTER[0], p.cA[1] - CENTER[1]);
  const rB = Math.hypot(p.cB[0] - CENTER[0], p.cB[1] - CENTER[1]);
  let dA = aB - aA;
  while (dA < 0) dA += Math.PI * 2;
  const a = aA + (dA + Math.PI * 2) * u;
  // Burst outward first (impact pushes away), then the vortex pulls inward.
  const burst = Math.sin(Math.PI * Math.min(1, u * 1.25)) * (130 + p.seed * .9);
  const r = lerp(rA, rB, u) + burst;
  const pos: Vec2 = [CENTER[0] + Math.cos(a) * r, CENTER[1] + Math.sin(a) * r * .72];
  const settle = smooth((u - .85) / .15);
  return {
    pos: [lerp(pos[0], p.cB[0], settle), lerp(pos[1], p.cB[1], settle)] as Vec2,
    rot: p.spin * Math.PI * 2 * u * (1 - settle) + 0,
    flip: Math.PI * smooth((u - .2) / .55),
    m: smooth((u - .3) / .4),
    u,
  };
}

// ---------- porcelain painting ----------
const COBALT = "#1e4f9c", COBALT_D = "#163a76", GLAZE = "#f3f6f9";

function paintVase(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(512, 0, 768, 0);
  g.addColorStop(0, "#d7e0ea"); g.addColorStop(.35, GLAZE); g.addColorStop(.6, "#ffffff"); g.addColorStop(1, "#c9d4e0");
  ctx.fillStyle = g;
  ctx.fillRect(480, 140, 320, 420);
  ctx.strokeStyle = COBALT;
  ctx.lineCap = "round";
  // Neck bands and shoulder ruyi band.
  ctx.lineWidth = 4;
  for (const y of [172, 196, 252, 488, 532]) { ctx.beginPath(); ctx.moveTo(500, y); ctx.lineTo(780, y); ctx.stroke(); }
  ctx.lineWidth = 2.4;
  for (let k = 0; k < 9; k++) { ctx.beginPath(); ctx.arc(530 + k * 28, 252, 12, 0, Math.PI); ctx.stroke(); }
  // Lotus scroll on the belly.
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 500; x <= 780; x += 4) {
    const y = 360 + Math.sin(x * .045) * 34;
    if (x === 500) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.fillStyle = COBALT;
  for (let k = 0; k < 6; k++) {
    const x = 520 + k * 48, y = 360 + Math.sin(x * .045) * 34;
    ctx.beginPath();
    for (let pet = 0; pet < 5; pet++) {
      const a = -Math.PI / 2 + (pet - 2) * .5;
      ctx.ellipse(x + Math.cos(a) * 10, y - 6 + Math.sin(a) * 10, 9, 4, a, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 14, y + 16, 10, 4, .6, 0, Math.PI * 2); ctx.fill();
  }
  // Lotus panels at the foot.
  ctx.lineWidth = 2.4;
  for (let k = 0; k < 8; k++) {
    const x = 540 + k * 28;
    ctx.beginPath(); ctx.moveTo(x - 12, 488); ctx.quadraticCurveTo(x, 452, x + 12, 488); ctx.stroke();
  }
}

function paintWhale(ctx: CanvasRenderingContext2D, t: number) {
  const g = ctx.createLinearGradient(0, 280, 0, 440);
  g.addColorStop(0, COBALT_D); g.addColorStop(.52, COBALT); g.addColorStop(.62, "#dfe8f3"); g.addColorStop(1, GLAZE);
  ctx.fillStyle = g;
  ctx.fillRect(350, 260, 640, 200);
  // Sea-wave scrolls along the back.
  ctx.strokeStyle = "#cfe0f5";
  ctx.lineWidth = 2;
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 12; k++) {
      const x = 450 + k * 36 + row * 18, y = 312 + row * 20;
      ctx.beginPath(); ctx.arc(x, y, 12, Math.PI, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 6, Math.PI, Math.PI * 2); ctx.stroke();
    }
  }
  // Throat grooves.
  ctx.strokeStyle = "#9fb7d6";
  ctx.lineWidth = 1.6;
  for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(420, 400 + k * 5); ctx.quadraticCurveTo(560, 420 + k * 4, 680, 414 + k * 3); ctx.stroke(); }
  // Eye.
  ctx.fillStyle = "#0e1c34";
  ctx.beginPath(); ctx.arc(468, 368, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(466, 366, 1.8, 0, Math.PI * 2); ctx.fill();
  void t;
}

function swim(p: Vec2, t: number): Vec2 {
  const a = win(t, 6.0, 6.6);
  const u = clamp((p[0] - 560) / 420);
  return [p[0] - 40 * smooth((t - 6.1) / 1.9), p[1] + a * (Math.sin(t * 4.2 - p[0] * .01) * 26 * u * u - 6 * Math.sin(t * 4.2))];
}

function drawPiece(ctx: CanvasRenderingContext2D, p: Piece, t: number) {
  const { pos, rot, flip, m } = pose(p, t);
  const ring = p.ringA.map((q, i) => [lerp(q[0], p.ringB[i][0], m), lerp(q[1], p.ringB[i][1], m)] as Vec2);
  const sx = Math.cos(flip);
  const at = swim(pos, t);
  const gap = 1 - .08 * Math.sin(Math.PI * clamp((t - p.depart) / (p.arrive - p.depart)));
  ctx.save();
  ctx.translate(at[0], at[1]);
  ctx.rotate(rot);
  ctx.scale(sx * gap || .001, gap);
  ctx.beginPath();
  ring.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]));
  ctx.closePath();
  ctx.save();
  ctx.clip();
  if (sx >= 0) { ctx.translate(-p.cA[0], -p.cA[1]); paintVase(ctx); }
  else { ctx.scale(-1, 1); ctx.translate(-p.cB[0], -p.cB[1]); paintWhale(ctx, t); }
  ctx.restore();
  // Facet shading from the flip, plus a glossy edge.
  const shade = 1 - Math.abs(sx);
  if (shade > .01) { ctx.fillStyle = `rgba(10,20,40,${shade * .55})`; ctx.fill(); }
  const inFlight = t > p.depart && t < p.arrive + .6;
  const seam = inFlight ? 1 - win(t, p.arrive + .1, p.arrive + .6) : 0;
  const crack = t < p.depart ? crackAt(p, t) : 0;
  if (seam + crack > .01) {
    ctx.strokeStyle = `rgba(255,248,226,${Math.max(seam * .9, crack)})`;
    ctx.lineWidth = 1.4 / Math.max(.2, gap);
    ctx.stroke();
  }
  ctx.restore();
}

/** A crack front races out from the impact point before the shards leave. */
function crackAt(p: Piece, t: number) {
  const d = Math.hypot(p.cA[0] - IMPACT[0], p.cA[1] - IMPACT[1]);
  const front = (t - 1.05) * 600;
  return clamp((front - d) / 60) * .85;
}

function background(ctx: CanvasRenderingContext2D, t: number) {
  const g = ctx.createRadialGradient(640, 330, 60, 640, 380, 820);
  g.addColorStop(0, "#2a3442"); g.addColorStop(1, "#0b0f16");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1280, 720);
  const sea = win(t, 4.6, 6.2);
  if (sea > 0) {
    ctx.globalAlpha = sea;
    const s = ctx.createLinearGradient(0, 0, 0, 720);
    s.addColorStop(0, "#14365a"); s.addColorStop(1, "#071526");
    ctx.fillStyle = s;
    ctx.fillRect(0, 0, 1280, 720);
    ctx.globalAlpha = 1;
  }
  // Plinth that vanishes once the vase is gone.
  const plinth = 1 - win(t, 1.8, 2.6);
  if (plinth > 0) {
    ctx.globalAlpha = plinth;
    ctx.fillStyle = "#1a2029";
    ctx.fillRect(520, 552, 240, 170);
    ctx.fillStyle = "#00000055";
    ctx.beginPath(); ctx.ellipse(640, 552, 96, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = "#c9d6e6aa";
  ctx.font = "11px ui-monospace, Menlo, monospace";
  ctx.fillText("LAB  /  SHATTER → REASSEMBLE   青花瓷瓶 → 鲸", 44, 50);
}

function spout(ctx: CanvasRenderingContext2D, t: number) {
  const s = win(t, 6.6, 7.0);
  if (s <= 0) return;
  const base = swim([520, 286], t);
  ctx.fillStyle = "#e8f3ff";
  const r = rng(77);
  for (let k = 0; k < 60; k++) {
    const a = -Math.PI / 2 + (r() - .5) * .9, v = 120 + r() * 160, age = (t - 6.6) - r() * .2;
    if (age < 0) continue;
    const x = base[0] + Math.cos(a) * v * age, y = base[1] + Math.sin(a) * v * age + 260 * age * age;
    ctx.globalAlpha = clamp(1 - age / 1.3) * .8;
    ctx.beginPath(); ctx.arc(x, y, 1.5 + r() * 2.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export const scene: MorphScene = {
  id: "vase-whale",
  title: "Lab · 碎裂重组（瓷瓶 → 鲸）",
  duration: DURATION,
  draw(ctx, t) {
    background(ctx, t);
    // Pieces that have flipped (showing the back) are drawn after the ones still facing front.
    const order = [...pieces].sort((a, b) => pose(a, t).flip - pose(b, t).flip);
    for (const p of order) drawPiece(ctx, p, t);
    // Idle: a soft highlight glides over the glaze until the shards leave.
    const idle = 1 - win(t, 1.6, 1.9);
    if (idle > 0) {
      ctx.save();
      ctx.beginPath();
      VASE.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]));
      ctx.closePath();
      ctx.clip();
      const x = 470 + t * 160;
      const g = ctx.createLinearGradient(x - 40, 0, x + 40, 0);
      g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(.5, `rgba(255,255,255,${.35 * idle})`); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - 40, 140, 80, 420);
      ctx.restore();
    }
    spout(ctx, t);
  },
};
