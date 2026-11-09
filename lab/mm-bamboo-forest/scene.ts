import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import { curve } from "../../packages/morph-engine/src/vector/camera-move";
import { framePath, mixColor } from "../../packages/morph-engine/src/vector/render";
import { layoutText, type GlyphSet } from "../../packages/morph-engine/src/vector/text";
import sc from "./glyphs-sc.json";
import zhuSet from "./glyphs-zhu.json";
import { fieldMorph, rasterInside } from "../../packages/morph-engine/src/vector/sdf-field";

/*
 * MM72 — 竹 → 竹林. The character IS the plant: ink painters build bamboo leaves in 个 and 介 shapes ("个字叶"),
 * and 竹 is two 个 side by side. So every stroke of a geometric 竹 has a botanical fate:
 *   竖钩 (two)            → the two stalks: the stroke stretches up and down, nodes appear along it as it grows
 *   撇 + 横 + hook (each) → one 个 group of three leaves at a twig's tip (a 撇 is already leaf-shaped)
 *   born                  → a 介 group (four leaves) per stalk, grown from a twig: the clump fills out
 * Then the camera pulls back and rises through a real depth field (every clump has a Z; flat cards, true parallax),
 * and the forest shoots up around the first clump in waves, 雨后春笋. Far clumps are paler (ink thins with
 * distance) and their feet sink into a mist band. It lands on the title 竹林 and a red seal.
 *
 * One primitive draws everything: a stroke with a centreline (curvature), a thickness and a taper (0 = round caps,
 * a pen stroke; 1 = pointed both ends, a leaf). A stroke becomes a stalk or a leaf by a parameter blend, never a
 * point morph, so nothing tangles.
 */

export const INK = "#141414", PAPER = "#f1ebdf", SEAL = "#d31036";
export const DURATION = 13.3;

// ——— the stroke primitive ———
interface Stroke { x: number; y: number; dir: number; len: number; th: number; kappa: number; taper: number }
type P2 = [number, number];
const D = Math.PI / 180;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const v = clamp(x); return v * v * (3 - 2 * v); };
const hit = (x: number) => { const v = clamp(x); return v * v * (2.2 - 1.2 * v); };
const outEase = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a));

/** Point and tangent angle on the centreline, s measured from the middle. */
function along(st: Stroke, s: number): [number, number, number] {
  const a = st.dir + st.kappa * s;
  if (Math.abs(st.kappa) < 1e-7) return [st.x + s * Math.cos(st.dir), st.y + s * Math.sin(st.dir), st.dir];
  return [st.x + (Math.sin(a) - Math.sin(st.dir)) / st.kappa, st.y + (Math.cos(st.dir) - Math.cos(a)) / st.kappa, a];
}
function strokeRing(st: Stroke, n = 26): P2[] {
  const r = st.th / 2, L = Math.max(0.01, st.len), side: P2[] = [], back: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const u = (1 - Math.cos(Math.PI * i / n)) / 2;                 // denser at the ends: round caps stay round
    const d = Math.min(u, 1 - u) * L;
    const pill = d < r ? Math.sqrt(Math.max(0, r * r - (r - d) * (r - d))) : r;
    const leaf = r * Math.pow(Math.sin(Math.PI * u), 0.85);
    const hw = pill + (leaf - pill) * st.taper;
    const [px, py, a] = along(st, -L / 2 + L * u), nx = -Math.sin(a), ny = Math.cos(a);
    side.push([px + nx * hw, py + ny * hw]); back.push([px - nx * hw, py - ny * hw]);
  }
  return [...side, ...back.reverse()];
}
/** Blend two strokes. A stroke has no head or tail (both profiles are symmetric), so turn the short way mod 180°. */
function mixStroke(a: Stroke, b: Stroke, k: number): Stroke {
  let d = Math.atan2(Math.sin(b.dir - a.dir), Math.cos(b.dir - a.dir));
  // Walking a curve the other way round: the tangent turns by 180° and the curvature changes sign.
  if (Math.abs(d) > Math.PI / 2) { b = { ...b, dir: b.dir + Math.PI, kappa: -b.kappa }; d = Math.atan2(Math.sin(b.dir - a.dir), Math.cos(b.dir - a.dir)); }
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, dir: a.dir + d * k, len: a.len + (b.len - a.len) * k,
    th: a.th + (b.th - a.th) * k, kappa: a.kappa + (b.kappa - a.kappa) * k, taper: a.taper + (b.taper - a.taper) * k };
}
/** A stroke from two end points. */
const seg = (x0: number, y0: number, x1: number, y1: number, th: number, taper = 0, kappa = 0): Stroke =>
  ({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, dir: Math.atan2(y1 - y0, x1 - x0), len: Math.hypot(x1 - x0, y1 - y0), th, kappa, taper });
/** A leaf hanging from an apex at angle `deg`. */
const leafAt = (ax: number, ay: number, deg: number, len: number, th: number, bend = 0): Stroke =>
  ({ x: ax + Math.cos(deg * D) * len / 2, y: ay + Math.sin(deg * D) * len / 2, dir: deg * D, len, th, kappa: bend, taper: 1 });
/** Scale a stroke about a point (used to grow born leaves out of their apex). */
const grow = (st: Stroke, ax: number, ay: number, k: number): Stroke =>
  ({ ...st, x: ax + (st.x - ax) * k, y: ay + (st.y - ay) * k, len: st.len * k, th: st.th * (0.4 + 0.6 * k) });
/** A 个 (three leaves) or 介 (four) group: the painters' leaf clusters. */
const GE = [135, 92, 45], JIE = [150, 112, 70, 32];
const group = (ax: number, ay: number, dirs: number[], len: number, th: number, flip = 1) =>
  dirs.map((deg, i) => leafAt(ax, ay, flip > 0 ? deg : 180 - deg, len * (i === 1 && dirs.length === 3 ? 1.1 : 1), th, (i - (dirs.length - 1) / 2) * 0.0016 * flip));

// ——— the real character, and a painting built to rhyme with it ———
// 竹 is set in Noto Sans SC Black (one merged outline). The painting below is placed by reading the glyph: its two
// stalks stand where the 竖 and the 竖钩 stand, its leaves lie along the 撇 and the 横, the hook becomes a low leaf.
// The glyph field-morphs into this painting until the two are the same shape; only then do strokes take over.
const ZHU_SIZE = 380;
const zhu = layoutText(zhuSet as GlyphSet, "竹", { at: [0, 0], size: ZHU_SIZE })[0].shape;
const PAINT: Stroke[] = [
  seg(-95, -179, -161, -17, 54, 1, 0.0012),   // 0 left 撇 → leaf
  seg(-114, -101, -2, -101, 50, 1),           // 1 left 横 → leaf
  seg(-79, -122, -79, 176, 52),               // 2 left 竖 → stalk
  seg(54, -179, -12, -17, 54, 1, 0.0012),     // 3 right 撇 → leaf
  seg(-8, -88, 184, -88, 52, 1),              // 4 right 横 → leaf
  seg(107, -112, 107, 172, 52),               // 5 right 竖钩 → stalk
  seg(102, 170, 46, 124, 40, 1),              // 6 hook → low leaf
];

// ——— the hero clump (world units; the hero stands at Z = 1, where 1 unit = 1 px at the start) ———
const GROUND = 520;
const stalkTarget = (x: number, top: number, th: number, lean: number): Stroke =>
  ({ ...seg(x, GROUND, x + lean, top, th, 0), kappa: -Math.sign(lean) * 0.00003 });   // a slight bow, away from the lean
// The painting grows into a clump: stalks stretch, and each side's leaves gather under one twig tip as a 个.
const AL: [number, number] = [-122, -152], AR: [number, number] = [52, -182];
const CLUMP: Stroke[] = [
  leafAt(...AL, 122, 165, 34), leafAt(...AL, 16, 160, 34), stalkTarget(-79, -2600, 36, -70),
  leafAt(...AR, 116, 165, 34), leafAt(...AR, 14, 172, 34), stalkTarget(107, -2300, 33, 80),
  leafAt(...AR, 70, 178, 34),
];
const STALKS = [2, 5];
const TWIGS = [seg(-82, -112, ...AL, 8, 0.3), seg(102, -128, ...AR, 8, 0.3)];
// Born: the left 个's middle leaf, then 介 groups high on each stalk, each from its own twig.
const BORN = [
  { twig: null as Stroke | null, apex: AL, leaves: [leafAt(...AL, 72, 172, 34)], at: 1.7 },
  { twig: seg(-100, -560, -250, -640, 7, 0.3), apex: [-250, -640] as [number, number], leaves: group(-250, -640, JIE, 140, 28, 1), at: 2.05 },
  { twig: seg(122, -500, 272, -560, 7, 0.3), apex: [272, -560] as [number, number], leaves: group(272, -560, JIE, 140, 28, -1), at: 2.3 },
  { twig: seg(-95, -380, 30, -440, 6, 0.3), apex: [30, -440] as [number, number], leaves: group(30, -440, GE, 130, 26, -1), at: 2.55 },
];

// ——— the glyph → painting field morph (lazy: built on first use, frames cached on a 1/240 grid) ———
function inRing(r: ReadonlyArray<readonly [number, number]>, x: number, y: number) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
let zhuMorph: { at(k: number): Array<Array<[number, number]>> } | null = null;
const zhuCache = new Map<number, Array<Array<[number, number]>>>();
function glyphToPainting(k: number) {
  if (!zhuMorph) {
    const rings = PAINT.map(st => strokeRing(st, 40));
    const fill = (ctx: CanvasRenderingContext2D, rs: ReadonlyArray<ReadonlyArray<readonly [number, number]>>, rule: CanvasFillRule) => {
      const path = new Path2D(); for (const r of rs) { path.moveTo(r[0][0], r[0][1]); for (const q of r) path.lineTo(q[0], q[1]); path.closePath(); } ctx.fill(path, rule); };
    // Painted on a canvas when there is one (a few ms); exact point-in-polygon otherwise (~750 ms on this grid).
    const a = rasterInside([0, 0], 250, 340, ctx => fill(ctx, zhu.pieces.flatMap(p => [p.outer, ...p.holes]), "evenodd"))
      ?? (([x, y]) => zhu.pieces.some(p => inRing(p.outer, x, y) && !p.holes.some(h => inRing(h, x, y))));
    const b = rasterInside([0, 0], 250, 340, ctx => fill(ctx, rings, "nonzero")) ?? (([x, y]) => rings.some(r => inRing(r, x, y)));
    zhuMorph = fieldMorph([0, 0], 250, 340, a, b, 0.25) as unknown as typeof zhuMorph;
  }
  const q = Math.round(k * 240);
  if (!zhuCache.has(q)) zhuCache.set(q, zhuMorph!.at(q / 240) as Array<Array<[number, number]>>);
  return zhuCache.get(q)!;
}
/** The intro before the old timeline starts: glyph (hold) → field morph → painting. */
export const LEAD = 1.8;

/** Nodes every ~120 units up a stalk: thin paper bands across it. */
const NODE_STEP = 120;

// ——— the forest (seeded, so every frame and every run is the same) ———
interface Clump { X: number; Z: number; born: number; stalks: Stroke[]; groups: Array<{ twig: Stroke; leaves: Stroke[]; frac: number }> }
function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
const FOREST: Clump[] = (() => {
  const r = rng(72), out: Clump[] = [];
  for (let i = 0; i < 46; i++) {
    const Z = 1.6 + r() * 7.5, X = (r() * 2 - 1) * (650 + Z * 420) + 200;
    if (Z < 3 && Math.abs(X) < 420) continue;                         // keep the hero clear
    if (X > 240 + 170 * (Z + 1.56)) continue;                         // the right of the last frame stays open paper (留白) for the title
    const n = 2 + Math.floor(r() * 3), stalks: Stroke[] = [], groups: Clump["groups"] = [];
    for (let j = 0; j < n; j++) {
      const x = (j - (n - 1) / 2) * (70 + r() * 50) + (r() - 0.5) * 40, top = -(1900 + r() * 1400), lean = (r() - 0.5) * 160;
      stalks.push(stalkTarget(x, top, 24 + r() * 10, lean));
      for (let g = 0; g < 3; g++) {
        // frac: how far up the stalk (0 = ground). The ground end is s = −len/2.
        const frac = 0.2 + r() * 0.55, side = r() < 0.5 ? -1 : 1, [sx, sy] = along(stalks[j], (frac - 0.5) * stalks[j].len);
        const ax = sx + side * (110 + r() * 60), ay = sy - 50 - r() * 40;
        groups.push({ twig: seg(sx, sy, ax, ay, 6, 0.3), leaves: group(ax, ay, r() < 0.5 ? GE : JIE, 120 + r() * 45, 24 + r() * 6, side), frac });
      }
    }
    // 雨后春笋: clumps shoot up in waves outward from the hero.
    const dist = Math.hypot(X / 1.4, (Z - 1) * 260);
    out.push({ X, Z, born: 2.9 + dist / 520 + r() * 0.25, stalks, groups });
  }
  return out.sort((a, b) => b.Z - a.Z);                                 // painter's order: far first
})();

// ——— camera: pull back and rise, a coupled curve (soft start, fast middle, brake) ———
const camZ = curve([{ t: 0, v: 0 }, { t: 2.1, v: 0.05 }, { t: 5.0, v: -0.95 }, { t: 8.3, v: -1.5 }, { t: 11.5, v: -1.56 }]);
const camX = curve([{ t: 0, v: 0 }, { t: 2.4, v: 0 }, { t: 6.0, v: 150 }, { t: 8.4, v: 230 }, { t: 11.5, v: 240 }]);
const camY = curve([{ t: 0, v: 0 }, { t: 2.4, v: 0 }, { t: 6.4, v: -70 }, { t: 8.4, v: -95 }, { t: 11.5, v: -98 }]);
const CX = 640, CY = 400;

// ——— the title and the seal ———
const titleChars = ["竹", "林"].map((ch, i) => layoutText(sc as GlyphSet, ch, { at: [1118, 236 + i * 96], size: 82 })[0]);
const sealChar = layoutText(sc as GlyphSet, "竹", { at: [1118, 446], size: 40 })[0];

export function drawBamboo(ctx: CanvasRenderingContext2D, time: number) {
  const t = Math.max(0, time - LEAD);                 // the forest's own clock starts once the painting stands
  ctx.fillStyle = PAPER;
  ctx.fillRect(-4000, -4000, 10000, 10000);
  const cz = camZ(t), cx = camX(t), cy = camY(t);
  const project = (X: number, Z: number) => { const s = 1 / (Z - cz); return { s, ox: CX + (X - cx) * s, oy: CY - cy * s }; };
  const draw = (strokes: Stroke[], color: string, X: number, Z: number) => {
    const { s, ox, oy } = project(X, Z);
    ctx.fillStyle = color;
    const path = new Path2D();
    for (const st of strokes) {
      const ring = strokeRing(st);
      path.moveTo(ox + ring[0][0] * s, oy + ring[0][1] * s);
      for (let i = 1; i < ring.length; i++) path.lineTo(ox + ring[i][0] * s, oy + ring[i][1] * s);
      path.closePath();
    }
    ctx.fill(path, "nonzero");
  };
  const nodes = (stalks: Stroke[], X: number, Z: number, alpha = 1) => {
    const { s, ox, oy } = project(X, Z);
    if (alpha <= 0) return;
    if (s * 30 < 4) return;                                          // too far for nodes to read: they would stripe
    ctx.strokeStyle = PAPER; ctx.lineWidth = Math.max(0.6, 3.2 * s);
    ctx.beginPath();
    for (const st of stalks) {
      // Measured from the ground end (the lower one), so nodes ride up with a growing stalk instead of sliding.
      const lowEnd = along(st, st.len / 2)[1] > along(st, -st.len / 2)[1] ? 1 : -1;
      for (let d = NODE_STEP; d < st.len - 30; d += NODE_STEP) {
        const [px, py, a] = along(st, lowEnd * (st.len / 2 - d)), nx = -Math.sin(a) * st.th * 0.62, ny = Math.cos(a) * st.th * 0.62;
        ctx.moveTo(ox + (px - nx) * s, oy + (py - ny) * s); ctx.lineTo(ox + (px + nx) * s, oy + (py + ny) * s);
      }
    }
    ctx.globalAlpha = alpha; ctx.stroke(); ctx.globalAlpha = 1;
  };
  const ink = (Z: number) => mixColor(INK, PAPER, 0.9 * Math.pow(clamp((Z - 1) / 8.5), 0.6));

  // ——— the forest, far to near ———
  for (const c of FOREST) {
    const g = outEase(span(t, c.born, c.born + 1.15));
    if (g <= 0) continue;
    const color = ink(c.Z);
    // A shoot grows from the ground up: its foot stays planted, its tip rises.
    const stalks = c.stalks.map(st => { const len = st.len * g, [bx, by] = along(st, -st.len / 2); const [tx, ty] = along(st, -st.len / 2 + len); return { ...st, x: (bx + tx) / 2, y: (by + ty) / 2, len }; });
    const parts: Stroke[] = [...stalks];
    for (const gr of c.groups) {
      const k = smooth((g - gr.frac) / 0.22);           // leaves open once the shoot has passed their twig
      if (k <= 0) continue;
      const [ax, ay] = [gr.twig.x - Math.cos(gr.twig.dir) * gr.twig.len / 2, gr.twig.y - Math.sin(gr.twig.dir) * gr.twig.len / 2];
      parts.push(grow(gr.twig, ax, ay, k));
      const tip = along(gr.twig, gr.twig.len / 2);
      gr.leaves.forEach((lf, i) => { const kk = smooth((k - i * 0.12) / 0.64); if (kk > 0) parts.push(grow(lf, tip[0], tip[1], kk)); });
    }
    draw(parts, color, c.X, c.Z);
    nodes(stalks, c.X, c.Z);
  }

  // ——— the hero: 竹 (glyph) → the rhyming painting → one clump ———
  if (time < LEAD + 1.0) {
    const { s: sc, ox, oy } = project(0, 1);
    const path = new Path2D();
    const k = span(time, 0.9, 2.1);
    const rings: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = k <= 0 ? zhu.pieces.flatMap(p => [p.outer, ...p.holes]) : k >= 1 ? [] : glyphToPainting(k);
    for (const r of rings) { path.moveTo(ox + r[0][0] * sc, oy + r[0][1] * sc); for (const q of r) path.lineTo(ox + q[0] * sc, oy + q[1] * sc); path.closePath(); }
    ctx.fillStyle = INK; ctx.fill(path, "evenodd");
    if (k >= 1) { draw(PAINT, INK, 0, 1); nodes([PAINT[2], PAINT[5]], 0, 1, smooth(span(time, 2.05, 2.45))); }
  } else {
    const parts: Stroke[] = [];
    PAINT.forEach((st, i) => {
      const stalk = STALKS.includes(i), d = stalk ? STALKS.indexOf(i) * 0.12 : [0, 1, 3, 4, 6].indexOf(i) * 0.1;
      parts.push(mixStroke(st, CLUMP[i], hit(span(t, (stalk ? 1.0 : 1.2) + d, (stalk ? 2.35 : 2.3) + d))));
    });
    TWIGS.forEach((tw, j) => {
      const k = smooth(span(t, 1.5 + j * 0.1, 2.2 + j * 0.1));
      if (k > 0) parts.push(grow(tw, tw.x - Math.cos(tw.dir) * tw.len / 2, tw.y - Math.sin(tw.dir) * tw.len / 2, k));
    });
    for (const b of BORN) {
      const k = smooth(span(t, b.at, b.at + 0.7));
      if (k <= 0) continue;
      if (b.twig) parts.push(grow(b.twig, b.twig.x - Math.cos(b.twig.dir) * b.twig.len / 2, b.twig.y - Math.sin(b.twig.dir) * b.twig.len / 2, k));
      b.leaves.forEach((lf, i) => { const kk = smooth((k - (b.twig ? 0.25 : 0) - i * 0.1) / 0.5); if (kk > 0) parts.push(grow(lf, b.apex[0], b.apex[1], kk)); });
    }
    draw(parts, INK, 0, 1);
    nodes(STALKS.map(i => parts[i]), 0, 1);
  }

  // ——— mist: the forest's feet sink into the paper (ink wash 留白) ———
  const mist = ctx.createLinearGradient(0, 470, 0, 690);
  mist.addColorStop(0, "rgba(241,235,223,0)"); mist.addColorStop(1, "rgba(241,235,223,1)");
  ctx.globalAlpha = smooth(span(t, 2.6, 5.5));
  ctx.fillStyle = mist; ctx.fillRect(-4000, 470, 10000, 4000);
  ctx.globalAlpha = 1;

  // ——— title (rolls in, character by character) and the seal (stamped) ———
  titleChars.forEach((ch, i) => {
    const k = hit(span(t, 8.3 + i * 0.22, 8.95 + i * 0.22));
    if (k <= 0) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(1050, ch.center[1] - 48, 140, 96); ctx.clip();
    ctx.translate(0, (1 - k) * 96);
    ctx.fillStyle = INK; ctx.fill(framePath(ch.shape), "evenodd");
    ctx.restore();
  });
  const st = span(t, 9.25, 9.4);
  if (st > 0) {
    const after = (t - 9.4), sq = after > 0 ? 0.08 * Math.exp(-after / 0.08) * Math.cos(after * 2 * Math.PI / 0.22) : 0;
    const sc = (1.5 - 0.5 * hit(st)) * (1 + sq);
    ctx.save();
    ctx.globalAlpha = smooth(st * 1.5);
    ctx.translate(1118, 446); ctx.scale(sc, sc); ctx.translate(-1118, -446);
    ctx.fillStyle = SEAL;
    ctx.beginPath(); ctx.roundRect(1118 - 31, 446 - 31, 62, 62, 6); ctx.fill();
    ctx.fillStyle = PAPER; ctx.fill(framePath(sealChar.shape), "evenodd");
    ctx.restore();
  }
}

export const scene: MorphScene = {
  id: "mm-bamboo-forest",
  title: "MM72 · 竹 → 竹林：笔画变竹竿与「个」字叶，镜头后拉，雨后春笋长成竹林",
  duration: DURATION,
  draw: drawBamboo,
};
