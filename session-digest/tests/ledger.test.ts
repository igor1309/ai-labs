import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPRESSOR_STRATEGY,
  COMPRESSOR_VERSION,
  compileLedger,
  compressorVersionRules,
  LEDGER_SCHEMA,
  LEDGER_SCHEMA_VERSION,
  serializeModelContext,
} from "../src/ledger.js";
import type { ParsedRecord, ParsedSession } from "../src/session-records.js";

test("test_compileLedger_shouldEmitMetadata_onParsedSession", () => {
  const ledger = compileLedger(parsedSession([userRecord(1, "hello")]));

  assert.deepEqual({
    compressor_strategy: ledger.compressor_strategy,
    compressor_version: ledger.compressor_version,
    parse: ledger.parse,
    schema: ledger.schema,
    schema_version: ledger.schema_version,
    source: ledger.source,
  }, {
    compressor_strategy: COMPRESSOR_STRATEGY,
    compressor_version: COMPRESSOR_VERSION,
    parse: { skipped_records: 1 },
    schema: LEDGER_SCHEMA,
    schema_version: LEDGER_SCHEMA_VERSION,
    source: { path: "/tmp/session.jsonl", bytes: 123, records: 2 },
  });
});

test("test_compileLedger_shouldEmitAnchoredEvents_onMessageRecords", () => {
  const ledger = compileLedger(parsedSession([userRecord(3, "hello")]));

  assert.deepEqual(ledger.events.map(($0) => ({
    anchor: $0.anchor,
    kind: $0.kind,
    source_record: $0.source_record,
  })), [{
    anchor: "record:3",
    kind: "message_text",
    source_record: 3,
  }]);
});

test("test_compileLedger_shouldCoverMessageToolAndTopLevelToolEvents_onRichRecords", () => {
  const ledger = compileLedger(parsedSession([
    userRecord(1, "run tests"),
    assistantRecord(2, [
      { type: "text", text: "I will run tests." },
      { type: "tool_use", id: "tool-1", name: "Bash", input: { command: "npm test" } },
      { type: "tool_result", tool_use_id: "tool-1", content: "tests ok" },
    ]),
    topLevelToolResultRecord(3, { stdout: "created /tmp/result.txt" }),
  ]));

  assert.deepEqual(ledger.events.map(($0) => $0.kind), [
    "message_text",
    "message_text",
    "tool_call",
    "command",
    "tool_result",
    "tool_result",
    "file_reference",
  ]);
});

test("test_compileLedger_shouldUseBlockSubAnchors_onContentBlockEvents", () => {
  const ledger = compileLedger(parsedSession([
    assistantRecord(4, [{ type: "text", text: "block text" }]),
  ]));

  assert.deepEqual(ledger.events.map(($0) => $0.anchor), ["record:4/block:1"]);
});

test("test_compileLedger_shouldCompactBulkyToolOutput_onModelContext", () => {
  const bulkyOutput = Array.from({ length: 30 }, (_, index) => `line ${index}`).join("\n");
  const ledger = compileLedger(parsedSession([
    assistantRecord(5, [{ type: "tool_result", tool_use_id: "tool-1", content: bulkyOutput }]),
  ]));
  const toolResult = ledger.events.find(($0) => $0.kind === "tool_result");

  assert.deepEqual({
    key_lines: toolResult?.key_lines,
    modelContextContainsFullOutput: JSON.stringify(ledger.model_context).includes(bulkyOutput),
    output_bytes: toolResult?.output_bytes,
  }, {
    key_lines: ["line 0", "line 1", "line 2", "line 3", "line 4"],
    modelContextContainsFullOutput: false,
    output_bytes: Buffer.byteLength(bulkyOutput),
  });
});

test("test_compileLedger_shouldEmitFileErrorAndCommandFacts_onObservableToolData", () => {
  const ledger = compileLedger(parsedSession([
    assistantRecord(6, [
      { type: "tool_use", id: "tool-1", name: "Bash", input: { command: "npm test", file_path: "src/app.ts" } },
      { type: "tool_result", tool_use_id: "tool-1", is_error: true, content: "Error: tests failed in src/app.ts" },
    ]),
  ]));

  assert.deepEqual(ledger.events.map(($0) => [$0.kind, $0.command, $0.file_path, $0.status]), [
    ["tool_call", "npm test", "src/app.ts", undefined],
    ["command", "npm test", undefined, undefined],
    ["file_reference", undefined, "src/app.ts", undefined],
    ["tool_result", undefined, undefined, "failed"],
    ["error", undefined, undefined, "failed"],
    ["file_reference", undefined, "src/app.ts", undefined],
  ]);
});

test("test_compileLedger_shouldRetainSkillAndToolCallIds_onSkillToolCalls", () => {
  const ledger = compileLedger(parsedSession([
    assistantRecord(7, [
      { type: "tool_use", id: "tool-1", name: "Skill", input: { skill: "dev-skills:cold-start-checkpoint" } },
      { type: "tool_result", tool_use_id: "tool-1", content: "Launching skill: dev-skills:cold-start-checkpoint" },
    ]),
  ]));

  assert.deepEqual(ledger.events.map(($0) => ({
    kind: $0.kind,
    related_tool_call_id: $0.related_tool_call_id,
    skill: $0.skill,
    tool: $0.tool,
    tool_call_id: $0.tool_call_id,
  })), [
    {
      kind: "tool_call",
      related_tool_call_id: undefined,
      skill: "dev-skills:cold-start-checkpoint",
      tool: "Skill",
      tool_call_id: "tool-1",
    },
    {
      kind: "tool_result",
      related_tool_call_id: "tool-1",
      skill: undefined,
      tool: undefined,
      tool_call_id: undefined,
    },
  ]);
});

test("test_compressorVersionRules_shouldNameSpecVersionBumpRules", () => {
  assert.deepEqual(compressorVersionRules(), {
    major: "ledger schema changes",
    minor: "retained-event coverage or compaction-rule changes",
    patch: "behavior-preserving fixes",
  });
});

test("test_compileLedger_shouldMeasureSerializedModelContextBytes", () => {
  const ledger = compileLedger(parsedSession([userRecord(1, "hello")]));

  assert.equal(ledger.model_context.bytes, Buffer.byteLength(serializeModelContext(ledger.model_context)));
});

test("test_compileLedger_shouldThrowBeforeReturningContext_onModelContextBudgetExceeded", () => {
  assert.throws(
    () => compileLedger(parsedSession(manyUserRecords()), { maxModelContextBytes: 400 }),
    /model context budget exceeded/,
  );
});

test("test_compileLedger_shouldNotReturnSilentlyTruncatedContext_onModelContextBudgetExceeded", () => {
  const parsed = parsedSession(manyUserRecords());

  assert.throws(
    () => compileLedger(parsed, { maxModelContextBytes: 400 }),
    (error: unknown) => error instanceof Error && !("model_context" in error),
  );
});

function parsedSession(records: ParsedRecord[]): ParsedSession {
  return {
    source: { path: "/tmp/session.jsonl", bytes: 123, records: 2 },
    parse: { skipped_records: 1 },
    records,
  };
}

function userRecord(sourceRecord: number, text: string): ParsedRecord {
  return record(sourceRecord, {
    message: { role: "user", content: text },
    type: "user",
  });
}

function manyUserRecords(): ParsedRecord[] {
  return Array.from({ length: 30 }, (_, index) => userRecord(index + 1, `message ${index} `.repeat(20)));
}

function assistantRecord(sourceRecord: number, content: unknown): ParsedRecord {
  return record(sourceRecord, {
    message: { role: "assistant", content },
    type: "assistant",
  });
}

function topLevelToolResultRecord(sourceRecord: number, toolUseResult: unknown): ParsedRecord {
  return record(sourceRecord, {
    toolUseResult,
    type: "assistant",
  });
}

function record(sourceRecord: number, raw: Record<string, unknown>): ParsedRecord {
  const message = isRecord(raw.message) ? raw.message : undefined;

  return {
    anchor: `record:${sourceRecord}`,
    content_blocks: Array.isArray(message?.content) ? message.content.filter(isRecord) : [],
    message: message ? { content: message.content, role: typeof message.role === "string" ? message.role : undefined } : undefined,
    raw,
    source_record: sourceRecord,
    toolUseResult: raw.toolUseResult,
    type: typeof raw.type === "string" ? raw.type : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
