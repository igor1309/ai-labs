// Contract test: LABYRINTH's board, at every level and in each of its
// states, fits the landscape windows it plays in, in English with motion
// and in Russian without it: no page scroll, nothing off screen, no
// overlap, no cut label, every cell and control at least 48 wide. On an
// iPad mini each level has its own cell: 64, 52 and 48.
const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { chromium } = require("playwright");
const { checkLayout } = require("./coloringLayout.cjs");

const VIEWPORTS = [
  { name: "iPad mini", width: 1133, height: 744, size: "wide" },
  { name: "iPad", width: 1024, height: 768, size: "wide" },
  { name: "shortest window", width: 1024, height: 670, size: "wide" },
  { name: "iPad Pro", width: 1376, height: 1032, size: "wide" },
  { name: "desktop", width: 1440, height: 900, size: "wide" },
  { name: "large desktop", width: 1920, height: 1080, size: "wide" }
];
const LEVELS = { hatchling: 64, explorer: 52, paleontologist: 48 };
const STATES = [{ state: "start" }, { state: "hint" }, { state: "step" }, { state: "home" }, { state: "start", loading: true }];

(async () => {
  let browser;
  try {
    const { build } = await import("vite");
    const react = (await import("@vitejs/plugin-react")).default;
    const bundle = await build({ root: resolve(__dirname, ".."), configFile: false, logLevel: "error", plugins: [react()],
      build: { write: false, rolldownOptions: { preserveEntrySignatures: "strict", input: resolve(__dirname, "labyrinthHarness.tsx"), output: { entryFileNames: "harness.js" } } } });
    const files = new Map(bundle.output.map(file => [file.fileName, file.type === "chunk" ? file.code : file.source]));
    const css = [...files.keys()].filter(name => name.endsWith(".css"));
    browser = await chromium.launch({ headless: true });
    let checked = 0;
    for (const [language, motion] of [["en", "no-preference"], ["ru", "reduce"]]) {
      const page = await browser.newPage({ viewport: { width: 1133, height: 744 }, reducedMotion: motion });
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      await page.route("http://layout.test/**", route => {
        const path = new URL(route.request().url()).pathname.slice(1);
        if (!path) return route.fulfill({ contentType: "text/html", body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Labyrinth layout contract</title>${css.map(name => `<link rel="stylesheet" href="/${name}">`).join("")}<div id="root"></div>` });
        assert(files.has(path), `Missing browser module ${path}`);
        const type = path.endsWith(".css") ? "text/css" : path.endsWith(".woff2") ? "font/woff2" : path.endsWith(".webp") ? "image/webp" : "text/javascript";
        return route.fulfill({ contentType: type, body: files.get(path) });
      });
      await page.goto("http://layout.test/");
      const settle = () => page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
      });
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        for (const [level, cell] of Object.entries(LEVELS)) for (const options of STATES) {
          const state = `${language} ${level} ${options.state}${options.loading ? " loading" : ""}`;
          await page.evaluate(async options => (await import("/harness.js")).mount(options), { language, level, ...options });
          if (!options.loading) await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
          await settle();
          await checkLayout(page, { root: ".labyrinth-board-screen", minimum: 48, viewport, state });
          const side = await page.locator(".labyrinth-cell").first().evaluate(element => element.getBoundingClientRect().width);
          if (viewport.name === "iPad mini") assert.equal(side, cell, `${state}: a ${level} cell on an iPad mini is ${cell}, not ${side}`);
          else assert(side >= 48, `${state} at ${viewport.name}: a cell is ${side} wide`);
          checked++;
        }
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(`PASS layout: ${checked} labyrinth boards across ${VIEWPORTS.length} sizes, English with motion and Russian without`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
})();
