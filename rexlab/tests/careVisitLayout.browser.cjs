// Contract test: a CARE visit on the dig site in the released app. Opened
// from CARE's welcome, on every size the visit fits the screen without
// scrolling (a phone shorter than its stage scrolls), HOME, the needs and
// the hearts stay apart in the sky, the visitor and its bubble stand on the
// stage, the five items sit in one row on the sand clear of the stage's
// name, every word is whole, every control has a name and is at least 48
// wide; giving the item asked for earns hearts; in English and light with
// motion, and in Russian and dark without it, where every animation is a
// short fade. CARE is the same at every age level, so each level opens a
// visit once on the iPad mini.
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
const FRIENDS = ["tyrannosaurus", "triceratops", "stegosaurus", "brachiosaurus", "parasaurolophus"];
const WORDS = { en: { newVisitor: "NEW VISITOR", home: "HOME" }, ru: { newVisitor: "НОВЫЙ ГОСТЬ", home: "ДОМОЙ" } };

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
  });
}

async function visit(browser, url, viewport, language, theme, motion, level, returning) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: motion, hasTouch: false });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  const state = `${language} ${theme} ${level} ${viewport.name} ${returning ? "returning" : "first visit"}`;
  try {
    await page.goto(url);
    await page.evaluate(({ language, theme, level, progress }) => {
      localStorage.setItem("rexlab-language", language); localStorage.setItem("rexlab-theme", theme);
      localStorage.setItem("rexlab-age-level", JSON.stringify({ level, revision: "parent" }));
      if (progress) localStorage.setItem("rexlab-progress", JSON.stringify({ schemaVersion: 1, games: { "dinosaur-care": progress } }));
    }, { language, theme, level, progress: returning ? { bestScore: 7, visitsFinished: 6, friends: FRIENDS } : null });
    await page.reload();
    await page.locator(".home").waitFor();
    await page.locator('[data-turn-part="tile-care"], .featured-card[data-game="care"]').first().press("Enter");
    await page.locator(".care-welcome").waitFor();
    await settle(page);
    await page.getByRole("button", { name: WORDS[language].newVisitor, exact: true }).click();
    await page.locator(".visit .need-bubble").waitFor();
    await settle(page);
    if (process.env.CARE_ARTIFACT_DIR) {
      await mkdir(process.env.CARE_ARTIFACT_DIR, { recursive: true });
      await page.screenshot({ path: join(process.env.CARE_ARTIFACT_DIR, `visit-${language}-${theme}-${level}-${viewport.width}x${viewport.height}.png`) });
    }
    assert.equal(await page.evaluate(() => document.documentElement.dataset.size), viewport.size, `${state}: size class`);
    await checkLayout(page, { viewport, state, minimum: 48, root: ".visit" });
    const parts = await page.evaluate(() => {
      const box = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON() ?? null;
      const boxes = selector => [...document.querySelectorAll(selector)].map(el => el.getBoundingClientRect().toJSON());
      return {
        home: box(".visit .home-button"), hearts: box(".hearts-counter"), needs: boxes(".need"), stage: box(".stage"),
        name: box(".visitor-name"), picture: box(".visitor-picture"), bubble: box(".need-bubble"), sand: box(".dig-ground-sand"),
        items: boxes(".tray-item"), pockets: boxes(".tray-picture"),
        cut: [...document.querySelectorAll(".visitor-name, .hearts-count")].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.className)
      };
    });
    const inside = (a, b) => a.left >= b.left - 1 && a.top >= b.top - 1 && a.right <= b.right + 1 && a.bottom <= b.bottom + 1;
    const apart = (a, b) => a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1;
    const screen = { left: 0, top: 0, right: viewport.width, bottom: viewport.height };
    assert.equal(parts.needs.length, 4);
    for (const need of parts.needs) {
      assert(inside(need, screen), `${state}: a need on the screen`);
      assert(apart(need, parts.home) && apart(need, parts.hearts), `${state}: the needs clear of HOME and the hearts`);
    }
    assert(apart(parts.home, parts.hearts), `${state}: HOME clear of the hearts`);
    assert(inside(parts.name, screen), `${state}: the name on the screen`);
    assert(inside(parts.bubble, parts.stage), `${state}: the bubble on the stage ${JSON.stringify([parts.bubble, parts.stage])}`);
    assert(parts.picture.height >= 120, `${state}: the visitor large enough ${parts.picture.height}`);
    assert.equal(parts.items.length, 5);
    for (const [i, item] of parts.items.entries()) {
      assert(inside(item, screen), `${state}: an item on the screen ${JSON.stringify(item)}`);
      assert(parts.pockets[i].top >= parts.sand.top - 1, `${state}: the pockets on the sand`);
      assert(apart(item, parts.name), `${state}: the items clear of the name`);
      if (i) assert(item.left >= parts.items[i - 1].right - 1 && Math.abs(item.top - parts.items[0].top) < 2, `${state}: the items in one row`);
    }
    assert.deepEqual(parts.cut, [], `${state}: words whole`);
    if (motion === "reduce") {
      const long = await page.evaluate(() => document.getAnimations().map(a => a.effect.getComputedTiming().duration).filter(duration => duration > 200));
      assert.deepEqual(long, [], `${state}: only short fades without motion`);
    }
    // The item asked for earns hearts: try each until one does.
    let earned = false;
    for (let i = 0; i < 5 && !earned; i++) {
      await page.locator(".tray:not([data-busy])").waitFor();
      await page.locator(".tray-item").nth(i).click();
      earned = await page.waitForFunction(() => document.querySelector(".hearts-count")?.textContent !== "0", null, { timeout: 4000 }).then(() => true, () => false);
    }
    assert(earned, `${state}: an item earns hearts`);
    await page.getByRole("button", { name: WORDS[language].home, exact: true }).click();
    await page.locator(".home").waitFor();
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
    for (const viewport of VIEWPORTS) for (const [language, theme, motion, returning] of [["en", "light", "no-preference", false], ["ru", "dark", "reduce", true]]) {
      if (process.env.ONLY && !viewport.name.startsWith(process.env.ONLY)) continue;
      await visit(browser, url, viewport, language, theme, motion, "explorer", returning); visits++;
    }
    for (const level of LEVELS) {
      if (process.env.ONLY && !"iPad mini".startsWith(process.env.ONLY)) continue;
      await visit(browser, url, VIEWPORTS[2], "en", "light", "no-preference", level, true); visits++;
    }
    console.log(`PASS care visit layout: ${visits} visits from the welcome checked on every size, earning hearts and going home`);
  } finally {
    try { await browser?.close(); }
    finally {
      try { if (server) { server.httpServer.closeAllConnections(); await new Promise(resolve => server.httpServer.close(resolve)); } }
      finally { await app.done(); }
    }
  }
})().catch(error => { console.error(error); console.error(`FAIL care visit layout: ${error.message.split("\n")[0]}`); process.exitCode = 1; });
