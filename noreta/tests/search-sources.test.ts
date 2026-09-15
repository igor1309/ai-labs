import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { searchSessions } from "../src/search.js";
import { recentSessions, viewSessions } from "../src/sessions.js";
import type { TranscriptEntry, TranscriptSource } from "../src/transcript.js";
import { sourceOf } from "./session-source.js";
import { at } from "./time.js";
import { filesystemError } from "./transcript-source.js";

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
      throw filesystemError("ENOENT");
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

  // One test per code: a list that lost one of them would still pass a test
  // that only ever throws the code it kept.
  for (const code of ["ENOENT", "EACCES", "EISDIR"]) {
    it(`reports a session as unreadable when its transcript fails with ${code}`, () => {
      const unreachable: TranscriptSource = () => {
        throw filesystemError(code);
      };

      const found = searchSessions(withContext, unreachable, "rate limiter");

      assert.deepEqual(found.matches, []);
      assert.deepEqual(found.unreadable, ["by-agent", "by-repository"]);
    });
  }

  // A defect in how a transcript is read looks nothing like a missing file, and
  // counting it as an unreadable session would bury it behind a name in a list.
  it("lets an error that is not a filesystem failure through", () => {
    const broken: TranscriptSource = () => {
      throw new TypeError("entry.text is not a string");
    };

    assert.throws(() => searchSessions(withContext, broken, "rate limiter"), TypeError);
  });

  // The list is the caller's. Searching a group, or the recent list, means the
  // sessions that list left out are not found — search cannot go back to the
  // source for them.
  it("searches only the sessions it is given", () => {
    const sessions = viewSessions(
      sourceOf(
        { id: "recent", agent: "codex", lastActivityAt: at("10:00") },
        { id: "long-ago", agent: "codex", lastActivityAt: longAgo },
      ),
    );
    const recent = recentSessions(sessions, { now: at("10:00"), withinDays: 7 });

    assert.deepEqual(
      searchSessions(recent, () => [], "codex").matches.map((session) => session.id),
      ["recent"],
    );
  });

  it("matches every session on an empty query", () => {
    assert.deepEqual(
      searchSessions(withContext, () => [], "").matches.map((session) => session.id),
      ["by-agent", "by-repository"],
    );
  });
});

// Far enough before the notional day that a week's cutoff holds it back.
const longAgo = new Date("2026-01-01T00:00:00Z");

const withContext = viewSessions(
  sourceOf(
    { id: "by-agent", agent: "codex", repository: "unrelated", lastActivityAt: at("10:00") },
    { id: "by-repository", agent: "claude", repository: "ai-labs", lastActivityAt: at("09:00") },
  ),
);

const onlyByAgent = viewSessions(
  sourceOf({
    id: "by-agent",
    agent: "codex",
    repository: "unrelated",
    lastActivityAt: at("10:00"),
  }),
);
