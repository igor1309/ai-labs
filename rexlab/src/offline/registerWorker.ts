// The worker's own file, at the site's root so it serves every path. The
// app imports nothing else of the worker, so the build keeps the worker's
// code in one file of its own.
export const WORKER_FILE = "sw.js";

type Registering = { serviceWorker?: { register: (url: string) => Promise<unknown> } };

// The released app keeps itself offline; a development build does not,
// so a change shows at once. A browser that cannot keep it, or refuses,
// runs the app as before.
export function registerWorker(navigator: Registering, released: boolean, log: (error: unknown) => void = () => {}) {
  if (!released || !navigator.serviceWorker) return;
  navigator.serviceWorker.register(`/${WORKER_FILE}`).catch(log);
}
