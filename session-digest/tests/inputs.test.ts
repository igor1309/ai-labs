import assert from "node:assert/strict";
import type { PathLike, Stats } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Writable } from "node:stream";
import test from "node:test";

import { main, type MainDeps } from "../src/cli.js";
import { validateInputPath } from "../src/inputs.js";

test("test_missing_file_returns_error", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-digest-"));
  const baseDir = path.join(tempDir, ".session-digests");
  const stdout = new StringSink();
  const stderr = new StringSink();

  const exitCode = await main([path.join(tempDir, "missing.jsonl")], stdout, stderr, { baseDir });

  assert.notEqual(exitCode, 0);
  assert.notEqual(stderr.toString(), "");
  assert.deepEqual(await regularFilesUnder(baseDir), []);
});

test("test_path_pointing_at_directory_returns_error", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-digest-"));
  const baseDir = path.join(tempDir, ".session-digests");
  const stdout = new StringSink();
  const stderr = new StringSink();

  const exitCode = await main([tempDir], stdout, stderr, { baseDir });

  assert.notEqual(exitCode, 0);
  assert.notEqual(stderr.toString(), "");
  assert.deepEqual(await regularFilesUnder(baseDir), []);
});

test("test_path_pointing_at_broken_symlink_returns_error", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-digest-"));
  const baseDir = path.join(tempDir, ".session-digests");
  const linkPath = path.join(tempDir, "broken.jsonl");
  const stdout = new StringSink();
  const stderr = new StringSink();

  await fs.symlink(path.join(tempDir, "does-not-exist.jsonl"), linkPath);

  const exitCode = await main([linkPath], stdout, stderr, { baseDir });

  assert.notEqual(exitCode, 0);
  assert.notEqual(stderr.toString(), "");
  assert.deepEqual(await regularFilesUnder(baseDir), []);
});

test("test_eacces_from_stat_maps_to_unreadable_error", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-digest-"));
  const inputPath = path.join(tempDir, "session.jsonl");
  const stdout = new StringSink();
  const stderr = new StringSink();
  const statCalls: string[] = [];
  const fsLike = {
    stat: async (calledPath: PathLike) => {
      statCalls.push(calledPath.toString());
      throw Object.assign(new Error("EACCES"), { code: "EACCES" });
    },
  } as unknown as MainDeps["fsLike"];

  const result = await main([inputPath], stdout, stderr, { baseDir: path.join(tempDir, ".session-digests"), fsLike })
    .then((exitCode) => ({ kind: "returned" as const, exitCode }))
    .catch((error: unknown) => ({ kind: "threw" as const, error }));

  assert.equal(result.kind, "returned");
  assert.notEqual(result.kind === "returned" ? result.exitCode : 0, 0);
  assert.match(stderr.toString(), /EACCES|permission|unreadable/i);
  assert.deepEqual(statCalls, [inputPath]);
});

test("test_validate_input_path_invokes_injected_fs_stat_on_happy_path", async () => {
  const inputPath = "/tmp/session.jsonl";
  const statCalls: string[] = [];
  const fsLike = {
    stat: async (calledPath: PathLike) => {
      statCalls.push(calledPath.toString());

      return { isFile: () => true, size: 100 } as Stats;
    },
  } as unknown as Parameters<typeof validateInputPath>[1];

  await validateInputPath(inputPath, fsLike);

  assert.deepEqual(statCalls, [inputPath]);
});

test("test_empty_file_returns_error", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-digest-"));
  const inputPath = path.join(tempDir, "empty.jsonl");
  const baseDir = path.join(tempDir, ".session-digests");
  const stdout = new StringSink();
  const stderr = new StringSink();

  await fs.writeFile(inputPath, "");

  const exitCode = await main([inputPath], stdout, stderr, { baseDir });

  assert.notEqual(exitCode, 0);
  assert.notEqual(stderr.toString(), "");
  assert.deepEqual(await regularFilesUnder(baseDir), []);
});

test("test_file_over_one_megabyte_returns_oversize_error", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-digest-"));
  const inputPath = path.join(tempDir, "large.jsonl");
  const baseDir = path.join(tempDir, ".session-digests");
  const stdout = new StringSink();
  const stderr = new StringSink();

  await fs.writeFile(inputPath, Buffer.alloc(1024 * 1024 + 1));

  const exitCode = await main([inputPath], stdout, stderr, { baseDir });

  assert.notEqual(exitCode, 0);
  assert.match(stderr.toString(), /1 MB/);
  assert.deepEqual(await regularFilesUnder(baseDir), []);
});

async function regularFilesUnder(directory: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    return entries.filter(($0) => $0.isFile()).map(($0) => $0.name).sort();
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

class StringSink extends Writable {
  readonly chunks: string[] = [];

  _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(chunk.toString());
    callback();
  }

  override toString(): string {
    return this.chunks.join("");
  }
}
