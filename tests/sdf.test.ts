import { test } from "node:test";
import assert from "node:assert/strict";
import { packPrims, primBounds, type Prim } from "../packages/morph-engine/src/renderers/sdf-gl";
import { blendStroke, curve, resample, strokePrims, taper, transformPrims } from "../packages/morph-engine/src/effects/skeleton";

const ellipse: Prim = { shape: { kind: "ellipse", x: 10, y: 20, rx: 5, ry: 8 }, color: [1, 0, 0] };

test("packs primitives into six texels each", () => {
  const data = packPrims([ellipse, { ...ellipse, op: "subtract", blend: 3 }]);
  assert.equal(data[0], 0);
  assert.deepEqual([...data.slice(4, 8)], [10, 20, 5, 8]);
  assert.equal(data[24 + 1], 1);
  assert.equal(data[24 + 2], 3);
  assert.throws(() => packPrims([{ ...ellipse, shape: { kind: "ellipse", x: NaN, y: 0, rx: 1, ry: 1 } }]));
});

test("bounds include blend reach and ignore halfplanes", () => {
  const b = primBounds([{ ...ellipse, blend: 2 }, { shape: { kind: "halfplane", nx: 0, ny: 1, offset: 0 }, color: [0, 0, 0] }])!;
  assert.deepEqual([b.x0, b.y0, b.x1, b.y1], [0, 10, 20, 30]);
});

test("curvature integration closes a circle", () => {
  const n = 64, L = 2 * Math.PI * 50;
  const pts = curve({ x: 0, y: 0, angle: 0, length: L, segments: n, curvature: () => 1 / 50 });
  assert.equal(pts.length, n + 1);
  assert.ok(Math.hypot(pts[n][0], pts[n][1]) < 1e-6 * L + 1e-3);
});

test("strokes blend point-wise and resample by arc length", () => {
  const a = { points: resample([[0, 0], [10, 0]], 5), radii: taper(5, 4, 1) };
  const b = { points: resample([[0, 10], [10, 10]], 5), radii: taper(5, 8, 2) };
  const m = blendStroke(a, b, .5);
  assert.deepEqual(m.points[2], [5, 5]);
  assert.equal(m.radii[0], 6);
  assert.equal(strokePrims(m, { color: [0, 0, 0] }).length, 4);
});

test("rigid transform keeps halfplane membership", () => {
  const plane: Prim = { shape: { kind: "halfplane", nx: 0, ny: 1, offset: 5 }, color: [0, 0, 0] };
  const [moved] = transformPrims([plane], Math.PI / 2, [3, 4], [10, -2], 2);
  const s = moved.shape as { nx: number; ny: number; offset: number };
  // Point (0, 4) is inside (y < 5). Transform it the same way and it must remain inside.
  const c = Math.cos(Math.PI / 2), sn = Math.sin(Math.PI / 2);
  const dx = (0 - 3) * 2, dy = (4 - 4) * 2;
  const p = [c * dx - sn * dy + 13, sn * dx + c * dy + 2];
  assert.ok(s.nx * p[0] + s.ny * p[1] < s.offset);
});

import { area, fracture, matchCells, resampleClosed } from "../packages/morph-engine/src/effects/fracture";
import { colonize } from "../packages/morph-engine/src/effects/growth";

const square: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100]];

test("fracture tiles the outline without losing area", () => {
  const cells = fracture(square, 20, 3);
  const total = cells.reduce((s, c) => s + Math.abs(area(c)), 0);
  assert.ok(Math.abs(total - 10000) < 1, "area " + total);
  assert.deepEqual(fracture(square, 20, 3), cells, "deterministic");
  const match = matchCells(cells, fracture(square, 20, 9));
  assert.equal(new Set(match.filter(j => j >= 0)).size, match.filter(j => j >= 0).length, "one-to-one");
  assert.equal(resampleClosed(cells[0], 16).length, 16);
});

test("space colonization stays deterministic and reaches the outline", () => {
  const a = colonize(square, [50, 160], { seed: 2, attractors: 200 });
  const b = colonize(square, [50, 160], { seed: 2, attractors: 200 });
  assert.equal(a.nodes.length, b.nodes.length);
  assert.ok(a.nodes.some(n => n.p[1] < 30), "branches reach the top of the outline");
  assert.ok(a.nodes[0].radius > a.nodes.at(-1)!.radius, "pipe model thickens the root");
});
