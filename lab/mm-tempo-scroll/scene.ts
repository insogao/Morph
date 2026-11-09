import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import type { Vec2 } from "../../packages/morph-engine/src/vector/geom";
import { chain } from "../../packages/morph-engine/src/vector/chain";
import { morphShapes, type ShapeMorph } from "../../packages/morph-engine/src/vector/morph";
import { framePath, mixColor } from "../../packages/morph-engine/src/vector/render";
import { circle, shapeFromRings, type Shape } from "../../packages/morph-engine/src/vector/shape";
import { layoutText, morphWords, type GlyphSet, type Slot } from "../../packages/morph-engine/src/vector/text";
import thin from "./glyphs-200.json";
import black from "./glyphs-900.json";
import bold from "./glyphs-800.json";

/*
 * MM70 — "Tempo", a scroll-driven product story (original brand). Built for the scroll page in pages/tempo/:
 * the page maps scroll position to t, so every beat is scrubbed by the reader, forwards and backwards.
 *
 * Strengths used: letter morphs (a weight that "breathes" — the same glyph at 200 and 900 has the same structure,
 * so the correspondence is perfect), icons with one hole each (ring → frame → badge → logo: hole to hole), a designed
 * same-colour rhyme (the orange "o" IS the timer ring), carriers at every hand-off, overlapping stages (chain()).
 *   breathe   "tempo." goes from hairline to black, letter by letter
 *   dial      the o becomes the timer ring; t e m p become its four ticks; the full stop becomes the hand's pivot;
 *             "Find your" becomes "Focus."
 *   sweep     the hand sweeps a full turn, the progress arc fills
 *   calendar  ring → rounded frame, ticks → the calendar's day dots;   "Focus." → "Plan."
 *   badge     frame → a disc with a check cut out; dots gather into the check;  "Plan." → "Done."
 *   logo      the check-cut disc → the Tempo mark (a rounded square with a T cut out);  "Done." → "Tempo"
 *   fill      the mark's orange spreads over the whole frame: the page's call-to-action sits on it
 */

export const INK = "#17161c", PAPER = "#f4efe6", ORANGE = "#ff5a1f";

const S = chain([
  { id: "breathe", duration: 1.9 },
  { id: "dial", duration: 2.3, overlap: 0.5 },
  { id: "sweep", duration: 2.0, overlap: 0.5 },
  { id: "calendar", duration: 2.1, overlap: 0.4 },
  { id: "badge", duration: 2.1, overlap: 0.5 },
  { id: "logo", duration: 2.1, overlap: 0.5 },
  { id: "fill", duration: 1.6, overlap: 0.4 },
], { lead: 0.5, tail: 1.2 });
export const DURATION = S.duration;
export const STAGES = S.windows;

// ——— shapes ———
type P2 = [number, number];
const roundRect = (c: Vec2, w: number, h: number, r: number, n = 12): P2[] => {
  const pts: P2[] = [], corners: Array<[number, number, number]> = [[w / 2 - r, h / 2 - r, 0], [-(w / 2 - r), h / 2 - r, Math.PI / 2], [-(w / 2 - r), -(h / 2 - r), Math.PI], [w / 2 - r, -(h / 2 - r), 1.5 * Math.PI]];
  for (const [x, y, a0] of corners) for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * Math.PI / 2; pts.push([c[0] + x + r * Math.cos(a), c[1] + y + r * Math.sin(a)]); }
  return pts;
};
const smooth = (x: number) => { const v = Math.max(0, Math.min(1, x)); return v * v * (3 - 2 * v); };
const stagger = (k: number, i: number, n: number, spread = 0.45) => smooth((k - (i / Math.max(1, n - 1)) * spread) / (1 - spread));

function fill(ctx: CanvasRenderingContext2D, f: { pieces: Shape["pieces"] } | ReturnType<ShapeMorph["at"]>, color: string) {
  ctx.fillStyle = color;
  ctx.fill(framePath(f), "evenodd");
}

/** Where things go. Landscape: caption left, dial right. Portrait: stacked, caption above the dial. */
export interface TempoLayout { w: number; h: number; dial: Vec2; hero: Vec2; heroSize: number; find: Vec2; findSize: number; cap: Vec2; capSize: number; end: Vec2 }
export const LANDSCAPE: TempoLayout = { w: 1280, h: 720, dial: [860, 360], hero: [640, 380], heroSize: 230, find: [640, 196], findSize: 54, cap: [360, 372], capSize: 112, end: [640, 300] };
export const PORTRAIT: TempoLayout = { w: 720, h: 1280, dial: [360, 820], hero: [360, 660], heroSize: 168, find: [360, 500], findSize: 50, cap: [360, 450], capSize: 108, end: [360, 560] };

export function makeTempo(L: TempoLayout): (ctx: CanvasRenderingContext2D, t: number) => void {
  const DIAL = L.dial, R = 150;
  const ring = shapeFromRings([circle(DIAL, R, 160), circle(DIAL, R - 30, 160)]);
  const frame = shapeFromRings([roundRect(DIAL, 300, 300, 64), roundRect([DIAL[0], DIAL[1] + 22], 236, 190, 30)]);
  // A check cut out of a disc (the hole is a thick tick).
  const checkHole: P2[] = [[-70, 4], [-44, -22], [-16, 8], [52, -62], [78, -36], [-16, 58]].map(([x, y]) => [DIAL[0] + x, DIAL[1] + y]);
  const badge = shapeFromRings([circle(DIAL, R, 160), checkHole]);
  // The Tempo mark: a rounded square with a T cut out.
  const tHole: P2[] = [[-74, -70], [74, -70], [74, -34], [20, -34], [20, 84], [-20, 84], [-20, -34], [-74, -34]].map(([x, y]) => [DIAL[0] + x, DIAL[1] + y]);
  const mark = shapeFromRings([roundRect(DIAL, 300, 300, 70), tHole]);

  const ticks = [0, 1, 2, 3].map(k => { const a = -Math.PI / 2 + k * Math.PI / 2, c: Vec2 = [DIAL[0] + Math.cos(a) * (R + 34), DIAL[1] + Math.sin(a) * (R + 34)];
    return shapeFromRings([k % 2 ? roundRect(c, 26, 12, 6) : roundRect(c, 12, 26, 6)]); });
  const dots = [0, 1, 2, 3].map(k => shapeFromRings([roundRect([DIAL[0] - 44 + (k % 2) * 88, DIAL[1] + 2 + Math.floor(k / 2) * 66], 40, 40, 10)]));
  const pivot = shapeFromRings([circle(DIAL, 13, 48)]);

  // ——— type ———
  const heroThin = layoutText(thin as GlyphSet, "tempo.", { at: L.hero, size: L.heroSize, tracking: 0.02 });
  const heroBlack = layoutText(black as GlyphSet, "tempo.", { at: L.hero, size: L.heroSize, tracking: -0.01 });
  const weight = heroThin.map((s, i) => morphShapes(s.shape, heroBlack[i].shape, { mode: "linear" }));
  const line = (text: string, at: Vec2, size: number) => layoutText(bold as GlyphSet, text, { at, size, tracking: 0.0 });
  const findYour = line("Find your", L.find, L.findSize);
  const CAP = L.cap;
  const captions = ["Focus.", "Plan.", "Done.", "Tempo"].map(w => line(w, CAP, w === "Tempo" ? L.capSize * 0.93 : L.capSize));
  const capMorphs = [morphWords(findYour, captions[0]), morphWords(captions[0], captions[1]), morphWords(captions[1], captions[2]), morphWords(captions[2], captions[3])];

  // ——— the dial hand-off: o → ring, t e m p → ticks, . → pivot ———
  const iO = 4, iDot = 5, letterTicks = [0, 1, 2, 3];
  const oToRing = morphShapes(heroBlack[iO].shape, ring);
  const toTick = letterTicks.map((li, k) => morphShapes(heroBlack[li].shape, ticks[k]));
  const dotToPivot = morphShapes(heroBlack[iDot].shape, pivot);
  // ring → frame → badge → mark (one hole each: hole morphs into hole)
  const ringToFrame = morphShapes(ring, frame), frameToBadge = morphShapes(frame, badge);
  // Badge → mark as a shape chain, not hole-to-hole: two unlike concave holes (a check, a T) morph into a tangle.
  // The check closes into a solid rounded square first, then the T opens out of its centre.
  const solid = shapeFromRings([roundRect(DIAL, 300, 300, 70)]);
  const badgeToSolid = morphShapes(badge, solid, { vanish: "self" }), solidToMark = morphShapes(solid, mark, { vanish: "self" });
  const tShape = shapeFromRings([tHole]);
  const tickToDot = ticks.map((t, k) => morphShapes(t, dots[k]));
  const dotToCheck = dots.map(d => morphShapes(d, shapeFromRings([circle(DIAL, 1, 12)]), { vanish: DIAL }));

  function caption(ctx: CanvasRenderingContext2D, t: number) {
    // Which caption morph is running: Find your → Focus (dial), Focus → Plan (calendar), Plan → Done (badge), Done → Tempo (logo).
    const steps: Array<[string, number]> = [["dial", 0], ["calendar", 1], ["badge", 2], ["logo", 3]];
    let active = -1, k = 0;
    for (const [id, i] of steps) { const p = S.progress(id, t); if (p > 0) { active = i; k = p; } }
    if (active < 0) {                                         // before the dial: "Find your" above the hero word
      for (const s of findYour) fill(ctx, s.shape, INK);
      return;
    }
    const m = capMorphs[active];
    // In the dial step the hero letters are flying across the middle: the caption waits until they have cleared.
    const kk = active === 0 ? smooth((k - 0.42) / 0.58) : k;
    for (const slot of m) {
      const p = stagger(kk, slot.order, m.length, 0.35);
      fill(ctx, slot.morph.at(p), INK);
    }
  }

  return function drawTempo(ctx: CanvasRenderingContext2D, t: number) {
    const br = S.progress("breathe", t), di = S.progress("dial", t), sw = S.progress("sweep", t), ca = S.progress("calendar", t),
      ba = S.progress("badge", t), lo = S.progress("logo", t), fi = S.progress("fill", t);
    ctx.fillStyle = PAPER;
    ctx.fillRect(-3000, -3000, 8000, 8000);

    // ——— the hero word: weight breathes, then its letters leave for the dial ———
    if (di < 1) {
      heroThin.forEach((_, i) => {
        if (di > 0 && (i === iO || i === iDot || letterTicks.includes(i))) return;   // handed to the dial below
        fill(ctx, weight[i].at(stagger(br, i, heroThin.length, 0.5)), i === iO ? ORANGE : INK);
      });
    }
    if (di > 0 && ca < 1) {
      // The o leads (it becomes the ring), then the letters peel off nearest-first — ., p, m, e, t — so no letter
      // flies across another on its way to the dial.
      const order: Record<number, number> = { [iO]: 0, [iDot]: 1, 3: 2, 2: 3, 1: 4, 0: 5 };
      const k = (i: number) => stagger(di, order[i], 6, 0.45);
      fill(ctx, oToRing.at(k(iO)), ORANGE);
      toTick.forEach((m, j) => { if (ca <= 0) fill(ctx, m.at(k(letterTicks[j])), INK); });
      if (ca <= 0) fill(ctx, dotToPivot.at(k(iDot)), INK);
    }

    // ——— the dial: hand sweep and progress arc (an ink arc riding the ring) ———
    if (sw > 0 && ca < 0.6) {
      const a0 = -Math.PI / 2, a1 = a0 + 2 * Math.PI * sw, fade = 1 - smooth(ca / 0.6);
      ctx.save();
      ctx.globalAlpha = fade;
      // A thin ink arc just inside the ring: the ring stays orange (the colour that carries the next steps).
      ctx.strokeStyle = INK; ctx.lineWidth = 10; ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(DIAL[0], DIAL[1], R - 46, a0, a1); ctx.stroke();
      ctx.translate(DIAL[0], DIAL[1]); ctx.rotate(a1 + Math.PI / 2);
      ctx.fillStyle = INK; ctx.fill(new Path2D("M-5,6 L-5,-84 Q0,-92 5,-84 L5,6 Z"));
      ctx.restore();
    }

    // ——— ring → frame → badge → mark; ticks → dots → into the check ———
    let icon: ReturnType<ShapeMorph["at"]> | null = null;
    if (lo > 0) icon = lo < 0.5 ? badgeToSolid.at(smooth(lo / 0.5)) : solidToMark.at(smooth((lo - 0.5) / 0.5));
    else if (ba > 0) icon = frameToBadge.at(ba);
    else if (ca > 0) icon = ringToFrame.at(ca);
    if (fi > 0) {
      // The mark's solid square spreads until its orange IS the page; the cream T stays at its size in the middle:
      // the brand end card the call-to-action sits on.
      const sc = 1 + 6.5 * fi * fi, r = 70 * (1 - fi) + 0.5;
      const dx = (L.end[0] - DIAL[0]) * fi, dy = (L.end[1] - DIAL[1]) * fi;
      ctx.save(); ctx.translate(DIAL[0] + dx, DIAL[1] + dy); ctx.scale(sc, sc);
      fill(ctx, shapeFromRings([roundRect([0, 0], 300, 300, Math.max(1, r))]), ORANGE); ctx.restore();
      ctx.save(); ctx.translate(dx, dy); fill(ctx, tShape, PAPER); ctx.restore();
    } else if (icon) fill(ctx, icon, ORANGE);
    if (ca > 0 && ba < 1) {
      tickToDot.forEach((m, j) => {
        const k = stagger(ca, j, 4, 0.3), g = ba > 0 ? stagger(ba, j, 4, 0.4) : 0;
        fill(ctx, g > 0 ? dotToCheck[j].at(g) : m.at(k), g > 0 ? mixColor(INK, ORANGE, g) : INK);
      });
      if (ca < 0.5) { ctx.globalAlpha = 1 - smooth(ca / 0.5); fill(ctx, pivot, INK); ctx.globalAlpha = 1; }
    }

    // ——— captions (kinetic type) ———
    if (fi < 0.35) { ctx.globalAlpha = 1 - smooth(fi / 0.35); caption(ctx, t); ctx.globalAlpha = 1; }
  };
}

export const drawTempo = makeTempo(LANDSCAPE);

export const scene: MorphScene = {
  id: "mm-tempo-scroll",
  title: "MM70 · 滚动叙事落地页：字重呼吸 → o 变表盘 → 日历 → 完成 → Logo（scroll-driven，见 pages/tempo）",
  duration: DURATION,
  draw: drawTempo,
};
