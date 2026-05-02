import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import {
  ArtifactCollisionError,
  assertArtifactPathsAvailable,
  computeArtifactPaths,
  measureLedgerBytes,
  writeLedger,
} from "../src/artifacts.js";

test("test_computeArtifactPaths_shouldShareUtcSecondTimestamp_onDigestAndLedger", () => {
  const paths = computeArtifactPaths(
    "/tmp/source/my-session.jsonl",
    new Date("2026-04-26T01:02:03.456Z"),
    "/tmp/digests",
  );

  assert.deepEqual(paths, {
    digestPath: path.join("/tmp/digests", "my-session.2026-04-26-010203.digest.md"),
    ledgerPath: path.join("/tmp/digests", "my-session.2026-04-26-010203.ledger.json"),
  });
});

test("test_assertArtifactPathsAvailable_shouldThrowBeforeWriting_onDigestCollision", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-digest-"));
  const paths = computeArtifactPaths("/tmp/session.jsonl", new Date("2026-04-26T01:02:03.000Z"), tempDir);

  await fs.writeFile(paths.digestPath, "existing");

  await assert.rejects(() => assertArtifactPathsAvailable(paths, fs), ArtifactCollisionError);
  assert.equal(await fs.readFile(paths.digestPath, "utf8"), "existing");
  await assert.rejects(() => fs.access(paths.ledgerPath));
});

test("test_assertArtifactPathsAvailable_shouldThrowBeforeWriting_onLedgerCollision", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-digest-"));
  const paths = computeArtifactPaths("/tmp/session.jsonl", new Date("2026-04-26T01:02:03.000Z"), tempDir);

  await fs.writeFile(paths.ledgerPath, "existing");

  await assert.rejects(() => assertArtifactPathsAvailable(paths, fs), ArtifactCollisionError);
  await assert.rejects(() => fs.access(paths.digestPath));
  assert.equal(await fs.readFile(paths.ledgerPath, "utf8"), "existing");
});

test("test_writeLedger_shouldCreateParentDirectoryAndWriteJsonLedger", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-digest-"));
  const ledgerPath = path.join(tempDir, "nested", "session.ledger.json");

  await writeLedger(ledgerPath, { schema: "session-digest-ledger" }, fs);

  assert.deepEqual(JSON.parse(await fs.readFile(ledgerPath, "utf8")), {
    schema: "session-digest-ledger",
  });
});

test("test_measureLedgerBytes_shouldReadClosedFileSize_onDisk", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-digest-"));
  const ledgerPath = path.join(tempDir, "session.ledger.json");

  await writeLedger(ledgerPath, { value: "é" }, fs);

  assert.equal(await measureLedgerBytes(ledgerPath, fs), (await fs.stat(ledgerPath)).size);
});
