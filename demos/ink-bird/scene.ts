import { mix, ramp, type MorphScene } from "../../packages/morph-engine/src/core/scene";
import { liquidPath } from "../../packages/morph-engine/src/effects/liquid";

type Point = [number, number];

function random(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const rand = random(809);
const flecks = Array.from({ length: 1800 }, () => ({
  x: rand() * 1280, y: rand() * 720, size: .2 + rand() * 1.05, light: rand() > .55,
}));
const drops = Array.from({ length: 21 }, (_, index) => ({
  angle: rand() * Math.PI * 2, distance: 21 + rand() * 63,
  delay: 1.9 + rand() * 1.1, radius: 1 + rand() * 4, side: index % 2 ? 1 : -1,
}));

function background(ctx: CanvasRenderingContext2D) {
  const paper = ctx.createLinearGradient(0, 10, 1270, 700);
  paper.addColorStop(0, "#f9f0d9");
  paper.addColorStop(.61, "#eee4ce");
  paper.addColorStop(1, "#dcd4bf");
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, 1280, 720);
  for (const { x, y, size, light } of flecks) {
    ctx.fillStyle = light ? "#fff8e83a" : "#6b564214";
    ctx.fillRect(x, y, size, size);
  }

  const glow = ctx.createRadialGradient(792, 289, 12, 792, 289, 257);
  glow.addColorStop(0, "#c1715433");
  glow.addColorStop(.7, "#d4996520");
  glow.addColorStop(1, "#d4996500");
  ctx.fillStyle = glow;
  ctx.fillRect(520, 15, 545, 545);
  ctx.strokeStyle = "#ad6c5444";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(792, 289, 175, 0, 2 * Math.PI);
  ctx.stroke();

  for (let layer = 0; layer < 4; layer++) {
    const y = 565 + layer * 26;
    ctx.fillStyle = ["#71857c22", "#63786e22", "#51635a25", "#44594e28"][layer];
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(124, y - 20, 139, y - 104 + layer * 12, 289, y - 70);
    ctx.bezierCurveTo(434, y - 58, 455, y - 34, 591, y - 36);
    ctx.bezierCurveTo(700, y - 39, 742, y - 81 + layer * 8, 850, y - 53);
    ctx.bezierCurveTo(1012, y + 12, 1100, y - 82 + layer * 9, 1280, y - 65);
    ctx.lineTo(1280, 720);
    ctx.lineTo(0, 720);
    ctx.fill();
  }

  ctx.strokeStyle = "#655d4d60";
  ctx.lineWidth = 1;
  ctx.strokeRect(28.5, 28.5, 1223, 663);
  ctx.fillStyle = "#62574b";
  ctx.font = "12px Georgia, serif";
  ctx.fillText("CREATIVE MORPH   /   INK STUDY", 48, 53);
  ctx.textAlign = "right";
  ctx.fillText("01  /  FLIGHT", 1232, 668);
  ctx.textAlign = "left";
}

function shape(ctx: CanvasRenderingContext2D, points: Point[]) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (let index = 1; index < points.length; index++) ctx.lineTo(...points[index]);
  ctx.closePath();
  ctx.fill();
}

function wing(ctx: CanvasRenderingContext2D, side: -1 | 1, growth: number, beat: number, detail: number) {
  if (growth <= 0) return;
  const span = (side < 0 ? 264 : 213) * growth;
  const lift = (side < 0 ? -91 : -140) + beat * 69;
  const rootX = side * 6;
  const point = (x: number, y: number): Point => [rootX + side * x * span, y * growth + x * x * lift * growth];
  const edge = new Path2D();
  edge.moveTo(...point(0, 10));
  edge.bezierCurveTo(...point(.18, -50), ...point(.46, -113), ...point(.95, -57));
  edge.quadraticCurveTo(...point(1.05, -45), ...point(1, -38));
  const feathers: Point[] = [];
  for (let index = 0; index < 9; index++) {
    const t = index / 8;
    const x = 1 - t * .76;
    const splay = (8 + 24 * (1 - t) ** 1.3 + 4 * Math.sin(Math.PI * t)) * detail;
    edge.quadraticCurveTo(...point(x + .006, -23 + t * 60), ...point(x + .035 * detail, -12 + t * 66 + splay));
    edge.quadraticCurveTo(...point(x - .027, -15 + t * 63 + splay * .79), ...point(x - .076, -18 + t * 63));
    feathers.push(point(x - .012, -11 + t * 65 + splay * .73));
  }
  edge.quadraticCurveTo(...point(.12, 41), ...point(0, 16));
  edge.closePath();
  ctx.fill(edge);
  if (detail <= 0) return;
  ctx.save();
  ctx.clip(edge);
  ctx.lineCap = "round";
  for (let index = 0; index < feathers.length; index++) {
    const [x, y] = feathers[index];
    const [sx, sy] = point(.16 + (.69 * (1 - index / 8)), -41 + index * 4.5);
    ctx.strokeStyle = "#b9c8b3" + (side < 0 ? "24" : "1b");
    ctx.lineWidth = index % 3 === 0 ? 2.1 : 1.3;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(mix(sx, x, .7), mix(sy, y, .28), mix(sx, x, detail), mix(sy, y, detail));
    ctx.stroke();
  }
  ctx.restore();
}

function draw(ctx: CanvasRenderingContext2D, time: number) {
  background(ctx);
  const fall = ramp(time, .55, 1.5);
  const open = ramp(time, 1.58, 4.04);
  const flight = ramp(time, 4.32, 6.85);
  const formation = ramp(time, 2.44, 4.38);
  const flap = Math.sin((time - 4.12) * Math.PI * 2 * 1.02) * ramp(time, 4.05, 4.74);
  ctx.save();
  ctx.translate(546 + flight * 295, 224 + fall * 158 - flight * 96 + flap * 10 + Math.sin(time * 3.1) * (1 - fall) * 3);
  ctx.rotate((-.23 * formation - .13 * flight) + flap * .055);
  const scale = 1 - flight * .22;
  ctx.scale(scale, scale);

  const ink = ctx.createLinearGradient(-90, -180, 44, 135);
  ink.addColorStop(0, "#4a5c52");
  ink.addColorStop(.44, "#253a35");
  ink.addColorStop(1, "#111f1c");
  ctx.fillStyle = ink;
  for (const drop of drops) {
    const p = ramp(time, drop.delay, drop.delay + 1.1);
    if (p <= 0) continue;
    const x = Math.cos(drop.angle) * drop.distance * p + drop.side * open * 98 - flight * 130;
    const y = Math.sin(drop.angle) * drop.distance * p + 30 + 37 * p + flight * 70;
    ctx.fillStyle = "rgba(34,53,44," + (1 - p * .42) * .67 + ")";
    ctx.beginPath();
    ctx.ellipse(x, y, drop.radius * (1 + .5 * p), Math.max(.45, drop.radius * (1 - .61 * p)), drop.angle, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = ink;

  const massHeight = mix(65 + fall * 23, 49, formation);
  const massWidth = mix(58 - fall * 12, 74, formation);
  if (formation < 1) {
    const fork = ramp(time, 1.33, 2.7);
    const elongation = ramp(time, .75, 1.86);
    const liquid = liquidPath([
      { x: 0, y: 0, radiusX: massWidth, radiusY: massHeight, strength: mix(1.14, .36, formation) },
      { x: -9, y: -41 * elongation, radiusX: 28, radiusY: 45, strength: .76 * (1 - formation) },
      { x: -fork * 79, y: -fork * 27, radiusX: 42, radiusY: 28, strength: .9 * (1 - formation) * fork },
      { x: -fork * 38, y: -fork * 18, radiusX: 39, radiusY: 34, strength: .95 * (1 - formation) * fork },
      { x: fork * 61, y: -fork * 46, radiusX: 37, radiusY: 38, strength: .9 * (1 - formation) * fork },
      { x: fork * 31, y: -fork * 25, radiusX: 36, radiusY: 34, strength: .96 * (1 - formation) * fork },
    ], { cellSize: 2, iso: .33 });
    ctx.fill(liquid, "evenodd");
  }

  wing(ctx, 1, Math.pow(open, .88), flap, formation);
  wing(ctx, -1, open, -flap * .68, formation);
  const bodyScale = ramp(time, 2.14, 3.36);
  if (bodyScale > 0) {
    ctx.save();
    ctx.scale(bodyScale, bodyScale);
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.moveTo(-62, 48);
    ctx.bezierCurveTo(-53, 21, -31, -6, 2, -16);
    ctx.bezierCurveTo(25, -21, 52, 1, 65, -1);
    ctx.bezierCurveTo(78, -3, 90, 4, 88, 14);
    ctx.bezierCurveTo(83, 23, 66, 23, 58, 24);
    ctx.bezierCurveTo(28, 53, -22, 57, -62, 48);
    ctx.closePath();
    ctx.fill();
    const tail = ramp(time, 2.73, 3.88);
    shape(ctx, [[-43, 30], [-43-60*tail, 60+3*flap], [-51-25*tail, 54], [-53-51*tail, 83], [-23, 45]]);
    const bill = ramp(time, 3.15, 3.85);
    shape(ctx, [[82,7],[86+26*bill,9-6*bill],[86,17]]);
    if (formation > .7) {
      ctx.fillStyle = "#d9c3a2";
      ctx.beginPath();
      ctx.arc(80, 6, 2.4 * ramp(formation, .7, 1), 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}

export const scene: MorphScene = { id: "ink-bird", title: "墨滴 → 飞鸟", duration: 7, draw };
