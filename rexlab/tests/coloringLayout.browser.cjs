// Contract test: every Coloring screen, in each of its states, fits every
// size class in English with motion and in Russian without it: no page
// scroll, nothing off screen, no overlap, no cut label, named controls big
// enough to tap.
const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { chromium } = require("playwright");
const { LAYOUT_VIEWPORTS, checkLayout } = require("./coloringLayout.cjs");

(async () => {
  let browser;
  try {
    const { build } = await import("vite");
    const react = (await import("@vitejs/plugin-react")).default;
    const bundle = await build({ root: resolve(__dirname, ".."), configFile: false, logLevel: "error", plugins: [react()],
      build: { write: false, rolldownOptions: { preserveEntrySignatures: "strict", input: resolve(__dirname, "coloringGalleryHarness.tsx"), output: { entryFileNames: "harness.js" } } } });
    const files = new Map(bundle.output.map(file => [file.fileName, file.type === "chunk" ? file.code : file.source]));
    const css = [...files.keys()].filter(name => name.endsWith(".css"));
    browser = await chromium.launch({ headless: true });
    let checked = 0;
    for (const [language, motion] of [["en", "no-preference"], ["ru", "reduce"]]) {
      const page = await browser.newPage({ viewport: { width: 1133, height: 744 }, reducedMotion: motion });
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      await page.route("http://layout.test/**", route => {
        const path = new URL(route.request().url()).pathname.slice(1);
        if (!path) return route.fulfill({ contentType: "text/html", body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Coloring layout contract</title>${css.map(name => `<link rel="stylesheet" href="/${name}">`).join("")}` });
        assert(files.has(path), `Missing browser module ${path}`);
        return route.fulfill({ contentType: path.endsWith(".css") ? "text/css" : path.endsWith(".woff2") ? "font/woff2" : "text/javascript", body: files.get(path) });
      });
      await page.goto("http://layout.test/");
      const ru = language === "ru";
      const word = (en, russian) => ru ? russian : en;
      const animations = () => page.evaluate(async () => {
        await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
      });
      const press = async name => { await page.getByRole("button", { name, exact: true }).press("Enter"); await animations(); };
      const mount = async options => {
        await page.evaluate(async options => { window.gallery = await import("/harness.js"); await window.gallery.mount(options); }, { language, ...options });
        await page.locator('.gallery-works[aria-busy="false"], .gallery-warning').first().waitFor();
        await animations();
      };
      // Each state is checked at every size; the state outlives a resize.
      const resize = async viewport => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.waitForFunction(size => document.documentElement.dataset.size === size, viewport.size);
        await animations();
      };
      const everySize = async (state, root, options = {}) => {
        for (const viewport of LAYOUT_VIEWPORTS) {
          await resize(viewport);
          await checkLayout(page, { root, viewport, state: `${language} ${state}`, ...options });
          checked++;
        }
        await page.setViewportSize({ width: 1133, height: 744 }); await page.waitForFunction(() => document.documentElement.dataset.size === "wide"); await animations();
      };
      const gallery = { root: ".coloring-gallery", minimum: 48, scroller: ".gallery-room, .gallery-actions" };
      const workshop = { root: ".coloring-workshop", minimum: 48, large: ".coloring-chooser button, .coloring-error button, .coloring-save button" };
      const result = { root: ".coloring-result", minimum: 60 };

      await mount({}); await everySize("gallery, first visit", gallery.root, gallery);
      await mount({ seed: true }); await everySize("gallery, returning", gallery.root, gallery);

      await press(word("CONTINUE", "ПРОДОЛЖИТЬ")); await page.locator(".coloring-workshop canvas").waitFor(); await animations();
      await everySize("workshop", workshop.root, workshop);
      for (const [picker, name] of [["COLOR", "ЦВЕТ"], ["SIZE", "РАЗМЕР"]]) {
        const label = word(picker, name);
        // An upright iPad keeps the colours open and has no COLOR button.
        for (const viewport of LAYOUT_VIEWPORTS) {
          await resize(viewport);
          const button = page.getByRole("button", { name: label, exact: true });
          if (await button.count() === 0) continue;
          await button.press("Enter"); await animations();
          await checkLayout(page, { ...workshop, viewport, state: `${language} workshop, ${picker} open` }); checked++;
          await page.keyboard.press("Escape"); await animations();
          await page.locator(".coloring-picker-layer").waitFor({ state: "detached" });
        }
      }
      await page.setViewportSize({ width: 1133, height: 744 }); await page.waitForFunction(() => document.documentElement.dataset.size === "wide"); await animations();

      // A failed save waits in its pill on the paper and asks before leaving.
      await press(word("COLOR", "ЦВЕТ")); await press(word("RED", "КРАСНЫЙ")); await press(word("FILL", "ЗАЛИВКА"));
      await page.evaluate(() => window.gallery.writeFailure(true));
      const canvas = await page.locator(".coloring-workshop canvas").boundingBox();
      await page.mouse.click(canvas.x + canvas.width * 420 / 920, canvas.y + canvas.height * 330 / 620);
      // A failed write opens its dialog; KEEP EDITING leaves the pill with RETRY on the paper.
      const dialog = name => page.getByRole("alertdialog", { name, exact: true });
      await dialog(word("COULDN’T SAVE", "НЕ УДАЛОСЬ СОХРАНИТЬ")).waitFor(); await animations();
      await everySize("workshop, save failed", workshop.root, workshop);
      await press(word("KEEP EDITING", "РИСОВАТЬ ДАЛЬШЕ"));
      await page.getByRole("alertdialog").waitFor({ state: "detached" });
      await page.locator(".coloring-save-error button").waitFor(); await animations();
      await everySize("workshop, save failed pill", workshop.root, workshop);
      await press(word("HOME", "ДОМОЙ")); await dialog(word("COULDN’T SAVE", "НЕ УДАЛОСЬ СОХРАНИТЬ")).waitFor(); await animations();
      await press(word("HOME WITHOUT SAVING", "ДОМОЙ БЕЗ СОХРАНЕНИЯ"));
      await dialog(word("LEAVE AND LOSE CHANGES?", "УЙТИ И ПОТЕРЯТЬ ИЗМЕНЕНИЯ?")).waitFor(); await animations();
      await everySize("workshop, leaving loses changes", workshop.root, workshop);
      await press(word("STAY", "ОСТАТЬСЯ")); await press(word("KEEP EDITING", "РИСОВАТЬ ДАЛЬШЕ"));
      await page.getByRole("alertdialog").waitFor({ state: "detached" });
      await page.evaluate(() => window.gallery.writeFailure(false));
      await page.locator(".coloring-save-error button").press("Enter");
      await page.waitForFunction(text => document.querySelector(".coloring-save")?.textContent.includes(text), word("SAVED", "СОХРАНЕНО"));

      await press(word("DONE", "ГОТОВО")); await page.locator(".coloring-result").waitFor(); await animations();
      await everySize("result, new best", result.root, result);
      await page.evaluate(() => window.gallery.readFailure(true));
      await page.locator(".coloring-result-edit").press("Enter"); await page.getByRole("alert").waitFor(); await animations();
      await everySize("result, couldn't open", result.root, result);
      await page.evaluate(() => window.gallery.readFailure(false));
      await page.locator(".coloring-result-edit").press("Enter"); await page.locator(".coloring-workshop canvas").waitFor(); await animations();
      await press(word("DONE", "ГОТОВО")); await page.locator(".coloring-result").waitFor(); await animations();
      assert.equal(await page.locator(".celebration").count(), 0);
      await everySize("result, kept star", result.root, result);

      // Unreadable history: the gallery only shows, and parents may reset it.
      await mount({ seed: true });
      const first = await page.locator("[data-work-id]").first().getAttribute("data-work-id");
      await page.evaluate(id => window.gallery.damage(id, "history"), first); await mount({});
      await everySize("gallery, view only", gallery.root, gallery);
      await page.locator(".gallery-card button").first().press("Enter"); await page.getByRole("dialog").waitFor(); await animations();
      await everySize("gallery, viewing a work", gallery.root, gallery);
      await page.keyboard.press("Escape"); await page.getByRole("dialog").waitFor({ state: "detached" }); await animations();
      await press(word("PARENT RECOVERY", "ДЛЯ РОДИТЕЛЕЙ")); await page.getByRole("dialog").waitFor(); await animations();
      await everySize("gallery, parent recovery", gallery.root, gallery);
      await page.evaluate(() => window.gallery.writeFailure(true));
      await press(word("RESET COLORING", "СБРОСИТЬ РАСКРАСКИ")); await page.locator(".gallery-dialog [role=alert]").waitFor(); await animations();
      await everySize("gallery, parent reset failed", gallery.root, gallery);
      await page.evaluate(() => window.gallery.writeFailure(false));
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(`PASS layout: ${checked} gallery, workshop, picker and result layouts across ${LAYOUT_VIEWPORTS.length} sizes, English with motion and Russian without`);
  } finally { if (browser) await browser.close(); }
})().catch(error => { console.error(error); console.error(`FAIL layout: ${error.message.split("\n")[0]}`); process.exitCode = 1; });
