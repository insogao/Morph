import test from "node:test";
import assert from "node:assert/strict";
import * as S from "../fixtures/s0/shapes";
import { signedArea, type Vec2 } from "../packages/morph-engine/src/vector/geom";
import { circle } from "../packages/morph-engine/src/vector/shape";
import { boundaryAt, buildMesh, delaunay, flips, meanValue, meshAt } from "../packages/morph-engine/src/vector/mesh";

test("Delaunay covers the convex hull exactly", () => {
  const pts: Vec2[] = [];
  // Nudge interior points only (a perfect grid is cocircular); the hull stays the 40 × 40 square.
  for (let y = 0; y <= 4; y++) for (let x = 0; x <= 4; x++) pts.push([x * 10 + (x > 0 && x < 4 && y > 0 && y < 4 ? (y % 2) * 0.3 : 0), y * 10]);
  const tris = delaunay(pts);
  const area = tris.reduce((s, [a, b, c]) => s + Math.abs(signedArea([pts[a], pts[b], pts[c]])), 0);
  assert.ok(Math.abs(area - 40 * 40) < 1, "area " + area);
});

test("mean-value coordinates reproduce linear functions (even in a concave polygon)", () => {
  const poly = S.glyphTree.pieces[0].outer;
  for (const p of [[0, 0], [10, -70], [-60, 60]] as Vec2[]) {
    const w = meanValue(poly, p);
    const x = w.reduce((s, wi, i) => s + wi * poly[i][0], 0), y = w.reduce((s, wi, i) => s + wi * poly[i][1], 0);
    assert.ok(Math.hypot(x - p[0], y - p[1]) < 1e-6, "reproduces p");
    assert.ok(Math.abs(w.reduce((s, v) => s + v, 0) - 1) < 1e-9, "partition of unity");
  }
});

test("an affine motion of the boundary carries the interior affinely, with no flips", () => {
  const a = circle([0, 0], 100, 120);
  const affine = ([x, y]: Vec2): Vec2 => [1.3 * x + 0.2 * y + 40, -0.1 * x + 0.8 * y - 20];
  const mesh = buildMesh(a, a, { boundary: 64, spacing: 14 });
  assert.ok(mesh.tris.length > 100);
  const moved = meshAt(mesh, mesh.boundaryA.map(affine));
  const worst = Math.max(...moved.map((p, i) => { const q = affine(mesh.rest[i]); return Math.hypot(p[0] - q[0], p[1] - q[1]); }));
  assert.ok(worst < 1e-6, "interior follows the affine map exactly, worst " + worst);
  assert.equal(flips(mesh, moved), 0);
  const start = meshAt(mesh, boundaryAt(mesh, 0));
  assert.ok(start.every((p, i) => Math.hypot(p[0] - mesh.rest[i][0], p[1] - mesh.rest[i][1]) < 1e-6), "t = 0 is the rest mesh");
  for (const t of [0.25, 0.5, 1]) assert.equal(flips(mesh, meshAt(mesh, boundaryAt(mesh, t))), 0, "identity morph never folds");
});

test("onB gives B's texture coordinates; boundary samples correspond one to one", () => {
  const mesh = buildMesh(S.heart.pieces[0].outer, S.star8.pieces[0].outer, { boundary: 80, spacing: 12 });
  assert.equal(mesh.boundaryA.length, 80);
  for (let k = 0; k < 80; k++) assert.deepEqual(mesh.onB[k], mesh.boundaryB[k]);
  assert.ok(mesh.tris.every(t => t.every(i => i < mesh.rest.length)));
});
