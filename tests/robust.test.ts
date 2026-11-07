import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSvg, placeSvg, normalizeColor } from "../packages/morph-engine/src/vector/svg";
import { svgToDesign, validateSpec } from "../packages/morph-engine/src/vector/director";
import { maxOf, minOf, pushAll, type Vec2 } from "../packages/morph-engine/src/vector/geom";
import { buildMesh, meshQuality } from "../packages/morph-engine/src/vector/mesh";
import { circle } from "../packages/morph-engine/src/vector/shape";

// ——— SVG from design tools ———

test("Illustrator-style <style> classes give parts their colours (not black)", () => {
  const doc = parseSvg(`<svg viewBox="0 0 100 100"><style type="text/css"><![CDATA[ .st0{fill:#E30613;} .st1{fill:#1D1D1B} ]]></style>
    <g id="cap"><path class="st0" d="M10,10H50V50H10Z"/></g><circle id="dot" class="st1" cx="70" cy="70" r="10"/></svg>`);
  assert.equal(doc.parts.find(p => p.id === "cap")!.fill, "#e30613");
  assert.equal(doc.parts.find(p => p.id === "dot")!.fill, "#1d1d1b");
});

test("cascade: presentation attribute < class rule < inline style; #id rule beats .class", () => {
  const doc = parseSvg(`<svg viewBox="0 0 10 10"><style>.a{fill:red} #b{fill:blue} rect{fill:green}</style>
    <rect id="x" class="a" fill="yellow" width="2" height="2"/><rect id="b" class="a" width="2" height="2" x="3"/>
    <rect id="y" class="a" style="fill:#00ff00" width="2" height="2" x="6"/><rect id="z" width="2" height="2" y="5"/></svg>`);
  const f = (id: string) => doc.parts.find(p => p.id === id)!.fill;
  assert.equal(f("x"), "#ff0000"); assert.equal(f("b"), "#0000ff"); assert.equal(f("y"), "#00ff00"); assert.equal(f("z"), "#008000");
});

test("<use> / <symbol> are expanded with their offsets; broken references are reported", () => {
  const doc = parseSvg(`<svg viewBox="0 0 100 100"><defs><symbol id="leaf"><rect width="10" height="4" fill="#2d6a4f"/></symbol></defs>
    <use id="leaf_1" href="#leaf" x="20" y="30"/><use id="leaf_2" xlink:href="#leaf" transform="translate(50,0)"/><use href="#nope"/></svg>`);
  const l1 = doc.parts.find(p => p.id === "leaf_1")!, l2 = doc.parts.find(p => p.id === "leaf_2")!;
  assert.ok(l1 && l2, "both copies become parts");
  assert.equal(l1.fill, "#2d6a4f");
  const xs = (p: typeof l1) => p.shape.pieces[0].outer.map(v => v[0]);
  assert.ok(Math.min(...xs(l1)) >= 19.9 && Math.max(...xs(l1)) <= 30.1);
  assert.ok(Math.min(...xs(l2)) >= 49.9);
  assert.deepEqual(doc.issues.brokenUses, ["nope"]);
});

test("colours: named, short hex, rgb(), hsl(), currentColor; unknown ones are reported", () => {
  assert.equal(normalizeColor("Tomato"), "#ff6347");
  assert.equal(normalizeColor("#abc"), "#aabbcc");
  assert.equal(normalizeColor("rgb(255, 0, 128)"), "#ff0080");
  assert.equal(normalizeColor("rgba(0,0,255,.5)"), "#0000ff");
  assert.equal(normalizeColor("hsl(120, 100%, 25%)"), "#008000");
  assert.equal(normalizeColor("none"), null);
  const doc = parseSvg(`<svg viewBox="0 0 10 10"><g color="#123456"><rect id="c" fill="currentColor" width="2" height="2"/></g><rect id="u" fill="papayawhipish" width="2" height="2" x="5"/></svg>`);
  assert.equal(doc.parts.find(p => p.id === "c")!.fill, "#123456");
  assert.equal(doc.issues.badColors.length, 1);
});

test("hidden layers are skipped; clipped and translucent elements are flagged", () => {
  const doc = parseSvg(`<svg viewBox="0 0 10 10"><g id="guides" display="none"><rect width="9" height="9"/></g>
    <g id="art" clip-path="url(#c)"><rect width="2" height="2"/></g><rect id="ghost" opacity="0.4" width="2" height="2" x="5"/></svg>`);
  assert.ok(!doc.parts.some(p => p.id === "guides"));
  assert.deepEqual(doc.issues.clipped, ["art"]);
  assert.deepEqual(doc.issues.translucent, ["ghost"]);
});

// ——— viewBox anchors ———

test("svgToDesign matches placeSvg for any viewBox (offset origins, different aspect)", () => {
  for (const vb of ["0 0 400 400", "-100 -50 640 360", "10 20 30 90"]) {
    const doc = parseSvg(`<svg viewBox="${vb}"><rect id="r" x="3" y="7" width="11" height="13"/></svg>`);
    const placed = placeSvg(doc, [640, 360], 540), f = svgToDesign(doc.viewBox, [640, 360], 540);
    const raw = doc.parts[0].shape.pieces[0].outer, out = placed.parts[0].shape.pieces[0].outer;
    raw.forEach((p, i) => { const q = f(p); assert.ok(Math.hypot(q[0] - out[i][0], q[1] - out[i][1]) < 1e-9, vb); });
  }
});

// ——— morph.json validation ———

test("validateSpec explains malformed specs instead of failing later", () => {
  const base = { id: "x", title: "X", mappings: [{ from: "a", to: "b" }] };
  const bad: Array<[unknown, RegExp]> = [
    [null, /object/], [{ ...base, mappings: [] }, /mappings/], [{ ...base, mappings: [42] }, /mappings\[0\]/],
    [{ ...base, mappings: [{ from: "a", to: "b", window: [0.8, 0.2] }] }, /window/],
    [{ ...base, place: { height: -3 } }, /place.height/], [{ ...base, timing: { morph: "4s" } }, /timing.morph/],
    [{ ...base, cause: [{ type: "sway" }] }, /pivot/], [{ ...base, payoff: [{ type: "spin", parts: ["a"], pivot: "a", turns: "two" }] }, /turns/],
    [{ ...base, render: { track: "sdf", blend: [1, 2] } }, /render.blend/], [{ ...base, render: "sdf" }, /render/],
    [{ ...base, look: { background: 3 } }, /look.background/], [{ ...base, id: "Has Spaces" }, /id/],
  ];
  for (const [spec, why] of bad) assert.throws(() => validateSpec(spec), why, JSON.stringify(spec));
  assert.doesNotThrow(() => validateSpec(base));
});

// ——— large inputs ———

test("min/max/push over very large lists do not overflow the stack", () => {
  const big = new Float32Array(2_000_000).map((_, i) => (i * 7919) % 1000003);
  assert.equal(minOf(big), 0);
  assert.ok(maxOf(big) > 1_000_000);
  assert.throws(() => Math.min(...(Array.from(big) as number[])), RangeError, "the old spread really does overflow");
  assert.equal(pushAll([] as number[], big).length, 2_000_000);
});

// ——— mesh warp quality gate ———

test("mesh warp: concave targets are measured; the intrinsic boundary keeps a C → disc warp fold-free", () => {
  const C: Vec2[] = [];
  for (let i = 0; i <= 40; i++) { const a = 0.4 + i / 40 * (2 * Math.PI - 0.8); C.push([200 + 100 * Math.cos(a), 200 + 100 * Math.sin(a)]); }
  for (let i = 40; i >= 0; i--) { const a = 0.4 + i / 40 * (2 * Math.PI - 0.8); C.push([200 + 60 * Math.cos(a), 200 + 60 * Math.sin(a)]); }
  const disc = circle([200, 200], 90);
  assert.equal(meshQuality(buildMesh(C, disc)).worstFlipShare, 0);
  assert.ok(meshQuality(buildMesh(disc, C)).worstFlipShare > 0.02, "disc → C folds: the gate must say so (degrade to a field morph)");
});

import { readFileSync } from "node:fs";
import { remapParts } from "../packages/morph-engine/src/vector/remap";

test("one solid part → a part of many pieces splits into every piece (bee body → 12 petals), not 1 + 11 born from points", () => {
  const bee = parseSvg(readFileSync("fixtures/s5/bee.svg", "utf8")), flower = parseSvg(readFileSync("fixtures/s5/sunflower.svg", "utf8"));
  assert.equal(flower.parts.find(p => p.id === "petals")!.shape.pieces.length, 12);
  const ids = (doc: typeof bee) => doc.parts.map(p => p.id);
  const rest = (from: string[], to: string[]) => [...ids(bee).filter(i => !from.includes(i)).map(i => ({ from: i, to: [] as string[] })), ...ids(flower).filter(i => !to.includes(i)).map(i => ({ from: [] as string[], to: i }))];
  const plan = remapParts(bee, flower, [{ from: "body", to: "petals" }, ...rest(["body"], ["petals"])]);
  const petals = plan.tracks.filter(t => t.id.startsWith("petals#"));
  assert.equal(petals.length, 12);
  assert.ok(petals.every(t => t.kind === "split"));
  const mid = plan.at(0.5).filter(f => f.id.startsWith("petals#"));
  assert.equal(mid.length, 12);
  assert.ok(mid.every(f => f.frame.pieces.length >= 1), "every petal copy is drawn mid-way");
});

import { chain } from "../packages/morph-engine/src/vector/chain";

test("chain: each stage starts before the previous one ends, so something is always changing", () => {
  const c = chain([{ id: "grow", duration: 4 }, { id: "fall", duration: 2.5 }, { id: "fly", duration: 3, overlap: 1 }], { lead: 0.5, tail: 1 });
  assert.deepEqual(c.windows.grow, [0.5, 4.5]);
  assert.ok(c.windows.fall[0] < c.windows.grow[1] && c.windows.fly[0] < c.windows.fall[1]);
  assert.equal(c.handoffs.length, 2);
  for (let t = 0.6; t < c.windows.fly[1]; t += 0.05) assert.ok(c.active(t).length >= 1, "no dead gap at " + t.toFixed(2));
  assert.equal(c.progress("fall", c.windows.fall[0]), 0);
  assert.equal(c.progress("fall", c.windows.fall[1]), 1);
  assert.throws(() => chain([{ id: "a", duration: 2 }, { id: "b", duration: 1, overlap: 1.5 }]), /overlap/);
});
