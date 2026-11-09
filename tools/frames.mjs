// Render a strip of specific times for close inspection: node tools/frames.mjs <scene> 1.5 2 2.5 ... [--cols 4] [--out file]
//   --crop x,y,w,h   zoom into a region (1280 × 720 design units), rendered at --width resolution for the full frame
import { mkdirSync } from "node:fs";
import { parseArgs } from "node:util";
import { assertOffline, openPreview } from "./browser.mjs";

const { positionals, values } = parseArgs({ allowPositionals: true, options: { cols: { type: "string", default: "4" }, out: { type: "string" }, width: { type: "string", default: "1280" }, crop: { type: "string" } } });
const [id, ...times] = positionals;
if (!id || !times.length) throw new Error("Usage: node tools/frames.mjs <scene> <t1> <t2> ...");
mkdirSync(".morph", { recursive: true });
const session = await openPreview();
const { page } = session;
try {
  const width = Number(values.width), height = Math.round(width * 9 / 16);
  const urls = await page.evaluate(({ id, times, width, height }) => {
    window.MORPH.select(id);
    window.MORPH.resize(width, height);
    return times.map(t => { window.MORPH.seek(Number(t)); return window.MORPH.export(); });
  }, { id, times, width, height });
  if (values.crop) {
    const [cx, cy, cw, ch] = values.crop.split(",").map(Number), k = width / 1280;
    if (![cx, cy, cw, ch].every(Number.isFinite) || cw <= 0 || ch <= 0) throw new Error("--crop x,y,w,h in design units");
    for (let i = 0; i < urls.length; i++) urls[i] = await page.evaluate(async ({ url, cx, cy, cw, ch, k }) => {
      const img = new Image(); img.src = url; await img.decode();
      const c = document.createElement("canvas"); c.width = Math.round(cw * k); c.height = Math.round(ch * k);
      c.getContext("2d").drawImage(img, cx * k, cy * k, cw * k, ch * k, 0, 0, c.width, c.height);
      return c.toDataURL("image/png");
    }, { url: urls[i], cx, cy, cw, ch, k });
  }
  await page.setContent('<body style="margin:0;display:grid;grid-template-columns:repeat(' + values.cols + ',1fr);gap:4px;background:#111;color:#eee;font:14px sans-serif">' +
    urls.map((u, i) => '<figure style="margin:0"><img style="width:100%;display:block" src="' + u + '"><figcaption style="padding:2px 6px">' + times[i] + 's</figcaption></figure>').join("") + "</body>");
  await page.evaluate(() => Promise.all([...document.images].map(img => img.decode())));
  const out = values.out ?? ".morph/" + id + "-frames.jpg";
  await page.screenshot({ path: out, fullPage: true, quality: 90 });
  assertOffline(session);
  console.log(out);
} finally {
  await session.browser.close();
}
