import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import { createSdfRenderer, type Prim, type RGB, type SdfRenderer, type Vec2 } from "../../packages/morph-engine/src/renderers/sdf-gl";
import { clamp, hex, lerp, mixRGB, resample, rng, smooth, smoother, strokePrims, win, type Stroke } from "../../packages/morph-engine/src/effects/skeleton";

/*
 * Glyph → object. The strokes of 鱼 are the skeleton of the fish.
 * The pictograph is respected: ⺈ is the head, 田 is the scaled body, the base stroke is the tail.
 * The glyph turns −90° so its top becomes the fish's head, then every brush stroke
 * slides along its own skeleton into a fish part. The base stroke splits into two tail lobes.
 */

const N = 12;
const C: Vec2 = [640, 330];
const INK: RGB = hex("#161311");
const KOI: RGB = hex("#e8582c");
const KOI_PALE: RGB = hex("#f6e6cf");
const FIN: RGB = hex("#f08a4b");

const P = (...pts: number[][]): Vec2[] => resample(pts as unknown as Vec2[], N);

// Brush strokes of 鱼 (simplified), in glyph space around C.
const GLYPH: Record<string, Vec2[]> = {
  pie: P([622, 140], [600, 175], [566, 214]),
  hengpie: P([606, 166], [690, 166], [664, 196], [632, 222]),
  left: P([548, 236], [552, 312], [556, 388]),
  hengzhe: P([548, 236], [646, 236], [742, 236], [736, 314], [730, 388]),
  midh: P([556, 312], [740, 312]),
  midv: P([646, 238], [646, 386]),
  bottom: P([556, 386], [734, 386]),
  baseA: P([486, 458], [640, 452], [800, 446]),
  baseB: P([486, 458], [640, 452], [800, 446]),
};
const BRUSH: Record<string, [number, number]> = {
  pie: [10, 3], hengpie: [9, 4], left: [10, 8], hengzhe: [9, 8], midh: [8, 7], midv: [8, 7], bottom: [9, 8], baseA: [11, 6], baseB: [11, 6],
};

// Fish parts in fish space (heading left).
const spine = (x: number) => 330 + 6 * Math.sin((x - 420) * .01);
const bodyHalf = (u: number) => u < .18 ? 74 * Math.sqrt(u / .18) : 74 * (1 - Math.pow((u - .18) / .82, 1.6)) + 13 * (u - .18) / .82;
const X0 = 420, X1 = 860;
const contour = (side: -1 | 1, a: number, b: number) => P(...Array.from({ length: 16 }, (_, k) => {
  const u = lerp(a, b, k / 15);
  const x = lerp(X0, X1, u);
  return [x, spine(x) + side * bodyHalf(u) * .97];
}));
const FISH: Record<string, Vec2[]> = {
  pie: P([432, 334], [416, 342], [404, 352]),                               // mouth
  hengpie: P([506, 270], [522, 310], [520, 352], [500, 392]),              // gill arc
  left: contour(-1, .05, .95),                                               // dorsal contour
  hengzhe: contour(1, .05, .95),                                             // belly contour
  midh: P([520, 334], [690, 334], [840, 330]),                                // lateral line
  midv: P([540, 380], [575, 410], [604, 432]),                                // pectoral fin
  bottom: P([600, 262], [650, 226], [714, 222], [770, 262]),                  // dorsal fin
  baseA: P([846, 326], [890, 296], [940, 244]),                               // tail lobe up
  baseB: P([846, 334], [890, 368], [946, 418]),                               // tail lobe down
};
const FISH_R: Record<string, [number, number]> = {
  pie: [4, 2], hengpie: [3.5, 3], left: [6, 4], hengzhe: [6, 4], midh: [2, 1.5], midv: [15, 4], bottom: [16, 5], baseA: [22, 8], baseB: [22, 8],
};
const ORDER = ["pie", "hengpie", "left", "hengzhe", "midh", "midv", "bottom", "baseA", "baseB"];
const DELAY: Record<string, number> = { pie: .1, hengpie: .15, left: .25, hengzhe: .3, midh: .4, midv: .35, bottom: .3, baseA: 0, baseB: .05 };

/** Write-on: a stroke is laid down by the brush from start to end. */
function written(t: number, k: number) {
  return clamp((t - .15 - k * .17) / .2);
}

function rotateGlyph(p: Vec2, a: number): Vec2 {
  const c = Math.cos(a), s = Math.sin(a), dx = p[0] - C[0], dy = p[1] - C[1];
  return [C[0] + c * dx - s * dy, C[1] + s * dx + c * dy];
}

function swim(p: Vec2, t: number): Vec2 {
  const amp = 14 * win(t, 4.4, 5.2);
  const u = clamp((p[0] - X0) / (X1 + 90 - X0));
  const drift = -60 * smooth((t - 4.6) / 2.6);
  return [p[0] + drift, p[1] + amp * Math.sin(p[0] * .016 - t * 6.5) * u * u];
}

function prims(t: number): Prim[] {
  const turn = -Math.PI / 2 * smoother((t - 1.9) / 1.1);
  const out: Prim[] = [];
  const koi = win(t, 2.9, 4.2);
  const body = smoother((t - 2.85) / 1.3);
  const base = { gloss: lerp(.15, .55, koi), sss: lerp(0, .7, koi), mottle: .0, anchor: [640, 330] as Vec2, wobble: 1.5 * win(t, 2, 3) * (1 - win(t, 3.8, 4.6)) };

  // The body itself grows as a fat spine stroke out of the 田 box.
  if (body > 0) {
    const spinePts = P(...Array.from({ length: 16 }, (_, k) => { const x = lerp(X0, X1, k / 15); return [x, spine(x)]; }));
    const radii = spinePts.map((_, i) => bodyHalf(i / (N - 1)) * body);
    const pts = spinePts.map(p => swim([lerp(645, p[0], Math.sqrt(body)), lerp(320, p[1], body)], t));
    out.push(...strokePrims({ points: pts, radii }, { ...base, mottle: .5 * koi, color: s => mixRGB(INK, mixRGB(KOI, KOI_PALE, smooth((s - .55) / .4) * .7), koi), rootBlend: 0, jointBlend: 2 }));
  }

  ORDER.forEach((id, k) => {
    const w = written(t, k);
    if (w <= 0) return;
    const m = smoother((t - 2.6 - DELAY[id] * 1.1) / 1.3);
    const g = GLYPH[id].map(p => rotateGlyph(p, turn));
    const pts = g.map((p, i) => swim([lerp(p[0], FISH[id][i][0], m), lerp(p[1], FISH[id][i][1], m)], t));
    const [ga, gb] = BRUSH[id], [fa, fb] = FISH_R[id];
    // Write-on: points beyond the brush tip collapse onto it.
    const reach = w * (N - 1);
    const drawn = pts.map((p, i) => i <= reach ? p : pts[Math.floor(reach)]);
    const radii = drawn.map((_, i) => {
      const s = i / (N - 1);
      const brush = lerp(ga, gb, s) * (1 + .25 * Math.sin(s * Math.PI));
      return i <= reach + .001 ? lerp(brush, lerp(fa, fb, s), m) : 0;
    });
    const fin = ["midv", "bottom", "baseA", "baseB"].includes(id);
    const color: RGB = mixRGB(INK, fin ? FIN : id === "midh" ? mixRGB(KOI, INK, .45) : KOI, koi);
    out.push(...strokePrims({ points: drawn, radii } as Stroke, { ...base, sss: fin ? lerp(0, 1, koi) : base.sss, color, rootBlend: lerp(2, fin ? 14 : 4, m), jointBlend: fin ? lerp(.8, 4, m) : .8 }));
  });

  // Decals: scales grow out of the 田 cross, then the eye.
  const scales = win(t, 3.6, 4.4);
  if (scales > 0) {
    for (let col = 0; col < 9; col++) for (let row = -2; row <= 2; row++) {
      const x = 560 + col * 30 + (row & 1) * 15;
      const u = (x - X0) / (X1 - X0);
      const half = bodyHalf(u);
      const y = spine(x) + row * half * .34;
      if (Math.abs(row * .34) > .8) continue;
      const appear = win(t, 3.6 + Math.hypot(col - 3, row) * .06, 3.9 + Math.hypot(col - 3, row) * .06);
      const p = swim([x, y], t);
      out.push({ decal: true, opacity: appear * .35, bump: -1.2, color: mixRGB(KOI, INK, .5), gloss: .6,
        shape: { kind: "ellipse", x: p[0], y: p[1], rx: 11, ry: 9 * (1 - Math.abs(row) * .12) } });
    }
  }
  const eye = win(t, 3.9, 4.3);
  if (eye > 0) {
    const p = swim([470, 316], t);
    out.push({ decal: true, opacity: eye, bump: 3, color: hex("#f3ead8"), gloss: .9, shape: { kind: "ellipse", x: p[0], y: p[1], rx: 10 * eye, ry: 10 * eye } });
    out.push({ decal: true, opacity: eye, bump: 1, color: INK, gloss: 1, shape: { kind: "ellipse", x: p[0] - 1.5, y: p[1], rx: 6 * eye, ry: 6 * eye } });
    out.push({ decal: true, opacity: eye, bump: .5, color: [1, 1, 1], gloss: 1, shape: { kind: "ellipse", x: p[0] - 3.5, y: p[1] - 3, rx: 1.6, ry: 1.6 } });
  }
  return out;
}

const r = rng(5);
const fibres = Array.from({ length: 700 }, () => [r() * 1280, r() * 720, r() * 30 + 6, r() * Math.PI]);

function paper(ctx: CanvasRenderingContext2D, t: number) {
  const g = ctx.createRadialGradient(640, 330, 80, 640, 360, 820);
  g.addColorStop(0, "#f3ead6");
  g.addColorStop(1, "#d8cbb0");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1280, 720);
  ctx.strokeStyle = "#a0907018";
  ctx.lineWidth = .7;
  ctx.beginPath();
  for (const [x, y, l, a] of fibres) { ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); }
  ctx.stroke();
  // Water rings appear under the fish when it becomes alive.
  const wet = win(t, 4.2, 5.2);
  if (wet > 0) {
    ctx.strokeStyle = "#5f7d8a";
    for (let k = 0; k < 4; k++) {
      const life = ((t - 4.2) * .5 + k * .25) % 1;
      ctx.globalAlpha = wet * (1 - life) * .35;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(690 - 60 * smooth((t - 4.6) / 2.6), 340, 120 + life * 260, 60 + life * 120, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // Seal and caption.
  ctx.fillStyle = "#b8332a";
  ctx.globalAlpha = 1 - .6 * win(t, 3, 4);
  ctx.fillRect(1120, 560, 52, 52);
  ctx.fillStyle = "#f3ead6";
  ctx.font = "bold 22px serif";
  ctx.fillText("象形", 1124, 594);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#5b4c3a";
  ctx.font = "12px Georgia, serif";
  ctx.fillText("LAB  /  GLYPH → OBJECT   鱼", 48, 52);
}

let renderer: SdfRenderer | null = null;
export const scene: MorphScene = {
  id: "glyph-fish",
  title: "Lab · 字形 → 物象（鱼）",
  duration: 7,
  draw(ctx, t) {
    renderer ??= createSdfRenderer();
    paper(ctx, t);
    const koi = win(t, 2.9, 4.2);
    renderer.draw(ctx, prims(t), {
      thickness: lerp(5, 22, koi), time: t, seed: 2, light: [-.4, -.7, .6],
      keyColor: [1, .97, .9], ambientTop: [.62, .6, .56], ambientBottom: [.3, .26, .22], rimColor: [1, .95, .85], sssColor: [1, .55, .25],
      shadowOffset: [lerp(2, 18, koi), lerp(3, 26, koi)], shadowSoftness: lerp(2, 14, koi), shadowOpacity: lerp(.18, .28, koi), shadowColor: [.2, .15, .1],
    });
  },
};
