import type { ParsedSession } from "./session-records.js";

export const COMPRESSOR_STRATEGY = "claude-jsonl-v1";
export const COMPRESSOR_VERSION = "1.0.0";
export const LEDGER_SCHEMA = "session-digest-ledger";
export const LEDGER_SCHEMA_VERSION = "1.0.0";
export const DEFAULT_MODEL_CONTEXT_MAX_BYTES = 250_000;

export class ModelContextBudgetError extends Error {
  constructor(bytes: number, maxBytes: number) {
    super(`model context budget exceeded: ${bytes} bytes > ${maxBytes} bytes`);
  }
}

export type CompileLedgerOptions = {
  maxModelContextBytes?: number;
};

export type LedgerEvent = {
  anchor: string;
  command?: string;
  file_path?: string;
  kind: string;
  key_lines?: string[];
  output_bytes?: number;
  related_anchor?: string;
  role?: string;
  source_record: number;
  status?: string;
  text?: string;
  tool?: string;
};

export type ModelContext = {
  bytes: number;
  sections: Array<{
    events: LedgerEvent[];
    title: string;
  }>;
};

export type Ledger = {
  schema: string;
  schema_version: string;
  compressor_strategy: string;
  compressor_version: string;
  source: ParsedSession["source"];
  parse: ParsedSession["parse"];
  events: LedgerEvent[];
  model_context: ModelContext;
};

export function compileLedger(parsedSession: ParsedSession, options: CompileLedgerOptions = {}): Ledger {
  const events = compileEvents(parsedSession);
  const modelContextWithBytes = measuredModelContext({ bytes: 0, sections: [{ title: "events", events }] });
  const maxModelContextBytes = options.maxModelContextBytes ?? DEFAULT_MODEL_CONTEXT_MAX_BYTES;

  if (modelContextWithBytes.bytes > maxModelContextBytes) {
    throw new ModelContextBudgetError(modelContextWithBytes.bytes, maxModelContextBytes);
  }

  return {
    schema: LEDGER_SCHEMA,
    schema_version: LEDGER_SCHEMA_VERSION,
    compressor_strategy: COMPRESSOR_STRATEGY,
    compressor_version: COMPRESSOR_VERSION,
    source: parsedSession.source,
    parse: parsedSession.parse,
    events,
    model_context: modelContextWithBytes,
  };
}

export function compressorVersionRules(): Record<"major" | "minor" | "patch", string> {
  return {
    major: "ledger schema changes",
    minor: "retained-event coverage or compaction-rule changes",
    patch: "behavior-preserving fixes",
  };
}

export function serializeModelContext(modelContext: ModelContext): string {
  return JSON.stringify(modelContext);
}

function measuredModelContext(modelContext: ModelContext): ModelContext {
  let measuredContext = modelContext;

  while (true) {
    const bytes = Buffer.byteLength(serializeModelContext(measuredContext));

    if (bytes === measuredContext.bytes) {
      return measuredContext;
    }

    measuredContext = { ...measuredContext, bytes };
  }
}

function compileEvents(parsedSession: ParsedSession): LedgerEvent[] {
  return parsedSession.records.flatMap((record) => {
    const events: LedgerEvent[] = [];
    const role = record.message?.role;

    if (typeof record.message?.content === "string" && record.message.content !== "") {
      events.push({
        anchor: record.anchor,
        kind: "message_text",
        role,
        source_record: record.source_record,
        text: record.message.content,
      });
    }

    for (let index = 0; index < record.content_blocks.length; index += 1) {
      events.push(...eventsForBlock(record, record.content_blocks[index], index + 1));
    }

    if (record.toolUseResult !== undefined) {
      events.push(...toolResultEvents({
        anchor: `${record.anchor}/toolUseResult`,
        sourceRecord: record.source_record,
        value: record.toolUseResult,
      }));
    }

    return events;
  });
}

function eventsForBlock(
  record: ParsedSession["records"][number],
  block: Record<string, unknown>,
  blockNumber: number,
): LedgerEvent[] {
  const anchor = `${record.anchor}/block:${blockNumber}`;

  if (block.type === "text" && typeof block.text === "string" && block.text !== "") {
    return [{
      anchor,
      kind: "message_text",
      role: record.message?.role,
      source_record: record.source_record,
      text: block.text,
    }];
  }

  if (block.type === "tool_use") {
    return toolCallEvents({ anchor, block, sourceRecord: record.source_record });
  }

  if (block.type === "tool_result") {
    return toolResultEvents({
      anchor,
      relatedAnchor: stringValue(block.tool_use_id),
      sourceRecord: record.source_record,
      value: block,
    });
  }

  return [];
}

function toolCallEvents(
  { anchor, block, sourceRecord }: { anchor: string; block: Record<string, unknown>; sourceRecord: number },
): LedgerEvent[] {
  const input = isRecord(block.input) ? block.input : {};
  const command = stringValue(input.command);
  const filePath = stringValue(input.file_path) ?? stringValue(input.path);
  const baseEvent: LedgerEvent = {
    anchor,
    command,
    file_path: filePath,
    kind: "tool_call",
    source_record: sourceRecord,
    tool: stringValue(block.name),
  };
  const events = [baseEvent];

  if (command) {
    events.push({
      anchor: `${anchor}/command`,
      command,
      kind: "command",
      source_record: sourceRecord,
    });
  }

  if (filePath) {
    events.push(fileReferenceEvent(`${anchor}/file:1`, sourceRecord, filePath));
  }

  return events;
}

function toolResultEvents(
  { anchor, relatedAnchor, sourceRecord, value }: {
    anchor: string;
    relatedAnchor?: string;
    sourceRecord: number;
    value: unknown;
  },
): LedgerEvent[] {
  const outputText = outputTextFromToolResult(value);
  const status = isFailedToolResult(value, outputText) ? "failed" : "ok";
  const events: LedgerEvent[] = [{
    anchor,
    key_lines: keyLines(outputText),
    kind: "tool_result",
    output_bytes: Buffer.byteLength(outputText),
    related_anchor: relatedAnchor,
    source_record: sourceRecord,
    status,
  }];

  if (status === "failed") {
    events.push({
      anchor: `${anchor}/error`,
      key_lines: keyLines(outputText),
      kind: "error",
      source_record: sourceRecord,
      status,
    });
  }

  events.push(...filePathsFromText(outputText).map((filePath, index) => fileReferenceEvent(
    `${anchor}/file:${index + 1}`,
    sourceRecord,
    filePath,
  )));

  return events;
}

function outputTextFromToolResult(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (!isRecord(value)) {
    return "";
  }

  if (typeof value.content === "string") {
    return value.content;
  }

  return ["stdout", "stderr", "text", "error"]
    .map(($0) => value[$0])
    .filter((item): item is string => typeof item === "string")
    .join("\n");
}

function isFailedToolResult(value: unknown, outputText: string): boolean {
  return (isRecord(value) && value.is_error === true) || /\b(error|failed|failure)\b/i.test(outputText);
}

function keyLines(outputText: string): string[] {
  return outputText.split(/\r?\n/)
    .map(($0) => $0.trim())
    .filter(($0) => $0 !== "")
    .slice(0, 5)
    .map(($0) => $0.slice(0, 200));
}

function filePathsFromText(outputText: string): string[] {
  const matches = outputText.match(/(?:\/[\w.-]+(?:\/[\w.-]+)+|[\w.-]+\/[\w./-]+)/g) ?? [];

  return [...new Set(matches)];
}

function fileReferenceEvent(anchor: string, sourceRecord: number, filePath: string): LedgerEvent {
  return {
    anchor,
    file_path: filePath,
    kind: "file_reference",
    source_record: sourceRecord,
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
