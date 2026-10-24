import { describe, expect, it } from "vitest";
import { cacheName, offlineWorker, serveOffline, type OfflineCache, type OfflineCaches, type WorkerScope } from "../src/offline/offlineWorker.ts";
import { registerWorker } from "../src/offline/registerWorker.ts";
import { releaseFiles, workerCode, workerHeader, workerVersion } from "../src/offline/workerBuild.ts";

const ORIGIN = "https://rexlab.enoa.ai";
const FILES = ["/", "/assets/main-abc.js", "/assets/tile-def.webp", "/manifest.webmanifest", "/prototypes/care-hatch"];

// Cache Storage held in maps, each cache its responses by path and query,
// matched without the query only when asked to.
function memoryCaches() {
  const stored = new Map<string, Map<string, Response>>();
  const path = (request: Request | string) => {
    const url = new URL(typeof request === "string" ? request : request.url, ORIGIN);
    return url.pathname + url.search;
  };
  const caches: OfflineCaches = {
    open: async (name) => {
      const entries = stored.get(name) ?? new Map<string, Response>();
      stored.set(name, entries);
      const cache: OfflineCache = {
        addAll: async (urls) => { for (const url of urls) entries.set(path(url), new Response(`cached ${url}`)); },
        match: async (request, options) => {
          const wanted = path(request);
          const key = options?.ignoreSearch ? [...entries.keys()].find((kept) => kept.split("?")[0] === wanted.split("?")[0]) : wanted;
          return key === undefined ? undefined : entries.get(key)?.clone();
        }
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
  return offlineWorker({ version, files: FILES, caches, fetch, origin: ORIGIN, wait });
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

  it("takes the network's page while there is one, and keeps the installed page, whose files it holds, for a launch offline", async () => {
    const { caches } = memoryCaches();
    const online = network(() => new Response("next release's page"));
    const installed = release("v1.0.0", { caches, fetch: online.fetch });
    await installed.install();
    expect(await (await installed.respond(navigation("/?from=home"))!).text()).toBe("next release's page");
    expect(online.asked).toEqual(["/"]);
    const offline = release("v1.0.0", { caches, fetch: network().fetch });
    expect(await (await offline.respond(navigation())!).text()).toBe("cached /");
  });

  it("opens the cached page when the network takes longer than 3 seconds", async () => {
    const { caches } = memoryCaches();
    const { wait, waiting } = manualWait();
    const offline = release("v1.0.0", { caches, fetch: () => new Promise<Response>(() => {}), wait });
    await offline.install();
    const answer = offline.respond(page())!;
    await Promise.resolve();
    expect(waiting.map(({ ms }) => ms)).toEqual([3000]);
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

  it("opens another page of the site from its own cached file, not as the app's page", async () => {
    const { caches } = memoryCaches();
    const online = network((url) => new Response(`network ${new URL(url).pathname}`));
    const offline = release("v1.0.0", { caches, fetch: online.fetch });
    await offline.install();
    expect(await (await offline.respond(navigation("/prototypes/care-hatch.html"))!).text()).toBe("cached /prototypes/care-hatch");
    expect(await (await offline.respond(navigation("/prototypes/care-hatch"))!).text()).toBe("cached /prototypes/care-hatch");
    expect(online.asked).toEqual([]);
  });

  it("finds a newer release's file in that release's cache while the older release is still active and the network is gone", async () => {
    const { caches } = memoryCaches();
    const active = release("v1.0.0", { caches });
    await active.install();
    await offlineWorker({ version: "v1.1.0", files: ["/", "/assets/tile-new.webp", "/icons/icon-180.png"], caches, fetch: network().fetch, origin: ORIGIN, wait: manualWait().wait }).install();
    expect(await (await active.respond(new Request(`${ORIGIN}/assets/tile-new.webp`))!).text()).toBe("cached /assets/tile-new.webp");
  });

  it("asks the network for a file no installed release holds", async () => {
    const online = network((url) => new Response(`network ${new URL(url).pathname}`));
    const offline = release("v1.0.0", { fetch: online.fetch });
    await offline.install();
    expect(await (await offline.respond(new Request(`${ORIGIN}/assets/elsewhere.webp`))!).text()).toBe("network /assets/elsewhere.webp");
  });

  it.each([
    ["a host's error", () => new Response("bad gateway", { status: 502 })],
    ["a missing page", () => new Response("not found", { status: 404 })]
  ])("opens the cached page when the network answers with %s", async (_, answer) => {
    const offline = release("v1.0.0", { fetch: network(answer).fetch });
    await offline.install();
    expect(await (await offline.respond(navigation())!).text()).toBe("cached /");
  });

  it.each([
    ["the app's page", "/", "cached /"],
    ["the app's page by its file", "/index.html", "cached /"],
    ["a hashed file only a newer release holds", "/assets/tile-new.webp", "cached /assets/tile-new.webp"],
    ["a file outside the hashed ones only a newer release holds", "/icons/icon-new.png", "network /icons/icon-new.png"],
    ["a hashed file only another site's cache holds", "/assets/theirs.webp", "network /assets/theirs.webp"]
  ])("answers %s from where it belongs", async (_, path, expected) => {
    const { caches } = memoryCaches();
    const fetch = network((url) => {
      if (["/", "/index.html"].includes(new URL(url).pathname)) throw new TypeError("Load failed");
      return new Response(`network ${new URL(url).pathname}`);
    }).fetch;
    const active = release("v1.0.0", { caches, fetch });
    await active.install();
    await offlineWorker({ version: "v1.1.0", files: ["/assets/tile-new.webp", "/icons/icon-new.png"], caches, fetch, origin: ORIGIN, wait: manualWait().wait }).install();
    await (await caches.open("someone-else")).addAll(["/assets/theirs.webp"]);
    expect(await (await active.respond(navigation(path))!).text()).toBe(expected);
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
  it("keeps every page and file the release serves, each page at its path without .html and the app's as the root, and leaves out the worker, maps and Pages' own files", () => {
    expect(releaseFiles(["index.html", "sw.js", "assets/main-abc.js", "assets/main-abc.js.map", "prototypes/care-hatch.html", "_headers", "manifest.webmanifest", "icons/icon-180.png"]))
      .toEqual(["/", "/assets/main-abc.js", "/icons/icon-180.png", "/manifest.webmanifest", "/prototypes/care-hatch"]);
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
    await registerWorker(navigatorWith(() => Promise.reject(refusal)), true, (error) => logged.push(error));
    expect(logged).toEqual([refusal]);
  });
});

describe("the worker's events", () => {
  // A worker's scope that keeps each listener and what each step did.
  function workerScope() {
    const listeners = new Map<string, (event: never) => void>();
    const scope: WorkerScope = {
      addEventListener: (type: string, listener: (event: never) => void) => { listeners.set(type, listener); }
    };
    const fire = async (type: string, event: object) => { listeners.get(type)!(event as never); };
    return { scope, fire };
  }

  const lifecycle = () => {
    const work: Promise<unknown>[] = [];
    return { event: { waitUntil: (done: Promise<unknown>) => work.push(done) }, done: () => Promise.all(work) };
  };

  it("keeps the release on install and leaves the older cache to its open pages, then drops it once the release is active", async () => {
    const { caches, stored } = memoryCaches();
    const older = release("v0.9.0", { caches });
    await older.install();
    const { scope, fire } = workerScope();
    serveOffline(scope, release("v1.0.0", { caches }));
    const install = lifecycle();
    await fire("install", install.event);
    await install.done();
    expect([...stored.get("rexlab-v1.0.0")!.keys()].sort()).toEqual([...FILES].sort());
    expect(await (await older.respond(new Request(`${ORIGIN}/assets/tile-def.webp`))!).text()).toBe("cached /assets/tile-def.webp");
    const activate = lifecycle();
    await fire("activate", activate.event);
    await activate.done();
    expect([...stored.keys()]).toEqual(["rexlab-v1.0.0"]);
  });

  it("hands the browser each step's work, so it waits for it", async () => {
    const { scope, fire } = workerScope();
    const installing = Promise.resolve();
    const activating = Promise.resolve();
    serveOffline(scope, { install: () => installing, activate: () => activating, respond: () => undefined });
    const handed: Promise<unknown>[] = [];
    await fire("install", { waitUntil: (work: Promise<unknown>) => handed.push(work) });
    await fire("activate", { waitUntil: (work: Promise<unknown>) => handed.push(work) });
    expect(handed).toHaveLength(2);
    expect(handed[0]).toBe(installing);
    expect(handed[1]).toBe(activating);
  });

  it("answers a request of the release from the cache and leaves another site's to the browser", async () => {
    const { caches } = memoryCaches();
    const { scope, fire } = workerScope();
    const offline = release("v1.0.0", { caches });
    await offline.install();
    serveOffline(scope, offline);
    const answers: Promise<Response>[] = [];
    const fetchEvent = (url: string) => ({ request: new Request(url), waitUntil: () => {}, respondWith: (answer: Promise<Response>) => answers.push(answer) });
    await fire("fetch", fetchEvent(`${ORIGIN}/assets/tile-def.webp`));
    await fire("fetch", fetchEvent("https://example.com/picture.webp"));
    expect(answers).toHaveLength(1);
    expect(await (await answers[0]!).text()).toBe("cached /assets/tile-def.webp");
  });
});
