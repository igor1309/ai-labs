// Contract test: one walk through the released app, from Home into BONES,
// a Hatchling skeleton built bone by bone with real drags, its result, the
// museum, BUILD ANOTHER, the mystery skeleton built and guessed, a wrong
// guess first where there is one, and Home, on a device of each size in
// English and light and in Russian and dark. Each screen is checked on
// arrival, so a failure names the crossing.
const assert = require("node:assert/strict");
const { mkdir } = require("node:fs/promises");
const { join } = require("node:path");
const { appDir, root } = require("./appBuild.cjs");
const { chromium } = require("playwright");
const { checkLayout } = require("./coloringLayout.cjs");

const VIEWPORTS = [
  { name: "iPad mini", width: 1133, height: 744, size: "wide" },
  { name: "desktop", width: 1440, height: 900, size: "wide" },
  { name: "upright iPad", width: 744, height: 1133, size: "tall" },
  { name: "iPhone", width: 393, height: 852, size: "tall-narrow" },
  { name: "iPhone SE", width: 375, height: 667, size: "tall-narrow" },
  { name: "iPhone on its side", width: 852, height: 393, size: "wide-short" }
];
const WORDS = {
  en: { museum: "MUSEUM", another: "BUILD ANOTHER", mystery: "MYSTERY SKELETON", home: "HOME" },
  ru: { museum: "МУЗЕЙ", another: "СОБРАТЬ ДРУГОЙ", mystery: "ЗАГАДОЧНЫЙ СКЕЛЕТ", home: "ДОМОЙ" }
};

async function walk(browser, url, viewport, language, theme) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: false });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  const word = WORDS[language];
  const animations = () => page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(a => a.timeline === document.timeline && a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
  });
  const pictures = () => page.waitForFunction(() => !document.querySelector('main [data-picture="loading"], main [data-picture="failed"]'));
  const arrive = async (root, state) => {
    await page.locator(root).first().waitFor({ state: "attached" }); await pictures(); await animations();
    if (process.env.SKELETON_ARTIFACT_DIR) {
      await mkdir(process.env.SKELETON_ARTIFACT_DIR, { recursive: true });
      await page.screenshot({ path: join(process.env.SKELETON_ARTIFACT_DIR, `${language}-${theme}-${viewport.width}x${viewport.height}-${state.replace(/\W+/g, "-")}.png`) });
    }
    await checkLayout(page, { viewport, state: `${language} ${theme} ${state}`, minimum: 48, root });
  };
  const tap = async name => { await page.waitForTimeout(510); await page.getByRole("button", { name, exact: true }).first().click(); };
  // Every bone dragged by the mouse from its spot in the tray to its home on
  // the board, in small moves, the lifted bone following; the paleontologist's
  // strays stay put.
  const build = async state => {
    await arrive(".skeleton-puzzle-screen", `${state} puzzle`);
    for (;;) {
      const piece = await page.evaluate(() => [...document.querySelectorAll(".skeleton-slot[data-state=empty]")][0]?.dataset.piece);
      if (!piece) break;
      const spot = await page.locator(`.skeleton-tray-spot[data-piece="${piece}"]`).boundingBox();
      await page.locator(`.skeleton-tray-spot[data-piece="${piece}"]`).scrollIntoViewIfNeeded();
      const from = await page.locator(`.skeleton-tray-spot[data-piece="${piece}"]`).boundingBox();
      const to = await page.locator(`.skeleton-slot[data-piece="${piece}"]`).boundingBox();
      assert(spot && from && to, `${state}: ${piece} in the tray and on the board`);
      await page.waitForTimeout(510);
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.locator(`.skeleton-lifted[data-piece="${piece}"]`).waitFor();
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
      await page.mouse.up();
      await page.locator(`.skeleton-slot[data-piece="${piece}"][data-state=fitted]`).waitFor();
    }
  };
  try {
    await page.goto(url);
    await page.evaluate(({ language, theme }) => {
      localStorage.setItem("rexlab-language", language); localStorage.setItem("rexlab-theme", theme);
      localStorage.setItem("rexlab-age-level", JSON.stringify({ level: "hatchling", revision: "parent" }));
    }, { language, theme });
    await page.reload();
    await page.locator(".home").waitFor();
    await page.locator('[data-turn-part="tile-skeletons"], .featured-card[data-game="skeletons"]').first().press("Enter");
    await arrive(".skeleton-choice-screen", "first choice");
    await page.waitForTimeout(510); await page.locator(".skeleton-choice:not(.skeleton-mystery)").first().click();
    await build("first");
    await arrive(".skeleton-result", "first result");
    await tap(word.museum);
    await arrive(".skeleton-museum-screen", "museum");
    assert.equal(await page.locator('.skeleton-stand[data-state="built"]').count(), 1, "the museum shows the skeleton built");
    await tap(word.another);
    await arrive(".skeleton-choice-screen", "choice with the mystery");
    await tap(word.mystery);
    await build("mystery");
    await arrive(".skeleton-guess-screen", "guess");
    // Each guess either rests aside wrong, giving the clue, or reveals.
    for (let wrong = 0; ; wrong++) {
      assert(wrong < 3, "one of three guesses is right");
      await page.waitForTimeout(510); await page.locator(".skeleton-guess-card:not([data-wrong])").first().click();
      await page.waitForFunction(wrong => document.querySelector(".skeleton-result") || document.querySelectorAll(".skeleton-guess-card[data-wrong]").length > wrong, wrong);
      if (await page.locator(".skeleton-result").count()) break;
      if (wrong === 0) await arrive(".skeleton-guess-screen", "guess with its clue");
    }
    await arrive(".skeleton-result", "mystery result");
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
    let walks = 0;
    for (const viewport of VIEWPORTS) for (const [language, theme] of [["en", "light"], ["ru", "dark"]]) {
      if (process.env.ONLY && !viewport.name.startsWith(process.env.ONLY)) continue;
      await walk(browser, server.resolvedUrls.local[0], viewport, language, theme); walks++;
    }
    console.log(`PASS skeleton walk: ${walks} walks from Home through a skeleton dragged together, its result, the museum, the mystery built and guessed, and Home, each screen checked on arrival`);
  } finally {
    try { await browser?.close(); }
    finally {
      try { if (server) { server.httpServer.closeAllConnections(); await new Promise(resolve => server.httpServer.close(resolve)); } }
      finally { await app.done(); }
    }
  }
})().catch(error => { console.error(error); console.error(`FAIL skeleton walk: ${error.message.split("\n")[0]}`); process.exitCode = 1; });
