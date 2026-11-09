// Record a page built on the engine as an MP4 (H.264), optionally with a soundtrack laid out on the same timeline.
// Frames come from the page's own seek API (window.<NAME>.at(t)), so every frame is exact, not a screen capture.
//
//   node tools/page-video.mjs gallery/page-hum.html HUM --width 1080 --height 1920 [--fps 30] [--from 0 --to <dur>]
//        [--audio track.wav] [--out docs/morph-master/video/hum-9x16.mp4]
//
// The audio file starts at --from on the page's timeline. Videos with someone else's music stay local: don't publish them.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";
import { browserPath } from "./browser.mjs";

const { positionals, values } = parseArgs({ allowPositionals: true, options: {
  width: { type: "string", default: "1280" }, height: { type: "string", default: "720" }, fps: { type: "string", default: "30" },
  from: { type: "string", default: "0" }, to: { type: "string" }, audio: { type: "string" }, out: { type: "string" },
} });
const [file, api] = positionals;
if (!file || !api) throw new Error("Usage: node tools/page-video.mjs <page.html> <API> --width W --height H [--audio file] [--out file.mp4]");
const W = Number(values.width), H = Number(values.height), fps = Number(values.fps), from = Number(values.from);
const out = values.out ?? ".morph/" + api.toLowerCase() + "-" + W + "x" + H + ".mp4";
mkdirSync(dirname(out), { recursive: true });
const browser = await chromium.launch({ executablePath: browserPath(), args: ["--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(pathToFileURL(resolve(file)).href);
  await page.waitForFunction(name => Boolean(window[name]), api);
  const to = Number(values.to ?? await page.evaluate(name => window[name].duration, api));
  const frames = Math.round((to - from) * fps), partial = out + ".partial.mp4";
  const audioIn = values.audio ? ["-i", values.audio] : [];
  const audioOut = values.audio ? ["-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "192k", "-shortest"] : [];
  const ff = spawn(process.env.MORPH_FFMPEG || "ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
    "-f", "image2pipe", "-framerate", String(fps), "-vcodec", "png", "-i", "pipe:0", ...audioIn,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", "-preset", "slow", "-movflags", "+faststart", ...audioOut, partial],
    { stdio: ["pipe", "ignore", "inherit"] });
  ff.stdin.on("error", () => {});
  const done = once(ff, "close");
  for (let i = 0; i < frames; i++) {
    await page.evaluate(({ name, t }) => window[name].at(t), { name: api, t: from + i / fps });
    const png = await page.screenshot({ type: "png" });
    await new Promise((ok, bad) => ff.stdin.write(png, e => e ? bad(e) : ok()));
  }
  ff.stdin.end();
  const [status] = await done;
  if (status !== 0) { rmSync(partial, { force: true }); throw new Error("ffmpeg exited with " + status); }
  renameSync(partial, out);
  console.log(JSON.stringify({ out, frames, mb: +(statSync(out).size / 1e6).toFixed(2), errors }));
  if (errors.length) process.exitCode = 1;
} finally { await browser.close(); }
