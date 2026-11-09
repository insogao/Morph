import test from "node:test";
import assert from "node:assert/strict";
import set from "../lab/mm-word/glyphs.json" with { type: "json" };
import * as S from "../fixtures/s0/shapes";
import { dist, signedArea } from "../packages/morph-engine/src/vector/geom";
import { fit } from "../packages/morph-engine/src/vector/shape";
import { iconSlot, layoutText, mergeFrames, morphWords, staggered, type GlyphSet } from "../packages/morph-engine/src/vector/text";
import { deviation } from "../packages/morph-engine/src/vector/qc";

const glyphs = set as GlyphSet;
const line = (text: string, size = 200) => layoutText(glyphs, text, { at: [640, 360], size });
const kinds = (m: ReturnType<typeof morphWords>) => m.map(s => (s.from?.ch ?? "_") + ">" + (s.to?.ch ?? "_") + ":" + s.kind);

test("glyph outlines come from real fonts, with holes where letters have counters", () => {
  const [M, O, R] = line("MOR");
  assert.equal(M.shape.pieces.length, 1);
  assert.equal(M.shape.pieces[0].holes.length, 0);
  assert.equal(O.shape.pieces[0].holes.length, 1);
  assert.equal(R.shape.pieces[0].holes.length, 1);
  assert.ok(signedArea(O.shape.pieces[0].holes[0]) < 0, "counter is a hole");
  const [bian] = line("变");
  assert.ok(bian.shape.pieces.length >= 2, "a hanzi has several stroke pieces");
  assert.match(glyphs.fonts["inter:800"].source, /OFL-1\.1/);
});

test("layout centres the line and keeps letters in reading order", () => {
  const slots = line("MASTER");
  const xs = slots.map(s => s.center[0]);
  assert.deepEqual([...xs].sort((a, b) => a - b), xs);
  const mid = (Math.min(...slots.map(s => s.x)) + Math.max(...slots.map(s => s.x + s.width))) / 2;
  assert.ok(Math.abs(mid - 640) < 1);
  assert.throws(() => line("Q"), /not extracted/);
});

test("word → word prefers turning letters into letters over vanish + birth", () => {
  assert.deepEqual(kinds(morphWords(line("MORPH"), line("MASTER"))),
    ["M>M:keep", "O>A:swap", "R>S:swap", "P>T:swap", "H>E:swap", "_>R:born"]);
});

test("a kept letter slides rigidly, without changing shape", () => {
  const morph = morphWords(line("MORPH"), line("MASTER"));
  const m = morph.find(s => s.kind === "keep")!;
  const mid = m.morph.at(0.5).pieces[0].outer;
  const a = m.from!.shape.pieces[0].outer, b = m.to!.shape.pieces[0].outer;
  const dx = (b[0][0] - a[0][0]) / 2;
  const slid = a.map(([x, y]) => [x + dx, y] as const);
  assert.ok(Math.max(deviation(mid, slid as never), deviation(slid as never, mid)) < 0.5);
});

test("endpoints of a whole line are exact: every target glyph is reproduced", () => {
  const to = line("MASTER");
  const end = mergeFrames(morphWords(line("MORPH"), to).map(s => s.morph.at(1)));
  for (const slot of to) for (const piece of slot.shape.pieces) {
    const best = Math.min(...end.pieces.map(p => Math.max(deviation(p.outer, piece.outer), deviation(piece.outer, p.outer))));
    assert.ok(best < 0.5, slot.ch + " " + best.toFixed(3));
  }
  const start = mergeFrames(morphWords(line("MORPH"), to).map(s => s.morph.at(0)));
  assert.equal(start.pieces.length, 5);
});

test("many letters gather into fewer: the extras fly into their nearest partner", () => {
  const m = morphWords(line("MASTER"), line("变形", 220));
  assert.equal(m.filter(s => s.kind === "swap").length, 2);
  const gone = m.filter(s => s.kind === "vanish");
  assert.equal(gone.length, 4);
  for (const s of gone) {
    const late = s.morph.at(0.8).pieces[0];
    assert.ok(late, s.from!.ch + " still visible at 80%");
    const c = late.outer.reduce((acc, p) => [acc[0] + p[0] / late.outer.length, acc[1] + p[1] / late.outer.length], [0, 0]);
    const targets = m.filter(x => x.to).map(x => x.to!.center);
    const start = s.from!.center;
    assert.ok(Math.min(...targets.map(t => dist(c, t))) < Math.min(...targets.map(t => dist(start, t))), "moved toward a partner");
    assert.equal(s.morph.at(1).pieces.length, 0);
  }
});

test("text → icon: one letter becomes the icon, the rest merge into it", () => {
  const icon = iconSlot(fit(S.star8, [640, 360], 220));
  const m = morphWords(line("变形", 220), [icon]);
  assert.equal(m.filter(s => s.kind === "swap").length, 1);
  assert.equal(m.filter(s => s.kind === "vanish").length, 1);
  const end = mergeFrames(m.map(s => s.morph.at(1)));
  assert.equal(end.pieces.length, 1);
});

test("stagger runs slots one after another and keeps every slot inside 0..1", () => {
  assert.equal(staggered(0, 0, 0.3), 0);
  assert.equal(staggered(0.3, 1, 0.3), 0, "last slot starts at the stagger offset");
  assert.equal(staggered(1, 1, 0.3), 1);
  assert.equal(staggered(1, 0, 0.3), 1);
  assert.ok(staggered(0.5, 0, 0.3) > staggered(0.5, 1, 0.3));
});
