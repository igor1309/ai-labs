import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { computeDigestPath, writeDigest } from "../src/output.js";

test("test_output_path_uses_input_stem_and_utc_second_timestamp", async () => {
  const digestPath = computeDigestPath(
    "/tmp/source/my-session.jsonl",
    new Date("2026-04-26T01:02:03.456Z"),
    "/tmp/digests",
  );

  assert.equal(digestPath, path.join("/tmp/digests", "my-session.2026-04-26-010203.digest.md"));
});

test("test_two_runs_with_different_input_stems_in_same_second_produce_distinct_paths", async () => {
  const nowUtc = new Date("2026-04-26T01:02:03.000Z");

  const firstPath = computeDigestPath("/tmp/first.jsonl", nowUtc, "/tmp/digests");
  const secondPath = computeDigestPath("/tmp/second.jsonl", nowUtc, "/tmp/digests");

  assert.notEqual(firstPath, secondPath);
});

test("test_output_directory_is_created_when_missing", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-digest-"));
  const baseDir = path.join(tempDir, ".session-digests");
  const digestPath = computeDigestPath("/tmp/session.jsonl", new Date("2026-04-26T01:02:03.000Z"), baseDir);

  await writeDigest(digestPath, "# body", fs);

  assert.equal(await fs.readFile(digestPath, "utf8"), "# body");
});

test("test_write_digest_creates_parent_directory_and_writes_only_requested_digest_body", async () => {
  const mkdirCalls: Array<{ path: string; options: { recursive: boolean } }> = [];
  const writeFileCalls: Array<{ path: string; body: string }> = [];
  const fsLike = {
    mkdir: async (calledPath: string, options: { recursive: boolean }) => {
      mkdirCalls.push({ path: calledPath, options });
    },
    writeFile: async (calledPath: string, body: string) => {
      writeFileCalls.push({ path: calledPath, body });
    },
  } as Pick<typeof fs, "mkdir" | "writeFile">;

  await writeDigest("/tmp/digests/session.digest.md", "digest body", fsLike);

  assert.deepEqual(mkdirCalls, [{ path: "/tmp/digests", options: { recursive: true } }]);
  assert.deepEqual(writeFileCalls, [{ path: "/tmp/digests/session.digest.md", body: "digest body" }]);
});
