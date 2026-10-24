// How the installed app works without Wi-Fi: each release keeps every
// file it is built of in a cache of its own, named for its version, and
// only installing a release fills its cache. The page comes from the
// network while there is one, so a new release shows on the next launch,
// and from the cache when there is none, with the files of the same
// release beside it. A new release takes over the cache only once every
// page of the old one has closed, so an open page never loses its files.

// The parts of the Cache Storage API the worker uses, so a test can hand
// it a cache of its own.
export type OfflineCache = {
  addAll: (urls: string[]) => Promise<void>;
  match: (request: Request | string, options?: { ignoreSearch?: boolean }) => Promise<Response | undefined>;
};

export type OfflineCaches = {
  open: (name: string) => Promise<OfflineCache>;
  keys: () => Promise<string[]>;
  delete: (name: string) => Promise<boolean>;
};

export type OfflineDeps = {
  version: string;
  // Every file of the release, as paths from the site's root.
  files: readonly string[];
  caches: OfflineCaches;
  fetch: (request: Request | string) => Promise<Response>;
  // Where the site is served from, so requests elsewhere go untouched.
  origin: string;
  // How long the page waits for the network before it takes the cached
  // page: a weak signal must not keep the child waiting.
  wait: (ms: number) => Promise<void>;
};

// The page, which every launch asks for first.
export const PAGE = "/";

// How long a launch waits for the network's page before it opens the
// cached one.
export const PAGE_WAIT_MS = 3000;

const PREFIX = "rexlab-";

export const cacheName = (version: string) => `${PREFIX}${version}`;

// The build heads the worker's code with its version, so the release
// check can tell the deployed worker is this release's.
export const workerHeader = (version: string) => `/* rexlab-version ${version} */\n`;

export function workerVersion(code: string): string | undefined {
  return /^\/\* rexlab-version (\S+) \*\//.exec(code)?.[1];
}

export function offlineCache({ version, files, caches, fetch, origin, wait }: OfflineDeps) {
  const name = cacheName(version);

  // Every file of the release goes in its cache before the release takes
  // over, so it works offline from its first launch.
  const install = async () => {
    const cache = await caches.open(name);
    await cache.addAll([PAGE, ...files.filter((file) => file !== PAGE)]);
  };

  // An older release's cache goes once this one has taken over.
  const activate = async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(PREFIX) && key !== name) await caches.delete(key);
    }
  };

  // The page from the network; the installed page where the network fails
  // or is slower than PAGE_WAIT_MS. The network's page is never kept: it
  // may be a newer release's, whose files this cache does not hold.
  const page = async (request: Request) => {
    const cache = await caches.open(name);
    const network = fetch(request);
    const late = wait(PAGE_WAIT_MS).then(() => undefined);
    const first = await Promise.race([network.catch(() => undefined), late]);
    if (first) return first;
    const cached = await cache.match(PAGE);
    return cached ?? network;
  };

  // A file of the release from the cache, else from the network.
  const file = async (request: Request) => {
    const cache = await caches.open(name);
    return (await cache.match(request, { ignoreSearch: true })) ?? fetch(request);
  };

  // What answers `request`: undefined leaves it to the browser. Only the
  // app's own page is kept fresh; any other page of the site, such as a
  // prototype, is a file of the release like the rest.
  const respond = (request: Request): Promise<Response> | undefined => {
    if (request.method !== "GET") return undefined;
    const url = new URL(request.url);
    if (url.origin !== origin) return undefined;
    if (url.pathname === PAGE || url.pathname === "/index.html") return page(request);
    return file(request);
  };

  return { install, activate, respond };
}

type WorkerEvent = { waitUntil: (work: Promise<unknown>) => void };
type FetchEvent = WorkerEvent & { request: Request; respondWith: (response: Promise<Response>) => void };

// The parts of the worker's global scope it is wired to.
export type WorkerScope = {
  addEventListener(type: "install" | "activate", listener: (event: WorkerEvent) => void): void;
  addEventListener(type: "fetch", listener: (event: FetchEvent) => void): void;
};

// Wires the cache to the worker's events. The browser activates a new
// release once no page of the old one is open, so the old cache goes only
// when nothing uses it.
export function serveOffline(scope: WorkerScope, cache: ReturnType<typeof offlineCache>) {
  scope.addEventListener("install", (event) => {
    event.waitUntil(cache.install());
  });
  scope.addEventListener("activate", (event) => {
    event.waitUntil(cache.activate());
  });
  scope.addEventListener("fetch", (event) => {
    const response = cache.respond(event.request);
    if (response) event.respondWith(response);
  });
}
