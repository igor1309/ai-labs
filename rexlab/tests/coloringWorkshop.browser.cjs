// Contract test: production React screen, Canvas pixels, pointer capture,
// shared root tap filtering, layout and durable IndexedDB in Chromium.
const assert = require("node:assert/strict");
const { resolve, join } = require("node:path");
const { mkdir } = require("node:fs/promises");
const { chromium } = require("playwright");

(async () => {
  let browser;
  try {
    const { build } = await import("vite");
    const react = (await import("@vitejs/plugin-react")).default;
    const root = resolve(__dirname, "..");
    const bundle = await build({ root, configFile: false, logLevel: "error", plugins: [react()],
      build: { write: false, rolldownOptions: { preserveEntrySignatures: "strict", input: resolve(__dirname, "coloringWorkshopHarness.tsx"), output: { entryFileNames: "harness.js" } } } });
    const files = new Map(bundle.output.map(file => [file.fileName, file.type === "chunk" ? file.code : file.source]));
    const css = [...files.keys()].filter(name => name.endsWith(".css"));
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("http://workshop.test/**", route => {
      const path = new URL(route.request().url()).pathname.slice(1);
      if (!path) return route.fulfill({ contentType: "text/html", body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Workshop contract</title>${css.map(name => `<link rel="stylesheet" href="/${name}">`).join("")}` });
      assert(files.has(path), `Missing browser module ${path}`);
      return route.fulfill({ contentType: path.endsWith(".css") ? "text/css" : "text/javascript", body: files.get(path) });
    });
    await page.goto("http://workshop.test/");
    const mount = options => page.evaluate(async options => { window.workshop = await import("/harness.js"); await window.workshop.mount(options); document.getAnimations().forEach(animation => animation.finish()); }, options);
    const state = () => page.evaluate(() => window.workshop.snapshot());
    const settle = async () => { await page.evaluate(() => window.workshop.settled()); await page.waitForFunction(() => !document.querySelector('[role="status"]').textContent.includes("SAVING")); };
    const chooseColor = async name => {
      await page.getByRole("button", { name: "COLOR", exact: true }).press("Enter");
      await page.getByRole("dialog").getByRole("button", { name, exact: true }).press("Enter");
    };
    const finishAnimations = () => page.evaluate(() => document.getAnimations().forEach(animation => animation.finish()));
    const canvas = page.locator("canvas");
    const coords = async (x, y) => {
      const box = await canvas.boundingBox();
      return { x: box.x + x * box.width / 920, y: box.y + y * box.height / 620 };
    };
    const pointer = (target, kind, id, x, y, time) => page.evaluate(({ target, kind, id, x, y, time }) => {
      const element = target === "canvas" ? document.querySelector("canvas") : document.querySelector(target);
      const event = new PointerEvent(kind, { pointerId: id, clientX: x, clientY: y, button: 0, pointerType: "touch", bubbles: true, cancelable: true });
      Object.defineProperty(event, "timeStamp", { value: time });
      // Synthetic events do not own native capture; the real mouse stroke does.
      const surface = document.querySelector("canvas");
      surface.setPointerCapture = () => {}; surface.hasPointerCapture = () => false;
      element.dispatchEvent(event);
    }, { target, kind, id, x, y, time });
    const tap = async (x, y, time, id = 1) => {
      const p = await coords(x, y);
      await pointer("canvas", "pointerdown", id, p.x, p.y, time);
      await pointer("canvas", "pointerup", id, p.x, p.y, time + 30);
    };
    const pixel = (x, y) => page.evaluate(({ x, y }) => [...document.querySelector("canvas").getContext("2d").getImageData(x, y, 1, 1).data], { x, y });

    await mount({ id: "drawing" });
    assert.equal(await page.getByRole("button", { name: "DONE", exact: true }).isDisabled(), true);
    await page.getByRole("button", { name: "COLOR", exact: true }).press("Enter");
    assert.equal(await page.getByRole("group", { name: "COLOR", exact: true }).getByRole("button").count(), 12);
    await page.keyboard.press("Escape");
    // Real mouse captures a stroke starting outside and crossing the silhouette.
    const start = await coords(0, 330), end = await coords(420, 330);
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.up(); await settle();
    assert.deepEqual(await pixel(420, 330), [239, 83, 80, 255]);
    assert.equal((await pixel(1, 330))[3], 0);
    assert.equal((await state()).work.actions.length, 1);
    // Fill replaces prior brush, uniform refill is a no-op, undo restores it.
    await chooseColor("BLUE");
    await page.getByRole("button", { name: "FILL", exact: true }).press("Enter");
    await tap(420, 330, 10000); await settle();
    assert.deepEqual(await pixel(80, 302), [66, 165, 245, 255]);
    await tap(420, 330, 11000); await settle();
    assert.equal((await state()).work.revision, 2);
    await page.getByRole("button", { name: "UNDO", exact: true }).press("Enter"); await settle();
    assert.deepEqual(await pixel(420, 330), [239, 83, 80, 255]);
    await page.reload(); await mount({ id: "drawing", resume: true });
    assert.equal((await state()).work.revision, 3);
    assert.deepEqual(await pixel(420, 330), [239, 83, 80, 255]);
    await page.getByRole("button", { name: "UNDO", exact: true }).press("Enter"); await settle();
    assert.equal(await page.getByRole("button", { name: "DONE", exact: true }).isDisabled(), true);
    assert.equal((await state()).work.id, "drawing");
    await tap(420, 330, 20000); await settle();
    await page.getByRole("button", { name: "DONE", exact: true }).press("Enter"); await settle();
    assert.deepEqual(await page.evaluate(() => window.workshop.departures().map(n => [n.destination, n.work.completed, n.work.rewarded])), [["result", true, true]]);
    await page.reload(); await mount({ id: "drawing", resume: true });
    await page.getByRole("button", { name: "UNDO", exact: true }).press("Enter"); await settle();
    assert.equal((await state()).work.completed, true);
    assert.equal((await state()).work.actions.length, 0);

    // Double taps are filtered; a drag opens no double-tap window.
    await mount({ id: "contacts" });
    await tap(420, 330, 30000); await settle();
    await chooseColor("BLUE");
    await tap(420, 330, 30200); await settle();
    assert.equal((await state()).work.revision, 1);
    let p = await coords(420, 330), q = await coords(500, 350);
    await pointer("canvas", "pointerdown", 1, p.x, p.y, 31000);
    await pointer("canvas", "pointermove", 1, q.x, q.y, 31030);
    // Controls and extra fingers stay ignored even after the active finger ends.
    await pointer('button[aria-label="FILL"]', "pointerdown", 2, q.x + 20, q.y, 31040);
    await page.getByRole("button", { name: "FILL", exact: true }).evaluate(el => el.click());
    await pointer("canvas", "pointerup", 1, q.x, q.y, 31060); await settle();
    await pointer('button[aria-label="FILL"]', "pointerup", 2, q.x + 20, q.y, 31070);
    await page.getByRole("button", { name: "FILL", exact: true }).evaluate(el => el.dispatchEvent(new PointerEvent("click", { pointerId: 2, bubbles: true, cancelable: true })));
    assert.equal(await page.getByRole("button", { name: "BRUSH", exact: true }).getAttribute("aria-pressed"), "true");
    await chooseColor("RED");
    await tap(500, 350, 31100); await settle();
    assert.equal((await state()).work.revision, 3);
    // Every interruption discards preview, without a revision or an undo entry.
    for (const interruption of ["pointercancel", "lostpointercapture", "resize", "orientationchange", "blur", "visibilitychange"]) {
      p = await coords(440, 100);
      await pointer("canvas", "pointerdown", 1, p.x, p.y, 33000);
      assert.notDeepEqual(await pixel(440, 100), [255, 240, 207, 255]);
      if (interruption === "pointercancel" || interruption === "lostpointercapture") await pointer("canvas", interruption, 1, p.x, p.y, 33050);
      else await page.evaluate(type => {
        if (type === "visibilitychange") Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
        (type === "visibilitychange" ? document : window).dispatchEvent(new Event(type));
      }, interruption);
      assert.deepEqual(await pixel(440, 100), [255, 240, 207, 255]);
      assert.equal((await state()).work.revision, 3);
    }

    // Delayed/error UI exercises genuine paint and the session's storage seam.
    await page.reload(); await mount({ id: "failures", gate: true });
    await tap(420, 330, 40000);
    await page.waitForFunction(() => window.workshop.writeCount() === 1);
    assert.match(await page.getByRole("status").textContent(), /SAVING/);
    await page.getByRole("button", { name: "DONE", exact: true }).press("Enter");
    assert.equal(await page.getByRole("button", { name: "UNDO", exact: true }).isDisabled(), true);
    await page.evaluate(() => window.workshop.fail()); await page.evaluate(() => window.workshop.settled());
    await page.getByRole("alertdialog").waitFor();
    assert.deepEqual(await pixel(420, 330), [239, 83, 80, 255]);
    assert.equal((await state()).work.completed, false);
    await page.getByRole("button", { name: "HOME WITHOUT SAVING", exact: true }).press("Enter");
    await page.getByRole("button", { name: "STAY", exact: true }).press("Enter");
    assert.deepEqual(await page.evaluate(() => window.workshop.departures()), []);
    await page.getByRole("button", { name: "KEEP EDITING", exact: true }).press("Enter");
    assert.match(await page.getByRole("status").textContent(), /COULDN’T SAVE/);
    await page.getByRole("button", { name: "GALLERY", exact: true }).press("Enter");
    await page.getByRole("button", { name: "RETRY", exact: true }).press("Enter");
    await page.waitForFunction(() => window.workshop.writeCount() === 2);
    await page.evaluate(() => window.workshop.release()); await settle();
    assert.deepEqual(await page.evaluate(() => window.workshop.departures().map(n => n.destination)), ["gallery"]);
    assert.equal((await state()).work.completed, false);

    // Each layout preserves full touch targets and the canvas aspect ratio.
    const viewports = [
      { width: 1133, height: 744 }, { width: 1024, height: 768 },
      { width: 1133, height: 650 }, { width: 1024, height: 600 },
      { width: 1024, height: 480 }, { width: 1180, height: 820 },
      { width: 744, height: 1133 }, { width: 768, height: 1024 },
      { width: 393, height: 852 }, { width: 852, height: 393 },
      { width: 320, height: 568 }, { width: 568, height: 320 }
    ];
    const screenshotDir = process.env.COLORING_SCREENSHOT_DIR;
    if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
    let layoutId = 0;
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      const landscape = viewport.width > viewport.height;
      const tabletRail = landscape && viewport.width >= 900 && viewport.height >= 480;
      const singleRail = tabletRail && viewport.height - 64 >= 704;
      for (const language of ["en", "ru"]) for (const theme of ["light", "dark"]) {
        await mount({ id: `layout-${++layoutId}`, language, theme, gate: true });
        const layout = await page.evaluate(() => {
          const box = element => {
            const r = element.getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height };
          };
          const paper = document.querySelector(".coloring-paper");
          return {
            scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
            canvas: box(document.querySelector("canvas")), body: box(document.querySelector(".coloring-body")),
            nav: box(document.querySelector(".coloring-navigation")), dock: box(document.querySelector(".coloring-tools")),
            titles: [...document.querySelectorAll("h1, h2")].filter(el => getComputedStyle(el).display !== "none").length,
            buttons: [...document.querySelectorAll("button")].filter(b => b.getBoundingClientRect().width > 0).map(b => ({
              ...box(b), name: b.getAttribute("aria-label"), text: b.innerText,
              background: getComputedStyle(b).backgroundColor, dock: !!b.closest(".coloring-tools")
            })),
            background: getComputedStyle(paper).backgroundColor, border: getComputedStyle(paper).borderTopWidth
          };
        });
        const context = JSON.stringify({ viewport, language, theme, layout });
        const status = page.getByRole("status");
        assert.equal(await status.textContent(), "", context);
        assert.equal(await status.locator("svg").count(), 0, context);
        assert.equal(await page.getByText(/LET’S PAINT!|ДАВАЙ РИСОВАТЬ!/).count(), 0, context);
        const separate = (a, b) => a.x + a.w <= b.x + 1 || b.x + b.w <= a.x + 1 || a.y + a.h <= b.y + 1 || b.y + b.h <= a.y + 1;
        assert.deepEqual(layout.scroll, [viewport.width, viewport.height], context);
        assert(layout.canvas.w > 80 && layout.canvas.h > 50, context);
        assert(Math.abs(layout.canvas.w / layout.canvas.h - 920 / 620) < .01, context);
        assert.equal(layout.background, landscape ? "rgba(0, 0, 0, 0)" : theme === "dark" ? "rgb(24, 30, 46)" : "rgb(255, 253, 248)", context);
        assert.equal(layout.buttons.length, 9, context);
        const names = language === "en" ? ["HOME", "NEW WORK", "GALLERY", "DONE", "COLOR", "BRUSH", "FILL", "SIZE", "UNDO"] : ["ДОМОЙ", "НОВЫЙ РИСУНОК", "ГАЛЕРЕЯ", "ГОТОВО", "ЦВЕТ", "КИСТЬ", "ЗАЛИВКА", "РАЗМЕР", "ОТМЕНИТЬ"];
        assert.deepEqual(layout.buttons.map(b => b.name), names, context);
        for (const name of names) assert.equal(await page.getByRole("button", { name, exact: true }).count(), 1, context);
        for (const button of layout.buttons) {
          assert(button.w >= 60 && button.h >= 60 && button.x >= 0 && button.y >= 0 && button.x + button.w <= viewport.width + 1 && button.y + button.h <= viewport.height + 1, context);
          assert(separate(button, layout.canvas), context);
        }
        for (let i = 0; i < layout.buttons.length; i++) for (const b of layout.buttons.slice(i + 1)) assert(separate(layout.buttons[i], b), context);
        const navButtons = layout.buttons.filter(b => !b.dock);
        const dockButtons = layout.buttons.filter(b => b.dock);
        assert.equal(new Set(navButtons.map(b => b.background)).size, 4, context);
        const navigationColors = theme === "dark"
          ? ["rgb(81, 69, 44)", "rgb(70, 56, 93)", "rgb(41, 71, 93)", "rgb(242, 178, 75)"]
          : ["rgb(232, 217, 183)", "rgb(219, 208, 239)", "rgb(205, 226, 242)", "rgb(227, 155, 45)"];
        assert.deepEqual(navButtons.map(b => b.background), navigationColors, context);
        if (landscape) {
          assert.equal(layout.titles, 0, context);
          assert.equal(layout.border, "0px", context);
          for (const b of navButtons) {
            assert.equal(b.text, "", context);
            assert.equal(b.w, 60, context); assert.equal(b.h, 60, context);
          }
        }
        if (tabletRail) {
          assert(layout.nav.x + layout.nav.w < layout.canvas.x && layout.dock.x + layout.dock.w < layout.canvas.x, context);
          assert(layout.dock.y - layout.nav.y - layout.nav.h >= 20, context);
          const topClearance = layout.nav.y;
          const bottomClearance = viewport.height - layout.dock.y - layout.dock.h;
          assert(Math.abs(topClearance - bottomClearance) < 1, context);
          assert(topClearance >= 32 && bottomClearance >= 32, context);
          assert.equal(layout.body.y, viewport.height < 600 ? 8 : 32, context);
          assert.equal(layout.body.h, viewport.height - (viewport.height < 600 ? 16 : 64), context);
          assert.equal(new Set(navButtons.map(b => b.x)).size, singleRail ? 1 : 2, context);
          assert.equal(new Set(dockButtons.slice(0, 4).map(b => b.x)).size, singleRail ? 1 : 2, context);
          const undo = dockButtons[4];
          assert(Math.abs(undo.x + undo.w / 2 - layout.dock.x - layout.dock.w / 2) < 1, context);
          assert(layout.canvas.h >= viewport.height * .75, context);
          assert(Math.abs(layout.canvas.h - Math.min(layout.body.h, layout.body.w * 620 / 920)) < 1, context);
        } else {
          assert.equal(layout.dock.h, 60, context);
          assert(layout.dock.y >= layout.canvas.y + layout.canvas.h, context);
        }
        const trigger = page.getByRole("button", { name: names[4], exact: true });
        const originalCanvas = await canvas.elementHandle();
        const originalBox = await canvas.boundingBox();
        if (screenshotDir && viewport.width === 1133 && viewport.height === 744 && language === "en") {
          await page.screenshot({ path: join(screenshotDir, `ipad-mini-landscape-${theme}.png`) });
        }
        await trigger.press("Enter"); await finishAnimations();
        const dialog = page.getByRole("dialog");
        assert.equal(await dialog.getByRole("button").count(), 13);
        assert.deepEqual(await canvas.boundingBox(), originalBox, context);
        assert(await page.evaluate(original => original === document.querySelector("canvas"), originalCanvas), context);
        assert(await dialog.evaluate(el => el.contains(document.activeElement)), context);
        for (const selector of [".coloring-navigation", ".coloring-tools", ".coloring-canvas-space"]) assert.equal(await page.locator(selector).evaluate(el => el.inert), true);
        const picker = await dialog.boundingBox();
        assert(picker.x >= 0 && picker.y >= 0 && picker.x + picker.width <= viewport.width && picker.y + picker.height <= viewport.height, context);
        if (viewport.width >= 600 && viewport.height >= 480) {
          assert.equal(await canvas.evaluate(el => getComputedStyle(el.closest(".coloring-paper")).visibility), "visible", context);
          if (tabletRail) assert(picker.x >= layout.nav.x + layout.nav.w && picker.x <= layout.body.x + 1, context);
          assert(picker.width < originalBox.width / 2, context);
        }
        for (const button of await dialog.getByRole("button").all()) {
          const r = await button.boundingBox();
          assert(r && r.width === 60 && r.height === 60 && r.x >= 0 && r.y >= 0 && r.x + r.width <= viewport.width + 1 && r.y + r.height <= viewport.height + 1, context);
        }
        const cells = await Promise.all((await dialog.getByRole("group").getByRole("button").all()).map(b => b.boundingBox()));
        assert.equal(new Set(cells.map(r => r.x)).size, landscape && !tabletRail ? 6 : 4, context);
        assert.equal(new Set(cells.map(r => r.y)).size, landscape && !tabletRail ? 2 : 3, context);
        if (screenshotDir && viewport.width === 1133 && viewport.height === 744 && language === "en") {
          await page.screenshot({ path: join(screenshotDir, `ipad-mini-color-picker-${theme}.png`) });
        }
        const dialogButtons = await dialog.getByRole("button").all();
        await dialogButtons.at(-1).focus(); await page.keyboard.press("Tab");
        assert(await dialogButtons[0].evaluate(el => el === document.activeElement));
        await page.keyboard.press("Shift+Tab");
        assert(await dialogButtons.at(-1).evaluate(el => el === document.activeElement));
        await tap(420, 330, 50000 + layoutId * 1000);
        assert.equal((await state()).work.revision, 0);
        await dialog.getByRole("button", { name: language === "en" ? "BLUE" : "ГОЛУБОЙ", exact: true }).press("Enter");
        assert.equal(await dialog.count(), 0);
        assert(await trigger.evaluate(el => el === document.activeElement));
        assert.equal(await trigger.locator(".coloring-swatch").evaluate(el => el.style.backgroundColor), "rgb(66, 165, 245)");
        assert.equal((await state()).work.revision, 0);
        await trigger.press("Enter");
        await dialog.getByRole("button", { name: language === "en" ? "CLOSE" : "ЗАКРЫТЬ", exact: true }).press("Enter");
        const sizeTrigger = page.getByRole("button", { name: names[7], exact: true });
        await page.getByRole("button", { name: names[6], exact: true }).press("Enter");
        await sizeTrigger.press("Enter");
        assert.equal(await dialog.getByRole("button").count(), 4);
        for (const button of await dialog.getByRole("button").all()) {
          const r = await button.boundingBox();
          assert(r && r.width === 60 && r.height === 60 && r.x >= 0 && r.y >= 0 && r.x + r.width <= viewport.width + 1 && r.y + r.height <= viewport.height + 1, context);
        }
        if (screenshotDir && viewport.width === 1133 && viewport.height === 744 && language === "en") {
          await finishAnimations();
          await page.screenshot({ path: join(screenshotDir, `ipad-mini-size-picker-${theme}.png`) });
        }
        await dialog.getByRole("button", { name: language === "en" ? "BRUSH LARGE" : "КИСТЬ БОЛЬШОЙ", exact: true }).press("Enter");
        assert.equal(await dialog.count(), 0);
        assert.equal((await state()).work.revision, 0);
        assert.deepEqual((await state()).work.actions, []);
        assert.deepEqual(await canvas.boundingBox(), originalBox, context);
        assert(await sizeTrigger.evaluate(el => el === document.activeElement));
        assert.equal(await page.getByRole("button", { name: names[5], exact: true }).getAttribute("aria-pressed"), "true");
        assert.equal(await page.getByRole("button", { name: names[6], exact: true }).getAttribute("aria-pressed"), "false");
        // The storage gate holds saving until the test releases it.
        await tap(420, 330, 100000 + layoutId * 1000);
        await page.waitForFunction(() => window.workshop.writeCount() === 1);
        assert.equal((await state()).save, "saving", context);
        assert.equal(await status.textContent(), language === "en" ? "SAVING" : "СОХРАНЯЕМ", context);
        assert.deepEqual(await canvas.boundingBox(), originalBox, context);
        if (landscape) {
          const routine = await status.boundingBox();
          assert(routine.width <= 1 && routine.height <= 1, context);
          assert.equal(await status.evaluate(el => getComputedStyle(el).clipPath), "inset(50%)", context);
        }
        await page.evaluate(() => window.workshop.release()); await settle();
        assert.equal((await state()).save, "saved", context);
        assert.equal(await status.textContent(), language === "en" ? "SAVED" : "СОХРАНЕНО", context);
        assert.deepEqual(await canvas.boundingBox(), originalBox, context);
        assert(await page.evaluate(original => original === document.querySelector("canvas"), originalCanvas), context);
        await originalCanvas.dispose();
      }
    }
    // Synthetic CSS insets exercise the layout budget, not Safari's system chrome.
    for (const viewport of [{ width: 1133, height: 744 }, { width: 1180, height: 820 }, { width: 1180, height: 768 }, { width: 1024, height: 480 }]) {
      await page.setViewportSize(viewport);
      await mount({ id: `safe-area-${viewport.width}-${viewport.height}` });
      await page.locator(".coloring-workshop").evaluate(el => {
        el.style.setProperty("--coloring-safe-top", "24px");
        el.style.setProperty("--coloring-safe-bottom", "20px");
      });
      const nav = await page.locator(".coloring-navigation").boundingBox();
      const tools = await page.locator(".coloring-tools").boundingBox();
      const topClearance = nav.y - 24, bottomClearance = viewport.height - 20 - tools.y - tools.height;
      const context = JSON.stringify({ viewport, nav, tools, topClearance, bottomClearance });
      assert(Math.abs(topClearance - bottomClearance) < 1, context);
      assert(topClearance >= 24 && bottomClearance >= 24, context);
      const columns = await page.locator(".coloring-navigation button").evaluateAll(buttons => new Set(buttons.map(b => b.getBoundingClientRect().x)).size);
      assert.equal(columns, viewport.height === 820 ? 1 : 2, context);
    }
    // Error status and retry remain visible and usable beside phone/tablet pickers.
    for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 1133, height: 744 }, { width: 1024, height: 480 }]) {
      await page.setViewportSize(viewport);
      for (const language of ["en", "ru"]) for (const theme of ["light", "dark"]) {
        await mount({ id: `error-picker-${viewport.width}-${language}-${theme}`, gate: true, language, theme });
        await tap(420, 330, 205000);
        await page.waitForFunction(() => window.workshop.writeCount() === 1);
        await page.evaluate(() => window.workshop.fail());
        const alert = page.getByRole("alertdialog");
        await alert.waitFor(); await finishAnimations();
        const withinViewport = async locator => {
          const r = await locator.boundingBox();
          assert(r && r.x >= 0 && r.y >= 0 && r.x + r.width <= viewport.width + 1 && r.y + r.height <= viewport.height + 1, JSON.stringify({ viewport, language, theme, r }));
          return r;
        };
        await withinViewport(alert);
        await withinViewport(alert.getByRole("button", { name: language === "en" ? "RETRY" : "ПОВТОРИТЬ", exact: true }));
        await alert.getByRole("button", { name: language === "en" ? "KEEP EDITING" : "РИСОВАТЬ ДАЛЬШЕ", exact: true }).press("Enter");
        const status = page.getByRole("status");
        assert.match(await status.textContent(), language === "en" ? /COULDN’T SAVE/ : /НЕ УДАЛОСЬ СОХРАНИТЬ/);
        const retry = status.getByRole("button", { name: language === "en" ? "RETRY" : "ПОВТОРИТЬ", exact: true });
        const r = await withinViewport(retry);
        await withinViewport(status);
        assert(r.width >= 60 && r.height >= 60);
        assert(await retry.evaluate(el => {
          const r = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        }));
        for (const name of language === "en" ? ["COLOR", "SIZE"] : ["ЦВЕТ", "РАЗМЕР"]) {
          await page.getByRole("button", { name, exact: true }).press("Enter"); await finishAnimations();
          for (const button of await page.getByRole("dialog").getByRole("button").all()) {
            const r = await withinViewport(button);
            assert(r.width === 60 && r.height === 60);
          }
          await page.keyboard.press("Escape");
        }
        await retry.click();
        await page.waitForFunction(() => window.workshop.writeCount() === 2);
        assert.match(await status.textContent(), language === "en" ? /SAVING.*COULDN’T SAVE/ : /СОХРАНЯЕМ.*НЕ УДАЛОСЬ СОХРАНИТЬ/);
        await withinViewport(status);
        await page.evaluate(() => window.workshop.release()); await settle();
        assert.equal(await status.textContent(), language === "en" ? "SAVED" : "СОХРАНЕНО");
        assert.equal(await retry.count(), 0);
        assert.equal((await state()).work.revision, 1);
        assert.deepEqual(await pixel(420, 330), [239, 83, 80, 255]);
      }
    }
    // Rotation closes a picker without replacing the canvas or saved paint.
    await page.setViewportSize({ width: 1133, height: 744 });
    await mount({ id: "rotation" });
    await tap(420, 330, 110000); await settle();
    const saved = await state();
    const surface = await canvas.elementHandle();
    for (const viewport of [{ width: 744, height: 1133 }, { width: 1024, height: 600 }, { width: 568, height: 320 }, { width: 1133, height: 744 }]) {
      await page.getByRole("button", { name: "COLOR", exact: true }).press("Enter");
      await page.setViewportSize(viewport);
      await page.getByRole("dialog").waitFor({ state: "detached" });
      assert(await page.getByRole("button", { name: "COLOR", exact: true }).evaluate(el => el === document.activeElement));
      assert(await page.evaluate(original => original === document.querySelector("canvas"), surface));
      assert.deepEqual((await state()).work, saved.work);
      assert.deepEqual(await pixel(420, 330), [239, 83, 80, 255]);
    }
    await surface.dispose();
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--motion-amount").trim()), "0");
    assert.deepEqual(errors, []);
    if (process.env.COLORING_SCREENSHOT) await page.screenshot({ path: process.env.COLORING_SCREENSHOT });
    console.log("PASS workshop: production paint/restore/undo/completion, tap safety, contact isolation/cancellation, save failures/retry, 48 RU/EN/theme layouts, centered safe-area tablet rails, idle status absence, stable save-state canvas, color/size popovers, focus, rotation, error status and reduced motion");
  } finally { if (browser) await browser.close(); }
})().catch(error => { console.error(error); console.error(`FAIL workshop: ${error.message.split("\n")[0]}`); process.exitCode = 1; });
