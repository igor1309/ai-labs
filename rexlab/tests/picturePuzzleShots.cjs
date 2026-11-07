// Screenshots of PICTURE PUZZLE's screens, for review against the PUZZLE frames of
// design/dig-site.pen: node tests/picturePuzzleShots.cjs <directory> [width height]
const { mkdirSync } = require("node:fs");
const { resolve, join } = require("node:path");
const { chromium } = require("playwright");

const [out = "picture-puzzle-shots", width = "1133", height = "744"] = process.argv.slice(2);
const SHOTS = [
  ["choice-first", { level: "hatchling" }],
  ["choice-returning", { level: "explorer", stars: 2 }],
  ["choice-all", { level: "paleontologist", stars: 3 }],
  ["choice-loading", { level: "explorer", stars: 2, loading: true }],
  ["choice-returning-dark", { level: "explorer", stars: 2, theme: "dark" }],
  ["choice-returning-ru", { level: "explorer", stars: 2, language: "ru" }],
  ["board-start", { board: true }],
  ["board-hatchling", { board: true, fitted: 5 }],
  ["board-explorer", { board: true, level: "explorer", id: 1, fitted: 9 }],
  ["board-paleo", { board: true, level: "paleontologist", id: 2, fitted: 20 }],
  ["board-loading", { board: true, loading: true }],
  ["board-explorer-dark", { board: true, level: "explorer", id: 1, fitted: 9, theme: "dark" }],
  ["board-explorer-ru", { board: true, level: "explorer", id: 1, fitted: 9, language: "ru" }]
];

(async () => {
  let browser;
  try {
    mkdirSync(out, { recursive: true });
    const { build } = await import("vite");
    const react = (await import("@vitejs/plugin-react")).default;
    const bundle = await build({ root: resolve(__dirname, ".."), configFile: false, logLevel: "error", plugins: [react()],
      build: { write: false, rolldownOptions: { preserveEntrySignatures: "strict", input: resolve(__dirname, "picturePuzzleHarness.tsx"), output: { entryFileNames: "harness.js" } } } });
    const files = new Map(bundle.output.map(file => [file.fileName, file.type === "chunk" ? file.code : file.source]));
    const css = [...files.keys()].filter(name => name.endsWith(".css"));
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) }, reducedMotion: "reduce" });
    page.on("pageerror", error => { throw error; });
    await page.route("http://shots.test/**", route => {
      const path = new URL(route.request().url()).pathname.slice(1);
      if (!path) return route.fulfill({ contentType: "text/html", body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">${css.map(name => `<link rel="stylesheet" href="/${name}">`).join("")}<div id="root"></div>` });
      const type = path.endsWith(".css") ? "text/css" : path.endsWith(".woff2") ? "font/woff2" : path.endsWith(".webp") ? "image/webp" : "text/javascript";
      return files.has(path) ? route.fulfill({ contentType: type, body: files.get(path) }) : route.fulfill({ status: 404 });
    });
    await page.goto("http://shots.test/");
    for (const [name, options] of SHOTS.filter(([name]) => !process.env.ONLY || name.startsWith(process.env.ONLY))) {
      await page.evaluate(async options => { { const harness = await import("/harness.js"); options.board ? harness.mountBoard(options) : harness.mountChoice(options); } await document.fonts.ready; }, options);
      if (!options.loading) await page.waitForFunction(() => [...document.images].every(image => image.complete));
      await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))));
      await page.screenshot({ path: join(out, `${name}.png`) });
    }
    console.log(`${SHOTS.length} screenshots in ${out}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
})();
