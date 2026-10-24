import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import { describe, expect, it } from "vitest";
import { workerVersion } from "../src/offline/offlineCache.ts";
import config from "../vite.config.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url));
const VERSION = `v${JSON.parse(read("package.json").toString()).version}`;

// A PNG's width and height, from its header.
const pngSize = (png: Buffer) => [png.readUInt32BE(16), png.readUInt32BE(20)];

describe("RexLab on the home screen", () => {
  const manifest = JSON.parse(read("public/manifest.webmanifest").toString());
  const page = read("index.html").toString();
  const meta = (name: string) => new RegExp(`<meta name="${name}" content="([^"]*)"`).exec(page)?.[1];
  const link = (rel: string) => new RegExp(`<link rel="${rel}" href="([^"]*)"`).exec(page)?.[1];

  it("is named RexLab and opens full screen from the root, in the app's colour", () => {
    expect(manifest).toMatchObject({ name: "RexLab", short_name: "RexLab", start_url: "/", scope: "/", display: "fullscreen", background_color: "#F2EFE8", theme_color: "#F2EFE8" });
    expect(link("manifest")).toBe("/manifest.webmanifest");
    expect([meta("theme-color"), meta("apple-mobile-web-app-capable"), meta("mobile-web-app-capable"), meta("apple-mobile-web-app-title")]).toEqual(["#F2EFE8", "yes", "yes", "RexLab"]);
  });

  it("has its icon at every size it names", () => {
    const icons: { src: string; sizes: string }[] = manifest.icons;
    for (const { src, sizes } of [...icons, { src: link("apple-touch-icon")!, sizes: "180x180" }]) {
      expect(pngSize(read(`public${src}`)).join("x"), src).toBe(sizes);
    }
  });

  it("has the worker and the manifest asked for afresh each time, so a release reaches an installed app", () => {
    const rules = read("public/_headers").toString().split(/\n(?=\/)/).map((rule) => rule.trim());
    expect(rules).toEqual(["/sw.js\n  Cache-Control: no-cache", "/manifest.webmanifest\n  Cache-Control: no-cache"]);
  });
});

describe("the build's worker", () => {
  const plugin = (config.plugins as Plugin[]).find((each) => each?.name === "rexlab-offline")!;
  const output = config.build!.rolldownOptions!.output as { entryFileNames: (chunk: { name: string }) => string };
  const generate = (bundle: Record<string, unknown>) =>
    (plugin.generateBundle as (this: unknown, options: unknown, bundle: Record<string, unknown>) => void).call({}, {}, bundle);
  const chunk = (code: string, imports: string[] = []) => ({ type: "chunk", code, imports });

  it("writes the worker to the root as sw.js, and the app's code under assets", () => {
    expect(config.build!.rolldownOptions!.input).toMatchObject({ sw: "src/offline/sw.ts" });
    expect([output.entryFileNames({ name: "sw" }), output.entryFileNames({ name: "main" })]).toEqual(["sw.js", "assets/[name]-[hash].js"]);
  });

  it("heads the worker with the release's version and fills in every file built and public", () => {
    const worker = chunk('const v="%REXLAB_VERSION%",f=JSON.parse("%REXLAB_FILES%");');
    generate({ "sw.js": worker, "index.html": {}, "assets/main-abc.js": chunk(""), "prototypes/care-hatch.html": {} });
    expect(workerVersion(worker.code)).toBe(VERSION);
    const files = new Function(`${worker.code}; return f;`)() as string[];
    expect(files).toEqual(expect.arrayContaining(["/", "/assets/main-abc.js", "/prototypes/care-hatch.html", "/manifest.webmanifest", "/icons/icon-180.png", "/icons/icon-192.png", "/icons/icon-512.png"]));
    expect(files).not.toContain("/sw.js");
    expect(files).not.toContain("/_headers");
  });

  it("runs after Vite has added the pages to the bundle", () => {
    expect(plugin.enforce).toBe("post");
  });

  it("fails a build with no worker, or a worker split into files", () => {
    expect(() => generate({ "index.html": {} })).toThrow(/no sw\.js/);
    expect(() => generate({ "sw.js": chunk("", ["assets/shared.js"]) })).toThrow(/must be one file/);
  });
});
