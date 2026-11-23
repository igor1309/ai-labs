// Contract test: every picture offered for a new work fills the canvas, and an
// enlarged picture keeps the regions of the one it enlarges, in Chromium.
const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { chromium } = require("playwright");

(async () => {
  let browser;
  try {
    const { build } = await import("vite");
    const root = resolve(__dirname, "..");
    const bundle = await build({ root, configFile: false, logLevel: "error", plugins: [{
      name: "coloring-canvas-fill",
      resolveId(id) { if (id === "fill-harness") return "\0fill-harness"; },
      load(id) {
        if (id === "\0fill-harness") return ["src/coloring/index.ts", "src/coloring/painter.ts", "src/coloring/artworks.ts", "src/coloring/fitted.ts", "src/coloringWorkshopRoot.ts"]
          .map(file => `export * from ${JSON.stringify(resolve(root, file))}`).join(";\n");
      }
    }], build: { write: false, rolldownOptions: { preserveEntrySignatures: "strict", input: "fill-harness", output: { entryFileNames: "harness.js" } } } });
    const files = new Map(bundle.output.map(file => [file.fileName, file.type === "chunk" ? file.code : file.source]));
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.route("http://coloring.test/**", route => {
      const path = new URL(route.request().url()).pathname.slice(1);
      if (!path) return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Canvas fill</title>" });
      assert(files.has(path), `Missing browser module ${path}`);
      return route.fulfill({ contentType: [".css"].some(end => path.endsWith(end)) ? "text/css" : "text/javascript", body: files.get(path) });
    });
    await page.goto("http://coloring.test/");
    console.log(await page.evaluate(async () => {
      const { WIDTH, HEIGHT, createPainter, artworkFor, coloringVersionsFor, FITTED } = await import("/harness.js");
      const failures = [];
      // A picture touches the canvas edges in its tighter direction and sits
      // centred in the other: no empty band beyond what its shape leaves.
      for (const level of ["hatchling", "explorer", "paleontologist"]) {
        for (const version of coloringVersionsFor(level)) {
          const painter = createPainter(() => document.createElement("canvas"), artworkFor(version).geometry);
          // Open areas show the paper until filled, so fill every area to see the whole picture.
          const geometry = artworkFor(version).geometry;
          const canvas = painter.canvas(); painter.render(canvas, geometry.regions.map(region => ({ kind: "fill", region: region.id, color: "#ffffff" })));
          const data = painter.pixels(canvas);
          let x0 = WIDTH, y0 = HEIGHT, x1 = -1, y1 = -1;
          for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
            if (!data[(y * WIDTH + x) * 4 + 3]) continue;
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
          }
          const across = (x1 - x0 + 1) / WIDTH, down = (y1 - y0 + 1) / HEIGHT;
          if (Math.max(across, down) < 0.97) failures.push(`${level} ${version} fills ${Math.round(across * 100)}% x ${Math.round(down * 100)}%`);
          if (Math.abs(x0 - (WIDTH - 1 - x1)) > 6 || Math.abs(y0 - (HEIGHT - 1 - y1)) > 6)
            failures.push(`${level} ${version} is off centre: ${x0},${y0}-${x1},${y1}`);
        }
      }
      // An interior point of the original lands in the same region of the enlargement.
      for (const [enlarged, original] of FITTED) {
        const big = createPainter(() => document.createElement("canvas"), enlarged);
        const small = createPainter(() => document.createElement("canvas"), original);
        const { scale, x, y } = enlarged.view;
        let checked = 0;
        for (let py = 6; py < HEIGHT - 6; py += 9) for (let px = 6; px < WIDTH - 6; px += 9) {
          const id = small.regionAt({ x: px, y: py });
          if (!id || [[-5, 0], [5, 0], [0, -5], [0, 5]].some(([dx, dy]) => small.regionAt({ x: px + dx, y: py + dy }) !== id)) continue;
          const at = { x: px * scale + 2 * x, y: py * scale + 2 * y };
          if (at.x < 0 || at.y < 0 || at.x >= WIDTH || at.y >= HEIGHT) continue;
          checked++;
          const found = big.regionAt(at);
          if (found !== id) failures.push(`${enlarged.artwork.version}: ${px},${py} is ${id} but ${found} at ${Math.round(at.x)},${Math.round(at.y)}`);
        }
        if (checked < 500) failures.push(`${enlarged.artwork.version}: only ${checked} interior points`);
      }
      if (failures.length) throw new Error(failures.join("\n"));
      return "PASS canvas fill: every offered picture touches the canvas edges, centred; enlarged pictures keep their regions";
    }));
  } finally { if (browser) await browser.close(); }
})().catch(error => {
  console.error(error);
  console.error(`FAIL canvas fill: ${error.message.split("\n")[0]}`);
  process.exitCode = 1;
});
