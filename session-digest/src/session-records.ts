import type * as fs from "node:fs";

import { InputError } from "./inputs.js";

export type SessionRecordFs = Pick<typeof fs.promises, "readFile">;

export type ParsedRecord = {
  anchor: `record:${number}`;
  source_record: number;
  type?: string;
  uuid?: string;
  parentUuid?: string;
  sessionId?: string;
  timestamp?: string;
  cwd?: string;
  gitBranch?: string;
  message?: {
    role?: string;
    content?: unknown;
  };
  content_blocks: Array<Record<string, unknown>>;
  toolUseResult?: unknown;
  raw: Record<string, unknown>;
};

export type ParsedSession = {
  source: { path: string; bytes: number; records: number };
  parse: { skipped_records: number };
  records: ParsedRecord[];
};

export async function parseSessionRecords(inputPath: string, fsLike: SessionRecordFs): Promise<ParsedSession> {
  const contents = await fsLike.readFile(inputPath, "utf8");
  let parsedValues = 0;
  let sourceRecords = 0;
  let skippedRecords = 0;
  const records: ParsedRecord[] = [];
  const lines = contents.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.trim() === "") {
      continue;
    }

    sourceRecords += 1;

    try {
      const value = JSON.parse(line) as unknown;
      parsedValues += 1;

      if (!isRecord(value) || typeof value.type !== "string") {
        continue;
      }

      records.push(parsedRecord(value, index + 1));
    } catch {
      skippedRecords += 1;
    }
  }

  if (parsedValues === 0) {
    throw InputError.nonJsonl(inputPath);
  }

  if (records.length === 0) {
    throw InputError.noUsableMessages(inputPath);
  }

  return {
    source: { path: inputPath, bytes: Buffer.byteLength(contents), records: sourceRecords },
    parse: { skipped_records: skippedRecords },
    records,
  };
}

function parsedRecord(raw: Record<string, unknown>, sourceRecord: number): ParsedRecord {
  const message = isRecord(raw.message) ? raw.message : undefined;

  return {
    anchor: `record:${sourceRecord}`,
    source_record: sourceRecord,
    type: stringValue(raw.type),
    uuid: stringValue(raw.uuid),
    parentUuid: stringValue(raw.parentUuid),
    sessionId: stringValue(raw.sessionId),
    timestamp: stringValue(raw.timestamp),
    cwd: stringValue(raw.cwd),
    gitBranch: stringValue(raw.gitBranch),
    message: message ? {
      role: stringValue(message.role),
      content: message.content,
    } : undefined,
    content_blocks: contentBlocks(message?.content),
    toolUseResult: raw.toolUseResult,
    raw,
  };
}

function contentBlocks(content: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(content)) {
    return [];
  }

  return content.filter(isRecord);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
