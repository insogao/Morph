import type { Piece, Shape } from "./shape";
import type { Slot } from "./text";

/**
 * Reusable pieces between two lines of text (CJK lyrics, captions): which outline pieces of line B already exist in
 * line A, so they can FLY to their new place instead of fading out and in.
 *
 * A font stores each character as outline pieces (connected components): 他 = 亻 + 也, 道 = 辶's parts + 首, 你 = 亻 + 尔.
 * There is no radical database here: a piece of B matches a piece of A when, measured inside each character's own em
 * box, the two cover the same place with the same shape (IoU on a small grid). So 亻 matches 亻 (both on the left),
 * 口 matches 口, the dots of 氵 match each other. The same character matches whole.
 *
 * Limit: a component that the font joins to the rest of its character (touching strokes) is not a separate piece and
 * can't be found; those characters simply fade out and in.
 */
export interface PieceRef {
  slot: number;        // index of the character in its line
  piece: number;       // index of the piece in that character
  shape: Shape;        // the piece alone, in the line's coordinates
}
export interface PieceMatch { from: PieceRef; to: PieceRef; score: number; whole: boolean }
export interface LineMatch { pairs: PieceMatch[]; exits: PieceRef[]; enters: PieceRef[] }

function inRing(r: ReadonlyArray<readonly [number, number]>, x: number, y: number) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** The piece as a coverage mask over its character's em box (n × n). */
function maskOf(p: Piece, s: Slot, n: number): Uint8Array {
  const size = s.width, x0 = s.x, y0 = s.baseline - 0.88 * size, m = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = x0 + (i + 0.5) / n * size, y = y0 + (j + 0.5) / n * size;
    m[j * n + i] = inRing(p.outer, x, y) && !p.holes.some(h => inRing(h, x, y)) ? 1 : 0;
  }
  return m;
}
function iou(a: Uint8Array, b: Uint8Array) {
  let inter = 0, uni = 0;
  for (let i = 0; i < a.length; i++) { inter += a[i] & b[i]; uni += a[i] | b[i]; }
  return uni ? inter / uni : 0;
}

/** Match the pieces of line `a` to line `b`. `min` is the IoU a reused piece needs (0.62 keeps 亻 ↔ 亻, rejects 亻 ↔ 彳). */
export function matchPieces(a: readonly Slot[], b: readonly Slot[], { grid = 28, min = 0.62 } = {}): LineMatch {
  const refs = (line: readonly Slot[]) => line.flatMap((s, slot) => s.shape.pieces.map((p, piece) => ({ ref: { slot, piece, shape: { pieces: [p] } } as PieceRef, mask: maskOf(p, s, grid), ch: s.ch })));
  const A = refs(a), B = refs(b), usedA = new Set<number>(), usedB = new Set<number>(), pairs: PieceMatch[] = [];
  // The same character: whole (each piece to its twin), nearest occurrence first.
  for (let j = 0; j < b.length; j++) {
    const i = a.findIndex((s, k) => s.ch === b[j].ch && !A.some((x, xi) => x.ref.slot === k && usedA.has(xi)));
    if (i < 0 || a[i].shape.pieces.length !== b[j].shape.pieces.length) continue;
    A.forEach((x, xi) => { if (x.ref.slot !== i) return;
      const yi = B.findIndex(y => y.ref.slot === j && y.ref.piece === x.ref.piece);
      usedA.add(xi); usedB.add(yi); pairs.push({ from: x.ref, to: B[yi].ref, score: 1, whole: true }); });
  }
  // Shared pieces (radicals, components): best IoU first, each piece used once.
  const cand: Array<[number, number, number]> = [];
  A.forEach((x, xi) => { if (usedA.has(xi)) return; B.forEach((y, yi) => { if (usedB.has(yi)) return; const s = iou(x.mask, y.mask); if (s >= min) cand.push([s, xi, yi]); }); });
  cand.sort((p, q) => q[0] - p[0]);
  for (const [s, xi, yi] of cand) {
    if (usedA.has(xi) || usedB.has(yi)) continue;
    usedA.add(xi); usedB.add(yi); pairs.push({ from: A[xi].ref, to: B[yi].ref, score: s, whole: false });
  }
  return { pairs, exits: A.filter((_, i) => !usedA.has(i)).map(x => x.ref), enters: B.filter((_, i) => !usedB.has(i)).map(x => x.ref) };
}
