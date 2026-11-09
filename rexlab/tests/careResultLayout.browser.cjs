// Contract test: CARE's result on the dig site in the released app. A visit
// played from the welcome to its end shows the result; on every size the
// screen does not scroll (a short phone upright scrolls to its actions),
// the visitor stands in the sky, the score, hearts, title and chips sit
// apart, the three ways sit on the sand, every word is whole, every control
// has a name and is at least 48 wide, and NEW VISITOR brings a new visit;
// a first visit in English and light with motion celebrates its best, a
// returning one in Russian and dark without it shows the best, where every
// animation is a short fade. CARE is the same at every age level, so each
// level plays once on the iPad mini.
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
    }, { language, theme, level, progress: returning ? { bestScore: 8, visitsFinished: 6, friends: FRIENDS } : null });
    await page.reload();
    await page.locator(".home").waitFor();
    await page.locator('[data-turn-part="tile-care"], .featured-card[data-game="care"]').first().press("Enter");
    await page.locator(".care-welcome").waitFor();
    await settle(page);
    await page.getByRole("button", { name: WORDS[language].newVisitor, exact: true }).click();
    await page.locator(".visit .need-bubble").waitFor();
    // Plays the visit to its end, trying each item until the result shows.
    for (let tap = 0; tap < 60 && !(await page.locator(".care-result").count()); tap++) {
      const suggested = page.locator(".tray:not([data-busy]) .tray-item[data-suggested]");
      const free = (await suggested.count()) ? suggested : page.locator(".tray:not([data-busy]) .tray-item:not([data-refused])");
      if (!(await free.count())) { await page.waitForTimeout(150); continue; }
      await free.first().click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(motion === "reduce" ? 600 : 900);
    }
    await page.locator(".care-result").waitFor({ timeout: 10000 }).catch(async (error) => {
      const at = await page.evaluate(() => ({ screen: document.querySelector("main")?.className, needs: [...document.querySelectorAll(".need")].map(n => n.dataset.state), items: [...document.querySelectorAll(".tray-item")].map(i => [i.dataset.item, i.hasAttribute("data-refused"), i.hasAttribute("data-suggested")]), busy: document.querySelector(".tray")?.hasAttribute("data-busy") }));
      throw new Error(`${state}: no result ${JSON.stringify(at)} ${error.message}`);
    });
    await settle(page);
    if (process.env.CARE_ARTIFACT_DIR) {
      await mkdir(process.env.CARE_ARTIFACT_DIR, { recursive: true });
      await page.screenshot({ path: join(process.env.CARE_ARTIFACT_DIR, `result-${language}-${theme}-${level}-${viewport.width}x${viewport.height}.png`), fullPage: true });
    }
    assert.equal(await page.evaluate(() => document.documentElement.dataset.size), viewport.size, `${state}: size class`);
    const short = viewport.size === "tall-narrow" && viewport.height < 800;
    if (!short) await checkLayout(page, { viewport, state, minimum: 48, root: ".care-result" });
    const parts = await page.evaluate(() => {
      const box = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON() ?? null;
      const boxes = selector => [...document.querySelectorAll(selector)].map(el => el.getBoundingClientRect().toJSON());
      return {
        hero: box(".care-result-hero"), score: box(".result-score"), hearts: box(".result-hearts"), title: box(".result-title"),
        chips: boxes(".care-result-chips > *"), actions: boxes(".care-result-action"), sand: box(".dig-ground-sand"),
        page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
        cut: [...document.querySelectorAll(".result-title, .friend-chip, .best-score, .care-record, .care-result-action")].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.className)
      };
    });
    const apart = (a, b) => a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1;
    const across = (a) => a.left >= -1 && a.right <= viewport.width + 1;
    assert(parts.page[0] <= viewport.width, `${state}: no sideways scroll`);
    if (!short) assert(parts.page[1] <= viewport.height, `${state}: no scroll ${parts.page[1]}`);
    assert(parts.hero.height >= (viewport.size === "wide-short" ? 72 : 100) && parts.hero.bottom <= parts.sand.top + 24, `${state}: the visitor in the sky on the sand ${JSON.stringify([parts.hero, parts.sand.top])}`);
    const reward = [parts.score, parts.hearts, parts.title, ...parts.chips];
    for (const [i, a] of reward.entries()) {
      assert(across(a), `${state}: the reward across the screen`);
      assert(apart(a, parts.hero) || viewport.size === "tall" || viewport.size === "tall-narrow", `${state}: the reward clear of the visitor`);
      for (const b of reward.slice(i + 1)) assert(apart(a, b), `${state}: the reward's parts apart ${JSON.stringify([a, b])}`);
    }
    assert.equal(parts.actions.length, 3);
    for (const [i, a] of parts.actions.entries()) {
      assert(across(a) && a.top >= parts.sand.top - 1, `${state}: the actions on the sand ${JSON.stringify([a, parts.sand.top])}`);
      for (const b of parts.actions.slice(i + 1)) assert(apart(a, b), `${state}: the actions apart`);
      for (const b of reward) assert(apart(a, b), `${state}: the actions clear of the reward`);
    }
    assert.deepEqual(parts.cut, [], `${state}: words whole`);
    if (motion === "reduce") {
      const long = await page.evaluate(() => document.getAnimations().map(a => a.effect.getComputedTiming().duration).filter(duration => duration > 200));
      assert.deepEqual(long, [], `${state}: only short fades without motion`);
    }
    await page.getByRole("button", { name: WORDS[language].newVisitor, exact: true }).click();
    await page.locator(".visit").waitFor();
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
    console.log(`PASS care result layout: ${visits} results played from the welcome, checked on every size, and a new visit from each`);
  } finally {
    try { await browser?.close(); }
    finally {
      try { if (server) { server.httpServer.closeAllConnections(); await new Promise(resolve => server.httpServer.close(resolve)); } }
      finally { await app.done(); }
    }
  }
})().catch(error => { console.error(error); console.error(`FAIL care result layout: ${error.message.split("\n")[0]}`); process.exitCode = 1; });
