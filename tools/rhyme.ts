// Find SHAPE RHYMES between two materials: parts that already look alike, for a match-cut transition
// (push in on A's part until it fills the frame, hand over to B's part where they coincide, pull out on B).
//
//   npx tsx tools/rhyme.ts <A> <B> [--top 8]
//
// Each side is one of:
//   drawing.svg                              every part (by id)
//   lab/x/glyphs.json#GOOD MORNING            every letter of a text line (ids like O@1 = 2nd character)
//   picture.png@canopy=320,130,785,352        named boxes over the opaque pixels (image px); "subject" is added
//
// Output: JSON, best first: { a, b, score 0..1, note, align }. score = shape × colour (a rhyme needs both: same
// silhouette AND same colour; text has no colour here); choose among the top few by MEANING — the rhyme
// must make sense in B's world (coffee surface → soil, not coffee surface → saucer).
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { PNG } from "pngjs";
import { parseSvg } from "../packages/morph-engine/src/vector/svg";
import { layoutText, type GlyphSet } from "../packages/morph-engine/src/vector/text";
import { alignEllipse, describeMask, describeShape, maskPoints, refineAlign, suggestRhymes, type Descriptor } from "../packages/morph-engine/src/vector/rhyme";

const { positionals, values } = parseArgs({ allowPositionals: true, options: { top: { type: "string", default: "8" } } });
if (positionals.length !== 2) throw new Error("Usage: npx tsx tools/rhyme.ts <A> <B> [--top 8]   (svg | glyphs.json#TEXT | image.png@name=x0,y0,x1,y1)");

type Part = { id: string; d: Descriptor; pts?: Array<readonly [number, number]> };
function parts(spec: string): Part[] {
  if (spec.includes(".json#")) {
    const [file, text] = spec.split("#");
    const set = JSON.parse(readFileSync(file, "utf8")) as GlyphSet;
    return layoutText(set, text, { at: [640, 360], size: 160 }).map((slot, i) => ({ id: slot.ch + "@" + i, d: describeShape(slot.shape) })).filter(p => p.id.trim()[0] !== "@");
  }
  const [file, ...boxes] = spec.split("@");
  if (/\.svg$/i.test(file)) return parseSvg(readFileSync(file, "utf8")).parts.map(p => ({ id: p.id, d: { ...describeShape(p.shape), color: p.fill ?? undefined } }));
  if (/\.png$/i.test(file)) {
    const png = PNG.sync.read(readFileSync(file));
    const named = boxes.map(b => { const [name, nums] = b.split("="); return { id: name, box: nums.split(",").map(Number) as [number, number, number, number] }; });
    return [{ id: "subject", box: [0, 0, png.width, png.height] as [number, number, number, number] }, ...named].map(({ id, box }) => ({ id, d: describeMask(png.data, png.width, box, 3), pts: maskPoints(png.data, png.width, box, 3) }));
  }
  throw new Error("Unsupported input: " + spec);
}

const [a, b] = positionals.map(parts);
const r = (v: number, k = 100) => Math.round(v * k) / k;
console.log(JSON.stringify(suggestRhymes(a, b, Number(values.top)).map(c => {
  const pa = a.find(p => p.id === c.a)!, pb = b.find(p => p.id === c.b)!;
  // Bitmaps: refine by pixel overlap, and report the full transform (B image px → A image px) to paste into a scene.
  const refined = pa.pts && pb.pts ? refineAlign(pa.pts, pb.pts, alignEllipse(pa.d.ellipse, pb.d.ellipse)) : null;
  const t = refined?.align ?? c.align;
  return { a: c.a, b: c.b, score: r(c.score), note: c.note, ...(refined ? { overlap: r(refined.overlap) } : {}),
    align: { scale: r(t.scale, 1000), angleDeg: r(t.angle * 180 / Math.PI, 10), from: t.from.map(v => r(v, 10)), to: t.to.map(v => r(v, 10)) } };
}), null, 2));
