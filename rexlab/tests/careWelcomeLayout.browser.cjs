// Contract test: CARE's welcome on the dig site in the released app. Opened
// from Home, on every size the screen does not scroll, the cards sit on the
// sand under the sky side by side or one over the other without overlapping,
// each pill keeps its words whole, the faces stay inside FRIENDS, every
// control has a name and is at least 48 wide, and NEW VISITOR opens a visit;
// on a first visit in English and light with motion, and returning with
// friends in Russian and dark without it, where every animation is a short
// fade. CARE is the same at every age level, so each level opens it once on
// the iPad mini.
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
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
    });
    if (process.env.CARE_ARTIFACT_DIR) {
      await mkdir(process.env.CARE_ARTIFACT_DIR, { recursive: true });
      await page.screenshot({ path: join(process.env.CARE_ARTIFACT_DIR, `welcome-${language}-${theme}-${level}-${viewport.width}x${viewport.height}.png`) });
    }
    assert.equal(await page.evaluate(() => document.documentElement.dataset.size), viewport.size, `${state}: size class`);
    await checkLayout(page, { viewport, state, minimum: 48, root: ".care-welcome" });
    const parts = await page.evaluate(() => {
      const box = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON() ?? null;
      return {
        visitor: box(".new-visitor-card"), friends: box(".friends-card"), bar: box(".skeleton-bar"), title: box(".skeleton-title-words"),
        best: box(".care-best"), sand: box(".dig-ground-sand"),
        faces: [...document.querySelectorAll(".care-face")].map(face => face.getBoundingClientRect().toJSON()),
        cut: [...document.querySelectorAll(".care-pill, .care-friend-count, .skeleton-title-words, .care-best")].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.className),
        picture: box(".new-visitor-picture"), art: box(".new-visitor-art")
      };
    });
    const inside = (a, b) => a.left >= b.left - 1 && a.top >= b.top - 1 && a.right <= b.right + 1 && a.bottom <= b.bottom + 1;
    const apart = (a, b) => a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1;
    const screen = { left: 0, top: 0, right: viewport.width, bottom: viewport.height };
    for (const card of [parts.visitor, parts.friends]) {
      assert(inside(card, screen), `${state}: a card on the screen ${JSON.stringify(card)}`);
      assert(card.top >= parts.sand.top - 1, `${state}: the cards on the sand`);
      assert(apart(card, parts.bar), `${state}: the cards clear of the bar`);
    }
    assert(apart(parts.visitor, parts.friends), `${state}: the cards apart`);
    const upright = viewport.size === "tall" || viewport.size === "tall-narrow";
    assert(upright ? parts.visitor.bottom <= parts.friends.top + 1 : parts.visitor.right <= parts.friends.left + 1, `${state}: NEW VISITOR ${upright ? "over" : "beside"} FRIENDS`);
    assert(parts.visitor.width * parts.visitor.height > parts.friends.width * parts.friends.height, `${state}: NEW VISITOR the larger card`);
    assert.deepEqual(parts.cut, [], `${state}: words whole`);
    assert.equal(parts.faces.length, 6);
    for (const face of parts.faces) assert(inside(face, parts.friends) && face.width >= 32, `${state}: a face inside FRIENDS ${JSON.stringify(face)}`);
    assert(inside(parts.picture, parts.art), `${state}: the visitor inside its pocket`);
    assert.equal(parts.best !== null, returning, `${state}: the best only once there is one`);
    if (parts.best) assert(apart(parts.best, parts.title), `${state}: the best clear of the title`);
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
    console.log(`PASS care welcome layout: ${visits} welcomes from Home, first and returning, checked on every size and opening a visit`);
  } finally {
    try { await browser?.close(); }
    finally {
      try { if (server) { server.httpServer.closeAllConnections(); await new Promise(resolve => server.httpServer.close(resolve)); } }
      finally { await app.done(); }
    }
  }
})().catch(error => { console.error(error); console.error(`FAIL care welcome layout: ${error.message.split("\n")[0]}`); process.exitCode = 1; });
