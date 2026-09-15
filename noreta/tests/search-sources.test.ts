import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { searchSessions } from "../src/search.js";
import type { TranscriptEntry, TranscriptSource } from "../src/transcript.js";
import { sourceOf } from "./session-source.js";
import { at } from "./time.js";

// Not QA scenarios: what search asks of the transcript source. A session whose
// context matches must stay findable when its transcript cannot be read — this
// product expects that, since worktrees get deleted underneath sessions.
describe("What search reads", () => {
  it("leaves the transcript source alone when the context already matches", () => {
    let reads = 0;
    const transcripts: TranscriptSource = (): TranscriptEntry[] => {
      reads += 1;

      return [];
    };

    const found = searchSessions(onlyByAgent, transcripts, "codex");

    assert.deepEqual(found.matches.map((session) => session.id), ["by-agent"]);
    assert.equal(reads, 0, "a context match should not need the transcript");
  });

  it("finds a session by context even when its transcript cannot be read", () => {
    const unreadable: TranscriptSource = () => {
      throw new Error("transcript unreadable");
    };

    assert.deepEqual(
      searchSessions(onlyByAgent, unreadable, "codex").matches.map((session) => session.id),
      ["by-agent"],
    );
  });

  it("reads the transcript only for sessions the context did not match", () => {
    const asked: string[] = [];
    const transcripts: TranscriptSource = (sessionId): TranscriptEntry[] => {
      asked.push(sessionId);

      return [{ kind: "message", at: at("10:01"), role: "user", text: "nothing here" }];
    };

    searchSessions(withContext, transcripts, "ai-labs");

    assert.deepEqual(asked, ["by-agent"]);
  });

  it("matches every session on an empty query", () => {
    assert.deepEqual(
      searchSessions(withContext, () => [], "").matches.map((session) => session.id),
      ["by-agent", "by-repository"],
    );
  });
});

const withContext = sourceOf(
  { id: "by-agent", agent: "codex", repository: "unrelated", lastActivityAt: at("10:00") },
  { id: "by-repository", agent: "claude", repository: "ai-labs", lastActivityAt: at("09:00") },
);

const onlyByAgent = sourceOf({
  id: "by-agent",
  agent: "codex",
  repository: "unrelated",
  lastActivityAt: at("10:00"),
});
