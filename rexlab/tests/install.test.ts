import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Plugin } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

  it("fails a build with no worker, or a worker split into files", () => {
    expect(() => generate({ "index.html": {} })).toThrow(/no sw\.js/);
    expect(() => generate({ "sw.js": chunk("", ["assets/shared.js"]) })).toThrow(/must be one file/);
  });
});

describe("the worker the build writes", () => {
  const out = mkdtempSync(join(tmpdir(), "rexlab-build-"));
  let code = "";

  beforeAll(async () => {
    await build({ root: fileURLToPath(new URL("..", import.meta.url)), logLevel: "silent", build: { outDir: out, emptyOutDir: true } });
    code = readFileSync(join(out, "sw.js"), "utf8");
  }, 60_000);

  afterAll(() => rmSync(out, { recursive: true, force: true }));

  // The written worker run on its own, in a scope that keeps its listeners
  // and a cache that keeps what it is told to.
  function run() {
    const listeners = new Map<string, (event: unknown) => unknown>();
    const kept: string[] = [];
    const timers: { ms: number; fire: () => void }[] = [];
    const self = { location: { origin: "https://rexlab.enoa.ai" }, addEventListener: (type: string, listener: (event: unknown) => unknown) => listeners.set(type, listener) };
    const caches = {
      open: async () => ({
        addAll: async (urls: string[]) => { kept.push(...urls); },
        match: async (request: Request | string) => (new URL(typeof request === "string" ? request : request.url, self.location.origin).pathname === "/" ? new Response("cached page") : undefined)
      }),
      keys: async () => [],
      delete: async () => true
    };
    const stalled = () => new Promise<Response>(() => {});
    const setTimeout = (fire: () => void, ms: number) => timers.push({ ms, fire });
    new Function("self", "caches", "fetch", "setTimeout", code)(self, caches, stalled, setTimeout);
    return { listeners, kept, timers };
  }

  it("is headed with the release's version", () => {
    expect(workerVersion(code)).toBe(VERSION);
  });

  it("runs as one file and keeps every page and file of the release on install", async () => {
    const { listeners, kept } = run();
    expect([...listeners.keys()].sort()).toEqual(["activate", "fetch", "install"]);
    const work: Promise<unknown>[] = [];
    listeners.get("install")!({ waitUntil: (done: Promise<unknown>) => work.push(done) });
    await Promise.all(work);
    const built = readdirSync(out, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => `/${relative(out, join(entry.parentPath, entry.name))}`)
      .filter((file) => !["/sw.js", "/_headers", "/index.html"].includes(file) && !file.endsWith(".map"));
    expect(kept.sort()).toEqual(["/", ...built].sort());
    expect(kept).toContain("/prototypes/care-hatch.html");
  });

  it("opens the cached page once a stalled network has taken 3 seconds", async () => {
    const { listeners, timers } = run();
    let answer: Promise<Response> | undefined;
    listeners.get("fetch")!({ request: new Request("https://rexlab.enoa.ai/"), respondWith: (response: Promise<Response>) => { answer = response; } });
    await new Promise<void>((settled) => queueMicrotask(settled));
    await Promise.resolve();
    expect(timers.map(({ ms }) => ms)).toEqual([3000]);
    timers[0]!.fire();
    expect(await (await answer!).text()).toBe("cached page");
  });
});
