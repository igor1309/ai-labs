// How loading a picture ended.
export type PictureOutcome = "loaded" | "failed";

// Loads the picture at `url` and calls `done` once, when it has loaded or
// failed to, saying which.
export type LoadPicture = (url: string, done: (outcome: PictureOutcome) => void) => void;

// Calls `fire` after `ms` milliseconds, unless the returned stop is
// called first.
export type StartTimer = (ms: number, fire: () => void) => () => void;

export type PictureWait = {
  loadPicture: LoadPicture;
  startTimer: StartTimer;
  // The longest wait, in milliseconds.
  limit: number;
};

// Calls `ready` once, when every picture in `urls` has loaded or failed,
// or when the limit runs out, whichever comes first: a slow or broken
// picture never stops what waits for it.
export function waitForPictures(urls: readonly string[], { loadPicture, startTimer, limit }: PictureWait, ready: () => void): void {
  const pending = new Set(urls);
  let finished = false;
  let stop = () => {};
  const finish = () => {
    if (finished) return;
    finished = true;
    stop();
    ready();
  };
  if (pending.size === 0) {
    finish();
    return;
  }
  for (const url of [...pending]) {
    loadPicture(url, () => {
      pending.delete(url);
      if (pending.size === 0) finish();
    });
  }
  if (!finished) stop = startTimer(limit, finish);
}
