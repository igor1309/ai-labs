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

// The host serves a page at its path without `.html`, and redirects the
// `.html` address there; a redirected answer cannot open a page, so a page
// is kept and found at the path the host serves.
const HTML = ".html";
export const pagePath = (file: string) => (file.endsWith(HTML) ? file.slice(0, -HTML.length) : file);

// Where the build writes the files whose names carry their content's hash.
const HASHED = "/assets/";

export const cacheName = (version: string) => `${PREFIX}${version}`;

// What the worker does for one release: fill its cache on install, drop
// older ones on activate, and answer requests.
export type OfflineWorker = ReturnType<typeof offlineWorker>;

export function offlineWorker({ version, files, caches, fetch, origin, wait }: OfflineDeps) {
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

  // The page from the network; the installed page where the network fails,
  // answers with anything but the page (a host's error, a Wi-Fi's sign-in)
  // or is slower than PAGE_WAIT_MS. The network's page is never kept: it
  // may be a newer release's, whose files this cache does not hold.
  const page = async (request: Request) => {
    const cache = await caches.open(name);
    const network = fetch(request);
    const late = wait(PAGE_WAIT_MS).then(() => undefined);
    const first = await Promise.race([network.catch(() => undefined), late]);
    if (first?.ok) return first;
    const cached = await cache.match(PAGE);
    return cached ?? first ?? network;
  };

  // A file of the release from the cache, else from the network. Online,
  // a newer release's page may be open before that release takes over;
  // its files, each with its hash in its name, are found in its own
  // installed cache, so the page goes on playing when the network drops.
  const file = async (request: Request) => {
    const kept = await (await caches.open(name)).match(request, { ignoreSearch: true });
    if (kept) return kept;
    if (new URL(request.url).pathname.startsWith(HASHED)) {
      for (const key of await caches.keys()) {
        if (!key.startsWith(PREFIX) || key === name) continue;
        const other = await (await caches.open(key)).match(request, { ignoreSearch: true });
        if (other) return other;
      }
    }
    return fetch(request);
  };

  // What answers `request`: undefined leaves it to the browser. Only the
  // app's own page is kept fresh; any other page of the site, such as a
  // prototype, is a file of the release like the rest.
  const respond = (request: Request): Promise<Response> | undefined => {
    if (request.method !== "GET") return undefined;
    const url = new URL(request.url);
    if (url.origin !== origin) return undefined;
    if (url.pathname === PAGE || url.pathname === "/index.html") return page(request);
    if (url.pathname.endsWith(HTML)) return file(new Request(`${url.origin}${pagePath(url.pathname)}`));
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
export function serveOffline(scope: WorkerScope, worker: OfflineWorker) {
  scope.addEventListener("install", (event) => {
    event.waitUntil(worker.install());
  });
  scope.addEventListener("activate", (event) => {
    event.waitUntil(worker.activate());
  });
  scope.addEventListener("fetch", (event) => {
    const response = worker.respond(event.request);
    if (response) event.respondWith(response);
  });
}
