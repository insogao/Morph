import test from "node:test";
import assert from "node:assert/strict";
import * as S from "../fixtures/s0/shapes";
import { centroid, dist, signedArea, turns, wrapPi, type Vec2 } from "../packages/morph-engine/src/vector/geom";
import { matchRings, PinOrderError, resolveAnchor } from "../packages/morph-engine/src/vector/correspond";
import { morphShapes } from "../packages/morph-engine/src/vector/morph";
import { fromPath, mapShape, parsePath, polygon } from "../packages/morph-engine/src/vector/shape";
import { bounceOffset, sequence } from "../packages/morph-engine/src/vector/timeline";
import { deviation, formOf, frameSelfHits } from "../packages/morph-engine/src/vector/qc";

const PAIRS = [
  ["heart → star", S.heart, S.star8],
  ["E → M", S.letterE, S.letterM],
  ["Y → tree", S.glyphY, S.glyphTree],
  ["tree → person", S.glyphTree, S.glyphPerson],
  ["ring → Y", S.ring, S.glyphY],
  ["hourglass → X + diamonds", S.hourglass, S.crossDiamonds],
] as const;

test("wrapPi keeps 0 at 0 and folds into (−π, π]", () => {
  assert.equal(wrapPi(0), 0);
  assert.ok(Math.abs(wrapPi(3 * Math.PI) - Math.PI) < 1e-12);
  assert.ok(Math.abs(wrapPi(-Math.PI) - Math.PI) < 1e-12);
  assert.ok(Math.abs(wrapPi(-0.5) + 0.5) < 1e-12);
});

test("path parser handles relative commands, curves, arcs and compact flags", () => {
  const [square] = parsePath("m10 10 h20 v20 h-20 z");
  assert.deepEqual(square, [[10, 10], [30, 10], [30, 30], [10, 30]]);
  const [disc] = parsePath("M0 0 a10 10 0 1 1 20 0 a10 10 0 1 1 -20 0z");
  const c = centroid(disc);
  assert.ok(dist(c, [10, 0]) < 0.05, "arc centroid");
  assert.ok(Math.abs(Math.abs(signedArea(disc)) - Math.PI * 100) < 5, "arc area (polygonal, ~1%)");
  const [compact] = parsePath("M0 0a5 5 0 0120 0z");
  assert.ok(compact.length > 3);
  assert.throws(() => parsePath("M0 0 X 1 2"), /Unsupported/);
});

test("containment turns inner rings into holes with opposite winding", () => {
  assert.equal(S.ring.pieces.length, 1);
  assert.equal(S.ring.pieces[0].holes.length, 1);
  assert.ok(signedArea(S.ring.pieces[0].outer) > 0);
  assert.ok(signedArea(S.ring.pieces[0].holes[0]) < 0);
  const mirrored = mapShape(S.ring, ([x, y]) => [-x, y]);
  assert.ok(signedArea(mirrored.pieces[0].outer) > 0 && signedArea(mirrored.pieces[0].holes[0]) < 0, "mirroring keeps the convention");
});

for (const mode of ["linear", "intrinsic"] as const) {
  test(mode + ": endpoints reproduce the source and target exactly", () => {
    for (const [name, a, b] of PAIRS) {
      const m = morphShapes(a, b, { mode });
      const f0 = m.at(0), f1 = m.at(1);
      const pieces0 = f0.pieces.filter(p => Math.abs(signedArea(p.outer)) > 1);
      assert.equal(pieces0.length, a.pieces.length, name + " piece count at 0");
      assert.equal(f1.pieces.length, b.pieces.length, name + " piece count at 1");
      // Every target piece is reproduced by some frame piece within half a pixel, both ways.
      for (const target of b.pieces) {
        const best = Math.min(...f1.pieces.map(p => Math.max(deviation(p.outer, target.outer), deviation(target.outer, p.outer))));
        assert.ok(best < 0.5, name + " t=1 deviation " + best.toFixed(3));
      }
      for (const source of a.pieces) {
        const best = Math.min(...pieces0.map(p => Math.max(deviation(p.outer, source.outer), deviation(source.outer, p.outer))));
        assert.ok(best < 0.5, name + " t=0 deviation " + best.toFixed(3));
      }
      assert.equal(m.report.selfHits, 0, name + " self-intersections in between");
    }
  });
}

test("authored corners stay sharp: the target's corners are all present at t = 1", () => {
  const m = morphShapes(S.heart, S.star8, { mode: "intrinsic" });
  assert.equal(formOf(m.at(1).pieces[0].outer).corners, 16);
  const e = morphShapes(S.letterM, S.letterE, { mode: "intrinsic" });
  assert.equal(formOf(e.at(1).pieces[0].outer).corners, 12);
});

test("intrinsic in-betweens keep the size on the √area line (no swelling)", () => {
  for (const [name, a, b] of PAIRS.slice(0, 4)) {
    const m = morphShapes(a, b, { mode: "intrinsic" });
    const ra = Math.sqrt(Math.abs(signedArea(a.pieces[0].outer))), rb = Math.sqrt(Math.abs(signedArea(b.pieces[0].outer)));
    for (const t of [0.25, 0.5, 0.75]) {
      const r = Math.sqrt(Math.abs(signedArea(m.at(t).pieces[0].outer)));
      assert.ok(Math.abs(r - (ra + (rb - ra) * t)) < 0.5, name + " size at " + t);
    }
  }
});

test("a pin forces two chosen points to correspond", () => {
  const a = S.heart.pieces[0].outer, b = S.star8.pieces[0].outer;
  const m = matchRings(a, b, { pins: [{ a: "bottom", b: "top" }] });
  const pin = m.knots.findIndex(k => k.kind === "pin");
  const i = m.knotIndex[pin];
  assert.ok(dist(m.a[i], [0, 78]) < 0.5, "heart tip");
  assert.ok(dist(m.b[i], [0, -100]) < 0.5, "star top");
  assert.equal(m.a.length, m.b.length);
});

test("readable anchors resolve on the contour", () => {
  const ring = S.star8.pieces[0].outer;
  const top = resolveAnchor(ring, { corner: 0 });
  const right = resolveAnchor(ring, { angle: 90 });
  assert.ok(Math.abs(top - resolveAnchor(ring, "top")) < 1e-6, "corner 0 is the 12 o'clock tip");
  assert.ok(Math.abs(right - resolveAnchor(ring, [100, 0])) < 1e-3, "angle 90 points right");
});

test("pins whose order differs on the two contours are rejected as a fault", () => {
  const a = S.square.pieces[0].outer, b = S.star8.pieces[0].outer;
  assert.throws(() => matchRings(a, b, { pins: [
    { a: [-85, -85], b: { corner: 0 } }, { a: [85, -85], b: { corner: 4 } }, { a: [85, 85], b: { corner: 2 } },
  ] }), PinOrderError);
});

test("several pins may share one target point (one-to-many)", () => {
  const a = S.square.pieces[0].outer, b = S.star8.pieces[0].outer;
  const m = matchRings(a, b, { pins: [{ a: [-85, -85], b: "top" }, { a: [85, -85], b: "top" }] });
  const idx = m.knots.flatMap((k, j) => k.kind === "pin" ? [m.knotIndex[j]] : []);
  assert.equal(idx.length, 2);
  assert.ok(dist(m.b[idx[0]], m.b[idx[1]]) < 1e-6);
  assert.ok(dist(m.a[idx[0]], m.a[idx[1]]) > 100);
});

test("many → one: unmatched pieces are born from vanishing points", () => {
  const self = morphShapes(S.hourglass, S.crossDiamonds, { vanish: "self" });
  assert.equal(self.report.pairs.length, 1);
  assert.deepEqual(self.report.born.sort(), [1, 2, 3, 4]);
  assert.equal(self.at(0).pieces.length, 1, "nothing extra at the start");
  const mid = self.at(0.5).pieces;
  assert.equal(mid.length, 5);
  // "self": a diamond grows in place around its own centre.
  const d = S.crossDiamonds.pieces[1];
  const grown = mid.find(p => dist(centroid(p.outer), centroid(d.outer)) < 1);
  assert.ok(grown, "diamond grows in place");
  assert.ok(Math.abs(signedArea(grown!.outer)) < Math.abs(signedArea(d.outer)));
  // "partner": it starts at the matched piece's centre and travels out.
  const fly = morphShapes(S.hourglass, S.crossDiamonds, { vanish: "partner" });
  const early = fly.at(0.3).pieces.slice(1).map(p => dist(centroid(p.outer), [0, 0]));
  assert.ok(early.every(r => r < 70), "partner pieces start near the centre");
  // Reversed: the diamonds vanish into points.
  const back = morphShapes(S.crossDiamonds, S.hourglass);
  assert.equal(back.report.vanished.length, 4);
  assert.equal(back.at(1).pieces.length, 1);
});

test("an unmatched hole closes up during the morph", () => {
  const m = morphShapes(S.ring, S.glyphY);
  assert.equal(m.at(0).pieces[0].holes.length, 1);
  assert.equal(m.at(1).pieces[0].holes.length, 0);
  const open = Math.abs(signedArea(m.at(0.4).pieces[0].holes[0] ?? [[0, 0], [0, 0], [0, 0]]));
  assert.ok(open > 0 && open < Math.abs(signedArea(S.ring.pieces[0].holes[0])));
});

test("auto rotation finds a turned copy and replays the turn exactly", () => {
  const turned = mapShape(S.letterE, ([x, y]) => [-y, x]); // E rotated 90°
  const m = morphShapes(S.letterE, turned, { rotate: "auto" });
  const deg = m.report.pairs[0].angle * 180 / Math.PI;
  assert.ok(Math.abs(Math.abs(deg) - 90) <= 15, "found ~90°, got " + deg);
  const end = m.at(1).pieces[0].outer;
  assert.ok(Math.max(deviation(end, turned.pieces[0].outer), deviation(turned.pieces[0].outer, end)) < 0.5);
  // The in-between is the same letter turning, not a squashed blend.
  const mid = formOf(m.at(0.5).pieces[0].outer);
  assert.equal(mid.corners, 12);
});

test("bounce overshoots after arrival, then settles", () => {
  const b = { amplitude: 12, frequency: 3, decay: 5 };
  assert.equal(bounceOffset(b, 0), 0);
  assert.ok(bounceOffset(b, 1 / 12) > 0.05, "first overshoot");
  assert.ok(Math.abs(bounceOffset(b, 2)) < 1e-4, "settled");
  const seq = sequence([{ shape: S.disc, hold: 0.2 }, { shape: S.square, morph: 1, hold: 1, bounce: b }]);
  const after = seq.at(1.2 + 1 / 12);
  assert.ok(after.progress > 1.05);
  assert.equal(frameSelfHits(after.frame), 0);
});

test("a looping sequence is deterministic and returns to its first shape", () => {
  const seq = sequence([
    { shape: S.ring, hold: 0.3 }, { shape: S.glyphY, morph: 0.8, hold: 0.3 },
    { shape: S.glyphTree, morph: 0.8, hold: 0.3 }, { shape: S.glyphPerson, morph: 0.8, hold: 0.3 },
  ], true);
  assert.equal(seq.windows.length, 4);
  const a = JSON.stringify(seq.at(1.7).frame), b = JSON.stringify(seq.at(1.7).frame);
  assert.equal(a, b);
  const end = seq.at(seq.duration).frame;
  assert.equal(end.pieces[0].holes.length, 1, "back to the ring");
  const back = seq.at(0.2).frame.pieces[0];
  assert.ok(Math.max(deviation(back.outer, S.ring.pieces[0].outer), deviation(S.ring.pieces[0].outer, back.outer)) < 0.5);
});

test("reports count crossing trajectories (the 'fault' signal)", () => {
  const easy = morphShapes(S.disc, S.square);
  const hard = morphShapes(S.letterE, S.letterM);
  assert.ok(hard.report.crossings[0] > easy.report.crossings[0]);
});

test("degenerate input is refused", () => {
  assert.throws(() => sequence([{ shape: S.disc }]), /at least two/);
  assert.throws(() => morphShapes(S.disc, S.square).at(NaN), RangeError);
  assert.equal(fromPath("M0 0 L1 0 Z").pieces.length, 0, "a sliver is not a shape");
  assert.equal(polygon([[0, 0], [10, 0], [10, 10]]).pieces.length, 1);
  const total = turns(S.square.pieces[0].outer).reduce((s, t) => s + t, 0);
  assert.ok(Math.abs(total - 2 * Math.PI) < 1e-9);
  void ([0, 0] satisfies Vec2);
});
