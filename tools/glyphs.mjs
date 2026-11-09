// Extract glyph outlines for a piece of text into a small JSON file the vector track can use offline.
//
//   node tools/glyphs.mjs --text "MORPH 变形" --font inter:800 --font noto-sc:900 --out lab/<id>/glyphs.json
//
// Fonts are tried in order for every character. Outlines are in a 1000-unit em, y down,
// baseline at y = 0 (so capitals sit at negative y). Only the characters asked for are written.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { inflateSync } from "node:zlib";
import opentype from "opentype.js";

const FONTS = {
  inter: { dir: "node_modules/@fontsource/inter", file: w => "inter-latin-" + w + "-normal.woff", name: "Inter" },
  "inter-ext": { dir: "node_modules/@fontsource/inter", file: w => "inter-latin-ext-" + w + "-normal.woff", name: "Inter" },
  "noto-sc": { dir: "node_modules/@fontsource/noto-sans-sc", subsets: w => new RegExp("^noto-sans-sc-\\d+-" + w + "-normal\\.woff$"), name: "Noto Sans SC" },
};

const { values } = parseArgs({ options: {
  text: { type: "string" }, font: { type: "string", multiple: true, default: ["inter:800", "noto-sc:900"] },
  out: { type: "string" },
} });
if (!values.text || !values.out) throw new Error('Usage: node tools/glyphs.mjs --text "..." [--font inter:800 --font noto-sc:900] --out file.json');

const pkg = dir => JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));

/** WOFF 1.0 → plain sfnt (TrueType/CFF). opentype.js's own inflater rejects some fonts, Node's zlib does not. */
function woffToSfnt(woff) {
  if (woff.readUInt32BE(0) !== 0x774f4646) return woff;
  const flavor = woff.readUInt32BE(4), count = woff.readUInt16BE(12);
  const tables = [];
  for (let i = 0; i < count; i++) {
    const at = 44 + i * 20;
    const tag = woff.readUInt32BE(at), offset = woff.readUInt32BE(at + 4), compLength = woff.readUInt32BE(at + 8);
    const origLength = woff.readUInt32BE(at + 12), checksum = woff.readUInt32BE(at + 16);
    const raw = woff.subarray(offset, offset + compLength);
    tables.push({ tag, checksum, data: compLength < origLength ? inflateSync(raw) : raw });
  }
  let log = 0;
  while (2 ** (log + 1) <= count) log++;
  const head = Buffer.alloc(12 + count * 16);
  head.writeUInt32BE(flavor, 0); head.writeUInt16BE(count, 4);
  head.writeUInt16BE(16 * 2 ** log, 6); head.writeUInt16BE(log, 8); head.writeUInt16BE(count * 16 - 16 * 2 ** log, 10);
  const bodies = [];
  let offset = head.length;
  tables.forEach((t, i) => {
    const at = 12 + i * 16;
    head.writeUInt32BE(t.tag, at); head.writeUInt32BE(t.checksum, at + 4);
    head.writeUInt32BE(offset, at + 8); head.writeUInt32BE(t.data.length, at + 12);
    const padded = Buffer.alloc((t.data.length + 3) & ~3);
    t.data.copy(padded);
    bodies.push(padded);
    offset += padded.length;
  });
  return Buffer.concat([head, ...bodies]);
}

const cache = new Map();
const load = file => {
  if (!cache.has(file)) {
    const buf = woffToSfnt(readFileSync(file));
    cache.set(file, opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
  }
  return cache.get(file);
};

function* candidates(spec) {
  const [key, weight = "400"] = spec.split(":");
  const def = FONTS[key];
  if (!def) throw new Error("Unknown font " + key + ". Known: " + Object.keys(FONTS).join(", "));
  const files = def.file ? [join(def.dir, "files", def.file(weight))]
    : readdirSync(join(def.dir, "files")).filter(f => def.subsets(weight).test(f)).sort().map(f => join(def.dir, "files", f));
  if (!files.length) throw new Error("No files for " + spec);
  const meta = pkg(def.dir);
  for (const file of files) yield { file, spec, family: def.name, weight: Number(weight), source: meta.name + " " + meta.version + ", " + meta.license };
}

const glyphs = {}, fonts = {}, missing = [];
for (const ch of new Set([...values.text].filter(c => c.trim()))) {
  let found = false;
  for (const spec of values.font) {
    for (const cand of candidates(spec)) {
      const font = load(cand.file);
      const index = font.charToGlyphIndex(ch);
      if (!index) continue;
      const glyph = font.glyphs.get(index), k = 1000 / font.unitsPerEm;
      glyphs[ch] = { d: glyph.getPath(0, 0, 1000).toPathData(2), advance: Math.round(glyph.advanceWidth * k * 100) / 100, font: spec };
      fonts[spec] ??= { family: cand.family, weight: cand.weight, source: cand.source,
        ascender: Math.round(font.ascender * k), descender: Math.round(font.descender * k), capHeight: Math.round((font.tables.os2?.sCapHeight ?? 700 / k) * k) };
      found = true;
      break;
    }
    if (found) break;
  }
  if (!found) missing.push(ch);
}
if (missing.length) throw new Error("No font has: " + missing.join(" "));
// Space width from the first font, so layout can place words.
const first = [...candidates(values.font[0])][0];
const space = load(first.file);
const spaceIndex = space.charToGlyphIndex(" ");
const out = { em: 1000, space: spaceIndex ? Math.round(space.glyphs.get(spaceIndex).advanceWidth * 1000 / space.unitsPerEm) : 250, fonts, glyphs };
mkdirSync(dirname(values.out), { recursive: true });
writeFileSync(values.out, JSON.stringify(out, null, 1) + "\n");
console.log(values.out + "  " + Object.keys(glyphs).length + " glyphs from " + Object.keys(fonts).join(", "));
