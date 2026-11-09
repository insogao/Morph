import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { meshArea, noise3, pairPools, sampleSurface, vertexTimes, type PartMesh } from "../packages/morph-engine/src/vector/cloud";

/** Two triangles forming a unit square in the XY plane, plus one far triangle of a quarter of the area. */
const square: PartMesh = { name: "sq", color: [1, 0, 0], positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 5, 5, 0, 5.5, 5, 0, 5, 6, 0]), index: new Uint32Array([0, 1, 2, 0, 2, 3, 4, 5, 6]) };

test("surface sampling is area-weighted and deterministic", () => {
  assert.ok(Math.abs(meshArea(square) - 1.25) < 1e-9);
  const times = vertexTimes(square, () => 0);
  const pts = sampleSurface(square, times, 5000, 1);
  const far = pts.filter(p => p.p[0] >= 4.9).length / pts.length;
  assert.ok(Math.abs(far - 0.2) < 0.03, "the far triangle holds 20% of the area, got " + far.toFixed(3));
  assert.deepEqual(sampleSurface(square, times, 50, 7), sampleSurface(square, times, 50, 7));
});

test("a sample's time is the barycentric blend of its triangle's vertex times (what the shader interpolates)", () => {
  // A linear field over positions is reproduced exactly at every sample, so mesh and points agree.
  const field = ([x, y]: [number, number, number]) => 0.2 * x + 0.5 * y;
  const pts = sampleSurface(square, vertexTimes(square, field), 400, 3);
  for (const s of pts) assert.ok(Math.abs(s.time - field(s.p)) < 1e-6);
});

test("noise is smooth, in range and seedable", () => {
  const a = noise3(0.3, 0.4, 0.5), b = noise3(0.3001, 0.4, 0.5);
  assert.ok(a >= 0 && a <= 1);
  assert.ok(Math.abs(a - b) < 0.01, "continuous");
  assert.notEqual(noise3(0.3, 0.4, 0.5, 0.35, 1), noise3(0.3, 0.4, 0.5, 0.35, 2));
});

test("Morton pairing keeps layout: matching a pool to a shifted copy pairs each point with its twin", () => {
  const pts = sampleSurface(square, vertexTimes(square, () => 0), 600, 5).filter(p => p.p[0] < 2);
  const moved = pts.map(p => ({ ...p, p: [p.p[0] + 10, p.p[1], p.p[2]] as [number, number, number] }));
  const pairs = pairPools(pts, moved);
  const err = pairs.map(([i, j]) => Math.hypot(moved[j].p[0] - 10 - pts[i].p[0], moved[j].p[1] - pts[i].p[1])).reduce((s, e) => s + e, 0) / pairs.length;
  assert.ok(err < 0.02, "mean pairing error " + err.toFixed(4));
  assert.throws(() => pairPools([], moved), /need points/);
});

test("GLB fixtures are valid glTF 2.0 with the named parts the demos map", () => {
  const nodes = (file: string) => {
    const b = readFileSync(file);
    assert.equal(b.readUInt32LE(0), 0x46546c67, "glTF magic");
    assert.equal(b.readUInt32LE(4), 2, "version 2");
    assert.equal(b.readUInt32LE(8), b.length, "declared length");
    const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
    return json.nodes.map((n: { name: string }) => n.name);
  };
  assert.deepEqual(nodes("fixtures/s3/rocket.glb"), ["nose", "body", "window", "fin_a", "fin_b", "fin_c", "flame"]);
  assert.deepEqual(nodes("fixtures/s3/lighthouse.glb"), ["cap", "lamp", "gallery", "tower", "stripe_1", "stripe_2", "door", "base"]);
});
