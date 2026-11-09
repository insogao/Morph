// Export a page built on the engine (pages/<name>/) as ONE offline HTML file: gallery/page-<name>.html.
//
//   node tools/export-page.mjs tempo
//
// The page is built on its own (one entry, no code splitting), so the single inlined script carries everything.
import { mkdirSync, writeFileSync } from "node:fs";
import { build } from "vite";
import { buildOffline } from "./browser.mjs";

const name = process.argv[2];
if (!name || !/^[a-z0-9-]+$/.test(name)) throw new Error("Usage: node tools/export-page.mjs <page name>   (pages/<name>/index.html)");
const outDir = ".morph/page-" + name;
await build({
  logLevel: "warn",
  build: {
    outDir, emptyOutDir: true, target: "es2022", modulePreload: false,
    // Everything the page imports (fonts, audio) becomes a data: URL, so the one HTML file is the whole deliverable.
    assetsInlineLimit: 50e6,
    rollupOptions: { input: "pages/" + name + "/index.html", output: { inlineDynamicImports: true } },
  },
});
mkdirSync("gallery", { recursive: true });
const file = "gallery/page-" + name + ".html";
writeFileSync(file, buildOffline(outDir + "/pages/" + name + "/index.html", undefined, outDir), "utf8");
console.log(file);
