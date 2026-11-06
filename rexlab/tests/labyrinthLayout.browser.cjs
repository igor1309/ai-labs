// Contract test: LABYRINTH's board, at every level and in each of its
// states, fits every window it plays in, in English with motion and in
// Russian without it: no page scroll, nothing off screen, no overlap, no
// cut label, every cell and control at least 48 wide. On an iPad mini each
// level has its own cell, 64, 52 and 48; upright, the turned maze fits
// whole at 72, 52 and 48; a phone's cells are 48, its view keeps the baby
// in sight and, while home is out of it, shows the parent marker.
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
  { name: "large desktop", width: 1920, height: 1080, size: "wide" },
  { name: "upright iPad mini", width: 744, height: 1133, size: "tall" },
  { name: "upright iPad", width: 768, height: 1024, size: "tall" },
  { name: "iPhone", width: 393, height: 852, size: "tall-narrow" },
  { name: "iPhone SE", width: 375, height: 667, size: "tall-narrow" },
  { name: "iPhone on its side", width: 852, height: 393, size: "wide-short" },
  { name: "iPhone SE on its side", width: 667, height: 375, size: "wide-short" }
];
const LEVELS = { hatchling: 64, explorer: 52, paleontologist: 48 };
const UPRIGHT = { hatchling: 72, explorer: 52, paleontologist: 48 };
const TURNED = { hatchling: [7, 9], explorer: [9, 15], paleontologist: [11, 17] };
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
          const at = `${state} at ${viewport.name}`;
          assert.equal(await page.evaluate(() => document.documentElement.dataset.size), viewport.size, `${at}: the window's size class`);
          await checkLayout(page, { root: ".labyrinth-board-screen", scroller: ".labyrinth-window", minimum: 48, viewport, state });
          const seen = await page.evaluate(() => {
            const box = element => element.getBoundingClientRect();
            const view = box(document.querySelector(".labyrinth-window"));
            const maze = document.querySelector(".labyrinth-maze");
            const style = getComputedStyle(maze);
            const baby = box(document.querySelector(".labyrinth-cell[aria-current=location]"));
            const goal = box(document.querySelector(".labyrinth-cell[data-goal]"));
            const inside = cell => cell.left >= view.left - 1 && cell.right <= view.right + 1 && cell.top >= view.top - 1 && cell.bottom <= view.bottom + 1;
            return {
              cell: box(document.querySelector(".labyrinth-cell")).width,
              grid: [style.gridTemplateColumns.split(" ").length, style.gridTemplateRows.split(" ").length],
              whole: box(maze).left >= 0 && box(maze).top >= 0 && box(maze).right <= innerWidth && box(maze).bottom <= innerHeight && box(maze).width <= view.width + 1 && box(maze).height <= view.height + 1,
              baby: inside(baby), goal: inside(goal), marker: !!document.querySelector(".labyrinth-marker")
            };
          });
          const upright = viewport.size === "tall" || viewport.size === "tall-narrow" && level === "hatchling";
          if (upright) assert.deepEqual(seen.grid, TURNED[level], `${at}: the maze is turned upright`);
          else assert(seen.grid[0] > seen.grid[1], `${at}: the maze keeps its rows`);
          if (viewport.name === "iPad mini") assert.equal(seen.cell, cell, `${state}: a ${level} cell on an iPad mini is ${cell}, not ${seen.cell}`);
          else if (viewport.name === "upright iPad mini") assert.equal(seen.cell, UPRIGHT[level], `${at}: a turned ${level} cell`);
          else if (viewport.size === "tall-narrow" || viewport.size === "wide-short") assert.equal(seen.cell, 48, `${at}: a phone's cell`);
          else assert(seen.cell >= 48, `${at}: a cell is ${seen.cell} wide`);
          if (viewport.size === "wide" || viewport.size === "tall") assert(seen.whole, `${at}: the maze shows whole`);
          assert(seen.baby, `${at}: the baby is in view`);
          if (options.state !== "home") assert.equal(seen.marker, !seen.goal, `${at}: the parent marker shows only while home is out of view`);
          checked++;
        }
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(`PASS layout: ${checked} labyrinth boards across ${VIEWPORTS.length} windows, English with motion and Russian without`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
})();
