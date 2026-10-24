import { describe, expect, it } from "vitest";
import { cacheName, offlineCache, PAGE_WAIT_MS, workerHeader, workerVersion, type OfflineCache, type OfflineCaches } from "../src/offline/offlineCache.ts";
import { registerWorker } from "../src/offline/registerWorker.ts";
import { releaseFiles, workerCode } from "../src/offline/workerBuild.ts";

const ORIGIN = "https://rexlab.enoa.ai";
const FILES = ["/", "/assets/main-abc.js", "/assets/tile-def.webp", "/manifest.webmanifest"];

// Cache Storage held in maps, each cache its responses by path.
function memoryCaches() {
  const stored = new Map<string, Map<string, Response>>();
  const path = (request: Request | string) => new URL(typeof request === "string" ? request : request.url, ORIGIN).pathname;
  const caches: OfflineCaches = {
    open: async (name) => {
      const entries = stored.get(name) ?? new Map<string, Response>();
      stored.set(name, entries);
      const cache: OfflineCache = {
        addAll: async (urls) => { for (const url of urls) entries.set(path(url), new Response(`cached ${url}`)); },
        match: async (request) => entries.get(path(request))?.clone(),
        put: async (request, response) => { entries.set(path(request), response); }
      };
      return cache;
    },
    keys: async () => [...stored.keys()],
    delete: async (name) => stored.delete(name)
  };
  return { caches, stored };
}

// The network: each answer `respond` gives, or no network at all.
function network(respond?: (url: string) => Response) {
  const asked: string[] = [];
  const fetch = async (request: Request | string) => {
    const url = typeof request === "string" ? request : request.url;
    asked.push(new URL(url, ORIGIN).pathname);
    if (!respond) throw new TypeError("Load failed");
    return respond(url);
  };
  return { fetch, asked };
}

// A wait that ends only when the test lets it.
function manualWait() {
  const waiting: { ms: number; end: () => void }[] = [];
  const wait = (ms: number) => new Promise<void>((end) => waiting.push({ ms, end }));
  return { wait, waiting };
}

const page = () => new Request(`${ORIGIN}/`, { mode: "same-origin" });
// A launch's request for the page: Node makes no navigation of its own.
const navigation = (path = "/") => ({ method: "GET", url: `${ORIGIN}${path}`, mode: "navigate" }) as Request;

function release(version: string, { caches = memoryCaches().caches, fetch = network().fetch, wait = manualWait().wait } = {}) {
  return offlineCache({ version, files: FILES, caches, fetch, origin: ORIGIN, wait });
}

describe("the app offline", () => {
  it("keeps every file of the release, the page among them, in a cache named for its version", async () => {
    const { caches, stored } = memoryCaches();
    await release("v1.0.0", { caches }).install();
    expect([...stored.keys()]).toEqual([cacheName("v1.0.0")]);
    expect([...stored.get("rexlab-v1.0.0")!.keys()].sort()).toEqual([...FILES].sort());
  });

  it("opens the cached page and files with no network", async () => {
    const { caches } = memoryCaches();
    const offline = release("v1.0.0", { caches, fetch: network().fetch });
    await offline.install();
    expect(await (await offline.respond(navigation())!).text()).toBe("cached /");
    expect(await (await offline.respond(new Request(`${ORIGIN}/assets/tile-def.webp`))!).text()).toBe("cached /assets/tile-def.webp");
  });

  it("takes the network's page while there is one, and keeps it for the next launch offline", async () => {
    const { caches, stored } = memoryCaches();
    const online = network(() => new Response("new page"));
    const offline = release("v1.0.0", { caches, fetch: online.fetch });
    await offline.install();
    expect(await (await offline.respond(navigation("/?from=home"))!).text()).toBe("new page");
    expect(await stored.get("rexlab-v1.0.0")!.get("/")!.text()).toBe("new page");
    expect(online.asked).toEqual(["/"]);
  });

  it(`opens the cached page when the network takes longer than ${PAGE_WAIT_MS} ms`, async () => {
    const { caches } = memoryCaches();
    const { wait, waiting } = manualWait();
    const offline = release("v1.0.0", { caches, fetch: () => new Promise<Response>(() => {}), wait });
    await offline.install();
    const answer = offline.respond(page())!;
    await Promise.resolve();
    expect(waiting.map(({ ms }) => ms)).toEqual([PAGE_WAIT_MS]);
    waiting[0]!.end();
    expect(await (await answer).text()).toBe("cached /");
  });

  it("takes a file from the cache before the network, and one it has not kept from the network", async () => {
    const online = network((url) => new Response(`network ${new URL(url).pathname}`));
    const offline = release("v1.0.0", { fetch: online.fetch });
    await offline.install();
    expect(await (await offline.respond(new Request(`${ORIGIN}/assets/main-abc.js?v=2`))!).text()).toBe("cached /assets/main-abc.js");
    expect(await (await offline.respond(new Request(`${ORIGIN}/assets/new.webp`))!).text()).toBe("network /assets/new.webp");
    expect(online.asked).toEqual(["/assets/new.webp"]);
  });

  it("leaves what it does not keep to the browser: other sites and anything but a read", () => {
    const offline = release("v1.0.0");
    expect(offline.respond(new Request("https://example.com/picture.webp"))).toBeUndefined();
    expect(offline.respond(new Request(`${ORIGIN}/assets/main-abc.js`, { method: "POST" }))).toBeUndefined();
  });

  it("drops an older release's cache once a new one takes over, and keeps other caches", async () => {
    const { caches, stored } = memoryCaches();
    await release("v1.0.0", { caches }).install();
    await caches.open("someone-else");
    const next = release("v1.0.1", { caches });
    await next.install();
    await next.activate();
    expect([...stored.keys()].sort()).toEqual(["rexlab-v1.0.1", "someone-else"]);
  });
});

describe("the worker's build", () => {
  it("keeps the files a child opens, the page as the root, and leaves out the worker, the prototypes, maps and Pages' own files", () => {
    expect(releaseFiles(["index.html", "sw.js", "assets/main-abc.js", "assets/main-abc.js.map", "prototypes/care-hatch.html", "_headers", "manifest.webmanifest", "icons/icon-180.png"]))
      .toEqual(["/", "/assets/main-abc.js", "/icons/icon-180.png", "/manifest.webmanifest"]);
  });

  it("writes the version and the files in place of the worker's marks, headed with the version", () => {
    const code = workerCode(`const v=\`%REXLAB_VERSION%\`,f=JSON.parse("%REXLAB_FILES%");`, "v1.2.3", ["/", "/a.js"]);
    expect(code.startsWith(workerHeader("v1.2.3"))).toBe(true);
    expect(workerVersion(code)).toBe("v1.2.3");
    const filled = new Function(`${code}; return [v, f];`)() as [string, string[]];
    expect(filled).toEqual(["v1.2.3", ["/", "/a.js"]]);
  });

  it("refuses a worker whose marks the bundler has left out", () => {
    expect(() => workerCode(`const v="%REXLAB_VERSION%";`, "v1.2.3", [])).toThrow(/REXLAB_FILES/);
  });

  it("reads no version from code with no header", () => {
    expect(workerVersion("self.addEventListener('fetch', () => {})")).toBeUndefined();
  });
});

describe("registering the worker", () => {
  const navigatorWith = (register: (url: string) => Promise<unknown>) => ({ serviceWorker: { register } });

  it("registers the root's worker in a release", () => {
    const asked: string[] = [];
    registerWorker(navigatorWith(async (url) => { asked.push(url); }), true);
    expect(asked).toEqual(["/sw.js"]);
  });

  it("registers none in development, nor where the browser has no workers", () => {
    const asked: string[] = [];
    registerWorker(navigatorWith(async (url) => { asked.push(url); }), false);
    registerWorker({}, true);
    expect(asked).toEqual([]);
  });

  it("logs a refusal and goes on", async () => {
    const logged: unknown[] = [];
    const refusal = new Error("SecurityError");
    registerWorker(navigatorWith(() => Promise.reject(refusal)), true, (error) => logged.push(error));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(logged).toEqual([refusal]);
  });
});
