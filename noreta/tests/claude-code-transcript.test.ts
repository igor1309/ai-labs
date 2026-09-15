import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { claudeCodeTranscript } from "../src/claude-code-transcript.js";
import {
  appendPartialRecord,
  projectsDirectoryOf,
  type TranscriptRecord,
  writeProject,
} from "./claude-code-projects.js";
import { at } from "./time.js";
import { describeEntry } from "./transcript-source.js";

// Not QA scenarios: what the Claude Code transcript adapter makes of a
// transcript file.
describe("What the Claude Code transcript adapter reads", () => {
  it("reads a user message written as plain text", () => {
    const projects = projectsDirectoryOf({
      id: "s1",
      records: [
        {
          type: "user",
          message: { role: "user", content: "rank the sessions" },
          timestamp: at("10:01").toISOString(),
        },
      ],
    });

    assert.deepEqual(claudeCodeTranscript(projects)("s1"), [
      { kind: "message", at: at("10:01"), role: "user", text: "rank the sessions" },
    ]);
  });

  it("reads the text blocks of an agent message and skips its thinking", () => {
    const projects = projectsDirectoryOf({
      id: "s1",
      records: [
        {
          type: "assistant",
          message: {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "which order?" },
              { type: "text", text: "ranked by activity" },
            ],
          },
          timestamp: at("10:02").toISOString(),
        },
      ],
    });

    assert.deepEqual(claudeCodeTranscript(projects)("s1"), [
      { kind: "message", at: at("10:02"), role: "agent", text: "ranked by activity" },
    ]);
  });

  it("reads a tool call by the name of the tool", () => {
    const projects = projectsDirectoryOf({
      id: "s1",
      records: [
        {
          type: "assistant",
          message: {
            role: "assistant",
            content: [
              { type: "tool_use", id: "toolu_1", name: "Read", input: { file_path: "/a" } },
            ],
          },
          timestamp: at("10:03").toISOString(),
        },
      ],
    });

    assert.deepEqual(claudeCodeTranscript(projects)("s1"), [
      { kind: "tool-call", at: at("10:03"), name: "Read" },
    ]);
  });

  // The record carrying the diff also carries the tool's own result text, which
  // is output rather than something anyone said.
  it("reads a file edit as its hunks, each under a unified diff header", () => {
    const projects = projectsDirectoryOf({
      id: "s1",
      records: [
        {
          type: "user",
          message: {
            role: "user",
            content: [
              { type: "tool_result", tool_use_id: "toolu_1", content: "The file has been updated." },
            ],
          },
          toolUseResult: {
            filePath: "/nowhere/a.ts",
            structuredPatch: [
              { oldStart: 1, oldLines: 2, newStart: 1, newLines: 2, lines: [" a", "-b", "+c"] },
              { oldStart: 9, oldLines: 1, newStart: 9, newLines: 2, lines: [" x", "+y"] },
            ],
          },
          timestamp: at("10:04").toISOString(),
        },
      ],
    });

    assert.deepEqual(claudeCodeTranscript(projects)("s1"), [
      {
        kind: "file-diff",
        at: at("10:04"),
        path: "/nowhere/a.ts",
        diff: "@@ -1,2 +1,2 @@\n a\n-b\n+c\n@@ -9,1 +9,2 @@\n x\n+y",
      },
    ]);
  });

  // Writing a new file records its whole content and an empty patch, so the
  // change is the file itself, every line added.
  it("reads a created file as a diff adding every line", () => {
    const projects = projectsDirectoryOf({
      id: "s1",
      records: [
        {
          type: "user",
          toolUseResult: {
            type: "create",
            filePath: "/nowhere/new.ts",
            content: "a\nb\n",
            structuredPatch: [],
          },
          timestamp: at("10:05").toISOString(),
        },
      ],
    });

    assert.deepEqual(claudeCodeTranscript(projects)("s1"), [
      {
        kind: "file-diff",
        at: at("10:05"),
        path: "/nowhere/new.ts",
        diff: "@@ -0,0 +1,2 @@\n+a\n+b",
      },
    ]);
  });

  it("skips records that are not conversation", () => {
    const projects = projectsDirectoryOf({
      id: "s1",
      records: [
        { type: "mode", mode: "normal", sessionId: "s1" },
        { type: "system", subtype: "turn_duration", timestamp: at("10:00").toISOString() },
        { type: "ai-title", aiTitle: "Rank sessions", sessionId: "s1" },
        plainTextMessage("rank the sessions", at("10:01")),
      ],
    });

    assert.deepEqual(claudeCodeTranscript(projects)("s1").map(describeEntry), [
      "rank the sessions",
    ]);
  });

  it("reads a transcript whose last line is still being written", () => {
    const projects = projectsDirectoryOf({
      id: "busy",
      records: [plainTextMessage("rank the sessions", at("10:01"))],
    });

    appendPartialRecord(projects, "busy");

    assert.deepEqual(claudeCodeTranscript(projects)("busy").map(describeEntry), [
      "rank the sessions",
    ]);
  });

  it("finds a transcript in whichever project directory holds it", () => {
    const projects = projectsDirectoryOf();

    writeProject(projects, "-another-project", {
      id: "elsewhere",
      records: [plainTextMessage("rank the sessions", at("10:01"))],
    });

    assert.deepEqual(claudeCodeTranscript(projects)("elsewhere").map(describeEntry), [
      "rank the sessions",
    ]);
  });

  // Claude Code keeps a transcript apart from the workspace it records, so
  // deleting that workspace leaves the transcript to read.
  it("reads the transcript of a session whose workspace is gone", () => {
    const projects = projectsDirectoryOf({
      id: "s1",
      records: [
        { ...plainTextMessage("what did we decide", at("10:01")), cwd: "/nowhere/deleted-worktree" },
      ],
    });

    assert.deepEqual(claudeCodeTranscript(projects)("s1").map(describeEntry), [
      "what did we decide",
    ]);
  });

  // Claude Code marks what it writes into the user's turn on its own behalf —
  // the caveat it prepends to a local command's output — as `isMeta`.
  it("skips what Claude Code wrote into the user's turn itself", () => {
    const projects = projectsDirectoryOf({
      id: "s1",
      records: [
        {
          ...plainTextMessage("<local-command-caveat>Caveat: generated</local-command-caveat>", at("10:00")),
          isMeta: true,
        },
        plainTextMessage("rank the sessions", at("10:01")),
      ],
    });

    assert.deepEqual(claudeCodeTranscript(projects)("s1").map(describeEntry), [
      "rank the sessions",
    ]);
  });

  it("reads an unknown session as an empty transcript", () => {
    const projects = projectsDirectoryOf({
      id: "known",
      records: [plainTextMessage("rank the sessions", at("10:01"))],
    });

    assert.deepEqual(claudeCodeTranscript(projects)("unknown"), []);
  });
});

function plainTextMessage(text: string, time: Date): TranscriptRecord {
  return { type: "user", message: { role: "user", content: text }, timestamp: time.toISOString() };
}
