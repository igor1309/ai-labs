import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";

// A path in a directory of its own where no file exists yet.
export function freshMemoryFile(): string {
  return join(mkdtempSync(join(tmpdir(), "noreta-memory-")), "workspaces.sqlite");
}

// A path whose parent directory does not exist yet.
export function memoryFileInMissingDirectory(): string {
  return join(mkdtempSync(join(tmpdir(), "noreta-memory-")), "missing", "workspaces.sqlite");
}

// Another writer, on its own thread, holding the file's write lock for a while.
// Resolves once the lock is held; the returned promise settles when it is released.
export async function holdWriteLock(
  file: string,
  milliseconds: number,
): Promise<{ released: Promise<void> }> {
  const worker = new Worker(
    `
    const { workerData, parentPort } = require("node:worker_threads");
    const { DatabaseSync } = require("node:sqlite");
    const database = new DatabaseSync(workerData.file);
    database.exec("PRAGMA busy_timeout = 5000");
    database.exec("BEGIN IMMEDIATE");
    parentPort.postMessage("locked");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, workerData.milliseconds);
    database.exec("COMMIT");
    database.close();
    `,
    { eval: true, workerData: { file, milliseconds } },
  );
  const released = new Promise<void>((resolve, reject) => {
    worker.once("exit", () => resolve());
    worker.once("error", reject);
  });
  await new Promise<void>((resolve, reject) => {
    worker.once("message", () => resolve());
    worker.once("error", reject);
  });

  return { released };
}
