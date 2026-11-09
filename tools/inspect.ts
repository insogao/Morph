// Asset doctor: classify an input for Morph Master and say which input guide applies.
//
//   npx tsx tools/inspect.ts <file> [more files…]    → JSON on stdout
//
// SVG: parts, pieces, holes, issues (open paths, strokes, gradients, text, embedded images).
// PNG / JPEG / WebP: size and alpha (from the header; pixels are not decoded).
// GLB / glTF: named parts (nodes with meshes), triangles, world-ish bounds, base colour; skins, textures and
// animations are reported as warnings (the 3D route uses static geometry and base colours).
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { extname, basename } from "node:path";
import { parseSvg } from "../packages/morph-engine/src/vector/svg";
import { signedArea } from "../packages/morph-engine/src/vector/geom";

type Kind = "svg-icon" | "svg-parts" | "line-art" | "bitmap" | "photo" | "model-3d" | "unknown";
interface Report { file: string; kind: Kind; guide: string; details: Record<string, unknown>; warnings: string[] }

const GUIDE: Record<Kind, string> = {
  "svg-icon": "references/inputs/svg-icon.md",
  "svg-parts": "references/inputs/svg-parts.md",
  "line-art": "references/inputs/line-art.md",
  bitmap: "references/inputs/bitmap.md",
  photo: "references/inputs/photo.md",
  "model-3d": "references/inputs/model-3d.md",
  unknown: "SKILL.md",
};

function inspectSvg(file: string, text: string): Report {
  const doc = parseSvg(text);
  const warnings: string[] = [];
  const parts = doc.parts.map(p => ({
    id: p.id, fill: p.fill, stroke: p.stroke, pieces: p.shape.pieces.length,
    holes: p.shape.pieces.reduce((s, q) => s + q.holes.length, 0),
    points: p.shape.pieces.reduce((s, q) => s + q.outer.length + q.holes.reduce((t, h) => t + h.length, 0), 0),
    area: Math.round(p.shape.pieces.reduce((s, q) => s + Math.abs(signedArea(q.outer)), 0)),
    groups: p.groups,
  }));
  const { issues } = doc;
  const strokeOnly = issues.strokeOnly.length, open = issues.openPaths.length;
  let kind: Kind;
  if (parts.length && (strokeOnly >= parts.length / 2 || open >= parts.length / 2)) kind = "line-art";
  else if (parts.filter(p => !p.id.startsWith("anon-")).length >= 2) kind = "svg-parts";
  else if (parts.length) kind = parts.length === 1 || issues.anonymous ? (parts.length === 1 ? "svg-icon" : "svg-parts") : "svg-icon";
  else kind = "unknown";
  if (issues.anonymous) warnings.push(issues.anonymous + " shape(s) have no id; semantic part mapping needs ids (petal_1, wing_left …). Add ids or map by index.");
  if (open) warnings.push("Open paths (closed implicitly when filled): " + issues.openPaths.join(", ") + ". For line drawings use the line-art route.");
  if (strokeOnly) warnings.push("Stroke-only shapes: " + issues.strokeOnly.join(", ") + ". Strokes are not morphed as filled outlines.");
  if (issues.gradients.length) warnings.push("Gradient / pattern fills on: " + issues.gradients.join(", ") + ". Geometry morphs; the gradient is replaced by a flat colour.");
  if (issues.texts) warnings.push(issues.texts + " <text> element(s) ignored. Convert text to outlines, or use the text route (tools/glyphs.mjs).");
  if (issues.clipped.length) warnings.push("Clipped / masked content on: " + issues.clipped.join(", ") + ". Clipping is not applied: geometry outside the clip will show. Flatten clips in the design tool (Illustrator: Object → Clipping Mask → Release + Pathfinder Crop; Figma: Flatten).");
  if (issues.translucent.length) warnings.push("Translucent parts (opacity < 1): " + issues.translucent.join(", ") + ". They are morphed as opaque colours.");
  if (issues.badColors.length) warnings.push("Unrecognised colours (drawn black): " + issues.badColors.join("; ") + ".");
  if (issues.brokenUses.length) warnings.push("<use> references that point nowhere: " + issues.brokenUses.join(", ") + ".");
  if (issues.images) warnings.push(issues.images + " embedded <image> element(s) ignored. Bitmaps need the bitmap route.");
  const heavy = parts.filter(p => p.points > 4000);
  if (heavy.length) warnings.push("Very detailed parts (" + heavy.map(p => p.id).join(", ") + "): consider simplifying for smooth playback.");
  if (kind === "svg-icon" && parts[0]?.pieces > 1) warnings.push("One part with " + parts[0].pieces + " separate pieces: pieces pair by position and size; give them ids for semantic control.");
  return { file, kind, guide: GUIDE[kind], details: { viewBox: doc.viewBox, parts }, warnings };
}

function inspectBitmap(file: string, buf: Buffer): Report {
  const ext = extname(file).toLowerCase(), warnings: string[] = [];
  let width = 0, height = 0, alpha = false, format = ext.slice(1);
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    format = "png";
    width = buf.readUInt32BE(16); height = buf.readUInt32BE(20);
    const colorType = buf[25];
    alpha = colorType === 4 || colorType === 6 || buf.includes(Buffer.from("tRNS"));
  } else if (buf[0] === 0xff && buf[1] === 0xd8) {
    format = "jpeg";
    for (let i = 2; i + 9 < buf.length;) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1], len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) { height = buf.readUInt16BE(i + 5); width = buf.readUInt16BE(i + 7); break; }
      i += 2 + len;
    }
  } else if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") {
    format = "webp";
    const chunk = buf.subarray(12, 16).toString();
    if (chunk === "VP8X") { alpha = Boolean(buf[20] & 0x10); width = 1 + buf.readUIntLE(24, 3); height = 1 + buf.readUIntLE(27, 3); }
    else if (chunk === "VP8L") { const b = buf.readUInt32LE(21); width = 1 + (b & 0x3fff); height = 1 + ((b >> 14) & 0x3fff); alpha = Boolean((b >> 28) & 1); }
  }
  // An alpha CHANNEL is not a cut-out: photos are often saved as RGBA with every pixel opaque. Decode and measure.
  let transparent = 0, border = 0;
  if (format === "png" && alpha) {
    try {
      const png = PNG.sync.read(buf);
      let tp = 0, bt = 0, bn = 0;
      const step = Math.max(1, Math.floor(Math.sqrt(png.width * png.height / 250000)));
      let count = 0;
      for (let y = 0; y < png.height; y += step) for (let x = 0; x < png.width; x += step) {
        const a = png.data[(y * png.width + x) * 4 + 3];
        count++; if (a < 250) tp++;
        if (x < step || y < step || x >= png.width - step || y >= png.height - step) { bn++; if (a < 128) bt++; }
      }
      transparent = tp / count; border = bn ? bt / bn : 0;
    } catch { /* undecodable: keep the header verdict */ transparent = 1; border = 1; }
    if (transparent < 0.01) { alpha = false; warnings.push("Has an alpha channel but is fully opaque: treated as a photo."); }
    else if (border < 0.5) warnings.push("Partly transparent, but most of the border is opaque (" + Math.round(border * 100) + "% transparent): it may be a photo with holes, not a cut-out subject. Check the outline before tracing.");
  }
  const kind: Kind = alpha ? "bitmap" : "photo";
  if (!alpha) warnings.push("No transparency: treated as a photo/flat image. Biological 'A becomes B' morphs are not offered; use particles, shatter, tile flip or mask reveal, or provide a cut-out PNG.");
  else warnings.push("Has transparency: the alpha outline can be traced onto the vector track (bitmap route). Inner texture does not follow the outline yet.");
  if (width * height > 4096 * 4096) warnings.push("Very large image; it will be downsampled.");
  return { file, kind, guide: GUIDE[kind], details: { format, width, height, alpha, ...(format === "png" ? { transparentShare: Math.round(transparent * 1000) / 1000, transparentBorder: Math.round(border * 1000) / 1000 } : {}) }, warnings };
}

function inspectGltf(file: string, buf: Buffer): Report {
  let json: any;
  if (buf.readUInt32LE(0) === 0x46546c67) {
    const len = buf.readUInt32LE(12);
    json = JSON.parse(buf.subarray(20, 20 + len).toString("utf8"));
  } else json = JSON.parse(buf.toString("utf8"));
  const warnings: string[] = [];
  const acc = json.accessors ?? [], meshes = json.meshes ?? [], mats = json.materials ?? [];
  const r = (v: number) => Math.round(v * 1000) / 1000;
  const parts = (json.nodes ?? []).filter((n: any) => n.mesh !== undefined).map((n: any, i: number) => {
    const mesh = meshes[n.mesh], prims = mesh.primitives ?? [];
    const pos = acc[prims[0]?.attributes?.POSITION] ?? {};
    const t = n.translation ?? [0, 0, 0], s = n.scale ?? [1, 1, 1];
    const tris = prims.reduce((sum: number, p: any) => sum + Math.floor((p.indices !== undefined ? acc[p.indices].count : acc[p.attributes.POSITION].count) / 3), 0);
    const mat = mats[prims[0]?.material ?? -1];
    const c = mat?.pbrMetallicRoughness?.baseColorFactor;
    if (prims.length > 1) warnings.push("Part " + (n.name ?? i) + " has " + prims.length + " primitives: they are merged into one part.");
    if (mat?.pbrMetallicRoughness?.baseColorTexture) warnings.push("Part " + (n.name ?? i) + " is textured: points and dissolve use the base colour factor only, not the texture.");
    if (n.matrix || n.rotation) warnings.push("Part " + (n.name ?? i) + " has a node rotation/matrix: bounds below ignore it.");
    return {
      id: n.name ?? mesh.name ?? "part-" + i,
      triangles: tris,
      min: pos.min ? pos.min.map((v: number, k: number) => r(v * s[k] + t[k])) : null,
      max: pos.max ? pos.max.map((v: number, k: number) => r(v * s[k] + t[k])) : null,
      color: c ? "#" + c.slice(0, 3).map((v: number) => Math.round(Math.min(1, v) ** (1 / 2.2) * 255).toString(16).padStart(2, "0")).join("") : null,
    };
  });
  if (!parts.length) warnings.push("No nodes with meshes.");
  if (parts.some((p: any) => /^(node|mesh|object|part)[-_ ]?\d*$/i.test(p.id))) warnings.push("Some parts have generic names: rename them by meaning (nose, wing…) before mapping, or map by position.");
  if (json.skins?.length) warnings.push("Skinned model: the rest pose is used; skeletal animation is ignored.");
  if (json.animations?.length) warnings.push(json.animations.length + " animation(s) ignored.");
  return { file, kind: "model-3d", guide: GUIDE["model-3d"], details: { parts }, warnings };
}

const files = process.argv.slice(2);
if (!files.length) throw new Error("Usage: npx tsx tools/inspect.ts <file.svg|png|jpg|glb> …");
const reports = files.map(file => {
  const buf = readFileSync(file);
  if (extname(file).toLowerCase() === ".svg" || buf.subarray(0, 200).toString().includes("<svg")) return inspectSvg(basename(file), buf.toString("utf8"));
  const ext = extname(file).toLowerCase();
  if (ext === ".glb" || ext === ".gltf") return inspectGltf(basename(file), buf);
  return inspectBitmap(basename(file), buf);
});
// Layer sets: name_full.png + name_<part>.png (or name.png + name_<part>.png) are ONE subject with part layers.
const pngs = files.filter(f => /\.png$/i.test(f)).map(f => basename(f, ".png"));
const sets = new Map<string, string[]>();
for (const name of pngs) {
  const m = name.match(/^(.+?)_(?!full$)([a-z0-9]+(?:_[a-z0-9]+)*)$/i);
  if (!m) continue;
  const base = pngs.find(p => p === m[1] + "_full" || p === m[1]) ? m[1] : null;
  if (base) sets.set(base, [...(sets.get(base) ?? []), m[2]]);
}
const out = [...reports, ...[...sets].map(([base, parts]) => ({
  file: base + " (layer set)", kind: "bitmap-layers", guide: GUIDE.bitmap,
  details: { full: pngs.find(p => p === base + "_full" || p === base), parts },
  warnings: ["A layered subject: trace each layer (tools/trace-layers.ts) and map parts by meaning (references/part-mapping.md); warp each part's texture with a mesh (bitmap guide, 'Per-part morph' recipe, MM81). Layers that the full picture shows but no part file covers (fins painted into the body) can only grow out of their parent part."],
}))];
console.log(JSON.stringify(out.length === 1 ? out[0] : out, null, 2));
