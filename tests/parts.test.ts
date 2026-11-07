import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../fixtures/s0/shapes";
import { centroid, dist, signedArea, type Vec2 } from "../packages/morph-engine/src/vector/geom";
import { parseSvg, parseTransform, placeSvg } from "../packages/morph-engine/src/vector/svg";
import { channel, poseMorph, poseOf, remapParts, type Mapping } from "../packages/morph-engine/src/vector/remap";
import { blendSpace } from "../packages/morph-engine/src/vector/blend";
import { deviation } from "../packages/morph-engine/src/vector/qc";
import { mapShape, shapeFromRings, circle } from "../packages/morph-engine/src/vector/shape";

const flower = placeSvg(parseSvg(readFileSync("fixtures/s1/flower.svg", "utf8")), [640, 360], 560);
const butterfly = placeSvg(parseSvg(readFileSync("fixtures/s1/butterfly.svg", "utf8")), [640, 360], 560);
const ids = (doc: typeof flower) => doc.parts.map(p => p.id);
const same = (a: Vec2[], b: Vec2[]) => Math.max(deviation(a, b), deviation(b, a));

export const D1: Mapping[] = [
  { from: "petal_5", to: "wing_ul", style: "pose", arc: 40 },
  { from: "petal_2", to: "wing_ur", style: "pose", arc: -40 },
  { from: "petal_4", to: "wing_ll", style: "pose" },
  { from: "petal_3", to: "wing_lr", style: "pose" },
  { from: "petal_1", to: ["antenna_l", "antenna_r"] },
  { from: ["center", "stem", "leaf_l", "leaf_r"], to: "body", stagger: 0.1 },
  { from: [], to: ["spot_ul", "spot_ur", "spot_ll", "spot_lr"] },
];

test("SVG import: ids, nested transforms, fills, circles and groups", () => {
  assert.deepEqual(ids(flower), ["stem", "leaf_l", "leaf_r", "petal_1", "petal_2", "petal_3", "petal_4", "petal_5", "center"]);
  const doc = parseSvg(readFileSync("fixtures/s1/flower.svg", "utf8"));
  const p1 = doc.parts.find(p => p.id === "petal_1")!, p3 = doc.parts.find(p => p.id === "petal_3")!;
  const tip = (part: typeof p1) => part.shape.pieces[0].outer.reduce((best, p) => dist(p, [200, 165]) > dist(best, [200, 165]) ? p : best);
  assert.ok(dist(tip(p1), [200, 37]) < 1.5, "petal_1 points up from the translated centre");
  assert.ok(dist(tip(p3), [200 + 128 * Math.sin(144 * Math.PI / 180), 165 - 128 * Math.cos(144 * Math.PI / 180)]) < 1.5, "rotate() inside translate()");
  assert.equal(doc.parts.find(p => p.id === "center")!.fill, "#ffcc33");
  const bdoc = parseSvg(readFileSync("fixtures/s1/butterfly.svg", "utf8"));
  const ant = bdoc.parts.find(p => p.id === "antenna_r")!;
  assert.equal(ant.shape.pieces.length, 2, "group id collects both children");
  assert.equal(ant.shape.pieces[0].holes.length + ant.shape.pieces[1].holes.length, 0, "overlapping elements never cut holes");
  assert.equal(ant.fill, "#23232b", "fill inherited from the group");
  assert.deepEqual(doc.issues, { openPaths: [], strokeOnly: [], gradients: [], texts: 0, images: 0, anonymous: 0 });
});

test("SVG import reports issues an AI must tell the user about", () => {
  const doc = parseSvg(`<svg viewBox="0 0 10 10"><path d="M0 0 L5 5" stroke="#000" fill="none"/><rect width="4" height="4" fill="url(#g)"/><text>hi</text></svg>`);
  assert.equal(doc.issues.texts, 1);
  assert.equal(doc.issues.anonymous, 2, "both shapes lack ids");
  assert.deepEqual(doc.issues.gradients, ["anon-1"]);
  assert.deepEqual(doc.issues.openPaths, ["anon-0"]);
  assert.deepEqual(doc.issues.strokeOnly, ["anon-0"]);
});

test("transform parser composes left to right like SVG", () => {
  const m = parseTransform("translate(10 20) rotate(90) scale(2)");
  const [x, y] = [m[0] * 1 + m[2] * 0 + m[4], m[1] * 1 + m[3] * 0 + m[5]];
  assert.ok(Math.abs(x - 10) < 1e-9 && Math.abs(y - 22) < 1e-9);
});

test("fill rules: evenodd nests by depth, nonzero needs opposite winding for a hole", () => {
  const outer = circle([0, 0], 50), inner = circle([0, 0], 20);
  assert.equal(shapeFromRings([outer, inner], "evenodd").pieces[0].holes.length, 1);
  assert.equal(shapeFromRings([outer, inner], "nonzero").pieces.length, 2, "same winding fills");
  assert.equal(shapeFromRings([outer, [...inner].reverse()], "nonzero").pieces[0].holes.length, 1);
});

test("every part needs exactly one fate", () => {
  assert.throws(() => remapParts(flower, butterfly, D1.slice(1)), /Unmapped: source petal_5, target wing_ul/);
  assert.throws(() => remapParts(flower, butterfly, [...D1, { from: "petal_5", to: [] }]), /more than once: source petal_5/);
  assert.throws(() => remapParts(flower, butterfly, [{ from: ["petal_1", "petal_2"], to: ["wing_ul", "wing_ur"] }]), /N → M/);
  assert.throws(() => remapParts(flower, butterfly, [{ from: "petal_9", to: "body" }]), /no source part 'petal_9'/);
});

test("flower → butterfly: exact ends, true split, true merge, born spots", () => {
  const plan = remapParts(flower, butterfly, D1);
  const kinds = plan.tracks.map(t => t.kind);
  assert.equal(kinds.filter(k => k === "split").length, 2);
  assert.equal(kinds.filter(k => k === "merge").length, 4);
  assert.equal(kinds.filter(k => k === "born").length, 4);
  const start = plan.at(0), end = plan.at(1);
  // At 0 every visible piece is a flower part; at 1 every butterfly part is reproduced.
  for (const part of flower.parts) {
    assert.ok(start.some(f => f.frame.pieces.some(p => same(p.outer, part.shape.pieces[0].outer) < 0.6)), "start " + part.id);
  }
  for (const part of butterfly.parts) for (const piece of part.shape.pieces) {
    assert.ok(end.some(f => f.frame.pieces.some(p => same(p.outer, piece.outer) < 0.6)), "end " + part.id);
  }
  // Split: both antennae start as the same petal and end apart.
  const [al, ar] = ["antenna_l", "antenna_r"].map(id => plan.tracks.find(t => t.id === id)!);
  assert.ok(same(al.at(0).pieces[0].outer, ar.at(0).pieces[0].outer) < 0.5, "both clones start as the petal");
  assert.ok(dist(centroid(al.at(1).pieces[0].outer), centroid(ar.at(1).pieces[0].outer)) > 40);
  // Merge: all four sources end exactly on the body.
  const body = butterfly.parts.find(p => p.id === "body")!.shape.pieces[0].outer;
  for (const t of plan.tracks.filter(t => t.kind === "merge")) assert.ok(same(t.at(1).pieces[0].outer, body) < 0.6, t.id);
  // Paint order arrives at the target stack: antennae above the body, spots above the wings.
  const order = end.map(f => f.id);
  assert.ok(order.indexOf("antenna_l") > order.findIndex(id => id.startsWith("body")));
  assert.ok(order.indexOf("spot_ul") > order.indexOf("wing_ul"));
});

test("pose-first: the part keeps its shape while it flies, then reshapes on landing", () => {
  const petal = flower.parts.find(p => p.id === "petal_5")!.shape, wing = butterfly.parts.find(p => p.id === "wing_ul")!.shape;
  const f = poseMorph(petal, wing, { arc: 40 });
  const early = f(0.25).pieces[0].outer;
  // Up to 35% only the pose changes: same area ratio as a pure similarity transform.
  const k = poseOf(wing).size / poseOf(petal).size;
  const ratio = Math.abs(signedArea(early)) / Math.abs(signedArea(petal.pieces[0].outer));
  assert.ok(ratio > 0.95 && ratio < k * k * 1.05, "pure pose change early: " + ratio.toFixed(3));
  assert.ok(same(f(0).pieces[0].outer, petal.pieces[0].outer) < 0.5);
  assert.ok(same(f(1).pieces[0].outer, wing.pieces[0].outer) < 0.6);
  // The arc bends the flight off the straight line.
  const mid = centroid(f(0.35).pieces[0].outer), a = poseOf(petal).c, b = poseOf(wing).c;
  const off = Math.abs((b[0] - a[0]) * (mid[1] - a[1]) - (b[1] - a[1]) * (mid[0] - a[0])) / dist(a, b);
  assert.ok(off > 15, "arc offset " + off.toFixed(1));
});

test("blend space: one contour, weights pull it toward several targets at once", () => {
  const base = S.disc.pieces[0].outer, sq = S.square.pieces[0].outer, st = S.star8.pieces[0].outer;
  const space = blendSpace(base, [sq, st]);
  assert.ok(same(space.at([0, 0]), base) < 0.5);
  assert.ok(same(space.at([1, 0]), sq) < 0.5, "pure square " + same(space.at([1, 0]), sq).toFixed(2));
  assert.ok(same(space.at([0, 1]), st) < 0.5, "pure star keeps its tips " + same(space.at([0, 1]), st).toFixed(2));
  const mix = space.at([0.5, 0.5]);
  assert.equal(mix.length, space.base.length, "still one contour");
  // Continuous in the weights.
  const a = space.at([0.3, 0.2]), b = space.at([0.31, 0.2]);
  assert.ok(Math.max(...a.map((p, i) => dist(p, b[i]))) < 3);
  assert.throws(() => space.at([1]), /Expected 2 weights/);
});

test("channels give independent progress per property", () => {
  assert.equal(channel(0, [1, 2]), 0);
  assert.equal(channel(3, [1, 2]), 1);
  assert.ok(channel(1.5, [1, 2]) > 0.4 && channel(1.5, [1, 2]) < 0.6);
  const moved = mapShape(S.disc, ([x, y]) => [x + 10, y]);
  assert.ok(Math.abs(poseOf(moved).c[0] - 10) < 1e-6);
});
