// Contract test: BONES' choice, puzzle and guess. The choice, on a first visit, on a return with stars and
// the mystery tile, with every star and with its pictures still loading,
// fits every window it plays in at every level, in English with motion and
// in Russian without it: no page scroll, nothing off screen, no overlap, no
// cut label, every control at least 48 wide; without motion, every animation
// is a short fade.
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
const LEVELS = ["hatchling", "explorer", "paleontologist"];
const CHOICES = [{ stars: 0 }, { stars: 2 }, { stars: 5 }, { stars: 2, loading: true }];
const GUESSES = [{}, { wrong: true }, { wrong: true, loading: true }];
const PUZZLES = [{}, { fitted: 2 }, { fitted: 2, step: "glow" }, { fitted: 2, step: "ghost" }, { fitted: 2, told: true }, { fitted: 99 }, { loading: true }];
// The finished skeleton's stomp and snap and a wrong guess's wobble run on, but every keyframe moves by
// --motion-amount, which reduced motion makes 0: they keep their time, still.
const STILLED = ["stomp", "jaw-snap", "wobble"];
const stillEnough = page => page.evaluate(() => document.getAnimations()
  .filter(a => a.effect?.getComputedTiming().iterations !== Infinity)
  .map(a => ({ name: a.animationName ?? "", duration: a.effect.getComputedTiming().duration }))
  .filter(a => a.duration > 200))
  .then(moving => moving.filter(a => !STILLED.includes(a.name)));

(async () => {
  let browser;
  try {
    const { build } = await import("vite");
    const react = (await import("@vitejs/plugin-react")).default;
    const bundle = await build({ root: resolve(__dirname, ".."), configFile: false, logLevel: "error", plugins: [react()],
      build: { write: false, rolldownOptions: { preserveEntrySignatures: "strict", input: resolve(__dirname, "skeletonHarness.tsx"), output: { entryFileNames: "harness.js" } } } });
    const files = new Map(bundle.output.map(file => [file.fileName, file.type === "chunk" ? file.code : file.source]));
    const css = [...files.keys()].filter(name => name.endsWith(".css"));
    browser = await chromium.launch({ headless: true });
    let checked = 0;
    for (const [language, motion] of [["en", "no-preference"], ["ru", "reduce"]]) {
      const page = await browser.newPage({ viewport: { width: 1133, height: 744 }, reducedMotion: motion });
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      await page.route("http://layout.test/**", route => {
        const path = new URL(route.request().url()).pathname.slice(1);
        if (!path) return route.fulfill({ contentType: "text/html", body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Skeleton layout contract</title>${css.map(name => `<link rel="stylesheet" href="/${name}">`).join("")}<div id="root"></div>` });
        assert(files.has(path), `Missing browser module ${path}`);
        const type = path.endsWith(".css") ? "text/css" : path.endsWith(".woff2") ? "font/woff2" : path.endsWith(".webp") ? "image/webp" : "text/javascript";
        return route.fulfill({ contentType: type, body: files.get(path) });
      });
      await page.goto("http://layout.test/");
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        for (const level of LEVELS) for (const options of CHOICES) {
          const state = `${language} ${level} ${options.stars} stars${options.loading ? " loading" : ""}`;
          await page.evaluate(async options => (await import("/harness.js")).mountChoice(options), { language, level, ...options });
          if (!options.loading) await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
          const moving = motion === "reduce" ? await stillEnough(page) : [];
          await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
          });
          const at = `${state} at ${viewport.name}`;
          assert.deepEqual(moving, [], `${at}: without motion, animations are short fades`);
          assert.equal(await page.evaluate(() => document.documentElement.dataset.size), viewport.size, `${at}: the window's size class`);
          await checkLayout(page, { root: ".skeleton-choice-screen", minimum: 48, viewport, state });
          checked++;
        }
        // The puzzle: its board and tray fit, and every spot stays at least 48 wide.
        for (const level of LEVELS) for (const options of PUZZLES) {
          const state = `${language} puzzle ${level} ${JSON.stringify(options)}`;
          await page.evaluate(async options => (await import("/harness.js")).mountPuzzle(options), { language, level, ...options });
          if (!options.loading) await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
          const moving = motion === "reduce" ? await stillEnough(page) : [];
          await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
          });
          assert.deepEqual(moving, [], `${state} at ${viewport.name}: without motion, animations are short fades`);
          await checkLayout(page, { root: ".skeleton-puzzle-screen", minimum: 48, viewport, state });
          const spots = await page.evaluate(() => [...document.querySelectorAll(".skeleton-tray-spot")].map(spot => spot.getBoundingClientRect()).map(({ width, height }) => Math.min(width, height)));
          assert(spots.every(side => side >= 48), `${state} at ${viewport.name}: spots ${spots}`);
          checked++;
        }
        // The mystery's guess, with its question or its longest clue.
        for (const options of GUESSES) {
          const state = `${language} guess ${JSON.stringify(options)}`;
          await page.evaluate(async options => (await import("/harness.js")).mountGuess(options), { language, ...options });
          if (!options.loading) await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
          const moving = motion === "reduce" ? await stillEnough(page) : [];
          await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
          });
          assert.deepEqual(moving, [], `${state} at ${viewport.name}: without motion, animations are short fades`);
          await checkLayout(page, { root: ".skeleton-guess-screen", minimum: 48, viewport, state });
          checked++;
        }
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(`${checked} skeleton layouts fit`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
})();
