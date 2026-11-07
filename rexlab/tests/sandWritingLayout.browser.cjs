// Contract test: DRAW on the dig site in the released app. Opened from Home,
// marks drawn with real drags, STICK opened and THICK chosen, a thick mark,
// STICK open again and CLEAR, and Home: on every size the screen does not
// scroll, HOME and STICK sit inside the safe corners, the picker fits on the
// screen with no control cut or overlapping, every control has a name and is
// at least 48 wide; in English and light with motion, and in Russian and dark
// without it, where every animation is a short fade. The screen is the same
// at every age level, so each level opens it once on the iPad mini.
const assert = require("node:assert/strict");
const { mkdir } = require("node:fs/promises");
const { join } = require("node:path");
const { appDir, root } = require("./appBuild.cjs");
const { chromium } = require("playwright");
const { checkLayout } = require("./coloringLayout.cjs");

const VIEWPORTS = [
  { name: "iPad", width: 1024, height: 768, size: "wide" },
  { name: "upright iPad", width: 768, height: 1024, size: "tall" },
  { name: "iPad mini", width: 1133, height: 744, size: "wide" },
  { name: "desktop", width: 1440, height: 900, size: "wide" },
  { name: "iPhone", width: 393, height: 852, size: "tall-narrow" },
  { name: "iPhone on its side", width: 852, height: 393, size: "wide-short" },
  { name: "iPhone SE", width: 375, height: 667, size: "tall-narrow" },
  { name: "iPhone SE on its side", width: 667, height: 375, size: "wide-short" },
  { name: "small phone", width: 320, height: 568, size: "tall-narrow" },
  { name: "small phone on its side", width: 568, height: 320, size: "wide-short" }
];
const LEVELS = ["hatchling", "explorer", "paleontologist"];
const WORDS = {
  en: { stick: "STICK", thick: "THICK", clear: "CLEAR", home: "HOME" },
  ru: { stick: "ПАЛОЧКА", thick: "ТОЛСТАЯ", clear: "СТЕРЕТЬ", home: "ДОМОЙ" }
};

async function visit(browser, url, viewport, language, theme, motion, level) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: motion, hasTouch: false });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  const word = WORDS[language];
  const settle = () => page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
  });
  const arrive = async state => {
    await settle();
    if (process.env.SAND_ARTIFACT_DIR) {
      await mkdir(process.env.SAND_ARTIFACT_DIR, { recursive: true });
      await page.screenshot({ path: join(process.env.SAND_ARTIFACT_DIR, `${language}-${theme}-${level}-${viewport.width}x${viewport.height}-${state.replace(/\W+/g, "-")}.png`) });
    }
    await checkLayout(page, { viewport, state: `${language} ${theme} ${level} ${state}`, minimum: 48, root: ".sand-writing-screen" });
    // HOME and STICK in their corners, the picker wholly on the screen.
    const boxes = await page.evaluate(() => Object.fromEntries([".sand-writing-home", ".sand-writing-stick", ".sand-writing-options[data-open]"]
      .map(selector => [selector, document.querySelector(selector)?.getBoundingClientRect().toJSON() ?? null])));
    const home = boxes[".sand-writing-home"], stick = boxes[".sand-writing-stick"], panel = boxes[".sand-writing-options[data-open]"];
    assert(home.left < viewport.width / 2 && home.top < 80, `${state}: HOME at the top leading corner`);
    assert(stick.right > viewport.width / 2 && stick.top < 80, `${state}: STICK at the top trailing corner`);
    if (panel) assert(panel.left >= 0 && panel.top >= 0 && panel.right <= viewport.width && panel.bottom <= viewport.height, `${state}: the picker fits ${JSON.stringify(panel)}`);
    if (motion === "reduce") {
      const long = await page.evaluate(() => document.getAnimations().map(a => a.effect.getComputedTiming().duration).filter(duration => duration > 200));
      assert.deepEqual(long, [], `${state}: only short fades without motion`);
    }
  };
  const tap = async name => { await page.waitForTimeout(510); await page.getByRole("button", { name, exact: true }).first().click(); };
  const draw = async (points) => {
    await page.waitForTimeout(510);
    const [first, ...rest] = points.map(([x, y]) => [x * viewport.width, y * viewport.height]);
    await page.mouse.move(...first); await page.mouse.down();
    for (const point of rest) await page.mouse.move(...point, { steps: 6 });
    await page.mouse.up();
  };
  try {
    await page.goto(url);
    await page.evaluate(({ language, theme, level }) => {
      localStorage.setItem("rexlab-language", language); localStorage.setItem("rexlab-theme", theme);
      localStorage.setItem("rexlab-age-level", JSON.stringify({ level, revision: "parent" }));
    }, { language, theme, level });
    await page.reload();
    await page.locator(".home").waitFor();
    await page.locator('[data-turn-part="tile-sandWriting"], .featured-card[data-game="sandWriting"]').first().press("Enter");
    await page.locator(".sand-writing-screen").waitFor();
    await draw([[0.15, 0.45], [0.2, 0.3], [0.3, 0.32], [0.18, 0.6], [0.32, 0.6]]);
    await draw([[0.4, 0.6], [0.47, 0.3], [0.54, 0.6]]);
    await arrive("drawn");
    await tap(word.stick);
    await arrive("STICK open");
    await tap(word.thick);
    await draw([[0.6, 0.75], [0.7, 0.65], [0.8, 0.75], [0.9, 0.65]]);
    await arrive("THICK drawn");
    await tap(word.stick);
    await tap(word.clear);
    await arrive("cleared");
    await tap(word.home); await page.locator(".home").waitFor();
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}

(async () => {
  const app = await appDir();
  let server, browser;
  try {
    const { preview } = await import("vite");
    server = await preview({ root, logLevel: "error", build: { outDir: app.dir }, preview: { cors: false, host: "127.0.0.1", port: 0, open: false } });
    browser = await chromium.launch({ headless: true });
    const url = server.resolvedUrls.local[0];
    let visits = 0;
    for (const viewport of VIEWPORTS) for (const [language, theme, motion] of [["en", "light", "no-preference"], ["ru", "dark", "reduce"]]) {
      if (process.env.ONLY && !viewport.name.startsWith(process.env.ONLY)) continue;
      await visit(browser, url, viewport, language, theme, motion, "explorer"); visits++;
    }
    for (const level of LEVELS) {
      if (process.env.ONLY && !"iPad mini".startsWith(process.env.ONLY)) continue;
      await visit(browser, url, VIEWPORTS[2], "en", "light", "no-preference", level); visits++;
    }
    console.log(`PASS sand writing layout: ${visits} visits from Home through marks drawn, STICK open, THICK, CLEAR and Home, each state checked on every size`);
  } finally {
    try { await browser?.close(); }
    finally {
      try { if (server) { server.httpServer.closeAllConnections(); await new Promise(resolve => server.httpServer.close(resolve)); } }
      finally { await app.done(); }
    }
  }
})().catch(error => { console.error(error); console.error(`FAIL sand writing layout: ${error.message.split("\n")[0]}`); process.exitCode = 1; });
