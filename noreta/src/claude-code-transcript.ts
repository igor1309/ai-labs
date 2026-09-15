import { readFileSync } from "node:fs";

import { parsedRecord, transcriptFilesOf } from "./claude-code-files.js";
import type { TranscriptEntry, TranscriptSource } from "./transcript.js";

// Reads one session's transcript from the file Claude Code keeps for it, found
// by the session id alone.
export function claudeCodeTranscript(projectsDirectory: string): TranscriptSource {
  return (sessionId: string): TranscriptEntry[] =>
    transcriptFilesOf(projectsDirectory, sessionId).flatMap(entriesIn);
}

type TranscriptRecord = {
  type?: string;
  isMeta?: boolean;
  timestamp: string;
  message?: { content: string | ContentBlock[] };
  toolUseResult?: {
    type?: string;
    filePath?: string;
    content?: string;
    structuredPatch?: Hunk[];
  };
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
  return readFileSync(file, "utf8")
    .split("\n")
    .flatMap(parsedRecord<TranscriptRecord>)
    .flatMap(entriesOf);
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

  const hunks =
    result.type === "create" && result.content !== undefined
      ? [createdFileHunk(result.content)]
      : result.structuredPatch;

  return [
    {
      kind: "file-diff",
      at,
      path: result.filePath,
      diff: hunks.flatMap(unifiedDiffLines).join("\n"),
    },
  ];
}

// Creating a file records an empty patch and the whole content, so the change is
// every line of that content, added. The newline ending the last line does not
// start another.
function createdFileHunk(content: string): Hunk {
  const lines = content.replace(/\n$/, "").split("\n");

  return {
    oldStart: 0,
    oldLines: 0,
    newStart: 1,
    newLines: lines.length,
    lines: lines.map((line) => `+${line}`),
  };
}

function unifiedDiffLines(hunk: Hunk): string[] {
  return [
    `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    ...hunk.lines,
  ];
}
