// Contract test: Home's parent controls and language picker in Chromium.
// At each age level and window: three round controls evenly spaced, the
// collapsed flag of the language in use, both languages in the open menu,
// and the flag switching with the language.
const { mkdir } = require("node:fs/promises");
const { join } = require("node:path");
const { chromium } = require("playwright");
const { appDir, root } = require("./appBuild.cjs");

const sizes = [["ipad-landscape", 1180, 820], ["ipad-portrait", 820, 1180], ["iphone-landscape", 852, 393], ["iphone-portrait", 393, 852], ["mac", 1440, 900]];

(async () => {
  const app = await appDir();
  let server, browser;
  try {
    const { preview } = await import("vite");
    server = await preview({ root, logLevel: "error", build: { outDir: app.dir }, preview: { host: "127.0.0.1", port: 0, open: false } });
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
    const screenshots = process.env.REXLAB_SCREENSHOTS;
    if (screenshots) await mkdir(screenshots, { recursive: true });
    let checked = 0;
    for (const level of ["hatchling", "explorer", "paleontologist"]) for (const [size, width, height] of sizes) {
      const label = `${level} ${size}`;
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", serviceWorkers: "block" });
      try {
        await context.addInitScript(level => {
          localStorage.setItem("rexlab-language", "en");
          localStorage.setItem("rexlab-age-level", JSON.stringify({ level, revision: "parent" }));
        }, level);
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        await page.goto(server.resolvedUrls.local[0]);
        await page.locator(".parent-menus").waitFor();
        const boxes = await page.locator(".parent-menus .parent-menu-button").evaluateAll(buttons => buttons.map(button => {
          const { x, width } = button.getBoundingClientRect();
          return { x, width };
        }));
        const round = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ds-round")));
        if (boxes.length !== 3 || boxes.some(box => box.width !== round)) throw Error(`${label}: parent controls must be three of the design's round ${round}px, got ${JSON.stringify(boxes)}`);
        const centers = boxes.map(box => box.x + box.width / 2);
        if (Math.abs((centers[1] - centers[0]) - (centers[2] - centers[1])) > 0.5) throw Error(`${label}: parent controls must be evenly spaced, centres ${centers}`);
        const button = page.getByRole("button", { name: "Language", exact: true });
        await button.waitFor();
        await page.evaluate(() => document.fonts.ready);
        if (await button.locator(".language-flag-disc").getAttribute("data-language") !== "en") throw Error(`${label}: collapsed flag is not English`);
        if (screenshots) await page.screenshot({ path: join(screenshots, `${level}-${size}-closed.png`) });
        await button.click();
        const menu = page.getByRole("menu", { name: "Language", exact: true });
        await menu.waitFor();
        await menu.evaluate(menu => Promise.all(menu.getAnimations({ subtree: true }).map(animation => animation.finished)));
        for (const name of ["English", "Русский"]) await page.getByRole("menuitemradio", { name, exact: true }).waitFor();
        if (screenshots) await page.screenshot({ path: join(screenshots, `${level}-${size}-open.png`) });
        await page.getByRole("menuitemradio", { name: "Русский", exact: true }).click();
        if (await page.getByRole("button", { name: "Язык", exact: true }).locator(".language-flag-disc").getAttribute("data-language") !== "ru") throw Error(`${label}: flag did not switch to Russian`);
        checked++;
      } finally { await context.close(); }
    }
    console.log(`PASS language picker: flag states and switching at ${checked} age/window combinations`);
  } finally {
    await browser?.close();
    await server?.httpServer.close();
    await app.done();
  }
})().catch(error => { console.error(error); console.error(`FAIL language picker: ${error.message.split("\n")[0]}`); process.exitCode = 1; });
