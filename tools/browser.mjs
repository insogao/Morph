import { chromium } from "playwright-core";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { resolve, dirname, join, basename } from "node:path";
import { pathToFileURL } from "node:url";

export function browserPath() {
  if (process.env.MORPH_CHROMIUM) return process.env.MORPH_CHROMIUM;
  const installed = chromium.executablePath();
  if (existsSync(installed)) return installed;
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ||
    (process.platform === "win32" ? join(process.env.LOCALAPPDATA ?? homedir(), "ms-playwright")
      : process.platform === "darwin" ? join(homedir(), "Library", "Caches", "ms-playwright")
      : join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "ms-playwright"));
  if (existsSync(cache)) {
    const folders = readdirSync(cache).filter(name => /^chromium(?:_headless_shell)?-\d+$/.test(name));
    folders.sort((a, b) => Number(b.split("-").at(-1)) - Number(a.split("-").at(-1)));
    for (const folder of folders) {
      const candidates = readdirSync(join(cache, folder), { recursive: true });
      const exe = candidates.find(file => /^(chrome-headless-shell|headless_shell|chrome|Chromium)(\.exe)?$/.test(basename(file)));
      if (exe) return join(cache, folder, exe);
    }
  }
  throw new Error("Chromium missing. Run npx playwright-core install chromium or set MORPH_CHROMIUM.");
}

export function buildOffline(input = "dist/index.html", sceneId, assetRoot) {
  // Asset URLs are absolute ("/assets/…") from the build root; for pages in sub-folders pass assetRoot = "dist".
  const root = assetRoot ? resolve(assetRoot) : dirname(resolve(input));
  let html = readFileSync(input, "utf8");
  const source = file => readFileSync(join(root, file.replace(/^\//, "")), "utf8");
  html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g,
    (_, file) => "<script type=\"module\">" + source(file).replace(/<\/script/gi, "<\\/script") + "</script>");
  html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
    (_, file) => "<style>" + source(file) + "</style>");
  if (/<script[^>]+src=|<link[^>]+rel="(?:modulepreload|stylesheet)"/i.test(html)) {
    throw new Error("Offline build still references a script or stylesheet (a split chunk or modulepreload). If a second entry was added to vite.config.ts, remove it: pages are exported on their own with tools/export-page.mjs.");
  }
  if (sceneId) {
    if (!/^[a-z0-9-]+$/.test(sceneId)) throw new Error("Invalid scene id.");
    html = html.replace("<body>", '<body data-default-scene="' + sceneId + '">');
  }
  if (existsSync("THIRD-PARTY-NOTICES.txt")) {
    const notices = readFileSync("THIRD-PARTY-NOTICES.txt", "utf8").replace(/<\/script/gi, "<\\/script");
    html = html.replace("</body>", '<script type="text/plain" id="third-party-notices">' + notices + '</script></body>');
  }
  return html;
}

/** Newest modification time under the given folders (source of the built player). */
function newest(dirs) {
  let t = 0;
  const walk = dir => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".") || e.name === "eval.json") continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p); else t = Math.max(t, statSync(p).mtimeMs);
    }
  };
  dirs.forEach(walk);
  return t;
}

/**
 * The render tools play the BUILT player in dist/. Rebuild when any source is newer, so frames,
 * pops and seek checks never show a stale scene. A failing build (type error) stops here, loudly.
 */
export function ensureBuilt() {
  const built = existsSync("dist/index.html") ? statSync("dist/index.html").mtimeMs : 0;
  if (newest(["app", "lab", "demos", "examples", "packages", "fixtures"]) <= built) return;
  console.error("[morph] sources changed since the last build: running npm run build …");
  try {
    execSync("npm run build", { stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    throw new Error("npm run build failed — fix it before rendering:\n" + (error.stderr?.toString() ?? "") + (error.stdout?.toString() ?? ""));
  }
}

export async function openPreview(input = ".morph/preview.html") {
  ensureBuilt();
  writeFileSync(input, buildOffline(), "utf8");
  const browser = await chromium.launch({ executablePath: browserPath(), args: ["--enable-unsafe-swiftshader"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const errors = [];
    const requests = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => {
      if (!["file:", "data:", "blob:"].includes(new URL(request.url()).protocol)) requests.push(request.url());
    });
    await page.goto(pathToFileURL(resolve(input)).href);
    await page.waitForFunction(() => Boolean(window.MORPH));
    return { browser, page, errors, requests };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

export function assertOffline({ errors, requests }) {
  if (errors.length || requests.length) throw new Error([...errors, ...requests].join("\n"));
}
