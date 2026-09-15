import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { TranscriptEntry, TranscriptSource } from "./transcript.js";

// Reads one session's transcript from the JSONL file Claude Code keeps for it,
// under the directory of whichever project the session ran in. That directory's
// name is a lossy encoding of the workspace path, so the file is found by the
// session id alone.
export function claudeCodeTranscript(projectsDirectory: string): TranscriptSource {
  return (sessionId: string): TranscriptEntry[] =>
    transcriptFilesOf(projectsDirectory, sessionId).flatMap(entriesIn);
}

type TranscriptRecord = {
  type?: string;
  isMeta?: boolean;
  timestamp: string;
  message?: { content: string | ContentBlock[] };
  toolUseResult?: { filePath?: string; structuredPatch?: Hunk[] };
};

type ContentBlock = { type: string; text?: string; name?: string };

type Hunk = {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
};

function entriesIn(file: string): TranscriptEntry[] {
  return readFileSync(file, "utf8").split("\n").flatMap(parsedRecord).flatMap(entriesOf);
}

// A running session is appended to while it is read, so its last line can be
// half written. One unreadable line is not a reason to lose the transcript.
function parsedRecord(line: string): TranscriptRecord[] {
  try {
    return [JSON.parse(line) as TranscriptRecord];
  } catch {
    return [];
  }
}

function entriesOf(record: TranscriptRecord): TranscriptEntry[] {
  const at = new Date(record.timestamp);

  return [...messageEntries(record, at), ...fileDiffEntries(record, at)];
}

function messageEntries(record: TranscriptRecord, at: Date): TranscriptEntry[] {
  // Claude Code marks what it writes into the user's turn on its own behalf as
  // `isMeta`; nobody said it.
  if (record.isMeta === true) {
    return [];
  }

  const role = record.type === "assistant" ? "agent" : "user";
  const content = record.message?.content ?? [];

  // Claude Code writes some user messages as a bare string; everything else is
  // a list of blocks.
  if (typeof content === "string") {
    return [{ kind: "message", at, role, text: content }];
  }

  return content.flatMap((block): TranscriptEntry[] => {
    if (block.type === "text" && block.text !== undefined) {
      return [{ kind: "message", at, role, text: block.text }];
    }

    if (block.type === "tool_use" && block.name !== undefined) {
      return [{ kind: "tool-call", at, name: block.name }];
    }

    // Thinking, and a tool's own result text, are not something anyone said.
    return [];
  });
}

// An edit's result carries the change as hunks rather than as diff text.
function fileDiffEntries(record: TranscriptRecord, at: Date): TranscriptEntry[] {
  const result = record.toolUseResult;

  if (result?.filePath === undefined || result.structuredPatch === undefined) {
    return [];
  }

  return [
    {
      kind: "file-diff",
      at,
      path: result.filePath,
      diff: result.structuredPatch.flatMap(unifiedDiffLines).join("\n"),
    },
  ];
}

function unifiedDiffLines(hunk: Hunk): string[] {
  return [
    `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    ...hunk.lines,
  ];
}

function transcriptFilesOf(projectsDirectory: string, sessionId: string): string[] {
  return readdirSync(projectsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((project) => join(projectsDirectory, project.name, `${sessionId}.jsonl`))
    .filter((file) => existsSync(file));
}
