import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readTranscript } from "../src/transcript.js";
import { at } from "./time.js";
import { transcriptOf } from "./transcript-source.js";

describe("Feature: Read a session", () => {
  describe("Rule: Session history preserves conversational order", () => {
    it("Open an inactive session", () => {
      const source = transcriptOf("s1", [
        { kind: "message", at: at("10:02"), role: "agent", text: "second" },
        { kind: "message", at: at("10:01"), role: "user", text: "first" },
      ]);

      assert.deepEqual(readTranscript(source, "s1"), [
        { kind: "message", at: at("10:01"), role: "user", text: "first" },
        { kind: "message", at: at("10:02"), role: "agent", text: "second" },
      ]);
    });
  });

  describe("Rule: Agent activity has semantic presentation", () => {
    it("A transcript contains a tool call", () => {
      const source = transcriptOf("s1", [
        { kind: "message", at: at("10:01"), role: "user", text: "run the tests" },
        { kind: "tool-call", at: at("10:02"), name: "Bash" },
      ]);

      // A reader that surfaced only conversation would lose the tool call.
      assert.deepEqual(readTranscript(source, "s1"), [
        { kind: "message", at: at("10:01"), role: "user", text: "run the tests" },
        { kind: "tool-call", at: at("10:02"), name: "Bash" },
      ]);
    });

    it("A transcript contains a file diff", () => {
      const diff = "@@ -1 +1 @@\n-old\n+new\n";
      const source = transcriptOf("s1", [
        { kind: "message", at: at("10:01"), role: "user", text: "rename it" },
        { kind: "file-diff", at: at("10:02"), path: "src/app.ts", diff },
      ]);

      // The change stays a diff rather than being flattened into prose.
      assert.deepEqual(readTranscript(source, "s1"), [
        { kind: "message", at: at("10:01"), role: "user", text: "rename it" },
        { kind: "file-diff", at: at("10:02"), path: "src/app.ts", diff },
      ]);
    });
  });
});
