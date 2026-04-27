import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { InputError } from "../src/inputs.js";
import { parseSessionRecords } from "../src/session-records.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "v2");

test("test_parseSessionRecords_shouldPreserveSourceAnchors_onBlankLines", async () => {
  const parsed = await parseSessionRecords(path.join(fixturesDir, "two-records-with-blank.jsonl"), fs);

  assert.deepEqual(parsed.records.map(($0) => $0.anchor), ["record:1", "record:3"]);
});

test("test_parseSessionRecords_shouldRecoverMalformedLines_onRecognizedRecordPresent", async () => {
  const parsed = await parseSessionRecords(path.join(fixturesDir, "malformed-then-valid.jsonl"), fs);

  assert.equal(parsed.parse.skipped_records, 1);
  assert.deepEqual(parsed.records.map(($0) => $0.anchor), ["record:1"]);
});

test("test_parseSessionRecords_shouldThrowInputError_onNoRecognizedRecords", async () => {
  await assert.rejects(
    () => parseSessionRecords(path.join(fixturesDir, "no-recognized-records.jsonl"), fs),
    InputError,
  );
});

test("test_parseSessionRecords_shouldMapEaccesReadFailureToInputError_onUnreadableFile", async () => {
  const unreadableError = new Error("permission denied") as NodeJS.ErrnoException;
  unreadableError.code = "EACCES";

  await assert.rejects(
    () => parseSessionRecords("/tmp/session.jsonl", {
      readFile: async () => {
        throw unreadableError;
      },
    }),
    new InputError("Input file is unreadable (EACCES): /tmp/session.jsonl"),
  );
});

test("test_parseSessionRecords_shouldPreserveKnownMetadata_onRichClaudeRecord", async () => {
  const parsed = await parseSessionRecords(path.join(fixturesDir, "rich-record.jsonl"), fs);

  assert.deepEqual(parsed.records.map(($0) => ({
    contentBlockTypes: $0.content_blocks.map(($1) => $1.type),
    cwd: $0.cwd,
    gitBranch: $0.gitBranch,
    parentUuid: $0.parentUuid,
    role: $0.message?.role,
    sessionId: $0.sessionId,
    timestamp: $0.timestamp,
    toolUseResult: $0.toolUseResult,
    uuid: $0.uuid,
  })), [{
    contentBlockTypes: ["text", "tool_use", "tool_result"],
    cwd: "/tmp/work",
    gitBranch: "deep-nvidia",
    parentUuid: "parent-1",
    role: "assistant",
    sessionId: "session-1",
    timestamp: "2026-04-27T00:00:00.000Z",
    toolUseResult: { stdout: "ok" },
    uuid: "uuid-1",
  }]);
});
