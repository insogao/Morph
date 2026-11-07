import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import type { Vec2 } from "../../packages/morph-engine/src/renderers/sdf-gl";
import { colonize } from "../../packages/morph-engine/src/effects/growth";
import { clamp, lerp, rng, smooth, win, backOut } from "../../packages/morph-engine/src/effects/skeleton";
import { curve, type Key } from "../../packages/morph-engine/src/vector/camera-move";

/*
 * MM82 · acorn → oak → leaf → bird, one shot.
 *
 * One camera, one clock, one world. A raindrop wakes the acorn; the shoot that leaves the crack IS the trunk
 * (space colonization, revealed by node order) and the camera rises with its tip while pulling out. One leaf
 * ripens amber while the last leaves are still budding; a gust (a wave travelling through the grass) releases it.
 * The camera is already pushing toward it as it falls. The leaf tumbles about its midrib; at the edge-on moment it
 * re-opens with its two halves as wings, lobes sliding into primaries, veins into feather shafts, petiole into the
 * tail, tip into the beak. The first downstroke happens while it is still falling, and the pull-out to the wide
 * shot starts before the bird has climbed away.
 */

const D = 11.5;
const GY = 600; // ground line (world, y down)
const TX = 560; // acorn / trunk x
type RGB = [number, number, number];
const hexc = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixc = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const css = (c: RGB, a = 1) => `rgba(${c.map(Math.round).join(",")},${a})`;

const PAL = {
  skyTop: hexc("#a9cfd8"), skyLow: hexc("#f6e7c6"), sun: hexc("#fff3cf"),
  hillFar: hexc("#b7cdb4"), hillMid: hexc("#93b48f"), meadow: hexc("#76a062"), grass: hexc("#5f8c50"),
  soil: hexc("#7b5a3e"), soilDeep: hexc("#5e4330"), wet: hexc("#4f3826"), root: hexc("#d6bb8f"),
  bark: hexc("#5a3f2d"), barkLit: hexc("#6d4d36"),
  leafDark: hexc("#3b6e3d"), leafMid: hexc("#4f8a47"), leafLit: hexc("#6aa356"),
  nut: hexc("#b97436"), nutLit: hexc("#d39552"), cap: hexc("#7a5634"), capLine: hexc("#5f4128"),
  amber: hexc("#df8f34"), amberPale: hexc("#efb768"), vein: hexc("#f6cf8c"), tipDark: hexc("#6a3d22"),
  fg: hexc("#4b7440"),
};

// ---------- the tree (deterministic, computed once) ----------
const CROWN: Vec2[] = [];
for (let i = 0; i < 48; i++) {
  const a = (i / 48) * Math.PI * 2;
  const lob = 1 + 0.08 * Math.sin(a * 5 + 0.6) + 0.05 * Math.sin(a * 9);
  let x = TX + Math.cos(a) * 270 * lob, y = 292 + Math.sin(a) * 150 * lob;
  if (y > 410) y = 410 + (y - 410) * 0.35; // flatter underside of an oak crown
  CROWN.push([x, y]);
}
const { nodes } = colonize(CROWN, [TX, GY - 4], { seed: 7, attractors: 900, influence: 80, step: 8, kill: 12, maxIterations: 500, tipRadius: 1 });
const G0 = 1.8, G1 = 5.2;
// Reveal by path distance from the root, so the growing tip advances at a steady pace (the sapling is slow at first).
const dist = nodes.map(() => 0);
for (let i = 1; i < nodes.length; i++) dist[i] = dist[nodes[i].parent] + Math.hypot(nodes[i].p[0] - nodes[nodes[i].parent].p[0], nodes[i].p[1] - nodes[nodes[i].parent].p[1]);
const maxDist = Math.max(...dist);
const nodeT = dist.map(d => G0 + Math.pow(d / maxDist, 0.85) * (G1 - G0));
/** Whole-tree maturity: the trunk only thickens as the crown fills. */
const maturity = (t: number) => Math.pow(clamp((t - G0) / (G1 + 0.6 - G0)), 1.25);
// depth in the tree from the root, used for the trunk's leading chain
const R = rng(11);
interface Leaf { p: Vec2; ang: number; size: number; col: RGB; t0: number; node: number }
const leaves: Leaf[] = [];
const clumps: { p: Vec2; r: number; t0: number; node: number; lit: number }[] = [];
nodes.forEach((n, i) => {
  if (n.children === 0 || (n.radius < 2.0 && R() < 0.35)) {
    const par = nodes[Math.max(0, n.parent)].p;
    const dir = Math.atan2(n.p[1] - par[1], n.p[0] - par[0]);
    if (n.children === 0 || R() < 0.3) clumps.push({ p: [n.p[0] + (R() - 0.5) * 8, n.p[1] + (R() - 0.5) * 8], r: (n.children ? 14 : 19) + R() * 9, t0: nodeT[i] + 0.06, node: i, lit: clamp((360 - n.p[1]) / 170 + (R() - 0.5) * 0.5) });
    const k = n.children === 0 ? 1 : R() < 0.4 ? 1 : 0;   // was 3 / 1: ~7000 leaves, too many fills for 60 fps
    for (let j = 0; j < k; j++) {
      const off = 4 + R() * 12, a = dir + (R() - 0.5) * 2.4;
      const shade = R();
      leaves.push({
        p: [n.p[0] + Math.cos(a) * off, n.p[1] + Math.sin(a) * off], ang: a + Math.PI / 2 + (R() - 0.5) * 0.8,
        size: 12.5 + R() * 5, col: shade < 0.45 ? PAL.leafMid : shade < 0.8 ? PAL.leafLit : PAL.leafDark,
        t0: nodeT[i] + 0.06 + R() * 0.22, node: i,
      });
    }
  }
});
// the hero leaf: a tip on the lower right of the crown, facing the camera's future path
let HN = 0, best = Infinity;
nodes.forEach((n, i) => {
  if (n.children) return;
  const d = Math.hypot(n.p[0] - 745, n.p[1] - 400);
  if (d < best) { best = d; HN = i; }
});
const HERO_ON_TREE: Vec2 = [nodes[HN].p[0] + 9, nodes[HN].p[1] + 8];
const HERO_ANG0 = 2.5; // tip pointing down-right while hanging
const DETACH = 5.7;
const HERO_S0 = 21;

// roots in the soil (hand-placed polylines, grown along their length)
const ROOTS: { pts: Vec2[]; w: number; t0: number; t1: number }[] = [];
{
  const rr = rng(5);
  const make = (x: number, y: number, a: number, len: number, w: number, t0: number, t1: number, depth: number) => {
    const pts: Vec2[] = [[x, y]];
    let px = x, py = y, aa = a;
    const n = 14;
    for (let i = 0; i < n; i++) { aa += (rr() - 0.5) * 0.35; px += Math.cos(aa) * len / n; py += Math.sin(aa) * len / n; pts.push([px, py]); }
    ROOTS.push({ pts, w, t0, t1 });
    if (depth > 0) for (let k = 0; k < 2; k++) {
      const at = 4 + Math.floor(rr() * 8), q = pts[at];
      const side = k ? 1 : -1;
      make(q[0], q[1], a + side * (0.7 + rr() * 0.5), len * 0.5, w * 0.55, lerp(t0, t1, at / n), t1 + 0.6, depth - 1);
    }
  };
  make(TX, GY + 2, Math.PI / 2, 120, 4.2, 1.45, 4.6, 2);
  make(TX - 4, GY + 6, Math.PI * 0.82, 110, 3.2, 2.6, 5.0, 1);
  make(TX + 4, GY + 6, Math.PI * 0.18, 120, 3.2, 2.8, 5.2, 1);
}

const PEBBLES: [number, number, number][] = (() => { const r = rng(17), out: [number, number, number][] = []; for (let i = 0; i < 160; i++) out.push([-700 + r() * 2600, GY + 16 + r() * 260, 1 + r() * 2.6]); return out; })();

// ---------- wind ----------
const gust = (t: number, x = TX) => Math.exp(-Math.pow((t - 5.45 - (x - TX) / 1600) / 0.42, 2));
const breeze = (t: number) => 0.6 * Math.sin(t * 1.3) + 0.3 * Math.sin(t * 2.3 + 1);
function sway(p: Vec2, t: number): Vec2 {
  const h = clamp((GY - p[1]) / 420);
  const g = gust(t, p[0]);
  const dx = (h * h) * (1.6 * breeze(t) + 13 * g * (0.75 + 0.25 * Math.sin(t * 11 + p[1] * 0.02)));
  return [p[0] + dx, p[1] + dx * 0.12 * h];
}

// ---------- leaf ↔ bird geometry (local frame: 1 unit = leaf length; tip/head up at y = -0.5) ----------
const N = 120, M = 28;
const VALLEYS = [0.22, 0.4, 0.58, 0.75];
const PEAKS = [0.31, 0.49, 0.66, 0.84];
const lobeF = (s: number, depth: number) => 1 - depth * VALLEYS.reduce((acc, v) => acc + Math.exp(-Math.pow((s - v) / 0.05, 2)), 0);
function leafEdge(s: number): Vec2 {
  const env = 0.29 * Math.pow(Math.sin(Math.PI * Math.pow(s, 1.2)), 0.85);
  return [env * lobeF(s, 0.5), 0.5 - s];
}
const W_R0: Vec2 = [0.07, 0.12], W_T: Vec2 = [1.32, -0.2], W_S: Vec2 = [0.07, -0.17];
function wingEdge(s: number): Vec2 {
  if (s <= 0.8) {
    const u = s / 0.8;
    const bx = lerp(W_R0[0], W_T[0], u), by = lerp(W_R0[1], W_T[1], u) + 0.2 * Math.sin(Math.PI * u) * (1 - 0.45 * u);
    // feather notches at the same s as the leaf's lobe valleys: pull toward the leading edge
    const notch = VALLEYS.reduce((acc, v) => acc + Math.exp(-Math.pow((s - v) / 0.035, 2)), 0) * (0.03 + 0.07 * u);
    return [bx - notch * 0.25, by - notch];
  }
  const u = (s - 0.8) / 0.2;
  return [lerp(W_T[0], W_S[0], u), lerp(W_T[1], W_S[1], u) - 0.09 * Math.sin(Math.PI * u)];
}
const S_EDGE = Array.from({ length: N + 1 }, (_, i) => i / N);
const LEAF_HALF: Vec2[] = [...S_EDGE.map(leafEdge), ...Array.from({ length: M + 1 }, (_, j) => [0, lerp(-0.5, 0.5, j / M)] as Vec2)];
const WING: Vec2[] = [...S_EDGE.map(wingEdge), ...Array.from({ length: M + 1 }, (_, j) => [W_S[0], lerp(W_S[1], W_R0[1], j / M)] as Vec2)];
// body: right side top→bottom, then mirrored
const BK = 64;
const birdHW = curve([{ t: 0, v: 0 }, { t: 0.05, v: 0.075 }, { t: 0.14, v: 0.105 }, { t: 0.27, v: 0.095 }, { t: 0.45, v: 0.15 }, { t: 0.62, v: 0.11 }, { t: 0.76, v: 0.055 }, { t: 0.97, v: 0.12, d: 0 }, { t: 1, v: 0.0 }]);
function bodyPts(w: number): Vec2[] {
  const right: Vec2[] = [];
  for (let i = 0; i <= BK; i++) {
    const v = i / BK;
    const ly = lerp(-0.5, 0.72, v), lw = v < 0.82 ? 0.016 * Math.sin(Math.PI * Math.min(1, v / 0.82)) + 0.008 : 0.011;
    const by = lerp(-0.4, 0.52, v), bw = birdHW(v);
    right.push([lerp(lw, bw, w), lerp(ly, by, w)]);
  }
  return [...right, ...right.slice(1, -1).reverse().map(([x, y]) => [-x, y] as Vec2)];
}
const blendPts = (a: Vec2[], b: Vec2[], w: (i: number) => number) => a.map((p, i) => { const k = w(i); return [lerp(p[0], b[i][0], k), lerp(p[1], b[i][1], k)] as Vec2; });

// unit oak leaf path for the canopy (cheap)
const SMALL_LEAF = (() => {
  const p = new Path2D();
  const n = 26;
  for (let i = 0; i <= n; i++) { const [x, y] = leafEdge(i / n); i ? p.lineTo(x, y) : p.moveTo(x, y); }
  for (let i = n; i >= 0; i--) { const [x, y] = leafEdge(i / n); p.lineTo(-x, y); }
  p.closePath();
  return p;
})();

// ---------- camera (world point at screen centre + log zoom, Hermite, all channels on their own keys) ----------
const [HX, HY] = HERO_ON_TREE;
const camX = curve([
  { t: 0, v: TX }, { t: 1.6, v: TX + 1 }, { t: 3.3, v: TX + 14 }, { t: 4.6, v: 600 }, { t: 5.4, v: 640, d: 45 },
  { t: 6.5, v: HX + 70 }, { t: 7.3, v: HX + 140, d: 70 }, { t: 8.2, v: HX + 175 }, { t: 9.5, v: 800, d: -80 }, { t: 10.6, v: 720 }, { t: D, v: 712 },
]);
const camY = curve([
  { t: 0, v: GY - 12 }, { t: 1.7, v: GY - 15, d: -8 }, { t: 2.5, v: GY - 48 }, { t: 3.4, v: GY - 150 }, { t: 4.4, v: 395 }, { t: 5.2, v: 372, d: 0 },
  { t: 6.4, v: HY + 40 }, { t: 7.3, v: HY + 82, d: 8 }, { t: 8.2, v: HY + 50, d: -70 }, { t: 9.5, v: 345 }, { t: 10.7, v: 322 }, { t: D, v: 320 },
]);
const camLZ = curve([
  { t: 0, v: Math.log(4.6) }, { t: 1.5, v: Math.log(4.78), d: 0 }, { t: 2.4, v: Math.log(3.7) }, { t: 3.4, v: Math.log(2.0) },
  { t: 4.4, v: Math.log(1.22) }, { t: 5.1, v: Math.log(0.99) }, { t: 5.5, v: Math.log(1.0), d: 0.12 }, { t: 6.5, v: Math.log(1.65) }, { t: 7.3, v: Math.log(2.15), d: 0.08 },
  { t: 8.1, v: Math.log(1.95), d: -0.4 }, { t: 9.4, v: Math.log(1.12) }, { t: 10.6, v: Math.log(0.92) }, { t: D, v: Math.log(0.905) },
]);
const camRoll = curve([
  { t: 0, v: 0 }, { t: 2.0, v: 0.0 }, { t: 3.4, v: -0.025 }, { t: 5.0, v: 0.0 }, { t: 6.8, v: 0.03 }, { t: 7.8, v: 0.045 }, { t: 9.4, v: -0.015 }, { t: 10.6, v: 0.004 }, { t: D, v: 0 },
]);
interface Cam { x: number; y: number; z: number; roll: number }
const cam = (t: number): Cam => ({ x: camX(t), y: camY(t), z: Math.exp(camLZ(t)), roll: camRoll(t) });
/** Put the context in a parallax layer: depth f (1 = the tree's plane, <1 farther, >1 nearer). */
function layer(ctx: CanvasRenderingContext2D, c: Cam, f: number) {
  const zf = Math.pow(c.z, f);
  ctx.translate(640, 360);
  ctx.rotate(c.roll * f);
  ctx.scale(zf, zf);
  ctx.translate(-(640 + (c.x - 640) * f), -(360 + (c.y - 360) * f));
}

// ---------- hero leaf / bird motion ----------
const FALL_X: Key[] = [{ t: DETACH, v: 0, d: 60 }, { t: 6.4, v: 70 }, { t: 7.1, v: 125 }, { t: 7.7, v: 165, d: 60 }, { t: 8.3, v: 215, d: 110 }, { t: 9.4, v: 330 }, { t: 10.4, v: 430 }, { t: D, v: 520 }];
const FALL_Y: Key[] = [{ t: DETACH, v: 0, d: -10 }, { t: 6.4, v: 42 }, { t: 7.1, v: 92 }, { t: 7.65, v: 112, d: 0 }, { t: 8.2, v: 88, d: -90 }, { t: 9.4, v: -40 }, { t: 10.4, v: -150 }, { t: D, v: -235 }];
const fx = curve(FALL_X), fy = curve(FALL_Y);
const heroScale = curve([{ t: DETACH, v: HERO_S0, d: 26 }, { t: 6.3, v: 36 }, { t: 6.9, v: 50 }, { t: 7.4, v: 58 }, { t: 7.9, v: 62, d: 0 }, { t: 8.8, v: 46 }, { t: 9.8, v: 26 }, { t: 10.8, v: 13 }, { t: D, v: 10 }]);
const M0 = 6.98, M1 = 7.9;
const heading = curve([{ t: DETACH, v: HERO_ANG0 }, { t: 6.4, v: 1.6 }, { t: 7.0, v: 1.15 }, { t: 7.7, v: 0.42, d: 0 }]); // leaf → bird
function heroPose(t: number) {
  const base = sway(HERO_ON_TREE, Math.min(t, DETACH));
  const tau = Math.max(0, t - DETACH);
  const w = win(t, M0, M1);
  const flutter = (1 - w) * win(t, DETACH, DETACH + 0.4);
  const x = base[0] + fx(Math.max(t, DETACH)) + 22 * Math.sin(tau * 4.2) * flutter;
  const y = base[1] + fy(Math.max(t, DETACH)) - 5 * Math.abs(Math.cos(tau * 4.2)) * flutter;
  const rot = heading(t) + 0.55 * Math.cos(tau * 4.2) * flutter;
  // tumble about the midrib: edge-on at ~M0 (the hide moment), re-opens as wings
  const flip = t < DETACH ? 1 : Math.cos(Math.PI * smooth((t - 6.72) / 0.62));
  const sc = t < DETACH ? HERO_S0 : heroScale(t);
  return { x, y, rot, flip, w, sc };
}

// ---------- drawing helpers ----------
function poly(ctx: CanvasRenderingContext2D, pts: Vec2[], mirror = false) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(mirror ? -x : x, y) : ctx.moveTo(mirror ? -x : x, y)));
  ctx.closePath();
}
const rotAbout = (p: Vec2, c: Vec2, a: number): Vec2 => {
  const cs = Math.cos(a), sn = Math.sin(a), dx = p[0] - c[0], dy = p[1] - c[1];
  return [c[0] + cs * dx - sn * dy, c[1] + sn * dx + cs * dy];
};

function drawHero(ctx: CanvasRenderingContext2D, t: number) {
  const { x, y, rot, flip, w, sc } = heroPose(t);
  // Zipper: the outer edge (lobes) leads, root follows. k(i) per edge sample.
  const kEdge = (i: number) => {
    if (i > N) return smooth((w - 0.25) / 0.75);
    const s = i / N;
    const outer = 1 - Math.abs(s - 0.62) / 0.62;
    return smooth((w - 0.3 * (1 - outer)) / 0.7);
  };
  const wingLocal = blendPts(LEAF_HALF, WING, kEdge);
  const body = bodyPts(smooth((w - 0.15) / 0.85));
  // flap: starts gently inside the morph, full beat after
  // wings open flat first (a glide), then the first beat is a DOWNstroke that stops the fall
  const amp = 0.6 * win(t, 7.55, 8.2);
  const ph = (t - 7.62) * Math.PI * 2 * 3.0 + Math.PI;
  const flapA = amp * Math.sin(ph) + 0.06 * win(t, 7.2, 7.7);
  const pivot: Vec2 = [0.06, -0.03];
  const wingR = wingLocal.map(p => rotAbout(p, pivot, -flapA));
  // foreshorten span on the upstroke a little (the wing tilts away)
  const spanK = 1 - 0.18 * amp * (0.5 + 0.5 * Math.sin(ph));
  const wingF = wingR.map(([px, py]) => [px * lerp(1, spanK, smooth(px)), py] as Vec2);

  const flipAbs = Math.max(0.035, Math.abs(flip));
  const under = flip < 0 && w < 0.5;
  const leafCol = under ? PAL.amberPale : PAL.amber;
  const col = mixc(leafCol, PAL.amber, smooth(w * 2));

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(sc * flipAbs, sc);
  // soft cast shade under the bird for separation from the canopy
  ctx.fillStyle = css(col);
  for (const m of [false, true]) { poly(ctx, wingF, m); ctx.fill(); }
  // dark primaries arrive with the feathers (clipped to the wing)
  const tipA = smooth((w - 0.45) / 0.55);
  if (tipA > 0) {
    for (const m of [false, true]) {
      ctx.save();
      poly(ctx, wingF, m); ctx.clip();
      ctx.fillStyle = css(PAL.tipDark, tipA);
      ctx.beginPath();
      // region beyond 62% of the span, following the flap
      const a = rotAbout([0.82, -1.2], pivot, -flapA), b = rotAbout([2.2, -1.2], pivot, -flapA), c2 = rotAbout([2.2, 1.2], pivot, -flapA), d = rotAbout([0.72, 1.2], pivot, -flapA);
      const mx = (p: Vec2) => (m ? -p[0] : p[0]);
      ctx.moveTo(mx(a), a[1]); ctx.lineTo(mx(b), b[1]); ctx.lineTo(mx(c2), c2[1]); ctx.lineTo(mx(d), d[1]); ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  poly(ctx, body); ctx.fillStyle = css(mixc(col, hexc("#c4762c"), w)); ctx.fill();
  // head cap darkens as the head forms
  if (w > 0.4) {
    ctx.fillStyle = css(PAL.tipDark, 0.85 * smooth((w - 0.4) / 0.6));
    ctx.beginPath(); ctx.ellipse(0, -0.31, 0.088, 0.085, 0, 0, Math.PI * 2); ctx.fill();
    // beak at the old leaf tip
    ctx.fillStyle = css(hexc("#3e2716"), smooth((w - 0.55) / 0.45));
    ctx.beginPath(); ctx.moveTo(-0.025, -0.385); ctx.lineTo(0, -0.47); ctx.lineTo(0.025, -0.385); ctx.closePath(); ctx.fill();
  }
  // veins → feather shafts (same edge samples, so they ride the morph)
  const veinA = lerp(0.9, 0.45, w);
  ctx.strokeStyle = css(PAL.vein, veinA);
  ctx.lineCap = "round";
  ctx.lineWidth = lerp(0.022, 0.014, w);
  for (const m of [false, true]) {
    const sx = m ? -1 : 1;
    ctx.beginPath();
    for (const pk of PEAKS) {
      const i = Math.round(pk * N);
      const tip = wingF[i];
      const rootIdx = N + 1 + Math.round(clamp(1 - pk * 0.9) * M);
      const r0 = wingF[rootIdx];
      ctx.moveTo(sx * r0[0], r0[1]);
      ctx.lineTo(sx * lerp(r0[0], tip[0], 0.86), lerp(r0[1], tip[1], 0.86));
    }
    ctx.stroke();
  }
  if (w < 1) { // midrib
    ctx.strokeStyle = css(PAL.vein, 0.9 * (1 - w));
    ctx.lineWidth = 0.025;
    ctx.beginPath(); ctx.moveTo(0, 0.6); ctx.lineTo(0, -0.42); ctx.stroke();
  }
  ctx.restore();
}

function drawAcorn(ctx: CanvasRenderingContext2D, t: number, trunkR: number) {
  // rocking after the raindrop (damped), crack opens, halves pushed apart by the trunk
  const hit = 0.78;
  const rock = t > hit ? 0.16 * Math.exp(-(t - hit) * 2.6) * Math.sin((t - hit) * 13) : 0;
  const open = win(t, 1.35, 1.9);
  const push = Math.max(0, trunkR - 2);
  const cy = GY - 9;
  if (open <= 0) {
    ctx.save(); ctx.translate(TX, GY); ctx.rotate(rock); ctx.translate(-TX, -GY);
    ctx.beginPath(); ctx.ellipse(TX, cy, 7.6, 9.6, 0, 0, Math.PI * 2); ctx.fillStyle = css(PAL.nut); ctx.fill();
    ctx.beginPath(); ctx.moveTo(TX - 1.6, cy + 9); ctx.lineTo(TX, cy + 11.3); ctx.lineTo(TX + 1.6, cy + 9); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(TX - 3.4, cy + 1, 1.7, 5.2, -0.12, 0, Math.PI * 2); ctx.fillStyle = css(PAL.nutLit); ctx.fill();
    ctx.restore();
  } else for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(TX + side * (open * 2.2 + push * 0.9), GY);
    ctx.rotate(rock + side * (open * 0.28 + clamp(push / 14) * 0.9));
    ctx.translate(-TX, -GY);
    ctx.beginPath();
    ctx.ellipse(TX, cy, 7.6, 9.6, 0, side < 0 ? Math.PI / 2 : -Math.PI / 2, side < 0 ? Math.PI * 1.5 : Math.PI / 2);
    ctx.closePath();
    ctx.fillStyle = css(PAL.nut); ctx.fill();
    ctx.beginPath(); ctx.ellipse(TX + side * 3.2, cy + 1, 1.6, 5, side * 0.15, 0, Math.PI * 2);
    if (side < 0) { ctx.fillStyle = css(PAL.nutLit); ctx.fill(); }
    // pointed tip
    ctx.beginPath(); ctx.moveTo(TX + side * 1.4, cy + 9); ctx.lineTo(TX, cy + 11.3); ctx.lineTo(TX, cy + 8); ctx.closePath();
    ctx.fillStyle = css(PAL.nut); ctx.fill();
    ctx.restore();
  }
  // cap: lifted by the shoot, tips over and lands beside the trunk
  const lift = win(t, 1.6, 2.05), fall = win(t, 1.95, 2.55);
  const capX = TX + lerp(0, 17, fall) + rock * 6, capY = lerp(cy - 6 - lift * 7, GY - 3.2, fall) - 10 * Math.sin(Math.PI * fall) * 0.6;
  const capRot = rock + lerp(0, 1.9, fall) + 0.2 * lift;
  ctx.save();
  ctx.translate(capX, capY); ctx.rotate(capRot);
  ctx.beginPath(); ctx.ellipse(0, 0, 9.2, 5.2, 0, Math.PI, Math.PI * 2); ctx.lineTo(9.2, 1.4); ctx.quadraticCurveTo(0, 3.4, -9.2, 1.4); ctx.closePath();
  ctx.fillStyle = css(PAL.cap); ctx.fill();
  ctx.save(); ctx.clip();
  ctx.strokeStyle = css(PAL.capLine); ctx.lineWidth = 0.7;
  for (let k = -12; k < 12; k += 2.6) { ctx.beginPath(); ctx.moveTo(k, 3); ctx.lineTo(k + 6, -6); ctx.moveTo(k, -6); ctx.lineTo(k + 6, 3); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = css(PAL.capLine); ctx.fillRect(-0.9, -8, 1.8, 3.4); // stalk
  ctx.restore();
}

function hill(ctx: CanvasRenderingContext2D, base: number, amp: number, freq: number, phase: number, col: RGB) {
  ctx.beginPath();
  ctx.moveTo(-1400, 1600);
  for (let x = -1400; x <= 2700; x += 20) ctx.lineTo(x, base - amp * (0.6 * Math.sin(x * freq + phase) + 0.4 * Math.sin(x * freq * 2.3 + phase * 1.7)));
  ctx.lineTo(2700, 1600); ctx.closePath();
  ctx.fillStyle = css(col); ctx.fill();
}

export const scene: MorphScene = {
  id: "r2-acorn-oak-bird",
  title: "MM82 · 橡果 → 橡树 → 落叶 → 飞鸟（一镜到底）",
  duration: D,
  draw(ctx, t) {
    const c = cam(t);
    // sky (screen-fixed gradient, tinted slightly by camera height)
    const sk = ctx.createLinearGradient(0, 0, 0, 720);
    sk.addColorStop(0, css(PAL.skyTop)); sk.addColorStop(1, css(PAL.skyLow));
    ctx.fillStyle = sk; ctx.fillRect(-10, -10, 1300, 740);

    ctx.save(); layer(ctx, c, 0.06);
    ctx.fillStyle = css(PAL.sun, 0.9); ctx.beginPath(); ctx.arc(1010, 150, 46, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save(); layer(ctx, c, 0.22); hill(ctx, 560, 34, 0.004, 1.2, PAL.hillFar); ctx.restore();
    ctx.save(); layer(ctx, c, 0.5); hill(ctx, 588, 26, 0.0062, 3.1, PAL.hillMid); ctx.restore();

    // ---- the tree plane ----
    ctx.save(); layer(ctx, c, 1);
    // ground: meadow strip + soil cross-section
    const wet = win(t, 0.85, 2.2);
    ctx.fillStyle = css(PAL.soil); ctx.fillRect(-1400, GY + 6, 4200, 900);
    const sg = ctx.createLinearGradient(0, GY + 6, 0, GY + 240);
    sg.addColorStop(0, css(PAL.soil, 0)); sg.addColorStop(1, css(PAL.soilDeep));
    ctx.fillStyle = sg; ctx.fillRect(-1400, GY + 6, 4200, 240);
    ctx.fillStyle = css(PAL.soilDeep); ctx.fillRect(-1400, GY + 240, 4200, 900);
    // pebbles: a static cross-section texture
    ctx.fillStyle = css(PAL.soilDeep, 0.55);
    for (const [px, py, pr] of PEBBLES) { ctx.beginPath(); ctx.ellipse(px, py, pr * 1.4, pr, 0, 0, Math.PI * 2); ctx.fill(); }
    if (wet > 0) { // the raindrop soaks in around the acorn
      const wr = 6 + 30 * wet;
      const wg = ctx.createRadialGradient(TX, GY + 6, 0, TX, GY + 6, wr);
      wg.addColorStop(0, css(PAL.wet, 0.32 * (1 - win(t, 2.6, 4.2)))); wg.addColorStop(1, css(PAL.wet, 0));
      ctx.fillStyle = wg; ctx.fillRect(TX - wr, GY + 6, wr * 2, wr);
    }
    // roots
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const r of ROOTS) {
      const g = clamp((t - r.t0) / (r.t1 - r.t0));
      if (g <= 0) continue;
      const n = (r.pts.length - 1) * g;
      const thick = 0.45 + 0.55 * win(t, r.t0, 5.6);
      ctx.strokeStyle = css(mixc(PAL.root, PAL.barkLit, win(t, 3.5, 5.5) * 0.55));
      ctx.lineWidth = r.w * thick;
      ctx.beginPath(); ctx.moveTo(r.pts[0][0], r.pts[0][1]);
      for (let i = 1; i <= Math.floor(n); i++) ctx.lineTo(r.pts[i][0], r.pts[i][1]);
      const f = n - Math.floor(n), i0 = Math.floor(n);
      if (i0 < r.pts.length - 1) ctx.lineTo(lerp(r.pts[i0][0], r.pts[i0 + 1][0], f), lerp(r.pts[i0][1], r.pts[i0 + 1][1], f));
      ctx.stroke();
    }
    ctx.fillStyle = css(PAL.meadow); ctx.fillRect(-1400, GY - 1, 4200, 8);
    // trunk + branches
    // Pipe model over what has grown SO FAR: a branch is only as thick as the twigs it already carries.
    const mat = maturity(t);
    const live = new Float64Array(nodes.length);
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (nodeT[i] > t) continue;
      // a node with no grown children yet is a tip; its weight ramps in so nothing thickens in one frame
      if (live[i] === 0) live[i] = 0.3 + 0.7 * clamp((t - nodeT[i]) / 0.5);
      if (i > 0) live[nodes[i].parent] = Math.pow(Math.pow(live[nodes[i].parent], 2.4) + Math.pow(live[i], 2.4), 1 / 2.4);
    }
    const thick = (i: number) => Math.max(0.9, live[i] * (1.3 + 0.35 * mat));
    const trunkR = nodes.length > 1 && t > nodeT[1] ? thick(0) : 0;
    drawAcorn(ctx, t, trunkR);
    ctx.save();
    ctx.beginPath(); ctx.rect(-1400, -2000, 4200, GY + 2000 + 2); ctx.clip(); // the trunk stops at the ground; roots carry on below
    // root flare: the trunk widens into the ground
    if (trunkR > 1.5) {
      const b = sway([TX, GY - 4], t), fl = trunkR * 1.9, h = trunkR * 2.2;
      ctx.fillStyle = css(PAL.bark);
      ctx.beginPath(); ctx.moveTo(b[0] - fl, GY + 2); ctx.quadraticCurveTo(b[0] - trunkR, GY - 2, b[0] - trunkR * 0.95, GY - h);
      ctx.lineTo(b[0] + trunkR * 0.95, GY - h); ctx.quadraticCurveTo(b[0] + trunkR, GY - 2, b[0] + fl, GY + 2); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = css(PAL.bark);
    // ~2900 branch segments: batch them by line width (quantised to 0.25 px) and stroke each batch once.
    const byWidth = new Map<number, Path2D>();
    for (let i = 1; i < nodes.length; i++) {
      if (t <= nodeT[i - 1] && t <= nodeT[i]) continue;
      const n = nodes[i], parent = nodes[n.parent];
      const tp = nodeT[n.parent], ti = nodeT[i];
      const g = clamp((t - Math.max(tp, ti - 0.12)) / 0.12);
      if (g <= 0) continue;
      const a = sway(parent.p, t), b0 = sway(n.p, t);
      const b: Vec2 = [lerp(a[0], b0[0], g), lerp(a[1], b0[1], g)];
      const w = Math.round(2 * thick(i) * (0.6 + 0.4 * g) * 4) / 4;
      let path = byWidth.get(w);
      if (!path) byWidth.set(w, path = new Path2D());
      path.moveTo(a[0], a[1]); path.lineTo(b[0], b[1]);
    }
    for (const [w, path] of byWidth) { ctx.lineWidth = w; ctx.stroke(path); }
    ctx.restore();
    // first pair of seedling leaves rides the leading tip, then stays on the trunk
    {
      let lead = 0;
      for (let i = 1; i < nodes.length && nodeT[i] <= t; i++) if (nodes[i].parent === lead) lead = i;
      const p = sway(nodes[lead].p, t);
      const s = 11 * backOut(win(t, 1.85, 2.4), 1.3) * (1 - win(t, 4.0, 4.7));
      if (s > 0.05) for (const side of [-1, 1]) {
        const ss = s * (side < 0 ? 1 : 0.88);
        ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(side * 1.05 + 0.06 * Math.sin(t * 2 + side)); ctx.translate(0, -ss * 0.48); ctx.scale(ss * 1.25, ss);
        ctx.fillStyle = css(PAL.leafLit); ctx.fill(SMALL_LEAF); ctx.restore();
      }
    }
    // canopy masses (dark) then leaves
    // three flat tones: shadow mass, body, lit tops offset toward the sun
    for (const [col, dx, dy, kr, minLit] of [[PAL.leafDark, 0, 0, 1, -1], [PAL.leafMid, 2, -6, 0.86, 0.12], [PAL.leafLit, 4, -10, 0.55, 0.55]] as [RGB, number, number, number, number][]) {
      ctx.fillStyle = css(col);
      ctx.beginPath();
      for (const k of clumps) {
        if (k.lit < minLit) continue;
        const g = backOut(clamp((t - k.t0) / 0.6), 1.2);
        if (g <= 0) continue;
        const p = sway(k.p, t);
        const r = k.r * g * kr * (minLit < 0 ? 1 : clamp((k.lit - minLit) * 4, 0.5, 1));
        ctx.moveTo(p[0] + dx * g + r, p[1] + dy * g); ctx.arc(p[0] + dx * g, p[1] + dy * g, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    // Leaves sit on top of the clump masses: ~2000 slightly larger ones read the same as the original ~7000 and keep
    // the shot at 60 fps (7000 fills cost ~20–35 ms a frame at dpr 2, whichever way they are drawn).
    const base = ctx.getTransform();
    for (const l of leaves) {
      const g = backOut(clamp((l.t0 - t) / -0.45), 1.6);
      if (g <= 0) continue;
      const p = sway(l.p, t);
      const flutter = 0.25 * gust(t, p[0]) * Math.sin(t * 17 + l.p[0]);
      ctx.setTransform(base); ctx.translate(p[0], p[1]); ctx.rotate(l.ang + flutter); ctx.scale(l.size * g, l.size * g);
      ctx.fillStyle = css(l.col); ctx.fill(SMALL_LEAF);
    }
    ctx.setTransform(base);
    // hero leaf on the tree: buds green, ripens amber before the gust
    if (t < DETACH) {
      const g = backOut(clamp((t - (nodeT[HN] + 0.25)) / 0.5), 1.5);
      if (g > 0) {
        const p = sway(HERO_ON_TREE, t);
        const ripe = win(t, 4.3, 5.3);
        const tug = 0.35 * gust(t, p[0]) * Math.sin(t * 15);
        ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(HERO_ANG0 + tug); ctx.scale(HERO_S0 * g, HERO_S0 * g);
        ctx.fillStyle = css(mixc(PAL.leafLit, PAL.amber, ripe)); ctx.fill(SMALL_LEAF);
        ctx.strokeStyle = css(PAL.vein, 0.8 * ripe); ctx.lineWidth = 0.03; ctx.beginPath(); ctx.moveTo(0, 0.55); ctx.lineTo(0, -0.42); ctx.stroke();
        ctx.restore();
      }
    }
    // grass blades along the horizon; the gust is a wave that runs through them
    ctx.fillStyle = css(PAL.grass);
    ctx.beginPath();
    const gr = rng(3);
    for (let x = -700; x < 2000; x += 5) {
      const h = 5 + gr() * 8, jitter = gr() * 4;
      const lean = (2 + h * 0.2) * breeze(t + x * 0.003) * 0.4 + h * 0.9 * gust(t, x);
      const bx = x + jitter;
      ctx.moveTo(bx - 1.6, GY + 1); ctx.quadraticCurveTo(bx + lean * 0.4, GY - h * 0.6, bx + lean, GY - h); ctx.lineTo(bx + 1.6, GY + 1);
    }
    ctx.fill();
    // raindrop (cause) and its splash
    if (t < 1.25) {
      const fall = clamp(t / 0.78);
      if (t < 0.78) {
        const yy = lerp(GY - 150, GY - 20, fall * fall);
        ctx.fillStyle = css(hexc("#e6f2f5"), 0.95);
        ctx.beginPath(); ctx.moveTo(TX + 0.5, yy - 9); ctx.quadraticCurveTo(TX + 3.6, yy - 1, TX + 0.5, yy + 2.6); ctx.quadraticCurveTo(TX - 2.6, yy - 1, TX + 0.5, yy - 9); ctx.fill();
      } else {
        const u = (t - 0.78) / 0.47;
        ctx.fillStyle = css(hexc("#e6f2f5"), 0.9 * (1 - u));
        for (let k = 0; k < 6; k++) {
          const a = -Math.PI / 2 + (k - 2.5) * 0.45;
          const d = 4 + u * 16;
          ctx.beginPath(); ctx.arc(TX + Math.cos(a) * d, GY - 20 + Math.sin(a) * d * 0.7 + u * u * 18, 1.3 * (1 - u * 0.5), 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    ctx.restore();

    // foreground tufts (nearer than the tree: they slide faster)
    ctx.save(); layer(ctx, c, 1.3);
    ctx.fillStyle = css(PAL.fg);
    const fr = rng(21);
    ctx.beginPath();
    for (const cx0 of [130, 260, 980, 1150, 1290]) {
      for (let k = 0; k < 9; k++) {
        const bx = cx0 + (fr() - 0.5) * 40, h = 18 + fr() * 26;
        const lean = h * 0.5 * gust(t, bx) + 2 * breeze(t + k);
        ctx.moveTo(bx - 3, GY + 30); ctx.quadraticCurveTo(bx + lean * 0.3, GY + 30 - h * 0.6, bx + lean + (fr() - 0.5) * 8, GY + 30 - h); ctx.lineTo(bx + 3, GY + 30);
      }
    }
    ctx.fill();
    ctx.restore();

    // the hero leaf / bird flies in the tree's plane (it carries its own scale for depth)
    if (t >= DETACH) { ctx.save(); layer(ctx, c, 1); drawHero(ctx, t); ctx.restore(); }
  },
};
