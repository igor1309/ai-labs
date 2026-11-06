// Contract test: one walk through the released app, from Home into LABYRINTH,
// the baby walked home by keyboard and by taps, its result, AGAIN until three
// hint-free rounds bring the Explorer offer, YES, and the Explorer maze, on
// a device of each size in English and light and in Russian and dark. Each
// screen is checked on arrival, so a failure names the crossing.
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
  en: { title: "HOME TOGETHER!", again: "AGAIN", yes: "YES", home: "HOME", explorer: "TRY THE EXPLORER LEVEL?", total: n => `+3 STARS · TOTAL ${n}` },
  ru: { title: "ВМЕСТЕ ДОМА!", again: "ЕЩЁ РАЗ", yes: "ДА", home: "ДОМОЙ", explorer: "ПОПРОБУЕМ УРОВЕНЬ ИССЛЕДОВАТЕЛЬ?", total: n => `+3 ЗВЕЗДЫ · ВСЕГО ${n}` }
};
const KEYS = { [-1]: "ArrowLeft", 1: "ArrowRight" };

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
  const pictures = () => page.waitForFunction(() => !document.querySelector('main [data-picture="loading"], main [data-picture="failed"]'));
  const arrive = async (ready, state, options) => {
    await page.locator(ready).first().waitFor({ state: "attached" }); await pictures(); await animations();
    await checkLayout(page, { viewport, state: `${language} ${theme} ${state}`, minimum: 48, ...options });
    if (process.env.LABYRINTH_ARTIFACT_DIR) {
      await mkdir(process.env.LABYRINTH_ARTIFACT_DIR, { recursive: true });
      await page.screenshot({ path: join(process.env.LABYRINTH_ARTIFACT_DIR, `${language}-${viewport.width}x${viewport.height}-${state.replace(/\W+/g, "-")}.png`) });
    }
  };
  const board = async (state, columns) => {
    await arrive(".labyrinth-board-screen:not([data-finished])", state, { root: ".labyrinth-board-screen", scroller: ".labyrinth-window" });
    const shown = await page.locator(".labyrinth-maze").evaluate(maze => getComputedStyle(maze).gridTemplateColumns.split(" ").length);
    if (columns) assert.equal(shown, columns, `${state}: the maze's columns`);
  };
  // The route home through the maze as drawn, the turned one included.
  const route = () => page.locator(".labyrinth-maze").evaluate(maze => {
    const columns = getComputedStyle(maze).gridTemplateColumns.split(" ").length;
    const cells = [...maze.children];
    const start = cells.findIndex(cell => cell.getAttribute("aria-current") === "location");
    const goal = cells.findIndex(cell => cell.hasAttribute("data-goal"));
    const routes = new Map([[start, [start]]]); const queue = [start];
    for (let at = 0; at < queue.length; at++) {
      const place = queue[at];
      if (place === goal) return { columns, steps: routes.get(place) };
      for (const next of [place - columns, place + columns, place - 1, place + 1]) {
        if (!cells[next]?.classList.contains("labyrinth-cell") || routes.has(next) ||
          Math.abs(next % columns - place % columns) + Math.abs(Math.floor(next / columns) - Math.floor(place / columns)) !== 1) continue;
        routes.set(next, [...routes.get(place), next]); queue.push(next);
      }
    }
    return { columns, steps: [] };
  });
  // Most of the way by arrow keys, the last three steps by tapping the next
  // spot, each tap past the double-tap filter's half second.
  const solve = async state => {
    const { columns, steps } = await route();
    assert(steps.length > 1, `${state}: a way home`);
    const half = Math.max(0, steps.length - 4);
    await page.locator(".labyrinth-maze").focus();
    for (let i = 1; i <= half; i++) {
      const offset = steps[i] - steps[i - 1];
      await page.keyboard.press(offset === -columns ? "ArrowUp" : offset === columns ? "ArrowDown" : KEYS[offset]);
    }
    for (let i = half + 1; i < steps.length; i++) {
      const cell = page.locator(".labyrinth-maze > *").nth(steps[i]);
      await cell.scrollIntoViewIfNeeded(); await page.waitForTimeout(510); await cell.click();
      await page.waitForFunction(place => document.querySelectorAll(".labyrinth-maze > *")[place]?.getAttribute("aria-current") === "location" || document.querySelector(".labyrinth-result-screen"), steps[i]);
    }
  };
  const result = async (state, total, offer) => {
    await arrive(".labyrinth-result-screen", state, { root: ".labyrinth-result-screen" });
    assert.equal(await page.getByRole("heading", { level: 1 }).textContent(), word.title, `${state}: the title`);
    assert.equal(await page.locator(".labyrinth-reward").textContent(), word.total(total), `${state}: the reward`);
    assert.equal(await page.locator(".labyrinth-reunion-stars .star").count(), 3, `${state}: three stars`);
    if (offer) {
      await page.getByRole("dialog", { name: offer }).waitFor(); await animations();
      await checkLayout(page, { viewport, state: `${language} ${theme} ${state} with the offer`, minimum: 48, root: ".labyrinth-result-screen" });
    } else assert.equal(await page.getByRole("dialog").count(), 0, `${state}: no offer`);
  };
  const press = async name => { await page.getByRole("button", { name, exact: true }).first().press("Enter"); await animations(); };
  try {
    await page.goto(url);
    await page.evaluate(({ language, theme }) => {
      localStorage.setItem("rexlab-language", language); localStorage.setItem("rexlab-theme", theme);
      localStorage.setItem("rexlab-age-level", JSON.stringify({ level: "hatchling", revision: "parent" }));
    }, { language, theme });
    await page.reload();
    await page.locator(".home").waitFor();
    await page.locator('[data-turn-part="tile-labyrinth"], .featured-card[data-game="labyrinth"]').first().press("Enter");
    for (const round of [1, 2, 3]) {
      await board(`hatchling round ${round}`);
      await solve(`hatchling round ${round}`);
      await result(`hatchling result ${round}`, 3 * round, round === 3 ? word.explorer : null);
      if (round < 3) await press(word.again);
    }
    await press(word.yes);
    await page.getByRole("dialog").waitFor({ state: "detached" });
    await press(word.again);
    await board("explorer board");
    assert.equal(await page.locator(".labyrinth-board-screen").getAttribute("data-level"), "explorer", "YES then AGAIN plays Explorer");
    await solve("explorer board");
    await result("explorer result", 12, null);
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
    for (const viewport of VIEWPORTS) for (const [language, theme] of [["en", "light"], ["ru", "dark"]]) {
      await walk(browser, server.resolvedUrls.local[0], viewport, language, theme); walks++;
    }
    console.log(`PASS labyrinth walk: ${walks} walks from Home through three Hatchling rounds, the Explorer offer and an Explorer round, each screen checked on arrival`);
  } finally {
    try { await browser?.close(); }
    finally {
      try { if (server) { server.httpServer.closeAllConnections(); await new Promise(resolve => server.httpServer.close(resolve)); } }
      finally { await app.done(); }
    }
  }
})().catch(error => { console.error(error); console.error(`FAIL labyrinth walk: ${error.message.split("\n")[0]}`); process.exitCode = 1; });
