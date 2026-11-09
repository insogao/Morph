import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertOffline, openPreview } from "./browser.mjs";

const only = process.argv[2];
const ratios = [0, .10, .25, .5, .75, .90, 1];
mkdirSync(".morph", { recursive: true });
const session = await openPreview();
const { page } = session;
const checked = [];
const digest = value => createHash("sha256").update(value).digest("hex");
try {
  const scenes = await page.evaluate(() => window.MORPH.list());
  const selected = only ? scenes.filter(scene => scene.id === only) : scenes;
  if (!selected.length) throw new Error("No scenes selected.");
  for (const { id, duration } of selected) {
    const frames = await page.evaluate(({ id, duration, ratios }) => {
      window.MORPH.select(id);
      const grab = fraction => {
        window.MORPH.seek(duration * fraction);
        return window.MORPH.export();
      };
      return { forward: ratios.map(grab), reverse: [...ratios].reverse().map(grab).reverse() };
    }, { id, duration, ratios });
    if (!frames.forward.every((value, i) => digest(value) === digest(frames.reverse[i]))) {
      throw new Error(id + " changes when seeking backward.");
    }
    // A scene that renders the same picture almost everywhere is broken (frozen); two equal samples at the end are
    // just a deliberate still ending (a title or a line held for reading) and are only reported.
    const distinct = new Set(frames.forward).size;
    if (distinct < 3) throw new Error(id + " renders the same frame at almost every sampled time (frozen?).");
    if (distinct !== ratios.length) console.log(id + ": " + (ratios.length - distinct) + " sampled frame(s) repeat — a still hold (fine if intended).");
    await page.setContent('<body style="margin:0;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;background:#151816;color:#eee;font:13px sans-serif">' +
      frames.forward.map((url, i) => '<figure style="margin:0"><img style="width:100%;display:block" src="' + url + '"><figcaption style="padding:4px 8px">' +
        Math.round(ratios[i] * 100) + '%  ·  ' + (ratios[i] * duration).toFixed(2) + 's</figcaption></figure>').join("") + "</body>");
    await page.evaluate(() => Promise.all([...document.images].map(img => img.decode())));
    const sheet = join(".morph", id + "-contact.jpg");
    await page.screenshot({ path: sheet, fullPage: true, quality: 88 });
    await page.reload();
    await page.waitForFunction(() => Boolean(window.MORPH));
    checked.push({ id, duration, deterministicFrames: ratios.length, contact: sheet });
    console.log("PASS  " + id + "  " + sheet);
  }
  assertOffline(session);
  writeFileSync(".morph/visual-report.json", JSON.stringify(checked, null, 2) + "\n");
} finally {
  await session.browser.close();
}
