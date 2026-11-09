// Visual-quality check: render a scene, measure every frame against how A and B look, and flag the failures users
// notice that the technical checks don't: blobs, vanish-and-reappear, muddy colours, long flat fills.
//
//   npx tsx tools/qc.ts <scene> [more…] [--fps 12] [--width 320] [--json]
//
// Each in-between frame is compared with the nearest HOLD before and after it (sequences are judged step by step).
// Blobs are NOT detected automatically (no pixel metric separated them from good morphs): render densely and look.
//
// Each flag is a time span to render densely (tools/frames.mjs) and judge — a signal, not a verdict.
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { PNG } from "pngjs";
import { assertOffline, openPreview } from "./browser.mjs";
import { frameStats, qualityFlags, type FrameStats } from "../packages/morph-engine/src/vector/quality";

const { positionals, values } = parseArgs({ allowPositionals: true, options: { fps: { type: "string", default: "12" }, width: { type: "string", default: "320" }, json: { type: "boolean", default: false }, } });
if (!positionals.length) throw new Error("Usage: npx tsx tools/qc.ts <scene> [more…] [--fps 12] [--width 320] [--json]");
const fps = Number(values.fps), width = Number(values.width), height = Math.round(width * 9 / 16);
mkdirSync(".morph", { recursive: true });
const session = await openPreview();
const out: Record<string, unknown> = {};
try {
  const { page } = session;
  const scenes = await page.evaluate(() => window.MORPH.list());
  for (const id of positionals) {
    const scene = scenes.find(s => s.id === id);
    if (!scene) throw new Error("No scene " + id);
    await page.evaluate(({ id, width, height }) => { window.MORPH.select(id); window.MORPH.resize(width, height); }, { id, width, height });
    const times: number[] = [], stats: FrameStats[] = [];
    for (let t = 0; t <= scene.duration + 1e-9; t += 1 / fps) {
      const b64 = await page.evaluate(s => { window.MORPH.renderAt(s); return window.MORPH.export().split(",")[1]; }, t);
      const png = PNG.sync.read(Buffer.from(b64, "base64"));
      times.push(t); stats.push(frameStats(png.data, png.width, png.height));
    }
    const r = qualityFlags(times, stats);
    out[id] = r;
    if (!values.json) {
      console.log(id + "   holds: " + (r.holds.map(([a, b]) => a.toFixed(1) + "–" + b.toFixed(1)).join(", ") || "none (continuous motion)"));
      if (!r.flags.length) console.log("  no quality flags");
      for (const f of r.flags) console.log(`  ${f.kind.padEnd(9)} ${f.from.toFixed(2)}–${f.to.toFixed(2)} s  (worst ${f.worst})  ${f.note}`);
    }
    writeFileSync(".morph/" + id + "-qc.json", JSON.stringify({ times, stats: stats.map(s => ({ ...s, mask: undefined })), ...r }));
  }
  assertOffline(session);
} finally {
  await session.browser.close();
}
if (values.json) console.log(JSON.stringify(out, null, 2));
