// The service worker: the build writes the release's version and its
// files in place of the two marks below.
import { offlineCache } from "./offlineCache.ts";

type WorkerEvent = Event & { waitUntil: (work: Promise<unknown>) => void };
type FetchEvent = WorkerEvent & { request: Request; respondWith: (response: Promise<Response>) => void };
type WorkerScope = typeof globalThis & {
  location: Location;
  skipWaiting: () => Promise<void>;
  clients: { claim: () => Promise<void> };
  addEventListener: (type: string, listener: (event: never) => void) => void;
};

const scope = self as unknown as WorkerScope;
const VERSION = "%REXLAB_VERSION%";
const FILES: string[] = JSON.parse("%REXLAB_FILES%");

const cache = offlineCache({
  version: VERSION,
  files: FILES,
  caches,
  fetch: (request) => fetch(request),
  origin: scope.location.origin,
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
});

// A new release takes over at once: its page names only its own files.
scope.addEventListener("install", (event: WorkerEvent) => {
  event.waitUntil(cache.install().then(() => scope.skipWaiting()));
});

scope.addEventListener("activate", (event: WorkerEvent) => {
  event.waitUntil(cache.activate().then(() => scope.clients.claim()));
});

scope.addEventListener("fetch", (event: FetchEvent) => {
  const response = cache.respond(event.request);
  if (response) event.respondWith(response);
});
