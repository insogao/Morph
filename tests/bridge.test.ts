import test from "node:test";
import assert from "node:assert/strict";
import * as S from "../fixtures/s0/shapes";
import { framePrims, frameDecals, simplifyRing } from "../packages/morph-engine/src/vector/sdf-bridge";
import { circle } from "../packages/morph-engine/src/vector/shape";
import { turns } from "../packages/morph-engine/src/vector/geom";
import { validateSpec } from "../packages/morph-engine/src/vector/director";

test("frames become SDF prims: outer contours union, holes subtract", () => {
  const prims = framePrims(S.ring, { color: [1, 0, 0], blend: 8, wobble: 2 });
  assert.equal(prims.length, 2);
  assert.equal(prims[0].op ?? "union", "union");
  assert.equal(prims[1].op, "subtract");
  assert.equal(prims[0].blend, 8);
  assert.ok(prims.every(p => p.shape.kind === "polygon" && p.wobble === 2));
  const decals = frameDecals(S.disc, [0, 0, 0], 0.5, 1);
  assert.ok(decals[0].decal && decals[0].opacity === 0.5 && decals[0].bump === 1);
});

test("simplification keeps corners and stays under the vertex budget", () => {
  const dense = circle([0, 0], 100, 1000);
  assert.equal(simplifyRing(dense, 160).length, 160);
  const star = S.star8.pieces[0].outer;
  const many = star.flatMap((p, i) => { const q = star[(i + 1) % star.length]; return Array.from({ length: 20 }, (_, k) => [p[0] + (q[0] - p[0]) * k / 20, p[1] + (q[1] - p[1]) * k / 20] as const); });
  const s = simplifyRing(many, 64);
  assert.ok(s.length <= 64);
  assert.equal(turns(s).filter(t => Math.abs(t) > 0.5).length, 16, "all 16 star corners survive");
});

test("render block in morph.json is validated", () => {
  const base = { id: "x", title: "x", mappings: [{ from: "a", to: "b" }] };
  assert.doesNotThrow(() => validateSpec({ ...base, render: { track: "sdf", wobble: [0, 6, 1] } }));
  assert.throws(() => validateSpec({ ...base, render: { track: "glass", wobble: [0, 6] } }), (e: Error) => /render\.track/.test(e.message) && /render\.wobble/.test(e.message));
});

test("render.style is flat or glossy", () => {
  const base = { id: "x", title: "x", mappings: [{ from: "a", to: "b" }] };
  assert.doesNotThrow(() => validateSpec({ ...base, render: { track: "sdf", style: "flat" } }));
  assert.throws(() => validateSpec({ ...base, render: { track: "sdf", style: "matte" } }), /render\.style/);
});
