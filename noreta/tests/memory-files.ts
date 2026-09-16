import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";

import { openWorkspaceRepositories } from "../src/workspace-repositories.js";

// A path in a directory of its own where no file exists yet.
export function freshMemoryFile(): string {
  return join(mkdtempSync(join(tmpdir(), "noreta-memory-")), "workspaces.sqlite");
}

// A fresh file already holding the given repository for each workspace.
export function rememberedIn(repositories: Record<string, string>): string {
  const file = freshMemoryFile();
  const memory = openWorkspaceRepositories(file);

  for (const [workspace, repository] of Object.entries(repositories)) {
    memory.remember(workspace, repository);
  }
  memory.close();

  return file;
}

// The same file with its write permission taken away: it still opens and
// answers questions, and every statement that would change it is refused.
export function writeProtected(file: string): string {
  chmodSync(file, 0o444);

  return file;
}

// A file already holding bytes no database starts with, so opening it fails.
export function notADatabase(): string {
  const file = freshMemoryFile();
  writeFileSync(file, "workspaces, but not as sqlite knows them");

  return file;
}

// A path whose parent directory does not exist yet.
export function memoryFileInMissingDirectory(): string {
  return join(mkdtempSync(join(tmpdir(), "noreta-memory-")), "missing", "workspaces.sqlite");
}

// Whether some writer holds the file's write lock right now, asked without waiting.
export function isWriteLocked(file: string): boolean {
  const database = new DatabaseSync(file);

  try {
    database.exec("BEGIN IMMEDIATE");
    database.exec("ROLLBACK");

    return false;
  } catch {
    return true;
  } finally {
    database.close();
  }
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
