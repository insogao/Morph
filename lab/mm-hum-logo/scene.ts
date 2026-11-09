import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import type { Vec2 } from "../../packages/morph-engine/src/vector/geom";
import { morphShapes, type ShapeMorph } from "../../packages/morph-engine/src/vector/morph";
import { framePath } from "../../packages/morph-engine/src/vector/render";
import { circle, shapeFromRings, type Shape } from "../../packages/morph-engine/src/vector/shape";
import { layoutText, type GlyphSet, type Slot } from "../../packages/morph-engine/src/vector/text";
import thin from "./glyphs-200.json";
import black from "./glyphs-800.json";
import levels from "./levels.json";

/*
 * MM71 — "hum.", a motion-logo system cut to music (original brand; the track is the user's, kept out of git).
 *
 * Everything sits on the track's beat grid (112.9 BPM, B = 0.5314 s, measured from its onsets): 4 beats of riser,
 * the drop, then a 16-beat loop whose last frame IS its first — the page loops the audio sample-accurately and the
 * picture follows the audio clock.
 *   riser   a red dot gathers; "hum." appears in a hairline weight
 *   drop    the dot hits, the word slams to black on the beat
 *   bar 1   dot → play button                         "play."
 *   bar 2   the triangle splits into its own vertical strips → five sound bars that move to the track's real levels
 *   bar 3   outer bars → ear cups, the middle three bend into the headband          "hear."
 *   bar 4   the band turns over into the mic's holder, the cups slide together into its capsule → back to the dot
 * On each bar's downbeat the colours turn over (cream → red → ink → cream) in a circle spreading from the icon.
 * Motion grammar: every move starts soft and lands fast ON a beat, the landing squashes the icon (impact), the word
 * follows half a beat behind, letter by letter (coupled, not A → B → C).
 */

export const RED = "#d31036", INK = "#0a0a0a", CREAM = "#f1ebdf";
export const BEAT = levels.beat, INTRO = levels.intro, LOOP_BEATS = 16;
export const DROP = INTRO * BEAT;                    // scene time of the drop
export const LOOP = LOOP_BEATS * BEAT;               // one loop
/** The clip's loop points (seconds into the clip): the page hands these to the audio source. */
export const AUDIO_LOOP: [number, number] = [levels.loop[0], levels.loop[1]];

interface Palette { bg: string; icon: string; word: string }
const PALETTES: Palette[] = [
  { bg: CREAM, icon: RED, word: INK },
  { bg: RED, icon: INK, word: CREAM },
  { bg: INK, icon: RED, word: CREAM },
  { bg: CREAM, icon: RED, word: INK },
];
/** For hosts: the backdrop colour at a time (so the page around the canvas matches). */
export const backdropAt = (t: number) => PALETTES[Math.max(0, Math.min(3, Math.floor(loopBeat(t).b / 4)))].bg;

// ——— timing ———
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const v = clamp(x); return v * v * (3 - 2 * v); };
/** Soft start, fast landing (slope 0.8 at the end): the move "hits" its beat. */
const hit = (x: number) => { const v = clamp(x); return v * v * (2.2 - 1.2 * v); };
const span = (b: number, b0: number, b1: number) => clamp((b - b0) / (b1 - b0));
const stagger = (k: number, i: number, n: number, spread = 0.4) => clamp((k - (i / Math.max(1, n - 1)) * spread) / (1 - spread));
/** Beats since the drop, folded into the loop. `first` is true only on the first pass (the drop's own impact). */
function loopBeat(t: number) {
  const raw = (t - DROP) / BEAT;
  if (raw < LOOP_BEATS) return { b: raw, first: true };
  return { b: raw % LOOP_BEATS, first: false };
}
/** Impact after a landing at beat `at`: a damped squash, gone in about half a beat. */
const impact = (b: number, at: number, amount = 0.09) => {
  const s = (b - at) * BEAT;
  return s < 0 || s > 0.45 ? 0 : amount * Math.exp(-s / 0.09) * Math.cos(s * 2 * Math.PI / 0.26);
};
/** The music's level in band k (0 = lows … 4 = highs) at a clip time. */
const level = (clipTime: number, k: number) => {
  const f = clipTime * levels.fps, i = Math.max(0, Math.min(levels.bands.length - 2, Math.floor(f))), u = f - i;
  return levels.bands[i][k] * (1 - u) + levels.bands[i + 1][k] * u;
};

// ——— shape builders (unit space: icon about 240 tall around 0,0; mapped by the layout) ———
type P2 = [number, number];
const rr = (cx: number, cy: number, w: number, h: number, r: number, n = 8): P2[] => {
  r = Math.min(r, w / 2, h / 2);
  const pts: P2[] = [], cs: Array<[number, number, number]> = [[w / 2 - r, h / 2 - r, 0], [-(w / 2 - r), h / 2 - r, Math.PI / 2], [-(w / 2 - r), -(h / 2 - r), Math.PI], [w / 2 - r, -(h / 2 - r), 1.5 * Math.PI]];
  for (const [x, y, a0] of cs) for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * Math.PI / 2; pts.push([cx + x + r * Math.cos(a), cy + y + r * Math.sin(a)]); }
  return pts;
};
/**
 * A "bent pill": a stroke of thickness th with round caps along a centreline of length len, starting straight and
 * bending with curvature kappa. A sound bar is a pill with kappa 0; a piece of the headband is the same pill bent onto
 * its circle — so bars → band is one parameter blend (the bar keeps its thickness and simply bends), not a point morph.
 */
interface Pill { x: number; y: number; dir: number; len: number; th: number; kappa: number }
const pillRing = ({ x, y, dir, len, th, kappa }: Pill, n = 30): P2[] => {
  const at = (s: number): [number, number, number] => {          // centreline point and tangent angle at arc length s
    const a = dir + kappa * s;
    if (Math.abs(kappa) < 1e-6) return [x + s * Math.cos(dir), y + s * Math.sin(dir), dir];
    return [x + (Math.sin(a) - Math.sin(dir)) / kappa, y + (Math.cos(dir) - Math.cos(a)) / kappa, a];
  };
  const r = th / 2, side: P2[] = [], back: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const [px, py, a] = at(-len / 2 + len * i / n), nx = -Math.sin(a), ny = Math.cos(a);
    side.push([px + nx * r, py + ny * r]); back.push([px - nx * r, py - ny * r]);
  }
  // Round caps, swept from one side to the other through the pill's end (decreasing angle).
  const cap = (s: number, from: number): P2[] => { const [px, py, a] = at(s); return Array.from({ length: 9 }, (_, i) => { const u = a + from - Math.PI * (i + 1) / 10; return [px + r * Math.cos(u), py + r * Math.sin(u)] as P2; }); };
  return [...side, ...cap(len / 2, Math.PI / 2), ...back.reverse(), ...cap(-len / 2, -Math.PI / 2)];
};
const lerpPill = (a: Pill, b: Pill, k: number): Pill => {
  let d = b.dir - a.dir; d = Math.atan2(Math.sin(d), Math.cos(d));   // turn the short way
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, dir: a.dir + d * k, len: a.len + (b.len - a.len) * k, th: a.th + (b.th - a.th) * k, kappa: a.kappa + (b.kappa - a.kappa) * k };
};
/** An annulus sector with round caps (headband, mic holder). Angles in degrees, canvas convention (y down). */
interface Arc { cx: number; cy: number; R: number; th: number; a0: number; a1: number }
const arcPill = ({ cx, cy, R, th, a0, a1 }: Arc): Pill => {
  // The pill is centred on the sector's midpoint; its tangent there is mid + 90°, and it bends round the circle.
  const d = Math.PI / 180, rm = R - th / 2, mid = (a0 + a1) / 2 * d;
  return { x: cx + rm * Math.cos(mid), y: cy + rm * Math.sin(mid), dir: mid + Math.PI / 2, len: (a1 - a0) * d * rm, th, kappa: 1 / Math.max(1e-6, rm) };
};
/** Half of a capsule / half of a disc: the two halves slide together and their union is the whole. */
const halfCapsule = (cx: number, cy: number, w: number, h: number, side: -1 | 1, n = 14): P2[] => {
  // The halves overlap by 4 units across the middle, so no seam opens while they slide together.
  const r = w / 2, pts: P2[] = [], top = cy - h / 2 + r, bot = cy + h / 2 - r, seam = cx - side * 4, q = Math.PI / 2;
  pts.push([seam, cy - h / 2]);
  for (let i = 0; i <= n; i++) { const a = -q + side * q * (i / n); pts.push([cx + r * Math.cos(a), top + r * Math.sin(a)]); }
  for (let i = 0; i <= n; i++) { const a = q - side * q * (1 - i / n); pts.push([cx + r * Math.cos(a), bot + r * Math.sin(a)]); }
  pts.push([seam, cy + h / 2]);
  return pts;
};

/** Where things go. One composition per aspect: the icon, and the word under it. */
export interface HumLayout { w: number; h: number; icon: Vec2; k: number; word: Vec2; size: number }
export const LANDSCAPE: HumLayout = { w: 1280, h: 720, icon: [640, 300], k: 1, word: [640, 566], size: 92 };
export const SQUARE: HumLayout = { w: 1080, h: 1080, icon: [540, 450], k: 1.3, word: [540, 830], size: 124 };
export const PORTRAIT: HumLayout = { w: 720, h: 1280, icon: [360, 560], k: 1.25, word: [360, 930], size: 120 };

export function makeHum(L: HumLayout): (ctx: CanvasRenderingContext2D, t: number) => void {
  const [CX, CY] = L.icon, K = L.k;
  const P = (p: P2): P2 => [CX + K * p[0], CY + K * p[1]];
  const S = (ring: P2[]): Shape => shapeFromRings([ring.map(P)]);

  // ——— the icons ———
  const DOT_R = 72;
  const dot = shapeFromRings([circle(P([0, 0]), DOT_R * K, 120)]);
  const halfDot = (side: -1 | 1) => S(halfCapsule(0, 0, DOT_R * 2, DOT_R * 2, side));
  // Play: a triangle, bounding box centred. Its vertical strips ARE the sound bars' starting shapes.
  const triH = (x: number) => 115 * (100 - x) / 200;
  const tri = S([[-100, -115], [100, 0], [-100, 115]]);
  const edges = [-100, -60, -20, 20, 60, 100];
  const strips = edges.slice(0, 5).map((x0, i) => {
    const x1 = edges[i + 1] + (i < 4 ? 0.8 : 0);
    return i < 4 ? S([[x0, -triH(x0)], [x1, -triH(x1)], [x1, triH(x1)], [x0, triH(x0)]]) : S([[x0, -triH(x0)], [100, 0], [x0, triH(x0)]]);
  });
  const barX = [-80, -40, 0, 40, 80], BAR_W = 28;
  const baseH = barX.map(x => 2 * triH(x));                          // a staircase: the triangle's own heights
  const bar = (i: number, h: number) => S(rr(barX[i], 0, BAR_W, Math.max(BAR_W, h), BAR_W / 2));
  // Headphones: a band in three overlapping sectors over the top, and two cups.
  const band: Arc[] = [0, 1, 2].map(j => ({ cx: 0, cy: 14, R: 124, th: 26, a0: 200 + 46 * j, a1: 248 + 46 * j }));
  const cups = [-1, 1].map(s => S(rr(s * 108, 44, 60, 106, 24)));
  // Mic: capsule (two halves), a U holder (the band turned over), stem and base.
  // The band is ONE pill once it has formed (the three pieces lie on the same circle, so the swap is invisible).
  // Band → holder is a flip, not a spin: the arch flattens (curvature + → 0), drops, and bends up into a U (→ −).
  const bandWhole = arcPill({ cx: 0, cy: 14, R: 124, th: 26, a0: 200, a1: 340 });
  const HR = 92 - 17 / 2;
  const holder: Pill = { x: 0, y: -16 + HR, dir: 0, len: 140 * Math.PI / 180 * HR, th: 17, kappa: -1 / HR };
  const capsule = [-1, 1].map(s => S(halfCapsule(0, -44, 96, 156, s as -1 | 1)));
  const stem0 = { x: 0, y: 74, w: 17, h: 0 }, stem1 = { x: 0, y: 100, w: 17, h: 52 };
  const base0 = { x: 0, y: 80, w: 17, h: 0 }, base1 = { x: 0, y: 128, w: 104, h: 17 };
  const stemIn = { x: 0, y: 36, w: 17, h: 0 }, baseIn = { x: 0, y: 40, w: 17, h: 0 };   // retract into the dot
  const holderIn: Pill = { x: 0, y: 22, dir: 0, len: 36, th: 10, kappa: -1 / 30 };   // folds away inside the dot

  // ——— the morphs ———
  const dotToTri = morphShapes(dot, tri);
  const stripToBar = strips.map((s, i) => morphShapes(s, bar(i, baseH[i]), { mode: "linear" }));
  // bars → headphones: start from the bars exactly as they stand when the move begins (they are music-driven).
  const T_HP = [7.25, 8], T_MIC = [10.75, 12], T_DOT = [13.25, 14];
  const barH = (i: number, b: number) => {
    const live = 34 + 196 * level(AUDIO_LOOP[0] + b * BEAT, i);
    return baseH[i] + (live - baseH[i]) * smooth(span(b, 4, 4.6));
  };
  // Outer bars → cups (rounded rect → rounded rect); the middle three bend into the band (pill → bent pill).
  const barToCup = [0, 4].map((i, j) => morphShapes(bar(i, barH(i, T_HP[0])), cups[j], { mode: "linear" }));
  const barPill = (i: number, h: number, dir: number): Pill => ({ x: barX[i], y: 0, dir, len: Math.max(0, h - BAR_W), th: BAR_W, kappa: 0 });
  const bandPills = band.map(arcPill), barDirs = [-Math.PI / 2, -Math.PI / 2, Math.PI / 2];   // each bar turns the short way
  const cupToCapsule = [0, 1].map(i => morphShapes(cups[i], capsule[i]));
  const capsuleToDot = [0, 1].map(i => morphShapes(capsule[i], halfDot(i ? 1 : -1)));

  // ——— words ———
  const wordAt = (set: GlyphSet, w: string) => layoutText(set, w, { at: L.word, size: L.size, tracking: -0.02 });
  const humThin = wordAt(thin as GlyphSet, "hum."), humBlack = wordAt(black as GlyphSet, "hum.");
  const weight = humThin.map((s, i) => morphShapes(s.shape, humBlack[i].shape, { mode: "linear" }));
  const WORDS = ["hum.", "play.", "flow.", "hear.", "speak.", "hum."].map(w => wordAt(black as GlyphSet, w));
  const WORD_MOVES: Array<{ at: [number, number]; from: Slot[]; to: Slot[] }> = [[1.5, 2.4], [3.5, 4.4], [7.5, 8.4], [11.25, 12.15], [13.5, 14.4]]
    .map((at, i) => ({ at: at as [number, number], from: WORDS[i], to: WORDS[i + 1] }));

  const fillShape = (ctx: CanvasRenderingContext2D, f: Shape | ReturnType<ShapeMorph["at"]>, c: string) => { ctx.fillStyle = c; ctx.fill(framePath(f), "evenodd"); };
  const fillRing = (ctx: CanvasRenderingContext2D, ring: P2[], c: string) => fillShape(ctx, S(ring), c);
  const slab = (ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, c: string) => { if (r.h > 0.5 && r.w > 0.5) fillRing(ctx, rr(r.x, r.y, r.w, r.h, Math.min(r.w, r.h) / 2), c); };
  const mixR = (a: typeof stem0, b: typeof stem0, k: number) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k });

  /** The icon at loop beat b (b < 0: the riser). Returns the landing beat whose impact applies, if any. */
  function icon(ctx: CanvasRenderingContext2D, b: number, c: string) {
    if (b < T_DOT[1] && b >= T_DOT[0]) {                            // mic → dot
      const k = hit(span(b, T_DOT[0], T_DOT[1]));
      fillShape(ctx, capsuleToDot[0].at(k), c); fillShape(ctx, capsuleToDot[1].at(k), c);
      fillRing(ctx, pillRing(lerpPill(holder, holderIn, k)), c);
      slab(ctx, mixR(stem1, stemIn, k), c); slab(ctx, mixR(base1, baseIn, k), c);
      return;
    }
    if (b >= T_MIC[0] && b < T_DOT[0]) {                            // headphones → mic, then the mic
      const k = hit(span(b, T_MIC[0], T_MIC[1])), g = smooth(span(b, T_MIC[0] + 0.6, T_MIC[1]));
      fillRing(ctx, pillRing(lerpPill(bandWhole, holder, k), 40), c);
      fillShape(ctx, cupToCapsule[0].at(k), c); fillShape(ctx, cupToCapsule[1].at(k), c);
      slab(ctx, mixR(stem0, stem1, g), c); slab(ctx, mixR(base0, base1, g), c);
      return;
    }
    if (b >= T_HP[0] && b < T_MIC[0]) {                             // bars → headphones, then the headphones
      const k = hit(span(b, T_HP[0], T_HP[1]));
      barToCup.forEach(m => fillShape(ctx, m.at(k), c));
      if (k < 1) bandPills.forEach((p, j) => fillRing(ctx, pillRing(lerpPill(barPill(j + 1, barH(j + 1, T_HP[0]), barDirs[j]), p, k)), c));
      else fillRing(ctx, pillRing(bandWhole, 40), c);
      return;
    }
    if (b >= 3.25 && b < T_HP[0]) {                                  // strips → bars, then the bars dance
      const k = hit(span(b, 3.25, 4));
      if (k < 1) stripToBar.forEach(m => fillShape(ctx, m.at(k), c));
      else barX.forEach((_, i) => fillShape(ctx, bar(i, barH(i, b)), c));
      return;
    }
    if (b >= 1.25 && b < 3.25) {                                     // dot → play
      const k = hit(span(b, 1.25, 2));
      if (k < 1) fillShape(ctx, dotToTri.at(k), c); else strips.forEach(s => fillShape(ctx, s, c));
      return;
    }
    fillShape(ctx, dot, c);                                          // the logo dot (hold, and the riser)
  }

  function word(ctx: CanvasRenderingContext2D, b: number, c: string, first: boolean) {
    if (b < 0 || (first && b < 0.01)) {                              // riser: hairline letters arrive, then slam to black
      const appear = span(b, -3.2, -1.4), slam = hit(span(b, -0.3, 0));
      humThin.forEach((_, i) => {
        const a = stagger(appear, i, humThin.length, 0.5);
        if (a <= 0) return;
        ctx.globalAlpha = a;
        fillShape(ctx, weight[i].at(stagger(slam, i, humThin.length, 0.25)), c);
      });
      ctx.globalAlpha = 1;
      return;
    }
    const move = WORD_MOVES.find(w => b >= w.at[0] && b < w.at[1]);
    if (move) {
      // A letter roll, not a glyph morph: between DIFFERENT words a morph turns letters to mush for a beat, so the
      // old word rolls up out of a slot and the new one rolls in under it, letter by letter (kinetic type).
      const k = span(b, move.at[0], move.at[1]), lift = L.size * 1.05;
      ctx.save();
      ctx.beginPath(); ctx.rect(-4000, L.word[1] - L.size * 0.78, 10000, L.size * 1.42); ctx.clip();
      const roll = (slots: readonly Slot[], out: boolean) => slots.forEach((s, i) => {
        const p = hit(stagger(k, i, Math.max(move.from.length, move.to.length), 0.5)), dy = out ? -p * lift : (1 - p) * lift;
        if ((out && p >= 1) || (!out && p <= 0)) return;
        ctx.save(); ctx.translate(0, dy); fillShape(ctx, s.shape, c); ctx.restore();
      });
      roll(move.from, true); roll(move.to, false);
      ctx.restore();
      return;
    }
    const idx = WORD_MOVES.filter(w => b >= w.at[1]).length;
    for (const s of WORDS[idx] as Slot[]) fillShape(ctx, s.shape, c);
  }

  function frame(ctx: CanvasRenderingContext2D, b: number, first: boolean, pal: Palette) {
    ctx.fillStyle = pal.bg;
    ctx.fillRect(-4000, -4000, 10000, 10000);
    // Icon transform: the riser's gathering, the landings' squash, a small kick on every beat while holding.
    let sc = 1, sq = 0;
    if (b < 0) {
      const grow = 0.12 + 0.5 * smooth(span(b, -4, -0.8));
      sc = grow - 0.1 * smooth(span(b, -0.8, -0.08));                 // anticipation: it pulls in before the drop
    } else {
      if (first) sq += impact(b, 0, 0.16);
      for (const land of [2, 4, T_HP[1], T_MIC[1], T_DOT[1]]) sq += impact(b, land);
      const holding = !(b >= 1.25 && b < 2) && !(b >= 3.25 && b < 4) && !(b >= 4 && b < T_HP[1]) && !(b >= T_MIC[0] && b < T_MIC[1]) && !(b >= T_DOT[0] && b < T_DOT[1]);
      const sinceBeat = (b - Math.floor(b)) * BEAT;
      if (holding) sc *= 1 + 0.035 * Math.exp(-sinceBeat / 0.07);
      if (first && b < 0.35) sc *= 0.52 + 0.48 * Math.min(1, b / 0.06);   // the drop: from gathered to full in one frame-ish
    }
    ctx.save();
    ctx.translate(CX, CY); ctx.scale(sc * (1 + sq), sc * (1 - sq)); ctx.translate(-CX, -CY);
    icon(ctx, b, pal.icon);
    ctx.restore();
    word(ctx, b, pal.word, first);
  }

  return function drawHum(ctx: CanvasRenderingContext2D, t: number) {
    const { b, first } = t < DROP ? { b: (t - DROP) / BEAT, first: true } : loopBeat(t);
    const bar = b < 0 ? 0 : Math.min(3, Math.floor(b / 4));
    frame(ctx, b, first, PALETTES[bar]);
    // The colours turn over on the bar's downbeat, in a circle spreading from the icon.
    const w = bar > 0 ? span(b, bar * 4, bar * 4 + 0.75) : 1;
    if (w < 1) {
      ctx.save();
      const r = 1700 * (1 - Math.pow(1 - w, 2)) * (0.15 + 0.85 * w);
      ctx.beginPath(); ctx.rect(-4000, -4000, 10000, 10000); ctx.arc(CX, CY, Math.max(0, r), 0, Math.PI * 2, true);
      ctx.clip();                                                     // outside the circle: still the old palette
      frame(ctx, b, first, PALETTES[bar - 1]);
      ctx.restore();
    }
  };
}

export const drawHum = makeHum(LANDSCAPE);
/** Intro + two loops, so every tool also sees the loop seam (beat 16 → beat 0). */
export const DURATION = DROP + 2 * LOOP;

export const scene: MorphScene = {
  id: "mm-hum-logo",
  title: "MM71 · 动态品牌系统：hum. 点 → 播放 → 声波 → 耳机 → 麦克风 → 点，卡音乐节拍循环（见 pages/hum）",
  duration: DURATION,
  draw: drawHum,
};
