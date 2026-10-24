// The service worker: the build writes the release's version and its
// files in place of the two marks below.
import { offlineCache, serveOffline, type WorkerScope } from "./offlineCache.ts";

const scope = self as unknown as WorkerScope & { location: Location };
const VERSION = "%REXLAB_VERSION%";
const FILES: string[] = JSON.parse("%REXLAB_FILES%");

serveOffline(
  scope,
  offlineCache({
    version: VERSION,
    files: FILES,
    caches,
    fetch: (request) => fetch(request),
    origin: scope.location.origin,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  })
);
