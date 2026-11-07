// Record scenes as GIF previews (for READMEs and reviews; the deliverable is still the offline HTML).
//
//   node tools/gif.mjs <scene> [more…] [--width 640] [--fps 15] [--out docs/morph-master/gifs] [--from 0 --to <dur>]
//
// Frames come from the same seekable player as every other tool (the built dist/, rebuilt when stale);
// ffmpeg builds one palette per clip (palettegen → paletteuse), so flat colours stay flat.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { assertOffline, openPreview } from "./browser.mjs";

const { positionals, values } = parseArgs({ allowPositionals: true, options: {
  width: { type: "string", default: "640" }, fps: { type: "string", default: "15" },
  out: { type: "string", default: "docs/morph-master/gifs" }, from: { type: "string" }, to: { type: "string" },
} });
if (!positionals.length) throw new Error("Usage: node tools/gif.mjs <scene> [more…] [--width 640] [--fps 15] [--out dir]");
const width = Number(values.width), height = Math.round(width * 9 / 16), fps = Number(values.fps);
const ffmpeg = process.env.MORPH_FFMPEG || "ffmpeg";
mkdirSync(values.out, { recursive: true });
mkdirSync(".morph", { recursive: true });
const session = await openPreview();
const { page } = session;
try {
  const scenes = await page.evaluate(() => window.MORPH.list());
  for (const id of positionals) {
    const scene = scenes.find(s => s.id === id);
    if (!scene) throw new Error("No scene " + id);
    const t0 = Number(values.from ?? 0), t1 = Number(values.to ?? scene.duration);
    await page.evaluate(({ id, width, height }) => { window.MORPH.select(id); window.MORPH.resize(width, height); }, { id, width, height });
    const frames = Math.max(2, Math.round((t1 - t0) * fps));
    const file = join(values.out, id + ".gif"), partial = file + ".partial.gif";
    const child = spawn(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y",
      "-f", "image2pipe", "-framerate", String(fps), "-vcodec", "png", "-i", "pipe:0",
      "-filter_complex", "split[a][b];[a]palettegen=max_colors=96:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle",
      "-loop", "0", "-f", "gif", partial], { stdio: ["pipe", "ignore", "inherit"] });
    child.stdin.on("error", () => {});
    const done = once(child, "close");
    for (let i = 0; i < frames; i++) {
      const time = t0 + (i / fps);
      const png = await page.evaluate(s => { window.MORPH.renderAt(s); return window.MORPH.export().split(",")[1]; }, time);
      await new Promise((ok, bad) => child.stdin.write(Buffer.from(png, "base64"), e => e ? bad(e) : ok()));
    }
    child.stdin.end();
    const [status] = await done;
    if (status !== 0) { rmSync(partial, { force: true }); throw new Error("ffmpeg exited with " + status); }
    renameSync(partial, file);
    console.log(id.padEnd(26) + frames + " frames  " + (statSync(file).size / 1e6).toFixed(1) + " MB  " + file);
  }
  assertOffline(session);
} finally {
  await session.browser.close();
}
