// Find temporal pops: frames that jump, flash or teleport compared with their neighbours.
//
//   node tools/pops.mjs <scene> [--from 0] [--to <duration>] [--fps 60] [--top 8] [--out .morph/<scene>-pops.jpg]
//
// Renders the scene at `fps`, measures the mean absolute pixel change between consecutive
// frames, and reports frames whose change is far above the local median (a spike). Smooth motion
// changes a little every frame; a bug-like pop changes a lot in one frame. The worst spikes are
// saved as before / after pairs so you can look at them. Changes below 0.5 (one colour quantization
// step across the frame) are ignored; HUD label switches can still show up and are not geometry.
import { mkdirSync } from "node:fs";
import { parseArgs } from "node:util";
import { assertOffline, openPreview } from "./browser.mjs";

const { positionals, values } = parseArgs({ allowPositionals: true, options: {
  from: { type: "string" }, to: { type: "string" }, fps: { type: "string", default: "60" }, top: { type: "string", default: "8" },
  out: { type: "string" }, width: { type: "string", default: "640" },
} });
const [id] = positionals;
if (!id) throw new Error("Usage: node tools/pops.mjs <scene> [--from s] [--to s] [--fps 60]");
mkdirSync(".morph", { recursive: true });
const session = await openPreview();
const { page } = session;
try {
  const width = Number(values.width), height = Math.round(width * 9 / 16), fps = Number(values.fps);
  const result = await page.evaluate(async ({ id, width, height, fps, from, to }) => {
    window.MORPH.select(id);
    window.MORPH.resize(width, height);
    const scene = window.MORPH.list().find(s => s.id === id);
    const t0 = from ?? 0, t1 = to ?? scene.duration;
    const canvas = document.querySelector("#stage");
    const probe = document.createElement("canvas");
    probe.width = 160; probe.height = 90;
    const pctx = probe.getContext("2d", { willReadFrequently: true });
    const grab = t => { window.MORPH.seek(t); pctx.drawImage(canvas, 0, 0, 160, 90); return pctx.getImageData(0, 0, 160, 90).data; };
    const diffs = [];
    let prev = grab(t0);
    for (let t = t0 + 1 / fps; t <= t1 + 1e-9; t += 1 / fps) {
      const cur = grab(t);
      let s = 0;
      for (let i = 0; i < cur.length; i += 4) s += Math.abs(cur[i] - prev[i]) + Math.abs(cur[i + 1] - prev[i + 1]) + Math.abs(cur[i + 2] - prev[i + 2]);
      diffs.push({ t, d: s / (160 * 90 * 3) });
      prev = cur;
    }
    return diffs;
  }, { id, width, height, fps, from: values.from ? Number(values.from) : undefined, to: values.to ? Number(values.to) : undefined });
  // Spike score: change relative to the median of the surrounding ±6 frames.
  const scored = result.map((r, i) => {
    const near = result.slice(Math.max(0, i - 6), i + 7).filter((_, k) => k !== Math.min(6, i)).map(x => x.d).sort((a, b) => a - b);
    const median = near[Math.floor(near.length / 2)] ?? 0;
    return { ...r, median, ratio: r.d / Math.max(0.05, median) };
  });
  const spikes = [...scored].filter(s => s.ratio > 2.5 && s.d > 0.5).sort((a, b) => b.ratio - a.ratio).slice(0, Number(values.top));
  const mean = scored.reduce((s, x) => s + x.d, 0) / scored.length;
  console.log(id + ": " + scored.length + " steps at " + values.fps + " fps, mean change " + mean.toFixed(3));
  if (!spikes.length) console.log("no pops (no frame changes more than 2.5× its neighbours)");
  for (const s of spikes) console.log("  pop at " + s.t.toFixed(3) + " s   change " + s.d.toFixed(2) + "   ×" + s.ratio.toFixed(1) + " of neighbours");
  if (spikes.length) {
    const pairs = spikes.slice(0, 4).flatMap(s => [s.t - 1 / Number(values.fps), s.t]);
    const urls = await page.evaluate(({ id, times }) => { window.MORPH.select(id); window.MORPH.resize(960, 540); return times.map(t => { window.MORPH.seek(t); return window.MORPH.export(); }); }, { id, times: pairs });
    await page.setContent('<body style="margin:0;display:grid;grid-template-columns:repeat(2,1fr);gap:4px;background:#111;color:#eee;font:14px sans-serif">' +
      urls.map((u, i) => '<figure style="margin:0"><img style="width:100%;display:block" src="' + u + '"><figcaption>' + pairs[i].toFixed(3) + "s" + (i % 2 ? " (after)" : " (before)") + "</figcaption></figure>").join("") + "</body>");
    await page.evaluate(() => Promise.all([...document.images].map(img => img.decode())));
    const out = values.out ?? ".morph/" + id + "-pops.jpg";
    await page.screenshot({ path: out, fullPage: true, quality: 88 });
    console.log(out);
  }
  assertOffline(session);
} finally {
  await session.browser.close();
}
