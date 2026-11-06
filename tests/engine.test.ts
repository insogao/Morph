import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { validatePlan, type MorphPlan } from "../packages/morph-engine/src/core/plan";
import { compileParts } from "../packages/morph-engine/src/core/parts";
import { compose } from "../packages/morph-engine/src/core/effects";
import { frameCount, frameTime } from "../packages/morph-engine/src/core/scene";
import { contourMorph } from "../packages/morph-engine/src/effects/contour";

test("the frame grid includes the exact source and destination", () => {
  const count = frameCount(7.6, 30);
  assert.equal(count, 228);
  assert.equal(frameTime(0, count, 7.6), 0);
  assert.equal(frameTime(count - 1, count, 7.6), 7.6);
  assert.throws(() => frameCount(NaN, 30), RangeError);
  assert.throws(() => frameTime(count, count, 7.6), RangeError);
});

test("child part inherits parent transform even when declared first", () => {
  const child = { id: "arm", parent: "body", geometry: () => "rib", material: () => "copper",
    transform: () => [1, 0, 0, 1, 5, 2] as const, maySplit: true };
  const parent = { id: "body", geometry: () => "canopy", material: () => "silk",
    transform: (time: number) => [2, 0, 0, 2, time, 10] as const };
  const [body, arm] = compileParts([child, parent])(7);
  assert.equal(body.id, "body");
  assert.deepEqual(arm.world, [2, 0, 0, 2, 17, 14]);
  assert.equal(arm.maySplit, true);
  assert.throws(() => compileParts([child]), /Missing parent/);
  assert.throws(() => compileParts([child, { ...parent, parent: "arm" }]), /Cyclic/);
});

test("effect cues compose and can be evaluated in any order", () => {
  const timeline = compose(() => ({ x: 0 }), [
    { from: 0, to: 2, effect: { id: "grow", apply: (state, frame) => ({ x: state.x + frame.progress * 10 }) } },
    { from: 1, to: 3, effect: { id: "pull", apply: (state, frame) => ({ x: state.x * (1 + frame.progress) }) } },
  ]);
  assert.deepEqual(timeline(3), { x: 20 });
  assert.deepEqual(timeline(2), { x: 15 });
  assert.deepEqual(timeline(1), { x: 5 });
  assert.deepEqual(timeline(3), { x: 20 });
  assert.throws(() => timeline(Infinity), /finite/);
});

test("corresponding contours retain exact source and target rings", () => {
  const from = "M0,0 L40,0 L40,40 L0,40 Z";
  const to = "M20,-5 L45,20 L20,45 L-5,20 Z";
  const morph = contourMorph([{ from, to }, { from: to, to: from }]);
  assert.deepEqual(morph(-1), [from, to]);
  assert.deepEqual(morph(2), [to, from]);
  assert.ok(morph(.5).every(value => value.startsWith("M") && !value.includes("NaN")));
  assert.throws(() => morph(NaN), /finite/);
});

for (const folder of ["demos", "examples"]) {
  let files: string[];
  try { files = readdirSync(folder, { recursive: true, encoding: "utf8" }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
    throw error;
  }
  for (const file of files.filter(name => name.endsWith("plan.json"))) {
    const path = join(folder, file);
    test("valid plan " + path, () => {
      const plan = JSON.parse(readFileSync(path, "utf8")) as MorphPlan;
      validatePlan(plan);
      const corrupted = structuredClone(plan);
      corrupted.mappings[0].to.push("missing-part");
      assert.throws(() => validatePlan(corrupted), /Invalid semantic mapping/);
    });
  }
}
