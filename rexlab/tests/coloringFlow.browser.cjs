// Contract test: released app composition, service-worker offline reload,
// real Canvas/IndexedDB, Home progress and shared input in Chromium.
const assert = require("node:assert/strict");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { chromium } = require("playwright");

(async () => {
  const output = await mkdtemp(join(tmpdir(), "rexlab-coloring-flow-"));
  let server, browser;
  try {
    const { build, preview } = await import("vite");
    const root = resolve(__dirname, "..");
    await build({ root, logLevel: "error", build: { outDir: output } });
    // Preview CORS adds Vary: Origin, unlike the same-origin release host.
    server = await preview({ root, logLevel: "error", build: { outDir: output }, preview: { cors: false, host: "127.0.0.1", port: 0, open: false } });
    const url = server.resolvedUrls.local[0];
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = []; page.on("pageerror", error => { errors.push(error.message); console.error("PAGEERROR", error.message); });
    // Only the storage boundary fails: every screen, session and adapter is real.
    await page.addInitScript(() => {
      // Fix the calendar date without changing pointer or animation clocks.
      const RealDate = Date;
      window.Date = class extends RealDate {
        constructor(...args) { super(...(args.length ? args : ["2026-10-30T12:00:00Z"])); }
        static now() { return RealDate.now(); }
      };
      window.storageFault = null;
      const transaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (...args) {
        if (this.name === "rexlab-coloring" && (window.storageFault === "read" || (window.storageFault === "write" && args[1] === "readwrite"))) throw new Error("Storage unavailable");
        return transaction.apply(this, args);
      };
    });
    const settings = { "rexlab-language": "en", "rexlab-theme": "light", "rexlab-age-level": JSON.stringify({ level: "hatchling", revision: "parent" }) };
    await page.goto(url);
    await page.evaluate(settings => { for (const [key, value] of Object.entries(settings)) localStorage.setItem(key, value); }, settings);
    await page.reload();
    const animations = () => page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
    });
    const press = async name => { await page.getByRole("button", { name, exact: true }).press("Enter"); await animations(); };
    const home = () => page.locator(".home").waitFor();
    const gallery = () => page.locator('.gallery-works[aria-busy="false"]').waitFor();
    const workshop = () => page.locator(".coloring-workshop canvas").waitFor();
    const result = () => page.locator(".coloring-result").waitFor();
    const saved = () => page.waitForFunction(() => document.querySelector(".coloring-save")?.textContent === "SAVED");
    const pixel = () => page.locator("canvas").evaluate(c => [...c.getContext("2d").getImageData(420, 330, 1, 1).data]);
    const records = () => page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => { const r = indexedDB.open("rexlab-coloring"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      try { return await new Promise((resolve, reject) => { const tx = db.transaction("works"); const r = tx.objectStore("works").getAll(); tx.oncomplete = () => resolve(r.result); tx.onabort = () => reject(tx.error); }); }
      finally { db.close(); }
    });
    const starts = () => page.evaluate(() => JSON.parse(localStorage.getItem("rexlab-progress")).games["home-featured"].starts.coloring ?? 0);
    const entry = () => page.getByRole("button", { name: /^(COLOR A DINOSAUR|РАСКРАСЬ ДИНОЗАВРА)$/ });
    const homeCount = async count => {
      await home();
      await page.waitForFunction(count => document.querySelector('.coloring-tile-count, .featured-card[data-game="coloring"] .featured-card-badge')?.textContent === String(count), count);
      assert.equal(await entry().locator("svg.lucide-pencil").count(), 1);
    };
    const paint = async (color, fill = true) => {
      if (await page.getByRole("button", { name: "COLOR", exact: true }).isVisible()) await press("COLOR");
      await press(color); if (fill) await press("FILL");
      await animations(); const box = await page.locator("canvas").boundingBox();
      await page.mouse.move(box.x + box.width * 420 / 920, box.y + box.height * 330 / 620);
      await page.mouse.down(); await page.mouse.up(); await saved();
    };
    await homeCount(0); await entry().press("Enter"); await gallery();
    assert.equal(await starts(), 0);
    // The released worker has installed the complete app before going offline.
    await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === "activated");
    await page.reload(); await homeCount(0); await entry().press("Enter"); await gallery();
    assert(await page.evaluate(() => !!navigator.serviceWorker.controller));
    await context.setOffline(true);
    await press("NEW WORK"); await workshop(); await paint("RED", false);
    assert.equal(await starts(), 1);
    const draft = await records(); const id = draft[0].document.id;
    assert.equal(draft[0].document.actions[0].kind, "stroke");
    await page.reload(); await homeCount(0); await entry().press("Enter"); await gallery(); await press("CONTINUE"); await workshop();
    assert.deepEqual(await pixel(), [239, 83, 80, 255]);
    await paint("BLUE"); await press("DONE"); await result();
    assert.equal(await page.getByText("FIRST BEST!", { exact: true }).count(), 1);
    assert.equal(await page.getByText("+1 STAR", { exact: true }).count(), 1);
    await press("HOME"); await homeCount(1);
    await entry().press("Enter"); await gallery(); await press("CONTINUE"); await workshop();
    // Rotating the host App must keep the active session and undo journal.
    await page.setViewportSize({ width: 768, height: 1024 }); await animations();
    await press("UNDO"); await saved(); assert.deepEqual(await pixel(), [239, 83, 80, 255]);
    assert.equal((await records())[0].document.id, id);
    await press("DONE"); await result();
    assert.equal(await page.locator(".coloring-result-earned, .celebration").count(), 0);
    assert.equal(await starts(), 1);
    await press("NEW WORK"); await workshop(); await paint("GREEN");
    assert.equal(await starts(), 2); assert.equal((await records()).length, 2);
    const independent = (await records()).find(r => r.document.id === id);
    await page.evaluate(() => { window.storageFault = "write"; });
    await press("UNDO"); await page.getByRole("alertdialog").waitFor();
    assert.equal(await page.locator(".coloring-result").count(), 0);
    assert.deepEqual((await records()).find(r => r.document.id === id), independent);
    await press("KEEP EDITING"); await press("HOME"); await page.getByRole("alertdialog").waitFor();
    await press("HOME WITHOUT SAVING"); await press("STAY");
    assert.equal(await page.locator(".coloring-workshop").count(), 1);
    await page.evaluate(() => { window.storageFault = null; }); await press("RETRY"); await homeCount(1);
    await entry().press("Enter"); await gallery(); await press("CONTINUE"); await workshop(); await paint("GREEN");
    await press("DONE"); await result(); assert.equal(await page.locator(".coloring-result-count strong").textContent(), "2");
    assert.equal(await starts(), 2);
    await press("HOME"); await homeCount(2);
    // Both Home presentations read the same durable count after a fresh launch.
    await page.evaluate(() => {
      const key = "rexlab-progress", progress = JSON.parse(localStorage.getItem(key));
      progress.games["home-featured"].featured.game = "coloring"; localStorage.setItem(key, JSON.stringify(progress));
    });
    await page.reload(); await homeCount(2);
    assert.equal(await page.locator('.featured-card[data-game="coloring"]').count(), 1);
    const retained = await page.evaluate(() => ({ ...localStorage }));
    for (const [key, value] of Object.entries(settings)) assert.equal(retained[key], value);
    const otherScores = JSON.parse(retained["rexlab-progress"]).games;
    assert.deepEqual(Object.keys(otherScores), ["home-featured"]);
    await entry().press("Enter"); await gallery();
    await press("HOME"); await page.evaluate(() => { window.storageFault = "read"; });
    await entry().press("Enter"); await gallery(); await page.getByRole("alert").waitFor();
    assert.equal(await page.getByRole("button", { name: "NEW WORK", exact: true }).isDisabled(), true);
    assert.equal(await page.locator(".gallery-empty").count(), 0);
    await page.evaluate(() => { window.storageFault = null; }); await press("RETRY"); await gallery();
    assert.equal(await page.locator(".gallery-earned-star").count(), 2);
    assert.equal(await starts(), 2);
    // Damaged paint keeps its independently recorded star; unsupported reward
    // history disables editing until an explicit parent reset commits.
    const damage = part => page.evaluate(async part => {
      const db = await new Promise((resolve, reject) => { const r = indexedDB.open("rexlab-coloring"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction("works", "readwrite"), store = tx.objectStore("works");
          const cursor = store.openCursor();
          cursor.onsuccess = () => {
            const row = cursor.result.value;
            if (part === "paint") row.document.actions = [null]; else row.history.schema = 99;
            cursor.result.update(row);
          };
          tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
        });
      } finally { db.close(); }
    }, part);
    await damage("paint"); await press("HOME"); await homeCount(2);
    await entry().press("Enter"); await gallery();
    assert.equal(await page.locator(".gallery-unavailable").count(), 1);
    assert.equal(await page.getByRole("button", { name: "NEW WORK", exact: true }).isEnabled(), true);
    await damage("history"); await press("HOME"); await home();
    await page.waitForFunction(() => document.querySelector('.featured-card-badge')?.textContent === "?");
    await entry().press("Enter"); await gallery();
    assert.equal(await page.getByRole("button", { name: "NEW WORK", exact: true }).isDisabled(), true);
    await press("PARENT RECOVERY"); await press("CANCEL");
    assert.equal((await records()).length, 2);
    await press("PARENT RECOVERY");
    await page.evaluate(() => { window.storageFault = "write"; }); await press("RESET COLORING");
    assert.equal(await page.getByText("COULDN’T RESET", { exact: true }).count(), 1);
    assert.equal((await records()).length, 2);
    await page.evaluate(() => { window.storageFault = null; }); await press("RESET COLORING"); await gallery();
    assert.deepEqual(await records(), []);
    await press("NEW WORK"); await workshop(); await paint("RED"); await press("DONE"); await result();
    assert.equal(await page.getByText("FIRST BEST!", { exact: true }).count(), 1);
    assert.equal(await starts(), 3);
    const afterReset = await page.evaluate(() => ({ ...localStorage }));
    for (const [key, value] of Object.entries(settings)) assert.equal(afterReset[key], value);
    assert.deepEqual(errors, []);
    await context.close();

    // Layout contracts use the actual Home route for all age choices and every
    // phone/tablet orientation, language and theme, without a screen harness.
    for (const [width, height] of [[1180, 820], [1024, 768], [768, 1024], [390, 844], [844, 390], [320, 568], [568, 320]]) {
      for (const language of ["en", "ru"]) for (const theme of ["light", "dark"]) for (const creature of ["stegosaurus", "triceratops", "ankylosaurus"]) {
        const level = ["hatchling", "explorer", "paleontologist"][(width + (language === "en" ? 0 : 1) + (theme === "light" ? 0 : 1)) % 3];
        const c = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", serviceWorkers: "block" });
        const p = await c.newPage(); p.setDefaultTimeout(15000);
        try {
          await p.addInitScript(({ language, theme, level }) => {
            localStorage.setItem("rexlab-language", language); localStorage.setItem("rexlab-theme", theme);
            localStorage.setItem("rexlab-age-level", JSON.stringify({ level, revision: "parent" }));
          }, { language, theme, level });
          await p.goto(url); await p.getByRole("button", { name: language === "en" ? "COLOR A DINOSAUR" : "РАСКРАСЬ ДИНОЗАВРА", exact: true }).press("Enter");
          await p.locator('.gallery-works[aria-busy="false"]').waitFor();
          const checkLayout = async () => {
            await p.evaluate(async () => { await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))); });
            const layout = await p.evaluate(() => {
              const screen = document.querySelector('.coloring-gallery, .coloring-workshop, .coloring-result');
              return { scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], boxes: [...screen.querySelectorAll('button, canvas:not([aria-hidden="true"])')].filter(e => e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== "hidden").map(e => { const b = e.getBoundingClientRect(); return { tag: e.tagName, text: e.textContent, picker: !!e.closest(".coloring-chooser"), x: b.x, y: b.y, w: b.width, h: b.height }; }) };
            });
            const details = JSON.stringify({ width, height, language, theme, level, creature, layout });
            assert.deepEqual(layout.scroll, [width, height], details);
            const overflowingLabels = await p.locator(".gallery-new > span").evaluateAll(labels => labels.filter(label => {
              const button = label.closest("button").getBoundingClientRect(), range = document.createRange();
              range.selectNodeContents(label);
              return [...range.getClientRects()].some(b => b.x < button.x - 1 || b.y < button.y - 1 || b.right > button.right + 1 || b.bottom > button.bottom + 1);
            }).map(label => label.textContent));
            assert.deepEqual(overflowingLabels, [], details);
            for (const b of layout.boxes) {
              assert(b.x >= -1 && b.y >= -1 && b.x + b.w <= width + 1 && b.y + b.h <= height + 1, details);
              if (b.tag === "BUTTON") { assert(b.w >= 60 && b.h >= 60, details); assert.equal(b.text, b.text.toUpperCase()); }
              const canvas = layout.boxes.find(b => b.tag === "CANVAS");
              // Temporary tablet pickers cover part of the art; permanent controls stay outside it.
              if (canvas && b.tag === "BUTTON" && !b.picker) assert(b.x + b.w <= canvas.x + 1 || b.x >= canvas.x + canvas.w - 1 || b.y + b.h <= canvas.y + 1 || b.y >= canvas.y + canvas.h - 1, details);
            }
          };
          await checkLayout();
          assert.equal(await p.locator(".gallery-new").count(), 3);
          await p.getByRole("button", { name: creature === "stegosaurus" ? (language === "en" ? "NEW WORK" : "НОВЫЙ РИСУНОК") : creature === "triceratops" ? (language === "en" ? "TRICERATOPS" : "ТРИЦЕРАТОПС") : (language === "en" ? "ANKYLOSAURUS" : "АНКИЛОЗАВР"), exact: true }).press("Enter");
          await p.locator(".coloring-workshop").waitFor(); await checkLayout();
          for (const [label, option, count] of language === "en" ? [["COLOR", "BLUE", 13], ["SIZE", "BRUSH LARGE", 4]] : [["ЦВЕТ", "ГОЛУБОЙ", 13], ["РАЗМЕР", "КИСТЬ БОЛЬШОЙ", 4]]) {
            await p.getByRole("button", { name: label, exact: true }).press("Enter");
            assert.equal(await p.getByRole("dialog").getByRole("button").count(), count);
            await checkLayout(); await p.getByRole("dialog").getByRole("button", { name: option, exact: true }).press("Enter");
          }
          await p.getByRole("button", { name: language === "en" ? "FILL" : "ЗАЛИВКА", exact: true }).press("Enter");
          const box = await p.locator("canvas").boundingBox();
          const [x, y, region, geometry] = creature === "stegosaurus" ? [420, 330, "body", "stegosaurus-production-1"] : creature === "ankylosaurus" ? [454, 384, "armor-6", "ankylosaurus-production-1"] : level === "hatchling" ? [280, 360, "body", "triceratops-production-1"] : [424, 370, "flank", "triceratops-explorer-1"];
          await p.mouse.click(box.x + box.width * x / 920, box.y + box.height * y / 620);
          await p.waitForFunction(() => /^(SAVED|СОХРАНЕНО)$/.test(document.querySelector(".coloring-save")?.textContent));
          const documents = await p.evaluate(async () => {
            const db = await new Promise(resolve => { const r = indexedDB.open("rexlab-coloring"); r.onsuccess = () => resolve(r.result); });
            try { return await new Promise((resolve, reject) => {
              const tx = db.transaction("works"), r = tx.objectStore("works").getAll();
              tx.oncomplete = () => resolve(r.result.map(row => row.document)); tx.onabort = () => reject(tx.error);
            }); } finally { db.close(); }
          });
          assert.equal(documents.length, 1);
          assert.equal(documents[0].geometry, geometry);
          assert.deepEqual(documents[0].actions, [{ kind: "fill", color: "#42a5f5", region }]);
          await p.getByRole("button", { name: language === "en" ? "DONE" : "ГОТОВО", exact: true }).press("Enter");
          await p.locator(".coloring-result").waitFor(); await checkLayout();
          assert.equal(await p.locator("canvas").evaluate(e => getComputedStyle(e).animationName), "fade-in");
          assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem("rexlab-age-level")).level), level);
          const edit = await p.getByRole("button", { name: language === "en" ? "EDIT" : "ЕЩЁ РИСОВАТЬ", exact: true }).boundingBox();
          await p.getByRole("button", { name: language === "en" ? "EDIT" : "ЕЩЁ РИСОВАТЬ", exact: true }).evaluate(e => Promise.all(document.getAnimations().map(a => a.finished)));
          await p.mouse.dblclick(edit.x + edit.width / 2, edit.y + edit.height / 2, { delay: 30 });
          await p.locator(".coloring-workshop").waitFor();
          assert.equal(await p.locator(".coloring-save").textContent(), language === "en" ? "SAVED" : "СОХРАНЕНО");
        } finally { await c.close(); }
      }
    }
    console.log("PASS coloring flow: production Home/counts/starts, offline reload, draw/restore/reedit, independent rewards, storage retry/loss, rotation, double taps and 84 creature/device/language/theme layouts with age-selected artwork");
  } finally {
    try { await browser?.close(); }
    finally {
      try { if (server) { server.httpServer.closeAllConnections(); await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve())); } }
      finally { await rm(output, { recursive: true, force: true }); }
    }
  }
})().catch(error => { console.error(error); console.error(`FAIL coloring flow: ${error.message.split("\n")[0]}`); process.exitCode = 1; });
