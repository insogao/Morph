import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import { matchPieces, type LineMatch, type PieceRef } from "../../packages/morph-engine/src/vector/glyph-pieces";
import { morphShapes, type ShapeMorph } from "../../packages/morph-engine/src/vector/morph";
import { framePath, mixColor } from "../../packages/morph-engine/src/vector/render";
import type { Shape } from "../../packages/morph-engine/src/vector/shape";
import { layoutText, type GlyphSet, type Slot } from "../../packages/morph-engine/src/vector/text";
import glyphs from "./glyphs-700.json";

/*
 * MM74 — a lyric video by simple, general rules (user direction: radical reuse, morphs, camera — not hand-built
 * stories). ORIGINAL placeholder lines on a "flight diary" theme; the user can drop their own lyrics and track in
 * locally (copyrighted lyrics and songs are never written into the repo).
 *   - each line holds 2 bars of the user's track (112.9 BPM); the change lands on the downbeat;
 *   - between lines, matchPieces() finds what the next line can reuse: the same character flies whole, a shared
 *     piece (辶, 亻, 口, a dot) flies to its new character and flushes red on the way; the rest of the old line
 *     shrinks away, the rest of the new one grows in, letter by letter;
 *   - the lines lie along a flight route; the camera flies from one to the next (pan, a little zoom and bank), and a
 *     dashed red route draws itself behind it.
 */

export const INK = "#141414", PAPER = "#f1ebdf", RED = "#d31036";
export const BEAT = 0.5314, INTRO = 4, BARS_PER_LINE = 2;
const DROP = INTRO * BEAT, LINE_BEATS = 4 * BARS_PER_LINE;

/** Original lines (not any song's lyrics). Replace with your own: one line per entry. */
export const LINES = ["跑道尽头是清晨", "写进日记的心情", "云朵追着机翼", "想念越过海洋", "落地时说给你听", "这一页叫做飞行"];
export const DURATION = DROP + LINES.length * LINE_BEATS * BEAT;

// ——— the route: where each line sits (world px), and the lines laid out there ———
const ROUTE: Array<[number, number]> = [[0, 0], [520, -280], [1040, -60], [1540, -320], [2060, -90], [2580, -300]];
const SIZE = 96;
const lines: Slot[][] = LINES.map((t, i) => layoutText(glyphs as GlyphSet, t, { at: ROUTE[i], size: SIZE, tracking: 0.06 }));
const matches: LineMatch[] = lines.slice(0, -1).map((l, i) => matchPieces(l, lines[i + 1]));
const flights: ShapeMorph[][] = matches.map(m => m.pairs.map(p => morphShapes(p.from.shape, p.to.shape, { mode: "linear" })));
/** Only pieces big enough to be seen as a component (辶, 亻, 口) flush red; a reused dot just flies. */
const area = (sh: Shape) => { const xs = sh.pieces.flatMap(p => p.outer.map(q => q[0])), ys = sh.pieces.flatMap(p => p.outer.map(q => q[1])); return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)); };
const accent = matches.map(m => m.pairs.map(p => !p.whole && area(p.to.shape) > 0.06 * SIZE * SIZE));

// ——— timing helpers (beats since the drop) ———
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const v = clamp(x); return v * v * (3 - 2 * v); };
const hit = (x: number) => { const v = clamp(x); return v * v * (2.2 - 1.2 * v); };
const span = (b: number, a0: number, a1: number) => clamp((b - a0) / (a1 - a0));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Camera: hold on a line, fly to the next around the change (starts 1.4 beats early, lands just after the downbeat). */
function camera(b: number) {
  const i = Math.max(0, Math.min(LINES.length - 1, Math.floor((b + 1.4) / LINE_BEATS)));
  const at = i * LINE_BEATS, k = i === 0 ? 1 : smooth(span(b, at - 1.4, at + 0.5));
  const from = ROUTE[Math.max(0, i - 1)], to = ROUTE[i];
  const x = lerp(from[0], to[0], k), y = lerp(from[1], to[1], k);
  const travel = Math.sin(Math.PI * k) * (i === 0 ? 0 : 1);
  // A little pull-back and bank while flying; the bank leans into the turn (up or down the route).
  const zoom = 1 - 0.1 * travel, roll = travel * 0.035 * Math.sign(to[1] - from[1] || 1);
  return { x, y, zoom, roll, leg: i, k };
}

const centre = (s: Shape) => { const xs = s.pieces.flatMap(p => p.outer.map(q => q[0])), ys = s.pieces.flatMap(p => p.outer.map(q => q[1]));
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] as const; };
/** Draw a piece scaled about a point; `alpha` < 1 for leaving / arriving characters (they never shrink to dots). */
function fillScaled(ctx: CanvasRenderingContext2D, s: Shape, k: number, about: readonly [number, number], color: string, dy = 0, alpha = 1) {
  if (k <= 0.001 || alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(about[0], about[1] + dy); ctx.scale(k, k); ctx.translate(-about[0], -about[1]);
  ctx.fillStyle = color; ctx.fill(framePath(s), "evenodd");
  ctx.restore();
}

export function drawLyric(ctx: CanvasRenderingContext2D, t: number) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(-4000, -4000, 10000, 10000);
  const b = (t - DROP) / BEAT, cam = camera(b);
  ctx.save();
  ctx.translate(640, 360); ctx.rotate(cam.roll); ctx.scale(cam.zoom, cam.zoom); ctx.translate(-cam.x, -cam.y);

  // ——— the route, drawn as far as the camera has flown ———
  const done = cam.leg + (cam.leg === 0 ? 0 : cam.k) - 1;
  ctx.strokeStyle = RED; ctx.lineWidth = 3; ctx.setLineDash([2, 12]); ctx.lineCap = "round";
  ctx.beginPath();
  ROUTE.forEach(([x, y], i) => {
    if (i > done + 1) return;
    const px = x, py = y + 96;
    if (i === 0) { ctx.moveTo(px, py); return; }
    const k = clamp(done - (i - 1)), [qx, qy] = ROUTE[i - 1];
    ctx.lineTo(lerp(qx, px, k), lerp(qy + 96, py, k));
  });
  ctx.stroke(); ctx.setLineDash([]);

  // ——— the first line grows in on the drop, one character per half-beat ———
  if (b < LINE_BEATS - 1.6) {
    lines[0].forEach((s, i) => { const k = hit(span(b, i * 0.5 - 0.6, i * 0.5 + 0.2)); fillScaled(ctx, s.shape, k, s.center, INK); });
  }

  // ——— every change: hold → exits shrink away → reused pieces fly (landing on the downbeat) → the rest grows in ———
  for (let i = 0; i < matches.length; i++) {
    const at = (i + 1) * LINE_BEATS, m = matches[i];
    if (b < at - 1.6 && i > 0 && b >= i * LINE_BEATS + 1.2) {                      // line i holding (after it has arrived)
      for (const s of lines[i]) fillScaled(ctx, s.shape, 1, s.center, INK);
    }
    if (b < at - 1.6 || b >= at + 1.2) continue;
    // exits: the pieces of line i nobody reuses, shrinking toward their character's centre, first letters first
    m.exits.forEach((r: PieceRef) => {
      // Whole characters recede (to half size, fading) rather than each piece shrinking to a dot: no confetti.
      const s = lines[i][r.slot], k = 1 - smooth(span(b, at - 1.4 + r.slot * 0.07, at - 0.1 + r.slot * 0.07));
      fillScaled(ctx, r.shape, 0.5 + 0.5 * k, s.center, INK, -(1 - k) * 24, k);
    });
    // flights: reused pieces travel to their new character, morphing to its exact shape, flushing red on the way
    m.pairs.forEach((p, j) => {
      const k = hit(span(b, at - 1.25 + j * 0.06, at)), f = flights[i][j].at(k), lift = -70 * Math.sin(Math.PI * k);
      const color = accent[i][j] ? mixColor(INK, RED, Math.sin(Math.PI * Math.min(1, k * 1.15))) : INK;
      ctx.save(); ctx.translate(0, lift); ctx.fillStyle = color; ctx.fill(framePath(f), "evenodd"); ctx.restore();
    });
    // enters: the rest of line i + 1 grows in, letter by letter, from the downbeat
    m.enters.forEach((r: PieceRef) => {
      // Overlaps the exits and the flights: the new line is forming while the old one recedes and the pieces land.
      const s = lines[i + 1][r.slot], k = smooth(span(b, at - 1.25 + r.slot * 0.08, at + 0.15 + r.slot * 0.08));
      fillScaled(ctx, r.shape, 0.5 + 0.5 * k, s.center, INK, (1 - k) * 22, k);
    });
  }
  // the last line holds to the end
  const last = matches.length * LINE_BEATS;
  if (b >= last + 1.2) for (const s of lines[lines.length - 1]) fillScaled(ctx, s.shape, 1, s.center, INK);
  ctx.restore();
}

export const scene: MorphScene = {
  id: "mm-lyric-flight",
  title: "MM74 · 歌词形变：相邻两句自动复用相同的字和部件（辶 亻 口…），镜头沿航线飞到下一句，卡音乐节拍",
  duration: DURATION,
  draw: drawLyric,
};
