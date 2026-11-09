// Check an exported page: it opens from file:// with no errors and no network, and its story renders at chosen
// times (the page exposes window.<NAME>.at(t)). Writes a contact strip.
//
//   node tools/page-check.mjs gallery/page-tempo.html TEMPO 0.5 3 6 9 12 [--width 1280 --height 720]
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";
import { browserPath } from "./browser.mjs";

const { positionals, values } = parseArgs({ allowPositionals: true, options: { width: { type: "string", default: "1280" }, height: { type: "string", default: "720" }, out: { type: "string" } } });
const [file, api, ...times] = positionals;
if (!file || !api) throw new Error("Usage: node tools/page-check.mjs <page.html> <API> t1 t2 …");
const browser = await chromium.launch({ executablePath: browserPath(), args: ["--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: Number(values.width), height: Number(values.height) }, deviceScaleFactor: 1 });
  const errors = [], requests = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("request", r => { if (!["file:", "data:", "blob:"].includes(new URL(r.url()).protocol)) requests.push(r.url()); });
  await page.goto(pathToFileURL(resolve(file)).href);
  await page.waitForFunction(name => Boolean(window[name]), api);
  const shots = [];
  for (const t of times.map(Number)) {
    await page.evaluate(({ name, t }) => window[name].at(t), { name: api, t });
    shots.push((await page.screenshot({ type: "jpeg", quality: 80 })).toString("base64"));
  }
  await page.setContent('<body style="margin:0;display:grid;grid-template-columns:repeat(3,1fr);gap:4px;background:#111;color:#eee;font:14px sans-serif">' +
    shots.map((s, i) => '<figure style="margin:0"><img style="width:100%;display:block" src="data:image/jpeg;base64,' + s + '"><figcaption>' + times[i] + 's</figcaption></figure>').join("") + "</body>");
  await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
  const out = values.out ?? ".morph/page-check.jpg";
  await page.screenshot({ path: out, fullPage: true, quality: 85 });
  console.log(JSON.stringify({ errors, requests, out }));
  if (errors.length || requests.length) process.exitCode = 1;
} finally { await browser.close(); }
