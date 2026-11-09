// Contract test: one walk through the released app, from Home into CARE: its
// first welcome, a new visitor's visit played to its end with real taps,
// the result, FRIENDS with the new friend, BACK to the welcome with the best
// and the friend, a second visit played to its result, and HOME; on a
// device of each size, a Hatchling in English and light and an Explorer in
// Russian and dark. Each screen is checked on arrival, so a failure names
// the crossing; an upright phone shorter than the result scrolls to its
// actions.
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
  en: { newVisitor: "NEW VISITOR", friends: "FRIENDS", back: "BACK", home: "HOME" },
  ru: { newVisitor: "НОВЫЙ ГОСТЬ", friends: "ДРУЗЬЯ", back: "НАЗАД", home: "ДОМОЙ" }
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
    if (process.env.CARE_ARTIFACT_DIR) {
      await mkdir(process.env.CARE_ARTIFACT_DIR, { recursive: true });
      await page.screenshot({ path: join(process.env.CARE_ARTIFACT_DIR, `${language}-${theme}-${viewport.width}x${viewport.height}-${state.replace(/\W+/g, "-")}.png`) });
    }
    // An upright phone shorter than the result scrolls to its actions.
    const scrolls = root === ".care-result" && viewport.size === "tall-narrow" && viewport.height < 800;
    if (!scrolls) await checkLayout(page, { viewport, state: `${language} ${theme} ${level} ${state}`, minimum: 48, root });
  };
  const tap = async name => { await page.waitForTimeout(510); await page.getByRole("button", { name, exact: true }).first().click(); };
  // The visit played with real taps: the item suggested after a refusal,
  // or else the first not refused, until the result comes.
  const play = async state => {
    await arrive(".visit", `${state} visit`);
    for (let taps = 0; !(await page.locator(".care-result").count()); taps++) {
      assert(taps < 40, `${state}: the visit ends within 40 taps`);
      const suggested = page.locator(".tray:not([data-busy]) .tray-item[data-suggested]");
      const item = (await suggested.count()) ? suggested : page.locator(".tray:not([data-busy]) .tray-item:not([data-refused])");
      if (await item.count()) await item.first().click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(900);
    }
    await arrive(".care-result", `${state} result`);
  };
  try {
    await page.goto(url);
    await page.evaluate(({ language, theme, level }) => {
      localStorage.setItem("rexlab-language", language); localStorage.setItem("rexlab-theme", theme);
      localStorage.setItem("rexlab-age-level", JSON.stringify({ level, revision: "parent" }));
    }, { language, theme, level });
    await page.reload();
    await page.locator(".home").waitFor();
    await page.locator('[data-turn-part="tile-care"], .featured-card[data-game="care"]').first().press("Enter");
    await arrive(".care-welcome", "first welcome");
    assert.equal(await page.locator(".care-best").count(), 0, "no best before the first visit");
    await tap(word.newVisitor);
    await play("first");
    const friend = (await page.locator(".friend-chip").textContent()).trim();
    await tap(word.friends);
    await arrive(".friends-dig-site", "friends");
    assert.equal(await page.locator(".friend-card").count(), 1, "the visitor is a friend");
    assert((await page.locator(".friend-card").first().textContent()).includes(friend), `${friend} among the friends`);
    await tap(word.back);
    await arrive(".care-welcome", "returning welcome");
    assert.equal(await page.locator(".care-best").count(), 1, "the best on the welcome");
    assert.equal((await page.locator(".care-friend-count").textContent()).trim(), "1", "one friend on the welcome");
    await tap(word.newVisitor);
    await play("second");
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
    // The walk runs as two jobs, each in CI's ten minutes: the phones in
    // careWalkPhone.browser.cjs, every other size here.
    const phones = process.env.CARE_WALK === "phones";
    for (const viewport of VIEWPORTS.filter(({ size }) => (size === "tall-narrow" || size === "wide-short") === phones)) for (const [language, theme, level] of [["en", "light", "hatchling"], ["ru", "dark", "explorer"]]) {
      if (process.env.ONLY && !viewport.name.startsWith(process.env.ONLY)) continue;
      await walk(browser, server.resolvedUrls.local[0], viewport, language, theme, level); walks++;
    }
    console.log(`PASS care walk${phones ? " on phones" : ""}: ${walks} walks from Home through two visits played to their results, FRIENDS, BACK and HOME, each screen checked on arrival`);
  } finally {
    try { await browser?.close(); }
    finally {
      try { if (server) { server.httpServer.closeAllConnections(); await new Promise(resolve => server.httpServer.close(resolve)); } }
      finally { await app.done(); }
    }
  }
})().catch(error => { console.error(error); console.error(`FAIL care walk: ${error.message.split("\n")[0]}`); process.exitCode = 1; });
