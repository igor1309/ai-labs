// Contract test: one walk through the released app, Home to gallery to workshop
// to result and back, on every size in English and light and in Russian and
// dark. Each screen is checked on arrival, so a failure names the crossing.
const assert = require("node:assert/strict");
const { mkdir } = require("node:fs/promises");
const { join } = require("node:path");
const { appDir, root } = require("./appBuild.cjs");
const { chromium } = require("playwright");
const { LAYOUT_VIEWPORTS, checkLayout } = require("./coloringLayout.cjs");

const WORDS = {
  en: { newWork: "NEW WORK", color: "COLOR", blue: "BLUE", fill: "FILL", saved: "SAVED", done: "DONE", gallery: "GALLERY", cont: "CONTINUE", edit: "EDIT", home: "HOME" },
  ru: { newWork: "НОВЫЙ РИСУНОК", color: "ЦВЕТ", blue: "ГОЛУБОЙ", fill: "ЗАЛИВКА", saved: "СОХРАНЕНО", done: "ГОТОВО", gallery: "ГАЛЕРЕЯ", cont: "ПРОДОЛЖИТЬ", edit: "ЕЩЁ РИСОВАТЬ", home: "ДОМОЙ" }
};
const PAPER = { light: "rgb(255, 253, 248)", dark: "rgb(231, 223, 204)" };

async function walk(browser, url, viewport, language, theme) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  const word = WORDS[language];
  const animations = () => page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(a => a.timeline === document.timeline && a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
  });
  const press = async name => { await page.getByRole("button", { name, exact: true }).press("Enter"); await animations(); };
  const arrive = async (ready, state, options) => {
    await page.locator(ready).first().waitFor({ state: "attached" }); await animations();
    await checkLayout(page, { viewport, state: `${language} ${theme} ${state}`, ...options });
    if (process.env.COLORING_ARTIFACT_DIR) {
      await mkdir(process.env.COLORING_ARTIFACT_DIR, { recursive: true });
      await page.screenshot({ path: join(process.env.COLORING_ARTIFACT_DIR, `${language}-${viewport.width}x${viewport.height}-${state.replace(/\W+/g, "-")}.png`) });
    }
  };
  const gallery = state => arrive('.gallery-works[aria-busy="false"]', state, { root: ".coloring-gallery", minimum: 48, scroller: ".gallery-room, .gallery-actions" });
  const workshop = state => arrive(".coloring-workshop canvas", state, { root: ".coloring-workshop", minimum: 48 });
  const result = async state => {
    await arrive(".coloring-result", state, { root: ".coloring-result", minimum: 60 });
    assert.equal(await page.locator(".coloring-result-paper").evaluate(el => getComputedStyle(el).backgroundColor), PAPER[theme]);
  };
  const paint = async () => {
    // An upright iPad keeps the colours open and has no COLOR button.
    if (await page.getByRole("button", { name: word.color, exact: true }).count()) await press(word.color);
    await press(word.blue); await press(word.fill);
    const box = await page.locator("canvas").boundingBox();
    await page.mouse.click(box.x + box.width * 420 / 920, box.y + box.height * 330 / 620);
    await page.waitForFunction(text => document.querySelector(".coloring-save")?.textContent === text, word.saved);
  };
  try {
    await page.goto(url);
    await page.evaluate(({ language, theme }) => {
      localStorage.setItem("rexlab-language", language); localStorage.setItem("rexlab-theme", theme);
      localStorage.setItem("rexlab-age-level", JSON.stringify({ level: "hatchling", revision: "parent" }));
    }, { language, theme });
    await page.reload();
    const entry = page.locator('[data-turn-part="tile-coloring"], .featured-card[data-game="coloring"]');
    await page.locator(".home").waitFor();

    await entry.press("Enter"); await gallery("gallery, first visit");
    await press(word.newWork); await workshop("workshop, new work");
    await paint(); await press(word.done); await result("result, first star");
    assert.equal(await page.locator(".celebration").count(), 1);
    assert.equal(await page.locator(".coloring-result-count strong").textContent(), "1");

    await press(word.gallery); await gallery("gallery, returning");
    assert.equal(await page.locator(".gallery-earned-star").count(), 1);
    await press(word.cont); await workshop("workshop, continuing");
    await press(word.done); await result("result, kept star");
    assert.equal(await page.locator(".celebration").count(), 0);

    await press(word.edit); await workshop("workshop, editing");
    await press(word.done); await result("result, kept star again");
    await press(word.home); await page.locator(".home").waitFor();
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
    for (const viewport of LAYOUT_VIEWPORTS) for (const [language, theme] of [["en", "light"], ["ru", "dark"]]) {
      await walk(browser, server.resolvedUrls.local[0], viewport, language, theme); walks++;
    }
    console.log(`PASS coloring walk: ${walks} walks from Home through gallery, workshop and result and back, each screen checked on arrival`);
  } finally {
    try { await browser?.close(); }
    finally {
      try { if (server) { server.httpServer.closeAllConnections(); await new Promise(resolve => server.httpServer.close(resolve)); } }
      finally { await app.done(); }
    }
  }
})().catch(error => { console.error(error); console.error(`FAIL coloring walk: ${error.message.split("\n")[0]}`); process.exitCode = 1; });
