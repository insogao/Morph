import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { assertOffline, buildOffline, openPreview } from "./browser.mjs";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { width: { type: "string", default: "1920" }, fps: { type: "string", default: "30" },
    out: { type: "string", default: "gallery" }, "html-only": { type: "boolean", default: false } },
});
const width = Number(values.width);
const height = Math.round(width * 9 / 32) * 2;
const fps = Number(values.fps);
if (!Number.isInteger(width) || width < 320 || width > 3840 || width % 2 ||
    !Number.isInteger(fps) || fps < 1 || fps > 120 || positionals.length > 1) {
  throw new Error("Usage: npm run export -- [scene|all] [--width 1920] [--fps 30] [--out gallery] [--html-only]");
}
mkdirSync(".morph", { recursive: true });
mkdirSync(values.out, { recursive: true });
const session = await openPreview();
const { page } = session;
const ffmpeg = process.env.MORPH_FFMPEG || "ffmpeg";
const ffprobe = process.env.MORPH_FFPROBE || "ffprobe";
try {
  const scenes = await page.evaluate(() => window.MORPH.list());
  const selected = !positionals[0] || positionals[0] === "all" ? scenes : scenes.filter(scene => scene.id === positionals[0]);
  if (!selected.length) throw new Error("No matching scene. Available: " + scenes.map(({ id }) => id).join(", "));
  for (const { id, duration } of selected) {
    if (values["html-only"]) {
      // Offline player only (no video): one self-contained file that opens on this scene.
      const file = join(values.out, id + ".html");
      writeFileSync(file, buildOffline("dist/index.html", id), "utf8");
      console.log(id + "  " + file);
      continue;
    }
    await page.evaluate(({ id, width, height }) => {
      window.MORPH.select(id);
      window.MORPH.resize(width, height);
    }, { id, width, height });
    const frames = Math.max(2, Math.round(duration * fps));
    const file = join(values.out, id + ".mp4");
    const partial = join(values.out, id + ".partial.mp4");
    const child = spawn(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y",
      "-f", "image2pipe", "-framerate", String(fps), "-vcodec", "png", "-i", "pipe:0",
      "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "17", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart", partial], { stdio: ["pipe", "ignore", "inherit"] });
    child.stdin.on("error", () => {});
    const done = once(child, "close");
    done.catch(() => {});
    try {
      for (let index = 0; index < frames; index++) {
        if (child.exitCode !== null) throw new Error("FFmpeg stopped during " + id);
        const time = (index / (frames - 1)) * duration;
        const pixels = await page.evaluate(seconds => {
          window.MORPH.renderAt(seconds);
          return window.MORPH.export().split(",")[1];
        }, time);
        await new Promise((resolve, reject) => child.stdin.write(Buffer.from(pixels, "base64"), error => error ? reject(error) : resolve()));
      }
      child.stdin.end();
      const [status] = await done;
      if (status !== 0) throw new Error("FFmpeg exited with " + status);
      assertOffline(session);
      const check = JSON.parse(execFileSync(ffprobe, ["-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=codec_name,width,height,nb_frames", "-of", "json", partial], { encoding: "utf8" }));
      const [stream] = check.streams;
      if (stream.width !== width || stream.height !== height || Number(stream.nb_frames) !== frames) {
        throw new Error("Unexpected encoded dimensions or frame count for " + id);
      }
      renameSync(partial, file);
      writeFileSync(join(values.out, id + ".html"), buildOffline("dist/index.html", id), "utf8");
      console.log(id + "  " + width + "×" + height + "  " + frames + " frames  " + file);
    } catch (error) {
      child.stdin.destroy();
      child.kill();
      await done.catch(() => {});
      rmSync(partial, { force: true });
      throw error;
    }
  }
} finally {
  await session.browser.close();
}
