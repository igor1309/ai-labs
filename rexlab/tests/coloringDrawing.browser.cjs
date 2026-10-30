// Contract test: production workshop composition and long coalesced contacts in Chromium.
const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { writeFileSync } = require("node:fs");
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
    await page.route("http://drawing.test/**", route => {
      const path = new URL(route.request().url()).pathname.slice(1);
      if (!path) return route.fulfill({ contentType: "text/html", body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">${css.map(name => `<link rel="stylesheet" href="/${name}">`).join("")}` });
      assert(files.has(path), `Missing browser module ${path}`);
      return route.fulfill({ contentType: path.endsWith(".css") ? "text/css" : "text/javascript", body: files.get(path) });
    });
    await page.goto("http://drawing.test/");
    await page.evaluate(async () => {
      window.workshop = await import("/harness.js");
      const colors = ["#42a5f5", "#9ccc65", "#ff9345"];
      const history = Array.from({ length: 60 }, (_, stroke) => ({ kind: "stroke", color: colors[stroke % 3], size: 20,
        points: Array.from({ length: 80 }, (_, i) => ({ x: 180 + i * 5, y: 210 + stroke * 4 + Math.sin(i / 7) * 30 })) }));
      history.splice(30, 0, { kind: "fill", color: "#ffd84a", region: "body" });
      await window.workshop.mount({ id: "long-contact", history });
      document.getAnimations().forEach(animation => animation.finish());
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.start");
    const result = await page.evaluate(async () => {
      const surface = document.querySelector("canvas");
      const box = surface.getBoundingClientRect();
      const width = surface.width, height = surface.height;
      surface.setPointerCapture = () => {}; surface.hasPointerCapture = () => false;
      let time = 10000;
      const points = [];
      const send = (kind, point, coalesced = []) => {
        const event = new PointerEvent(kind, { pointerId: 1, pointerType: "pen", button: 0, bubbles: true, cancelable: true,
          clientX: box.left + point.x * box.width / width, clientY: box.top + point.y * box.height / height });
        Object.defineProperty(event, "timeStamp", { value: time++ });
        Object.defineProperty(event, "getCoalescedEvents", { value: () => coalesced.map(p => ({ clientX: box.left + p.x * box.width / width, clientY: box.top + p.y * box.height / height })) });
        surface.dispatchEvent(event);
      };
      const durations = [], frames = [];
      const first = { x: 190, y: 320 }; points.push(first);
      send("pointerdown", first);
      let arcs = 0, previewFrames = 0, dispatching = false;
      const paintDurations = [];
      const arc = Path2D.prototype.arc, request = window.requestAnimationFrame;
      Path2D.prototype.arc = function (...args) { arcs++; return arc.apply(this, args); };
      window.requestAnimationFrame = callback => {
        if (!dispatching) return request.call(window, callback);
        previewFrames++;
        return request.call(window, time => {
          const start = performance.now(); callback(time); paintDurations.push(performance.now() - start);
        });
      };
      // 2,048 saved samples, 256 dispatched moves, two moves per display frame.
      for (let frame = 0; frame < 128; frame++) {
        const frameStart = performance.now();
        for (let move = 0; move < 2; move++) {
          const samples = Array.from({ length: 8 }, (_, j) => {
            const i = frame * 16 + move * 8 + j + 1;
            return { x: 190 + (i % 512) * 0.8, y: 320 + Math.sin(i / 35) * 65 + Math.floor(i / 512) * 8 };
          });
          points.push(...samples);
          dispatching = true;
          const start = performance.now(); send("pointermove", samples.at(-1), samples);
          durations.push(performance.now() - start);
          dispatching = false;
        }
        await new Promise(resolve => requestAnimationFrame(() => resolve()));
        // Flush Canvas commands without changing the display canvas's readback policy.
        surface.getContext("2d").getImageData(0, 0, 1, 1);
        frames.push(performance.now() - frameStart);
      }
      const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.floor(values.length * p)];
      const preview = surface.getContext("2d").getImageData(0, 0, width, height).data;
      Path2D.prototype.arc = arc; window.requestAnimationFrame = request;
      const final = { x: 620, y: 350 };
      const releaseStart = performance.now();
      send("pointerup", final);
      const releaseMs = performance.now() - releaseStart;
      await window.workshop.settled();
      const work = window.workshop.snapshot().work;
      const action = work.actions.at(-1);
      const painter = window.workshop.createPainter(() => document.createElement("canvas"));
      const replay = painter.canvas(width, height);
      painter.render(replay, [...work.actions.slice(0, -1), { ...action, points: action.points.slice(0, -1) }]);
      const expected = painter.pixels(replay);
      const exactPreview = preview.every((value, i) => value === expected[i]);
      return { width, height, history: work.actions.length - 1, samples: action.points.length, releaseMs,
        arcs, previewFrames, exactPreview,
        final: action.points.at(-1), moves: { p50: percentile(durations, 0.5), p95: percentile(durations, 0.95), max: Math.max(...durations) },
        paint: { p50: percentile(paintDurations, 0.5), p95: percentile(paintDurations, 0.95), max: Math.max(...paintDurations) },
        frames: { p50: percentile(frames, 0.5), p95: percentile(frames, 0.95), max: Math.max(...frames) }, previewBytes: preview.length,
        expectedSamples: points.length + 1 };
    });
    const { profile } = await cdp.send("Profiler.stop");
    if (process.env.COLORING_CPU_PROFILE) writeFileSync(process.env.COLORING_CPU_PROFILE, JSON.stringify(profile));
    assert.equal(result.samples, result.expectedSamples);
    assert.equal(result.exactPreview, true, "long preview equals the accepted replay pixel for pixel");
    assert.equal(result.previewFrames, 128, "two moves share each display frame");
    assert(result.arcs <= 2048 * 2, "only new samples enter the two fill layers; history is never re-ingested");
    assert(Math.abs(result.final.x - 620) < 1e-9 && Math.abs(result.final.y - 350) < 1e-9, "release endpoint survives coalesced moves");
    assert.deepEqual(errors, []);
    console.log(`MEASURE production drawing ${JSON.stringify(result)}`);
    console.log("PASS production drawing: full workshop, history, 2,048 coalesced samples and final release endpoint");
  } finally { if (browser) await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
