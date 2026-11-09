// Contract test: one walk through the released app, from Home into PUZZLE,
// a picture chosen and put together piece by piece with real drags from the
// tray to the board, its result, PLAY AGAIN and the same picture built again,
// the result of the replay, ANOTHER PICTURE back to the choice, and Home, on
// a device of each size, a Hatchling in English and light and an Explorer in
// Russian and dark. Each screen is checked on arrival, so a failure names the
// crossing.
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
  en: { another: "ANOTHER PICTURE", again: "PLAY AGAIN", home: "HOME" },
  ru: { another: "ДРУГАЯ КАРТИНКА", again: "ЕЩЁ РАЗ", home: "ДОМОЙ" }
};

async function walk(browser, url, viewport, language, theme, level) {
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
    if (process.env.PUZZLE_ARTIFACT_DIR) {
      await mkdir(process.env.PUZZLE_ARTIFACT_DIR, { recursive: true });
      await page.screenshot({ path: join(process.env.PUZZLE_ARTIFACT_DIR, `${language}-${theme}-${viewport.width}x${viewport.height}-${state.replace(/\W+/g, "-")}.png`) });
    }
    await checkLayout(page, { viewport, state: `${language} ${theme} ${level} ${state}`, minimum: 48, root });
  };
  const result = async () => (await page.locator(".picture-puzzle-result-screen").count()) > 0;
  const tap = async name => { await page.waitForTimeout(510); await page.getByRole("button", { name, exact: true }).first().click(); };
  // Every piece dragged by the mouse from the tray to its slot on the board,
  // in small moves, until the picture is whole and the result comes.
  const build = async state => {
    await arrive(".picture-puzzle-board-screen", `${state} board`);
    let checkedPart = false;
    for (let moves = 0; !await result(); moves++) {
      assert(moves < 40, `${state}: the picture is whole within 40 drags`);
      const tray = page.locator(".picture-puzzle-tray-piece").first();
      const id = Number((await tray.getAttribute("aria-label")).match(/\d+/)[0]) - 1;
      const slot = page.locator(".picture-puzzle-slot").nth(id);
      await tray.scrollIntoViewIfNeeded();
      const from = await tray.boundingBox(); const to = await slot.boundingBox();
      assert(from && to, `${state}: piece ${id + 1} in the tray and its slot on the board`);
      await page.waitForTimeout(510);
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
      await page.mouse.up();
      await page.waitForFunction(id => document.querySelector(".picture-puzzle-result-screen")
        || document.querySelectorAll(".picture-puzzle-slot")[id]?.hasAttribute("data-fitted"), id);
      if (!checkedPart && !await result()) { checkedPart = true; await arrive(".picture-puzzle-board-screen", `${state} board with a piece fitted`); }
    }
  };
  try {
    await page.goto(url);
    await page.evaluate(({ language, theme, level }) => {
      localStorage.setItem("rexlab-language", language); localStorage.setItem("rexlab-theme", theme);
      localStorage.setItem("rexlab-age-level", JSON.stringify({ level, revision: "parent" }));
    }, { language, theme, level });
    await page.reload();
    await page.locator(".home").waitFor();
    await page.locator('[data-turn-part="tile-picturePuzzle"], .featured-card[data-game="picturePuzzle"]').first().press("Enter");
    await arrive(".picture-puzzle-choice-screen", "first choice");
    await page.waitForTimeout(510); await page.locator(".picture-puzzle-choice").first().click();
    await build("first");
    await arrive(".picture-puzzle-result-screen", "first result");
    await tap(word.again);
    await build("replay");
    await arrive(".picture-puzzle-result-screen", "replay result");
    await tap(word.another);
    await arrive(".picture-puzzle-choice-screen", "choice with a star");
    assert(await page.locator('.picture-puzzle-star[data-earned="true"]').count() >= 1, "the choice shows the picture collected");
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
    for (const viewport of VIEWPORTS) for (const [language, theme, level] of [["en", "light", "hatchling"], ["ru", "dark", "explorer"]]) {
      if (process.env.ONLY && !viewport.name.startsWith(process.env.ONLY)) continue;
      await walk(browser, server.resolvedUrls.local[0], viewport, language, theme, level); walks++;
    }
    console.log(`PASS picture puzzle walk: ${walks} walks from Home through a picture dragged together, its result, a replay, ANOTHER PICTURE and Home, each screen checked on arrival`);
  } finally {
    try { await browser?.close(); }
    finally {
      try { if (server) { server.httpServer.closeAllConnections(); await new Promise(resolve => server.httpServer.close(resolve)); } }
      finally { await app.done(); }
    }
  }
})().catch(error => { console.error(error); console.error(`FAIL picture puzzle walk: ${error.message.split("\n")[0]}`); process.exitCode = 1; });
