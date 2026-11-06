import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import { createSdfRenderer, type Prim, type RGB, type SdfRenderer, type Vec2 } from "../../packages/morph-engine/src/renderers/sdf-gl";
import { backOut, clamp, hex, lerp, mixRGB, rng, smooth, smoother, strokePrims, taper, transformPrims, win, type Stroke } from "../../packages/morph-engine/src/effects/skeleton";

/*
 * Ink drop → bird, seen from above a sheet of paper.
 * The splash crown throws satellite droplets exactly where the bird's feather tips will land.
 * Wet fingers grow out of the puddle and catch them, so the extremities are pre-figured
 * by the splash and nothing appears from nowhere. Then the bird peels off the paper:
 * the cast shadow separates and the stain is left behind.
 */

const DURATION = 7.5;
const IMPACT = .95;
const HOME: Vec2 = [560, 380];
const INK: RGB = hex("#0b1517");
const INK_SHEEN: RGB = hex("#22363a");

type Feather = { base: Vec2; dir: number; len: number; r0: number; r1: number; delay: number; side: number; wing: boolean };

// Bird in local coordinates, heading up (−y), unit scale.
function buildBird(): Feather[] {
  const out: Feather[] = [];
  for (const side of [-1, 1]) {
    // Primaries fan from the hand.
    for (let k = 0; k < 7; k++) {
      const u = k / 6;
      out.push({ base: [side * lerp(186, 150, u), lerp(-34, -18, u)], dir: side > 0 ? lerp(-.45, .55, u) : Math.PI - lerp(-.45, .55, u),
        len: lerp(96, 66, u), r0: 8.5, r1: 2.2, delay: .55 + .35 * (1 - u), side, wing: true });
    }
    // Secondaries trail the forearm.
    for (let k = 0; k < 6; k++) {
      const u = k / 5;
      out.push({ base: [side * lerp(140, 46, u), lerp(-18, -10, u)], dir: Math.PI / 2 + side * lerp(.42, .12, u),
        len: lerp(58, 46, u), r0: 10, r1: 3.6, delay: .35 + .2 * (1 - u), side, wing: true });
    }
  }
  // Swallow-like forked tail.
  for (let k = 0; k < 5; k++) {
    const u = k / 4 - .5;
    out.push({ base: [u * 12, 48], dir: Math.PI / 2 + u * .9, len: 62 + Math.abs(u) * 64, r0: 8, r1: 1.8, delay: .45 + Math.abs(u) * .3, side: 0, wing: false });
  }
  return out;
}
const FEATHERS = buildBird();
const ARM = (side: number): Vec2[] => [[side * 16, -16], [side * 84, -6], [side * 150, -22], [side * 186, -34]];

// Satellite drops thrown by the splash, each owned by a feather tip that will catch it.
const r = rng(11);
const SATELLITES = FEATHERS.map((f, i) => ({ i, f })).filter(({ f }) => f.wing ? f.len > 64 : f.len > 90)
  .map(({ i, f }) => {
    const tip: Vec2 = [f.base[0] + Math.cos(f.dir) * f.len, f.base[1] + Math.sin(f.dir) * f.len];
    const k = lerp(.7, .95, r());
    return { feather: i, land: [tip[0] * k + (r() - .5) * 16, tip[1] * k + (r() - .5) * 16] as Vec2, size: 4 + r() * 4.5, delay: r() * .14 };
  });
// Fine mist that never becomes bird: it soaks into the paper and stays as speckle.
const MIST = Array.from({ length: 34 }, () => {
  const a = r() * Math.PI * 2, d = 80 + Math.pow(r(), .6) * 170;
  return { land: [Math.cos(a) * d, Math.sin(a) * d * .9] as Vec2, size: 1.4 + r() * 3.2, delay: r() * .18 };
});

function flapPose(t: number) {
  const active = win(t, 4.05, 4.5);
  const phase = (t - 4.05) * Math.PI * 2 * 1.9;
  return { span: 1 - active * (.42 - .42 * Math.cos(phase)) * .9, sweep: active * Math.sin(phase) * .16 };
}

/** Where the whole bird sits: on the paper, then lifting toward the viewer and away. */
function flight(t: number) {
  const lift = smoother((t - 3.95) / 3.2);
  const p: Vec2 = [lerp(HOME[0], 980, lift), lerp(HOME[1], 168, Math.pow(lift, .85))];
  return { lift, pos: p, angle: lerp(-.18, .62, smooth((t - 4.1) / 2.6)), scale: lerp(1, 1.32, lift) + .015 * Math.sin(t * 9) * lift };
}

function birdPrims(t: number): Prim[] {
  const form = (d: number) => smoother((t - 1.3 - d * 1.45) / 1.15);
  const crisp = win(t, 2.6, 3.9);
  const { span, sweep } = flapPose(t);
  const wet = 1 - .55 * win(t, 3.4, 5);
  const ink = { color: INK, gloss: lerp(.95, .55, 1 - wet), sss: 0, wobble: lerp(2.6, .3, crisp) * (t < IMPACT ? 0 : 1), anchor: [0, 0] as Vec2 };
  const P = (p: Vec2, side: number): Vec2 => side ? [p[0] * span, p[1] + Math.abs(p[0]) * sweep] : p;
  const prims: Prim[] = [];

  // Puddle: the reservoir. It gives volume to the wings and shrinks into the body.
  const splash = backOut(smooth((t - IMPACT) / .45), 2.2);
  const drain = smoother((t - 1.45) / 1.9);
  if (t >= IMPACT) {
    const ring = .08 * Math.sin((t - IMPACT) * 18) * Math.exp(-(t - IMPACT) * 4);
    const rr = 64 * splash * (1 + ring);
    const stretch = win(t, 1.15, 1.7) * (1 - drain);
    prims.push({ ...ink, shape: { kind: "ellipse", x: 0, y: 10 * drain, rx: lerp(rr * (1 + .35 * stretch), 22, drain), ry: lerp(rr * .94 * (1 - .18 * stretch), 58, drain) } });
  } else {
    // Falling drop seen from above: small and round until contact.
    const s = lerp(.55, 1, smooth(t / IMPACT));
    prims.push({ ...ink, gloss: 1, shape: { kind: "ellipse", x: 0, y: 0, rx: 30 * s, ry: 30 * s } });
    return prims;
  }

  // Body + head + beak.
  const bodyGrow = form(.05);
  prims.push({ ...ink, blend: 22, shape: { kind: "ellipse", x: 0, y: 0, rx: lerp(30, 22, bodyGrow), ry: lerp(30, 56, bodyGrow) } });
  const head = form(.18);
  prims.push({ ...ink, blend: lerp(30, 12, crisp), shape: { kind: "ellipse", x: 0, y: lerp(-10, -68, head), rx: lerp(12, 18, head), ry: lerp(12, 19, head) } });
  const beak = form(.42);
  prims.push({ ...ink, blend: 5, shape: { kind: "capsule", ax: 0, ay: lerp(-30, -82, head), bx: 0, by: lerp(-30, -106, beak), ra: 6.5, rb: lerp(5, 1.4, beak) } });

  // Wing arms: shoulder → elbow → wrist → hand, grown outward from the puddle.
  for (const side of [-1, 1]) {
    const arm = ARM(side);
    const pts: Vec2[] = arm.map((p, k) => {
      const g = form(.15 + k * .1);
      return P([p[0] * lerp(.15, 1, g), p[1] * g], side);
    });
    prims.push(...strokePrims({ points: pts, radii: [17, 14, 10, 7] }, { ...ink, rootBlend: lerp(30, 14, crisp), jointBlend: 6 }));
  }

  // Feathers: each grows from the puddle edge outward ("viscous fingering") and catches its droplet.
  FEATHERS.forEach(f => {
    const g = form(f.delay);
    if (g <= 0) return;
    const base = P([f.base[0] * lerp(.25, 1, g), f.base[1] * lerp(.25, 1, g)], f.side);
    const tipFull: Vec2 = [f.base[0] + Math.cos(f.dir) * f.len, f.base[1] + Math.sin(f.dir) * f.len];
    const tip = P([lerp(base[0] / (f.side ? span : 1), tipFull[0], g), lerp(base[1], tipFull[1], g)], f.side);
    const n = 6;
    const pts: Vec2[] = Array.from({ length: n }, (_, k) => {
      const u = k / (n - 1);
      const bend = Math.sin(u * Math.PI) * (f.side ? -6 : 0) * g;
      return [lerp(base[0], tip[0], u), lerp(base[1], tip[1], u) + bend];
    });
    const radii = taper(n, f.r0 * lerp(1.6, 1, g), f.r1 * lerp(2.2, 1, crisp), 1.1);
    const stroke: Stroke = { points: pts, radii };
    prims.push(...strokePrims(stroke, { ...ink, rootBlend: lerp(26, 6, crisp), jointBlend: lerp(5, 1, crisp) }));
  });

  // Satellite droplets: thrown out at impact, they wait on the paper until the matching feather reaches them.
  for (const sat of SATELLITES) {
    const f = FEATHERS[sat.feather];
    const fly = smooth((t - IMPACT - sat.delay) / .32);
    const reach = form(f.delay);
    if (fly <= 0 || reach >= .98) continue;
    const land = P(sat.land, f.side);
    const tipNow: Vec2 = (() => {
      const base: Vec2 = [f.base[0] * lerp(.25, 1, reach), f.base[1] * lerp(.25, 1, reach)];
      return P([lerp(base[0], f.base[0] + Math.cos(f.dir) * f.len, reach), lerp(base[1], f.base[1] + Math.sin(f.dir) * f.len, reach)], f.side);
    })();
    const pull = smooth((reach - .6) / .38);
    const p: Vec2 = [lerp(land[0] * fly, tipNow[0], pull), lerp(land[1] * fly, tipNow[1], pull)];
    const s = sat.size * (1 - pull * .9) * (fly < 1 ? lerp(1.4, 1, fly) : 1);
    prims.push({ ...ink, blend: 9, shape: { kind: "ellipse", x: p[0], y: p[1], rx: s, ry: s * (fly < 1 ? .7 : 1) } });
  }

  for (const m of MIST) {
    const fly = smooth((t - IMPACT - m.delay) / .3);
    const soak = win(t, 1.6, 2.8);
    const size = m.size * (1 - soak) * (fly < 1 ? lerp(1.3, 1, fly) : 1);
    if (fly <= 0 || size < .3) continue;
    prims.push({ ...ink, wobble: 0, blend: 2, shape: { kind: "ellipse", x: m.land[0] * fly, y: m.land[1] * fly, rx: size, ry: size } });
  }

  // Decals: wet highlight band along the wing coverts, an eye.
  const eye = win(t, 3.4, 3.8);
  if (eye > 0) prims.push({ decal: true, opacity: eye, bump: 1.5, color: hex("#d9c9a7"), gloss: 1, shape: { kind: "ellipse", x: 7, y: -72, rx: 3.2, ry: 3.2 } });
  for (const side of [-1, 1]) {
    const cover = win(t, 3.1, 3.9) * .55;
    if (cover > 0) prims.push({ decal: true, opacity: cover, bump: 1, color: INK_SHEEN, gloss: .6,
      shape: { kind: "capsule", ax: side * 20 * span, ay: -12, bx: side * 140 * span, by: -16 + 140 * Math.abs(sweep), ra: 9, rb: 5 } });
  }
  return prims;
}

// ---------- paper ----------
const rand = rng(809);
const flecks = Array.from({ length: 1800 }, () => ({ x: rand() * 1280, y: rand() * 720, size: .2 + rand() * 1.05, light: rand() > .55 }));

function paper(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 10, 1270, 700);
  g.addColorStop(0, "#f9f0d9");
  g.addColorStop(.61, "#eee4ce");
  g.addColorStop(1, "#dcd4bf");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1280, 720);
  for (const { x, y, size, light } of flecks) {
    ctx.fillStyle = light ? "#fff8e83a" : "#6b564214";
    ctx.fillRect(x, y, size, size);
  }
  const glow = ctx.createRadialGradient(990, 170, 12, 990, 170, 260);
  glow.addColorStop(0, "#c1715440");
  glow.addColorStop(.7, "#d4996520");
  glow.addColorStop(1, "#d4996500");
  ctx.fillStyle = glow;
  ctx.fillRect(700, 0, 580, 460);
  ctx.strokeStyle = "#ad6c5444";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(990, 170, 150, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.strokeStyle = "#655d4d60";
  ctx.strokeRect(28.5, 28.5, 1223, 663);
  ctx.fillStyle = "#62574b";
  ctx.font = "12px Georgia, serif";
  ctx.fillText("CREATIVE MORPH   /   INK STUDY", 48, 53);
  ctx.textAlign = "right";
  ctx.fillText("01  /  FLIGHT", 1232, 668);
  ctx.textAlign = "left";
}

/** The ink the bird leaves behind, absorbed into the paper fibres: a feathered pool with a darker drying ring. */
function stain(ctx: CanvasRenderingContext2D, t: number) {
  const a = win(t, 1.3, 2.4) * (1 - .3 * win(t, 4.5, 7.5));
  if (a <= 0) return;
  const grow = win(t, 1.0, 2.0);
  ctx.save();
  ctx.translate(...HOME);
  ctx.globalAlpha = a;
  ctx.filter = "blur(5px)";
  ctx.fillStyle = "#33413f1e";
  ctx.beginPath();
  ctx.ellipse(0, 6, 78 * grow, 70 * grow, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.filter = "blur(1.5px)";
  ctx.strokeStyle = "#2a36343a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let k = 0; k <= 64; k++) {
    const ang = k / 64 * Math.PI * 2;
    const rr = 74 * grow * (1 + .05 * Math.sin(ang * 5 + 1) + .03 * Math.sin(ang * 11));
    const x = Math.cos(ang) * rr, y = 6 + Math.sin(ang) * rr * .93;
    if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.stroke();
  ctx.filter = "none";
  const speck = win(t, 1.8, 2.8);
  ctx.fillStyle = "#26302f";
  for (const m of MIST) {
    ctx.globalAlpha = a * speck * .55;
    ctx.beginPath();
    ctx.arc(m.land[0], m.land[1], m.size * .8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

let renderer: SdfRenderer | null = null;

export const scene: MorphScene = {
  id: "ink-bird",
  title: "墨滴 → 飞鸟",
  duration: DURATION,
  draw(ctx, t) {
    renderer ??= createSdfRenderer();
    paper(ctx);
    stain(ctx, t);
    const { lift, pos, angle, scale } = flight(t);
    // Before impact the drop is above the paper: its shadow leads it in.
    const air = t < IMPACT ? 1 - smooth(t / IMPACT) : lift;
    const shadowOffset: Vec2 = t < IMPACT ? [70 * air, 95 * air] : [lerp(3, 120, lift), lerp(4, 150, lift)];
    const prims = transformPrims(birdPrims(t), angle, [0, 0], pos, scale);
    renderer.draw(ctx, prims, {
      thickness: lerp(9, 14, win(t, 3, 4.5)), time: t, seed: 7,
      light: [-.5, -.65, .58], keyColor: [1, .97, .9], ambientTop: [.6, .62, .62], ambientBottom: [.25, .24, .22],
      rimColor: [.95, .9, .8],
      shadowOffset, shadowSoftness: lerp(3, 26, Math.max(air, lift)), shadowOpacity: lerp(.42, .16, Math.max(air, lift)),
      shadowColor: [.24, .2, .14],
    });
  },
};
