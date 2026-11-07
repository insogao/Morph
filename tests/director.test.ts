import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { remapScene, validateSpec } from "../packages/morph-engine/src/vector/director";
import { remapParts } from "../packages/morph-engine/src/vector/remap";
import { parseSvg, placeSvg } from "../packages/morph-engine/src/vector/svg";
import { suggestMapping } from "../packages/morph-engine/src/vector/suggest";

const svg = (path: string) => readFileSync(path, "utf8");
const PAIRS: Array<[string, string]> = [
  ["fixtures/s1/flower.svg", "fixtures/s1/butterfly.svg"],
  ["fixtures/s1/fish.svg", "fixtures/s1/bird.svg"],
  ["fixtures/s1g/bulb.svg", "fixtures/s1g/balloon.svg"],
  ["fixtures/s1g/umbrella.svg", "fixtures/s1g/jellyfish.svg"],
];

test("validateSpec reports every problem at once, in words an AI can act on", () => {
  assert.throws(() => validateSpec({
    id: "Bad Id", mappings: [{ from: "a", to: "b", window: [0.8, 0.2], style: "teleport", ease: "bouncy" }],
    cause: [{ type: "earthquake" }], payoff: [{ type: "flap", parts: ["w"] }, { type: "lift", to: [1] }],
  }), (e: Error) => {
    for (const bit of ["id:", "title:", "window", "style", "ease", "cause[0].type", "payoff[0].axis", "payoff[1].to"]) assert.match(e.message, new RegExp(bit.replace(/[[\]().]/g, "\\$&")), bit);
    return true;
  });
  assert.throws(() => validateSpec(null), /object/);
});

test("every lab morph.json validates and builds a scene (all parts have a fate)", () => {
  const dirs = readdirSync("lab").filter(d => existsSync("lab/" + d + "/morph.json"));
  assert.ok(dirs.length >= 3, "at least the three spec-driven demos");
  for (const dir of dirs) {
    const spec = validateSpec(JSON.parse(svg("lab/" + dir + "/morph.json")));
    const scene = readFileSync("lab/" + dir + "/scene.ts", "utf8");
    // The SVGs may live anywhere: "../../fixtures/x.svg?raw" or "./local.svg?raw" next to the scene.
    const path = (name: string) => {
      const m = scene.match(new RegExp("import " + name + ' from "(\\.\\.?/[^"]+?)\\?raw"'));
      assert.ok(m, `lab/${dir}/scene.ts: expected \`import ${name} from "<relative path>.svg?raw"\``);
      return join("lab", dir, m[1]);
    };
    const built = remapScene(spec, svg(path("source")), svg(path("target")));
    assert.equal(built.id, dir);
    assert.ok(built.duration > 3);
  }
});

test("unknown part ids in motions fail loudly", () => {
  const spec = validateSpec({ id: "x", title: "x", mappings: [{ from: "glass", to: "envelope" }], cause: [{ type: "sway", pivot: "nope@bottom" }] });
  assert.throws(() => remapScene(spec, svg("fixtures/s1g/bulb.svg"), svg("fixtures/s1g/balloon.svg")), /no part 'nope'|Every part needs a fate/);
});

for (const [a, b] of PAIRS) for (const [from, to] of [[a, b], [b, a]]) {
  test("suggestMapping drafts a runnable morph for " + from.split("/").pop() + " → " + to.split("/").pop(), () => {
    const docA = parseSvg(svg(from)), docB = parseSvg(svg(to));
    const { spec, review, roles } = suggestMapping(docA, docB, "draft");
    validateSpec(spec);
    // Every part of both drawings has exactly one fate, so the draft runs as is.
    remapParts(placeSvg(docA, [640, 360], 540), placeSvg(docB, [640, 360], 540), spec.mappings as never);
    assert.equal(roles.source.length, docA.parts.length);
    assert.ok(review.at(-1)!.includes("geometry only"), "the draft says it is a draft");
  });
}
