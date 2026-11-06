import { chromium } from "playwright-core";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, dirname, join, basename } from "node:path";
import { pathToFileURL } from "node:url";

function browserPath() {
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

export function buildOffline(input = "dist/index.html", sceneId) {
  const root = dirname(resolve(input));
  let html = readFileSync(input, "utf8");
  const source = file => readFileSync(join(root, file.replace(/^\//, "")), "utf8");
  html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g,
    (_, file) => "<script type=\"module\">" + source(file).replace(/<\/script/gi, "<\\/script") + "</script>");
  html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
    (_, file) => "<style>" + source(file) + "</style>");
  if (/<script[^>]+src=|<link[^>]+rel="(?:modulepreload|stylesheet)"/i.test(html)) {
    throw new Error("Offline build still references a script or stylesheet.");
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

export async function openPreview(input = ".morph/preview.html") {
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
