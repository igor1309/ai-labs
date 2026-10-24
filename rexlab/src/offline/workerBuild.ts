import { workerHeader } from "./offlineCache.ts";
import { WORKER_FILE } from "./registerWorker.ts";

// The files a release keeps offline: everything the build wrote and the
// public files copied beside it, but the worker itself and the
// prototypes, which no child opens.
export function releaseFiles(written: readonly string[]): string[] {
  return written
    .filter((file) => file !== WORKER_FILE && !file.startsWith("prototypes/") && !file.startsWith("_") && !file.endsWith(".map"))
    .map((file) => (file === "index.html" ? "/" : `/${file}`))
    .sort();
}

// The worker's code with the release's version and files in place of its
// marks, headed with its version. A mark the bundler has left out is a
// broken build, not a worker that caches nothing.
export function workerCode(code: string, version: string, files: readonly string[]): string {
  const marks = [/(["'`])%REXLAB_VERSION%\1/, /(["'`])%REXLAB_FILES%\1/];
  for (const mark of marks) if (!mark.test(code)) throw new Error(`The service worker has no ${mark.source} mark`);
  const filled = code
    .replace(marks[0]!, JSON.stringify(version))
    .replace(marks[1]!, JSON.stringify(JSON.stringify(files)));
  return workerHeader(version) + filled;
}
